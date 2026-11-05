/**
 * 本机 HTTP 接口的通用护栏 —— 设置页 API（`/dsh-surfcore/api/*`）与
 * 桌宠 API（`/dsh-surfcore/pet-api/*`）共用**同一份**实现。
 *
 * 为什么单独一个模块：这两套接口的准入条件（只接受回环 Host、写操作必须同源、
 * 响应头固定）曾经在两个文件里各抄了一遍。安全判据复制多份的后果不是"重复代码不好看"，
 * 而是**将来只修一处**：放宽/收紧回环名单时漏掉另一份，缺口就会静默存在。
 * 所以这里只做一件事：把「这个请求能不能进」的判据收敛成唯一实现，改一处两处同时生效。
 *
 * 这些函数都**只读请求**、没有副作用，便于单测（`scripts/test-http-guard.mjs`）。
 */
import { timingSafeEqual } from 'node:crypto';

/** 统一的 JSON 响应（响应头固定 no-store；res 已关闭时不抛，交给上层日志）。 */
export function json(res, code, value) {
  try {
    res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(value));
  } catch {}
}

/** 读取请求体（有上限，超限直接断开）。默认 512KB（设置页 API 的既有口径；桌宠 API 传更小的 256KB）。 */
export function readBody(req, limit = 512 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        // 带上 statusCode：上层（lib/index.js 的 route catch）据此回 413，
        // 而不是把「请求体过大」当成 5xx 内部错误（以前用户只看到「服务器 500」）。
        const error = new Error('请求体过大');
        error.statusCode = 413;
        error.code = 'BODY_TOO_LARGE';
        reject(error);
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/**
 * 读请求体并按 JSON 解析（空体 → `{}`）。
 *
 * 为什么不各路由自己 `JSON.parse(await readBody(req) || '{}')`：那样解析失败会抛到
 * 统一 catch，变成 500 + 一段 V8 解析器原文（`Unexpected token } ...`）——
 * 设置页既拿不到可读提示，错误码也错了（这本该是 400 客户端错误）。
 * 这里把失败翻译成带 statusCode 的 Error，由上层统一回 400。
 */
export async function readJsonBody(req, limit) {
  const text = await readBody(req, limit);
  const raw = String(text ?? '').trim();
  if (!raw) return {};
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const error = new Error('请求体不是合法 JSON');
    error.statusCode = 400;
    error.code = 'BAD_JSON';
    throw error;
  }
  // 所有路由都按对象读 body（`body.action` / `body.qq`…）。如果客户端发了 `null` / 数组 /
  // 数字，后面的 `body.qq = …` 在 ESM 严格模式下会抛 TypeError 变成 500 —— 统一收敛成 {}，
  // 让路由自己的「缺参数」分支去回 400。
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
}

/**
 * 只接受本机回环访问。
 *
 * 判据是 **Host 请求头**而不是对端地址：DNS rebinding 场景下，页面把 evil.com
 * 解析到 127.0.0.1 时对端地址就是回环，只有 Host 还能认出真实来源。
 * 浏览器无法伪造 Host，所以这一层挡得住网页；挡不住本机进程——那一层由
 * DSH 的 `connection.requestRejection`（设置页 API）与 `x-pet-token`（桌宠 API）负责。
 */
export function isLoopbackReq(req) {
  const host = String(req.headers?.host ?? '').trim().toLowerCase();
  if (!host) return false;
  // IPv6 字面量在 Host 里是 `[::1]:8080`：`split(':')[0]` 只会拿到 `[`，
  // 于是原本写好的 `[::1]` / `::1` 分支成了永远走不到的死代码
  // （2026-10-26 审计：单测第一次跑出这个洞；DSH 若绑到 ::1，整套接口会 403）。
  const name = host.startsWith('[')
    ? (host.includes(']') ? host.slice(0, host.indexOf(']') + 1) : '')
    : host.split(':')[0];
  return name === '127.0.0.1' || name === 'localhost' || name === '[::1]' || host === '::1';
}

/**
 * 写操作的同源校验：带了 Origin 就必须与 Host 一致；**没带 Origin 视为通过**。
 *
 * 没带 Origin 的是非浏览器客户端（curl / 桌宠主进程）。浏览器对跨站 POST 一定会带
 * Origin，所以"浏览器发起的跨站写"必然落在这条判断里被拒。
 */
export function sameOrigin(req) {
  const origin = req.headers?.origin;
  if (!origin) return true;
  try {
    const originHost = new URL(String(origin)).host.toLowerCase();
    return originHost === String(req.headers?.host ?? '').toLowerCase();
  } catch {
    return false;
  }
}

/**
 * 请求是不是**浏览器**发出来的。
 *
 * 判据只用浏览器会强制附加、脚本无法伪造的头（Origin / Sec-Fetch-*），不看
 * User-Agent（UA 谁都能改）。curl、本机脚本、桌宠进程通常一个都不带。
 */
export function isBrowserRequest(req) {
  const headers = req.headers ?? {};
  if (headers.origin) return true;
  return Boolean(headers['sec-fetch-site'] || headers['sec-fetch-mode'] || headers['sec-fetch-dest']);
}

/**
 * 写接口的 Content-Type 是否可接受：`application/json`，允许带 charset 等参数。
 * 用「拆分后精确相等」而不是 `includes('application/json')` —— 后者会让
 * `text/plain; note=application/json` 这种冒充头也混过去。
 */
export function hasJsonContentType(req) {
  const raw = String(req.headers?.['content-type'] ?? '').trim().toLowerCase();
  return raw.split(';')[0].trim() === 'application/json';
}

/**
 * 写接口的 Content-Type 校验（**只对浏览器请求强制**）。
 *
 * 为什么放宽：这个判据原本对**所有** POST 生效，于是 curl / 本机脚本 / 文件回放
 * 这类不带 Content-Type 的合法调用会被 415 挡掉，用户以为服务坏了。真正要防的是
 * 浏览器里的跨站表单/文本提交（简单请求不需要预检就能打到本机端口），所以只对
 * 带浏览器信号的请求强制 JSON；非浏览器请求的 body 由 readJsonBody 按 JSON 解析，
 * 解析失败自然回 400，不会比之前更宽松（跨站写还另有一层 sameOrigin）。
 *
 * 返回 null 表示放行，否则返回给客户端的中文原因。
 */
export function contentTypeRejection(req) {
  if (req.method === 'GET' || req.method === 'HEAD') return null;
  if (!isBrowserRequest(req)) return null;
  if (hasJsonContentType(req)) return null;
  return '写操作必须是 application/json';
}

/** 定长比较令牌：`!==` 会在第一个不同字符处短路，可被本机进程用响应时延逐字节试探。 */
export function safeEqual(a, b) {
  const left = Buffer.from(String(a ?? ''));
  const right = Buffer.from(String(b ?? ''));  // 空令牌永不通过：`timingSafeEqual` 对两个空 buffer 返回 true，
  // 那样"还没生成令牌"就会被当成"令牌正确"。失败关闭。
  if (left.length === 0 || right.length === 0) return false;
  if (left.length !== right.length) return false;
  try {
    return timingSafeEqual(left, right);
  } catch {
    return false;
  }
}
