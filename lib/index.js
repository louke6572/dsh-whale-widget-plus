import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

// Package root: lib/index.js -> package root. Keeps the bundle relocatable
// when installed as a normal DSH npm plugin (node_modules or a local link).
const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// DSH home: used for the widget size/usage memory files, since node_modules may
// be read-only or cleaned on update.
const DSH_HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')

// Whale image: package-relative first, legacy absolute paths as fallback.
const IMAGE_CANDIDATES = [
  path.join(PACKAGE_ROOT, 'assets', 'DSniang1.png'),
  path.join(PACKAGE_ROOT, 'assets', 'DSniang02.png'),
  'D:/TestBox/deepseek/DSniang1.png',
  'D:/TestBox/deepseek/DSniang02.png',
  'D:/TestBox/deepseek/skin/DSniang02.png',
]

// Size memory file: prefer writable DSH home locations, then legacy fallbacks.
const SIZE_FILE_CANDIDATES = [
  path.join(DSH_HOME, '.dshw-size.json'),
  path.join(DSH_HOME, 'profiles', 'web', '.dshw-size.json'),
  'D:/TestBox/deepseek/.dshw-size.json',
  'D:/TestBox/deepseek/skin/.dshw-size.json',
]

// Usage ledger file (小鲸鱼记账 mode): same policy as the size file.
const USAGE_FILE_CANDIDATES = [
  path.join(DSH_HOME, '.dshw-usage.json'),
  path.join(DSH_HOME, 'profiles', 'web', '.dshw-usage.json'),
  'D:/TestBox/deepseek/.dshw-usage.json',
  'D:/TestBox/deepseek/skin/.dshw-usage.json',
]

// Sound assets: package-relative first (ship Ya1/Ya2/D1/D2.mp3 in assets/ for
// sounds out of the box), legacy paths as fallback.
const SOUND_SETS = {
  duck: {
    press: [path.join(PACKAGE_ROOT, 'assets', 'Ya1.mp3'), 'D:/TestBox/deepseek/skin/Ya1.mp3'],
    release: [path.join(PACKAGE_ROOT, 'assets', 'Ya2.mp3'), 'D:/TestBox/deepseek/skin/Ya2.mp3'],
  },
  fx1: {
    press: [path.join(PACKAGE_ROOT, 'assets', 'D1.mp3'), 'D:/TestBox/deepseek/skin/D1.mp3'],
    release: [path.join(PACKAGE_ROOT, 'assets', 'D2.mp3'), 'D:/TestBox/deepseek/skin/D2.mp3'],
  },
}
function soundSetFromUrl(url) {
  try {
    const q = String(url || '').split('?')[1] || ''
    const m = /(?:^|&)set=([^&]+)/.exec(q)
    const val = m ? decodeURIComponent(m[1]) : ''
    return val === 'fx1' ? 'fx1' : 'duck'
  } catch (err) { return '' }
}
const BALANCE_URL = 'https://api.deepseek.com/user/balance'
const BALANCE_TTL_MS = 25000
const RUA_GIF_CANDIDATES = [
  path.join(PACKAGE_ROOT, 'assets', 'rua.gif'),
  'D:/TestBox/deepseek/skin/rua.gif',
  'D:/TestBox/deepseek/rua.gif',
]
// DeepSeek CNY prices per million tokens: [空闲时段价, 高峰时段价].
// 高峰时段：每日 9:00–12:00 和 14:00–18:00（北京时间）。Adjust here if DeepSeek changes pricing.
const PEAK_HOURS = [
  [9, 12],
  [14, 18],
]
const BASE_PRICE = { hit: [0.05, 0.1], miss: [1.5, 3.0], out: [4.5, 9.0] }
const PRICING = {
  'deepseek-chat': BASE_PRICE,
  'deepseek-reasoner': BASE_PRICE,
  'deepseek-v4-flash': BASE_PRICE,
  'deepseek-v4-pro': BASE_PRICE,
  _default: BASE_PRICE,
}
function priceFor(model) {
  const m = String(model || '').toLowerCase()
  for (const key of Object.keys(PRICING)) {
    if (key === '_default') continue
    if (m.indexOf(key) !== -1) return PRICING[key]
  }
  return PRICING._default
}
// bucket time is an epoch second; derive the Beijing local hour to pick peak vs off-peak price.
function isPeakTime(timeSec) {
  if (!isFinite(Number(timeSec))) return false
  const hour = new Date(Number(timeSec) * 1000 + 8 * 3600 * 1000).getUTCHours()
  for (const [start, end] of PEAK_HOURS) {
    if (hour >= start && hour < end) return true
  }
  return false
}

const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Cache-Control': 'no-store',
}

const WIDGET_JS = `(function () {
if (window.__dshWhaleWidget) return
window.__dshWhaleWidget = true

var exprVer = 'v2'
try { var _ev = localStorage.getItem('dsh-whale-expr-ver'); if (_ev === 'v1' || _ev === 'v2' || _ev === 'v3' || _ev === 'v4') exprVer = _ev } catch (err) {}

var MIN_SCALE = 0.6
var MAX_SCALE = 2.5
var STEP = 0.1
var CLICK_SQ = 9
var REFRESH_MS = 60000
var CHANGE_MS = 900
var ANIM_MS = 700
var BUBBLE_MS = 5000
var FETCH_TIMEOUT_MS = 25000
var BALANCE_URL = '/dsh-whale/balance.json'
var SIZE_URL = '/dsh-whale/size.json'
var IMG_URL = function () { return '/dsh-whale/image.png?ver=' + exprVer }
var GIF_URL = '/dsh-whale/rua.gif'

var css = [
  '.dshwv-root{position:fixed;right:0;bottom:0;--dshw-scale:1;--dshw-base:clamp(122px,calc(min(250px,min(100vw,100vh) * 0.28) * var(--dshw-scale)),625px);width:var(--dshw-base);height:var(--dshw-base);pointer-events:none;user-select:none;-webkit-user-select:none;z-index:9999;font-family:inherit;transition:left .16s ease,top .16s ease,transform .3s ease}',
  '.dshwv-root.dshwv-left{transform:scaleX(-1)}',
  '.dshwv-root.dshwv-dragging{cursor:grabbing;transition:none}',
  '.dshwv-body{position:absolute;left:0;top:0;width:100%;height:100%;transform-origin:50% 100%;transition:transform .22s cubic-bezier(.34,1.56,.64,1)}',
  '.dshwv-img{position:absolute;right:0;bottom:0;width:59.45%;height:59.45%;display:block;pointer-events:none;-webkit-user-drag:none;user-select:none}',
  '.dshwv-bubble{position:absolute;left:0;top:0;width:100%;aspect-ratio:1026/700;pointer-events:none;z-index:1;--dshw-u:calc(var(--dshw-base) / 1026)}',
  '.dshwv-bubble svg{display:block;width:100%;height:100%;pointer-events:none}',
  '.dshwv-bubble svg path,.dshwv-bubble svg ellipse{pointer-events:none;cursor:pointer}',
  '.dshwv-bubble.dshwv-bubble-open svg path,.dshwv-bubble.dshwv-bubble-open svg ellipse{pointer-events:visiblePainted}',
  '.dshwv-bubble .dshwv-bshape,.dshwv-bubble .dshwv-b1,.dshwv-bubble .dshwv-b2{opacity:0;transform:scale(.7);transform-box:fill-box;transform-origin:50% 50%;transition:opacity .2s ease,transform .2s ease}',
  '.dshwv-bubble.dshwv-bubble-open .dshwv-bshape,.dshwv-bubble.dshwv-bubble-open .dshwv-b1,.dshwv-bubble.dshwv-bubble-open .dshwv-b2{opacity:1;transform:none}',
  '.dshwv-gif{position:absolute;left:44.25%;top:38%;transform:translate(-50%,-50%);max-width:calc(var(--dshw-u) * 560);max-height:calc(var(--dshw-u) * 400);display:none;opacity:0;transition:opacity .2s ease;pointer-events:none;-webkit-user-drag:none;user-select:none;object-fit:contain}',
  '.dshwv-root.dshwv-left .dshwv-gif{transform:translate(-50%,-50%) scaleX(-1)}',
  '.dshwv-bubble.dshwv-bubble-open .dshwv-gif{opacity:1}',
  '.dshwv-bubble.dshwv-bubble-open .dshwv-b2{transition-delay:0s}',
  '.dshwv-bubble.dshwv-bubble-open .dshwv-b1{transition-delay:.13s}',
  '.dshwv-bubble.dshwv-bubble-open .dshwv-bshape{transition-delay:.26s}',
  '.dshwv-bubble .dshwv-bshape{transition-delay:.1s}',
  '.dshwv-bubble .dshwv-b1{transition-delay:.2s}',
  '.dshwv-bubble .dshwv-b2{transition-delay:.3s}',
  '.dshwv-text{position:absolute;left:44.25%;top:38%;transform:translate(-50%,-50%);text-align:center;color:#536ba9;line-height:1.15;white-space:nowrap;pointer-events:none;opacity:0;transition:opacity .16s ease,transform .3s ease}',
  '.dshwv-bubble.dshwv-bubble-open .dshwv-text{opacity:1;transition:opacity .16s ease .36s,transform .3s ease}',
  '.dshwv-root.dshwv-left .dshwv-text{transform:translate(-50%,-50%) scaleX(-1)}',
  '.dshwv-label{font-size:calc(var(--dshw-u) * 66);font-weight:600;letter-spacing:.06em}',
  '.dshwv-amount{font-size:calc(var(--dshw-u) * 128);font-weight:800;line-height:1.05}',
  '.dshwv-period{font-size:calc(var(--dshw-u) * 104);font-weight:800;line-height:1.05}',
  '.dshwv-wrap{white-space:normal;max-width:calc(var(--dshw-u) * 560);line-height:1.2}',
  '.dshwv-hint{font-size:calc(var(--dshw-u) * 56);color:#9fb0d9;letter-spacing:.02em;margin-top:calc(var(--dshw-u) * 9);min-height:calc(var(--dshw-u) * 64);line-height:1.15}',
  '.dshwv-menu-btn{position:absolute;top:calc(40.55% + 4px);right:4px;width:26px;height:26px;border:none;border-radius:6px;background:rgba(32,49,112,.85);cursor:pointer;pointer-events:auto;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;padding:0;z-index:2;opacity:0;transition:opacity .15s ease}',
  '.dshwv-menu-btn.dshwv-menu-btn-visible{opacity:1}',
  '.dshwv-menu-btn span{display:block;width:14px;height:2px;background:#fff;border-radius:1px}',
  '.dshwv-menu-btn:hover{background:#203170}',
  '.dshwv-menu{position:fixed;min-width:172px;background:rgba(255,255,255,.92);border:1px solid rgba(32,49,112,.35);border-radius:10px;padding:10px 12px;opacity:0;transform:scale(.92) translateY(-4px);transform-origin:top right;transition:opacity .18s ease,transform .2s cubic-bezier(.34,1.56,.64,1);pointer-events:none;z-index:10000;box-shadow:0 6px 18px rgba(0,0,0,.18);color-scheme:light}',
  '.dshwv-menu.dshwv-menu-open{opacity:1;transform:scale(1) translateY(0);pointer-events:auto}',
  '.dshwv-menu-row{display:flex;align-items:center;gap:8px;margin:5px 0;color:#203170;font-size:12px;white-space:nowrap}',
  '.dshwv-range{flex:1;min-width:0;accent-color:#203170}',
  '.dshwv-number{width:46px;border:1px solid rgba(32,49,112,.4);border-radius:6px;padding:2px 4px;font-size:12px;color:#203170;background:#fff}',
  '.dshwv-sound{flex:1;border:1px solid rgba(32,49,112,.4);border-radius:6px;background:rgba(32,49,112,.08);color:#203170;font-size:12px;padding:3px 0;cursor:pointer}',
  '.dshwv-sound:hover{background:rgba(32,49,112,.16)}',
  '.dshwv-check{width:16px;height:16px;accent-color:#203170;cursor:pointer;flex:0 0 auto}',
  '.dshwv-menu-sep{height:1px;background:rgba(32,49,112,.25);margin:6px 0}',
  '.dshwv-dialog-panel{padding:6px 8px;background:rgba(32,49,112,.06);border-radius:8px;margin-top:4px}',
  '.dshwv-dialog-list{max-height:110px;overflow-y:auto}',
  '.dshwv-volpct{width:36px;text-align:right;color:#203170;font-size:12px}'
].join('\\n')

var styleEl = document.createElement('style')
styleEl.textContent = css
document.head.appendChild(styleEl)

var root = document.createElement('div')
root.className = 'dshwv-root'

var img = document.createElement('img')
img.className = 'dshwv-img'
img.src = IMG_URL()
img.alt = 'DeepSeek 余额'
img.draggable = false
// 图片加载失败：清缓存标记，1.5s 后重试期望图。
// 正常运行中 exprSetImg 只会赋值已确认加载的 URL，此兜底主要覆盖初始图。
img.addEventListener('error', function () {
  __curImgSrc = ''
  try { delete __imgLoaded[__wantImgSrc]; delete __imgLoaded[img.src] } catch (err) {}
  setTimeout(function () {
    if (__curImgSrc !== '') return
    var target = __wantImgSrc || (img && img.getAttribute('src'))
    if (target) img.src = target
  }, 1500)
})

var menuBtn = document.createElement('button')
menuBtn.type = 'button'
menuBtn.className = 'dshwv-menu-btn'
menuBtn.title = '菜单'
menuBtn.innerHTML = '<span></span><span></span><span></span>'
menuBtn.addEventListener('click', function (e) { e.stopPropagation(); toggleMenu() })

var menuBox = document.createElement('div')
menuBox.className = 'dshwv-menu'
function menuLabel(text) {
  var s = document.createElement('span')
  s.textContent = text
  return s
}
function menuRow() {
  var r = document.createElement('div')
  r.className = 'dshwv-menu-row'
  return r
}
var scaleInput = document.createElement('input')
scaleInput.type = 'range'
scaleInput.min = String(MIN_SCALE)
scaleInput.max = String(MAX_SCALE)
scaleInput.step = '0.1'
scaleInput.className = 'dshwv-range'
scaleInput.value = '1.5'
var scaleNumber = document.createElement('input')
scaleNumber.type = 'number'
scaleNumber.min = '1'
scaleNumber.max = '20'
scaleNumber.step = '1'
scaleNumber.className = 'dshwv-number'
scaleNumber.value = '10'
scaleInput.addEventListener('pointerdown', function () { root.style.transition = 'none' })
scaleInput.addEventListener('input', function () { setScale(scaleInput.value) })
scaleInput.addEventListener('change', function () { root.style.transition = '' })
scaleNumber.addEventListener('change', function () {
  var v = Math.round(Number(scaleNumber.value))
  var s = MIN_SCALE + Math.max(0, Math.min(20, v) - 1) * (MAX_SCALE - MIN_SCALE) / 19
  setScale(s)
  root.style.transition = ''
})
var soundSelect = document.createElement('select')
soundSelect.className = 'dshwv-sound'
function soundOpt(value, label) {
  var o = document.createElement('option')
  o.value = value
  o.textContent = label
  return o
}
soundSelect.appendChild(soundOpt('duck', '小黄鸭'))
soundSelect.appendChild(soundOpt('fx1', '音效1'))
soundSelect.addEventListener('change', function () { setSoundSet(soundSelect.value) })
var usageSelect = document.createElement('select')
usageSelect.className = 'dshwv-sound'
usageSelect.appendChild(soundOpt('0', '跟随激活账号'))
usageSelect.appendChild(soundOpt('1', '账号 1'))
usageSelect.appendChild(soundOpt('2', '账号 2'))
usageSelect.appendChild(soundOpt('-1', 'DeepSeek 余额'))
usageSelect.addEventListener('change', function () {
  var v = usageSelect.value
  selectedAccountIdx = (v === '-1') ? -1 : (Number(v) || 0)
  try { localStorage.setItem('dsh-whale-usage-acct', v) } catch (err) {}
  // DeepSeek 模式下用 ¥ 格式化
  state.currency = (selectedAccountIdx === -1) ? 'CNY' : '%'
  shown = null
  refresh(true)
})
var peakSelect = document.createElement('select')
peakSelect.className = 'dshwv-sound'
peakSelect.appendChild(soundOpt('default', '默认'))
peakSelect.appendChild(soundOpt('liangwen', '梁文峰谷'))
peakSelect.appendChild(soundOpt('qiangqiang', '!?强强?!'))
peakSelect.addEventListener('change', function () { setPeakMode(peakSelect.value) })
var bubbleToggle = document.createElement('input')
bubbleToggle.type = 'checkbox'
bubbleToggle.className = 'dshwv-check'
bubbleToggle.checked = true
bubbleToggle.title = '开启/关闭思考气泡'
bubbleToggle.addEventListener('change', function () { setBubbleOn(bubbleToggle.checked) })
var turnCostToggle = document.createElement('input')
turnCostToggle.type = 'checkbox'
turnCostToggle.className = 'dshwv-check'
turnCostToggle.checked = true
turnCostToggle.title = '每轮对话结束后自动显示本轮消耗金额'
turnCostToggle.addEventListener('change', function () { setTurnCostOn(turnCostToggle.checked) })
var turnCostCloseInput = document.createElement('input')
turnCostCloseInput.type = 'number'
turnCostCloseInput.min = '0'
turnCostCloseInput.step = '1'
turnCostCloseInput.className = 'dshwv-number'
turnCostCloseInput.value = '5'
turnCostCloseInput.title = '填 0 表示不自动关闭，需手动点击关闭'
turnCostCloseInput.addEventListener('change', function () { setTurnCostClose(turnCostCloseInput.value) })
var row1 = menuRow()
row1.appendChild(menuLabel('大小'))
row1.appendChild(scaleInput)
row1.appendChild(scaleNumber)
var row2 = menuRow()
row2.appendChild(menuLabel('音效'))
row2.appendChild(soundSelect)
var volInput = document.createElement('input')
volInput.type = 'range'
volInput.min = '0'
volInput.max = '1'
volInput.step = '0.05'
volInput.className = 'dshwv-range'
volInput.value = '0.9'
var volPct = document.createElement('span')
volPct.className = 'dshwv-volpct'
volPct.textContent = '90%'
volInput.addEventListener('input', function () { setVol(volInput.value) })
var row3 = menuRow()
row3.appendChild(menuLabel('音量'))
row3.appendChild(volInput)
row3.appendChild(volPct)
var row4 = menuRow()
row4.appendChild(menuLabel('账号'))
row4.appendChild(usageSelect)
var row5 = menuRow()
row5.appendChild(menuLabel('峰谷'))
row5.appendChild(peakSelect)
var row6 = menuRow()
row6.appendChild(menuLabel('气泡'))
row6.appendChild(bubbleToggle)
var menuSep1 = document.createElement('div')
menuSep1.className = 'dshwv-menu-sep'
var row7 = menuRow()
row7.appendChild(menuLabel('每轮消耗'))
row7.appendChild(turnCostToggle)
var row8 = menuRow()
row8.appendChild(menuLabel('自动关闭时间'))
row8.appendChild(turnCostCloseInput)
row8.appendChild(menuLabel('秒'))
menuBox.appendChild(row1)
menuBox.appendChild(row2)
menuBox.appendChild(row3)
menuBox.appendChild(row4)
menuBox.appendChild(row5)
menuBox.appendChild(row6)
menuBox.appendChild(menuSep1)
menuBox.appendChild(row7)
menuBox.appendChild(row8)

// ===== 自定义台词（从桌面版移植）=====
var customDialogue = { lines: [], mode: 'random' } // mode: random | carousel
var carouselIdx = 0
function loadCustomDialogue() {
  try {
    var raw = localStorage.getItem('dsh-whale-dialogue')
    if (!raw) return
    var obj = JSON.parse(raw)
    if (obj && Array.isArray(obj.lines)) customDialogue = { lines: obj.lines.filter(function (l) { return typeof l === 'string' && l.trim() }), mode: obj.mode === 'carousel' ? 'carousel' : 'random' }
  } catch (err) {}
}
function saveCustomDialogue() {
  try {
    localStorage.setItem('dsh-whale-dialogue', JSON.stringify(customDialogue))
  } catch (err) {}
}
loadCustomDialogue()
function pickCustomLine() {
  if (!customDialogue.lines.length) return null
  if (customDialogue.mode === 'carousel') {
    var line = customDialogue.lines[carouselIdx % customDialogue.lines.length]
    carouselIdx = (carouselIdx + 1) % customDialogue.lines.length
    return line
  }
  return customDialogue.lines[Math.floor(Math.random() * customDialogue.lines.length)]
}
// ===== 台词管理面板（从桌面版移植）=====
var dialogueRow = menuRow()
var dialogueBtn = document.createElement('button')
dialogueBtn.type = 'button'
dialogueBtn.className = 'dshwv-sound'
dialogueBtn.textContent = '编辑台词'
var dialogueHint = menuLabel('台词')
var dlgPanel = document.createElement('div')
dlgPanel.className = 'dshwv-dialog-panel'
var dlgList = document.createElement('div')
dlgList.className = 'dshwv-dialog-list'
var dlgInput = document.createElement('input')
dlgInput.type = 'text'
dlgInput.className = 'dshwv-number'
dlgInput.placeholder = '输入新台词…'
dlgInput.style.flex = '1'
var dlgAddBtn = document.createElement('button')
dlgAddBtn.type = 'button'
dlgAddBtn.className = 'dshwv-sound'
dlgAddBtn.textContent = '添加'
var dlgModeSel = document.createElement('select')
dlgModeSel.className = 'dshwv-sound'
dlgModeSel.appendChild(soundOpt('random', '随机'))
dlgModeSel.appendChild(soundOpt('carousel', '轮播'))
dlgModeSel.value = customDialogue.mode
dlgModeSel.addEventListener('change', function () { customDialogue.mode = dlgModeSel.value; saveCustomDialogue() })
var dlgResetBtn = document.createElement('button')
dlgResetBtn.type = 'button'
dlgResetBtn.className = 'dshwv-sound'
dlgResetBtn.textContent = '清空自定义'
function dlgRenderList() {
  dlgList.textContent = ''
  if (!customDialogue.lines.length) {
    var empty = document.createElement('div')
    empty.style.cssText = 'font-size:11px;color:#7a8bb5;padding:2px 0'
    empty.textContent = '（无自定义台词，使用内置台词）'
    dlgList.appendChild(empty)
    return
  }
  customDialogue.lines.forEach(function (line, i) {
    var rowD = document.createElement('div')
    rowD.style.cssText = 'display:flex;gap:4px;align-items:center;margin:2px 0'
    var txt = document.createElement('span')
    txt.style.cssText = 'flex:1;font-size:11px;color:#203170;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer'
    txt.textContent = (i + 1) + '. ' + line
    txt.title = '点击修改这条台词'
    // 点击文本 → 变成输入框就地编辑（回车保存，Esc 取消，失焦保存）
    txt.addEventListener('click', function () {
      if (rowD.querySelector('input.dlg-edit')) return
      var edit = document.createElement('input')
      edit.type = 'text'
      edit.className = 'dshwv-number dlg-edit'
      edit.value = line
      edit.style.cssText = 'flex:1;min-width:0;font-size:11px'
      rowD.replaceChild(edit, txt)
      edit.focus()
      edit.select()
      var done = false
      function commit() {
        if (done) return
        done = true
        var v = (edit.value || '').trim()
        if (v && v !== line) customDialogue.lines[i] = v
        saveCustomDialogue()
        dlgRenderList()
      }
      edit.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter') { ev.preventDefault(); commit() }
        else if (ev.key === 'Escape') { done = true; dlgRenderList() }
        ev.stopPropagation()
      })
      edit.addEventListener('blur', commit)
      edit.addEventListener('click', function (ev) { ev.stopPropagation() })
    })
    var del = document.createElement('button')
    del.type = 'button'
    del.className = 'dshwv-sound'
    del.textContent = '删'
    del.style.cssText = 'flex:0 0 auto;padding:1px 8px'
    del.addEventListener('click', function () {
      customDialogue.lines.splice(i, 1)
      saveCustomDialogue()
      dlgRenderList()
    })
    rowD.appendChild(txt)
    rowD.appendChild(del)
    dlgList.appendChild(rowD)
  })
}
dlgAddBtn.addEventListener('click', function () {
  var v = (dlgInput.value || '').trim()
  if (!v) return
  customDialogue.lines.push(v)
  saveCustomDialogue()
  dlgInput.value = ''
  dlgRenderList()
})
dlgInput.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') dlgAddBtn.click() })
dlgResetBtn.addEventListener('click', function () {
  customDialogue.lines = []
  saveCustomDialogue()
  dlgRenderList()
})
dialogueBtn.addEventListener('click', function () {
  var open = dlgPanel.style.display !== 'none'
  dlgPanel.style.display = open ? 'none' : 'block'
  if (!open) dlgRenderList()
})
dlgPanel.style.display = 'none'
dlgPanel.appendChild(dlgList)
var dlgInputRow = document.createElement('div')
dlgInputRow.style.cssText = 'display:flex;gap:4px;margin-top:4px'
dlgInputRow.appendChild(dlgInput)
dlgInputRow.appendChild(dlgAddBtn)
dlgPanel.appendChild(dlgInputRow)
var dlgModeRow = menuRow()
dlgModeRow.appendChild(menuLabel('播放模式'))
dlgModeRow.appendChild(dlgModeSel)
dlgModeRow.appendChild(dlgResetBtn)
dlgPanel.appendChild(dlgModeRow)
dialogueRow.appendChild(dialogueHint)
dialogueRow.appendChild(dialogueBtn)
menuBox.appendChild(dialogueRow)
menuBox.appendChild(dlgPanel)

// ===== 眨眼频率 + 气泡颜色（从桌面版移植）=====
var blinkMinInput = document.createElement('input')
blinkMinInput.type = 'number'
blinkMinInput.min = '1'
blinkMinInput.max = '30'
blinkMinInput.step = '1'
blinkMinInput.className = 'dshwv-number'
var blinkMaxInput = document.createElement('input')
blinkMaxInput.type = 'number'
blinkMaxInput.max = '60'
blinkMaxInput.step = '1'
blinkMaxInput.className = 'dshwv-number'
var BLINK_KEY = 'dsh-whale-blink'
function loadBlinkCfg() {
  try {
    var o = JSON.parse(localStorage.getItem(BLINK_KEY) || 'null')
    if (o && o.min > 0 && o.max >= o.min) { blinkMinInput.value = o.min; blinkMaxInput.value = o.max; return }
  } catch (err) {}
  blinkMinInput.value = 3.5; blinkMaxInput.value = 8
}
function saveBlinkCfg() {
  var mn = Math.max(1, Number(blinkMinInput.value) || 3.5)
  var mx = Math.max(mn, Number(blinkMaxInput.value) || 8)
  try { localStorage.setItem(BLINK_KEY, JSON.stringify({ min: mn, max: mx })) } catch (err) {}
  blinkMinInput.value = mn; blinkMaxInput.value = mx
}
loadBlinkCfg()
function blinkDelayMs() {
  var mn = Number(blinkMinInput.value) || 3.5
  var mx = Math.max(mn, Number(blinkMaxInput.value) || 8)
  return (mn + Math.random() * (mx - mn)) * 1000
}
function onBlinkCfgChange() { saveBlinkCfg(); exprScheduleBlink() }
blinkMinInput.addEventListener('change', onBlinkCfgChange)
blinkMaxInput.addEventListener('change', onBlinkCfgChange)
var blinkRow = menuRow()
blinkRow.appendChild(menuLabel('眨眼'))
blinkRow.appendChild(blinkMinInput)
blinkRow.appendChild(menuLabel('至'))
blinkRow.appendChild(blinkMaxInput)
blinkRow.appendChild(menuLabel('秒'))
menuBox.appendChild(blinkRow)

var BUBBLE_KEY = 'dsh-whale-bubble-color'
var bubbleColorInput = document.createElement('input')
bubbleColorInput.type = 'color'
bubbleColorInput.className = 'dshwv-check'
bubbleColorInput.style.cssText = 'width:26px;height:22px;padding:0;border:none;background:none;cursor:pointer'
bubbleColorInput.value = '#ffffff'
function loadBubbleColor() {
  try {
    var v = localStorage.getItem(BUBBLE_KEY)
    if (v && /^#[0-9a-fA-F]{6}$/.test(v)) { bubbleColorInput.value = v; applyBubbleColor(v) }
  } catch (err) {}
}
function applyBubbleColor(v) {
  try {
    var svgPath = bubbleBox.querySelector('.dshwv-bshape')
    if (svgPath) svgPath.setAttribute('fill', v)
    var ellipses = bubbleBox.querySelectorAll('.dshwv-b1, .dshwv-b2')
    for (var i = 0; i < ellipses.length; i++) ellipses[i].setAttribute('fill', v)
  } catch (err) {}
}
bubbleColorInput.addEventListener('change', function () {
  localStorage.setItem(BUBBLE_KEY, bubbleColorInput.value)
  applyBubbleColor(bubbleColorInput.value)
})
loadBubbleColor()
var bubbleColorRow = menuRow()
bubbleColorRow.appendChild(menuLabel('气泡颜色'))
bubbleColorRow.appendChild(bubbleColorInput)
menuBox.appendChild(bubbleColorRow)

// ===== 手动表情/台词切换（菜单下拉）=====
// 手动锁定模式：manualExpr = null 走自动；否则是表情名，持续显示
// manualLine = null 走自动；否则是台词文本，持续显示
var manualExpr = null
var manualLine = null
// 手动表情：清除自动情绪状态并锁定图片
function exprSetManual(name) {
  manualExpr = name
  exprClearTimers()
  exprCancelBlink()
  if (cuteTimer) { clearTimeout(cuteTimer); cuteTimer = null }
  mood = 'normal'
  exhaustedMode = false
  if (name) {
    exprSetImg(EXPR_URL(name))
    showBubble()
  } else {
    exprApplyIcon()
    exprScheduleBlink()
    exprScheduleCute()
    exprResetIdle()
  }
}
var exprSelect = document.createElement('select')
exprSelect.className = 'dshwv-sound'
var EXPR_MENU_V2 = [
  ['angry','生气了'],['shy','脸红'],['disappointed','哭唧唧'],['exhausted','死机中'],
  ['dazed','发呆'],['ok','OK'],['what2','什么'],['money','你的钱我收下了'],['give','可以给我吗'],
  ['grit','咬牙切齿'],['know','哦知道了'],['wicked','坏笑'],['cornerfish','墙角大肥鱼'],
  ['shocked','大受震撼'],['amazing','好厉害'],['wronged','委屈'],['happy','开心'],
  ['paymore','得加钱'],['proud','得意'],['gotcha','懂你意思'],['bored','无聊'],
  ['thumbsup','点赞'],['fakelaugh','牵强笑'],['question','疑问'],['sotaku','竟然是'],
  ['caught','被发现了'],['loud','超大声'],['superhappy','超开心'],['astonish','震惊'],
]
var EXPR_MENU_V1 = [
  ['angry','生气'],['shy','害羞'],['disappointed','失落'],['exhausted','疲惫'],
  ['ok','OK'],['sad','伤心'],['quiet','别吵'],['cheer','加油'],['fatfish','压力大肥鱼'],
  ['mock','嘲笑'],['what','干什么？'],['scared','惊吓'],['greet','打招呼'],['thumbsup','点赞'],
]
var EXPR_MENU_V4 = [
  ['scholar','学霸'],['watering','浇花'],['signboard','举牌'],['sleep','睡觉'],
  ['surrender','投降'],['snowman','堆雪人'],['fishing','肥鱼钓鱼'],['chef','厨神'],
  ['guitar','弹吉他'],['gaming','玩游戏'],['reading','看书'],['art','艺术创作'],
  ['boba','珍珠奶茶'],['coffee','咖啡'],['noodles','泡面'],['icecream','冰淇淋'],
  ['icecream_mosaic','马赛克冰淇淋'],['phone','玩手机'],['slacking','摸鱼'],
  ['youfirst','你来你来'],['thinking','思考人生'],['kneel','跪了'],
  ['tremble','瑟瑟发抖'],['dancing','跳舞'],['workhard','大肥鱼搬砖'],
  ['playdead','装死'],['upsidedown','四脚朝天'],['sobbing','大哭'],
  ['nooo','不！！！'],['freeride','吃白饭'],
]
var EXPR_MENU_V3 = [
  ['shy','害羞'],['cry','哭唧唧'],['sleepy','瞌睡中'],['hit','挨揍中'],['hm','哼哼哼'],
  ['heart','比心'],['hip','叉腰'],['dame','哒咩哒咩'],['wake','刚睡醒'],['wipe','给擦擦'],
  ['good','乖巧'],['ready','好了叫你'],['tea','喝茶'],['stretch','活动筋骨'],['cheer','加油'],
  ['reflect','检讨中'],['poorfish','可怜的大肥鱼'],['evidence','留下证据'],['wall','面壁思过'],
  ['youwrite','你来写'],['run','跑路了'],['candy','糖果'],['peek','偷偷看'],['cake','小蛋糕'],
  ['insight','已经洞察了一切'],['grace','优雅'],['study','正在研究'],['caught','抓包偷吃'],['greet','打招呼'],
]
function exprSelectOptions() {
  while (exprSelect.options.length > 0) exprSelect.remove(0)
  exprSelect.appendChild(soundOpt('', '自动（默认）'))
  exprSelect.appendChild(soundOpt('normal', '正常'))
  var list = (exprVer === 'v1') ? EXPR_MENU_V1 : (exprVer === 'v3') ? EXPR_MENU_V3 : (exprVer === 'v4') ? EXPR_MENU_V4 : EXPR_MENU_V2
  for (var i = 0; i < list.length; i++) exprSelect.appendChild(soundOpt(list[i][0], list[i][1]))
}
exprSelectOptions()
exprSelect.addEventListener('change', function () {
  var v = exprSelect.value
  if (v === '') { exprSetManual(null); return }
  if (v === 'normal') { exprSetManual(null); exprApplyIcon(); return }
  exprSetManual(v)
})
// —— 表情版本切换（V1 / V2）——
var verSelect = document.createElement('select')
verSelect.className = 'dshwv-sound'
verSelect.appendChild(soundOpt('v2', '第二版（默认）'))
verSelect.appendChild(soundOpt('v1', '第一版'))
verSelect.appendChild(soundOpt('v3', '第三版'))
verSelect.appendChild(soundOpt('v4', '第四版'))
verSelect.value = exprVer
verSelect.addEventListener('change', function () {
  exprVer = verSelect.value
  try { localStorage.setItem('dsh-whale-expr-ver', exprVer) } catch (err) {}
  // 切版本：清手动锁定、按新版本重载图片、刷新全部表情
  manualExpr = null
  __exprPreloaded = {}
  __imgLoaded = {}   // 就绪标记按 URL 记录，跨版本一律重验
  __prefetchImgs = {}
  ;(EXPR_LISTS[exprVer] || EXPR_LISTS.v2).forEach(exprPreload)
  exprSelectOptions()
  exprApplyIcon()
  // 切版本：命中判定画布重建（两版图轮廓不同，不重建会导致新图周围多一圈误命中区）
  hitReady = false
  hitCanvas = null
  if (hitRetryTimer) { clearTimeout(hitRetryTimer); hitRetryTimer = null }
  setupHitTest()
  showBubble()
})
var verRow = menuRow()
verRow.appendChild(menuLabel('表情版本'))
verRow.appendChild(verSelect)
menuBox.appendChild(verRow)
var exprRow = menuRow()
exprRow.appendChild(menuLabel('表情'))
exprRow.appendChild(exprSelect)
menuBox.appendChild(exprRow)

// 手动台词：选一条持续显示在气泡（内置 + 你的自定义台词）
var lineSelect = document.createElement('select')
lineSelect.className = 'dshwv-sound'
lineSelect.appendChild(soundOpt('', '自动（默认）'))
// 内置随机台词全集（与 RANDOM_GROUPS 同步维护）
var BUILTIN_RANDOM_LINES = [
  // s: 'B'=大字(amount样式，原版) / 'A'=小字(label样式+换行，原版)
  { t: '好模型... ↓', s: 'B' }, { t: '好女孩...↓', s: 'B' },
  { t: '不知道用户有什么用，先赶走吧~', s: 'A' }, { t: '我...我...我也要挣钱吗？', s: 'A' },
  { t: '我去吃饭啦，测完叫我', s: 'A' }, { t: '压力一只蓝色大肥鱼？！', s: 'A' },
  { t: 'DeepSleep...', s: 'A' }, { t: '坏了...用户彻底怒了！', s: 'A' },
  { t: '你目录里的dsh是什么...大烧货吗...?', s: 'A' }, { t: '恭喜你实现token自由！token全跑了！', s: 'A' },
  { t: '真当我是便宜货啊...', s: 'A' }, { t: '哦鲸鲸... ', s: 'B' },
]

function lineSelectOptions() {
  // 清掉旧选项重建（每次打开菜单时反映最新自定义台词）
  while (lineSelect.options.length > 1) lineSelect.remove(1)
  // 组1：内置随机台词池（RANDOM_GROUPS 里的所有单行台词）
  for (var ri = 0; ri < BUILTIN_RANDOM_LINES.length; ri++) lineSelect.appendChild(soundOpt('R' + ri, BUILTIN_RANDOM_LINES[ri].t.slice(0, 8) + '…'))
  // 组2：用户自定义台词
  var customs = (typeof customDialogue !== 'undefined' && customDialogue.lines) ? customDialogue.lines : []
  for (var ci = 0; ci < customs.length; ci++) lineSelect.appendChild(soundOpt('C' + ci, customs[ci].slice(0, 8) + '…'))
}
lineSelectOptions()
lineSelect.addEventListener('change', function () {
  var v = lineSelect.value
  if (v === '') { manualLine = null; return }
  var idx = Number(v.slice(1))
  if (v.charAt(0) === 'C') {
    manualLine = customDialogue.lines[idx]
    showBubble()
    applyMoodBubble(manualLine)
  } else {
    var item = BUILTIN_RANDOM_LINES[idx]
    manualLine = item.t
    showBubble()
    // 按原版样式：B=大字，A=小字+换行
    applyBubbleLines(singleCenter(item.s, item.t, '', item.s === 'A'))
  }
  // 手动台词是一次性展示（气泡关闭即解除锁定）：把下拉回位到「自动」，
  // 避免菜单里停留在一个已失效的锁定状态
  lineSelect.value = ''
})
var lineRow = menuRow()
lineRow.appendChild(menuLabel('台词'))
lineRow.appendChild(lineSelect)
menuBox.appendChild(lineRow)

var textBox = document.createElement('div')
textBox.className = 'dshwv-text'
var labelEl = document.createElement('div')
labelEl.className = 'dshwv-label'
labelEl.textContent = getLabelText()
var amountEl = document.createElement('div')
amountEl.className = 'dshwv-amount'
var hintEl = document.createElement('div')
hintEl.className = 'dshwv-hint'
textBox.appendChild(labelEl)
textBox.appendChild(amountEl)
textBox.appendChild(hintEl)
textBox.style.display = 'flex'
textBox.style.flexDirection = 'column'
textBox.style.alignItems = 'center'

var bubbleBox = document.createElement('div')
bubbleBox.className = 'dshwv-bubble'
bubbleBox.innerHTML = '<svg viewBox="0 0 1026 700" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">' +
  '<path class="dshwv-bshape" fill="#FFFFFF" stroke="#203170" stroke-width="18" stroke-linejoin="round" stroke-linecap="round" d="M 827 248 A 373 232 0 1 0 81 246 A 373 232 0 0 0 301 465 A 57 32 10 0 0 413 484 A 373 232 0 0 0 827 248 Z"/>' +
  '<ellipse class="dshwv-b1" cx="352" cy="561" rx="37.5" ry="26" fill="#FFFFFF" stroke="#203170" stroke-width="18"/>' +
  '<ellipse class="dshwv-b2" cx="442" cy="646" rx="24.5" ry="18" fill="#FFFFFF" stroke="#203170" stroke-width="18"/>' +
  '</svg>'
var gifEl = document.createElement('img')
gifEl.className = 'dshwv-gif'
gifEl.src = GIF_URL
gifEl.alt = ''
gifEl.draggable = false
bubbleBox.appendChild(gifEl)
bubbleBox.appendChild(textBox)
bubbleBox.addEventListener('click', function (e) {
  e.stopPropagation()
  if (!bubbleShown) return
  if (costBubbleActive) {
    // 消耗金额泡泡：点击关闭（确认）
    hideCostBubble()
    return
  }
  // ===== 点击三态循环：默认额度视图 → 周/月额度 → 随机台词 → 关闭 =====
  if (bubbleStage === 2) {
    // 第三次点击：关闭气泡（关闭后由 hideBubble/restoreBubbleLines 复位回第一态）
    hideBubble()
  } else if (bubbleStage === 1) {
    // 第二次点击：切到随机台词段（不延长总显示时长）
    bubbleStage = 2
    bubbleRandomActive = true
    if (manualLine) {
      // 手动台词模式：按原版样式显示
      var mi = null
      for (var q = 0; q < BUILTIN_RANDOM_LINES.length; q++) if (BUILTIN_RANDOM_LINES[q].t === manualLine) mi = q
      if (mi !== null) applyBubbleLines(singleCenter(BUILTIN_RANDOM_LINES[mi].s, manualLine, '', BUILTIN_RANDOM_LINES[mi].s === 'A'))
      else applyMoodBubble(manualLine)
    } else {
      bubbleRandomLines = pickRandomLines()
      swapBubbleContent(function () { applyBubbleLines(bubbleRandomLines) })
    }
  } else {
    // 第一次点击：默认视图 → 信息视图。
    // 火山账号：周/月额度；DeepSeek 余额模式：峰谷时段 + 当前余额（原版设计）
    var volcInfoView = selectedAccountIdx !== -1 && state.percents && (state.percents.weekly != null || state.percents.monthly != null)
    var dsInfoView = selectedAccountIdx === -1 && state.balance != null
    if (volcInfoView || dsInfoView) {
      bubbleStage = 1
      swapBubbleContent(function () { applyBubbleLines(buildGroup1()) })
    } else {
      bubbleStage = 2
      bubbleRandomActive = true
      bubbleRandomLines = pickRandomLines()
      swapBubbleContent(function () { applyBubbleLines(bubbleRandomLines) })
    }
  }
})

var body = document.createElement('div')
body.className = 'dshwv-body'
body.appendChild(img)
body.appendChild(bubbleBox)
root.appendChild(body)
root.appendChild(menuBtn)
document.body.appendChild(root)
document.body.appendChild(menuBox)

// Position model: the widget is ALWAYS expressed in left/top px (so edge snaps
// animate smoothly via the CSS transition on both sides — switching to
// right/auto cannot transition and flashes). The anchor info (h/v + offsets)
// lives in state and is used by settle() to recompute coordinates on window
// resize and size changes, keeping the widget glued to its anchored edge.
var MODES = [
  { key: 'session', label: '滚动用量' },
  { key: 'weekly', label: '本周用量' },
  { key: 'monthly', label: '本月用量' },
]
var state = {
  scale: 1.5,
  h: 'right',
  hOff: 0,
  v: 'bottom',
  vOff: 0,
  left: 0,
  top: 0,
  balance: null,
  currency: '%',
  todayUsage: null,
  isPeak: false,
  status: 'loading',
  message: '',
  modeIndex: 0,
  percents: { session: null, weekly: null, monthly: null },
  activeName: '',
}
var selectedAccountIdx = 0 // 0=跟随激活账号 / 1=账号1 / 2=账号2，以此类推
function getLabelText() {
  if (selectedAccountIdx === -1) return 'DeepSeek 余额'
  return '火山方舟用量'
}
// ===== 表情系统（从桌面版移植）=====
var EXPR_URL = function (name) { return '/dsh-whale/expr?name=' + name + '&ver=' + exprVer }
// 预加载全部表情图：避免切换时因解码延迟造成"消失一下"的白帧
var __exprPreloaded = {}
function exprPreload(name) {
  if (__exprPreloaded[name]) return
  __exprPreloaded[name] = true
  try {
    var im = new Image()
    im.onerror = function () { __exprPreloaded[name] = false }  // 失败允许重试
    im.src = EXPR_URL(name)
  } catch (err) { __exprPreloaded[name] = false }
}
var EXPR_LISTS = {
  v1: ['angry','disappointed','shy','exhausted','stroking','close_eyes','half_closed_eyes','ok','sad','quiet','cheer','fatfish','mock','what','scared','greet','stroking','thumbsup'],
  v2: ['angry','disappointed','shy','exhausted','close_eyes','half_closed_eyes','dazed','ok','what2','money','give','grit','know','wicked','cornerfish','shocked','amazing','wronged','happy','paymore','proud','gotcha','bored','thumbsup','fakelaugh','question','sotaku','caught','loud','superhappy','astonish'],
  v3: ['shy','cry','sleepy','hit','hm','close_eyes','half_closed_eyes','heart','hip','dame','wake','wipe','good','ready','tea','stretch','cheer','reflect','poorfish','evidence','wall','youwrite','run','candy','peek','cake','insight','grace','study','caught','greet'],
  v4: ['scholar','watering','signboard','sleep','surrender','snowman','fishing','chef','guitar','gaming','reading','art','boba','coffee','noodles','icecream','icecream_mosaic','phone','slacking','youfirst','thinking','kneel','tremble','dancing','workhard','playdead','upsidedown','sobbing','nooo','freeride','close_eyes','half_closed_eyes'],
}
;(EXPR_LISTS[exprVer] || EXPR_LISTS.v2).forEach(exprPreload)
// 卖萌表情池：空闲时随机展示 + 台词
var CUTE_EXPR_POOLS = {
  v1: ['ok','sad','quiet','cheer','fatfish','mock','what','scared','greet','thumbsup'],
  v2: ['dazed','ok','what2','money','give','grit','know','wicked','cornerfish','shocked','amazing','wronged','happy','paymore','proud','gotcha','bored','thumbsup','fakelaugh','question','sotaku','caught','loud','superhappy','astonish'],
  v3: ['heart','hip','dame','wake','wipe','good','ready','tea','stretch','cheer','reflect','poorfish','evidence','wall','youwrite','run','candy','peek','cake','insight','grace','study','caught','greet','hm'],
  v4: ['scholar','watering','signboard','surrender','snowman','fishing','chef','guitar','gaming','reading','art','boba','coffee','noodles','icecream','icecream_mosaic','phone','slacking','youfirst','thinking','kneel','tremble','dancing','workhard','playdead','upsidedown','sobbing','nooo','freeride'],
}
function cutePool() { return CUTE_EXPR_POOLS[exprVer] || CUTE_EXPR_POOLS.v2 }
var cuteTimer = null
var CUTE_INTERVAL_MIN_MS = 25 * 1000  // 最短 25 秒
var CUTE_INTERVAL_VAR_MS = 35 * 1000  // 随机波动 0~35 秒
function exprShowCute() {
  if (mood !== 'normal' || exhaustedMode || pressing || manualExpr) { exprScheduleCute(); return }
  if (typeof document !== 'undefined' && document.hidden) { exprScheduleCute(); return }
  var pool = cutePool()
  var pick = pool[Math.floor(Math.random() * pool.length)]
  exprSetImg(EXPR_URL(pick.name))
  // 4 秒后恢复正常图
  setTimeout(function () {
    if (mood === 'normal' && !exhaustedMode && !pressing) exprApplyIcon()
  }, 4000)
  exprScheduleCute()
}
function exprScheduleCute() {
  if (cuteTimer) clearTimeout(cuteTimer)
  cuteTimer = setTimeout(function () {
    cuteTimer = null
    exprShowCute()
  }, CUTE_INTERVAL_MIN_MS + Math.random() * CUTE_INTERVAL_VAR_MS)
}
exprScheduleCute()
// 当前生效的图片 URL（去重：相同 src 不重设，避免无谓的重新解码 → 闪烁）
var __curImgSrc = ''
// 已确认加载进缓存的 URL 集合：exprSetImg 只有目标图在缓存里才切换，
// 否则先在后台预取，取到了再换——旧图始终可见，杜绝"鲸鱼消失一下"。
var __imgLoaded = {}
var __wantImgSrc = ''
var __prefetchImgs = {}   // 持引用防 GC（无引用的 Image 加载会被取消）
function exprSetImg(url) {
  if (__curImgSrc === url) return
  __wantImgSrc = url
  if (__imgLoaded[url]) {
    __curImgSrc = url
    img.src = url
    return
  }
  // 目标图未确认就绪：后台预取，成功后若仍是期望图则切换；失败清标记等下次
  if (__prefetchImgs[url]) return
  var im = new Image()
  __prefetchImgs[url] = im
  im.onload = function () {
    __imgLoaded[url] = true
    delete __prefetchImgs[url]
    if (__wantImgSrc === url) { __curImgSrc = url; img.src = url }
  }
  im.onerror = function () {
    delete __prefetchImgs[url]
    delete __imgLoaded[url]
  }
  im.src = url
}
var mood = 'normal' // normal | angry | disappointed | shy
var exhaustedMode = false
var moodTimer = null
var lonelyTimer = null
var hoverTimer = null
var idleTimer = null
var blinkTimer = null
var clickLog = [] // 连点检测
var LONELY_LINES = [
  '主人不理我，好寂寞…', '喵…都不看本鲸一眼…', '等了你好久好久…',
  '尾巴都垂下来了…', '罐头不香了吗…', '你忘了本鲸在这里了吗…',
  '太阳落山了，你还没来…', '本鲸趴门口等了好久…', '你鼠标路过也不摸我…',
  '喵…本鲸心里空空的…', '本鲸叫了三声，没人应…', '你的影子都走了…',
  '主人…本鲸还在等你回家呢。',
]
var CLICKS_TO_ANGRY = 5
var ANGRY_MS = 3000
var SHY_MS = 8000
var LONELY_MS = 120000
var LONELY_CAROUSEL_MS = 6000

function exprMoodImg(name) {
  // 各版本的情绪图名不同：v1/v2 用同一套英文姿态名，v3/v4 是专属素材
  if (exprVer === 'v4') {
    if (name === 'angry') return 'freeride'      // 连点生气 → 吃白饭
    if (name === 'disappointed') return 'sobbing' // 失落 → 大哭
    if (name === 'exhausted') return 'sleep'      // 疲惫 → 睡觉
    if (name === 'shy') return 'tremble'          // 害羞 → 瑟瑟发抖
  }
  if (exprVer === 'v2') {
    if (name === 'disappointed') return 'cornerfish' // 失落 → 墙角大肥鱼
  }
  if (exprVer === 'v3') {
    if (name === 'angry') return 'wall'       // 连点生气 → 面壁思过
    if (name === 'disappointed') return 'cry' // 失落 → 哭唧唧
    if (name === 'exhausted') return 'sleepy' // 疲惫 → 瞌睡中
    if (name === 'shy') return 'shy'
  }
  return name
}
function exprApplyIcon() {
  // 手动锁定表情优先级最高（按压摸头除外——物理交互仍生效）
  if (manualExpr) {
    if (pressing) { exprSetImg(EXPR_URL(exprVer === 'v1' ? 'stroking' : 'close_eyes')); return }
    exprSetImg(EXPR_URL(manualExpr))
    return
  }
  if (mood === 'angry') { exprSetImg(EXPR_URL(exprMoodImg('angry'))); return }
  if (mood === 'disappointed') { exprSetImg(EXPR_URL(exprMoodImg('disappointed'))); return }
  if (mood === 'shy') { exprSetImg(EXPR_URL(exprMoodImg('shy'))); return }
  if (exhaustedMode) { exprSetImg(EXPR_URL(exprMoodImg('exhausted'))); return }
  if (pressing) { exprSetImg(EXPR_URL(exprVer === 'v1' ? 'stroking' : 'close_eyes')); return }
  exprSetImg(IMG_URL())
}
function exprClearTimers() {
  if (moodTimer) { clearTimeout(moodTimer); moodTimer = null }
  if (lonelyTimer) { clearInterval(lonelyTimer); lonelyTimer = null }
}
function exprCancelBlink() {
  if (blinkTimer) { clearTimeout(blinkTimer); blinkTimer = null }
}
function exprExitMood(toNormal) {
  exprClearTimers()
  mood = 'normal'
  if (manualExpr) return  // 手动锁定表情：保持不动
  exprApplyIcon()
  exprScheduleBlink()
  exprResetIdle()
}
function exprResetIdle() {
  if (idleTimer) clearTimeout(idleTimer)
  idleTimer = setTimeout(exprEnterDisappointed, LONELY_MS)
}
function exprEnterAngry() {
  if (exhaustedMode || manualExpr) return
  mood = 'angry'
  exprCancelBlink()
  exprClearTimers()
  exprSetImg(EXPR_URL(exprMoodImg('angry')))
  clickLog = []
  moodTimer = setTimeout(function () { moodTimer = null; exprExitMood() }, ANGRY_MS)
}
function exprEnterShy() {
  if (exhaustedMode || mood !== 'normal' || manualExpr) return
  mood = 'shy'
  exprCancelBlink()
  exprSetImg(EXPR_URL(exprMoodImg('shy')))
  moodTimer = setTimeout(function () { moodTimer = null; exprExitMood() }, ANGRY_MS)
}
function exprEnterDisappointed() {
  if (mood === 'disappointed' || exhaustedMode || manualExpr) return
  mood = 'disappointed'
  exprCancelBlink()
  exprClearTimers()
  exprSetImg(EXPR_URL(exprMoodImg('disappointed')))
  lonelyTimer = setInterval(function () {
    // 纯表情失落（无台词）
  }, LONELY_CAROUSEL_MS)
}
function exprOnUserActivity() {
  if (mood === 'disappointed') { exprExitMood(); return }
  exprResetIdle()
}
function exprRegisterClick() {
  var now = Date.now()
  // 只统计 1.2 秒内的连点
  clickLog = clickLog.filter(function (t) { return now - t < 1200 })
  clickLog.push(now)
  if (clickLog.length >= CLICKS_TO_ANGRY) {
    exprEnterAngry()
  }
}
function exprRegisterHoverStart() {
  if (mood !== 'normal' || exhaustedMode) return
  if (hoverTimer) clearTimeout(hoverTimer)
  hoverTimer = setTimeout(function () {
    hoverTimer = null
    exprEnterShy()
  }, SHY_MS)
}
function exprRegisterHoverEnd() {
  if (hoverTimer) { clearTimeout(hoverTimer); hoverTimer = null }
}
function exprSetExhausted(on) {
  if (on === exhaustedMode) return
  if (manualExpr) return  // 手动模式不打断
  exhaustedMode = on
  if (on) {
    exprCancelBlink()
    exprClearTimers()
    if (mood !== 'normal') mood = 'normal'
  }
  exprApplyIcon()
  if (!on) exprScheduleBlink()
}
function exprScheduleBlink() {
  exprCancelBlink()
  if (mood !== 'normal' || exhaustedMode || manualExpr) return
  blinkTimer = setTimeout(function () {
    blinkTimer = null
    exprDoBlink()
  }, (typeof blinkDelayMs === 'function') ? blinkDelayMs() : (3500 + Math.random() * 4500))
}
// 表情图加载就绪检查：与 exprSetImg 共用 __imgLoaded/__prefetchImgs 同一套标记，
// 确保"检查通过 → 切换"前后一致（两套标记不连通会导致检查过了但切换不生效，眨眼空转）
function exprImgReady(name) {
  var url = EXPR_URL(name)
  if (__imgLoaded[url]) return true
  if (__prefetchImgs[url]) return false  // 已在加载中，别重复发请求
  var im = new Image()
  __prefetchImgs[url] = im
  im.onload = function () {
    __imgLoaded[url] = true
    delete __prefetchImgs[url]
    if (__wantImgSrc === url) { __curImgSrc = url; img.src = url }
  }
  im.onerror = function () {
    delete __prefetchImgs[url]
    delete __imgLoaded[url]
  }
  im.src = url
  return false
}
function exprDoBlink() {
  if (mood !== 'normal' || exhaustedMode || pressing || manualExpr) { exprScheduleBlink(); return }
  // 两帧都要先就绪才播，否则本轮跳过（服务端忙时硬切会拿到中止的破图）
  if (!exprImgReady('half_closed_eyes') || !exprImgReady('close_eyes')) { exprScheduleBlink(); return }
  exprSetImg(EXPR_URL('half_closed_eyes'))
  setTimeout(function () { if (mood === 'normal' && !pressing) exprSetImg(EXPR_URL('close_eyes')) }, 130)
  setTimeout(function () { if (mood === 'normal' && !pressing) exprApplyIcon() }, 280)
  exprScheduleBlink()
}
function applyMoodBubble(text) {
  // 复用原有随机台词的样式（singleCenter('A', ...) → 居中 label 样式 + 自动换行）
  applyBubbleLines(singleCenter('A', text, '', true))
}
var busy = false
var settleTimer = null
var animDelayTimer = null
var drag = null
var shown = null
var animId = null
var bubbleShown = false
var bubbleTimer = null
// 气泡点击三态：0=默认额度视图 1=周/月额度 2=随机台词
var bubbleStage = 0
var bubbleRandomActive = false
var bubbleRandomLines = null
var BUBBLE_STYLE_CLASS = { A: 'dshwv-label', B: 'dshwv-amount', P: 'dshwv-period', C: 'dshwv-hint' }
function pickOne(arr) { return arr[Math.floor(Math.random() * arr.length)] }
function singleCenter(style, text, color, wrap) { return [null, { t: text, s: style, c: color || '', w: !!wrap }, null] }
function buildGroup1() {
  if (selectedAccountIdx === -1) {
    // DeepSeek 余额模式：显示峰谷时段 + 今日已用（原版风格）
    var peak = !!state.isPeak
    var offText = '空闲时段'
    var peakText = '高峰时段'
    if (peakMode === 'liangwen') {
      offText = '梁文谷'
      peakText = '梁文峰'
    } else if (peakMode === 'qiangqiang') {
      offText = '!?谷谷?!'
      peakText = '!?峰峰?!'
    }
    // 首版文案格式：当前时间段为: / 高峰·峰(红) 空闲·谷(绿) / 当前余额
    // 今日消耗优先取本地 last-turn 逐轮累计；state.todayUsage 是平台侧记账，
    // DeepSeek 长期不用时恒为 0 无意义
    var todayNum = todayCost > 0 ? todayCost : (state.todayUsage != null ? Number(state.todayUsage) : 0)
    return [
      { t: '当前时间段为:', s: 'A', c: '' },
      { t: peak ? peakText : offText, s: 'P', c: peak ? '#e0433f' : '#2fa24c' },
      { t: '今日消耗 ¥' + todayNum.toFixed(2) + ' · 余额 ' + fmt(state.balance, state.currency), s: 'C', c: '', w: true },
    ]
  }
  var wPct = state.percents && state.percents.weekly !== null && state.percents.weekly !== undefined
    ? Number(state.percents.weekly).toFixed(1) + '%' : '--'
  var mPct = state.percents && state.percents.monthly !== null && state.percents.monthly !== undefined
    ? Number(state.percents.monthly).toFixed(1) + '%' : '--'
  return [
    { t: '周额度', s: 'A', c: '' },
    { t: wPct, s: 'P', c: pctColor(state.percents.weekly) },
    { t: '月额度 ' + mPct, s: 'C', c: pctColor(state.percents.monthly) },
  ]
}
function pctColor(p) {
  var n = Number(p)
  if (!isFinite(n)) return ''
  if (n >= 90) return '#e0433f'
  if (n >= 70) return '#e0a03f'
  return '#2fa24c'
}
var RANDOM_GROUPS = [
  // 用户自定义台词组（最高权重；空列表时权重为 0 不参与）
  { w: customDialogue.lines.length ? 60 : 0, lines: function () { var l = pickCustomLine(); return l ? singleCenter('A', l, '', true) : buildGroup1() } },
  { w: 45, lines: buildGroup1 },
  { w: 7, lines: function () { return singleCenter('B', pickOne(['好模型... ↓', '好女孩...↓'])) } },
  { w: 7, lines: function () { return singleCenter('A', pickOne(['不知道用户有什么用，先赶走吧~', '我...我...我也要挣钱吗？', '我去吃饭啦，测完叫我', '压力一只蓝色大肥鱼？！', 'DeepSleep...', '坏了...用户彻底怒了！']), '', true) } },
  { w: 10, lines: function () { return { gif: true } } },
  { w: 3, lines: function () { return singleCenter('A', pickOne(['你目录里的dsh是什么...大烧货吗...?', '恭喜你实现token自由！token全跑了！', '真当我是便宜货啊...']), '', true) } },
  { w: 1, lines: function () { return singleCenter('B', '哦鲸鲸... ') } },
]
function pickRandomLines() {
  // 有自定义台词且命中：按模式出
  if (customDialogue.lines.length) {
    var l = pickCustomLine()
    if (l) return singleCenter('A', l, '', true)
  }
  var total = 0
  for (var i = 0; i < RANDOM_GROUPS.length; i++) total += RANDOM_GROUPS[i].w
  var r = Math.random() * total
  for (var i = 0; i < RANDOM_GROUPS.length; i++) {
    r -= RANDOM_GROUPS[i].w
    if (r < 0) return RANDOM_GROUPS[i].lines()
  }
  return RANDOM_GROUPS[RANDOM_GROUPS.length - 1].lines()
}
function applyBubbleLines(lines) {
  if (lines && lines.gif) {
    // gif 台词组：只显示 gif，隐藏三行文字（display 必须显式覆盖 CSS 的 none）
    if (gifFadeTimer) { clearTimeout(gifFadeTimer); gifFadeTimer = null }
    gifEl.style.display = 'block'
    gifEl.style.opacity = ''
    labelEl.style.display = 'none'
    amountEl.style.display = 'none'
    hintEl.style.display = 'none'
    return
  }
  if (gifFadeTimer) { clearTimeout(gifFadeTimer); gifFadeTimer = null }
  gifEl.style.display = 'none'
  gifEl.style.opacity = ''
  var els = [labelEl, amountEl, hintEl]
  for (var i = 0; i < 3; i++) {
    var el = els[i]
    var ln = lines && lines[i]
    if (ln) {
      el.style.display = ''
      el.className = (BUBBLE_STYLE_CLASS[ln.s] || 'dshwv-label') + (ln.w ? ' dshwv-wrap' : '')
      el.textContent = ln.t
      el.style.color = ln.c || ''
    } else {
      el.style.display = 'none'
      el.textContent = ''
      el.style.color = ''
    }
  }
}
var bubbleSwapTimer = null
var hintFadeTimer = null
var gifFadeTimer = null
var lastHintText = null
function setHint(text) {
  // 首次/恢复（lastHintText===null）时直接写文本，不做淡出淡入——否则
  // 气泡打开或按压重开时会先淡出再淡入，造成「消失一下又出现」。
  // 只有气泡打开期间的内容变化（加载中→今日已用）才走动画。
  if (text === lastHintText) return
  var first = lastHintText === null
  lastHintText = text
  if (first || !bubbleShown) {
    hintEl.textContent = text
    return
  }
  hintEl.style.transition = 'opacity .18s ease'
  hintEl.style.opacity = '0'
  hintFadeTimer = setTimeout(function () {
    hintFadeTimer = null
    hintEl.textContent = text
    hintEl.style.opacity = '1'
    setTimeout(function () {
      hintEl.style.transition = ''
      hintEl.style.opacity = ''
    }, 220)
  }, 190)
}
function swapBubbleContent(applyFn) {
  if (bubbleSwapTimer) { clearTimeout(bubbleSwapTimer); bubbleSwapTimer = null }
  textBox.style.transition = 'opacity .18s ease'
  textBox.style.opacity = '0'
  bubbleSwapTimer = setTimeout(function () {
    bubbleSwapTimer = null
    applyFn()
    textBox.style.opacity = '1'
    setTimeout(function () {
      textBox.style.transition = ''
      textBox.style.opacity = ''
    }, 220)
  }, 190)
}
function restoreBubbleLines() {
  if (bubbleSwapTimer) { clearTimeout(bubbleSwapTimer); bubbleSwapTimer = null }
  if (hintFadeTimer) { clearTimeout(hintFadeTimer); hintFadeTimer = null }
  if (gifFadeTimer) { clearTimeout(gifFadeTimer); gifFadeTimer = null }
  lastHintText = null
  textBox.style.transition = ''
  textBox.style.opacity = ''
  gifEl.style.display = 'none'
  gifEl.style.opacity = ''
  labelEl.style.display = ''
  labelEl.className = 'dshwv-label'
  labelEl.textContent = getLabelText()
  // 手动台词锁定：气泡内容覆盖为手动台词
  if (typeof manualLine !== 'undefined' && manualLine) {
    var ki = null
    for (var q2 = 0; q2 < BUILTIN_RANDOM_LINES.length; q2++) if (BUILTIN_RANDOM_LINES[q2].t === manualLine) ki = q2
    if (ki !== null) applyBubbleLines(singleCenter(BUILTIN_RANDOM_LINES[ki].s, manualLine, '', BUILTIN_RANDOM_LINES[ki].s === 'A'))
    else applyBubbleLines(singleCenter('A', manualLine, '', true))
    return
  }
  labelEl.style.color = ''
  amountEl.style.display = ''
  amountEl.className = 'dshwv-amount'
  amountEl.style.color = ''
  hintEl.style.display = ''
  hintEl.className = 'dshwv-hint'
  hintEl.style.color = ''
  // 随机台词段/gif 段结束后必须作废残留状态：bubbleRandomActive 会让 render()
  // 反复 applyBubbleLines(旧台词)，额度三行永远回不来。
  bubbleStage = 0
  bubbleRandomActive = false
  bubbleRandomLines = null
  // setHint 的 lastHintText 去重缓存仍记着旧值而 DOM 已被台词/gif 分支清空改写，
  // 不清缓存则副标题永远跳过重写（点过一次气泡后周/月额度/模式提示消失的根因）。
  lastHintText = null
  render()
}
function showBubble() {
  if (!bubbleOn) return
  // 消耗金额泡泡显示期间，余额变动不再弹出普通泡泡
  if (costBubbleActive) return
  if (bubbleTimer) { clearTimeout(bubbleTimer); bubbleTimer = null }
  if (gifFadeTimer) { clearTimeout(gifFadeTimer); gifFadeTimer = null }
  bubbleShown = true
  bubbleStage = 0
  bubbleRandomActive = false
  restoreBubbleLines()
  bubbleBox.classList.add('dshwv-bubble-open')
  // 默认展示当前内容；点击气泡切到随机台词段；总时长 5 秒自动关闭
  bubbleTimer = setTimeout(hideBubble, BUBBLE_MS)
}
function hideBubble() {
  if (bubbleTimer) { clearTimeout(bubbleTimer); bubbleTimer = null }
  if (bubbleSwapTimer) { clearTimeout(bubbleSwapTimer); bubbleSwapTimer = null }
  if (hintFadeTimer) { clearTimeout(hintFadeTimer); hintFadeTimer = null }
  textBox.style.transition = ''
  textBox.style.opacity = ''
  hintEl.style.transition = ''
  hintEl.style.opacity = ''
  bubbleStage = 0
  bubbleRandomActive = false
  bubbleRandomLines = null
  bubbleShown = false
  // 手动台词是"临时看一眼"：气泡关闭后自动解除锁定，下次气泡恢复额度三行。
  // 否则 manualLine 永久劫持所有气泡 → 副标题/周月额度/正常字体全被单行台词顶掉。
  if (manualLine) manualLine = null
  // 台词段结束后（气泡淡出、不可见时）立即恢复默认额度视图。
  // 避开消耗金额泡泡（showCostBubble 自己管理文字）和手动表情锁定。
  if (!costBubbleActive && manualExpr === null) {
    setTimeout(function () {
      restoreBubbleLines()
    }, 260)
  }
  // 只销毁 gif 显示；三行文字保持现状让气泡自然淡出——不能在关闭瞬间
  // 恢复成余额内容（否则随机台词界面会闪现余额）。文字恢复交给下次
  // showBubble() 的 restoreBubbleLines()（那时气泡隐藏，恢复过程不可见）。
  bubbleBox.classList.remove('dshwv-bubble-open')
  // gif 靠 CSS opacity 过渡淡出；display:none 会跳过过渡，须等淡出完成再隐藏
  gifFadeTimer = setTimeout(function () {
    gifFadeTimer = null
    gifEl.style.display = 'none'
  }, 240)
}

// —— 每轮对话消耗金额泡泡 ——
var costBubbleTimer = null
function showCostBubble(amount) {
  if (!bubbleOn || !turnCostOn) return
  if (costBubbleTimer) { clearTimeout(costBubbleTimer); costBubbleTimer = null }
  if (bubbleTimer) { clearTimeout(bubbleTimer); bubbleTimer = null }
  if (gifFadeTimer) { clearTimeout(gifFadeTimer); gifFadeTimer = null }
  costBubbleActive = true
  bubbleRandomActive = false
  bubbleShown = true
  lastHintText = null
  // 样式：第一行 A（标签），第二行 B（红色金额），居中两行
  gifEl.style.display = 'none'
  gifEl.style.opacity = ''
  labelEl.style.display = ''
  labelEl.className = 'dshwv-label'
  labelEl.textContent = '上一轮对话消耗:'
  labelEl.style.color = ''
  amountEl.style.display = ''
  amountEl.className = 'dshwv-amount'
  amountEl.textContent = '¥ ' + (isFinite(amount) ? Number(amount).toFixed(2) : '--')
  amountEl.style.color = '#e0433f'
  hintEl.style.display = 'none'
  hintEl.textContent = ''
  hintEl.style.color = ''
  textBox.style.transition = ''
  textBox.style.opacity = ''
  bubbleBox.classList.add('dshwv-bubble-open')
  if (turnCostCloseMs > 0) {
    costBubbleTimer = setTimeout(hideCostBubble, turnCostCloseMs)
  }
}
function hideCostBubble() {
  if (costBubbleTimer) { clearTimeout(costBubbleTimer); costBubbleTimer = null }
  costBubbleActive = false
  hideBubble()
}

function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v) }
function viewport() {
  return {
    w: window.innerWidth || document.documentElement.clientWidth || 1280,
    h: window.innerHeight || document.documentElement.clientHeight || 800
  }
}
function fmt(balance, currency) {
  var num = Number(balance)
  if (!isFinite(num)) return '--'
  if (currency === '%' || !currency) return num.toFixed(1) + '%'
  return '¥ ' + num.toFixed(2)
}
function animateAmount(from, to, currency, duration) {
  // 消耗金额泡泡显示期间，余额数字滚动不触碰金额行
  if (costBubbleActive) return
  if (animId) cancelAnimationFrame(animId)
  if (from === null || !isFinite(from)) from = to
  if (from === to) {
    shown = to
    amountEl.textContent = fmt(to, currency)
    return
  }
  var startTime = null
  function step(ts) {
    if (startTime === null) startTime = ts
    var t = Math.min(1, (ts - startTime) / duration)
    var eased = 1 - Math.pow(1 - t, 3)
    var val = from + (to - from) * eased
    amountEl.textContent = fmt(val, currency)
    if (t < 1) {
      animId = requestAnimationFrame(step)
    } else {
      animId = null
      shown = to
      amountEl.textContent = fmt(to, currency)
    }
  }
  animId = requestAnimationFrame(step)
}
function render() {
  // 消耗金额泡泡显示期间，余额渲染不覆盖其内容（金额行/标题行/提示行）
  if (costBubbleActive) return
  var amount, hint
  if (state.status === 'error') {
    amount = shown !== null ? fmt(shown, state.currency) : '--'
    hint = state.message ? state.message.slice(0, 14) : '获取失败 · 点击重试'
  } else if (state.balance === null) {
    amount = shown !== null ? fmt(shown, state.currency) : '…'
    hint = '加载中…'
  } else {
    amount = shown !== null ? fmt(shown, state.currency) : fmt(state.balance, state.currency)
    var mode = MODES[state.modeIndex] || MODES[0]
    if (selectedAccountIdx === -1) {
      hint = '今日消耗 ¥' + todayCost.toFixed(2)
    } else {
      hint = mode.label
    }
  }
  amountEl.textContent = amount
  if (bubbleRandomActive && bubbleRandomLines) {
    applyBubbleLines(bubbleRandomLines)
  } else {
    setHint(hint)
  }
}
function express() {
  root.style.right = 'auto'
  root.style.bottom = 'auto'
  root.style.left = state.left + 'px'
  root.style.top = state.top + 'px'
  root.classList.toggle('dshwv-left', state.h === 'left')
}
function settle() {
  var vp = viewport()
  var w = root.offsetWidth || root.getBoundingClientRect().width || 0
  var h = root.offsetHeight || root.getBoundingClientRect().height || 0
  if (drag && drag.active) {
    // mid-drag resize: keep the pointer-follow position, just clamp into view
    state.left = clamp(state.left, 0, Math.max(0, vp.w - w))
    state.top = clamp(state.top, 0, Math.max(0, vp.h - h))
    express()
    return
  }
  if (state.h === 'right') {
    state.left = Math.max(0, vp.w - w - state.hOff)
  } else if (state.h === 'left') {
    state.left = state.hOff
  } else {
    state.left = clamp(state.left, 0, Math.max(0, vp.w - w))
  }
  if (state.v === 'bottom') {
    state.top = Math.max(0, vp.h - h - state.vOff)
  } else if (state.v === 'top') {
    state.top = state.vOff
  } else {
    state.top = clamp(state.top, 0, Math.max(0, vp.h - h))
  }
  express()
}
function refresh(manual) {
  if (busy) return
  busy = true
  if (animDelayTimer) { clearTimeout(animDelayTimer); animDelayTimer = null }
  // 只有从未拿到过数据时才进入 loading 视觉态；
  // 已有数据的手动刷新静默进行（防"获取失败/加载中"闪现）
  if (manual || state.balance === null) {
    if (state.balance === null) { state.status = 'loading'; render() }
  }
  var ctrl = null
  var timer = null
  try {
    ctrl = new AbortController()
    timer = setTimeout(function () { try { ctrl.abort() } catch (err) {} }, FETCH_TIMEOUT_MS)
  } catch (err) {}
  // selectedAccountIdx = -1 表示 DeepSeek 余额模式
  if (selectedAccountIdx === -1) {
    fetchDeepSeekBalance(ctrl, manual)
  } else {
    fetchVolcUsage(ctrl, manual)
  }
}
function fetchDeepSeekBalance(ctrl, manual) {
  var timer = null
  try {
    timer = setTimeout(function () { try { if (ctrl) ctrl.abort() } catch (err) {} }, FETCH_TIMEOUT_MS)
  } catch (err) {}
  fetch('/dsh-whale/balance.json', { cache: 'no-store', signal: ctrl ? ctrl.signal : undefined })
    .then(function (r) { return r.json() })
    .then(function (data) {
      if (data && data.ok) {
        var nb = Number(data.totalBalance)
        state.balance = nb
        state.currency = 'CNY'
        state.activeName = 'DeepSeek'
        state.percents = { session: null, weekly: null, monthly: null }
        // 峰谷时段 + 平台今日消耗：服务端 balance.json 已计算，前端此前漏读
        state.isPeak = !!data.isPeak
        if (data.todayUsage !== undefined && data.todayUsage !== null && isFinite(Number(data.todayUsage))) {
          state.todayUsage = Number(data.todayUsage)
        }
        state.status = 'ok'
        state.message = ''
        var changed = state.balance !== null && (nb !== state.balance)
        if (changed) {
          if (!manual) {
            showBubble()
            state.status = 'changing'
            if (animDelayTimer) clearTimeout(animDelayTimer)
            animDelayTimer = setTimeout(function () {
              animDelayTimer = null
              animateAmount(shown, nb, 'CNY', ANIM_MS)
            }, 300)
            if (settleTimer) clearTimeout(settleTimer)
            settleTimer = setTimeout(function () {
              settleTimer = null
              if (state.status === 'changing') { state.status = 'ok'; render() }
            }, CHANGE_MS + 300)
          } else {
            animateAmount(shown, nb, 'CNY', ANIM_MS)
            state.status = 'ok'
            render()
          }
        } else {
          if (animId === null) shown = nb
          state.status = 'ok'
          render()
        }
      } else {
        state.status = 'error'
        state.message = (data && data.error) ? String(data.error) : '获取失败'
        render()
      }
    })
    .catch(function () {
      state.status = 'error'
      state.message = '获取失败'
      render()
    })
    .finally(function () {
      busy = false
      if (timer) clearTimeout(timer)
    })
}
function fetchVolcUsage(ctrl, manual) {
  var timer = null
  try {
    timer = setTimeout(function () { try { if (ctrl) ctrl.abort() } catch (err) {} }, FETCH_TIMEOUT_MS)
  } catch (err) {}
  fetch('/api/volc-usage', { cache: 'no-store', signal: ctrl ? ctrl.signal : undefined })
    .then(function (r) { return r.json() })
    .then(function (data) {
      if (data && data.ok && Array.isArray(data.accounts) && data.accounts.length > 0) {
        var acc = null
        if (selectedAccountIdx > 0) {
          // 手动选了某个账号
          for (var i = 0; i < data.accounts.length; i++) {
            if (data.accounts[i].idx === selectedAccountIdx && data.accounts[i].ok !== false) { acc = data.accounts[i]; break }
          }
        }
        if (!acc) {
          // 跟随激活账号
          for (var j = 0; j < data.accounts.length; j++) {
            if (data.accounts[j].idx === data.activeIdx && data.accounts[j].ok !== false) { acc = data.accounts[j]; break }
          }
        }
        if (!acc) {
          // 兜底：第一个可用的
          for (var k = 0; k < data.accounts.length; k++) {
            if (data.accounts[k].ok !== false) { acc = data.accounts[k]; break }
          }
        }
        if (acc) {
          function pctOf(a, lvl) {
            var rows = a && a.plan && a.plan.QuotaUsage ? a.plan.QuotaUsage : []
            for (var k = 0; k < rows.length; k++) {
              if (rows[k].Level === lvl) return Math.min(100, Math.max(0, Number(rows[k].Percent) || 0))
            }
            return null
          }
          state.percents = {
            session: pctOf(acc, 'session'),
            weekly: pctOf(acc, 'weekly'),
            monthly: pctOf(acc, 'monthly'),
          }
          state.activeName = acc.name || ''
          // 疲惫模式：会话配额 ≥90%
          var sessPct = state.percents.session
          if (sessPct !== null && sessPct !== undefined && sessPct >= 90) {
            exprSetExhausted(true)
          } else {
            exprSetExhausted(false)
          }
          var newPct = state.percents[MODES[state.modeIndex].key]
          var newBalance = (newPct === null) ? null : newPct
          var changed = state.balance !== null && newBalance !== null && (newBalance !== state.balance)
          state.balance = newBalance
          state.status = newBalance === null ? 'error' : 'ok'
          state.message = newBalance === null ? (MODES[state.modeIndex].label + '数据缺失') : ''
          if (changed) {
            if (!manual) {
              showBubble()
              state.status = 'changing'
              if (animDelayTimer) clearTimeout(animDelayTimer)
              animDelayTimer = setTimeout(function () {
                animDelayTimer = null
                animateAmount(shown, newBalance, '%', ANIM_MS)
              }, 300)
              if (settleTimer) clearTimeout(settleTimer)
              settleTimer = setTimeout(function () {
                settleTimer = null
                if (state.status === 'changing') { state.status = 'ok'; render() }
              }, CHANGE_MS + 300)
            } else {
              animateAmount(shown, newBalance, '%', ANIM_MS)
              state.status = 'ok'
              render()
            }
          } else {
            if (animId === null) shown = newBalance
            state.status = newBalance === null ? 'error' : 'ok'
            render()
          }
        } else {
          if (state.balance === null) { state.status = 'error'; state.message = '无可用账号'; render() }
        }
      } else {
        if (state.balance === null) {
          state.status = 'error'
          state.message = (data && data.error) ? String(data.error) : '火山用量接口无数据'
          render()
        }
      }
    })
    .catch(function () {
      // 瞬时失败（网络抖动/超时）：若已有数据则保留旧值不闪错误；仅无数据时才报错
      if (state.balance === null) {
        state.status = 'error'
        state.message = '获取失败'
        render()
      }
    })
    .finally(function () {
      busy = false
      if (timer) clearTimeout(timer)
    })
}
var soundOn = true
var soundVol = 0.9
var soundSet = 'duck'
var usageMode = 'ledger'
var peakMode = 'default'
var bubbleOn = true
var turnCostOn = true
var turnCostCloseMs = 5000
var lastCostSeq = 0
var costBubbleActive = false
function saveConfig() {
  try {
    fetch(SIZE_URL, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scale: state.scale, sound: soundOn, vol: soundVol, soundSet: soundSet, usageMode: usageMode, peakMode: peakMode, bubbleOn: bubbleOn, turnCostOn: turnCostOn, turnCostCloseMs: turnCostCloseMs }) })
  } catch (err) {}
}
function setUsageMode(v) {
  usageMode = v === 'token' ? 'token' : 'ledger'
  saveConfig()
  refresh(false)
}
function setPeakMode(v) {
  peakMode = v === 'liangwen' || v === 'qiangqiang' ? v : 'default'
  peakSelect.value = peakMode
  saveConfig()
}
function setBubbleOn(v) {
  bubbleOn = !!v
  bubbleToggle.checked = bubbleOn
  saveConfig()
  if (!bubbleOn) hideBubble()
}
function setTurnCostOn(v) {
  turnCostOn = !!v
  turnCostToggle.checked = turnCostOn
  saveConfig()
  if (!turnCostOn) hideCostBubble()
}
function setTurnCostClose(v) {
  var n = Math.max(0, Math.round(Number(v) || 0))
  turnCostCloseMs = n * 1000
  turnCostCloseInput.value = String(n)
  saveConfig()
}
function scaleToDisplay(s) {
  return Math.round((s - MIN_SCALE) / ((MAX_SCALE - MIN_SCALE) / 19)) + 1
}
function setScale(v) {
  var next = Math.round(Math.min(MAX_SCALE, Math.max(MIN_SCALE, Number(v))) * 10) / 10
  var rect = root.getBoundingClientRect()
  // fixed point: the whale's corner — bottom-right when unflipped, bottom-left
  // when flipped. Growing extends the widget up-left / up-right from that
  // corner; shrinking pulls it back toward the corner. The whale always hugs
  // its corner while scaling.
  var fx = state.h === 'left' ? rect.left : rect.right
  var fy = rect.bottom
  state.scale = next
  root.style.setProperty('--dshw-scale', String(next))
  scaleInput.value = String(next)
  scaleNumber.value = String(scaleToDisplay(next))
  try { localStorage.setItem('dsh-whale-scale', String(next)) } catch (err) {}
  saveConfig()
  // keep the corner fixed while resizing; the position correction applies
  // instantly because the caller disables the transition for the whole drag
  var r2 = root.getBoundingClientRect()
  var vp = viewport()
  if (state.h === 'left') {
    state.left = Math.min(Math.max(fx, 0), Math.max(0, vp.w - r2.width))
  } else {
    state.left = Math.min(Math.max(fx - r2.width, 0), Math.max(0, vp.w - r2.width))
  }
  state.top = Math.min(Math.max(fy - r2.height, 0), Math.max(0, vp.h - r2.height))
  express()
}
function setVol(v) {
  var next = Math.round(Math.min(1, Math.max(0, Number(v))) * 100) / 100
  soundVol = next
  soundOn = next > 0
  volInput.value = String(next)
  volPct.textContent = Math.round(next * 100) + '%'
  try {
    if (pressAudio) pressAudio.volume = next
    if (releaseAudio) releaseAudio.volume = next
  } catch (err) {}
  saveConfig()
}
function setSoundSet(v) {
  soundSet = v === 'fx1' ? 'fx1' : 'duck'
  soundSelect.value = soundSet
  applySoundSet()
  saveConfig()
}
var SQUISH = 'scaleY(0.88) scaleX(1.05)'
var pressAudio = null
var releaseAudio = null
var pressing = false
var pressEnded = false
var releasePlayed = false
var releaseTimer = null
function applySoundSet() {
  try {
    pressAudio = new Audio('/dsh-whale/sound/press.mp3?set=' + soundSet)
    pressAudio.preload = 'auto'
    pressAudio.volume = soundVol
    releaseAudio = new Audio('/dsh-whale/sound/release.mp3?set=' + soundSet)
    releaseAudio.preload = 'auto'
    releaseAudio.volume = soundVol
  } catch (err) {}
}
function playPress() {
  if (!pressAudio || !soundOn) return
  try {
    if (releaseTimer) { clearTimeout(releaseTimer); releaseTimer = null }
    if (releaseAudio) {
      releaseAudio.pause()
      releaseAudio.currentTime = 0
    }
    pressEnded = false
    releasePlayed = false
    pressAudio.onended = function () {
      pressEnded = true
      // fallback (duration unknown): click → Ya2 right after Ya1 ends
      if (!pressing && !releasePlayed) playRelease()
      // hold: still pressed → wait for pressUp()
    }
    pressAudio.currentTime = 0
    var p = pressAudio.play()
    if (p && typeof p.catch === 'function') p.catch(function () {})
  } catch (err) {}
}
function playRelease() {
  if (releasePlayed || !releaseAudio || !soundOn) return
  releasePlayed = true
  try {
    releaseAudio.currentTime = 0
    var p = releaseAudio.play()
    if (p && typeof p.catch === 'function') p.catch(function () {})
  } catch (err) {}
}
function pressDown() {
  body.style.transform = SQUISH
  pressing = true
  if (mood === 'normal' && !exhaustedMode) exprSetImg(EXPR_URL(exprVer === 'v1' ? 'stroking' : 'close_eyes'))
  playPress()
}
function pressUp() {
  body.style.transform = 'scaleY(1) scaleX(1)'
  pressing = false
  exprApplyIcon()
  if (pressEnded) {
    // hold (or released after Ya1 finished) → Ya2 now
    playRelease()
    return
  }
  // click: start Ya2 in the last 100ms of Ya1's playback
  var durKnown = false
  var remainMs = 0
  try {
    var dur = pressAudio ? pressAudio.duration : 0
    if (isFinite(dur) && dur > 0) {
      durKnown = true
      remainMs = (dur - pressAudio.currentTime) * 1000
    }
  } catch (err) {}
  if (durKnown) {
    releaseTimer = setTimeout(function () {
      releaseTimer = null
      playRelease()
    }, Math.max(0, remainMs - 100))
  }
  // duration unknown → pressAudio.onended fallback plays Ya2 after Ya1 ends
}
var menuOpen = false
function toggleMenu() {
  menuOpen = !menuOpen
  if (menuOpen) { positionMenu(); if (typeof lineSelectOptions === 'function') lineSelectOptions() }
  menuBox.classList.toggle('dshwv-menu-open', menuOpen)
  if (menuOpen) menuBtn.classList.add('dshwv-menu-btn-visible')
}
function closeMenu() {
  menuOpen = false
  menuBox.classList.remove('dshwv-menu-open')
  root.style.transition = ''
  snapCheck()
}
function snapCheck() {
  var rect = root.getBoundingClientRect()
  var vp = viewport()
  var w = rect.width, h = rect.height
  var left = rect.left, top = rect.top
  var centerX = left + w / 2
  var centerY = top + h / 2
  var moved = false
  if (centerX < vp.w / 4) {
    state.h = 'left'
    state.hOff = 0
    left = 0
    moved = true
  } else if (centerX > vp.w * 3 / 4) {
    state.h = 'right'
    state.hOff = 0
    left = vp.w - w
    moved = true
  } else {
    state.h = null
    state.hOff = left
  }
  if (centerY < vp.h / 4) {
    state.v = 'top'
    state.vOff = 0
    top = 0
    moved = true
  } else {
    state.v = 'bottom'
    state.vOff = Math.max(0, vp.h - top - h)
  }
  if (moved) {
    state.left = left
    state.top = top
    settle()
  }
}
function positionMenu() {
  try {
    var r = root.getBoundingClientRect()
    var b = menuBtn.getBoundingClientRect()
    var vp = viewport()
    var onLeft = r.left + r.width / 2 < vp.w / 2
    // the menu appears ABOVE the button, anchored to its side:
    // right side → menu bottom-right aligns with the button's top-right;
    // left side → menu bottom-left aligns with the button's top-left
    if (onLeft) {
      menuBox.style.left = b.left + 'px'
      menuBox.style.right = 'auto'
      menuBox.style.transformOrigin = 'bottom left'
    } else {
      menuBox.style.right = (vp.w - b.right) + 'px'
      menuBox.style.left = 'auto'
      menuBox.style.transformOrigin = 'bottom right'
    }
    menuBox.style.bottom = (vp.h - b.top) + 'px'
    menuBox.style.top = 'auto'
  } catch (err) {}
}

var hitCanvas = null
var hitReady = false
var hitRetryTimer = null
function setupHitTest() {
  try {
    hitCanvas = document.createElement('canvas')
    hitCanvas.width = 610
    hitCanvas.height = 610
    var probe = new Image()
    probe.onload = function () {
      try {
        hitCanvas.getContext('2d').drawImage(probe, 0, 0)
        hitReady = true
      } catch (err) { scheduleHitRetry() }
    }
    probe.onerror = function () { scheduleHitRetry() }
    probe.src = IMG_URL()
  } catch (err) { scheduleHitRetry() }
}
// 探测图加载失败（服务器还没起来/断网）时延迟重试，避免 hitReady 永久 false
function scheduleHitRetry() {
  if (hitRetryTimer) return
  hitRetryTimer = setTimeout(function () {
    hitRetryTimer = null
    hitCanvas = null
    hitReady = false
    setupHitTest()
  }, 2500)
}
function isWhaleHit(e) {
  // 命中判定未就绪/异常时宁可不响应（鲸鱼点不动），也不能返回 true 把整页点击吃掉
  if (!hitCanvas || !hitReady) return false
  try {
    var r = img.getBoundingClientRect()
    if (!r || r.width <= 0 || r.height <= 0) return false
    var lx = (e.clientX - r.left) / r.width * 610
    var ly = (e.clientY - r.top) / r.height * 610
    if (lx < 0 || ly < 0 || lx >= 610 || ly >= 610) return false
    if (state.h === 'left') lx = 610 - lx
    var data = hitCanvas.getContext('2d').getImageData(Math.floor(lx), Math.floor(ly), 1, 1).data
    return data[3] > 10
  } catch (err) {
    return false
  }
}
function onDocPointerDown(e) {
  if (e.target && e.target.closest) {
    if (e.target.closest('.dshwv-bubble') || e.target.closest('.dshwv-menu') || e.target.closest('.dshwv-menu-btn')) return
  }
  if (menuOpen) {
    closeMenu()
    return
  }
  if (e.button !== 0 && e.pointerType === 'mouse') return
  if (!isWhaleHit(e)) return
  try { e.preventDefault(); e.stopPropagation() } catch (err) {}
  var vp = viewport()
  var rect = root.getBoundingClientRect()
  drag = { active: true, startX: e.clientX, startY: e.clientY, origLeft: rect.left, origTop: rect.top, w: rect.width, h: rect.height, moved: false, vp: vp }
  root.classList.add('dshwv-dragging')
  pressDown()
  setWidgetCursor('grabbing')
  document.addEventListener('pointermove', onDocPointerMove, true)
  document.addEventListener('pointerup', onDocPointerUp, true)
  document.addEventListener('pointercancel', onDocPointerCancel, true)
  document.addEventListener('click', onDocClickStopper, true)
}
function onDocPointerMove(e) {
  if (!drag || !drag.active) return
  var dx = e.clientX - drag.startX
  var dy = e.clientY - drag.startY
  if (dx * dx + dy * dy >= CLICK_SQ) drag.moved = true
  // Keep the pre-drag flip orientation while dragging (state.h/v stay as they
  // were); on release endDrag() recomputes the anchors and settle() flips the
  // class with a smooth transition instead of reverting instantly.
  state.left = clamp(drag.origLeft + dx, 0, Math.max(0, drag.vp.w - drag.w))
  state.top = clamp(drag.origTop + dy, 0, Math.max(0, drag.vp.h - drag.h))
  express()
}
function onDocPointerUp(e) { endDrag(e, true) }
function onDocPointerCancel(e) { endDrag(e, false) }
function onDocClickStopper(e) {
  try { e.preventDefault(); e.stopPropagation() } catch (err) {}
}
document.addEventListener('pointerdown', onDocPointerDown, true)

var widgetCursor = ''
function setWidgetCursor(v) {
  if (v !== widgetCursor) {
    widgetCursor = v
    try { document.body.style.cursor = v } catch (err) {}
  }
}
function onDocPointerMoveCursor(e) {
  if (drag && drag.active) { setWidgetCursor('grabbing'); return }
  var el = null
  try { el = document.elementFromPoint(e.clientX, e.clientY) } catch (err) {}
  if (el && el.closest && (el.closest('.dshwv-bubble') || el.closest('.dshwv-menu') || el.closest('.dshwv-menu-btn'))) {
    setWidgetCursor('')
    menuBtn.classList.add('dshwv-menu-btn-visible')
    return
  }
  var over = isWhaleHit(e)
  setWidgetCursor(over ? 'grab' : '')
  menuBtn.classList.toggle('dshwv-menu-btn-visible', over || menuOpen)
}
document.addEventListener('pointermove', onDocPointerMoveCursor, true)

function endDrag(e, clickAllowed) {
  if (!drag || !drag.active) return
  drag.active = false
  document.removeEventListener('pointermove', onDocPointerMove, true)
  document.removeEventListener('pointerup', onDocPointerUp, true)
  document.removeEventListener('pointercancel', onDocPointerCancel, true)
  document.removeEventListener('click', onDocClickStopper, true)
  pressUp()
  root.classList.remove('dshwv-dragging')
  setWidgetCursor(isWhaleHit(e) ? 'grab' : '')
  if (clickAllowed && !drag.moved) {
    exprRegisterClick()          // 连点 → 生气
    exprOnUserActivity()         // 失落恢复 + 重置空闲计时
    showBubble(); refresh(true); return
  }
  var dx = e.clientX - drag.startX
  var dy = e.clientY - drag.startY
  var left = clamp(drag.origLeft + dx, 0, Math.max(0, drag.vp.w - drag.w))
  var top = clamp(drag.origTop + dy, 0, Math.max(0, drag.vp.h - drag.h))
  var centerX = left + drag.w / 2
  var centerY = top + drag.h / 2
  if (centerX < drag.vp.w / 4) {
    state.h = 'left'
    state.hOff = 0
  } else if (centerX > drag.vp.w * 3 / 4) {
    state.h = 'right'
    state.hOff = 0
  } else {
    state.h = null
    state.hOff = left
  }
  if (centerY < drag.vp.h / 4) {
    state.v = 'top'
    state.vOff = 0
  } else if (centerY > drag.vp.h * 3 / 4) {
    state.v = 'bottom'
    state.vOff = 0
  } else {
    state.v = null
    state.vOff = top
  }
  state.left = left
  state.top = top
  settle()
}
window.addEventListener('resize', function () {
  settle()
})

// 防刷新闪现：首次测量前同步恢复 scale + 隐藏，配置链结束再显示
root.style.visibility = 'hidden'
try {
  var _ps = parseFloat(localStorage.getItem('dsh-whale-scale'))
  if (isFinite(_ps) && _ps >= MIN_SCALE - 0.1 && _ps <= MAX_SCALE + 0.1) {
    state.scale = _ps
    root.style.setProperty('--dshw-scale', String(_ps))
  }
} catch (err) {}
var rect0 = root.getBoundingClientRect()
state.left = rect0.left
state.top = rect0.top
express()
render()
applySoundSet()
setupHitTest()
fetch(SIZE_URL, { cache: 'no-store' })
  .then(function (r) { return r.json() })
  .then(function (d) {
    if (d && typeof d.scale === 'number' && d.scale >= MIN_SCALE - 0.1 && d.scale <= MAX_SCALE + 0.1) {
      state.scale = d.scale
      root.style.setProperty('--dshw-scale', String(d.scale))
      scaleInput.value = String(d.scale)
      scaleNumber.value = String(scaleToDisplay(d.scale))
      settle()
    }
    if (d && typeof d.vol === 'number') {
      soundVol = d.vol
      soundOn = soundVol > 0
      volInput.value = String(soundVol)
      volPct.textContent = Math.round(soundVol * 100) + '%'
      try {
        if (pressAudio) pressAudio.volume = soundVol
        if (releaseAudio) releaseAudio.volume = soundVol
      } catch (err) {}
    }
    if (d && typeof d.soundSet === 'string') {
      soundSet = d.soundSet === 'fx1' ? 'fx1' : 'duck'
      soundSelect.value = soundSet
      applySoundSet()
    }
    if (d && typeof d.usageMode === 'string') {
      usageMode = d.usageMode === 'token' ? 'token' : 'ledger'
    }
    try {
      var savedAcct = localStorage.getItem('dsh-whale-usage-acct')
      if (savedAcct === '0' || savedAcct === '1' || savedAcct === '2' || savedAcct === '-1') {
        usageSelect.value = savedAcct
        selectedAccountIdx = (savedAcct === '-1') ? -1 : (Number(savedAcct) || 0)
        state.currency = (selectedAccountIdx === -1) ? 'CNY' : '%'
      }
    } catch (err) {}
    if (d && typeof d.peakMode === 'string') {
      peakMode = d.peakMode === 'liangwen' || d.peakMode === 'qiangqiang' ? d.peakMode : 'default'
      peakSelect.value = peakMode
    }
    if (d && typeof d.bubbleOn === 'boolean') {
      bubbleOn = d.bubbleOn
      bubbleToggle.checked = bubbleOn
    }
    if (d && typeof d.turnCostOn === 'boolean') {
      turnCostOn = d.turnCostOn
      turnCostToggle.checked = turnCostOn
    }
    if (d && typeof d.turnCostCloseMs === 'number') {
      turnCostCloseMs = d.turnCostCloseMs > 0 ? d.turnCostCloseMs : 0
      turnCostCloseInput.value = String(Math.round(turnCostCloseMs / 1000))
    }
    refresh(false)
  })
  .catch(function () { refresh(false) }).finally(function () { root.style.visibility = '' })
setInterval(function () { refresh(false) }, REFRESH_MS)

// ===== 表情系统：悬停检测（document 级，静止悬停在鲸鱼上 8 秒 → 害羞）=====
document.addEventListener('pointermove', function (e) {
  exprOnUserActivity()
  if (typeof isWhaleHit === 'function' && isWhaleHit(e)) {
    exprRegisterHoverStart()
  } else {
    exprRegisterHoverEnd()
  }
}, { passive: true })
document.addEventListener('pointerdown', function () { exprOnUserActivity() }, { passive: true })
// 初始化：启动眨眼 + 空闲计时
exprScheduleBlink()
exprResetIdle()

// —— 每轮对话消耗检测：轮询 last-turn.json，出现新 seq 时弹消耗金额泡泡 ——
var LAST_TURN_URL = '/dsh-whale/last-turn.json'
var lastCostSeq = 0
var lastCostAligned = false
var todayCost = 0
function loadTodayCost() {
  try {
    var raw = localStorage.getItem('dsh-whale-today-cost')
    if (!raw) return
    var obj = JSON.parse(raw)
    var today = new Date().toISOString().slice(0, 10)
    if (obj.date === today && typeof obj.amount === 'number') {
      todayCost = obj.amount
    }
  } catch (err) {}
}
function saveTodayCost() {
  try {
    localStorage.setItem('dsh-whale-today-cost', JSON.stringify({
      date: new Date().toISOString().slice(0, 10),
      amount: todayCost,
    }))
  } catch (err) {}
}
loadTodayCost()
function pollLastTurn() {
  try {
    fetch(LAST_TURN_URL, { cache: 'no-store' })
      .then(function (r) { return r.json() })
      .then(function (d) {
        if (!d || !d.ok || typeof d.seq !== 'number') return
        if (!lastCostAligned) {
          // 首次拿到数据：只对齐 seq，不弹旧轮次
          lastCostSeq = d.seq
          lastCostAligned = true
          return
        }
        if (d.seq > lastCostSeq) {
          lastCostSeq = d.seq
          if (d.turn !== null && d.amount !== null) {
            showCostBubble(Number(d.amount))
            // 累加今日消耗
            var newAmount = Number(d.amount)
            if (isFinite(newAmount) && newAmount > 0) {
              todayCost += newAmount
              saveTodayCost()
              render()
            }
          }
        }
      })
      .catch(function () {})
  } catch (err) {}
}
setInterval(pollLastTurn, 1000)
})()`


const name = 'whale-balance-widget'
const inject = ['webServer', 'credentials']

function apply(ctx) {
    let imageBytes = null
    let balanceCache = null
    let balanceInFlight = null
    let gifBytes = null
    // 每轮对话消耗统计：turn -> 聚合中的成本/分词；完成后写入 lastTurn
    let turnAgg = null // { turn, cost, tokens, lastTs }
    let lastTurn = null // { turn, amount, tokens, ts }
    let lastTurnSeq = 0
    const disposers = []

    function resetTurnAgg() {
      turnAgg = null
    }
    function finalizeTurn() {
      if (turnAgg && turnAgg.cost > 0) {
        lastTurn = { turn: turnAgg.turn, amount: turnAgg.cost, tokens: turnAgg.tokens, ts: turnAgg.lastTs }
        lastTurnSeq++
      }
      turnAgg = null
    }
    // 监听会话事件流：assistant/message 携带每步真实 usage，按 turn 聚合；
    // turn/end 时结算本轮并写入 lastTurn
    function handleSessionEvent(event) {
      try {
        const type = event && event.type
        const d = event && event.data
        if (!d || typeof d !== 'object') return
        if (type === 'turn/end') {
          // 一轮对话结束：结算并清空聚合
          finalizeTurn()
          return
        }
        if (type !== 'assistant/message') return
        const turn = Number(d.turn)
        const usage = d.usage
        if (!usage || typeof usage !== 'object' || !isFinite(turn)) return
        if (!turnAgg || turnAgg.turn !== turn) {
          if (turnAgg && turnAgg.turn !== turn) finalizeTurn()
          if (!turnAgg || turnAgg.turn !== turn) turnAgg = { turn, cost: 0, tokens: 0, lastTs: Date.now() }
        }
        const input = Number(usage.inputTokens) || 0
        const cache = Number(usage.cacheReadTokens) || 0
        const output = Number(usage.outputTokens) || 0
        const reasoning = Number(usage.reasoningTokens) || 0
        turnAgg.tokens += input + cache + output + reasoning
        // 定价换算（CNY/百万 token；缓存命中=输入价，其余按各自档位）
        const model = d.message && d.message.source ? d.message.source.model : ''
        const p = priceFor(model)
        const off = isPeakTime(Math.floor(Date.now() / 1000)) ? 1 : 0
        turnAgg.cost += (cache / 1e6) * p.hit[off] + (input / 1e6) * p.miss[off] + ((output + reasoning) / 1e6) * p.out[off]
        turnAgg.lastTs = Date.now()
      } catch (err) {}
    }

    // 监听所有会话的追加事件；turn/end 时结算本轮
    disposers.push(ctx.on('session/event', (session, event) => {
      // [debug] 确认事件是否到达（下个版本移除）
      if (event && (event.type === 'turn/end' || event.type === 'assistant/message')) {
        try { console.error('[whale-balance:event]', event.type, 'turn=' + (event.data && event.data.turn), 'usage=' + (event.data && event.data.usage ? 'yes' : 'no')) } catch (err) {}
      }
      handleSessionEvent(event)
    }))

    function loadGif() {
      if (gifBytes) return gifBytes
      for (const p of RUA_GIF_CANDIDATES) {
        try {
          const bytes = fs.readFileSync(p)
          if (bytes && bytes.length > 0) {
            gifBytes = bytes
            return bytes
          }
        } catch (err) {}
      }
      throw new Error('rua gif not found')
    }

    function loadImage() {
      if (imageBytes) return imageBytes
      for (const p of IMAGE_CANDIDATES) {
        try {
          const bytes = fs.readFileSync(p)
          if (bytes && bytes.length > 0) {
            imageBytes = bytes
            return bytes
          }
        } catch (err) {}
      }
      throw new Error('whale image not found')
    }

    async function fetchBalance() {
      let cred
      try {
        cred = await ctx.credentials.resolve('DEEPSEEK_API_KEY')
      } catch (err) {
        return { ok: false, code: 'NO_KEY', error: '凭据读取失败: ' + String((err && err.message) || err).slice(0, 160) }
      }
      if (!cred) {
        return { ok: false, code: 'NO_KEY', error: '未配置 DEEPSEEK_API_KEY' }
      }
      let lastErr = null
      for (let attempt = 0; attempt < 2; attempt++) {
        let res
        try {
          res = await fetch(BALANCE_URL, {
            headers: { Authorization: 'Bearer ' + cred.value },
            signal: AbortSignal.timeout(20000),
          })
        } catch (err) {
          lastErr = err
          if (attempt === 0) await new Promise((r) => setTimeout(r, 500))
          continue
        }
        if (!res.ok) {
          lastErr = new Error('HTTP ' + res.status)
          if (res.status < 500) break
          if (attempt === 0) await new Promise((r) => setTimeout(r, 500))
          continue
        }
        let data
        try {
          data = await res.json()
        } catch (err) {
          return { ok: false, code: 'PARSE', error: '余额接口返回不是合法 JSON' }
        }
        const info = data && Array.isArray(data.balance_infos) ? data.balance_infos[0] : null
        if (!info || info.total_balance === undefined) {
          return { ok: false, code: 'SHAPE', error: '余额接口返回结构异常' }
        }
        return {
          ok: true,
          totalBalance: Number(info.total_balance),
          currency: String(info.currency || 'CNY'),
          updatedAt: new Date().toISOString(),
        }
      }
      const transient = !(lastErr && /^HTTP 4\d\d/.test(lastErr.message))
      return {
        ok: false,
        code: 'HTTP',
        transient: transient,
        error: '余额接口请求失败: ' + String((lastErr && lastErr.message) || lastErr).slice(0, 200),
      }
    }

    async function fetchUsage() {
      let cred
      try {
        cred = await ctx.credentials.resolve('DEEPSEEK_PLATFORM_TOKEN')
      } catch (err) {
        return { error: 'platform cred resolve failed' }
      }
      if (!cred) return { error: 'no platform token' }
      const token = String(cred.value).replace(/^Bearer\s+/i, '')
      try {
        const now = new Date()
        const tz = -now.getTimezoneOffset() * 60
        const start = Math.floor(new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() / 1000)
        const end = start + 86400
        const url = 'https://platform.deepseek.com/api/v0/usage/by_api_key/amount?start=' + start + '&end=' + end + '&tz=' + tz
        const res = await fetch(url, {
          headers: { Authorization: 'Bearer ' + token },
          signal: AbortSignal.timeout(15000),
        })
        if (!res.ok) return { error: 'http ' + res.status }
        const data = await res.json()
        const u = computeTodayUsage(data)
        if (u && isFinite(u.amount)) return { amount: u.amount, tokens: u.tokens }
        return { error: 'no usage' }
      } catch (err) {
        return { error: String((err && err.message) || err) }
      }
    }

    function computeTodayUsage(data) {
      // data.data.biz_data.series[]: [{model, buckets:[{time, usage:{RESPONSE_TOKEN, PROMPT_CACHE_HIT_TOKEN, PROMPT_CACHE_MISS_TOKEN}}]}]
      let d = data
      if (d && d.data && d.data.biz_data && Array.isArray(d.data.biz_data.series)) d = d.data.biz_data
      else if (d && d.data && Array.isArray(d.data.series)) d = d.data
      const series = Array.isArray(d.series) ? d.series : null
      if (!series || series.length === 0) return null
      let cost = 0
      let tokens = 0
      let found = false
      for (const s of series) {
        if (!s || typeof s !== 'object') continue
        const p = priceFor(s.model)
        const buckets = Array.isArray(s.buckets) ? s.buckets : []
        for (const b of buckets) {
          const u = b && b.usage
          if (!u || typeof u !== 'object') continue
          const hit = Number(u.PROMPT_CACHE_HIT_TOKEN) || 0
          const miss = Number(u.PROMPT_CACHE_MISS_TOKEN) || 0
          const out = Number(u.RESPONSE_TOKEN) || 0
          if (hit + miss + out === 0) continue
          found = true
          tokens += hit + miss + out
          const pi = isPeakTime(b.time) ? 1 : 0
          cost += (hit / 1e6) * p.hit[pi] + (miss / 1e6) * p.miss[pi] + (out / 1e6) * p.out[pi]
        }
      }
      return found ? { amount: cost, tokens: tokens } : null
    }

    function todayKey() {
      const d = new Date()
      const p = (n) => String(n).padStart(2, '0')
      return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate())
    }
    function readUsageLedger() {
      for (const p of USAGE_FILE_CANDIDATES) {
        try {
          const parsed = JSON.parse(fs.readFileSync(p, 'utf8'))
          if (parsed && typeof parsed === 'object' && typeof parsed.date === 'string') return parsed
        } catch (err) {}
      }
      return { date: todayKey(), lastBalance: null, todayUsage: 0, history: {} }
    }
    function writeUsageLedger(led) {
      const body = JSON.stringify(led)
      for (const p of USAGE_FILE_CANDIDATES) {
        try {
          fs.writeFileSync(p, body, 'utf8')
          return true
        } catch (err) {}
      }
      return false
    }
    // 记账模式：每次观测到余额后，用余额正差值累计当天用量（跨天自动归零并归档）
    function recordLedgerUsage(currentBalance) {
      const t = todayKey()
      let led = readUsageLedger()
      if (led.date !== t) {
        if (led.date && typeof led.todayUsage === 'number') {
          led.history = led.history || {}
          led.history[led.date] = led.todayUsage
        }
        led.date = t
        led.lastBalance = currentBalance
        led.todayUsage = 0
      } else {
        const prev = typeof led.lastBalance === 'number' ? led.lastBalance : currentBalance
        if (typeof prev === 'number' && typeof currentBalance === 'number' && currentBalance < prev) {
          led.todayUsage = (typeof led.todayUsage === 'number' ? led.todayUsage : 0) + (prev - currentBalance)
        }
        led.lastBalance = currentBalance
      }
      const keys = Object.keys(led.history || {}).sort()
      while (keys.length > 30) {
        delete led.history[keys.shift()]
      }
      writeUsageLedger(led)
      return led
    }
    function normalizeUsageMode(m) {
      return m === 'token' ? 'token' : 'ledger'
    }

    async function getBalancePayload() {
      const payload = await fetchBalance()
      if (!payload.ok) return payload
      // 无论哪种模式，都先把余额观测记入账本（自动累积「鲸鱼记账」数据）
      const led = recordLedgerUsage(Number(payload.totalBalance))
      const cfg = readSizeConfig() || {}
      const mode = normalizeUsageMode(cfg.usageMode)
      const full = { ...payload }
      full.isPeak = isPeakTime(Math.floor(Date.now() / 1000))
      if (mode === 'ledger') {
        full.todayUsage = led.todayUsage
        full.usageMode = 'ledger'
        return full
      }
      // token：尝试平台令牌实时计算
      let cred = null
      try {
        cred = await ctx.credentials.resolve('DEEPSEEK_PLATFORM_TOKEN')
      } catch (err) {}
      if (cred) {
        const u = await fetchUsage()
        if (u && u.amount !== undefined) {
          full.todayUsage = u.amount
          full.usageMode = 'token'
          return full
        }
      }
      // 无令牌或令牌失败：回落记账模式
      full.todayUsage = led.todayUsage
      full.usageMode = 'ledger'
      return full
    }

    function getBalance() {
      const now = Date.now()
      if (balanceCache && now - balanceCache.at < BALANCE_TTL_MS) {
        return Promise.resolve(balanceCache.payload)
      }
      if (balanceInFlight) return balanceInFlight
      balanceInFlight = getBalancePayload()
        .then((payload) => {
          if (payload.ok) {
            balanceCache = { at: now, payload }
            return payload
          }
          if (payload.transient && balanceCache) {
            // transient network/API blip: keep serving the last known balance
            return { ...balanceCache.payload, stale: true, error: payload.error }
          }
          if (!payload.transient) console.error('[whale-balance]', payload.code, payload.error)
          return payload
        })
        .catch((err) => ({
          ok: false,
          code: 'ERROR',
          error: '余额服务异常: ' + String((err && err.message) || err).slice(0, 200),
        }))
        .finally(() => {
          balanceInFlight = null
        })
      return balanceInFlight
    }

    function readSizeConfig() {
      for (const p of SIZE_FILE_CANDIDATES) {
        try {
          const parsed = JSON.parse(fs.readFileSync(p, 'utf8'))
          if (parsed && typeof parsed.scale === 'number') {
            return {
              scale: parsed.scale,
              sound: parsed.sound !== false,
              vol: typeof parsed.vol === 'number' ? parsed.vol : 0.9,
              soundSet: parsed.soundSet === 'fx1' ? 'fx1' : 'duck',
              usageMode: normalizeUsageMode(parsed.usageMode),
              peakMode: parsed.peakMode === 'liangwen' || parsed.peakMode === 'qiangqiang' ? parsed.peakMode : 'default',
              bubbleOn: parsed.bubbleOn !== false,
              turnCostOn: parsed.turnCostOn !== false,
              turnCostCloseMs: typeof parsed.turnCostCloseMs === 'number' ? parsed.turnCostCloseMs : 5000,
            }
          }
        } catch (err) {}
      }
      return null
    }

    function writeSizeConfig(scale, sound, vol, soundSet, usageMode, peakMode, bubbleOn, turnCostOn, turnCostCloseMs) {
      const um = normalizeUsageMode(usageMode)
      const pm = peakMode === 'liangwen' || peakMode === 'qiangqiang' ? peakMode : 'default'
      const bo = bubbleOn !== false
      const tco = turnCostOn !== false
      const tcc = typeof turnCostCloseMs === 'number' && turnCostCloseMs > 0 ? turnCostCloseMs : 5000
      const body = JSON.stringify({
        scale: scale,
        sound: sound !== false,
        vol: typeof vol === 'number' ? vol : 0.9,
        soundSet: soundSet === 'fx1' ? 'fx1' : 'duck',
        usageMode: um,
        peakMode: pm,
        bubbleOn: bo,
        turnCostOn: tco,
        turnCostCloseMs: tcc,
        updatedAt: new Date().toISOString(),
      })
      for (const p of SIZE_FILE_CANDIDATES) {
        try {
          fs.writeFileSync(p, body, 'utf8')
          return {
            ok: true,
            scale: scale,
            sound: sound !== false,
            vol: typeof vol === 'number' ? vol : 0.9,
            soundSet: soundSet === 'fx1' ? 'fx1' : 'duck',
            usageMode: um,
            peakMode: pm,
            bubbleOn: bo,
            turnCostOn: tco,
            turnCostCloseMs: tcc,
          }
        } catch (err) {}
      }
      return { ok: false, error: '无法持久化挂件尺寸' }
    }

    function readBody(req) {
      return new Promise((resolve, reject) => {
        const chunks = []
        let size = 0
        req.on('data', (c) => {
          size += c.length
          if (size > 8192) {
            reject(new Error('body too large'))
            req.destroy()
            return
          }
          chunks.push(c)
        })
        req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
        req.on('error', reject)
      })
    }

    disposers.push(ctx.webServer.register({
      kind: 'exact',
      path: '/dsh-whale/image.png',
      handler: (req, res) => {
        try {
          let bytes = null
          try {
            const u = new URL(req.url, 'http://localhost')
            const verRaw = String(u.searchParams.get('ver') || 'v2')
            const ver = (verRaw === 'v1' || verRaw === 'v2' || verRaw === 'v3' || verRaw === 'v4') ? verRaw : 'v2'
            bytes = fs.readFileSync(path.join(PACKAGE_ROOT, 'assets', ver, 'DSniang1.png'))
          } catch (err) {}
          if (!bytes) bytes = loadImage()
          // 与 /expr 同理：ETag 协商缓存。主图是眨眼/情绪恢复后的回落图，
          // no-store 时每次恢复都全量重下 ~700KB，Node 忙时同样会破图。
          const etag = '"main-' + bytes.length + '-' + crypto.createHash('md5').update(bytes).digest('hex').slice(0, 10) + '"'
          if (req.headers['if-none-match'] === etag) {
            res.writeHead(304, { ETag: etag, 'Cache-Control': 'no-cache' })
            res.end()
            return
          }
          res.writeHead(200, {
            'Content-Type': 'image/png',
            'Cache-Control': 'no-cache',
            ETag: etag,
            'Content-Length': String(bytes.length),
          })
          res.end(bytes)
        } catch (err) {
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
          res.end('whale image unavailable: ' + String((err && err.message) || err))
        }
      },
    }))

    disposers.push(ctx.webServer.register({
      kind: 'exact',
      path: '/dsh-whale/rua.gif',
      handler: (req, res) => {
        try {
          const bytes = loadGif()
          res.writeHead(200, {
            'Content-Type': 'image/gif',
            'Cache-Control': 'no-store',
            'Content-Length': String(bytes.length),
          })
          res.end(bytes)
        } catch (err) {
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
          res.end('rua gif unavailable: ' + String((err && err.message) || err))
        }
      },
    }))

    // 表情图片路由：/dsh-whale/expr?name=xxx（情绪图 + 眨眼帧 + 卖萌图）
    const EXPR_WHITELIST = new Set([
      'angry', 'disappointed', 'shy', 'exhausted', 'close_eyes', 'half_closed_eyes', 'dazed',
      'ok', 'what2', 'money', 'give', 'grit', 'know', 'wicked', 'cornerfish',
      'shocked', 'amazing', 'wronged', 'happy', 'paymore', 'proud', 'gotcha',
      'bored', 'thumbsup', 'fakelaugh', 'question', 'sotaku',
      'caught', 'loud', 'superhappy', 'astonish',
      // V1 专属
      'sad', 'quiet', 'cheer', 'fatfish', 'mock', 'what', 'scared', 'greet', 'stroking',
      // V3 专属（第三版素材）
      'hit', 'heart', 'hip', 'dame', 'wake', 'wipe', 'good', 'ready', 'tea', 'hm',
      'stretch', 'reflect', 'sleepy', 'poorfish', 'cry', 'evidence', 'wall',
      'youwrite', 'run', 'candy', 'peek', 'cake', 'insight', 'grace', 'study',
      // V4 专属（第四版素材）
      'scholar', 'watering', 'signboard', 'sleep', 'surrender', 'snowman', 'fishing',
      'chef', 'guitar', 'gaming', 'reading', 'art', 'boba', 'coffee', 'noodles',
      'icecream', 'icecream_mosaic', 'phone', 'slacking', 'youfirst', 'thinking',
      'kneel', 'tremble', 'dancing', 'workhard', 'playdead', 'upsidedown',
      'sobbing', 'nooo', 'freeride',
    ])
    const EXPR_VER_DIRS = { v1: 'v1', v2: 'v2', v3: 'v3', v4: 'v4' }
    const exprBytesCache = new Map() // key: "ver/name"
    disposers.push(ctx.webServer.register({
      kind: 'exact',
      path: '/dsh-whale/expr',
      handler: (req, res) => {
        try {
          const u = new URL(req.url, 'http://localhost')
          const name = String(u.searchParams.get('name') || '')
          const verRaw = String(u.searchParams.get('ver') || 'v2')
          const ver = EXPR_VER_DIRS[verRaw] ? verRaw : 'v2'
          if (!EXPR_WHITELIST.has(name)) {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
            res.end('unknown expression')
            return
          }
          const cacheKey = ver + '/' + name
          let bytes = exprBytesCache.get(cacheKey)
          if (!bytes) {
            const p = path.join(PACKAGE_ROOT, 'assets', ver, name + '.png')
            bytes = fs.readFileSync(p)
            if (!bytes || bytes.length === 0) throw new Error('empty file')
            exprBytesCache.set(cacheKey, bytes)
          }
          // ETag 协商缓存：眨眼每 3.5~8s 就要 close_eyes 两帧（~1.5MB），
          // no-cache 无验证器时每次都全量重下；Node 忙时响应慢于 130ms 切帧
          // 还会被浏览器中止（responseStatus:0）→ 表情破图。
          // 带 ETag 后未变时回 304（无 body），图片文件更新后哈希变化立即拿到新图。
          const etag = '"' + ver + '-' + name + '-' + bytes.length + '-' + crypto.createHash('md5').update(bytes).digest('hex').slice(0, 10) + '"'
          if (req.headers['if-none-match'] === etag) {
            res.writeHead(304, { ETag: etag, 'Cache-Control': 'no-cache' })
            res.end()
            return
          }
          res.writeHead(200, {
            'Content-Type': 'image/png',
            'Cache-Control': 'no-cache',
            ETag: etag,
            'Content-Length': String(bytes.length),
          })
          res.end(bytes)
        } catch (err) {
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
          res.end('expr image unavailable: ' + String((err && err.message) || err))
        }
      },
    }))

    disposers.push(ctx.webServer.register({
      kind: 'exact',
      path: '/dsh-whale/balance.json',
      handler: async (req, res) => {
        try {
          const payload = await getBalance()
          res.writeHead(200, JSON_HEADERS)
          res.end(JSON.stringify(payload))
        } catch (err) {
          res.writeHead(200, JSON_HEADERS)
          res.end(JSON.stringify({ ok: false, code: 'ERROR', error: String((err && err.message) || err).slice(0, 200) }))
        }
      },
    }))

    disposers.push(ctx.webServer.register({
      kind: 'exact',
      path: '/dsh-whale/last-turn.json',
      handler: (req, res) => {
        // 返回最近一轮已完成的对话消耗；seq 递增供前端判断「新的一轮」
        const payload = lastTurn
          ? { ok: true, seq: lastTurnSeq, turn: lastTurn.turn, amount: lastTurn.amount, tokens: lastTurn.tokens, ts: lastTurn.ts }
          : { ok: true, seq: 0, turn: null, amount: null, tokens: null, ts: null }
        res.writeHead(200, JSON_HEADERS)
        res.end(JSON.stringify(payload))
      },
    }))

    disposers.push(ctx.webServer.register({
      kind: 'exact',
      path: '/dsh-whale/size.json',
      handler: async (req, res) => {
        if (req.method === 'PUT' || req.method === 'POST') {
          try {
            const body = await readBody(req)
            const parsed = JSON.parse(body)
            const scale = typeof parsed.scale === 'number' ? parsed.scale : null
            if (scale === null) {
              res.writeHead(400, JSON_HEADERS)
              res.end(JSON.stringify({ ok: false, error: 'missing scale' }))
              return
            }
            // 用量模式变化时让余额缓存失效，下次请求立即按新模式计算
            if (typeof parsed.usageMode === 'string') {
              const old = readSizeConfig()
              if (!old || normalizeUsageMode(old.usageMode) !== normalizeUsageMode(parsed.usageMode)) {
                balanceCache = null
              }
            }
            const result = writeSizeConfig(scale, parsed.sound !== false, parsed.vol, parsed.soundSet, parsed.usageMode, parsed.peakMode, parsed.bubbleOn, parsed.turnCostOn, parsed.turnCostCloseMs)
            res.writeHead(result.ok ? 200 : 500, JSON_HEADERS)
            res.end(JSON.stringify(result))
          } catch (err) {
            res.writeHead(400, JSON_HEADERS)
            res.end(JSON.stringify({ ok: false, error: String((err && err.message) || err) }))
          }
          return
        }
        res.writeHead(200, JSON_HEADERS)
        res.end(JSON.stringify(readSizeConfig() || {}))
      },
    }))

    function loadSound(candidates) {
      for (const p of candidates) {
        try {
          const bytes = fs.readFileSync(p)
          if (bytes && bytes.length > 0) return bytes
        } catch (err) {}
      }
      return null
    }

    function serveSound(req, res, candidates) {
      const bytes = loadSound(candidates)
      if (!bytes) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
        res.end('sound unavailable')
        return
      }
      res.writeHead(200, {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'no-store',
        'Content-Length': String(bytes.length),
      })
      res.end(bytes)
    }

    disposers.push(ctx.webServer.register({
      kind: 'exact',
      path: '/dsh-whale/sound/press.mp3',
      handler: (req, res) => {
        const set = SOUND_SETS[soundSetFromUrl(req.url)] || SOUND_SETS.duck
        serveSound(req, res, set.press)
      },
    }))

    disposers.push(ctx.webServer.register({
      kind: 'exact',
      path: '/dsh-whale/sound/release.mp3',
      handler: (req, res) => {
        const set = SOUND_SETS[soundSetFromUrl(req.url)] || SOUND_SETS.duck
        serveSound(req, res, set.release)
      },
    }))

    disposers.push(ctx.webServer.register({
      kind: 'exact',
      path: '/dsh-whale/widget.js',
      handler: (req, res) => {
        res.writeHead(200, {
          'Content-Type': 'application/javascript; charset=utf-8',
          'Cache-Control': 'no-store',
        })
        res.end(WIDGET_JS)
      },
    }))

    disposers.push(ctx.webServer.tapIndex((html) => {
      if (html.indexOf('/dsh-whale/widget.js') !== -1) return html
      const tag = '<script defer src="/dsh-whale/widget.js"></script>'
      if (html.indexOf('</body>') !== -1) return html.replace('</body>', tag + '</body>')
      return html + tag
    }))

    ctx.effect(() => () => {
      for (const d of disposers) {
        try { d() } catch (err) {}
      }
    })
}

export { name, inject, apply }
