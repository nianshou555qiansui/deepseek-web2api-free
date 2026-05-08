@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

if "%PORT%"=="" set PORT=8080

echo ========================================
echo   DeepSeek Chat API Proxy Server
echo ========================================
echo.

:: Kill any process occupying configured port
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%PORT% " ^| findstr LISTENING') do (
    echo Killing process %%a holding port %PORT% ...
    taskkill /F /PID %%a >nul 2>&1
    if !errorlevel! equ 0 (
        echo Done.
    ) else (
        taskkill /F /PID %%a /T >nul 2>&1
        if !errorlevel! equ 0 (
            echo Done.
        )
    )
)
timeout /t 1 /nobreak >nul

echo Starting server on port %PORT% ...
python -m uvicorn server:app --host 0.0.0.0 --port %PORT%
if errorlevel 1 (
    echo.
    echo Failed to start. Reason: port %PORT% occupied or missing deps.
    pause
)
