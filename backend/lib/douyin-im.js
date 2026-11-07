/**
 * 抖音私信 / 群聊 —— 走 douyin-im 协议 SDK（纯 Node 长连接，不需要浏览器）。
 *
 * 为什么换掉浏览器方案：
 *   · 旧的 vendor 实现必须开一个有窗口的 Edge，窗口一到前台就暂停，还会被页面风控卡住；
 *   · 这里用 douyin-im（MIT，非官方协议 SDK）扫码/短信登录一次，之后只走 WebSocket，
 *     和 QQ 一样是长连接；
 *   · 每条消息投进对应的 DSH 会话（一人/一群一条，重启不换），由 DSH 的 agent 回复，
 *     再把整段回复发回抖音。
 *
 * 安全边界：
 *   · 只回复「许可名单」里的会话；
 *   · 群聊默认只在被 @ 或叫到昵称时回；
 *   · 陌生人私信一律不回；
 *   · 每日回复有上限，重复消息按服务端 messageId 去重。
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { DOUYIN_DIR } from './douyin.js';
import { readUnified } from './store.js';
import { notePersonaActivity, personaPromptBlock } from '../../src/persona-state.js';
import { learningPromptBlock } from '../../src/learning-profile.js';
import { activeMemoryPaths, activePersonaFile, readCurrentCharacter, readPersonaLayerText } from '../../src/character-persona.js';
import { composePersonaLayers } from '../../src/persona-layers.js';
import { buildPersonaIdentity, personaNameFromCard } from '../../src/persona-identity.js';
import { appendMemoryInboxEvent } from '../../src/memory-card.js';
import { memoryCardPromptBlock } from './memory-card.js';

const IM_DIR = path.join(DOUYIN_DIR, 'im');
const DATA_DIR = path.join(IM_DIR, 'data');
const CONFIG_FILE = path.join(IM_DIR, 'config.json');
const STATE_FILE = path.join(IM_DIR, 'state.json');
const REPLIED_FILE = path.join(IM_DIR, 'replied.json');
const WORKSPACE_DIR = path.join(IM_DIR, 'workspace');

const DEFAULT_CONFIG = {
  version: 1,
  enabled: false,
  allowlist: [],
  mentionNames: [],
  groupMentionOnly: true,
  dailyReplyLimit: 80,
};

let logLine = () => {};
export function configureDouyinImLog(fn) {
  logLine = typeof fn === 'function' ? fn : () => {};
}
const log = (message) => { try { logLine(`[抖音IM] ${message}`); } catch { /* 日志失败不影响主流程 */ } };

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function writeJson(file, value) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const temporary = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(value, null, 2), { mode: 0o600 });
    fs.renameSync(temporary, file);
  } catch (error) {
    log(`写文件失败 ${path.basename(file)}：${String(error?.message ?? error).slice(0, 120)}`);
  }
}

function defaultMentionNames() {
  try {
    const names = readUnified()?.config?.douyin?.chat?.mentionNames;
    if (Array.isArray(names) && names.length) return names.map(String);
  } catch { /* ignore */ }
  return ['大肥鱼'];
}

function normalizeConfig(raw) {
  const value = raw && typeof raw === 'object' ? raw : {};
  return {
    version: 1,
    enabled: value.enabled === true,
    allowlist: Array.isArray(value.allowlist)
      ? value.allowlist
        .filter((item) => item && typeof item.id === 'string' && /^(private|group):/.test(item.id))
        .map((item) => ({ id: item.id, name: String(item.name ?? '').slice(0, 120), isGroup: item.isGroup === true || item.id.startsWith('group:') }))
      : [],
    mentionNames: Array.isArray(value.mentionNames) && value.mentionNames.length
      ? value.mentionNames.map((item) => String(item).trim()).filter(Boolean).slice(0, 20)
      : defaultMentionNames(),
    groupMentionOnly: value.groupMentionOnly !== false,
    dailyReplyLimit: Number.isFinite(Number(value.dailyReplyLimit)) ? Math.max(1, Math.min(500, Number(value.dailyReplyLimit))) : 80,
  };
}

export function douyinImConfig() { return normalizeConfig(readJson(CONFIG_FILE, DEFAULT_CONFIG)); }

function saveConfig(next) {
  const value = normalizeConfig(next);
  writeJson(CONFIG_FILE, value);
  return value;
}

function dayKey() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
function readState() {
  const state = readJson(STATE_FILE, {});
  if (state?.date !== dayKey()) return { date: dayKey(), replies: 0 };
  return { date: dayKey(), replies: Number(state.replies) || 0 };
}
function saveState(state) { writeJson(STATE_FILE, state); }

function readReplied() {
  const value = readJson(REPLIED_FILE, { ids: [] });
  return Array.isArray(value?.ids) ? value.ids.map(String).slice(-300) : [];
}
function saveReplied(ids) {
  writeJson(REPLIED_FILE, { ids: ids.slice(-300) });
}

// ── 登录与客户端 ───────────────────────────────────────────────────────────
const runtime = {
  client: null,
  account: null,
  phase: 'idle',          // idle | starting | need-qr | need-sms | verification | online | offline | error
  nickname: '',
  uid: '',
  qr: '',
  qrAt: 0,
  smsMobile: '',
  verificationAt: 0,
  error: '',
  loginTask: null,
};
let pluginCtx = null;
let listenersBound = false;
let resumeTimer = null;
let disposed = false;

// 每个抖音会话（一人 / 一群）对应一条 DSH 会话：重启后按稳定 id 接回。
const chatByKey = new Map();
const chatBySession = new Map();
let sessionEventOff = null;

export function configureDouyinIm({ ctx } = {}) {
  if (ctx !== undefined) {
    pluginCtx = ctx;
    bindSessionEvents();
  }
}

function bindSessionEvents() {
  const ctx = pluginCtx;
  if (sessionEventOff || typeof ctx?.on !== 'function') return;
  try {
    sessionEventOff = ctx.on('session/event', (session, event) => {
      const chat = chatBySession.get(String(session?.id ?? ''));
      // controller 模式靠 wait() 的 outcome 取回复；这里不再缓存，避免 buffer 无限增长。
      if (!chat || chat.kind === 'controller') return;
      if (event?.type === 'assistant/message') {
        const text = assistantTextOf(event);
        if (text) chat.buffer.push(text);
        return;
      }
      if (event?.type === 'turn/end') settleChat(chat, event.data?.reason);
    });
  } catch (error) {
    log(`会话事件监听失败：${String(error?.message ?? error).slice(0, 160)}`);
  }
}

function assistantTextOf(event) {
  const content = event?.data?.message?.content;
  if (!Array.isArray(content)) return '';
  return content
    .filter((block) => block?.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('')
    .trim();
}

function settleChat(chat, reason) {
  const waiter = chat?.waiter;
  if (!waiter) return;
  chat.waiter = null;
  clearTimeout(waiter.timer);
  const reply = String(chat.buffer.at(-1) ?? '').trim();
  chat.buffer = [];
  if (reason && reason.kind === 'error') {
    waiter.reject(new Error(`回合出错：${String(reason.error?.message || reason.kind).slice(0, 200)}`));
    return;
  }
  if (!reply) {
    waiter.reject(new Error('这一轮没有产出文本（可能是工具调用被权限挡掉，或模型没回）'));
    return;
  }
  waiter.resolve(reply);
}

// sessionController 的部分 Remote 方法签名是 (request, signal)（prompt 第一行就
// signal.throwIfAborted()）。插件调用时没传 signal 会直接 TypeError:
// "Cannot read properties of undefined (reading 'throwIfAborted')"。
// 这里用一个永不中断的 signal：单轮超时由 wait 的 timeoutMs 自己控制。
const CONTROLLER_SIGNAL = new AbortController().signal;

function sessionIdOf(key) {
  return `douyin-im-${createHash('sha1').update(String(key)).digest('hex').slice(0, 12)}`;
}

/** 打开/接回会话：优先 sessionController（DSH 侧栏能看到会话），失败退回 agents（旧路径）。 */
async function openChatSession(key) {
  const known = chatByKey.get(key);
  if (known) return known;
  const ctx = pluginCtx;
  if (!ctx) throw new Error('DSH 插件上下文没就绪');
  const service = (name) => {
    try { return typeof ctx.get === 'function' ? ctx.get(name) : ctx[name]; } catch { return undefined; }
  };
  try { fs.mkdirSync(WORKSPACE_DIR, { recursive: true }); } catch { /* 目录失败不影响会话 */ }
  const sessionId = sessionIdOf(key);

  // ── 首选：sessionController（和旧版抖音回复同一条路，DSH 侧栏/身份页能看到会话）──
  const controller = service('sessionController');
  // 主路径依赖 state/wait（发送时要按 cursor 等这一轮），DSH Remote 没暴露它们时只能走 agents 兜底。
  if (controller && typeof controller.create === 'function' && typeof controller.prompt === 'function'
    && typeof controller.wait === 'function' && typeof controller.state === 'function') {
    // 不依赖 inspect（Remote 服务没暴露它）：用 state 探一下会话是否已经在盘上。
    try { await controller.state({ sessionId }); }
    catch {
      try {
        await controller.create({ sessionId, cwd: WORKSPACE_DIR, agentPreset: 'douyin-chat' });
      } catch (createError) {
        // 已存在但 state 读不到：再探一次，仍然不行才报错。
        try { await controller.state({ sessionId }); } catch { throw createError; }
      }
    }
    await applyControllerModel(controller, sessionId);
    const chat = {
      key,
      kind: 'controller',
      controller,
      sessionId,
      buffer: [],
      waiter: null,
      chain: Promise.resolve(),
    };
    chatByKey.set(key, chat);
    chatBySession.set(chat.sessionId, chat);
    await applySessionTitle(controller, chat.sessionId, key);
    log(`会话已就绪（DSH 侧栏可见）：${key} -> ${chat.sessionId}`);
    return chat;
  }

  // ── 兜底：agents 服务（老版本 DSH 没有 sessionController 时）──
  const agents = service('agents');
  if (!agents || typeof agents.resume !== 'function' || typeof agents.create !== 'function') {
    throw new Error('DSH agents 服务没就绪（需要重启 DSH 让插件重新加载）');
  }
  const defaultModel = service('agentDefaultModel');
  const selection = (() => { try { return defaultModel?.currentSelection?.() ?? {}; } catch { return {}; } })();
  const agentOptions = {
    ...(selection?.provider ? { provider: selection.provider } : {}),
    ...(selection?.model ? { model: selection.model } : {}),
    ...(selection?.reasoningEffort ? { reasoningEffort: selection.reasoningEffort } : {}),
  };
  const presets = service('agentPresets');
  const setup = async (agentCtx) => {
    if (!presets || typeof presets.mount !== 'function') return;
    try { await presets.mount(agentCtx, 'douyin-chat'); }
    catch (error) { log(`挂 preset 失败（继续用基础提示词）：${String(error?.message ?? error).slice(0, 140)}`); }
  };
  let handle;
  try {
    handle = await agents.resume({ resumeSessionId: sessionId, agentOptions, setup });
  } catch (resumeError) {
    log(`接回抖音会话失败（${key}）：${String(resumeError?.message ?? resumeError).slice(0, 140)}，尝试新建`);
    try {
      handle = await agents.create({ sessionId, meta: { cwd: WORKSPACE_DIR }, agentOptions, setup });
    } catch (createError) {
      // 会话在盘上、resume 又失败：同 id create 会报 already exists。
      // 再试一次 resume（断线重连时第一次失败很常见）；仍拿不到所有权就请
      // sessionController 分配一个新会话 id，保证这条回复能发出去。
      if (!/already exists/i.test(String(createError?.message ?? ''))) {
        throw new Error(`建 DSH 会话失败：${String(createError?.message ?? createError).slice(0, 180)}`);
      }
      try {
        handle = await agents.resume({ resumeSessionId: sessionId, agentOptions, setup });
        log(`再审接回抖音会话成功：${key}`);
      } catch (retryError) {
        // 会话在盘上但被 DSH 侧占用（resume 拿不到所有权）：让 sessionController
        // 自己分配一个可用会话 id（它会 minted 一个不冲突的），再用 agents 接回。
        log(`再审仍失败（${key}）：${String(retryError?.message ?? retryError).slice(0, 140)}，改由 sessionController 分配会话`);
        const controller = service('sessionController');
        if (!controller || typeof controller.create !== 'function') {
          throw new Error(`建 DSH 会话失败：${String(retryError?.message ?? retryError).slice(0, 180)}`);
        }
        const created = await controller.create({ cwd: WORKSPACE_DIR, agentPreset: 'douyin-chat' });
        const mintedId = String(created?.sessionId ?? '').trim();
        if (!mintedId) throw new Error(`建 DSH 会话失败：${String(retryError?.message ?? retryError).slice(0, 180)}`);
        handle = await agents.resume({ resumeSessionId: mintedId, agentOptions, setup });
        log(`抖音会话 ${key} 改挂到新会话：${mintedId}`);
      }
    }
  }
  const chat = {
    key,
    handle,
    sessionId: String(handle?.agent?.session?.id ?? sessionId),
    buffer: [],
    waiter: null,
    chain: Promise.resolve(),
  };
  chatByKey.set(key, chat);
  chatBySession.set(chat.sessionId, chat);
  await applySessionTitle(service('sessionController'), chat.sessionId, key);
  log(`会话已就绪：${key} -> ${chat.sessionId}`);
  return chat;
}

// 会话标题：抖音会话默认没有标题，DSH 侧栏里就是一片空白，根本找不到。
// 这里给每个会话起一个「抖音群聊 · 群名」，让它在会话列表里可辨认（只改一次）。
const titledSessions = new Set();

async function applySessionTitle(controller, sessionId, key) {
  if (!controller || typeof controller.rename !== 'function') return;
  if (titledSessions.has(sessionId)) return;
  const cfg = douyinImConfig();
  const item = cfg.allowlist.find((one) => one.id === key);
  const rawName = String(item?.name || key.split(':')[1] || '').trim() || '会话';
  const title = `抖音${key.startsWith('group:') ? '群聊' : '私聊'} · ${rawName}`.slice(0, 60);
  try {
    await controller.rename({ sessionId, title });
    titledSessions.add(sessionId);
    log(`会话标题已设为「${title}」`);
  } catch (error) {
    // 改名失败不影响回复；下次打开还会再试一次。
    log(`会话改名失败（继续回复）：${String(error?.message ?? error).slice(0, 120)}`);
  }
}

/** 抖音会话跟随 DSH 里设置的模型（没配就用会话默认）。 */
async function applyControllerModel(controller, sessionId) {
  if (typeof controller.selectModel !== 'function') return;
  try {
    const model = readUnified()?.config?.model;
    if (!model?.provider || !model?.model) return;
    await controller.selectModel({
      sessionId,
      provider: String(model.provider),
      model: String(model.model),
      ...(model.reasoningEffort ? { reasoningEffort: String(model.reasoningEffort) } : {}),
    });
  } catch { /* 切不过去就继续用会话当前模型，回复本身不能因此失败 */ }
}

function makeUserMessage(text, key) {
  return Object.freeze({
    id: randomUUID(),
    role: 'user',
    content: [{ type: 'text', text }],
    source: {
      kind: key.startsWith('group:') ? 'douyin:group' : 'douyin:private',
      plugin: 'douyin-im',
      key: String(key),
    },
  });
}

/** 从 controller.wait 的 outcome 里取最后一条 assistant 文本（思考/工具调用不算）。 */
function extractOutcomeReply(outcome) {
  const texts = [];
  for (const record of outcome?.output?.records ?? []) {
    if (record?.type !== 'event') continue;
    const event = record.event;
    if (event?.type !== 'assistant/message' || event.surfaceOp !== 'append') continue;
    const content = event.data?.message?.content;
    if (!Array.isArray(content)) continue;
    const text = content
      .filter((block) => block?.type === 'text' && typeof block.text === 'string')
      .map((block) => block.text)
      .join('')
      .trim();
    if (text) texts.push(text);
  }
  return texts.at(-1) ?? '';
}

/** 走 sessionController：prompt + wait（和旧版抖音回复同一套，DSH 里能看到这一轮）。 */
function askControllerChat(chat, text) {
  const run = chat.chain.then(async () => {
    const before = await chat.controller.state({ sessionId: chat.sessionId }, CONTROLLER_SIGNAL).catch(() => null);
    const afterSeq = Number.isFinite(before?.cursor) ? before.cursor : undefined;
    await chat.controller.prompt({
      requestId: `douyin-im-${randomUUID()}`,
      sessionId: chat.sessionId,
      mode: 'queue',
      content: [{ type: 'text', text }],
    }, CONTROLLER_SIGNAL);
    const outcome = await chat.controller.wait({
      sessionId: chat.sessionId,
      ...(afterSeq === undefined ? {} : { afterSeq }),
      maxMessages: 30,
      timeoutMs: 180_000,
    }, CONTROLLER_SIGNAL);
    if (outcome?.reason === 'input-required') {
      try { await chat.controller.cancel({ sessionId: chat.sessionId }); } catch { /* 取消失败也要报错 */ }
      throw new Error('DSH 会话在等待人工确认，已取消本轮回复');
    }
    const reply = extractOutcomeReply(outcome);
    if (!reply) throw new Error('这一轮没有产出文本（可能工具调用被权限挡掉，或模型没回）');
    return reply;
  });
  chat.chain = run.catch(() => {}).then(() => new Promise((resolve) => setTimeout(resolve, 50)));
  return run;
}

/** 投一条消息并等这一轮结束；同一会话串行，避免两条消息抢同一轮。 */
function askChat(chat, text) {
  if (chat.kind === 'controller') return askControllerChat(chat, text);
  const run = chat.chain.then(() => new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (chat.waiter && chat.waiter.timer === timer) {
        chat.waiter = null;
        reject(new Error('等待模型回复超时（180 秒）'));
      }
    }, 180_000);
    timer.unref?.();
    chat.waiter = { resolve, reject, timer };
    chat.buffer = [];
    try {
      chat.handle.agent.followup(makeUserMessage(text, chat.key));
    } catch (error) {
      clearTimeout(timer);
      chat.waiter = null;
      reject(error);
    }
  }));
  chat.chain = run.catch(() => {}).then(() => new Promise((resolve) => setTimeout(resolve, 50)));
  return run;
}

async function loadSdk() {
  const mod = await import('douyin-im');
  return mod;
}

// ── 人格注入 ───────────────────────────────────────────────────────────────
// 抖音会话的 preset 是固定的安全规则，不含角色人格（这一点和 QQ 不同：
// QQ 桥接每条消息都会注入 roles/<角色>.md）。不补这一块，抖音里的回复就只剩
// 「一个会用模型的客服」——没有身份、没有性格、也没有共同经历。
// 这里按 mtime 缓存，人格卡一改下次回复就生效。
let personaCache = { key: '', text: '' };

function ownerDisplayName() {
  try { return String(readUnified()?.config?.admin?.displayName || '').trim() || '主人'; } catch { return '主人'; }
}

function douyinPersonaBlock() {
  let file = '';
  try { file = String(activePersonaFile() || ''); } catch { file = ''; }
  if (!file) return '';
  let stat = null;
  try { stat = fs.statSync(file); } catch { return ''; }
  const key = `${file}:${stat.mtimeMs}:${stat.size}`;
  if (personaCache.key === key) return personaCache.text;
  let core = '';
  try { core = fs.readFileSync(file, 'utf8').trim(); } catch { return ''; }
  if (!core) return '';
  try {
    let cur = null;
    try { cur = readCurrentCharacter(); } catch { cur = null; }
    const composed = composePersonaLayers({
      core,
      identity: buildPersonaIdentity({ name: personaNameFromCard(core, cur?.name || '这个角色'), owner: ownerDisplayName() }),
      tone: readPersonaLayerText('tone'),
      daily: readPersonaLayerText('daily'),
      mode: 'v2',
      maxChars: 2600,
    }).text || core;
    personaCache = { key, text: composed.trim() };
    return personaCache.text;
  } catch {
    personaCache = { key, text: core };
    return core;
  }
}

/** 记忆卡注入块（四个平台同一张卡；关闭记忆卡时返回空）。 */
function memoryCardBlock(platform) {
  try {
    if (readUnified()?.config?.memoryCard?.enabled === false) return '';
    return String(memoryCardPromptBlock(platform) || '').trim();
  } catch {
    return '';
  }
}

/** 这一轮对话 → 统一记忆卡（和 QQ / B站 / 贴吧 / 桌宠同一条遗忘曲线）。 */
function rememberConversation({ conversation, batch, reply }) {
  try {
    if (readUnified()?.config?.memoryCard?.enabled === false) return;
    const paths = activeMemoryPaths();
    const now = Date.now();
    // 只记最后两句，整批都写会把卡刷满；群聊里本来也只是被叫到的那几句。
    for (const item of batch.slice(-2)) {
      appendMemoryInboxEvent(paths, {
        at: now - 1,
        platform: 'qq',
        kind: conversation.isGroup ? 'group' : 'private',
        sender: senderNameOf(item.event),
        senderId: String(item.event?.senderUid ?? ''),
        groupId: conversation.isGroup ? conversation.key : '',
        direct: !conversation.isGroup,
        conversationKey: `douyin:${conversation.key}`,
        text: item.text,
      });
    }
    let roleName = '她';
    try { roleName = String(readCurrentCharacter()?.name || '').trim() || '她'; } catch { roleName = '她'; }
    appendMemoryInboxEvent(paths, {
      at: now,
      platform: 'qq',
      kind: conversation.isGroup ? 'group' : 'private',
      sender: roleName,
      isSelf: true,
      private: !conversation.isGroup,
      direct: true,
      conversationKey: `douyin:${conversation.key}`,
      text: reply,
    });
  } catch (error) {
    log(`写记忆失败：${String(error?.message ?? error).slice(0, 120)}`);
  }
}

async function getClient() {
  if (runtime.client) return runtime.client;
  const { createClient, configureLogger } = await loadSdk();
  try {
    configureLogger({ level: 'warn', color: false, maskSensitive: true });
  } catch { /* 日志配置失败不影响连接 */ }
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(WORKSPACE_DIR, { recursive: true });
  const client = createClient({ dataDir: DATA_DIR });
  runtime.client = client;
  bindEvents(client);
  return client;
}

function findAccount(client) {
  if (runtime.account) return runtime.account;
  try {
    const accounts = typeof client.pickAccount === 'function' ? [client.pickAccount()] : [];
    runtime.account = accounts.find(Boolean) ?? null;
  } catch { /* 没有账号 */ }
  return runtime.account;
}

function describeError(error) {
  if (!error) return '';
  if (typeof error === 'string') return error.slice(0, 300);
  if (error instanceof Error) return String(error.message || error.name || error).slice(0, 300);
  if (typeof error === 'object') {
    if (typeof error.message === 'string' && error.message) return error.message.slice(0, 300);
    try { return JSON.stringify(error).slice(0, 300); } catch { return String(error).slice(0, 300); }
  }
  return String(error).slice(0, 300);
}

function bindEvents(client) {
  if (listenersBound) return;
  listenersBound = true;
  client.on('system.login.qrcode', (info) => {
    try {
      runtime.phase = 'need-qr';
      runtime.qr = info?.qrcodeBase64 ? `data:image/png;base64,${info.qrcodeBase64}` : '';
      runtime.qrAt = Date.now();
      runtime.error = '';
      runtime.account = info?.account ?? runtime.account;
      log('需要扫码登录');
      // 和 demo 一样：二维码展示后继续等待手机端确认。
      Promise.resolve(info?.account?.continueLogin?.()).catch((error) => {
        runtime.phase = 'error';
        runtime.error = String(error?.message ?? error).slice(0, 200);
      });
    } catch (error) { log(`扫码事件处理失败：${String(error?.message ?? error).slice(0, 120)}`); }
  });
  client.on('system.login.qrcode.status', (payload) => {
    try {
      if (payload?.status === 'confirmed' || payload?.status === 'success') log('二维码已确认');
      else if (payload?.description) log(`扫码状态：${payload.description}`);
    } catch { /* ignore */ }
  });
  client.on('system.login.sms', (payload) => {
    runtime.phase = 'need-sms';
    runtime.smsMobile = String(payload?.mobile ?? payload?.maskedMobile ?? '');
    runtime.error = '';
    log(`等待短信验证码（${runtime.smsMobile || '手机号'}）`);
  });
  client.on('system.login.voice', (payload) => {
    runtime.phase = 'need-sms';
    runtime.smsMobile = String(payload?.mobile ?? payload?.maskedMobile ?? '');
    log('等待语音验证码');
  });
  client.on('system.login.accounts', () => {
    runtime.phase = 'error';
    runtime.error = '这个手机号绑定了多个抖音账号，暂时请在抖音 App 里确认后再登录';
  });
  client.on('system.login.sms-required', (payload) => {
    runtime.phase = 'need-sms';
    runtime.smsMobile = String(payload?.mobile ?? '');
    log(`需要短信验证：${payload?.reason ?? ''}`);
  });
  client.on('system.login.verification', async ({ verification }) => {
    runtime.phase = 'verification';
    runtime.verificationAt = Date.now();
    runtime.error = '';
    log(`需要完成安全验证：${(verification?.methods ?? []).join(', ')}`);
    try { await verification?.open?.({ openBrowser: true }); } catch (error) {
      runtime.error = String(error?.message ?? error).slice(0, 200);
      runtime.phase = 'error';
    }
  });
  client.on('system.action.verification', async ({ verification }) => {
    try { await verification?.open?.({ openBrowser: true }); } catch { /* 单次操作验证失败只影响该操作 */ }
  });
  client.on('system.online', (payload) => {
    runtime.phase = 'online';
    runtime.uid = String(payload?.platformUid ?? '');
    runtime.account = runtime.account ?? findAccount(client);
    runtime.nickname = String(runtime.account?.nickname ?? '');
    runtime.error = '';
    runtime.qr = '';
    log(`已上线：${runtime.nickname || runtime.uid}`);
  });
  client.on('system.offline', () => {
    if (runtime.phase === 'online') runtime.phase = 'offline';
    log('连接已断开（SDK 会自动重连）');
  });
  client.on('system.reconnecting', (payload) => {
    log(`重连中（第 ${payload?.attempt ?? '?'} 次）`);
  });
  client.on('system.login.error', (payload) => {
    // Client 会把 { account, error } 一起发过来；直接 String(payload) 只会得到 [object Object]。
    const error = payload?.error ?? payload;
    runtime.phase = 'error';
    runtime.error = describeError(error) || '登录失败（没有更多信息）';
    log(`登录失败：${runtime.error}`);
  });
  client.on('system.handler.error', ({ event, error }) => {
    runtime.error = `${event}: ${describeError(error)}`.slice(0, 260);
    log(`处理失败：${runtime.error}`);
  });
  client.on('message', (event) => { void handleMessage(event); });
}

function backupAccountsDir() {
  const dir = path.join(DATA_DIR, 'accounts');
  try {
    if (!fs.existsSync(dir)) return;
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const target = path.join(DATA_DIR, `accounts.rejected-${stamp}`);
    fs.renameSync(dir, target);
    log(`失效登录态已移到 ${path.basename(target)}`);
    // 只留最近两份，避免无限增长（里面是失效凭据，没有保留价值）。
    const backups = fs.readdirSync(DATA_DIR).filter((name) => name.startsWith('accounts.rejected-')).sort();
    while (backups.length > 2) {
      const old = backups.shift();
      try { fs.rmSync(path.join(DATA_DIR, old), { recursive: true, force: true }); } catch { /* ignore */ }
    }
  } catch (error) {
    log(`备份失效登录态失败：${describeError(error)}`);
  }
}

async function beginLogin(login) {
  let client = await getClient();
  // 上次登录失败（session 被抖音判失效）时，先清掉旧凭据，否则 SDK 每次都会先去恢复旧会话、永远出不了二维码。
  if (runtime.client && runtime.phase === 'error') {
    const prior = runtime.client;
    try { await prior.logout(); } catch { /* 已失败，忽略 */ }
    backupAccountsDir();
    runtime.client = null;
    listenersBound = false;
    runtime.account = null;
    client = await getClient();
  }
  runtime.error = '';
  runtime.phase = 'starting';
  try {
    // 用户主动点登录 = 要一次全新的登录，不复用已失效的旧会话。
    const account = client.createAccount({ login });
    runtime.account = account;
    // 只登录这次新建的账号：不去碰已经失效的旧会话，避免 AggregateError 把新登录也带失败。
    runtime.loginTask = Promise.resolve(account.login())
      .then(() => { if (runtime.phase !== 'online') runtime.phase = 'online'; })
      .catch((error) => {
        runtime.phase = 'error';
        runtime.error = describeError(error) || '登录失败';
        log(`登录失败：${runtime.error}`);
      });
  } catch (error) {
    runtime.phase = 'error';
    runtime.error = describeError(error);
    throw error;
  }
  return douyinImStatus();
}

export async function douyinImLoginQr() {
  return beginLogin({ method: 'qr' });
}

export async function douyinImLoginSms(mobile) {
  const value = String(mobile ?? '').replace(/\s+/g, '');
  if (!/^\d{6,15}$/.test(value)) throw new Error('手机号格式不对');
  return beginLogin({ method: 'sms', mobile: value });
}

export async function douyinImSubmitSms(code) {
  const value = String(code ?? '').replace(/\s+/g, '');
  if (!/^\d{4,8}$/.test(value)) throw new Error('验证码格式不对');
  const account = runtime.account ?? findAccount(runtime.client);
  if (!account) throw new Error('还没有开始登录');
  await account.continueLoginWithSms(value);
  runtime.error = '';
  return douyinImStatus();
}

export async function douyinImLogout() {
  const client = runtime.client;
  if (!client) return douyinImStatus();
  try { await client.logout(); } catch (error) { log(`退出失败：${String(error?.message ?? error).slice(0, 120)}`); }
  runtime.phase = 'offline';
  runtime.nickname = '';
  runtime.uid = '';
  runtime.qr = '';
  runtime.account = null;
  return douyinImStatus();
}

export function douyinImStatus() {
  const config = douyinImConfig();
  const state = readState();
  let friends = 0;
  let groups = 0;
  try {
    const account = runtime.account ?? (runtime.client?.accounts?.[0] ?? null);
    friends = account?.fl?.size ?? 0;
    groups = account?.gl?.size ?? 0;
  } catch { /* 联系人还没加载 */ }
  return {
    ok: true,
    phase: runtime.phase,
    online: runtime.phase === 'online',
    nickname: runtime.nickname,
    uid: runtime.uid,
    qr: runtime.qr,
    smsMobile: runtime.smsMobile,
    error: runtime.error,
    enabled: config.enabled,
    allowlist: config.allowlist,
    mentionNames: config.mentionNames,
    groupMentionOnly: config.groupMentionOnly,
    dailyReplyLimit: config.dailyReplyLimit,
    friends,
    groups,
    today: { date: state.date, replies: state.replies },
  };
}

/** 自检回复链路：只跑 DSH 会话、不往抖音发消息（不需要联网也能验证 agent 是否正常）。 */
export async function douyinImSelftest() {
  const chat = await openChatSession('private:selftest');
  if (!chat.handle?.agent?.followup) throw new Error('这个 DSH 版本的 agent 没有 followup');
  const reply = await askChat(chat, '【自检】只回复两个字：收到。不要调用任何工具，不要解释。');
  return { ok: true, reply, sessionId: chat.sessionId };
}

/** 存在 selftest.flag 时，启动后自动跑一次自检并把结果写进插件日志（排查用）。 */
export function scheduleDouyinImSelftest() {
  const flag = path.join(IM_DIR, 'selftest.flag');
  if (!fs.existsSync(flag)) return;
  setTimeout(async () => {
    try {
      const result = await douyinImSelftest();
      log(`自检通过：${result.reply}（会话 ${result.sessionId}）`);
      try { fs.unlinkSync(flag); } catch { /* 删不掉不影响 */ }
    } catch (error) {
      log(`自检失败：${describeError(error)}`);
    }
  }, 20_000).unref?.();
}

export async function douyinImContacts() {
  const client = await getClient();
  if (runtime.phase !== 'online') throw new Error('抖音还没上线：先完成登录');
  const account = runtime.account ?? findAccount(client);
  if (!account) throw new Error('没有可用的抖音账号');
  const [friendList, groupList] = await Promise.all([
    account.getFriendList().catch((error) => { log(`读好友失败：${String(error?.message ?? error).slice(0, 120)}`); return []; }),
    account.getGroupList(true).catch((error) => { log(`读群失败：${String(error?.message ?? error).slice(0, 120)}`); return []; }),
  ]);
  return {
    ok: true,
    contacts: [
      ...friendList.map((friend) => ({
        id: `private:${friend.uid}`,
        name: String(friend.remark || friend.nickname || friend.uid),
        isGroup: false,
      })),
      ...groupList.map((group) => ({
        id: `group:${group.groupId}`,
        name: String(group.name || group.groupId),
        isGroup: true,
        memberCount: group.memberCount ?? null,
      })),
    ],
  };
}

export function douyinImSaveConfig(payload = {}) {
  const current = douyinImConfig();
  const next = normalizeConfig({
    ...current,
    ...(payload.enabled === undefined ? {} : { enabled: payload.enabled === true }),
    ...(payload.allowlist === undefined ? {} : { allowlist: payload.allowlist }),
    ...(payload.mentionNames === undefined ? {} : { mentionNames: payload.mentionNames }),
    ...(payload.groupMentionOnly === undefined ? {} : { groupMentionOnly: payload.groupMentionOnly === true }),
    ...(payload.dailyReplyLimit === undefined ? {} : { dailyReplyLimit: payload.dailyReplyLimit }),
  });
  saveConfig(next);
  return douyinImStatus();
}

// ── 消息处理 ──────────────────────────────────────────────────────────────
const queues = new Map();      // key -> { items, timer, chain }
const DEBOUNCE_MS = 1200;

function conversationOf(event) {
  if (event?.type === 'message.group') {
    const id = `group:${event.group?.groupId ?? event.threadId}`;
    return { key: id, displayName: String(event.group?.name || '抖音群聊'), isGroup: true };
  }
  if (event?.type === 'message.private') {
    const friend = event.friend;
    const id = `private:${friend?.uid ?? event.senderUid}`;
    const name = String(friend?.remark || friend?.nickname || '抖音好友');
    return { key: id, displayName: name, isGroup: false };
  }
  if (event?.type === 'message.stranger') {
    const id = `private:${event.stranger?.uid ?? event.senderUid}`;
    const name = String(event.stranger?.nickname || '陌生人');
    return { key: id, displayName: name, isGroup: false, stranger: true };
  }
  return null;
}

function messageIdOf(event) {
  return String(event?.serverMessageId || event?.clientMessageId || '').trim();
}

function textOf(event) {
  // 语音消息（msgType 17）：SDK 解析成 content.kind='audio'，但抖音长连接不推转写文本，
  // event.text 要么为空、要么是整段 JSON。必须在这层接住，否则整条消息被静默丢掉，
  // 表现为「对方发语音，机器人毫无反应」。若服务端偶尔带了转写文本就直接用。
  if (event?.content && typeof event.content === 'object' && event.content.kind === 'audio') {
    const spoken = String(event?.text ?? event.content?.text ?? '').trim();
    return spoken && !spoken.startsWith('{') ? `[语音转文字] ${spoken}` : '[发来一条语音消息]';
  }
  const text = String(event?.text ?? '').trim();
  if (text) return text;
  if (event?.work?.title) return `[分享了作品] ${event.work.title}`;
  if (event?.comment) return '[分享了一条评论]';
  return '';
}

function addressesUs(event, mentionNames) {
  if (event?.isMentionMe === true) return true;
  const text = String(event?.text ?? '');
  return (Array.isArray(mentionNames) ? mentionNames : []).some((name) => {
    const value = String(name ?? '').trim();
    return value && text.includes(value);
  });
}

function senderNameOf(event) {
  if (event?.type === 'message.group') return String(event.member?.displayName || event.member?.nickname || '群成员');
  if (event?.type === 'message.private') return String(event.friend?.remark || event.friend?.nickname || '对方');
  return String(event?.stranger?.nickname || '陌生人');
}

async function handleMessage(event) {
  try {
    if (disposed) return;
    // 自己发出去的消息也会回到事件里：按发送者 uid 排掉，避免自问自答。
    const selfUid = String(runtime.uid || runtime.account?.uid || '');
    if (selfUid && String(event?.senderUid ?? '') === selfUid) return;
    const config = douyinImConfig();
    if (!config.enabled) return;
    const conversation = conversationOf(event);
    if (!conversation) return;
    if (conversation.stranger) return; // 陌生人私信一律不回
    const allowed = config.allowlist.find((item) => item.id === conversation.key);
    if (!allowed) return;
    const mentionNames = config.mentionNames;
    if (conversation.isGroup && config.groupMentionOnly !== false && !addressesUs(event, mentionNames)) return;
    const text = textOf(event);
    if (!text) return;
    // 有人在跟她说话（不一定是主人）：计入「有社交接触」，让沉默推导更准。
    notePersonaActivity({ kind: 'contact' });
    const messageId = messageIdOf(event);
    if (messageId && readReplied().includes(messageId)) return;
    const state = readState();
    if (state.replies >= config.dailyReplyLimit) return;
    enqueueReply({ event, conversation, text, allowed, messageId });
  } catch (error) {
    log(`消息处理失败：${String(error?.message ?? error).slice(0, 160)}`);
  }
}

function enqueueReply({ event, conversation, text, allowed, messageId }) {
  const key = conversation.key;
  let queue = queues.get(key);
  if (!queue) { queue = { items: [], timer: null, chain: Promise.resolve() }; queues.set(key, queue); }
  queue.items.push({ event, conversation, text, allowed, messageId });
  if (queue.timer) return;
  queue.timer = setTimeout(() => {
    queue.timer = null;
    const batch = queue.items.splice(0);
    const task = () => flushBatch({ conversation, batch });
    queue.chain = queue.chain.then(task).catch((error) => {
      log(`回复失败：${String(error?.message ?? error).slice(0, 160)}`);
    });
  }, DEBOUNCE_MS);
}

async function flushBatch({ conversation, batch }) {
  if (!batch.length || disposed) return;
  const lines = batch
    .map((item) => `${senderNameOf(item.event)}：${item.text}`)
    .join('\n');
  // 情绪 / 口头禅 + 她自己看到的：和 QQ、桌宠同一份状态，别在抖音里变成另一个人。
  const personaBits = [personaPromptBlock(), learningPromptBlock()].filter(Boolean);
  // 记忆卡：和 QQ / B站 / 贴吧 / 桌宠同一张卡。私聊给她全量（含 QQ 私事），
  // 群聊只给「身份记忆 + 公开内容」那一版——群里有外人，不能把私聊细节带出去。
  const memoryBlock = memoryCardBlock(conversation.isGroup ? 'bili' : 'qq');
  // 角色人格卡：抖音 preset 只有安全规则，没有「她是谁」。不补这块，回复就是通用助手腔。
  const personaCore = douyinPersonaBlock();
  const prompt = [
    `【抖音会话】${conversation.displayName || '未知会话'}${conversation.isGroup ? '（群聊）' : '（私聊）'}`,
    personaCore,
    memoryBlock,
    ...personaBits,
    '下面是刚收到的新消息。只输出要发出去的回复：',
    '- 你就是上面的角色本人，不是客服或助理：保持她的身份、性格和说话方式，不要提 AI / 模型 / 提示词；',
    '- 结合你和对方之前聊过的内容自然接话（会话历史里有），不要装作不认识、也不要复读历史；',
    // 真人感规则（参考 MaiBot 的 light 模板）：短、碎、口语、允许只给反应。
    '- 像真人在手机上打字：句子可以短、可以不完整，可以用语气词和网络用语（哈哈、笑死、草、确实、啊这、好家伙、牛的），不要用书面腔；',
    '- 不用每条都正面回答：可以只回一个反应（比如「笑死」「确实」「？」），可以反问回去，可以顺着对方的梗接；',
    '- 禁止客服腔和 AI 腔：不说「请问」「有什么可以帮你」「希望对你有帮助」，不写排比句，不做总结陈词，不礼貌过度；',
    '- 回复拆成 1~3 条短消息，像真人连发几条一样；每条之间用 ||| 分隔，每条尽量一两句话，别写长段；',
    '- 不知道的事就说不知道，不要编造没见过的经历、人设背景或现实里没发生的事；',
    '- 看到「发来一条语音消息」说明语音内容你听不了，就自然地让对方打字再说一遍，别假装听到了；',
    '- 不要 Markdown，不要旁白，不要解释自己在做什么，不要输出表情 id 或任何系统标记。',
    '',
    lines,
  ].filter((line) => line !== undefined && line !== null && line !== '').join('\n');
  try {
    const chat = await openChatSession(conversation.key);
    const reply = await askChat(chat, prompt);
    const text = normalizeOutgoing(reply);
    if (!text) throw new Error('回复为空');
    const bubbles = splitBubbles(text);
    if (!bubbles.length) throw new Error('回复为空');
    const latest = batch.at(-1).event;
    // 拆条连发：真人不会把一屏话塞进一个气泡。条与条之间按条长停一下，像在打第二句。
    for (let i = 0; i < bubbles.length; i += 1) {
      const response = await latest.reply(bubbles[i]);
      const statusCode = Number(response?.statusCode ?? 0);
      const statusMsg = String(response?.statusMsg ?? response?.message ?? '');
      if (statusCode && statusCode !== 0) throw new Error(`发送被拒：${statusCode} ${statusMsg}`.trim());
      if (i < bubbles.length - 1) {
        const wait = Math.min(2500, 500 + bubbles[i].length * 60 + Math.floor(Math.random() * 400));
        await new Promise((resolve) => setTimeout(resolve, wait));
      }
    }
    const state = readState();
    state.replies += 1;
    saveState(state);
    const ids = readReplied();
    for (const item of batch) if (item.messageId) ids.push(item.messageId);
    saveReplied(ids);
    notePersonaActivity({ kind: 'reply' });
    rememberConversation({ conversation, batch, reply: text });
    runtime.error = '';
    log(`已回复 ${conversation.displayName}：${text.slice(0, 40)}`);
  } catch (error) {
    // 会话句柄可能已经失效（DSH 重启/会话被删）：丢掉缓存，下一条消息重新建。
    const chat = chatByKey.get(conversation.key);
    if (chat) {
      chatByKey.delete(conversation.key);
      chatBySession.delete(chat.sessionId);
      try { chat.handle?.dispose?.(); } catch { /* 释放失败也不影响 */ }
    }
    runtime.error = String(error?.message ?? error).slice(0, 240);
    log(`回复 ${conversation.displayName} 失败：${runtime.error}`);
    throw error;
  }
}

/** 抖音 IM 对长消息不友好：压成一段、去掉 Markdown、截到 200 字。 */
function normalizeOutgoing(input) {
  let text = String(input ?? '').trim();
  if (!text) return '';
  text = text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[*#`>_~]/g, '')
    .replace(/\r/g, '')
    .replace(/\n{2,}/g, '\n')
    .trim();
  if (text.length <= 200) return text;
  const cut = text.slice(0, 200);
  const dot = Math.max(cut.lastIndexOf('。'), cut.lastIndexOf('！'), cut.lastIndexOf('？'), cut.lastIndexOf('\n'));
  return (dot > 80 ? cut.slice(0, dot + 1) : cut).trim();
}

/**
 * 把一段回复拆成最多 3 条「气泡」。模型按提示词用 ||| 分隔；
 * 没用分隔符但有换行时按换行拆（真人打字换行≈发新条）。
 * 单条超 100 字按标点截断——超过就不像「一条消息」了。
 */
function splitBubbles(text) {
  const raw = String(text ?? '');
  const parts = (raw.includes('|||') ? raw.split(/\|{3,}/) : raw.split(/\n+/))
    .map((part) => part.trim())
    .filter(Boolean);
  const bubbles = [];
  for (const part of parts) {
    if (bubbles.length >= 3) break;
    if (part.length <= 100) { bubbles.push(part); continue; }
    const cut = part.slice(0, 100);
    const dot = Math.max(cut.lastIndexOf('。'), cut.lastIndexOf('！'), cut.lastIndexOf('？'), cut.lastIndexOf('…'), cut.lastIndexOf('，'));
    bubbles.push((dot > 40 ? cut.slice(0, dot + 1) : cut).trim());
  }
  return bubbles;
}

// ── 启动 / 停止 ────────────────────────────────────────────────────────────
export async function douyinImStart() {
  const config = douyinImConfig();
  if (!config.allowlist.length) throw new Error('还没有许可会话：先登录，点「读取好友和群」，勾选并保存');
  douyinImSaveConfig({ ...config, enabled: true });
  const client = await getClient();
  if (runtime.phase !== 'online') {
    runtime.phase = 'starting';
    runtime.loginTask = Promise.resolve(client.login())
      .then(() => { if (runtime.phase !== 'online') runtime.phase = 'online'; })
      .catch((error) => {
        runtime.phase = 'error';
        runtime.error = String(error?.message ?? error).slice(0, 240);
      });
  }
  return douyinImStatus();
}

export async function douyinImStop() {
  const config = douyinImConfig();
  douyinImSaveConfig({ ...config, enabled: false });
  return douyinImStatus();
}

/** 插件启动时：如果开关开着，自动恢复已保存的登录（没登录过就什么都不做）。 */
export function scheduleDouyinImResume() {
  if (resumeTimer) return;
  resumeTimer = setTimeout(async () => {
    resumeTimer = null;
    try {
      const config = douyinImConfig();
      if (!config.enabled) return;
      const client = await getClient();
      const stored = client.loadAccounts?.() ?? [];
      if (!stored.length) { log('开关开着但没有登录记录，等用户扫码'); return; }
      runtime.phase = 'starting';
      runtime.account = stored[0];
      runtime.loginTask = Promise.resolve(client.login())
        .then(() => { if (runtime.phase !== 'online') runtime.phase = 'online'; })
        .catch((error) => {
          runtime.phase = 'error';
          runtime.error = `${describeError(error) || '自动恢复登录失败'} · 点「扫码登录」重新登录`;
          log(`自动恢复登录失败：${runtime.error}`);
        });
    } catch (error) {
      log(`自动恢复登录失败：${String(error?.message ?? error).slice(0, 160)}`);
    }
  }, 12_000);
  resumeTimer.unref?.();
}

export function disposeDouyinIm() {
  disposed = true;
  if (resumeTimer) { clearTimeout(resumeTimer); resumeTimer = null; }
  try { sessionEventOff?.(); } catch { /* ignore */ }
  sessionEventOff = null;
  for (const queue of queues.values()) if (queue.timer) clearTimeout(queue.timer);
  queues.clear();
  for (const chat of chatByKey.values()) {
    try { chat.handle?.dispose?.(); } catch { /* ignore */ }
  }
  chatByKey.clear();
  chatBySession.clear();
  // 不主动 logout：登录态要留给下次 DSH 启动恢复。
}
