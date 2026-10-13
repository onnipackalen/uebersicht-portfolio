#!/bin/bash
# widget_command.sh — what Übersicht runs every 5 s. It never blocks:
#   * fresh cache     -> prints it, status "ready"
#   * stale / missing -> starts portfolio_tracker.py in the background and
#                        prints the last cache (if any), status "loading"
#   * fetch running   -> prints the cache plus the fetch's live progress
#   * how old "fresh" is comes from the tracker: .cache/refresh_after holds
#     its wait in seconds (270 s while a market you hold or watch is open,
#     900 s around the US session, 1800 s when all are closed; never past
#     the next open). Delete the file to go back to 270 s.
#   * after a refresh that left .cache/history.needed behind, a second
#     background job downloads the long price history (older than the one
#     year a refresh fetches) — "historyProgress" in the output while it runs
# It is also the entry point for the widget's + form:
#   widget_command.sh search "company or ticker"   -> JSON matches
#   widget_command.sh quote  TICKER                -> JSON name/price/currency
#   widget_command.sh look   TICKER                -> JSON detail + chart series
#   widget_command.sh watch|unwatch TICKER         -> monitor without holding
#   widget_command.sh buy  TICKER SHARES [--cost X] [--date YYYY-MM-DD]
#   widget_command.sh sell TICKER SHARES|--all [--price X]
#   widget_command.sh sell --reset-all [--if-demo]  -> clear the holdings (--if-demo: only
#                                                     while they are still the demo portfolio)
#   widget_command.sh days BEFORE_DATE [COUNT]     -> older day-by-day rows
#   widget_command.sh alert add TICKER KIND VALUE  -> price alert (JSON only);
#                     alert remove ID | alert list    KIND above|below|
#                                                     pctFromCost|drawdownPct
#   widget_command.sh news TICKER                  -> JSON headlines (only with
#                                                     _settings.news true)
#   widget_command.sh export -> CSVs in ~/Documents/Portfolio (JSON)
#   widget_command.sh import preview|commit --text LIST | --file PATH   (13.4)
#                     import choose          -> a native "choose file" dialog
#   widget_command.sh update check | run [ZIP_URL]   -> the newest release (13.4)
#   widget_command.sh setup run | check   -> run install.sh in Terminal / look again now (13.5)
#
# Python: the first interpreter that can `import yfinance` wins — the path
# written in python.txt (next to this file) if you made one, then the venv
# install.sh creates, then Homebrew, python.org, pyenv and conda installs —
# and is remembered in
# .cache/python_path. Übersicht runs commands with a bare PATH and without
# your shell's environment, so plain "python3" is usually Apple's stub.
#
# Hard-won details (keep them):
#   * The background subshell redirects its own stdin/stdout/stderr so it
#     can't hold Übersicht's output pipe open; the lock file stores $! as
#     captured by the parent.
#   * The cache is replaced only if the tracker exits 0 AND wrote valid JSON.
#   * A failed fetch backs off RETRY_AFTER seconds instead of relaunching on
#     the next 2 s tick (which hammered Yahoo until it rate-limited us), and
#     longer after failures in a row or a "Too Many Requests"; so does a
#     fetch where every price failed (tracker exit 3, last prices shown).
#   * A hung fetch is reclaimed children-first (killing the subshell first
#     orphans the tracker), and only if the PID is still ours — after a
#     reboot a stale lock can name some unrelated process.

MAX_CACHE_AGE=270      # seconds — refetch when the data is older (~4.5 min);
                       # .cache/refresh_after (60..3600) replaces it (13.5)
MAX_FETCH_SECONDS=360  # seconds — a fetch running longer counts as hung
RETRY_AFTER=120        # seconds — wait this long after a FAILED fetch,
MAX_RETRY_AFTER=1800   # ... twice as long after each further failure in a row
                       #     (fetch.failed holds "epoch count"), up to this
RATE_LIMIT_WAIT=900    # ... and at least this long when Yahoo said "Too Many
                       #     Requests" (retrying sooner only extends the block)
MAX_HISTORY_SECONDS=900   # the long-history job: hung after this long
HISTORY_RETRY_AFTER=1800  # ... and retried this long after it failed
HISTORY_REPEAT_AFTER=600  # ... and run again this long after it WORKED, unless
                          # the plan asks for something else (no refresh ->
                          # plan -> job -> refresh loop can hammer Yahoo)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TRACKER="$SCRIPT_DIR/portfolio_tracker.py"
POSITIONS="$SCRIPT_DIR/positions.json"
EXAMPLE="$SCRIPT_DIR/positions.example.json"
CACHE_DIR="$SCRIPT_DIR/.cache"
CACHE_FILE="$CACHE_DIR/data.json"
PROGRESS_FILE="$CACHE_DIR/progress.json"
LOCK_FILE="$CACHE_DIR/fetch.lock"
LOG_FILE="$CACHE_DIR/fetch.log"
FAIL_FILE="$CACHE_DIR/fetch.failed"
SETUP_FILE="$CACHE_DIR/setup_needed"
REQ_FILE="$CACHE_DIR/refresh.request"   # written by the buy/sell helpers
REFRESH_AFTER_FILE="$CACHE_DIR/refresh_after"   # the tracker's wait (13.5)
PY_CACHE="$CACHE_DIR/python_path"
PY_OVERRIDE="$SCRIPT_DIR/python.txt"
HIST_NEEDED="$CACHE_DIR/history.needed"      # written by the tracker
HIST_LOCK="$CACHE_DIR/history.lock"
HIST_PROGRESS="$CACHE_DIR/history_progress.json"
HIST_FAIL="$CACHE_DIR/history.failed"
HIST_LOG="$CACHE_DIR/history.log"
HIST_DONE="$CACHE_DIR/history.done"          # the last plan a job finished

mkdir -p "$CACHE_DIR"

# First run: start from the example portfolio.
if [ ! -f "$POSITIONS" ] && [ -f "$EXAMPLE" ]; then
  cp "$EXAMPLE" "$POSITIONS"
fi

now_epoch() { date +%s; }

# fetch.failed = "epoch count": one more failure in a row
stamp_fail() {
  local n
  n=$(awk '{print $2; exit}' "$FAIL_FILE" 2>/dev/null)
  [[ "$n" =~ ^[0-9]+$ ]] || n=0
  echo "$(now_epoch) $((n + 1))" > "$FAIL_FILE"
}

# Age in seconds of a file's mtime, or 999999 if it doesn't exist / is empty.
file_age_seconds() {
  local path="$1" mtime
  if [ -s "$path" ]; then
    mtime=$(stat -f %m "$path" 2>/dev/null)
    if [[ "$mtime" =~ ^[0-9]+$ ]]; then
      echo $(( $(now_epoch) - mtime ))
      return
    fi
  fi
  echo 999999
}

# stdin -> JSON string literal (for log text in the envelope)
json_string() {
  local s
  s=$(LC_ALL=C tr -d '\000-\010\013\014\016-\037')
  s=${s//"$HOME"/\~}     # keep user names out of screenshots / bug reports
  s=${s//\\/\\\\}
  s=${s//\"/\\\"}
  s=${s//$'\t'/\\t}
  s=${s//$'\r'/}
  s=${s//$'\n'/\\n}
  printf '"%s"' "$s"
}

# a value as one single-quoted shell word: each ' becomes '\'' (13.5)
shq() { printf "'%s'" "$(printf '%s' "$1" | sed "s/'/'\\\\''/g")"; }

# Prints the path of a python3 that has yfinance (or, with "any", any
# python3 at all — the buy/sell helpers only need the standard library).
find_python() {
  local need="$1" p v cached override=""
  [ -s "$PY_OVERRIDE" ] && override=$(head -n 1 "$PY_OVERRIDE" | tr -d '\r')
  if [ "$need" != "any" ] && [ -s "$PY_CACHE" ]; then
    cached=$(cat "$PY_CACHE")
    # a python.txt edited after the cache was written takes over
    if [ -x "$cached" ] && { [ -z "$override" ] || [ "$override" = "$cached" ]; }; then
      echo "$cached"; return 0
    fi
  fi
  local candidates=("$override" "$PORTFOLIO_PYTHON" "$HOME/.portfolio-widget/venv/bin/python3"
                    /opt/homebrew/bin/python3 /usr/local/bin/python3)
  for v in $(ls -d /Library/Frameworks/Python.framework/Versions/3.*/bin/python3 2>/dev/null | sort -rV); do
    candidates+=("$v")
  done
  candidates+=("$HOME/.pyenv/shims/python3" "$HOME/miniconda3/bin/python3"
               "$HOME/anaconda3/bin/python3" /opt/homebrew/anaconda3/bin/python3)
  # Apple's /usr/bin/python3 pops an "install developer tools" dialog when
  # those tools are missing, so only try it when they're installed.
  xcode-select -p >/dev/null 2>&1 && candidates+=(/usr/bin/python3)
  for p in "${candidates[@]}"; do
    [ -n "$p" ] && [ -x "$p" ] || continue
    if [ "$need" = "any" ]; then echo "$p"; return 0; fi
    if "$p" -c "import yfinance" >/dev/null 2>&1; then
      echo "$p" > "$PY_CACHE"
      echo "$p"
      return 0
    fi
  done
  return 1
}

# ---------------------------------------------------------------- + form
case "$1" in
  search|quote|look)
    PY=$(find_python) || {
      echo '{"error": "needs Python with yfinance — run install.sh (see README)"}'
      exit 0
    }
    # JSON on stdout even if the lookup dies (an empty reply left the + form
    # without a message)
    out=$("$PY" "$SCRIPT_DIR/ticker_lookup.py" "$1" "$2" --positions "$POSITIONS" 2>/dev/null)
    [ -n "$out" ] || out='{"error": "lookup failed — Yahoo may be busy, try again in a minute"}'
    printf '%s\n' "$out"
    exit 0
    ;;
  buy|sell|watch|unwatch)
    PY=$(find_python) || PY=$(find_python any) || { echo "error: no python3 found"; exit 1; }
    case "$1" in
      buy)     helper="$SCRIPT_DIR/add_position.py"; set -- "${@:2}" ;;
      sell)    helper="$SCRIPT_DIR/remove_position.py"; set -- "${@:2}" ;;
      watch)   helper="$SCRIPT_DIR/watchlist.py"; set -- add "${@:2}" ;;
      unwatch) helper="$SCRIPT_DIR/watchlist.py"; set -- remove "${@:2}" ;;
    esac
    # stderr folded into stdout: Übersicht's run() treats any stderr output
    # arriving first as a failure, and the form should show the message
    exec "$PY" "$helper" --positions "$POSITIONS" "$@" 2>&1
    ;;
  setting)
    # a setting chosen in the widget, saved in _settings by set_setting.py:
    # the display choices (showBenchmark / graphBig / compact / news /
    # rebalanceWhole true|false|default, where it was dragged, its size, the
    # index to compare with, and display: the windows as JSON, default, or
    # reset-all = every display choice back to default in one write) and,
    # since 13.2, the portfolio's own settings from ⚙ → Portfolio (title,
    # currency, backtestYears, alerts, alertThreshold,
    # portfolioAlertThreshold; "default" removes a key), and cash and
    # invested (13.5: _cash / _invested next to _settings; both ask for a
    # refresh). The value is ONE
    # argument ($3): spaces are allowed ("setting title 'My money'"), and
    # the "--" keeps a negative number like a position -120,40 or a title
    # starting with "-" a value, not an option. A benchmark, currency or
    # backtestYears change also asks for a refresh. Standard library only,
    # JSON on stdout and nothing else: {"ok": true, "key": ..., "value": ...}
    # or {"error": "..."} (shown in the widget as it is)
    PY=$(find_python any) || { echo '{"error": "no python3 found"}'; exit 0; }
    out=$("$PY" "$SCRIPT_DIR/set_setting.py" --positions "$POSITIONS" -- "$2" "$3" 2>/dev/null)
    [ -n "$out" ] || out='{"error": "could not save the setting"}'
    printf '%s\n' "$out"
    exit 0
    ;;
  export)
    # holdings, daily values and sales as CSV files (export.py) in
    # ~/Documents/Portfolio ($PORTFOLIO_EXPORT_DIR overrides): standard
    # library only, no network; JSON on stdout and nothing else
    PY=$(find_python any) || { echo '{"error": "no python3 found"}'; exit 0; }
    out=$("$PY" "$SCRIPT_DIR/export.py" --positions "$POSITIONS" 2>/dev/null)
    [ -n "$out" ] || out='{"error": "export failed"}'
    printf '%s\n' "$out"
    exit 0
    ;;
  alert)
    # price alerts in _alerts (alerts.py): standard library only, JSON on
    # stdout and nothing else. "--": a level like -20% is a value, not an option
    PY=$(find_python any) || { echo '{"error": "no python3 found"}'; exit 0; }
    out=$("$PY" "$SCRIPT_DIR/alerts.py" --json --positions "$POSITIONS" -- "${@:2}" 2>/dev/null)
    [ -n "$out" ] || out='{"error": "could not save the alert"}'
    printf '%s\n' "$out"
    exit 0
    ;;
  news)
    # the latest headlines of one ticker (ticker_lookup.py news), JSON only.
    # With _settings.news off it answers {"on": false} without importing
    # yfinance, so a Python without it will do for that reply
    PY=$(find_python) || PY=$(find_python any) || {
      echo '{"error": "needs Python with yfinance — run install.sh (see README)"}'
      exit 0
    }
    out=$("$PY" "$SCRIPT_DIR/ticker_lookup.py" news --positions "$POSITIONS" -- "$2" 2>/dev/null)
    [ -n "$out" ] || out='{"error": "news unavailable"}'
    printf '%s\n' "$out"
    exit 0
    ;;
  days)
    # older rows of the day-by-day table (.cache/daily_all.json): standard
    # library only, so any python3 does; JSON on stdout and nothing else
    PY=""
    [ -s "$PY_CACHE" ] && PY=$(cat "$PY_CACHE")
    [ -n "$PY" ] && [ -x "$PY" ] || PY=$(find_python any) || PY=""
    out=""
    [ -n "$PY" ] && out=$("$PY" "$TRACKER" --positions "$POSITIONS" \
                            --days-before "$2" --days-count "${3:-400}" 2>/dev/null)
    [ -n "$out" ] || out='{"rows": [], "first": null, "total": 0, "error": true}'
    printf '%s\n' "$out"
    exit 0
    ;;
  import)
    # many holdings at once (import_positions.py, 13.4): "preview" parses
    # a pasted list / a CSV file and answers the rows, "commit" writes them;
    # "choose" shows the Mac's own file dialog and answers {"file": path}.
    # Standard library only, JSON on stdout and nothing else.
    case "$2" in
      choose)
        f=$(osascript -e 'tell application "System Events" to activate' \
              -e 'POSIX path of (choose file with prompt "Pick the list of holdings (CSV or text):" of type {"public.comma-separated-values-text", "public.tab-separated-values-text", "public.plain-text", "public.text", "public.data"})' 2>/dev/null)
        if [ -n "$f" ]; then
          printf '{"file": %s}\n' "$(printf '%s' "$f" | json_string)"
        else
          echo '{"cancelled": true}'
        fi
        exit 0
        ;;
      preview|commit)
        PY=$(find_python any) || { echo '{"error": "no python3 found"}'; exit 0; }
        commit=""; [ "$2" = commit ] && commit="--commit"
        out=$("$PY" "$SCRIPT_DIR/import_positions.py" --positions "$POSITIONS" $commit "${@:3}" 2>/dev/null)
        [ -n "$out" ] || out='{"error": "the import failed"}'
        printf '%s\n' "$out"
        exit 0
        ;;
      *) echo '{"error": "import takes preview, commit or choose"}'; exit 0 ;;
    esac
    ;;
  update)
    # the newest release on GitHub (13.4): "check" asks now (JSON {latest,
    # url, zip, checked, ok}); "run" installs it with update.sh — copied to
    # a temp folder first, since it replaces this folder's files, its own
    # included — and answers its JSON ({ok, from, to, message}; the result
    # is also in .cache/update.result, which the envelope below carries)
    case "$2" in
      check)
        PY=$(find_python any) || { echo '{"error": "no python3 found"}'; exit 0; }
        out=$("$PY" "$TRACKER" --positions "$POSITIONS" --check-update 2>/dev/null)
        [ -n "$out" ] || out='{"error": "the check failed"}'
        printf '%s\n' "$out"
        exit 0
        ;;
      run)
        tmp=$(mktemp -d 2>/dev/null) || tmp="/tmp/portfolio-update.$$"
        mkdir -p "$tmp" && cp "$SCRIPT_DIR/update.sh" "$tmp/update.sh" 2>/dev/null \
          || { echo '{"ok": false, "message": "could not copy update.sh"}'; exit 0; }
        if [ -n "$3" ]; then
          exec bash "$tmp/update.sh" --target "$SCRIPT_DIR" --temp "$tmp" --url "$3" 2>/dev/null
        fi
        exec bash "$tmp/update.sh" --target "$SCRIPT_DIR" --temp "$tmp" 2>/dev/null
        ;;
      *) echo '{"error": "update takes check or run"}'; exit 0 ;;
    esac
    ;;
  setup)
    # the "run setup" chip (13.5): "run" opens Terminal on install.sh — the
    # command reaches AppleScript as argv, so spaces, umlauts and quotes in
    # the folder name need no AppleScript escaping; "check" does what
    # install.sh's last lines do, so the widget looks for Python again now
    # (refresh.request forces one fetch past the back-off; a still-missing
    # Python writes setup_needed again). JSON on stdout only, nothing on
    # stderr — Übersicht's run() treats stderr as a failure.
    case "$2" in
      run)
        cmd="bash $(shq "$SCRIPT_DIR/install.sh")"
        if [ -n "$PORTFOLIO_SETUP_DRYRUN" ]; then
          printf '{"ok": true, "dryRun": true, "command": %s}\n' "$(printf '%s' "$cmd" | json_string)"
          exit 0
        fi
        if osascript -e 'on run argv' -e 'tell application "Terminal"' -e 'activate' \
             -e 'do script (item 1 of argv)' -e 'end tell' -e 'end run' "$cmd" >/dev/null 2>&1; then
          echo '{"ok": true}'
        else
          echo '{"ok": false, "error": "could not open Terminal"}'
        fi
        exit 0
        ;;
      check)
        rm -f "$SETUP_FILE" "$PY_CACHE" 2>/dev/null
        : > "$REQ_FILE" 2>/dev/null
        echo '{"ok": true}'
        exit 0
        ;;
      *) echo '{"error": "setup takes run or check"}'; exit 0 ;;
    esac
    ;;
esac

# ---------------------------------------------------------------- refresh
# job_running LOCK MAX_SECONDS PROGRESS [FAIL]: is the background job whose
# PID is in LOCK alive? A dead PID or one held implausibly long is reclaimed:
# tracker (child) first, then the subshell — and only if that PID is still
# ours (after a reboot a stale lock can name some unrelated process). A hung
# job killed here stamps FAIL, so it backs off like one that failed.
job_running() {
  local lock="$1" max="$2" progress="$3" fail="$4" pid lage
  if [ -f "$lock" ]; then
    pid=$(cat "$lock" 2>/dev/null)
    lage=$(file_age_seconds "$lock")
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null && [ "$lage" -lt "$max" ]; then
      return 0
    fi
    if [ -n "$pid" ] && ps -p "$pid" -o command= 2>/dev/null | grep -q "widget_command.sh"; then
      pkill -P "$pid" 2>/dev/null
      kill "$pid" 2>/dev/null
      [ -n "$fail" ] && date +%s > "$fail"
    fi
    rm -f "$lock" "$progress"
  fi
  return 1
}
is_fetch_running() { job_running "$LOCK_FILE" "$MAX_FETCH_SECONDS" "$PROGRESS_FILE"; }
is_history_running() { job_running "$HIST_LOCK" "$MAX_HISTORY_SECONDS" "$HIST_PROGRESS" "$HIST_FAIL"; }

# what history.needed asks for, without its "t" (a refresh rewrites the same
# plan with a new t): start + symbol/mode pairs, one line
plan_signature() {
  printf 'plan '
  grep -oE '"start": "[^"]*"|"symbol": "[^"]*", "mode": "[^"]*"' "$HIST_NEEDED" 2>/dev/null \
    | LC_ALL=C sort | tr '\n' ' '
}

# The long price history: one download per symbol that lacks it, then the
# job asks for a refresh (refresh.request) that merges it. Only it writes
# history_bars.json; a failure backs off HISTORY_RETRY_AFTER.
start_history_in_background() {
  local sig
  sig=$(plan_signature)
  (
    PY=$(find_python)
    rc=1
    if [ -n "$PY" ]; then
      "$PY" "$TRACKER" --fetch-history --positions "$POSITIONS" \
        --progress-file "$HIST_PROGRESS" > /dev/null 2> "$HIST_LOG"
      rc=$?
    fi
    if [ "$rc" -eq 0 ]; then
      rm -f "$HIST_FAIL"
      printf '%s\n' "$sig" > "$HIST_DONE"
    else
      date +%s > "$HIST_FAIL"
    fi
    rm -f "$HIST_PROGRESS" "$HIST_LOCK"
  ) </dev/null >/dev/null 2>&1 &
  echo $! > "$HIST_LOCK"
  disown
}

start_fetch_in_background() {
  (
    PY=$(find_python)
    if [ -z "$PY" ]; then
      # path shown with ~ and escaped spaces, so it can be pasted as-is
      shown=$(printf '%s' "$SCRIPT_DIR/install.sh" | sed -e "s|^$HOME|~|" -e 's/ /\\ /g')
      printf '%s\n' \
        "This widget needs Python 3 with the yfinance package." \
        "Open Terminal and run:   bash $shown" \
        "(or: python3 -m pip install yfinance — see the README)" \
        > "$SETUP_FILE"
      cp "$SETUP_FILE" "$LOG_FILE"
      stamp_fail
      rm -f "$PROGRESS_FILE" "$LOCK_FILE"
      exit 1
    fi
    rm -f "$SETUP_FILE"
    "$PY" "$TRACKER" --json --positions "$POSITIONS" \
      --progress-file "$PROGRESS_FILE" > "$CACHE_FILE.tmp" 2> "$LOG_FILE"
    rc=$?
    # 3: valid output, but every price request failed (last known prices,
    # marked stale) — shown, and backed off like a failure
    if { [ "$rc" -eq 0 ] || [ "$rc" -eq 3 ]; } && [ -s "$CACHE_FILE.tmp" ] && \
       "$PY" -c "import json,sys; json.load(open(sys.argv[1]))" "$CACHE_FILE.tmp" 2>/dev/null; then
      mv "$CACHE_FILE.tmp" "$CACHE_FILE"
      if [ "$rc" -eq 3 ]; then stamp_fail; else rm -f "$FAIL_FILE"; fi
    else
      rm -f "$CACHE_FILE.tmp"
      stamp_fail
      # yfinance gone from the remembered interpreter? look again next time
      grep -q "yfinance is not installed\|No module named" "$LOG_FILE" 2>/dev/null \
        && rm -f "$PY_CACHE"
    fi
    # once a day after the US close: a dated copy of positions.json (the
    # tracker decides; .cache/backup_state.json keeps it to one per day)
    "$PY" "$TRACKER" --daily-backup --positions "$POSITIONS" >/dev/null 2>&1
    rm -f "$PROGRESS_FILE" "$LOCK_FILE"
  ) </dev/null >/dev/null 2>&1 &
  echo $! > "$LOCK_FILE"
  disown
}

age=$(file_age_seconds "$CACHE_FILE")
fail_age=$(file_age_seconds "$FAIL_FILE")
running=false
is_fetch_running && running=true

# back-off after failures in a row: RETRY_AFTER, doubled per further one up
# to MAX_RETRY_AFTER; RATE_LIMIT_WAIT at least when Yahoo rate-limited us
fail_wait=$RETRY_AFTER
if [ -s "$FAIL_FILE" ]; then
  n=$(awk '{print $2; exit}' "$FAIL_FILE" 2>/dev/null)
  [[ "$n" =~ ^[0-9]+$ ]] || n=1
  while [ "$n" -gt 1 ] && [ "$fail_wait" -lt "$MAX_RETRY_AFTER" ]; do
    fail_wait=$((fail_wait * 2)); n=$((n - 1))
  done
  [ "$fail_wait" -gt "$MAX_RETRY_AFTER" ] && fail_wait=$MAX_RETRY_AFTER
  if [ "$fail_wait" -lt "$RATE_LIMIT_WAIT" ] && \
     grep -qiE 'too many requests|rate.?limit' "$LOG_FILE" 2>/dev/null; then
    fail_wait=$RATE_LIMIT_WAIT
  fi
fi

# the tracker's own wait (slower while the markets are closed), when it
# is a whole number of seconds from 60 to 3600; else MAX_CACHE_AGE
max_age=$MAX_CACHE_AGE
refresh_after=$(cat "$REFRESH_AFTER_FILE" 2>/dev/null)
refresh_after=${refresh_after//[[:space:]]/}
if [[ "$refresh_after" =~ ^[0-9]{2,4}$ ]] && [ "$((10#$refresh_after))" -ge 60 ] && \
   [ "$((10#$refresh_after))" -le 3600 ]; then
  max_age=$((10#$refresh_after))
fi

want_fetch=false
[ "$age" -ge "$max_age" ] && [ "$fail_age" -ge "$fail_wait" ] && want_fetch=true
# A buy/sell asked for fresh data. If a fetch is already running it read the
# old file, so the marker waits and triggers one more fetch after it.
[ -e "$REQ_FILE" ] && want_fetch=true
if [ "$running" = false ] && [ "$want_fetch" = true ]; then
  rm -f "$REQ_FILE"
  start_fetch_in_background
  running=true
fi

# Long history: after a successful refresh asked for it (fetch.failed goes
# only when one works), never alongside the refresh's own start (the first
# load stays fast), and the same plan at most every HISTORY_REPEAT_AFTER.
hist_running=false
is_history_running && hist_running=true
if [ "$hist_running" = false ] && [ "$running" = false ] && [ -s "$HIST_NEEDED" ] && \
   [ -s "$CACHE_FILE" ] && [ ! -s "$FAIL_FILE" ] && \
   [ "$(file_age_seconds "$HIST_FAIL")" -ge "$HISTORY_RETRY_AFTER" ] && \
   { [ "$(file_age_seconds "$HIST_DONE")" -ge "$HISTORY_REPEAT_AFTER" ] || \
     [ "$(plan_signature)" != "$(cat "$HIST_DONE" 2>/dev/null)" ]; }; then
  start_history_in_background
  hist_running=true
fi

# -s (non-empty) rather than -f: a zero-byte file spliced into the envelope
# would produce `"data": ,` — invalid JSON.
cached_json="null"
if [ -s "$CACHE_FILE" ]; then
  cached_json=$(cat "$CACHE_FILE" 2>/dev/null)
  [ -n "$cached_json" ] || cached_json="null"
fi

# progress files are written atomically; the {...} check still keeps a
# damaged one from breaking the whole envelope. 2>/dev/null: a finishing job
# can delete its file between the -s test and cat, and any stderr makes
# Übersicht treat the tick as failed
JSON_OBJECT='^[[:space:]]*\{.*\}[[:space:]]*$'
progress_json="null"
if [ "$running" = true ] && [ -s "$PROGRESS_FILE" ]; then
  progress_json=$(cat "$PROGRESS_FILE" 2>/dev/null)
  [[ $progress_json =~ $JSON_OBJECT ]] || progress_json="null"
fi

history_json="null"
if [ "$hist_running" = true ] && [ -s "$HIST_PROGRESS" ]; then
  history_json=$(cat "$HIST_PROGRESS" 2>/dev/null)
  [[ $history_json =~ $JSON_OBJECT ]] || history_json="null"
fi

last_failed=false
[ -s "$FAIL_FILE" ] && last_failed=true

status="ready"
[ "$running" = true ] && status="loading"
if [ "$cached_json" = "null" ] && [ "$running" = false ]; then
  status="error"
  [ -s "$SETUP_FILE" ] && status="setup"
fi

error_text="null"
if { [ "$status" = "error" ] || [ "$status" = "setup" ] || [ "$last_failed" = true ]; } && [ -s "$LOG_FILE" ]; then
  error_text=$(tail -c 600 "$LOG_FILE" | json_string)
fi

# the last update.sh run, while it is fresh (the footer says "updated to X")
update_json="null"
UPDATE_RESULT="$CACHE_DIR/update.result"
if [ -s "$UPDATE_RESULT" ] && [ "$(file_age_seconds "$UPDATE_RESULT")" -lt 900 ]; then
  update_json=$(head -c 2000 "$UPDATE_RESULT" 2>/dev/null)
  [[ $update_json =~ $JSON_OBJECT ]] || update_json="null"
fi

echo "{\"status\": \"$status\", \"cacheAgeSeconds\": $age, \"lastFetchFailed\": $last_failed, \"progress\": $progress_json, \"historyProgress\": $history_json, \"updateResult\": $update_json, \"data\": $cached_json, \"errorText\": $error_text}"
