#!/usr/bin/env bash
# scripts/release.sh — Bumpea versión y dispara el release pipeline
#
# Uso:
#   bash scripts/release.sh <version>
#
# Ejemplos:
#   bash scripts/release.sh 0.1.2     # bugfix
#   bash scripts/release.sh 0.2.0     # nuevas features
#   bash scripts/release.sh 1.0.0     # breaking change / milestone
#
# Qué hace:
#   1. Bumpea version en package.json
#   2. Bumpea version en src-tauri/tauri.conf.json
#   3. Bumpea version en src-tauri/Cargo.toml
#   4. Commit con mensaje "release: vX.Y.Z"
#   5. Crea tag local vX.Y.Z
#   6. Push de main y del tag
#
# El push del tag dispara automáticamente .github/workflows/release.yml
# que compila los binarios firmados, los sube a GitHub Releases y genera
# el latest.json para el updater de Tauri.
#
# Versionado semver:
#   PATCH (X.Y.+1) → bug fixes, sin cambios de comportamiento
#   MINOR (X.+1.0) → features nuevas, backwards compatible
#   MAJOR (+1.0.0) → breaking changes en la app

set -euo pipefail

# --- Validación ---
if [[ $# -lt 1 ]]; then
    echo "ERROR: Falta la versión."
    echo "Uso: bash scripts/release.sh <version>  (ej: 0.1.2)"
    exit 1
fi

VERSION="$1"
TAG="v${VERSION}"

if ! [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    echo "ERROR: La versión debe ser semver válido (ej: 0.1.2, 1.0.0)"
    echo "Recibido: '$VERSION'"
    exit 1
fi

# --- Sanity checks ---
if [[ ! -f package.json ]]; then
    echo "ERROR: ejecutá esto desde la raíz del proyecto"
    exit 1
fi

# Verificar que no hay cambios sin commitear
if [[ -n "$(git status --porcelain)" ]]; then
    echo "ERROR: hay cambios sin commitear. Commiteá o stashea antes."
    git status --short
    exit 1
fi

# Verificar que el tag no existe ya
if git rev-parse "$TAG" >/dev/null 2>&1; then
    echo "ERROR: el tag $TAG ya existe."
    exit 1
fi

# --- Bumpear archivos ---
echo "Bumpeando versión a $VERSION..."

node -e "
const fs = require('fs');

// package.json
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
pkg.version = '$VERSION';
fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');

// src-tauri/tauri.conf.json
const conf = JSON.parse(fs.readFileSync('src-tauri/tauri.conf.json', 'utf8'));
conf.version = '$VERSION';
fs.writeFileSync('src-tauri/tauri.conf.json', JSON.stringify(conf, null, 2) + '\n');

// src-tauri/Cargo.toml
let cargo = fs.readFileSync('src-tauri/Cargo.toml', 'utf8');
cargo = cargo.replace(/^version = \".*\"/m, 'version = \"$VERSION\"');
fs.writeFileSync('src-tauri/Cargo.toml', cargo);

console.log('  package.json -> $VERSION');
console.log('  tauri.conf.json -> $VERSION');
console.log('  Cargo.toml -> $VERSION');
"

# --- Commit + tag + push ---
echo "Creando commit y tag..."
git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml
git commit -m "release: $TAG"
git tag "$TAG"

echo "Pushing a origin..."
git push origin main
git push origin "$TAG"

echo
echo "==========================================="
echo "  Release $TAG disparado"
echo "==========================================="
echo
echo "GitHub Actions va a compilar los binarios ahora."
echo "Seguilo en: https://github.com/AbdielPena/CRM-Client-Fotografia/actions"
echo
echo "Cuando termine (~10-15 min), la Release queda en:"
echo "  https://github.com/AbdielPena/CRM-Client-Fotografia/releases/tag/$TAG"
echo
echo "Los users con la app instalada recibirán el dialog de update"
echo "la próxima vez que la abran."
