// 阿里百炼 Qwen-TTS —— 非实时语音合成 HTTP 接口。
//
// 为什么接它：百炼新人有免费额度，音色多，还能指定语种提升中文质量；
// 一个 API Key 就能调，不需要装任何东西。
//
// 协议（百炼「非实时语音合成 Qwen-TTS」）：
//   POST https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation
//   headers: Authorization: Bearer <DASHSCOPE_API_KEY>
//   body: { model:'qwen3-tts-flash', input:{text, voice, language_type} }
//   响应: { output:{ audio:{ url?, data? } } }  —— url 是 OSS 地址，data 是 base64
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const ENDPOINT = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation';
const MAX_TEXT = 600;

export const QWEN_DEFAULT_MODEL = 'qwen3-tts-flash';
export const QWEN_DEFAULT_VOICE = 'Cherry';
export const QWEN_VOICES = ['Cherry', 'Serena', 'Ethan', 'Chelsie', 'Dylan', 'Jada', 'Sunny'];
export const QWEN_LANGUAGES = ['Auto', 'Chinese', 'English', 'Japanese', 'Korean'];

function cacheKey(input) {
  return crypto.createHash('sha1').update(JSON.stringify(input)).digest('hex').slice(0, 32);
}

/**
 * @returns {Promise<{path:string,durationMs:number,cached:boolean}>}
 */
export async function synthesizeQwenToFile({
  text,
  apiKey,
  voice = '',
  model = '',
  language = 'Auto',
  timeoutMs = 90000,
  cacheVersion = null,
  outDir,
  fetchImpl = fetch,
} = {}) {
  const say = String(text ?? '').trim().slice(0, MAX_TEXT);
  if (!say) throw new Error('要合成的内容是空的');
  if (!apiKey) throw new Error('千问语音还没配置：需要阿里云百炼的 API Key');
  if (!outDir) throw new Error('缺少 outDir（TTS 缓存目录）');
  const voiceName = String(voice || QWEN_DEFAULT_VOICE).trim();
  const modelName = String(model || QWEN_DEFAULT_MODEL).trim();
  const lang = QWEN_LANGUAGES.includes(String(language)) ? String(language) : 'Auto';
  fs.mkdirSync(outDir, { recursive: true });

  const file = path.join(outDir, `qwen-${cacheKey({ say, voiceName, modelName, lang, cacheVersion })}.wav`);
  if (fs.existsSync(file)) {
    try {
      if (fs.statSync(file).size > 44) return { path: file, durationMs: 0, cached: true };
    } catch { /* 缓存坏了就重合成 */ }
  }

  const res = await fetchImpl(ENDPOINT, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${String(apiKey)}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: modelName,
      input: { text: say, voice: voiceName, language_type: lang },
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || (data?.code && String(data.code) !== '0')) {
    const message = String(data?.message ?? `HTTP ${res.status}`);
    if (/invalid.*api.*key|unauthorized|401/i.test(`${data?.code} ${message}`)) {
      throw new Error(`千问鉴权失败：${message}（检查 API Key 是否属于百炼、地域是否正确）`);
    }
    if (/quota|balance|insufficient/i.test(message)) throw new Error(`千问额度不足：${message}`);
    if (/voice/i.test(message)) throw new Error(`千问音色不存在：${message}`);
    throw new Error(`千问合成失败：${message}`);
  }

  const audio = data?.output?.audio ?? {};
  let buf = null;
  if (audio.data) {
    buf = Buffer.from(String(audio.data), 'base64');
  } else if (audio.url) {
    const down = await fetchImpl(audio.url, { signal: AbortSignal.timeout(60000) });
    if (!down.ok) throw new Error(`下载千问音频失败（HTTP ${down.status}）`);
    buf = Buffer.from(await down.arrayBuffer());
  }
  if (!buf || buf.length <= 44) throw new Error('千问返回了空音频');

  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, buf);
  fs.renameSync(tmp, file);
  return { path: file, durationMs: 0, cached: false };
}
