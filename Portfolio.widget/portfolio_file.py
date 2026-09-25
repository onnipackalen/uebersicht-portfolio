"""
portfolio_file.py — shared by add_position.py and remove_position.py.
Standard library only, so any python3 can run the buy/sell helpers.
"""

import json
import math
import os
import re
import sys
import time

from portfolio_tracker import infer_currency, split_currency

# Yahoo symbols: MSFT, BRK-B, SHOP.TO, 0700.HK, M&M.NS, BTC-USD, GC=F, ^GSPC
TICKER_RE = re.compile(r"^\^?[A-Z0-9][A-Z0-9.\-=&]{0,19}$")
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def fail(msg):
    print("error: " + msg)
    sys.exit(1)


def ticker_arg(text):
    tk = (text or "").upper().strip()
    if not TICKER_RE.match(tk):
        fail("ticker looks wrong: %r" % text)
    return tk


def positive_number(text, what):
    """A finite number > 0. Parsed from text on purpose: float() happily
    accepts "inf", "Infinity" and "nan", and a bare Infinity written into
    positions.json breaks every refresh after it. A decimal comma is fine."""
    try:
        v = float(str(text).strip().replace(",", "."))
    except ValueError:
        fail("%s must be a number, got %r" % (what, text))
    if not math.isfinite(v) or v <= 0:
        fail("%s must be a positive number, got %r" % (what, text))
    return v


def held_shares(entry):
    """Shares held for one positions.json entry (any of its three shapes)."""
    try:
        if isinstance(entry, (int, float)) and not isinstance(entry, bool):
            return float(entry)
        if isinstance(entry, dict) and "lots" in entry:
            return sum(float(l["shares"]) for l in entry["lots"])
        if isinstance(entry, dict) and "shares" in entry:
            return float(entry["shares"])
    except (TypeError, ValueError, KeyError):
        pass
    return None


_edit_lock = None      # held until this helper process exits


def hold_edit_lock(path, wait=10.0):
    """One helper at a time edits positions.json. The widget can start two at
    once (e.g. "show index" and a new index picked in the same click), and two
    read-modify-writes then lose one change. An exclusive flock on
    .cache/positions.lock, taken on the first load and released when the
    process exits. After `wait` seconds it goes ahead without the lock, so a
    hung helper can never freeze the others. The tracker only reads the file
    and never takes it."""
    global _edit_lock
    if _edit_lock is not None:
        return
    try:
        import fcntl
        d = cache_dir(path)
        os.makedirs(d, exist_ok=True)
        f = open(os.path.join(d, "positions.lock"), "a")
    except Exception:
        return
    deadline = time.time() + wait
    while True:
        try:
            fcntl.flock(f.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
            _edit_lock = f
            return
        except (IOError, OSError):
            if time.time() >= deadline:
                f.close()
                return
            time.sleep(0.02)


def load(path, create=False):
    hold_edit_lock(path)
    if not os.path.exists(path) and create:
        return {}
    try:
        with open(path) as f:
            raw = json.load(f)
    except Exception as e:
        fail("cannot read %s: %s" % (path, e))
    if not isinstance(raw, dict):
        fail("%s should contain a JSON object" % path)
    return raw


def save(path, raw):
    """Atomic write; refuses NaN/Infinity so the file always stays valid."""
    tmp = path + ".tmp"
    with open(tmp, "w") as f:
        json.dump(raw, f, indent=2, allow_nan=False)
        f.write("\n")
    with open(tmp) as f:
        json.load(f)
    os.replace(tmp, path)


def cache_dir(path):
    return os.path.join(os.path.dirname(os.path.abspath(path)), ".cache")


def request_refresh(path):
    """Ask widget_command.sh for a fresh fetch. A marker file rather than
    back-dating data.json: a fetch already running would replace that file
    with data read BEFORE this change, so the change showed up minutes late."""
    d = cache_dir(path)
    os.makedirs(d, exist_ok=True)
    with open(os.path.join(d, "refresh.request"), "w") as f:
        f.write("%d\n" % time.time())


def to_display(path, ticker, per_share, shares, rate=None):
    """per_share x shares in the widget's display currency. `rate` (display
    value of one unit of the price's currency — the + form passes the one
    its lookup found) wins; else the rates from the last refresh; else 1.0
    when the stock trades in the display currency. None if we can't tell."""
    if rate:
        return per_share * shares * rate
    try:
        with open(os.path.join(cache_dir(path), "data.json")) as f:
            data = json.load(f)
    except Exception:
        data = {}
    for p in data.get("positions") or []:
        if p.get("ticker") == ticker and p.get("fxRate"):
            return per_share * shares * p["fxRate"]
    iso, mult = split_currency(infer_currency(ticker))
    rates = data.get("fxRates") or {}
    if iso in rates:
        return per_share * shares * mult * rates[iso]
    from portfolio_tracker import load_settings, resolve_currency
    display = data.get("currency") or resolve_currency(
        load_settings(load(path, create=True))["currency"])
    return per_share * shares * mult if iso == display else None


def last_price(path, ticker):
    try:
        with open(os.path.join(cache_dir(path), "data.json")) as f:
            data = json.load(f)
    except Exception:
        return None
    for p in data.get("positions") or []:
        if p.get("ticker") == ticker:
            return p.get("price")
    return None


def load_data(path):
    """The last refresh's data.json as a dict ({} when missing or unreadable)."""
    try:
        with open(os.path.join(cache_dir(path), "data.json")) as f:
            data = json.load(f)
    except Exception:
        return {}
    return data if isinstance(data, dict) else {}


def quote_currency(path, ticker, entry=None):
    """The currency a ticker's prices are quoted in ("USD", "EUR", "GBp"...):
    the last refresh's answer, else the entry's own "currency", else a guess
    from the exchange suffix."""
    for p in load_data(path).get("positions") or []:
        if p.get("ticker") == ticker and isinstance(p.get("currency"), str):
            return p["currency"]
    if isinstance(entry, dict) and isinstance(entry.get("currency"), str) \
            and entry["currency"].strip():
        return entry["currency"].strip()
    return infer_currency(ticker)


def display_currency(path):
    """The widget's display currency (the last refresh's, else the setting)."""
    cur = load_data(path).get("currency")
    if isinstance(cur, str) and cur:
        return cur
    from portfolio_tracker import load_settings, resolve_currency
    return resolve_currency(load_settings(load(path, create=True))["currency"])


def derived_cost(path, ticker, date_str):
    """The close the tracker used as the cost of a lot bought on `date_str`
    without a price (.cache/derived_basis.json), or None."""
    if not isinstance(date_str, str) or not DATE_RE.match(date_str.strip()):
        return None
    try:
        with open(os.path.join(cache_dir(path), "derived_basis.json")) as f:
            v = json.load(f).get("%s|%s" % (ticker, date_str.strip()))
        v = float(v)
    except Exception:
        return None
    return v if math.isfinite(v) and v > 0 else None


def patch_cached(path, fn):
    """Change the last refresh's data.json in place: fn(data) edits the dict
    and returns True when it changed something. Atomic, keeping the file's
    time stamp (its age decides when prices are fetched next). Best effort:
    without a data.json, or on any error, the next refresh has it anyway."""
    target = os.path.join(cache_dir(path), "data.json")
    tmp = target + ".patch.tmp"     # not data.json.tmp: a fetch writes that one
    try:
        st = os.stat(target)
        with open(target) as f:
            data = json.load(f)
        if not isinstance(data, dict) or not fn(data):
            return False
        with open(tmp, "w") as f:
            json.dump(data, f, separators=(",", ":"), allow_nan=False)
        os.utime(tmp, (st.st_atime, st.st_mtime))
        os.replace(tmp, target)
        return True
    except Exception:
        try:
            os.remove(tmp)
        except OSError:
            pass
        return False
