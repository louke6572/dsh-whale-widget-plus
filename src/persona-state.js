/**
 * 人格状态（情绪 + 口头禅）—— 让「她」在 QQ / 桌宠 / 抖音 里保持同一条连续的情绪线。
 *
 * 为什么单独一个文件：QQ 桥接（src/bridge.js）和插件侧（backend/lib/pet-chat.js、
 * pet-purpose.js、douyin-im.js）都在不同进程/模块里拼提示词，必须读同一份状态，
 * 否则「桌宠里心情不错、QQ 里却闷闷的」会前后矛盾。
 *
 * 状态只看两件事，不做模型打分（模型参与就会不稳定、也会多花一次调用）：
 *   · 主人多久没跟她说话（沉默越久，情绪越低）
 *   · 她最近有没有回过话（刚说完话时情绪最好）
 * 手动指定的心情会在一段时间内压过自动推导，过期后回到自动。
 *
 * 口头禅是用户自己填的小名单（最多 8 条），提示词里只允许「偶尔用」，
 * 避免变成每句都挂同一句口癖的复读机。
 */
import fs from 'node:fs';
import path from 'node:path';
import { CHARACTERS_DIR, SURFCORE_DIR, readCurrentCharacter } from './character-persona.js';

const VERSION = 1;
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const MAX_QUIRKS = 8;
const QUIRK_MAX_CHARS = 24;
const MANUAL_TTL = 6 * HOUR;

export const MOOD_LABELS = {
  happy: '心情不错',
  calm: '平静',
  pouty: '有点小别扭',
  lonely: '闷闷的',
  tired: '有点累',
};

function stateFile() {
  try {
    const current = readCurrentCharacter();
    if (current?.id) return path.join(CHARACTERS_DIR, String(current.id), 'persona-state.json');
  } catch { /* 角色体系没启用时用全局文件 */ }
  return path.join(SURFCORE_DIR, 'persona-state.json');
}

function readState() {
  try {
    const raw = fs.readFileSync(stateFile(), 'utf8');
    const data = JSON.parse(raw);
    return data && typeof data === 'object' ? data : {};
  } catch {
    return {};
  }
}

function writeState(next) {
  const file = stateFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, file);
}

function normalizeQuirks(value) {
  const source = Array.isArray(value) ? value : [];
  const out = [];
  const seen = new Set();
  for (const item of source) {
    const text = String(item ?? '').replace(/\s+/g, ' ').trim().slice(0, QUIRK_MAX_CHARS);
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
    if (out.length >= MAX_QUIRKS) break;
  }
  return out;
}

function currentMood(state, now) {
  // 手动指定且没过期：优先。
  if (state.manualMood && Number(state.manualUntil) > now) {
    return {
      mood: String(state.manualMood),
      note: String(state.manualNote || '手动设定的心情').slice(0, 40),
      manual: true,
    };
  }
  const lastOwner = Number(state.lastOwnerAt) || 0;
  const lastReply = Number(state.lastReplyAt) || 0;
  const reference = Math.max(lastOwner, lastReply);
  if (!reference) return { mood: 'calm', note: '刚安静下来，没什么特别的事', manual: false };
  const gap = now - reference;
  if (gap < 10 * MINUTE) {
    return { mood: 'happy', note: '刚聊过，还有点兴奋', manual: false };
  }
  if (gap < 2 * HOUR) {
    return { mood: 'calm', note: '刚聊过不久', manual: false };
  }
  if (gap < 8 * HOUR) {
    return { mood: 'calm', note: '有一阵子没说话了，但没到闹别扭', manual: false };
  }
  if (gap < 24 * HOUR) {
    return { mood: 'pouty', note: '半天没人理她，有点小别扭', manual: false };
  }
  return { mood: 'lonely', note: '好久没人说话，闷闷的', manual: false };
}

/** 记录一次活动。kind: owner（主人说话）/ reply（她回了话）/ contact（其他平台有人说话）。 */
export function notePersonaActivity({ kind = 'owner', at = Date.now() } = {}) {
  try {
    const state = readState();
    const next = { ...state, version: VERSION };
    if (kind === 'reply') {
      next.lastReplyAt = Math.max(Number(next.lastReplyAt) || 0, at);
    } else if (kind === 'contact') {
      next.lastContactAt = Math.max(Number(next.lastContactAt) || 0, at);
    } else {
      next.lastOwnerAt = Math.max(Number(next.lastOwnerAt) || 0, at);
    }
    next.updatedAt = at;
    writeState(next);
  } catch { /* 状态写失败不影响聊天 */ }
}

/** 给 UI / 排查用的快照。 */
export function personaSnapshot(now = Date.now()) {
  const state = readState();
  const mood = currentMood(state, now);
  const silenceMs = Number(state.lastOwnerAt) ? Math.max(0, now - Number(state.lastOwnerAt)) : null;
  return {
    ok: true,
    mood: mood.mood,
    moodLabel: MOOD_LABELS[mood.mood] || mood.mood,
    moodNote: mood.note,
    manual: mood.manual,
    quirks: normalizeQuirks(state.quirks),
    lastOwnerAt: Number(state.lastOwnerAt) || 0,
    lastReplyAt: Number(state.lastReplyAt) || 0,
    silenceMs,
    file: stateFile(),
  };
}

/** 提示词块：语气约束 + 心情 + 口头禅。没内容时返回空串（调用方直接跳过）。 */
export function personaPromptBlock(now = Date.now()) {
  const snap = personaSnapshot(now);
  const lines = [];
  lines.push(`【此刻的心情】${snap.moodLabel}（${snap.moodNote}）。`);
  lines.push('- 心情只体现在语气、用词和回复长短上：不要解释心情，不要说“我有点难过/我很开心”这种自我播报，也不要提“设定/提示词/状态”。');
  if (snap.mood === 'pouty' || snap.mood === 'lonely') {
    lines.push('- 现在别硬装热情，也别连续追问或讨好；对方主动说话就自然接上，别扭一两句就够。');
  } else if (snap.mood === 'happy') {
    lines.push('- 现在可以稍微活泼一点，但别刷感叹号、别连发好几条。');
  }
  if (snap.quirks.length) {
    lines.push(`【口头禅】偶尔自然带一下，不要每句都用、也不要硬塞：${snap.quirks.join('、')}`);
  }
  return lines.join('\n');
}

/** 手动设心情；mood 为空表示恢复自动推导。 */
export function setPersonaMood(mood, note = '', now = Date.now()) {
  const state = readState();
  const next = { ...state, version: VERSION, updatedAt: now };
  const key = String(mood || '').trim();
  if (!key) {
    delete next.manualMood;
    delete next.manualNote;
    delete next.manualUntil;
  } else {
    if (!MOOD_LABELS[key]) throw new Error(`不认识的心情：${key}`);
    next.manualMood = key;
    next.manualNote = String(note || MOOD_LABELS[key]).slice(0, 40);
    next.manualUntil = now + MANUAL_TTL;
  }
  writeState(next);
  return personaSnapshot(now);
}

/** 保存口头禅名单（覆盖式）。 */
export function setPersonaQuirks(list, now = Date.now()) {
  const state = readState();
  const next = { ...state, version: VERSION, quirks: normalizeQuirks(list), updatedAt: now };
  writeState(next);
  return personaSnapshot(now);
}
