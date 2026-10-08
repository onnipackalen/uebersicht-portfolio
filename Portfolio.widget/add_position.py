#!/usr/bin/env python3
"""
add_position.py — record a buy in positions.json (the widget's "buy" button
runs this too).

    python3 add_position.py MSFT 10                        # 10 shares, today
    python3 add_position.py SHOP.TO --amount 1000          # 1000 worth, at today's price
    python3 add_position.py MSFT 10 --cost 150 --date 2025-01-02
    python3 add_position.py MSFT 10 --theme "Big tech"
    python3 add_position.py --set-invested 25000           # money you've put in

Any symbol Yahoo Finance lists works (SHOP.TO, VOD.L, 7203.T, BTC-USD...);
ticker_lookup.py search "name" finds one. A new ticker gets its own entry;
an existing one gets another lot (older entry shapes are converted first;
nothing is overwritten). Without --cost the tracker uses that day's closing
price as your cost, marked ≈ in the widget until you fill in the real price.
--amount is in the widget's display currency and needs yfinance to look up
the price. If "_invested" is set, the cost of the buy is added to it. The
widget refreshes a few seconds later.
"""

import argparse
import os
from datetime import datetime

import portfolio_file as pf


def add_lot(raw, ticker, lot, theme=None):
    """Append one purchase (`lot` = {"shares", "date"[, "avgCost"]}) to the
    ticker's entry in the loaded positions file, converting the older entry
    shapes (a bare share count, or {"shares", "avgCost", "purchaseDate"}) to
    the lots shape first; nothing is overwritten. Returns "added" for a new
    ticker, "added a lot to" otherwise. import_positions.py uses this too.
    Raises ValueError for an entry shape it does not know."""
    entry = raw.get(ticker)
    if entry is None:
        raw[ticker] = {"lots": [lot]}
        if theme:
            raw[ticker]["theme"] = theme
        return "added"
    if isinstance(entry, (int, float)) and not isinstance(entry, bool):
        raw[ticker] = {"lots": [{"shares": float(entry)}, lot]}
        return "added a lot to"
    if isinstance(entry, dict) and "lots" in entry:
        entry["lots"].append(lot)
        if theme:
            entry["theme"] = theme
        return "added a lot to"
    if isinstance(entry, dict) and "shares" in entry:
        old_lot = {"shares": float(entry["shares"])}
        if entry.get("purchaseDate"):
            old_lot["date"] = entry["purchaseDate"]
        if entry.get("avgCost") is not None:
            old_lot["avgCost"] = float(entry["avgCost"])
        new_entry = {k: v for k, v in entry.items()
                     if k in ("theme", "currency")}
        new_entry["lots"] = [old_lot, lot]
        if theme:
            new_entry["theme"] = theme
        raw[ticker] = new_entry
        return "added a lot to"
    raise ValueError("unrecognized entry shape for %s" % ticker)


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    ap = argparse.ArgumentParser()
    ap.add_argument("ticker", nargs="?", default=None)
    ap.add_argument("shares", nargs="?", default=None)
    ap.add_argument("--amount", default=None,
                    help="buy this much (display currency) instead of a share count")
    ap.add_argument("--cost", default=None,
                    help="price you paid per share (omit: that day's close)")
    ap.add_argument("--date", default=None, help="YYYY-MM-DD (default: today)")
    ap.add_argument("--theme", default=None)
    ap.add_argument("--rate", default=None, help=argparse.SUPPRESS)  # from the + form's lookup
    ap.add_argument("--set-invested", default=None, metavar="AMOUNT",
                    help="total money you've put in, in the widget's currency; "
                         "used by the 'vs invested' P&L view")
    ap.add_argument("--positions", default=os.path.join(here, "positions.json"))
    args = ap.parse_args()

    if args.set_invested is not None:
        amount = pf.positive_number(args.set_invested, "--set-invested")
        raw = pf.load(args.positions, create=True)
        raw["_invested"] = amount
        pf.save(args.positions, raw)
        pf.request_refresh(args.positions)
        print("invested set to %s — refreshing" % amount)
        return

    if args.ticker is None or (args.shares is None and args.amount is None):
        pf.fail("need TICKER and SHARES, TICKER --amount MONEY, or --set-invested AMOUNT")
    ticker = pf.ticker_arg(args.ticker)
    cost = pf.positive_number(args.cost, "--cost") if args.cost is not None else None
    today = datetime.now().strftime("%Y-%m-%d")
    date_str = (args.date or today).strip()
    try:
        if not pf.DATE_RE.match(date_str):
            raise ValueError
        datetime.strptime(date_str, "%Y-%m-%d")
    except ValueError:
        pf.fail("--date must be YYYY-MM-DD")

    rate = pf.positive_number(args.rate, "--rate") if args.rate is not None else None
    if args.amount is not None:
        # money -> shares at the current price (needs yfinance)
        money = pf.positive_number(args.amount, "--amount")
        try:
            import yfinance
            from ticker_lookup import quote
        except ImportError:
            pf.fail("--amount needs yfinance to look up the price; give a share count instead")
        q = quote(ticker, args.positions, yfinance)
        if q.get("error"):
            pf.fail(q["error"])
        if not q.get("displayRate"):
            pf.fail("no exchange rate for %s; give a share count instead" % q.get("currency"))
        per_share = cost if cost is not None else q["price"]
        rate = q["displayRate"]
        shares = round(money / (per_share * rate), 6)
        if cost is None and date_str == today:
            cost = q["price"]        # bought now, at the current price
    else:
        shares = pf.positive_number(args.shares, "shares")

    raw = pf.load(args.positions, create=True)
    lot = {"shares": shares, "date": date_str}
    if cost is not None:
        lot["avgCost"] = cost
    try:
        action = add_lot(raw, ticker, lot, args.theme)
    except ValueError as e:
        pf.fail(str(e))

    # the buy's cost goes into _invested (money put in)
    note = ""
    if raw.get("_invested") is not None:
        per_share = cost if cost is not None else pf.last_price(args.positions, ticker)
        spent = (pf.to_display(args.positions, ticker, per_share, shares, rate)
                 if per_share is not None else None)
        if spent is not None:
            raw["_invested"] = round(float(raw["_invested"]) + spent, 2)
            note = " — invested +%s%.2f (now %s)" % (
                "" if cost is not None else "~", spent, raw["_invested"])
        else:
            note = " — invested unchanged (no price yet; use --set-invested)"

    pf.save(args.positions, raw)
    pf.request_refresh(args.positions)
    basis = "cost %s" % cost if cost is not None else "cost ≈ that day's close"
    print("%s %s: %s sh on %s (%s)%s — refreshing"
          % (action, ticker, shares, date_str, basis, note))


if __name__ == "__main__":
    main()
