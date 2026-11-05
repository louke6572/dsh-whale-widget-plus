// 手动刷新 B站记忆（不需要重启桥接）。
//
// 用法：
//   node scripts/bili-memory-sync.mjs
//   node scripts/bili-memory-sync.mjs --status
//
// 生成：state/bili-memory.md / bili-memory-brief.md / bili-memory.json
// 隐私：不读任何私信文件；日记里转述私信的段落整段丢弃。
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBiliMemory } from '../src/bili-memory.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const memory = createBiliMemory({ stateDir: path.join(ROOT, 'state'), log: console.log });

if (process.argv.includes('--status')) {
  console.log(JSON.stringify(memory.status(), null, 2));
  process.exit(0);
}

const stats = await memory.refresh({ force: true });
console.log(JSON.stringify(stats, null, 2));
process.exit(stats.ok ? 0 : 1);
