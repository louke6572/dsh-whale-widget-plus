// 六款游戏的「二创动态」轮换（2026-10-21 管理员定）
//
// 规则：每天发一条 AI 二创推荐，六款游戏**按顺序轮换**，不跳、不重复、不让她自己挑。
//   顺序：原神 → 鸣潮 → 绝区零 → 崩坏星穹铁道 → 终末地 → 异环 → 回到原神
//
// 轮换指针只在**发成功之后**才前进（写盘在 daily.mjs 里），失败不算 ✓
import { accountBili, biliState, biliStateDir } from './state-paths.mjs'
import fs from 'node:fs'
import path from 'node:path'

const HOME = process.env.USERPROFILE || process.env.HOME || '.'
export const ROTATION = biliState('game-rotation.json')

export const GAMES = ['原神', '鸣潮', '绝区零', '崩坏星穹铁道', '终末地', '异环']

/** 每个游戏的搜索词（多搜几个，召回率高一点） */
export function queriesFor(game) {
  return [
    `${game} AI 二创`,
    `${game} AI 动画`,
    `${game} AI 视频`,
  ]
}

export function loadRotation() {
  try {
    const j = JSON.parse(fs.readFileSync(ROTATION, 'utf8'))
    return { i: Number.isFinite(Number(j.i)) ? ((Number(j.i) % GAMES.length) + GAMES.length) % GAMES.length : 0, ...j }
  } catch { return { i: 0 } }
}

export function currentGame() {
  return GAMES[loadRotation().i % GAMES.length]
}

/** 发成功后前进一格 */
export function advanceRotation(game) {
  const r = loadRotation()
  const i = (GAMES.indexOf(game) + 1 + GAMES.length) % GAMES.length
  const next = { i, lastGame: game, lastAt: new Date().toISOString() }
  try {
    fs.mkdirSync(path.dirname(ROTATION), { recursive: true })
    fs.writeFileSync(ROTATION, JSON.stringify(next, null, 2) + '\n')
  } catch {}
  return next
}
