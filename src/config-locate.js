/**
 * QQ 配置 / 数据根的**唯一**定位实现。
 *
 * 为什么要单独一个文件：QQ 这条链路有四个独立的进程/模块都要找 config.json——
 *   · 宿主插件（backend/lib/paths.js，以及它引出的 store/调度器…）
 *   · 内嵌桥接（src/bridge.js，跑在宿主进程里但自己解析一遍路径）
 *   · 三个 MCP 子进程（src/mcp-snowluma-safe.js / mcp-host-server.js / mcp-web-search-safe.js）
 *   · 安装脚本（scripts/setup-dsh.mjs / install-snowluma.mjs）
 * 以前每处各写一份「`path.resolve(__dirname, '..')/config.json`」，在「clone 到仓库根」的
 * 安装方式下恰好都对；但标准 DSH 安装（`dsh plugin add github:…` → <profile>/node_modules/dsh-dfy）
 * 里包目录是**只读**的，把 config/state 写进包目录会直接失败（或写进 node_modules 被清掉）。
 *
 * 所以分成两个根：
 *   · 代码根 PACKAGE_ROOT：只读。config.example.json / roles 模板 / public / assets / tools。
 *   · 数据根 QQ_DATA_ROOT：可写。$DSH_HOME/surfcore/qq（不占用已有的 surfcore/config.json，
 *     那是合体层的 UNIFIED_FILE）。
 *
 * 旧布局（数据在仓库根）的数据由 backend/lib/paths.js 的 migrateLegacyData() 复制到数据根；
 * 只读消费者（MCP 子进程）在「插件还没启动、数据还没迁」的窗口里用 effectiveQqConfigFile()
 * 回退读旧位置，保证升级瞬间不掉配置。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** 代码根（= npm 包根 = clone 安装的仓库根），只读。 */
export const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const HOME = process.env.USERPROFILE || os.homedir();
/** DSH 根：桌面版 ~/.dsh，网页版可能是 ~/.dsh-web（由宿主环境变量决定）。 */
export const DSH_HOME = process.env.DSH_HOME || path.join(HOME, '.dsh');
export const SURFCORE_DIR = path.join(DSH_HOME, 'surfcore');
/** QQ 数据根（可写）：config.json / state / roles / pet 都放这里。 */
export const QQ_DATA_ROOT = path.join(SURFCORE_DIR, 'qq');
export const QQ_CONFIG_FILE = path.join(QQ_DATA_ROOT, 'config.json');
export const QQ_STATE_DIR = path.join(QQ_DATA_ROOT, 'state');
export const QQ_ROLES_DIR = path.join(QQ_DATA_ROOT, 'roles');
export const QQ_PET_DIR = path.join(QQ_DATA_ROOT, 'pet');

function isDirSafe(dir) {
  try { return fs.statSync(dir).isDirectory(); } catch { return false; }
}
function fileExistsSafe(file) {
  try { return fs.existsSync(file); } catch { return false; }
}

/**
 * 旧布局数据根（clone 安装时的仓库根）候选。
 * 判据与 backend/lib/paths.js 的历史探针一致：同时有 config.json 和 src/bridge.js。
 * 环境变量优先（多实例 / 桥接不在包旁边时用）。
 */
export function legacyQqRoot() {
  const candidates = [
    process.env.SURFCORE_ROOT,
    process.env.SURFCORE_QQBOT_ROOT,
    process.env.QQBILI_QQBOT_ROOT,
    PACKAGE_ROOT,
    path.resolve(PACKAGE_ROOT, '..'),
  ];
  const seen = new Set();
  for (const raw of candidates) {
    if (!raw) continue;
    let dir = '';
    try { dir = path.resolve(String(raw)); } catch { continue; }
    if (seen.has(dir)) continue;
    seen.add(dir);
    if (fileExistsSafe(path.join(dir, 'config.json')) && fileExistsSafe(path.join(dir, 'src', 'bridge.js'))) return dir;
  }
  return '';
}

/**
 * 读 QQ config 时实际该打开的文件：数据根优先；数据根还没有（插件尚未跑迁移）时
 * 回退到旧布局的仓库根。只用于**读**；写一律写 QQ_CONFIG_FILE（数据根）。
 */
export function effectiveQqConfigFile() {
  if (fileExistsSafe(QQ_CONFIG_FILE)) return QQ_CONFIG_FILE;
  const legacy = legacyQqRoot();
  if (legacy) {
    const legacyConfig = path.join(legacy, 'config.json');
    if (fileExistsSafe(legacyConfig)) return legacyConfig;
  }
  return QQ_CONFIG_FILE;
}

/** 迁移时需要准备的目录（数据根 + 四个子目录）。 */
export const QQ_DATA_DIRS = Object.freeze([QQ_DATA_ROOT, QQ_STATE_DIR, QQ_ROLES_DIR, QQ_PET_DIR]);

function copyTreeMissing(src, dst) {
  let copied = 0;
  let entries = [];
  try { entries = fs.readdirSync(src, { withFileTypes: true }); } catch { return 0; }
  for (const entry of entries) {
    const from = path.join(src, entry.name);
    const to = path.join(dst, entry.name);
    if (entry.isDirectory()) { copied += copyTreeMissing(from, to); continue; }
    if (!entry.isFile() || fileExistsSafe(to)) continue;
    try { fs.mkdirSync(path.dirname(to), { recursive: true }); fs.copyFileSync(from, to); copied += 1; } catch {}
  }
  return copied;
}

/**
 * 复制一个「目标还不存在」的文件（config.json 专用）。
 * 用 临时文件 + rename：迁移可能被两个进程（桌面版 + 网页版 / 插件 + 单独桥接）同时触发，
 * 直接 copyFileSync 会让读侧有机会读到半份 config.json（里面是 QQ 凭据/白名单）。
 */
function copyFileMissing(src, dst) {
  if (fileExistsSafe(dst)) return false;
  const tmp = `${dst}.${process.pid}.${Date.now()}.migrating.tmp`;
  try {
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(src, tmp);
    // 竞争时让位：另一个进程已经落好目标文件，就丢掉自己的临时副本。
    if (fileExistsSafe(dst)) { try { fs.unlinkSync(tmp); } catch {} return false; }
    fs.renameSync(tmp, dst);
    return true;
  } catch {
    try { fs.unlinkSync(tmp); } catch {}
    return false;
  }
}

/**
 * 旧布局 → 数据根迁移（**幂等**）：只补齐数据根里缺失的文件，不删除/不覆盖旧目录。
 *
 * 宿主插件（backend/lib/paths.js）与内嵌桥接（src/bridge.js）都会在模块初始化时调一次：
 *   · 插件先启动 → 这里完成迁移；桥接再调一次是空操作（文件已存在）。
 *   · 只有桥接被单独启动（旧用法 / 排障）→ 这里也能把旧数据准备好，不会"配置看起来空了"。
 *
 * 失败绝不抛：最坏情况是这次没迁成功（旧文件仍在原处），下次启动再试。
 * @param {{log?: (message: string) => void}} [opts]
 * @returns {{copied: string[]}}
 */
export function migrateLegacyQqData({ log = () => {} } = {}) {
  const copied = [];
  try {
    const legacy = legacyQqRoot();
    // 1) 旧布局的 config.json
    if (!fileExistsSafe(QQ_CONFIG_FILE)) {
      const legacyConfig = legacy ? path.join(legacy, 'config.json') : '';
      if (legacyConfig && fileExistsSafe(legacyConfig) && copyFileMissing(legacyConfig, QQ_CONFIG_FILE)) {
        copied.push(`config.json ← ${legacy}`);
      }
    }
    // 2) 旧布局的 state/ roles/ pet/
    if (legacy) {
      for (const sub of ['state', 'roles', 'pet']) {
        const from = path.join(legacy, sub);
        if (!isDirSafe(from)) continue;
        const n = copyTreeMissing(from, path.join(QQ_DATA_ROOT, sub));
        if (n) copied.push(`${sub}/（${n} 个文件）← ${legacy}`);
      }
    }
    // 3) 2026-11-04 之前的桌宠数据位置：合体层 $DSH_HOME/surfcore/pet
    const unifiedPet = path.join(SURFCORE_DIR, 'pet');
    if (isDirSafe(unifiedPet)) {
      const n = copyTreeMissing(unifiedPet, QQ_PET_DIR);
      if (n) copied.push(`pet/（${n} 个文件）← ${unifiedPet}`);
    }
    // 4) 首次安装：没有 config.json → 用模板生成；roles 模板补进数据根（只补缺失文件）
    const example = path.join(PACKAGE_ROOT, 'config.example.json');
    if (!fileExistsSafe(QQ_CONFIG_FILE) && fileExistsSafe(example)) {
      if (copyFileMissing(example, QQ_CONFIG_FILE)) copied.push('config.json（模板）');
    }
    const rolesTemplate = path.join(PACKAGE_ROOT, 'roles');
    if (isDirSafe(rolesTemplate)) {
      const n = copyTreeMissing(rolesTemplate, QQ_ROLES_DIR);
      if (n) copied.push(`roles/（${n} 个模板文件）`);
    }
    if (copied.length) {
      try { log(`旧数据已准备到 ${QQ_DATA_ROOT}：${copied.join('、')}（旧目录保持原样，仅复制）`); } catch {}
    }
  } catch (error) {
    try { log(`迁移跳过（不阻断启动）：${String(error?.message ?? error)}`); } catch {}
  }
  return { copied };
}

export { isDirSafe, fileExistsSafe };
