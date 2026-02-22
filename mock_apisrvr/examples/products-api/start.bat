@echo off
REM ============================================================
REM Mock API Server - One-Click Start Script (Windows)
REM ============================================================

echo.
echo ===============================================================
echo   Starting Mock API Server...
echo ===============================================================
echo.

REM Get the directory where this script is located
cd /d "%~dp0"

REM Check if Node.js is installed
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo X Node.js is not installed!
    echo.
    echo Please install Node.js first:
    echo   1. Go to https://nodejs.org/
    echo   2. Download and install the LTS version
    echo   3. Run this script again
    echo.
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('node --version') do set NODE_VERSION=%%i
echo [OK] Node.js found: %NODE_VERSION%

REM Check if dependencies are installed
if not exist "node_modules" (
    echo [..] Installing dependencies (first time only^)...
    call npm install --silent
    echo [OK] Dependencies installed
)

REM Kill any existing processes on our ports (silently)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3001" ^| findstr "LISTENING"') do taskkill /PID %%a /F >nul 2>nul
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":4010" ^| findstr "LISTENING"') do taskkill /PID %%a /F >nul 2>nul
timeout /t 1 /nobreak >nul

REM Start the server
echo [..] Starting server...
echo.
node server.js

pause
