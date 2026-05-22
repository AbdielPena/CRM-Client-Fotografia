#!/bin/bash
# ============================================================================
# StudioFlow Codespace — post-start (cada vez que el codespace despierta)
# ============================================================================
# Comandos rápidos al iniciar el codespace. NO instala nada (eso es post-create).
# ============================================================================

set +e

echo ""
echo "👋 Welcome back to StudioFlow!"
echo ""

# Check si hay updates
echo "🔄 Fetching latest from origin..."
git fetch --all --prune 2>&1 | tail -3 || echo "  (no network or first start)"
echo ""

# Status del repo
BRANCH=$(git branch --show-current 2>/dev/null || echo "?")
echo "📍 Current branch: $BRANCH"

UNCOMMITTED=$(git status --short 2>/dev/null | wc -l || echo "0")
if [ "$UNCOMMITTED" -gt 0 ]; then
  echo "⚠️  $UNCOMMITTED uncommitted changes"
fi

# Behind/ahead with origin
AHEAD=$(git rev-list --count HEAD ^origin/$BRANCH 2>/dev/null || echo "0")
BEHIND=$(git rev-list --count origin/$BRANCH ^HEAD 2>/dev/null || echo "0")
if [ "$AHEAD" -gt 0 ]; then echo "⬆️  $AHEAD commits ahead of origin"; fi
if [ "$BEHIND" -gt 0 ]; then echo "⬇️  $BEHIND commits behind origin (consider git pull)"; fi
echo ""

echo "Ready! Run 'claude' to start Claude Code or 'npm run dev' for the app."
echo ""

exit 0
