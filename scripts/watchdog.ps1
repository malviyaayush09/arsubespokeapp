<#
  Arsu Atelier - keep the app running, and leave a record when it does not.

  The startup task is set to retry three times and then give up. That is what
  left the shop dead for days: node could not start, the task exhausted its
  retries before anyone was awake, and the only symptom the tailor ever saw
  was "localhost refused to connect".

  This runs every 15 minutes, asks the app whether it is alive, and restarts
  it if not. It cannot fix a broken install - a missing node_modules still
  needs a person - but a log full of restart attempts is a very loud signal,
  and most outages are just a process that died.

  Install it once, from an Administrator PowerShell:

    .\watchdog.ps1 -Install

  Check on it:

    Get-Content C:\ArsuAtelier\logs\watchdog.log -Tail 30

  KEEP THIS FILE PURE ASCII - see the note in setup.ps1. Windows PowerShell
  5.1 reads a script with no byte-order mark in the system ANSI codepage, and
  an em dash then decodes to something it treats as a closing double quote,
  which breaks the parse of the whole file.
#>
[CmdletBinding()]
param(
  [string]$Root = "C:\ArsuAtelier",
  [int]$Port = 3000,

  # Register the scheduled task instead of running a check.
  [switch]$Install,

  # How often the task runs, in minutes.
  [int]$EveryMinutes = 15
)

$ErrorActionPreference = "Stop"

$logs     = Join-Path $Root "logs"
$logFile  = Join-Path $logs "watchdog.log"
$url      = "http://localhost:$Port/api/health"
$taskName = "ArsuAtelier"
$selfName = "ArsuAtelierWatchdog"

if (-not (Test-Path $logs)) { New-Item -ItemType Directory -Path $logs -Force | Out-Null }

function Log([string]$m, [string]$colour = "Gray") {
  $line = "[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $m
  Write-Host $line -ForegroundColor $colour
  Add-Content -Path $logFile -Value $line
}

# -- install mode ----------------------------------------------------------
if ($Install) {
  $admin = ([Security.Principal.WindowsPrincipal] `
    [Security.Principal.WindowsIdentity]::GetCurrent()
  ).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
  if (-not $admin) {
    Log "Run this from an Administrator PowerShell - it registers a task that controls another task." "Red"
    exit 1
  }

  if (Get-ScheduledTask -TaskName $selfName -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $selfName -Confirm:$false
  }

  $me = $PSCommandPath
  $action = New-ScheduledTaskAction -Execute "powershell.exe" `
    -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$me`" -Root `"$Root`" -Port $Port"

  # Starts a few minutes after boot, then every 15 minutes forever. The delay
  # matters: the app itself takes ten to twenty seconds to be ready, and a
  # watchdog that panics during startup would fight the thing it is guarding.
  $trigger = New-ScheduledTaskTrigger -AtStartup
  $trigger.Delay = "PT3M"
  $repeat = New-ScheduledTaskTrigger -Once -At (Get-Date).Date.AddMinutes(1) `
    -RepetitionInterval (New-TimeSpan -Minutes $EveryMinutes)

  # SYSTEM, because it has to be able to stop and start a SYSTEM task, and it
  # needs nothing from the network or from anyone's profile.
  $principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
  $settings  = New-ScheduledTaskSettingsSet -StartWhenAvailable `
    -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 10) `
    -MultipleInstances IgnoreNew

  Register-ScheduledTask -TaskName $selfName -Action $action `
    -Trigger @($trigger, $repeat) -Principal $principal -Settings $settings `
    -Description "Checks every $EveryMinutes minutes that Arsu Atelier is answering, and restarts it if not." | Out-Null

  Log "watchdog registered: every $EveryMinutes minutes, checking $url" "Green"
  Log "log: $logFile"
  exit 0
}

# -- check mode ------------------------------------------------------------
function Answering {
  try {
    $r = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 10 -ErrorAction Stop
    return $r.StatusCode -eq 200
  } catch {
    # Any answer at all means a server is listening, which is what is being
    # asked here. A 500 is a different problem and not one a restart fixes.
    $code = $_.Exception.Response.StatusCode.value__
    return ($null -ne $code)
  }
}

if (Answering) {
  # Deliberately silent on the happy path. A log that writes a line every 15
  # minutes is a log nobody reads, and the whole point is that the unusual
  # entries are visible.
  exit 0
}

Log "no answer on $url - restarting" "Yellow"

try {
  Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 3

  # Stopping the task kills the launcher but can leave the node process behind
  # holding the port, and then the restart dies with EADDRINUSE and the app
  # never comes back. Clear the port before starting.
  # NOT $pid - that is a read-only automatic variable holding this script's own
  # process id, and assigning to it throws at runtime in the one branch that
  # has to work.
  $held = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
  foreach ($holder in ($held.OwningProcess | Sort-Object -Unique)) {
    Log "port $Port still held by process $holder - stopping it"
    Stop-Process -Id $holder -Force -ErrorAction SilentlyContinue
  }
  Start-Sleep -Seconds 2

  Start-ScheduledTask -TaskName $taskName
}
catch {
  Log "could not restart the task: $($_.Exception.Message)" "Red"
  exit 1
}

# Give it a chance, then say plainly whether it worked.
$back = $false
foreach ($i in 1..20) {
  Start-Sleep -Seconds 3
  if (Answering) { $back = $true; break }
}

if ($back) {
  Log "restarted and answering again" "Green"
  exit 0
}

<#
  A restart did not help, so the app is not merely stopped - it cannot start.
  The commonest cause by far is an update that was interrupted: the build was
  moved aside and never put back, and every restart dies with "Could not find
  a production build in the .next directory". Restarting that forever is no
  use to anyone.

  update.ps1 -Repair puts the snapshot back, or rebuilds if there is nothing
  to put back. It is safe when nothing is wrong, so trying it costs a few
  minutes of a shop that is already down.
#>
$updater = Join-Path $PSScriptRoot "update.ps1"
if (Test-Path $updater) {
  Log "a restart did not fix it - trying a repair" "Yellow"
  & powershell -NoProfile -ExecutionPolicy Bypass -File $updater -Root $Root -Port $Port -Repair
  if ($LASTEXITCODE -eq 0 -and (Answering)) {
    Log "repaired and answering again" "Green"
    exit 0
  }
  Log "the repair did not fix it either" "Red"
}

# This is the line that matters. A human has to look.
Log "STILL DOWN after a restart and a repair. This needs a person." "Red"
Log "  Get-Content $logs\server.log -Tail 40" "Red"
exit 1
