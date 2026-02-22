@echo off
REM ============================================================
REM Mock API Server (Persistent) - Stop Script (Windows)
REM ============================================================

echo.
echo Stopping Mock API Server (Persistent)...
echo.

REM Kill processes on port 3001
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3001" ^| findstr "LISTENING"') do (
    taskkill /PID %%a /F >nul 2>nul
    echo [OK] Stopped process on port 3001
)

REM Kill any node processes running server.js
taskkill /F /IM node.exe /FI "WINDOWTITLE eq *server.js*" >nul 2>nul

echo.
echo [OK] Mock API Server stopped
echo [OK] Data has been saved to db.json
echo.
pause
