// 分享形式与分享文本：桥接和插件宿主共用的一份纯逻辑。
//
// 为什么单独一个文件：插件的 `store.js` / `automation.js` 会 import 它。
// DSH 热重载插件时只会重新求值插件目录内的文件，`src/` 下**同路径**的 ESM 模块
// 会被 Node 的模块缓存留下旧版本（2026-10-23 踩到：卡片改成 text 后，设置页快照
// 仍报 link）。纯逻辑放独立新文件，换路径就能让运行中的插件加载到新代码。
//
// 模式：
//   · text（默认）：先发「【B站】标题 + 链接」文本，再发角色短评；
//   · miniapp：旧的小程序卡片（点开会提示已下架，opt-in）；
//   · off：系统不发，链接交给角色写进短评。

export const CARD_MODES = ['off', 'text', 'miniapp'];

/**
 * 把 `biliBridge.share` 收敛成分享模式。
 *
 * 兼容旧值：`card: false` → off；`card: true` 或没写 → text；
 * `cardMode: 'link'` 是 2026-10-23 的中间值（当时以为链接卡能显示）→ text。
 *
 * @param {{card?:boolean, cardMode?:string}|null|undefined} share
 * @returns {'off'|'text'|'miniapp'}
 */
export function normalizeCardMode(share) {
  const raw = String(share?.cardMode ?? '').trim().toLowerCase();
  if (raw === 'text' || raw === 'link') return 'text';
  if (raw === 'off' || raw === 'miniapp') return raw;
  return share?.card === false ? 'off' : 'text';
}

function clampText(text, max) {
  return String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

/** 分享文本：第一行标题，第二行链接（QQ 会把链接识别成可点）。 */
export function buildBiliShareText({ title, jumpUrl } = {}) {
  const cleanTitle = clampText(title, 120) || 'B站视频';
  const url = String(jumpUrl ?? '').trim();
  return `【B站】${cleanTitle}${url ? `\n${url}` : ''}`;
}
