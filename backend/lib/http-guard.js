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
      if (size > limit) { reject(new Error('请求体过大')); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
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

/** 定长比较令牌：`!==` 会在第一个不同字符处短路，可被本机进程用响应时延逐字节试探。 */
export function safeEqual(a, b) {
  const left = Buffer.from(String(a ?? ''));
  const right = Buffer.from(String(b ?? ''));
  // 空令牌永不通过：`timingSafeEqual` 对两个空 buffer 返回 true，
  // 那样"还没生成令牌"就会被当成"令牌正确"。失败关闭。
  if (left.length === 0 || right.length === 0) return false;
  if (left.length !== right.length) return false;
  try {
    return timingSafeEqual(left, right);
  } catch {
    return false;
  }
}
