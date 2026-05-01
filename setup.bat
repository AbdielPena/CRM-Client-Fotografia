@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

echo.
echo   ==============================================
echo    StudioFlow  --  Setup de entorno local
echo   ==============================================
echo.

:: ── 1. Verificar Node.js ──────────────────────────────────────────────────
where node >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js no encontrado.
    echo         Descargalo en: https://nodejs.org
    pause
    exit /b 1
)
for /f "tokens=*" %%i in ('node --version') do set NODE_VER=%%i
echo [OK] Node.js %NODE_VER%

:: ── 2. Verificar Docker ───────────────────────────────────────────────────
where docker >nul 2>&1
if errorlevel 1 (
    echo [AVISO] Docker no encontrado. Instalalo desde https://docker.com
    echo         Los servicios de base de datos no se levantaran automaticamente.
    echo.
) else (
    for /f "tokens=*" %%i in ('docker --version') do set DOCKER_VER=%%i
    echo [OK] %DOCKER_VER%
)

:: ── 3. Crear .env.local si no existe ─────────────────────────────────────
if not exist ".env.local" (
    if exist ".env.local.example" (
        copy ".env.local.example" ".env.local" >nul
        echo [OK] .env.local creado desde .env.local.example
    ) else (
        echo [AVISO] No se encontro .env.local.example -- crea .env.local manualmente
    )
) else (
    echo [OK] .env.local ya existe
)

:: ── 4. Instalar dependencias ──────────────────────────────────────────────
echo.
echo   Instalando dependencias npm...
call npm install
if errorlevel 1 (
    echo [ERROR] Fallo npm install
    pause
    exit /b 1
)
echo [OK] Dependencias instaladas

:: ── 5. Levantar Docker ───────────────────────────────────────────────────
where docker >nul 2>&1
if not errorlevel 1 (
    echo.
    echo   Levantando servicios Docker ^(PostgreSQL + Redis + MinIO^)...
    docker compose up -d
    if errorlevel 1 (
        echo [ERROR] No se pudo levantar Docker Compose
        echo         Asegurate de que Docker Desktop este corriendo
        pause
        exit /b 1
    )
    echo   Esperando que los servicios arranquen...
    timeout /t 5 /nobreak >nul
    echo [OK] Servicios Docker levantados
)

:: ── 6. Generar Prisma Client ──────────────────────────────────────────────
echo.
echo   Generando Prisma Client...
call npm run db:generate
if errorlevel 1 (
    echo [ERROR] Fallo prisma generate
    pause
    exit /b 1
)
echo [OK] Prisma Client generado

:: ── 7. Migraciones ───────────────────────────────────────────────────────
echo.
echo   Ejecutando migraciones de base de datos...
call npx prisma migrate deploy
if errorlevel 1 (
    echo [ERROR] Fallo prisma migrate
    echo         Verifica que PostgreSQL este corriendo y DATABASE_URL sea correcta
    pause
    exit /b 1
)
echo [OK] Migraciones aplicadas

:: ── 8. Seed ──────────────────────────────────────────────────────────────
echo.
echo   Cargando datos de ejemplo...
call npm run db:seed
if errorlevel 1 (
    echo [AVISO] El seed fallo -- puede que ya existan datos. Continuando...
)

:: ── 9. Listo ─────────────────────────────────────────────────────────────
echo.
echo   ==============================================
echo    Setup completado!
echo   ==============================================
echo.
echo   Para iniciar la app:
echo     npm run dev
echo.
echo   Abre en el navegador:
echo     http://localhost:3000
echo.
echo   Login:
echo     owner@studiodemo.com  /  password123
echo   ==============================================
echo.
pause
