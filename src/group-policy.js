/**
 * 群分层（Group Policy）：小群保留积极唤醒，大群/高活跃群收紧。
 *
 * 判定优先级：
 *   1. 用户手动覆盖（auto/small/large）
 *   2. 群成员数 >= largeThreshold
 *   3. 近 10 分钟非自己消息数 >= activeMessageThreshold
 *   4. 默认小群（未知群不误伤）
 *
 * 只决定“唤醒策略”，不负责拉群成员；成员数由 bridge 通过 OneBot 缓存。
 */
export const GROUP_POLICY_VERSION = 1;

export const DEFAULT_GROUP_POLICY = Object.freeze({
  version: GROUP_POLICY_VERSION,
  enabled: true,
  largeThreshold: 200,
  activeWindowMs: 10 * 60 * 1000,
  activeMessageThreshold: 60,
  overrides: Object.freeze({}),
});

function clampInt(value, fallback, min, max) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function normalizeGroupPolicy(raw = {}) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const overrides = {};
  for (const [key, value] of Object.entries(src.overrides && typeof src.overrides === 'object' ? src.overrides : {})) {
    if (!/^group:\d+$/.test(key)) continue;
    if (value === 'small' || value === 'large' || value === 'auto') overrides[key] = value;
  }
  return {
    version: GROUP_POLICY_VERSION,
    enabled: src.enabled !== false,
    largeThreshold: clampInt(src.largeThreshold, DEFAULT_GROUP_POLICY.largeThreshold, 20, 5000),
    activeWindowMs: clampInt(src.activeWindowMs, DEFAULT_GROUP_POLICY.activeWindowMs, 60_000, 60 * 60 * 1000),
    activeMessageThreshold: clampInt(src.activeMessageThreshold, DEFAULT_GROUP_POLICY.activeMessageThreshold, 5, 5000),
    overrides,
  };
}

/**
 * @param {object} opts
 * @param {string} opts.key
 * @param {number} [opts.memberCount]
 * @param {number} [opts.activityCount] 近 activeWindowMs 的非自己消息数
 * @param {object} opts.policy
 */
export function groupTier({ key = '', memberCount = 0, activityCount = 0, policy = DEFAULT_GROUP_POLICY } = {}) {
  const p = normalizeGroupPolicy(policy);
  if (!p.enabled) return { tier: 'small', source: 'disabled', large: false, memberCount, activityCount };
  const override = p.overrides?.[String(key)] || 'auto';
  if (override === 'small' || override === 'large') {
    return { tier: override, source: 'override', large: override === 'large', memberCount, activityCount };
  }
  if (Number(memberCount) >= p.largeThreshold) {
    return { tier: 'large', source: 'memberCount', large: true, memberCount, activityCount };
  }
  if (Number(activityCount) >= p.activeMessageThreshold) {
    return { tier: 'large', source: 'activity', large: true, memberCount, activityCount };
  }
  return { tier: 'small', source: 'default', large: false, memberCount, activityCount };
}

/** 大群只保留真正点名；小群不调用此函数（保留原策略）。 */
export function shouldSkipTriggerForTier(reason, tier) {
  if (tier !== 'large') return false;
  const base = String(reason ?? '').split(':')[0];
  return ['question', 'keyword', 'probability', 'anyMessage'].includes(base);
}
