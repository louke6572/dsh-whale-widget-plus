/**
 * 当前人格卡解析：不把某个具体角色写死进产品。
 *
 * 优先级：
 *   0. **角色人格系统**：当前角色的 `characters/<id>/persona.md`（存在时最高优先）；
 *   1. ~/.dsh/surfcore/config.json → persona.file（绝对路径或相对 surfcore）
 *   2. roles/角色卡.md（新用户的默认建议路径）
 *   3. roles/ 下已有的 .md（排除 README）—— 兼容旧布局
 *   4. 都没找到时返回 persona.file / roles/角色卡.md，让设置页显示「还没建卡」
 *
 * 这样别的用户可以直接放自己的角色卡，不需要改代码。
 */
import fs from 'node:fs';
import path from 'node:path';
import { activePersonaFile } from '../../src/character-persona.js';
import { DEFAULT_PERSONA_FILE, QQBOT_ROOT, QQ_PERSONA_DIR } from './paths.js';
import { readUnified } from './store.js';

function listPersonaCards() {
  try {
    return fs.readdirSync(QQ_PERSONA_DIR)
      .filter((name) => name.toLowerCase().endsWith('.md') && name.toLowerCase() !== 'readme.md')
      .sort();
  } catch {
    return [];
  }
}

export function resolvePersonaFile() {
  // 角色系统激活时，人格卡只认当前角色包；不再读 roles/ 或 persona.file。
  const active = activePersonaFile();
  if (active) return active;
  let configured = '';
  try {
    configured = String(readUnified().config?.persona?.file ?? '').trim();
  } catch {}
  const configuredPath = configured
    ? (path.isAbsolute(configured) ? configured : path.resolve(QQBOT_ROOT, configured))
    : '';
  if (configuredPath) {
    try { if (fs.existsSync(configuredPath)) return configuredPath; } catch {}
  }
  try { if (fs.existsSync(DEFAULT_PERSONA_FILE)) return DEFAULT_PERSONA_FILE; } catch {}
  const cards = listPersonaCards();
  if (cards.length) return path.join(QQ_PERSONA_DIR, cards[0]);
  return configuredPath || DEFAULT_PERSONA_FILE;
}
