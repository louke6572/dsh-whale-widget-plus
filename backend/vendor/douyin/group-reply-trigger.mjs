export function normalizeMentionNames(value = ['大肥鱼']) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 10 || value.some(name => typeof name !== 'string' || !name.trim() || name.trim().length > 40 || /[\0\r\n]/.test(name))) throw new Error('群聊响应昵称须填写1至10个，每个最多40字。');
  const names = value.map(name => name.normalize('NFKC').replace(/[\u200B-\u200F\uFEFF]/g, '').trim().replace(/^@/, '').trim());
  if (names.some(name => !name || name.length > 40 || /^@+$/.test(name))) throw new Error('群聊响应昵称不能为空或只填 @。');
  return [...new Set(names)];
}

export function groupMessageAddressesFish(message, names = ['大肥鱼']) {
  if (message?.mentionedSelf === true) return true;
  const text = String(message?.text || '').normalize('NFKC').replace(/[\u200B-\u200F\uFEFF]/g, '').toLocaleLowerCase();
  return normalizeMentionNames(names).some(name => text.includes(name.toLocaleLowerCase()));
}
