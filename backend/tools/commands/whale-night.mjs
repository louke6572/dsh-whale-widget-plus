// 这条鱼的「生物钟」—— 决定今天醒几次、什么时候醒、醒来看不看，到点**退出**来叫醒她。
//
// 为什么用"退出"叫醒：后台任务没法给 agent 注入一个回合 ✗，但它**结束**时系统会通知 agent ✓
// —— 跟直播间 `danmaku await` 是同一个套路（已在实战验证过）。
//
// 用法:
//   node whale-night.mjs plan      掷骰子，生成今天的计划（写 ~/.dsh/surfcore/bili/whale-night.json + 事件）
//   node whale-night.mjs clock     常驻：算计划 → 到点退出（WHALE_WAKE）/ 不看则睡到该窗口末退出（WHALE_SKIP）/ 次数用完（WHALE_DONE）
//   node whale-night.mjs mark      写"今晚醒过"的标记（给 Windows 计划任务兜底用：DSH 关着时也能留痕）
//   node whale-night.mjs status    看配置 / 今天的计划 / 醒了几次 / 兜底标记
//   node whale-night.mjs clock --test [秒]   自测：不走配置窗口，几秒后退出叫醒
//
// 配置（~/.dsh/surfcore/bili/whale-night.config.json，缺字段用默认值）：
//   {
//     "windows": [ {"start":"07:00","end":"09:00"}, {"start":"17:00","end":"18:00"} ],
//     "maxWakesPerDay": 2,
//     "skipChance": 0.3,
//     "maxVideos": 5, "maxMinutes": 20
//   }
//   兼容旧配置：没有 windows 时，用 windowStart/windowEnd 当成"一个窗口"。
//
// 设计原则（2026-10-14 起，2026-10-17 扩成多窗口）：
//   · **窗口固定，时刻随机** —— 机器才准点 ✗。每个窗口内随机挑一个时刻。
//   · **窗口 = 一次醒来的机会**，但**每天合计 ≤ maxWakesPerDay**（默认 = 窗口数，硬上限 3）——
//     窗口可以设四个，但不能醒四次（每次醒来都是一笔真开销）。
//   · **有权利不看** —— 每次醒来独立掷 skipChance（默认 30%），"今天不想看"也是活人 ✓
//   · **有上限** —— 条数 + 分钟数写死在配置里，防烧白饭。
import { accountBili, biliState, biliStateDir } from '../lib/state-paths.mjs'
import fs from 'node:fs'
import path from 'node:path'
import { config } from '../lib/config.mjs'
import { loadScores } from '../lib/scores.mjs'
import {
  buildNightSchedule, nextPendingSlot, markScheduleSlot, qualityByWindow, minToHHMM,
} from '../lib/night-schedule.mjs'

const HOME = process.env.USERPROFILE || process.env.HOME || '.'
const STATE = biliState('whale-night.json')
const MARK = biliState('whale-wake')
const CFG = biliState('whale-night.config.json')
// 作息默认值来自统一配置（lib/config.mjs）；本文件自己的 whale-night.config.json 仍可覆盖
const DEFAULTS = { ...config().night }

const argv = process.argv.slice(2)
const cmd = argv[0]
const TEST = argv.includes('--test')
const testSecs = TEST ? Number(argv[argv.indexOf('--test') + 1] ?? 5) : 0

const load = (f, dflt) => { try { return { ...dflt, ...JSON.parse(fs.readFileSync(f, 'utf8')) } } catch { return { ...dflt } } }
const save = (f, o) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(o, null, 2) + '\n') }
const today = () => new Date().toLocaleDateString('sv-SE')
const hhmm = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
const parseHHMM = (s) => { const [h, m] = String(s).split(':').map(Number); return (h === 24 ? 1440 : h * 60) + (m || 0) }
const nowMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes() }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const cfg = load(CFG, DEFAULTS)

// 窗口：优先 windows[]；没有就退回 windowStart/windowEnd 一个窗口（兼容旧配置）
// 每个窗口自带 wakes（醒来几次，2026-10-18 主人定）；0 = 这个窗口不醒 ✓
// 2026-10-19：跨午夜窗口（end <= start，如 10:00→06:00）以前被 filter 直接丢掉
//   → 整个窗口消失、鱼永远不醒（用户实测：设了 10:00→6:00，全天"窗口都过完了"）。
//   现在规范成 [start, 1440+end)，wrap 标记，比较一律用分钟数（可 >1440）。
function windowsOf(c) {
  const list = Array.isArray(c.windows) && c.windows.length
    ? c.windows
    : [{ start: c.windowStart ?? '20:00', end: c.windowEnd ?? '24:00', wakes: c.maxWakesPerDay ?? 1 }]
  return list
    .map((w) => {
      const start = parseHHMM(w.start)
      let end = parseHHMM(w.end)
      if (end <= start) end += 1440
      return {
        start,
        end,
        wrap: end > 1440,
        label: `${w.start}–${w.end}`,
        wakes: Math.max(0, Number(w.wakes ?? 1) || 0),
      }
    })
    .filter((w) => w.end > w.start)
}
const WINDOWS = windowsOf(cfg)
// 2026-10-23 用户选 C：每个窗口至少 1 次；全天总数 ≤ maxWakesPerDay（硬上限 12）。
// 不再把“各窗口 wakes 之和”当上限——27 次需求和 12 次上限本身就冲突。
const MAX_WAKES = Math.min(12, Math.max(0, Number(cfg.maxWakesPerDay ?? 12) || 12))
const MIN_GAP_MIN = Math.max(0, Number(cfg.minGapMin ?? 20) || 20)

const st = load(STATE, {})
const wakesToday = (s) => (s.date === today() ? Number(s.wakes ?? 0) : 0)

function donePlan(state, reason) {
  return {
    ...(state && typeof state === 'object' ? state : {}),
    date: today(), action: 'done', done: true,
    wakes: Number(state?.wakes ?? 0) || 0,
    watchWakes: Number(state?.watchWakes ?? 0) || 0,
    reason,
  }
}

function planFromSlot(state, slot) {
  const kind = slot.kind === 'base' ? '保底' : '加餐'
  return {
    ...state,
    date: today(),
    slots: state.slots,
    warnings: Array.isArray(state.warnings) ? state.warnings : [],
    action: slot.action,
    fired: false,
    done: false,
    at: slot.at,
    atText: slot.atText,
    window: slot.window,
    withinWindow: `${kind}`,
    slotId: slot.id,
    endAt: slot.end,
    wakes: Number(state.wakes ?? 0) || 0,
    watchWakes: Number(state.watchWakes ?? 0) || 0,
    reason: slot.action === 'skip'
      ? `这次不想看（掷骰子掷到了「不看」那 ${Math.round(Number(cfg.skipChance ?? 0.3) * 100)}%）`
      : '',
    roll: slot.action === 'wake' ? 'watch' : 'skip',
    maxVideos: cfg.maxVideos ?? 5,
    createdAt: new Date().toISOString(),
  }
}

function makePlan() {
  const now = nowMin()
  if (MAX_WAKES === 0) return donePlan(st, 'maxWakesPerDay=0 → 今天不醒')

  // 已经生成过今天的排程：只推进 slots，不重新掷骰子。
  if (st?.date === today() && Array.isArray(st.slots)) {
    const slot = nextPendingSlot(st, now)
    if (slot) return planFromSlot(st, slot)
    return donePlan(st, '今天的排程已走完（含错过/轻醒）')
  }

  // 新的一天：一次性排完，之后只按 slots 执行。
  const already = st?.date === today() ? Number(st.wakes ?? 0) || 0 : 0
  // 旧状态可能只有 wakes、没有 watchWakes；迁移时按“醒过=看过”算，别把上午那次吞掉。
  const alreadyWatched = st?.date === today()
    ? Number(st.watchWakes ?? st.wakes ?? 0) || 0
    : 0
  const schedule = buildNightSchedule({
    windows: WINDOWS,
    maxWakes: Math.max(0, MAX_WAKES - already),
    minGapMin: MIN_GAP_MIN,
    skipChance: Number(cfg.skipChance ?? 0.3),
    nowMin: now,
    quality: qualityByWindow(loadScores(), WINDOWS, { days: 30 }),
  })
  const base = {
    date: today(),
    slots: schedule.slots,
    warnings: schedule.warnings,
    cap: schedule.cap,
    minGapMin: schedule.minGapMin,
    baseCount: schedule.baseCount,
    extraCount: schedule.extraCount,
    wakes: already,
    watchWakes: alreadyWatched,
  }
  const slot = nextPendingSlot(base, now)
  if (!slot) return donePlan(base, '今天没有可排的窗口（都已过/没有次数）')
  return planFromSlot(base, slot)
}

function logEvent(kind, note) {
  try {
    fs.mkdirSync(biliState('whale-log.jsonl'),
      JSON.stringify({ at: new Date().toISOString(), kind, target: null, note }) + '\n')
  } catch {}
}

const winText = () => WINDOWS.map((w) => w.label).join(' · ')

if (cmd === 'plan') {
  const p = makePlan()
  save(STATE, p)
  logEvent('night-plan', p.action === 'wake'
    ? `今天 ${p.atText}（窗口 ${p.window}）看视频`
    : `今天不看：${p.reason}`)
  console.log(JSON.stringify(p, null, 2))
  process.exit(0)
}

if (cmd === 'mark') {
  save(MARK, { date: today(), at: new Date().toISOString(), by: 'windows-task' })
  console.log(`已留标记：${MARK}（${today()}）`)
  process.exit(0)
}

if (cmd === 'status') {
  const p = load(STATE, {})
  const m = load(MARK, {})
  const slots = p.date === today() && Array.isArray(p.slots) ? p.slots : []
  const count = (status) => slots.filter((s) => s.status === status).length
  const done = Number(p.wakes ?? 0) || 0
  const watched = Number(p.watchWakes ?? 0) || 0
  console.log(`配置: 窗口 ${winText()} | 全天上限 ${MAX_WAKES} 次 | 最小间隔 ${MIN_GAP_MIN} 分钟 | 不看概率 ${Math.round(Number(cfg.skipChance ?? 0.3) * 100)}% | 一次初筛 ${cfg.maxVideos ?? 5} 条`)
  console.log(`今天已醒: ${done}/${MAX_WAKES}（真正看 ${watched}）· slots ${slots.length}（待 ${count('pending')} · 已醒 ${count('fired')} · 轻醒 ${count('skipped')} · 错过 ${count('missed')}）`)
  if (Array.isArray(p.warnings) && p.warnings.length) console.log(`排程提醒: ${p.warnings.join('；')}`)
  if (slots.length) {
    console.log('排程: ' + slots.map((s) => `${s.atText} ${s.window}·${s.kind === 'base' ? '保底' : '加餐'}·${s.status}·${s.action === 'skip' ? '轻醒' : '看'}`).join(' | '))
  }
  console.log(`当前的计划: ${p.date ?? '(无)'} → ${p.action ?? '(未生成)'}${p.atText ? ' @ ' + p.atText : ''}${p.window ? '（窗口 ' + p.window + (p.withinWindow ? ' · ' + p.withinWindow : '') + '）' : ''}${p.reason ? '（' + p.reason + '）' : ''}`)
  console.log(`兜底标记: ${m.date ?? '(无)'}${m.date && m.date !== today() ? `  ← 有 ${m.date} 的标记（那晚 DSH 可能关着）` : ''}`)
  process.exit(0)
}

if (cmd === 'clock') {
  if (TEST) {
    console.log(`[test] 模拟生物钟：${testSecs} 秒后退出叫醒…`)
    await sleep(testSecs * 1000)
    save(STATE, { ...load(STATE, {}), date: today(), action: 'wake', at: nowMin(), atText: hhmm(nowMin()), woke: true, test: true })
    logEvent('night-wake', '[test] 生物钟自测')
    console.log('WHALE_WAKE at=' + hhmm(nowMin()) + ' (test)')
    process.exit(0)
  }
  // ⚠️ 重新算计划的四种情况：
  //   ① 跨天/没计划 ② 上一趟已经醒了 ③ 上一趟轻醒已投递 ④ 排程走完
  let p = load(STATE, {})
  const stale = p.date !== today() || !p.action || p.woke === true || p.done === true
    || (p.action === 'skip' && p.fired === true)
  if (stale) {
    p = makePlan(); save(STATE, p)
    logEvent('night-plan', p.action === 'wake' ? `${p.atText} 看视频（窗口 ${p.window}${p.withinWindow ? ' · ' + p.withinWindow : ''}）` : `不醒：${p.reason}`)
  }
  console.log(`[生物钟] 这一趟：${p.action}${p.atText ? ' @ ' + p.atText : ''}${p.window ? '（窗口 ' + p.window + (p.withinWindow ? ' · ' + p.withinWindow : '') + '）' : ''}${p.reason ? '（' + p.reason + '）' : ''}`)

  // 次数用完 / 窗口都过了：立刻退出（不睡）
  if (p.action === 'done' || p.action === 'already') {
    console.log('WHALE_DONE ' + (p.reason ?? ''))
    process.exit(0)
  }

  if (p.action === 'skip') {
    // C：skip 只影响当前 slot，不结束全天；睡到这个 slot 的点，醒来写“不看”的日记。
    let waitMin = Number(p.at) - nowMin()
    if (waitMin < 0) waitMin += 1440
    if (waitMin > 0) {
      console.log(`[生物钟] 这次轻醒，${waitMin} 分钟后退出（窗口 ${p.window ?? ''}）`)
      for (let i = 0; i < waitMin * 60; i += 60) await sleep(60_000)
    }
    const slots = Array.isArray(p.slots) ? p.slots : []
    if (p.slotId) markScheduleSlot(p, p.slotId, 'skipped', nowMin())
    save(STATE, { ...p, slots, fired: true, done: false, wakes: Number(p.wakes ?? 0) + 1, watchWakes: Number(p.watchWakes ?? 0) || 0 })
    logEvent('night-skip', `轻醒：${p.reason ?? ''}`)
    console.log('WHALE_SKIP ' + (p.reason ?? ''))
    process.exit(0)
  }

  // 看：睡到这个 slot 的点（跨午夜 at 可能是“明天”的分钟 → 差额 +1440）
  let waitMin = p.at - nowMin()
  if (waitMin < 0) waitMin += 1440
  if (waitMin > 0) {
    for (let i = 0; i < waitMin * 60; i += 60) await sleep(60_000)
  }
  const slots = Array.isArray(p.slots) ? p.slots : []
  if (p.slotId) markScheduleSlot(p, p.slotId, 'fired', nowMin())
  const woke = {
    ...p, slots, woke: true, done: false,
    wakes: Number(p.wakes ?? 0) + 1,
    watchWakes: (Number(p.watchWakes ?? 0) || 0) + 1,
    wokeAt: new Date().toISOString(),
  }
  save(STATE, woke)
  logEvent('night-wake', `生物钟叫醒（第 ${woke.wakes} 次 · 计划 ${p.atText}）`)
  console.log(`WHALE_WAKE at=${p.atText} wake=${woke.wakes}/${MAX_WAKES} maxVideos=${cfg.maxVideos ?? 5}${p.withinWindow ? ` slot=${p.withinWindow}` : ''}`)
  process.exit(0)
}

console.log('用法: node whale-night.mjs plan | clock [--test 5] | mark | status')
