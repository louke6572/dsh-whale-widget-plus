/**
 * SurfCore · 桌宠 ↔ 插件 的本地接口（pet-api）
 *
 * 桌宠挂件（如 dsh-Dfy）是独立进程，不能带 DSH 的会话 Cookie，所以不能走设置页那套
 * `/dsh-surfcore/api/*`（会被 connection.requestRejection 拦成 401）。
 * 这里单独注册一个前缀 `/dsh-surfcore/pet-api`：
 *   · 只接受 127.0.0.1 / localhost / ::1；
 *   · 写操作必须 application/json + 同源或没有 Origin；
 *   · 必须带 `x-pet-token`（或音频用 ?token=），令牌落在
 *     ~/.dsh/surfcore/pet/host-token，只有本机当前用户读得到。
 *
 * 桌宠从 ~/.dsh/surfcore/pet/host.json 发现 baseUrl + token；DSH 端口漂移时
 * 插件会重写这个文件（每 2 分钟一次），桌宠重连时会重新读。
 */
import fs from 'node:fs';
import path from 'node:path';
import { contentTypeRejection, isLoopbackReq, json, readBody, sameOrigin, safeEqual } from './http-guard.js';
import { callBridge } from './bridge.js';
import { QQBOT_ROOT } from './paths.js';

const API_PREFIX = '/dsh-surfcore/pet-api';
const HOST_FILE_VERSION = 1;
/** 桌宠的请求体都是短消息；比设置页 API（512KB）收得更紧。 */
const PET_BODY_LIMIT = 256 * 1024;

/**
 * @param {object} opts
 * @param {object} opts.chat                  pet-chat 服务
 * @param {object} opts.purpose               pet-purpose 服务
 * @param {object} opts.petService            原有安装/启动服务（拿 running/installed）
 * @param {string} opts.stateDir              ~/.dsh/surfcore
 * @param {string} [opts.petRoot]             pet/host.json 所在目录（仅测试注入；生产固定源码根）
 * @param {() => string} opts.currentDshUrl   DSH 当前 Web 地址
 * @param {(msg:string, ...args:any[])=>void} [opts.pluginLog]
 */
export function createPetApiService({ chat, purpose, petService, stateDir, petRoot, currentDshUrl, pluginLog = () => {}, version = '' }) {
  // 2026-11：桌宠数据固定到源码根（与 DSH_HOME 无关）。否则桌面版(~/.dsh)和网页版(~/.dsh-web)
  // 各存一份 host.json/记录，同机切换形态时历史会「断档」。
  const root = petRoot || path.join(QQBOT_ROOT, 'pet');
  const hostFile = path.join(root, 'host.json');
  let lastHostWrite = 0;

  function token() {
    return chat.token();
  }

  function hostPayload() {
    return {
      version: HOST_FILE_VERSION,
      baseUrl: String(currentDshUrl() || '').replace(/\/+$/, ''),
      token: token(),
      api: API_PREFIX,
      pluginVersion: String(version || ''),
      updatedAt: new Date().toISOString(),
    };
  }

  function writeHostFile(force = false) {
    const now = Date.now();
    if (!force && now - lastHostWrite < 5000) return;
    lastHostWrite = now;
    try {
      fs.mkdirSync(root, { recursive: true });
      const tmp = `${hostFile}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, `${JSON.stringify(hostPayload(), null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
      fs.renameSync(tmp, hostFile);
      try { fs.chmodSync(hostFile, 0o600); } catch {}
    } catch (error) {
      pluginLog('[pet-api] 写 host.json 失败：', String(error?.message ?? error));
    }
  }

  function audioUrlFor(key) {
    const safe = String(key ?? '').replace(/[^a-f0-9]/gi, '');
    if (!safe) return '';
    return `${API_PREFIX}/audio/${safe}.wav?token=${encodeURIComponent(token())}`;
  }

  function authOk(req, url) {
    const header = String(req.headers['x-pet-token'] ?? '');
    const query = String(url?.searchParams?.get('token') ?? '');
    const expected = token();
    if (!expected) return false;
    if (header && safeEqual(header, expected)) return true;
    if (query && safeEqual(query, expected)) return true;
    return false;
  }

  // ── QQ 消息镜像（给挂件当「会说话的桌宠」用）────────────────────────────
  // 桥接把私聊的收发消息 POST 到 /qq/incoming，这里存一份最近记录并 emit 成
  // pet-chat 事件；挂件长轮询 /events 就能弹气泡。记录落盘，DSH 重启后仍能看历史。
  const feedFile = path.join(root, 'qq-feed.json');
  const FEED_LIMIT = 120;
  let feed = [];
  let feedSeq = 0;
  try {
    const raw = JSON.parse(fs.readFileSync(feedFile, 'utf8'));
    if (Array.isArray(raw)) feed = raw.slice(-FEED_LIMIT);
    feedSeq = feed.reduce((max, m) => Math.max(max, Number(m?.id) || 0), 0);
  } catch {}

  function saveFeed() {
    try {
      fs.mkdirSync(root, { recursive: true });
      const tmp = `${feedFile}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, `${JSON.stringify(feed.slice(-FEED_LIMIT))}\n`, 'utf8');
      fs.renameSync(tmp, feedFile);
    } catch (error) {
      pluginLog('[pet-api] 写 qq-feed.json 失败：', String(error?.message ?? error));
    }
  }

  function pushQqMessage({ role, sender, text, at, key, messageId } = {}) {
    const body = String(text ?? '').trim().slice(0, 2000);
    if (!body) return null;
    feedSeq += 1;
    const entry = {
      id: feedSeq,
      role: role === 'assistant' ? 'assistant' : 'user',
      sender: String(sender || '').slice(0, 40),
      text: body,
      key: String(key || '').slice(0, 40),
      messageId: messageId ?? null,
      at: Number(at) || Date.now(),
    };
    feed.push(entry);
    if (feed.length > FEED_LIMIT) feed.splice(0, feed.length - FEED_LIMIT);
    saveFeed();
    // ⚠️ 事件里的 id 必须由 chat.emit 自己分配（= 事件游标）。
    // 这里不能把 feed 的 id 一起 spread 进去：那会覆盖事件 id，游标永远追不上，
    // 挂件每次轮询都会重复收到同一条 qq-message（信封未读数暴涨）。
    const { id: feedId, ...rest } = entry;
    chat.emit({ type: 'qq-message', feedId, ...rest });
    // 2026-11 用户反馈：QQ 里的回复只会进「信封未读」，不弹气泡。
    // 额外发一条 reply：挂件对 reply 的处理是「直接进桌宠气泡」，所以她的 QQ 回复能在桌面看到。
    // 只对 assistant 生效，且只在用户把「同时在气泡里显示」打开时（carrier=pet）——
    // 关掉气泡的人不该再被弹。
    const bubbleOn = (purpose?.config?.().carrier ?? 'qq') === 'pet';
    if (entry.role === 'assistant' && bubbleOn) {
      const speakOn = (purpose?.config?.().modality ?? 'text') === 'voice';
      chat.emit({ type: 'reply', text: entry.text, modality: speakOn ? 'voice' : 'text', speak: speakOn, source: 'qq', key: entry.key });
    }
    return entry;
  }

  function ownerKey() {
    const qq = String(chat.ownerInfo?.()?.qq || '').trim();
    return qq ? `private:${qq}` : '';
  }

  function statusForPet() {
    const base = petService?.status ? petService.status() : {};
    const chatStatus = chat.status();
    return {
      ok: true,
      pet: { installed: Boolean(base.installed), running: Boolean(base.running), dir: base.dir || '', skins: base.skins || [] },
      chat: chatStatus.chat,
      role: chatStatus.role,
      proactive: chatStatus.proactive,
      presence: chatStatus.presence,
      voice: chatStatus.voice,
      llm: chatStatus.llm,
      focus: chatStatus.focus,
      purpose: {
        carrier: purpose?.config?.().carrier ?? 'qq',
        modality: purpose?.config?.().modality ?? 'text',
        online: purpose?.status?.().online ?? false,
      },
      events: chatStatus.events,
      lastError: chatStatus.lastError,
      serverTime: Date.now(),
    };
  }

  async function handle(req, res, url) {
    if (!isLoopbackReq(req)) { json(res, 403, { ok: false, error: '只接受本机回环访问' }); return; }
    if (req.method !== 'GET' && !sameOrigin(req)) { json(res, 403, { ok: false, error: '跨站请求被拒绝' }); return; }
    // 和设置页 API 同一口径（http-guard.contentTypeRejection）：只对浏览器写请求强制 JSON，
    // 桌宠主进程/本机脚本不带 Content-Type 也放行（它们的 body 由 JSON 解析兜底）。
    const ctRejection = contentTypeRejection(req);
    if (ctRejection) {
      json(res, 415, { ok: false, code: 'CONTENT_TYPE', error: ctRejection });
      return;
    }
    if (!authOk(req, url)) {
      // 令牌不对时只给一个最小提示，别透露主机配置。
      json(res, 401, { ok: false, error: '桌宠令牌无效或还没生成（重启 DSH 后会自动重写 host.json）' });
      return;
    }
    // 超大请求体：readBody 超限时会 req.destroy()，客户端只能看到「连接被重置」，
    // 拿不到任何错误说明（2026-11-04 实测 300KB 请求 → fetch failed）。
    // 所以先按 content-length 拦一次，给出明确的 413。chunked 无长度时仍由 readBody 兜底。
    const declaredLength = Number(req.headers['content-length'] ?? 0);
    if (Number.isFinite(declaredLength) && declaredLength > PET_BODY_LIMIT) {
      json(res, 413, { ok: false, error: '请求体过大（上限 256KB）' });
      return;
    }

    const pathname = url.pathname;
    const suffix = pathname.slice(API_PREFIX.length) || '/';

    if (req.method === 'GET' && suffix === '/health') {
      json(res, 200, { ok: true, name: 'surfcore-pet', version: String(version || ''), serverTime: Date.now() });
      return;
    }
    if (req.method === 'GET' && suffix === '/status') {
      json(res, 200, statusForPet());
      return;
    }
    if (req.method === 'GET' && suffix === '/config') {
      json(res, 200, { ok: true, ...chat.publicConfig(), serverTime: Date.now() });
      return;
    }
    if (req.method === 'GET' && suffix === '/history') {
      const limit = Number(url.searchParams.get('limit')) || 60;
      json(res, 200, chat.history(limit));
      return;
    }
    // 目的机制（桌宠载体）的只读状态 / 预览 / 手动出发。
    // 设置页走的是带 DSH 会话的 /dsh-surfcore/api/purpose；这几个是给桌宠侧
    // （以及本地排障）用的同一份能力，令牌与其它 pet-api 一样。
    if (req.method === 'GET' && suffix === '/purpose/status') {
      json(res, 200, purpose?.status ? purpose.status() : { ok: false, error: 'purpose 服务不可用' });
      return;
    }
    if (req.method === 'POST' && suffix === '/purpose/preview') {
      const result = await purpose.preview();
      json(res, result.ok ? 200 : 400, result);
      return;
    }
    if (req.method === 'POST' && suffix === '/purpose/run') {
      let body = {};
      try { body = JSON.parse((await readBody(req, PET_BODY_LIMIT)) || '{}'); } catch {}
      const result = await purpose.run({ force: body.force !== false });
      json(res, result.ok ? 200 : 409, result);
      return;
    }
    // 桥接 → 插件：把 QQ 私聊的收发消息镜像进来（只读展示，不影响 QQ 主流程）
    if (req.method === 'POST' && suffix === '/qq/incoming') {
      let body = {};
      try { body = JSON.parse((await readBody(req, PET_BODY_LIMIT)) || '{}'); } catch { json(res, 400, { ok: false, error: '请求体不是合法 JSON' }); return; }
      const entry = pushQqMessage(body);
      json(res, entry ? 200 : 400, entry ? { ok: true, message: entry } : { ok: false, error: '消息为空' });
      return;
    }
    if (req.method === 'GET' && suffix === '/qq/history') {
      const limit = Math.max(1, Math.min(FEED_LIMIT, Number(url.searchParams.get('limit')) || 40));
      // ownerKey：挂件据此判断这条会话能不能代主人回复（只能代发主人私聊）
      json(res, 200, {
        ok: true,
        cursor: feedSeq,
        ownerKey: ownerKey(),
        owner: chat.ownerInfo?.() || null,
        messages: feed.slice(-limit),
      });
      return;
    }
    // 桌宠输入 = 「主人刚在 QQ 说了这句话」：直接交给桥接的 agent 管线。
    // 这样她的回复用的是同一套记忆/上下文，也会在 DSH 会话里留记录；
    // 她的回话由 agent 正常发回 QQ，离开手(mirror) 再同步到卡片 —— 不再另起一套对话。
    if (req.method === 'POST' && suffix === '/qq/send') {
      let body = {};
      try { body = JSON.parse((await readBody(req, PET_BODY_LIMIT)) || '{}'); } catch { json(res, 400, { ok: false, error: '请求体不是合法 JSON' }); return; }
      const text = String(body.text ?? '').trim();
      if (!text) { json(res, 400, { ok: false, error: '消息不能为空' }); return; }
      const key = ownerKey();
      if (!key) { json(res, 409, { ok: false, error: '还没配置主人 QQ，无法从桌宠发送' }); return; }
      const queued = await callBridge('/api/pet/owner-message', { method: 'POST', body: { key, text }, timeoutMs: 12000 });
      if (!queued.ok || !queued.data?.ok) {
        json(res, 502, { ok: false, error: queued.data?.error || queued.error || '桥接不可达' });
        return;
      }
      const owner = chat.ownerInfo?.() || {};
      const entry = pushQqMessage({ role: 'user', sender: owner.name || '主人', text, key });
      json(res, 200, { ok: true, message: entry, queued: true });
      return;
    }
    if (req.method === 'POST' && suffix === '/chat') {
      let body = {};
      try { body = JSON.parse((await readBody(req, PET_BODY_LIMIT)) || '{}'); } catch { json(res, 400, { ok: false, error: '请求体不是合法 JSON' }); return; }
      const result = await chat.chat({ text: body.text, modality: body.modality });
      json(res, result.ok ? 200 : 400, result);
      return;
    }
    if (req.method === 'POST' && suffix === '/focus') {
      let body = {};
      try { body = JSON.parse((await readBody(req, PET_BODY_LIMIT)) || '{}'); } catch {}
      const state = chat.setFocus(body.enabled === true, body.source || 'pet');
      json(res, 200, { ok: true, focus: state });
      return;
    }
    if (req.method === 'POST' && suffix === '/chat/test') {
      // 设置页/排障用：让桌宠那边也弹一次气泡（结果通过事件推给所有连着的主进程）。
      let body = {};
      try { body = JSON.parse((await readBody(req, PET_BODY_LIMIT)) || '{}'); } catch {}
      const result = await chat.chat({ text: body.text || '在吗', modality: body.modality === 'voice' ? 'voice' : 'text' });
      if (result.ok && result.reply) {
        chat.emit({
          type: 'reply',
          text: result.reply.text,
          modality: result.reply.modality,
          audioKey: result.reply.audio?.key || '',
          messageId: result.reply.id,
        });
      }
      json(res, result.ok ? 200 : 400, result);
      return;
    }
    if (req.method === 'GET' && suffix === '/events') {
      const rawSince = url.searchParams.get('since');
      const since = rawSince === null || rawSince === '' ? null : Number(rawSince);
      const wait = Number(url.searchParams.get('wait'));
      const client = String(url.searchParams.get('client') || 'pet').slice(0, 40);
      const result = await chat.poll({
        since: Number.isFinite(since) ? since : null,
        waitMs: Number.isFinite(wait) ? wait : 0,
        clientId: client,
      });
      json(res, 200, result);
      return;
    }
    if (req.method === 'GET' && suffix.startsWith('/audio/')) {
      const key = suffix.slice('/audio/'.length).replace(/\.wav$/i, '');
      const audio = chat.readAudio(key);
      if (!audio) { json(res, 404, { ok: false, error: '音频不存在或已过期' }); return; }
      try {
        res.writeHead(200, {
          'Content-Type': 'audio/wav',
          'Content-Length': String(audio.bytes.length),
          'Cache-Control': 'private, max-age=86400',
        });
        res.end(audio.bytes);
      } catch {}
      return;
    }
    json(res, 404, { ok: false, error: `未知桌宠接口：${suffix}` });
  }

  return {
    prefix: API_PREFIX,
    handle,
    writeHostFile,
    audioUrlFor,
    hostFile,
    status: statusForPet,
    token,
  };
}
