@echo off
rem ---------------------------------------------------------------------
rem  Arsu Atelier - update the shop laptop. Double-click it.
rem
rem  Exists because the three things that have stopped this working were
rem  all typing: the execution policy, the wrong directory, and -Force
rem  when it was not wanted. None of them are decisions - they are the
rem  same every time - so they belong in a file and not in a person.
rem
rem  No -Force: without it the script fetches, sees nothing new and exits
rem  in seconds. With it, every run stops the shop and rebuilds for five
rem  minutes whether or not anything changed.
rem
rem  No git pull either: update.ps1 fetches and resets to origin itself.
rem
rem  KEEP THIS FILE PURE ASCII - see the note in setup.ps1.
rem ---------------------------------------------------------------------
setlocal
set "SCRIPTS=%~dp0"
set "ROOT=%SCRIPTS%..\.."

echo.
echo   Updating Arsu Atelier. The app will be down for a few minutes.
echo   Do NOT close this window until it says it is done.
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPTS%update.ps1" -Root "%ROOT%"
set RESULT=%ERRORLEVEL%

echo.
if "%RESULT%"=="0" (
  echo   Done. Refresh the browser.
) else (
  echo   SOMETHING WENT WRONG - exit code %RESULT%
  echo   Run repair-now.cmd in this folder, then tell Ayush.
)
echo.
pause
endlocal
