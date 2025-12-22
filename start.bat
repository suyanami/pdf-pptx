@echo off
echo Starting PDF to PPTX Converter...
echo.

REM Start the server in background
start /B python -m http.server 8080

REM Wait a moment for server to start
timeout /t 2 /nobreak > nul

REM Open browser
start http://localhost:8080

echo.
echo Server running at http://localhost:8080
echo Press Ctrl+C or close this window to stop.
echo.

REM Keep window open
pause
