#!/usr/bin/env node
// install-session-guard.mjs — 在 DSH **退出之后**把「坏会话只跳过」的补丁装进 app.asar。
//
// 为什么不能在 DSH 运行时装：Electron 打开 app.asar 时没有 FILE_SHARE_DELETE 语义，
// 运行中的 asar 无法改名/替换（实测 Rename-Item 会报「另一个程序正在使用此文件」）。
// 所以这里做成「预生成补丁副本 → 后台守候 → DSH 退出后瞬间换入 → 自检 → 失败自动回滚」。
//
// 用法：
//   node scripts/install-session-guard.mjs --prepare            # 预生成 app.asar.guarded + 记录指纹
//   node scripts/install-session-guard.mjs --install-now        # DSH 已关闭时立即换入
//   node scripts/install-session-guard.mjs --watch [--timeout-s 86400]   # 等 DSH 退出后换入（后台运行）
//   node scripts/install-session-guard.mjs --status
//
// 安全策略：
//   · 只换 app.asar，且换入前把原文件改名为 app.asar.old-<ts>（可回滚）。
//   · 换入后立刻用 Electron 的 RUN_AS_NODE 读一次 asar 做冒烟测试；失败就换回原文件。
//   · 记录原 asar 的 SHA256；DSH 升级导致 asar 变化时拒绝使用旧补丁副本。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ASAR_DEFAULT, inspect, inspectBytes, patchBuffer } from './patch-dsh-session-guard.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STATE = path.join(REPO, 'state');
const LOG = path.join(STATE, 'guard-patch.log');
const META = path.join(STATE, 'guard-patch.json');
const GUARDED = `${ASAR_DEFAULT}.guarded`;
const EXE = 'D:\\deepseek\\DeepSeek Harness.exe';

const argv = process.argv.slice(2);
const argOf = (name, fallback = '') => {
  const i = argv.indexOf(name);
  return i === -1 ? fallback : String(argv[i + 1] ?? fallback);
};
const timeoutS = Number(argOf('--timeout-s', '86400'));

function log(line) {
  const text = `[${new Date().toISOString()}] ${line}`;
  try {
    fs.mkdirSync(STATE, { recursive: true });
    fs.appendFileSync(LOG, text + '\n');
  } catch { /* 日志写不进去也不能影响主流程 */ }
  console.log(text);
}

const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const readMeta = () => { try { return JSON.parse(fs.readFileSync(META, 'utf8')); } catch { return null; } };
const writeMeta = (value) => { fs.mkdirSync(STATE, { recursive: true }); fs.writeFileSync(META, JSON.stringify(value, null, 2)); };

function dshRunning() {
  const r = spawnSync('tasklist', ['/FI', 'IMAGENAME eq DeepSeek Harness.exe', '/NH'], { encoding: 'utf8' });
  return /DeepSeek Harness\.exe/i.test(r.stdout ?? '');
}

/** 换入后冒烟：Electron 用 asar 内的 fs 读一个文件。integrity fuse 若开启，这里会立刻失败。 */
function smokeTest() {
  const r = spawnSync(EXE, ['-e', "process.stdout.write(require('fs').readFileSync('D:/deepseek/resources/app.asar/dsh/package.json','utf8').slice(0,12))"], {
    encoding: 'utf8',
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    timeout: 30000,
  });
  const ok = (r.stdout ?? '').includes('@deepseek-ai');
  if (!ok) log(`冒烟失败：exit=${r.status} stderr=${String(r.stderr ?? '').slice(0, 300)}`);
  return ok;
}

function prepare() {
  const state = inspect(ASAR_DEFAULT);
  if (state.status === 'patched') { log('app.asar 已经是打过补丁的状态，无需预生成。'); return true; }
  if (state.status !== 'unpatched') { log(`预生成中止：目标状态 ${state.status}`); return false; }
  const currentHash = sha256(ASAR_DEFAULT);
  const meta = readMeta();
  if (fs.existsSync(GUARDED) && meta?.guarded && meta?.sourceHash === currentHash && sha256(GUARDED) === meta.guarded) {
    log('补丁副本已是最新，复用。');
    return true;
  }
  const buf = fs.readFileSync(ASAR_DEFAULT);
  patchBuffer(buf);
  const verify = inspectBytes(buf);
  if (verify.status !== 'patched') { log(`预生成校验失败：${verify.status}`); return false; }
  fs.writeFileSync(GUARDED, buf);
  writeMeta({ sourceHash: currentHash, guarded: sha256(GUARDED), sourceSize: buf.length, builtAt: new Date().toISOString() });
  log(`已预生成补丁副本 ${GUARDED}`);
  return true;
}

function installNow(reason = '手动') {
  if (dshRunning()) { log(`拒绝换入：DeepSeek Harness 正在运行（${reason}）。`); return false; }
  const state = inspect(ASAR_DEFAULT);
  if (state.status === 'patched') { log('已打补丁，无需换入。'); return true; }
  const meta = readMeta();
  if (!meta || !fs.existsSync(GUARDED)) { log('没有可用的补丁副本，先跑 --prepare。'); return false; }
  if (sha256(ASAR_DEFAULT) !== meta.sourceHash) { log('app.asar 与预生成时不一致（DSH 可能升级过），拒绝换入，请重新 --prepare。'); return false; }
  if (inspectBytes(fs.readFileSync(GUARDED)).status !== 'patched') { log('补丁副本损坏，拒绝换入。'); return false; }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const old = `${ASAR_DEFAULT}.old-${stamp}`;
  try {
    fs.renameSync(ASAR_DEFAULT, old);
  } catch (error) {
    log(`换入失败（原文件改名被拒）：${error?.message ?? error}`);
    return false;
  }
  try {
    fs.renameSync(GUARDED, ASAR_DEFAULT);
  } catch (error) {
    log(`换入失败（补丁副本改名被拒）：${error?.message ?? error}，正在回滚`);
    fs.renameSync(old, ASAR_DEFAULT);
    return false;
  }
  if (!smokeTest()) {
    log('冒烟失败，回滚到原 app.asar');
    try {
      fs.renameSync(ASAR_DEFAULT, GUARDED); // 保住补丁副本，便于排查
      fs.renameSync(old, ASAR_DEFAULT);
    } catch (error) {
      log(`回滚异常，请手动把 ${old} 改回 app.asar：${error?.message ?? error}`);
    }
    return false;
  }
  writeMeta({ ...meta, installedAt: new Date().toISOString(), previous: old });
  log(`补丁已换入（原文件：${old}），冒烟通过。下次启动 DSH 生效。`);
  return true;
}

function status() {
  const s = inspect(ASAR_DEFAULT);
  const meta = readMeta();
  console.log(JSON.stringify({ asar: s.status, guarded: fs.existsSync(GUARDED), meta, running: dshRunning() }, null, 2));
}

function watch() {
  log(`开始守候 DSH 退出（最长 ${timeoutS}s）；退出后换入补丁。`);
  const deadline = Date.now() + timeoutS * 1000;
  let quietTicks = 0;
  while (Date.now() < deadline) {
    if (dshRunning()) { quietTicks = 0; }
    else {
      quietTicks += 1;
      if (quietTicks >= 2) { // 连续两次（约 3 秒）确认已退出，避免误判瞬时窗口
        if (installNow('守候')) { cleanupTask(); process.exit(0); }
        quietTicks = 0;
        // 换入失败（比如又被启动了）：继续守候，直到超时
      }
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1500);
  }
  log('守候超时，未换入。');
  cleanupTask();
  process.exit(1);
}

const TASK = 'DshSessionGuard';

/** 注册一次性计划任务（App 退出会带走子进程，计划任务独立于 App 进程树，才守得住）。 */
function schedule() {
  const start = new Date(Date.now() + 60 * 1000);
  const hhmm = `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`;
  const cmd = `"${process.execPath}" "${fileURLToPath(import.meta.url)}" --watch --timeout-s 172800`;
  const r = spawnSync('schtasks', ['/Create', '/TN', TASK, '/TR', cmd, '/SC', 'ONCE', '/ST', hhmm, '/F', '/RL', 'LIMITED'], { encoding: 'utf8' });
  log(`注册计划任务 ${TASK}（${hhmm} 起守候）：exit=${r.status} ${String(r.stdout ?? r.stderr ?? '').trim().slice(0, 300)}`);
  return r.status === 0;
}

function cleanupTask() {
  const r = spawnSync('schtasks', ['/Delete', '/TN', TASK, '/F'], { encoding: 'utf8' });
  log(`清理计划任务 ${TASK}：exit=${r.status}`);
}

const mode = argv[0] ?? '--status';
if (mode === '--prepare') process.exit(prepare() ? 0 : 1);
else if (mode === '--install-now') process.exit(installNow() ? 0 : 1);
else if (mode === '--watch') watch();
else if (mode === '--schedule') process.exit(schedule() ? 0 : 1);
else if (mode === '--status') status();
else {
  console.log('用法：--prepare | --install-now | --watch [--timeout-s 86400] | --schedule | --status');
  process.exit(2);
}
