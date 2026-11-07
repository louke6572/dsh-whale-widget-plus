/**
 * SurfCore token 用量的纯形状 / 事件折叠逻辑（无 IO、无 DSH 依赖）。
 *
 * 从 `lib/token-budget.js` 拆出来，是为了让「分类状态怎么归一化」和
 * 「事件日志怎么折算今天」可以单独单测，也避免主服务文件继续膨胀。
 */
import { usageOfEvent } from '../../src/token-ledger.js';
import {
  ZERO_BUCKETS,
  normalizeUsage as normalizeBuckets,
  priceUsage,
  totalTokensOf,
} from '../../src/model-prices.js';

export const CATEGORY_KEYS = ['qq', 'bili', 'tieba', 'douyin', 'other'];
export const isPlainObject = (v) => v != null && typeof v === 'object' && !Array.isArray(v);
export const num = (v, fallback = 0) => (Number.isFinite(Number(v)) ? Number(v) : fallback);
export const clamp0 = (v) => Math.max(0, Number(v) || 0);

export function emptyCategories() {
  const out = {};
  for (const key of CATEGORY_KEYS) out[key] = { cost: 0, tokens: 0 };
  return out;
}

export function normalizeCategories(input) {
  const out = emptyCategories();
  for (const key of CATEGORY_KEYS) {
    out[key] = {
      cost: clamp0(input?.[key]?.cost),
      tokens: Math.round(clamp0(input?.[key]?.tokens)),
    };
  }
  return out;
}

export function emptySession() {
  return {
    category: null,
    createdAt: 0,
    lastSeenAt: 0,
    seen: { ...ZERO_BUCKETS },
    dayTokens: 0,
    dayCost: 0,
    lastSeq: -1,
    model: null,
    preset: null,
    title: null,
  };
}

export function normalizeSession(input) {
  const out = emptySession();
  if (!isPlainObject(input)) return out;
  out.category = CATEGORY_KEYS.includes(input.category) ? input.category : null;
  out.createdAt = num(input.createdAt);
  out.lastSeenAt = num(input.lastSeenAt);
  out.seen = normalizeBuckets(input.seen);
  out.dayTokens = Math.round(clamp0(input.dayTokens));
  out.dayCost = clamp0(input.dayCost);
  out.lastSeq = Number.isFinite(Number(input.lastSeq)) ? Number(input.lastSeq) : -1;
  out.model = typeof input.model === 'string' ? input.model : null;
  out.preset = typeof input.preset === 'string' ? input.preset : null;
  out.title = typeof input.title === 'string' ? input.title : null;
  return out;
}

/**
 * 从一条会话的事件日志里算「今天」的 usage。
 * 同一 (turn, step, retry) 取 seq 最大的那条：流式 attempt 之后到来的
 * assistant/message 会覆盖它，不会把同一次请求算两遍。
 *
 * @param {Array} events
 * @param {{dayStart:number, fallbackModel?:string, priceTable:()=>(object), defaultModel?:()=>string}} opts
 */
export function sumUsageEvents(events, { dayStart, fallbackModel, priceTable, defaultModel = () => 'deepseek-flash' }) {
  const table = typeof priceTable === 'function' ? priceTable : () => priceTable;
  let model = fallbackModel || defaultModel();
  let maxSeq = -1;
  const axis = { turn: -1, step: -1, retry: 0 };
  const chosen = new Map();
  for (const event of Array.isArray(events) ? events : []) {
    if (!event || typeof event !== 'object') continue;
    const seq = Number(event.seq);
    if (Number.isFinite(seq) && seq > maxSeq) maxSeq = seq;
    if (event.type === 'model/selection') {
      const selected = event.data?.model
        ?? event.data?.lastUsed?.model
        ?? event.data?.next?.model;
      if (selected) model = String(selected);
      continue;
    }
    if (event.type === 'request/header') {
      const selected = event.data?.header?.config?.model;
      if (selected) model = String(selected);
      continue;
    }
    if (event.type === 'llm/retry-started') {
      const turn = Number(event.data?.turn);
      const step = Number(event.data?.step);
      if (Number.isFinite(turn) && Number.isFinite(step)) {
        axis.turn = turn;
        axis.step = step;
        axis.retry = Number.isFinite(Number(event.data?.retry)) ? Number(event.data.retry) : 1;
      }
      continue;
    }
    if (event.type !== 'assistant/message' && event.type !== 'assistant/attempt') continue;
    const usage = usageOfEvent(event);
    if (!usage) continue;
    const turn = Number(event.data?.turn);
    const step = Number(event.data?.step);
    if (!Number.isFinite(turn) || !Number.isFinite(step)) continue;
    const retry = axis.turn === turn && axis.step === step ? axis.retry : 0;
    const key = `${turn}|${step}|${retry}`;
    const buckets = normalizeBuckets(usage);
    if (totalTokensOf(buckets) === 0) continue;
    const prev = chosen.get(key);
    if (prev && Number.isFinite(seq) && prev.seq > seq) continue;
    chosen.set(key, {
      seq: Number.isFinite(seq) ? seq : -1,
      at: Number(event.time) || Date.now(),
      buckets,
      model: event.data?.message?.source?.model ?? model,
    });
  }
  let cost = 0;
  let tokens = 0;
  for (const sample of chosen.values()) {
    if (sample.at < dayStart) continue;
    const p = priceUsage(sample.buckets, { model: sample.model, at: sample.at, table: table() });
    cost += p.cost.total;
    tokens += totalTokensOf(sample.buckets);
  }
  return { cost, tokens, maxSeq, model };
}
