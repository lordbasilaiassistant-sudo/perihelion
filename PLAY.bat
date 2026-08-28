@echo off
title ICV PERIHELION launcher
cd /d "%~dp0"
echo Launching ICV PERIHELION...
if not exist "dist\index.html" (
  echo No production build found — building once...
  call npm run build
  if errorlevel 1 (
    echo Build failed. Falling back to the dev server.
    start "PERIHELION SERVER" /min cmd /c "npx vite --port 5173 --strictPort"
    timeout /t 4 >nul
    start "" http://localhost:5173
    goto :live
  )
)
start "PERIHELION SERVER" /min cmd /c "npx vite preview --port 4173 --strictPort"
timeout /t 4 >nul
start "" http://localhost:4173
:live
echo.
echo Ship is live. Close the minimized PERIHELION SERVER window to shut it down.
pause
