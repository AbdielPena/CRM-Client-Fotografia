# StudioFlow

CRM + Client Gallery para fotógrafos profesionales. Inspirado en Pixieset.

## Stack

- **Next.js 14** App Router + TypeScript
- **PostgreSQL** via Prisma ORM
- **Redis** + BullMQ para jobs en background
- **S3-compatible** (Cloudflare R2 / MinIO) para almacenamiento de fotos
- **Resend** para emails transaccionales
- **Stripe** para pagos
- **Sharp** para procesamiento de imágenes

---

## Correr en local (5 minutos)

### 1. Requisitos previos

- [Node.js 20+](https://nodejs.org)
- [Docker Desktop](https://www.docker.com/products/docker-desktop/)

### 2. Clonar e instalar

```bash
# Entrar al directorio
cd studioflow

# Instalar dependencias
npm install
```

### 3. Levantar bases de datos (PostgreSQL + Redis + MinIO)

```bash
docker compose up -d
```

Esto inicia:
- **PostgreSQL** en `localhost:5432`
- **Redis** en `localhost:6379`
- **MinIO** (S3 local) en `localhost:9000` — consola web en `localhost:9001`

### 4. Configurar variables de entorno

```bash
cp .env.example .env
```

El `.env` ya tiene valores listos para desarrollo local. Solo necesitas cambiar:

```env
# Genera un secret seguro:
# node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
NEXTAUTH_SECRET="tu-secret-aqui"
```

Para emails y pagos en desarrollo puedes dejar las claves de ejemplo — las features de Resend y Stripe simplemente no enviarán/procesarán hasta que pongas claves reales.

### 5. Crear la base de datos y el primer usuario

```bash
# Generar el cliente de Prisma
npm run db:generate

# Correr migraciones (crea todas las tablas)
npm run db:migrate

# Poblar con datos de ejemplo (opcional)
npm run db:seed
```

### 6. Iniciar el servidor

```bash
# Terminal 1: Next.js
npm run dev

# Terminal 2: Workers de background (procesamiento de imágenes + emails)
npm run dev:worker
```

Abre [http://localhost:3000](http://localhost:3000) 🎉

---

## Configurar MinIO (almacenamiento local de fotos)

1. Abre [http://localhost:9001](http://localhost:9001)
2. Login: `minioadmin` / `minioadmin`
3. Crea un bucket llamado `studioflow`
4. En **Access Keys** crea una nueva key y cópiala al `.env`:

```env
STORAGE_ENDPOINT="http://localhost:9000"
STORAGE_REGION="us-east-1"
STORAGE_ACCESS_KEY_ID="tu-access-key"
STORAGE_SECRET_ACCESS_KEY="tu-secret-key"
STORAGE_BUCKET="studioflow"
STORAGE_PUBLIC_URL="http://localhost:9000/studioflow"
```

---

## Para producción

### Variables adicionales requeridas

```env
# Resend (emails reales)
RESEND_API_KEY="re_xxxx"
EMAIL_FROM="noreply@tudominio.com"

# Stripe (pagos reales)
STRIPE_SECRET_KEY="sk_live_xxxx"
STRIPE_WEBHOOK_SECRET="whsec_xxxx"
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="pk_live_xxxx"

# Cloudflare R2 (reemplaza MinIO en prod)
STORAGE_ENDPOINT="https://<accountid>.r2.cloudflarestorage.com"
STORAGE_REGION="auto"
STORAGE_ACCESS_KEY_ID="xxxx"
STORAGE_SECRET_ACCESS_KEY="xxxx"
STORAGE_BUCKET="studioflow"
STORAGE_PUBLIC_URL="https://cdn.tudominio.com"
```

### Migrar en producción

```bash
npm run db:migrate:prod
npm run build
npm start
```

---

## Scripts disponibles

| Comando | Descripción |
|---|---|
| `npm run dev` | Next.js en modo desarrollo |
| `npm run dev:worker` | Workers BullMQ en modo watch |
| `npm run build` | Build de producción |
| `npm run db:generate` | Genera el cliente de Prisma |
| `npm run db:migrate` | Crea/aplica migraciones (dev) |
| `npm run db:migrate:prod` | Aplica migraciones (producción) |
| `npm run db:seed` | Datos de ejemplo |
| `npm run db:studio` | Prisma Studio (GUI de la DB) |
| `npm run typecheck` | Verifica tipos TypeScript |

---

## Estructura del proyecto

```
studioflow/
├── app/
│   ├── (auth)/          # Login, registro
│   ├── (studio)/        # Dashboard, CRM, Finanzas, Galerías
│   ├── api/             # API Routes
│   ├── g/[token]/       # Galería pública del cliente
│   └── sign/[token]/    # Firma de contratos
├── components/
│   ├── galleries/       # Uploader, grid, lightbox
│   ├── invoices/        # Builder, registro de pagos
│   ├── contracts/       # Editor, firma
│   ├── leads/           # Pipeline kanban
│   ├── public/          # Vista galería cliente, firma
│   └── shared/          # SearchInput, StatusBadge, etc.
├── server/
│   ├── actions/         # Next.js Server Actions
│   └── services/        # Lógica de negocio
├── emails/              # Templates React Email
├── workers/             # Procesador de imágenes + Emails
├── lib/                 # DB, storage, queue, auth, utils
└── prisma/              # Schema + migraciones
```
