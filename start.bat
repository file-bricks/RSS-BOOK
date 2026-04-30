@echo off
cd /d "%~dp0"
echo RSS-BOOK - Browser Extension Helper
echo.
echo This helper opens the project folder and your browser's extension page.
echo Load this folder as an unpacked extension in Edge or Chrome.
echo.
start "" explorer "%~dp0"

where msedge >nul 2>&1
if %errorlevel%==0 (
    start "" msedge "edge://extensions/"
    goto :done
)

where chrome >nul 2>&1
if %errorlevel%==0 (
    start "" chrome "chrome://extensions/"
    goto :done
)

echo No supported Chromium browser was found automatically.
echo Open edge://extensions/ or chrome://extensions/ manually.

:done
echo.
echo Project folder: %~dp0
pause
