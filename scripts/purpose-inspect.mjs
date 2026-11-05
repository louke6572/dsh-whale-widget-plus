// 目的机制只读检查器：把当前角色的「人格卡 + 记忆卡 + 近期 QQ/B站 记忆」喂给
// src/purpose-engine.js，打印会生成哪些目标假设、当前驱动、会选哪一个。
//
// 只读：不写 state/、不连 DSH、不发 QQ。
// 用途：a) 换角色/改人格卡后不用重启桥接就能验证「载入即生成动机」；
//      b) 以后把目的机制抽成独立小插件时，这就是最小的 driver 示例。
//
// 运行：node scripts/purpose-inspect.mjs [--json]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  analyzePersona, collectMaterials, deriveDrives, formGoalHypotheses, selectPurpose,
  summarizePurposeState, normalizePurposeConfig,
} from '../src/purpose-engine.js';
import { activeMemoryPaths, activePersonaFile, activePlatformStateDir, readCurrentCharacter } from '../src/character-persona.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dshHome = process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
const asJson = process.argv.includes('--json');

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function readText(file) {
  try { return fs.readFileSync(file, 'utf8'); } catch { return ''; }
}

const character = readCurrentCharacter();
const personaText = readText(activePersonaFile());
const persona = analyzePersona(personaText);
const memoryPath = activeMemoryPaths().json;
const memoryCard = readJson(memoryPath, { records: [] });
const biliStateDir = activePlatformStateDir(path.join(dshHome, 'surfcore', 'bili'));
const biliIndex = readJson(path.join(biliStateDir, 'bili-memory.json'), null)
  ?? readJson(path.join(root, 'state', 'bili-memory.json'), { entries: [] });
const social = readJson(path.join(root, 'state', 'social-v2.json'), { conversations: {} });
const qqConfig = readJson(path.join(root, 'config.json'), {});
const ownerQQ = String(qqConfig.ownerQQ ?? '').replace(/[^\d]/g, '');
const roleName = String(character?.name ?? readJson(path.join(root, 'state', 'current-role.json'), {}).role ?? '');
const conversations = Object.entries(social.conversations ?? {}).map(([key, st]) => ({ key, ...(st ?? {}) }));

const now = Date.now();
const config = normalizePurposeConfig({}, { ownerQQ });
const packet = collectMaterials({
  now,
  config,
  ownerUin: ownerQQ,
  roleName,
  conversations,
  biliEntries: Array.isArray(biliIndex?.entries) ? biliIndex.entries : [],
  memoryRecords: Array.isArray(memoryCard?.records) ? memoryCard.records : [],
});
const lastMasterAt = conversations
  .filter((c) => c.key === `private:${ownerQQ}`)
  .map((c) => Number(c.lastIncomingAt) || 0)
  .sort((a, b) => b - a)[0] ?? 0;
const derived = deriveDrives({ drives: {}, materials: packet.items, now, lastMasterAt, personaBias: persona.bias });
const formed = formGoalHypotheses({
  materials: packet.items,
  goals: [],
  observations: [],
  drives: derived.drives,
  now,
  lastMasterAt,
  config,
  roleName,
  persona,
});
const selection = selectPurpose({
  goals: formed.goals,
  seeds: [],
  pending: [],
  history: [],
  config,
  drives: derived.drives,
  now,
  lastMasterAt,
  random: () => 0.3,
});

const summary = summarizePurposeState({
  day: '', countToday: 0, pending: [], history: [],
  drives: derived.drives, drivesAt: derived.drivesAt, goals: formed.goals, observations: formed.observations,
  lastEmotion: '', lastEmotionText: '', lastGoalId: '',
}, { config, now });

const report = {
  readonly: true,
  character: character ? { id: character.id, name: character.name } : null,
  persona: {
    chars: personaText.length,
    traits: persona.traits.slice(0, 6).map((t) => ({ label: t.label, hits: t.hits, bias: Number(t.bias.toFixed(2)) })),
    bias: Object.fromEntries(Object.entries(persona.bias).map(([k, v]) => [k, Number(v.toFixed(2))])),
  },
  materials: {
    total: packet.items.length,
    stats: packet.stats,
  },
  drives: Object.fromEntries(Object.entries(derived.drives).map(([k, v]) => [k, Number(v.toFixed(2))])),
  topNeeds: summary.topNeeds,
  goals: formed.goals.map((g) => ({
    owner: g.owner, ownerLabel: g.owner === 'self' ? '我' : g.owner === 'owner' ? '主人' : g.owner === 'member' ? '群友' : '视频里',
    domain: g.domain, source: g.source, confidence: Number(g.confidence.toFixed(2)),
    value: Number(g.value.toFixed(2)), risk: Number(g.risk.toFixed(2)),
    action: g.action, status: g.status, intent: g.intent.slice(0, 80),
  })),
  selected: selection.purpose ? {
    owner: selection.purpose.goalOwner, domain: selection.purpose.need,
    confidence: selection.purpose.confidence, risk: selection.purpose.risk,
    action: selection.purpose.action, text: selection.purpose.text,
  } : null,
};
// 保持 JSON 干净：report 里只放只读摘要。

if (asJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`角色：${report.character ? `${report.character.name}（${report.character.id}）` : '无角色包（旧布局）'}`);
  console.log(`人格卡：${report.persona.chars} 字 · traits=${report.persona.traits.map((t) => `${t.label}×${t.hits}`).join('、') || '无'}`);
  console.log(`素材：${report.materials.total} 条（${JSON.stringify(report.materials.stats)}）`);
  console.log(`驱动：${Object.entries(report.drives).map(([k, v]) => `${k}=${v}`).join(' ')}`);
  console.log(`最想要：${report.topNeeds.map((n) => `${n.label} ${n.value}%`).join(' / ') || '—'}`);
  console.log(`目标假设（${report.goals.length}）：`);
  for (const g of report.goals.slice(0, 10)) {
    console.log(`  [${g.ownerLabel}/${g.domain}/${g.source}] ${g.intent}  (conf ${g.confidence}, risk ${g.risk}, ${g.action})`);
  }
  console.log('这次会选：' + (report.selected
    ? `[${report.selected.owner ?? '?'}/${report.selected.domain}] ${report.selected.text}（conf ${report.selected.confidence}, risk ${report.selected.risk}）`
    : '无'));
}
