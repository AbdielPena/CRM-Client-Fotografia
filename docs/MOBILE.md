# StudioFlow Mobile (iOS + Android)

Las apps móviles son **wrappers nativos** sobre la PWA — comparten exactamente
el mismo código y backend. Capacitor expone APIs nativas (push notifications,
camera, status bar, splash screen, etc.) cuando hace falta.

## Arquitectura

```
┌─────────────────────────────────────┐
│  App nativa (iOS / Android)         │
│  ┌─────────────────────────────┐    │
│  │  WebView                    │    │
│  │  carga app.studioflow.do    │    │
│  └─────────────────────────────┘    │
│  + plugins nativos:                 │
│    @capacitor/app                   │
│    @capacitor/status-bar            │
│    @capacitor/splash-screen         │
│    @capacitor/preferences           │
│    @capacitor/network               │
└─────────────────────────────────────┘
              │ HTTPS
              ▼
   https://app.studioflow.do
   (Next.js + Supabase)
```

**Por qué wrapper y no SSG**: StudioFlow usa Server Actions, Server Components
y RLS. El "next export" estático rompe casi todo. El approach de WebView
funciona porque ya somos PWA-friendly y los plugins de Capacitor cubren las
APIs nativas que necesitamos.

## One-time setup (por desarrollador)

### Para construir Android

1. Instalar **Android Studio** → https://developer.android.com/studio
   (incluye Java JDK + Android SDK)
2. Aceptar licencias de SDK desde Android Studio → SDK Manager
3. Configurar `ANDROID_HOME` (PowerShell):
   ```powershell
   [Environment]::SetEnvironmentVariable("ANDROID_HOME", "$env:LOCALAPPDATA\Android\Sdk", "User")
   ```

### Para construir iOS

1. Necesitas una **Mac** (Apple lo restringe). Alternativas cloud:
   - **Codemagic** (https://codemagic.io) — free tier 500 min/mes
   - **EAS Build** (Expo) — funciona con Capacitor también
   - **GitHub Actions** con runner macOS
2. Instalar **Xcode** desde Mac App Store
3. CocoaPods: `sudo gem install cocoapods`

## Workflow

### Generar/regenerar assets (icon + splash)

```bash
npm run mobile:assets
# Genera resources/{icon,icon-only,icon-foreground,splash,splash-dark}.png
# desde public/icons/icon.svg
```

Después propagar a Android/iOS (usa @capacitor/assets):
```bash
npx capacitor-assets generate
```

### Primera vez: agregar plataformas

```bash
npm run mobile:add:android   # crea carpeta android/
npm run mobile:add:ios       # crea carpeta ios/ (solo en Mac)
```

### Cada vez que cambies código web

```bash
# Si server.url apunta a producción, NO necesitas rebuilder.
# La app móvil carga el SaaS remoto — los deploys son automáticos.

# Si quieres apuntar a tu dev local, define la env var:
$env:CAPACITOR_SERVER_URL = "http://<tu-LAN-IP>:3000"
npm run mobile:sync
```

### Build & test

```bash
# Android Studio
npm run mobile:open:android

# Xcode
npm run mobile:open:ios

# O directo en device/emulador conectado:
npm run mobile:run:android
npm run mobile:run:ios
```

## Configuración server.url

`capacitor.config.ts` lee `CAPACITOR_SERVER_URL` de las env vars. Default:
`https://app.studioflow.do`.

| Caso | Valor |
|---|---|
| Producción (apps en stores) | `https://app.studioflow.do` |
| Staging | `https://staging.studioflow.do` |
| Dev local desde device físico | `http://<tu-LAN-IP>:3000` |
| Emulador Android | usar el alias del host hacia tu localhost |

Después de cambiar la URL siempre `npm run mobile:sync` y rebuild.

## Release a stores

### Android (Google Play)

1. En Android Studio: **Build → Generate Signed Bundle / APK → Android App Bundle**
2. Crea/usa keystore
3. Sube el `.aab` a https://play.google.com/console
4. Notas de versión, screenshots, listing → Submit

### iOS (App Store)

1. En Xcode: **Product → Archive**
2. Window → Organizer → Distribute App
3. Sube via Xcode o Transporter
4. https://appstoreconnect.apple.com — TestFlight + submit

## Push notifications (TODO)

Aún no integradas. Cuando se agreguen:
- Android: Firebase Cloud Messaging (FCM)
- iOS: Apple Push Notification service (APNs)
- Backend: tabla `device_tokens` linkeada a `user_id`, edge function que
  manda el push al recibir un evento (lead nuevo, factura pagada, etc.)
- Plugin Capacitor: `@capacitor/push-notifications`

## Archivos de referencia

- `capacitor.config.ts` — configuración global (appId, plugins, server URL)
- `resources/` — assets fuente (icon 1024, splash 2732)
- `android/` — proyecto Android Studio (generado por `cap add android`)
- `ios/` — proyecto Xcode (generado por `cap add ios` en Mac)
- `scripts/mobile-assets.cjs` — generador de assets desde SVG
