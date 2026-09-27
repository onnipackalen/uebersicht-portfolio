#!/usr/bin/env python3
"""
set_setting.py — save one of the widget's display choices in positions.json
(widget_command.sh setting KEY VALUE runs this when you click them).

    python3 set_setting.py showBenchmark false   # "hide" under the graph
    python3 set_setting.py graphBig true         # the ⤢ bigger graph
    python3 set_setting.py compact true          # one line (a click on the title)
    python3 set_setting.py -- position -120,40   # dragged there (x,y of its
                                                 # top-left, screen pixels)
    python3 set_setting.py position default      # back to the className spot
    python3 set_setting.py scale 1.25            # the corner grip, 0.6-1.6
    python3 set_setting.py news true             # headlines on (off = no
                                                 # news requests at all)
    python3 set_setting.py rebalanceWhole false  # rebalance panel: fractional
                                                 # shares (true = whole)
    python3 set_setting.py benchmark SPY         # the index under the graph:
                                                 # a Yahoo symbol, auto (the
                                                 # home currency's) or none
    python3 set_setting.py display '{"windows": [{"id": "main", "w": 720}]}'
                                                 # the windows and what each
                                                 # shows (display_prefs.py)
    python3 set_setting.py display default       # back to the one window
    python3 set_setting.py display reset-all     # display, position, scale,
                                                 # graphBig, showBenchmark and
                                                 # compact all back to default
    python3 set_setting.py -- title "My money"   # the portfolio's name (13.2
                                                 # ⚙ → Portfolio); "" or
                                                 # default = "portfolio"
    python3 set_setting.py currency eur          # the money it is shown in
                                                 # (saved EUR); auto = the
                                                 # Mac's region
    python3 set_setting.py backtestYears max     # history: 3, 5, 10 or max
    python3 set_setting.py alerts true           # big-move notifications
    python3 set_setting.py alertThreshold 7.5    # ... a holding moves more
                                                 # than this % (0.5-50)
    python3 set_setting.py portfolioAlertThreshold 1
                                                 # ... the portfolio moves
                                                 # more than this % (0.1-50)
    python3 set_setting.py rebalanceWhole default
                                                 # let the widget choose

Only these keys, stored under "_settings": showBenchmark, graphBig, compact,
news, rebalanceWhole and alerts as true / false, position as {"x": int,
"y": int} (clamped to sane ranges; "default" removes it), scale as a number
0.6-1.6 ("default" removes it), benchmark as "auto", "none" or a Yahoo
symbol (upper-cased), display as the JSON object display_prefs.py checks
(its text is not lower-cased; "default" removes it, "reset-all" removes it
and position, scale, graphBig, showBenchmark and compact in one write).
The portfolio's own settings (13.2, the ⚙ editor's Portfolio group):
title as the text given (not lower-cased; trimmed, 1-40 characters, no
line breaks; "" or "default" removes it), currency as a 3-letter code
(upper-cased; "auto" or "default" removes it), backtestYears as 3, 5, 10
or "max" ("default" removes it), alertThreshold as a number 0.5-50 and
portfolioAlertThreshold as 0.1-50 (2 decimals; "default" removes them),
alerts and rebalanceWhole also take "default" (removed). Every key is
optional in positions.json: an old file keeps working. What "default"
shows in data.json's "ui" is UI_DEFAULT below.
A benchmark, currency or backtestYears change needs new data, so it also
writes .cache/refresh.request (only when it changed): the widget's next
refresh fetches it. So does a display change whose news page (13.1,
display_prefs.news_plan) asks for headlines the tracker did not plan
before: a new scope, or a picked ticker without a fresh .cache/news.json
entry — at most one such request per NEWS_REQUEST_GAP seconds (the mtime
of .cache/news.request); per, sort, span, group, dense, sources, mute, q
and removals never ask for one. No other key asks for a refresh.
Prints one line of JSON and nothing else: {"ok": true, "key": ...,
"value": ...} (the value as data.json's "ui" shows it) or {"error": "..."}
with exit 1. Standard library only, so any python3 (3.9+) can run it.
"""

import argparse
import contextlib
import io
import json
import os
import re
import sys
import time

import display_prefs
import portfolio_file as pf

KEYS = ("showBenchmark", "graphBig", "compact", "position", "scale", "news",
        "rebalanceWhole", "benchmark", "display",
        # 13.2: the portfolio's own settings
        "title", "currency", "backtestYears", "alerts", "alertThreshold",
        "portfolioAlertThreshold")
TRUE = ("true", "1", "on", "yes")
FALSE = ("false", "0", "off", "no")
DEFAULT = ("default", "reset", "none")
POS_RE = re.compile(r"^(-?\d{1,6}),(-?\d{1,6})$")
X_RANGE = (-10000, 20000)      # screen pixels; the widget keeps 60 px on screen
Y_RANGE = (0, 20000)           # never above the top: the header is the handle
SCALE_RANGE = (0.6, 1.6)
CURRENCY_RE = re.compile(r"^[a-z]{3}$")       # matched after lower-casing
BACKTEST_YEARS = {"3": 3, "5": 5, "10": 10, "max": "max"}
# the two alert thresholds (% moves): (low, high) and the message's words
THRESHOLD_RANGE = {"alertThreshold": (0.5, 50), "portfolioAlertThreshold": (0.1, 50)}
# what data.json's "ui" shows for a key with nothing saved (the tracker's
# defaults: portfolio_tracker.DEFAULT_SETTINGS / ui_settings)
UI_DEFAULT = {"position": None, "scale": 1, "display": None,
              "title": "portfolio", "currency": "auto", "backtestYears": 5,
              "alerts": False, "alertThreshold": 5, "portfolioAlertThreshold": 2.5,
              "rebalanceWhole": None}
# "display reset-all": these keys leave _settings, data.json's "ui" gets
# these values (the tracker's defaults) — one write each
RESET_ALL = (("display", None), ("position", None), ("scale", 1),
             ("graphBig", False), ("showBenchmark", True), ("compact", False))
# a news page change asks for a refresh at most this often (seconds)
NEWS_REQUEST_GAP = 60
NEWS_TTL, NEWS_FAIL_TTL = 1800, 600     # portfolio_tracker.news_fresh, inline


def reply(obj, code=0):
    print(json.dumps(obj))
    sys.exit(code)


class JsonArgs(argparse.ArgumentParser):
    """argparse's usage errors as JSON on stdout, like every other reply."""
    def error(self, message):
        reply({"error": message}, 1)


NUMBER_RE = re.compile(r"^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$")


def clamp(v, lo_hi):
    return max(lo_hi[0], min(lo_hi[1], v))


def parse_number(text, lo_hi):
    """text as a number inside (lo, hi), rounded to 2 decimals (an int when
    whole), or None (also for NaN, inf and words)."""
    # plain decimals only: float() would also take Python spellings such as
    # "1_0" or "nan", which the widget's Number() rejects
    if not NUMBER_RE.match(text):
        return None
    num = float(text)
    if not (lo_hi[0] <= num <= lo_hi[1]):      # also NaN, inf
        return None
    num = round(num, 2)
    return int(num) if num == int(num) else num


def parse_value(key, value):
    """(value to store, None) or (None, error). The stored value None means
    'remove the key' (back to the default)."""
    if key == "display":
        # before lower-casing: feature ids have capitals
        return display_prefs.parse_display(str(value))
    if key == "title":
        # before lower-casing too: the name is kept as typed (trimmed like a
        # window title: display_prefs._title)
        raw = str(value)
        if raw.strip() == "" or raw.strip() == "default":
            return None, None
        t = display_prefs._title(raw)
        if t is None:
            return None, "title must be 1–40 characters (no line breaks), got %r" % value
        return t, None
    text = str(value).strip().lower()
    if key == "currency":
        if text in ("auto", "default"):
            return None, None
        if not CURRENCY_RE.match(text):
            return None, "currency must be a 3-letter code (EUR, GBP, SEK) or auto, got %r" % value
        return text.upper(), None
    if key == "backtestYears":
        if text == "default":
            return None, None
        if text not in BACKTEST_YEARS:
            return None, "backtestYears must be 3, 5, 10 or max, got %r" % value
        return BACKTEST_YEARS[text], None
    if key in THRESHOLD_RANGE:
        if text == "default":
            return None, None
        num = parse_number(text, THRESHOLD_RANGE[key])
        if num is None:
            return None, "%s must be a number from %s to %s or default, got %r" % (
                key, THRESHOLD_RANGE[key][0], THRESHOLD_RANGE[key][1], value)
        return num, None
    if key in ("alerts", "rebalanceWhole") and text == "default":
        return None, None
    if key == "benchmark":
        # auto = DEFAULT_BENCHMARKS for the home currency, none = no index
        # (no requests); else a symbol the tracker's SYMBOL_RE accepts
        if text in ("auto", "default"):
            return "auto", None
        if text in ("none", "off"):
            return "none", None
        sym = text.upper()
        if not pf.TICKER_RE.match(sym):
            return None, "benchmark must be a Yahoo symbol (SPY, XIU.TO, ^GSPC), auto or none, got %r" % value
        return sym, None
    if key == "position":
        if text in DEFAULT:
            return None, None
        m = POS_RE.match(text.replace(" ", ""))
        if not m:
            return None, "position must be X,Y (two whole numbers) or default, got %r" % value
        return {"x": clamp(int(m.group(1)), X_RANGE), "y": clamp(int(m.group(2)), Y_RANGE)}, None
    if key == "scale":
        if text in DEFAULT:
            return None, None
        num = parse_number(text, SCALE_RANGE)
        if num is None:
            return None, "scale must be a number from 0.6 to 1.6 or default, got %r" % value
        return num, None
    if text not in TRUE + FALSE:
        return None, "%s must be true or false, got %r" % (key, value)
    return text in TRUE, None


def same(a, b):
    """equal and of the same type (True == 1 in Python), also inside
    objects and lists (compared as their JSON text, key order included)."""
    if type(a) is not type(b):
        return False
    if isinstance(a, (dict, list)):
        return json.dumps(a) == json.dumps(b)
    return a == b


def patch_cached_ui(positions, updates):
    """Set data.json's "ui" keys ({key: value}) in place: atomic, keeping
    its time stamp (its age decides when prices are fetched next); one
    write for all of them, none when nothing changes. Best effort: without
    a data.json, or on any error, the next refresh carries the settings."""
    path = os.path.join(pf.cache_dir(positions), "data.json")
    tmp = path + ".ui.tmp"          # not data.json.tmp: a fetch writes that one
    try:
        st = os.stat(path)
        with open(path) as f:
            data = json.load(f)
        if not isinstance(data, dict):
            return
        ui = data.get("ui") if isinstance(data.get("ui"), dict) else {}
        todo = [(k, v) for k, v in updates.items() if not (k in ui and same(ui[k], v))]
        if not todo:
            return
        for k, v in todo:
            ui[k] = v
        data["ui"] = ui
        if updates.get("news", True) is False:
            # the movers' headlines go too, not only at the next refresh
            data["news"] = {"on": False}
        with open(tmp, "w") as f:
            json.dump(data, f, separators=(",", ":"), allow_nan=False)
        os.utime(tmp, (st.st_atime, st.st_mtime))
        os.replace(tmp, path)
    except Exception:
        try:
            os.remove(tmp)
        except OSError:
            pass


def news_entry_fresh(entry, now):
    """portfolio_tracker.news_fresh without importing it: t within
    NEWS_TTL, or NEWS_FAIL_TTL for an error entry."""
    t = entry.get("t") if isinstance(entry, dict) else None
    if isinstance(t, bool) or not isinstance(t, (int, float)):
        return False
    return 0 <= now - t < (NEWS_FAIL_TTL if entry.get("error") else NEWS_TTL)


def news_refresh_wanted(old_plan, new_plan, positions):
    """True when the new news plan (display_prefs.news_plan) asks for
    headlines the old one did not: a scope the old plan lacked, or a picked
    ticker it lacked that has no fresh entry in .cache/news.json."""
    if not new_plan:
        return False
    old = old_plan or {"scopes": [], "tickers": []}
    old_scopes = set(old["scopes"])
    if old_plan:
        old_scopes.add("movers")        # the tracker always plans the movers
    if set(new_plan["scopes"]) - old_scopes:
        return True
    new_picks = set(new_plan["tickers"]) - set(old["tickers"])
    if not new_picks:
        return False
    try:
        with open(os.path.join(pf.cache_dir(positions), "news.json")) as f:
            cache = json.load(f)
    except Exception:
        cache = {}
    if not isinstance(cache, dict):
        cache = {}
    now = time.time()
    return any(not news_entry_fresh(cache.get(tk), now) for tk in new_picks)


def request_news_refresh(positions):
    """pf.request_refresh, at most once per NEWS_REQUEST_GAP (a change
    inside that minute waits for the regular refresh). Best effort."""
    try:
        d = pf.cache_dir(positions)
        marker = os.path.join(d, "news.request")
        try:
            if time.time() - os.stat(marker).st_mtime < NEWS_REQUEST_GAP:
                return False
        except OSError:
            pass
        os.makedirs(d, exist_ok=True)
        with open(marker, "w") as f:
            f.write("%d\n" % time.time())
        pf.request_refresh(positions)
        return True
    except Exception:
        return False


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    ap = JsonArgs()
    ap.add_argument("key", nargs="?", default="")
    ap.add_argument("value", nargs="?", default="")
    ap.add_argument("--positions", default=os.path.join(here, "positions.json"))
    args = ap.parse_args()

    if args.key not in KEYS:
        reply({"error": "unknown setting %r (one of: %s)" % (args.key, ", ".join(KEYS))}, 1)
    value, err = parse_value(args.key, args.value)
    if err:
        reply({"error": err}, 1)
    if not os.path.exists(args.positions):
        reply({"error": "no positions file yet"}, 1)

    # portfolio_file's load/save: pf.fail prints plain text and exits, so
    # its message is caught and passed on as JSON
    buf = io.StringIO()
    try:
        with contextlib.redirect_stdout(buf):
            raw = pf.load(args.positions)
            settings = raw.get("_settings")
            if settings is None:
                settings = raw["_settings"] = {}
            if not isinstance(settings, dict):
                pf.fail("_settings in positions.json should be an object — fix it first")
            changed = False
            old_plan = display_prefs.news_plan(settings.get("display")) if args.key == "display" else None
            if value is display_prefs.RESET:   # "display reset-all"
                for k, _ in RESET_ALL:
                    if k in settings:
                        del settings[k]
                        changed = True
            elif value is None:                # "default": remove the key
                if args.key in settings:
                    del settings[args.key]
                    changed = True
            elif not (args.key in settings and same(settings[args.key], value)):
                settings[args.key] = value
                changed = True
            if changed:
                pf.save(args.positions, raw)
        # the widget already shows the change; the cached data.json gets it
        # too, so a restart starts in it — no fetch for a display choice
        if value is display_prefs.RESET:
            patch_cached_ui(args.positions, dict(RESET_ALL))
        else:
            patch_cached_ui(args.positions, {
                args.key: UI_DEFAULT.get(args.key) if value is None else value})
        if args.key in ("benchmark", "currency", "backtestYears") and changed:
            # new data needed (none for the choice already saved): one fetch
            # with the new index / in the new currency / over the longer
            # history (whose long history the history job then plans like
            # any other). No other key asks for one.
            pf.request_refresh(args.positions)
        if args.key == "display" and changed and value is not display_prefs.RESET:
            # a news page asking for headlines the tracker never planned
            if news_refresh_wanted(old_plan, display_prefs.news_plan(settings.get("display")),
                                   args.positions):
                request_news_refresh(args.positions)
    except SystemExit:
        msg = buf.getvalue().strip()
        reply({"error": msg[len("error: "):] if msg.startswith("error: ") else msg or "failed"}, 1)
    except Exception as e:
        reply({"error": "could not save: %s" % e}, 1)
    if value is display_prefs.RESET:
        reply({"ok": True, "key": args.key, "value": None,
               "reset": [k for k, _ in RESET_ALL]})
    reply({"ok": True, "key": args.key,
           "value": UI_DEFAULT.get(args.key) if value is None else value})


if __name__ == "__main__":
    main()
