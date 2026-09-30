@echo off
title Aathi Moi Application
echo Starting Aathi Moi (ஆதி மொய்) Application...

where node >nul 2>nul
if %errorlevel% equ 0 (
    start "" "http://localhost:3000"
    node server.js
) else if exist "%~dp0node_modules\electron\dist\electron.exe" (
    start "" "http://localhost:3000"
    set ELECTRON_RUN_AS_NODE=1
    "%~dp0node_modules\electron\dist\electron.exe" "%~dp0server.js"
) else (
    echo Node.js is not found on this PC. Opening application directly in web browser...
    start "" "index.html"
)
pause
