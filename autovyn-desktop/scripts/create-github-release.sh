#!/usr/bin/env bash
set -euo pipefail

# ──────────────────────────────────────────────────────────────
# create-github-release.sh
#
# Builds the desktop agent for the current platform, then
# creates (or updates) a GitHub Release and uploads the
# installer files as release assets.
#
# Prerequisites:
#   1. GitHub CLI installed:  sudo apt install gh   (or brew install gh)
#   2. Authenticated:         gh auth login
#
# Usage:
#   ./scripts/create-github-release.sh              # build current platform
#   ./scripts/create-github-release.sh --skip-build  # upload existing dist/
# ──────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_DIR="$(cd "$PROJECT_DIR/.." && pwd)"

VERSION="$(node -p "require('$PROJECT_DIR/package.json').version")"
TAG="v${VERSION}"

SKIP_BUILD=false
if [[ "${1:-}" == "--skip-build" ]]; then
  SKIP_BUILD=true
fi

echo "═══════════════════════════════════════════"
echo "  Autovyn Desktop — Release ${TAG}"
echo "═══════════════════════════════════════════"

# ── Step 1: Build ──
if [[ "$SKIP_BUILD" == false ]]; then
  echo ""
  echo "▸ Building desktop agent..."
  cd "$PROJECT_DIR"
  case "$(uname -s)" in
    Darwin)
      echo "  macOS detected - building Apple Silicon and Intel DMGs"
      npx electron-builder --mac dmg --x64 --arm64
      ;;
    Linux)
      echo "  Linux detected - building .deb and AppImage packages"
      npx electron-builder --linux deb AppImage
      ;;
    MINGW*|MSYS*|CYGWIN*)
      echo "  Windows shell detected - building NSIS installer"
      npx electron-builder --win nsis --x64
      ;;
    *)
      echo "✘ Unsupported build host: $(uname -s)"
      echo "  Build the desktop app on macOS, Windows, or Linux depending on the installer you need."
      exit 1
      ;;
  esac
  echo "  ✔ Build complete"
fi

# ── Step 2: Collect artifacts ──
DIST_DIR="$PROJECT_DIR/dist"
ASSETS=()

for ext in exe dmg deb AppImage; do
  while IFS= read -r -d '' file; do
    ASSETS+=("$file")
  done < <(find "$DIST_DIR" -maxdepth 1 -iname "*.${ext}" -print0 2>/dev/null)
done

if [[ ${#ASSETS[@]} -eq 0 ]]; then
  echo "✘ No installer files found in $DIST_DIR"
  exit 1
fi

echo ""
echo "▸ Found ${#ASSETS[@]} installer(s):"
for f in "${ASSETS[@]}"; do
  echo "    $(basename "$f")  ($(du -h "$f" | cut -f1))"
done

# ── Step 3: Create or update GitHub Release ──
cd "$REPO_DIR"

echo ""
echo "▸ Creating GitHub release ${TAG}..."

# Check if release already exists
if gh release view "$TAG" &>/dev/null; then
  echo "  Release ${TAG} already exists — uploading new assets (overwriting)..."
  for asset in "${ASSETS[@]}"; do
    gh release upload "$TAG" "$asset" --clobber
    echo "  ✔ Uploaded $(basename "$asset")"
  done
else
  gh release create "$TAG" \
    --title "Autovyn Desktop ${TAG}" \
    --notes "Desktop agent release ${TAG}. Download the installer for your OS below." \
    "${ASSETS[@]}"
  echo "  ✔ Release ${TAG} created with all assets"
fi

echo ""
echo "═══════════════════════════════════════════"
echo "  ✔ Done! Employees can now download from:"
echo "  https://github.com/RAHULSAINI7240/Emp_dashbaord/releases/latest"
echo "═══════════════════════════════════════════"
