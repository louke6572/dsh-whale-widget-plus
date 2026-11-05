# Stop the QQ bridge (optionally SnowLuma too).
#
# Usage:
#   powershell -File scripts\stop-qq-bot.ps1          # bridge only
#   powershell -File scripts\stop-qq-bot.ps1 -All     # bridge + SnowLuma
#
# NOTE (2026-10-22): this file is intentionally ASCII-only.
# It used to contain Chinese text; when saved as UTF-8 *without BOM*, Windows PowerShell 5.1
# decoded it as ANSI, quotes were eaten, and the whole script failed to parse
# (that broke "restart bridge on new DSH port" every time DSH restarted).
# Keep every byte ASCII here so no editor/encoding can break it again.
#
# Safety: the launcher (.bat file next to this repo) auto-restarts node when it dies, so kill the parent
# cmd window first, then node. Never kill by port alone: verify the process is node + bridge.js.
param([switch]$All, [int]$SnowLumaPort = 0)

$ErrorActionPreference = 'SilentlyContinue'
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$ConfigPath = Join-Path $RepoRoot 'config.json'
$LockPath = Join-Path $RepoRoot 'state\bridge.lock'

function Get-ConsolePort {
    $port = 3100
    if (Test-Path -LiteralPath $ConfigPath) {
        try {
            $cfg = Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json
            if ($cfg.consolePort) { $port = [int]$cfg.consolePort }
        } catch {}
    }
    return $port
}

function Get-ListenerPid([int]$port) {
    $c = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($c) { return [int]$c.OwningProcess }
    return $null
}

function Get-ProcessInfo([int]$targetPid) {
    return Get-CimInstance Win32_Process -Filter "ProcessId=$targetPid"
}

# Only node.exe whose command line contains bridge.js counts as the bridge.
function Test-IsBridge([int]$targetPid) {
    $p = Get-ProcessInfo $targetPid
    if (-not $p) { return $false }
    if ($p.Name -ine 'node.exe') { return $false }
    return ($p.CommandLine -match 'bridge\.js')
}

function Stop-WithParent([int]$targetPid, [string]$label) {
    $p = Get-ProcessInfo $targetPid
    if (-not $p) {
        Write-Host ("  {0}: process {1} already gone" -f $label, $targetPid)
        return $false
    }
    $parent = Get-ProcessInfo $p.ParentProcessId
    if ($parent -and $parent.Name -ieq 'cmd.exe' -and $parent.CommandLine -match 'bridge|start') {
        Stop-Process -Id $parent.ProcessId -Force
        Write-Host ("  {0}: closed its launcher window (cmd pid={1})" -f $label, $parent.ProcessId)
    }
    Stop-Process -Id $targetPid -Force
    Start-Sleep -Milliseconds 400
    $gone = -not (Get-ProcessInfo $targetPid)
    if ($gone) { Write-Host ("  {0}: stopped pid={1}" -f $label, $targetPid) }
    else { Write-Host ("  {0}: pid={1} may still be running" -f $label, $targetPid) }
    return $gone
}

Write-Output "== stop QQ bridge =="

$port = Get-ConsolePort
Write-Output ("  console port (config.json): {0}" -f $port)

$bridgeStopped = $false
$bridgePid = Get-ListenerPid $port
if ($bridgePid) {
    if (Test-IsBridge $bridgePid) {
        $bridgeStopped = [bool](Stop-WithParent $bridgePid 'bridge')
    } else {
        Write-Output ("  [!] port {0} is held by a non-bridge process (pid={1}); refusing to kill it." -f $port, $bridgePid)
    }
} else {
    Write-Output ("  bridge: nothing listening on {0}" -f $port)
    $bridgeStopped = $true   # not running still counts as stopped, so a stale lock can be cleaned
}

if ($bridgeStopped) {
    if (Test-Path -LiteralPath $LockPath) {
        Remove-Item -LiteralPath $LockPath -Force -ErrorAction SilentlyContinue
        Write-Output '  cleared stale bridge.lock'
    }
} else {
    Write-Output '  bridge not confirmed stopped: keeping bridge.lock (avoid double instance).'
}

if ($All) {
    # SnowLuma's listener port is not guaranteed to be 5100 across versions / custom builds.
    # Use -SnowLumaPort to override; when nothing listens on the default port, fall back to
    # matching the process by name instead of silently reporting "nothing to stop".
    $slPort = if ($SnowLumaPort -gt 0) { $SnowLumaPort } else { 5100 }
    $slPid = Get-ListenerPid $slPort
    if ($slPid) {
        $p = Get-ProcessInfo $slPid
        if ($p -and ($p.Name -imatch 'SnowLuma' -or $p.CommandLine -match 'SnowLuma')) {
            Stop-WithParent $slPid 'SnowLuma' | Out-Null
        } else {
            Write-Output ("  [!] port {0} is held by a non-SnowLuma process (pid={1}); refusing to kill it." -f $slPort, $slPid)
        }
    } else {
        $slProcs = @(Get-CimInstance Win32_Process | Where-Object {
            ($_.Name -imatch '^SnowLuma') -or ($_.CommandLine -match 'SnowLuma.*index\.mjs')
        })
        if ($slProcs.Count -gt 0) {
            foreach ($proc in $slProcs) {
                Stop-WithParent ([int]$proc.ProcessId) 'SnowLuma' | Out-Null
            }
        } else {
            Write-Output ("  SnowLuma: nothing listening on {0} and no SnowLuma process found" -f $slPort)
        }
    }
}

Start-Sleep -Milliseconds 800
$left = Get-ListenerPid $port
if ($left -and (Test-IsBridge $left)) {
    Write-Output ("[!] bridge still listening (pid={0}); retry or stop it manually" -f $left)
    exit 1
}

Write-Output '[OK] stopped'
if (-not $All) { Write-Output '  (QQ and SnowLuma are still running; use "stop-qq-bot.bat all" to stop everything)' }
exit 0
