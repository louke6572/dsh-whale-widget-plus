// 四类动态的"选题信号"判定（从 daily.mjs 抽出来，便于单测 / 改门槛）。
//
// 为什么抽出来：这些正则会误伤（2026-10-22「《凡人修仙传动画》196 逐帧解析」
//   标题里只有「动画」「逐帧」，没有「番剧/动漫」→ 被当成非动漫拦掉）。
//   抽出来后至少可以单测，改门槛不用动主流程。
export const AI_RE = /(^|[^a-z])(ai|a\.i\.)([^a-z]|$)|AI(绘画|动画|视频|配音|生成|二创|翻唱|建模|短剧|制作)|生成式|绘画|sora|runway|可灵|即梦|midjourney|stable\s*diffusion/i
// 2026-10-22 补：国漫逐帧解析常写成「《凡人修仙传动画》196逐帧解析」，标题里只有「动画」「逐帧」，
//   没有「番剧」「动漫」，会被误判成"没有动漫信号"（BV1mFJq6iEUX 就是这样被拦的）
export const ANIME_RE = /(MAD|mad|混剪|新番|导视|番剧|动漫|二次元|动画|逐帧|\bOP\b|\bED\b|anime|原创动画)/
// 2026-10-21 补：红警 / RTS 这类老游戏实况，标题里只有游戏名和「2v3」「翻盘」，没有「游戏」「实况」字样，
//   会被误判成"没有游戏区信号"（BV1Menj62Eig 就是这样被拦的）
export const GAMING_RE = /(游戏|实况|解说|攻略|评测|整活|通关|联机|开黑|单机|手游|端游|红警|RTS|电竞|对局|2v2|2v3|3v3|1v1)/

/** 这条视频的标题/简介/分区里有没有对应类别的信号（best 不检查）。 */
export function hasKindSignal(kind, text) {
  const value = String(text ?? '')
  if (kind === 'game') return AI_RE.test(value)
  if (kind === 'anime') return ANIME_RE.test(value)
  if (kind === 'gaming') return GAMING_RE.test(value)
  return true
}
