Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Write-Step([string]$message) {
  Write-Host ""
  Write-Host "==> $message" -ForegroundColor Cyan
}

function Ensure-Command([string]$name) {
  if (-not (Get-Command $name -ErrorAction SilentlyContinue)) {
    throw "No se encontro el comando '$name'. Instala el requisito y reintenta."
  }
}

function Get-LocalIPv4 {
  try {
    $candidate = Get-NetIPAddress -AddressFamily IPv4 |
      Where-Object {
        $_.IPAddress -ne "127.0.0.1" -and
        $_.IPAddress -notlike "169.254.*" -and
        $_.InterfaceAlias -notmatch "Loopback|Docker|vEthernet|WSL|Virtual"
      } |
      Select-Object -First 1 -ExpandProperty IPAddress
    if ($candidate) { return $candidate }
  } catch {
    # fallback below
  }

  $fallback = (ipconfig | Select-String -Pattern "IPv4").Line |
    ForEach-Object {
      ($_ -split ":")[-1].Trim()
    } |
    Where-Object { $_ -match "^\d{1,3}(\.\d{1,3}){3}$" -and $_ -ne "127.0.0.1" } |
    Select-Object -First 1
  if ($fallback) { return $fallback }
  return $null
}

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

function Set-EnvKey([string]$path, [string]$key, [string]$value) {
  $lines = Get-Content $path
  $updated = $false
  for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i] -match "^\s*$key\s*=") {
      $lines[$i] = "$key=$value"
      $updated = $true
      break
    }
  }
  if (-not $updated) {
    $lines += "$key=$value"
  }
  Set-Content -Path $path -Value $lines -Encoding UTF8
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$envFile = Join-Path $repoRoot ".env.lan"
$envExample = Join-Path $repoRoot ".env.lan.example"

Write-Step "Validando requisitos"
Ensure-Command "docker"

Write-Step "Validando Docker Compose"
docker compose version | Out-Null

if (-not (Test-Path $envFile)) {
  Write-Step "Creando .env.lan desde plantilla"
  Copy-Item -Path $envExample -Destination $envFile

  $detectedIp = Get-LocalIPv4
  if ($detectedIp) {
    Write-Step "IP local detectada: $detectedIp"
    Set-EnvKey -path $envFile -key "LAN_SERVER_IP" -value $detectedIp
    Set-EnvKey -path $envFile -key "WEB_APP_URL" -value "http://$detectedIp`:8080"
    Set-EnvKey -path $envFile -key "CORS_ORIGINS" -value "http://$detectedIp`:8080"
    Set-EnvKey -path $envFile -key "VITE_API_URL" -value "http://$detectedIp`:3000"
  } else {
    Write-Warning "No se pudo detectar IP local automaticamente. Edita .env.lan manualmente."
  }
}

$envMap = Parse-EnvFile -path $envFile
$webUrl = if ($envMap.ContainsKey("WEB_APP_URL")) { $envMap["WEB_APP_URL"] } else { "http://localhost:8080" }
$apiUrl = if ($envMap.ContainsKey("VITE_API_URL")) { $envMap["VITE_API_URL"] } else { "http://localhost:3000" }

Write-Step "Levantando servicios LAN (esto puede tardar varios minutos)"
Push-Location $repoRoot
try {
  docker compose --env-file .env.lan -f docker-compose.lan.yml up -d --build
} finally {
  Pop-Location
}

Write-Step "Estado de servicios"
Push-Location $repoRoot
try {
  docker compose --env-file .env.lan -f docker-compose.lan.yml ps
} finally {
  Pop-Location
}

Write-Host ""
Write-Host "Instalacion LAN completada." -ForegroundColor Green
Write-Host "Acceso web: $webUrl"
Write-Host "API:        $apiUrl"
Write-Host ""
Write-Host "Usuarios iniciales (editalos luego en .env.lan):"
Write-Host " - Admin:      $($envMap["DEMO_EMAIL"]) / $($envMap["DEMO_PASSWORD"])"
Write-Host " - Optometra:  $($envMap["DEMO_OPTOMETRA_EMAIL"]) / $($envMap["DEMO_OPTOMETRA_PASSWORD"])"
Write-Host " - Asesor:     $($envMap["DEMO_ASESOR_EMAIL"]) / $($envMap["DEMO_ASESOR_PASSWORD"])"
Write-Host ""
Write-Host "Siguiente paso recomendado: cambia contrasenas y activa 2FA para el admin." -ForegroundColor Yellow
