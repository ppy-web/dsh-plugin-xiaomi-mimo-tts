@echo off
setlocal

set "PACKAGE=dsh-xiaomi-tts"
set "VERSION=%~1"
set "PACKAGE_SPEC=%PACKAGE%"
if not "%VERSION%"=="" set "PACKAGE_SPEC=%PACKAGE%@%VERSION%"

where dsh.cmd >nul 2>&1
if errorlevel 1 (
  echo [ERROR] dsh.cmd was not found on PATH.
  echo Add the DSH npm-global directory to PATH, then retry.
  exit /b 1
)

echo Stopping DSH Web before changing profile dependencies...
call "%~dp0dsh-web-stop.bat"
if errorlevel 1 goto :restart_on_failure

timeout /t 2 /nobreak >nul

echo Removing %PACKAGE% from profile "web"...
call dsh.cmd plugin --profile web remove "%PACKAGE%" >nul 2>&1
call dsh.cmd plugin --profile web remove "dsh-plugin-xiaomi-mimo-tts" >nul 2>&1

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -Command "$profileRoot = Join-Path $env:USERPROFILE '.dsh\profiles\web'; $paths = @((Join-Path $profileRoot 'node_modules\dsh-xiaomi-tts'), (Join-Path $profileRoot 'node_modules\dsh-plugin-xiaomi-mimo-tts')); $failed = $false; foreach ($link in $paths) { $item = Get-Item -LiteralPath $link -Force -ErrorAction SilentlyContinue; if ($null -eq $item) { continue }; if ($item.LinkType -ne 'Junction' -and $item.LinkType -ne 'SymbolicLink') { Write-Error ('Refusing to remove non-link path: ' + $item.FullName); $failed = $true; continue }; Write-Host ('[INFO] Removing stale ' + $item.LinkType + ': ' + $item.FullName + ' -> ' + ($item.Target -join ', ')); Remove-Item -LiteralPath $item.FullName -Force -ErrorAction Stop }; if ($failed) { exit 1 }"
if errorlevel 1 (
  echo [ERROR] Failed to remove the stale plugin link.
  goto :restart_on_failure
)

echo Installing %PACKAGE_SPEC% from npm...
call dsh.cmd plugin --profile web add "%PACKAGE_SPEC%"
if errorlevel 1 (
  echo [ERROR] Failed to install %PACKAGE_SPEC%.
  goto :restart_on_failure
)

echo Verifying the installed bundle...
call dsh.cmd --profile web --dump-config | findstr /C:"name: dsh-xiaomi-tts" >nul
if errorlevel 1 (
  echo [ERROR] The installed bundle is missing from the profile config.
  goto :restart_on_failure
)

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -Command "$item = Get-Item -LiteralPath (Join-Path $env:USERPROFILE '.dsh\profiles\web\node_modules\dsh-xiaomi-tts') -Force -ErrorAction Stop; $target = @($item.Target) -join ';'; $checkout = (Resolve-Path (Join-Path '%~dp0' '..')).Path; if ($target -and [IO.Path]::GetFullPath($target).TrimEnd('\') -eq $checkout.TrimEnd('\')) { Write-Error 'The profile still points to the local checkout.'; exit 1 }"
if errorlevel 1 (
  echo [ERROR] The profile still points to the local checkout.
  goto :restart_on_failure
)

echo Starting DSH Web...
call "%~dp0dsh-web-start.bat"
if errorlevel 1 goto :restart_on_failure
echo [OK] %PACKAGE_SPEC% installed and profile config verified.
endlocal
exit /b 0

:restart_on_failure
echo [WARN] Restarting DSH Web after the failed reinstall attempt...
call "%~dp0dsh-web-start.bat"
endlocal
exit /b 1
