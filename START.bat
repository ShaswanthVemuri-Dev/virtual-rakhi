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
if not exist "node_modules\peer\package.json" set NEED_INSTALL=1
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

echo [signaling] Starting private local room signaling...
if exist ".virtual-rakhi-signaling.log" del /q ".virtual-rakhi-signaling.log" >nul 2>&1
start "" /B cmd /C "npm run signaling ^> .virtual-rakhi-signaling.log 2^>^&1"
set VITE_PEER_HOST=127.0.0.1
set VITE_PEER_PORT=9000
set VITE_PEER_PATH=/peerjs
set VITE_PEER_SECURE=false

echo [server] Starting local Vite server...
if exist ".virtual-rakhi-vite.log" del /q ".virtual-rakhi-vite.log" >nul 2>&1
start "" /B cmd /C "npm run dev ^> .virtual-rakhi-vite.log 2^>^&1"

set READY=
for /L %%I in (1,1,40) do (
  powershell -NoProfile -Command "try { $r=Invoke-WebRequest -UseBasicParsing http://127.0.0.1:5173 -TimeoutSec 1; if($r.StatusCode -ge 200){exit 0}else{exit 1} } catch { exit 1 }" >nul 2>&1
  if not errorlevel 1 (
    set READY=1
    goto :ready
  )
  timeout /t 1 /nobreak >nul
)

:ready
if not defined READY (
  echo [ERROR] Local server did not become ready.
  if exist ".virtual-rakhi-vite.log" type ".virtual-rakhi-vite.log"
  goto :fail
)

echo.
echo [ready] Virtual Rakhi is running at http://127.0.0.1:5173
echo [ready] Opening your default browser...
start "" "http://127.0.0.1:5173"
echo.
echo Optional short timer test URL: http://127.0.0.1:5173/?duration=180
echo Local rooms use the bundled signaling server. Vercel builds use free PeerJS Cloud signaling.
echo Keep this window open while testing. Closing it may stop the local server.
echo Press any key when you are finished to close this launcher.
echo.
pause >nul
exit /b 0

:fail
echo.
echo [ERROR] Startup failed. Review the message above.
if exist ".virtual-rakhi-vite.log" (
  echo.
  echo ---- Vite log ----
  type ".virtual-rakhi-vite.log"
)
echo.
pause
exit /b 1
