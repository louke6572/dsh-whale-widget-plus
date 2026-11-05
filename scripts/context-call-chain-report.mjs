/**
 * Phase 1A：按 wakeId 重建真实调用链（只读报告）。
 *
 * 目标：回答“一次唤醒里到底走了哪几步、哪条路径最贵”，
 * 暂不修改 close/wait/send，也不设调用上限。
 *
 * 输入：
 *   <repo>/state/context-telemetry-bridge.jsonl   （带 wakeId 的 QQ 事件）
 *   ~/.dsh/surfcore/context-telemetry-plugin.jsonl（全量模型/工具事件）
 *
 * 用法：
 *   node scripts/context-call-chain-report.mjs
 *   node scripts/context-call-chain-report.mjs --json
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeUsage, priceUsage, resolvePriceTable } from '../src/model-prices.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TOOL_SHORT = {
  'mcp__snowluma__qq_wait_for_messages': 'wait',
  'mcp__snowluma__qq_send_message': 'send',
  'mcp__snowluma__qq_send_private_message': 'send_private',
  'mcp__snowluma__qq_reply': 'reply',
  'mcp__snowluma__qq_send_burst': 'burst',
  'mcp__snowluma__qq_send_poke': 'poke',
  'mcp__snowluma__qq_send_sticker': 'sticker',
  'mcp__snowluma__qq_send_voice': 'voice',
  'mcp__snowluma__qq_close_conversation': 'close',
  'mcp__snowluma__qq_mark_read': 'mark_read',
  'mcp__snowluma__qq_set_wake_config': 'set_wake',
  'mcp__snowluma__qq_get_unread_messages': 'get_unread',
  'mcp__snowluma__qq_get_recent_messages': 'get_recent',
  'mcp__snowluma__qq_get_social_state': 'social_state',
  'mcp__snowluma__qq_get_group_members': 'get_members',
  'mcp__snowluma__qq_get_message_detail': 'get_detail',
  'mcp__snowluma__qq_get_forward_msg': 'get_forward',
  'mcp__snowluma__qq_get_message_images': 'get_images',
  'mcp__web-search-safe__web_search': 'web_search',
  'mcp__web-search-safe__web_fetch': 'web_fetch'
};
const SEND_TOOLS = new Set(['send', 'send_private', 'reply', 'burst', 'poke', 'sticker', 'voice']);
const TERMINAL_TOOLS = new Set(['close', 'mark_read', 'set_wake']);

function shortName(name) {
  return TOOL_SHORT[name] ?? String(name || '').replace(/^mcp__snowluma__/, '').replace(/^mcp__web-search-safe__/, 'web_');
}

function readJsonl(file) {
  try {
    return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((line) => {
      try { return JSON.parse(line); } catch { return null; }
    }).filter(Boolean);
  } catch {
    return [];
  }
}

function pct(n, d) { return d > 0 ? Math.round((n / d) * 1000) / 10 : 0; }
function round(n, d = 2) { const p = 10 ** d; return Math.round(Number(n || 0) * p) / p; }
function percentile(values, p) {
  const a = values.filter((x) => Number.isFinite(x)).sort((x, y) => x - y);
  if (!a.length) return 0;
  return a[Math.min(a.length - 1, Math.floor((a.length - 1) * p))];
}

/** 同一次模型调用：bridge 带 wakeId 优先于 plugin；message 优先于 attempt。 */
function dedupeModel(records) {
  const map = new Map();
  for (const r of records) {
    if (r.kind !== 'model_call') continue;
    const key = `${r.sessionId}|${r.turn}|${r.step}|${r.retry}`;
    const prev = map.get(key);
    const score = (x) => (x.wakeId ? 2 : 0) + (x.phase === 'message' ? 1 : 0);
    if (!prev || score(r) > score(prev)) map.set(key, r);
  }
  return [...map.values()];
}

function dedupeTool(records, kind) {
  const map = new Map();
  for (const r of records) {
    if (r.kind !== kind) continue;
    const key = `${r.sessionId}|${r.callId}`;
    const prev = map.get(key);
    if (!prev || (r.wakeId && !prev.wakeId)) map.set(key, r);
  }
  return [...map.values()];
}

export function dedupeRecords(records) {
  const passthrough = records.filter((r) => !['model_call', 'tool_call', 'tool_result', 'turn_start', 'turn_end'].includes(r.kind));
  return [
    ...passthrough,
    ...dedupeModel(records),
    ...dedupeTool(records, 'tool_call'),
    ...dedupeTool(records, 'tool_result'),
  ];
}

/**
 * 组装链：优先用 wakeId；没有 wakeId 的旧数据按 session + 最近 wake 近似。
 */
export function buildCallChains(records, { table = resolvePriceTable({}) } = {}) {
  const clean = dedupeRecords(records);
  const wakes = clean.filter((r) => r.kind === 'wake' && r.wakeId).sort((a, b) => a.ts - b.ts);
  const byWake = new Map(wakes.map((w) => [w.wakeId, { wake: w, models: [], tools: [], results: [], turns: [] }]));
  const bySession = new Map();
  for (const w of wakes) {
    if (!bySession.has(w.sessionId)) bySession.set(w.sessionId, []);
    bySession.get(w.sessionId).push(w);
  }
  const nearest = (r) => {
    const list = bySession.get(r.sessionId) ?? [];
    let found = null;
    for (const w of list) {
      if (w.wakeId === r.wakeId) return w;
      if (w.ts <= r.ts + 1000) found = w;
      else break;
    }
    return found;
  };
  for (const r of clean) {
    if (r.kind === 'wake') continue;
    const wake = r.wakeId ? wakes.find((w) => w.wakeId === r.wakeId) : nearest(r);
    if (!wake) continue;
    const bucket = byWake.get(wake.wakeId);
    if (!bucket) continue;
    if (r.kind === 'model_call') bucket.models.push(r);
    else if (r.kind === 'tool_call') bucket.tools.push(r);
    else if (r.kind === 'tool_result') bucket.results.push(r);
    else if (r.kind === 'turn_start' || r.kind === 'turn_end') bucket.turns.push(r);
  }
  const chains = [];
  for (const { wake, models, tools, results, turns } of byWake.values()) {
    const sortedTools = [...tools].sort((a, b) => a.ts - b.ts);
    const path = sortedTools.map((t) => shortName(t.tool));
    const cost = models.reduce((n, m) => n + priceUsage(normalizeUsage(m.usage), {
      model: m.model || 'deepseek-flash', at: m.ts, table,
    }).cost.total, 0);
    const tokens = models.reduce((n, m) => {
      const b = normalizeUsage(m.usage);
      return n + b.cacheHit + b.cacheMiss + b.cacheWrite + b.output;
    }, 0);
    const errors = results.filter((r) => r.ok === false).length;
    chains.push({
      wakeId: wake.wakeId,
      key: wake.key || '',
      reason: wake.reason || '(empty)',
      ts: wake.ts,
      promptChars: wake.promptChars || 0,
      unreadCount: wake.layers?.unreadCount ?? null,
      historyCount: wake.layers?.historyCount ?? null,
      ownerCount: wake.layers?.ownerCount ?? null,
      unreadMediaCount: wake.layers?.unreadMediaCount ?? null,
      recentCount: wake.layers?.recentCount ?? null,
      oldestUnreadAgeMs: wake.layers?.oldestUnreadAgeMs ?? null,
      modelCalls: models.length,
      toolCalls: sortedTools.length,
      path,
      delivered: path.some((x) => SEND_TOOLS.has(x)),
      firstSendAt: sortedTools.find((t) => SEND_TOOLS.has(shortName(t.tool)))?.ts ?? null,
      latencyToSendMs: (() => {
        const firstSend = sortedTools.find((t) => SEND_TOOLS.has(shortName(t.tool)));
        return firstSend ? Math.max(0, firstSend.ts - wake.ts) : null;
      })(),
      closed: path.includes('close'),
      observedOnly: !path.some((x) => SEND_TOOLS.has(x) || TERMINAL_TOOLS.has(x)),
      errors,
      tokens,
      cost,
      durationMs: (() => {
        const all = [...models, ...sortedTools, ...results, ...turns].map((x) => x.ts).filter(Number.isFinite);
        return all.length ? Math.max(...all) - wake.ts : 0;
      })(),
    });
  }
  return chains;
}

export function summarizeChains(chains) {
  const total = chains.length;
  const byPath = new Map();
  for (const c of chains) {
    const key = c.path.length ? c.path.join(' → ') : '(no tools)';
    if (!byPath.has(key)) byPath.set(key, { path: key, count: 0, calls: 0, cost: 0, delivered: 0, errors: 0 });
    const x = byPath.get(key);
    x.count += 1;
    x.calls += c.modelCalls;
    x.cost += c.cost;
    if (c.delivered) x.delivered += 1;
    x.errors += c.errors;
  }
  const byReason = new Map();
  for (const c of chains) {
    if (!byReason.has(c.reason)) byReason.set(c.reason, { reason: c.reason, wakes: 0, modelCalls: 0, cost: 0, delivered: 0, errors: 0, unread: 0, history: 0 });
    const x = byReason.get(c.reason);
    x.wakes += 1;
    x.modelCalls += c.modelCalls;
    x.cost += c.cost;
    if (c.delivered) x.delivered += 1;
    x.errors += c.errors;
    x.unread += Number(c.unreadCount) || 0;
    x.history += Number(c.historyCount) || 0;
    x.unread += Number(c.unreadCount) || 0;
    x.history += Number(c.historyCount) || 0;
  }
  const calls = chains.map((c) => c.modelCalls);
  const closeOnly = chains.filter((c) => c.path.length === 1 && c.path[0] === 'close');
  const noSend = chains.filter((c) => !c.delivered);
  const noSendByReason = new Map();
  for (const c of noSend) {
    if (!noSendByReason.has(c.reason)) noSendByReason.set(c.reason, { reason: c.reason, wakes: 0, calls: 0, cost: 0, withUnread: 0, withHistory: 0 });
    const x = noSendByReason.get(c.reason);
    x.wakes += 1;
    x.calls += c.modelCalls;
    x.cost += c.cost;
    if (Number(c.unreadCount) > 0) x.withUnread += 1;
    if (Number(c.historyCount) > 0) x.withHistory += 1;
  }
  return {
    wakes: total,
    delivered: chains.filter((c) => c.delivered).length,
    closed: chains.filter((c) => c.closed).length,
    observedOnly: chains.filter((c) => c.observedOnly).length,
    errors: chains.reduce((n, c) => n + c.errors, 0),
    modelCalls: { p50: percentile(calls, 0.5), p90: percentile(calls, 0.9), p99: percentile(calls, 0.99), max: Math.max(0, ...calls) },
    avgCost: total ? round(chains.reduce((n, c) => n + c.cost, 0) / total, 4) : 0,
    totalCost: round(chains.reduce((n, c) => n + c.cost, 0), 4),
    avgDurationMs: total ? Math.round(chains.reduce((n, c) => n + c.durationMs, 0) / total) : 0,
    deliveredLatency: {
      p50: percentile(chains.filter((c) => c.delivered).map((c) => c.latencyToSendMs), 0.5),
      p90: percentile(chains.filter((c) => c.delivered).map((c) => c.latencyToSendMs), 0.9),
      avg: (() => {
        const xs = chains.filter((c) => c.delivered).map((c) => c.latencyToSendMs).filter(Number.isFinite);
        return xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0;
      })(),
    },
    avgCostDelivered: (() => {
      const xs = chains.filter((c) => c.delivered);
      return xs.length ? round(xs.reduce((n, c) => n + c.cost, 0) / xs.length, 4) : 0;
    })(),
    paths: [...byPath.values()].sort((a, b) => b.count - a.count || b.cost - a.cost),
    reasons: [...byReason.values()].sort((a, b) => b.wakes - a.wakes),
    review: {
      closeOnly: {
        wakes: closeOnly.length,
        calls: closeOnly.reduce((n, c) => n + c.modelCalls, 0),
        cost: round(closeOnly.reduce((n, c) => n + c.cost, 0), 4),
        reasons: [...new Set(closeOnly.map((c) => c.reason))],
        withUnread: closeOnly.filter((c) => Number(c.unreadCount) > 0).length,
        withHistory: closeOnly.filter((c) => Number(c.historyCount) > 0).length,
      },
      noSendByReason: [...noSendByReason.values()].sort((a, b) => b.wakes - a.wakes),
    },
  };
}

function fmt(n) { return Number(n || 0).toLocaleString('en-US'); }

export function formatChains(report) {
  const lines = [];
  lines.push('=== SurfCore 调用链报告（Phase 1A，只读） ===');
  lines.push(`wake=${report.wakes} delivered=${report.delivered} closed=${report.closed} observedOnly=${report.observedOnly} errors=${report.errors}`);
  lines.push(`model calls/wake: p50=${report.modelCalls.p50} p90=${report.modelCalls.p90} p99=${report.modelCalls.p99} max=${report.modelCalls.max}`);
  lines.push(`cost/wake=¥${report.avgCost} total=¥${report.totalCost} avgDuration=${Math.round(report.avgDurationMs / 1000)}s`);
  lines.push(`delivered latency: p50=${report.deliveredLatency.p50}ms p90=${report.deliveredLatency.p90}ms avg=${report.deliveredLatency.avg}ms · cost/delivered=¥${report.avgCostDelivered}`);
  lines.push('');
  lines.push('Top paths：');
  for (const p of report.paths.slice(0, 15)) {
    lines.push(`  ${p.path}: wakes=${p.count} modelCalls=${p.calls} cost=¥${p.cost.toFixed(3)} delivered=${p.delivered}/${p.count} errors=${p.errors}`);
  }
  lines.push('');
  lines.push('Review（无发送 / close-only）：');
  lines.push(`  close-only: wakes=${report.review.closeOnly.wakes} calls=${report.review.closeOnly.calls} cost=¥${report.review.closeOnly.cost} unread>0=${report.review.closeOnly.withUnread} history>0=${report.review.closeOnly.withHistory}`);
  for (const r of report.review.noSendByReason.slice(0, 8)) lines.push(`  no-send ${r.reason}: wakes=${r.wakes} calls=${r.calls} cost=¥${r.cost.toFixed(3)} unread>0=${r.withUnread} history>0=${r.withHistory}`);
  lines.push('');
  lines.push('By wake reason：');
  for (const r of report.reasons) {
    lines.push(`  ${r.reason}: wakes=${r.wakes} modelCalls=${r.modelCalls} cost=¥${r.cost.toFixed(3)} delivered=${r.delivered}/${r.wakes} errors=${r.errors} unread=${r.unread} history=${r.history}`);
  }
  return lines.join('\n');
}

function parseArgs(argv) {
  const out = { json: false, bridge: '', plugin: '', since: 0, until: 0 };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--json') out.json = true;
    else if (argv[i] === '--bridge') out.bridge = argv[++i] ?? '';
    else if (argv[i] === '--plugin') out.plugin = argv[++i] ?? '';
    else if (argv[i] === '--since') out.since = Date.parse(argv[++i] ?? '') || 0;
    else if (argv[i] === '--until') out.until = Date.parse(argv[++i] ?? '') || 0;
  }
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  const bridgeFile = args.bridge || path.join(root, 'state', 'context-telemetry-bridge.jsonl');
  const dshHome = process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
  const pluginFile = args.plugin || path.join(dshHome, 'surfcore', 'context-telemetry-plugin.jsonl');
  let records = [...readJsonl(bridgeFile), ...readJsonl(pluginFile)];
  if (args.since || args.until) records = records.filter((r) => (!args.since || Number(r.ts) >= args.since) && (!args.until || Number(r.ts) <= args.until));
  const chains = buildCallChains(records);
  const report = summarizeChains(chains);
  console.log(args.json ? JSON.stringify({ ...report, chains }, null, 2) : formatChains(report));
}
