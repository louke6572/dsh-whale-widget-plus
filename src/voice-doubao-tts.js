// 豆包语音合成（火山引擎）—— HTTP 非流式接口。
//
// 为什么接它：豆包 App 里的朗读声音就是这套音色，官方提供 21 款免费音色，
// 开通应用后有免费试用字符额度。比去抓网页的朗读流稳定得多。
//
// 协议（火山引擎「大模型HTTP非流式接口-V1」）：
//   POST https://openspeech.bytedance.com/api/v1/tts
//   headers: Authorization: "Bearer;<access_token>"（分号，不是空格）
//   body: { app:{appid,token,cluster}, user:{uid}, audio:{voice_type,encoding},
//           request:{reqid,text,operation:'query'} }
//   响应: { code:3000, data:<base64 音频>, addition:{duration} }
//
// 控制台（旧版）拿 AppID / Access Token；新版控制台可能只给 API Key，
// 那就需要改用 V3 接口——这里先按 V1 实现，报 401 时提示去旧版控制台取 token。
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const ENDPOINT = 'https://openspeech.bytedance.com/api/v1/tts';
const CLUSTER = 'volcano_tts';
const MAX_TEXT = 300;

export const DOUBAO_DEFAULT_VOICE = 'zh_female_xiaohe_uranus_bigtts';

function cacheKey(input) {
  return crypto.createHash('sha1').update(JSON.stringify(input)).digest('hex').slice(0, 32);
}

/**
 * @returns {Promise<{path:string,durationMs:number,cached:boolean}>}
 */
export async function synthesizeDoubaoToFile({
  text,
  appId,
  accessToken,
  voice = '',
  encoding = 'mp3',
  speedRatio = 1,
  timeoutMs = 60000,
  cacheVersion = null,
  outDir,
  fetchImpl = fetch,
} = {}) {
  const say = String(text ?? '').trim().slice(0, MAX_TEXT);
  if (!say) throw new Error('要合成的内容是空的');
  if (!appId || !accessToken) throw new Error('豆包语音还没配置：需要 AppID 和 Access Token（火山引擎控制台 → 语音合成 → 应用）');
  if (!outDir) throw new Error('缺少 outDir（TTS 缓存目录）');
  const voiceType = String(voice || DOUBAO_DEFAULT_VOICE).trim();
  const ext = encoding === 'wav' ? '.wav' : (encoding === 'ogg_opus' ? '.ogg' : '.mp3');
  fs.mkdirSync(outDir, { recursive: true });

  const file = path.join(outDir, `doubao-${cacheKey({ say, voiceType, appId, encoding, speedRatio, cacheVersion })}${ext}`);
  if (fs.existsSync(file)) {
    try {
      if (fs.statSync(file).size > 44) return { path: file, durationMs: 0, cached: true };
    } catch { /* 缓存坏了就重合成 */ }
  }

  const body = {
    app: { appid: String(appId), token: String(accessToken), cluster: CLUSTER },
    user: { uid: 'dsh-dfy' },
    audio: { voice_type: voiceType, encoding, speed_ratio: Number(speedRatio) || 1 },
    request: { reqid: crypto.randomUUID(), text: say, operation: 'query' },
  };
  const res = await fetchImpl(ENDPOINT, {
    method: 'POST',
    headers: {
      // 火山引擎的 Bearer 用分号分隔，写成空格会 401。
      authorization: `Bearer;${String(accessToken)}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const data = await res.json().catch(() => null);
  const code = Number(data?.code ?? -1);
  if (!res.ok || code !== 3000) {
    const message = String(data?.message ?? `HTTP ${res.status}`);
    if (/auth|grant|token/i.test(message)) {
      throw new Error(`豆包鉴权失败：${message}（检查 AppID / Access Token 是否填对）`);
    }
    if (/quota|exceeded/i.test(message)) throw new Error(`豆包额度用完：${message}`);
    if (/voice|音色/i.test(message)) throw new Error(`豆包音色不可用：${message}（确认 voice_type 已开通）`);
    throw new Error(`豆包合成失败：${message}`);
  }
  const buf = Buffer.from(String(data?.data ?? ''), 'base64');
  if (buf.length <= 44) throw new Error('豆包返回了空音频');
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, buf);
  fs.renameSync(tmp, file);
  return { path: file, durationMs: Number(data?.addition?.duration) || 0, cached: false };
}
