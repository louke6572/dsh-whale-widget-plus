// 重启后的一次性体检：确认「AI 说一句」这条链路在新进程里真的通了。
//
//   node scripts/voice-live-check.mjs
//
// 它**不会发 QQ 消息**：走操作者通道的 dryRun（合成 → 探测 → 返回时长，不发）。
// 需要桥接已重启（旧代码不认识 text，会报「缺少音频路径」）。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VOICE_BASE = 'http://127.0.0.1:8765';

const ok = (m) => console.log(`✅ ${m}`);
const bad = (m) => console.log(`❌ ${m}`);
const info = (m) => console.log(`   ${m}`);

function readJson(p, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return fallback;
  }
}

const cfg = readJson(path.join(ROOT, 'config.json')) ?? {};
let failures = 0;

// ① voxd 活着吗
let health = null;
try {
  const r = await fetch(`${VOICE_BASE}/v1/health`, { signal: AbortSignal.timeout(3000) });
  health = await r.json();
  const loaded = health.engines.filter((e) => e.loaded).map((e) => e.name).join(',') || '(无)';
  ok(`voxd 在线：已加载引擎 ${loaded}，缓存 ${health.cache.entries} 条`);
} catch {
  bad(`voxd 没响应（${VOICE_BASE}）：先启动 run.bat，再重试`);
  failures += 1;
}

// ② 桥接活着吗 + 拿控制台令牌
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

// ③ 挑一个白名单里的目标（只是给 dryRun 用，不会真的发出去）
const groups = Array.isArray(cfg.allow?.groups) ? cfg.allow.groups : [];
const privates = Array.isArray(cfg.allow?.private) ? cfg.allow.private : [];
const target = groups.length ? `group:${groups[0]}` : privates.length ? `private:${privates[0]}` : '';
if (!target) {
  bad('config.allow 里没有白名单会话，无法做 dryRun（先加一个群/私聊）');
  failures += 1;
}

if (target) {
  const body = {
    target,
    text: '语音链路检查，这是一句测试。',
    dryRun: true
  };
  try {
    const r = await fetch(`http://127.0.0.1:${port}/api/voice/send`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-console-token': token },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120000)
    });
    const j = await r.json().catch(() => ({}));
    if (r.ok && j.ok && j.dryRun) {
      ok(`桥接已认识 text：合成 ${Math.round((j.duration || 0) * 1000)}ms 音频，${j.detail}`);
      info(`文件：${j.file}`);
      info('这条没有发出去（dryRun）。要真发，把 dryRun 去掉、在控制台点一次「发语音」。');
    } else if (String(j.error ?? '').includes('缺少音频路径')) {
      bad('桥接还在跑旧代码（不认识 text）：重启桥接后再跑本脚本');
      failures += 1;
    } else if (r.status === 401 || String(j.error ?? '').includes('令牌')) {
      bad(`控制台令牌不对：${j.error ?? r.status}`);
      failures += 1;
    } else {
      bad(`dryRun 失败：${j.error ?? `HTTP ${r.status}`}`);
      failures += 1;
    }
  } catch (e) {
    bad(`连不上桥接（127.0.0.1:${port}）：${e.message}`);
    failures += 1;
  }
}

console.log(failures ? `\n体检未通过：${failures} 项` : '\n体检通过：语音链路可用');
process.exitCode = failures ? 1 : 0;
