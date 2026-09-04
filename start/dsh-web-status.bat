@echo off
setlocal

if not defined DSH_WEB_HOST set "DSH_WEB_HOST=127.0.0.1"
if not defined DSH_WEB_PORT set "DSH_WEB_PORT=3080"

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -Command "$port = [int]$env:DSH_WEB_PORT; $binPattern = '@deepseek-ai[\\/]+dsh[\\/]+lib[\\/]+bin\.js'; $profilePattern = '(?:--profile(?:=|\s+)web(?:\s|$)|bin\.js\S?\s+web(?:\s|$))'; $listenerPids = @(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique); if ($listenerPids.Count -eq 0) { Write-Host ('[ERROR] DSH Web is not listening on port ' + $port + '.'); exit 1 }; $targets = @(); foreach ($processId in $listenerPids) { $process = Get-CimInstance Win32_Process -Filter ('ProcessId = ' + $processId) -ErrorAction SilentlyContinue; if ($null -ne $process -and $process.Name -ieq 'node.exe' -and $process.CommandLine -match $binPattern -and $process.CommandLine -match $profilePattern) { $targets += $process } }; if ($targets.Count -eq 0) { Write-Error ('Port ' + $port + ' is not owned by the DSH web profile.'); exit 1 }; Write-Host ('[OK] DSH Web process count: ' + $targets.Count); foreach ($process in $targets) { Write-Host ('PID: ' + $process.ProcessId); Write-Host ('CMD: ' + $process.CommandLine) }"
if errorlevel 1 (
  endlocal
  exit /b 1
)

node "%~dp0..\scripts\dsh-profile-verify.mjs"
set "VERIFY_EXIT=%ERRORLEVEL%"
endlocal & exit /b %VERIFY_EXIT%
