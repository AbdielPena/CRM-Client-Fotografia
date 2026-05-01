#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Inicializa el bucket de MinIO para StudioFlow
# Requiere: Docker con MinIO corriendo en localhost:9000
# Uso: bash scripts/minio-init.sh
# ─────────────────────────────────────────────────────────────────────────────

MINIO_URL="http://localhost:9000"
MINIO_USER="${MINIO_ROOT_USER:-minioadmin}"
MINIO_PASS="${MINIO_ROOT_PASSWORD:-minioadmin}"
BUCKET="${S3_BUCKET_NAME:-studioflow}"

echo "🪣  Inicializando MinIO..."
echo "   URL: $MINIO_URL"
echo "   Bucket: $BUCKET"

# Configurar alias
docker exec $(docker ps -q -f name=minio) mc alias set local "$MINIO_URL" "$MINIO_USER" "$MINIO_PASS" 2>/dev/null || true

# Crear bucket si no existe
docker exec $(docker ps -q -f name=minio) mc mb "local/$BUCKET" --ignore-existing 2>/dev/null

# Política pública de solo lectura para carpeta de assets procesados
docker exec $(docker ps -q -f name=minio) mc anonymous set download "local/$BUCKET" 2>/dev/null || true

echo "✅ Bucket '$BUCKET' listo en MinIO"
