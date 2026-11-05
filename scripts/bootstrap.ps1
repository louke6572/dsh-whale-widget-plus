# dsh-Dfy 一键安装（Windows PowerShell）
#
# 普通用户（复制这一行到 PowerShell）：
#   powershell -ExecutionPolicy Bypass -c "irm https://raw.githubusercontent.com/louke6572/dsh-Dfy/main/scripts/bootstrap.ps1 | iex"
#
# 只装挂件/桌宠，不接 QQ（不装 SnowLuma）：
#   $env:DSHDFY_SKIP_SNOWLUMA = '1'; ... | iex
#
# 只检查环境、不安装：
#   ... | iex -Check
#
# 自定义安装位置：
#   $env:DSHDFY_DIR = 'D:\dsh-Dfy'; ... | iex

param(
  [switch]$Check
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function Say($m = '') { Write-Host $m }
function Ok($m) { Write-Host "  [OK] $m" -ForegroundColor Green }
function Bad($m) { Write-Host "  [!!] $m" -ForegroundColor Yellow }
function Step($n, $m) { Write-Host "`n=== $n. $m ===" -ForegroundColor Cyan }

Say '=============================================='
Say '  dsh-Dfy 一键安装'
Say '=============================================='

# ── 1. 环境 ────────────────────────────────────────────────────────────────
Step 1 '检查环境'
$nodeExe = ''
$node = Get-Command node -ErrorAction SilentlyContinue
if ($node) { $nodeExe = 'node' }
$runtimeRoot = Join-Path $env:USERPROFILE '.dsh\dsh-runtimes\dsh-primary-runtime\dependencies'
$bundledNode = Join-Path $runtimeRoot 'node\bin\node.exe'
$bundledPnpm = Join-Path $runtimeRoot 'pnpm\bin\pnpm.cjs'
if (-not $nodeExe -and (Test-Path $bundledNode)) {
  $nodeExe = $bundledNode
  Bad 'PATH 里没有 node，改用 DSH 自带的 Node'
}
if (-not $nodeExe) {
  Bad '没找到 Node.js。请先装 Node 22.13+： https://nodejs.org/'
  return
}
$nodeVer = (& $nodeExe -v).TrimStart('v')
$parts = $nodeVer.Split('.')
$okNode = ([int]$parts[0] -gt 22) -or (([int]$parts[0] -eq 22) -and ([int]$parts[1] -ge 13))
if ($okNode) { Ok "Node v$nodeVer" } else { Bad "Node v$nodeVer 太老（需要 >= 22.13）"; return }

$dshHome = if ($env:DSH_HOME) { $env:DSH_HOME } else { Join-Path $env:USERPROFILE '.dsh' }
$hasDsh = Test-Path (Join-Path $dshHome 'profiles')
if ($hasDsh) { Ok "DSH 配置目录：$dshHome" } else { Bad "没找到 DSH。请先安装 DeepSeek Harness 并打开一次（$dshHome）" }

$gitCmd = Get-Command git -ErrorAction SilentlyContinue
if ($gitCmd) { Ok 'git 可用' } else { Bad '没有 git，会改用 zip 下载（也能装）' }

if ($Check) { Say "`n仅检查模式，结束。"; return }

# ── 2. 下载代码 ────────────────────────────────────────────────────────────
Step 2 '下载 dsh-Dfy'
$Dir = if ($env:DSHDFY_DIR) { $env:DSHDFY_DIR } else { Join-Path $env:USERPROFILE 'dsh-Dfy' }
Say "  安装到：$Dir"

if (Test-Path (Join-Path $Dir 'package.json')) {
  Ok '目录已存在，执行更新'
  if ($gitCmd -and (Test-Path (Join-Path $Dir '.git'))) {
    Push-Location $Dir
    try { & git pull --ff-only 2>&1 | Out-Null; Ok 'git pull 完成' } catch { Bad 'git pull 失败（继续用现有版本）' }
    Pop-Location
  }
} elseif ($gitCmd) {
  & git clone --depth 1 https://github.com/louke6572/dsh-Dfy.git $Dir
  if ($LASTEXITCODE -ne 0) { Bad 'git clone 失败（检查网络/代理）'; return }
  Ok '克隆完成'
} else {
  $zip = Join-Path $env:TEMP 'dsh-Dfy-main.zip'
  Say '  下载 zip …'
  Invoke-WebRequest -Uri 'https://github.com/louke6572/dsh-Dfy/archive/refs/heads/main.zip' -OutFile $zip
  $tmp = Join-Path $env:TEMP ("dshdfy_" + [guid]::NewGuid().ToString('N'))
  Expand-Archive -LiteralPath $zip -DestinationPath $tmp -Force
  $src = Get-ChildItem $tmp -Directory | Select-Object -First 1
  Move-Item $src.FullName $Dir
  Ok '解压完成'
}

# ── 3. 依赖 ────────────────────────────────────────────────────────────────
Step 3 '安装依赖'
Push-Location $Dir
try {
  $npmCmd = Get-Command npm -ErrorAction SilentlyContinue
  if ($npmCmd) {
    & npm install --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) {
      Bad 'npm install 失败，改用国内镜像重试'
      & npm install --no-audit --no-fund --registry https://registry.npmmirror.com
    }
  } elseif (Test-Path $bundledPnpm) {
    Bad '没有 npm，改用 DSH 自带的 pnpm'
    & $nodeExe $bundledPnpm install
  } else {
    Bad '没有 npm 也没有 pnpm，请装 Node 22.13+ 后重试'
    return
  }
  if ($LASTEXITCODE -ne 0) { Bad '依赖安装失败；检查网络后重跑本命令'; return }
  Ok '依赖完成'
} finally { Pop-Location }

# ── 4. 装进 DSH ────────────────────────────────────────────────────────────
Step 4 '写进 DSH（profile / 预设 / MCP）'
Push-Location $Dir
try {
  & $nodeExe (Join-Path $Dir 'scripts\setup-dsh.mjs')
  if ($LASTEXITCODE -ne 0) {
    Bad "注册失败。可手动执行：cd `"$Dir`"; node scripts\setup-dsh.mjs"
    return
  }
  Ok '已注册'
} finally { Pop-Location }

# ── 5. 装 SnowLuma（接 QQ 才需要）──────────────────────────────────────────
Step 5 '安装 SnowLuma（QQ 运行时）'
if ($env:DSHDFY_SKIP_SNOWLUMA -eq '1') {
  Bad '已跳过（DSHDFY_SKIP_SNOWLUMA=1）：只装挂件/桌宠'
} else {
  Push-Location $Dir
  try {
    & $nodeExe (Join-Path $Dir 'scripts\install-snowluma.mjs') --no-launch
    if ($LASTEXITCODE -ne 0) {
      Bad 'SnowLuma 安装失败（可稍后在设置页「安装与维护」里装，或重跑 node scripts\install-snowluma.mjs）'
    } else {
      Ok 'SnowLuma 就绪'
    }
  } finally { Pop-Location }
}

# ── 6. 下一步 ──────────────────────────────────────────────────────────────
Step 6 '完成，只剩两步需要你'
Say ''
Say '  1) 完全退出 DSH（托盘图标也要退出），再打开'
Say '  2) 设置 → dsh-Dfy → 一键开始；第一次用 QQ 时在 SnowLuma 窗口扫码登录'
Say ''
Say "  安装目录：$Dir"
Say '  出问题：设置 → dsh-Dfy → 诊断 → 重新体检，把标 ✗ 的那一项发给我。'
Say ''
