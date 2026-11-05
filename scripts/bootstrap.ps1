# dsh-Dfy 一键安装（Windows PowerShell）
#
# ⚠️ 本文件必须保存为 **UTF-8 with BOM**：Windows PowerShell 5.1 在没有 BOM 时会按 ANSI
#    解码，中文注释/横幅会变成乱码甚至让脚本解析失败（`powershell -File scripts\bootstrap.ps1`
#    这条本地执行路径；`irm ... | iex` 走的是已解码的字符串，不受影响）。
#
# 普通用户（复制这一行到 PowerShell）：
#   powershell -ExecutionPolicy Bypass -c "irm https://raw.githubusercontent.com/louke6572/dsh-Dfy/main/scripts/bootstrap.ps1 | iex"
#
# 只装挂件/桌宠，不接 QQ（不装 SnowLuma）：
#   $env:DSHDFY_SKIP_SNOWLUMA = '1'; ... | iex
#
# 只检查环境、不安装（⚠️ 管道进 iex 时无法传 -Check；用环境变量）：
#   $env:DSHDFY_CHECK = '1'; ... | iex
#
# 自定义安装位置：
#   $env:DSHDFY_DIR = 'D:\dsh-Dfy'; ... | iex

param(
  [switch]$Check
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

# 失败必须让**退出码**也是失败：AGENT.md / README 把「退出码 0」当作安装成功的判据，
# 而管道进 iex 的脚本里 `return` 只结束脚本块、退出码仍是 0（2026-11 审查修复）。
function Fail($m) {
  Write-Host "  [!!] $m" -ForegroundColor Yellow
  Write-Host ''
  Write-Host '安装未完成。按上面的提示修好后重跑同一条命令（已完成的步骤会跳过/复用）。' -ForegroundColor Yellow
  exit 1
}

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
  Fail '没找到 Node.js。请先装 Node 22.13+： https://nodejs.org/'
}
$nodeVer = (& $nodeExe -v 2>$null | Out-String).Trim().TrimStart('v')
$parts = $nodeVer.Split('.')
$major = 0; $minor = 0
$parsed = [int]::TryParse($parts[0], [ref]$major) -and $parts.Length -gt 1 -and [int]::TryParse($parts[1], [ref]$minor)
$okNode = $parsed -and (($major -gt 22) -or (($major -eq 22) -and ($minor -ge 13)))
if (-not $okNode) { Fail "Node v$nodeVer 太老或无法识别（需要 >= 22.13）" }
Ok "Node v$nodeVer"

$dshHome = if ($env:DSH_HOME) { $env:DSH_HOME } else { Join-Path $env:USERPROFILE '.dsh' }
$hasDsh = Test-Path (Join-Path $dshHome 'profiles')
if ($hasDsh) { Ok "DSH 配置目录：$dshHome" } else { Bad "没找到 DSH。请先安装 DeepSeek Harness 并打开一次（$dshHome）" }

$gitCmd = Get-Command git -ErrorAction SilentlyContinue
if ($gitCmd) { Ok 'git 可用' } else { Bad '没有 git，会改用 zip 下载（也能装）' }

$checkOnly = $Check -or ($env:DSHDFY_CHECK -eq '1')
if ($checkOnly) { Say "`n仅检查模式，结束。"; exit 0 }

# ── 2. 下载代码 ────────────────────────────────────────────────────────────
Step 2 '下载 dsh-Dfy'
$Dir = if ($env:DSHDFY_DIR) { $env:DSHDFY_DIR } else { Join-Path $env:USERPROFILE 'dsh-Dfy' }
Say "  安装到：$Dir"

# 目录已存在但不像 dsh-Dfy（没有 package.json）：zip 分支里 Move-Item 会把它挪成**子目录**，
# 结果装出来的路径和打印的不一样。宁可让人先处理，也不静默装错位置。
if ((Test-Path $Dir) -and -not (Test-Path (Join-Path $Dir 'package.json'))) {
  Fail "安装目录已存在但不是 dsh-Dfy：$Dir。请移走/改名它，或用 `$env:DSHDFY_DIR 指定别的目录。"
}

if (Test-Path (Join-Path $Dir 'package.json')) {
  Ok '目录已存在，执行更新'
  if ($gitCmd -and (Test-Path (Join-Path $Dir '.git'))) {
    Push-Location $Dir
    try {
      # 不要 `2>&1`：PowerShell 5.1 + $ErrorActionPreference='Stop' 会把 git 的 stderr
      # 包装成 ErrorRecord 并抛出（pull 成功也显示失败）。用 $LASTEXITCODE 判成败。
      & git pull --ff-only 2>$null | Out-Null
      if ($LASTEXITCODE -eq 0) { Ok 'git pull 完成' } else { Bad 'git pull 失败（继续用现有版本）' }
    } finally { Pop-Location }
  }
} elseif ($gitCmd) {
  & git clone --depth 1 https://github.com/louke6572/dsh-Dfy.git $Dir
  if ($LASTEXITCODE -ne 0) { Fail 'git clone 失败（检查网络/代理）' }
  Ok '克隆完成'
} else {
  $zip = Join-Path $env:TEMP 'dsh-Dfy-main.zip'
  Say '  下载 zip …'
  Invoke-WebRequest -Uri 'https://github.com/louke6572/dsh-Dfy/archive/refs/heads/main.zip' -OutFile $zip
  $tmp = Join-Path $env:TEMP ("dshdfy_" + [guid]::NewGuid().ToString('N'))
  Expand-Archive -LiteralPath $zip -DestinationPath $tmp -Force
  $src = Get-ChildItem $tmp -Directory | Select-Object -First 1
  if (-not $src) { Fail "zip 解压后没有目录（$tmp）" }
  $parent = Split-Path -Parent $Dir
  if ($parent -and -not (Test-Path $parent)) { New-Item -ItemType Directory -Force -Path $parent | Out-Null }
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
    Fail '没有 npm 也没有 pnpm，请装 Node 22.13+ 后重试'
  }
  if ($LASTEXITCODE -ne 0) { Fail '依赖安装失败；检查网络后重跑本命令（已下载的代码会复用）' }
  Ok '依赖完成'
} finally { Pop-Location }

# ── 4. 装进 DSH ────────────────────────────────────────────────────────────
Step 4 '写进 DSH（profile / 预设 / MCP）'
Push-Location $Dir
try {
  & $nodeExe (Join-Path $Dir 'scripts\setup-dsh.mjs')
  if ($LASTEXITCODE -ne 0) {
    Fail "注册失败。可手动执行：cd `"$Dir`"; node scripts\setup-dsh.mjs"
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
