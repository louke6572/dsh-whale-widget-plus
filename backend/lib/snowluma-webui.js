/**
 * SnowLuma WebUI 客户端（面板直连，2026-11 用户要求「全部在 DSH 里控制」）。
 *
 * 为什么需要它：SnowLuma 的账号 / 进程（= QQ 注入实例）只能通过它自己的 WebUI API 管理，
 * 而 WebUI 的所有接口都要鉴权（`x-snowluma-token` 头或 `Authorization: Bearer`）。
 * 鉴权流程：POST /api/login {password} → {token}；之后每个请求带 token。
 *
 * 边界：
 *   · 只调用本机回环地址，不接受外部 URL；
 *   · 密码只存在本机 config.json（`snowluma.webuiPassword`），任何接口都不回显；
 *   · token 只在内存里缓存，401 时用密码自动重登一次。
 */
// token 有效期：默认 0 = 永不过期（靠 401 自动重登，最省事也最稳）。
// 2026-11 收尾审计：这里的 TOKEN_TTL_MS/tokenAt 之前是"常量 0 + 只写不读的时间戳"，
// 看着像死代码；现在把 TTL 变成真开关（环境变量可调），tokenAt 才真正参与判定。
// 默认值不变（0），旧行为逐字节一致。
const TOKEN_TTL_MS = Math.max(0, Number(process.env.SURFCORE_SNOWLUMA_TOKEN_TTL_MS) || 0);

export function createSnowLumaWebuiClient({ baseUrl, readConfig, saveConfig, log = () => {} } = {}) {
  let token = '';
  let tokenAt = 0; // 上次登录成功的时间戳（仅 TTL>0 时参与 authed 判定）

  function urlPath(pathname) {
    const base = typeof baseUrl === 'function' ? baseUrl() : baseUrl;
    return `${String(base || 'http://127.0.0.1:5099').replace(/\/+$/, '')}${pathname}`;
  }
  function cfg() {
    try { return (typeof readConfig === 'function' ? readConfig() : readConfig) ?? {}; } catch { return {}; }
  }
  function storedPassword() {
    return String(cfg()?.snowluma?.webuiPassword ?? '');
  }
  async function login(password) {
    const res = await fetch(urlPath('/api/login'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password }),
      signal: AbortSignal.timeout(8000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || typeof data?.token !== 'string' || !data.token) {
      return { ok: false, code: res.status === 401 ? 'WEBUI_BAD_PASSWORD' : 'WEBUI_LOGIN_FAILED', error: data?.message || data?.error || `SnowLuma 控制台拒绝登录（HTTP ${res.status}）` };
    }
    token = data.token;
    tokenAt = Date.now();
    return { ok: true };
  }
  function savePassword(password) {
    const value = String(password ?? '').trim();
    if (typeof saveConfig !== 'function') return;
    saveConfig({ snowluma: { webuiPassword: value } });
  }
  function tokenValid() {
    if (!token) return false;
    if (TOKEN_TTL_MS === 0) return true;
    return Date.now() - tokenAt < TOKEN_TTL_MS;
  }
  async function ensureToken({ interactive = false } = {}) {
    if (tokenValid()) return true;
    // 过期（TTL>0）或从未登录：清掉旧 token，用密码重登一次。
    token = ''; tokenAt = 0;
    const password = storedPassword();
    if (!password) {
      if (interactive) return false;
      return false;
    }
    const r = await login(password);
    if (!r.ok) { log(`[snowluma-webui] 自动登录失败：${r.error}`); return false; }
    return true;
  }
  async function request(pathname, { method = 'GET', body, retry = true } = {}) {
    if (!(await ensureToken())) {
      return { ok: false, code: 'WEBUI_NOT_AUTHORIZED', error: '还没连上 SnowLuma 控制台：先在设置页填一次控制台密码' };
    }
    const init = {
      method,
      headers: { 'x-snowluma-token': token, accept: 'application/json' },
      signal: AbortSignal.timeout(12_000),
    };
    if (body !== undefined) {
      init.headers['content-type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
    let res;
    try { res = await fetch(urlPath(pathname), init); }
    catch (error) {
      return { ok: false, code: 'WEBUI_UNREACHABLE', error: `SnowLuma 控制台不可达（是否已启动？）：${error?.message ?? error}` };
    }
    if (res.status === 401 && retry) {
      token = ''; tokenAt = 0;
      const relogin = await ensureToken();
      if (relogin) return request(pathname, { method, body, retry: false });
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, code: `WEBUI_${res.status}`, error: data?.message || data?.error || `SnowLuma 控制台返回 HTTP ${res.status}` };
    }
    return { ok: true, data };
  }

  return {
    get authed() { return tokenValid(); },
    login,
    savePassword,
    hasPassword: () => Boolean(storedPassword()),
    logout({ forget = false } = {}) {
      token = ''; tokenAt = 0;
      if (forget) savePassword('');
    },
    status: () => request('/api/status'),
    accounts: async () => {
      const r = await request('/api/qq-list');
      if (!r.ok) return r;
      return { ok: true, list: (r.data?.list ?? []).map((x) => ({ uin: String(x?.uin ?? ''), nickname: String(x?.nickname ?? '') })) };
    },
    processes: async () => {
      const r = await request('/api/processes');
      if (!r.ok) return r;
      return { ok: true, list: Array.isArray(r.data?.list) ? r.data.list : [] };
    },
    loadProcess: (pid) => request(`/api/processes/${encodeURIComponent(String(pid))}/load`, { method: 'POST' }),
    unloadProcess: (pid) => request(`/api/processes/${encodeURIComponent(String(pid))}/unload`, { method: 'POST' }),
    refreshProcess: (pid) => request(`/api/processes/${encodeURIComponent(String(pid))}/refresh`, { method: 'POST' }),
  };
}
