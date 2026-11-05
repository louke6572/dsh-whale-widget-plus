/**
 * 会话映射审计（纯函数）。
 *
 * 历史 bug：state.sessions.json 里多个 QQ 会话 key 指向同一个 DSH sessionId；
 * 之后所有群/私聊都读写同一段上下文，表现为「全是一个会话」。
 *
 * 修复策略：只要一个 sessionId 被多个 key 使用，就删除**所有**该 sessionId 的映射，
 * 让每个 key 在下一条消息时重新建独立会话。宁可丢一次已经污染的上下文，
 * 也不要让所有会话继续串在一起。
 */
export function findDuplicateSessionIds(mappings) {
  const counts = new Map();
  for (const sessionId of Object.values(mappings && typeof mappings === 'object' ? mappings : {})) {
    if (!sessionId) continue;
    counts.set(sessionId, (counts.get(sessionId) || 0) + 1);
  }
  const duplicates = new Map();
  for (const [key, sessionId] of Object.entries(mappings && typeof mappings === 'object' ? mappings : {})) {
    if (!sessionId || (counts.get(sessionId) || 0) < 2) continue;
    if (!duplicates.has(sessionId)) duplicates.set(sessionId, []);
    duplicates.get(sessionId).push(key);
  }
  return duplicates;
}

/**
 * @param {Record<string,string>} mappings
 * @returns {{mappings: Record<string,string>, removed: string[], duplicates: Array<{sessionId:string, keys:string[]}>}}
 */
export function dedupeSessionMappings(mappings) {
  const source = mappings && typeof mappings === 'object' ? mappings : {};
  const duplicatesMap = findDuplicateSessionIds(source);
  const duplicateIds = new Set(duplicatesMap.keys());
  const next = {};
  const removed = [];
  for (const [key, sessionId] of Object.entries(source)) {
    if (!sessionId) continue;
    if (duplicateIds.has(sessionId)) { removed.push(key); continue; }
    next[key] = sessionId;
  }
  return {
    mappings: next,
    removed,
    duplicates: [...duplicatesMap.entries()].map(([sessionId, keys]) => ({ sessionId, keys })),
  };
}
