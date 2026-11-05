/**
 * 早安问候的排程与文案（纯函数）。
 *
 * 2026-10-23 用户反馈「早上八点的问候没成功」。查日志：
 *   · 08:00:00 桥接正好重启，启动时 `next.setHours(08:00)` 已经 <= now ⇒ 直接排到**明天**，
 *     今天这一枪彻底丢了（没有补发）；
 *   · 就算排上了，reserved2 模式下模型的纯文本**不会自动发到 QQ**（见 deliverPromptNow：
 *     `command.text` 只在非 reserved2 时自动转发），而旧提示词写的是「直接输出要发的话」
 *     ⇒ 她输出了，但永远发不出去。
 *
 * 所以拆出纯逻辑：什么时候该发（含补发/重试） + 让模型怎么发。桥接只负责定时器和投递。
 */

/** 错过时间点后还能补发的窗口：3 小时（08:00 的问候，11:00 前补发都算今天的）。 */
export const GREETING_GRACE_MS = 3 * 60 * 60 * 1000;
/** 投递失败（DSH 没连上/会话没建起来）后的重试间隔。 */
export const GREETING_RETRY_MS = 10 * 60 * 1000;
/** 补发时不立刻抢跑，留 5 秒给 DSH 事件流。 */
export const GREETING_CATCHUP_DELAY_MS = 5000;
/** 跨天判定用本地日期（与日志里的本地时间一致）。 */
export function localDateKey(at = Date.now()) {
  const d = new Date(at);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** `"8:00"` / `"08:00"` → `{ hh, mm }`；非法值回退到 08:00。 */
export function parseGreetingTime(value, fallback = '08:00') {
  const text = String(value ?? '').trim();
  const m = /^(\d{1,2}):(\d{2})$/.exec(text) || /^(\d{1,2}):(\d{2})$/.exec(fallback);
  if (!m) return { hh: 8, mm: 0, text: '08:00' };
  const hh = Math.max(0, Math.min(23, Number(m[1])));
  const mm = Math.max(0, Math.min(59, Number(m[2])));
  return { hh, mm, text: `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}` };
}

/**
 * 下一次该在什么时候发。
 * @param {{now?:number, hh?:number, mm?:number, sentToday?:boolean, retryDelayMs?:number, graceMs?:number}} options
 * @returns {{fireAt:number, mode:'scheduled'|'catchup'|'retry'|'tomorrow'}}
 */
export function planMorningGreeting({
  now = Date.now(),
  hh = 8,
  mm = 0,
  sentToday = false,
  retryDelayMs = 0,
  graceMs = GREETING_GRACE_MS,
} = {}) {
  const today = new Date(now);
  today.setHours(hh, mm, 0, 0);
  const target = today.getTime();
  const withinGrace = now >= target && now - target <= graceMs;
  // 今天已经发过：只能排明天（别在同一天反复补发）。
  if (sentToday) {
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return { fireAt: tomorrow.getTime(), mode: 'tomorrow' };
  }
  // 失败重试：只在「已经过了今天的点、但还在补发窗口里」时生效，否则回落到正常排程。
  if (retryDelayMs > 0 && withinGrace) {
    return { fireAt: Math.min(now + retryDelayMs, target + graceMs), mode: 'retry' };
  }
  if (target > now) return { fireAt: target, mode: 'scheduled' };
  if (withinGrace) return { fireAt: now + GREETING_CATCHUP_DELAY_MS, mode: 'catchup' };
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return { fireAt: tomorrow.getTime(), mode: 'tomorrow' };
}

export const GREETING_THEMES = [
  '赖床', '早餐吃了什么', '今天的阳光', '楼下的小猫', '昨天做的梦',
  '天气冷不冷', '上课/作业', '刚睡醒的声音', '窗外有什么动静', '今天想去哪玩',
];

/** 从主题池里随机挑一个（测试可传 random 固定值）。 */
export function pickGreetingTheme(random = Math.random, themes = GREETING_THEMES) {
  const list = Array.isArray(themes) && themes.length ? themes : GREETING_THEMES;
  const index = Math.floor(Math.abs(Number(random())) * list.length) % list.length;
  return list[index];
}

/**
 * 早安提示词。
 *
 * 关键区别（这就是 08:00 问候静默失败的第二个原因）：
 *   · reserved2：纯文本**不会**自动发出去，必须让她真的调发送工具；
 *   · 其它模式（chat）：桥接会把本回合的文本自动转发，只要她直接输出。
 * 另外补发时要说明「这是补发的」，免得她以为现在是早上八点。
 */
export function buildMorningGreetingPrompt({
  who = '',
  uin = '',
  time = '08:00',
  theme = '',
  mode = 'chat',
  catchUp = false,
  token = '',
} = {}) {
  const target = String(who || '').trim() || `QQ ${uin}`;
  const lines = [];
  lines.push(catchUp
    ? `【定时早安 · 补发】原定 ${time} 给 ${target}（QQ ${uin}）的早安没有发出去，现在补一次。`
    : `【定时早安】现在是早上 ${time}，请主动给 ${target}（QQ ${uin}）发一句早安。`);
  lines.push(
    '要求：用你自己（人格卡）的口吻，1~2 句，短、可爱；换着花样，别每天都用同一句；'
    + `可以顺带提一句「${theme || '今天的小事'}」这类小事。`,
  );
  if (String(mode) === 'reserved2') {
    lines.push(
      `发送方式：必须真的用工具发出去 —— 调用 qq_send_private_message，参数 userId 填 ${uin}、`
      + `${token ? `token 填 ${token}、` : ''}message 填你要说的那句话，然后再结束回合。`
      + 'reserved2 模式下你的纯文本不会自动发到 QQ，只输出文字等于没发；不带 token 会被拒绝。',
    );
    lines.push('不要 @ 任何人、不要解释、不要提「定时任务」或「补发」，发完就收尾。');
  } else {
    lines.push('直接输出要发的话，不要解释、不要加引号、不要提「定时任务」，也不要 @ 任何人。');
  }
  return lines.join('\n');
}
