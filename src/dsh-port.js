// 找到「当前正在运行的那只 DSH」的 Web 地址。
//
// 为什么需要独立模块：DSH 桌面端每次启动会挑一个空闲回环端口（实测 28918 → 15016 →
// 41742 → 42212），而桥接铸造的会话 Cookie 把 host:port 绑进签名载荷，端口错只会 401。
// 正常路径有两条：DSH 拉起桥接时带 `DSH_WEB_URL`，或 `start-with-dsh-port.bat` 先跑
// `scripts/sync-dsh-port.mjs`。但直接 `npm start` / `node src/bridge.js` 时两条都没走，
// config.json 里的旧端口会让桥接一直 401/超时——表现却是「QQ 有消息、DSH 没反应」，
// 极难自查。所以这里把探测抽成共用逻辑：脚本用它写回配置，桥接启动时用它兜底。
//
// 平台：Windows 走 netstat + tasklist；其他平台只做 HTTP 探活（不枚举进程）。
import { execSync } from 'node:child_process';

/** 列出「某个进程在 127.0.0.1 上监听的端口」。 */
export function listeningLoopbackPorts() {
  let out = '';
  try {
    out = execSync('netstat -ano -p TCP', { encoding: 'utf8', windowsHide: true });
  } catch {
    return [];
  }
  const rows = [];
  for (const line of out.split(/\r?\n/)) {
    if (!line.includes('LISTENING')) continue;
    const cols = line.trim().split(/\s+/);
    const local = cols[1] ?? '';
    const pid = cols[4] ?? '';
    if (!/^127\.0\.0\.1:\d+$/.test(local)) continue;
    rows.push({ port: Number(local.split(':').pop()), pid });
  }
  return rows;
}

function processNames() {
  const map = new Map();
  try {
    const out = execSync('tasklist /fo csv /nh', { encoding: 'utf8', windowsHide: true });
    for (const line of out.split(/\r?\n/)) {
      const m = line.match(/^"([^"]+)","(\d+)"/);
      if (m) map.set(m[2], m[1]);
    }
  } catch { /* 拿不到进程名就只按端口探测 */ }
  return map;
}

/** DSH 的 Web 服务对未鉴权请求返回 401（有时 200），并带自己的响应头。 */
export async function looksLikeDsh(port, timeoutMs = 1500) {
  return probeDshBaseUrl(`http://127.0.0.1:${port}`, timeoutMs);
}

/** 枚举本机正在监听的 DSH，返回 `http://127.0.0.1:<port>`；找不到返回 null。 */
export async function discoverDshBaseUrl() {
  if (process.platform !== 'win32') return null;
  const names = processNames();
  const candidates = listeningLoopbackPorts()
    .filter(({ pid }) => /harness|dsh/i.test(names.get(pid) ?? ''))
    .map(({ port }) => port)
    .filter((port, i, all) => all.indexOf(port) === i);
  for (const port of candidates) {
    if (await looksLikeDsh(port)) return `http://127.0.0.1:${port}`;
  }
  return null;
}

/**
 * 这个地址上是否有一个活着的 DSH。
 *
 * 401 = 教科书式的「DSH 在，但要鉴权」；200 只有在 SERVER 头像 DSH 时才认——
 * 否则回环上任何一个别的 Web 服务（开发服务器、别的控制台）都会被当成 DSH，
 * 桥接就会把消息投给错误的目标，症状还是「QQ 有消息、DSH 没反应」。
 */
export async function probeDshBaseUrl(baseUrl, timeoutMs = 2000) {
  const base = String(baseUrl ?? '').trim().replace(/\/+$/, '');
  if (!base) return false;
  try {
    const res = await fetch(`${base}/`, { method: 'GET', signal: AbortSignal.timeout(timeoutMs) });
    await res.body?.cancel?.();
    if (res.status === 401) return true;
    const server = String(res.headers.get('server') ?? '');
    return res.status === 200 && /dsh/i.test(server);
  } catch {
    return false;
  }
}

/** 只对回环地址做「端口漂移」兜底；远程 DSH 由用户显式配置，不能被本地探测覆盖。 */
export function isLoopbackBaseUrl(baseUrl) {
  return /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?(\/|$)/i.test(String(baseUrl ?? '').trim());
}
