@echo off
setlocal EnableExtensions EnableDelayedExpansion
REM Khoi dong API (apps/api) va Web (apps/web) cung luc
REM Chay tu thu muc goc repo: start-server.bat

echo(
echo ========================================
echo    UNIEDU 5.0 - START SERVER
echo ========================================
echo(

REM ================================
REM  Auto free ports (FE/BE)
REM ================================
set "FE_PORT=3000"
set "BE_PORT=3001"

REM Kill any stale Next.js dev processes to avoid .next lock + port hopping
call :KillNextWeb

call :KillPort %FE_PORT%
call :KillPort %BE_PORT%

REM Xoa lock file cua Next.js neu con (tranh loi "Unable to acquire lock")
if exist "apps\web\.next\dev\lock" (
    del /f /q "apps\web\.next\dev\lock" >nul 2>nul
)

where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Chua cai Node.js. Tai tai: https://nodejs.org/
    pause
    exit /b 1
)

where npm >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Khong tim thay npm.
    pause
    exit /b 1
)

if not exist "apps\api" (
    echo ERROR: Khong tim thay thu muc apps\api
    pause
    exit /b 1
)

if not exist "apps\web" (
    echo ERROR: Khong tim thay thu muc apps\web
    pause
    exit /b 1
)

echo Dang kiem tra dependencies...
echo(

set "API_NODE=apps\api\node_modules"
if not exist "%API_NODE%" (
    echo WARNING: API chua co node_modules. Dang cai dat...
    cd apps\api
    call npm install
    cd ..\..
    echo OK: API dependencies da cai xong
    echo(
)

set "WEB_NODE=apps\web\node_modules"
set "WEB_NEXT=apps\web\node_modules\next"
if not exist "%WEB_NEXT%" set "WEB_NEED_INSTALL=1"
if defined WEB_NEED_INSTALL (
    echo WARNING: Web chua co day du node_modules hoac thieu next. Dang cai dat...
    echo   Neu bi loi TAR hoac timeout, chay thu cong: cd apps\web ^&^& npm install
    cd apps\web
    call npm install
    if errorlevel 1 (
        echo(
        echo LOI: npm install that bai. Thu chay: npm cache clean --force roi npm install lai
        cd ..\..
        pause
        exit /b 1
    )
    cd ..\..
    echo OK: Web dependencies da cai xong
    echo(
)

set "API_ENV=apps\api\.env"
if not exist "%API_ENV%" (
    echo WARNING: Chua co file apps\api\.env
    echo   Tao file .env voi DATABASE_URL va cac bien can thiet
    echo(
)

echo ========================================
echo    DANG KHOI DONG SERVERS...
echo ========================================
echo(

echo Khoi dong API (NestJS - port 3001, tu dong tai khi sua code)...
powershell -NoProfile -Command "Start-Process -FilePath cmd.exe -WorkingDirectory (Resolve-Path 'apps/api').Path -ArgumentList '/k','set CHOKIDAR_USEPOLLING=true && npm run dev' -WindowStyle Normal" >nul 2>nul

REM Sleep ~3s without requiring stdin (avoid timeout/pause redirection issues)
ping -n 4 127.0.0.1 >nul

echo Khoi dong Web (Next.js - port 3000, tu dong tai khi sua code)...
powershell -NoProfile -Command "Start-Process -FilePath cmd.exe -WorkingDirectory (Resolve-Path 'apps/web').Path -ArgumentList '/k','set CHOKIDAR_USEPOLLING=true && set PORT=3000 && npm run dev' -WindowStyle Normal" >nul 2>nul

ping -n 4 127.0.0.1 >nul

echo(
echo ========================================
echo    SERVERS DA KHOI DONG
echo ========================================
echo(
echo   API:  http://localhost:3001  (hoac PORT trong apps\api\.env)
echo   Web:  http://localhost:3000
echo(
echo Cua so nay se tu dong dong (cac server van chay trong cua so khac).
echo(
exit /b 0

REM ================================
REM  Helpers
REM ================================
:KillPort
set "PORT=%~1"
echo Checking port %PORT%...

powershell -NoProfile -Command "$pids = Get-NetTCPConnection -LocalPort %PORT% -State Listen -ErrorAction SilentlyContinue ^| Select-Object -ExpandProperty OwningProcess -Unique; if($pids){ Write-Host ('Found process(es) on port %PORT%: ' + ($pids -join ', ') + '. Killing...'); foreach($id in $pids){ try{ Stop-Process -Id $id -Force -ErrorAction Stop } catch {} } Start-Sleep -Seconds 1 } else { Write-Host 'Port %PORT% is free' }" >nul 2>nul

REM Fallback: neu PowerShell bi chan/quyen han che, thu netstat/taskkill (best-effort)
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /I ":%PORT%" ^| findstr /I "LISTENING"') do (
    taskkill /PID %%p /F >nul 2>nul
)

exit /b 0

:KillNextWeb
echo Checking stale Next.js processes...
powershell -NoProfile -Command "$procs = Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" ^| Where-Object { $_.CommandLine -like '*\\apps\\web\\node_modules\\next\\*' -or $_.CommandLine -like '*next/dist/bin/next dev*' }; foreach($p in $procs){ try{ Stop-Process -Id $p.ProcessId -Force -ErrorAction Stop } catch {} }" >nul 2>nul
exit /b 0
