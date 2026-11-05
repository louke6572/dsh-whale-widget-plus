// 发"视频卡片"动态：**转发那条视频已有的 AV 动态**（2026-10-21 验证可行的做法）
//
// 为什么不能用 create/dyn：网页接口只认文字/图文，`attach_card` 被忽略（试过 4 种，见 CHANGELOG）。
// 为什么转发可行：每条投稿视频在动态里通常有一条 `DYNAMIC_TYPE_AV`（视频卡片），
//   转发它 → 新动态是 `DYNAMIC_TYPE_FORWARD`，正文是你的话，下面挂着**可点的视频卡片** ✓
//
// 找 AV 动态的办法：翻 UP 主自己的空间动态，找 `major.archive.bvid === 目标BV` 的那条。
//   找不到就返回 null（daily.mjs 会退回"文字 + 链接"）。
import { accountBili, biliState, biliStateDir } from './state-paths.mjs'
import fs from 'node:fs'
import path from 'node:path'

const HOME = process.env.USERPROFILE || process.env.HOME || '.'
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
const REF = 'https://t.bilibili.com/'

function cred() {
  return JSON.parse(fs.readFileSync(accountBili('credentials.json'), 'utf8'))
}
function cookieOf(c) {
  return `SESSDATA=${c.sessdata}; bili_jct=${c.bili_jct}; buvid3=${c.buvid3}`
}

/** 视频的 UP 主 mid */
export async function ownerOf(bvid) {
  try {
    const j = await (await fetch('https://api.bilibili.com/x/web-interface/view?bvid=' + bvid, {
      headers: { 'user-agent': UA, referer: 'https://www.bilibili.com/' },
    })).json()
    return String(j?.data?.owner?.mid ?? '')
  } catch { return '' }
}

/** 在 UP 主的空间动态里找"这条视频的 AV 动态"，返回 { id, title } 或 null */
export async function findVideoDynamic(bvid, upMid, pages = 2) {
  if (!upMid) return null
  const c = cred()
  for (let p = 0; p < pages; p += 1) {
    const offset = p === 0 ? '' : `&offset=${p * 20}`
    const u = `https://api.bilibili.com/x/polymer/web-dynamic/v1/feed/space?host_mid=${upMid}${offset}`
    let j = {}
    try {
      j = await (await fetch(u, {
        headers: { 'user-agent': UA, referer: `https://space.bilibili.com/${upMid}/dynamic`, cookie: cookieOf(c) },
      })).json()
    } catch { return null }
    for (const it of (j.data?.items ?? [])) {
      const arch = it?.modules?.module_dynamic?.major?.archive
      if (arch?.bvid === bvid) return { id: String(it.id_str), title: String(arch.title ?? '') }
    }
    if (!(j.data?.items ?? []).length) break
  }
  return null
}

/** 转发一条动态，正文自己写。返回 { ok, id, code, message } */
export async function createForward(origId, text) {
  const c = cred()
  const fd = new FormData()
  fd.append('dynamic_id', String(origId))
  fd.append('content', String(text))
  fd.append('csrf', String(c.bili_jct))
  fd.append('csrf_token', String(c.bili_jct))
  fd.append('type', '1')
  const r = await fetch('https://api.vc.bilibili.com/dynamic_svr/v1/dynamic_svr/create', {
    method: 'POST',
    headers: { 'user-agent': UA, referer: REF, cookie: cookieOf(c) },
    body: fd,
  })
  const out = await r.json().catch(() => ({}))
  return {
    ok: out.code === 0,
    id: String(out.data?.dynamic_id_str ?? out.data?.dynamic_id ?? ''),
    code: out.code,
    message: out.message ?? '',
  }
}

/** 读回一条动态，确认是不是"转发 + 视频卡片" */
export async function verifyForward(id, bvid) {
  try {
    const c = cred()
    const mid = String(c.mid ?? '')
    if (!mid) return { ok: false, why: '凭据缺少 mid，请先扫码登录 B站' }
    const j = await (await fetch(`https://api.bilibili.com/x/polymer/web-dynamic/v1/feed/space?host_mid=${mid}`, {
      headers: { 'user-agent': UA, referer: `https://space.bilibili.com/${mid}/dynamic`, cookie: cookieOf(c) },
    })).json()
    const it = (j.data?.items ?? []).find((x) => String(x.id_str) === String(id))
    if (!it) return { ok: false, why: '没读到' }
    const got = it?.orig?.modules?.module_dynamic?.major?.archive?.bvid ?? ''
    return { ok: it.type === 'DYNAMIC_TYPE_FORWARD' && got === bvid, type: it.type, bvid: got }
  } catch (e) {
    return { ok: false, why: String(e?.message ?? e).slice(0, 60) }
  }
}
