/**
 * 生成 A+B 账单：
 *   ~/.dsh/surfcore/billing/
 *     index.md
 *     characters/<id>/summary.md
 *     conversations/<group|private>.md
 *
 * 只读 token 账本 + 遥测；不调用模型、不改会话。
 *
 * 用法：
 *   node scripts/billing-report.mjs
 *   node scripts/billing-report.mjs --out <dir>
 *   node scripts/billing-report.mjs --ledger <file> --bridge <file> --plugin <file>
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildBillingReport,
  renderCharacterBill,
  renderConversationBill,
  renderIndex,
} from '../src/billing-report.js';
import { readCurrentCharacter } from '../src/character-persona.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dshHome = process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
const surfcoreHome = path.join(dshHome, 'surfcore');

function readText(file) {
  try { return fs.readFileSync(file, 'utf8'); } catch { return ''; }
}

function readJson(file, fallback = null) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

function readJsonl(file) {
  const out = [];
  for (const line of readText(file).split('\n')) {
    if (!line.trim()) continue;
    try { out.push(JSON.parse(line)); } catch {}
  }
  return out;
}

function fileId(value) {
  return String(value ?? '').trim().replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 120) || 'unknown';
}

function writeAtomic(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, text, { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(tmp, file);
}

function parseArgs(argv) {
  const out = {
    out: path.join(surfcoreHome, 'billing'),
    ledger: path.join(root, 'state', 'token-usage.jsonl'),
    bridge: path.join(root, 'state', 'context-telemetry-bridge.jsonl'),
    plugin: path.join(surfcoreHome, 'context-telemetry-plugin.jsonl'),
  };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--out') out.out = argv[++i] ?? out.out;
    else if (argv[i] === '--ledger') out.ledger = argv[++i] ?? out.ledger;
    else if (argv[i] === '--bridge') out.bridge = argv[++i] ?? out.bridge;
    else if (argv[i] === '--plugin') out.plugin = argv[++i] ?? out.plugin;
  }
  return out;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const current = (() => { try { return readCurrentCharacter(); } catch { return null; } })();
  const index = readJson(path.join(surfcoreHome, 'characters', 'index.json'), { characters: [] });
  const characterCount = Array.isArray(index?.characters) ? index.characters.length : 0;
  const currentCharacterId = String(current?.id ?? '');
  const currentCharacterName = String(current?.name ?? '');
  const report = buildBillingReport({
    ledgerText: readText(args.ledger),
    telemetryRecords: [...readJsonl(args.bridge), ...readJsonl(args.plugin)],
    currentCharacterId,
    currentCharacterName,
    characterCount,
  });

  const characterEntries = [];
  const conversationEntries = [];
  for (const c of report.characters) {
    const id = c.id || '_unattributed';
    const dir = path.join(args.out, 'characters', fileId(id));
    const file = path.join(dir, 'summary.md');
    writeAtomic(file, renderCharacterBill({
      characterId: c.id,
      name: c.name || (c.id ? c.id : '未归因'),
      agg: c.agg,
      turns: c.turns,
      telemetry: report.telemetry,
      conversationRows: c.conversations,
      attribution: c.attribution,
      includeUnattributed: c.attribution === 'single-character',
    }));
    characterEntries.push({
      id,
      name: c.name || (c.id ? c.id : '未归因'),
      cost: c.agg.cost,
      calls: c.agg.calls,
    });
  }
  for (const c of report.conversations) {
    const dir = path.join(args.out, 'conversations');
    const file = path.join(dir, c.file);
    writeAtomic(file, renderConversationBill({
      key: c.key,
      agg: c.agg,
      turns: c.turns,
      telemetry: report.telemetry,
    }));
    conversationEntries.push({ key: c.key, file: c.file, cost: c.agg.cost, calls: c.agg.calls });
  }
  writeAtomic(
    path.join(args.out, 'index.md'),
    renderIndex({ conversations: conversationEntries, characters: characterEntries }),
  );

  const total = report.ledger.reduce((n, r) => n + r.cost, 0);
  console.log(`账单已生成 → ${args.out}`);
  console.log(`角色 ${characterEntries.length} 个 · 会话 ${conversationEntries.length} 个 · 总成本 ${total.toFixed(4)}`);
  for (const c of characterEntries) console.log(`  characters/${fileId(c.id)}/summary.md  ${c.name}  ¥${c.cost.toFixed(4)}  ${c.calls} calls`);
  for (const c of conversationEntries.slice(0, 12)) console.log(`  conversations/${c.file}  ${c.key}  ¥${c.cost.toFixed(4)}  ${c.calls} calls`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
