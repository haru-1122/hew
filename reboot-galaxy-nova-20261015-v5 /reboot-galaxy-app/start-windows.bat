@echo off
setlocal
cd /d "%~dp0"
if not exist "package.json" goto missing_files
where node >nul 2>&1
if errorlevel 1 goto missing_node
where npm >nul 2>&1
if errorlevel 1 goto missing_node
node -e "process.exit(Number(process.versions.node.split('.')[0]) >= 24 ? 0 : 1)"
if errorlevel 1 goto old_node
node -e "require('express'); require('bcryptjs'); require('compression'); require.resolve('three'); require.resolve('gsap')" >nul 2>&1
if not errorlevel 1 goto start_app
echo Installing dependencies (first time only, it may take a few minutes)...
call npm ci
if errorlevel 1 goto install_failed
:start_app
set "RG_OPEN=1"
echo Starting Reboot Galaxy NOVA. Keep this window open.
call npm start
if errorlevel 1 goto start_failed
goto finish
:missing_files
echo ERROR: Extract the entire ZIP before starting this file.
goto failed
:missing_node
echo ERROR: Node.js and npm are required.
echo Install Node.js 24 or newer from https://nodejs.org/ and try again.
goto failed
:old_node
echo ERROR: This version requires Node.js 24 or newer.
goto failed
:install_failed
echo ERROR: Dependency installation failed. Check your network and the message above.
goto failed
:start_failed
echo ERROR: The app could not start. See the message above.
:failed
pause
exit /b 1
:finish
pause
exit /b 0
