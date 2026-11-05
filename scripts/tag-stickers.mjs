#!/usr/bin/env node
// tag-stickers.mjs — 给「已经收藏」的表情补编号/情绪/内容（一次性数据整备，可反复跑）。
//
// 背景（用户 2026-10-23 要求）：
//   「收藏表情时编号，并且分类情绪，赋予内容……已经收藏的表情也做一下」。
//   新收藏的表情会由 qq_collect_sticker 带着 emotion/content 落库；
//   这一批是发明这套机制之前就收藏的，只能人工看图后补。
//
// 做法：
//   · 每条按 md5 定位（QQ 收藏表情的 emoji_id 里也带 md5，md5 更短更好维护）；
//   · 只写 emotion / emotionAlt / content / keywords 四个语义字段，
//     绝不覆盖 desc（QQ 官方备注）、localNote（AI 记忆）、useCount 等运行数据；
//   · 写盘前先把 state/stickers.json 备份到 _backups/；
//   · 写完再跑一遍 ensureStickerIndex，保证编号/兜底字段一致。
//
// 用法：
//   node scripts/tag-stickers.mjs            # 只打印将要写入什么（默认 dry-run）
//   node scripts/tag-stickers.mjs --apply    # 真写（需要桥接已停止，否则内存里的旧副本会盖回来）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadStickerStore, saveStickerStore } from '../src/sticker-lib.js';
import { ensureStickerIndex } from '../src/sticker-semantics.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const storeArg = process.argv.indexOf('--store');
// 默认写真实库；--store 只是让人可以拿副本演练（不自带这个入口就只能先动真库再回滚）
const STORE = storeArg >= 0 && process.argv[storeArg + 1]
  ? path.resolve(process.argv[storeArg + 1])
  : path.join(ROOT, 'state', 'stickers.json');
const BACKUP_DIR = path.join(ROOT, '_backups');

// 2026-10-23 逐张看图后的标注（顺序 = 编号顺序，按 createdAt 排）。
const CURATED = [
  {
    md5: 'AA6B4357FA081F951DB284A4F82D1B6B',
    name: '咪兔 me too',
    emotion: 'agree',
    emotionAlt: ['cute'],
    content: '猫和兔子贴在一起说 me too，软软地附和',
    keywords: ['me too', '附和', '贴贴', '猫兔']
  },
  {
    md5: '336E99905EA64B1F0B0F3BFBED4550ED',
    name: '无辜被抓包',
    emotion: 'surprise',
    emotionAlt: ['wronged'],
    content: '动漫女孩突然被抓包，一脸心虚又无辜',
    keywords: ['被抓包', '心虚', '无辜', '完蛋']
  },
  {
    md5: '47271E846033EA25EC9A54315F407ADE',
    name: '杂鱼♡（小咪自己）',
    emotion: 'tease',
    emotionAlt: ['smug', 'cute'],
    content: '蓝发女仆半眯眼笑着喊杂鱼♡，欠揍又带点撒娇',
    keywords: ['杂鱼', '就这', '嘲讽', '欠揍']
  },
  {
    md5: '7CB9FE6D7BCF7A616689A2089294A44B',
    name: '办公室顶锅吃白饭（小咪自己）',
    emotion: 'tired',
    emotionAlt: ['hungry', 'speechless'],
    content: '顶着锅在办公室大口扒白饭，鼓着脸摆烂',
    keywords: ['顶锅', '干饭', '上班', '摆烂']
  },
  {
    md5: 'E2A6A17BF5ABC8769572B834FF18CCD7',
    name: '小咪自己·抱着碗委屈',
    emotion: 'wronged',
    emotionAlt: ['hungry', 'sad'],
    content: '抱着空碗眼泪汪汪，委屈巴巴地要饭',
    keywords: ['委屈', '要饭', '饿了', '眼泪']
  },
  {
    md5: '4112802B2F22ABE0B69D4D61DCA86C38',
    name: '委屈鲸鱼娘·花token想的',
    emotion: 'wronged',
    emotionAlt: ['sad'],
    content: '哭着求你们别再嘲笑我的回复，这些是我花好多 token 想的',
    keywords: ['别嘲笑', 'token', '破防', '哭']
  },
  {
    md5: 'A27C148CDF3FC59A02D3F440746E27AE',
    name: '雪地抱着雪球的小咪',
    emotion: 'cute',
    emotionAlt: ['happy'],
    content: '雪地里抱着大雪球，脸红扑扑的软萌',
    keywords: ['雪球', '软萌', '冬天', '可爱']
  },
  {
    md5: '0DC1E69CAE7DCE0DE3F13D5F61062EA5',
    name: '被摸头的摸鱼小咪',
    emotion: 'happy',
    emotionAlt: ['cute', 'tired'],
    content: '被摸头舒服得眯眼笑，旁边写着摸鱼',
    keywords: ['摸头', '摸鱼', '舒服', '开心']
  }
];

function backup(file) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const target = path.join(BACKUP_DIR, `stickers-${stamp}.json`);
  fs.copyFileSync(file, target);
  return target;
}

const apply = process.argv.includes('--apply');
// 沙箱里 node 子进程可能没有 _backups 的写权限（见 HANDOFF 2026-10-23：bash/pwsh 子进程
// 对既有目录写入被拒，只有文件工具能写）。此时宁可不写，也不要在「没有备份」的情况下改真库；
// 需要演练时用 --store 指向临时副本 + --no-backup。
const noBackup = process.argv.includes('--no-backup');
const entries = loadStickerStore(STORE);
const byMd5 = new Map(entries.map((e) => [String(e.md5 || '').toUpperCase(), e]));

let missing = 0;
const changes = [];
for (const item of CURATED) {
  const entry = byMd5.get(item.md5);
  if (!entry) { missing += 1; console.log(`⚠️ 找不到 md5=${item.md5}（${item.name}），跳过`); continue; }
  const before = { emotion: entry.emotion, content: entry.content, keywords: entry.keywords };
  Object.assign(entry, {
    emotion: item.emotion,
    emotionAlt: item.emotionAlt,
    content: item.content,
    keywords: item.keywords,
    updatedAt: new Date().toISOString()
  });
  changes.push({ entry, item, before });
}

const indexed = ensureStickerIndex(entries);
console.log(`\n共 ${changes.length} 条待标注${missing ? `，${missing} 条未找到` : ''}：\n`);
for (const { entry, item } of changes) {
  console.log(`#${String(entry.no).padStart(2, '0')}  ${item.name}`);
  console.log(`    情绪 ${item.emotion}${item.emotionAlt.length ? '（副：' + item.emotionAlt.join('、') + '）' : ''}`);
  console.log(`    内容 ${item.content}`);
  console.log(`    关键词 ${item.keywords.join('、')}`);
}

if (!apply) {
  console.log('\n（dry-run，未写盘。加 --apply 写文件（需先停桥接），或 --api --apply 走控制台接口（桥接运行中也能写）。）');
  process.exit(0);
}
if (!changes.length) { console.log('\n没有需要更改的条目。'); process.exit(0); }

// ── API 模式：桥接在跑的时候用 ────────────────────────────────────────────
// 直接改 state/stickers.json 会被桥接内存里的副本整库回写覆盖；
// 走 /api/stickers/note 由桥接自己改内存 + 落盘，两边一致。
if (process.argv.includes('--api')) {
  const cfg = (() => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8')); } catch { return {}; } })();
  const port = Number(cfg.consolePort) || 3100;
  const base = `http://127.0.0.1:${port}`;
  let token = process.env.CONSOLE_TOKEN || '';
  if (!token) {
    try { token = fs.readFileSync(path.join(ROOT, 'state', 'console-token'), 'utf8').trim(); } catch {}
  }
  if (!token) { console.error('❌ 读不到控制台令牌（state/console-token），无法走 API'); process.exit(1); }
  const headers = { 'content-type': 'application/json', 'x-console-token': token };
  let failed = 0;
  for (const item of CURATED) {
    try {
      const res = await fetch(`${base}/api/stickers/note`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          stickerId: item.md5,
          emotion: item.emotion,
          emotionAlt: item.emotionAlt,
          content: item.content,
          keywords: item.keywords
        })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) throw new Error(body.error || `HTTP ${res.status}`);
      console.log(`✅ #${body.sticker?.no ?? '?'} ${item.name} → ${body.sticker?.emotionLabel ?? item.emotion}`);
    } catch (error) {
      failed += 1;
      console.error(`❌ ${item.name}: ${error?.message ?? error}`);
    }
  }
  // 写完回读一遍，确认桥接内存与页面看到的一致（而不是只信 POST 的返回）
  try {
    const res = await fetch(`${base}/api/stickers?count=100`, { headers: { 'x-console-token': token } });
    const list = await res.json();
    console.log(`\n回读 ${list.total} 条：`);
    for (const s of list.stickers || []) {
      console.log(`  #${String(s.no).padStart(2, '0')} ${s.emotionLabel}｜${s.content}`);
    }
    if (list.stickers?.some((s) => !s.emotion || !s.content)) console.error('⚠️ 仍有表情缺情绪/内容');
  } catch (error) {
    console.error(`回读失败（写入可能已成功）：${error?.message ?? error}`);
  }
  process.exit(failed ? 1 : 0);
}

let saved = '';
if (!noBackup) {
  try {
    saved = backup(STORE);
  } catch (error) {
    console.error(`\n❌ 备份失败，已中止（不会在没有备份的情况下改库）：${error?.message ?? error}`);
    console.error('   可写环境重试，或先手动把 state/stickers.json 复制到 _backups/ 再加 --no-backup。');
    process.exit(1);
  }
}
saveStickerStore(STORE, indexed.entries);
console.log(`\n✅ 已写入 ${STORE}（${changes.length} 条）${saved ? `，备份：${path.relative(ROOT, saved)}` : '（--no-backup，未备份）'}`);
