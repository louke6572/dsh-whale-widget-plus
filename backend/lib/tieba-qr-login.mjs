/**
 * 贴吧扫码登录（当前唯一自动登录入口）。
 *
 * 流程：手机百度/贴吧 App 扫码 → passport 换 BDUSS/STOKEN → 用 curl 验 is_login=1
 * → 写入 cookie.txt + credentials.json。用户只需要扫码确认，不用复制任何东西。
 *
 * 注意：文件下半部分的「打开真实浏览器 + CDP」实现已废弃（2026-11-06）——
 * 新版 Chrome 读不到应用绑定加密的 cookie，而且必须让用户退出浏览器。
 * 平台层现在只认 backend/lib/tieba-bduss.mjs 的 cookie.txt。
 *
 * 百度贴吧 账号登录 —— 打开真实浏览器窗口登录，然后把登录态注入插件。
 *
 * 为什么不用扫码接口 / headless：
 *   百度扫码后拿到的临时凭证，在真实浏览器里换出来的登录态都会被贴吧判 is_login=0
 *   （接口返回的 BDUSS 格式合法，但服务器不认；纯 HTTP 拼 Cookie 更容易拼错）。
 *   最稳的方式就是「让主人在一个真实浏览器里正常登录」—— 登录行为、风控校验、
 *   cookie 落盘全由浏览器自己完成，我们只负责事后读取：
 *
 *   ① 打开主人日常用的浏览器（默认浏览器 / Chrome / Edge…），并复制其登录配置，
 *      保留真实 cookie 与设备指纹（全新空白配置容易被当成陌生设备，登录态易失效）
 *   ② 主人在窗口里登录百度 / 贴吧（扫码、账号密码都行）
 *   ③ 轮询浏览器 cookie，出现 BDUSS 后新开一个标签访问贴吧，在页面里调
 *      `/dc/common/tbs`，`is_login === 1` 才算登录成功
 *   ④ 在浏览器里领 TB_TOKEN（clawToken 页面是 JS 渲染的，外部抓不到）
 *   ⑤ 把 .baidu.com 域下的 cookie + TB_TOKEN 写进 credentials.json（0600）
 *   ⑥ 关闭浏览器窗口
 *
 * 凭据落盘：$DSH_HOME/surfcore/tieba/credentials.json
 */
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { TIEBA_CRED } from './paths.js';
import { setTiebaCookie, verifyTiebaCookieHeader } from './tieba-bduss.mjs';

const PASSPORT = 'https://passport.baidu.com';
const TIEBA = 'https://tieba.baidu.com';
const CLAW_TOKEN_URL = `${TIEBA}/mo/q/hybrid-usergrow-activity/clawToken`;
const LOGIN_URL = `${PASSPORT}/v2/?login&tpl=mn&u=${encodeURIComponent(`${TIEBA}/`)}`;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const LOGIN_TTL_MS = 300_000;       // 登录窗口最多等 5 分钟
const EDGE_START_WAIT_MS = 20_000;  // 等浏览器调试端口起来
const POLL_INTERVAL_MS = 1_500;     // 多久查一次浏览器里有没有登录
const QR_TTL_MS = 180_000;          // 百度二维码约 3 分钟过期
const LONG_POLL_MS = 30_000;        // unicast 长轮询单次最多挂 30 秒

const sessions = new Map();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function baseHeaders(extra = {}) {
  return {
    'user-agent': UA,
    referer: `${PASSPORT}/`,
    accept: 'application/json, text/plain, */*',
    ...extra,
  };
}

// ── 浏览器工具 ───────────────────────────────────────────────────────────────

/** 从进程/路径猜测浏览器名字（用于界面提示和「是不是 Chromium 系」判断）。 */
function browserNameOf(value) {
  const text = String(value ?? '').toLowerCase();
  if (text.includes('360')) return '360浏览器';
  if (text.includes('qqbrowser')) return 'QQ浏览器';
  if (text.includes('brave')) return 'Brave';
  if (text.includes('vivaldi')) return 'Vivaldi';
  if (text.includes('opera')) return 'Opera';
  if (text.includes('chromium')) return 'Chromium';
  if (text.includes('msedge') || text.includes('edge')) return 'Edge';
  if (text.includes('chrome')) return 'Chrome';
  if (text.includes('firefox')) return 'Firefox';
  return '';
}

/** 只有 Chromium 系浏览器支持 CDP（远程调试端口），Firefox / IE 不行。 */
function isChromiumBrowser(name) {
  return ['Chrome', 'Edge', 'Brave', 'Vivaldi', 'Opera', 'Chromium', 'QQ浏览器', '360浏览器'].includes(name);
}

function regQuery(args) {
  try {
    return String(execFileSync('reg', args, { encoding: 'utf8', windowsHide: true, timeout: 5_000 }) ?? '');
  } catch {
    return '';
  }
}

/** 读系统「默认浏览器」（http 协议关联的程序）。 */
function defaultBrowserInfo() {
  const choice = regQuery([
    'query', 'HKCU\\Software\\Microsoft\\Windows\\Shell\\Associations\\UrlAssociations\\http\\UserChoice', '/v', 'ProgId',
  ]);
  const progId = choice.match(/ProgId\s+REG_SZ\s+(\S+)/)?.[1] ?? '';
  if (!progId) return { progId: '', exe: '', name: '' };
  const command = regQuery(['query', `HKCR\\${progId}\\shell\\open\\command`, '/ve']);
  const line = command.match(/REG_(?:SZ|EXPAND_SZ)\s+(.+)$/m)?.[1] ?? '';
  const trimmed = line.trim();
  const exe = trimmed.match(/^"([^"]+)"/)?.[1] ?? trimmed.split(/\s+/)[0] ?? '';
  const exists = Boolean(exe) && fs.existsSync(exe);
  return { progId, exe: exists ? exe : '', name: browserNameOf(progId) || browserNameOf(exe) };
}

// 常见 Chromium 浏览器的安装位置（默认浏览器不可用时按这个顺序兜底）。
const BROWSER_CANDIDATES = [
  ['Chrome', [
    path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe') : '',
  ]],
  ['Edge', [
    path.join(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Microsoft', 'Edge', 'Application', 'msedge.exe') : '',
  ]],
  ['Brave', [
    path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'),
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe') : '',
  ]],
  ['Vivaldi', [
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Vivaldi', 'Application', 'vivaldi.exe') : '',
    path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'Vivaldi', 'Application', 'vivaldi.exe'),
  ]],
  ['360浏览器', [
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, '360Chrome', 'Chrome', 'Application', '360chrome.exe') : '',
  ]],
];

/**
 * 挑一个能用的浏览器：环境变量指定 → 系统默认浏览器（Chromium 系才可用）
 * → 已安装的 Chrome / Edge / 其它 Chromium。
 */
function findBrowser() {
  for (const env of [process.env.SURFCORE_BROWSER, process.env.SURFCORE_EDGE]) {
    const candidate = String(env ?? '').trim();
    if (!candidate) continue;
    try {
      if (fs.existsSync(candidate)) return { path: candidate, name: browserNameOf(candidate) || '指定浏览器', source: 'env' };
    } catch {}
  }

  // 主人常用的默认浏览器优先（Chrome、Edge、Brave… 都行；Firefox 不支持调试协议）。
  const fallback = defaultBrowserInfo();
  if (fallback.exe && isChromiumBrowser(fallback.name)) {
    return { path: fallback.exe, name: fallback.name, source: 'default' };
  }

  for (const [name, paths] of BROWSER_CANDIDATES) {
    for (const candidate of paths) {
      try {
        if (candidate && fs.existsSync(candidate)) return { path: candidate, name, source: 'installed' };
      } catch {}
    }
  }
  return { path: '', name: '', defaultName: fallback.name, source: 'none' };
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address()?.port;
      server.close(() => resolve(port));
    });
  });
}

/** 该浏览器的「User Data」根目录（日常登录态就存在这里）。 */
function userDataDirOf(browser) {
  const localAppData = process.env.LOCALAPPDATA || '';
  const exe = String(browser?.path ?? '').toLowerCase();
  const name = String(browser?.name ?? '');
  if (name === '360浏览器' || exe.includes('360chrome')) return path.join(localAppData, '360Chrome', 'Chrome', 'User Data');
  if (name === 'Edge' || exe.includes('msedge')) return path.join(localAppData, 'Microsoft', 'Edge', 'User Data');
  if (name === 'Brave' || exe.includes('brave')) return path.join(localAppData, 'BraveSoftware', 'Brave-Browser', 'User Data');
  if (name === 'Vivaldi' || exe.includes('vivaldi')) return path.join(localAppData, 'Vivaldi', 'User Data');
  if (name === 'Chrome' || exe.includes('chrome.exe')) return path.join(localAppData, 'Google', 'Chrome', 'User Data');
  return '';
}

async function waitJson(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return res.json();
    } catch {}
    await sleep(250);
  }
  throw new Error(`浏览器调试端口没响应（${Math.round(timeoutMs / 1000)} 秒）`);
}

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.nextId = 1;
    this.pending = new Map();
    ws.addEventListener('message', (event) => {
      let message = null;
      try { message = JSON.parse(String(event.data)); } catch { return; }
      if (!message?.id || !this.pending.has(message.id)) return;
      const { resolve, reject } = this.pending.get(message.id);
      this.pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message || JSON.stringify(message.error)));
      else resolve(message.result);
    });
    ws.addEventListener('close', () => {
      for (const { reject } of this.pending.values()) reject(new Error('浏览器窗口已关闭'));
      this.pending.clear();
    });
  }

  static connect(url) {
    if (typeof WebSocket !== 'function') return Promise.reject(new Error('当前运行时没有 WebSocket，无法驱动浏览器'));
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      const timer = setTimeout(() => { try { ws.close(); } catch {} reject(new Error('连接浏览器调试端口超时')); }, 10_000);
      ws.addEventListener('open', () => { clearTimeout(timer); resolve(new Cdp(ws)); }, { once: true });
      ws.addEventListener('error', () => { clearTimeout(timer); reject(new Error('连接浏览器调试端口失败')); }, { once: true });
    });
  }

  send(method, params = {}) {
    if (!this.ws || this.ws.readyState !== 1) return Promise.reject(new Error('浏览器调试连接不可用'));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => {
        if (!this.pending.has(id)) return;
        this.pending.delete(id);
        reject(new Error(`${method} 超时`));
      }, 20_000).unref?.();
    });
  }

  close() {
    try { this.ws.close(); } catch {}
  }
}

// ── cookie / 凭据 ────────────────────────────────────────────────────────────

function cookieHeaderOf(cookies) {
  return Object.entries(cookies ?? {})
    .filter(([, value]) => value)
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');
}

/** 从浏览器的 getAllCookies 结果里挑 .baidu.com 域的 cookie。 */
function pickBaiduCookies(all = []) {
  const cookies = {};
  for (const cookie of all) {
    const name = String(cookie?.name ?? '');
    const domain = String(cookie?.domain ?? '');
    if (!name || !domain.includes('baidu.com')) continue;
    cookies[name] = String(cookie?.value ?? '');
  }
  return cookies;
}

function writeCredentials(cookies, account) {
  const payload = {
    version: 3,
    bduss: cookies.BDUSS ?? cookies.BDUSS_BFESS ?? '',
    stoken: cookies.STOKEN ?? cookies.STOKEN_BFESS ?? '',
    ptoken: cookies.PTOKEN ?? cookies.PTOKEN_BFESS ?? '',
    bidupsid: cookies.BIDUPSID ?? '',
    token: account?.token ?? '',
    user: account?.user ?? '',
    tbs: account?.tbs ?? '',
    savedAt: new Date().toISOString(),
  };
  fs.mkdirSync(path.dirname(TIEBA_CRED), { recursive: true });
  const tmp = `${TIEBA_CRED}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(tmp, TIEBA_CRED);
  return payload;
}

export function readTiebaCredentials() {
  try {
    if (!fs.existsSync(TIEBA_CRED)) return null;
    const data = JSON.parse(fs.readFileSync(TIEBA_CRED, 'utf8'));
    // 新版 Chrome 的 cookie 读不出来时只有 token，也要算有效凭据。
    if (!data || (!data.bduss && !data.token)) return null;
    return {
      bduss: String(data.bduss),
      stoken: String(data.stoken ?? ''),
      ptoken: String(data.ptoken ?? ''),
      bidupsid: String(data.bidupsid ?? ''),
      token: String(data.token ?? ''),
      user: String(data.user ?? ''),
      tbs: String(data.tbs ?? ''),
      savedAt: String(data.savedAt ?? ''),
    };
  } catch {
    return null;
  }
}

export function clearTiebaCredentials() {
  try { fs.rmSync(TIEBA_CRED, { force: true }); } catch {}
}

/**
 * 验证扫码换来的 cookie。
 * 必须走 curl：同一串 BDUSS，Node fetch 会被百度按 TLS 指纹判 is_login=0（之前一直卡在这）。
 */
async function verifyByHttp(cookie) {
  const result = await verifyTiebaCookieHeader(cookie);
  return result.ok
    ? { ok: true, tbs: result.tbs }
    : { ok: false, error: result.error, detail: result.detail || '' };
}

export async function verifyStoredTiebaCredentials() {
  const cred = readTiebaCredentials();
  if (!cred) {
    return { ok: false, code: 'tieba.no-credentials', error: '还没有登录贴吧', hint: '到「贴吧」页点「打开浏览器登录」' };
  }
  if (!cred.bduss) {
    return {
      ok: true, tokenOnly: true, user: cred.user, savedAt: cred.savedAt,
      note: '本次只拿到 TB_TOKEN（新版浏览器的 cookie 加密读不到），互动接口仍可用',
    };
  }
  const verified = await verifyByHttp(cookieHeaderOf({ BDUSS: cred.bduss, STOKEN: cred.stoken, PTOKEN: cred.ptoken }));
  if (!verified.ok) {
    return {
      ok: false, code: 'tieba.cookie-expired',
      error: `贴吧返回未登录（${verified.error}）`,
      hint: verified.detail || '点「打开浏览器登录」重新登录一次',
    };
  }
  return { ok: true, tbs: verified.tbs, user: cred.user, savedAt: cred.savedAt };
}

function pickToken(text) {
  const raw = String(text ?? '');
  try {
    const parsed = JSON.parse(raw);
    const token = parsed?.data?.token ?? parsed?.data?.tb_token ?? parsed?.token ?? parsed?.tb_token;
    if (token) return String(token).trim();
  } catch { /* 不是 JSON */ }
  const match = raw.match(/TB_TOKEN\s*[=:]\s*([A-Za-z0-9_\-.]{20,})/)
             || raw.match(/"token"\s*:\s*"([A-Za-z0-9_\-.]{20,})"/)
             || raw.match(/([A-Za-z0-9_\-.]{32,})/);
  return match ? match[1].trim() : '';
}

// ── 扫码登录（照搬 BANKA2017/get-bduss 的成熟实现）────────────────────────
// 参考：https://github.com/BANKA2017/get-bduss/blob/master/workers.js
// 之前自己拼的时候搞错的三点，这里全部照它的写法：
//   ① channel_v 里的 v 原样拼进 URL，**不做 URL 编码**；
//   ② 登录态从 qrbdusslogin 返回 JSON 的 data.session 取，不依赖 Set-Cookie；
//   ③ session.stokenList 是「用途#值」列表，贴吧必须用 tb 那个 STOKEN，而不是默认 stoken。

function decodeMaybe(value) {
  const text = String(value ?? '');
  if (!text.includes('%')) return text;
  try { return decodeURIComponent(text); } catch { return text; }
}

async function fetchQrCode() {
  const res = await fetch(`${PASSPORT}/v2/api/getqrcode?lp=pc`, {
    headers: baseHeaders(),
    signal: AbortSignal.timeout(15_000),
  });
  const data = await res.json().catch(() => null);
  const sign = String(data?.sign ?? '').trim();
  const imgurl = String(data?.imgurl ?? '').trim();
  if (!sign || !imgurl) throw new Error(`百度二维码接口失败（errno ${data?.errno ?? '?'}）`);
  return { sign, imgurl: imgurl.startsWith('http') ? imgurl : `https://${imgurl}` };
}

/** 下载二维码图片转 data URL，避免设置页跨域破图。 */
async function downloadQrDataUrl(imgurl) {
  const res = await fetch(imgurl, {
    headers: baseHeaders({ accept: 'image/avif,image/webp,image/png,image/*,*/*;q=0.8' }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`二维码图片下载失败（HTTP ${res.status}）`);
  const type = String(res.headers.get('content-type') ?? '');
  if (!type.startsWith('image/')) throw new Error('二维码返回的不是图片');
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.length < 300) throw new Error('二维码图片异常（可能是占位图）');
  return `data:${type.split(';')[0]};base64,${bytes.toString('base64')}`;
}

/** unicast 返回的是 JS/JSONP 文本，不是干净 JSON，按 get-bduss 的正则方式解析。 */
function parseUnicast(text) {
  const raw = String(text ?? '');
  const errnoMatch = raw.match(/"errno":([\-0-9]+)/);
  const errno = errnoMatch ? Number(errnoMatch[1]) : -1;
  if (errno !== 0) return { errno, inner: null };
  const channelMatch = raw.match(/"channel_v":"(.*)"\}\)/) || raw.match(/"channel_v":"(.*)"\}/);
  if (!channelMatch) return { errno, inner: null };
  try {
    return { errno, inner: JSON.parse(channelMatch[1].replace(/\\/g, '')) };
  } catch {
    return { errno, inner: null };
  }
}

/** stokenList 形如 ["tb#xxxx","pan#yyyy"]，拆成 { tb: 'xxxx', pan: 'yyyy' }。 */
function parseStokenList(list) {
  try {
    const parsed = JSON.parse(String(list ?? '').replace(/&quot;/g, '"'));
    if (!Array.isArray(parsed)) return {};
    return Object.fromEntries(parsed
      .map((item) => String(item).split('#'))
      .filter((pair) => pair.length === 2));
  } catch {
    return {};
  }
}

/** 用扫码临时凭证换正式登录态，返回 { bduss, stokens, stoken, ptoken, ubi, user }。 */
async function exchangeByQr(v) {
  // ⚠️ 不编码：百度这个接口要的就是 channel_v 里原样的字符串。
  const url = `${PASSPORT}/v3/login/main/qrbdusslogin?bduss=${v}`;
  const res = await fetch(url, { headers: baseHeaders(), signal: AbortSignal.timeout(20_000) });
  const text = await res.text();
  // 返回体是「单引号 + 反斜杠转义」的伪 JSON，先修再解析（同 get-bduss）。
  const fixed = text.replace(/'([^']+)'/gm, '"$1"').replace(/\\&/gm, '&');
  let data = null;
  try { data = JSON.parse(fixed); } catch { data = null; }
  if (!data || String(data.code) !== '110000') {
    throw new Error(`换登录态失败（${data?.code ?? '返回无法解析'}）：${data?.message ?? text.slice(0, 80)}`);
  }
  const session = data.data?.session ?? {};
  const bduss = decodeMaybe(String(session.bduss ?? ''));
  if (!bduss || bduss.length < 20) throw new Error('换登录态后没有拿到 BDUSS');
  const stokens = parseStokenList(session.stokenList);
  return {
    bduss,
    stokens,
    stoken: decodeMaybe(String(stokens.tb ?? session.stoken ?? '')),
    ptoken: decodeMaybe(String(session.ptoken ?? '')),
    ubi: String(session.ubi ?? ''),
    user: String(data.data?.user?.displayName ?? data.data?.user?.username ?? ''),
  };
}

/** 用已登录的 cookie 领 TB_TOKEN（设置页领不到时还有手动粘贴兜底）。 */
async function autoFetchClawToken(cookie) {
  try {
    const res = await fetch(CLAW_TOKEN_URL, {
      headers: { ...baseHeaders(), accept: 'application/json, text/html;q=0.9, */*;q=0.8', referer: `${TIEBA}/`, cookie },
      signal: AbortSignal.timeout(15_000),
    });
    return pickToken(await res.text());
  } catch {
    return '';
  }
}

async function runQrSession(session) {
  while (!session.closed && Date.now() < session.expiresAt) {
    let parsed = null;
    try {
      const res = await fetch(`${PASSPORT}/channel/unicast?channel_id=${session.sign}&callback=a`, {
        headers: baseHeaders(),
        signal: AbortSignal.timeout(LONG_POLL_MS),
      });
      parsed = parseUnicast(await res.text());
    } catch {
      continue;
    }
    if (!parsed || parsed.errno !== 0 || !parsed.inner) continue;
    const inner = parsed.inner;
    if (Number(inner.status) === 1) { session.state = 'scanned'; continue; }
    if (Number(inner.status) === 2) continue;
    const v = String(inner.v ?? '').trim();
    if (!v) continue;

    session.state = 'scanned';
    try {
      const account = await exchangeByQr(v);
      // 优先 tb 类型 stoken；不行再逐个试 stokenList 里的其它用途。
      const candidates = [];
      if (account.stoken) candidates.push(account.stoken);
      for (const value of Object.values(account.stokens)) {
        if (value && !candidates.includes(value)) candidates.push(value);
      }
      const tried = [];
      let verified = null;
      let usedCookie = '';
      let usedStoken = '';
      for (const stoken of candidates.slice(0, 5)) {
        const cookie = cookieHeaderOf({ BDUSS: account.bduss, STOKEN: stoken, PTOKEN: account.ptoken });
        verified = await verifyByHttp(cookie);
        tried.push(`${stoken.slice(0, 6)}… ${verified.ok ? 'ok' : verified.error}`);
        if (verified.ok) { usedCookie = cookie; usedStoken = stoken; break; }
      }
      if (!verified?.ok) {
        throw new Error(`换到 cookie 但贴吧仍判未登录：${verified?.error ?? '没有可用的 stoken'}｜stoken 用途：${Object.keys(account.stokens).join('/') || '无'}｜${tried.join(' / ')}`);
      }
      // 平台层只认 cookie.txt 里的 BDUSS，扫码成功后立刻同步过去。
      setTiebaCookie(account.bduss);
      const saved = writeCredentials({
        BDUSS: account.bduss,
        STOKEN: usedStoken || account.stoken,
        PTOKEN: account.ptoken,
        UBI: account.ubi,
      }, { token: '', tbs: verified.tbs, user: account.user });
      session.state = 'confirmed';
      session.result = { user: saved.user, savedAt: saved.savedAt };
      session.closed = true;
      return;
    } catch (error) {
      session.state = 'failed';
      session.error = String(error?.message ?? error);
      session.closed = true;
      return;
    }
  }
  if (!session.closed) {
    session.state = 'expired';
    session.closed = true;
  }
}

/** 开始扫码会话（手机扫二维码，不需要关浏览器）。 */
export async function startTiebaQrLogin() {
  closeAllTiebaLogins();
  const { sign, imgurl } = await fetchQrCode();
  const image = await downloadQrDataUrl(imgurl);
  const id = `tieba_qr_${crypto.randomUUID()}`;
  const session = {
    id, sign, image,
    createdAt: Date.now(),
    expiresAt: Date.now() + QR_TTL_MS,
    state: 'waiting',
    error: '',
    result: null,
    closed: false,
  };
  sessions.set(id, session);
  runQrSession(session).catch((error) => {
    session.state = 'failed';
    session.error = String(error?.message ?? error);
    session.closed = true;
  });
  return { id, mode: 'qr', image, expiresAt: session.expiresAt };
}

export async function pollTiebaQrLogin(id) {
  const session = sessions.get(id);
  if (!session) return { ok: false, status: 'expired', error: '扫码会话不存在或已过期' };
  if (session.state === 'confirmed') {
    const result = { ok: true, status: 'confirmed', ...session.result };
    sessions.delete(id);
    return result;
  }
  if (session.state === 'failed') {
    const error = session.error || '扫码登录失败';
    sessions.delete(id);
    return { ok: false, status: 'failed', error };
  }
  if (Date.now() > session.expiresAt && session.state !== 'confirmed') {
    sessions.delete(id);
    return { ok: true, status: 'expired', error: '二维码已过期，请重新扫码' };
  }
  return { ok: true, status: session.state };
}

export function cancelTiebaQrLogin(id) {
  const session = sessions.get(id);
  if (session) {
    session.closed = true;
    sessions.delete(id);
  }
  return { ok: true };
}

// ── 登录会话 ─────────────────────────────────────────────────────────────────

/** 关掉浏览器窗口（不动会话状态，让 /poll 还能读到结果）。 */
function closeBrowser(session) {
  if (!session) return;
  try { session.cdp?.close(); } catch {}
  try { session.verify?.close(); } catch {}
  try { session.edge?.kill(); } catch {}
  // ⚠️ 用真实配置时绝不能删目录 —— 那是主人的 Chrome User Data。
  if (!session.realProfile) {
    try { fs.rmSync(session.profileDir, { recursive: true, force: true }); } catch {}
  }
}

function destroySession(session) {
  if (!session) return;
  session.closed = true;
  closeBrowser(session);
  sessions.delete(session.id);
}

/**
 * 确认登录：找一个贴吧域的标签（没有就新建一个，之后一直复用它），
 * 在页面里同源调 tbs；成功则顺手领 TB_TOKEN。
 *
 * 每次都用「临时连接」而不是长连接：页面跨进程导航会让调试连接失效，
 * 重新连接同一个标签才不会误判成「窗口被关闭」。
 */
async function confirmLogin(port) {
  let tab = null;
  try {
    const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    tab = Array.isArray(list)
      ? list.find((item) => item.type === 'page' && String(item.url ?? '').includes('tieba.baidu.com'))
      : null;
  } catch { /* 端口还没起来，下一轮再说 */ }

  if (!tab?.webSocketDebuggerUrl) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/new?${TIEBA}/`, { method: 'PUT' });
      if (!res.ok) return { reachable: false };
      tab = await res.json();
    } catch {
      return { reachable: false };
    }
  }
  if (!tab?.webSocketDebuggerUrl) return { reachable: false };

  let cdp = null;
  try {
    cdp = await Cdp.connect(tab.webSocketDebuggerUrl);
    await cdp.send('Runtime.enable');
    const probe = await cdp.send('Runtime.evaluate', {
      expression: "fetch('/dc/common/tbs',{credentials:'include'}).then(r=>r.text())",
      awaitPromise: true, returnByValue: true,
    });
    const data = JSON.parse(String(probe?.result?.value ?? '{}'));
    if (Number(data?.is_login) !== 1 || !data.tbs) return { reachable: true, logged: false };

    // 领 TB_TOKEN：先直接请求，拿不到就导航到领取页读渲染后的文本。
    let token = '';
    try {
      const claw = await cdp.send('Runtime.evaluate', {
        expression: `fetch('${CLAW_TOKEN_URL}',{credentials:'include'}).then(r=>r.text())`,
        awaitPromise: true, returnByValue: true,
      });
      token = pickToken(String(claw?.result?.value ?? ''));
    } catch { /* 退回下面读页面 */ }
    if (!token) {
      try {
        await cdp.send('Page.enable');
        await cdp.send('Page.navigate', { url: CLAW_TOKEN_URL });
        await sleep(3_000);
        const text = await cdp.send('Runtime.evaluate', {
          expression: 'document.body ? document.body.innerText : ""',
          returnByValue: true,
        });
        token = pickToken(String(text?.result?.value ?? ''));
      } catch { /* 领不到就让主人去领取页手动拿 */ }
    }
    return { reachable: true, logged: true, tbs: String(data.tbs), token };
  } catch {
    return { reachable: true, logged: false };
  } finally {
    try { cdp?.close(); } catch {}
  }
}

/** 尽量把浏览器 cookie 也存下来（新版 Chrome 加密时读到的可能为空，token 才是主凭证）。 */
async function readCookiesBestEffort(session) {
  try {
    const all = (await session.cdp.send('Network.getAllCookies')).cookies ?? [];
    return pickBaiduCookies(all);
  } catch {
    return {};
  }
}

/** 新开一个标签。 */
async function newTab(port) {
  const res = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' });
  if (!res.ok) throw new Error(`浏览器新建标签失败（HTTP ${res.status}）`);
  const tab = await res.json();
  if (!tab?.webSocketDebuggerUrl) throw new Error('浏览器没有可用的标签页');
  return tab;
}

async function runLoginSession(session) {
  try {
    try {
      await waitJson(`http://127.0.0.1:${session.port}/json/version`, EDGE_START_WAIT_MS);
    } catch {
      throw new Error(`没等到浏览器调试端口：请先完全退出 ${session.browser || '浏览器'}（任务管理器里也别留进程），再点一次「打开浏览器登录」`);
    }

    // 只开一个登录标签（前台，主人在这里操作）。验证标签按需创建，不会反复开关。
    const loginTab = await newTab(session.port);
    session.cdp = await Cdp.connect(loginTab.webSocketDebuggerUrl);
    await session.cdp.send('Page.enable');
    await session.cdp.send('Runtime.enable');
    await session.cdp.send('Network.enable');
    await session.cdp.send('Page.bringToFront');
    await session.cdp.send('Page.navigate', { url: LOGIN_URL });

    while (!session.closed && Date.now() < session.expiresAt) {
      await sleep(POLL_INTERVAL_MS);
      if (session.closed) return;

      // 完全不依赖读取浏览器 cookie（新版 Chrome 是应用绑定加密，读不到值），
      // 而是在贴吧页面里同源调接口，让浏览器自己把会话带上。
      const probe = await confirmLogin(session.port);
      if (!probe.reachable) {
        session.failStreak = (session.failStreak ?? 0) + 1;
        if (session.failStreak >= 5) throw new Error('浏览器窗口已被关闭');
        continue;
      }
      session.failStreak = 0;
      if (!probe.logged) continue;
      if (session.closed) return;

      const cookies = await readCookiesBestEffort(session);
      const saved = writeCredentials(cookies, { token: probe.token, tbs: probe.tbs, user: '' });
      session.state = 'confirmed';
      session.result = {
        user: saved.user,
        tokenConfigured: Boolean(saved.token),
        savedAt: saved.savedAt,
      };
      return;
    }

    if (!session.closed) {
      session.state = 'expired';
      session.error = '登录窗口超时（5 分钟），请重新点「打开浏览器登录」';
    }
  } catch (error) {
    if (!session.closed) {
      session.state = 'failed';
      session.error = String(error?.message ?? error);
    }
  } finally {
    // 只关窗口；confirmed / failed / expired 留给 /poll 读一次再清。
    closeBrowser(session);
  }
}

/** 该浏览器进程是否正在运行（运行中会占用 profile，导致调试端口开不起来）。 */
function browserProcessRunning(browser) {
  const exe = path.basename(String(browser?.path ?? '')) || '';
  if (!exe) return false;
  try {
    const out = String(execFileSync('tasklist', ['/FI', `IMAGENAME eq ${exe}`, '/NH'], {
      encoding: 'utf8', windowsHide: true, timeout: 5_000,
    }) ?? '');
    return out.toLowerCase().includes(exe.toLowerCase());
  } catch {
    return false;
  }
}

/**
 * 打开主人**真实**的浏览器配置（就是平时登录了 Google / 贴吧的那个），
 * 不再复制、不再是全新配置 —— 之前那种一眼就能看出不是自己的浏览器。
 *
 * 注意：Chrome 136+ 只允许在「显式指定 user-data-dir」时开启调试端口，
 * 所以启动前必须先完全退出浏览器；否则新进程会把命令转交给已有实例，端口不会开。
 */
export async function startTiebaLogin() {
  closeAllTiebaLogins();
  const browser = findBrowser();
  if (!browser.path) {
    throw new Error(browser.defaultName === 'Firefox'
      ? '你的默认浏览器是 Firefox，它不支持调试协议；请改用 Chrome / Edge，或用 SURFCORE_BROWSER 指定浏览器 exe'
      : '本机没找到可用的浏览器（Chrome / Edge 等 Chromium 系）');
  }

  const realProfile = userDataDirOf(browser);
  if (!realProfile || !fs.existsSync(realProfile)) {
    throw new Error(`找不到 ${browser.name || '浏览器'} 的用户配置目录，无法使用你的真实登录状态`);
  }

  if (browserProcessRunning(browser)) {
    throw new Error(`${browser.name || '浏览器'} 正在运行，配置文件被占用。请先完全退出 ${browser.name || '浏览器'}（关闭所有窗口，任务管理器里也不要留 ${path.basename(browser.path)} 进程），然后再点「打开浏览器登录」。`);
  }

  const port = await freePort();
  const edge = spawn(browser.path, [
    '--no-first-run', '--no-default-browser-check',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${realProfile}`,
    '--window-size=1000,760',
    'about:blank',
  ], { stdio: 'ignore', windowsHide: false });

  const id = `tieba_login_${crypto.randomUUID()}`;
  const session = {
    id, edge, port, profileDir: realProfile, realProfile: true,
    cdp: null,
    createdAt: Date.now(),
    expiresAt: Date.now() + LOGIN_TTL_MS,
    state: 'waiting',
    error: '',
    result: null,
    closed: false,
  };
  session.browser = browser.name;
  sessions.set(id, session);
  // 不 await：监控在后台跑，前端轮询 /poll 拿状态。
  runLoginSession(session).catch(() => destroySession(session));

  return {
    id, mode: 'browser', url: LOGIN_URL, expiresAt: session.expiresAt,
    browser: browser.name,
    realProfile: true,   // 用的是主人真实的浏览器配置
  };
}

export async function pollTiebaLogin(id) {
  const session = sessions.get(id);
  if (!session) return { ok: false, status: 'expired', error: '登录会话不存在或已结束' };
  if (session.state === 'confirmed') {
    const result = { ok: true, status: 'confirmed', ...session.result };
    sessions.delete(id);          // 浏览器已经关了，结果取走就可以清掉
    return result;
  }
  if (session.state === 'failed') {
    const error = session.error || '登录失败';
    sessions.delete(id);
    return { ok: false, status: 'failed', error };
  }
  if (session.state === 'expired') {
    const error = session.error;
    closeBrowser(session);
    sessions.delete(id);
    return { ok: true, status: 'expired', error };
  }
  if (Date.now() > session.expiresAt) {
    closeBrowser(session);
    sessions.delete(id);
    return { ok: true, status: 'expired', error: '登录窗口超时（5 分钟），请重新点「打开浏览器登录」' };
  }
  return { ok: true, status: session.state };
}

export function cancelTiebaLogin(id) {
  const session = sessions.get(id);
  if (session) destroySession(session);
  return { ok: true };
}

/** 用系统默认浏览器打开「领取 TB_TOKEN」页面（就是主人日常那个、已经登录贴吧的浏览器）。 */
export function openTiebaTokenPage() {
  const url = CLAW_TOKEN_URL;
  try {
    // cmd /c start "" <url> 交给系统默认浏览器，不带任何调试参数。
    spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
    return { ok: true, url };
  } catch (error) {
    return { ok: false, error: String(error?.message ?? error), url };
  }
}

export function closeAllTiebaLogins() {
  for (const session of [...sessions.values()]) destroySession(session);
}
