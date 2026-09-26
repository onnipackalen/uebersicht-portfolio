#!/usr/bin/env python3
"""
display_prefs.py — the widget's windows and what each one shows
("_settings.display" in positions.json). Standard library only, any python3.

    "_settings": {"display": {"windows": [
      {"id": "main", "x": 812, "y": 2, "w": 720, "h": "auto", "zoom": 1,
       "prio": {"panel.sales": "room"}, "side": {"panel.news": "a"},
       "carousel": "stack"},
      {"id": "w2", "title": "news & alerts", "x": 40, "y": 60, "w": 360,
       "h": 420, "items": ["header.value", "header.day", "panel.news"]}]}}

Window fields (all optional except id): id (1-12 lowercase letters or
digits, starting with a letter, unique), title (1-40 characters), x and y
(screen pixels of the top-left, both or neither), w (300-1400 px), h
("auto" or 160-2000 px), zoom (0.6-1.6), items (the features shown, in
order), prio ({feature: "always" | "normal" | "room"}), side ({panel: "a" |
"b"}), carousel ("rotate" | "stack"), compact and graphBig (true / false), news
(the news page's options, 13.1 — see below). Unknown fields are dropped;
unknown feature ids are kept (a newer or older widget may know them).

news (an object, meaningful when the window shows panel.news; absent = the
13.0 news panel, present — even {} — = the news page with these defaults):
scope ("movers" | "holdings" | "watch" | "all" | "pick", default movers),
tickers (the "pick" list, up to 40 symbols, upper-cased, deduped), per
(headlines per ticker, 1-10, default 3), sort ("new" | "move" | "ticker",
default move), span ("day" | "3d" | "week" | "all", default all), group,
dense (default false), sources (default true), mute (up to 40 symbols
hidden in this window), q (a saved keyword, up to 60 characters). Fields
at their default are dropped inside `news`; the object itself is kept.

parse_display(text)  -> (value, error): strict, for set_setting.py. value is
                        the cleaned object, None ("default": remove the key)
                        or RESET ("reset-all").
clean_display(obj)   -> the cleaned object or None: lenient, for the
                        tracker's data.json "ui" (a hand-edited file never
                        breaks the widget; bad parts are dropped / clamped).
wants_news(obj)      -> True when a window shows the news panel.
news_plan(obj)       -> None when no window shows the news panel, else
                        {"scopes": sorted list, "tickers": sorted picks of
                        the pick-scope windows, "per": max(3, largest per)}
                        for the tracker's headline plan (13.1).
"""

import json
import math
import re

MAX_BYTES = 32768
MAX_WINDOWS = 8
MAX_ITEMS = 200
MAX_SIDE = 60
ID_MAX = 40
ID_RE = re.compile(r"[a-z][A-Za-z0-9]*(\.[A-Za-z0-9]+)*")
WIN_ID_RE = re.compile(r"[a-z][a-z0-9]{0,11}")
TITLE_MAX = 40
# control characters, line / paragraph separators, lone surrogates
TITLE_BAD_RE = re.compile("[\x00-\x1f\x7f-\x9f  \ud800-\udfff]")
# String.trim()'s whitespace set, so titles strip exactly as the widget's JS does
_JS_WS = "\t\n\x0b\x0c\r \xa0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff"
TITLE_TRIM_RE = re.compile("^[%s]+|[%s]+$" % (_JS_WS, _JS_WS))
W_RANGE = (300, 1400)
H_RANGE = (160, 2000)
ZOOM_RANGE = (0.6, 1.6)
X_RANGE = (-10000, 20000)       # same as set_setting.py's position
Y_RANGE = (0, 20000)
PRIOS = ("always", "normal", "room")
SIDES = ("a", "b")
CAROUSELS = ("rotate", "stack")
WIN_KEYS = ("id", "title", "x", "y", "w", "h", "zoom", "items", "prio", "side",
            "carousel", "compact", "graphBig", "news")
NEWS_PANEL = "panel.news"
# the news page (13.1): windows[i].news
NEWS_SCOPES = ("movers", "holdings", "watch", "all", "pick")
NEWS_SORTS = ("new", "move", "ticker")
NEWS_SPANS = ("day", "3d", "week", "all")
NEWS_PER_RANGE = (1, 10)
NEWS_LIST_MAX = 40
NEWS_Q_MAX = 60
# a Yahoo symbol: portfolio_file.TICKER_RE / portfolio_tracker.SYMBOL_RE
NEWS_TICKER_RE = re.compile(r"^\^?[A-Z0-9][A-Z0-9.\-=&]{0,19}$")
NEWS_DEFAULTS = (("scope", "movers"), ("tickers", []), ("per", 3), ("sort", "move"),
                 ("span", "all"), ("group", False), ("dense", False), ("sources", True),
                 ("mute", []), ("q", ""))
NEWS_MIN_PER = 3                # the tracker keeps at least this many per ticker


class _Reset(object):
    """parse_display's answer to "reset-all"."""
    def __repr__(self):
        return "RESET"


RESET = _Reset()


class _Bad(Exception):
    pass


def _is_int(v):
    return isinstance(v, int) and not isinstance(v, bool)


def _is_num(v):
    return (isinstance(v, (int, float)) and not isinstance(v, bool)
            and not (isinstance(v, float) and not math.isfinite(v)))


def _clamp(v, lo_hi):
    return max(lo_hi[0], min(lo_hi[1], v))


def _rint(v):
    """round half up, as the widget's Math.round does (round() rounds 2.5 to 2)."""
    return int(math.floor(v + 0.5))


def _zoom(v):
    v = round(v, 2)
    return int(v) if v == int(v) else v


def _feature_id(v):
    return isinstance(v, str) and len(v) <= ID_MAX and ID_RE.fullmatch(v) is not None


def _title(v):
    """the stripped title, or None when it isn't one."""
    if not isinstance(v, str):
        return None
    t = TITLE_TRIM_RE.sub("", v)
    if not 1 <= len(t) <= TITLE_MAX or TITLE_BAD_RE.search(t):
        return None
    return t


def _no_constant(name):
    raise ValueError(name)


def _news_q(v):
    """the keyword as saved, or None when it isn't one (text of up to
    NEWS_Q_MAX characters without control / format / line-separator code points)."""
    if not isinstance(v, str) or len(v) > NEWS_Q_MAX:
        return None
    import unicodedata
    if any(unicodedata.category(c) in ("Cc", "Cf", "Cs", "Co", "Zl", "Zp") for c in v):
        return None
    return v


def _news_tickers(v, strict):
    """a ticker list: upper-cased, deduped, order kept, up to NEWS_LIST_MAX;
    strict -> None on any bad entry, lenient -> bad entries dropped."""
    if not isinstance(v, list) or (strict and len(v) > NEWS_LIST_MAX):
        return None
    out = []
    for x in v:
        t = x.upper() if isinstance(x, str) else None
        if t is None or not NEWS_TICKER_RE.match(t) or len(t) > 21:
            if strict:
                return None
            continue
        if t not in out:
            if len(out) >= NEWS_LIST_MAX:
                if strict:
                    return None
                break
            out.append(t)
    return out


def _news_clean(v, strict, p=""):
    """windows[i].news -> the cleaned object (default-valued fields dropped,
    the object kept even when empty). strict: _Bad on a bad field;
    lenient: bad fields dropped, None for a non-object."""
    if not isinstance(v, dict):
        if strict:
            raise _Bad("%s.news must be an object" % p)
        return None
    out = {}
    for key, default in NEWS_DEFAULTS:
        if key not in v:
            continue
        x = v[key]
        if key == "scope":
            good = x in NEWS_SCOPES
            msg = "one of movers, holdings, watch, all, pick"
        elif key in ("tickers", "mute"):
            x = _news_tickers(x, strict)
            good = x is not None
            msg = "a list of up to 40 tickers"
        elif key == "per":
            good = _is_int(x) and NEWS_PER_RANGE[0] <= x <= NEWS_PER_RANGE[1]
            msg = "a whole number from 1 to 10"
        elif key == "sort":
            good = x in NEWS_SORTS
            msg = "one of new, move, ticker"
        elif key == "span":
            good = x in NEWS_SPANS
            msg = "one of day, 3d, week, all"
        elif key == "q":
            x = _news_q(x)
            good = x is not None
            msg = "text of up to 60 characters"
        else:                       # group, dense, sources
            good = isinstance(x, bool)
            msg = "true or false"
        if not good:
            if strict:
                raise _Bad("%s.news.%s must be %s" % (p, key, msg))
            continue
        if x != default:
            out[key] = x
    return out


# --------------------------------------------------------------------------
# strict (set_setting.py)
# --------------------------------------------------------------------------

def _strict_window(i, w, seen):
    p = "display.windows[%d]" % i
    if not isinstance(w, dict):
        raise _Bad("%s must be an object" % p)
    out = {}
    wid = w.get("id")
    if not (isinstance(wid, str) and WIN_ID_RE.fullmatch(wid)):
        raise _Bad("%s.id must be 1-12 lowercase letters or digits, starting with a letter" % p)
    if wid in seen:
        raise _Bad("%s.id '%s' is used twice" % (p, wid))
    seen.add(wid)
    out["id"] = wid
    if "title" in w:
        t = _title(w["title"])
        if t is None:
            raise _Bad("%s.title must be text of 1 to 40 characters" % p)
        out["title"] = t
    if "x" in w or "y" in w:
        if not (_is_int(w.get("x")) and _is_int(w.get("y"))):
            raise _Bad("%s.x and .y must be whole numbers (both or neither)" % p)
        out["x"] = _clamp(w["x"], X_RANGE)
        out["y"] = _clamp(w["y"], Y_RANGE)
    if "w" in w:
        v = w["w"]
        if not (_is_int(v) and W_RANGE[0] <= v <= W_RANGE[1]):
            raise _Bad("%s.w must be a whole number from 300 to 1400" % p)
        out["w"] = v
    if "h" in w:
        v = w["h"]
        if not (v == "auto" or (_is_int(v) and H_RANGE[0] <= v <= H_RANGE[1])):
            raise _Bad('%s.h must be "auto" or a whole number from 160 to 2000' % p)
        out["h"] = v
    if "zoom" in w:
        v = w["zoom"]
        if not (_is_num(v) and ZOOM_RANGE[0] <= v <= ZOOM_RANGE[1]):
            raise _Bad("%s.zoom must be a number from 0.6 to 1.6" % p)
        out["zoom"] = _zoom(v)
    if "items" in w:
        v = w["items"]
        if not (isinstance(v, list) and len(v) <= MAX_ITEMS and all(_feature_id(x) for x in v)):
            raise _Bad("%s.items must be a list of up to 200 feature ids" % p)
        items = []
        for x in v:
            if x not in items:
                items.append(x)
        out["items"] = items
    if "prio" in w:
        v = w["prio"]
        if not (isinstance(v, dict) and len(v) <= MAX_ITEMS
                and all(_feature_id(k) and x in PRIOS for k, x in v.items())):
            raise _Bad("%s.prio must map feature ids to always, normal or room" % p)
        out["prio"] = dict(v)
    if "side" in w:
        v = w["side"]
        if not (isinstance(v, dict) and len(v) <= MAX_SIDE
                and all(_feature_id(k) and x in SIDES for k, x in v.items())):
            raise _Bad("%s.side must map panel ids to a or b" % p)
        out["side"] = dict(v)
    if "carousel" in w:
        if w["carousel"] not in CAROUSELS:
            raise _Bad("%s.carousel must be rotate or stack" % p)
        out["carousel"] = w["carousel"]
    for k in ("compact", "graphBig"):
        if k in w:
            if not isinstance(w[k], bool):
                raise _Bad("%s.%s must be true or false" % (p, k))
            out[k] = w[k]
    if "news" in w:
        out["news"] = _news_clean(w["news"], True, p)
    return out


def parse_display(text):
    """The raw `setting display VALUE` argument (never lower-cased: feature
    ids have capitals) -> (value, None) or (None, error text)."""
    text = text if isinstance(text, str) else str(text)
    word = text.strip().lower()
    if word in ("default", "none"):
        return None, None
    if word == "reset-all":
        return RESET, None
    if len(text.encode("utf-8", "surrogatepass")) > MAX_BYTES:
        return None, "display is too long (max %d bytes)" % MAX_BYTES
    try:
        obj = json.loads(text, parse_constant=_no_constant)
    except Exception:           # ValueError, RecursionError (deep nesting)
        return None, "display is not valid JSON"
    if not isinstance(obj, dict):
        return None, "display must be a JSON object"
    wins = obj.get("windows")
    if not (isinstance(wins, list) and 1 <= len(wins) <= MAX_WINDOWS):
        return None, "display.windows must be a list of 1 to 8 windows"
    seen = set()
    try:
        out = [_strict_window(i, w, seen) for i, w in enumerate(wins)]
    except _Bad as e:
        return None, str(e)
    return {"windows": out}, None


# --------------------------------------------------------------------------
# lenient (portfolio_tracker.py -> data.json "ui.display")
# --------------------------------------------------------------------------

def _lenient_window(w, seen):
    if not isinstance(w, dict):
        return None
    wid = w.get("id")
    if not (isinstance(wid, str) and WIN_ID_RE.fullmatch(wid)) or wid in seen:
        return None
    seen.add(wid)
    out = {"id": wid}
    t = _title(w.get("title"))
    if t is not None:
        out["title"] = t
    x, y = w.get("x"), w.get("y")
    if _is_num(x) and _is_num(y):
        out["x"] = _clamp(_rint(x), X_RANGE)
        out["y"] = _clamp(_rint(y), Y_RANGE)
    if _is_num(w.get("w")):
        out["w"] = _clamp(_rint(w["w"]), W_RANGE)
    h = w.get("h")
    if h == "auto":
        out["h"] = "auto"
    elif _is_num(h):
        out["h"] = _clamp(_rint(h), H_RANGE)
    if _is_num(w.get("zoom")):
        out["zoom"] = _zoom(_clamp(w["zoom"], ZOOM_RANGE))
    if isinstance(w.get("items"), list):
        items = []
        for x in w["items"]:
            if _feature_id(x) and x not in items:
                items.append(x)
                if len(items) >= MAX_ITEMS:
                    break
        out["items"] = items
    for key, vals, cap in (("prio", PRIOS, MAX_ITEMS), ("side", SIDES, MAX_SIDE)):
        if isinstance(w.get(key), dict):
            m = {}
            for k, v in w[key].items():
                if len(m) >= cap:
                    break
                if _feature_id(k) and isinstance(v, str) and v in vals:
                    m[k] = v
            out[key] = m
    if w.get("carousel") in CAROUSELS:
        out["carousel"] = w["carousel"]
    for k in ("compact", "graphBig"):
        if isinstance(w.get(k), bool):
            out[k] = w[k]
    if "news" in w:
        n = _news_clean(w["news"], False)
        if n is not None:
            out["news"] = n
    return out


def clean_display(obj):
    """_settings.display as saved -> the cleaned object or None. Never
    raises: bad windows are skipped, bad fields dropped, numbers clamped."""
    try:
        if not isinstance(obj, dict) or not isinstance(obj.get("windows"), list):
            return None
        seen = set()
        out = []
        for w in obj["windows"]:
            c = _lenient_window(w, seen)
            if c is not None:
                out.append(c)
                if len(out) >= MAX_WINDOWS:
                    break
        return {"windows": out} if out else None
    except Exception:
        return None


def wants_news(obj):
    """True when some window of the (cleaned) display shows the news panel."""
    d = clean_display(obj)
    return bool(d) and any(NEWS_PANEL in w.get("items", ()) for w in d["windows"])


def news_plan(obj):
    """The tracker's headline plan from the (cleaned) display: None when no
    window shows the news panel, else {"scopes": sorted scopes of those
    windows (a window without `news` = "movers"), "tickers": sorted picks
    of the pick-scope windows, "per": max(3, the largest per)}."""
    d = clean_display(obj)
    if not d:
        return None
    scopes, picks, per = set(), set(), NEWS_MIN_PER
    for w in d["windows"]:
        if NEWS_PANEL not in w.get("items", ()):
            continue
        cfg = w.get("news") or {}
        scope = cfg.get("scope", "movers")
        scopes.add(scope)
        if scope == "pick":
            picks.update(cfg.get("tickers", ()))
        per = max(per, cfg.get("per", 3))
    if not scopes:
        return None
    return {"scopes": sorted(scopes), "tickers": sorted(picks), "per": int(per)}
