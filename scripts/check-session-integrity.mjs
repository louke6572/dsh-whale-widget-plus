#!/usr/bin/env node
// check-session-integrity.mjs — 只读扫描 DSH 会话目录，找出「目录身份」与「文件头身份」对不上的日志。
//
// 为什么需要（2026-10-22）：
//   一个会话日志放错了项目目录（目录名来自旧 cwd，文件头里的 cwd 是新路径），
//   让 DSH 的 sessionPersistence.list() 整体抛错，workspace 服务起不来、工作区全空。
//   DSH 0.2.1-rc.2 对这类「身份错位」抛的是普通 Error，不在 listArtifacts 的跳过名单里 —— 这是根因。
//   本脚本是**与具体目录名无关**的通用兜底：任何项目目录、任何会话，只要头身份对不上就报出来。
//
// 用法：
//   node scripts/check-session-integrity.mjs                # 只读扫描，有问题退出码 1
//   node scripts/check-session-integrity.mjs --json         # 机器可读
//   node scripts/check-session-integrity.mjs --quarantine   # 把有问题的「会话目录」整目录移到 ~/.dsh/_quarantine/
//   node scripts/check-session-integrity.mjs --root <dir>   # 指定 sessions 根目录（默认 ~/.dsh/sessions）
//
// 安全：默认只读；--quarantine 只做 rename（不删除），并保留原项目目录层级。
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import zlib from 'node:zlib';

const DSH_HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
const argv = process.argv.slice(2);
const argOf = (name, fallback = '') => {
  const i = argv.indexOf(name);
  return i === -1 ? fallback : String(argv[i + 1] ?? fallback);
};
const ROOT = argOf('--root', path.join(DSH_HOME, 'sessions'));
const JSON_OUT = argv.includes('--json');
const QUARANTINE = argv.includes('--quarantine');
const LOGFILE = /^session\.v(\d+)\.jsonl(\.zstd)?$/;

/** DSH 的项目目录编码：`--` + cwd（`:` 丢弃，`\`/`/` → `-`，连续非 ASCII → `~XXXX~XXXX~` 包一段）+ `--` */
export function encodeProjectDir(cwd) {
  const s = String(cwd ?? '');
  let out = '';
  for (let i = 0; i < s.length; i += 1) {
    const ch = s[i];
    const code = s.charCodeAt(i);
    if (ch === ':') continue;
    if (ch === '\\' || ch === '/') { out += '-'; continue; }
    if (code >= 0x20 && code <= 0x7e) { out += ch; continue; }
    const units = [];
    while (i < s.length) {
      const unit = s.charCodeAt(i);
      if (unit >= 0x20 && unit <= 0x7e) break;
      units.push(unit.toString(16).toUpperCase().padStart(4, '0'));
      i += 1;
    }
    i -= 1;
    out += `~${units.join('~')}`;
  }
  return `--${out}--`;
}

/** 只解压 zstd 的第一帧/第一行：头行就是第一行 JSON。 */
function readHeaderLine(file) {
  return new Promise((resolve, reject) => {
    if (file.endsWith('.zstd')) {
      let settled = false;
      const stream = zlib.createZstdDecompress();
      const chunks = [];
      const finish = (fn, value) => { if (settled) return; settled = true; try { stream.destroy(); } catch {} fn(value); };
      stream.on('data', (chunk) => {
        chunks.push(chunk);
        const buf = Buffer.concat(chunks);
        const nl = buf.indexOf(0x0a);
        if (nl !== -1) finish(resolve, buf.subarray(0, nl).toString('utf8'));
      });
      stream.on('end', () => finish(resolve, Buffer.concat(chunks).toString('utf8').split('\n')[0]));
      stream.on('error', (error) => finish(reject, error));
      fs.createReadStream(file, { end: 8 * 1024 * 1024 }).pipe(stream);
      return;
    }
    const fd = fs.openSync(file, 'r');
    try {
      const buf = Buffer.alloc(256 * 1024);
      const n = fs.readSync(fd, buf, 0, buf.length, 0);
      resolve(buf.subarray(0, n).toString('utf8').split('\n')[0]);
    } finally { fs.closeSync(fd); }
  });
}

function sessionDirs(root) {
  const out = [];
  let projects = [];
  try { projects = fs.readdirSync(root, { withFileTypes: true }).filter((e) => e.isDirectory()); } catch { return out; }
  for (const project of projects) {
    let sessions = [];
    try { sessions = fs.readdirSync(path.join(root, project.name), { withFileTypes: true }).filter((e) => e.isDirectory()); } catch { continue; }
    for (const session of sessions) out.push({ project: project.name, session: session.name, dir: path.join(root, project.name, session.name) });
  }
  return out;
}

async function main() {
  if (!fs.existsSync(ROOT)) {
    console.error(`[session-integrity] 找不到会话目录：${ROOT}（DSH_HOME=${DSH_HOME}）`);
    process.exit(1);
  }
  const issues = [];
  const ids = new Map();
  let checked = 0;
  for (const entry of sessionDirs(ROOT)) {
    const files = fs.readdirSync(entry.dir).filter((name) => LOGFILE.test(name));
    if (!files.length) continue;
    for (const name of files) {
      checked += 1;
      const file = path.join(entry.dir, name);
      let header;
      try {
        header = JSON.parse(await readHeaderLine(file));
      } catch (error) {
        issues.push({ kind: '不可读', file, detail: String(error?.message ?? error).slice(0, 160) });
        continue;
      }
      const id = String(header?.id ?? '');
      const expectedSession = id;
      if (!id) { issues.push({ kind: '缺 id', file }); continue; }
      if (entry.session !== expectedSession) {
        issues.push({ kind: '目录名与头部 id 不符', file, detail: `目录 ${entry.session} ≠ ${expectedSession}` });
      }
      if (header.cwd !== undefined) {
        const expectedProject = encodeProjectDir(header.cwd);
        if (entry.project !== expectedProject) {
          issues.push({ kind: '项目目录与头部 cwd 不符', file, detail: `cwd=${header.cwd} → 期望目录 ${expectedProject}，实际 ${entry.project}` });
        }
      }
      const seen = ids.get(id);
      if (seen) issues.push({ kind: '重复 session id', file, detail: `同一 id 也出现在 ${seen}` });
      else ids.set(id, file);
    }
  }

  if (JSON_OUT) console.log(JSON.stringify({ root: ROOT, checked, issues }, null, 2));
  else {
    console.log(`[session-integrity] 扫描 ${checked} 个会话日志：${ROOT}`);
    if (!issues.length) console.log('[session-integrity] ✅ 没有发现身份错位/损坏');
    else {
      console.log(`[session-integrity] ❌ 发现 ${issues.length} 个问题：`);
      for (const issue of issues) {
        console.log(`  · ${issue.kind}  ${path.relative(ROOT, issue.file)}`);
        if (issue.detail) console.log(`      ${issue.detail}`);
      }
      console.log('[session-integrity] 这些日志可能让 DSH 启动时 workspace 服务起不来。');
      if (!QUARANTINE) console.log('[session-integrity] 确认后可加 --quarantine 把对应会话目录移到 ~/.dsh/_quarantine/（只移动，不删除）。');
    }
  }

  if (QUARANTINE && issues.length) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const base = path.join(DSH_HOME, '_quarantine', `session-integrity-${stamp}`);
    const moved = [];
    for (const issue of issues) {
      const rel = path.relative(ROOT, issue.file);
      const [project, session] = rel.split(path.sep);
      const from = path.join(ROOT, project, session);
      const to = path.join(base, project, session);
      if (!fs.existsSync(from)) continue;
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.renameSync(from, to);
      moved.push(to);
    }
    console.log(`[session-integrity] 已隔离 ${moved.length} 个会话目录 → ${base}`);
  }
  process.exitCode = issues.length ? 1 : 0;
}

main().catch((error) => {
  console.error('[session-integrity] 失败：', error?.message ?? error);
  process.exit(1);
});
