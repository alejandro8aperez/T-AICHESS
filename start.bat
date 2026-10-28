@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required. Install Node.js 22 LTS and run this file again.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo Installing TAICHESS dependencies...
  call npm install --legacy-peer-deps
  if errorlevel 1 (
    echo Dependency installation failed.
    pause
    exit /b 1
  )
)

echo Starting TAICHESS at http://localhost:5173
call npm run dev
pause
