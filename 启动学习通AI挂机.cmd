@echo off
setlocal EnableExtensions DisableDelayedExpansion
chcp 65001 >nul
title XuexiTong AI Runner
cd /d "%~dp0"
call _find-node.cmd
if errorlevel 1 goto no_node
echo Using Node: "%NODE_EXE%"
"%NODE_EXE%" "%~dp0wb-launch.mjs" %*
set "WB_EXIT_CODE=%errorlevel%"
if "%WB_EXIT_CODE%"=="0" exit /b 0
echo [ERROR] Startup failed. Keep the error above for troubleshooting.
pause
exit /b %WB_EXIT_CODE%
:no_node
echo [ERROR] No usable Node.js 22.12.0 or newer was found.
echo Install Node.js with Add to PATH, then reopen this window.
echo If already installed, run where.exe node in a new terminal. See README.md.
pause
exit /b 1
