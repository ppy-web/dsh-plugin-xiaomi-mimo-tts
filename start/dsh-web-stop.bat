@echo off
setlocal

if not defined DSH_WEB_HOST set "DSH_WEB_HOST=127.0.0.1"
if not defined DSH_WEB_PORT set "DSH_WEB_PORT=3080"

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -Command "$port = [int]$env:DSH_WEB_PORT; $binPattern = '@deepseek-ai[\\/]+dsh[\\/]+lib[\\/]+bin\.js'; $profilePattern = '(?:--profile(?:=|\s+)web(?:\s|$)|bin\.js\S?\s+web(?:\s|$))'; $listenerPids = @(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique); if ($listenerPids.Count -eq 0) { Write-Host ('[INFO] No listener on DSH Web port ' + $port + '.'); exit 0 }; $targets = @(); foreach ($processId in $listenerPids) { $process = Get-CimInstance Win32_Process -Filter ('ProcessId = ' + $processId) -ErrorAction SilentlyContinue; if ($null -ne $process -and $process.Name -ieq 'node.exe' -and $process.CommandLine -match $binPattern -and $process.CommandLine -match $profilePattern) { $targets += $process } }; if ($targets.Count -eq 0) { Write-Error ('Port ' + $port + ' is owned by a process that is not the DSH web profile; refusing to stop it.'); exit 1 }; foreach ($process in $targets) { Write-Host ('[INFO] Stopping DSH Web PID ' + $process.ProcessId + ' on port ' + $port); taskkill.exe /PID $process.ProcessId /T /F | Out-Null }; Write-Host '[OK] DSH Web stopped.'"

endlocal
