#!/usr/bin/env python3
"""
alerts.py — price alerts (the widget's "alert at…" box and × buttons).

    python3 alerts.py add MSFT above 400
    python3 alerts.py add MSFT below 300
    python3 alerts.py add MSFT pctFromCost -20%     # vs your average cost
    python3 alerts.py add '*' drawdownPct 15         # the whole portfolio
    python3 alerts.py remove MSFT:above:400          # or: remove MSFT above 400
    python3 alerts.py list [MSFT]

Alerts live in positions.json under "_alerts" as {"ticker": "MSFT",
"above": 400}. Each refresh checks them and sends a macOS notification once
per crossing; it re-arms when the price crosses back. An above/below alert
on a stock you neither hold nor watch also puts it on the watchlist, so it
gets a price. --json prints one line of JSON and nothing else. Standard
library only.
"""

import argparse
import contextlib
import io
import json
import math
import os
import sys

import portfolio_file as pf
from portfolio_tracker import (MAX_ALERTS, PRICE_ALERT_KINDS, infer_currency,
                               load_price_alerts, lot_date, num_text,
                               price_alert_rule)

KINDS = {k.lower(): k for k in PRICE_ALERT_KINDS}
PCT_KINDS = ("pctFromCost", "drawdownPct")


class Done(Exception):
    """A reply is ready: (obj for --json, text otherwise, exit code)."""


class Args(argparse.ArgumentParser):
    def error(self, message):
        raise Done({"error": message}, "error: " + message, 1)


def split_argv(argv):
    """--json / --positions P anywhere before a "--"; everything else is a
    word ("-20%" and "-12,5" are values, not options)."""
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


def kind_arg(text):
    kind = KINDS.get(str(text).strip().lower())
    if not kind:
        pf.fail("kind must be one of %s, got %r" % (", ".join(PRICE_ALERT_KINDS), text))
    return kind


def value_arg(text, kind):
    """A finite number from text: decimal comma ok, a trailing % for the
    percent kinds; float()'s "inf" / "nan" are refused."""
    s = str(text).strip()
    if kind in PCT_KINDS and s.endswith("%"):
        s = s[:-1].strip()
    try:
        v = float(s.replace(",", "."))
    except ValueError:
        v = float("nan")
    if not math.isfinite(v):
        pf.fail("the alert level must be a number, got %r" % text)
    return v


def ticker_for(text, kind):
    if str(text).strip() == "*":
        if kind != "drawdownPct":
            pf.fail("* (the whole portfolio) only takes drawdownPct")
        return "*"
    return pf.ticker_arg(text)


def cost_known(entry):
    """Every lot has a purchase price or a buy date (whose close stands in
    for it). A plain share count has neither: the tracker then uses today's
    price as the cost, so a % from cost would stay 0."""
    if not isinstance(entry, dict):
        return False
    lots = entry["lots"] if isinstance(entry.get("lots"), list) else [entry]
    return all(isinstance(l, dict) and (
        l.get("avgCost") is not None
        or lot_date(l.get("date" if "lots" in entry else "purchaseDate")))
        for l in lots)


def label(rule):
    return "%s %s %s" % (rule["ticker"], rule["kind"], num_text(rule["level"]))


def brief(rules):
    return [{"id": r["id"], "ticker": r["ticker"], "kind": r["kind"],
             "level": r["level"]} for r in rules]


def rule_id(words):
    """remove ID | remove TICKER KIND VALUE -> the id."""
    if len(words) == 1:
        parts = words[0].rsplit(":", 2)
        if len(parts) != 3:
            pf.fail("need an alert id like MSFT:above:400")
        words = parts
    if len(words) != 3:
        pf.fail("remove takes an id (MSFT:above:400) or TICKER KIND VALUE")
    kind = kind_arg(words[1])
    rule, err = price_alert_rule({"ticker": ticker_for(words[0], kind),
                                  kind: value_arg(words[2], kind)})
    if err:
        pf.fail(err)
    return rule["id"]


def quote_currency(data, ticker):
    for p in (data.get("positions") or []) + (data.get("watchlist") or []):
        if isinstance(p, dict) and p.get("ticker") == ticker \
                and isinstance(p.get("currency"), str):
            return p["currency"]
    return infer_currency(ticker)


def patch_data(positions, raw):
    """data.json priceAlerts in place: kept rules keep their status, new
    ones show "new" until the next refresh checks them."""
    rules, invalid = load_price_alerts(raw)

    def fn(data):
        pa = data.get("priceAlerts") if isinstance(data.get("priceAlerts"), dict) else {}
        old = {r.get("id"): r for r in pa.get("rules") or [] if isinstance(r, dict)}
        out = []
        for r in rules:
            if r["id"] in old:
                out.append(old[r["id"]])
                continue
            out.append({"id": r["id"], "ticker": r["ticker"], "kind": r["kind"],
                        "level": r["level"],
                        "currency": quote_currency(data, r["ticker"])
                        if r["kind"] in ("above", "below") else None,
                        "status": "new", "reason": None, "value": None,
                        "distancePct": None, "firedAt": None})
        new = {"rules": out, "invalid": invalid}
        if pa == new:
            return False
        data["priceAlerts"] = new
        return True
    pf.patch_cached(positions, fn)


def run(args, words):
    raw = pf.load(args.positions, create=args.action == "list")
    items = raw.get("_alerts")
    if items is not None and not isinstance(items, list):
        pf.fail("_alerts in positions.json should be a list — fix it first")
    rules, _ = load_price_alerts(raw)

    if args.action == "list":
        if len(words) > 1:
            pf.fail("list takes at most one TICKER")
        if words:
            tk = "*" if words[0].strip() == "*" else pf.ticker_arg(words[0])
            rules = [r for r in rules if r["ticker"] == tk]
        text = "\n".join(label(r) for r in rules) or "(no alerts)"
        return {"ok": True, "alerts": brief(rules)}, text

    if args.action == "add":
        if len(words) != 3:
            pf.fail("add takes TICKER KIND VALUE, e.g. MSFT above 400")
        kind = kind_arg(words[1])
        tk = ticker_for(words[0], kind)
        rule, err = price_alert_rule({"ticker": tk, kind: value_arg(words[2], kind)})
        if err:
            pf.fail(err)
        reply = {"ok": True, "id": rule["id"], "watched": False}
        if any(r["id"] == rule["id"] for r in rules):
            reply.update(message="that alert already exists", alerts=brief(rules))
            return reply, reply["message"]
        if len(rules) >= MAX_ALERTS:
            pf.fail("at most %d alerts — remove one first" % MAX_ALERTS)
        held = tk != "*" and bool(pf.held_shares(raw.get(tk)))
        if kind == "pctFromCost" and not held:
            pf.fail("you don't hold %s — pctFromCost compares with your average cost" % tk)
        if kind == "pctFromCost" and not cost_known(raw.get(tk)):
            pf.fail("%s has no purchase price or date, so there is no cost to "
                    "compare with — add one first" % tk)
        watch = [str(w).upper() for w in raw.get("_watch") or [] if isinstance(w, str)]
        msg = "alert added: " + label(rule)
        if kind in ("above", "below") and not held and tk not in watch:
            raw["_watch"] = watch + [tk]
            reply["watched"] = True
            msg += " (now watching %s, so it gets a price)" % tk
        raw["_alerts"] = (items or []) + [{"ticker": tk, kind: rule["level"]}]
        pf.save(args.positions, raw)
        if reply["watched"]:
            pf.request_refresh(args.positions)
    else:
        rid = rule_id(words)
        keep = [e for e in items or []
                if (price_alert_rule(e)[0] or {}).get("id") != rid]
        if len(keep) == len(items or []):
            pf.fail("no such alert: %s" % rid)
        if keep:
            raw["_alerts"] = keep
        else:
            raw.pop("_alerts", None)
        pf.save(args.positions, raw)
        reply = {"ok": True, "id": rid}
        msg = "alert removed: %s %s %s" % tuple(rid.rsplit(":", 2))
    patch_data(args.positions, raw)
    reply.update(message=msg, alerts=brief(load_price_alerts(raw)[0]))
    return reply, msg


def main(argv=None):
    here = os.path.dirname(os.path.abspath(__file__))
    flags, words = split_argv(sys.argv[1:] if argv is None else argv)
    ap = Args()
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--positions", default=os.path.join(here, "positions.json"))
    ap.add_argument("action", choices=["add", "remove", "list"])
    ap.add_argument("words", nargs="*")
    as_json = "--json" in flags
    if "-h" in flags or "--help" in flags:
        print(__doc__.strip())
        return 0
    buf = io.StringIO()
    try:
        if not words:
            raise Done({"error": "need add, remove or list"},
                       "usage: alerts.py add|remove|list ...", 1)
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
        obj, text, code = ({"error": "could not save the alert: %s" % e},
                           "error: could not save the alert: %s" % e, 1)
    print(json.dumps(obj) if as_json else text)
    return code


if __name__ == "__main__":
    sys.exit(main())
