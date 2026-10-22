"""
portfolio_file.py — shared by add_position.py and remove_position.py.
Standard library only, so any python3 can run the buy/sell helpers.
"""

import json
import math
import os
import re
import shutil
import sys
import time
from datetime import datetime

from portfolio_tracker import infer_currency, split_currency

# Yahoo symbols: MSFT, BRK-B, SHOP.TO, 0700.HK, M&M.NS, BTC-USD, GC=F, ^GSPC
TICKER_RE = re.compile(r"^\^?[A-Z0-9][A-Z0-9.\-=&]{0,19}$")
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")

# 13.6: a copy of positions.json before every settings write (set_setting.py
# and any other settings writer), next to it, at most one per
# SETTING_BACKUP_GAP seconds, the newest SETTING_BACKUP_KEEP kept. The
# -import, -daily and plain backups have their own names and rotation.
SETTING_BACKUP_KEEP = 10
SETTING_BACKUP_GAP = 10            # seconds
SETTING_BACKUP_RE = re.compile(r"^positions\.backup-(\d{8}-\d{6})-setting\.json$")
# 13.6: "undo last change" in ⚙ — a short stack of what each settings write
# changed (before/after per key), in .cache, never in positions.json, so the
# file's shape stays the same and a downgrade is safe
UNDO_FILE = "setting_undo.json"    # in cache_dir(path)
UNDO_KEEP = 5
UNDO_MAX_AGE = 86400
UNDO_MERGE_S = 10


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


def setting_backup(path, now=None):
    """13.6: copy positions.json to positions.backup-YYYYMMDD-HHMMSS-setting.json
    before a settings write; returns the name, or None (no file, one made
    under SETTING_BACKUP_GAP seconds ago — its age read from the stamp in
    its name, never the mtime — the name taken, or any error). Keeps the
    newest SETTING_BACKUP_KEEP. Never raises; never touches other backups."""
    try:
        now = time.time() if now is None else now
        if not os.path.exists(path):
            return None
        folder = os.path.dirname(os.path.abspath(path))
        names = sorted(n for n in os.listdir(folder) if SETTING_BACKUP_RE.match(n))
        if names:
            stamp = SETTING_BACKUP_RE.match(names[-1]).group(1)
            t = time.mktime(datetime.strptime(stamp, "%Y%m%d-%H%M%S").timetuple())
            if 0 <= now - t < SETTING_BACKUP_GAP:
                return None
        name = "positions.backup-%s-setting.json" % datetime.fromtimestamp(now).strftime("%Y%m%d-%H%M%S")
        dest = os.path.join(folder, name)
        if os.path.exists(dest):
            return None
        shutil.copyfile(path, dest + ".tmp")
        os.replace(dest + ".tmp", dest)
        names = sorted(set(names) | {name})
        for old in names[:-SETTING_BACKUP_KEEP]:
            try:
                os.remove(os.path.join(folder, old))
            except OSError:
                pass
        return name
    except Exception:
        return None


def section(raw, spot):
    """Where an undo record's names live: "_settings" (a dict, else {}) or
    "" (the top of positions.json, e.g. _cash / _invested)."""
    if spot == "_settings":
        s = raw.get("_settings")
        return s if isinstance(s, dict) else {}
    return raw


def snap(container, names):
    """A deep copy of container's names that are there (absent = not in it)."""
    return {n: json.loads(json.dumps(container[n])) for n in names if n in container}


def _num(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def _jsame(a, b):
    return json.dumps(a, sort_keys=True) == json.dumps(b, sort_keys=True)


def undo_records(path, now=None):
    """13.6: the undo stack in .cache/setting_undo.json, oldest first: only
    well-formed records changed in the last UNDO_MAX_AGE seconds. A bad or
    missing file gives []. Never raises."""
    try:
        now = time.time() if now is None else now
        with open(os.path.join(cache_dir(path), UNDO_FILE)) as f:
            recs = json.load(f)
        if not isinstance(recs, list):
            return []
        out = []
        for r in recs:
            if not isinstance(r, dict):
                continue
            if not (isinstance(r.get("id"), int) and not isinstance(r.get("id"), bool)
                    and _num(r.get("t")) and _num(r.get("t1"))):
                continue
            if not all(isinstance(r.get(k), str) for k in ("key", "kind", "label", "spot")):
                continue
            if not (isinstance(r.get("names"), list) and isinstance(r.get("before"), dict)
                    and isinstance(r.get("after"), dict)):
                continue
            if abs(now - r["t1"]) <= UNDO_MAX_AGE:
                r["label"] = r["label"][:80]     # (as the widget shows it)
                out.append(r)
        return out
    except Exception:
        return []


def undo_summary(rec):
    """What the widget shows for a record: {"id", "key", "label", "t"}."""
    if not isinstance(rec, dict):
        return None
    return {"id": rec.get("id"), "key": rec.get("key"), "label": rec.get("label"),
            "t": rec.get("t")}


def undo_push(path, key, label, spot, names, before, after, backup=None, kind="set", now=None):
    """13.6: record one settings write (call it after pf.save). before /
    after hold each name's value (absent = not in the file). Same-key
    "set" changes within UNDO_MERGE_S seconds that chain on (the record's
    after == this before) merge into one record: undo goes back to before
    the drag or the slider, and a record back where it started is dropped.
    Returns the newest record's summary, or None. Never raises."""
    try:
        now = time.time() if now is None else now
        recs = undo_records(path, now)
        last = recs[-1] if recs else None
        if (last is not None and last["key"] == key and last["kind"] == kind == "set"
                and now - last["t1"] < UNDO_MERGE_S and _jsame(last["after"], before)):
            if _jsame(after, last["before"]):
                recs.pop()
                undo_write(path, recs)
                return None
            last["after"] = json.loads(json.dumps(after))
            last["t1"] = now
            last["label"] = label
            undo_write(path, recs)
            return undo_summary(last)
        if _jsame(before, after):
            return None
        rec = {"id": int(now * 1000), "t": now, "t1": now, "key": key, "kind": kind,
               "label": label, "spot": spot, "names": list(names),
               "before": json.loads(json.dumps(before)),
               "after": json.loads(json.dumps(after)), "backup": backup}
        recs.append(rec)
        undo_write(path, recs)
        return undo_summary(rec)
    except Exception:
        return None


def undo_write(path, recs):
    """Save the newest UNDO_KEEP records atomically ([] removes the file).
    Best effort: errors are swallowed."""
    target = os.path.join(cache_dir(path), UNDO_FILE)
    try:
        recs = list(recs)[-UNDO_KEEP:]
        if not recs:
            if os.path.exists(target):
                os.remove(target)
            return
        os.makedirs(cache_dir(path), exist_ok=True)
        with open(target + ".tmp", "w") as f:
            json.dump(recs, f, allow_nan=False)
        os.replace(target + ".tmp", target)
    except Exception:
        try:
            os.remove(target + ".tmp")
        except OSError:
            pass


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
