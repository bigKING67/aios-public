param(
  [string]$ProjectRoot = "$PSScriptRoot\..",
  [string]$PoolName = "default-agent-pool",
  [string]$HostAddress = "127.0.0.1",
  [int]$Port = 4200,
  [int]$ServerWaitSeconds = 15
)

$ErrorActionPreference = "Stop"

$uvPath = $env:UV_BIN
if (-not $uvPath) {
  $uvPath = "uv"
}

if (-not (Test-Path $ProjectRoot)) {
  throw "Project root not found: $ProjectRoot"
}

$uvCommand = Get-Command $uvPath -ErrorAction SilentlyContinue
if ($uvCommand) {
  $uvPath = $uvCommand.Source
}

$prefectHome = Join-Path $ProjectRoot ".prefect_home"

if (-not $uvCommand -and -not (Test-Path $uvPath)) {
  throw "uv executable not found: $uvPath"
}

New-Item -ItemType Directory -Path $prefectHome -Force | Out-Null

$env:PREFECT_HOME = $prefectHome
$env:PREFECT_API_URL = "http://$HostAddress`:$Port/api"

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

$env:PGCONNECT_TIMEOUT = "20"
$env:PSQL_RETRY_ATTEMPTS = "4"
$env:PSQL_RETRY_BACKOFF_SECONDS = "3"
$env:PSQL_RETRY_BACKOFF_MAX_SECONDS = "45"
$env:PSQL_RETRY_JITTER_MILLISECONDS = "900"

Set-Location $ProjectRoot

Start-Sleep -Seconds $ServerWaitSeconds

& $uvPath run prefect worker start --pool $PoolName
