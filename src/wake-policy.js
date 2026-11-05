/**
 * 唤醒“硬直接”策略：只有真正被点名的唤醒，才允许绕过每日唤醒配额/最小间隔。
 *
 * 背景（2026-10-31 一小时样本）：
 *   · question 触发把普通群聊里的“你…吗”当成在问 AI；
 *   · 这类 reason 被当成 direct，绕过 maxWakesPerDay；
 *   · 一个群一小时 75 次唤醒，65 次 question，只有 6 次发送。
 *
 * 因此：
 *   · @ / 名字 / 拍一拍 / 私聊 / 管理员：可绕过；
 *   · question 只作为普通唤醒，不享受 direct 绕过；
 *   · unread 里的严格 direct 只认 owner / 引用自己 / 真正 @ 或叫到名字，
 *     不用宽泛的“你+疑问”启发式。
 */
const HARD_DIRECT_REASONS = new Set(['atMention', 'nameMention', 'poke', 'private', 'admin']);

export function isHardDirectWakeReason(reason) {
  const base = String(reason ?? '').split(':')[0];
  return HARD_DIRECT_REASONS.has(base);
}

/** unread 里是否存在“真的在叫 AI”的消息（不含宽泛的 you-question）。 */
export function hasStrictDirectUnread(unread, { selfNickname = '', includeOwner = false } = {}) {
  const name = String(selfNickname ?? '').toLowerCase();
  for (const m of Array.isArray(unread) ? unread : []) {
    if (!m || m.isSelf) continue;
    if (includeOwner && m.isOwner) return true;
    if (m.quoteTargetIsSelf) return true;
    const text = String(m.plain ?? m.text ?? '').toLowerCase();
    if (!text) continue;
    // 只认真正的 @；裸昵称在群聊里经常只是聊天内容，不能用来绕过每日配额。
    if (name && text.includes(`@${name}`)) return true;
  }
  return false;
}
