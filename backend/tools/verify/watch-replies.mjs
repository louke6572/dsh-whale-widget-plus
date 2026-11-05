// 盯一条评论的楼中楼，出现新回复就退出并打印 REPLY_HIT（供 agent 醒来后回复）。
// 公开接口，不需要凭据。
//
//   node watch-replies.mjs --aid <aid> --root <rpid> --bvid <BV> [--minutes 60] [--uid <uid>] [--interval 15]
//
// 退出输出：
//   REPLY_HIT uid=.. uname=.. rpid=.. parent=.. text=..
//   REPLY_TIMEOUT
const argv = process.argv.slice(2)
const args = new Map()
for (let i = 0; i < argv.length; i += 1) {
  const a = argv[i]
  if (a.startsWith('--')) args.set(a.slice(2), argv[i + 1]?.startsWith('--') ? true : argv[++i] ?? true)
}
const AID = String(args.get('aid') ?? '')
const ROOT = String(args.get('root') ?? '')
const BVID = String(args.get('bvid') ?? '')
const minutes = Number(args.get('minutes') ?? 60)
const interval = Number(args.get('interval') ?? 15) * 1000
const onlyUid = args.get('uid') ? String(args.get('uid')) : ''
if (!AID || !ROOT) { console.error('需要 --aid <aid> --root <rpid>（--bvid 用于 referer，建议也给）'); process.exit(2) }

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
// ⚠️ 楼中楼一页只给 20 条：只读第 1 页会**静默漏报**（超过 20 条时新回复看不见）→ 翻页取全（2026-10-18 修）
const BASE = `https://api.bilibili.com/x/v2/reply/reply?type=1&oid=${AID}&root=${ROOT}&ps=20`
const MAX_PAGES = 10
const stamp = () => new Date().toLocaleTimeString('zh-CN')

async function snapshot() {
  const all = []
  let root = null
  for (let pn = 1; pn <= MAX_PAGES; pn += 1) {
    const r = await fetch(`${BASE}&pn=${pn}`, { headers: { 'user-agent': UA, referer: `https://www.bilibili.com/video/${BVID}/`, 'accept-language': 'zh-CN,zh;q=0.9' } })
    const d = await r.json()
    if (d.code !== 0) return { code: d.code, message: d.message, replies: all }
    const rs = d.data?.replies ?? []
    root = root ?? d.data?.root
    all.push(...rs)
    if (rs.length < 20) break          // 不满一页 = 到底了
  }
  return { code: 0, replies: all, rootAuthor: root?.member?.uname, rcount: root?.rcount }
}

const first = await snapshot()
const baseline = new Set((first.replies ?? []).map((c) => String(c.rpid)))
console.log(`[${stamp()}] 基线：code=${first.code} 根评论作者=${first.rootAuthor ?? '-'} 回复数=${first.rcount ?? '-'} 已有 ${baseline.size} 条`)
console.log(`（监听评论 rpid=${ROOT}，窗口 ${minutes} 分钟，每 ${interval / 1000}s 一次${onlyUid ? `，只认 uid=${onlyUid}` : ''}）`)

const deadline = Date.now() + minutes * 60 * 1000
let ticks = 0
while (Date.now() < deadline) {
  await new Promise((r) => setTimeout(r, interval))
  ticks += 1
  try {
    const s = await snapshot()
    if (s.code !== 0) { console.log(`[${stamp()}] code=${s.code} ${s.message}`); continue }
    const fresh = (s.replies ?? []).filter((c) => !baseline.has(String(c.rpid)) && (!onlyUid || String(c.member?.mid) === onlyUid))
    if (fresh.length) {
      console.log(`[${stamp()}] ★ 收到新回复（第 ${ticks} 次轮询）★`)
      for (const c of fresh) {
        console.log(`REPLY_HIT uid=${c.member?.mid} uname=${c.member?.uname} rpid=${c.rpid} parent=${c.parent} time=${new Date(c.ctime * 1000).toLocaleString('zh-CN')} text=${c.content?.message}`)
      }
      process.exit(0)
    }
    if (ticks % 8 === 0) console.log(`[${stamp()}] 还在等…（已轮询 ${ticks} 次，当前 ${(s.replies ?? []).length} 条回复）`)
  } catch (err) {
    console.log(`[poll ${ticks}] 网络错误: ${err.cause?.code ?? err.message}`)
  }
}
console.log(`[${stamp()}] REPLY_TIMEOUT  ${minutes} 分钟内没有等到新回复`)
process.exit(0)
