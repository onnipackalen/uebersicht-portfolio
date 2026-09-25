#!/usr/bin/env python3
"""
export.py — the portfolio as three CSV files for Numbers / Excel / a script
(widget_command.sh export runs this for the widget's footer "export" link).

    python3 export.py                      # -> ~/Documents/Portfolio/
    python3 export.py --out ~/Desktop/pf   # somewhere else
    PORTFOLIO_EXPORT_DIR=/some/dir python3 export.py

Output folder: --out, else $PORTFOLIO_EXPORT_DIR, else ~/Documents/Portfolio
(created when missing). Files, each replaced as a whole:

  holdings.csv      one row per purchase (lot) with its cost, then one CASH row
                    per _cash currency
  daily_values.csv  the full day-by-day table (.cache/daily_all.json): value,
                    money in, gain, index close
  sales.csv         the sales recorded in _realized (header only without any)

UTF-8 with a byte-order mark, comma separated, CRLF line ends, a header row,
ISO dates (YYYY-MM-DD), plain numbers ("." decimals, no currency signs or
thousands separators). Prices and costs per share are in the stock's quote
currency (GBp = pence); *_home columns are in the widget's display currency
at today's rate. Text starting with = + - @ gets a leading ' so a
spreadsheet never runs it as a formula.

Reads positions.json and the widget's last refresh (.cache/data.json,
daily_all.json, derived_basis.json); no network, writes nothing into the
widget folder. Prints one line of JSON and nothing else:
{"ok": true, "dir", "dirShown", "path", "files", "rows", "currency"} or
{"error": "..."} (exit 1). Standard library only, so any python3 can run it.
"""

import argparse
import csv
import errno
import json
import math
import os
import sys

import portfolio_file as pf
import portfolio_tracker as pt

FILES = ("holdings.csv", "daily_values.csv", "sales.csv")
HOLDINGS_HEADER = ["ticker", "name", "theme", "purchase_date", "shares", "cost_per_share",
                   "cost_total", "cost_source", "currency", "price", "value", "fx_rate",
                   "home_currency", "value_home", "cost_home", "gain_home", "gain_pct"]
DAILY_HEADER = ["date", "value", "money_in", "gain", "source", "index_close",
                "index_symbol", "currency"]
SALES_HEADER = ["date", "ticker", "shares", "price", "currency", "proceeds", "cost", "gain",
                "fx_rate", "home_currency", "proceeds_home", "cost_home", "gain_home",
                "purchase_dates"]
# decimals per kind of number
DP_SHARES, DP_COST, DP_PRICE, DP_FX, DP_MONEY, DP_PCT, DP_INDEX = 6, 6, 4, 6, 2, 2, 4
PRIVACY_HINT = ("allow Übersicht to use the Documents folder (System Settings "
                "› Privacy & Security › Files and Folders)")


def reply(obj, code=0):
    print(json.dumps(obj))
    sys.exit(code)


def fnum(x):
    """A finite float, or None (bools, text, NaN and infinities too)."""
    if x is None or isinstance(x, bool):
        return None
    try:
        x = float(x)
    except (TypeError, ValueError):
        return None
    return x if math.isfinite(x) else None


def num(x, dp):
    """Plain number text: '.' decimals, no exponent or separators, trailing
    zeros trimmed, -0 -> 0; None / non-finite -> empty cell."""
    x = fnum(x)
    if x is None:
        return ""
    s = "%.*f" % (dp, round(x, dp))
    if "." in s:
        s = s.rstrip("0").rstrip(".")
    return "0" if s in ("-0", "") else s


def text(v):
    """A text cell: whitespace runs -> one space, control characters dropped,
    a leading = + - @ neutralised with ' (spreadsheet formula injection)."""
    if v is None:
        return ""
    s = " ".join(str(v).split())
    s = "".join(ch for ch in s if ord(ch) >= 32 and not 127 <= ord(ch) < 160)
    if s[:1] in ("=", "+", "-", "@"):
        s = "'" + s
    return s


def mul(*xs):
    out = 1.0
    for x in xs:
        x = fnum(x)
        if x is None:
            return None
        out *= x
    return out


def sub(a, b):
    a, b = fnum(a), fnum(b)
    return None if a is None or b is None else a - b


def tilde(path):
    home = os.path.expanduser("~")
    if home and home != "/" and (path == home or path.startswith(home.rstrip("/") + "/")):
        return "~" + path[len(home.rstrip("/")):]
    return path


def out_dir(arg):
    d = (arg or "").strip() or (os.environ.get("PORTFOLIO_EXPORT_DIR") or "").strip()
    if not d:
        d = os.path.join(os.path.expanduser("~"), "Documents", "Portfolio")
    return os.path.abspath(os.path.expanduser(d))


def tcc_protected(folder):
    """True when folder is inside a macOS privacy-protected user folder."""
    home = os.path.realpath(os.path.expanduser("~"))
    f = os.path.realpath(folder)
    for sub in ("Documents", "Desktop", "Downloads"):
        base = os.path.join(home, sub)
        if f == base or f.startswith(base + os.sep):
            return True
    return False


def home_currency(raw, data):
    cur = data.get("currency")
    if isinstance(cur, str) and cur:
        return cur
    return pt.resolve_currency(pt.load_settings(raw)["currency"])


# ---------------------------------------------------------------- tables

def holdings_rows(path, positions, cash, data, home):
    """One row per lot (tickers a-z, lots in file order), then CASH rows."""
    rows_by_tk = {}
    for p in data.get("positions") or []:
        if isinstance(p, dict) and isinstance(p.get("ticker"), str) and not p.get("watch"):
            rows_by_tk.setdefault(p["ticker"], p)
    out = []
    for tk in sorted(positions):
        entry = positions[tk]
        drow = rows_by_tk.get(tk, {})
        cur = drow.get("currency")
        if not (isinstance(cur, str) and cur):
            cur = entry.get("currency") if isinstance(entry.get("currency"), str) \
                and entry.get("currency").strip() else pt.infer_currency(tk)
        cur = cur.strip()
        theme = drow.get("theme") or entry.get("theme")
        price, rate = fnum(drow.get("price")), fnum(drow.get("fxRate"))
        # data.json's price is rounded for display (2 dp), so shares x price
        # can miss the widget's value by cents: when the refresh saw the same
        # shares, each lot gets its share of the widget's own value instead
        # (the holdings then add up to the widget's total exactly)
        held = sum(lot["shares"] for lot in entry["lots"])
        row_value, row_shares = fnum(drow.get("value")), fnum(drow.get("shares"))
        per_share_home = (row_value / row_shares
                          if row_value is not None and row_shares and price is not None
                          and abs(held - row_shares) <= 1e-9 * max(1.0, abs(held)) else None)
        for lot in entry["lots"]:
            shares = lot["shares"]
            if lot.get("avgCost") is not None:
                cps, source = fnum(lot["avgCost"]), "entered"
            else:
                cps = pf.derived_cost(path, tk, lot.get("date"))
                # the close the tracker used as this lot's cost, else none:
                # the widget counts such a lot at today's price, the CSV
                # doesn't invent a cost
                source = "estimated" if cps is not None else "unknown"
            cost_total = mul(shares, cps)
            value = mul(shares, price)
            value_home = mul(shares, per_share_home) if per_share_home is not None \
                else mul(value, rate)
            cost_home = mul(cost_total, rate)
            gain_home = sub(value_home, cost_home)
            gain_pct = (gain_home / cost_home * 100
                        if gain_home is not None and cost_home else None)
            out.append([text(tk), text(drow.get("name")), text(theme), lot.get("date") or "",
                        num(shares, DP_SHARES), num(cps, DP_COST), num(cost_total, DP_MONEY),
                        source, text(cur), num(price, DP_PRICE), num(value, DP_MONEY),
                        num(rate, DP_FX), text(home), num(value_home, DP_MONEY),
                        num(cost_home, DP_MONEY), num(gain_home, DP_MONEY),
                        num(gain_pct, DP_PCT)])
    rates = data.get("fxRates") if isinstance(data.get("fxRates"), dict) else {}
    for iso in sorted(cash):
        rate = 1.0 if iso == home else fnum(rates.get(iso))
        out.append(["CASH", "cash", "", "", "", "", "", "", text(iso), "",
                    num(cash[iso], DP_MONEY), num(rate, DP_FX), text(home),
                    num(mul(cash[iso], rate), DP_MONEY), "", "", ""])
    return out


def daily_rows(path, data, home):
    """Every row of the full day table, oldest first:
    [date, epoch, value, approx, index level|null, money at work|null]."""
    table = pt.read_json(os.path.join(pf.cache_dir(path), "daily_all.json"), {})
    rows = table.get("rows") if isinstance(table, dict) else None
    rows = [r for r in rows if isinstance(r, list) and len(r) >= 4
            and isinstance(r[0], str) and pf.DATE_RE.match(r[0])] \
        if isinstance(rows, list) else []
    rows.sort(key=lambda r: r[0])
    steps = data.get("basisSteps")
    steps = [s for s in steps if isinstance(s, list) and len(s) >= 2
             and fnum(s[0]) is not None and fnum(s[1]) is not None] \
        if isinstance(steps, list) else []
    bench = data.get("benchmark")
    symbol = bench.get("symbol") if isinstance(bench, dict) else None
    symbol = symbol if isinstance(symbol, str) else ""
    out = []
    for r in rows:
        value = fnum(r[2])
        money_in = fnum(r[5]) if len(r) > 5 else None
        if money_in is None and steps and fnum(r[1]) is not None:
            money_in = fnum(pt.basis_at(steps, fnum(r[1])))
        idx = fnum(r[4]) if len(r) > 4 else None
        out.append([r[0], num(value, DP_MONEY), num(money_in, DP_MONEY),
                    num(sub(value, money_in), DP_MONEY),
                    "rebuilt" if r[3] else "recorded", num(idx, DP_INDEX),
                    text(symbol) if idx is not None else "", text(home)])
    return out


def sales_rows(raw, home):
    """_realized, dated sales oldest first (stable), undated ones last."""
    recs = pt.load_realized(raw)
    recs = sorted((r for r in recs if r["date"]), key=lambda r: r["date"]) + \
        [r for r in recs if not r["date"]]
    out = []
    for r in recs:
        dates = sorted({sl["date"] for sl in r["lots"] if sl["date"]})
        out.append([r["date"] or "", text(r["ticker"]), num(r["shares"], DP_SHARES),
                    num(r["price"], DP_PRICE), text(r["currency"]),
                    num(r["proceeds"], DP_MONEY), num(r["basis"], DP_MONEY),
                    num(r["gain"], DP_MONEY), num(r["fxRate"], DP_FX),
                    text(r["displayCurrency"] or home),
                    num(r["proceedsDisplay"], DP_MONEY), num(r["basisDisplay"], DP_MONEY),
                    num(r["gainDisplay"], DP_MONEY), "; ".join(dates)])
    return out


def write_csv(folder, name, header, rows):
    """<name>.tmp, then an atomic replace: a reader never sees half a file."""
    final = os.path.join(folder, name)
    tmp = final + ".tmp"
    try:
        with open(tmp, "w", encoding="utf-8-sig", newline="") as f:
            w = csv.writer(f)
            w.writerow(header)
            w.writerows(rows)
        os.replace(tmp, final)
    except BaseException:
        try:
            os.remove(tmp)
        except OSError:
            pass
        raise


# ---------------------------------------------------------------- main

class JsonArgs(argparse.ArgumentParser):
    """argparse's usage errors as JSON on stdout, like every other reply."""
    def error(self, message):
        reply({"error": message}, 1)


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    ap = JsonArgs(description="Write holdings, daily values and sales as CSV files.")
    ap.add_argument("--positions", default=os.path.join(here, "positions.json"))
    ap.add_argument("--out", default=None,
                    help="output folder (default: $PORTFOLIO_EXPORT_DIR, else "
                         "~/Documents/Portfolio)")
    args = ap.parse_args()

    path = os.path.abspath(os.path.expanduser(args.positions))
    if not os.path.exists(path):
        reply({"error": "no positions file yet"}, 1)
    try:
        with open(path, encoding="utf-8") as f:
            raw = json.load(f)
        if not isinstance(raw, dict):
            raise ValueError("it should contain a JSON object")
        positions, cash, _invested, _settings, _watch = pt.load_positions(path)
    except Exception as e:
        reply({"error": "could not read positions.json: %s" % e}, 1)

    data = pf.load_data(path)
    home = home_currency(raw, data)
    tables = (holdings_rows(path, positions, cash, data, home),
              daily_rows(path, data, home),
              sales_rows(raw, home))

    folder = out_dir(args.out)
    try:
        os.makedirs(folder, exist_ok=True)
        for name, header, rows in zip(FILES, (HOLDINGS_HEADER, DAILY_HEADER, SALES_HEADER),
                                      tables):
            write_csv(folder, name, header, rows)
    except OSError as e:
        msg = "[Errno %d] %s" % (e.errno, e.strerror) if e.errno and e.strerror else str(e)
        msg = "could not write to %s: %s" % (tilde(folder), msg)
        if e.errno in (errno.EPERM, errno.EACCES):
            msg += " — " + (PRIVACY_HINT if tcc_protected(folder) else "the folder is not writable")
        reply({"error": msg}, 1)

    reply({"ok": True, "dir": folder, "dirShown": tilde(folder),
           "path": os.path.join(folder, FILES[0]), "files": list(FILES),
           "rows": {"holdings": len(tables[0]), "daily": len(tables[1]),
                    "sales": len(tables[2])},
           "currency": home})


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except Exception as e:       # never a traceback instead of the JSON line
        reply({"error": "export failed: %s" % e}, 1)
