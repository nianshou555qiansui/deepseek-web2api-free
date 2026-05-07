@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
echo ========================================
echo   DeepSeek Chat API Proxy Server
echo ========================================
echo.

:: Kill any process occupying port 8080
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8080" ^| findstr LISTENING') do (
    echo Killing process %%a holding port 8080 ...
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

echo Starting server on port 8080 ...
python -m uvicorn server:app --host 0.0.0.0 --port 8080
if errorlevel 1 (
    echo.
    echo Failed to start. Reason: port 8080 occupied or missing deps.
    pause
)
