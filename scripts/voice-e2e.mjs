// 端到端体检：voxd（HTTP）→ 本地 wav → surfcore 的发送前检查。
// 不发任何 QQ 消息；voxd 没起来时打印 SKIP 并正常退出（可放进日常自检）。
//
//   node scripts/voice-e2e.mjs [--base-url http://127.0.0.1:8765] [--voice huayan] [--rounds 3]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { synthesizeToFile, wavDurationMs, DEFAULT_BASE_URL } from '../src/voice-tts.js';
import { inspectAudio } from '../src/voice-core.js';

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const baseUrl = arg('base-url', DEFAULT_BASE_URL);
const voice = arg('voice', 'huayan');
const rounds = Number(arg('rounds', 3)) || 3;
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'voice-e2e-'));
const texts = [
  '来了来了，我还以为你今天不来了呢。',
  '文件我放你桌面了，记得看一眼。',
  '这个我得想想，晚点回你。'
];

const health = await fetch(`${baseUrl}/v1/health`, { signal: AbortSignal.timeout(3000) })
  .then((r) => r.json())
  .catch(() => null);
if (!health?.ok) {
  console.log(`SKIP: ${baseUrl} 没有响应（voxd 没起来？）`);
  process.exit(0);
}
console.log(`voxd ${baseUrl}  engines=${health.engines.filter((e) => e.loaded).map((e) => e.name).join(',') || '(未加载)'}`);

const times = [];
let bad = 0;
for (let i = 0; i < rounds; i += 1) {
  const text = texts[i % texts.length];
  const t = Date.now();
  try {
    const r = await synthesizeToFile({ text, voice, baseUrl, outDir, timeoutMs: 120000 });
    const ms = Date.now() - t;
    times.push(ms);
    const dur = r.durationMs || wavDurationMs(fs.readFileSync(r.path));
    const probe = await inspectAudio(r.path, { maxSeconds: 300 });
    const ok = dur > 0 && probe.ok;
    if (!ok) bad += 1;
    console.log(
      `${String(i + 1).padStart(2)} ${ms.toString().padStart(5)}ms  ${(dur / 1000).toFixed(2)}s  ` +
        `cached=${r.cached ? 'yes' : 'no '}  probe=${probe.ok ? probe.codec || 'ok' : probe.error}  ${text.slice(0, 14)}`
    );
  } catch (error) {
    bad += 1;
    console.log(`${String(i + 1).padStart(2)} FAIL ${error?.message ?? error}`);
  }
}

const sorted = [...times].sort((a, b) => a - b);
const p50 = sorted[Math.floor(sorted.length / 2)] ?? 0;
console.log(`p50 ${p50}ms  bad=${bad}  out=${outDir}`);
fs.rmSync(outDir, { recursive: true, force: true });
process.exit(bad ? 1 : 0);
