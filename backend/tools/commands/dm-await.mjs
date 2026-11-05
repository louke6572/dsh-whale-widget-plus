// 私信监听 —— 2026-10-20 改：**不只认主人了**
//   默认（--owner，老行为）：只在【主人那个会话】有新消息时命中
//   --any（新）：谁给她发私信都命中（陌生人 / 粉丝 / 主人），一条都不漏
//     · 只认"对方最后说的那句"——她自己最后发言的会话不算"有人找她" ✓
//     · 跳过系统/官方会话（talker_id < 1000，比如 哔哩哔哩 官方号）✗
//   用法:
//     node dm-await.mjs --baseline [--any]        把当前状态记为"已读"，从现在起只认新消息
//     node dm-await.mjs --once [--json] [--any]   轮询一次（命中打印 DM_HIT / JSON）
import { accountBili, biliState, biliStateDir } from '../lib/state-paths.mjs'
import fs from 'node:fs'
import path from 'node:path'
import { config } from '../lib/config.mjs'

const argv = process.argv.slice(2)
const opt = {}
for (let i = 0; i < argv.length; i += 1) {
  if (argv[i].startsWith('--')) {
    const v = argv[i + 1]
    if (v === undefined || v.startsWith('--')) opt[argv[i].slice(2)] = true
    else { opt[argv[i].slice(2)] = v; i += 1 }
  }
}
const BASE = !!opt.baseline
const ONCE = !!opt.once || BASE
const JSONOUT = !!opt.json
const ANY = !!opt.any

const U = process.env.USERPROFILE || process.env.HOME || '/'
const STATE = biliState('dm-await-state.json')
const c = JSON.parse(fs.readFileSync(accountBili('credentials.json'), 'utf8'))
const cfg = config()
const OWNER = String(cfg.owner?.mid ?? '').trim()
const OWNER_NAME = String(cfg.owner?.name ?? '主人')
const SELF = String(cfg.self?.mid ?? '').trim()
if (!OWNER) { console.error('✗ 配置里 owner.mid 为空'); process.exit(2) }

const H = {
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  referer: 'https://www.bilibili.com/',
  cookie: `SESSDATA=${c.sessdata}; bili_jct=${c.bili_jct}; buvid3=${c.buvid3}`,
}
const loadState = () => { try { return JSON.parse(fs.readFileSync(STATE, 'utf8')) } catch { return {} } }
const saveState = (o) => { fs.mkdirSync(path.dirname(STATE), { recursive: true }); fs.writeFileSync(STATE, JSON.stringify(o, null, 2) + '\n') }
const parsed = (content) => {
  // 私信内容可能是 {"content":"…"} 或纯文本
  try { const j = JSON.parse(String(content)); return String(j.content ?? j.text ?? content) } catch { return String(content ?? '') }
}

async function fetchSessions() {
  const u = 'https://api.vc.bilibili.com/session_svr/v1/session_svr/get_sessions?session_type=1&group_id=0&count=50&mobi_app=web'
  const r = await fetch(u, { headers: H })
  const j = await r.json().catch(() => ({}))
  if (j.code !== 0) return { ok: false, why: `get_sessions code=${j.code} ${j.message ?? ''}` }
  return { ok: true, list: j.data?.session_list ?? [] }
}

const st0 = loadState()
const seenMap = (st0.seen && typeof st0.seen === 'object') ? { ...st0.seen } : {}
// 第一次跑 --any（老状态只有 lastSeen）→ 先把当前所有会话当基线，别把历史私信倒一遍 ✗
const FIRST_ANY = !('seen' in st0)

if (ANY) {
  const r = await fetchSessions()
  if (!r.ok) { console.error(`✗ ${r.why}`); process.exit(3) }
  const now = Math.floor(Date.now() / 1000)
  const items = []
  for (const s of r.list) {
    const talker = String(s.talker_id ?? '')
    const last = s.last_msg ?? {}
    const ts = Number(last.timestamp ?? 0)
    const sender = String(last.sender_uid ?? '')
    if (!talker || talker === SELF) continue
    if (Number(talker) < 1000) continue                 // 系统 / 官方号会话：不当"人"处理 ✗
    if (sender === SELF) { if (ts > Number(seenMap[talker] ?? 0)) seenMap[talker] = ts; continue }  // 最后一句是她自己说的 → 不是在找她
    if (ts <= Number(seenMap[talker] ?? 0)) continue
    items.push({
      mid: talker,
      name: String(s.account_info?.name ?? s.talker_name ?? ''),
      text: parsed(last.content),
      ts,
      unread: Number(s.unread_count ?? 0),
      isOwner: talker === OWNER,
    })
  }
  if (BASE) {
    for (const it of items) seenMap[it.mid] = it.ts
    for (const s of r.list) {
      const t = String(s.talker_id ?? '')
      const ts = Number(s.last_msg?.timestamp ?? 0)
      if (t && ts > Number(seenMap[t] ?? 0)) seenMap[t] = ts
    }
    saveState({ seen: seenMap, at: new Date().toISOString() })
    console.log(`已把当前私信状态标记为已读（${Object.keys(seenMap).length} 个会话）✓ 从现在起只认新消息`)
    process.exit(0)
  }
  items.sort((a, b) => a.ts - b.ts)
  if (FIRST_ANY) {
    // 首次：所有会话（含她最后发言的）全部记成基线
    for (const s of r.list) {
      const t = String(s.talker_id ?? '')
      const ts = Number(s.last_msg?.timestamp ?? 0)
      if (t && ts > Number(seenMap[t] ?? 0)) seenMap[t] = ts
    }
    saveState({ seen: seenMap, at: new Date().toISOString() })
  }
  if (items.length && !FIRST_ANY) {
    for (const it of items) seenMap[it.mid] = it.ts
    saveState({ seen: seenMap, seenAt: now, at: new Date().toISOString() })
    if (JSONOUT) console.log(JSON.stringify({ hit: true, items }))
    else for (const it of items) console.log(`DM_HIT mid=${it.mid} name=${it.name} ts=${it.ts} text=${it.text.replace(/\n/g, ' ').slice(0, 200)}`)
    process.exit(0)
  }
  if (JSONOUT) console.log(JSON.stringify({ hit: false, items: [], baseline: FIRST_ANY }))
  else if (!ONCE) console.log(FIRST_ANY ? '首次运行：已把现有会话记为基线 ✓' : '无新私信')
  process.exit(1)
}

// ── 老行为：只认主人（设置页「私信监听（只认主人）」= 开）──────────────────────
async function poll() {
  const r = await fetchSessions()
  if (!r.ok) return { ok: false, why: r.why }
  const mine = r.list.find((s) => String(s.talker_id) === OWNER)
  if (!mine) return { ok: true, hit: false, why: '没找到主人的会话' }
  const last = mine.last_msg ?? {}
  const ts = Number(last.timestamp ?? 0)
  const text = parsed(last.content)
  const sender = Number(last.sender_uid ?? 0)
  const fromOwner = String(sender) === OWNER      // 只有主人发的才算
  return { ok: true, ts, text, fromOwner, unread: Number(mine.unread_count ?? 0) }
}

if (BASE) {
  const r = await poll()
  if (!r.ok) { console.error(`✗ ${r.why}`); process.exit(3) }
  saveState({ ...st0, lastSeen: r.ts || 0, at: new Date().toISOString() })
  console.log(`已把当前私信状态标记为已读（lastSeen=${r.ts}）✓ 从现在起只认新消息`)
  process.exit(0)
}

const st = loadState()
const r = await poll()
if (!r.ok) { console.error(`✗ ${r.why}`); process.exit(3) }
const lastSeen = Number(st.lastSeen ?? 0)
const hit = r.ts > lastSeen && r.fromOwner
if (hit) {
  saveState({ ...st, lastSeen: r.ts, at: new Date().toISOString() })
  if (JSONOUT) console.log(JSON.stringify({ hit: true, mid: OWNER, name: OWNER_NAME, text: r.text, ts: r.ts }))
  else console.log(`DM_HIT mid=${OWNER} name=${OWNER_NAME} ts=${r.ts} text=${r.text.replace(/\n/g, ' ').slice(0, 200)}`)
  process.exit(0)
}
// 没命中：把 lastSeen 往前推（避免旧消息反复触发；但只在对方是主人时推）
if (r.ts > lastSeen) saveState({ ...st, lastSeen: r.ts, at: new Date().toISOString() })
if (JSONOUT) console.log(JSON.stringify({ hit: false }))
else if (!ONCE) console.log('无新私信')
process.exit(1)
