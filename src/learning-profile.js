/**
 * 学习成果（贴吧 / B站 / 抖音 → 经历 + 近况）—— 与人格状态一样，是跨进程共享的文件。
 *
 * 分工：
 *   · 采集 / 提炼 / 写盘由 backend/lib/learning-loop.js（插件侧）负责；
 *   · 这里只做「读 + 拼提示词块 + 自动人设层」的薄封装，QQ 桥接、桌宠、抖音都读同一份。
 *
 * 安全边界（很重要）：
 *   · 自动进化只写 persona.daily.auto.md（近况/兴趣/态度），**不碰 persona.md 核心人格**；
 *   · 每次覆盖都把旧内容追加进 persona.daily.auto.history.jsonl，可回滚；
 *   · 提示词里明确要求「这些只是她自己的见闻，不主动汇报、不每条都提」，
 *     避免她一开口就背贴吧帖子。
 */
import fs from 'node:fs';
import path from 'node:path';
import { CHARACTERS_DIR, SURFCORE_DIR, readCurrentCharacter } from './character-persona.js';

const VERSION = 1;
const MAX_EXPERIENCES = 120;
const PLATFORM_LABELS = { tieba: '贴吧', bili: 'B站', douyin: '抖音' };

function profileDir() {
  try {
    const current = readCurrentCharacter();
    if (current?.id) return path.join(CHARACTERS_DIR, String(current.id));
  } catch { /* 没有角色体系 */ }
  return path.join(SURFCORE_DIR, 'learning');
}

export function learningPaths() {
  const dir = profileDir();
  return {
    dir,
    profile: path.join(dir, 'learning-profile.json'),
    autoPersona: path.join(dir, 'persona.daily.auto.md'),
    autoPersonaHistory: path.join(dir, 'persona.daily.auto.history.jsonl'),
  };
}

function readJson(file, fallback = null) {
  try {
    const raw = fs.readFileSync(file, 'utf8');
    if (!raw.trim()) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, file);
}

export function readLearningProfile() {
  const data = readJson(learningPaths().profile, null);
  if (!data || typeof data !== 'object') {
    return {
      version: VERSION,
      updatedAt: 0,
      lastRunAt: 0,
      cursors: {},
      experiences: [],
      interests: [],
      brief: '',
      persona: '',
      stats: { runs: 0, items: 0 },
    };
  }
  return {
    version: VERSION,
    updatedAt: Number(data.updatedAt) || 0,
    lastRunAt: Number(data.lastRunAt) || 0,
    cursors: data.cursors && typeof data.cursors === 'object' ? data.cursors : {},
    experiences: Array.isArray(data.experiences) ? data.experiences.slice(-MAX_EXPERIENCES) : [],
    interests: Array.isArray(data.interests) ? data.interests.slice(0, 16) : [],
    brief: String(data.brief ?? '').slice(0, 400),
    persona: String(data.persona ?? '').slice(0, 600),
    stats: {
      runs: Number(data.stats?.runs) || 0,
      items: Number(data.stats?.items) || 0,
    },
  };
}

export function writeLearningProfile(next) {
  const paths = learningPaths();
  const current = readLearningProfile();
  const merged = {
    ...current,
    ...next,
    version: VERSION,
    updatedAt: Date.now(),
    experiences: (Array.isArray(next.experiences) ? next.experiences : current.experiences).slice(-MAX_EXPERIENCES),
  };
  writeJson(paths.profile, merged);
  return merged;
}

export function readAutoPersona() {
  try {
    const raw = fs.readFileSync(learningPaths().autoPersona, 'utf8');
    const lines = raw.split('\n').filter((line) => !line.startsWith('<!--'));
    return lines.join('\n').trim();
  } catch {
    return '';
  }
}

/** 覆盖自动人设层；旧内容先入历史（最多保留 30 条），失败不抛。 */
export function writeAutoPersona(text, now = Date.now()) {
  const body = String(text ?? '').trim().slice(0, 600);
  if (!body) return false;
  const paths = learningPaths();
  try {
    const previous = readAutoPersona();
    fs.mkdirSync(paths.dir, { recursive: true });
    if (previous) {
      const history = readJsonLines(paths.autoPersonaHistory).slice(-29);
      history.push({ at: now, text: previous });
      fs.writeFileSync(paths.autoPersonaHistory, `${history.map((row) => JSON.stringify(row)).join('\n')}\n`, 'utf8');
    }
    const stamp = new Date(now).toISOString();
    fs.writeFileSync(paths.autoPersona, `<!-- 自动生成，勿手改；回滚见 角色 → 学习 -->\n<!-- updated: ${stamp} -->\n${body}\n`, 'utf8');
    return true;
  } catch {
    return false;
  }
}

export function rollbackAutoPersona() {
  const paths = learningPaths();
  try {
    const history = readJsonLines(paths.autoPersonaHistory);
    const last = history.pop();
    if (!last) return { ok: false, error: '没有可回滚的人设快照' };
    fs.writeFileSync(paths.autoPersonaHistory, `${history.map((row) => JSON.stringify(row)).join('\n')}\n`, 'utf8');
    fs.writeFileSync(paths.autoPersona, `<!-- 自动生成，已回滚 -->\n${last.text}\n`, 'utf8');
    return { ok: true, text: last.text, at: last.at };
  } catch (error) {
    return { ok: false, error: String(error?.message ?? error) };
  }
}

function readJsonLines(file) {
  try {
    return fs.readFileSync(file, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => { try { return JSON.parse(line); } catch { return null; } })
      .filter(Boolean);
  } catch {
    return [];
  }
}

/** 提示词块：她自己的见闻 + 自动近况。没学过东西时返回空串。 */
export function learningPromptBlock() {
  const profile = readLearningProfile();
  const persona = readAutoPersona();
  if (!profile.experiences.length && !persona) return '';
  const lines = [];
  if (profile.experiences.length) {
    lines.push('【她最近自己看到的（她私下的生活，不是主人说的）】');
    for (const item of profile.experiences.slice(-3)) {
      const label = PLATFORM_LABELS[item.platform] || item.platform;
      lines.push(`- [${label}] ${String(item.text).slice(0, 120)}`);
    }
    lines.push('- 这些只是背景：不要主动汇报"我今天看了…"，也不要每条消息都提；被问起或话题自然相关时才说。');
    lines.push('- 可以有自己的态度（喜欢/无感/嫌烦），但不要编造没看到的细节。');
  }
  if (persona) {
    lines.push('【她最近的近况（自动更新）】');
    lines.push(persona.slice(0, 400));
  }
  return lines.join('\n');
}
