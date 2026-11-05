/**
 * B站「每日分享 → 自己的动态」的纯逻辑（可单测）。
 *
 * 目标（2026-10-23 用户定）：
 *   · 默认不再去评论区 @ 主人，而是发到小肥鱼自己的 B站 动态；
 *   · 动态尽量是**视频卡片**：转发该视频已有的 AV 动态（见 lib/forward.mjs）；
 *   · 和四类动态共用 `daily-dynamic.json`，任意两条之间至少 `dynamics.gapMin` 分钟。
 */
import fs from 'node:fs'

export function readShareState(file) {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'))
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

/** 所有动态（四类 + share）里最近的一条时间；没有返回 0。 */
export function lastDynamicAt(state = {}) {
  return Object.values(state)
    .map((item) => new Date(item?.at ?? 0).getTime())
    .filter((t) => Number.isFinite(t) && t > 0)
    .sort((a, b) => b - a)[0] ?? 0
}

/** 距上一条动态还差多少分钟才能发；0 = 可以发。 */
export function dynamicGapWait(state, gapMin, now = Date.now()) {
  const lastAt = lastDynamicAt(state)
  const gapMs = Math.max(0, Number(gapMin) || 0) * 60_000
  if (!lastAt || !gapMs) return { ok: true, lastAt, waitMin: 0 }
  const waitMs = lastAt + gapMs - now
  return {
    ok: waitMs <= 0,
    lastAt,
    waitMin: waitMs > 0 ? Math.ceil(waitMs / 60_000) : 0,
  }
}

/** 把一条 share 记录写进 daily-dynamic.json 的 state（保留四类）。 */
export function mergeShareRecord(state = {}, record = {}) {
  const next = state && typeof state === 'object' && !Array.isArray(state) ? { ...state } : {}
  next.share = {
    date: String(record.date ?? ''),
    at: String(record.at ?? new Date().toISOString()),
    atText: String(record.atText ?? ''),
    kind: 'share',
    bvid: String(record.bvid ?? ''),
    dynId: String(record.dynId ?? ''),
    card: record.card === true,
    chars: Number(record.chars) || 0,
  }
  return next
}
