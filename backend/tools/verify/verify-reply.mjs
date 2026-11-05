// 复核一条**楼中楼回复**：自动翻页找 rpid，报出「带 cookie 的 state」和「匿名是否可见」。
// 用途：楼中楼会分页（20 条/页），只查第 1 页会误判成"被吞"。
//
// 用法: node verify-reply.mjs <type> <oid> <root> <rpid> [referer]
//   type: 1=视频  11=动态
//   ⚠️ 动态（type=11）的评论列表要登录，匿名那半边必然查不到，只看 state。
import { accountBili, biliState, biliStateDir } from '../lib/state-paths.mjs'
import fs from 'node:fs'
import path from 'node:path'

const [type, oid, root, rpid, refererArg] = process.argv.slice(2)
if (!type || !oid || !root || !rpid) {
  console.error('用法: node verify-reply.mjs <type> <oid> <root> <rpid> [referer]')
  process.exit(2)
}
const referer = refererArg && refererArg !== '' ? refererArg : 'https://www.bilibili.com/'
const cred = JSON.parse(fs.readFileSync(accountBili('credentials.json'), 'utf8'))
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
const anon = { 'user-agent': UA, referer }
const auth = { ...anon, cookie: `SESSDATA=${cred.sessdata}; bili_jct=${cred.bili_jct}; buvid3=${cred.buvid3}` }

async function find(headers) {
  for (let pn = 1; pn <= 6; pn += 1) {
    const u = `https://api.bilibili.com/x/v2/reply/reply?type=${type}&oid=${oid}&root=${root}&ps=20&pn=${pn}`
    let j
    try { j = await (await fetch(u, { headers })).json() } catch { return null }
    if (j.code !== 0) return { code: j.code, message: j.message }
    const reps = j.data?.replies ?? []
    const hit = reps.find((r) => String(r.rpid) === rpid)
    if (hit) return { pn, hit }
    if (reps.length < 20) break   // 最后一页了
  }
  return null
}

const a = await find(auth)
if (!a) {
  console.log(`[带cookie] 翻到最后一页也没找到 rpid=${rpid} → 可能已被删`)
} else if (a.code !== undefined) {
  console.log(`[带cookie] code=${a.code} ${a.message}`)
} else {
  console.log(`[带cookie] 第 ${a.pn} 页找到  state=${a.hit.state}（0=正常公开，17=仅自己可见/审核中）`)
  console.log(`           ${a.hit.member?.uname}: ${String(a.hit.content?.message ?? '').slice(0, 60)}`)
}

let b = null
if (String(type) === '11') {
  console.log('[匿名] 跳过：type=11 的评论列表要登录（见 NOTES 9.8）')
} else {
  b = await find(anon)
  if (!b) console.log(`[匿名] 翻到最后一页也没找到 → 公开看不到（如 state=0 却查不到，多半是翻页/缓存，过会儿再试）`)
  else if (b.code !== undefined) console.log(`[匿名] code=${b.code} ${b.message}`)
  else console.log(`[匿名] 第 ${b.pn} 页可见  state=${b.hit.state}`)
}

const ok = a && a.hit && a.hit.state === 0 && (String(type) === '11' || (b && b.hit))
console.log(`\n=== 结论：${ok ? '✅ 真公开' : (a && a.hit && a.hit.state !== 0 ? '⚠️ 被吞（state≠0）' : '❓ 存疑，需人工确认')} ===`)
