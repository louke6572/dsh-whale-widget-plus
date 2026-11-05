// Is the @ a real mention node on the opus page (linked, with the target's mid)?
import { config } from '../lib/config.mjs'
const dynId = process.argv[2]
// P0-7：目标从命令行/配置取（mention-check <dynId> [mid] [昵称]）
const TARGET_MID = String(process.argv[3] ?? config().owner?.mid ?? '')
const TARGET_NAME = String(process.argv[4] ?? config().owner?.name ?? '')
if (!TARGET_MID && !TARGET_NAME) { console.error('用法: node mention-check.mjs <dynId> <mid> <昵称>（或在配置里填 owner）'); process.exit(2) }
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
const r = await fetch(`https://www.bilibili.com/opus/${dynId}`, { headers: { 'user-agent': UA, 'accept-language': 'zh-CN,zh;q=0.9' } })
const html = await r.text()
console.log(`opus 页 HTTP ${r.status}  ${html.length} 字节`)
const i = html.indexOf('<主人昵称>')
console.log(`\n提及目标的 mid 999999003 出现次数: ${html.split('999999003').length - 1}`)
if (i >= 0) {
  console.log('\n"<主人昵称>" 前后各 400 字符（看它被什么标签包着）：')
  console.log(html.slice(Math.max(0, i - 400), i + 200).replace(/></g, '>\n<'))
} else {
  console.log('页面上没找到该昵称')
}
for (const k of ['hello world', '测试动态']) {
  const j = html.indexOf(k)
  console.log(`\n"${k}" 上下文: ${j >= 0 ? html.slice(Math.max(0, j - 120), j + 120).replace(/></g, '>\n<') : '未出现'}`)
}
