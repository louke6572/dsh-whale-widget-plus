/**
 * 账单明细生成器（A：角色包 + B：每个 QQ 群/私聊）。
 *
 * 设计：
 *   · 金额/token 以 state/token-usage.jsonl 为准（历史完整）；
 *   · 唤醒原因/工具/交付/延迟以 context-telemetry 为准（近期，带 wakeId）；
 *   · 两者按会话 key、sessionId+turn+step 关联；
 *   · 群/私聊账单按 key 聚合；
 *   · 角色账单按 characterId 聚合；旧数据没有角色 id 时，单角色可归到当前角色，
 *     多角色则标记“未归因”，不猜。
 *
 * 不记录消息正文，不调用模型；只读 + 写 Markdown。
 */
import fs from 'node:fs';
import path from 'node:path';
import { normalizeUsage, priceUsage, resolvePriceTable } from './model-prices.js';

export const BILLING_VERSION = 1;
const BILLING_PRICE_TABLE = resolvePriceTable({});
function priceUsageTable() { return BILLING_PRICE_TABLE; }

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function round(n, digits = 2) {
  const p = 10 ** digits;
  return Math.round(Number(n || 0) * p) / p;
}

function dayOf(ts) {
  return new Date(Number(ts)).toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' });
}

function fmtInt(n) {
  return Number(n || 0).toLocaleString('en-US');
}

function fmtMoney(n) {
  return `¥${Number(n || 0).toFixed(4)}`;
}

function fmtPct(n) {
  return `${Number(n || 0).toFixed(1)}%`;
}

function fmtMs(n) {
  if (!Number.isFinite(Number(n)) || Number(n) <= 0) return '—';
  return `${Math.round(Number(n))}ms`;
}

function safeId(value, fallback = 'unknown') {
  const s = String(value ?? '').trim();
  return s ? s.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 120) : fallback;
}

function emptyAgg() {
  return {
    calls: 0, tokens: 0, input: 0, cacheHit: 0, cacheMiss: 0, cacheWrite: 0, output: 0,
    cost: 0, days: new Map(), models: new Map(),
  };
}

function addAgg(agg, row) {
  agg.calls += 1;
  agg.tokens += row.tokens;
  agg.input += row.input;
  agg.cacheHit += row.buckets.cacheHit;
  agg.cacheMiss += row.buckets.cacheMiss;
  agg.cacheWrite += row.buckets.cacheWrite;
  agg.output += row.buckets.output;
  agg.cost += row.cost;
  if (!agg.days.has(row.day)) agg.days.set(row.day, emptyAgg());
  addFlat(agg.days.get(row.day), row);
  const model = row.model || 'unknown';
  if (!agg.models.has(model)) agg.models.set(model, emptyAgg());
  addFlat(agg.models.get(model), row);
}

function addFlat(target, row) {
  target.calls += 1;
  target.tokens += row.tokens;
  target.input += row.input;
  target.cacheHit += row.buckets.cacheHit;
  target.cacheMiss += row.buckets.cacheMiss;
  target.cacheWrite += row.buckets.cacheWrite;
  target.output += row.buckets.output;
  target.cost += row.cost;
}

function cacheRate(agg) {
  const denom = agg.cacheHit + agg.cacheMiss;
  return denom > 0 ? (100 * agg.cacheHit) / denom : 0;
}

/** 解析 token-usage.jsonl，按 (sid,turn,step,retry) 去重，保留最大 seq。 */
export function parseTokenLedger(text, { priceTable = resolvePriceTable({}) } = {}) {
  const byKey = new Map();
  for (const line of String(text ?? '').split('\n')) {
    if (!line.trim()) continue;
    let r;
    try { r = JSON.parse(line); } catch { continue; }
    if (r.k !== 'turn') continue;
    const key = `${r.sid}|${r.turn}|${r.step}|${r.retry ?? 0}`;
    const prev = byKey.get(key);
    if (!prev || num(r.seq) >= num(prev.seq)) byKey.set(key, r);
  }
  return [...byKey.values()].map((r) => {
    const buckets = normalizeUsage(r.b);
    const cost = priceUsage(buckets, { model: r.model || 'deepseek-flash', at: r.t, table: priceTable }).cost.total;
    return {
      at: num(r.t),
      day: dayOf(r.t),
      sid: String(r.sid || ''),
      key: String(r.key || ''),
      turn: num(r.turn),
      step: num(r.step),
      retry: num(r.retry),
      model: String(r.model || 'unknown'),
      buckets,
      tokens: buckets.cacheHit + buckets.cacheMiss + buckets.cacheWrite + buckets.output,
      input: buckets.cacheHit + buckets.cacheMiss + buckets.cacheWrite,
      cost,
    };
  });
}

/** 解析遥测 JSONL；bridge/plugin 去重，bridge 带 wakeId/characterId 优先。 */
export function parseTelemetry(records) {
  const wakes = [];
  const models = new Map();
  const tools = new Map();
  for (const r of records) {
    if (!r || typeof r !== 'object') continue;
    if (r.kind === 'wake') { wakes.push(r); continue; }
    if (r.kind === 'model_call') {
      const key = `${r.sessionId}|${r.turn}|${r.step}|${r.retry ?? 0}`;
      const prev = models.get(key);
      const score = (x) => (x.wakeId ? 2 : 0) + (x.phase === 'message' ? 1 : 0);
      if (!prev || score(r) > score(prev)) models.set(key, r);
    } else if (r.kind === 'tool_call' || r.kind === 'tool_result') {
      const key = `${r.kind}|${r.sessionId}|${r.callId}`;
      const prev = tools.get(key);
      if (!prev || (r.wakeId && !prev.wakeId)) tools.set(key, r);
    }
  }
  return { wakes, models: [...models.values()], tools: [...tools.values()] };
}

function wakeCharacterMap(telemetry) {
  const map = new Map();
  for (const w of telemetry.wakes) {
    if (w.wakeId && w.characterId) map.set(w.wakeId, w.characterId);
  }
  return map;
}

function filterTelemetry(telemetry, { key = '', characterId = '', includeUnattributed = false } = {}) {
  const wakeSet = new Set();
  const charWakes = telemetry.wakes.filter((w) => {
    if (key && w.key !== key) return false;
    if (!characterId) return !key;
    if (w.characterId === characterId) { wakeSet.add(w.wakeId); return true; }
    return includeUnattributed && !w.characterId;
  });
  for (const w of charWakes) if (w.wakeId) wakeSet.add(w.wakeId);
  const tools = telemetry.tools.filter((t) => {
    if (t.kind === 'tool_call' && t.wakeId && wakeSet.has(t.wakeId)) return true;
    if (t.kind === 'tool_result' && t.wakeId && wakeSet.has(t.wakeId)) return true;
    if (!t.wakeId) return includeUnattributed && !key;
    return false;
  });
  return { wakes: charWakes, tools };
}

function charOfModel(m, wakeChars) {
  return String(m.characterId || wakeChars.get(m.wakeId) || '');
}

/**
 * 把 ledger 行归到角色：
 *   · 优先用同一 (sid,turn,step,retry) 的遥测模型记录 characterId；
 *   · 只有一个角色时，旧数据归到当前角色（明确标 single-character）；
 *   · 否则留空，由报告标“未归因”。
 */
export function attributeLedgerRows(rows, telemetry, {
  currentCharacterId = '', characterCount = 0,
} = {}) {
  const wakeChars = wakeCharacterMap(telemetry);
  const modelChar = new Map();
  for (const m of telemetry.models) {
    const key = `${m.sessionId}|${m.turn}|${m.step}|${m.retry ?? 0}`;
    const id = charOfModel(m, wakeChars);
    if (id) modelChar.set(key, id);
  }
  return rows.map((r) => {
    const key = `${r.sid}|${r.turn}|${r.step}|${r.retry}`;
    let characterId = modelChar.get(key) || '';
    let attribution = 'telemetry';
    if (!characterId && characterCount === 1 && currentCharacterId) {
      characterId = currentCharacterId;
      attribution = 'single-character';
    }
    if (!characterId) attribution = 'unattributed';
    return { ...r, characterId, attribution };
  });
}

function aggregateRows(rows) {
  const agg = emptyAgg();
  const turnMap = new Map();
  for (const row of rows) {
    addAgg(agg, row);
    const key = `${row.sid}|${row.turn}`;
    if (!turnMap.has(key)) turnMap.set(key, { ...emptyAgg(), at: row.at, sid: row.sid, key: row.key, turn: row.turn });
    addFlat(turnMap.get(key), row);
  }
  return { agg, turns: [...turnMap.values()] };
}

function wakeStats(telemetry, key) {
  const wakes = telemetry.wakes.filter((w) => !key || w.key === key);
  const wakeReason = new Map(wakes.map((w) => [w.wakeId, w.reason || '(empty)']));
  const byReason = new Map();
  for (const w of wakes) {
    const reason = w.reason || '(empty)';
    if (!byReason.has(reason)) byReason.set(reason, { wakes: 0, promptChars: 0, calls: 0, cost: 0 });
    const x = byReason.get(reason);
    x.wakes += 1;
    x.promptChars += num(w.promptChars);
  }
  const table = priceUsageTable();
  for (const m of telemetry.models || []) {
    const reason = wakeReason.get(m.wakeId);
    if (!reason) continue;
    const row = byReason.get(reason);
    if (!row) continue;
    row.calls += 1;
    row.cost += priceUsage(normalizeUsage(m.usage), { model: m.model || 'deepseek-flash', at: m.ts, table }).cost.total;
  }
  return { wakes, byReason };
}

function toolStats(telemetry, key) {
  const calls = new Map();
  const results = new Map();
  const wakeKey = new Map((telemetry.wakes || []).map((w) => [w.wakeId, w.key]));
  const keyOf = (t) => t.key || wakeKey.get(t.wakeId) || '';
  for (const t of telemetry.tools) {
    if (t.kind === 'tool_call' && (!key || keyOf(t) === key)) {
      const name = String(t.tool || '');
      if (!calls.has(name)) calls.set(name, { calls: 0, chars: 0, errors: 0 });
      calls.get(name).calls += 1;
    }
    if (t.kind === 'tool_result' && (!key || keyOf(t) === key)) {
      const name = String(t.tool || '');
      if (!results.has(name)) results.set(name, { chars: 0, errors: 0 });
      const x = results.get(name);
      x.chars += num(t.resultChars);
      if (t.ok === false) x.errors += 1;
    }
  }
  for (const [name, x] of results) {
    if (!calls.has(name)) calls.set(name, { calls: 0, chars: 0, errors: 0 });
    calls.get(name).chars = x.chars;
    calls.get(name).errors = x.errors;
  }
  return [...calls.entries()].map(([tool, x]) => ({ tool, ...x })).sort((a, b) => b.calls - a.calls);
}

function deliveryStats(telemetry, key) {
  const wakes = telemetry.wakes.filter((w) => !key || w.key === key);
  let delivered = 0;
  let closed = 0;
  const latencies = [];
  for (const w of wakes) {
    const calls = telemetry.tools.filter((t) => t.kind === 'tool_call'
      && t.wakeId === w.wakeId
      && t.ts >= w.ts);
    const firstSend = calls.find((t) => /qq_(send|reply|send_private|send_burst|send_poke|send_sticker|send_voice)/.test(String(t.tool)));
    if (firstSend) {
      delivered += 1;
      latencies.push(Math.max(0, num(firstSend.ts) - num(w.ts)));
    }
    if (calls.some((t) => t.tool === 'mcp__snowluma__qq_close_conversation')) closed += 1;
  }
  latencies.sort((a, b) => a - b);
  const p50 = latencies.length ? latencies[Math.floor((latencies.length - 1) * 0.5)] : 0;
  const p90 = latencies.length ? latencies[Math.floor((latencies.length - 1) * 0.9)] : 0;
  return { wakes: wakes.length, delivered, closed, closeOnly: closed - delivered > 0 ? closed : 0, p50, p90 };
}

function periodText(agg) {
  const days = [...agg.days.keys()].sort();
  return days.length ? `${days[0]} ~ ${days[days.length - 1]}` : '暂无数据';
}

function renderOverview(agg) {
  return [
    '| 指标 | 数值 |',
    '| --- | ---: |',
    `| 模型调用 | ${fmtInt(agg.calls)} |`,
    `| 输入 token | ${fmtInt(agg.input)} |`,
    `| 缓存命中 | ${fmtInt(agg.cacheHit)}（${fmtPct(cacheRate(agg))}） |`,
    `| 缓存未命中 | ${fmtInt(agg.cacheMiss)} |`,
    `| 输出 token | ${fmtInt(agg.output)} |`,
    `| 总 token | ${fmtInt(agg.tokens)} |`,
    `| 总成本 | ${fmtMoney(agg.cost)} |`,
  ].join('\n');
}

function renderDaily(agg) {
  const rows = [...agg.days.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
  if (!rows.length) return '暂无数据。';
  return [
    '| 日期 | 调用 | 输入 | 命中率 | 输出 | 成本 |',
    '| --- | ---: | ---: | ---: | ---: | ---: |',
    ...rows.map(([day, x]) => `| ${day} | ${fmtInt(x.calls)} | ${fmtInt(x.input)} | ${fmtPct(cacheRate(x))} | ${fmtInt(x.output)} | ${fmtMoney(x.cost)} |`),
  ].join('\n');
}

function renderTurns(turns) {
  const top = [...turns].sort((a, b) => b.cost - a.cost).slice(0, 12);
  if (!top.length) return '暂无数据。';
  return [
    '| 时间 | key | turn | 调用 | token | 命中率 | 成本 |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: |',
    ...top.map((t) => `| ${new Date(t.at).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })} | ${t.key || '—'} | ${t.turn} | ${fmtInt(t.calls)} | ${fmtInt(t.tokens)} | ${fmtPct(cacheRate(t))} | ${fmtMoney(t.cost)} |`),
  ].join('\n');
}

function renderWakes(stats) {
  const rows = [...stats.byReason.entries()].sort((a, b) => b[1].wakes - a[1].wakes);
  if (!rows.length) return '暂无遥测数据（需要重启 bridge/DSH 后采集）。';
  return [
    '| 唤醒原因 | 次数 | 模型调用（遥测） | 成本（遥测） | 平均 prompt 字符 |',
    '| --- | ---: | ---: | ---: | ---: |',
    ...rows.map(([reason, x]) => `| ${reason} | ${fmtInt(x.wakes)} | ${fmtInt(x.calls)} | ${fmtMoney(x.cost)} | ${Math.round(x.promptChars / Math.max(1, x.wakes))} |`),
  ].join('\n');
}

function renderTools(tools) {
  if (!tools.length) return '暂无遥测数据。';
  return [
    '| 工具 | 调用 | 平均结果字符 | 错误 |',
    '| --- | ---: | ---: | ---: |',
    ...tools.slice(0, 20).map((t) => `| ${t.tool} | ${fmtInt(t.calls)} | ${Math.round(t.chars / Math.max(1, t.calls))} | ${fmtInt(t.errors)} |`),
  ].join('\n');
}

function renderDelivery(d) {
  return [
    `- 唤醒：${fmtInt(d.wakes)}`,
    `- 有发送：${fmtInt(d.delivered)}`,
    `- close：${fmtInt(d.closed)}`,
    `- 首次发送延迟 p50 / p90：${fmtMs(d.p50)} / ${fmtMs(d.p90)}`,
  ].join('\n');
}

/** 生成单个群/私聊的 Markdown。 */
export function renderConversationBill({ key, agg, turns, telemetry }) {
  const stats = wakeStats(telemetry, key);
  const tools = toolStats(telemetry, key);
  const delivery = deliveryStats(telemetry, key);
  return `# Token 账单 — ${key}

> 生成时间：${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}
> 统计周期：${periodText(agg)}
> 统计口径：token/金额来自 token-usage.jsonl；唤醒/工具/延迟来自遥测（近期）。
> 不包含消息正文。

## 总览

${renderOverview(agg)}

## 按天

${renderDaily(agg)}

## 按唤醒原因

${renderWakes(stats)}

## 工具

${renderTools(tools)}

## 交付

${renderDelivery(delivery)}

## 最贵回合 Top 12

${renderTurns(turns)}

## 数据质量

- 金额按本地价目表估算，非服务商发票；
- 无遥测记录的日期只有 token/金额，没有唤醒原因/工具/延迟；
- close-only 不等于失败，需结合语义复核。
`;
}

/** 生成角色包 Markdown。 */
export function renderCharacterBill({ characterId, name, agg, turns, telemetry, conversationRows, attribution, includeUnattributed = false }) {
  const filtered = filterTelemetry(telemetry, { characterId, includeUnattributed });
  const wakes = filtered.wakes;
  const wakeIds = new Set(wakes.map((w) => w.wakeId));
  const stats = wakeStats({
    wakes,
    models: telemetry.models.filter((m) => wakeIds.has(m.wakeId)),
  }, '');
  const tools = toolStats({ wakes, tools: filtered.tools }, '');
  const delivery = deliveryStats({ wakes, tools: filtered.tools }, '');
  const conversations = [...conversationRows.entries()].sort((a, b) => b[1].cost - a[1].cost);
  return `# Token 账单 — 角色「${name || characterId || '未命名'}」

> 角色 id：\`${characterId || '未归因'}\`
> 生成时间：${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}
> 统计周期：${periodText(agg)}
> 归因：${attribution === 'single-character' ? '只有一个角色，历史 token 全部归到当前角色' : '优先按 wakeId/characterId 归因；无遥测的旧数据可能未归因'}
> 不包含消息正文。

## 总览

${renderOverview(agg)}

## 按天

${renderDaily(agg)}

## 会话排行

| 会话 | 调用 | 成本 | 命中率 |
| --- | ---: | ---: | ---: |
${conversations.slice(0, 20).map(([key, x]) => `| ${key} | ${fmtInt(x.calls)} | ${fmtMoney(x.cost)} | ${fmtPct(cacheRate(x))} |`).join('\n') || '| — | 0 | ¥0.0000 | 0% |'}

## 按唤醒原因

${renderWakes(stats)}

## 工具

${renderTools(tools)}

## 交付

${renderDelivery(delivery)}

## 最贵回合 Top 12

${renderTurns(turns)}
`;
}

/** 生成索引。 */
export function renderIndex({ conversations, characters }) {
  return `# SurfCore Token 账单索引

> 生成时间：${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}
> 详细账单在 characters/ 和 conversations/ 下。

## 角色

${characters.map((c) => `- [${c.name || c.id}](characters/${safeId(c.id)}/summary.md) — ${fmtMoney(c.cost)} / ${fmtInt(c.calls)} calls`).join('\n') || '- （暂无）'}

## 会话

${conversations.map((c) => `- [${c.key}](conversations/${c.file}) — ${fmtMoney(c.cost)} / ${fmtInt(c.calls)} calls`).join('\n') || '- （暂无）'}
`;
}

/**
 * 构建完整账单模型。
 * @param {object} opts
 * @param {string} opts.ledgerText
 * @param {Array} opts.telemetryRecords
 * @param {string} [opts.currentCharacterId]
 * @param {string} [opts.currentCharacterName]
 * @param {number} [opts.characterCount]
 */
export function buildBillingReport({
  ledgerText = '',
  telemetryRecords = [],
  currentCharacterId = '',
  currentCharacterName = '',
  characterCount = 0,
  priceTable = resolvePriceTable({}),
} = {}) {
  const parsedTelemetry = parseTelemetry(telemetryRecords);
  const ledger = attributeLedgerRows(
    parseTokenLedger(ledgerText, { priceTable }),
    parsedTelemetry,
    { currentCharacterId, characterCount },
  );
  const convRows = new Map();
  for (const row of ledger) {
    if (!convRows.has(row.key)) convRows.set(row.key, []);
    convRows.get(row.key).push(row);
  }
  const conversations = [...convRows.entries()].map(([key, rows]) => {
    const { agg, turns } = aggregateRows(rows);
    return { key, file: `${safeId(key)}.md`, rows, agg, turns };
  }).sort((a, b) => b.agg.cost - a.agg.cost);

  const charGroups = new Map();
  for (const row of ledger) {
    const id = row.characterId || '';
    if (!charGroups.has(id)) charGroups.set(id, []);
    charGroups.get(id).push(row);
  }
  if (!charGroups.size && (currentCharacterId || characterCount === 0)) {
    charGroups.set(currentCharacterId || '', []);
  }
  const characters = [...charGroups.entries()].map(([id, rows]) => {
    const { agg, turns } = aggregateRows(rows);
    const conv = new Map();
    for (const row of rows) {
      if (!conv.has(row.key)) conv.set(row.key, emptyAgg());
      addFlat(conv.get(row.key), row);
    }
    return {
      id,
      name: id === currentCharacterId ? currentCharacterName : '',
      attribution: rows.some((r) => r.attribution === 'single-character') ? 'single-character' : 'telemetry',
      agg,
      turns,
      conversations: conv,
    };
  });
  // 角色账单只使用已知 QQ/私聊 key 的遥测，避免把普通 DSH 编码会话的 ops_bash 等工具混进来。
  const knownKeys = new Set(conversations.map((c) => c.key));
  const wakeKey = new Map(parsedTelemetry.wakes.map((w) => [w.wakeId, w.key]));
  const telemetry = {
    wakes: parsedTelemetry.wakes.filter((w) => knownKeys.has(w.key)),
    models: parsedTelemetry.models.filter((m) => knownKeys.has(m.key) || knownKeys.has(wakeKey.get(m.wakeId))),
    tools: parsedTelemetry.tools.filter((t) => knownKeys.has(t.key) || knownKeys.has(wakeKey.get(t.wakeId))),
  };
  return { ledger, telemetry, conversations, characters };
}
