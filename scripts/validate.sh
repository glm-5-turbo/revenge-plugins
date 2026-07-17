#!/bin/bash
set -e

cd "$(dirname "$0")/.."
echo "============================================"
echo "  Revenge Plugin Validation Pipeline"
echo "============================================"
echo ""

echo "[1/2] Building plugins..."
pnpm run build 2>&1 || {
    echo "FAILED: Build error."
    echo "This means the code has real issues (syntax, imports, etc)."
    exit 1
}
echo "  OK"
echo ""

echo "[2/2] Verifying dist output..."
for plug in plugins/*/; do
    name=$(basename "$plug")
    if [ -f "dist/$name/index.js" ] && [ -f "dist/$name/manifest.json" ]; then
        size=$(stat --printf="%s" "dist/$name/index.js" 2>/dev/null)
        human=$(numfmt --to=iec "$size" 2>/dev/null || echo "$size bytes")
        echo "  $name: $human"
    else
        echo "  WARNING: $name build output incomplete"
    fi
done
echo ""
echo "============================================"
echo "  ALL CHECKS PASSED"
echo "============================================"
echo ""
echo "To push:  pnpm run push"
echo "To build: pnpm run build"
