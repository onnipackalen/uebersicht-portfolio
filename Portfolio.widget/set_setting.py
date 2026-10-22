#!/usr/bin/env python3
"""
set_setting.py — save one of the widget's display choices in positions.json
(13.4: also theme dark|light|auto, opacity 0.3-1, updates / welcome true|false,
and "portfolio reset-all", which drops every portfolio setting in one write)
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
    python3 set_setting.py cash 'CAD 1200'       # cash on hand (13.5): a
                                                 # currency and an amount
    python3 set_setting.py cash 'CAD default'    # ... that currency's gone
    python3 set_setting.py invested 25000        # the money put in (13.5)
    python3 set_setting.py targets '{"Tech": 30, "cash": 10}'
                                                 # the target mix (13.6)
    python3 set_setting.py targets default       # ... no target mix
    python3 set_setting.py goal 'CAD 250000 2035'  # a goal (13.6): reach
                                                 # this much by Dec 31 2035
                                                 # (or a day: 2035-06-30)
    python3 set_setting.py goal default          # ... no goal

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
optional in positions.json: an old file keeps working. targets (13.6,
⚙ → Portfolio) is the target mix as a JSON object {name: 0-100}, stored
as _settings.targets in the shape 13.5 already reads: a name is "cash"
(any case, stored "cash"), a held ticker (stored as held) or a sector as
data.json's themes spell it (any case; without a data.json yet a name is
kept as typed); at most 80 names of 1-40 characters, no name twice (case
ignored), and not a ticker together with its own sector; a number is
stored whole or with 2 decimals; "", "default", "none" or {} removes it.
"portfolio reset-all" leaves it. goal (13.6, ⚙ → Portfolio) is stored
as _settings.goal {"value": amount, "date": "YYYY-MM-DD", "cur": CUR} (a
year alone means Dec 31; the date must be after today and within 60
years; cur is the currency the amount is in); "default" removes it, it
asks for no refresh (the widget works out the progress itself) and
"portfolio reset-all" leaves it. What "default"
shows in data.json's "ui" is UI_DEFAULT below.
Cash on hand and the money put in (13.5, ⚙ → Portfolio) are data, not
settings: they are stored next to _settings, not in it, as "_cash"
({"CAD": 1200}, the code upper-cased) and "_invested" (a number), and
"portfolio reset-all" leaves them. cash takes 'CUR AMOUNT' (sets that
currency; an amount of 0 removes it), 'CUR default' (removes it) or
'default' (removes all cash); invested takes an amount or 'default' (or
0, removing it). Amounts may be typed 1200, 1 200, 1'200, 1,250.50 or
99,5 (0 to 1e12, 2 decimals). Both reply with the value as data.json's
"ui" shows it: cash as the whole {CUR: amount} object ({} when none),
invested as a number or null.
A benchmark, currency, backtestYears or targets change needs new data
(REFRESH_KEYS; the rebalance plan comes from the tracker), so it also
writes .cache/refresh.request (only when it changed): the widget's next
refresh fetches it. So does a display change whose news page (13.1,
display_prefs.news_plan) asks for headlines the tracker did not plan
before: a new scope, or a picked ticker without a fresh .cache/news.json
entry — at most one such request per NEWS_REQUEST_GAP seconds (the mtime
of .cache/news.request); per, sort, span, group, dense, sources, mute, q
and removals never ask for one. A cash or invested change asks for one
too (the totals and the returns use them). No other key asks for a refresh.
13.6: before every write that changes something, positions.json is copied
to positions.backup-YYYYMMDD-HHMMSS-setting.json next to it (at most one
per 10 s, the newest 10 kept; the -import, -daily and plain backups are
not touched), and what changed (each key's value before and after) goes
on a short undo stack in .cache/setting_undo.json (5 records, 1 day;
same-key changes within 10 s merge, so undo goes back to before a drag).
A success reply then also has "undo": {"id", "key", "label", "t"}.

    python3 set_setting.py undo                  # put back the last change
    python3 set_setting.py undo 1792300000123    # ... only if it is still
                                                 # that one (the reply's id)

undo [ID] restores only the recorded keys (a buy or sale since stays). It
refuses when the newest record is not ID, or when one of its keys changed
since (that record is dropped). It replies {"ok": true, "key": "undo",
"value": null, "undone": {"key", "label"}, "ui": {...}, "next": the next
record or null}; the undo itself pushes no record (no redo).
Prints one line of JSON and nothing else: {"ok": true, "key": ...,
"value": ...} (the value as data.json's "ui" shows it) or {"error": "..."}
with exit 1. Standard library only, so any python3 (3.9+) can run it.
"""

import argparse
import contextlib
import io
import json
import math
import os
import re
import sys
import time
from datetime import date

import display_prefs
import portfolio_file as pf

KEYS = ("showBenchmark", "graphBig", "compact", "position", "scale", "news",
        "rebalanceWhole", "benchmark", "display",
        # 13.2: the portfolio's own settings
        "title", "currency", "backtestYears", "alerts", "alertThreshold",
        "portfolioAlertThreshold",
        # 13.4: appearance, the update check, the welcome card, and
        # "portfolio reset-all" (every portfolio setting back to its default)
        "theme", "opacity", "updates", "welcome", "portfolio",
        # 13.5: cash on hand and the money put in (⚙ → Portfolio)
        "cash", "invested",
        # 13.6: put back the last settings change (undo_last)
        "undo",
        # 13.6: the target mix (⚙ → Portfolio)
        "targets",
        # 13.6: the goal (⚙ → Portfolio)
        "goal")
# a change of these needs new data: .cache/refresh.request when it changed
# (also for "portfolio reset-all", see main)
# 13.6: "targets" too: the rebalance plan and the off-target figures are
# worked out only by the tracker
REFRESH_KEYS = ("benchmark", "currency", "backtestYears", "targets")
# 13.6: what each key is called in "undo: ..." — the ⚙ row's label as a
# noun phrase, so the terminal and the widget say the same words. Always
# read with LABELS.get(key, key): a key without a label never raises
LABELS = {"showBenchmark": "the index line", "graphBig": "the bigger graph",
          "compact": "the one-line view", "position": "where the widget sits",
          "scale": "the widget's size", "news": "headlines",
          "rebalanceWhole": "how rebalancing rounds", "benchmark": "the index",
          "display": "what a window shows", "title": "the portfolio name",
          "currency": "the currency", "backtestYears": "the history length",
          "alerts": "big-move alerts", "alertThreshold": "the alert level for a holding",
          "portfolioAlertThreshold": "the alert level for the portfolio",
          "theme": "the look", "opacity": "the background", "updates": "the update check",
          "welcome": "the welcome card", "portfolio": "the portfolio settings",
          "cash": "cash on hand", "invested": "money put in so far",
          "targets": "the target mix", "goal": "the goal"}
RESET_LABELS = {"display": "reset of all windows",
                "portfolio": "reset of the portfolio settings"}
# 13.5: keys stored at the top of positions.json, next to _settings (not in
# it): they are data, not settings, so "portfolio reset-all" leaves them
TOP_LEVEL = {"cash": "_cash", "invested": "_invested"}
AMOUNT_RANGE = (0, 1e12)                    # cash / invested, in money
THEMES = ("dark", "light", "auto")          # auto = follow the Mac's appearance
OPACITY_RANGE = (0.3, 1)                    # how solid the window's background is
TRUE = ("true", "1", "on", "yes")
FALSE = ("false", "0", "off", "no")
DEFAULT = ("default", "reset", "none")
POS_RE = re.compile(r"^(-?\d{1,6}),(-?\d{1,6})$")
X_RANGE = (-10000, 20000)      # screen pixels; the widget keeps 60 px on screen
Y_RANGE = (0, 20000)           # never above the top: the header is the handle
SCALE_RANGE = (0.6, 1.6)
CURRENCY_RE = re.compile(r"^[a-z]{3}$")       # matched after lower-casing
# the goal (13.6): a year (Dec 31) or a day, at most this many years ahead
GOAL_YEARS_MAX = 60
GOAL_DATE_RE = re.compile(r"^\d{4}(-\d{2}-\d{2})?$")
BACKTEST_YEARS = {"3": 3, "5": 5, "10": 10, "max": "max"}
# the two alert thresholds (% moves): (low, high) and the message's words
THRESHOLD_RANGE = {"alertThreshold": (0.5, 50), "portfolioAlertThreshold": (0.1, 50)}
# what data.json's "ui" shows for a key with nothing saved (the tracker's
# defaults: portfolio_tracker.DEFAULT_SETTINGS / ui_settings)
UI_DEFAULT = {"position": None, "scale": 1, "display": None,
              "title": "portfolio", "currency": "auto", "backtestYears": 5,
              "alerts": False, "alertThreshold": 5, "portfolioAlertThreshold": 2.5,
              "rebalanceWhole": None,
              "theme": "dark", "opacity": 0.88, "updates": True, "welcome": True,
              "cash": {}, "invested": None, "targets": None, "goal": None}
# "portfolio reset-all" (13.4): these keys leave _settings in one write (the
# name, the targets and the windows stay); data.json's "ui" gets the defaults.
# 13.5: "welcome" too, so starting over brings the welcome card back
PORTFOLIO_RESET = (("currency", "auto"), ("backtestYears", 5), ("benchmark", "auto"),
                   ("news", False), ("alerts", False), ("alertThreshold", 5),
                   ("portfolioAlertThreshold", 2.5), ("rebalanceWhole", None),
                   ("theme", "dark"), ("opacity", 0.88), ("updates", True),
                   ("welcome", True))
PF_RESET = object()
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


THOUSANDS_RE = re.compile(r"^[1-9]\d{0,2}(,\d{3})+(\.\d+)?$")    # 1,250.50 (not 0,001)
# cash currencies the tracker can convert (13.5): the ones its exchanges quote
# in (portfolio_tracker SUFFIX_CURRENCY / MINOR_UNITS) plus a few common ones
CASH_CURRENCIES = ("USD", "EUR", "GBP", "CAD", "CHF", "SEK", "NOK", "DKK", "JPY", "HKD", "AUD", "NZD",
                   "SGD", "KRW", "TWD", "INR", "BRL", "MXN", "ZAR", "ILS", "CNY", "PLN", "CZK", "HUF",
                   "ISK", "TRY", "THB")
DECIMAL_COMMA_RE = re.compile(r"^\d+,\d{1,2}$")              # 99,5


def parse_amount(text):
    """An amount of money as typed (1200, 1 200, 1'200, 1,250.50, 99,5)
    as a number from 0 to 1e12, rounded to 2 decimals (an int when whole),
    or None (also for a sign, words, NaN and inf)."""
    t = str(text).replace(" ", "").replace("'", "")
    if THOUSANDS_RE.match(t):
        t = t.replace(",", "")
    elif DECIMAL_COMMA_RE.match(t):
        t = t.replace(",", ".")
    if t[:1] in ("+", "-"):
        return None
    return parse_number(t, AMOUNT_RANGE)


def amount_view(value):
    """A saved amount (a number or numeric text, not true/false) as data.json's
    "ui" shows it: finite and > 0, rounded to 2 decimals (an int when
    whole), else None (portfolio_tracker.ui_amount)."""
    if isinstance(value, bool):
        return None
    try:
        v = float(value)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(v) or v <= 0:
        return None
    v = round(v, 2)
    return int(v) if v == int(v) else v


def cash_view(value):
    """_cash as data.json's "ui" shows it (portfolio_tracker.ui_cash):
    {ISO code upper-cased: amount} for 3-letter codes with an amount > 0."""
    out = {}
    if isinstance(value, dict):
        for cur, amount in value.items():
            iso, n = str(cur).strip().upper(), amount_view(amount)
            if re.match(r"^[A-Z]{3}$", iso) and n is not None:
                out[iso] = n
    return out


TARGETS_MAX = 80        # names in one target mix


def parse_targets_arg(value):
    """The target mix as typed (13.6): a JSON object {name: 0-100} ->
    (insertion-ordered {name: int | 2-decimal float}, None), (None, None)
    for "", default, none or {} (the key goes), or (None, error). The
    names are checked against the file later (check_target_names)."""
    text = str(value).strip()
    if text.lower() in ("", "default", "none", "{}"):
        return None, None
    try:
        obj = json.loads(text)
    except ValueError:
        obj = None
    if not isinstance(obj, dict):
        return None, ('targets must be an object like {"Tech": 30, "cash": 10}, got %s'
                      % text[:40])
    if len(obj) > TARGETS_MAX:
        return None, "targets: at most %d names" % TARGETS_MAX
    for k in obj:
        if (not isinstance(k, str) or not 1 <= len(k.strip()) <= 40
                or "\n" in k or "\r" in k):
            return None, "targets: a name must be 1-40 characters"
    import rebalance        # lazy: standard library only, like this file
    entries, warns = rebalance.parse_targets(obj)
    for w in warns:
        if w.get("kind") in ("format", "value"):
            return None, w.get("text") or "targets: a target is a number from 0 to 100"
    out, seen = {}, set()
    for k, pct in entries or []:
        name = k.strip()
        cf = name.casefold()
        if cf in seen:
            return None, "%s: listed twice" % name
        seen.add(cf)
        if cf == "cash":
            name = "cash"
        out[name] = int(pct) if pct == int(pct) else round(pct, 2)
    return (out or None), None


def parse_goal(text):
    """The goal (13.6, ⚙ → Portfolio) from 'CUR AMOUNT YEAR' or 'CUR AMOUNT
    YYYY-MM-DD' (text already trimmed and lower-cased): ({"value", "date",
    "cur"}, None), (None, None) for default (removed), or (None, error).
    A year alone means Dec 31 of that year; the date must be after today
    and at most GOAL_YEARS_MAX years ahead."""
    if text == "default":
        return None, None
    shape = ("goal must be a currency, an amount and a year, like CAD 250000 2035 "
             "(or default to remove it), got %r" % text)
    tokens = text.split()
    if len(tokens) < 3 or not CURRENCY_RE.match(tokens[0]) or not GOAL_DATE_RE.match(tokens[-1]):
        return None, shape
    cur = tokens[0].upper()
    amount = parse_amount(" ".join(tokens[1:-1]))
    if amount is None:
        return None, shape
    d = tokens[-1]
    try:
        if len(d) == 4:
            day = date(int(d), 12, 31)
        else:
            day = date(int(d[:4]), int(d[5:7]), int(d[8:10]))
    except ValueError:
        return None, shape
    if amount == 0:
        return None, "the goal amount must be more than 0"
    today = date.today()
    if day <= today:
        return None, "the goal date must be after today, got %r" % tokens[-1]
    if day.year > today.year + GOAL_YEARS_MAX:
        return None, "the goal date must be within %d years, got %r" % (GOAL_YEARS_MAX, tokens[-1])
    return {"value": amount, "date": day.isoformat(), "cur": cur}, None


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
    if key == "targets":
        # before lower-casing too: a sector's spelling matters (13.6)
        return parse_targets_arg(value)
    text = str(value).strip().lower()
    if key == "cash":
        # ("clear",) = all cash gone, ("drop", CUR) = that currency's gone,
        # ("set", CUR, amount) = that much cash in CUR (13.5)
        if text == "default":
            return ("clear",), None
        parts = text.split(None, 1)
        if len(parts) == 2 and CURRENCY_RE.match(parts[0]):
            cur = parts[0].upper()
            if parts[1].strip() == "default":
                return ("drop", cur), None
            if cur not in CASH_CURRENCIES:
                return None, ("cash currency %s is not one the widget knows (%s, …)"
                              % (cur, ", ".join(CASH_CURRENCIES[:8])))
            num = parse_amount(parts[1])
            if num == 0 and re.sub(r"[0.,\s']", "", parts[1]):
                return None, "cash amount %r is too small (2 decimals at most) — 0 removes it" % parts[1].strip()
            if num is not None:
                return (("drop", cur) if num == 0 else ("set", cur, num)), None
        return None, ("cash must be a currency and an amount, like CAD 1200 "
                      "(or CAD default to remove it), got %r" % value)
    if key == "invested":
        if text == "default":
            return None, None
        num = parse_amount(text)
        if num == 0 and re.sub(r"[0.,\s']", "", text):
            return None, "invested amount %r is too small (2 decimals at most) — 0 removes it" % text
        if num is None:
            return None, "invested must be an amount of money, like 25000, or default, got %r" % value
        return (num or None), None          # 0 removes it too
    if key == "goal":
        return parse_goal(text)             # 13.6
    if key == "portfolio":
        if text == "reset-all":
            return PF_RESET, None
        return None, "portfolio takes only reset-all, got %r" % value
    if key == "theme":
        if text == "default":
            return None, None
        if text not in THEMES:
            return None, "theme must be dark, light or auto, got %r" % value
        return text, None
    if key == "opacity":
        if text == "default":
            return None, None
        pct = text.endswith("%")
        num = parse_number(text[:-1].strip() if pct else text,
                           (OPACITY_RANGE[0] * 100, OPACITY_RANGE[1] * 100) if pct else OPACITY_RANGE)
        if num is None:
            return None, "opacity must be a number from 0.3 to 1 (or 30%% to 100%%) or default, got %r" % value
        num = round(num / 100.0, 2) if pct else round(float(num), 2)
        return int(num) if num == int(num) else num, None
    if key in ("updates", "welcome") and text == "default":
        return None, None
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


def display_label(b, a):
    """13.6: the "undo: ..." words for a display change, from the display
    before (b) and after (a); a missing value is the one default window.
    Never raises."""
    try:
        def wins(v):
            c = display_prefs.clean_display(v)
            return c["windows"] if c else [{"id": "main"}]
        wb, wa = wins(b), wins(a)
        if len(wb) != len(wa):
            return "a window added" if len(wa) > len(wb) else "a window closed"
        mb = dict((w.get("id"), w) for w in wb)
        ma = dict((w.get("id"), w) for w in wa)
        if set(mb) != set(ma):
            return "what a window shows"
        fields = set()
        for i in mb:
            for k in set(mb[i]) | set(ma[i]):
                if json.dumps(mb[i].get(k), sort_keys=True) != json.dumps(ma[i].get(k), sort_keys=True):
                    fields.add(k)
        if fields and fields <= {"x", "y"}:
            return "where a window sits"
        if fields and fields <= {"w", "h", "zoom"}:
            return "a window's size"
        if fields == {"title"}:
            return "a window's name"
        return "what a window shows"
    except Exception:
        return "what a window shows"


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
    old = old_plan or {"scopes": [], "tickers": [], "feeds": []}
    old_scopes = set(old["scopes"])
    if old_plan:
        old_scopes.add("movers")        # the tracker always plans the movers
    if set(new_plan["scopes"]) - old_scopes:
        return True
    if set(new_plan.get("feeds", ())) - set(old.get("feeds", ())):   # a market feed (13.3)
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


def update_top_level(raw, key, value):
    """cash / invested (13.5): change raw["_cash"] / raw["_invested"] in
    place. Returns (changed, the new value as data.json's "ui" shows it);
    changed compares the amounts as numbers (1200 = 1200.0)."""
    if key == "invested":
        if value is None:
            changed = "_invested" in raw
            raw.pop("_invested", None)
        else:
            changed = amount_view(raw.get("_invested")) != value
            raw["_invested"] = value
        return changed, amount_view(raw.get("_invested"))
    cash = raw.get("_cash")
    if cash is None:
        cash = {}
    if not isinstance(cash, dict):
        pf.fail("_cash in positions.json should be an object — fix it first")
    if value[0] == "clear":
        changed = bool(cash)
        cash = {}
    else:
        cur = value[1]
        # the same code typed in lower case earlier goes too
        others = [k for k in cash if k != cur and str(k).strip().upper() == cur]
        changed = bool(others)
        for k in others:
            del cash[k]
        if value[0] == "drop":
            changed = changed or cur in cash
            cash.pop(cur, None)
        else:
            changed = changed or amount_view(cash.get(cur)) != value[2]
            cash[cur] = value[2]
    if cash:
        raw["_cash"] = cash
    else:
        changed = changed or "_cash" in raw
        raw.pop("_cash", None)
    return changed, cash_view(cash)


def check_target_names(raw, value, positions):
    """The target mix's names against the file (13.6): "cash", a held ticker
    (its spelling as held) or a sector (data.json's spelling, or a holding's
    own "theme" tag). Without data.json's sectors yet (no refresh so far)
    an unknown name is kept as typed. pf.fail on an unknown name or a ticker whose sector has a target
    too (rebalance.build_targets would ignore it). -> the normalised dict."""
    held = {}
    for k in raw:
        if not k.startswith("_") and (pf.held_shares(raw[k]) or 0) != 0:
            held[k.upper()] = k
    data = pf.load_data(positions)
    themes, tk_theme = {}, {}
    for t in data.get("themes") or []:
        if isinstance(t, dict) and isinstance(t.get("name"), str) and t["name"].strip():
            themes.setdefault(t["name"].strip().casefold(), t["name"])
    known = bool(themes)        # data.json's sectors: without them (no refresh
                                # yet) a name that is no holding is kept as typed
    for k, entry in raw.items():
        if (not k.startswith("_") and isinstance(entry, dict)
                and isinstance(entry.get("theme"), str) and entry["theme"].strip()):
            themes.setdefault(entry["theme"].strip().casefold(), entry["theme"].strip())
            tk_theme[k] = entry["theme"].strip().casefold()
    for p in data.get("positions") or []:
        if isinstance(p, dict) and isinstance(p.get("ticker"), str) \
                and isinstance(p.get("theme"), str) and p["theme"].strip():
            tk_theme[p["ticker"]] = p["theme"].strip().casefold()   # what the tracker used
    out, kinds = {}, {}
    for key, pct in value.items():
        if key.casefold() == "cash":
            name, kind = "cash", "cash"
        elif key.upper() in held:
            name, kind = held[key.upper()], "ticker"
        elif key.casefold() in themes:
            name, kind = themes[key.casefold()], "sector"
        elif not known:
            name, kind = key, "unknown"     # no data.json yet: kept as typed
        else:
            pf.fail("%s: not one of your holdings, sectors or cash" % key)
        if name in out:
            pf.fail("%s: listed twice" % key)
        out[name], kinds[name] = pct, kind
    sectors = dict((n.casefold(), n) for n, kd in kinds.items() if kd == "sector")
    for name, kd in kinds.items():
        if kd == "ticker" and tk_theme.get(name) in sectors:
            pf.fail("%s: its sector %s has a target too — give one or the other"
                    % (name, sectors[tk_theme[name]]))
    return out


def save_top_level(positions, key, value):
    """set_setting.py cash / invested: one write (none when nothing
    changed), data.json's "ui" patched, a refresh asked for when it changed
    (the totals and the returns use them); replies and exits."""
    buf = io.StringIO()
    undo = None
    try:
        with contextlib.redirect_stdout(buf):
            raw = pf.load(positions)
            names = [TOP_LEVEL[key]]
            before = pf.snap(raw, names)
            changed, new = update_top_level(raw, key, value)
            if changed:
                bk = pf.setting_backup(positions)       # 13.6
                pf.save(positions, raw)
                try:                                    # never fails a save
                    undo = pf.undo_push(positions, key, LABELS.get(key, key), "", names,
                                        before, pf.snap(raw, names), backup=bk)
                except Exception:
                    undo = None
        patch_cached_ui(positions, {key: new})
        if changed:
            pf.request_refresh(positions)
    except SystemExit:
        msg = buf.getvalue().strip()
        reply({"error": msg[len("error: "):] if msg.startswith("error: ") else msg or "failed"}, 1)
    except Exception as e:
        reply({"error": "could not save: %s" % e}, 1)
    out = {"ok": True, "key": key, "value": new}
    if changed and undo:
        out["undo"] = undo
    reply(out)


def ui_default(n):
    """What data.json's "ui" shows for a key with nothing saved."""
    for table in (UI_DEFAULT, dict(RESET_ALL), dict(PORTFOLIO_RESET)):
        if n in table:
            return table[n]
    return None


def known_names():
    return set(KEYS) | set(k for k, _ in RESET_ALL) | set(k for k, _ in PORTFOLIO_RESET)


def undo_rec_ok(rec):
    """13.6: an undo record may only touch settings: _cash / _invested at the
    top level (spot "") or known keys in _settings. Anything else in
    .cache/setting_undo.json (hand-edited, corrupt) is never applied."""
    names = rec.get("names")
    if not names or not all(isinstance(n, str) for n in names):
        return False
    if rec.get("spot") == "_settings":
        return set(names) <= (known_names() - {"undo"})
    if rec.get("spot") == "":
        return set(names) <= set(TOP_LEVEL.values())
    return False


def rec_label(rec):
    return rec.get("label") or LABELS.get(rec.get("key"), rec.get("key"))


def undo_still_after(container, rec):
    """True when every recorded name is still as the change left it."""
    for n in rec["names"]:
        if (n in container) != (n in rec["after"]):
            return False
        if n in container and (json.dumps(container[n], sort_keys=True)
                               != json.dumps(rec["after"][n], sort_keys=True)):
            return False
    return True


def undo_restore(positions, raw, rec):
    """Put the record's before values back into raw and save (with a
    backup first). pf.fail when _settings is not an object."""
    if rec["spot"] == "_settings":
        container = raw.get("_settings")
        if container is None:
            container = raw["_settings"] = {}
        if not isinstance(container, dict):
            pf.fail("_settings in positions.json should be an object — fix it first")
    else:
        container = raw
    for n in rec["names"]:
        if n in rec["before"]:
            container[n] = json.loads(json.dumps(rec["before"][n]))
        else:
            container.pop(n, None)
    pf.setting_backup(positions)
    pf.save(positions, raw)


def undo_after_save(positions, recs, rec):
    """After an undo's save: drop the record, patch data.json's "ui", ask
    for the data the restored values need. Returns the ui map. Best effort:
    the caller catches errors, so a restored file always gets its ok."""
    pf.undo_write(positions, recs[:-1])
    before, names = rec["before"], rec["names"]
    uimap = {}
    if rec["spot"] == "_settings":
        known = known_names()
        for n in names:
            if n in known:
                uimap[n] = before[n] if n in before else ui_default(n)
    else:
        if "_cash" in names:
            uimap["cash"] = cash_view(before.get("_cash"))
        if "_invested" in names:
            uimap["invested"] = amount_view(before.get("_invested"))
    if uimap:
        patch_cached_ui(positions, uimap)
    if (rec["spot"] == "" or any(n in REFRESH_KEYS for n in names)
            or any(n not in known_names() for n in names)):
        pf.request_refresh(positions)
    if "display" in names and rec["spot"] == "_settings":
        # the old plan is what was in the file, the new one the restored one
        if news_refresh_wanted(display_prefs.news_plan(rec["after"].get("display")),
                               display_prefs.news_plan(before.get("display")), positions):
            request_news_refresh(positions)
    return uimap


def undo_last(positions, want):
    """set_setting.py undo [ID] (13.6): put back the newest recorded
    settings change — only its own keys, so a buy, sale or alert since
    stays. Refuses when the newest record is not ID, or when one of its
    keys changed since (that record is then dropped). Pushes no record
    itself: one level at a time, newest first, no redo. Replies and exits
    (reply() exits, so it runs only after the try)."""
    buf = io.StringIO()
    code, result = 1, None
    try:
        with contextlib.redirect_stdout(buf):
            raw = pf.load(positions)        # holds the edit lock until exit
            recs = pf.undo_records(positions)
            if recs and not undo_rec_ok(recs[-1]):   # a bad newest record is dropped, never applied
                while recs and not undo_rec_ok(recs[-1]):
                    recs = recs[:-1]
                pf.undo_write(positions, recs)
            rec = recs[-1] if recs else None
            if rec is None:
                result = {"error": "nothing to undo — no setting changed in the last day"}
            elif want and want != str(rec["id"]):
                result = {"error": "the last change is now " + rec_label(rec)
                          + " — click undo again to put that back",
                          "next": pf.undo_summary(rec)}
            elif not undo_still_after(pf.section(raw, rec["spot"]), rec):
                pf.undo_write(positions, recs[:-1])
                result = {"error": rec_label(rec) + " was changed again since — nothing undone",
                          "next": pf.undo_summary(recs[-2]) if len(recs) > 1 else None}
            else:
                undo_restore(positions, raw, rec)
                uimap = {}
                try:
                    uimap = undo_after_save(positions, recs, rec)
                except Exception:
                    pass
                code = 0
                result = {"ok": True, "key": "undo", "value": None,
                          "undone": {"key": rec["key"], "label": rec_label(rec)},
                          "ui": uimap,
                          "next": pf.undo_summary(recs[-2]) if len(recs) > 1 else None}
    except SystemExit:
        msg = buf.getvalue().strip()
        code, result = 1, {"error": msg[len("error: "):] if msg.startswith("error: ") else msg or "failed"}
    except Exception as e:
        code, result = 1, {"error": "could not undo: %s" % e}
    reply(result, code)


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    ap = JsonArgs()
    ap.add_argument("key", nargs="?", default="")
    ap.add_argument("value", nargs="?", default="")
    ap.add_argument("--positions", default=os.path.join(here, "positions.json"))
    args = ap.parse_args()

    if args.key not in KEYS:
        reply({"error": "unknown setting %r (one of: %s)" % (args.key, ", ".join(KEYS))}, 1)
    if args.key == "undo":
        if not os.path.exists(args.positions):
            reply({"error": "no positions file yet"}, 1)
        undo_last(args.positions, args.value.strip())     # replies and exits
    value, err = parse_value(args.key, args.value)
    if err:
        reply({"error": err}, 1)
    if not os.path.exists(args.positions):
        reply({"error": "no positions file yet"}, 1)
    if args.key in TOP_LEVEL:
        # cash / invested sit next to _settings, not in it (no empty
        # _settings is made for them); they ask for a refresh when changed
        save_top_level(args.positions, args.key, value)

    # portfolio_file's load/save: pf.fail prints plain text and exits, so
    # its message is caught and passed on as JSON
    buf = io.StringIO()
    undo = None
    if value is display_prefs.RESET:
        names = [k for k, _ in RESET_ALL]
    elif value is PF_RESET:
        names = [k for k, _ in PORTFOLIO_RESET]
    else:
        names = [args.key]
    try:
        with contextlib.redirect_stdout(buf):
            raw = pf.load(args.positions)
            settings = raw.get("_settings")
            if settings is None:
                settings = raw["_settings"] = {}
            if not isinstance(settings, dict):
                pf.fail("_settings in positions.json should be an object — fix it first")
            if args.key == "targets" and value is not None:
                # 13.6: the names need the file (held tickers, sectors)
                value = check_target_names(raw, value, args.positions)
            before = pf.snap(settings, names)      # 13.6: for "undo"
            changed = False
            old_plan = display_prefs.news_plan(settings.get("display")) if args.key == "display" else None
            if value is display_prefs.RESET:   # "display reset-all"
                for k, _ in RESET_ALL:
                    if k in settings:
                        del settings[k]
                        changed = True
            elif value is PF_RESET:            # "portfolio reset-all" (13.4)
                for k, _ in PORTFOLIO_RESET:
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
                bk = pf.setting_backup(args.positions)  # 13.6: at most one per 10 s
                pf.save(args.positions, raw)
                try:                                    # never fails a save
                    after = pf.snap(settings, names)
                    if value is display_prefs.RESET or value is PF_RESET:
                        label = RESET_LABELS.get(args.key, LABELS.get(args.key, args.key))
                    elif args.key == "display":
                        label = display_label(before.get("display"), after.get("display"))
                    else:
                        label = LABELS.get(args.key, args.key)
                    undo = pf.undo_push(
                        args.positions, args.key, label, "_settings", names, before, after,
                        backup=bk,
                        kind="reset" if (value is display_prefs.RESET or value is PF_RESET) else "set")
                except Exception:
                    undo = None
        # the widget already shows the change; the cached data.json gets it
        # too, so a restart starts in it — no fetch for a display choice
        if value is display_prefs.RESET:
            patch_cached_ui(args.positions, dict(RESET_ALL))
        elif value is PF_RESET:
            patch_cached_ui(args.positions, dict(PORTFOLIO_RESET))
        else:
            patch_cached_ui(args.positions, {
                args.key: UI_DEFAULT.get(args.key) if value is None else value})
        if (args.key in REFRESH_KEYS or value is PF_RESET) and changed:
            # new data needed (none for the choice already saved): one fetch
            # with the new index / in the new currency / over the longer
            # history (whose long history the history job then plans like
            # any other). cash / invested ask for one in save_top_level
            # (they never get here). No other key asks for one.
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
        out = {"ok": True, "key": args.key, "value": None,
               "reset": [k for k, _ in RESET_ALL]}
    elif value is PF_RESET:
        out = {"ok": True, "key": args.key, "value": None,
               "reset": [k for k, _ in PORTFOLIO_RESET], "ui": dict(PORTFOLIO_RESET)}
    else:
        out = {"ok": True, "key": args.key,
               "value": UI_DEFAULT.get(args.key) if value is None else value}
    if changed and undo:
        out["undo"] = undo          # 13.6: what "undo" in ⚙ would put back
    reply(out)


if __name__ == "__main__":
    main()
