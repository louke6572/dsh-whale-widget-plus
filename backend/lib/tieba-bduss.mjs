/**
 * 百度贴吧 BDUSS 客户端（网络层）。
 *
 * 来源：直接移植 dsh-tieba-dive（MIT，https://github.com/Nekomeow114/dsh-tieba-dive）
 * 的 lib/tieba.js —— 这是社区里已经跑通的「刷贴吧」实现，不再自己造。
 *
 * 两个关键结论（原作者实测写进 README，也是我们之前扫码登录反复失败的原因）：
 *   1. 百度认 TLS 指纹：同一串 BDUSS、同一组 header，`curl` → is_login:1，
 *      Node `fetch`(undici) → is_login:0。所以网络层交给 curl 子进程，
 *      cookie 只走 jar 文件（不进 argv，ps 里看不到）。
 *   2. 手机版页面 /mo/q/m?kw= / ?kz= 能稳定读到内容；电脑版对陌生 UA 直接 302/403。
 *
 * 凭据落盘：$DSH_HOME/surfcore/tieba/cookie.txt（0600）+ jar.txt（0600）。
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { TIEBA_DIR } from './paths.js';

export const UA =
  'Mozilla/5.0 (Linux; Android 13; V2425A) AppleWebKit/537.36 '
  + '(KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

const BASE = 'https://tieba.baidu.com';
const GAP_MS = 1200;
let lastAt = 0;
let CURL_BIN = process.env.SURFCORE_CURL || 'curl';
const FID = new Map();
let TBS = { value: '', at: 0 };

export const tiebaHomeDir = () => TIEBA_DIR;
export const tiebaCookieFile = () => path.join(TIEBA_DIR, 'cookie.txt');
export const tiebaJarFile = () => path.join(TIEBA_DIR, 'jar.txt');

export function setTiebaCurlBin(bin) { if (bin) CURL_BIN = String(bin); }

/**
 * 保存 BDUSS。用户常常只复制「值」不带 `BDUSS=` 前缀，这里自动补。
 * BDUSS 不是严格 base64（可能含 `~`），只挡明显不是凭证的输入。
 */
export function setTiebaCookie(raw) {
  const input = String(raw || '').trim().replace(/\s+/g, '');
  if (!input) throw new Error('粘贴一下 BDUSS 再保存');
  if (/^(ssh-|-----BEGIN)/i.test(input)) {
    throw new Error('这是 SSH 公钥，不是贴吧的 BDUSS —— BDUSS 在贴吧 cookie 里，约 190 个字符');
  }
  const value = input.replace(/^BDUSS=/i, '').trim();
  if (value.length < 40 || /\s/.test(value) || !/^[\x21-\x7e]+$/.test(value)) {
    throw new Error(`这串看着不像 BDUSS（长度 ${value.length}）—— 请把 Cookie Value 原样粘贴，不要手工删改`);
  }
  fs.mkdirSync(TIEBA_DIR, { recursive: true });
  fs.writeFileSync(tiebaCookieFile(), `BDUSS=${value}\n`, { mode: 0o600 });
  try { fs.chmodSync(tiebaCookieFile(), 0o600); } catch {}
  try { fs.unlinkSync(tiebaJarFile()); } catch { /* 没有就算了 */ }
  TBS = { value: '', at: 0 };
  jarSeeded = false;
  syncJar();
  return value;
}

export function getTiebaCookie() {
  try { return fs.readFileSync(tiebaCookieFile(), 'utf8').trim(); } catch { return ''; }
}

export function getTiebaBduss() {
  return getTiebaCookie().replace(/^BDUSS=/i, '');
}

export const hasTiebaCookie = () => /BDUSS=/.test(getTiebaCookie());

export function clearTiebaCookie() {
  try { fs.unlinkSync(tiebaCookieFile()); } catch {}
  try { fs.unlinkSync(tiebaJarFile()); } catch {}
  TBS = { value: '', at: 0 };
  jarSeeded = false;
}

/** 把 cookie.txt 里的键值补进 Netscape 格式的 jar（curl -b/-c 用）。 */
function syncJar() {
  if (!hasTiebaCookie()) return;
  const need = getTiebaCookie().split(';').map((x) => x.trim()).filter(Boolean);
  let lines = [];
  try { lines = fs.readFileSync(tiebaJarFile(), 'utf8').split('\n').filter(Boolean); } catch { /* 新 jar */ }
  const have = new Set(lines.map((l) => l.split('\t')[5]));
  for (const kv of need) {
    const [key, ...rest] = kv.split('=');
    if (!key || have.has(key)) continue;
    lines.push(`.baidu.com\tTRUE\t/\tFALSE\t4102444800\t${key}\t${rest.join('=')}`);
  }
  fs.mkdirSync(TIEBA_DIR, { recursive: true });
  fs.writeFileSync(tiebaJarFile(), lines.join('\n') + '\n', { mode: 0o600 });
  try { fs.chmodSync(tiebaJarFile(), 0o600); } catch {}
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let jarSeeded = false;

/**
 * 首次请求前先拿 BAIDUID：没有这个 cookie 时，贴吧所有页面都会直接 403
 * 「百度安全验证」（实测 even 首页），看起来像 BDUSS 失效，其实只是缺身份 cookie。
 */
async function ensureJarSeeded() {
  if (jarSeeded) return;
  syncJar();
  let text = '';
  try { text = fs.readFileSync(tiebaJarFile(), 'utf8'); } catch { /* 新 jar */ }
  if (!/BAIDUID/.test(text)) {
    try {
      await curl(['-s', '-S', '-L', '--max-time', '15', '-A', UA, '-c', tiebaJarFile(), 'https://www.baidu.com/']);
    } catch { /* 拿不到就按原样请求，让百度自己报错 */ }
  }
  jarSeeded = true;
}

function curlBuffer(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(CURL_BIN, args, { windowsHide: true });
    const out = [];
    const err = [];
    proc.stdout.on('data', (d) => out.push(d));
    proc.stderr.on('data', (d) => err.push(d));
    proc.on('error', reject);
    proc.on('close', (code) => resolve({ code, out: Buffer.concat(out), err: Buffer.concat(err) }));
  });
}

async function curl(args) {
  const { code, out, err } = await curlBuffer(args);
  return { code, out: out.toString('utf8'), err: err.toString('utf8') };
}

async function req(url, { method = 'GET', form, referer } = {}) {
  await ensureJarSeeded();
  const gap = Date.now() - lastAt;
  if (gap < GAP_MS) await sleep(GAP_MS - gap);
  lastAt = Date.now();
  syncJar();

  const args = ['-s', '-S', '-L', '--max-time', '25', '-A', UA,
    '-b', tiebaJarFile(), '-c', tiebaJarFile(),
    '-H', 'Accept-Language: zh-CN,zh;q=0.9',
    '-H', `Referer: ${referer || `${BASE}/`}`];
  if (form) for (const [k, v] of Object.entries(form)) args.push('--data-urlencode', `${k}=${v}`);
  if (method !== 'GET') args.unshift('-X', method);
  args.push(url);

  const { code, out, err } = await curl(args);
  if (code !== 0) throw new Error(`curl 失败（code ${code}）：${err.slice(0, 120)}`);
  if (/百度安全验证/.test(out)) {
    const error = new Error('被百度安全验证拦了：BDUSS 可能失效，或当前出口 IP 需要滑块');
    error.code = 'BLOCKED';
    throw error;
  }
  return { status: 200, text: out };
}

/** tbs 是签到/回帖都要的令牌，顺便验证 cookie 还活着。 */
async function tbs() {
  if (TBS.value && Date.now() - TBS.at < 10 * 60_000) return TBS.value;
  const { text } = await req(`${BASE}/dc/common/tbs`);
  let json;
  try { json = JSON.parse(text); } catch { throw new Error('tbs 没返回 JSON（多半被拦了）'); }
  if (String(json.is_login) !== '1') {
    const error = new Error('BDUSS 没被认成登录态（is_login=0）—— 可能已过期，去贴吧网页重新登录后复制一次');
    error.code = 'NOT_LOGIN';
    throw error;
  }
  TBS = { value: json.tbs, at: Date.now() };
  return json.tbs;
}

/**
 * 用一段临时 cookie（BDUSS / STOKEN / PTOKEN）验证登录态。
 * 扫码换来的凭据先在这里用 curl 验，避免把无效 BDUSS 落盘。
 */
export async function verifyTiebaCookieHeader(cookieHeader) {
  const header = String(cookieHeader || '').trim();
  if (!/BDUSS=/.test(header)) return { ok: false, error: '没有 BDUSS' };
  fs.mkdirSync(TIEBA_DIR, { recursive: true });
  const tmpJar = path.join(TIEBA_DIR, `.verify-${Date.now()}-${Math.random().toString(16).slice(2)}.jar`);
  try {
    // 先拿 BAIDUID，再把候选 cookie 追加进 jar（缺 BAIDUID 时贴吧会直接 403）
    await curl(['-s', '-S', '-L', '--max-time', '15', '-A', UA, '-c', tmpJar, 'https://www.baidu.com/']);
    const lines = fs.readFileSync(tmpJar, 'utf8').split('\n').filter(Boolean);
    const have = new Set(lines.map((line) => line.split('\t')[5]));
    for (const kv of header.split(';').map((x) => x.trim()).filter(Boolean)) {
      const [key, ...rest] = kv.split('=');
      if (!key || have.has(key)) continue;
      lines.push(`.baidu.com\tTRUE\t/\tFALSE\t4102444800\t${key}\t${rest.join('=')}`);
    }
    fs.writeFileSync(tmpJar, `${lines.join('\n')}\n`, { mode: 0o600 });
    const { code, out } = await curl([
      '-s', '-S', '-L', '--max-time', '20', '-A', UA,
      '-b', tmpJar, '-c', tmpJar, '-H', 'Accept-Language: zh-CN,zh;q=0.9',
      `${BASE}/dc/common/tbs`,
    ]);
    if (code !== 0) return { ok: false, error: `curl 失败（${code}）` };
    let json = null;
    try { json = JSON.parse(out); } catch { /* 被拦页 */ }
    if (String(json?.is_login) === '1' && json.tbs) return { ok: true, tbs: String(json.tbs) };
    return { ok: false, error: '贴吧仍判未登录（is_login≠1）', detail: out.slice(0, 160) };
  } catch (error) {
    return { ok: false, error: String(error?.message ?? error) };
  } finally { try { fs.unlinkSync(tmpJar); } catch { /* ignore */ } }
}

/** 登录态检查：拿到 tbs 就说明 BDUSS 有效。 */
export async function tiebaWhoami() {
  if (!hasTiebaCookie()) return { loggedIn: false, error: '还没粘贴 BDUSS' };
  const value = await tbs();
  return { loggedIn: true, tbs: value };
}

/** 解析吧内帖子列表（纯函数，方便离线测）。 */
export function parseTiebaList(text) {
  const fid = /fid=(\d+)/.exec(text)?.[1] || '';
  const threads = [];
  const seen = new Set();
  const re = /<a[^>]+href="\/p\/(\d+)[^"]*"[^>]*>(.*?)<\/a>/gs;
  let match;
  while ((match = re.exec(text))) {
    const id = match[1];
    const title = decodeHtml(match[2]).replace(/\s+/g, ' ').trim();
    if (!title || seen.has(id)) continue;
    seen.add(id);
    const tail = text.slice(match.index + match[0].length, match.index + match[0].length + 400);
    const replies = /ti_num[^>]*>\s*(\d+)/.exec(tail)?.[1] || '';
    threads.push({ id, title, reply: replies });
  }
  const kw = /<title>([^<]+)/.exec(text)?.[1]?.replace(/吧_百度贴吧.*/, '') || '';
  return { kw, fid, threads };
}

/** 解析帖子楼层正文 + 图（纯函数）。 */
export function parseTiebaThread(text) {
  const title = /<title>([^<]+)/.exec(text)?.[1] || '';
  const kw = /"fname"\s*:\s*"([^"]+)"/.exec(text)?.[1] || /[?&]kw=([^&"]+)/.exec(text)?.[1] || '';
  const floors = [];
  const floorAt = [];
  const images = [];
  const seenImg = new Set();
  const re = /<div class="([^"]*content[^"]*)"[^>]*>(.*?)<\/div>/gs;
  let match;
  while ((match = re.exec(text))) {
    if (match[1].includes('top_bar')) continue;
    const body = match[2];
    const textContent = decodeHtml(body).replace(/\s+/g, ' ').trim();
    if (textContent) { floorAt.push(match.index); floors.push(textContent); }
    const pushImg = (raw) => {
      let url = String(raw || '').replace(/&amp;/g, '&').replace(/&quot;/g, '"');
      const inner = /[?&]src=([^&]+)/.exec(url);
      if (inner) { try { url = decodeURIComponent(inner[1]); } catch { /* 保留原样 */ } }
      if (url.startsWith('//')) url = `https:${url}`;
      if (!/^https?:\/\//.test(url)) return;
      if (/\/editor\/images\/|image_emoticon/.test(url)) return;
      if (seenImg.has(url)) return;
      seenImg.add(url);
      images.push(url);
    };
    const imgRe = /<img[^>]+(?:data-src|src)="([^"]+)"/g;
    let img;
    while ((img = imgRe.exec(body))) pushImg(img[1]);
    const lazyRe = /data-url=['"]([^'"]+)['"]/g;
    while ((img = lazyRe.exec(body))) pushImg(img[1]);
  }
  const frRe = /<div class="fr_list[^"]*"[^>]*data-list-count="(\d+)"/g;
  const fr = [];
  let fm;
  while ((fm = frRe.exec(text))) fr.push({ at: fm.index, n: Number(fm[1]) || 0 });
  const hotFloors = [];
  for (let i = 0; i < floors.length; i += 1) {
    const from = floorAt[i];
    const to = i + 1 < floorAt.length ? floorAt[i + 1] : text.length;
    const rec = fr.find((x) => x.at > from && x.at < to);
    if (rec && rec.n > 0) hotFloors.push({ floor: i + 1, replies: rec.n, text: floors[i] });
  }
  hotFloors.sort((a, b) => b.replies - a.replies);
  return { title, kw, floors, hotFloors: hotFloors.slice(0, 5), images: images.slice(0, 20), imageCount: images.length };
}

export async function listBar(kw, { pn = 0 } = {}) {
  const { text } = await req(`${BASE}/mo/q/m?kw=${encodeURIComponent(kw)}&pn=${pn}`);
  const parsed = parseTiebaList(text);
  if (parsed.fid) FID.set(String(kw), String(parsed.fid));
  return { kw: parsed.kw || kw, fid: parsed.fid, threads: parsed.threads };
}

export async function readThread(tid, { pn = 1 } = {}) {
  const { text } = await req(`${BASE}/mo/q/m?kz=${tid}&pn=${pn}`, { referer: `${BASE}/p/${tid}` });
  return { tid, ...parseTiebaThread(text) };
}

/** 贴吧 app 端签名：md5(按 key 排序的 "k=v" 拼接 + "tiebaclient!!!") */
function appSign(params) {
  const keys = Object.keys(params).sort();
  const raw = keys.map((k) => `${k}=${params[k]}`).join('');
  return crypto.createHash('md5').update(raw).update('tiebaclient!!!').digest('hex');
}

/** 走 app 接口（tiebac 域名 + 签名）；关注、点赞这类操作只有这条路通。 */
export async function appPost(pathname, params) {
  await ensureJarSeeded();
  const gap = Date.now() - lastAt;
  if (gap < GAP_MS) await sleep(GAP_MS - gap);
  lastAt = Date.now();
  const body = { ...params, sign: appSign(params) };
  const args = ['-s', '-S', '-L', '--max-time', '25',
    '-A', 'bdtb for Android 12.60.1.0',
    '-H', 'Content-Type: application/x-www-form-urlencoded'];
  for (const [k, v] of Object.entries(body)) args.push('--data-urlencode', `${k}=${v}`);
  args.push(`https://tiebac.baidu.com${pathname}`);
  const { code, out, err } = await curl(args);
  if (code !== 0) throw new Error(`curl 失败（${code}）：${err.slice(0, 100)}`);
  let json;
  try { json = JSON.parse(out); } catch { throw new Error(`app 接口返回不是 JSON：${out.slice(0, 120)}`); }
  return json;
}

/** 当前账号关注的吧。friend_uid=0 表示「我自己」。 */
export async function followedForums({ pages = 5, pageSize = 200 } = {}) {
  const names = [];
  for (let pn = 1; pn <= pages; pn += 1) {
    const json = await appPost('/c/f/forum/like', {
      BDUSS: getTiebaBduss(),
      _client_version: '12.60.1.0',
      friend_uid: '0',
      page_no: String(pn),
      page_size: String(pageSize),
    });
    const code = Number(json?.error_code ?? 0);
    if (code !== 0) throw new Error(json?.error_msg || `拉取关注列表失败（${code}）`);
    const fl = json?.forum_list || {};
    const rows = [...(fl['non-gconforum'] || []), ...(fl.gconforum || [])];
    for (const row of rows) if (row?.name && !names.includes(row.name)) names.push(row.name);
    if (!Number(json?.has_more)) break;
  }
  return names;
}

// ── 最小 protobuf：app 端楼层接口 ──────────────────────────────────────────
const pbVarint = (n) => {
  const out = [];
  let value = BigInt(Math.trunc(Number(n)));
  while (value > 127n) { out.push(Number(value & 127n) | 128); value >>= 7n; }
  out.push(Number(value));
  return Buffer.from(out);
};
const pbTag = (no, wire) => pbVarint((no << 3) | wire);
const pbInt = (no, n) => Buffer.concat([pbTag(no, 0), pbVarint(n)]);
const pbStr = (no, s) => { const b = Buffer.from(String(s)); return Buffer.concat([pbTag(no, 2), pbVarint(b.length), b]); };
const pbMsg = (no, b) => Buffer.concat([pbTag(no, 2), pbVarint(b.length), b]);

export function encodePageReq({ tid, pid = 0, pn = 1, rn = 30, sort = 1, bduss = '', withComments = false, floorRn = 20 }) {
  const common = Buffer.concat([
    pbInt(1, 2),
    pbStr(2, '12.64.1.1'),
    pbStr(10, bduss),
  ]);
  const data = Buffer.concat([
    pbMsg(25, common), pbInt(4, tid), pbInt(5, 0), pbInt(6, sort),
    pbInt(13, rn), pbInt(18, pn), pbInt(8, withComments ? 1 : 0), pbInt(9, withComments ? floorRn : 0), pbInt(74, 1),
    ...(pid ? [pbInt(7, pid)] : []),
  ]);
  return pbMsg(1, data);
}

function pbReadVarint(buf, pos) {
  let value = 0n;
  let shift = 0n;
  let p = pos;
  while (p < buf.length) {
    const b = buf[p];
    p += 1;
    value |= BigInt(b & 127) << shift;
    if (!(b & 128)) return { v: Number(value), p };
    shift += 7n;
    if (shift > 63n) break;
  }
  return { v: 0, p };
}

function pbFields(buf) {
  const out = [];
  let p = 0;
  while (p < buf.length) {
    const t = pbReadVarint(buf, p);
    if (t.p === p) break;
    const no = Math.floor(t.v / 8);
    const wire = t.v & 7;
    p = t.p;
    if (wire === 0) { const r = pbReadVarint(buf, p); out.push({ no, wire, v: r.v }); p = r.p; }
    else if (wire === 2) {
      const len = pbReadVarint(buf, p);
      p = len.p;
      out.push({ no, wire, b: buf.subarray(p, p + len.v), v: len.v });
      p += len.v;
    } else if (wire === 1) p += 8;
    else if (wire === 5) p += 4;
    else break;
  }
  return out;
}

const pbText = (buf) => {
  const parts = [];
  for (const f of pbFields(buf)) if (f.no === 2 && f.b) parts.push(f.b.toString('utf8'));
  return parts.join('').trim();
};

export function parsePageResponse(buf) {
  const posts = [];
  for (const top of pbFields(buf)) {
    if (top.no !== 2 || !top.b) continue;
    for (const d of pbFields(top.b)) {
      if (d.no !== 6 || !d.b) continue;
      let floor = 0;
      let likes = 0;
      let subs = 0;
      let text = '';
      let id = 0;
      let authorId = 0;
      for (const f of pbFields(d.b)) {
        if (f.no === 1 && f.wire === 0) id = f.v;
        else if (f.no === 3 && f.wire === 0) floor = f.v;
        else if (f.no === 19 && f.wire === 0) authorId = f.v;
        else if (f.no === 13 && f.wire === 0) subs = f.v;
        else if (f.no === 37 && f.b) {
          for (const a of pbFields(f.b)) if (a.no === 1 && a.wire === 0) likes = a.v;
        } else if (f.no === 5 && f.b) text += pbText(f.b);
      }
      if (floor) posts.push({ id, floor, authorId, likes, replies: subs, text: text.slice(0, 200) });
    }
  }
  return posts;
}

/** app 端楼层列表（带 id / 楼层号 / 赞数）。失败抛错，由调用方退回手机版页面。 */
export async function hotReplies(tid, { rn = 30, pn = 1, withComments = false, sort = 1, pid = 0 } = {}) {
  syncJar();
  const body = encodePageReq({ tid: Number(tid), pid: Number(pid) || 0, pn, rn, sort, withComments, bduss: getTiebaBduss() });
  const tmp = path.join(TIEBA_DIR, `.pb-${Date.now()}-${Math.random().toString(16).slice(2)}.bin`);
  fs.mkdirSync(TIEBA_DIR, { recursive: true });
  fs.writeFileSync(tmp, body, { mode: 0o600 });
  try {
    const { code, out, err } = await curlBuffer([
      '-s', '-S', '--compressed', '--max-time', '25', '-X', 'POST',
      '-A', 'aiotieba/4.8.1',
      '-H', 'x_bd_data_type: protobuf',
      '-H', 'Host: tiebac.baidu.com',
      '-F', `data=@${tmp};filename=file`,
      'https://tiebac.baidu.com/c/f/pb/page?cmd=302001',
    ]);
    if (code !== 0) throw new Error(`楼层请求失败（curl ${code}）：${err.toString().slice(0, 80)}`);
    return parsePageResponse(out).sort((a, b) => b.likes - a.likes);
  } finally { try { fs.unlinkSync(tmp); } catch { /* ignore */ } }
}

export function encodeFloorReq({ tid, pid = 0, spid = 0, pn = 1, bduss = '' }) {
  const common = Buffer.concat([pbInt(1, 2), pbStr(2, '22.12.1.0'), pbStr(10, bduss)]);
  const parts = [pbInt(1, tid), pbInt(4, pn), pbMsg(9, common)];
  if (pid) parts.push(pbInt(2, pid));
  if (spid) parts.push(pbInt(3, spid));
  return pbMsg(1, Buffer.concat(parts));
}

const pbUserName = (buf) => {
  let id = 0;
  let name = '';
  let show = '';
  let portrait = '';
  for (const f of pbFields(buf)) {
    if (f.no === 2 && f.wire === 0) id = f.v;
    else if (f.no === 3 && f.b) name = f.b.toString('utf8');
    else if (f.no === 4 && f.b) show = f.b.toString('utf8');
    else if (f.no === 5 && f.b) portrait = f.b.toString('utf8');
  }
  return { id, name, nameShow: show || name, portrait };
};

export function parseFloorResponse(buf) {
  const subs = [];
  for (const top of pbFields(buf)) {
    if (top.no !== 2 || !top.b) continue;
    for (const d of pbFields(top.b)) {
      if (d.no !== 4 || !d.b) continue;
      let id = 0;
      let text = '';
      let floor = 0;
      let agree = 0;
      let author = { id: 0, name: '', nameShow: '' };
      let time = 0;
      for (const f of pbFields(d.b)) {
        if (f.no === 1 && f.wire === 0) id = f.v;
        else if (f.no === 2 && f.b) text += pbText(f.b);
        else if (f.no === 3 && f.wire === 0) time = f.v;
        else if (f.no === 6 && f.wire === 0) floor = f.v;
        else if (f.no === 7 && f.b) author = pbUserName(f.b);
        else if (f.no === 9 && f.b) { for (const a of pbFields(f.b)) if (a.no === 1 && a.wire === 0) agree = a.v; }
      }
      if (id) subs.push({ id, text, floor, agree, time, author });
    }
  }
  return subs;
}

export async function getSubReplies(tid, pid, { pn = 1 } = {}) {
  syncJar();
  const body = encodeFloorReq({ tid: Number(tid), pid: Number(pid), pn, bduss: getTiebaBduss() });
  const tmp = path.join(TIEBA_DIR, `.sre-${Date.now()}-${Math.random().toString(16).slice(2)}.bin`);
  fs.mkdirSync(TIEBA_DIR, { recursive: true });
  fs.writeFileSync(tmp, body, { mode: 0o600 });
  try {
    const { code, out, err } = await curlBuffer([
      '-s', '-S', '--compressed', '--max-time', '25', '-X', 'POST',
      '-A', 'aiotieba/4.8.1', '-H', 'x_bd_data_type: protobuf', '-H', 'Host: tiebac.baidu.com',
      '-F', `data=@${tmp};filename=file`,
      'https://tiebac.baidu.com/c/f/pb/floor?cmd=302002',
    ]);
    if (code !== 0) throw new Error(`楼中楼请求失败（curl ${code}）：${err.toString().slice(0, 80)}`);
    return parseFloorResponse(out);
  } finally { try { fs.unlinkSync(tmp); } catch { /* ignore */ } }
}

/** @我的列表（app 接口 /c/u/feed/atme） */
export async function getAts({ pn = 1 } = {}) {
  const json = await appPost('/c/u/feed/atme', {
    BDUSS: getTiebaBduss(),
    _client_version: '22.12.1.0',
    pn: String(pn),
  });
  const list = Array.isArray(json.at_list) ? json.at_list : [];
  return list.map((a) => ({
    fname: a.fname || '',
    fid: Number(a.fid) || 0,
    tid: String(a.thread_id || ''),
    pid: String(a.post_id || ''),
    quotePid: String(a.quote_pid || ''),
    time: Number(a.time) || 0,
    isFloor: String(a.is_floor || '') === '1',
    type: String(a.type || ''),
    content: String(a.content || ''),
    title: String(a.title || ''),
    replyer: {
      id: Number((a.replyer || {}).id) || 0,
      name: (a.replyer || {}).name || '',
      nameShow: (a.replyer || {}).name_show || (a.replyer || {}).name || '',
      portrait: (a.replyer || {}).portrait || '',
    },
  }));
}

/** 当前登录账号信息（/mo/q/newmoindex）。 */
export async function selfInfo() {
  syncJar();
  const { text } = await req(`${BASE}/mo/q/newmoindex?need_user=1`);
  const data = JSON.parse(text).data || {};
  return { id: Number(data.id || data.uid || 0), name: data.name || '', nameShow: data.name_show || data.name || '' };
}

export function encodeAddPost({ tid, fid, kw, content, tbs: tbsValue, bduss, quoteId, subPostId, replyUid, nameShow }) {
  const common = Buffer.concat([pbInt(1, 2), pbStr(2, '22.12.1.0'), pbStr(10, bduss), pbStr(11, tbsValue)]);
  const data = Buffer.concat([
    pbMsg(1, common), pbStr(4, tbsValue), pbStr(19, content),
    pbStr(26, String(fid)), pbStr(30, kw), pbStr(45, String(tid)),
    pbStr(46, String(quoteId)), pbStr(49, String(quoteId)),
    pbStr(50, String(subPostId)), pbStr(20, String(replyUid)),
    pbStr(48, '0'), pbStr(6, '1'), pbStr(18, '1'), pbStr(16, '12'),
    ...(nameShow ? [pbStr(58, nameShow)] : []),
  ]);
  return pbMsg(1, data);
}

export function encodeAddFloor({ tid, fid, kw, content, tbs: tbsValue, bduss, nameShow }) {
  const common = Buffer.concat([pbInt(1, 2), pbStr(2, '22.12.1.0'), pbStr(10, bduss), pbStr(11, tbsValue)]);
  const data = Buffer.concat([
    pbMsg(1, common), pbStr(4, tbsValue), pbStr(19, content),
    pbStr(26, String(fid)), pbStr(30, kw), pbStr(45, String(tid)),
    pbStr(48, '0'), pbStr(6, '1'), pbStr(18, '1'), pbStr(16, '12'),
    pbStr(55, '13'),
    ...(nameShow ? [pbStr(58, nameShow)] : []),
  ]);
  return pbMsg(1, data);
}

export function parseAddPostResponse(buf) {
  let errno = 0;
  let errmsg = '';
  let pid = '';
  for (const f of pbFields(buf)) {
    if (f.no === 1 && f.b) {
      for (const e of pbFields(f.b)) {
        if (e.no === 1 && e.wire === 0) errno = e.v;
        else if (e.no === 2 && e.b) errmsg = e.b.toString('utf8');
      }
    } else if (f.no === 2 && f.b) {
      for (const d of pbFields(f.b)) if (d.no === 3 && d.b) pid = d.b.toString('utf8');
    }
  }
  return { errno, errmsg, pid };
}

async function postFloorBytes(body, tmpPrefix) {
  const tmp = path.join(TIEBA_DIR, `.${tmpPrefix}-${Date.now()}-${Math.random().toString(16).slice(2)}.bin`);
  fs.mkdirSync(TIEBA_DIR, { recursive: true });
  fs.writeFileSync(tmp, body, { mode: 0o600 });
  try {
    const { code, out, err } = await curlBuffer([
      '-s', '-S', '--compressed', '--max-time', '25', '-X', 'POST',
      '-A', 'aiotieba/4.8.1', '-H', 'x_bd_data_type: protobuf', '-H', 'Host: tiebac.baidu.com',
      '-F', `data=@${tmp};filename=file`,
      'https://tiebac.baidu.com/c/c/post/add?cmd=309731&format=protobuf',
    ]);
    if (code !== 0) throw new Error(`App 回帖请求失败（curl ${code}）：${err.toString().slice(0, 80)}`);
    return out;
  } finally { try { fs.unlinkSync(tmp); } catch { /* ignore */ } }
}

/** 主楼回帖（app protobuf）。kw 用来拿 fid。 */
export async function replyFloor({ kw, tid, content }) {
  syncJar();
  const bar = await listBar(kw);
  const t = await tbs();
  let nameShow = '';
  try { nameShow = (await selfInfo()).nameShow; } catch { /* 没有也能发 */ }
  const body = encodeAddFloor({ tid, fid: bar.fid, kw, content, tbs: t, nameShow, bduss: getTiebaBduss() });
  const out = await postFloorBytes(body, 'rf');
  const result = parseAddPostResponse(out);
  if (result.errno) throw new Error(`贴吧拒绝：${result.errno} ${result.errmsg}`);
  return { ok: true, pid: result.pid, channel: 'app' };
}

/** 楼中楼回复（app protobuf）。 */
export async function replySub({ tid, kw, quoteId, subPostId, replyUid, content, replyName, replyPortrait }) {
  syncJar();
  const bar = await listBar(kw);
  const t = await tbs();
  let nameShow = '';
  try { nameShow = (await selfInfo()).nameShow; } catch { /* 没有也能发 */ }
  let text = content;
  if (subPostId) {
    const name = String(replyName || '').replace(/[()]/g, '');
    const portrait = String(replyPortrait || '');
    if (!name || !portrait) throw new Error('缺少被回复者的昵称/头像，无法挂楼');
    text = `回复 #(reply, ${portrait}, ${name}) :${content}`;
  }
  const body = encodeAddPost({
    tid, fid: bar.fid, kw, content: text, tbs: t, nameShow,
    bduss: getTiebaBduss(), quoteId, subPostId, replyUid,
  });
  const out = await postFloorBytes(body, 'rep');
  const result = parseAddPostResponse(out);
  if (result.errno) throw new Error(`贴吧拒绝：${result.errno} ${result.errmsg}`);
  return { ok: true, pid: result.pid, channel: 'app' };
}

/** 发新帖（手机版表单）。 */
export async function createThread({ kw, title, content }) {
  const t = String(title || '').trim();
  const c = String(content || '').trim();
  if (t.length < 4) throw new Error('标题太短（至少 4 个字）');
  if (t.length > 30) throw new Error('标题太长（压到 30 字内）');
  if (c.length < 10) throw new Error('正文太短（至少 10 个字）');
  if (c.length > 2000) throw new Error('正文太长（压到 2000 字内）');
  const bar = FID.has(String(kw)) ? { fid: FID.get(String(kw)) } : await listBar(kw);
  if (!bar.fid) throw new Error(`拿不到 ${kw} 的 fid（吧名对不对？）`);
  const tbsValue = await tbs();
  const { text } = await req(`${BASE}/f/commit/thread/add`, {
    method: 'POST',
    form: {
      ie: 'utf-8', kw: String(kw), fid: String(bar.fid), tbs: String(tbsValue),
      title: t, content: c, rich_text: '1', __type__: 'thread',
    },
    referer: `${BASE}/f?kw=${encodeURIComponent(kw)}`,
  });
  let json;
  try { json = JSON.parse(text); } catch { return { ok: false, raw: text.slice(0, 200) }; }
  const no = Number(json.no ?? -1);
  if (no !== 0) return { ok: false, no, error: json.error || json.err_code || '发帖失败' };
  return {
    ok: true, kw, fid: bar.fid,
    tid: json.data?.tid ? String(json.data.tid) : '',
    pid: json.data?.pid ? String(json.data.pid) : '',
  };
}

/** 签到（要求先关注该吧）。 */
export async function signForum(kw) {
  const t = await tbs();
  const { text } = await req(`${BASE}/sign/add`, {
    method: 'POST',
    form: { ie: 'utf-8', kw, tbs: t },
    referer: `${BASE}/f?kw=${encodeURIComponent(kw)}`,
  });
  let json;
  try { json = JSON.parse(text); } catch { return { ok: false, raw: text.slice(0, 200) }; }
  if (Number(json.no) !== 0 || Number(json.data?.errno) !== 0) {
    return { ok: false, kw, msg: json.data?.errmsg || json.error || '签到失败' };
  }
  return { ok: true, kw, count: json.data?.current_rank_info?.sign_count ?? null };
}

/** 点赞/取消点赞（app 签名接口；obj_type：1 楼层、3 主帖）。 */
export async function agreePost({ tid, pid = 0, objType, opType = 0 }) {
  const obj = Number(objType) || (pid ? 1 : 3);
  const t = await tbs();
  const json = await appPost('/c/c/agree/opAgree', {
    BDUSS: getTiebaBduss(),
    _client_version: '12.64.1.1',
    tbs: String(t),
    thread_id: String(tid),
    post_id: String(pid || 0),
    obj_type: String(obj),
    agree_type: '2',
    op_type: String(opType ? 1 : 0),
  });
  const code = Number(json?.error_code ?? 0);
  if (code !== 0) throw new Error(json?.error_msg || json?.error || `点赞失败（${code}）`);
  return { ok: true, threadId: String(tid), postId: String(pid || '') };
}

function decodeHtml(input) {
  return String(input)
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)));
}
