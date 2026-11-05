/**
 * SurfCore · dsh-Dfy（外部桌宠载体）探测
 *
 * Electron 桌宠（surfpet）已经下线：安装 / 启动 / 卸载 / 更新那一整套不再需要。
 * 本模块只做只读探测：用户是否装了 dsh-Dfy（合并后唯一的包），以及它最近是否在用。
 * 不写任何文件、不拉进程，结果供 pet-api、目的机制和设置页使用。
 */
import fs from 'node:fs';
import path from 'node:path';

/**
 * 外部桌宠载体：dsh-Dfy（合并了桌宠挂件的唯一包）。
 * 它不是 Electron 桌宠，但可以把同一个 SurfCore 人格/记忆作为对话后端，
 * 所以设置页需要能看出「已经有挂件在当桌宠用」，而不是一直显示未安装。
 */
const PET_PACKAGE_NAMES = ['dsh-dfy'];

function detectExternalPet(stateDir) {
  const home = path.dirname(stateDir);
  const out = { kind: '', name: '', packageName: '', version: '', installed: false, active: false, path: '' };
  // 优先级：dsh-Dfy（新）> 旧包。同一 profile 里两个都在时，只认 dsh-Dfy。
  const candidates = [];
  let profileIds = [];
  try { profileIds = fs.readdirSync(path.join(home, 'profiles')); } catch {}
  for (const name of PET_PACKAGE_NAMES) {
    // profile 里实际挂载的包优先（dsh-Dfy 在 profiles/*/node_modules 下是 junction）。
    for (const id of profileIds) candidates.push(path.join(home, 'profiles', id, 'node_modules', name, 'package.json'));
    candidates.push(path.join(home, 'plugins-src', name, 'package.json'));
  }
  for (const file of candidates) {
    try {
      const pkg = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (!PET_PACKAGE_NAMES.includes(String(pkg?.name || ''))) continue;
      out.kind = 'whale-widget';
      out.name = 'dsh-Dfy';
      out.packageName = String(pkg.name);
      out.version = String(pkg.version || '');
      out.installed = true;
      out.path = path.resolve(file, '..');
      break;
    } catch {}
  }
  if (out.installed) {
    // 挂件每用一次都会刷新 .dshw-usage.json；10 分钟内动过就算「在用」。
    try {
      const usage = path.join(home, '.dshw-usage.json');
      const age = Date.now() - fs.statSync(usage).mtimeMs;
      out.active = age >= 0 && age < 10 * 60_000;
    } catch {}
  }
  return out;
}

export function createPetService({ stateDir }) {
  function status() {
    const external = detectExternalPet(stateDir);
    return {
      ok: true,
      installing: null,
      installed: external.installed,
      external,
      running: external.active,
      pid: null,
      dir: '',
      version: external.version || null,
      skins: [],
      lastError: null,
    };
  }

  return { status };
}
