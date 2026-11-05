/**
 * Phase 0A：从 context-telemetry JSONL 生成基线报告。
 *
 * 只读；不连接 DSH、不启动服务。
 * 用法：
 *   node scripts/context-telemetry-report.mjs
 *   node scripts/context-telemetry-report.mjs --json
 *   node scripts/context-telemetry-report.mjs --bridge <file> --plugin <file>
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function readLines(file) {
  try {
    return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((line) => {
      try { return JSON.parse(line); } catch { return null; }
    }).filter(Boolean);
  } catch {
    return [];
  }
}

function round(n, digits = 2) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  const p = 10 ** digits;
  return Math.round(x * p) / p;
}

function pct(n, d) {
  return d > 0 ? round((n / d) * 100, 1) : 0;
}

function median(values) {
  const list = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!list.length) return 0;
  const mid = Math.floor(list.length / 2);
  return list.length % 2 ? list[mid] : (list[mid - 1] + list[mid]) / 2;
}

/** 同一 (session, turn, step, retry) 只保留最终 message；没有 message 才用 attempt。 */
export function dedupeModelCalls(records) {
  const map = new Map();
  for (const r of records) {
    if (r.kind !== 'model_call') continue;
    const key = `${r.sessionId}|${r.turn}|${r.step}|${r.retry}`;
    const prev = map.get(key);
    if (!prev || r.phase === 'message' || prev.phase !== 'message') map.set(key, r);
  }
  return [...map.values()];
}

function wakeAssignments(wakes, calls) {
  const bySession = new Map();
  for (const w of wakes) {
    if (!w.sessionId) continue;
    if (!bySession.has(w.sessionId)) bySession.set(w.sessionId, []);
    bySession.get(w.sessionId).push(w);
  }
  for (const list of bySession.values()) list.sort((a, b) => a.ts - b.ts);
  const out = [];
  for (const call of calls) {
    const list = bySession.get(call.sessionId) ?? [];
    let picked = null;
    for (const w of list) {
      if (w.ts <= call.ts + 1000) picked = w;
      else break;
    }
    out.push({ call, wake: picked });
  }
  return out;
}

export function summarize(records) {
  const wakes = records.filter((r) => r.kind === 'wake');
  const calls = dedupeModelCalls(records);
  const toolCalls = records.filter((r) => r.kind === 'tool_call');
  const toolResults = records.filter((r) => r.kind === 'tool_result');
  const assigned = wakeAssignments(wakes, calls);

  const byReason = new Map();
  for (const w of wakes) {
    const reason = w.reason || '(empty)';
    if (!byReason.has(reason)) byReason.set(reason, { wakes: 0, modelCalls: 0, toolCalls: 0, input: 0, cacheHit: 0, cacheMiss: 0, output: 0, promptChars: [], layers: {} });
    const wakeRow = byReason.get(reason);
    wakeRow.wakes += 1;
    wakeRow.promptChars.push(w.promptChars || 0);
    for (const [key, value] of Object.entries(w.layers || {})) {
      if (!Number.isFinite(Number(value))) continue;
      wakeRow.layers[key] = (wakeRow.layers[key] || 0) + Number(value);
    }
  }
  for (const { call, wake } of assigned) {
    const reason = wake?.reason || '(no wake record)';
    if (!byReason.has(reason)) byReason.set(reason, { wakes: 0, modelCalls: 0, toolCalls: 0, input: 0, cacheHit: 0, cacheMiss: 0, output: 0, promptChars: [], layers: {} });
    const row = byReason.get(reason);
    row.modelCalls += 1;
    row.input += (call.usage?.cacheMiss ?? 0) + (call.usage?.cacheHit ?? 0) + (call.usage?.cacheWrite ?? 0);
    row.cacheHit += call.usage?.cacheHit ?? 0;
    row.cacheMiss += call.usage?.cacheMiss ?? 0;
    row.output += call.usage?.output ?? 0;
  }

  // 工具按同一会话的最近 wake 归属，便于回答“哪类唤醒在反复查什么”。
  const toolByReason = new Map();
  for (const tool of toolCalls) {
    const list = wakes.filter((w) => w.sessionId && w.sessionId === tool.sessionId && w.ts <= tool.ts + 1000);
    const wake = list.length ? list[list.length - 1] : null;
    const reason = wake?.reason || '(no wake record)';
    if (!toolByReason.has(reason)) toolByReason.set(reason, new Map());
    const m = toolByReason.get(reason);
    if (!m.has(tool.tool)) m.set(tool.tool, { calls: 0, resultChars: 0, errors: 0 });
    const row = m.get(tool.tool);
    row.calls += 1;
    if (byReason.has(reason)) byReason.get(reason).toolCalls += 1;
  }
  for (const result of toolResults) {
    const list = wakes.filter((w) => w.sessionId && w.sessionId === result.sessionId && w.ts <= result.ts + 1000);
    const wake = list.length ? list[list.length - 1] : null;
    const reason = wake?.reason || '(no wake record)';
    if (!toolByReason.has(reason)) toolByReason.set(reason, new Map());
    const m = toolByReason.get(reason);
    if (!m.has(result.tool)) m.set(result.tool, { calls: 0, resultChars: 0, errors: 0 });
    const row = m.get(result.tool);
    row.resultChars += result.resultChars || 0;
    if (result.ok === false) row.errors += 1;
  }

  const wokeCalls = assigned.filter((x) => x.wake).length;
  const totalInput = calls.reduce((n, c) => n + (c.usage?.cacheMiss ?? 0) + (c.usage?.cacheHit ?? 0) + (c.usage?.cacheWrite ?? 0), 0);
  const totalHit = calls.reduce((n, c) => n + (c.usage?.cacheHit ?? 0), 0);
  const totalMiss = calls.reduce((n, c) => n + (c.usage?.cacheMiss ?? 0), 0);
  const totalOutput = calls.reduce((n, c) => n + (c.usage?.output ?? 0), 0);

  return {
    schema: 1,
    records: records.length,
    wakes: wakes.length,
    wakeReasons: [...byReason.entries()].map(([reason, row]) => ({
      reason,
      wakes: row.wakes,
      modelCalls: row.modelCalls,
      toolCalls: row.toolCalls,
      inputTokens: row.input,
      cacheHitTokens: row.cacheHit,
      cacheMissTokens: row.cacheMiss,
      outputTokens: row.output,
      cacheHitRatePct: pct(row.cacheHit, row.cacheHit + row.cacheMiss),
      avgPromptChars: row.promptChars.length ? round(row.promptChars.reduce((a, b) => a + b, 0) / row.promptChars.length) : 0,
      avgLayerChars: Object.fromEntries(Object.entries(row.layers).map(([key, sum]) => [key, round(sum / Math.max(1, row.wakes))])),
    })).sort((a, b) => b.wakes - a.wakes),
    totals: {
      modelCalls: calls.length,
      callsWithWake: wokeCalls,
      coveragePct: pct(wokeCalls, calls.length),
      inputTokens: totalInput,
      cacheHitTokens: totalHit,
      cacheMissTokens: totalMiss,
      outputTokens: totalOutput,
      cacheHitRatePct: pct(totalHit, totalHit + totalMiss),
      toolCalls: toolCalls.length,
      toolResults: toolResults.length,
      toolResultChars: toolResults.reduce((n, r) => n + (r.resultChars || 0), 0),
      medianToolResultChars: median(toolResults.map((r) => r.resultChars || 0)),
    },
    tools: [...toolByReason.entries()].map(([reason, m]) => ({
      reason,
      tools: [...m.entries()].map(([tool, row]) => ({
        tool,
        calls: row.calls,
        avgResultChars: row.calls ? Math.round(row.resultChars / row.calls) : 0,
        errors: row.errors,
      })).sort((a, b) => b.calls - a.calls),
    })),
    missing: {
      contextLayers: 'Phase 0A 尚未拆分 prompt 各段；只记录 prompt 总字符数',
      wakeCorrelation: '插件模型事件没有 wakeId，报告按 sessionId + 最近 wake 近似归属',
    },
  };
}

function fmt(n) {
  return Number(n || 0).toLocaleString('en-US');
}

export function formatReport(report) {
  const lines = [];
  lines.push('=== SurfCore 上下文遥测基线 ===');
  lines.push(`记录 ${fmt(report.records)} 条 · 唤醒 ${fmt(report.wakes)} 次 · 模型调用 ${fmt(report.totals.modelCalls)} 次`);
  lines.push(`输入 ${fmt(report.totals.inputTokens)}（cache hit ${fmt(report.totals.cacheHitTokens)} / miss ${fmt(report.totals.cacheMissTokens)} / hit 率 ${report.totals.cacheHitRatePct}%）`);
  lines.push(`输出 ${fmt(report.totals.outputTokens)} · 工具 ${fmt(report.totals.toolCalls)} 次 · 工具结果合计 ${fmt(report.totals.toolResultChars)} 字符（中位 ${fmt(report.totals.medianToolResultChars)}）`);
  lines.push(`wake 归属覆盖：${report.totals.coveragePct}%（${fmt(report.totals.callsWithWake)}/${fmt(report.totals.modelCalls)}）`);
  lines.push('');
  lines.push('按唤醒原因：');
  for (const row of report.wakeReasons) {
    const topLayers = Object.entries(row.avgLayerChars || {}).filter(([k]) => !['prompt', 'base'].includes(k)).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => `${k}:${v}`).join(' ');
    lines.push(`  ${row.reason}: wakes=${row.wakes} modelCalls=${row.modelCalls} tools=${row.toolCalls} input=${row.inputTokens} hit=${row.cacheHitRatePct}% output=${row.outputTokens} promptChars≈${row.avgPromptChars}${topLayers ? ` | ${topLayers}` : ''}`);
  }
  lines.push('');
  lines.push('工具（按唤醒原因）：');
  for (const group of report.tools) {
    lines.push(`  [${group.reason}]`);
    for (const t of group.tools) lines.push(`    ${t.tool}: calls=${t.calls} avgResultChars=${t.avgResultChars} errors=${t.errors}`);
  }
  lines.push('');
  lines.push('缺口：');
  for (const [k, v] of Object.entries(report.missing)) lines.push(`  - ${k}: ${v}`);
  return lines.join('\n');
}

function parseArgs(argv) {
  const out = { json: false, bridge: '', plugin: '', all: false, since: 0, until: 0 };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--json') out.json = true;
    else if (a === '--all') out.all = true;
    else if (a === '--since') out.since = Date.parse(argv[++i] ?? '') || 0;
    else if (a === '--until') out.until = Date.parse(argv[++i] ?? '') || 0;
    else if (a === '--bridge') out.bridge = argv[++i] ?? '';
    else if (a === '--plugin') out.plugin = argv[++i] ?? '';
  }
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  const bridgeFile = args.bridge || path.join(root, 'state', 'context-telemetry-bridge.jsonl');
  const dshHome = process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
  const pluginFile = args.plugin || path.join(dshHome, 'surfcore', 'context-telemetry-plugin.jsonl');
  let records = [...readLines(bridgeFile), ...readLines(pluginFile)];
  // 默认只保留 token-budget 已跟踪的 SurfCore 会话，避免把普通 DSH 编码会话混进基线。
  // bridge 的 wake 记录没有 session 的也保留，用于看唤醒频率。
  let allow = null;
  try {
    const daily = JSON.parse(fs.readFileSync(path.join(dshHome, 'surfcore', 'token-usage-daily.json'), 'utf8'));
    const ids = Object.keys(daily.sessions ?? {});
    if (ids.length) allow = new Set(ids);
  } catch {}
  if (!args.all && allow) {
    records = records.filter((r) => r.kind === 'wake' || !r.sessionId || allow.has(r.sessionId));
  }
  if (args.since || args.until) records = records.filter((r) => (!args.since || Number(r.ts) >= args.since) && (!args.until || Number(r.ts) <= args.until));
  const report = summarize(records);
  console.log(args.json ? JSON.stringify(report, null, 2) : formatReport(report));
}
