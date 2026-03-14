@echo off
setlocal
set SCRIPT_DIR=%~dp0
powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%stop-lan.ps1"
if errorlevel 1 (
  echo.
  echo ERROR: no se pudieron detener los servicios.
  pause
  exit /b 1
)
pause
