#!/usr/bin/env node
// clean-dead-workspaces.mjs — 清掉 DSH 里「指向已删目录」的工作区（以及它们的会话映射）。
//
// 为什么需要：工作区的 path 被删掉之后，DSH 下次用到它时会把目录**重新建出来**（空目录），
// 而桥接/插件是按「会话 cwd 是否存在」来投递提醒的。本机真实事故：旧 `<工作区>\surface_core`
// 被删后群会话 cwd 不存在，唤醒提醒连续两次投递失败；同时那个旧路径又被 DSH 复活成一个空目录。
// 清掉尸体工作区，这条复活链才会断。
//
// 安全策略：
//   · 默认 **dry-run**，只打印计划；加 `--apply` 才真删。
//   · 只处理 path **不存在** 的工作区，存在的绝不碰。
//   · 删除前把 ~/.dsh/sessions/ 下对应会话目录复制到 <repo>/_backups/dead-workspaces-<ts>/，
//     历史不丢（_backups 已在 .gitignore）。
//   · 会话先 archive 再删工作区（archive 是 DSH 自己的归档语义，不是删除）。
//
// 用法：
//   node scripts/clean-dead-workspaces.mjs                 # 看看有哪些尸体工作区
//   node scripts/clean-dead-workspaces.mjs --apply         # 真删（先备份）
//   node scripts/clean-dead-workspaces.mjs --apply --except 5cf79c5d-...  # 排除某个（比如当前会话所在的）
//   node scripts/clean-dead-workspaces.mjs --apply --only 11eb8d7f-...
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { discoverDshBaseUrl } from '../src/dsh-port.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DSH_HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
const STORE = path.join(DSH_HOME, 'storages', 'workspace.json');
const SESSIONS_DIR = path.join(DSH_HOME, 'sessions');

const APPLY = process.argv.includes('--apply');
// 目录还存在、但里面是空的：多半是 DSH 按工作区路径「复活」出来的空壳
// （本机 surface_core 就是这种）。空目录也可能是用户刚建的干净工作区，所以默认不动。
const INCLUDE_EMPTY = process.argv.includes('--include-empty');
const argvValue = (name) => {
  const i = process.argv.indexOf(name);
  return i === -1 ? '' : String(process.argv[i + 1] ?? '');
};
const only = new Set(argvValue('--only').split(',').map((s) => s.trim()).filter(Boolean));
const except = new Set(argvValue('--except').split(',').map((s) => s.trim()).filter(Boolean));
const onlyMatched = (id) => !only.size || [...only].some((prefix) => id.startsWith(prefix));
const exceptMatched = (id) => [...except].some((prefix) => id.startsWith(prefix));

function readWorkspaces() {
  const raw = JSON.parse(fs.readFileSync(STORE, 'utf8'));
  const workspaces = raw?.tables?.workspaces ?? {};
  return Object.entries(workspaces).map(([workspaceId, value]) => ({
    workspaceId,
    title: String(value?.title ?? ''),
    dir: String(value?.path ?? ''),
    sessionIds: Array.isArray(value?.sessionIds) ? value.sessionIds : [],
  }));
}

function sessionDirOf(sessionId) {
  // 会话目录名形如 --D-deepseekwork-surface_core--/session-<id>；id 是唯一的，扫一层即可。
  let entries = [];
  try { entries = fs.readdirSync(SESSIONS_DIR, { withFileTypes: true }); } catch { return null; }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const candidate = path.join(SESSIONS_DIR, entry.name, `session-${sessionId}`);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

async function main() {
  if (!fs.existsSync(STORE)) {
    console.error(`[clean-workspaces] 找不到工作区存储：${STORE}（DSH 是否装在这里？DSH_HOME=${DSH_HOME}）`);
    process.exit(1);
  }
  const all = readWorkspaces();
  const dead = all
    .map((w) => {
      if (!w.dir) return { ...w, reason: '' };
      if (!fs.existsSync(w.dir)) return { ...w, reason: '路径已不存在' };
      if (!INCLUDE_EMPTY) return { ...w, reason: '' };
      let empty = false;
      try { empty = fs.readdirSync(w.dir).length === 0; } catch { empty = false; }
      return { ...w, reason: empty ? '空目录（可能被 DSH 复活）' : '' };
    })
    .filter((w) => w.reason);

  console.log(`[clean-workspaces] 工作区共 ${all.length} 个，其中 ${dead.length} 个可清理：`);
  for (const w of dead) {
    const mark = onlyMatched(w.workspaceId) && !exceptMatched(w.workspaceId) ? '→ 待处理' : '跳过（--only/--except）';
    console.log(`  · ${w.workspaceId}  「${w.title}」  ${w.dir}   [${w.reason}]`);
    console.log(`      会话 ${w.sessionIds.length} 个  ${mark}`);
  }

  const targets = dead.filter((w) => onlyMatched(w.workspaceId) && !exceptMatched(w.workspaceId));
  if (!targets.length) {
    console.log('[clean-workspaces] 没有要处理的工作区。');
    return;
  }
  if (!APPLY) {
    console.log('\n[clean-workspaces] dry-run：没有改任何东西。确认后加 --apply 再跑一次。');
    return;
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupRoot = path.join(REPO, '_backups', `dead-workspaces-${stamp}`);

  const base = process.env.DSH_BASE_URL || (await discoverDshBaseUrl());
  if (!base) {
    console.error('[clean-workspaces] 找不到正在运行的 DSH；归档/删除工作区需要连上它（先启动 DSH）。');
    process.exit(1);
  }
  process.env.DSH_BASE_URL = base;
  const { probeCookie, probeRpc } = await import('./probe-auth.mjs');
  const rpc = probeRpc(probeCookie());
  console.log(`\n[clean-workspaces] DSH=${base}，开始处理 ${targets.length} 个工作区…`);

  let archived = 0;
  let deleted = 0;
  const failures = [];
  for (const w of targets) {
    console.log(`\n— 「${w.title}」 ${w.workspaceId}（${w.dir}）`);
    // 1) 先备份会话目录（删工作区可能级联清掉它们，历史不能只靠运气）。
    for (const sessionId of w.sessionIds) {
      const from = sessionDirOf(sessionId);
      if (!from) { console.log(`   · 会话 ${sessionId}：磁盘上没有目录，跳过备份`); continue; }
      const to = path.join(backupRoot, sessionId);
      try {
        fs.mkdirSync(to, { recursive: true });
        fs.cpSync(from, to, { recursive: true });
        console.log(`   · 会话 ${sessionId}：已备份到 ${path.relative(REPO, to)}`);
      } catch (error) {
        failures.push(`备份 ${sessionId} 失败：${error?.message ?? error}`);
        console.log(`   · 会话 ${sessionId}：备份失败 ${error?.message ?? error}`);
      }
    }
    // 2) 归档会话（DSH 语义：从当前列表移走，不是删除）。
    for (const sessionId of w.sessionIds) {
      const r = await rpc('workspace/archiveSession', { request: { sessionId } });
      if (r.ok) { archived += 1; console.log(`   · 会话 ${sessionId}：已归档`); }
      else console.log(`   · 会话 ${sessionId}：归档被拒 ${r.error?.code}: ${r.error?.message}`);
    }
    // 3) 删除工作区本身。
    const r = await rpc('workspace/delete', { request: { workspaceId: w.workspaceId } });
    if (r.ok) { deleted += 1; console.log('   · 工作区：已删除'); }
    else {
      failures.push(`删除工作区 ${w.workspaceId} 失败：${r.error?.code}: ${r.error?.message}`);
      console.log(`   · 工作区：删除被拒 ${r.error?.code}: ${r.error?.message}`);
    }
  }

  console.log(`\n[clean-workspaces] 归档 ${archived} 个会话、删除 ${deleted}/${targets.length} 个工作区。`);
  if (fs.existsSync(backupRoot)) console.log(`[clean-workspaces] 会话备份：${backupRoot}`);
  if (failures.length) {
    console.log('[clean-workspaces] 未完成项：');
    for (const line of failures) console.log(`  × ${line}`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('[clean-workspaces] 失败:', error?.message ?? error);
  process.exit(1);
});
