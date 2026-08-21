@echo off
setlocal

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -Command "$pattern = '@deepseek-ai[\\/]+dsh[\\/]+lib[\\/]+bin\.js.*--profile\s+web'; $processes = @(Get-CimInstance Win32_Process | Where-Object { $_.Name -ieq 'node.exe' -and $_.CommandLine -and $_.CommandLine -match $pattern }); if ($processes.Count -eq 0) { Write-Host '[INFO] DSH Web is not running.'; exit 0 }; Write-Host ('[OK] DSH Web process count: ' + $processes.Count); foreach ($process in $processes) { Write-Host ('PID: ' + $process.ProcessId); Write-Host ('CMD: ' + $process.CommandLine) }"

endlocal
