param(
  [string]$ProjectRoot = "$PSScriptRoot\..",
  [string]$HostAddress = "127.0.0.1",
  [int]$Port = 4200
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

Set-Location $ProjectRoot

& $uvPath run prefect server start --host $HostAddress --port $Port
