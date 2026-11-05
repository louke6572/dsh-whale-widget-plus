// SnowLuma 安装位置识别：设置页「检测已安装的 SnowLuma」和「浏览…」共用这一套规则。
//
// 背景（2026-10-29 用户反馈）：装好 SnowLuma2 后点检测仍然「没找到」。
// 旧实现只在一组**写死的常见目录**里猜（见 findSnowLumaInstall），用户把包解压到
// D:\软件\SnowLuma2 这类自定义位置时永远猜不到；而手动填路径的入口藏在 QQ 页高级设置里。
//
// 这里的规则分两层：
//   1. 归一（normalize）：一个路径可能是「根目录 / app 目录 / app\launcher.bat / SnowLuma.exe」，
//      统一还原成 { root, launcher }；目录里只有唯一子目录时再往下看一层（zip 常带顶层文件夹）。
//   2. 候选（candidates）：显式路径 > 配置里的 launcherPath/homeDir > 环境变量 > 常见位置。
// 不猜注册表、不扫盘：用户手动选的路径优先，猜只是省一步。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { QQBOT_ROOT } from './paths.js';

/** 包根目录下可能的启动文件（按优先级）。 */
const LAUNCHERS = [path.join('app', 'launcher.bat'), 'launcher.bat', 'SnowLuma.exe'];

function statOf(p) {
  try { return fs.statSync(p); } catch { return null; }
}

/**
 * 把一个路径归一到 SnowLuma 安装根目录。
 * 接受：根目录（里面有 app）、app 目录、app\launcher.bat、launcher.bat、SnowLuma.exe。
 * 返回 { root, launcher }；认不出返回 null。
 */
export function normalizeSnowLumaInstall(raw) {
  const text = String(raw ?? '').trim().replace(/^"(.*)"$/, '$1');
  if (!text) return null;
  const abs = path.resolve(text);

  // ① 直接选了启动文件：launcher.bat 或 SnowLuma.exe
  const st = statOf(abs);
  if (st?.isFile()) {
    const base = path.basename(abs).toLowerCase();
    if (base !== 'launcher.bat' && base !== 'snowluma.exe') return null;
    const dir = path.dirname(abs);
    return { root: path.basename(dir).toLowerCase() === 'app' ? path.dirname(dir) : dir, launcher: abs };
  }
  if (!st?.isDirectory()) return null;

  // ② 目录里直接有启动文件（SnowLuma2 标准布局：<root>/app/launcher.bat）
  for (const rel of LAUNCHERS) {
    const launcher = path.join(abs, rel);
    if (!statOf(launcher)?.isFile()) continue;
    if (path.basename(abs).toLowerCase() === 'app' && rel === 'launcher.bat') {
      return { root: path.dirname(abs), launcher };
    }
    return { root: abs, launcher };
  }

  // ③ 解压多了一层（zip 里带顶层文件夹）：只在「唯一子目录」里再找一层，避免乱猜
  let children = [];
  try { children = fs.readdirSync(abs, { withFileTypes: true }).filter((e) => e.isDirectory()); } catch { return null; }
  if (children.length === 1) {
    const inner = path.join(abs, children[0].name);
    for (const rel of LAUNCHERS) {
      const launcher = path.join(inner, rel);
      if (statOf(launcher)?.isFile()) {
        if (path.basename(inner).toLowerCase() === 'app' && rel === 'launcher.bat') {
          return { root: path.dirname(inner), launcher };
        }
        return { root: inner, launcher };
      }
    }
  }
  return null;
}

/** 候选位置：显式路径 → 配置 → 环境变量 → 常见安装位置。 */
export function snowLumaCandidates({ snowluma = {}, extraPaths = [] } = {}) {
  const out = [];
  const add = (value) => {
    const text = String(value ?? '').trim();
    if (text && !out.includes(text)) out.push(text);
  };
  for (const item of explicitList(extraPaths)) add(item);
  add(snowluma.launcherPath);
  add(snowluma.homeDir);
  add(process.env.SNOWLUMA_HOME);
  add(process.env.SNOWLUMA_DIR);

  const home = os.homedir();
  const localAppData = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
  const programFiles = process.env.ProgramFiles || 'C:/Program Files';
  const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:/Program Files (x86)';
  for (const base of [
    path.join(home, 'SnowLuma2'),
    path.join(home, 'SnowLuma'),
    // 2026-11 用户反馈：解压到「文档」目录时一键启动第 1 步就找不到（Documents 不在候选里）
    path.join(home, 'Documents', 'SnowLuma2'),
    path.join(home, 'Documents', 'SnowLuma'),
    path.join(home, 'Desktop', 'SnowLuma2'),
    path.join(home, 'Desktop', 'SnowLuma'),
    path.join(home, 'Downloads', 'SnowLuma2'),
    path.join(home, 'Downloads', 'SnowLuma'),
    path.join(localAppData, 'Programs', 'SnowLuma2'),
    path.join(localAppData, 'Programs', 'SnowLuma'),
    path.join(path.dirname(QQBOT_ROOT), 'SnowLuma2'),
    path.join(programFiles, 'SnowLuma2'),
    path.join(programFiles, 'SnowLuma'),
    path.join(programFilesX86, 'SnowLuma2'),
    path.join(programFilesX86, 'SnowLuma'),
  ]) add(base);
  return out;
}

function explicitList(list) {
  if (!list) return [];
  return Array.isArray(list) ? list : [list];
}

/**
 * 检测失败时给用户的**结构化报告**：code（机器可读）/ title / error / hint（下一步）。
 * 规则见 AGENTS 1.7：失败必须可见、必须带可执行建议，不能只写日志或一句"失败"。
 */
export function snowLumaMissingReport({ picked = '', tried = [] } = {}) {
  const target = String(picked || '').trim();
  if (target) {
    return {
      code: 'snowluma_path_invalid',
      title: '这个路径里没有 SnowLuma',
      error: `没认出 SnowLuma：${target}`,
      hint: '要能在这里找到 app\\launcher.bat、launcher.bat 或 SnowLuma.exe。请选解压出来的 SnowLuma2 根目录（里面有 app），或直接选 app\\launcher.bat。',
      tried,
    };
  }
  return {
    code: 'snowluma_not_found',
    title: '没找到 SnowLuma',
    error: '常见位置里都没有 SnowLuma（可能还没解压，或装在了别的目录）。',
    hint: '点「浏览…」选 SnowLuma2 解压出来的根目录（里面有 app）；还没装就点「打开官方下载页」。',
    tried,
  };
}

/**
 * 找 SnowLuma 安装位置。
 * @returns {{ok:true, root:string, launcher:string, tried:Array}|{ok:false, tried:Array}}
 *   tried 里带上每个候选和是否命中，检测失败时可直接告诉用户「试过哪些地方」。
 */
export function findSnowLumaInstall({ snowluma = {}, extraPaths = [] } = {}) {
  const tried = [];
  for (const candidate of snowLumaCandidates({ snowluma, extraPaths })) {
    const hit = normalizeSnowLumaInstall(candidate);
    tried.push({ path: candidate, ok: Boolean(hit) });
    if (hit) return { ok: true, ...hit, tried };
  }
  return { ok: false, tried };
}
