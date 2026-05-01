#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# StudioFlow — Script de Setup Local
# Ejecutar: bash setup.sh
# ─────────────────────────────────────────────────────────────────────────────

set -e

GREEN="\033[0;32m"
YELLOW="\033[1;33m"
RED="\033[0;31m"
NC="\033[0m"

ok()   { echo -e "${GREEN}✓${NC} $1"; }
warn() { echo -e "${YELLOW}⚠${NC}  $1"; }
err()  { echo -e "${RED}✗${NC} $1"; }
sep()  { echo -e "\n────────────────────────────────────────"; }

echo ""
echo "  🎞️  StudioFlow — Setup de entorno local"
sep

# ── 1. Verificar prerequisitos ─────────────────────────────────────────────
echo ""
echo "  Verificando prerequisitos..."

check_cmd() {
  if command -v "$1" &>/dev/null; then
    ok "$1 detectado"
  else
    err "$1 no encontrado — instálalo primero"
    exit 1
  fi
}

check_cmd node
check_cmd npm
check_cmd docker

NODE_VER=$(node --version | sed 's/v//')
NODE_MAJOR=$(echo "$NODE_VER" | cut -d. -f1)
if [ "$NODE_MAJOR" -lt 18 ]; then
  err "Node.js >= 18 requerido (actual: v$NODE_VER)"
  exit 1
fi
ok "Node.js v$NODE_VER"

# ── 2. Crear .env.local si no existe ─────────────────────────────────────────
sep
echo ""
echo "  Configurando variables de entorno..."

if [ ! -f ".env.local" ]; then
  if [ -f ".env.local.example" ]; then
    cp .env.local.example .env.local
    ok ".env.local creado desde .env.local.example"
    warn "Revisa y actualiza .env.local con tus credenciales reales"
  else
    warn ".env.local.example no encontrado — crea .env.local manualmente"
  fi
else
  ok ".env.local ya existe"
fi

# ── 3. Instalar dependencias ──────────────────────────────────────────────────
sep
echo ""
echo "  Instalando dependencias npm..."
npm install --silent
ok "Dependencias instaladas"

# ── 4. Levantar servicios Docker ──────────────────────────────────────────────
sep
echo ""
echo "  Levantando servicios Docker (PostgreSQL + Redis + MinIO)..."

if [ -f "docker-compose.yml" ]; then
  docker compose up -d postgres redis minio 2>/dev/null || docker-compose up -d postgres redis minio 2>/dev/null
  echo "  Esperando que los servicios arranquen..."
  sleep 4
  ok "Servicios Docker levantados"
else
  warn "docker-compose.yml no encontrado — levanta PostgreSQL, Redis y MinIO manualmente"
fi

# ── 5. Generar Prisma Client ──────────────────────────────────────────────────
sep
echo ""
echo "  Generando Prisma Client..."
npm run db:generate --silent
ok "Prisma Client generado"

# ── 6. Ejecutar migraciones ───────────────────────────────────────────────────
echo ""
echo "  Ejecutando migraciones de base de datos..."
npx prisma migrate deploy
ok "Migraciones aplicadas"

# ── 7. Seed inicial ───────────────────────────────────────────────────────────
echo ""
echo "  Cargando datos de ejemplo (seed)..."
npm run db:seed
ok "Seed completado"

# ── 8. Listo ──────────────────────────────────────────────────────────────────
sep
echo ""
echo -e "  ${GREEN}✅ Setup completado!${NC}"
echo ""
echo "  Para iniciar el servidor de desarrollo:"
echo "    npm run dev"
echo ""
echo "  Para el worker de procesamiento de imágenes (terminal separado):"
echo "    npm run dev:worker"
echo ""
echo "  Accede en: http://localhost:3000"
echo "  Login:     owner@studiodemo.com / password123"
sep
echo ""
