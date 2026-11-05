#!/usr/bin/env node
/**
 * 生成 Release 用的 version.json（组件更新检查读它）。
 *
 * 用法：
 *   node scripts/make-manifest.mjs --version 0.3.0 --file artifacts/pet-pack.zip --notes notes.md
 *   node scripts/make-manifest.mjs --version 0.3.0 --file dist.zip --url https://example.com/dist.zip
 *
 * 产出（默认写到 ./version.json）：
 *   {
 *     "version": "0.3.0",
 *     "notes": "- 修气泡不消失\n- 加专注模式",
 *     "file": { "url": "...", "sha256": "...", "size": 16777216 }
 *   }
 *
 * 说明：
 *   · `url` 必须是**最终下载地址**；不传时按 GitHub Release 约定生成占位（记得发版后核对）。
 *   · 只算 sha256/size，不做上传——上传 zip 与 version.json 由你自己在 Release 页面完成。
 *   · 这个文件就是"版本比对的唯一真相"；桌宠/语音包的自动更新都读它。
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const args = process.argv.slice(2);
function arg(name, fallback = '') {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}

const version = String(arg('version')).trim();
const file = String(arg('file')).trim();
const out = String(arg('out', 'version.json')).trim();
const repo = String(arg('repo', path.basename(process.cwd()))).trim();
const owner = String(arg('owner', '<owner>')).trim();
const notesFile = String(arg('notes')).trim();

if (!version || !file) {
  console.error('用法: node scripts/make-manifest.mjs --version 0.3.0 --file <zip> [--url <直链>] [--notes <md>] [--out version.json]');
  process.exit(2);
}
if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version)) {
  console.error(`版本号不像 semver：${version}（示例 0.3.0 / 1.2.0-beta.1）`);
  process.exit(2);
}
if (!fs.existsSync(file)) {
  console.error(`找不到文件：${file}`);
  process.exit(2);
}

const size = fs.statSync(file).size;
const sha256 = createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const name = path.basename(file);
const url = String(arg('url')).trim()
  || `https://github.com/${owner}/${repo}/releases/download/v${version}/${name}`;
const notes = notesFile && fs.existsSync(notesFile)
  ? fs.readFileSync(notesFile, 'utf8').trim()
  : String(arg('notes', '')).trim();

const manifest = {
  version,
  ...(notes ? { notes } : {}),
  file: { url, sha256, size },
};

fs.writeFileSync(out, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
console.log(`已写入 ${out}`);
console.log(`  version: ${version}`);
console.log(`  file:    ${name}  ${(size / 1024 / 1024).toFixed(1)}MB`);
console.log(`  sha256:  ${sha256}`);
console.log(`  url:     ${url}`);
if (!arg('url')) {
  console.log('\n⚠️  url 是按 GitHub Release 约定生成的占位地址；发版后确认它真能下载（或下次用 --url 指定）。');
}
