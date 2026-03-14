@echo off
setlocal
set SCRIPT_DIR=%~dp0
powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%install-lan.ps1"
if errorlevel 1 (
  echo.
  echo ERROR: la instalacion LAN fallo.
  pause
  exit /b 1
)
echo.
echo Instalacion LAN finalizada.
pause
