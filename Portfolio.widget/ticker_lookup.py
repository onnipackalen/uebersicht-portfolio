#!/usr/bin/env python3
"""
ticker_lookup.py — find and check stocks for the widget's + form. Prints
one JSON object. Needs yfinance (widget_command.sh picks the right Python).

    python3 ticker_lookup.py search "shopify"    # matches by name or ticker
    python3 ticker_lookup.py quote SHOP.TO       # name, price, currency, ...
    python3 ticker_lookup.py look SHOP.TO        # + price history for charts
    python3 ticker_lookup.py news SHOP.TO        # 3 latest headlines (only
                                                 # with _settings.news true)

Anything Yahoo Finance lists works: US and foreign stocks (SHOP.TO, VOD.L,
7203.T, M&M.NS), ETFs, funds, crypto (BTC-USD), futures (GC=F).
"""

import argparse
import json
import math
import os
import sys

from portfolio_file import TICKER_RE, held_shares
from portfolio_tracker import (SPARK_DAYS, compute_changes, date_to_close_epoch,
                               fetch_one, infer_currency, load_settings,
                               news_for, now_epoch, resolve_currency, rnd,
                               split_currency, volatility)

SEARCH_TYPES = {"EQUITY", "ETF", "MUTUALFUND", "CRYPTOCURRENCY", "INDEX",
                "FUTURE", "CURRENCY"}


def out(obj):
    print(json.dumps(obj, allow_nan=False))


def read_json(path):
    try:
        with open(path) as f:
            return json.load(f)
    except Exception:
        return None


def holdings(positions_path):
    raw = read_json(positions_path) or {}
    return {k: held_shares(v) for k, v in raw.items()
            if not k.startswith("_") and held_shares(v)}


def watched(positions_path):
    raw = read_json(positions_path) or {}
    return [str(w).upper() for w in raw.get("_watch") or [] if isinstance(w, str)]


def cache_path(positions_path, name):
    return os.path.join(os.path.dirname(os.path.abspath(positions_path)),
                        ".cache", name)


def display_rate(cur, positions_path, yf):
    """(display currency, value of one unit of `cur` in it or None)."""
    cache = read_json(cache_path(positions_path, "data.json")) or {}
    display = cache.get("currency")
    if not display:
        display = resolve_currency(load_settings(read_json(positions_path) or {})["currency"])
    iso, mult = split_currency(cur)
    rate = 1.0 if iso == display else (cache.get("fxRates") or {}).get(iso)
    if rate is None:
        try:
            rate = last_close(yf.Ticker("%s%s=X" % (iso, display)).history(
                period="5d", interval="1d", auto_adjust=False))
        except Exception:
            rate = None
    return display, (round(rate * mult, 8) if rate else None)


def search(query, positions_path, yf):
    held = holdings(positions_path)
    try:
        found = yf.Search(query, max_results=10, news_count=0, timeout=10).quotes
    except Exception as e:
        return {"query": query, "results": [], "error": "search failed: %s" % e}
    results = []
    for q in found or []:
        sym = (q.get("symbol") or "").upper()
        if not sym or not TICKER_RE.match(sym):
            continue
        if q.get("quoteType") and q["quoteType"] not in SEARCH_TYPES:
            continue
        results.append({
            "symbol": sym,
            "name": (q.get("longname") or q.get("shortname") or "").strip(),
            "exchange": q.get("exchDisp") or q.get("exchange") or "",
            "type": q.get("typeDisp") or q.get("quoteType") or "",
            "held": held.get(sym),
        })
    return {"query": query, "results": results[:6]}


def last_close(frame):
    for _, row in frame.iloc[::-1].iterrows():
        c = row.get("Close")
        if c is not None and not (isinstance(c, float) and math.isnan(c)):
            return float(c)
    return None


def quote(symbol, positions_path, yf):
    """Name, price and currency of one symbol, plus displayRate: what one
    unit of its quote currency is worth in the widget's display currency
    (so the form can turn "$1000" into a share count)."""
    t = yf.Ticker(symbol)
    try:
        frame = t.history(period="5d", interval="1d", auto_adjust=False)
    except Exception as e:
        return {"symbol": symbol, "error": "lookup failed: %s" % e}
    price = last_close(frame) if frame is not None and not frame.empty else None
    if price is None:
        return {"symbol": symbol,
                "error": "Yahoo has no prices for %s — try searching by name" % symbol}
    try:
        md = t.history_metadata or {}
    except Exception:      # raises for some symbols with sparse metadata
        md = {}
    live = md.get("regularMarketPrice")
    if isinstance(live, (int, float)) and math.isfinite(live) and live > 0:
        price = float(live)
    cur = md.get("currency") or infer_currency(symbol)
    display, rate = display_rate(cur, positions_path, yf)

    return {
        "symbol": symbol,
        "name": md.get("longName") or md.get("shortName") or "",
        "exchange": md.get("fullExchangeName") or md.get("exchangeName") or "",
        "type": md.get("instrumentType") or "",
        "currency": cur,
        "price": round(price, 6),
        "displayCurrency": display,
        "displayRate": rate,
        "held": holdings(positions_path).get(symbol),
    }


def look(symbol, positions_path, yf):
    """Everything the widget's detail view shows for one ticker — held,
    watched or just looked up: price, changes, volatility score and full-
    resolution series for the 1D/1W/1M/3M/1Y chart tabs. Daily/hourly bars
    come from the widget's bars cache when it has them (one request instead
    of three)."""
    bars = (read_json(cache_path(positions_path, "bars.json")) or {}).get(symbol)
    try:
        r = fetch_one(symbol, yf, bars, want_currency=True)
    except Exception:
        return {"symbol": symbol,
                "error": "Yahoo has no prices for %s — try searching by name" % symbol}
    price = r["price"]
    prev_close = r.get("prevClose") or price
    day_pct = (price / prev_close - 1) * 100 if prev_close else None
    vol, score = volatility([c for _, c in r["daily"]])
    meta = (read_json(cache_path(positions_path, "ticker_meta.json")) or {}).get(symbol) or {}
    try:
        md = yf.Ticker(symbol).history_metadata or {}
    except Exception:
        md = {}
    cur = r.get("currency") or md.get("currency") or meta.get("currency") or infer_currency(symbol)
    display, rate = display_rate(cur, positions_path, yf)
    week_ago = now_epoch() - 7 * 86400
    daily_pts = [[date_to_close_epoch(d), rnd(c)] for d, c in r["daily"]]
    return {
        "symbol": symbol,
        "name": md.get("longName") or md.get("shortName") or meta.get("name") or "",
        "exchange": md.get("fullExchangeName") or md.get("exchangeName") or "",
        "currency": cur, "displayCurrency": display, "displayRate": rate,
        "price": rnd(price), "prevClose": rnd(prev_close),
        "dayChangePct": rnd(day_pct), "dayChange": rnd(price - prev_close),
        "changes": compute_changes(r, price, day_pct),
        "volPct": rnd(vol, 1), "volScore": score,
        "earningsDate": meta.get("earnings"),
        "dividendRate": meta.get("dividendRate"),
        "spark": [rnd(c) for _, c in r["daily"]][-SPARK_DAYS:],
        "series": {                       # [[epoch, close], ...] at full resolution
            "1D": [[t, rnd(c)] for t, c in r["intraday"]],
            "1W": [[t, rnd(c)] for t, c in r["hourly"] if t >= week_ago],
            "1M": [[t, rnd(c)] for t, c in r["hourly"]],
            "3M": daily_pts[-63:],
            "1Y": daily_pts[-252:],       # the bars cache can reach further back
        },
        "held": holdings(positions_path).get(symbol),
        "watched": symbol in watched(positions_path),
        "stale": bool(r.get("stale")),
    }


def news_enabled(positions_path):
    """_settings.news is exactly true (anything else = off)."""
    raw = read_json(positions_path)
    s = raw.get("_settings") if isinstance(raw, dict) else None
    return isinstance(s, dict) and s.get("news") is True


def news(symbol, positions_path, yf):
    """The latest headlines of one ticker (news.json, fetched again after
    30 min): {ticker, on, items [{title, source, time, url}], t, cached,
    error null | "no headlines right now" | "news unavailable"}."""
    items, t, cached, failed = news_for(
        symbol, yf, os.path.dirname(cache_path(positions_path, "news.json")))
    return {"ticker": symbol, "on": True, "items": items, "t": t, "cached": cached,
            "error": "news unavailable" if failed
            else None if items else "no headlines right now"}


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    ap = argparse.ArgumentParser()
    ap.add_argument("action", choices=["search", "quote", "look", "news"])
    ap.add_argument("text")
    ap.add_argument("--positions", default=os.path.join(here, "positions.json"))
    args = ap.parse_args()
    if args.action == "news":
        # settings first: with news off, no yfinance import and no request
        sym = args.text.upper().strip()
        if not TICKER_RE.match(sym):
            out({"ticker": sym[:40], "error": "that doesn't look like a ticker"})
            return
        if not news_enabled(args.positions):
            out({"ticker": sym, "on": False, "items": []})
            return
    try:
        import yfinance as yf
    except ImportError:
        out({"error": "yfinance isn't installed — run install.sh (see README)"})
        return
    if args.action == "search":
        query = " ".join(args.text.split())[:60]
        out(search(query, args.positions, yf) if len(query) >= 1
            else {"query": query, "results": []})
    else:
        sym = args.text.upper().strip()
        if not TICKER_RE.match(sym):
            out({"symbol": sym, "error": "that doesn't look like a ticker — try searching by name"})
            return
        out(quote(sym, args.positions, yf) if args.action == "quote"
            else news(sym, args.positions, yf) if args.action == "news"
            else look(sym, args.positions, yf))


if __name__ == "__main__":
    main()
