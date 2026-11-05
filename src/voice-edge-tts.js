// Edge 在线 TTS — 微软 Edge「大声朗读」同款公开端点，**零安装、完全免费**。
//
// 为什么用它：之前本地 GPT-SoVITS 语音包 7.3 GB（.voice-packs/ 目录）+ 云端火山引擎语音包，
// 都要自己装运行时、下模型、配密钥。这条路什么都不用配——有网就能合成。
//
// 协议：WSS readaloud/edge/v1，与 Edge 浏览器「选中文字 → 大声朗读」走同一个服务器。
//   - URL: wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1
//   - 先发 Path:speech.config（JSON，指定输出格式）+ Path:ssml（SSML XML）
//   - 收 Path:audio 二进制帧（MP3）直到 Path:turn.end
//   - TLS 握手必须带 Chrome UA + Origin + Cookie: muid=<rand>
//   - 必须带 Sec-MS-GEC v2 签名（edge-drm.js 负责）
//
// 输出：MP3（24kHz / 48kbps / 单声道），SnowLuma 网关自动转 SILK → QQ 语音条。
//
// 音色列表（中文常用）：
//   zh-CN-XiaoxiaoNeural（默认，女声温柔）
//   zh-CN-YunxiNeural（男声磁性）
//   zh-CN-YunjianNeural（男声少年）
//   zh-CN-XiaoyiNeural（女声元气）
//   完整列表：在控制台 HTTP GET /api/voice/list
//
// 配置项（config.json → socialV2.voice.tts）：
//   route: "edge"          ← 固定写 edge，不再有 local/cloud
//   edgeVoice: "xxx"       ← 上面列表里挑一个
//   enabled: true           ← 总开关
//   timeoutMs: 60000       ← 单次合成超时
//   maxChars: 120          ← 单次最多合成字数（避免一条语音过长）
//
// 依赖：edge-drm.js（Sec-MS-GEC v2 签名）+ Node 内置 tls/crypto/fs。
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import tls from 'node:tls';
import {
  TRUSTED_CLIENT_TOKEN,
  SEC_MS_GEC_VERSION,
  CHROMIUM_MAJOR_VERSION,
  generateSecMsGec,
  generateConnectionId,
  generateMuid,
  adjustClockSkewFromDate,
} from './edge-drm.js';

const WSS_HOST = 'speech.platform.bing.com';
// 微软 Edge 端点自 2025 年起砍掉了所有 raw/riff PCM 格式，只剩 MP3。
// SnowLuma 网关接受 mp3（AUDIO_EXTS 里有 .mp3），会自动转 SILK。
const OUTPUT_FORMAT = 'audio-24khz-48kbitrate-mono-mp3';
const MP3_BITRATE_BPS = 48_000; // 48 kbps CBR
// 单次合成的接收/音频上限。WebSocket 帧长字段允许到 2^63，服务端异常或中间设备
// 注入超长帧时，不设上限就是无界内存增长；120 字 × 48kbps 实际只有几百 KB。
const MAX_RECV_BYTES = 32 * 1024 * 1024;
const MAX_AUDIO_BYTES = 32 * 1024 * 1024;
export const DEFAULT_EDGE_VOICE = 'zh-CN-XiaoxiaoNeural';

const EDGE_UA = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROMIUM_MAJOR_VERSION}.0.0.0 Safari/537.36 Edg/${CHROMIUM_MAJOR_VERSION}.0.0.0`;
const EDGE_ORIGIN = 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold';

const reqId = () => crypto.randomUUID().replace(/-/g, '');
const escapeXml = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

/** 客户端帧（必须掩码）。opcode: 0x1 文本 / 0x2 二进制 / 0x8 关闭 / 0xA pong。 */
function encodeFrame(opcode, payload) {
  const data = Buffer.isBuffer(payload) ? payload : Buffer.from(String(payload), 'utf8');
  const mask = crypto.randomBytes(4);
  let header;
  if (data.length < 126) {
    header = Buffer.from([0x80 | opcode, 0x80 | data.length]);
  } else if (data.length < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | opcode;
    header[1] = 0x80 | 126;
    header.writeUInt16BE(data.length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | opcode;
    header[1] = 0x80 | 127;
    header.writeBigUInt64BE(BigInt(data.length), 2);
  }
  const masked = Buffer.alloc(data.length);
  for (let i = 0; i < data.length; i++) masked[i] = data[i] ^ mask[i & 3];
  return Buffer.concat([header, mask, masked]);
}

function buildWssPath() {
  return `/consumer/speech/synthesize/readaloud/edge/v1` +
    `?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}` +
    `&Sec-MS-GEC=${encodeURIComponent(generateSecMsGec())}` +
    `&Sec-MS-GEC-Version=${SEC_MS_GEC_VERSION}` +
    `&ConnectionId=${generateConnectionId()}`;
}

/**
 * 最小 WebSocket 客户端：TLS 握手 → HTTP Upgrade → 帧循环。
 * 完全照搬 _debug_mp32.mjs 验证通过的 TLS 配置（Edge 端点 + Node OpenSSL 有 TLS session bug，
 * 必须禁用 session 恢复并确保 socket 在错误后立即关闭）。
 */
function wsConnect({ host, path: wsPath, timeoutMs, onMessage, onOpen, onClose, onFail }) {
  let handshakeDone = false;
  let buf = Buffer.alloc(0);
  let pendingRecv = [];   // 尚未合并进 buf 的新分片（见 data 处理器里的按需合并）
  let recvTotal = 0;      // 本次连接累计接收字节（有上限，防无界增长）
  let serverHeaders = null;
  let httpStatus = null;
  // 分片重组状态
  let fragOp = 0;
  let frags = [];
  let settled = false;

  const socket = tls.connect({
    host, port: 443, servername: host,
    session: null,          // 禁用 TLS session 恢复（Node 24/25 在 Edge 端点上 TLS 握手后解密会失败）
    minVersion: 'TLSv1.2',
  }, () => {
    socket.write(
      `GET ${wsPath} HTTP/1.1\r\nHost: ${host}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n` +
      `Sec-WebSocket-Key: ${crypto.randomBytes(16).toString('base64')}\r\nSec-WebSocket-Version: 13\r\n` +
      `Origin: ${EDGE_ORIGIN}\r\nUser-Agent: ${EDGE_UA}\r\n` +
      `Accept-Encoding: gzip, deflate, br, zstd\r\nAccept-Language: en-US,en;q=0.9\r\n` +
      `Pragma: no-cache\r\nCache-Control: no-cache\r\n` +
      `Cookie: muid=${generateMuid()};\r\n\r\n`
    );
  });

  socket.on('error', (e) => {
    if (settled) return;
    settled = true;
    onFail?.(`Edge TTS TLS/网络错误：${e?.message ?? e}`);
    try { socket.destroy(); } catch {}
  });
  socket.setTimeout(timeoutMs, () => {
    if (settled) return;
    settled = true;
    onFail?.('Edge TTS 连接/合成超时');
    try { socket.destroy(); } catch {}
  });

  socket.on('data', (chunk) => {
    // 分片数组 + 按需合并：旧写法每个 data 事件都 `Buffer.concat([buf, chunk])`，
    // 未消费缓冲大时会反复整块复制；而且 WebSocket 的长度字段可以是 2^63，
    // 没有上限就是无界内存。这里用累计字节上限兜住，并让「帧正好落在一个分片里」
    // 的常见情况零拷贝（pending 只有一项且 buf 为空时直接引用）。
    recvTotal += chunk.length;
    if (recvTotal > MAX_RECV_BYTES) {
      if (!settled) {
        settled = true;
        onFail?.(`Edge TTS 接收数据超过上限（${Math.round(MAX_RECV_BYTES / 1024 / 1024)}MB）`);
        try { socket.destroy(); } catch {}
      }
      return;
    }
    pendingRecv.push(chunk);
    if (!buf.length) {
      buf = pendingRecv.length === 1 ? pendingRecv[0] : Buffer.concat(pendingRecv);
    } else {
      buf = Buffer.concat([buf, ...pendingRecv]);
    }
    pendingRecv = [];
    if (!handshakeDone) {
      const end = buf.indexOf('\r\n\r\n');
      if (end < 0) return;
      const head = buf.toString('latin1', 0, end);
      buf = buf.subarray(end + 4);
      const lines = head.split('\r\n');
      httpStatus = Number(lines[0].split(' ')[1]);
      serverHeaders = {};
      for (let i = 1; i < lines.length; i++) {
        const colon = lines[i].indexOf(':');
        if (colon > 0) serverHeaders[lines[i].slice(0, colon).toLowerCase()] = lines[i].slice(colon + 2);
      }
      if (httpStatus !== 101) {
        settled = true;
        onClose?.({ code: httpStatus, reason: `HTTP ${httpStatus}`, serverHeaders });
        onFail?.(`Edge TTS 微软语音端点拒绝（HTTP ${httpStatus || '?'}）`);
        try { socket.destroy(); } catch {}
        return;
      }
      handshakeDone = true;
      onOpen?.();
    }
    // 帧解析循环（必须处理 continuation 分片）
    for (;;) {
      if (buf.length < 2) return;
      const fin = (buf[0] & 0x80) !== 0;
      const opcode = buf[0] & 0x0f;
      let len = buf[1] & 0x7f;
      let off = 2;
      if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
      if (buf.length < off + len) return;
      const payload = buf.subarray(off, off + len);
      buf = buf.subarray(off + len);

      if (opcode === 0x9) { socket.write(encodeFrame(0xA, payload)); continue; } // ping → pong
      if (opcode === 0x8) {
        settled = true;
        onMessage(0x8, payload);
        try { socket.destroy(); } catch {}
        return;
      }
      if (opcode === 0x1 || opcode === 0x2) { fragOp = opcode; frags = [payload]; }
      else if (opcode === 0x0 && fragOp) frags.push(payload);
      if (fin && fragOp) { onMessage(fragOp, Buffer.concat(frags)); fragOp = 0; frags = []; }
    }
  });
  socket.on('close', () => {
    if (!settled) { settled = true; onClose?.({ code: httpStatus ?? 0, reason: 'closed', serverHeaders }); }
  });

  return {
    sendText: (s) => socket.write(encodeFrame(0x1, s)),
    close: () => { try { socket.write(encodeFrame(0x8, Buffer.alloc(0))); } catch {} try { socket.destroy(); } catch {} },
  };
}

/** 通过 WSS 拉一次合成，返回 { audio: Buffer, durationMs: number|undefined, dateHeader, httpStatus }。 */
function fetchEdgeAudioOnce({ text, voice, rate, pitch, timeoutMs }) {
  return new Promise((resolve, reject) => {
    const audioChunks = [];
    let audioBytes = 0; // 已收音频总字节：分片数组只在结尾合并一次，但总量必须有上限
    let durationMs; // 从 metadata 帧拿到的精确时长（如果开了 metadataoptions）
    let settled = false;
    let conn = null;
    let lastServerDate = null;
    let lastHttpStatus = null;
    // 总时限：wsConnect 的 socket.setTimeout 是**空闲**超时（每次收到数据就重置），
    // 服务端只要持续滴流就永不到期，一条语音能把整条回复链路悬住。这里另加一个
    // 硬 deadline，到点直接失败（失败信息里带"总时长"，与空闲超时可区分）。
    const budgetMs = Math.max(5000, Number(timeoutMs) || 60000);
    const deadline = setTimeout(() => {
      fail(`Edge TTS 合成总时长超时（>${Math.round(budgetMs / 1000)}s，服务端可能一直在滴流）`);
    }, budgetMs);
    const fail = (msg) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      conn?.close();
      reject(new Error(msg));
    };
    const succeed = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      conn?.close();
      resolve(result);
    };
    conn = wsConnect({
      host: WSS_HOST,
      path: buildWssPath(),
      timeoutMs,
      onClose: ({ code, reason, serverHeaders }) => {
        lastHttpStatus = code;
        lastServerDate = serverHeaders?.date;
      },
      onFail: (m) => fail(`Edge TTS ${m}`),
      onOpen: () => {
        const ts = new Date().toISOString();
        conn.sendText(
          `X-Timestamp:${ts}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n` +
          JSON.stringify({ context: { synthesis: { audio: {
            metadataoptions: { sentenceBoundaryEnabled: 'false', wordBoundaryEnabled: 'false' },
            outputFormat: OUTPUT_FORMAT
          } } } })
        );
        const ssml =
          `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='zh-CN'>` +
          `<voice name='${escapeXml(voice)}'><prosody pitch='${pitch}' rate='${rate}' volume='+0%'>${escapeXml(text)}</prosody></voice></speak>`;
        conn.sendText(`X-RequestId:${reqId()}\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:${ts}\r\nPath:ssml\r\n\r\n${ssml}`);
      },
      onMessage: (opcode, payload) => {
        try {
          if (opcode === 0x8) {
            // 服务端关闭：已收到音频就当成功
            if (audioChunks.length > 0) {
              succeed({ audio: Buffer.concat(audioChunks), durationMs: 0, dateHeader: lastServerDate, httpStatus: lastHttpStatus });
            } else if (!settled) {
              fail('Edge TTS 连接被关闭：没拿到任何音频（可能时钟偏差或签名无效）');
            }
            return;
          }
          if (opcode === 0x1) {
            const textMsg = payload.toString('utf8');
            const sep = textMsg.indexOf('\r\n\r\n');
            const headers = sep >= 0 ? textMsg.slice(0, sep) : textMsg;
            const bodyText = sep >= 0 ? textMsg.slice(sep + 4) : '';
            const pathMatch = headers.match(/Path:\s*(\S+)/i);
            const path = pathMatch ? pathMatch[1] : '';
            // metadata 帧里有 duration / offset（单位 100-ns ticks），优先用于时长计算
            if (bodyText.startsWith('{')) {
              try {
                const j = JSON.parse(bodyText);
                if (typeof j.duration === 'number' && j.duration > 0) {
                  durationMs = Math.round(j.duration / 10000); // 1 tick = 100 ns → /10000 = ms
                }
              } catch { /* 忽略 JSON 解析失败 */ }
            }
            if (path === 'turn.end') {
              succeed({ audio: Buffer.concat(audioChunks), durationMs: durationMs ?? 0, dateHeader: lastServerDate, httpStatus: lastHttpStatus });
            }
            return;
          }
          if (opcode === 0x2) {
            if (payload.length < 2) return;
            const headerLen = payload.readUInt16BE(0);
            const headerText = payload.toString('ascii', 2, 2 + headerLen);
            const dataLen = payload.length - 2 - headerLen;
            // Path:audio 二进制帧 —— Edge 可能发一个 0 字节块作为末尾，忽略它
            if (headerText.includes('Path:audio') && dataLen > 0) {
              audioBytes += dataLen;
              if (audioBytes > MAX_AUDIO_BYTES) {
                // 上限兜底：正常 120 字只有几百 KB，超过 32MB 说明对端异常或中间人塞数据。
                fail(`Edge TTS 返回音频超过上限（${Math.round(MAX_AUDIO_BYTES / 1024 / 1024)}MB）`);
                return;
              }
              audioChunks.push(payload.subarray(2 + headerLen));
            }
          }
        } catch { /* 单帧解析失败不影响整体 */ }
      },
    });
  });
}

/** 带时钟校正重试：首次失败时从 voices/list HTTP 响应 Date 头校正后重试一次。 */
async function fetchEdgeAudio(params) {
  try {
    const r1 = await fetchEdgeAudioOnce(params);
    return r1;
  } catch (err1) {
    const msg = String(err1?.message ?? '');
    if (/403|拒绝|时钟|鉴权/i.test(msg)) {
      try {
        const url = `https://${WSS_HOST}/consumer/speech/synthesize/readaloud/voices/list?trustedclienttoken=${TRUSTED_CLIENT_TOKEN}`;
        const resp = await fetch(url, { method: 'GET', headers: { 'User-Agent': EDGE_UA, 'Origin': EDGE_ORIGIN } });
        const dateHdr = resp.headers.get('date');
        if (adjustClockSkewFromDate(dateHdr)) {
          const r2 = await fetchEdgeAudioOnce(params);
          return r2;
        }
      } catch { /* 校正失败就放弃 */ }
    }
    throw err1;
  }
}

function edgeKey({ text, voice, rate, pitch, cacheVersion }) {
  return crypto
    .createHash('sha1')
    .update(JSON.stringify(['edge-tts', cacheVersion ?? null, text, voice, rate ?? null, pitch ?? null]))
    .digest('hex');
}

/**
 * Edge TTS 缓存清理：pruneCache（voice-tts.js 导出）只认 .wav，
 * 我们 edge 缓存是 mp3，所以自己写一个小 prune。
 *
 * 注意策略必须**同时**有「时间」和「数量/体积」两条线，不能只按时间删：
 * 旧实现只删「超过 keepMin 个 **且** 超过 14 天」的文件——于是 14 天内的新文件
 * 一个都不删，而 edge 现在是唯一可用的 TTS 路由（本地/云端都已弃用），每说一句
 * 新话就多一个 mp3（120 字约 60 秒 ≈ 360 KB），高频聊天下缓存会一路涨到几百 MB。
 * 这里改成与 voice-tts.js pruneCache 同口径：先按 TTL 淘汰，再按「最多 400 个 /
 * 150 MB」按 mtime 从旧到新淘汰，直到回到水位以下。清理失败一律吞掉——
 * 缓存清理绝不能影响「这条语音能不能发出去」。
 */
function pruneEdgeCache(dir, { maxAgeMs = 14 * 86400 * 1000, maxFiles = 400, maxBytes = 150 * 1024 * 1024 } = {}) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isFile() && e.name.endsWith('.mp3'))
      .map((e) => {
        const f = path.join(dir, e.name);
        try { const st = fs.statSync(f); return { f, size: st.size, at: st.mtimeMs }; } catch { return null; }
      })
      .filter(Boolean);
  } catch { return { removed: 0 }; }
  const now = Date.now();
  let removed = 0;
  // ① 超过 TTL 的直接淘汰
  const alive = [];
  for (const entry of entries) {
    if (now - entry.at > maxAgeMs) {
      try { fs.unlinkSync(entry.f); removed += 1; } catch { alive.push(entry); }
    } else {
      alive.push(entry);
    }
  }
  // ② 仍超过数量/体积水位 → 按 mtime 从旧到新淘汰
  let total = alive.reduce((n, e) => n + e.size, 0);
  if (alive.length <= maxFiles && total <= maxBytes) return { removed };
  alive.sort((a, b) => a.at - b.at);
  let count = alive.length;
  for (const entry of alive) {
    if (count <= maxFiles && total <= maxBytes) break;
    try {
      fs.unlinkSync(entry.f);
      count -= 1;
      total -= entry.size;
      removed += 1;
    } catch {}
  }
  return { removed };
}

/**
 * 与 voice-tts.js 的 synthesizeToFile 同款契约：文字 → 缓存到 outDir 的 mp3。
 * @returns {Promise<{path:string,durationMs:number,cached:boolean}>}
 */
export async function synthesizeEdgeToFile({
  text,
  voice = DEFAULT_EDGE_VOICE,
  rate = '+0%',
  pitch = '+0Hz',
  timeoutMs = 60000,
  cacheVersion = null,
  outDir,
} = {}) {
  const say = String(text ?? '').trim();
  if (!say) throw new Error('要合成的内容是空的');
  if (!outDir) throw new Error('缺少 outDir（TTS 缓存目录）');
  fs.mkdirSync(outDir, { recursive: true });

  const voiceName = String(voice || DEFAULT_EDGE_VOICE);
  const key = edgeKey({ text: say, voice: voiceName, rate, pitch, cacheVersion });
  const file = path.join(outDir, `${key}.mp3`);
  if (fs.existsSync(file)) {
    const st = fs.statSync(file);
    if (st.size > 128) { // mp3 文件最小也有几百字节
      // 估算时长：48kbps CBR
      return { path: file, durationMs: Math.round((st.size * 8 / MP3_BITRATE_BPS) * 1000), cached: true };
    }
  }

  // 超时值来自 config.json / 调用方，必须收敛：0 / 负数 / NaN 传给 socket.setTimeout
  // 等于「永不超时」，一次卡住的合成会把整条语音链路（含 QQ 回复）悬在那里。
  const budgetMs = Math.max(5000, Math.min(120000, Math.round(Number(timeoutMs) || 60000)));

  const { audio, durationMs: metaDuration } = await fetchEdgeAudio({
    text: say, voice: voiceName, rate, pitch, timeoutMs: budgetMs
  });
  if (audio.length < 128) throw new Error('Edge TTS 返回了空音频（音色名写错了？）');

  // 临时文件名必须唯一：同一句话被两个会话（或模型重试）同时合成时，
  // 固定 `${pid}.tmp` 会让两个写入互相覆盖 / 先 rename 的把后 rename 的挤成 ENOENT。
  const tmp = `${file}.${process.pid}.${Math.random().toString(16).slice(2, 10)}.tmp`;
  try {
    fs.writeFileSync(tmp, audio);
    fs.renameSync(tmp, file);
  } catch (error) {
    try { fs.unlinkSync(tmp); } catch {}
    throw new Error(`写入语音缓存失败：${error?.message ?? error}`);
  }
  pruneEdgeCache(outDir);

  // 时长：优先 metadata 给的精确值，否则按 CBR 码率估算
  const durMs = (metaDuration && metaDuration > 0)
    ? metaDuration
    : Math.round((audio.length * 8 / MP3_BITRATE_BPS) * 1000);
  return { path: file, durationMs: durMs, cached: false };
}
