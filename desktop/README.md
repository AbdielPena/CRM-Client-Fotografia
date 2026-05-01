# StudioFlow Desktop (Electron)

Thin shell Electron que carga el SaaS hospedado y añade:

- Ventana nativa con icono, atajos y zoom
- Auto-update vía `electron-updater` + GitHub Releases
- Notificaciones nativas de Windows
- Single-instance lock (no abre dos ventanas al doble-click)
- Apertura de links externos en el navegador del sistema

## Arquitectura

```
desktop/
├── main.js         # Main process (BrowserWindow + auto-updater)
├── preload.js      # Context bridge → expone window.studioflow en el SaaS
├── assets/         # Iconos (icon.ico / icon.icns / icon.png)
└── launch.js       # Launcher legacy (Chrome --app mode), aún disponible
electron-builder.yml  # Build config
```

## Comandos

```bash
# Dev (carga http://localhost:3000 — requiere `npm run dev` corriendo)
npm run electron:dev

# Build para Windows (produce .exe + blockmap + latest.yml)
npm run dist:win

# Publicar release en GitHub (requiere GH_TOKEN con permiso repo)
npm run release
```

El output del build va a `dist-electron/`:

- `StudioFlow-Setup-X.Y.Z.exe` — instalador NSIS per-user (sin UAC)
- `latest.yml` — manifiesto que lee `electron-updater`
- `.blockmap` — delta-updates (solo descarga lo que cambió)

## Auto-update

Config en `electron-builder.yml → publish.github`. El main process hace:

1. Al arrancar (tras 5s): `autoUpdater.checkForUpdatesAndNotify()`
2. Cada 4h mientras está abierto
3. En el menú StudioFlow → "Buscar actualizaciones"

Para que funcione, subir el release a GitHub con `npm run release`. Electron
lee `latest.yml` desde los assets del release y descarga el `.exe` nuevo en
background; avisa al usuario cuando está listo para reiniciar.

## URL que carga la app

- **Dev** (`!app.isPackaged`): `http://localhost:3000`
- **Prod**: `process.env.STUDIOFLOW_URL` o `https://app.studioflow.do` por default

Para apuntar a staging o a un studio específico, bastaría setear
`STUDIOFLOW_URL` antes de lanzar el binario (o hardcodear en main.js).

## Feature-detect desde el código web

El preload expone `window.studioflow`:

```ts
if (typeof window !== 'undefined' && window.studioflow?.isDesktop) {
  // Estamos en la app desktop — podemos mostrar botón "Buscar actualizaciones"
  const version = await window.studioflow.getVersion()
}
```

Útil para mostrar UI diferenciada (ej. "Versión 1.2.3 — actualizar") sólo en
la app, no en la web normal.

## Firma de código (TODO para distribución pública)

Hoy `verifyUpdateCodeSignature: false` — Windows marcará el .exe como
"no firmado" en SmartScreen hasta comprar un certificado EV/OV. Pendiente:

1. Comprar certificado (DigiCert, Sectigo) — ~$300/año
2. Setear `CSC_LINK` + `CSC_KEY_PASSWORD` en CI
3. `verifyUpdateCodeSignature: true` en `electron-builder.yml`
