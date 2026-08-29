@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title Virtual Rakhi

echo.
echo ============================================================
echo   Virtual Rakhi
echo ============================================================
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js is not installed or is not on PATH.
  echo Install the current Node.js LTS release from https://nodejs.org/ and run START.bat again.
  echo.
  pause
  exit /b 1
)

where npm >nul 2>&1
if errorlevel 1 (
  echo [ERROR] npm is unavailable even though Node.js was found.
  echo Repair/reinstall Node.js, then run START.bat again.
  echo.
  pause
  exit /b 1
)

set NEED_INSTALL=
if not exist "node_modules\@mediapipe\tasks-vision" set NEED_INSTALL=1
if not exist "node_modules\peerjs\package.json" set NEED_INSTALL=1
if defined NEED_INSTALL (
  echo [setup] Installing project dependencies. This is required on first run or after package changes...
  call npm install
  if errorlevel 1 goto :fail
) else (
  echo [setup] Dependencies already installed.
)

echo [setup] Preparing MediaPipe runtime and models...
node scripts\prepare-wasm.cjs
if errorlevel 1 goto :fail
node scripts\download-models.cjs
if errorlevel 1 goto :fail

echo [setup] Verifying application files...
node scripts\check-runtime.cjs
if errorlevel 1 goto :fail

echo [server] Starting local Vite server...
echo.
echo The browser will open when http://127.0.0.1:5173 is ready.
echo Optional short timer test URL: http://127.0.0.1:5173/?duration=180
echo Local rooms and Vercel builds use PeerJS Cloud signaling.
echo Keep this window open. Press Ctrl+C once to stop the server cleanly.
echo.
start "" /B powershell -NoProfile -Command "$u='http://127.0.0.1:5173'; for($i=0;$i -lt 40;$i++){ try { $r=Invoke-WebRequest -UseBasicParsing $u -TimeoutSec 1; if($r.StatusCode -ge 200){Start-Process $u; exit 0} } catch {}; Start-Sleep -Seconds 1 }"
call npm run dev
if errorlevel 1 goto :fail
exit /b 0

:fail
echo.
echo [ERROR] Startup failed. Review the message above.
echo.
pause
exit /b 1
