#!/usr/bin/env python3
"""
remove_position.py — record a sale in positions.json (the widget's "sell"
button runs this too).

    python3 remove_position.py MSFT 5                # sell 5 shares
    python3 remove_position.py MSFT 5 --price 190    # ...at the price you got
    python3 remove_position.py MSFT --all            # close the position
    python3 remove_position.py --reset-all           # start over: no holdings

Lots are sold oldest-first (undated lots count as oldest), so the cost of
what you still hold stays right. Selling more than you own is an error.
If "_invested" is set, the sale proceeds (--price, else the last price) come
back out of it — the mirror of add_position.py adding each buy — so the
"vs invested" P&L doesn't drop by the whole sale amount.

Each sale is also appended to "_realized" (ticker, date, shares, price,
proceeds, basis, gain in the stock's own currency, plus the display-currency
values at the day's rate). A lot's cost is its avgCost, else the close the
tracker derived for its date; when any sold lot has no known cost, basis and
gain are null. No fees are counted.

--reset-all keeps only your "_settings" (the sales log goes with the old
holdings), saves the old file as
positions.backup-<date-time>.json and sets the value history aside too, so
the graph doesn't mix the old portfolio with the new one.
"""

import argparse
import math
import os
import re
from datetime import datetime
from zoneinfo import ZoneInfo

import portfolio_file as pf


def to_lots(entry):
    if isinstance(entry, (int, float)):
        return [{"shares": float(entry)}], {}
    if isinstance(entry, dict) and "lots" in entry:
        extras = {k: v for k, v in entry.items() if k != "lots"}
        return [dict(l) for l in entry["lots"]], extras
    if isinstance(entry, dict) and "shares" in entry:
        lot = {"shares": float(entry["shares"])}
        if entry.get("purchaseDate"):
            lot["date"] = entry["purchaseDate"]
        if entry.get("avgCost") is not None:
            lot["avgCost"] = float(entry["avgCost"])
        extras = {k: v for k, v in entry.items() if k in ("theme", "currency")}
        return [lot], extras
    pf.fail("unrecognized entry shape")


def lot_cost(path, ticker, lot):
    """Per-share cost of one lot (quote currency): its avgCost, else the
    close the tracker derived for its date, else None (unknown)."""
    v = lot.get("avgCost")
    if v is not None:
        try:
            v = float(v)
            if math.isfinite(v) and v >= 0:
                return v
        except (TypeError, ValueError):
            pass
        return None
    return pf.derived_cost(path, ticker, lot.get("date"))


def sale_record(path, ticker, entry, sold, price, slices):
    """The _realized record for one sale and the summary clause for it.
    Amounts in the stock's quote currency; *Display = native x fxRate."""
    if price is None:
        price = pf.last_price(path, ticker)
        try:
            price = float(price) if price is not None else None
        except (TypeError, ValueError):
            price = None
        if price is not None and (not math.isfinite(price) or price <= 0):
            price = None
    proceeds = price * sold if price is not None else None
    basis = None
    if all(s["cost"] is not None for s in slices):
        basis = sum(s["cost"] * s["shares"] for s in slices)
    gain = proceeds - basis if proceeds is not None and basis is not None else None
    currency = pf.quote_currency(path, ticker, entry)
    rate = pf.to_display(path, ticker, 1.0, 1.0)

    def r(x, p):
        return round(x, p) if x is not None else None

    def disp(x):
        return round(x * rate, 2) if x is not None and rate is not None else None

    record = {
        "ticker": ticker,
        # the market's (New York) date, the tracker's day: a late-evening or
        # after-midnight sale then lands on the day the tracker counts it in
        "date": datetime.now(ZoneInfo("America/New_York")).strftime("%Y-%m-%d"),
        "shares": r(sold, 6), "price": r(price, 6),
        "proceeds": r(proceeds, 4), "basis": r(basis, 4), "gain": r(gain, 4),
        "currency": currency, "displayCurrency": pf.display_currency(path),
        "fxRate": r(rate, 6),
        "proceedsDisplay": disp(proceeds), "basisDisplay": disp(basis),
        "gainDisplay": disp(gain),
        "lots": [{"date": s["date"], "shares": r(s["shares"], 6),
                  "cost": r(s["cost"], 6)} for s in slices],
    }
    if gain is not None:
        text = " — realized %+.2f %s" % (round(gain, 2) or 0.0, currency)
    elif proceeds is None:
        text = " — realized gain unknown (no sale price)"
    else:
        text = " — realized gain unknown (no purchase price)"
    return record, text


def reset_all(path):
    raw = pf.load(path)
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    backup = os.path.join(os.path.dirname(os.path.abspath(path)),
                          "positions.backup-%s.json" % stamp)
    pf.save(backup, raw)
    fresh = {k: v for k, v in raw.items() if k == "_settings"}
    pf.save(path, fresh)
    cache = pf.cache_dir(path)
    # history.<CUR>.jsonl: the recorded values from before a currency switch
    stashed = sorted(n for n in (os.listdir(cache) if os.path.isdir(cache) else [])
                     if re.match(r"^history\.[A-Z]{3}\.jsonl$", n))
    for name in ["history.jsonl", "alerts_log.jsonl"] + stashed:
        src = os.path.join(cache, name)
        if os.path.exists(src):
            base, ext = os.path.splitext(name)
            os.replace(src, os.path.join(cache, "%s.backup-%s%s" % (base, stamp, ext)))
    pf.request_refresh(path)
    print("cleared — old holdings saved as %s" % os.path.basename(backup))


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    ap = argparse.ArgumentParser()
    ap.add_argument("ticker", nargs="?", default=None)
    ap.add_argument("shares", nargs="?", default=None)
    ap.add_argument("--all", action="store_true", dest="close_all")
    ap.add_argument("--price", default=None,
                    help="sale price per share (omit: the last price)")
    ap.add_argument("--reset-all", action="store_true",
                    help="remove every holding (the old file is backed up)")
    ap.add_argument("--positions", default=os.path.join(here, "positions.json"))
    args = ap.parse_args()

    if args.reset_all:
        reset_all(args.positions)
        return

    if args.ticker is None:
        pf.fail("need TICKER and SHARES, TICKER --all, or --reset-all")
    ticker = pf.ticker_arg(args.ticker)
    shares = None
    if not args.close_all:
        if args.shares is None:
            pf.fail("give a share count, or --all to close the position")
        shares = pf.positive_number(args.shares, "shares")
    price = pf.positive_number(args.price, "--price") if args.price is not None else None

    raw = pf.load(args.positions)
    if ticker not in raw:
        pf.fail("%s is not in the positions file" % ticker)

    realized = raw.get("_realized", [])
    if not isinstance(realized, list):
        pf.fail("_realized in positions.json should be a list — fix or remove it")

    entry = raw[ticker]
    lots, extras = to_lots(entry)
    held = sum(float(l["shares"]) for l in lots)
    if not args.close_all and shares > held + 1e-9:
        pf.fail("you hold %.4f %s — can't sell %.4f" % (held, ticker, shares))
    sold = held if args.close_all else shares
    # FIFO: undated lots first, then by date
    order = sorted(range(len(lots)),
                   key=lambda i: (lots[i].get("date") is not None,
                                  lots[i].get("date") or ""))
    remaining = sold
    slices = []
    for i in order:
        if remaining <= 1e-9:
            break
        take = min(float(lots[i]["shares"]), remaining)
        slices.append({"date": lots[i].get("date"), "shares": take,
                       "cost": lot_cost(args.positions, ticker, lots[i])})
        lots[i]["shares"] = round(float(lots[i]["shares"]) - take, 6)
        remaining -= take
    record, realized_text = sale_record(args.positions, ticker, entry,
                                        sold, price, slices)
    realized.append(record)
    raw["_realized"] = realized

    if args.close_all:
        del raw[ticker]
        summary = "closed %s (%.4f sh)" % (ticker, held)
    else:
        lots = [l for l in lots if l["shares"] > 1e-9]
        if not lots:
            del raw[ticker]
            summary = "sold %.4f %s — position closed" % (shares, ticker)
        else:
            new_entry = dict(extras)
            new_entry["lots"] = lots
            raw[ticker] = new_entry
            summary = "sold %.4f %s — %.4f sh left" % (
                shares, ticker, sum(float(l["shares"]) for l in lots))
    summary += realized_text

    # the proceeds come back out of _invested
    if raw.get("_invested") is not None and sold:
        per_share = price if price is not None else pf.last_price(args.positions, ticker)
        got = (pf.to_display(args.positions, ticker, per_share, sold)
               if per_share is not None else None)
        if got is not None:
            raw["_invested"] = round(float(raw["_invested"]) - got, 2)
            summary += " — invested −%s%.2f (now %s)" % (
                "" if price is not None else "~", got, raw["_invested"])
        else:
            summary += " — invested unchanged (no price known; " \
                       "use add_position.py --set-invested)"

    pf.save(args.positions, raw)
    pf.request_refresh(args.positions)
    print(summary + " — refreshing")


if __name__ == "__main__":
    main()
