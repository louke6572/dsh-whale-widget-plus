// 上线补历史消息（socialV2.history）的纯逻辑。
//
// 背景：桥接/QQ 掉线期间，SnowLuma 不会把消息补发过来；这些消息只存在 QQ 的历史记录里。
// 每次重新上线时用 OneBot 的 get_group_msg_history / get_friend_msg_history 取回最近几条，
// 只把「水位之后、本地没存过」的消息并入未读，避免：
//   · 把已经在 recent/unread 里的消息再灌一遍（模型看到重复内容）；
//   · 把几小时前的旧消息当成刚发生的新消息；
//   · 断线重连风暴时反复请求/反复唤醒（桥接侧另有节流）。
//
// 这个模块不碰网络、不读写文件，只做归一化/水位/挑选，方便单测。

/** 默认值：用户要求「默认勾选打开」，所以缺省必须是 enabled=true。 */
export const DEFAULT_HISTORY_CATCHUP = Object.freeze({
  enabled: true,
  limit: 30,
  maxAgeMinutes: 720,
  wake: true,
  includePrivate: true,
});

function clampInt(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function boolOr(value, fallback) {
  return typeof value === 'boolean' ? value : fallback;
}

/**
 * 归一化 socialV2.history。
 * config.json 是用户可编辑的，字段可能缺失/写成字符串/负数；这里统一收敛，
 * 保证调用方拿到的永远是完整、可用的配置。
 */
export function normalizeHistoryConfig(raw) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  return {
    enabled: boolOr(source.enabled, DEFAULT_HISTORY_CATCHUP.enabled),
    limit: clampInt(source.limit, DEFAULT_HISTORY_CATCHUP.limit, 1, 100),
    maxAgeMinutes: clampInt(source.maxAgeMinutes, DEFAULT_HISTORY_CATCHUP.maxAgeMinutes, 1, 10080),
    wake: boolOr(source.wake, DEFAULT_HISTORY_CATCHUP.wake),
    includePrivate: boolOr(source.includePrivate, DEFAULT_HISTORY_CATCHUP.includePrivate),
  };
}

/**
 * 计算「只补这之后」的水位（毫秒时间戳）。
 *
 * 取三者最大值：
 *   · lastIncomingAt —— 桥接最后一次收到消息的本地时间；
 *   · lastHistoryMessageTime —— 上一次补历史时见到的最新远端时间；
 *   · 最近消息里的 time —— 防止状态文件里水位字段丢失后重复灌入。
 *
 * 本地到达时间（Date.now）通常比 QQ 消息的 time 晚 1~3 秒，直接比较会把「停机前最后
 * 几秒」的历史消息误判成旧消息。所以这里减去 toleranceMs（默认 5 秒）；重复由
 * messageId 去重兜底，宁可重叠几秒，也不要漏掉最后一条。
 */
export function historyWatermark(state, { now = Date.now(), maxAgeMs, toleranceMs = 5000 } = {}) {
  const windowMs = Number.isFinite(maxAgeMs) && maxAgeMs > 0 ? maxAgeMs : DEFAULT_HISTORY_CATCHUP.maxAgeMinutes * 60_000;
  const floor = now - windowMs;
  let watermark = floor;
  const consider = (value) => {
    const n = Number(value);
    if (Number.isFinite(n) && n > watermark) watermark = n;
  };
  consider(state?.lastIncomingAt);
  consider(state?.lastHistoryMessageTime);
  for (const message of Array.isArray(state?.recentMessages) ? state.recentMessages : []) {
    if (message && typeof message === 'object') consider(message.time);
  }
  return Math.max(floor, watermark - Math.max(0, Number(toleranceMs) || 0));
}

/**
 * 从历史消息候选里挑出真正要补的。
 *
 * 候选必须是桥接已经归一化过的对象：
 *   { messageId, time, userId, sender, text, plain, tail, isSelf, isOwner, media, forwardIds }
 *
 * 过滤规则：
 *   · messageId 为空、time 非法 → 跳过（没有稳定 id 就无法去重）；
 *   · 早于水位 / 早于时间窗 / 晚于未来 2 分钟（时钟漂移）→ 跳过；
 *   · 已在 existingIds 里 → 跳过（避免和实时消息重复）；
 *   · 发送者在 deny.users 里 → 跳过（黑名单不能借历史消息绕过）；
 *   · 最多保留最新 limit 条（历史接口按时间升序返回；超限时丢最旧的）。
 */
export function selectMissedHistory(candidates, {
  watermark = 0,
  now = Date.now(),
  maxAgeMs,
  limit = DEFAULT_HISTORY_CATCHUP.limit,
  existingIds = [],
  blockedUsers = [],
  futureToleranceMs = 120000,
} = {}) {
  const windowMs = Number.isFinite(maxAgeMs) && maxAgeMs > 0 ? maxAgeMs : DEFAULT_HISTORY_CATCHUP.maxAgeMinutes * 60_000;
  const floor = Math.max(Number(watermark) || 0, now - windowMs);
  const ceiling = now + Math.max(0, Number(futureToleranceMs) || 0);
  const seen = new Set(existingIds instanceof Set ? existingIds : Array.isArray(existingIds) ? existingIds : []);
  const blocked = new Set((Array.isArray(blockedUsers) ? blockedUsers : []).map((value) => String(value)));
  const picked = [];
  for (const candidate of Array.isArray(candidates) ? candidates : []) {
    if (!candidate || typeof candidate !== 'object') continue;
    const id = String(candidate.messageId ?? '').trim();
    if (!id || seen.has(id)) continue;
    const time = Number(candidate.time);
    if (!Number.isFinite(time) || time <= 0 || time < floor || time > ceiling) continue;
    if (candidate.userId && blocked.has(String(candidate.userId))) continue;
    seen.add(id);
    picked.push(candidate);
  }
  picked.sort((a, b) => Number(a.time) - Number(b.time));
  const cap = clampInt(limit, DEFAULT_HISTORY_CATCHUP.limit, 1, 100);
  if (picked.length > cap) picked.splice(0, picked.length - cap);
  return picked;
}

/** 统计一次补历史里「群友消息 / 自己以前发的消息」各多少条。 */
export function summarizeHistoryCatchup(messages) {
  const list = Array.isArray(messages) ? messages : [];
  let incoming = 0;
  let self = 0;
  for (const message of list) {
    if (!message || typeof message !== 'object') continue;
    if (message.isSelf) self += 1;
    else incoming += 1;
  }
  return { incoming, self, total: incoming + self };
}

/** 给唤醒提示/控制台用的一行摘要；没有补到消息时返回空串。 */
export function buildHistoryCatchupLine(summary) {
  const incoming = Math.max(0, Number(summary?.incoming) || 0);
  const self = Math.max(0, Number(summary?.self) || 0);
  if (!incoming && !self) return '';
  const parts = [];
  if (incoming) parts.push(`${incoming} 条群友/好友消息`);
  if (self) parts.push(`${self} 条你自己以前发过的消息`);
  return `【上线补历史】桥接从 QQ 历史记录补回 ${parts.join('、')}。`;
}

/** 历史消息对象上的标记字段名：模型看到 true 就知道这是补看的历史，不是刚发生的新消息。 */
export const HISTORY_MESSAGE_FLAG = 'history';
