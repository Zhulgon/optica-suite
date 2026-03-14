Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$envFile = Join-Path $repoRoot ".env.lan"
if (-not (Test-Path $envFile)) {
  throw "No existe .env.lan. Ejecuta primero INSTALAR_LAN.cmd"
}

Push-Location $repoRoot
try {
  docker compose --env-file .env.lan -f docker-compose.lan.yml up -d
  docker compose --env-file .env.lan -f docker-compose.lan.yml ps
} finally {
  Pop-Location
}

Write-Host ""
Write-Host "Servicios LAN iniciados." -ForegroundColor Green
