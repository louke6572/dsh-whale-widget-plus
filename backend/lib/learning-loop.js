/**
 * 自我学习回路：贴吧 / B站 / 抖音 → 经历 + 兴趣 + 自动近况。
 *
 * 为什么这样做（而不是继续改提示词）：
 *   提示词是死的，看完内容就忘；这里把「她最近自己看到的」沉淀成可复用的状态，
 *   再注入到 QQ / 桌宠 / 抖音的提示词里，她下次说话就有具体的生活可提。
 *
 * 数据流：
 *   观看记录（三平台各读自己的 jsonl，按时间游标只取新增）
 *     → 一次低强度模型调用提炼：经历（她的口吻）/ 兴趣 / 近况（≤300 字）
 *     → 写 learning-profile.json + persona.daily.auto.md（可回滚）
 *
 * 边界：
 *   · 只读「看过的内容」，不读聊天；提炼结果禁止编造没看到的细节；
 *   · 自动近况只写状态/兴趣/态度，不写身份、关系、底线（核心人格卡不动）；
 *   · 走 token 额度闸门，分类 other；默认 6 小时一次、至少 6 条新增才跑。
 */
import fs from 'node:fs';
import path from 'node:path';
import { readTiebaViewHistory, tiebaAction } from './tieba.js';
import { readWatchHistory } from '../tools/lib/watch-history.mjs';
import { readDouyinHistory, douyinComments, douyinStatus } from './douyin.js';
import { readUnified } from './store.js';
import { readLearningProfile, writeLearningProfile, writeAutoPersona, learningPaths } from '../../src/learning-profile.js';

const DEFAULT_CONFIG = {
  enabled: true,
  intervalHours: 6,
  minItems: 6,
  maxItems: 60,
  days: 3,
  maxExperiences: 4,
};

function clampInt(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

export function learningConfig() {
  let raw = {};
  try { raw = readUnified()?.config?.learning ?? {}; } catch { raw = {}; }
  return {
    enabled: raw.enabled !== false,
    intervalHours: clampInt(raw.intervalHours, DEFAULT_CONFIG.intervalHours, 1, 48),
    minItems: clampInt(raw.minItems, DEFAULT_CONFIG.minItems, 1, 40),
    maxItems: clampInt(raw.maxItems, DEFAULT_CONFIG.maxItems, 5, 120),
    days: clampInt(raw.days, DEFAULT_CONFIG.days, 1, 14),
    maxExperiences: clampInt(raw.maxExperiences, DEFAULT_CONFIG.maxExperiences, 2, 10),
  };
}

function whenAt(value) {
  const t = new Date(value ?? 0).getTime();
  return Number.isFinite(t) ? t : 0;
}

function short(value, max) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

/** 三个平台各自的历史 → 统一结构（只取游标之后的新内容）。 */
function collectSources(config, cursors = {}, now = Date.now()) {
  const cutoff = now - config.days * 86400_000;
  const items = [];
  try {
    const tieba = readTiebaViewHistory({ limit: config.maxItems, days: config.days, now });
    for (const row of tieba.items ?? []) {
      const at = whenAt(row.at);
      if (at < cutoff || at <= whenAt(cursors.tieba)) continue;
      items.push({
        platform: 'tieba',
        at,
        threadId: String(row.threadId || ''),
        title: short(row.title, 120),
        detail: short(row.abstract, 160),
        meta: [row.mode === 'read' ? '认真看' : '扫看', row.replyNum ? `回复${row.replyNum}` : '', row.agreeNum ? `赞${row.agreeNum}` : '']
          .filter(Boolean).join(' · '),
      });
    }
  } catch { /* 贴吧没登录/没记录 */ }
  try {
    const bili = readWatchHistory({ limit: config.maxItems, days: config.days, now });
    for (const row of bili.items ?? []) {
      const at = whenAt(row.at);
      if (at < cutoff || at <= whenAt(cursors.bili)) continue;
      items.push({
        platform: 'bili',
        at,
        bvid: String(row.bvid || ''),
        title: short(row.title, 120),
        detail: short(row.subs || row.reason || row.desc || '', 160),
        meta: [row.up ? `UP ${short(row.up, 40)}` : '', row.mode === 'full' || row.mode === 'frames' ? '认真看' : '扫看',
          row.score != null ? `评分${row.score}` : ''].filter(Boolean).join(' · '),
      });
    }
  } catch { /* B站没记录 */ }
  try {
    const douyin = readDouyinHistory({ limit: config.maxItems });
    for (const row of douyin.items ?? []) {
      const at = whenAt(row.at);
      if (at < cutoff || at <= whenAt(cursors.douyin)) continue;
      items.push({
        platform: 'douyin',
        at,
        id: String(row.id || ''),
        title: short(row.title || `作品 ${row.id}`, 120),
        detail: '',
        meta: [row.author ? `@${short(row.author, 40)}` : '', Number(row.duration) ? `${Math.round(Number(row.duration))} 秒` : '']
          .filter(Boolean).join(' · '),
      });
    }
  } catch { /* 抖音没记录 */ }
  return items.sort((a, b) => b.at - a.at).slice(0, config.maxItems);
}

function formatItems(items) {
  const labels = { tieba: '贴吧', bili: 'B站', douyin: '抖音' };
  return items.map((item, index) => {
    const parts = [`${index + 1}. [${labels[item.platform] || item.platform}] ${item.title}`];
    if (item.meta) parts.push(item.meta);
    if (item.detail) parts.push(item.detail);
    return parts.join(' | ');
  }).join('\n');
}

const SYSTEM_PROMPT = [
  '你在帮一个虚拟角色整理她最近自己刷到的内容（贴吧 / B站 / 抖音），这些是她的私下见闻。',
  '只根据下面给出的标题和摘要来写，不要编造没出现的人、事、剧情或结论。',
  '',
  '输出严格的 JSON（不要 Markdown、不要解释），格式：',
  '{"experiences":[{"platform":"tieba|bili|douyin","text":"她自己的口吻记下看到了什么+一句态度，≤90字"}],',
  ' "interests":["最近明显感兴趣的吧/UP/题材/梗，≤12字，最多6条"],',
  ' "persona":"≤260字的近况：第一人称，写最近在看什么、对什么有态度、心情如何。禁止写身份、姓名、关系、底线、权限。",',
  ' "brief":"≤120字，概括她这几天在关注什么，给聊天用的背景。"}',
  '',
  '要求：',
  '- experiences 写 3~6 条，挑真正有信息量或有态度的；纯标题、广告、重复内容不要写。',
  '- 她可以喜欢、无感、嫌烦，但不要每一条都强行升华或总结成人生道理。',
  '- 不要出现“视频中”“该帖子”“作者表示”这类转述腔，用她自己的口语。',
].join('\n');

export function createLearningLoop({ ctx, log = () => {}, tokenBudget = null } = {}) {
  let timer = null;
  let initial = null;
  let running = false;
  let lastError = '';
  let lastResult = null;

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

  function recordUsage(usage, model) {
    if (!usage || !tokenBudget?.recordExternalUsage) return;
    try {
      tokenBudget.recordExternalUsage({
        category: 'other',
        sessionId: 'learning-loop',
        model,
        usage,
        at: Date.now(),
        label: '自我学习',
      });
    } catch (error) {
      log('[learning] 记录 token 用量失败：', String(error?.message ?? error).slice(0, 120));
    }
  }

  async function complete({ system, user, maxTokens = 900 }) {
    const llm = ctx?.get?.('llm');
    if (!llm?.stream) throw new Error('DSH 模型服务不可用');
    const target = resolveModel();
    if (!target) throw new Error('读不到 DSH 默认模型');
    const base = {
      provider: target.provider,
      model: target.model,
      system,
      messages: [{ role: 'user', content: [{ type: 'text', text: user }] }],
      maxTokens,
      temperature: 0.4,
    };
    let lastFailure = null;
    // 换提供商后思考强度档位可能不被支持：先带 low，报错再退回不指定。
    for (const effort of ['low', undefined]) {
      let text = '';
      let reasoning = '';
      let usage = null;
      try {
        const stream = llm.stream(effort ? { ...base, reasoningEffort: effort } : base);
        for await (const chunk of stream) {
          if (!chunk) continue;
          if (chunk.type === 'text-delta' && chunk.text) text += chunk.text;
          else if (chunk.type === 'reasoning-delta' && chunk.text) reasoning += chunk.text;
          else if (chunk.type === 'usage' && chunk.usage) usage = chunk.usage;
          else if (chunk.type === 'finish') {
            const kind = chunk.reason?.kind;
            if (kind === 'error' || kind === 'aborted') {
              throw new Error(chunk.reason?.failure?.message || (kind === 'aborted' ? '模型调用被取消' : '模型调用失败'));
            }
          }
        }
        recordUsage(usage, target.model);
        return (text.trim() || reasoning.trim());
      } catch (error) {
        lastFailure = error;
        if (text.trim() || reasoning.trim()) {
          recordUsage(usage, target.model);
          return (text.trim() || reasoning.trim());
        }
      }
    }
    throw lastFailure || new Error('模型调用失败');
  }

  function parseJson(text) {
    const raw = String(text ?? '').trim();
    const body = raw.replace(/```(?:json)?/gi, '');
    const start = body.indexOf('{');
    const end = body.lastIndexOf('}');
    if (start < 0 || end <= start) throw new Error('模型没有返回 JSON');
    const data = JSON.parse(body.slice(start, end + 1));
    return {
      experiences: Array.isArray(data.experiences) ? data.experiences : [],
      interests: Array.isArray(data.interests) ? data.interests : [],
      persona: String(data.persona ?? ''),
      brief: String(data.brief ?? ''),
    };
  }

  /** 宽容解析：严格失败时从被截断的 JSON 里抢救 experiences / persona / brief。 */
  function parseLearning(text) {
    const raw = String(text ?? '').trim();
    const body = raw.replace(/```(?:json)?/gi, '');
    const start = body.indexOf('{');
    const end = body.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        const data = JSON.parse(body.slice(start, end + 1));
        return {
          partial: false,
          data: {
            experiences: Array.isArray(data.experiences) ? data.experiences : [],
            interests: Array.isArray(data.interests) ? data.interests : [],
            persona: String(data.persona ?? ''),
            brief: String(data.brief ?? ''),
          },
        };
      } catch { /* 走抢救 */ }
    }
    const out = { experiences: [], interests: [], persona: '', brief: '' };
    const expAt = body.indexOf('"experiences"');
    if (expAt >= 0) {
      const arr = body.indexOf('[', expAt);
      if (arr >= 0) {
        let depth = 0;
        let objStart = -1;
        let inStr = false;
        let esc = false;
        for (let i = arr + 1; i < body.length; i += 1) {
          const ch = body[i];
          if (inStr) {
            if (esc) esc = false;
            else if (ch === '\\') esc = true;
            else if (ch === '"') inStr = false;
            continue;
          }
          if (ch === '"') { inStr = true; continue; }
          if (ch === '{') { if (depth === 0) objStart = i; depth += 1; continue; }
          if (ch === '}') {
            depth -= 1;
            if (depth === 0 && objStart >= 0) {
              try { out.experiences.push(JSON.parse(body.slice(objStart, i + 1))); } catch { /* 跳过坏项 */ }
              objStart = -1;
            }
            continue;
          }
          if (ch === ']' && depth === 0) break;
        }
      }
    }
    const grab = (key) => {
      const at = body.indexOf(`"${key}"`);
      if (at < 0) return '';
      const colon = body.indexOf(':', at);
      const quote = body.indexOf('"', colon + 1);
      if (colon < 0 || quote < 0) return '';
      let value = '';
      for (let i = quote + 1; i < body.length; i += 1) {
        const ch = body[i];
        if (ch === '\\') { value += body[i + 1] ?? ''; i += 1; continue; }
        if (ch === '"') break;
        value += ch;
      }
      return value;
    };
    out.persona = grab('persona');
    out.brief = grab('brief');
    if (out.experiences.length || out.persona || out.brief) return { partial: true, data: out };
    throw new Error('模型没有返回可用 JSON');
  }

  /** 贴吧深读：取前几楼（评论区）当素材；最多 2 帖，失败静默跳过。 */
  async function enrichTieba(items) {
    const targets = items.filter((item) => item.platform === 'tieba' && item.threadId).slice(0, 2);
    let added = 0;
    for (const item of targets) {
      try {
        const result = await Promise.race([
          tiebaAction('thread', { id: item.threadId, preview: true }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 15_000)),
        ]);
        const posts = (result?.thread?.posts ?? [])
          .slice(0, 5)
          .map((post) => short(post?.content, 90))
          .filter(Boolean);
        if (posts.length) {
          item.detail = `前几楼/评论区：${posts.join(' / ')}`.slice(0, 320);
          added += posts.length;
        }
      } catch { /* 贴吧没登录 / 网络慢：跳过深读，不影响其它平台 */ }
    }
    return added;
  }

  async function fetchJson(url, timeoutMs = 12_000) {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://www.bilibili.com/' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }

  /** B站深读：bvid → aid → 热评（公开接口，不需要开浏览器）。最多 2 条视频。 */
  async function enrichBili(items) {
    const targets = items.filter((item) => item.platform === 'bili' && item.bvid).slice(0, 2);
    let added = 0;
    for (const item of targets) {
      try {
        const view = await fetchJson(`https://api.bilibili.com/x/web-interface/view?bvid=${encodeURIComponent(item.bvid)}`);
        const aid = view?.data?.aid;
        if (!aid) continue;
        const reply = await fetchJson(`https://api.bilibili.com/x/v2/reply?type=1&oid=${aid}&pn=1&ps=8&sort=2`);
        const texts = (reply?.data?.replies ?? [])
          .slice(0, 5)
          .map((row) => short(row?.content?.message, 80))
          .filter(Boolean);
        if (texts.length) {
          item.detail = `${item.detail ? `${item.detail} / ` : ''}热评：${texts.join(' / ')}`.slice(0, 320);
          added += texts.length;
        }
      } catch { /* 接口风控/网络失败：跳过 */ }
    }
    return added;
  }

  /** 抖音深读：只有浏览器已经在跑时才读评论区（避免学习时弹窗口）。最多 1 条。 */
  async function enrichDouyin(items) {
    let status = null;
    try { status = await douyinStatus(); } catch { return 0; }
    if (status?.browser?.running !== true) return 0;
    const target = items.find((item) => item.platform === 'douyin' && item.id && !item.detail);
    if (!target) return 0;
    try {
      const result = await Promise.race([
        douyinComments({ awemeId: target.id, max: 6, images: false }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 20_000)),
      ]);
      const texts = (result?.items ?? [])
        .slice(0, 5)
        .map((row) => short(row?.text, 80))
        .filter(Boolean);
      if (texts.length) {
        target.detail = `评论区：${texts.join(' / ')}`.slice(0, 320);
        return texts.length;
      }
    } catch { /* 浏览器不在抖音页/超时：跳过 */ }
    return 0;
  }

  async function run({ force = false } = {}) {
    const config = learningConfig();
    if (running) return { ok: false, reason: 'busy' };
    if (!config.enabled && !force) return { ok: false, reason: 'disabled' };
    if (!llmReady()) return { ok: false, reason: 'no-model', error: 'DSH 模型服务未就绪' };
    const profile = readLearningProfile();
    const items = collectSources(config, profile.cursors, Date.now());
    if (!items.length) return { ok: false, reason: 'no-items' };
    if (items.length < config.minItems && !force) {
      return { ok: false, reason: 'below-min', count: items.length, minItems: config.minItems };
    }
    if (tokenBudget?.block) {
      try {
        const gate = await tokenBudget.block('other');
        if (gate?.blocked) return { ok: false, reason: 'token-blocked', error: gate.message || '今天的 token 额度用完了' };
      } catch { /* 闸门本身坏了就别拦 */ }
    }

    running = true;
    try {
      // 深读：贴吧前几楼 + B站热评 + 抖音评论区（抖音只在浏览器已开着时才读）。
      const tiebaDeep = await enrichTieba(items);
      const biliDeep = await enrichBili(items);
      const douyinDeep = await enrichDouyin(items);
      log(`[learning] 深读：贴吧 ${tiebaDeep} 楼 / B站 ${biliDeep} 条热评 / 抖音 ${douyinDeep} 条评论`);
      const base = `最近刷到的内容（共 ${items.length} 条）：\n${formatItems(items)}`;
      let parsed = null;
      let lastRaw = '';
      let lastError = '';
      for (const attempt of [1, 2]) {
        try {
          const text = await complete({
            system: SYSTEM_PROMPT,
            user: attempt === 1 ? base : `${base}\n\n重要：只输出一个完整 JSON 对象，不要解释、不要 Markdown。`,
            maxTokens: 900,
          });
          lastRaw = text;
          parsed = parseLearning(text);
          break;
        } catch (error) {
          lastError = String(error?.message ?? error).slice(0, 160);
          log(`[learning] 第 ${attempt} 次失败：${lastError}｜模型原文：${short(lastRaw, 200)}`);
        }
      }
      let data;
      let partial = false;
      if (parsed) {
        data = parsed.data;
        partial = parsed.partial;
      } else {
        // 兜底：模型完全没按格式来，就把正文当“近况”，至少让她有一点新东西。
        data = {
          experiences: [],
          interests: [],
          persona: short(lastRaw, 240),
          brief: short(lastRaw, 120),
        };
        partial = true;
        log('[learning] 模型未按 JSON 返回，改用正文兜底');
      }
      const now = Date.now();
      const experiences = [];
      for (const row of data.experiences.slice(0, 6)) {
        const platform = String(row?.platform || '');
        const body = short(row?.text, 110);
        if (!['tieba', 'bili', 'douyin'].includes(platform) || !body) continue;
        experiences.push({ platform, text: body, at: now });
      }
      const interests = data.interests.map((x) => short(x, 14)).filter(Boolean).slice(0, 6);
      const persona = short(data.persona, 300);
      const brief = short(data.brief, 200);
      const cursors = { ...profile.cursors };
      for (const item of items) {
        const current = Number(cursors[item.platform]) || 0;
        if (item.at > current) cursors[item.platform] = item.at;
      }
      const next = writeLearningProfile({
        cursors,
        experiences: [...profile.experiences, ...experiences].slice(-120),
        interests,
        brief,
        persona,
        lastRunAt: now,
        stats: {
          runs: (Number(profile.stats?.runs) || 0) + 1,
          items: (Number(profile.stats?.items) || 0) + experiences.length,
        },
      });
      const personaWritten = persona ? writeAutoPersona(persona, now) : false;
      lastError = '';
      lastResult = {
        ok: true,
        items: items.length,
        experiences: experiences.length,
        interests,
        brief,
        persona,
        personaWritten,
        file: learningPaths().profile,
      };
      log(`[learning] 已学习 ${experiences.length} 条经历（来源 ${items.length} 条，兴趣 ${interests.length} 个）`);
      return lastResult;
    } catch (error) {
      lastError = String(error?.message ?? error).slice(0, 200);
      log('[learning] 学习失败：', lastError);
      return { ok: false, reason: 'failed', error: lastError };
    } finally {
      running = false;
    }
  }

  function status() {
    const config = learningConfig();
    const profile = readLearningProfile();
    return {
      ok: true,
      enabled: config.enabled,
      intervalHours: config.intervalHours,
      minItems: config.minItems,
      running,
      llmReady: llmReady(),
      lastRunAt: profile.lastRunAt,
      updatedAt: profile.updatedAt,
      experiences: profile.experiences.slice(-6),
      interests: profile.interests,
      brief: profile.brief,
      persona: profile.persona,
      stats: profile.stats,
      cursors: profile.cursors,
      file: learningPaths().profile,
      autoPersona: learningPaths().autoPersona,
      lastError,
      lastResult,
    };
  }

  /** 定时学习：插件启动 10 分钟后第一次，之后按 intervalHours。 */
  function start() {
    if (timer || initial) return;
    const tick = () => {
      const config = learningConfig();
      if (!config.enabled) return;
      void run().catch(() => {});
    };
    initial = setTimeout(tick, 10 * 60 * 1000);
    try { initial.unref?.(); } catch {}
    timer = setInterval(tick, learningConfig().intervalHours * 3600 * 1000);
    try { timer.unref?.(); } catch {}
  }

  function stop() {
    if (initial) { clearTimeout(initial); initial = null; }
    if (timer) { clearInterval(timer); timer = null; }
  }

  return { run, status, start, stop };
}
