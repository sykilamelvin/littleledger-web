@echo off
REM Publishes the phone version to sykilamelvin.github.io/littleledger-web
REM Double-click this file. Nothing is sent until it says "Sending".
cd /d "%~dp0"

echo.
echo   ============================================
echo     Little Ledger  -  publish to your phone
echo   ============================================
echo.
echo   These are the files that changed:
echo.
git status --short 2>nul
echo.

REM Any line at all from status means there are edits to save.
REM If there are none, there may STILL be saved work that never reached
REM GitHub, so we always go on and try to send.
for /f "delims=" %%i in ('git status --porcelain 2^>nul') do goto haschanges
echo   No new edits to save.
echo   Checking whether GitHub already has everything...
goto sendit

:haschanges
set "MSG="
set /p "MSG=  Describe this update (or just press Enter):  "
if not defined MSG set "MSG=Update the phone version"

echo.
echo   Giving the files a new version number, so phones
echo   fetch them instead of showing the old one...
node stamp.js
if errorlevel 1 goto failed

echo.
echo   Saving...
git add -A
if errorlevel 1 goto failed

git commit -m "%MSG%" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
if errorlevel 1 goto failed

:sendit
echo.
echo   Sending to GitHub...
echo   If it asks you to sign in, choose  sykilamelvin
echo   -  NOT syakila-png, that is your work account.
echo.
git push
if errorlevel 1 goto pushfailed

echo.
echo   ============================================
echo     Done.
echo.
echo     Give it about a minute, then open this on
echo     your phone:
echo.
echo     https://sykilamelvin.github.io/littleledger-web/
echo.
echo     If it still looks old, close the tab fully
echo     and open it again.
echo   ============================================
echo.
pause
exit /b 0

:pushfailed
echo.
echo   ---------------------------------------------
echo     COULD NOT SEND.
echo     Your work IS saved on this computer, but it
echo     did not reach GitHub, so your phone will not
echo     see it yet. Usually this means it needs you
echo     to sign in to GitHub again.
echo     Read the message above this line.
echo   ---------------------------------------------
echo.
pause
exit /b 1

:failed
echo.
echo   ---------------------------------------------
echo     Something went wrong and NOTHING was sent.
echo     Read the message above this line.
echo   ---------------------------------------------
echo.
pause
exit /b 1
