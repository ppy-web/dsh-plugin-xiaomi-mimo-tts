@echo off
setlocal

if not defined DSH_WEB_HOST set "DSH_WEB_HOST=127.0.0.1"
if not defined DSH_WEB_PORT set "DSH_WEB_PORT=3080"

where dsh.cmd >nul 2>&1
if errorlevel 1 (
  echo [ERROR] dsh.cmd was not found on PATH.
  echo Add the DSH npm-global directory to PATH, then retry.
  exit /b 1
)

echo Starting DSH Web profile "web" at %DSH_WEB_HOST%:%DSH_WEB_PORT%...
start "DSH Web" "%ComSpec%" /k ""dsh.cmd" --profile web --no-open --host "%DSH_WEB_HOST%" --port "%DSH_WEB_PORT%""
echo DSH Web is starting in a new console window.
endlocal
