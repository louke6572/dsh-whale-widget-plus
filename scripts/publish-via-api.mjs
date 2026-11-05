#!/usr/bin/env node
/**
 * publish-v2：用 GitHub REST（Git Data API）把本地 HEAD 发布到远端 main。
 *
 * 为什么不用 git push：国内网络常放行 api.github.com、但 github.com:443 超时/重置。
 * 与 v1 的区别：v1 要求远端正交在本地历史里（远端提交必须在本地存在）；
 * 而 API 造出来的提交本地没有 → 一改就分叉推不了。v2 直接按 **树** 做 diff：
 *   remote tree → 本地 HEAD tree，只上传差异文件，父提交直接用远端 sha（本地不需要有它）。
 *
 * 用法：
 *   GH_TOKEN=... node scripts/publish-via-api.mjs <owner/repo> <本地仓库目录> [--tag vX] [--message "..."]
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const [, , repoArg, dirArg, ...rest] = process.argv;
if (!repoArg || !dirArg) { console.error('用法: publish-via-api.mjs <owner/repo> <dir>'); process.exit(2); }
const token = process.env.GH_TOKEN;
if (!token) { console.error('缺少 GH_TOKEN'); process.exit(2); }

const tags = [];
let message = '';
let since = '';
let all = false;
for (let i = 0; i < rest.length; i += 1) {
  if (rest[i] === '--tag') tags.push(rest[++i]);
  else if (rest[i] === '--message') message = rest[++i];
  else if (rest[i] === '--since') since = rest[++i];
  else if (rest[i] === '--all') all = true;
}

const dir = path.resolve(dirArg);
const git = (...argv) => execFileSync('git', argv, { cwd: dir, encoding: 'utf8' }).trim();

async function api(method, urlPath, body) {
  const res = await fetch(`https://api.github.com${urlPath}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'User-Agent': 'surfcore-publish',
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(60_000),
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = null; }
  if (!res.ok) throw new Error(`${method} ${urlPath} → HTTP ${res.status}: ${json?.message || text.slice(0, 200)}`);
  return json;
}

const localHead = git('rev-parse', 'HEAD');
const localTree = git('rev-parse', 'HEAD^{tree}');
const ref = await api('GET', `/repos/${repoArg}/git/ref/heads/main`);
const remoteHead = ref.object.sha;
const remoteCommit = await api('GET', `/repos/${repoArg}/git/commits/${remoteHead}`);
const remoteTree = remoteCommit.tree.sha;
console.log(`远端 ${remoteHead.slice(0, 7)} (tree ${remoteTree.slice(0, 7)}) · 本地 ${localHead.slice(0, 7)} (tree ${localTree.slice(0, 7)})`);

if (remoteTree === localTree) {
  console.log('树一致，无需发布');
} else {
  // 优先按远端树 diff（最准）；本地没有该树对象（API 造的提交）时，
  // 用 --since 指定的本地祖先做 diff —— 多上传几个没变的文件没关系，base_tree 仍用远端的。
  let diffBase = remoteTree;
  const hasRemoteTree = (() => { try { git('cat-file', '-t', remoteTree); return true; } catch { return false; } })();
  if (!all && !hasRemoteTree) {
    if (!since) {
      console.error(`本地没有远端树对象 ${remoteTree.slice(0, 7)}；请加 --since <本地已有的远端祖先提交>。`);
      process.exit(3);
    }
    diffBase = since;
    console.log(`用 --since ${since.slice(0, 7)} 做 diff（远端树对象本地没有）`);
  }
  // core.quotePath=false：否则 git 会把中文路径转义成 "dist/å..."，读文件时找不到
  const changed = all
    ? git('-c', 'core.quotePath=false', 'ls-files').split(String.fromCharCode(10)).filter(Boolean).map((rel) => ({ status: 'M', paths: [rel] }))
    : git('-c', 'core.quotePath=false', 'diff', '--name-status', diffBase, 'HEAD')
      .split(String.fromCharCode(10)).filter(Boolean)
      .map((line) => { const [status, ...paths] = line.split('	'); return { status, paths }; });
  console.log(`差异文件：${changed.length}`);
  if (!all && changed.length > 400) { console.error('差异过大（>400），停下来人工确认'); process.exit(4); }

  const entries = [];
  for (const item of changed) {
    if (item.status === 'D') {
      entries.push({ path: item.paths[0], mode: '100644', type: 'blob', sha: null });
      console.log(`  删除 ${item.paths[0]}`);
      continue;
    }
    const to = item.paths[item.paths.length - 1];
    const abs = path.join(dir, to);
    // 从 **git 对象**取内容，而不是工作区文件：Windows 工作区是 CRLF，git 提交/GitHub 归档是 LF；
    // 直接发工作区字节会让远端仓库存成 CRLF → 客户端按清单校验（LF 哈希）必然失败（2026-10-30）。
    let buf;
    try {
      buf = execFileSync('git', ['show', `HEAD:${to}`], { cwd: dir, maxBuffer: 256 * 1024 * 1024 });
    } catch {
      buf = fs.readFileSync(abs); // 未跟踪的新文件（正常流程里不存在）
    }
    const blob = await api('POST', `/repos/${repoArg}/git/blobs`, { content: buf.toString('base64'), encoding: 'base64' });
    const mode = (fs.statSync(abs).mode & 0o111) ? '100755' : '100644';
    entries.push({ path: to, mode, type: 'blob', sha: blob.sha });
    console.log(`  ${item.status} ${to} (${buf.length} B)`);
  }

  const tree = await api('POST', `/repos/${repoArg}/git/trees`, { base_tree: remoteTree, tree: entries });
  const commit = await api('POST', `/repos/${repoArg}/git/commits`, {
    message: message || git('log', '-1', '--pretty=%B'),
    tree: tree.sha,
    parents: [remoteHead],
  });
  await api('PATCH', `/repos/${repoArg}/git/refs/heads/main`, { sha: commit.sha, force: false });
  console.log(`✓ main：${remoteHead.slice(0, 7)} → ${commit.sha.slice(0, 7)}`);
}

for (const name of tags) {
  const target = git('rev-parse', `${name}^{commit}`);
  try {
    await api('POST', `/repos/${repoArg}/git/refs`, { ref: `refs/tags/${name}`, sha: target });
    console.log(`✓ tag ${name} → ${target.slice(0, 7)}`);
  } catch (error) {
    if (/already exists/i.test(String(error?.message))) console.log(`- tag ${name} 已存在`);
    else throw error;
  }
}
