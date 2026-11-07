// 免费在线 TTS —— HuggingFace Space（Qwen3-TTS 的 Voice Design 接口）。
//
// 为什么用这条：
//   · 不装模型、不占显存，文字发过去、音频传回来；
//   · 音色不用参考音频，直接用一句中文描述生成（"二十出头的女生，声音软一点…"）；
//   · ZeroGPU 免费额度，通常 10~30 秒出一句，适合 QQ 语音条这种异步场景。
//
// 代价（必须让用户知道）：
//   · 需要联网，且要合成的文字会发到 HuggingFace 的服务器；
//   · 免费队列偶尔排队/失败，失败时直接报错，不静默换回 Edge。
//
// 协议：Gradio 5 的 /gradio_api/call/<api>：
//   1) POST {data:[...]} → {event_id}
//   2) GET  /call/<api>/<event_id> → SSE，末尾 process_completed 里带音频 URL
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const SPACE_BASE = 'https://qwen-qwen3-tts.hf.space';
const API_NAME = 'generate_voice_design';

export const DEFAULT_ONLINE_DESC = '二十出头的女生，声音软一点、偏轻，语速自然偏快，带一点笑意，不要播音腔。';
export const DEFAULT_ONLINE_LANGUAGE = 'Chinese';
export const ONLINE_LANGUAGES = ['Auto', 'Chinese', 'English', 'Japanese', 'Korean'];

const MAX_TEXT = 200;
const POLL_TIMEOUT_MS = 180000;

function cacheKey(input) {
  return crypto.createHash('sha1').update(JSON.stringify(input)).digest('hex').slice(0, 32);
}

function parseSseBlock(block) {
  const data = [];
  for (const line of block.split('\n')) {
    if (line.startsWith('data:')) data.push(line.slice(5).trim());
  }
  return data.join('\n');
}

/**
 * Gradio 5 的 /call 流有两种 data 形状，都要认：
 *   · 新版：`event: complete` + `data: [FileData, "完成文案"]`（data 本身就是输出数组）
 *   · 旧版：`data: {"msg":"process_completed","output":{"data":[...]}}`
 */
function audioUrlOf(payload) {
  const lists = [];
  if (Array.isArray(payload)) {
    lists.push(payload);
    if (Array.isArray(payload[0])) lists.push(payload[0]);
  }
  const nested = payload?.output?.data ?? payload?.data ?? payload?.output;
  if (Array.isArray(nested)) lists.push(nested);
  for (const list of lists) {
    for (const item of list) {
      if (typeof item?.url === 'string') return item.url;
      if (Array.isArray(item)) {
        for (const sub of item) if (typeof sub?.url === 'string') return sub.url;
      }
    }
  }
  return '';
}

/**
 * 合成一段话，返回本地 wav 路径。
 * @returns {Promise<{path:string,durationMs:number,cached:boolean}>}
 */
export async function synthesizeOnlineToFile({
  text,
  description = '',
  language = DEFAULT_ONLINE_LANGUAGE,
  baseUrl = SPACE_BASE,
  timeoutMs = POLL_TIMEOUT_MS,
  cacheVersion = null,
  outDir,
  fetchImpl = fetch,
} = {}) {
  const say = String(text ?? '').trim();
  if (!say) throw new Error('要合成的内容是空的');
  if (!outDir) throw new Error('缺少 outDir（TTS 缓存目录）');
  const desc = String(description || DEFAULT_ONLINE_DESC).trim();
  const lang = ONLINE_LANGUAGES.includes(String(language)) ? String(language) : DEFAULT_ONLINE_LANGUAGE;
  const speakText = say.slice(0, MAX_TEXT);
  fs.mkdirSync(outDir, { recursive: true });

  const file = path.join(outDir, `online-${cacheKey({ baseUrl, speakText, desc, lang, cacheVersion })}.wav`);
  if (fs.existsSync(file)) {
    try {
      const stat = fs.statSync(file);
      if (stat.size > 44) return { path: file, durationMs: 0, cached: true };
    } catch { /* 缓存坏了就重下 */ }
  }

  const root = String(baseUrl || SPACE_BASE).replace(/\/+$/, '');
  const call = await fetchImpl(`${root}/gradio_api/call/${API_NAME}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ data: [speakText, lang, desc] }),
    signal: AbortSignal.timeout(Math.min(timeoutMs, 60000)),
  });
  if (!call.ok) {
    const body = await call.text().catch(() => '');
    throw new Error(`在线语音服务返回 ${call.status}${body ? `：${body.slice(0, 120)}` : ''}`);
  }
  const { event_id: eventId } = await call.json();
  if (!eventId) throw new Error('在线语音服务没有返回任务号');

  const stream = await fetchImpl(`${root}/gradio_api/call/${API_NAME}/${eventId}`, {
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!stream.ok || !stream.body) throw new Error(`在线语音任务读取失败（HTTP ${stream.status}）`);

  const reader = stream.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let url = '';
  let failure = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split('\n\n');
    buffer = blocks.pop() ?? '';
    for (const block of blocks) {
      const raw = parseSseBlock(block);
      if (!raw) continue;
      let msg;
      try { msg = JSON.parse(raw); } catch { continue; }
      if (msg && msg.msg === 'process_completed') {
        if (msg.success === false) failure = String(msg.output?.error ?? '任务失败');
        else url = audioUrlOf(msg.output) || audioUrlOf(msg);
      } else if (Array.isArray(msg)) {
        // 新版 Gradio：complete 事件的 data 直接就是输出数组。
        url = audioUrlOf(msg);
      }
    }
    if (url || failure) break;
  }
  if (failure) throw new Error(`在线合成失败：${failure.slice(0, 160)}`);
  if (!url) throw new Error('在线合成没有返回音频（可能排队超时，重试一次）');

  const audio = await fetchImpl(url, { signal: AbortSignal.timeout(60000) });
  if (!audio.ok) throw new Error(`下载音频失败（HTTP ${audio.status}）`);
  const buf = Buffer.from(await audio.arrayBuffer());
  if (buf.length <= 44) throw new Error('在线语音返回了空音频');

  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, buf);
  fs.renameSync(tmp, file);
  return { path: file, durationMs: 0, cached: false };
}
