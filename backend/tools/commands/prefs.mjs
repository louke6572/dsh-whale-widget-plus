// 偏好关键词扫描（只读）：从你自己的 B站 数据里挖出「你可能爱看什么」。
//
// 用法：node bili.mjs prefs scan [--target fish|owner|both] [--sources history,favorites,local] [--limit 24] [--json]
//
// 只发 GET、只读自己的观看历史/收藏夹/关注与本地记录；不点赞、不关注、不写配置。
// 设置页「B站 → 口味权重 / 一键抓取」走的是同一套逻辑（/api/preferences/scan）。
import { scanPreferences } from '../lib/pref-scan.mjs'

const argv = process.argv.slice(2)
const sub = argv[0]
const opt = {}
for (let i = 1; i < argv.length; i += 1) {
  if (!argv[i].startsWith('--')) continue
  const key = argv[i].slice(2)
  const next = argv[i + 1]
  if (next === undefined || next.startsWith('--')) opt[key] = true
  else { opt[key] = next; i += 1 }
}
if (sub !== 'scan') {
  console.error('用法: node bili.mjs prefs scan [--target fish|owner|both] [--sources history,favorites,local] [--limit 24] [--json]')
  console.error('  只读：从小肥鱼 / 主人的 B站 观看历史、收藏夹与本地记录里抽候选关键词。')
  console.error('  主人账号需要先在设置页「B站 → 口味权重 / 一键抓取」扫码登录。')
  process.exit(2)
}

const sources = typeof opt.sources === 'string'
  ? opt.sources.split(/[,，]/).map((s) => s.trim()).filter(Boolean)
  : undefined
const limit = Math.max(4, Math.min(60, Number(opt.limit ?? 24) || 24))
const target = ['fish', 'owner', 'both'].includes(String(opt.target ?? '')) ? String(opt.target) : 'fish'
const result = await scanPreferences({ sources, limit, target })

if (opt.json) {
  console.log(JSON.stringify(result, null, 2))
} else {
  console.log(`凭据: ${result.credentials ? '已登录（可读观看历史 / 收藏夹）' : '没有可用 cookie'}`)
  const roleText = {
    fish: '小肥鱼账号',
    owner: '主人账号',
  }
  if (result.accounts?.length) {
    for (const account of result.accounts) {
      console.log(`抓取账号: ${account.name || '（未取到昵称）'}（${account.mid}）· ${roleText[account.role] ?? account.role}`)
    }
  } else {
    console.log('抓取账号: —（本地记录）')
  }
  if (result.ownerLoginRequired) console.log('主人账号还没扫码登录：去设置页「B站 → 口味权重 / 一键抓取」点按钮扫码。')
  for (const report of result.sources) {
    console.log(`  ${report.ok ? '✓' : '✗'} ${report.name}${report.items != null ? ` — ${report.items} 条` : ''}${report.error ? ` — ${report.error}` : ''}`)
  }
  console.log(`\n候选关键词（${result.candidates.length} 个，按信号强弱排序）：`)
  for (const [index, item] of result.candidates.entries()) {
    console.log(`  ${String(index + 1).padStart(2)}. ${item.keyword}  命中 ${item.count} · ${item.sources.join('/')}`)
    if (item.samples?.[0]) console.log(`      例：${item.samples[0]}`)
  }
  console.log('\n下一步：设置页 → B站 → 「口味权重 / 一键抓取」→ 勾选想要的 → 加入爱看 → 保存。')
}
