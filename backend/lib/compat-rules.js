/**
 * 已知第三方插件规则（只读）。
 *
 * 这里只收集「包名/版本范围 → 它会注册什么、是否会接管上下文」的已知事实。
 * 新插件优先让它自己声明 surfcore.compat.json；没有声明时才落在这里。
 *
 * 注意：规则不是“白名单”。命中规则只代表我们知道它的工具/能力，
 * 是否允许仍由 qq-tool-restrict + 用户策略决定。
 */

export const CONTEXT_TOOL_NAMES = Object.freeze([
  'compress',
  'decompress',
  'search_context',
  'acp_status',
  'acp_cache',
])

export const KNOWN_BUNDLE_RULES = Object.freeze([
  {
    id: 'billion-context',
    match: (name) => name === 'billion-context' || name.endsWith('/billion-context'),
    title: 'billion-context（第三方上下文压缩）',
    tools: CONTEXT_TOOL_NAMES,
    capabilities: ['context-compression'],
    contextProvider: true,
    upstream: 'ranxianglei/billion-context',
    note: '它会把 compress/decompress/search_context/acp_status/acp_cache 注入全局工具层，并可能关闭 DSH 自带 compaction-basic 的 auto。',
  },
  {
    id: 'dsh-ops',
    match: (name) => name === 'dsh-ops' || name.endsWith('/dsh-ops'),
    title: 'dsh-ops（本地 shell/文件工具）',
    tools: ['bash', 'read', 'write', 'edit', 'glob', 'grep'],
    capabilities: ['local-execution'],
    localOnly: true,
    note: '本地 GUI 需要它；QQ 预设会隐藏/拒绝这些本地工具，这是预期边界，不是故障。',
  },
])

export function ruleForPackage(name) {
  const n = String(name ?? '')
  return KNOWN_BUNDLE_RULES.find((rule) => rule.match(n)) ?? null
}
