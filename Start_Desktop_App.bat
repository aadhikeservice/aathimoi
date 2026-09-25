@echo off
title Aathi Moi Offline Desktop Application
cd /d "%~dp0"
if exist "%~dp0dist\win-unpacked\AathiMoi.exe" (
    start "" "%~dp0dist\win-unpacked\AathiMoi.exe"
) else if exist "%~dp0node_modules\electron\dist\electron.exe" (
    start "" "%~dp0node_modules\electron\dist\electron.exe" "%~dp0"
) else (
    call "%~dp0start.bat"
)
