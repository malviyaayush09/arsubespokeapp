@echo off
rem ---------------------------------------------------------------------
rem  Arsu Atelier - the shop is down and nobody knows why. Double-click it.
rem
rem  Restores whatever a half-finished update left behind, rebuilds if
rem  there is nothing to restore, checks the database, starts the app and
rem  will not claim success until the app answers. Safe to run when
rem  nothing is wrong.
rem
rem  KEEP THIS FILE PURE ASCII - see the note in setup.ps1.
rem ---------------------------------------------------------------------
setlocal
set "SCRIPTS=%~dp0"
set "ROOT=%SCRIPTS%..\.."

echo.
echo   Repairing Arsu Atelier. This can take a few minutes.
echo   Do NOT close this window.
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPTS%update.ps1" -Root "%ROOT%" -Repair
set RESULT=%ERRORLEVEL%

echo.
if "%RESULT%"=="0" (
  echo   The shop is answering again. Refresh the browser.
) else (
  echo   COULD NOT FIX IT - exit code %RESULT%
  echo   Send Ayush the last 30 lines of C:\ArsuAtelier\logs\server.log
)
echo.
pause
endlocal
