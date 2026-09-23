$ErrorActionPreference = "Stop"

$projectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$prefectHome = Join-Path $projectRoot ".prefect_home"
$logsDir = Join-Path $projectRoot ".prefect_logs"
New-Item -ItemType Directory -Path $prefectHome -Force | Out-Null
New-Item -ItemType Directory -Path $logsDir -Force | Out-Null

$env:PREFECT_HOME = $prefectHome
$env:PREFECT_API_URL = "http://127.0.0.1:4200/api"
if (-not $env:PGHOST) {
  $env:PGHOST = "127.0.0.1"
}
if (-not $env:PGPORT) {
  $env:PGPORT = "5432"
}
if (-not $env:PGUSER) {
  $env:PGUSER = "postgres"
}
if (-not $env:PGDATABASE) {
  $env:PGDATABASE = "postgres"
}
if (-not $env:PGPASSWORD) {
  throw "Missing env PGPASSWORD. Set it before starting worker."
}
if (-not $env:PGCONNECT_TIMEOUT) {
  $env:PGCONNECT_TIMEOUT = "20"
}
if (-not $env:PSQL_RETRY_ATTEMPTS) {
  $env:PSQL_RETRY_ATTEMPTS = "4"
}
if (-not $env:PSQL_RETRY_BACKOFF_SECONDS) {
  $env:PSQL_RETRY_BACKOFF_SECONDS = "3"
}
if (-not $env:PSQL_RETRY_BACKOFF_MAX_SECONDS) {
  $env:PSQL_RETRY_BACKOFF_MAX_SECONDS = "45"
}
if (-not $env:PSQL_RETRY_JITTER_MILLISECONDS) {
  $env:PSQL_RETRY_JITTER_MILLISECONDS = "900"
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

Set-Location $projectRoot

$logFile = Join-Path $logsDir "prefect_worker.log"

# Wait for server to be ready (max 60 seconds)
$maxWait = 60
$waited = 0
$serverReady = $false

Write-Output "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') - Waiting for Prefect server..." | Tee-Object -FilePath $logFile -Append

while ($waited -lt $maxWait) {
  try {
    $response = Invoke-WebRequest -Uri 'http://127.0.0.1:4200/api/health' -TimeoutSec 2 -UseBasicParsing -ErrorAction Stop
    if ($response.StatusCode -eq 200) {
      $serverReady = $true
      break
    }
  } catch {
    # Server not ready yet
  }
  Start-Sleep -Seconds 2
  $waited += 2
}

if (-not $serverReady) {
  Write-Output "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') - WARNING: Server not responding after ${maxWait}s, starting worker anyway..." | Tee-Object -FilePath $logFile -Append
} else {
  Write-Output "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') - Server ready, starting worker..." | Tee-Object -FilePath $logFile -Append
}

& $uvPath run prefect worker start --pool default-agent-pool 2>&1 | Tee-Object -FilePath $logFile -Append
