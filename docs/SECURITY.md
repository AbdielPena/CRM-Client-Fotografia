# Security Notes

Última auditoría: 2026-05-04 (sesión de cleanup)

## Vulnerabilidades aceptadas como deuda

Las siguientes 6 vulnerabilidades de `npm audit` quedan abiertas porque su
remediación requiere un upgrade semver-major con breaking changes.

| Severidad | Paquete | Razón para no actualizar ahora |
|---|---|---|
| **High** | `next` (14.2.x) | Fix requiere Next 15/16 → cambios en App Router, server actions, image optimization. Necesita sesión dedicada con E2E tests. CVEs aplicables: 2 DoS via React Server Components / Server Components. |
| **High** | `electron` (32.x) | Fix requiere Electron 41 → cambios en main process API, preload, contextIsolation. Wrapper desktop tiene exposición limitada vs web. |
| **High** | `eslint-config-next` (14.x) | Solo herramienta de linting. Requiere `eslint-config-next@16` que pide ESLint 9 (otro major). Sin impacto runtime. |
| **High** | `@next/eslint-plugin-next` (transitiva) | Misma raíz que `eslint-config-next`. |
| **High** | `glob` (10.x via eslint-config-next) | Misma raíz. Vulnerabilidad: command injection en CLI `-c/--cmd`, no se invoca desde el código. |
| **Moderate** | `postcss` (transitiva via next) | Bundleada por Next 14, se cierra cuando se actualice Next. |

## Mitigaciones activas

- **Next.js DoS de Server Components**: aplicar rate limiting a nivel proxy
  (Vercel/Cloudflare) para endpoints `/api/*` y rutas que renderizan SC.
  Riesgo de explotación remoto pero no compromete datos.
- **Electron CVEs**: el wrapper desktop solo carga
  `https://app.studioflow.do` (URL controlada) — no permite navegación a
  contenido externo. El blast-radius es contenido al usuario que ejecuta el
  binario.
- **eslint chain**: solo en CI/dev. No corre en producción.

## Plan de remediación

| Cuándo | Qué |
|---|---|
| Próxima ventana de mantenimiento | Migrar a Next 15.x (NO 16) — 15.5+ cierra todos los CVEs aplicables sin saltar otro major |
| Cuando se actualice el wrapper desktop | Subir Electron a la última 41.x. Validar IPC y auto-updater. |
| Junto con migración a ESLint 9 | Subir `eslint-config-next` a 16.x |

## Cómo correr la auditoría

```bash
npm audit                    # vista humana
npm audit --json | jq        # detalle programático
npm audit fix                # solo no-breaking (seguro)
npm audit fix --force        # incluye breaking — NO correr sin probar
```

## Otros hallazgos no-npm

Ver `supabase/migrations/20260504000200_advisor_legacy_cleanup.sql` para
fixes ya aplicados a la DB. Advisors restantes en Supabase (todos
pre-existentes, no causan riesgo real):

- `extension_in_public` (citext, pg_net) — requiere mover de schema con
  audit del código que las usa.
- `*_security_definer_function_executable` — funciones expuestas por diseño
  (RLS helpers, bootstrap de studio). Validan inputs internamente.
- `auth_leaked_password_protection` — toggle del Auth Dashboard, no SQL.
