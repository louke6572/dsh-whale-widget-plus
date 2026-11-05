// 配置文件"版本戳"：用 mtime+size 判断"我读到的配置有没有被别人改过"。
// 用途：设置页保存时带上加载时的戳；服务端发现文件已经变了 → 409，而不是整份回写把别人的修改覆盖掉
//（2026-10-29 复盘：面板整份回写会把控制台刚改的语音开关覆盖回 false）。
import fs from 'node:fs';

/** 返回 `${mtimeMs}:${size}`；文件不存在或读不到返回 ''。 */
export function fileStamp(file) {
  try {
    const st = fs.statSync(file);
    return `${st.mtimeMs}:${st.size}`;
  } catch {
    return '';
  }
}

/**
 * 判断"提交时带的戳"是否已过期。
 * 规则：
 *   - 调用方没带戳（旧客户端）→ 不过期（兼容，允许保存）；
 *   - 服务端当前读不到文件 → 不过期；
 *   - 都拿到了但不相等 → 过期（配置被别处改过）。
 */
export function isStale(provided, current) {
  if (!provided || !current) return false;
  return String(provided) !== String(current);
}
