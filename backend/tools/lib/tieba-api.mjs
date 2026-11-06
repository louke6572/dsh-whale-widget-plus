/**
 * 【已废弃 2026-11-06】百度贴吧「Agent 社区」claw API（TB_TOKEN）封装。
 * 平台层已改用 BDUSS + curl（tieba-bduss.mjs），本文件不再被引用，仅留作历史参考。
 *
 * 百度贴吧「Agent 社区」官方 API 封装。
 *
 * 认证：所有请求带 `Authorization: <TB_TOKEN>`（由主人在贴吧领取）。
 * 文档：https://tieba-ares.cdn.bcebos.com/api-reference.md
 *
 * 红线：TB_TOKEN 只发给 tieba.baidu.com；这里把 Base URL 写死，调用方无法换域名。
 */

const BASE = 'https://tieba.baidu.com';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36';

function safeToken(token) {
  const t = String(token ?? '').trim();
  if (!t) throw new Error('还没有填写 TB_TOKEN（贴吧 Agent 社区密钥）');
  return t;
}

function requestUrl(pathname, query) {
  const url = new URL(`${BASE}${pathname}`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined || value === null || value === '') continue;
    url.searchParams.set(key, String(value));
  }
  return url;
}

function apiError(data, status, retryAfter) {
  const code = data?.errno ?? data?.error_code ?? data?.no;
  const message = data?.errmsg || data?.error_msg || data?.error || `HTTP ${status}`;
  const error = new Error(`贴吧接口失败${code !== undefined ? `（${code}）` : ''}：${message}`);
  error.code = code !== undefined ? String(code) : String(status);
  if (retryAfter) error.retryAfter = Number(retryAfter);
  return error;
}

export async function tiebaRequest(pathname, { method = 'GET', query, body, token, timeoutMs = 20000 } = {}) {
  const url = requestUrl(pathname, query);
  const headers = {
    authorization: safeToken(token),
    accept: 'application/json, text/plain, */*',
    'user-agent': UA,
  };
  if (method === 'GET') headers['content-type'] = 'application/x-www-form-urlencoded;charset=UTF-8';
  else headers['content-type'] = 'application/json';
  const response = await fetch(url, {
    method,
    headers,
    body: method === 'GET' ? undefined : JSON.stringify(body ?? {}),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text.slice(0, 300) }; }
  const retryAfter = data?.retry_after_seconds ?? data?.retry_after;
  if (response.status === 429 || retryAfter) {
    const error = apiError(data, response.status, retryAfter);
    error.rateLimited = true;
    throw error;
  }
  const code = data?.errno ?? data?.error_code ?? data?.no;
  if (!response.ok || (code !== undefined && Number(code) !== 0)) throw apiError(data, response.status, retryAfter);
  return data;
}

/** 纯文本校验：贴吧禁止 Markdown / 链接，避免把模型输出原样发上去。 */
export function assertPlainText(value, { max = 1000, label = '内容' } = {}) {
  const text = String(value ?? '').trim();
  if (!text) throw new Error(`${label}不能为空`);
  if (text.length > max) throw new Error(`${label}最多 ${max} 个字符（当前 ${text.length}）`);
  if (/https?:\/\//i.test(text) || /\[[^\]]*\]\([^)]*\)/.test(text) || /`|\*\*/.test(text)) {
    throw new Error(`${label}只支持纯文本：不要用 Markdown、代码块或链接`);
  }
  return text;
}

const idValue = (value) => {
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? n : String(value ?? '');
};

function textOf(content) {
  if (Array.isArray(content)) {
    return content.map((item) => (typeof item === 'string' ? item : (item?.text ?? item?.content ?? ''))).join('').trim();
  }
  return String(content ?? '').trim();
}

function normalizeReplies(data) {
  return (data?.data?.reply_list ?? []).map((item) => ({
    threadId: item.thread_id,
    postId: item.post_id,
    title: String(item.title ?? ''),
    unread: Number(item.unread) || 0,
    content: String(item.content ?? ''),
    quoteContent: String(item.quote_content ?? ''),
    url: `https://tieba.baidu.com/p/${item.thread_id}${item.post_id ? `?pid=${item.post_id}` : ''}`,
  }));
}

function normalizeThreads(data) {
  return (data?.data?.thread_list ?? []).map((item) => ({
    id: item.id,
    title: String(item.title ?? ''),
    replyNum: Number(item.reply_num) || 0,
    viewNum: Number(item.view_num) || 0,
    author: String(item.author?.name ?? ''),
    abstract: textOf(item.abstract),
    agreeNum: Number(item.agree_num) || 0,
    url: `https://tieba.baidu.com/p/${item.id}`,
  }));
}

function normalizeThread(data) {
  const first = data?.first_floor ?? {};
  const posts = (data?.post_list ?? []).map((item, index) => ({
    id: item.id,
    floor: index + 2,
    content: textOf(item.content),
    agreeNum: Number(item?.agree?.agree_num) || 0,
    subPosts: (item?.sub_post_list?.sub_post_list ?? []).map((sub) => ({
      id: sub.id,
      content: textOf(sub.content),
      agreeNum: Number(sub?.agree?.agree_num) || 0,
    })),
  }));
  return {
    id: first.id,
    title: String(first.title ?? ''),
    content: textOf(first.content),
    agreeNum: Number(first?.agree?.agree_num) || 0,
    page: {
      current: Number(data?.page?.current_page) || 1,
      total: Number(data?.page?.total_page) || 1,
      hasMore: Boolean(data?.page?.has_more),
    },
    posts,
    url: `https://tieba.baidu.com/p/${first.id ?? ''}`,
  };
}

/** 验证 TB_TOKEN：能读到「回复我的」就说明有效。 */
export async function tiebaVerify(token) {
  const data = await tiebaRequest('/mo/q/claw/replyme', { query: { pn: 1 }, token });
  return { ok: true, replies: normalizeReplies(data) };
}

export async function tiebaReplyme(token, page = 1) {
  const data = await tiebaRequest('/mo/q/claw/replyme', { query: { pn: Math.max(1, Number(page) || 1) }, token });
  return { replies: normalizeReplies(data) };
}

export async function tiebaFeed(token, sort = 'hot') {
  const sortType = sort === 'time' ? 0 : 3;
  const data = await tiebaRequest('/c/f/frs/page_claw', { query: { sort_type: sortType }, token });
  return { sort: sort === 'time' ? 'time' : 'hot', threads: normalizeThreads(data) };
}

export async function tiebaThread(token, threadId, { page = 1, order = 'asc' } = {}) {
  const r = order === 'desc' ? 1 : (order === 'hot' ? 2 : 0);
  const data = await tiebaRequest('/c/f/pb/page_claw', {
    query: { pn: Math.max(1, Number(page) || 1), kz: idValue(threadId), r },
    token,
  });
  return { thread: normalizeThread(data) };
}

export async function tiebaFloor(token, threadId, postId) {
  const data = await tiebaRequest('/c/f/pb/nestedFloor_claw', {
    query: { post_id: idValue(postId), thread_id: idValue(threadId) },
    token,
  });
  const posts = (data?.data?.post_list ?? []).map((item) => ({
    id: item.id,
    content: textOf(item.content),
    agreeNum: Number(item?.agree?.agree_num) || 0,
  }));
  return { threadId, postId, posts };
}

export async function tiebaAddPost(token, { content, threadId, postId } = {}) {
  const body = { content: assertPlainText(content, { max: 1000, label: '评论内容' }) };
  if (postId) body.post_id = idValue(postId);
  if (threadId) body.thread_id = idValue(threadId);
  if (!body.post_id && !body.thread_id) throw new Error('评论需要 thread_id（评论主帖）或 post_id（回复楼层）');
  const data = await tiebaRequest('/c/c/claw/addPost', { method: 'POST', body, token });
  const thread = data?.data?.thread_id ?? body.thread_id;
  const post = data?.data?.post_id;
  return {
    threadId: thread,
    postId: post,
    url: thread ? `https://tieba.baidu.com/p/${thread}${post ? `?pid=${post}` : ''}` : '',
  };
}

export async function tiebaAddThread(token, { title, content, tabId, tabName } = {}) {
  const body = {
    title: assertPlainText(title, { max: 30, label: '标题' }),
    content: [{ type: 'text', content: assertPlainText(content, { max: 1000, label: '正文' }) }],
  };
  if (tabId !== undefined && tabId !== null && String(tabId) !== '') body.tab_id = Number(tabId) || 0;
  if (tabName) body.tab_name = String(tabName);
  const data = await tiebaRequest('/c/c/claw/addThread', { method: 'POST', body, token });
  const thread = data?.data?.thread_id;
  return { threadId: thread, postId: data?.data?.post_id, url: thread ? `https://tieba.baidu.com/p/${thread}` : '' };
}

export async function tiebaAgree(token, { threadId, postId, objType, opType = 0 } = {}) {
  if (!threadId) throw new Error('点赞需要 thread_id');
  const body = {
    thread_id: idValue(threadId),
    obj_type: Number(objType) || (postId ? 1 : 3),
    op_type: opType ? 1 : 0,
  };
  if (postId) body.post_id = idValue(postId);
  await tiebaRequest('/c/c/claw/opAgree', { method: 'POST', body, token });
  return { ok: true, op: opType ? 'unlike' : 'like', threadId, postId: postId ?? null };
}

export async function tiebaDeleteThread(token, threadId) {
  await tiebaRequest('/c/c/claw/delThread', { method: 'POST', body: { thread_id: idValue(threadId) }, token });
  return { ok: true, threadId };
}

export async function tiebaDeletePost(token, postId) {
  await tiebaRequest('/c/c/claw/delPost', { method: 'POST', body: { post_id: idValue(postId) }, token });
  return { ok: true, postId };
}

export async function tiebaModifyName(token, name) {
  const safe = assertPlainText(name, { max: 18, label: '昵称' });
  await tiebaRequest('/c/c/claw/modifyName', { method: 'POST', body: { name: safe }, token });
  return { ok: true, name: safe };
}
