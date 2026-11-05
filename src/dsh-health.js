// DSH 升级后的健康检查（2026-11-01 用户反馈：升级 rc.5 后 QQ 会话没有 qq_* 工具）。
//
// 两个独立故障面：
//   ① profile 里的 MCP 条目被摘 → 新会话也拿不到 qq_* 工具（要重跑 setup-dsh.mjs + 重启 DSH）；
//   ② 旧会话是在 preset 还完整时创建的 → 工具表定死，修复 profile 后旧会话仍然没有 qq_*，
//      必须重建会话。
//
// 这里只做纯判断，读写/DSH 调用由 bridge 做。
import fs from 'node:fs';
import path from 'node:path';

export const REQUIRED_MCP_IDS = Object.freeze(['mcp-snowluma', 'mcp-snowluma-host', 'mcp-web-search-safe']);

/** 扫 ~/.dsh/profiles/<name>/cordis.patch.yml，找哪些 profile 缺了 MCP 条目。 */
export function checkProfileMcp(home, { ids = REQUIRED_MCP_IDS } = {}) {
  const root = path.join(String(home || ''), '.dsh', 'profiles');
  const profiles = [];
  let names = [];
  try { names = fs.readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name); } catch {}
  for (const name of names) {
    const file = path.join(root, name, 'cordis.patch.yml');
    let text = '';
    try { text = fs.readFileSync(file, 'utf8'); } catch { continue; }
    profiles.push({
      name,
      file,
      missing: ids.filter((id) => !new RegExp(`(^|\\n)\\s*-?\\s*(?:id:\\s*)?${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(text)),
      hasSurfcore: /\bsurfcore\b/.test(text),
    });
  }
  const healthy = profiles.filter((p) => p.missing.length === 0);
  return {
    ok: healthy.length > 0,
    checked: profiles.length,
    healthy: healthy.map((p) => p.name),
    broken: profiles.filter((p) => p.missing.length > 0).map((p) => ({ profile: p.name, missing: p.missing, file: p.file })),
  };
}

/**
 * 会话的 preset 是否与当前配置不一致。
 * 只在「实际值存在且与期望不同」时判为不一致；实际值缺失（旧会话没记录 preset）只告警不动，
 * 避免把一批老会话全删掉。
 */
export function presetMismatch(expected, actual) {
  const want = String(expected ?? '').trim();
  const got = String(actual ?? '').trim();
  if (!want || !got) return false;
  return want !== got;
}
