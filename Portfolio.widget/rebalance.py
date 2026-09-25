"""
rebalance.py — target allocation, drift and rebalancing (12.10).

Pure module: standard library only, no I/O, no network. portfolio_tracker.py
calls build_targets() with the rows it already has; everything here works in
display money (the --currency of the run).

positions.json:
    "_settings": {"targets": {"ADBE": 10, "Tech": 20, "Energy": "15%", "cash": 5}}

A key is "cash", a held ticker or a sector (theme) name; the value is the
target share of the WHOLE portfolio (holdings + cash) in percent. Anything
without a target counts as 0 %. The rebalance plan moves the fewest dollars
needed to bring every bucket within +/-BAND percentage points of its target;
"new money" says where fresh cash should go first and how much would fix
everything without selling.
"""

import itertools
import math
import re

BAND = 1.0            # +/- percentage points around each target
SUM_TOL = 0.01        # targets may add up to 100 +/- this without a warning
WHOLE_BRUTE_MAX = 10  # whole shares, nothing within band: every floor/ceil rounding up to this many tickers
GREEDY_STEPS = 200    # ... then at most this many one-share (or pair) improvements
EPS_PCT = 1e-7        # tolerance of every band check, in percentage points
_PAIR_MOVES = 25      # greedy: at most this many two-share moves (bounds the time)
_OPT_K = 7            # whole shares: in-band share counts tried per bucket ...
_OPT_MAX = 64         # ... up to this many for a cheap ticker
_SECTOR_COMBOS = 256  # ... member combinations tried per sector bucket
_DFS_NODES = 60000    # ... nodes of the in-band search (bounds the time)
_CLOSE_COMBOS = 4096  # ... roundings tried when nothing is within band

WARN_ORDER = ("format", "value", "unknown", "duplicate", "nested", "sum",
              "untargeted", "noPrice")
_NUM_RE = re.compile(r"^\s*([0-9]+(?:[.,][0-9]+)?)\s*%?\s*$")
_DASH = "—"


# ---------------------------------------------------------------- helpers

def _r(x, nd=2):
    """Round for JSON: finite float (no -0.0) or None."""
    if x is None:
        return None
    x = float(x)
    if not math.isfinite(x):
        return None
    x = round(x, nd)
    return 0.0 if x == 0 else x


def _edges(t, band):
    return max(0.0, t - band), min(100.0, t + band)


def _pct_text(s):
    return ("%.2f" % s).rstrip("0").rstrip(".")


def _is_cash(b):
    return b.get("kind") == "cash" or b.get("key") == "cash"


class _Warnings(object):
    """One Warning per kind, emitted in WARN_ORDER."""

    def __init__(self):
        self.keys = {}
        self.extra = {}

    def add(self, kind, key=None, extra=None):
        ks = self.keys.setdefault(kind, [])
        if key is not None:
            ks.append(key)
        if extra is not None:
            self.extra.setdefault(kind, []).append(extra)

    def out(self):
        res = []
        for kind in WARN_ORDER:
            if kind not in self.keys:
                continue
            keys = self.keys[kind]
            ex = self.extra.get(kind, [])
            j = ", ".join(keys)
            if kind == "format":
                text = ('targets should be an object like '
                        '{"ADBE": 30, "Tech": 50, "cash": 20}')
            elif kind == "value":
                text = j + ": a target is a number from 0 to 100"
            elif kind == "unknown":
                text = j + ": not one of your holdings, sectors or cash"
            elif kind == "duplicate":
                text = j + ": listed twice " + _DASH + " the first one counts"
            elif kind == "nested":
                text = "; ".join(
                    "%s: its sector %s has a target %s %s's own target is ignored"
                    % (tk, th, _DASH, tk) for tk, th in ex)
            elif kind == "sum":
                text = "targets add up to %s%%, not 100%%" % _pct_text(ex[0])
            elif kind == "untargeted":
                text = "no target for " + j + " " + _DASH + " counted as 0%"
            else:
                text = ("no price for " + j + " right now " + _DASH +
                        " rebalancing waits for it")
            res.append({"kind": kind, "keys": list(keys), "text": text})
        return res


def _parse_value(v):
    """A target value -> float percent in [0, 100], or None when invalid."""
    if isinstance(v, bool):
        return None
    if isinstance(v, (int, float)):
        x = float(v)
    elif isinstance(v, str):
        m = _NUM_RE.match(v)
        if not m:
            return None
        x = float(m.group(1).replace(",", "."))
    else:
        return None
    if not math.isfinite(x) or x < 0 or x > 100:
        return None
    return x


def _parse(raw, w):
    if raw is None or (isinstance(raw, dict) and not raw):
        return None
    if not isinstance(raw, dict):
        w.add("format")
        return []
    entries = []
    for k, v in raw.items():
        pct = _parse_value(v)
        if pct is None:
            w.add("value", str(k))
        else:
            entries.append((str(k), pct))
    return entries


def parse_targets(raw):
    """_settings.targets -> (entries [(key_as_written, pct)], warnings).
    raw None / {} -> (None, []); not an object -> ([], [format warning])."""
    w = _Warnings()
    entries = _parse(raw, w)
    return entries, w.out()


def _norm(buckets):
    """Copy the bucket list with float t/v; add an empty 0 % cash bucket
    when there is none, so every plan has somewhere for spare cash to go."""
    out = []
    for b in buckets:
        mem = []
        for m in b.get("members") or []:
            px = float(m["px"])
            val = float(m.get("value") or 0.0)
            sh = m.get("shares")
            held = float(sh) if sh is not None else (val / px if px > 0 else 0.0)
            mem.append({"ticker": m["ticker"], "value": val, "px": px, "held": held})
        out.append({"key": b["key"], "kind": b.get("kind") or
                    ("cash" if b["key"] == "cash" else "ticker"),
                    "t": float(b["t"]), "v": float(b["v"]), "members": mem})
    if not any(_is_cash(b) for b in out):
        out.append({"key": "cash", "kind": "cash", "t": 0.0, "v": 0.0, "members": []})
    return out


def _level_fill(gaps, amount):
    """Give `amount` to the keys with a positive gap, shrinking the largest
    gaps first to one common level L: a_k = max(0, gap_k - L) and
    sum(a) = min(amount, sum of positive gaps). Exact (sorted), no bisection."""
    out = {k: 0.0 for k in gaps}
    pos = sorted((g for g in gaps.values() if g > 0), reverse=True)
    if amount <= 0 or not pos:
        return out
    if amount >= sum(pos):
        return {k: max(0.0, g) for k, g in gaps.items()}
    acc = 0.0
    level = 0.0
    for m in range(1, len(pos) + 1):
        acc += pos[m - 1]
        level = (acc - amount) / m
        if level >= (pos[m] if m < len(pos) else 0.0):
            break
    return {k: max(0.0, g - level) for k, g in gaps.items()}


def _in_band(bs, vals, V, band):
    for b in bs:
        lo, hi = _edges(b["t"], band)
        w = 100.0 * vals[b["key"]] / V
        if w < lo - EPS_PCT or w > hi + EPS_PCT:
            return False
    return True


def feasible(buckets, band=BAND):
    """Every bucket can be within band at once iff sum(lo) <= 100 <= sum(hi)."""
    bs = _norm(buckets)
    los = sum(_edges(b["t"], band)[0] for b in bs)
    his = sum(_edges(b["t"], band)[1] for b in bs)
    return los <= 100.0 + EPS_PCT and his >= 100.0 - EPS_PCT


# ---------------------------------------------------------- fractional plan
#
# Why this plan moves the fewest dollars (proof).
#   Let V be the portfolio value, bucket j with value v_j and band edges
#   lo_j, hi_j (percent). Trades are self-financing, so the bucket changes
#   d_j (cash is a bucket too) sum to zero and the money moved is
#   M = sum of the positive d_j = sum of the negative |d_j| = 1/2 sum |d_j|.
#   Any plan that ends within band must take at least E_j = v_j - hi_j V/100
#   out of every over-band bucket and put at least F_j = lo_j V/100 - v_j into
#   every under-band bucket. So M >= sum E_j = E and M >= sum F_j = F, i.e.
#   M >= max(E, F) for EVERY valid plan.
#   This plan does exactly that and nothing more: it sells each over bucket
#   to hi_j and buys each under bucket to lo_j; when E > F the surplus E - F
#   only BUYS (into buckets below target, then up to hi_j), when F > E the
#   shortfall only SELLS (from buckets above target, then down to lo_j). No
#   bucket is both bought and sold and the extra amount goes to the side that
#   is short, so M = max(E, F) — the lower bound, hence minimal. There is
#   room for the extra because sum hi_j >= 100 >= sum lo_j (true whenever
#   the targets add up to 100; otherwise checked -> reason "infeasible").
#   Among all minimal plans, level filling picks the one whose largest
#   remaining gap to target is smallest.
#   Worked example (Done-when case A): AAA 6000 / BBB 2500 / CCC 1500, no
#   cash, targets 50/30/20. AAA must drop to 51 % -> sell >= 900; BBB, CCC
#   need +400 each -> buys 800 < 900, surplus 100 split +50/+50. Plan: sell
#   7.5 AAA, buy 9 BBB, buy 15 CCC = $900 moved; a brute force over every
#   $25 grid plan finds nothing below 900 (see the 12.10 test script).

def plan_fractional(buckets, band=BAND):
    """Fewest-dollar plan. Returns {"V", "delta" {bucket: $}, "after"
    {bucket: $}, "tickers" {ticker: $}, "moved", "lowerBound", "feasible",
    "withinBand"}; a sector's change is split pro rata by member value."""
    bs = _norm(buckets)
    V = sum(b["v"] for b in bs)
    delta = {b["key"]: 0.0 for b in bs}
    after = {b["key"]: b["v"] for b in bs}
    if V <= 0:
        return {"V": V, "delta": delta, "after": after, "tickers": {},
                "moved": 0.0, "lowerBound": 0.0, "feasible": False,
                "withinBand": False}
    E = F = 0.0
    tv, loV, hiV = {}, {}, {}
    for b in bs:
        k = b["key"]
        lo, hi = _edges(b["t"], band)
        tv[k], loV[k], hiV[k] = b["t"] * V / 100.0, lo * V / 100.0, hi * V / 100.0
        w = 100.0 * b["v"] / V
        if w > hi + EPS_PCT:
            delta[k] = hiV[k] - b["v"]
            E -= delta[k]
        elif w < lo - EPS_PCT:
            delta[k] = loV[k] - b["v"]
            F += delta[k]
        after[k] = b["v"] + delta[k]
    tol = 1e-9 * max(V, 1.0)
    left = 0.0
    if E > F:            # surplus: buy toward target, then toward hi
        left = E - F
        for goal in (tv, hiV):
            if left <= tol:
                break
            a = _level_fill({k: goal[k] - after[k] for k in after}, left)
            for k, x in a.items():
                delta[k] += x
                after[k] += x
            left -= sum(a.values())
    elif F > E:          # shortfall: sell from above target, then toward lo
        left = F - E
        for goal in (tv, loV):
            if left <= tol:
                break
            a = _level_fill({k: after[k] - goal[k] for k in after}, left)
            for k, x in a.items():
                delta[k] -= x
                after[k] -= x
            left -= sum(a.values())
    ok = left <= tol
    tickers = {}
    for b in bs:
        d = delta[b["key"]]
        if _is_cash(b) or not b["members"] or abs(d) < 1e-12:
            continue
        tot = sum(m["value"] for m in b["members"])
        n = len(b["members"])
        for m in b["members"]:
            tickers[m["ticker"]] = d * (m["value"] / tot if tot > 0 else 1.0 / n)
    return {"V": V, "delta": delta, "after": after, "tickers": tickers,
            "moved": 0.5 * sum(abs(x) for x in delta.values()),
            "lowerBound": max(E, F), "feasible": ok,
            "withinBand": ok and _in_band(bs, after, V, band)}


# ------------------------------------------------------------ whole shares
#
# Whole shares never spend cash the portfolio does not have: cash may not end
# below min(cash now, 0). Two stages:
#   1. within band: every bucket's in-band whole-share changes near the
#      fractional trade (the _OPT_K share counts closest to it for a single
#      ticker, whole-share combinations of its members for a sector, small
#      changes for a bucket the fractional plan leaves alone), then a pruned
#      depth-first search for the combination whose total keeps cash within
#      band and >= that floor with the fewest dollars moved. Trades are
#      self-financing, so a bucket's band only depends on its own change and
#      the buckets are tied together only through cash.
#   2. nothing within band: the plan closest to it — lowest total out-of-band
#      distance (percentage points, cash included), then fewest dollars —
#      from the best floor/ceil rounding (every combination up to
#      WHOLE_BRUTE_MAX tickers) improved one share (or a pair) at a time. A
#      plan no closer than trading nothing is dropped (no trades).

def _dist_total(bs, vals, V, band):
    s = 0.0
    for b in bs:
        lo, hi = _edges(b["t"], band)
        w = 100.0 * vals[b["key"]] / V
        s += max(0.0, lo - w, w - hi)
    return s


def _bucket_options(b, V, band, frac_sh, frac_delta, cap, px_max, soft=False):
    """In-band whole-share changes of one bucket: [(dollars, {ticker: n})],
    cheapest first; [] when whole shares cannot put it within band. A single
    ticker keeps enough share counts to offset one share of the priciest
    ticker (at least _OPT_K, at most _OPT_MAX). soft: when nothing is within
    band, the changes nearest the band instead. Items: (dollars, {ticker: n},
    out-of-band percentage points)."""
    lo, hi = _edges(b["t"], band)

    def off(d):
        w = 100.0 * (b["v"] + d) / V
        return max(0.0, lo - w, w - hi)
    opts = _in_band_options(b, V, lo, hi, frac_sh, frac_delta, cap, px_max)
    opts = [(d, sh, 0.0) for d, sh in opts]
    if not soft:
        return opts
    mem = [m for m in b["members"] if m["px"] > 0]
    if len(mem) == 1:        # also just outside each edge of the band
        tk, px = mem[0]["ticker"], mem[0]["px"]
        s = frac_sh.get(tk, 0.0)
        kk = min(_OPT_MAX, max(_OPT_K, int(math.ceil(px_max / px)) + 1))
        xlo = int(math.floor((lo * V / 100.0 - b["v"]) / px))
        xhi = int(math.ceil((hi * V / 100.0 - b["v"]) / px))
        ns = set(range(xlo - kk + 1, xlo + 1)) | set(range(xhi, xhi + kk))
        ns.update((0, int(math.floor(s + 0.5))))
        cand = [(n * px, {tk: n} if n else {}) for n in ns if n >= -cap[tk]]
    else:
        cand = _in_band_options(b, V, -1e9, 1e9, frac_sh, frac_delta, cap, px_max)
    cand = [(d, sh, off(d)) for d, sh in cand]
    cand = sorted((o for o in cand if o[2] > 0),
                  key=lambda o: (round(o[2], 9), abs(o[0]), o[0]))
    if len(mem) != 1:
        cand = cand[:4]
    return opts + cand


def _in_band_options(b, V, lo, hi, frac_sh, frac_delta, cap, px_max):
    """The in-band part of _bucket_options: [(dollars, {ticker: n})]."""
    eps = EPS_PCT * V / 100.0
    L = lo * V / 100.0 - b["v"] - eps
    H = hi * V / 100.0 - b["v"] + eps
    mem = [m for m in b["members"] if m["px"] > 0]
    if not mem:
        return [(0.0, {})] if L <= 0.0 <= H else []
    if len(mem) == 1:
        m = mem[0]
        tk, px = m["ticker"], m["px"]
        s = frac_sh.get(tk, 0.0)
        nlo = max(int(math.ceil(L / px - 1e-9)), -cap[tk])
        nhi = int(math.floor(H / px + 1e-9))
        if nlo > nhi:
            return []
        c = min(max(s, nlo), nhi)
        kk = min(_OPT_MAX, max(_OPT_K, int(math.ceil(px_max / px)) + 2))
        rng = range(max(nlo, int(math.floor(c)) - kk),
                    min(nhi, int(math.ceil(c)) + kk) + 1)
        ns = sorted(rng, key=lambda n: (abs(n - s), n))[:kk]
        opts = [(n * px, {tk: n} if n else {}) for n in ns]
    else:
        sg = frac_delta.get(b["key"], 0.0)
        sg = 1 if sg > 1e-9 else -1 if sg < -1e-9 else 0
        near = {}
        for m in mem:
            tk = m["ticker"]
            s = frac_sh.get(tk, 0.0)
            r = int(math.floor(abs(s) + 0.5)) * (1 if s >= 0 else -1)
            near[tk] = max(r, -cap[tk])

        def ok_n(tk, n):
            return n >= -cap[tk] and (sg == 0 or n * sg >= 0)
        combos = None
        if sg != 0:
            for R in (1, 0):
                ranges = []
                for m in mem:
                    tk = m["ticker"]
                    s = frac_sh.get(tk, 0.0)
                    ranges.append([n for n in range(int(math.floor(s)) - R,
                                                    int(math.ceil(s)) + R + 1)
                                   if ok_n(tk, n)] or [0])
                size = 1
                for x in ranges:
                    size *= len(x)
                if size <= _SECTOR_COMBOS:
                    combos = itertools.product(*ranges)
                    break
        if combos is None:       # nearest rounding and single-share changes
            basec = [near[m["ticker"]] if sg else 0 for m in mem]
            combos = [tuple(basec)]
            for i, m in enumerate(mem):
                for st in (1, -1):
                    c = list(basec)
                    c[i] += st
                    if ok_n(m["ticker"], c[i]):
                        combos.append(tuple(c))
        seen = {}
        for combo in combos:
            d = sum(n * m["px"] for n, m in zip(combo, mem))
            if not (L <= d <= H):
                continue
            gross = sum(abs(n) * m["px"] for n, m in zip(combo, mem))
            key = round(d, 6)
            if key not in seen or gross < seen[key][0] - 1e-9:
                seen[key] = (gross, d, {m["ticker"]: n for n, m in zip(combo, mem) if n})
        want = frac_delta.get(b["key"], 0.0)
        opts = sorted(((d, sh) for _, d, sh in seen.values()),
                      key=lambda o: (abs(o[0] - want), o[0]))[:2 * _OPT_K]
    opts.sort(key=lambda o: (abs(o[0]), o[0]))
    return opts


def _whole_search(bs, V, band, frac_sh, frac_delta, cap, cash_key, cash_min,
                  soft=False):
    """{ticker: n} of the best plan found over _bucket_options, or None.
    Not soft (stage 1): every bucket and cash within band, fewest dollars.
    soft (stage 2): cash only >= cash_min; lowest total out-of-band distance
    (cash included), then fewest dollars."""
    eps = EPS_PCT * V / 100.0
    cb = [b for b in bs if b["key"] == cash_key][0]
    lo_c, hi_c = _edges(cb["t"], band)
    if soft:
        s_lo, s_hi = -1e18, cb["v"] - cash_min
        c_lo, c_hi = cb["v"] - hi_c * V / 100.0, cb["v"] - lo_c * V / 100.0
    else:
        s_lo = cb["v"] - hi_c * V / 100.0 - eps
        s_hi = cb["v"] - max(lo_c * V / 100.0 - eps, cash_min)
    if s_lo > s_hi:
        return None
    px_max = max([m["px"] for b in bs for m in b["members"]] or [0.0])
    opts = []
    for b in bs:
        if b["key"] == cash_key:
            continue
        o = _bucket_options(b, V, band, frac_sh, frac_delta, cap, px_max, soft)
        if not o:
            return None
        opts.append(o)
    opts.sort(key=lambda o: (len(o), -(max(x[0] for x in o) - min(x[0] for x in o))))
    k = len(opts)
    z = [0.0] * (k + 1)
    smin, smax, cmin, dmin = list(z), list(z), list(z), list(z)
    for i in range(k - 1, -1, -1):
        smin[i] = smin[i + 1] + min(x[0] for x in opts[i])
        smax[i] = smax[i + 1] + max(x[0] for x in opts[i])
        cmin[i] = cmin[i + 1] + min(abs(x[0]) for x in opts[i])
        dmin[i] = dmin[i + 1] + min(x[2] for x in opts[i])
    abs_s = 0.0 if s_lo <= 0.0 <= s_hi else min(abs(s_lo), abs(s_hi))
    best = [None, None]          # (distance, moved, |net|), picks
    picks = [None] * k
    nodes = [0]

    def cash_off(a, b):          # cash distance (pts) when the net is in [a, b]
        if not soft:
            return 0.0
        return 100.0 * max(0.0, a - c_hi, c_lo - b) / V

    def walk(i, part, cost, dd):
        nodes[0] += 1
        if nodes[0] > _DFS_NODES:
            return
        a, b = part + smin[i], part + smax[i]
        if a > s_hi or b < s_lo:
            return
        if best[0] is not None:
            lb = round(dd + dmin[i] + cash_off(a, min(b, s_hi)), 6)
            if lb > best[0][0] + 1e-6 or (
                    lb >= best[0][0] - 1e-6 and
                    0.5 * (cost + cmin[i] + (0.0 if soft else abs_s)) > best[0][1] + 1e-6):
                return
        if i == k:
            rank = (round(dd + cash_off(part, part), 6),
                    round(0.5 * (cost + abs(part)), 6), round(abs(part), 6))
            if best[0] is None or rank < best[0]:
                best[0], best[1] = rank, list(picks)
            return
        for opt in opts[i]:
            picks[i] = opt
            walk(i + 1, part + opt[0], cost + abs(opt[0]), dd + opt[2])

    walk(0, 0.0, 0.0, 0.0)
    if best[1] is None:
        return None
    n = {}
    for o in best[1]:
        n.update(o[1])
    return n


def plan_whole(buckets, fractional, band=BAND):
    """Whole-share version of `fractional` (see the comment above): the
    fewest-dollar whole-share plan within band when stage 1 finds one, else
    the closest; a sale never exceeds the shares held and cash never ends
    below min(cash now, 0). Returns {"shares" {ticker: int}, "delta",
    "after", "moved", "cashChange", "withinBand"}."""
    bs = _norm(buckets)
    V = sum(b["v"] for b in bs)
    base = {b["key"]: b["v"] for b in bs}
    cash_key = [b["key"] for b in bs if _is_cash(b)][0]
    cash_min = min(base[cash_key], 0.0) - 0.005
    owner, mem, cap = {}, {}, {}
    for b in bs:
        for m in b["members"]:
            owner[m["ticker"]] = b["key"]
            mem[m["ticker"]] = m
            cap[m["ticker"]] = max(0, int(math.floor(m["held"] + 1e-6)))
    frac_sh = {}
    for tk, d in (fractional.get("tickers") or {}).items():
        if tk in mem and mem[tk]["px"] > 0 and abs(d / mem[tk]["px"]) >= 1e-6:
            frac_sh[tk] = d / mem[tk]["px"]

    def apply(n):
        vals = dict(base)
        net = 0.0
        for tk, k in n.items():
            d = k * mem[tk]["px"]
            vals[owner[tk]] += d
            net += d
        vals[cash_key] -= net
        return vals, net

    def result(n):
        vals, net = apply(n)
        return {"shares": {tk: int(k) for tk, k in n.items() if k},
                "delta": {k: vals[k] - base[k] for k in vals}, "after": vals,
                "moved": 0.5 * sum(abs(vals[k] - base[k]) for k in vals),
                "cashChange": -net,
                "withinBand": V > 0 and _in_band(bs, vals, V, band)}

    if V <= 0 or not frac_sh:
        return result({})
    fd = fractional.get("delta") or {}
    got = _whole_search(bs, V, band, frac_sh, fd, cap, cash_key, cash_min)
    if got is not None:
        return result(got)

    # stage 2: closest. Start from the best floor/ceil rounding that keeps
    # cash >= cash_min (rounding sells up and buys down always does).
    keys = sorted(frac_sh)
    every = sorted(tk for tk in mem if mem[tk]["px"] > 0)
    if len(every) <= WHOLE_BRUTE_MAX:    # small: untouched tickers may trade too
        keys = every
    sign = {tk: (1 if frac_sh.get(tk, 0.0) > 0 else
                 -1 if frac_sh.get(tk, 0.0) < 0 else 0) for tk in keys}
    # few tickers: also R shares beyond floor/ceil (R as large as keeps the
    # product <= _CLOSE_COMBOS)
    R = 0
    for r in (3, 2, 1):
        if (2 * r + 2) ** len(keys) <= _CLOSE_COMBOS:
            R = r
            break
    cands = []
    for tk in keys:
        s = frac_sh.get(tk, 0.0)
        cands.append([x for x in range(int(math.floor(s + 1e-9)) - R,
                                       int(math.ceil(s - 1e-9)) + R + 1)
                      if -cap[tk] <= x] or [0])

    def rank_of(n):
        vals, net = apply(n)
        bad = 0 if vals[cash_key] >= cash_min else 1
        moved = 0.5 * sum(abs(vals[k] - base[k]) for k in vals)
        return (bad, round(_dist_total(bs, vals, V, band), 6), round(moved, 6),
                round(abs(net), 6))

    if len(keys) <= WHOLE_BRUTE_MAX:
        best = None
        for combo in itertools.product(*cands):
            r = rank_of(dict(zip(keys, combo))) + (combo,)
            if best is None or r < best:
                best = r
        n = dict(zip(keys, best[-1]))
    else:
        n = {}
        for tk in keys:
            r = int(math.floor(abs(frac_sh.get(tk, 0.0)) + 0.5))
            n[tk] = sign[tk] * (min(r, cap[tk]) if sign[tk] < 0 else r)
        if rank_of(n)[0]:
            n = {tk: c[0] for tk, c in zip(keys, cands)}   # sells up, buys down
    n = _whole_greedy(bs, V, band, n, keys, sign, cap, owner, mem, base,
                      cash_key, cash_min, apply)
    alt = _whole_search(bs, V, band, frac_sh, fd, cap, cash_key, cash_min, True)
    if alt is not None and rank_of(alt) < rank_of(n):
        n = alt
    if (not _in_band(bs, apply(n)[0], V, band) and
            _dist_total(bs, apply(n)[0], V, band) >=
            _dist_total(bs, base, V, band) - 1e-9):
        n = {}
    return result(n)


def _whole_greedy(bs, V, band, n, keys, sign, cap, owner, mem, base,
                  cash_key, cash_min, apply):
    """Up to GREEDY_STEPS one-share changes (a pair of them when no single
    one helps) that lower (out-of-band distance, moved) and keep cash >=
    cash_min. A move only changes its buckets and cash, so it is scored
    locally; a pair gets past spots where one share would push cash out."""
    lohi = {b["key"]: _edges(b["t"], band) for b in bs}
    n = dict(n)
    vals, _ = apply(n)

    def dist(k, val):
        lo, hi = lohi[k]
        w = 100.0 * val / V
        return max(0.0, lo - w, w - hi)

    def allowed(tk, nn):
        if sign[tk] == 0:
            return nn >= -cap[tk]
        if sign[tk] > 0:
            return nn >= 0
        return nn <= 0 and -nn <= cap[tk]

    def score(moves):
        """(change of out-of-band distance, change of moved), or None when
        the moves would leave cash below cash_min."""
        ch = {}
        for tk, step in moves:
            d = step * mem[tk]["px"]
            ch[owner[tk]] = ch.get(owner[tk], 0.0) + d
            ch[cash_key] = ch.get(cash_key, 0.0) - d
        if vals[cash_key] + ch.get(cash_key, 0.0) < cash_min:
            return None
        dd = dm = 0.0
        for k, d in ch.items():
            dd += dist(k, vals[k] + d) - dist(k, vals[k])
            dm += 0.5 * (abs(vals[k] + d - base[k]) - abs(vals[k] - base[k]))
        return dd, dm

    singles = [(tk, st) for tk in keys for st in (1, -1)]
    pairs_left = _PAIR_MOVES
    for _ in range(GREEDY_STEPS):
        best = None
        for group in ((1, 2) if pairs_left > 0 else (1,)):
            if group == 1:
                options = [(m,) for m in singles]
            else:
                # pairs only while something is out of band, and the first
                # share must touch an out-of-band bucket (cash: any share)
                out = set(k for k in vals if dist(k, vals[k]) > 0)
                if not out:
                    break
                firsts = [m for m in singles
                          if cash_key in out or owner[m[0]] in out]
                options = [(a, b) for a in firsts for b in singles
                           if a[0] != b[0]]
            for moves in options:
                if not all(allowed(tk, n[tk] + st) for tk, st in moves):
                    continue
                sc = score(moves)
                if sc is None:
                    continue
                dd, dm = sc
                if dd < -1e-12 or (abs(dd) <= 1e-12 and dm < -1e-9):
                    if best is None or (dd, dm) < best[0]:
                        best = ((dd, dm), moves)
            if best is not None:
                break
        if best is None:
            break
        if len(best[1]) == 2:
            pairs_left -= 1
        for tk, st in best[1]:
            n[tk] += st
            vals[owner[tk]] += st * mem[tk]["px"]
            vals[cash_key] -= st * mem[tk]["px"]
    return n


# --------------------------------------------------------------- new money

def new_money(buckets, band=BAND):
    """Where new money goes first, and the smallest amount N that gets every
    bucket within band by buying only (holdings are never sold; cash may be
    spent). Returns the data.json NewMoney object (rounded); noSell is None
    when no amount works."""
    bs = _norm(buckets)
    V = sum(b["v"] for b in bs)
    hold = [b for b in bs if not _is_cash(b)]
    cb = [b for b in bs if _is_cash(b)][0]
    order = []
    for b in hold:
        gap = b["t"] * V / 100.0 - b["v"]
        if gap > 0.005:
            order.append((b["key"], b["kind"], gap))
    order.sort(key=lambda x: (-x[2], x[0]))
    res = {"order": [{"key": k, "kind": kd, "gapValue": _r(g),
                      "gapPct": _r(100.0 * g / V if V > 0 else 0.0)}
                     for k, kd, g in order],
           "first": order[0][0] if order else None, "noSell": None}
    edge = {b["key"]: _edges(b["t"], band) for b in bs}
    n_min = 0.0
    for b in hold:
        hi = edge[b["key"]][1]
        if hi <= 0:
            if b["v"] > 0:
                return res
            continue
        n_min = max(n_min, 100.0 * b["v"] / hi - V)

    def rng(N):
        V2 = V + N
        smin = sum(max(0.0, edge[b["key"]][0] * V2 / 100 - b["v"]) for b in hold)
        smax = sum(max(0.0, edge[b["key"]][1] * V2 / 100 - b["v"]) for b in hold)
        lo_c, hi_c = edge[cb["key"]]
        return (max(smin, cb["v"] + N - hi_c * V2 / 100),
                min(smax, cb["v"] + N - lo_c * V2 / 100))

    def ok(N):
        a, b = rng(N)
        return a <= b + 1e-7 * max(V + N, 1.0)

    if ok(n_min):
        N = n_min
    else:
        lo, hi = n_min, max(n_min + 1.0, 1000.0 * max(V, 1.0))
        if not ok(hi):
            return res
        for _ in range(200):
            mid = (lo + hi) / 2
            if ok(mid):
                hi = mid
            else:
                lo = mid
        N = hi
    V2 = V + N
    a, bmax = rng(N)
    spend = min(max(cb["v"] + N - cb["t"] * V2 / 100, a), bmax)
    buys = {b["key"]: max(0.0, edge[b["key"]][0] * V2 / 100 - b["v"]) for b in hold}
    left = spend - sum(buys.values())
    for goal in ("t", "hi"):
        if left <= 1e-9:
            break
        gaps = {}
        for b in hold:
            g = b["t"] if goal == "t" else edge[b["key"]][1]
            gaps[b["key"]] = g * V2 / 100 - b["v"] - buys[b["key"]]
        fill = _level_fill(gaps, left)
        for k, x in fill.items():
            buys[k] += x
        left -= sum(fill.values())
    tot = sum(buys.values())
    lst = sorted(((k, x) for k, x in buys.items() if x > 0.005),
                 key=lambda kx: (-kx[1], kx[0]))
    res["noSell"] = {"amount": _r(N),
                     "buys": [{"key": k, "amount": _r(x)} for k, x in lst],
                     "cashChange": _r(N - tot)}
    return res


# ----------------------------------------------------------- data.json

def _trades(bs, shares_by_tk, value_by_tk, whole, info):
    """Trade list: sells first, then buys, each by value desc, ties by ticker."""
    owner = {m["ticker"]: b["key"] for b in bs for m in b["members"]}
    out = []
    for tk, sh in shares_by_tk.items():
        if whole:
            shv = abs(int(sh))
        else:
            if abs(sh) < 1e-6:
                continue
            shv = _r(abs(sh), 4)
        val = _r(abs(value_by_tk[tk]))
        if not shv or not val:
            continue
        q = info.get(tk) or {}
        out.append({"ticker": tk, "bucket": owner.get(tk), "side":
                    "sell" if sh < 0 else "buy", "shares": shv, "value": val,
                    "price": q.get("price"), "currency": q.get("currency")})
    out.sort(key=lambda t: (0 if t["side"] == "sell" else 1, -t["value"], t["ticker"]))
    return out


def _plan_obj(bs, V, trades, delta, after, within):
    bought = sum(x for k, x in delta.items() if x > 0 and k != "cash")
    sold = -sum(x for k, x in delta.items() if x < 0 and k != "cash")
    return {"trades": trades,
            "moved": _r(0.5 * sum(abs(x) for x in delta.values())),
            "bought": _r(bought), "sold": _r(sold), "cashChange": _r(sold - bought),
            "withinBand": bool(within),
            "after": [{"key": b["key"], "weightPct": _r(100.0 * after[b["key"]] / V)}
                      for b in bs]}


def build_targets(raw, holdings, cash, missing, band=BAND):
    """holdings: rows order, each {"ticker", "theme", "shares", "value" (display,
    unrounded), "px" (display money per share, unrounded), "price" (quote),
    "currency" (quote)}. cash: display-currency cash total. missing: held
    tickers without a price.
    Returns (targets, row_fields, theme_fields):
      targets      None when there are no targets, else the data.json object
      row_fields   {ticker: {"targetKey", "targetPct", "driftPct"}} ({} unless set)
      theme_fields {theme: {"targetPct", "driftPct"}} for sector buckets only"""
    w = _Warnings()
    entries = _parse(raw, w)
    if entries is None:
        return None, {}, {}
    rows = list(holdings or [])
    cash = float(cash or 0.0)
    row_of = {h["ticker"]: h for h in rows}
    missing = [tk for tk in (missing or []) if tk not in row_of]
    no_price = list(missing) + [h["ticker"] for h in rows
                                if not (h.get("px") and float(h["px"]) > 0)]
    held = [h["ticker"] for h in rows] + missing
    held_up = {}
    for tk in held:
        held_up.setdefault(str(tk).strip().upper(), tk)
    themes = {}          # casefold -> [spelling, [tickers]]
    theme_cf = {}        # ticker -> casefold theme
    for h in rows:
        th = h.get("theme")
        if th:
            cf = str(th).strip().casefold()
            themes.setdefault(cf, [th, []])[1].append(h["ticker"])
            theme_cf[h["ticker"]] = cf
    V = sum(float(h.get("value") or 0.0) for h in rows) + cash

    # resolve keys: cash, held ticker, theme, else unknown; first one counts
    resolved, seen = [], set()
    for key, pct in entries or []:
        k = key.strip()
        if k.casefold() == "cash":
            ident = ("cash", "cash")
        elif k.upper() in held_up:
            ident = ("ticker", held_up[k.upper()])
        elif k and k.casefold() in themes:
            ident = ("sector", k.casefold())
        else:
            w.add("unknown", key)
            continue
        if ident in seen:
            w.add("duplicate", key)
            continue
        seen.add(ident)
        resolved.append((ident, pct))
    sector_cf = set(i[1] for i, _ in resolved if i[0] == "sector")
    explicit = []
    for (kind, ref), pct in resolved:
        if kind == "ticker" and theme_cf.get(ref) in sector_cf:
            w.add("nested", ref, (ref, themes[theme_cf[ref]][0]))
            continue
        explicit.append((kind, ref, pct))

    total = _r(V)
    if not explicit:
        return ({"set": False, "band": _r(band), "sumPct": 0.0, "total": total,
                 "warnings": w.out(), "buckets": [], "rebalance": None,
                 "newMoney": None}, {}, {})

    def member(tk):
        h = row_of[tk]
        return {"ticker": tk, "value": float(h.get("value") or 0.0),
                "px": float(h.get("px") or 0.0),
                "shares": float(h["shares"]) if h.get("shares") is not None else None}

    bs = []
    covered = set()
    for kind, ref, pct in explicit:
        if kind == "cash":
            bs.append({"key": "cash", "kind": "cash", "implicit": False, "t": pct,
                       "v": cash, "members": [], "tickers": []})
        elif kind == "ticker":
            mem = [member(ref)] if ref in row_of else []
            covered.add(ref)
            bs.append({"key": ref, "kind": "ticker", "implicit": False, "t": pct,
                       "v": sum(m["value"] for m in mem), "members": mem,
                       "tickers": [ref]})
        else:
            spelling, tks = themes[ref]
            mem = [member(tk) for tk in tks]
            covered.update(tks)
            bs.append({"key": spelling, "kind": "sector", "implicit": False, "t": pct,
                       "v": sum(m["value"] for m in mem), "members": mem,
                       "tickers": list(tks)})
    sum_pct = sum(b["t"] for b in bs)
    imp = [tk for tk in held if tk not in covered]
    imp_val = {tk: (float(row_of[tk].get("value") or 0.0) if tk in row_of else 0.0)
               for tk in imp}
    imp.sort(key=lambda tk: -imp_val[tk])          # stable: rows order on ties
    for tk in imp:
        mem = [member(tk)] if tk in row_of else []
        bs.append({"key": tk, "kind": "ticker", "implicit": True, "t": 0.0,
                   "v": imp_val[tk], "members": mem, "tickers": [tk]})
    has_cash = any(b["kind"] == "cash" for b in bs)
    if not has_cash:
        bs.append({"key": "cash", "kind": "cash", "implicit": True, "t": 0.0,
                   "v": cash, "members": [], "tickers": []})

    if abs(sum_pct - 100.0) > SUM_TOL:
        w.add("sum", extra=sum_pct)
    for b in bs:
        if b["implicit"] and abs(b["v"]) >= 0.005:
            w.add("untargeted", b["key"])
    for tk in no_price:
        w.add("noPrice", tk)

    # bucket objects
    out_b = []
    weight = {}
    for b in bs:
        lo, hi = _edges(b["t"], band)
        wt = 100.0 * b["v"] / V if V > 0 else 0.0
        weight[b["key"]] = wt
        b["state"] = ("over" if wt > hi + EPS_PCT else
                      "under" if wt < lo - EPS_PCT else "ok")
        if b["kind"] == "cash" and b["implicit"] and abs(b["v"]) < 0.005:
            continue
        tval = b["t"] * V / 100.0
        out_b.append({"key": b["key"], "kind": b["kind"], "implicit": b["implicit"],
                      "targetPct": _r(b["t"]), "weightPct": _r(wt),
                      "driftPct": _r(wt - b["t"]), "value": _r(b["v"]),
                      "targetValue": _r(tval), "driftValue": _r(b["v"] - tval),
                      "lo": _r(lo), "hi": _r(hi), "state": b["state"],
                      "tickers": list(b["tickers"])})

    # rebalance
    reb = {"ok": False, "reason": None, "inBand": False,
           "fractional": None, "whole": None}
    nm = None
    if no_price:
        reb["reason"] = "noPrice"
    elif V <= 1e-9:
        reb["reason"] = "empty"
    elif not feasible(bs, band):
        reb["reason"] = "infeasible"
    else:
        reb["ok"] = True
        reb["inBand"] = all(b["state"] == "ok" for b in bs)
        info = {h["ticker"]: h for h in rows}
        if reb["inBand"]:
            zero = {b["key"]: 0.0 for b in bs}
            cur = {b["key"]: b["v"] for b in bs}
            reb["fractional"] = _plan_obj(bs, V, [], zero, cur, True)
            reb["whole"] = _plan_obj(bs, V, [], zero, cur, True)
        else:
            fr = plan_fractional(bs, band)
            px = {m["ticker"]: m["px"] for b in bs for m in b["members"]}
            sh = {tk: d / px[tk] for tk, d in fr["tickers"].items()}
            reb["fractional"] = _plan_obj(
                bs, V, _trades(bs, sh, fr["tickers"], False, info),
                fr["delta"], fr["after"], fr["withinBand"])
            wh = plan_whole(bs, fr, band)
            reb["whole"] = _plan_obj(
                bs, V, _trades(bs, wh["shares"],
                               {tk: n * px[tk] for tk, n in wh["shares"].items()},
                               True, info),
                wh["delta"], wh["after"], wh["withinBand"])
        nm = new_money(bs, band)

    targets = {"set": True, "band": _r(band), "sumPct": _r(sum_pct), "total": total,
               "warnings": w.out(), "buckets": out_b, "rebalance": reb,
               "newMoney": nm}

    row_fields, theme_fields = {}, {}
    for b in bs:
        if b["kind"] == "sector":
            d = {"targetPct": _r(b["t"]), "driftPct": _r(weight[b["key"]] - b["t"])}
            for tk in b["tickers"]:
                row_fields[tk] = {"targetKey": b["key"], "targetPct": None,
                                  "driftPct": None}
                theme_fields.setdefault(row_of[tk]["theme"], dict(d))
        elif b["kind"] == "ticker" and b["key"] in row_of:
            h = row_of[b["key"]]
            wt = 100.0 * float(h.get("value") or 0.0) / V if V > 0 else 0.0
            row_fields[b["key"]] = {"targetKey": b["key"], "targetPct": _r(b["t"]),
                                    "driftPct": _r(wt - b["t"])}
    return targets, row_fields, theme_fields
