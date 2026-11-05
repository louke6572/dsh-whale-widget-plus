/**
 * 观看历史 → 「她对这条视频做过什么」。
 *
 * 数据全部来自已有记账，不新增写入：
 *   · `quota.json.log`：评论（comment.mjs 发送成功后 record 的那条）
 *       - 无 parent → 主评论；share → 分享评论
 *       - parent + reply → 回复别人；+ ta → 主动搭话
 *       - parent + mine → 动态回复
 *       - parent 但没有 reply/mine → 鱼群保护聚拢（comment.mjs 对 FISH_GATHER 故意不加 --reply）
 *   · `favorites.json`：收藏
 *   · `bili-memory.json` 的 dynamic 条目：发过动态（正文里的 BV）
 *
 * 局限：旧评论在 quota 里只存 note 前 40 字，所以页面上显示的是一句预览，不是全文。
 * 为什么不用 B站 接口回读：每次打开观看历史都去翻几十条评论会被风控，而且旧评论不一定还在。
 */
import fs from 'node:fs';
import { biliState } from './state-paths.mjs';

export const ACTION_LABELS = {
  main: '主评论',
  gather: '鱼群保护·聚拢回复',
  reply: '回复别人',
  ta: '主动搭话',
  mine: '动态回复',
  share: '分享评论·@主人',
  favorite: '收藏',
  dynamic: '发过动态',
};

const BV_RE = /BV[0-9A-Za-z]{10}/;

export function bvOf(value) {
  const match = BV_RE.exec(String(value ?? ''));
  return match ? match[0] : '';
}

function isoDate(value) {
  const time = new Date(value ?? 0);
  return Number.isFinite(time.getTime()) ? time.toISOString() : '';
}

function readJson(file, fallback = null) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return fallback }
}

/** 把 quota 的一条 comment 记账变成可展示的 action；不是评论/时间坏了返回 null。 */
export function classifyComment(entry = {}) {
  if (!entry || entry.type !== 'comment') return null;
  const at = isoDate(entry.at);
  if (!at) return null;
  const kind = entry.share
    ? 'share'
    : entry.mine
      ? 'mine'
      : entry.ta
        ? 'ta'
        : entry.reply
          ? 'reply'
          : entry.parent
            ? 'gather'
            : 'main';
  const bvid = bvOf(entry.target);
  if (!bvid) return null;
  return {
    type: 'comment',
    kind,
    label: ACTION_LABELS[kind],
    at,
    bvid,
    text: String(entry.note ?? '').replace(/\s+/g, ' ').trim().slice(0, 60),
    parent: entry.parent ? String(entry.parent) : '',
  };
}

function commentActions(quotaFile) {
  const data = readJson(quotaFile, { log: [] }) ?? { log: [] };
  const out = [];
  for (const entry of (Array.isArray(data.log) ? data.log : [])) {
    const action = classifyComment(entry);
    if (action) out.push(action);
  }
  return out;
}

function favoriteActions(favoritesFile) {
  const data = readJson(favoritesFile, { items: [] }) ?? { items: [] };
  const out = [];
  for (const item of (Array.isArray(data.items) ? data.items : [])) {
    const bvid = bvOf(item?.bv);
    if (!bvid) continue;
    out.push({
      type: 'favorite',
      kind: 'favorite',
      label: ACTION_LABELS.favorite,
      at: isoDate(item.at),
      bvid,
      text: String(item.reason || item.title || '').replace(/\s+/g, ' ').trim().slice(0, 60),
    });
  }
  return out;
}

function dynamicActions(memoryFile) {
  const data = readJson(memoryFile, { entries: [] }) ?? { entries: [] };
  const out = [];
  for (const entry of (Array.isArray(data.entries) ? data.entries : [])) {
    if (String(entry?.type ?? '') !== 'dynamic') continue;
    const at = isoDate(entry.at);
    const bvs = [...new Set([...String(entry.text ?? '').matchAll(/BV[0-9A-Za-z]{10}/g)].map((m) => m[0]))];
    for (const bvid of bvs) {
      out.push({
        type: 'dynamic',
        kind: 'dynamic',
        label: ACTION_LABELS.dynamic,
        at,
        bvid,
        text: String(entry.title ?? '').replace(/\s+/g, ' ').trim().slice(0, 60),
      });
    }
  }
  return out;
}

/**
 * 读所有动作，按时间升序。
 * @param {{quotaFile?:string, favoritesFile?:string, memoryFile?:string}} opts
 */
export function readWatchActions({
  quotaFile = biliState('quota.json'),
  favoritesFile = biliState('favorites.json'),
  memoryFile = biliState('bili-memory.json'),
} = {}) {
  const all = [...commentActions(quotaFile), ...favoriteActions(favoritesFile), ...dynamicActions(memoryFile)];
  const seen = new Set();
  const unique = [];
  for (const action of all) {
    const key = `${action.kind}|${action.bvid}|${action.at}|${action.text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(action);
  }
  return unique.sort((a, b) => new Date(a.at) - new Date(b.at));
}

/**
 * 把动作挂到「这条视频最近一次观看」上（不重复挂到每个历史行）。
 * 如果动作早于所有观看记录（比如先评论后补看），挂到最早那条，至少不丢。
 */
export function attachWatchActions(items, actions, { maxPerItem = 20 } = {}) {
  const list = (items ?? []).map((item, index) => ({
    item,
    index,
    time: Number.isFinite(Date.parse(String(item?.at ?? ''))) ? Date.parse(String(item.at)) : 0,
  }));
  const byBv = new Map();
  for (const row of list) {
    const bvid = String(row.item?.bvid ?? '');
    if (!bvid) continue;
    if (!byBv.has(bvid)) byBv.set(bvid, []);
    byBv.get(bvid).push(row);
  }
  for (const rows of byBv.values()) rows.sort((a, b) => a.time - b.time);

  for (const action of actions ?? []) {
    const rows = byBv.get(String(action.bvid ?? ''));
    if (!rows?.length) continue;
    const actionTime = Date.parse(String(action.at ?? ''));
    const before = Number.isFinite(actionTime) ? rows.filter((row) => row.time <= actionTime) : [];
    const target = before.length ? before[before.length - 1] : rows[0];
    if (!target) continue;
    target.item.actions ??= [];
    if (target.item.actions.length >= maxPerItem) continue;
    target.item.actions.push({ ...action, beforeFirstWatch: !before.length });
  }

  for (const row of list) {
    if (!Array.isArray(row.item.actions)) row.item.actions = [];
    row.item.actions.sort((a, b) => new Date(a.at) - new Date(b.at));
  }
  return items;
}

/** 给页面顶部用的汇总；watchedOnly = 没有留下任何动作的观看记录行数。 */
export function summarizeWatchActions(items) {
  const counts = {
    main: 0, gather: 0, reply: 0, ta: 0, mine: 0, share: 0, favorite: 0, dynamic: 0,
  };
  let total = 0;
  for (const item of (items ?? [])) {
    for (const action of (item.actions ?? [])) {
      if (counts[action.kind] != null) counts[action.kind] += 1;
      total += 1;
    }
  }
  const comments = counts.main + counts.gather + counts.reply + counts.ta + counts.mine + counts.share;
  return {
    total,
    comments,
    ...counts,
    watchedOnly: (items ?? []).filter((item) => !(item.actions ?? []).length).length,
    items: (items ?? []).length,
  };
}

/** 一步到位：读动作 → 挂到 items → 汇总。 */
export function enrichWatchHistory(items, opts = {}) {
  const actions = readWatchActions(opts);
  const enriched = attachWatchActions(items, actions);
  return { items: enriched, actions: summarizeWatchActions(enriched) };
}
