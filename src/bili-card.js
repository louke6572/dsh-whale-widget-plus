// B站视频分享：往群里发「标题 + 链接」。
//
// 历史（两次真机反馈，别重复踩）：
//   1. 2026-10-22：默认走 SnowLuma `get_mini_app_ark`（B站小程序卡片），
//      B站小程序在 QQ 侧已下架，点开提示「小程序已下架」。
//   2. 2026-10-23：改成手拼 `com.tencent.structmsg` 新闻卡，QQ 直接显示
//      「发送者版本过低，无法展示内容」——连 SnowLuma 自带的 `share` 段和
//      不带 ver 的变体也一样。结论：**这个发送端（SnowLuma）发不了 structmsg 卡片**，
//      这是对端客户端的版本门，不是 JSON 字段问题。
//
// 所以默认改成纯文本「【B站】标题 + 链接」：任何 QQ 都能点，不依赖卡片渲染。
// 小程序卡保留成 opt-in（`cardMode = 'miniapp'`，点开仍会提示已下架，只在确认恢复后用）。
//
// 这个文件只做三件事，方便单测：
//   · 转发 share-mode 的纯逻辑（模式收敛 / 分享文本）；
//   · buildBiliCardArk：structmsg ARK 纯函数，保留给诊断脚本/以后 QQ 支持再用；
//   · createBiliCardSender：把发送/抓标题/缓存都注入进来，桥接只负责接线。

// 纯逻辑放在独立的 `share-mode.js`：插件宿主也要 import，
// 换新文件路径才能在 DSH 不重启的情况下清掉 ESM 缓存（见 share-mode.js 顶部注释）。
export { CARD_MODES, normalizeCardMode, buildBiliShareText } from './share-mode.js';
import { normalizeCardMode, buildBiliShareText } from './share-mode.js';

/** B站图床经常给 http://，QQ 客户端对混合内容不友好，统一升级成 https。 */
export function httpsifyImage(url) {
  const text = String(url ?? '').trim();
  if (!text) return '';
  return text.replace(/^http:\/\//i, 'https://');
}

function clampText(text, max) {
  return String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

/**
 * 拼 `com.tencent.structmsg` 新闻卡 ARK。
 *
 * ⚠️ 生产默认路径**不再用它**：真机验证 QQ 会显示「发送者版本过低，无法展示内容」。
 * 保留它是为了 `scripts/probe-bili-card-formats.mjs` 能继续对比字段，
 * 以及以后 SnowLuma/QQ 支持了可以直接切回来。
 *
 * @param {{bvid?:string,title?:string,desc?:string,pic?:string,jumpUrl?:string,uin?:number,ctime?:number}} input
 */
export function buildBiliCardArk(input = {}) {
  const bvid = String(input.bvid ?? '').trim();
  const title = clampText(input.title, 120) || (bvid ? `B站视频 ${bvid}` : 'B站视频');
  const desc = clampText(input.desc, 120) || title;
  const pic = httpsifyImage(input.pic);
  const jumpUrl = String(input.jumpUrl ?? '').trim() || `https://www.bilibili.com/video/${bvid}`;
  const uin = Number(input.uin) || 0;
  const ctime = Math.floor((Number(input.ctime) || Date.now()) / 1000);
  const news = {
    action: '',
    android_pkg_name: 'tv.danmaku.bili',
    app_type: 1,
    appid: 100951776,
    ctime,
    desc,
    jumpUrl,
    preview: pic,
    source_icon: 'https://www.bilibili.com/favicon.ico',
    tag: '哔哩哔哩',
    title,
    uin,
  };
  return {
    app: 'com.tencent.structmsg',
    config: { autosize: true, ctime, forward: true, type: 'normal' },
    desc: '新闻',
    extra: {
      app_type: 1,
      appid: 1,
      uin,
      title,
      desc,
      preview: pic,
      jumpUrl,
      tag: '哔哩哔哩',
      source: '哔哩哔哩',
    },
    meta: { news },
    prompt: `[分享] ${title}`,
    ver: '0.0.0.1',
    view: 'news',
  };
}

/**
 * 生成 `sendBiliCard(key, card)`（名字沿用旧调用点）。
 *
 * 注入点（全部可替换，单测不需要真网络）：
 *   · getShare：返回当前的 `biliBridge.share`；
 *   · fetchVideoInfo：缺标题时补；
 *   · requestMiniArk：调 SnowLuma `get_mini_app_ark`（仅 miniapp 模式）；
 *   · sendGroupSegments：发 OneBot 消息段（桥接里就是 onebotSendSegments）。
 *
 * @param {{
 *   getShare?:()=>any,
 *   fetchVideoInfo?:(bvid:string)=>Promise<any>,
 *   requestMiniArk?:(input:{title:string,desc:string,picUrl:string,jumpUrl:string})=>Promise<any>,
 *   sendGroupSegments?:(id:string,segments:any[])=>Promise<any>,
 *   log?:(...args:any[])=>void,
 *   now?:()=>number,
 * }} deps
 */
export function createBiliCardSender({
  getShare = () => ({}),
  fetchVideoInfo = async () => null,
  requestMiniArk = async () => { throw new Error('没有配置小程序卡片通道'); },
  sendGroupSegments = async () => { throw new Error('没有配置发送通道'); },
  log = () => {},
  now = () => Date.now(),
} = {}) {
  // 同一个 bvid 的 ARK 5 分钟内复用：8 个时间点 × 多个群时避免重复请求 SnowLuma。
  const miniCache = new Map();

  return async function sendBiliCard(key, card) {
    const share = getShare() ?? {};
    const mode = normalizeCardMode(share);
    if (mode === 'off') return false;

    const [kind, id] = String(key ?? '').split(':');
    if (kind !== 'group' || !/^\d+$/.test(String(id ?? ''))) return false;
    const bvid = String(card?.bvid ?? '').trim();
    if (!/^BV[0-9A-Za-z]{10}$/.test(bvid)) return false;

    let title = clampText(card?.title, 120);
    let pic = httpsifyImage(card?.pic);
    let info = null;
    if (!title || (mode === 'miniapp' && !pic)) {
      try { info = await fetchVideoInfo(bvid); } catch {}
      if (!title) title = clampText(info?.title, 120);
      if (!pic) pic = httpsifyImage(info?.pic);
    }
    if (!title) return false;
    const jumpUrl = `https://www.bilibili.com/video/${bvid}`;
    const desc = clampText(card?.reason || card?.quote || card?.text || info?.desc || title, 120);

    // 链接文本：默认路径，也是 miniapp 失败后的兜底。
    const sendText = async () => {
      try {
        await sendGroupSegments(id, [{ type: 'text', data: { text: buildBiliShareText({ title, jumpUrl }) } }]);
        return true;
      } catch (error) {
        log(`[B站分享] 链接文本发送失败 ${key}：${error?.message ?? error}`);
        return false;
      }
    };

    if (mode === 'miniapp') {
      try {
        let cached = miniCache.get(bvid);
        if (!cached || now() - cached.at > 5 * 60 * 1000) {
          cached = { at: now(), data: await requestMiniArk({ title, desc, picUrl: pic, jumpUrl }) };
          if (!cached.data) throw new Error('小程序 ARK 为空');
          miniCache.set(bvid, cached);
        }
        await sendGroupSegments(id, [{ type: 'json', data: { data: cached.data } }]);
        return true;
      } catch (error) {
        // B站小程序已下架时这里通常不会报错（SnowLuma 照样生成 ARK），
        // 所以 miniapp 是 opt-in；真报错就退回文本，至少群友还能点。
        log(`[B站分享] 小程序卡片失败，改用链接文本 ${key}：${error?.message ?? error}`);
      }
    }

    return sendText();
  };
}
