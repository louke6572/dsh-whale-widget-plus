# AGENT.md — 交给 AI Agent 的安装与配置手册

> 阅读对象是 AI Agent（Claude Code / Codex / DSH 内置 agent 等）。
> 目标：把 dsh-Dfy 装到用户机器上并跑起来，**用户只需要做一件事：扫码登录 QQ**。
> SnowLuma 也由你下载安装（官方 Releases），用户不需要自己找安装包。
> 人类用户看不懂命令没关系，把下面「复制给 Agent」那段发给任意能执行命令的 Agent 即可。

## 复制给 Agent

```text
帮我安装 dsh-Dfy（QQ × B站 × 桌宠一体化插件）：
1. 仓库 https://github.com/louke6572/dsh-dfy
2. 严格按仓库根目录的 AGENT.md 执行，不要跳步
3. 装完后告诉我：安装目录、版本、profile、SnowLuma 状态、QQ 是否已登录，以及我还需要做什么
只有扫码登录 QQ 需要我亲手操作（以及重启 DSH 时点一下退出/重开），其余由你完成，包括下载安装 SnowLuma。
```

## 硬约束（先读）

1. **不要用 `dsh plugin --profile <p> add github:louke6572/dsh-dfy`**。
   本插件运行时需要仓库根下的 `config.json`、`state/`、`pet/`、`src/bridge.js`，
   用插件管理器装进 `node_modules` 后这些路径不再成立。必须按下面的「克隆仓库 + setup 脚本」方式安装。
2. **SnowLuma 由你安装**（第三方 QQ 运行时），但**只能从官方 Releases 下载**：
   `github.com/SnowLuma/SnowLuma/releases/latest`。禁止第三方镜像、破解包、网盘转存。
   安装、解压、写配置、启动都由你完成；用户只负责在 SnowLuma 窗口扫码登录 QQ。
3. **不要提交或外发** `config.json`、`~/.dsh/surfcore/`、`state/`、QQ/B站凭据。
4. 不要修改用户已有的 `~/.dsh/surfcore/` 数据（记忆、账号、记账）。
5. 只在 Windows 上执行（沙箱 ACL 与桥接绑定 Windows）。

## 前置检查

| 检查 | 命令 | 期望 |
|---|---|---|
| Node | `node -v` | ≥ 22.13 |
| DSH | `dsh --version` | ≥ 0.2.1-rc.2 |
| Git | `git --version` | 任意版本 |
| 系统 | `$env:OS` | Windows_NT |

缺 Node 或 DSH 时先停下来告诉用户，不要自己乱装。

## 执行步骤

### 1. 克隆到固定目录

默认 `%USERPROFILE%\dsh-Dfy`（即 `C:\Users\<用户名>\dsh-Dfy`）。

```powershell
# 已存在则更新，不要重复克隆
if (Test-Path "$env:USERPROFILE\dsh-Dfy\.git") {
  git -C "$env:USERPROFILE\dsh-Dfy" pull --ff-only
} else {
  git clone --depth 1 https://github.com/louke6572/dsh-dfy.git "$env:USERPROFILE\dsh-Dfy"
}
```

**验收**：目录里能看到 `package.json`、`lib/`、`backend/`、`widget/`、`src/`。

### 2. 安装依赖

```powershell
cd "$env:USERPROFILE\dsh-Dfy"
npm install
```

失败时（没有 npm / 网络问题）改用 DSH 自带的 pnpm：

```powershell
node "$env:USERPROFILE\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\pnpm\bin\pnpm.cjs" install
```

**验收**：`node_modules` 存在，且 `node -e "require.resolve('js-yaml')"` 不报错。

### 3. 写入 DSH profile

```powershell
cd "$env:USERPROFILE\dsh-Dfy"
node scripts/setup-dsh.mjs            # 自动识别在用的 profile
node scripts/setup-dsh.mjs desktop    # 桌面端；`dsh web` 用 web
```

脚本是幂等的，可重复执行。它负责：

1. `~/.dsh/plugins/dsh-dfy` → 本仓库（junction）
2. `<profile>/node_modules/dsh-dfy` → 上一层链接
3. profile `package.json` 只保留 `dsh-dfy` 一个 bundle，清理旧的 `surfcore` 链接
4. 生成两条 Agent 预设与 3 个 MCP server 配置
5. 仓库根没有 `config.json` 时从 `config.example.json` 复制一份

**验收**（缺一不可）：

- 退出码 0，输出里有 `bundle dsh-dfy link 已创建`
- `~/.dsh/profiles/<profile>/package.json` 的 `dsh.profile.bundles` 里只有 **一个** `dsh-dfy`
- `~/.dsh/profiles/<profile>/node_modules/dsh-dfy` 存在且指向本仓库
- `config.json` 已存在（占位配置）

> 桌面端 profile 由 Electron 独占时，脚本会输出「由桌面端独占：已跳过 CLI 安装」——这是正常结果。

### 4. 安装 SnowLuma（你来做，不要交给用户）

```powershell
cd "$env:USERPROFILE\dsh-Dfy"
node scripts/install-snowluma.mjs
```

脚本会自动完成：

1. 先按 `config.json`、`~/SnowLuma2`、`~/Documents/SnowLuma*`、桌面、Downloads、Program Files 的顺序检测是否已安装；
2. 没装则从官方 Releases 拉最新 Windows zip，解压到 `%USERPROFILE%\SnowLuma2`（路径不含中文/空格）；
3. 校验启动文件（`app\launcher.bat` / `launcher.bat` / `SnowLuma.exe`）；
4. 把 `snowluma.launcherPath` 与 `allowLaunch: true` 写进 `config.json`；
5. 启动 SnowLuma。

**验收**：输出 `已检测到 SnowLuma：<root>` 或 `安装完成：<root>`，退出码 0。

**注意**：
- 不想装在默认目录就用 `--dir D:\SnowLuma2`；候选目录之外的位置需要在设置页「安装与维护 → 手动选择」。
- 只装不启动可用 `--no-launch`（稍后「一键开始」也会拉起）。
- 下载失败（公司网络/代理）时不要换第三方镜像，告诉用户手动从官方 Releases 下载解压到 `%USERPROFILE%\SnowLuma2`，然后重跑本脚本。
- 装好后**不要**替用户点登录：扫码必须用户本人完成。

### 5. 让用户重启 DSH

```text
请完全退出 DSH（含托盘图标）再重新打开，然后告诉我「已重启」。
```

Electron 桌面端必须完全退出，仅关窗口不够。

### 6. 重启后验证插件已加载

```powershell
# 端口取 dsh web 启动时打印的地址；桌面端默认 3080
curl -s -o NUL -w "%{http_code}" http://127.0.0.1:3080/dsh-whale/widget.js
```

- `200`：挂件接口正常
- `401`：也是正常（路由要求会话凭据），说明插件已挂载
- `000`/连接失败：DSH 没起来，或插件未加载 → 检查下一步

再确认设置页里出现 **dsh-Dfy**，且没有 `icon exceeds 256 KiB` 之类红字。

### 7. 启动 QQ（一键开始）

插件启动时会自动执行「一键开始」：识别并在后台拉起 SnowLuma → 等 OneBot → 写入账号/token → 启动桥接 → 启动 B站。

- 若 SnowLuma **已登录过**：等约 20 秒即可，无需操作。
- 若 **未登录**：打开 SnowLuma 控制台，让用户扫码：

```text
请在已打开的 SnowLuma 窗口里扫码登录 QQ，登录完成后告诉我。
```

扫码完成后 20 秒再检查桥接状态；用户数据在 `~/.dsh/surfcore/`。

### 8. 汇报给用户（照抄模板）

```text
dsh-Dfy 已安装完成。
- 安装目录：<目录>
- 版本：0.7.3
- DSH profile：<profile>
- SnowLuma：<已找到/未安装>
- QQ：<已登录（昵称/QQ号）/未登录>
- B站：<已登录/未登录（可选）>
- 余额：<可用/需要配置 DEEPSEEK_API_KEY 或登录 DSH 账号>
还需要你做：<例如扫码 / 配置 API key / 无>
```

## 排错对照表

| 现象 | 原因 | 处理 |
|---|---|---|
| `Cannot find module '@deepseek-ai/schemastery'` | 跳过了 `npm install` | 回第 2 步 |
| 设置页报 `icon exceeds 256 KiB` | 装的是旧包 | 更新到本仓库最新代码 |
| `dsh-dfy` 没出现在 profile | setup 没跑或跑错 profile | 重跑第 3 步，核对 profile 名 |
| `无法验证 xxx` / `cannot resolve profile bundle` | profile 需要 install | 用户重启桌面端；或 `dsh plugin --profile <p> install` |
| 挂件接口 401 | 正常，缺会话凭据 | 不用处理 |
| QQ 信封不出现 | 桥接没起 / SnowLuma 未登录 | 看设置页「诊断」，扫码后重试 |
| 一键开始提示找不到 SnowLuma | 安装位置非常规 | 设置页「安装与维护 → 手动选择」指定目录 |

## 完成标准（全部满足才算装好）

- [ ] 仓库在 `%USERPROFILE%\dsh-Dfy`，`npm install` 成功
- [ ] `node scripts/setup-dsh.mjs` 退出码 0
- [ ] profile 的 bundles 只有 `dsh-dfy`，链接指向本仓库
- [ ] 重启后 `/dsh-whale/widget.js` 返回 200 或 401
- [ ] 设置页出现 dsh-Dfy 且无图标报错
- [ ] SnowLuma 已安装；QQ 已扫码登录（或已明确告知用户待扫码）
