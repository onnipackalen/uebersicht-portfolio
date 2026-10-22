#!/usr/bin/env python3
"""
holding_meta.py — a note and a price target per stock (13.6; the widget's
"note" row in a stock's detail view).

    python3 holding_meta.py note KO bought after the Q3 call
    python3 holding_meta.py note KO clear            # or an empty note
    python3 holding_meta.py target KO 72 [above|below]
    python3 holding_meta.py target KO clear          # or none / ""
    python3 holding_meta.py clear KO                 # the note and the target
    python3 holding_meta.py list [KO]

They live in positions.json under "_notes", keyed by ticker:
{"KO": {"note": "...", "target": 72.0, "side": "above", "at": "2026-10-21"}}.
A note is one line of at most 200 characters. The target is in the stock's
quote currency (pence for .L); "side" is where it was against the price when
saved (given, or worked out from the last refresh), so the widget can tell
when the price has reached it. Selling everything keeps them. Works for
held, watched and looked-up stocks. --json prints one line of JSON and
nothing else. Standard library only; no prices are fetched.
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

import portfolio_file as pf
from portfolio_tracker import (MAX_NOTES, NOTE_MAX, SYMBOL_RE, TARGET_MAX,
                               clean_note, load_notes)

TARGET_RE = re.compile(r"^(\d+([.,]\d*)?|[.,]\d+)$")
GROUPED_RE = re.compile(r"^[1-9]\d{0,2}(,\d{3})+$")   # 1,234 / 12,345,678
CLEAR_WORDS = ("clear", "none", "")
TARGET_HELP = "the price target must be a number above 0, like 72 or 72.50"


class Done(Exception):
    """A reply is ready: (obj for --json, text otherwise, exit code)."""


class Args(argparse.ArgumentParser):
    def error(self, message):
        raise Done({"error": message}, "error: " + message, 1)


def split_argv(argv):
    """--json / --positions P anywhere before a "--"; everything else is a
    word (a note starting with "-" stays text)."""
    flags, words, i = [], [], 0
    while i < len(argv):
        a = argv[i]
        if a == "--":
            words += argv[i + 1:]
            break
        if a in ("--json", "-h", "--help"):
            flags.append(a)
        elif a == "--positions" and i + 1 < len(argv):
            flags += [a, argv[i + 1]]
            i += 1
        elif a.startswith("--positions="):
            flags.append(a)
        else:
            words.append(a)
        i += 1
    return flags, words


def ticker_of(text):
    tk = str(text or "").strip().upper()
    if not SYMBOL_RE.match(tk):
        pf.fail("ticker looks wrong: %r" % text)
    return tk


def target_arg(text):
    """72 / 72.5 / 72,5 -> float; "1,234.5", "1.234,5", "1,234", "1e3",
    "inf", "-5", 0 and anything above TARGET_MAX are refused."""
    s = str(text).strip()
    if "," in s and "." in s or s.count(",") + s.count(".") > 1 \
            or GROUPED_RE.match(s):
        pf.fail("write the price target without thousands separators, "
                "like 1234 or 1234.50")
    if not TARGET_RE.match(s):
        pf.fail(TARGET_HELP)
    v = float(s.replace(",", "."))
    if not math.isfinite(v) or v <= 0 or v > TARGET_MAX:
        pf.fail(TARGET_HELP)
    return v


def price_text(v):
    """72.0 -> "72", 72.5 -> "72.5", 72.456 -> "72.46"."""
    t = ("%.2f" % v).rstrip("0").rstrip(".")
    return t if t != "0" else "%.6g" % v     # 0.004 stays visible


def last_row(path, tk):
    """The last refresh's row for tk (holdings, then the watchlist), or {}."""
    data = pf.load_data(path)
    for p in (data.get("positions") or []) + (data.get("watchlist") or []):
        if isinstance(p, dict) and p.get("ticker") == tk:
            return p
    return {}


def side_for(target, row):
    price = row.get("price")
    if isinstance(price, bool) or not isinstance(price, (int, float)) \
            or not math.isfinite(price) or price <= 0:
        return None
    return "above" if target > price else "below" if target < price else None


def currency_for(path, tk, raw, row):
    if isinstance(row.get("currency"), str) and row["currency"]:
        return row["currency"]
    return pf.quote_currency(path, tk, raw.get(tk))


def stored(entry):
    """The _notes entry as written: only the fields that are set."""
    out = {}
    if entry.get("note"):
        out["note"] = entry["note"]
    if entry.get("target") is not None:
        out["target"] = entry["target"]
        out["side"] = entry.get("side")
    if out:
        out["at"] = entry.get("at")
    return out


def patch_data(path, raw):
    """data.json "notes" in place, so the widget shows it on its next read
    (the time stamp stays: no new prices are needed)."""
    notes = load_notes(raw)

    def fn(data):
        if data.get("notes") == notes:
            return False
        data["notes"] = notes
        return True
    pf.patch_cached(path, fn)


def run(args, words):
    action = args.action
    if not words and action != "list":
        pf.fail("%s needs a TICKER" % action)
    tk = ticker_of(words[0]) if words else None
    rest = words[1:]
    raw = pf.load(args.positions, create=action == "list")
    items = raw.get("_notes")
    if items is not None and not isinstance(items, dict):
        pf.fail("_notes in positions.json should be an object — fix it first")
    notes = load_notes(raw)

    if action == "list":
        if rest:
            pf.fail("list takes at most one TICKER")
        if tk:
            notes = {tk: notes[tk]} if tk in notes else {}
        text = "\n".join("%s: %s%s" % (
            t, e["note"] or "",
            ("  (price target %s)" % price_text(e["target"]))
            if e["target"] is not None else "")
            for t, e in notes.items()) or "(no notes)"
        return {"ok": True, "notes": notes}, text

    old = notes.get(tk) or {"note": None, "target": None, "side": None, "at": None}
    new = dict(old)
    row, removing = {}, action == "clear"
    if action == "note":
        text = clean_note(" ".join(rest))
        removing = text.lower() in CLEAR_WORDS
        if removing:
            new["note"] = None
            msg = "note removed from %s" % tk
        else:
            if len(text) > NOTE_MAX:
                pf.fail("a note can be at most %d characters — this one has %d"
                        % (NOTE_MAX, len(text)))
            new["note"] = text
            msg = "note saved for %s" % tk
    elif action == "target":
        if len(rest) > 2:
            pf.fail("target takes TICKER PRICE [above|below], e.g. KO 72")
        value = rest[0].strip() if rest else ""
        removing = value.lower() in CLEAR_WORDS
        if removing:
            if len(rest) > 1:
                pf.fail("clear takes no above / below")
            new["target"], new["side"] = None, None
            msg = "price target removed from %s" % tk
        else:
            v = target_arg(value)
            row = last_row(args.positions, tk)
            if len(rest) > 1:
                side = rest[1].strip().lower()
                if side not in ("above", "below"):
                    pf.fail("the side must be above or below, got %r" % rest[1])
            else:
                side = side_for(v, row)
            new["target"], new["side"] = v, side
            msg = "price target for %s set to %s (%s)" % (
                tk, price_text(v), currency_for(args.positions, tk, raw, row))
    else:   # clear
        if rest:
            pf.fail("clear takes only a TICKER")
        new = {"note": None, "target": None, "side": None, "at": None}
        msg = "note and price target removed from %s" % tk

    same = all(new.get(k) == old.get(k) for k in ("note", "target", "side"))
    if not same:
        new["at"] = time.strftime("%Y-%m-%d")
    entry = stored(new)
    # write under the upper-case ticker; drop a differently written key
    keep = {k: e for k, e in (items or {}).items()
            if not (isinstance(k, str) and k.strip().upper() == tk)}
    if entry:
        if len(keep) == len(items or {}) and len(keep) >= MAX_NOTES:
            pf.fail("at most %d notes — clear one first" % MAX_NOTES)
        keep[tk] = entry
    if same and keep == (items or {}):
        # nothing to write: the file stays as it is
        if removing:
            msg = "nothing to clear for %s" % tk
    else:
        if keep:
            raw["_notes"] = keep
        else:
            raw.pop("_notes", None)
        pf.save(args.positions, raw)
        patch_data(args.positions, raw)
    out = load_notes(raw).get(tk)
    reply = {"ok": True, "ticker": tk, "entry": out, "message": msg}
    return reply, msg


def main(argv=None):
    here = os.path.dirname(os.path.abspath(__file__))
    flags, words = split_argv(sys.argv[1:] if argv is None else argv)
    ap = Args()
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--positions", default=os.path.join(here, "positions.json"))
    ap.add_argument("action", choices=["note", "target", "clear", "list"])
    ap.add_argument("words", nargs="*")
    as_json = "--json" in flags
    if "-h" in flags or "--help" in flags:
        print(__doc__.strip())
        return 0
    buf = io.StringIO()
    try:
        if not words:
            raise Done({"error": "need note, target, clear or list"},
                       "usage: holding_meta.py note|target|clear|list ...", 1)
        args = ap.parse_args(flags + ["--", words[0]])
        # pf.fail prints plain text and exits: caught, passed on as JSON
        with contextlib.redirect_stdout(buf):
            obj, text = run(args, words[1:])
        code = 0
    except Done as d:
        obj, text, code = d.args
    except SystemExit:
        msg = buf.getvalue().strip()
        msg = msg[len("error: "):] if msg.startswith("error: ") else msg or "failed"
        obj, text, code = {"error": msg}, "error: " + msg, 1
    except Exception as e:
        obj, text, code = ({"error": "could not save the note: %s" % e},
                           "error: could not save the note: %s" % e, 1)
    print(json.dumps(obj) if as_json else text)
    return code


if __name__ == "__main__":
    sys.exit(main())
