@echo off
setlocal

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -Command "$pattern = '@deepseek-ai[\\/]+dsh[\\/]+lib[\\/]+bin\.js'; $processes = @(Get-CimInstance Win32_Process | Where-Object { $_.Name -ieq 'node.exe' -and $_.CommandLine -and $_.CommandLine -match $pattern -and $_.CommandLine -match '(?:--profile\s+web(?:\s|$)|(?:\s|^)web(?:\s|$))' }); if ($processes.Count -eq 0) { Write-Host '[INFO] DSH Web is not running.'; exit 0 }; foreach ($process in $processes) { Write-Host ('[INFO] Stopping DSH Web PID ' + $process.ProcessId); taskkill.exe /PID $process.ProcessId /T /F | Out-Null }; Write-Host '[OK] DSH Web stopped.'"

endlocal
