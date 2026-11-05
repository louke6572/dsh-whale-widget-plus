#!/usr/bin/env node
/**
 * 版本号一致性（单一真相：仓库根 package.json 的 version）。
 *
 *   node scripts/version.mjs show                 # 版本矩阵（仓库 + 各处的版本面）
 *   node scripts/version.mjs check                # 一致性校验（CI / 提交前跑，不一致 exit 1）
 *   node scripts/version.mjs bump patch|minor|major|rc
 *   node scripts/version.mjs tag [--push]         # 打 v{version} 注释 tag
 *
 * 规则：
 *   1. 版本号只写在根 package.json —— 代码里不许再硬编码第二份；
 *   2. 对外可见的版本面必须与根 package.json 一致：
 *        · README.md 顶部横幅（`· \`v0.7.3\``）
 *        · AGENT.md 汇报模板里的「版本：0.7.3」
 *        · CHANGELOG.md 必须有当前版本的小节
 *        · （widget 与后端都从 package.json / 宿主下发读版本，不需另写常量）
 *   3. 发布 = 打 tag；tag 必须等于 v{version}，且 tag 之后不能有未发布提交；
 *   4. 0.x 阶段：minor = 破坏性/大功能，patch = 修复/小功能。
 *
 * 背景（2026-11 审查）：旧版本脚本是「三插件」时代的产物 —— 它读
 * `plugins/surfcore/package.json`（合并为单插件后该目录已不存在），因此 show/check
 * 每次都在第一步 ENOENT 崩掉；它维护的「兄弟仓库版本矩阵」（../voice、../pet）也不属于
 * 本仓库。这里改成只校验本仓库的版本面。
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const ROOT_PKG = path.join(ROOT, 'package.json');
const README = path.join(ROOT, 'README.md');
const AGENT = path.join(ROOT, 'AGENT.md');
const CHANGELOG = path.join(ROOT, 'CHANGELOG.md');
const SEMVER = /^(\d+)\.(\d+)\.(\d+)(?:-(rc|beta|alpha)\.(\d+))?$/;

// 这些文件里出现 `const VERSION = '1.2.3'` 这类字面量就说明版本又有了第二份真相。
const CODE_FILES = [
  'lib/index.js',
  'lib/client.js',
  'backend/lib/index.js',
  'widget/lib/index.js',
];

const argv = process.argv.slice(2);
const cmd = argv[0] || 'show';

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJson(file, data) {
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function readText(file) {
  try { return fs.readFileSync(file, 'utf8'); } catch { return ''; }
}

function git(args, { allowFail = false } = {}) {
  try {
    return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch (error) {
    if (allowFail) return '';
    throw error;
  }
}

function isGitRepo() {
  return fs.existsSync(path.join(ROOT, '.git'));
}

function latestTag() {
  if (!isGitRepo()) return '';
  return git(['describe', '--tags', '--abbrev=0'], { allowFail: true });
}

function commitsSince(tag) {
  if (!isGitRepo() || !tag) return [];
  const out = git(['log', '--oneline', `${tag}..HEAD`], { allowFail: true });
  return out ? out.split('\n').filter(Boolean) : [];
}

function compareVersion(a, b) {
  const pa = a.split('-')[0].split('.').map(Number);
  const pb = b.split('-')[0].split('.').map(Number);
  for (let i = 0; i < 3; i += 1) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) > (pb[i] ?? 0) ? 1 : -1;
  }
  return 0;
}

/** README 顶部横幅里的 `· \`v0.7.3\``（取第一处）。 */
function readmeVersion() {
  const m = /·\s*`v([^`\s]+)`/.exec(readText(README));
  return m ? m[1] : '';
}

/** AGENT.md 汇报模板里的「- 版本：0.7.3」。 */
function agentVersion() {
  const m = /^-\s*版本：\s*v?([0-9][^\s]*)\s*$/m.exec(readText(AGENT));
  return m ? m[1] : '';
}

/** CHANGELOG 里最靠上的版本小节标题。 */
function changelogTopVersion() {
  const m = /^##\s*\[?([0-9][^\]\s]*)\]?/m.exec(readText(CHANGELOG));
  return m ? m[1] : '';
}

function changelogHas(version) {
  const log = readText(CHANGELOG);
  return log.includes(`## [${version}]`) || log.includes(`## ${version}`);
}

/** 代码里硬编码的版本常量（应为空：都从 package.json 读）。 */
function hardcodedVersions() {
  const hits = [];
  for (const rel of CODE_FILES) {
    const src = readText(path.join(ROOT, rel));
    if (!src) continue;
    for (const m of src.matchAll(/(?:const|let|var)\s+(?:VERSION|BUILD_VERSION|VERSION_LABEL)\s*=\s*'(\d+\.\d+\.\d+[^']*)'/g)) {
      hits.push(`${rel}: ${m[0]}`);
    }
  }
  return hits;
}

function show() {
  const root = readJson(ROOT_PKG);
  const tag = latestTag();
  const ahead = commitsSince(tag);
  const readme = readmeVersion();
  const agent = agentVersion();
  const top = changelogTopVersion();
  const mark = (v) => (v === root.version ? '' : `  ← 与根 package.json（${root.version}）不一致！`);
  console.log(`dsh-Dfy 根 package.json  v${root.version}`);
  console.log(`  README 横幅           ${readme ? `v${readme}` : '(没找到)'}${mark(readme)}`);
  console.log(`  AGENT 汇报模板        ${agent ? `v${agent}` : '(没找到)'}${mark(agent)}`);
  console.log(`  CHANGELOG 最上一节    ${top ? `v${top}` : '(没有)'}${top === root.version ? '' : `  ← 当前版本小节${changelogHas(root.version) ? '存在但不在最上面' : '缺失'}`}`);
  console.log(`  最新 tag              ${tag || '(还没有 tag)'}${tag && tag !== `v${root.version}` ? `  ← 与 v${root.version} 不一致` : ''}`);
  console.log(`  tag 之后提交          ${ahead.length} 个${ahead.length ? '  ← 需要 bump 并打 tag' : ''}`);
  const hard = hardcodedVersions();
  console.log(`  代码里的版本常量      ${hard.length ? hard.join('；') : '无（符合「单一真相」）'}`);
}

function check() {
  const errors = [];
  const warnings = [];
  const root = readJson(ROOT_PKG);

  // ① 根版本号本身合法
  if (!SEMVER.test(root.version)) errors.push(`根 package.json 版本不是合法 semver：${root.version}`);

  // ② 任何一处代码硬编码版本 = 第二真相，必须删掉改成读 package.json
  for (const hit of hardcodedVersions()) errors.push(`代码里硬编码了版本：${hit}`);

  // ③ 对外文档里的版本面必须一致（不一致就是文档漂移，用户会看到两个版本号）
  const readme = readmeVersion();
  if (!readme) warnings.push('README.md 里没找到「· `vX.Y.Z`」版本横幅（bump 时无法自动同步）');
  else if (readme !== root.version) errors.push(`README.md 横幅 v${readme} ≠ 根 package.json ${root.version}`);

  const agent = agentVersion();
  if (agent && agent !== root.version) errors.push(`AGENT.md 汇报模板版本 ${agent} ≠ 根 package.json ${root.version}`);

  // ④ CHANGELOG 必须有当前版本的小节
  if (!readText(CHANGELOG)) {
    errors.push('没有 CHANGELOG.md');
  } else if (!changelogHas(root.version)) {
    warnings.push(`CHANGELOG.md 里没有 ${root.version} 的小节`);
  } else {
    const top = changelogTopVersion();
    if (top && top !== root.version) {
      warnings.push(`CHANGELOG.md 最上一节是 ${top}，不是当前版本 ${root.version}（合并历史里版本号不连续时属正常，见文件头说明）`);
    }
  }

  // ⑤ tag 一致性（发布 = tag；没有 tag 的仓库只提示）
  if (isGitRepo()) {
    const tag = latestTag();
    if (!tag) {
      warnings.push('仓库还没有任何 tag（首次发布前正常）');
    } else if (tag !== `v${root.version}`) {
      const cmp = compareVersion(root.version, tag.replace(/^v/, ''));
      if (cmp > 0) warnings.push(`已 bump 到 ${root.version}，但最新 tag 还是 ${tag}（记得 tag + push）`);
      else errors.push(`版本 ${root.version} 落后于最新 tag ${tag}`);
    }
    const ahead = commitsSince(tag);
    if (ahead.length && !tag.startsWith(`v${root.version}`)) {
      warnings.push(`tag ${tag} 之后有 ${ahead.length} 个提交没有发布`);
    }
  }

  for (const w of warnings) console.log(`⚠️  ${w}`);
  for (const e of errors) console.log(`❌ ${e}`);
  if (!errors.length) console.log(`✅ 版本一致：v${root.version}${warnings.length ? '（有警告）' : ''}`);
  process.exit(errors.length ? 1 : 0);
}

function bump(kind) {
  const root = readJson(ROOT_PKG);
  const m = SEMVER.exec(root.version);
  if (!m) {
    console.error(`当前版本不是合法 semver：${root.version}`);
    process.exit(2);
  }
  const [major, minor, patch] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const pre = m[4];
  const preNum = Number(m[5] || 0);
  let next;
  if (kind === 'major') next = `${major + 1}.0.0`;
  else if (kind === 'minor') next = `${major}.${minor + 1}.0`;
  else if (kind === 'patch') next = pre ? `${major}.${minor}.${patch}` : `${major}.${minor}.${patch + 1}`;
  else if (kind === 'rc') {
    if (pre === 'rc') next = `${major}.${minor}.${patch}-rc.${preNum + 1}`;
    else next = `${major}.${minor}.${patch + (pre ? 0 : 1)}-rc.1`;
  } else {
    console.error('用法：bump patch|minor|major|rc');
    process.exit(2);
  }

  const prev = root.version;
  root.version = next;
  writeJson(ROOT_PKG, root);

  // 文档里的版本面一起改（README 横幅 / AGENT 汇报模板），否则 check 会红（文档漂移）。
  const readme = readText(README);
  if (readme) {
    const updatedReadme = readme.replace(/(·\s*`v)[^`\s]+(`)/, `$1${next}$2`);
    if (updatedReadme !== readme) fs.writeFileSync(README, updatedReadme, 'utf8');
  }
  const agent = readText(AGENT);
  if (agent) {
    const updatedAgent = agent.replace(/^(-\s*版本：\s*)v?[0-9][^\s]*$/m, `$1${next}`);
    if (updatedAgent !== agent) fs.writeFileSync(AGENT, updatedAgent, 'utf8');
  }

  if (readText(CHANGELOG)) {
    const log = readText(CHANGELOG);
    if (!log.includes(`## [${next}]`)) {
      const today = new Date().toISOString().slice(0, 10);
      const section = `## [${next}] - ${today}\n\n### 变更\n\n- \n\n`;
      const idx = log.indexOf('## [');
      const out = idx >= 0 ? `${log.slice(0, idx)}${section}${log.slice(idx)}` : `${log}\n${section}`;
      fs.writeFileSync(CHANGELOG, out, 'utf8');
    }
  }

  console.log(`已 bump：${prev} → ${next}`);
  console.log(`下一步：\n  1) 补 CHANGELOG 的 ${next} 小节\n  2) git add -A && git commit -m "release: v${next}"\n  3) node scripts/version.mjs tag --push`);
}

function tag() {
  const root = readJson(ROOT_PKG);
  const name = `v${root.version}`;
  const existing = git(['tag', '-l', name], { allowFail: true });
  if (existing) {
    console.log(`tag ${name} 已存在`);
  } else {
    git(['tag', '-a', name, '-m', `dsh-Dfy ${name}`]);
    console.log(`已创建 tag ${name}`);
  }
  if (argv.includes('--push')) {
    git(['push', 'origin', name]);
    console.log(`已推送 ${name}`);
  } else {
    console.log(`推送：git push origin ${name}`);
  }
}

if (cmd === 'show') show();
else if (cmd === 'check') check();
else if (cmd === 'bump') bump(argv[1]);
else if (cmd === 'tag') tag();
else {
  console.error('用法：version.mjs show|check|bump <kind>|tag [--push]');
  process.exit(2);
}
