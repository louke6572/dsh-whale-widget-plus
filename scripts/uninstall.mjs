#!/usr/bin/env node
/**
 * 卸载 dsh-Dfy（可重复、默认只演练不改）。
 *
 *   node scripts/uninstall.mjs                 # 演练：只列出会删什么
 *   node scripts/uninstall.mjs --yes           # 真删（保留 ~/.dsh/surfcore 里的配置/记忆）
 *   node scripts/uninstall.mjs --yes --purge-state   # 连配置/记忆一起删（"全新用户"用这个）
 *   node scripts/uninstall.mjs --yes --profile desktop
 *
 * 做的事：
 *   1. profile package.json：移除 dependencies 与 dsh.profile.bundles 里的 dsh-dfy
 *      （以及合并前的 surfcore / surfcore-next / whale-widget / qq-agent-presets 残留）
 *   2. cordis.patch.yml：删掉 setup-dsh 维护的那段 MCP 区块
 *   3. 删目录链接（junction）：~/.dsh/plugins/<name> 与 profiles/<p>/node_modules/<name>
 *      —— **只删链接**；同名真实目录一律不动（可能是用户自己放的东西），只打印提示。
 *   4. --purge-state 时删 ~/.dsh/surfcore（配置、记忆卡、日志）
 *
 * 不动：仓库目录本身（自己删）、你的 QQ/B站 账号、SnowLuma。
 *
 * 背景（2026-11 审查）：合并为单插件后 bundle 名从 surfcore 变成了 dsh-dfy，旧脚本只认
 * surfcore ⇒ 在现行安装上「卸载」什么也没删掉：profile 里的 dsh-dfy 依赖/ bundle 与两层
 * junction 全都留着，DSH 重启后插件照常加载。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { detectProfile } from './detect-profile.mjs';

const argv = process.argv.slice(2);
const APPLY = argv.includes('--yes');
const PURGE_STATE = argv.includes('--purge-state');
const PROFILE_ARG = argv.includes('--profile') ? argv[argv.indexOf('--profile') + 1] : '';

/** 当前 bundle 名 + 合并前的历史 bundle 名（都要清，否则旧安装会残留）。 */
const BUNDLES = ['dsh-dfy', 'surfcore', 'surfcore-next', 'whale-widget', 'qq-agent-presets'];

const DSH_HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
let PROFILE = PROFILE_ARG || detectProfile();

// profile 是目录名，不是路径（与 setup-dsh.mjs / DSH 自身同一条边界）。
function invalidProfileName(name) {
  return name === '.' || name === '..' || name === 'node_modules'
    || /[\\/\x00-\x1f<>:"|?*]/.test(name) || /[. ]$/.test(name);
}
if (invalidProfileName(PROFILE)) {
  console.error(`[uninstall] 非法的 profile 名：${JSON.stringify(PROFILE)}`);
  process.exit(2);
}
const PROFILE_DIR = path.join(DSH_HOME, 'profiles', PROFILE);

const plan = [];
const note = (what, p) => plan.push({ what, p });

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

/** 是否为目录链接（junction / symlink）。真实目录返回 null。 */
function linkInfo(p) {
  try {
    const st = fs.lstatSync(p);
    if (st.isSymbolicLink()) return 'link';
    return 'real';
  } catch { return null; }
}

// 1) profile package.json
const profilePkgFile = path.join(PROFILE_DIR, 'package.json');
const pkg = readJson(profilePkgFile, null);
const depHits = [];
const bundleHits = [];
if (pkg) {
  const deps = (pkg.dependencies && typeof pkg.dependencies === 'object') ? pkg.dependencies : {};
  const bundles = Array.isArray(pkg.dsh?.profile?.bundles) ? pkg.dsh.profile.bundles : [];
  for (const name of BUNDLES) {
    if (deps[name]) depHits.push(name);
    if (bundles.includes(name)) bundleHits.push(name);
  }
  if (depHits.length || bundleHits.length) {
    note(`profile 包清单（dependencies: ${depHits.join(', ') || '无'} / bundles: ${bundleHits.join(', ') || '无'}）`, profilePkgFile);
  }
}

// 2) cordis.patch.yml 托管区块
const patchFile = path.join(PROFILE_DIR, 'cordis.patch.yml');
let patchText = '';
try { patchText = fs.readFileSync(patchFile, 'utf8'); } catch {}
const hasPatchBlock = /# === qq-bridge MCP BEGIN ===/.test(patchText);
if (hasPatchBlock) note('cordis.patch.yml 里由 setup-dsh 维护的 MCP 区块', patchFile);

// 3) 两层目录链接
const links = [];
for (const name of BUNDLES) {
  links.push(path.join(DSH_HOME, 'plugins', name));
  links.push(path.join(PROFILE_DIR, 'node_modules', name));
}
const plannedLinks = [];
const skippedReal = [];
for (const p of links) {
  const kind = linkInfo(p);
  if (kind === 'link') plannedLinks.push(p);
  else if (kind === 'real') skippedReal.push(p);
}
if (plannedLinks.length) note(`目录链接（junction/symlink，只删链接）共 ${plannedLinks.length} 个`, plannedLinks.join('\n    '));

// 4) 状态
const stateDir = path.join(DSH_HOME, 'surfcore');
const stateExists = fs.existsSync(stateDir);
if (stateExists && PURGE_STATE) note('配置与记忆（--purge-state）', stateDir);

console.log('dsh-Dfy 卸载计划');
console.log(`  DSH_HOME : ${DSH_HOME}`);
console.log(`  profile  : ${PROFILE}${PROFILE_ARG ? '（指定）' : '（自动判断）'}`);
console.log('');
if (!plan.length) {
  console.log('  没有发现需要卸载的东西（可能已经卸载过了）。');
} else {
  for (const item of plan) console.log(`  · ${item.what}\n    ${item.p}`);
}
if (skippedReal.length) {
  console.log('\n  ⚠️ 以下路径是**真实目录**（不是链接），不会删除，请自行确认：');
  for (const p of skippedReal) console.log(`    ${p}`);
}
if (stateExists && !PURGE_STATE) {
  console.log(`\n  保留：${stateDir}（配置/记忆/日志；要一起删就加 --purge-state）`);
}

if (!APPLY) {
  console.log('\n演练模式：什么都没改。确认后加 --yes 真正执行。');
  process.exit(0);
}

// ── 执行 ──────────────────────────────────────────────────
const done = [];
const failures = [];

if (pkg) {
  const next = JSON.parse(JSON.stringify(pkg));
  for (const name of BUNDLES) {
    if (next.dependencies && Object.hasOwn(next.dependencies, name)) delete next.dependencies[name];
  }
  if (Array.isArray(next.dsh?.profile?.bundles)) {
    next.dsh.profile.bundles = next.dsh.profile.bundles.filter((x) => !BUNDLES.includes(x));
  }
  if (JSON.stringify(next) !== JSON.stringify(pkg)) {
    try {
      fs.writeFileSync(profilePkgFile, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
      done.push('profile 包清单已清理');
    } catch (error) {
      failures.push(`写 ${profilePkgFile} 失败：${error.message}`);
    }
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
  try {
    fs.writeFileSync(patchFile, `${out.join('\n').trimEnd()}\n`, 'utf8');
    done.push('cordis.patch.yml 托管区块已移除');
  } catch (error) {
    failures.push(`写 ${patchFile} 失败：${error.message}`);
  }
}

for (const p of plannedLinks) {
  try {
    // 再确认一次类型：避免检查之后路径被换成真实目录。
    if (linkInfo(p) !== 'link') { failures.push(`跳过（已不是链接）：${p}`); continue; }
    fs.rmSync(p, { recursive: true, force: true });
    done.push(`已删除链接：${p}`);
  } catch (error) {
    failures.push(`删除链接失败：${p}（${error.message}）`);
  }
}

if (PURGE_STATE && stateExists) {
  try {
    fs.rmSync(stateDir, { recursive: true, force: true });
    done.push('配置与记忆已删除');
  } catch (error) {
    failures.push(`删除 ${stateDir} 失败：${error.message}`);
  }
}

console.log('\n卸载结果：');
for (const d of done) console.log(`  ✓ ${d}`);
if (failures.length) {
  console.log('\n未完成项：');
  for (const f of failures) console.log(`  × ${f}`);
  process.exitCode = 1;
}
console.log('\n下一步：完全退出 DSH 再打开，设置里应该看不到 dsh-Dfy 了。');
console.log('仓库目录仍在：想彻底干净就手动删掉它（它不在 DSH 里）。');
