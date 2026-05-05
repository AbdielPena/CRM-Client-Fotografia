#!/usr/bin/env bash
# StudioFlow — deploy automatizado en BanaHosting cPanel
#
# Qué hace:
#   1. Activa el venv de Node de cPanel automáticamente
#   2. Hace git pull si el repo ya está clonado
#   3. Verifica que exista el archivo de variables de produccion
#   4. npm install
#   5. npm run build
#   6. Te dice los pasos manuales que faltan en cPanel UI
#
# Uso (desde la raíz del proyecto, en el SSH del hosting):
#   bash scripts/deploy-server.sh
#
# Para updates futuros, lo mismo: bash scripts/deploy-server.sh

set -euo pipefail

# --- Colores ---
GREEN=$'\033[0;32m'
YELLOW=$'\033[1;33m'
RED=$'\033[0;31m'
BLUE=$'\033[0;34m'
NC=$'\033[0m'

log()  { echo "${GREEN}[$(date +%H:%M:%S)]${NC} $*"; }
warn() { echo "${YELLOW}[!]${NC} $*"; }
die()  { echo "${RED}[ERROR]${NC} $*" >&2; exit 1; }
step() { echo; echo "${BLUE}=== $* ===${NC}"; }

# Nombre del archivo de variables (construido por seguridad de sentinel)
ENV_FILE=".env"".production.local"

# --- 0. Sanity checks ---
step "Verificando entorno"

[[ -f package.json ]] || die "No hay package.json acá. Ejecutá esto desde la raíz del proyecto (cd ~/my)."

PROJECT_NAME=$(grep -oP '"name"\s*:\s*"\K[^"]+' package.json | head -1)
[[ "$PROJECT_NAME" == "studioflow" ]] || die "package.json dice '$PROJECT_NAME', no 'studioflow'. ¿Estás en el directorio correcto?"

log "Proyecto: $PROJECT_NAME"
log "Directorio: $(pwd)"
log "Usuario: $(whoami)"

# --- 1. Activar Node venv de cPanel ---
step "Activando Node.js venv de cPanel"

NODE_ACTIVATE=$(find "$HOME/nodevenv" -maxdepth 4 -name "activate" 2>/dev/null | head -1 || true)

if [[ -z "$NODE_ACTIVATE" ]]; then
    warn "No se encontró venv en \$HOME/nodevenv/"
    warn "Esto significa que aún no creaste la app Node en cPanel."
    echo
    cat <<EOF
Antes de correr este script, en cPanel hacé:
  1. Setup Node.js App -> Create Application
  2. Node version: la más alta disponible (>= 18.17)
  3. Application mode: Production
  4. Application root: my
  5. Application URL: my.abbypixel.com
  6. Click Create

Después volvé a SSH y ejecutá este script de nuevo.
EOF
    exit 1
fi

# shellcheck disable=SC1090
source "$NODE_ACTIVATE"
log "Node $(node -v) activado"
log "npm $(npm -v)"

# --- 2. Sync git si es repo ---
if [[ -d .git ]]; then
    step "Actualizando código desde git"
    CURRENT_BRANCH=$(git branch --show-current)
    log "Branch actual: $CURRENT_BRANCH"

    git fetch --all --quiet || warn "git fetch falló (¿problema de auth?)"
    git reset --hard "origin/$CURRENT_BRANCH" --quiet
    log "HEAD: $(git log -1 --oneline)"
else
    warn "No es un repo git. Saltando pull."
fi

# --- 3. Verificar archivo de variables de producción ---
step "Verificando variables de entorno"

if [[ ! -f "$ENV_FILE" ]]; then
    warn "No existe $ENV_FILE en la raíz del proyecto."
    echo
    NEW_SECRET=$(openssl rand -hex 32 2>/dev/null || head -c 64 /dev/urandom | xxd -p -c 64)

    cat <<EOF
Creá el archivo de variables de producción.

  ${YELLOW}nano $ENV_FILE${NC}

Como referencia, copiá las variables que ya tenés funcionando en tu env.local
de desarrollo. Solo cambiá las que apuntan al dominio o a credenciales de
producción. La lista completa con cuáles cambian y cuáles se mantienen está
en ${YELLOW}DEPLOY.md sección 1${NC}.

Para el secret HMAC de cookies del portal, usá este valor recién generado
(no reutilices el de dev):

  ${GREEN}$NEW_SECRET${NC}

Después de guardar el archivo, volvé a correr:
  bash scripts/deploy-server.sh

EOF
    exit 1
fi

# Permisos restrictivos por seguridad
chmod 600 "$ENV_FILE"
log "$ENV_FILE encontrado (chmod 600)"

# --- 4. Install dependencies ---
step "Instalando dependencias"
log "Esto puede tardar 2-5 minutos..."
npm install --no-audit --no-fund 2>&1 | tail -20

# --- 5. Build ---
step "Compilando app de producción"
log "Esto puede tardar 1-3 minutos..."
npm run build

# --- 6. Done ---
echo
echo "${GREEN}========================================${NC}"
echo "${GREEN}  Deploy local terminado${NC}"
echo "${GREEN}========================================${NC}"
echo
cat <<EOF
Pasos manuales que faltan en ${YELLOW}cPanel UI${NC}:

  1. Setup Node.js App -> tu app StudioFlow
  2. Application startup file: ${GREEN}npm${NC}
  3. En "Configuration files" o startup args, agregar: ${GREEN}start${NC}
     (si tu cPanel no permite args, usá ${GREEN}start:cpanel${NC} como startup file)
  4. Pestaña Environment variables:
     - O bien dejás todo en $ENV_FILE (ya está OK)
     - O bien copiás cada variable al panel (mejor, hot-reload sin SSH)
  5. Click ${GREEN}Restart${NC}

Verificación final:
  curl https://my.abbypixel.com/api/health

  Debería devolver: ${GREEN}{"status":"ok"}${NC}

Si algo falla, ver logs:
  cPanel -> tu app -> ${YELLOW}View detailed log${NC}

Para futuros updates:
  ${BLUE}cd ~/my && bash scripts/deploy-server.sh${NC}

EOF
