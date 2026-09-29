@echo off
setlocal

set "PROFILE=%~1"
if not defined PROFILE set "PROFILE=desktop"
set "PACKAGE=dsh-xiaomi-tts"

where dsh.cmd >nul 2>&1
if errorlevel 1 (
  echo [ERROR] dsh.cmd was not found on PATH.
  echo Add the DSH npm-global directory to PATH, then retry.
  exit /b 1
)

echo Removing %PACKAGE% from DSH profile "%PROFILE%"...
call dsh.cmd plugin --profile "%PROFILE%" remove "%PACKAGE%"
if errorlevel 1 echo [INFO] %PACKAGE% was not removed by the CLI; checking for stale local links.
call dsh.cmd plugin --profile "%PROFILE%" remove "dsh-plugin-xiaomi-mimo-tts"
if errorlevel 1 echo [INFO] Legacy package was not removed by the CLI; checking for stale local links.

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0dsh-profile-cleanup.ps1" -ProfileName "%PROFILE%"
if errorlevel 1 (
  echo [ERROR] Failed to remove the old plugin package or stale local link.
  echo Stop the DSH host first if the Junction is in use.
  endlocal
  exit /b 1
)

echo [OK] Removed %PACKAGE% and any stale local link from profile "%PROFILE%".
endlocal
exit /b 0
