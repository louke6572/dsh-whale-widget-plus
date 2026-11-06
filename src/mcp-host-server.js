// SnowLuma 网关状态查询 MCP server（stdio）。
// 由 DSH 的 MCP 客户端 spawn（cordis.patch.yml 里 mcp-snowluma-host 行）。
//
// 工具：
//   snowluma_status   —— 检查网关是否在线（只读：HTTP get_login_info）与账号信息
//
// ── 为什么这里**没有**启停 SnowLuma 的工具（2026-09-20 移除，不要加回来）────────────
//
// 曾经有 `start_snowluma` / `stop_snowluma`（`spawn launcher.bat` / `taskkill`），默认关闭、
// 需要 `snowluma.allowProcessControl: true` 才注册。它们被移除，理由不是"危险"，而是**许可**：
//
//   SnowLuma EULA §5.4（中文为准）：「除事先取得著作权人的书面授权外，您仅可为 LICENSE 允许的
//   非商业用途，以专有组件随本软件提供的形式运行该组件；不得复制、修改、单独再分发或再许可该组件。
//   **将其并入第三方安装包或 Docker 镜像、通过自动化脚本部署**，或者将其用于任何商业用途，
//   均须事先取得书面授权。」
//
// 原生组件是**专有组件**；由本程序**程序化启动/结束**它，落在"通过自动化脚本部署"的射程内。
// 即便是"用户已装好、我们帮忙拉起"，也不值得为这点便利去踩一条需要书面授权的条款。
//
// 设计不变量 L6（见规划集 QSH_PLAN.md §6.0）：**QSH 只探测、不部署**——
// 永不安装、复制、打包或自动部署 SnowLuma 及其原生组件，也不程序化启停其进程。
// 用户在 QQ 侧不可用时得到的应该是**可操作的提示**（"请自行启动 SnowLuma"），而不是被代劳。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { effectiveQqConfigFile } from './config-locate.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function loadConfig() {
  try {
    // QQ 配置在**数据根**（$DSH_HOME/surfcore/qq/config.json）；数据根还没迁移时
    // effectiveQqConfigFile() 会回退读旧布局（clone 安装的仓库根），保证 MCP 子进程不掉配置。
    let text = fs.readFileSync(effectiveQqConfigFile(), 'utf8');
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
    return JSON.parse(text);
  } catch {
    return {};
  }
}

function getConfig() {
  return loadConfig();
}

function getHostConfig() {
  const c = getConfig();
  const httpUrl = (c.snowluma?.httpUrl ?? 'http://127.0.0.1:3000').replace(/\/+$/, '');
  const homeDir = c.snowluma?.homeDir ?? (c.snowluma?.launcherPath ? path.dirname(c.snowluma.launcherPath) : '');
  return { httpUrl, homeDir, token: c.snowluma?.accessToken ?? '' };
}

async function gatewayInfo() {
  const { httpUrl, token } = getHostConfig();
  try {
    const res = await fetch(`${httpUrl}/get_login_info`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      signal: AbortSignal.timeout(5000)
    });
    if (!res.ok) {
      const hint = res.status === 426 ? '（HTTP 426：snowluma.httpUrl 可能指向了 WebSocket 端口，请改为 OneBot HTTP API 地址）' : '';
      return { reachable: false, httpStatus: res.status, ...(hint ? { hint } : {}) };
    }
    const body = await res.json();
    if (body?.status === 'ok' && body?.retcode === 0) {
      return { reachable: true, online: true, user_id: body.data?.user_id, nickname: body.data?.nickname };
    }
    return { reachable: true, online: false, retcode: body?.retcode, wording: body?.wording };
  } catch (error) {
    return { reachable: false, error: String(error?.message ?? error) };
  }
}

const server = new McpServer({ name: 'snowluma-host', version: '0.2.0-r4' });

server.tool(
  'snowluma_status',
  '检查 SnowLuma OneBot 网关是否在线（只读探活 get_login_info）。返回网关可达性、QQ 在线状态与账号信息。网关不可达时返回可操作的提示（本程序不会代你启动 SnowLuma）。',
  {},
  async () => {
    const hc = getHostConfig();
    const info = await gatewayInfo();
    // 只读工具：不再暴露本机路径/PID（那需要进程控制能力，而该能力已被移除）。
    const payload = { ...info };
    if (info.reachable === false) {
      payload.hint = 'SnowLuma 网关不可达。请自行启动 SnowLuma（本程序不代装、不代启，原因见项目文档的合规说明 L6）。'
        + (hc.homeDir ? '' : ' 若 config.json 的 snowluma.httpUrl 与实际端口不一致，也请一并检查。');
    }
    return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] };
  }
);

// ── 贴吧（BDUSS 已登录）──────────────────────────────────────────────────────
// 为什么放在这里：QQ 仿真会话没有本地工具，模型想「刷贴吧」时只能 web_fetch，
// 而贴吧网页对未登录请求直接 403，看起来像登录失效。做成 MCP 工具后，
// 任何会话（QQ / 网页）都能直接命令使用已登录的 BDUSS，和 B站 的 bili.mjs 等价。
const tiebaToolResult = (payload) => ({ content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] });
const tiebaToolError = (error) => ({
  isError: true,
  content: [{ type: 'text', text: `贴吧操作失败：${String(error?.message ?? error)}` }],
});

async function runTieba(action, payload = {}) {
  const mod = await import('../backend/lib/tieba.js');
  return mod.tiebaAction(action, payload);
}

server.tool(
  'tieba_status',
  '查看贴吧登录状态与「刷哪些吧」。贴吧已用手机扫码登录，工具走已登录的 BDUSS；不要用网页抓取（网页侧没有登录态）。',
  {},
  async () => {
    try { return tiebaToolResult(await runTieba('status')); } catch (error) { return tiebaToolError(error); }
  }
);

server.tool(
  'tieba_feed',
  '刷贴吧：读取「刷哪些吧」里各吧的帖子列表，按口味排序，返回 id/标题/回复数/链接。想看具体内容用 tieba_thread。',
  { sort: z.enum(['hot', 'time']).optional().describe('hot=按回复数，time=按吧内顺序') },
  async ({ sort }) => {
    try { return tiebaToolResult(await runTieba('feed', { sort })); } catch (error) { return tiebaToolError(error); }
  }
);

server.tool(
  'tieba_thread',
  '读一条贴吧帖子的正文与楼层。id 是 tieba_feed 返回的帖子 id。',
  {
    id: z.string().describe('帖子 id（thread_id）'),
    page: z.number().int().positive().optional().describe('页码，默认 1'),
  },
  async ({ id, page }) => {
    try { return tiebaToolResult(await runTieba('thread', { id, page })); } catch (error) { return tiebaToolError(error); }
  }
);

server.tool(
  'tieba_replyme',
  '看我被 @ 的消息（替代网页里的「回复我的」）。',
  { page: z.number().int().positive().optional().describe('页码，默认 1') },
  async ({ page }) => {
    try { return tiebaToolResult(await runTieba('replyme', { page })); } catch (error) { return tiebaToolError(error); }
  }
);

server.tool(
  'tieba_reply',
  '在贴吧回帖（纯文本，4~400 字，禁止 Markdown/链接）。',
  {
    threadId: z.string().describe('帖子 id'),
    content: z.string().describe('回复正文'),
    bar: z.string().optional().describe('吧名；不传则自动识别或使用默认吧'),
  },
  async ({ threadId, content, bar }) => {
    try { return tiebaToolResult(await runTieba('reply', { threadId, content, bar })); } catch (error) { return tiebaToolError(error); }
  }
);

server.tool(
  'tieba_post',
  '在贴吧发新帖（标题 ≤30 字、正文 ≤1000 字，纯文本）。',
  {
    title: z.string().describe('标题'),
    content: z.string().describe('正文'),
    bar: z.string().optional().describe('吧名；默认发「刷哪些吧」的第一个'),
  },
  async ({ title, content, bar }) => {
    try { return tiebaToolResult(await runTieba('post', { title, content, bar })); } catch (error) { return tiebaToolError(error); }
  }
);

server.tool(
  'tieba_like',
  '给帖子或楼层点赞 / 取消点赞。postId 为空表示给主帖点赞。',
  {
    threadId: z.string().describe('帖子 id'),
    postId: z.string().optional().describe('楼层 id；不传则点赞主帖'),
    undo: z.boolean().optional().describe('true=取消点赞'),
  },
  async ({ threadId, postId, undo }) => {
    try { return tiebaToolResult(await runTieba(undo ? 'unlike' : 'like', { threadId, postId })); } catch (error) { return tiebaToolError(error); }
  }
);

server.tool(
  'tieba_sign',
  '贴吧签到（默认签「刷哪些吧」里的全部；也可只签一个吧）。',
  { bar: z.string().optional().describe('只签这个吧') },
  async ({ bar }) => {
    try { return tiebaToolResult(await runTieba('sign', { bar })); } catch (error) { return tiebaToolError(error); }
  }
);

server.tool(
  'tieba_summary',
  '收工记录：把这次刷贴吧做了什么写进「上次总结」。',
  { note: z.string().describe('这次逛吧做了什么') },
  async ({ note }) => {
    try { return tiebaToolResult(await runTieba('summary', { note })); } catch (error) { return tiebaToolError(error); }
  }
);

// ── 抖音（第 4 个平台：网页版 + 本机 Edge）──────────────────────────────────
// 和贴吧的理由一样：QQ 会话没有本地 shell，也不能开浏览器；
// 抖音必须走已经开着的专用 Edge（登录态在那儿），所以做成 MCP 工具由宿主代跑。
const runDouyin = async (name, args) => {
  const mod = await import('../backend/lib/douyin.js');
  if (name === 'douyin_status') return mod.douyinStatus();
  if (name === 'douyin_open') return mod.douyinOpen();
  if (name === 'douyin_current') return mod.douyinCurrent();
  if (name === 'douyin_next') return mod.douyinNext();
  if (name === 'douyin_search') return mod.douyinSearch(args.query);
  if (name === 'douyin_start') return mod.douyinStart({ reason: 'QQ', maxVideos: args.maxVideos });
  if (name === 'douyin_stop') return mod.douyinStop();
  if (name === 'douyin_summary') return mod.douyinSummary(args.note);
  if (name === 'douyin_history') return mod.readDouyinHistory({ limit: args.limit });
  if (name === 'douyin_comments') return mod.douyinComments({ awemeId: args.awemeId, url: args.url, max: args.max, images: args.images !== false });
  if (name === 'douyin_notices') return mod.douyinNotices({ count: args.count });
  if (name === 'douyin_debrief') return mod.douyinDebrief({ awemeId: args.awemeId, url: args.url, danmakuLimit: args.danmakuLimit, commentMax: args.commentMax });
  if (name === 'douyin_chat_status') return mod.douyinChatStatus();
  if (name === 'douyin_chat_contacts') return mod.douyinChatContacts();
  if (name === 'douyin_chat_configure') return mod.douyinChatConfigure({ recipientIds: args.recipientIds, mentionNames: args.mentionNames, allowConversationOnly: args.allowConversationOnly });
  if (name === 'douyin_chat_start') return mod.douyinChatStart();
  if (name === 'douyin_chat_stop') return mod.douyinChatStop();
  if (name === 'douyin_chat_read') return mod.douyinChatRead(args.recipientId);
  if (name === 'douyin_chat_models') return mod.douyinChatModels();
  if (name === 'douyin_chat_set_model') return mod.douyinChatSetModel({ provider: args.provider, model: args.model });
  throw new Error(`未知抖音工具：${name}`);
};

server.tool(
  'douyin_status',
  '查看抖音平台状态：总开关、允许时段、今天已看多久/剩多久、专用窗口在不在、上次总结。不会打开浏览器。',
  {},
  async () => {
    try { return tiebaToolResult(await runDouyin('douyin_status')); } catch (error) { return tiebaToolError(error); }
  }
);

server.tool(
  'douyin_open',
  '打开抖音专用 Edge 窗口（只在用户要求时用；用于扫码登录或人工操作）。不占用观看额度，不会自动开始刷。',
  {},
  async () => {
    try { return tiebaToolResult(await runDouyin('douyin_open')); } catch (error) { return tiebaToolError(error); }
  }
);

server.tool(
  'douyin_current',
  '读取抖音当前正在看的那条：标题、作者、链接、播放进度。只读，不翻页。',
  {},
  async () => {
    try { return tiebaToolResult(await runDouyin('douyin_current')); } catch (error) { return tiebaToolError(error); }
  }
);

server.tool(
  'douyin_next',
  '抖音划到下一条（受允许时段和每日额度约束，超了会被拒）。',
  {},
  async () => {
    try { return tiebaToolResult(await runDouyin('douyin_next')); } catch (error) { return tiebaToolError(error); }
  }
);

server.tool(
  'douyin_search',
  '在抖音网页版搜索关键词并返回可见结果（同样受时段/额度约束）。',
  { query: z.string().describe('搜索词，最多 300 字') },
  async ({ query }) => {
    try { return tiebaToolResult(await runDouyin('douyin_search', { query })); } catch (error) { return tiebaToolError(error); }
  }
);

server.tool(
  'douyin_start',
  '让抖音按设置页的时段/额度自己刷一轮（本地循环：停留 → 下一条），不需要模型参与。',
  { maxVideos: z.number().int().positive().optional().describe('这一轮最多看几条，默认取设置页的值') },
  async ({ maxVideos }) => {
    try { return tiebaToolResult(await runDouyin('douyin_start', { maxVideos })); } catch (error) { return tiebaToolError(error); }
  }
);

server.tool(
  'douyin_stop',
  '停止抖音自动观看并暂停视频（不会关掉专用窗口）。',
  {},
  async () => {
    try { return tiebaToolResult(await runDouyin('douyin_stop')); } catch (error) { return tiebaToolError(error); }
  }
);

server.tool(
  'douyin_summary',
  '收工记录：把这次刷抖音做了什么写进「上次总结」。',
  { note: z.string().describe('这次刷抖音做了什么') },
  async ({ note }) => {
    try { return tiebaToolResult(await runDouyin('douyin_summary', { note })); } catch (error) { return tiebaToolError(error); }
  }
);

server.tool(
  'douyin_history',
  '查看抖音看过的视频记录（本地记账，含标题、作者、链接）。',
  { limit: z.number().int().positive().optional().describe('返回条数，默认 100') },
  async ({ limit }) => {
    try { return tiebaToolResult(await runDouyin('douyin_history', { limit: limit ?? 100 })); } catch (error) { return tiebaToolError(error); }
  }
);

server.tool(
  'douyin_comments',
  '读抖音评论区（别人的视频也能读）：返回每条评论的 cid / 昵称 / 正文 / 时间 / 回复数 / 点赞数；有评论图片的会下载到本机并返回路径，同时把前几张图直接交给模型（支持图像的模型才能看）。',
  {
    awemeId: z.string().optional().describe('作品 id（纯数字）；不传 url 时使用'),
    url: z.string().optional().describe('视频链接 https://www.douyin.com/video/<id>'),
    max: z.number().int().positive().optional().describe('读取条数，默认 20，最多 50'),
    images: z.boolean().optional().describe('false = 不下载评论图片'),
  },
  async ({ awemeId, url, max, images }) => {
    try {
      const result = await runDouyin('douyin_comments', { awemeId, url, max, images });
      const blocks = [];
      const files = [];
      for (const item of result.items ?? []) {
        for (const image of item.images ?? []) {
          if (files.length >= 4) break;
          files.push(image);
        }
      }
      for (const image of files) {
        try {
          const data = fs.readFileSync(image.file).toString('base64');
          blocks.push({ type: 'image', data, mimeType: 'image/jpeg' });
        } catch { /* 单张失败只丢图 */ }
      }
      const payload = { ...result, imageDir: result.imageDir, imagesSent: blocks.length };
      payload.items = result.items.map((item) => ({
        ...item,
        images: (item.images ?? []).map((image) => ({ file: image.file, bytes: image.bytes })),
      }));
      return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }, ...blocks] };
    } catch (error) { return tiebaToolError(error); }
  }
);

server.tool(
  'douyin_notices',
  '读抖音互动通知（@我的 / 评论我的作品 / 点赞 / 关注 / 回复我的评论），只读，不标记已读。',
  { count: z.number().int().positive().optional().describe('每组读取条数，默认 20') },
  async ({ count }) => {
    try { return tiebaToolResult(await runDouyin('douyin_notices', { count })); } catch (error) { return tiebaToolError(error); }
  }
);

server.tool(
  'douyin_debrief',
  '看懂一条抖音视频（不下载、不装模型）：标题/文案 + 时长 + 数据 + 高赞弹幕 + 热评。没有字幕轨道时会注明「不等于逐句听懂」。',
  {
    awemeId: z.string().optional().describe('作品 id（纯数字）；不传 url 时使用'),
    url: z.string().optional().describe('视频链接'),
    danmakuLimit: z.number().int().positive().optional().describe('弹幕条数，默认 15'),
    commentMax: z.number().int().positive().optional().describe('热评条数，默认 8'),
  },
  async ({ awemeId, url, danmakuLimit, commentMax }) => {
    try { return tiebaToolResult(await runDouyin('douyin_debrief', { awemeId, url, danmakuLimit, commentMax })); } catch (error) { return tiebaToolError(error); }
  }
);

server.tool(
  'douyin_chat_status',
  '查看抖音群聊/私信的许可名单、自动回复是否在跑、各会话状态和最近事件。不会打开浏览器。',
  {},
  async () => {
    try { return tiebaToolResult(await runDouyin('douyin_chat_status')); } catch (error) { return tiebaToolError(error); }
  }
);

server.tool(
  'douyin_chat_contacts',
  '列出抖音网页的会话（个人/群聊），用于让主人勾选允许的会话。会打开/使用专用窗口的私信页。',
  {},
  async () => {
    try { return tiebaToolResult(await runDouyin('douyin_chat_contacts')); } catch (error) { return tiebaToolError(error); }
  }
);

server.tool(
  'douyin_chat_configure',
  '保存许可会话名单和群聊响应昵称（只有在名单里、且群里被@或叫到昵称时才自动回复）。',
  {
    recipientIds: z.array(z.string()).describe('从 douyin_chat_contacts 拿到的会话 id'),
    mentionNames: z.array(z.string()).optional().describe('群聊里叫到这些昵称才回，默认「大肥鱼」'),
  },
  async ({ recipientIds, mentionNames }) => {
    try { return tiebaToolResult(await runDouyin('douyin_chat_configure', { recipientIds, mentionNames })); } catch (error) { return tiebaToolError(error); }
  }
);

server.tool(
  'douyin_chat_start',
  '按已保存的许可名单启动自动回复：个人会话回新消息；群聊只在被@或叫到昵称时回。需要主人先打开开关。',
  {},
  async () => {
    try { return tiebaToolResult(await runDouyin('douyin_chat_start')); } catch (error) { return tiebaToolError(error); }
  }
);

server.tool(
  'douyin_chat_stop',
  '停止抖音群聊/私信自动回复（保留许可名单）。',
  {},
  async () => {
    try { return tiebaToolResult(await runDouyin('douyin_chat_stop')); } catch (error) { return tiebaToolError(error); }
  }
);

server.tool(
  'douyin_chat_read',
  '只读一个许可会话（个人或群聊）的最近消息。recipientId 来自 douyin_chat_contacts。',
  { recipientId: z.string().describe('会话 id') },
  async ({ recipientId }) => {
    try { return tiebaToolResult(await runDouyin('douyin_chat_read', { recipientId })); } catch (error) { return tiebaToolError(error); }
  }
);

server.tool(
  'douyin_chat_models',
  '列出抖音群聊/私信可用的 DSH 模型（提供商 + 模型），以及当前聊天用的是哪个（空 = 跟随 DSH 默认模型）。',
  {},
  async () => {
    try { return tiebaToolResult(await runDouyin('douyin_chat_models')); } catch (error) { return tiebaToolError(error); }
  }
);

server.tool(
  'douyin_chat_set_model',
  '设置抖音群聊/私信回复用的模型；provider 和 model 都传空字符串 = 跟随 DSH 默认模型。',
  {
    provider: z.string().describe('提供商 id；空字符串表示跟随 DSH 默认'),
    model: z.string().describe('模型 id；空字符串表示跟随 DSH 默认'),
  },
  async ({ provider, model }) => {
    try { return tiebaToolResult(await runDouyin('douyin_chat_set_model', { provider, model })); } catch (error) { return tiebaToolError(error); }
  }
);

await server.connect(new StdioServerTransport());
