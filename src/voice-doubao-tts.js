// 豆包语音合成（火山引擎）—— 新旧两套接口都支持。
//
// 新版控制台（2026 起）只给 API Key，走 V3 HTTP Chunked 单向流式：
//   POST https://openspeech.bytedance.com/api/v3/tts/unidirectional
//   headers: X-Api-Key + X-Api-Resource-Id（seed-tts-2.0 / seed-icl-2.0）
//   body: { user:{uid}, req_params:{text,speaker,audio_params:{format,sample_rate}} }
//   响应: 一行一个 JSON（NDJSON），把每行 data（base64）拼起来就是完整音频。
//   注意 V3 流式不支持 wav（会重复写 wav header），wav 会降级成 mp3。
//
// 旧版控制台（AppID + Access Token）仍可用 V1 非流式：
//   POST https://openspeech.bytedance.com/api/v1/tts
//   headers: Authorization: "Bearer;<access_token>"（分号，不是空格）
//   响应: { code:3000, data:<base64 音频>, addition:{duration} }
//
// 选择规则：填了 API Key 就走 V3；只填 AppID+Token 就走 V1；都没填直接报错并提示怎么填。
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const V1_ENDPOINT = 'https://openspeech.bytedance.com/api/v1/tts';
const V3_ENDPOINT = 'https://openspeech.bytedance.com/api/v3/tts/unidirectional';
const CLUSTER = 'volcano_tts';
const MAX_TEXT = 300;

export const DOUBAO_DEFAULT_VOICE = 'zh_female_xiaohe_uranus_bigtts';
export const DOUBAO_DEFAULT_RESOURCE = 'seed-tts-2.0';

function cacheKey(input) {
  return crypto.createHash('sha1').update(JSON.stringify(input)).digest('hex').slice(0, 32);
}

function authMessage(message, status) {
  const text = String(message || `HTTP ${status}`).slice(0, 160);
  if (/auth|grant|token|api.?key|unauthor|401|403|invalid.*key/i.test(text)) {
    return new Error(`豆包鉴权失败：${text}（新版控制台填 API Key；旧版控制台填 AppID + Access Token）`);
  }
  if (/quota|exceeded|limit|429/i.test(text)) return new Error(`豆包额度用完或限流：${text}`);
  if (/voice|音色|speaker/i.test(text)) return new Error(`豆包音色不可用：${text}（确认 voice_type 已在控制台开通）`);
  return new Error(`豆包合成失败：${text}`);
}

/** V3 的 NDJSON 流：逐行解析，data 是 base64 音频分片；code 0 / 20000000 都算成功。 */
async function readV3Stream(res) {
  const parts = [];
  let maxEnd = 0;
  let tail = '';
  let failure = null;
  const consume = (line) => {
    const trimmed = String(line || '').replace(/^\uFEFF/, '').trim();
    if (!trimmed) return;
    let msg = null;
    try { msg = JSON.parse(trimmed); } catch { return; }
    const code = Number(msg?.code);
    if (Number.isFinite(code) && code !== 0 && code !== 20000000) {
      failure = authMessage(msg?.message || `code ${code}`, 0);
      return;
    }
    if (msg?.data) {
      const buf = Buffer.from(String(msg.data), 'base64');
      if (buf.length) parts.push(buf);
    }
    const end = Number(msg?.sentence?.endTime);
    if (Number.isFinite(end) && end > maxEnd) maxEnd = end;
  };
  for await (const chunk of res.body) {
    tail += Buffer.from(chunk).toString('utf8');
    const lines = tail.split('\n');
    tail = lines.pop() ?? '';
    for (const line of lines) consume(line);
  }
  consume(tail);
  if (failure) throw failure;
  if (!parts.length) throw new Error('豆包返回了空音频');
  return { buf: Buffer.concat(parts), durationMs: Math.round(maxEnd * 1000) };
}

async function synthesizeV3({ say, apiKey, resourceId, voice, encoding, sampleRate, speedRatio, timeoutMs, fetchImpl }) {
  // V3 流式不支持 wav：选了 wav 也按 mp3 合成，播放端不看扩展名、只看 content-type。
  const format = encoding === 'ogg_opus' ? 'ogg_opus' : 'mp3';
  const speechRate = Math.max(-50, Math.min(100, Math.round(((Number(speedRatio) || 1) - 1) * 100)));
  const res = await fetchImpl(V3_ENDPOINT, {
    method: 'POST',
    headers: {
      'X-Api-Key': String(apiKey).trim(),
      'X-Api-Resource-Id': String(resourceId || DOUBAO_DEFAULT_RESOURCE).trim(),
      'X-Api-Request-Id': crypto.randomUUID(),
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      user: { uid: 'dsh-dfy' },
      req_params: {
        text: say,
        speaker: voice,
        model: 'seed-tts-2.0-standard',
        audio_params: { format, sample_rate: sampleRate, speech_rate: speechRate },
      },
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    const raw = await res.text().catch(() => '');
    let detail = raw;
    try {
      const parsed = JSON.parse(raw);
      detail = parsed?.message ?? parsed?.error ?? raw;
    } catch { /* 非 JSON，保留原文 */ }
    throw authMessage(detail, res.status);
  }
  const { buf, durationMs } = await readV3Stream(res);
  return { buf, durationMs, format };
}

/** V1 旧接口：AppID + Access Token。 */
async function synthesizeV1({ say, appId, accessToken, voice, encoding, speedRatio, timeoutMs, fetchImpl }) {
  const body = {
    app: { appid: String(appId), token: String(accessToken), cluster: CLUSTER },
    user: { uid: 'dsh-dfy' },
    audio: { voice_type: voice, encoding, speed_ratio: Number(speedRatio) || 1 },
    request: { reqid: crypto.randomUUID(), text: say, operation: 'query' },
  };
  const res = await fetchImpl(V1_ENDPOINT, {
    method: 'POST',
    // 火山引擎的 Bearer 用分号分隔，写成空格会 401。
    headers: { authorization: `Bearer;${String(accessToken)}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const data = await res.json().catch(() => null);
  const code = Number(data?.code ?? -1);
  if (!res.ok || code !== 3000) throw authMessage(data?.message, res.status);
  const buf = Buffer.from(String(data?.data ?? ''), 'base64');
  if (buf.length <= 44) throw new Error('豆包返回了空音频');
  return { buf, durationMs: Number(data?.addition?.duration) || 0, format: encoding };
}

/**
 * @returns {Promise<{path:string,durationMs:number,cached:boolean,format:string}>}
 */
export async function synthesizeDoubaoToFile({
  text,
  apiKey = '',
  resourceId = DOUBAO_DEFAULT_RESOURCE,
  appId = '',
  accessToken = '',
  voice = '',
  encoding = 'mp3',
  speedRatio = 1,
  sampleRate = 24000,
  timeoutMs = 60000,
  cacheVersion = null,
  outDir,
  fetchImpl = fetch,
} = {}) {
  const say = String(text ?? '').trim().slice(0, MAX_TEXT);
  if (!say) throw new Error('要合成的内容是空的');
  if (!outDir) throw new Error('缺少 outDir（TTS 缓存目录）');
  const key = String(apiKey || '').trim();
  const useV3 = key.length > 0;
  if (!useV3 && (!appId || !accessToken)) {
    throw new Error('豆包语音还没配置：新版控制台填 API Key；旧版控制台填 AppID + Access Token');
  }
  const voiceType = String(voice || DOUBAO_DEFAULT_VOICE).trim();
  const format = useV3 ? (encoding === 'ogg_opus' ? 'ogg_opus' : 'mp3') : encoding;
  const ext = format === 'wav' ? '.wav' : (format === 'ogg_opus' ? '.ogg' : '.mp3');
  fs.mkdirSync(outDir, { recursive: true });

  const file = path.join(outDir, `doubao-${cacheKey({ say, voiceType, appId, key, resourceId, format, speedRatio, cacheVersion })}${ext}`);
  if (fs.existsSync(file)) {
    try {
      if (fs.statSync(file).size > 44) return { path: file, durationMs: 0, cached: true, format };
    } catch { /* 缓存坏了就重合成 */ }
  }

  const result = useV3
    ? await synthesizeV3({ say, apiKey: key, resourceId, voice: voiceType, encoding: format, sampleRate, speedRatio, timeoutMs, fetchImpl })
    : await synthesizeV1({ say, appId, accessToken, voice: voiceType, encoding: format, speedRatio, timeoutMs, fetchImpl });

  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, result.buf);
  fs.renameSync(tmp, file);
  return { path: file, durationMs: result.durationMs || 0, cached: false, format: result.format || format };
}
