#!/usr/bin/env python3
"""
portfolio_tracker.py
--------------------
Reads positions.json, fetches quotes from Yahoo Finance (yfinance) in
parallel, and prints ONE JSON blob for the widget. widget_command.sh runs it
in the background; you can also run it by hand to debug:

    python3 portfolio_tracker.py --json --positions positions.json

What it computes:
  * value, day change (split into price vs exchange-rate effect), cost basis, P&L
    and weight per position; totals; movers ranked by dollar impact;
    top-5 concentration; themes (your "theme" tags, else Yahoo's sector)
  * a value history: every run appends a snapshot {t, v} to
    .cache/history.jsonl. Graphs use those real values and fill any stretch
    without snapshots (before the first one, or while the Mac slept) by
    reconstructing current shares x historical closes, flagged "approx"
    (≈ in the widget's hover). 1D = the latest trading session.
  * history is DATE-AWARE: a reconstructed day counts only the lots bought on
    or before it, so "what was my portfolio worth on March 3rd" is answered
    with what you held then. "daily" is the day-by-day table (recorded
    end-of-day value, else that day's closes), "basisSteps" the money at work
    over time (so P&L and range changes don't mistake a deposit for a gain),
    and "sectors" each sector's % performance per range (current holdings).
  * volatility: per stock, the annualised standard deviation of daily
    returns over the last 3 months, plus a 1-10 score (see volatility()).
    The portfolio's own volatility comes from its reconstructed daily value,
    so diversification is counted.
  * a benchmark index ("_settings.benchmark", default per home currency,
    see DEFAULT_BENCHMARKS): its level in the display currency at every
    graph point and every day, for the comparison line. Comparison only —
    never part of a total, a snapshot or the missing/stale lists.
  * a backtest ("backtest"): before the first purchase, what TODAY's holdings
    would have done ("as held now" / "as weighted now", see
    backtest_series()). Its own series — never in the history, the day
    table, the snapshots or level_adjust(); one scale factor per mode makes
    it meet the real graph at its first day.
  * upcoming earnings (+ options-implied move when within 30 days), yearly
    dividend estimate, 50-day sparklines, optional macOS alerts.

Settings live in positions.json under "_settings" (see the README).

Resilience: daily/hourly bars are cached for BARS_TTL, so a normal refresh is
one request per ticker. A ticker that fails falls back to its last price
(marked stale); one that never had a price (typo, delisted) is skipped and
reported in "missingTickers" rather than failing the whole run.

Long price history (two tiers): a normal refresh only ever downloads one
year of daily closes. Anything older lives in .cache/history_bars.json,
filled by a separate background run (widget_command.sh starts it when the
refresh leaves .cache/history.needed behind):

    python3 portfolio_tracker.py --fetch-history --positions positions.json

It reaches back to the earliest purchase date or "_settings.backtestYears"
(3, 5, 10 or "max"; default 5), whichever is earlier, and later runs only
add the new days. The full day-by-day table goes to .cache/daily_all.json;
data.json carries the newest DAILY_SEND days and older ones are read with

    python3 portfolio_tracker.py --positions positions.json --days-before 2024-01-02 --days-count 400

Exit codes: 0 = success (stdout is valid JSON); 3 = stdout is valid JSON, but
every holding's price request failed (last known prices, marked stale):
commit it and back off; anything else = do not commit cache.
"""

import argparse
import bisect
import json
import math
import os
import re
import subprocess
import sys
import threading
import time
from collections import Counter
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from zoneinfo import ZoneInfo   # Python 3.9+ (a silent UTC fallback shifted
                                # the session, 1D window and alert day by 4-5 h)

try:                            # _settings.display: the windows (12.12)
    import display_prefs
except ImportError:             # loaded by path from another folder (tests)
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import display_prefs

POINTS_PER_SERIES = 320         # every graph series is downsampled to this
SPARK_DAYS = 90                 # sparkline = last 90 daily closes (~1 quarter)
HISTORY_MAX_LINES = 60000       # prune history.jsonl beyond this
HISTORY_KEEP_LINES = 50000
SNAPSHOT_MIN_GAP = 60           # don't append snapshots more often than this (s)
DIVIDEND_TTL = 7 * 86400        # re-check dividendRate weekly
EARNINGS_TTL = 86400            # re-check earnings date daily
DIVS_TTL = 86400                # re-check a holding's past dividends daily,
DIVS_EMPTY_TTL = 7 * 86400      # weekly when it has paid none
DIVS_PERIODS = ("2y", "5y", "10y", "max")   # dividend history reach, shortest first
META_RETRY = 3600               # after a failed meta lookup, retry in ~1h
BARS_TTL = 3600                 # re-download daily/hourly bars hourly
SECTOR_POINTS = 120             # points per sector series (one shared time axis)
SECTOR_BAR_SHARE = 0.25         # a bar counts for the sector graphs only when at
                                # least this share of the holdings traded in it
MAX_SECTORS = 11                # sector graphs; smaller themes fold into "Other"
DAILY_SEND = 400                # day-by-day rows in data.json (the newest); the
                                # full table is .cache/daily_all.json
DAILY_MAX_COUNT = 5000          # most rows one `--days-before` call returns
DAILY_PERIODS = ["1y", "2y", "5y", "10y", "max"]   # Yahoo periods fetch_one knows
BACKTEST_YEARS = (3, 5, 10, "max")   # allowed _settings.backtestYears
HISTORY_SLACK_DAYS = 10         # long history starts this much before it's needed
HISTORY_TOPUP_DAYS = 200        # long bars ending longer ago than this get the new
                                # days appended (the fresh window is one year)
HISTORY_RECHECK = 86400         # a top-up (or a symbol Yahoo had no long bars for)
                                # is asked for again at most this often: a halted
                                # or delisted stock never gets newer bars
HISTORY_SPLIT_TOL = 0.02        # long vs fresh closes on shared days may differ this
                                # much (median ratio) before the long ones are refetched
HISTORY_WORKERS = 4             # parallel downloads in the history job
LATE_START_DAYS = 7             # "starts later" = first close this long after ALL's start
BACKTEST_COVER = 0.5            # the backtest starts once holdings worth this share
                                # of today's value have prices
BACKTEST_POINTS = 240           # simulated points per backtest tab (+ the anchor)
BACKTEST_TABS = {3: ["3Y"], 5: ["3Y", "5Y"], 10: ["3Y", "5Y", "10Y"],
                 "max": ["3Y", "5Y", "10Y", "MAX"]}   # tabs per backtestYears
VOL_DAYS = 63                   # volatility window: ~3 months of sessions
VOL_MIN_RETURNS = 20            # fewer daily returns than this -> no score
RISK_FREE_PCT = 4.0             # Sharpe = (annual return - this) / volatility
MIN_HISTORY_DAYS = 30           # XIRR / time-weighted / risk figures: this much history
VOL_LABELS = {1: "very calm", 2: "calm", 3: "moderate", 4: "moderate",
              5: "lively", 6: "lively", 7: "wild", 8: "wild",
              9: "extreme", 10: "extreme"}
MARKET_TZ = ZoneInfo("America/New_York")   # US market clock (session dot,
                                           # 1D window, alert day)

# daily backup (--daily-backup, run by widget_command.sh after each fetch):
# one dated copy of positions.json per US trading day, after the close
BACKUP_KEEP = 30                # newest daily copies kept (others removed)
BACKUP_RETRY = 3600             # s to wait after a failed copy before trying again
BACKUP_RE = re.compile(r"^positions\.backup-\d{8}-\d{6}-daily\.json$")

DEFAULT_SETTINGS = {
    "title": "portfolio",
    "currency": "auto",            # any ISO code ("EUR", "GBP", "SEK", ...) or
                                   # "auto" (the Mac's region, else USD)
    "alerts": False,               # macOS notification on big daily moves
    "alertThreshold": 5.0,         # % 1D move of one holding
    "portfolioAlertThreshold": 2.5,  # % 1D move of the whole portfolio
    "backtestYears": 5,            # 3, 5, 10 or "max": how far back the price
                                   # history reaches (at least; earlier purchase
                                   # dates reach further)
    "benchmark": "auto",           # index to compare with: a Yahoo symbol, "auto"
                                   # (DEFAULT_BENCHMARKS by home currency) or "none"
    # display choices the widget saves itself (widget_command.sh setting):
    "showBenchmark": True,         # the index line on the value graph ("hide")
    "graphBig": False,             # the enlarged value / p&l graph (the ⤢ toggle)
    "compact": False,              # one line: total, day %, day $, sparkline
                                   # (a click on the title)
    "position": None,              # {"x", "y"}: where it was dragged (None = className)
    "scale": 1,                    # its size, 0.6-1.6 (the corner grip)
    "news": False,                 # headlines (viewed stock + big movers); off
                                   # = no news requests at all
    "targets": None,               # {"ADBE": 10, "Tech": 20, "cash": 5}: target % of
                                   # the whole portfolio (rebalance.py); None = off
    "rebalanceWhole": None,        # the rebalance panel's whole-share (True) /
                                   # fractional (False) choice; None = not chosen
    "display": None,               # {"windows": [...]}: the widget's windows and
                                   # what each shows (display_prefs.py); None =
                                   # the one default window
    # 13.4
    "theme": "dark",               # dark | light | auto (the Mac's appearance)
    "opacity": 0.88,               # the window background, 0.3 (glass) to 1 (solid)
    "updates": True,               # look for a newer release on GitHub once a day
    "welcome": True,               # the welcome card while the demo portfolio is shown
}
THEMES = ("dark", "light", "auto")
OPACITY_RANGE = (0.3, 1.0)

# the update check (13.4): the newest release on GitHub, once a day, cached
# in .cache/update.json; the widget compares it with its own VERSION. One
# plain request for a public page, nothing about the portfolio in it.
# PORTFOLIO_UPDATE_URL (tests) may name any URL, a file:// one included.
UPDATE_URL = "https://api.github.com/repos/onnipackalen/uebersicht-portfolio/releases/latest"
UPDATE_TTL = 86400              # s between checks that worked
UPDATE_RETRY = 6 * 3600         # s after one that failed
UPDATE_TIMEOUT = 8              # s for the request

# price alerts ("_alerts" in positions.json, alerts.py): one kind per rule
PRICE_ALERT_KINDS = ("above", "below", "pctFromCost", "drawdownPct")
MAX_ALERTS = 50

# headlines (_settings.news, .cache/news.json): the stock being viewed
# (ticker_lookup.py news), holdings moving more than NEWS_MOVE_PCT today and,
# with a news page (13.1, display_prefs.news_plan), every held / watched /
# picked ticker its windows ask for — bounded: NEWS_MAX_PER_REFRESH
# requests per refresh, NEWS_PARALLEL at a time, NEWS_PLAN_MAX planned
NEWS_TTL = 1800                 # s: a ticker's headlines are reused this long,
NEWS_FAIL_TTL = 600             # ... after a failed fetch this long (the
NEWS_FAIL_MAX = 2               # first NEWS_FAIL_MAX failures; then NEWS_TTL)
NEWS_MOVE_PCT = 3.0             # |1D move| above this % (strict) -> headlines
NEWS_MAX_MOVERS = 8             # at most this many movers per refresh
NEWS_PANEL_TOP = 3              # with a news panel (12.12): also the biggest
                                # movers of the day, whatever their size
NEWS_KEEP_MAX = 10              # headlines kept per ticker in news.json,
                                # newest first (Yahoo gives about 10)
NEWS_KEEP_MIN = 3               # data.json holds at least this many per ticker
NEWS_MAX_PER_REFRESH = 12       # news requests per refresh (the rest wait)
NEWS_PARALLEL = 4               # news requests in flight at once
NEWS_BREAK = 3                  # first N news jobs all failing -> skip the rest
NEWS_PLAN_MAX = 100             # planned tickers beyond this are dropped
NEWS_OUT_MAX = 300              # stories in data.json at most (per_out cap)
NEWS_PRUNE = 86400              # news.json entries older than this are dropped
# a headline link: https only, and only characters that are harmless inside
# the widget's single-quoted `open '...'` (quote() encodes everything else)
NEWS_URL_SAFE = "-._~:/?#[]@!$&()*+,;=%"
NEWS_URL_RE = re.compile(r"https://[A-Za-z0-9\-._~:/?#\[\]@!$&()*+,;=%]+")
# market headlines (13.3): the public RSS feeds of the big outlets, for the
# news page's "market news" (display.windows[i].news.market). Cached in
# news.json under "@<id>" keys (never a ticker), fetched again after
# NEWS_FEED_TTL, items older than NEWS_FEED_MAX_AGE dropped when parsed.
# (WSJ's public feeds stopped updating in 2025, so they are not offered.)
NEWS_FEEDS = {
    "cnbc": ("CNBC", "https://www.cnbc.com/id/100003114/device/rss/rss.html"),
    "marketwatch": ("MarketWatch", "https://feeds.content.dowjones.io/public/rss/mw_topstories"),
    "yahoo": ("Yahoo Finance", "https://finance.yahoo.com/news/rssindex"),
    "ft": ("FT", "https://www.ft.com/markets?format=rss"),
}
NEWS_FEED_TTL = 900             # s: a feed is fetched again after this
NEWS_FEED_KEEP = 15             # headlines kept per feed
NEWS_FEED_MAX_AGE = 3 * 86400   # older feed items are dropped when parsed
NEWS_FEED_BYTES = 1 << 20       # a feed answer is read up to this
NEWS_FEED_TIMEOUT = 8           # s
NEWS_FEED_UA = "Mozilla/5.0 (Macintosh) Portfolio.widget"

# Yahoo symbols (watch list, benchmark): "SPY", "^GSPC", "BRK-B", "EURUSD=X"
SYMBOL_RE = re.compile(r"^\^?[A-Z0-9][A-Z0-9.\-=&]{0,19}$")
# benchmark per home currency: liquid index ETFs with daily history on Yahoo
# back to 2009 or earlier (auto_adjust=False closes, like the holdings)
DEFAULT_BENCHMARKS = {
    "USD": "SPY",        # S&P 500
    "CAD": "XIU.TO",     # S&P/TSX 60
    "EUR": "EXW1.DE",    # EURO STOXX 50 (Xetra)
    "GBP": "ISF.L",      # FTSE 100 (quoted in pence)
    "AUD": "STW.AX",     # S&P/ASX 200
    "JPY": "1306.T",     # TOPIX
    "CHF": "CSSMI.SW",   # SMI
    "HKD": "2800.HK",    # Hang Seng
}
FALLBACK_BENCHMARK = "ACWI"   # MSCI All Country World (USD), any other currency

# themes for untagged tickers whose Yahoo quote type has no sector
QUOTE_TYPE_THEMES = {"ETF": "Funds", "MUTUALFUND": "Funds",
                     "FUTURE": "Futures", "CRYPTOCURRENCY": "Crypto",
                     "INDEX": "Indexes", "CURRENCY": "Currencies"}
# Yahoo's sector names, shortened to fit the themes column (and to match the
# example portfolio's tags, so an added stock joins the existing group)
SECTOR_SHORT = {"Technology": "Tech", "Communication Services": "Comm. services",
                "Healthcare": "Health care", "Financial Services": "Financials",
                "Consumer Cyclical": "Consumer disc.", "Consumer Defensive": "Staples",
                "Basic Materials": "Materials", "Real Estate": "Real estate"}

_progress_lock = threading.Lock()
_meta_lock = threading.Lock()


# --------------------------------------------------------------------------
# small utilities
# --------------------------------------------------------------------------

def now_epoch():
    return int(time.time())


def is_rate_limit(e):
    """yfinance's YFRateLimitError or an HTTP 429 in the message."""
    text = "%s %s" % (type(e).__name__, e)
    return "RateLimit" in text or "Too Many Requests" in text or "Rate limited" in text


def read_json(path, default):
    try:
        with open(path) as f:
            return json.load(f)
    except Exception:
        return default


def write_json(path, obj):
    tmp = path + ".tmp"
    with open(tmp, "w") as f:
        json.dump(obj, f)
    os.replace(tmp, path)


def downsample(points, start, end, n=POINTS_PER_SERIES):
    """At most n points spread evenly over TIME [start, end]: the first point
    plus the last point of each of n-1 equal time buckets. (Picking by index
    let a dense run of recent snapshots eat most of the point budget.)"""
    if len(points) <= n:
        return points
    span = max(1, end - start)
    buckets = {}
    for p in points:
        buckets[min(n - 2, max(0, int((p[0] - start) * (n - 1) / span)))] = p
    picked = [buckets[b] for b in sorted(buckets)]
    return ([points[0]] if picked[0] is not points[0] else []) + picked


def volatility(closes, days=VOL_DAYS):
    """(annualised volatility %, score 1-10) from daily closes.

    Volatility = standard deviation of the last `days` daily log returns,
    x sqrt(252). Score = one point per 10 percentage points, clamped to 1-10:
    utilities land around 2, a typical large cap 3-4, chip makers 6-8,
    speculative small caps 10. Fixed bands rather than a rank, so a score
    means the same in every portfolio and doesn't shift when you add a
    stock. (None, None) with fewer than VOL_MIN_RETURNS returns (new IPOs).
    Yahoo's closes are split-adjusted, so splits don't show up as moves."""
    c = [x for x in closes[-(days + 1):] if x and x > 0]
    vol = annualised_vol([math.log(b / a) for a, b in zip(c, c[1:])])
    return vol, vol_score(vol)


def annualised_vol(log_returns):
    if len(log_returns) < VOL_MIN_RETURNS:
        return None
    mean = sum(log_returns) / len(log_returns)
    var = sum((r - mean) ** 2 for r in log_returns) / (len(log_returns) - 1)
    return math.sqrt(var) * math.sqrt(252) * 100


def vol_score(vol):
    return None if vol is None else max(1, min(10, math.ceil(vol / 10)))


def json_safe(x):
    """NaN/inf -> None, recursively. Python's json writes bare NaN, which the
    wrapper's Python check accepts but the widget's JSON.parse rejects."""
    if isinstance(x, float):
        return x if math.isfinite(x) else None
    if isinstance(x, dict):
        return {k: json_safe(v) for k, v in x.items()}
    if isinstance(x, (list, tuple)):
        return [json_safe(v) for v in x]
    return x


def rnd(x, p=2):
    if x is None:
        return None
    try:
        if isinstance(x, float) and (math.isnan(x) or math.isinf(x)):
            return None
    except TypeError:
        return None
    return round(float(x), p)


# Yahoo quotes a few markets in minor units (London in pence, "GBp").
MINOR_UNITS = {"GBp": ("GBP", 0.01), "GBX": ("GBP", 0.01),
               "ZAc": ("ZAR", 0.01), "ILA": ("ILS", 0.01)}
# first-run guess from the exchange suffix; Yahoo's own answer replaces it
SUFFIX_CURRENCY = {
    ".TO": "CAD", ".V": "CAD", ".CN": "CAD", ".NE": "CAD", ".L": "GBp",
    ".AS": "EUR", ".PA": "EUR", ".DE": "EUR", ".F": "EUR", ".MI": "EUR",
    ".MC": "EUR", ".BR": "EUR", ".LS": "EUR", ".HE": "EUR", ".VI": "EUR",
    ".IR": "EUR", ".SW": "CHF", ".ST": "SEK", ".OL": "NOK", ".CO": "DKK",
    ".T": "JPY", ".HK": "HKD", ".AX": "AUD", ".NZ": "NZD", ".SI": "SGD",
    ".KS": "KRW", ".TW": "TWD", ".NS": "INR", ".BO": "INR", ".SA": "BRL",
    ".MX": "MXN", ".JO": "ZAc", ".TA": "ILA",
}


def infer_currency(ticker):
    for suffix, cur in SUFFIX_CURRENCY.items():
        if ticker.endswith(suffix):
            return cur
    return "USD"


def split_currency(cur):
    """Quote currency -> (ISO code, multiplier into that code)."""
    if cur in MINOR_UNITS:
        return MINOR_UNITS[cur]
    return (str(cur or "USD").upper(), 1.0)


class FX:
    """Rates from each quote currency into the display currency. Yahoo's
    pair "EURUSD=X" is the price of 1 EUR in USD."""

    def __init__(self, display):
        self.display = display
        self.now = {display: 1.0}
        self.prev = {display: 1.0}
        self._series = {}   # (iso, "daily"|"intraday"|"hourly") -> (keys, rates)

    def symbol(self, iso):
        return "%s%s=X" % (iso, self.display)

    def add(self, iso, result):
        self.now[iso] = result["price"]
        self.prev[iso] = result.get("prevClose") or result["price"]
        for kind in ("daily", "intraday", "hourly"):
            pts = sorted(result.get(kind) or [])
            self._series[(iso, kind)] = ([k for k, _ in pts], [v for _, v in pts])

    def factor(self, cur, prev=False):
        """Multiplier from a price quoted in `cur` to the display currency,
        or None when no rate is known."""
        iso, mult = split_currency(cur)
        rate = (self.prev if prev else self.now).get(iso)
        return None if rate is None else rate * mult

    def factor_at(self, cur, key, kind):
        """Same, at a past moment: the last `kind` bar at or before `key`
        (a YYYY-MM-DD date for daily bars, an epoch otherwise)."""
        iso, mult = split_currency(cur)
        if iso == self.display:
            return mult
        keys, rates = self._series.get((iso, kind), ([], []))
        i = bisect.bisect_right(keys, key)
        if i:
            return rates[i - 1] * mult
        if rates:
            return rates[0] * mult
        rate = self.now.get(iso)
        return None if rate is None else rate * mult

    def daily_first(self, cur):
        """Date of the first daily rate bar for `cur`: "0000-00-00" for the
        display currency (always 1), None when there is no daily series."""
        iso = split_currency(cur)[0]
        if iso == self.display:
            return "0000-00-00"
        keys = self._series.get((iso, "daily"), ([], []))[0]
        return keys[0] if keys else None


def date_to_close_epoch(date_str):
    """Epoch for 16:00 ET on a YYYY-MM-DD date (used for daily-close points)."""
    d = datetime.strptime(date_str, "%Y-%m-%d")
    d = d.replace(hour=16, tzinfo=MARKET_TZ)
    return int(d.timestamp())


# --------------------------------------------------------------------------
# positions
# --------------------------------------------------------------------------

def ui_settings(path, settings):
    """data.json "ui": the display choices in positions.json as it is NOW
    (set_setting.py saves them while a fetch may be running), else the
    settings this run started with."""
    raw = read_json(path, None)
    now = load_settings(raw) if isinstance(raw, dict) else settings
    return {"showBenchmark": now["showBenchmark"] is not False,
            "graphBig": now["graphBig"] is True,
            "position": ui_position(now.get("position")),
            "scale": ui_scale(now.get("scale")),
            "news": now.get("news") is True,
            "rebalanceWhole": (now.get("rebalanceWhole")
                               if isinstance(now.get("rebalanceWhole"), bool) else None),
            # the index picker's choice: "auto", "none" or a symbol (12.10)
            "benchmark": benchmark_choice(now.get("benchmark")),
            # the one-line view (a click on the title, 12.11)
            "compact": now.get("compact") is True,
            # the windows and their features (12.12); None = the one default
            "display": display_prefs.clean_display(now.get("display")),
            # the portfolio settings the editor's Portfolio group shows (13.2):
            # as saved, so a value set_setting.py just wrote survives a refresh
            "title": now["title"] if isinstance(now.get("title"), str) and now["title"].strip() else "portfolio",
            "currency": ui_currency(now.get("currency")),
            "backtestYears": backtest_years(now.get("backtestYears")),
            "alerts": now.get("alerts") is True,
            "alertThreshold": ui_number(now.get("alertThreshold"), 5),
            "portfolioAlertThreshold": ui_number(now.get("portfolioAlertThreshold"), 2.5),
            # appearance, the update check and the welcome card (13.4)
            "theme": ui_theme(now.get("theme")),
            "opacity": ui_opacity(now.get("opacity")),
            "updates": now.get("updates") is not False,
            "welcome": now.get("welcome") is not False}


def ui_theme(value):
    """_settings.theme as saved when it is one of THEMES, else "dark"."""
    return value if isinstance(value, str) and value in THEMES else "dark"


def ui_opacity(value):
    """_settings.opacity clamped to OPACITY_RANGE (2 decimals), else 0.88."""
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        return 0.88
    v = round(min(OPACITY_RANGE[1], max(OPACITY_RANGE[0], float(value))), 2)
    return int(v) if v == int(v) else v


def is_demo(raw, example_path):
    """True while the holdings are exactly the demo portfolio's (the welcome
    card shows then): the same tickers as positions.example.json, nothing
    sold, no money-in figure."""
    if not isinstance(raw, dict):
        return False
    held = {k.upper() for k in raw if isinstance(k, str) and not k.startswith("_")}
    if not held or raw.get("_realized") or raw.get("_invested") is not None:
        return False
    example = read_json(example_path, None)
    if not isinstance(example, dict):
        return False
    return held == {k.upper() for k in example if isinstance(k, str) and not k.startswith("_")}


def parse_version(text):
    """"v13.4" / "13.4.1" -> "13.4" / "13.4.1"; None for anything else."""
    m = re.match(r"^\s*v?(\d+(?:\.\d+)*)\s*$", str(text or ""))
    return m.group(1) if m else None


def parse_release(obj):
    """A GitHub "latest release" object -> {latest, url, zip, published} or
    None when it has no usable tag."""
    if not isinstance(obj, dict):
        return None
    latest = parse_version(obj.get("tag_name") or obj.get("name"))
    if not latest:
        return None
    zip_url = None
    for a in obj.get("assets") or []:
        if isinstance(a, dict) and str(a.get("name") or "").endswith(".zip") \
                and str(a.get("browser_download_url") or "").startswith(("https://", "file://")):
            zip_url = a["browser_download_url"]
            break
    url = obj.get("html_url") if str(obj.get("html_url") or "").startswith("https://") else None
    pub = obj.get("published_at") if isinstance(obj.get("published_at"), str) else None
    return {"latest": latest, "url": url, "zip": zip_url, "published": pub}


def fetch_release():
    """The newest release's JSON from UPDATE_URL (PORTFOLIO_UPDATE_URL in
    tests). Raises on network trouble or bad JSON."""
    import urllib.request
    url = os.environ.get("PORTFOLIO_UPDATE_URL") or UPDATE_URL
    req = urllib.request.Request(url, headers={"User-Agent": NEWS_FEED_UA,
                                               "Accept": "application/vnd.github+json, application/json"})
    kw = {"context": feed_ssl_context()} if url.startswith("https://") else {}
    with urllib.request.urlopen(req, timeout=UPDATE_TIMEOUT, **kw) as r:
        return json.loads(r.read(200000).decode("utf-8", "replace"))


def check_update(cache_dir, enabled=True, now=None, force=False):
    """The cached answer of the update check, refreshed when due (UPDATE_TTL
    after a check that worked, UPDATE_RETRY after one that failed, or
    `force`). Off (`enabled` False): None, and no request. Never raises;
    the cache keeps the last known release when a check fails.
    -> {latest, url, zip, checked, ok} or None (nothing known yet)."""
    if not enabled and not force:
        return None
    now = int(now if now is not None else time.time())
    path = os.path.join(cache_dir, "update.json")
    state = read_json(path, None)
    if not isinstance(state, dict):
        state = {}
    checked = state.get("checked") if isinstance(state.get("checked"), (int, float)) else 0
    due = force or not state or now - checked >= (UPDATE_TTL if state.get("ok") else UPDATE_RETRY)
    if due:
        try:
            rel = parse_release(fetch_release())
            if rel is None:
                raise ValueError("no release tag in the answer")
            state = {"checked": now, "ok": True, "latest": rel["latest"], "url": rel["url"],
                     "zip": rel["zip"], "published": rel["published"]}
        except Exception as e:
            state = {"checked": now, "ok": False, "error": str(e)[:200],
                     "latest": state.get("latest"), "url": state.get("url"), "zip": state.get("zip"),
                     "published": state.get("published")}
        try:
            os.makedirs(cache_dir, exist_ok=True)
            write_json(path, state)
        except Exception:
            pass
    if not parse_version(state.get("latest")):
        return {"latest": None, "url": None, "zip": None, "checked": state.get("checked"),
                "ok": state.get("ok") is True} if state else None
    return {"latest": state["latest"], "url": state.get("url"), "zip": state.get("zip"),
            "checked": state.get("checked"), "ok": state.get("ok") is True}


def ui_currency(value):
    """_settings.currency as saved: a 3-letter code upper-cased, else "auto"."""
    if isinstance(value, str) and re.fullmatch(r"[A-Za-z]{3}", value.strip()):
        return value.strip().upper()
    return "auto"


def ui_number(value, default):
    """A finite number as saved (whole numbers as int, like set_setting.py
    stores them), else the default."""
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        return default
    return int(value) if value == int(value) else value


def benchmark_choice(value):
    """_settings.benchmark as the widget's picker shows it: "none",
    "auto" or the symbol, read the way benchmark_symbol() reads it."""
    sym, source = benchmark_symbol(value, "USD")
    return "none" if source == "off" else sym if source == "setting" else "auto"


def ui_position(v):
    """_settings.position as {"x": int, "y": int} (set_setting.py's
    ranges), else None: the widget's default spot."""
    if not isinstance(v, dict):
        return None
    x, y = v.get("x"), v.get("y")
    if any(isinstance(n, bool) or not isinstance(n, (int, float)) or n != n
           or abs(n) == float("inf") for n in (x, y)):
        return None
    return {"x": int(max(-10000, min(20000, round(x)))),
            "y": int(max(0, min(20000, round(y))))}


def ui_scale(v):
    """_settings.scale clamped to 0.6-1.6; 1 when it isn't a number."""
    if isinstance(v, bool) or not isinstance(v, (int, float)) or v != v:
        return 1
    return round(max(0.6, min(1.6, v)), 2)


def load_settings(raw):
    settings = dict(DEFAULT_SETTINGS)
    if isinstance(raw.get("_name"), str):          # older files
        settings["title"] = raw["_name"]
    user = raw.get("_settings")
    if isinstance(user, dict):
        for k, v in user.items():
            if k in settings and v is not None:
                settings[k] = v
    return settings


EURO_REGIONS = ("AT", "BE", "BG", "CY", "DE", "EE", "ES", "FI", "FR", "GR", "HR",
                "IE", "IT", "LT", "LU", "LV", "MT", "NL", "PT", "SI", "SK",
                # use the euro without being members
                "AD", "MC", "SM", "VA", "ME", "XK")
REGION_CURRENCY = {
    "US": "USD", "GB": "GBP", "SE": "SEK", "NO": "NOK", "DK": "DKK", "IS": "ISK",
    "CH": "CHF", "LI": "CHF", "JP": "JPY", "AU": "AUD", "NZ": "NZD", "CA": "CAD",
    "HK": "HKD", "SG": "SGD", "IN": "INR", "KR": "KRW", "BR": "BRL", "MX": "MXN",
    "ZA": "ZAR", "IL": "ILS", "PL": "PLN", "CZ": "CZK", "HU": "HUF", "RO": "RON",
    "TW": "TWD", "CN": "CNY", "TR": "TRY", "TH": "THB", "MY": "MYR", "ID": "IDR",
    "PH": "PHP", "AE": "AED", "SA": "SAR", "QA": "QAR", "KW": "KWD", "CL": "CLP",
    "CO": "COP", "AR": "ARS", "PE": "PEN", "VN": "VND", "EG": "EGP", "NG": "NGN",
    "KE": "KES", "RS": "RSD", "UA": "UAH",
}
REGION_CURRENCY.update({r: "EUR" for r in EURO_REGIONS})


def currency_code(value):
    """A 3-letter currency code, upper-cased ("eur" -> "EUR"), or None."""
    s = str(value or "").strip()
    return s.upper() if re.match(r"^[A-Za-z]{3}$", s) else None


def locale_currency(loc):
    """macOS AppleLocale -> currency: an explicit "@currency=XXX" wins, then
    the region ("fi_FI" -> EUR, "en_GB" -> GBP, "en_US@rg=gbzzzz" -> GBP,
    "zh-Hans_CN" -> CNY), else USD."""
    loc = (loc or "").strip()
    m = re.search(r"currency=([A-Za-z]{3})", loc)
    if m:
        return m.group(1).upper()
    m = re.search(r"rg=([A-Za-z]{2})", loc)
    region = m.group(1).upper() if m else None
    if not region:
        for part in reversed(re.split(r"[_-]", loc.split("@")[0])[1:]):
            if re.match(r"^[A-Za-z]{2}$", part):
                region = part.upper()
                break
    return REGION_CURRENCY.get(region, "USD")


def resolve_currency(choice):
    """Any 3-letter code ("EUR", "gbp" -> "GBP"); "auto" (or anything else)
    asks macOS for the region: fi_FI -> EUR, en_CA -> CAD, else USD."""
    code = currency_code(choice)
    if code:
        return code
    try:
        loc = subprocess.run(["defaults", "read", "-g", "AppleLocale"],
                             capture_output=True, text=True, timeout=5).stdout
    except Exception:
        loc = ""
    return locale_currency(loc)


def backtest_years(value):
    """_settings.backtestYears -> 3, 5, 10 or "max"; anything else -> 5."""
    if isinstance(value, bool):
        return 5
    if isinstance(value, str):
        if value.strip().lower() == "max":
            return "max"
        try:
            value = float(value.strip())
        except ValueError:
            return 5
    if isinstance(value, (int, float)) and value in (3, 5, 10):
        return int(value)
    return 5


def benchmark_symbol(value, display):
    """_settings.benchmark (or --benchmark) -> (symbol or None, source):
    false / "none" / "off" -> (None, "off"); a valid Yahoo symbol ("vt" ->
    "VT") -> (it, "setting"); anything else ("auto", missing, a number, bad
    characters) -> the home currency's default, (…, "default")."""
    if value is False:
        return None, "off"
    if isinstance(value, str):
        s = value.strip().upper()
        if s in ("NONE", "OFF"):
            return None, "off"
        if s != "AUTO" and SYMBOL_RE.match(s):
            return s, "setting"
    return DEFAULT_BENCHMARKS.get(display, FALLBACK_BENCHMARK), "default"


CURRENCY_SIGNS = {"USD": "$", "CAD": "C$", "AUD": "A$", "NZD": "NZ$", "HKD": "HK$",
                  "SGD": "S$", "EUR": "€", "GBP": "£", "JPY": "¥",
                  "CNY": "¥", "INR": "₹", "KRW": "₩"}


def money_text(amount, iso, signed=False):
    """1234.5, "EUR" -> "€1,235" ("+€1,235" when signed); codes without a
    sign get the code after the number: "1,235 SEK"."""
    num = "{:,.0f}".format(abs(amount))
    sign = ("+" if amount >= 0 else "-") if signed else ("-" if amount < 0 else "")
    if iso in CURRENCY_SIGNS:
        return sign + CURRENCY_SIGNS[iso] + num
    return "%s%s %s" % (sign, num, iso)


def lot_date(value):
    """A lot's purchase date as YYYY-MM-DD, or None (missing or malformed —
    the lot then counts as always held, like a plain share count)."""
    if not isinstance(value, str):
        return None
    try:
        return datetime.strptime(value.strip(), "%Y-%m-%d").strftime("%Y-%m-%d")
    except ValueError:
        return None


def positions_problem(path):
    """A readable reason why the positions file can't be used, else None
    (it used to end in a traceback, the widget's only message)."""
    name = os.path.basename(path)
    try:
        with open(path) as f:
            raw = json.load(f)
    except ValueError as e:
        return ("%s is not valid JSON (%s). Fix it in a text editor, or copy "
                "back one of the positions.backup-*.json files next to it." % (name, e))
    except OSError as e:
        return "cannot read %s (%s)" % (name, e.strerror or e)
    if not isinstance(raw, dict):
        return ("%s should hold one JSON object: {\"TICKER\": {\"shares\": ...}, ...}"
                % name)
    return None


def load_positions(path):
    raw = json.load(open(path))
    positions = {}
    cash = {}
    invested = None
    watch = []
    settings = load_settings(raw)
    for key, val in raw.items():
        if key == "_watch" and isinstance(val, list):
            # tickers to monitor without holding them
            for w in val:
                w = str(w).upper().strip()
                if SYMBOL_RE.match(w) and w not in watch:
                    watch.append(w)
            continue
        if key == "_invested":
            try:
                invested = float(val)
            except (TypeError, ValueError):
                invested = None
            continue
        if key == "_cash" and isinstance(val, dict):
            for cur, amount in val.items():
                try:
                    if float(amount or 0):
                        cash[str(cur).upper()] = float(amount)
                except (TypeError, ValueError):
                    pass
            continue
        if key.startswith("_"):
            continue
        if isinstance(val, (int, float)):
            positions[key] = {"lots": [{"shares": float(val), "date": None,
                                        "avgCost": None}], "theme": None,
                              "currency": None}
        elif isinstance(val, dict):
            theme = val.get("theme")
            currency = val.get("currency")
            if "lots" in val:
                lots = [{"shares": float(l["shares"]),
                         "date": lot_date(l.get("date")),
                         "avgCost": (float(l["avgCost"])
                                     if l.get("avgCost") is not None else None)}
                        for l in val["lots"]]
            else:
                lots = [{"shares": float(val["shares"]),
                         "date": lot_date(val.get("purchaseDate")),
                         "avgCost": (float(val["avgCost"])
                                     if val.get("avgCost") is not None else None)}]
            positions[key] = {"lots": lots, "theme": theme, "currency": currency}
    watch = [w for w in watch if w not in positions]
    return positions, cash, invested, settings, watch


def _finite_or_none(v):
    if isinstance(v, bool):
        return None
    try:
        v = float(v)
    except (TypeError, ValueError):
        return None
    return v if math.isfinite(v) else None


REALIZED_NUMBERS = ("price", "proceeds", "basis", "gain", "fxRate",
                    "proceedsDisplay", "basisDisplay", "gainDisplay")


def load_realized(raw):
    """positions.json "_realized" (sales recorded by remove_position.py, or
    written by hand) as clean records. Not a list -> []; an item needs a
    ticker and shares > 0; other numbers are None unless finite; a date
    other than YYYY-MM-DD becomes None (counted in the total, not the YTD)."""
    items = raw.get("_realized") if isinstance(raw, dict) else None
    if not isinstance(items, list):
        return []
    out = []
    for it in items:
        if not isinstance(it, dict) or not isinstance(it.get("ticker"), str):
            continue
        tk = it["ticker"].strip().upper()
        shares = _finite_or_none(it.get("shares"))
        if not SYMBOL_RE.match(tk) or shares is None or shares <= 0:
            continue
        rec = {"ticker": tk, "date": lot_date(it.get("date")), "shares": shares}
        for k in REALIZED_NUMBERS:
            rec[k] = _finite_or_none(it.get(k))
        for k in ("currency", "displayCurrency"):
            v = it.get(k)
            rec[k] = v.strip() if isinstance(v, str) and v.strip() else None
        # the lot slices sold ({date, shares, cost}): dividends they earned
        # before the sale still count as received; cost (per share, quote
        # currency; None unless finite and >= 0) places the purchase for XIRR
        rec["lots"] = []
        for sl in it.get("lots") if isinstance(it.get("lots"), list) else []:
            if isinstance(sl, dict):
                sh = _finite_or_none(sl.get("shares"))
                if sh is not None and sh > 0:
                    cost = _finite_or_none(sl.get("cost"))
                    rec["lots"].append({"date": lot_date(sl.get("date")), "shares": sh,
                                        "cost": cost if cost is not None and cost >= 0
                                        else None})
        out.append(rec)
    return out


def sold_slices(records):
    """{ticker: [(lot date, shares, sale date)]} for the sold slices whose
    lot and sale dates are known (for dividends received before a sale)."""
    out = {}
    for rec in records:
        if not rec["date"]:
            continue
        for sl in rec["lots"]:
            if sl["date"] and sl["date"] <= rec["date"]:
                out.setdefault(rec["ticker"], []).append(
                    (sl["date"], sl["shares"], rec["date"]))
    return out


def realized_summary(records, fx, display, year, limit=20):
    """Realized gains in the display currency: a record's stored *Display
    values when it was recorded in this display currency, else native x
    today's rate (only rates this run already has), else unknown."""
    total = ytd = basis_total = 0.0
    unknown = 0
    sales = []
    for i, r in enumerate(records):
        cur = r["currency"] or infer_currency(r["ticker"])
        same = r["displayCurrency"] == display

        def conv(native, stored):
            if same and stored is not None:
                return stored
            rate = fx.factor(cur) if native is not None else None
            return native * rate if rate is not None else None
        gain_d = conv(r["gain"], r["gainDisplay"])
        basis_d = conv(r["basis"], r["basisDisplay"])
        proceeds_d = conv(r["proceeds"], r["proceedsDisplay"])
        if gain_d is None:
            unknown += 1
        else:
            total += gain_d
            if r["date"] and r["date"][:4] == year:
                ytd += gain_d
            if basis_d is not None:
                basis_total += basis_d
        if r["gain"] is not None and r["basis"]:
            pct = r["gain"] / r["basis"] * 100
        elif gain_d is not None and basis_d:
            pct = gain_d / basis_d * 100
        else:
            pct = None
        sales.append((r["date"] or "", i, {
            "ticker": r["ticker"], "date": r["date"], "shares": rnd(r["shares"], 4),
            "price": rnd(r["price"], 4), "currency": cur,
            "proceeds": rnd(r["proceeds"]), "basis": rnd(r["basis"]),
            "gain": rnd(r["gain"]), "gainPct": rnd(pct),
            "proceedsDisplay": rnd(proceeds_d), "gainDisplay": rnd(gain_d),
        }))
    sales.sort(key=lambda s: (s[0], s[1]), reverse=True)
    return {
        "realized": rnd(total) if records else None,
        "realizedYtd": rnd(ytd) if records else None,
        "realizedBasis": basis_total,
        "sales": [s[2] for s in sales[:limit]],
        "salesCount": len(records),
        "salesUnknown": unknown,
    }


# --------------------------------------------------------------------------
# fetching (each worker returns plain lists so the pipeline is easy to test)
# --------------------------------------------------------------------------

def daily_period_for(positions, backtest=5, today=None):
    """The first day the long price history has to reach, as YYYY-MM-DD (or
    "max"): the earliest purchase date or `backtest` years back, whichever is
    earlier — so the ALL graph, and starting the graph on any date, covers
    the whole life of the portfolio, and undated lots (held "forever") get
    `backtest` years instead of the one year they used to."""
    if backtest == "max":
        return "max"
    today = today or datetime.now(MARKET_TZ).date()
    try:
        back = today.replace(year=today.year - backtest)
    except ValueError:                      # Feb 29
        back = today.replace(year=today.year - backtest, day=28)
    dates = [l["date"] for pos in positions.values() for l in pos["lots"] if l["date"]]
    return min(dates + [back.strftime("%Y-%m-%d")])


def shift_date(date_str, days):
    return (datetime.strptime(date_str, "%Y-%m-%d").date()
            + timedelta(days=days)).strftime("%Y-%m-%d")


def history_covers(entry, start):
    """Does a history_bars.json entry reach back to `start`? Its "from" is the
    start that was REQUESTED, so a stock whose data begins later (IPO,
    rename, thin foreign listing) still counts as covered."""
    if not isinstance(entry, dict):
        return False
    first = entry.get("from")
    if first == "max":
        return True
    return start != "max" and isinstance(first, str) and first <= start


def _median(xs):
    xs = sorted(xs)
    n = len(xs)
    return xs[n // 2] if n % 2 else (xs[n // 2 - 1] + xs[n // 2]) / 2.0


def closes_agree(older, newer):
    """True / False: do two bar lists agree on the days they share (median
    close ratio within HISTORY_SPLIT_TOL)? None when they share no day.
    Yahoo's closes are split-adjusted, so bars fetched before a split or
    consolidation disagree with every bar fetched after it."""
    have = dict(newer)
    ratios = [c / have[d] for d, c in older if have.get(d) and c]
    if not ratios:
        return None
    return abs(_median(ratios) - 1) <= HISTORY_SPLIT_TOL


def long_bars_before(long_bars, fresh, trim_from):
    """(bars, status): the long-history bars that go in front of the fresh
    (one-year) bars — dated from `trim_from` up to the day before the first
    fresh bar. status "ok"; "split" (they disagree: refetch); "gap" (they
    share no day: fetch the missing days); "none" (no fresh bars to check
    against: not used)."""
    if not fresh:
        return [], "none"
    agree = closes_agree([b for b in long_bars if b[0] >= fresh[0][0]], fresh)
    if agree is None:
        return [], "gap"
    if not agree:
        return [], "split"
    first = fresh[0][0]
    return [(d, c) for d, c in long_bars if trim_from <= d < first], "ok"


def closes_of(frame, as_date=False, days=None):
    """[(YYYY-MM-DD or epoch, close)] from a yfinance history frame. If
    `days` is a list, each kept bar's date in the EXCHANGE's own timezone
    (the frame's index is tz-aware) is appended to it."""
    out = []
    for ts, row in frame.iterrows():
        c = row.get("Close")
        if c is not None and not (isinstance(c, float) and math.isnan(c)):
            out.append((ts.strftime("%Y-%m-%d") if as_date
                        else int(ts.timestamp()), float(c)))
            if days is not None:
                days.append(ts.strftime("%Y-%m-%d"))
    return out


def with_live_bar(daily, day, price):
    """`daily` plus (day, price) as that session's bar when the bars end
    before `day` (the live price's session, exchange calendar). Appended
    only: a bar Yahoo has published is never replaced, and weekends and
    holidays add nothing."""
    if day and daily and price is not None and day > daily[-1][0]:
        return daily + [(day, price)]
    return daily


class NoPriceData(ValueError):
    """Yahoo answered, with no bars (typo, delisted): retrying won't help."""


def fetch_one(ticker, yf_module, cached_bars=None, want_currency=False,
              daily_period="1y"):
    """Fetch intraday 5m closes (the live price) plus daily (`daily_period`
    back) and hourly 1mo closes. Daily/hourly come from cached_bars while
    younger than BARS_TTL and reaching at least as far back as asked.
    "daily" ends on the live session (see below); "dailyRaw" is Yahoo's
    bars as published, for the bars cache.
    Raises when there is no price at all: yfinance returns EMPTY frames for
    unknown or delisted symbols rather than raising."""
    t = yf_module.Ticker(ticker)
    intraday, intraday_days = [], []
    try:
        intraday = closes_of(t.history(period="1d", interval="5m",
                                       auto_adjust=False, prepost=True),
                             days=intraday_days)
    except Exception:
        pass

    # without live bars the daily close IS the price, so never serve it
    # from cache in that case
    reach = DAILY_PERIODS.index
    cached_period = (cached_bars or {}).get("period", "1y")
    if cached_period not in DAILY_PERIODS:
        cached_period = "1y"
    if (intraday and cached_bars and cached_bars.get("daily")
            and now_epoch() - cached_bars.get("t", 0) < BARS_TTL
            and reach(cached_period) >= reach(daily_period)):
        daily = [tuple(x) for x in cached_bars["daily"]]
        hourly = [tuple(x) for x in cached_bars.get("hourly", [])]
        bars_t = cached_bars["t"]
        daily_period = cached_period
    else:
        daily = closes_of(t.history(period=daily_period, interval="1d",
                                    auto_adjust=False), as_date=True)
        if not daily and not intraday:
            raise NoPriceData("no price data for %s" % ticker)
        # hourly closes over the last month — used to densify 1W/1M series
        hourly = []
        try:
            hourly = closes_of(t.history(period="1mo", interval="1h",
                                         auto_adjust=False))
        except Exception:
            pass
        bars_t = round(time.time(), 3)   # ms: use_long orders it against history_bars.json's "t"

    price = intraday[-1][1] if intraday else (daily[-1][1] if daily else None)
    if price is None:
        raise NoPriceData("no price data for %s" % ticker)

    # Previous session's close (the 1D reference). If the latest daily bar is
    # the same session as the live bars, the reference is the bar before it.
    # Dates are compared in the exchange's own calendar (New York dates made
    # Tokyo's morning session look like "yesterday", so 1D read ~0%).
    prev_close = None
    if daily:
        last_date = daily[-1][0]
        if intraday_days:
            same_session = intraday_days[-1] == last_date
        else:
            same_session = last_date == datetime.now(MARKET_TZ).strftime("%Y-%m-%d")
        prev_close = daily[-2][1] if same_session and len(daily) >= 2 \
            else daily[-1][1]
    # Known limitation: a bar missing from the MIDDLE of Yahoo's daily bars
    # can't be told from a weekend or holiday without an exchange calendar.
    # Seen on a coin just after midnight UTC: yesterday's bar absent, today's
    # already there. The reference is then two sessions back, so 1D spans
    # two days and 1W/1M/1Y count back one extra session until Yahoo
    # publishes the missing bar.

    # Yahoo can publish a session's daily bar hours after its 5-min bars
    # (seen late in the evening: intraday covered today, daily still ended
    # yesterday), which cut today off the 1Y/ALL sector graphs and made
    # 1W/1M/1Y count back one session too many. Until the bar arrives the
    # live price stands in as today's close (with_live_bar). "dailyRaw" keeps
    # Yahoo's own bars: that is what the bars cache and derive_basis use, so
    # a live price is never stored as a close.
    daily_raw = daily
    price_day = intraday_days[-1] if intraday_days else None
    daily = with_live_bar(daily, price_day, price)

    currency = None
    if want_currency:
        try:
            currency = (t.history_metadata or {}).get("currency")
        except Exception:
            pass

    return {"daily": daily, "dailyRaw": daily_raw,
            "intraday": intraday, "hourly": hourly,
            "price": price, "priceDay": price_day,
            "prevClose": prev_close, "barsT": bars_t,
            "period": daily_period, "currency": currency}


def clean_divs(value):
    """A cached "divs" list as [[YYYY-MM-DD, amount > 0], ...] sorted by
    date, or None when it isn't a list (never fetched / damaged cache)."""
    if not isinstance(value, list):
        return None
    out = []
    for item in value:
        if (isinstance(item, (list, tuple)) and len(item) == 2
                and lot_date(item[0])):
            amount = _finite_or_none(item[1])
            if amount is not None and amount > 0:
                out.append([item[0], amount])
    return sorted(out)


def fetch_divs(ticker, yf_module, period):
    """Past dividends per share (quote currency) as [[ex-date, amount], ...]
    ascending. yfinance gives a Series indexed by ex-date (a DataFrame with a
    "Dividends" column in some versions); None / no such column raises."""
    s = yf_module.Ticker(ticker).get_dividends(period=period)
    if s is None:
        raise ValueError("no dividend data")
    if hasattr(s, "columns"):
        if "Dividends" in s.columns:
            s = s["Dividends"]
        elif len(s.columns):
            raise ValueError("no Dividends column")
        else:
            return []
    per_day = {}
    for ts, amount in s.items():
        day = ts.strftime("%Y-%m-%d") if hasattr(ts, "strftime") else str(ts)[:10]
        amount = _finite_or_none(amount)
        if lot_date(day) and amount is not None and amount > 0:
            per_day[day] = per_day.get(day, 0.0) + amount
    return [[d, round(a, 6)] for d, a in sorted(per_day.items())]


def divs_due(entry, want, now):
    """Does a held ticker's dividend history need a (re)fetch: never
    fetched, older than its TTL, or reaching less far back than `want`?
    Not while a failed fetch waits for its retry."""
    if now < entry.get("divsRetryAt", 0):
        return False
    divs = clean_divs(entry.get("divs"))
    if divs is None:
        return True
    # an empty list is re-checked weekly — daily if Yahoo's info still
    # quotes a dividend rate (the empty answer may have been a hiccup)
    ttl = DIVS_EMPTY_TTL if not divs and not entry.get("dividendRate") else DIVS_TTL
    if now - entry.get("divsFetchedAt", 0) > ttl:
        return True
    have = entry.get("divsPeriod")
    return (have not in DIVS_PERIODS
            or DIVS_PERIODS.index(have) < DIVS_PERIODS.index(want))


def ymd_or_none(value):
    """A calendar date / datetime (or a one-item list of one) as YYYY-MM-DD,
    else None (NaT, strings, numbers)."""
    if isinstance(value, (list, tuple)):
        value = value[0] if len(value) == 1 else None
    try:
        return lot_date(value.strftime("%Y-%m-%d")) if hasattr(value, "strftime") else None
    except Exception:
        return None


def update_divs(ticker, yf_module, meta, divs_period):
    """Past dividends of a held ticker, reaching `divs_period` back (1d TTL,
    7d when none). A failure — or an empty answer although it paid within
    the last year — keeps the old list and retries in META_RETRY. Its own
    job in the meta pool, so on a new day it runs beside the calendar call
    instead of after it."""
    entry = meta.setdefault(ticker, {})
    now = now_epoch()
    if not divs_due(entry, divs_period, now):
        return
    old = clean_divs(entry.get("divs"))
    try:
        divs = fetch_divs(ticker, yf_module, divs_period)
        year_ago = datetime.fromtimestamp(now - 365 * 86400, MARKET_TZ).strftime("%Y-%m-%d")
        if not divs and old and old[-1][0] > year_ago:
            raise ValueError("empty dividend answer")
        entry["divs"] = divs
        entry["divsPeriod"] = divs_period
        entry["divsFetchedAt"] = now
        entry.pop("divsRetryAt", None)
    except Exception:
        entry["divsRetryAt"] = now + META_RETRY


def fetch_meta(ticker, yf_module, meta, cache_dir, spot=None, divs_period=None):
    """Dividend rate (7d TTL), next earnings date and ex-dividend date (1d
    TTL), and — for earnings within 30 days — the options-implied move (1d
    TTL). With `divs_period` (held tickers): past dividends reaching that far
    back (1d TTL, 7d when none). Cached."""
    entry = meta.setdefault(ticker, {})
    now = now_epoch()

    # A failed lookup (rate limit, network) keeps the last value and retries
    # in META_RETRY — it used to be stamped as fetched, i.e. $0 dividends for
    # a whole week after one hiccup. The same .info call gives the sector
    # (the theme of untagged tickers); older caches lack it, hence "not in".
    if now - entry.get("dividendFetchedAt", 0) > DIVIDEND_TTL \
            or "sector" not in entry or "name" not in entry:
        try:
            info = yf_module.Ticker(ticker).info or {}
            rate = info.get("dividendRate")
            ok = isinstance(rate, (int, float)) and math.isfinite(rate)
            entry["dividendRate"] = float(rate) if ok else 0.0
            entry["sector"] = (info.get("sector")
                               or QUOTE_TYPE_THEMES.get(info.get("quoteType")))
            entry["name"] = (info.get("longName") or info.get("shortName")
                             or "").strip() or None
            entry["dividendFetchedAt"] = now
        except Exception:
            entry["dividendRate"] = entry.get("dividendRate") or 0.0
            entry.setdefault("sector", None)  # else "not in" retries every run
            entry.setdefault("name", None)
            entry["dividendFetchedAt"] = now - DIVIDEND_TTL + META_RETRY

    if divs_period:
        update_divs(ticker, yf_module, meta, divs_period)

    # "exDividend" arrived in 12.7: older caches lack it -> one extra
    # calendar lookup each (like "sector" above)
    if now - entry.get("earningsFetchedAt", 0) > EARNINGS_TTL \
            or "exDividend" not in entry:
        earnings = None
        ex_div = None
        fetched_at = now
        try:
            cal = yf_module.Ticker(ticker).calendar
            dates = None
            if isinstance(cal, dict):
                dates = cal.get("Earnings Date")
                ex_div = cal.get("Ex-Dividend Date")
            elif cal is not None and hasattr(cal, "loc"):
                try:
                    dates = list(cal.loc["Earnings Date"])
                except Exception:
                    dates = None
                try:
                    ex_div = list(cal.loc["Ex-Dividend Date"])[0]
                except Exception:
                    ex_div = None
            ex_div = ymd_or_none(ex_div)
            if dates:
                today = datetime.now(MARKET_TZ).date()
                parsed = []
                for d in dates:
                    if hasattr(d, "date"):
                        d = d.date()
                    parsed.append(d)
                future = sorted(d for d in parsed if d >= today)
                pick = future[0] if future else sorted(parsed)[-1]
                earnings = pick.strftime("%Y-%m-%d")
        except Exception:
            earnings = entry.get("earnings")
            ex_div = entry.get("exDividend")
            fetched_at = now - EARNINGS_TTL + META_RETRY
        entry["earnings"] = earnings
        entry["exDividend"] = ex_div
        entry["earningsFetchedAt"] = fetched_at

    ed = entry.get("earnings")
    want_move = False
    if ed:
        try:
            days = (datetime.strptime(ed, "%Y-%m-%d").date()
                    - datetime.now(MARKET_TZ).date()).days
            want_move = 0 <= days <= 30
        except ValueError:
            pass
    if not want_move:
        entry["impliedMove"] = None
    elif now - entry.get("impliedMoveFetchedAt", 0) > EARNINGS_TTL:
        entry["impliedMove"] = compute_implied_move(ticker, yf_module, ed, spot)
        entry["impliedMoveFetchedAt"] = now
    return entry


def compute_implied_move(ticker, yf_module, earnings_date, spot):
    """Options-implied expected move: ATM straddle (call+put mid) as % of
    spot, using the first expiry ON or AFTER the earnings date. Returns a
    rounded percent, or None when quotes are missing/implausible."""
    try:
        t = yf_module.Ticker(ticker)
        exps = list(t.options or [])
        exp = None
        for e in exps:
            if e >= earnings_date:
                exp = e
                break
        if exp is None or not spot:
            return None
        chain = t.option_chain(exp)

        def atm_mid(df):
            best, bestd = None, None
            for _, row in df.iterrows():
                try:
                    s = float(row.get("strike"))
                except (TypeError, ValueError):
                    continue
                dist = abs(s - spot)
                if bestd is None or dist < bestd:
                    bestd, best = dist, row
            if best is None:
                return None

            def val(x):
                try:
                    x = float(x)
                    return x if x > 0 and not math.isnan(x) else None
                except (TypeError, ValueError):
                    return None
            b, a = val(best.get("bid")), val(best.get("ask"))
            if b and a:
                return (b + a) / 2
            return val(best.get("lastPrice"))

        c = atm_mid(chain.calls)
        p = atm_mid(chain.puts)
        if c is None or p is None:
            return None
        mv = (c + p) / spot * 100
        if mv < 0.5 or mv > 60:  # junk quotes on illiquid names
            return None
        return round(mv, 1)
    except Exception:
        return None


def derive_basis(ticker, date_str, daily, cache_dir, yf_module):
    """Closing price on the purchase date (or the first session within a week
    after it, for weekends and holidays).

    The daily bars decide whenever they actually reach back to that date. An
    earlier version took "the first bar on or after the date" from a one-year
    window, so a purchase older than the window silently got the window's
    FIRST close — months too late — and that wrong cost was cached for good.
    Bars that cover the date therefore override the cache; only when they
    don't is the cached value (or a lookup of that one week) used. A close is
    cached once its session is over: today's bar is still moving."""
    path = os.path.join(cache_dir, "derived_basis.json")
    key = "%s|%s" % (ticker, date_str)
    want = datetime.strptime(date_str, "%Y-%m-%d").date()

    def near(bar_date):
        return 0 <= (datetime.strptime(bar_date, "%Y-%m-%d").date() - want).days <= 7

    price, bar_date = None, None
    if daily and daily[0][0] <= date_str:            # the bars reach back far enough
        for d, c in daily:
            if d >= date_str:
                if near(d):
                    price, bar_date = c, d
                break
    if price is None:
        with _meta_lock:
            cache = read_json(path, {})
        if key in cache and not (daily and daily[0][0] <= date_str):
            return cache[key]
        try:
            hist = yf_module.Ticker(ticker).history(
                start=date_str, end=(want + timedelta(days=10)).strftime("%Y-%m-%d"),
                interval="1d", auto_adjust=False)
            for ts, row in hist.iterrows():
                c = row.get("Close")
                if c is not None and not (isinstance(c, float) and math.isnan(c)):
                    if near(ts.strftime("%Y-%m-%d")):
                        price, bar_date = float(c), ts.strftime("%Y-%m-%d")
                    break
        except Exception:
            price = None
        if price is None:
            return cache.get(key)
    if bar_date < datetime.now(MARKET_TZ).strftime("%Y-%m-%d"):
        with _meta_lock:
            cache = read_json(path, {})
            if cache.get(key) != price:
                cache[key] = price
                write_json(path, cache)
    return price


# --------------------------------------------------------------------------
# news headlines (only when _settings.news is true: off = none of this runs)
# --------------------------------------------------------------------------

_news_lock = threading.Lock()


def safe_url(u):
    """A headline link the widget may hand to `open`: https:// only, at most
    2000 characters, everything outside NEWS_URL_SAFE percent-encoded (so no
    quote, space, backtick, backslash, <>{}|^ or newline survives), else None."""
    if not isinstance(u, str):
        return None
    u = u.strip()
    if not u.startswith("https://") or len(u) > 2000:
        return None
    try:
        from urllib.parse import quote
        u = quote(u, safe=NEWS_URL_SAFE)
    except Exception:
        return None
    return u if len(u) <= 2000 and NEWS_URL_RE.fullmatch(u) else None


def news_text(v, limit):
    """Plain one-line text: control / format characters dropped, whitespace
    collapsed, at most `limit` characters (… when cut); None when empty."""
    if not isinstance(v, str):
        return None
    import unicodedata
    v = " ".join("".join(" " if unicodedata.category(c) in ("Cc", "Cf", "Cs", "Co")
                         else c for c in v).split())
    if len(v) > limit:
        v = v[:limit - 1].rstrip() + "…"
    return v or None


def news_time(v):
    """epoch int from an ISO time ("2026-09-23T14:14:49Z", yfinance 1.x
    pubDate) or an epoch number (older providerPublishTime); else None."""
    if isinstance(v, bool):
        return None
    if isinstance(v, (int, float)):
        return int(v) if 0 < v < 1e11 else None
    if not isinstance(v, str) or not v.strip():
        return None
    s = v.strip()
    try:
        d = datetime.fromisoformat(s.replace("Z", "+00:00"))
    except ValueError:
        try:
            d = datetime.strptime(s[:19], "%Y-%m-%dT%H:%M:%S")
        except ValueError:
            return None
    if d.tzinfo is None:
        d = d.replace(tzinfo=timezone.utc)
    return int(d.timestamp())


def news_item(title, source, t, url):
    """One NewsItem, every field re-checked (also for items read back from
    news.json); None without a title."""
    title = news_text(title, 200)
    if not title:
        return None
    if isinstance(t, bool) or not isinstance(t, (int, float)) or not 0 < t < 1e11:
        t = None
    return {"title": title, "source": news_text(source, 60),
            "time": int(t) if t is not None else None, "url": safe_url(url)}


def parse_news(raw):
    """Yahoo's news list -> up to NEWS_KEEP_MAX NewsItems {title, source,
    time, url}, newest first. Takes yfinance 1.x items ({"content": {"title",
    "pubDate", "provider": {"displayName"}, "clickThroughUrl": {"url"},
    "canonicalUrl": {"url"}}}) and the older flat ones ({"title",
    "publisher", "link", "providerPublishTime"}); items without a title go."""
    items = []
    for n, it in enumerate(raw if isinstance(raw, (list, tuple)) else ()):
        if not isinstance(it, dict):
            continue
        c = it.get("content") if isinstance(it.get("content"), dict) else it
        prov = c.get("provider")
        source = prov.get("displayName") if isinstance(prov, dict) else None
        url = None
        for key in ("clickThroughUrl", "canonicalUrl", "link"):
            v = c.get(key)
            url = safe_url(v.get("url") if isinstance(v, dict) else v)
            if url:
                break
        item = news_item(c.get("title"), source or c.get("publisher"),
                         news_time(c.get("pubDate") or c.get("displayTime")
                                   or c.get("providerPublishTime")), url)
        if item:
            items.append((-(item["time"] or 0), n, item))
    return [item for _, _, item in sorted(items, key=lambda x: x[:2])][:NEWS_KEEP_MAX]


def fetch_news(ticker, yf_module):
    """One Yahoo request: Ticker.get_news(count=10) (yfinance 1.x), else the
    .news property (older versions). Raises on network trouble."""
    t = yf_module.Ticker(ticker)
    get = getattr(t, "get_news", None)
    if callable(get):
        try:
            raw = get(count=10)
        except TypeError:           # an older get_news without count
            raw = t.news
    else:
        raw = t.news
    return parse_news(raw)


def news_cache_path(cache_dir):
    return os.path.join(cache_dir, "news.json")


def read_news_cache(cache_dir):
    c = read_json(news_cache_path(cache_dir), {})
    return c if isinstance(c, dict) else {}


def news_entry_t(entry):
    t = entry.get("t") if isinstance(entry, dict) else None
    return None if isinstance(t, bool) or not isinstance(t, (int, float)) else t


def news_entry_fails(entry):
    """consecutive failures an error entry carries (a 13.0 entry: 1)."""
    if not isinstance(entry, dict) or not entry.get("error"):
        return 0
    n = entry.get("fails")
    return n if isinstance(n, int) and not isinstance(n, bool) and n > 0 else 1


def news_fresh(entry, now):
    """A news.json entry young enough to reuse: NEWS_TTL, or NEWS_FAIL_TTL
    after a failure (NEWS_TTL again once it failed more than NEWS_FAIL_MAX
    times in a row — a dead symbol is not retried every 10 minutes)."""
    t = news_entry_t(entry)
    if t is None:
        return False
    ttl = NEWS_FEED_TTL if entry.get("feed") else NEWS_TTL     # a market feed (13.3)
    if entry.get("error") and news_entry_fails(entry) <= NEWS_FAIL_MAX:
        ttl = NEWS_FAIL_TTL
    return 0 <= now - t < ttl


def news_entry_items(entry, keep=NEWS_KEEP_MAX):
    raw = entry.get("items") if isinstance(entry, dict) else None
    out = []
    for it in raw if isinstance(raw, list) else ():
        if isinstance(it, dict):
            item = news_item(it.get("title"), it.get("source"), it.get("time"), it.get("url"))
            if item:
                out.append(item)
                if len(out) >= keep:
                    break
    return out


def news_fetch_entry(ticker, yf_module, prev, now):
    """One fetch -> (the news.json entry {t, items, error[, fails]}, the
    error text or None). `prev` = the ticker's old entry (its `fails`
    count carries on while the failures are consecutive)."""
    try:
        return {"t": now, "items": fetch_news(ticker, yf_module), "error": False}, None
    except Exception as e:
        return ({"t": now, "items": [], "error": True, "fails": news_entry_fails(prev) + 1},
                "%s %s" % (type(e).__name__, e))


def save_news_entries(cache_dir, entries, now):
    """Merge {ticker: entry} into news.json in one read-merge-replace: an
    exclusive flock on news.json.lock (the tracker and ticker_lookup.py
    share the file; best effort — a lock error is ignored and the write
    still happens), re-read right before writing, entries older than
    NEWS_PRUNE dropped, written atomically. Best effort."""
    if not entries:
        return
    path = news_cache_path(cache_dir)
    tmp = "%s.%d.%d.tmp" % (path, os.getpid(), threading.get_ident())
    with _news_lock:
        lock = None
        try:
            os.makedirs(cache_dir, exist_ok=True)
            try:
                import fcntl
                lock = open(path + ".lock", "a")
                fcntl.flock(lock.fileno(), fcntl.LOCK_EX)
            except Exception:
                lock = None
            cache = read_news_cache(cache_dir)
            cache.update(entries)
            cache = {k: v for k, v in cache.items()
                     if news_entry_t(v) is not None and now - news_entry_t(v) < NEWS_PRUNE}
            with open(tmp, "w") as f:
                json.dump(cache, f, separators=(",", ":"), allow_nan=False)
            os.replace(tmp, path)
        except Exception:
            try:
                os.remove(tmp)
            except OSError:
                pass
        finally:
            if lock is not None:
                try:
                    lock.close()     # releases the flock
                except Exception:
                    pass


def save_news_entry(cache_dir, ticker, entry, now):
    """Merge one ticker into news.json (save_news_entries)."""
    save_news_entries(cache_dir, {ticker: entry}, now)


def news_for(ticker, yf_module, cache_dir, now=None, cache=None):
    """(items, fetched-at epoch, from the cache?, failed?) for one ticker:
    news.json's entry while it is fresh, else one fetch (saved either way,
    under the shared lock). Up to NEWS_KEEP_MAX items. `cache` = news.json
    as already read."""
    now = now_epoch() if now is None else now
    entry = (read_news_cache(cache_dir) if cache is None else cache).get(ticker)
    if news_fresh(entry, now):
        return news_entry_items(entry), int(entry["t"]), True, bool(entry.get("error"))
    entry, _ = news_fetch_entry(ticker, yf_module, entry, now)
    save_news_entry(cache_dir, ticker, entry, now)
    return entry["items"], now, False, bool(entry["error"])


def feed_time(v):
    """epoch from an RSS / Atom date: RFC 822 ("Sat, 26 Sep 2026 17:10:32
    GMT", "… -0500") or ISO; None when unreadable."""
    if not isinstance(v, str) or not v.strip():
        return None
    try:
        from email.utils import parsedate_to_datetime
        d = parsedate_to_datetime(v.strip())
        if d is not None:
            if d.tzinfo is None:
                d = d.replace(tzinfo=timezone.utc)
            return int(d.timestamp())
    except Exception:
        pass
    return news_time(v)


def parse_feed(data, name, now=None):
    """RSS 2.0 / Atom bytes -> NewsItems whose source is the feed's `name`,
    newest first, at most NEWS_FEED_KEEP; items without a readable time, a
    usable https link, or older than NEWS_FEED_MAX_AGE are dropped. Raises
    on unparsable XML."""
    import xml.etree.ElementTree as ET
    now = now_epoch() if now is None else now
    root = ET.fromstring(data)
    atom = "{http://www.w3.org/2005/Atom}"
    dc = "{http://purl.org/dc/elements/1.1/}"
    items = []
    for n, it in enumerate(list(root.iter("item")) + list(root.iter(atom + "entry"))):
        title = it.findtext("title") or it.findtext(atom + "title")
        link = it.findtext("link")
        if not link:
            for l in it.findall(atom + "link"):
                if l.get("rel") in (None, "alternate") and l.get("href"):
                    link = l.get("href")
                    break
        when = (it.findtext("pubDate") or it.findtext(dc + "date")
                or it.findtext(atom + "published") or it.findtext(atom + "updated"))
        t = feed_time(when)
        if t is None or now - t > NEWS_FEED_MAX_AGE:
            continue
        item = news_item(title, name, t, (link or "").strip())
        if item and item["url"]:
            items.append((-t, n, item))
    return [item for _, _, item in sorted(items, key=lambda x: x[:2])][:NEWS_FEED_KEEP]


def fetch_feed(fid, now=None):
    """The items of one NEWS_FEEDS entry: one https GET (NEWS_FEED_TIMEOUT s,
    at most NEWS_FEED_BYTES). With PORTFOLIO_NEWS_FEED_DIR set (tests) the
    file <dir>/<id>.xml is read instead. Raises on network trouble."""
    name, url = NEWS_FEEDS[fid]
    test_dir = os.environ.get("PORTFOLIO_NEWS_FEED_DIR")
    if test_dir:
        with open(os.path.join(test_dir, fid + ".xml"), "rb") as f:
            data = f.read(NEWS_FEED_BYTES)
    else:
        import urllib.request
        req = urllib.request.Request(url, headers={
            "User-Agent": NEWS_FEED_UA,
            "Accept": "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.5"})
        with urllib.request.urlopen(req, timeout=NEWS_FEED_TIMEOUT, context=feed_ssl_context()) as r:
            data = r.read(NEWS_FEED_BYTES)
    return parse_feed(data, name, now)


def feed_ssl_context():
    """The default TLS context, plus certifi's roots when it is installed:
    python.org's Python ships no system roots for urllib (yfinance's own
    requests use certifi), so without this every feed fails with
    CERTIFICATE_VERIFY_FAILED. Verification is never turned off."""
    import ssl
    ctx = ssl.create_default_context()
    try:
        import certifi
        ctx.load_verify_locations(certifi.where())
    except Exception:
        pass
    return ctx


# --------------------------------------------------------------------------
# long price history (the background job; see the module docstring)
# --------------------------------------------------------------------------

def fetch_long(symbol, yf_module, start):
    """Yahoo's daily closes of `symbol` from HISTORY_SLACK_DAYS before
    `start` (YYYY-MM-DD, or "max" for everything) up to yesterday — today's
    bar is still moving, and the normal refresh has it anyway. Closes are
    kept to 7 significant digits to keep the file small. An empty answer
    (delisted, or listed today) is [] — a result, not an error: raising
    would retry it every HISTORY_RETRY_AFTER forever."""
    t = yf_module.Ticker(symbol)
    if start == "max":
        frame = t.history(period="max", interval="1d", auto_adjust=False)
    else:
        frame = t.history(start=shift_date(start, -HISTORY_SLACK_DAYS),
                          interval="1d", auto_adjust=False)
    today = datetime.now(MARKET_TZ).strftime("%Y-%m-%d")
    return [[d, float("%.7g" % c)] for d, c in closes_of(frame, as_date=True)
            if d < today and c > 0]


def fetch_history_item(item, entry, start, yf_module):
    """The new history_bars.json entry for one plan item: "full" downloads
    from `start`; "topup" downloads from just before the cached bars end and
    appends the new days — or starts over when the shared days disagree (a
    split since the cached bars were fetched). "t" is when Yahoo was asked,
    also when it had nothing new (use_long waits HISTORY_RECHECK on it)."""
    if item.get("mode") == "topup" and isinstance(entry, dict) and entry.get("daily"):
        old = [tuple(b) for b in entry["daily"]]
        new = fetch_long(item["symbol"], yf_module, old[-1][0])
        if not new:          # nothing at all any more (halted, delisted)
            return dict(entry, t=round(time.time(), 3))
        if closes_agree([b for b in old if b[0] >= new[0][0]], new) is True:
            last = old[-1][0]
            return {"from": entry.get("from"), "t": round(time.time(), 3),
                    "daily": [list(b) for b in old] + [b for b in new if b[0] > last]}
    return {"from": start, "t": round(time.time(), 3),
            "daily": fetch_long(item["symbol"], yf_module, start)}


def fetch_history(cache_dir, yf_module, progress_file=None):
    """The background history job: download what .cache/history.needed (the
    last refresh's plan) asks for into .cache/history_bars.json
    {SYMBOL: {"from": start | "max", "daily": [[date, close], ...], "t"}},
    then touch .cache/refresh.request so the next refresh merges it. Items
    fetched since the plan was written are skipped. Never touches data.json,
    bars.json or derived_basis.json and prints nothing. Returns 0 when every
    item worked, 1 otherwise (the caller backs off before retrying)."""
    needed_path = os.path.join(cache_dir, "history.needed")
    hist_path = os.path.join(cache_dir, "history_bars.json")
    plan = read_json(needed_path, None)
    start = plan.get("start") if isinstance(plan, dict) else None
    if not (isinstance(plan, dict) and isinstance(plan.get("items"), list)
            and (start == "max" or (isinstance(start, str)
                                    and re.match(r"^\d{4}-\d{2}-\d{2}$", start)))):
        # unusable (it is written atomically, so not half-written): drop it,
        # or widget_command.sh would start this job again on every tick
        if os.path.exists(needed_path):
            print("history: unreadable plan removed", file=sys.stderr)
            try:
                os.remove(needed_path)
            except OSError:
                pass
        return 0
    hist = read_json(hist_path, {})
    if not isinstance(hist, dict):
        hist = {}
    plan_t = plan.get("t") or 0

    def fetched_since_plan(sym):
        entry = hist.get(sym)
        return isinstance(entry, dict) and (entry.get("t") or 0) >= plan_t

    items = [it for it in plan["items"]
             if isinstance(it, dict) and isinstance(it.get("symbol"), str)
             and not fetched_since_plan(it["symbol"])]
    ok, done = [True], [0]
    fetched = {}

    def job(item):
        last_err = None
        for attempt in range(2):
            try:
                return fetch_history_item(item, hist.get(item["symbol"]), start,
                                          yf_module)
            except Exception as e:   # retry once
                last_err = e
                if attempt == 0:
                    time.sleep(2)
        raise last_err

    write_progress(progress_file, 0, len(items), "starting")
    if items:
        with ThreadPoolExecutor(max_workers=HISTORY_WORKERS) as ex:
            futures = {ex.submit(job, it): it["symbol"] for it in items}
            for fut in as_completed(futures):
                sym = futures[fut]
                try:
                    fetched[sym] = fut.result()
                except Exception as e:
                    ok[0] = False
                    print("history: %s failed: %s" % (sym, e), file=sys.stderr)
                done[0] += 1
                write_progress(progress_file, done[0], len(items), sym)

    keep = plan.get("keep")
    pruned = ({s: v for s, v in hist.items() if s in keep}
              if isinstance(keep, list) else dict(hist))
    pruned.update(fetched)
    if pruned != hist:
        write_json(hist_path, pruned)
    # a refresh only when that changes the graph: bars or coverage, not just
    # "t" (a top-up that found no new day would otherwise loop refresh ->
    # plan -> job -> refresh every few seconds)
    def shown(entry):
        return (entry.get("from"), entry.get("daily")) if isinstance(entry, dict) else None
    if any(shown(v) != shown(hist.get(s)) for s, v in fetched.items()):
        with open(os.path.join(cache_dir, "refresh.request"), "w") as f:
            f.write("%d\n" % now_epoch())
    if ok[0]:
        # only if no newer plan arrived meanwhile (the next refresh redoes it)
        if (read_json(needed_path, {}) or {}).get("t") == plan.get("t"):
            try:
                os.remove(needed_path)
            except OSError:
                pass
    return 0 if ok[0] else 1


# --------------------------------------------------------------------------
# history storage + series building
# --------------------------------------------------------------------------

def _snapshot_line(t, v, b):
    obj = {"t": t, "v": v}
    if b is not None:
        obj["b"] = b
    return json.dumps(obj) + "\n"


def append_snapshot(history_file, total, basis=None):
    """Record {t, v, b}: value now and the money at work (cost basis + cash),
    so a later P&L graph knows what was invested at that moment."""
    snaps = load_snapshots(history_file)
    now = now_epoch()
    if snaps and now - snaps[-1][0] < SNAPSHOT_MIN_GAP:
        return snaps
    b = round(basis, 2) if basis is not None else None
    with open(history_file, "a") as f:
        f.write(_snapshot_line(now, round(total, 2), b))
    snaps.append((now, round(total, 2), b))
    if len(snaps) > HISTORY_MAX_LINES:
        keep = snaps[-HISTORY_KEEP_LINES:]
        tmp = history_file + ".tmp"
        with open(tmp, "w") as f:
            for t, v, sb in keep:
                f.write(_snapshot_line(t, v, sb))
        os.replace(tmp, history_file)
        snaps = keep
    return snaps


def history_for_currency(history_file, display):
    """history.jsonl holds values in one display currency, named in
    history.currency next to it. When `currency` changes, the file is set
    aside as history.<OLD>.jsonl and history.<NEW>.jsonl (from an earlier
    switch) comes back, so recorded values never mix currencies — a CAD
    snapshot drawn as USD is a 40% spike, and the rebuilt history is shifted
    to meet the recorded values. Without the marker (a file from before 13.0)
    the history is taken to be in today's currency."""
    root, ext = os.path.splitext(history_file)
    marker = root + ".currency"
    try:
        with open(marker) as f:
            old = f.read().strip().upper()
    except OSError:
        old = ""
    if old == display:
        return
    if re.match(r"^[A-Z]{3}$", old):
        try:
            if os.path.exists(history_file):
                os.replace(history_file, "%s.%s%s" % (root, old, ext))
            back = "%s.%s%s" % (root, display, ext)
            if os.path.exists(back):
                os.replace(back, history_file)
        except OSError as e:
            print("history: could not switch to %s (%s)" % (display, e), file=sys.stderr)
            return          # the marker stays: next refresh tries again
    try:
        tmp = marker + ".tmp"
        with open(tmp, "w") as f:
            f.write(display + "\n")
        os.replace(tmp, marker)
    except OSError:
        pass


def load_snapshots(history_file):
    snaps = []
    if os.path.exists(history_file):
        with open(history_file) as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    obj = json.loads(line)
                    b = obj.get("b")
                    snaps.append((int(obj["t"]), float(obj["v"]),
                                  float(b) if isinstance(b, (int, float)) else None))
                except Exception:
                    continue
    snaps.sort(key=lambda x: x[0])
    return snaps


def et_date(t):
    return datetime.fromtimestamp(t, MARKET_TZ).strftime("%Y-%m-%d")


def held_on(pos, date_str):
    """Shares of a position held on a date: the lots bought on or before it
    (undated lots always count)."""
    return sum(l["shares"] for l in pos["lots"]
               if not l["date"] or l["date"] <= date_str)


def dividend_period(pos, today):
    """How far back a holding's dividend history must reach (a Yahoo period):
    its earliest dated lot with 30 days' slack; "2y" (the last year + slack)
    when it has no dated lot or a young one. `today` is a date."""
    dates = [l["date"] for l in pos["lots"] if l["date"]]
    if not dates:
        return "2y"
    age = (today - datetime.strptime(min(dates), "%Y-%m-%d").date()).days
    for period, days in (("2y", 730), ("5y", 1826), ("10y", 3652)):
        if age + 30 <= days:
            return period
    return "max"


def ttm_divs(divs, today_str):
    """The payments of the last 365 days: ex-date in (today - 365 d, today].
    Ex-dates drift a few days year to year, so for a few days the window can
    hold one payment more than the holding pays in a year (a quarterly payer
    showing 5): an oldest payment just inside the window's start (a quarter
    of the usual gap, at most 20 days) and about a year before the newest
    is then last year's copy of it, and is left out (a special dividend
    elsewhere in the year still counts)."""
    start = shift_date(today_str, -365)
    ttm = sorted((d, a) for d, a in divs if start < d <= today_str)
    past = sorted(d for d, _ in divs if d <= today_str)[-9:]
    if len(ttm) >= 2 and len(past) >= 3:
        day = lambda s: datetime.strptime(s, "%Y-%m-%d")
        gaps = sorted((day(b) - day(a)).days for a, b in zip(past, past[1:]))
        gap = gaps[len(gaps) // 2]
        if gap >= 7:
            per_year = max(1, int(round(365.0 / gap)))
            slack = max(3, min(20, gap // 4))
            if len(ttm) > per_year and \
                    (day(ttm[0][0]) - day(start)).days <= slack and \
                    (day(ttm[-1][0]) - day(ttm[0][0])).days >= 365 - slack:
                ttm = ttm[1:]
    return ttm


def divs_received(divs, lots, today_str, sold=()):
    """Dividends per holding already received, in the quote currency: every
    payment with ex-date <= today x the shares of DATED lots bought before
    the ex-date (undated lots have no known start), plus the recorded sales'
    dated slices (lot date, shares, sale date) for ex-dates up to the sale
    (a sale on the ex-date keeps that dividend). Shares sold before 12.7
    recorded sales, and slices without a date, are not counted."""
    dated = {"lots": [l for l in lots if l["date"]]}
    return sum(a * div_shares(dated, sold, d) for d, a in divs if d <= today_str)


def div_shares(dated, sold, d):
    """Shares that earn a dividend with ex-date d: the dated lots bought
    before d (`dated` = {"lots": dated lots only}) plus the sold slices
    (lot date, shares, sale date) with lot date < d <= sale date. The one
    share rule for divs_received and the XIRR dividend flows."""
    return (held_on(dated, shift_date(d, -1))
            + sum(sh for ld, sh, sd in sold if ld < d <= sd))


def divs_months(ttm, today_str):
    """Last year's payments (per share) projected onto the next 12 months:
    [(YYYY-MM, sum)] from the current month on, grouped by month of year."""
    y, m = int(today_str[:4]), int(today_str[5:7])
    out = []
    for i in range(12):
        yy, mm = y + (m - 1 + i) // 12, (m - 1 + i) % 12 + 1
        out.append(("%04d-%02d" % (yy, mm),
                    sum(a for d, a in ttm if int(d[5:7]) == mm)))
    return out


class BenchIndex:
    """The benchmark's level in the display currency at a past moment, for
    the comparison line. Comparison data only: never part of a total."""

    def __init__(self, result, currency, fx):
        self.r = result
        self.cur = currency
        self.fx = fx
        daily = result.get("daily") or []        # ends with today's live stand-in
        self.dkeys = [d for d, _ in daily]
        self.dvals = [c for _, c in daily]
        self._grids = {}
        # today's bar from the bars cache can be up to BARS_TTL old: from the
        # live session's date on, the level is the live price (== "live")
        self.live = None
        day, price = result.get("priceDay"), result.get("price")
        if day and price is not None and self.dkeys and self.dkeys[-1] == day:
            f = fx.factor(currency)
            self.live = None if f is None else rnd(price * f, 4)

    def on_date(self, date_str):
        """Close of the last daily bar dated <= date_str x that day's rate;
        None before the first bar."""
        i = bisect.bisect_right(self.dkeys, date_str)
        if not i:
            return None
        if i == len(self.dkeys) and self.live is not None:
            return self.live
        f = self.fx.factor_at(self.cur, date_str, "daily")
        return None if f is None else rnd(self.dvals[i - 1] * f, 4)

    def on_dates(self, dates):
        """[on_date(d) for d in dates] for sorted dates, in one walk."""
        keys, n, i, out = self.dkeys, len(self.dkeys), 0, []
        home = split_currency(self.cur)[0] == self.fx.display
        mult = split_currency(self.cur)[1]
        for d in dates:
            while i < n and keys[i] <= d:
                i += 1
            if not i:
                out.append(None)
            elif i == n and self.live is not None:
                out.append(self.live)
            else:
                f = mult if home else self.fx.factor_at(self.cur, d, "daily")
                out.append(None if f is None else rnd(self.dvals[i - 1] * f, 4))
        return out

    def buy_level(self, t):
        """The level a purchase at epoch t buys at: the close of its ET day,
        or of the next trading day (a weekend buy counts from Monday, like
        the day rows); None before the first bar."""
        d = et_date(t)
        i = bisect.bisect_left(self.dkeys, d)
        return self.on_date(self.dkeys[i] if i < len(self.dkeys) else d) \
            if self.dkeys and d >= self.dkeys[0] else None

    def at(self, t, kind):
        """At epoch t: "daily" -> on_date(t's ET date); "intraday" / "hourly"
        -> close of the last bar stamped <= t (bisect_right, like
        FX.factor_at) x the rate then. Before the first bar: the previous
        close for intraday, that day's close for hourly (a 1M point can
        predate the month of hourly bars); no bars of that kind at all
        (a stale benchmark): that day's close."""
        if kind == "daily":
            return self.on_date(et_date(t))
        if kind not in self._grids:
            pts = sorted(self.r.get(kind) or [])
            self._grids[kind] = ([k for k, _ in pts], [v for _, v in pts])
        keys, vals = self._grids[kind]
        i = bisect.bisect_right(keys, t)
        if kind == "hourly" and keys and i == len(keys) and self.live is not None:
            return self.live           # past the cached hourly bars: live price
        if i:
            c = vals[i - 1]
        elif keys and kind == "intraday":
            c = self.r.get("prevClose") or vals[0]
        else:
            day = self.on_date(et_date(t))
            if day is not None or not keys:
                return day
            c = self.r.get("prevClose") or vals[0]
        f = self.fx.factor_at(self.cur, t, kind)
        return None if f is None or c is None else rnd(c * f, 4)


def reconstruct_daily_totals(results, fx, positions, currencies, cash_total):
    """Portfolio value at each past day's close: the shares held THAT day x
    that day's closes and exchange rates. Days before anything was held are
    left out. A holding held before its first close (recent IPO, renamed or
    thinly covered listing) counts as cash worth its first close x the
    shares held, at that day's rate — no gap, and no jump when its prices
    begin. Returns [(epoch, value)] sorted."""
    # dict lookups: the old per-date linear scans were ~7M steps at 110 tickers
    closes = {tk: dict(results.get(tk, {}).get("daily", [])) for tk in positions}
    rates = {}

    def rate(cur, date_str):         # 16k days x 40 holdings on a "max" history
        key = (cur, date_str)
        if key not in rates:
            rates[key] = fx.factor_at(cur, date_str, "daily") or 0.0
        return rates[key]

    first_value = {}                 # per share, display currency, at its first close
    for tk in positions:
        if closes[tk]:
            d0 = min(closes[tk])
            first_value[tk] = closes[tk][d0] * rate(currencies[tk], d0)
    all_dates = set()
    for c in closes.values():
        all_dates.update(c)
    totals = []
    last_close = {}
    for date_str in sorted(all_dates):
        total = cash_total
        held_any = False
        for tk, pos in positions.items():
            close = closes[tk].get(date_str)
            if close is None:
                close = last_close.get(tk)
            else:
                last_close[tk] = close
            shares = held_on(pos, date_str)
            if not shares:
                continue
            held_any = True
            if close is None:
                total += first_value.get(tk, 0.0) * shares
                continue
            total += close * shares * rate(currencies[tk], date_str)
        if held_any:
            totals.append((date_to_close_epoch(date_str), round(total, 2)))
    return totals


def _backtest_dates(results, positions, start_date, end_date):
    """Every date any holding has a daily bar, start_date..end_date, sorted."""
    return sorted({d for tk in positions
                   for d, _ in (results.get(tk, {}).get("daily") or [])
                   if start_date <= d <= end_date})


def _backtest_prices(results, fx, positions, currencies, dates):
    """{ticker: [price per share in the display currency on each date]}: the
    close of the last bar at or before the date x that day's rate; before
    the first bar, the first close x the rate that first day (the same
    "cash until its first price" rule as reconstruct_daily_totals). A
    holding with no bars, or no rate, counts 0. `dates` sorted."""
    rates = {}                                   # currency -> rate per date
    out = {}
    for tk in positions:
        pts = sorted(dict(results.get(tk, {}).get("daily") or []).items())
        cur = currencies.get(tk)
        if not pts:
            out[tk] = [0.0] * len(dates)
            continue
        if cur not in rates:
            rates[cur] = [fx.factor_at(cur, d, "daily") or 0.0 for d in dates]
        rate = rates[cur]
        keys = [d for d, _ in pts]
        first = pts[0][1] * (fx.factor_at(cur, keys[0], "daily") or 0.0)
        i = bisect.bisect_right(keys, dates[0]) if dates else 0
        row = []
        for j, d in enumerate(dates):
            while i < len(keys) and keys[i] <= d:
                i += 1
            row.append(pts[i - 1][1] * rate[j] if i else first)
        out[tk] = row
    return out


def _backtest_values(mode, dates, prices, positions, cash_total, weights=None):
    """backtest_series() on prices from _backtest_prices()."""
    if not dates:
        return []
    shares = {tk: sum(l["shares"] for l in pos["lots"])
              for tk, pos in positions.items()}
    if mode == "held":
        return [(d, cash_total + sum(shares[tk] * prices[tk][j] for tk in positions))
                for j, d in enumerate(dates)]
    if mode != "weighted":
        raise ValueError("mode must be 'held' or 'weighted'")
    if weights is None:
        vals = {tk: shares[tk] * prices[tk][-1] for tk in positions}
        total = sum(vals.values()) + cash_total
        weights = {tk: (v / total if total else 0.0) for tk, v in vals.items()}
        weights["_cash"] = cash_total / total if total else 0.0
    w_cash = weights.get("_cash") or 0.0
    w = [(prices[tk], weights.get(tk) or 0.0) for tk in positions]
    ref = [p[0] for p, _ in w]
    base = 1.0
    out = [(dates[0], 1.0)]
    for j in range(1, len(dates)):
        level = base * (w_cash + sum(
            wt * (p[j] / r if r > 0 else 1.0) for (p, wt), r in zip(w, ref)))
        out.append((dates[j], level))
        if dates[j][:7] != dates[j - 1][:7]:       # first day of a new month
            base = level
            ref = [p[j] for p, _ in w]
    return out


def backtest_series(results, fx, positions, currencies, cash_total, mode,
                    start_date, end_date, weights=None):
    """What TODAY's holdings would have been worth on every date any of them
    has a daily bar, start_date <= date <= end_date: [(date, raw value)].
    mode "held": cash + today's shares x that day's prices (display
    currency). mode "weighted": an index starting at 1 that holds `weights`
    ({ticker: w, "_cash": w}, default today's value shares) and is
    rebalanced to them after the close of the first trading day of each
    month. The caller scales either with one factor; this series never goes
    near the recorded history or level_adjust()."""
    dates = _backtest_dates(results, positions, start_date, end_date)
    prices = _backtest_prices(results, fx, positions, currencies, dates)
    return _backtest_values(mode, dates, prices, positions, cash_total, weights)


def years_back(today, n):
    """today (a date) minus n calendar years, as YYYY-MM-DD (Feb 29 -> 28)."""
    try:
        back = today.replace(year=today.year - n)
    except ValueError:
        back = today.replace(year=today.year - n, day=28)
    return back.strftime("%Y-%m-%d")


def backtest_cover_start(results, positions, values):
    """(cover start, {ticker: first bar date}, held value): cover start = the
    first date by which holdings worth >= BACKTEST_COVER of today's value
    have a price; None when the held value is 0 or there are no bars."""
    firsts = {}
    for tk in positions:
        daily = results.get(tk, {}).get("daily") or []
        if daily:
            firsts[tk] = min(d for d, _ in daily)
    held_total = sum(values.get(tk) or 0.0 for tk in positions)
    start = None
    if held_total > 0:
        acc = 0.0
        for tk in sorted(firsts, key=lambda t: (firsts[t], t)):
            acc += values.get(tk) or 0.0
            if acc >= BACKTEST_COVER * held_total:
                start = firsts[tk]
                break
    return start, firsts, held_total


def build_backtest(daily_table, results, fx, positions, currencies, cash_total,
                   values, years, covered, bench=None, today=None, cover=None,
                   priced=None):
    """data.json "backtest": today's holdings priced back before the first
    day of the day table (the anchor, "you bought here"), per range tab.
    `values` = {ticker: today's value}. None when there is no day table.
    Reads only bars + today's shares; the real series are untouched.
    `cover` = backtest_cover_start()'s result; `priced` = (dates, prices)
    from _backtest_prices() over dates reaching from the cover start to the
    anchor or later (shared with backtest_risk), else computed here."""
    if not daily_table:
        return None
    a = daily_table[0]
    anchor = {"t": a[1], "d": a[0], "v": a[2]}
    start, firsts, held_total = cover or backtest_cover_start(results, positions,
                                                              values)
    cover = None
    if start and start < anchor["d"]:
        cover = rnd(sum(values.get(tk) or 0.0 for tk, f in firsts.items()
                        if f <= start) / held_total * 100, 1)
    else:
        start = None

    k, sims = None, {}
    if start:
        total = held_total + cash_total
        weights = {tk: (values.get(tk) or 0.0) / total if total > 0 else 0.0
                   for tk in positions}
        weights["_cash"] = cash_total / total if total > 0 else 0.0
        k = {}
        if priced:          # a price depends only on its own date: slice
            i0 = bisect.bisect_left(priced[0], start)
            i1 = bisect.bisect_right(priced[0], anchor["d"])
            dates = priced[0][i0:i1]
            prices = {tk: row[i0:i1] for tk, row in priced[1].items()}
        else:
            dates = _backtest_dates(results, positions, start, anchor["d"])
            prices = _backtest_prices(results, fx, positions, currencies, dates)
        for mode in ("held", "weighted"):
            ser = _backtest_values(mode, dates, prices, positions, cash_total,
                                   weights if mode == "weighted" else None)
            raw = ser[-1][1] if ser else None        # last date <= anchor
            ok = raw and raw > 0 and (mode == "held" or total > 0)
            k[mode] = float("%.10g" % (anchor["v"] / raw)) if ok else None
            sims[mode] = ser

    first_avail = start or anchor["d"]
    today = today or datetime.now(MARKET_TZ).date()
    tabs, series = [], {}
    for key in BACKTEST_TABS.get(years, BACKTEST_TABS[5]):
        if key == "MAX":
            sd, short = first_avail, False
        else:
            back = years_back(today, int(key[:-1]))
            sd = max(back, first_avail)
            short = back < shift_date(first_avail, -LATE_START_DAYS)
        tabs.append({"key": key, "start": date_to_close_epoch(sd), "short": short})
        if not start or sd >= anchor["d"]:
            continue
        held = sims["held"]
        pick = [j for j, (d, _) in enumerate(held) if sd <= d < anchor["d"]]
        if len(pick) > BACKTEST_POINTS:
            pick = [pick[i * len(pick) // BACKTEST_POINTS]
                    for i in range(BACKTEST_POINTS)]
        s = {"t": [], "held": [], "weighted": [], "idx": []}
        for j in pick:
            d = held[j][0]
            s["t"].append(date_to_close_epoch(d))
            for mode in ("held", "weighted"):
                s[mode].append(rnd(sims[mode][j][1] * k[mode], 2)
                               if k[mode] is not None else None)
            s["idx"].append(bench.on_date(d) if bench else None)
        s["t"].append(anchor["t"])
        s["held"].append(anchor["v"])
        s["weighted"].append(anchor["v"])
        s["idx"].append(bench.on_date(anchor["d"]) if bench else None)
        series[key] = s

    late = []
    if start:
        late = sorted(({"ticker": tk, "first": f} for tk, f in firsts.items()
                       if tk in covered and f > shift_date(start, LATE_START_DAYS)),
                      key=lambda x: (x["first"], x["ticker"]))
    return {"anchor": anchor, "start": start, "coverPct": cover,
            "rebalance": "monthly", "k": k, "tabs": tabs, "series": series,
            "lateStarts": late}


def late_starts(results, positions, all_start_date, covered):
    """[{"ticker", "first"}]: holdings whose first daily close comes more
    than LATE_START_DAYS after the ALL graph's first day while they were
    already held (so reconstruct_daily_totals counts them as cash until
    then). Only holdings whose long history is loaded (`covered`) — before
    that, every first close is just the start of the one-year window."""
    out = []
    for tk, pos in positions.items():
        daily = results.get(tk, {}).get("daily") or []
        if tk not in covered or not daily:
            continue
        first = daily[0][0]
        if (datetime.strptime(first, "%Y-%m-%d").date()
                - datetime.strptime(all_start_date, "%Y-%m-%d").date()).days \
                <= LATE_START_DAYS:
            continue
        if any(not l["date"] or l["date"] < first for l in pos["lots"]):
            out.append({"ticker": tk, "first": first})
    return sorted(out, key=lambda x: (x["first"], x["ticker"]))


def reconstruct_grid_total(results, positions, currencies, fx, cash_total, key):
    """Portfolio value on an epoch grid ('intraday' or 'hourly'), counting the
    shares held on each bar's day (see held_on)."""
    grids = {}
    for tk in positions:
        for t, c in results.get(tk, {}).get(key, []):
            grids.setdefault(t, {})[tk] = c

    points = []
    last_close = {}
    for t in sorted(grids.keys()):
        day = et_date(t)
        total = cash_total
        complete = True
        held_any = False
        for tk, pos in positions.items():
            c = grids[t].get(tk, last_close.get(tk))
            if c is None:
                # fall back to prev close so early bars aren't missing tickers
                c = results.get(tk, {}).get("prevClose")
            if c is not None:
                last_close[tk] = grids[t].get(tk, last_close.get(tk, c))
            shares = held_on(pos, day)
            if not shares:
                continue
            held_any = True
            if c is None:
                complete = False
                continue
            total += c * shares * (fx.factor_at(currencies[tk], t, key) or 0.0)
        if held_any and (complete or len(points) > 0):
            points.append((t, round(total, 2)))
    return points


def level_adjust(recon, snaps, bar=0, now=None):
    """Shift rebuilt values so they meet the RECORDED ones on both sides of a
    gap. The two can sit at different levels — a holding entered later with an
    earlier purchase date, a position since sold, after-hours prices — and a
    graph that alternates between them zigzags. Inside the recorded era the
    record sets the level and the rebuilt prices only supply the shape; before
    the first snapshot the rebuilt values stand as they are.
    `bar`: the points' bar length. Bars are stamped at their START but their
    close is the price at their END (the bar in progress: `now`), so each
    point is compared and weighted at that moment. Comparing at the start
    put the next 5-10 minutes' move into a snapshot's offset, and spread
    over a sleep gap that drew a dashed spike and dip that never happened."""
    if not recon or not snaps:
        return recon
    rt = [t + bar if now is None else min(t + bar, now) for t, _ in recon]
    rv = [v for _, v in recon]

    def recon_at(t):
        i = bisect.bisect_left(rt, t)
        if i <= 0:
            return rv[0]
        if i >= len(rt):
            return rv[-1]
        span = rt[i] - rt[i - 1]
        f = (t - rt[i - 1]) / span if span > 0 else 0.0
        return rv[i - 1] + (rv[i] - rv[i - 1]) * f

    st = [sn[0] for sn in snaps]
    offsets = {}

    def offset(j):
        if j not in offsets:
            offsets[j] = snaps[j][1] - recon_at(st[j])
        return offsets[j]

    out = []
    for (t, v), te in zip(recon, rt):
        j = bisect.bisect_right(st, te)         # recorded points at or before it
        if j == 0:
            out.append((t, v))                  # before the record begins
        elif j >= len(st):
            out.append((t, round(v + offset(len(st) - 1), 2)))
        else:
            span = st[j] - st[j - 1]
            f = (te - st[j - 1]) / span if span > 0 else 0.0
            out.append((t, round(v + offset(j - 1) * (1 - f) + offset(j) * f, 2)))
    return out


def basis_steps(events, cash_total):
    """[[epoch, money at work]]: cost basis of the lots held from each
    purchase date on, plus cash (undated lots count from the start). The
    widget subtracts this from the value history for the P&L graph, and uses
    its jumps to tell a deposit from a gain."""
    base = cash_total + sum(a for d, a in events if not d)
    by_date = {}
    for d, a in events:
        if d:
            by_date[d] = by_date.get(d, 0.0) + a
    steps = [[0, round(base, 2)]]
    cum = base
    for d in sorted(by_date):
        t = int(datetime.strptime(d, "%Y-%m-%d").replace(tzinfo=MARKET_TZ).timestamp())
        cum += by_date[d]
        steps.append([t, round(cum, 2)])
    return steps


def basis_at(steps, t):
    i = bisect.bisect_right([st for st, _ in steps], t)
    return steps[i - 1][1] if i else 0.0


def basis_offsets(snaps, steps):
    """f(t) -> the money at work for a REBUILT point, or None (the lots'
    basis stands). A recorded snapshot's b can differ from the lots' basis
    (a buy recorded days late, a position since sold, a cash change); the
    rebuilt points between two snapshots have their VALUES shifted to meet
    the record (level_adjust), so their basis gets the same treatment: the
    recorded neighbours' offset from basisSteps, blended the same way. Left
    at the lots' basis, every rebuilt/recorded seam read as money added and
    taken out again. Before the first snapshot nothing is shifted."""
    if not snaps or not steps:
        return lambda t: None
    st = [sn[0] for sn in snaps]
    off = [(sn[2] - basis_at(steps, sn[0])) if sn[2] is not None else 0.0
           for sn in snaps]

    def at(t):
        j = bisect.bisect_right(st, t)
        if j == 0:
            return None
        if j >= len(st):
            o = off[-1]
        else:
            span = st[j] - st[j - 1]
            f = (t - st[j - 1]) / span if span > 0 else 0.0
            o = off[j - 1] * (1 - f) + off[j] * f
        return round(basis_at(steps, t) + o, 2)
    return at


def basis_differs(steps, t, b):
    """A point's b is only worth sending when the lots' dates tell a
    different story (e.g. a buy recorded days late)."""
    return b is not None and bool(steps) and \
        abs(b - basis_at(steps, t)) > max(1.0, 0.0005 * abs(b))


def build_daily(snaps, recon_daily):
    """The day-by-day table: [[date, epoch, value, approx]], every day there
    is (data.json gets the newest DAILY_SEND). A day's value is
    the last RECORDED snapshot when the widget was still running at or after
    that day's 16:00 ET close (and always for today); otherwise that day's
    closing prices x the shares held then (approx = 1)."""
    table = {}
    for t, v in recon_daily:
        table[et_date(t)] = [et_date(t), t, v, 1]
    last = {}
    for t, v, _ in snaps:
        last[et_date(t)] = (t, v)
    today = et_date(now_epoch())
    for d, (t, v) in last.items():
        if d == today or d not in table or t >= date_to_close_epoch(d):
            table[d] = [d, t, v, 0]
    return [table[d] for d in sorted(table)]


def days_before(cache_dir, before, count):
    """`widget_command.sh days BEFORE COUNT`: up to COUNT rows of the full
    day-by-day table (.cache/daily_all.json) dated before BEFORE, oldest
    first, plus the table's first date and size. No yfinance needed."""
    table = read_json(os.path.join(cache_dir, "daily_all.json"), {})
    rows = table.get("rows") if isinstance(table, dict) else None
    rows = [r for r in rows or [] if isinstance(r, list) and len(r) >= 4]
    if not before:
        before = "9999-12-31"    # no date: the newest rows
    elif not (isinstance(before, str) and re.match(r"^\d{4}-\d{2}-\d{2}$", before)):
        before = "0000-00-00"    # a bad one: no rows (not the newest: the UI has those)
    try:
        count = max(1, min(DAILY_MAX_COUNT, int(count)))
    except (TypeError, ValueError):
        count = DAILY_SEND
    i = bisect.bisect_left([r[0] for r in rows], before)
    return {"rows": rows[max(0, i - count):i],
            "first": rows[0][0] if rows else None, "total": len(rows)}


def common_bars(results, positions, kind):
    """Sorted bar keys at which a real share of the holdings traded. One
    futures contract or coin trading through the night would otherwise put
    hundreds of overnight bars on the shared axis and stretch every stock
    sector into flat steps."""
    counts, have = Counter(), 0
    for tk in positions:
        b = results.get(tk, {}).get(kind, [])
        if b:
            have += 1
            counts.update(k for k, _ in b)
    need = max(1, math.ceil(SECTOR_BAR_SHARE * have))
    return sorted(k for k, c in counts.items() if c >= need)


def sector_series(results, positions, currencies, fx, theme_of, order, kind,
                  keys, start, end, n=SECTOR_POINTS):
    """% change since `start` of each theme's CURRENT holdings — pure price
    (and currency) performance, so a purchase never reads as a gain. All
    themes share one axis of trading bars (`keys`, from common_bars): {"t":
    [...], "total": [...], "themes": [{"name", "pct": [...]}]} in `order`;
    None with fewer than 2 bars. The widget spaces the points evenly, so
    nights and weekends take no room."""
    daily = kind == "daily"
    lo = et_date(start) if daily else start
    hi = et_date(end) if daily else end
    bars = {}
    for tk in positions:
        b = sorted(results.get(tk, {}).get(kind, []))
        if b:
            bars[tk] = ([k for k, _ in b], [c for _, c in b])
    grid = [k for k in keys if lo <= k <= hi]
    if len(grid) < 2:
        return None
    if len(grid) > n:
        last = len(grid) - 1
        grid = [grid[i] for i in sorted({round(j * last / (n - 1)) for j in range(n)})]
    shares = {tk: sum(l["shares"] for l in pos["lots"]) for tk, pos in positions.items()}

    def price(tk, k):   # last bar at or before k; before its first bar, that first bar
        ks, cs = bars[tk]
        i = bisect.bisect_right(ks, k)
        return cs[i - 1] if i else cs[0]

    values = {name: [0.0] * len(grid) for name in order}
    total = [0.0] * len(grid)
    for tk in bars:
        name = theme_of.get(tk)
        if name not in values or not shares.get(tk):
            continue
        for i, k in enumerate(grid):
            v = price(tk, k) * shares[tk] * (fx.factor_at(currencies[tk], k, kind) or 0.0)
            values[name][i] += v
            total[i] += v

    def pct(vals):
        return [rnd((v / vals[0] - 1) * 100) if vals[0] else None for v in vals]

    return {"t": [date_to_close_epoch(k) if daily else k for k in grid],
            "total": pct(total),
            "themes": [{"name": name, "pct": pct(values[name])}
                       for name in order if values[name][0]]}


def compute_changes(r, price, day_pct):
    """% change over 1H (intraday bars), 1D, 1W/1M/1Y (daily closes back)."""
    def pct_back(n_days):
        dly = r.get("daily", [])
        if not dly or not price:
            return None
        ref = dly[-1 - n_days][1] if len(dly) > n_days else dly[0][1]
        return (price / ref - 1) * 100 if ref else None

    def pct_hour_ago():
        bars = r.get("intraday", [])
        if not bars or not price:
            return None
        cutoff = now_epoch() - 3600
        ref = bars[0][1]
        for t_, c_ in bars:
            if t_ <= cutoff:
                ref = c_
            else:
                break
        return (price / ref - 1) * 100 if ref else None

    return {"1H": rnd(pct_hour_ago()), "1D": rnd(day_pct),
            "1W": rnd(pct_back(5)), "1M": rnd(pct_back(21)),
            "1Y": rnd(pct_back(252))}


def portfolio_volatility(results, fx, positions, currencies, cash_total,
                         days=VOL_DAYS):
    """(volatility %, score) of the portfolio as it is held NOW — current
    shares x past closes and exchange rates — so diversification between
    holdings counts. Each day's return only uses holdings that already had a
    price the day before, so a recent IPO doesn't read as a jump in value."""
    closes = {tk: dict(results.get(tk, {}).get("daily", [])) for tk in positions}
    shares_of = {tk: sum(l["shares"] for l in pos["lots"])
                 for tk, pos in positions.items()}
    dates = set()
    for c in closes.values():
        dates.update(c)
    dates = sorted(dates)
    tail = set(dates[-(days + 2):])    # years of long history: value only the tail
    last, prev_vals, rets = {}, None, []
    for d in dates:
        vals = {}
        for tk in positions:
            c = closes[tk].get(d)
            if c is not None:
                last[tk] = c
            if d in tail and tk in last:
                vals[tk] = last[tk] * shares_of[tk] * (
                    fx.factor_at(currencies[tk], d, "daily") or 0.0)
        if d not in tail:
            continue
        if prev_vals is not None:
            both = prev_vals.keys() & vals.keys()
            a = sum(prev_vals[tk] for tk in both) + cash_total
            b = sum(vals[tk] for tk in both) + cash_total
            if a > 0 and b > 0:
                rets.append(math.log(b / a))
        prev_vals = vals
    vol = annualised_vol(rets[-days:])
    return vol, vol_score(vol)


def _has_snapshot_near(snap_times, t, gap):
    i = bisect.bisect_left(snap_times, t)
    return ((i < len(snap_times) and snap_times[i] - t <= gap)
            or (i > 0 and t - snap_times[i - 1] <= gap))


def build_series(snaps, recon_daily, recon_intraday, recon_hourly, now,
                 session_start, steps=None, all_start=None):
    """Merge stored snapshots (real) with reconstruction (approx) per range.
    Reconstruction fills any stretch with no snapshot within `gap` seconds —
    before the first snapshot AND while the Mac was asleep / the widget was
    off (those gaps used to be drawn as one straight line). 1D covers the
    latest trading session, not "since local midnight"."""
    hourly = recon_hourly or recon_daily
    ranges = {  # name: (start, end, reconstruction source, gap seconds)
        "1H": (now - 3600, now, recon_intraday, 600),
        "1D": (session_start, min(now, session_start + 86400),
               recon_intraday, 600),
        "1W": (now - 7 * 86400, now, hourly, 2700),
        "1M": (now - 30 * 86400, now, hourly, 2700),
        "1Y": (now - 365 * 86400, now, recon_daily, 43200),
        # everything: from the first day anything was held (or recorded)
        "ALL": (all_start if all_start is not None else now - 365 * 86400,
                now, recon_daily, 43200),
    }
    snap_times = [t for t, _, _ in snaps]
    rebuilt_b = basis_offsets(snaps, steps)
    out = {}
    for name, (start, end, recon_src, gap) in ranges.items():
        snap_pts = [(t, v, False, b) for t, v, b in snaps if start <= t <= end]
        recon_pts = [(t, v, True, rebuilt_b(t)) for t, v in (recon_src or [])
                     if start <= t <= end
                     and not _has_snapshot_near(snap_times, t, gap)]
        pts = downsample(sorted(recon_pts + snap_pts, key=lambda q: q[0]), start, end)
        series = []
        for t, v, approx, b in pts:
            point = {"t": t, "v": v}
            if approx:
                point["approx"] = True
            # recorded: its own b; rebuilt: its recorded neighbours' offset
            if basis_differs(steps, t, b):
                point["b"] = b
            series.append(point)
        out[name] = series
    return out


# --------------------------------------------------------------------------
# alerts
# --------------------------------------------------------------------------

# --------------------------------------------------------------------------
# performance: money-weighted (XIRR) and time-weighted returns, 52-week high
# --------------------------------------------------------------------------

def xirr(flows, guess=0.1, newton_iter=100):
    """The annual rate r (a fraction) with sum a_i / (1+r)^(t_i) = 0, t_i =
    days since the earliest flow / 365 (the spreadsheet XIRR convention).
    `flows` = [(YYYY-MM-DD, amount)] in any order; money out < 0, in > 0.
    Newton from `guess` (newton_iter=0 skips it), else bisection on
    (-0.999999, hi], hi doubled up to 1e6. None: no sign change / no root."""
    pts = [(datetime.strptime(d, "%Y-%m-%d").date(), float(a)) for d, a in flows]
    if not any(a < 0 for _, a in pts) or not any(a > 0 for _, a in pts):
        return None
    d0 = min(d for d, _ in pts)
    ts = [((d - d0).days / 365.0, a) for d, a in pts]
    t_max = max(t for t, _ in ts)

    def f(r):
        return sum(a * (1.0 + r) ** -t for t, a in ts)

    def df(r):
        return sum(-t * a * (1.0 + r) ** (-t - 1) for t, a in ts)

    r = float(guess)
    for _ in range(newton_iter):
        try:
            nxt = r - f(r) / df(r)
        except (OverflowError, ZeroDivisionError):
            break
        if not math.isfinite(nxt) or nxt <= -1:
            break
        if abs(nxt - r) < 1e-10:
            return nxt
        r = nxt

    def sign_f(r):
        # f(r) times a positive factor, so it never overflows: near -1 the
        # longest-dated flows dominate (the "right sign" of an overflow)
        lg = math.log1p(r)
        if lg < 0:
            return sum(a * math.exp((t_max - t) * lg) for t, a in ts)
        return sum(a * math.exp(-t * lg) for t, a in ts)

    lo, hi = -0.999999, 1.0
    f_lo, f_hi = sign_f(lo), sign_f(hi)
    while (f_lo > 0) == (f_hi > 0) and f_lo and f_hi and hi < 1e6:
        hi *= 2
        f_hi = sign_f(hi)
    if f_lo == 0:
        return lo
    if f_hi == 0:
        return hi
    if (f_lo > 0) == (f_hi > 0):
        return None
    for _ in range(300):
        if hi - lo < 1e-12:
            break
        mid = (lo + hi) / 2.0
        f_mid = sign_f(mid)
        if f_mid == 0:
            return mid
        if (f_mid > 0) == (f_lo > 0):
            lo, f_lo = mid, f_mid
        else:
            hi = mid
    return (lo + hi) / 2.0


def high_52w(daily, price, today_str):
    """(high52, high52Date, fromHigh52Pct): the highest daily close dated
    after today - 365 d (today's live stand-in bar included; the latest date
    on a tie) and the price's distance from it (<= 0; 0.0 at a new high,
    also when an after-hours price is above every close)."""
    start = shift_date(today_str, -365)
    best = None
    for d, c in reversed(daily or []):      # sorted by date: newest first
        if d <= start:
            break
        if c is not None and (best is None or c > best[1]):
            best = (d, c)
    if best is None or not best[1] > 0:
        return None, None, None
    pct = None
    if price is not None:
        pct = min(0.0, round((price / best[1] - 1) * 100, 2)) or 0.0
    return rnd(best[1], 4), best[0], pct


def cash_flows(positions, currencies, derived, records, divs_of, sold, fx,
               display, today_str, fx_complete):
    """The real money flows in the display currency, each at its own day's
    rate (costBasis uses today's): held dated lots and sold slices (out),
    sale proceeds and dividends received (in). `divs_of` = {ticker: clean
    divs or None}; `fx_complete(iso)` = that currency's long daily rates are
    loaded as far back as they go (an earlier date then takes the first).
    Tickers only in `sold` (fully sold) count their dividends up to each
    sale too; a needed dividend history that is None means "loading".
    Returns {problems: set of gate reasons, flows [(date, amount)], byTicker
    [(kind "buy" | "in", ticker, date, amount)] (the same money, per ticker,
    buys as positive amounts: for the time-weighted growth), dates
    (purchase dates)}."""
    problems = set()
    out = {"problems": problems, "flows": [], "byTicker": [], "dates": []}

    def rate(cur, d):
        """(rate on day d or None, "loading" | "none")"""
        iso = split_currency(cur)[0]
        if iso != display:
            first = fx.daily_first(cur)
            if first is None:
                return None, "none"
            if d < first and not fx_complete(iso):
                return None, "loading"
        return fx.factor_at(cur, d, "daily"), None

    def add_divs(tk, cur, dated, recs=()):
        """Dividends received (money in): held dated lots + sold slices."""
        divs = divs_of.get(tk)
        if divs is None:            # history not fetched (yet): not zero
            problems.add("loading")
            return
        # a fully sold currency no longer fetched: the sale's own rate
        fallback = next((rec["proceedsDisplay"] / rec["proceeds"] for rec in recs
                         if rec["displayCurrency"] == display and rec["proceeds"]
                         and rec["proceedsDisplay"] is not None), None)
        for d, a in divs:
            if d > today_str:
                continue
            sh = div_shares(dated, sold.get(tk, ()), d)
            if sh <= 0:
                continue
            r, why = rate(cur, d)
            if r is None and why == "none" and fallback is not None:
                r = fallback
            if r is None:
                problems.add("loading" if why == "loading" else "sales")
                return
            out["flows"].append((d, a * sh * r))
            out["byTicker"].append(("in", tk, d, a * sh * r))

    for tk in sorted(positions):
        cur = currencies[tk]
        now = fx.factor(cur)
        dated = {"lots": []}
        for lot in positions[tk]["lots"]:
            d = lot["date"]
            if not d:
                problems.add("undated")
                continue
            dated["lots"].append(lot)
            out["dates"].append(d)
            cost = lot["avgCost"] if lot["avgCost"] is not None \
                else derived.get((tk, d))
            if cost is None:
                problems.add("cost")
                continue
            r, _ = rate(cur, d)
            if r is None or now is None:
                problems.add("loading")
                continue
            out["flows"].append((d, -cost * lot["shares"] * r))
            out["byTicker"].append(("buy", tk, d, cost * lot["shares"] * r))
        add_divs(tk, cur, dated)

    for tk in sorted(set(sold) - set(positions)):   # fully sold: dividends only
        recs = [rec for rec in records if rec["ticker"] == tk]
        cur = next((rec["currency"] for rec in recs if rec["currency"]), None) \
            or infer_currency(tk)
        add_divs(tk, cur, {"lots": []}, recs)

    for rec in records:
        sd = rec["date"]
        if not sd or not rec["lots"]:
            problems.add("sales")
            continue
        cur = rec["currency"] or infer_currency(rec["ticker"])
        same = rec["displayCurrency"] == display
        slices = []
        for sl in rec["lots"]:
            cost = sl.get("cost")
            if cost is None and rec["basis"] is not None:
                cost = rec["basis"] * sl["shares"] / rec["shares"]
            if not sl["date"] or sl["date"] > sd or cost is None:
                slices = None
                break
            slices.append((sl["date"], sl["shares"], cost))
        if slices is None:
            problems.add("sales")
            continue
        native = sum(sh * c for _, sh, c in slices)
        placed = []
        for ld, sh, c in slices:
            r, why = rate(cur, ld)
            if r is not None:
                placed.append((ld, c * sh * r))
            elif why == "loading":
                problems.add("loading")
                placed = None
                break
            elif same and rec["basisDisplay"] is not None:
                # no rates for that currency: the recorded basis (sale-day rate)
                share = (c * sh / native) if native > 0 else \
                    sh / sum(x for _, x, _ in slices)
                placed.append((ld, rec["basisDisplay"] * share))
            else:
                problems.add("sales")
                placed = None
                break
        if placed is None:
            continue
        r_sale, why = rate(cur, sd)
        if same and rec["proceedsDisplay"] is not None:
            proceeds = rec["proceedsDisplay"]
        elif rec["proceeds"] is not None and r_sale is not None:
            proceeds = rec["proceeds"] * r_sale
        else:
            problems.add("loading" if rec["proceeds"] is not None and why == "loading"
                         else "sales")
            continue
        for ld, a in placed:
            out["flows"].append((ld, -a))
            out["dates"].append(ld)
            out["byTicker"].append(("buy", rec["ticker"], ld, a))
        out["flows"].append((sd, proceeds))
        out["byTicker"].append(("in", rec["ticker"], sd, proceeds))
    return out


def _sums_by_date(items):
    """[(date, amount)] -> (sorted dates, prefix sums) for range sums."""
    by = {}
    for d, a in items:
        by[d] = by.get(d, 0.0) + a
    keys = sorted(by)
    pre = [0.0]
    for k in keys:
        pre.append(pre[-1] + by[k])
    return keys, pre


def _range_sum(idx, lo, hi):
    """Sum of the amounts dated in (lo, hi]."""
    keys, pre = idx
    return pre[bisect.bisect_right(keys, hi)] - pre[bisect.bisect_right(keys, lo)]


def growth_index(positions, currencies, results, fx, live, sold, by_ticker,
                 today_str, bench_on=None):
    """Time-weighted growth [[date, g, benchmark level]] of the holdings
    (cash left out, like XIRR), rebuilt from the lots themselves: each
    day's value = the shares held that day (dated lots, plus the recorded
    sold slices from lot date until the sale day) x that day's close x that
    day's rate; today's = the live values. A day's return = (value +
    money in that day - purchases that day) / the day before's value
    (purchases at cost and own-day rate, from cash_flows' byTicker); the
    first day and a restart after nothing was held divide by the purchases.
    A sale dated after today (a local date ahead of New York) counts today.
    Tickers without prices (fully sold) are left out with all their money:
    returns (rows, [those tickers])."""
    priced = [tk for tk in sorted(positions)
              if tk in live and (results.get(tk) or {}).get("daily")]
    left_out = sorted({tk for _, tk, _, _ in by_ticker if tk not in priced})
    clamp = lambda d: d if d <= today_str else today_str
    moves = []
    for tk in priced:
        moves += [(l["date"], tk, l["shares"]) for l in positions[tk]["lots"] if l["date"]]
        for ld, sh, sd in sold.get(tk, ()):
            moves += [(clamp(ld), tk, sh), (clamp(sd), tk, -sh)]
    if not moves:
        return [], left_out
    moves.sort()
    mine = set(priced)
    buys = _sums_by_date([(clamp(d), a) for k, tk, d, a in by_ticker
                          if tk in mine and k == "buy"])
    ins = _sums_by_date([(clamp(d), a) for k, tk, d, a in by_ticker
                         if tk in mine and k == "in"])
    start = moves[0][0]
    closes = {tk: sorted(results[tk]["daily"]) for tk in priced}
    dates = sorted({d for tk in priced for d, _ in closes[tk] if start <= d < today_str})
    dates.append(today_str)
    shares = dict.fromkeys(priced, 0.0)
    pos_i = dict.fromkeys(priced, 0)
    last = {tk: closes[tk][0][1] for tk in priced}   # before its first close: that one
    rates = {}
    out, j, g, prev = [], 0, 1.0, None
    for d in dates:
        while j < len(moves) and moves[j][0] <= d:
            shares[moves[j][1]] += moves[j][2]
            j += 1
        if d == today_str:
            v = sum(live[tk] for tk in priced)
        else:
            v = 0.0
            for tk in priced:
                c, i = closes[tk], pos_i[tk]
                while i < len(c) and c[i][0] <= d:
                    last[tk] = c[i][1]
                    i += 1
                pos_i[tk] = i
                if shares[tk] > 1e-9:
                    key = (currencies[tk], d)
                    if key not in rates:
                        rates[key] = fx.factor_at(currencies[tk], d, "daily") \
                            or fx.factor(currencies[tk]) or 0.0
                    v += shares[tk] * last[tk] * rates[key]
        lo = prev[0] if prev else "0000-00-00"
        paid, got = _range_sum(buys, lo, d), _range_sum(ins, lo, d)
        v0 = prev[1] if prev else 0.0
        if v0 > 0:
            g = g * (v + got - paid) / v0
        elif paid > 0:
            g = g * (v + got) / paid
        else:
            prev = (d, v)            # nothing held (yet / any more): no row
            continue
        out.append([d, g, bench_on(d) if bench_on else None])
        prev = (d, v)
    return out, left_out


PERF_REASONS = ("none", "undated", "cost", "sales", "young", "loading")


def build_performance(rows, positions, currencies, derived, records, divs_of,
                      sold, fx, display, today_str, results, bench_on, covered,
                      fx_complete):
    """data.json "performance" and the growth rows behind it (None unless
    ok and the time-weighted span is 30 days or more). Gate (first match):
    none / undated / cost / sales / young (< 30 days) / loading (long
    prices, rates or dividends don't reach the flows yet)."""
    perf = {"ok": False, "reason": None, "since": None, "days": None,
            "minDays": MIN_HISTORY_DAYS, "moneyOut": None, "moneyIn": None,
            "value": None, "totalPct": None, "xirrPct": None, "twrPct": None,
            "twrAnnualPct": None, "twrDays": None, "twrSince": None,
            "twrLeftOut": [], "flows": None}
    if not rows:
        perf["reason"] = "none"
        return perf, None
    cf = cash_flows(positions, currencies, derived, records, divs_of, sold, fx,
                    display, today_str, fx_complete)
    problems = cf["problems"]
    since = min(cf["dates"]) if cf["dates"] and "undated" not in problems else None
    today = datetime.strptime(today_str, "%Y-%m-%d").date()
    if since:
        perf["since"] = since
        perf["days"] = (today - datetime.strptime(since, "%Y-%m-%d").date()).days
        if perf["days"] < MIN_HISTORY_DAYS:
            problems.add("young")
    # each holding's closes have to reach its first lot / sold slice, unless
    # its long history is in and still can't (priced from later)
    for tk in positions:
        need = [l["date"] for l in positions[tk]["lots"] if l["date"]] \
            + [ld for ld, _, _ in sold.get(tk, ())]
        daily = (results.get(tk) or {}).get("daily")
        if need and tk not in covered and (
                not daily or min(d for d, _ in daily)
                > shift_date(min(need), LATE_START_DAYS)):
            problems.add("loading")
    for why in PERF_REASONS:
        if why in problems:
            perf["reason"] = why
            return perf, None

    value = sum(p["value"] for p in rows)
    money_out = -sum(a for _, a in cf["flows"] if a < 0)
    money_in = sum(a for _, a in cf["flows"] if a > 0)
    rate = xirr(cf["flows"] + [(today_str, value)])
    growth, left_out = growth_index(
        positions, currencies, results, fx, {p["ticker"]: p["value"] for p in rows},
        sold, cf["byTicker"], today_str, bench_on)
    twr = twr_ann = twr_days = None
    if len(growth) >= 2:
        g = growth[-1][1]
        twr_days = (datetime.strptime(growth[-1][0], "%Y-%m-%d")
                    - datetime.strptime(growth[0][0], "%Y-%m-%d")).days
        twr = (g - 1) * 100
        if twr_days >= 1 and g > 0:
            twr_ann = (g ** (365.0 / twr_days) - 1) * 100
    if twr_days is None or twr_days < MIN_HISTORY_DAYS:
        # the priced holdings' own span is what counts (an old sale of a
        # fully sold holding makes `since` old, not this)
        twr = twr_ann = None
        growth = None
    perf.update({
        "ok": True, "moneyOut": rnd(money_out), "moneyIn": rnd(money_in),
        "value": rnd(value),
        "totalPct": rnd((money_in + value - money_out) / money_out * 100)
        if money_out > 0 else None,
        "xirrPct": rnd(rate * 100) if rate is not None else None,
        "twrPct": rnd(twr), "twrAnnualPct": rnd(twr_ann), "twrDays": twr_days,
        "twrSince": growth[0][0] if growth else None,
        "twrLeftOut": left_out if growth else [],
        "flows": len(cf["flows"])})
    return perf, growth


def _ymd(s):
    return datetime.fromisoformat(s[:10])


def risk_sample(dates):
    """Indices the risk figures use: weekdays, plus the first and the last."""
    n, iso = len(dates), datetime.fromisoformat
    return [i for i, d in enumerate(dates)
            if i == 0 or i == n - 1 or iso(d[:10]).weekday() < 5]


def risk_figures(points, bench_levels, bench_symbol, annual=None, sampled=False):
    """risk.real / risk.backtest (RiskFig) from [(date, level)] (sorted) and
    the benchmark levels aligned with them (or None). Sampled on weekdays +
    first + last. annualReturnPct = (last/first)^(365/days) - 1 unless
    `annual` (%) is given; vol = annualised_vol of the log returns; Sharpe =
    (annual - RISK_FREE_PCT) / vol; beta = cov / var of simple returns vs
    the benchmark (>= VOL_MIN_RETURNS pairs); drawdown from the running
    peak. None with fewer than 2 points or a span under MIN_HISTORY_DAYS.
    sampled=True: the caller already sampled (risk_sample)."""
    if sampled:
        pts, bl = points, bench_levels
    else:
        keep = risk_sample([d for d, _ in points])
        pts = [points[i] for i in keep]
        bl = [bench_levels[i] for i in keep] if bench_levels is not None else None
    if len(pts) < 2:
        return None
    days = (_ymd(pts[-1][0]) - _ymd(pts[0][0])).days
    if days < MIN_HISTORY_DAYS:
        return None
    v0, v1 = pts[0][1], pts[-1][1]
    if annual is None and v0 > 0 and v1 > 0:
        annual = ((v1 / v0) ** (365.0 / days) - 1) * 100
    vals = [v for _, v in pts]
    logs = [math.log(b / a) for a, b in zip(vals, vals[1:]) if a > 0 and b > 0]
    vol = annualised_vol(logs)
    beta = None
    if bl:
        pairs = [(b / a - 1, y / x - 1)
                 for a, b, x, y in zip(vals, vals[1:], bl, bl[1:])
                 if a > 0 and x is not None and y is not None and x > 0 and y > 0]
        rp, rb = [q for q, _ in pairs], [q for _, q in pairs]
        if len(rp) >= VOL_MIN_RETURNS:
            mp, mb = sum(rp) / len(rp), sum(rb) / len(rb)
            var = sum((q - mb) ** 2 for q in rb)
            if var > 0:
                beta = sum((p - mp) * (q - mb) for p, q in zip(rp, rb)) / var
    peak_v, peak_d = v0, pts[0][0]
    dd, dd_d, dd_pd, dd_pv = 0.0, None, None, None
    for d, v in pts:
        if v >= peak_v:
            peak_v, peak_d = v, d
        elif peak_v > 0 and v / peak_v - 1 < dd:
            dd, dd_d, dd_pd, dd_pv = v / peak_v - 1, d, peak_d, peak_v
    recovered = None
    if dd_d is not None:
        recovered = next((d for d, v in pts if d > dd_d and v >= dd_pv), None)
    return {
        "start": pts[0][0], "end": pts[-1][0], "days": days,
        "returns": len(logs),
        "annualReturnPct": rnd(annual),
        "volPct": rnd(vol),
        "sharpe": rnd((annual - RISK_FREE_PCT) / vol)
        if annual is not None and vol else None,
        "riskFreePct": RISK_FREE_PCT,
        "beta": rnd(beta),
        "betaVs": bench_symbol if bl is not None else None,
        "drawdown": {
            "currentPct": rnd((v1 / peak_v - 1) * 100) if peak_v > 0 else None,
            "peakDate": peak_d,
            "maxPct": rnd(dd * 100), "maxDate": dd_d, "maxPeakDate": dd_pd,
            "recoveredDate": recovered}}


def backtest_label(years):
    """"backtest, 10y" when within 0.1 of whole years, else "backtest, 2.3y"."""
    n = int(round(years))
    return "backtest, %dy" % n if abs(years - n) < 0.1 else "backtest, %.1fy" % years


def backtest_span(cover_start, years, today):
    """risk.backtest's first date: max(today - `years` years, cover start),
    the cover start for "max"; None without a cover start."""
    if not cover_start:
        return None
    return cover_start if years == "max" else max(years_back(today, years),
                                                  cover_start)


def backtest_price_dates(results, positions, cover_start, anchor_date, span):
    """The dates _backtest_prices() is run on once per refresh: every date
    any holding has a bar in [cover start, anchor] (build_backtest) or from
    `span` on (backtest_risk, to today's live bar). A price depends only on
    its own date, so each user slices out its own range."""
    lo = cover_start if anchor_date and cover_start < anchor_date else None
    return sorted({d for tk in positions
                   for d, _ in (results.get(tk, {}).get("daily") or [])
                   if d >= span or (lo and lo <= d <= anchor_date)})


def backtest_risk(priced, positions, cash_total, span, today,
                  bench=None, bench_symbol=None):
    """risk.backtest: RiskFig of today's share counts x each date's price
    (+ cash, mode "held") over [span, today] (span = backtest_span()).
    Prices only, from `priced` = (dates, prices) of _backtest_prices(),
    covering every bar date from span on. None without a span or enough
    history. Independent of the real history."""
    if not span or not priced or not priced[0]:
        return None
    dates, prices = priced
    i0 = bisect.bisect_left(dates, span)
    idx = [i0 + j for j in risk_sample(dates[i0:])]
    if len(idx) < 2:
        return None
    vals = [cash_total] * len(idx)
    for tk, pos in positions.items():
        n, row = sum(l["shares"] for l in pos["lots"]), prices[tk]
        vals = [v + n * row[j] for v, j in zip(vals, idx)]
    points = [(dates[j], v) for j, v in zip(idx, vals)]
    levels = bench.on_dates([d for d, _ in points]) if bench else None
    fig = risk_figures(points, levels, bench_symbol if bench else None,
                       sampled=True)
    if fig:
        span_years = (today - _ymd(span).date()).days / 365.25
        fig.update({"label": backtest_label(span_years),
                    "years": rnd(span_years, 1), "mode": "held",
                    "pricesOnly": True})
    return fig


def num_text(v):
    """400 -> "400", 12.5 -> "12.5", -20.0 -> "-20", 4e-07 -> "0.0000004"
    (rule ids, messages): exact, never in exponent form."""
    t = ("%.6f" % v).rstrip("0").rstrip(".")
    if float(t) != v:           # more than 6 decimals: all the digits repr has
        t = format(Decimal(repr(float(v))), "f")
        t = t.rstrip("0").rstrip(".") if "." in t else t
    return "0" if t == "-0" else t


def price_round(v):
    """A price for show: 2 decimals, 3 significant digits below 0.1."""
    if not v or abs(v) >= 0.1:
        return rnd(v)
    return float("%.3g" % v)


def _alert_level(v):
    """A plain finite number (not a bool / string), else None."""
    if isinstance(v, bool) or not isinstance(v, (int, float)) \
            or not math.isfinite(v):
        return None
    return v


def price_alert_rule(entry):
    """One "_alerts" entry -> (rule, None) or (None, why). rule = {"id",
    "ticker", "kind", "level"}; level stored as int when whole. Shared by
    the tracker and alerts.py."""
    if not isinstance(entry, dict):
        return None, "an alert must be an object"
    kinds = [k for k in PRICE_ALERT_KINDS if k in entry]
    if len(kinds) != 1:
        return None, "an alert needs exactly one of %s" % ", ".join(PRICE_ALERT_KINDS)
    kind = kinds[0]
    tk = entry.get("ticker")
    tk = tk.strip().upper() if isinstance(tk, str) else ""
    if kind == "drawdownPct":
        if tk != "*":
            return None, "drawdownPct is for the whole portfolio — use * as the ticker"
    elif tk == "*":
        return None, "* (the whole portfolio) only takes drawdownPct"
    elif not SYMBOL_RE.match(tk):
        return None, "that doesn't look like a ticker: %r" % entry.get("ticker")
    v = _alert_level(entry[kind])
    if v is None:
        return None, "%s needs a number" % kind
    if kind in ("above", "below") and not v > 0:
        return None, "%s needs a price above 0" % kind
    if kind == "pctFromCost" and not (v != 0 and -100 < v <= 10000):
        return None, "pctFromCost must be between -100 and 10000 (not 0)"
    if kind == "drawdownPct":
        v = abs(v)
        if not 0 < v < 100:
            return None, "drawdownPct must be between 0 and 100"
    if v == int(v) and abs(v) < 1e15:
        v = int(v)
    return {"id": "%s:%s:%s" % (tk, kind, num_text(v)), "ticker": tk,
            "kind": kind, "level": v}, None


def load_price_alerts(raw):
    """positions.json -> (rules in file order, invalid count). Duplicate ids
    collapse to one; at most MAX_ALERTS rules (the rest count as invalid)."""
    items = raw.get("_alerts") if isinstance(raw, dict) else None
    if items is None:
        return [], 0
    if not isinstance(items, list):
        return [], 1
    rules, seen, invalid = [], set(), 0
    for entry in items:
        rule, _ = price_alert_rule(entry)
        if rule is None:
            invalid += 1
        elif rule["id"] in seen:
            continue
        elif len(rules) >= MAX_ALERTS:
            invalid += 1
        else:
            seen.add(rule["id"])
            rules.append(rule)
    return rules, invalid


def check_price_alerts(rules, quotes, drawdown_pct, pstate, now,
                       drawdown_reason=None):
    """rules: from load_price_alerts. quotes: {TICKER: {"price", "plPct"
    (holdings only), "currency", "fresh"}}. drawdown_pct: risk.real.drawdown
    .currentPct (<= 0) or None (drawdown_reason says why). pstate: the
    "price" dict of alerts_state.json ({id: {"armed", "firedAt",
    "firedValue"}}). Fires once per crossing, re-arms when the value is back
    on the other side. Returns (fired, statuses, new_pstate)."""
    pstate = pstate if isinstance(pstate, dict) else {}
    fired, statuses, new_state = [], [], {}
    for rule in rules:
        rid, tk, kind, level = rule["id"], rule["ticker"], rule["kind"], rule["level"]
        old = pstate.get(rid)
        old = old if isinstance(old, dict) else None
        q = quotes.get(tk) if kind != "drawdownPct" else None
        currency = q.get("currency") if q and kind in ("above", "below") else None
        value, reason = None, None
        if kind == "drawdownPct":
            if drawdown_pct is None:
                reason = drawdown_reason or "noHistory"
            else:
                value = -drawdown_pct + 0.0
        elif not q or q.get("price") is None:
            reason = "noPrice"
        elif not q.get("fresh"):
            reason = "stale"
        elif kind == "pctFromCost":
            if q.get("plPct") is None:
                reason = "notHeld"
            elif q.get("costUnknown"):
                reason = "cost"       # cost = today's price: P&L stays 0
            else:
                value = q["plPct"]
        else:
            value = q["price"]
        st = {"id": rid, "ticker": tk, "kind": kind, "level": level,
              "currency": currency, "status": "waiting", "reason": reason,
              "value": None, "distancePct": None,
              "firedAt": old.get("firedAt") if old else None}
        if reason is not None:
            if old is not None:
                new_state[rid] = old
            statuses.append(st)
            continue
        if kind == "above":
            cond = value >= level
        elif kind == "below":
            cond = value <= level
        elif kind == "pctFromCost":
            cond = value <= level if level < 0 else value >= level
        else:
            cond = value >= level
        entry = dict(old) if old else {"armed": True, "firedAt": None,
                                       "firedValue": None}
        armed = entry.get("armed") is not False
        if cond and armed:
            entry.update(armed=False, firedAt=now, firedValue=value)
            fired.append({"id": rid, "ticker": tk, "kind": kind, "level": level,
                          "value": value, "currency": (q or {}).get("currency"),
                          "price": (q or {}).get("price")})
        elif not cond and not armed:
            entry["armed"] = True
        else:
            entry["armed"] = armed
        new_state[rid] = entry
        st.update(status="armed" if entry["armed"] else "fired",
                  value=price_round(value) if kind in ("above", "below") else value,
                  firedAt=entry.get("firedAt"))
        if kind in ("above", "below") and value:
            st["distancePct"] = rnd((level / value - 1) * 100)
        statuses.append(st)
    return fired, statuses, new_state


def price_text(v, currency):
    """401.2, "USD" -> "401.20 USD" (quote currency, pence for .L)."""
    if v and abs(v) < 0.1:      # 0.0072 -> "0.0072", not "0.01"
        t = num_text(price_round(v))
    else:
        t = "{:,.2f}".format(v)
    return t + (" " + currency if currency else "")


def price_alert_note(f, peak_date=None):
    """(title, message, log line) for one fired price alert."""
    kind, tk, level, value = f["kind"], f["ticker"], f["level"], f["value"]
    cur, pct = f.get("currency"), None
    if kind in ("above", "below"):
        title = "%s %s %s" % (tk, kind, num_text(level))
        msg = "Price %s (alert at %s)" % (price_text(value, cur), num_text(level))
    elif kind == "pctFromCost":
        pct = value
        title = "%s %s%s%% from cost" % (tk, "+" if level > 0 else "", num_text(level))
        msg = "%s%+.1f%% vs your average cost" % (
            "Price %s, " % price_text(f["price"], cur) if f.get("price") is not None
            else "", value)
    else:
        pct, cur, tk = -value, None, "PORTFOLIO"
        title = "Portfolio drawdown %s%%" % num_text(level)
        msg = "Down %.1f%% from its peak" % value
        try:
            d = datetime.strptime(peak_date, "%Y-%m-%d")
            msg += " on %s %d" % (d.strftime("%b"), d.day)
        except (TypeError, ValueError):
            pass
    line = {"t": now_epoch(), "ticker": tk, "kind": kind, "level": level,
            "value": rnd(value), "currency": cur,
            "pct": rnd(pct) if pct is not None else None, "impact": None}
    return title, msg, line


def notify(title, message):
    # tests: PORTFOLIO_NOTIFY_LOG=file collects them instead (no pop-up)
    hook = os.environ.get("PORTFOLIO_NOTIFY_LOG")
    if hook:
        try:
            with open(hook, "a") as f:
                f.write(json.dumps({"title": title, "message": message}) + "\n")
        except Exception:
            pass
        return
    if sys.platform != "darwin":
        return
    # text goes in as arguments, never spliced into the AppleScript source
    try:
        subprocess.run(
            ["osascript", "-e", "on run argv",
             "-e", "display notification (item 1 of argv) with title (item 2 of argv)",
             "-e", "end run", message, title],
            timeout=10, capture_output=True)
    except Exception:
        pass


def current_alert_statuses(path, statuses, invalid, currencies):
    """data.json priceAlerts for the _alerts in positions.json as it is NOW:
    rules removed during the fetch are left out, ones added show "new" (like
    alerts.py's patch) until the next refresh checks them."""
    raw = read_json(path, None)
    if not isinstance(raw, dict):
        return {"rules": statuses, "invalid": invalid}
    rules, invalid = load_price_alerts(raw)
    have = {st["id"]: st for st in statuses}
    out = []
    for r in rules:
        if r["id"] in have:
            out.append(have[r["id"]])
            continue
        cur = None
        if r["kind"] in ("above", "below"):
            cur = currencies.get(r["ticker"]) or infer_currency(r["ticker"])
        out.append({"id": r["id"], "ticker": r["ticker"], "kind": r["kind"],
                    "level": r["level"], "currency": cur, "status": "new",
                    "reason": None, "value": None, "distancePct": None,
                    "firedAt": None})
    return {"rules": out, "invalid": invalid}


def prune_price_state(cache_dir):
    """No price alerts left and daily moves off (run_alerts doesn't run):
    forget the removed rules' fired state, so one added again starts armed."""
    path = os.path.join(cache_dir, "alerts_state.json")
    state = read_json(path, None)
    if isinstance(state, dict) and state.get("price"):
        state["price"] = {}
        write_json(path, state)


def run_alerts(cache_dir, per_ticker_moves, portfolio_pct, threshold,
               portfolio_threshold, session_date, display="USD",
               price_rules=None, quotes=None, drawdown_pct=None, moves_on=True,
               drawdown_reason=None, drawdown_peak=None):
    """Big daily moves (moves_on) + price alerts (price_rules). Returns
    (recent log lines, price alert statuses).
    session_date = the trading session the moves belong to. Keying on the
    local calendar day re-fired the previous session's movers after midnight
    and again every weekend day (the 1D move stays up until the next open).
    State: {"date", "fired": daily moves this session, "price": {rule id:
    {"armed", "firedAt", "firedValue"}}} — "price" survives a new session."""
    state_path = os.path.join(cache_dir, "alerts_state.json")
    log_path = os.path.join(cache_dir, "alerts_log.jsonl")
    state = read_json(state_path, {})
    if not isinstance(state, dict):
        state = {}
    pstate = state.get("price") if isinstance(state.get("price"), dict) else {}
    if state.get("date") != session_date or not isinstance(state.get("fired"), list):
        state = {"date": session_date, "fired": []}
    fired = set(x for x in state["fired"] if isinstance(x, str))
    new_alerts = []

    for tk, pct, day_change_value in (per_ticker_moves if moves_on else []):
        if pct is None or abs(pct) < threshold or tk in fired:
            continue
        direction = "up" if pct >= 0 else "down"
        held = day_change_value is not None
        notify("%s: %s %s %.1f%%" % ("Portfolio" if held else "Watchlist",
                                     tk, direction, abs(pct)),
               "1D move of %+.1f%%" % pct
               + (" (%s impact)" % money_text(day_change_value, display, signed=True)
                  if held else ""))
        fired.add(tk)
        new_alerts.append({"t": now_epoch(), "ticker": tk, "pct": round(pct, 2),
                           "impact": round(day_change_value, 2) if held else None})

    if moves_on and portfolio_pct is not None \
            and abs(portfolio_pct) >= portfolio_threshold \
            and "_PORTFOLIO" not in fired:
        direction = "up" if portfolio_pct >= 0 else "down"
        notify("Portfolio %s %.1f%% today" % (direction, abs(portfolio_pct)),
               "Total value moved %+.2f%% (1D)" % portfolio_pct)
        fired.add("_PORTFOLIO")
        new_alerts.append({"t": now_epoch(), "ticker": "PORTFOLIO",
                           "pct": round(portfolio_pct, 2), "impact": None})

    statuses = []
    if price_rules:
        hits, statuses, pstate = check_price_alerts(
            price_rules, quotes or {}, drawdown_pct, pstate, now_epoch(),
            drawdown_reason)
        for f in hits:
            title, msg, line = price_alert_note(f, drawdown_peak)
            notify(title, msg)
            new_alerts.append(line)
    else:
        pstate = {}

    state["fired"] = sorted(fired)
    state["price"] = pstate
    write_json(state_path, state)
    if new_alerts:
        with open(log_path, "a") as f:
            for a in new_alerts:
                f.write(json.dumps(a) + "\n")

    recent = []
    cutoff = now_epoch() - 7 * 86400
    if os.path.exists(log_path):
        with open(log_path) as f:
            for line in f:
                try:
                    a = json.loads(line)
                    if a.get("t", 0) >= cutoff:
                        recent.append(a)
                except Exception:
                    continue
    return recent[-20:], statuses


# --------------------------------------------------------------------------
# main
# --------------------------------------------------------------------------

def market_session(now=None):
    """'pre' | 'open' | 'after' | 'closed' (US equities, ET clock). now: an
    aware datetime in any zone (naive = ET), None = the current time."""
    now = et_time(now)
    if now.weekday() >= 5:
        return "closed"
    minutes = now.hour * 60 + now.minute
    if 4 * 60 <= minutes < 9 * 60 + 30:
        return "pre"
    if 9 * 60 + 30 <= minutes < 16 * 60:
        return "open"
    if 16 * 60 <= minutes < 20 * 60:
        return "after"
    return "closed"


def et_time(now=None):
    """now (aware, any zone; naive = ET; None = the clock) on the ET clock."""
    if now is None:
        return datetime.now(MARKET_TZ)
    if now.tzinfo is None:
        return now.replace(tzinfo=MARKET_TZ)
    return now.astimezone(MARKET_TZ)


def last_close_day(now_et):
    """YYYY-MM-DD of the latest weekday whose 16:00 ET has passed at now_et
    (a weekday from 16:00 on -> that day; else the weekday before)."""
    now_et = et_time(now_et)
    day = now_et.date()
    if now_et.weekday() < 5 and now_et.hour >= 16:
        return day.isoformat()
    day -= timedelta(days=1)
    while day.weekday() >= 5:
        day -= timedelta(days=1)
    return day.isoformat()


def daily_backups(folder):
    """The -daily backup names in folder, oldest first (name order = time)."""
    return sorted(n for n in os.listdir(folder) if BACKUP_RE.match(n))


def backup_since_close(folder, day, epoch):
    """True when a -daily copy in folder is named (local time) at or after
    day's 16:00 ET close and not after epoch."""
    close = datetime.strptime(day + " 16:00", "%Y-%m-%d %H:%M") \
        .replace(tzinfo=MARKET_TZ).timestamp()
    for n in daily_backups(folder):
        try:
            t = datetime.strptime(n[17:32], "%Y%m%d-%H%M%S").timestamp()
        except ValueError:
            continue
        if close <= t <= epoch + 1:
            return True
    return False


def daily_backup(positions_path, cache_dir, now=None, keep=BACKUP_KEEP):
    """Once per US weekday (market holidays are not known, so a weekday
    holiday counts as a close day), after the close ("after" / "closed"): copy
    positions.json's bytes to positions.backup-YYYYMMDD-HHMMSS-daily.json
    next to it (local time, remove_position.py --reset-all's naming plus
    -daily), then keep only the newest `keep` -daily copies — no other file
    is ever deleted. .cache/backup_state.json remembers the day done (and a
    failed try: another one after BACKUP_RETRY s; a -daily copy already
    named after that day's close also counts as done, so an unwritable
    state file cannot cause one copy per refresh). Returns the dict that
    --daily-backup prints; never raises."""
    out = {"backup": None, "reason": "session", "session": None, "day": None,
           "removed": [], "kept": 0}
    folder = os.path.dirname(os.path.abspath(positions_path))
    state_path = os.path.join(cache_dir, "backup_state.json")
    tmp = None
    try:
        now_et = et_time(now)
        epoch = now_et.timestamp()
        out["session"] = session = market_session(now_et)
        if session in ("after", "closed"):
            out["day"] = day = last_close_day(now_et)
            state = read_json(state_path, {})
            if not isinstance(state, dict):
                state = {}
            failed_at = state.get("failedAt")
            if state.get("day") == day:
                out["reason"] = "already"
            elif state.get("failedDay") == day and \
                    isinstance(failed_at, (int, float)) and \
                    0 <= epoch - failed_at < BACKUP_RETRY:
                out["reason"] = "retry"
            elif backup_since_close(folder, day, epoch):
                out["reason"] = "already"
            elif not os.path.isfile(positions_path):
                out["reason"] = "nofile"
            else:
                with open(positions_path, "rb") as f:
                    raw = f.read()
                try:
                    valid = isinstance(json.loads(raw.decode("utf-8")), dict)
                except ValueError:          # also bad UTF-8
                    valid = False
                if not valid:
                    out["reason"] = "invalid"   # the day stays open
                else:
                    out["reason"] = "error"
                    name = "positions.backup-%s-daily.json" % \
                        now_et.astimezone().strftime("%Y%m%d-%H%M%S")
                    tmp = os.path.join(folder, name + ".tmp")
                    with open(tmp, "wb") as f:
                        f.write(raw)
                    os.replace(tmp, os.path.join(folder, name))
                    tmp = None
                    out["backup"] = name
                    names = daily_backups(folder)   # prune first: a failed
                    for old in names[:max(0, len(names) - max(1, int(keep)))]:
                        try:                         # state write below
                            os.remove(os.path.join(folder, old))  # must not
                            out["removed"].append(old)            # skip it
                        except OSError:
                            pass
                    os.makedirs(cache_dir, exist_ok=True)
                    write_json(state_path, {"day": day, "file": name,
                                            "t": int(epoch)})
                    out["reason"] = "done"
    except Exception as e:
        out["reason"] = "error"
        out["error"] = str(e)
        if tmp:
            try:
                os.remove(tmp)
            except OSError:
                pass
        if out["day"]:
            try:
                state = read_json(state_path, {})
                state = state if isinstance(state, dict) else {}
                state.update({"failedDay": out["day"], "failedAt": int(epoch)})
                os.makedirs(cache_dir, exist_ok=True)
                write_json(state_path, state)
            except Exception:
                pass
    try:
        out["kept"] = len(daily_backups(folder))
    except OSError:
        pass
    return out


def backup_now(text):
    """--now: an ISO date-time (naive = ET, "Z" = UTC) or None for the clock."""
    if not text:
        return None
    text = text.strip()
    if text.endswith(("Z", "z")):
        text = text[:-1] + "+00:00"
    return et_time(datetime.fromisoformat(text))


def write_progress(progress_file, done, total, current):
    if not progress_file:
        return
    with _progress_lock:
        try:
            write_json(progress_file, {"done": done, "total": total,
                                       "current": current})
        except Exception:
            pass


def invert_result(r):
    """A fetch_one result for "YYYXXX=X" turned into "XXXYYY=X" (1 / rate)."""
    def inv(pts):
        return [(k, 1.0 / v) for k, v in pts or [] if v]
    out = dict(r)
    out["price"] = 1.0 / r["price"] if r.get("price") else None
    out["prevClose"] = 1.0 / r["prevClose"] if r.get("prevClose") else None
    for kind in ("daily", "dailyRaw", "intraday", "hourly"):
        out[kind] = inv(r.get(kind))
    return out


def main(argv=None, yf_module=None):
    # Command-line flags override the "_settings" block in positions.json.
    ap = argparse.ArgumentParser()
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--positions", required=True)
    ap.add_argument("--currency", default=None,
                    help="display currency: any 3-letter code (EUR, GBP...) or auto")
    ap.add_argument("--cad", action="store_true", help="same as --currency CAD")
    ap.add_argument("--benchmark", default=None, metavar="SYMBOL|auto|none",
                    help="index to compare with (overrides _settings.benchmark)")
    ap.add_argument("--progress-file", default=None)
    ap.add_argument("--history-file", default=None)
    ap.add_argument("--alerts", action="store_true")
    ap.add_argument("--alert-threshold", type=float, default=None)
    ap.add_argument("--portfolio-alert-threshold", type=float, default=None)
    ap.add_argument("--fetch-history", action="store_true",
                    help="background job: download the long price history the "
                         "last refresh asked for (.cache/history.needed)")
    ap.add_argument("--days-before", default=None, metavar="YYYY-MM-DD",
                    help="print day-by-day rows dated before this day and exit")
    ap.add_argument("--days-count", default=None, metavar="N",
                    help="with --days-before: how many rows (default %d)" % DAILY_SEND)
    ap.add_argument("--daily-backup", action="store_true",
                    help="after the US close, once a day: a dated copy of the "
                         "positions file (keeps the newest %d); JSON only" % BACKUP_KEEP)
    ap.add_argument("--now", default=None, metavar="ISO-DATETIME",
                    help="with --daily-backup: pretend it is this time (tests)")
    ap.add_argument("--check-update", action="store_true",
                    help="ask GitHub for the newest release now and print it as JSON")
    args = ap.parse_args(argv)
    if args.currency is not None and args.currency.strip().lower() != "auto" \
            and not currency_code(args.currency):
        ap.error("--currency takes a 3-letter code (EUR, GBP, SEK...) or auto")
    if args.benchmark is not None and \
            args.benchmark.strip().lower() not in ("auto", "none", "off") \
            and not SYMBOL_RE.match(args.benchmark.strip().upper()):
        ap.error("--benchmark takes a Yahoo symbol (SPY, ^GSPC...), auto or none")

    cache_dir = os.path.join(os.path.dirname(os.path.abspath(args.positions)),
                             ".cache")
    if args.daily_backup:
        # standard library only, JSON only, always exit 0 (widget_command.sh)
        try:
            now = backup_now(args.now)
        except (TypeError, ValueError):
            print(json.dumps({"error": "--now takes an ISO date-time like "
                                       "2026-09-23T17:05:00-04:00"}))
            return 0
        print(json.dumps(daily_backup(args.positions, cache_dir, now)))
        return 0
    if args.days_before is not None or args.days_count is not None:
        # older rows for the days panel: standard library only, JSON only
        json.dump(json_safe(days_before(cache_dir, args.days_before,
                                        args.days_count or DAILY_SEND)),
                  sys.stdout, allow_nan=False)
        return 0
    if args.check_update:
        # "check now" in the editor: standard library only, JSON only, exit 0
        os.makedirs(cache_dir, exist_ok=True)
        print(json.dumps(check_update(cache_dir, True, force=True) or {"latest": None, "ok": False}))
        return 0

    if yf_module is None:
        try:
            import yfinance as yf_module  # noqa: N813
        except ImportError:
            print("yfinance is not installed for this Python (%s).\n"
                  "Fix: %s -m pip install yfinance   (or run install.sh)"
                  % (sys.executable, sys.executable), file=sys.stderr)
            return 2

    os.makedirs(cache_dir, exist_ok=True)
    if args.fetch_history:
        return fetch_history(cache_dir, yf_module, args.progress_file)

    history_file = args.history_file or os.path.join(cache_dir, "history.jsonl")
    meta_path = os.path.join(cache_dir, "ticker_meta.json")
    meta = read_json(meta_path, {})
    if not isinstance(meta, dict):
        meta = {}
    bars_path = os.path.join(cache_dir, "bars.json")
    bars_cache = read_json(bars_path, {})
    if not isinstance(bars_cache, dict):
        bars_cache = {}
    hist_path = os.path.join(cache_dir, "history_bars.json")
    needed_path = os.path.join(cache_dir, "history.needed")

    problem = positions_problem(args.positions)
    if problem:
        print(problem, file=sys.stderr)
        return 1
    positions, cash, invested, settings, watch = load_positions(args.positions)
    # sales recorded in positions.json (_realized): the realized summary, and
    # their sold slices for dividends received before each sale
    raw_positions = read_json(args.positions, {})
    realized_records = load_realized(raw_positions)
    # price alerts (_alerts): adding one is the opt-in, _settings.alerts
    # is only for the big daily moves
    price_rules, alerts_invalid = load_price_alerts(raw_positions)
    sold = sold_slices(realized_records)
    display = resolve_currency("CAD" if args.cad
                               else args.currency or settings["currency"])
    backtest = backtest_years(settings.get("backtestYears"))
    hist_start = daily_period_for(positions, backtest)
    bench_sym, bench_source = benchmark_symbol(
        args.benchmark if args.benchmark is not None else settings.get("benchmark"),
        display)
    alerts_on = args.alerts or settings["alerts"] is True
    alert_threshold = float(args.alert_threshold if args.alert_threshold is not None
                            else settings["alertThreshold"])
    portfolio_threshold = float(args.portfolio_alert_threshold
                                if args.portfolio_alert_threshold is not None
                                else settings["portfolioAlertThreshold"])
    tickers = sorted(positions.keys())
    had_tickers = bool(tickers)
    fx = FX(display)
    # the update check runs beside the price requests (once a day, 8 s at most)
    update_box = [None]
    update_thread = threading.Thread(
        target=lambda: update_box.__setitem__(0, check_update(cache_dir, settings.get("updates") is not False)),
        daemon=True)
    update_thread.start()

    def quote_currency(tk, r=None):
        """positions file > Yahoo (this run, else cached) > suffix guess"""
        return ((positions.get(tk) or {}).get("currency") or (r or {}).get("currency")
                or meta.get(tk, {}).get("currency") or infer_currency(tk))

    def isos_needed(curs):
        return {split_currency(c)[0] for c in curs} - {display}

    # the benchmark: one extra download unless it is held or watched anyway
    # (then that result is reused); its currency's rate is fetched like a
    # holding's, so the index can be shown in the display currency
    bench_extra = bool(bench_sym) and bench_sym not in positions and bench_sym not in watch
    # (its rate is fetched up front only when its currency is known from an
    # earlier run — a typo'd symbol must not pull an FX pair on every refresh)
    bench_curs = ([quote_currency(bench_sym)] if bench_sym and bench_sym not in positions
                  and meta.get(bench_sym, {}).get("currency") else [])
    pairs = isos_needed([quote_currency(tk) for tk in tickers] + list(cash) + bench_curs)
    total_jobs = len(tickers) + len(watch) + len(pairs) + int(bench_extra)
    done = [0]
    results, fx_results, failed = {}, {}, []
    watch_results, watch_failed = {}, []
    bench_results = {}          # {bench_sym: result} when fetched on its own

    rate_limited = [False]

    def job(symbol, want_currency=False):
        # daily bars: always one year; older ones come from history_bars.json
        last_err = None
        for _ in range(2):
            try:
                return fetch_one(symbol, yf_module, bars_cache.get(symbol),
                                 want_currency, "1y")
            except Exception as e:  # retry once (not when Yahoo says "slow down"
                last_err = e        # or had no bars at all: a delisted ticker)
                if isinstance(e, NoPriceData):
                    break
                if is_rate_limit(e):
                    rate_limited[0] = True
                    break
                time.sleep(1)
        raise last_err

    # Exchange rates: Yahoo's "XXXYYY=X" (1 XXX in YYY). Some crosses only
    # exist the other way round, so "YYYXXX=X" is tried too and turned
    # around; the one that worked is remembered and tried first next time.
    fx_symbols = meta.get("_fxSymbols") if isinstance(meta.get("_fxSymbols"), dict) else {}

    def fx_candidates(iso):
        direct, inverse = fx.symbol(iso), "%s%s=X" % (display, iso)
        return [inverse, direct] if fx_symbols.get(iso) == inverse else [direct, inverse]

    def fx_job(iso):
        last_err = None
        for sym in fx_candidates(iso):
            try:
                return sym, job(sym)
            except Exception as e:
                last_err = e
        raise last_err

    write_progress(args.progress_file, 0, total_jobs, "starting")
    with ThreadPoolExecutor(max_workers=12) as ex:
        futures = {}
        for tk in tickers:
            want = not (positions[tk]["currency"] or meta.get(tk, {}).get("currency"))
            futures[ex.submit(job, tk, want)] = ("ticker", tk)
        for tk in watch:
            futures[ex.submit(job, tk, not meta.get(tk, {}).get("currency"))] = ("watch", tk)
        for iso in pairs:
            futures[ex.submit(fx_job, iso)] = ("fx", iso)
        if bench_extra:
            futures[ex.submit(job, bench_sym, not meta.get(bench_sym, {}).get("currency"))] \
                = ("bench", bench_sym)
        for fut in as_completed(futures):
            kind, key = futures[fut]
            try:
                r = fut.result()
                if kind == "fx":
                    fx_results[key] = r          # (symbol, result)
                else:
                    {"ticker": results, "watch": watch_results,
                     "bench": bench_results}[kind][key] = r
                    m = meta.setdefault(key, {})
                    m["lastPrice"] = r["price"]
                    m["lastPriceDay"] = r.get("priceDay")
                    m["lastPrevClose"] = r["prevClose"]
                    if r.get("currency"):
                        m["currency"] = r["currency"]
            except Exception:
                if kind == "ticker":
                    failed.append(key)
                elif kind == "watch":
                    watch_failed.append(key)
            done[0] += 1
            write_progress(args.progress_file, done[0], total_jobs,
                           fx.symbol(key) if kind == "fx" else key)

    # fall back to last known prices (and bars) for failed tickers; a ticker
    # that has NEVER had a price (typo, delisted) is skipped, not fatal —
    # exiting nonzero here used to freeze the widget on stale data for good.
    # The cache holds Yahoo's raw bars, so the last price gets the same
    # stand-in bar for its session that fetch_one adds (never cached).
    def stale_daily(tk, m):
        raw = [tuple(x) for x in bars_cache.get(tk, {}).get("daily", [])]
        return raw, with_live_bar(raw, m.get("lastPriceDay"), m["lastPrice"])

    # every holding failed (Yahoo down / rate limit): the last known prices
    # are shown, and the exit code 3 tells widget_command.sh to back off
    all_failed = had_tickers and len(set(failed)) >= len(tickers)
    missing = []
    for tk in failed:
        m = meta.get(tk, {})
        if m.get("lastPrice") is not None:
            old = bars_cache.get(tk, {})
            raw, daily = stale_daily(tk, m)
            results[tk] = {"daily": daily, "dailyRaw": raw,
                           "intraday": [],
                           "hourly": [tuple(x) for x in old.get("hourly", [])],
                           "price": m["lastPrice"],
                           "prevClose": m.get("lastPrevClose"), "stale": True}
        else:
            print("no price available for %s — skipped" % tk, file=sys.stderr)
            missing.append(tk)
    tickers = [tk for tk in tickers if tk not in missing]

    # FX: Yahoo may report a currency the first-run guess missed — fetch
    # those pairs now; a pair that fails falls back to its last known rate
    currencies = {tk: quote_currency(tk, results.get(tk)) for tk in tickers}
    hold_isos = isos_needed(list(currencies.values()) + list(cash))
    # a benchmark fetched on its own: the same fallback as a holding (last
    # price + cached bars, marked stale); none at all -> "no data" in data.json
    if bench_extra and bench_sym not in bench_results:
        m = meta.get(bench_sym, {})
        if m.get("lastPrice") is not None:
            raw, daily = stale_daily(bench_sym, m)
            bench_results[bench_sym] = {
                "daily": daily, "dailyRaw": raw, "intraday": [],
                "hourly": [tuple(x) for x in bars_cache.get(bench_sym, {}).get("hourly", [])],
                "price": m["lastPrice"], "prevClose": m.get("lastPrevClose"),
                "stale": True}
    # its currency only when there is something to show (a symbol with no
    # data at all needs no rate, no kept bars and no long history; a watched
    # one that failed gets its stale price just below)
    bench_cur = None
    bench_src = bench_sym and (results.get(bench_sym) or watch_results.get(bench_sym)
                               or bench_results.get(bench_sym))
    if bench_src or (bench_sym and meta.get(bench_sym, {}).get("lastPrice") is not None):
        bench_cur = quote_currency(bench_sym, bench_src)
    needed = hold_isos | isos_needed([bench_cur] if bench_cur else [])
    for iso in sorted(needed - pairs):
        try:
            fx_results[iso] = fx_job(iso)
        except Exception:
            pass
    for iso, (sym, _) in fx_results.items():
        fx_symbols[iso] = sym
    meta["_fxSymbols"] = fx_symbols

    # watched tickers: last known price if this fetch failed, else dropped
    watch_missing = []
    for tk in watch_failed:
        m = meta.get(tk, {})
        if m.get("lastPrice") is not None:
            raw, daily = stale_daily(tk, m)
            watch_results[tk] = {"daily": daily, "dailyRaw": raw,
                                 "intraday": [], "hourly": [],
                                 "price": m["lastPrice"],
                                 "prevClose": m.get("lastPrevClose"), "stale": True}
        else:
            watch_missing.append(tk)
    watch = [tk for tk in watch if tk in watch_results]

    # keep freshly downloaded daily/hourly bars for the next runs — Yahoo's
    # own daily bars ("dailyRaw"), never fetch_one's stand-in for today, and
    # before any long history is put in front of them
    fetched = dict(results)
    fetched.update({sym: r for sym, r in fx_results.values()})
    fetched.update(watch_results)
    fetched.update(bench_results)
    fresh_bars = {sym: {"t": r["barsT"], "period": r.get("period", "1y"),
                        "daily": r["dailyRaw"], "hourly": r["hourly"]}
                  for sym, r in fetched.items()
                  if r.get("barsT") and
                  r["barsT"] != (bars_cache.get(sym) or {}).get("t")}
    fx_keep = {sym for iso in needed for sym in fx_candidates(iso)}
    bench_keep = {bench_sym} if bench_sym else set()
    keep = set(tickers) | set(watch) | fx_keep | bench_keep
    if fresh_bars or set(bars_cache) - keep:
        bars_cache = {sym: v for sym, v in bars_cache.items() if sym in keep}
        bars_cache.update(fresh_bars)
        write_json(bars_path, bars_cache)

    # Long price history (.cache/history_bars.json, written only by the
    # background job) goes in front of the one-year bars, trimmed to what
    # hist_start asks for. What it still lacks becomes the job's plan.
    long_t = round(time.time(), 3)   # ms: the job compares it with its own writes
    long_cache = read_json(hist_path, {})
    if not isinstance(long_cache, dict):
        long_cache = {}
    trim_from = ("0000-00-00" if hist_start == "max"
                 else shift_date(hist_start, -HISTORY_SLACK_DAYS))
    topup_before = shift_date(datetime.now(MARKET_TZ).strftime("%Y-%m-%d"),
                              -HISTORY_TOPUP_DAYS)
    plan, covered, stale_bars = [], set(), []

    def use_long(sym, r):
        entry = long_cache.get(sym)
        bars = entry.get("daily") if isinstance(entry, dict) else None
        checked = (entry.get("t") or 0) if isinstance(entry, dict) else 0
        recent = long_t - checked < HISTORY_RECHECK   # the job asked Yahoo lately
        status = "none"
        if isinstance(bars, list) and bars:
            before, status = long_bars_before(bars, r.get("dailyRaw") or [], trim_from)
            if before:
                r["daily"] = before + list(r.get("daily") or [])
                r["dailyRaw"] = before + list(r.get("dailyRaw") or [])
        fresh_t = r.get("barsT") or (bars_cache.get(sym) or {}).get("t") or 0
        if status == "split" and checked > fresh_t:
            # the long bars are the newer download: the one-year bars (from
            # bars.json, up to BARS_TTL old) predate the split. Refetching the
            # long ones would loop until bars.json expires; re-download the
            # one-year bars on the next refresh instead.
            if not r.get("stale"):
                stale_bars.append(sym)
        elif (status == "split" or not history_covers(entry, hist_start)
                or (not bars and not recent)):
            plan.append({"symbol": sym, "mode": "full"})
        elif bars and not recent and (status == "gap" or bars[-1][0] < topup_before):
            plan.append({"symbol": sym, "mode": "topup"})
        if status == "ok" and history_covers(entry, hist_start):
            covered.add(sym)

    for tk in tickers:
        use_long(tk, results[tk])
    # the benchmark's long history too (a held one got it just above; a
    # watched one is copied so its watch-list row keeps its one-year bars)
    bench_r = results.get(bench_sym) if bench_sym else None
    if bench_sym and bench_r is None:
        src = watch_results.get(bench_sym) or bench_results.get(bench_sym)
        if src:
            bench_r = dict(src)
            use_long(bench_sym, bench_r)
    for iso in sorted(needed):
        if iso in fx_results:
            use_long(*fx_results[iso])
    if stale_bars:
        for sym in stale_bars:
            bars_cache.pop(sym, None)
        write_json(bars_path, bars_cache)
    long_keep = sorted(set(tickers) | fx_keep | bench_keep)

    known = meta.get("_fx") if isinstance(meta.get("_fx"), dict) else {}
    known = {k: v for k, v in known.items()          # v11 stored {"rate","t"}
             if isinstance(v, (int, float)) and len(k) == 3 and k.isupper()}
    for iso in sorted(needed):
        sym, r = fx_results.get(iso, (None, None))
        if r and sym != fx.symbol(iso):
            r = invert_result(r)
        if r and r.get("price"):
            fx.add(iso, r)
            known[iso] = r["price"]
        elif known.get(iso):
            fx.now[iso] = fx.prev[iso] = known[iso]
        elif iso in hold_isos:
            print("no %s rate — %s holdings skipped" % (fx.symbol(iso), iso),
                  file=sys.stderr)
    meta["_fx"] = known
    # holdings we can't convert are skipped like missing ones
    for tk in tickers:
        if fx.factor(currencies[tk]) is None:
            missing.append(tk)
    for tk in missing:
        positions.pop(tk, None)
        results.pop(tk, None)
    tickers = [tk for tk in tickers if tk not in missing]
    failed = [tk for tk in failed if tk not in missing]
    plan = [it for it in plan if it["symbol"] not in missing]
    if had_tickers and not tickers:
        print("no prices at all%s" % (" — Yahoo is rate-limiting (Too Many Requests)"
                                      if rate_limited[0] else ""), file=sys.stderr)
        return 1

    # meta (dividends + earnings + implied moves) — cached, usually free;
    # parallel because option-chain lookups are slow on cache-miss days.
    # Held tickers also keep their past dividends (daily, own jobs in the
    # same pool so a new day's dividend and calendar calls overlap).
    meta_today = datetime.now(MARKET_TZ).date()

    def meta_job(job):
        kind, tk = job
        try:
            if kind == "feed":
                feed_fetch_job(tk)
                return
            if kind == "news":
                news_fetch_job(tk)
                return
            if kind == "divs":
                # the sold slices' dates too: their payments still count
                update_divs(tk, yf_module, meta, dividend_period(
                    {"lots": (positions[tk]["lots"] if tk in positions else []) + [
                        {"date": ld} for ld, _, _ in sold.get(tk, ())]},
                    meta_today))
            else:
                fetch_meta(tk, yf_module, meta, cache_dir,
                           (results.get(tk) or watch_results[tk]).get("price"))
        except Exception:
            meta.setdefault(tk, {})
    # fully sold tickers keep their dividends up to each sale (performance)
    sold_only = [tk for tk in sorted(sold) if tk not in positions]
    for tk in tickers + watch + sold_only:  # one entry per ticker before the jobs share them
        meta.setdefault(tk, {})
    # headlines (_settings.news only; off = news.json is never read and no
    # news request is made): held movers of more than NEWS_MOVE_PCT today,
    # biggest first. A window with the news panel (12.12) also wants the
    # NEWS_PANEL_TOP biggest movers of the day, and news.top lists them in
    # that order. A news page (13.1, display_prefs.news_plan) adds every
    # held / watched / picked ticker its windows ask for. The plan is
    # bounded (NEWS_PLAN_MAX); per refresh at most NEWS_MAX_PER_REFRESH of
    # the not-fresh ones are fetched — movers first, then never-fetched
    # (A-Z), then the oldest — NEWS_PARALLEL at a time, interleaved with the
    # meta jobs, and the first NEWS_BREAK all failing skips the rest.
    news_on = settings.get("news") is True
    news_plan = display_prefs.news_plan(settings.get("display")) if news_on else None
    news_panel = news_plan is not None       # == display_prefs.wants_news
    news_movers, news_cache, news_got, news_now = [], {}, {}, now_epoch()
    news_planned, news_dropped, news_jobs = [], 0, []
    news_feeds, feed_jobs = [], []
    news_state = {"ok": 0, "fail": 0, "skipped": 0, "broken": False, "rate": None}
    news_sem, news_state_lock = threading.Semaphore(NEWS_PARALLEL), threading.Lock()
    if news_on:
        for tk in tickers:
            r = results[tk]
            prev = r.get("prevClose") or r["price"]
            mv = rnd((r["price"] / prev - 1) * 100) if prev and not r.get("stale") else None
            if mv is not None and (news_panel or abs(mv) > NEWS_MOVE_PCT):
                news_movers.append((-abs(mv), tk))
        news_movers.sort()
        if news_panel:
            news_movers = [m for i, m in enumerate(news_movers)
                           if i < NEWS_PANEL_TOP or -m[0] > NEWS_MOVE_PCT]
        news_movers = [tk for _, tk in news_movers[:NEWS_MAX_MOVERS]]
        # the plan: movers, then holdings, watch and picks as the windows ask
        scopes = news_plan["scopes"] if news_plan else ()
        wanted = list(news_movers)
        if "holdings" in scopes or "all" in scopes:
            wanted += tickers
        if "watch" in scopes or "all" in scopes:
            wanted += watch
        if "pick" in scopes:
            wanted += news_plan["tickers"]
        for tk in wanted:               # a hand-edited file: symbols only
            if isinstance(tk, str) and SYMBOL_RE.match(tk) and tk not in news_planned:
                news_planned.append(tk)
        news_dropped = max(0, len(news_planned) - NEWS_PLAN_MAX)
        news_planned = news_planned[:NEWS_PLAN_MAX]
        # market feeds (13.3): the union the news pages ask for, each fetched
        # when its entry is older than NEWS_FEED_TTL (their own hosts: outside
        # Yahoo's budget and breaker)
        news_feeds = [f for f in (news_plan.get("feeds", ()) if news_plan else ()) if f in NEWS_FEEDS]
        # right before dispatching: the file as it is now (ticker_lookup.py
        # writes it too), then the fetch order
        news_cache = read_news_cache(cache_dir)
        stale = [tk for tk in news_planned if not news_fresh(news_cache.get(tk), news_now)]
        first = [tk for tk in news_movers if tk in stale]
        rest = [tk for tk in stale if tk not in first]
        never = sorted(tk for tk in rest if news_entry_t(news_cache.get(tk)) is None)
        oldest = sorted((tk for tk in rest if tk not in never),
                        key=lambda tk: (news_entry_t(news_cache[tk]), tk))
        news_jobs = (first + never + oldest)[:NEWS_MAX_PER_REFRESH]
        feed_jobs = [f for f in news_feeds if not news_fresh(news_cache.get("@" + f), news_now)]

    def news_fetch_job(tk):
        """one planned ticker: fetched unless the breaker tripped; the entry
        goes to news_got (merged into news.json once, after the pool)."""
        with news_sem:
            with news_state_lock:
                if news_state["broken"]:
                    news_state["skipped"] += 1
                    return
            entry, err = news_fetch_entry(tk, yf_module, news_cache.get(tk), news_now)
            with news_state_lock:
                news_got[tk] = entry
                if entry["error"]:
                    news_state["fail"] += 1
                    if news_state["ok"] == 0 and news_state["fail"] >= NEWS_BREAK:
                        news_state["broken"] = True
                    if err and ("Too Many Requests" in err or "429" in err):
                        news_state["rate"] = err
                else:
                    news_state["ok"] += 1

    def feed_fetch_job(fid):
        """one market feed (13.3): its own host, so outside Yahoo's breaker; a
        failure keeps the last headlines and counts like a ticker's"""
        prev = news_cache.get("@" + fid)
        try:
            entry = {"t": news_now, "items": fetch_feed(fid, news_now), "error": False, "feed": True}
        except Exception:
            entry = {"t": news_now, "items": news_entry_items(prev, NEWS_FEED_KEEP) if prev else [],
                     "error": True, "fails": news_entry_fails(prev) + 1, "feed": True}
        with news_state_lock:
            news_got["@" + fid] = entry

    # news jobs interleaved with the meta work (news, meta, meta, news, ...):
    # no burst of news requests at the start of a refresh
    meta_jobs = [("meta", tk) for tk in tickers + watch] + [("divs", tk) for tk in tickers + sold_only]
    jobs, mi = [], 0
    for tk in news_jobs:
        jobs.append(("news", tk))
        jobs.extend(meta_jobs[mi:mi + 2])
        mi += 2
    jobs.extend(meta_jobs[mi:])
    jobs = [("feed", f) for f in feed_jobs] + jobs      # quick, other hosts: first
    with ThreadPoolExecutor(max_workers=12) as ex:
        list(ex.map(meta_job, jobs))
    news_out = {"on": False}
    if news_on:
        if news_got:
            save_news_entries(cache_dir, news_got, news_now)
        if news_state["rate"]:
            print("news: Yahoo is rate-limiting headline requests (Too Many Requests / 429)",
                  file=sys.stderr)
        # data.json: at least NEWS_KEEP_MIN per ticker, the largest window's
        # `per` when more, cut (per_out) so at most NEWS_OUT_MAX stories go out
        keep = max(NEWS_KEEP_MIN, news_plan["per"]) if news_plan else NEWS_KEEP_MIN
        keep = min(keep, NEWS_KEEP_MAX)
        raw_items, news_t, pending, failed_tks = {}, {}, [], []
        for tk in news_planned:
            entry = news_got.get(tk, news_cache.get(tk))
            t = news_entry_t(entry)
            if t is None:
                pending.append(tk)
                continue
            if entry.get("error"):
                failed_tks.append(tk)
            items = news_entry_items(entry, keep)
            if items:
                raw_items[tk], news_t[tk] = items, int(t)
        news_feed_out = {}
        for fid in news_feeds:                       # market feeds under "@id"
            entry = news_got.get("@" + fid, news_cache.get("@" + fid))
            t = news_entry_t(entry)
            if t is None:
                pending.append("@" + fid)
                continue
            if entry.get("error"):
                failed_tks.append("@" + fid)
            items = news_entry_items(entry, NEWS_FEED_KEEP)
            if items:
                raw_items["@" + fid], news_t["@" + fid] = items, int(t)
            news_feed_out[fid] = {"name": NEWS_FEEDS[fid][0], "t": int(t)}
        per_out = 1
        for k in range(keep, 0, -1):
            if sum(min(k, len(v)) for v in raw_items.values()) <= NEWS_OUT_MAX:
                per_out = k
                break
        news_items = {tk: v[:per_out] for tk, v in raw_items.items()}
        news_out = {"on": True, "movePct": NEWS_MOVE_PCT, "items": news_items, "t": news_t}
        if news_panel:
            news_out["top"] = [tk for tk in news_movers if tk in news_items]
            news_out["keep"] = per_out
            if news_feeds:
                news_out["feeds"] = news_feed_out
            news_out["pending"] = sorted(pending)
            news_out["failed"] = sorted(failed_tks)
            if news_t:
                news_out["fetchedAt"] = max(news_t.values())
            if news_dropped:
                news_out["dropped"] = news_dropped
        print("news: fetched %d, cached %d, pending %d, failed %d, skipped %d"
              % (news_state["ok"], len(news_planned) - len(news_got) - len(pending),
                 len(pending), len(failed_tks), news_state["skipped"]), file=sys.stderr)

    cash_total = sum(amount * (fx.factor(cur) or 0.0)
                     for cur, amount in cash.items())

    # Cost of lots bought without a price: that day's close. Usually found in
    # the bars; before the long history is loaded an old date is one Yahoo
    # lookup each (cached for good), so they run in parallel. Yahoo's
    # published closes only ("dailyRaw"): derive_basis caches what it finds,
    # and fetch_one's stand-in bar for today isn't a close.
    def basis_job(key):
        tk, date_str = key
        r = results[tk]
        try:
            return key, derive_basis(tk, date_str, r.get("dailyRaw", r.get("daily", [])),
                                     cache_dir, yf_module)
        except Exception:
            return key, None
    basis_keys = sorted({(tk, l["date"]) for tk in tickers for l in positions[tk]["lots"]
                         if l["avgCost"] is None and l["date"]})
    derived = {}
    if basis_keys:
        with ThreadPoolExecutor(max_workers=6) as ex:
            derived = dict(ex.map(basis_job, basis_keys))

    # per-position math
    rows = []
    div_today = datetime.now(MARKET_TZ).strftime("%Y-%m-%d")
    div_info = {}       # ticker -> dividend details for the income summary
    exact = {}          # ticker -> (value, display money per share), unrounded
    basis_events = []   # (lot date or None, its cost in the display currency)
    for tk in tickers:
        r = results[tk]
        pos = positions[tk]
        cur = currencies[tk]
        rate_now = fx.factor(cur)
        rate_prev = fx.factor(cur, prev=True)
        shares = sum(l["shares"] for l in pos["lots"])
        price = r["price"]
        prev_close = r.get("prevClose") or price

        basis_native = 0.0
        basis_derived = False
        cost_unknown = False      # a lot's cost is today's price: P&L means nothing
        for lot in pos["lots"]:
            cost = lot["avgCost"]
            if cost is None:          # no price given: that day's close, else today's
                basis_derived = True
                cost = derived.get((tk, lot["date"])) if lot["date"] else None
                if cost is None:
                    cost = price
                    cost_unknown = True
            basis_native += cost * lot["shares"]
            basis_events.append((lot["date"], cost * lot["shares"] * rate_now))

        value = price * shares * rate_now
        exact[tk] = (value, price * rate_now)
        value_prev = prev_close * shares * rate_prev
        price_effect = (price - prev_close) * shares * rate_now
        fx_effect = prev_close * shares * (rate_now - rate_prev)
        day_change = value - value_prev
        day_pct = (price / prev_close - 1) * 100 if prev_close else None
        basis = basis_native * rate_now
        pl = value - basis
        pl_pct = (pl / basis * 100) if basis else None

        changes = compute_changes(r, price, day_pct)
        spark = [c for _, c in r.get("daily", [])][-SPARK_DAYS:]
        vol, score = volatility([c for _, c in r.get("daily", [])])
        m = meta.get(tk, {})
        # dividends: last year's payments x shares now (the old info-based
        # rate until the history has been fetched once)
        divs = clean_divs(m.get("divs"))
        if divs is not None:
            ttm = ttm_divs(divs, div_today)
            div_annual = sum(a for _, a in ttm) * shares * rate_now
            div_received = divs_received(divs, pos["lots"], div_today,
                                         sold.get(tk, ())) * rate_now
        else:
            ttm = []
            div_annual = (m.get("dividendRate") or 0) * shares * rate_now
            div_received = 0.0
        div_info[tk] = {"divs": divs, "ttm": ttm, "factor": shares * rate_now}
        high52, high52_date, from_high52 = high_52w(r.get("daily"), price, div_today)
        rows.append({
            "ticker": tk,
            "name": m.get("name"),
            "theme": (pos["theme"] or SECTOR_SHORT.get(m.get("sector"), m.get("sector"))
                      or "Other"),
            "shares": rnd(shares, 4),
            "price": price_round(price), "currency": cur, "fxRate": rnd(rate_now, 6),
            "value": rnd(value),
            "dayChangePct": rnd(day_pct),
            "changes": changes,
            "dayChangeValue": rnd(day_change),
            "priceEffect": rnd(price_effect),
            "fxEffect": rnd(fx_effect),
            "costBasis": rnd(basis),
            "basisDerived": basis_derived,
            # some lot has neither a purchase price nor a usable buy-date
            # close: its cost is today's price (pctFromCost alerts wait)
            "costUnknown": cost_unknown,
            "pl": rnd(pl), "plPct": rnd(pl_pct),
            "dividendAnnual": rnd(div_annual),
            "dividendsReceived": rnd(div_received),
            "exDividendDate": lot_date(m.get("exDividend")),
            "earningsDate": m.get("earnings"),
            "spark": [rnd(c) for c in spark],
            "volPct": rnd(vol, 1), "volScore": score,
            "stale": bool(r.get("stale")),
            # a lot without a (valid) purchase date counts as held for the
            # whole graph, i.e. backtestYears back
            "undated": any(not l["date"] for l in pos["lots"]),
            # highest daily close of the last 365 days (quote currency)
            "high52": high52, "high52Date": high52_date,
            "fromHigh52Pct": from_high52,
        })

    # watchlist rows: prices in the stock's own currency, no position math
    watch_rows = []
    for tk in watch:
        r = watch_results[tk]
        price = r["price"]
        prev_close = r.get("prevClose") or price
        day_pct = (price / prev_close - 1) * 100 if prev_close else None
        vol, score = volatility([c for _, c in r.get("daily", [])])
        m = meta.get(tk, {})
        watch_rows.append({
            "ticker": tk, "name": m.get("name"),
            "theme": SECTOR_SHORT.get(m.get("sector"), m.get("sector")) or "Other",
            "price": price_round(price), "currency": quote_currency(tk, r),
            "dayChangePct": rnd(day_pct),
            "dayChange": rnd(price - prev_close) if prev_close else None,
            "changes": compute_changes(r, price, day_pct),
            "spark": [rnd(c) for _, c in r.get("daily", [])][-SPARK_DAYS:],
            "volPct": rnd(vol, 1), "volScore": score,
            "earningsDate": m.get("earnings"),
            "stale": bool(r.get("stale")),
        })

    total_value = sum(p["value"] for p in rows) + cash_total
    total_prev = sum((p["value"] - p["dayChangeValue"]) for p in rows) + cash_total
    total_day = total_value - total_prev
    total_day_pct = (total_day / total_prev * 100) if total_prev else None
    total_basis = sum(p["costBasis"] for p in rows)
    total_pl = sum(p["pl"] for p in rows)
    # sales recorded in positions.json (_realized) and total return
    realized = realized_summary(realized_records, fx,
                                display, datetime.now(MARKET_TZ).strftime("%Y"))
    total_return = (total_pl + (realized["realized"] or 0.0)
                    + sum(p.get("dividendsReceived") or 0.0 for p in rows))
    return_base = total_basis + realized["realizedBasis"]
    for p in rows:
        p["weightPct"] = rnd(p["value"] / total_value * 100 if total_value else 0)

    # themes
    themes = {}
    for p in rows:
        t = themes.setdefault(p["theme"], {"name": p["theme"], "value": 0.0,
                                           "dayChangeValue": 0.0, "prev": 0.0,
                                           "pl": 0.0, "basis": 0.0,
                                           "volW": 0.0, "volValue": 0.0,
                                           "tickers": []})
        if p["volPct"] is not None:
            t["volW"] += p["volPct"] * p["value"]
            t["volValue"] += p["value"]
        t["value"] += p["value"]
        t["dayChangeValue"] += p["dayChangeValue"]
        t["prev"] += p["value"] - p["dayChangeValue"]
        t["pl"] += p["pl"]
        t["basis"] += p["costBasis"]
        t["tickers"].append(p["ticker"])
    theme_rows = []
    for t in sorted(themes.values(), key=lambda x: -x["value"]):
        theme_rows.append({
            "name": t["name"], "value": rnd(t["value"]),
            "weightPct": rnd(t["value"] / total_value * 100 if total_value else 0),
            "dayChangeValue": rnd(t["dayChangeValue"]),
            "dayChangePct": rnd(t["dayChangeValue"] / t["prev"] * 100
                                if t["prev"] else None),
            "pl": rnd(t["pl"]),
            "plPct": rnd(t["pl"] / t["basis"] * 100 if t["basis"] else None),
            # value-weighted average of the holdings' own volatility
            "volPct": rnd(t["volW"] / t["volValue"] if t["volValue"] else None, 1),
            "tickers": t["tickers"],
        })

    # target allocation (_settings.targets): drift + rebalance plan; with no
    # targets nothing is computed and positions / themes stay as they were
    # (rebalance.py is only imported then: the normal refresh doesn't pay for it)
    targets_out = None
    if settings["targets"] is not None:
        try:
            import rebalance
            targets_out, row_fields, theme_fields = rebalance.build_targets(
                settings["targets"],
                [{"ticker": p["ticker"], "theme": p["theme"], "shares": p["shares"],
                  "value": exact[p["ticker"]][0], "px": exact[p["ticker"]][1],
                  "price": p["price"], "currency": p["currency"]} for p in rows],
                cash_total, missing)
        except Exception as e:      # a bug there must not cost the whole refresh
            print("targets skipped: %s" % e, file=sys.stderr)
            targets_out, row_fields, theme_fields = None, {}, {}
        if targets_out is not None and targets_out.get("set"):
            for p in rows:
                p.update(row_fields.get(p["ticker"], {}))
            for t in theme_rows:
                t.update(theme_fields.get(t["name"], {}))

    # movers by dollar impact
    by_impact = sorted(rows, key=lambda p: p["dayChangeValue"])
    losers = [p for p in by_impact[:3] if p["dayChangeValue"] < 0]
    gainers = [p for p in reversed(by_impact[-3:]) if p["dayChangeValue"] > 0]
    pick = lambda p: {"ticker": p["ticker"], "dayChangeValue": p["dayChangeValue"],
                      "dayChangePct": p["dayChangePct"]}

    # concentration
    by_weight = sorted(rows, key=lambda p: -(p["weightPct"] or 0))
    top5 = [{"ticker": p["ticker"], "weightPct": p["weightPct"]}
            for p in by_weight[:5]]
    top5_pct = rnd(sum(p["weightPct"] or 0 for p in top5))

    # earnings: upcoming only, soonest first (position size breaks ties)
    today_str = datetime.now(MARKET_TZ).strftime("%Y-%m-%d")
    earnings = [{"ticker": p["ticker"], "date": p["earningsDate"],
                 "value": p["value"], "weightPct": p["weightPct"],
                 "impliedMovePct": rnd(
                     (meta.get(p["ticker"], {}) or {}).get("impliedMove"), 1)}
                for p in rows
                if p["earningsDate"] and p["earningsDate"] >= today_str]
    earnings += [{"ticker": w["ticker"], "date": w["earningsDate"],
                  "value": None, "weightPct": None, "watch": True,
                  "impliedMovePct": rnd(
                      (meta.get(w["ticker"], {}) or {}).get("impliedMove"), 1)}
                 for w in watch_rows
                 if w["earningsDate"] and w["earningsDate"] >= today_str]
    earnings.sort(key=lambda e: (e["date"], -(e["weightPct"] or 0)))

    # dividend income: next 12 months projected from last year's payments,
    # dividends already received (dated lots only); null without any income
    total_annual_div = sum(p["dividendAnnual"] or 0 for p in rows)
    total_received = sum(p["dividendsReceived"] or 0 for p in rows)
    dividends = None
    if total_annual_div or total_received:
        months = [0.0] * 12
        fallback, since, partial = [], [], False
        for p in rows:
            info = div_info[p["ticker"]]
            if info["divs"] is None:
                if p["dividendAnnual"]:
                    fallback.append(p["ticker"])
                continue
            for i, (_, amount) in enumerate(divs_months(info["ttm"], today_str)):
                months[i] += amount * info["factor"]
            if info["divs"]:
                lots = positions[p["ticker"]]["lots"]
                since += [l["date"] for l in lots if l["date"]]
                partial = partial or any(not l["date"] for l in lots)
        dividends = {
            "annual": rnd(total_annual_div),
            "yieldPct": rnd(total_annual_div / total_value * 100) if total_value else None,
            "yieldOnCostPct": rnd(total_annual_div / total_basis * 100)
                if total_basis else None,
            "received": rnd(total_received),
            "receivedSince": min(since) if since else None,
            "receivedPartial": partial,
            "months": [{"m": ym, "amount": rnd(v)}
                       for (ym, _), v in zip(divs_months([], today_str), months)],
            "payers": sum(1 for p in rows if (p["dividendAnnual"] or 0) > 0),
            "fallback": fallback,
        }

    # announced ex-dividend dates still ahead (the calendar's, not the
    # history's — the two can differ by a day), soonest first
    def last_div(tk):
        divs = clean_divs((meta.get(tk) or {}).get("divs"))
        return divs[-1][1] if divs else None
    ex_dividends = []
    for p in rows:
        ex = p["exDividendDate"]
        if ex and ex >= today_str:
            per = last_div(p["ticker"])
            ex_dividends.append({
                "ticker": p["ticker"], "date": ex, "amountPerShare": per,
                "currency": p["currency"],
                "value": rnd(per * div_info[p["ticker"]]["factor"])
                    if per is not None else None,
                "weightPct": p["weightPct"]})
    for w in watch_rows:
        ex = lot_date((meta.get(w["ticker"]) or {}).get("exDividend"))
        if ex and ex >= today_str:
            ex_dividends.append({
                "ticker": w["ticker"], "date": ex, "amountPerShare": last_div(w["ticker"]),
                "currency": w["currency"], "value": None, "weightPct": None,
                "watch": True})
    ex_dividends.sort(key=lambda e: (e["date"], -(e["weightPct"] or 0)))

    # The trading session this data belongs to = the most common date of the
    # tickers' latest 5-min bars (one futures contract trading on Sunday
    # night can't move it). Drives the 1D graph window and the alert day.
    bar_day = {tk: datetime.fromtimestamp(r["intraday"][-1][0], MARKET_TZ).date()
               for tk, r in list(results.items()) + list(watch_results.items())
               if r.get("intraday")}
    day_counts = Counter(bar_day.values())
    if day_counts:
        top = max(day_counts.values())
        session_day = max(d for d, c in day_counts.items() if c == top)
    else:
        session_day = datetime.now(MARKET_TZ).date()
    session_start = int(datetime(session_day.year, session_day.month,
                                 session_day.day, tzinfo=MARKET_TZ).timestamp())

    # history: append snapshot, then build the series per range. With a
    # ticker missing the total is incomplete, and with none there is nothing
    # to record — don't store either as history.
    steps = basis_steps(basis_events, cash_total)
    history_for_currency(history_file, display)
    if missing or not rows:
        snaps = load_snapshots(history_file)
    else:
        snaps = append_snapshot(history_file, total_value, total_basis + cash_total)
    recon_daily = reconstruct_daily_totals(results, fx, positions, currencies,
                                           cash_total)
    recon_intraday = reconstruct_grid_total(results, positions, currencies, fx,
                                            cash_total, "intraday")
    recon_hourly = reconstruct_grid_total(results, positions, currencies, fx,
                                          cash_total, "hourly")
    now = now_epoch()
    recon_daily = level_adjust(recon_daily, snaps, 0, now)   # stamped 16:00: bar ends
    recon_intraday = level_adjust(recon_intraday, snaps, 300, now)
    recon_hourly = level_adjust(recon_hourly, snaps, 3600, now)
    starts = [src[0][0] for src in (recon_daily, snaps) if src]
    all_start = min(starts) if starts else now - 365 * 86400
    history = build_series(snaps, recon_daily, recon_intraday, recon_hourly,
                           now, session_start, steps, all_start)
    daily_table = build_daily(snaps, recon_daily)
    # benchmark: its level (display currency) at every graph point and every
    # day — comparison data only, never part of a total or a snapshot
    bench_index, benchmark = None, None
    if bench_sym:
        benchmark = {"symbol": bench_sym, "source": bench_source}
        if bench_r and bench_r.get("daily") and bench_r.get("price") and bench_cur \
                and fx.factor(bench_cur) is not None:
            bench_index = BenchIndex(bench_r, bench_cur, fx)
            kinds = {"1H": "intraday", "1D": "intraday", "1W": "hourly",
                     "1M": "hourly", "1Y": "daily", "ALL": "daily"}
            benchmark.update({
                "currency": bench_cur,
                "stale": bool(bench_r.get("stale")),
                "first": bench_index.dkeys[0],
                "live": rnd(bench_r["price"] * fx.factor(bench_cur), 4),
                "idx": {name: [bench_index.at(p["t"], kinds.get(name, "daily"))
                               for p in pts]
                        for name, pts in history.items()},
                # its close on each basisSteps day (aligned; null = unknown),
                # so the widget buys the index on the purchase day itself
                # even where the graph's points skip that day
                "steps": [bench_index.buy_level(s[0]) if s[0] > 0 else None
                          for s in steps]})
        elif bench_source == "setting":     # the user's own symbol (a typo?)
            benchmark.update({"error": "no data", "idx": {}})
        else:                               # a default with no data yet: none
            benchmark = None
    # day rows: [date, epoch, value, approx, benchmark level that day or null,
    #            money at work or null]
    # [5]: the money at work that day when it differs from basisSteps (as a
    # graph point's b; null = basisSteps), so a custom span reads the same
    # flows as the range tabs
    rebuilt_b = basis_offsets(snaps, steps)
    snap_b = {t: b for t, _, b in snaps}
    for row in daily_table:
        row.append(bench_index.on_date(row[0]) if bench_index else None)
        b = rebuilt_b(row[1]) if row[3] else snap_b.get(row[1])
        row.append(b if basis_differs(steps, row[1], b) else None)
    # the whole table for `widget_command.sh days`; data.json gets the newest
    write_json(os.path.join(cache_dir, "daily_all.json"),
               json_safe({"rows": daily_table}))
    # performance: XIRR over the real money flows + time-weighted growth
    # (growth_rows [[date, g, benchmark level]], None unless performance.ok)
    # dividend histories: None = not fetched yet (performance "loading"),
    # except a held ticker Yahoo quotes no dividend rate for (a non-payer
    # whose empty history failed to load); fully sold tickers' too
    perf_divs = {tk: div_info[tk]["divs"] if div_info[tk]["divs"] is not None
                 or (meta.get(tk) or {}).get("dividendRate") else []
                 for tk in div_info}
    for tk in sold_only:
        perf_divs[tk] = clean_divs((meta.get(tk) or {}).get("divs"))
    performance, growth_rows = build_performance(
        rows, positions, currencies, derived, realized_records,
        perf_divs, sold, fx, display, today_str, results,
        bench_index.on_date if bench_index else None, covered,
        lambda iso: iso in fx_results and fx_results[iso][0] in covered)
    late = late_starts(results, positions, et_date(all_start), covered)
    # backtest: today's holdings before the first day (its own series); the
    # prices from the cover start to today are computed once and shared
    # with the backtest risk figures
    held_values = {p["ticker"]: p["value"] for p in rows}
    bt_cover = backtest_cover_start(results, positions, held_values)
    bt_span = backtest_span(bt_cover[0], backtest, _ymd(today_str).date())
    bt_priced = None
    if bt_span:
        bt_dates = backtest_price_dates(results, positions, bt_cover[0],
                                        daily_table[0][0] if daily_table else None,
                                        bt_span)
        bt_priced = (bt_dates, _backtest_prices(results, fx, positions,
                                                currencies, bt_dates))
    backtest_out = build_backtest(daily_table, results, fx, positions, currencies,
                                  cash_total, held_values,
                                  backtest, covered, bench_index, cover=bt_cover,
                                  priced=bt_priced)

    # sector graphs: the biggest MAX_SECTORS themes, the rest folded into
    # "Other"; order = by value, so a sector keeps its place across ranges
    by_value = [t["name"] for t in theme_rows]
    kept = by_value if len(by_value) <= MAX_SECTORS else by_value[:MAX_SECTORS - 1]
    theme_of = {p["ticker"]: (p["theme"] if p["theme"] in kept else "Other")
                for p in rows}
    order = kept + (["Other"] if len(kept) < len(by_value) and "Other" not in kept else [])
    bar_keys = {kind: common_bars(results, positions, kind)
                for kind in ("intraday", "hourly", "daily")}
    last_bar = bar_keys["intraday"][-1] if bar_keys["intraday"] else now
    sectors = {}
    for name, (kind, start, end) in {
            "1H": ("intraday", last_bar - 3600, last_bar),
            "1D": ("intraday", session_start, now),
            "1W": ("hourly", now - 7 * 86400, now),
            "1M": ("hourly", now - 30 * 86400, now),
            "1Y": ("daily", now - 365 * 86400, now),
            "ALL": ("daily", all_start, now)}.items():
        ser = sector_series(results, positions, currencies, fx, theme_of, order,
                            kind, bar_keys[kind], start, end)
        if ser:
            sectors[name] = ser
    # backtest tabs (3Y/5Y/...): today's holdings priced back from the tab start
    for tab in (backtest_out or {}).get("tabs") or []:
        ser = sector_series(results, positions, currencies, fx, theme_of, order,
                            "daily", bar_keys["daily"], tab["start"], now)
        if ser:
            sectors[tab["key"]] = ser

    # risk: the portfolio's own volatility vs the value-weighted average of
    # its holdings' — the gap is what diversification is buying you
    port_vol, port_score = portfolio_volatility(results, fx, positions,
                                                currencies, cash_total)
    scored = [p for p in rows if p["volPct"] is not None]
    scored_value = sum(p["value"] for p in scored)
    avg_vol = (sum(p["volPct"] * p["value"] for p in scored) / scored_value
               if scored_value else None)
    by_vol = sorted(scored, key=lambda p: -p["volPct"])
    brief = lambda p: {"ticker": p["ticker"], "volPct": p["volPct"],
                       "volScore": p["volScore"], "weightPct": p["weightPct"]}
    risk = {
        "windowDays": VOL_DAYS,
        "volPct": rnd(port_vol, 1), "volScore": port_score,
        "avgHoldingVolPct": rnd(avg_vol, 1),
        "avgHoldingScore": vol_score(avg_vol),
        # share of the portfolio in holdings scoring 7 or more
        "wildSharePct": rnd(sum(p["value"] for p in scored if p["volScore"] >= 7)
                            / total_value * 100 if total_value else 0),
        "mostVolatile": [brief(p) for p in by_vol[:3]],
        "calmest": [brief(p) for p in reversed(by_vol[-3:])],
        "unscored": sorted(p["ticker"] for p in rows if p["volPct"] is None),
        "labels": {str(k): v for k, v in VOL_LABELS.items()},
    }
    # drawdown / beta / Sharpe: "real" from the time-weighted growth (only
    # when performance is ok; its annual return is twrAnnualPct), "backtest"
    # from today's holdings priced back (labelled, shown regardless)
    beta_vs = bench_sym if bench_index else None
    risk["real"] = risk_figures(
        [(g[0], g[1]) for g in growth_rows],
        [g[2] for g in growth_rows] if bench_index else None, beta_vs,
        annual=performance["twrAnnualPct"]) if growth_rows else None
    risk["backtest"] = backtest_risk(
        bt_priced, positions, cash_total, bt_span,
        _ymd(today_str).date(), bench_index, beta_vs)

    # FX shown in the header: one entry per foreign currency held, biggest
    # exposure first
    exposure = {}
    for p in rows:
        iso = split_currency(p["currency"])[0]
        if iso != display:
            exposure[iso] = exposure.get(iso, 0.0) + p["value"]
    fx_pairs = [{"pair": iso + display, "rate": rnd(fx.now[iso], 4),
                 "changePct": rnd((fx.now[iso] / fx.prev[iso] - 1) * 100
                                  if fx.prev.get(iso) else 0)}
                for iso in sorted(exposure, key=lambda k: -exposure[k])]

    # US exchange holidays: the clock says "open" but nothing has traded
    session = market_session()
    latest_bar = max((r["intraday"][-1][0] for r in results.values()
                      if r.get("intraday")), default=None)
    if session == "open" and rows and (latest_bar is None
                                       or now_epoch() - latest_bar > 1800):
        session = "closed"

    # alerts — only for tickers whose latest bar is from this session (a
    # name that hasn't traded yet today still shows yesterday's move)
    recent_alerts, alert_statuses = [], []
    if alerts_on or price_rules:
        moves = []
        if alerts_on:
            moves = [(p["ticker"], p["dayChangePct"], p["dayChangeValue"])
                     for p in rows if bar_day.get(p["ticker"]) == session_day]
            moves += [(w["ticker"], w["dayChangePct"], None)
                      for w in watch_rows if bar_day.get(w["ticker"]) == session_day]
        # what the price alerts compare with: the unrounded price (data.json
        # shows 2 decimals: 0.0072 would read as 0.01), P&L % as data.json
        quotes = {}
        for p in rows + watch_rows:
            raw_q = (results.get(p["ticker"]) or watch_results.get(p["ticker"])
                     or {}).get("price")
            quotes.setdefault(p["ticker"].upper(), {
                "price": raw_q if isinstance(raw_q, (int, float)) else p["price"],
                "plPct": p.get("plPct"), "costUnknown": p.get("costUnknown"),
                "currency": p["currency"], "fresh": not p["stale"]})
        dd = ((risk.get("real") or {}).get("drawdown") or {})
        recent_alerts, alert_statuses = run_alerts(
            cache_dir, moves, total_day_pct if alerts_on else None,
            alert_threshold, portfolio_threshold,
            session_day.strftime("%Y-%m-%d"), display,
            price_rules=price_rules, quotes=quotes,
            drawdown_pct=dd.get("currentPct"), moves_on=alerts_on,
            drawdown_reason=None if risk.get("real")
            else performance.get("reason"),
            drawdown_peak=dd.get("peakDate"))
    else:
        prune_price_state(cache_dir)

    write_json(meta_path, meta)

    # what the background history job should fetch (widget_command.sh starts
    # it while this file exists); "t" = when history_bars.json was read, so
    # the job can skip what it fetched since
    if plan:
        write_json(needed_path, {"t": long_t, "start": hist_start,
                                 "items": plan, "keep": long_keep})
    elif os.path.exists(needed_path):
        try:
            os.remove(needed_path)
        except OSError:
            pass

    update_thread.join(UPDATE_TIMEOUT + 2)
    out = {
        "name": str(settings["title"] or "portfolio"),
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        # 13.4: the holdings are still the demo portfolio's (the welcome card
        # shows while they are), and the newest release on GitHub ({latest,
        # url, zip, checked, ok}; null until the first check, or with the
        # check switched off)
        "demo": is_demo(raw_positions, os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                                    "positions.example.json")),
        "update": update_box[0] if update_thread.is_alive() is False else None,
        "epoch": now_epoch(),
        "currency": display,
        "marketOpen": session == "open",
        "session": session,
        "fx": fx_pairs,                 # [] when everything is in `currency`
        # display-currency value of one unit of each quote currency (the
        # buy/sell helpers use it to keep _invested in the right currency)
        "fxRates": {iso: rnd(rate, 6) for iso, rate in fx.now.items()},
        "alertsOn": alerts_on,
        "cash": rnd(cash_total),
        "totals": {
            "value": rnd(total_value),
            "dayChange": rnd(total_day),
            "dayChangePct": rnd(total_day_pct),
            "priceEffect": rnd(sum(p["priceEffect"] for p in rows)),
            "fxEffect": rnd(sum(p["fxEffect"] for p in rows)),
            "costBasis": rnd(total_basis),
            "pl": rnd(total_pl),
            "plPct": rnd(total_pl / total_basis * 100 if total_basis else None),
            "annualDividends": rnd(total_annual_div),
            # dividends received so far by today's holdings (dated lots only)
            "dividendsReceived": rnd(total_received),
            "invested": rnd(invested) if invested else None,
            "plVsInvested": rnd(total_value - invested) if invested else None,
            "plVsInvestedPct": rnd((total_value - invested) / invested * 100)
                if invested else None,
            # sum of recorded sale gains (null: no sales recorded) / this year's
            "realized": realized["realized"],
            "realizedYtd": realized["realizedYtd"],
            # unrealized P&L + realized + dividends received
            "totalReturn": rnd(total_return),
            "totalReturnPct": rnd(total_return / return_base * 100)
                if return_base else None,
        },
        # recorded sales, newest first (at most 20); salesUnknown = gain not
        # countable (no purchase/sale price, or no rate for its currency)
        "sales": realized["sales"],
        "salesCount": realized["salesCount"],
        "salesUnknown": realized["salesUnknown"],
        # {ok, reason, since, days, minDays, moneyOut, moneyIn, value,
        # totalPct, xirrPct, twrPct, twrAnnualPct, twrDays, flows}: money-
        # (XIRR) and time-weighted return since the first purchase; numbers
        # null unless ok (reason none/undated/cost/sales/young/loading)
        "performance": performance,
        "positions": rows,
        "watchlist": watch_rows,
        "watchMissing": sorted(watch_missing),
        "themes": theme_rows,
        # {set, band, sumPct, total, warnings, buckets, rebalance, newMoney}
        # (rebalance.py); null when _settings.targets is absent / empty
        "targets": targets_out,
        "movers": {"up": [pick(p) for p in gainers],
                   "down": [pick(p) for p in losers]},
        "concentration": {"top": top5, "topPct": top5_pct,
                          "restPct": rnd(100 - (top5_pct or 0))},
        "risk": risk,
        "earnings": earnings,
        # {annual, yieldPct, yieldOnCostPct, received, receivedSince,
        # receivedPartial, months [{m, amount}] x 12 from this month, payers,
        # fallback}; null without dividend income
        "dividends": dividends,
        # upcoming ex-dividend dates: {ticker, date, amountPerShare, currency,
        # value, weightPct[, watch]}, soonest first
        "exDividends": ex_dividends,
        "derivedBasisCount": sum(1 for p in rows if p["basisDerived"]),
        "staleTickers": sorted(failed),
        "missingTickers": sorted(missing),
        "history": history,
        # {symbol, source, currency, stale, first, live, idx: {range: [level
        # at each history point]}} in the display currency; null when off
        "benchmark": benchmark,
        # the display choices saved in _settings, so the widget starts in them
        # (read again now: one clicked during this fetch patched the old
        # data.json, which this output replaces)
        "ui": ui_settings(args.positions, settings),
        # {anchor {t,d,v}, start, coverPct, rebalance, k {held, weighted},
        # tabs [{key, start, short}], series {tab: {t, held, weighted, idx}},
        # lateStarts}: today's holdings simulated before the first real day;
        # null when there is no day table
        "backtest": backtest_out,
        # [[date, epoch, value, approx 0/1, benchmark level or null, money at
        # work or null (= basisSteps)]], the newest DAILY_SEND days; older ones: widget_command.sh days BEFORE COUNT
        "daily": daily_table[-DAILY_SEND:],
        "dailyTotal": len(daily_table),
        "dailyFirst": daily_table[0][0] if daily_table else None,
        # holdings counted as cash until their first price, oldest first
        "lateStarts": late,
        # symbols whose long price history the background job still has to
        # fetch (0 = complete); widget_command.sh adds historyProgress
        "historyPending": sum(1 for it in plan if it["mode"] == "full"),
        "backtestYears": backtest,
        "basisSteps": steps,            # [[epoch, cost basis + cash from then on]]
        "sectors": sectors,             # per range: shared "t" + % series per theme
        "snapshotCount": len(snaps),
        "alerts": recent_alerts,
        # [{id, ticker, kind, level, currency, status armed|fired|waiting,
        # reason, value, distancePct, firedAt}] in positions.json order;
        # invalid = _alerts entries left out (bad shape / value / over 50)
        # (_alerts read again now: alerts.py may have added / removed one
        # during this fetch and patched the old data.json, which this replaces)
        "priceAlerts": current_alert_statuses(
            args.positions, alert_statuses, alerts_invalid,
            {p["ticker"]: p["currency"] for p in rows + watch_rows}),
        # headlines of today's big movers: {"on": false} when _settings.news
        # is off, else {on, movePct, items {ticker: [{title, source, time,
        # url}] newest first, <= 3; movers with headlines only}, t {ticker:
        # fetched at}}
        "news": news_out,
    }
    json.dump(json_safe(out), sys.stdout, allow_nan=False)
    if all_failed:
        # valid output with the last known prices; 3 = "use it, but back off"
        print("no fresh prices: every price request failed%s — showing the last "
              "known ones" % (" (Yahoo is rate-limiting: Too Many Requests)"
                              if rate_limited[0] else ""), file=sys.stderr)
        return 3
    return 0


if __name__ == "__main__":
    sys.exit(main())
