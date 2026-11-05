// install-snowluma.mjs — 让 Agent 自动装 SnowLuma（第三方 QQ 运行时）
//
// 用法：
//   node scripts/install-snowluma.mjs                 # 已有则复用；没有则下载官方 Releases 并解压
//   node scripts/install-snowluma.mjs --dir D:\SnowLuma2
//   node scripts/install-snowluma.mjs --no-launch     # 只装不启动
//   node scripts/install-snowluma.mjs --force         # 忽略已安装，重新下载
//
// 行为：
//   1. 先用 backend/lib/snowluma-install.js 的规则检测已安装（配置路径 / 常见目录）
//   2. 没装：从 github.com/SnowLuma/SnowLuma/releases/latest 找到 Windows zip（官方 Releases）
//   3. 解压到目标目录（默认 %USERPROFILE%\SnowLuma2，路径不带中文/空格）
//   4. 把 launcherPath / allowLaunch 写进仓库根 config.json
//   5. 启动 launcher（默认；--no-launch 可跳过），剩下的只有「用户在窗口里扫码登录 QQ」
//
// 只下载官方 Releases，不碰第三方镜像；不修改任何用户数据。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
// QQ 配置在**数据根**（$DSH_HOME/surfcore/qq），与 backend/lib/paths.js、src/config-locate.js 同一公式；
// 旧布局（clone 安装、配置在仓库根）先复制过来，保证这个脚本单独跑也能读到已有配置。
const DSH_HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
const QQ_DATA_ROOT = path.join(DSH_HOME, 'surfcore', 'qq');
const CONFIG_FILE = path.join(QQ_DATA_ROOT, 'config.json');
try {
  const legacyConfig = path.join(REPO_ROOT, 'config.json');
  if (!fs.existsSync(CONFIG_FILE) && fs.existsSync(legacyConfig)) {
    fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true });
    fs.copyFileSync(legacyConfig, CONFIG_FILE);
    console.log(`[install-snowluma] 旧布局配置已复制到数据根：${CONFIG_FILE}（旧文件保持原样）`);
  }
} catch { /* 迁移失败不阻断：下面的 readConfig 会走空配置 */ }
const RELEASES_LATEST = 'https://github.com/SnowLuma/SnowLuma/releases/latest';

const argv = process.argv.slice(2);
const argValue = (name) => {
  const hit = argv.find((a) => a.startsWith(`${name}=`));
  if (hit) return hit.slice(name.length + 1);
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : '';
};
const targetDir = path.resolve(argValue('--dir') || path.join(os.homedir(), 'SnowLuma2'));
const force = argv.includes('--force');
const launch = !argv.includes('--no-launch');

// 官方发布物只有 Windows zip，解压还依赖 PowerShell 的 Expand-Archive。
// 在其它平台上直接说清楚，而不是让用户看到 zip/Expand-Archive 的费解报错。
if (process.platform !== 'win32') {
  console.error('[snowluma-install] ERROR: 本脚本只支持 Windows（SnowLuma 官方 Releases 只提供 Windows 包）。');
  console.error('  macOS/Linux 请手动安装 SnowLuma，然后在设置页「安装与维护 → 手动选择」指定目录。');
  process.exit(2);
}

const log = (msg) => console.log(`[snowluma-install] ${msg}`);

function fail(msg) {
  console.error(`[snowluma-install] ERROR: ${msg}`);
  process.exit(1);
}

/**
 * 读取仓库根 config.json。
 *
 * ⚠️ 2026-11 审查：旧实现把「文件损坏 / 不是 JSON」当成「没有文件」，返回 {}，
 * 然后 rememberInstall() 直接把 config.json **整份覆盖**成 `{snowluma:{…}}` ——
 * 用户手改出的语法错误（尾逗号、注释）会静默丢掉 dsh / biliBridge / social 等全部配置。
 * 现在：文件存在但解析失败 ⇒ 明确报错退出，先让用户修好，绝不覆盖。
 */
function readConfig() {
  if (!fs.existsSync(CONFIG_FILE)) return {};
  const text = fs.readFileSync(CONFIG_FILE, 'utf8').replace(/^\uFEFF/, '');
  if (!text.trim()) return {};
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      fail(`${CONFIG_FILE} 不是 JSON 对象；为避免覆盖你的配置，本次不做修改`);
    }
    return parsed;
  } catch (error) {
    fail(`${CONFIG_FILE} 不是合法 JSON（${error?.message ?? error}）；为避免覆盖你的配置，本次不做修改。请先修好它。`);
    return {};
  }
}

function writeConfig(cfg) {
  fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true });
  // 原子写：先写临时文件再改名，避免写到一半断电留下半份 config。
  const temporary = `${CONFIG_FILE}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(temporary, `${JSON.stringify(cfg, null, 2)}\n`, 'utf8');
    fs.renameSync(temporary, CONFIG_FILE);
  } finally {
    try { fs.rmSync(temporary, { force: true }); } catch {}
  }
}

const { findSnowLumaInstall, normalizeSnowLumaInstall } = await import(
  pathToFileURL(path.join(REPO_ROOT, 'backend', 'lib', 'snowluma-install.js')).href,
);

const cfg = readConfig();
const snowCfg = (cfg.snowluma && typeof cfg.snowluma === 'object') ? cfg.snowluma : {};

function rememberInstall(root, launcher) {
  cfg.snowluma = { ...snowCfg, launcherPath: root, allowLaunch: true };
  writeConfig(cfg);
  log(`已写入 config.json：launcherPath=${root}，allowLaunch=true`);
  log(`启动文件：${launcher}`);
}

function startLauncher(launcher) {
  if (!launch) {
    log('已跳过启动（--no-launch）；稍后在设置页点「一键开始」也会拉起它');
    return;
  }
  const dir = path.dirname(launcher);
  const base = path.basename(launcher).toLowerCase();
  try {
    if (base.endsWith('.bat')) {
      spawnSync('cmd.exe', ['/d', '/s', '/c', 'start', '""', `/d "${dir}"`, `"${launcher}"`], { stdio: 'ignore' });
    } else {
      spawnSync(launcher, [], { cwd: dir, detached: true, stdio: 'ignore' });
    }
    log('已启动 SnowLuma。请在它的窗口里扫码登录 QQ，登录完成后回设置页点「重新检测」。');
  } catch (error) {
    log(`启动失败（可在设置页点「一键开始」）：${error?.message ?? error}`);
  }
}

// ── 1. 已安装就直接复用 ────────────────────────────────────────────────────
if (!force) {
  const found = findSnowLumaInstall({ snowluma: snowCfg });
  if (found.ok) {
    log(`已检测到 SnowLuma：${found.root}`);
    rememberInstall(found.root, found.launcher);
    startLauncher(found.launcher);
    process.exit(0);
  }
  log('常见位置没有 SnowLuma，开始下载官方 Releases…');
}

// ── 2. 找最新版 Windows zip（用 releases 页面，避开 API 限流）────────────────
async function resolveLatestTag() {
  const res = await fetch(RELEASES_LATEST, { redirect: 'follow' });
  if (!res.ok) throw new Error(`打不开 Releases 页面（HTTP ${res.status}）`);
  const m = res.url.match(/\/releases\/tag\/([^/?#]+)/);
  if (!m) throw new Error(`无法从 ${res.url} 解析版本号`);
  return decodeURIComponent(m[1]);
}

async function resolveAsset(tag) {
  const page = `https://github.com/SnowLuma/SnowLuma/releases/expanded_assets/${encodeURIComponent(tag)}`;
  const res = await fetch(page, { redirect: 'follow' });
  const html = res.ok ? await res.text() : '';
  const hits = [...html.matchAll(/href="([^"]*\/releases\/download\/[^"]+\.zip)"/g)].map((m) => m[1]);
  const win = hits.find((u) => /win|windows/i.test(u)) || hits[0];
  if (win) return win.startsWith('http') ? win : `https://github.com${win}`;
  // 兜底：按官方命名规则拼
  return `https://github.com/SnowLuma/SnowLuma/releases/download/${encodeURIComponent(tag)}/SnowLuma-win-x64.zip`;
}

async function download(url, dest) {
  log(`下载：${url}`);
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok || !res.body) throw new Error(`下载失败（HTTP ${res.status}）`);
  const total = Number(res.headers.get('content-length') || 0);
  const { Readable } = await import('node:stream');
  const file = fs.createWriteStream(dest);
  let done = 0;
  let lastLog = 0;
  await new Promise((resolve, reject) => {
    Readable.fromWeb(res.body).on('data', (chunk) => {
      done += chunk.length;
      if (total && Date.now() - lastLog > 3000) {
        lastLog = Date.now();
        log(`  ${Math.round(done / 1048576)} / ${Math.round(total / 1048576)} MB`);
      }
    }).on('error', reject).pipe(file).on('finish', resolve).on('error', reject);
  });
  if (total && done < total) throw new Error(`下载不完整（${done}/${total} 字节）`);
}

function unzip(zip, dest) {
  fs.mkdirSync(dest, { recursive: true });
  const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
    `Expand-Archive -LiteralPath '${zip.replace(/'/g, "''")}' -DestinationPath '${dest.replace(/'/g, "''")}' -Force`],
  { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`解压失败：${r.stderr || r.stdout || r.status}`);
}

function flattenIfNested(dest) {
  const entries = fs.readdirSync(dest, { withFileTypes: true });
  const dirs = entries.filter((e) => e.isDirectory());
  const files = entries.filter((e) => e.isFile());
  if (dirs.length === 1 && files.length === 0) {
    const inner = path.join(dest, dirs[0].name);
    for (const name of fs.readdirSync(inner)) {
      fs.renameSync(path.join(inner, name), path.join(dest, name));
    }
    fs.rmdirSync(inner);
  }
}

// ── 3. 下载 → 解压 → 校验 ────────────────────────────────────────────────────
const tag = await resolveLatestTag();
log(`最新版本：${tag}`);
const assetUrl = await resolveAsset(tag);
const tmpZip = path.join(os.tmpdir(), `snowluma-${tag}-${Date.now()}.zip`);

try {
  await download(assetUrl, tmpZip);
  fs.mkdirSync(targetDir, { recursive: true });
  unzip(tmpZip, targetDir);
  flattenIfNested(targetDir);
} finally {
  try { fs.rmSync(tmpZip, { force: true }); } catch {}
}

const norm = normalizeSnowLumaInstall(targetDir);
if (!norm) {
  fail(`解压后没在 ${targetDir} 找到启动文件（app\\launcher.bat / launcher.bat / SnowLuma.exe）。`
    + '请用 --dir 指定别的目录，或在设置页「安装与维护 → 手动选择」');
}

log(`安装完成：${norm.root}`);
rememberInstall(norm.root, norm.launcher);
startLauncher(norm.launcher);
log('下一步：让用户在 SnowLuma 窗口扫码登录 QQ；然后设置页点「一键开始」或「重新检测」。');
