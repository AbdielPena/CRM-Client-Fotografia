# 📱 iPad Quickstart — Trabajar sin tu PC

3 pasos para empezar:

## 1️⃣ Habilitar Codespaces (una vez)

En Safari del iPad: `github.com/settings/codespaces`
→ Si dice "Codespaces enabled" ya estás listo. Si no, click **Enable**.

## 2️⃣ Crear tu primer Codespace

1. Ve a `github.com/AbdielPena/CRM-Client-Fotografia`
2. Click verde **"Code"** → tab **"Codespaces"**
3. **"Create codespace on `claude/pensive-cerf-2592e8`"**
4. Espera 3-5 min (instala todo automáticamente)

## 3️⃣ Arrancar Claude desde el iPad

Cuando el codespace cargue:
1. Abre terminal: `Ctrl+J`
2. Edita credenciales: `nano .env.local` (necesitas keys reales de Supabase)
3. Inicia Claude: `claude`
4. Trabaja igual que en tu PC

---

**Documentación completa**: `.devcontainer/README.md`

**Si algo falla**: borra el codespace en `github.com/codespaces` y crea uno nuevo.

**Costo**: gratis hasta 120h/mes. Suspende automáticamente tras 30min sin uso.

---

## App recomendada para iPad

Para mejor experiencia de teclado, instala **GitHub Codespaces** (gratis,
App Store). Te abre el codespace en una app dedicada en vez de Safari.

Alternativas:
- **GitHub Mobile** (gratis) — para revisar PRs, issues, ver código sin editar
- **Working Copy** (pago) — cliente Git nativo para iPad
- **Termius** (free tier) — SSH al VPS (si decides usar opción C en lugar de Codespaces)

---

## Workflow típico desde iPad

```
Mañana:
1. Abrir Codespace (Safari o app)
2. Ver el resumen del post-start.sh
3. `claude` → "qué quedó pendiente?"
4. Claude lee MIGRATION-INDEX.md y te resume

Tarde:
1. "Termina el fix de F5 useActionState"
2. Claude lo hace + commit + push
3. GitHub Actions deploya al VPS automáticamente
4. Validas en my.abbypixel.com desde el iPad

Noche:
1. `/exit` para salir de Claude
2. Cierras la pestaña — Codespace se suspende en 30min
3. Mañana siguiente: arranca en 10 segundos donde lo dejaste
```

¡Eso es todo! 🚀
