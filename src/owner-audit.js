// 主人特权操作审计：`state/owner-audit.jsonl`（桥接单写者、插件只读）。
//
// 与现有日志的区别：
//   · `bridge.log` 是排障日志（2000 行 → `.1`），不保证结构；
//   · 插件 `audit.jsonl` 是记忆维护审计（2MB 时原地裁到 2000 行，会丢旧记录）；
//   · 这里要的是“谁、凭什么权限、做了什么、结果如何”，且轮转失败也不丢数据。
//
// 约束（AGENTS 1.7 / 用户 2026-10-29 要求）：
//   · 写入失败不能静默：health + 限频日志 + `/api/status` 暴露；
//   · 轮转/清理失败不能阻塞业务，也不能截断已有审计；
//   · 不写消息正文、token、不必要的敏感内容。
import fs from 'node:fs';
import path from 'node:path';

export const OWNER_AUDIT_MAX_BYTES = 1024 * 1024; // 1MB
export const OWNER_AUDIT_MAX_FILES = 5; // 主文件 + .1 ~ .4
export const OWNER_AUDIT_RETENTION_DAYS = 90;

/** 生成 `state/owner-audit.jsonl` 的读写器（可注入 now/log，便于测试）。 */
export function createOwnerAudit({
  dir,
  file = 'owner-audit.jsonl',
  maxBytes = OWNER_AUDIT_MAX_BYTES,
  maxFiles = OWNER_AUDIT_MAX_FILES,
  retentionDays = OWNER_AUDIT_RETENTION_DAYS,
  now = () => Date.now(),
  log = () => {},
} = {}) {
  const primary = path.join(dir, file);
  const rotated = (index) => `${primary}.${index}`;
  const health = {
    writable: true,
    appended: 0,
    writeFailedAt: 0,
    rotationFailedAt: 0,
    cleanupFailedAt: 0,
    lastError: '',
    lastErrorAt: 0,
  };
  let lastWriteLogAt = 0;

  function ensureDir() {
    fs.mkdirSync(dir, { recursive: true });
  }

  function sizeOf(p) {
    try { return fs.statSync(p).size; } catch { return 0; }
  }

  function rotateIfNeeded() {
    if (sizeOf(primary) < maxBytes) return;
    try {
      // 最旧的删掉，其余整体后移，最后把主文件改成 .1。
      const oldest = rotated(maxFiles - 1);
      if (fs.existsSync(oldest)) fs.rmSync(oldest, { force: true });
      for (let i = maxFiles - 2; i >= 1; i -= 1) {
        const from = rotated(i);
        if (!fs.existsSync(from)) continue;
        fs.renameSync(from, rotated(i + 1));
      }
      fs.renameSync(primary, rotated(1));
    } catch (error) {
      // 轮转失败不截断（不丢审计），继续追加；下次写入再试。
      health.rotationFailedAt = now();
      health.lastError = `rotate: ${error?.message ?? error}`;
      health.lastErrorAt = now();
      log(`⚠️ 审计日志轮转失败（继续追加，不截断）：${health.lastError}`);
    }
  }

  function append(event, { actor, auth, result, ref } = {}) {
    const entry = {
      at: new Date(now()).toISOString(),
      event: String(event ?? '').slice(0, 60),
      actor: actor ?? null,
      auth: auth ?? null,
      result: result ?? null,
      ref: ref ?? null,
    };
    try {
      ensureDir();
      rotateIfNeeded();
      fs.appendFileSync(primary, `${JSON.stringify(entry)}\n`, 'utf8');
      health.writable = true;
      health.appended += 1;
      return true;
    } catch (error) {
      health.writable = false;
      health.writeFailedAt = now();
      health.lastError = `write: ${error?.message ?? error}`;
      health.lastErrorAt = now();
      if (now() - lastWriteLogAt > 10 * 60 * 1000) {
        lastWriteLogAt = now();
        log(`⚠️ 审计写入失败（操作本身不受影响）：${health.lastError}`);
      }
      return false;
    }
  }

  /** 删除超过保留期的旧轮转文件（主文件不动）。 */
  function cleanupOld() {
    const cutoff = now() - retentionDays * 86400_000;
    for (let i = 1; i < maxFiles; i += 1) {
      const p = rotated(i);
      try {
        const st = fs.statSync(p);
        if (st.mtimeMs < cutoff) fs.rmSync(p, { force: true });
      } catch (error) {
        if (error?.code === 'ENOENT') continue;
        health.cleanupFailedAt = now();
        health.lastError = `cleanup: ${error?.message ?? error}`;
        health.lastErrorAt = now();
        log(`⚠️ 审计旧文件清理失败：${health.lastError}`);
      }
    }
  }

  /** 读最近 N 条（跨轮转文件，按时间顺序）。坏行跳过，不抛错。 */
  function readTail(limit = 50) {
    const want = Math.max(1, Math.min(500, Number(limit) || 50));
    // 主文件最新 → .1 → .2 …；读到够数就停，再反转成时间正序。
    const chunks = [];
    let count = 0;
    const files = [primary];
    for (let i = 1; i < maxFiles; i += 1) files.push(rotated(i));
    for (const p of files) {
      try {
        const text = fs.readFileSync(p, 'utf8');
        const lines = text.split('\n').filter(Boolean);
        if (!lines.length) continue;
        chunks.push(lines);
        count += lines.length;
      } catch { /* 文件不存在/读不了就跳过 */ }
      if (count >= want) break;
    }
    const lines = chunks.reverse().flat();
    const entries = [];
    for (const line of lines.slice(-want)) {
      try { entries.push(JSON.parse(line)); } catch { /* 坏行跳过 */ }
    }
    return entries;
  }

  return { append, readTail, cleanupOld, health, path: primary, dir, files: () => Array.from({ length: maxFiles }, (_, i) => (i === 0 ? primary : rotated(i))) };
}
