@echo off
title Aathi Moi Application
echo Starting Aathi Moi (ஆதி மொய்) Application...

cd /d "%~dp0"

:: Ensure Mukta Malar fonts are registered in Windows User Fonts for crisp Tamil PDF rendering
if exist "fonts\MuktaMalar-Regular.ttf" (
    powershell -NoProfile -Command "
        $fontDir = '$env:LOCALAPPDATA\Microsoft\Windows\Fonts'
        if (!(Test-Path $fontDir)) { New-Item -ItemType Directory -Path $fontDir -Force | Out-Null }
        $regPath = 'HKCU:\Software\Microsoft\Windows NT\CurrentVersion\Fonts'
        if (!(Test-Path $regPath)) { New-Item -Path $regPath -Force | Out-Null }
        if (!(Test-Path \"$fontDir\MuktaMalar-Regular.ttf\")) {
            Copy-Item 'fonts\MuktaMalar-*.ttf' -Destination $fontDir -Force
            Set-ItemProperty -Path $regPath -Name 'Mukta Malar (TrueType)' -Value \"$fontDir\MuktaMalar-Regular.ttf\"
            Set-ItemProperty -Path $regPath -Name 'Mukta Malar Bold (TrueType)' -Value \"$fontDir\MuktaMalar-Bold.ttf\"
            Set-ItemProperty -Path $regPath -Name 'Mukta Malar SemiBold (TrueType)' -Value \"$fontDir\MuktaMalar-SemiBold.ttf\"
            Set-ItemProperty -Path $regPath -Name 'Mukta Malar ExtraBold (TrueType)' -Value \"$fontDir\MuktaMalar-ExtraBold.ttf\"
        }
    " 2>nul
)

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
