@echo off
setlocal

set "PACKAGE=dsh-xiaomi-tts"
set "PACKAGE_SPEC=%PACKAGE%"
set "INSTALL_FLAGS="
set "TARBALL_PATH="
set "WEB_STARTED=0"
if not defined DSH_WEB_HOST set "DSH_WEB_HOST=127.0.0.1"
if not defined DSH_WEB_PORT set "DSH_WEB_PORT=3080"

if not "%~1"=="" (
  if /I "%~x1"==".tgz" (
    set "PACKAGE_SPEC=%~f1"
    set "TARBALL_PATH=%~f1"
  ) else (
    echo(%~1| findstr /R "^[0-9][0-9]*\.[0-9][0-9]*\.[0-9][0-9]*[-0-9A-Za-z.]*$" >nul
    if errorlevel 1 (
      set "PACKAGE_SPEC=%~1"
    ) else (
      set "PACKAGE_SPEC=%PACKAGE%@%~1"
    )
  )
)
if defined TARBALL_PATH set "INSTALL_FLAGS=--allow-build=%PACKAGE%@file:%TARBALL_PATH:\=/%"

where dsh.cmd >nul 2>&1
if errorlevel 1 (
  echo [ERROR] dsh.cmd was not found on PATH.
  echo Add the DSH npm-global directory to PATH, then retry.
  exit /b 1
)

echo Stopping DSH Web before changing profile dependencies...
call "%~dp0dsh-web-stop.bat"
if errorlevel 1 goto :failed

echo Removing old plugin packages and residual links from profile "web"...
call dsh.cmd plugin --profile web remove "%PACKAGE%"
if errorlevel 1 echo [INFO] %PACKAGE% was not removed by the CLI; verifying the manifest before continuing.
call dsh.cmd plugin --profile web remove "dsh-plugin-xiaomi-mimo-tts"
if errorlevel 1 echo [INFO] dsh-plugin-xiaomi-mimo-tts was not removed by the CLI; verifying the manifest before continuing.

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0dsh-profile-cleanup.ps1"
if errorlevel 1 (
  echo [ERROR] Failed to remove the old plugin package or stale link.
  goto :failed
)

echo Installing %PACKAGE_SPEC%...
if defined INSTALL_FLAGS (
  call dsh.cmd plugin --profile web add "%PACKAGE_SPEC%" "%INSTALL_FLAGS%"
) else (
  call dsh.cmd plugin --profile web add "%PACKAGE_SPEC%"
)
if errorlevel 1 (
  echo [ERROR] Failed to install %PACKAGE_SPEC%.
  goto :failed
)

echo Verifying dump-config before startup...
call dsh.cmd --profile web --dump-config | findstr /C:"id: xiaomi-mimo-tts" >nul
if errorlevel 1 (
  echo [ERROR] The installed Host id is missing from the profile config.
  goto :failed
)
call dsh.cmd --profile web --dump-config | findstr /C:"name: dsh-xiaomi-tts" >nul
if errorlevel 1 (
  echo [ERROR] The installed Host bundle is missing from the profile config.
  goto :failed
)

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -Command "$dshRoot = if ([string]::IsNullOrWhiteSpace($env:DSH_HOME)) { Join-Path $env:USERPROFILE '.dsh' } else { [IO.Path]::GetFullPath($env:DSH_HOME) }; $installed = Join-Path $dshRoot 'profiles\web\node_modules\dsh-xiaomi-tts'; $installedReal = (Get-Item -LiteralPath $installed -Force -ErrorAction Stop).Target; $checkout = (Resolve-Path (Join-Path '%~dp0' '..')).Path; if ($installedReal -and [IO.Path]::GetFullPath((@($installedReal)[0])).TrimEnd('\') -eq $checkout.TrimEnd('\')) { Write-Error 'The profile still points to the local checkout after reinstall.'; exit 1 }"
if errorlevel 1 goto :failed

echo Starting DSH Web...
call "%~dp0dsh-web-start.bat"
if errorlevel 1 goto :failed
set "WEB_STARTED=1"

echo Waiting for DSH Web and running HTTP/profile validation...
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -Command "$hostName = if ($env:DSH_WEB_HOST -eq '0.0.0.0' -or $env:DSH_WEB_HOST -eq '::') { '127.0.0.1' } else { $env:DSH_WEB_HOST }; $url = 'http://' + $hostName + ':' + $env:DSH_WEB_PORT + '/plugins/xiaomi-mimo-tts/api-key-status'; $deadline = [DateTime]::UtcNow.AddSeconds(60); do { try { $response = Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 3; if ($response.StatusCode -eq 200) { exit 0 } } catch {}; Start-Sleep -Milliseconds 500 } while ([DateTime]::UtcNow -lt $deadline); Write-Error ('DSH Web did not expose the plugin status route: ' + $url); exit 1"
if errorlevel 1 goto :failed

node "%~dp0..\scripts\dsh-profile-verify.mjs"
if errorlevel 1 goto :failed

echo [OK] %PACKAGE_SPEC% installed; Host, HTTP route, settings namespace and client bundle verified.
endlocal
exit /b 0

:failed
if "%WEB_STARTED%"=="1" call "%~dp0dsh-web-stop.bat"
echo [ERROR] Reinstall aborted. DSH Web was not restarted automatically.
echo Inspect the first error above, then retry after correcting it.
endlocal
exit /b 1
