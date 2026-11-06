/**
 * 贴吧的平台层（BDUSS 版）。
 *
 * 登录/读取/互动全部走 tieba-bduss.mjs —— 移植自 dsh-tieba-dive 的成熟实现：
 * 主人贴一次 BDUSS，网络层用 curl 子进程（百度认 TLS 指纹，Node fetch 会被判 is_login=0），
 * 读吧/读帖走手机版页面，回帖/点赞/签到走 app 签名接口。
 * · 本地再做一层频率闸门，避免触发风控后整轮失败。
 * · 跟 B站 共用生物钟：由 scheduler 在 B站 醒来时按间隔附带一次贴吧心跳。
 */
import fs from 'node:fs';
import path from 'node:path';
import { readUnified, readJson, writeJsonAtomic, isPlainObject } from './store.js';
import { TIEBA_DIR, TIEBA_CRED } from './paths.js';
import {
  agreePost, clearTiebaCookie, createThread, getAts, getSubReplies, getTiebaBduss,
  hasTiebaCookie, hotReplies, listBar, readThread, replyFloor, replySub, selfInfo,
  signForum, setTiebaCookie, tiebaWhoami,
} from './tieba-bduss.mjs';

const STATE_FILE = path.join(TIEBA_DIR, 'state.json');
// 看过的帖子：和 B站 的 watch-history.jsonl 同一套做法 —— append-only，按帖子去重。
const VIEW_FILE = path.join(TIEBA_DIR, 'views.jsonl');
const VIEW_MAX_BYTES = 1024 * 1024;
const VIEW_DEDUPE_MS = 30 * 60_000;

// 官方限制：发帖 30s/6h/30d；评论 10s/30h/200d；点赞 2s/60h/500d；改名 1s/3h/3d。
// 本地提前拦，比让接口返回 429 更可控。
const WRITE_LIMITS = {
  post: { gapMs: 30_000, hour: 6, day: 30, label: '发帖' },
  reply: { gapMs: 10_000, hour: 30, day: 200, label: '评论' },
  like: { gapMs: 2_000, hour: 60, day: 500, label: '点赞' },
  rename: { gapMs: 1_000, hour: 3, day: 3, label: '改名' },
};

/** 读本地登录凭据（credentials.json 优先，其次 cookie.txt）。 */
export function readTiebaCredentials() {
  try {
    const data = JSON.parse(fs.readFileSync(TIEBA_CRED, 'utf8'));
    if (data?.bduss) {
      return {
        bduss: String(data.bduss),
        user: String(data.user ?? ''),
        savedAt: String(data.savedAt ?? ''),
      };
    }
  } catch { /* 没有文件或坏文件 */ }
  if (hasTiebaCookie()) return { bduss: getTiebaBduss(), user: '', savedAt: '' };
  return null;
}

/** 用来访者贴进来的 BDUSS 登录：先落盘，再当场验一遍。 */
export async function saveTiebaCookieLogin(raw) {
  const bduss = setTiebaCookie(raw);
  // 保存前必须真的被贴吧认成登录态，否则下次心跳会一路报错。
  try {
    const probe = await tiebaWhoami();
    if (!probe.loggedIn) throw new Error(probe.error || 'BDUSS 无效');
  } catch (error) {
    clearTiebaCookie();
    throw error;
  }
  let account = { name: '', nameShow: '' };
  try { account = await selfInfo(); } catch { /* 昵称拿不到不影响登录 */ }
  const payload = {
    version: 4,
    bduss,
    user: String(account.nameShow || account.name || ''),
    savedAt: new Date().toISOString(),
  };
  fs.mkdirSync(TIEBA_DIR, { recursive: true });
  writeJsonAtomic(TIEBA_CRED, payload);
  try { fs.chmodSync(TIEBA_CRED, 0o600); } catch {}
  return { ok: true, user: payload.user, savedAt: payload.savedAt };
}

/** 设置页「核查登录」：BDUSS 还有效吗。 */
export async function verifyStoredTiebaCredentials() {
  const cred = readTiebaCredentials();
  if (!cred?.bduss) {
    return { ok: false, code: 'tieba.no-credentials', error: '还没有登录贴吧', hint: '把 BDUSS 粘贴到上面的输入框，点「保存并测试」' };
  }
  try {
    const probe = await tiebaWhoami();
    if (!probe.loggedIn) {
      return { ok: false, code: 'tieba.cookie-expired', error: probe.error || 'BDUSS 无效', hint: '去贴吧网页重新登录后，再复制一次 BDUSS' };
    }
    let user = cred.user;
    try { user = (await selfInfo()).nameShow || user; } catch { /* 昵称拿不到不影响判断 */ }
    return { ok: true, tbs: probe.tbs, user, savedAt: cred.savedAt };
  } catch (error) {
    return {
      ok: false,
      code: String(error?.code ?? 'tieba.verify-failed'),
      error: String(error?.message ?? error),
      hint: '确认本机 curl 可用，且 BDUSS 没过期',
    };
  }
}

export function clearTiebaCredentials() {
  clearTiebaCookie();
  try { fs.rmSync(TIEBA_CRED, { force: true }); } catch {}
}

/**
 * 解析认证：credentials.json / cookie.txt / config.json 里的 bduss。
 * 返回 { bduss, user, source } —— source 说明来源（qr 已废弃，这里统一叫 cookie）。
 */
export function resolveTiebaAuth() {
  const cred = readTiebaCredentials();
  if (cred?.bduss) {
    return { bduss: cred.bduss, user: cred.user, source: 'cookie', savedAt: cred.savedAt };
  }
  const manual = String(readUnified().config?.tieba?.bduss ?? '').trim().replace(/^BDUSS\s*[=:]\s*/i, '');
  if (manual) return { bduss: manual, user: '', source: 'manual' };
  return { bduss: '', user: '', source: 'none' };
}

export function tiebaConfig() {
  const raw = readUnified().config?.tieba ?? {};
  const auth = resolveTiebaAuth();
  const prefs = isPlainObject(raw.preferences) ? raw.preferences : {};
  const limits = isPlainObject(raw.limits) ? raw.limits : {};
  const clamp = (value, min, max, fallback) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, n));
  };
  return {
    enabled: raw.enabled === true,
    bduss: auth.bduss ?? '',
    user: auth.user ?? '',
    authSource: auth.source,    // 'cookie' | 'manual' | 'none'
    // 刷哪些吧：一行/逗号一个；为空时默认去 Agent 社区「抓虾吧」。
    bars: (() => {
      const list = normalizeList(raw.bars);
      return list.length ? list : ['抓虾吧'];
    })(),
    heartbeatShare: raw.heartbeatShare !== false,
    heartbeatGapHours: Math.max(1, Math.min(24, Number(raw.heartbeatGapHours) || 4)),
    sort: raw.sort === 'time' ? 'time' : 'hot',
    maxThreads: clamp(raw.maxThreads, 1, 20, 5),
    // 口味：和 B站 同一套语义 —— 爱看加权、不爱看抑制、额外关键词只扩大匹配。
    preferences: {
      like: normalizeList(prefs.like),
      dislike: normalizeList(prefs.dislike),
      keywords: normalizeList(prefs.keywords),
    },
    autoReply: raw.autoReply !== false,
    autoLike: raw.autoLike !== false,
    autoComment: raw.autoComment !== false,
    autoPost: raw.autoPost === true,
    // 额度：0 = 不限量（官方硬上限仍生效）。
    limits: {
      replyDaily: clamp(limits.replyDaily, 0, 200, 30),
      likeDaily: clamp(limits.likeDaily, 0, 500, 60),
      postDaily: clamp(limits.postDaily, 0, 30, 3),
      globalMin: clamp(limits.globalMin, 0, 120, 2),
    },
  };
}

/** 关键词表归一（和 store.js 的 normalizeUnified 同语义，避免两处漂移）。 */
function normalizeList(value) {
  const source = Array.isArray(value) ? value : String(value ?? '').split(/[,，、\n]/);
  const out = [];
  const seen = new Set();
  for (const raw of source) {
    const label = String(raw ?? '').replace(/\s+/g, ' ').trim();
    if (!label) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(label.slice(0, 40));
    if (out.length >= 40) break;
  }
  return out;
}

/**
 * 帖子口味打分（和 B站「口味权重」同一套思路，只是对象从视频变成帖子）：
 *   标题 + 摘要里命中「爱看」每个 +2，「额外关键词」每个 +0.75，
 *   命中「不爱看」直接 -3 并标记 dislike（前端/她都能一眼看出这条不该理）。
 * 返回 { score, liked, disliked }，关键词原文回传，方便提示里说明为什么选它。
 */
export function tiebaTaste(thread, preferences = {}) {
  const text = `${String(thread?.title ?? '')} ${String(thread?.abstract ?? '')}`.toLowerCase();
  const liked = [];
  const disliked = [];
  let score = 0;
  for (const word of preferences.like ?? []) {
    if (text.includes(String(word).toLowerCase())) { score += 2; liked.push(word); }
  }
  for (const word of preferences.keywords ?? []) {
    if (text.includes(String(word).toLowerCase())) { score += 0.75; liked.push(word); }
  }
  for (const word of preferences.dislike ?? []) {
    if (text.includes(String(word).toLowerCase())) { score -= 3; disliked.push(word); }
  }
  return { score: Math.round(score * 100) / 100, liked, disliked };
}

function readState() {
  const state = readJson(STATE_FILE, null);
  return {
    verifiedAt: state?.verifiedAt ?? null,
    lastPromptAt: state?.lastPromptAt ?? null,
    lastActionAt: state?.lastActionAt ?? null,
    lastSummary: String(state?.lastSummary ?? ''),
    actions: Array.isArray(state?.actions) ? state.actions.slice(-500) : [],
  };
}

function saveState(state) {
  fs.mkdirSync(TIEBA_DIR, { recursive: true });
  writeJsonAtomic(STATE_FILE, state);
}

function dayKey(iso) {
  try { return new Date(iso).toLocaleDateString('sv-SE'); } catch { return ''; }
}

function counts(actions) {
  const now = Date.now();
  const today = new Date().toLocaleDateString('sv-SE');
  const out = {};
  for (const type of Object.keys(WRITE_LIMITS)) {
    const list = actions.filter((item) => item?.type === type);
    out[type] = {
      hour: list.filter((item) => now - Number(item.at ?? 0) < 3600_000).length,
      day: list.filter((item) => dayKey(item.at) === today).length,
      lastAt: list.length ? Math.max(...list.map((item) => Number(item.at ?? 0))) : 0,
    };
  }
  return out;
}

/**
 * 写操作闸门：先按官方硬上限（最小间隔/每小时），再按设置页里主人定的「每天上限」。
 * 另外加一条全体共享的最小间隔（limits.globalMin，分钟），对应 B站 的「任意两条发言间隔」。
 */
function guardWrite(type) {
  const limit = WRITE_LIMITS[type];
  if (!limit) return;
  const config = tiebaConfig();
  const state = readState();
  const all = counts(state.actions);
  const stat = all[type];
  const now = Date.now();
  if (stat.lastAt && now - stat.lastAt < limit.gapMs) {
    const wait = Math.ceil((limit.gapMs - (now - stat.lastAt)) / 1000);
    throw new Error(`${limit.label}太快了：还需要等 ${wait} 秒（官方最小间隔 ${limit.gapMs / 1000} 秒）`);
  }
  if (stat.hour >= limit.hour) throw new Error(`本小时${limit.label}已达上限（${limit.hour} 次），等下一小时`);
  // 设置页的每日额度：0 = 不限量，但仍受官方日上限约束。
  const configured = {
    reply: config.limits.replyDaily,
    like: config.limits.likeDaily,
    post: config.limits.postDaily,
  }[type];
  const dailyCap = Number(configured) > 0 ? Math.min(Number(configured), limit.day) : limit.day;
  if (stat.day >= dailyCap) throw new Error(`今天${limit.label}已达上限（${dailyCap} 次），明天再来`);

  // 全局最小间隔：跨类型统计，避免「刚评论完马上点赞」这种明显不像真人的节奏。
  const globalGapMs = Number(config.limits.globalMin) * 60_000;
  if (globalGapMs > 0) {
    const lastAny = Math.max(0, ...Object.values(all).map((item) => Number(item.lastAt ?? 0)));
    if (lastAny && now - lastAny < globalGapMs) {
      const wait = Math.ceil((globalGapMs - (now - lastAny)) / 60_000);
      throw new Error(`离上一次发言还不到 ${config.limits.globalMin} 分钟（再等约 ${wait} 分钟）`);
    }
  }
}

function recordAction(type, detail = '') {
  const state = readState();
  const now = new Date().toISOString();
  state.actions = [...state.actions, { type, at: now, detail: String(detail).slice(0, 200) }].slice(-500);
  state.lastActionAt = now;
  saveState(state);
}

// ── 看过的帖子（设置页「观看记录」）────────────────────────────────────────
// 和 B站 观看历史同一套：她扫过的帖子（feed）与点进去认真看的帖子（thread）
// 各记一笔，前端按时间倒序展示，能回答「她今天到底看了什么」。

const shortText = (text, n) => String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

const numOr0 = (value, max = 1e9) => {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.min(n, max) : 0;
};

function readTailText(file, maxBytes = VIEW_MAX_BYTES) {
  try {
    const stat = fs.statSync(file);
    const start = Math.max(0, stat.size - maxBytes);
    const fd = fs.openSync(file, 'r');
    try {
      const buf = Buffer.alloc(stat.size - start);
      fs.readSync(fd, buf, 0, buf.length, start);
      return buf.toString('utf8');
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return '';
  }
}

function parseViewLines(text) {
  const out = [];
  for (const line of String(text ?? '').split('\n')) {
    if (!line.trim()) continue;
    try { out.push(JSON.parse(line)); } catch { /* 尾部截断的半行跳过 */ }
  }
  return out;
}

function normalizeViewEntry(entry = {}) {
  let at = '';
  const rawAt = String(entry.at ?? '').trim();
  if (rawAt) {
    const t = new Date(rawAt);
    if (Number.isFinite(t.getTime())) at = t.toISOString();
  }
  if (!at) at = new Date().toISOString();
  return {
    at,
    threadId: String(entry.threadId ?? ''),
    title: shortText(entry.title, 180),
    author: shortText(entry.author, 80),
    abstract: shortText(entry.abstract, 240),
    replyNum: numOr0(entry.replyNum),
    viewNum: numOr0(entry.viewNum),
    agreeNum: numOr0(entry.agreeNum),
    floors: numOr0(entry.floors, 10000),
    url: shortText(entry.url, 200),
    mode: entry.mode === 'read' ? 'read' : 'scan',
    score: Number.isFinite(Number(entry.score)) ? Number(entry.score) : null,
    liked: Array.isArray(entry.liked) ? entry.liked.slice(0, 8).map((x) => shortText(x, 40)) : [],
    disliked: Array.isArray(entry.disliked) ? entry.disliked.slice(0, 8).map((x) => shortText(x, 40)) : [],
    source: shortText(entry.source ?? 'feed', 24),
  };
}

/** 追加一条「看过」；写失败不抛（不能因为历史文件坏了就让她逛不了贴吧）。 */
function appendTiebaView(entry = {}) {
  try {
    const item = normalizeViewEntry(entry);
    if (!item.threadId && !item.title) return { ok: false, reason: '缺少 id/title' };
    fs.mkdirSync(TIEBA_DIR, { recursive: true });
    // 去重：同一条帖子、同一种读法，30 分钟内只记一次。
    const recent = parseViewLines(readTailText(VIEW_FILE, 64 * 1024)).slice(-60)
      .reverse()
      .find((x) => String(x?.threadId) === item.threadId);
    if (recent && recent.mode === item.mode
      && new Date(item.at).getTime() - new Date(recent.at).getTime() < VIEW_DEDUPE_MS) {
      return { ok: false, reason: 'duplicate' };
    }
    try {
      if (fs.statSync(VIEW_FILE).size > VIEW_MAX_BYTES) {
        fs.renameSync(VIEW_FILE, VIEW_FILE.replace(/\.jsonl$/, '.1.jsonl'));
      }
    } catch { /* 文件还不存在 */ }
    fs.appendFileSync(VIEW_FILE, `${JSON.stringify(item)}\n`);
    return { ok: true, item };
  } catch (error) {
    return { ok: false, reason: String(error?.message ?? error) };
  }
}

/** 从互动记录的 detail 里认出帖子 id（"…/p/123?pid=…" 或裸 id）。 */
function threadIdOfDetail(detail) {
  const text = String(detail ?? '');
  const match = text.match(/\/p\/(\d+)/) || text.match(/^(\d{6,})$/);
  return match ? match[1] : '';
}

/**
 * 读「看过的帖子」：新记录 + 30 分钟内「扫看→认真看」合并，按时间倒序。
 * 顺带把她对这条帖子做过的互动（评论/点赞）挂到每条记录上，和 B站 观看历史的「操作」列同义。
 */
export function readTiebaViewHistory({ limit = 200, q = '', days = 0, now = Date.now() } = {}) {
  const rotated = VIEW_FILE.replace(/\.jsonl$/, '.1.jsonl');
  const raw = [...parseViewLines(readTailText(rotated)), ...parseViewLines(readTailText(VIEW_FILE))];
  const entries = raw
    .map(normalizeViewEntry)
    .filter((x) => x.threadId || x.title)
    .sort((a, b) => new Date(a.at) - new Date(b.at));

  const rank = { scan: 0, read: 1 };
  const compact = [];
  for (const item of entries) {
    const prev = compact[compact.length - 1];
    if (prev && prev.threadId === item.threadId
      && new Date(item.at).getTime() - new Date(prev.at).getTime() < VIEW_DEDUPE_MS) {
      const deeper = (rank[item.mode] ?? 0) >= (rank[prev.mode] ?? 0);
      compact[compact.length - 1] = {
        ...prev,
        ...(deeper ? item : {}),
        at: deeper ? item.at : prev.at,
        mode: deeper ? item.mode : prev.mode,
        floors: item.floors || prev.floors,
        replyNum: item.replyNum || prev.replyNum,
        viewNum: item.viewNum || prev.viewNum,
        agreeNum: item.agreeNum || prev.agreeNum,
        score: item.score ?? prev.score,
        liked: item.liked.length ? item.liked : prev.liked,
        disliked: item.disliked.length ? item.disliked : prev.disliked,
        abstract: (deeper ? item.abstract : prev.abstract) || prev.abstract || item.abstract,
      };
    } else {
      compact.push(item);
    }
  }

  // 详情接口不带作者名；同一条帖子的扫看记录里有，补上免得「认真看」那行作者是空的。
  const authorById = new Map();
  for (const item of compact) {
    if (item.threadId && item.author) authorById.set(item.threadId, item.author);
  }
  for (const item of compact) {
    if (!item.author && authorById.has(item.threadId)) item.author = authorById.get(item.threadId);
  }

  // 互动记录只保留最近 500 条；按帖子 id 归到对应记录上。
  const state = readState();
  const actionsByThread = new Map();
  for (const action of state.actions) {
    const id = threadIdOfDetail(action.detail);
    if (!id) continue;
    const list = actionsByThread.get(id) ?? [];
    list.push({ kind: String(action.type ?? ''), at: String(action.at ?? '') });
    actionsByThread.set(id, list);
  }
  for (const item of compact) {
    const list = actionsByThread.get(item.threadId);
    if (list?.length) item.actions = list.sort((a, b) => new Date(a.at) - new Date(b.at));
  }

  const cutoff = Number(days) > 0 ? now - Number(days) * 86400_000 : 0;
  const query = String(q ?? '').trim().toLowerCase();
  const all = compact
    .filter((x) => !cutoff || new Date(x.at).getTime() >= cutoff)
    .filter((x) => !query || `${x.title} ${x.author} ${x.abstract}`.toLowerCase().includes(query))
    .sort((a, b) => new Date(b.at) - new Date(a.at));

  const today = new Date(now).toLocaleDateString('sv-SE');
  const weekAgo = now - 7 * 86400_000;
  const actionTotals = { reply: 0, like: 0, post: 0 };
  for (const item of all) {
    for (const action of item.actions ?? []) {
      if (action.kind in actionTotals) actionTotals[action.kind] += 1;
    }
  }
  return {
    file: VIEW_FILE,
    items: all.slice(0, Math.max(1, Math.min(1000, Number(limit) || 200))),
    total: all.length,
    actions: actionTotals,
    stats: {
      today: all.filter((x) => new Date(x.at).toLocaleDateString('sv-SE') === today).length,
      last7d: all.filter((x) => new Date(x.at).getTime() >= weekAgo).length,
      read: all.filter((x) => x.mode === 'read').length,
      threads: new Set(all.map((x) => x.threadId).filter(Boolean)).size,
    },
    generatedAt: new Date().toISOString(),
  };
}

export function tiebaStatus() {
  const config = tiebaConfig();
  const state = readState();
  return {
    ok: true,
    enabled: config.enabled,
    credSource: config.authSource,       // 'cookie' | 'manual' | 'none'
    hasBduss: Boolean(config.bduss),
    user: config.user,
    bars: config.bars,
    heartbeatShare: config.heartbeatShare,
    heartbeatGapHours: config.heartbeatGapHours,
    sort: config.sort,
    maxThreads: config.maxThreads,
    preferences: config.preferences,
    dailyLimits: config.limits,
    verifiedAt: state.verifiedAt,
    lastPromptAt: state.lastPromptAt,
    lastActionAt: state.lastActionAt,
    lastSummary: state.lastSummary,
    counts: counts(state.actions),
    limits: WRITE_LIMITS,
  };
}

export function tiebaPromptDue(now = Date.now()) {
  const config = tiebaConfig();
  if (!config.enabled || !config.bduss || !config.heartbeatShare) return false;
  const state = readState();
  const last = Math.max(
    Number(new Date(state.lastPromptAt ?? 0).getTime()) || 0,
    Number(new Date(state.lastActionAt ?? 0).getTime()) || 0,
  );
  return !last || now - last >= config.heartbeatGapHours * 3600_000;
}

/** 扫码 / 核查成功后标记「已登录核查」，设置页状态点才会变绿。 */
export function markTiebaVerified(at = new Date().toISOString()) {
  const state = readState();
  state.verifiedAt = at;
  saveState(state);
  return state.verifiedAt;
}

export function markTiebaPrompted(reason = '') {
  const state = readState();
  const now = new Date().toISOString();
  state.lastPromptAt = now;
  state.lastPromptReason = String(reason || '');
  saveState(state);
  return { ok: true, at: now };
}

/** 手机版标题带「_百度贴吧」后缀，展示前去掉。 */
const cleanTitle = (value) => String(value ?? '').replace(/_?百度贴吧.*$/i, '').replace(/_贴吧$/i, '').trim();

/** 纯文本校验：贴吧禁止 Markdown / 链接，避免把模型输出原样发上去。 */
function assertPlainText(value, { max = 1000, label = '内容' } = {}) {
  const text = String(value ?? '').trim();
  if (!text) throw new Error(`${label}不能为空`);
  if (text.length > max) throw new Error(`${label}最多 ${max} 个字符（当前 ${text.length}）`);
  if (/https?:\/\//i.test(text) || /\[[^\]]*\]\([^)]*\)/.test(text) || /`|\*\*/.test(text)) {
    throw new Error(`${label}只支持纯文本：不要用 Markdown、代码块或链接`);
  }
  return text;
}

/** 帖子详情：WAP 页面拿正文 + app 楼层接口拿 id/赞数，两者按楼层号合并。 */
async function buildThreadView(tid, { page = 1 } = {}) {
  const pn = Math.max(1, Number(page) || 1);
  const detail = await readThread(tid, { pn });
  let appFloors = [];
  try { appFloors = await hotReplies(tid, { rn: 30, pn, withComments: false }); } catch { /* 退回纯页面数据 */ }
  const byFloor = new Map();
  for (const post of appFloors) byFloor.set(Number(post.floor) || 0, post);
  const floors = Array.isArray(detail.floors) ? detail.floors : [];
  const posts = [];
  for (let i = 1; i < floors.length; i += 1) {
    const floorNo = i + 1;
    const app = byFloor.get(floorNo);
    posts.push({
      id: app?.id ? String(app.id) : '',
      floor: floorNo,
      content: floors[i],
      agreeNum: Number(app?.likes) || 0,
      subPosts: [],
    });
  }
  const first = byFloor.get(1);
  const thread = {
    id: String(tid),
    title: cleanTitle(detail.title),
    content: floors[0] ?? '',
    agreeNum: Number(first?.likes) || 0,
    page: { current: pn, total: pn, hasMore: false },
    posts,
    images: detail.images ?? [],
    url: `https://tieba.baidu.com/p/${tid}`,
  };
  return { thread };
}

/**
 * 供 CLI / HTTP 共用：所有贴吧操作只从这里走，BDUSS 不会出现在返回值里。
 * action: status | verify | feed | thread | floor | replyme | post | reply | like | unlike | summary
 */
export async function tiebaAction(action, payload = {}) {
  const name = String(action ?? '').trim();
  const config = tiebaConfig();

  if (name === 'status') return tiebaStatus();

  if (name === 'summary') {
    const state = readState();
    state.lastSummary = String(payload.note ?? payload.text ?? '').trim().slice(0, 500);
    saveState(state);
    return { ok: true, summary: state.lastSummary };
  }

  if (!config.bduss) throw new Error('贴吧还没登录：设置 → 平台 → 贴吧，把 BDUSS 粘贴进去，点「保存并测试」');

  if (name === 'verify') {
    const probe = await tiebaWhoami();
    if (!probe.loggedIn) throw new Error(probe.error || 'BDUSS 无效');
    let user = config.user;
    try { user = (await selfInfo()).nameShow || user; } catch { /* 昵称拿不到不影响判断 */ }
    const state = readState();
    state.verifiedAt = new Date().toISOString();
    saveState(state);
    return { ok: true, user, verifiedAt: state.verifiedAt };
  }
  if (name === 'feed') {
    const sort = payload.sort === 'time' || payload.sort === 'hot' ? payload.sort : config.sort;
    const seen = new Set();
    const threads = [];
    for (const bar of config.bars) {
      const list = await listBar(bar);
      for (const item of list.threads) {
        if (seen.has(String(item.id))) continue;
        seen.add(String(item.id));
        threads.push({
          id: String(item.id),
          title: item.title,
          replyNum: Number(item.reply) || 0,
          viewNum: 0,
          agreeNum: 0,
          author: '',
          abstract: '',
          bar,
          url: `https://tieba.baidu.com/p/${item.id}`,
        });
      }
    }
    if (sort === 'hot') threads.sort((a, b) => b.replyNum - a.replyNum);
    // 和 B站 一样按「口味权重」排序：爱看加权、不爱看沉底（不直接删，她还能看到但知道要避开）。
    const ranked = threads
      .map((thread) => ({ ...thread, taste: tiebaTaste(thread, config.preferences) }))
      .sort((a, b) => b.taste.score - a.taste.score);
    const shown = Math.min(ranked.length, config.maxThreads);
    // 设置页的「刷新帖子列表」只是预览，不能算进她的观看记录（传 preview: true）。
    if (payload.preview !== true) {
      for (const thread of ranked.slice(0, shown)) {
        appendTiebaView({
          threadId: thread.id, title: thread.title, author: thread.author, abstract: thread.abstract,
          replyNum: thread.replyNum, viewNum: thread.viewNum, agreeNum: thread.agreeNum,
          url: thread.url, mode: 'scan', score: thread.taste.score,
          liked: thread.taste.liked, disliked: thread.taste.disliked, source: 'feed',
        });
      }
    }
    return { sort, total: ranked.length, shown, threads: ranked, preferences: config.preferences };
  }
  if (name === 'thread') {
    const result = await buildThreadView(payload.id ?? payload.threadId, { page: payload.page });
    // 点进详情 = 认真看；记一笔深看，标题/正文也参与口味打分。
    if (payload.preview !== true) {
      const thread = result.thread ?? {};
      const taste = tiebaTaste({ title: thread.title, abstract: thread.content }, config.preferences);
      appendTiebaView({
        threadId: thread.id, title: thread.title, abstract: thread.content,
        agreeNum: thread.agreeNum, url: thread.url, mode: 'read',
        floors: Array.isArray(thread.posts) ? thread.posts.length : 0,
        score: taste.score, liked: taste.liked, disliked: taste.disliked, source: 'thread',
      });
    }
    return result;
  }
  if (name === 'floor') {
    const tid = payload.threadId ?? payload.thread_id;
    const pid = payload.postId ?? payload.post_id;
    if (!tid || !pid) throw new Error('floor 需要 threadId 和 postId');
    const subs = await getSubReplies(tid, pid, { pn: payload.page });
    return {
      threadId: String(tid),
      postId: String(pid),
      posts: subs.map((sub) => ({
        id: String(sub.id), floor: Number(sub.floor) || 0, content: sub.text,
        agreeNum: Number(sub.agree) || 0, author: sub.author?.nameShow || '',
        url: `https://tieba.baidu.com/p/${tid}?pid=${sub.id}`,
      })),
    };
  }
  if (name === 'replyme') {
    const ats = await getAts({ pn: Math.max(1, Number(payload.page) || 1) });
    return {
      replies: ats.map((at) => ({
        threadId: at.tid,
        postId: at.pid,
        title: at.title,
        unread: at.isFloor ? 1 : 0,
        content: at.content,
        quoteContent: '',
        from: at.replyer.nameShow,
        url: `https://tieba.baidu.com/p/${at.tid}${at.pid ? `?pid=${at.pid}` : ''}`,
      })),
    };
  }
  if (name === 'post') {
    const kw = payload.bar ?? payload.kw ?? config.bars[0];
    const title = assertPlainText(payload.title, { max: 30, label: '标题' });
    const content = assertPlainText(payload.content ?? payload.msg, { max: 1000, label: '正文' });
    guardWrite('post');
    const result = await createThread({ kw, title, content });
    if (!result.ok) throw new Error(result.error || '发帖失败');
    const url = result.tid ? `https://tieba.baidu.com/p/${result.tid}` : '';
    recordAction('post', `${title} ${url}`.trim());
    return { ok: true, threadId: result.tid, postId: result.pid, bar: kw, url };
  }
  if (name === 'reply') {
    const tid = payload.threadId ?? payload.thread_id;
    if (!tid) throw new Error('reply 需要 threadId');
    const content = assertPlainText(payload.content ?? payload.msg, { max: 400, label: '回复' });
    let kw = payload.bar ?? payload.kw ?? '';
    if (!kw) {
      try { kw = cleanTitle((await readThread(tid)).kw); } catch { /* 用默认吧兜底 */ }
    }
    if (!kw) kw = config.bars[0];
    guardWrite('reply');
    const result = await replyFloor({ kw, tid: String(tid), content });
    const url = `https://tieba.baidu.com/p/${tid}`;
    recordAction('reply', url);
    return { ok: true, ...result, url, bar: kw };
  }
  if (name === 'like' || name === 'unlike') {
    const tid = payload.threadId ?? payload.thread_id;
    if (!tid) throw new Error('like 需要 threadId');
    const pid = payload.postId ?? payload.post_id ?? 0;
    const objType = payload.objType ?? payload.obj_type ?? (pid ? 1 : 3);
    guardWrite('like');
    const result = await agreePost({
      tid: String(tid), pid, objType: Number(objType), opType: name === 'unlike' ? 1 : 0,
    });
    recordAction('like', String(tid));
    return result;
  }
  if (name === 'sign') {
    const bars = payload.bar ? [String(payload.bar)] : config.bars;
    const results = [];
    for (const bar of bars) {
      try { results.push(await signForum(bar)); } catch (error) { results.push({ ok: false, kw: bar, error: String(error?.message ?? error) }); }
    }
    return { ok: results.every((item) => item.ok), results };
  }
  if (name === 'delete-thread' || name === 'delete-post' || name === 'rename') {
    throw new Error('BDUSS 版（普通账号接口）不支持删帖 / 改名：贴吧只对楼主/吧务开放，请到贴吧 App 里操作');
  }
  throw new Error(`未知贴吧操作：${name}`);
}
