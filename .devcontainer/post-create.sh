#!/bin/bash
# ============================================================================
# StudioFlow Codespace — post-create setup
# ============================================================================
# Se ejecuta UNA VEZ al crear el codespace. Instala:
#   - npm dependencies
#   - Supabase CLI
#   - Claude Code CLI
#   - GitHub CLI (ya viene en features)
#   - .env.local con placeholders
#
# Si algo falla, el codespace sigue funcional — los errores no son fatales.
# ============================================================================

set +e  # no exit on error (best-effort)

echo ""
echo "=========================================="
echo "🎬 StudioFlow Codespace Setup"
echo "=========================================="
echo ""

# ─── 1. NPM dependencies ────────────────────────────────────────────────────
echo "📦 [1/5] Installing npm dependencies..."
if [ -f package-lock.json ]; then
  npm ci --legacy-peer-deps 2>&1 | tail -20
else
  npm install --legacy-peer-deps 2>&1 | tail -20
fi
echo "✅ npm install done"
echo ""

# ─── 2. Supabase CLI ────────────────────────────────────────────────────────
echo "📦 [2/5] Installing Supabase CLI..."
if ! command -v supabase &> /dev/null; then
  SUPABASE_VERSION="v1.226.4"
  ARCH=$(uname -m)
  if [ "$ARCH" = "x86_64" ]; then ARCH="amd64"; fi
  if [ "$ARCH" = "aarch64" ]; then ARCH="arm64"; fi

  curl -fsSL "https://github.com/supabase/cli/releases/download/${SUPABASE_VERSION}/supabase_linux_${ARCH}.tar.gz" \
    -o /tmp/supabase.tar.gz
  tar -xzf /tmp/supabase.tar.gz -C /tmp
  sudo mv /tmp/supabase /usr/local/bin/supabase 2>/dev/null || mv /tmp/supabase ~/.local/bin/supabase
  rm -f /tmp/supabase.tar.gz
  echo "✅ Supabase CLI installed: $(supabase --version 2>&1 | head -1)"
else
  echo "✅ Supabase CLI already installed: $(supabase --version 2>&1 | head -1)"
fi
echo ""

# ─── 3. Claude Code CLI ─────────────────────────────────────────────────────
echo "🤖 [3/5] Installing Claude Code CLI..."
if ! command -v claude &> /dev/null; then
  curl -fsSL https://claude.ai/install.sh | bash 2>&1 | tail -5
  # Add to PATH if installed to ~/.local/bin
  if [ -f ~/.local/bin/claude ]; then
    export PATH="$HOME/.local/bin:$PATH"
    echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
  fi
  echo "✅ Claude Code installed"
else
  echo "✅ Claude Code already installed"
fi
echo ""

# ─── 4. .env.local setup ────────────────────────────────────────────────────
echo "📄 [4/5] Setting up .env.local..."
if [ ! -f .env.local ]; then
  if [ -f .env.example ]; then
    cp .env.example .env.local
    echo "✅ .env.local created from .env.example"
    echo ""
    echo "⚠️  IMPORTANT — edit .env.local with your REAL Supabase keys:"
    echo "   1. Open https://supabase.com/dashboard/project/kbrcqyjnrbjlzfolpcsx/settings/api"
    echo "   2. Copy 'anon public' key → NEXT_PUBLIC_SUPABASE_ANON_KEY"
    echo "   3. Copy 'service_role' key (SECRET) → SUPABASE_SERVICE_ROLE_KEY"
    echo "   4. Set NEXTAUTH_SECRET to a random 32+ char string"
    echo ""
  else
    echo "⚠️  No .env.example found"
  fi
else
  echo "✅ .env.local already exists"
fi
echo ""

# ─── 5. Git config ──────────────────────────────────────────────────────────
echo "🔧 [5/5] Git configuration..."
git config --global pull.rebase false
git config --global init.defaultBranch main
git config --global core.autocrlf input
git config --global push.default current

# Set user if not set (usar el de GitHub Codespaces si está disponible)
if [ -z "$(git config --global user.email)" ]; then
  git config --global user.email "${GITHUB_USER:-$(whoami)}@users.noreply.github.com"
  git config --global user.name "${GITHUB_USER:-$(whoami)}"
fi
echo "✅ Git configured"
echo ""

# ─── Done ───────────────────────────────────────────────────────────────────
echo "=========================================="
echo "🎉 Setup complete!"
echo "=========================================="
echo ""
echo "Quick commands:"
echo "  npm run dev        # Start Next.js (port 3000)"
echo "  claude             # Start Claude Code CLI (interactive)"
echo "  npm run lint       # Run ESLint"
echo "  npx tsc --noEmit   # Typecheck"
echo "  gh pr list         # GitHub CLI"
echo "  supabase --help    # Supabase CLI"
echo ""
echo "Documentation:"
echo "  .devcontainer/README.md             # This Codespace guide"
echo "  docs/DEPLOYMENT-CHECKLIST.md        # What to do for deploy"
echo "  docs/REACT18-FIX-CHECKLIST.md       # Pending useActionState fix"
echo "  docs/MIGRATION-INDEX.md             # Full project status"
echo ""
echo "Branches with pending work:"
echo "  claude/f5-finance-schema    # 7 forms aún con useActionState"
echo "  claude/f6-mail-schema       # 3 forms aún con useActionState"
echo ""

exit 0
