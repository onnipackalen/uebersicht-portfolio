#!/usr/bin/env python3
"""
watchlist.py — monitor stocks you don't hold (the widget's "watch" button).

    python3 watchlist.py add SHOP.TO
    python3 watchlist.py remove SHOP.TO
    python3 watchlist.py list

Watched tickers live in positions.json under "_watch". They show up in the
widget's "watch" tab with price, day move, sparkline and volatility score,
and they trigger the same big-move alerts as holdings. Standard library only.
"""

import argparse
import os

import portfolio_file as pf


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    ap = argparse.ArgumentParser()
    ap.add_argument("action", choices=["add", "remove", "list"])
    ap.add_argument("ticker", nargs="?", default=None)
    ap.add_argument("--positions", default=os.path.join(here, "positions.json"))
    args = ap.parse_args()

    raw = pf.load(args.positions, create=True)
    watch = [str(w).upper() for w in raw.get("_watch") or [] if isinstance(w, str)]
    if args.action == "list":
        print(" ".join(watch) if watch else "(nothing watched)")
        return
    if args.ticker is None:
        pf.fail("need a TICKER")
    tk = pf.ticker_arg(args.ticker)
    if args.action == "add":
        if pf.held_shares(raw.get(tk)):
            pf.fail("%s is already in your holdings" % tk)
        if tk in watch:
            print("%s is already on the watchlist" % tk)
            return
        watch.append(tk)
        msg = "watching %s — refreshing" % tk
    else:
        if tk not in watch:
            pf.fail("%s isn't on the watchlist" % tk)
        watch.remove(tk)
        msg = "stopped watching %s" % tk
    if watch:
        raw["_watch"] = watch
    else:
        raw.pop("_watch", None)
    pf.save(args.positions, raw)
    pf.request_refresh(args.positions)
    print(msg)


if __name__ == "__main__":
    main()
