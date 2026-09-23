param(
  [string]$ProjectRoot = "$PSScriptRoot\..",
  [switch]$Uninstall
)

$ErrorActionPreference = "Stop"

$taskNameServer = "Prefect-Server-Groland"
$taskNameWorker = "Prefect-Worker-Groland"

if ($Uninstall) {
  Write-Host "Removing scheduled tasks..."
  Unregister-ScheduledTask -TaskName $taskNameServer -Confirm:$false -ErrorAction SilentlyContinue
  Unregister-ScheduledTask -TaskName $taskNameWorker -Confirm:$false -ErrorAction SilentlyContinue
  Write-Host "Done."
  exit 0
}

$uvPath = $env:UV_BIN
if (-not $uvPath) {
  $uvPath = "uv"
}

$uvCommand = Get-Command $uvPath -ErrorAction SilentlyContinue
if ($uvCommand) {
  $uvPath = $uvCommand.Source
}
if (-not $uvCommand -and -not (Test-Path $uvPath)) {
  throw "uv executable not found: $uvPath"
}

$prefectHome = Join-Path $ProjectRoot ".prefect_home"
$logsDir = Join-Path $ProjectRoot ".prefect_logs"

New-Item -ItemType Directory -Path $prefectHome -Force | Out-Null
New-Item -ItemType Directory -Path $logsDir -Force | Out-Null

# Server task
$serverScript = @"
`$env:PREFECT_HOME = '$prefectHome'
`$env:PREFECT_API_URL = 'http://127.0.0.1:4200/api'
Set-Location '$ProjectRoot'
& '$uvPath' run prefect server start --host 127.0.0.1 --port 4200
"@

$serverScriptPath = Join-Path $ProjectRoot "scripts\_run_prefect_server.ps1"
$serverScript | Out-File -FilePath $serverScriptPath -Encoding UTF8

# Worker task
$workerScript = @"
`$env:PREFECT_HOME = '$prefectHome'
`$env:PREFECT_API_URL = 'http://127.0.0.1:4200/api'
if (-not `$env:PGHOST) { `$env:PGHOST = '127.0.0.1' }
if (-not `$env:PGPORT) { `$env:PGPORT = '5432' }
if (-not `$env:PGUSER) { `$env:PGUSER = 'postgres' }
if (-not `$env:PGDATABASE) { `$env:PGDATABASE = 'postgres' }
if (-not `$env:PGPASSWORD) { throw 'Missing env PGPASSWORD. Set it before starting worker.' }
`$env:PGCONNECT_TIMEOUT = '20'
`$env:PSQL_RETRY_ATTEMPTS = '4'
`$env:PSQL_RETRY_BACKOFF_SECONDS = '3'
`$env:PSQL_RETRY_BACKOFF_MAX_SECONDS = '45'
`$env:PSQL_RETRY_JITTER_MILLISECONDS = '900'
Set-Location '$ProjectRoot'
Start-Sleep -Seconds 20
& '$uvPath' run prefect worker start --pool default-agent-pool
"@

$workerScriptPath = Join-Path $ProjectRoot "scripts\_run_prefect_worker.ps1"
$workerScript | Out-File -FilePath $workerScriptPath -Encoding UTF8

# Create scheduled tasks
$pwshPath = "C:\Program Files\PowerShell\7\pwsh.exe"

# Remove existing tasks
Unregister-ScheduledTask -TaskName $taskNameServer -Confirm:$false -ErrorAction SilentlyContinue
Unregister-ScheduledTask -TaskName $taskNameWorker -Confirm:$false -ErrorAction SilentlyContinue

# Server task - run at startup
$serverAction = New-ScheduledTaskAction -Execute $pwshPath -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$serverScriptPath`""
$serverTrigger = New-ScheduledTaskTrigger -AtStartup
$serverSettings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
$serverPrincipal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType S4U -RunLevel Highest

Register-ScheduledTask -TaskName $taskNameServer -Action $serverAction -Trigger $serverTrigger -Settings $serverSettings -Principal $serverPrincipal -Description "Prefect Server for Groland ETL"

# Worker task - run at startup (delayed)
$workerAction = New-ScheduledTaskAction -Execute $pwshPath -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$workerScriptPath`""
$workerTrigger = New-ScheduledTaskTrigger -AtStartup
$workerSettings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
$workerPrincipal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType S4U -RunLevel Highest

Register-ScheduledTask -TaskName $taskNameWorker -Action $workerAction -Trigger $workerTrigger -Settings $workerSettings -Principal $workerPrincipal -Description "Prefect Worker for Groland ETL"

Write-Host ""
Write-Host "Scheduled tasks created successfully!" -ForegroundColor Green
Write-Host "  - $taskNameServer"
Write-Host "  - $taskNameWorker"
Write-Host ""
Write-Host "Starting tasks now..."

Start-ScheduledTask -TaskName $taskNameServer
Start-Sleep -Seconds 5
Start-ScheduledTask -TaskName $taskNameWorker

Write-Host ""
Write-Host "Tasks started. Check status with:" -ForegroundColor Cyan
Write-Host "  Get-ScheduledTask -TaskName 'Prefect-*-Groland'"
Write-Host ""
Write-Host "View Prefect UI at: http://127.0.0.1:4200" -ForegroundColor Cyan
