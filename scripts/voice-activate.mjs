// 打开「AI 用文字直接发语音」这条链路（幂等，改前备份）。
//
//   node scripts/voice-activate.mjs [--base-url http://127.0.0.1:8765] [--character xiaoyu] [--dry-run]
//
// 只改 config.json；**不会重启任何进程**——重启桥接 + DSH 后才生效（见输出提示）。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CFG = path.join(ROOT, 'config.json');

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const dryRun = process.argv.includes('--dry-run');
const baseUrl = arg('base-url', 'http://127.0.0.1:8765');
const character = arg('character', 'xiaoyu');

if (!fs.existsSync(CFG)) {
  console.error(`找不到 ${CFG}`);
  process.exit(1);
}
const cfg = JSON.parse(fs.readFileSync(CFG, 'utf8'));
cfg.socialV2 = cfg.socialV2 ?? {};
cfg.socialV2.tools = cfg.socialV2.tools ?? {};
cfg.socialV2.voice = cfg.socialV2.voice ?? {};

const before = JSON.stringify({
  enabled: cfg.socialV2.voice.enabled,
  sendVoice: cfg.socialV2.tools.sendVoice,
  tts: cfg.socialV2.voice.tts ?? null
});

cfg.socialV2.voice.enabled = true;
cfg.socialV2.tools.sendVoice = true;
cfg.socialV2.voice.tts = {
  enabled: true,
  baseUrl,
  timeoutMs: 60000,
  maxChars: 120,
  character,
  ...(cfg.socialV2.voice.tts ?? {})
};

const after = JSON.stringify({
  enabled: cfg.socialV2.voice.enabled,
  sendVoice: cfg.socialV2.tools.sendVoice,
  tts: cfg.socialV2.voice.tts
});

if (before === after) {
  console.log('已经是打开状态，无需改动：', after);
  process.exit(0);
}
if (dryRun) {
  console.log(`[dry-run] ${before}\n       -> ${after}`);
  process.exit(0);
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupDir = path.join(ROOT, '_backups');
fs.mkdirSync(backupDir, { recursive: true });
const backup = path.join(backupDir, `config.json.bak-voice-${stamp}`);
fs.copyFileSync(CFG, backup);
fs.writeFileSync(CFG, JSON.stringify(cfg, null, 2) + '\n', 'utf8');

console.log(`已开启：${after}`);
console.log(`备份：${path.relative(ROOT, backup)}`);
console.log('');
console.log('下一步（必须两步都做，否则还是打字）：');
console.log('  1) 重启桥接：restart.bat（或结束 node src/bridge.js 后 npm start）');
console.log('  2) 重启 DSH（MCP 工具清单在启动时读取，不重启看不到 text 参数）');
console.log('回滚：把上面那个备份文件拷回 config.json，再重启。');
