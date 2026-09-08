<#
  Arsu Atelier — update the shop laptop to the latest pushed code.

  Safe by construction. The order of operations is the whole design:

      back up the database
      fetch, and stop if there is nothing new
      npm ci  ->  build        <- if either fails, the DATABASE IS UNTOUCHED
      migrate                  <- each migration is its own transaction
      restart, then health check
      any failure at all       ->  roll the code back and restart the old build

  Build before migrate, never the other way round. A failed build then costs
  nothing, because the schema has not moved. And migrations are additive
  (see db/migrations.ts), so if a rollback puts older code in front of a newer
  schema, the older code simply ignores the columns it does not know about.

  Run it yourself over Tailscale:
    .\update.ps1

  Or have the laptop check nightly:
    .\update.ps1 -InstallSchedule -At 02:30
#>
[CmdletBinding()]
param(
  [string]$Root = "C:\ArsuAtelier",
  [string]$Branch = "main",
  [int]$Port = 3000,

  # Register a daily task that runs this script, then exit.
  [switch]$InstallSchedule,
  [string]$At = "02:30",

  # Rebuild and restart even if git reports nothing new.
  [switch]$Force
)

$ErrorActionPreference = "Stop"

$app      = Join-Path $Root "app"
$data     = Join-Path $Root "data"
$backups  = Join-Path $Root "backups"
$logs     = Join-Path $Root "logs"
$dbPath   = Join-Path $data "arsu.db"
$logFile  = Join-Path $logs "update.log"
$taskName = "ArsuAtelier"
$url      = "http://localhost:$Port"

if (-not (Test-Path $logs)) { New-Item -ItemType Directory -Path $logs -Force | Out-Null }

function Log([string]$m, [string]$colour = "Gray") {
  $line = "[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $m
  Write-Host $line -ForegroundColor $colour
  Add-Content -Path $logFile -Value $line
}
function Fail([string]$m) { Log "FAILED: $m" "Red"; throw $m }

# ── schedule mode ─────────────────────────────────────────────────────────
if ($InstallSchedule) {
  $admin = ([Security.Principal.WindowsPrincipal] `
    [Security.Principal.WindowsIdentity]::GetCurrent()
  ).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
  if (-not $admin) { Fail "Run from an Administrator PowerShell to register the task." }

  $me = $PSCommandPath
  $name = "ArsuAtelierUpdate"
  if (Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $name -Confirm:$false
  }
  $action = New-ScheduledTaskAction -Execute "powershell.exe" `
    -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$me`" -Root `"$Root`" -Branch $Branch -Port $Port"
  $trigger = New-ScheduledTaskTrigger -Daily -At $At
  $principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
  $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable `
    -ExecutionTimeLimit (New-TimeSpan -Hours 1) -DontStopIfGoingOnBatteries
  Register-ScheduledTask -TaskName $name -Action $action -Trigger $trigger `
    -Principal $principal -Settings $settings `
    -Description "Checks for a new Arsu Atelier version once a day and updates, rolling back if anything fails." | Out-Null
  Log "nightly update task registered for $At" "Green"
  Log "log: $logFile"
  exit 0
}

# ── checks ────────────────────────────────────────────────────────────────
Log "=== update starting ===" "Cyan"

if (-not (Test-Path (Join-Path $app "package.json"))) { Fail "no app at $app" }
if (-not (Test-Path (Join-Path $app ".git")))         { Fail "$app is not a git checkout, so it cannot self-update. Re-install with -Repo, or update by copying files and running npm ci / npm run build / npm run db:setup by hand." }

Push-Location $app
try {
  $env:ARSU_DB_PATH = $dbPath

  $before = (& git rev-parse HEAD).Trim()
  Log "currently on $($before.Substring(0,8))"

  # ── 1. back up before anything ──────────────────────────────────────────
  if (Test-Path $dbPath) {
    Log "backing up the database"
    $env:ARSU_BACKUP_DIR = $backups
    & npx tsx scripts/backup-now.ts pre-update
    if ($LASTEXITCODE -ne 0) { Fail "could not back up the database — refusing to update" }
  }

  # ── 2. anything new? ────────────────────────────────────────────────────
  Log "fetching"
  & git fetch --quiet origin $Branch
  if ($LASTEXITCODE -ne 0) { Fail "git fetch failed (no network?)" }

  $after = (& git rev-parse "origin/$Branch").Trim()
  if ($after -eq $before -and -not $Force) {
    Log "already up to date — nothing to do" "Green"
    exit 0
  }
  Log "updating to $($after.Substring(0,8))"

  # ── 3. keep the working build so we can put it back ─────────────────────
  $next = Join-Path $app ".next"
  $prev = Join-Path $app ".next.prev"
  if (Test-Path $prev) { Remove-Item $prev -Recurse -Force }
  if (Test-Path $next) { Move-Item $next $prev }

  # ── 4. from here on, any failure rolls back ─────────────────────────────
  try {
    & git reset --hard "origin/$Branch" --quiet
    if ($LASTEXITCODE -ne 0) { Fail "git reset failed" }

    Log "installing dependencies"
    & npm ci --silent
    if ($LASTEXITCODE -ne 0) { Fail "npm ci failed" }

    Log "building"
    & npm run build
    if ($LASTEXITCODE -ne 0) { Fail "build failed" }

    # Only now, with a good build in hand, touch the database.
    Log "migrating the database"
    & npm run db:setup
    if ($LASTEXITCODE -ne 0) { Fail "migration failed" }

    Log "restarting"
    Stop-ScheduledTask  -TaskName $taskName -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 3
    Start-ScheduledTask -TaskName $taskName

    Log "checking it answers"
    $ok = $false
    foreach ($i in 1..20) {
      Start-Sleep -Seconds 2
      try {
        $r = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 5 -MaximumRedirection 0 -ErrorAction Stop
        if ($r.StatusCode -eq 200) { $ok = $true; break }
      } catch {
        if ($_.Exception.Response.StatusCode.value__ -in 200, 307) { $ok = $true; break }
      }
    }
    if (-not $ok) { Fail "the app did not come back up" }

    if (Test-Path $prev) { Remove-Item $prev -Recurse -Force }
    Log "=== updated to $($after.Substring(0,8)) ===" "Green"
  }
  catch {
    # ── rollback ──────────────────────────────────────────────────────────
    Log "rolling back to $($before.Substring(0,8))" "Yellow"
    try {
      & git reset --hard $before --quiet
      & npm ci --silent

      if (Test-Path $next) { Remove-Item $next -Recurse -Force }
      if (Test-Path $prev) { Move-Item $prev $next }
      else {
        Log "no previous build to restore — rebuilding the old version" "Yellow"
        & npm run build
      }

      Stop-ScheduledTask  -TaskName $taskName -ErrorAction SilentlyContinue
      Start-Sleep -Seconds 3
      Start-ScheduledTask -TaskName $taskName
      Log "rolled back; the shop is running the previous version" "Yellow"
    }
    catch {
      Log "ROLLBACK ALSO FAILED — the app may be down. Connect and fix it by hand." "Red"
      Log "  cd $app; git reset --hard $before; npm ci; npm run build; Start-ScheduledTask -TaskName $taskName" "Red"
    }
    Log "=== update failed ===" "Red"
    exit 1
  }
}
finally { Pop-Location }
