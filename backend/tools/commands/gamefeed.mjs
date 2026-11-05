// 候选取样器（为「第三/四类动态」和「第二类」服务）
//
//   node bili.mjs gamefeed                   二类：今天轮到哪款游戏 + 它的 AI 二创候选
//   node bili.mjs gamefeed --for anime       三类：动漫（MAD 混剪 / 新番导视 / 番剧评价 / 动漫新闻）
//   node bili.mjs gamefeed --for gaming      四类：游戏区视频（解说 / 实况 / 评测 / 整活）
//   可选：--days 14 --n 8
//
// 它只做**召回 + 粗排**（近 N 天、主题词命中、播放/收藏），**不拍板** ——
//   质量要她自己 debrief 看，daily 那边还有一道硬闸（播放/赞播比/天数）✓
import { accountBili, biliState, biliStateDir } from '../lib/state-paths.mjs'
import { readWatchHistory } from '../lib/watch-history.mjs'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { GAMES, currentGame, queriesFor } from '../lib/games.mjs'

const argv = process.argv.slice(2)
const opt = {}
for (let i = 0; i < argv.length; i += 1) {
  const a = argv[i]
  if (a.startsWith('--')) {
    const v = argv[i + 1]
    if (v === undefined || v.startsWith('--')) opt[a.slice(2)] = true
    else { opt[a.slice(2)] = v; i += 1 }
  }
}
const FOR = String(opt.for ?? 'game')
const DAYS = Number(opt.days ?? (FOR === 'game' ? 21 : 14))
const N = Number(opt.n ?? 8)

const TOPICS = {
  anime: {
    name: '动漫',
    queries: ['新番导视', 'MAD 混剪', '番剧 评价', '动漫 资讯', '动画 盘点'],
    re: /(MAD|mad|混剪|新番|导视|番剧|动漫|二次元|\bOP\b|\bED\b|anime|原创动画)/,
  },
  gaming: {
    name: '游戏区',
    queries: ['游戏 解说', '游戏 实况', '游戏 评测', '游戏 整活', '游戏 攻略'],
    re: /(游戏|实况|解说|攻略|评测|整活|通关|联机|开黑|单机|手游|端游)/,
  },
}

if (FOR !== 'game' && !TOPICS[FOR]) {
  console.error('✗ --for 只能是 game（AI 二创）/ anime（动漫）/ gaming（游戏区）')
  process.exit(2)
}

const GAME = FOR === 'game' ? (String(opt.game ?? '') || currentGame()) : ''
const QUERIES = FOR === 'game' ? queriesFor(GAME) : TOPICS[FOR].queries
const TOPIC_RE = FOR === 'game' ? null : TOPICS[FOR].re
const AI_RE = /(^|[^a-z])(ai|a\.i\.)([^a-z]|$)|AI(绘画|动画|视频|配音|生成|二创|翻唱|建模|短剧|制作)|生成式|绘画|sora|runway|可灵|即梦|midjourney|stable\s*diffusion/i

if (opt.next) { console.log(GAME || ''); process.exit(0) }

const HOME = process.env.USERPROFILE || process.env.HOME || '.'
const cred = JSON.parse(fs.readFileSync(accountBili('credentials.json'), 'utf8'))
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
const H = { 'user-agent': UA, referer: 'https://search.bilibili.com/', cookie: `SESSDATA=${cred.sessdata}; bili_jct=${cred.bili_jct}; buvid3=${cred.buvid3}` }
const jget = async (u) => (await fetch(u, { headers: H })).json()

const MIXIN_TAB = [46,47,18,2,53,8,23,32,15,50,10,31,58,3,45,35,27,43,5,49,33,9,42,19,29,28,14,39,12,38,41,13,37,48,7,16,24,55,40,61,26,17,0,1,60,51,30,4,22,25,54,21,56,59,6,63,57,62,11,36,20,34,44,52]
const keyOf = (u) => u.slice(u.lastIndexOf('/') + 1, u.lastIndexOf('.'))
const nav = await jget('https://api.bilibili.com/x/web-interface/nav')
const raw = keyOf(nav.data?.wbi_img?.img_url ?? '') + keyOf(nav.data?.wbi_img?.sub_url ?? '')
const mixin = MIXIN_TAB.map((i) => raw[i]).join('').slice(0, 32)
const clean = (v) => String(v).replace(/[!'()*]/g, '')
function wbi(params) {
  const wts = Math.round(Date.now() / 1000)
  const q = Object.keys({ ...params, wts }).sort()
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(clean(k === 'wts' ? wts : params[k]))}`).join('&')
  return `${q}&w_rid=${crypto.createHash('md5').update(q + mixin).digest('hex')}`
}

const now = Date.now() / 1000
const seen = new Map()
for (const kw of QUERIES) {
  for (const page of [1, 2]) {
    const qs = wbi({ search_type: 'video', keyword: kw, page })
    const d = await jget(`https://api.bilibili.com/x/web-interface/wbi/search/type?${qs}`)
    for (const r of (d.data?.result ?? [])) {
      if (!r?.bvid || seen.has(r.bvid)) continue
      const title = String(r.title ?? '').replace(/<[^>]+>/g, '')
      const tag = String(r.tag ?? '')
      const desc = String(r.description ?? '')
      const pub = Number(r.pubdate ?? 0)
      if (!pub || now - pub > DAYS * 86400) continue
      const text = `${title} ${tag} ${desc}`
      // 动漫/游戏区：先把"影视解说/电视剧"这类明显不是的剔掉（它们常被搜出来蹭关键词 ✓）
      if (FOR !== 'game' && /(电影|电视剧|影视|综艺|纪录片)/.test(`${title} ${String(r.author ?? '')}`)) continue
      if (FOR === 'game') {
        if (!text.includes(GAME)) continue
        if (!AI_RE.test(text)) continue
      } else {
        if (!TOPIC_RE.test(text)) continue
        if (Number(r.play ?? 0) < 1000) continue
      }
      seen.set(r.bvid, {
        bv: r.bvid, title, up: String(r.author ?? ''), play: Number(r.play ?? 0),
        danmaku: Number(r.video_review ?? 0), fav: Number(r.favorites ?? 0),
        days: Math.floor((now - pub) / 86400), dur: String(r.duration ?? ''),
      })
    }
  }
}

// ── 看过 / 最近推过：gamefeed 以前完全没有这层，导致「原神/鸣潮」的旧视频每天原样回来 ──
const watched = new Set()
try {
  const history = readWatchHistory({ limit: 2000 })
  for (const item of history.items) if (item?.bvid) watched.add(item.bvid)
} catch {}
try {
  const text = fs.readFileSync(biliState('whale-diary.md'), 'utf8')
  for (const m of text.matchAll(/BV[0-9A-Za-z]{10}/g)) watched.add(m[0])
} catch {}
try {
  const text = fs.readFileSync(biliState('commented-videos.md'), 'utf8')
  for (const m of text.matchAll(/BV[0-9A-Za-z]{10}/g)) watched.add(m[0])
} catch {}
try {
  const memory = JSON.parse(fs.readFileSync(biliState('bili-memory.json'), 'utf8'))
  for (const entry of (memory.entries ?? [])) if (entry?.bvid) watched.add(entry.bvid)
} catch {}
try {
  const fav = JSON.parse(fs.readFileSync(biliState('favorites.json'), 'utf8'))
  for (const item of (fav.items ?? [])) if (item?.bv) watched.add(item.bv)
} catch {}
try {
  const fb = JSON.parse(fs.readFileSync(biliState('feedback.json'), 'utf8'))
  for (const event of (fb.events ?? [])) if (event?.bv) watched.add(event.bv)
} catch {}

const picksFile = biliState('gamefeed-picks.json')
let picks = {}
try {
  const saved = JSON.parse(fs.readFileSync(picksFile, 'utf8'))
  picks = (saved && typeof saved.picks === 'object') ? saved.picks : {}
} catch {}
const recentCutoff = Date.now() - 3 * 86400000
const skipped = { seen: 0, recent: 0 }
const cands = [...seen.values()]
  .filter((item) => {
    if (watched.has(item.bv)) { skipped.seen += 1; return false }
    const at = Date.parse(String(picks[item.bv] ?? ''))
    if (Number.isFinite(at) && at >= recentCutoff) { skipped.recent += 1; return false }
    return true
  })
  .sort((a, b) => (b.play + b.fav * 20 + b.danmaku * 5) - (a.play + a.fav * 20 + a.danmaku * 5))

if (FOR === 'game') {
  console.log(`今天轮到的游戏：**${GAME}**（顺序：${GAMES.join(' → ')} 循环）`)
} else {
  console.log(`取样：**${TOPICS[FOR].name}**（近 ${DAYS} 天）`)
}
console.log(`候选 ${cands.length} 条\n`)
if (skipped.seen || skipped.recent) {
  console.log(`已排除：看过 ${skipped.seen} 条 · 最近 3 天推过 ${skipped.recent} 条（不会再拿旧视频凑数）\n`)
}
if (!cands.length) {
  console.log('没有新的了（都看过/最近推过）—— 放宽 --days、换游戏，或今天不发；别硬重复。')
  process.exit(0)
}
for (const [i, c] of cands.slice(0, N).entries()) {
  console.log(`${String(i + 1).padStart(2)}. ${c.bv}  ${c.days}天前  ${String(c.play).padStart(7)}播放  ${String(c.fav).padStart(5)}收藏  ${c.dur}  @${c.up}`)
  console.log(`    ${c.title.slice(0, 60)}`)
}
// 推过但还没看的也记一笔，7 天内不再原样出现（避免「候选永远只有这 6 条」）。
if (opt['no-remember'] !== true) {
  try {
    const next = {}
    const keepAfter = Date.now() - 30 * 86400000
    for (const [bv, at] of Object.entries(picks)) {
      const ts = Date.parse(String(at))
      if (Number.isFinite(ts) && ts >= keepAfter) next[bv] = at
    }
    const nowIso = new Date().toISOString()
    for (const c of cands.slice(0, N)) next[c.bv] = nowIso
    fs.mkdirSync(path.dirname(picksFile), { recursive: true })
    fs.writeFileSync(picksFile, `${JSON.stringify({ version: 1, updatedAt: nowIso, picks: next }, null, 2)}\n`)
  } catch { /* 备忘写不进去不影响候选输出 */ }
}
console.log(`\n先 debrief 看 2~3 条（别只看播放）→ 挑一条真的做得好 → 再发：`)
console.log(FOR === 'game' ? '  daily --kind game --bvid <BV> --text "…" --dry' : `  daily --kind ${FOR} --bvid <BV> --text "…" --dry`)
