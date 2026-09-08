<#
  Arsu Atelier — one-time install on the shop laptop.

  Run this ONCE, from an Administrator PowerShell. Afterwards the tailor never
  needs a terminal: the app starts with Windows and he clicks an icon.

  Everything lives under one root folder, and the shop's DATA lives outside the
  app folder on purpose — updates replace the app, and must never be able to
  reach the database.

      C:\ArsuAtelier\
        app\        the code (git checkout; replaced by updates)
        data\       arsu.db — THE SHOP. Never touched by an update.
        backups\    automatic + pre-update copies
        logs\       server log

  Examples:
    .\setup.ps1 -Repo https://github.com/you/arsu-atelier.git -AllowTablet
    .\setup.ps1 -FromLocal C:\Users\you\Downloads\arsu-atelier
#>
[CmdletBinding()]
param(
  # Where everything is installed.
  [string]$Root = "C:\ArsuAtelier",

  # Clone the app from here. Use this if you want self-updates to work.
  [string]$Repo = "",

  # Or copy the app from a folder (a USB stick, say). No self-updates.
  [string]$FromLocal = "",

  [int]$Port = 3000,

  # Open the Windows firewall so the tablet on the shop wifi can reach it.
  [switch]$AllowTablet
)

$ErrorActionPreference = "Stop"

function Say([string]$m) { Write-Host "  $m" }
function Step([string]$m) { Write-Host "`n== $m" -ForegroundColor Cyan }
function Warn([string]$m) { Write-Host "  ! $m" -ForegroundColor Yellow }
function Die([string]$m) { Write-Host "`nSTOPPED: $m" -ForegroundColor Red; exit 1 }

Write-Host "`nArsu Atelier — shop laptop setup" -ForegroundColor White

# ── checks ────────────────────────────────────────────────────────────────
Step "Checking this machine"

$admin = ([Security.Principal.WindowsPrincipal] `
  [Security.Principal.WindowsIdentity]::GetCurrent()
).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $admin) {
  Die "Run this from an Administrator PowerShell. It needs to register a startup task and (optionally) a firewall rule."
}
Say "running as Administrator"

$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
  Die "Node.js is not installed. Install the Node 20 LTS MSI from https://nodejs.org first, then run this again."
}
$nodeExe = $nodeCmd.Source
$nodeMajor = [int]((& $nodeExe --version) -replace '^v(\d+).*', '$1')
Say "node $(& $nodeExe --version) at $nodeExe"
if ($nodeMajor -lt 20) { Die "Node 20 or newer is required. Found major version $nodeMajor." }
if ($nodeMajor -ge 22) {
  Warn "Node $nodeMajor detected. better-sqlite3 is pinned to 12.5.0 for Node 20; if npm ci fails to build it, see the README section 'Node version'."
}

if ($Repo -and -not (Get-Command git -ErrorAction SilentlyContinue)) {
  Die "git is not installed, but -Repo was given. Install Git for Windows, or use -FromLocal instead (no self-updates)."
}
if (-not $Repo -and -not $FromLocal) {
  Die "Give either -Repo <git url> (recommended, enables self-updates) or -FromLocal <folder>."
}

$app     = Join-Path $Root "app"
$data    = Join-Path $Root "data"
$backups = Join-Path $Root "backups"
$logs    = Join-Path $Root "logs"
$dbPath  = Join-Path $data "arsu.db"

# ── folders ───────────────────────────────────────────────────────────────
Step "Creating $Root"
foreach ($d in @($Root, $data, $backups, $logs)) {
  if (-not (Test-Path $d)) { New-Item -ItemType Directory -Path $d -Force | Out-Null }
}
Say "app / data / backups / logs ready"

if (Test-Path (Join-Path $app "package.json")) {
  Warn "$app already has an app in it. Leaving it alone — use scripts\update.ps1 to update instead."
} elseif ($Repo) {
  Step "Cloning the app"
  & git clone --depth 1 $Repo $app
  if ($LASTEXITCODE -ne 0) { Die "git clone failed." }
  Say "cloned from $Repo"
} else {
  Step "Copying the app from $FromLocal"
  if (-not (Test-Path (Join-Path $FromLocal "package.json"))) {
    Die "$FromLocal does not look like the app (no package.json)."
  }
  New-Item -ItemType Directory -Path $app -Force | Out-Null
  # Skip build output, dependencies and — above all — any dev database.
  robocopy $FromLocal $app /E /NFL /NDL /NJH /NJS /NP `
    /XD node_modules .next .git data backups | Out-Null
  Say "copied (without node_modules, .next, or any dev data)"
}

# ── build ─────────────────────────────────────────────────────────────────
Step "Installing dependencies (a few minutes)"
Push-Location $app
try {
  & npm ci
  if ($LASTEXITCODE -ne 0) { Die "npm ci failed. Scroll up for the reason." }
  Say "dependencies installed"

  Step "Building"
  $env:ARSU_DB_PATH = $dbPath
  & npm run build
  if ($LASTEXITCODE -ne 0) { Die "build failed. Scroll up for the reason." }
  Say "built"

  Step "Setting up the database"
  & npm run db:setup
  if ($LASTEXITCODE -ne 0) { Die "database setup failed. Nothing was started; the data folder is untouched." }
}
finally { Pop-Location }

# ── launcher ──────────────────────────────────────────────────────────────
Step "Writing the launcher"
$launcher = Join-Path $Root "start-arsu.cmd"
@"
@echo off
rem Started by the ArsuAtelier scheduled task. Do not run by hand.
set ARSU_DB_PATH=$dbPath
set NODE_ENV=production
cd /d "$app"
"$nodeExe" "node_modules\next\dist\bin\next" start -H 0.0.0.0 -p $Port >> "$logs\server.log" 2>&1
"@ | Set-Content -Path $launcher -Encoding ASCII
Say $launcher

# ── start with Windows ────────────────────────────────────────────────────
Step "Making it start with Windows"
$taskName = "ArsuAtelier"

if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) {
  Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
  Say "replaced the existing task"
}

$action  = New-ScheduledTaskAction -Execute $launcher
$trigger = New-ScheduledTaskTrigger -AtStartup
# Runs as SYSTEM so it is up before anyone logs in, and keeps trying if it dies.
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
$settings  = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) `
  -ExecutionTimeLimit ([TimeSpan]::Zero)

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger `
  -Principal $principal -Settings $settings `
  -Description "Arsu Atelier — client, measurement, order and billing app for the studio." | Out-Null
Say "scheduled task '$taskName' registered (at startup, as SYSTEM, restarts on failure)"

Start-ScheduledTask -TaskName $taskName
Say "started"

# ── firewall ──────────────────────────────────────────────────────────────
if ($AllowTablet) {
  Step "Opening the firewall for the shop wifi"
  $ruleName = "Arsu Atelier ($Port)"
  Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue |
    Remove-NetFirewallRule -ErrorAction SilentlyContinue
  New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Action Allow `
    -Protocol TCP -LocalPort $Port -Profile Private | Out-Null
  Say "port $Port allowed on Private networks only (not on public wifi)"
} else {
  Warn "Tablet access not set up. Re-run with -AllowTablet if you want it."
}

# ── desktop icon ──────────────────────────────────────────────────────────
Step "Making the desktop icon"
$url = "http://localhost:$Port"

$browser = $null
foreach ($candidate in @(
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe"
)) { if (Test-Path $candidate) { $browser = $candidate; break } }

$shell = New-Object -ComObject WScript.Shell
foreach ($dir in @(
  [Environment]::GetFolderPath("CommonDesktopDirectory"),
  (Join-Path $env:ProgramData "Microsoft\Windows\Start Menu\Programs")
)) {
  $lnk = $shell.CreateShortcut((Join-Path $dir "ARSU.lnk"))
  if ($browser) {
    # --app gives a plain window: no address bar, no tabs. It reads as a program.
    $lnk.TargetPath = $browser
    $lnk.Arguments  = "--app=$url"
  } else {
    $lnk.TargetPath = $url
  }
  $lnk.IconLocation = if ($browser) { "$browser,0" } else { "" }
  $lnk.Description  = "Arsu Atelier"
  $lnk.Save()
}
if ($browser) { Say "ARSU icon on the desktop and in the Start menu (opens as its own window)" }
else { Warn "Neither Edge nor Chrome found — the icon will open the default browser instead of an app window." }

# ── done ──────────────────────────────────────────────────────────────────
Step "Checking it answers"
$ok = $false
foreach ($i in 1..30) {
  Start-Sleep -Seconds 2
  try {
    $r = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 5 -MaximumRedirection 0 -ErrorAction Stop
    if ($r.StatusCode -eq 200) { $ok = $true; break }
  } catch {
    # A 307 is the PIN lock redirecting, which also means it is alive.
    if ($_.Exception.Response.StatusCode.value__ -in 200, 307) { $ok = $true; break }
  }
}

if ($ok) { Say "the app is answering on $url" }
else {
  Warn "no answer yet. Check $logs\server.log — the task is registered, so a reboot may sort it."
}

$ip = (Get-NetIPAddress -AddressFamily IPv4 |
  Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" } |
  Select-Object -First 1).IPAddress

Write-Host "`n─────────────────────────────────────────────" -ForegroundColor DarkGray
Write-Host "Done." -ForegroundColor Green
Write-Host "`n  On this laptop   : click the ARSU icon  ($url)"
if ($AllowTablet -and $ip) {
  Write-Host "  On the tablet    : http://$ip`:$Port"
  Write-Host "                     (bookmark it, then Add to Home Screen)"
}
Write-Host "  Database         : $dbPath"
Write-Host "  Backups          : $backups"
Write-Host "  Log              : $logs\server.log"
Write-Host "`nStill to do, in the app:" -ForegroundColor White
Write-Host "  1. Settings -> Shop PIN         set a PIN"
Write-Host "  2. Settings -> Garment types    set the real stitching rates"
Write-Host "  3. Settings -> Data             point Backup at a OneDrive folder"
Write-Host "  4. Settings -> Import           bring the old spreadsheet across"
Write-Host "─────────────────────────────────────────────`n" -ForegroundColor DarkGray
