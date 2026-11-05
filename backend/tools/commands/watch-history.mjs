#!/usr/bin/env node
/**
 * 看她看过什么（当前角色）。
 *
 *   node bili.mjs watch-history list [--limit 40] [--q 关键词] [--days 7] [--json]
 *
 * 数据来自 bili/watch-history.jsonl（debrief / watch-video 自动写），
 * 旧记录会从 bili-memory.json 补；设置页「观看历史」读的是同一份。
 */
import { readWatchHistory } from '../lib/watch-history.mjs'
import { enrichWatchHistory } from '../lib/watch-actions.mjs'

const argv = process.argv.slice(2)
const sub = argv[0] && !argv[0].startsWith('--') ? argv[0] : 'list'
const args = new Map()
for (let i = sub === argv[0] ? 1 : 0; i < argv.length; i += 1) {
  const a = argv[i]
  if (!a.startsWith('--')) continue
  const next = argv[i + 1]
  args.set(a.slice(2), next && !next.startsWith('--') ? argv[++i] : true)
}
if (sub !== 'list' && sub !== 'history') {
  console.error('usage: watch-history list [--limit 40] [--q 关键词] [--days 7] [--json]')
  process.exit(2)
}
const result = readWatchHistory({
  limit: Number(args.get('limit')) || 40,
  q: String(args.get('q') ?? ''),
  days: Number(args.get('days')) || 0,
})
// 2026-10-23：设置页要显示「她之后做了什么」；CLI 也一起给，方便不重启宿主先验收。
const enriched = enrichWatchHistory(result.items)
if (args.get('json') === true) {
  console.log(JSON.stringify({ ...result, items: enriched.items, actions: enriched.actions }, null, 2))
  process.exit(0)
}
const fmtDur = (s) => {
  const n = Number(s) || 0
  if (!n) return '—'
  return n >= 3600
    ? `${Math.floor(n / 3600)}:${String(Math.floor((n % 3600) / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`
    : `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`
}
const modeText = (x) => x.mode === 'memory' ? '旧记忆' : x.mode === 'full' ? '深看' : x.mode === 'frames' ? '抽帧' : '浅看'
const timeText = (x) => x.unknownDate
  ? '日期未知'
  : x.dateOnly
    ? `${new Date(x.at).toLocaleDateString('zh-CN')}（旧记忆）`
    : new Date(x.at).toLocaleString('zh-CN', { hour12: false })
const actionText = (item) => {
  const list = Array.isArray(item.actions) ? item.actions : []
  if (!list.length) return '仅看了'
  const head = list.slice(0, 3).map((a) => `${a.label}${a.text ? `「${a.text}」` : ''}（${new Date(a.at).toLocaleString('zh-CN', { hour12: false }).slice(5)}）`)
  return head.join(' · ') + (list.length > 3 ? ` · …还有 ${list.length - 3} 条` : '')
}
const a = enriched.actions
console.log(`观看历史：${result.total} 条（今天 ${result.stats.today} · 最近7天 ${result.stats.last7d} · 深看 ${result.stats.deep}）`)
console.log(`操作：评论 ${a.comments}（主评论 ${a.main} · 聚拢 ${a.gather} · 回复 ${a.reply} · 搭话 ${a.ta} · 分享 ${a.share}）· 收藏 ${a.favorite} · 发动态 ${a.dynamic} · 仅看 ${a.watchedOnly} 条`)
for (const item of enriched.items) {
  const atText = timeText(item)
  const score = item.score == null ? '' : ` ${item.score}/20`
  console.log(`  ${atText}  [${modeText(item)}]${score}  ${item.bvid || '—'}  ${String(item.title || '').slice(0, 60)}${item.up ? `  · ${item.up}` : ''}${item.duration ? `  · ${fmtDur(item.duration)}` : ''}`)
  console.log(`      操作: ${actionText(item)}`)
}
if (!result.items.length) console.log('  （还没有记录；下一次 debrief / watch-video 会自动记）')
console.log(`数据文件：${result.file}`)
