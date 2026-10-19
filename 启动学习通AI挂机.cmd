@echo off
setlocal
title XuexiTong AI Runner
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 goto no_node
node "%~dp0wb-launch.mjs" %*
exit /b %errorlevel%
:no_node
echo [ERROR] Install Node.js 22.12.0 or newer and add node to PATH.
exit /b 1
