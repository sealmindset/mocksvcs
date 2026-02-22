@echo off
REM ============================================================
REM Mock API Server - Stop Script (Windows)
REM ============================================================

echo.
echo Stopping Mock API Server...
echo.

REM Kill processes on port 3001
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3001" ^| findstr "LISTENING"') do (
    taskkill /PID %%a /F >nul 2>nul
    echo [OK] Stopped process on port 3001
)

REM Kill processes on port 4010
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":4010" ^| findstr "LISTENING"') do (
    taskkill /PID %%a /F >nul 2>nul
    echo [OK] Stopped process on port 4010
)

REM Kill any node processes running server.js
taskkill /F /IM node.exe /FI "WINDOWTITLE eq *server.js*" >nul 2>nul

echo.
echo [OK] Mock API Server stopped
echo.
pause
