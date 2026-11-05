# dsh-Dfy

> DSH（DeepSeek Harness）的桌宠与挂件套件 · `v0.7.3`

一个插件装齐：**余额小鲸鱼挂件**、**106 段透明动画桌宠**、**QQ 消息卡**；
QQ / B站 / 双向脱敏记忆等联网能力由包内自带的 **SurfCore** 后端提供。

![dsh-Dfy 小鲸鱼挂件](widget/assets/DSH2.png)

**本仓库只有一个插件 `dsh-dfy`。** 不再有 `surfcore`、`surfcore-next`、`whale-widget` 的单独安装：
它们都已合并进这一个包，设置页里也只有一个「dsh-Dfy」。

---

## 目录

- [能做什么](#能做什么)
- [前置条件](#前置条件)
- [安装](#安装)
- [第一次配置](#第一次配置)
- [日常使用](#日常使用)
- [设置页导览](#设置页导览)
- [数据放在哪](#数据放在哪)
- [安全边界](#安全边界)
- [常见问题](#常见问题)
- [开发](#开发)
- [致谢](#致谢)
- [许可证](#许可证)

---

## 能做什么

| 能力 | 说明 |
|---|---|
| 余额与用量 | 60 秒自动刷新；今日已用按「余额差 + 会话事件」记账；逐轮真实 usage 换算金额；近 7 天 / 模型占比 / 按日明细 |
| 峰谷徽标 | 峰/谷状态与倒计时常驻在角色左下角；峰谷样式可选；节假日与调休按谷价 |
| 小鲸鱼角色 | 5 套表情素材包（共 133 张）、情绪/眨眼/卖萌、泡泡编辑器（点击序列、模块化排版、图库） |
| 桌宠形态 | 106 段 VP9-alpha 透明动画、13 个动作分类；点击 Q 弹、弹簧拖拽、甩抛反弹、屏幕漫游、分身与碰撞、双击弹弓 |
| 双形态共存 | 小鲸鱼与桌宠同时显示，各自独立位置与大小 |
| QQ 消息卡 | 信封角标与未读数；「消息 / 记录 / 写消息」三视图；心情切换；卡片音效开关 |
| QQ 桥接 | 通过第三方运行时 SnowLuma 收发 QQ 消息；群聊人格、引用回复、表情包、语音（可选） |
| B站养鱼 | 账号扫码、动态/评论互动、鱼群保护、作息与生物钟 |
| 记忆与人格 | 双向脱敏记忆卡、身份对齐、人格分层；数据只存本机 |
| 其它 | 34 套额度/用量模板、自定义 API 模型、火山 coding plan 额度、Codex 本地统计 |

不接 QQ / B站也可以正常使用：小鲸鱼与桌宠不需要 SnowLuma，也不会请求任何外部接口。

---

## 前置条件

| 项 | 要求 | 备注 |
|---|---|---|
| 系统 | Windows 10/11 | 沙箱 ACL、桥接与启动脚本都与 Windows 绑定 |
| Node.js | ≥ 22.13 | `node -v` 自查 |
| DSH | ≥ 0.2.1-rc.2 | 更旧的版本缺少部分接口 |
| SnowLuma | 仅 QQ 需要 | **第三方专有运行时**，自行安装并扫码登录；本仓库不分发、不代装 |

---

## 安装

### 1. 拿到代码并装依赖

```powershell
git clone --depth 1 https://github.com/louke6572/dsh-dfy.git
cd dsh-dfy
npm install
```

> `npm install` 不能省。插件是**整目录链接**进 DSH 的，模块从仓库真实路径解析，
> 仓库根没有 `node_modules` 时启动会报 `Cannot find module`。

### 2. 写进 DSH profile

```powershell
node scripts/setup-dsh.mjs            # 自动识别当前在用的 profile
node scripts/setup-dsh.mjs desktop    # 也可以显式指定（Web 端用 web）
```

这一步会做四件事，全部幂等，可以反复跑：

1. `~/.dsh/plugins/dsh-dfy` → 本仓库（junction）
2. `<profile>/node_modules/dsh-dfy` → 上一层的链接（保证 `dsh-dfy/...` 能被解析）
3. profile 的 `package.json` 只登记 **dsh-dfy 一个 bundle**
4. 写入 3 个 MCP server 与 2 条 Agent 预设（QQ 聊天 / 二代仿真）

### 3. 重启并一键安装

完全退出 DSH（含托盘）后重新打开 → **设置 → dsh-Dfy → 诊断 → 一键安装**。
它会自动发现 SnowLuma、写白名单、起桥接、检测账号；按钮点一次即可，不需要手工改配置。

### 4. 验证

```powershell
# 端口以 dsh web 启动时打印的 URL 为准
curl http://127.0.0.1:3080/dsh-whale/balance.json
curl http://127.0.0.1:3080/dsh-whale/widget.js
```

浏览器 `Ctrl+F5` 后右下角出现小鲸鱼即成功。
挂件侧共 **37 个 `/dsh-whale/*` 路由**；不带会话凭据的裸 `curl` 返回 `401` 是预期行为，不是坏了。

### 只当挂件用（不接 QQ / B站）

做完第 1、2 步即可：不点「一键安装」、不装 SnowLuma，小鲸鱼与桌宠照常工作，
余额来自 `DEEPSEEK_API_KEY` 或 DSH 账号登录态。

### 更新

```powershell
git pull
npm install
node scripts/setup-dsh.mjs
```

然后完全退出并重开 DSH。数据（记账、泡泡、自定义素材）都在 `$DSH_HOME` 下，更新不会丢。

### 卸载

```powershell
dsh plugin --profile <你的 profile> remove dsh-dfy
```

---

## 第一次配置

| 项 | 怎么配 |
|---|---|
| 余额取数 | 优先用凭据服务里的 `DEEPSEEK_API_KEY`；没有则用 DSH「设置 → 账号与余额」的登录态 |
| QQ | 装好 SnowLuma 并扫码登录 → 设置里点「诊断 → 一键安装」；地址与 token 也可手填进 `config.json` |
| B站 | 控制台 → B站 → 扫码登录鱼账号 |
| 配置文件 | 从 `config.example.json` 复制一份 `config.json`（**含凭据，不要提交**） |
| 其它厂商 | 控制台「厂商额度」里按模板添加，填各自的 API key；只做 DeepSeek 可以不配 |

---

## 日常使用

1. **打开菜单**：点一下小鲸鱼 → 主菜单（余额、记账、峰谷、表情、音效、控制台）。
   菜单按钮被隐藏时：电脑端右键角色，手机端长按约 1.5 秒。
2. **看余额**：鲸鱼旁的数字 60 秒刷新一次，点鲸鱼立即刷新；气泡里有今日已用、每轮消耗、近 7 天与按日明细。
3. **切形态**：控制台顶部 `小鲸鱼` / `桌宠` / `共存` 三段页签。桌宠支持拖动、甩抛、分身、双击弹弓。
4. **QQ 消息卡**：桌宠旁的信封角标，有未读时带红点数字。点开后可看最新消息、切「记录」、「写消息」
   （Enter 发送、Shift+Enter 换行）；卡片底部 🔊/🔇 只影响卡片。
5. **心情与音效**：卡片头像旁的心情按钮循环「打盹 / 兴奋 / 待机」；
   音效在控制台「音效与提示」里按 按压 / 消耗 / 提问 / 授权 四路分别调音量与开关。
6. **改配置**：控制台所有改动点「保存配置」才生效；「恢复默认」可一键回退。

---

## 设置页导览

设置 → dsh-Dfy 只有一页，按使用频率从上到下：

| 区块 | 内容 |
|---|---|
| 状态 / 诊断 | 桥接与账号状态、SnowLuma 检测、一键安装、自检结果 |
| 呈现与位置 | 大小、吸附与翻转、屏幕漫游、避让滚动条、提示气泡、峰谷显示 |
| 动作与待机（仅桌宠） | 13 个分类的动作级联、分身数量/动作/大小 |
| 表情与台词（仅小鲸鱼） | 表情包版本、情绪映射、眨眼、台词 |
| 提示与音效 | 主音量、四路音效、消耗提示文案与自动关闭时间 |
| 角色与资源 | 导入角色、按压泡泡、图片/音频资源管理 |
| 厂商额度（选装） | 模型下拉、凭据、火山 coding plan 额度 |
| 碎碎念与对话（仅桌宠） | 人设、自动碎碎念间隔、对话与清空记忆 |
| QQ / B站 | 桥接配置、群管理、B站账号与养鱼参数、记忆卡 |

---

## 数据放在哪

运行时数据默认在 `$DSH_HOME`（通常是 `~/.dsh`）：

| 位置 | 用途 |
|---|---|
| `$DSH_HOME/surfcore/config.json` | 统一配置（QQ / B站 / 桥接，含凭据） |
| `$DSH_HOME/surfcore/memory/` | 记忆卡、注入块（双向脱敏后） |
| `$DSH_HOME/whale-roles/` 等 | 自定义角色、音频、泡泡图、表情包 |
| `$DSH_HOME/.dshw-usage.json` | 记账账本与用量 |
| `$DSH_HOME/.dshw-bubble.json` | 泡泡点击序列与模块库（手写即全量替换） |
| 仓库根 `pet/`、`state/` | 桌宠运行态与本地状态（已在 `.gitignore` 内） |

---

## 安全边界

- 所有 `/dsh-whale/*` 与 `/dsh-surfcore/*` 路由走统一入口校验：只允许回环来源，
  跨站请求一律拒绝，写请求必须来自本机。
- 凭据只发往内置模板写死的端点；自定义地址默认拿不到凭据，需要在本机面板逐个勾选放行。
- 不下发通配 CORS；所有响应带 `X-Content-Type-Options: nosniff`。
- 仓库本身不含任何真实账号数据：角色卡与记忆卡都是脱敏示例。

---

## 常见问题

**装不上 / 挂件不出现**
规格必须指向完整仓库；装完跑一次 `node scripts/setup-dsh.mjs`，再完全退出 DSH 重开。
`dsh --profile <name> --dump-config | Select-String dsh-dfy` 能看到两行 `dsh-dfy` / `qq-mode` 才算挂载成功。

**插件页报「icon exceeds 256 KiB」**
旧版图标超限会导致头像回退成默认图。本仓库 `icon.png` 已压到 205 KB（320×320），重装或重启后红字消失。

**余额提示「未配置 DEEPSEEK_API_KEY」**
配 API key，或在「设置 → 账号与余额」登录 DeepSeek 账号，二者其一即可。

**「今日已用」显示 `--`**
需要先有一次成功的余额观测，统计从那一刻开始；更早的消费不会追溯。

**保存设置报 403**
写操作只允许在运行 DSH 的本机、用 `127.0.0.1` 打开时进行；远端管理需显式声明 `DSHW_ADMIN_HOSTS`。

**桌宠提示素材缺失**
`assets/pet-video/` 的 106 段 `.webm` 没跟上。确认安装的是最新版（不要锁旧 commit），
再 `curl http://127.0.0.1:<端口>/dsh-whale/pet-animations.json` 看 `reason` 与 `dir`。

**QQ 信封一直不出现**
消息卡依赖 QQ 桥接：先确认设置页桥接是「运行中」且 SnowLuma 已登录；桥接没起时信封不会出现。

**卡片没有声音**
按顺序查三处：卡片底部是否被点成 🔇、控制台全局音量与总开关、系统或标签页是否静音。

**发送后没收到回复**
看底部是否出现「✓ 已发送」；桥接断开时会提示「dsh-Dfy/桥接不可达」，重连后再试。

**设置页出现两个「Agent 预设定义」**
这是 QQ 聊天（`qq-chat`）与二代仿真（`qq-chat-v2`）两条独立预设，属正常设计，不是重复安装。

**菜单按钮不见了**
电脑端右键角色，手机端长按约 1.5 秒；也可在控制台把「隐藏菜单」关掉。

**改了前端不生效**
`widget/assets/whale-widget.js`、`widget/assets/console.html` 按修改时间热读取，硬刷新即可；
改 `lib/`、`backend/`、`src/` 必须重启 DSH。

---

## 开发

```powershell
node build.mjs                              # 由 lib/ui/*.js 生成 lib/client.js
node scripts/build-agent-preset-patches.mjs # 由 dsh/agent-presets/* 生成 presets/*.patch.yml
node widget/tools/ci-audit.mjs --no-pack    # 路由安全 / 接口对等 / 注入面 / CI 一致性
```

目录结构：

```text
dsh-dfy/
├── package.json          # 唯一的插件清单（name=dsh-dfy）
├── cordis.patch.yml      # dsh-dfy 与 qq-mode 两行挂载声明
├── lib/                  # 宿主入口（组合 widget + backend）与设置界面
├── backend/              # SurfCore：QQ/B站/记忆/对齐/额度
├── widget/               # 小鲸鱼与桌宠：前端、素材、动作链
├── src/                  # 桥接进程、MCP server、人格与记忆内核
├── presets/              # 两条 Agent 预设（由 dsh/agent-presets 生成）
├── shims/qq-mode/        # qq-mode 转发垫片（避免加载旧设置界面）
├── locale/               # 中英文元信息
├── scripts/              # 安装、构建、测试
├── docs/                 # 文档与排错
├── assets/ public/ roles/ examples/
└── .github/workflows/    # CI 与发布门禁
```

---

## 致谢

### 上游项目

- **[月匠 MeteorNOX](https://github.com/MeteorNOX)**：官方挂件
  [`DeepSeek-Balance-Whale-Widget`](https://github.com/MeteorNOX/DeepSeek-Balance-Whale-Widget)。
  余额、记账、峰谷定价、泡泡编辑器、音效与安全边界等基础能力来自该项目。
- **[PC2005-cloud](https://github.com/PC2005-cloud)**：[`dsh-pet`](https://github.com/PC2005-cloud/dsh-pet)（MIT）。
  106 段透明动画、动作链与桌宠物理交互来自该项目。
- **SurfCore**（[Mieksido/surfcore](https://github.com/Mieksido/surfcore)）：
  QQ / B站桥接、双向脱敏记忆、身份对齐、人格分层与统一设置窗口。
- **SnowLuma**：第三方 QQ 运行时，负责 QQ 登录与收发消息。**专有软件，不随本仓库分发**，
  按它的 EULA 需自行下载安装并扫码；本项目只做「检测已安装 + 一键打开 + 连接状态」。
- **DSH（DeepSeek Harness）**：插件宿主，提供 bundle / patch / client / MCP 机制。

### 本仓库

- **[louke6572](https://github.com/louke6572)**：合并版维护者（峰谷常驻徽标、桌宠集成、双形态共存、控制台重构、资源包与 CI）。

### 社区贡献

- Codex 端口迁移：[Yang-huai406](https://github.com/Yang-huai406)；macOS 适配：[@1llysviel](https://github.com/1llysviel)
- 安全与记账：星丶白羽莲（凭据外带风险）、[@0Sakura721](https://github.com/0Sakura721)（换 key 分本）、
  [@yybai25](https://github.com/yybai25)（账号态余额规格）、[Yang-huai406](https://github.com/Yang-huai406)（充值记账修复）
- 功能与适配：[@Jy-EggRoll](https://github.com/Jy-EggRoll)、[@VaeKaras](https://github.com/VaeKaras)、
  [@MengLs1620](https://github.com/MengLs1620)、[@ELFsay](https://github.com/ELFsay)
- 历史合并 PR：[@ztzpro](https://github.com/ztzpro)、[@under-the-ocean](https://github.com/under-the-ocean)、
  [@21253soursweetlemon](https://github.com/21253soursweetlemon)、[@fangbm](https://github.com/fangbm)、
  [@xiaolinnnnnnn](https://github.com/xiaolinnnnnnn)

---

## 许可证

代码基于 **MIT License**，见 [LICENSE](LICENSE)。

`assets/`、`widget/assets/` 下的美术素材、动图与音效不在 MIT 覆盖范围内，按「原样」随插件分发；
逐项来源、元数据清理与权利主张方式见 [PROVENANCE.md](PROVENANCE.md)。
