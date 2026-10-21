# DSH 小鲸鱼挂件 Plus

> DeepSeek Balance Whale Widget Plus · `v0.5.0`

DSH（DeepSeek Harness）右下角的常驻小鲸鱼挂件：余额、今日已用、每轮消耗、峰谷常驻徽标，
外加可自由编辑的泡泡、多套表情素材、提示音效，以及内置的 **106 段透明动画桌宠**。
支持 `dsh web` 与官方桌面客户端（Electron）。

本仓库是官方挂件 `MeteorNOX/DeepSeek-Balance-Whale-Widget` 的增强分支，由
`louke6572` 维护；桌宠动画来自 `PC2005-cloud/dsh-pet`（MIT）。来源与致谢见文末。

![DSH 小鲸鱼挂件](assets/DSH2.png)

## 亮点

- **余额与记账**：60 秒自动刷新；余额差 + 会话事件算今日已用；逐轮真实 usage 换算金额；明细保留 90 天、逐日汇总 365 天。
- **峰谷常驻徽标**：峰/谷状态与倒计时无需点开气泡，贴在人物左下角；贴左吸附时自动换边。
- **桌宠（动画）角色形态**：106 段 VP9-alpha 透明动画，双击缓冲交叉淡入；动作按分类下拉切换，可固定也可自动轮播。
- **泡泡编辑器**：点击序列、并列加权、模块化排版、随机语句/随机图片、拖拽排序、模块库。
- **表情与音效**：5 套表情素材包、情绪/眨眼/卖萌/疲惫；按压/每轮消耗/提问/授权四通道音效，每通道独立音量。
- **多厂商与扩展**：33 家厂商额度模板、自定义 API 模型、火山 coding plan 额度、Codex 本地会话统计。

## 安装

> 安装规格里的包名是 **`dsh-whale-widget-plus`**。安装前先确认没有同名的旧版或官方版并存。

### DSH Web（`dsh web`）

任选一种：

```powershell
# npm（已发布时）
dsh plugin --profile web add dsh-whale-widget-plus

# 直接从 GitHub
dsh plugin --profile web add github:louke6572/dsh-whale-widget-plus

# 本地仓库 / 完整资源包（link: 为软链，源目录不能移动）
dsh plugin --profile web add link:D:\Plugins\dsh-whale-widget-plus
```

安装后重启 `dsh web`，浏览器 `Ctrl+F5` 刷新。若之前装过同名插件，先执行
`dsh plugin --profile web remove dsh-whale-widget-plus` 再装，避免版本冲突。

### 官方桌面端（Electron）

桌面端读的是 **`desktop` profile**，不能用 `--profile web`；而 `--profile desktop`
会被 CLI 拒绝，这是设计如此。正确做法是在桌面客户端会话里让宿主内置的
`plugin_manager` 安装：

> 请使用当前桌面端内置的 `plugin_manager` 安装 `dsh-whale-widget-plus`。
> 先核对当前 profile、已安装来源与版本；按工具支持的方式完成后告诉我结果，并说明是否需要重启。

- **首次安装**：工具返回 `applied` 不保证当前窗口已经渲染；没出现就完全退出客户端（含托盘）再打开。
- **升级**：优先沿用同一来源通过内置工具更新；返回 `restart-required` 时完全退出再打开，然后核对实际版本。

### 升级与卸载

```powershell
dsh plugin --profile web remove dsh-whale-widget-plus
```

升级时不要混用 npm、GitHub、本地目录三种来源；先在插件管理页或 CLI 里移除旧来源，再按同一来源安装。
用户数据（记账、泡泡配置、自定义素材）都在 `$DSH_HOME` 下，卸载插件不会删除它们。

## 凭据与安全

### 余额取数

两种方式，**API key 优先，账号登录态兜底**：

- **`DEEPSEEK_API_KEY`**：在 DSH 凭据服务里配置，用于请求 `GET https://api.deepseek.com/user/balance`。
- **DSH 账号登录态**：在「设置 → 账号与余额」登录 DeepSeek 后，没有 API key 时会自动改用 DSH
  的账号服务（充值钱包 + 赠金），插件不接触账号令牌。两种方式的账本按账户标识分开。

不需要 `DEEPSEEK_PLATFORM_TOKEN`。今日已用统一由「小鲸鱼记账」（余额差 + 会话事件）计算。

### 安全边界

1. **凭据只发往厂商模板里写死的端点**。自定义地址默认拿不到凭据；确需自建网关时，在**本机**
   打开面板，对该模型勾选「允许把凭据发送到自定义地址」。
2. **写请求只接受本机来源**（`127.0.0.1` / `localhost` / `[::1]`），否则 `403`；只读接口不受影响。
   需要远端管理时用 `DSHW_ADMIN_HOSTS=192.0.2.10:3080,myhost.lan` 显式声明。
3. 接口地址不允许携带用户名密码；凭据名只允许字母、数字与下划线。

### 其它厂商凭据（按需配置）

| 凭据名 | 用途 |
|---|---|
| `OPENROUTER_API_KEY` | OpenRouter 余额 |
| `MOONSHOT_API_KEY` | Kimi / Moonshot 大陆站余额（CNY） |
| `MOONSHOT_INTL_API_KEY` | Kimi / Moonshot 国际站余额（USD） |
| `SILICONFLOW_API_KEY` | 硅基流动模型探活 |
| `ARK_API_KEY` | 火山方舟模型探活 |
| `ZHIPU_API_KEY` | 智谱订阅额度 / Coding 端点 |
| `OPENCODE_GO_API_KEY` | OpenCode Go 订阅额度 |
| `CUSTOM_API_KEY` | 自定义 HTTP / OpenAI 兼容中转站 |

换厂商时确认「凭据名」跟着模板变化，否则新 key 会覆盖上一家的凭据。

## 功能

### 记账与显示

- **余额**：60 秒自动刷新，点击鲸鱼可手动刷新；余额变化带数字滚动；瞬时网络抖动沿用最近值。
- **今日已用（小鲸鱼记账）**：余额下降计为消费，余额上升单独记为充值/赠金，不会冲掉消费；
  出现「待核对余额调整」时可在记账面板用「余额校正」补录实际到账金额。
- **每轮消耗**：读取本机会话 `turn/end` 的真实 usage（input / cache / output / reasoning），
  换算金额并弹泡泡；金额按 8 位小数记账，显示保留两位。
- **用量记录**：今日消费、近 7 天、全部记录、模型占比、按日展开明细，支持按日期或模型名搜索。
- **模型名标注**：`deepseek-flash` 显示为 `DeepSeek-V4.1-Flash`，旧名自动归并到同一模型。

### 峰谷时段显示（v0.4.3 起）

峰/谷状态字 + 距下一时段倒计时外移到人物左下角，不点气泡也能看到；与人物底边对齐，
贴左吸附时自动换到人物右侧。状态字样式可选：**峰/谷、梁文峰/梁文谷、高峰/低谷、自定义**。

主菜单「峰谷显示」可选三种方式（v0.6.0 起）：

| 选项 | 行为 |
|---|---|
| 常驻徽标（默认） | 左下角常驻；气泡内不重复显示 |
| 气泡内 | 隐藏徽标，恢复上游原版：点开气泡时显示配置里的峰谷/倒计时模块 |
| 隐藏 | 徽标与气泡内都不显示 |

选择保存在 `localStorage` 的 `dshw-pbmode`，修改后立即生效，刷新后保持。
倒计时带描边框，与状态字严格等高，颜色随峰/谷自动红/绿切换。

### 桌宠（动画）角色形态（v0.5.0 起）

在「角色」里选「桌宠（动画）」即可切换，随包带 **106 段 VP9-alpha `.webm`**；
双层 video 交叉淡入，换段不出现空白帧。切到桌宠后，菜单变成桌宠专用项：

| 行 | 下拉内容 |
|---|---|
| 待机 | `随机（默认）` + 全部动画；选中某段即作为自定义待机并记忆 |
| 转向 / 移动 / 点击回应 / 小动作 / 玩耍 / 吃什么 / 时节 / 文字 / 工作状态 | `自动随机` + 本类全部动作 |

- 每个分类下拉里的 `自动随机` = **只在该分类内轮播**；选中具体动作 = **固定循环**。
- 回到全局轮播：把「待机」选回 `随机（默认）`（会清掉固定项）。
- 固定项与自定义待机保存在浏览器 `localStorage`（`dshw-pet-pin` / `dshw-pet-idle`），刷新和重启后保持。
- 贴左吸附时整体镜像；带文字的台词动作会反向抵消镜像，画面文字始终正读，峰谷徽标也不会被人物遮挡。
- 右键角色打开同一个主菜单；菜单打开时气泡自动淡出，避免与下拉互相遮挡。

### 泡泡编辑器

- **点击序列**：首次点击、再次点击队列可任意增删排序；两项可并列成 A/B 加权选择。
- **模块化内容**：文本、超链接、随机语句（带权重、防连抽）、图片/动图、随机图片、总余额、赠金、
  充值余额、今日已用、峰谷时段、对话名；每条支持独立字体、字号、颜色、跑马灯、底色。
- **排版**：桌面原生拖拽、移动端长按拖拽；每行最多 6 个模块，泡泡最多 6 行；图片模块独占一行。
- **模块库**：常用模块另存后可在任意泡泡复用。
- **手写 `.dshw-bubble.json` 是全量替换**：`items` 就是整条序列；写坏或想恢复，**删掉该文件**即可。
  未知 `kind`、`modules` 非数组或并列无候选时，宿主会忽略该文件并在日志里给出原因。

### 表情素材包

随包提供 5 套素材（`assets/v1` ~ `v5`），每套由 `pack.json` 自描述。菜单里可切换素材包、
手动锁定表情；支持情绪映射（连点生气、悬停害羞、空闲失落）、空闲眨眼、随机卖萌，
以及当前模型额度 ≥90% 时的疲惫表情。自定义素材包放到 `$DSH_HOME/whale-expressions/<id>/`。

### 音效与提示

- 四个入口：**按压音效**、**每轮消耗提示**、**提问提示**、**授权提示**。
- 每个音效有独立开关、独立音量和试听；入口行显示当前摘要，点开才展开设置。
- 面板内改动只落内存，点「保存」才生效；「恢复默认」后点取消仍可撤销。
- 任务结束音内置 `A` 与 Minecraft·经验球；可导入自定义音频片段。

### 火山 coding plan 额度

`plugins/volc-usage/` 是独立附属插件，读取 `$DSH_HOME/.credentials.yaml` 里的
`VOLCES_ACCESS_KEY_ID` / `VOLCES_SECRET_ACCESS_KEY`（支持多账号），显示方舟额度并在余量不足时
把推理 key 切到余量最大的账号。只做 DeepSeek 可以不装。

### 自定义 API 与 Codex

- **自定义 API 模型**：支持厂商模板、凭据名、接口字段、自定义单价、额度与用量累计；密钥不写入配置文件。
- **Codex 本地统计**：可选读取 `~/.codex/sessions`，按天/模型聚合本机 Codex 用量；只读本地文件，不含凭据。

## 本仓库与官方的关系

本仓库基于官方 `MeteorNOX/DeepSeek-Balance-Whale-Widget`，保留其全部能力，并额外提供：

- 峰谷时段常驻徽标（官方在气泡内，本仓库外移）。
- 桌宠（动画）角色形态与分类动作下拉（内置 `dsh-pet` 动画链）。
- 5 套表情素材包、自定义角色/泡泡图库/音频资源管理。
- 火山 coding plan 额度附属插件。
- 更完整的 CI 审计（路由安全、设置死键、并列候选、泡泡配置语义）。

> Codex 版小鲸鱼已迁至独立仓库 [Codex-Whale-Public](https://github.com/Yang-huai406/Codex-Whale-Public)，
> 本仓库只维护 DSH Web 与官方桌面客户端。已安装 Codex 版的用户无需重装。

## 目录与数据

```text
dsh-whale-widget-plus/
├── package.json              # DSH bundle 元数据（dsh.bundle.patch / dsh.client）
├── icon.png                  # 插件列表图标
├── cordis.patch.yml          # 插件挂载声明
├── lib/
│   ├── index.js              # 宿主侧：路由、记账、音效/图片/角色服务
│   ├── client.js             # 客户端生命周期
│   └── accounting.mjs        # 记账内核（定点金额 + 观测/校正）
├── assets/
│   ├── whale-widget.js       # 前端挂件本体（宿主按 mtime 热读取）
│   ├── pet-video/            # 106 段桌宠透明动画
│   ├── v1 ~ v5/              # 表情素材包
│   └── DSniang1.png 等        # 角色图、音效、泡泡图
├── tools/                    # CI 审计脚本
└── whale-widget-prompt.md    # 完整规格与二次开发提示
```

运行时数据默认在 `$DSH_HOME`（通常是 `~/.dsh`）：

| 文件 / 目录 | 用途 |
|---|---|
| `.dshw-size.json` | 外观与开关（缩放、音量、吸附、每轮消耗关闭秒数等） |
| `.dshw-usage.json` | 记账账本、余额观测/校正、用量与音效设置 |
| `.dshw-bubble.json` | 泡泡点击序列与模块库（手写即全量替换） |
| `.dshw-api.json` | 自定义 API 模型注册表（不含密钥） |
| `.dshw-usage-archive.json` | 超过保留期的明细与逐日归档 |
| `.dshw-codex.json` | Codex 本地统计缓存（不含凭据） |
| `whale-roles/` `whale-audio/` `whale-bubble-imgs/` | 自定义角色、音频、泡泡图资源 |

## 验证

```powershell
dsh --profile web --dump-config | Select-String -Pattern "whale"
curl http://127.0.0.1:3080/dsh-whale/balance.json
curl http://127.0.0.1:3080/dsh-whale/widget.js
curl http://127.0.0.1:3080/dsh-whale/pet-animations.json
```

- `/dsh-whale/balance.json` → `{ok, totalBalance, currency, todayUsage}`
- `/dsh-whale/widget.js` → 前端挂件本体
- `/dsh-whale/pet-animations.json` → 桌宠动画清单
- 浏览器 `Ctrl+F5` 后右下角出现挂件

> 全部 **33 个** `/dsh-whale/*` 路由都接入了 DSH 浏览器信任栅栏。不带会话凭据的裸 `curl`
> 返回 `401`（伪造 Host 为 `403`）是预期行为，不代表接口坏了；写请求还必须是本机来源。

## 常见问题

- **挂件不出现**：确认安装规格是 `dsh-whale-widget-plus`；`dsh --profile web --dump-config`
  能看到它；重启 `dsh web` 后刷新。桌面端确认装在 `desktop` profile，并完全退出客户端再打开。
- **余额报「未配置 DEEPSEEK_API_KEY」**：配置 API key，或在「设置 → 账号与余额」登录 DeepSeek 账号。
- **保存设置报 403**：写操作只能在运行 DSH 的本机、用 `127.0.0.1` 打开时进行；远端管理用 `DSHW_ADMIN_HOSTS`。
- **提示「该地址不是内置端点，已拒绝发送凭据」**：自定义网关需在本机面板对该模型勾选「允许把凭据发送到自定义地址」。
- **今日已用显示 `--`**：等待一次成功的余额观测；统计从该时刻开始，之前的消费不计入。
- **今日已用与官网不一致**：核对同一账户、同一币种、同一区间；充值与消费同区间时用「余额校正」补录到账金额。
- **每轮消耗/任务结束音不出现**：在「音效与提示 → 全局设置」展开「每轮消耗提示」，确认左侧开关与音量；一轮完整结束才结算。
- **等待提问/授权的气泡关不掉**：点一下气泡即可收起；也可在音效面板底部开启「点按角色关闭提示气泡」。
- **隐藏了菜单按钮**：电脑端右键角色，手机端长按约 1.5 秒。
- **改了前端不生效**：`assets/whale-widget.js` 按 mtime 热读取，硬刷新即可；改 `lib/index.js` 必须重启 `dsh web`。

## 定价表

金额按 **CNY / 百万 tokens**，格式为 `[空闲, 高峰]`。高峰 = 工作日 9:00–12:00、14:00–18:00
（北京时间），空闲价为高峰的一半；2026-08-23 起周末全天谷价。

| 模型 | 缓存命中 | 缓存未命中 | 输出 |
|---|---|---|---|
| `deepseek-flash`（V4.1-Flash） | 0.02 / 0.04 | 1 / 2 | 4 / 8 |
| `deepseek-v4-pro`（V4 Pro） | 0.15 / 0.30 | 4.5 / 9.0 | 13.5 / 27.0 |

> 旧名 `deepseek-v4-flash`、`deepseek-v4-flash-vision-exp` 仍按 Flash 价计费。

## 开发与维护

- `lib/index.js`（宿主）、`lib/client.js`（生命周期）、`lib/accounting.mjs`（记账内核）、
  `assets/whale-widget.js`（前端）。宿主改动需重启 `dsh web`，前端改动硬刷新即可。
- 本地联调：`dsh plugin --profile web add link:.`。
- CI：`node tools/ci-audit.mjs --no-pack` 会检查路由安全、README 路由条数、设置死键、
  并列候选和泡泡配置语义；`node tools/check-dead-settings.mjs` 可单独运行。
- 完整规格与视觉参数见 [`whale-widget-prompt.md`](whale-widget-prompt.md)。

## 致谢

### 两个插件的原作者

- **月匠（[MeteorNOX](https://github.com/MeteorNOX)）**：官方挂件
  [`DeepSeek-Balance-Whale-Widget`](https://github.com/MeteorNOX/DeepSeek-Balance-Whale-Widget)
  原作者。余额、记账、峰谷定价、泡泡编辑器、音效与安全边界等基础能力均来自该项目。
- **[PC2005-cloud](https://github.com/PC2005-cloud)**：[`dsh-pet`](https://github.com/PC2005-cloud/dsh-pet)
  作者（MIT）。本仓库内置的 106 段透明动画、动画链与桌宠交互素材来自该项目。

### 本分支

- **[louke6572](https://github.com/louke6572)**：本仓库（Plus 分支）的维护者，负责峰谷常驻徽标、
  桌宠集成与分类动作下拉、镜像/布局修复、资源包与 CI 审计等增强。

### 社区贡献

- **Codex 端口迁移**：[Yang-huai406](https://github.com/Yang-huai406)；macOS 适配：[@1llysviel](https://github.com/1llysviel)。
- **安全与记账**：B 站「星丶白羽莲」报告凭据外带风险；[@0Sakura721](https://github.com/0Sakura721)
  定位换 key 分本问题；[@yybai25](https://github.com/yybai25) 提供账号态余额规格；
  [@Yang-huai406](https://github.com/Yang-huai406) 设计充值记账修复方案。
- **功能与适配**：[@Jy-EggRoll](https://github.com/Jy-EggRoll)（提问/授权提示）、
  [@VaeKaras](https://github.com/VaeKaras)（下载管理器抢音效）、
  [@MengLs1620](https://github.com/MengLs1620)（桌面端生效方式）、
  [@ELFsay](https://github.com/ELFsay)（OpenCode Go 额度）、QQ 群友（提示音量与冒泡开关死键分析）。
- **历史合并 PR**：[@ztzpro](https://github.com/ztzpro)（插件包结构）、
  [@under-the-ocean](https://github.com/under-the-ocean)（自动发布 npm）、
  [@21253soursweetlemon](https://github.com/21253soursweetlemon)（gif 降级、位置记忆）、
  [@fangbm](https://github.com/fangbm)（多币种、周末谷价、Release 流程）、
  [@xiaolinnnnnnn](https://github.com/xiaolinnnnnnn)（Tauri 桌面端）。

## 许可证

代码基于 **MIT License**，详见 [LICENSE](LICENSE)。

`assets/` 下的美术素材、动图与音效不在 MIT 覆盖范围内，按「原样」随插件分发，仅供运行本插件使用；
逐项来源、元数据清理与权利主张方式见 [PROVENANCE.md](PROVENANCE.md)。
