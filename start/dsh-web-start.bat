@echo off
setlocal

where dsh.cmd >nul 2>&1
if errorlevel 1 (
  echo [ERROR] dsh.cmd was not found on PATH.
  echo Add the DSH npm-global directory to PATH, then retry.
  exit /b 1
)

echo Starting DSH Web with profile "web"...
start "DSH Web" "%ComSpec%" /k ""dsh.cmd" --profile web"
echo DSH Web is starting in a new console window.
endlocal
