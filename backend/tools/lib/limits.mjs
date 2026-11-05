// 四本账的硬闸门 + 冷却 —— 2026-10-22 从 free-gate.mjs 抽出来，改成可配置。
//
// 为什么抽出来：以前 FREE_LIMITS 写死在代码里（"要改就改这里"），设置页只能看不能改；
//   主人要求「额度改成可编辑」→ 唯一真相改成 bili.config.json 的 `limits` 段。
//   本文件只负责：默认值、范围收敛、把配置转成运行期对象。
//
// ⚠️ 这些是"防刷屏"的硬上限，不是建议值：改大之前先想清楚 B站 风控。
//   · 0 = 不限制（关闭该上限）；globalMin=0 表示不冷却；minePerPerson=0 表示不限每人
//   · 代码不信任配置文件：任何越界值都会被 clamp 回 [min, max]
export const LIMIT_RULES = {
  daily:          { def: 30,  min: 0, max: 200,   label: '普通评论 / 天' },
  replyDaily:     { def: 50,  min: 0, max: 500,   label: '回找我的人 / 天' },
  taDaily:        { def: 15,  min: 0, max: 200,   label: '主动搭话 / 天' },
  mineDaily:      { def: 10,  min: 0, max: 100,   label: '动态回复 / 类 / 天' },
  minePerPerson:  { def: 1,   min: 0, max: 20,    label: '动态回复 / 人 / 类 / 天' },
  perUpMin:       { def: 10,  min: 0, max: 1440,  label: '同一 UP 冷却（分钟）' },
  perVideoMin:    { def: 60,  min: 0, max: 1440,  label: '同一视频冷却（分钟）' },
  perThreadMin:   { def: 1440, min: 0, max: 10080, label: '同一条评论冷却（分钟）' },
  globalMin:      { def: 2,   min: 0, max: 120,   label: '任意两条发言间隔（分钟）' },
}

function clampInt(value, fallback, min, max) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.round(Math.min(max, Math.max(min, n)))
}

/** 默认值（与 2026-10-21 的硬编码完全一致，升级后行为不变）。 */
export const DEFAULT_LIMITS = Object.freeze(
  Object.fromEntries(Object.entries(LIMIT_RULES).map(([key, rule]) => [key, rule.def])),
)

/**
 * 把用户配置收敛成运行期额度。
 * @param {Record<string, unknown>|undefined|null} input bili.config.json 的 limits 段
 */
export function normalizeLimits(input) {
  const src = input && typeof input === 'object' && !Array.isArray(input) ? input : {}
  const out = {}
  for (const [key, rule] of Object.entries(LIMIT_RULES)) {
    out[key] = clampInt(src[key], rule.def, rule.min, rule.max)
  }
  return out
}

/** 从合并后的配置里取实时额度（config() 已做 mtime 缓存，改文件下一轮生效）。 */
export function freeLimits(cfg) {
  return normalizeLimits(cfg?.limits)
}
