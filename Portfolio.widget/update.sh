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
# 3 kept), stage every new file as NAME.tmp, then move them into place one
# by one (index.jsx last — that is what makes Übersicht reload); a failed
# move puts the old files back (13.6). Nothing of yours is touched. The
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
finish() {   # finish ok|fail "message" [to] [rolledBack] [file]
  # rolledBack (true|false) and file (debugging only, never in the message)
  # are added only when given; 13.5's UI ignores them.
  local ok=false; [ "$1" = ok ] && ok=true
  local extra=""
  [ -n "${4:-}" ] && extra="$extra, \"rolledBack\": $4"
  [ -n "${5:-}" ] && extra="$extra, \"file\": \"$(json_esc "$5")\""
  local line="{\"ok\": $ok, \"t\": $(date +%s), \"from\": \"$(json_esc "$CURV")\", \"to\": \"$(json_esc "${3:-}")\", \"message\": \"$(json_esc "$2")\"$extra}"
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
  cp -p "$f" "$BK/" 2>/dev/null || finish fail "could not make the rollback copy — nothing was changed"
done
# cp -p copies a locked (uchg) flag; unlocked, the pruning can delete it
chflags -R nouchg "$BK" 2>/dev/null
ls -1dt "$BACKUPS"/Portfolio.widget-* 2>/dev/null | tail -n +4 | while read -r old; do rm -rf "$old"; done

# The new files in three steps, so a failure never leaves the folder half
# replaced: check (nothing written), stage every file as NAME.tmp (nothing
# live changed yet), then rename them into place, index.jsx last (that is
# what makes Übersicht reload). A failed rename puts back what was already
# moved, from the rollback copy. Lists live in files (bash 3.2 + set -u
# cannot expand an empty array).
new_files() {   # the new files' names, index.jsx last
  local f name
  for f in "$NEW"/* "$NEW"/.gitignore; do
    [ -f "$f" ] || continue
    name="$(basename "$f")"
    case "$name" in
      index.jsx|positions.json|python.txt|.DS_Store) continue ;;
    esac
    printf '%s\n' "$name"
  done
  printf '%s\n' index.jsx
}
set_mode() {   # set_mode FILE NAME: *.sh 755, the rest 644
  case "$2" in *.sh) chmod 755 "$1" ;; *) chmod 644 "$1" ;; esac
}
: > "$TMP/added.list"; : > "$TMP/staged.list"; : > "$TMP/moved.list"
new_files > "$TMP/new.list" || finish fail "could not write the new files — nothing was changed"

# 1. check: a folder where a file goes cannot be replaced
while IFS= read -r name; do
  [ -d "$TARGET/$name" ] && finish fail "a folder is in the way of the update — nothing was changed" "" "" "$name"
  if [ ! -e "$TARGET/$name" ]; then
    printf '%s\n' "$name" >> "$TMP/added.list"
  elif [ ! -f "$BK/$name" ]; then   # not in the rollback copy (an example file)
    { mkdir -p "$TMP/orig" && cp "$TARGET/$name" "$TMP/orig/$name"; } 2>/dev/null \
      || finish fail "could not make the rollback copy — nothing was changed" "" "" "$name"
  fi
done < "$TMP/new.list"

cleanup_staged() {   # cleanup_staged [NAME]: remove every NAME.tmp left
  local n
  while IFS= read -r n; do
    rm -f "$TARGET/$n.tmp"
  done < "$TMP/staged.list"
  [ -n "${1:-}" ] && rm -f "$TARGET/$1.tmp"
  return 0
}

# 2. stage: NAME.tmp next to each file (index.jsx last in the list)
while IFS= read -r name; do
  if ! { cp "$NEW/$name" "$TARGET/$name.tmp" && set_mode "$TARGET/$name.tmp" "$name"; }; then
    cleanup_staged "$name"
    finish fail "could not write the new files — nothing was changed" "" "" "$name"
  fi
  printf '%s\n' "$name" >> "$TMP/staged.list"
done < "$TMP/new.list"

# put back what was already moved: a new file goes, a replaced one comes
# back from the rollback copy; then the staged NAME.tmp files go
rollback() {   # rollback NAME (the file that failed, or "interrupted")
  trap '' INT TERM HUP
  local n src rb_ok=true
  while IFS= read -r n; do
    if grep -qxF "$n" "$TMP/added.list"; then
      rm -f "$TARGET/$n" || rb_ok=false
      continue
    fi
    src="$BK/$n"
    [ -f "$src" ] || src="$TMP/orig/$n"
    cp "$src" "$TARGET/$n.tmp" 2>/dev/null && set_mode "$TARGET/$n.tmp" "$n" && \
      mv -f "$TARGET/$n.tmp" "$TARGET/$n" 2>/dev/null || rb_ok=false
  done < "$TMP/moved.list"
  cleanup_staged "$1"
  if [ "$rb_ok" = true ]; then
    finish fail "the update could not finish — still on ${CURV:-the old version}, nothing lost" "$NEWV" true "$1"
  fi
  finish fail "the update stopped half-way — reinstall from the releases page; holdings are safe" "$NEWV" false "$1"
}

# 3. commit: one atomic rename each, in the staged order (index.jsx last)
trap 'rollback interrupted' INT TERM HUP
while IFS= read -r name; do
  mv -f "$TARGET/$name.tmp" "$TARGET/$name" 2>/dev/null || rollback "$name"
  printf '%s\n' "$name" >> "$TMP/moved.list"
done < "$TMP/staged.list"
trap - INT TERM HUP
rm -rf "$TARGET/__pycache__" 2>/dev/null
rm -f "$TARGET/.cache/python_path" "$TARGET/.cache/setup_needed"
date +%s > "$TARGET/.cache/refresh.request"
finish ok "updated from ${CURV:-?} to $NEWV — rollback copy in $BK" "$NEWV"
