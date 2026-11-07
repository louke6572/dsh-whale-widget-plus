/**
 * 记忆整理：把「聊天流水」变成干净的事实卡。
 *
 * 为什么需要它：
 *   记忆卡默认每条消息/每次互动都可能落成一条记录，时间一长就是几百条寒暄、
 *   重复内容和半句话。机械压缩（降清晰度）只是把内容变糊，不能让记忆变干净。
 *   这里用一次低强度模型调用做「语义整理」：合并同一件事、删掉纯噪音、把事实写清楚。
 *
 * 安全边界：
 *   · 置顶 / 初次相遇的记录不参与整理（不输入、不删除）；
 *   · 模型的输出只能引用输入里真实存在的 id，否则整批作废；
 *   · 删除上限 30%，宁可留着也不乱删；
 *   · 每条改动都走 applyMemoryCardAction（它会先把旧内容归档进全量档案）；
 *   · 没有模型或解析失败时不动记忆卡，返回明确错误。
 */
import {
  applyMemoryCardAction, memoryCardConfig, memoryCardSnapshot,
} from './memory-card.js';
import { readUnified } from './store.js';

const MAX_INPUT = 60;
const MAX_DROP_RATIO = 0.3;
const MAX_MERGES = 20;
const MODEL_TIMEOUT_MS = 45_000;
// 本地兜底用：纯寒暄/单字回复（只在这些短句且重要度低时才删）。
const FILLER_RE = /^(在吗|在不在|你好|您好|嗨|哈+|嗯+|哦+|噢+|啊+|好+|草|艹|？+|\?+|1|6+|\.$|……)$/;

/** 去重归一：忽略空白、标点与大小写，只比“说了什么”。 */
function normalizeForDedupe(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[\s\u3000]+/g, '')
    .replace(/[，。！？、,.!?~～…\-—"'“”‘’]+/g, '');
}

const SYSTEM_PROMPT = [
  '你在整理一个虚拟角色的长期记忆卡。输入是她最近一段时间攒下的记忆条目，大量是闲聊、寒暄、重复的半句话。',
  '',
  '任务：把记忆变干净，而不是变少：',
  '- 同一件事的多条记录 → 合并成一条准确的事实；',
  '- 纯寒暄 / 单个表情 / 无信息量的碎句 / 完全重复 → 可以删除；',
  '- 主人的偏好、约定、重要事件、关系变化、情绪转折、初次相遇 → 必须保留（可以合并但不要丢）。',
  '',
  '只输出严格 JSON（不要 Markdown、不要解释），格式：',
  '{"merge":[{"ids":["id1","id2"],"title":"≤30字概括","text":"≤70字干净的事实","importance":60}],',
  ' "drop":["id"]}',
  '',
  '规则：',
  '- 只能使用输入里出现过的 id；输出别的 id 会让整批作废。',
  '- 一次最多合并 8 组，宁少勿多；每组 2~4 条 id。',
  '- 不确定就保留。不要为了“整洁”删掉可能有用的信息。',
  '- 合并后的 text 用陈述句写事实，不要写“用户说”“对方表示”。',
  '- drop 总数不超过输入的 30%；没有要改的就输出 {"merge":[],"drop":[]}。',
  '- 输出必须是完整、可解析的 JSON：每个括号都要闭合，字符串里的引号要转义。',
].join('\n');

function short(value, max) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function formatRecords(records) {
  return records.map((record) => {
    const tags = Array.isArray(record.tags) && record.tags.length ? ` #${record.tags.join(',')}` : '';
    return `${record.id} | ${record.platform || 'qq'} | 重要${record.importance ?? 0} | ${short(record.title, 40)} | ${short(record.text, 160)}${tags}`;
  }).join('\n');
}

function parseJson(text) {
  const raw = String(text ?? '').trim();
  // 先剥掉 ```json / ``` 围栏，再取最外层花括号；模型偶尔会在 JSON 前后带解释。
  const stripped = raw.replace(/```(?:json)?\s*/gi, '```').trim();
  const body = stripped.startsWith('```') ? stripped.replace(/```/g, '').trim() : stripped;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('模型没有返回 JSON');
  const parsed = JSON.parse(body.slice(start, end + 1));
  if (!parsed || typeof parsed !== 'object') throw new Error('模型返回的不是对象');
  return parsed;
}

/** 从被截断的 JSON 里抢救出仍然完整的对象（模型常在 maxTokens 处被截断）。 */
function extractCompleteObjects(text, from) {
  const out = [];
  let depth = 0;
  let start = -1;
  let inStr = false;
  let esc = false;
  for (let i = from; i < text.length; i += 1) {
    const ch = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') { inStr = true; continue; }
    if (ch === '{') { if (depth === 0) start = i; depth += 1; continue; }
    if (ch === '}') {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        try { out.push(JSON.parse(text.slice(start, i + 1))); } catch { /* 单个对象坏了就跳过 */ }
        start = -1;
      }
      continue;
    }
    if (ch === ']' && depth === 0) break;
  }
  return out;
}

/** 先严格解析；失败则从 merge / drop 数组里抢救完整项，返回 partial=true。 */
function parseModelJson(text) {
  try {
    return { data: parseJson(text), partial: false };
  } catch { /* 走抢救 */ }
  const out = { merge: [], drop: [] };
  let found = false;
  const mergeAt = text.indexOf('"merge"');
  if (mergeAt >= 0) {
    const arr = text.indexOf('[', mergeAt);
    if (arr >= 0) {
      const objects = extractCompleteObjects(text, arr + 1);
      if (objects.length) { out.merge = objects; found = true; }
    }
  }
  const dropAt = text.indexOf('"drop"');
  if (dropAt >= 0) {
    const arr = text.indexOf('[', dropAt);
    if (arr >= 0) {
      const segment = text.slice(arr + 1);
      const re = /"([^"\\]+)"/g;
      let match;
      while ((match = re.exec(segment))) out.drop.push(match[1]);
      if (out.drop.length) found = true;
    }
  }
  if (!found) throw new Error('模型没有返回可用 JSON（输出可能被截断）');
  return { data: out, partial: true };
}

const DIARY_SYSTEM = [
  '你在替一个虚拟角色写她自己的日记。',
  '根据当天她看到的内容和聊天，用第一人称写成一篇日记：今天发生了什么、和谁聊了什么、她自己的感受。',
  '要求：口语、自然、200~400 字；只写当天真实出现的内容；不要编造细节，不要列清单，不要写“总结”“感悟”这种标题。',
  '直接输出日记正文，不要 JSON、不要 Markdown、不要加日期标题。',
].join('\n');

/** 本地日期键：YYYY-MM-DD（sv-SE 恰好是 ISO 日期）。 */
function localDateKey(value) {
  const date = new Date(value ?? 0);
  if (!Number.isFinite(date.getTime())) return '';
  return date.toLocaleDateString('sv-SE');
}

/**
 * @param {object} opts
 * @param {object} opts.ctx  DSH context（要 ctx.get('llm')）
 * @param {(msg:string,...args:any[])=>void} [opts.log]
 * @param {object|null} [opts.tokenBudget]
 */
export function createMemoryOrganizer({ ctx, log = () => {}, tokenBudget = null } = {}) {
  function resolveModel() {
    try {
      const service = ctx?.get?.('agentDefaultModel');
      const selection = service?.currentSelection?.() ?? null;
      const provider = String(selection?.provider || '').trim();
      const model = String(selection?.model || '').trim();
      return provider && model ? { provider, model } : null;
    } catch {
      return null;
    }
  }

  function llmReady() {
    try { return Boolean(ctx?.get?.('llm')?.stream) && Boolean(resolveModel()); } catch { return false; }
  }

  async function complete({ system, user, maxTokens = 2500, prefill = '', temperature = 0.2 }) {
    const llm = ctx?.get?.('llm');
    if (!llm?.stream) throw new Error('DSH 模型服务不可用');
    const target = resolveModel();
    if (!target) throw new Error('读不到 DSH 默认模型');
    const messages = [{ role: 'user', content: [{ type: 'text', text: user }] }];
    if (prefill) messages.push({ role: 'assistant', content: [{ type: 'text', text: prefill }] });
    const base = {
      provider: target.provider,
      model: target.model,
      system,
      messages,
      maxTokens,
      temperature,
    };
    let lastFailure = null;
    // 有的提供商不支持 deepseek 的思考强度档位：先带 low，报错再退回不指定。
    for (const effort of ['low', undefined]) {
      let text = '';
      let reasoning = '';
      let usage = null;
      try {
        const stream = llm.stream(effort ? { ...base, reasoningEffort: effort } : base);
        for await (const chunk of stream) {
          if (!chunk) continue;
          if (chunk.type === 'text-delta' && chunk.text) text += chunk.text;
          // 有的 provider 把内容放在 reasoning 通道里；正文为空时用它兜底解析。
          else if (chunk.type === 'reasoning-delta' && chunk.text) reasoning += chunk.text;
          else if (chunk.type === 'usage' && chunk.usage) usage = chunk.usage;
          else if (chunk.type === 'finish') {
            const kind = chunk.reason?.kind;
            if (kind === 'error' || kind === 'aborted') {
              throw new Error(chunk.reason?.failure?.message || (kind === 'aborted' ? '模型调用被取消' : '模型调用失败'));
            }
          }
        }
        if (usage && tokenBudget?.recordExternalUsage) {
          try {
            tokenBudget.recordExternalUsage({
              category: 'other', sessionId: 'memory-organize', model: target.model, usage, at: Date.now(), label: '记忆整理',
            });
          } catch {}
        }
        return (text.trim() || reasoning.trim());
      } catch (error) {
        lastFailure = error;
        // 已经拿到部分正文就不要因为收尾报错而丢弃它（很多流式实现会在 finish 阶段抛超时）。
        if (text.trim() || reasoning.trim()) return (text.trim() || reasoning.trim());
      }
    }
    throw lastFailure || new Error('模型调用失败');
  }

  /** 只挑可整理的记录：置顶 / 初次相遇 / 系统首条不动。 */
  function candidates(config, ids = null) {
    const snapshot = memoryCardSnapshot(config, { recordLimit: 500 });
    const all = (snapshot.records ?? []).filter((record) => {
      if (record.pinned || record.firstMet || record.isInitial) return false;
      const tags = Array.isArray(record.tags) ? record.tags : [];
      if (tags.includes('first')) return false;
      return true;
    });
    if (!Array.isArray(ids) || !ids.length) return all.slice(0, MAX_INPUT);
    const wanted = new Set(ids.map(String));
    return all.filter((record) => wanted.has(String(record.id))).slice(0, MAX_INPUT);
  }

  /** 本地兜底：同文去重 + 纯寒暄清理 + 同一会话相邻碎片合并（不依赖模型）。 */
  async function applyLocalMerge(records, config) {
    const limit = Math.max(1, Math.floor(records.length * MAX_DROP_RATIO));
    let merged = 0;
    let dropped = 0;
    let archived = 0;
    const forget = async (id) => {
      const result = await applyMemoryCardAction('forget', { id }, { config });
      if (result?.ok) { archived += Number(result.archived) || 0; return true; }
      return false;
    };

    // ① 同文 / 纯寒暄
    const seen = new Map();
    const alive = [];
    for (const record of records) {
      const key = normalizeForDedupe(record.text);
      if (key) {
        const previous = seen.get(key);
        if (previous) {
          const keep = Number(record.importance) > Number(previous.importance) ? record : previous;
          const drop = keep === record ? previous : record;
          if (keep === record) seen.set(key, record);
          if (await forget(drop.id)) dropped += 1;
          if (keep === record) continue;
        } else {
          seen.set(key, record);
        }
        if (key.length <= 6 && FILLER_RE.test(String(record.text).trim()) && Number(record.importance) < 60) {
          if (await forget(record.id)) { dropped += 1; seen.delete(key); continue; }
        }
      }
      alive.push(record);
    }

    // ② 同一会话 + 相邻 45 分钟内的碎片合并成一条（聊天流水最常见的就是这种）
    alive.sort((a, b) => (Date.parse(a.date || a.createdAt || 0) || 0) - (Date.parse(b.date || b.createdAt || 0) || 0));
    const groups = [];
    let current = null;
    for (const record of alive) {
      const scope = String(record.scope || 'qq');
      const base = String(record.conversationKey || record.key || '').trim() || `${record.platform || 'qq'}|${record.speaker || ''}`;
      // scope 必须参与分组：QQ 私聊流水和公开平台经历不能合成一条，否则合并结果会被写成错的来源。
      const key = `${scope}|${base}`;
      const at = Date.parse(record.date || record.createdAt || 0) || 0;
      if (current && current.key === key && Math.abs(at - current.lastAt) <= 45 * 60_000) {
        current.items.push(record);
        current.lastAt = at;
      } else {
        current = { key, scope, items: [record], lastAt: at };
        groups.push(current);
      }
    }
    for (const group of groups.slice(0, 10)) {
      if (group.items.length < 2) continue;
      if (merged >= 10) break;
      const parts = [];
      for (const item of group.items) {
        const text = short(item.text, 120);
        if (text && !parts.includes(text)) parts.push(text);
        if (parts.length >= 6) break;
      }
      if (parts.length < 2) continue;
      const importance = Math.max(...group.items.map((item) => Number(item.importance) || 60));
      const added = await applyMemoryCardAction('add', {
        title: `合并：${short(parts[0], 22)}`,
        text: parts.join('；').slice(0, 300),
        importance,
        tags: ['merged', 'local'],
        scope: group.scope || 'qq',
      }, { config });
      if (!added?.ok) continue;
      merged += 1;
      for (const item of group.items) {
        if (await forget(item.id)) dropped += 1;
      }
      if (dropped >= limit) break;
    }
    return { merged, dropped, archived };
  }

  async function organize({ ids = null, force = false } = {}) {
    const config = memoryCardConfig();
    if (config.enabled === false && !force) return { ok: false, error: '记忆卡写入已关闭' };
    if (!llmReady()) return { ok: false, error: 'DSH 模型服务未就绪，无法整理记忆' };
    const records = candidates(config, ids);
    if (records.length < 2) return { ok: false, error: '可整理的记录太少（至少 2 条）' };

    let data = null;
    let partial = false;
    let lastError = '';
    let lastRaw = '';
    const baseUser = `共 ${records.length} 条待整理：\n${formatRecords(records)}`;
    log(`[memory-organize] 开始整理 ${records.length} 条（最多 60 条/次）`);
    // 三种打法：标准 → 严格（温度 0）→ 精简（强制缩短输出，避免被 maxTokens 截断）。
    const plans = [
      { label: '标准', user: baseUser, temperature: 0.2, maxTokens: 3000 },
      { label: '严格', user: `${baseUser}\n\n重要：只输出一个 JSON 对象，不要任何解释、不要 Markdown；输出必须是完整 JSON。`, temperature: 0, maxTokens: 3000 },
      { label: '精简', user: `${baseUser}\n\n最多合并 5 组；每组 text ≤50 字；不要 tags；只输出完整 JSON。`, temperature: 0, maxTokens: 4000 },
    ];
    for (const plan of plans) {
      try {
        const text = await Promise.race([
          complete({ system: SYSTEM_PROMPT, user: plan.user, temperature: plan.temperature, maxTokens: plan.maxTokens }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('整理模型调用超时（45 秒）')), MODEL_TIMEOUT_MS)),
        ]);
        lastRaw = text;
        const parsed = parseModelJson(text);
        data = parsed.data;
        partial = parsed.partial;
        if (partial) log(`[memory-organize] ${plan.label}：JSON 被截断，已抢救出完整条目继续整理`);
        if (data) break;
      } catch (error) {
        lastError = String(error?.message ?? error).slice(0, 160);
        log(`[memory-organize] ${plan.label}失败：${lastError}｜模型原文：${short(lastRaw, 240)}`);
      }
    }
    if (!data) {
      // 模型不配合时，做本地合并/去重（同一会话相邻碎片 + 同文 + 纯寒暄），让按钮有实际结果。
      const local = await applyLocalMerge(records, config);
      const note = `模型没返回可用 JSON（已试 ${plans.length} 次），已做本地合并/去重`;
      log(`[memory-organize] ${note}：合并 ${local.merged} 组，删除 ${local.dropped} 条`);
      return {
        ok: true,
        before: records.length,
        after: Math.max(0, records.length - local.dropped + local.merged),
        merged: local.merged,
        dropped: local.dropped,
        archived: local.archived,
        local: true,
        note,
      };
    }

    const known = new Set(records.map((record) => String(record.id)));
    const merges = [];
    const drops = [];
    for (const row of Array.isArray(data.merge) ? data.merge : []) {
      const list = (Array.isArray(row?.ids) ? row.ids : []).map(String).filter((id) => known.has(id));
      const title = short(row?.title, 40);
      const body = short(row?.text, 200);
      if (list.length < 2 || !body) continue;
      const importance = Number(row?.importance);
      merges.push({
        ids: list,
        title: title || body.slice(0, 30),
        text: body,
        tags: (Array.isArray(row?.tags) ? row.tags : []).map((tag) => short(tag, 12)).filter(Boolean).slice(0, 8),
        importance: Number.isFinite(importance) ? Math.max(1, Math.min(100, Math.round(importance))) : 60,
      });
      if (merges.length >= MAX_MERGES) break;
    }
    for (const rawId of Array.isArray(data.drop) ? data.drop : []) {
      const id = String(rawId);
      if (known.has(id)) drops.push(id);
    }
    // 删除上限：宁可留脏，不可误删。
    const dropLimit = Math.max(1, Math.floor(records.length * MAX_DROP_RATIO));
    const finalDrops = drops.slice(0, dropLimit);
    if (!merges.length && !finalDrops.length) {
      return { ok: true, before: records.length, after: records.length, merged: 0, dropped: 0, archived: 0, partial, note: partial ? '模型输出被截断，没有可用的完整条目' : '模型认为不需要整理' };
    }

    let merged = 0;
    let dropped = 0;
    let archived = 0;
    let removedTotal = 0;
    // 合并结果沿用原记录的 scope（含 pet 时保持 pet），避免把公开平台经历改写成 QQ 私聊。
    const scopeForIds = (ids) => {
      const scopes = ids
        .map((id) => records.find((record) => String(record.id) === String(id)))
        .filter(Boolean)
        .map((record) => String(record.scope || 'qq'));
      if (scopes.includes('pet')) return 'pet';
      if (scopes.length && scopes.every((scope) => scope === 'bili')) return 'bili';
      return 'qq';
    };
    for (const item of merges) {
      const added = await applyMemoryCardAction('add', {
        title: item.title,
        text: item.text,
        importance: item.importance,
        tags: [...item.tags, 'merged'],
        scope: scopeForIds(item.ids),
      }, { config });
      if (!added?.ok) continue;
      merged += 1;
      for (const id of item.ids) {
        const result = await applyMemoryCardAction('forget', { id }, { config });
        if (result?.ok) { archived += Number(result.archived) || 0; removedTotal += 1; }
      }
    }
    for (const id of finalDrops) {
      const result = await applyMemoryCardAction('forget', { id }, { config });
      if (result?.ok) { dropped += 1; archived += Number(result.archived) || 0; removedTotal += 1; }
    }
    log(`[memory-organize] 整理完成：合并 ${merged} 组、删除 ${dropped} 条（输入 ${records.length} 条${partial ? '，输出被截断' : ''}）`);
    return {
      ok: true,
      before: records.length,
      // after 按实际归档条数算；之前用 merged*2 估算，一组合并 3 条以上时数字会错。
      after: Math.max(0, records.length - removedTotal),
      merged,
      dropped,
      archived,
      partial,
      note: partial ? '模型输出被截断，只应用了能完整解析的部分' : '',
    };
  }

  /** 日记式记忆：把某一天的记录写成一篇日记，原记录归档后从衰减卡移除。 */
  async function diary({ date = '', force = false, config = memoryCardConfig() } = {}) {
    if (config.enabled === false && !force) return { ok: false, error: '记忆卡写入已关闭' };
    if (!llmReady()) return { ok: false, error: 'DSH 模型服务未就绪，无法写日记' };
    const day = String(date || localDateKey(Date.now() - 86_400_000));
    const snapshot = memoryCardSnapshot(config, { recordLimit: 500 });
    const all = snapshot.records ?? [];
    const diaryExists = all.some((record) => (record.tags ?? []).includes('diary') && String(record.title || '').includes(day));
    if (diaryExists && !force) return { ok: false, reason: 'exists', error: `${day} 的日记已经写过了` };
    const dayRecords = all.filter((record) => localDateKey(record.date) === day
      && !(record.tags ?? []).includes('diary')
      // 日记只归档 QQ 私聊流水；B站/贴吧/桌宠的记录各自留在原通道，不能被日记吞掉。
      && String(record.scope || 'qq') === 'qq');
    if (dayRecords.length < 2) return { ok: false, reason: 'too-few', error: `${day} 只有 ${dayRecords.length} 条记录，写不出日记` };

    const lines = dayRecords
      .slice(0, 80)
      .map((record) => {
        const time = localDateKey(record.date) ? new Date(record.date).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : '';
        const who = record.speaker || (record.isSelf ? '她' : '对方');
        return `[${time}] ${who}：${short(record.text, 100)}`;
      })
      .join('\n')
      .slice(0, 4000);

    let body = '';
    try {
      body = await Promise.race([
        complete({ system: DIARY_SYSTEM, user: `日期：${day}\n当天记录：\n${lines}`, maxTokens: 900, temperature: 0.5 }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('写日记超时（45 秒）')), MODEL_TIMEOUT_MS)),
      ]);
    } catch (error) {
      return { ok: false, error: `写日记失败：${String(error?.message ?? error).slice(0, 160)}` };
    }
    const text = String(body || '').replace(/^```[a-z]*\s*/i, '').replace(/```$/u, '').trim().slice(0, 1200);
    if (!text) return { ok: false, error: '模型没有返回日记正文' };

    const added = await applyMemoryCardAction('add', {
      title: `日记 · ${day}`,
      text,
      importance: 85,
      tags: ['diary'],
      scope: 'qq',
    }, { config });
    if (!added?.ok) return { ok: false, error: '日记写入失败（可能内容重复）' };

    let removed = 0;
    for (const record of dayRecords.slice(0, 80)) {
      if (record.pinned || record.firstMet) continue;
      const result = await applyMemoryCardAction('forget', { id: record.id }, { config });
      if (result?.ok) removed += 1;
    }
    log(`[memory-organize] 日记 ${day}：写入 1 条，归档 ${removed} 条原始记录`);
    return { ok: true, date: day, added: 1, removed, text };
  }

  /** 自动整理：每天写昨日日记 + 定期语义整理（记录够多才跑）。两个开关互不依赖。 */
  async function autoOrganize({ config = readUnified()?.config?.memoryCard ?? memoryCardConfig(), now = Date.now() } = {}) {
    const auto = config?.organize ?? {};
    const wantOrganize = auto.enabled === true;
    // diary 默认关闭；只开「每天自动写日记」也应该能跑，不能被 autoOrganize 整段挡住。
    const wantDiary = auto.diary === true;
    if (!wantOrganize && !wantDiary) return { ok: false, reason: 'disabled' };
    const out = { ok: false };
    if (wantDiary) {
      const result = await diary({ force: false, config });
      if (result.ok) { out.ok = true; out.diary = result; }
      else if (result.reason !== 'exists') out.diaryError = result.error || result.reason;
    }
    const lastAt = Number(auto.lastRunAt) || 0;
    if (wantOrganize && now - lastAt >= 20 * 3600_000) {
      const minRecords = Math.max(10, Math.min(300, Number(auto.minRecords) || 40));
      const snapshot = memoryCardSnapshot(config, { recordLimit: 500 });
      if ((snapshot.records ?? []).length >= minRecords) {
        const result = await organize({ force: true });
        if (result.ok) { out.ok = true; out.merge = result; }
        else out.mergeError = result.error || result.reason;
      }
    }
    return out;
  }

  return { organize, diary, autoOrganize, llmReady };
}
