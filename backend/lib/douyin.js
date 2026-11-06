/**
 * 抖音的平台层（第四个平台，和 QQ / B站 / 贴吧 并列）。
 *
 * 怎么来的：直接把已做好的抖音网页版实现（npm 包 dsh-douyin-browser-local）的代码
 * vendor 到 backend/vendor/douyin/，由本插件在同一个进程里调用 —— 不是另装一个插件、
 * 也不是再开一套服务。浏览器仍用本机 Microsoft Edge（有窗口，需要人工扫码登录）。
 *
 * 分工：
 *   · 浏览器 / 翻页 / 状态读取 / 时间账本 ← vendor 里的 BrowserController、VideoLimits；
 *   · 「什么时候允许看、每次看几条、两轮之间隔多久」 ← 合体层 unified.douyin（本文件投影）；
 *   · 自走循环是本地定时器（打开推荐流 → 停留 → 下一条），不依赖 DSH 的模型，
 *     所以关掉 B站 模型额度也不会把抖音断掉。
 *
 * 状态落在 $DSH_HOME/surfcore/douyin/，登录后的 Edge 资料目录保持在
 * ~/.dsh/douyin-browser/cli-profile（vendor 的固定位置，升级/重装都不会掉登录）。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { STATE_DIR, findNodeExe, maskPath } from './paths.js';
import { readJson, readUnified, saveUnified, writeJsonAtomic } from './store.js';
import { DEFAULT_DOUYIN, normalizeDouyinConfig } from './douyin-config.mjs';
import { VideoLimits } from '../vendor/douyin/video-limits.mjs';
import { WatchMode } from '../vendor/douyin/watch-mode.mjs';
import { normalizeMentionNames } from '../vendor/douyin/group-reply-trigger.mjs';

export const DOUYIN_DIR = path.join(STATE_DIR, 'douyin');
export const DOUYIN_STATE_DIR = path.join(DOUYIN_DIR, 'state');
const VIEW_FILE = path.join(DOUYIN_DIR, 'views.jsonl');
const SUMMARY_FILE = path.join(DOUYIN_DIR, 'last-summary.json');
const AUTO_FILE = path.join(DOUYIN_DIR, 'auto-state.json');
const VIEW_MAX_BYTES = 1024 * 1024;

// vendor 用 os.homedir() 固定这几个目录（不受 DSH_HOME 影响），这里跟着算同一份。
const BROWSER_HOME = path.join(os.homedir(), '.dsh', 'douyin-browser');
const CONTROL_DIR = path.join(BROWSER_HOME, 'control');
const BROWSER_STATE = path.join(CONTROL_DIR, 'browser.json');
const PROFILE_DIR = path.join(BROWSER_HOME, 'cli-profile');
const BROWSER_PORT = 9227;

let logLine = () => {};
/** 由 index.js 注入插件日志（不直接 console，避免把浏览器细节写进用户终端）。 */
export function configureDouyinLog(fn) {
  logLine = typeof fn === 'function' ? fn : () => {};
}
const log = (message) => { try { logLine(`[抖音] ${message}`); } catch { /* 日志失败不影响主流程 */ } };

let envReady = false;
// 必须在 import core.mjs 之前设置：否则状态会落到 vendor 代码目录里（升级即丢）。
function ensureDouyinEnv() {
  if (envReady) return;
  try { fs.mkdirSync(DOUYIN_STATE_DIR, { recursive: true }); } catch {}
  process.env.DOUYIN_STATE_DIR = DOUYIN_STATE_DIR;
  // 位置记录文件不存在也没关系：vendor 把 ENOENT 当作「没有额外配置」。
  process.env.DOUYIN_RUNTIME_LOCATION_FILE = path.join(DOUYIN_DIR, 'runtime-location.json');
  // 「记住 / 回忆」用自己的库，不写进 vendor 目录。
  process.env.DEEPSEEK_SHARED_MEMORY_DB = path.join(DOUYIN_DIR, 'memory', 'shared.sqlite');
  // Electron 里的 process.execPath 是 Harness.exe；专用浏览器宿主必须用真 node.exe 起。
  try {
    const node = findNodeExe();
    if (node && node !== process.execPath) process.env.DOUYIN_NODE_EXECUTABLE = node;
  } catch {}
  envReady = true;
}

let vendorPromise = null;
function loadVendor() {
  ensureDouyinEnv();
  vendorPromise ??= import('../vendor/douyin/core.mjs')
    .then((mod) => ({ BrowserController: mod.BrowserController }))
    .catch((error) => { vendorPromise = null; throw error; });
  return vendorPromise;
}

let controllerPromise = null;
async function getController() {
  if (!controllerPromise) {
    controllerPromise = loadVendor().then(({ BrowserController }) => new BrowserController({
      source: 'api',
      controlDirectory: CONTROL_DIR,
    }));
    controllerPromise.catch(() => { controllerPromise = null; });
  }
  return controllerPromise;
}

let limitsInstance = null;
function getLimits() {
  ensureDouyinEnv();
  limitsInstance ??= new VideoLimits({ stateDir: DOUYIN_STATE_DIR });
  return limitsInstance;
}

let watchModeInstance = null;
function getWatchMode() {
  ensureDouyinEnv();
  watchModeInstance ??= new WatchMode({ stateDir: DOUYIN_STATE_DIR, source: 'api' });
  return watchModeInstance;
}

// ── 配置 ───────────────────────────────────────────────────────────────────
export function douyinConfig() {
  try {
    return normalizeDouyinConfig(readUnified()?.config?.douyin);
  } catch {
    return normalizeDouyinConfig(DEFAULT_DOUYIN);
  }
}

/**
 * 把合体层配置投影成 vendor 的 video-policy.json（时段/额度的唯一真相）。
 * 保存设置后、打开窗口前、自走循环每轮前都会调一次；没变化就不写盘。
 */
export function douyinSyncPolicy() {
  const cfg = douyinConfig();
  const limits = getLimits();
  let current = null;
  try { current = limits.policy(); } catch { current = null; }
  const same = current
    && current.enabled === cfg.enabled
    && JSON.stringify(current.windows) === JSON.stringify(cfg.windows)
    && current.dailyMinutes === cfg.dailyMinutes
    && current.dailyRequests === cfg.dailyRequests;
  let changed = false;
  if (!same) {
    limits.savePolicy({
      enabled: cfg.enabled,
      windows: cfg.windows,
      dailyMinutes: cfg.dailyMinutes,
      dailyRequests: cfg.dailyRequests,
    }, { explicit: true });
    changed = true;
  }
  // 静默刷（最小化 + 静音）也投影过去；写不进去不影响观看，只是窗口不会自动收起。
  let silentChanged = false;
  try {
    const mode = getWatchMode();
    if (mode.policy().silent !== cfg.silent) {
      mode.configure({ silent: cfg.silent }, { explicit: true });
      silentChanged = true;
    }
  } catch { /* 静默设置损坏/被占用：保持原状 */ }
  return { ok: true, changed, silentChanged, enabled: cfg.enabled, windows: cfg.windows };
}

// ── 浏览器 / 页面 ──────────────────────────────────────────────────────────
function pidAlive(pid) {
  try { process.kill(pid, 0); return true; } catch (error) { return error?.code === 'EPERM'; }
}

function readBrowserState() {
  let file = null;
  try { file = JSON.parse(fs.readFileSync(BROWSER_STATE, 'utf8')); } catch { file = null; }
  if (!file) return { running: false, ready: false, pid: null, port: BROWSER_PORT };
  const owned = file.profile === PROFILE_DIR && file.port === BROWSER_PORT && pidAlive(file.pid);
  return {
    running: owned,
    ready: Boolean(owned && file.ready),
    pid: owned ? file.pid : null,
    port: BROWSER_PORT,
    launchFailure: file.launchFailure?.message ? String(file.launchFailure.message).slice(0, 300) : null,
  };
}

// ── 登录态（窗口关了也要知道「还登录着」）──────────────────────────────
// vendor 的登录只存在于专用 Edge 的资料目录（cli-profile/Network/Cookies）。
// 浏览器一关，页面读不到东西，但 cookie 还在 —— 所以这里直接只读查询 cookie 库，
// 不能把「窗口没开」当成「没登录」（会更像贴吧那种「换了浏览器就没登录态」的错觉）。
let loginCache = { at: 0, persisted: null, error: '' };
let loginPending = null;

async function refreshLoginState({ force = false } = {}) {
  if (!force && Date.now() - loginCache.at < 60_000) return loginCache;
  if (loginPending) return loginPending;
  loginPending = (async () => {
    try {
      const { DatabaseSync } = await import('node:sqlite');
      const cookieFile = path.join(PROFILE_DIR, 'Default', 'Network', 'Cookies');
      const db = new DatabaseSync(cookieFile, { readOnly: true });
      try {
        const rows = db.prepare(
          "select name from cookies where name in ('sessionid','sid_tt','sessionid_ss') and length(encrypted_value) > 0"
        ).all();
        loginCache = { at: Date.now(), persisted: rows.length > 0, error: '' };
      } finally {
        try { db.close(); } catch {}
      }
    } catch (error) {
      // 库被占用 / 还没登录过 / sqlite 不可用 → 保留上一次结论，别把「未知」说成「没登录」。
      loginCache = { at: Date.now(), persisted: loginCache.persisted, error: String(error?.message ?? error).slice(0, 200) };
    }
    return loginCache;
  })().finally(() => { loginPending = null; });
  return loginPending;
}

let lastPageState = null;
function publicPage(state) {
  if (!state || typeof state !== 'object') return null;
  const video = state.video ?? {};
  return {
    at: new Date().toISOString(),
    id: video.id ?? null,
    title: video.title ?? state.title ?? null,
    author: video.author ?? null,
    url: video.url ?? state.url ?? null,
    time: Number.isFinite(video.time) ? Number(video.time) : null,
    duration: Number.isFinite(video.duration) ? Number(video.duration) : null,
    paused: typeof video.paused === 'boolean' ? video.paused : null,
    pageKind: state.pageKind ?? null,
    loginRequired: Boolean(state.loginRequired),
    verificationRequired: Boolean(state.verificationRequired),
    note: typeof state.note === 'string' ? state.note.slice(0, 200) : null,
    visibleText: typeof state.visibleText === 'string' ? state.visibleText.slice(0, 400) : '',
  };
}

function capturePage(state) {
  lastPageState = state;
  // cookie 库可能读不到（运行环境没有 node:sqlite / 库被占用），
  // 这时以「页面能读到内容」作为登录成立的旁证；页面明确要求扫码则反过来更新。
  try {
    const required = Boolean(state?.loginRequired || state?.verificationRequired);
    const readable = Boolean(state?.video?.id)
      || (Array.isArray(state?.searchResults) && state.searchResults.length > 0)
      || String(state?.visibleText ?? '').length > 40;
    if (required && loginCache.persisted === true) loginCache = { at: Date.now(), persisted: false, error: '页面要求重新登录' };
    else if (!required && readable && loginCache.persisted !== true) loginCache = { at: Date.now(), persisted: true, error: '' };
  } catch {}
  recordView(state);
  return publicPage(state);
}

// ── 看过的视频（append-only，和 B站 的观看历史同一套做法）───────────────
const recentViews = new Map();
const VIEW_DEDUPE_MS = 10 * 60_000;

function recordView(state) {
  const video = state?.video;
  if (!video?.id) return;
  const now = Date.now();
  const last = recentViews.get(video.id);
  if (last && now - last < VIEW_DEDUPE_MS) return;
  recentViews.set(video.id, now);
  const entry = {
    at: new Date(now).toISOString(),
    id: String(video.id),
    title: video.title ?? null,
    author: video.author ?? null,
    url: video.url ?? null,
    duration: Number.isFinite(video.duration) ? Math.round(video.duration) : null,
  };
  try {
    fs.mkdirSync(DOUYIN_DIR, { recursive: true });
    fs.appendFileSync(VIEW_FILE, `${JSON.stringify(entry)}\n`, 'utf8');
    pruneViewFile();
  } catch { /* 记账失败不影响观看 */ }
}

function pruneViewFile() {
  try {
    const stat = fs.statSync(VIEW_FILE);
    if (stat.size <= VIEW_MAX_BYTES) return;
    const lines = fs.readFileSync(VIEW_FILE, 'utf8').split('\n').filter(Boolean).slice(-1000);
    fs.writeFileSync(VIEW_FILE, `${lines.join('\n')}\n`, 'utf8');
  } catch {}
}

export function readDouyinHistory({ limit = 300 } = {}) {
  const cap = Math.max(1, Math.min(2000, Number(limit) || 300));
  let items = [];
  try {
    items = fs.readFileSync(VIEW_FILE, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => { try { return JSON.parse(line); } catch { return null; } })
      .filter(Boolean);
  } catch { items = []; }
  const today = new Date().toLocaleDateString('sv-SE');
  const weekAgo = Date.now() - 7 * 86400000;
  const stats = {
    today: items.filter((item) => String(item.at ?? '').slice(0, 10) === today).length,
    last7d: items.filter((item) => {
      const at = new Date(item.at ?? 0).getTime();
      return Number.isFinite(at) && at >= weekAgo;
    }).length,
    videos: new Set(items.map((item) => item.id)).size,
    total: items.length,
  };
  return {
    ok: true,
    items: items.slice(-cap).reverse(),
    stats,
    total: items.length,
    file: maskPath(VIEW_FILE),
  };
}

// ── 上次总结 ───────────────────────────────────────────────────────────────
function readSummary() {
  try { return readJson(SUMMARY_FILE, null); } catch { return null; }
}

export function douyinSummary(note) {
  const text = String(note ?? '').trim().slice(0, 500);
  if (!text) return { ok: false, error: '总结不能为空' };
  writeJsonAtomic(SUMMARY_FILE, { note: text, at: new Date().toISOString() });
  return { ok: true, at: new Date().toISOString(), note: text };
}

// ── 评论区 / 互动通知（只读，走页面同源 fetch）─────────────────────────────
// 来源：dsh-douyin-watch 的 tools/video-thread.mjs、notice-read.mjs（MIT）。
// 它用的是「在已登录页面的上下文里 fetch」，不靠 Python 签名、也不另开浏览器：
// 页面自己带 cookie 和站点上下文，读接口就能通；我们复用它，登录态还是现有那个。
const PAGE_COMMON = 'device_platform=webapp&aid=6383&channel=channel_pc_web&pc_client_type=1'
  + '&version_code=190500&version_name=19.5.0&cookie_enabled=true&screen_width=1920&screen_height=1080'
  + '&browser_language=zh-CN&browser_platform=Win32&browser_name=Chrome&browser_version=141.0.0.0'
  + '&engine_name=Blink&engine_version=141.0.0.0&os_name=Windows&os_version=10&platform=PC';
const NOTICE_GROUPS = [700, 960, 401, 601];
const NOTICE_TYPE = {
  33: '关注了你', 34: '点赞了你的作品', 35: '评论了你的作品',
  45: '@了你（评论区）', 46: '@了你（作品）', 31: '回复了你的评论',
};
const COMMENT_IMAGE_DIR = path.join(DOUYIN_DIR, 'comment-images');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function awemeOf(value) {
  const text = String(value ?? '').trim();
  if (/^\d{6,25}$/.test(text)) return text;
  const match = /\/video\/(\d{6,25})/.exec(text) || /[?&](?:modal_id|aweme_id)=(\d{6,25})/.exec(text);
  return match?.[1] ?? '';
}

/** 在页面里串行 GET（每条都有超时；页面被验证挡住时宁可报错也不悬着）。 */
function pageFetchScript(urls, timeoutMs) {
  return `(async function(){
    var urls = ${JSON.stringify(urls)};
    var out = [];
    async function once(u){
      var ctl = new AbortController();
      var timer = setTimeout(function(){ try { ctl.abort() } catch(e){} }, ${timeoutMs});
      try {
        var r = await fetch(u, { credentials:'include', headers:{ Referer:'https://www.douyin.com/' }, signal: ctl.signal });
        var t = await r.text();
        return { http: r.status, text: t };
      } catch (e) {
        return { http: 0, error: String((e && e.name) || (e && e.message) || e) };
      } finally { clearTimeout(timer) }
    }
    for (var i = 0; i < urls.length; i++) {
      if (String(location.href).indexOf('douyin.com') === -1) { out.push({ http:0, error:'left-douyin-origin' }); continue }
      out.push(await once(urls[i]));
      await new Promise(function(done){ setTimeout(done, 900) });
    }
    return JSON.stringify(out);
  })()`;
}

async function pageFetch(urls, { timeoutMs = 12000 } = {}) {
  const controller = await getController();
  const signal = AbortSignal.timeout(180_000);
  return controller.withPage(async (page) => {
    // 搜索页会把 API 请求回成 HTML（实测），先回首页再读。
    if (/\/search\//.test(page.url())) {
      await page.goto('https://www.douyin.com/', { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await sleep(1500);
    }
    return JSON.parse(await page.evaluate(pageFetchScript(urls, timeoutMs)));
  }, { signal });
}

function jsonOf(response) {
  if (!response?.text) return null;
  try { return JSON.parse(response.text); } catch { return null; }
}

async function currentVideoId() {
  if (lastPageState?.video?.id) return String(lastPageState.video.id);
  const controller = await getController();
  const state = await controller.execute('douyin_status', {}, { signal: AbortSignal.timeout(120_000) });
  lastPageState = state;
  return state?.video?.id ? String(state.video.id) : '';
}

function commentImageUrls(raw) {
  const list = Array.isArray(raw?.image_list) ? raw.image_list : (Array.isArray(raw?.images) ? raw.images : []);
  const urls = [];
  for (const item of list) {
    // 同一张图会有多个 CDN 变体（url_list），只取第一张，否则会存成好几份同样的图。
    const candidates = item?.origin_url?.url_list || item?.url_list || item?.thumb_url?.url_list || [];
    const first = candidates.find((url) => typeof url === 'string' && /^https:\/\//.test(url));
    if (first && !urls.includes(first)) urls.push(first);
  }
  return urls.slice(0, 4);
}

async function saveCommentImages(items, { limit = 12 } = {}) {
  fs.mkdirSync(COMMENT_IMAGE_DIR, { recursive: true });
  let saved = 0;
  for (const item of items) {
    const urls = Array.isArray(item.imageUrls) ? item.imageUrls : [];
    for (let index = 0; index < urls.length && saved < limit; index += 1) {
      const url = urls[index];
      try {
        const response = await fetch(url, {
          signal: AbortSignal.timeout(20_000),
          headers: { Referer: 'https://www.douyin.com/', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36' },
        });
        if (!response.ok) continue;
        const buffer = Buffer.from(await response.arrayBuffer());
        if (buffer.length > 12 * 1024 * 1024) continue;
        const file = path.join(COMMENT_IMAGE_DIR, `${item.cid}-${index + 1}.jpg`);
        fs.writeFileSync(file, buffer);
        item.images.push({ file, url, bytes: buffer.length });
        saved += 1;
      } catch { /* 单张失败不影响整批 */ }
    }
  }
  return saved;
}

function normalizeComment(raw) {
  const user = raw?.user ?? {};
  const imageUrls = commentImageUrls(raw);
  return {
    cid: String(raw?.cid ?? ''),
    nick: String(user.nickname ?? ''),
    uid: String(user.uid ?? ''),
    text: String(raw?.text ?? '').replace(/\s+/g, ' ').trim().slice(0, 500),
    createTime: Number(raw?.create_time) || 0,
    replyCount: Number(raw?.reply_comment_total ?? raw?.reply_comment_count ?? 0) || 0,
    likeCount: Number(raw?.digg_count ?? 0) || 0,
    imageUrls,
    images: [],
  };
}

/** 读任意视频的评论区（含评论图片）。不给 id 时读当前正在看的那条。 */
export async function douyinComments({ awemeId, url, max = 20, images = true } = {}) {
  const id = awemeOf(awemeId || url) || await currentVideoId();
  if (!id) throw new Error('给一个视频链接或作品 id（也可以先打开一条视频再读）');
  const count = Math.max(1, Math.min(50, Number(max) || 20));
  const pathUrl = `https://www.douyin.com/aweme/v1/web/comment/list/?${PAGE_COMMON}`
    + `&aweme_id=${encodeURIComponent(id)}&cursor=0&count=${count}&item_type=0&app_name=aweme`;
  const responses = await pageFetch([pathUrl], { timeoutMs: 15_000 });
  const json = jsonOf(responses?.[0]);
  if (!json) throw new Error(`读取评论失败（HTTP ${responses?.[0]?.http ?? 0}${responses?.[0]?.error ? ` · ${responses[0].error}` : ''}）`);
  if (json.status_code && json.status_code !== 0) throw new Error(`抖音返回 status_code=${json.status_code}`);
  const raw = Array.isArray(json.comments) ? json.comments : [];
  const items = raw.slice(0, count).map(normalizeComment);
  let imageCount = 0;
  if (images && items.length) imageCount = await saveCommentImages(items);
  return {
    ok: true,
    awemeId: id,
    url: `https://www.douyin.com/video/${id}`,
    total: raw.length,
    hasMore: Number(json.has_more) === 1,
    imageCount,
    imageDir: maskPath(COMMENT_IMAGE_DIR),
    items,
  };
}

function normalizeNotice(raw, group) {
  const type = raw?.type;
  const record = {
    type: type === undefined ? null : type,
    typeName: NOTICE_TYPE[type] || `type_${type ?? '?'}`,
    nid: String(raw?.nid ?? ''),
    createTime: Number(raw?.create_time) || 0,
    group,
    nickname: '',
    content: '',
    awemeId: '',
    commentId: '',
    videoUrl: '',
    commentUrl: '',
  };
  for (const key of ['at', 'comment', 'digg', 'follow', 'fans', 'im', 'system']) {
    let block = raw?.[key];
    if (!block || typeof block !== 'object') continue;
    // type=31 的真实内容埋在 comment.comment 里（两层）。
    for (let depth = 0; depth < 2; depth += 1) {
      if (block?.comment && typeof block.comment === 'object') block = block.comment;
    }
    const user = block?.user || block?.user_info || block?.from_user || raw?.user || raw?.user_info || {};
    record.nickname = String(user.nickname ?? '');
    record.content = String(block?.text ?? block?.content ?? '').trim().slice(0, 300);
    const schema = String(block?.schema_url ?? raw?.schema_url ?? '');
    if (block?.cid) record.commentId = String(block.cid);
    if (schema.includes('aweme/detail/')) {
      const rest = schema.split('aweme/detail/')[1] || '';
      record.awemeId = rest.split('?')[0].split('&')[0];
      if (!record.commentId && schema.includes('cid=')) record.commentId = schema.split('cid=')[1].split('&')[0];
    }
    const aweme = block?.aweme_id ?? raw?.aweme_id ?? raw?.awemeId;
    if (aweme) record.awemeId = record.awemeId || String(aweme);
    break;
  }
  if (record.awemeId) {
    record.videoUrl = `https://www.douyin.com/video/${record.awemeId}`;
    if (record.commentId) record.commentUrl = `${record.videoUrl}?comment_id=${record.commentId}`;
  }
  return record;
}

/** 读互动通知（@我的 / 评论 / 点赞 / 关注）；只读，不标记已读。 */
export async function douyinNotices({ count = 20 } = {}) {
  const limit = Math.max(1, Math.min(50, Number(count) || 20));
  const base = 'https://www.douyin.com';
  const paths = [`${base}/aweme/v1/web/notice/count/?${PAGE_COMMON}&is_new_notice=1&need_social_count=1`];
  for (const group of NOTICE_GROUPS) {
    paths.push(`${base}/aweme/v1/web/notice/?${PAGE_COMMON}&is_new_notice=1&is_mark_read=0&count=${limit}&min_time=0&group=${group}&notice_group=${group}`);
  }
  const responses = await pageFetch(paths, { timeoutMs: 15_000 });
  const warnings = [];
  const counts = {};
  const countJson = jsonOf(responses?.[0]);
  if (countJson) {
    for (const item of countJson.notice_count ?? []) counts[String(item.group)] = Number(item.count) || 0;
  } else warnings.push('通知计数读取失败');
  const seen = new Set();
  const items = [];
  NOTICE_GROUPS.forEach((group, index) => {
    const json = jsonOf(responses?.[index + 1]);
    if (!json) { warnings.push(`group=${group} 读取失败`); return; }
    if (json.status_code && json.status_code !== 0) warnings.push(`group=${group} status_code=${json.status_code}`);
    for (const raw of json.notice_list_v2 ?? []) {
      const nid = String(raw?.nid ?? '');
      if (nid && seen.has(nid)) continue;
      if (nid) seen.add(nid);
      items.push(normalizeNotice(raw, group));
    }
  });
  items.sort((a, b) => b.createTime - a.createTime);
  return {
    ok: true,
    counts,
    total: items.length,
    atCount: items.filter((item) => item.type === 45 || item.type === 46).length,
    warnings,
    items: items.slice(0, limit),
  };
}

// ── 一条视频的「看懂」：文案 + 时长 + 数据 + 弹幕 + 热评 ───────────────────
// 对应 B站 debrief 的退路：没有官方字幕时，B站 也是靠弹幕 + 热评 + 画面。
// 抖音详情接口里 is_subtitled=0 表示没有字幕轨道；有的话以后可以再补字幕全文。
const stampOf = (seconds) => {
  if (!Number.isFinite(seconds) || seconds < 0) return '--:--';
  const total = Math.floor(seconds);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};

function danmakuScale(list, durationSec) {
  const values = (Array.isArray(list) ? list : [])
    .map((item) => Number(item?.offset_time))
    .filter((value) => Number.isFinite(value) && value >= 0);
  if (!values.length) return 1;
  const max = Math.max(...values);
  return max > (Number.isFinite(durationSec) && durationSec > 0 ? durationSec * 1.5 : 600) ? 0.001 : 1;
}

async function fetchVideoDetail(awemeId) {
  const url = `https://www.douyin.com/aweme/v1/web/aweme/detail/?${PAGE_COMMON}&aweme_id=${encodeURIComponent(awemeId)}`;
  const responses = await pageFetch([url], { timeoutMs: 15_000 });
  const json = jsonOf(responses?.[0]);
  if (!json?.aweme_detail) return null;
  return json.aweme_detail;
}

async function fetchDanmaku(awemeId, durationSec) {
  const url = `https://www.douyin.com/aweme/v1/web/danmaku/get_v2/?${PAGE_COMMON}`
    + `&item_id=${encodeURIComponent(awemeId)}&aweme_id=${encodeURIComponent(awemeId)}`;
  const responses = await pageFetch([url], { timeoutMs: 15_000 });
  const json = jsonOf(responses?.[0]);
  if (!json || (json.status_code && json.status_code !== 0)) return [];
  const raw = Array.isArray(json.danmaku_list) ? json.danmaku_list : [];
  const scale = danmakuScale(raw, durationSec);
  const seen = new Set();
  const picked = [];
  for (const item of raw) {
    const text = String(item?.text ?? '').trim();
    if (!text) continue;
    const key = text.replace(/\s+/g, '');
    if (seen.has(key)) continue;
    seen.add(key);
    picked.push({
      time: Math.round((Number(item?.offset_time) || 0) * scale * 10) / 10,
      text: text.slice(0, 120),
      likes: Number(item?.digg_count) || 0,
      score: Number(item?.score) || 0,
    });
  }
  picked.sort((a, b) => (b.likes - a.likes) || (b.score - a.score) || (a.time - b.time));
  return picked;
}

/** 一条视频的「看懂」结果：文案 / 时长 / 数据 / 弹幕 / 热评。 */
export async function douyinDebrief({ awemeId, url, danmakuLimit = 15, commentMax = 8 } = {}) {
  const id = awemeOf(awemeId || url) || await currentVideoId();
  if (!id) throw new Error('给一个视频链接或作品 id（也可以先打开一条视频再读）');
  const detail = await fetchVideoDetail(id);
  if (!detail) throw new Error('读不到视频详情（可能需要登录或该作品不可见）');
  const durationSec = Number(detail?.video?.duration) > 0 ? Number(detail.video.duration) / 1000 : null;
  const danmaku = await fetchDanmaku(id, durationSec);
  const comments = await douyinComments({ awemeId: id, max: commentMax, images: false });

  const stats = detail?.statistics ?? {};
  const text = [
    `标题：${String(detail?.item_title || detail?.desc || '').slice(0, 300) || '（无）'}`,
    String(detail?.desc || '').trim() ? `文案：${String(detail.desc).replace(/\s+/g, ' ').slice(0, 500)}` : '',
    detail?.author?.nickname ? `作者：${detail.author.nickname}` : '',
    durationSec ? `时长：${stampOf(durationSec)}` : '',
    stats.digg_count ? `点赞 ${stats.digg_count} · 评论 ${stats.comment_count ?? 0} · 收藏 ${stats.collect_count ?? 0} · 分享 ${stats.share_count ?? 0}` : '',
    Array.isArray(detail?.text_extra) && detail.text_extra.length
      ? `话题：${detail.text_extra.map((item) => `#${item.hashtag_name}`).filter(Boolean).join(' ')}`
      : '',
    danmaku.length ? `\n【高赞弹幕（观众反应，不是画面事实）】\n${danmaku.slice(0, danmakuLimit).map((item) => `[${stampOf(item.time)}] ${item.text}`).join('\n')}` : '',
    comments.items?.length ? `\n【热评】\n${comments.items.slice(0, commentMax).map((item) => `${item.nick || '匿名'}：${item.text || ''}`).join('\n')}` : '',
  ].filter(Boolean).join('\n');

  return {
    ok: true,
    awemeId: id,
    url: `https://www.douyin.com/video/${id}`,
    title: detail?.item_title || '',
    desc: detail?.desc || '',
    author: detail?.author?.nickname || '',
    music: detail?.music?.title || '',
    durationSeconds: durationSec ? Math.round(durationSec) : null,
    subtitled: Boolean(detail?.is_subtitled),
    stats: {
      digg: Number(stats.digg_count) || 0,
      comments: Number(stats.comment_count) || 0,
      collects: Number(stats.collect_count) || 0,
      shares: Number(stats.share_count) || 0,
    },
    danmaku: danmaku.slice(0, Math.max(1, Math.min(50, Number(danmakuLimit) || 15))),
    comments: comments.items ?? [],
    text,
    note: detail?.is_subtitled ? '该视频标称有字幕轨道，但抖音没有公开字幕全文接口；这里仍是文案+弹幕+热评。' : '该视频没有字幕轨道；内容是文案+弹幕+热评，不等于逐句听懂。',
  };
}

// ── 群聊 / 私信（白名单 + 群内被 @ / 点名才回）──────────────────────────
// 来源：vendor 的 ChatBrowser + ChatService + ChatAgent。
// 设计照原插件：只读/回复“许可名单”里的个人或群；群里只有被 @ 或正文叫到
// 配置的昵称才调模型；回复本身还要过长度/去重/频次/禁词闸门。
// 模型不额外要 Key：用 DSH 的默认模型路由（ctx.agentDefaultModel + ctx.llm）。
let chatModel = null;
export function configureDouyinChatModel({ llm, attachments, getSelection } = {}) {
  chatModel = { llm, attachments, getSelection };
}

/** 聊天回复用哪个模型：优先「对话」页的全局模型，其次抖音页里的旧设置，最后跟随 DSH 默认。 */
function chatSelectedModel() {
  try {
    const globalModel = readUnified()?.config?.model;
    if (globalModel?.provider && globalModel?.model) return globalModel;
  } catch { /* 读不到就继续往下退 */ }
  const saved = douyinConfig().chat.model;
  if (saved.provider && saved.model) return saved;
  const fallback = chatModel?.getSelection?.() ?? {};
  return { provider: fallback.provider || '', model: fallback.model || '', ...(fallback.reasoningEffort ? { reasoningEffort: fallback.reasoningEffort } : {}) };
}

function createReplyProvider() {
  return async ({ system, messages, signal, maxTokens }) => {
    const bridge = chatModel;
    if (!bridge?.llm?.stream) throw new Error('DSH 模型服务未就绪，无法自动回复');
    const selection = chatSelectedModel();
    if (!selection.provider || !selection.model) throw new Error('没有可用的聊天模型：请到设置里选一个，或先在 DSH 里设置默认模型');
    const converted = [];
    for (const message of Array.isArray(messages) ? messages : []) {
      const role = message?.role === 'assistant' ? 'assistant' : 'user';
      const parts = typeof message?.content === 'string'
        ? [{ type: 'text', text: message.content }]
        : (Array.isArray(message?.content) ? message.content : []);
      const blocks = [];
      for (const part of parts) {
        if (part?.type === 'text') {
          const text = String(part.text ?? '');
          if (text.trim()) blocks.push({ type: 'text', text });
          continue;
        }
        if (part?.type === 'image_url') {
          const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(part.image_url?.url ?? '');
          if (!match || typeof bridge.attachments?.saveImages !== 'function') throw new Error('图片消息需要 DSH 附件服务');
          const refs = await bridge.attachments.saveImages([{ data: Buffer.from(match[2], 'base64'), mediaType: match[1] }]);
          if (!Array.isArray(refs) || !refs[0]?.attachmentId) throw new Error('DSH 没能保存会话图片');
          blocks.push({ type: 'image', attachment: refs[0] });
          continue;
        }
        throw new Error(`私信回复含不支持的内容类型：${part?.type ?? '?'}`);
      }
      if (blocks.length) {
        converted.push({ id: randomUUID(), role, content: blocks, source: { kind: 'plugin', plugin: 'douyin-chat', form: 'snapshot', sections: [] } });
      }
    }
    let text = '';
    let finish = null;
    let usage = {};
    const deltaIndexes = new Set();
    for await (const chunk of bridge.llm.stream({
      provider: selection.provider,
      model: selection.model,
      messages: converted,
      system,
      maxTokens,
      ...(selection.reasoningEffort ? { reasoningEffort: selection.reasoningEffort } : {}),
      signal,
      sessionId: 'douyin-im',
    })) {
      signal?.throwIfAborted();
      if (chunk.type === 'text-delta') { deltaIndexes.add(chunk.index); text += chunk.text; }
      else if (chunk.type === 'block-end' && chunk.block?.type === 'text' && !deltaIndexes.has(chunk.index)) text += chunk.block.text;
      else if (chunk.type === 'usage') usage = { ...chunk.usage };
      else if (chunk.type === 'finish') finish = chunk.reason;
      if (text.length > 8000) throw new Error('私信回复超过长度上限');
    }
    if (finish?.kind !== 'stop' || !text.trim()) throw new Error('DSH 模型没有完整返回回复');
    return { text, usage };
  };
}

let chatPromise = null;
async function getChatService() {
  if (chatPromise) return chatPromise;
  chatPromise = (async () => {
    const controller = await getController();
    const [{ ChatBrowser }, { ChatService }, { ChatAgent }] = await Promise.all([
      import('../vendor/douyin/chat-browser.mjs'),
      import('../vendor/douyin/chat-service.mjs'),
      import('../vendor/douyin/chat-agent.mjs'),
    ]);
    const browser = new ChatBrowser({ source: 'api-chat' });
    const personaMemory = controller.getPersonaMemory();
    const agent = new ChatAgent({
      replyProvider: createReplyProvider(),
      personaMemory,
      getMemoryStore: () => controller.store(),
    });
    return new ChatService({
      browser,
      agent,
      videoLimits: controller.limits(),
      personaMemory,
      stateDir: DOUYIN_STATE_DIR,
      source: 'api',
    });
  })().catch((error) => { chatPromise = null; throw error; });
  return chatPromise;
}

function chatSummary(state) {
  return {
    ok: true,
    running: Boolean(state?.running),
    starting: Boolean(state?.starting),
    busy: Boolean(state?.busy),
    allowlist: (state?.policy?.allowlist ?? []).map((item) => ({
      id: String(item.id),
      name: String(item.name ?? ''),
      isGroup: item.isGroup === true,
    })),
    mentionNames: state?.policy?.groupMentionNames ?? douyinConfig().chat.mentionNames,
    contacts: (state?.contacts ?? []).map((item) => ({
      id: String(item.id),
      status: String(item.status ?? ''),
      reason: String(item.reason ?? ''),
      pending: Number(item.pending) || 0,
      unanswered: Array.isArray(item.unanswered) ? item.unanswered.length : 0,
      lastCheckedAt: item.lastCheckedAt ?? null,
    })),
    events: (state?.events ?? []).slice(-10),
    pollSeconds: state?.pollSeconds ?? null,
    recovery: state?.recovery ?? null,
  };
}

export async function douyinChatStatus() {
  const chat = await getChatService();
  return chatSummary(chat.state());
}

export async function douyinChatContacts() {
  const chat = await getChatService();
  const result = await chat.listContacts({ signal: AbortSignal.timeout(150_000) });
  return {
    ok: true,
    blocked: Boolean(result?.blocked),
    loginRequired: Boolean(result?.loginRequired),
    verificationRequired: Boolean(result?.verificationRequired),
    contacts: (result?.contacts ?? []).map((item) => ({
      id: String(item.id ?? ''),
      name: String(item.name ?? item.displayName ?? ''),
      isGroup: item.isGroup === true,
      followed: item.followed === true,
      identityVerified: item.identityVerified === true,
      note: String(item.note ?? ''),
    })),
  };
}

export async function douyinChatConfigure({ recipientIds, mentionNames, allowConversationOnly = true } = {}) {
  const ids = Array.from(new Set((Array.isArray(recipientIds) ? recipientIds : []).map(String).filter(Boolean)));
  if (!ids.length) throw new Error('至少勾选一个个人或群聊会话');
  const names = normalizeMentionNames(mentionNames?.length ? mentionNames : douyinConfig().chat.mentionNames);
  const chat = await getChatService();
  const state = await chat.configure({
    recipientIds: ids,
    allowConversationOnly: allowConversationOnly !== false,
    groupMentionNames: names,
  });
  return chatSummary(state);
}

export async function douyinChatStart() {
  if (!douyinConfig().chat.enabled) throw new Error('先打开「被 @ / 叫到名字时自动回复」开关');
  const chat = await getChatService();
  const policy = chat.state().policy;
  if (!policy?.allowlist?.length) throw new Error('先列出会话并保存许可名单，再启动自动回复');
  // 好友互动总开关（原插件默认开；这里显式写一次，避免被别的流程关掉）
  writeJsonAtomic(path.join(DOUYIN_STATE_DIR, 'friend-interactions-policy.json'), { version: 1, enabled: true });
  await chat.start({ schedule: true });
  return douyinChatStatus();
}

export async function douyinChatStop() {
  const chat = await getChatService();
  try { chat.stop({ reason: 'user-stop' }); } catch { /* 已经停了 */ }
  return douyinChatStatus();
}

export async function douyinChatRead(recipientId) {
  const id = String(recipientId ?? '').trim();
  if (!id) throw new Error('缺少会话 id');
  const chat = await getChatService();
  const snapshot = await chat.readConversation(id, { signal: AbortSignal.timeout(150_000) });
  const messages = Array.isArray(snapshot?.messages) ? snapshot.messages : [];
  return {
    ok: true,
    conversation: {
      displayName: String(snapshot?.conversation?.displayName ?? ''),
      isGroup: snapshot?.conversation?.isGroup === true,
    },
    messages: messages.slice(-30).map((message) => ({
      id: String(message.id ?? ''),
      sender: message.sender === 'outgoing' ? 'outgoing' : 'incoming',
      text: String(message.text ?? '').slice(0, 600),
      time: message.time ?? message.at ?? null,
      memberName: message.memberName ?? null,
      media: message.media?.type ?? null,
    })),
    note: '只读取许可名单里的会话；群聊里的分享视频/语音只有实际采样后才有内容证据。',
  };
}

/** 列出 DSH 里可用的聊天模型（设置页下拉用）。 */
export async function douyinChatModels() {
  const llm = chatModel?.llm;
  if (!llm || typeof llm.listProviders !== 'function') {
    return { ok: false, error: 'DSH 模型服务未就绪', providers: [], models: [], saved: douyinConfig().chat.model, fallback: {} };
  }
  let providers = [];
  try {
    providers = llm.listProviders().map((item) => ({ id: String(item.id ?? ''), name: String(item.name || item.displayName || item.id || '') }));
  } catch (error) {
    return { ok: false, error: `读取提供商失败：${String(error?.message ?? error).slice(0, 160)}`, providers: [], models: [], saved: douyinConfig().chat.model, fallback: {} };
  }
  const models = [];
  const errors = [];
  for (const provider of providers) {
    try {
      const list = typeof llm.listModels === 'function' ? await Promise.race([
        llm.listModels(provider.id),
        new Promise((_, reject) => setTimeout(() => reject(new Error('目录查询超时')), 5000)),
      ]) : [];
      for (const entry of Array.isArray(list) ? list : []) {
        if (!entry?.id) continue;
        models.push({
          provider: provider.id,
          id: String(entry.id),
          name: String(entry.name || entry.id),
          inputModalities: Array.isArray(entry.inputModalities) ? entry.inputModalities.filter((value) => ['text', 'image'].includes(value)) : [],
        });
      }
    } catch (error) {
      errors.push(`${provider.id}: ${String(error?.message ?? error).slice(0, 120)}`);
    }
  }
  const fallback = chatModel?.getSelection?.() ?? {};
  return {
    ok: true,
    providers,
    models,
    saved: douyinConfig().chat.model,
    fallback: { provider: fallback.provider || '', model: fallback.model || '' },
    errors,
  };
}

/** 设置聊天模型：provider/model 都为空 = 跟随 DSH 默认模型。 */
export async function douyinChatSetModel({ provider = '', model = '' } = {}) {
  const nextProvider = String(provider ?? '').trim().slice(0, 200);
  const nextModel = String(model ?? '').trim().slice(0, 300);
  if (Boolean(nextProvider) !== Boolean(nextModel)) throw new Error('提供商和模型要同时选，或同时清空（跟随默认）');
  saveUnified({ douyin: { chat: { model: { provider: nextProvider, model: nextModel } } } });
  return douyinChatModels();
}

/** 把消息专用窗口最小化：原插件在前台时会暂停轮询，最小化后才会继续。 */
export async function douyinChatMinimize() {
  const chat = await getChatService();
  const controller = chat.browser?.controller;
  if (!controller?.withPage) throw new Error('消息浏览器未就绪');
  return controller.withPage(async (page) => {
    const session = await page.context().newCDPSession(page);
    try {
      const info = await session.send('Browser.getWindowForTarget');
      await session.send('Browser.setWindowBounds', { windowId: info.windowId, bounds: { windowState: 'minimized' } });
      return { ok: true, minimized: true, message: '已最小化专用窗口，自动回复会继续检查。' };
    } finally {
      try { await session.detach(); } catch {}
    }
  }, { signal: AbortSignal.timeout(60_000) });
}

/** 插件启动/保存后：如果配置开着且有许可名单，就恢复自动回复。 */
export async function douyinChatResume() {
  try {
    if (!douyinConfig().chat.enabled) {
      if (chatPromise) {
        const running = chatPromise.then((chat) => chat.state()).then((state) => Boolean(state?.running)).catch(() => false);
        if (await running) await douyinChatStop();
      }
      return { ok: true, skipped: 'disabled' };
    }
    const chat = await getChatService();
    const state = chat.state();
    if (state.running || state.starting) return { ok: true, skipped: 'running' };
    if (!state.policy?.allowlist?.length) return { ok: true, skipped: 'no-allowlist' };
    return await douyinChatStart();
  } catch (error) {
    const text = String(error?.message ?? error).slice(0, 300);
    log(`自动回复恢复失败：${text}`);
    return { ok: false, error: text };
  }
}

// ── 状态 ───────────────────────────────────────────────────────────────────
const HOUR_MIN = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const date = new Date(n);
  return date.toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Shanghai' });
};

function limitSnapshot() {
  const state = getLimits().state();
  return {
    allowed: Boolean(state.allowed),
    reason: state.reason ?? '',
    reasonCode: state.reasonCode ?? '',
    allowedWindow: state.window ? { start: HOUR_MIN(state.window.startAt), end: HOUR_MIN(state.window.expiresAt) } : null,
    daily: {
      date: state.daily?.date ?? null,
      usedSeconds: Math.round(Number(state.daily?.usedSeconds) || 0),
      remainingSeconds: state.daily?.remainingSeconds == null ? null : Math.round(Number(state.daily.remainingSeconds)),
      minutes: state.daily?.timeLimitMinutes ?? null,
      requests: state.daily?.requests ?? 0,
      remainingRequests: state.daily?.remainingRequests ?? null,
    },
    session: state.session ? { id: state.session.id, status: state.session.status } : null,
  };
}

export async function douyinStatus() {
  const cfg = douyinConfig();
  let policy = null;
  let policyError = '';
  try {
    const synced = douyinSyncPolicy();
    policy = limitSnapshot();
    policy.synced = synced.changed;
  } catch (error) {
    policyError = String(error?.message ?? error).slice(0, 300);
  }
  await refreshLoginState();
  return {
    ok: true,
    config: cfg,
    policy,
    policyError,
    browser: readBrowserState(),
    login: {
      persisted: loginCache.persisted,
      checkedAt: loginCache.at ? new Date(loginCache.at).toISOString() : null,
      error: loginCache.error || null,
    },
    watching: Boolean(watchRun),
    watch: watchRun ? {
      startedAt: watchRun.startedAt,
      reason: watchRun.reason,
      viewed: watchRun.viewed,
      maxVideos: watchRun.maxVideos,
      stopping: Boolean(watchRun.stopping),
    } : null,
    page: lastPageState ? publicPage(lastPageState) : null,
    lastSummary: readSummary(),
    lastError,
    paths: {
      state: maskPath(DOUYIN_STATE_DIR),
      history: maskPath(VIEW_FILE),
      profile: maskPath(PROFILE_DIR),
    },
  };
}

let lastError = '';

// ── 手动动作 ───────────────────────────────────────────────────────────────
const waitAbortable = (ms, signal) => new Promise((resolve) => {
  if (signal?.aborted) { resolve(); return; }
  const timer = setTimeout(finish, ms);
  function finish() {
    clearTimeout(timer);
    try { signal?.removeEventListener('abort', finish); } catch {}
    resolve();
  }
  try { signal?.addEventListener('abort', finish, { once: true }); } catch {}
  if (signal?.aborted) finish();
});

/** 打开专用 Edge 窗口：只用于登录 / 手动刷，不占用观看额度和时段。
 *  这里刻意不读页面状态：转移/接管登录页会触发额外建页，登录期间多开一个标签反而碍事。
 *  需要看当前作品时，点「读取当前作品」再读。 */
export async function douyinOpen() {
  const controller = await getController();
  const result = await controller.openBrowser({ signal: AbortSignal.timeout(150_000) });
  log(`打开专用窗口：${result?.mode ?? 'unknown'}`);
  // 窗口开起来后 cookie 可能刚更新（例如刚扫码）；强制再看一眼登录态。
  await refreshLoginState({ force: true });
  return { ok: true, opened: Boolean(result?.opened), mode: result?.mode ?? null, message: result?.message ?? '', page: lastPageState ? publicPage(lastPageState) : null };
}

/** 只读当前页面（不翻页、不改变播放进度；关着开关也能用，方便先确认登录）。 */
export async function douyinCurrent() {
  const controller = await getController();
  const state = await controller.execute('douyin_status', {}, { signal: AbortSignal.timeout(120_000) });
  await refreshLoginState({ force: true });
  return { ok: true, page: capturePage(state), policy: safePolicy() };
}

export async function douyinNext() {
  verifyAllowed('翻到下一条');
  const controller = await getController();
  await controller.execute('douyin_next', {}, { signal: AbortSignal.timeout(120_000) });
  const state = await controller.execute('douyin_status', {}, { signal: AbortSignal.timeout(60_000) });
  return { ok: true, page: capturePage(state) };
}

export async function douyinSearch(query) {
  const text = String(query ?? '').trim();
  if (!text) throw new Error('搜索词不能为空');
  verifyAllowed('搜索抖音');
  const controller = await getController();
  const state = await controller.execute('douyin_search', { query: text }, { signal: AbortSignal.timeout(150_000) });
  capturePage(state);
  return {
    ok: true,
    page: publicPage(state),
    results: (Array.isArray(state.searchResults) ? state.searchResults : []).slice(0, 12).map((item) => ({
      index: item.index, id: item.id, title: item.title, author: item.author, url: item.url,
    })),
  };
}

function safePolicy() {
  try { return limitSnapshot(); } catch (error) { return { allowed: false, reason: String(error?.message ?? error), error: true }; }
}

function verifyAllowed(action) {
  douyinSyncPolicy();
  const policy = safePolicy();
  if (!policy.allowed) throw Object.assign(new Error(policy.reason || `当前不允许${action}`), { code: 'douyin.blocked' });
  return policy;
}

// ── 自走循环（本地定时器，不依赖 DSH 模型）─────────────────────────────
let watchRun = null;

function readAutoState() {
  try { return readJson(AUTO_FILE, {}) ?? {}; } catch { return {}; }
}
function writeAutoState(patch) {
  try { writeJsonAtomic(AUTO_FILE, { ...readAutoState(), ...(patch ?? {}) }); } catch {}
}

export function douyinWatchInfo() {
  return watchRun ? {
    startedAt: watchRun.startedAt, reason: watchRun.reason,
    viewed: watchRun.viewed, maxVideos: watchRun.maxVideos, stopping: Boolean(watchRun.stopping),
  } : null;
}

export async function douyinStart({ reason = '手动', maxVideos, minutes } = {}) {
  if (watchRun) return { ok: true, already: true, watch: douyinWatchInfo() };
  const cfg = douyinConfig();
  const policy = verifyAllowed('刷抖音');
  const controller = await getController();
  const abort = new AbortController();
  const run = {
    abort,
    reason: String(reason),
    startedAt: new Date().toISOString(),
    viewed: 0,
    maxVideos: Math.max(1, Math.min(30, Number(maxVideos) || cfg.maxVideosPerWake)),
    maxMs: Math.max(1, Math.min(24 * 60, Number(minutes) || cfg.dailyMinutes)) * 60_000,
    stopping: false,
  };
  watchRun = run;
  lastError = '';
  writeAutoState({ lastStartedAt: run.startedAt, reason: run.reason });
  log(`开始刷一轮（${run.reason}）：最多 ${run.maxVideos} 条 · 每条停留 ${cfg.dwellSeconds}s`);
  run.promise = runLoop(controller, run, cfg)
    .catch((error) => {
      if (!abort.signal.aborted) {
        lastError = String(error?.message ?? error).slice(0, 400);
        log(`这一轮失败：${lastError}`);
      }
    })
    .finally(() => {
      const info = douyinWatchInfo();
      if (watchRun === run) watchRun = null;
      lastError = lastError || '';
      try { controller.execute('douyin_pause', {}, { signal: AbortSignal.timeout(8000) }).catch(() => {}); } catch {}
      log(`这一轮结束：看了 ${info?.viewed ?? 0} 条`);
    });
  return { ok: true, policy, watch: douyinWatchInfo() };
}

async function runLoop(controller, run, cfg) {
  const signal = run.abort.signal;
  const startedMs = Date.now();
  douyinSyncPolicy();
  await controller.execute('douyin_open', {}, { signal });
  try { await controller.execute('douyin_play', {}, { signal }); } catch { /* 已经自动播放 */ }
  for (let index = 0; index < run.maxVideos; index += 1) {
    if (signal.aborted) break;
    const state = await controller.execute('douyin_status', {}, { signal });
    capturePage(state);
    run.viewed += 1;
    if (state?.loginRequired || state?.verificationRequired) {
      throw new Error('抖音要求登录或验证：请打开专用窗口完成，再回来继续');
    }
    if (signal.aborted) break;
    if (index >= run.maxVideos - 1) break;
    if (Date.now() - startedMs >= run.maxMs) break;
    await waitAbortable(Math.max(1, cfg.dwellSeconds) * 1000, signal);
    if (signal.aborted) break;
    const policy = safePolicy();
    if (!policy.allowed) { log(`额度/时段到点，本轮提前收工：${policy.reason}`); break; }
    await controller.execute('douyin_next', {}, { signal });
    try { await controller.execute('douyin_play', {}, { signal }); } catch { /* 下一条通常自动播放 */ }
  }
}

export async function douyinStop() {
  const run = watchRun;
  if (run) {
    run.stopping = true;
    try { run.abort.abort(new Error('用户停止')); } catch {}
    await Promise.race([run.promise.catch(() => {}), waitAbortable(3000, null)]);
  }
  try {
    const controller = await getController();
    await controller.execute('douyin_pause', {}, { signal: AbortSignal.timeout(8000) });
  } catch {}
  return { ok: true, stopped: Boolean(run), status: await douyinStatus() };
}

/**
 * 生物钟每 60 秒调一次：到点、在时段内、今天还有额度、两轮之间够久 → 自己刷一轮。
 * 关掉 autoWatch 时什么也不做（只保留手动）。
 */
export async function douyinAutoTick() {
  try {
    const cfg = douyinConfig();
    if (!cfg.enabled || !cfg.autoWatch) return { ok: true, skipped: 'disabled' };
    if (watchRun) return { ok: true, skipped: 'running' };
    douyinSyncPolicy();
    const policy = safePolicy();
    if (!policy.allowed) return { ok: true, skipped: 'blocked', reason: policy.reason };
    const auto = readAutoState();
    const last = auto.lastStartedAt ? new Date(auto.lastStartedAt).getTime() : 0;
    if (last && Date.now() - last < Math.max(1, cfg.gapMinutes) * 60_000) return { ok: true, skipped: 'cooldown' };
    await douyinStart({ reason: '生物钟', maxVideos: cfg.maxVideosPerWake, minutes: cfg.dailyMinutes });
    return { ok: true, started: true };
  } catch (error) {
    const text = String(error?.message ?? error).slice(0, 300);
    log(`自动刷失败：${text}`);
    return { ok: false, error: text };
  }
}

/** 卸载 / 重启 DSH 时收尾：停循环 + 停 IM + 断开专用浏览器（窗口留给用户）。 */
export async function disposeDouyin() {
  const run = watchRun;
  if (run) {
    try { run.abort.abort(new Error('插件正在卸载')); } catch {}
    await Promise.race([run.promise.catch(() => {}), waitAbortable(2000, null)]);
  }
  const pendingChat = chatPromise;
  chatPromise = null;
  if (pendingChat) {
    try {
      const chat = await pendingChat;
      chat.stop({ reason: 'plugin-dispose' });
      await chat.close();
    } catch {}
  }
  const pending = controllerPromise;
  controllerPromise = null;
  if (!pending) return;
  try {
    const controller = await pending;
    await controller.close();
  } catch {}
}

// 供设置页/路由使用的小工具。
export function douyinPaths() {
  return {
    dir: maskPath(DOUYIN_DIR),
    state: maskPath(DOUYIN_STATE_DIR),
    history: maskPath(VIEW_FILE),
    profile: maskPath(PROFILE_DIR),
    browserControl: maskPath(CONTROL_DIR),
  };
}

export { BROWSER_PORT };
