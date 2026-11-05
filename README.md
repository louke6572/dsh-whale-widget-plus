# dsh-Dfy

> DSH（DeepSeek Harness）的桌宠与挂件套件 · `v0.7.3`

小鲸鱼余额挂件 + 106 段透明动画桌宠 + QQ 消息卡；QQ / B站 / 双向脱敏记忆由包内自带的 SurfCore 提供。

![dsh-Dfy 小鲸鱼挂件](widget/assets/DSH2.png)

**只有一个插件 `dsh-dfy`**，不再单独安装 `surfcore`、`surfcore-next`、`whale-widget`。

---

## 能做什么

- **余额与用量**：60 秒刷新；今日已用按余额差 + 会话事件记账；每轮真实 usage 换算金额；近 7 天与按日明细。
- **峰谷**：状态与倒计时常驻角色左下角，节假日按谷价。
- **小鲸鱼**：5 套表情（133 张）、情绪/眨眼/卖萌、泡泡编辑器、音效。
- **桌宠**：106 段动画、13 个动作分类；Q 弹、弹簧拖拽、甩抛、屏幕漫游、分身、双击弹弓。
- **双形态共存**：小鲸鱼与桌宠同时显示，各自独立位置与大小。
- **QQ**：信封角标、消息/记录/写消息三视图、心情切换；桥接走 SnowLuma。
- **B站**：扫码登录、动态/评论互动、鱼群保护、昼夜作息。
- **记忆**：人格卡、双向脱敏记忆、身份对齐，数据只存本机。

---

## 准备

| 项 | 要求 |
|---|---|
| 系统 | Windows 10/11 |
| Node.js | ≥ 22.13 |
| DSH | ≥ 0.2.1-rc.2（桌面端或 `dsh web`） |
| SnowLuma | 只有接 QQ 需要，**Agent 会自动下载安装**（官方 Releases） |
| 余额 | `DEEPSEEK_API_KEY` 或 DSH「账号与余额」登录，其一即可 |

不接 QQ / B站也能用：小鲸鱼与桌宠不需要 SnowLuma。

---

## 安装

### 方式一：交给 Agent（推荐）

把这句话发给任意能执行命令的 Agent：

```text
帮我安装 https://github.com/louke6572/dsh-dfy ，严格按仓库里的 AGENT.md 执行；
装完告诉我结果，需要我做的事直接说。
```

- **Agent 负责**：克隆仓库、装依赖、写 DSH profile、下载安装 SnowLuma、写配置、启动桥接、验证接口。
- **你负责两件事**：**手动重启 DSH**、**扫码登录 QQ**。

> 重启必须你自己做：Agent 多半就跑在 DSH 里，它自己去重启会把当前任务中断。
> 扫码也必须你本人做，Agent 不能代替。

> ⚠️ 不要用 `dsh plugin add github:louke6572/dsh-dfy` 安装：插件运行需要仓库根的
> `config.json`、`state/`、`src/bridge.js`，装进 `node_modules` 后这些路径不成立，QQ 会起不来。

### 方式二：手动

```powershell
git clone --depth 1 https://github.com/louke6572/dsh-dfy.git
cd dsh-dfy
npm install
node scripts/setup-dsh.mjs        # 自动识别 profile；也可指定：desktop / web
node scripts/install-snowluma.mjs # 接 QQ 才需要：检测或下载官方 Releases
```

然后：

1. **完全退出 DSH**（含托盘），再打开。
2. 设置 → dsh-Dfy → **一键开始**（会拉起 SnowLuma、写入账号/token、启动桥接与 B站）。
3. 在 SnowLuma 窗口**扫码登录 QQ**，20 秒后回设置页点「重新检测」。

**验证**：

```powershell
curl -s -o NUL -w "%{http_code}" http://127.0.0.1:3080/dsh-whale/widget.js
```

返回 `200` 或 `401` 都正常（路由要求会话凭据）。挂件侧共 **37 个 `/dsh-whale/*` 路由**。
浏览器 `Ctrl+F5` 后右下角出现小鲸鱼即成功。

**更新**：`git pull` → `npm install` → `node scripts/setup-dsh.mjs` → 重启 DSH。
**卸载**：`dsh plugin --profile <profile> remove dsh-dfy`。

---

## 第一次使用

1. **余额**：配 `DEEPSEEK_API_KEY`，或在 DSH「设置 → 账号与余额」登录；鲸鱼旁出现数字即成功。
2. **QQ**：一键开始 + 扫码后，桥接显示「运行中」，桌宠旁出现信封角标；发一条消息试试「写消息」。
3. **B站（可选）**：控制台 → B站 → 扫码，设互动频率与鱼群保护；不接则不会请求 B站接口。
4. **记忆（可选）**：控制台 → 记忆卡，导入或新建人格卡；默认模板在 `roles/`、`examples/`。

---

## 日常操作

- **打开菜单**：点小鲸鱼；按钮隐藏时电脑端右键角色、手机端长按 1.5 秒。
- **余额**：点鲸鱼立即刷新；气泡里看今日已用、每轮消耗、近 7 天、按日明细。
- **切形态**：控制台顶部 `小鲸鱼` / `桌宠` / `共存`。
- **QQ 卡**：信封角标 → 最新消息 / 记录 / 写消息（Enter 发送，Shift+Enter 换行）。
- **心情与音效**：卡片头像旁循环切换；音量在控制台「音效与提示」按四路调。
- **保存**：控制台改动点「保存配置」才生效，「恢复默认」可回退。

---

## 设置页

| 区块 | 内容 |
|---|---|
| 状态 / 诊断 | 桥接与账号、SnowLuma 检测、一键开始、自检 |
| 呈现与位置 | 大小、吸附翻转、屏幕漫游、避让滚动条、提示气泡、峰谷显示 |
| 动作与待机（桌宠） | 13 类动作、分身数量/动作/大小 |
| 表情与台词（小鲸鱼） | 表情包、情绪映射、眨眼、台词 |
| 提示与音效 | 主音量、四路音效、消耗提示与自动关闭 |
| 角色与资源 | 导入角色、按压泡泡、图片/音频管理 |
| 厂商额度（选装） | 模型、凭据、火山 coding plan |
| 碎碎念与对话（桌宠） | 人设、自动碎碎念、对话与清空记忆 |
| QQ / B站 | 桥接、群管理、B站账号与养鱼、记忆卡 |

---

## 数据

| 位置 | 用途 |
|---|---|
| `$DSH_HOME/surfcore/config.json` | QQ / B站 / 桥接配置（含凭据） |
| `$DSH_HOME/surfcore/memory/` | 记忆卡与注入块（已脱敏） |
| `$DSH_HOME/.dshw-usage.json` | 记账账本与用量 |
| `$DSH_HOME/.dshw-bubble.json` | 泡泡序列与模块库 |
| 仓库根 `config.json` / `state/` / `pet/` | 配置骨架与本地状态（已 gitignore） |

---

## 安全

- 所有接口只允许回环来源，跨站拒绝，写请求必须来自本机。
- 凭据只发往内置端点；自定义地址需在本机面板逐个放行。
- 不下发通配 CORS，响应带 `nosniff`；仓库不含真实账号数据。

---

## 常见问题

- **挂件不出现**：确认不是用 `github:` 规格装的；按手动流程走完，再完全退出 DSH 重开。
- **`Cannot find module '@deepseek-ai/schemastery'`**：没跑 `npm install`。
- **`icon exceeds 256 KiB`**：旧版图标，本仓库已压到 205 KB，更新或重启即可。
- **余额提示未配置**：配 `DEEPSEEK_API_KEY` 或登录 DSH 账号。
- **今日已用显示 `--`**：需要一次成功的余额观测，统计从那一刻开始。
- **保存报 403**：只允许本机用 `127.0.0.1` 操作。
- **找不到 SnowLuma**：跑 `node scripts/install-snowluma.mjs`；仍不行就在设置页手动指定目录。
- **信封不出现**：桥接未运行或 SnowLuma 未登录，扫码后点「重新检测」。
- **卡片没声音**：查卡片 🔊/🔇、全局音量、系统静音。
- **两个「Agent 预设定义」**：QQ 聊天与二代仿真两条预设，正常。
- **改了前端不生效**：`widget/assets/*` 热读取，硬刷新；改 `lib/`、`backend/`、`src/` 需重启 DSH。

---

## 开发

```powershell
node build.mjs                              # lib/ui/*.js → lib/client.js
node scripts/build-agent-preset-patches.mjs # dsh/agent-presets/* → presets/*.patch.yml
node widget/tools/ci-audit.mjs --no-pack    # 路由安全 / 接口对等 / 注入面 / CI
```

```text
lib/ 宿主与设置界面 · backend/ SurfCore · widget/ 小鲸鱼与桌宠
src/ 桥接与 MCP · presets/ Agent 预设 · shims/ qq-mode 垫片
```

---

## 致谢

- **[月匠 MeteorNOX](https://github.com/MeteorNOX)**：官方挂件
  [`DeepSeek-Balance-Whale-Widget`](https://github.com/MeteorNOX/DeepSeek-Balance-Whale-Widget)，余额/记账/峰谷/泡泡/音效与安全边界源自该项目。
- **[PC2005-cloud](https://github.com/PC2005-cloud)**：`dsh-pet`（MIT），106 段动画、动作链与桌宠物理交互源自该项目。
- **SurfCore**（[Mieksido/surfcore](https://github.com/Mieksido/surfcore)）：QQ / B站桥接、双向脱敏记忆、身份对齐与统一设置窗口。
- **SnowLuma**：第三方 QQ 运行时，负责 QQ 登录与收发消息；专有软件，不随本仓库分发，只从官方 Releases 获取。
- **DSH**：插件宿主，提供 bundle / patch / client / MCP。
- 社区贡献：Yang-huai406（Codex 迁移）、1llysviel（macOS）、0Sakura721、yybai25、Jy-EggRoll、
  VaeKaras、MengLs1620、ELFsay、ztzpro、under-the-ocean、21253soursweetlemon、fangbm、xiaolinnnnnnn。

---

## 许可证

代码基于 **MIT License**，见 [LICENSE](LICENSE)。`widget/assets/` 与 `assets/` 下的美术素材不在 MIT 覆盖范围内，
按「原样」分发，来源与权利主张见 [PROVENANCE.md](PROVENANCE.md)。
