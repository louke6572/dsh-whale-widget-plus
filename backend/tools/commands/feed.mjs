// 选题器：照"她自己的偏好"挑今天该看什么。**只读网络**，只写一份「最近推过」备忘。
//
// 用法: node feed.mjs [--n 6] [--per 2] [--pages 3] [--recent-days 3] [--seed 2026-10-23]
//                      [--source all|search|popular|rank|following] [--no-remember] [--json]
// 数据来源：bili.config.json 的 preferences（like / keywords / weights）
//          + 日记 / 评论审计表 / 观看历史 / B站 记忆 / 收藏 / 反馈 的「看过」名单。
//
// 为什么这么做（2026-10-14 主人定的方向）：主人要的是"有日子的鱼"，
// 所以"看什么"不该由别人喂，而该由她自己的偏好决定 —— 这个脚本只负责照它去捞。
//
// 2026-10-23 重写（用户反馈「总是搜到相同的视频」「只盯着一两个偏好」）：
//   ① 去重补全：以前只排除日记/审计表里的 BV，**观看历史里 25 个看过的视频没被排除**，
//      所以刚看完的又被推回来。现在合并日记 + 审计表 + watch-history + B站记忆 + 收藏 + 反馈；
//   ② 搜索轮换：以前每个词固定 page 1 + click/pubdate，B站 对同一个词返回的永远是同一批；
//      现在按天轮换排序（totalrank/pubdate/click/dm）和页码（1~3）；
//   ③ 偏好权重：以前 `prefs.slice(0, 6)` 只搜前 6 个词，且 DeepSeek/Deepseek/deepseek
//      三个变体在同一个标题上各加一次分 → 第 7 个以后的偏好永远轮不到。
//      现在全部偏好参与、大小写变体合并、按 weights 分配名额（A/B/C/D 轮转输出）；
//   ④ 最近推过但没看的，3 天内不再推（feed-picks.json）。
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { accountBili, biliState } from '../lib/state-paths.mjs'
import { config } from '../lib/config.mjs'
import { readWatchHistory } from '../lib/watch-history.mjs'
import {
  bvSetFromTexts, candidateScore, filterRecentlyPicked, normalizePreferences,
  preferenceHits, prunePickedMap, safeNumber, searchPlan, selectDiverse,
} from '../lib/feed-core.mjs'

const argv = process.argv.slice(2)
const opt = {}
for (let i = 0; i < argv.length; i += 1) {
  if (!argv[i].startsWith('--')) continue
  const key = argv[i].slice(2)
  const next = argv[i + 1]
  if (next === undefined || next.startsWith('--')) opt[key] = true
  else { opt[key] = next; i += 1 }
}

const N = Math.max(1, Math.min(30, Number(opt.n ?? 6) || 6))
const PER = Math.max(1, Math.min(N, Number(opt.per ?? Math.max(2, Math.ceil(N / 2))) || 2))
const PAGES = Math.max(1, Math.min(3, Number(opt.pages ?? 3) || 3))
const RECENT_DAYS = Math.max(0, Math.min(30, Number(opt['recent-days'] ?? 3) || 0))
const SOURCE = String(opt.source ?? 'all')
const SEED = String(opt.seed ?? new Date().toLocaleDateString('sv-SE'))
const REMEMBER = opt['no-remember'] !== true

const diary = biliState('whale-diary.md')
const audit = biliState('commented-videos.md')
const feedPicks = biliState('feed-picks.json')

// ── ① 偏好：全量参与，按权重（不再 slice(0,6)）────────────────────────────
const cfg = config()
const { entries, enabled, disabled } = normalizePreferences({
  like: cfg.preferences?.like ?? [],
  keywords: cfg.preferences?.keywords ?? [],
  weights: cfg.preferences?.weights ?? {},
})
if (!enabled.length) {
  console.error('（没有启用的偏好：所有关键词权重为 0 或列表为空 → 只从热门/排行/关注里挑，且最多 1 条）')
}

// ── ② 看过名单：日记 + 审计表 + 观看历史 + B站记忆 + 收藏 + 反馈 ─────────
const seenTexts = []
try { seenTexts.push(fs.readFileSync(diary, 'utf8')) } catch { /* 没有日记不致命 */ }
try { seenTexts.push(fs.readFileSync(audit, 'utf8')) } catch { /* 没有审计表也无妨 */ }
const seen = bvSetFromTexts(seenTexts)
let watchSeen = 0
try {
  const history = readWatchHistory({ limit: 2000 })
  for (const item of history.items) {
    if (!item?.bvid || seen.has(item.bvid)) continue
    seen.add(item.bvid)
    watchSeen += 1
  }
} catch { /* 观看历史坏了也不能让选题失败 */ }

const likedBVs = new Set()
const favBVs = new Set()
try {
  const memory = JSON.parse(fs.readFileSync(biliState('bili-memory.json'), 'utf8'))
  for (const entry of (memory.entries ?? [])) if (entry?.bvid) seen.add(entry.bvid)
} catch {}
try {
  const fav = JSON.parse(fs.readFileSync(biliState('favorites.json'), 'utf8'))
  for (const item of (fav.items ?? [])) if (item?.bv) { seen.add(item.bv); favBVs.add(item.bv) }
} catch {}
let likedEvents = []
try {
  const fb = JSON.parse(fs.readFileSync(biliState('feedback.json'), 'utf8'))
  likedEvents = (fb.events ?? [])
    .filter((e) => e && (e.kind === 'like' || (typeof e.note === 'string' && /BV[0-9A-Za-z]{10}/.test(e.note))))
    .filter((e) => String(e.videoTitle ?? '').trim())
  for (const e of (fb.events ?? [])) if (e?.bv) { seen.add(e.bv); likedBVs.add(e.bv) }
} catch { /* 没有反馈就零加权 */ }

let pickMap = {}
try {
  const saved = JSON.parse(fs.readFileSync(feedPicks, 'utf8'))
  pickMap = (saved && typeof saved.picks === 'object') ? saved.picks : {}
} catch { /* 第一次跑没有备忘 */ }

// ── ③ 取候选（搜索轮换 + 热门/排行/关注）──────────────────────────────────
const cred = JSON.parse(fs.readFileSync(accountBili('credentials.json'), 'utf8'))
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
const H = { 'user-agent': UA, referer: 'https://search.bilibili.com/', cookie: `SESSDATA=${cred.sessdata}; bili_jct=${cred.bili_jct}; buvid3=${cred.buvid3}` }
const MIXIN_TAB = [46,47,18,2,53,8,23,32,15,50,10,31,58,3,45,35,27,43,5,49,33,9,42,19,29,28,14,39,12,38,41,13,37,48,7,16,24,55,40,61,26,17,0,1,60,51,30,4,22,25,54,21,56,59,6,63,57,62,11,36,20,34,44,52]
const keyOf = (u) => u.slice(u.lastIndexOf('/') + 1, u.lastIndexOf('.'))
const nav = await (await fetch('https://api.bilibili.com/x/web-interface/nav', { headers: H })).json()
const mixin = MIXIN_TAB.map((i) => (keyOf(nav.data?.wbi_img?.img_url ?? '') + keyOf(nav.data?.wbi_img?.sub_url ?? ''))[i]).join('').slice(0, 32)
const wbi = (p) => {
  const wts = Math.round(Date.now() / 1000)
  const q = Object.keys({ ...p, wts }).sort().map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(String(k === 'wts' ? wts : p[k]).replace(/[!'()*]/g, ''))}`).join('&')
  return `${q}&w_rid=${crypto.createHash('md5').update(q + mixin).digest('hex')}`
}
const secs = (s) => {
  const p = String(s ?? '').split(':').map(Number)
  if (p.length === 3) return p[0] * 3600 + p[1] * 60 + p[2]
  if (p.length === 2) return p[0] * 60 + p[1]
  return safeNumber(s)
}
const toNum = (value) => safeNumber(String(value ?? '').replace(/,/g, ''))

const pool = []
let searchRequests = 0
const plan = searchPlan(enabled, { seed: SEED, pages: [1, 2, 3].slice(0, PAGES) })
for (const item of plan) {
  try {
    const params = wbi({ search_type: 'video', keyword: item.label, order: item.order, page: item.page })
    const j = await (await fetch(`https://api.bilibili.com/x/web-interface/wbi/search/type?${params}`, { headers: H })).json()
    searchRequests += 1
    for (const it of (j?.data?.result ?? [])) {
      pool.push({
        bv: String(it.bvid ?? ''),
        t: String(it.title ?? '').replace(/<[^>]+>/g, ''),
        d: secs(it.duration),
        dm: toNum(it.danmaku),
        play: toNum(it.play),
        up: String(it.author ?? ''),
        kw: item.label,
      })
    }
  } catch { /* 这个词没结果就跳过 */ }
  await new Promise((r) => setTimeout(r, 250))
}
console.error(`[搜索] ${plan.length} 个偏好 × 1 次（排序/页码按种子 ${SEED} 轮换，成功 ${searchRequests} 次）`)

// ── #3 更多来源（2026-10-18 加：只搜关键词 = 只刷"搜索"，不是刷 B 站）──────
//   --source search（默认）| popular（热门）| rank（排行）| following（关注）| all
const popularPage = 1 + (Number.parseInt(crypto.createHash('md5').update(`${SEED}|popular`).digest('hex').slice(0, 4), 16) % 3)
async function fetchPopular() {
  const j = await (await fetch(`https://api.bilibili.com/x/web-interface/popular?pn=${popularPage}&ps=20`, { headers: H })).json()
  for (const it of (j?.data?.list ?? [])) {
    pool.push({ bv: String(it.bvid ?? ''), t: String(it.title ?? '').replace(/<[^>]+>/g, ''), d: Number(it.duration ?? 0),
      dm: toNum(it.stat?.danmaku), play: toNum(it.stat?.view), up: String(it.owner?.name ?? ''), kw: '热门' })
  }
}
async function fetchRank() {
  const j = await (await fetch('https://api.bilibili.com/x/web-interface/ranking/v2?rid=0&type=all', { headers: H })).json()
  for (const it of (j?.data?.list ?? []).slice(0, 20)) {
    pool.push({ bv: String(it.bvid ?? ''), t: String(it.title ?? '').replace(/<[^>]+>/g, ''), d: Number(it.duration ?? 0),
      dm: toNum(it.stat?.danmaku), play: toNum(it.stat?.view), up: String(it.owner?.name ?? ''), kw: '排行' })
  }
}
// 关注的人发了什么（2026-10-18 加）：真人才会"刷关注"——只搜关键词等于只刷"搜索"，不像人
async function fetchFollowing() {
  const j = await (await fetch('https://api.bilibili.com/x/polymer/web-dynamic/v1/feed/all?type=video&page=1', { headers: H })).json()
  if (j?.code !== 0) throw new Error(`code=${j?.code} ${j?.message ?? ''}`)
  for (const it of (j?.data?.items ?? [])) {
    const a = it?.modules?.module_author
    const ar = it?.modules?.module_dynamic?.major?.archive
    if (!ar?.bvid) continue
    const dt = String(ar.duration_text ?? '')
    pool.push({ bv: String(ar.bvid), t: String(ar.title ?? '').replace(/<[^>]+>/g, ''), d: secs(dt),
      dm: 0, play: toNum(ar.stat?.play), up: String(a?.name ?? ''), kw: '关注' })
  }
}
try { if (['popular', 'all'].includes(SOURCE)) await fetchPopular() } catch { console.error('（热门源取不到，跳过）') }
try { if (['rank', 'all'].includes(SOURCE)) await fetchRank() } catch { console.error('（排行源取不到，跳过）') }
try { if (['following', 'all'].includes(SOURCE)) await fetchFollowing() } catch (e) { console.error(`（关注源取不到，跳过：${String(e.message).slice(0, 60)}）`) }
console.error(`[来源] ${SOURCE === 'all' ? '搜索 + 热门 + 排行 + 关注' : SOURCE === 'popular' ? '热门' : SOURCE === 'rank' ? '排行' : SOURCE === 'following' ? '关注' : '搜索'}`)

// ── ④ 反馈回流（2026-10-20 加）────────────────────────────────────────────
//   feedback.json 里 kind='like' 的事件带 videoTitle → 对被赞视频【标题相似】的候选加权
//   主题词用字符 n-gram（中文不用分词也能用 ✓）
const STOP_WORDS = new Set(['我为', '添加', '开屏', '广告', '这个', '那个', '什么', '自己', '可以', '就是', '一个'])
const ownerName = String(cfg.owner?.name ?? '')
const learnTokens = (text) => {
  const out = new Set()
  // ⚠️ ownerName 为空时 new RegExp('') 会在每个字之间插空格 → 必须先判断 ✗（实测踩过）
  const base = ownerName ? String(text).replace(new RegExp(ownerName, 'g'), ' ') : String(text)
  const t = base.replace(/@\S+/g, ' ')
  for (const m of t.matchAll(/[A-Za-z][A-Za-z0-9]{1,}/g)) if (m[0].length >= 2) out.add(m[0].toLowerCase())
  for (const m of t.matchAll(/[\u4e00-\u9fa5]{2,}/g)) {
    const run = m[0]
    for (const n of [3, 4]) for (let i = 0; i + n <= run.length; i += 1) {
      const g = run.slice(i, i + n)
      if (!STOP_WORDS.has(g)) out.add(g)
    }
  }
  return [...out]
}
let favItems = []
try {
  const fj = JSON.parse(fs.readFileSync(biliState('favorites.json'), 'utf8'))
  favItems = (fj.items ?? []).filter((x) => x && x.bv)
} catch {}
const learnedTokens = [...new Set([
  ...likedEvents.flatMap((e) => learnTokens(String(e.videoTitle ?? '') + ' ' + String(e.comment ?? ''))),
  ...favItems.flatMap((x) => learnTokens(String(x.title ?? '') + ' ' + String(x.reason ?? ''))),
])]
const learnedHitsOf = (title) => learnedTokens.filter((tok) => title.toLowerCase().includes(tok)).length
const boostOf = (title) => Math.min(7.5, learnedHitsOf(title) * 2.5)

// ── ⑤ 过滤 + 打分 + 按权重分配名额 ────────────────────────────────────────
const selfName = String(cfg.self?.name ?? '')
const uniq = [...new Map(pool.map((x) => [x.bv, x])).values()]
  .filter((x) => x.bv)
  .filter((x) => !seen.has(x.bv) && !likedBVs.has(x.bv) && !favBVs.has(x.bv))
  .filter((x) => !(selfName && String(x.up ?? '').includes(selfName)))

const recentFiltered = filterRecentlyPicked(uniq, pickMap, { now: Date.now(), days: RECENT_DAYS })
const candidates = recentFiltered.map((x) => {
  const hits = preferenceHits(x.t, enabled)
  return { ...x, _hits: hits, _score: candidateScore(x, hits, boostOf(x.t)) }
})

const genericCap = enabled.length ? (Number.isFinite(Number(opt.generic)) ? Number(opt.generic) : 1) : N
const selection = selectDiverse(candidates, enabled, { n: N, perPref: PER, generic: genericCap, seed: SEED })

// ── ⑥ 记住「推过但没看」的，避免明晚原样再来 ─────────────────────────────
if (REMEMBER && selection.picked.length) {
  try {
    const next = prunePickedMap(pickMap, { now: Date.now(), days: 60 })
    const at = new Date().toISOString()
    for (const item of selection.picked) if (item.bv) next[item.bv] = at
    fs.mkdirSync(path.dirname(feedPicks), { recursive: true })
    fs.writeFileSync(feedPicks, `${JSON.stringify({ version: 1, updatedAt: at, picks: next }, null, 2)}\n`)
  } catch { /* 备忘写不进去不影响本次选题 */ }
}

// ── ⑦ 输出 ────────────────────────────────────────────────────────────────
const weightText = (entry) => `${entry.label}${entry.weight === 1 ? '' : `×${entry.weight}`}`
const quotaText = enabled
  .filter((entry) => (selection.quotas.get(entry.key) ?? 0) > 0)
  .map((entry) => `${entry.label} ${selection.quotas.get(entry.key)}`)
const payload = {
  ok: true,
  seed: SEED,
  n: N,
  perPref: PER,
  sources: SOURCE,
  recentDays: RECENT_DAYS,
  preferences: enabled.map((entry) => ({ label: entry.label, weight: entry.weight, kind: entry.kind })),
  disabled: disabled.map((entry) => entry.label),
  quotas: Object.fromEntries(selection.quotas),
  counts: Object.fromEntries(selection.counts),
  shortfall: selection.shortfall,
  stats: {
    pool: pool.length,
    candidates: candidates.length,
    seen: seen.size,
    seenFromWatchHistory: watchSeen,
    recentlyPickedSkipped: uniq.length - recentFiltered.length,
    learnedTokens: learnedTokens.length,
  },
  items: selection.picked.map((x) => ({
    bv: x.bv, title: x.t, up: x.up, duration: x.d, danmaku: x.dm, play: x.play,
    score: Math.round(x._score * 100) / 100, via: x._via, hits: (x._hits ?? []).map((h) => h.label),
  })),
}
if (opt.json) {
  console.log(JSON.stringify(payload, null, 2))
} else {
  console.log(`偏好（按权重）: ${enabled.map(weightText).join(' · ') || '（无）'}`)
  if (disabled.length) console.log(`已停用（权重 0）: ${disabled.map((e) => e.label).join(' · ')}`)
  console.log(`额外关键词: ${entries.filter((e) => e.kind === 'extra').map(weightText).join(' · ') || '（未设置）'}`)
  console.log(`反馈回流: 被赞 ${likedEvents.length} 条 · 她收藏 ${favItems.length} 条 → 学会 ${learnedTokens.length} 个主题词`)
  console.log(`已看过/已评论过（已排除）: ${seen.size} 个 BV（其中观看历史补 ${watchSeen} 个）`)
  if (RECENT_DAYS > 0) console.log(`最近 ${RECENT_DAYS} 天推过但没看的（本轮避开）: ${uniq.length - recentFiltered.length} 个`)
  console.log(`候选池: ${pool.length} 条 → 去重去已看/最近推过后 ${candidates.length} 条`)
  console.log(`本轮配额（共 ${N} 条，每条偏好最多 ${PER} 条）: ${quotaText.join(' · ') || '（没有命中偏好的候选）'}`)
  for (const miss of selection.shortfall) {
    console.log(`  ⚠️ ${miss.label} 只有 ${miss.have} 条候选（配额 ${miss.want}）→ 名额让给其他偏好`)
  }
  console.log(`\n今天可以看这几条（按权重分配，偏好之间轮转）：`)
  let shown = 0
  for (const x of selection.picked) {
    if (shown >= N) break
    shown += 1
    const hits = x._hits?.length ? `[${x._hits.map((h) => `${h.label}×${h.weight}`).join(' + ')}]` : ''
    console.log(`  ${String(shown).padStart(2)}. ${x.bv}  ${String(safeNumber(x.d)).padStart(4)}s  弹幕${String(safeNumber(x.dm)).padStart(7)}  播放${String(safeNumber(x.play)).padStart(9)}  ${String(x.t).slice(0, 40)}  @${x.up} ${hits}`)
  }
  if (!selection.picked.length) console.log('  （没有可看的了：候选都被看过/最近推过；把 --recent-days 调小或等新视频）')
  console.log('\n看完跑：node bili.mjs debrief <BV>   → 然后把"想法"写进日记的「想说」区（不发）')
}
