# Iconos del instalador

Antes de correr `npm run dist:win` reemplaza estos archivos con los definitivos:

- `icon.ico` — Windows (múltiples tamaños: 16, 32, 48, 64, 128, 256 px)
- `icon.icns` — macOS
- `icon.png` — Linux / fallback (recomendado 1024×1024)

Recomendación rápida para generarlos desde un PNG 1024×1024:

```bash
# Instalador multi-plataforma
npx electron-icon-maker --input=logo-1024.png --output=./
```

Mientras no existan, electron-builder mostrará un warning pero igual compilará
usando íconos default de Electron.
