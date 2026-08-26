@echo off
title ICV PERIHELION launcher
cd /d "%~dp0"
echo Launching ICV PERIHELION...
start "PERIHELION SERVER" /min cmd /c "npx vite preview --port 4173"
timeout /t 4 >nul
start "" http://localhost:4173
echo.
echo Ship is live at http://localhost:4173 (this window can be minimized)
echo Close the minimized PERIHELION SERVER window to shut it down.
pause
