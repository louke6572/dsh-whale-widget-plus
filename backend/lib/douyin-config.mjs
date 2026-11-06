/**
 * 抖音配置的形状（合体层 unified.douyin）。
 *
 * 放在独立文件里，是因为 store.js（读写配置）和 douyin.js（平台层）都要用它，
 * 两边互不 import，避免循环依赖，也避免「默认值」写成两份、改一处忘一处。
 *
 * 语义刻意跟 B站 / 贴吧 对齐：
 *   · 刷视频本身交给网页版（本机 Edge），这里只描述「什么时候允许看、看多少」；
 *   · 时段复用抖音自带 VideoLimits 的写法（HH:MM-HH:MM，24:00 表示当天结束），
 *     douyin.js 会把它投影成 video-policy.json —— 时段只有一份真相。
 */
// 不从 store.js 借 isPlainObject：store.js 会 import 本文件，借来借去就成环了。
const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

export const DEFAULT_DOUYIN = {
  // 总开关 = 「允许刷抖音」。关闭后连工具都会被拦，只能打开窗口登录。
  enabled: false,
  // 到点自动刷一轮（关掉就只保留手动「现在刷一条 / 一轮」）。
  autoWatch: true,
  // 每天允许刷的时段（可多个）；默认夜里 8~12 点，和 B站 的作息同段时间。
  windows: ['20:00-24:00'],
  // 每天总观看分钟数 / 每天模型请求次数（时长账本由网页端记录）。
  dailyMinutes: 15,
  dailyRequests: 30,
  // 每条停留多久再划走（秒）；每次醒来连续看几条。
  dwellSeconds: 30,
  maxVideosPerWake: 5,
  // 两轮自动观看之间至少隔多久（分钟），避免窗口一开始就一直刷。
  gapMinutes: 30,
  // 静默刷：每次动作后把专用窗口最小化并静音（登录/验证时不会隐藏）。
  // B站 是后台接口，抖音是真实浏览器，这个开关让它的“存在感”接近 B站。
  silent: false,
  // 群聊 / 私信：只处理白名单会话；群里只有被 @ 或叫到下面这些昵称时才回复。
  chat: {
    enabled: false,
    mentionNames: ['大肥鱼'],
    // 聊天回复用的模型：留空 = 跟随 DSH 默认模型；填了就用这个。
    model: { provider: '', model: '' },
  },
};

const WINDOW_RE = /^((?:[01]\d|2[0-3]):[0-5]\d)-((?:[01]\d|2[0-3]):[0-5]\d|24:00)$/;

function validWindow(value) {
  const text = String(value ?? '').trim();
  const match = WINDOW_RE.exec(text);
  if (!match) return null;
  if (match[1] === match[2] && match[2] !== '24:00') return null;
  return text;
}

/** 逗号/空白分隔的时段串也接受（设置页里用户可以一次贴一串）。 */
function normalizeWindows(input) {
  const list = Array.isArray(input) ? input : String(input ?? '').split(/[,，\s]+/);
  const out = [];
  for (const item of list) {
    const value = validWindow(item);
    if (value && !out.includes(value)) out.push(value);
    if (out.length >= 16) break;
  }
  return out.length ? out : [...DEFAULT_DOUYIN.windows];
}

function clamp(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

export function normalizeDouyinConfig(input) {
  const raw = isPlainObject(input) ? input : {};
  return {
    enabled: typeof raw.enabled === 'boolean' ? raw.enabled : DEFAULT_DOUYIN.enabled,
    autoWatch: typeof raw.autoWatch === 'boolean' ? raw.autoWatch : DEFAULT_DOUYIN.autoWatch,
    windows: normalizeWindows(raw.windows),
    dailyMinutes: clamp(raw.dailyMinutes, 1, 1440, DEFAULT_DOUYIN.dailyMinutes),
    dailyRequests: clamp(raw.dailyRequests, 1, 500, DEFAULT_DOUYIN.dailyRequests),
    dwellSeconds: clamp(raw.dwellSeconds, 5, 300, DEFAULT_DOUYIN.dwellSeconds),
    maxVideosPerWake: clamp(raw.maxVideosPerWake, 1, 30, DEFAULT_DOUYIN.maxVideosPerWake),
    gapMinutes: clamp(raw.gapMinutes, 1, 240, DEFAULT_DOUYIN.gapMinutes),
    silent: typeof raw.silent === 'boolean' ? raw.silent : DEFAULT_DOUYIN.silent,
    chat: normalizeChat(raw.chat),
  };
}

function normalizeChat(input) {
  const raw = isPlainObject(input) ? input : {};
  let names = Array.isArray(raw.mentionNames) ? raw.mentionNames : DEFAULT_DOUYIN.chat.mentionNames;
  names = names
    .map((name) => String(name ?? '').replace(/\s+/g, ' ').trim())
    .filter((name) => name && name.length <= 40)
    .slice(0, 10);
  return {
    enabled: typeof raw.enabled === 'boolean' ? raw.enabled : DEFAULT_DOUYIN.chat.enabled,
    mentionNames: names.length ? names : [...DEFAULT_DOUYIN.chat.mentionNames],
    model: normalizeChatModel(raw.model),
  };
}

function normalizeChatModel(input) {
  const raw = isPlainObject(input) ? input : {};
  const provider = String(raw.provider ?? '').trim().slice(0, 200);
  const model = String(raw.model ?? '').trim().slice(0, 300);
  // 只填一半等于没填，避免出现「选了提供商但没模型」的半截状态。
  return provider && model ? { provider, model } : { provider: '', model: '' };
}
