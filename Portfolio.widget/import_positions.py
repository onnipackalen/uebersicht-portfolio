#!/usr/bin/env python3
"""
import_positions.py — add many holdings at once from a pasted list or a CSV
file (the widget's "import a list…" runs this; standard library only).

    python3 import_positions.py --text "KO 10, MSFT 5 at 310 on 2024-03-01"
    python3 import_positions.py --file ~/Downloads/holdings.csv
    python3 import_positions.py --file holdings.csv --commit     # save them

Without --commit nothing is written: the answer is a preview. The output is
one JSON object:

    {"rows": [{"line": 2, "ticker": "MSFT", "shares": 5, "cost": 310,
               "date": "2024-03-01", "ok": true, "note": ""}, ...],
     "ok": 2, "skipped": 1, "format": "lines" | "csv", "columns": {...}}

and with --commit also "added" (lots written), "tickers" (new or extended),
"backup" (the copy of positions.json made first) and "invested" (the money
added to _invested when that figure is kept).

Two formats are understood, told apart automatically:

* one holding per line: a ticker, the number of shares, then optionally the
  price paid per share and the purchase date, in any order —
  "KO 10", "10 KO", "MSFT 5 at 310 on 2024-03-01", "SHOP.TO 12 @ 61.5",
  "VOD.L, 200, 0.98, 12/03/2024". Several holdings may share a line when
  separated by ";" or ","-and-a-ticker ("KO 10, MSFT 5").
* a CSV / TSV export from a broker, with a header row: the ticker column is
  found by its name (symbol, ticker, stock, code, instrument, security…),
  shares by quantity / qty / units / shares / position, the price by cost,
  price, avg cost, average price, book cost, purchase price, unit cost…, a
  total (book value, cost basis, total cost, amount invested) is divided by
  the shares, and the date by date / purchase date / trade date / acquired.
  Without a header the columns are ticker, shares, price, date in that order.

A line that is not a holding (a sale with negative shares, a heading, a
total row, a name without a ticker) is skipped with a note — nothing stops
the rest. Numbers may carry currency signs and thousands separators
("$1,234.50", "1.234,50"); dates may be YYYY-MM-DD, DD.MM.YYYY, DD/MM/YYYY
or MM/DD/YYYY (the first number is the day unless it cannot be).
"""

import argparse
import csv
import io
import json
import math
import os
import re
import shutil
import sys
from datetime import date, datetime

import portfolio_file as pf
from add_position import add_lot

MAX_ROWS = 500                  # holdings one import may add
MAX_TEXT = 2 * 1024 * 1024      # bytes read from a file
BACKUP_KEEP = 5                 # import backups kept (the newest)

TICKER_WORDS = ("symbol", "ticker", "stock", "code", "instrument", "security", "asset", "isin/ticker",
                "ticker symbol", "symbol/cusip", "product")
SHARE_WORDS = ("shares", "quantity", "qty", "units", "position", "holding", "number of shares", "share count",
               "amount of shares", "no. of shares", "qty.", "volume", "count")
COST_WORDS = ("avg cost", "average cost", "avg. cost", "avg price", "average price", "avg. price", "cost/share",
              "cost per share", "price paid", "purchase price", "buy price", "unit cost", "unit price",
              "cost basis per share", "average cost basis", "entry price", "price", "cost", "open price",
              "acquisition price", "avg", "book cost/share")
TOTAL_WORDS = ("book value", "book cost", "cost basis", "total cost", "amount invested", "invested", "total",
               "cost basis total", "purchase value", "total paid", "amount")
DATE_WORDS = ("purchase date", "trade date", "date acquired", "acquired", "open date", "date", "bought",
              "buy date", "settlement date", "acquisition date", "first purchase")
SKIP_TOTAL_RE = re.compile(r"^(total|totals|grand total|sum|cash|balance)\b", re.I)
NUM_RE = re.compile(r"^[-+]?(\d+([.,]\d+)*|[.,]\d+)$")
DATE_ISO = re.compile(r"^(\d{4})-(\d{1,2})-(\d{1,2})$")
DATE_DOT = re.compile(r"^(\d{1,2})[./](\d{1,2})[./](\d{4})$")
PRICE_PREFIX = ("@", "at", "for", "cost", "price")
DATE_PREFIX = ("on", "date", "bought")
CURRENCY_SIGNS = re.compile(r"^(?:[A-Z]{1,3}\$|US\$|CA\$|[$€£¥₹]|[A-Z]{3})?\s*(.*?)\s*(?:[$€£¥₹]|[A-Z]{3})?$")


def reply(obj, code=0):
    json.dump(obj, sys.stdout, allow_nan=False)
    sys.stdout.write("\n")
    sys.exit(code)


def clean_number(text):
    """"$1,234.50" / "1.234,50" / "12,5" / "(300)" -> float or None."""
    s = str(text or "").strip()
    if not s:
        return None
    neg = s.startswith("(") and s.endswith(")")
    s = s.strip("()").strip()
    m = CURRENCY_SIGNS.match(s)
    if m:
        s = m.group(1).strip()
    s = s.replace(" ", "").replace(" ", "").replace("'", "")
    if s.startswith(("+", "-", "−")):
        neg = neg or s[0] in "-−"
        s = s[1:]
    if not NUM_RE.match(s):
        return None
    if "," in s and "." in s:
        # the last separator is the decimal one: 1,234.50 or 1.234,50
        if s.rfind(",") > s.rfind("."):
            s = s.replace(".", "").replace(",", ".")
        else:
            s = s.replace(",", "")
    elif "," in s:
        parts = s.split(",")
        # 1,234 or 12,345,678 = thousands; 12,5 = a decimal comma
        if len(parts) > 2 or (len(parts) == 2 and len(parts[1]) == 3 and len(parts[0]) <= 3):
            s = s.replace(",", "")
        else:
            s = s.replace(",", ".")
    elif s.count(".") > 1:
        # 1.234.567 = thousands with dots
        s = s.replace(".", "")
    try:
        v = float(s)
    except ValueError:
        return None
    if not math.isfinite(v):
        return None
    return -v if neg else v


def clean_date(text):
    """A purchase date as YYYY-MM-DD, or None. Not after today."""
    s = str(text or "").strip()
    if not s:
        return None
    s = s.split("T")[0].split(" ")[0]
    m = DATE_ISO.match(s)
    if m:
        y, a, b = int(m.group(1)), int(m.group(2)), int(m.group(3))
        parts = [(y, a, b)]
    else:
        m = DATE_DOT.match(s)
        if not m:
            return None
        a, b, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
        parts = [(y, b, a), (y, a, b)]        # day first, else month first
    for y, mo, d in parts:
        try:
            dt = date(y, mo, d)
        except ValueError:
            continue
        if dt > date.today() or y < 1900:
            return None
        return dt.strftime("%Y-%m-%d")
    return None


def clean_ticker(text):
    """A Yahoo-style symbol, upper-cased, or None. "KO:NYSE", "nyse:
    KO" and "KO.US" (some brokers) become KO."""
    s = str(text or "").strip().upper().strip("'\"")
    if not s:
        return None
    if ":" in s:
        a, b = s.split(":", 1)
        s = b if len(a) > len(b) or a in ("NASDAQ", "NYSE", "TSX", "TSE", "LSE", "XETRA", "AMEX", "ARCA", "BATS") else a
    if s.endswith(".US") and len(s) > 3:
        s = s[:-3]
    s = s.strip()
    if NUM_RE.match(s) or not pf.TICKER_RE.match(s):
        return None
    return s


# ---------------------------------------------------------------- free lines
def parse_free_line(line):
    """One or more holdings from a free-form line -> list of row dicts
    (ok / note filled in)."""
    out = []
    text = line.strip()
    if not text:
        return out
    # "KO 10, MSFT 5" / "KO 10; MSFT 5": split where a separator is followed by a ticker
    chunks = []
    for part in re.split(r"\s*;\s*", text):
        sub = re.split(r",\s*(?=[A-Za-z^][A-Za-z0-9.\-=&]*\s+\d)", part)
        chunks.extend(sub)
    for chunk in chunks:
        # whitespace splits; a comma does too, unless it sits inside a number
        # ("$61,234.50", "1,000") — "KO,10" is split as well
        toks = []
        for t in chunk.strip().split():
            t = t.strip(",")
            if not t:
                continue
            if "," in t and clean_number(t) is None and clean_date(t) is None:
                toks.extend(x for x in t.split(",") if x)
            else:
                toks.append(t)
        if not toks:
            continue
        ticker, shares, cost, dt = None, None, None, None
        expect = None
        notes = []
        for raw in toks:
            low = raw.lower().strip(":")
            if low in PRICE_PREFIX:
                expect = "cost"
                continue
            if low in DATE_PREFIX:
                expect = "date"
                continue
            if low in ("x", "×", "shares", "sh", "units", "of"):
                continue
            d = clean_date(raw)
            if d and (expect in (None, "date")):
                dt = d
                expect = None
                continue
            n = clean_number(raw.lstrip("@"))
            if n is not None:
                if expect == "cost" or (shares is not None and cost is None):
                    cost = n
                elif shares is None:
                    shares = n
                else:
                    notes.append("extra number %s ignored" % raw)
                expect = None
                continue
            tk = clean_ticker(raw)
            if tk and ticker is None:
                ticker = tk
            elif ticker is not None and not tk:
                notes.append("'%s' ignored" % raw)
            elif ticker is not None:
                notes.append("'%s' ignored" % raw)
            expect = None
        out.append(make_row(ticker, shares, cost, dt, notes, chunk.strip()))
    return out


def make_row(ticker, shares, cost, dt, notes, text):
    row = {"ticker": ticker, "shares": shares, "cost": cost, "date": dt, "ok": False, "note": "", "text": text[:80]}
    if ticker is None:
        row["note"] = "no ticker found"
    elif shares is None:
        row["note"] = "no share count"
    elif shares < 0:
        row["note"] = "a sale (negative shares) — not imported"
    elif shares == 0:
        row["note"] = "0 shares"
    elif cost is not None and cost <= 0:
        row["note"] = "price must be above 0"
    else:
        row["ok"] = True
        row["shares"] = round(float(shares), 6)
        if cost is not None:
            row["cost"] = round(float(cost), 6)
    if notes and row["ok"]:
        row["note"] = "; ".join(notes)[:120]
    return row


# ---------------------------------------------------------------- csv
def sniff(text):
    """-> (delimiter, rows) for CSV-looking text, or (None, None)."""
    lines = [ln for ln in text.splitlines()[:40] if ln.strip()]
    best, best_n = None, 0.0
    for d in (",", ";", "\t", "|"):
        counts = [ln.count(d) for ln in lines]
        with_d = [c for c in counts if c >= 1]
        # most lines carry the delimiter (a heading like "Account: 1234" or a
        # blank line above the header is fine), at least two of them do, and
        # they agree on the number of fields more or less
        if len(with_d) >= 2 and len(with_d) >= 0.6 * len(lines) and sum(with_d) / len(with_d) > best_n:
            best, best_n = d, sum(with_d) / len(with_d)
    if best is None:
        return None, None
    rows = list(csv.reader(io.StringIO(text), delimiter=best))
    return best, rows


def find_header(rows):
    """Index and column map of the header row (within the first 10 rows),
    or (None, {}) when no cell names a ticker column."""
    for i, row in enumerate(rows[:10]):
        cells = [c.strip().lower().strip('"') for c in row]
        cols = {}
        for j, c in enumerate(cells):
            if not c:
                continue
            if "ticker" not in cols and (c in TICKER_WORDS or c.endswith((" symbol", " ticker"))):
                cols["ticker"] = j
            elif "shares" not in cols and (c in SHARE_WORDS or c.startswith(("quantity", "qty", "shares", "units"))):
                cols["shares"] = j
            elif "date" not in cols and (c in DATE_WORDS or c.endswith(" date") or c.startswith("date ")):
                cols["date"] = j
            elif "cost" not in cols and (c in COST_WORDS or any(c.startswith(w + " ") for w in ("avg", "average"))
                                         or c.endswith(("/share", " per share", " price", " cost"))) \
                    and not c.startswith(("market", "last", "current", "close", "mkt")) and c not in TOTAL_WORDS:
                cols["cost"] = j
            elif "total" not in cols and (c in TOTAL_WORDS or c.endswith((" value", " basis"))) \
                    and not c.startswith(("market", "current", "mkt")):
                cols["total"] = j
        if "ticker" in cols:
            return i, cols
    return None, {}


def parse_csv_rows(rows, delim):
    header_i, cols = find_header(rows)
    out = []
    if header_i is None:
        cols = {"ticker": 0, "shares": 1, "cost": 2, "date": 3}
        body = rows
        first_line = 1
    else:
        body = rows[header_i + 1:]
        first_line = header_i + 2
    for k, row in enumerate(body):
        line_no = first_line + k
        cells = [c.strip() for c in row]
        if not any(cells):
            continue
        text = delim.join(cells)

        def cell(key):
            j = cols.get(key)
            return cells[j] if j is not None and j < len(cells) else ""
        if SKIP_TOTAL_RE.match(cell("ticker") or (cells[0] if cells else "")):
            out.append(dict(make_row(None, None, None, None, [], text), note="a total row — skipped", line=line_no))
            continue
        ticker = clean_ticker(cell("ticker"))
        shares = clean_number(cell("shares"))
        cost = clean_number(cell("cost")) if cols.get("cost") is not None else None
        notes = []
        if cost is None and cols.get("total") is not None and shares:
            total = clean_number(cell("total"))
            if total is not None and total > 0:
                cost = total / shares
                notes.append("price = %s ÷ shares" % cell("total"))
        dt = clean_date(cell("date")) if cols.get("date") is not None else None
        if cols.get("date") is not None and cell("date") and dt is None:
            notes.append("date '%s' not understood" % cell("date")[:20])
        r = make_row(ticker, shares, cost, dt, notes, text)
        r["line"] = line_no
        out.append(r)
    return out, cols


def parse_text(text):
    """-> (rows, format, columns)."""
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    if text.startswith("﻿"):
        text = text[1:]
    delim, rows = sniff(text)
    if rows is not None:
        parsed, cols = parse_csv_rows(rows, delim)
        if any(r["ok"] for r in parsed) or len(parsed) >= 3:
            return parsed, "csv", {k: v for k, v in cols.items()}
    out = []
    for i, line in enumerate(text.split("\n"), 1):
        if not line.strip() or line.strip().startswith("#"):
            continue
        for r in parse_free_line(line):
            r["line"] = i
            out.append(r)
    return out, "lines", {}


# ---------------------------------------------------------------- commit
def backup_positions(path):
    """A dated copy next to the file (positions.backup-<stamp>-import.json),
    keeping the newest BACKUP_KEEP import backups. None when nothing to copy."""
    if not os.path.exists(path):
        return None
    folder = os.path.dirname(os.path.abspath(path))
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    name = "positions.backup-%s-import.json" % stamp
    shutil.copy2(path, os.path.join(folder, name))
    olds = sorted(f for f in os.listdir(folder)
                  if re.match(r"^positions\.backup-\d{8}-\d{6}-import\.json$", f))
    for f in olds[:-BACKUP_KEEP]:
        try:
            os.remove(os.path.join(folder, f))
        except OSError:
            pass
    return name


def commit(path, rows):
    raw = pf.load(path, create=True)
    backup = backup_positions(path)
    added, tickers, spent, unknown = 0, [], 0.0, 0
    today = date.today().strftime("%Y-%m-%d")
    for r in rows:
        if not r["ok"]:
            continue
        lot = {"shares": r["shares"], "date": r["date"] or today}
        if r["cost"] is not None:
            lot["avgCost"] = r["cost"]
        try:
            add_lot(raw, r["ticker"], lot)
        except ValueError as e:
            r["ok"] = False
            r["note"] = str(e)
            continue
        added += 1
        if r["ticker"] not in tickers:
            tickers.append(r["ticker"])
        if raw.get("_invested") is not None:
            per_share = r["cost"] if r["cost"] is not None else pf.last_price(path, r["ticker"])
            value = pf.to_display(path, r["ticker"], per_share, r["shares"]) if per_share else None
            if value is None:
                unknown += 1
            else:
                spent += value
    invested = None
    if raw.get("_invested") is not None and added:
        raw["_invested"] = round(float(raw["_invested"]) + spent, 2)
        invested = {"added": round(spent, 2), "now": raw["_invested"], "unknown": unknown}
    pf.save(path, raw)
    pf.request_refresh(path)
    return {"added": added, "tickers": tickers, "backup": backup, "invested": invested}


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    ap = argparse.ArgumentParser()
    ap.add_argument("--text", default=None, help="the pasted list")
    ap.add_argument("--file", default=None, help="a CSV / TSV / text file")
    ap.add_argument("--commit", action="store_true", help="write the holdings (default: preview only)")
    ap.add_argument("--positions", default=os.path.join(here, "positions.json"))
    args = ap.parse_args()
    if args.text is None and args.file is None:
        reply({"error": "give --text or --file"}, 1)
    text = args.text or ""
    if args.file is not None:
        path = os.path.expanduser(args.file.strip())
        try:
            with open(path, "rb") as f:
                data = f.read(MAX_TEXT + 1)
        except OSError as e:
            reply({"error": "cannot read the file: %s" % (e.strerror or e)}, 1)
        if len(data) > MAX_TEXT:
            reply({"error": "the file is larger than 2 MB"}, 1)
        for enc in ("utf-8-sig", "utf-16", "cp1252", "latin-1"):
            try:
                text = data.decode(enc)
                if "\x00" not in text:
                    break
            except (UnicodeDecodeError, LookupError):
                continue
        else:
            reply({"error": "the file is not text"}, 1)
    if len(text) > MAX_TEXT:
        reply({"error": "the list is too long (2 MB at most)"}, 1)
    rows, fmt, cols = parse_text(text)
    if len(rows) > MAX_ROWS:
        for r in rows[MAX_ROWS:]:
            r["ok"] = False
            r["note"] = "over %d rows — not imported" % MAX_ROWS
    ok = [r for r in rows if r["ok"]]
    out = {"rows": rows, "ok": len(ok), "skipped": len(rows) - len(ok), "format": fmt, "columns": cols}
    if not rows:
        out["error"] = "nothing to import — one holding per line: ticker and shares (KO 10)"
        reply(out, 0)
    if args.commit:
        if not ok:
            out["error"] = "no holding to add"
            reply(out, 0)
        buf = io.StringIO()
        try:
            import contextlib
            with contextlib.redirect_stdout(buf):
                res = commit(args.positions, ok)
        except SystemExit:
            msg = buf.getvalue().strip()
            out["error"] = msg[len("error: "):] if msg.startswith("error: ") else msg or "could not save"
            reply(out, 1)
        except Exception as e:
            out["error"] = "could not save: %s" % e
            reply(out, 1)
        out.update(res)
    reply(out, 0)


if __name__ == "__main__":
    main()
