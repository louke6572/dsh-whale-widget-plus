# dsh-Dfy

> DSH（DeepSeek Harness）的桌宠与挂件套件 · `v0.7.3`

一个插件装齐：**余额小鲸鱼挂件**、**106 段透明动画桌宠**、**QQ 消息卡**；
QQ / B站 / 双向脱敏记忆由包内自带的 **SurfCore** 后端提供。

![dsh-Dfy 小鲸鱼挂件](widget/assets/DSH2.png)

**本仓库只有一个插件 `dsh-dfy`。** 不再有 `surfcore`、`surfcore-next`、`whale-widget` 的单独安装。

---

## 目录

- [装之前先看](#装之前先看)
- [方式 A：交给 Agent（推荐）](#方式-a交给-agent推荐)
- [方式 B：自己动手](#方式-b自己动手)
- [第一次运行：配置流程](#第一次运行配置流程)
- [日常使用](#日常使用)
- [设置页导览](#设置页导览)
- [数据放在哪](#数据放在哪)
- [安全边界](#安全边界)
- [常见问题](#常见问题)
- [开发](#开发)
- [致谢](#致谢)
- [许可证](#许可证)

---

## 装之前先看

| 你需要准备 | 说明 |
|---|---|
| Windows 10/11 | 沙箱 ACL、桥接、启动脚本都与 Windows 绑定 |
| Node.js ≥ 22.13 | `node -v` 自查 |
| DSH ≥ 0.2.1-rc.2 | 桌面客户端或 `dsh web` 均可 |
| SnowLuma | **只有接 QQ 才需要**：第三方 QQ 运行时。**Agent 会从官方 Releases 自动下载安装**（`scripts/install-snowluma.mjs`），你只负责扫码 |
| DeepSeek 凭据 | 有 `DEEPSEEK_API_KEY`，或在 DSH「设置 → 账号与余额」登录，二者其一即可显示余额 |

**不接 QQ / B站也能用**：不装 SnowLuma，小鲸鱼与桌宠照常工作，也不会请求任何外部接口。

> ⚠️ **不要用 `dsh plugin add github:louke6572/dsh-dfy` 安装。**
> 本插件运行时需要仓库根下的 `config.json`、`state/`、`pet/`、`src/bridge.js`；
> 用插件管理器装进 `node_modules` 后这些路径不成立，QQ 部分会起不来。
> 正确方式只有下面两种：**让 Agent 按 AGENT.md 装**，或**自己克隆仓库再跑 setup 脚本**。

---

## 方式 A：交给 Agent（推荐）

把下面这一整段复制给任意能执行命令的 Agent（DSH 内置 agent、Claude Code、Codex 等）：

```text
帮我安装 dsh-Dfy（QQ × B站 × 桌宠一体化插件）：
1. 仓库 https://github.com/louke6572/dsh-dfy
2. 严格按仓库根目录的 AGENT.md 执行，不要跳步
3. 装完后告诉我：安装目录、版本、profile、SnowLuma 状态、QQ 是否已登录，以及我还需要做什么
只有扫码登录 QQ 需要我亲手操作（以及重启 DSH 时点一下退出/重开），其余由你完成，包括下载安装 SnowLuma。
```

Agent 会照着 [AGENT.md](AGENT.md) 依次完成：克隆仓库 → `npm install` → 写 DSH profile → 清理旧链接 → 生成 Agent 预设与 MCP → **下载并安装 SnowLuma（官方 Releases，解压到 `%USERPROFILE%\SnowLuma2`）** → 写 `config.json` 并启动它 → 等你重启 → 验证插件与桥接 → 汇报结果。

**分工表**

| 谁 | 做什么 |
|---|---|
| Agent | 下载代码、装依赖、改 profile、写 MCP/预设、**下载安装 SnowLuma**、写配置并启动、启动桥接、验证接口、排错 |
| 你（仅 2 步） | ① 完全退出并重开 DSH ② 在 SnowLuma 窗口扫码登录 QQ |

> 余额如果用 DeepSeek「账号登录态」，需要你在 DSH 设置页点一次登录；用 `DEEPSEEK_API_KEY` 则 Agent 可代填。
> B站扫码是可选项，不接 B站不影响挂件与桌宠。

---

## 方式 B：自己动手

### 第 1 步：拿到代码并装依赖

```powershell
git clone --depth 1 https://github.com/louke6572/dsh-dfy.git
cd dsh-dfy
npm install
```

**预期**：生成 `node_modules/`，无红色报错。

**失败**：没有 npm 时用 DSH 自带的 pnpm：

```powershell
node "$env:USERPROFILE\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\pnpm\bin\pnpm.cjs" install
```

> `npm install` 不能省：插件是以**整目录链接**进 DSH 的，模块从仓库真实路径解析。

### 第 2 步：写进 DSH profile

```powershell
node scripts/setup-dsh.mjs            # 自动识别在用的 profile
node scripts/setup-dsh.mjs desktop    # 也可以显式指定（桌面端 desktop / Web 端 web）
```

脚本幂等，可重复跑。它做这几件事：

1. `~/.dsh/plugins/dsh-dfy` → 本仓库
2. `<profile>/node_modules/dsh-dfy` → 上一层链接
3. profile 只登记 `dsh-dfy` 一个 bundle，清掉旧的 `surfcore` 链接
4. 写入 3 个 MCP server 与 2 条 Agent 预设（QQ 聊天 / 二代仿真）
5. 仓库根没有 `config.json` 时，从 `config.example.json` 复制一份

**预期输出**：

```text
[setup-dsh] bundle dsh-dfy link 已创建: C:\Users\<你>\.dsh\plugins\dsh-dfy
[setup-dsh] package.json bundle added: dsh-dfy
[setup-dsh] 已生成 config.json（占位配置…）
[setup-dsh] Done. 下一步：完全退出 DSH（含托盘）再打开 → 设置 → dsh-Dfy → 一键开始。
```

桌面端 profile 由 Electron 独占时，会输出「由桌面端独占：已跳过 CLI 安装」——正常。

### 第 3 步：安装 SnowLuma（接 QQ 才需要）

```powershell
node scripts/install-snowluma.mjs
```

自动完成：检测已有安装 → 没有就从**官方 Releases** 下载最新 Windows 包 → 解压到 `%USERPROFILE%\SnowLuma2`
→ 校验启动文件 → 把 `launcherPath` / `allowLaunch` 写入 `config.json` → 启动 SnowLuma。

**预期输出**：`已检测到 SnowLuma：<目录>` 或 `安装完成：<目录>`，退出码 0。
不装在默认目录用 `--dir D:\SnowLuma2`；只装不启动用 `--no-launch`。

### 第 4 步：重启 DSH 并「一键开始」

1. **完全退出 DSH**（托盘图标也要退出），再打开。
2. 打开 **设置 → dsh-Dfy**。
3. 点 **一键开始**（如果桥接已自动启动，这一步会显示已在运行）。

一键开始会自动：识别 SnowLuma → 后台拉起 → 开启 QQ 自动注入 → 等 OneBot → 写入账号与 token → 启动 QQ 桥接 → 启动 B站。

### 第 5 步：扫码登录 QQ

- SnowLuma **没登录过**：它已经在运行，直接在窗口里扫码登录 QQ；登录后等约 20 秒，回设置页点「重新检测」。
- SnowLuma **登录过**：跳过这步。

### 第 6 步：验证

```powershell
# 端口以 dsh web 启动时打印的 URL 为准，桌面端默认 3080
curl -s -o NUL -w "%{http_code}" http://127.0.0.1:3080/dsh-whale/widget.js
```

- `200` 或 `401` 都算正常（路由要求会话凭据）
- 浏览器 `Ctrl+F5` 后右下角出现小鲸鱼
- 挂件侧共 **37 个 `/dsh-whale/*` 路由**

### 更新

```powershell
git pull
npm install
node scripts/setup-dsh.mjs
```

然后完全退出并重开 DSH。记账、泡泡、自定义素材都在 `$DSH_HOME` 下，更新不会丢。

### 卸载

```powershell
dsh plugin --profile <你的 profile> remove dsh-dfy
```

---

## 第一次运行：配置流程

按顺序走，每步都有「怎么做」和「怎么确认成功」。

### 1. 余额（挂件能不能显示数字）

| 方式 | 怎么做 | 确认 |
|---|---|---|
| API key（推荐） | 在 DSH 凭据服务里配 `DEEPSEEK_API_KEY`，或让 Agent 代填 | 鲸鱼旁出现余额数字，60 秒自动刷新 |
| 账号登录态 | 设置 → 账号与余额 → 登录 DeepSeek | 同上；插件不接触账号令牌 |

两种方式都没有时，气泡会提示「未配置 DEEPSEEK_API_KEY」，挂件仍会显示，只是没有余额。

### 2. QQ（信封角标与消息卡）

1. 装 SnowLuma：`node scripts/install-snowluma.mjs`（自动下载官方 Releases 并启动；路径不带中文/空格）。
2. 设置 → dsh-Dfy → 一键开始（识别不到安装位置就点「安装与维护 → 手动选择」指定目录）。
3. 在 SnowLuma 窗口扫码登录 QQ，并确认电脑上的 QQ 客户端已登录（SnowLuma 靠注入 QQ 进程工作）。
4. 设置页显示桥接「运行中」，桌宠旁出现信封角标。

**确认**：给自己发一条消息，信封出现红点；点开→「写消息」→ Enter 发送，能收到即成功。

### 3. B站（可选）

控制台 → B站 → 扫码登录鱼账号 → 设定互动频率与鱼群保护。
不接 B站时，插件不会请求任何 B站接口。

### 4. 记忆与人格（可选）

设置 → dsh-Dfy → 记忆卡：导入或新建人格卡，聊天记录会按脱敏规则写入本机记忆。
默认角色卡在仓库 `roles/`，示例记忆在 `examples/`，都是脱敏模板。

### 5. 最后确认

- [ ] 右下角有小鲸鱼，余额有数字
- [ ] 设置页 dsh-Dfy 没有红色错误
- [ ] 需要 QQ 时：桥接「运行中」+ 信封出现
- [ ] 桌宠能拖动、点击有 Q 弹

---

## 日常使用

1. **打开菜单**：点一下小鲸鱼 → 主菜单（余额、记账、峰谷、表情、音效、控制台）。
   菜单按钮被隐藏时：电脑端右键角色，手机端长按约 1.5 秒。
2. **看余额**：鲸鱼旁数字 60 秒刷新一次，点鲸鱼立即刷新；气泡里有今日已用、每轮消耗、近 7 天与按日明细。
3. **切形态**：控制台顶部 `小鲸鱼` / `桌宠` / `共存` 三段页签；桌宠支持拖动、甩抛、分身、双击弹弓。
4. **QQ 消息卡**：桌宠旁的信封角标，有未读时带数字。点开可看最新消息、切「记录」、「写消息」
   （Enter 发送、Shift+Enter 换行）；卡片底部 🔊/🔇 只影响卡片。
5. **心情与音效**：头像旁的心情按钮循环「打盹 / 兴奋 / 待机」；
   音效在控制台「音效与提示」里按 按压 / 消耗 / 提问 / 授权 四路分别调。
6. **保存配置**：控制台改动点「保存配置」才生效；「恢复默认」可一键回退。

---

## 设置页导览

设置 → dsh-Dfy 只有一页，按使用频率从上到下：

| 区块 | 内容 |
|---|---|
| 状态 / 诊断 | 桥接与账号状态、SnowLuma 检测、一键开始、自检结果 |
| 呈现与位置 | 大小、吸附与翻转、屏幕漫游、避让滚动条、提示气泡、峰谷显示 |
| 动作与待机（仅桌宠） | 13 个动作分类、分身数量/动作/大小 |
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
| `$DSH_HOME/surfcore/memory/` | 记忆卡与注入块（已脱敏） |
| `$DSH_HOME/whale-roles/` 等 | 自定义角色、音频、泡泡图、表情包 |
| `$DSH_HOME/.dshw-usage.json` | 记账账本与用量 |
| `$DSH_HOME/.dshw-bubble.json` | 泡泡点击序列与模块库 |
| 仓库根 `config.json` / `state/` / `pet/` | 桥接配置骨架、本地状态与桌宠运行态（已 gitignore） |

---

## 安全边界

- 所有接口走统一入口校验：只允许回环来源，跨站一律拒绝，写请求必须来自本机。
- 凭据只发往内置模板写死的端点；自定义地址需在本机面板逐个勾选放行。
- 不下发通配 CORS；响应带 `X-Content-Type-Options: nosniff`。
- 仓库不含任何真实账号数据：角色卡与记忆卡都是脱敏示例。

---

## 常见问题

**装不上 / 挂件不出现**
先确认不是用 `github:` 规格装的；按方式 B 走完后 `dsh --profile <name> --dump-config | Select-String dsh-dfy`
能看到 `dsh-dfy` 与 `qq-mode` 两行，再完全退出 DSH 重开。

**插件页报「icon exceeds 256 KiB」**
旧版图标超限，头像会回退成默认图。本仓库 `icon.png` 已压到 205 KB，更新或重启后红字消失。

**`Cannot find module '@deepseek-ai/schemastery'`**
没跑 `npm install`，或 setup 顺序不对。回方式 B 第 1 步。

**余额提示「未配置 DEEPSEEK_API_KEY」**
配 API key，或在「设置 → 账号与余额」登录 DeepSeek 账号。

**「今日已用」显示 `--`**
需要先有一次成功的余额观测，统计从那一刻开始。

**保存设置报 403**
写操作只允许在运行 DSH 的本机、用 `127.0.0.1` 打开时进行。

**一键开始提示找不到 SnowLuma**
先跑 `node scripts/install-snowluma.mjs`（会自动下载官方 Releases 到 `%USERPROFILE%\SnowLuma2`）；
还识别不到就点「安装与维护 → 手动选择」指定目录（路径不要带中文和空格）。

**装 SnowLuma 时下载失败**
公司网络/代理会拦 GitHub Releases。让 Agent 重试，或手动从
`github.com/SnowLuma/SnowLuma/releases/latest` 下载 Windows zip 解压到 `%USERPROFILE%\SnowLuma2`，再重跑安装脚本。
不要用第三方镜像或网盘转存的包。

**桌宠提示素材缺失**
`widget/assets/pet-video/` 的 106 段 `.webm` 没跟上；确认装的是最新代码，不要锁旧 commit。

**QQ 信封一直不出现**
桥接没起或 SnowLuma 未登录：设置页看「诊断」，扫码登录后点「重新检测」。

**卡片没有声音**
依次检查：卡片底部 🔊/🔇、控制台全局音量、系统或标签页静音。

**发送后没收到回复**
看是否出现「✓ 已发送」；桥接断开时会提示「dsh-Dfy/桥接不可达」。

**设置页出现两个「Agent 预设定义」**
是 QQ 聊天与二代仿真两条预设，正常设计。

**菜单按钮不见了**
电脑端右键角色，手机端长按约 1.5 秒；控制台里可关掉「隐藏菜单」。

**改了前端不生效**
`widget/assets/whale-widget.js`、`widget/assets/console.html` 热读取，硬刷新即可；
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
├── AGENT.md              # 给 AI Agent 的安装手册（方式 A）
├── cordis.patch.yml      # dsh-dfy 与 qq-mode 两行挂载声明
├── lib/                  # 宿主入口（组合 widget + backend）与设置界面
├── backend/              # SurfCore：QQ/B站/记忆/对齐/额度
├── widget/               # 小鲸鱼与桌宠：前端、素材、动作链
├── src/                  # 桥接进程、MCP server、人格与记忆内核
├── presets/              # 两条 Agent 预设（由 dsh/agent-presets 生成）
├── shims/qq-mode/        # qq-mode 转发垫片
├── locale/               # 中英文元信息
├── scripts/              # 安装、构建、维护脚本
└── assets/ public/ roles/ examples/ .github/workflows/
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
- 安全与记账：星丶白羽莲（凭据外带风险）、[@0Sakura721](https://github.com/0Sakura721)、
  [@yybai25](https://github.com/yybai25)、[Yang-huai406](https://github.com/Yang-huai406)
- 功能与适配：[@Jy-EggRoll](https://github.com/Jy-EggRoll)、[@VaeKaras](https://github.com/VaeKaras)、
  [@MengLs1620](https://github.com/MengLs1620)、[@ELFsay](https://github.com/ELFsay)
- 历史合并 PR：[@ztzpro](https://github.com/ztzpro)、[@under-the-ocean](https://github.com/under-the-ocean)、
  [@21253soursweetlemon](https://github.com/21253soursweetlemon)、[@fangbm](https://github.com/fangbm)、
  [@xiaolinnnnnnn](https://github.com/xiaolinnnnnnn)

---

## 许可证

代码基于 **MIT License**，见 [LICENSE](LICENSE)。

`widget/assets/` 与 `assets/` 下的美术素材、动图与音效不在 MIT 覆盖范围内，按「原样」随插件分发；
逐项来源与权利主张方式见 [PROVENANCE.md](PROVENANCE.md)。
