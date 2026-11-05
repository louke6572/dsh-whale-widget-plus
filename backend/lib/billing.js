/**
 * 账单自动写入：把 token 账本 + 遥测生成到
 *   <stateDir>/billing/index.md
 *   <stateDir>/billing/characters/<id>/summary.md
 *   <stateDir>/billing/conversations/<group|private>.md
 *
 * 只读文件、写 Markdown；不调用模型。默认启动 30 秒后生成一次，之后每 10 分钟刷新。
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  buildBillingReport, renderCharacterBill, renderConversationBill, renderIndex,
} from '../../src/billing-report.js';

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

/**
 * @param {object} opts
 * @param {string} opts.stateDir        ~/.dsh/surfcore
 * @param {string} opts.qqRoot          仓库根（state/token-usage.jsonl 所在）
 * @param {() => object|null} opts.readCurrentCharacter
 * @param {(msg:string, err?:unknown)=>void} [opts.log]
 * @param {number} [opts.intervalMs]     默认 10 分钟；0 = 不自动刷新
 */
export function createBillingService({
  stateDir,
  qqRoot,
  readCurrentCharacter = () => null,
  log = () => {},
  intervalMs = 10 * 60 * 1000,
} = {}) {
  const outDir = path.join(stateDir, 'billing');
  const ledgerFile = path.join(qqRoot, 'state', 'token-usage.jsonl');
  const bridgeFile = path.join(qqRoot, 'state', 'context-telemetry-bridge.jsonl');
  const pluginFile = path.join(stateDir, 'context-telemetry-plugin.jsonl');
  let timer = null;
  let running = false;
  let last = null;

  function generate() {
    if (running) return last;
    running = true;
    try {
      const current = (() => { try { return readCurrentCharacter(); } catch { return null; } })();
      const index = readJson(path.join(stateDir, 'characters', 'index.json'), { characters: [] });
      const characterCount = Array.isArray(index?.characters) ? index.characters.length : 0;
      const report = buildBillingReport({
        ledgerText: readText(ledgerFile),
        telemetryRecords: [...readJsonl(bridgeFile), ...readJsonl(pluginFile)],
        currentCharacterId: String(current?.id ?? ''),
        currentCharacterName: String(current?.name ?? ''),
        characterCount,
      });

      const characters = [];
      const conversations = [];
      for (const c of report.characters) {
        const id = c.id || '_unattributed';
        writeAtomic(path.join(outDir, 'characters', fileId(id), 'summary.md'), renderCharacterBill({
          characterId: c.id,
          name: c.name || (c.id ? c.id : '未归因'),
          agg: c.agg,
          turns: c.turns,
          telemetry: report.telemetry,
          conversationRows: c.conversations,
          attribution: c.attribution,
          includeUnattributed: c.attribution === 'single-character',
        }));
        characters.push({ id, name: c.name || (c.id ? c.id : '未归因'), cost: c.agg.cost, calls: c.agg.calls });
      }
      for (const c of report.conversations) {
        writeAtomic(path.join(outDir, 'conversations', c.file), renderConversationBill({
          key: c.key,
          agg: c.agg,
          turns: c.turns,
          telemetry: report.telemetry,
        }));
        conversations.push({ key: c.key, file: c.file, cost: c.agg.cost, calls: c.agg.calls });
      }
      writeAtomic(path.join(outDir, 'index.md'), renderIndex({ conversations, characters }));
      last = {
        ok: true,
        at: Date.now(),
        dir: outDir,
        characters: characters.length,
        conversations: conversations.length,
        totalCost: report.ledger.reduce((n, r) => n + r.cost, 0),
      };
      return last;
    } catch (error) {
      log(`[billing] 生成失败：${String(error?.message ?? error).slice(0, 200)}`);
      last = { ok: false, at: Date.now(), error: String(error?.message ?? error) };
      return last;
    } finally {
      running = false;
    }
  }

  function start() {
    if (timer || !intervalMs || intervalMs <= 0) return;
    const first = setTimeout(() => { try { generate(); } catch {} }, 30_000);
    first.unref?.();
    timer = setInterval(() => { try { generate(); } catch {} }, Math.max(60_000, Number(intervalMs) || 600000));
    timer.unref?.();
  }

  function dispose() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  return { generate, start, dispose, outDir, last: () => last };
}
