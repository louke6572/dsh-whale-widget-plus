/**
 * 闸门事件中心：闸门只报告“发生了什么”，由这里决定 L0–L3。
 *
 * 分级原则（2026-10-30 用户定）：
 *   L0 静默：安全策略正常拒绝，不需要用户决策；
 *   L1 轻提示：功能可能受影响，进通知中心，不打断；
 *   L2 弹窗：任务可能失败 / 核心功能受损 / 费用异常；
 *   L3 紧急：先停止，再高优先级告警，必须用户确认后恢复。
 *
 * 同一个闸门会因“重复次数 / 是否正在跑回合 / 影响面”升级，级别不属于闸门。
 */
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export const GATE_EVENT_SCHEMA_VERSION = 1;
export const GATE_EVENT_FILE = 'gate-events.jsonl';
export const GATE_EVENT_ACK_FILE = 'gate-events-ack.json';
export const GATE_LEVELS = Object.freeze(['L0', 'L1', 'L2', 'L3']);

function safeEvidence(value, depth = 0) {
  if (depth > 4) return '[deep]';
  if (value == null) return value;
  if (typeof value === 'string') return value.slice(0, 500);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.slice(0, 30).map((v) => safeEvidence(v, depth + 1));
  if (typeof value !== 'object') return String(value).slice(0, 200);
  const out = {};
  for (const [key, val] of Object.entries(value)) {
    if (/token|secret|password|authorization|cookie|api[-_]?key/i.test(key)) { out[key] = '********'; continue; }
    out[key] = safeEvidence(val, depth + 1);
  }
  return out;
}

/**
 * 把“事实”映射成通知级别。生产者可以给 impact/repeatCount/activeTurn 等上下文，
 * 但最终级别由这里决定。
 */
export function classifyGateEvent(event = {}) {
  const kind = String(event.kind ?? 'security');
  const name = String(event.event ?? '');
  const confidence = String(event.confidence ?? 'confirmed');
  const repeat = Number(event.repeatCount ?? 0);
  const activeTurn = event.activeTurn === true;
  const impact = String(event.impactLevel ?? event.severityHint ?? '');

  // 明确的安全失效 / 已停止：最高。
  if (event.action === 'stopped' && (/turn|loop|budget|step|repeat/i.test(name) || kind === 'cost')) return 'L3';
  if (kind === 'fault' && /security-unverified|guard-missing|duplicate-send/i.test(name)) return 'L3';

  if (kind === 'cost') {
    if (/budget-failure|still-spending|runaway/i.test(name)) return 'L3';
    if (/budget-exhausted/i.test(name)) return activeTurn ? 'L3' : 'L2';
    if (/cost-anomaly|spike/i.test(name)) return 'L2';
    if (/budget-warning|80/i.test(name)) return 'L1';
    return 'L1';
  }

  if (kind === 'security') {
    if (/sensitive-outbound|credential-outbound|exfil/i.test(name)) return confidence === 'confirmed' ? 'L3' : 'L2';
    if (/auth-repeat|bruteforce|attack/i.test(name)) return 'L2';
    // 白名单、非主人、参数错误等：静默。
    return 'L0';
  }

  if (kind === 'compat') {
    if (/context|compression|core/i.test(name) || impact === 'core') return 'L2';
    if (repeat >= 3 && activeTurn) return 'L3';
    return 'L1';
  }

  if (kind === 'fault') {
    if (/restored|recovered/i.test(name)) return 'L1';
    if (/send-failed/i.test(name)) return 'L1';
    if (/security-unverified|guard-missing|config-corrupt/i.test(name)) return 'L3';
    if (/service-down|bridge-exit|port-conflict|duplicate-process/i.test(name)) return 'L2';
    return 'L2';
  }

  if (repeat >= 3 && activeTurn) return 'L3';
  return 'L1';
}

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

function atomicJson(file, value) {
  const tmp = `${file}.tmp-${process.pid}-${randomUUID()}`;
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, file);
}

export function createGateEventStore({ dir, log = () => {}, maxBytes = 2 * 1024 * 1024, now = () => Date.now() } = {}) {
  if (!dir) throw new Error('gate-events: dir is required');
  const file = path.join(dir, GATE_EVENT_FILE);
  const ackFile = path.join(dir, GATE_EVENT_ACK_FILE);
  fs.mkdirSync(dir, { recursive: true });

  function rotateIfNeeded() {
    try {
      if (fs.existsSync(file) && fs.statSync(file).size > maxBytes) {
        const old = `${file}.1`;
        try { fs.rmSync(old, { force: true }); } catch {}
        fs.renameSync(file, old);
      }
    } catch (error) {
      log('[gate-events] 轮转失败：', String(error?.message ?? error).slice(0, 160));
    }
  }

  function record(event = {}) {
    const level = GATE_LEVELS.includes(event.level) ? event.level : classifyGateEvent(event);
    const stored = {
      schemaVersion: GATE_EVENT_SCHEMA_VERSION,
      id: randomUUID(),
      at: new Date(now()).toISOString(),
      level,
      gate: String(event.gate ?? 'unknown').slice(0, 80),
      kind: String(event.kind ?? 'security').slice(0, 40),
      event: String(event.event ?? 'unknown').slice(0, 80),
      action: String(event.action ?? 'blocked').slice(0, 30),
      subject: safeEvidence(event.subject ?? {}),
      reason: safeEvidence(event.reason ?? {}),
      impact: String(event.impact ?? '').slice(0, 500),
      recommendation: String(event.recommendation ?? '').slice(0, 500),
      confidence: String(event.confidence ?? 'confirmed').slice(0, 20),
      dedupeKey: String(event.dedupeKey ?? '').slice(0, 200),
      evidence: safeEvidence(event.evidence ?? {}),
      ack: false,
    };
    try {
      rotateIfNeeded();
      fs.appendFileSync(file, `${JSON.stringify(stored)}\n`, 'utf8');
    } catch (error) {
      log('[gate-events] 写入失败：', String(error?.message ?? error).slice(0, 160));
    }
    return stored;
  }

  function readAcks() {
    const data = readJson(ackFile, { ids: [] });
    return new Set(Array.isArray(data?.ids) ? data.ids : []);
  }

  function list({ limit = 100, level = '', includeAcked = true } = {}) {
    let raw = '';
    try { raw = fs.readFileSync(file, 'utf8'); } catch { raw = ''; }
    const lines = raw.split(/\r?\n/).filter(Boolean).slice(-Math.max(1, Math.min(2000, Number(limit) * 10 || 1000)));
    const acks = readAcks();
    const rows = [];
    for (const line of lines) {
      try {
        const row = JSON.parse(line);
        if (row && typeof row === 'object') {
          row.ack = acks.has(row.id) || row.ack === true;
          if (!includeAcked && row.ack) continue;
          if (level && row.level !== level) continue;
          rows.push(row);
        }
      } catch {}
    }
    rows.sort((a, b) => String(b.at).localeCompare(String(a.at)));
    const events = rows.slice(0, Math.max(1, Math.min(500, Number(limit) || 100)));
    const counts = { L0: 0, L1: 0, L2: 0, L3: 0, unacked: 0 };
    for (const row of rows) {
      counts[row.level] = (counts[row.level] ?? 0) + 1;
      if (!row.ack) counts.unacked += 1;
    }
    return { events, counts, schemaVersion: GATE_EVENT_SCHEMA_VERSION };
  }

  function ack(ids = [], all = false) {
    const acks = readAcks();
    if (all) {
      const { events } = list({ limit: 500, includeAcked: false });
      for (const row of events) acks.add(row.id);
    } else {
      for (const id of Array.isArray(ids) ? ids : []) {
        if (typeof id === 'string' && id) acks.add(id);
      }
    }
    const trimmed = [...acks].slice(-1000);
    atomicJson(ackFile, { ids: trimmed, at: new Date(now()).toISOString() });
    return { acked: trimmed.length };
  }

  /**
   * 按 dedupeKey 自动确认（用于「故障已恢复」的场景）：
   * 比如 SnowLuma 断线事件在重连成功后不该继续弹窗——用户明明连着。
   * 返回被确认的 id 列表。
   */
  function ackByDedupe(dedupeKey) {
    const key = String(dedupeKey ?? '');
    if (!key) return [];
    const { events } = list({ limit: 500, includeAcked: false });
    const ids = events.filter((row) => row.dedupeKey === key).map((row) => row.id);
    if (ids.length) ack(ids);
    return ids;
  }

  function snapshot() {
    return list({ limit: 20 });
  }

  return { file, ackFile, record, list, ack, ackByDedupe, snapshot };
}
