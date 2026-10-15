// tools/expr-smoke.mjs —— 表情包（素材清单 + 图片路由 + 配置键）冒烟测试
//
// 为什么需要它：`tools/ci-audit.mjs` 只能证明「路由注册了、前端引用的路径存在」，
// 证明不了「清单真的扫到了素材包目录」「不存在的文件不会被列出来」「路径穿越会被挡住」
// 「ETag 真的回 304」「新增的三个配置键在 PUT 缺字段时不会被洗成默认值」——
// 这些都属于"错了不会报错、只会静默失效"的那一类，所以要有一份能跑的用例。
//
// 用法（0 依赖，只用 node:fs / node:path / node:os）：
//   node tools/expr-smoke.mjs            # 用临时 $DSH_HOME 跑，不碰你真实的 ~/.dsh
//   DSH_HOME=/your/home node tools/expr-smoke.mjs
//
// 它 mock 了宿主 ctx（webServer/credentials/effect/on/inject），只驱动 lib/index.js
// 注册出来的路由 handler，不启动任何服务器、不联网、不写真实 DSH_HOME。
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// —— 1×1 透明 PNG（zlib 预压缩好的最小合法 PNG，避免依赖任何图像库）——
const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
)

const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'dshw-expr-smoke-'))
process.env.DSH_HOME = tmpHome

const packDir = path.join(tmpHome, 'whale-expressions', 'testpack')
fs.mkdirSync(packDir, { recursive: true })
for (const f of ['main.png', 'half.png', 'closed.png', 'angry.png']) {
  fs.writeFileSync(path.join(packDir, f), PNG_1x1)
}
fs.writeFileSync(path.join(packDir, 'pack.json'), JSON.stringify({
  id: 'testpack',
  label: '冒烟测试包',
  main: 'main.png',
  blink: { half: 'half.png', closed: 'closed.png' },
  moods: { angry: 'angry.png', shy: 'missing.png' }, // shy 指向不存在的文件 → 必须被过滤掉
  cute: ['main.png', 'ghost.png'],                   // ghost 不存在 → 必须被过滤掉
  labels: { angry: '生气' },
}, null, 2))

// 另放一个非法包 id 的目录（含路径分隔符不可能，这里用超长/下划线以外字符）验证 id 白名单
const badDir = path.join(tmpHome, 'whale-expressions', 'bad id!')
fs.mkdirSync(badDir, { recursive: true })
fs.writeFileSync(path.join(badDir, 'pack.json'), JSON.stringify({ id: 'bad id!', main: 'main.png' }))
fs.writeFileSync(path.join(badDir, 'main.png'), PNG_1x1)

// —— mock 宿主 ——
const routes = new Map()
let indexTap = null
const disposers = []

function makeRes() {
  const res = {
    status: 0,
    headers: null,
    body: null,
    ended: false,
    writeHead(code, headers) { res.status = code; res.headers = headers || {}; return res },
    end(body) { res.body = body === undefined ? null : body; res.ended = true },
  }
  return res
}
function makeReq(method, url, headers, body) {
  const listeners = {}
  const req = {
    method, url,
    headers: Object.assign({ host: '127.0.0.1:3080' }, headers || {}),
    on(ev, cb) { (listeners[ev] = listeners[ev] || []).push(cb); return req },
    destroy() {},
  }
  req.__emit = () => {
    if (body !== undefined && body !== null) for (const cb of listeners.data || []) cb(Buffer.from(body))
    for (const cb of listeners.end || []) cb()
  }
  return req
}
async function call(pathname, { method = 'GET', query = '', headers = {}, body = null } = {}) {
  const route = routes.get(pathname)
  if (!route) throw new Error('route not registered: ' + pathname)
  const req = makeReq(method, pathname + query, headers, body)
  const res = makeRes()
  const p = Promise.resolve(route.handler(req, res))
  req.__emit()
  await p
  return res
}
function parseJson(res) {
  try { return JSON.parse(String(res.body)) } catch (err) { return null }
}

const ctx = {
  webServer: {
    register(route) { routes.set(route.path, route); return () => routes.delete(route.path) },
    tapIndex(fn) { indexTap = fn; return () => { indexTap = null } },
    port: 3080,
  },
  credentials: { async resolve() { return null }, async set() {}, async delete() {} },
  on() { return () => {} },
  effect(cb) { const d = cb(); if (typeof d === 'function') disposers.push(d); return () => {} },
  get() { return undefined },
}
const root = {
  on() { return () => {} },
  effect(cb) { const d = cb(); if (typeof d === 'function') disposers.push(d); return () => {} },
  inject(deps, cb) { cb(ctx) },
}

const results = []
function check(name, cond, extra) {
  results.push({ name, ok: !!cond, extra: extra === undefined ? '' : String(extra) })
}

const mod = await import('../lib/index.js')
const plugin = mod.default
check('插件默认导出带 apply', plugin && typeof plugin.apply === 'function')
plugin.apply(root)

// —— 用例 1：路由注册齐了 ——
check('注册了 /dsh-whale/expr-packs.json', routes.has('/dsh-whale/expr-packs.json'))
check('注册了 /dsh-whale/expr.png', routes.has('/dsh-whale/expr.png'))
check('注册了 /dsh-whale/size.json', routes.has('/dsh-whale/size.json'))

// —— 用例 2：清单只列真实存在的文件，且过滤非法包 id ——
// 注意：候选目录包含**包内** assets/<id>/（plus 的四版素材就放在 assets/v1..v4），
// 所以这里按 id 取用测试包，而不是断言"只有 1 个包"。
const packsRes = await call('/dsh-whale/expr-packs.json')
const packsJson = parseJson(packsRes)
check('expr-packs.json 回 200 + JSON', packsRes.status === 200 && packsJson && packsJson.ok === true, packsRes.status)
const allPacks = (packsJson && packsJson.packs) || []
const pack = allPacks.find((p) => p.id === 'testpack')
check('扫到了测试包', !!pack, allPacks.map((p) => p.id).join(','))
check('非法 id 目录被忽略', !allPacks.some((p) => p.id === 'bad id!'), allPacks.map((p) => p.id).join(','))
check('包元数据正确', pack && pack.label === '冒烟测试包')
check('moods 过滤掉不存在的文件', pack && pack.moods.angry === 'angry.png' && !pack.moods.shy, pack && JSON.stringify(pack.moods))
check('cute 过滤掉不存在的文件且去重', pack && pack.cute.length === 1 && pack.cute[0] === 'main.png', pack && JSON.stringify(pack.cute))
check('blink 两帧都在', pack && pack.blink.half === 'half.png' && pack.blink.closed === 'closed.png')
check('labels 透传（语义键会被翻译成文件名）', pack && pack.labels['angry.png'] === '生气', pack && JSON.stringify(pack.labels))
check('images 只含真实存在的文件', pack && pack.images.length === 4 && pack.images.indexOf('ghost.png') === -1, pack && JSON.stringify(pack.images))
check('清单不泄漏宿主目录', pack && pack.dir === undefined)

// —— 用例 3：图片路由 + ETag 协商缓存 ——
const imgRes = await call('/dsh-whale/expr.png', { query: '?pack=testpack&name=angry.png' })
check('expr.png 回 200 image/png', imgRes.status === 200 && imgRes.headers['Content-Type'] === 'image/png', imgRes.status)
check('expr.png 回了 ETag', !!(imgRes.headers && imgRes.headers.ETag), imgRes.headers && imgRes.headers.ETag)
check('expr.png 字节与源文件一致', imgRes.body && Buffer.compare(Buffer.from(imgRes.body), PNG_1x1) === 0)
const etag = imgRes.headers && imgRes.headers.ETag
const img304 = await call('/dsh-whale/expr.png', { query: '?pack=testpack&name=angry.png', headers: { 'if-none-match': etag } })
check('If-None-Match 命中回 304 且无 body', img304.status === 304 && !img304.body, img304.status)

// —— 用例 4：非法输入一律 404（不区分"包不存在/文件不存在/穿越"）——
const bad1 = await call('/dsh-whale/expr.png', { query: '?pack=nope&name=angry.png' })
const bad2 = await call('/dsh-whale/expr.png', { query: '?pack=testpack&name=missing.png' })
const bad3 = await call('/dsh-whale/expr.png', { query: '?pack=testpack&name=..%2F..%2Fpackage.json' })
const bad4 = await call('/dsh-whale/expr.png', { query: '?pack=testpack&name=' })
check('未知包回 404', bad1.status === 404, bad1.status)
check('未声明的文件回 404', bad2.status === 404, bad2.status)
check('路径穿越回 404', bad3.status === 404, bad3.status)
check('缺 name 回 404', bad4.status === 404, bad4.status)

// —— 用例 5：新增配置键的读写与「缺字段沿用旧值」保护 ——
const put1 = await call('/dsh-whale/size.json', {
  method: 'PUT',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ scale: 1.5, exprPack: 'testpack', exprOn: true, blinkOn: false }),
})
const put1Json = parseJson(put1)
check('size.json PUT 成功且回显新键', put1.status === 200 && put1Json && put1Json.ok === true &&
  put1Json.exprPack === 'testpack' && put1Json.exprOn === true && put1Json.blinkOn === false,
  put1.status + ' ' + JSON.stringify(put1Json))

const put2 = await call('/dsh-whale/size.json', {
  method: 'PUT',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ scale: 1.6 }),
})
const got = parseJson(await call('/dsh-whale/size.json'))
check('缺字段的 PUT 不会洗掉表情配置', put2.status === 200 && got && got.exprPack === 'testpack' &&
  got.exprOn === true && got.blinkOn === false, JSON.stringify(got))
check('缺字段的 PUT 仍会更新 scale', got && Math.abs(got.scale - 1.6) < 1e-6, got && got.scale)

const put3 = await call('/dsh-whale/size.json', {
  method: 'PUT',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ scale: 1.6, exprOn: false, exprPack: '', blinkOn: true }),
})
const got3 = parseJson(await call('/dsh-whale/size.json'))
check('可以关掉表情层（exprOn=false）', put3.status === 200 && got3 && got3.exprOn === false, JSON.stringify(got3))
// 显式传空串 = 「清除选择」（前端「自动」那一项就是发空串）。
// 注意这与 pickS 的语义**故意不同**：pickS 会把空串当成"本次没给"而沿用旧值，那样一旦选过就回不到自动。
check('显式空串可清除选择', got3 && got3.exprPack === '', got3 && JSON.stringify(got3.exprPack))

// 再选回一个合法包，确认清除之后还能重新选中
await call('/dsh-whale/size.json', {
  method: 'PUT',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ scale: 1.6, exprPack: 'testpack' }),
})
const got4 = parseJson(await call('/dsh-whale/size.json'))
check('清除后仍可重新选中合法包', got4 && got4.exprPack === 'testpack', got4 && got4.exprPack)

// 非法包 id（含空格与 !，不满足 ^[A-Za-z0-9_-]{1,32}$）必须写不进去 —— 宿主归一成 ''
await call('/dsh-whale/size.json', {
  method: 'PUT',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ scale: 1.6, exprPack: 'bad id!' }),
})
const got5 = parseJson(await call('/dsh-whale/size.json'))
check('非法包 id 被归一成空串', got5 && got5.exprPack === '', got5 && got5.exprPack)

// —— 用例 6：注入行仍在（桌面端唯一通道，别被这次改动碰坏）——
check('tapIndex 仍然注册并可注入 widget.js', typeof indexTap === 'function' &&
  String(indexTap('<html><body></body></html>')).indexOf('/dsh-whale/widget.js') !== -1)

// —— 收尾 ——
try { fs.rmSync(tmpHome, { recursive: true, force: true }) } catch (err) {}

let failed = 0
for (const r of results) {
  if (!r.ok) failed++
  console.log((r.ok ? '  ok  ' : '  FAIL') + '  ' + r.name + (r.ok || !r.extra ? '' : '   → ' + r.extra))
}
console.log(failed === 0
  ? `\n✔ 表情包冒烟测试全部通过（${results.length} 项）`
  : `\n× 有 ${failed} 项不通过（共 ${results.length} 项）`)
process.exit(failed === 0 ? 0 : 1)
