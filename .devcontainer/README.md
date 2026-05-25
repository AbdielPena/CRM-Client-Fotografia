# StudioFlow Codespace — Guía para iPad

Trabajar con Claude Code desde tu iPad mientras la PC está apagada.

## ¿Qué es esto?

Un **GitHub Codespace** es un VSCode completo corriendo en la nube de GitHub
con tu repo precargado. Funciona en Safari del iPad. Claude Code corre
adentro y hace commits/push automáticos.

**Tu PC puede estar apagada.** Todo corre en servidores de GitHub.

---

## Primera vez — Setup desde el iPad

### Paso 1: Abrir el repo en GitHub

En Safari del iPad:
```
https://github.com/AbdielPena/CRM-Client-Fotografia
```

### Paso 2: Crear el Codespace

1. Click botón verde **"Code"** (arriba derecha)
2. Tab **"Codespaces"**
3. **"Create codespace on `claude/pensive-cerf-2592e8`"**
   (o la branch donde quieras trabajar)
4. Esperar ~3-5 min mientras el codespace se prepara
   (instala dependencias, Claude Code, Supabase CLI)

### Paso 3: Tu codespace está listo

Te aparece VSCode dentro del browser con:
- ✅ Repo completo cargado
- ✅ Terminal funcional
- ✅ Claude Code instalado
- ✅ Supabase CLI instalado
- ✅ GitHub CLI instalado
- ✅ Extensiones VSCode preconfiguradas (ESLint, Prettier, Tailwind, etc.)

### Paso 4: Configurar credenciales (una sola vez)

Abre la terminal (`Ctrl+J` o ícono `>_` arriba):

```bash
# Edita .env.local con tus keys reales de Supabase
nano .env.local
# o usa el editor visual: click en el archivo en el panel izquierdo
```

Necesitas reemplazar 3 valores:
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — desde Supabase Dashboard
- `SUPABASE_SERVICE_ROLE_KEY` — desde Supabase Dashboard (es secreto)
- `NEXTAUTH_SECRET` — cualquier string 32+ caracteres random

> 💡 **Tip iPad**: para pegar en nano usa Cmd+V. Para guardar: `Ctrl+O` → Enter → `Ctrl+X`.

---

## Uso diario

### Despertar el codespace

1. Safari → `github.com/codespaces`
2. Click en `studioflow-saas-dev` (o el nombre que le pongas)
3. Espera 10-15 segundos a que arranque

### Trabajar con Claude Code

En la terminal:
```bash
claude
```

Te abre la interfaz interactiva. Escribes lo que necesitas:
- "Termina el fix de useActionState en F5"
- "Corre el typecheck y arregla los errores"
- "Aplica la migration X a Supabase"

Claude hace los cambios, los commit, y los pushea **automáticamente** a GitHub.

### Ver la app en vivo

```bash
npm run dev
```

Codespaces te muestra un toast "Your application running on port 3000 is available."
→ Click **"Open in Browser"** y se abre la app en otra pestaña del iPad.

### Commit + Push manual (si Claude no lo hace)

```bash
git add -A
git commit -m "tu mensaje"
git push
```

Cuando hagas push a `main`, **GitHub Actions deploya automáticamente al VPS**.

---

## Atajos útiles para iPad

| Acción | Atajo |
|---|---|
| Abrir terminal | `Ctrl+J` |
| Cerrar terminal | `Ctrl+J` de nuevo |
| Command palette | `Cmd+Shift+P` |
| Buscar archivo | `Cmd+P` |
| Buscar en todo el repo | `Cmd+Shift+F` |
| Guardar | `Cmd+S` |
| Pegar en nano | `Cmd+V` |
| Salir de Claude Code | `Ctrl+D` o `/exit` |

### Si el teclado iPad no responde bien

Configura **"Conectar con app de escritorio"**:
- Settings → "Open in app" → usa la app **GitHub Codespaces** (gratis en App Store)
- Da mejor experiencia de teclado que Safari

---

## Límites del plan free de Codespaces

- **120 horas/mes gratis** (suficiente para 5h/día × 24 días)
- **15 GB de storage gratis** (suficiente para este repo)
- Codespace se **suspende automáticamente** tras 30 min de inactividad
- Para reanudar: click en el codespace y arranca en 10-15s

**Costos si te pasas:**
- ~$0.18/hora si excedes (4 cores, 8GB)
- Si te preocupa: borra el codespace al volver al PC

---

## Troubleshooting

### "El codespace no arranca"

- Revisa que tengas Codespaces habilitado: `github.com/settings/codespaces`
- Si dice "out of quota", borra codespaces antiguos en `github.com/codespaces`

### "Claude Code no responde"

```bash
# En la terminal del codespace
claude --version
# Si no aparece: re-instala
curl -fsSL https://claude.ai/install.sh | bash
source ~/.bashrc
```

### "npm run dev falla con error de env vars"

Revisa que `.env.local` tenga los valores reales (no los placeholders):
```bash
cat .env.local
```

### "No puedo hacer push"

```bash
gh auth login
# Seguir el flujo de auth con GitHub
```

### "Quiero borrar el codespace y empezar de cero"

`github.com/codespaces` → click los `...` → Delete.
Vuelve a crearlo desde el repo (Paso 2 arriba).

---

## Qué puede hacer Claude desde el Codespace

Todo lo que hago desde tu PC:

- ✅ Leer/escribir archivos del repo
- ✅ Correr `npm`, `git`, `supabase`, `gh` commands
- ✅ Hacer commits y push a GitHub
- ✅ Crear PRs con `gh pr create`
- ✅ Aplicar migraciones a Supabase (con tu service key en `.env.local`)
- ✅ Correr typecheck, lint, build
- ✅ Mergear branches
- ✅ Iniciar/parar dev server

NO puede:
- ❌ Acceder a tu PC apagada (obviamente)
- ❌ Hacer cosas que requieran tu sesión de Stripe/Google (web UIs)
- ❌ SSH al VPS (a menos que pongas las keys ahí, no recomendado)

---

## Para tu viaje específico

**Si solo quieres revisar/mergear PRs**: usa el iPad sin Codespace. La app
de GitHub para iPad alcanza.

**Si quieres seguir desarrollando**: Codespace es el camino.

**Si quieres que se desplieguen cosas automáticamente cuando haya commits**:
ya está configurado vía `.github/workflows/deploy-vps.yml`. Cualquier push
a `main` deploya al VPS.

---

## Comando de bienvenida (al regresar al codespace)

Cada vez que abras el codespace, el script `post-start.sh` te dice:
- Branch actual
- Si hay commits sin pushear
- Si hay archivos sin commit
- Si origin tiene cambios nuevos (sugiere `git pull`)

Útil para retomar donde lo dejaste.

---

¡Buen viaje! 🏖️📱
