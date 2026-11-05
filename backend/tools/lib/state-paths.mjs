/**
 * B站 工具链的路径解析：
 *   · 账号级（全局）：cookie、表情包、ffmpeg/bin、语音素材 —— 换角色不换账号；
 *   · 角色级（每个角色独立）：额度账本、评分、收藏、日记、动态状态、私信状态、待审…
 *     落在 `~/.dsh/surfcore/characters/<id>/bili/`。
 *
 * 每次进程启动读一次 `characters/current.json`；长命令在开始时捕获目录即可，
 * 中途切换角色不会把旧角色的行为记到新角色账上。
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export const HOME = process.env.USERPROFILE || process.env.HOME || '.'
export const DSH_HOME = process.env.DSH_HOME || path.join(HOME, '.dsh')
export const SURFCORE_DIR = path.join(DSH_HOME, 'surfcore')
export const ACCOUNT_BILI_DIR = path.join(SURFCORE_DIR, 'bili')
export const CHARACTERS_DIR = path.join(SURFCORE_DIR, 'characters')
export const CURRENT_FILE = path.join(CHARACTERS_DIR, 'current.json')

let cached = null
let cachedKey = ''

function readJson(file, fallback = null) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return fallback }
}

export function currentCharacter() {
  let key = 'missing'
  try {
    const stat = fs.statSync(CURRENT_FILE)
    key = `${stat.mtimeMs}:${stat.size}`
  } catch {
    cached = null
    cachedKey = key
    return null
  }
  if (cachedKey === key) return cached
  const raw = readJson(CURRENT_FILE, null)
  if (!raw || !/^[a-z0-9][a-z0-9_-]{0,39}$/.test(String(raw.id ?? ''))) {
    cached = null
  } else {
    const dir = path.join(CHARACTERS_DIR, raw.id, 'bili')
    cached = fs.existsSync(path.join(CHARACTERS_DIR, raw.id, 'character.json'))
      ? { id: raw.id, name: String(raw.name ?? raw.id), epoch: Number(raw.epoch) || 1, biliDir: dir }
      : null
  }
  cachedKey = key
  return cached
}

/** 当前角色的 B站 行为目录；没有角色系统时回退旧目录。 */
export function biliStateDir() {
  return currentCharacter()?.biliDir || ACCOUNT_BILI_DIR
}

export function biliState(...parts) {
  return path.join(biliStateDir(), ...parts)
}

/** 账号级文件（cookie / 表情包 / 二进制）永远走旧目录，不进角色包。 */
export function accountBili(...parts) {
  return path.join(ACCOUNT_BILI_DIR, ...parts)
}

export const BILI_CONFIG = process.env.SURFCORE_BILI_CONFIG || path.join(SURFCORE_DIR, 'bili.config.json')
