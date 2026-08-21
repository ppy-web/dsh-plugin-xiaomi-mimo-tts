@echo off
setlocal

call "%~dp0dsh-web-stop.bat"
if errorlevel 1 exit /b 1

timeout /t 2 /nobreak >nul
call "%~dp0dsh-web-start.bat"

endlocal
