#!/bin/bash
# <xbar.title>Portfolio</xbar.title>
# <xbar.version>v12.11</xbar.version>
# <xbar.desc>The Übersicht Portfolio widget's total and day change in the menu bar, read from its last cached refresh.</xbar.desc>
# <xbar.dependencies>bash,python3</xbar.dependencies>
# <swiftbar.hideRunInTerminal>true</swiftbar.hideRunInTerminal>
#
# menubar.sh — a SwiftBar / xbar plugin: "$32.3k +0.8%" in the menu bar and a
# short dropdown. It only READS the widget's .cache/data.json (and its mtime):
# no downloads, no refresh, nothing written. Übersicht must be running for the
# numbers to move. Setup (see README): link this file into the plugin folder
# with a refresh interval in the name, e.g. portfolio.1m.sh.
#
# Widget folder: $PORTFOLIO_WIDGET_DIR, else this script's real folder (the
# plugin is usually a symlink), else the default Übersicht widget path.
# Always exits 0 and prints nothing on stderr.

exec 2>/dev/null

no_data() {
  printf '%s\n' "portfolio –" "---" "${1:-no data yet — is the Übersicht widget running?}"
  exit 0
}

# ------------------------------------------------------------ widget folder
widget_dir() {
  local src d t n=0
  if [ -n "${PORTFOLIO_WIDGET_DIR:-}" ]; then
    printf '%s' "$PORTFOLIO_WIDGET_DIR"; return
  fi
  src="${BASH_SOURCE[0]:-$0}"
  while [ -L "$src" ] && [ "$n" -lt 40 ]; do
    case "$src" in */*) d="${src%/*}" ;; *) d=. ;; esac
    t=$(readlink "$src") || break
    case "$t" in /*) src="$t" ;; *) src="$d/$t" ;; esac
    n=$((n + 1))
  done
  case "$src" in */*) d="${src%/*}" ;; *) d=. ;; esac
  d=$(CDPATH= cd -P -- "${d:-/}" && pwd -P)
  if [ -n "$d" ] && [ -f "$d/widget_command.sh" ]; then
    printf '%s' "$d"
  else
    printf '%s' "$HOME/Library/Application Support/Übersicht/widgets/Portfolio.widget"
  fi
}

WIDGET=$(widget_dir)
DATA="$WIDGET/.cache/data.json"
[ -f "$DATA" ] || no_data

# ------------------------------------------------------------ python (stdlib only)
PY=""
if [ -s "$WIDGET/.cache/python_path" ]; then
  IFS= read -r PY < "$WIDGET/.cache/python_path"
  PY="${PY%$'\r'}"
  { [ -f "$PY" ] && [ -x "$PY" ]; } || PY=""
fi
if [ -z "$PY" ]; then
  # Apple's /usr/bin/python3 asks to install developer tools when they are
  # missing, so only use it when they are installed.
  if [ -x /usr/bin/python3 ] && /usr/bin/xcode-select -p >/dev/null 2>&1; then
    PY=/usr/bin/python3
  else
    for p in /opt/homebrew/bin/python3 /usr/local/bin/python3; do
      [ -x "$p" ] && { PY="$p"; break; }
    done
  fi
fi
[ -n "$PY" ] || no_data "python3 not found"

# The Python part uses double quotes only (it sits in a single-quoted string).
CODE='
import json, os, sys, time

SIGNS = {"USD": "$", "CAD": "C$", "AUD": "A$", "NZD": "NZ$", "HKD": "HK$",
         "SGD": "S$", "EUR": "€", "GBP": "£", "JPY": "¥",
         "CNY": "¥", "INR": "₹", "KRW": "₩"}


def num(x):
    if isinstance(x, bool) or not isinstance(x, (int, float)):
        return None
    x = float(x)
    if x != x or x in (float("inf"), float("-inf")):
        return None
    return x


def with_code(sign, body, iso):
    if iso in SIGNS:
        return sign + SIGNS[iso] + body
    return sign + body + (" " + iso if iso else "")


def money(a, iso, signed=False):
    body = "{:,.0f}".format(abs(a))
    neg = a < 0 and body != "0"
    sign = ("-" if neg else "+") if signed else ("-" if neg else "")
    return with_code(sign, body, iso)


def short(v, iso):
    a = abs(v)
    body = "%.0f" % a
    if float(body) >= 1000:
        body = None
        for div, unit in ((1e3, "k"), (1e6, "M"), (1e9, "B"), (1e12, "T")):
            for fmt, lim in (("%.2f", 10), ("%.1f", 100), ("%.0f", 1000)):
                t = fmt % (a / div)
                if float(t) < lim:
                    body = t + unit
                    break
            if body:
                break
        body = body or "%.0f" % a
    sign = "-" if v < 0 and "%.0f" % a != "0" else ""
    return with_code(sign, body, iso)


def pct(p, dp):
    t = ("%+." + str(dp) + "f%%") % p
    return t[1:] if not t.strip("+-0.%") else t  # rounds to zero: no sign


def clean(s, limit):
    s = "".join(" " if ord(c) < 32 or 127 <= ord(c) < 160 or c in "  " else c
                for c in s)
    s = " ".join(s.replace("|", "/").split()).lstrip("-").strip()
    return s[:limit].rstrip()


def ago(sec):
    if sec < 60:
        return "< 1 min"
    if sec < 3600:
        return "%d min" % (sec // 60)
    if sec < 86400:
        return "%d h" % (sec // 3600)
    return "%d d" % (sec // 86400)


def lines(path):
    mtime = os.stat(path).st_mtime
    with open(path, "rb") as f:
        d = json.loads(f.read())
    tot = d.get("totals") if isinstance(d, dict) else None
    value = num(tot.get("value")) if isinstance(tot, dict) else None
    if value is None:
        return None
    cur = d.get("currency")
    iso = cur if isinstance(cur, str) and cur.isalnum() and len(cur) <= 5 else ""
    day, day_pct = num(tot.get("dayChange")), num(tot.get("dayChangePct"))
    pl, pl_pct = num(tot.get("pl")), num(tot.get("plPct"))
    name = clean(d.get("name") if isinstance(d.get("name"), str) else "", 40) or "portfolio"
    out = [short(value, iso) + ("" if day_pct is None else " " + pct(day_pct, 1)), "---",
           "%s · %s" % (name, money(value, iso))]
    if day is not None:
        out.append("today " + money(day, iso, True)
                   + ("" if day_pct is None else " (%s)" % pct(day_pct, 2)))
    if pl is not None:
        out.append("P&L " + money(pl, iso, True)
                   + ("" if pl_pct is None else " (%s)" % pct(pl_pct, 2)))
    out.append("updated %s ago" % ago(max(0.0, time.time() - mtime)))
    out.append("Refresh | refresh=true")
    return out


try:
    res = lines(sys.argv[1])
except Exception:
    res = None
if res:
    sys.stdout.buffer.write(("\n".join(res) + "\n").encode("utf-8"))
'

OUT=$("$PY" -I -S -c "$CODE" "$DATA" </dev/null)
[ -n "$OUT" ] || no_data
printf '%s\n' "$OUT"
exit 0
