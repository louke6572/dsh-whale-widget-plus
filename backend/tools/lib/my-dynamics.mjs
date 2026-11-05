// 「我自己发过哪些动态」—— 用来判断一条 type=11 的评论是不是在我的动态底下
//
// 为什么需要：动态评论的 oid 不是 dyn_id，而是 `basic.comment_id_str`（另一个 19 位数）；
//   只有把两者对上号，代码才知道"这条回复该记「动态回复」那本账"。
//
// 取法：`x/polymer/web-dynamic/v1/feed/space?host_mid=<自己的 mid>` 里每条的
//   `basic.comment_id_str` —— 一次请求就能拿到全部（含旧动态 ✓）。
//   缓存 10 分钟，别每条回复都打一次接口。
import { accountBili, biliState, biliStateDir } from './state-paths.mjs'
import fs from 'node:fs'
import path from 'node:path'

const HOME = process.env.USERPROFILE || process.env.HOME || '.'
const CACHE = biliState('my-dynamics.json')
const TTL_MS = 10 * 60 * 1000

const loadCache = () => { try { return JSON.parse(fs.readFileSync(CACHE, 'utf8')) } catch { return null } }
const saveCache = (o) => { try { fs.mkdirSync(path.dirname(CACHE), { recursive: true }); fs.writeFileSync(CACHE, JSON.stringify(o, null, 2) + '\n') } catch {} }

/** 自己的 mid：优先配置里的 self.mid，其次 nav */
async function selfMid(cred) {
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(HOME, '.dsh', 'surfcore', 'bili.config.json'), 'utf8'))
    const m = String(cfg?.self?.mid ?? '').trim()
    if (m) return m
  } catch {}
  try {
    const j = await (await fetch('https://api.bilibili.com/x/web-interface/nav', {
      headers: { 'user-agent': 'Mozilla/5.0', referer: 'https://www.bilibili.com/', cookie: `SESSDATA=${cred.sessdata}; bili_jct=${cred.bili_jct}; buvid3=${cred.buvid3}` },
    })).json()
    return String(j?.data?.mid ?? '')
  } catch { return '' }
}

/**
 * 拉自己动态的 comment_id_str 集合（带 10 分钟缓存）。
 * @param {{sessdata:string,bili_jct:string,buvid3:string}} cred
 * @returns {Promise<{ids:Set<string>, ok:boolean, why?:string}>}
 */
export async function myDynamicCommentIds(cred, force = false) {
  const c = loadCache()
  if (!force && c && Array.isArray(c.ids) && Date.now() - Number(c.at ?? 0) < TTL_MS) {
    return { ids: new Set(c.ids.map(String)), ok: true }
  }
  try {
    const mid = await selfMid(cred)
    if (!mid) return { ids: new Set(), ok: false, why: '拿不到自己的 mid' }
    const r = await fetch(`https://api.bilibili.com/x/polymer/web-dynamic/v1/feed/space?host_mid=${mid}`, {
      headers: {
        'user-agent': 'Mozilla/5.0',
        referer: `https://space.bilibili.com/${mid}/dynamic`,
        cookie: `SESSDATA=${cred.sessdata}; bili_jct=${cred.bili_jct}; buvid3=${cred.buvid3}`,
      },
    })
    const j = await r.json()
    if (j.code !== 0) return { ids: new Set(), ok: false, why: `feed/space code=${j.code}` }
    const ids = (j.data?.items ?? [])
      .map((it) => String(it?.basic?.comment_id_str ?? ''))
      .filter(Boolean)
    saveCache({ at: Date.now(), mid, ids })
    return { ids: new Set(ids), ok: true }
  } catch (e) {
    return { ids: new Set(), ok: false, why: String(e?.message ?? e).slice(0, 80) }
  }
}

// ── 每条动态属于哪一类（一类=最高分视频 / 二类=游戏 AI 二创）────────────
//   回评时靠它决定记「动态回复」还是「二创动态回复」那本账。
const KINDS = biliState('dyn-kinds.json')
const loadKinds = () => { try { return JSON.parse(fs.readFileSync(KINDS, 'utf8')) } catch { return {} } }
const saveKinds = (o) => { try { fs.mkdirSync(path.dirname(KINDS), { recursive: true }); fs.writeFileSync(KINDS, JSON.stringify(o, null, 2) + '\n') } catch {} }

/** 发完动态后调：查最新的空间动态，把 dynId 对应的 comment_id_str 记成 kind ✓ */
export async function rememberKind(cred, dynId, kind) {
  try {
    const mid = await selfMid(cred)
    if (!mid) return { ok: false, why: '拿不到 mid' }
    const r = await fetch(`https://api.bilibili.com/x/polymer/web-dynamic/v1/feed/space?host_mid=${mid}`, {
      headers: {
        'user-agent': 'Mozilla/5.0',
        referer: `https://space.bilibili.com/${mid}/dynamic`,
        cookie: `SESSDATA=${cred.sessdata}; bili_jct=${cred.bili_jct}; buvid3=${cred.buvid3}`,
      },
    })
    const j = await r.json()
    if (j.code !== 0) return { ok: false, why: `feed/space code=${j.code}` }
    const items = j.data?.items ?? []
    const hit = items.find((it) => String(it?.id_str ?? '') === String(dynId)) ?? items[0]
    const oid = String(hit?.basic?.comment_id_str ?? '')
    if (!oid) return { ok: false, why: '没找到 comment_id_str' }
    const k = loadKinds()
    k[oid] = ['game', 'anime', 'gaming'].includes(kind) ? kind : 'best'
    // 只留最近 60 条，别把文件养大
    const keys = Object.keys(k).slice(-60)
    const trimmed = {}
    for (const key of keys) trimmed[key] = k[key]
    saveKinds(trimmed)
    // 顺手刷新 oid 缓存
    saveCache({ at: Date.now(), mid, ids: items.map((it) => String(it?.basic?.comment_id_str ?? '')).filter(Boolean) })
    return { ok: true, oid }
  } catch (e) {
    return { ok: false, why: String(e?.message ?? e).slice(0, 80) }
  }
}

/** oid → 'best' | 'game'（没记过的老动态一律当一类 best） */
export async function myDynamicKinds(cred) {
  const { ids, ok, why } = await myDynamicCommentIds(cred)
  const kinds = loadKinds()
  const map = new Map()
  for (const id of ids) map.set(String(id), ['game', 'anime', 'gaming'].includes(kinds[String(id)]) ? kinds[String(id)] : 'best')
  return { ok, why, map }
}
