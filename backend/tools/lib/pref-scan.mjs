/**
 * 「一键抓取偏好关键词」——只读，不外发。
 *
 * 为什么需要（2026-10-23 用户提的需求）：
 *   新用户装好之后面对「爱看」是空的，只能自己想关键词；
 *   而 TA 的 B站 账号里其实已经有答案：观看历史、收藏夹（文件夹名本身就是分类）、
 *   关注的人、以及本地生成的观看记录/收藏/反馈。这个模块把这些**用户自己的数据**
 *   收敛成一组候选关键词，交给设置页让用户勾选，不自动写配置。
 *
 * 边界（写死在这里，UI 也会照写）：
 *   · 只发 GET，只读自己的数据；不点赞、不关注、不改任何东西；
 *   · 不读 QQ 聊天、不读日记正文（避免把私事变成"偏好词"）；
 *   · 候选只在本地设置页显示，不落盘、不外发；
 *   · 没有 cookie 时自动退化成「本地记录」扫描，不报错。
 */
import fs from 'node:fs';
import { accountBili, biliState } from './state-paths.mjs';
import { readWatchHistory } from './watch-history.mjs';
import { config } from './config.mjs';
import { normalizePreferences, safeNumber, splitTokens } from './feed-core.mjs';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const TIME_LIMIT_MS = 12000;

// 中文停用词：功能词 + B站 标题高频套话。宁可漏一点，也不要把「视频」「官方」推给用户。
const STOP_ZH = new Set([
  '我们', '你们', '他们', '她们', '它们', '这个', '那个', '这些', '那些', '什么', '怎么', '怎样', '为什么',
  '可以', '就是', '还是', '但是', '因为', '所以', '如果', '已经', '自己', '一个', '一些', '一起', '一下',
  '一直', '不是', '没有', '现在', '今天', '昨天', '明天', '时候', '这样', '那样', '这里', '那里', '哪里',
  '真的', '非常', '特别', '大家', '朋友', '视频', '系列', '合集', '第一', '第二', '第三', '最新', '更新',
  '完整', '完整版', '高清', '官方', '中文', '字幕', '解说', '全集', '全程', '直播', '录播', '搬运', '转载',
  '自制', '原创', '投稿', '测试', '版本', '使用', '介绍', '推荐', '盘点', '教程', '分享', '观看', '播放',
  '分钟', '小时', '一定', '必须', '居然', '竟然', '直接', '然后', '之后', '之前', '最后', '其实', '可能',
  '应该', '知道', '觉得', '感觉', '喜欢', '好看', '好玩', '有趣', '内容', '作品', '作者', '弹幕', '评论',
  '点赞', '关注', '收藏', '转发', '播放量', '纯享', '无删减', '中字', '熟肉', '生肉', '上集', '下集',
  '第一期', '第二期', '完结', '花絮', '预告', '片段', '高能', '名场面', '整活', '笑死', '泪目', '破防',
  '这就是', '直接上', '有没有', '是什么', '怎么办', '怎么回事', '如何', '以及', '还有', '而且', '不过',
  '虽然', '当然', '原来', '终于', '开始', '结束', '东西', '事情', '问题', '地方', '时间', '世界', '视频里',
  '我的', '你的', '他的', '她的', '它是', '我是', '你是', '他是', '她是', '账号', '这次', '这期', '本期',
  '做个', '一波', '一下', '一定',
]);
const STOP_EN = new Set([
  'the', 'and', 'for', 'with', 'you', 'your', 'are', 'this', 'that', 'from', 'what', 'how', 'why',
  'when', 'who', 'video', 'videos', 'watch', 'new', 'best', 'full', 'official', 'part', 'ep', 'vs',
  'com', 'www', 'http', 'https', 'abc', 'bilibili', 'b站', 'day', 'week', 'month', 'year',
]);
const ALLOW_SHORT_EN = new Set(['ai', 'vr', 'ar', 'ml', '3d', '4k', '8k', 'ds', 'gpt', 'dsh', 'ui', 'ux', 'pc', 'ps5', 'ns']);
// B站 分区级的“大词”：作为偏好太泛，抓出来只会把「游戏/日常」塞给用户。
const GENERIC_TAGS = new Set([
  '游戏', '日常', '综合', '短片', '综艺', '数码', '影视杂谈', '娱乐杂谈', '影视', '音乐', '动画',
  '生活', '知识', '科技', '时尚', '美食', '舞蹈', '运动', '体育', '汽车', '电影', '纪录片', '电视剧',
  '资讯', '搞笑', '三农', '动物', '鬼畜', '音乐现场', '热门', '推荐',
]);
const CJK = /[\u4e00-\u9fa5]/;
// 词边界上的虚词：以这些字开头/结尾的 n-gram 基本是半句话（「我用」「做了个」「的事」），
// 不是偏好词。不做这层过滤时，标题 n-gram 的前 20 名会全是这类碎片（实测过）。
const EDGE_STOP = new Set('的了着过是在和与及也都就还又很更最我你他她它给教让把被从对向为以于而且但并不没可能只再才必来去做个有装件一三第集期篇'.split(''));
// 标题里的半句话通常夹着虚词（「帅是一辈子」「味的工作区」「一辈子的事」）。
// 强分类（标签/收藏夹名）不过这一层 —— 「你的名字」这种正经作品名要留下。
const PARTICLE = /[的了着过是在和与也都就还又]/;

const decodeEntities = (text) => String(text ?? '')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&amp;/g, '&')
  .replace(/&quot;/g, '"')
  .replace(/&#39;/g, "'")
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>');

const usableTerm = (key) => {
  if (!key || key.length < 2 || key.length > 12) return false;
  if (STOP_ZH.has(key) || STOP_EN.has(key)) return false;
  if (/^[\d\s._-]+$/.test(key)) return false;
  return true;
};

/**
 * 从一段文本里抽候选词。
 *   · 拉丁词：≥3 字母（AI/VR 这类短词白名单放行），统一小写做键；
 *   · 中文：2~5 字 n-gram（更长关键词靠包含关系在排序阶段合并）；
 *   · `direct`：整段文本本身作为一个词（收藏夹名、标签名用）；
 *   · `strong`：来自用户明确分类（收藏夹/标签），计数门槛可以降到 1。
 */
export function extractTerms(text, { strong = false, direct = false } = {}) {
  const raw = decodeEntities(text).replace(/\s+/g, ' ').trim();
  const out = new Map();
  const add = (display, key, isStrong = strong) => {
    const term = String(display ?? '').trim();
    const k = String(key ?? term).trim().toLowerCase();
    if (!usableTerm(k)) return;
    const prev = out.get(k);
    if (prev) {
      if (isStrong) prev.strong = true;
      return;
    }
    out.set(k, { key: k, display: term.slice(0, 20), strong: isStrong });
  };
  if (!raw) return [];
  if (direct) {
    // 标签 / 收藏夹名 / 关注的 UP 名本身就是「用户分好的词」，
    // 不再拆 n-gram（否则「手机游戏 + 单机游戏」会生出一个假的「机游戏」）。
    const clean = raw.replace(/[·:：/|、,，]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (clean && clean.length <= 12) add(clean, clean.toLowerCase());
    return [...out.values()];
  }
  for (const match of raw.matchAll(/[A-Za-z][A-Za-z0-9+#._-]{1,}/g)) {
    const word = match[0].replace(/[._-]+$/, '');
    const lower = word.toLowerCase();
    if (STOP_EN.has(lower)) continue;
    if (lower.length >= 3 || ALLOW_SHORT_EN.has(lower) || (word === word.toUpperCase() && word.length === 2)) {
      add(word, lower);
    }
  }
  for (const match of raw.matchAll(/[\u4e00-\u9fa5]{2,}/g)) {
    const run = match[0];
    const maxN = Math.min(5, run.length);
    for (let n = 2; n <= maxN; n += 1) {
      for (let i = 0; i + n <= run.length; i += 1) {
        const gram = run.slice(i, i + n);
        if (STOP_ZH.has(gram)) continue;
        if (EDGE_STOP.has(gram[0]) || EDGE_STOP.has(gram[gram.length - 1])) continue;
        if (!strong && PARTICLE.test(gram)) continue;
        add(gram, gram);
      }
    }
  }
  return [...out.values()];
}

function existingTokenSet(existing) {
  const tokens = new Set();
  for (const label of existing ?? []) {
    for (const token of splitTokens(label)) tokens.add(token);
    const whole = String(label ?? '').trim().toLowerCase();
    if (whole) tokens.add(whole);
  }
  return tokens;
}

function coveredByExisting(key, tokens) {
  if (!key) return false;
  if (tokens.has(key)) return true;
  for (const token of tokens) {
    if (token.length < 2) continue;
    if (token.includes(key) || key.includes(token)) return true;
  }
  return false;
}

/**
 * 把多来源文本排成候选关键词（纯函数，单测用）。
 *
 * @param {Array<{text:string, source:string, weight?:number, strong?:boolean, direct?:boolean, sample?:string}>} inputs
 * @param {{existing?:string[], limit?:number, minCount?:number}} opts
 */
export function rankPreferenceCandidates(inputs, { existing = [], limit = 24, minCount = 2 } = {}) {
  const stats = new Map();
  for (const input of inputs ?? []) {
    const text = String(input?.text ?? '').trim();
    if (!text) continue;
    const source = String(input?.source ?? 'local');
    const weight = Math.max(0.1, safeNumber(input?.weight, 1));
    const terms = extractTerms(text, { strong: input?.strong === true, direct: input?.direct === true });
    const seen = new Set();
    for (const term of terms) {
      if (seen.has(term.key)) continue;
      seen.add(term.key);
      let item = stats.get(term.key);
      if (!item) {
        item = {
          key: term.key,
          display: term.display,
          score: 0,
          count: 0,
          sources: new Set(),
          samples: [],
          strong: false,
          cjk: CJK.test(term.key),
        };
        stats.set(term.key, item);
      }
      item.score += weight + (term.strong ? 1.5 : 0);
      item.count += 1;
      item.sources.add(source);
      if (term.strong) item.strong = true;
      const sample = String(input?.sample ?? text).slice(0, 42);
      if (item.samples.length < 3 && !item.samples.includes(sample)) item.samples.push(sample);
    }
  }

  // 门槛：
  //   · 收藏夹/标签这类「用户自己分好的类」→ 1 次就够；
  //   · 中文 3 字以上（更具体）→ 2 次；
  //   · 中文 2 字（更泛，「原神」「鸣潮」也可能在这里）→ 3 次；
  //   · 拉丁词 → 2 次。
  //   不这样分层时，标题里的偶然 2 字组合会挤满候选（实测「我用」「的事」都进过前十）。
  const needed = (item) => {
    if (item.strong) return 1;
    if (item.cjk && item.key.length === 2) return Math.max(3, minCount);
    return Math.max(2, minCount);
  };
  let list = [...stats.values()].filter((item) => item.count >= needed(item));

  // 包含关系合并：「大肥鱼」和「肥鱼」同时出现、频次差不多时，只留更具体的那个。
  // 但「AI」这种高频短词不会被「AI应用」挤掉（后者频次远低于前者）。
  const removed = new Set();
  const byLength = [...list].sort((a, b) => b.key.length - a.key.length);
  for (const longer of byLength) {
    if (removed.has(longer.key)) continue;
    for (const shorter of list) {
      if (shorter === longer || removed.has(shorter.key)) continue;
      if (longer.key.length <= shorter.key.length) continue;
      if (!longer.key.includes(shorter.key)) continue;
      if (longer.count >= shorter.count * 0.8 && longer.score >= shorter.score * 0.8) removed.add(shorter.key);
    }
  }
  list = list.filter((item) => !removed.has(item.key));

  // 已经在「爱看 / 额外关键词」里的不再重复推荐（大小写/包含关系都算）。
  const existingTokens = existingTokenSet(existing);
  list = list.filter((item) => !coveredByExisting(item.key, existingTokens));

  list.sort((a, b) =>
    b.score - a.score
    || b.count - a.count
    || b.key.length - a.key.length
    || a.key.localeCompare(b.key));

  return list.slice(0, Math.max(1, Math.min(60, safeNumber(limit, 24)))).map((item) => ({
    keyword: item.display,
    key: item.key,
    score: Math.round(item.score * 10) / 10,
    count: item.count,
    sources: [...item.sources],
    samples: item.samples,
    strong: item.strong,
  }));
}

// ── 网络（只读 GET）─────────────────────────────────────────────────────────
const FISH_CRED_FILE = () => process.env.SURFCORE_FISH_CREDENTIALS || accountBili('credentials.json');
const OWNER_CRED_FILE = () => process.env.SURFCORE_OWNER_CREDENTIALS || accountBili('owner-credentials.json');

function readCredentials(file = FISH_CRED_FILE()) {
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!data?.sessdata || !data?.bili_jct) return null;
    return data;
  } catch {
    return null;
  }
}

function headersFor(cred) {
  return {
    'user-agent': UA,
    referer: 'https://www.bilibili.com/',
    cookie: `SESSDATA=${cred.sessdata}; bili_jct=${cred.bili_jct}; buvid3=${cred.buvid3 ?? ''}`,
  };
}

async function fetchJson(url, headers, timeoutMs = TIME_LIMIT_MS, retries = 1) {
  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { headers, signal: controller.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (error) {
      lastError = error;
      if (attempt < retries) await new Promise((resolve) => setTimeout(resolve, 500));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError ?? new Error('请求失败');
}

const splitTag = (value) => String(value ?? '')
  .split(/[·:：/|、,，]+/)
  .map((part) => part.replace(/\s+/g, ' ').trim())
  .filter((part) => part.length >= 2 && part.length <= 12);

function readJson(file, fallback = null) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return fallback }
}

function localInputs() {
  const inputs = [];
  const seen = new Set();
  const push = (text, source, weight, extra = {}) => {
    const value = String(text ?? '').replace(/\s+/g, ' ').trim();
    if (!value || value.length < 2) return;
    const key = `${source}|${value.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    inputs.push({ text: value, source, weight, ...extra });
  };
  try {
    const history = readWatchHistory({ limit: 200 });
    for (const item of history.items) push(item.title, 'local-watch', 2, { sample: item.title });
  } catch {}
  try {
    const memory = readJson(biliState('bili-memory.json'), null);
    for (const entry of (memory?.entries ?? [])) {
      if (String(entry?.type ?? '') !== 'video') continue;
      push(entry.title, 'local-memory', 1.5, { sample: entry.title });
    }
  } catch {}
  try {
    const fav = readJson(biliState('favorites.json'), null);
    for (const item of (fav?.items ?? [])) {
      // 只取标题：`reason` 是她的整句收藏理由，抽出来的多是「之后想」这类碎片。
      push(item.title, 'local-fav', 2.5, { sample: item.title });
    }
  } catch {}
  try {
    const fb = readJson(biliState('feedback.json'), null);
    for (const event of (fb?.events ?? [])) {
      if (event?.videoTitle) push(event.videoTitle, 'local-feedback', 2, { sample: event.videoTitle });
    }
  } catch {}
  return inputs;
}

function ownerFeedbackInputs() {
  const inputs = [];
  const seen = new Set();
  const fb = readJson(biliState('feedback.json'), null);
  for (const event of (fb?.events ?? [])) {
    for (const [text, weight] of [[event?.videoTitle, 2.5], [event?.note, 1.5]]) {
      const value = String(text ?? '').replace(/\s+/g, ' ').trim();
      if (!value || value.length < 2) continue;
      const key = value.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      inputs.push({ text: value, source: 'owner-feedback', weight, sample: value });
    }
  }
  return inputs;
}

async function readAccount(headers) {
  try {
    const nav = await fetchJson('https://api.bilibili.com/x/web-interface/nav', headers);
    if (!nav?.data?.isLogin || !nav.data.mid) return null;
    return { mid: String(nav.data.mid), name: String(nav.data.uname ?? '') };
  } catch {
    return null;
  }
}

/** 一个账号（鱼或主人）的网络来源：历史 / 收藏夹 / 关注。全部只读 GET。 */
async function collectAccountSources({ role, headers, account, wanted, inputs, reports, ownNames }) {
  const prefix = role === 'owner' ? 'owner-' : '';
  const report = (name, ok, detail = {}) => reports.push({ name: `${prefix}${name}`, ok, ...detail });
  const source = (name) => `${prefix}${name}`;

  // ① 观看历史（最强信号：真的点开过什么 + B站 给的 tag_name）
  if (wanted.has('history')) {
    try {
      let items = 0;
      let pages = 0;
      for (const pn of [1, 2]) {
        let data;
        try {
          data = await fetchJson(`https://api.bilibili.com/x/web-interface/history/cursor?ps=30&pn=${pn}`, headers);
          if (data?.code !== 0) throw new Error(`code=${data?.code} ${data?.message ?? ''}`);
        } catch (error) {
          if (!pages) throw error;
          break;
        }
        pages += 1;
        for (const item of (data?.data?.list ?? [])) {
          const business = item?.history?.business ?? item?.business;
          if (business && business !== 'archive') continue;
          if (account.mid && String(item?.author_mid ?? '') === account.mid) continue;
          const title = String(item?.title ?? '').trim();
          if (!title) continue;
          inputs.push({ text: title, source: source('history'), weight: 3, sample: title });
          for (const tag of splitTag(item?.tag_name)) {
            if (GENERIC_TAGS.has(tag)) continue;
            inputs.push({ text: tag, source: source('history-tag'), weight: 2.5, strong: true, direct: true, sample: `标签：${tag}` });
          }
          items += 1;
        }
      }
      report('history', true, { items, pages });
    } catch (error) {
      report('history', false, { error: String(error?.message ?? error).slice(0, 120) });
    }
  }

  // ② 收藏夹：文件夹名是用户亲手分的类（异环二创 / 理工科普…），比标题更值钱
  if (wanted.has('favorites')) {
    try {
      const folders = await fetchJson(`https://api.bilibili.com/x/v3/fav/folder/created/list-all?up_mid=${account.mid}`, headers);
      if (folders?.code !== 0) throw new Error(`code=${folders?.code} ${folders?.message ?? ''}`);
      let items = 0;
      for (const folder of (folders?.data?.list ?? []).slice(0, 5)) {
        const title = String(folder?.title ?? '').trim();
        if (title && !/默认收藏夹/.test(title) && !GENERIC_TAGS.has(title)) {
          inputs.push({ text: title, source: source('favorites-folder'), weight: 3.5, strong: true, direct: true, sample: `收藏夹：${title}` });
        }
        if (!folder?.id) continue;
        const list = await fetchJson(`https://api.bilibili.com/x/v3/fav/resource/list?media_id=${folder.id}&pn=1&ps=20&platform=web`, headers);
        if (list?.code !== 0) continue;
        for (const media of (list?.data?.medias ?? [])) {
          const name = String(media?.title ?? '').trim();
          if (!name) continue;
          inputs.push({ text: name, source: source('favorites'), weight: 2.5, sample: name });
          items += 1;
        }
      }
      report('favorites', true, { items });
    } catch (error) {
      report('favorites', false, { error: String(error?.message ?? error).slice(0, 120) });
    }
  }

  // ③ 关注的人：名字里往往就是游戏/题材（异环、吉星派对…），权重低一点，用户自己勾
  if (wanted.has('following')) {
    try {
      const data = await fetchJson(`https://api.bilibili.com/x/relation/followings?vmid=${account.mid}&pn=1&ps=50`, headers);
      if (data?.code !== 0) throw new Error(`code=${data?.code} ${data?.message ?? ''}`);
      let items = 0;
      for (const user of (data?.data?.list ?? [])) {
        const name = String(user?.uname ?? '').trim();
        if (!name || name.length > 12) continue;
        if (ownNames.some((own) => name.includes(own))) continue;
        if (/官方|大会员|哔哩哔哩|bilibili|客服|直播|创作中心|小助手|安全中心|会员购/i.test(name)) continue;
        inputs.push({ text: name, source: source('following'), weight: 1, strong: true, direct: true, sample: `关注：${name}` });
        items += 1;
        if (items >= 12) break;
      }
      report('following', true, { items });
    } catch (error) {
      report('following', false, { error: String(error?.message ?? error).slice(0, 120) });
    }
  }
}

/**
 * 扫一遍候选关键词。任何一个源失败都不影响其他源；没有 cookie 时只用本地记录。
 *
 * target:
 *   fish  = 当前配置的小肥鱼账号（默认，兼容旧调用）
 *   owner = 主人账号（config.owner.mid；需要先扫码登录，cookie 存在 owner-credentials.json）
 *   both  = 两边都抓，来源前缀区分
 *
 * @param {{sources?:string[], limit?:number, target?:'fish'|'owner'|'both'}} opts
 */
export async function scanPreferences({ sources = ['history', 'favorites', 'local'], limit = 24, target = 'fish' } = {}) {
  const wanted = new Set((Array.isArray(sources) ? sources : []).map((item) => String(item)));
  const normalizedTarget = target === 'both' ? 'both' : target === 'owner' ? 'owner' : 'fish';
  const roles = normalizedTarget === 'both' ? ['fish', 'owner'] : [normalizedTarget];
  const wantsNetwork = ['history', 'favorites', 'following'].some((name) => wanted.has(name));

  const inputs = [];
  const reports = [];
  const accounts = [];
  const cfg = config();
  const selfMid = String(cfg.self?.mid ?? '');
  const ownerMid = String(cfg.owner?.mid ?? '');
  const ownNames = [cfg.self?.name, cfg.owner?.name].map((value) => String(value ?? '')).filter((value) => value.length >= 2);

  for (const role of roles) {
    // 只扫本地时不碰网络、也不声称「读到了哪个账号」——设置页会显示「只扫本地记录」。
    if (!wantsNetwork) continue;
    const cred = readCredentials(role === 'owner' ? OWNER_CRED_FILE() : FISH_CRED_FILE());
    if (!cred) {
      reports.push({
        name: `${role}-credential`,
        ok: false,
        error: role === 'owner'
          ? '还没有扫码登录主人的 B站 账号（点「一键抓取」会弹二维码）'
          : '还没有绑定小肥鱼的 B站 账号（可以在设置页扫码）',
      });
      continue;
    }
    const headers = headersFor(cred);
    const account = wantsNetwork ? await readAccount(headers) : null;
    if (wantsNetwork && !account) {
      reports.push({ name: `${role}-account`, ok: false, error: 'cookie 登录态无效/过期，需要重新扫码' });
      continue;
    }
    const resolved = account ?? {
      mid: role === 'owner' ? ownerMid : selfMid,
      name: String(role === 'owner' ? cfg.owner?.name : cfg.self?.name ?? ''),
    };
    const expectedMid = role === 'owner' ? ownerMid : selfMid;
    if (wantsNetwork && expectedMid && String(resolved.mid) !== expectedMid) {
      reports.push({
        name: `${role}-account`,
        ok: false,
        error: `这个 cookie 属于 ${resolved.name || resolved.mid}（${resolved.mid}），不是配置里的${role === 'owner' ? '主人' : '小肥鱼'}（${expectedMid}）`,
      });
      continue;
    }
    accounts.push({ mid: String(resolved.mid ?? ''), name: String(resolved.name ?? ''), role });
    if (wantsNetwork) {
      await collectAccountSources({ role, headers, account: resolved, wanted, inputs, reports, ownNames });
    }
  }

  // ④ 本地记录：鱼看过的 / 收藏的；主人的本地信号只有她的反馈（feedback.json）
  if (wanted.has('local')) {
    if (roles.includes('fish')) {
      try {
        const local = localInputs();
        inputs.push(...local);
        reports.push({ name: 'local', ok: true, items: local.length });
      } catch (error) {
        reports.push({ name: 'local', ok: false, error: String(error?.message ?? error).slice(0, 120) });
      }
    }
    if (roles.includes('owner')) {
      try {
        const feedback = ownerFeedbackInputs();
        inputs.push(...feedback);
        reports.push({ name: 'owner-feedback', ok: true, items: feedback.length });
      } catch (error) {
        reports.push({ name: 'owner-feedback', ok: false, error: String(error?.message ?? error).slice(0, 120) });
      }
    }
  }

  const ownerVerified = accounts.some((item) => item.role === 'owner');
  const ownerLoginRequired = wantsNetwork && roles.includes('owner') && !ownerVerified;

  let existing = [];
  try {
    const prefs = cfg.preferences ?? {};
    existing = normalizePreferences({ like: prefs.like ?? [], keywords: prefs.keywords ?? [], weights: prefs.weights ?? {} })
      .entries.map((entry) => entry.label);
  } catch {}

  // 同一条标题可能同时出现在观看历史 / 旧记忆 / 收藏里 —— 不合并的话
  // 「看了一次」会被算成 3 次，噪音词的频次也跟着翻倍（实测「做了个」冲到第二）。
  // 标签/收藏夹名例外：它们本来就该靠重复次数体现「这一类看了很多」。
  const deduped = [];
  const seenText = new Set();
  for (const input of inputs) {
    if (input.strong || input.direct) { deduped.push(input); continue; }
    const key = String(input.text ?? '').toLowerCase();
    if (!key || seenText.has(key)) continue;
    seenText.add(key);
    deduped.push(input);
  }

  const candidates = rankPreferenceCandidates(deduped, { existing, limit });
  const primary = accounts.find((item) => item.role === 'owner') ?? accounts[0] ?? null;
  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    target: normalizedTarget,
    credentials: accounts.length > 0,
    ownerLoginRequired,
    accounts,
    // 兼容旧 UI/CLI：单账号摘要
    account: primary
      ? { ...primary, expectedSelfMid: selfMid, expectedOwnerMid: ownerMid }
      : { mid: '', name: '', role: 'none', expectedSelfMid: selfMid, expectedOwnerMid: ownerMid },
    sources: reports,
    existing,
    stats: { inputs: inputs.length, uniqueTexts: deduped.length, candidates: candidates.length },
    candidates,
  };
}
