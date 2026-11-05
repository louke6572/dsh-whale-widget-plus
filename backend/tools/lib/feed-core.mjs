/**
 * 选题器的纯逻辑层（无网络 / 无文件 / 可单测）。
 *
 * 为什么从 feed.mjs 里拆出来（2026-10-23）：
 *   旧 feed.mjs 把所有逻辑塞在顶层 await 里，浏览器和单测都够不着；
 *   而这一轮要修的三个问题都出在「逻辑」而不是「请求」上：
 *     ① 选题只排除日记里出现过的 BV → 看过但没写进日记的视频会反复推给她；
 *     ② 偏好按 `slice(0, 6)` 截断、命中按「数组里同一词的每个变体」分别加分
 *        → DeepSeek / Deepseek / deepseek 叠成 3 倍，后面 6 个偏好根本没被搜过；
 *     ③ 没有权重、只按总分取前 N 条 → 谁的关键词更泛（比如 AI）谁霸榜。
 *   现在：偏好清洗、权重、配额、去重、轮换搜索全部是纯函数，feed.mjs 只负责取数。
 */

export const DEFAULT_WEIGHT = 1;
export const MAX_WEIGHT = 5;
export const MIN_WEIGHT = 0;
const EXTRA_DEFAULT_WEIGHT = 0.75;
const SEPARATORS = /[\s·,，、/|+]+/;

/** 数字兜底：B 站接口偶尔给 "NaN"/null，旧代码会把整个候选的分数算成 NaN。 */
export function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function clampWeight(value, fallback = DEFAULT_WEIGHT) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.round(Math.min(MAX_WEIGHT, Math.max(MIN_WEIGHT, n)) * 100) / 100;
}

/** 把「DSH/AI 工具与插件」拆成整词 + 子词，用于标题匹配（全部小写）。 */
export function splitTokens(label) {
  const raw = String(label ?? '').replace(/\s+/g, ' ').trim();
  if (!raw) return [];
  const out = new Set();
  const add = (value) => {
    const token = String(value ?? '').trim().toLowerCase();
    if (token.length >= 2) out.add(token);
  };
  add(raw);
  for (const part of raw.split(SEPARATORS)) add(part);
  return [...out];
}

/** 权重表按大小写不敏感查；旧配置里没有 weights 时回落到默认值。 */
function weightLookup(weights) {
  const map = new Map();
  if (!weights || typeof weights !== 'object' || Array.isArray(weights)) return map;
  for (const [key, value] of Object.entries(weights)) {
    const k = String(key ?? '').trim().toLowerCase();
    if (!k) continue;
    map.set(k, clampWeight(value));
  }
  return map;
}

/**
 * 把配置里的 like / keywords / weights 收敛成可计算的偏好表。
 *
 * 规则：
 *   · 大小写不敏感的重复项合并（DeepSeek / Deepseek / deepseek 只算一个）；
 *   · `keywords`（设置页「额外关键词」）默认 0.75，避免只因为是补充词就压过主偏好；
 *   · 权重 0 = 停用（不搜、不计分，但仍保留在列表里，用户改回 1 就恢复）；
 *   · 排序保持用户填写顺序，配额阶段再按权重排。
 */
export function normalizePreferences({ like = [], keywords = [], weights = {} } = {}) {
  const lookup = weightLookup(weights);
  const byKey = new Map();
  const push = (raw, kind) => {
    const label = String(raw ?? '').replace(/\s+/g, ' ').trim();
    if (!label) return;
    const key = label.toLowerCase();
    const existing = byKey.get(key);
    if (existing) {
      // 同一关键词出现在两个列表：以「爱看」为准，权重取更高的一边。
      if (kind === 'like' && existing.kind !== 'like') existing.kind = 'like';
      existing.weight = Math.max(existing.weight, weightFor(label, lookup, kind));
      existing.tokens = splitTokens(label);
      return;
    }
    byKey.set(key, {
      key,
      label: label.slice(0, 60),
      kind,
      weight: weightFor(label, lookup, kind),
      tokens: splitTokens(label),
    });
  };
  for (const item of Array.isArray(like) ? like : []) push(item, 'like');
  for (const item of Array.isArray(keywords) ? keywords : []) push(item, 'extra');
  const entries = [...byKey.values()];
  return {
    entries,
    enabled: entries.filter((e) => e.weight > 0),
    disabled: entries.filter((e) => e.weight <= 0),
  };
}

function weightFor(label, lookup, kind) {
  const hit = lookup.get(String(label).trim().toLowerCase());
  if (hit != null) return hit;
  return kind === 'extra' ? EXTRA_DEFAULT_WEIGHT : DEFAULT_WEIGHT;
}

/**
 * 拉丁短词必须按词边界匹配：旧写法直接 includes，`AI` 会命中 `said / email / trailer`，
 * 结果「AI」这个泛词把大量无关视频也算成命中。
 */
function latinTokenHit(text, token) {
  let index = text.indexOf(token);
  while (index >= 0) {
    const before = index > 0 ? text[index - 1] : '';
    const after = text[index + token.length] ?? '';
    if (!/[a-z0-9]/.test(before) && !/[a-z0-9]/.test(after)) return true;
    index = text.indexOf(token, index + 1);
  }
  return false;
}

/** 标题命中了哪些偏好（每条偏好只算一次，不会因为词在标题里出现多次而叠分）。 */
export function preferenceHits(title, entries) {
  const text = String(title ?? '').toLowerCase();
  if (!text) return [];
  return entries.filter((entry) => entry.weight > 0 && entry.tokens.some((token) => (
    /^[a-z0-9+#._-]+$/.test(token) ? latinTokenHit(text, token) : text.includes(token)
  )));
}

/** 候选分数：弹幕密度 ×3 + 偏好命中（4 × 权重）+ 反馈学习。播放量仍然不参与。 */
export function candidateScore(candidate, hits = [], learnedBoost = 0) {
  const danmaku = safeNumber(candidate?.dm);
  const duration = safeNumber(candidate?.d, 0);
  const density = Math.log10(1 + danmaku / Math.max(30, duration || 30));
  const prefScore = hits.reduce((sum, hit) => sum + 4 * safeNumber(hit.weight, DEFAULT_WEIGHT), 0);
  return density * 3 + prefScore + safeNumber(learnedBoost);
}

/**
 * 按权重分配名额（最大余数法 + 每条偏好下限/上限）。
 *
 * 例：6 条、4 个等权偏好 → 2/2/1/1；权重 3:1 → 4/2；
 * 权重 0 的偏好在调用前已被过滤；候选不够的偏好会在 selectDiverse 里让出名额。
 */
export function allocateQuotas(entries, counts, total, { perPref = 2, minPerPref = 1, seed = 0 } = {}) {
  const quotas = new Map();
  const n = Math.max(0, Math.floor(safeNumber(total)));
  const cap = Math.max(1, Math.floor(safeNumber(perPref, 2)));
  const floor = Math.max(1, Math.floor(safeNumber(minPerPref, 1)));
  if (!n) return quotas;
  const usable = (entries ?? []).filter((entry) => entry.weight > 0 && safeNumber(counts?.get?.(entry.key), 0) > 0);
  if (!usable.length) return quotas;
  // 只有一条偏好有候选时，perPref 不该削自己的量（没有「公平」问题，是候选不够看）。
  const effectiveCap = usable.length <= 1 ? n : cap;
  // 名额比偏好还少：按权重做「不放回加权抽样」（Efraimidis–Spirakis），
  // 而不是永远取权重最高的前几个 —— 否则 12 个等权偏好永远只有前 6 个能被搜到。
  if (n < usable.length) {
    const ranked = usable
      .map((entry) => {
        const unit = (hashString(`${seed}|${entry.key}`) + 1) / 4294967297;
        return { entry, key: Math.pow(unit, 1 / Math.max(0.01, entry.weight)) };
      })
      .sort((a, b) => b.key - a.key || a.entry.key.localeCompare(b.entry.key))
      .slice(0, n);
    for (const item of ranked) quotas.set(item.entry.key, 1);
    return quotas;
  }

  // ① 先按权重算出「理想额度」并向下取整，再封顶。
  const sumW = usable.reduce((sum, entry) => sum + entry.weight, 0);
  const ideals = new Map();
  for (const entry of usable) {
    const exact = (n * entry.weight) / sumW;
    ideals.set(entry.key, exact);
    quotas.set(entry.key, Math.min(effectiveCap, Math.floor(exact)));
  }
  let left = n - [...quotas.values()].reduce((sum, value) => sum + value, 0);

  // ② 保底：每条可用偏好至少 floor 条。从额度最多的偏好那里匀，
  //    这样 3:1 的权重仍是 3:1（旧写法「先各给 1 再按比例分」会变成 2:2）。
  if (floor > 0) {
    for (const entry of usable) {
      while ((quotas.get(entry.key) ?? 0) < floor) {
        quotas.set(entry.key, (quotas.get(entry.key) ?? 0) + 1);
        left -= 1;
      }
    }
    while (left < 0) {
      const donor = [...usable]
        .filter((entry) => (quotas.get(entry.key) ?? 0) > floor)
        .sort((a, b) => (quotas.get(b.key) ?? 0) - (quotas.get(a.key) ?? 0))[0];
      if (!donor) break;
      quotas.set(donor.key, quotas.get(donor.key) - 1);
      left += 1;
    }
  }

  // ③ 余数名额：按「离理想额度还差多少」从大到小补，仍不超过上限。
  //    只看小数部分会让同一条偏好连吃两个名额（等权 4 词会变成 3/1/1/1）；
  //    看 deficit = 理想值 - 当前额度 才能真正 2/2/1/1。
  //    等权时 deficit 完全一样 → 加一点点「按种子的抖动」，让多出来的名额跨天轮换。
  while (left > 0) {
    const open = usable
      .filter((entry) => (quotas.get(entry.key) ?? 0) < effectiveCap)
      .map((entry) => {
        const exact = ideals.get(entry.key) ?? 0;
        const deficit = exact - (quotas.get(entry.key) ?? 0);
        const jitter = (hashString(`${seed}|${entry.key}`) / 4294967296) * 1e-6;
        return { entry, deficit, jitter };
      })
      .sort((a, b) => b.deficit - a.deficit || b.jitter - a.jitter || a.entry.key.localeCompare(b.entry.key));
    if (!open.length) break;
    const target = open[0].entry.key;
    quotas.set(target, quotas.get(target) + 1);
    left -= 1;
  }
  // ④ 还有富余（上限卡住）就交给 selectDiverse 的补位逻辑，不硬塞给同一偏好。
  return quotas;
}

function compareCandidates(a, b) {
  return safeNumber(b._score) - safeNumber(a._score)
    || String(a.bv ?? '').localeCompare(String(b.bv ?? ''));
}

/**
 * 按配额挑出最终 N 条，并在偏好之间轮转输出（A/B/C/D/A/B…），
 * 防止「权重第一的偏好把前几条全占满」。
 *
 * @param {Array} candidates 已经算好 `_hits` / `_score` 的候选
 * @param {Array} entries normalizePreferences().enabled
 * @param {{n?:number, perPref?:number, generic?:number}} opts
 * @returns {{picked:Array, quotas:Map, counts:Map, shortfall:Array}}
 */
export function selectDiverse(candidates, entries, { n = 6, perPref = 2, generic = 1, seed = 0 } = {}) {
  const total = Math.max(0, Math.floor(safeNumber(n, 6)));
  const genericCap = Math.max(0, Math.floor(safeNumber(generic, 1)));
  const deduped = [];
  const seenBv = new Set();
  const seenKey = new Set();
  for (const item of [...(candidates ?? [])].sort(compareCandidates)) {
    if (!item) continue;
    const bv = String(item.bv ?? '').trim();
    if (bv) {
      if (seenBv.has(bv)) continue;
      seenBv.add(bv);
    }
    // 没有 BV 的候选（理论上有）按标题去重，避免同一视频重复出现。
    const fallbackKey = `${String(item.t ?? '').toLowerCase()}|${String(item.up ?? '')}`;
    if (!bv) {
      if (seenKey.has(fallbackKey)) continue;
      seenKey.add(fallbackKey);
    }
    deduped.push(item);
  }

  const byKey = new Map();
  const unkeyed = [];
  for (const item of deduped) {
    const hits = Array.isArray(item._hits) ? item._hits.filter((hit) => safeNumber(hit?.weight) > 0) : [];
    let primary = null;
    for (const hit of hits) {
      if (!primary || hit.weight > primary.weight) primary = hit;
    }
    item._primary = primary?.key ?? null;
    if (primary) {
      if (!byKey.has(primary.key)) byKey.set(primary.key, []);
      byKey.get(primary.key).push(item);
    } else {
      unkeyed.push(item);
    }
  }

  const counts = new Map([...byKey.entries()].map(([key, list]) => [key, list.length]));
  // 只有一条偏好有候选时，perPref 不该削自己的量（没有公平问题，是候选不够看）。
  const cap = byKey.size <= 1 ? Math.max(1, total) : Math.max(1, Math.floor(safeNumber(perPref, 2)));
  const quotas = allocateQuotas(entries, counts, total, { perPref: cap, seed });
  const order = (entries ?? [])
    .filter((entry) => (quotas.get(entry.key) ?? 0) > 0)
    .sort((a, b) => b.weight - a.weight || a.key.localeCompare(b.key));

  const picked = [];
  const pickedBv = new Set();
  const take = (item, via) => {
    if (!item) return false;
    if (item.bv && pickedBv.has(item.bv)) return false;
    if (item.bv) pickedBv.add(item.bv);
    picked.push({ ...item, _via: via });
    return true;
  };

  // ① 轮转：第 0 轮每条偏好各拿 1 条，第 1 轮再各拿 1 条……
  for (let round = 0; picked.length < total; round += 1) {
    let added = false;
    for (const entry of order) {
      if (picked.length >= total) break;
      const quota = quotas.get(entry.key) ?? 0;
      if (round >= quota) continue;
      const list = byKey.get(entry.key) ?? [];
      if (take(list[round], entry.key)) added = true;
    }
    if (!added) break;
  }

  // ② 某条偏好候选不够 → 名额让给其他命中偏好的候选（但仍尊重 perPref 上限，
  //    否则权重 10:1 的那条会靠补位把 6 条全吃掉）。
  if (picked.length < total) {
    const usedByKey = new Map();
    for (const item of picked) {
      if (item._primary) usedByKey.set(item._primary, (usedByKey.get(item._primary) ?? 0) + 1);
    }
    for (const item of deduped) {
      if (picked.length >= total) break;
      if (!item._primary) continue;
      if ((usedByKey.get(item._primary) ?? 0) >= cap) continue;
      if (take(item, item._primary)) usedByKey.set(item._primary, (usedByKey.get(item._primary) ?? 0) + 1);
    }
  }

  // ③ 还没凑够才用「无偏好命中」的候选补，最多 generic 条（防凑数）。
  let genericUsed = 0;
  if (picked.length < total) {
    const alreadyGeneric = picked.filter((item) => !item._primary).length;
    genericUsed = alreadyGeneric;
    for (const item of unkeyed) {
      if (picked.length >= total || genericUsed >= genericCap) break;
      if (take(item, '__none__')) genericUsed += 1;
    }
  }

  const shortfall = order
    .filter((entry) => (byKey.get(entry.key)?.length ?? 0) < (quotas.get(entry.key) ?? 0))
    .map((entry) => ({ key: entry.key, label: entry.label, want: quotas.get(entry.key), have: byKey.get(entry.key)?.length ?? 0 }));

  return { picked, quotas, counts, shortfall };
}

/** FNV-1a：给「同一个种子永远出同一套搜索页/排序」用，便于复现与单测。 */
export function hashString(value) {
  let hash = 2166136261;
  const text = String(value ?? '');
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export const SEARCH_ORDERS = ['totalrank', 'pubdate', 'click', 'dm'];
export const SEARCH_PAGES = [1, 2, 3];

/**
 * 每次运行换一套「排序 + 页码」，解决「每天搜到的都是同一页同一批」。
 * 同一个 seed（默认取当天）结果稳定；跨天自动换。
 */
export function searchPlan(entries, { seed = 0, orders = SEARCH_ORDERS, pages = SEARCH_PAGES } = {}) {
  const orderList = orders.length ? orders : SEARCH_ORDERS;
  const pageList = pages.length ? pages : SEARCH_PAGES;
  const plan = [];
  for (const entry of (entries ?? []).filter((item) => item.weight > 0)) {
    const hash = hashString(`${seed}|${entry.key}`);
    plan.push({
      ...entry,
      order: orderList[hash % orderList.length],
      page: pageList[Math.floor(hash / orderList.length) % pageList.length],
    });
  }
  return plan;
}

/** 从任意文本里捞出 BV 号（日记 / 审计表 / 观看历史 / 收藏）。 */
export function bvSetFromTexts(texts = []) {
  const out = new Set();
  for (const text of texts) {
    for (const match of String(text ?? '').matchAll(/BV[0-9A-Za-z]{10}/g)) out.add(match[0]);
  }
  return out;
}

/** 最近推荐过、但还没看的视频：短期不再推（默认 3 天）。 */
export function filterRecentlyPicked(candidates, pickedMap = {}, { now = Date.now(), days = 3 } = {}) {
  const windowMs = Math.max(0, safeNumber(days, 3)) * 86400000;
  if (!windowMs) return candidates;
  const cutoff = now - windowMs;
  return candidates.filter((item) => {
    const at = Date.parse(String(pickedMap?.[item.bv] ?? ''));
    return !(Number.isFinite(at) && at >= cutoff);
  });
}

export function prunePickedMap(pickedMap = {}, { now = Date.now(), days = 30 } = {}) {
  const cutoff = now - Math.max(1, safeNumber(days, 30)) * 86400000;
  const out = {};
  for (const [bv, at] of Object.entries(pickedMap ?? {})) {
    const ts = Date.parse(String(at));
    if (Number.isFinite(ts) && ts >= cutoff) out[bv] = at;
  }
  return out;
}
