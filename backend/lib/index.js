/**
 * surfcore —— 宿主半边（设置窗口的唯一后端）。
 *
 * 它把原来两个插件的能力装进一个进程：
 *   · QQ 侧：读/写 <surfcore>/config.json、桥接探活/启停/重启、模式与 ownerQQ、
 *            白名单、social/socialV2/chat/slang/webSearch 等全部参数；
 *   · B站侧：读/写 ~/.dsh/surfcore/bili.config.json、cookie 写入、依赖体检、
 *            待审回复、通知测试、生物钟（scheduler.js）；
 *   · 合体层：统一人设卡、QQ→B站 脱敏记忆、身份对齐、扩展接口、平台适配器
 *            （qq/bili 内置，tieba 预留）。
 *
 * 安全：
 *   · 所有路由只接受本机回环 + DSH connection.requestRejection；
 *   · 写操作要求 application/json，且 Origin（若有）必须同源；
 *   · 读配置脱敏（********），保存时 ******** 表示保持原值；
 *   · 每次写文件前备份到 ~/.dsh/surfcore/backups/。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { execFile, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  ALIGN_FILE, BACKUP_DIR, BILI_AI_DIR, BILI_ALIGNMENT_FILE, BILI_CONFIG, BILI_CRED, BILI_DIR, BILI_MJS,
  BILI_TOOLS_DIR, DATA_ROOT, DSH_HOME, MEMORY_DIR, PLUGIN_ROOT, PLUGIN_LOG, QQ_ALIGNMENT_BRIEF,
  QQ_CONFIG, QQBOT_ROOT, STATE_DIR, TIEBA_MJS, UNIFIED_FILE, ensureDirs, findNodeExe, maskPath,
} from './paths.js';
import { resolvePersonaFile } from './persona.js';
import { discoverSnowLumaConnection, readOneBotTokens, snowLumaHomeCandidates } from '../../src/snowluma-conn.js';
import { findSnowLumaInstall as findSnowLumaInstallIn, normalizeSnowLumaInstall, snowLumaMissingReport } from './snowluma-install.js';
import { buildInstallChecks, installOk, planDoctorFix } from './doctor.js';
import {
  autoSnapshot, beforeSwitchSnapshot, characterDetail, characterOverview, createCharacterFromPayload,
  deleteCharacter, manualSnapshot, migrateIfNeeded, restoreCharacterSnapshot, switchToCharacter,
  updateCharacterFromPayload,
} from './characters.js';
import { activeMemoryPaths, activePersonaLayers, activePlatformStateDir, readCurrentCharacter, touchCharacter } from '../../src/character-persona.js';
import { automationSnapshot } from './automation.js';
import {
  clearTiebaCredentials, markTiebaVerified, readTiebaCredentials, readTiebaViewHistory,
  resolveTiebaAuth, saveTiebaCookieLogin, tiebaAction, tiebaConfig, tiebaStatus,
  verifyStoredTiebaCredentials,
} from './tieba.js';
import { cancelTiebaQrLogin, pollTiebaQrLogin, startTiebaQrLogin } from './tieba-qr-login.mjs';
import {
  configureDouyinChatModel, configureDouyinLog, disposeDouyin, douyinAutoTick, douyinChatConfigure,
  douyinChatContacts, douyinChatEnable, douyinChatMinimize, douyinChatModels, douyinChatRead, douyinChatRecover, douyinChatResume, douyinChatSetModel, douyinChatSetup, douyinChatStart, douyinChatStatus, douyinChatStop,
  douyinComments, douyinCurrent, douyinDebrief, douyinNext, douyinNotices,
  douyinOpen,
  douyinSearch, douyinStart, douyinStatus, douyinStop, douyinSummary, douyinSyncPolicy,
  readDouyinHistory,
} from './douyin.js';
import {
  configureDouyinIm, configureDouyinImLog, disposeDouyinIm, douyinImContacts,
  douyinImLoginQr, douyinImLoginSms, douyinImLogout, douyinImSaveConfig, douyinImSelftest, douyinImStart, douyinImStatus,
  douyinImStop, douyinImSubmitSms, scheduleDouyinImResume, scheduleDouyinImSelftest,
} from './douyin-im.js';
import {
  backupFile, configDefaults, listBackups, pathSummary,
  readAll, readBiliConfig, readJson, readQqConfig, readUnified,
  saveBiliConfig, saveQqConfig, saveUnified, writeJsonAtomic, writeTextAtomic,
} from './store.js';
import {
  PRIVACY_POLICY_VERSION, explainText, scanText,
} from './privacy.js';
import {
  addLink, approveCandidate, exportAlignments, importAlignments, listCandidates,
  listLinks, rejectCandidate, removeLink, stats as alignStats,
  updateLink, writeAlignmentBriefs,
} from './align.js';
import {
  auditTail, biliToQqStatus, memoryStatus, previewQqForBili, rebuildAllPrompts,
  refreshBiliToQq, scanBiliFeedForCandidates, scanQqFeedForCandidates,
  syncQqToBili,
} from './memory.js';
import {
  bridgeLogTail, callBridge, restart as restartBridge, start as startBridge,
  status as bridgeStatus, stop as stopBridge,
  consoleBase, consoleToken } from './bridge.js';
import { PlatformRegistry } from './platforms.js';
import { contentTypeRejection, isLoopbackReq, json, readBody, readJsonBody, sameOrigin } from './http-guard.js';
import { startScheduler } from './scheduler.js';
import { createTokenBudgetService } from './token-budget.js';
import { scanPluginCompatibility } from './compat.js';
import { createGateEventStore } from '../../src/gate-events.js';
import { normalizeAllowlist } from '../../src/allowlist.js';
import { createPetService } from './pet.js';
import { createPetChatService } from './pet-chat.js';
import { createPetPurposeService } from './pet-purpose.js';
import { createPetApiService } from './pet-api.js';
import { createUpdatesService, resumePendingApply, sanitizeComponentId } from './updates.js';
import { createSnowLumaWebuiClient } from './snowluma-webui.js';
import {
  adminFromSources, adminSummary, normalizeAdmin, projectAdminSave,
} from '../../src/admin-identity.js';
import {
  applyMemoryCardAction, compactMemoryCardNow, fullMemoryCardSnapshot, memoryCardIdle, memoryCardSnapshot,
  memoryCardStatusNow, notifyOwnerIfNeeded, restoreMemoryCardBackup, runMemoryCardMaintenance,
  startMemoryCardTimer,
} from './memory-card.js';
import { readWatchHistory } from '../tools/lib/watch-history.mjs';
import { enrichWatchHistory } from '../tools/lib/watch-actions.mjs';
import { scanPreferences } from '../tools/lib/pref-scan.mjs';
import {
  cancelQrLogin, closeAllQrLogins, pollQrLogin, readFishAccount, readOwnerAccount, startQrLogin, verifyStoredCredentials,
} from './bili-qr-login.mjs';
import { fishGuardStateSummary } from '../tools/lib/fish-guard.mjs';
import { summarizeQqFishGuard } from './qq-fish-guard.js';
import { applySessionPermission } from './scheduler.js';
import { fileStamp, isStale } from '../../src/config-stamps.js';
import { createContextTelemetry } from '../../src/context-telemetry.js';
import { createBillingService } from './billing.js';
import { createPersonaClassifier } from './persona-classify.js';
import { personaSnapshot, setPersonaMood, setPersonaQuirks } from '../../src/persona-state.js';
import { createLearningLoop } from './learning-loop.js';
import { createMemoryOrganizer } from './memory-organize.js';
import { rollbackAutoPersona } from '../../src/learning-profile.js';

// 版本号对外只有一个来源：合并后的 dsh-Dfy 主包（plugins/surfcore-next/package.json）。
// surfcore 现在只是被 dsh-Dfy 复用的后端库，它自己的 package.json 版本不再对外展示；
// 读不到 dsh-Dfy 时才回落到仓库根 package.json（离线/拆包场景）。
function readOwnVersion() {
  try {
    const here = path.dirname(fileURLToPath(import.meta.url)); // backend/lib（单仓库布局）
    // 合并后版本号以 dsh-Dfy 主包为准（surfcore 只是被复用的后端库）。
    // 旧布局的 `plugins/surfcore-next/package.json` 已并入单仓库，保留一级旧路径兜底；
    // 读不到时回落到仓库根 package.json（离线 / 拆包场景）。
    const candidates = [
      path.resolve(here, '../../surfcore-next/package.json'),
      path.resolve(here, '../../package.json'),
    ];
    for (const rootPkg of candidates) {
      try {
        const v = JSON.parse(fs.readFileSync(rootPkg, 'utf8')).version;
        if (v) return v;
      } catch {}
    }
  } catch {}
  return '0.0.0-dev';
}

const VERSION = readOwnVersion();
const API_PREFIX = '/dsh-surfcore/api';
const HERE = path.dirname(fileURLToPath(import.meta.url));

const pluginLog = (...args) => {
  const line = `[${new Date().toISOString()}] ${args.map((a) => typeof a === 'string' ? a : JSON.stringify(a)).join(' ')}\n`;
  try {
    fs.mkdirSync(STATE_DIR, { recursive: true });
    // 2026-10-22 审计：只 append 不轮转会无限增长。超过 2MB 就滚一份 .1（保留一代）。
    try {
      const stat = fs.statSync(PLUGIN_LOG);
      if (stat.size > 2 * 1024 * 1024) fs.renameSync(PLUGIN_LOG, `${PLUGIN_LOG}.1`);
    } catch {}
    fs.appendFileSync(PLUGIN_LOG, line);
  } catch {}
  try { console.log(`[surfcore] ${args.join(' ')}`); } catch {}
};

function safeBackupName(name) {
  const base = path.basename(String(name ?? ''));
  if (!base || base !== String(name)) return '';
  return base;
}

// ── 组件更新目录的「预期范围」────────────────────────────────────────────────
// 内建组件（surfcore 本体）与随插件安装的东西都在 DSH_HOME / 插件目录 / 仓库根下；
// 用户自定义组件的 dir 允许任意路径（产品设定），但自动更新会往那个目录 robocopy 覆盖，
// 所以要**告警一次**让人看见，而不是静默写入。（2026-11 收尾审计 P3）
const UPDATE_DIR_EXPECTED_ROOTS = [DSH_HOME, PLUGIN_ROOT, path.resolve(PLUGIN_ROOT, '..')];
const updateDirWarned = new Set();
function updateDirInExpectedRoots(dir) {
  let abs = '';
  try { abs = path.resolve(String(dir ?? '')); } catch { return false; }
  const norm = (value) => (process.platform === 'win32' ? value.toLowerCase() : value);
  const target = norm(abs);
  return UPDATE_DIR_EXPECTED_ROOTS.some((root) => {
    let resolved = '';
    try { resolved = path.resolve(root); } catch { return false; }
    const base = norm(resolved);
    return target === base || target.startsWith(base.endsWith(path.sep) ? base : `${base}${path.sep}`);
  });
}

function readTextFile(file, fallback = '') {
  try { return fs.readFileSync(file, 'utf8'); } catch { return fallback; }
}

/** 只读文件尾部（默认 512KB）：日志接口不能因为日志变大就一次读进内存。 */
function readTextTail(file, maxBytes = 512 * 1024) {
  try {
    const stat = fs.statSync(file);
    const start = Math.max(0, stat.size - maxBytes);
    const fd = fs.openSync(file, 'r');
    try {
      const buf = Buffer.alloc(stat.size - start);
      fs.readSync(fd, buf, 0, buf.length, start);
      return buf.toString('utf8');
    } finally { fs.closeSync(fd); }
  } catch { return ''; }
}

function mtimeIso(file) {
  try { return fs.statSync(file).mtime.toISOString(); } catch { return null; }
}

function fileInfo(file) {
  try {
    const stat = fs.statSync(file);
    return { exists: true, bytes: stat.size, mtime: stat.mtime.toISOString() };
  } catch {
    return { exists: false, bytes: 0, mtime: null };
  }
}

function parseModeState() {
  const local = readJson(path.join(QQ_STATE_DIR(), 'mode.json'), {}) ?? {};
  return { localMode: local.mode ?? null, localRole: local.role ?? null };
}

function QQ_STATE_DIR() {
  return path.join(path.dirname(QQ_CONFIG), 'state');
}

export const name = 'surfcore';
export const inject = ['webServer', 'connection', 'sessionController'];

export function apply(ctx) {
  ensureDirs();

  // 上次的"退出后应用"可能没跑起来（Electron 宿主没带 ELECTRON_RUN_AS_NODE）：
  // 这里重新排队，用户下次退出 DSH 就会应用（2026-10-28 反馈：点几次都还是旧版本）。
  try { resumePendingApply({ stateDir: STATE_DIR, pluginLog }); } catch (error) { pluginLog('[updates] 启动重试失败：', String(error?.message ?? error)); }

  // 2026-10-22 起：`surface_core` 迁移期的一次性逻辑**已整段删除**。
  // 原因：当年为了把旧工作区改名，留了「有 .legacy-workspace 标记就删/移旧目录」的代码；
  // 这类「启动时按标记动用户目录」的代码风险远大于收益（误删不可逆），迁移也早已完成。
  // 现在的约定：插件**不碰**任何工作区目录；清理旧目录一律由人工或用脚本先备份再动。
  // 相关事故与处置见 docs/PITFALLS.md #1/#3。

  const platforms = new PlatformRegistry();
  platforms.setStatus('qq', () => bridgeStatus());
  platforms.setStatus('bili', () => biliToQqStatus());
  platforms.setStatus('tieba', () => tiebaStatus());
  // 抖音：只把「总开关 / 现在能不能刷 / 窗口在不在」带回概览，详细状态在设置页读。
  configureDouyinLog((message) => pluginLog(message));
  let llmService = null;
  let defaultModelService = null;
  try {
    const getService = (name) => { try { return ctx.get?.(name); } catch { return undefined; } };
    llmService = getService('llm');
    defaultModelService = getService('agentDefaultModel');
    configureDouyinChatModel({
      llm: llmService,
      attachments: getService('attachments'),
      getSelection: () => {
        try { return defaultModelService?.currentSelection?.() ?? {}; } catch { return {}; }
      },
      // 抖音回复走 DSH 会话（和 QQ 一样，侧栏能看到思考）；服务缺失时自动退回直连模型。
      sessionController: getService('sessionController'),
    });
  } catch { /* 模型服务缺失时只保留只读能力 */ }
  // 抖音私信：douyin-im 长连接（不需要浏览器），回复同样走 DSH 会话。
  configureDouyinImLog((message) => pluginLog(message));
  try {
    configureDouyinIm({ ctx });
  } catch (error) { pluginLog('[抖音IM] 插件上下文注入失败：', String(error?.message ?? error).slice(0, 160)); }
  platforms.setStatus('douyin', async () => {
    const status = await douyinStatus();
    return {
      ok: status.ok,
      enabled: status.config.enabled,
      allowed: status.policy?.allowed ?? false,
      reason: status.policy?.reason ?? status.policyError ?? '',
      watching: status.watching,
      browser: status.browser?.running ? 'running' : 'stopped',
    };
  });

  let scheduler = null;
  let schedulerStatus = { running: false, startedAt: null, lastError: null, lastTickAt: null };
  let syncTimer = null;
  let memoryCardTimer = null;
  let memoryOrganizeTimer = null;
  let characterTimer = null;

  // ── 每日 token 额度 / 用量采集（2026-10-23 用户要求）────────────────────
  // 插件是唯一能同时看到 QQ、B站、黑话学习会话的地方：用 session/event 实时累计，
  // 设置页展示、B站 调度器拦截、QQ 桥接（读 daily 快照）都共用这一份。
  const tokenBudget = createTokenBudgetService({
    ctx,
    dshHome: DSH_HOME,
    qqStateDir: QQ_STATE_DIR(),
    getQqConfig: () => readQqConfig().config,
    log: (message) => pluginLog(message),
  });
  // 闸门事件中心：桥接负责写，插件负责展示/确认；同一份文件、同一套分级。
  const gateEvents = createGateEventStore({ dir: STATE_DIR, log: (message) => pluginLog(message) });
  // ── 桌宠载体：只探测 dsh-Dfy 插件是否装着/在用 ─────
  const petService = createPetService({ stateDir: STATE_DIR });
  // 桌宠对话与「目的机制」的桌宠载体：和 QQ / B站 共用当前角色的人格卡、记忆卡、目的状态。
  // Phase 0A：旁路遥测（只读事件，不改 prompt/工具/会话行为）。
  const contextTelemetry = createContextTelemetry({
    file: path.join(STATE_DIR, 'context-telemetry-plugin.jsonl'),
    source: 'plugin',
    log: (message) => pluginLog(message),
  });
  // A+B 账单：每 10 分钟刷新到 ~/.dsh/surfcore/billing；只读，不调用模型。
  const personaClassifier = createPersonaClassifier({ ctx, log: (message) => pluginLog(message), tokenBudget });

  const billing = createBillingService({
    stateDir: STATE_DIR,
    // 账单读的是 QQ 桥接的 state/token-usage.jsonl 与遥测：数据根（不是代码根）。
    qqRoot: DATA_ROOT,
    readCurrentCharacter,
    log: (message) => pluginLog(message),
  });
  billing.start();

  const petChat = createPetChatService({ ctx, stateDir: STATE_DIR, pluginLog, tokenBudget });
  const petPurpose = createPetPurposeService({ chat: petChat, tokenBudget, pluginLog, callBridge });
  // 自我学习：贴吧 / B站 / 抖音 的观看记录 → 经历 + 近况（定时跑，也可以在设置页手动触发）。
  const learningLoop = createLearningLoop({ ctx, log: pluginLog, tokenBudget });
  // 记忆整理：把聊天流水合并/去噪成干净的事实（一键手动 + 每日自动）。
  const memoryOrganizer = createMemoryOrganizer({ ctx, log: pluginLog, tokenBudget });
  const petApi = createPetApiService({
    chat: petChat,
    purpose: petPurpose,
    petService,
    stateDir: STATE_DIR,
    currentDshUrl,
    pluginLog,
    version: VERSION,
  });

  // ── 组件更新（2026-10-26 用户要求）──────────────────────────────────────
  // 检查 SurfCore 本体 + 用户登记的组件：只读 git fetch，更新只允许 --ff-only。
  // 组件清单每次动态解析：换路径 / 新装包都不用重启插件。
  const updates = createUpdatesService({
    stateDir: STATE_DIR,
    pluginLog,
    githubToken: () => String(readUnified().config?.updates?.githubToken ?? ''),
    components: () => {
      const list = [];
      try {
        const updCfg = readUnified().config?.updates ?? {};
        // 1) SurfCore 本体：源码树，走 git
        list.push({ id: 'surfcore', name: 'dsh-Dfy 源码', dir: QQBOT_ROOT, kind: 'git', branch: 'main', versionRepo: 'louke6572/dsh-Dfy' });
        // 2) 2026-11 精简：语音包/桌宠组件不再登记（各自的后端已下线，留着只会每次都报 missing）。
        // 3) 用户登记的组件：unified config 的 updates.components[]
        const custom = updCfg.components;
        if (Array.isArray(custom)) {
          for (const item of custom) {
            if (!item || typeof item !== 'object' || !item.id || !item.dir) continue;
            // id 会被拼进暂存目录名并进 PowerShell 命令：非法 id 直接丢弃，
            // 不要让它以"只是个名字"的身份一路流到解压/清理那一步。
            const safeId = sanitizeComponentId(item.id);
            if (!safeId) {
              pluginLog(`[updates] 忽略 id 不合规的组件（只允许字母/数字/点/下划线/短横线）：${String(item.id).slice(0, 60)}`);
              continue;
            }
            // P3：自定义目录不阻断，但要告警一次——自动更新会向这个目录覆盖写文件。
            if (!updateDirInExpectedRoots(item.dir) && !updateDirWarned.has(safeId)) {
              updateDirWarned.add(safeId);
              pluginLog(`[updates] 组件 ${safeId} 的目录不在 DSH_HOME/插件目录/仓库根下（${maskPath(String(item.dir))}）：自动更新会向该目录覆盖写文件，请确认这是你要的目录`);
            }
            list.push({
              id: safeId,
              name: String(item.name ?? item.id).slice(0, 80),
              dir: String(item.dir),
              kind: ['git', 'release', 'auto'].includes(item.kind) ? item.kind : 'auto',
              branch: item.branch ? String(item.branch).slice(0, 60) : undefined,
              versionUrl: item.versionUrl ? String(item.versionUrl) : '',
            });
          }
        }
      } catch {}
      // 去重（同 id 只留第一个）
      const seen = new Set();
      return list.filter((item) => (seen.has(item.id) ? false : (seen.add(item.id), true)));
    },
  });

  let sessionEventOff = null;
  try {
    if (typeof ctx.on === 'function') {
      sessionEventOff = ctx.on('session/event', (session, event) => {
        try { tokenBudget.ingestEvent(session, event); }
        catch (error) { pluginLog('token 用量采集失败：', String(error?.message ?? error).slice(0, 160)); }
        try {
          if (tokenBudget.isTrackedSession(session)) contextTelemetry.ingestEvent(session, event);
        } catch (error) { pluginLog('上下文遥测失败：', String(error?.message ?? error).slice(0, 160)); }
      });
    }
  } catch (error) {
    pluginLog('token 用量采集监听注册失败：', String(error?.message ?? error));
  }

  // 启动时先重建身份对齐提示块（bridge 与 B站调度器都读它）。
  try { writeAlignmentBriefs(); } catch (error) { pluginLog('启动时写对齐简报失败：', error?.message ?? error); }

  // ── 平台启动开关（2026-10-24 用户要求：不是所有用户都想同时开 QQ / B站）──
  // 唯一真相在合体层 config.json 的 platforms.start.{qq,bili}；旧 bridge.autoStart
  // 只在 readUnified() 里做一次迁移。开关关掉 = 不自动启动、不被「一键启动」带上，
  // 保存配置时宿主会把正在跑的那一边停掉（save/restart 流程见 handleConfig）。
  function platformStartState() {
    const start = readUnified().config.platforms?.start ?? {};
    return { qq: start.qq !== false, bili: start.bili !== false };
  }
  function platformStartEnabled(id) {
    return platformStartState()[id] !== false;
  }
  function idleSchedulerStatus(reason = 'disabled') {
    return {
      running: false,
      disabled: !platformStartEnabled('bili'),
      reason,
      startedAt: null,
      lastError: null,
      lastTickAt: null,
      sessionId: schedulerStatus.sessionId ?? null,
    };
  }
  // B站生物钟：合体后由本插件接管（旧 dsh-bili-whale 会被停用）。
  // 抽成函数给「一键启动」复用：DSH 重启后插件加载时按平台开关决定是否自动启动，
  // 失败后也能手动拉起。
  function startSchedulerNow() {
    if (scheduler && schedulerStatus.running) return schedulerStatus;
    if (!platformStartEnabled('bili')) {
      schedulerStatus = idleSchedulerStatus('disabled');
      pluginLog('生物钟未启动：B站 启动开关关闭（设置 → B站 → 启动 B站）');
      return schedulerStatus;
    }
    // 没登录过 B站 就不要自动起会话：新用户第一次装完，60s 一次的 tick 只会空烧 token。
    // （凭据由扫码登录写入 BILI_CRED；用户登录后会自然启动。）
    if (!fs.existsSync(BILI_CRED)) {
      schedulerStatus = idleSchedulerStatus('not-logged-in');
      pluginLog('生物钟未启动：B站 还没登录（设置 → B站 → 扫码登录），避免空转消耗 token');
      return schedulerStatus;
    }
    try {
      const character = readCurrentCharacter();
      const sessionId = character ? `bili-whale-${character.id}` : 'bili-whale';
      scheduler = startScheduler(ctx, {
        dshHome: DSH_HOME,
        biliMjs: BILI_MJS,
        cwd: os.homedir(),
        sessionId,
        tokenBudget,
        log: (message) => pluginLog(message),
      });
      schedulerStatus = { running: true, disabled: false, reason: '', startedAt: new Date().toISOString(), lastError: null, lastTickAt: null, sessionId };
      pluginLog(`生物钟已启动（会话 ${sessionId}）`);
    } catch (error) {
      schedulerStatus.lastError = String(error?.message ?? error);
      pluginLog('生物钟启动失败：', schedulerStatus.lastError);
    }
    return schedulerStatus;
  }
  function stopSchedulerNow() {
    const wasRunning = Boolean(scheduler && schedulerStatus.running);
    try { scheduler?.stop?.(); } catch (error) {
      pluginLog('生物钟停止失败：', String(error?.message ?? error));
    }
    scheduler = null;
    schedulerStatus = { running: false, startedAt: null, lastError: null, lastTickAt: null };
    if (wasRunning) pluginLog('生物钟已停止');
    return { ok: true, wasRunning, scheduler: schedulerStatus };
  }
  startSchedulerNow();

  // 管理员称呼的存量修复：v0.7.2 及以前只把 ownerQQ 投影到 QQ config.json，
  // displayName/biliName/gentle 留在 unified，桥接独立进程读不到 → 叫“管理员”。
  // 启动时补一次投影（有变化才写），桥接在跑就重启让它重新读配置。
  function ensureAdminProjection() {
    try {
      const qqState = readQqConfig();
      const unifiedState = readUnified();
      const biliState = readBiliConfig();
      const unifiedAdmin = unifiedState.hasAdmin ? unifiedState.config?.admin : undefined;
      const sourceAdmin = unifiedAdmin ?? qqState.config?.admin;
      const current = adminFromSources({
        unified: { admin: sourceAdmin },
        qq: qqState.config,
        bili: biliState.config,
      });
      if (!current.qq && !current.biliMid) return;
      const next = normalizeAdmin(current);
      const prev = normalizeAdmin(qqState.config?.admin);
      if (JSON.stringify(prev) === JSON.stringify(next)) return;
      const planned = projectAdminSave({ current: next, qq: qqState.config });
      if (!planned.qq) return;
      saveQqConfig(planned.qq);
      pluginLog('管理员称呼已补齐到 QQ config.json（桥接重启后生效）');
      setTimeout(() => {
        void bridgeStatus().then((st) => {
          if (!st.running) return;
          return restartBridge({ dshWebUrl: currentDshUrl() });
        }).catch(() => {});
      }, 1500).unref?.();
    } catch (error) {
      pluginLog('管理员称呼投影失败（继续使用现有配置）：', error?.message ?? error);
    }
  }

  ensureAdminProjection();

  // ── 角色人格：启动迁移 + 切换编排 ───────────────────────────────────────
  // 迁移只做一次：有旧记忆/旧 B站 账本才建第一个角色；旧目录原样保留作冷备份。
  function ensureCharacterSystem() {
    if (process.env.SURFCORE_DISABLE_CHARACTER_MIGRATION === '1') return { ok: true, skipped: true, reason: 'disabled' };
    try {
      const result = migrateIfNeeded({
        personaFile: resolvePersonaFile(),
        memoryDir: MEMORY_DIR,
        biliDir: BILI_DIR,
        stateDir: QQ_STATE_DIR(),
      });
      if (result.migrated) {
        pluginLog(`角色系统：已从旧数据迁移出「${result.character?.name ?? result.current?.name}」（备份 ${maskPath(result.backupDir)}）`);
        writeCharacterRolePointer();
        // 桥接可能已经在跑旧路径：给它一次重启，让它读新角色目录。
        setTimeout(() => { void bridgeStatus().then((st) => { if (st.running) return restartBridge({ dshWebUrl: currentDshUrl() }); }).catch(() => {}); }, 1500).unref?.();
      }
      return result;
    } catch (error) {
      pluginLog('角色系统迁移失败（继续用旧布局）：', error?.message ?? error);
      return { ok: false, error: String(error?.message ?? error) };
    }
  }

  function writeCharacterRolePointer() {
    const cur = readCurrentCharacter();
    if (!cur) return;
    const file = path.join(QQ_STATE_DIR(), 'current-role.json');
    const old = readJson(file, {}) ?? {};
    try {
      writeJsonAtomic(file, { role: cur.name, mode: old.mode === 'silent' ? 'silent' : 'active' });
    } catch (error) {
      pluginLog('写 current-role.json 失败：', error?.message ?? error);
    }
  }

  /** 先让桥接停掉全部旧会话（v1 + v2），再停进程；否则旧 DSH 回合可能带着旧人格继续发消息。 */
  async function stopAllBridgeSessions() {
    try {
      const listed = await callBridge('/api/sessions', { timeoutMs: 8000 });
      const sessions = Array.isArray(listed?.data?.sessions) ? listed.data.sessions : [];
      for (const item of sessions) {
        if (!item?.key) continue;
        await callBridge('/api/session/reset', { method: 'POST', body: { key: item.key }, timeoutMs: 15000 }).catch(() => {});
      }
      await callBridge('/api/socialV2/reset', { method: 'POST', timeoutMs: 20000 }).catch(() => {});
    } catch (error) {
      pluginLog('切换角色：停止旧桥接会话失败（继续停进程）：', error?.message ?? error);
    }
  }

  /** 切换角色前把桥接的会话映射挪走：新角色必须从空会话开始，不能带旧人格上下文。 */
  function archiveBridgeRuntimeState() {    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const dir = path.join(BACKUP_DIR, `character-switch-${stamp}`);
    fs.mkdirSync(dir, { recursive: true });
    const files = ['sessions.json', 'social-v2.json'];
    const moved = [];
    for (const name of files) {
      const src = path.join(QQ_STATE_DIR(), name);
      try {
        if (!fs.existsSync(src)) continue;
        fs.renameSync(src, path.join(dir, name));
        moved.push(name);
      } catch (error) {
        pluginLog(`切换角色：归档 ${name} 失败：`, error?.message ?? error);
      }
    }
    return { dir, moved };
  }

  async function switchCharacterEverywhere(id) {
    const current = readCurrentCharacter();
    if (current && current.id === id) return { ok: true, already: true, current };
    const target = characterDetail(id).character;
    const skipPlatform = process.env.SURFCORE_DISABLE_PLATFORM_RESTART === '1';
    await memoryCardIdle();
    const wasRunning = skipPlatform ? false : (await bridgeStatus()).running;
    let schedulerWasRunning = !skipPlatform && Boolean(scheduler && schedulerStatus.running);
    try {
      if (schedulerWasRunning) {
        try { await scheduler?.retire?.(); } catch (error) { pluginLog('切换角色：停 B站 会话失败：', error?.message ?? error); }
        scheduler = null;
        schedulerStatus = { running: false, startedAt: null, lastError: null, lastTickAt: null };
      }
      if (wasRunning) {
        await stopAllBridgeSessions();
        const stopped = await stopBridge();
        if (!stopped.ok) {
          schedulerWasRunning = true;
          startSchedulerNow();
          throw new Error(`切换失败：QQ 桥接没停下来（${stopped.error || stopped.message || '未知原因'}）`);
        }
      }
      // 到这里两个平台都停了：给旧角色拍切换前存档，然后原子换指针。
      if (current) beforeSwitchSnapshot(current.id);
      const switched = switchToCharacter(id);
      writeCharacterRolePointer();
      const archived = archiveBridgeRuntimeState();
      // 先把新角色的记忆卡 prompt 生成好，再启动桥接/调度器，避免开头几条提示词读不到记忆。
      await runMemoryCardMaintenance({}).catch((error) => pluginLog('切换角色后整理记忆卡失败：', error?.message ?? error));
      if (wasRunning) {
        const started = await startBridge({ dshWebUrl: currentDshUrl() });
        if (!started.ok) pluginLog('切换角色：桥接重启失败（角色已切换，平台保持停止）：', started.error || started.message);
      }
      if (!skipPlatform) startSchedulerNow();
      pluginLog(`角色已切换：${current?.name ?? '（无）'} → ${target.name}（epoch ${switched.current?.epoch}）`);
      return {
        ok: true,
        current: switched.current,
        previous: current,
        bridgeRestarted: wasRunning,
        archived,
        scheduler: schedulerStatus,
      };
    } catch (error) {
      pluginLog('角色切换失败：', error?.message ?? error);
      if (schedulerWasRunning && (!scheduler || !schedulerStatus.running)) startSchedulerNow();
      throw error;
    }
  }

  const characterMigration = ensureCharacterSystem();
  // 迁移发生在 scheduler 启动之后：用新角色重启一次，换掉旧会话 id 与旧状态路径。
  if (characterMigration?.migrated) {
    try { scheduler?.stop?.(); } catch {}
    scheduler = null;
    schedulerStatus = { running: false, startedAt: null, lastError: null, lastTickAt: null };
    startSchedulerNow();
  }


  // 记忆卡：插件宿主是唯一维护者。启动 8 秒后整理一次（摄取桥接 inbox + B站记忆），
  // 之后每 10 分钟一次；每日衰减由 memory-card 自己按 dailyHour 判断。
  memoryCardTimer = startMemoryCardTimer({ log: pluginLog, callBridge });
  // 自我学习：启动 10 分钟后第一次，之后按 learning.intervalHours（默认 6 小时）。
  learningLoop.start();
  // 记忆整理：每小时检查一次；只有「开关开 + 距上次 20h + 记录够多」才真正调模型。
  memoryOrganizeTimer = setInterval(() => {
    void (async () => {
      try {
        const cfg = readUnified().config?.memoryCard ?? {};
        const result = await memoryOrganizer.autoOrganize({ config: cfg });
        if (result?.ok) {
          const merge = result.merge;
          if (merge) {
            saveUnified({ memoryCard: { organize: { lastRunAt: Date.now(), lastMerged: merge.merged || 0, lastDropped: merge.dropped || 0 } } });
          }
          pluginLog(`[memory-organize] 自动：日记 ${result.diary?.date ?? '—'}（归档 ${result.diary?.removed ?? 0} 条） / 合并 ${merge?.merged ?? 0} 组、删除 ${merge?.dropped ?? 0} 条`);
        }
      } catch (error) {
        pluginLog('[memory-organize] 自动整理失败：', String(error?.message ?? error).slice(0, 120));
      }
    })();
  }, 60 * 60 * 1000);
  memoryOrganizeTimer.unref?.();

  // 角色自动存档：启动 10 秒后跑一次，之后每 6 小时检查（每天最多一份 + 11 个年龄档轮换）。
  const runCharacterAutoSave = () => {
    const cur = readCurrentCharacter();
    if (!cur) return;
    try {
      const result = autoSnapshot(cur.id);
      if (result.pruned?.length) pluginLog(`角色自动存档：${cur.name} 清理 ${result.pruned.length} 个旧档`);
    } catch (error) {
      pluginLog('角色自动存档失败：', error?.message ?? error);
    }
  };
  const characterInitial = setTimeout(runCharacterAutoSave, 10_000);
  characterInitial.unref?.();
  characterTimer = setInterval(runCharacterAutoSave, 6 * 60 * 60 * 1000);
  characterTimer.unref?.();

  // QQ → B站 定时同步（默认关闭；开启后每 30 分钟一次，启动 20 秒后先跑一次）。
  const startSyncTimer = () => {
    if (syncTimer) { clearInterval(syncTimer); syncTimer = null; }
    const unified = readUnified().config;
    if (unified.memory?.qqToBili?.enabled !== true) return;
    setTimeout(() => {
      try { syncQqToBili(); } catch (error) { pluginLog('首次 QQ→B站 同步失败：', error?.message ?? error); }
    }, 20_000).unref?.();
    syncTimer = setInterval(() => {
      try { syncQqToBili(); } catch (error) { pluginLog('定时 QQ→B站 同步失败：', error?.message ?? error); }
    }, Math.max(5 * 60_000, Number(unified.memory?.qqToBili?.intervalMs) || 30 * 60_000));
  };

  // 扩展框架已移除（2026-11-03）：没有扩展包，也没有 UI 入口。
  function currentDshUrl() {
    try {
      const ws = ctx.get('webServer');
      if (ws?.port) return `${ws.protocol || 'http:'}//127.0.0.1:${ws.port}`;
    } catch {}
    return String(process.env.DSH_WEB_URL ?? '').trim();
  }

  // 桥接是否还是“上一轮 DSH 的”：旧版本不报 root/dshBaseUrl，或者端口已经变了。
  // 多实例（桌面 + web）共用 ~/.dsh 时，桥接只会被其中一个实例持有 ——
  // 另一个实例看到「桥接连着别的端口」不能直接抢：只要那个 DSH 还活着，它就是对的。
  // 否则两边每 10 分钟互相重启一次，QQ 回复反复断线（用户看到的就是「一直重启」）。
  async function bridgeStaleReason(status) {
    if (!status?.running) return '';
    const runningRoot = status.root ? path.resolve(String(status.root)) : '';
    if (!runningRoot || runningRoot !== path.resolve(QQBOT_ROOT)) {
      return `桥接还在旧目录（root=${status.root ?? '未知'}）`;
    }
    const expected = currentDshUrl().replace(/\/+$/, '');
    const actual = String(status.dshBaseUrl ?? '').trim().replace(/\/+$/, '');
    if (!actual) return '桥接是旧版本，无法报告 DSH 地址';
    if (expected && actual !== expected) {
      if (await dshUrlAlive(actual)) return '';
      return `桥接还连着旧 DSH（${actual} ≠ ${expected}）`;
    }
    return '';
  }

  /** 桥接记录的 DSH 地址是否还有进程在监听（活着就不算旧）。 */
  async function dshUrlAlive(url) {
    try {
      const u = new URL(url);
      const port = Number(u.port) || (u.protocol === 'https:' ? 443 : 80);
      return await portOpen(port);
    } catch {
      return false;
    }
  }

  // 2026-11 用户反馈：「已经配置过的，每次重开还要手动点一键开始」。
  // 这里把「一键开始」的前半段（拉起 SnowLuma → 等 OneBot → 发现并写入地址/令牌）
  // 挂到 DSH 启动时自动执行一次；失败了 5 分钟内不再重试，避免反复拉起。
  let snowBootBusy = false;
  let snowBootFailAt = 0;
  const ensureSnowLumaReady = async () => {
    if (snowBootBusy) return { ok: true, skipped: 'busy' };
    if (process.env.SURFCORE_SKIP_AUTOSTART === '1') return { ok: true, skipped: 'skip-autostart' };
    const cfg = readQqConfig().config?.snowluma ?? {};
    if (cfg.allowLaunch !== true) return { ok: true, skipped: 'allowLaunch=false' };
    if (Date.now() - snowBootFailAt < 5 * 60_000) return { ok: false, skipped: 'cooldown' };
    snowBootBusy = true;
    try {
      const launched = await launchSnowLuma().catch((error) => ({ ok: false, error: String(error?.message ?? error) }));
      // 首次使用（还没扫码登录）不自动折腾，交给用户在面板里走一次向导
      if (launched?.needsLogin) return { ok: false, error: '首次使用：需要先扫码登录一次' };
      const deadline = Date.now() + 10_000;
      while (Date.now() < deadline) {
        if ((await portOpen(3000)) || (await portOpen(3001))) break;
        await new Promise((resolve) => setTimeout(resolve, 600));
      }
      const found = await discoverSnowLumaConnection({ cfg: readQqConfig().config ?? {}, timeoutMs: 5000 }).catch(() => null);
      if (found?.ok) {
        const next = { httpUrl: found.baseUrl };
        if (found.wsUrl) next.wsUrl = found.wsUrl;
        if (found.token) next.accessToken = found.token;
        if (found.wsToken) next.wsToken = found.wsToken;
        // 配置已经一致就别每次都写盘
        const same = cfg.accessToken === next.accessToken && cfg.wsToken === next.wsToken && cfg.httpUrl === next.httpUrl;
        if (!same) saveQqConfig({ snowluma: next });
        pluginLog('[boot] SnowLuma 已就绪：', `${found.self?.nickname ?? ''}（${found.self?.user_id ?? ''}）`);
        return { ok: true, account: String(found.self?.nickname ?? '') };
      }
      snowBootFailAt = Date.now();
      return { ok: false, error: launched?.message || '还没连上 OneBot（确认电脑上的 QQ 已登录）' };
    } finally {
      snowBootBusy = false;
    }
  };

  // 自动拉起桥接（默认关；用户可在设置里开）。
  // 2026-10-22：除了启动时检查一次，再加一个 2 分钟自愈轮询 ——
  // DSH 重启后端口会变，桥接如果还连着旧端口，下一次轮询会自动重启它（而不是等用户发现）。
  let bridgeRepairBusy = false;
  let bridgeRepairTimer = null;
  // 多实例（桌面 + web）同时挂这个插件时会抢同一个桥接：重启失败就冷却 10 分钟，
  // 避免每 2 分钟刷一次「停止脚本跑完了，但端口仍在监听」并把对面实例的桥接打断。
  let bridgeRepairCooldownUntil = 0;
  const maybeAutoStartBridge = async () => {
    if (bridgeRepairBusy) return;
    bridgeRepairBusy = true;
    try {
      if (process.env.SURFCORE_SKIP_AUTOSTART === '1') return;
      // 新开关是唯一真相；旧 bridge.autoStart 已由 readUnified() 迁移，不再直接读。
      if (!platformStartEnabled('qq')) return;
      // 先把 SnowLuma 拉起来并写好连接配置，再判断桥接 —— 否则桥接会连到空端口
      const snow = await ensureSnowLumaReady();
      if (!snow.ok && !snow.skipped) pluginLog('autoStart 预热 SnowLuma 未完成：', snow.error || '');
      const status = await bridgeStatus();
      if (status.running) {
        const stale = await bridgeStaleReason(status);
        if (stale && Date.now() >= bridgeRepairCooldownUntil) {
          pluginLog(`autoStartBridge：${stale}，自动重启`);
          const restarted = await restartBridge({ dshWebUrl: currentDshUrl() });
          pluginLog('autoStartBridge 重启结果：', restarted.message || restarted.error || '');
          if (!restarted.ok) {
            bridgeRepairCooldownUntil = Date.now() + 10 * 60 * 1000;
            pluginLog('autoStartBridge：重启失败（可能另一端实例仍占着桥接），10 分钟内不再重试');
          }
        }
        return;
      }
      pluginLog('autoStartBridge：桥接未运行，尝试启动');
      const result = await startBridge({ dshWebUrl: currentDshUrl() });
      pluginLog('autoStartBridge 结果：', result.message || result.error || '');
    } catch (error) {
      pluginLog('autoStartBridge 失败：', error?.message ?? error);
    } finally {
      bridgeRepairBusy = false;
    }
  };

  const disposers = [];
  function route(kind, pathname, handler) {
    disposers.push(ctx.webServer.register({
      kind,
      path: pathname,
      handler: async (req, res) => {
        if (!isLoopbackReq(req)) { json(res, 403, { ok: false, error: '只接受本机回环访问' }); return; }
        if (req.method !== 'GET' && !sameOrigin(req)) { json(res, 403, { ok: false, error: '跨站请求被拒绝' }); return; }
        // Content-Type 只对**浏览器**写请求强制（判据=http-guard.isBrowserRequest）；
        // curl / 本机脚本 / 桌宠进程不带 Content-Type 也放行，body 交给 readJsonBody 解析。
        const ctRejection = contentTypeRejection(req);
        if (ctRejection) {
          json(res, 415, { ok: false, code: 'CONTENT_TYPE', error: ctRejection });
          return;
        }
        try {
          const conn = ctx.get('connection');
          if (conn && typeof conn.requestRejection === 'function') {
            const code = conn.requestRejection(req);
            if (code !== undefined && code !== null && code !== false) {
              res.statusCode = typeof code === 'number' ? code : 403;
              res.end();
              return;
            }
          }
          await handler(req, res);
        } catch (error) {
          pluginLog('API 失败：', `${req.method} ${req.url} — ${error?.message ?? error}`);
          // 400/413 这类「客户端请求有问题」的错误要按自己的状态码回，别一律 500：
          // readJsonBody 把非法 JSON 标成 400、readBody 把超限标成 413。
          const status = Number(error?.statusCode);
          const code = status >= 400 && status < 600 ? status : 500;
          try { json(res, code, { ok: false, code: String(error?.code ?? ''), error: String(error?.message ?? error) }); } catch {}
        }
      },
    }));
  }

  // ── 概览 ────────────────────────────────────────────────────────────────
  async function overview() {
    const all = readAll();
    const snow = readQqConfig().config?.snowluma ?? {};
    const [bridge, bili, memory] = await Promise.all([
      bridgeStatus().catch((error) => ({ ok: false, error: String(error?.message ?? error) })),
      Promise.resolve(biliToQqStatus()),
      Promise.resolve(memoryStatus()),
    ]);
    // 贴吧 / 抖音的运行状态也带回概览，避免只有 QQ / B站 两张卡。
    const tiebaOverview = (() => { try { return tiebaStatus(); } catch (error) { return { ok: false, error: String(error?.message ?? error) }; } })();
    const douyinOverview = await douyinStatus().catch((error) => ({ ok: false, error: String(error?.message ?? error) }));
    // SnowLuma 只报「未连接」没用：这里给出可执行的诊断（没启动 / 在登录页 / token 不对）。
    const snowDiag = await diagnoseSnowLuma(bridge?.snowluma ?? {}).catch(() => ({ state: 'unknown', hint: '' }));
    const personaText = readTextFile(resolvePersonaFile());
    const mode = parseModeState();
    let dshMode = null;
    try {
      const settings = ctx.get('settings');
      if (settings?.describe) {
        const rows = settings.describe({ redactSecrets: true });
        const row = rows.find((item) => item.ns === 'qq-mode');
        dshMode = row?.value?.mode ?? null;
      }
    } catch {}
    return {
      ok: true,
      version: VERSION,
      // 合并后设置页显示的「产品名 + 版本」= 小鲸鱼挂件的名字和版本。
      merged: mergedPluginInfo(),
      privacyPolicyVersion: PRIVACY_POLICY_VERSION,
      bridge,
      bili,
      memory,
      tieba: tiebaOverview,
      douyin: douyinOverview,
      memoryCard: memoryCardStatusNow(),
      admin: adminSummary(all.unified?.admin),
      alignment: alignStats(),
      platforms: platforms.list(),
      // 平台启动开关：设置页顶部状态点、概览三按钮的可用性都读它。
      platformStart: platformStartState(),
      // 组件更新：概览「更新」卡与启动弹窗都读它（检查结果是缓存的，不在这里触发网络）。
      updates: updates.status(),
      scheduler: schedulerStatus,
      launch: await launchStatus(),
      snowluma: {
        launcherPath: String(snow.launcherPath ?? ''),
        allowLaunch: snow.allowLaunch === true,
        downloadUrl: String(snow.downloadUrl ?? 'https://github.com/SnowLuma/SnowLuma/releases/latest'),
        detected: findSnowLumaInstall().ok,
        everConnected: bridge?.snowluma?.everConnected === true,
        diagnosis: snowDiag,
        // 控制台地址（扫码登录 / 加账号都在这里）；up 只代表端口在听，不代表已登录。
        webui: { ...snowLumaWebui(), up: await portOpen(snowLumaWebui().port) },
      },
      mode: {
        local: mode.localMode,
        dsh: dshMode,
        effective: dshMode || mode.localMode,
        role: mode.localRole,
        ownerQQ: all.qq?.ownerQQ ?? null,
        allowGroups: all.qq?.allow?.groups?.length ?? 0,
        allowPrivate: all.qq?.allow?.private?.length ?? 0,
      },
      persona: {
        path: resolvePersonaFile(),
        exists: Boolean(personaText),
        chars: personaText.length,
        mtime: mtimeIso(resolvePersonaFile()),
      },
      character: (() => {
        const cur = readCurrentCharacter();
        return cur ? { id: cur.id, name: cur.name, epoch: cur.epoch, switchedAt: cur.switchedAt } : null;
      })(),
      paths: { ...pathSummary(), ...memory.paths, backupDir: BACKUP_DIR },
      files: {
        pluginLog: fileInfo(PLUGIN_LOG),
        qqConfig: fileInfo(QQ_CONFIG),
        biliConfig: fileInfo(BILI_CONFIG),
        alignment: fileInfo(ALIGN_FILE),
        qqForBili: fileInfo(activeMemoryPaths().qqForBili),
      },
    };
  }

  // ── 配置读写 ────────────────────────────────────────────────────────────
  async function handleConfig(req, res) {
    if (req.method === 'GET') {
      json(res, 200, {
        ok: true, ...readAll(),
        // 后端真实默认值（形状与 qq/bili/unified 一致、已脱敏）：设置页显示「默认是什么」
        // 直接读这里，别在前端再抄一份默认值（两份必然漂移）。
        defaults: configDefaults(),
        paths: pathSummary(), backups: listBackups(20),
        // 保存时回传这些戳：服务端据此判断"加载之后配置有没有被别处改过"
        stamps: {
          qq: fileStamp(QQ_CONFIG),
          bili: fileStamp(BILI_CONFIG),
          unified: fileStamp(path.join(STATE_DIR, 'config.json')),
        },
      });
      return;
    }
    const body = await readJsonBody(req);
    // 乐观并发：设置页加载后，如果配置被控制台/别的窗口改过，这里拒绝整份回写，
    // 否则会把别人的修改覆盖掉（2026-10-29：语音开关"自己回弹"）。
    const baseStamp = body?.baseStamp && typeof body.baseStamp === 'object' ? body.baseStamp : null;
    const currentStamps = {
      qq: fileStamp(QQ_CONFIG),
      bili: fileStamp(BILI_CONFIG),
      unified: fileStamp(path.join(STATE_DIR, 'config.json')),
    };
    if (baseStamp) {
      const stale = ['qq', 'bili', 'unified'].filter((k) => isStale(baseStamp[k], currentStamps[k]));
      if (stale.length) {
        json(res, 409, {
          ok: false, code: 'CONFIG_STALE',
          error: `配置已被别处修改（${stale.join(' / ')}），本次保存未执行`,
          hint: '点「重新读取」拿到最新配置后再改；直接覆盖会丢掉别人的修改',
          stamps: currentStamps,
        });
        return;
      }
    }
    const result = { ok: true, saved: {}, warnings: [] };
    // ── 管理员：QQ ⇄ B站 默认是同一个人 ────────────────────────────────────
    // 合体层 admin 是唯一真相；旧格式（qq.ownerQQ / bili.owner）是投影。
    // 合并逻辑放在 src/admin-identity.js 的 projectAdminSave（纯函数，有单测），
    // 这里只负责把结果写回三份文件，避免「只改了一边」。
    // 管理员 B站 UID：显式拒绝非法值，别静默清空（用户会以为"填不进去"）
    const rawAdminMid = String(body?.unified?.admin?.biliMid ?? '').trim();
    if (rawAdminMid && !/^\d{4,20}$/.test(rawAdminMid)) {
      json(res, 400, {
        ok: false, code: 'admin.mid-invalid',
        error: `管理员 B站 UID「${rawAdminMid}」不合法`,
        hint: 'B站 UID 是 4~20 位数字（个人空间地址 space.bilibili.com/<数字>）；不要带字母或空格',
      });
      return;
    }

    const currentQq = readQqConfig().config;
    const currentBili = readBiliConfig().config;
    const currentUnifiedState = readUnified();
    const beforePlatformStart = platformStartState();
    // 合并默认值后 admin 永远存在（默认空串）；只有用户文件里明确写过才当"显式清空"，
    // 否则会把旧字段 ownerQQ / owner.mid 当成没配置，保存时把两边投影抹掉。
    const currentUnified = currentUnifiedState.hasAdmin
      ? currentUnifiedState.config
      : { ...currentUnifiedState.config, admin: undefined };
    const currentAdmin = adminFromSources({ unified: currentUnified, qq: currentQq, bili: currentBili });
    const planned = projectAdminSave({ current: currentAdmin, qq: body.qq, bili: body.bili, unified: body.unified });
    if (planned.conflict) {
      result.warnings.push('管理员卡片与高级参数同时改了 ownerQQ / owner.mid：已按管理员卡片对齐，两边会同时写成同一个人。');
    }
    body.qq = planned.qq;
    body.bili = planned.bili;
    body.unified = planned.unified;
    if (body.qq && typeof body.qq === 'object') {
      if (body.qq.allow && typeof body.qq.allow === 'object') {
        const ownerForAllow = planned.unified?.admin?.qq || readQqConfig().config?.ownerQQ || '';
        const { allow, warnings } = normalizeAllowlist({ allow: body.qq.allow, ownerQQ: ownerForAllow });
        body.qq.allow = allow;
        for (const w of warnings) result.warnings.push(`白名单：${w.message}`);
      }
      const saved = saveQqConfig(body.qq);
      result.saved.qq = true;
      result.qq = saved.config;
      result.qqBackup = saved.backup;
      result.warnings.push('QQ 配置已保存；桥接只在启动时读 config.json，需要「重启桥接」才会生效。');
    }
    if (body.bili && typeof body.bili === 'object') {
      const saved = saveBiliConfig(body.bili);
      result.saved.bili = true;
      result.bili = saved.config;
      result.biliBackup = saved.backup;
      result.warnings.push('B站配置已保存；生物钟每轮重读配置，下一轮即生效。');
    }
    if (body.unified && typeof body.unified === 'object') {
      const saved = saveUnified(body.unified);
      result.saved.unified = true;
      result.unified = saved.config;
    }
    if (result.saved.unified) {
      try { writeAlignmentBriefs(); } catch (error) { result.warnings.push(`对齐简报重建失败：${error?.message ?? error}`); }
      try { scheduler?.invalidate?.(); } catch {}
      // 抖音的时段/额度投影到网页端账本；失败只提示，不影响其它设置落盘。
      try { douyinSyncPolicy(); } catch (error) { result.warnings.push(`抖音时段同步失败：${String(error?.message ?? error).slice(0, 120)}`); }
      // 群聊/私信开关变化后立即生效（关掉会停，开起来会在下一轮恢复）。
      try { void douyinChatResume(); } catch {}
      startSyncTimer();
      // 改了记忆卡容量/注入上限后立刻重渲染，避免「设置保存了但提示词还是旧的」。
      try {
        const memoryCard = await runMemoryCardMaintenance({ config: readUnified().config.memoryCard });
        result.memoryCard = { status: memoryCard.status, changed: memoryCard.changed };
      } catch (error) {
        result.warnings.push(`记忆卡重渲染失败：${error?.message ?? error}`);
      }
      if (readUnified().config.memory?.qqToBili?.enabled === true) {
        try { result.qqMemory = syncQqToBili(); } catch (error) { result.warnings.push(`QQ→B站 同步失败：${error?.message ?? error}`); }
      }
    }
    // 平台启动开关的副作用：保存即生效（不是等下次重启）。
    // 用户关掉哪一边，就把正在跑的那一边停掉；重新打开则拉起来。
    // 这是「是否启动」和「只是改个参数」的区别，不能只写文件不执行。
    // 目的载体同理：切到桌宠后桥接下一次 tick 就不再自动出发（30 秒内生效），
    // 桌宠那边由 petPurpose 接手；不用重启桥接。
    if (result.saved.qq || result.saved.unified) {
      const afterCarrier = readQqConfig().config?.purpose?.carrier === 'pet' ? 'pet' : 'qq';
      const beforeCarrier = currentQq?.purpose?.carrier === 'pet' ? 'pet' : 'qq';
      result.purposeCarrier = afterCarrier;
      if (afterCarrier !== beforeCarrier) {
        result.warnings.push(afterCarrier === 'pet'
          ? '目的载体已切到「桌宠」：QQ 桥接不再自动主动搭话，改由桌宠气泡/语音发出（30 秒内生效，不用重启桥接）。'
          : '目的载体已切回「QQ」：桌宠不再主动搭话，改由桥接私聊你（30 秒内生效）。');
      }
    }
    const afterPlatformStart = platformStartState();
    result.platformStart = afterPlatformStart;
    if (result.saved.unified && process.env.SURFCORE_SKIP_AUTOSTART !== '1') {
      if (!afterPlatformStart.bili && beforePlatformStart.bili) {
        // 用 retire 而不是 stop：除了清定时器，还取消当前在途的 DSH 回合，
        // 否则关掉开关后她这一轮仍可能把消息发出去（见 PITFALLS #62）。
        try { await scheduler?.retire?.(); } catch (error) { result.warnings.push(`取消 B站 在途回合失败：${error?.message ?? error}`); }
        scheduler = null;
        schedulerStatus = idleSchedulerStatus('disabled');
        result.scheduler = schedulerStatus;
        result.warnings.push('B站 启动开关已关闭：生物钟已停止。');
      } else if (afterPlatformStart.bili && !beforePlatformStart.bili) {
        result.scheduler = startSchedulerNow();
        result.warnings.push(result.scheduler.running
          ? 'B站 启动开关已打开：生物钟已启动。'
          : 'B站 启动开关已打开，但生物钟启动失败（看插件日志）。');
      }
      if (!afterPlatformStart.qq && beforePlatformStart.qq) {
        const stopped = await stopBridge();
        // 不要写 result.bridge：前端把它当成「已重启」并显示错误提示；启停单独记。
        result.bridgeStop = stopped;
        result.warnings.push(stopped.ok
          ? 'QQ 启动开关已关闭：QQ 桥接已停止。'
          : `QQ 启动开关已关闭，但桥接没停下来：${stopped.error ?? stopped.message ?? '未知'}`);
      } else if (afterPlatformStart.qq && !beforePlatformStart.qq && body.restartBridge !== true) {
        const started = await startBridge({ dshWebUrl: currentDshUrl() });
        result.bridgeStart = started;
        result.warnings.push(started.ok
          ? 'QQ 启动开关已打开：QQ 桥接已启动。'
          : `QQ 启动开关已打开，但桥接启动失败：${started.error ?? started.message ?? '未知'}`);
      }
    }
    if (body.restartBridge === true) {
      // 开关关掉时不允许「保存并重启」把 QQ 又拉起来；否则用户刚关的开关会被绕过。
      if (!platformStartEnabled('qq')) {
        result.warnings.push('QQ 启动开关已关闭：已跳过「保存并重启 QQ 桥接」。');
      } else {
        const restart = await restartBridge({ dshWebUrl: currentDshUrl() });
        result.bridge = restart;
        if (!restart.ok) result.warnings.push(`桥接重启失败：${restart.error ?? restart.message ?? '未知'}`);
      }
    }
    // 保存成功后把新的文件戳一起回传：客户端据此更新下一次保存的 baseStamp。
    // 不回传的话，第一次保存之后文件 mtime 已变，客户端仍拿旧戳 → 第二次保存必被判 CONFIG_STALE。
    result.stamps = {
      qq: fileStamp(QQ_CONFIG),
      bili: fileStamp(BILI_CONFIG),
      unified: fileStamp(path.join(STATE_DIR, 'config.json')),
    };
    json(res, 200, result);
  }

  // ── 角色人格 ────────────────────────────────────────────────────────────
  async function handleCharacters(req, res, url) {
    if (req.method === 'GET') {
      const id = String(url.searchParams.get('id') ?? '').trim();
      try {
        json(res, 200, id ? characterDetail(id) : { ...characterOverview(), migration: characterMigration });
      } catch (error) {
        json(res, 404, { ok: false, error: String(error?.message ?? error) });
      }
      return;
    }
    let body = {};
    try { body = await readJsonBody(req, 16 * 1024 * 1024); } catch { json(res, 400, { ok: false, error: '请求体不是合法 JSON' }); return; }
    const action = String(body.action ?? '');
    const id = String(body.id ?? readCurrentCharacter()?.id ?? '').trim();
    try {
      if (action === 'create') {
        const created = createCharacterFromPayload(body);
        if (body.load === true) {
          const switched = await switchCharacterEverywhere(created.character.id);
          json(res, 200, { ok: true, created, switched });
        } else {
          json(res, 200, created);
        }
        return;
      }
      if (action === 'load') {
        if (!id) throw new Error('缺少角色 id');
        json(res, 200, await switchCharacterEverywhere(id));
        return;
      }
      if (action === 'update') {
        if (!id) throw new Error('缺少角色 id');
        json(res, 200, updateCharacterFromPayload(id, body));
        return;
      }
      if (action === 'snapshot') {
        if (!id) throw new Error('缺少角色 id');
        json(res, 200, manualSnapshot(id, { label: String(body.label ?? '') }));
        return;
      }
      if (action === 'auto-snapshot') {
        if (!id) throw new Error('缺少角色 id');
        json(res, 200, autoSnapshot(id, { force: body.force === true }));
        return;
      }
      if (action === 'restore') {
        if (!id) throw new Error('缺少角色 id');
        const current = readCurrentCharacter();
        if (!current || current.id !== id) throw new Error('只能回档当前角色；先加载这个角色再回档');
        const skipPlatform = process.env.SURFCORE_DISABLE_PLATFORM_RESTART === '1';
        const wasRunning = skipPlatform ? false : (await bridgeStatus()).running;
        await memoryCardIdle();
        if (!skipPlatform && scheduler?.retire) await scheduler.retire();
        scheduler = null;
        schedulerStatus = { running: false, startedAt: null, lastError: null, lastTickAt: null };
        if (wasRunning) {
          await stopAllBridgeSessions();
          const stopped = await stopBridge();
          if (!stopped.ok) {
            if (!skipPlatform) startSchedulerNow();
            throw new Error(`回档失败：QQ 桥接没停下来（${stopped.error || stopped.message || '未知原因'}）`);
          }
        }
        const restored = restoreCharacterSnapshot(id, String(body.slot ?? ''));
        writeCharacterRolePointer();
        archiveBridgeRuntimeState();
        await runMemoryCardMaintenance({}).catch((error) => pluginLog('回档后整理记忆卡失败：', error?.message ?? error));
        if (wasRunning) await startBridge({ dshWebUrl: currentDshUrl() });
        if (!skipPlatform) startSchedulerNow();
        json(res, 200, { ...restored, bridgeRestarted: wasRunning, scheduler: schedulerStatus });
        return;
      }
      if (action === 'migrate') {
        json(res, 200, ensureCharacterSystem());
        return;
      }
      if (action === 'delete') {
        if (!id) throw new Error('缺少角色 id');
        json(res, 200, deleteCharacter(id));
        return;
      }
      json(res, 400, { ok: false, error: `未知 action：${action}` });
    } catch (error) {
      json(res, 400, { ok: false, error: String(error?.message ?? error) });
    }
  }

  // ── 人设卡 ──────────────────────────────────────────────────────────────
  async function handleGroupPolicy(req, res) {
    try {
      if (req.method === 'GET') {
        const r = await callBridge('/api/socialV2/group-policy');
        if (!r.ok) {
          json(res, 502, { ok: false, code: 'GROUP_POLICY_BRIDGE', error: r.error || '桥接不可用', hint: '先启动 QQ 桥接，再刷新设置页' });
          return;
        }
        json(res, 200, r.data);
        return;
      }
      if (req.method === 'POST') {
        const body = await readJsonBody(req);
        const r = await callBridge('/api/socialV2/group-policy', { method: 'POST', body });
        if (!r.ok) {
          json(res, 502, { ok: false, code: 'GROUP_POLICY_SAVE', error: r.error || '保存失败', hint: '检查桥接是否运行，再重试' });
          return;
        }
        json(res, 200, r.data);
        return;
      }
      json(res, 405, { ok: false, code: 'GROUP_POLICY_METHOD', error: '只支持 GET/POST' });
    } catch (error) {
      json(res, 400, { ok: false, code: 'GROUP_POLICY_FAILED', error: String(error?.message ?? error), hint: '检查桥接与配置' });
    }
  }

  async function handlePersonaClassify(req, res) {
    if (req.method !== 'POST') {
      json(res, 405, { ok: false, code: 'PERSONA_CLASSIFY_METHOD', error: '只支持 POST', hint: '用角色页的「智能拆分」按钮' });
      return;
    }
    try {
      const body = await readJsonBody(req);
      let text = String(body.text ?? '');
    if (layer === 'daily') text = withDailyIdentity(text);
      const drafts = await personaClassifier.classify(text);
      drafts.daily = withDailyIdentity(drafts.daily);
      json(res, 200, { ok: true, drafts, note: '这是草稿；请检查/编辑后逐层保存。' });
    } catch (error) {
      json(res, 400, {
        ok: false,
        code: String(error?.code || 'PERSONA_CLASSIFY_FAILED'),
        error: String(error?.message ?? error),
        hint: String(error?.code || '').includes('UNAVAILABLE')
          ? '确认 DSH 模型服务已就绪；也可以手动填写各层'
          : '检查人格卡内容，或手动填写各层',
      });
    }
  }

  function personaIdentityLine() {
    const cur = readCurrentCharacter();
    const name = String(cur?.name || '').trim() || '这个角色';
    let admin = {};
    try {
      const unified = readUnified();
      const qq = readQqConfig();
      admin = adminSummary(unified?.config?.admin ?? qq?.config?.admin);
    } catch {}
    const owner = String(admin?.displayName || '').trim() || '主人';
    return `你是${name}；你的主人是${owner}。`;
  }

  function withDailyIdentity(text, identity = personaIdentityLine()) {
    const body = String(text ?? '').trim();
    if (!body) return identity;
    if (body.includes(identity)) return body;
    // 已有明确“我是谁/主人是谁”的旧日常也保留，不重复堆。
    if (/你是|我是/.test(body) && /主人/.test(body)) return body;
    return `${identity}

${body}`;
  }

  async function handleLimitMute(req, res) {
    if (req.method !== 'POST') { json(res, 405, { ok: false, code: 'LIMIT_MUTE_METHOD', error: '只支持 POST' }); return; }
    try {
      const body = await readJsonBody(req);
      const r = await callBridge('/api/socialV2/limit-mute', { method: 'POST', body });
      if (!r.ok) { json(res, 502, { ok: false, code: 'LIMIT_MUTE_BRIDGE', error: r.error || '桥接不可用', hint: '先启动/重启 QQ 桥接' }); return; }
      json(res, 200, r.data);
    } catch (error) {
      json(res, 400, { ok: false, code: 'LIMIT_MUTE_FAILED', error: String(error?.message ?? error), hint: '刷新错误报告后重试' });
    }
  }

  async function handlePersona(req, res) {
    const layerPaths = () => {
      const layers = activePersonaLayers();
      return layers ? {
        core: layers.core || resolvePersonaFile(),
        daily: layers.daily,
        tone: layers.tone,
        scenes: layers.scenes,
        scenesDir: layers.scenesDir,
      } : { core: resolvePersonaFile(), daily: '', tone: '', scenes: {}, scenesDir: '' };
    };
    const sceneLabels = { 'qq-group': 'QQ 群聊', 'qq-private': 'QQ 私聊', bili: 'B站', pet: '桌宠' };
    if (req.method === 'GET') {
      const paths = layerPaths();
      const core = readTextFile(paths.core);
      const daily = paths.daily ? withDailyIdentity(readTextFile(paths.daily)) : withDailyIdentity('');
      const scenes = {};
      for (const [id, file] of Object.entries(paths.scenes || {})) {
        scenes[id] = { path: file, text: readTextFile(file), chars: readTextFile(file).length };
      }
      const backups = listBackups(120).filter((item) => /^persona(?:-|$)/.test(item.name));
      json(res, 200, {
        ok: true,
        path: paths.core,
        text: core,
        chars: core.length,
        mtime: mtimeIso(paths.core),
        layers: {
          core: { path: paths.core, text: core, chars: core.length },
          tone: { path: paths.tone, text: readTextFile(paths.tone), chars: readTextFile(paths.tone).length },
          daily: { path: paths.daily, text: daily, chars: daily.length },
          scenes,
        },
        sceneLabels,
        backups,
        note: '人格卡分层：persona.md 是核心；persona.tone.md 是语气；persona.daily.md 是日常；persona.scenes/* 是场景。所有层都手动编辑，不会自动改写。',
      });
      return;
    }
    const body = await readJsonBody(req);
    if (body.action === 'restore') {
      const name = safeBackupName(body.name);
      if (!name) { json(res, 400, { ok: false, error: '备份名非法' }); return; }
      const source = path.join(BACKUP_DIR, name);
      if (!fs.existsSync(source)) { json(res, 404, { ok: false, code: 'PERSONA_BACKUP_MISSING', error: '备份不存在', hint: '刷新备份列表后重试' }); return; }
      const paths = layerPaths();
      let target = paths.core;
      let label = 'persona';
      if (name.startsWith('persona-daily-')) { target = paths.daily; label = 'persona-daily'; }
      else if (name.startsWith('persona-tone-')) { target = paths.tone; label = 'persona-tone'; }
      else if (name.startsWith('persona-scene-')) {
        const scene = Object.keys(sceneLabels).find((id) => name.startsWith(`persona-scene-${id}-`));
        if (!scene) { json(res, 400, { ok: false, code: 'PERSONA_SCENE_UNKNOWN', error: '备份对应的场景未知', hint: '检查备份文件名' }); return; }
        target = paths.scenes?.[scene] || '';
        label = `persona-scene-${scene}`;
      }
      if (!target) { json(res, 400, { ok: false, code: 'PERSONA_LAYER_UNAVAILABLE', error: '这个层在当前角色里没有路径（可能未启用角色系统）', hint: '先创建/加载角色' }); return; }
      backupFile(target, label);
      fs.copyFileSync(source, target);
      const cur = readCurrentCharacter();
      if (cur) touchCharacter(cur.id);
      json(res, 200, { ok: true, restored: name, target, text: readTextFile(target), layers: layerPaths() });
      return;
    }
    const layer = String(body.layer || 'core');
    const scene = String(body.scene || '');
    const paths = layerPaths();
    let target = paths.core;
    let label = 'persona';
    if (layer === 'tone') {
      target = paths.tone;
      label = 'persona-tone';
    } else if (layer === 'daily') {
      target = paths.daily;
      label = 'persona-daily';
    } else if (layer === 'scene') {
      if (!sceneLabels[scene]) { json(res, 400, { ok: false, code: 'PERSONA_SCENE_UNKNOWN', error: `未知场景：${scene}`, hint: '只支持 qq-group / qq-private / bili / pet' }); return; }
      target = paths.scenes?.[scene] || '';
      label = `persona-scene-${scene}`;
    }
    if (!target) {
      json(res, 400, { ok: false, code: 'PERSONA_LAYER_UNAVAILABLE', error: '这个层在当前角色里没有路径（可能未启用角色系统）', hint: '先创建/加载角色' });
      return;
    }
    const text = String(body.text ?? '');
    if (layer === 'core' && text.length < 50) { json(res, 400, { ok: false, code: 'PERSONA_CORE_TOO_SHORT', error: '人格核心太短（至少 50 字）', hint: '核心卡是每次注入的底座，不能留空' }); return; }
    if (text.length > 64 * 1024) { json(res, 400, { ok: false, code: 'PERSONA_TOO_LARGE', error: '人格内容超过 64KB', hint: '拆成核心/场景/日常层，或精简内容' }); return; }
    const scan = scanText(text);
    const severe = scan.secrets.length > 0 || scan.pii.some((hit) => hit.severe);
    if (severe) {
      json(res, 400, {
        ok: false,
        code: 'PERSONA_SENSITIVE',
        error: '人格内容里命中密钥/密码/身份证/住址规则，拒绝保存',
        hint: '删掉这些内容后再保存；人格卡不应包含凭据',
        labels: [...new Set([...scan.secrets, ...scan.pii.filter((h) => h.severe)].map((h) => h.label))],
      });
      return;
    }
    const backup = backupFile(target, label);
        writeTextAtomic(target, text.endsWith('\n') ? text : `${text}\n`);
    const cur = readCurrentCharacter();
    if (cur) touchCharacter(cur.id);
    json(res, 200, { ok: true, layer, scene: layer === 'scene' ? scene : '', chars: text.length, backup, path: target, layers: layerPaths() });
  }

  // ── 记忆 ────────────────────────────────────────────────────────────────
  async function handleMemory(req, res, url) {
    if (req.method === 'GET') {
      const previewChars = Math.max(200, Math.min(20_000, Number(url.searchParams.get('chars')) || 4000));
      json(res, 200, {
        ok: true,
        status: memoryStatus(),
        qqPreview: previewQqForBili({ maxChars: previewChars }),
        biliPreview: biliToQqStatus().briefPreview,
        audit: auditTail(40),
        policyVersion: PRIVACY_POLICY_VERSION,
      });
      return;
    }
    const body = await readJsonBody(req);
    if (body.action === 'sync') {
      const result = syncQqToBili({ force: true });
      json(res, 200, result);
      return;
    }
    if (body.action === 'refresh-bili') {
      const result = await refreshBiliToQq({ callBridge });
      json(res, 200, result);
      return;
    }
    if (body.action === 'scan-align') {
      const qq = scanQqFeedForCandidates({ maxMessages: 1200 });
      const bili = await scanBiliFeedForCandidates({ maxPages: 2 });
      json(res, 200, { ok: true, qq, bili });
      return;
    }
    if (body.action === 'rebuild') {
      json(res, 200, { ok: true, ...rebuildAllPrompts() });
      return;
    }
    if (body.action === 'purge') {
      const feed = path.join(QQ_STATE_DIR(), 'qq-public-feed.jsonl');
      backupFile(activeMemoryPaths().qqForBili, 'qq-memory-before-purge');
      for (const file of [feed, activeMemoryPaths().qqForBili, path.join(activeMemoryPaths().dir, 'sync-state.json')]) {
        try { fs.rmSync(file, { force: true }); } catch {}
      }
      json(res, 200, { ok: true, purged: [feed, activeMemoryPaths().qqForBili].map(maskPath), note: '已清空 QQ→B站 记忆与原始公开 feed；对齐表不受影响。' });
      return;
    }
    json(res, 400, { ok: false, error: '未知 action' });
  }

  // ── 记忆卡（角色的长期记忆）──────────────────────────────────────────────
  // 和上面的「双向脱敏同步」不是一回事：memory 是 QQ⇄B站 的搬运；
  // memory-card 是她自己的记忆（冲浪 + 聊天 + 主人互动），带清晰度/遗忘/容量规则。
  async function handleMemoryCard(req, res, url) {
    const config = readUnified().config.memoryCard;
    if (req.method === 'GET') {
      // 默认 80 条（外壳每 60 秒轮询一次）；「打开记忆文档」传 limit=300 拿更多可编辑记录。
      const recordLimit = Math.max(1, Math.min(500, Number(url?.searchParams?.get('limit')) || 80));
      const organize = config?.organize && typeof config.organize === 'object' ? config.organize : {};
      json(res, 200, {
        ...memoryCardSnapshot(config, { recordLimit }),
        organize: {
          enabled: organize.enabled === true,
          lastRunAt: Number(organize.lastRunAt) || 0,
          lastMerged: Number(organize.lastMerged) || 0,
          lastDropped: Number(organize.lastDropped) || 0,
          llmReady: memoryOrganizer.llmReady(),
        },
      });
      return;
    }
    const body = await readJsonBody(req);
    const action = String(body.action ?? '');
    if (action === 'diary') {
      const result = await memoryOrganizer.diary({ date: String(body.date || ''), force: body.force === true });
      if (!result.ok) { json(res, 400, result); return; }
      json(res, 200, { ...memoryCardSnapshot(config), diary: result });
      return;
    }
    if (action === 'forget-batch') {
      const ids = Array.isArray(body.ids) ? body.ids.map(String).slice(0, 200) : [];
      if (!ids.length) { json(res, 400, { ok: false, error: '没有选中任何记忆' }); return; }
      let removed = 0;
      for (const id of ids) {
        const result = await applyMemoryCardAction('forget', { id }, { config });
        if (result?.ok) removed += 1;
      }
      json(res, 200, { ...memoryCardSnapshot(config), removed });
      return;
    }
    if (action === 'organize') {
      const result = await memoryOrganizer.organize({
        ids: Array.isArray(body.ids) ? body.ids : null,
        force: body.force !== false,
      });
      if (!result.ok) { json(res, 400, result); return; }
      json(res, 200, { ...memoryCardSnapshot(config), organized: result });
      return;
    }
    if (action === 'organize-config') {
      saveUnified({ memoryCard: { organize: { enabled: body.enabled === true } } });
      json(res, 200, memoryCardSnapshot(config));
      return;
    }
    if (action === 'maintain') {
      const result = await runMemoryCardMaintenance({ forceDecay: body.forceDecay === true, config });
      const snapshot = memoryCardSnapshot(config);
      json(res, 200, { ...snapshot, changed: result.changed, addedBili: result.addedBili, addedQq: result.addedQq, addedPet: result.addedPet });
      return;
    }
    if (action === 'compact') {
      const result = await compactMemoryCardNow({ targetRatio: Number(body.targetRatio) || 0.8, config });
      json(res, 200, { ...memoryCardSnapshot(config), steps: result.steps });
      return;
    }
    if (action === 'restore') {
      const result = await restoreMemoryCardBackup(String(body.name ?? ''), { config });
      if (!result.ok) { json(res, 400, result); return; }
      json(res, 200, memoryCardSnapshot(config));
      return;
    }
    if (action === 'notify-test') {
      const result = await notifyOwnerIfNeeded({ callBridge, config });
      json(res, 200, result);
      return;
    }
    if (['pin', 'forget', 'ack', 'add', 'update', 'set-first-meet', 'clear-first-meet', 'merge-memories'].includes(action)) {
      const result = await applyMemoryCardAction(action, body, { config });
      if (!result.ok) { json(res, 400, result); return; }
      json(res, 200, memoryCardSnapshot(config));
      return;
    }
    json(res, 400, { ok: false, error: '未知 action' });
  }

  // ── 全量记忆卡（只存档；不参与日常提示词）───────────────────────────────
  async function handleMemoryCardFull(req, res, url) {
    if (req.method !== 'GET') { json(res, 405, { ok: false, error: '只读接口' }); return; }
    const q = String(url.searchParams.get('q') ?? '');
    const limit = Math.max(1, Math.min(200, Number(url.searchParams.get('limit')) || 40));
    json(res, 200, fullMemoryCardSnapshot({ q, limit, config: readUnified().config.memoryCard }));
  }

  // ── 身份对齐 ────────────────────────────────────────────────────────────
  async function handleAlign(req, res) {
    if (req.method === 'GET') {
      json(res, 200, {
        ok: true,
        labelsSupported: true,
        links: listLinks(),
        candidates: listCandidates(),
        stats: alignStats(),
        platforms: platforms.list(),
        briefs: {
          qqChars: readTextFile(QQ_ALIGNMENT_BRIEF).length,
          biliChars: readTextFile(BILI_ALIGNMENT_FILE).length,
        },
      });
      return;
    }
    const body = await readJsonBody(req);
    const action = String(body.action ?? '');
    if (action === 'add') { json(res, 200, { ok: true, link: addLink(body.link ?? body) }); return; }
    if (action === 'update') { json(res, 200, { ok: true, link: updateLink(String(body.id), body.link ?? body.patch ?? {}) }); return; }
    if (action === 'remove') { json(res, 200, { ok: true, ...removeLink(String(body.id)) }); return; }
    if (action === 'approve') { json(res, 200, { ok: true, link: approveCandidate(String(body.id), body.overrides ?? {}) }); return; }
    if (action === 'reject') { json(res, 200, { ok: true, ...rejectCandidate(String(body.id)) }); return; }
    if (action === 'scan') {
      const qq = scanQqFeedForCandidates({ maxMessages: 1200 });
      const bili = await scanBiliFeedForCandidates({ maxPages: 2 });
      json(res, 200, { ok: true, qq, bili, candidates: listCandidates() });
      return;
    }
    if (action === 'import') { json(res, 200, { ok: true, state: importAlignments(body.payload ?? body.data, { merge: body.merge !== false }) }); return; }
    if (action === 'export') { json(res, 200, { ok: true, ...exportAlignments() }); return; }
    json(res, 400, { ok: false, error: '未知 action' });
  }

  // ── 模式 / ownerQQ ─────────────────────────────────────────────────────
  async function handleMode(req, res) {
    if (req.method === 'GET') {
      let dshSetting = null;
      try {
        const settings = ctx.get('settings');
        if (settings?.describe) {
          const rows = settings.describe({ redactSecrets: true });
          const row = rows.find((item) => item.ns === 'qq-mode');
          if (row) dshSetting = row.value;
        }
      } catch {}
      json(res, 200, { ok: true, ...parseModeState(), dshSetting });
      return;
    }
    const body = await readJsonBody(req);
    const mode = body.mode ? String(body.mode) : null;
    const ownerQQ = body.ownerQQ === undefined ? undefined : (body.ownerQQ === '' || body.ownerQQ === null ? null : String(body.ownerQQ));
    if (mode && !['chat', 'closed-agent', 'reserved', 'reserved2', 'simulation'].includes(mode)) {
      json(res, 400, { ok: false, error: 'mode 必须是 chat / closed-agent / reserved / reserved2 / simulation' });
      return;
    }
    const stateFile = path.join(QQ_STATE_DIR(), 'mode.json');
    const current = readJson(stateFile, {}) ?? {};
    const next = { ...current, ...(mode ? { mode } : {}) };
    writeJsonAtomic(stateFile, next);
    const settings = ctx.get('settings');
    if (settings?.update) {
      try {
        await settings.update('qq-mode', {
          ...(mode ? { mode } : {}),
          ...(ownerQQ !== undefined ? { ownerQQ: ownerQQ ?? '' } : {}),
        });
      } catch (error) {
        pluginLog('写 DSH qq-mode 设置失败（本地 mode.json 已写）：', error?.message ?? error);
      }
    }
    if (ownerQQ !== undefined) {
      const qq = readQqConfig().config;
      qq.ownerQQ = ownerQQ;
      saveQqConfig(qq);
    }
    if (mode) {
      try { await callBridge('/api/mode', { method: 'POST', body: { mode } }); } catch {}
    }
    json(res, 200, { ok: true, mode: mode ?? current.mode ?? null, ownerQQ: ownerQQ ?? null, note: '若桥接未运行，下次启动时生效。' });
  }

  // ── 诊断 / 备份 ─────────────────────────────────────────────────────────
  // ── 新手体检（只读）＋ 一键配置（只写"缺失项"，绝不覆盖已有值）────────────
  // 目标：新人装完点一下就知道"还差什么、在哪补"，不用去翻文档。
  function dshProfileWithSurfcore() {
    const root = path.join(DSH_HOME, 'profiles');
    let names = [];
    try { names = fs.readdirSync(root).filter((n) => { try { return fs.statSync(path.join(root, n)).isDirectory(); } catch { return false; } }); } catch { return ''; }
    for (const name of names) {
      // 两种都能作为"已装进 DSH"的证据：
      //   ① profile package.json 的 dsh.profile.bundles 里有 surfcore；
      //   ② cordis.patch.yml 里有我们托管的 mcp 条目（不同版本写的是不同 id）。
      try {
        const pkg = JSON.parse(fs.readFileSync(path.join(root, name, 'package.json'), 'utf8'));
        const bundles = pkg?.dsh?.profile?.bundles;
        if (Array.isArray(bundles) && bundles.includes('surfcore')) return name;
      } catch {}
      try {
        const patch = fs.readFileSync(path.join(root, name, 'cordis.patch.yml'), 'utf8');
        if (/surfcore|mcp-snowluma/.test(patch)) return name;
      } catch {}
    }
    return '';
  }

  async function installChecks() {
    const all = readAll();
    const qqCfg = readQqConfig().config ?? {};
    const snow = qqCfg.snowluma ?? {};
    let snowState = { state: 'unknown', hint: '' };
    try { snowState = await diagnoseSnowLuma(snow); } catch {}
    const bridgeSrc = path.join(QQBOT_ROOT, 'src', 'bridge.js');
    return buildInstallChecks({
      nodeVersion: process.versions.node,
      hasUnified: readUnified().hasUserFile,
      unifiedMasked: maskPath(UNIFIED_FILE),
      ownerQQ: String(all.unified?.admin?.qq ?? '').trim(),
      groups: Array.isArray(qqCfg.allow?.groups) ? qqCfg.allow.groups : [],
      privates: Array.isArray(qqCfg.allow?.private) ? qqCfg.allow.private : [],
      snow,
      snowState,
      bridgeSrc: fs.existsSync(bridgeSrc),
      bridgeMasked: maskPath(bridgeSrc),
      profile: dshProfileWithSurfcore(),
      token: String(qqCfg.consoleToken ?? '').trim(),
    });
  }

  let installJob = { running: false, startedAt: null, finishedAt: null, steps: [] };

  function installStep(key, name) {
    const step = { key, name, status: 'running', detail: '', at: new Date().toISOString() };
    installJob.steps.push(step);
    return step;
  }

  function runCommand(cmd, args, { cwd, timeoutMs = 600_000 } = {}) {
    return new Promise((resolve) => {
      const child = spawn(cmd, args, { cwd, windowsHide: true, shell: process.platform === 'win32' });
      let out = '';
      const timer = setTimeout(() => { try { child.kill(); } catch {} }, timeoutMs);
      child.stdout?.on('data', (d) => { out += String(d).slice(0, 4000); });
      child.stderr?.on('data', (d) => { out += String(d).slice(0, 4000); });
      child.on('error', (error) => { clearTimeout(timer); resolve({ ok: false, out: String(error?.message ?? error) }); });
      child.on('close', (code) => { clearTimeout(timer); resolve({ ok: code === 0, out: out.trim() }); });
    });
  }

  async function runInstall(opts) {
    const done = (step, ok, detail = '') => { step.status = ok ? 'ok' : 'fail'; step.detail = String(detail).slice(0, 600); };
    try {
      // 1) 依赖
      const depsStep = installStep('deps', '安装依赖（npm install）');
      if (fs.existsSync(path.join(QQBOT_ROOT, 'node_modules', '.package-lock.json')) || fs.existsSync(path.join(QQBOT_ROOT, 'node_modules', 'express'))) {
        done(depsStep, true, '已经装过，跳过');
      } else {
        const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
        const r = await runCommand(npm, ['install', '--no-audit', '--no-fund'], { cwd: QQBOT_ROOT, timeoutMs: 900_000 });
        done(depsStep, r.ok, r.ok ? '完成' : (r.out.slice(-400)));
        if (!r.ok) throw new Error('依赖安装失败');
      }

      // 2) 装进 DSH
      const dshStep = installStep('dsh', '装进 DSH（预设 / MCP / bundle）');
      if (dshProfileWithSurfcore()) {
        done(dshStep, true, '已注册，跳过');
      } else {
        // profile 必须跟着"当前 DSH 用的那个"走：setup-dsh 默认写 web，
        // 而用户可能是 desktop/自定义 profile —— 写错地方插件根本不会出现。
        let profile = String(process.env.DSH_PROFILE ?? '').trim();
        if (!profile) {
          try {
            const names = fs.readdirSync(path.join(DSH_HOME, 'profiles')).filter((n) => fs.statSync(path.join(DSH_HOME, 'profiles', n)).isDirectory() && !n.includes('.'));
            profile = names.includes('web') ? 'web' : (names[0] ?? 'web');
          } catch { profile = 'web'; }
        }
        const r = await runCommand(process.execPath, [path.join(QQBOT_ROOT, 'scripts', 'setup-dsh.mjs'), profile], { cwd: QQBOT_ROOT, timeoutMs: 120_000 });
        done(dshStep, r.ok, r.ok ? '已注册（重启 DSH 生效）' : (r.out.slice(-400)));
      }

      // 3) 配置与令牌
      const cfgStep = installStep('config', '生成配置 / 控制台令牌');
      const changed = doctorFix({ ownerQQ: opts.ownerQQ });
      done(cfgStep, true, changed.length ? changed.join('、') : '已经齐了');

      // 4) SnowLuma 端点 / token
      const snowStep = installStep('snowluma', '发现并写入 SnowLuma 连接');
      try {
        const found = await discoverSnowLumaConnection({ cfg: readQqConfig().config ?? {}, timeoutMs: 4000 });
        if (found.ok) {
          const snow = { httpUrl: found.baseUrl };
          if (found.wsUrl) snow.wsUrl = found.wsUrl;
          if (found.token) snow.accessToken = found.token;
          // 2026-11：WS 通道有自己的令牌，漏写会导致 HTTP 能通但 connected 永远 false
          if (found.wsToken) snow.wsToken = found.wsToken;
          saveQqConfig({ snowluma: snow });
          done(snowStep, true, `已连上 ${found.self?.nickname ?? ''}（${found.self?.user_id ?? ''}）`);
        } else {
          done(snowStep, false, String(found.error ?? '没连上：先启动 SnowLuma 并扫码登录'));
        }
      } catch (error) { done(snowStep, false, String(error?.message ?? error)); }

      // 5) 主人 + 白名单
      const idStep = installStep('identity', '写入主人 QQ 与白名单');
      if (opts.groups.length) {
        // 保留用户已有私聊白名单，只追加主人（2026-10-31：以前 [owner] 整体替换会冲掉用户加的人）
        const { allow, warnings } = normalizeAllowlist({
          allow: { ...(readQqConfig().config?.allow ?? {}), groups: opts.groups },
          ownerQQ: opts.ownerQQ,
        });
        saveQqConfig({ allow });
        for (const w of warnings) pluginLog(`[安装] 白名单：${w.code} ${w.message}`);
        done(idStep, true, `${opts.groups.length} 个群${opts.ownerQQ ? ' + 主人私聊' : ''}${warnings.length ? `（${warnings.length} 条修正）` : ''}`);
      } else {
        done(idStep, true, '没选群，跳过（之后在设置 → QQ → 白名单里加）');
      }

      // 6) 起桥接
      const bridgeStep = installStep('bridge', '启动 QQ 桥接');
      try {
        const before = await bridgeStatus().catch(() => ({ running: false }));
        if (before.running) done(bridgeStep, true, `已在运行（端口 ${before.port}）`);
        else {
          await startBridge({ dshWebUrl: currentDshUrl() });
          done(bridgeStep, true, '已启动');
        }
      } catch (error) { done(bridgeStep, false, String(error?.message ?? error)); }
    } catch (error) {
      const last = installJob.steps[installJob.steps.length - 1];
      if (last && last.status === 'running') { last.status = 'fail'; last.detail = String(error?.message ?? error); }
    } finally {
      installJob.running = false;
      installJob.finishedAt = new Date().toISOString();
    }
  }

  function doctorFix(body) {
    const all = readAll();
    const qqCfg = readQqConfig().config ?? {};
    const actions = planDoctorFix({
      hasUnified: readUnified().hasUserFile,
      hasToken: Boolean(String(qqCfg.consoleToken ?? '').trim()),
      ownerQQ: body?.ownerQQ,
      currentOwnerQQ: all.unified?.admin?.qq,
    });
    for (const action of actions) {
      if (action.startsWith('生成统一配置')) saveUnified({});
      else if (action.startsWith('生成控制台令牌')) saveQqConfig({ consoleToken: randomUUID().replace(/-/g, '') });
      else if (action.startsWith('写入管理员 QQ')) saveUnified({ admin: { qq: String(body.ownerQQ).trim() } });
    }
    return actions;
  }

  async function handleDiagnostics(req, res) {
    if (req.method === 'GET') {
      const checks = [];
      const add = (name, ok, detail = '') => checks.push({ name, ok: Boolean(ok), detail });
      add('QQ 桥接源码', fs.existsSync(path.join(QQBOT_ROOT, 'src', 'bridge.js')), maskPath(path.join(QQBOT_ROOT, 'src', 'bridge.js')));
      add('B站工具链', fs.existsSync(BILI_MJS), maskPath(BILI_MJS));
      add('贴吧工具链', fs.existsSync(TIEBA_MJS), maskPath(TIEBA_MJS));
      const tiebaAuth = resolveTiebaAuth();
      const tiebaCredFile = path.join(TIEBA_DIR, 'credentials.json');
      add('贴吧凭据文件', fs.existsSync(tiebaCredFile), fs.existsSync(tiebaCredFile) ? '已写入（不回显内容）' : '暂无');
      add('贴吧认证状态', tiebaConfig().enabled === true
        ? (tiebaAuth.bduss ? `已配置（BDUSS，来源：${tiebaAuth.source === 'manual' ? '配置文件' : '设置页'}）` : '未配置（请粘贴 BDUSS）')
        : '未启用');
      add('B站配置', fs.existsSync(BILI_CONFIG), maskPath(BILI_CONFIG));
      add('B站 cookie', fs.existsSync(BILI_CRED), fs.existsSync(BILI_CRED) ? '已写入（不回显内容）' : '未写入');
      add('人设卡', fs.existsSync(resolvePersonaFile()), maskPath(resolvePersonaFile()));
      const qqMemoryOn = readAll().unified.memory?.qqToBili?.enabled === true;
      add('QQ→B站记忆', qqMemoryOn ? fs.existsSync(activeMemoryPaths().qqForBili) : true,
        qqMemoryOn ? maskPath(activeMemoryPaths().qqForBili) : '未开启（正常）');
      let ffmpeg = false;
      try {
        const result = await new Promise((resolve) => execFile('ffmpeg', ['-version'], { timeout: 5000, windowsHide: true }, (error) => resolve(!error)));
        ffmpeg = result;
      } catch {}
      add('ffmpeg（可选）', ffmpeg, ffmpeg ? '可用' : '未安装：只影响“抽帧看画面”');
      let bridge = { running: false };
      try { bridge = await bridgeStatus(); } catch {}
      add('QQ 桥接', bridge.running, bridge.running ? `端口 ${bridge.port}` : '未运行');
      const install = await installChecks();

      // 同名检查只留一条（installChecks 与旧 checks 有重叠，比如"QQ 桥接源码"）。
      const seen = new Set();
      const allChecks = [...install, ...checks].filter((c) => (seen.has(c.name) ? false : (seen.add(c.name), true)));
      json(res, 200, { ok: allChecks.every((c) => c.ok || c.name.includes('可选')), checks: allChecks, installOk: installOk(install), install: installJob, bridge, paths: pathSummary() });
      return;
    }
    const body = await readJsonBody(req);
    // ── 一键安装：发现 SnowLuma → 拉群 → 写配置（只写这一台机器上真实存在的群）
    if (body.action === 'install-scan') {
      const cfg = readQqConfig().config ?? {};
      let found = { ok: false, error: '未探测' };
      try { found = await discoverSnowLumaConnection({ cfg, timeoutMs: 4000 }); } catch (error) { found = { ok: false, error: String(error?.message ?? error) }; }
      let groups = [];
      if (found.ok) {
        try {
          const resp = await fetch(`${found.baseUrl}/get_group_list`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...(found.token ? { Authorization: `Bearer ${found.token}` } : {}) },
            body: '{}',
          });
          const data = await resp.json().catch(() => ({}));
          groups = (Array.isArray(data?.data) ? data.data : [])
            .map((g) => ({ id: String(g.group_id ?? ''), name: String(g.group_name ?? '') }))
            .filter((g) => /^\d{5,15}$/.test(g.id));
        } catch {}
      }
      json(res, 200, {
        ok: found.ok,
        error: found.ok ? '' : String(found.error ?? '连不上 SnowLuma'),
        snow: {
          online: Boolean(found.ok),
          uin: String(found.self?.user_id ?? ''),
          nickname: String(found.self?.nickname ?? ''),
          httpUrl: found.baseUrl ?? '',
          wsUrl: found.wsUrl ?? '',
          hasToken: Boolean(found.token),
          wsToken: Boolean(found.wsToken),
        },
        groups,
      });
      return;
    }
    // ── 一键安装：把整机装成"能用"的状态（依赖 → 装进 DSH → 配置 → SnowLuma → 白名单 → 桥接）
    if (body.action === 'install-run') {
      if (installJob.running) { json(res, 200, { ok: true, install: installJob }); return; }
      const opts = {
        ownerQQ: String(body.ownerQQ ?? '').trim(),
        groups: (Array.isArray(body.groups) ? body.groups : []).map((g) => String(g ?? '').trim()).filter((g) => /^\d{5,15}$/.test(g)),
      };
      installJob = { running: true, startedAt: new Date().toISOString(), finishedAt: null, steps: [] };
      void runInstall(opts);
      json(res, 200, { ok: true, install: installJob });
      return;
    }
    if (body.action === 'install-apply') {
      const changed = [];
      const cfg = readQqConfig().config ?? {};
      // 1) 端点 / token：服务端再发现一次（不把 token 交给浏览器）
      if (body.discoverSnow !== false) {
        try {
          const found = await discoverSnowLumaConnection({ cfg, timeoutMs: 4000 });
          if (found.ok) {
            const snow = { httpUrl: found.baseUrl };
            if (found.wsUrl) snow.wsUrl = found.wsUrl;
            if (found.token) snow.accessToken = found.token;
            // 2026-11：WS 通道有自己的令牌，漏写会导致 HTTP 能通但 connected 永远 false
            if (found.wsToken) snow.wsToken = found.wsToken;
            saveQqConfig({ snowluma: snow });
            changed.push('写入 SnowLuma 地址与 token');
          }
        } catch {}
      }
      // 2) 主人 QQ（用户确认过的才写）
      const owner = String(body.ownerQQ ?? '').trim();
      if (/^\d{5,15}$/.test(owner)) {
        saveUnified({ admin: { qq: owner } });
        changed.push('写入管理员 QQ');
      }
      // 3) 白名单：只写用户点过 confirm 的那些群
      const groups = (Array.isArray(body.groups) ? body.groups : [])
        .map((g) => String(g ?? '').trim())
        .filter((g) => /^\d{5,15}$/.test(g));
      if (body.applyGroups && groups.length) {
        // 同样保留现有私聊白名单（2026-10-31 反馈：安装/诊断修复后用户加的人丢失）
        const { allow, warnings } = normalizeAllowlist({
          allow: { ...(cfg.allow ?? {}), groups },
          ownerQQ: owner || cfg.ownerQQ || '',
        });
        saveQqConfig({ allow });
        for (const w of warnings) pluginLog(`[install-apply] 白名单：${w.code} ${w.message}`);
        changed.push(`写入白名单（${groups.length} 个群${owner ? ' + 主人私聊' : ''}${warnings.length ? `，${warnings.length} 条修正` : ''}）`);
      }
      // 4) 配置骨架 / 控制台令牌
      for (const action of doctorFix({ ownerQQ: owner })) {
        if (!changed.includes(action)) changed.push(action);
      }
      json(res, 200, { ok: true, changed, needRestart: changed.some((c) => /DSH|白名单/.test(c)) });
      return;
    }
    if (body.action === 'doctor-fix') {
      const changed = doctorFix(body);
      json(res, 200, { ok: true, changed, restartRequired: changed.length > 0 });
      return;
    }
    if (body.action === 'backup') {
      const created = [];
      for (const [label, file] of [
        ['qq-config', QQ_CONFIG], ['bili-config', BILI_CONFIG], ['unified-config', path.join(STATE_DIR, 'config.json')],
        ['persona', resolvePersonaFile()], ['alignments', ALIGN_FILE],
        ['qq-memory', activeMemoryPaths().qqForBili], ['qq-alignment', QQ_ALIGNMENT_BRIEF], ['bili-alignment', BILI_ALIGNMENT_FILE],
      ]) {
        const out = backupFile(file, label);
        if (out) created.push({ label, file: maskPath(out) });
      }
      json(res, 200, { ok: true, created });
      return;
    }
    if (body.action === 'restore') {
      const name = safeBackupName(body.name);
      if (!name) { json(res, 400, { ok: false, error: '备份名非法' }); return; }
      const source = path.join(BACKUP_DIR, name);
      if (!fs.existsSync(source)) { json(res, 404, { ok: false, code: 'PERSONA_BACKUP_MISSING', error: '备份不存在', hint: '刷新备份列表后重试' }); return; }
      const map = [
        ['qq-config-', QQ_CONFIG], ['bili-config-', BILI_CONFIG], ['unified-config-', path.join(STATE_DIR, 'config.json')],
        ['persona-', resolvePersonaFile()], ['alignments-', ALIGN_FILE],
      ];
      const hit = map.find(([prefix]) => name.startsWith(prefix));
      if (!hit) { json(res, 400, { ok: false, error: '这个备份不支持一键恢复（请手动复制）' }); return; }
      backupFile(hit[1], 'before-restore');
      fs.copyFileSync(source, hit[1]);
      json(res, 200, { ok: true, restored: name, target: maskPath(hit[1]) });
      return;
    }
    json(res, 400, { ok: false, error: '未知 action' });
  }

  // ── SnowLuma 启动（只打开本机已安装程序，不安装、不部署、不代扫码）──────
  // 默认关闭；必须用户在设置页显式开启 snowluma.allowLaunch，且只在点击
  // 「一键启动 / 打开 SnowLuma」时执行。源码/测试里的 L6 边界仍保持：
  // MCP 工具面没有 start_snowluma，桥接本身也只探测不启动。
  function portOpen(port, timeout = 600) {
    return new Promise((resolve) => {
      const socket = net.connect({ port, host: '127.0.0.1' });
      const done = (ok) => { socket.destroy(); resolve(ok); };
      socket.setTimeout(timeout);
      socket.once('connect', () => done(true));
      socket.once('timeout', () => done(false));
      socket.once('error', () => done(false));
    });
  }

  function resolveSnowLumaLauncher() {
    const cfg = readQqConfig().config?.snowluma ?? {};
    const explicit = String(cfg.launchScript ?? '').trim();
    if (explicit) return path.isAbsolute(explicit) ? explicit : path.resolve(QQBOT_ROOT, explicit);
    const base = String(cfg.launcherPath ?? '').trim();
    if (!base) return '';
    const root = path.isAbsolute(base) ? base : path.resolve(QQBOT_ROOT, base);
    const candidates = [
      path.join(root, 'app', 'launcher.bat'),
      path.join(root, 'launcher.bat'),
      path.join(root, 'SnowLuma.exe'),
    ];
    return candidates.find((file) => { try { return fs.existsSync(file); } catch { return false; } }) ?? '';
  }

  // SnowLuma 安装位置识别：规则在 snowluma-install.js（「检测」与「浏览…」共用同一套，
  // 避免两边各猜各的）。这里只负责把当前 QQ 配置喂进去。
  function findSnowLumaInstall(extraPaths = []) {
    const snow = readQqConfig().config?.snowluma ?? {};
    return findSnowLumaInstallIn({ snowluma: snow, extraPaths });
  }

  // SnowLuma 没有原生窗口，它的界面是 WebUI（默认 http://127.0.0.1:5099）。
  // 端口从 SnowLuma 自己的 runtime.json 读，读不到就回退 5099（SnowLuma 2.3.x 默认）。
  function snowLumaWebui() {
    const cfg = readQqConfig().config?.snowluma ?? {};
    let port = 5099;
    try {
      const root = String(cfg.launcherPath ?? '').trim();
      if (root) {
        const runtime = JSON.parse(fs.readFileSync(path.join(root, 'app', 'config', 'runtime.json'), 'utf8'));
        if (Number(runtime?.webuiPort) > 0) port = Number(runtime.webuiPort);
      }
    } catch {}
    return { port, url: `http://127.0.0.1:${port}` };
  }

  // 面板直连 SnowLuma WebUI：账号列表 / QQ 注入进程都在设置页里管（密码只存本机，不回显）。
  const snowlumaWebuiClient = createSnowLumaWebuiClient({
    baseUrl: () => snowLumaWebui().url,
    readConfig: () => readQqConfig().config ?? {},
    saveConfig: (patch) => saveQqConfig(patch),
    log: pluginLog,
  });

  // 只用系统默认浏览器打开本地回环地址；URL 由端口拼出，不接受外部输入。
  function openLocalUrl(url) {
    if (process.env.SURFCORE_SKIP_AUTOSTART === '1') return false;
    if (!/^http:\/\/127\.0\.0\.1:\d{2,5}$/.test(String(url))) return false;
    try {
      spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/c', 'start', '""', `"${url}"`], {
        detached: true, stdio: 'ignore', windowsHide: true, windowsVerbatimArguments: true,
      }).unref();
      return true;
    } catch {
      return false;
    }
  }

  // SnowLuma 连不上时到底卡在哪一步：进程没起 / 停在登录页 / token 或端口不对。
  // 桥接的 goodError 只有一句 fetch failed，光看它没法给用户任何可执行的信息。
  async function diagnoseSnowLuma(bridgeSnow = {}) {
    if (bridgeSnow.connected === true) return { state: 'ok', hint: '' };
    const webui = snowLumaWebui();
    const onebot = (await portOpen(3000)) || (await portOpen(3001));
    const webuiUp = await portOpen(webui.port);
    if (onebot) {
      return {
        state: 'onebot-rejected',
        hint: 'OneBot 端口在监听但桥接连不上：多半是 accessToken 不匹配（对齐 config.json 的 snowluma.accessToken），或 httpUrl 指到了 WebSocket 端口',
      };
    }
    if (webuiUp) {
      return { state: 'needs-login', hint: `SnowLuma 已启动但还没登录：打开 ${webui.url} 扫码/登录` };
    }
    return { state: 'not-running', hint: 'SnowLuma 没在运行：设置 → SurfCore → 概览 → 一键启动（会按需打开控制台）' };
  }

  // SnowLuma 自带「发现 QQ 进程就自动注入」的开关：app/config/runtime.json 的 hookAutoLoad。
  // 出厂是 false，所以不手动去它控制台点「注入」就会卡在 QQ 这一步——这正是用户反馈的问题。
  function snowLumaRuntimeFile(root) {
    const base = String(root ?? '').trim();
    if (!base) return '';
    const abs = path.isAbsolute(base) ? base : path.resolve(QQBOT_ROOT, base);
    const file = path.join(abs, 'app', 'config', 'runtime.json');
    try { return fs.existsSync(file) ? file : ''; } catch { return ''; }
  }
  function enableSnowLumaAutoHook(root) {
    const file = snowLumaRuntimeFile(root);
    if (!file) return false;
    try {
      const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (raw?.hookAutoLoad === true) return true;
      fs.writeFileSync(file, `${JSON.stringify({ ...raw, hookAutoLoad: true }, null, 2)}\n`);
      pluginLog('[snowluma] 已开启自动注入（hookAutoLoad=true），以后不用再去控制台点「注入」');
      return true;
    } catch (error) {
      pluginLog('[snowluma] 开启自动注入失败：', error?.message ?? error);
      return false;
    }
  }
  // 本机有没有登录过的账号记录（app/config/onebot_<uin>.json）。
  // 有 ⇒ 以前扫码登录过，这次只是没注入/没连上，就不该再弹控制台打扰。
  function snowLumaHasLocalAccount(root) {
    const base = String(root ?? '').trim();
    if (!base) return false;
    const abs = path.isAbsolute(base) ? base : path.resolve(QQBOT_ROOT, base);
    try {
      return fs.readdirSync(path.join(abs, 'app', 'config'))
        .some((name) => /^onebot_\d+\.json$/.test(name));
    } catch { return false; }
  }

  // Windows 上要真正「不出现控制台窗口」，只能靠 wscript 的 Run(cmd, 0, False)。
  // 实测 Node 的 spawn({ windowsHide: true, detached: true }) 仍会弹出一个 Windows Terminal 标签页
  // （标题就是 node.exe 路径），用户反馈的「SnowLuma 启动还有命令弹窗」就是这个。
  function spawnHidden(commandLine, cwd) {
    if (process.platform !== 'win32') {
      spawn(String(commandLine), [], { cwd, detached: true, stdio: 'ignore', windowsHide: true }).unref();
      return true;
    }
    const esc = (value) => String(value ?? '').replace(/"/g, '""');
    const vbs = [
      'Set sh = CreateObject("WScript.Shell")',
      `sh.CurrentDirectory = "${esc(cwd)}"`,
      `sh.Run "${esc(commandLine)}", 0, False`,
      '',
    ].join('\r\n');
    const file = path.join(os.tmpdir(), `surfcore-hidden-${process.pid}-${Date.now()}.vbs`);
    // VBScript 在 wscript 下按 UTF-16LE + BOM 读最稳
    fs.writeFileSync(file, Buffer.concat([Buffer.from([0xFF, 0xFE]), Buffer.from(vbs, 'utf16le')]));
    const child = spawn(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'wscript.exe'), ['//nologo', file], {
      detached: true, stdio: 'ignore', windowsHide: true,
    });
    child.unref();
    setTimeout(() => { try { fs.unlinkSync(file) } catch {} }, 60_000).unref?.();
    return true;
  }

  async function launchSnowLuma() {
    if (process.env.SURFCORE_SKIP_AUTOSTART === '1') {
      return { ok: true, skipped: true, message: '测试环境：跳过打开 SnowLuma' };
    }
    const cfg = readQqConfig().config?.snowluma ?? {};
    if (cfg.allowLaunch !== true) {
      return { ok: false, error: '未开启「允许插件打开 SnowLuma」：设置 → SurfCore → QQ → SnowLuma' };
    }
    const webui = snowLumaWebui();

    // 已登录（OneBot 3000/3001 在听）：什么都不用做，也别弹窗口。
    if (await portOpen(3000) || await portOpen(3001)) {
      return { ok: true, already: true, opened: false, message: 'SnowLuma 已在运行且已登录' };
    }

    const root = String(cfg.launcherPath ?? '').trim();
    const hasAccount = snowLumaHasLocalAccount(root);

    // 进程在、但 OneBot 没起。以前一律弹控制台让人扫码；现在分两种情况：
    //   · 本机有账号记录 ⇒ 只是没注入，开自动注入等它自己连上，不打扰用户；
    //   · 从没登录过 ⇒ 必须扫码，这时才开控制台。
    if (await portOpen(webui.port)) {
      enableSnowLumaAutoHook(root);
      if (hasAccount) {
        return {
          ok: true,
          needsInject: true,
          opened: false,
          webui: webui.url,
          message: 'SnowLuma 在运行但没连上 QQ：已开启自动注入，等它注入完成',
        };
      }
      const opened = openLocalUrl(webui.url);
      return {
        ok: true,
        needsLogin: true,
        opened,
        webui: webui.url,
        message: opened ? `SnowLuma 首次使用：已打开控制台 ${webui.url} 扫码登录` : `SnowLuma 首次使用：请打开 ${webui.url} 扫码登录`,
      };
    }

    const launcher = resolveSnowLumaLauncher();
    if (!launcher) {
      return { ok: false, error: '找不到 SnowLuma 启动脚本：请在设置里填「SnowLuma 安装目录」或「启动脚本」' };
    }
    // 启动前就写好自动注入，避免「起来了还要人去控制台点注入」
    enableSnowLumaAutoHook(root);
    try {
      const cwd = path.dirname(launcher);
      const lower = launcher.toLowerCase();
      const appDir = path.basename(cwd).toLowerCase() === 'app' ? cwd : path.join(cwd, 'app');
      const nodeExe = path.join(appDir, 'node.exe');
      const entry = path.join(appDir, 'index.mjs');
      if (fs.existsSync(nodeExe) && fs.existsSync(entry)) {
        // 直接拉 node.exe：绕开 launcher.bat 结尾的 pause，且用 wscript 隐藏启动（不出现任何窗口）
        spawnHidden(`"${nodeExe}" "${entry}"`, appDir);
      } else if (lower.endsWith('.bat') || lower.endsWith('.cmd')) {
        // 2026-10-22 审计：旧写法把 basename 拼进 cmd 命令串，路径里带 `&` 可注入命令。
        // 现在整条路径作为「verbatim 参数」交给 cmd，并且拒绝含引号/换行的路径。
        // 2026-11：通过 wscript 隐藏启动，不弹控制台窗口。
        if (/["\r\n]/.test(launcher)) return { ok: false, error: '启动脚本路径含引号或换行，拒绝执行' };
        spawnHidden(`cmd /c "${launcher}"`, cwd);
      } else {
        spawnHidden(`"${launcher}"`, cwd);
      }
      // 等 OneBot 端口起来（最多 15 秒）：OneBot 通了才算真的连上 QQ，不再为了「WebUI 起来了」开浏览器。
      const until = Date.now() + 15_000;
      while (Date.now() < until) {
        await new Promise((resolve) => setTimeout(resolve, 400));
        if (await portOpen(3000) || await portOpen(3001)) {
          return {
            ok: true,
            started: true,
            opened: false,
            webui: webui.url,
            launcher,
            message: 'SnowLuma 已启动并连上 QQ（后台运行，没有命令窗）',
          };
        }
      }
      if (await portOpen(webui.port)) {
        const opened = hasAccount ? false : openLocalUrl(webui.url);
        return {
          ok: true, started: true, needsInject: !hasAccount, opened, webui: webui.url, launcher,
          message: opened
            ? `已启动 SnowLuma（后台），首次登录请扫码：${webui.url}`
            : 'SnowLuma 已在后台启动，等待注入 QQ（确保 QQ 已登录）',
        };
      }
      return { ok: true, started: true, pending: true, webui: webui.url, launcher, message: `已启动 SnowLuma，控制台稍后可访问：${webui.url}` };
    } catch (error) {
      return { ok: false, error: `打开 SnowLuma 失败：${error?.message ?? error}` };
    }
  }

  // ── 启动完成弹窗 ────────────────────────────────────────────────────────
  // 用 wscript 的 WScript.Shell.Popup：独立 GUI 窗口，不弹控制台，不依赖 DSH。
  function showStartupPopup(title, text, seconds = 30) {
    if (process.platform !== 'win32' || process.env.SURFCORE_SKIP_AUTOSTART === '1') return false;
    try {
      const wscript = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'wscript.exe');
      if (!fs.existsSync(wscript)) return false;
      const esc = (value) => String(value ?? '').replace(/"/g, '""');
      const body = String(text ?? '').replace(/\r?\n/g, '" & vbCrLf & "');
      const vbs = [
        'Set sh = CreateObject("WScript.Shell")',
        // 64 = vbInformation，4096 = vbSystemModal：强制置顶，避免弹到 DSH 后面。
        `sh.Popup "${body}", ${Math.max(5, Math.round(seconds))}, "${esc(title)}", ${64 + 4096}`,
        '',
      ].join('\r\n');
      const file = path.join(os.tmpdir(), `surfcore-startup-${process.pid}-${Date.now()}.vbs`);
      // VBScript 在 wscript 下按 UTF-16LE + BOM 读最稳，中文不会乱码。
      fs.writeFileSync(file, Buffer.concat([Buffer.from([0xFF, 0xFE]), Buffer.from(vbs, 'utf16le')]));
      const child = spawn(wscript, ['//nologo', file], { detached: true, stdio: 'ignore', windowsHide: true });
      child.unref();
      pluginLog(`启动弹窗已请求：${title}（pid ${child.pid ?? '?'}，${seconds}s）`);
      setTimeout(() => { try { fs.unlinkSync(file); } catch {} }, 120000).unref?.();
      return true;
    } catch (error) {
      pluginLog('启动弹窗失败：', error?.message ?? error);
      return false;
    }
  }

  let startupWatcher = null;
  async function watchStartupCompletion({ qq = true, bili = true } = {}) {
    if (startupWatcher) return startupWatcher;
    startupWatcher = (async () => {
      try {
        const notify = readUnified().config.bridge?.startupNotify !== false;
        if (!notify || (!qq && !bili)) return;
        // DSH 重启/桥接切端口时，鉴权握手可能比 90 秒慢；给 3 分钟，
        // 并在超时前再做一次 final check，避免把“还在连”误报成“DSH 未连接”。
        const until = Date.now() + 180_000;
        const qqReady = (bridge) => {
          const snow = bridge?.snowluma ?? {};
          return Boolean(bridge?.running && bridge?.ok !== false && bridge?.dshReady === true
            && snow.connected === true && snow.accountOnline === true);
        };
        const allReady = (bridge, schedulerRunning) => Boolean(
          (!qq || qqReady(bridge)) && (!bili || schedulerRunning),
        );
        const successLines = (bridge) => {
          const snow = bridge?.snowluma ?? {};
          return [
            '全部启动成功 ✓',
            '',
            ...(qq ? [
              `QQ 桥接：运行中（端口 ${bridge.port ?? 3100}，DSH 已连接）`,
              `SnowLuma：已连接，QQ ${snow.accountOnline ? '在线' : '离线'}`,
            ] : ['QQ：启动开关关闭（未启动）']),
            ...(bili ? ['B站生物钟：运行中'] : ['B站：启动开关关闭（未启动）']),
          ];
        };
        let last = null;
        while (Date.now() < until) {
          const [bridge, schedulerRunning] = await Promise.all([
            bridgeStatus().catch((error) => ({ ok: false, running: false, error: String(error?.message ?? error) })),
            Promise.resolve(schedulerStatus.running),
          ]);
          last = { bridge, schedulerRunning };
          if (allReady(bridge, schedulerRunning)) {
            const snow = bridge?.snowluma ?? {};
            pluginLog(`启动检查通过：qq=${qq} bili=${bili} DSH=${bridge.dshBaseUrl ?? '?'} SnowLuma=${snow.connected} 账号=${snow.accountOnline}`);
            showStartupPopup('SurfCore 启动完成', successLines(bridge).join('\n'), 30);
            return;
          }
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
        // 最后一次补查：桥接可能刚好在超时边界上完成 DSH 握手。
        try {
          await new Promise((resolve) => setTimeout(resolve, 1500));
          const [bridge, schedulerRunning] = await Promise.all([
            bridgeStatus().catch(() => null),
            Promise.resolve(schedulerStatus.running),
          ]);
          if (bridge) last = { bridge, schedulerRunning };
          if (bridge && allReady(bridge, schedulerRunning)) {
            showStartupPopup('SurfCore 启动完成', successLines(bridge).join('\n'), 30);
            return;
          }
        } catch {}
        const bridge = last?.bridge ?? {};
        const snow = bridge.snowluma ?? {};
        const snowDiag = await diagnoseSnowLuma(snow).catch(() => ({ state: 'unknown', hint: '' }));
        pluginLog(`启动检查未通过：qq=${qq} bili=${bili} running=${Boolean(bridge.running)} dshReady=${Boolean(bridge.dshReady)} dshBaseUrl=${bridge.dshBaseUrl ?? '?'} snow=${Boolean(snow.connected)} snowState=${snowDiag.state} account=${Boolean(snow.accountOnline)} scheduler=${Boolean(last?.schedulerRunning)}`);
        showStartupPopup('SurfCore 启动状态', [
          '还没全部就绪：',
          '',
          ...(qq ? [
            `QQ 桥接：${bridge.running ? (bridge.ok ? '运行中' : '运行中但状态异常') : '未运行'}`,
            `DSH：${bridge.dshReady
              ? '已连接'
              : (bridge.dshBaseUrl && bridge.dshBaseUrl !== currentDshUrl()
                ? `桥接还连着旧端口 ${bridge.dshBaseUrl}（当前 ${currentDshUrl()}）`
                : 'DSH 已打开，但桥接还在鉴权/等待连接')}`,
            `SnowLuma：${snow.connected ? '已连接' : `未就绪（${snowDiag.state}）`}`,
            ...(snowDiag.hint ? [`   → ${snowDiag.hint}`] : []),
          ] : ['QQ：启动开关关闭（未启动）']),
          ...(bili ? [`B站生物钟：${last?.schedulerRunning ? '运行中' : '未启动'}`] : ['B站：启动开关关闭（未启动）']),
        ].join('\n'), 40);
      } catch (error) {
        pluginLog('启动完成检查失败：', error?.message ?? error);
      } finally {
        startupWatcher = null;
      }
    })();
    return startupWatcher;
  }

  // ── 桥接控制 ────────────────────────────────────────────────────────────


  // 原生「浏览目录 / 选择文件」——浏览器拿不到绝对路径，只能由宿主进程弹 Windows 对话框。
  // 仅 Windows 且 DSH 跑在本机时有意义；其它情况返回可读错误，前端提示手动填。
  //
  // 路径不能走 PowerShell stdout：Windows PowerShell 5.1 重定向时用 OEM/GBK 编码，
  // Node 按 UTF-8 解码，中文目录会变成 `�`，后端 fsp.stat 直接 ENOENT（2026-10-29 反馈）。
  // 改成：PowerShell 把选中路径写进临时 UTF-8 文件，Node 读文件后删除；彻底绕开控制台编码。
  async function handleBrowse(req, res, url) {
    const mode = url.searchParams.get('mode') === 'file' ? 'file' : 'dir';
    const title = url.searchParams.get('title') || (mode === 'file' ? '选择文件' : '选择目录');
    // 文件过滤只认枚举（目前只有 snowluma）：不接受任意 filter 串，避免用户被诱导选错类型。
    const filterKey = String(url.searchParams.get('filter') || '').trim().toLowerCase();
    const fileFilter = filterKey === 'snowluma'
      ? 'SnowLuma 启动文件 (SnowLuma.exe;launcher.bat)|SnowLuma.exe;launcher.bat|所有文件 (*.*)|*.*'
      : '可执行文件 (*.exe)|*.exe|所有文件 (*.*)|*.*';
    if (process.platform !== 'win32') {
      json(res, 200, { ok: false, error: '只有 Windows 支持原生选择框，请手动填路径' });
      return;
    }
    const psQuote = (s) => `'${String(s).replace(/'/g, "''")}'`;
    const outFile = path.join(os.tmpdir(), `surfcore-browse-${process.pid}-${randomUUID()}.txt`);
    const writeOut = (expr) => `[System.IO.File]::WriteAllText(${psQuote(outFile)}, ${expr}, (New-Object System.Text.UTF8Encoding -ArgumentList $false))`;
    const ps = mode === 'file'
      ? `Add-Type -AssemblyName System.Windows.Forms;
$d = New-Object System.Windows.Forms.OpenFileDialog;
$d.Title = ${psQuote(title)};
$d.Filter = ${psQuote(fileFilter)};
if ($d.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { ${writeOut('$d.FileName')} }`
      : `Add-Type -AssemblyName System.Windows.Forms;
$d = New-Object System.Windows.Forms.FolderBrowserDialog;
$d.Description = ${psQuote(title)};
$d.ShowNewFolderButton = $true;
if ($d.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { ${writeOut('$d.SelectedPath')} }`;
    const child = execFile('powershell.exe', ['-STA', '-NoProfile', '-Command', ps], { windowsHide: true, timeout: 180_000 }, (error) => {
      let picked = '';
      try { picked = String(fs.readFileSync(outFile, 'utf8')).replace(/^\uFEFF/, '').trim(); } catch {}
      try { fs.unlinkSync(outFile); } catch {}
      if (error && !picked) json(res, 200, { ok: false, error: `选择框打不开：${String(error.message || error).slice(0, 160)}` });
      else if (!picked) json(res, 200, { ok: false, cancelled: true, error: '已取消' });
      else json(res, 200, { ok: true, path: picked });
    });
    child.on('error', () => {
      try { fs.unlinkSync(outFile); } catch {}
      json(res, 200, { ok: false, error: '无法启动 PowerShell（可能不在本机桌面）' });
    });
  }

  // 语音试听：设置页「语音」的音色试听走桥接的 Edge TTS，音频字节必须原样转发。
  // 语音包管理接口（/voice/packs、/voice/tts-*）已随语音包子系统下线（2026-11 精简）。
  async function handleVoicePreview(req, res, url) {
    if (String(req.method || 'GET').toUpperCase() !== 'GET') {
      json(res, 405, { ok: false, code: 'METHOD_NOT_ALLOWED', error: '只支持 GET' });
      return;
    }
    const target = `${consoleBase()}/api/voice/preview${url.search || ''}`;
    try {
      const r = await fetch(target, { headers: { 'x-console-token': consoleToken() } });
      const buf = Buffer.from(await r.arrayBuffer());
      res.writeHead(r.status, {
        'content-type': r.headers.get('content-type') || 'audio/mpeg',
        ...(r.headers.get('content-disposition') ? { 'content-disposition': r.headers.get('content-disposition') } : {}),
      });
      res.end(buf);
    } catch (error) {
      json(res, 502, { ok: false, code: 'VOICE_PREVIEW_UNREACHABLE', error: `语音服务不可达（桥接是否在运行？）：${error?.message ?? error}` });
    }
  }

  // 合并后的产品名/版本：设置页标题跟 dsh-Dfy 主包保持一致（2026-11 用户要求）。
  // 版本直接读合并包 package.json，避免设置页还显示 SurfCore 自己的版本号。
  function mergedPluginInfo() {
    const candidates = [
      // 单仓库布局：<dsh-dfy>/package.json
      path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'package.json'),
    ];
    for (const file of candidates) {
      try {
        const pkg = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (pkg?.version) return { name: 'dsh-Dfy', version: String(pkg.version), dir: path.dirname(file) };
      } catch {}
    }
    return { name: 'dsh-Dfy', version: '', dir: '' };
  }

  // SnowLuma 本地账号清单：直接读它自己的 onebot_<uin>.json。
  // 这条路径**不需要控制台密码**——只要用户在 SnowLuma 里加过号，这里就一定能看到（
  // 2026-11 用户反馈「明明加过账号，面板却显示没有账号」：之前只信 WebUI 的 /api/qq-list，
  // 没填控制台密码就 401 → 账号列表空 → 误报）。
  function snowLumaLocalAccounts() {
    const cfg = readQqConfig().config ?? {};
    const out = new Map();
    for (const home of snowLumaHomeCandidates({ cfg })) {
      for (const entry of readOneBotTokens(home)) {
        const uin = String(entry.uin ?? '');
        if (!/^\d{5,15}$/.test(uin)) continue;
        if (!out.has(uin)) out.set(uin, { uin, nickname: '', online: null, source: 'local' });
      }
    }
    return [...out.values()];
  }

  // SnowLuma 控制台直连：账号列表 / QQ 注入进程，全部在设置页里操作（不用再开它的网页）。
  // 密码只存本机 config.json，任何响应都不回显。
  async function handleSnowLuma(req, res) {
    const method = String(req.method || 'GET').toUpperCase();
    const webui = snowLumaWebui();
    const up = await portOpen(webui.port);
    if (method === 'GET') {
      const base = { ok: true, webui: { ...webui, up }, authed: snowlumaWebuiClient.authed, hasPassword: snowlumaWebuiClient.hasPassword() };
      // 账号一律先给本地清单（不需要控制台密码）；控制台能连上时再补昵称/在线状态。
      const local = snowLumaLocalAccounts();
      if (!up) {
        json(res, 200, { ...base, accounts: local, processes: [], activeUin: '', note: 'SnowLuma 控制台没在运行：点顶部「一键开始」' });
        return;
      }
      const [accounts, processes] = await Promise.all([snowlumaWebuiClient.accounts(), snowlumaWebuiClient.processes()]);
      let list = local;
      let activeUin = '';
      if (accounts.ok) {
        const names = new Map((accounts.list ?? []).map((a) => [String(a.uin), a]));
        list = local.map((a) => ({ ...a, ...(names.get(a.uin) ? { nickname: names.get(a.uin).nickname || '' } : {}) }));
        // 本地没有记录、但控制台说在跑的账号也带上（比如刚从别处加的号）
        for (const a of accounts.list ?? []) {
          const uin = String(a.uin ?? '');
          if (uin && !list.some((x) => x.uin === uin)) list.push({ uin, nickname: String(a.nickname ?? ''), online: true, source: 'webui' });
        }
        activeUin = String(accounts.list?.[0]?.uin ?? '');
      } else if (local.length) {
        // 没填密码：本地清单照常显示；用一次轻量探测补「当前登录的号」昵称
        const found = await discoverSnowLumaConnection({ cfg: readQqConfig().config ?? {}, timeoutMs: 2000 }).catch(() => null);
        if (found?.ok) {
          const uin = String(found.self?.user_id ?? '');
          activeUin = uin;
          list = list.map((a) => (a.uin === uin ? { ...a, nickname: String(found.self?.nickname ?? ''), online: true } : a));
        }
      }
      json(res, 200, {
        ...base,
        authed: snowlumaWebuiClient.authed,
        accounts: list,
        activeUin,
        processes: processes.ok ? processes.list : [],
        error: accounts.ok ? '' : (accounts.code === 'WEBUI_NOT_AUTHORIZED' ? '' : accounts.error),
        note: accounts.ok ? '' : (local.length ? '账号来自 SnowLuma 本地配置文件（没填控制台密码也能看到）' : '还没发现账号'),
      });
      return;
    }
    if (method !== 'POST') {
      json(res, 405, { ok: false, code: 'METHOD_NOT_ALLOWED', error: '只支持 GET / POST' });
      return;
    }
    const body = await readJsonBody(req);
    const action = String(body.action ?? '');
    if (action === 'login') {
      const password = String(body.password ?? '').trim();
      if (!password) { json(res, 400, { ok: false, code: 'WEBUI_PASSWORD_REQUIRED', error: '请输入 SnowLuma 控制台密码' }); return; }
      const r = await snowlumaWebuiClient.login(password);
      if (!r.ok) { json(res, 401, r); return; }
      snowlumaWebuiClient.savePassword(password);
      json(res, 200, { ok: true, authed: true, message: '已连上 SnowLuma 控制台' });
      return;
    }
    if (action === 'logout') {
      snowlumaWebuiClient.logout({ forget: body.forget !== false });
      json(res, 200, { ok: true, authed: false });
      return;
    }
    if (action === 'process-load' || action === 'process-unload') {
      const pid = String(body.pid ?? '').trim();
      if (!/^\d+$/.test(pid)) { json(res, 400, { ok: false, code: 'BAD_PID', error: 'PID 无效' }); return; }
      const r = action === 'process-load' ? await snowlumaWebuiClient.loadProcess(pid) : await snowlumaWebuiClient.unloadProcess(pid);
      if (!r.ok) { json(res, 502, r); return; }
      json(res, 200, { ok: true, message: action === 'process-load' ? '已注入 SnowLuma（需在 QQ 里扫码登录）' : '已取消注入' });
      return;
    }
    json(res, 404, { ok: false, error: `未知 SnowLuma 动作：${action}` });
  }

  // 桌宠载体状态：只读（小鲸鱼插件是否已装/在用）。Electron 安装、启动、卸载接口已下线
  // （pet.js 只剩 status）；但「专注模式」「测试一句话」仍是设置页在用接口，照 docs/PET.md 保留。
  async function handlePet(req, res, url) {
    const suffix = url.pathname.slice(`${API_PREFIX}/pet`.length) || '/status';
    const method = String(req.method || 'GET').toUpperCase();
    if (method === 'GET' && suffix === '/status') { json(res, 200, petService.status()); return; }
    if (method === 'POST' && suffix === '/focus') {
      let body = {};
      try { body = await readJsonBody(req); } catch { json(res, 400, { ok: false, error: '请求体不是合法 JSON' }); return; }
      json(res, 200, { ok: true, ...petChat.setFocus(body.enabled === true, 'settings') });
      return;
    }
    if (method === 'POST' && suffix === '/chat-test') {
      let body = {};
      try { body = await readJsonBody(req); } catch { json(res, 400, { ok: false, error: '请求体不是合法 JSON' }); return; }
      json(res, 200, await petChatTest(body));
      return;
    }
    // 演示气泡：不生成模型回复，只推一条假事件，用来验证「插件 → 挂件 → 气泡」这条路。
    // 会顺带告诉前端挂件此刻是否在轮询（widgetOnline），排查时不用靠猜。
    if (method === 'POST' && suffix === '/bubble-demo') {
      const modality = String(readQqConfig().config?.purpose?.petModality ?? 'text') === 'voice' ? 'voice' : 'text';
      const text = '演示：气泡链路正常，能弹出这条就说明 QQ 回复也会这样弹出来。';
      const eventId = petChat.emit({
        type: 'reply',
        text,
        modality,
        speak: modality === 'voice',
        demo: true,
        messageId: 'demo',
      });
      const presence = petChat.status().presence ?? {};
      json(res, 200, {
        ok: true,
        eventId,
        widgetOnline: presence.online === true,
        speak: modality === 'voice',
        message: presence.online === true
          ? `已推送到气泡（${modality === 'voice' ? "会朗读" : "纯文字"}）`
          : '已推送，但挂件没在轮询：桌面气泡收不到（检查小鲸鱼挂件页面是否开着）',
        hint: presence.online === true ? '' : '挂件没在线时不会弹气泡；重开 DSH 并确保小鲸鱼挂件页面开着',
      });
      return;
    }
    json(res, 404, { ok: false, error: `桌宠安装/启动接口已下线：${suffix}` });
  }

  // ── 人格状态（情绪 / 口头禅）：读改都走这里，QQ/桌宠/抖音共用 ──────────────
  // 注意：不要叫 handlePersona —— 上面已有同名函数（人格四层编辑），同名声明会把它整个覆盖掉，
  //       /persona 就会拿不到 url 参数而报 "reading 'pathname'"（2026-11 实测的读取失败）。
  async function handlePersonaState(req, res, url) {
    const parsed = url && typeof url.pathname === 'string' ? url : new URL(req.url || '/', 'http://127.0.0.1');
    const suffix = parsed.pathname.slice(`${API_PREFIX}/persona`.length) || '/state';
    const method = String(req.method || 'GET').toUpperCase();
    if (method === 'GET' && (suffix === '' || suffix === '/state')) {
      json(res, 200, personaSnapshot());
      return;
    }
    if (method === 'POST' && suffix === '/config') {
      let body = {};
      try { body = await readJsonBody(req); } catch { json(res, 400, { ok: false, error: '请求体不是合法 JSON' }); return; }
      try {
        if (Array.isArray(body.quirks)) setPersonaQuirks(body.quirks);
        if (typeof body.mood === 'string') setPersonaMood(body.mood, String(body.note || ''));
        json(res, 200, personaSnapshot());
      } catch (error) {
        json(res, 400, { ok: false, error: String(error?.message ?? error).slice(0, 160) });
      }
      return;
    }
    json(res, 404, { ok: false, error: `未知人格接口：${suffix}` });
  }

  // ── 自我学习：贴吧 / B站 / 抖音 → 经历 + 近况（读状态 / 立即学 / 回滚）────────
  async function handleLearning(req, res, url) {
    const parsed = url && typeof url.pathname === 'string' ? url : new URL(req.url || '/', 'http://127.0.0.1');
    const suffix = parsed.pathname.slice(`${API_PREFIX}/learning`.length) || '/status';
    const method = String(req.method || 'GET').toUpperCase();
    if (method === 'GET' && (suffix === '' || suffix === '/status')) {
      json(res, 200, learningLoop.status());
      return;
    }
    if (method === 'POST' && suffix === '/run') {
      let body = {};
      try { body = await readJsonBody(req); } catch { body = {}; }
      json(res, 200, await learningLoop.run({ force: body.force !== false }));
      return;
    }
    if (method === 'POST' && suffix === '/rollback') {
      json(res, 200, rollbackAutoPersona());
      return;
    }
    if (method === 'POST' && suffix === '/config') {
      let body = {};
      try { body = await readJsonBody(req); } catch { json(res, 400, { ok: false, error: '请求体不是合法 JSON' }); return; }
      const patch = {};
      if (typeof body.enabled === 'boolean') patch.enabled = body.enabled;
      if (typeof body.diary === 'boolean') patch.diary = body.diary;
      if (Number.isFinite(Number(body.intervalHours))) patch.intervalHours = Math.max(1, Math.min(48, Math.round(Number(body.intervalHours))));
      if (Number.isFinite(Number(body.minItems))) patch.minItems = Math.max(1, Math.min(40, Math.round(Number(body.minItems))));
      if (Object.keys(patch).length) {
        saveUnified({ learning: patch });
        // 间隔/开关变了：重建定时器，免得要等下次重启才生效。
        try { learningLoop.stop(); learningLoop.start(); } catch {}
      }
      json(res, 200, learningLoop.status());
      return;
    }
    json(res, 404, { ok: false, error: `未知学习接口：${suffix}` });
  }

  // 设置页「测一句话」：同样要弹到桌宠气泡（docs/PET.md）；/pet/chat-test 和 /purpose/pet-chat 共用。
  async function petChatTest(body = {}) {
    const result = await petChat.chat({ text: body.text || '在吗', modality: body.modality === 'voice' ? 'voice' : 'text' });
    if (result.ok && result.reply) {
      petChat.emit({
        type: 'reply',
        text: String(result.reply.text ?? ''),
        modality: result.reply.modality === 'voice' ? 'voice' : 'text',
        speak: result.reply.modality === 'voice',
        audioKey: result.reply.audioKey || '',
        messageId: result.reply.id || '',
      });
    }
    return result;
  }


  // ── 目的机制（设置页「目的」）：按当前载体路由到 Bridge 或桌宠 ─────────────
  async function purposeAvailability() {
    const petStatus = petService.status();
    const online = petChat.online();
    const external = petStatus.external ?? {};
    let bridge = null;
    try { bridge = await bridgeStatus(); } catch (error) { bridge = { ok: false, running: false, error: String(error?.message ?? error) }; }
    return {
      pet: {
        // 用户实际装的是 dsh-Dfy 挂件时，它就算「已装/在用」，
        // 不能因为没装 Electron 桌宠就一直显示「未安装」。
        installed: Boolean(petStatus.installed || external.installed),
        running: Boolean(petStatus.running || external.active),
        online: Boolean(online.online || external.active),
        external: {
          kind: String(external.kind || ''),
          name: String(external.name || ''),
          version: String(external.version || ''),
          active: external.active === true,
        },
        lastPollAt: online.lastSeenAt || 0,
        roleName: petChat.roleInfo().name,
      },
      qq: {
        running: Boolean(bridge?.running),
        mode: bridge?.mode || bridge?.status?.mode || null,
        ok: bridge?.ok !== false,
        error: bridge?.error || '',
      },
    };
  }

  async function handlePurpose(req, res, url) {
    const suffix = url.pathname.slice(`${API_PREFIX}/purpose`.length) || '/status';
    const method = String(req.method || 'GET').toUpperCase();
    const carrier = readQqConfig().config?.purpose?.carrier === 'pet' ? 'pet' : 'qq';
    const availability = await purposeAvailability();
    try {
      if (suffix === '/status' && method === 'GET') {
        if (carrier === 'pet') {
          const st = petPurpose.status();
          json(res, 200, {
            ok: true,
            source: 'pet',
            carrier: 'pet',
            availability,
            enabled: st.enabled,
            modality: st.modality,
            fallbackToQQ: st.fallbackToQQ,
            ownerUin: st.ownerUin,
            ownerName: st.ownerName,
            focus: st.focus,
            config: st.config,
            state: st.state,
            online: st.online,
            lastTickAt: st.lastTickAt,
            lastError: st.lastError,
            lastFallback: st.lastFallback,
          });
          return;
        }
        if (!availability.qq.running) {
          json(res, 200, {
            ok: false,
            source: 'qq',
            carrier: 'qq',
            availability,
            focus: petChat.focusEnabled(),
            error: 'QQ 桥接没在运行：先在「QQ」页启动，或者把载体切到桌宠',
            config: readQqConfig().config?.purpose ?? {},
            state: null,
          });
          return;
        }
        const remote = await callBridge('/api/purpose/status', { timeoutMs: 8000 });
        const data = remote?.data ?? {};
        json(res, remote?.status || 200, {
          ...data,
          source: 'qq',
          carrier: 'qq',
          availability,
          focus: petChat.focusEnabled(),
          ok: data.ok !== false,
          error: data.ok === false ? (data.error || '读取目的状态失败') : '',
        });
        return;
      }
      if (suffix === '/preview' && method === 'POST') {
        if (carrier === 'pet') {
          const result = await petPurpose.preview();
          json(res, result.ok ? 200 : 400, { ...result, source: 'pet', carrier: 'pet', availability });
          return;
        }
        if (!availability.qq.running) {
          json(res, 409, { ok: false, error: 'QQ 桥接没在运行，无法预览 QQ 载体的目的回合', availability });
          return;
        }
        const remote = await callBridge('/api/purpose/preview', { method: 'POST', body: {}, timeoutMs: 20000 });
        json(res, remote?.status || 200, { ...(remote?.data ?? {}), source: 'qq', carrier: 'qq', availability });
        return;
      }
      if (suffix === '/run' && method === 'POST') {
        const body = await readJsonBody(req);
        if (carrier === 'pet') {
          const result = await petPurpose.run({ force: body.force !== false });
          json(res, result.ok ? 200 : 409, { ...result, source: 'pet', carrier: 'pet', availability });
          return;
        }
        if (!availability.qq.running) {
          json(res, 409, { ok: false, error: 'QQ 桥接没在运行，无法让 QQ 载体出发', availability });
          return;
        }
        const remote = await callBridge('/api/purpose/run', { method: 'POST', body: { force: body.force !== false }, timeoutMs: 30000 });
        json(res, remote?.status || 200, { ...(remote?.data ?? {}), source: 'qq', carrier: 'qq', availability });
        return;
      }
      if (suffix === '/pet-chat' && method === 'POST') {
        // 设置页测一句话（不占主动搭话额度），回复同时弹到桌宠气泡。
        const body = await readJsonBody(req);
        const result = await petChatTest(body);
        json(res, result.ok ? 200 : 400, result);
        return;
      }
      json(res, 404, { ok: false, error: `未知目的接口：${suffix}` });
    } catch (error) {
      json(res, 500, { ok: false, error: String(error?.message ?? error) });
    }
  }

  // ── 一键启动 / 停止（概览、QQ、B站共用同一份状态）────────────
  // 2026-11 精简：语音包与桌宠都不是可启动组件了（语音包后端已删，桌宠由挂件提供）。
  const LAUNCH_IDS = ['qq', 'bili'];
  const LAUNCH_LABELS = { qq: 'QQ（含 SnowLuma）', bili: 'B站' };

  function normalizeLaunchComponents(input) {
    const list = Array.isArray(input) ? input : [];
    const picked = list.map((x) => String(x)).filter((x) => LAUNCH_IDS.includes(x));
    return [...new Set(picked)];
  }

  async function launchStatus() {
    const bridge = await bridgeStatus().catch((error) => ({ running: false, error: String(error?.message ?? error) }));
    return {
      qq: {
        running: Boolean(bridge.running),
        ok: Boolean(bridge.running && bridge.ok !== false),
        port: bridge.port ?? null,
        pid: bridge.pid ?? bridge.lockPid ?? null,
        snowluma: bridge.snowluma ?? null,
        lastError: bridge.error ?? null,
      },
      bili: {
        running: Boolean(scheduler && schedulerStatus.running),
        lastError: schedulerStatus.lastError ?? null,
        reason: schedulerStatus.reason ?? '',
      },
    };
  }

  function launchItem(id, ok, extra = {}) {
    return { id, label: LAUNCH_LABELS[id] || id, ok: ok !== false, ...extra };
  }

  async function startComponent(id, opts = {}) {
    try {
      if (id === 'qq') {
        if (!platformStartEnabled('qq')) {
          return launchItem(id, false, { code: 'PLATFORM_DISABLED', error: 'QQ 启动开关已关闭', hint: '去「QQ」页打开「启动 QQ」并保存' });
        }
        const status = await bridgeStatus();
        const stale = await bridgeStaleReason(status);
        const bridge = stale ? await restartBridge({ dshWebUrl: currentDshUrl() }) : await startBridge({ dshWebUrl: currentDshUrl() });
        const snowluma = await launchSnowLuma().catch((error) => ({ ok: false, error: String(error?.message ?? error), hint: '检查 SnowLuma 安装目录/允许插件打开设置' }));
        const bridgeOk = bridge?.ok !== false;
        const snowOk = snowluma?.ok !== false || snowluma?.skipped === true || snowluma?.already === true;
        return launchItem(id, bridgeOk && snowOk, {
          message: [bridge?.message, snowluma?.message || snowluma?.error].filter(Boolean).join('；'),
          code: bridgeOk && snowOk ? '' : 'QQ_START_PARTIAL',
          error: bridgeOk ? (snowOk ? '' : `QQ 桥接已启动，但 SnowLuma 未打开：${snowluma?.error || '未知原因'}`) : (bridge?.error || bridge?.message || 'QQ 桥接启动失败'),
          hint: bridgeOk ? (snowOk ? '' : (snowluma?.hint || '启动 SnowLuma（launcher.bat）并确认端口 3000/3001')) : '检查桥接日志/端口；必要时重启 DSH',
          detail: { bridge, snowluma },
        });
      }
      if (id === 'bili') {
        if (!platformStartEnabled('bili')) {
          return launchItem(id, false, { code: 'PLATFORM_DISABLED', error: 'B站 启动开关已关闭', hint: '去「B站」页打开「启动 B站」并保存' });
        }
        const state = startSchedulerNow();
        return launchItem(id, state.running === true, {
          code: state.running ? '' : 'BILI_START_FAILED',
          error: state.running ? '' : `B站生物钟未启动：${state.reason || state.lastError || '未登录或配置缺失'}`,
          hint: state.running ? '' : '先在「B站」页完成扫码登录；仍失败看插件日志',
          detail: state,
        });
      }
      return launchItem(id, false, { code: 'UNKNOWN_COMPONENT', error: `未知启动项：${id}` });
    } catch (error) {
      return launchItem(id, false, {
        code: `${String(id).toUpperCase()}_START_FAILED`,
        error: `${LAUNCH_LABELS[id] || id} 启动失败：${String(error?.message ?? error).slice(0, 300)}`,
        hint: '看设置页状态/日志；修复后重试',
      });
    }
  }

  async function stopComponent(id, opts = {}) {
    try {
      if (id === 'qq') {
        const r = await stopBridge();
        return launchItem(id, r?.ok !== false, {
          message: 'QQ 桥接已停止（SnowLuma 本体不会被本程序关闭）',
          code: r?.ok === false ? 'QQ_STOP_FAILED' : '',
          error: r?.ok === false ? (r.error || 'QQ 桥接停止失败') : '',
          hint: r?.ok === false ? '看桥接日志/手动结束残留进程' : '',
          detail: r,
        });
      }
      if (id === 'bili') {
        const r = stopSchedulerNow();
        return launchItem(id, true, { message: r.wasRunning ? 'B站生物钟已停止' : 'B站生物钟本来就没在跑', detail: r });
      }
      return launchItem(id, false, { code: 'UNKNOWN_COMPONENT', error: `未知停止项：${id}` });
    } catch (error) {
      return launchItem(id, false, {
        code: `${String(id).toUpperCase()}_STOP_FAILED`,
        error: `${LAUNCH_LABELS[id] || id} 停止失败：${String(error?.message ?? error).slice(0, 300)}`,
        hint: '看设置页状态/日志；必要时手动结束进程',
      });
    }
  }

  async function runLaunchAction(action, body) {
    const ids = normalizeLaunchComponents(body.components);
    if (!ids.length) {
      return { ok: false, code: 'NO_COMPONENTS', error: '没有选择要启动/停止的项目', hint: '至少勾选一项', items: [], status: await launchStatus() };
    }
    const items = [];
    // 停止时先停队列里的子进程，最后停桥接，避免留下孤儿进程（2026-11 起只剩 QQ / B站）。
    const ordered = action === 'stop' ? ['qq', 'bili'].filter((id) => ids.includes(id)) : ids;
    for (const id of ordered) {
      items.push(action === 'stop' ? await stopComponent(id, body) : await startComponent(id, body));
    }
    const status = await launchStatus();
    return { ok: items.every((x) => x.ok), items, status };
  }

  async function handleBridge(req, res) {
    if (req.method === 'GET') { json(res, 200, { ok: true, status: await bridgeStatus() }); return; }
    const body = await readJsonBody(req);
    const action = String(body.action ?? 'status');
    if (action === 'status') { json(res, 200, { ok: true, status: await bridgeStatus() }); return; }
    if (action === 'start') {
      if (!platformStartEnabled('qq')) {
        json(res, 409, { ok: false, error: 'QQ 启动开关已关闭：去「QQ」页打开「启动 QQ」并保存' });
        return;
      }
      json(res, 200, await startBridge({ dshWebUrl: currentDshUrl() }));
      return;
    }
    if (action === 'start-qq') {
      // 概览的「启动 QQ」：桥接 + 按需打开 SnowLuma（仍是用户显式点击，不自动弹）。
      if (!platformStartEnabled('qq')) {
        json(res, 409, { ok: false, error: 'QQ 启动开关已关闭：去「QQ」页打开「启动 QQ」并保存' });
        return;
      }
      const bridge = await startBridge({ dshWebUrl: currentDshUrl() });
      const snowluma = await launchSnowLuma();
      json(res, 200, {
        ok: bridge?.ok !== false,
        message: [bridge?.message, snowluma?.message || snowluma?.error].filter(Boolean).join('；'),
        bridge,
        snowluma,
      });
      return;
    }
    if (action === 'start-bili') {
      if (!platformStartEnabled('bili')) {
        json(res, 409, { ok: false, error: 'B站 启动开关已关闭：去「B站」页打开「启动 B站」并保存' });
        return;
      }
      const running = Boolean(scheduler && schedulerStatus.running);
      const schedulerState = startSchedulerNow();
      json(res, 200, {
        ok: schedulerState.running === true,
        message: running ? 'B站生物钟本来就在跑' : (schedulerState.running ? 'B站生物钟已启动' : `B站生物钟未启动：${schedulerState.lastError ?? '看插件日志'}`),
        scheduler: schedulerState,
      });
      return;
    }
    if (action === 'start-selected' || action === 'start-components') {
      json(res, 200, await runLaunchAction('start', body));
      return;
    }
    if (action === 'stop-selected' || action === 'stop-components') {
      json(res, 200, await runLaunchAction('stop', body));
      return;
    }
    if (action === 'start-all') {
      // 一键启动：按平台启动开关拉起 QQ 桥接 / B站生物钟；QQ 打开时才尝试打开 SnowLuma。
      const starts = platformStartState();
      const status = await bridgeStatus();
      const stale = await bridgeStaleReason(status);
      const dshWebUrl = currentDshUrl();
      const bridge = starts.qq
        ? (stale ? await restartBridge({ dshWebUrl }) : await startBridge({ dshWebUrl }))
        : { ok: true, skipped: true, message: 'QQ 启动开关关闭，已跳过桥接' };
      const schedulerState = starts.bili
        ? startSchedulerNow()
        : { ...idleSchedulerStatus('disabled'), message: 'B站 启动开关关闭，已跳过生物钟' };
      const snowluma = starts.qq ? await launchSnowLuma() : { ok: true, skipped: true, message: 'QQ 启动开关关闭，已跳过 SnowLuma' };
      const coreOk = (!starts.qq || bridge?.ok !== false) && (!starts.bili || schedulerState.running);
      const message = [
        bridge?.message,
        starts.bili ? (schedulerState.running ? 'B站生物钟在跑' : 'B站生物钟未启动') : '',
        snowluma?.message || snowluma?.error,
        starts.qq || starts.bili ? '启动完成后会弹窗告诉你结果' : 'QQ 和 B站 的启动开关都关着，没有需要启动的平台',
      ].filter(Boolean).join('；');
      json(res, 200, {
        ok: coreOk,
        pending: starts.qq || starts.bili,
        message,
        bridge,
        scheduler: schedulerState,
        snowluma,
        platformStart: starts,
      });
      if (starts.qq || starts.bili) void watchStartupCompletion(starts);
      return;
    }
    if (action === 'start-snowluma') {
      json(res, 200, await launchSnowLuma());
      return;
    }
    // 一键打开 SnowLuma 控制台（扫码登录 / 添加 QQ 账号都在它自己的 WebUI 里做）。
    // 插件只开本机回环地址，不接受外部 URL。
    if (action === 'open-snowluma-webui') {
      const webui = snowLumaWebui();
      const up = await portOpen(webui.port);
      const opened = up ? openLocalUrl(webui.url) : false;
      json(res, 200, {
        ok: opened,
        opened,
        webui: { ...webui, up },
        error: opened ? '' : (up
          ? '打不开系统浏览器（可能不在本机桌面）'
          : `SnowLuma 控制台没在监听 ${webui.url}：先点「启动」拉起 SnowLuma`),
        hint: up ? '在控制台里扫码登录 / 添加 QQ 账号；登录后 Bridge 会自动连上' : '点「启动」会拉起 SnowLuma 并自动打开控制台',
      });
      return;
    }
    // 一键开始（傻瓜式）：识别安装 → 拉起 SnowLuma（要扫码就自动开控制台）→ 等 OneBot →
    // 自动发现并写入当前账号 → 启动桥接 → 启动 B站。用户只需要点一次。
    if (action === 'auto-start') {
      const steps = [];
      const add = (id, label, ok, detail) => { steps.push({ id, label, ok: ok !== false, detail: String(detail ?? '') }); };

      // 1) 安装位置
      const launcherPath = String(readQqConfig().config?.snowluma?.launcherPath ?? '').trim();
      if (!launcherPath) {
        const found = findSnowLumaInstall();
        if (found.ok) { saveQqConfig({ snowluma: { launcherPath: found.root, allowLaunch: true } }); add('detect', '识别 SnowLuma', true, found.root); }
        else add('detect', '识别 SnowLuma', false, found.error || '没找到 SnowLuma：去「安装与维护」页点「手动选择」指定目录');
      } else add('detect', '识别 SnowLuma', true, launcherPath);

      // 2) 拉起 SnowLuma（后台运行、无命令窗；已登录过就不再弹控制台）
      const launched = await launchSnowLuma().catch((error) => ({ ok: false, error: String(error?.message ?? error) }));
      add('launch', '启动 SnowLuma', launched.ok !== false, launched.message || launched.error || '');

      // 2.5) 自动注入：SnowLuma 的 hookAutoLoad 出厂是 false，不开就会卡在 QQ 这一步等人去点控制台
      const hookRoot = String(readQqConfig().config?.snowluma?.launcherPath ?? '').trim();
      const hookOn = enableSnowLumaAutoHook(hookRoot);
      add('inject', '开启 QQ 自动注入', hookOn, hookOn ? '已开启：SnowLuma 会自动注入 QQ 进程' : '没找到 runtime.json（安装位置可能不对）');

      // 3) 等 OneBot 起来（最多 20 秒；已知要扫码就不干等），顺手把当前账号写进配置
      let account = null;
      let wroteConfig = false;
      const deadline = Date.now() + (launched.needsLogin === true ? 0 : 20_000);
      while (true) {
        if ((await portOpen(3000)) || (await portOpen(3001))) {
          const found = await discoverSnowLumaConnection({ cfg: readQqConfig().config ?? {}, timeoutMs: 5000 }).catch(() => null);
          if (found?.ok) {
            const snow = { httpUrl: found.baseUrl };
            if (found.wsUrl) snow.wsUrl = found.wsUrl;
            if (found.token) snow.accessToken = found.token;
            // 2026-11：WS 通道有自己的令牌，漏写会导致 HTTP 能通但 connected 永远 false
            if (found.wsToken) snow.wsToken = found.wsToken;
            saveQqConfig({ snowluma: snow });
            wroteConfig = true;
            account = { nickname: String(found.self?.nickname ?? ''), uin: String(found.self?.user_id ?? ''), httpUrl: found.baseUrl };
            break;
          }
        }
        if (Date.now() >= deadline) break;
        await new Promise((resolve) => setTimeout(resolve, 800));
      }
      if (account) add('account', '识别并写入账号', true, `${account.nickname || '已登录'}（${account.uin || '?'}）`);
      else {
        const hint = launched.needsLogin
          ? '还没扫码登录：去 SnowLuma 控制台登录一次，之后就不用再开了'
          : '没连上 QQ：先确认电脑上的 QQ 客户端已打开并登录（SnowLuma 靠注入 QQ 进程工作），然后点「重新检测」';
        add('account', '识别并写入账号', false, hint);
      }

      // 4) QQ 桥接（配置变了就重启，让桥接读新 token）
      if (!platformStartEnabled('qq')) {
        add('bridge', '启动 QQ 桥接', true, 'QQ 启动开关关闭，跳过');
      } else {
        try {
          const before = await bridgeStatus().catch(() => ({ running: false }));
          if (before.running && wroteConfig) { await restartBridge({ dshWebUrl: currentDshUrl() }); add('bridge', '重启 QQ 桥接', true, '已按新账号重启'); }
          else if (before.running) add('bridge', '启动 QQ 桥接', true, `已在运行（端口 ${before.port}）`);
          else { await startBridge({ dshWebUrl: currentDshUrl() }); add('bridge', '启动 QQ 桥接', true, '已启动'); }
        } catch (error) { add('bridge', '启动 QQ 桥接', false, String(error?.message ?? error)); }
      }

      // 5) B站（按平台开关，不额外点）
      if (!platformStartEnabled('bili')) add('bili', '启动 B站', true, 'B站 启动开关关闭，跳过');
      else {
        const item = await startComponent('bili').catch((error) => ({ ok: false, error: String(error?.message ?? error) }));
        add('bili', '启动 B站', item.ok !== false, item.message || item.error || '');
      }

      const webui = snowLumaWebui();
      const status = await bridgeStatus().catch(() => null);
      json(res, 200, {
        ok: steps.every((s) => s.ok),
        steps,
        account,
        needsLogin: !account,
        webui: { ...webui, up: await portOpen(webui.port) },
        bridge: status,
      });
      return;
    }
    if (action === 'detect-snowluma') {
      // 可选 path：用户点「浏览…」选了解压目录/app 目录/launcher.bat 时，**只验证这个路径**——
      // 用户明确选了一个，就不能悄悄回退去猜别的目录（否则会"检测成功"但保存的是另一份安装）。
      const picked = String(body.path ?? '').trim();
      const direct = picked ? normalizeSnowLumaInstall(picked) : null;
      const found = picked
        ? (direct ? { ok: true, ...direct, tried: [{ path: picked, ok: true }] } : { ok: false, tried: [{ path: picked, ok: false }] })
        : findSnowLumaInstall();
      if (!found.ok) {
        // 失败必须有结构化报告：code + 人读的 error + 下一步 hint + 试过的路径（AGENTS 1.7）。
        const report = snowLumaMissingReport({ picked, tried: found.tried.map((x) => x.path).slice(0, 12) });
        json(res, 200, { ok: false, code: report.code, title: report.title, error: report.error, hint: report.hint, tried: report.tried });
        return;
      }
      saveQqConfig({ snowluma: { launcherPath: found.root, allowLaunch: true } });
      json(res, 200, { ok: true, found: true, path: found.root, launcher: found.launcher, message: `已找到 SnowLuma：${found.root}` });
      return;
    }
    if (action === 'stop') { json(res, 200, await stopBridge()); return; }
    if (action === 'restart') {
      if (!platformStartEnabled('qq')) {
        json(res, 409, { ok: false, error: 'QQ 启动开关已关闭：先在「QQ」页打开「启动 QQ」并保存' });
        return;
      }
      json(res, 200, await restartBridge({ dshWebUrl: currentDshUrl() }));
      return;
    }
    if (action === 'greeting-test') {
      const result = await callBridge('/api/greeting/test', { method: 'POST', body: {} });
      json(res, result.status || 200, result.data ?? { ok: result.ok, error: result.error });
      return;
    }
    // 目的机制：状态 / 只读预览 / 立刻试一次（真发，设置页会先 confirm）。
    if (action === 'purpose-status') {
      const result = await callBridge('/api/purpose/status', { timeoutMs: 8000 });
      json(res, result.status || 200, result.data ?? { ok: result.ok, error: result.error });
      return;
    }
    if (action === 'purpose-preview') {
      const result = await callBridge('/api/purpose/preview', { method: 'POST', body: {}, timeoutMs: 20000 });
      json(res, result.status || 200, result.data ?? { ok: result.ok, error: result.error });
      return;
    }
    if (action === 'purpose-run') {
      const result = await callBridge('/api/purpose/run', { method: 'POST', body: { force: true }, timeoutMs: 25000 });
      json(res, result.status || 200, result.data ?? { ok: result.ok, error: result.error });
      return;
    }
    if (action === 'refresh-bili') { json(res, 200, await refreshBiliToQq({ callBridge })); return; }
    json(res, 400, { ok: false, error: '未知 action' });
  }

  // ── B站动作：依赖体检 / cookie / 待审 / 通知测试 ────────────────────────
  function runBili(args, timeoutMs = 120_000) {
    return new Promise((resolve) => {
      execFile(findNodeExe(), [BILI_MJS, ...args], {
        cwd: BILI_TOOLS_DIR,
        timeout: timeoutMs,
        windowsHide: true,
        maxBuffer: 8 * 1024 * 1024,
      }, (error, stdout, stderr) => resolve({
        ok: !error,
        code: error?.code ?? 0,
        out: String(stdout ?? '').slice(-20_000),
        err: String(stderr ?? '').slice(-4000),
      }));
    });
  }

  // ── QQ 鱼群保护（设置页「最近触发」）────────────────────────────────────
  // 桥接把每次新触发写进 social-v2.json 的 fishGuardLog（每群最多 30 条）；
  // 设置页只读这个文件，不再靠翻活动日志。见 PITFALLS #30 / #31。
  function handleQqFishGuard(res) {
    try {
      const file = path.join(QQ_STATE_DIR(), 'social-v2.json');
      const data = readJson(file, {}) ?? {};
      const summary = summarizeQqFishGuard(data, { now: Date.now() });
      json(res, 200, {
        ok: true,
        file,
        now: new Date().toISOString(),
        ...summary,
        config: readQqConfig().config?.fishGuard ?? {},
      });
    } catch (error) {
      json(res, 500, { ok: false, error: String(error?.message ?? error) });
    }
  }

  // ── 观看历史（设置页「观看历史」）───────────────────────────────────────
  // 数据来自当前角色 bili/watch-history.jsonl；旧数据从 bili-memory.json 补。
  function handleWatchHistory(res, url) {
    try {
      const current = readCurrentCharacter();
      const data = readWatchHistory({
        limit: Number(url.searchParams.get('limit')) || 200,
        q: url.searchParams.get('q') ?? '',
        days: Number(url.searchParams.get('days')) || 0,
      });
      // 2026-10-23 用户要求：每条看过之后她做了什么（评论怎么发的/收藏/动态）。
      const enriched = enrichWatchHistory(data.items);
      json(res, 200, {
        ok: true,
        character: current ? { id: current.id, name: current.name, epoch: current.epoch } : null,
        ...data,
        items: enriched.items,
        actions: enriched.actions,
      });
    } catch (error) {
      json(res, 500, { ok: false, error: String(error?.message ?? error) });
    }
  }

  // ── 偏好关键词扫描（设置页「口味权重 / 一键抓取」）──────────────────────
  // 只读：从当前账号的观看历史 / 收藏夹 + 本地记录里抽候选词，不写配置、不外发。
  async function handlePreferenceScan(res, url) {
    const raw = String(url.searchParams.get('sources') ?? '').trim();
    const sources = raw
      ? raw.split(/[,，]/).map((item) => item.trim()).filter(Boolean)
      : undefined;
    const target = ['fish', 'owner', 'both'].includes(String(url.searchParams.get('target') ?? ''))
      ? String(url.searchParams.get('target'))
      : 'fish';
    const limit = Math.max(4, Math.min(60, Number(url.searchParams.get('limit')) || 24));
    let timer = null;
    try {
      const result = await Promise.race([
        scanPreferences({ sources, limit, target }),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error('扫描超时（20 秒）：网络太慢，可先在命令行跑 prefs scan')), 20_000);
          timer.unref?.();
        }),
      ]);
      json(res, 200, result);
    } catch (error) {
      json(res, 500, { ok: false, error: String(error?.message ?? error) });
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async function handleBili(req, res, url) {
    const pathname = url.pathname;
    if (req.method === 'GET' && pathname.endsWith('/fish-guard')) {
      const dir = activePlatformStateDir(BILI_DIR);
      const stateFile = path.join(dir, 'fish-guard.json');
      const state = readJson(stateFile, {}) ?? {};
      const cfg = readBiliConfig().config?.fishGuard ?? {};
      const current = readCurrentCharacter();
      json(res, 200, {
        ok: true,
        character: current ? { id: current.id, name: current.name, epoch: current.epoch } : null,
        credentials: fs.existsSync(BILI_CRED),
        stateFile,
        fishGuard: fishGuardStateSummary(state, cfg),
      });
      return;
    }
    if (req.method === 'POST' && pathname.endsWith('/session-permission')) {
      // 手动修复：把当前角色的 B站 会话切到配置的权限（默认 danger-full-access）。
      // 定时器也会自动做；这个按钮用于「现在就想让她能跑命令」时立刻生效。
      const body = await readJsonBody(req);
      const current = readCurrentCharacter();
      const sessionId = current ? `bili-whale-${current.id}` : 'bili-whale';
      const target = String(body.target ?? readBiliConfig().config?.agent?.sandbox ?? 'danger-full-access');
      let inspected = false;
      try {
        if (ctx.sessionController?.inspect) { await ctx.sessionController.inspect(sessionId); inspected = true; }
      } catch (error) {
        pluginLog(`[权限] inspect ${sessionId} 失败：${error?.message ?? error}`);
      }
      // inspect 之后 session 可能还没同步进 ctx.sessions。
      if (inspected) await new Promise((resolve) => setTimeout(resolve, 120));
      const result = applySessionPermission(ctx, sessionId, target, (message) => pluginLog(message));
      json(res, 200, {
        ok: result.ok,
        sessionId,
        target,
        inspected,
        ...result,
        message: result.ok
          ? (result.changed ? `已切到 ${target}` : `已经是 ${target}`)
          : ({
            'session-not-active': '会话还没挂上（等下一次醒来会自动设置）',
            'permission-services-unavailable': 'DSH 没有提供 permissionPresets 服务',
            'set-failed': `设置失败：${result.error ?? '未知错误'}`,
          }[result.reason] ?? result.reason),
      });
      return;
    }
    if (req.method === 'GET' && pathname.endsWith('/deps')) {
      const result = await runBili(['deps', '--json'], 60_000);
      let parsed = null;
      try { parsed = JSON.parse(result.out); } catch {}
      json(res, 200, { ok: parsed?.ok === true, ...(parsed ?? {}), raw: result.out.slice(0, 2000), err: result.err });
      return;
    }
    if (req.method === 'GET' && pathname.endsWith('/pending')) {
      const file = path.join(BILI_AI_DIR, 'pending-replies.json');
      const data = readJson(file, { items: [] }) ?? { items: [] };
      json(res, 200, { ok: true, items: data.items ?? [] });
      return;
    }
    if (req.method === 'GET' && pathname.endsWith('/automation')) {
      json(res, 200, automationSnapshot());
      return;
    }
    if (req.method === 'GET' && pathname.endsWith('/notify-config')) {
      const cfg = readBiliConfig().config;
      json(res, 200, { ok: true, notify: cfg.notify, listen: cfg.listen, share: cfg.share, quota: cfg.quota });
      return;
    }
    // 「立即分享一次」：转发到桥接控制台的 /api/bili/share-now。
    // 这是**真的会发到群**的操作，UI 侧必须二次确认；这里只做代理，不自己挑素材。
    if (req.method === 'POST' && pathname.endsWith('/share-now')) {
      const result = await callBridge('/api/bili/share-now', { method: 'POST', body: {}, timeoutMs: 120_000 });
      const payload = result.data ?? {};
      // 桥接返回 { ok, result: { ok, sent, card, why } }；这里摊平成 UI 好用的形状。
      const inner = payload.result ?? payload;
      // 留一行日志：点「立即分享一次」后出问题时，能直接看到是桥接没响应还是桥接拒绝。
      pluginLog(`「立即分享一次」bridge=${result.status} ok=${result.ok} sent=${inner.sent ?? 0}`
        + `${inner.card?.bvid ? ` bvid=${inner.card.bvid}` : ''}`
        + `${result.ok ? '' : ` error=${result.error || payload.error || 'unknown'}`}`);
      json(res, result.ok ? 200 : 502, {
        ok: result.ok && payload.ok !== false && inner.ok !== false,
        sent: Number(inner.sent ?? 0),
        card: inner.card ?? null,
        ...(inner.why ? { why: inner.why } : {}),
        ...(result.ok ? {} : { error: result.error || payload.error || '桥接没有响应' }),
      });
      return;
    }
    if (req.method === 'GET' && pathname.endsWith('/accounts')) {
      const cfg = readBiliConfig().config ?? {};
      const fish = readFishAccount();
      // 旧 credentials.json 只有 sessdata/bili_jct/buvid3；mid/昵称回落到配置里的 self。
      if (fish.configured && !fish.mid && cfg.self?.mid) {
        fish.mid = String(cfg.self.mid);
        fish.name = String(cfg.self.name ?? '');
      }
      json(res, 200, {
        ok: true,
        fish,
        owner: readOwnerAccount(),
        expected: {
          self: { mid: String(cfg.self?.mid ?? ''), name: String(cfg.self?.name ?? '') },
          owner: { mid: String(cfg.owner?.mid ?? ''), name: String(cfg.owner?.name ?? '') },
        },
      });
      return;
    }
    if (req.method === 'GET' && pathname.endsWith('/qr/poll')) {
      const id = String(url.searchParams.get('id') ?? '').trim();
      if (!/^qr_[0-9a-f-]{36}$/i.test(id)) { json(res, 400, { ok: false, error: 'id 不合法' }); return; }
      const result = await pollQrLogin(id);
      // ok:false 也是有效状态（wrong-account/failed），用 200 让前端按 status 处理。
      json(res, 200, result);
      return;
    }
    if (req.method !== 'POST') { json(res, 405, { ok: false, error: '只支持 GET/POST' }); return; }
    const body = await readJsonBody(req);
    const action = String(body.action ?? '');
    if (pathname.endsWith('/qr/start')) {
      const target = body.target === 'fish' ? 'fish' : 'owner';
      const cfg = readBiliConfig().config ?? {};
      const expected = target === 'owner'
        ? { mid: String(cfg.owner?.mid ?? ''), name: String(cfg.owner?.name ?? '') }
        : { mid: String(cfg.self?.mid ?? ''), name: String(cfg.self?.name ?? '') };
      try {
        pluginLog(`[扫码登录] 打开 B站 登录页 target=${target}`);
        const result = await startQrLogin({
          target,
          expectedMid: expected.mid,
          expectedName: expected.name,
          allowSameAsOwner: body.allowSameAsOwner === true,
        });
        json(res, 200, { ok: true, ...result });
      } catch (error) {
        pluginLog(`[扫码登录] 打开失败：${String(error?.message ?? error)}`);
        json(res, 503, {
          ok: false, code: 'bili.qr-start-failed',
          error: String(error?.message ?? error),
          hint: '确认本机有 Edge（扫码用 headless Edge 打开 B站 登录页）；再试一次或重启 DSH 后重试',
        });
      }
      return;
    }
    // 核查已登录账号：读文件 → 再问一次 B站 nav → 核对 mid（不是只信扫码那一刻）。
    if (pathname.endsWith('/account/verify')) {
      const target = body.target === 'fish' ? 'fish' : 'owner';
      try {
        const result = await verifyStoredCredentials(target);
        json(res, 200, { ok: result.ok, target, ...result });
      } catch (error) {
        json(res, 500, {
          ok: false, code: 'bili.verify-failed',
          error: `核查失败：${String(error?.message ?? error).slice(0, 160)}`,
          hint: '确认网络能访问 api.bilibili.com 后重试；持续失败请重新扫码',
        });
      }
      return;
    }

    // 核查「UID 与昵称是否同一个人」：查 B站 公开名片，把真实昵称带回来比对。
    if (pathname.endsWith('/verify-user')) {
      const mid = String(body.mid ?? '').trim();
      const name = String(body.name ?? '').trim();
      if (!/^\d{4,20}$/.test(mid)) {
        json(res, 400, {
          ok: false, code: 'bili.mid-invalid',
          error: `「${mid || '(空)'}」不是合法的 B站 UID`,
          hint: 'B站 UID 是 4~20 位数字（在个人空间地址 space.bilibili.com/<数字> 里能看到）',
        });
        return;
      }
      try {
        const res2 = await fetch(`https://api.bilibili.com/x/web-interface/card?mid=${encodeURIComponent(mid)}`, {
          headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36', referer: 'https://www.bilibili.com/' },
          signal: AbortSignal.timeout(10_000),
        });
        const jsonBody = await res2.json().catch(() => null);
        const actual = jsonBody?.data?.card;
        if (!res2.ok || !actual?.mid) {
          json(res, 200, {
            ok: false, code: 'bili.user-not-found',
            error: `B站 查不到 UID ${mid}${jsonBody?.code ? `（code ${jsonBody.code}）` : ''}`,
            hint: '核对 UID 是否填错（个人空间地址里的数字）；B站 偶发风控时稍后重试',
          });
          return;
        }
        const actualName = String(actual.name ?? '');
        const match = !name || actualName.trim() === name.trim();
        json(res, 200, {
          ok: true, mid: String(actual.mid), actualName, inputName: name, match,
          error: match ? '' : `昵称对不上：UID ${mid} 的 B站 昵称是「${actualName}」，你填的是「${name}」`,
          hint: match ? '' : '点「用 B站 昵称填上」自动改正；或确认 UID 是否填成了别人的',
        });
      } catch (error) {
        json(res, 200, {
          ok: false, code: 'bili.verify-network',
          error: `查询 B站 失败：${String(error?.message ?? error).slice(0, 160)}`,
          hint: '检查网络能否访问 api.bilibili.com；稍后重试',
        });
      }
      return;
    }

    // 换 B站 号：把旧凭据/对齐归档后清掉，允许重新扫码绑定（2026-10-27 用户反馈"换号被卡死"）
    if (pathname.endsWith('/account/reset')) {
      const target = body.target === 'owner' ? 'owner' : (body.target === 'both' ? 'both' : 'fish');
      const archived = [];
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const destDir = path.join(BACKUP_DIR, `bili-switch-${stamp}`);
      const archive = (file, label) => {
        try {
          if (!fs.existsSync(file)) return;
          fs.mkdirSync(destDir, { recursive: true });
          const dest = path.join(destDir, `${label}${path.extname(file) || '.json'}`);
          fs.copyFileSync(file, dest);
          archived.push(maskPath(dest));
        } catch (error) {
          pluginLog(`[换号] 归档失败 ${label}：${String(error?.message ?? error)}`);
        }
      };
      const ownerCred = path.join(BILI_DIR, 'owner-credentials.json');
      if (target === 'fish' || target === 'both') {
        archive(BILI_CRED, 'fish-credentials');
        archive(ALIGN_FILE, 'alignments');
        try { fs.rmSync(BILI_CRED, { force: true }); } catch {}
      }
      if (target === 'owner' || target === 'both') {
        archive(ownerCred, 'owner-credentials');
        try { fs.rmSync(ownerCred, { force: true }); } catch {}
      }
      // 清掉配置里对应的 mid，避免下一次扫码又被"不是当前小肥鱼/主人"挡住
      try {
        const bili = readBiliConfig().config ?? {};
        if (target === 'fish' || target === 'both') bili.self = { mid: '', name: '' };
        if (target === 'owner' || target === 'both') bili.owner = { mid: '', name: '' };
        saveBiliConfig(bili);
      } catch (error) {
        pluginLog(`[换号] 清配置失败：${String(error?.message ?? error)}`);
      }
      pluginLog(`[换号] 已归档并清除 target=${target}；归档 ${archived.length} 个文件`);
      json(res, 200, { ok: true, target, archived });
      return;
    }
    if (pathname.endsWith('/qr/cancel')) {
      const id = String(body.id ?? '').trim();
      if (id) cancelQrLogin(id);
      json(res, 200, { ok: true });
      return;
    }
    if (action === 'cookie') {
      const sessdata = String(body.sessdata ?? '').trim();
      const bili_jct = String(body.bili_jct ?? '').trim();
      const buvid3 = String(body.buvid3 ?? '').trim();
      if (!sessdata || !bili_jct) { json(res, 400, { ok: false, error: 'SESSDATA 和 bili_jct 必填' }); return; }
      fs.mkdirSync(path.dirname(BILI_CRED), { recursive: true });
      writeJsonAtomic(BILI_CRED, { sessdata, bili_jct, buvid3 });
      try { fs.chmodSync(BILI_CRED, 0o600); } catch {}
      let whoNow = null;
      try {
        const navRes = await fetch('https://api.bilibili.com/x/web-interface/nav', {
          headers: { 'user-agent': 'Mozilla/5.0', referer: 'https://www.bilibili.com/', cookie: `SESSDATA=${sessdata}; bili_jct=${bili_jct}; buvid3=${buvid3}` },
        });
        const navJson = await navRes.json().catch(() => ({}));
        if (navJson?.data?.isLogin && navJson.data.mid) {
          whoNow = { mid: String(navJson.data.mid), name: String(navJson.data.uname ?? '') };
          const bili = readBiliConfig().config;
          bili.self = whoNow;
          saveBiliConfig(bili);
        }
      } catch {}
      json(res, 200, { ok: true, detail: whoNow ? `已写入 ✓ 当前登录：${whoNow.name}（mid ${whoNow.mid}）` : '已写入（但 nav 没确认成功 —— cookie 可能缺项或过期）', self: whoNow });
      return;
    }
    if (action === 'notify-test') {
      const notifyMjs = path.join(BILI_TOOLS_DIR, 'commands', 'notify.mjs');
      const result = await new Promise((resolve) => {
        execFile(findNodeExe(), [notifyMjs, '--test'], { cwd: BILI_TOOLS_DIR, timeout: 60_000, windowsHide: true }, (error, stdout, stderr) => resolve({
          ok: !error, out: String(stdout ?? '').slice(0, 2000), err: String(stderr ?? '').slice(0, 2000),
        }));
      });
      json(res, 200, { ok: result.ok, ...result });
      return;
    }
    if (action === 'pending-approve' || action === 'pending-reject') {
      const id = String(body.id ?? '');
      if (!id) { json(res, 400, { ok: false, error: '需要 id' }); return; }
      if (action === 'pending-reject') {
        const result = await runBili(['reply-draft', 'drop', id], 30_000);
        json(res, 200, { ok: result.ok, out: result.out.slice(0, 500), err: result.err.slice(0, 500) });
        return;
      }
      const take = await runBili(['reply-draft', 'take', id], 30_000);
      let item = null;
      try { item = JSON.parse(take.out.trim().split('\n').pop()); } catch {}
      if (!item) { json(res, 400, { ok: false, error: '队列里没有这条（可能已经发过）', out: take.out.slice(0, 500) }); return; }
      const args = ['comment', '--oid', item.oid, '--root', item.root, '--parent', item.parent,
        '--message', item.message, '--auto', '--go'];
      if (item.bvid) args.push('--bvid', item.bvid);
      const send = await runBili(args, 120_000);
      json(res, 200, { ok: send.ok && /code=0/.test(send.out), out: send.out.slice(-1000), err: send.err.slice(-500) });
      return;
    }
    json(res, 400, { ok: false, error: '未知 action' });
  }

  // ── 日志 ────────────────────────────────────────────────────────────────
  function handleLogs(res, url) {
    const lines = Math.max(10, Math.min(500, Number(url.searchParams.get('lines')) || 120));
    const plugin = readTextTail(PLUGIN_LOG).split('\n').slice(-lines).join('\n');
    const bridge = bridgeLogTail(lines);
    json(res, 200, { ok: true, plugin, bridge, paths: { pluginLog: PLUGIN_LOG, bridgeLog: path.join(QQ_STATE_DIR(), 'bridge.log') } });
  }

  // 主人特权操作审计：只读桥接写好的 state/owner-audit.jsonl；agent 永远拿不到。
  async function handleOwnerAudit(req, res, url) {
    if (req.method === 'GET') {
      const limit = Math.max(1, Math.min(200, Number(url.searchParams.get('limit')) || 50));
      const result = await callBridge(`/api/owner-audit?limit=${limit}`, { timeoutMs: 8000 });
      json(res, result.status || 200, result.data ?? { ok: false, error: result.error || '桥接不可用' });
      return;
    }
    if (req.method === 'POST') {
      let body = {};
      try { body = await readJsonBody(req); } catch { json(res, 400, { ok: false, error: '请求体不是合法 JSON' }); return; }
      // 只支持「打开所在文件夹」；路径固定，不接受任何用户输入。
      if (body.action !== 'open') { json(res, 400, { ok: false, error: '未知 action' }); return; }
      if (process.platform !== 'win32') { json(res, 200, { ok: false, error: '只有 Windows 支持打开文件夹' }); return; }
      const dir = path.join(DATA_ROOT, 'state');
      try {
        spawn('explorer.exe', [dir], { detached: true, stdio: 'ignore', windowsHide: false }).unref();
        json(res, 200, { ok: true, path: dir });
      } catch (error) {
        json(res, 500, { ok: false, error: String(error?.message ?? error) });
      }
      return;
    }
    json(res, 405, { ok: false, error: 'method not allowed' });
  }

  // ── 平台 ────────────────────────────────────────────────────────────────
  async function handlePlatforms(req, res) {
    json(res, 200, { ok: true, platforms: await platforms.statusAll(), capabilities: ['identity', 'memory.read', 'memory.write', 'prompt.block', 'actions'] });
  }

  // ── 贴吧（BDUSS 登录 + 手机版/app 接口）────────────────────────────────
  async function handleTieba(req, res, url) {
    const pathname = url.pathname;
    // 保存 BDUSS 并当场验证（curl 网络层，百度不认 Node fetch 的 TLS 指纹）
    if (pathname.endsWith('/login')) {
      if (req.method !== 'POST') { json(res, 405, { ok: false, error: '只支持 POST' }); return; }
      let body = {};
      try { body = await readJsonBody(req); } catch { json(res, 400, { ok: false, error: '请求体不是合法 JSON' }); return; }
      try {
        pluginLog('[贴吧登录] 保存 BDUSS');
        const result = await saveTiebaCookieLogin(String(body.cookie ?? body.bduss ?? ''));
        try { markTiebaVerified(); } catch {}
        json(res, 200, { ok: true, ...result });
      } catch (error) {
        pluginLog(`[贴吧登录] 失败：${String(error?.message ?? error)}`);
        json(res, 400, { ok: false, code: String(error?.code ?? ''), error: String(error?.message ?? error) });
      }
      return;
    }
    // 手机扫码登录：换到 BDUSS 后由后端用 curl 验证并落盘，用户不用复制任何东西
    if (pathname.endsWith('/qr/start')) {
      if (req.method !== 'POST') { json(res, 405, { ok: false, error: '只支持 POST' }); return; }
      try {
        pluginLog('[贴吧登录] 生成二维码');
        json(res, 200, { ok: true, ...(await startTiebaQrLogin()) });
      } catch (error) {
        pluginLog(`[贴吧登录] 二维码失败：${String(error?.message ?? error)}`);
        json(res, 503, { ok: false, error: String(error?.message ?? error) });
      }
      return;
    }
    if (pathname.endsWith('/qr/poll')) {
      if (req.method !== 'GET') { json(res, 405, { ok: false, error: '只支持 GET' }); return; }
      const id = String(url.searchParams.get('id') ?? '').trim();
      if (!/^tieba_qr_[0-9a-f-]{36}$/i.test(id)) { json(res, 400, { ok: false, error: 'id 不合法' }); return; }
      const result = await pollTiebaQrLogin(id);
      if (result?.status === 'failed') pluginLog(`[贴吧登录] 扫码失败：${String(result.error ?? '').slice(0, 300)}`);
      if (result?.status === 'confirmed') { try { markTiebaVerified(); } catch {} }
      json(res, 200, result);
      return;
    }
    if (pathname.endsWith('/qr/cancel')) {
      if (req.method !== 'POST') { json(res, 405, { ok: false, error: '只支持 POST' }); return; }
      let body = {};
      try { body = await readJsonBody(req); } catch {}
      cancelTiebaQrLogin(String(body.id ?? '').trim());
      json(res, 200, { ok: true });
      return;
    }
    // 浏览器自动化入口已废弃（Chrome 136 读不到加密 cookie，且要关浏览器）
    if (pathname.endsWith('/open-token')) {
      json(res, 410, {
        ok: false, code: 'tieba.legacy-login-removed',
        error: '领取 token 页已移除，请用扫码登录',
        hint: '点「扫码登录」，手机确认后自动完成',
      });
      return;
    }
    // 旧的浏览器登录入口（已废弃）
    if (pathname.includes('/login/start') || pathname.includes('/login/poll') || pathname.includes('/login/cancel')) {
      json(res, 410, {
        ok: false, code: 'tieba.legacy-login-removed',
        error: '浏览器自动登录已移除，改为粘贴 BDUSS',
        hint: '把 BDUSS 粘贴到输入框，点「保存并测试」',
      });
      return;
    }
    if (pathname.endsWith('/credentials/clear')) {
      if (req.method !== 'POST') { json(res, 405, { ok: false, error: '只支持 POST' }); return; }
      clearTiebaCredentials();
      json(res, 200, { ok: true });
      return;
    }
    if (pathname.endsWith('/account/verify')) {
      if (req.method !== 'POST') { json(res, 405, { ok: false, error: '只支持 POST' }); return; }
      try { json(res, 200, await verifyStoredTiebaCredentials()); }
      catch (error) { json(res, 500, { ok: false, error: `核查失败：${String(error?.message ?? error).slice(0, 160)}` }); }
      return;
    }
    // 看过的帖子（设置页「观看记录」）
    if (req.method === 'GET' && pathname.endsWith('/history')) {
      try {
        json(res, 200, {
          ok: true,
          ...readTiebaViewHistory({
            limit: Number(url.searchParams.get('limit')) || 200,
            q: url.searchParams.get('q') ?? '',
            days: Number(url.searchParams.get('days')) || 0,
          }),
        });
      } catch (error) {
        json(res, 500, { ok: false, error: String(error?.message ?? error) });
      }
      return;
    }
    // 默认 GET → 状态
    if (req.method === 'GET') { json(res, 200, tiebaStatus()); return; }
    // POST → action 分发（heartbeat-now / verify / feed / ...）
    let body = {};
    try { body = await readJsonBody(req); } catch { json(res, 400, { ok: false, error: '请求体不是合法 JSON' }); return; }
    const action = String(body.action ?? '');
    if (action === 'heartbeat-now') {
      if (!scheduler || !schedulerStatus.running) {
        json(res, 400, { ok: false, error: 'B站生物钟没在运行：贴吧跟它共用作息，先启动 B站 平台' });
        return;
      }
      try {
        const result = await scheduler.wakeTieba?.('手动');
        json(res, 200, { ok: true, ...result });
      } catch (error) {
        json(res, 500, { ok: false, error: String(error?.message ?? error) });
      }
      return;
    }
    const allowed = ['verify', 'feed', 'thread', 'floor', 'replyme', 'post', 'reply', 'like', 'unlike', 'sign', 'delete-thread', 'delete-post', 'rename', 'summary', 'status'];
    if (!allowed.includes(action)) { json(res, 400, { ok: false, error: `未知贴吧动作：${action || '（空）'}` }); return; }
    try {
      const result = await tiebaAction(action, body);
      json(res, 200, { ok: true, ...result });
    } catch (error) {
      json(res, 400, { ok: false, error: String(error?.message ?? error), code: String(error?.code ?? '') });
    }
  }

  // ── 全局模型（对话页）：一份选择，插件后台任务与新建会话共用 ───────────
  async function modelCatalog() {
    const saved = readUnified().config.model ?? { provider: '', model: '' };
    let providers = [];
    let models = [];
    let error = '';
    if (!llmService || typeof llmService.listProviders !== 'function') {
      error = 'DSH 模型服务未就绪';
    } else {
      try { providers = llmService.listProviders().map((item) => ({ id: String(item.id ?? ''), name: String(item.name || item.displayName || item.id || '') })); }
      catch (err) { error = `读取提供商失败：${String(err?.message ?? err).slice(0, 160)}`; }
      for (const provider of providers) {
        try {
          const list = typeof llmService.listModels === 'function' ? await Promise.race([
            llmService.listModels(provider.id),
            new Promise((_, reject) => setTimeout(() => reject(new Error('目录查询超时')), 5000)),
          ]) : [];
          for (const entry of Array.isArray(list) ? list : []) {
            if (!entry?.id) continue;
            models.push({ provider: provider.id, id: String(entry.id), name: String(entry.name || entry.id) });
          }
        } catch (err) { error = error || `${provider.id}: ${String(err?.message ?? err).slice(0, 120)}`; }
      }
    }
    let dshDefault = {};
    try { dshDefault = defaultModelService?.currentSelection?.() ?? {}; } catch {}
    return { ok: true, providers, models, saved, dshDefault, error };
  }

  async function handleModels(req, res) {
    if (req.method === 'GET') { json(res, 200, await modelCatalog()); return; }
    if (req.method !== 'POST') { json(res, 405, { ok: false, error: '只支持 GET / POST' }); return; }
    let body = {};
    try { body = await readJsonBody(req); } catch { json(res, 400, { ok: false, error: '请求体不是合法 JSON' }); return; }
    const provider = String(body.provider ?? '').trim().slice(0, 200);
    const model = String(body.model ?? '').trim().slice(0, 300);
    if (Boolean(provider) !== Boolean(model)) { json(res, 400, { ok: false, error: '提供商和模型要同时选，或同时清空（跟随默认）' }); return; }
    saveUnified({ model: { provider, model } });
    let defaultSaved = false;
    if (provider && model && typeof defaultModelService?.saveSelection === 'function') {
      try { await defaultModelService.saveSelection({ provider, model }); defaultSaved = true; } catch (err) { pluginLog(`[模型] 写入 DSH 默认失败：${String(err?.message ?? err).slice(0, 160)}`); }
    }
    pluginLog(`[模型] 全局模型 → ${provider ? `${provider}/${model}` : '跟随 DSH 默认'}`);
    json(res, 200, { ...(await modelCatalog()), ok: true, defaultSaved });
  }

  // ── 抖音（第 4 个平台：网页版 + 本机 Edge，登录在专用窗口里人工完成）──────
  // GET  /douyin            → 状态（开关 / 时段 / 今日额度 / 窗口 / 上次总结）
  // GET  /douyin/history    → 看过的视频（本地记录）
  // POST /douyin  {action}  → open / current / next / search / start / stop / apply / summary
  async function handleDouyin(req, res, url) {
    const pathname = url.pathname;
    if (req.method === 'GET' && pathname.endsWith('/history')) {
      try { json(res, 200, readDouyinHistory({ limit: Number(url.searchParams.get('limit')) || 300 })); }
      catch (error) { json(res, 500, { ok: false, error: String(error?.message ?? error) }); }
      return;
    }
    if (req.method === 'GET') { json(res, 200, await douyinStatus()); return; }
    if (req.method !== 'POST') { json(res, 405, { ok: false, error: '只支持 GET / POST' }); return; }
    let body = {};
    try { body = await readJsonBody(req); } catch { json(res, 400, { ok: false, error: '请求体不是合法 JSON' }); return; }
    const action = String(body.action ?? '');
    if (!['open', 'current', 'next', 'search', 'start', 'stop', 'apply', 'status', 'summary', 'comments', 'notices', 'debrief',
      'chat-status', 'chat-contacts', 'chat-configure', 'chat-start', 'chat-stop', 'chat-read', 'chat-minimize', 'chat-models', 'chat-set-model', 'chat-setup', 'chat-recover', 'chat-enable',
      'im-status', 'im-login-qr', 'im-login-sms', 'im-sms-code', 'im-logout', 'im-contacts', 'im-config', 'im-start', 'im-stop', 'im-selftest'].includes(action)) {
      json(res, 400, { ok: false, error: `未知抖音动作：${action || '（空）'}` });
      return;
    }
    try {
      let result;
      if (action === 'open') result = await douyinOpen();
      else if (action === 'current') result = await douyinCurrent();
      else if (action === 'next') result = await douyinNext();
      else if (action === 'search') result = await douyinSearch(body.query);
      else if (action === 'start') result = await douyinStart({ reason: String(body.reason || '手动'), maxVideos: body.maxVideos, minutes: body.minutes });
      else if (action === 'stop') result = await douyinStop();
      else if (action === 'summary') result = douyinSummary(body.note);
      else if (action === 'comments') result = await douyinComments({ awemeId: body.awemeId, url: body.url, max: body.max, images: body.images !== false });
      else if (action === 'notices') result = await douyinNotices({ count: body.count });
      else if (action === 'debrief') result = await douyinDebrief({ awemeId: body.awemeId, url: body.url, danmakuLimit: body.danmakuLimit, commentMax: body.commentMax });
      else if (action === 'chat-status') result = await douyinChatStatus();
      else if (action === 'chat-contacts') result = await douyinChatContacts();
      else if (action === 'chat-configure') result = await douyinChatConfigure({ recipientIds: body.recipientIds, mentionNames: body.mentionNames, allowConversationOnly: body.allowConversationOnly });
      else if (action === 'chat-start') result = await douyinChatStart();
      else if (action === 'chat-stop') result = await douyinChatStop();
      else if (action === 'chat-read') result = await douyinChatRead(body.recipientId);
      else if (action === 'chat-minimize') result = await douyinChatMinimize();
      else if (action === 'chat-models') result = await douyinChatModels();
      else if (action === 'chat-set-model') result = await douyinChatSetModel({ provider: body.provider, model: body.model });
      else if (action === 'chat-setup') result = await douyinChatSetup({ recipientIds: body.recipientIds, mentionNames: body.mentionNames });
      else if (action === 'chat-enable') result = await douyinChatEnable();
      else if (action === 'chat-recover') result = await douyinChatRecover();
      else if (action === 'im-status') result = douyinImStatus();
      else if (action === 'im-login-qr') result = await douyinImLoginQr();
      else if (action === 'im-login-sms') result = await douyinImLoginSms(body.mobile);
      else if (action === 'im-sms-code') result = await douyinImSubmitSms(body.code);
      else if (action === 'im-logout') result = await douyinImLogout();
      else if (action === 'im-contacts') result = await douyinImContacts();
      else if (action === 'im-config') result = douyinImSaveConfig(body);
      else if (action === 'im-start') result = await douyinImStart();
      else if (action === 'im-stop') result = await douyinImStop();
      else if (action === 'im-selftest') result = await douyinImSelftest();
      else { if (action === 'apply') douyinSyncPolicy(); result = await douyinStatus(); }
      if (result?.ok === false) { json(res, 400, result); return; }
      json(res, 200, { ...result, ok: true });
    } catch (error) {
      pluginLog(`[抖音] ${action} 失败：${String(error?.message ?? error).slice(0, 200)}`);
      json(res, 400, { ok: false, code: String(error?.code ?? ''), error: String(error?.message ?? error) });
    }
  }

  // ── 组件更新 ────────────────────────────────────────────────────────────
  // GET  : 最近一次检查结果 + 待更新项 + 是否该弹窗
  // POST : { action:'check' | 'apply' | 'dismiss' | 'reset', ids?: string[] }
  async function handleUpdates(req, res) {
    if (req.method === 'GET') { json(res, 200, updates.status()); return; }
    let body = {};
    try { body = await readJsonBody(req); } catch { json(res, 400, { ok: false, error: '请求体不是合法 JSON' }); return; }
    const action = String(body.action ?? '');
    const ids = Array.isArray(body.ids) ? body.ids.map(String) : [];
    if (action === 'check') { json(res, 200, await updates.check({ fetch: true })); return; }
    if (action === 'apply') { json(res, 200, await updates.apply(ids)); return; }
    if (action === 'set-token' || action === 'clear-token') {
      try {
        const current = readUnified().config ?? {};
        const next = { ...current, updates: { ...(current.updates ?? {}) } };
        if (action === 'clear-token') delete next.updates.githubToken;
        else next.updates.githubToken = String(body.token ?? '').trim();
        saveUnified(next);
        json(res, 200, { ok: true, configured: action === 'set-token' && Boolean(next.updates.githubToken) });
      } catch (error) {
        json(res, 500, {
          ok: false, code: 'token.save-failed',
          error: `保存 token 失败：${String(error?.message ?? error).slice(0, 160)}`,
          hint: '检查 config.json 是否可写；也可以稍后重试',
        });
      }
      return;
    }
    if (action === 'rollback') {
      const target = String(body.id ?? ids[0] ?? '').trim();
      json(res, 200, await updates.rollback(target));
      return;
    }
    if (action === 'dismiss') { json(res, 200, updates.dismiss(ids)); return; }
    if (action === 'reset') { json(res, 200, updates.resetDismissed()); return; }
    json(res, 400, { ok: false, error: '未知 action' });
  }

  // ── 每日 token 额度 ─────────────────────────────────────────────────────
  // GET  : 额度 + 今日三类用量 + 比例 + 当天唯一的 80% 提醒（取走即落盘）
  // POST : { limits } 整体保存 / { add:{scope,unit,amount} } 快捷加额度 / { reset:true } 清空
  async function handleTokenBudget(req, res, url) {
    if (req.method === 'GET') {
      const takeAlertFlag = url?.searchParams?.get('alert') !== '0';
      json(res, 200, await tokenBudget.status({ takeAlertFlag }));
      return;
    }
    if (req.method !== 'POST') { json(res, 405, { ok: false, error: '只支持 GET / POST' }); return; }
    let body;
    try {
      body = await readJsonBody(req);
    } catch {
      json(res, 400, { ok: false, error: '请求体不是合法 JSON' });
      return;
    }
    try {
      if (body?.reset === true) {
        backupFile(tokenBudget.budgetFile, 'token-budget-before-reset');
        tokenBudget.resetLimits();
      } else if (body?.add && typeof body.add === 'object') {
        backupFile(tokenBudget.budgetFile, 'token-budget-before-add');
        tokenBudget.addLimit(body.add.scope, body.add.unit, body.add.amount);
      } else if (body?.limits !== undefined) {
        backupFile(tokenBudget.budgetFile, 'token-budget-before-save');
        tokenBudget.saveLimits(body.limits);
      } else {
        throw new Error('缺少 limits，或 add / reset');
      }
      json(res, 200, await tokenBudget.status({ takeAlertFlag: false }));
    } catch (error) {
      json(res, 400, { ok: false, error: `保存额度失败：${String(error?.message ?? error)}` });
    }
  }

  // ── 路由：API 前缀 ──────────────────────────────────────────────────────
  route('prefix', API_PREFIX, async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    const pathname = url.pathname;
    if (pathname === `${API_PREFIX}/overview`) { json(res, 200, await overview()); return; }
    if (pathname === `${API_PREFIX}/config`) { await handleConfig(req, res); return; }
    if (pathname === `${API_PREFIX}/characters`) { await handleCharacters(req, res, url); return; }
    if (pathname === `${API_PREFIX}/persona`) { await handlePersona(req, res); return; }
    if (pathname === `${API_PREFIX}/limit-mute`) { await handleLimitMute(req, res); return; }
    if (pathname === `${API_PREFIX}/persona/classify`) { await handlePersonaClassify(req, res); return; }
    if (pathname === `${API_PREFIX}/group-policy`) { await handleGroupPolicy(req, res); return; }
    if (pathname === `${API_PREFIX}/memory`) { await handleMemory(req, res, url); return; }
    if (pathname === `${API_PREFIX}/watch-history`) { handleWatchHistory(res, url); return; }
    if (pathname === `${API_PREFIX}/preferences/scan`) {
      if (req.method !== 'GET') { json(res, 405, { ok: false, error: '只支持 GET' }); return; }
      await handlePreferenceScan(res, url);
      return;
    }
    if (pathname === `${API_PREFIX}/fish-guard/qq`) { handleQqFishGuard(res); return; }
    if (pathname === `${API_PREFIX}/memory-card/full`) { await handleMemoryCardFull(req, res, url); return; }
    if (pathname === `${API_PREFIX}/memory-card`) { await handleMemoryCard(req, res, url); return; }
    if (pathname === `${API_PREFIX}/align`) { await handleAlign(req, res); return; }
    if (pathname === `${API_PREFIX}/mode`) { await handleMode(req, res); return; }
    if (pathname === `${API_PREFIX}/platforms`) { await handlePlatforms(req, res); return; }
    if (pathname === `${API_PREFIX}/models`) { await handleModels(req, res); return; }
    if (pathname.startsWith(`${API_PREFIX}/tieba`)) { await handleTieba(req, res, url); return; }
    if (pathname.startsWith(`${API_PREFIX}/douyin`)) { await handleDouyin(req, res, url); return; }
    if (pathname === `${API_PREFIX}/compat/scan`) {
      try {
        let version = '';
        try { version = String(JSON.parse(fs.readFileSync(path.join(QQBOT_ROOT, 'package.json'), 'utf8')).version ?? ''); } catch {}
        const report = scanPluginCompatibility({ surfcoreVersion: version });
        // 体检结果进闸门事件中心：只记 blocker/high，unknown/info 留在体检报告里，避免噪音。
        for (const issue of report.issues ?? []) {
          if (issue.severity !== 'blocker' && issue.severity !== 'high') continue;
          gateEvents.record({
            gate: 'plugin-compat',
            kind: 'compat',
            event: issue.code,
            action: 'blocked',
            subject: { bundle: issue.evidence?.bundle ?? '', profile: report.profile?.name ?? '' },
            reason: { code: issue.code, message: issue.title },
            impact: issue.impact,
            recommendation: issue.recommendation,
            confidence: issue.confidence,
            dedupeKey: `compat:${issue.code}:${issue.evidence?.bundle ?? ''}`,
            evidence: issue.evidence ?? {},
          });
        }
        json(res, 200, report);
      } catch (error) {
        json(res, 500, {
          ok: false,
          code: 'COMPAT_SCAN_FAILED',
          error: `插件体检失败：${String(error?.message ?? error)}`,
          hint: '先确认 DSH_HOME/profiles 可读；如果刚升级过 DSH，重启 DSH 后再试。',
        });
      }
      return;
    }
    if (pathname === `${API_PREFIX}/gate-events`) {
      if (req.method === 'GET') {
        const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit')) || 50));
        const level = String(url.searchParams.get('level') ?? '').trim();
        const includeAcked = url.searchParams.get('includeAcked') !== '0';
        json(res, 200, { ok: true, ...gateEvents.list({ limit, level, includeAcked }), gateEvents: true });
        return;
      }
      if (req.method === 'POST') {
        const body = await readJsonBody(req);
        const acked = gateEvents.ack(Array.isArray(body.ids) ? body.ids : [], body.action === 'ack-all' || body.all === true);
        json(res, 200, { ok: true, ...acked, ...gateEvents.list({ limit: 50, includeAcked: false }) });
        return;
      }
      json(res, 405, { ok: false, code: 'GATE_EVENTS_METHOD', error: '只支持 GET / POST', hint: '刷新页面后重试' });
      return;
    }
    if (pathname === `${API_PREFIX}/diagnostics`) { await handleDiagnostics(req, res); return; }
    if (pathname === `${API_PREFIX}/bridge`) { await handleBridge(req, res); return; }
    if (pathname.startsWith(`${API_PREFIX}/purpose`)) { await handlePurpose(req, res, url); return; }
    if (pathname.startsWith(`${API_PREFIX}/persona`)) { await handlePersonaState(req, res, url); return; }
    if (pathname.startsWith(`${API_PREFIX}/learning`)) { await handleLearning(req, res, url); return; }
    if (pathname === `${API_PREFIX}/voice/preview`) { await handleVoicePreview(req, res, url); return; }
    if (pathname === `${API_PREFIX}/snowluma`) { await handleSnowLuma(req, res); return; }
    // 其余语音包管理路由（/voice/packs、/voice/tts-*）已随语音包子系统下线（2026-11 精简）。
    if (pathname.startsWith(`${API_PREFIX}/pet`)) { await handlePet(req, res, url); return; }

    if (pathname === `${API_PREFIX}/token-budget`) { await handleTokenBudget(req, res, url); return; }
    if (pathname === `${API_PREFIX}/updates`) { await handleUpdates(req, res); return; }
    if (pathname.startsWith(`${API_PREFIX}/bili/`)) { await handleBili(req, res, url); return; }
    if (pathname === `${API_PREFIX}/logs`) { handleLogs(res, url); return; }
    // /owner-audit/open 是设置页「打开所在文件夹」按钮用的路径，别只匹配到 /owner-audit（否则按钮 404）。
    if (pathname === `${API_PREFIX}/owner-audit` || pathname === `${API_PREFIX}/owner-audit/open`) { await handleOwnerAudit(req, res, url); return; }
    if (pathname === `${API_PREFIX}/browse`) { await handleBrowse(req, res, url); return; }
    if (pathname === `${API_PREFIX}/privacy/explain`) {
      const body = req.method === 'POST' ? await readJsonBody(req) : { text: url.searchParams.get('text') ?? '' };
      json(res, 200, { ok: true, ...explainText(String(body.text ?? '')) });
      return;
    }
    json(res, 404, { ok: false, error: `未知接口：${pathname}` });
  });

  // 扩展自定义路由已移除（2026-11-03）。

  // 桌宠专用本地接口：独立前缀 + 自己的回环/令牌校验。
  // 不能塞进 /dsh-surfcore/api：那里有 DSH 的 connection.requestRejection（桌宠进程没有会话 Cookie，会 401）。
  disposers.push(ctx.webServer.register({
    kind: 'prefix',
    path: petApi.prefix,
    handler: async (req, res) => {
      try {
        const url = new URL(req.url, 'http://127.0.0.1');
        await petApi.handle(req, res, url);
      } catch (error) {
        pluginLog('[pet-api] 请求失败：', String(error?.message ?? error));
        // 和设置页 API 同口径：readBody 的超限(413) / readJsonBody 的坏 JSON(400) 按自己的码回。
        const status = Number(error?.statusCode);
        const code = status >= 400 && status < 600 ? status : 500;
        try { json(res, code, { ok: false, code: String(error?.code ?? ''), error: String(error?.message ?? error) }); } catch {}
      }
    },
  }));

  route('exact', '/dsh-surfcore/health', async (req, res) => {
    json(res, 200, { ok: true, name, version: VERSION, privacyPolicyVersion: PRIVACY_POLICY_VERSION });
  });

  // 桌宠发现文件（端口漂移 / 令牌轮换都由它兜底）：启动写一次，之后每 2 分钟对一次。
  try { petApi.writeHostFile(true); } catch (error) { pluginLog('[pet-api] 启动写 host.json 失败：', String(error?.message ?? error)); }
  const petHostTimer = setInterval(() => { try { petApi.writeHostFile(false); } catch {} }, 120_000);
  petHostTimer.unref?.();
  // 目的机制（桌宠载体）：carrier=pet 时由这里每 60 秒 tick；carrier=qq 时它自己会退出。
  try { petPurpose.start(); } catch (error) { pluginLog('[pet-purpose] 启动失败：', String(error?.message ?? error)); }

  // 启动后异步做的事（不阻塞插件激活）
  void maybeAutoStartBridge();
  // 组件更新检查已下线（2026-11-03）：设置页不再有更新面板，代码更新改为手动 git pull。
  // 这里不再启动定时 GitHub 请求，避免无意义的后台网络与「查不到/已阻止」噪音。
  // 端口漂移自愈：每 2 分钟检查一次（内部会判断 autoStart 是否开启、是否有并发）。
  bridgeRepairTimer = setInterval(() => { void maybeAutoStartBridge(); }, 120_000);
  bridgeRepairTimer.unref?.();
  startSyncTimer();

  // 抖音的自动轮次跟 B站 生物钟分开：B站 没登录时生物钟不启动，
  // 但抖音是独立的第四个平台，必须按自己的时段走。
  const douyinTimer = setInterval(() => { douyinAutoTick().catch(() => {}); }, 60_000);
  douyinTimer.unref?.();
  const douyinStartupTimer = setTimeout(() => { douyinAutoTick().catch(() => {}); }, 25_000);
  douyinStartupTimer.unref?.();
  // 旧的浏览器私信方案已退役：只有显式打开 legacyBrowser 时才继续跑（默认走 douyin-im）。
  const legacyBrowserChat = readUnified().config?.douyin?.chat?.legacyBrowser === true;
  const douyinChatTimer = legacyBrowserChat ? setTimeout(() => { douyinChatResume().catch(() => {}); }, 35_000) : null;
  douyinChatTimer?.unref?.();
  // 旧的群聊守护：同样只在 legacyBrowser 模式下工作，避免和 douyin-im 重复回复。
  const douyinChatWatchdog = legacyBrowserChat ? setInterval(async () => {
    try {
      if (readUnified().config?.douyin?.chat?.enabled !== true) return;
      const chatState = await douyinChatStatus();
      if (chatState?.running || chatState?.starting) return;
      pluginLog('[抖音] 自动回复未在运行：自动准备专用窗口并恢复');
      const result = await douyinChatResume();
      if (result?.ok === false) pluginLog(`[抖音] 自动恢复失败：${String(result.error ?? '').slice(0, 160)}`);
    } catch (error) {
      pluginLog(`[抖音] 自动恢复失败：${String(error?.message ?? error).slice(0, 160)}`);
    }
  }, 60_000) : null;
  douyinChatWatchdog?.unref?.();
  // 新方案：douyin-im 长连接（不用浏览器）。开关开着且登录过就自动恢复。
  scheduleDouyinImResume();
  // 调试用：IM 目录里有 selftest.flag 时，启动后自动验证一次「消息 → DSH 会话 → 回复」。
  scheduleDouyinImSelftest();

  // 保存设置后如果开启了“随插件自动启动”，这里也覆盖一次。
  ctx.effect(() => () => {
    try { scheduler?.stop?.(); } catch {}
    try { void disposeDouyin(); } catch {}
    try { updates.dispose(); } catch {}
    try { petPurpose.stop?.(); } catch {}
    if (petHostTimer) clearInterval(petHostTimer);
    if (typeof douyinChatWatchdog !== 'undefined') clearInterval(douyinChatWatchdog);
    try { disposeDouyinIm(); } catch {}
    try { sessionEventOff?.(); } catch {}
    try { billing.dispose(); } catch {}
    try { tokenBudget.dispose(); } catch {}
    try { memoryCardTimer?.stop?.(); } catch {}
    try { learningLoop.stop(); } catch {}
    if (memoryOrganizeTimer) clearInterval(memoryOrganizeTimer);
    try { closeAllQrLogins(); } catch {}
    if (characterTimer) clearInterval(characterTimer);
    if (syncTimer) clearInterval(syncTimer);
    if (bridgeRepairTimer) clearInterval(bridgeRepairTimer);
    clearInterval(douyinTimer); clearTimeout(douyinStartupTimer); clearTimeout(douyinChatTimer);
    // 桥接现在跑在本进程里：插件卸载时必须把它一起停掉，否则端口/QQ 连接会挂到 DSH 退出。
    try { void stopBridge(); } catch {}
    for (const dispose of disposers) { try { dispose(); } catch {} }
  });

  // 诊断日志：证明插件真的被装配，且知道它读的是哪一份配置。
  pluginLog(`已激活 v${VERSION}；qqConfig=${maskPath(QQ_CONFIG)}；qqData=${maskPath(DATA_ROOT)}；biliTools=${maskPath(BILI_MJS)}；privacy=v${PRIVACY_POLICY_VERSION}`);
}

export default { name, inject, apply };
