#!/bin/bash
set -e
cd "$(dirname "$0")/.."
echo "=== Running validation..."
bash scripts/validate.sh || exit 1
echo ""
echo "=== Pushing to GitHub..."
git add -A
git commit -m "auto: build $(date +%Y-%m-%d_%H:%M)" 2>/dev/null || echo "Nothing new to commit"
git push origin main 2>&1 || { echo "FAILED: Git push."; exit 1; }
echo ""
echo "=== Done! Plugin updated on GitHub."
echo "Revenge will auto-update on your device."
