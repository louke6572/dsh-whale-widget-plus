#!/usr/bin/env node
/**
 * 卸载 SurfCore（可重复、可回滚、默认只演练不改）。
 *
 *   node scripts/uninstall.mjs                 # 演练：只列出会删什么
 *   node scripts/uninstall.mjs --yes           # 真删（保留 ~/.dsh/surfcore 里的配置/记忆）
 *   node scripts/uninstall.mjs --yes --purge-state   # 连配置/记忆一起删（"全新用户"用这个）
 *   node scripts/uninstall.mjs --yes --profile desktop
 *
 * 做的事：
 *   1. profile package.json：移除 dependencies.surfcore 与 dsh.profile.bundles 里的 surfcore
 *   2. cordis.patch.yml：删掉 setup-dsh 维护的那段 MCP 区块
 *   3. 删 junction：~/.dsh/plugins/surfcore 与 profiles/<p>/node_modules/surfcore
 *   4. --purge-state 时删 ~/.dsh/surfcore（配置、记忆卡、日志）
 *
 * 不动：仓库目录本身（自己删）、你的 QQ/B站 账号、SnowLuma。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { detectProfile } from './detect-profile.mjs';

const argv = process.argv.slice(2);
const APPLY = argv.includes('--yes');
const PURGE_STATE = argv.includes('--purge-state');
const PROFILE_ARG = argv.includes('--profile') ? argv[argv.indexOf('--profile') + 1] : '';

const DSH_HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
const PROFILE = PROFILE_ARG || detectProfile();
const PROFILE_DIR = path.join(DSH_HOME, 'profiles', PROFILE);

const plan = [];
const note = (what, p) => plan.push({ what, p });

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

// 1) profile package.json
const profilePkgFile = path.join(PROFILE_DIR, 'package.json');
const pkg = readJson(profilePkgFile, null);
if (pkg) {
  const hasDep = Boolean(pkg.dependencies?.surfcore);
  const bundles = Array.isArray(pkg.dsh?.profile?.bundles) ? pkg.dsh.profile.bundles : [];
  const hasBundle = bundles.includes('surfcore');
  if (hasDep || hasBundle) {
    note(`profile 包清单（dependencies.surfcore=${hasDep} / bundles 含 surfcore=${hasBundle}）`, profilePkgFile);
  }
}

// 2) cordis.patch.yml 托管区块
const patchFile = path.join(PROFILE_DIR, 'cordis.patch.yml');
let patchText = '';
try { patchText = fs.readFileSync(patchFile, 'utf8'); } catch {}
const hasPatchBlock = /# === qq-bridge MCP BEGIN ===/.test(patchText);
if (hasPatchBlock) note('cordis.patch.yml 里由 setup-dsh 维护的 MCP 区块', patchFile);

// 3) 链接
const linkPlugin = path.join(DSH_HOME, 'plugins', 'surfcore');
const linkProfile = path.join(PROFILE_DIR, 'node_modules', 'surfcore');
for (const p of [linkPlugin, linkProfile]) {
  try { if (fs.existsSync(p) || fs.lstatSync(p)) note('目录链接（junction）', p); } catch {}
}

// 4) 状态
const stateDir = path.join(DSH_HOME, 'surfcore');
const stateExists = fs.existsSync(stateDir);
if (stateExists && PURGE_STATE) note('配置与记忆（--purge-state）', stateDir);

console.log('SurfCore 卸载计划');
console.log(`  DSH_HOME : ${DSH_HOME}`);
console.log(`  profile  : ${PROFILE}${PROFILE_ARG ? '（指定）' : '（自动判断）'}`);
console.log('');
if (!plan.length) {
  console.log('  没有发现需要卸载的东西（可能已经卸载过了）。');
} else {
  for (const item of plan) console.log(`  · ${item.what}\n    ${item.p}`);
}
if (stateExists && !PURGE_STATE) {
  console.log('\n  保留：' + stateDir + '（配置/记忆/日志；要一起删就加 --purge-state）');
}

if (!APPLY) {
  console.log('\n演练模式：什么都没改。确认后加 --yes 真正执行。');
  process.exit(0);
}

// ── 执行 ──────────────────────────────────────────────────
const done = [];

if (pkg) {
  const next = JSON.parse(JSON.stringify(pkg));
  if (next.dependencies?.surfcore) delete next.dependencies.surfcore;
  if (Array.isArray(next.dsh?.profile?.bundles)) {
    next.dsh.profile.bundles = next.dsh.profile.bundles.filter((x) => x !== 'surfcore');
  }
  if (JSON.stringify(next) !== JSON.stringify(pkg)) {
    fs.writeFileSync(profilePkgFile, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
    done.push('profile 包清单已清理');
  }
}

if (hasPatchBlock) {
  const lines = patchText.split(/\r?\n/);
  const out = [];
  let skipping = false;
  for (const line of lines) {
    if (line.includes('# === qq-bridge MCP BEGIN ===')) { skipping = true; continue; }
    if (line.includes('# === qq-bridge MCP END ===')) { skipping = false; continue; }
    if (!skipping) out.push(line);
  }
  fs.writeFileSync(patchFile, `${out.join('\n').trimEnd()}\n`, 'utf8');
  done.push('cordis.patch.yml 托管区块已移除');
}

for (const p of [linkPlugin, linkProfile]) {
  try {
    if (fs.existsSync(p) || fs.lstatSync(p)) {
      fs.rmSync(p, { recursive: true, force: true });
      done.push(`已删除链接：${p}`);
    }
  } catch (error) {
    console.log(`  删除失败：${p}（${error.message}）`);
  }
}

if (PURGE_STATE && stateExists) {
  fs.rmSync(stateDir, { recursive: true, force: true });
  done.push('配置与记忆已删除');
}

console.log('\n卸载完成：');
for (const d of done) console.log(`  ✓ ${d}`);
console.log('\n下一步：完全退出 DSH 再打开，设置里应该看不到 SurfCore 了。');
console.log('仓库目录仍在：想彻底干净就手动删掉它（它不在 DSH 里）。');
