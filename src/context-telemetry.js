/**
 * Phase 0A：上下文/成本遥测（只观察，不改变行为）。
 *
 * 设计边界（重要）：
 *   · 只写旁路 JSONL，不修改 prompt、工具可见性、会话策略、guard 阈值；
 *   · 不记录消息正文、工具参数原文、密钥；只记录长度、数量、模型、usage、错误码；
 *   · 每个字段区分 observed / estimated；拿不到就写 null / "unknown"，不冒充实测；
 *   · 写入失败不能影响 QQ / DSH 主链路。
 *
 * 两个进程共用本模块，但各写各的文件：
 *   · bridge：state/context-telemetry-bridge.jsonl（唤醒 + prompt 字符数）
 *   · plugin：~/.dsh/surfcore/context-telemetry-plugin.jsonl（所有会话的模型/工具事件）
 *
 * 行格式版本固定为 `v:1`；后续加字段只能追加，不能改旧字段含义。
 */
import fs from 'node:fs';
import path from 'node:path';
import { normalizeUsage, totalTokensOf } from './model-prices.js';
import { usageOfEvent } from './token-ledger.js';

export const CONTEXT_TELEMETRY_VERSION = 1;
export const CONTEXT_TELEMETRY_MAX_BYTES = 8 * 1024 * 1024;

function safeNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function safeString(value, max = 160) {
  if (value == null) return '';
  return String(value).slice(0, max);
}

function safeObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out = {};
  for (const [key, raw] of Object.entries(value)) {
    if (raw == null) continue;
    if (typeof raw === 'number' || typeof raw === 'boolean') out[key] = raw;
    else if (typeof raw === 'string') out[key] = safeString(raw, 80);
  }
  return out;
}

function resultTextChars(event) {
  const content = event?.data?.message?.content;
  if (!Array.isArray(content)) return 0;
  let total = 0;
  for (const block of content) {
    if (!block || typeof block !== 'object') continue;
    if (typeof block.text === 'string') total += block.text.length;
    else if (typeof block.error === 'string') total += block.error.length;
  }
  return total;
}

/** 取会话 id / preset；兼容 DSH 的 session 对象和简化 fixture。 */
function sessionMeta(session) {
  const id = safeString(session?.id ?? session?.sessionId ?? '', 120);
  const header = session?.header ?? {};
  return {
    sessionId: id,
    agentPreset: safeString(header.agentPreset ?? '', 80),
    parentSession: safeString(header.parentSession ?? '', 120),
    title: safeString(session?.title ?? header.title ?? '', 120),
  };
}

/**
 * 创建一个遥测写入器 + 事件观察器。
 * @param {object} opts
 * @param {string} opts.file
 * @param {'bridge'|'plugin'} [opts.source]
 * @param {(msg:string, err?:unknown)=>void} [opts.log]
 * @param {()=>number} [opts.now]
 * @param {number} [opts.maxBytes]
 */
export function createContextTelemetry({
  file,
  source = 'plugin',
  log = () => {},
  now = () => Date.now(),
  maxBytes = CONTEXT_TELEMETRY_MAX_BYTES,
} = {}) {
  if (typeof file !== 'string' || !file) throw new Error('createContextTelemetry: file is required');
  let disabled = false;
  let loggedWriteError = false;
  const calls = new Map(); // `${sessionId}|${callId}` -> { tool, startedAt }
  const retryAxis = new Map(); // sessionId -> { turn, step, retry }
  const turns = new Map(); // `${sessionId}|${turn}` -> { startedAt, modelCalls, toolCalls }

  function write(kind, fields = {}) {
    if (disabled) return;
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      try {
        const stat = fs.statSync(file);
        if (stat.size > Math.max(1024, Number(maxBytes) || CONTEXT_TELEMETRY_MAX_BYTES)) {
          try { fs.rmSync(`${file}.1`, { force: true }); } catch {}
          fs.renameSync(file, `${file}.1`);
        }
      } catch {}
      const line = JSON.stringify({
        v: CONTEXT_TELEMETRY_VERSION,
        ts: now(),
        source,
        kind,
        ...fields,
      });
      fs.appendFileSync(file, `${line}\n`, { encoding: 'utf8', mode: 0o600 });
    } catch (error) {
      disabled = true;
      if (!loggedWriteError) {
        loggedWriteError = true;
        log(`[context-telemetry] 写入失败，已停止本进程遥测：${String(error?.message ?? error).slice(0, 160)}`);
      }
    }
  }

  /** 唤醒：由 bridge 在真正投递 prompt 时调用。 */
  function wake({
    wakeId = '', key = '', sessionId = '', characterId = '', reason = '', promptChars = 0, layers = {},
  } = {}) {
    write('wake', {
      wakeId: safeString(wakeId, 80),
      key: safeString(key, 120),
      sessionId: safeString(sessionId, 120),
      characterId: safeString(characterId, 80),
      reason: safeString(reason, 80),
      promptChars: safeNumber(promptChars),
      layers: safeObject(layers),
      source: 'bridge',
    });
  }

  /** 观察一条 DSH session/event；任何异常都吞掉，不能影响主链路。 */
  function ingestEvent(session, event, opts = {}) {
    try {
      const meta = sessionMeta(session);
      const wakeId = safeString(opts.wakeId ?? '', 80);
      const key = safeString(opts.key ?? '', 120);
      const characterId = safeString(opts.characterId ?? '', 80);
      if (!meta.sessionId) return;
      const type = event?.type;
      if (type === 'llm/retry-started') {
        const turn = safeNumber(event.data?.turn);
        const step = safeNumber(event.data?.step);
        retryAxis.set(meta.sessionId, {
          turn,
          step,
          retry: safeNumber(event.data?.retry) || 1,
        });
        return;
      }
      if (type === 'turn/start') {
        const turn = safeNumber(event.data?.turn);
        turns.set(`${meta.sessionId}|${turn}`, { startedAt: now(), modelCalls: 0, toolCalls: 0, toolResults: 0 });
        write('turn_start', { ...meta, wakeId, key, characterId, turn, observed: 'observed' });
        return;
      }
      if (type === 'assistant/message' || type === 'assistant/attempt') {
        const usage = usageOfEvent(event);
        if (!usage) return;
        const turn = safeNumber(event.data?.turn);
        const step = safeNumber(event.data?.step);
        const axis = retryAxis.get(meta.sessionId);
        const retry = axis && axis.turn === turn && axis.step === step ? axis.retry : 0;
        const buckets = normalizeUsage(usage);
        const phase = type === 'assistant/attempt' ? 'attempt' : 'message';
        const turnState = turns.get(`${meta.sessionId}|${turn}`);
        if (turnState && phase === 'message') turnState.modelCalls += 1;
        write('model_call', {
          ...meta,
          wakeId,
          key,
          turn,
          step,
          retry,
          phase,
          model: safeString(event.data?.message?.source?.model ?? event.data?.usage?.model ?? '', 80),
          provider: safeString(event.data?.provider ?? '', 40),
          usage: buckets,
          totalTokens: totalTokensOf(buckets),
          observed: 'observed',
        });
        return;
      }
      if (type === 'tool/call') {
        const callId = safeString(event.data?.callId ?? '', 120);
        const tool = safeString(event.data?.name ?? '', 120);
        const turn = safeNumber(event.data?.turn);
        const turnState = turns.get(`${meta.sessionId}|${turn}`);
        if (turnState) turnState.toolCalls += 1;
        if (callId) calls.set(`${meta.sessionId}|${callId}`, { tool, startedAt: now(), turn });
        write('tool_call', { ...meta, wakeId, key, characterId, turn, callId, tool, observed: 'observed' });
        return;
      }
      if (type === 'tool/result') {
        const callId = safeString(event.data?.message?.source?.callId ?? '', 120);
        const key = `${meta.sessionId}|${callId}`;
        const call = calls.get(key);
        if (call) calls.delete(key);
        const turn = safeNumber(event.data?.turn ?? call?.turn);
        const turnState = turns.get(`${meta.sessionId}|${turn}`);
        if (turnState) turnState.toolResults += 1;
        const block = event.data?.message?.content?.[0];
        const isError = event.data?.message?.isError === true || block?.isError === true;
        write('tool_result', {
          ...meta,
          wakeId,
          key,
          turn,
          callId,
          tool: safeString(call?.tool ?? block?.name ?? '', 120),
          resultChars: resultTextChars(event),
          durationMs: call ? Math.max(0, now() - call.startedAt) : null,
          ok: !isError,
          errorCode: isError ? safeString(block?.error ?? event.data?.message?.error ?? '', 80) : '',
          observed: 'observed',
        });
        return;
      }
      if (type === 'turn/end') {
        const turn = safeNumber(event.data?.turn);
        const state = turns.get(`${meta.sessionId}|${turn}`);
        turns.delete(`${meta.sessionId}|${turn}`);
        write('turn_end', {
          ...meta,
          wakeId,
          key,
          turn,
          durationMs: state ? Math.max(0, now() - state.startedAt) : null,
          modelCalls: state?.modelCalls ?? 0,
          toolCalls: state?.toolCalls ?? 0,
          toolResults: state?.toolResults ?? 0,
          observed: 'observed',
        });
      }
    } catch (error) {
      log(`[context-telemetry] 观察事件失败：${String(error?.message ?? error).slice(0, 160)}`);
    }
  }

  return { file, source, wake, ingestEvent, record: write };
}
