#!/bin/bash
# install.sh — one-time setup. Creates a private Python environment with
# yfinance in ~/.portfolio-widget/venv (outside the widgets folder, so
# Übersicht doesn't have to scan thousands of package files, and so it
# survives replacing this folder with a newer version). The widget finds it
# on its own.
#
#   bash install.sh
set -e
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV="$HOME/.portfolio-widget/venv"

PY=""
for p in /opt/homebrew/bin/python3 /usr/local/bin/python3 \
         $(ls -d /Library/Frameworks/Python.framework/Versions/3.*/bin/python3 2>/dev/null | sort -rV) \
         python3; do
  if command -v "$p" >/dev/null 2>&1 &&
     "$p" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 9) else 1)' 2>/dev/null; then
    PY="$p"
    break
  fi
done
if [ -z "$PY" ]; then
  echo "Python 3.9 or newer wasn't found."
  echo "Install it from https://www.python.org/downloads/ (or: brew install python), then run this again."
  exit 1
fi

echo "Using $("$PY" --version 2>&1) at $(command -v "$PY")"
mkdir -p "$(dirname "$VENV")"
# one setup at a time (13.5): a second click on "run setup in Terminal" must not
# build the same venv at the same time; a lock left by a crash goes after 30 min
LOCK="$(dirname "$VENV")/install.lock"
find "$LOCK" -maxdepth 0 -mmin +30 -exec rmdir {} \; 2>/dev/null || true
if ! mkdir "$LOCK" 2>/dev/null; then
  echo "setup is already running in another window — let that one finish."
  exit 0
fi
trap 'rmdir "$LOCK" 2>/dev/null' EXIT
"$PY" -m venv "$VENV"
"$VENV/bin/python3" -m pip install --quiet --upgrade pip
"$VENV/bin/python3" -m pip install --quiet -r "$DIR/requirements.txt"
"$VENV/bin/python3" -c "import yfinance; print('yfinance', yfinance.__version__, 'installed')"

# forget any earlier interpreter choice / setup error so the widget re-checks
rm -f "$DIR/.cache/python_path" "$DIR/.cache/setup_needed" "$DIR/.cache/fetch.failed"
echo "Done — the widget will pick this up within a minute or two."
