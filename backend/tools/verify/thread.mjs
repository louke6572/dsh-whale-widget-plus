// Dump the whole thread under our root comment: who said what, and how it nests.
const AID = process.argv[2]
const BVID = process.argv[3]
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
// ⚠️ 楼中楼一页只给 20 条：只读第 1 页会**静默漏报**（超过 20 条时看不见）→ 翻页取全（2026-10-18 修）
async function fetchAll() {
  const all = []
  let root = null
  for (let pn = 1; pn <= 10; pn += 1) {
    const r = await fetch(`https://api.bilibili.com/x/v2/reply/reply?type=1&oid=${AID}&root=${process.argv[4]}&pn=${pn}&ps=20`, {
      headers: { 'user-agent': UA, referer: `https://www.bilibili.com/video/${BVID}/`, 'accept-language': 'zh-CN,zh;q=0.9' },
    })
    const j = await r.json()
    if (j.code !== 0) return { code: j.code, message: j.message, data: { root, replies: all } }
    const rs = j.data?.replies ?? []
    root = root ?? j.data?.root
    all.push(...rs)
    if (rs.length < 20) break          // 不满一页 = 到底了
  }
  return { code: 0, data: { root, replies: all } }
}
const d = await fetchAll()
if (d.code !== 0) { console.log(`code=${d.code} message=${d.message}`); process.exit(0) }
const root = d.data?.root
console.log('=== 线程根（顶层评论） ===')
console.log(`  ${root.member.uname} (mid ${root.member.mid})  rpid=${root.rpid}  rcount=${root.rcount}`)
console.log(`  ${root.content.message}`)
const members = root.content?.members ?? []
if (members.length) console.log(`  @到: ${members.map((m) => `${m.uname}(mid ${m.mid})`).join(', ')}`)
console.log('')
console.log(`=== 楼中楼（${(d.data?.replies ?? []).length} 条） ===`)
for (const c of d.data?.replies ?? []) {
  const isMine = c.member.mid === root.member.mid
  console.log(`  [${isMine ? '小号' : '主号'}] ${c.member.uname}  rpid=${c.rpid}  parent=${c.parent}  ${new Date(c.ctime * 1000).toLocaleTimeString('zh-CN')}`)
  console.log(`       ${c.content.message}`)
  const m2 = c.content?.members ?? []
  if (m2.length) console.log(`       @到: ${m2.map((x) => `${x.uname}(mid ${x.mid})`).join(', ')}`)
}
console.log('')
console.log(`线程链接: https://www.bilibili.com/video/${BVID}/#reply${root.rpid}`)
