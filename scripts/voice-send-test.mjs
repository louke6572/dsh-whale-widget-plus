// 一条命令验证「AI 说一句」在真实 QQ 里到底通不通。
//
//   node scripts/voice-send-test.mjs --key group:123456            # 只预演（不发）
//   node scripts/voice-send-test.mjs --key group:123456 --yes      # 真发一条
//
// 走操作者通道（控制台令牌），不需要 agent token；目标必须在 config.allow 白名单里。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name, fallback = '') => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

const key = arg('key');
const text = arg('text', '听见了吗？这是我用语音说的。');
const voice = arg('voice');
const yes = process.argv.includes('--yes');
if (!key) {
  console.error('用法: node scripts/voice-send-test.mjs --key group:123456 [--text "..."] [--yes]');
  process.exit(2);
}

const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));
const port = Number(cfg.consolePort) || 3100;
const token =
  String(cfg.consoleToken ?? '').trim() ||
  (() => {
    try {
      return fs.readFileSync(path.join(ROOT, 'state', 'console-token'), 'utf8').trim();
    } catch {
      return '';
    }
  })();

const body = { target: key, text, ...(voice ? { voice } : {}), ...(yes ? {} : { dryRun: true }) };
console.log(`${yes ? '真发' : '预演'}：${key}  ←「${text}」`);

const r = await fetch(`http://127.0.0.1:${port}/api/voice/send`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-console-token': token },
  body: JSON.stringify(body),
  signal: AbortSignal.timeout(300000)
});
const j = await r.json().catch(() => ({}));

if (!r.ok || !j.ok) {
  console.error(`❌ ${j.error ?? `HTTP ${r.status}`}`);
  process.exit(1);
}
if (!yes) {
  console.log(`✅ 预演通过：合成 ${Math.round((j.duration || 0) * 1000)}ms 音频（${j.detail}），没有发出去`);
  console.log(`   要真发，加 --yes`);
  process.exit(0);
}
console.log(`✅ 已发送：messageId=${j.messageId} verified=${j.verified} ${j.detail ?? ''}`);
if (!j.verified) console.log('   ⚠️ verified=false：消息发出去了但没回读到 record 段，去手机上确认一下');
