@echo off
title Aathi Moi Application
echo Starting Aathi Moi (ஆதி மொய்) Application...

cd /d "%~dp0"

set "NODE_EXE="
where node >nul 2>nul && set "NODE_EXE=node"
if "%NODE_EXE%"=="" if exist "%LOCALAPPDATA%\ms-playwright-go\1.57.0\node.exe" set "NODE_EXE=%LOCALAPPDATA%\ms-playwright-go\1.57.0\node.exe"
if "%NODE_EXE%"=="" if exist "C:\Users\jkish\AppData\Local\ms-playwright-go\1.57.0\node.exe" set "NODE_EXE=C:\Users\jkish\AppData\Local\ms-playwright-go\1.57.0\node.exe"
if "%NODE_EXE%"=="" if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" set "NODE_EXE=%LOCALAPPDATA%\Programs\nodejs\node.exe"
if "%NODE_EXE%"=="" if exist "C:\Program Files\nodejs\node.exe" set "NODE_EXE=C:\Program Files\nodejs\node.exe"

if not "%NODE_EXE%"=="" (
    start "" "http://localhost:3000"
    "%NODE_EXE%" server.js
) else if exist "%~dp0dist\win-unpacked\AathiMoi.exe" (
    echo Starting Aathi Moi Desktop Edition...
    start "" "%~dp0dist\win-unpacked\AathiMoi.exe"
) else (
    echo Node.js is not found on this PC. Opening application directly in web browser...
    start "" "index.html"
)
pause
