/**
 * 路径与运行环境解析（合体插件唯一入口）。
 *
 * 两类根，不能混：
 *   · **代码根**（只读）：`PLUGIN_ROOT`（包内 backend/）、`QQBOT_ROOT`（包根 / clone 的仓库根）。
 *     config.example.json、roles 模板、tools、assets、platforms 都从这里读。
 *   · **数据根**（可写）：`DATA_ROOT = $DSH_HOME/surfcore/qq`。QQ 的 config.json / state /
 *     roles / pet 全部落这里。
 *
 * 为什么改（2026-11 公共分发改造）：旧实现把 config.json / state 放在仓库根。标准 DSH 安装
 * （`dsh plugin add github:…` → <profile>/node_modules/dsh-dfy）里包目录只读，旧实现会把数据
 * 写进 node_modules（或被 npm 清掉）。数据根与合体层的 `STATE_DIR/config.json` 刻意分开
 * （后者是 UNIFIED_FILE），避免两份配置互相覆盖。
 *
 * 旧布局（clone 安装、数据还躺在仓库根）由 `migrateLegacyData()` 在模块初始化时**只复制、
 * 不删除**地搬到数据根；迁移失败不阻断启动（旧布局会继续以数据根为准，旧文件仍在原处）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DSH_HOME as SHARED_DSH_HOME,
  HOME as SHARED_HOME,
  QQ_CONFIG_FILE,
  QQ_DATA_ROOT,
  QQ_PET_DIR,
  QQ_ROLES_DIR,
  QQ_STATE_DIR as DATA_STATE_DIR,
  migrateLegacyQqData,
} from '../../src/config-locate.js';

export const PLUGIN_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const HOME = SHARED_HOME;
export const DSH_HOME = SHARED_DSH_HOME;
export const STATE_DIR = path.join(DSH_HOME, 'surfcore');
export const BACKUP_DIR = path.join(STATE_DIR, 'backups');
export const MEMORY_DIR = path.join(STATE_DIR, 'memory');
export const AUDIT_LOG = path.join(STATE_DIR, 'audit.jsonl');
export const UNIFIED_FILE = path.join(STATE_DIR, 'config.json');
export const ALIGN_FILE = path.join(STATE_DIR, 'alignments.json');
export const CANDIDATE_FILE = path.join(STATE_DIR, 'align-candidates.json');
export const PLUGIN_LOG = path.join(STATE_DIR, 'plugin.log');
export const BRIDGE_SUPERVISOR_LOG = path.join(STATE_DIR, 'bridge-supervisor.log');

const ROOT_CANDIDATES = [
  // 显式覆盖优先（多实例 / 桥接不在本仓库旁边时用）。
  process.env.SURFCORE_ROOT,
  process.env.SURFCORE_QQBOT_ROOT,
  // 兼容迁移前的旧环境变量名。
  process.env.QQBILI_QQBOT_ROOT,
  // 单仓库布局：<dsh-dfy>/backend/lib/paths.js → 仓库根就是 backend 的上一级
  path.resolve(PLUGIN_ROOT, '..'),
  // 旧布局兼容：<repo>/plugins/surfcore/lib/paths.js
  path.resolve(PLUGIN_ROOT, '..', '..'),
  path.resolve(PLUGIN_ROOT, '..', '..', '..'),
  process.cwd(),
].filter(Boolean);

function looksLikeQqbotRoot(dir) {
  try {
    return fs.existsSync(path.join(dir, 'config.json')) && fs.existsSync(path.join(dir, 'src', 'bridge.js'));
  } catch {
    return false;
  }
}

// 代码根：包根 / clone 的仓库根。QQBOT_ROOT 保留原语义（bridge 源码、scripts、tools 所在），
// 探针失败（标准 DSH 安装的包内没有 config.json）时兜底到包根。
// ⚠️ 它**不再**是数据目录——config/state/roles/pet 见下面的 DATA_ROOT。
export const QQBOT_ROOT = ROOT_CANDIDATES.find(looksLikeQqbotRoot) || path.resolve(PLUGIN_ROOT, '..');

/** QQ 数据根（可写）：$DSH_HOME/surfcore/qq。config/state/roles/pet 全在这里。 */
export const DATA_ROOT = QQ_DATA_ROOT;
/** 桌宠数据目录（host.json / qq-feed.json / voice…）。 */
export const PET_DATA_DIR = QQ_PET_DIR;
export const QQ_CONFIG = QQ_CONFIG_FILE;
// 模板永远在**代码根**：标准安装是 <profile>/node_modules/dsh-dfy/config.example.json，
// clone 安装是仓库根；旧布局（plugins/surfcore）两者可能不同，所以按「包根 → QQBOT_ROOT」找。
const EXAMPLE_CANDIDATES = [
  path.join(PLUGIN_ROOT, '..', 'config.example.json'),
  path.join(QQBOT_ROOT, 'config.example.json'),
];
export const QQ_CONFIG_EXAMPLE = EXAMPLE_CANDIDATES.find((file) => { try { return fs.existsSync(file); } catch { return false; } }) || EXAMPLE_CANDIDATES[1];
export const QQ_STATE_DIR = DATA_STATE_DIR;
export const QQ_PERSONA_DIR = QQ_ROLES_DIR;
// 新用户没配置 persona.file 时的兜底路径；已有 roles/*.md 时由 resolvePersonaFile() 自动发现。
export const DEFAULT_PERSONA_FILE = path.join(QQ_PERSONA_DIR, '角色卡.md');
export const QQ_ALIGNMENT_BRIEF = path.join(QQ_STATE_DIR, 'alignment-brief.md');
export const QQ_ACTIVITY_LOG = path.join(QQ_STATE_DIR, 'qq-activity.log');
export const QQ_BRIDGE_LOG = path.join(QQ_STATE_DIR, 'bridge.log');
export const QQ_LOCK_FILE = path.join(QQ_STATE_DIR, 'bridge.lock');

// ── 旧布局迁移（2026-11 公共分发改造）────────────────────────────────────────
// 实现放在 src/config-locate.js（桥接进程也要用同一份，避免两份迁移逻辑漂移）；
// 这里只负责：模块初始化时跑一次 + 把结果写进插件日志。
let legacyMigrationDone = false;

function migrationLog(message) {
  try {
    fs.mkdirSync(STATE_DIR, { recursive: true });
    fs.appendFileSync(PLUGIN_LOG, `[${new Date().toISOString()}] [paths] ${message}\n`);
  } catch {}
}

/**
 * 旧布局 → 数据根迁移（幂等）。由 `ensureDirs()` 触发（插件 apply 的第一件事就是它），
 * 也可以从测试/脚本里手动调。语义见 src/config-locate.js 的 migrateLegacyQqData：
 * 只补齐缺失文件，失败不阻断。
 *
 * 为什么不在**模块初始化**时跑：backend/lib/paths.js 会被各种工具/脚本 import（查路径、
 * 跑单测…），模块初始化就写用户真实 ~/.dsh 太越界；ensureDirs() 是"确实要开始用了"的信号。
 * 单独启动桥接时由 src/bridge.js 自己调一次（它在读 config 之前必须完成迁移）。
 * @returns {{copied: string[]}}
 */
export function migrateLegacyData() {
  if (legacyMigrationDone) return { copied: [] };
  legacyMigrationDone = true;
  return migrateLegacyQqData({ log: migrationLog });
}

// B站数据也收进 SurfCore 自己的状态目录，和 QQ 共用同一个根。
export const BILI_DIR = path.join(STATE_DIR, 'bili');
export const BILI_CONFIG = path.join(STATE_DIR, 'bili.config.json');
export const BILI_CRED = path.join(BILI_DIR, 'credentials.json');
// 主人（用户本人）的 B站 凭据：只用于「一键抓取偏好」的只读扫描，绝不用于发评论/动态。
// 单独一个文件，避免和鱼自己的 cookie 混在一起（身份串号是事故）。
export const OWNER_BILI_CRED = path.join(BILI_DIR, 'owner-credentials.json');
export const BILI_AI_DIR = BILI_DIR;
export const BILI_TOOLS_DIR = path.join(PLUGIN_ROOT, 'tools');
export const BILI_MJS = path.join(BILI_TOOLS_DIR, 'bili.mjs');
export const QQ_FOR_BILI_FILE = path.join(MEMORY_DIR, 'qq-for-bili.md');
export const BILI_FOR_QQ_FILE = path.join(MEMORY_DIR, 'bili-for-qq.md');
export const BILI_ALIGNMENT_FILE = path.join(MEMORY_DIR, 'alignment-for-bili.md');
// 记忆卡：唯一真相 memory-card.json；memory-card.md 给人看；两份 prompt 文件是
// QQ / B站 每次注入时读的裁剪版（桥接和调度器都不需要解析 JSON）。
export const MEMORY_CARD_JSON = path.join(MEMORY_DIR, 'memory-card.json');
export const MEMORY_CARD_MD = path.join(MEMORY_DIR, 'memory-card.md');
export const MEMORY_CARD_PROMPT_QQ = path.join(MEMORY_DIR, 'memory-card-prompt-qq.md');
export const MEMORY_CARD_PROMPT_BILI = path.join(MEMORY_DIR, 'memory-card-prompt-bili.md');
export const MEMORY_CARD_INBOX = path.join(MEMORY_DIR, 'memory-inbox.jsonl');
// 全量记忆卡：只存档（全部清晰、永不遗忘），**不生成 prompt 文件**——
// QQ / B站 平时只加载上面两份来自衰减卡的注入块。
// 存储是 append-only JSONL + stats；10GB 级不读整份、不重写。
export const MEMORY_CARD_FULL_JSONL = path.join(MEMORY_DIR, 'memory-card-full.jsonl');
export const MEMORY_CARD_FULL_STATS = path.join(MEMORY_DIR, 'memory-card-full-stats.json');
export const MEMORY_CARD_FULL_JSON = path.join(MEMORY_DIR, 'memory-card-full.json'); // 旧版，迁移后 .legacy
export const MEMORY_CARD_FULL_MD = path.join(MEMORY_DIR, 'memory-card-full.md');

export const PLATFORM_DIR = path.join(PLUGIN_ROOT, 'platforms');

export function ensureDirs() {
  // 先迁移（只补缺失文件、不阻断失败），再建目录：标准 DSH 安装第一次启动靠它把
  // 模板 config.json / roles 复制进可写的数据根。
  migrateLegacyData();
  // DATA_ROOT / QQ_STATE_DIR / QQ_PERSONA_DIR / PET_DATA_DIR 都是新的可写数据根；
  // index.js 启动时也会调这里，标准 DSH 安装靠它把数据目录建出来。
  for (const dir of [STATE_DIR, BACKUP_DIR, MEMORY_DIR, DATA_ROOT, QQ_STATE_DIR, QQ_PERSONA_DIR, PET_DATA_DIR, BILI_DIR]) {
    try { fs.mkdirSync(dir, { recursive: true }); } catch {}
  }
}

/** 真 node.exe（Electron 的 process.execPath 是 Harness.exe，跑不了部分脚本）。 */
export function findNodeExe() {
  const candidates = [
    process.env.DSH_NODE,
    path.join(DSH_HOME, 'dsh-runtimes', 'dsh-primary-runtime', 'dependencies', 'node', 'bin', 'node.exe'),
    path.join(HOME, '.dsh', 'dsh-runtimes', 'dsh-primary-runtime', 'dependencies', 'node', 'bin', 'node.exe'),
    'C:\\Program Files\\nodejs\\node.exe',
  ];
  for (const candidate of candidates) {
    try { if (candidate && fs.existsSync(candidate)) return candidate; } catch {}
  }
  return process.execPath;
}

export function maskPath(input) {
  let text = String(input ?? '');
  try {
    if (DSH_HOME) text = text.split(DSH_HOME).join('$DSH_HOME');
    if (HOME) text = text.split(HOME).join('%USERPROFILE%');
    text = text.replace(/[A-Za-z]:\\Users\\[^\\/]+/g, '%USERPROFILE%');
  } catch {}
  return text;
}
