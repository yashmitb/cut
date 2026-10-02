#!/usr/bin/env bash
# Rebuild the signed iOS Shortcuts in public/shortcuts from the .cherri sources.
#
# Needs macOS (only Apple's `shortcuts sign` can sign) and the Cherri compiler
# (https://cherrilang.org — `brew install electrikmilk/cherri/cherri`, or set
# CHERRI=/path/to/cherri). The files contain no personal data: each one asks
# for the user's Cut link at install time (an import question).
set -euo pipefail
cd "$(dirname "$0")"
CHERRI="${CHERRI:-cherri}"
OUT="../../public/shortcuts"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$OUT"

# slug:Shortcut Name (must match `#define name` in the source)
for pair in "log-food:Log Food" "tell-cut:Tell Cut" "log-weight:Log Weight" "whats-left:What's Left" "log-favorite:Log Favorite"; do
  slug="${pair%%:*}"; name="${pair#*:}"
  cp "$slug.cherri" "$TMP/"  # Cherri writes "<Name>_unsigned.shortcut" beside the source
  (cd "$TMP" && "$CHERRI" "$slug.cherri" --skip-sign --no-ansi >/dev/null)
  python3 fix-questions.py "$TMP/${name}_unsigned.shortcut"
  shortcuts sign --mode anyone --input "$TMP/${name}_unsigned.shortcut" --output "$OUT/$slug.shortcut"
  echo "signed $OUT/$slug.shortcut"
done
