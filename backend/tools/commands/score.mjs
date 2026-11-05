// 记一次「今天这条视频值几分」（2026-10-21 加）
//
// 用途：每天那条动态必须写**当天评分最高的视频**。所以每深读一条就记一次分，
//   晚上（或当轮）取最高分的来写。**没到 13 分也要记** —— 动态不看阈值，只看排名。
//
//   node bili.mjs score <BV> --score 16 [--reason "为什么给这个分"] [--title "视频标题"]
//   node bili.mjs score --today     看今天评过哪些（从高到低）
//   node bili.mjs score --best      只看最高分那条
import { recordScore, todayScores, bestToday } from '../lib/scores.mjs'

const argv = process.argv.slice(2)
const opt = {}
const pos = []
for (let i = 0; i < argv.length; i += 1) {
  const a = argv[i]
  if (a.startsWith('--')) {
    const v = argv[i + 1]
    if (v === undefined || v.startsWith('--')) opt[a.slice(2)] = true
    else { opt[a.slice(2)] = v; i += 1 }
  } else pos.push(a)
}

const line = (x) => `  ${String(x.score).padStart(2)}/20  ${x.bv}  ${x.title ? x.title.slice(0, 40) + '  ' : ''}${x.reason ? '· ' + x.reason.slice(0, 40) : ''}`

if (opt.today || opt.best) {
  const list = todayScores()
  if (!list.length) { console.log('今天还没评过分（用 score <BV> --score N 记一条）'); process.exit(1) }
  console.log(`今天评过的（${list.length} 条，从高到低）：`)
  for (const x of list) console.log(line(x))
  if (opt.best) {
    const b = bestToday()
    console.log(`\n最高分：${b.bv}（${b.score}/20）`)
    console.log(`BV:${b.bv}`)
  }
  process.exit(0)
}

const bv = String(pos[0] ?? '').trim()
const score = Number(opt.score)
if (!/^BV[0-9A-Za-z]{10}$/.test(bv)) { console.error('用法: score <BV号> --score 0-20 [--reason "…"] [--title "…"]'); process.exit(2) }
if (!Number.isFinite(score) || score < 0 || score > 20) { console.error('✗ --score 必须是 0~20 的数字（每项 0-4，满 20）'); process.exit(2) }

const list = recordScore({ bv, score, reason: String(opt.reason ?? ''), title: String(opt.title ?? '') })
const best = [...list].sort((a, b) => Number(b.score) - Number(a.score))[0]
console.log(`✓ 记下了：${bv} → ${score}/20`)
console.log(`  今天最高分：${best.bv}（${best.score}/20）${best.bv === bv ? '  ← 就是这条' : ''}`)
