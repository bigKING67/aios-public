$ErrorActionPreference = "Stop"

$projectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$prefectHome = Join-Path $projectRoot ".prefect_home"
$logsDir = Join-Path $projectRoot ".prefect_logs"
New-Item -ItemType Directory -Path $prefectHome -Force | Out-Null
New-Item -ItemType Directory -Path $logsDir -Force | Out-Null

$env:PREFECT_HOME = $prefectHome
$env:PREFECT_API_URL = "http://127.0.0.1:4200/api"

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

$logFile = Join-Path $logsDir "prefect_server.log"
Write-Output "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') - Starting Prefect server..." | Tee-Object -FilePath $logFile -Append

& $uvPath run prefect server start --host 127.0.0.1 --port 4200 2>&1 | Tee-Object -FilePath $logFile -Append
