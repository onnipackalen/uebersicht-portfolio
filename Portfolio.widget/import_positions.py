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
  separated by ";" or by a "," before the next holding ("KO 10, MSFT 5",
  "10 KO, 5 MSFT"). A chunk with two stocks in it ("MSFT 5 at 50 KO 1") or
  a price behind a word that is not understood ("KO 10 blah 50") is skipped
  with a note rather than guessed.
* a CSV / TSV export from a broker, with a header row: the ticker column is
  found by its name (symbol, ticker, stock, code, instrument, security…),
  shares by quantity / qty / units / shares / position, the price by cost,
  price, avg cost, average price, book cost, purchase price, unit cost…, a
  total (book value, cost basis, total cost, amount invested) is divided by
  the shares, and the date by date / purchase date / trade date / acquired.
  An "Average Cost" style column beats a bare "Price" one; a bare "Price"
  next to a "Market Price" is used with a "check it" note. The separator is
  the one most lines share (";" before "\t", "|" and "," on a tie), trying
  the next one when no header is found. Without a header the columns are
  ticker, shares, price, date in that order, and the free-form reading wins
  when it finds more holdings ("ITW 1, MSFT 2" is not a CSV).

A line that is not a holding (a sale with negative shares, a heading, a
total row, a name without a ticker) is skipped with a note — nothing stops
the rest. Numbers may carry currency signs and thousands separators
("$1,234.50", "1.234,50"); dates may be YYYY-MM-DD, YYYY/MM/DD, DD.MM.YYYY,
DD/MM/YYYY, DD-MM-YYYY or MM/DD/YYYY (the first number is the day unless it
cannot be), or "Mar 1 2024" / "1 March 2024" / "Mar 1, 2024". Exchange
prefixes become Yahoo suffixes: "TSX:SHOP" -> SHOP.TO, "LSE:VOD" -> VOD.L
(with a note), "NYSE:KO" / "KO:NYSE" -> KO. Files may be UTF-8, UTF-16 or
Windows (cp1252) text.
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
DATE_DASH = re.compile(r"^(\d{1,2})-(\d{1,2})-(\d{4})$")
DATE_YSLASH = re.compile(r"^(\d{4})/(\d{1,2})/(\d{1,2})$")
DAY_RE = re.compile(r"^(\d{1,2})(?:st|nd|rd|th)?$", re.I)
YEAR_RE = re.compile(r"^\d{4}$")
MONTHS = ("january", "february", "march", "april", "may", "june", "july", "august", "september", "october",
          "november", "december")
EXCHANGE_SUFFIX = {"TSX": ".TO", "TSE": ".TO", "TSXV": ".V", "CVE": ".V", "CSE": ".CN", "NEO": ".NE", "LSE": ".L",
                   "LON": ".L", "XETRA": ".DE", "ETR": ".DE", "FRA": ".F", "ASX": ".AX", "HKEX": ".HK", "HKG": ".HK",
                   "NYSE": "", "NASDAQ": "", "AMEX": "", "ARCA": "", "BATS": ""}
# a currency code after the ticker ("KO 10 at 50 USD") is not a second stock
CURRENCY_WORDS = ("usd", "eur", "gbp", "gbx", "cad", "chf", "sek", "nok", "dkk", "jpy", "aud", "nzd", "hkd")
# a "," splits a line before the next holding: "KO 10, MSFT 5" / "10 KO, 5 MSFT"
# — but not before "on 2024-03-01", "at 50", "10 shares" (the same holding)
_FILLER = r"(?:at|for|on|cost|price|date|bought|x|shares|sh|units|of)\b"
_TICK = r"[A-Za-z^][A-Za-z0-9.:\-=&]*"
# number first ("10 KO, 5 MSFT"): only an upper-case ticker that is not a
# currency ("KO 10, 50 USD" / "KO 10, 50 each" are one holding with a price)
_UTICK = r"(?!(?:%s)(?![A-Za-z0-9]))[A-Z^][A-Z0-9.:\-=&]*(?![a-z])" % "|".join(w.upper() for w in CURRENCY_WORDS)
_CNUM = r"\d{1,20}(?:[.,]\d{1,20}){0,8}"     # bounded: no blow-up on long "1,1,1,…" runs
# never at a comma inside a number: "1,000, MSFT 5" splits after "1,000" only
# (a comma right after a digit needs a space after it)
COMMA_SPLIT = re.compile(r"(?:(?<!\d),\s*|(?<=\d),\s+)(?!(?i:%s))(?=(?:%s\s+(?!(?i:%s))%s|%s\s+\d))"
                         % (_FILLER, _CNUM, _FILLER, _UTICK, _TICK))
COMMA_SPLIT_MAX = 2000          # a longer line is one chunk (no comma split)
COST_TIER2 = ("avg", "average", "book", "purchase", "paid", "unit", "cost", "share", "entry", "acquisition", "buy")
MARKET_PREFIX = ("market", "last", "current", "close", "mkt")
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
    parts = month_date(s)
    if parts is None:
        s = s.split("T")[0].split(" ")[0]
        m = DATE_ISO.match(s) or DATE_YSLASH.match(s)
        if m:
            y, a, b = int(m.group(1)), int(m.group(2)), int(m.group(3))
            parts = [(y, a, b)]
        else:
            m = DATE_DOT.match(s) or DATE_DASH.match(s)
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


def month_of(word):
    """"Mar" / "March" / "Sept" / "mar." -> 3, else None."""
    w = str(word or "").strip().strip(".,").lower()
    if len(w) < 3 or not w.isalpha():
        return None
    if w == "sept":
        return 9
    for i, name in enumerate(MONTHS):
        if name.startswith(w):
            return i + 1
    return None


def month_date(s):
    """"Mar 1 2024" / "1 Mar 2024" / "Mar 1, 2024" -> [(y, m, d)], else None."""
    words = s.replace(",", " ").replace(".", " ").split()
    if len(words) != 3 or not YEAR_RE.match(words[2]):
        return None
    for mw, dw in ((words[0], words[1]), (words[1], words[0])):
        mo, dm = month_of(mw), DAY_RE.match(dw)
        if mo and dm:
            return [(int(words[2]), mo, int(dm.group(1)))]
    return None


def looks_like_date(text):
    """True for text written like a date (2031-01-01, 01.03.2024, Mar 1 2024),
    whether or not it is a real, past day (clean_date says that)."""
    s = str(text or "").strip()
    if not s:
        return False
    if month_date(s) is not None:
        return True
    s = s.split("T")[0].split(" ")[0]
    return any(r.match(s) for r in (DATE_ISO, DATE_YSLASH, DATE_DOT, DATE_DASH))


def split_ticker(text):
    """-> (symbol or None, note). A Yahoo-style symbol, upper-cased.
    "KO:NYSE", "NYSE:KO" and "KO.US" (some brokers) become KO; an exchange
    with a Yahoo suffix adds it: "TSX:SHOP" / "SHOP:TSX" -> SHOP.TO, with
    the note "TSX:SHOP read as SHOP.TO"."""
    s = str(text or "").strip().upper().strip("'\"")
    if not s:
        return None, ""
    given, suffix = s, ""
    if ":" in s:
        a, b = [x.strip() for x in s.split(":", 1)]
        if a in EXCHANGE_SUFFIX:
            s, suffix = b, EXCHANGE_SUFFIX[a]
        elif b in EXCHANGE_SUFFIX:
            s, suffix = a, EXCHANGE_SUFFIX[b]
        else:
            s = b if len(a) > len(b) else a
    if s.endswith(".US") and len(s) > 3:
        s = s[:-3]
    s = s.strip()
    if NUM_RE.match(s) or not pf.TICKER_RE.match(s) or looks_like_date(s):
        return None, ""
    if suffix and not s.endswith(suffix):
        s += suffix
        return s, "%s read as %s" % (given, s)
    return s, ""


def clean_ticker(text):
    """A Yahoo-style symbol, upper-cased, or None (see split_ticker)."""
    return split_ticker(text)[0]


# ---------------------------------------------------------------- free lines
def join_month_dates(toks):
    """["MSFT", "5", "Mar", "1", "2024"] -> ["MSFT", "5", "Mar 1 2024"]: a
    month word with its day and 4-digit year becomes one date token
    ("Mar 1 2024" or "1 Mar 2024"). Only a real, past day is joined, and an
    upper-case month word before any ticker stays a ticker ("DEC 12 1500" is
    12 shares of DEC at 1500)."""
    out = list(toks)
    i = 0
    seen_ticker = False
    while i < len(out):
        w = out[i]
        if month_of(w) and not (w.strip(".,") == w.strip(".,").upper() and not seen_ticker):
            nxt = out[i + 1] if i + 1 < len(out) else ""
            nxt2 = out[i + 2] if i + 2 < len(out) else ""
            prev = out[i - 1] if i > 0 else ""
            if DAY_RE.match(nxt) and YEAR_RE.match(nxt2) and clean_date(" ".join(out[i:i + 3])):
                out[i:i + 3] = [" ".join(out[i:i + 3])]
            elif i > 0 and DAY_RE.match(prev) and YEAR_RE.match(nxt) and clean_date(" ".join(out[i - 1:i + 2])):
                out[i - 1:i + 2] = [" ".join(out[i - 1:i + 2])]
                i -= 1
        elif not seen_ticker and clean_number(w) is None and split_ticker(w)[0]:
            seen_ticker = True
        i += 1
    return out


def parse_free_line(line):
    """One or more holdings from a free-form line -> list of row dicts
    (ok / note filled in)."""
    out = []
    text = line.strip()
    if not text:
        return out
    # "KO 10, MSFT 5" / "10 KO, 5 MSFT" / "KO 10; MSFT 5": split where a
    # separator is followed by the next holding
    chunks = []
    for part in re.split(r"\s*;\s*", text):
        chunks.extend(COMMA_SPLIT.split(part) if len(part) <= COMMA_SPLIT_MAX else [part])
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
        toks = join_month_dates(toks)
        if not toks:
            continue
        ticker, shares, cost, dt = None, None, None, None
        expect = None
        notes = []
        unclear = two = bad_date = False
        after_unknown = False       # the previous token was a word that got "'x' ignored"
        for k, raw in enumerate(toks):
            was_unknown, after_unknown = after_unknown, False
            low = raw.lower().strip(":")
            if low in PRICE_PREFIX:
                expect = "cost"
                continue
            if low in DATE_PREFIX:
                expect = "date"
                continue
            if low in ("x", "×", "shares", "sh", "units", "of"):
                continue
            if ticker is not None and low in CURRENCY_WORDS:
                continue
            d = clean_date(raw)
            if d is None and looks_like_date(raw):
                bad_date = True                 # "on 2031-01-01": a typo, not today
                expect = None
                continue
            if d and (expect in (None, "date")):
                dt = d
                expect = None
                continue
            n = clean_number(raw.lstrip("@"))
            if n is not None:
                if expect == "cost" or (shares is not None and cost is None):
                    cost = n
                    if was_unknown and expect != "cost":
                        unclear = True          # "KO 10 blah 50": is 50 the price?
                elif shares is None:
                    shares = n
                else:
                    notes.append("extra number %s ignored" % raw)
                expect = None
                continue
            tk, tk_note = split_ticker(raw)
            nxt = toks[k + 1] if k + 1 < len(toks) else ""
            if tk and ticker is None:
                ticker = tk
                if tk_note:
                    notes.append(tk_note)
            elif tk and (shares is not None or cost is not None) and raw == raw.upper() \
                    and clean_number(nxt.lstrip("@")) is not None:
                two = True                      # "MSFT 5 at 50 KO 1"
            elif ticker is not None:
                notes.append("'%s' ignored" % raw)
                after_unknown = True
            expect = None
        fail = None
        if bad_date:
            fail = "date in the future or not a real date — check it"
        elif two:
            fail = "two stocks on one line — put each on its own line"
        elif unclear:
            fail = "price unclear — write it as %s 10 at 50" % (ticker or "KO")
        out.append(make_row(ticker, shares, cost, dt, notes, chunk.strip(), fail=fail))
    return out


def make_row(ticker, shares, cost, dt, notes, text, fail=None):
    """A row dict; fail (a note) marks a row that looks like a holding but
    is not imported because a part of it is a guess."""
    row = {"ticker": ticker, "shares": shares, "cost": cost, "date": dt, "ok": False, "note": "", "text": text[:80]}
    if ticker is None:
        row["note"] = "no ticker found"
    elif isinstance(fail, str) and fail:
        row["note"] = fail
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
    """-> [(delimiter, rows), ...] for CSV-looking text, the likeliest first
    (most fields per line; ";" before tab, "|" and "," on a tie, so
    "KO;1,000" splits on ";"), or [] when nothing looks like a CSV."""
    lines = [ln for ln in text.splitlines()[:40] if ln.strip()]
    found = []
    for order, d in enumerate((";", "\t", "|", ",")):
        counts = [ln.count(d) for ln in lines]
        with_d = [c for c in counts if c >= 1]
        # most lines carry the delimiter (a heading like "Account: 1234" or a
        # blank line above the header is fine) and at least two of them do
        if len(with_d) >= 2 and len(with_d) >= 0.6 * len(lines):
            found.append((-sum(with_d) / len(with_d), order, d))
    found.sort()
    out = []
    for _, _, d in found:
        try:   # a delimiter the csv module trips over (an unclosed quote) is dropped
            out.append((d, list(csv.reader(io.StringIO(text), delimiter=d))))
        except csv.Error:
            continue
    return out


def header_roles(c):
    """-> {role: score} for one lower-cased header cell (higher = better;
    a cost "tier 2" names what was paid, tier 1 is a bare price / cost)."""
    roles = {}
    if c in TICKER_WORDS or c.endswith((" symbol", " ticker")):
        roles["ticker"] = 2 if c in TICKER_WORDS else 1
    if c in SHARE_WORDS or c.startswith(("quantity", "qty", "shares", "units")):
        roles["shares"] = 2 if c in SHARE_WORDS else 1
    if c in DATE_WORDS or c.endswith(" date") or c.startswith("date "):
        roles["date"] = 2 if c in DATE_WORDS else 1
    if (c in COST_WORDS or any(c.startswith(w + " ") for w in ("avg", "average"))
            or c.endswith(("/share", " per share", " price", " cost"))) \
            and not c.startswith(MARKET_PREFIX) and c not in TOTAL_WORDS:
        roles["cost"] = 1 if c in ("price", "cost") or not any(w in c for w in COST_TIER2) else 2
    if (c in TOTAL_WORDS or c.endswith((" value", " basis"))) and not c.startswith(("market", "current", "mkt")):
        roles["total"] = 2 if c in TOTAL_WORDS else 1
    return roles


def find_header(rows):
    """(index, column map, price_guess) of the header row (within the first
    10 rows), or (None, {}, False) when no cell names a ticker column. Each
    cell serves one role; per role the best-named cell wins, the leftmost
    on a tie. price_guess: the price is a bare "Price" column while the file
    also has a market / last / current price column."""
    for i, row in enumerate(rows[:10]):
        cells = [c.strip().lower().strip('"') for c in row]
        roles = [header_roles(c) if c else {} for c in cells]
        cols, used = {}, set()
        for role in ("ticker", "shares", "date", "cost", "total"):
            best = None
            for j, r in enumerate(roles):
                if j in used or role not in r:
                    continue
                if best is None or r[role] > roles[best][role]:
                    best = j
            if best is not None:
                cols[role] = best
                used.add(best)
        if "ticker" in cols:
            price_guess = "cost" in cols and roles[cols["cost"]]["cost"] == 1 and \
                any(c.startswith(MARKET_PREFIX) for j, c in enumerate(cells) if j != cols["cost"])
            return i, cols, price_guess
    return None, {}, False


def parse_csv_rows(rows, delim, header=None):
    """-> (row dicts, column map). header: find_header(rows) when known."""
    header_i, cols, price_guess = header if header is not None else find_header(rows)
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
        ticker, tk_note = split_ticker(cell("ticker"))
        shares = clean_number(cell("shares"))
        cost = clean_number(cell("cost")) if cols.get("cost") is not None else None
        notes = [tk_note] if tk_note else []
        if cost is None and cols.get("total") is not None and shares:
            total = clean_number(cell("total"))
            if total is not None and total > 0:
                cost = total / shares
                notes.append("price = %s ÷ shares" % cell("total"))
        elif cost is not None and price_guess:
            notes.append('used the "Price" column as what you paid — check it')
        dt = clean_date(cell("date")) if cols.get("date") is not None else None
        fail = None
        if cols.get("date") is not None and cell("date") and dt is None:
            if looks_like_date(cell("date")):
                fail = "date in the future or not a real date — check it"
            else:
                notes.append("date '%s' not understood" % cell("date")[:20])
        r = make_row(ticker, shares, cost, dt, notes, text, fail=fail)
        r["line"] = line_no
        out.append(r)
    return out, cols


def parse_lines(text):
    out = []
    for i, line in enumerate(text.split("\n"), 1):
        if not line.strip() or line.strip().startswith("#"):
            continue
        for r in parse_free_line(line):
            r["line"] = i
            out.append(r)
    return out


def parse_text(text):
    """-> (rows, format, columns). A CSV with a header row is read as a CSV;
    without one, the free-form reading wins unless the CSV reading finds at
    least as many holdings ("ITW 1, MSFT 2" and "KO 1,000" are lines)."""
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    if text.startswith("\ufeff"):
        text = text[1:]
    cands = sniff(text)
    pick = None
    for delim, rows in cands:
        header = find_header(rows)
        if header[0] is not None:
            pick = (delim, rows, header)
            break
    if pick is None and cands:
        pick = (cands[0][0], cands[0][1], (None, {}, False))
    if pick is None:
        return parse_lines(text), "lines", {}
    delim, rows, header = pick
    parsed, cols = parse_csv_rows(rows, delim, header)
    csv_ok = sum(1 for r in parsed if r["ok"])
    lines = parse_lines(text)
    lines_ok = sum(1 for r in lines if r["ok"])
    if header[0] is not None:
        keep_csv = csv_ok > 0 or lines_ok == 0
    else:
        keep_csv = csv_ok > 0 and csv_ok >= lines_ok
    if keep_csv:
        return parsed, "csv", dict(cols)
    return lines, "lines", {}


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
        # UTF-16 only with a byte-order mark or many NUL bytes: an even-length
        # Windows (cp1252) file also "decodes" as UTF-16, into nonsense
        if data[:2] in (b"\xff\xfe", b"\xfe\xff") or data.count(b"\x00") >= max(1, len(data) // 5):
            encodings = ("utf-16", "utf-8-sig", "cp1252", "latin-1")
        else:
            encodings = ("utf-8-sig", "cp1252", "latin-1")
        for enc in encodings:
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
    try:
        rows, fmt, cols = parse_text(text)
    except csv.Error:
        reply({"error": "the file has a line the widget cannot read (an unclosed quote?)"}, 1)
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
