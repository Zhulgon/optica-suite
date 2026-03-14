Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Parse-EnvFile([string]$path) {
  $map = @{}
  foreach ($line in Get-Content $path) {
    $trimmed = $line.Trim()
    if (-not $trimmed -or $trimmed.StartsWith("#")) { continue }
    $index = $trimmed.IndexOf("=")
    if ($index -lt 1) { continue }
    $key = $trimmed.Substring(0, $index).Trim()
    $value = $trimmed.Substring($index + 1).Trim()
    $map[$key] = $value
  }
  return $map
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$envFile = Join-Path $repoRoot ".env.lan"
if (-not (Test-Path $envFile)) {
  throw "No existe .env.lan. Ejecuta primero INSTALAR_LAN.cmd"
}

$envMap = if (Test-Path $envFile) { Parse-EnvFile -path $envFile } else { @{} }
$webUrl = if ($envMap.ContainsKey("WEB_APP_URL")) { $envMap["WEB_APP_URL"] } else { "http://localhost:8080" }
$apiUrl = if ($envMap.ContainsKey("VITE_API_URL")) { $envMap["VITE_API_URL"] } else { "http://localhost:3000" }

Push-Location $repoRoot
try {
  docker compose --env-file .env.lan -f docker-compose.lan.yml ps
} finally {
  Pop-Location
}

Write-Host ""
Write-Host "Web: $webUrl"
Write-Host "API: $apiUrl"

try {
  Invoke-WebRequest -Uri $webUrl -UseBasicParsing -TimeoutSec 5 | Out-Null
  Write-Host "WEB OK" -ForegroundColor Green
} catch {
  Write-Host "WEB FAIL" -ForegroundColor Red
}

try {
  Invoke-WebRequest -Uri "$apiUrl/health" -UseBasicParsing -TimeoutSec 5 | Out-Null
  Write-Host "API OK" -ForegroundColor Green
} catch {
  Write-Host "API FAIL" -ForegroundColor Red
}
