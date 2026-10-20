@echo off
rem Return the first executable Node 22.12.0 or newer, without a PATH entry.
rem Delayed expansion stays disabled so paths containing ! survive unchanged.
setlocal EnableExtensions DisableDelayedExpansion
set "NODE_EXE="

for /f "delims=" %%i in ('%SystemRoot%\System32\where.exe node.exe 2^>nul') do (
    set "NODE_CANDIDATE=%%i"
    call :try_node
)
if defined NODE_EXE goto found

if defined ProgramFiles (
    set "NODE_CANDIDATE=%ProgramFiles%\nodejs\node.exe"
    call :try_node
)
if defined NODE_EXE goto found

if defined ProgramFiles(x86) (
    set "NODE_CANDIDATE=%ProgramFiles(x86)%\nodejs\node.exe"
    call :try_node
)
if defined NODE_EXE goto found

if defined LOCALAPPDATA (
    set "NODE_CANDIDATE=%LOCALAPPDATA%\Programs\nodejs\node.exe"
    call :try_node
)
if defined NODE_EXE goto found

if defined USERPROFILE (
    for /d %%d in ("%USERPROFILE%\.workbuddy\binaries\node\versions\*") do (
        set "NODE_CANDIDATE=%%~fd\node.exe"
        call :try_node
    )
)
if defined NODE_EXE goto found

endlocal & set "NODE_EXE=" & exit /b 1

:try_node
if defined NODE_EXE exit /b 0
if not exist "%NODE_CANDIDATE%" exit /b 0
"%NODE_CANDIDATE%" -e "const v=process.versions.node.split('.').map(Number);process.exit(v[0]>22||(v[0]===22&&v[1]>=12)?0:1)" >nul 2>&1
if errorlevel 1 exit /b 0
set "NODE_EXE=%NODE_CANDIDATE%"
exit /b 0

:found
endlocal & set "NODE_EXE=%NODE_EXE%" & exit /b 0
