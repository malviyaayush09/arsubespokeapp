<#
  Arsu Atelier - update the shop laptop to the latest pushed code.

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

  KEEP THIS FILE PURE ASCII - see the longer note in setup.ps1. Windows
  PowerShell 5.1 reads a script with no byte-order mark in the system ANSI
  codepage, and an em dash then decodes to something it treats as a closing
  double quote, which breaks the parse of the entire file. This script runs
  unattended, where a parse error is a silent failure nobody is there to see.
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
  [switch]$Force,

  # Put the shop back up without updating anything: restore the snapshot a
  # half-finished update left behind, or rebuild from whatever is on disk.
  # Safe to run at any time, including when nothing is wrong.
  [switch]$Repair
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

<#
  npm ci DELETES node_modules before it reinstalls, so a failure halfway
  through does not leave the previous dependencies in place - it leaves
  nothing. On a shop wifi that drops, that turns one bad minute into an app
  that cannot start at all, and the error does not appear until the next
  restart: "Cannot find module ...\next\dist\bin\next".

  This happened. The rollback path called npm ci without checking its exit
  code, so a second failure went unnoticed, the script logged "rolled back;
  the shop is running the previous version", and the shop was in fact down
  until someone drove to it.

  So: retry, then PROVE the tree is usable by looking for the one binary the
  launcher actually executes. Returns $true only if the app could really start.
#>
<#
  Stop the app and make sure nothing is left holding its files.

  Stop-ScheduledTask kills the launcher, but the node process it started can
  survive and keep both port 3000 and the native .node binaries open - which
  is enough to make the next npm ci fail with EPERM. So the port is checked
  afterwards and anything still on it is ended.
#>
function Stop-App {
  Log "stopping the app"
  Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 3

  foreach ($pass in 1..5) {
    $held = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    if (-not $held) { break }
    foreach ($holder in ($held.OwningProcess | Sort-Object -Unique)) {
      Log "port $Port still held by process $holder - stopping it"
      Stop-Process -Id $holder -Force -ErrorAction SilentlyContinue
    }
    Start-Sleep -Seconds 2
  }
}

<# Ask the app whether it is back. A 307 is the PIN lock, which is a healthy
   answer: it means something is listening and routing. #>
function Wait-ForApp([int]$seconds = 60) {
  Log "checking it answers"
  foreach ($i in 1..([Math]::Ceiling($seconds / 2))) {
    Start-Sleep -Seconds 2
    try {
      $r = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 5 -MaximumRedirection 0 -ErrorAction Stop
      if ($r.StatusCode -eq 200) { return $true }
    } catch {
      if ($_.Exception.Response.StatusCode.value__ -in 200, 307) { return $true }
    }
  }
  return $false
}

function Npm-Ci([int]$attempts = 3) {
  for ($i = 1; $i -le $attempts; $i++) {
    if ($i -gt 1) {
      Log "npm ci attempt $i of $attempts (waiting 15s first)" "Yellow"
      Start-Sleep -Seconds 15
    }
    & npm ci --no-audit --no-fund
    if ($LASTEXITCODE -eq 0 -and (Test-Path (Join-Path $app "node_modules\next\dist\bin\next"))) {
      return $true
    }
    Log "npm ci did not leave a usable node_modules (exit $LASTEXITCODE)" "Yellow"
  }
  return $false
}

<#
  -- SURVIVING AN INTERRUPTION --------------------------------------------

  An update stops the app, moves the working build and the working
  dependencies aside, and only puts them back from its own catch block. That
  covers a command that fails. It does not cover the process simply ceasing
  to exist - a closed window, a Ctrl-C at the wrong moment, a laptop lid, a
  power cut - and then no catch runs, nothing is moved back, and the shop is
  left with no build at all. The startup task keeps restarting the app and it
  keeps dying with "Could not find a production build in the .next
  directory", which says nothing about an update to anyone reading it.

  That happened, mid npm ci, and the shop stayed down.

  A marker file is the fix, because it survives anything that kills a
  process. It is written before the first destructive step and removed only
  on success, so its presence on the next run means exactly one thing: a
  previous run did not finish. The next run - or -Repair, or the watchdog -
  then puts the snapshot back before doing anything else.

  The order matters: restore the DEPENDENCIES first, then the build. A build
  without dependencies cannot start, and the restore itself may need to run
  npm.
#>
$hold     = Join-Path $Root "previous"
$marker   = Join-Path $hold "INTERRUPTED.txt"
$next     = Join-Path $app ".next"
$prev     = Join-Path $hold "next-build"
$mods     = Join-Path $app "node_modules"
$modsPrev = Join-Path $hold "node_modules"

function Have-Build { Test-Path (Join-Path $next "BUILD_ID") }
function Have-Deps  { Test-Path (Join-Path $app "node_modules\next\dist\bin\next") }

function Mark-Started {
  if (-not (Test-Path $hold)) { New-Item -ItemType Directory -Path $hold -Force | Out-Null }
  Set-Content -Path $marker -Encoding ASCII -Value @(
    "An update was in progress and did not finish.",
    "Started: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')",
    "If this file is still here, the app may have no build.",
    "Fix it with:  update.ps1 -Repair"
  )
}
function Mark-Finished { Remove-Item $marker -Force -ErrorAction SilentlyContinue }

<#
  Put the shop back on its feet from whatever is lying around, in order of
  preference: the snapshot an interrupted update left, then a rebuild. Used
  by -Repair and by the recovery step at the start of every run.
#>
function Repair-App {
  Log "repairing: restoring what the last run left behind" "Yellow"
  Stop-App

  if (-not (Have-Deps) -and (Test-Path $modsPrev)) {
    if (Test-Path $mods) { Remove-Item $mods -Recurse -Force -ErrorAction SilentlyContinue }
    Move-Item $modsPrev $mods
    Log "restored the previous dependencies"
  }
  if (-not (Have-Deps)) {
    Log "no usable dependencies - reinstalling" "Yellow"
    if (-not (Npm-Ci)) { Fail "could not install dependencies - the app cannot start" }
  }

  if (-not (Have-Build) -and (Test-Path $prev)) {
    if (Test-Path $next) { Remove-Item $next -Recurse -Force -ErrorAction SilentlyContinue }
    Move-Item $prev $next
    Log "restored the previous build"
  }
  if (-not (Have-Build)) {
    <# Nothing to restore - the interruption landed during the build itself,
       so .next is missing or half written. Build what is on disk. #>
    Log "no build to restore - building what is on disk" "Yellow"
    if (Test-Path $next) { Remove-Item $next -Recurse -Force -ErrorAction SilentlyContinue }
    & npm run build
    if ($LASTEXITCODE -ne 0 -or -not (Have-Build)) { Fail "build failed - the app cannot start" }
  }

  <# The schema may be behind or ahead of the code now; db:setup is
     idempotent and additive, so running it here costs nothing and closes the
     case where the interruption happened between build and migrate. #>
  Log "checking the database"
  & npm run db:setup
  if ($LASTEXITCODE -ne 0) { Fail "database check failed" }

  Start-ScheduledTask -TaskName $taskName
  if (-not (Wait-ForApp)) { Fail "repaired, but the app is still not answering" }

  Mark-Finished
  Log "repaired; the shop is answering" "Green"
}

# -- schedule mode ---------------------------------------------------------
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

  <#
    Runs as the CURRENT USER, not SYSTEM, and this matters for a private repo:
    a git deploy key lives in that user's ~/.ssh, and SYSTEM has a different
    profile entirely - it would never find the key, and the nightly pull would
    fail every night with a permission error.

    S4U ("service for user") means it still runs when nobody is logged in, and
    without storing a password anywhere.
  #>
  $runAs = "$env:USERDOMAIN\$env:USERNAME"
  $principal = New-ScheduledTaskPrincipal -UserId $runAs -LogonType S4U -RunLevel Highest

  $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable `
    -ExecutionTimeLimit (New-TimeSpan -Hours 1) -DontStopIfGoingOnBatteries
  Register-ScheduledTask -TaskName $name -Action $action -Trigger $trigger `
    -Principal $principal -Settings $settings `
    -Description "Checks for a new Arsu Atelier version once a day and updates, rolling back if anything fails." | Out-Null

  Log "nightly update task registered for $At, running as $runAs" "Green"
  Log "if the repo is private, the deploy key must be in that user's ~/.ssh"
  Log "log: $logFile"
  exit 0
}

# -- checks ----------------------------------------------------------------
Log "=== update starting ===" "Cyan"

if (-not (Test-Path (Join-Path $app "package.json"))) { Fail "no app at $app" }
if (-not (Test-Path (Join-Path $app ".git")))         { Fail "$app is not a git checkout, so it cannot self-update. Re-install with -Repo, or update by copying files and running npm ci / npm run build / npm run db:setup by hand." }

Push-Location $app
try {
  $env:ARSU_DB_PATH = $dbPath

  <#
    -- 0. finish what a previous run started -------------------------------

    Before anything else, because an update that walks past a half-finished
    one would move an ALREADY MISSING build aside and overwrite the only
    snapshot that could have brought the shop back.

    The marker is the signal, not the state of the folders: a run killed
    between moving the build out and finishing the new one leaves a perfectly
    plausible-looking app folder with no .next in it.
  #>
  if ($Repair -or (Test-Path $marker)) {
    if (Test-Path $marker) {
      Log "a previous update did not finish - repairing before going on" "Yellow"
      Get-Content $marker | ForEach-Object { Log "  $_" "Yellow" }
    } else {
      Log "repair requested" "Cyan"
    }

    Repair-App

    if ($Repair) {
      Log "=== repair complete ===" "Green"
      exit 0
    }
    Log "repaired - carrying on with the update" "Cyan"
  }

  $before = (& git rev-parse HEAD).Trim()
  Log "currently on $($before.Substring(0,8))"

  # -- 1. back up before anything ------------------------------------------
  if (Test-Path $dbPath) {
    Log "backing up the database"
    $env:ARSU_BACKUP_DIR = $backups
    & npx tsx scripts/backup-now.ts pre-update
    if ($LASTEXITCODE -ne 0) { Fail "could not back up the database - refusing to update" }
  }

  # -- 2. anything new? ----------------------------------------------------
  Log "fetching"
  & git fetch --quiet origin $Branch
  if ($LASTEXITCODE -ne 0) { Fail "git fetch failed (no network?)" }

  $after = (& git rev-parse "origin/$Branch").Trim()
  if ($after -eq $before -and -not $Force) {
    Log "already up to date - nothing to do" "Green"
    exit 0
  }
  Log "updating to $($after.Substring(0,8))"

  <#
    -- 3. STOP THE APP BEFORE TOUCHING ITS DEPENDENCIES --------------------

    This is the step whose absence caused every failed update this app has
    ever had, and nine days of a dead shop.

    npm ci deletes node_modules before it reinstalls. Windows will not let
    anything delete a file that a running process has loaded, and a running
    Next.js server holds node_modules\@next\swc-win32-x64-msvc\*.node open.
    So npm deleted everything it could, hit that one file, and died with
    EPERM - leaving node_modules gutted and the app unable to start again.

    It failed in eight seconds, every single time, and looked enough like a
    network error to be mistaken for one.

    The shop is therefore offline for the couple of minutes an update takes.
    That is the correct trade: a chosen minute at a chosen hour, instead of
    an outage discovered when the tailor cannot open his app.
  #>
  Stop-App

  <#
    -- 4. keep the working build AND the working dependencies --------------

    Moving node_modules aside rather than letting npm ci delete it means a
    failed update can be undone by moving a folder back - instantly, with no
    network, and nothing that can go wrong a second time.

    BOTH SNAPSHOTS LIVE OUTSIDE THE APP FOLDER, and that is not tidiness.
    Keeping node_modules.prev inside it put a second complete copy of
    node_modules in the project, the build traced all of it - 12,620 files -
    and died with "JavaScript heap out of memory" halfway through an update.
    The same build is fine when they are kept next door.
  #>
  if (-not (Test-Path $hold)) { New-Item -ItemType Directory -Path $hold -Force | Out-Null }

  <# The marker goes down BEFORE anything is moved. From here until it is
     removed, the app may have no build, and the marker is the only thing
     that will still say so after this process is gone. #>
  Mark-Started

  if (Test-Path $prev) { Remove-Item $prev -Recurse -Force }
  if (Test-Path $next) { Move-Item $next $prev }

  if (Test-Path $modsPrev) { Remove-Item $modsPrev -Recurse -Force }
  if (Test-Path $mods) { Move-Item $mods $modsPrev }

  # -- 5. from here on, any failure rolls back -----------------------------
  try {
    & git reset --hard "origin/$Branch" --quiet
    if ($LASTEXITCODE -ne 0) { Fail "git reset failed" }

    Log "installing dependencies"
    if (-not (Npm-Ci)) { Fail "npm ci failed - dependencies are not usable" }

    Log "building"
    & npm run build
    if ($LASTEXITCODE -ne 0) { Fail "build failed" }

    # Only now, with a good build in hand, touch the database.
    Log "migrating the database"
    & npm run db:setup
    if ($LASTEXITCODE -ne 0) { Fail "migration failed" }

    Log "starting the app"
    Start-ScheduledTask -TaskName $taskName

    if (-not (Wait-ForApp)) { Fail "the app did not come back up" }

    <# Answering, so this run finished. The marker comes off BEFORE the
       snapshots are discarded: if clearing them fails, the worst case is a
       stale folder, not a false "interrupted" on the next run. #>
    Mark-Finished

    if (Test-Path $prev)     { Remove-Item $prev -Recurse -Force }
    if (Test-Path $modsPrev) { Remove-Item $modsPrev -Recurse -Force }
    Log "=== updated to $($after.Substring(0,8)) ===" "Green"
  }
  catch {
    # -- rollback ----------------------------------------------------------
    Log "rolling back to $($before.Substring(0,8))" "Yellow"
    try {
      # The app is already stopped, so nothing holds these folders open.
      Stop-App

      & git reset --hard $before --quiet

      <#
        Put the KNOWN-GOOD dependencies back by moving a folder, not by asking
        npm to fetch them again.

        The previous version of this script called npm ci here. Whatever broke
        the forward install - a file lock, a dropped connection - was usually
        still true a few seconds later, so the rollback failed for the same
        reason and left the shop with no dependencies at all. A move is
        instant, needs no network, and cannot half-succeed.
      #>
      if (Test-Path $modsPrev) {
        if (Test-Path $mods) { Remove-Item $mods -Recurse -Force -ErrorAction SilentlyContinue }
        Move-Item $modsPrev $mods
        Log "restored the previous dependencies"
      }
      if (-not (Test-Path (Join-Path $app "node_modules\next\dist\bin\next"))) {
        Log "no usable dependencies to restore - reinstalling" "Yellow"
        if (-not (Npm-Ci)) {
          Fail "rollback could not reinstall dependencies - THE APP CANNOT START"
        }
      }

      if (Test-Path $next) { Remove-Item $next -Recurse -Force }
      if (Test-Path $prev) { Move-Item $prev $next }
      else {
        Log "no previous build to restore - rebuilding the old version" "Yellow"
        & npm run build
        if ($LASTEXITCODE -ne 0) { Fail "rebuild of the old version failed" }
      }

      Start-ScheduledTask -TaskName $taskName

      # Never claim a rollback worked without asking the app.
      if (-not (Wait-ForApp)) { Fail "rolled back, but the app is still not answering" }

      Mark-Finished
      Log "rolled back; the shop is running the previous version and answering" "Yellow"
    }
    catch {
      Log "ROLLBACK FAILED - THE SHOP IS DOWN. Connect and fix it by hand, now." "Red"
      Log "  Try this first, it does all of the below:" "Red"
      Log "  update.ps1 -Repair" "Red"
      Log "  cd $app" "Red"
      Log "  git reset --hard $before" "Red"
      Log "  npm ci          (check node_modules\next exists afterwards)" "Red"
      Log "  npm run build" "Red"
      Log "  Stop-ScheduledTask -TaskName $taskName; Start-ScheduledTask -TaskName $taskName" "Red"
    }
    Log "=== update failed ===" "Red"
    exit 1
  }
}
finally {
  <#
    Ctrl-C lands here. PowerShell runs a finally block when a script is
    interrupted from the keyboard, so this is the one kind of interruption
    that can still be cleaned up in the moment rather than on the next run.

    Anything more violent - the window closed, the lid shut, the power out -
    runs nothing at all, which is exactly why the marker file exists. This
    block is the courtesy; the marker is the guarantee.
  #>
  if (Test-Path $marker) {
    Log "" "Yellow"
    Log "INTERRUPTED. The app may have no build right now." "Yellow"
    try {
      Repair-App
    } catch {
      Log "could not repair automatically. Run this, and it will finish the job:" "Red"
      Log "  powershell -NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`" -Repair" "Red"
    }
  }
  Pop-Location
}
