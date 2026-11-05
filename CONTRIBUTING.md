# 贡献指南

感谢你愿意贡献！为了不让任何人的努力白费，请先花一分钟读完本文，无论你是人类，鲸鱼娘，还是硅基生命！

## 如何贡献？

- 欢迎在 issue 提任何 bug 反馈和功能建议！bug 一定会修，但不一定所有的功能建议都会采纳，这是为了避免代码无限变臃肿。issue 请说明：你想自己实现这个 issue，还是希望维护者或者其他人帮你实现。
- pr 必须关联 issue 并写 `close #编号`。你可以自由发起任何关联 bug-issue 的 pr，但是 feat（新功能）pr 或者 refactoring（重构）pr 必须关联到已经被维护者批准的 issue，否则会被关闭。

## 有什么需要注意的？

- 可以完全用 AI 发起 pr，但我们希望 pr 的正文描述自己来写，说明你自己做了什么。完全由 AI 生成的 pr 可能关闭。
- 代码请保持简洁、解耦 —— 现有的巨大单文件和耦合代码会慢慢拆分，请不要增加后续拆解难度。
- 提交前请跑一遍「本地门禁」（见下文），特别是 `node build.mjs --check`：`lib/client.js` 是**入库的构建产物**，改了 `lib/ui/*.js` 却忘了重建，等于线上跑的还是旧代码。

## 仓库结构和说明

如果你的 pr 更新了仓库结构，请顺便更新本部分以保持最新。

### 分支

本仓库只有一条长期分支 **`main`**，所有改动都提到 `main`。
（上游挂件/移植版本的文档里可能出现 `For-Codex`、`For–WinDesktop` 之类的分支名 —— 那些属于另外独立维护的移植版本，**不在本仓库**。）

### 目录结构

```
dsh-Dfy/
├── package.json               DSH bundle 元数据（dsh.bundle.patch → cordis.patch.yml + presets/*.patch.yml）
├── cordis.patch.yml           挂载声明（dsh-dfy 主插件 + qq-mode 命名空间垫片，两行）
├── build.mjs                  lib/ui/*.js → lib/client.js（构建产物入库，宿主只认单个 client 入口）
├── config.example.json        配置骨架（首次安装复制为 config.json；config.json 含凭据，不入库）
│
├── lib/                       宿主入口与设置界面
│   ├── index.js               宿主侧本体
│   └── ui/                    设置界面源码（改完必须 node build.mjs）
├── backend/                   SurfCore 后端（QQ / B站 / MCP 工具面 / 记账 / 记忆…）
├── widget/                    小鲸鱼挂件与桌宠
│   ├── lib/index.js           宿主侧路由与服务
│   ├── assets/                前端本体 whale-widget.js（宿主按 mtime 热读）+ 美术素材
│   └── tools/                 0 依赖的审计/回归脚本（CI 全部会跑，见下）
├── src/                       桥接与 MCP（bridge.js、mcp-*.js、voice-*、人格/记忆）
├── dsh/agent-presets/         Agent preset 源（qq-chat / qq-chat-v2，人格与工具面在这里改）
├── presets/                   由源生成的 bundle patch 文件（勿手改）
├── shims/qq-mode/             QQ 桥接的 Config 命名空间垫片
├── scripts/                   安装 / 维护 / 审计脚本
├── roles/                    默认人格卡    examples/  示例角色与记忆卡
├── locale/                   文案元数据
└── .github/workflows/         ci.yml（push/PR 门禁）、publish.yml（tag 发布门禁）
```

### 本地门禁（提交前）

```powershell
node build.mjs --check                              # 构建产物与源一致
node scripts/build-agent-preset-patches.mjs --check # preset 产物与源一致（需要先 npm install）
node --check <改过的 .mjs/.js>                      # 语法
node scripts/privacy-scan.mjs --strict              # 本机路径 / 账号 / 令牌 / 私钥
node scripts/version.mjs check                      # 版本面一致
node widget/tools/ci-audit.mjs --no-pack            # 路由安全 / 接口对等 / 注入面
node widget/tools/bubble-config-audit.mjs           # 泡泡配置「全量替换」语义
node widget/tools/choice-options-audit.mjs          # 并列候选不被静默裁掉
node widget/tools/check-dead-settings.mjs           # 「控件有值、没有消费方」初筛
node widget/tools/expr-smoke.mjs                    # 表情包清单 / 图片路由 / 配置键冒烟
node widget/tools/ci-audit-selftest.mjs             # 审计脚本自检
```

除 `ci-audit.mjs --pack` 外都是 0 依赖脚本，`npm install` 之前也能跑；CI 跑的就是这一组。

### 发布流程（改版本号前必读）

**版本号是单一真相：只在根 `package.json` 里写一份。** 文档里对外展示的版本面（README 顶部横幅、
AGENT.md 汇报模板、CHANGELOG 小节）必须与它一致 —— `node scripts/version.mjs check` 会逐一校验，
CI 与发布门禁都会跑。

- **日常检查**：`.github/workflows/ci.yml` 在 push 到 `main` 和 PR 时自动跑：全量 `node --check`、
  构建产物一致性、版本一致性、隐私扫描（`--strict`）、开发机路径扫描、图层审计、挂件行为回归、
  `ci-audit` 与审计脚本自检。**它永不发布。**
- **发版**：
  1. `node scripts/version.mjs bump patch`（自动同步 README 横幅 / AGENT 汇报模板 / 插入 CHANGELOG 空小节）
  2. 补 CHANGELOG 小节 → `git add -A && git commit -m "release: vX.Y.Z"`
  3. `node scripts/version.mjs tag --push` 打注释 tag 并推送
- **发布门禁**：推送 `v*` tag（或在 Actions 里手动触发）会跑 `.github/workflows/publish.yml`：
  第一件事就是校验 **tag == `package.json` 的 version**，然后重跑上面同一组检查。门禁失败就不要发。
- **本插件不做 npm 发布**：安装方式是把 GitHub 仓库 clone 到本机再 `node scripts/setup-dsh.mjs`
  注册进 DSH profile（见 README）。`publish.yml` 只做门禁，不上传任何产物；GitHub Release 需要手动创建。
- **发布前必须扫隐私**：`node scripts/privacy-scan.mjs --strict`。历史上踩过的坑是工作树里散落真实的
  QQ 号 / 本机绝对路径 / 令牌被直接推上去 —— Git 历史里的东西删提交删不掉（还会被 fork 保留）。
  误报用 `privacy-rules.json` 的 `allowPaths`（整文件）或 `allowRulePairs`（文件 + 规则名，更窄）登记。
- **自检不过就不要发**：`ci-audit-selftest.mjs` 会证明审计断言不是空转；它红了说明护栏自己坏了。

### 运行时数据放哪

运行时的东西都在 `$DSH_HOME`（默认 `~/.dsh`）：

| 文件 / 目录                | 用途                                           |
| -------------------------- | ---------------------------------------------- |
| `.dshw-size.json`          | 外观与开关（缩放、音量、音效组、吸附相关）     |
| `.dshw-usage.json`         | 记账账本 + 按日余额观测 + 用量设置             |
| `.dshw-turn.json`          | 每轮消耗的 seq（避免热重载后把新轮次当旧轮次） |
| `.dshw-bubble.json`        | 自定义泡泡配置（点击序列 + 模块库；**全量替换**语义，删文件即恢复出厂） |
| `.dshw-api.json`           | 自定义 API 模型注册表（**不含密钥**）          |
| `.dshw-usage-archive.json` | 账本归档（明细 90 天 / 2 万条，逐日 365 天）   |
| `.dshw-codex.json`         | Codex 本地会话统计缓存（**不含任何凭据**）     |
| `whale-roles/`             | 自定义角色图 + `roles.json` 索引               |
| `whale-audio/`             | 音频片段 + `audio.json` 索引                   |
| `whale-bubble-imgs/`       | 泡泡图库 + `bubble-imgs.json` 索引             |
| `surfcore/`                | QQ / B站 / 桥接配置、记忆卡、账单与遥测（含凭据，**不要外发**） |

仓库根也会有运行时文件（都已 gitignore，**不要提交**）：`config.json`（含 SnowLuma token）、
`state/`（桥接令牌、聊天记录、缓存）、`pet/`（本地桌宠状态）。

### 关于那几个超大文件

`widget/assets/whale-widget.js`（前端挂件本体，宿主按 mtime 热读）和由 `lib/ui/*.js` 拼出来的
`lib/client.js` 确实很大。在拆分落地之前，请按拆分友好的方式写：新逻辑尽量自成一块、少依赖全局状态、
不要加深既有耦合。`lib/client.js` 是生成物，**不要直接改它** —— 改 `lib/ui/` 里的源文件再跑 `node build.mjs`。
