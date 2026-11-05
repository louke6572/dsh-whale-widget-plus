// 待审队列：疑似攻击 / 阴阳怪气的评论（2026-10-21 管理员定）
//
//   node bili.mjs attack add --oid <aid|comment_id> --root <rpid> --parent <rpid> --who "昵称" \
//        --text "对方原话" [--mid <uid>] [--type 1|11] [--bvid BV] [--suggest "我想回的话"]
//   node bili.mjs attack list [--date 2026-10-21] [--status pending]
//   node bili.mjs attack show <序号>
//   node bili.mjs attack approve <序号>     ← 管理员批准之后才允许回
//   node bili.mjs attack reject <序号>      ← 不批 = 永远不理
//   node bili.mjs attack nudge              ← 给调度器用：有 pending 就输出摘要
//
// 约定：**记录不占额度**（根本没发出去）；回复前 comment.mjs 会查这里，pending 的一律拦 ✗
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { add, listByDate, findBySeq, setStatus, pendingCount, today } from '../lib/attacks.mjs'

const argv = process.argv.slice(2)
const cmd = argv[0]
const opt = {}
const pos = []
for (let i = 1; i < argv.length; i += 1) {
  const a = argv[i]
  if (a.startsWith('--')) {
    const v = argv[i + 1]
    if (v === undefined || v.startsWith('--')) opt[a.slice(2)] = true
    else { opt[a.slice(2)] = v; i += 1 }
  } else pos.push(a)
}

const STATUS_CN = { pending: '待审', approved: '已批准', rejected: '已驳回', replied: '已回' }
const line = (x) => `#${x.seq} [${STATUS_CN[x.status] ?? x.status}] ${x.who || '?'}：${String(x.text).replace(/\s+/g, ' ').slice(0, 80)}`

if (cmd === 'add') {
  const oid = String(opt.oid ?? '')
  const parent = String(opt.parent ?? '')
  const text = String(opt.text ?? '')
  if (!oid || !parent || !text) {
    console.error('用法: attack add --oid <aid|comment_id> --root <rpid> --parent <rpid> --who "昵称" --text "对方原话" [--mid] [--type 1|11] [--bvid BV] [--suggest "…"]')
    process.exit(2)
  }
  const { seq, item } = add({
    who: opt.who, mid: opt.mid, oid, type: opt.type ?? '1',
    root: opt.root, parent, bvid: opt.bvid, text, suggest: opt.suggest,
  })
  console.log(`✓ 记下了 #${seq}（今天第 ${pendingCount()} 条待审）`)
  console.log(`  ${item.who || '?'}：${item.text.slice(0, 80)}`)
  console.log('  → **先别回**，等管理员晚上审；批准了再用 `attack show ' + seq + '` 拿坐标回复 ✓')
  // 立刻私信报备给管理员（带序号，方便晚上集中审）
  try {
    const msg = `【待审 #${seq}】${item.who || '有人'} 阴阳/攻击 wo：\n${item.text.slice(0, 120)}\n位置：${item.bvid ? 'BV:' + item.bvid : 'oid:' + item.oid}\n（晚上回来说"批 #${seq}"或"拒 #${seq}"）`
    execFileSync(process.execPath, [path.join(path.dirname(fileURLToPath(import.meta.url)), 'notify.mjs'), msg, '--title', `待审 #${seq}`], { stdio: 'inherit' })
  } catch (e) {
    console.log(`  [通知] 报备失败（不影响记录）：${String(e.message).slice(0, 100)}`)
  }
  process.exit(0)
}

if (cmd === 'list') {
  const date = String(opt.date ?? today())
  const status = String(opt.status ?? '')
  const items = listByDate(date, status)
  console.log(`${date} 的待审队列（${items.length} 条${status ? ' · ' + status : ''}）：`)
  if (!items.length) console.log('  （空）')
  for (const x of items) {
    console.log('  ' + line(x))
    if (x.suggest) console.log(`      想回：${x.suggest.slice(0, 60)}`)
  }
  process.exit(0)
}

if (cmd === 'show') {
  const seq = Number(pos[0])
  const it = findBySeq(seq)
  if (!it) { console.error(`✗ 今天没有 #${seq}`); process.exit(1) }
  console.log(`#${it.seq} [${STATUS_CN[it.status] ?? it.status}]`)
  console.log(`  谁：${it.who || '?'}（mid ${it.mid || '?'}）`)
  console.log(`  说：${it.text}`)
  if (it.suggest) console.log(`  想回：${it.suggest}`)
  console.log(`  坐标：type=${it.type} oid=${it.oid} root=${it.root} parent=${it.parent}${it.bvid ? ' bvid=' + it.bvid : ''}`)
  if (it.status === 'approved') {
    console.log(`\n  管理员已批准 ✓ 可以回：`)
    console.log(`  comment --type ${it.type} --oid ${it.oid} --root ${it.root} --parent ${it.parent}${it.bvid ? ' --bvid ' + it.bvid : ''} --message "…" --auto --dry → --go`)
  } else if (it.status === 'pending') {
    console.log('\n  ⏳ 还没批 —— **现在不能回** ✗')
  } else {
    console.log('\n  🚫 已驳回/已回 —— 不用再动 ✓')
  }
  process.exit(0)
}

if (cmd === 'approve' || cmd === 'reject') {
  const seq = Number(pos[0])
  if (!Number.isFinite(seq)) { console.error(`用法: attack ${cmd} <序号>`); process.exit(2) }
  const it = setStatus(seq, cmd === 'approve' ? 'approved' : 'rejected')
  if (!it) { console.error(`✗ 今天没有 #${seq}`); process.exit(1) }
  console.log(`✓ #${seq} 已标记为「${STATUS_CN[it.status]}」`)
  if (cmd === 'approve') console.log(`  现在可以回了（坐标见 attack show ${seq}），也可以让 wo 自己回 ✓`)
  process.exit(0)
}

if (cmd === 'nudge') {
  const n = pendingCount()
  if (!n) { console.log('no-pending'); process.exit(1) }
  const items = listByDate(today(), 'pending')
  console.log(`pending=${n}`)
  for (const x of items) console.log(line(x))
  process.exit(0)
}

console.error('用法: attack add|list|show|approve|reject|nudge （见 bili.mjs attack）')
process.exit(2)
