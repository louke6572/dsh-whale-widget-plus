/**
 * 身份对齐（QQ ⇄ B站，结构上可扩展到贴吧）。
 *
 * 为什么单独一层：
 *   记忆同步是“内容”，身份对齐是“谁是谁”。用户要求对齐**高于**同步开关：
 *   即使两边记忆同步都关掉，只要对齐开着，角色仍应认出同一个人。
 *
 * 隐私边界：
 *   · 对齐表只存「平台账号 ↔ 平台账号」的映射和昵称，**不存任何对话内容**。
 *   · 给 B 站侧的提示只带 QQ 昵称，不带 QQ 号/群号；给 QQ 侧的提示可带 B 站 mid
 *     （mid 本来就是公开的），但明确禁止公开对方 QQ 号/群号。
 *   · 候选需要管理员批准（默认 requireApproval=true），不自动把猜测变成事实。
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import {
  ALIGN_FILE, BILI_ALIGNMENT_FILE, QQ_ALIGNMENT_BRIEF, ensureDirs,
} from './paths.js';
import { assertSafeOutput, normalizeText, sanitizeText } from './privacy.js';
import { backupFile, clone, readJson, writeJsonAtomic, writeTextAtomic } from './store.js';

const FORMAT = 1;
const PLATFORM_LABELS = { qq: 'QQ', bili: 'B站', tieba: '贴吧' };

export const DEFAULT_ALIGN_STATE = {
  version: FORMAT,
  updatedAt: '',
  links: [],
  candidates: [],
};

export function platformLabel(id) {
  return PLATFORM_LABELS[id] ?? String(id ?? '未知平台');
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeIdentity(platform, identity) {
  if (!identity || typeof identity !== 'object') return null;
  const id = String(identity.id ?? identity.uin ?? identity.mid ?? '').trim();
  if (!/^\d{4,15}$/.test(id)) return null;
  const out = {
    id,
    name: sanitizeText(identity.name ?? '', { dropUnsafeLines: false, keepNumbers: false, maxChars: 40 }).text || '',
  };
  if (platform === 'qq' && Array.isArray(identity.groups)) {
    out.groups = [...new Set(identity.groups.map(String).filter((g) => /^\d{4,15}$/.test(g)))];
  }
  if (platform === 'bili') out.url = `https://space.bilibili.com/${id}`;
  return out;
}

function normalizeLink(link) {
  if (!link || typeof link !== 'object') return null;
  const identities = {};
  for (const [platform, identity] of Object.entries(link.identities ?? {})) {
    const normalized = normalizeIdentity(platform, identity);
    if (normalized) identities[platform] = normalized;
  }
  if (!identities.qq && !identities.bili) return null;
  // 称呼（label）：管理员给这个人定的唯一叫法。以后 QQ / B站 都只用它，
  // 不再用 QQ 群名片或 B站昵称——昵称会变、会撞，ID 不会（见 PITFALLS #13）。
  const label = sanitizeText(link.label ?? link.alias ?? '', {
    dropUnsafeLines: false, keepNumbers: false, maxChars: 24,
  }).text || '';
  return {
    id: String(link.id || `al_${crypto.randomUUID()}`),
    identities,
    label: label.trim(),
    source: String(link.source ?? 'manual').slice(0, 40),
    confidence: Math.max(0, Math.min(1, Number(link.confidence ?? 1))),
    verified: link.verified !== false,
    note: normalizeText(link.note ?? '').slice(0, 200),
    createdAt: String(link.createdAt || nowIso()),
    updatedAt: String(link.updatedAt || nowIso()),
  };
}

export function readAlignState() {
  const raw = readJson(ALIGN_FILE, null);
  if (!raw || typeof raw !== 'object') return clone(DEFAULT_ALIGN_STATE);
  const links = (Array.isArray(raw.links) ? raw.links : []).map(normalizeLink).filter(Boolean);
  const candidates = (Array.isArray(raw.candidates) ? raw.candidates : []).map(normalizeCandidate).filter(Boolean);
  return { version: FORMAT, updatedAt: raw.updatedAt ?? '', links, candidates };
}

function normalizeCandidate(candidate) {
  if (!candidate || typeof candidate !== 'object') return null;
  const platform = String(candidate.platform ?? '');
  if (!['qq', 'bili', 'tieba'].includes(platform)) return null;
  const identity = normalizeIdentity(platform, candidate.identity);
  if (!identity) return null;
  const counterpart = normalizeIdentity(candidate.counterpartPlatform, candidate.counterpart);
  return {
    id: String(candidate.id || `ac_${crypto.randomUUID()}`),
    platform,
    identity,
    counterpartPlatform: String(candidate.counterpartPlatform ?? ''),
    counterpart,
    source: String(candidate.source ?? 'scan').slice(0, 60),
    confidence: Math.max(0, Math.min(1, Number(candidate.confidence ?? 0.5))),
    evidence: normalizeText(candidate.evidence ?? '').slice(0, 160),
    createdAt: String(candidate.createdAt || nowIso()),
    status: candidate.status === 'rejected' ? 'rejected' : 'pending',
  };
}

export function writeAlignState(state, { writeBriefs = true } = {}) {
  ensureDirs();
  const next = {
    version: FORMAT,
    updatedAt: nowIso(),
    links: (state.links ?? []).map(normalizeLink).filter(Boolean).slice(0, 500),
    candidates: (state.candidates ?? []).map(normalizeCandidate).filter(Boolean).slice(0, 500),
  };
  backupFile(ALIGN_FILE, 'alignments');
  writeJsonAtomic(ALIGN_FILE, next);
  if (writeBriefs) writeAlignmentBriefs(next);
  return next;
}

export function listLinks() {
  return readAlignState().links;
}

export function listCandidates({ includeRejected = false } = {}) {
  const state = readAlignState();
  return includeRejected ? state.candidates : state.candidates.filter((c) => c.status !== 'rejected');
}

export function addLink(input) {
  const state = readAlignState();
  const link = normalizeLink({ ...input, id: `al_${crypto.randomUUID()}`, createdAt: nowIso(), updatedAt: nowIso() });
  if (!link) throw new Error('至少需要一个合法的 QQ 或 B站身份');
  // 同一对人只保留一条（按 qq/bili 组合去重）
  const key = `${link.identities.qq?.id ?? ''}|${link.identities.bili?.id ?? ''}`;
  // 先加 QQ 后补 B站（或反过来）很常见：补齐另一边时把同一 QQ / 同一 B站 的单边旧记录合并掉，
  // 否则同一个人会有两条记录、两个称呼，提示词里互相打架。旧记录设过称呼就继承过来。
  let inheritedLabel = '';
  state.links = state.links.filter((item) => {
    const otherKey = `${item.identities.qq?.id ?? ''}|${item.identities.bili?.id ?? ''}`;
    if (key === '|' || otherKey === key) return false;
    if (link.identities.qq && link.identities.bili) {
      const oneSided = !item.identities.qq || !item.identities.bili;
      const sameQq = item.identities.qq?.id === link.identities.qq.id;
      const sameBili = item.identities.bili?.id === link.identities.bili.id;
      if (oneSided && (sameQq || sameBili)) {
        if (!inheritedLabel && item.label) inheritedLabel = item.label;
        return false;
      }
    }
    return true;
  });
  if (!link.label && inheritedLabel) link.label = inheritedLabel;
  state.links.unshift(link);
  return writeAlignState(state).links[0];
}

export function updateLink(id, patch) {
  const state = readAlignState();
  const index = state.links.findIndex((item) => item.id === id);
  if (index < 0) throw new Error('对齐记录不存在');
  const merged = normalizeLink({
    ...state.links[index],
    ...patch,
    identities: { ...state.links[index].identities, ...(patch?.identities ?? {}) },
    id,
    updatedAt: nowIso(),
  });
  state.links[index] = merged;
  writeAlignState(state);
  return merged;
}

export function removeLink(id) {
  const state = readAlignState();
  const before = state.links.length;
  state.links = state.links.filter((item) => item.id !== id);
  writeAlignState(state);
  return { removed: before - state.links.length };
}

export function addCandidate(input) {
  const candidate = normalizeCandidate(input);
  if (!candidate) return null;
  const state = readAlignState();
  const dup = state.candidates.find((item) => (
    item.platform === candidate.platform &&
    item.identity.id === candidate.identity.id &&
    item.counterpart?.id === candidate.counterpart?.id
  ));
  if (dup) return dup;
  state.candidates.unshift(candidate);
  state.candidates = state.candidates.slice(0, 200);
  writeAlignState(state, { writeBriefs: false });
  return candidate;
}

export function approveCandidate(id, overrides = {}) {
  const state = readAlignState();
  const candidate = state.candidates.find((item) => item.id === id);
  if (!candidate) throw new Error('候选不存在');
  const identities = { [candidate.platform]: candidate.identity };
  if (candidate.counterpart && candidate.counterpartPlatform) {
    identities[candidate.counterpartPlatform] = candidate.counterpart;
  }
  const link = addLink({
    identities,
    source: candidate.source,
    confidence: candidate.confidence,
    verified: true,
    note: candidate.evidence,
    ...overrides,
  });
  const next = readAlignState();
  next.candidates = next.candidates.filter((item) => item.id !== id);
  writeAlignState(next, { writeBriefs: true });
  return link;
}

export function rejectCandidate(id) {
  const state = readAlignState();
  const candidate = state.candidates.find((item) => item.id === id);
  if (!candidate) throw new Error('候选不存在');
  candidate.status = 'rejected';
  writeAlignState(state, { writeBriefs: false });
  return { ok: true };
}

export function findByQq(uin) {
  const id = String(uin ?? '');
  return readAlignState().links.filter((link) => link.identities.qq?.id === id);
}

export function findByBili(mid) {
  const id = String(mid ?? '');
  return readAlignState().links.filter((link) => link.identities.bili?.id === id);
}

export function resolveAny(platform, id) {
  const key = String(id ?? '');
  return readAlignState().links.filter((link) => link.identities[platform]?.id === key);
}

function briefHeader(title, priority = true) {
  return [
    `【${title}${priority ? ' · 最高优先级' : ''}｜不受记忆同步开关影响】`,
    '这条只用于“认出同一个人”，不是对话记录；不含任何私信/私聊内容。',
  ];
}

export function buildQqAlignmentBrief({ groupIds = [], maxEntries = 200, links: providedLinks = null } = {}) {
  const state = readAlignState();
  const groups = new Set((groupIds ?? []).map(String));
  const candidates = (Array.isArray(providedLinks) ? providedLinks : state.links).filter((link) => {
    const qq = link.identities?.qq;
    if (!qq) return false;
    if (!groups.size) return true;
    return (qq.groups ?? []).some((group) => groups.has(group));
  });
  // 跨平台的照旧全部列出；只有 QQ、没有 B站 的人也允许，但只有在设了称呼时才有提示价值。
  const pairs = candidates.filter((link) => link.identities.bili).slice(0, maxEntries);
  const qqOnly = candidates
    .filter((link) => !link.identities.bili && String(link.label ?? '').trim())
    .slice(0, maxEntries);
  if (!pairs.length && !qqOnly.length) return '';
  const links = [...pairs, ...qqOnly];
  const withLabel = links.some((link) => String(link.label ?? '').trim());
  const lines = briefHeader('身份对齐（QQ 侧）');
  if (pairs.length) {
    lines.push('');
    lines.push(withLabel
      // 有称呼时必须带 QQ 号：称呼是“管理员点名”的，只能按 ID 对，不能靠会变的群昵称。
      ? '以下 QQ 群友与 B 站账号是**同一个人**（带称呼的人括号里会写 QQ 号，只用来对消息里的发送者，**绝对不要念出来**）：'
      : '以下 QQ 群友与 B 站账号是**同一个人**（按群昵称认人；QQ 号不在提示里出现）：');
    for (const link of pairs) {
      const qq = link.identities.qq;
      const bili = link.identities.bili;
      const label = String(link.label ?? '').trim();
      const qqPart = label ? `群友「${qq.name || '群友'}」（QQ ${qq.id}）` : `群友「${qq.name || '群友'}」`;
      lines.push(`- ${qqPart} ↔ B站「${bili.name || bili.id}」(mid ${bili.id})${label ? ` → **以后只叫 TA「${label}」**` : ''}`);
    }
  }
  if (qqOnly.length) {
    lines.push('');
    lines.push('以下只在 QQ 登记过（没有 B站 号），也按管理员设的称呼叫（括号里的 QQ 号只用来对发送者，**绝对不要念出来**）：');
    for (const link of qqOnly) {
      const qq = link.identities.qq;
      const label = String(link.label ?? '').trim();
      lines.push(`- 群友「${qq.name || '群友'}」（QQ ${qq.id}） → **以后只叫 TA「${label}」**`);
    }
  }
  lines.push('');
  lines.push('用法与红线：');
  let step = 1;
  if (withLabel) {
    lines.push(`${step}. 上面标了「以后只叫 TA「…」」的人，只要 QQ 号对上（**只登记了 QQ、没有 B站 的人也算**），就**只用这个称呼**叫他：不要用群名片、QQ 昵称、B站昵称代替，也不要自己另起外号。`);
    step += 1;
    lines.push(`${step}. 这个称呼**优先于人格卡里的「怎么称呼群友」表**：同一个人两处叫法冲突时，以这里为准。`);
    step += 1;
    lines.push(`${step}. 没标称呼的人照旧按人格卡/昵称叫；拿不准是不是同一个人时，用对方当前平台的名字，别硬套。`);
    step += 1;
  }
  lines.push(`${step}. 在 B 站遇到上面的人时，要认出是谁；在群里提到 B 站时，也要知道对应的是谁。`);
  step += 1;
  lines.push(`${step}. **绝不**在群聊、公开评论、动态、直播间里写出对方的 QQ 号、群号、B 站 mid 或主页，除非对方自己已经公开说过。`);
  step += 1;
  lines.push(`${step}. 对齐信息来自管理员登记/本人自述；如果认错或信息过期，以对方当场说的为准，并提示管理员更新对齐表。`);
  step += 1;
  lines.push(`${step}. 对齐不等于可以搬运内容：私信、私聊、密码、地址、联系方式等仍然一律不能跨平台。`);
  return lines.join('\n');
}

export function buildBiliAlignmentBrief({ maxEntries = 200, links: providedLinks = null } = {}) {
  const state = readAlignState();
  const candidates = (Array.isArray(providedLinks) ? providedLinks : state.links).filter((link) => Boolean(link.identities?.bili));
  // 跨平台的照旧全部列出；只有 B站、没有 QQ 的人也允许，但只有设了称呼时才有提示价值。
  const pairs = candidates.filter((link) => link.identities.qq).slice(0, maxEntries);
  const biliOnly = candidates
    .filter((link) => !link.identities.qq && String(link.label ?? '').trim())
    .slice(0, maxEntries);
  if (!pairs.length && !biliOnly.length) return '';
  const links = [...pairs, ...biliOnly];
  const withLabel = links.some((link) => String(link.label ?? '').trim());
  const lines = briefHeader('身份对齐（B 站侧）');
  if (pairs.length) {
    lines.push('');
    lines.push('以下 B 站用户是你的 QQ 群友（只给昵称，不给 QQ 号/群号）：');
    for (const link of pairs) {
      const qq = link.identities.qq;
      const bili = link.identities.bili;
      const label = String(link.label ?? '').trim();
      lines.push(`- B站「${bili.name || bili.id}」(mid ${bili.id}) = QQ 群友「${qq.name || '群友'}」${label ? ` → **以后只叫 TA「${label}」**` : ''}`);
    }
  }
  if (biliOnly.length) {
    lines.push('');
    lines.push('以下只在 B站 登记过（没有 QQ 号），也按管理员设的称呼叫（不要因为对不上 QQ 就改叫 B站 昵称）：');
    for (const link of biliOnly) {
      const bili = link.identities.bili;
      const label = String(link.label ?? '').trim();
      lines.push(`- B站「${bili.name || bili.id}」(mid ${bili.id}) → **以后只叫 TA「${label}」**`);
    }
  }
  lines.push('');
  lines.push('用法与红线：');
  let step = 1;
  if (withLabel) {
    lines.push(`${step}. 上面标了「以后只叫 TA「…」」的人，只要 mid 对上（**只登记了 B站、没有 QQ 的人也算**），就**只用这个称呼**叫他：不要用 B站 昵称、QQ 昵称，也不要自己起外号。`);
    step += 1;
    lines.push(`${step}. 这个称呼**优先于人格卡里的「怎么称呼群友」表**；拿不准是不是同一个人时，用对方 B站 当前昵称，别硬套。`);
    step += 1;
  }
  lines.push(`${step}. 在 B 站认出他们时可以自然打招呼；但**不要**在公开评论/动态/直播间写出对方的 QQ 号、群号或群昵称。`);
  step += 1;
  lines.push(`${step}. 不要用 QQ 群里的私聊内容、私信内容去 B 站搭话；也不要问对方“你是不是群里的谁”来验证身份。`);
  step += 1;
  lines.push(`${step}. 对齐只用于认人，不改变 B 站这边的分享/评论额度与边界。`);
  return lines.join('\n');
}

export function writeAlignmentBriefs(state = readAlignState()) {
  try {
    ensureDirs();
    const qqBrief = buildQqAlignmentBrief({ maxEntries: 200 });
    const biliBrief = buildBiliAlignmentBrief({ maxEntries: 200 });
    // 这两个文件只给提示词读，包含 QQ 号是必要的；但仍做一次“无密钥/无 PII”闸门。
    if (qqBrief) assertSafeOutput(qqBrief.replace(/\b\d{5,12}\b/g, ''), 'QQ 对齐简报');
    if (biliBrief) assertSafeOutput(biliBrief.replace(/\b\d{5,12}\b/g, ''), 'B站对齐简报');
    writeTextAtomic(QQ_ALIGNMENT_BRIEF, qqBrief ? `${qqBrief}\n` : '');
    writeTextAtomic(BILI_ALIGNMENT_FILE, biliBrief ? `${biliBrief}\n` : '');
    return { qqChars: qqBrief.length, biliChars: biliBrief.length };
  } catch (error) {
    return { error: String(error?.message ?? error) };
  }
}

export function stats() {
  const state = readAlignState();
  return {
    enabled: true,
    links: state.links.length,
    labels: state.links.filter((link) => String(link.label ?? '').trim()).length,
    candidates: state.candidates.filter((c) => c.status !== 'rejected').length,
    byPlatform: {
      qq: state.links.filter((l) => l.identities.qq).length,
      bili: state.links.filter((l) => l.identities.bili).length,
      tieba: state.links.filter((l) => l.identities.tieba).length,
    },
    updatedAt: state.updatedAt,
  };
}

/**
 * 从一段公开文本里抽取“本人自述”的账号候选。
 * 只做候选，不直接建立对齐；默认要管理员批准。
 */
export function detectCandidatesFromText({ platform, text, author = {}, source = 'scan', counterpartPlatform = '' }) {
  const raw = normalizeText(text);
  if (!raw || raw.length > 2000) return [];
  const found = [];
  const authorName = normalizeText(author.name ?? '').slice(0, 40);
  const authorId = String(author.id ?? '');

  const push = (identityPlatform, identity, counterpartPlatformValue, counterpart, confidence, evidence) => {
    const safeEvidence = sanitizeText(evidence, { keepNumbers: true, dropUnsafeLines: false, maxChars: 120 }).text || '（原文含敏感信息，已略）';
    if (!identity || !counterpart) return;
    found.push({
      platform: identityPlatform,
      identity,
      counterpartPlatform: counterpartPlatformValue,
      counterpart,
      source,
      confidence,
      evidence: safeEvidence,
    });
  };

  if (platform === 'qq') {
    const patterns = [
      { re: /(?:我|本人)?(?:的)?\s*[Bb]\s*站(?:号|账号|帐号|ID|id|uid|UID)?\s*(?:是|叫|为|[:：])?\s*([A-Za-z0-9_\-\u4e00-\u9fa5]{2,20})/g, confidence: 0.72 },
      { re: /[Bb]站\s*[:：]\s*([A-Za-z0-9_\-\u4e00-\u9fa5]{2,20})/g, confidence: 0.66 },
      { re: /bilibili\.com\/space\/(\d{5,12})/gi, confidence: 0.95, mid: true },
      { re: /(?:B站|b站).{0,10}(?:uid|UID|mid)\s*[:：=是为]?\s*(\d{5,12})/g, confidence: 0.9, mid: true },
    ];
    for (const pattern of patterns) {
      pattern.re.lastIndex = 0;
      let match;
      while ((match = pattern.re.exec(raw)) !== null) {
        const value = String(match[1] ?? '').trim();
        if (!value) continue;
        if (!pattern.mid && /^(?:UID|uid|Id|id|ID|mid|MID|账号|帐号|号|名字|叫|是|为)$/.test(value)) continue;
        if (pattern.mid && !/^\d{5,12}$/.test(value)) continue;
        if (!pattern.mid && /^\d{5,12}$/.test(value)) {
          // 纯数字昵称也可能是 mid；当作 mid 处理
          push('qq', { id: authorId, name: authorName }, 'bili', { id: value, name: '' }, pattern.confidence, raw.slice(Math.max(0, match.index - 20), match.index + 60));
          push('bili', { id: value, name: '' }, 'qq', { id: authorId, name: authorName }, pattern.confidence, raw.slice(Math.max(0, match.index - 20), match.index + 60));
          continue;
        }
        if (pattern.mid) {
          const identity = { id: value, name: '' };
          push('qq', { id: authorId, name: authorName }, 'bili', identity, pattern.confidence, raw.slice(Math.max(0, match.index - 20), match.index + 60));
          push('bili', identity, 'qq', { id: authorId, name: authorName }, pattern.confidence, raw.slice(Math.max(0, match.index - 20), match.index + 60));
        } else {
          // 只有昵称没有 mid：存成候选线索，mid 留空，管理员补齐后才能生效
          push('qq', { id: authorId, name: authorName }, 'bili', { id: '', name: value }, pattern.confidence, raw.slice(Math.max(0, match.index - 20), match.index + 60));
        }
      }
    }
  }

  if (platform === 'bili') {
    const patterns = [
      { re: /(?:我|本人)?(?:的)?\s*(?:QQ|qq|Q)\s*(?:号|账号)?\s*(?:是|为|[:：])?\s*(\d{5,12})/g, confidence: 0.9 },
      { re: /(?:加|联系)\s*(?:我)?\s*(?:QQ|qq)\s*[:：]?\s*(\d{5,12})/g, confidence: 0.8 },
      { re: /(?:QQ|qq)群\s*[:：]?\s*(\d{5,12})/g, confidence: 0.35, group: true },
    ];
    for (const pattern of patterns) {
      pattern.re.lastIndex = 0;
      let match;
      while ((match = pattern.re.exec(raw)) !== null) {
        const value = String(match[1] ?? '').trim();
        if (!/^\d{5,12}$/.test(value)) continue;
        const identity = { id: authorId, name: authorName };
        const counterpart = { id: value, name: '' };
        push('bili', identity, 'qq', counterpart, pattern.confidence, raw.slice(Math.max(0, match.index - 20), match.index + 60));
      }
    }
  }

  // 去重 + 丢掉空 id 的昵称线索（它们无法直接成链接，但可以展示为候选提示）
  const seen = new Set();
  return found.filter((item) => {
    if (item.identity?.id || item.counterpart?.id) {
      const key = `${item.platform}:${item.identity?.id ?? ''}:${item.counterpartPlatform}:${item.counterpart?.id ?? ''}:${item.counterpart?.name ?? ''}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }
    return false;
  }).slice(0, 20);
}

export function exportAlignments() {
  return {
    exportedAt: nowIso(),
    format: 'surfcore/alignments',
    version: FORMAT,
    state: readAlignState(),
  };
}

export function importAlignments(payload, { merge = true } = {}) {
  const incoming = payload?.state ?? payload;
  const links = (incoming?.links ?? []).map(normalizeLink).filter(Boolean);
  if (!links.length) throw new Error('导入文件里没有合法的对齐记录');
  const state = merge ? readAlignState() : clone(DEFAULT_ALIGN_STATE);
  const existing = new Map(state.links.map((link) => [`${link.identities.qq?.id ?? ''}|${link.identities.bili?.id ?? ''}`, link]));
  for (const link of links) {
    existing.set(`${link.identities.qq?.id ?? ''}|${link.identities.bili?.id ?? ''}`, link);
  }
  state.links = [...existing.values()];
  return writeAlignState(state);
}
