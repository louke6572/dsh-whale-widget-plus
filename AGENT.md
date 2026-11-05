# AGENT.md — 给 AI Agent 的傻瓜安装手册

> 目标：装好 dsh-Dfy，**用户只需要做两件事：重启 DSH、扫码登录 QQ**。
> 其他（下载、依赖、写 profile、装 SnowLuma、启动桥接）全部由 Agent 完成。

## 复制给 Agent

```text
帮我安装 https://github.com/louke6572/dsh-Dfy ，按仓库里的 AGENT.md 执行，不要跳步；
装完告诉我结果，需要我做的事直接说。
```

## 必须遵守

1. **不要用** `dsh plugin add github:louke6572/dsh-dfy`：运行需要仓库根的 `config.json`、`state/`、`src/bridge.js`。
2. **不要自己重启/关闭 DSH**：你可能就跑在 DSH 里，重启会中断当前任务；只让用户手动退出再打开。
3. **不要替用户扫码**：二维码必须用户本人在 SnowLuma 窗口扫。
4. SnowLuma 只从**官方 Releases** 下载（`github.com/SnowLuma/SnowLuma/releases/latest`），不要第三方镜像。
5. 不要提交/外发 `config.json`、`~/.dsh/surfcore/`、`state/`、QQ/B站凭据。

## 一、首选：一条命令装完

```powershell
powershell -ExecutionPolicy Bypass -c "irm https://raw.githubusercontent.com/louke6572/dsh-Dfy/main/scripts/bootstrap.ps1 | iex"
```

脚本会依次完成：

1. 检查 Node ≥ 22.13 与 DSH 是否就绪
2. 下载/更新仓库到 `%USERPROFILE%\dsh-Dfy`
3. `npm install`（失败自动换国内镜像）
4. `node scripts/setup-dsh.mjs`（自动识别 profile，写 bundle / 预设 / MCP / 生成 config.json）
5. `node scripts/install-snowluma.mjs --no-launch`（检测或下载官方 Releases）

**验收**：退出码 0，最后打印「完成，只剩两步需要你」。任何一步失败脚本都会打印 `[!!]` 并以**非 0 退出码**结束
（别只看最后一行文字；`powershell -c "irm … | iex"` 的退出码就是脚本的退出码）。

只要挂件不接 QQ：命令前加 `$env:DSHDFY_SKIP_SNOWLUMA='1'`。
只体检不安装：命令前加 `$env:DSHDFY_CHECK='1'`。
自定义目录：命令前加 `$env:DSHDFY_DIR='D:\dsh-Dfy'`。

## 二、失败时分步执行

在 `%USERPROFILE%\dsh-Dfy` 下逐条跑，哪一步失败就停下修哪一步：

```powershell
# 1) 代码
if (Test-Path "$env:USERPROFILE\dsh-Dfy\.git") { git -C "$env:USERPROFILE\dsh-Dfy" pull --ff-only }
else { git clone --depth 1 https://github.com/louke6572/dsh-Dfy.git "$env:USERPROFILE\dsh-Dfy" }

# 2) 依赖
cd "$env:USERPROFILE\dsh-Dfy"; npm install

# 3) 写进 DSH（自动识别 profile）
node scripts/setup-dsh.mjs

# 4) SnowLuma（接 QQ 才需要）
node scripts/install-snowluma.mjs --no-launch

# 5) 配置骨架（第 3 步一般已生成，缺了才跑）
if (-not (Test-Path config.json)) { Copy-Item config.example.json config.json }
```

## 三、让用户做的两件事

装完后对用户说（不要自己动手）：

```text
1) 请完全退出 DSH（托盘图标也要退出）再打开，好了告诉我。
2) 打开 设置 → dsh-Dfy → 一键开始；第一次用 QQ 时在 SnowLuma 窗口扫码登录。
```

用户重启后，你继续验证：

```powershell
curl -s -o NUL -w "%{http_code}" http://127.0.0.1:3080/dsh-whale/widget.js
```

- `200` / `401`：插件已加载（401 是路由要求会话凭据，正常）
- 连不上：DSH 没起来或插件没挂上，按下面的排错表查

## 四、汇报模板

```text
dsh-Dfy 已安装。
- 安装目录：<目录>
- 版本：0.7.3
- DSH profile：<profile>
- SnowLuma：<已就绪 / 未安装>
- QQ：<已登录（昵称/QQ号） / 等待扫码>
还需要你做：<例如扫码 / 配 DEEPSEEK_API_KEY / 无>
```

## 五、排错表

| 现象 | 处理 |
|---|---|
| `Cannot find module ...` | 回第 2 步 `npm install` |
| `cannot resolve profile bundle` | 重启桌面端；或 `dsh plugin --profile <p> install` |
| profile 被 Electron 独占 | 正常：`setup-dsh` 会提示跳过，重启桌面端即可 |
| 找不到 SnowLuma | 重跑 `node scripts/install-snowluma.mjs`；仍失败用手动目录 `--dir D:\SnowLuma2` |
| SnowLuma 下载失败 | 检查代理；仍不行让用户手动从官方 Releases 解压到 `%USERPROFILE%\SnowLuma2`，再重跑脚本 |
| 设置页 `icon exceeds 256 KiB` | 装的是旧包，更新到最新 main |
| QQ 信封不出现 | 桥接未运行或未扫码：设置页「诊断 → 重新检测」 |
| 余额显示 `--` / 未配置 | 配 `DEEPSEEK_API_KEY`，或在 DSH「账号与余额」登录 |

## 六、完成标准

- [ ] `node scripts/setup-dsh.mjs` 退出码 0
- [ ] `~/.dsh/profiles/<profile>/package.json` 的 bundles 只有 `dsh-dfy`
- [ ] 重启后 `widget.js` 返回 200/401
- [ ] SnowLuma 已安装；QQ 已扫码登录（或已明确告诉用户去扫）
