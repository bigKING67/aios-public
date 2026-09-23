param(
  [switch]$Force
)

$taskNameServer = "Prefect-Server-Groland"
$taskNameWorker = "Prefect-Worker-Groland"

Write-Host "Stopping Prefect tasks..." -ForegroundColor Yellow

# Stop worker first
$workerTask = Get-ScheduledTask -TaskName $taskNameWorker -ErrorAction SilentlyContinue
if ($workerTask -and $workerTask.State -eq 'Running') {
  Stop-ScheduledTask -TaskName $taskNameWorker
  Write-Host "  Stopped: $taskNameWorker" -ForegroundColor Green
} else {
  Write-Host "  $taskNameWorker is not running" -ForegroundColor Gray
}

# Then stop server
$serverTask = Get-ScheduledTask -TaskName $taskNameServer -ErrorAction SilentlyContinue
if ($serverTask -and $serverTask.State -eq 'Running') {
  Stop-ScheduledTask -TaskName $taskNameServer
  Write-Host "  Stopped: $taskNameServer" -ForegroundColor Green
} else {
  Write-Host "  $taskNameServer is not running" -ForegroundColor Gray
}

# Kill any remaining prefect processes if -Force
if ($Force) {
  Write-Host ""
  Write-Host "Force killing remaining prefect processes..." -ForegroundColor Yellow
  Get-Process | Where-Object { $_.ProcessName -match 'prefect|uvicorn' } | Stop-Process -Force -ErrorAction SilentlyContinue
  Write-Host "  Done" -ForegroundColor Green
}

Write-Host ""
Write-Host "Prefect services stopped." -ForegroundColor Cyan
Write-Host ""
Write-Host "To restart, run:" -ForegroundColor Gray
Write-Host "  Start-ScheduledTask -TaskName '$taskNameServer'"
Write-Host "  Start-ScheduledTask -TaskName '$taskNameWorker'"
