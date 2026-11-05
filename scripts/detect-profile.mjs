#!/usr/bin/env node
/**
 * 自动判断"当前 DSH 用的是哪个 profile"。
 *
 * 为什么需要：`setup-dsh.mjs` 装错 profile = 重启后设置里根本看不到 SurfCore。
 * 用户不该知道 profile 是什么，所以这里按可信度从高到低自己查：
 *
 *   1. 显式传入（调用方给）
 *   2. 环境变量 DSH_PROFILE
 *   3. 正在运行的 DSH 进程命令行里的 `...\profiles\<名字>\...`（最可信：就是它正在跑）
 *   4. 最近修改过的 profile（DSH 启动/使用会写它）
 *   5. 只有一个 profile 就用它
 *   6. 兜底 web
 *
 * 用法：node scripts/detect-profile.mjs   → 打印 profile 名
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

function dshHome() {
  return process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
}

/** 有效的 profile 名（目录里有 package.json，且不是备份/隐藏目录）。 */
export function listProfiles() {
  const root = path.join(dshHome(), 'profiles');
  try {
    return fs.readdirSync(root, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.includes('.') && fs.existsSync(path.join(root, d.name, 'package.json')))
      .map((d) => d.name);
  } catch {
    return [];
  }
}

/** 从正在运行的进程命令行里找 profiles/<名字>/。 */
function fromRunningProcesses() {
  const commands = [];
  try {
    if (process.platform === 'win32') {
      const out = execFileSync('powershell', ['-NoProfile', '-Command',
        "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine } | Select-Object -ExpandProperty CommandLine"], { encoding: 'utf8', timeout: 20_000, windowsHide: true });
      commands.push(out);
    } else {
      commands.push(execFileSync('ps', ['-eo', 'command'], { encoding: 'utf8', timeout: 10_000 }));
    }
  } catch {
    return '';
  }
  const text = commands.join('\n');
  const tally = new Map();
  for (const m of text.matchAll(/[\\/]profiles[\\/]([A-Za-z0-9][A-Za-z0-9._-]*)[\\/]/g)) {
    const name = m[1];
    if (name.includes('.')) continue;
    if (!listProfiles().includes(name)) continue;
    tally.set(name, (tally.get(name) ?? 0) + 1);
  }
  let best = '';
  let bestCount = 0;
  for (const [name, count] of tally) {
    if (count > bestCount) { best = name; bestCount = count; }
  }
  return best;
}

function mostRecentProfile() {
  const root = path.join(dshHome(), 'profiles');
  let best = '';
  let bestTime = -1;
  for (const name of listProfiles()) {
    let time = 0;
    for (const file of ['package.json', 'cordis.patch.yml']) {
      try { time = Math.max(time, fs.statSync(path.join(root, name, file)).mtimeMs); } catch {}
    }
    if (time > bestTime) { bestTime = time; best = name; }
  }
  return best;
}

export function detectProfile({ explicit = '' } = {}) {
  if (explicit) return explicit;
  const env = String(process.env.DSH_PROFILE ?? '').trim();
  if (env && listProfiles().includes(env)) return env;
  const running = fromRunningProcesses();
  if (running) return running;
  const recent = mostRecentProfile();
  if (recent) return recent;
  const all = listProfiles();
  if (all.length === 1) return all[0];
  return 'web';
}

/** 检测结果的可读说明（给 bootstrap / 安装器打印用）。 */
export function explainProfile(name) {
  const env = String(process.env.DSH_PROFILE ?? '').trim();
  if (name && env === name) return `${name}（来自环境变量 DSH_PROFILE）`;
  if (name && fromRunningProcesses() === name) return `${name}（从正在运行的 DSH 进程判断）`;
  if (name) return `${name}（按最近使用判断）`;
  return 'web（兜底默认）';
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(detectProfile());
}
