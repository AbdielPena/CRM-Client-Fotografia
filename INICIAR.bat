@echo off
chcp 65001 >nul
title StudioFlow — Iniciando...
color 0A

echo.
echo  ╔══════════════════════════════════════╗
echo  ║   StudioFlow  —  Iniciando app...   ║
echo  ╚══════════════════════════════════════╝
echo.

cd /d "%~dp0"

:: ── PASO 1: Verificar .env.local ──────────────────────────────
findstr /C:"PEGA_AQUI_TU_SERVICE_ROLE_KEY" .env.local >nul
if not errorlevel 1 (
    echo  [ATENCION] Falta pegar la SUPABASE_SERVICE_ROLE_KEY en .env.local
    echo.
    echo  1. Abre: https://supabase.com/dashboard/project/kbrcqyjnrbjlzfolpcsx/settings/api
    echo  2. Copia el campo "service_role" (secret)
    echo  3. Pegalo en .env.local reemplazando PEGA_AQUI_TU_SERVICE_ROLE_KEY
    echo.
    pause
    exit /b 1
)

:: ── PASO 2: Instalar dependencias ──────────────────────────────
echo  [1/2] Instalando dependencias npm (primera vez tarda)...
call npm install
if errorlevel 1 (
    echo.
    echo  [ERROR] Fallo npm install. Instala Node.js: https://nodejs.org
    pause
    exit /b 1
)
echo  [OK] Dependencias listas
echo.

:: ── PASO 3: Iniciar servidor ──────────────────────────────────
echo  [2/2] Iniciando servidor Next.js...
echo.
echo  ╔══════════════════════════════════════════════╗
echo  ║  La app estara lista en:                     ║
echo  ║  http://localhost:3000                       ║
echo  ║                                              ║
echo  ║  Backend: Supabase (cloud)                   ║
echo  ║  Proyecto: kbrcqyjnrbjlzfolpcsx              ║
echo  ║                                              ║
echo  ║  Presiona Ctrl+C aqui para detener           ║
echo  ╚══════════════════════════════════════════════╝
echo.

start "" "http://localhost:3000"
call npm run dev
