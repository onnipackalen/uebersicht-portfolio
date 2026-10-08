#!/bin/bash
# update.sh — replace this widget's code with the newest release from GitHub,
# keeping your data (positions.json, its backups, .cache/, python.txt).
# The widget's "update" link runs it (through widget_command.sh, which first
# copies this script somewhere safe: it replaces its own folder). By hand:
#
#   bash update.sh                      # the newest release
#   bash update.sh --url <zip url>      # a particular release's zip
#
# Steps: download the zip, unzip it, make sure it is a Portfolio.widget
# (index.jsx, widget_command.sh), copy the current code files to
# ~/.portfolio-widget/backups/Portfolio.widget-<version>-<stamp> (the newest
# 3 kept), then move the new files into place one by one (index.jsx last —
# that is what makes Übersicht reload). Nothing of yours is touched. The
# result is written to .cache/update.result as JSON (the widget shows it) and
# printed as JSON. Needs curl and unzip (both part of macOS).
set -u
TARGET="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
URL=""
TMP=""
FORCE=false
while [ $# -gt 0 ]; do
  case "$1" in
    --target) TARGET="$2"; shift 2 ;;
    --url) URL="$2"; shift 2 ;;
    --temp) TMP="$2"; shift 2 ;;
    --force) FORCE=true; shift ;;
    *) echo "{\"ok\": false, \"error\": \"unknown option $1\"}"; exit 1 ;;
  esac
done
[ -n "$URL" ] || URL="${PORTFOLIO_UPDATE_ZIP:-https://github.com/onnipackalen/uebersicht-portfolio/releases/latest/download/Portfolio.widget.zip}"
[ -n "$TMP" ] || TMP="$(mktemp -d 2>/dev/null || echo "/tmp/portfolio-update.$$")"
mkdir -p "$TMP" "$TARGET/.cache"
RESULT="$TARGET/.cache/update.result"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUPS="${PORTFOLIO_UPDATE_BACKUPS:-$HOME/.portfolio-widget/backups}"

version_of() {   # the VERSION constant of an index.jsx (empty when none)
  grep -m1 -oE 'const VERSION = "[0-9.]+"' "$1" 2>/dev/null | grep -oE '[0-9.]+'
}
json_esc() { local s=${1//\\/\\\\}; s=${s//\"/\\\"}; s=${s//$'\n'/ }; printf '%s' "$s"; }
finish() {   # finish ok|fail "message" [to]
  local ok=false; [ "$1" = ok ] && ok=true
  local line="{\"ok\": $ok, \"t\": $(date +%s), \"from\": \"$(json_esc "$CURV")\", \"to\": \"$(json_esc "${3:-}")\", \"message\": \"$(json_esc "$2")\"}"
  printf '%s\n' "$line" > "$RESULT.tmp" && mv -f "$RESULT.tmp" "$RESULT"
  printf '%s\n' "$line"
  rm -rf "$TMP" 2>/dev/null
  [ "$1" = ok ] && exit 0 || exit 1
}

CURV="$(version_of "$TARGET/index.jsx")"
[ -f "$TARGET/widget_command.sh" ] || finish fail "$TARGET is not a Portfolio widget folder"

# download (a file:// URL or a plain path works too — tests)
ZIP="$TMP/Portfolio.widget.zip"
case "$URL" in
  file://*) cp "${URL#file://}" "$ZIP" 2>/dev/null || finish fail "could not read $URL" ;;
  /*) cp "$URL" "$ZIP" 2>/dev/null || finish fail "could not read $URL" ;;
  *) curl -fsSL --max-time 180 --retry 2 -o "$ZIP" "$URL" || finish fail "download failed — is the Mac online? ($URL)" ;;
esac
[ -s "$ZIP" ] || finish fail "the download was empty"
mkdir -p "$TMP/unz"
unzip -q -o "$ZIP" -d "$TMP/unz" 2>/dev/null || finish fail "the download is not a zip file"
NEW="$TMP/unz/Portfolio.widget"
[ -d "$NEW" ] || NEW="$(find "$TMP/unz" -maxdepth 2 -name index.jsx -print -quit 2>/dev/null | xargs -I{} dirname {} 2>/dev/null)"
[ -n "$NEW" ] && [ -f "$NEW/index.jsx" ] && [ -f "$NEW/widget_command.sh" ] && [ -f "$NEW/portfolio_tracker.py" ] \
  || finish fail "the zip does not contain a Portfolio widget"
NEWV="$(version_of "$NEW/index.jsx")"
[ -n "$NEWV" ] || finish fail "the downloaded widget has no version number"
if [ "$FORCE" = false ] && [ -n "$CURV" ]; then
  # newest first: the current version is already the latest (or newer)
  first="$(printf '%s\n%s\n' "$CURV" "$NEWV" | sort -t. -k1,1n -k2,2n -k3,3n | tail -n 1)"
  [ "$first" = "$NEWV" ] && [ "$NEWV" != "$CURV" ] || finish fail "already up to date ($CURV)" "$NEWV"
fi

# a copy of the current code (never the data files) to roll back to
BK="$BACKUPS/Portfolio.widget-${CURV:-unknown}-$STAMP"
mkdir -p "$BK" || finish fail "cannot write $BACKUPS"
for f in "$TARGET"/* "$TARGET"/.gitignore; do
  [ -f "$f" ] || continue
  case "$(basename "$f")" in
    positions*.json|python.txt|.DS_Store|*.pyc) continue ;;
  esac
  cp -p "$f" "$BK/" 2>/dev/null
done
ls -1dt "$BACKUPS"/Portfolio.widget-* 2>/dev/null | tail -n +4 | while read -r old; do rm -rf "$old"; done

# the new files, one atomic rename each; index.jsx last
for f in "$NEW"/* "$NEW"/.gitignore; do
  [ -f "$f" ] || continue
  name="$(basename "$f")"
  case "$name" in
    index.jsx|positions.json|python.txt|.DS_Store) continue ;;
  esac
  cp "$f" "$TARGET/$name.tmp" && mv -f "$TARGET/$name.tmp" "$TARGET/$name" || finish fail "could not write $name"
  case "$name" in *.sh) chmod 755 "$TARGET/$name" ;; *) chmod 644 "$TARGET/$name" ;; esac
done
rm -rf "$TARGET/__pycache__" 2>/dev/null
cp "$NEW/index.jsx" "$TARGET/index.jsx.tmp" && mv -f "$TARGET/index.jsx.tmp" "$TARGET/index.jsx" || finish fail "could not write index.jsx"
chmod 644 "$TARGET/index.jsx"
rm -f "$TARGET/.cache/python_path" "$TARGET/.cache/setup_needed"
date +%s > "$TARGET/.cache/refresh.request"
finish ok "updated from ${CURV:-?} to $NEWV — rollback copy in $BK" "$NEWV"
