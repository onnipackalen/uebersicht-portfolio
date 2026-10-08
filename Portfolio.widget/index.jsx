// Portfolio.widget — index.jsx
// ------------------------------------------------------------------
// Übersicht desktop widget: portfolio value and graph, holdings as a list or
// a heatmap, per-stock volatility scores, upcoming earnings and alerts.
// Data comes from widget_command.sh (see README.md). Übersicht notes:
// updateState must handle UB/COMMAND_RAN, and no JSX fragments (<>…</>).

import { css, run } from "uebersicht";

// Übersicht runs commands from the widgets folder and a widget can't find
// its own folder, so the folder name is fixed here. Renamed it? Change DIR.
const DIR = "Portfolio.widget";

export const command =
  `if cd "${DIR}" 2>/dev/null; then bash ./widget_command.sh; else ` +
  `echo '{"status":"error","cacheAgeSeconds":0,"lastFetchFailed":false,"progress":null,"data":null,"errorText":"This folder must be named ${DIR} and sit directly inside your Übersicht widgets folder (or change DIR at the top of index.jsx)."}'; fi`;
export const refreshFrequency = 5000;

// rows per page, graph heights and every other size: LAYOUT_K + layoutFor (12.12)
const TICKS_PER_PAGE = 3;  // 3 refreshes x 5 s = 15 s per page/section
const OLDER_CHUNK = 200;   // older day rows fetched per "older ›" (data.json carries the newest ~400)
const MAX_GRAPH_PTS = 1260; // a long custom span is thinned to ~2 points per pixel
const RANGES = ["1H", "1D", "1W", "1M", "1Y"];
const DETAIL_RANGES = ["1H", "1D", "1W", "1M", "3M", "1Y"];
// the main graph also has "ALL" (since the first purchase) and longer tabs (d.backtest.tabs, per _settings.backtestYears): before the first
// purchase they show today's holdings simulated back ("backtest")
const BT_RANGES = ["3Y", "5Y", "10Y", "MAX"];
const BT_YEARS = { "3Y": 3, "5Y": 5, "10Y": 10 };
const BT_MODE_WORDS = { held: "as held now", weighted: "as weighted now" };
const SORTS = ["az", "value", "day", "vol"];
const SORT_LABEL = { az: "a–z", value: "$", day: "day", vol: "vol" };
const SORT_TIP = {
  az: "sorted by ticker", value: "sorted by value, largest first",
  day: "sorted by today's move, best first", vol: "sorted by volatility, wildest first",
};

// Übersicht keeps a widget's state when it hot-reloads a changed index.jsx —
// which is exactly what happens when an update replaces this file while the
// app is running. State from another version can lack fields this one reads
// (that crashed the 12.x upgrade with "undefined is not an object"), so any
// state not stamped with this version starts over, keeping only the data
// that is already on screen. Bump it whenever the state's shape changes.
const STATE_VERSION = "13.4";
// the release (CHANGELOG.md); the footer offers an update when GitHub's newest release is newer
const VERSION = "13.4";

// older day-by-day rows loaded on demand ("older ›", an old date typed in the
// date box, a custom start before the newest ~400 days). `key` ties them to
// the table they came from (see dailyKey) so they are dropped when it changes.
const NO_OLDER = { key: null, rows: [], busy: false, msg: null };

export const initialState = {
  v: STATE_VERSION,
  raw: null, parseError: null, tick: 0, rot: 0, hover: false,
  range: "1D", graphMode: "value", plMode: "cost",
  view: "list", mapRange: "1D", mapExpanded: false, sort: "az",
  pinnedPage: null, pinnedSection: null, focusTicker: null,
  showAdd: false, addForm: { ticker: "", shares: "", cost: "", date: "" },
  addMsg: null, pendingAction: null,
  search: { query: "", results: [], busy: false, error: null }, picked: null,
  lookTicker: null,  // the stock this window last looked up (its data sits in lookBy, 12.12)
  detailRange: "3M", detailMsg: null,
  mark: null,      // pinned point: {t} from a graph click, or {t, v, d, approx, asked} for a picked day
                   // (sim: true = a simulated moment, before the first purchase)
  hoverT: null,    // time under the pointer on a graph
  dayInput: "", dayMsg: null, dayPage: 0, earnPage: 0, sectorScale: "shared",
  from: null,          // custom graph start {t, v?, approx?} — set with "from here"
  sectorFocus: null,   // the sector enlarged in the sectors view ("portfolio" = the whole)
  sectorOrder: "best", // sector charts: best performer first, or "size" (biggest holding first)
  graphBig: null,      // the value / p&l graph enlarged (the ⤢ toggle); null = as saved (data.ui)
  showBench: null,     // the index line on the value graph; null = as saved (data.ui)
  older: NO_OLDER,     // older day rows loaded on demand
  btMode: "held",      // simulated part: today's share counts ("held") or today's weights ("weighted")
  salesExpanded: false, // sales panel: the newest 5 sales, or all (up to 20)
  pos: null,           // where it was dragged {x, y}; false = back to the default spot; null = as saved (data.ui)
  scale: null,         // its size (the corner grip), 0.6–1.6; null = as saved (data.ui)
  alertInput: "", alertMsg: null, alertBusy: false,   // the "alert at…" box in a detail view (12.9)
  alertMsgTick: 0,     // the data tick its message came at (the panel's fades 3 ticks later)
  newsPref: null,      // headlines on/off; null = as saved (data.ui.news)
  alertsExpanded: false, // price alerts panel: the first 5 rules, or all
  rebalWhole: null,      // rebalance panel: whole shares (true) or fractional; null = as saved (data.ui), else auto (12.10)
  rebalExpanded: false,  // rebalance panel: the first 5 trades, or all
  // the index under the graph (_settings.benchmark, 12.10). Read with defaults
  // (benchWantOf, `|| ""`), so a 12.10 state saved before these existed is fine
  benchWant: null,       // "auto" | "none" | SYMBOL picked this session; null = as saved (data.ui.benchmark)
  benchSaved: false,     // set_setting.py saved benchWant (so data.json's ui carries it from now on)
  benchPick: false,      // the index picker is open
  benchInput: "",        // its "other symbol" box
  benchMsg: null,        // its message (a rejected symbol, a failed save)
  compact: null,         // one line (a title click, 12.11); null = as saved (data.ui.compact)
  exportMsg: null,       // the footer's export message {text, err, tick}
  // windows (12.12): several framed boxes from one widget (_settings.display)
  wins: {},              // window id -> that window's own state (WIN_KEYS), created on first use
  display: null,         // this session's display (normDisplay); false = back to one plain window; null = as saved (data.ui.display)
  geo: null,             // {id, x, y, w, h, zoom} while a grip is dragged (live layout, no save yet)
  front: null,           // the window on top
  lookBy: {},            // ticker -> {data, busy, error}: full chart data per stock (was the one-slot `look`)
  newsBy: {},            // ticker -> {items, busy, error}: headlines per stock (was the one-slot `news`)
  editOpen: false, editGroup: null, editConfirm: null,   // the ⚙ editor (per window)
  newsPage: 0,           // the news panel's page (per window)
  newsQuery: null, newsQFrom: "",   // the news page's live keyword (13.1; newsQFrom = the cfg.q it was typed over; not saved)
  newsPickMsg: null,     // the news page editor's "not a ticker: …" note (5 s)
  // the ⚙ editor (13.2, shared by every window): the "arrange" switch (order,
  // columns, priorities, moves), the hint lines, the note after a currency /
  // history save {key, epoch, msg} (shown while data.json still carries that
  // epoch) and a per-setting message {key: text} (an error, or a 5 s note)
  editAdvanced: false, editHints: true, settingPending: null, editMsg: {},
  // 13.4: the editor's search box (per window); the import panel of the +
  // form {open, text, file, rows, ok, skipped, busy, msg} (shared); the
  // update offer in the footer: its question open, "later" for a version,
  // a message {text, err, tick}, "checking…" for the editor's check-now chip
  editQuery: "",
  imp: null,
  updateAsk: false, updateLater: null, updateMsg: null, updateChecking: false,
};

// Per-window state: every window keeps its own copy of these (range, pinned
// point, view, open stock…); the rest of the state is shared by all windows.
const WIN_KEYS = ["range", "graphMode", "plMode", "view", "mapRange", "mapExpanded", "sort", "pinnedPage",
  "pinnedSection", "focusTicker", "lookTicker", "showAdd", "detailRange", "detailMsg", "mark", "hoverT", "dayInput",
  "dayMsg", "dayPage", "earnPage", "sectorScale", "sectorOrder", "from", "sectorFocus", "btMode", "salesExpanded",
  "alertInput", "alertMsg", "alertBusy", "alertMsgTick", "alertsExpanded", "rebalExpanded", "benchPick",
  "benchInput", "benchMsg", "rot", "hover", "editOpen", "editGroup", "editConfirm", "newsPage", "newsQuery", "newsQFrom", "newsPickMsg",
  "editQuery"];
const WIN_INITIAL = {};
WIN_KEYS.forEach((k) => { WIN_INITIAL[k] = initialState[k]; });

const NO_SEARCH = { query: "", results: [], busy: false, error: null };
const IMPORT_EMPTY = { open: true, text: "", file: null, rows: null, ok: 0, skipped: 0, busy: false, msg: null };
const EMPTY_FORM = { ticker: "", shares: "", cost: "", date: "" };

const merge = (prev, patch) => Object.assign({}, prev, patch);
// Stale state starts over; the data on screen, the graph-size and one-line
// choices (plain booleans, safe in any version) and where the widget was
// dragged / how big it is (checked, so any shape is safe) carry over.
const sane = (st) => (st && st.v === STATE_VERSION ? st
  : Object.assign({}, initialState, { raw: st && st.raw ? st.raw : null,
    graphBig: st && typeof st.graphBig === "boolean" ? st.graphBig : null,
    compact: st && typeof st.compact === "boolean" ? st.compact : null,
    pos: st && st.pos === false ? false : validPos(st && st.pos),
    scale: validScale(st && st.scale) }));

// Display choices saved in _settings (widget_command.sh setting; data.ui,
// 12.7+) so they survive a restart; a click this session wins until the
// next data.json carries it too.
const uiPrefs = (st) => {
  const d = st && st.raw && st.raw.data;
  return d && d.ui && typeof d.ui === "object" ? d.ui : {};
};
const graphBigOf = (st) => (typeof st.graphBig === "boolean" ? st.graphBig : uiPrefs(st).graphBig === true);
// one line (_settings.compact, 12.11): off unless saved or clicked on
const compactOf = (st) => (typeof st.compact === "boolean" ? st.compact : uiPrefs(st).compact === true);
const showBenchOf = (st) => (typeof st.showBench === "boolean" ? st.showBench : uiPrefs(st).showBenchmark !== false);
// headlines are opt-in (_settings.news, 12.9): off unless saved or clicked on
const newsOn = (st) => (typeof st.newsPref === "boolean" ? st.newsPref : uiPrefs(st).news === true);

// Target allocation (_settings.targets, 12.10): d.targets is null/absent without
// targets — then nothing on screen changes. `set` false = only warnings.
const targetsOn = (d) => !!(d && d.targets && typeof d.targets === "object" && d.targets.set === true);
// whole shares or fractional: this session's click, else saved (ui.rebalanceWhole),
// else whole when every holding is a whole number of shares
const wholeOf = (st, d) => {
  if (typeof st.rebalWhole === "boolean") return st.rebalWhole;
  const ui = d && d.ui && typeof d.ui === "object" ? d.ui : {};
  if (typeof ui.rebalanceWhole === "boolean") return ui.rebalanceWhole;
  const ps = d && Array.isArray(d.positions) ? d.positions : [];
  return ps.every((p) => typeof p.shares !== "number" || Math.abs(p.shares - Math.round(p.shares)) < 1e-6);
};
const targetBuckets = (d) => (targetsOn(d) && Array.isArray(d.targets.buckets)
  ? d.targets.buckets.filter((b) => b && typeof b.key === "string") : []);
const bucketFor = (d, key) => (typeof key === "string" ? targetBuckets(d).find((b) => b.key === key) || null : null);
const bandOf = (d) => (d && d.targets && typeof d.targets.band === "number" && isFinite(d.targets.band) ? d.targets.band : 1);
// drift in percentage points: "+2.3", "−0.4", "0.0"
const fmtPts = (v) => (typeof v !== "number" || !isFinite(v) ? "—" : Math.abs(v) < 0.05 ? "0.0"
  : (v > 0 ? "+" : "−") + Math.abs(v).toFixed(Math.abs(v) >= 99.95 ? 0 : 1));
const fmtTarget = (v) => (typeof v === "number" && isFinite(v) ? String(Math.round(v * 100) / 100) + "%" : "—");

// Where the widget sits and how big it is (_settings.position / .scale via
// data.ui, 12.8): a drag this session wins, like the display choices above.
const SCALE_MIN = 0.6, SCALE_MAX = 1.6;
const isNumber = (v) => typeof v === "number" && isFinite(v);
function validPos(p) {
  return p && typeof p === "object" && isNumber(p.x) && isNumber(p.y)
    ? { x: Math.round(p.x), y: Math.round(p.y) } : null;
}
function validScale(v) {
  return isNumber(v) ? Math.round(Math.max(SCALE_MIN, Math.min(SCALE_MAX, v)) * 100) / 100 : null;
}
// Until the first command output after a restart there is no data.ui: the
// last spot/size this viewer saw (localStorage, a per-viewer copy only;
// _settings stays the truth) keeps the widget from jumping once it arrives.
const FRAME_KEY = "portfolio-widget.frame";
let lastFrame;   // cached JSON string of { pos, scale }
const readFrame = () => {
  if (lastFrame === undefined) {
    try { lastFrame = window.localStorage.getItem(FRAME_KEY) || ""; } catch (e) { lastFrame = ""; }
  }
  try { const f = JSON.parse(lastFrame); return f && typeof f === "object" ? f : {}; } catch (e) { return {}; }
};
// (the first window's; w only when it isn't the default 664 — the 12.8 format otherwise)
const rememberFrame = (pos, s, w) => {
  const v = JSON.stringify(isNumber(w) && w !== WIDGET_W ? { pos: pos || null, scale: s, w: w } : { pos: pos || null, scale: s });
  if (v === lastFrame) return;
  lastFrame = v;
  try { window.localStorage.setItem(FRAME_KEY, v); } catch (e) { /* private window, blocked storage: fine */ }
};
const hasData = (st) => !!(st && st.raw && st.raw.data);
const posOf = (st) => (st.pos === false ? null : validPos(st.pos) ||
  validPos(hasData(st) ? uiPrefs(st).position : readFrame().pos));
const scaleOf = (st) => validScale(st.scale) ||
  validScale(hasData(st) ? uiPrefs(st).scale : readFrame().scale) || 1;

// ------------------------------------------------------------------ layout constants (12.12)
// Every size the layout engine (layoutFor, below the sections) works with, in
// unscaled px. Heights are on the generous side: an overestimate only leaves
// spare room. The 12.11 window (664 wide, auto height) gets 12.11's numbers
// exactly: content 630, graph 628 × 104 (240 big), columns 300.5, map 340 × 420,
// expanded map 632 × 640, price chart 300, caption 470, eyebrow 170, rows 12/24/10.
const LAYOUT_K = {
  PAD_X: 34, BASE_CW: 630, GUTTER: 29, COL2: 549, COL3: 958, MAP_FLEX: 1.35,
  BASE_GRAPH_W: 628, GRAPH_H: 104, GRAPH_H_BIG: 240, G_MIN: 0.75, G_MAX: 1.5,
  GRAPH_STEP: 8, GRAPH_MIN: 64, GRAPH_MIN_F: 0.6, GRAPH_MAX_F: 0.5, GRAPH_MAX: 480,
  SECTOR_FACET: 157, SECTOR_GAP: 14, SECTOR_H: 48, SECTOR_ROW: 64, SECTOR_ROWGAP: 9, SECTOR_MAXCOLS: 6,
  MAP_H: 420, MAP_MIN: 160, MAP_STEP: 20, MAP_BIG_H: 640, MAP_INSET: 5,
  CAPTION_OFF: 158, EYEBROW_OFF: 130, PRICE_W: 300, PRICE_H: 118, SPARK: 54,
  ROWS: { holdings: 12, earnings: 24, days: 10, news: 6 },
  ROWS_MIN: { holdings: 4, earnings: 4, days: 4, news: 3 },
  ROWS_MAX: { holdings: 40, earnings: 60, days: 30, news: 1000 },
  CELL: { ticker: 52, spark: 54, vol: 16, drift: 30, day: 44, value: 52, pl: 48, price: 52 },
  CELL_DROP: ["spark30", "spark", "price", "value", "vol", "drift", "pl"], SPARK_MID: 30, UNDATED_GAP: 3,
  WATCH: { ticker: 60, name: 6, spark: 54, vol: 16, day: 44, price: 54, x: 10 },
  WATCH_DROP: ["spark30", "spark", "vol"],
  MONO: 0.62, TAB_PAD: 14, TAB_PAD_TIGHT: 8, TAB_BIG: 20, TAB_RESERVE: 80, DATE_BOX: 82, SEP: 16,
  CHROME: 38, GAP: 19, HDR1: 29, HDRN: 13, TABS: 16, READOUT: 15, GRAPH_MT: 4, AXIS: 12, NOTES: 11,
  CAPTION: 11, SIMCAP: 11, EYEBROW: 13, ROW_HOLD: 16, ROW_EARN: 15, ROW_DAY: 15, ROW_NEWS: 27,
  ROW_NEWS_DENSE: 14, ROW_NEWS_GROUP: 14, NEWS_FILTER: 18, NEWS_STATUS: 11,
  ROW_ALERT: 13, ROW_LINE: 13, DOTS: 15, PAGER: 16, FOOTER: 11, LOADING: 18, HINT: 14, MINI: 36,
  ADD_FORM: 124, STAT: 16, BENCH_PICK: 180, COMPACT_SPARK: 90, WELCOME: 78, IMPORT: 118,
  // panel estimates (est.* in renderWin): fixed parts and one row each
  DETAIL: 262, DETAIL_X: 58, EMPTY_MSG: 44, MAPTABS: 16, MOVER_ROW: 14, TODAY_FIX: 30, THEME_ROW: 18,
  RISK_ROW: 13, RISK_FIX: 62, INCOME: 64, REBAL_FIX: 28, SALE_ROW: 14, RULE_ROW: 15, MORE: 14, WATCH_ROW: 16,
  THEME_MIN: 272, COL_BASE: 300, EYE_CH: 7.2, CHIP_PAD: 14, CHIP_TIGHT: 8, TAB_SEP: 17, COL_GAP: 8,
};
const WIDGET_W = LAYOUT_K.BASE_CW + LAYOUT_K.PAD_X;   // 664: a window's default width

// ------------------------------------------------------------------ windows (12.12)
// The widget can show several WINDOWS (_settings.display.windows, via data.ui):
// each its own framed box with its own spot, size, zoom, title, features and
// per-window state (WIN_KEYS). Without _settings.display there is exactly one
// window, "main", which is 12.11's widget (position/scale/compact/graphBig).
//
// Every feature a window can show (kind: head = header line, block, part =
// on/off sub-feature, panel, cell = holding-row cell; p = default priority;
// side a/b = left/right column; car = in the left carousel; full: false = not
// in the full template, i.e. not in 12.11's look).
const FEATURES = [
  { id: "header.value", label: "total value", tip: "what everything you own is worth right now", kind: "head", p: "always" },
  { id: "header.day", label: "today's change", tip: "how much the portfolio moved today", kind: "head", p: "always" },
  { id: "header.fx", label: "price and currency moves", tip: "today's price move and the currency move, side by side", kind: "head", p: "room" },
  { id: "header.pl", label: "profit / loss", tip: "click it to see it against what you invested", kind: "head", p: "normal" },
  { id: "header.div", label: "dividends per year", tip: "the dividends you can expect in a year", kind: "head", p: "room" },
  { id: "header.realized", label: "realized gains", tip: "profit or loss from what you have already sold", kind: "head", p: "room" },
  { id: "header.totalReturn", label: "total return", tip: "profit plus dividends, against what you invested", kind: "head", p: "room" },
  { id: "header.annual", label: "annual return", tip: "the yearly return, on average", kind: "head", p: "room" },
  { id: "graph", label: "graph", tip: "the value graph", kind: "block", p: "normal" },
  { id: "graph.tabs", label: "time range buttons", tip: "the 1D · 1W · 1M … buttons that set the graph's time range", kind: "part", parent: "graph", p: "normal" },
  { id: "graph.range.1H", label: "1H", tip: "the last hour", kind: "part", parent: "graph.tabs" },
  { id: "graph.range.1D", label: "1D", tip: "today", kind: "part", parent: "graph.tabs" },
  { id: "graph.range.1W", label: "1W", tip: "the last week", kind: "part", parent: "graph.tabs" },
  { id: "graph.range.1M", label: "1M", tip: "the last month", kind: "part", parent: "graph.tabs" },
  { id: "graph.range.1Y", label: "1Y", tip: "the last year", kind: "part", parent: "graph.tabs" },
  { id: "graph.range.3Y", label: "3Y", tip: "the last 3 years", kind: "part", parent: "graph.tabs" },
  { id: "graph.range.5Y", label: "5Y", tip: "the last 5 years", kind: "part", parent: "graph.tabs" },
  { id: "graph.range.10Y", label: "10Y", tip: "the last 10 years", kind: "part", parent: "graph.tabs" },
  { id: "graph.range.MAX", label: "MAX", tip: "as far back as the history goes", kind: "part", parent: "graph.tabs" },
  { id: "graph.range.ALL", label: "ALL", tip: "since your first purchase", kind: "part", parent: "graph.tabs" },
  { id: "graph.modes", label: "value / profit / sectors buttons", tip: "switch the graph between value, profit and sectors", kind: "part", parent: "graph.tabs" },
  { id: "graph.mode.value", label: "value", tip: "the graph shows what the portfolio is worth", kind: "part", parent: "graph.modes" },
  { id: "graph.mode.pl", label: "p&l", tip: "the graph shows profit or loss", kind: "part", parent: "graph.modes" },
  { id: "graph.mode.sectors", label: "sectors", tip: "the graph shows each sector", kind: "part", parent: "graph.modes" },
  { id: "graph.date", label: "jump to a date", tip: "type a date to jump the graph there", kind: "part", parent: "graph.tabs" },
  { id: "graph.readout", label: "value under the mouse", tip: "the value at the point under the mouse", kind: "part", parent: "graph.tabs" },
  { id: "graph.big", label: "bigger-graph button (⤢)", tip: "the button that makes the graph taller", kind: "part", parent: "graph.tabs" },
  { id: "graph.bench", label: "index line", tip: "a thin grey line for the index you compare with", kind: "part", parent: "graph", p: "room" },
  { id: "graph.benchPicker", label: "index chooser", tip: "the link that lets you pick another index", kind: "part", parent: "graph.bench" },
  { id: "graph.backtest", label: "'what if you had bought earlier'", tip: "what the portfolio would have done if bought earlier", kind: "part", parent: "graph", p: "room" },
  { id: "graph.late", label: "note for newer holdings", tip: "a note when a holding is newer than the graph's start", kind: "part", parent: "graph", p: "room" },
  { id: "graph.notes", label: "notes under the graph", tip: "small notes under the graph (data gaps, loading)", kind: "part", parent: "graph", p: "room" },
  { id: "panel.today", label: "today's biggest movers", tip: "today's biggest risers and fallers", kind: "panel", p: "normal", side: "a", car: true },
  { id: "panel.sectors", label: "sectors", tip: "how much sits in each sector", kind: "panel", p: "normal", side: "a", car: true },
  { id: "panel.risk", label: "risk numbers", tip: "how risky the mix is (swings, concentration)", kind: "panel", p: "normal", side: "a", car: true },
  { id: "panel.days", label: "day-by-day results", tip: "one line per day: value and change", kind: "panel", p: "room", side: "a", car: true },
  { id: "panel.holdings", label: "holdings", tip: "the list of everything you own; click one for its detail", kind: "panel", p: "normal", side: "a" },
  { id: "holdings.list", label: "list", tip: "the plain list of holdings", kind: "part", parent: "panel.holdings" },
  { id: "holdings.map", label: "heat map", tip: "a map of boxes sized by value, coloured by change", kind: "part", parent: "panel.holdings" },
  { id: "holdings.watch", label: "watchlist", tip: "stocks you follow but don't own", kind: "part", parent: "panel.holdings" },
  { id: "holdings.add", label: "buy / sell button", tip: "the button that records a purchase or a sale", kind: "part", parent: "panel.holdings" },
  { id: "holdings.sort", label: "sort buttons", tip: "the buttons that sort the list", kind: "part", parent: "panel.holdings" },
  { id: "holdings.pages", label: "page dots", tip: "the dots that page a long list", kind: "part", parent: "panel.holdings" },
  { id: "map.drift", label: "heat map: colour by off-target", tip: "colour the map by how far each holding is from its target", kind: "part", parent: "holdings.map" },
  { id: "detail.alerts", label: "stock detail: price alert box", tip: "the price-level box in a stock's detail view", kind: "part", parent: "panel.holdings" },
  { id: "detail.news", label: "stock detail: headlines", tip: "headlines in a stock's detail view", kind: "part", parent: "panel.holdings" },
  { id: "detail.target", label: "stock detail: target line", tip: "the target share line in a stock's detail view", kind: "part", parent: "panel.holdings" },
  { id: "panel.earnings", label: "earnings dates", tip: "when each company reports next", kind: "panel", p: "normal", side: "b" },
  { id: "panel.sales", label: "sales and realized gains", tip: "what you sold and the profit on it", kind: "panel", p: "room", side: "b" },
  { id: "panel.income", label: "dividend income", tip: "dividends received and expected", kind: "panel", p: "room", side: "b" },
  { id: "panel.rebalance", label: "rebalancing", tip: "what to buy or sell to get back to your targets", kind: "panel", p: "normal", side: "b" },
  { id: "panel.priceAlerts", label: "your price alerts", tip: "price levels you set yourself — works without big-move alerts", kind: "panel", p: "normal", side: "b" },
  { id: "panel.alerts", label: "big moves this week", tip: "the week's big moves — needs Portfolio → big-move alerts on", kind: "panel", p: "normal", side: "b" },
  { id: "panel.news", label: "news", tip: "headlines for your holdings", kind: "panel", p: "normal", side: "b", full: false },
  { id: "row.spark", label: "tiny price graph", tip: "a small graph of the last days' prices", kind: "cell" },
  { id: "row.vol", label: "how jumpy (volatility)", tip: "how much the price swings", kind: "cell" },
  { id: "row.drift", label: "off-target badge", tip: "how far the holding is from its target share", kind: "cell" },
  { id: "row.day", label: "today's %", tip: "today's move in percent", kind: "cell" },
  { id: "row.value", label: "value", tip: "what the holding is worth", kind: "cell" },
  { id: "row.pl", label: "profit %", tip: "profit or loss in percent", kind: "cell" },
  { id: "row.bell", label: "alert bell", tip: "a bell when a price alert is set on it", kind: "cell" },
  { id: "row.news", label: "news dot", tip: "a dot when there are fresh headlines", kind: "cell" },
  { id: "row.price", label: "price in its own currency", tip: "the price in the stock's own currency", kind: "cell", full: false },
  { id: "footer", label: "bottom row", tip: "the dim row at the bottom", kind: "block", p: "room" },
  { id: "footer.stats", label: "small print (costs, saved data)", tip: "estimated data costs and how much history is saved", kind: "part", parent: "footer" },
  { id: "footer.updated", label: "'updated … ago'", tip: "when the data was last updated", kind: "part", parent: "footer" },
  { id: "footer.export", label: "export link", tip: "a link that exports the holdings to a file", kind: "part", parent: "footer" },
];
const FEATURE_BY = {};
FEATURES.forEach((f) => { FEATURE_BY[f.id] = f; });
const FULL_ITEMS = FEATURES.filter((f) => f.full !== false).map((f) => f.id);   // 12.11's look, in order
// id is `root` or sits under it (a part of a part of it…)
const isUnder = (id, root) => {
  for (let f = FEATURE_BY[id]; f; f = FEATURE_BY[f.parent]) if (f.id === root) return true;
  return id === root;
};
const pickItems = (roots) => FULL_ITEMS.filter((id) => roots.some((r) => isUnder(id, r)));
const HEAD2 = ["header.value", "header.day"];
// "+ new window" starts from one of these (x/y: placeNear)
const TEMPLATES = [
  { key: "full", label: "full", desc: "everything, like the classic widget", w: WIDGET_W, h: "auto" },
  { key: "graph", label: "graph only", desc: "just the graph with the totals above", items: pickItems(HEAD2.concat(["graph"])), w: WIDGET_W, h: 260 },
  { key: "holdings", label: "holdings", desc: "the holdings list on its own", w: 380, h: "auto",
    items: pickItems(HEAD2.concat(["panel.holdings"], FULL_ITEMS.filter((id) => FEATURE_BY[id].kind === "cell"))) },
  { key: "news", label: "news & alerts", desc: "headlines and alerts, nothing else", items: HEAD2.concat(["panel.news", "panel.priceAlerts", "panel.alerts"]), w: 360, h: 420, news: true,
    tip: "today's movers' headlines, price alerts and alerts" },
  { key: "newspage", label: "news page", desc: "a tall page of headlines", items: HEAD2.concat(["panel.news"]), w: 480, h: 560, news: true,
    newsCfg: { scope: "all", per: 5, sort: "new", span: "week", market: ["cnbc", "marketwatch", "ft"] },
    tip: "this week's headlines for every holding and the watchlist, plus CNBC, MarketWatch and FT — turns headlines on" },
  { key: "ticker", label: "ticker line", desc: "a small one-line ticker for the corner of the screen", items: HEAD2.slice(), compact: true, w: 420 },
  { key: "blank", label: "blank", desc: "an empty window — tick what it shows", items: [], w: 360, h: 200 },
];

// _settings.display, checked like display_prefs.clean_display (lenient: a bad
// field is dropped, numbers clamped). Unknown feature ids stay in `items` (a
// newer version's features survive a save) and are ignored where used.
const WIN_ID_RE = /^[a-z][a-z0-9]{0,11}$/;
const FEATURE_ID_RE = /^[a-z][A-Za-z0-9]*(\.[A-Za-z0-9]+)*$/;
const WIN_W_MIN = 300, WIN_W_MAX = 1400, WIN_H_MIN = 160, WIN_H_MAX = 2000, MAX_WINDOWS = 8;
const WIN_FIELDS = ["id", "title", "x", "y", "w", "h", "zoom", "items", "prio", "side", "carousel", "compact", "graphBig", "news"];
const clampInt = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(v)));
// titles as display_prefs counts them: code points, no control/C1 chars, no
// U+2028/2029, no lone surrogates
const TITLE_BAD_CH = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g;
const lone = (c) => c.length === 1 && c >= "\ud800" && c <= "\udfff";
const titleOk = (t) => {
  const cs = Array.from(t);
  return cs.length >= 1 && cs.length <= 40 && !cs.some(lone) && !new RegExp(TITLE_BAD_CH.source).test(t);
};
// The news page's options (13.1, windows[i].news; display_prefs.py mirrors
// them): absent = the 13.0 news panel, present (even {}) = the news page.
// Default-valued fields are dropped inside, the object itself is kept.
const NEWS_TICKER_RE = /^\^?[A-Z0-9][A-Z0-9.\-=&]{0,19}$/;
const NEWS_SCOPES = ["movers", "holdings", "watch", "all", "pick"];
const NEWS_SORTS = ["new", "move", "ticker"];
const NEWS_SPANS = ["day", "3d", "week", "all"];
const NEWS_LIST_MAX = 40, NEWS_Q_MAX = 60, NEWS_DENSE_TAGS = 3;   // dense rows show 3 tags + "+n"
const NEWS_DEF = { market: [], scope: "movers", tickers: [], per: 3, sort: "move", span: "all", group: false, dense: false, sources: true, mute: [], q: "" };
// control, format (soft hyphen, zero-width, bidi, BOM…) and private-use code points
const NEWS_Q_BAD = /[\u0000-\u001f\u007f-\u009f\u00ad\u0600-\u0605\u061c\u06dd\u070f\u180e\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff\ufff9-\ufffb\ue000-\uf8ff]|\ud804[\udcbd\udccd]|\ud80d[\udc30-\udc3f]|\ud82f[\udca0-\udca3]|\ud834[\udd73-\udd7a]|\udb40[\udc01\udc20-\udc7f]|[\udb80-\udbff][\udc00-\udfff]/;
const newsQOk = (q) => {
  const cs = Array.from(q);
  return cs.length <= NEWS_Q_MAX && !cs.some(lone) && !NEWS_Q_BAD.test(q);
};
// a ticker list: upper-cased, TICKER_RE, deduped, order kept, at most 40 (null = not a list)
const newsList = (v) => {
  if (!Array.isArray(v)) return null;
  const out = [], seen = {};
  v.forEach((t) => {
    const x = typeof t === "string" ? t.trim().toUpperCase() : "";
    if (x && NEWS_TICKER_RE.test(x) && !seen[x] && out.length < NEWS_LIST_MAX) { seen[x] = true; out.push(x); }
  });
  return out;
};
// lenient like display_prefs.clean_display: a bad field is dropped, the rest
// kept; null when `news` is not an object (then it is dropped)
// market headlines (13.3): the tracker's NEWS_FEEDS, cached under "@<id>"
const NEWS_FEEDS = { cnbc: "CNBC", marketwatch: "MarketWatch", yahoo: "Yahoo Finance", ft: "FT" };
const NEWS_FEED_IDS = Object.keys(NEWS_FEEDS);
const isFeedKey = (tk) => typeof tk === "string" && tk.charAt(0) === "@";
const newsTagText = (tk) => (isFeedKey(tk) ? NEWS_FEEDS[tk.slice(1)] || tk.slice(1) : tk);
const NEWS_STALE_S = 7 * 86400;   // the movers panel (no options) hides older headlines
const normNews = (v) => {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const o = {};
  if (NEWS_SCOPES.indexOf(v.scope) >= 0 && v.scope !== NEWS_DEF.scope) o.scope = v.scope;
  const tk = newsList(v.tickers);
  if (tk && tk.length) o.tickers = tk;
  if (isNumber(v.per) && Math.round(v.per) === v.per && v.per >= 1 && v.per <= 10 && v.per !== NEWS_DEF.per) o.per = v.per;
  if (NEWS_SORTS.indexOf(v.sort) >= 0 && v.sort !== NEWS_DEF.sort) o.sort = v.sort;
  if (NEWS_SPANS.indexOf(v.span) >= 0 && v.span !== NEWS_DEF.span) o.span = v.span;
  if (v.group === true) o.group = true;
  if (v.dense === true) o.dense = true;
  if (v.sources === false) o.sources = false;
  const mu = newsList(v.mute);
  if (mu && mu.length) o.mute = mu;
  if (typeof v.q === "string" && v.q && newsQOk(v.q)) o.q = v.q;
  const mk = Array.isArray(v.market) ? v.market.filter((x, i, a) => NEWS_FEED_IDS.indexOf(x) >= 0 && a.indexOf(x) === i) : null;
  if (mk && mk.length) o.market = mk;
  return o;
};
// the options with the defaults filled in; null = the 13.0 path (no `news`)
const newsCfgOf = (win) => {
  const n = win && win.news ? normNews(win.news) : null;
  return n ? Object.assign({}, NEWS_DEF, n) : null;
};
const cleanMap = (m, ok, cap) => {
  if (!m || typeof m !== "object" || Array.isArray(m)) return null;
  const out = {};
  let n = 0;
  Object.keys(m).forEach((k) => {
    if (n < cap && k.length <= 40 && FEATURE_ID_RE.test(k) && ok.indexOf(m[k]) >= 0) { out[k] = m[k]; n++; }
  });
  return n ? out : null;
};
const normWindow = (w) => {
  if (!w || typeof w !== "object" || Array.isArray(w) || typeof w.id !== "string" || !WIN_ID_RE.test(w.id)) return null;
  const o = { id: w.id };
  if (typeof w.title === "string") {
    const t = w.title.trim();
    if (titleOk(t)) o.title = t;
  }
  if (isNumber(w.x) && isNumber(w.y)) { o.x = clampInt(w.x, -10000, 20000); o.y = clampInt(w.y, 0, 20000); }
  if (isNumber(w.w)) o.w = clampInt(w.w, WIN_W_MIN, WIN_W_MAX);
  if (w.h === "auto") o.h = "auto";
  else if (isNumber(w.h)) o.h = clampInt(w.h, WIN_H_MIN, WIN_H_MAX);
  if (isNumber(w.zoom)) o.zoom = Math.round(Math.max(SCALE_MIN, Math.min(SCALE_MAX, w.zoom)) * 100) / 100;
  if (Array.isArray(w.items)) {
    const seen = {};
    o.items = w.items.filter((id) => typeof id === "string" && id.length <= 40 && FEATURE_ID_RE.test(id) &&
      !seen[id] && (seen[id] = true)).slice(0, 200);
  }
  const prio = cleanMap(w.prio, ["always", "normal", "room"], 200);
  if (prio) o.prio = prio;
  const side = cleanMap(w.side, ["a", "b"], 60);
  if (side) o.side = side;
  if (w.carousel === "rotate" || w.carousel === "stack") o.carousel = w.carousel;
  if (typeof w.compact === "boolean") o.compact = w.compact;
  if (typeof w.graphBig === "boolean") o.graphBig = w.graphBig;
  const nw = normNews(w.news);
  if (nw) o.news = nw;
  return o;
};
const normDisplay = (obj) => {
  if (!obj || typeof obj !== "object" || !Array.isArray(obj.windows)) return null;
  const out = [], ids = {};
  obj.windows.forEach((w) => {
    const o = out.length < MAX_WINDOWS ? normWindow(w) : null;
    if (o && !ids[o.id]) { ids[o.id] = true; out.push(o); }
  });
  return out.length ? { windows: out } : null;
};
// what is saved: defaults left out (items too when they are the full set, in order)
const compactWindow = (w) => {
  const o = {};
  WIN_FIELDS.forEach((k) => {
    const v = w[k];
    if (v === undefined || v === null) return;
    if ((k === "w" && v === WIDGET_W) || (k === "h" && v === "auto") || (k === "zoom" && v === 1) ||
        (k === "carousel" && v === "rotate") || ((k === "compact" || k === "graphBig") && v === false)) return;
    if (k === "items" && v.length === FULL_ITEMS.length && v.every((id, i) => id === FULL_ITEMS[i])) return;
    if ((k === "prio" || k === "side") && !Object.keys(v).length) return;
    if (k === "news") { const nw = normNews(v); if (nw) o.news = nw; return; }
    o[k] = v;
  });
  return o;
};
const compactDisplay = (disp) => ({ windows: disp.windows.map(compactWindow) });
let normMemo = { src: undefined, out: null };
const savedDisplay = (st) => {
  const src = hasData(st) ? uiPrefs(st).display : null;
  if (src !== normMemo.src) normMemo = { src: src, out: normDisplay(src) };
  return normMemo.out;
};
// this session's display (false: back to one plain window), else data.ui.display; null = legacy
const displayOf = (st) => (st.display === false ? null : st.display || savedDisplay(st));
// the one 12.11 window (no _settings.display): spot, zoom and one-line from the legacy keys
const legacyWindow = (st) => {
  const w = hasData(st) ? null : readFrame().w;
  return Object.assign({ id: "main", legacy: true, compact: compactOf(st), graphBig: graphBigOf(st) },
    isNumber(w) ? { w: clampInt(w, WIN_W_MIN, WIN_W_MAX) } : {});
};
const windowsOf = (st, disp) => {
  const dsp = disp === undefined ? displayOf(st) : disp;
  return dsp ? dsp.windows : [legacyWindow(st)];
};
// the first display from the legacy keys (any change beyond move / one line / ⤢)
const migrateDisplay = (st) => {
  const w = { id: "main" };
  const p = posOf(st), s = scaleOf(st);
  if (p) { w.x = p.x; w.y = p.y; }
  if (s !== 1) w.zoom = s;
  if (compactOf(st)) w.compact = true;
  if (graphBigOf(st)) w.graphBig = true;
  return { windows: [w] };
};
// a window's features: its items (in order), else the full set
const itemsOf = (win) => (win && Array.isArray(win.items) ? win.items : FULL_ITEMS);
const itemSets = typeof WeakMap === "function" ? new WeakMap() : null;
const itemSetOf = (items) => {
  let set = itemSets ? itemSets.get(items) : null;
  if (!set) {
    set = {};
    items.forEach((id) => { set[id] = true; });
    if (itemSets) itemSets.set(items, set);
  }
  return set;
};
// shown: the id and every one of its parents are switched on
const enabled = (win, id) => {
  const set = itemSetOf(itemsOf(win));
  if (!set[id]) return false;
  for (let f = FEATURE_BY[id]; f && f.parent; f = FEATURE_BY[f.parent]) if (!set[f.parent]) return false;
  return true;
};
// a copy of `disp` with window `id` changed (a field set to undefined is removed)
const patchWin = (disp, id, patch) => ({ windows: disp.windows.map((w) => {
  if (w.id !== id) return w;
  const o = Object.assign({}, w, patch);
  Object.keys(o).forEach((k) => { if (o[k] === undefined) delete o[k]; });
  return o;
}) });

// Saving: the screen follows at once (SET_DISPLAY), the file 300 ms after the
// last change, one save at a time, the latest wins (a slider or a drag never
// saves per step). setting display (set_setting.py) patches data.ui in place.
// One queue for every `setting` save (13.2): two set_setting.py runs at the
// same moment each load and rewrite positions.json / data.json and one would
// undo the other's change, so each run starts after the previous one answered.
let settingChain = Promise.resolve();
const runQueued = (args) => {
  const p = settingChain.then(() => run(helper(args)));
  settingChain = p.then(() => null, () => null);
  return p;
};
// a portfolio setting from the ⚙ editor: the reply's ui value goes into
// data.ui at once (UI_PATCH), an error shows under the row (EDIT_MSG)
const saveSetting = (key, value, dispatch) => runQueued(["setting", key, String(value)]).then((out) => {
  const r = parseJson(String(out).trim());
  if (!r || r.error) {
    dispatch({ type: "EDIT_MSG", key: key, msg: (r && r.error) || "could not save " + key });
    return r || { error: "could not save " + key };
  }
  dispatch({ type: "EDIT_MSG", key: key, msg: null });
  if (r.ok && r.key === key && "value" in r) dispatch({ type: "UI_PATCH", key: key, value: r.value });
  return r;
}, () => {
  dispatch({ type: "EDIT_MSG", key: key, msg: "could not save " + key });
  return { error: "could not save " + key };
});
const DISPLAY_SAVE_MS = 300;
const DISPLAY_SAVE_STUCK_MS = 15000;   // a save that never answers stops blocking the next one
const dispSave = { timer: null, want: null, busy: 0 };
const flushDisplay = () => {
  dispSave.timer = null;
  if ((dispSave.busy && Date.now() - dispSave.busy < DISPLAY_SAVE_STUCK_MS) || dispSave.want === null) return;
  const arg = dispSave.want;
  dispSave.want = null;
  const mine = dispSave.busy = Date.now();
  const done = () => {
    if (dispSave.busy !== mine) return;
    dispSave.busy = 0;
    if (dispSave.want !== null && !dispSave.timer) flushDisplay();
  };
  runQueued(["setting", "display", arg]).then(done, done);
};
const saveDisplay = (disp, dispatch) => {
  dispatch({ type: "SET_DISPLAY", display: disp });
  dispSave.want = disp ? JSON.stringify(compactDisplay(disp)) : "default";
  if (dispSave.timer) clearTimeout(dispSave.timer);
  dispSave.timer = setTimeout(flushDisplay, DISPLAY_SAVE_MS);
};
// "reset everything" (the ⚙ editor): ONE run of `setting display reset-all`,
// which also drops position, scale, graphBig, showBenchmark and compact. It
// replaces a display save still waiting and waits for one that is running.
const resetAllDisplay = (dispatch) => {
  dispatch({ type: "RESET_LOOK" });
  dispSave.want = "reset-all";
  if (dispSave.timer) clearTimeout(dispSave.timer);
  flushDisplay();
};
// change one window (migrating from the legacy keys first when there is no display yet)
const changeWin = (st, id, patch, dispatch) =>
  saveDisplay(patchWin(displayOf(st) || migrateDisplay(st), id, patch), dispatch);

// per-stock data kept for every window (at most KEEP_STOCKS stocks; the oldest go)
const KEEP_STOCKS = 6;
const keepSome = (map, key, val) => {
  const out = {};
  const keys = Object.keys(map || {}).filter((k) => k !== key);
  keys.slice(Math.max(0, keys.length - (KEEP_STOCKS - 1))).forEach((k) => { out[k] = map[k]; });
  out[key] = val;
  return out;
};
const lookOf = (st, tk) => {
  const e = tk && st.lookBy ? st.lookBy[tk] : null;
  return e ? { ticker: tk, data: e.data || null, busy: !!e.busy, error: e.error || null }
    : { ticker: tk || null, data: null, busy: false, error: null };
};
const newsOf = (st, tk) => {
  const e = tk && st.newsBy ? st.newsBy[tk] : null;
  return e ? { ticker: tk, items: Array.isArray(e.items) ? e.items : [], busy: !!e.busy, error: e.error || null } : null;
};

// Identifies the day-by-day table the loaded older rows belong to: a new day,
// a longer history (dailyFirst moves back) or a rebuilt table changes it.
const dailyKey = (d) => {
  if (!d) return "";
  const daily = Array.isArray(d.daily) ? d.daily : [];
  return (d.dailyFirst || "") + "|" + (d.dailyTotal || 0) + "|" + (daily.length && daily[0] ? daily[0][0] : "");
};

// every case below sees ONE window's view of the state (the shared keys plus
// that window's WIN_KEYS; see updateState) and never needs to know which window
const coreReducer = (event, prev) => {
  switch (event.type) {
    case "UB/COMMAND_RAN": {
      let parsed = prev.raw;
      let parseError = null;
      try {
        parsed = JSON.parse(event.output);
      } catch (e) {
        parseError = String(event.output || event.error || "command produced no output").slice(0, 400);
      }
      // older rows from another version of the table are dropped
      const older = prev.older.key !== null && parsed && parsed.data &&
        dailyKey(parsed.data) !== prev.older.key ? NO_OLDER : prev.older;
      // pages/sections only rotate while the pointer is NOT over the widget
      // a message under the alerts panel (no stock open) goes after ~15 s
      const fade = prev.alertMsg && !prev.alertBusy && !prev.focusTicker &&
        !(prev.tick + 1 - prev.alertMsgTick < 3);   // on the 3rd tick after it
      return merge(prev, { raw: parsed, parseError: parseError, tick: prev.tick + 1,
        rot: prev.hover ? prev.rot : prev.rot + 1, older: older,
        alertMsg: fade ? null : prev.alertMsg,
        benchWant: benchWantAfter(prev, parsed && parsed.data),
        settingPending: prev.settingPending && parsed && parsed.data && parsed.data.epoch !== prev.settingPending.epoch ? null : prev.settingPending });
    }
    case "TOGGLE_GRAPH_BIG":
      return merge(prev, { graphBig: typeof event.on === "boolean" ? event.on : !graphBigOf(prev) });
    case "SET_SHOW_BENCH": return merge(prev, { showBench: event.on === true });
    case "SET_COMPACT": return merge(prev, { compact: event.on === true, hoverT: null });
    case "EXPORT_MSG":   // shown in the footer for a few ticks (stamped with the data tick)
      return merge(prev, { exportMsg: event.text ? { text: String(event.text), err: !!event.err, tip: event.tip ? String(event.tip) : "", tick: prev.tick } : null });
    case "BENCH_PICK":
      return merge(prev, { benchPick: typeof event.open === "boolean" ? event.open : !prev.benchPick,
        benchInput: "", benchMsg: null });
    case "BENCH_INPUT": return merge(prev, { benchInput: String(event.value || "").slice(0, 24), benchMsg: null });
    case "BENCH_MSG": return merge(prev, { benchMsg: event.msg || null });
    case "SET_BENCH":     // picked (saved in the background): the picker closes
      return merge(prev, { benchWant: normBench(event.value), benchSaved: false, benchPick: false, benchInput: "", benchMsg: null });
    case "BENCH_SAVED":
      return event.value === prev.benchWant ? merge(prev, { benchSaved: true }) : prev;
    case "BENCH_FAIL":    // the save failed: back to the saved choice, the picker says why
      return merge(prev, { benchWant: null, benchPick: true, benchMsg: event.msg || "could not save" });
    case "SET_SALES_EXPANDED": return merge(prev, { salesExpanded: event.on === true });
    case "SET_POS": return merge(prev, { pos: event.pos === false ? false : validPos(event.pos) });
    case "SET_SCALE": return merge(prev, { scale: validScale(event.scale) });
    case "SET_BT_MODE": return merge(prev, { btMode: event.mode === "weighted" ? "weighted" : "held" });
    case "OLDER_BUSY":
      return merge(prev, { older: { key: event.key, rows: event.key === prev.older.key ? prev.older.rows : [],
        busy: true, msg: null } });
    case "OLDER_RESULT": {   // answers for a table that has since changed are ignored
      if (event.key !== prev.older.key) return prev;
      const byDate = {};
      prev.older.rows.forEach((r) => { byDate[r[0]] = r; });
      (event.rows || []).forEach((r) => { byDate[r[0]] = r; });
      const rows = Object.keys(byDate).sort().map((k) => byDate[k]);
      return merge(prev, { older: { key: event.key, rows: rows, busy: false, msg: event.error || null } });
    }
    case "HOVER": return merge(prev, { hover: event.on });
    case "SET_RANGE":
      return merge(prev, { range: event.range, from: null, mark: null, hoverT: null, dayMsg: null, dayInput: "" });
    case "SET_FROM":   // start the graph at the pinned moment
      return merge(prev, { from: event.from, mark: null, hoverT: null, dayMsg: null, dayInput: "" });
    case "CLEAR_FROM": return merge(prev, { from: null, hoverT: null });
    case "SET_SECTOR_FOCUS":
      return merge(prev, { sectorFocus: event.name, graphMode: "sectors", hoverT: null });
    case "HOVER_PT": return prev.hoverT === event.t ? prev : merge(prev, { hoverT: event.t });
    case "SET_MARK":   // a graph click (or a release) replaces any day typed into the date box
      return merge(prev, { mark: event.mark, dayMsg: null, dayInput: "" });
    case "PICK_DAY":   // a day from the table or the date box: pin it and show a range that contains it
      return merge(prev, { mark: event.mark, range: event.range, hoverT: null, dayMsg: null,
        dayInput: event.fromInput ? prev.dayInput : event.mark.d });
    case "SET_DAY_INPUT": return merge(prev, { dayInput: event.value });
    case "DAY_MSG": return merge(prev, { dayMsg: event.msg });
    case "SET_DAY_PAGE": return merge(prev, { dayPage: Math.max(0, event.page) });
    case "SET_EARN_PAGE": return merge(prev, { earnPage: Math.max(0, event.page) });
    case "TOGGLE_SECTOR_SCALE": return merge(prev, { sectorScale: prev.sectorScale === "shared" ? "own" : "shared" });
    case "TOGGLE_SECTOR_ORDER": return merge(prev, { sectorOrder: prev.sectorOrder === "best" ? "size" : "best" });
    case "SET_PAGE": return merge(prev, { pinnedPage: prev.pinnedPage === event.page ? null : event.page });
    case "SET_SECTION": return merge(prev, { pinnedSection: prev.pinnedSection === event.section ? null : event.section });
    case "SET_VIEW": return merge(prev, { view: event.view });
    case "SET_MAP_RANGE": return merge(prev, { mapRange: event.range });   // RANGES, "VOL" or "DRIFT" (12.10, only offered with targets)
    case "TOGGLE_MAP_EXPAND": return merge(prev, { mapExpanded: !prev.mapExpanded, view: "map" });
    case "SET_STOCK": {
      // another stock (or back) forgets the alert box and the headlines
      // (headlines are per stock in newsBy: openStock reloads them for another stock)
      const other = event.ticker !== prev.focusTicker;
      const fresh = !!event.ticker && event.ticker !== prev.lookTicker;
      return merge(prev, { focusTicker: event.ticker, mapExpanded: false, detailMsg: null,
        lookTicker: fresh ? event.ticker : prev.lookTicker,
        lookBy: fresh ? keepSome(prev.lookBy, event.ticker, { data: null, busy: false, error: null }) : prev.lookBy,
        alertInput: other ? "" : prev.alertInput, alertMsg: other ? null : prev.alertMsg,
        alertBusy: other ? false : prev.alertBusy });
    }
    case "SET_ALERT_INPUT": return merge(prev, { alertInput: String(event.value || ""), alertMsg: null });
    case "ALERT_BUSY": return merge(prev, { alertBusy: true, alertMsg: event.msg || "working…" });
    case "ALERT_RESULT":   // ok clears the box; an error keeps what was typed
      return merge(prev, { alertBusy: false, alertMsg: event.msg || null, alertMsgTick: prev.tick,
        alertInput: event.ok && event.clear ? "" : prev.alertInput });
    case "NEWS_BUSY": return merge(prev, { newsBy: keepSome(prev.newsBy, event.ticker, { items: [], busy: true, error: null }) });
    case "NEWS_RESULT":    // kept per stock (another window may show it)
      if (!prev.newsBy || !prev.newsBy[event.ticker]) return prev;
      return merge(prev, { newsBy: keepSome(prev.newsBy, event.ticker, { items: Array.isArray(event.items) ? event.items : [],
        busy: false, error: event.error || null }) });
    case "SET_NEWS_PREF": return merge(prev, { newsPref: event.on === true });
    case "TOGGLE_ALERTS_EXPANDED": return merge(prev, { alertsExpanded: !prev.alertsExpanded });
    case "SET_REBAL_WHOLE": return merge(prev, { rebalWhole: typeof event.on === "boolean" ? event.on : null });
    case "TOGGLE_REBAL_EXPANDED": return merge(prev, { rebalExpanded: !prev.rebalExpanded });
    case "LOOK_BUSY": {
      const had = (prev.lookBy || {})[event.ticker];
      return merge(prev, { lookBy: keepSome(prev.lookBy, event.ticker, { data: had ? had.data : null, busy: true, error: null }) });
    }
    case "LOOK_RESULT": {  // kept per stock (another window may show it); a stock dropped meanwhile is ignored
      const had = (prev.lookBy || {})[event.ticker];
      if (!had) return prev;
      return merge(prev, { lookBy: keepSome(prev.lookBy, event.ticker, { data: event.data || had.data,
        busy: false, error: event.error || null }) });
    }
    case "SET_DETAIL_RANGE": return merge(prev, { detailRange: event.range });
    case "DETAIL_MSG": return merge(prev, { detailMsg: event.msg });
    case "PREFILL":       // "buy" from a detail view: open the form with the ticker filled in
      return merge(prev, { addForm: merge(EMPTY_FORM, { ticker: event.ticker }), showAdd: true,
        focusTicker: null, picked: null, search: NO_SEARCH, addMsg: null, pendingAction: null });
    case "CYCLE_SORT":
      return merge(prev, { sort: SORTS[(SORTS.indexOf(prev.sort) + 1) % SORTS.length], pinnedPage: null });
    case "TOGGLE_ADD":
      return merge(prev, { showAdd: !prev.showAdd, addMsg: null, pendingAction: null,
        search: NO_SEARCH });
    case "SET_ADD_FIELD": {
      const form = Object.assign({}, prev.addForm);
      form[event.field] = event.value;
      // typing over a picked stock forgets the pick
      const picked = event.field === "ticker" && prev.picked &&
        prev.picked.symbol !== event.value.toUpperCase().trim() ? null : prev.picked;
      return merge(prev, { addForm: form, picked: picked, pendingAction: null });
    }
    case "SEARCH_BUSY":
      return merge(prev, { search: merge(prev.search, { query: event.query, busy: true, error: null }) });
    case "SEARCH_RESULTS":
      // answers can arrive out of order; keep only the one for the current text
      if (event.query !== (prev.addForm.ticker || "").trim()) return prev;
      return merge(prev, { search: { query: event.query, results: event.results,
        busy: false, error: event.error || null } });
    case "PICK":
      return merge(prev, { addForm: merge(prev.addForm, { ticker: event.item.symbol }),
        picked: event.item, search: NO_SEARCH, addMsg: null });
    case "FORM_RESET":
      return merge(prev, { addForm: EMPTY_FORM, picked: null, search: NO_SEARCH });
    case "ADD_MSG": return merge(prev, { addMsg: event.msg });
    case "SET_PENDING": return merge(prev, { pendingAction: event.pending, addMsg: null });
    case "CLEAR_PENDING": return merge(prev, { pendingAction: null });
    case "SET_GRAPH_MODE": return merge(prev, { graphMode: event.mode, hoverT: null });
    case "TOGGLE_PL_MODE": return merge(prev, { plMode: prev.plMode === "cost" ? "invested" : "cost" });
    // windows (12.12). The first three are shared (updateState ignores their `w`)
    case "SET_DISPLAY": {  // a display object (normalised here), or null/false = one plain window
      const disp = event.display ? normDisplay(event.display) : null;
      const keep = {};
      if (disp) disp.windows.forEach((w) => { if (prev.wins[w.id]) keep[w.id] = prev.wins[w.id]; });
      else if (prev.wins.main) keep.main = prev.wins.main;
      return merge(prev, { display: disp || false, wins: keep, geo: null,
        front: disp && disp.windows.some((w) => w.id === prev.front) ? prev.front : null });
    }
    case "GEO": return merge(prev, { geo: event.geo && typeof event.geo === "object" && typeof event.geo.id === "string" ? event.geo : null });
    case "FRONT": return typeof event.w === "string" && prev.front !== event.w ? merge(prev, { front: event.w }) : prev;
    // the ⚙ editor: `group` (optional) picks the section it opens at
    case "TOGGLE_EDITOR": return merge(prev, { editOpen: !prev.editOpen, editConfirm: null, editQuery: "",
      editGroup: typeof event.group === "string" ? event.group : prev.editGroup });
    case "OPEN_EDITOR": return merge(prev, { editOpen: true, editConfirm: null, editQuery: "",   // (the welcome card's links)
      editGroup: typeof event.group === "string" ? event.group : prev.editGroup });
    case "CLOSE_EDITOR": return prev.editOpen ? merge(prev, { editOpen: false, editConfirm: null, editQuery: "" }) : prev;
    case "EDIT_QUERY": return merge(prev, { editQuery: typeof event.value === "string" ? event.value.slice(0, 40) : "" });
    // the import panel (13.4): null closes it, a patch merges into it
    case "IMPORT_SET": return merge(prev, { imp: event.imp === null ? null : Object.assign({}, prev.imp || IMPORT_EMPTY, event.imp) });
    // the footer's update offer (13.4)
    case "UPDATE_ASK": return merge(prev, { updateAsk: event.on === true });
    case "UPDATE_LATER": return merge(prev, { updateLater: typeof event.version === "string" ? event.version : null, updateAsk: false });
    case "UPDATE_MSG": return merge(prev, { updateMsg: event.msg ? { text: String(event.msg), err: !!event.err, tick: prev.tick } : null });
    case "UPDATE_CHECKING": return merge(prev, { updateChecking: event.on === true });
    case "UPDATE_INFO": {   // "check now" answered: data.update as the next refresh would carry it
      if (!prev.raw || !prev.raw.data || typeof prev.raw.data !== "object") return merge(prev, { updateChecking: false });
      return merge(prev, { updateChecking: false,
        raw: Object.assign({}, prev.raw, { data: Object.assign({}, prev.raw.data, { update: event.info || null }) }) });
    }
    // "reset portfolio settings": this session's clicks on those settings are forgotten too
    case "PF_RESET_LOCAL": return merge(prev, { newsPref: null, rebalWhole: null, benchWant: null, benchSaved: false, settingPending: null });
    // the open section (one at a time): null = "window", "none" = all closed
    case "EDIT_GROUP": return merge(prev, { editGroup: typeof event.group === "string" ? event.group : null, editConfirm: null });
    // "reset everything" (setting display reset-all): one plain window at the
    // default spot, zoom 1, the 12.11 look; every window's own state starts over
    case "RESET_LOOK": return merge(prev, { display: false, wins: {}, geo: null, front: null,
      pos: false, scale: 1, graphBig: false, showBench: true, compact: false });
    case "EDIT_CONFIRM": return merge(prev, { editConfirm: event.what || null });
    case "SET_NEWS_PAGE": return merge(prev, { newsPage: Math.max(0, Math.round(event.page) || 0) });
    // the news page's live keyword (13.1): typed over cfg.q `from`; a cfg.q change from elsewhere wins again
    case "SET_NEWS_QUERY": return merge(prev, { newsQuery: typeof event.value === "string" ? event.value : null,
      newsQFrom: typeof event.from === "string" ? event.from : "", newsPage: 0 });
    case "NEWS_PICK_MSG": return merge(prev, { newsPickMsg: typeof event.msg === "string" ? event.msg : null });
    // the ⚙ editor's shared switches and notes (13.2)
    case "EDIT_ADVANCED": return merge(prev, { editAdvanced: event.on === true });
    case "EDIT_HINTS": return merge(prev, { editHints: event.on !== false });
    case "SETTING_PENDING": return merge(prev, { settingPending: event.key && typeof event.key === "string"
      ? { key: event.key, epoch: event.epoch, msg: String(event.msg || "") } : null });
    case "EDIT_MSG": {
      if (typeof event.key !== "string") return prev;
      const m = Object.assign({}, prev.editMsg || {});
      if (typeof event.msg === "string" && event.msg) m[event.key] = event.msg; else delete m[event.key];
      return merge(prev, { editMsg: m });
    }
    // a saved setting's reply (set_setting.py's ui value) goes into data.ui at
    // once, so the editor shows it before the next data.json is read
    case "THEME_MEDIA": return merge(prev, { mediaTick: (prev.mediaTick || 0) + 1 });   // the Mac's appearance changed (theme auto)
    case "UI_PATCH": {
      if (typeof event.key !== "string" || !prev.raw || !prev.raw.data || typeof prev.raw.data !== "object") return prev;
      const ui = Object.assign({}, prev.raw.data.ui && typeof prev.raw.data.ui === "object" ? prev.raw.data.ui : {});
      ui[event.key] = event.value;
      return merge(prev, { raw: Object.assign({}, prev.raw, { data: Object.assign({}, prev.raw.data, { ui: ui }) }) });
    }
    default: return prev;
  }
};

// Each data tick: every window's own pages/sections rotate (not while the
// pointer is over that window), and a message under its alerts panel (no stock
// open) goes after ~15 s.
const tickWindows = (prev, next) => {
  const wins = {};
  const ids = Object.keys(prev.wins);
  windowsOf(next).forEach((w) => { if (ids.indexOf(w.id) < 0) ids.push(w.id); });
  ids.forEach((id) => {
    const own = prev.wins[id] || WIN_INITIAL;
    const fade = own.alertMsg && !own.alertBusy && !own.focusTicker &&
      !(prev.tick + 1 - own.alertMsgTick < 3);   // on the 3rd tick after it
    wins[id] = merge(own, { rot: own.hover ? own.rot : own.rot + 1, alertMsg: fade ? null : own.alertMsg });
  });
  return merge(next, { wins: wins });
};
const SHARED_EVENTS = { SET_DISPLAY: true, GEO: true, FRONT: true, RESET_LOOK: true };
// An event with a string `w` (every event from a window's render) runs on that
// window's view: the shared state plus wins[w]; its WIN_KEYS go back to
// wins[w], the rest to the shared state. Events without `w` run on the shared state.
export const updateState = (event, prevIn) => {
  const sp = sane(prevIn);
  const prev = sp.wins && typeof sp.wins === "object" ? sp : merge(sp, { wins: {} });
  if (!event) return prev;
  if (event.type === "UB/COMMAND_RAN") return tickWindows(prev, coreReducer(event, prev));
  if (event.type === "CLOSE_ALL_EDITORS") {
    const wins = {};
    Object.keys(prev.wins).forEach((id) => { wins[id] = coreReducer({ type: "CLOSE_EDITOR" }, prev.wins[id]); });
    return merge(prev, { wins: wins });
  }
  const w = typeof event.w === "string" && !SHARED_EVENTS[event.type] ? event.w : null;
  if (w === null) return coreReducer(event, prev);
  const view = Object.assign({}, prev, prev.wins[w] || WIN_INITIAL);
  const next = coreReducer(event, view);
  if (next === view) return prev;
  const mine = {}, root = Object.assign({}, next);
  WIN_KEYS.forEach((k) => { mine[k] = next[k]; root[k] = prev[k]; });
  root.wins = Object.assign({}, next.wins);
  root.wins[w] = mine;
  return root;
};

// ------------------------------------------------------------------ colors
// Every colour is a CSS variable (13.4): a window's root sets them for the
// theme in use (themeClass), so the same styles draw the dark and the light
// look. Colours that JavaScript mixes itself (heat-map tiles, volatility)
// come from paletteNow() instead.
const C = {
  ink: "var(--pw-ink)",
  dim: "var(--pw-dim)",
  faint: "var(--pw-faint)",
  up: "var(--pw-up)",
  down: "var(--pw-down)",
  amber: "var(--pw-amber)",
  orange: "var(--pw-orange)", // over its target allocation (12.10)
  line: "var(--pw-line)", // the ONE color all line graphs use
};
// bg / fg: "r, g, b" for rgba(var(--pw-bg), <opacity>) and the translucent
// highlights rgba(var(--pw-fg), 0.07); surface = the panel colour behind a
// marker dot; neutral = the heat map's resting tile; vol = the volatility
// score colours 1-10 (cool grey -> amber -> orange -> pink, never green/red)
const PALETTES = {
  dark: { ink: "#E7EDF3", dim: "#7C8794", faint: "rgba(255,255,255,0.07)", up: "#34D399", down: "#FB7185",
    amber: "#F5C044", orange: "#FF9F0A", line: "#AFC3D4", bg: "17, 21, 27", fg: "255, 255, 255", surface: "#11151B",
    tileInk: "rgba(255,255,255,0.94)", tileSub: "rgba(255,255,255,0.78)", tileShadow: "0 1px 2px rgba(0,0,0,0.35)",
    neutral: [44, 44, 46],
    vol: [null, "#8FA3B8", "#8FA3B8", "#C9D3DD", "#C9D3DD", "#F5C044", "#F5C044", "#FB923C", "#FB923C", "#F472B6", "#F472B6"] },
  light: { ink: "#1B2430", dim: "#66717F", faint: "rgba(0,0,0,0.07)", up: "#0E9F6E", down: "#DC3B63",
    amber: "#A36A00", orange: "#D9730D", line: "#3A5A7C", bg: "247, 248, 250", fg: "0, 0, 0", surface: "#F7F8FA",
    tileInk: "rgba(0,0,0,0.86)", tileSub: "rgba(0,0,0,0.66)", tileShadow: "none",
    neutral: [221, 225, 230],
    vol: [null, "#7D91A6", "#7D91A6", "#95A2B0", "#95A2B0", "#A36A00", "#A36A00", "#D9730D", "#D9730D", "#C2297B", "#C2297B"] },
};
const THEMES = ["dark", "light", "auto"];
let THEME_NOW = "dark";    // the palette in use, set by render() before anything draws
const paletteNow = () => PALETTES[THEME_NOW] || PALETTES.dark;
const prefersLight = () => {
  try { return !!(window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches); } catch (e) { return false; }
};
// _settings.theme (data.ui.theme): dark (default) | light | auto = the Mac's appearance
const themeOf = (st) => {
  const t = uiPrefs(st).theme;
  return t === "light" ? "light" : t === "auto" ? (prefersLight() ? "light" : "dark") : "dark";
};
// _settings.opacity (data.ui.opacity): how solid the window's background is, 0.3-1
const opacityOf = (st) => {
  const v = uiPrefs(st).opacity;
  return typeof v === "number" && isFinite(v) ? Math.min(1, Math.max(0.3, v)) : 0.88;
};
const themeClass = (theme, opacity) => {
  const P = PALETTES[theme] || PALETTES.dark;
  return css`
    --pw-ink: ${P.ink}; --pw-dim: ${P.dim}; --pw-faint: ${P.faint}; --pw-up: ${P.up}; --pw-down: ${P.down};
    --pw-amber: ${P.amber}; --pw-orange: ${P.orange}; --pw-line: ${P.line}; --pw-bg: ${P.bg}; --pw-fg: ${P.fg};
    --pw-surface: ${P.surface}; --pw-tile-ink: ${P.tileInk}; --pw-tile-sub: ${P.tileSub}; --pw-tile-shadow: ${P.tileShadow};
    --pw-opacity: ${opacity};
    color: var(--pw-ink);
  `;
};

// volatility score 1-10: cool grey -> amber -> orange -> pink (never green/red,
// which mean up/down everywhere else)
const VOL_COLOR = PALETTES.dark.vol;   // (the dark set; volColor picks the theme's)
const VOL_LABEL = ["", "very calm", "calm", "moderate", "moderate", "lively",
  "lively", "wild", "wild", "extreme", "extreme"];
const volColor = (s) => paletteNow().vol[s] || C.dim;
const volTip = (pct, score) => score
  ? "volatility " + pct + "%/yr — score " + score + "/10, " + VOL_LABEL[score] +
    "\n(how much the price swung over the last 3 months; about 1 point per 10%)"
  : "not enough price history for a volatility score yet";

// ------------------------------------------------------------------ styles
// The default spot (until the widget is dragged: then _settings.position,
// applied with position: fixed on the widget's own root — see frame()).
export const className = `
  top: 2px;
  right: 24px;
  width: ${WIDGET_W}px;
  font-family: -apple-system, "Helvetica Neue", sans-serif;
  color: #E7EDF3;
`;

// No backdrop-filter: Übersicht's blur layer drops in and out on re-renders,
// which reads as the card flickering. A near-opaque fill composites the same
// on every repaint.
const panel = css`
  background: rgba(var(--pw-bg), var(--pw-opacity));
  border: 1px solid rgba(var(--pw-fg), 0.08);
  border-radius: 12px;
  padding: 12px 16px 8px;
`;

const mono = css`
  font-family: "SF Mono", Menlo, monospace;
  font-variant-numeric: tabular-nums;
`;

const eyebrow = css`
  font-size: 9px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: ${C.dim};
`;

const sectionGap = css`
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px solid ${C.faint};
`;

const rowFlex = css`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
`;

const cols = css`
  display: flex;
  align-items: stretch;
`;

const colLeft = css`
  flex: 1;
  min-width: 0;
  padding-right: 14px;
`;

const colLeftWide = css`
  flex: 1.35;
  min-width: 0;
  padding-right: 14px;
`;

const colRight = css`
  flex: 1;
  min-width: 0;
  padding-left: 14px;
  border-left: 1px solid ${C.faint};
`;

// 12.12: the middle one of three columns, and a single column
const colMid = css`
  flex: 1;
  min-width: 0;
  padding: 0 14px;
  border-left: 1px solid ${C.faint};
`;

const colSolo = css`
  flex: 1;
  min-width: 0;
`;

const tabBtn = css`
  font-family: "SF Mono", Menlo, monospace;
  font-size: 9px;
  color: ${C.dim};
  padding: 2px 7px;
  border-radius: 4px;
  cursor: pointer;
`;

const tabActive = css`
  color: ${C.ink};
  background: rgba(var(--pw-fg), 0.1);
`;

const dot = css`
  cursor: pointer;
  padding: 0 2px;
  font-size: 9px;
`;

const linkBtn = css`
  font-family: "SF Mono", Menlo, monospace;
  font-size: 8.5px;
  color: ${C.dim};
  cursor: pointer;
  text-decoration: underline;
`;

// ------------------------------------------------------------------ format
const LOCALE = undefined; // the Mac's own region settings
let CUR = "USD";          // display currency, set from the data every render

const fmtCache = {};
const nf = (opts) => {
  const key = JSON.stringify(opts);
  if (!fmtCache[key]) {
    try {
      fmtCache[key] = new Intl.NumberFormat(LOCALE, opts);
    } catch (e) { // older WebKit without narrowSymbol
      try {
        fmtCache[key] = new Intl.NumberFormat(LOCALE, Object.assign({}, opts, { currencyDisplay: "symbol" }));
      } catch (e2) { // never let a strange currency code take the widget down
        fmtCache[key] = new Intl.NumberFormat(LOCALE, { minimumFractionDigits: opts.minimumFractionDigits,
          maximumFractionDigits: opts.maximumFractionDigits });
      }
    }
  }
  return fmtCache[key];
};
// the display currency from the data: any ISO 4217 code ("EUR", "SEK", "JPY"…)
const setCurrency = (code) => {
  const c = String(code || "USD").toUpperCase();
  CUR = /^[A-Z]{3}$/.test(c) ? c : "USD";
};
const curOpts = (digits) => ({ style: "currency", currency: CUR, currencyDisplay: "narrowSymbol",
  minimumFractionDigits: digits, maximumFractionDigits: digits });
const curSymbol = () => {
  const part = nf(curOpts(0)).formatToParts(0).find((p) => p.type === "currency");
  return part ? part.value : CUR;
};
// minor-unit digits of the display currency (2 for USD/EUR, 0 for JPY/KRW)
const curDigits = () => {
  const o = nf({ style: "currency", currency: CUR }).resolvedOptions();
  return typeof o.maximumFractionDigits === "number" ? Math.min(2, o.maximumFractionDigits) : 2;
};
const money = (v, cents) => {
  if (v === null || v === undefined || isNaN(v)) return "—";
  const abs = Math.abs(v);
  return nf(curOpts(Math.min(abs >= 1000 && !cents ? 0 : 2, curDigits()))).format(abs);
};
const num = (v, digits) =>
  v === null || v === undefined || isNaN(v) ? "—"
    : nf({ minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v);
// sign of an amount as shown: none when it rounds to zero ("0.00%", not "−0.00%")
const signOf = (v, zero) => (Math.abs(v) < zero ? "" : v > 0 ? "+" : "−");
const signedMoney = (v) =>
  v === null || v === undefined || isNaN(v) ? "—"
    : signOf(v, Math.abs(v) >= 1000 || curDigits() === 0 ? 0.5 : 0.005) + money(v);
const pct = (v) =>
  v === null || v === undefined || isNaN(v)
    ? "—"
    : signOf(v, 0.005) + (Math.abs(v) >= 1000 ? num(Math.round(Math.abs(v)), 0) : Math.abs(v).toFixed(2)) + "%";
const upDown = (v) => (v >= 0 ? C.up : C.down);
const fmtTime = (epoch) =>
  new Date(epoch * 1000).toLocaleTimeString(LOCALE, { hour: "2-digit", minute: "2-digit", hour12: false });
const fmtDay = (epoch) =>
  new Date(epoch * 1000).toLocaleDateString(LOCALE, { month: "short", day: "numeric" });
// "Mar 14", or "Mar 14, 2019" outside the current year
const fmtDayY = (epoch) => {
  const dt = new Date(epoch * 1000);
  return dt.getFullYear() === new Date().getFullYear() ? fmtDay(epoch)
    : dt.toLocaleDateString(LOCALE, { month: "short", day: "numeric", year: "numeric" });
};
const fmtIsoLong = (iso) =>
  new Date(iso + "T12:00:00").toLocaleDateString(LOCALE, { month: "short", day: "numeric", year: "numeric" });
// local calendar date of an epoch, as YYYY-MM-DD
const isoOf = (epoch) => {
  const dt = new Date(epoch * 1000);
  return dt.getFullYear() + "-" + String(dt.getMonth() + 1).padStart(2, "0") + "-" +
    String(dt.getDate()).padStart(2, "0");
};
const fmtDate = (iso) => {
  if (!iso) return "—";
  return new Date(iso + "T12:00:00").toLocaleDateString(LOCALE, { month: "short", day: "numeric" });
};
const daysAway = (iso) => {
  if (!iso) return null;
  return Math.round((new Date(iso + "T12:00:00") - new Date()) / 86400000);
};
const fmtStamp = (t, withTime) => {
  const dt = new Date(t * 1000);
  const opts = dt.getFullYear() === new Date().getFullYear()
    ? { weekday: "short", month: "short", day: "numeric" }
    : { month: "short", day: "numeric", year: "numeric" };
  const day = dt.toLocaleDateString(LOCALE, opts);
  return withTime ? day + " " + fmtTime(t) : day;
};
// axis labels: clock times within a day and a half, weekday + time within a
// week, dates within about a year, month + year beyond that
const axisLabel = (t, tA, tB) => {
  const span = tB - tA;
  if (span <= 36 * 3600) return fmtTime(t);
  if (span <= 6 * 86400) return new Date(t * 1000).toLocaleDateString(LOCALE, { weekday: "short" }) + " " + fmtTime(t);
  if (span <= 330 * 86400) return fmtDay(t);
  return new Date(t * 1000).toLocaleDateString(LOCALE, { month: "short", year: "numeric" });
};
const AXIS_H = 12;   // room under a plot for its x labels
// x labels inside the plot: start, three in between, end (repeats dropped)
const XLabels = ({ ticks, y }) => (
  <g pointerEvents="none">
    {ticks.map((tk, i) => (i > 0 && tk.label === ticks[i - 1].label ? null : (
      <text key={i} x={tk.x} y={y} fill={C.dim} fontSize="8" fontFamily='"SF Mono", Menlo, monospace'
        textAnchor={i === 0 ? "start" : i === ticks.length - 1 ? "end" : "middle"}>{tk.label}</text>
    )))}
  </g>
);
const TICK_FRACTIONS = [0, 0.25, 0.5, 0.75, 1];
const signedExact = (v) =>
  v === null || v === undefined || isNaN(v) ? "—" : signOf(v, curDigits() === 0 ? 0.5 : 0.005) + money(v, true);
const fmtAge = (s) =>
  s < 90 ? s + "s" : s < 5400 ? Math.round(s / 60) + "m" : Math.round(s / 3600) + "h";
const fmtAxis = (v, step) => {
  const sign = v < 0 ? "−" : "";
  const a = Math.abs(v);
  const sym = curSymbol().replace(/[A-Za-z]$/, "$&\u00a0");   // "kr 27,250", not "kr27,250"
  if (step < 1) return sign + sym + num(a, Math.min(2, curDigits()));
  if (a >= 1000) {
    if (step < 100) return sign + sym + num(Math.round(a), 0);
    // steps are 1 / 2 / 5 × a power of ten, so one decimal tells 100-step
    // ticks apart ("$298.4k"); two ("$298.40k") ran into the graph's edge
    const dec = step < 1000 ? 1 : 0;
    return sign + sym + (a / 1000).toFixed(dec) + "k";
  }
  return sign + sym + Math.round(a);
};

// Shell-quote for run(): values are validated first anyway; this keeps any
// future free-text field from ever reaching the shell unquoted.
const shq = (s) => "'" + String(s).replace(/'/g, "'\\''") + "'";
const helper = (args) => `cd ${shq(DIR)} && bash ./widget_command.sh ` + args.map(shq).join(" ");
// A headline link is opened only when it is a plain https:// URL made of URL
// characters (the tracker already encodes the rest), and always shell-quoted.
const HTTPS_URL = /^https:\/\/[A-Za-z0-9\-._~:\/?#\[\]@!$&()*+,;=%]+$/;
const openCmd = (url) => (typeof url === "string" && url.length <= 2000 && HTTPS_URL.test(url) ? "open " + shq(url) : null);

// ------------------------------------------------------------------ move / resize / scroll
// Drag the title row (or the ⠿ grip) to move a window, its right edge, bottom
// edge or corner (12.12) to size it; double-click a grip to undo. A move sets
// the root's style directly (no re-render per mousemove); a resize sends a
// draft (GEO) once per animation frame so the layout reflows live. On release
// the state takes over and the choice is saved once (widget_command.sh setting).
// The zoom (12.8's corner grip) lives in the ⚙ editor now.
const DRAG_MIN = 4;        // px the pointer travels before a press becomes a drag (a click stays a click)
const KEEP_ON = 60;        // px of the widget that always stay on screen
const BOTTOM_GAP = 10;     // px left free under a widget that scrolls
const SCALE_SNAP = 0.04;   // within this of 100 % a zoom snaps to 100 %

// a zoom (the ⚙ editor's slider): clamped, snapped to 1 near it, 2 decimals
const snapScale = (v) => {
  const c = Math.max(SCALE_MIN, Math.min(SCALE_MAX, v));
  return Math.abs(c - 1) < SCALE_SNAP ? 1 : Math.round(c * 100) / 100;
};
// keep KEEP_ON px of a visW-wide widget on a vw x vh screen; never above the
// top, so the title row (the handle) can always be reached
const clampPos = (p, visW, vw, vh) => {
  if (!isNumber(vw) || !isNumber(vh)) return p;
  return {
    x: Math.round(Math.min(Math.max(p.x, KEEP_ON - visW), vw - KEEP_ON)),
    y: Math.round(Math.min(Math.max(p.y, 0), vh - KEEP_ON)),
  };
};
// a resize from the edge / corner grips (12.12): the new width and height
// (unscaled px) for a pointer travel of dx, dy screen px at zoom s0: 300–1400
// wide, 160–2000 high, and never past the screen (frameWidth / the screen's
// bottom under the window's top). "r" changes only the width, "b" the height.
const resizeTo = (g, dx, dy, vw, vh) => {
  const out = {};
  if (g.kind !== "b") out.w = frameWidth(g.w0 + dx / g.s0, g.s0, vw);
  if (g.kind !== "r") {
    const h = clampInt(g.h0 + dy / g.s0, WIN_H_MIN, WIN_H_MAX);
    out.h = isNumber(vh) ? Math.min(h, Math.max(WIN_H_MIN, Math.floor((vh - Math.max(0, g.at.y) - BOTTOM_GAP) / g.s0))) : h;
  }
  return out;
};
const nextFrame = (f) => (typeof requestAnimationFrame === "function" ? requestAnimationFrame(f) : setTimeout(f, 16));
// the root's style: the className spot (absolute in the Übersicht container,
// scaled from its top-right corner) or the dragged-to spot (fixed, scaled
// from its top-left). The same keys either way, so React always owns them.
// Wu = the window's width (unscaled px); at the default spot a wider or
// narrower window grows / shrinks leftwards from the className spot.
const frameStyle = (pos, s, Wu) => ({
  position: pos ? "fixed" : "absolute",
  left: pos ? pos.x + "px" : "auto",
  top: pos ? pos.y + "px" : "0px",
  right: pos ? "auto" : "0px",
  width: pos || (isNumber(Wu) && Wu !== WIDGET_W) ? (isNumber(Wu) ? Wu : WIDGET_W) + "px" : "100%",
  transform: s === 1 ? "none" : "scale(" + s + ")",
  transformOrigin: pos ? "top left" : "top right",
});
// how tall the panel may be (unscaled px) with its top at `top` on a screen
// vh high: down to the screen's bottom, less a small gap
const frameMaxHeight = (vh, top, s) =>
  Math.floor(Math.max(KEEP_ON, vh - Math.max(0, top) - BOTTOM_GAP) / s);

const winSize = () => (typeof window !== "undefined" ? [window.innerWidth, window.innerHeight] : [null, null]);
// a window's width (unscaled px): its own (or the live draft), 300–1400, and
// never wider than the screen; the 12.11 window is always 664
const frameWidth = (w, zoom, vw) => {
  const Wu = clampInt(isNumber(w) ? w : WIDGET_W, WIN_W_MIN, WIN_W_MAX);
  return isNumber(vw) ? Math.min(Wu, Math.max(WIN_W_MIN, Math.floor(vw / zoom) - 16)) : Wu;
};
// where a window without a saved spot goes: the first one at the className
// spot (null), the others cascaded down-left from the top-right corner
const CASCADE = 32;
const cascadePos = (i, Wu, zoom, vw) => ({
  x: Math.round((isNumber(vw) ? vw : 1440) - 24 - Wu * zoom - CASCADE * i), y: 2 + CASCADE * i });
const winSpot = (win, i, Wu, zoom, vw) => (isNumber(win.x) && isNumber(win.y) ? { x: win.x, y: win.y }
  : i === 0 ? null : cascadePos(i, Wu, zoom, vw));
// a new / duplicated window: 24 px down-right of the one its ⚙ belongs to
// (its saved spot, else where it is on screen)
const placeNear = (src, i, Wu, zoom) => {
  let p = src && isNumber(src.x) && isNumber(src.y) ? { x: src.x, y: src.y } : null;
  if (!p && src && typeof document !== "undefined") {
    const el = document.querySelector('[data-pw-win="' + src.id + '"]');
    const r = el ? el.getBoundingClientRect() : null;
    if (r) p = { x: Math.round(r.left), y: Math.round(r.top) };
  }
  const size = winSize();
  if (!p) p = cascadePos(i, Wu, zoom, size[0]);
  return clampPos({ x: p.x + 24, y: p.y + 24 }, Wu * zoom, size[0], size[1]);
};
// 13.0: a new / duplicated window opens BESIDE the others: right of the
// rightmost if it fits on the screen, else below the lowest, else any free
// spot next to a window or in a corner, else 24 px down-right of `src`;
// fully on screen when it fits (else KEEP_ON px of it)
const PLACE_GAP = 12;
const winRect = (win, i, vw) => {
  if (typeof document !== "undefined" && document.querySelector) {
    const el = document.querySelector('[data-pw-win="' + win.id + '"]');
    const r = el && el.getBoundingClientRect ? el.getBoundingClientRect() : null;
    if (r && r.width > 0 && r.height > 0) return { x: r.left, y: r.top, w: r.width, h: r.height };
  }
  const z = validScale(win.zoom) || 1;
  const Wu = frameWidth(win.w, z, vw);
  const p = winSpot(win, i, Wu, z, vw) || { x: (isNumber(vw) ? vw : 1440) - 24 - Wu * z, y: 2 };
  return { x: p.x, y: p.y, w: Wu * z, h: (isNumber(win.h) ? win.h : 400) * z };
};
const placeBeside = (wins, src, Wu, Hu, zoom) => {
  const size = winSize(), vw = size[0], vh = size[1];
  const near = () => placeNear(src, wins.length, Wu, zoom);
  if (!isNumber(vw) || !isNumber(vh)) return near();
  const W = Wu * zoom, H = Math.min((isNumber(Hu) ? Hu : 400) * zoom, Math.max(WIN_H_MIN * zoom, vh - 2 - BOTTOM_GAP));
  const rs = wins.map((w, i) => winRect(w, i, vw));
  const free = (p) => p.x >= 0 && p.y >= 0 && p.x + W <= vw && p.y + H <= vh &&
    rs.every((r) => p.x >= r.x + r.w || p.x + W <= r.x || p.y >= r.y + r.h || p.y + H <= r.y);
  const cands = [];
  if (rs.length) {
    const right = rs.reduce((a, r) => (r.x + r.w > a.x + a.w ? r : a));
    const low = rs.reduce((a, r) => (r.y + r.h > a.y + a.h ? r : a));
    cands.push({ x: right.x + right.w + PLACE_GAP, y: right.y }, { x: right.x + right.w + PLACE_GAP, y: 2 });
    cands.push({ x: low.x, y: low.y + low.h + PLACE_GAP }, { x: Math.min(low.x, vw - W), y: low.y + low.h + PLACE_GAP });
    const si = src ? wins.findIndex((w) => w.id === src.id) : -1;
    (si >= 0 ? [rs[si]].concat(rs.filter((r, i) => i !== si)) : rs).forEach((r) => {
      cands.push({ x: r.x + r.w + PLACE_GAP, y: r.y }, { x: r.x - PLACE_GAP - W, y: r.y },
        { x: r.x - PLACE_GAP - W, y: 2 }, { x: r.x, y: r.y + r.h + PLACE_GAP },
        { x: Math.min(r.x, vw - W), y: r.y + r.h + PLACE_GAP }, { x: r.x + r.w - W, y: r.y - PLACE_GAP - H });
    });
  }
  cands.push({ x: vw - 24 - W, y: 2 }, { x: 8, y: 2 }, { x: 8, y: vh - BOTTOM_GAP - H }, { x: vw - 24 - W, y: vh - BOTTOM_GAP - H });
  const hit = cands.find(free);
  if (hit) return { x: Math.round(hit.x), y: Math.round(hit.y) };
  const p = near();
  return {
    x: W <= vw ? Math.min(Math.max(p.x, 0), Math.round(vw - W)) : p.x,
    y: H <= vh ? Math.min(Math.max(p.y, 0), Math.round(vh - H)) : p.y,
  };
};

// after each render: cap the panel at the screen's bottom; the body scrolls
// (data-over tells the css a scrollbar is showing, so the content keeps its width)
const fitFrame = (panelEl) => {
  if (!panelEl || !panelEl.parentNode || typeof window === "undefined") return;
  const s = Number(panelEl.parentNode.getAttribute("data-scale")) || 1;
  const want = frameMaxHeight(window.innerHeight, panelEl.getBoundingClientRect().top, s) + "px";
  if (panelEl.style.maxHeight !== want) panelEl.style.maxHeight = want;
  const body = panelEl.lastChild;
  if (!body || !body.getAttribute) return;
  const over = body.scrollHeight > body.clientHeight + 1 ? "1" : "0";
  if (body.getAttribute("data-over") !== over) body.setAttribute("data-over", over);
};

// one gesture at a time; its window listeners go as soon as the button is up
let gesture = null;
const endGesture = () => {
  window.removeEventListener("mousemove", onGestureMove, true);
  window.removeEventListener("mouseup", onGestureUp, true);
  window.removeEventListener("blur", onGestureUp, false);
  gesture = null;
};
// the release after a drag also clicks whatever is under the pointer (the
// title, a tab): swallow that one click so every click handler stays plain
const swallowClick = () => {
  const stop = (e) => { e.stopPropagation(); e.preventDefault(); };
  window.addEventListener("click", stop, true);
  setTimeout(() => window.removeEventListener("click", stop, true), 0);
};
function onGestureMove(ev) {
  const g = gesture;
  if (!g) return endGesture();
  if (ev.buttons === 0) return onGestureUp(ev);   // released outside the window: mouseup never came
  const dx = ev.clientX - g.x0, dy = ev.clientY - g.y0;
  if (!g.active) {
    if (Math.sqrt(dx * dx + dy * dy) <= DRAG_MIN) return;
    g.active = true;
  }
  ev.preventDefault();
  const size = winSize();
  if (g.kind === "move") {
    g.next = clampPos({ x: g.left0 + dx, y: g.top0 + dy }, g.visW, size[0], size[1]);
    Object.assign(g.root.style, frameStyle(g.next, g.s0, g.Wu));
  } else {
    // a resize: the draft goes to the state once per animation frame (GEO), so
    // the layout reflows live; nothing is saved until the release
    g.next = resizeTo(g, dx, dy, size[0], size[1]);
    if (!g.raf) {
      g.raf = true;
      nextFrame(() => {
        g.raf = false;
        if (gesture === g && g.next) g.dispatch({ type: "GEO", geo: Object.assign({ id: g.id }, g.at, g.next) });
      });
    }
  }
}
function onGestureUp() {
  const g = gesture;
  endGesture();
  if (!g || !g.active || g.next === null) return;
  swallowClick();
  if (g.kind === "move") {
    // dropped where it started: nothing to save (from the default spot, it
    // stays anchored by className: its style goes back to that)
    const from = g.pos0 || { x: Math.round(g.left0), y: Math.round(g.top0) };
    if (g.next.x === from.x && g.next.y === from.y) {
      if (!g.pos0) Object.assign(g.root.style, frameStyle(null, g.s0, g.Wu));
      return;
    }
    if (g.disp) return saveDisplay(patchWin(g.disp, g.id, { x: g.next.x, y: g.next.y }), g.dispatch);   // a window of _settings.display
    g.dispatch({ type: "SET_POS", pos: g.next });
    run(helper(["setting", "position", g.next.x + "," + g.next.y])).catch(() => {});
  } else {
    // back where it started: only the draft goes. Otherwise ONE save of the
    // window's spot (a window at the default spot now stays at its left/top)
    // and size; SET_DISPLAY drops the draft in the same step (no flash)
    if ((g.next.w === undefined || g.next.w === g.w0) && (g.next.h === undefined || g.next.h === Math.round(g.h0))) {
      g.dispatch({ type: "GEO", geo: null });
      return;
    }
    const patch = Object.assign({ x: g.at.x, y: g.at.y }, g.next);
    saveDisplay(patchWin(g.disp || g.mig(), g.id, patch), g.dispatch);
  }
}
// mousedown on a handle: nothing moves until the pointer travels DRAG_MIN px.
// fr = the window's frame facts (frame()): id, Wu, disp (the display it
// belongs to; null for the 12.11 window, which saves position / scale)
const startGesture = (ev, kind, dispatch, pos, s, fr) => {
  if (ev.button !== 0 || typeof window === "undefined") return;
  const root = ev.currentTarget.closest ? ev.currentTarget.closest("[data-pw-win]") : null;
  if (!root) return;
  if (gesture) endGesture();
  const r = root.getBoundingClientRect();
  const f = fr || {};
  // a resize keeps the window's top-left where it is on screen (the default
  // spot becomes that left/top); its height starts from the panel's real one
  // (fit content -> a number)
  const pr = root.firstChild && root.firstChild.getBoundingClientRect ? root.firstChild.getBoundingClientRect() : r;
  gesture = { kind: kind, dispatch: dispatch, root: root, x0: ev.clientX, y0: ev.clientY,
    left0: r.left, top0: r.top, visW: r.width, h0: pr.height / s, s0: s, pos0: pos,
    id: f.id || "main", Wu: isNumber(f.Wu) ? f.Wu : WIDGET_W, disp: f.disp || null, mig: f.mig,
    w0: isNumber(f.Wu) ? f.Wu : WIDGET_W, at: pos || { x: Math.round(r.left), y: Math.round(r.top) },
    active: false, next: null, raf: false };
  ev.preventDefault();   // no text selection while dragging
  window.addEventListener("mousemove", onGestureMove, true);
  window.addEventListener("mouseup", onGestureUp, true);
  window.addEventListener("blur", onGestureUp, false);
};
const resetPos = (dispatch, fr) => {
  if (fr && fr.disp) return saveDisplay(patchWin(fr.disp, fr.id, { x: undefined, y: undefined }), dispatch);
  dispatch({ type: "SET_POS", pos: false });
  run(helper(["setting", "position", "default"])).catch(() => {});
};
// double-click a grip: back to 664 wide (right edge), fit content (bottom
// edge), or both (corner). The 12.11 window already is both: nothing to do
const resetSize = (kind, dispatch, fr) => {
  const cur = fr && fr.disp ? fr.disp.windows.find((w) => w.id === fr.id) : null;
  if (!cur) return;
  const patch = {};
  if (kind !== "b" && cur.w !== undefined) patch.w = undefined;
  if (kind !== "r" && cur.h !== undefined) patch.h = undefined;
  if (Object.keys(patch).length) saveDisplay(patchWin(fr.disp, fr.id, patch), dispatch);
};

const frameRoot = css`
  & .pw-grip { opacity: 0; transition: opacity 0.15s; }
  &:hover .pw-grip { opacity: 1; }
`;
const framePanel = css`
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
`;
const frameHead = css`
  flex: none;
  user-select: none;
  -webkit-user-select: none;
`;
// margin/padding: the scrollbar (6 px) sits in the panel's right padding, and
// the clip edge lies in the side paddings (a sector chart's hover backdrop
// reaches 5 px past the content)
const frameBody = css`
  flex: 0 1 auto;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  margin-left: -8px;
  padding-left: 8px;
  margin-right: -12px;
  padding-right: 12px;
  &[data-over="1"] { padding-right: 6px; }
  &::-webkit-scrollbar { width: 6px; }
  &::-webkit-scrollbar-track { background: transparent; }
  &::-webkit-scrollbar-thumb { background: rgba(var(--pw-fg), 0.13); border-radius: 3px; }
  &::-webkit-scrollbar-thumb:hover { background: rgba(var(--pw-fg), 0.24); }
`;
const moveGrip = css`
  position: absolute;
  left: 3px;
  top: 10px;
  font-size: 10px;
  line-height: 12px;
  color: ${C.dim};
  cursor: grab;
  user-select: none;
  -webkit-user-select: none;
`;
// the edges: invisible strips (the right one stays clear of the scrollbar,
// which sits 4 px inside the border)
const edgeRight = css`
  position: absolute;
  top: 0;
  right: 0;
  bottom: 14px;
  width: 5px;
  cursor: ew-resize;
`;
const edgeBottom = css`
  position: absolute;
  left: 0;
  right: 14px;
  bottom: 0;
  height: 5px;
  cursor: ns-resize;
`;
const sizeGrip = css`
  position: absolute;
  right: 2px;
  bottom: 2px;
  width: 12px;
  height: 12px;
  cursor: nwse-resize;
`;

// Every view goes through here: the root (position + scale), the panel
// (capped at the screen's bottom), the title row (never scrolls: the handle)
// and the body (scrolls when the widget is taller than the screen).
// state._win = the window being drawn (renderWindow); the 12.11 window takes
// its spot and zoom from the legacy keys (posOf / scaleOf), a display window
// from its own fields (or the live draft `geo` while a grip is dragged).
// A window's geometry this render (renderWindow keeps it in state._geo): zoom,
// width Wu and height Hu (unscaled px; Hu "auto" = fit content, capped at the
// screen's bottom by fitFrame), the saved spot and the on-screen one.
const winGeom = (state) => {
  const win = state._win || { id: "main", legacy: true, idx: 0, n: 1 };
  const g = state.geo && state.geo.id === win.id ? state.geo : null;
  const size = winSize();
  // (the zoom slider's draft too: it previews live, also on the 12.11 window)
  const s = validScale(g && g.zoom) || (win.legacy ? scaleOf(state) : validScale(win.zoom) || 1);
  // (the draft of a grip drag wins, also over the 12.11 window's legacy keys)
  const Wu = g && isNumber(g.w) ? frameWidth(g.w, s, size[0])
    : win.legacy && !isNumber(win.w) ? WIDGET_W : frameWidth(win.w, s, size[0]);
  const saved = g && isNumber(g.x) && isNumber(g.y) ? { x: g.x, y: g.y }
    : win.legacy ? posOf(state) : winSpot(win, win.idx || 0, Wu, s, size[0]);
  const pos = saved ? clampPos(saved, Wu * s, size[0], size[1]) : null;
  const h = g && (g.h === "auto" || isNumber(g.h)) ? g.h : win.h;
  const top = pos ? pos.y : 2;
  const Hu = !isNumber(h) ? "auto" : Math.min(clampInt(h, WIN_H_MIN, WIN_H_MAX),
    isNumber(size[1]) ? Math.max(WIN_H_MIN, Math.floor((size[1] - Math.max(0, top) - BOTTOM_GAP) / s)) : WIN_H_MAX);
  return { win: win, g: g, s: s, Wu: Wu, Hu: Hu, saved: saved, pos: pos };
};
const frame = (state, dispatch, head, body, hover) => {
  const G = state._geo || winGeom(state);
  const win = G.win, s = G.s, Wu = G.Wu, saved = G.saved, pos = G.pos;
  const disp = win.legacy ? null : state._disp || null;
  if (!win.idx) rememberFrame(saved, s, Wu);
  // mig: the display a resize of the 12.11 window starts from (its legacy keys)
  const fr = { id: win.id, Wu: Wu, disp: disp, mig: () => migrateDisplay(state) };
  const down = (kind) => (ev) => startGesture(ev, kind, dispatch, pos, s, fr);
  // one line (12.11, per window): its own height, so a saved height is ignored
  const oneLine = hasData(state) && compactOf(state);
  const Hu = oneLine ? "auto" : G.Hu;
  const style = frameStyle(pos, s, Wu);
  const extra = {};
  if (win.n > 1) {   // several windows: the one last pressed is on top
    style.zIndex = state.front === win.id ? 2 : 1;
    if (state.front !== win.id) extra.onMouseDownCapture = () => dispatch({ type: "FRONT", w: win.id });
  }
  return (
    <div key={win.id} className={frameRoot + " " + themeClass(themeOf(state), opacityOf(state))} style={style} data-pw-root="1"
      data-pw-win={win.id} data-pw-theme={themeOf(state)} data-scale={String(s)} {...hover} {...extra}>
      <div className={css`${panel} ${framePanel}`} ref={(el) => fitFrame(el)}
        style={isNumber(Hu) ? { height: Hu + "px" } : undefined}>
        <div className={frameHead} onMouseDown={down("move")}>{head}</div>
        <div className={frameBody} style={isNumber(Hu) ? { flex: "1 1 auto" } : undefined}>{body}</div>
      </div>
      <span className={moveGrip + " pw-grip"} onMouseDown={down("move")}
        onDoubleClick={() => resetPos(dispatch, fr)}
        title="drag to move the widget · double-click: back to its default spot">⠿</span>
      <div className={edgeRight} data-pw-grip="r" onMouseDown={down("r")} onDoubleClick={() => resetSize("r", dispatch, fr)}
        title={"drag to change the width (" + Wu + " px) · double-click: " + WIDGET_W + " px"} />
      {oneLine ? null : (
        <div className={edgeBottom} data-pw-grip="b" onMouseDown={down("b")} onDoubleClick={() => resetSize("b", dispatch, fr)}
          title={"drag to change the height" + (isNumber(Hu) ? " (" + Hu + " px)" : "") + " · double-click: fit content"} />
      )}
      {oneLine ? null : (
        <svg className={sizeGrip + " pw-grip"} data-pw-grip="rb" viewBox="0 0 12 12" onMouseDown={down("rb")}
          onDoubleClick={() => resetSize("rb", dispatch, fr)}>
          <title>{"drag to resize (" + Wu + " × " + (isNumber(Hu) ? Hu : "fit") + ") · double-click: " + WIDGET_W + " wide, fit content"}</title>
          <path d="M11 4 L4 11 M11 8 L8 11" stroke={C.dim} strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      )}
    </div>
  );
};

// ------------------------------------------------------------------ graph
// Nice round tick values covering [mn, mx], recomputed every render.
const crisp = (v) => Math.round(v) + 0.5;   // 1px lines on pixel centres
const LINE_STYLE = { strokeLinejoin: "round", strokeLinecap: "round", shapeRendering: "geometricPrecision" };
const SURFACE = "var(--pw-surface)";   // the panel colour: the ring that keeps a marker dot legible on its line

// index of the point nearest to time t (times ascending)
const nearestIdx = (times, t) => {
  let lo = 0, hi = times.length - 1;
  if (hi < 0) return -1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (times[mid] < t) lo = mid; else hi = mid;
  }
  return Math.abs(times[lo] - t) <= Math.abs(times[hi] - t) ? lo : hi;
};
// pointer -> 0..1 across an SVG's plot area (W = the svg's drawn width)
const plotFraction = (ev, W, padL, padR) => {
  const svg = ev.currentTarget.ownerSVGElement || ev.currentTarget;
  const rect = svg.getBoundingClientRect();
  const px = (ev.clientX - rect.left) * (W / (rect.width || W));
  return Math.max(0, Math.min(1, (px - padL) / (W - padL - padR)));
};
// the pointer moves far more often than the widget needs to redraw
// (one queue per window: dispatch.w, see renderWindow)
const hoverQ = {};
const queueHover = (dispatch, t) => {
  const q = hoverQ[dispatch.w || ""] || (hoverQ[dispatch.w || ""] = { raf: 0, t: null });
  q.t = t;
  if (q.raf) return;
  q.raf = requestAnimationFrame(() => {
    q.raf = 0;
    dispatch({ type: "HOVER_PT", t: q.t });
  });
};
// hairline snapped to a data point + a ringed dot on the line
const Crosshair = ({ cx, cy, top, bottom, strong, small }) => (
  <g pointerEvents="none">
    <line x1={crisp(cx)} y1={top} x2={crisp(cx)} y2={bottom} stroke={strong ? C.ink : C.dim}
      strokeWidth="1" opacity={strong ? 0.5 : 0.75} shapeRendering="crispEdges" />
    <circle cx={cx} cy={cy} r={small ? 2.2 : 3} fill={C.ink} stroke={SURFACE} strokeWidth={small ? 1.5 : 2} />
  </g>
);
const niceTicks = (mn, mx, target) => {
  const span = mx - mn;
  if (span <= 0) return { ticks: [mn], step: 1 };
  const step0 = span / (target || 4);
  const mag = Math.pow(10, Math.floor(Math.log10(step0)));
  const norm = step0 / mag;
  const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
  const ticks = [];
  for (let v = Math.ceil(mn / step) * step; v <= mx + 1e-9; v += step) {
    ticks.push(v);
  }
  return { ticks: ticks, step: step };
};

// runs of one style: real (recorded or ≈ rebuilt: one solid line, 12.10) or
// simulated (backtest: solid too, only lighter). The segment joining two runs
// takes the later run's style, except after a simulated run: the step into
// the first real day is still part of the simulation. Runs share their joint
// point, so the line has no gap there.
const splitRuns = (pts) => {
  const runs = [];
  let cur = null;
  pts.forEach((p) => {
    const s = !!p.sim;
    if (!cur || cur.sim !== s) {
      cur = { sim: s, pts: [] };
      runs.push(cur);
    }
    cur.pts.push(p);
  });
  for (let i = 1; i < runs.length; i++) {
    const prevPts = runs[i - 1].pts;
    if (runs[i - 1].sim && !runs[i].sim) prevPts.push(runs[i].pts[0]);
    else runs[i].pts.unshift(prevPts[prevPts.length - 1]);
  }
  return runs;
};

// bench (optional): the benchmark's value at each point of `series` (null = unknown),
// drawn as a thin solid grey line under the portfolio's; boughtT: the first real day, marked when simulated points precede it
const Graph = ({ series, width, height, yTicks, hoverT, markT, onHover, onPick, bench, boughtT }) => {
  const W = width || 296, H = height || 74;
  const PADL = 42, PADR = 4, PADT = 5, PADB = 5;
  if (!series || series.length < 2) {
    return (
      <div className={css`height: ${H + AXIS_H}px; display: flex; align-items: center; justify-content: center; color: ${C.dim}; font-size: 10px;`}>
        collecting history…
      </div>
    );
  }
  const t0 = series[0].t, t1 = series[series.length - 1].t;
  let vMin = Infinity, vMax = -Infinity;
  series.forEach((p) => {
    if (p.v < vMin) vMin = p.v;
    if (p.v > vMax) vMax = p.v;
  });
  const benchOn = !!(bench && bench.length === series.length);
  if (benchOn) bench.forEach((v) => {
    if (!isNum(v)) return;
    if (v < vMin) vMin = v;
    if (v > vMax) vMax = v;
  });
  // a nearly flat line keeps some height (0.2% of the value, at least 1): a
  // $36,507 day that moved $0.50 gets "$36,480 … $36,540", not "36507.50"
  const minSpan = Math.max(1, Math.max(Math.abs(vMax), Math.abs(vMin)) * 0.002);
  if (vMax - vMin < minSpan) {
    const mid = (vMax + vMin) / 2;
    vMax = mid + minSpan / 2;
    vMin = mid - minSpan / 2;
  }
  const span = vMax - vMin;
  vMax += span * 0.06;
  vMin -= span * 0.06;
  const x = (t) => PADL + ((t - t0) / Math.max(1, t1 - t0)) * (W - PADL - PADR);
  const y = (v) => H - PADB - ((v - vMin) / (vMax - vMin)) * (H - PADT - PADB);
  const nt = niceTicks(vMin, vMax, yTicks || 4);
  const runs = splitRuns(series);
  const areaPath =
    "M" + x(series[0].t) + "," + (H - PADB) +
    series.map((p) => " L" + x(p.t).toFixed(1) + "," + y(p.v).toFixed(1)).join("") +
    " L" + x(t1).toFixed(1) + "," + (H - PADB) + " Z";
  // the benchmark line, broken where it has no value
  const benchLines = [];
  if (benchOn) {
    let cur = [];
    series.forEach((p, i) => {
      if (isNum(bench[i])) cur.push(x(p.t).toFixed(1) + "," + y(bench[i]).toFixed(1));
      else if (cur.length) { benchLines.push(cur); cur = []; }
    });
    if (cur.length) benchLines.push(cur);
  }
  const boughtShown = isNum(boughtT) && series[0].sim && boughtT > t0 && boughtT <= t1;
  const times = series.map((p) => p.t);
  const timeAt = (ev) => series[nearestIdx(times, t0 + plotFraction(ev, W, PADL, PADR) * (t1 - t0))].t;
  const crossAt = (t, strong) => {
    if (t === null || t === undefined || t < t0 - 1 || t > t1 + 1) return null;
    const p = series[nearestIdx(times, t)];
    return <Crosshair cx={x(p.t)} cy={y(p.v)} top={PADT} bottom={H - PADB} strong={strong} />;
  };
  const xTicks = TICK_FRACTIONS.map((f) => {
    const t = t0 + f * (t1 - t0);
    return { x: x(t), label: axisLabel(t, t0, t1) };
  });
  return (
    <svg width={W} height={H + AXIS_H}>
      {nt.ticks.map((tv) => (
        <g key={tv}>
          <line x1={PADL} y1={crisp(y(tv))} x2={W - PADR} y2={crisp(y(tv))} stroke={C.faint} strokeWidth="1" shapeRendering="crispEdges" />
          <text x={PADL - 5} y={crisp(y(tv)) + 3} textAnchor="end" fill={C.dim} fontSize="8"
            fontFamily='"SF Mono", Menlo, monospace'>
            {fmtAxis(tv, nt.step)}
          </text>
        </g>
      ))}
      <XLabels ticks={xTicks} y={H + AXIS_H - 3} />
      <path d={areaPath} fill={C.line} opacity="0.07" />
      {benchLines.map((pts, i) => (pts.length > 1 ? (
        <polyline key={"b" + i} points={pts.join(" ")} fill="none" stroke={C.dim} strokeWidth="1"
          opacity="0.6" {...LINE_STYLE} />
      ) : null))}
      {runs.map((r, i) => (
        <polyline
          key={i}
          points={r.pts.map((p) => x(p.t).toFixed(1) + "," + y(p.v).toFixed(1)).join(" ")}
          fill="none"
          stroke={C.line}
          strokeWidth="1.25"
          opacity={r.sim ? 0.45 : 1}
          {...LINE_STYLE}
        />
      ))}
      {boughtShown ? (
        <g pointerEvents="none">
          <line x1={crisp(x(boughtT))} y1={PADT} x2={crisp(x(boughtT))} y2={H - PADB}
            stroke={C.dim} strokeWidth="1" opacity="0.7" shapeRendering="crispEdges" />
          <text x={x(boughtT) + (x(boughtT) > W - 90 ? -4 : 4)} y={PADT + 8} fontSize="8"
            textAnchor={x(boughtT) > W - 90 ? "end" : "start"} fill={C.dim}>you bought here</text>
        </g>
      ) : null}
      {vMin < 0 && vMax > 0 ? (
        <line x1={PADL} y1={crisp(y(0))} x2={W - PADR} y2={crisp(y(0))}
          stroke={C.dim} strokeWidth="1" opacity="0.6" shapeRendering="crispEdges" />
      ) : null}
      {crossAt(markT, true)}
      {crossAt(hoverT, false)}
      {onHover ? (
        <rect x={PADL} y={0} width={W - PADL - PADR} height={H} fill="transparent" pointerEvents="all"
          style={{ cursor: "crosshair" }}
          onMouseMove={(ev) => onHover(timeAt(ev))}
          onMouseLeave={() => onHover(null)}
          onClick={(ev) => onPick(timeAt(ev))} />
      ) : null}
    </svg>
  );
};

const Spark = ({ values, w }) => {
  const W = w || LAYOUT_K.SPARK, H = 14;   // w: narrower when a holding row also carries a drift badge (12.10)
  if (!values || values.length < 2) return <svg width={W} height={H} />;
  let mn = Infinity, mx = -Infinity;
  values.forEach((v) => { if (v < mn) mn = v; if (v > mx) mx = v; });
  if (mx === mn) { mx += 1; mn -= 1; }
  const pts = values
    .map((v, i) =>
      ((i / (values.length - 1)) * W).toFixed(1) + "," +
      (H - 1 - ((v - mn) / (mx - mn)) * (H - 2)).toFixed(1))
    .join(" ");
  return (
    <svg width={W} height={H}>
      <polyline points={pts} fill="none" stroke={C.line} strokeWidth="1" opacity="0.75" {...LINE_STYLE} />
    </svg>
  );
};

// ------------------------------------------------------------------ sectors
// Small multiples: one chart per sector plus one for the whole portfolio, all
// on the same % scale, so shapes and sizes compare at a glance. No colour
// coding — past ~8 series, hues stop being tellable apart, so position and a
// title carry identity. Points are spaced evenly (one per trading bar), which
// leaves nights and weekends out instead of drawing them as flat steps. The
// crosshair runs through every chart at once, and each title then shows its
// value at that moment. Click a chart to enlarge it.
const facetCss = css`
  border-radius: 6px;
  padding: 3px 5px 2px;
  margin: -3px -5px -2px;
  cursor: zoom-in;
  &:hover { background: rgba(var(--pw-fg), 0.055); }
`;
const isNum = (v) => v !== null && v !== undefined;
const lastNum = (ser) => {
  for (let i = ser.length - 1; i >= 0; i--) if (isNum(ser[i])) return ser[i];
  return null;
};
const SectorGrid = ({ data, width, height, cols: colsIn, hoverT, markT, scaleMode, order, rangeWords, onHover, onOpen }) => {
  if (!data || !data.t || data.t.length < 2) {
    return (
      <div className={css`height: ${height || LAYOUT_K.GRAPH_H}px; display: flex; align-items: center; justify-content: center; color: ${C.dim}; font-size: 10px;`}>
        no sector history for this range yet
      </div>
    );
  }
  const times = data.t;
  const n = times.length;
  const themes = (data.themes || []).slice();
  if (order === "best") {
    themes.sort((a, b) => {
      const va = lastNum(a.pct), vb = lastNum(b.pct);
      return (isNum(vb) ? vb : -1e9) - (isNum(va) ? va : -1e9);
    });
  }
  const facets = [{ name: "portfolio", pct: data.total || [], whole: true }].concat(themes);
  // columns from the window's width (layoutFor: 4 at the 12.11 width)
  const cols = colsIn || 4, GAP = LAYOUT_K.SECTOR_GAP, H = LAYOUT_K.SECTOR_H;
  const w = Math.floor((width - GAP * (cols - 1)) / cols);
  let gMin = 0, gMax = 0;
  facets.forEach((f) => f.pct.forEach((v) => {
    if (!isNum(v)) return;
    if (v < gMin) gMin = v;
    if (v > gMax) gMax = v;
  }));
  const hovering = isNum(hoverT);
  const activeT = hovering ? hoverT : markT;
  const ai = isNum(activeT) && activeT >= times[0] - 1 && activeT <= times[n - 1] + 1 ? nearestIdx(times, activeT) : -1;
  const xi = (i) => 1 + (i / Math.max(1, n - 1)) * (w - 2);
  const timeAt = (ev) => times[Math.round(plotFraction(ev, w, 1, 1) * (n - 1))];
  return (
    <div style={{ display: "flex", flexWrap: "wrap", columnGap: GAP + "px", rowGap: "9px" }}>
      {facets.map((f) => {
        let lo = 0, hi = 0;
        f.pct.forEach((v) => { if (!isNum(v)) return; if (v < lo) lo = v; if (v > hi) hi = v; });
        let mn = scaleMode === "own" ? lo : gMin, mx = scaleMode === "own" ? hi : gMax;
        if (mx === mn) { mx += 1; mn -= 1; }
        const padv = (mx - mn) * 0.08;
        mx += padv; mn -= padv;
        const y = (v) => H - 2 - ((v - mn) / (mx - mn)) * (H - 4);
        const pts = [];
        let lastI = -1;
        f.pct.forEach((v, i) => { if (isNum(v)) { pts.push(xi(i).toFixed(1) + "," + y(v).toFixed(1)); lastI = i; } });
        const line = pts.join(" ");
        const shown = ai >= 0 ? f.pct[ai] : lastNum(f.pct);
        const label = f.whole ? "whole portfolio" : f.name;
        return (
          <div key={f.name} className={facetCss} style={{ width: w + "px" }}
            onClick={() => onOpen(f.whole ? "portfolio" : f.name)}
            title={label + ": " + pct(lastNum(f.pct)) + " " + rangeWords + " (low " + pct(lo) + ", high " + pct(hi) + ") — click to enlarge"}>
            <div style={{ display: "flex", alignItems: "baseline" }}>
              <span style={{ flex: 1, minWidth: 0, fontSize: 9.5, color: C.ink, opacity: f.whole ? 1 : 0.85, fontWeight: f.whole ? 600 : 400,
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
              <span className={mono} style={{ fontSize: 9.5, marginLeft: 6, color: upDown(shown || 0) }}>{pct(shown)}</span>
            </div>
            <svg width={w} height={H} style={{ display: "block", marginTop: 2 }}>
              <line x1={0} y1={crisp(y(0))} x2={w} y2={crisp(y(0))} stroke={C.dim} strokeWidth="1" opacity="0.45" shapeRendering="crispEdges" />
              {pts.length > 1 ? (
                <path d={"M" + xi(0).toFixed(1) + "," + y(0).toFixed(1) + " L" + line.replace(/ /g, " L") +
                  " L" + xi(lastI).toFixed(1) + "," + y(0).toFixed(1) + " Z"} fill={C.line} opacity="0.08" />
              ) : null}
              <polyline points={line} fill="none" stroke={C.line} strokeWidth="1.25" {...LINE_STYLE} />
              {ai < 0 && lastI >= 0 ? (
                <circle cx={xi(lastI)} cy={y(f.pct[lastI])} r="1.9" fill={C.ink} stroke={SURFACE} strokeWidth="1" pointerEvents="none" />
              ) : null}
              {ai >= 0 && isNum(f.pct[ai]) ? (
                <Crosshair cx={xi(ai)} cy={y(f.pct[ai])} top={0} bottom={H} strong={!hovering} small />
              ) : null}
              <rect x={0} y={0} width={w} height={H} fill="transparent" pointerEvents="all"
                onMouseMove={(ev) => onHover(timeAt(ev))}
                onMouseLeave={() => onHover(null)} />
            </svg>
          </div>
        );
      })}
    </div>
  );
};

// One sector enlarged: its line against the whole portfolio (grey, for
// reference) on a % axis, with the same snapping crosshair. Emphasis rather
// than colour coding: the sector is the subject, the portfolio is context.
const sectorSeriesOf = (data, name) => {
  if (!data) return null;
  if (name === "portfolio") return data.total || null;
  const th = (data.themes || []).find((t) => t.name === name);
  return th ? th.pct : null;
};
const LineKey = ({ color }) => (
  <svg width={14} height={6} style={{ verticalAlign: "middle", marginRight: 4 }}>
    <line x1={1} y1={3} x2={13} y2={3} stroke={color} strokeWidth="2" strokeLinecap="round" />
  </svg>
);
const SectorFocus = ({ data, name, width, height, hoverT, markT, onHover, onPick }) => {
  const main = sectorSeriesOf(data, name);
  const W = width, H = height, PADL = 42, PADR = 4, PADT = 5, PADB = 5;
  if (!main || !data.t || data.t.length < 2) {
    return (
      <div className={css`height: ${H}px; display: flex; align-items: center; justify-content: center; color: ${C.dim}; font-size: 10px;`}>
        no history for {name} over this range
      </div>
    );
  }
  const times = data.t;
  const n = times.length;
  const ref = name === "portfolio" ? null : data.total;
  let mn = 0, mx = 0;
  [main, ref].forEach((ser) => (ser || []).forEach((v) => {
    if (!isNum(v)) return;
    if (v < mn) mn = v;
    if (v > mx) mx = v;
  }));
  if (mx === mn) { mx += 1; mn -= 1; }
  const span = mx - mn;
  mx += span * 0.06;
  mn -= span * 0.06;
  const t0 = times[0], t1 = times[n - 1];
  // one evenly spaced step per trading bar: nights and weekends take no room
  const xi = (i) => PADL + (i / Math.max(1, n - 1)) * (W - PADL - PADR);
  const y = (v) => H - PADB - ((v - mn) / (mx - mn)) * (H - PADT - PADB);
  const nt = niceTicks(mn, mx, 4);
  const tickLabel = (v) => (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toFixed(nt.step < 1 ? 1 : 0) + "%";
  const pointsOf = (ser) => {
    const pts = [];
    ser.forEach((v, i) => { if (isNum(v)) pts.push(xi(i).toFixed(1) + "," + y(v).toFixed(1)); });
    return pts.join(" ");
  };
  const mainLine = pointsOf(main);
  const hovering = isNum(hoverT);
  const activeT = hovering ? hoverT : markT;
  const ai = isNum(activeT) && activeT >= t0 - 1 && activeT <= t1 + 1 ? nearestIdx(times, activeT) : -1;
  const timeAt = (ev) => times[Math.round(plotFraction(ev, W, PADL, PADR) * (n - 1))];
  const xTicks = TICK_FRACTIONS.map((f) => {
    const i = Math.round(f * (n - 1));
    return { x: xi(i), label: axisLabel(times[i], t0, t1) };
  });
  return (
    <svg width={W} height={H + AXIS_H}>
      <XLabels ticks={xTicks} y={H + AXIS_H - 3} />
      {nt.ticks.map((tv) => (
        <g key={tv}>
          <line x1={PADL} y1={crisp(y(tv))} x2={W - PADR} y2={crisp(y(tv))} stroke={C.faint} strokeWidth="1" shapeRendering="crispEdges" />
          <text x={PADL - 5} y={crisp(y(tv)) + 3} textAnchor="end" fill={C.dim} fontSize="8"
            fontFamily='"SF Mono", Menlo, monospace'>{tickLabel(tv)}</text>
        </g>
      ))}
      <line x1={PADL} y1={crisp(y(0))} x2={W - PADR} y2={crisp(y(0))} stroke={C.dim} strokeWidth="1" opacity="0.6" shapeRendering="crispEdges" />
      <path d={"M" + xi(0).toFixed(1) + "," + y(0).toFixed(1) + " L" + mainLine.replace(/ /g, " L") +
        " L" + xi(n - 1).toFixed(1) + "," + y(0).toFixed(1) + " Z"} fill={C.line} opacity="0.07" />
      {ref ? <polyline points={pointsOf(ref)} fill="none" stroke={C.dim} strokeWidth="1.25" opacity="0.9" {...LINE_STYLE} /> : null}
      <polyline points={mainLine} fill="none" stroke={C.line} strokeWidth="1.5" {...LINE_STYLE} />
      {ai >= 0 && ref && isNum(ref[ai]) ? (
        <circle cx={xi(ai)} cy={y(ref[ai])} r="2.4" fill={C.dim} stroke={SURFACE} strokeWidth="1.5" pointerEvents="none" />
      ) : null}
      {ai >= 0 && isNum(main[ai]) ? (
        <Crosshair cx={xi(ai)} cy={y(main[ai])} top={PADT} bottom={H - PADB} strong={!hovering} />
      ) : null}
      <rect x={PADL} y={0} width={W - PADL - PADR} height={H} fill="transparent" pointerEvents="all" style={{ cursor: "crosshair" }}
        onMouseMove={(ev) => onHover(timeAt(ev))}
        onMouseLeave={() => onHover(null)}
        onClick={(ev) => onPick(timeAt(ev))} />
    </svg>
  );
};

const VolBadge = ({ pct: p, score }) => (
  <span title={volTip(p, score)} className={mono} style={{
    display: "inline-block", minWidth: 14, textAlign: "center", fontSize: 8.5,
    lineHeight: "11px", borderRadius: 3, color: volColor(score),
    border: "1px solid " + (score ? volColor(score) + "66" : C.faint),
  }}>
    {score || "–"}
  </span>
);

// Drift from the target allocation (12.10), next to the vol badge. The row keeps
// its width: the sparkline gives up DRIFT_W. A row covered by a sector target
// shows its sector's drift (fainter solid border); no target at all -> empty spacer.
const DRIFT_W = 30;   // badge 28 + 2 margin
const DriftBadge = ({ p, d }) => {
  const b = bucketFor(d, p.targetKey);
  const own = typeof p.driftPct === "number" && isFinite(p.driftPct);
  const sec = !own && !!b && b.kind === "sector" && typeof b.driftPct === "number" && isFinite(b.driftPct);
  if (!own && !sec) return <DriftSpacer />;
  const dp = own ? p.driftPct : b.driftPct;
  const over = b ? b.state === "over" : false;
  const color = over || dp > 0 ? C.orange : C.dim;
  const gap = Math.abs(dp) < 0.05 ? "on target" : fmtPts(Math.abs(dp)).replace("+", "") + " pts " + (dp > 0 ? "over" : "under");
  return (
    <span title={own ? p.ticker + ": " + p.weightPct + "% of the portfolio, target " + fmtTarget(p.targetPct) +
      " (±" + bandOf(d) + " pt) — " + gap
      : b.key + " sector: " + fmtPts(dp) + " pts — " + b.weightPct + "% of the portfolio, target " + fmtTarget(b.targetPct) +
      " (±" + bandOf(d) + " pt), " + gap + "; " + p.ticker + " counts toward it"} className={mono} style={{
      display: "inline-block", width: 28, marginLeft: 2, boxSizing: "border-box", textAlign: "center",
      fontSize: 8, lineHeight: "11px", borderRadius: 3, whiteSpace: "nowrap", overflow: "hidden",
      color: color, border: "1px solid " + (color === C.dim ? C.faint : color + (sec ? "33" : "66")),
      opacity: !over && dp > 0 ? 0.55 : 1,
    }}>
      {fmtPts(dp)}
    </span>
  );
};
const DriftSpacer = () => <span style={{ display: "inline-block", width: DRIFT_W }} />;

const VolMeter = ({ score }) => (
  <span style={{ display: "inline-flex", gap: 1.5, verticalAlign: "middle" }}>
    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => (
      <span key={i} style={{ width: 5, height: 6, borderRadius: 1,
        background: score && i <= score ? volColor(score) : C.faint }} />
    ))}
  </span>
);

// ------------------------------------------------------------------ heatmap
// Bruls et al. "Squarified Treemaps".
const squarify = (items, x, y, w, h) => {
  const total = items.reduce((s, i) => s + i.value, 0);
  if (total <= 0 || w <= 0 || h <= 0) return [];
  const scaled = items
    .map((it) => Object.assign({}, it, { area: (it.value / total) * w * h }))
    .filter((i) => i.area > 0)
    .sort((a, b) => b.area - a.area);
  const out = [];
  let cx = x, cy = y, cw = w, ch = h;
  let row = [];
  const worst = (r, len) => {
    const s = r.reduce((a, q) => a + q.area, 0);
    let mx = -Infinity, mn = Infinity;
    for (const q of r) {
      if (q.area > mx) mx = q.area;
      if (q.area < mn) mn = q.area;
    }
    return Math.max((len * len * mx) / (s * s), (s * s) / (len * len * mn));
  };
  const layoutRow = (r) => {
    const s = r.reduce((a, q) => a + q.area, 0);
    // float drift can leave a ~0-size strip; dividing by it gives NaN geometry
    if (s <= 0 || cw <= 0.5 || ch <= 0.5) return;
    if (cw >= ch) {
      const rw = s / ch;
      if (!isFinite(rw) || rw <= 0) return;
      let ry = cy;
      for (const q of r) {
        const rh = q.area / rw;
        out.push(Object.assign({}, q, { x: cx, y: ry, w: rw, h: rh }));
        ry += rh;
      }
      cx += rw;
      cw -= rw;
    } else {
      const rh = s / cw;
      if (!isFinite(rh) || rh <= 0) return;
      let rx = cx;
      for (const q of r) {
        const qw = q.area / rh;
        out.push(Object.assign({}, q, { x: rx, y: cy, w: qw, h: rh }));
        rx += qw;
      }
      cy += rh;
      ch -= rh;
    }
  };
  for (const it of scaled) {
    const len = Math.min(cw, ch);
    if (row.length && worst(row, len) < worst(row.concat([it]), len)) {
      layoutRow(row);
      row = [it];
    } else {
      row.push(it);
    }
  }
  if (row.length) layoutRow(row);
  return out;
};

// Apple system palette; saturates toward full green/red at the cap for the
// active range, so a quiet day isn't a wall of neon.
const neutralOf = () => paletteNow().neutral;   // the resting tile, per theme
const GREEN = [48, 209, 88];
const RED = [255, 69, 58];
const AMBER = [245, 180, 60];
const PINK = [236, 72, 153];
const RANGE_CAP = { "1H": 2.5, "1D": 4, "1W": 8, "1M": 18, "1Y": 60 };

const mixc = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const rgb = (c) => "rgb(" + c[0] + ", " + c[1] + ", " + c[2] + ")";
const tileColor = (p, range) => {
  const cap = RANGE_CAP[range] || 4;
  const t = Math.min(1, Math.abs(p) / cap);
  const e = Math.pow(t, 0.75);
  return rgb(mixc(neutralOf(), p >= 0 ? GREEN : RED, 0.18 + 0.82 * e));
};
// VOL mode: calm = the neutral tile, rising through amber to pink
const volTileColor = (score) => {
  if (!score) return rgb(neutralOf());
  if (score <= 6) return rgb(mixc(neutralOf(), AMBER, 0.08 + ((score - 1) / 5) * 0.62));
  return rgb(mixc(AMBER, PINK, (score - 6) / 4 * 0.85));
};

// DRIFT mode (12.10): over target = orange, under = blue, full at 5 pts,
// half as strong while the bucket is still within its band
const ORANGE = [255, 159, 10];
const BLUE = [10, 132, 255];
const driftTileColor = (b) => {
  if (!b || typeof b.driftPct !== "number" || !isFinite(b.driftPct)) return rgb(neutralOf());
  const e = Math.pow(Math.min(1, Math.abs(b.driftPct) / 5), 0.75);
  const k = (0.18 + 0.82 * e) * (b.state === "ok" ? 0.5 : 1);
  return rgb(mixc(neutralOf(), b.driftPct >= 0 ? ORANGE : BLUE, k));
};
const driftTip = (b) => (!b ? "no target" : (b.kind === "sector" ? b.key + " sector: " : "") +
  "drift " + fmtPts(b.driftPct) + " pts vs target " + fmtTarget(b.targetPct));

const changeFor = (p, range) => {
  if (p.changes && typeof p.changes[range] === "number") return p.changes[range];
  return typeof p.dayChangePct === "number" ? p.dayChangePct : 0;
};

const SECTOR_HEADER = 14;
const TILE_GAP = 1.25;

const Heatmap = ({ positions, range, w, h, onSelect, d }) => {
  const MAP_W = w || LAYOUT_K.MAP_MIN;
  const MAP_H = h || LAYOUT_K.MAP_MIN;
  const isVol = range === "VOL";
  const isDrift = range === "DRIFT" && targetsOn(d);   // the caller maps a stale DRIFT to 1D without targets
  const byTheme = {};
  for (const p of positions) {
    const th = p.theme || "Other";
    if (!byTheme[th]) byTheme[th] = { name: th, value: 0, positions: [] };
    byTheme[th].value += p.value || 0;
    byTheme[th].positions.push(p);
  }
  const sectorRects = squarify(Object.values(byTheme), 0, 0, MAP_W, MAP_H);
  const tiles = [];
  const labels = [];
  for (const sr of sectorRects) {
    const showHeader = sr.w > 56 && sr.h > 52;
    const headerH = showHeader ? SECTOR_HEADER : 0;
    if (showHeader) {
      labels.push(
        <div key={"lbl-" + sr.name} style={{
          position: "absolute", left: (sr.x + 5) + "px", top: (sr.y + 3) + "px",
          maxWidth: (sr.w - 10) + "px", fontSize: "8px", fontWeight: 700,
          letterSpacing: "0.08em", textTransform: "uppercase",
          color: "rgba(245,245,247,0.5)", whiteSpace: "nowrap",
          overflow: "hidden", textOverflow: "ellipsis", pointerEvents: "none",
        }}>{sr.name}</div>
      );
    }
    const inner = squarify(
      sr.positions.map((p) => Object.assign({}, p, { value: p.value || 0 })),
      sr.x, sr.y + headerH, sr.w, sr.h - headerH);
    for (const r of inner) {
      const chg = changeFor(r, range);
      const minSide = Math.min(r.w, r.h);
      const showTicker = r.w > 30 && r.h > 16;
      const showSub = r.w > 40 && r.h > 30;
      const tickerFs = Math.max(8, Math.min(16, minSide * 0.24));
      const subFs = Math.max(7.5, Math.min(11, minSide * 0.16));
      const bk = isDrift ? bucketFor(d, r.targetKey) : null;
      let tip = r.ticker + "  " + (isDrift ? driftTip(bk) : isVol ? "volatility " + (r.volPct === null ? "—" : r.volPct + "%/yr") : pct(chg) + " (" + range + ")") +
        "\n" + money(r.value) + " · " + r.weightPct + "% of portfolio" +
        (r.volScore ? "\nvolatility score " + r.volScore + "/10 (" + VOL_LABEL[r.volScore] + ")" : "");
      if (r.plPct !== null && r.plPct !== undefined) {
        tip += "\nP&L " + (r.basisDerived ? "≈" : "") + pct(r.plPct);
      }
      if (r.undated === true) tip += "\nundated: no purchase date, counted as held for the whole graph";
      const hi52 = high52Tip(r);
      if (hi52) tip += "\n" + hi52;
      tiles.push(
        <div key={r.ticker} title={tip}
          onClick={onSelect ? () => onSelect(r.ticker) : null}
          style={{
            position: "absolute",
            cursor: onSelect ? "pointer" : "default",
            left: (r.x + TILE_GAP) + "px", top: (r.y + TILE_GAP) + "px",
            width: Math.max(0, r.w - TILE_GAP * 2) + "px",
            height: Math.max(0, r.h - TILE_GAP * 2) + "px",
            background: isDrift ? driftTileColor(bk) : isVol ? volTileColor(r.volScore) : tileColor(chg, range),
            borderRadius: Math.min(6, Math.max(2, minSide * 0.12)) + "px",
            display: "flex", flexDirection: "column", alignItems: "center",
            justifyContent: "center", overflow: "hidden",
            boxShadow: "inset 0 0.5px 0 rgba(var(--pw-fg),0.07)",
          }}>
          {showTicker ? (
            <div style={{ fontSize: tickerFs + "px", fontWeight: 700,
              color: "var(--pw-tile-ink)", lineHeight: 1.1,
              textShadow: "var(--pw-tile-shadow)" }}>{r.ticker}</div>
          ) : null}
          {showSub ? (
            <div style={{ fontSize: subFs + "px", fontWeight: 500,
              color: "var(--pw-tile-sub)", lineHeight: 1.2,
              textShadow: "var(--pw-tile-shadow)" }}>
              {isDrift ? (bk ? fmtPts(bk.driftPct) + " pt" : "—") : isVol ? (r.volScore ? "vol " + r.volScore : "—") : pct(chg)}
            </div>
          ) : null}
        </div>
      );
    }
  }
  return (
    <div style={{ position: "relative", width: MAP_W + "px", height: MAP_H + "px",
      marginTop: "6px", borderRadius: "10px", overflow: "hidden" }}>
      {tiles}
      {labels}
    </div>
  );
};

// drift: the "drift" tab (12.10, only with targets); range: the mode shown
const MapTabs = ({ state, dispatch, extra, drift, range }) => (
  <span>
    {RANGES.concat(drift ? ["VOL", "DRIFT"] : ["VOL"]).map((r) => (
      <span key={r}
        className={r === (range || state.mapRange) ? css`${tabBtn} ${tabActive}` : tabBtn}
        title={r === "VOL" ? "color tiles by volatility score"
          : r === "DRIFT" ? "color tiles by drift from your target allocation: orange = over, blue = under" : "color tiles by the " + r + " move"}
        onClick={() => dispatch({ type: "SET_MAP_RANGE", range: r })}>
        {r === "VOL" ? "vol" : r === "DRIFT" ? "drift" : r}
      </span>
    ))}
    {extra}
  </span>
);

// ------------------------------------------------------------------ buy / sell
const inputCss = css`
  background: rgba(var(--pw-fg), 0.06);
  border: 1px solid rgba(var(--pw-fg), 0.12);
  border-radius: 4px;
  color: ${C.ink};
  font-family: "SF Mono", Menlo, monospace;
  font-size: 9.5px;
  padding: 3px 5px;
  outline: none;
  width: 100%;
  box-sizing: border-box;
`;

// Yahoo symbols: MSFT, BRK-B, SHOP.TO, 0700.HK, M&M.NS, BTC-USD, GC=F, ^GSPC
const dayInputCss = css`
  background: rgba(var(--pw-fg), 0.06);
  border: 1px solid rgba(var(--pw-fg), 0.12);
  border-radius: 4px;
  color: ${C.ink};
  font-family: "SF Mono", Menlo, monospace;
  font-size: 9px;
  padding: 1px 5px;
  margin-left: 6px;
  outline: none;
  width: 76px;
  box-sizing: border-box;
`;

// ---- the backtest (12.6+ data.json): before the first purchase the longer
// tabs show today's holdings priced back ("simulated"), as its own series
// that meets the real one at the first real day (d.backtest.anchor)
const btOf = (d) => {
  const bt = d && d.backtest;
  return bt && typeof bt === "object" && bt.anchor && typeof bt.anchor.t === "number" &&
    typeof bt.anchor.v === "number" && Array.isArray(bt.tabs) ? bt : null;
};
const btTabsOf = (d) => {
  const bt = btOf(d);
  return bt ? BT_RANGES.map((k) => bt.tabs.find((tb) => tb && tb.key === k && typeof tb.start === "number"))
    .filter((tb) => !!tb) : [];
};
const btTab = (d, key) => btTabsOf(d).find((tb) => tb.key === key) || null;
let btModeNow = "held";   // the mode shown (set every render; the date box reads it)
const btModeBy = {};      // …per window (dispatch.w): the date box's answers can come after another window's render
const btModeFor = (dispatch) => btModeBy[(dispatch && dispatch.w) || ""] || "held";
// a tab's simulated points before the anchor: [{t, v, sim, bi}] (bi = benchmark level)
// (memo per series object and mode: every window, the date box and simStart
// share one list per data.json; callers never change it)
const simMemo = typeof WeakMap === "function" ? new WeakMap() : null;
const simPoints = (d, key, mode) => {
  const bt = btOf(d);
  const ser = bt && bt.series && bt.series[key];
  if (!ser || !Array.isArray(ser.t)) return [];
  const mk = String(mode) + "|" + bt.anchor.t;
  const memo = simMemo ? simMemo.get(ser) || {} : null;
  if (memo && memo[mk]) return memo[mk];
  const vals = Array.isArray(ser[mode]) ? ser[mode] : [];
  const idx = Array.isArray(ser.idx) ? ser.idx : [];
  const out = [];
  ser.t.forEach((t, i) => {
    if (typeof t === "number" && t < bt.anchor.t - 1 && typeof vals[i] === "number" && isFinite(vals[i]))
      out.push({ t: t, v: vals[i], sim: true, bi: typeof idx[i] === "number" ? idx[i] : null });
  });
  if (memo) { memo[mk] = out; simMemo.set(ser, memo); }
  return out;
};
// a history range with the index level (bi) of each point, shared by the
// windows showing the same range (memo per points list and index list)
const benchMemo = typeof WeakMap === "function" ? new WeakMap() : null;
const withBench = (pts, idx) => {
  const m = benchMemo ? benchMemo.get(pts) : null;
  if (m && m.idx === idx) return m.out;
  const out = pts.map((p, i) => (typeof idx[i] === "number" ? Object.assign({}, p, { bi: idx[i] }) : p));
  if (benchMemo) benchMemo.set(pts, { idx: idx, out: out });
  return out;
};
// the smallest backtest tab reaching back to t, else the one reaching furthest
const btTabFor = (d, t) => {
  const tabs = btTabsOf(d);
  return tabs.find((tb) => tb.start <= t + 1) ||
    tabs.reduce((a, tb) => (!a || tb.start < a.start ? tb : a), null);
};
// a day before the real day rows: the simulated point at or before it
const simDay = (q, d) => {
  const tabs = btTabsOf(d).filter((tb) => isoOf(tb.start) <= q);
  for (let i = 0; i < tabs.length; i++) {
    const pts = simPoints(d, tabs[i].key, btModeNow);
    if (!pts.length) continue;
    let p = pts[0];
    for (let j = 0; j < pts.length && isoOf(pts[j].t) <= q; j++) p = pts[j];
    const iso = isoOf(p.t);
    return { mark: { t: p.t, v: p.v, d: iso, approx: false, sim: true, bi: p.bi, asked: iso !== q ? q : null },
      range: tabs[i].key };
  }
  return null;
};
// the earliest simulated day on any backtest tab (ISO), or null
const simStart = (d) => btTabsOf(d).reduce((best, tb) => {
  const pts = simPoints(d, tb.key, btModeNow);
  const iso = pts.length ? isoOf(pts[0].t) : null;
  return iso && (!best || iso < best) ? iso : best;
}, null);

// the shortest graph range that still contains time t (before the first
// purchase: the smallest backtest tab reaching back that far)
const pickRange = (t, d) => {
  const h = d.history || {};
  const bt = btOf(d);
  if (bt && t < bt.anchor.t - 1) {
    const tb = btTabFor(d, t);
    if (tb) return tb.key;
  }
  const has = (r) => h[r] && h[r].length && t >= h[r][0].t - 1;
  for (const r of ["1D", "1W", "1M", "1Y"]) if (has(r)) return r;
  return h.ALL && h.ALL.length ? "ALL" : "1Y";
};
const dayMark = (row, asked) => ({ t: row[1], v: row[2], d: row[0], approx: !!row[3], asked: asked || null,
  bi: typeof row[4] === "number" ? row[4] : null,      // row[4]: the benchmark that day (12.6+)
  b: typeof row[5] === "number" ? row[5] : null });    // row[5]: money at work, when not basisSteps' (12.7+)

// ---- the day-by-day table: data.json carries the newest ~400 rows
// (d.daily); older ones come from `widget_command.sh days BEFORE COUNT` and
// sit in state.older until the table changes (dailyKey).
const isDayRow = (r) => Array.isArray(r) && typeof r[0] === "string" && typeof r[1] === "number" && typeof r[2] === "number";
// the tracker can serve older rows (12.5+ data carries dailyTotal/dailyFirst)
const canLoadOlder = (d) => typeof d.dailyTotal === "number" && typeof d.dailyFirst === "string";
// every day row on hand, oldest first: loaded older rows + d.daily
const dayRowsOf = (d, state) => {
  const daily = Array.isArray(d.daily) ? d.daily : [];
  const older = state.older;
  if (!daily.length || !older.rows.length || older.key !== dailyKey(d)) return daily;
  const first = daily[0][0];
  const before = older.rows.filter((r) => r[0] < first);
  return before.length ? before.concat(daily) : daily;
};
// rows older than the ones on hand exist in the full table
const olderAvailable = (d, rows) => !!(canLoadOlder(d) && rows.length && rows[0][0] > d.dailyFirst);
const daysBetween = (isoA, isoB) =>
  Math.round((new Date(isoB + "T12:00:00") - new Date(isoA + "T12:00:00")) / 86400000);
// rows to ask for so the table reaches back to `iso` (at most one row per
// calendar day; the tracker answers at most 5000 per call — see withDayLoaded)
const countBack = (iso, rows) =>
  Math.max(OLDER_CHUNK, Math.min(5000, daysBetween(iso, rows.length ? rows[0][0] : iso) + 7));

const olderInflight = {};  // requests running now: tag -> callbacks waiting for that answer
let olderTimer = 0;        // a load queued from render (it can't dispatch while rendering)
const olderBusy = () => Object.keys(olderInflight).length > 0;
// fetch `count` rows older than the oldest on hand; then(rowsNow, error) runs after
// state has them (rowsNow = everything on hand, oldest first) or on failure. The
// same request asked for again while it runs just waits for that answer.
const loadOlder = (d, rows, count, dispatch, then) => {
  const key = dailyKey(d);
  const before = rows.length ? rows[0][0] : null;
  if (!before) return then ? then(null, "day-by-day values arrive with the next refresh") : null;
  const tag = key + "<" + before + "#" + count;
  if (olderInflight[tag]) return then ? olderInflight[tag].push(then) : null;
  const waiters = olderInflight[tag] = then ? [then] : [];
  dispatch({ type: "OLDER_BUSY", key: key });
  const done = (all, err) => {
    delete olderInflight[tag];
    waiters.forEach((fn) => fn(all, err));
  };
  const fail = (msg) => {
    dispatch({ type: "OLDER_RESULT", key: key, rows: [], error: msg });
    done(null, msg);
  };
  run(helper(["days", before, String(count)]))
    .then((out) => {
      const res = parseJson(out);
      if (!res || !Array.isArray(res.rows) || res.error)
        return fail((res && typeof res.error === "string" && res.error) || "couldn't load older days");
      const got = res.rows.filter((r) => isDayRow(r) && r[0] < before);
      // nothing older after all: stop here (a render-time retry would just loop)
      if (!got.length) return fail("no older days found");
      got.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
      dispatch({ type: "OLDER_RESULT", key: key, rows: got });
      return done(got.concat(rows), null);
    })
    .catch((e) => fail("couldn't load older days: " + String(e).slice(0, 60)));
  return null;
};
// render-time: make sure the rows reach back to time t (a custom start further
// back than the table on hand). True while more rows are on the way.
const ensureDaysBack = (d, state, rows, t, dispatch) => {
  if (!rows.length || t >= rows[0][1] - 1 || !olderAvailable(d, rows)) return false;
  if (state.older.msg && state.older.key === dailyKey(d)) return false;   // failed: don't retry until the table changes
  if (state.older.busy || olderBusy() || olderTimer) return true;
  const target = isoOf(t);
  olderTimer = setTimeout(() => {
    olderTimer = 0;
    loadOlder(d, rows, countBack(target, rows), dispatch);
  }, 0);
  return true;
};
// thin a long run of day rows to about `max` points, keeping the first and
// last row and both ends of every ≈ (rebuilt) stretch
const thinRows = (rows, max) => {
  if (rows.length <= max) return rows;
  const out = [];
  let lastBucket = -1;
  for (let i = 0; i < rows.length; i++) {
    const bucket = Math.floor((i * max) / rows.length);
    const edge = i === rows.length - 1 ||
      (i > 0 && !rows[i][3] !== !rows[i - 1][3]) || (i + 1 < rows.length && !rows[i][3] !== !rows[i + 1][3]);
    if (bucket !== lastBucket || edge) out.push(rows[i]);
    lastBucket = bucket;
  }
  return out;
};

// "2026-03-14" or "03-14" -> that day's row (or the last day before it).
// rows = the day rows on hand (default d.daily). A day older than those but
// inside the full table returns {need: date}: load older rows, then retry.
const resolveDay = (text, d, rowsIn) => {
  const daily = rowsIn || d.daily || [];
  let q = text.trim();
  const last = daily.length ? daily[daily.length - 1][0] : null;
  if (/^\d{1,2}-\d{1,2}$/.test(q) && last) {        // month-day: the most recent one
    const parts = q.split("-").map((n) => (n.length < 2 ? "0" + n : n));
    q = last.slice(0, 4) + "-" + parts[0] + "-" + parts[1];
    if (q > last) q = (Number(last.slice(0, 4)) - 1) + q.slice(4);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(q)) return null;                 // still typing
  if (isNaN(new Date(q + "T12:00:00").getTime())) return { msg: "that isn't a date" };
  if (!daily.length) return { msg: "day-by-day values arrive with the next refresh" };
  if (q > last) return { msg: "that day hasn't happened yet" };
  if (q < daily[0][0]) {
    if (olderAvailable(d, daily) && q >= d.dailyFirst) return { need: q };
    const first = canLoadOlder(d) && d.dailyFirst < daily[0][0] ? d.dailyFirst : daily[0][0];
    const sim = q < first ? simDay(q, d) : null;   // before the first purchase: the backtest
    if (sim) return sim;
    const simFirst = q < first ? simStart(d) : null;   // older than every backtest tab
    if (simFirst) return { msg: "simulated values start " + fmtIsoLong(simFirst) + " (you bought " + fmtIsoLong(first) + ")" };
    return { msg: "day-by-day values start " + fmtIsoLong(first) +
      (d.historyPending > 0 ? " — older prices are still downloading" : "") };
  }
  let row = daily[0];
  for (let i = 0; i < daily.length && daily[i][0] <= q; i++) row = daily[i];
  return { mark: dayMark(row, row[0] !== q ? q : null), range: pickRange(row[1], d) };
};
// the date box: load older rows until `text` resolves (a few calls at most
// for a very old date), then done(result) with the resolved day or a message
const withDayLoaded = (text, d, rows, dispatch, done, depth) => {
  btModeNow = btModeFor(dispatch);   // this window's simulated mode
  const r = resolveDay(text, d, rows);
  if (!r || !r.need || (depth || 0) >= 6) return done(r && r.need ? { msg: "couldn't load that day" } : r);
  dispatch({ type: "DAY_MSG", msg: "loading older days…" });
  return loadOlder(d, rows, countBack(r.need, rows), dispatch, (all, err) =>
    (all && text === dayTextBy[dispatch.w || ""] ? withDayLoaded(text, d, all, dispatch, done, (depth || 0) + 1)
      : done({ msg: all ? null : err })));   // (text changed: its answer is dropped)
};
// the date box's latest text per window (an older-rows answer for older text is dropped)
const dayTextBy = {};
const onDayInput = (value, d, state, dispatch) => {
  dayTextBy[dispatch.w || ""] = value;
  dispatch({ type: "SET_DAY_INPUT", value: value });
  if (!value.trim()) {
    if (state.mark && state.mark.d) return dispatch({ type: "SET_MARK", mark: null });
    return dispatch({ type: "DAY_MSG", msg: null });
  }
  withDayLoaded(value, d, dayRowsOf(d, state), dispatch, (r) => {
    if (dayTextBy[dispatch.w || ""] !== value) return;
    if (r && r.mark) dispatch({ type: "PICK_DAY", mark: r.mark, range: r.range, fromInput: true });
    else if (r && r.msg) dispatch({ type: "DAY_MSG", msg: r.msg });
    else dispatch({ type: "DAY_MSG", msg: null });   // still typing: no message for older text
  });
};

// key tests that also accept the legacy key codes (some WebKit builds and
// automation tools send key events without the `key` name)
const isEnter = (ev) => ev.key === "Enter" || ev.keyCode === 13 || ev.which === 13 || ev.charCode === 13;
const isEscape = (ev) => ev.key === "Escape" || ev.keyCode === 27 || ev.which === 27;

// Enter in the date box: start the graph on that day
const onDayKey = (ev, d, state, dispatch) => {
  if (!isEnter(ev)) return;
  const text = ev.target.value;               // the box itself: state can lag a keystroke
  dayTextBy[dispatch.w || ""] = text;
  // (a day older than the rows on hand loads them first)
  withDayLoaded(text, d, dayRowsOf(d, state), dispatch, (r) => {
    if (dayTextBy[dispatch.w || ""] !== text) return;          // typed on meanwhile
    if (r && r.mark) dispatch({ type: "SET_FROM", from: r.mark });
    else if (r && r.msg) dispatch({ type: "DAY_MSG", msg: r.msg });
    else if (text.trim()) dispatch({ type: "DAY_MSG", msg: "type a full date, like 2026-03-14 or 03-14" });
    else if (state.mark) dispatch({ type: "SET_FROM", from: state.mark });   // empty box: the pinned point
  });
};

const TICKER_RE = /^\^?[A-Z0-9][A-Z0-9.\-=&]{0,19}$/;
const MONEY_SIGN = /[$€£¥₹]/;
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// the display currency's own marks ("kr", "CHF", "zł", "SEK"…): letters or
// signs that say "this is money", besides the common signs above
const curMarks = () => [curSymbol(), CUR].filter((m) => m && /[^\d.,\s]/.test(m));
const isMoneyText = (text) => {
  const s = String(text || "");
  if (MONEY_SIGN.test(s)) return true;
  const low = s.toLowerCase();
  return curMarks().some((m) => low.indexOf(m.toLowerCase()) >= 0);
};

// A share count: digits with an optional decimal point or comma. Rejects
// "Infinity", "1e999", "5abc" and friends that parseFloat would accept.
const parseAmount = (text) => {
  const s = String(text || "").trim();
  if (!/^\d+([.,]\d+)?$/.test(s)) return null;
  const v = Number(s.replace(",", "."));
  return isFinite(v) && v > 0 ? v : null;
};
// A money amount ("$1000", "1,000$", "€1.000,50"), in the display currency.
const parseMoney = (text) => {
  let s = String(text || "");
  curMarks().forEach((m) => { s = s.replace(new RegExp(escRe(m), "gi"), ""); });
  s = s.replace(/[$€£¥₹\s]/g, "");
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, "");
  else if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
  else if (/^\d+([.,]\d+)?$/.test(s)) s = s.replace(",", ".");
  else return null;
  const v = Number(s);
  return isFinite(v) && v > 0 ? v : null;
};
const fmtShares = (v) => String(Math.round(v * 10000) / 10000);
const localToday = () => {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" +
    String(d.getDate()).padStart(2, "0");
};
const say = (dispatch, msg) => dispatch({ type: "ADD_MSG", msg: msg });
const parseJson = (out) => {
  try { return JSON.parse(out); } catch (e) { return null; }
};

// ---- search as you type (debounced; one Yahoo lookup per pause)
let searchTimer = null;
const runSearch = (q, dispatch) => {
  dispatch({ type: "SEARCH_BUSY", query: q });
  run(helper(["search", q]))
    .then((out) => {
      const res = parseJson(out) || { error: "search failed" };
      dispatch({ type: "SEARCH_RESULTS", query: q, results: res.results || [], error: res.error || null });
    })
    .catch(() => dispatch({ type: "SEARCH_RESULTS", query: q, results: [], error: "search failed" }));
};
const onTickerInput = (value, dispatch) => {
  dispatch({ type: "SET_ADD_FIELD", field: "ticker", value: value });
  clearTimeout(searchTimer);
  const q = value.trim();
  if (q.length < 2) return dispatch({ type: "SEARCH_RESULTS", query: q, results: [] });
  searchTimer = setTimeout(() => runSearch(q, dispatch), 450);
};
const onTickerKey = (ev, state, dispatch) => {
  if (isEnter(ev)) {
    clearTimeout(searchTimer);
    const q = (state.addForm.ticker || "").trim();
    if (state.search.results.length) dispatch({ type: "PICK", item: state.search.results[0] });
    else if (q) runSearch(q, dispatch);
  } else if (isEscape(ev)) {
    dispatch({ type: "SEARCH_RESULTS", query: (state.addForm.ticker || "").trim(), results: [] });
  }
};

// ---- buy: look the stock up first, so the confirm line shows its real
// name and price and a typo never lands in positions.json
const submitAdd = (state, dispatch) => {
  const form = state.addForm;
  const tk = (form.ticker || "").toUpperCase().trim();
  if (!TICKER_RE.test(tk)) return say(dispatch, "type a ticker or a company name, then pick a match");
  const amt = (form.shares || "").trim();
  const cash = isMoneyText(amt) ? parseMoney(amt) : null;
  const sh = cash === null ? parseAmount(amt) : null;
  if (cash === null && sh === null) return say(dispatch, "how much? shares (10, 2.5) or money (" + money(1000) + ")");
  let cost = null;
  if ((form.cost || "").trim()) {
    cost = parseAmount(form.cost);
    if (cost === null) return say(dispatch, "price: a positive number, like 182.40");
  }
  const date = (form.date || "").trim();
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return say(dispatch, "date: YYYY-MM-DD");

  say(dispatch, "checking " + tk + "…");
  run(helper(["quote", tk]))
    .then((out) => {
      const q = parseJson(out) || { error: "couldn't check " + tk };
      if (q.error) return say(dispatch, q.error);
      const isToday = !date || date === localToday();
      const paid = cost || (isToday ? q.price : null); // today, no price → current price
      let shares = sh;
      if (cash !== null) {
        if (!q.displayRate) return say(dispatch, "no exchange rate for " + q.currency + " — enter shares instead");
        shares = Math.round(cash / ((paid || q.price) * q.displayRate) * 1e6) / 1e6;
        if (!(shares > 0)) return say(dispatch, "that amount is too small");
      }
      const args = ["buy", tk, String(shares)];
      if (paid) args.push("--cost", String(paid));
      if (date) args.push("--date", date);
      if (q.displayRate) args.push("--rate", String(q.displayRate)); // for _invested
      const worth = q.displayRate ? shares * (paid || q.price) * q.displayRate : null;
      dispatch({ type: "SET_PENDING", pending: { cmd: helper(args), reset: true,
        label: "buy " + fmtShares(shares) + " × " + tk + (q.name ? " (" + q.name + ")" : "") +
          (paid ? " @ " + num(paid, 2) + " " + q.currency : " at that day's close") +
          (worth && paid ? " ≈ " + money(worth) : "") + (date ? " on " + date : "") + "?" } });
    })
    .catch((e) => say(dispatch, "couldn't check " + tk + ": " + String(e).slice(0, 60)));
};

const submitSell = (state, positions, dispatch) => {
  const form = state.addForm;
  const tk = (form.ticker || "").toUpperCase().trim();
  const pos = positions.find((p) => p.ticker === tk);
  if (!pos) return say(dispatch, TICKER_RE.test(tk) ? "you don't hold " + tk : "which stock? type its ticker");
  const amt = (form.shares || "").trim().toLowerCase();
  let price = null;
  if ((form.cost || "").trim()) {
    price = parseAmount(form.cost);
    if (price === null) return say(dispatch, "price: a positive number");
  }
  let args, what;
  if (amt === "all") {
    args = ["sell", tk, "--all"];
    what = "ALL " + fmtShares(pos.shares) + " × " + tk;
  } else {
    let sh = parseAmount(amt);
    if (isMoneyText(amt)) {
      const cash = parseMoney(amt);
      const perShare = (price || pos.price) * (pos.fxRate || 1);
      sh = cash && perShare ? Math.round(cash / perShare * 1e6) / 1e6 : null;
    }
    if (!sh) return say(dispatch, "how much? shares, money (" + money(500) + "), or 'all'");
    if (sh > pos.shares + 1e-9) return say(dispatch, "you hold " + fmtShares(pos.shares) + " " + tk);
    args = ["sell", tk, String(sh)];
    what = fmtShares(sh) + " × " + tk;
  }
  if (price) args.push("--price", String(price));
  dispatch({ type: "SET_PENDING", pending: { cmd: helper(args), reset: true,
    label: "sell " + what + (price ? " @ " + num(price, 2) + " " + pos.currency : " at the last price") + "?" } });
};

// Open the detail view for any ticker; the full chart data arrives from
// "look" a second later (kept per ticker while the detail stays open).
const openStock = (ticker, dispatch, state) => {
  dispatch({ type: "SET_STOCK", ticker: ticker });
  const nw = state ? newsOf(state, ticker) : null;
  if (ticker && state && newsOn(state) && (enabled(state._win || null, "detail.news") || enabled(state._win || null, "panel.news")) &&
      !(state.focusTicker === ticker && nw && (nw.busy || (nw.items || []).length))) {
    loadNews(ticker, dispatch);
  }
  if (!ticker || (state && state.lookTicker === ticker && lookOf(state, ticker).data)) return;
  dispatch({ type: "LOOK_BUSY", ticker: ticker });
  run(helper(["look", ticker]))
    .then((out) => {
      const r = parseJson(out) || { error: "lookup failed" };
      dispatch({ type: "LOOK_RESULT", ticker: ticker, data: r.error ? null : r, error: r.error || null });
    })
    .catch((e) => dispatch({ type: "LOOK_RESULT", ticker: ticker, data: null, error: "lookup failed: " + String(e).slice(0, 60) }));
};
const watchToggle = (ticker, on, dispatch, msgType) => {
  const type = msgType || "DETAIL_MSG";
  dispatch({ type: type, msg: "working…" });
  run(helper([on ? "watch" : "unwatch", ticker]))
    .then((out) => dispatch({ type: type, msg: String(out).trim().slice(0, 100) || "done" }))
    .catch((e) => dispatch({ type: type, msg: "error: " + String(e).slice(0, 80) }));
};

// headlines for the open stock (only ever called with headlines on)
const loadNews = (ticker, dispatch) => {
  dispatch({ type: "NEWS_BUSY", ticker: ticker });
  run(helper(["news", ticker]))
    .then((out) => {
      const r = parseJson(out) || { error: "headlines unavailable" };
      dispatch({ type: "NEWS_RESULT", ticker: ticker, items: r.on === false ? [] : r.items,
        error: r.on === false ? "headlines are off" : r.error || null });
    })
    .catch(() => dispatch({ type: "NEWS_RESULT", ticker: ticker, items: [], error: "headlines unavailable" }));
};

// ---- price alerts (alerts.py via widget_command.sh alert …, 12.9)
// "-20%" = % from your average cost (holdings only); a plain price = above or
// below, whichever side of today's price it is on
const PCT_ALERT = /^[-+]?\d+([.,]\d+)?\s*%$/;
const PRICE_ALERT = /^\+?\d+([.,]\d+)?$/;
const alertFromText = (text, p, held) => {
  const t = String(text || "").trim();
  if (!t) return { error: "type a price (400) or a % from your cost (-20%)" };
  if (PCT_ALERT.test(t)) {
    if (!held) return { error: "% from cost needs a holding" };
    if (p.costUnknown === true) return { error: "% from cost needs its purchase price or date" };
    return { kind: "pctFromCost", value: t.replace(/\s*%$/, "").replace(",", ".") };
  }
  if (!PRICE_ALERT.test(t)) return { error: "type a price (400) or a % from your cost (-20%)" };
  const v = parseFloat(t.replace(",", "."));
  if (!(v > 0)) return { error: "the price must be above 0" };
  if (!isFin(p.price)) return { error: "no price yet — try again after the next refresh" };
  if (v === p.price) return { error: "that's the price now" };
  return { kind: v > p.price ? "above" : "below", value: String(v) };
};
const alertCall = (args, dispatch, clear) => {
  dispatch({ type: "ALERT_BUSY" });
  run(helper(["alert"].concat(args)))
    .then((out) => {
      const r = parseJson(out) || { error: String(out || "").trim().slice(0, 100) || "could not save the alert" };
      dispatch({ type: "ALERT_RESULT", ok: !r.error, clear: clear,
        msg: String(r.error ? "error: " + r.error : r.message || "done").slice(0, 140) });
    })
    .catch((e) => dispatch({ type: "ALERT_RESULT", ok: false, msg: "error: " + String(e).slice(0, 80) }));
};
const submitAlert = (state, p, held, dispatch) => {
  if (state.alertBusy) return;
  const a = alertFromText(state.alertInput, p, held);
  if (a.error) { dispatch({ type: "ALERT_RESULT", ok: false, msg: a.error }); return; }
  alertCall(["add", p.ticker, a.kind, a.value], dispatch, true);
};
const removeAlert = (id, dispatch) => alertCall(["remove", id], dispatch, false);

// a display choice: the screen follows at once (state), then it is saved in
// _settings; a failed save only means it isn't remembered after a restart
const savePref = (key, on, dispatch) => {
  dispatch(key === "graphBig" ? { type: "TOGGLE_GRAPH_BIG", on: on }
    : key === "news" ? { type: "SET_NEWS_PREF", on: on } : { type: "SET_SHOW_BENCH", on: on });
  return runQueued(["setting", key, on ? "true" : "false"]).catch(() => {});
};
// one line or everything (a title click, 12.11), saved the same way
const toggleCompact = (on, dispatch) => {
  dispatch({ type: "SET_COMPACT", on: on });
  return runQueued(["setting", "compact", on ? "true" : "false"]).catch(() => {});
};
// a title click; the second click of a double-click doesn't toggle back, and
// the click that ends a drag of the title row never gets here (swallowClick)
// (a window of _settings.display keeps its own one-line choice)
const titleClick = (state, dispatch) => (ev) => {
  if (ev && ev.detail > 1) return;
  if (state._disp && state._win) {
    dispatch({ type: "HOVER_PT", t: null });
    return changeWin(state, state._win.id, { compact: compactOf(state) ? undefined : true }, dispatch);
  }
  toggleCompact(!compactOf(state), dispatch);
};

// ---- CSV export (12.11): export.py writes the files, Finder shows them.
// Only an absolute path without line breaks / NUL reaches `open -R`, quoted.
const EXPORT_TICKS = 6;   // the message stays this many data ticks
const revealable = (p) => typeof p === "string" && p.charAt(0) === "/" && p.length < 4096 && !/[\n\r\0]/.test(p);
const exportCsv = (state, dispatch) => {
  const m = state.exportMsg;
  if (m && m.text === "exporting…" && state.tick - m.tick <= EXPORT_TICKS) return;   // one at a time
  dispatch({ type: "EXPORT_MSG", text: "exporting…" });
  const fail = (why) => dispatch({ type: "EXPORT_MSG", text: "export failed", err: true,
    tip: String(why || "the export helper gave no answer").slice(0, 300) });
  return run(helper(["export"])).then((out) => {
    let r = null;
    try { r = JSON.parse(String(out || "").trim()); } catch (e) { r = null; }
    if (!r || typeof r !== "object") return fail(String(out || "").trim());
    if (r.ok !== true) return fail(typeof r.error === "string" ? r.error : "");
    const shown = typeof r.dirShown === "string" && r.dirShown ? r.dirShown : "~/Documents/Portfolio";
    const rows = r.rows && typeof r.rows === "object" ? r.rows : {};
    const tip = (Array.isArray(r.files) ? r.files.filter((f) => typeof f === "string").join(", ") : "") +
      ["holdings", "daily", "sales"].filter((k) => isFin(rows[k])).map((k, i) => (i ? " · " : "\n") + k + " " + rows[k] + " rows").join("");
    dispatch({ type: "EXPORT_MSG", text: "exported to " + shown, tip: tip });
    if (revealable(r.path)) run("open -R " + shq(r.path)).catch(() => {});
  }).catch((e) => fail(e && e.message ? e.message : e));
};

// ---- the index to compare with (_settings.benchmark, 12.10): "index: SPY ▾"
// under the value graph opens this list. Picking saves the choice
// (set_setting.py, which also asks for a refresh: the new index needs its
// prices); the caption says "loading SPY…" until data with it arrives.
// Every symbol here was checked on Yahoo for long daily history (2026-09-23).
const BENCH_DEFAULTS = { USD: "SPY", CAD: "XIU.TO", EUR: "EXW1.DE", GBP: "ISF.L",
  AUD: "STW.AX", JPY: "1306.T", CHF: "CSSMI.SW", HKD: "2800.HK" };   // the tracker's DEFAULT_BENCHMARKS
const benchDefault = (cur) => BENCH_DEFAULTS[cur] || "ACWI";
const BENCH_GROUPS = [
  { name: "US", cur: ["USD"], items: [["SPY", "S&P 500"], ["QQQ", "Nasdaq-100"], ["VTI", "Total US market"],
    ["DIA", "Dow Jones 30"], ["IWM", "Russell 2000 small caps"]] },
  { name: "World", cur: [], items: [["VT", "Total world"], ["ACWI", "MSCI All Country World"],
    ["EFA", "Developed ex-US"], ["EEM", "Emerging markets"]] },
  { name: "Canada", cur: ["CAD"], items: [["XIU.TO", "S&P/TSX 60"], ["XIC.TO", "S&P/TSX Composite"],
    ["VFV.TO", "S&P 500 in CAD"], ["XEQT.TO", "All-equity world, CAD"]] },
  { name: "Europe", cur: ["EUR", "GBP", "CHF"], items: [["EXW1.DE", "EURO STOXX 50"], ["IWDA.AS", "MSCI World, EUR"],
    ["ISF.L", "FTSE 100"]] },
];
// the home currency's group first, the rest in their usual order
const benchGroupsFor = (cur) => {
  let home = BENCH_GROUPS.filter((g) => g.cur.indexOf(cur) >= 0);
  if (!home.length) home = BENCH_GROUPS.filter((g) => g.name === "World");   // the default there is ACWI
  return home.concat(BENCH_GROUPS.filter((g) => home.indexOf(g) < 0));
};
// "auto" | "none" | SYMBOL, or null (not a choice: older data has no ui.benchmark)
const normBench = (v) => {
  if (typeof v !== "string") return null;
  const s = v.trim().toUpperCase();
  if (s === "AUTO") return "auto";
  if (s === "NONE" || s === "OFF") return "none";
  return TICKER_RE.test(s) ? s : null;
};
// this session's pick, else the saved one (null with older data: no picker link)
const benchWantOf = (st, d) => (typeof st.benchWant === "string" ? st.benchWant
  : normBench(d && d.ui && typeof d.ui === "object" ? d.ui.benchmark : null));
// the pick only bridges the wait for data: it goes (back to data.json's
// choice) once new data carries it AND its index, or once — after the save
// — data.json says something else (changed by hand or in another session)
const benchWantAfter = (st, d) => {
  const want = st.benchWant;
  if (typeof want !== "string" || !d || typeof d !== "object") return want;
  const ui = normBench(d.ui && typeof d.ui === "object" ? d.ui.benchmark : null);
  if (ui === null) return want;                     // older data: no choice in it
  if (ui !== want) return st.benchSaved === true ? null : want;
  if (want === "none") return null;
  const b = d.benchmark && typeof d.benchmark === "object" ? d.benchmark : null;
  const sym = want === "auto" ? benchDefault(d.currency) : want;
  return b && b.symbol === sym && (want !== "auto" || b.source === "default") ? null : want;
};

// a click anywhere but the picker (or its own link) closes it, as does Esc;
// the window listeners live exactly as long as the picker is on screen
// (one set per window, 12.12: dispatch.w; a click in another window's picker closes this one)
const benchAway = {};
const benchKey = (dispatch) => (dispatch && typeof dispatch.w === "string" ? dispatch.w : "");
const benchDisarm = (dispatch) => {
  const k = benchKey(dispatch), a = benchAway[k];
  if (!a || typeof window === "undefined") return;
  window.removeEventListener("mousedown", a.down, true);
  window.removeEventListener("keydown", a.key, true);
  delete benchAway[k];
};
const benchArm = (el, dispatch) => {
  benchDisarm(dispatch);
  if (!el || typeof window === "undefined") return;
  const k = benchKey(dispatch);
  const close = () => { benchDisarm(dispatch); dispatch({ type: "BENCH_PICK", open: false }); };
  benchAway[k] = {
    down: (ev) => {
      const t = ev.target;
      const pk = t && t.closest ? t.closest("[data-pw-benchpick]") : null;
      const wr = pk && pk.closest ? pk.closest("[data-pw-win]") : null;
      if (pk && (!k || !wr || wr.getAttribute("data-pw-win") === k)) return;
      close();
    },
    key: (ev) => { if (isEscape(ev)) close(); },
  };
  window.addEventListener("mousedown", benchAway[k].down, true);
  window.addEventListener("keydown", benchAway[k].key, true);
};

// the picker went off screen without a click (other view, new data): closed,
// so it doesn't come back by itself; after this render, once
const benchCloseTimer = {};   // per window (dispatch.w)
const benchCloseLater = (dispatch) => {
  const k = benchKey(dispatch);
  if (benchCloseTimer[k] || typeof setTimeout === "undefined") return;
  benchCloseTimer[k] = setTimeout(() => {
    delete benchCloseTimer[k];
    dispatch({ type: "BENCH_PICK", open: false });
  }, 0);
};

const pickBench = (value, hidden, dispatch) => {
  const v = normBench(value);
  if (!v) return dispatch({ type: "BENCH_MSG", msg: "not a Yahoo symbol — like VOO, XEQT.TO or ^GSPC" });
  benchDisarm(dispatch);
  dispatch({ type: "SET_BENCH", value: v });
  // picking one shows it: on screen at once, but saved only AFTER the index
  // is — two set_setting.py runs at the same moment each load and rewrite
  // positions.json / data.json, and one would undo the other's change
  const show = hidden && v !== "none";
  if (show) dispatch({ type: "SET_SHOW_BENCH", on: true });
  const saveShow = () => (show ? runQueued(["setting", "showBenchmark", "true"]).catch(() => {}) : null);
  return runQueued(["setting", "benchmark", v])
    .then((out) => {
      const r = parseJson(String(out).trim());
      if (!r || r.error) dispatch({ type: "BENCH_FAIL", msg: (r && r.error) || "could not save the index" });
      else dispatch({ type: "BENCH_SAVED", value: v });
    }, () => dispatch({ type: "BENCH_FAIL", msg: "could not save the index" }))
    .then(saveShow);
};
const submitBenchInput = (text, hidden, dispatch) => {
  const s = String(text || "").trim().toUpperCase();
  if (!s) return dispatch({ type: "BENCH_MSG", msg: "type a Yahoo symbol, like VOO or XEQT.TO" });
  if (s === "AUTO" || s === "NONE" || s === "OFF" || !TICKER_RE.test(s)) {
    return dispatch({ type: "BENCH_MSG", msg: "not a Yahoo symbol — like VOO, XEQT.TO or ^GSPC" });
  }
  return pickBench(s, hidden, dispatch);
};

const benchPickCss = css`
  margin: 3px auto 0;
  padding: 5px 7px 6px;
  border: 1px solid rgba(var(--pw-fg), 0.12);
  border-radius: 6px;
  background: rgba(var(--pw-fg), 0.03);
  max-height: 176px;
  overflow-y: auto;
  box-sizing: border-box;
  width: 100%;
  max-width: 560px;
  &::-webkit-scrollbar { width: 6px; }
  &::-webkit-scrollbar-thumb { background: rgba(var(--pw-fg), 0.13); border-radius: 3px; }
`;
const benchRowCss = css`
  display: flex;
  align-items: baseline;
  gap: 6px;
  padding: 1px 4px;
  border-radius: 3px;
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  font-size: 8.5px;
  &:hover { background: rgba(var(--pw-fg), 0.07); }
`;
const BenchRow = ({ sym, label, on, onPick }) => (
  <div className={css`${mono} ${benchRowCss}`} onClick={onPick} title={on ? "the index you compare with now" : "compare with " + sym}>
    <span style={{ width: 8, flex: "none", color: C.ink }}>{on ? "✓" : ""}</span>
    <span style={{ minWidth: 50, flex: "none", color: on ? C.ink : C.line }}>{sym}</span>
    <span style={{ color: C.dim, overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
  </div>
);
// want: the current choice ("auto" | "none" | SYMBOL); cur: the home currency
const BenchPicker = ({ want, cur, hidden, state, dispatch }) => {
  const pick = (v) => () => pickBench(v, hidden, dispatch);
  const def = benchDefault(cur);
  const listed = {};
  BENCH_GROUPS.forEach((g) => g.items.forEach((it) => { listed[it[0]] = true; }));
  const other = want && want !== "auto" && want !== "none" && !listed[want] ? want : null;
  return (
    <div className={benchPickCss} data-pw-benchpick="1" ref={(el) => benchArm(el, dispatch)}>
      <div className={css`${mono} display: flex; justify-content: space-between; font-size: 8.5px; color: ${C.dim}; margin-bottom: 3px;`}>
        <span>compare your line with</span>
        <span className={linkBtn} style={{ fontSize: 8.5 }} title="close (Esc)"
          onClick={() => { benchDisarm(dispatch); dispatch({ type: "BENCH_PICK", open: false }); }}>close</span>
      </div>
      <div className={css`display: grid; grid-template-columns: 1fr 1fr; column-gap: 10px;`}>
        <BenchRow sym="auto" label={"the default for " + cur + ": " + def} on={want === "auto"} onPick={pick("auto")} />
        <BenchRow sym="none" label="no comparison (no index requests)" on={want === "none"} onPick={pick("none")} />
      </div>
      <div className={css`display: grid; grid-template-columns: 1fr 1fr; column-gap: 10px; row-gap: 3px; margin-top: 3px;`}>
        {benchGroupsFor(cur).map((g) => (
          <div key={g.name}>
            <div className={eyebrow} style={{ fontSize: 7.5, padding: "1px 4px" }}>{g.name}</div>
            {g.items.map((it) => (
              <BenchRow key={it[0]} sym={it[0]} label={it[1]} on={want === it[0]} onPick={pick(it[0])} />
            ))}
          </div>
        ))}
      </div>
      {other ? (
        <div className={css`display: grid; grid-template-columns: 1fr 1fr; column-gap: 10px;`}>
          <BenchRow sym={other} label="your own symbol" on={true} onPick={pick(other)} />
        </div>
      ) : null}
      <div className={css`display: flex; gap: 6px; align-items: center; margin-top: 4px;`}>
        <input className={inputCss} style={{ fontSize: 8.5, padding: "2px 5px", flex: "1 1 auto", minWidth: 0 }}
          placeholder="other Yahoo symbol (VOO, XEQT.TO, ^GSPC) + Enter" value={state.benchInput || ""}
          title="any symbol Yahoo Finance knows: an ETF, an index (^GSPC) or a stock"
          onChange={(ev) => dispatch({ type: "BENCH_INPUT", value: ev.target.value })}
          onKeyDown={(ev) => {
            if (isEnter(ev)) submitBenchInput(ev.target.value, hidden, dispatch);
            else if (isEscape(ev)) { benchDisarm(dispatch); dispatch({ type: "BENCH_PICK", open: false }); }
          }} />
        <span className={linkBtn} style={{ fontSize: 8.5, flex: "none" }}
          onClick={() => submitBenchInput(state.benchInput, hidden, dispatch)}>use</span>
      </div>
      {state.benchMsg ? (
        <div className={css`${mono} font-size: 8px; color: ${C.down}; margin-top: 2px;`}>{state.benchMsg}</div>
      ) : null}
    </div>
  );
};

const executePending = (pending, dispatch) => {
  dispatch({ type: "CLEAR_PENDING" });
  say(dispatch, "working…");
  run(pending.cmd)
    .then((out) => {
      const msg = String(out).trim();
      say(dispatch, msg.slice(0, 140) || "done");
      if (pending.reset && !/^error/i.test(msg)) dispatch({ type: "FORM_RESET" });
    })
    .catch((e) => say(dispatch, "error: " + String(e).slice(0, 90)));
};

const suggestRow = css`
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  padding: 3px 6px;
  cursor: pointer;
  font-size: 9.5px;
  &:hover { background: rgba(var(--pw-fg), 0.07); }
`;

const Suggestions = ({ state, dispatch }) => {
  const s = state.search;
  if (s.results.length) {
    return (
      <div className={css`margin-top:4px; border:1px solid ${C.faint}; border-radius:6px; overflow:hidden;`}>
        {s.results.map((r) => (
          <div key={r.symbol} className={suggestRow} title={"use " + r.symbol}
            onClick={() => dispatch({ type: "PICK", item: r })}>
            <span className={mono}>
              {r.symbol}
              {r.held ? <span style={{ color: C.amber }}> · held</span> : null}
            </span>
            <span style={{ color: C.dim, marginLeft: 8, overflow: "hidden", textOverflow: "ellipsis",
              whiteSpace: "nowrap", maxWidth: 200 }}>
              {r.name}{r.exchange ? " · " + r.exchange : ""}{r.type && r.type !== "Equity" ? " · " + r.type : ""}
            </span>
          </div>
        ))}
      </div>
    );
  }
  const note = s.busy ? "searching…"
    : s.error ? s.error
    : s.query && s.query.length >= 2 && !state.picked ? "no matches — try another name, or type the exact ticker"
    : null;
  return note ? <div className={css`${mono} font-size:8.5px; color:${C.dim}; margin-top:4px;`}>{note}</div> : null;
};

const AddForm = (props) => (props.state.imp && props.state.imp.open
  ? <ImportPanel state={props.state} dispatch={props.dispatch} /> : <AddFormMain {...props} />);
const AddFormMain = ({ state, dispatch, empty, positions }) => (
  <div className={css`margin-top:6px; padding:7px; border:1px solid ${C.faint}; border-radius:8px;`}>
    <div className={css`display:flex; gap:6px;`}>
      <input className={inputCss} placeholder="stock: name or ticker" value={state.addForm.ticker}
        title="type a company name (apple, shopify) or a ticker (MSFT, SHOP.TO, VOD.L, BTC-USD) and pick a match"
        onChange={(ev) => onTickerInput(ev.target.value, dispatch)}
        onKeyDown={(ev) => onTickerKey(ev, state, dispatch)} />
      <input className={inputCss} placeholder={"shares or " + curSymbol() + " amount"} value={state.addForm.shares}
        title={"10 = ten shares · " + money(1000) + " = that much money's worth · 'all' = sell everything"}
        onChange={(ev) => dispatch({ type: "SET_ADD_FIELD", field: "shares", value: ev.target.value })} />
    </div>
    {state.picked ? (
      <div className={css`${mono} font-size:8.5px; color:${C.dim}; margin-top:3px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;`}>
        {state.picked.symbol} · {state.picked.name}{state.picked.exchange ? " · " + state.picked.exchange : ""}
        {state.picked.held ? " · you hold " + fmtShares(state.picked.held) : ""}
      </div>
    ) : null}
    <Suggestions state={state} dispatch={dispatch} />
    <div className={css`display:flex; gap:6px; margin-top:5px;`}>
      <input className={inputCss} placeholder="price/sh (optional)" value={state.addForm.cost}
        title="buy: what you paid per share · sell: what you got. Empty = the current price (or that day's close for a past date)."
        onChange={(ev) => dispatch({ type: "SET_ADD_FIELD", field: "cost", value: ev.target.value })} />
      <input className={inputCss} placeholder="date YYYY-MM-DD (optional)" value={state.addForm.date}
        title="the day you bought; empty = today"
        onChange={(ev) => dispatch({ type: "SET_ADD_FIELD", field: "date", value: ev.target.value })} />
    </div>
    {state.pendingAction ? (
      <div style={{ marginTop: 6 }}>
        <div className={css`${mono} font-size:9px; color:${C.amber}; line-height:1.4;`}>{state.pendingAction.label}</div>
        <div style={{ marginTop: 4, textAlign: "right" }}>
          <span className={css`${tabBtn} ${tabActive}`}
            onClick={() => executePending(state.pendingAction, dispatch)}>confirm</span>
          <span className={tabBtn} onClick={() => dispatch({ type: "CLEAR_PENDING" })}>cancel</span>
        </div>
      </div>
    ) : (
      <div className={rowFlex} style={{ marginTop: 6 }}>
        <span className={css`${mono} font-size:8.5px; color:${C.dim}; max-width: 150px; line-height:1.4;`}>
          {state.addMsg || (empty ? "add your first holding — any stock Yahoo Finance lists" : "any stock, ETF or crypto on Yahoo Finance")}
        </span>
        <span style={{ whiteSpace: "nowrap" }}>
          <span className={tabBtn} title="see its chart, moves and volatility without adding it"
            onClick={() => {
              const tk = (state.addForm.ticker || "").toUpperCase().trim();
              if (!TICKER_RE.test(tk)) return say(dispatch, "type a ticker or a company name, then pick a match");
              openStock(tk, dispatch, state);
            }}>look</span>
          <span className={tabBtn} title="monitor it in the watch tab (no shares)"
            onClick={() => {
              const tk = (state.addForm.ticker || "").toUpperCase().trim();
              if (!TICKER_RE.test(tk)) return say(dispatch, "type a ticker or a company name, then pick a match");
              watchToggle(tk, true, dispatch, "ADD_MSG");
            }}>watch</span>
          <span className={css`${tabBtn} ${tabActive}`} title="record a buy"
            onClick={() => submitAdd(state, dispatch)}>buy</span>
          <span className={tabBtn} title="record a sale (oldest shares first)"
            onClick={() => submitSell(state, positions, dispatch)}>sell</span>
        </span>
      </div>
    )}
    <div className={rowFlex} style={{ marginTop: 5 }}>
      <span className={linkBtn} title="show positions.json in Finder — edit it with any text editor"
        onClick={() => run(`open -R ${shq(DIR + "/positions.json")}`)}>show file</span>
      <span className={linkBtn} title="add many holdings at once: paste a list, or pick a CSV file exported from your broker"
        data-pw-import-open="1" onClick={() => openImport(state, dispatch)}>import a list…</span>
      {empty ? null : (
        <span className={linkBtn} title="remove every holding (your old file is kept as a backup)"
          onClick={() => dispatch({ type: "SET_PENDING", pending: {
            cmd: helper(["sell", "--reset-all"]),
            label: "remove ALL holdings? (backup kept)" } })}>start fresh</span>
      )}
    </div>
  </div>
);

// ---- import (13.4): many holdings at once — a pasted list or a CSV file
// (import_positions.py: "preview" shows what would be added, "commit" adds)
const welcomeCss = css`
  margin-top: 8px;
  padding: 7px 10px 8px;
  border: 1px solid rgba(var(--pw-fg), 0.14);
  border-radius: 8px;
  background: rgba(var(--pw-fg), 0.04);
  font-size: 10px;
  line-height: 1.5;
`;
const welcomeLine = css`
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  column-gap: 6px;
  margin-top: 2px;
  min-width: 0;
`;
const importH = (st) => (st.imp && st.imp.open ? LAYOUT_K.IMPORT + Math.min(12, (st.imp.rows || []).length) * LAYOUT_K.ROW_LINE : 0);
const openImport = (state, dispatch) => {
  if (!state.showAdd) dispatch({ type: "TOGGLE_ADD" });
  dispatch({ type: "IMPORT_SET", imp: { open: true, rows: null, msg: null, busy: false } });
};
const importArgs = (imp) => (imp.file ? ["--file", imp.file] : ["--text", imp.text || ""]);
const importPreview = (state, dispatch) => {
  const imp = state.imp || IMPORT_EMPTY;
  if (!imp.file && !(imp.text || "").trim()) return dispatch({ type: "IMPORT_SET", imp: { msg: "paste a list first, or pick a file" } });
  dispatch({ type: "IMPORT_SET", imp: { busy: true, msg: "reading…", rows: null } });
  run(helper(["import", "preview"].concat(importArgs(imp)))).then((out) => {
    const r = parseJson(String(out).trim());
    if (!r || (r.error && !(r.rows || []).length)) {
      return dispatch({ type: "IMPORT_SET", imp: { busy: false, msg: (r && r.error) || "could not read the list" } });
    }
    dispatch({ type: "IMPORT_SET", imp: { busy: false, rows: r.rows || [], ok: r.ok || 0, skipped: r.skipped || 0, format: r.format || null,
      msg: r.ok ? null : "no holding found — one per line: ticker and shares (KO 10)" } });
  }, (e) => dispatch({ type: "IMPORT_SET", imp: { busy: false, msg: "could not read the list: " + String(e).slice(0, 60) } }));
};
const importCommit = (state, dispatch) => {
  const imp = state.imp || IMPORT_EMPTY;
  dispatch({ type: "IMPORT_SET", imp: { busy: true, msg: "adding…" } });
  run(helper(["import", "commit"].concat(importArgs(imp)))).then((out) => {
    const r = parseJson(String(out).trim());
    if (!r || r.error) return dispatch({ type: "IMPORT_SET", imp: { busy: false, msg: (r && r.error) || "could not add them" } });
    dispatch({ type: "IMPORT_SET", imp: null });
    dispatch({ type: "FORM_RESET" });
    const n = r.added || 0, k = r.skipped || 0;
    say(dispatch, "added " + n + " holding" + (n === 1 ? "" : "s") + (k ? " (" + k + " line" + (k === 1 ? "" : "s") + " skipped)" : "") +
      " — prices come with the next refresh" + (r.backup ? "; the old file is kept as a backup" : ""));
  }, (e) => dispatch({ type: "IMPORT_SET", imp: { busy: false, msg: "could not add them: " + String(e).slice(0, 60) } }));
};
const importChoose = (dispatch) => {
  dispatch({ type: "IMPORT_SET", imp: { busy: true, msg: "pick the file in the dialog…" } });
  run(helper(["import", "choose"])).then((out) => {
    const r = parseJson(String(out).trim());
    if (r && r.file) {
      dispatch({ type: "IMPORT_SET", imp: { busy: false, file: r.file, text: "", rows: null, msg: null } });
      importPreview({ imp: Object.assign({}, IMPORT_EMPTY, { file: r.file }) }, dispatch);
    } else {
      dispatch({ type: "IMPORT_SET", imp: { busy: false, msg: r && r.cancelled ? null : "no file picked" } });
    }
  }, () => dispatch({ type: "IMPORT_SET", imp: { busy: false, msg: "the file dialog failed" } }));
};
const ImportPanel = ({ state, dispatch }) => {
  const imp = state.imp || IMPORT_EMPTY;
  const rows = imp.rows || [];
  const shown = rows.slice(0, 12);
  const fileName = imp.file ? String(imp.file).split("/").pop() : null;
  const okN = imp.ok || 0, skipN = imp.skipped || 0;
  const plural = (n, w) => n + " " + w + (n === 1 ? "" : "s");
  return (
    <div className={css`margin-top:6px; padding:7px; border:1px solid ${C.faint}; border-radius:8px;`} data-pw-import="1">
      <div className={rowFlex} style={{ alignItems: "baseline" }}>
        <span className={eyebrow}>import a list</span>
        <span style={{ whiteSpace: "nowrap" }}>
          <span className={tabBtn} title="pick a CSV or text file — your broker's export, for example" data-pw-import-choose="1"
            onClick={() => { if (!imp.busy) importChoose(dispatch); }}>choose a file…</span>
          <span className={tabBtn} title="back to the + form" data-pw-import-close="1" onClick={() => dispatch({ type: "IMPORT_SET", imp: null })}>×</span>
        </span>
      </div>
      {fileName ? (
        <div className={css`${mono} font-size:8.5px; color:${C.dim}; margin-top:3px;`}>{"file: " + fileName}
          <span className={linkBtn} style={{ marginLeft: 6 }} onClick={() => dispatch({ type: "IMPORT_SET", imp: { file: null, rows: null, msg: null } })}>paste instead</span>
        </div>
      ) : (
        <textarea className={inputCss} rows={4} value={imp.text || ""} data-pw-import-text="1"
          placeholder={"one holding per line, like:\nAAPL 10\nMSFT 5 at 310 on 2024-03-01\n…or paste your broker's CSV export"}
          style={{ width: "100%", boxSizing: "border-box", marginTop: 4, resize: "vertical", fontFamily: '"SF Mono", Menlo, monospace', fontSize: 9.5, lineHeight: 1.4 }}
          onChange={(ev) => dispatch({ type: "IMPORT_SET", imp: { text: ev.target.value, rows: null } })} />
      )}
      {rows.length ? (
        <div className={css`${mono} font-size:8.5px; margin-top:4px;`} data-pw-import-rows={rows.length}>
          <div style={{ color: C.dim }}>{plural(okN, "holding") + " found" + (skipN ? " · " + plural(skipN, "line") + " skipped" : "")}</div>
          {shown.map((r, i) => (
            <div key={i} className={rowFlex} style={{ color: r.ok ? C.ink : C.dim, columnGap: 8, justifyContent: "flex-start" }} title={r.text || ""}>
              <span style={{ width: 64, flex: "none", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.ticker || "—"}</span>
              <span style={{ width: 54, flex: "none", textAlign: "right" }}>{r.ok ? fmtShares(r.shares) : ""}</span>
              <span style={{ width: 72, flex: "none", textAlign: "right" }}>{r.ok ? (r.cost != null ? num(r.cost, 2) : "day's close") : ""}</span>
              <span style={{ width: 70, flex: "none" }}>{r.ok ? (r.date || "today") : ""}</span>
              <span style={{ color: r.ok ? C.dim : C.amber, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {r.ok ? (r.note || "") : "line " + r.line + ": " + r.note}</span>
            </div>
          ))}
          {rows.length > shown.length ? <div style={{ color: C.dim }}>{"+ " + (rows.length - shown.length) + " more"}</div> : null}
        </div>
      ) : null}
      <div className={rowFlex} style={{ marginTop: 6 }}>
        <span className={css`${mono} font-size:8.5px; line-height:1.4; max-width: 250px;`} style={{ color: imp.msg && !imp.busy ? C.amber : C.dim }} data-pw-import-msg="1">
          {imp.msg || (rows.length ? "price = what you paid per share; none = that day's close"
            : "ticker and shares on each line — then the price you paid and the date, if you have them")}
        </span>
        <span style={{ whiteSpace: "nowrap" }}>
          {rows.length && okN ? (
            <span className={css`${tabBtn} ${tabActive}`} title="write these holdings into positions.json (the old file is kept as a backup)" data-pw-import-commit="1"
              onClick={() => { if (!imp.busy) importCommit(state, dispatch); }}>{"add " + plural(okN, "holding")}</span>
          ) : (
            <span className={css`${tabBtn} ${tabActive}`} title="read the list and show what would be added" data-pw-import-preview="1"
              onClick={() => { if (!imp.busy) importPreview(state, dispatch); }}>preview</span>
          )}
        </span>
      </div>
    </div>
  );
};
// ---- the update offer's "yes" (13.4): widget_command.sh update run -> update.sh
const runUpdate = (upd, dispatch) => {
  dispatch({ type: "UPDATE_ASK", on: false });
  dispatch({ type: "UPDATE_MSG", msg: "updating… (the widget reloads in a moment)" });
  run(helper(["update", "run"].concat(upd && upd.zip ? [upd.zip] : []))).then((out) => {
    const r = parseJson(String(out).trim());
    if (r && r.ok === false) dispatch({ type: "UPDATE_MSG", msg: "update failed: " + String(r.message || "").slice(0, 90), err: true });
  }, (e) => dispatch({ type: "UPDATE_MSG", msg: "update failed: " + String(e).slice(0, 60), err: true }));
};

// ------------------------------------------------------------------ detail
const PriceChart = ({ series, values, refLine, w }) => {
  const W = w || LAYOUT_K.PRICE_W, H = LAYOUT_K.PRICE_H, PADL = 40, PADR = 4, PADT = 6, PADB = 6;
  // series: [[t, v], ...] (time-based); values: [v, ...] (evenly spaced)
  const pts = series && series.length > 1 ? series.map((p) => ({ t: p[0], v: p[1] }))
    : values && values.length > 1 ? values.map((v, i) => ({ t: i, v: v })) : null;
  if (!pts) {
    return <div className={css`height:${H}px; display:flex; align-items:center; justify-content:center; color:${C.dim}; font-size:10px;`}>no price history</div>;
  }
  let mn = Infinity, mx = -Infinity;
  pts.forEach((p) => { if (p.v < mn) mn = p.v; if (p.v > mx) mx = p.v; });
  if (refLine !== null && refLine !== undefined) { mn = Math.min(mn, refLine); mx = Math.max(mx, refLine); }
  if (mx === mn) { mx += 1; mn -= 1; }
  const span0 = mx - mn;
  mx += span0 * 0.06;
  mn -= span0 * 0.06;
  const t0 = pts[0].t, t1 = pts[pts.length - 1].t;
  const x = (t) => PADL + ((t - t0) / Math.max(1e-9, t1 - t0)) * (W - PADL - PADR);
  const y = (v) => H - PADB - ((v - mn) / (mx - mn)) * (H - PADT - PADB);
  const nt = niceTicks(mn, mx, 3);
  const line = pts.map((p) => x(p.t).toFixed(1) + "," + y(p.v).toFixed(1)).join(" ");
  const area = "M" + x(t0).toFixed(1) + "," + (H - PADB) + " L" + line.replace(/ /g, " L") + " L" + x(t1).toFixed(1) + "," + (H - PADB) + " Z";
  const last = pts[pts.length - 1];
  return (
    <svg width={W} height={H}>
      {nt.ticks.map((tv) => (
        <g key={tv}>
          <line x1={PADL} y1={crisp(y(tv))} x2={W - PADR} y2={crisp(y(tv))} stroke={C.faint} strokeWidth="1" shapeRendering="crispEdges" />
          <text x={PADL - 5} y={crisp(y(tv)) + 3} textAnchor="end" fill={C.dim}
            fontSize="8" fontFamily='"SF Mono", Menlo, monospace'>
            {num(tv, nt.step < 1 ? 2 : 0)}
          </text>
        </g>
      ))}
      <path d={area} fill={C.line} opacity="0.07" />
      {refLine !== null && refLine !== undefined ? (
        <line x1={PADL} y1={crisp(y(refLine))} x2={W - PADR} y2={crisp(y(refLine))}
          stroke={C.dim} strokeWidth="1" opacity="0.45" shapeRendering="crispEdges" />
      ) : null}
      <polyline points={line} fill="none" stroke={C.line} strokeWidth="1.25" {...LINE_STYLE} />
      <circle cx={x(last.t).toFixed(1)} cy={y(last.v).toFixed(1)} r="1.8" fill={C.ink} />
    </svg>
  );
};

const statRow = css`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-top: 4px;
  font-size: 9.5px;
`;

const rowFromLook = (ld) => ({
  ticker: ld.symbol, name: ld.name, theme: ld.exchange || "", price: ld.price, currency: ld.currency,
  dayChangePct: ld.dayChangePct, dayChange: ld.dayChange, changes: ld.changes, spark: ld.spark,
  volPct: ld.volPct, volScore: ld.volScore, earningsDate: ld.earningsDate, stale: ld.stale,
});

// % change over a detail range: the tracker's figure where it has one,
// else first→last of the fetched series
const rangeChangeOf = (p, ld, range) => {
  if (p.changes && typeof p.changes[range] === "number") return p.changes[range];
  const ser = ld && ld.series && ld.series[range];
  if (ser && ser.length > 1 && ser[0][1]) return (ser[ser.length - 1][1] / ser[0][1] - 1) * 100;
  return null;
};

const StockDetail = ({ p, earn, look, range, dispatch, tg, chartW }) => {   // tg: its target bucket (12.10, only with targets)
  const held = p.shares !== undefined && p.shares !== null;
  const away = daysAway(p.earningsDate);
  const exAway = typeof p.exDividendDate === "string" ? daysAway(p.exDividendDate) : null;   // 12.7+
  const ld = look && look.ticker === p.ticker ? look.data : null;
  let series = null;
  if (ld && ld.series) {
    series = ld.series[range] || null;
    if (range === "1H" && ld.series["1D"]) {
      const day = ld.series["1D"];
      const cutoff = day.length ? day[day.length - 1][0] - 3600 : 0;
      series = day.filter((q) => q[0] >= cutoff);
    }
  }
  const refLine = ld && (range === "1D" || range === "1H") ? ld.prevClose : null;
  const caption = series && series.length > 1
    ? series.length + " points · " + (range === "1H" || range === "1D" ? "5-min bars" : range === "1W" || range === "1M" ? "hourly closes" : "daily closes")
    : look && look.busy ? "loading full chart…"
    : look && look.error ? look.error
    : "last " + (p.spark ? p.spark.length : 0) + " sessions · daily closes";
  const chg = rangeChangeOf(p, ld, range);
  return (
    <div>
      <div className={rowFlex} style={{ marginTop: 4 }}>
        <span className={mono} style={{ fontSize: 18 }}>
          {num(p.price, 2)} <span style={{ fontSize: 9, color: C.dim }}>{p.currency}</span>
        </span>
        <span className={mono} style={{ fontSize: 11, color: upDown(p.dayChangePct || 0) }} title="today">
          {pct(p.dayChangePct)} · {held ? signedMoney(p.dayChangeValue)
            : (p.dayChange >= 0 ? "+" : "−") + num(Math.abs(p.dayChange || 0), 2)}
        </span>
      </div>
      <div className={rowFlex} style={{ marginTop: 5 }}>
        <span>
          {DETAIL_RANGES.map((r) => (
            <span key={r}
              className={r === range ? css`${tabBtn} ${tabActive}` : tabBtn}
              style={{ padding: "2px 5px" }}
              onClick={() => dispatch({ type: "SET_DETAIL_RANGE", range: r })}>
              {r}
            </span>
          ))}
        </span>
        <span className={mono} style={{ fontSize: 10, color: chg === null ? C.dim : upDown(chg) }}>{pct(chg)}</span>
      </div>
      <div style={{ marginTop: 4 }}>
        <PriceChart series={series} values={series ? null : p.spark} refLine={refLine} w={chartW} />
      </div>
      <div className={css`${mono} font-size: 8px; color: ${C.dim};`}>
        {caption}{refLine !== null && series && series.length > 1 ? " · grey line = previous close" : ""}
      </div>

      <div className={css`${statRow} ${mono}`} style={{ marginTop: 8 }} title={volTip(p.volPct, p.volScore)}>
        <span style={{ color: C.dim, whiteSpace: "nowrap" }}>volatility</span>
        <span>
          {p.volScore ? (
            <span>
              <span style={{ color: volColor(p.volScore) }}>{p.volScore}/10 {VOL_LABEL[p.volScore]}</span>
              {" · " + p.volPct + "%/yr "}
              <VolMeter score={p.volScore} />
            </span>
          ) : "not enough history"}
        </span>
      </div>
      {held ? (
        <div>
          <div className={css`${statRow} ${mono}`}>
            <span style={{ color: C.dim }}>
              position{p.undated === true ? (
                <span title="no purchase date — counted as held for the whole graph (backtestYears in _settings)"> · undated</span>
              ) : null}
            </span>
            <span>{p.shares} sh · {money(p.value)} · {p.weightPct}%</span>
          </div>
          {tg ? (
            <div className={css`${statRow} ${mono}`} title={"_settings.targets — ±" + tg.band + " pt band"}>
              <span style={{ color: C.dim }}>{tg.kind === "sector" ? tg.key + " sector" : "target"}</span>
              <span>
                {fmtTarget(tg.targetPct) + " · drift "}
                <span style={{ color: tg.state === "over" ? C.orange : C.ink }}>{fmtPts(tg.driftPct) + " pts"}</span>
              </span>
            </div>
          ) : null}
          <div className={css`${statRow} ${mono}`}
            title={p.basisDerived ? "≈ = no purchase price given, so the close on your buy date is used" : ""}>
            <span style={{ color: C.dim }}>cost basis{p.basisDerived ? " ≈" : ""}</span>
            <span>{money(p.costBasis)}</span>
          </div>
          <div className={css`${statRow} ${mono}`}>
            <span style={{ color: C.dim }}>P&L</span>
            <span style={{ color: upDown(p.pl || 0) }}>{signedMoney(p.pl)} ({pct(p.plPct)})</span>
          </div>
          <div className={css`${statRow} ${mono}`} title="today's change split into the price move and the exchange-rate move">
            <span style={{ color: C.dim }}>today · price / fx</span>
            <span>{signedMoney(p.priceEffect)} / {signedMoney(p.fxEffect)}</span>
          </div>
        </div>
      ) : (
        <div className={css`${statRow} ${mono}`} title="1H · 1D · 1W · 1M · 1Y">
          <span style={{ color: C.dim, whiteSpace: "nowrap" }}>moves</span>
          <span>
            {RANGES.map((r) => (
              <span key={r} style={{ marginLeft: 6, color: upDown((p.changes && p.changes[r]) || 0) }}>{pct(p.changes ? p.changes[r] : null)}</span>
            ))}
          </span>
        </div>
      )}
      <div className={css`${statRow} ${mono}`}
        title="± = the move options traders are pricing in for the earnings report">
        <span style={{ color: C.dim }}>earnings</span>
        <span>
          {p.earningsDate
            ? fmtDate(p.earningsDate) +
              (away !== null && away >= 0 ? " (" + (away === 0 ? "today" : away + "d") + ")" : "")
            : "—"}
          {earn && earn.impliedMovePct !== null && earn.impliedMovePct !== undefined
            ? " ±" + earn.impliedMovePct + "%" : ""}
        </span>
      </div>
      <div className={css`${statRow} ${mono}`}>
        <span style={{ color: C.dim }}>dividends</span>
        <span>{held ? (p.dividendAnnual ? "~" + money(p.dividendAnnual) + "/yr" : "—")
          : ld && ld.dividendRate ? num(ld.dividendRate, 2) + " " + p.currency + "/sh/yr" : "—"}
          {exAway !== null && exAway >= 0 ? (
            <span style={{ color: exAway <= 7 ? C.amber : C.dim }} title="announced ex-dividend date — own the shares before it to get the payment">
              {" · ex " + fmtDate(p.exDividendDate) + " (" + (exAway === 0 ? "today" : exAway + "d") + ")"}</span>
          ) : null}</span>
      </div>
      {held && isFin(p.dividendsReceived) && p.dividendsReceived > 0 ? (
        <div className={css`${statRow} ${mono}`}
          title={"dividends paid on the shares held before each ex-dividend date (dated lots only)"}>
          <span style={{ color: C.dim }}>received</span>
          <span>{money(p.dividendsReceived)}</span>
        </div>
      ) : null}
      {p.stale ? (
        <div className={css`font-size:9px; color:${C.down}; margin-top:5px;`}>
          ! last known price — the latest fetch failed for this ticker
        </div>
      ) : null}
    </div>
  );
};

// ------------------------------------------------------------------ sales · income · ex-dividends
// every read here is guarded: data.json from before 12.7 has none of these fields
const isFin = (v) => typeof v === "number" && isFinite(v);
// "Mar 14" this year, "Mar 14, 2025" otherwise
const fmtIsoY = (iso) => {
  if (typeof iso !== "string" || !/^\d{4}-\d\d-\d\d$/.test(iso)) return "—";
  return iso.slice(0, 4) === String(new Date().getFullYear()) ? fmtDate(iso) : fmtIsoLong(iso);
};

// ------------------------------------------------------------------ 12.8: returns · drawdown · 52-week high
// every read is guarded: data.json from before 12.8 has no performance, risk.real/backtest or high52
// signed, 1 dp ("+9.1%", "−4.7%"); "—" when unknown
const pct1 = (v) => {
  if (!isFin(v)) return "—";
  const r = Math.round(v * 10) / 10;
  return (r > 0 ? "+" : r < 0 ? "−" : "") + Math.abs(r).toFixed(1) + "%";
};
// 2 dp with a real minus sign (like pct1), no "-0.00"; "—" when unknown
const num2 = (v) => (isFin(v) ? num(Math.round(v * 100) / 100 || 0, 2).replace(/^-/, "−") : "—");
// the header's return line is shown only when the tracker says the history is complete
const perfShown = (perf) => !!(perf && perf.ok === true && isFin(perf.totalPct));
// hover line for a holding: "52-week closing high 181.20 USD (Mar 3) · −4.20% from it"; "" when absent
const high52Tip = (p) => {
  if (!p || !isFin(p.high52)) return "";
  const at = p.high52Date ? " (" + fmtIsoY(p.high52Date) + ")" : "";
  const from = !isFin(p.fromHigh52Pct) ? ""
    : p.fromHigh52Pct > -0.005 ? " · at its 52-week high" : " · " + pct(p.fromHigh52Pct) + " from it";
  return "52-week closing high " + num(p.high52, 2) + (p.currency ? " " + p.currency : "") + at + from;
};
// why the real risk figures are hidden (performance.ok false); null = say nothing
const perfWhy = (perf) => {
  if (!perf || typeof perf !== "object") return null;
  const min = isFin(perf.minDays) ? perf.minDays : 30;
  // ok, but the priced holdings' own span is still short (an old sale made `since` old)
  if (perf.ok === true && !isFin(perf.twrPct) && isFin(perf.twrDays) && perf.twrDays < min)
    return "drawdown, beta and sharpe appear after " + min + " days (day " + perf.twrDays + ")";
  if (perf.ok !== false) return null;
  const what = "drawdown, beta, sharpe and the annual return ";
  switch (perf.reason) {
    case "young": return what + "appear after " + min + " days" + (isFin(perf.days) ? " (day " + perf.days + ")" : "");
    case "undated": return what + "need purchase dates";
    case "loading": return what + "appear after the price history loads";
    case "cost": return what + "need a purchase price for every lot";
    case "sales": return what + "need a purchase and sale price for every recorded sale";
    default: return null;
  }
};
// the earnings list with the announced ex-dividend dates merged in, by date
// (earnings first on a tie); each item gets a kind: "earn" or "exdiv"
const calendarOf = (d) => {
  const items = [];
  (Array.isArray(d.earnings) ? d.earnings : []).forEach((e) => {
    if (e && typeof e.ticker === "string") items.push(Object.assign({}, e, { kind: "earn" }));
  });
  (Array.isArray(d.exDividends) ? d.exDividends : []).forEach((e) => {
    if (e && typeof e.ticker === "string" && typeof e.date === "string") items.push(Object.assign({}, e, { kind: "exdiv" }));
  });
  if (items.length === 0 || items.every((e) => e.kind === "earn")) return items;   // old data: order untouched
  return items.map((e, i) => [e, i]).sort((a, b) => {
    const da = a[0].date || "9999", db = b[0].date || "9999";
    return da < db ? -1 : da > db ? 1 : a[1] - b[1];
  }).map((x) => x[0]);
};
const exDivTip = (e) => "ex-dividend date — own the shares before it to get the payment" +
  (isFin(e.amountPerShare) ? "\n" + num(e.amountPerShare, e.amountPerShare < 0.1 ? 4 : 2) + " " + (e.currency || "") + " per share (the last payment)" : "") +
  (isFin(e.value) ? "\n≈ " + money(e.value, true) + " for the shares you hold" : "");

const SALES_ROWS = 5;
const SalesPanel = ({ d, totals, expanded, dispatch, first, pw }) => {
  const sales = Array.isArray(d.sales) ? d.sales.filter((s) => s && typeof s.ticker === "string") : [];
  if (sales.length === 0) return null;
  const shown = expanded ? sales : sales.slice(0, SALES_ROWS);
  const count = isFin(d.salesCount) ? d.salesCount : sales.length;
  const unknown = isFin(d.salesUnknown) ? d.salesUnknown : 0;
  return (
    <div className={first ? "" : sectionGap} {...(pw || {})}>
      <div className={rowFlex}>
        <span className={eyebrow} title="sales recorded by the sell button / remove_position.py · gain = sale price − purchase price, oldest shares sold first, no fees">
          sales · realized
        </span>
        {isFin(totals.realized) ? (
          <span className={mono} style={{ fontSize: 9, color: upDown(totals.realized) }} title="realized gain of all recorded sales">
            {signedMoney(totals.realized)}
          </span>
        ) : null}
      </div>
      {shown.map((s, i) => {
        const known = isFin(s.gain);
        const disp = isFin(s.gainDisplay);
        const why = !isFin(s.basis) ? "no purchase price" : !isFin(s.proceeds) ? "no sale price" : "gain unknown";
        return (
          <div key={s.ticker + "|" + (s.date || "") + "|" + i} className={rowFlex} style={{ marginTop: 3 }}>
            <span className={mono} style={{ fontSize: 9.5 }}>
              <span style={{ color: C.dim }}>{fmtIsoY(s.date)} </span>
              {s.ticker}
              <span style={{ color: C.dim }}>{isFin(s.shares) ? " " + fmtShares(s.shares) + " sh" : ""}</span>
            </span>
            {!known ? (
              <span className={mono} style={{ fontSize: 9.5, color: C.dim }} title={why}>—</span>
            ) : (
              <span className={mono} style={{ fontSize: 9.5, color: upDown(s.gain) }}
                title={(isFin(s.proceeds) ? "sold for " + num(s.proceeds, 2) + " " + (s.currency || "") : "") +
                  (isFin(s.basis) ? "\npaid " + num(s.basis, 2) + " " + (s.currency || "") : "") +
                  (disp ? "" : "\nno exchange rate — gain shown in " + (s.currency || "the stock's currency"))}>
                {disp ? signedMoney(s.gainDisplay)
                  : (s.gain >= 0 ? "+" : "−") + num(Math.abs(s.gain), 2) + " " + (s.currency || "")}
                {isFin(s.gainPct) ? <span style={{ color: C.dim }}> ({pct(s.gainPct)})</span> : null}
              </span>
            )}
          </div>
        );
      })}
      <div className={rowFlex} style={{ marginTop: 4 }}>
        <span className={css`${mono} font-size: 8px; color: ${C.dim};`}
          title={unknown > 0 ? "sales without a purchase price, a sale price or an exchange rate are not in the realized total" : ""}>
          {count + (count === 1 ? " sale" : " sales")}
          {unknown > 0 ? " · " + unknown + " without a known gain (not counted)" : ""}
        </span>
        {sales.length > SALES_ROWS ? (
          <span className={linkBtn} style={{ fontSize: 8 }}
            onClick={() => dispatch({ type: "SET_SALES_EXPANDED", on: !expanded })}>
            {expanded ? "fewer" : "all " + sales.length + " ›"}
          </span>
        ) : null}
      </div>
    </div>
  );
};

const monthOf = (m) => {   // "2026-09" -> Date in that month
  const mm = /^(\d{4})-(\d\d)$/.exec(typeof m === "string" ? m : "");
  return mm ? new Date(Number(mm[1]), Number(mm[2]) - 1, 15, 12) : null;
};
const INCOME_BAR_H = 22;
const IncomePanel = ({ d, first, pw }) => {
  const dv = d.dividends;
  if (!dv || typeof dv !== "object" || Array.isArray(dv)) return null;
  const months = (Array.isArray(dv.months) ? dv.months : []).slice(0, 12)
    .map((b) => ({ m: b && b.m, amount: b && isFin(b.amount) && b.amount > 0 ? b.amount : 0 }));
  const top = months.reduce((mx, b) => Math.max(mx, b.amount), 0);
  const fallback = Array.isArray(dv.fallback) ? dv.fallback.filter((t) => typeof t === "string") : [];
  return (
    <div className={first ? "" : sectionGap} {...(pw || {})}>
      <div className={rowFlex}>
        <span className={eyebrow} title="dividends — the next 12 months estimated from the last year of payments × the shares you hold now">
          income · dividends
        </span>
        <span className={mono} style={{ fontSize: 9.5 }}>~{money(dv.annual)}/yr</span>
      </div>
      <div className={css`${mono} font-size: 9px; color: ${C.dim};`} style={{ marginTop: 3 }}
        title={"yield = yearly dividends ÷ portfolio value · on cost = ÷ what the holdings cost" +
          (fallback.length ? "\nno payment history, estimated from the yearly rate: " + fallback.join(", ") : "")}>
        yield {isFin(dv.yieldPct) ? num(dv.yieldPct, 2) + "%" : "—"}
        {" · on cost "}{isFin(dv.yieldOnCostPct) ? num(dv.yieldOnCostPct, 2) + "%" : "—"}
        {isFin(dv.payers) ? " · " + dv.payers + (dv.payers === 1 ? " payer" : " payers") : ""}
      </div>
      {months.length ? (
        <div style={{ display: "flex", alignItems: "flex-end", marginTop: 5 }}>
          {months.map((b, i) => {
            const dt = monthOf(b.m);
            const h = top > 0 && b.amount > 0 ? Math.max(2, Math.round((b.amount / top) * INCOME_BAR_H)) : 1;
            return (
              <div key={(b.m || "") + "|" + i} style={{ flex: 1, textAlign: "center", padding: "0 1px" }}
                title={(dt ? dt.toLocaleDateString(LOCALE, { month: "long", year: "numeric" }) : "") +
                  " · ~" + money(b.amount, true) + (i === 0 ? " (this month)" : "")}>
                <div style={{ height: INCOME_BAR_H, display: "flex", alignItems: "flex-end" }}>
                  <div style={{ width: "100%", height: h, borderRadius: b.amount > 0 ? 1 : 0,
                    background: b.amount > 0 ? C.line : C.faint, opacity: b.amount > 0 ? 0.8 : 1 }} />
                </div>
                <div className={mono} style={{ fontSize: 7.5, color: i === 0 ? C.ink : C.dim, marginTop: 1 }}>
                  {dt ? dt.toLocaleDateString(LOCALE, { month: "narrow" }) : "·"}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
      {isFin(dv.received) ? (
        <div className={css`${mono} font-size: 8.5px; color: ${C.dim};`} style={{ marginTop: 3 }}
          title={"dividends paid on the shares you held before each ex-dividend date" +
            (dv.receivedPartial ? "\nholdings without a purchase date are not counted (their start is unknown)" : "") +
            "\nshares you have since sold are not counted"}>
          received <span style={{ color: C.ink }}>{money(dv.received)}</span>
          {typeof dv.receivedSince === "string" ? " since " + fmtIsoY(dv.receivedSince) : ""}
          {dv.receivedPartial === true ? " · dated lots only" : ""}
        </div>
      ) : null}
    </div>
  );
};

// ------------------------------------------------------------------ rebalance (12.10)
// Only with _settings.targets (d.targets an object). The tracker computes
// everything (fewest dollars moved to get every bucket within ±band); this
// only shows the chosen plan: whole shares or fractional.
const REBAL_ROWS = 5;
const REBAL_REASON = {
  noPrice: "waiting for prices", empty: "nothing to rebalance yet",
  infeasible: "these targets can't all be met within ±{band} pt",
};
const saveRebalWhole = (on, dispatch) => {
  dispatch({ type: "SET_REBAL_WHOLE", on: on });
  // null = "default": the key is removed, the widget chooses (13.2)
  return saveSetting("rebalanceWhole", on === true ? "true" : on === false ? "false" : "default", dispatch);
};
const buyList = (buys) => (Array.isArray(buys) ? buys : []).filter((b) => b && isFin(b.amount))
  .map((b) => b.key + " " + money(b.amount, true)).join("\n");
const RebalancePanel = ({ d, state, dispatch, first, pw }) => {
  const tg = d.targets;
  if (!tg || typeof tg !== "object" || Array.isArray(tg)) return null;
  const on = tg.set === true;
  const band = bandOf(d);
  const warns = (Array.isArray(tg.warnings) ? tg.warnings : []).filter((w) => w && typeof w.text === "string");
  const rb = on && tg.rebalance && typeof tg.rebalance === "object" ? tg.rebalance : null;
  const whole = wholeOf(state, d);
  const plan = rb && rb.ok ? (whole ? rb.whole || rb.fractional : rb.fractional || rb.whole) : null;
  const trades = plan && Array.isArray(plan.trades) ? plan.trades.filter((t) => t && typeof t.ticker === "string") : [];
  const shown = state.rebalExpanded ? trades : trades.slice(0, REBAL_ROWS);
  const off = targetBuckets(d).filter((b) => b.state === "over" || b.state === "under").slice(0, 4);
  const nm = on && tg.newMoney && typeof tg.newMoney === "object" ? tg.newMoney : null;
  const order = nm && Array.isArray(nm.order) ? nm.order.filter((o) => o && typeof o.key === "string") : [];
  const ns = nm && nm.noSell && typeof nm.noSell === "object" ? nm.noSell : null;
  const nsBuys = ns && Array.isArray(ns.buys) ? ns.buys : [];
  const line = css`${mono} font-size: 8.5px; color: ${C.dim}; margin-top: 3px;`;
  return (
    <div className={first ? "" : sectionGap} {...(pw || {})}>
      <div className={rowFlex}>
        <span className={eyebrow} title={"_settings.targets in positions.json: the fewest dollars of trades that bring every holding, sector and cash within ±" +
          band + " percentage point of its target"}>{"rebalance · ±" + band + " pt"}</span>
        {on ? (
          <span>
            {[["whole", true], ["fractional", false]].map(([label, v]) => (
              <span key={label} className={whole === v ? css`${tabBtn} ${tabActive}` : tabBtn}
                title={v ? "whole shares only (cash takes the rest)" : "fractional shares"}
                onClick={() => saveRebalWhole(v, dispatch)}>{label}</span>
            ))}
          </span>
        ) : null}
      </div>
      {warns.slice(0, 3).map((w, i) => (
        <div key={(w.kind || "") + "|" + i} className={css`${mono} font-size: 8.5px; color: ${C.amber}; margin-top: 3px;`}>{w.text}</div>
      ))}
      {warns.length > 3 ? (
        <div className={css`${mono} font-size: 8.5px; color: ${C.amber}; margin-top: 3px;`}
          title={warns.slice(3).map((w) => w.text).join("\n")}>{"+" + (warns.length - 3) + " more"}</div>
      ) : null}
      {!on ? null : !rb || !rb.ok ? (
        <div className={line}>{((rb && REBAL_REASON[rb.reason]) || "no suggestion yet").replace("{band}", band)}</div>
      ) : rb.inBand ? (
        <div className={line}>{"all within ±" + band + " pt of target — nothing to trade"}</div>
      ) : (
        <div>
          {shown.map((t, i) => (
            <div key={t.side + "|" + t.ticker + "|" + i} className={rowFlex} style={{ marginTop: 3 }}
              title={(isFin(t.price) ? "at " + num(t.price, 2) + " " + (t.currency || "") : "") +
                (typeof t.bucket === "string" && t.bucket !== t.ticker ? "\nfor the " + t.bucket + " target" : "")}>
              <span className={mono} style={{ fontSize: 9.5 }}>
                <span style={{ color: t.side === "sell" ? C.orange : C.line }}>{t.side === "sell" ? "sell" : "buy"}</span>
                {" " + (isFin(t.shares) ? fmtShares(t.shares) : "—") + " " + t.ticker}
              </span>
              <span className={mono} style={{ fontSize: 9.5 }}>{money(t.value)}</span>
            </div>
          ))}
          <div className={rowFlex} style={{ marginTop: 4 }}>
            <span className={css`${mono} font-size: 8px; color: ${C.dim};`}
              title="money moved = everything bought (or everything sold); no fees or taxes">
              {"moves " + money(plan.moved) + (isFin(plan.cashChange) && Math.abs(plan.cashChange) >= 0.005 ? " · cash " + signedMoney(plan.cashChange) : "")}
            </span>
            {trades.length > REBAL_ROWS ? (
              <span className={linkBtn} style={{ fontSize: 8 }} onClick={() => dispatch({ type: "TOGGLE_REBAL_EXPANDED" })}>
                {state.rebalExpanded ? "fewer" : "all " + trades.length}</span>
            ) : null}
          </div>
          {plan.withinBand === false ? (
            <div className={css`${mono} font-size: 8.5px; color: ${C.amber}; margin-top: 3px;`}
              title="whole shares only, never spending more cash than you have">
              {trades.length ? "no whole-share plan found within ±" + band + " pt — closest found shown"
                : "no whole-share trade gets closer to target — see fractional"}</div>
          ) : null}
        </div>
      )}
      {on && off.length ? (
        <div className={line} title={"outside ±" + band + " pt of target now (percentage points over / under)"}>
          {off.map((b, i) => (
            <span key={b.key}>{i ? " · " : ""}{b.key + " "}
              <span style={{ color: b.state === "over" ? C.orange : C.ink }}>{fmtPts(b.driftPct)}</span></span>
          ))}
        </div>
      ) : null}
      {order.length ? (
        <div className={line} title="where new money helps most: furthest below target first (in dollars)">
          {"new money → " + order[0].key + " first" + (order.length > 1 ? ", then " + order[1].key : "")}</div>
      ) : null}
      {ns && isFin(ns.amount) && ns.amount > 0.005 ? (
        <div className={line} title={"buys, no sales:\n" + buyList(nsBuys)}>{"or add " + money(ns.amount) + " without selling"}</div>
      ) : ns && nsBuys.length ? (
        <div className={line} title={"buys from your cash, no sales:\n" + buyList(nsBuys)}>your cash covers it without selling</div>
      ) : null}
    </div>
  );
};

// ------------------------------------------------------------------ price alerts · headlines (12.9)
// every read is guarded: data.json from before 12.9 has no priceAlerts / news
const alertRulesOf = (d) => {
  const pa = d && d.priceAlerts;
  return pa && Array.isArray(pa.rules) ? pa.rules.filter((r) => r && typeof r.id === "string" && typeof r.ticker === "string") : [];
};
const rulesFor = (d, tk) => alertRulesOf(d).filter((r) => r.ticker === tk);
// a level below 0.1 keeps its digits (0.0065, 0.0000004), else 2 decimals
const fmtLevel = (v) => (!isFin(v) ? "—" : v && Math.abs(v) < 0.1
  ? v.toFixed(Math.min(12, 2 - Math.floor(Math.log10(Math.abs(v))))).replace(/0+$/, "")
  : num(v, Math.round(v) === v ? 0 : 2));
const signedPctText = (v) => (isFin(v) ? (v < 0 ? "−" : "+") + String(Math.abs(v)) + "%" : "—");
const ruleLabel = (r) => {
  switch (r.kind) {
    case "above": return r.ticker + " above " + fmtLevel(r.level);
    case "below": return r.ticker + " below " + fmtLevel(r.level);
    case "pctFromCost": return r.ticker + " " + signedPctText(r.level) + " from cost";
    case "drawdownPct": return "portfolio drawdown ≥ " + (isFin(r.level) ? Math.abs(r.level) : "—") + "%";
    default: return r.ticker + " " + String(r.kind || "?");
  }
};
const ALERT_REASON = {
  noPrice: "no price for it yet", stale: "the last price fetch failed", notHeld: "you don't hold it",
  young: "the portfolio history is too short yet", undated: "needs purchase dates",
  cost: "needs a purchase price for every lot", sales: "needs prices for recorded sales",
  loading: "waiting for the price history", none: "no portfolio history", noHistory: "no portfolio history yet",
};
const STATUS_TIP = { armed: "waiting for the price to cross", fired: "crossed and notified — re-arms when it crosses back",
  "new": "just added — checked at the next refresh" };
const statusColor = (st) => (st === "fired" ? C.amber : st === "armed" ? C.ink : C.dim);
const statusTip = (r) => (r.status === "waiting" ? "not checked: " + (ALERT_REASON[r.reason] || r.reason || "waiting")
  : STATUS_TIP[r.status] || "") + (isFin(r.firedAt) ? "\nlast fired " + fmtDay(r.firedAt) + " " + fmtTime(r.firedAt) : "");
const ruleLine = (r) => ruleLabel(r) + " · " + (r.status || "new");
const agoText = (t) => {
  if (!isFin(t)) return "";
  const s = Math.max(0, Math.round(Date.now() / 1000 - t));
  return s < 3600 ? Math.max(1, Math.round(s / 60)) + "m ago" : s < 172800 ? Math.round(s / 3600) + "h ago" : Math.round(s / 86400) + "d ago";
};
const newsItemsOf = (d, tk) => {
  const n = d && d.news;
  const list = n && n.on === true && n.items && typeof n.items === "object" ? n.items[tk] : null;
  return Array.isArray(list) ? list.filter((it) => it && typeof it.title === "string" && it.title) : [];
};
// the news dot keeps 12.9's meaning: a holding moving more than news.movePct
// today (a news panel, 12.12, also brings headlines for calmer movers)
const NEWS_MOVE_PCT = 3;
const dayMoves = typeof WeakMap === "function" ? new WeakMap() : null;
const dayMoveOf = (d, tk) => {
  let m = dayMoves ? dayMoves.get(d) : null;
  if (!m) {
    m = {};
    (Array.isArray(d.positions) ? d.positions : []).forEach((p) => {
      if (p && typeof p.ticker === "string" && isFin(p.dayChangePct)) m[p.ticker] = p.dayChangePct;
    });
    if (dayMoves) dayMoves.set(d, m);
  }
  return m[tk];
};
const markNewsOf = (d, tk, move) => {
  const items = newsItemsOf(d, tk);
  if (!items.length) return items;
  const mv = isFin(move) ? move : dayMoveOf(d, tk);
  const lim = isFin(d.news.movePct) ? d.news.movePct : NEWS_MOVE_PCT;
  return isFin(mv) && Math.abs(mv) > lim ? items : [];
};
// the news panel's rows: the stock open in this window first, then news.top
// (or, from a tracker without it, the tickers with headlines by |day %|);
// up to NEWS_KEEP headlines each
const NEWS_KEEP = 3;
const newsFeedOf = (d, state) => {
  const out = [], seen = {}, since = Date.now() / 1000 - NEWS_STALE_S;
  const add = (tk, items) => {
    if (seen[tk]) return;
    seen[tk] = true;
    // a thinly covered stock's newest Yahoo item can be months old: not shown here (13.3)
    items.filter((it) => it && typeof it.title === "string" && it.title && (!isFin(it.time) || it.time >= since)).slice(0, NEWS_KEEP)
      .forEach((it) => out.push({ tk: tk, it: it }));
  };
  const tk = state.focusTicker;
  const nw = tk ? newsOf(state, tk) : null;
  const own = nw && Array.isArray(nw.items) ? nw.items : [];
  if (tk && (own.length || newsItemsOf(d, tk).length)) add(tk, own.length ? own : newsItemsOf(d, tk));
  const n = d && d.news && d.news.on === true && d.news.items && typeof d.news.items === "object" ? d.news : null;
  if (n) {
    const mv = (t) => { const v = dayMoveOf(d, t); return isFin(v) ? Math.abs(v) : -1; };
    const top = Array.isArray(n.top) ? n.top.filter((t) => typeof t === "string")
      : Object.keys(n.items).sort((a, b) => mv(b) - mv(a) || (a < b ? -1 : a > b ? 1 : 0));
    top.forEach((t) => add(t, newsItemsOf(d, t)));
  }
  return { rows: out, busy: !!(nw && nw.busy) };
};

// ---- the news page (13.1): a window whose `news` options are set (newsCfgOf).
// The keyword in force: the one typed in the panel while cfg.q is still what
// it was typed over, else cfg.q (the editor or the file changed it).
const newsQueryOf = (state, cfg) => (typeof state.newsQuery === "string" && state.newsQFrom === cfg.q ? state.newsQuery : cfg.q);
// today's move of a held OR watched ticker
const newsMoveOf = (d, tk) => {
  const v = dayMoveOf(d, tk);
  if (isFin(v)) return v;
  const w = (Array.isArray(d.watchlist) ? d.watchlist : []).find((x) => x && x.ticker === tk);
  return w && isFin(w.dayChangePct) ? w.dayChangePct : undefined;
};
const heldTickers = (d) => (Array.isArray(d.positions) ? d.positions : [])
  .filter((p) => p && typeof p.ticker === "string" && p.watch !== true && (isFin(p.shares) ? p.shares > 0 : isFin(p.qty) && p.qty > 0)).map((p) => p.ticker);
const watchTickers = (d) => (Array.isArray(d.watchlist) ? d.watchlist : []).filter((w) => w && typeof w.ticker === "string").map((w) => w.ticker);
const NEWS_SPAN_DAYS = { day: 1, "3d": 3, week: 7 };
const NEWS_SPAN_TEXT = { day: "today", "3d": "in the last 3 days", week: "this week" };
const NEWS_SPAN_CHIP = { day: "last day", "3d": "3 days", week: "week" };
const NEWS_SPAN_TIP = { day: "today", "3d": "last 3 days", week: "last week", all: "any time" };
const NEWS_SCOPE_TEXT = { movers: "today's movers", holdings: "every holding", watch: "watchlist", all: "holdings + watchlist" };
const NEWS_SORT_TIP = { new: "newest first", move: "biggest movers first", ticker: "A–Z" };
// the dedupe key: the url without its utm_* parameters, else the title
const newsKey = (it) => {
  if (typeof it.url === "string" && it.url) {
    const q = it.url.indexOf("?");
    if (q < 0) return "u:" + it.url;
    const rest = it.url.slice(q + 1).split("&").filter((p) => p.slice(0, 4).toLowerCase() !== "utm_");
    return "u:" + it.url.slice(0, q) + (rest.length ? "?" + rest.join("&") : "");
  }
  return "t:" + String(it.title).trim().toLowerCase();
};
const az = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const newsT = (r) => (isFin(r.time) ? r.time : -1e15);
const timeDesc = (a, b) => newsT(b) - newsT(a);
// scope → mute → span → keyword → cfg.per per ticker → dedupe → sort → group
const newsPageFeed = (d, state, cfg) => {
  const n = d && d.news && d.news.on === true && d.news.items && typeof d.news.items === "object" ? d.news : null;
  const top = n && Array.isArray(n.top) ? n.top.filter((t) => typeof t === "string") : [];
  const focus = typeof state.focusTicker === "string" && state.focusTicker ? state.focusTicker : null;
  let scope, scopeEmpty = false;
  if (cfg.scope === "holdings") scope = heldTickers(d);
  else if (cfg.scope === "watch") { scope = watchTickers(d); scopeEmpty = !scope.length; }
  else if (cfg.scope === "all") scope = heldTickers(d).concat(watchTickers(d));
  else if (cfg.scope === "pick") { scope = cfg.tickers.slice(); scopeEmpty = !scope.length; }
  else { scope = top.slice(); scopeEmpty = !top.length; if (focus && scope.indexOf(focus) < 0) scope.unshift(focus); }
  const seenTk = {};
  scope = scope.filter((t) => !seenTk[t] && (seenTk[t] = true));
  const muted = {};
  cfg.mute.forEach((t) => { muted[t] = true; });
  const live = scope.filter((t) => !muted[t]);
  const q = newsQueryOf(state, cfg).toLowerCase();
  const now = Date.now() / 1000, spanS = NEWS_SPAN_DAYS[cfg.span] ? NEWS_SPAN_DAYS[cfg.span] * 86400 : 0;
  const nw = focus && cfg.scope === "movers" ? newsOf(state, focus) : null;
  const own = nw && Array.isArray(nw.items) ? nw.items.filter((it) => it && typeof it.title === "string" && it.title) : [];
  let nItems = 0, nSpan = 0, nQ = 0;
  const byKey = {}, rows = [];
  live.forEach((tk) => {
    let list = tk === focus && own.length ? own : newsItemsOf(d, tk);
    nItems += list.length;
    if (spanS) list = list.filter((it) => isFin(it.time) && now - it.time <= spanS);
    nSpan += list.length;
    if (q) list = list.filter((it) => it.title.toLowerCase().indexOf(q) >= 0 ||
      (typeof it.source === "string" && it.source.toLowerCase().indexOf(q) >= 0) || tk.toLowerCase().indexOf(q) >= 0);
    nQ += list.length;
    list.slice(0, cfg.per).forEach((it) => {
      const k = newsKey(it);
      let r = byKey[k];
      if (!r) {
        r = byKey[k] = { title: it.title, source: typeof it.source === "string" ? it.source : "", time: isFin(it.time) ? it.time : null,
          url: typeof it.url === "string" ? it.url : "", tickers: [], move: null };
        rows.push(r);
      }
      if (r.tickers.indexOf(tk) < 0) r.tickers.push(tk);
    });
  });
  // market feeds (13.3): rows tagged "@id"; muted / narrowed like a ticker
  const feedsOn = cfg.market.filter((f) => NEWS_FEEDS[f] && !muted["@" + f]);
  feedsOn.forEach((f) => {
    const key = "@" + f;
    let list = newsItemsOf(d, key);
    nItems += list.length;
    if (spanS) list = list.filter((it) => isFin(it.time) && now - it.time <= spanS);
    nSpan += list.length;
    if (q) list = list.filter((it) => it.title.toLowerCase().indexOf(q) >= 0 || NEWS_FEEDS[f].toLowerCase().indexOf(q) >= 0);
    nQ += list.length;
    list.slice(0, cfg.per).forEach((it) => {
      const k = newsKey(it);
      let r = byKey[k];
      if (!r) {
        r = byKey[k] = { title: it.title, source: typeof it.source === "string" ? it.source : "", time: isFin(it.time) ? it.time : null,
          url: typeof it.url === "string" ? it.url : "", tickers: [], move: null };
        rows.push(r);
      }
      if (r.tickers.indexOf(key) < 0) r.tickers.push(key);
    });
  });
  const liveAll = live.concat(feedsOn.map((f) => "@" + f));
  rows.forEach((r) => {
    r.tickers.sort((a, b) => (isFeedKey(a) ? 1 : 0) - (isFeedKey(b) ? 1 : 0) || az(a, b));
    r.move = r.tickers.reduce((m, t) => { const v = newsMoveOf(d, t); return isFin(v) && (m === null || Math.abs(v) > Math.abs(m)) ? v : m; }, null);
  });
  const focusFirst = (a, b) => (focus ? (b.tickers.indexOf(focus) >= 0 ? 1 : 0) - (a.tickers.indexOf(focus) >= 0 ? 1 : 0) : 0);
  const moveDesc = (a, b) => (a.move === null ? 1 : 0) - (b.move === null ? 1 : 0) || (a.move === null ? 0 : Math.abs(b.move) - Math.abs(a.move));
  if (cfg.sort === "new") rows.sort((a, b) => timeDesc(a, b) || az(a.tickers[0], b.tickers[0]) || az(a.title, b.title));
  else if (cfg.sort === "ticker") rows.sort((a, b) => az(a.tickers[0], b.tickers[0]) || timeDesc(a, b));
  else rows.sort((a, b) => focusFirst(a, b) || moveDesc(a, b) || az(a.tickers[0], b.tickers[0]) || timeDesc(a, b));
  let entries;
  if (cfg.group) {
    const order = [], grp = {};
    rows.forEach((r) => r.tickers.forEach((t) => {
      if (!grp[t]) { grp[t] = []; order.push(t); }
      grp[t].push(r);
    }));
    entries = [];
    order.forEach((t) => {
      const g = grp[t].slice().sort(timeDesc);
      entries.push({ kind: "head", tk: t, move: newsMoveOf(d, t), n: g.length });
      g.forEach((r) => entries.push({ kind: "story", row: r, tags: r.tickers.filter((x) => x !== t) }));
    });
  } else entries = rows.map((r) => ({ kind: "story", row: r, tags: r.tickers }));
  const inScope = (list) => (n && isFin(n.keep) && Array.isArray(list) ? list.filter((t) => typeof t === "string" && liveAll.indexOf(t) >= 0).sort(az) : []);
  const tks = {};
  rows.forEach((r) => r.tickers.forEach((t) => { tks[t] = true; }));
  return { rows: rows, entries: entries, pending: inScope(n && n.pending), failed: inScope(n && n.failed),
    counts: { stories: rows.length, tickers: Object.keys(tks).length },
    updated: n && isFin(n.fetchedAt) ? n.fetchedAt : null, capped: !!(n && isFin(n.keep) && n.keep < cfg.per),
    scopeEmpty: scopeEmpty && !feedsOn.length, allMuted: scope.length > 0 && !live.length && !feedsOn.length, planned: liveAll.length,
    spanHid: nItems > 0 && nSpan === 0, qHid: nSpan > 0 && nQ === 0, busy: !!(nw && nw.busy) };
};
// pages of `per` entries; a heading that would fill a page's last slot moves on with its stories
const pageEntries = (entries, per) => {
  const pages = [];
  let cur = [];
  entries.forEach((e) => {
    if (cur.length >= per || (e.kind === "head" && per > 1 && cur.length === per - 1)) { pages.push(cur); cur = []; }
    cur.push(e);
  });
  if (cur.length || !pages.length) pages.push(cur);
  return pages;
};
const newsRowCss = css`
  & .pw-mute { visibility: hidden; color: ${C.dim}; cursor: pointer; margin-left: 3px; }
  &:hover .pw-mute { visibility: visible; }
  & .pw-mute:hover { color: ${C.ink}; }
`;
const newsTagCss = css`
  cursor: pointer;
  &:hover { color: ${C.ink}; text-decoration: underline; }
`;
const newsChipCss = css`
  font-family: "SF Mono", Menlo, monospace;
  font-size: 8px; color: ${C.dim}; cursor: pointer; padding: 0 3px; border-radius: 3px;
  background: rgba(var(--pw-fg), 0.06); white-space: nowrap;
  &:hover { color: ${C.ink}; }
`;

// bell after a ticker that has price alerts (amber once one has fired)
const Bell = ({ rules }) => (!rules || !rules.length ? null : (
  <span title={"price alerts:\n" + rules.map(ruleLine).join("\n")}
    style={{ color: rules.some((r) => r.status === "fired") ? C.amber : C.dim, fontSize: 8, marginLeft: 2 }}>⍾</span>
));
// a ticker cell with a bell / news dot: the markers keep their room and a
// long ticker gives way (ends in …); without them the cell is as in 12.8
// (whether a row has them: marksOf in renderWin, as row.bell / row.news allow)
const withMarks = (on, style) => (on ? Object.assign({}, style, { display: "flex", alignItems: "baseline" }) : style);
const TICKER_SHRINK = { minWidth: 0, flex: "0 1 auto", overflow: "hidden", textOverflow: "ellipsis" };
// amber dot on a big mover that has headlines; hover = the newest one
const NewsMark = ({ items }) => (!items || !items.length ? null : (
  <span title={items[0].title + (items[0].source ? "\n" + items[0].source : "") + (isFin(items[0].time) ? " · " + agoText(items[0].time) : "")}
    style={{ color: C.amber, fontSize: 9, marginLeft: 2 }}>•</span>
));

const xBtn = css`
  cursor: pointer; color: ${C.dim}; padding: 0 2px; margin-left: 4px;
  &:hover { color: ${C.ink}; }
`;
const RuleRow = ({ r, dispatch, busy, long }) => (
  <div className={rowFlex} style={{ marginTop: 2 }}>
    <span className={mono} style={{ fontSize: 9, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}
      title={r.id}>
      {ruleLabel(r)}
    </span>
    <span className={mono} style={{ fontSize: 9, whiteSpace: "nowrap" }}>
      <span style={{ color: statusColor(r.status) }} title={statusTip(r)}>{r.status || "new"}</span>
      {!long && r.status === "armed" && isFin(r.distancePct) ? <span style={{ color: C.dim }}>{" · " + Math.abs(r.distancePct).toFixed(1) + "% away"}</span> : null}
      <span className={xBtn} title={busy ? "working…" : "remove this alert"}
        onClick={() => { if (!busy) removeAlert(r.id, dispatch); }}>×</span>
    </span>
  </div>
);

// detail view: the "alert at…" box, this stock's rules, and (opt-in) headlines
// (alerts / news false: that part is switched off in this window, 12.12)
const DetailExtras = ({ p, d, state, dispatch, alerts, news }) => {
  const held = p.shares !== undefined && p.shares !== null;
  // no purchase price or date: the cost is today's price, a % from it stays 0
  const pctOk = held && p.costUnknown !== true;
  const rules = rulesFor(d, p.ticker);
  const on = newsOn(state);
  const nw = newsOf(state, p.ticker);
  const items = nw ? (nw.items || []).filter((it) => it && typeof it.title === "string" && it.title).slice(0, 3) : [];
  return (
    <div style={{ marginTop: 8 }}>
      {alerts === false ? null : [   // (a list, not a wrapper: the 12.11 tree stays as it was)
      <div key="box" className={rowFlex}>
        <input className={inputCss} style={{ flex: 1, minWidth: 0 }} value={state.alertInput}
          placeholder={"alert at… 400" + (pctOk ? " or -20%" : "") + (p.currency ? " (" + p.currency + ")" : "")}
          title={"a price: notified once when it crosses (above or below today's " + num(p.price, 2) + ")" +
            (pctOk ? "\n-20% = when your P&L on it reaches −20% from your average cost" : "")}
          onChange={(ev) => dispatch({ type: "SET_ALERT_INPUT", value: ev.target.value })}
          onKeyDown={(ev) => { if (isEnter(ev)) submitAlert(state, p, held, dispatch); }} />
        <span className={tabBtn} style={{ opacity: state.alertBusy ? 0.5 : 1 }}
          onClick={() => submitAlert(state, p, held, dispatch)}>set</span>
      </div>,
      state.alertMsg ? (
        <div key="msg" className={css`${mono} font-size:8.5px; color:${/^error/.test(state.alertMsg) ? C.down : C.amber}; margin-top:3px;`}>{state.alertMsg}</div>
      ) : null,
      rules.map((r) => <RuleRow key={r.id} r={r} dispatch={dispatch} busy={state.alertBusy} long={false} />),
      ]}
      {news === false ? null : (
      <div style={{ marginTop: alerts === false ? 0 : 6 }}>
        {!on ? (
          <div className={css`${mono} font-size:8.5px; color:${C.dim};`}>
            headlines off · <span className={linkBtn} style={{ fontSize: 8.5 }} title="show the latest headlines for the stock you open and for big movers (_settings.news)"
              onClick={() => { savePref("news", true, dispatch).then(() => loadNews(p.ticker, dispatch)); }}>turn on</span>
          </div>
        ) : nw && nw.busy ? (
          <div className={css`${mono} font-size:8.5px; color:${C.dim};`}>loading headlines…</div>
        ) : items.length ? items.map((it, i) => {
          const cmd = openCmd(it.url);
          return (
            <div key={i} style={{ marginTop: i ? 3 : 0, lineHeight: 1.25 }}>
              <div style={{ fontSize: 9.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                cursor: cmd ? "pointer" : "default", color: C.ink }}
                title={it.title + (cmd ? "\nclick to open " + it.url : "")}
                onClick={() => { if (cmd) run(cmd).catch(() => {}); }}>{it.title}</div>
              <div className={css`${mono} font-size:8px; color:${C.dim};`}>
                {[typeof it.source === "string" ? it.source : null, agoText(it.time) || null].filter((x) => x).join(" · ")}
              </div>
            </div>
          );
        }) : nw ? (
          <div className={css`${mono} font-size:8.5px; color:${C.dim};`}>{nw.error || "no headlines right now"}</div>
        ) : null}
      </div>
      )}
    </div>
  );
};

// right column: every price alert, with remove buttons
const ALERT_ROWS = 5;
const PriceAlertsPanel = ({ d, state, dispatch, first, pw }) => {
  const rules = alertRulesOf(d);
  const invalid = d && d.priceAlerts && isFin(d.priceAlerts.invalid) ? d.priceAlerts.invalid : 0;
  if (!rules.length && !invalid) return null;
  const shown = state.alertsExpanded ? rules : rules.slice(0, ALERT_ROWS);
  return (
    <div className={first ? "" : sectionGap} {...(pw || {})}>
      <div className={rowFlex}>
        <span className={eyebrow} title="_alerts in positions.json — add one in a stock's detail view">price alerts {rules.length}</span>
        {invalid > 0 ? (
          <span className={css`${mono} font-size: 8px; color: ${C.dim};`} title="entries in _alerts that were skipped (bad ticker, kind or value)">
            {invalid} invalid in positions.json</span>
        ) : null}
      </div>
      {state.alertMsg && !state.focusTicker ? (
        <div className={css`${mono} font-size:8.5px; color:${/^error/.test(state.alertMsg) ? C.down : C.amber}; margin-top:3px;`}>{state.alertMsg}</div>
      ) : null}
      {shown.map((r) => <RuleRow key={r.id} r={r} dispatch={dispatch} busy={state.alertBusy} long={true} />)}
      {rules.length > ALERT_ROWS ? (
        <div style={{ marginTop: 3 }}>
          <span className={linkBtn} style={{ fontSize: 8 }} onClick={() => dispatch({ type: "TOGGLE_ALERTS_EXPANDED" })}>
            {state.alertsExpanded ? "fewer" : "all " + rules.length}</span>
        </div>
      ) : null}
    </div>
  );
};

// one line of "alerts · last 7 days": a price alert (kind, 12.9) or a big daily move
const AlertLogText = ({ a }) => {
  const val = isFin(a.value) ? num(a.value, 2) : null;
  switch (a.kind) {
    case "above": case "below":
      return (<span>{a.ticker} <span style={{ color: a.kind === "above" ? C.up : C.down }}>{(a.kind === "above" ? "↑" : "↓") + fmtLevel(a.level)}</span>
        {val ? <span style={{ color: C.dim }}> ({val})</span> : null}</span>);
    case "pctFromCost":
      return (<span title={isFin(a.pct) ? signedPctText(a.pct) + " vs your average cost" : undefined}>{a.ticker} <span style={{ color: upDown(a.level || 0) }}>
        {signedPctText(a.level)}</span> from cost</span>);
    case "drawdownPct":
      return (<span title={isFin(a.pct) ? "down " + Math.abs(a.pct) + "% from the peak" : undefined}>portfolio drawdown <span style={{ color: C.down }}>
        {(isFin(a.level) ? Math.abs(a.level) : "—") + "%"}</span></span>);
    default:
      return (<span>{a.ticker} {String(a.kind)}</span>);
  }
};

// ------------------------------------------------------------------ sections
const SectionToday = ({ d }) => (
  <div>
    <div className={css`display:flex; gap:12px; margin-top:5px;`}>
      {[d.movers && d.movers.up, d.movers && d.movers.down].map((list, col) => (
        <div key={col} className={css`flex:1;`}>
          {(list || []).map((m) => (
            <div key={m.ticker} className={rowFlex} style={{ marginBottom: 2 }}>
              <span className={mono} style={{ fontSize: 10 }}>{m.ticker}<NewsMark items={markNewsOf(d, m.ticker, m.dayChangePct)} /></span>
              <span className={mono} style={{ fontSize: 10, color: upDown(m.dayChangeValue) }}>
                {signedMoney(m.dayChangeValue)} <span style={{ color: C.dim }}>{pct(m.dayChangePct)}</span>
              </span>
            </div>
          ))}
        </div>
      ))}
    </div>
    <div className={css`display:flex; height:6px; border-radius:3px; overflow:hidden; margin-top:8px;`}
      title="your five biggest holdings as a share of the total">
      {(d.concentration ? d.concentration.top : []).map((c, i) => (
        <div key={c.ticker} title={c.ticker + " " + c.weightPct + "%"}
          style={{ width: c.weightPct + "%", background: C.ink, opacity: 0.85 - i * 0.14 }} />
      ))}
      <div style={{ flex: 1, background: C.faint }} />
    </div>
    <div className={css`${mono} font-size: 8px; color: ${C.dim}; margin-top: 3px;`}>
      {(d.concentration ? d.concentration.top : [])
        .map((c) => c.ticker + " " + c.weightPct + "%").join("  ")}
      {d.concentration ? "  · top 5 = " + d.concentration.topPct + "%" : ""}
    </div>
  </div>
);

const scoreOf = (v) => (v === null || v === undefined ? null : Math.max(1, Math.min(10, Math.ceil(v / 10))));

const SectionThemes = ({ d, range, dispatch, w }) => {
  const sec = d.sectors && d.sectors[range];
  const byName = {};
  ((sec && sec.themes) || []).forEach((t) => { byName[t.name] = t.pct; });
  const tOn = targetsOn(d);
  return (
    <div>
      {(d.themes || []).map((t) => {
        const ser = byName[t.name];
        const over = ser && ser.length ? ser[ser.length - 1] : null;
        // a sector target (12.10): a tick on the weight bar, target and drift in the title
        const tgt = tOn && typeof t.targetPct === "number" && isFinite(t.targetPct) ? t.targetPct : null;
        return (
          <div key={t.name} className={rowFlex} style={{ marginTop: 4, cursor: "pointer" }}
            title={t.name + (over !== null ? ": " + pct(over) + " over " + range : "") +
              (tgt !== null ? " · target " + fmtTarget(tgt) + " · drift " + fmtPts(t.driftPct) + " pts" : "") + " — click to see its graph"}
            onClick={() => dispatch({ type: "SET_SECTOR_FOCUS", name: ser ? t.name : byName.Other ? "Other" : null })}>
            <span style={{ fontSize: 10, width: 78, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.name}</span>
            {w && w < LAYOUT_K.THEME_MIN ? null : <Spark values={ser ? ser.filter((v) => v !== null && v !== undefined) : null} />}
            <div className={css`flex:1; min-width:14px; height:3px; background:${C.faint}; border-radius:2px; margin:0 6px;`}
              style={tgt !== null ? { position: "relative" } : undefined}>
              <div style={{ width: Math.min(100, t.weightPct) + "%", height: "100%",
                background: C.dim, borderRadius: 2 }} />
              {tgt !== null ? (
                <div style={{ position: "absolute", left: Math.min(100, tgt) + "%", top: -2, width: 1, height: 7,
                  marginLeft: -0.5, background: t.driftPct > bandOf(d) ? C.orange : C.ink, opacity: 0.9 }} />
              ) : null}
            </div>
            <span className={mono} style={{ fontSize: 9, color: C.dim, width: 92, textAlign: "right", whiteSpace: "nowrap" }}>
              {money(t.value)} <span style={{ color: upDown(t.dayChangePct || 0) }}>{pct(t.dayChangePct)}</span>
            </span>
            <span style={{ marginLeft: 6 }}><VolBadge pct={t.volPct} score={scoreOf(t.volPct)} /></span>
          </div>
        );
      })}
    </div>
  );
};

// The table twin of the value graph: what the portfolio was worth at the end
// of each day, newest first. Click a row to pin that day on the graph.
const SectionDays = ({ d, state, dispatch, daily, rows: perPage }) => {
  const DAY_ROWS = perPage || LAYOUT_K.ROWS.days;   // rows per page (layoutFor: 10 with fit-content height)
  if (!daily.length) {
    return <div className={css`font-size:10px; color:${C.dim}; margin-top:5px;`}>day-by-day values arrive with the next refresh</div>;
  }
  const steps = d.basisSteps || [];
  const baseAt = (t) => {
    let b = 0;
    for (let i = 0; i < steps.length && steps[i][0] <= t; i++) b = steps[i][1];
    return b;
  };
  const rows = daily.slice().reverse();
  const pages = Math.ceil(rows.length / DAY_ROWS);
  const page = Math.min(state.dayPage, pages - 1);
  const more = olderAvailable(d, daily);                 // the full table goes back further
  const total = canLoadOlder(d) ? Math.max(d.dailyTotal, daily.length) : daily.length;
  const shown = rows.slice(page * DAY_ROWS, (page + 1) * DAY_ROWS);
  const thisYear = String(new Date().getFullYear());
  const label = (iso) => new Date(iso + "T12:00:00").toLocaleDateString(LOCALE,
    iso.slice(0, 4) === thisYear ? { weekday: "short", month: "short", day: "numeric" }
      : { month: "short", day: "numeric", year: "numeric" });
  return (
    <div style={{ marginTop: 3 }}>
      {shown.map((r, i) => {
        const prev = rows[page * DAY_ROWS + i + 1];
        let chg = null, chgPct = null;
        if (prev) {                       // day's gain with new buys taken out
          const flow = baseAt(r[1]) - baseAt(prev[1]);
          chg = r[2] - prev[2] - flow;
          const denom = prev[2] + flow / 2;
          chgPct = denom > 0 ? (chg / denom) * 100 : null;
        }
        const picked = state.mark && state.mark.d === r[0];
        return (
          <div key={r[0]} className={rowFlex}
            title={(r[3] ? "≈ from that day's closing prices and the shares you held then" : "recorded by the widget at " + fmtTime(r[1])) + " — click to pin it on the graph"}
            onClick={() => dispatch(picked ? { type: "SET_MARK", mark: null }
              : { type: "PICK_DAY", mark: dayMark(r), range: pickRange(r[1], d) })}
            style={{ marginTop: 3, cursor: "pointer", borderRadius: 3, padding: "0 2px",
              background: picked ? "rgba(var(--pw-fg),0.08)" : "transparent" }}>
            <span className={mono} style={{ fontSize: 9.5, color: C.dim, width: 84, whiteSpace: "nowrap" }}>{label(r[0])}</span>
            <span className={mono} style={{ fontSize: 9.5 }}>
              {r[3] ? <span style={{ color: C.dim }}>≈ </span> : null}{money(r[2], true)}
            </span>
            <span className={mono} style={{ fontSize: 9, width: 104, textAlign: "right", whiteSpace: "nowrap", color: chg === null ? C.dim : upDown(chg) }}>
              {chg === null ? "" : pct(chgPct)}<span style={{ color: C.dim }}>{chg === null ? "" : " " + signedMoney(chg)}</span>
            </span>
          </div>
        );
      })}
      <div className={rowFlex} style={{ marginTop: 5 }}>
        <span className={linkBtn} style={{ visibility: page > 0 ? "visible" : "hidden" }}
          onClick={() => dispatch({ type: "SET_DAY_PAGE", page: page - 1 })}>‹ newer</span>
        <span className={css`${mono} font-size: 8px; color: ${C.dim};`}>
          {state.older.msg && state.older.key === dailyKey(d) ? <span style={{ color: C.amber }}>{state.older.msg}</span>
            : total > daily.length ? daily.length + " of " + total + " days · or type a date above"
            : daily.length + " days · or type a date above the graph"}
        </span>
        <span className={linkBtn} style={{ visibility: page < pages - 1 || more ? "visible" : "hidden" }}
          title={page < pages - 1 ? "" : "load " + OLDER_CHUNK + " older days"}
          onClick={() => {
            if (page < pages - 1) return dispatch({ type: "SET_DAY_PAGE", page: page + 1 });
            if (!more || state.older.busy) return null;
            return loadOlder(d, daily, OLDER_CHUNK, dispatch, (all) => {
              if (all) dispatch({ type: "SET_DAY_PAGE", page: page + 1 });
            });
          }}>{page >= pages - 1 && state.older.busy ? "loading…" : "older ›"}</span>
      </div>
    </div>
  );
};

const SectionRisk = ({ d }) => {
  const r = d.risk || {};
  const diversified = r.volPct && r.avgHoldingVolPct
    ? Math.round((1 - r.volPct / r.avgHoldingVolPct) * 100) : null;
  const chips = (list) => (list || []).map((p) => (
    <span key={p.ticker} className={mono} style={{ fontSize: 9.5, marginRight: 8 }}>
      {p.ticker} <VolBadge pct={p.volPct} score={p.volScore} />
    </span>
  ));
  // 12.8: drawdown · beta · sharpe, real (after 30 days of dated history) and backtest
  const perf = d.performance && typeof d.performance === "object" ? d.performance : null;
  const real = perf && perf.ok === true && r.real && typeof r.real === "object" ? r.real : null;
  const bt = r.backtest && typeof r.backtest === "object" ? r.backtest : null;
  const why = perfWhy(perf);
  const rfTxt = (f) => (isFin(f.riskFreePct) ? f.riskFreePct : 4) + "%";
  const ddOf = (f) => (f.drawdown && typeof f.drawdown === "object" ? f.drawdown : {});
  const figTip = (f) => "annual return " + pct1(f.annualReturnPct) + " · volatility " +
    (isFin(f.volPct) ? f.volPct + "%/yr" : "—") + "\nsharpe = (annual return − " + rfTxt(f) + ") ÷ volatility" +
    "\nbeta = how much it moved per 1% move of " + (f.betaVs || "the index") + " (1 = in step)";
  const realDd = real ? ddOf(real) : {};
  // the lines are nowrap in a ~300 px column: dates that don't fit go to the tooltip
  const leftOut = perf && Array.isArray(perf.twrLeftOut) ? perf.twrLeftOut.filter((t) => typeof t === "string") : [];
  const realNote = "\n(holdings only: cash left out" + (leftOut.length ? "; without " + leftOut.join(", ") + ": sold, no prices" : "") + ")";
  const btDd = bt ? ddOf(bt) : {};
  const riskLine = css`${mono} font-size: 9px; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;`;
  return (
    <div style={{ marginTop: 4 }}>
      {real ? (
        <div className={riskLine}
          title={"drawdown = how far below its best level the portfolio is (returns time-weighted: new money taken out)" +
            (realDd.peakDate ? "\nnow " + pct1(realDd.currentPct) + " from its peak of " + fmtIsoY(realDd.peakDate) : "") +
            (realDd.maxPeakDate ? "\nworst fall: from " + fmtIsoY(realDd.maxPeakDate) + " to " + fmtIsoY(realDd.maxDate) +
              (realDd.recoveredDate ? ", back at that level " + fmtIsoY(realDd.recoveredDate) : ", not recovered yet") : "") + realNote}>
          {"drawdown " + (isFin(realDd.currentPct) && realDd.currentPct > -0.05 ? "0.0% (at peak)" : pct1(realDd.currentPct)) +
            " · max " + pct1(realDd.maxPct) + (realDd.maxDate ? " (" + fmtIsoY(realDd.maxDate) + ")" : "")}
        </div>
      ) : null}
      {real ? (
        <div className={riskLine} title={figTip(real) + "\nsince " + fmtIsoY(real.start) + ", time-weighted daily values" + realNote}>
          {"beta " + num2(real.beta) + (real.betaVs ? " vs " + real.betaVs : "") + " · sharpe " + num2(real.sharpe)}
        </div>
      ) : why ? (
        <div className={css`${mono} font-size: 8.5px; color: ${C.dim}; margin-top: 2px;`}
          title="these figures need at least 30 days of dated purchases, with a price for every purchase and sale">
          {why}
        </div>
      ) : null}
      {bt ? (
        <div className={css`${riskLine} font-size: 8.5px; color: ${C.dim};`}
          title={"today's holdings (share counts now) priced back, prices only; hindsight flatters this\n" + figTip(bt) +
            (btDd.maxDate ? "\nmax drawdown " + pct1(btDd.maxPct) + ", on " + fmtIsoY(btDd.maxDate) : "")}>
          {String(bt.label || "backtest").replace(", ", " ") + ": max dd " + pct1(btDd.maxPct) +
            " · beta " + num2(bt.beta) + " · sharpe " + num2(bt.sharpe)}
        </div>
      ) : null}
      <div className={rowFlex} style={real || why || bt ? { marginTop: 5 } : undefined}
        title={volTip(r.volPct, r.volScore) + "\n(the portfolio as a whole, holdings as they are now)"}>
        <span style={{ fontSize: 10 }}>portfolio</span>
        <span className={mono} style={{ fontSize: 10 }}>
          {r.volScore ? (
            <span>
              <span style={{ color: volColor(r.volScore) }}>{r.volScore}/10 {VOL_LABEL[r.volScore]}</span>
              {" · " + r.volPct + "%/yr "}
              <VolMeter score={r.volScore} />
            </span>
          ) : "—"}
        </span>
      </div>
      <div className={css`${mono} font-size: 8.5px; color: ${C.dim}; margin-top: 3px;`}
        title="the average holding swings more than the whole portfolio: holdings don't all move together">
        avg holding {r.avgHoldingVolPct ? r.avgHoldingVolPct + "%" : "—"}
        {diversified !== null && diversified > 0 ? " · mix swings " + diversified + "% less than its parts" : ""}
        {r.wildSharePct ? " · " + r.wildSharePct + "% in scores 7+" : ""}
      </div>
      <div className={rowFlex} style={{ marginTop: 6 }}>
        <span className={eyebrow}>wildest</span>
        <span>{chips(r.mostVolatile)}</span>
      </div>
      <div className={rowFlex} style={{ marginTop: 4 }}>
        <span className={eyebrow}>calmest</span>
        <span>{chips(r.calmest)}</span>
      </div>
      {r.unscored && r.unscored.length ? (
        <div className={css`${mono} font-size: 8px; color: ${C.dim}; margin-top: 4px;`}>
          no score yet (short history): {r.unscored.slice(0, 5).join(" ")}
        </div>
      ) : null}
    </div>
  );
};

const LoadingLine = ({ progress }) => {
  const done = progress ? progress.done : 0;
  const total = progress && progress.total ? progress.total : 1;
  return (
    <div style={{ marginTop: 6 }}>
      <div className={css`height:2px; background:${C.faint}; border-radius:1px;`}>
        <div style={{ width: Math.min(100, (done / total) * 100) + "%",
          height: "100%", background: C.ink, borderRadius: 1,
          transition: "width 0.4s" }} />
      </div>
      <div className={css`${mono} font-size: 8px; color: ${C.dim}; margin-top: 2px;`}>
        refreshing {done}/{total}{progress && progress.current ? " · " + progress.current : ""}
      </div>
    </div>
  );
};

const sortRows = (rows, sort) => {
  const out = rows.slice();
  const key = {
    value: (p) => -(p.value || 0),
    day: (p) => -(p.dayChangePct === null || p.dayChangePct === undefined ? -1e9 : p.dayChangePct),
    vol: (p) => -(p.volPct === null || p.volPct === undefined ? -1 : p.volPct),
  }[sort];
  if (key) out.sort((a, b) => key(a) - key(b) || (a.ticker < b.ticker ? -1 : 1));
  return out;
};

// ------------------------------------------------------------------ layout (12.12)
// What a window shows at its size is decided by ONE pure function,
// layoutFor(win, ctx, K): no DOM measuring (nothing to jitter), widths from
// the window's width and mono text estimates (SF Mono: 0.62 em a glyph),
// heights from K (LAYOUT_K). ctx (renderWin builds it from the data):
//   Wu, Hu (unscaled px; Hu "auto" = fit content), on {id: enabled and has
//   something to show}, order (panel ids, items order), est {panelId: (colW, R)
//   => px} (R = rows per list + map height), lists {holdings, earnings, days,
//   news: counts or null, map: bool}, head [[{id, w}]] (header lines), tabs
//   [px] (the range tab row), big, sector, facets, focusSector, readoutOwnLine,
//   notesForced, benchLine, lateLine, simCap, benchPick, loading, mapWide,
//   expanded, compact, compactW, cellsOn, tOn, undated.
// Auto height: nothing folds, 12.11's rows and graph. Fixed height: fold
// units (priority room < normal < always, then the later one first) until the
// body fits, shrinking the graph, then rows in the tallest column; then grow
// rows and the graph into what is left. Same inputs, same layout.
const PRIO_RANK = { room: 0, normal: 1, always: 2 };
const HEAD_IDS = ["header.value", "header.day", "header.fx", "header.pl", "header.div", "header.realized", "header.totalReturn", "header.annual"];
const GRAPH_PARTS = [["graph.tabs", 11], ["graph.bench", 12], ["graph.backtest", 13], ["graph.late", 14], ["graph.notes", 15]];
const LIST_ORDER = [["holdings", "panel.holdings"], ["earnings", "panel.earnings"], ["days", "panel.days"], ["news", "panel.news"], ["map", "panel.holdings"]];
const monoW = (chars, px, K) => chars * (K || LAYOUT_K).MONO * px;
const clampN = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
// lines needed for items ws packed into lines w wide (a wider item wraps inside itself)
const packLines = (ws, w) => {
  let lines = 0, cur = Infinity;
  ws.forEach((x) => {
    if (!(x > 0)) return;
    if (x > w) { lines += Math.ceil(x / Math.max(1, w)); cur = Infinity; } else if (cur + x > w) { lines++; cur = x; } else cur += x;
  });
  return lines;
};
// a side over m columns, in order: the next column once this one holds its
// share of what is left (and every later column still gets one)
const splitSeq = (units, m, estOf, gap) => {
  const out = [[]];
  const hs = units.map(estOf);
  let rest = hs.reduce((a, b) => a + b, 0), cur = 0;
  units.forEach((u, i) => {
    const col = out[out.length - 1], left = m - out.length + 1;
    if (col.length && left > 1 && (cur >= (rest + cur) / left || units.length - i <= left - 1)) { out.push([u]); cur = hs[i]; }
    else { cur += (col.length ? gap : 0) + hs[i]; col.push(u); }
    rest -= hs[i];
  });
  return out;
};
// holding-row cells that fit width w (ticker and day % always stay)
const rowCells = (w, on, tOn, undated, K) => {
  const C0 = K.CELL;
  const has = { spark: !!on.spark, vol: !!on.vol, drift: !!on.drift && !!tOn, day: on.day !== false,
    value: !!on.value, pl: !!on.pl, price: !!on.price };
  let spark = has.drift ? C0.spark - C0.drift : C0.spark;
  const sum = () => {
    const ks = Object.keys(has).filter((k) => has[k]);
    return C0.ticker + ks.reduce((s, k) => s + (k === "spark" ? spark : C0[k]), 0) + (undated ? ks.length * K.UNDATED_GAP : 0);
  };
  for (let i = 0; i < K.CELL_DROP.length && sum() > Math.floor(w); i++) {
    const step = K.CELL_DROP[i];
    if (step === "spark30") spark = Math.min(spark, K.SPARK_MID);
    else has[step] = false;
  }
  return { cells: has, sparkW: spark };
};
const watchCells = (w, on, K) => {
  const C0 = K.WATCH;
  const has = { spark: !!on.spark, vol: !!on.vol };
  let spark = C0.spark;
  const sum = () => C0.ticker + C0.name + C0.day + C0.price + C0.x + (has.spark ? spark : 0) + (has.vol ? C0.vol : 0);
  for (let i = 0; i < K.WATCH_DROP.length && sum() > Math.floor(w); i++) {
    const step = K.WATCH_DROP[i];
    if (step === "spark30") spark = Math.min(spark, K.SPARK_MID);
    else has[step] = false;
  }
  return { cells: has, sparkW: spark };
};

const layoutFor = (win, ctx, K0) => {
  const K = K0 || LAYOUT_K;
  const w0 = win || {};
  const Wu = ctx.Wu, CW = Wu - K.PAD_X;
  const auto = !isNumber(ctx.Hu);
  const avail = auto ? Infinity : ctx.Hu - K.CHROME;
  const on = ctx.on || {};
  const prioOf = (id) => {
    const p = w0.prio && w0.prio[id];
    return PRIO_RANK[p] !== undefined ? p : (FEATURE_BY[id] && FEATURE_BY[id].p) || "normal";
  };
  const sideOf = (id) => {
    const s = w0.side && w0.side[id];
    return s === "a" || s === "b" ? s : (FEATURE_BY[id] && FEATURE_BY[id].side) || "b";
  };
  const L = { K: K, Wu: Wu, CW: CW, auto: auto, avail: avail, base: CW === K.BASE_CW, show: {}, folded: [], hint: false,
    scroll: false, est: {}, head: [], cols: [], colW: [], flex: [] };
  Object.keys(on).forEach((id) => { if (on[id]) L.show[id] = true; });
  // ---- widths
  const graphW = CW - 2;
  const g = clampN(graphW / K.BASE_GRAPH_W, K.G_MIN, K.G_MAX);
  const graphT = Math.round((ctx.big ? K.GRAPH_H_BIG : K.GRAPH_H) * g);
  L.graphW = graphW;
  L.graphT = graphT;
  L.sectorCols = clampN(Math.floor((graphW + K.SECTOR_GAP) / K.SECTOR_FACET), 1, K.SECTOR_MAXCOLS);
  L.captionW = graphW - K.CAPTION_OFF;
  L.mapBigW = CW + 2;
  const tabsW = (ctx.tabs || []).reduce((a, b) => a + b, 0);
  L.tabWrap = tabsW + K.TAB_BIG > CW;
  L.tabLines = !tabsW ? 1 : L.tabWrap ? packLines(ctx.tabs, CW - K.TAB_RESERVE) : 1;
  if (ctx.compact) {
    // the one-line row: the sparkline gives way first, then the money figure
    const cw = ctx.compactW || 0;
    L.compact = true;
    L.compactSpark = cw + K.COMPACT_SPARK + 8 <= CW ? K.COMPACT_SPARK : cw + K.SPARK_MID + 8 <= CW ? CW - cw - 8 : 0;
    L.compactMoney = cw <= CW;
    return L;
  }
  // ---- header lines (line 1: value + day; then prices/P&L, realized/total, annual)
  const headH = (show, rec) => {
    let h = 0;
    (ctx.head || []).forEach((ln, i) => {
      const ws = ln.filter((it) => show[it.id]).map((it) => it.w);
      if (!ws.length) { if (rec) L.head[i] = 0; return; }
      const n = Math.max(1, packLines(ws, CW));
      if (rec) L.head[i] = n;
      h += i === 0 ? K.HDR1 + (n - 1) * (K.HDR1 - 3) : K.HDRN * n;
    });
    return h;
  };
  // ---- the graph block (or the mini graph that stays when it folds)
  const sectorGridH = ctx.facets > 0
    ? Math.ceil(ctx.facets / L.sectorCols) * K.SECTOR_ROW + (Math.ceil(ctx.facets / L.sectorCols) - 1) * K.SECTOR_ROWGAP : null;
  const graphShrinks = !ctx.sector || !!ctx.focusSector || sectorGridH === null;
  const graphBlockH = (show, gH) => {
    if (!show.graph) return show["graph.mini"] ? K.MINI : 0;
    let h = K.GRAPH_MT;
    if (show["graph.tabs"]) h += K.TABS * L.tabLines + (ctx.readoutOwnLine ? K.READOUT : 0);
    if (ctx.sector && !ctx.focusSector && sectorGridH !== null) h += sectorGridH;
    else h += gH + (ctx.sector && !ctx.focusSector ? 0 : K.AXIS) + (ctx.focusSector ? 15 + (ctx.focusList || 0) : 0);
    if (show["graph.notes"] || ctx.notesForced) h += K.NOTES;
    if ((show["graph.bench"] && ctx.benchLine) || (show["graph.late"] && ctx.lateLine)) h += K.CAPTION;
    if (show["graph.backtest"] && ctx.simCap) h += K.SIMCAP;
    if (show["graph.bench"] && ctx.benchPick) h += K.BENCH_PICK;
    return h;
  };
  // ---- column units: panels in items order; the rotating carousel is one unit
  const rotate = w0.carousel !== "stack";
  const units = [];
  let car = null;
  (ctx.order || []).forEach((id, i) => {
    const f = FEATURE_BY[id];
    if (!on[id] || !f || f.kind !== "panel") return;
    const picked = !!(w0.side && (w0.side[id] === "a" || w0.side[id] === "b"));
    if (f.car && rotate) {
      if (!car) { car = { key: "carousel", ids: [], side: sideOf(id), pos: 100 + i, p: prioOf(id), free: !picked }; units.push(car); }
      car.ids.push(id);
      if (picked) { car.free = false; car.side = sideOf(id); }
      if (PRIO_RANK[prioOf(id)] > PRIO_RANK[car.p]) car.p = prioOf(id);
    } else units.push({ key: id, ids: [id], side: sideOf(id), pos: 100 + i, p: prioOf(id),
      free: !picked && id !== "panel.holdings" });
  });
  const estId = (id, w, R) => (ctx.est && ctx.est[id] ? ctx.est[id](w, R) : K.EYEBROW);
  const uEst = (u, w, R) => u.ids.reduce((m, id) => Math.max(m, estId(id, w, R)), 0);
  const R0 = { holdings: K.ROWS.holdings, earnings: K.ROWS.earnings, days: K.ROWS.days, news: K.ROWS.news, map: K.MAP_H };
  const assign = (us) => {
    let n = Math.min(CW >= K.COL3 ? 3 : CW >= K.COL2 ? 2 : 1, us.length);
    if (!n) return { cols: [], colW: [], flex: [], unitW: CW };
    const uw = (m) => (CW - K.GUTTER * (m - 1)) / m;
    const est0 = (m) => (u) => uEst(u, uw(m), R0);
    // auto-balance (13.2): a panel whose column the user never picked goes to
    // the column that is shorter so far (its default column on a tie), so the
    // left side never runs far below the right; picked columns are kept, and
    // the holdings panel anchors the left unless moved
    if (n >= 2) {
      const e = est0(2), h = { a: 0, b: 0 };
      us.forEach((u) => { if (!u.free) h[u.side] += e(u) + K.GAP; });   // the anchors first (the holdings list)
      us.forEach((u) => {
        if (!u.free) return;
        u.side = h.a === h.b ? u.side : h.a < h.b ? "a" : "b";
        h[u.side] += e(u) + K.GAP;
      });
    }
    const A = us.filter((u) => u.side === "a"), B = us.filter((u) => u.side !== "a");
    let cols;
    if (n === 1) cols = [A.concat(B)];
    else if (A.length && B.length) {
      let aN = 1, bN = n - 1;
      while (bN > B.length) { bN--; if (aN < A.length) aN++; }
      n = aN + bN;
      cols = splitSeq(A, aN, est0(n), K.GAP).concat(splitSeq(B, bN, est0(n), K.GAP));
    } else cols = splitSeq(A.length ? A : B, n, est0(n), K.GAP);
    n = cols.length;
    const free = CW - K.GUTTER * (n - 1);
    const flex = cols.map((c) => (ctx.mapWide && c.some((u) => u.ids.indexOf("panel.holdings") >= 0) ? K.MAP_FLEX : 1));
    const sum = flex.reduce((a, b) => a + b, 0);
    // (rounded to 1e-6 px: 495 · 1.35 / 1.35 must stay 495, not 494.99999…, before any floor)
    return { cols: cols, flex: flex, colW: flex.map((f) => Math.round(((free * f) / sum) * 1e6) / 1e6), unitW: free / n };
  };
  const colH = (lay, i, R) => lay.cols[i].reduce((s, u, j) => s + (j ? K.GAP : 0) + uEst(u, lay.colW[i], R), 0);
  const counts = ctx.lists || {};
  const active = (x, lay) => (x === "map" ? !!counts.map : isNumber(counts[x])) &&
    lay.cols.some((c) => c.some((u) => u.ids.indexOf(LIST_ORDER.find((l) => l[0] === x)[1]) >= 0));
  const shownRows = (x, R) => (x === "map" ? R.map : Math.min(R[x], counts[x]));
  const total = (st) => {
    let T = 0, first = true;
    const add = (h) => { if (h > 0) { T += (first ? 0 : K.GAP) + h; first = false; } };
    add(headH(st.show, false));
    add(ctx.welcome ? K.WELCOME : 0);   // the welcome card (13.4)
    add(graphBlockH(st.show, st.gH));
    add(st.lay.cols.reduce((m, c, i) => Math.max(m, colH(st.lay, i, st.R)), 0));
    add((st.show.footer || ctx.warn ? K.FOOTER : 0) + (ctx.loading ? K.LOADING : 0));   // (its red warnings stay)
    return T + (st.hint ? K.HINT : 0);
  };
  // ---- fold units, lowest priority first, later position first
  const U = [];
  HEAD_IDS.forEach((id, i) => { if (on[id]) U.push({ ids: [id], p: prioOf(id), pos: i }); });
  if (on.graph) {
    U.push({ ids: ["graph"], p: prioOf("graph"), pos: 10 });
    GRAPH_PARTS.forEach((gp) => { if (on[gp[0]]) U.push({ ids: [gp[0]], p: prioOf(gp[0]), pos: gp[1] }); });
    U.push({ ids: ["graph.mini"], p: "always", pos: 9.5, mini: true });
  }
  units.forEach((u) => U.push({ ids: u.ids, p: u.p, pos: u.pos }));
  if (on.footer) U.push({ ids: ["footer"], p: prioOf("footer"), pos: 999 });
  U.sort((a, b) => PRIO_RANK[a.p] - PRIO_RANK[b.p] || b.pos - a.pos);
  const stateFor = (k) => {
    const fold = {};
    U.slice(0, k).forEach((u) => u.ids.forEach((id) => { fold[id] = true; }));
    const show = Object.assign({}, L.show);
    Object.keys(fold).forEach((id) => { show[id] = false; });
    if (fold.graph) Object.keys(show).forEach((id) => { if (id.indexOf("graph.") === 0) show[id] = false; });
    show["graph.mini"] = !!on.graph && !!fold.graph && !fold["graph.mini"];
    return { k: k, show: show, lay: assign(units.filter((u) => !fold[u.ids[0]])), hint: U.slice(0, k).some((u) => !u.mini),
      R: Object.assign({}, R0), gH: graphT };
  };
  const gMin = Math.max(K.GRAPH_MIN, Math.round(K.GRAPH_MIN_F * graphT));
  const canShrinkGraph = (st) => st.show.graph && graphShrinks && st.gH > gMin;
  // one step: the graph, else one row (or 20 px of map) from a list in the tallest column
  const shrinkRow = (st) => {
    const order = st.lay.cols.map((c, i) => [colH(st.lay, i, st.R), i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
    for (let o = 0; o < order.length; o++) {
      const col = st.lay.cols[order[o][1]];
      for (let j = 0; j < LIST_ORDER.length; j++) {
        const x = LIST_ORDER[j][0];
        if (!active(x, st.lay) || !col.some((u) => u.ids.indexOf(LIST_ORDER[j][1]) >= 0)) continue;
        if (x === "map") {
          if (st.R.map > K.MAP_MIN) { st.R.map = Math.max(K.MAP_MIN, st.R.map - K.MAP_STEP); return true; }
        } else if (shownRows(x, st.R) > K.ROWS_MIN[x]) { st.R[x] = shownRows(x, st.R) - 1; return true; }
      }
    }
    return false;
  };
  const atMin = (st) => {
    const m = Object.assign({}, st, { R: Object.assign({}, st.R), gH: canShrinkGraph(st) ? gMin : st.gH });
    ["holdings", "earnings", "days", "news"].forEach((x) => {
      if (active(x, m.lay)) m.R[x] = Math.min(shownRows(x, m.R), Math.max(K.ROWS_MIN[x], 0));
    });
    if (active("map", m.lay)) m.R.map = K.MAP_MIN;
    return m;
  };
  let st;
  if (auto) {
    st = stateFor(0);
  } else if (ctx.expanded) {
    st = stateFor(0);   // the map takes the room between the header and the footer
    st.lay = assign([]);
    st.show = Object.assign({}, st.show, { graph: false, "graph.mini": false });
  } else {
    for (let k = 0; k <= U.length && !st; k++) {
      const s = stateFor(k);
      if (total(atMin(s)) <= avail || k === U.length) st = s;
    }
    let guard = 0;
    while (total(st) > avail && guard++ < 5000) {
      if (canShrinkGraph(st)) st.gH = Math.max(gMin, st.gH - K.GRAPH_STEP);
      else if (!shrinkRow(st)) break;
    }
    L.scroll = total(st) > avail;
    // grow into what is left: rows first, then the graph
    ["holdings", "earnings", "days", "news"].forEach((x) => {
      if (!active(x, st.lay)) return;
      const cap = Math.min(counts[x], K.ROWS_MAX[x]);
      while (shownRows(x, st.R) < cap) {
        const prev = st.R[x];
        st.R[x] = shownRows(x, st.R) + 1;
        if (total(st) > avail) { st.R[x] = prev; break; }
      }
    });
    while (active("map", st.lay) && st.R.map < K.MAP_H) {
      st.R.map = Math.min(K.MAP_H, st.R.map + K.MAP_STEP);
      if (total(st) > avail) { st.R.map -= K.MAP_STEP; break; }
    }
    const gMax = Math.min(Math.round(graphW * K.GRAPH_MAX_F), K.GRAPH_MAX);
    while (st.show.graph && graphShrinks && st.gH + K.GRAPH_STEP <= gMax) {
      st.gH += K.GRAPH_STEP;
      if (total(st) > avail) { st.gH -= K.GRAPH_STEP; break; }
    }
  }
  // ---- the result
  L.show = st.show;
  L.folded = [];
  U.slice(0, st.k).forEach((u) => { if (!u.mini) u.ids.forEach((id) => L.folded.push(id)); });
  L.hint = L.folded.length > 0;
  L.graphH = st.gH;
  L.yTicks = st.gH >= 200 ? 8 : st.gH >= 150 ? 6 : 4;
  // rows per page: 12.11's with auto height, else what the height allows (never more than there are)
  L.rows = {};
  ["holdings", "earnings", "days", "news"].forEach((x) => {
    L.rows[x] = auto || !isNumber(counts[x]) ? st.R[x] : Math.max(1, shownRows(x, st.R));
  });
  L.mapH = st.R.map;
  const lay = st.lay;
  L.cols = lay.cols.map((c) => c.map((u) => ({ key: u.key, ids: u.ids })));
  L.colW = lay.colW;
  L.flex = lay.flex;
  L.unitW = lay.unitW;
  L.priceW = Math.floor(lay.unitW);
  L.focusEyebrowW = Math.floor(lay.unitW) - K.EYEBROW_OFF;
  const hi = lay.cols.findIndex((c) => c.some((u) => u.ids.indexOf("panel.holdings") >= 0));
  L.holdW = hi >= 0 ? lay.colW[hi] : CW;
  L.mapW = Math.floor(L.holdW) - K.MAP_INSET;
  const rc = rowCells(L.holdW, ctx.cellsOn || {}, ctx.tOn, ctx.undated, K);
  L.cells = rc.cells;
  L.sparkW = rc.sparkW;
  const wc = watchCells(L.holdW, ctx.cellsOn || {}, K);
  L.watchCells = wc.cells;
  L.watchSparkW = wc.sparkW;
  lay.cols.forEach((c, i) => c.forEach((u) => { L.est[u.key] = Math.round(uEst(u, lay.colW[i], st.R)); }));
  L.est.header = headH(st.show, true);
  L.est.graph = graphBlockH(st.show, st.gH);
  L.est.footer = st.show.footer ? K.FOOTER : 0;
  L.T = total(st);
  if (ctx.expanded) {
    const rest = L.T;   // header + footer (+ gaps)
    L.mapBigH = auto ? K.MAP_BIG_H : Math.max(K.MAP_MIN, avail - rest - K.GAP - K.EYEBROW - 6);
  }
  return L;
};

// ------------------------------------------------------------------ compact
// One line (12.11): total, today's % and money, a sparkline. The title
// toggles back; the row is still the drag handle, and frame() keeps the
// position and scale. Views left open (map, a stock) come back when expanded.
const COMPACT_SPARK_MAX = 80;
const compactSpark = (d) => {
  const h = d.history && Array.isArray(d.history["1D"]) ? d.history["1D"] : [];
  const vs = h.map((p) => (p && isFin(p.v) ? p.v : null)).filter((v) => v !== null);
  if (vs.length >= 2) {
    const step = Math.ceil(vs.length / COMPACT_SPARK_MAX);
    if (step <= 1) return vs;
    const out = [];
    for (let i = (vs.length - 1) % step; i < vs.length; i += step) out.push(vs[i]);   // keeps the newest
    return out;
  }
  const rows = Array.isArray(d.daily) ? d.daily : [];
  return rows.slice(-30).map((r) => (Array.isArray(r) && isFin(r[2]) ? r[2] : null)).filter((v) => v !== null);
};
// a window's own title (_settings.display), else the portfolio's name
// ------------------------------------------------------------------ the ⚙ editor (12.12)
// Opens at the top of a window's body. Every change makes a new display
// (migrating from the legacy keys first) and goes through saveDisplay: the
// screen follows at once, the file once, 300 ms after the last change.
const FEATURE_IDX = {};
FEATURES.forEach((f, i) => { FEATURE_IDX[f.id] = i; });
const EDIT_FEATURE_GROUPS = [["header", "Top numbers"], ["graph", "Graph"], ["panels", "Panels"],
  ["holdings", "Holdings"], ["rows", "Each holding's row"], ["footer", "Small print (bottom row)"]];
const editGroupOf = (id) => (id.indexOf("header.") === 0 ? "header"
  : id === "graph" || id.indexOf("graph.") === 0 ? "graph"
  : id === "panel.holdings" || /^(holdings|map|detail)\./.test(id) ? "holdings"
  : id.indexOf("panel.") === 0 ? "panels" : id.indexOf("row.") === 0 ? "rows" : "footer");
const depthOf = (id) => {
  let n = 0;
  for (let f = FEATURE_BY[id]; f && f.parent; f = FEATURE_BY[f.parent]) n++;
  return n;
};
const winItems = (w) => (w && Array.isArray(w.items) ? w.items.slice() : FULL_ITEMS.slice());
// back in at its registry place (before the first item that comes after it),
// so off then on gives the same order
const insertItem = (items, id) => {
  const k = FEATURE_IDX[id];
  const at = items.findIndex((x) => FEATURE_IDX[x] !== undefined && FEATURE_IDX[x] > k);
  if (at < 0) items.push(id); else items.splice(at, 0, id);
};
// switch one id; switching on something none of whose parts is on also brings
// its parts of the full set (a graph with tabs, holdings with a list…)
const toggleItem = (w, id, on) => {
  const items = winItems(w).filter((x) => x !== id);
  if (!on) return items;
  insertItem(items, id);
  const kids = FULL_ITEMS.filter((x) => x !== id && isUnder(x, id));
  if (kids.length && !kids.some((x) => items.indexOf(x) >= 0)) kids.forEach((x) => insertItem(items, x));
  return items;
};
// a map of per-id choices without the entries equal to the registry default
const withChoice = (map, id, v, dflt) => {
  const m = Object.assign({}, map || {});
  if (v === dflt) delete m[id]; else m[id] = v;
  return Object.keys(m).length ? m : undefined;
};
const edSideOf = (w, id) => (w.side && w.side[id]) || (FEATURE_BY[id] && FEATURE_BY[id].side) || "b";
// ↑ / ↓ among the panels of the same side (dir −1 / +1); null = already at that end
const shiftPanel = (w, id, dir) => {
  const items = winItems(w);
  const same = items.filter((x) => FEATURE_BY[x] && FEATURE_BY[x].kind === "panel" && edSideOf(w, x) === edSideOf(w, id));
  const j = same.indexOf(id), other = same[j + dir];
  if (j < 0 || !other) return null;
  const a = items.indexOf(id), b = items.indexOf(other);
  items[a] = other;
  items[b] = id;
  return items;
};
// "to top" (13.2): the panel goes before every other panel in the order (so
// it is the first in its column); null = already there
const topPanel = (w, id) => {
  const items = winItems(w);
  const first = items.find((x) => FEATURE_BY[x] && FEATURE_BY[x].kind === "panel");
  if (!first || first === id) return null;
  items.splice(items.indexOf(id), 1);
  items.splice(items.indexOf(first), 0, id);
  return items;
};
// "→ window": the id with its parts that are on goes to the end of the other
// window's items (its priority / side choices go along)
const moveFeature = (disp, fromId, toId, id) => {
  const src = disp.windows.find((w) => w.id === fromId), dst = disp.windows.find((w) => w.id === toId);
  if (!src || !dst) return null;
  const srcItems = winItems(src);
  const moving = srcItems.filter((x) => isUnder(x, id));
  const dstItems = winItems(dst);
  moving.forEach((x) => { if (dstItems.indexOf(x) < 0) dstItems.push(x); });
  const carry = (field) => {
    const from = Object.assign({}, src[field] || {}), to = Object.assign({}, dst[field] || {});
    moving.forEach((x) => { if (from[x] !== undefined) { to[x] = from[x]; delete from[x]; } });
    return [Object.keys(from).length ? from : undefined, Object.keys(to).length ? to : undefined];
  };
  const pr = carry("prio"), sd = carry("side");
  return patchWin(patchWin(disp, fromId, { items: srcItems.filter((x) => moving.indexOf(x) < 0), prio: pr[0], side: sd[0] }),
    toId, { items: dstItems, prio: pr[1], side: sd[1] });
};
const newWinId = (disp) => {
  for (let i = 2; ; i++) if (!disp.windows.some((w) => w.id === "w" + i)) return "w" + i;
};
const cleanTitle = (v) => Array.from(String(v || "").replace(TITLE_BAD_CH, "")).filter((c) => !lone(c))
  .join("").trim().replace(/^[\s\S]*/, (t) => Array.from(t).slice(0, 40).join("").trim());
// a new window (from a template, or a copy of `src`) beside the others (placeBeside)
const addWindow = (base, src, w, dispatch) => {
  if (base.windows.length >= MAX_WINDOWS) return null;
  const nw = Object.assign({}, w, { id: newWinId(base) });
  delete nw.x;
  delete nw.y;
  const zoom = validScale(nw.zoom) || 1;
  const p = placeBeside(base.windows, src, frameWidth(nw.w, zoom, winSize()[0]), nw.h, zoom);
  nw.x = p.x;
  nw.y = p.y;
  saveDisplay({ windows: base.windows.concat([nw]) }, dispatch);
  dispatch({ type: "FRONT", w: nw.id });
  return nw.id;
};
const fromTemplate = (t) => {
  const w = { title: t.key === "full" ? undefined : t.label, w: t.w, h: t.h };
  if (Array.isArray(t.items)) w.items = t.items.slice();
  if (t.compact) w.compact = true;
  if (t.newsCfg) w.news = Object.assign({}, t.newsCfg);
  Object.keys(w).forEach((k) => { if (w[k] === undefined) delete w[k]; });
  return w;
};
// the window's body scrolls to its top, where the editor opens
const bodyToTop = (ev) => {
  try {
    const root = ev && ev.currentTarget && ev.currentTarget.closest ? ev.currentTarget.closest("[data-pw-win]") : null;
    const body = root && root.firstChild ? root.firstChild.lastChild : null;
    if (body) body.scrollTop = 0;
  } catch (e) { /* no DOM: fine */ }
};
// the ⚙: hover-visible like the grips (always while its editor is open); a
// drag from it moves the window (the title row's mousedown), and the click
// that ends such a drag never arrives (swallowClick)
const gearNode = (state, dispatch, style) => (
  <span className="pw-grip" data-pw-edit="1"
    style={Object.assign({ cursor: "pointer", fontSize: 10, letterSpacing: 0 }, state.editOpen ? { opacity: 1, color: C.ink } : null, style)}
    title={state.editOpen ? "close the editor (Esc)" : "customise this window: what it shows, its size, more windows"}
    onClick={(ev) => {
      if (ev && ev.detail > 1) return;
      if (!state.editOpen) bodyToTop(ev);
      dispatch({ type: "TOGGLE_EDITOR" });
    }}>⚙</span>
);
// Esc closes every open editor: one keydown listener while any is open
let editKeys = null;
const armEditKeys = (on, dispatch) => {
  if (typeof window === "undefined" || typeof window.addEventListener !== "function") return;
  if (on) {
    if (editKeys) { editKeys.dispatch = dispatch; return; }
    editKeys = { dispatch: dispatch, fn: (ev) => { if (editKeys && isEscape(ev)) editKeys.dispatch({ type: "CLOSE_ALL_EDITORS" }); } };
    window.addEventListener("keydown", editKeys.fn, true);
  } else if (editKeys) {
    window.removeEventListener("keydown", editKeys.fn, true);
    editKeys = null;
  }
};

const edBox = css`
  margin: 2px 0 10px;
  padding: 5px 8px 6px;
  border: 1px solid rgba(var(--pw-fg), 0.14);
  border-radius: 8px;
  background: rgba(var(--pw-fg), 0.03);
  font-family: "SF Mono", Menlo, monospace;
  font-size: 9.5px;
  line-height: 1.45;
  color: ${C.ink};
  min-width: 0;
  max-width: 100%;
  box-sizing: border-box;
`;
const edHead = css`
  cursor: pointer;
  font-size: 9.5px;
  color: ${C.dim};
  margin-top: 5px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;
const edHeadOn = css`
  color: ${C.ink};
`;
const edCaption = css`
  display: flex;
  align-items: baseline;
  column-gap: 6px;
  margin-top: 8px;
  padding-top: 5px;
  border-top: 1px solid rgba(var(--pw-fg), 0.08);
  color: ${C.dim};
  min-width: 0;
`;
const edHint = css`
  color: ${C.dim};
  opacity: 0.8;
  font-size: 8.5px;
  line-height: 1.4;
  margin: 1px 0 2px;
  white-space: normal;
  min-width: 0;
`;
const edLine = css`
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  column-gap: 6px;
  row-gap: 2px;
  margin-top: 4px;
  min-width: 0;
`;
const edChip = css`
  cursor: pointer;
  padding: 1px 4px;
  border-radius: 3px;
  color: ${C.dim};
  white-space: nowrap;
`;
const edChipOn = css`
  color: ${C.ink};
  background: rgba(var(--pw-fg), 0.1);
`;
const edNum = { width: 50, fontSize: 9.5, padding: "1px 4px", flex: "none" };
const edText = { flex: "1 1 80px", minWidth: 0, fontSize: 9.5, padding: "1px 4px" };
const edLabel = { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0, cursor: "pointer" };
const edDim = { color: C.dim, whiteSpace: "nowrap" };
const edMsg = { color: C.amber, minWidth: 0, whiteSpace: "normal" };
const edNote = { color: C.dim, minWidth: 0, whiteSpace: "normal", fontSize: 8.5 };

// the "arrange" chips (13.2): friendly words, the saved ids stay always / normal / room
const PRIO_LABELS = { always: "hide last", normal: "normal", room: "hide first" };
const PRIO_TIPS = { always: "stays when the window is short", normal: "", room: "hidden first when the window is short" };
const EDIT_HINTS = {
  portfolio: "Settings for the whole portfolio — every window shares them.",
  window: "Its name, place and size. Drag the title row to move it, the edges to resize.",
  arrange: "order, left / right column, what hides first when the window is short, move to another window",
  arrangeOff: "Tick what each part shows. Click arrange to change order, columns and what hides first.",
  header: "Tick what this window shows. If the window is too short, some panels hide until there is room.",
  graph: "The graph and the buttons around it.",
  panels: "The boxes under the graph.",
  holdings: "The holdings list, heat map and watchlist.",
  rows: "The columns of every holding row.",
  footer: "The dim row at the very bottom.",
};
const EDIT_HEAD_TIPS = {
  header: "Top numbers: the row of figures above the graph", graph: "Graph: the value graph and its buttons",
  panels: "Panels: the boxes under the graph", holdings: "Holdings: the list of what you own",
  rows: "Each holding's row: the columns in the list", footer: "Small print: the bottom row",
};
const SIZE_PRESETS = [["narrow", 360], ["normal", WIDGET_W], ["wide", 992]];
const HISTORY_ORDER = ["3", "5", "10", "max"];
const HISTORY_LABELS = { "3": "3 years", "5": "5 years", "10": "10 years", max: "everything" };
const PENDING_NOTE = "takes effect on the next update (about a minute)";
const PENDING_LONGER = "loading more history — the graph fills in over the next few minutes";
const ALERTS_NOTE = "No notification? Allow Script Editor in System Settings → Notifications.";
const CURRENCY_CHIPS = ["USD", "EUR", "GBP", "CAD"];
const BENCH_NAME = {};
BENCH_GROUPS.forEach((g) => g.items.forEach((it) => { BENCH_NAME[it[0]] = it[1]; }));
// a field commits on Enter and again when it loses focus: the same value is
// sent once, until the reply is back (then a retry after an error works)
const edSent = {};

// 13.4: the ⚙ editor's "updates" row — what the last check found
const OPACITY_CHIPS = [["solid", 1, "no see-through at all"], ["normal", 0.88, "a little see-through (the usual look)"],
  ["lighter", 0.7, "the desktop shows through a bit"], ["glass", 0.5, "mostly see-through"]];
const updateNoteOf = (d, state) => {
  const u = d && d.update && typeof d.update === "object" ? d.update : null;
  if (state.updateChecking) return null;
  if (!u) return uiPrefs(state).updates === false ? "not checking" : "not checked yet — it happens at the next refresh";
  const when = isFin(u.checked) ? " (checked " + fmtAge(Math.max(0, Math.round(Date.now() / 1000 - u.checked))) + " ago)" : "";
  if (!u.latest) return u.ok === false ? "the last check failed — GitHub unreachable?" + when : "nothing known yet" + when;
  if (newerVersion(u.latest, VERSION)) return u.latest + " is out — update in the bottom row" + when;
  return "you have the newest version" + (u.ok === false ? " — the last check failed" : "") + when;
};
// "13.10" is newer than "13.4"; parts compared as numbers
const newerVersion = (a, b) => {
  const pa = String(a || "").split("."), pb = String(b || "").split(".");
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = Number(pa[i] || 0), y = Number(pb[i] || 0);
    if (!isFinite(x) || !isFinite(y)) return false;
    if (x !== y) return x > y;
  }
  return false;
};
const checkUpdateNow = (dispatch) => {
  dispatch({ type: "UPDATE_CHECKING", on: true });
  run(helper(["update", "check"])).then((out) => {
    const r = parseJson(String(out).trim());
    dispatch({ type: "UPDATE_INFO", info: r && !r.error ? r : { latest: null, ok: false, checked: Math.round(Date.now() / 1000) } });
  }, () => dispatch({ type: "UPDATE_INFO", info: { latest: null, ok: false, checked: Math.round(Date.now() / 1000) } }));
};
// "reset portfolio settings": ONE run of `setting portfolio reset-all`; the
// reply's ui values go into data.ui at once, this session's clicks are dropped
const resetPortfolioSettings = (dispatch) => runQueued(["setting", "portfolio", "reset-all"]).then((out) => {
  const r = parseJson(String(out).trim());
  if (!r || r.error) return dispatch({ type: "EDIT_MSG", key: "portfolio", msg: (r && r.error) || "could not reset" });
  dispatch({ type: "PF_RESET_LOCAL" });
  Object.keys(r.ui || {}).forEach((k) => dispatch({ type: "UI_PATCH", key: k, value: r.ui[k] }));
  dispatch({ type: "EDIT_MSG", key: "portfolio", msg: null });
}, () => dispatch({ type: "EDIT_MSG", key: "portfolio", msg: "could not reset" }));

// state = the window's view, L = its layout (null in the one-line view),
// has = id -> false when the data has nothing for it yet
const editorNode = (state, dispatch, d, L, has) => {
  if (!state.editOpen || !d) return null;
  const G = state._geo || winGeom(state);
  const id = G.win.id;
  const base = displayOf(state) || migrateDisplay(state);
  const dw = base.windows.find((w) => w.id === id) || { id: id };
  const others = base.windows.filter((w) => w.id !== id);
  const put = (disp) => { if (disp) saveDisplay(disp, dispatch); };
  const setWin = (patch) => put(patchWin(base, id, patch));
  const open = state.editGroup === "size" ? "window" : state.editGroup || "portfolio";
  const confirm = state.editConfirm;
  const hints = state.editHints !== false;
  const adv = state.editAdvanced === true;
  // the search box (13.4): with a word typed, every group shows only the rows
  // whose label, hint or key carries it; a group with no such row goes
  const q = String(state.editQuery || "").trim().toLowerCase();
  const matches = (...texts) => !q || texts.some((t) => String(t || "").toLowerCase().indexOf(q) >= 0);
  const wrow = (words, node) => (matches(words) ? node : null);
  // does a rendered group body hold anything (its children, nested arrays included)?
  const hasKids = (node) => {
    const walk = (k) => (Array.isArray(k) ? k.some(walk) : k !== null && k !== undefined && k !== false && k !== "");
    return !!(node && node.props && walk(node.props.children));
  };
  const ui = uiPrefs(state);
  const half = G.Wu - LAYOUT_K.PAD_X >= 860;   // two columns only where a panel row (chips and all) fits on one line
  const set = itemSetOf(winItems(dw));
  const pfName = ui.title || d.name || "portfolio";
  const nameOf = (w) => w.title || pfName;
  const chip = (label, on, onClick, title, key, pw) => (
    <span key={key || label} className={on ? css`${edChip} ${edChipOn}` : edChip} onClick={onClick} title={title || undefined}
      data-pw-edchip={pw && pw.chip} data-pw-prio={pw && pw.prio} data-pw-edctl={pw && pw.ctl} data-pw-edadv={pw && pw.adv} data-pw-edhints={pw && pw.hints}>{label}</span>
  );
  const group = (key, label, body, tip) => {
    const isOpen = q ? true : open === key;
    const node = isOpen ? body() : null;
    if (q && !hasKids(node)) return null;   // nothing in here matches
    return (
      <div key={key}>
        <div className={isOpen ? css`${edHead} ${edHeadOn}` : edHead} data-pw-edgroup={key} title={tip || undefined}
          onClick={() => { if (!q) dispatch({ type: "EDIT_GROUP", group: open === key ? "none" : key }); }}>
          {(isOpen ? "▾ " : "▸ ") + label}
        </div>
        {isOpen && hints && !q && EDIT_HINTS[key] ? <div className={edHint}>{EDIT_HINTS[key]}</div> : null}
        {node}
      </div>
    );
  };

  // ---- portfolio: _settings the file used to be the only way to (13.2)
  const msgOf = (key) => (state.editMsg && state.editMsg[key]) || null;
  const pend = state.settingPending;
  const pendNote = (key) => (pend && pend.key === key && d.epoch != null && pend.epoch === d.epoch ? pend.msg || PENDING_NOTE : null);
  const rowMsg = (key, extra) => {
    const m = msgOf(key) || extra || null, n = m ? null : pendNote(key);
    return m || n ? (
      <div key={"msg:" + key} className={edLine} data-pw-edmsg={key} style={{ marginTop: 1 }}><span style={m ? edMsg : edNote}>{m || n}</span></div>
    ) : null;
  };
  const srow = (key, label, body, hint, extraMsg) => !matches(key, label, hint) ? null : (
    <div key={"s:" + key} data-pw-edsetting={key}>
      <div className={edLine}><span style={edDim}>{label}</span>{body}</div>
      {hints && hint ? <div className={edHint}>{hint}</div> : null}
      {rowMsg(key, extraMsg)}
    </div>
  );
  const save = (key, value, after) => {
    const v = String(value);
    if (edSent[key] === v) return;
    edSent[key] = v;
    dispatch({ type: "EDIT_MSG", key: key, msg: null });
    saveSetting(key, v, dispatch).then((r) => { edSent[key] = null; if (r && r.ok && after) after(r); });
  };
  const pending = (key, msg) => () => dispatch({ type: "SETTING_PENDING", key: key, epoch: d.epoch, msg: msg });
  const titleNow = typeof ui.title === "string" ? ui.title : (d.name || "");
  const commitPfTitle = (ev) => {
    const t = cleanTitle(ev.target.value);
    if (ev.target.value !== t) ev.target.value = t;
    if (t.toLowerCase() === "default") {              // set_setting's remove-word: it would reset the name, not save it
      dispatch({ type: "EDIT_MSG", key: "title", msg: "'default' is reserved — pick another name" });
      return;
    }
    if (t !== (titleNow === "portfolio" ? "" : titleNow)) save("title", t);   // "" = back to "portfolio"
  };
  const curNow = typeof ui.currency === "string" && ui.currency ? ui.currency : "auto";
  const curCustom = curNow !== "auto" && CURRENCY_CHIPS.indexOf(curNow) < 0;
  const saveCur = (v) => { dispatch({ type: "EDIT_CONFIRM", what: null }); save("currency", v, pending("currency", PENDING_NOTE)); };
  const commitCur = (ev) => {
    const raw = String(ev.target.value).trim();
    if (!raw) return;
    if (!/^[A-Za-z]{3}$/.test(raw)) {
      dispatch({ type: "EDIT_MSG", key: "currency", msg: "currency must be a 3-letter code (EUR, GBP, SEK) or auto, got '" + raw + "'" });
      return;
    }
    ev.target.value = raw.toUpperCase();
    if (raw.toUpperCase() !== curNow) saveCur(raw.toUpperCase());
  };
  const btRaw = ui.backtestYears != null ? ui.backtestYears : d.backtestYears;
  const btNow = HISTORY_ORDER.indexOf(String(btRaw)) >= 0 ? String(btRaw) : "5";
  const saveBt = (v) => save("backtestYears", v,
    pending("backtestYears", HISTORY_ORDER.indexOf(v) > HISTORY_ORDER.indexOf(btNow) ? PENDING_LONGER : PENDING_NOTE));
  const benchNow = benchWantOf(state, d) || "auto";
  const benchDef = benchDefault(d.currency);
  const benchList = [];
  benchGroupsFor(d.currency).forEach((g) => g.items.forEach((it) => { if (benchList.length < 6) benchList.push(it[0]); }));
  const benchCustom = benchNow !== "auto" && benchNow !== "none" && benchList.indexOf(benchNow) < 0;
  const benchLabel = (s) => (BENCH_NAME[s] ? BENCH_NAME[s] + " (" + s + ")" : s);
  const pickIdx = (v) => { dispatch({ type: "EDIT_CONFIRM", what: null }); pickBench(v, !showBenchOf(state), dispatch); };
  const commitBench = (ev) => {
    const raw = String(ev.target.value).trim();
    if (!raw || raw.toUpperCase() === benchNow) return;
    submitBenchInput(raw, !showBenchOf(state), dispatch);
  };
  const alertsNow = typeof ui.alerts === "boolean" ? ui.alerts : d.alertsOn === true;
  const thrNow = (key, dflt) => (isFin(ui[key]) ? ui[key] : dflt);
  const thrCommit = (key, lo, hi, cur) => (ev) => {
    const raw = String(ev.target.value).trim(), n = Number(raw);
    if (!raw || raw.toLowerCase() === "default") {    // empty or the word: back to the default
      ev.target.value = String(cur);                    // (the field re-keys when the value changes)
      save(key, "default");
      return;
    }
    if (!isFinite(n) || n < lo || n > hi) {
      dispatch({ type: "EDIT_MSG", key: key, msg: "must be a number from " + lo + " to " + hi + " (%), or empty for the default — got '" + raw + "'" });
      return;
    }
    if (n !== cur) save(key, raw);
  };
  const thrField = (key, lo, hi, cur) => (
    <input key={key + ":" + cur} className={inputCss} style={edNum} defaultValue={String(cur)} inputMode="decimal" data-pw-edfield={key}
      title={lo + "–" + hi + " % (Enter)"} onKeyDown={(ev) => { if (isEnter(ev)) thrCommit(key, lo, hi, cur)(ev); }} onBlur={thrCommit(key, lo, hi, cur)} />
  );
  const rbNow = typeof state.rebalWhole === "boolean" ? state.rebalWhole : typeof ui.rebalanceWhole === "boolean" ? ui.rebalanceWhole : null;
  // appearance and the update check (13.4)
  const themeSaved = typeof ui.theme === "string" && THEMES.indexOf(ui.theme) >= 0 ? ui.theme : "dark";
  const opNow = opacityOf(state);
  const updOn = ui.updates !== false;
  const updateNote = updateNoteOf(d, state);
  const portfolioBody = () => (
    <div>
      {srow("title", "portfolio name", [
        <input key={"pt:" + titleNow} className={inputCss} style={edText} defaultValue={titleNow === "portfolio" ? "" : titleNow}
          placeholder="portfolio" maxLength={40} data-pw-edfield="title" title="the portfolio's name (Enter to keep it)"
          onKeyDown={(ev) => { if (isEnter(ev)) commitPfTitle(ev); }} onBlur={commitPfTitle} />,
      ])}
      {srow("currency", "currency", [
        chip("auto (now " + (d.currency || "USD") + ")", curNow === "auto", () => saveCur("auto"), "your Mac's region decides", "cur:auto", { chip: "auto" }),
      ].concat(CURRENCY_CHIPS.map((c) => chip(c, curNow === c, () => saveCur(c), undefined, "cur:" + c, { chip: c })),
        [chip(curCustom ? curNow : "other…", curCustom || confirm === "cur:other",
          () => dispatch({ type: "EDIT_CONFIRM", what: confirm === "cur:other" ? null : "cur:other" }), "any 3-letter code, like SEK or JPY", "cur:other", { chip: "other" })],
        curCustom || confirm === "cur:other" ? [
          <input key={"cur:" + curNow} className={inputCss} style={edNum} defaultValue={curCustom ? curNow : ""} placeholder="SEK" maxLength={3}
            data-pw-edfield="currency" title="a 3-letter code (Enter)" onKeyDown={(ev) => { if (isEnter(ev)) commitCur(ev); }} onBlur={commitCur} />,
        ] : []),
      "The money everything is shown in. auto = your Mac's region.")}
      {srow("backtestYears", "history", HISTORY_ORDER.map((v) => chip(HISTORY_LABELS[v], btNow === v, () => saveBt(v), undefined, "bt:" + v, { chip: v })),
        "How far back the graph and 'what if you had bought earlier' go. A longer history loads once and takes a few minutes.")}
      {srow("benchmark", "compare with an index", [
        chip("auto (" + (BENCH_NAME[benchDef] || benchDef) + " · " + benchDef + ")", benchNow === "auto", () => pickIdx("auto"),
          "the usual index for your currency", "bench:auto", { chip: "auto" }),
        chip("none", benchNow === "none", () => pickIdx("none"), "no index line", "bench:none", { chip: "none" }),
      ].concat(benchList.map((s) => chip(benchLabel(s), benchNow === s, () => pickIdx(s), undefined, "bench:" + s, { chip: s })),
        [chip(benchCustom ? benchLabel(benchNow) : "other…", benchCustom || confirm === "bench:other",
          () => dispatch({ type: "EDIT_CONFIRM", what: confirm === "bench:other" ? null : "bench:other" }), "any Yahoo symbol, like VOO or ^GSPC", "bench:other", { chip: "other" })],
        benchCustom || confirm === "bench:other" ? [
          <input key={"bench:" + benchNow} className={inputCss} style={{ width: 70, fontSize: 9.5, padding: "1px 4px", flex: "none" }}
            defaultValue={benchCustom ? benchNow : ""} placeholder="VOO" data-pw-edfield="benchmark" title="a Yahoo symbol (Enter)"
            onKeyDown={(ev) => { if (isEnter(ev)) commitBench(ev); }} onBlur={commitBench} />,
        ] : []),
      "the thin grey line on the graph, to compare against", state.benchMsg || null)}
      {srow("news", "headlines", [
        chip("on", newsOn(state), () => savePref("news", true, dispatch), undefined, "news:on", { chip: "true" }),
        chip("off", !newsOn(state), () => savePref("news", false, dispatch), undefined, "news:off", { chip: "false" }),
      ], "Loads headlines from Yahoo. Off = no news anywhere in the widget.")}
      {srow("alerts", "big-move alerts", [
        chip("on", alertsNow, () => save("alerts", "true", () => {
          dispatch({ type: "EDIT_MSG", key: "alerts", msg: ALERTS_NOTE });
          setTimeout(() => dispatch({ type: "EDIT_MSG", key: "alerts", msg: null }), 5000);
        }), undefined, "al:on", { chip: "true" }),
        chip("off", !alertsNow, () => save("alerts", "false"), undefined, "al:off", { chip: "false" }),
      ], "Shows a Mac notification, at most once per stock a day.")}
      {alertsNow ? srow("alertThreshold", "a holding moves more than", [thrField("alertThreshold", 0.5, 50, thrNow("alertThreshold", 5)),
        <span key="pc" style={edDim}>%</span>]) : null}
      {alertsNow ? srow("portfolioAlertThreshold", "the portfolio moves more than", [thrField("portfolioAlertThreshold", 0.1, 50, thrNow("portfolioAlertThreshold", 2.5)),
        <span key="pc" style={edDim}>%</span>]) : null}
      {srow("rebalanceWhole", "rebalancing suggests", [
        chip("whole shares only", rbNow === true, () => saveRebalWhole(true, dispatch), undefined, "rb:true", { chip: "true" }),
        chip("fractions of a share", rbNow === false, () => saveRebalWhole(false, dispatch), undefined, "rb:false", { chip: "false" }),
        chip("let the widget choose", rbNow === null, () => saveRebalWhole(null, dispatch), "whole shares when every holding is a whole number of shares", "rb:default", { chip: "default" }),
      ], "how the rebalance panel rounds its buy / sell amounts")}
      {wrow("targets rebalancing target share", <div key="tgt" className={edHint} style={{ marginTop: 4 }}>Target share of each holding (for rebalancing): still edited in the positions file — see README.</div>)}
      {srow("theme", "look", [
        chip("dark", themeSaved === "dark", () => save("theme", "dark"), "light text on a dark card", "th:dark", { chip: "dark" }),
        chip("light", themeSaved === "light", () => save("theme", "light"), "dark text on a light card", "th:light", { chip: "light" }),
        chip("follow my Mac", themeSaved === "auto", () => save("theme", "auto"),
          "dark or light with the Mac's appearance (System Settings → Appearance)", "th:auto", { chip: "auto" }),
      ], "Dark, light, or whatever the Mac is set to.")}
      {srow("opacity", "background", OPACITY_CHIPS.map((o) => chip(o[0], opNow === o[1], () => save("opacity", String(o[1])), o[2], "op:" + o[0], { chip: String(o[1]) }))
        .concat(OPACITY_CHIPS.some((o) => o[1] === opNow) ? [] : [chip("custom (" + Math.round(opNow * 100) + " %)", true, () => null,
          "set in the positions file (opacity)", "op:custom", { chip: "custom" })]),
        "How solid the window is — glass lets the desktop show through.")}
      {srow("updates", "updates", [
        chip("check once a day", updOn, () => save("updates", "true"),
          "asks GitHub for the newest version once a day — one plain request, nothing about you in it", "up:on", { chip: "true" }),
        chip("never", !updOn, () => save("updates", "false"), "no requests to GitHub; look at the releases page yourself", "up:off", { chip: "false" }),
        chip(state.updateChecking ? "checking…" : "check now", false, () => { if (!state.updateChecking) checkUpdateNow(dispatch); }, "ask GitHub right now", "up:now", { chip: "now" }),
      ], "You have " + VERSION + ". A newer version is offered in the bottom row; one click installs it and keeps your holdings.", updateNote)}
      {wrow("reset portfolio settings defaults", (
        <div key="pfreset" className={edLine} data-pw-edsetting="portfolio">
          {confirm === "pfreset" ? [
            <span key="q" style={{ color: C.down, minWidth: 0, whiteSpace: "normal" }}>currency, history, index, headlines, alerts, rebalancing, look and updates back to the defaults? (your holdings, the name and the windows stay)</span>,
            chip("yes, reset them", false, () => { dispatch({ type: "EDIT_CONFIRM", what: null }); resetPortfolioSettings(dispatch); }, undefined, "pf:yes", { chip: "yes" }),
            chip("no", false, () => dispatch({ type: "EDIT_CONFIRM", what: null }), undefined, "pf:no", { chip: "no" }),
          ] : chip("reset portfolio settings", false, () => dispatch({ type: "EDIT_CONFIRM", what: "pfreset" }),
            "every setting in this group back to its default — holdings, name, targets and windows stay", "pf:reset", { chip: "reset" })}
        </div>
      ))}
    </div>
  );

  // ---- this window: name, one line, size presets / width / height / zoom,
  // the carousel, new / duplicate / remove / reset
  const commitTitle = (ev) => {
    const t = cleanTitle(ev.target.value);
    if (ev.target.value !== t) ev.target.value = t;
    if (t !== (dw.title || "")) setWin({ title: t || undefined });
  };
  const wNow = G.g && isNumber(G.g.w) ? G.g.w : isNumber(dw.w) ? dw.w : WIDGET_W;
  const hNow = G.g && isNumber(G.g.h) ? G.g.h : isNumber(dw.h) ? dw.h : null;
  const zSaved = validScale(dw.zoom) || 1;
  const zNow = G.s;
  const preset = hNow === null ? SIZE_PRESETS.find((p) => p[1] === wNow) : null;
  const sizeCustom = !preset || confirm === "size:custom";
  // Enter / leaving the field: the number, clamped (the clamped one is shown)
  const commitNum = (lo, hi, cur, apply, empty) => (ev) => {
    const t = ev.target, raw = String(t.value).trim();
    if (!raw || /^auto$/i.test(raw)) {
      if (empty) { t.value = ""; if (cur !== null) apply(undefined); } else t.value = String(cur);
      return;
    }
    const n = Number(raw);
    if (!isFinite(n)) { t.value = cur === null ? "" : String(cur); return; }
    const c = clampInt(n, lo, hi);
    t.value = String(c);
    if (c !== cur) apply(c);
  };
  const onW = commitNum(WIN_W_MIN, WIN_W_MAX, wNow, (v) => setWin({ w: v === WIDGET_W ? undefined : v }), false);
  const onH = commitNum(WIN_H_MIN, WIN_H_MAX, hNow, (v) => setWin({ h: v }), true);
  const realH = (ev) => {
    try {
      const root = ev.currentTarget.closest("[data-pw-win]");
      return root.firstChild.getBoundingClientRect().height / G.s;
    } catch (e) { return null; }
  };
  // the slider previews live (a GEO draft) and saves on release
  const zoomCommit = (ev) => {
    const z = snapScale(Number(ev.target.value) / 100);
    if (z === zSaved && !(G.win.legacy && z !== scaleOf(state))) return dispatch({ type: "GEO", geo: null });
    setWin({ zoom: z === 1 ? undefined : z });
  };
  const winBody = () => (
    <div>
      {wrow("window name", <div key="wname" className={edLine}>
        <span style={edDim}>window name</span>
        <input className={inputCss} style={edText}
          key={"title:" + (dw.title || "")} defaultValue={dw.title || ""} placeholder={pfName} maxLength={40}
          title="this window's name (Enter to keep it)"
          onKeyDown={(ev) => { if (isEnter(ev)) commitTitle(ev); }} onBlur={commitTitle} />
      </div>)}
      {hints && matches("window name") ? <div className={edHint}>empty = the portfolio's name</div> : null}
      {wrow("collapse to one line compact", <div key="compact" className={edLine}>
        {chip((dw.compact === true ? "☑ " : "☐ ") + "collapse to one line", dw.compact === true, () => setWin({ compact: dw.compact === true ? undefined : true }),
          "just the name, value and today's change — or click the title", "compact")}
      </div>)}
      {wrow("size narrow normal wide custom width height", <div key="size" className={edLine}>
        <span style={edDim}>size</span>
        {SIZE_PRESETS.map((p) => chip(p[0] + " (" + p[1] + ")", !sizeCustom && preset === p, () => {
          dispatch({ type: "EDIT_CONFIRM", what: null });
          setWin({ w: p[1] === WIDGET_W ? undefined : p[1], h: undefined });
        }, p[1] + " px wide, as tall as its content", "size:" + p[0], { chip: p[0] }))}
        {chip("custom", sizeCustom, () => dispatch({ type: "EDIT_CONFIRM", what: sizeCustom ? null : "size:custom" }),
          "type the width and height", "size:custom", { chip: "custom" })}
      </div>)}
      {sizeCustom && matches("size width height custom") ? (
        <div className={edLine}>
          <span style={edDim}>width</span>
          <input className={inputCss} style={edNum} key={"w:" + wNow} defaultValue={String(wNow)} inputMode="numeric"
            title={WIN_W_MIN + "–" + WIN_W_MAX + " px (Enter)"} data-pw-edfield="w"
            onKeyDown={(ev) => { if (isEnter(ev)) onW(ev); }} onBlur={onW} />
          <span style={edDim}>height</span>
          <input className={inputCss} style={edNum} key={"h:" + hNow} defaultValue={hNow === null ? "" : String(hNow)} placeholder="auto" inputMode="numeric"
            title={WIN_H_MIN + "–" + WIN_H_MAX + " px (Enter), empty = as tall as its content"} data-pw-edfield="h"
            onKeyDown={(ev) => { if (isEnter(ev)) onH(ev); }} onBlur={onH} />
          {chip((hNow === null ? "☑" : "☐") + " shrink to fit", hNow === null, (ev) => setWin({
            h: hNow === null ? clampInt(realH(ev) || (L && isNumber(L.T) ? L.T + LAYOUT_K.CHROME : 400), WIN_H_MIN, WIN_H_MAX) : undefined,
          }), "as tall as its content (a fixed height hides panels that don't fit)", "fit")}
        </div>
      ) : null}
      {wrow("zoom bigger smaller", <div key="zoom" className={edLine}>
        <span style={edDim}>zoom</span>
        <span style={edDim}>smaller</span>
        <input type="range" min="60" max="160" step="5" key={"z:" + zSaved} defaultValue={String(Math.round(zSaved * 100))}
          style={{ flex: "1 1 60px", minWidth: 50, maxWidth: 180, margin: 0 }} data-pw-edfield="zoom"
          title="everything in this window bigger or smaller"
          onChange={(ev) => dispatch({ type: "GEO", geo: Object.assign({}, G.g || {}, { id: id, zoom: Number(ev.target.value) / 100 }) })}
          onMouseUp={zoomCommit} onKeyUp={zoomCommit} onTouchEnd={zoomCommit} />
        <span style={edDim}>bigger</span>
        <span style={edDim}>{Math.round(zNow * 100) + " %"}</span>
      </div>)}
      {wrow("left carousel rotate stack today sectors risk days", <div key="car" className={edLine}>
        <span style={edDim}>left carousel</span>
        {chip("rotate", dw.carousel !== "stack", () => setWin({ carousel: undefined }), "today · sectors · risk · days take turns", "car:rotate")}
        {chip("stack", dw.carousel === "stack", () => setWin({ carousel: "stack" }), "all of them, one under the other", "car:stack")}
      </div>)}
      {wrow("new window duplicate remove delete template", <div key="winops" className={edLine}>
        {base.windows.length < MAX_WINDOWS
          ? chip("+ new window ▾", confirm === "new", () => dispatch({ type: "EDIT_CONFIRM", what: confirm === "new" ? null : "new" }),
            "another window on the desktop, from a template")
          : <span style={edDim}>{MAX_WINDOWS + " windows (the most)"}</span>}
        {base.windows.length < MAX_WINDOWS ? chip("duplicate this window", false, () => addWindow(base, dw,
          Object.assign({}, dw, { title: cleanTitle(nameOf(dw) + " copy") }), dispatch), "a copy of this window, beside it") : null}
        {base.windows.length > 1
          ? chip("remove this window", confirm === "delete", () => dispatch({ type: "EDIT_CONFIRM", what: confirm === "delete" ? null : "delete" }), "close and forget this window")
          : null}
      </div>)}
      {confirm === "new" ? (
        <div data-pw-edmenu="new">
          {TEMPLATES.map((t) => (
            <div key={"tpl:" + t.key} className={edLine} style={{ marginTop: 2 }}>
              {chip(t.label, false, () => {
                dispatch({ type: "EDIT_CONFIRM", what: null });
                addWindow(base, dw, fromTemplate(t), dispatch);
                if (t.news && !newsOn(state)) savePref("news", true, dispatch);
              }, t.tip, "tpl:" + t.key)}
              <span style={edNote}>{t.desc}</span>
            </div>
          ))}
        </div>
      ) : null}
      {confirm === "delete" && base.windows.length > 1 ? (
        <div className={edLine}>
          <span style={{ color: C.down, minWidth: 0 }}>{"remove “" + nameOf(dw) + "”?"}</span>
          {chip("yes, remove it", false, () => put({ windows: others }), undefined, "del:yes")}
          {chip("no", false, () => dispatch({ type: "EDIT_CONFIRM", what: null }), undefined, "del:no")}
        </div>
      ) : null}
      {wrow("reset this window reset all windows standard", <div key="winreset" className={edLine}>
        {confirm === "resetwin" ? (
          <span style={{ color: C.down, minWidth: 0 }}>this window back to the standard size, zoom and content?</span>
        ) : null}
        {confirm === "resetwin"
          ? [chip("yes, reset it", false, () => { dispatch({ type: "EDIT_CONFIRM", what: null }); setWin({ w: undefined, h: undefined, zoom: undefined,
              items: undefined, prio: undefined, side: undefined, compact: undefined, carousel: undefined, news: undefined }); }, undefined, "rw:yes"),
             chip("no", false, () => dispatch({ type: "EDIT_CONFIRM", what: null }), undefined, "rw:no")]
          : chip("reset this window", false, () => dispatch({ type: "EDIT_CONFIRM", what: "resetwin" }),
            "the standard size, zoom and content; it keeps its name and place")}
        {confirm === "reset" ? (
          <span style={{ color: C.down, minWidth: 0 }}>one window, default spot, size and zoom, everything shown?</span>
        ) : null}
        {confirm === "reset"
          ? [chip("yes, reset all", false, () => resetAllDisplay(dispatch), undefined, "reset:yes"),
             chip("no", false, () => dispatch({ type: "EDIT_CONFIRM", what: null }), undefined, "reset:no")]
          : chip("reset all windows", false, () => dispatch({ type: "EDIT_CONFIRM", what: "reset" }),
            "back to the standard look: one window, everything shown, the default spot, size and zoom")}
      </div>)}
    </div>
  );

  // ---- what it shows: a tick per feature, chips for the range tabs and the
  // modes; with "arrange" on: priority / order / column / "move to another window"
  const toggle = (fid) => () => {
    const on = !set[fid];
    setWin({ items: toggleItem(dw, fid, on) });
    if (on && fid === "panel.news" && !newsOn(state)) savePref("news", true, dispatch);
  };
  const chipRow = (label, ids, depth) => (
    <div key={"chips:" + label} className={edLine} style={{ width: "100%", paddingLeft: depth * 10, boxSizing: "border-box" }}>
      <span style={edDim}>{label}</span>
      {ids.filter((fid) => matches(label, FEATURE_BY[fid].label, FEATURE_BY[fid].tip, fid)).map((fid) => chip(FEATURE_BY[fid].label, set[fid] === true, toggle(fid),
        FEATURE_BY[fid].tip + (set[fid] ? " — shown, click to hide" : " — hidden, click to show"), fid))}
    </div>
  );
  const featureRow = (f) => {
    const fid = f.id, inIt = set[fid] === true, live = enabled(dw, fid);
    const parentOn = !f.parent || enabled(dw, f.parent);
    const note = !live ? "" : L && L.folded.indexOf(fid) >= 0 ? "(hidden — window too short)"
      : has && has[fid] === false && fid !== "panel.news" ? "(no data yet)" : "";
    const prio = adv && live && f.p ? (dw.prio && dw.prio[fid]) || f.p : null;
    const panelCtl = adv && live && f.kind === "panel";
    const movable = adv && inIt && !f.parent && f.kind !== "cell" && others.length > 0;
    return (
      <div key={fid} className={edLine} data-pw-feature={fid}
        style={{ width: half ? "50%" : "100%", boxSizing: "border-box", paddingLeft: depthOf(fid) * 10,
          paddingRight: half ? 8 : 0, opacity: parentOn ? 1 : 0.5 }}>
        <span style={edLabel} onClick={toggle(fid)} title={(f.tip || f.label) + (inIt ? " — shown, click to hide" : " — hidden, click to show")}>
          {(inIt ? "☑ " : "☐ ") + f.label}
        </span>
        {note ? <span style={edDim}>{note}</span> : null}
        {fid === "panel.news" && inIt ? (newsOn(state) ? <span style={edDim}>headlines on</span>
          : chip("headlines off · turn on", false, () => savePref("news", true, dispatch), "headlines from Yahoo (Portfolio → headlines)", "news:on")) : null}
        {prio ? ["always", "normal", "room"].map((p) => chip(PRIO_LABELS[p], prio === p,
          () => setWin({ prio: withChoice(dw.prio, fid, p, f.p) }), PRIO_TIPS[p], "prio:" + p, { prio: p })) : null}
        {inIt && f.kind === "panel" && !(FEATURE_BY[fid].car && dw.carousel !== "stack") ? chip("to top", false,
          () => { const it = topPanel(dw, fid); if (it) setWin({ items: it }); }, "show this first in its column", "top", { ctl: "top" }) : null}
        {panelCtl ? chip("↑", false, () => { const it = shiftPanel(dw, fid, -1); if (it) setWin({ items: it }); }, "earlier", "up", { ctl: "up" }) : null}
        {panelCtl ? chip("↓", false, () => { const it = shiftPanel(dw, fid, 1); if (it) setWin({ items: it }); }, "later", "down", { ctl: "down" }) : null}
        {panelCtl ? chip(edSideOf(dw, fid) === "a" ? "left column" : "right column", false,
          () => setWin({ side: withChoice(dw.side, fid, edSideOf(dw, fid) === "a" ? "b" : "a", f.side) }),
          "now in the " + (edSideOf(dw, fid) === "a" ? "left" : "right") + " column — click to move it to the other", "side", { ctl: "side" }) : null}
        {movable ? chip("move to another window ▾", confirm === "move:" + fid,
          () => dispatch({ type: "EDIT_CONFIRM", what: confirm === "move:" + fid ? null : "move:" + fid }), "take it out of this window and into another", "move", { ctl: "move" }) : null}
        {movable && confirm === "move:" + fid ? others.map((w) => chip("→ " + nameOf(w), false, () => {
          dispatch({ type: "EDIT_CONFIRM", what: null });
          put(moveFeature(base, id, w.id, fid));
        }, undefined, "to:" + w.id)) : null}
      </div>
    );
  };
  // ---- the news page's options (13.1, windows[i].news): chips per field,
  // saved at once; the first click creates `news: {}` (the new path)
  const newsEditorNode = () => {
    const raw = dw.news && typeof dw.news === "object" && !Array.isArray(dw.news) ? normNews(dw.news) : null;
    const cfg = Object.assign({}, NEWS_DEF, raw);
    const setNews = (patch) => setWin({ news: normNews(Object.assign({}, cfg, patch)) || {} });
    const pad = (depthOf("panel.news") + 1) * 10;
    const row = (label, body, key) => (
      <div key={"news:" + key} className={edLine} style={{ width: "100%", boxSizing: "border-box", paddingLeft: pad }}>
        <span style={edDim}>{label}</span>{body}
      </div>
    );
    const pick = (label, field, v, tip) => chip(label, cfg[field] === v, () => { const p = {}; p[field] = v; setNews(p); }, tip, field + ":" + v);
    const flag = (label, field, tip) => chip(label, cfg[field] === true, () => { const p = {}; p[field] = !cfg[field]; setNews(p); }, tip, "flag:" + field);
    const failed = d.news && Array.isArray(d.news.failed) ? d.news.failed : [];
    const commitPick = (ev) => {
      const words = String(ev.target.value || "").split(/[\s,]+/).filter((x) => x);
      const ok = newsList(words) || [], bad = words.filter((x) => !NEWS_TICKER_RE.test(x.toUpperCase()));
      if (ok.join(" ") !== cfg.tickers.join(" ")) setNews({ tickers: ok });
      ev.target.value = ok.join(" ");
      if (bad.length) {
        dispatch({ type: "NEWS_PICK_MSG", msg: "not a ticker: " + bad.join(", ") });
        setTimeout(() => dispatch({ type: "NEWS_PICK_MSG", msg: null }), 5000);
      }
    };
    const full = cfg.tickers.length >= NEWS_LIST_MAX;
    return (
      <div key="news:opts" data-pw-feature="panel.news" style={{ width: "100%", boxSizing: "border-box" }}>
        {row("whose", [
          pick("movers", "scope", "movers", "holdings moving > 3 % today (as before 13.1)"),
          pick("holdings", "scope", "holdings", "every held stock"),
          pick("watchlist", "scope", "watch", "the watchlist"),
          pick("both", "scope", "all", "holdings and the watchlist"),
          pick("pick…", "scope", "pick", "tickers you type (held or not)"),
        ], "scope")}
        {cfg.scope === "pick" ? row("tickers", [
          <input key={"pick:" + cfg.tickers.join(" ")} className={inputCss} disabled={full}
            style={{ flex: "1 1 120px", minWidth: 0, fontSize: 9, padding: "1px 4px", opacity: full ? 0.6 : 1 }}
            defaultValue={full ? "" : cfg.tickers.join(" ")} placeholder={full ? NEWS_LIST_MAX + " picked (the most)" : "KO MSFT SHOP.TO"}
            title="tickers to follow here (Enter or click away keeps them, Esc reverts)"
            onKeyDown={(ev) => {
              if (isEnter(ev)) commitPick(ev);
              else if (isEscape(ev)) { ev.stopPropagation(); ev.target.value = cfg.tickers.join(" "); ev.target.blur(); }
            }} onBlur={commitPick} />,
          state.newsPickMsg ? <span key="bad" style={{ color: C.amber, whiteSpace: "nowrap" }}>{state.newsPickMsg}</span> : null,
        ], "pick") : null}
        {cfg.scope === "pick" && cfg.tickers.length ? row("picked", cfg.tickers.map((t) => chip(t + (failed.indexOf(t) >= 0 ? " ?" : "") + " ×", false,
          () => setNews({ tickers: cfg.tickers.filter((x) => x !== t) }),
          failed.indexOf(t) >= 0 ? t + ": headlines unavailable (Yahoo) — click to remove" : "click to remove " + t, "pk:" + t)), "picked") : null}
        {row("per stock", [1, 3, 5, 10].map((n) => pick(String(n), "per", n, "headlines kept per ticker (Yahoo gives ~10)")), "per")}
        {row("order", [pick("newest", "sort", "new", "newest first"), pick("movers", "sort", "move", "the biggest movers first (the stock open here first)"),
          pick("A–Z", "sort", "ticker", "by ticker")], "sort")}
        {row("since", [pick("today", "span", "day", "the last 24 hours"), pick("3 days", "span", "3d", "the last 3 days"),
          pick("week", "span", "week", "the last 7 days"), pick("all", "span", "all", "any time")], "span")}
        {row("layout", [flag("dense", "dense", "one line per story"), flag("group by ticker", "group", "a heading per ticker"),
          flag("source", "sources", "show the source and the time")], "layout")}
        {row("market news", NEWS_FEED_IDS.map((f) => chip(NEWS_FEEDS[f], cfg.market.indexOf(f) >= 0,
          () => setNews({ market: cfg.market.indexOf(f) >= 0 ? cfg.market.filter((x) => x !== f) : cfg.market.concat([f]) }),
          "the latest headlines from " + NEWS_FEEDS[f] + " (its public feed, fetched every 15 minutes) mixed into this page", "mk:" + f)), "market")}
        {cfg.mute.length ? row("muted", cfg.mute.map((t) => chip(t + " ×", false, () => setNews({ mute: cfg.mute.filter((x) => x !== t) }), "show " + t + " again", "mu:" + t))
          .concat([chip("unmute all", false, () => setNews({ mute: [] }), "show every ticker again", "mu:all")]), "mute") : null}
        {cfg.q ? row("keyword", [chip("keyword: " + cfg.q + " ×", false, () => setNews({ q: "" }), "the saved filter (typed in the panel's filter box) — click to clear", "q")], "q") : null}
      </div>
    );
  };
  const featureBody = (key) => () => {
    const out = [];
    FEATURES.forEach((f) => {
      if (editGroupOf(f.id) !== key || /^graph\.(range|mode)\./.test(f.id)) return;
      const ranges = f.id === "graph.tabs" ? FEATURES.filter((g) => g.parent === "graph.tabs" && /^graph\.range\./.test(g.id)).map((g) => g.id) : [];
      const modes = f.id === "graph.modes" ? ["graph.mode.value", "graph.mode.pl", "graph.mode.sectors"] : [];
      const sub = ranges.concat(modes).some((fid) => matches(FEATURE_BY[fid].label, FEATURE_BY[fid].tip, fid));
      if (!matches(f.label, f.tip, f.id) && !sub) return;   // the search box (13.4)
      out.push(featureRow(f));
      if (f.id === "panel.news" && set["panel.news"] === true && !q) out.push(newsEditorNode());
      if (ranges.length && (sub || !q)) out.push(chipRow("ranges", ranges, 2));
      if (modes.length && (sub || !q)) out.push(chipRow("modes", modes, 3));
    });
    return <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline" }}>{out}</div>;
  };
  // the head says how many are unticked, only when some are
  const countOff = (key) => FEATURES.filter((f) => editGroupOf(f.id) === key && !set[f.id]).length;
  const groupLabel = (g) => g[1] + (countOff(g[0]) ? " · " + countOff(g[0]) + " off" : "");
  const pfHead = "Portfolio · " + (d.currency || "auto") + " · " + HISTORY_LABELS[btNow];
  // while searching: does any feature row match (the "What it shows" caption), does anything at all
  const anyFeature = !q || FEATURES.some((f) => matches(f.label, f.tip, f.id));
  const PF_WORDS = ["portfolio name title", "currency", "backtestYears history", "benchmark compare with an index", "news headlines", "alerts big-move",
    "alertThreshold portfolioAlertThreshold", "rebalanceWhole rebalancing suggests", "targets", "theme look", "opacity background", "updates", "reset portfolio settings defaults"];
  const WIN_WORDS = ["window name", "collapse to one line compact", "size narrow normal wide custom width height", "zoom bigger smaller", "left carousel rotate stack",
    "new window duplicate remove delete template", "reset this window reset all windows standard"];
  const anyMatch = !q || anyFeature || PF_WORDS.some((w) => matches(w)) || WIN_WORDS.some((w) => matches(w));
  const winHead = "This window" + (base.windows.length > 1 ? " · " + base.windows.length + " open" : "")
    + " · " + G.Wu + " × " + (isNumber(G.Hu) ? G.Hu : "fit");

  return (
    <div className={edBox} data-pw-editor={id}>
      <div className={rowFlex} style={{ alignItems: "baseline", columnGap: 6 }}>
        <span style={Object.assign({ flex: "1 1 auto", color: C.ink }, edLabel)} title="settings: the portfolio, this window and what it shows">{"⚙ Settings · " + nameOf(dw)}</span>
        <input className={inputCss} style={{ width: 96, fontSize: 9, padding: "1px 5px", flex: "none" }} placeholder="find a setting…" value={state.editQuery || ""}
          data-pw-edfind="1" title="type a word — currency, zoom, news, dividends… — to see only the matching settings"
          onChange={(ev) => dispatch({ type: "EDIT_QUERY", value: ev.target.value })} />
        {q ? chip("×", false, () => dispatch({ type: "EDIT_QUERY", value: "" }), "show every setting again", "find:clear", { ctl: "findclear" }) : null}
        {chip(hints ? "hide hints" : "show hints", false, () => dispatch({ type: "EDIT_HINTS", on: !hints }),
          "the one-line explanations under each section", "hints", { hints: hints ? "1" : "0" })}
        <span className={edChip} style={{ fontSize: 10 }} title="close (Esc)" data-pw-edclose="1"
          onClick={() => dispatch({ type: "CLOSE_EDITOR" })}>×</span>
      </div>
      {q && !anyMatch ? <div className={edHint} data-pw-edfind-none="1">{"nothing matches “" + q + "” — try currency, zoom, graph, news, alerts, dividends"}</div> : null}
      {group("portfolio", pfHead, portfolioBody, "the whole portfolio's settings — shared by every window")}
      {group("window", winHead, winBody, "this window's name, place and size")}
      {!anyFeature ? null : <div className={edCaption}>
        <span style={{ flex: "1 1 auto", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
          title="tick what this window shows">What it shows</span>
        {chip(adv ? "arrange ▾" : "arrange ▸", adv, () => dispatch({ type: "EDIT_ADVANCED", on: !adv }),
          "order, columns, what hides first, move to another window", "adv", { adv: adv ? "1" : "0" })}
      </div>}
      {hints && anyFeature && !q ? <div className={edHint}>{adv ? EDIT_HINTS.arrange : EDIT_HINTS.arrangeOff}</div> : null}
      {EDIT_FEATURE_GROUPS.map((g) => group(g[0], groupLabel(g), featureBody(g[0]), EDIT_HEAD_TIPS[g[0]]))}
    </div>
  );
};
const winTitle = (state, d) => (state._win && state._win.title) || uiPrefs(state).title || d.name || "portfolio";
const compactRow = (state, dispatch, d, env) => {
  const totals = d.totals || {};
  const dc = isFin(totals.dayChange) ? totals.dayChange : 0;
  // at the window's width: the sparkline narrows, then goes; then the money change
  const K = LAYOUT_K, G = state._geo || winGeom(state);
  const cw = (winTitle(state, d).length + 2) * K.EYE_CH + K.MONO * (13 * money(totals.value).length +
    11 * (pct(totals.dayChangePct).length + signedMoney(totals.dayChange).length)) + 3 * K.COL_GAP;
  const L = layoutFor(G.win, { Wu: G.Wu, Hu: G.Hu, compact: true, compactW: cw });
  return (
    <div className={rowFlex} style={{ alignItems: "center" }}>
      <span className={eyebrow} style={{ cursor: "pointer" }} title="click: show everything · drag to move"
        onClick={titleClick(state, dispatch)}>
        {winTitle(state, d)}&nbsp;
        <span style={{ color: d.session === "open" ? C.up
          : d.session === "pre" || d.session === "after" ? C.amber
          : C.dim }}>●</span>
      </span>
      <span className={mono} style={{ display: "flex", alignItems: "center", columnGap: 8, fontSize: 11, whiteSpace: "nowrap" }}>
        {env.lastFetchFailed ? (
          <span style={{ color: C.down, fontWeight: 600 }} title={"last refresh failed" + (env.errorText ? "\n" + env.errorText : "")}>!</span>
        ) : null}
        <span style={{ fontSize: 13 }}>{money(totals.value)}</span>
        <span style={{ color: upDown(dc) }} title="today's change">{pct(totals.dayChangePct)}</span>
        {L.compactMoney ? <span style={{ color: upDown(dc) }}>{signedMoney(totals.dayChange)}</span> : null}
        {L.compactSpark ? <Spark values={compactSpark(d)} w={L.compactSpark} /> : null}
        {gearNode(state, dispatch, { position: "absolute", right: 5, top: 10, fontSize: 9 })}
      </span>
    </div>
  );
};

// ------------------------------------------------------------------ render
// one window: `state` is its view (renderWindow), `dispatch` tags events with its id
const renderWin = (state, dispatch) => {
  const hover = {
    onMouseEnter: () => dispatch({ type: "HOVER", on: true }),
    onMouseLeave: () => dispatch({ type: "HOVER", on: false }),
  };
  const env = state.raw;
  if (!env) {
    return frame(state, dispatch, <span className={eyebrow}>portfolio</span>, (
      <div>
        <div className={css`color:${C.dim}; font-size:11px; margin-top:6px;`}>
          {state.parseError ? "the widget command failed:" : "starting…"}
        </div>
        {state.parseError ? (
          <div className={css`color:${C.down}; font-size:9px; margin-top:4px; word-break:break-all; font-family:"SF Mono",Menlo,monospace;`}>
            {state.parseError}
          </div>
        ) : null}
      </div>
    ));
  }
  const d = env.data;
  if (!d) {
    const setup = env.status === "setup";
    return frame(state, dispatch, <span className={eyebrow}>{setup ? "portfolio · one-time setup" : "portfolio"}</span>, (
      <div>
        {env.status === "loading" ? (
          <div>
            <div className={css`color:${C.dim}; font-size:10px; margin-top:6px;`}>
              fetching prices for the first time…
            </div>
            <LoadingLine progress={env.progress} />
          </div>
        ) : (
          <div className={css`color:${setup ? C.ink : C.down}; font-size:10px; margin-top:6px; white-space:pre-wrap; word-break:break-word; font-family:"SF Mono",Menlo,monospace; line-height:1.5;`}>
            {env.errorText || "no data yet"}
            {setup ? "\n\nThe widget checks again every couple of minutes." : ""}
          </div>
        )}
      </div>
    ));
  }

  setCurrency(d.currency);
  const totals = d.totals || {};
  if (compactOf(state)) {
    return frame(state, dispatch, compactRow(state, dispatch, d, env),
      state.editOpen ? <div>{editorNode(state, dispatch, d, null, null)}</div> : <div />, hover);
  }
  // ---- what this window has switched on (12.12 FEATURES; the 12.11 window has
  // all of 12.11's). A feature that is off is gone and its work skipped; a
  // current choice whose control is off falls back to one that is on (range,
  // graph mode, holdings view, sort, the add form, the expanded map).
  const fwin = state._win || null;
  const inItems = (id) => itemSetOf(itemsOf(fwin))[id] === true;
  const en = (id) => enabled(fwin, id);
  const gWant = en("graph");                      // off: no series / index / sector / backtest work
  const btOn = en("graph.backtest");              // off: no 3Y–MAX tabs, no simulated points
  const modesOn = inItems("graph.modes") ? ["value", "pl", "sectors"].filter((m) => inItems("graph.mode." + m)) : [];
  const viewsOn = ["list", "map", "watch"].filter((v) => en("holdings." + v));
  const addOn = en("holdings.add"), bellOn = en("row.bell"), dotOn = en("row.news");
  const eff = {};
  if (modesOn.indexOf(state.graphMode) < 0) eff.graphMode = modesOn[0] || "value";
  if (viewsOn.length && viewsOn.indexOf(state.view) < 0) eff.view = viewsOn[0];
  if (state.mapExpanded && viewsOn.indexOf("map") < 0) eff.mapExpanded = false;
  if (state.showAdd && !addOn) eff.showAdd = false;
  if (state.sort !== "az" && !en("holdings.sort")) eff.sort = "az";
  if (state.mark && state.mark.sim && !btOn) eff.mark = null;   // a simulated moment needs the backtest part
  if (Object.keys(eff).length) state = Object.assign({}, state, eff);
  const dayRows = dayRowsOf(d, state);   // d.daily plus any older rows loaded on demand
  // "from here": the graph starts at a moment you picked. The points come from
  // the shortest standard range that reaches back that far (so a start last
  // week keeps hourly detail), cut at that moment.
  const from = gWant && state.from && !(state.from.sim && !btOn) ? state.from : null;
  const bt = btOf(d);
  const btTabs = btOn ? btTabsOf(d) : [];
  btModeNow = state.btMode === "weighted" ? "weighted" : "held";
  btModeBy[dispatch.w || ""] = btModeNow;
  // the range tabs this window shows (RANGES, the backtest years, ALL)
  const rangeTabs = RANGES.concat(btTabs.map((tb) => tb.key), ["ALL"]).filter((r) => inItems("graph.range." + r));
  // a backtest tab this data doesn't have (older data, a smaller backtestYears) shows as ALL;
  // a range whose tab is off: the first tab shown, else 1D
  let effRange = btOn && BT_RANGES.indexOf(state.range) >= 0 && !btTab(d, state.range) ? "ALL" : state.range;
  if (rangeTabs.indexOf(effRange) < 0) effRange = rangeTabs[0] || "1D";
  const baseRange0 = from ? pickRange(from.t, d) : effRange;
  const baseRange = !btOn && BT_RANGES.indexOf(baseRange0) >= 0 ? "ALL" : baseRange0;
  const btRange = btOn && BT_RANGES.indexOf(baseRange) >= 0 ? btTab(d, baseRange) : null;
  // the index to compare with (12.10): the choice (this session's pick, else
  // data.ui.benchmark; null with older data) and the one the data carries.
  // Until they agree the caption says "loading SPY…" and no index line shows
  // (the old index's line under the new name would mislead); "none" shows none.
  const benchWant = benchWantOf(state, d);
  const dBench = d.benchmark && typeof d.benchmark === "object" ? d.benchmark : null;
  const benchWantSym = benchWant === "auto" ? benchDefault(d.currency) : benchWant === "none" ? null : benchWant;
  const benchLoading = !!benchWantSym && (dBench ? dBench.symbol !== benchWantSym ||
      (benchWant === "auto" && dBench.source !== "default")
    : benchWant !== "auto" || state.benchWant === "auto");   // auto without data: only right after the pick
  const benchNoData = !!benchWantSym && !benchLoading && !!dBench && !!dBench.error;
  // the benchmark's level at each point: d.benchmark.idx[R] runs alongside d.history[R]
  const benchOn = gWant && en("graph.bench");   // off: no index line or caption work
  const bench = benchOn && benchWant !== "none" && !benchLoading && dBench && !dBench.error &&
    dBench.idx && typeof dBench.idx === "object" ? dBench : null;
  const historyOf = (r) => {
    const pts = (d.history && d.history[r]) || [];
    const idx = bench && Array.isArray(bench.idx[r]) && bench.idx[r].length === pts.length ? bench.idx[r] : null;
    return idx ? withBench(pts, idx) : pts;
  };
  const dayPt = (r) => ({ t: r[1], v: r[2], approx: !!r[3], bi: typeof r[4] === "number" ? r[4] : null,
    b: typeof r[5] === "number" ? r[5] : null });
  let rawSeries = gWant ? historyOf(btRange ? "ALL" : baseRange) : [];
  let olderComing = false;
  if (!gWant) {
    // the graph is off in this window: none of its work (no older days loaded either)
  } else if (btRange) {
    // a backtest tab: the real part like a long custom span (one point per
    // day from the first real day or the tab's start, ending on the live
    // value), and before the first purchase the simulated points, which end
    // at the first real day
    const startT = from ? from.t : btRange.start;
    const realT = Math.max(startT, bt.anchor.t);
    const live = rawSeries.length ? rawSeries[rawSeries.length - 1] : null;
    let real = rawSeries.filter((p) => p.t >= realT - 1);
    if (dayRows.length) {
      olderComing = ensureDaysBack(d, state, dayRows, realT, dispatch);
      // until older day rows arrive (or if loading them failed), the ALL
      // points fill the stretch before them, so no simulated-looking line
      // bridges real days
      const head = real.filter((p) => p.t < dayRows[0][1] - 1);
      real = head.concat(thinRows(dayRows.filter((r) => r[1] >= realT - 1), MAX_GRAPH_PTS).map(dayPt));
      if (live && (!real.length || live.t > real[real.length - 1].t)) real.push(live);
    }
    const sim = startT < bt.anchor.t - 1
      ? simPoints(d, btRange.key, btModeNow).filter((p) => p.t >= startT - 1) : [];
    rawSeries = sim.concat(real);
  } else if (from && (baseRange === "1Y" || baseRange === "ALL") && dayRows.length) {
    // a long custom span: one point per day straight from the day-by-day
    // table (finer than the thinned-out 1Y/ALL series, and the same numbers
    // the days panel shows), ending on the live value. A start before the
    // rows on hand loads the older ones (the graph fills in when they land).
    olderComing = ensureDaysBack(d, state, dayRows, from.t, dispatch);
    const live = rawSeries.length ? rawSeries[rawSeries.length - 1] : null;
    rawSeries = thinRows(dayRows.filter((r) => r[1] >= from.t - 1), MAX_GRAPH_PTS).map(dayPt);
    if (live && (!rawSeries.length || live.t > rawSeries[rawSeries.length - 1].t)) rawSeries.push(live);
  } else if (from) {
    rawSeries = rawSeries.filter((p) => p.t >= from.t - 1);
  }
  if (from) {
    // a picked day brings that day's own value: make it the first point
    if (from.v !== undefined && from.v !== null && (!rawSeries.length || rawSeries[0].t - from.t > 60)) {
      rawSeries = [{ t: from.t, v: from.v, approx: !!from.approx, sim: !!from.sim,
        bi: typeof from.bi === "number" ? from.bi : null,
        b: !from.sim && typeof from.b === "number" ? from.b : null }].concat(rawSeries);
    }
  }
  // Money at work over time (cost basis + cash): what the P&L graph subtracts,
  // and what tells a deposit from a gain in "change over the range".
  const steps = d.basisSteps && d.basisSteps.length ? d.basisSteps : null;
  const stepBase = (t) => {
    let b = 0;
    for (let i = 0; i < steps.length && steps[i][0] <= t; i++) b = steps[i][1];
    return b;
  };
  const baseOf = steps ? (p) => (p.b !== undefined && p.b !== null ? p.b : stepBase(p.t)) : null;
  // simulated points carry the money at work on the first real day: no flow
  // is seen before or at the join, so p&l and "change" count only real buys
  if (steps && bt && rawSeries.some((p) => p.sim)) {
    const b0 = stepBase(bt.anchor.t);
    rawSeries = rawSeries.map((p) => (p.sim ? Object.assign({}, p, { b: b0 }) : p));
  }
  const legacyBase = totals.invested || totals.costBasis || null;   // cached data from before 12.2
  const baseNow = steps ? steps[steps.length - 1][1] : null;
  const vsInvested = !!(state.plMode === "invested" && totals.invested && baseNow);
  const kBase = vsInvested ? totals.invested / baseNow : 1;
  const plOf = (p) => (baseOf ? p.v - baseOf(p) * kBase : p.v - legacyBase);
  const plGraph = state.graphMode === "pl" && !!(baseOf || legacyBase);
  const sectorMode = state.graphMode === "sectors";
  // sector series are "% since the start of the range": cut at the custom
  // start and re-base every series to 0% there
  const cutSectors = (sd, t) => {
    if (!sd || !sd.t) return sd;
    // the first bar of the chosen day (a daily close is stamped 16:00), else
    // the first bar after it: never a bar from an earlier day
    const dayStart = t - 20 * 3600;
    let s0 = 0;
    while (s0 < sd.t.length - 1 && sd.t[s0] < dayStart) s0++;
    const rebase = (ser) => {
      const p0 = ser[s0];
      return ser.slice(s0).map((v) => (v === null || v === undefined || p0 === null || p0 === undefined ? null
        : Math.round(((1 + v / 100) / (1 + p0 / 100) - 1) * 10000) / 100));
    };
    return { t: sd.t.slice(s0), total: rebase(sd.total || []),
      themes: (sd.themes || []).map((th) => ({ name: th.name, pct: rebase(th.pct) })) };
  };
  const sectorFull = gWant && d.sectors ? d.sectors[baseRange] : null;
  const sectorData = from ? cutSectors(sectorFull, from.t) : sectorFull;
  const focusName = sectorMode && state.sectorFocus && sectorSeriesOf(sectorData, state.sectorFocus) ? state.sectorFocus : null;
  const rangeWords = from ? "since " + fmtDayY(from.t)
    : btRange ? (btRange.key === "MAX" || btRange.short ? "since " + fmtDayY(btRange.start)
      : "over " + BT_YEARS[btRange.key] + " years")
    : { "1H": "over the last hour", "1D": "today", "1W": "over the past week", "1M": "over the past month",
        "1Y": "over the past year", "ALL": "since the start" }[effRange];
  const series = plGraph ? rawSeries.map((p) => Object.assign({}, p, { v: plOf(p) })) : rawSeries;
  // gain between two value points with deposits / new buys taken out (simple Dietz)
  const perf = (a, b) => {
    const flow = baseOf ? baseOf(b) - baseOf(a) : 0;
    const gain = b.v - a.v - flow;
    const denom = a.v + flow / 2;
    return { gain: gain, flow: flow, pct: denom > 0 ? (gain / denom) * 100 : null };
  };
  const lastRaw = rawSeries.length ? rawSeries[rawSeries.length - 1] : null;
  const simShown = !sectorMode && rawSeries.some((p) => p.sim);
  // With a simulated stretch the span can be decades and start from a tiny
  // scaled value, where simple Dietz lets one later purchase swamp the result
  // (a 1962 start read +680% instead of the holdings' real growth). There the
  // % is time-weighted: each step's growth with new money taken out, chained.
  const timeWeighted = (pts) => {
    let g = 1;
    for (let i = 1; i < pts.length; i++) {
      const flow = baseOf ? baseOf(pts[i]) - baseOf(pts[i - 1]) : 0;
      if (pts[i - 1].v > 0) g *= (pts[i].v - flow) / pts[i - 1].v;
    }
    return (g - 1) * 100;
  };
  let rangePerf = rawSeries.length > 1 ? perf(rawSeries[0], lastRaw) : null;
  if (rangePerf && simShown) rangePerf = Object.assign({}, rangePerf, { pct: timeWeighted(rawSeries), twr: true });
  const kHeld = bt && bt.k && typeof bt.k.held === "number" && bt.k.held > 0 ? bt.k.held : null;
  const simTip = (p) => (btModeNow === "held"
    ? "today's share counts at that day's prices" + (kHeld ? " (worth " + money(p.v / kHeld) + ")" : "") +
      ", scaled to meet your real value on the day you bought"
    : "today's weights (each holding's share of today's value), rebalanced monthly, scaled to meet your real value on the day you bought") +
    "\nsimulated: hindsight flatters this — these are the stocks you ended up choosing";

  // the benchmark (value graph only): the same money put into the index on
  // the same days as each purchase. Its units start at the first point with an
  // index level; every later flow (new money in, or a sale / cash taken out)
  // buys or sells units: the same flows as the portfolio line (baseOf). The
  // tracker gives rebuilt points (and day rows) their recorded neighbours'
  // offset from basisSteps (12.7), so a rebuilt/recorded seam is no longer
  // read as money in then out again. (Simulated points carry the money at
  // work on the first real day, so no flow before the join.)
  const benchBase = baseOf;
  let benchLine = null, benchCap = null;
  // hidden with "hide" under the graph (saved as _settings.showBenchmark):
  // "show index" brings it back. "index: SPY ▾" opens the picker (with data
  // that carries ui.benchmark: 12.10+); _settings.benchmark "none" leaves
  // only "index: none ▾", so another can be picked
  const benchCtx = benchOn && !plGraph && !sectorMode && rawSeries.length > 1;
  let benchOff = benchCtx && !showBenchOf(state) && !!(bench || benchLoading || benchNoData);
  let benchCtl = benchCtx && !benchOff && benchWant !== null && en("graph.benchPicker");
  if (state.benchPick && !benchCtl) benchCloseLater(dispatch);   // p&l / sectors / no series: it closes
  let benchNote = !benchCtx || benchOff ? null : benchLoading ? "loading " + benchWantSym + "…"
    : benchNoData ? "no data for " + benchWantSym + " on Yahoo" : null;
  if (bench && !benchOff && !plGraph && !sectorMode && rawSeries.length > 1) {
    const P = rawSeries;
    const okBi = (x) => typeof x === "number" && isFinite(x) && x > 0;
    let j0 = -1;
    for (let i = 0; i < P.length && j0 < 0; i++) if (okBi(P[i].bi)) j0 = i;
    if (j0 >= 0) {
      const B = P.map(() => null);
      let units = P[j0].v / P[j0].bi, pending = 0, k = j0;
      B[j0] = P[j0].v;
      // daily graphs skip days: a purchase between two points buys at its own
      // day's close (bench.steps, aligned with basisSteps; 12.6+), not the next point's
      const bSteps = steps && ["1H", "1D", "1W", "1M"].indexOf(baseRange) < 0 &&
        Array.isArray(bench.steps) && bench.steps.length === steps.length ? bench.steps : null;
      for (let i = j0 + 1; i < P.length; i++) {
        let flow = benchBase ? benchBase(P[i]) - benchBase(P[i - 1]) : 0;
        if (bSteps && flow) {
          let sum = 0, known = 0, u = 0;
          for (let s = 1; s < steps.length; s++) {
            if (steps[s][0] <= P[i - 1].t || steps[s][0] > P[i].t) continue;
            const f = steps[s][1] - steps[s - 1][1];
            sum += f;
            if (okBi(bSteps[s])) { known += f; u += f / bSteps[s]; }
          }
          if (Math.abs(sum - flow) < 0.01) { units += u; flow -= known; }   // else: the next point, as before
        }
        pending += flow;
        if (okBi(P[i].bi)) {
          units += pending / P[i].bi;
          pending = 0;
          B[i] = units * P[i].bi;
          k = i;
        }
      }
      if (k > j0) {
        benchLine = B;
        const you = perf(P[j0], P[k]);
        // the index's own money in (the same basisSteps flows its line used)
        const bFlow = benchBase ? benchBase(P[k]) - benchBase(P[j0]) : 0;
        const bDen = B[j0] + bFlow / 2;
        const bPct = bDen > 0 ? ((B[k] - B[j0] - bFlow) / bDen) * 100 : null;
        if (you.pct !== null && bPct !== null) {
          const r1 = (x) => Math.round(x * 10) / 10;
          const f1 = (x) => (x >= 0 ? "+" : "−") + Math.abs(x).toFixed(1) + "%";
          const a = r1(you.pct), b = r1(bPct), diff = r1(a - b);
          const sym = String(bench.symbol || "index");
          benchCap = {
            // both figures cover the same span: say so up front when the
            // index starts later than the graph
            lead: (j0 > 0 ? "since " + fmtDayY(P[j0].t) + ": " : "") + "you " + f1(a) + " · " + sym + " " + f1(b) + " · ",
            verdict: diff > 0 ? "beat by " + diff.toFixed(1) + " pts" : diff < 0 ? "behind by " + Math.abs(diff).toFixed(1) + " pts" : "even with " + sym,
            // a narrow window (< 400 px): the symbol is already in the lead, so just the gap
            short: diff === 0 ? "even" : (diff > 0 ? "+" : "−") + Math.abs(diff).toFixed(1) + " pts",
            diff: diff,
          };
        }
      }
    }
  }

  // the point under the crosshair (hover wins over the pinned mark)
  const hovering = state.hoverT !== null;
  const markT = state.mark ? state.mark.t : null;
  const activeT = hovering ? state.hoverT : markT;
  let readout = null;
  if (!sectorMode && !hovering && state.mark && state.mark.d) {
    readout = state.mark;                              // a picked day carries its own value…
    if (state.mark.sim) {                              // …a simulated one follows the mode shown
      const p = rawSeries.length ? rawSeries[nearestIdx(rawSeries.map((q) => q.t), state.mark.t)] : null;
      readout = Object.assign({}, state.mark, p && p.sim && p.t === state.mark.t ? { v: p.v, bi: p.bi } : {},
        steps && bt ? { b: stepBase(bt.anchor.t) } : {});
    }
  } else if (!sectorMode && activeT !== null && rawSeries.length &&
      activeT >= rawSeries[0].t - 1 && activeT <= lastRaw.t + 1) {
    readout = rawSeries[nearestIdx(rawSeries.map((p) => p.t), activeT)];
  }
  const readoutPerf = readout && lastRaw ? perf(readout, lastRaw) : null;
  const onHoverPt = (t) => queueHover(dispatch, t);
  const onPickPt = (t) => dispatch({ type: "SET_MARK",
    mark: state.mark && state.mark.t === t && !state.mark.d ? null
      : bt && t < bt.anchor.t - 1 ? { t: t, sim: true } : { t: t } });

  // the enlarge toggle: value and p&l only (sectors have their own enlarge)
  const bigOn = inItems("graph.big") && graphBigOf(state) && !sectorMode;
  // With a "from …" or "start here" chip in the tab row the value readout no
  // longer fits beside it, so it gets a line of its own (decided by state, not
  // by the pointer, so hovering never makes the graph jump). Sector mode's
  // readout is a short date and stays in the row.
  const readoutOn = inItems("graph.readout");
  const readoutOwnLine = readoutOn && !sectorMode && !!(from || state.mark);
  // holdings whose prices begin after the shown range starts (their money
  // counts as cash until then)
  const shownStart = !sectorMode && rawSeries.length ? isoOf(rawSeries[0].t) : null;
  // (d.lateStarts for the real part, d.backtest.lateStarts for the simulated one)
  const lateAll = [];
  (Array.isArray(d.lateStarts) ? d.lateStarts : []).concat(bt && Array.isArray(bt.lateStarts) ? bt.lateStarts : [])
    .forEach((ls) => { if (ls && !lateAll.some((o) => o.ticker === ls.ticker)) lateAll.push(ls); });
  let lateShown = shownStart
    ? lateAll.filter((ls) => ls && typeof ls.first === "string" && ls.first > shownStart) : [];
  let histProg = env.historyProgress && typeof env.historyProgress === "object" ? env.historyProgress : null;
  const histCount = histProg && isFinite(histProg.done) && isFinite(histProg.total) && histProg.total > 0
    ? " " + histProg.done + "/" + histProg.total : "";

  const positions = d.positions || [];
  const anyUndated = positions.some((p) => p.undated === true);
  const UNDATED_TIP = "no purchase date — counted as held for the whole graph (backtestYears in _settings)";
  const empty = positions.length === 0;
  const listRows = sortRows(positions, state.sort);

  const watchRows = d.watchlist || [];
  const look = lookOf(state, state.focusTicker);   // this window's open stock (lookBy, 12.12)
  const lookData = look.data;
  const focusHeld = state.focusTicker ? positions.find((p) => p.ticker === state.focusTicker) : null;
  const focusWatch = !focusHeld && state.focusTicker ? watchRows.find((w) => w.ticker === state.focusTicker) : null;
  let focus = focusHeld || focusWatch || null;
  if (!focus && state.focusTicker) focus = lookData ? rowFromLook(lookData) : { ticker: state.focusTicker, pending: true };
  if (focus && !focus.name && lookData && lookData.name) focus = Object.assign({}, focus, { name: lookData.name });
  const focusWatched = !!(focusWatch || (lookData && lookData.watched));

  const earnings = d.earnings || []; // all upcoming, soonest first (StockDetail looks up here)
  const calendar = calendarOf(d);      // earnings + announced ex-dividend dates, by date
  const hasExDiv = calendar.some((e) => e.kind === "exdiv");
  const alerts = (d.alerts || []).slice(-5).reverse();
  const hasPriceAlerts = !!(d.priceAlerts && typeof d.priceAlerts === "object");   // 12.9+ tracker
  const tOn = targetsOn(d);   // 12.10 target allocation; off = everything as before
  const driftOn = tOn && en("map.drift");
  const mapRange = state.mapRange === "DRIFT" && !driftOn ? "1D" : state.mapRange;
  // a ticker's bell (price alerts) and news dot, as switched on (row.bell, row.news)
  const rulesOn = (tk) => (bellOn ? rulesFor(d, tk) : []);
  const marksOf = (tk) => rulesOn(tk).length > 0 || (dotOn && markNewsOf(d, tk).length > 0);
  const title = winTitle(state, d);
  const fxMain = d.fx && d.fx.length ? d.fx[0] : null;


  const sessionTip = {
    open: "US market open", pre: "US pre-market (4:00–9:30 ET)",
    after: "US after-hours (16:00–20:00 ET)", closed: "US market closed",
  }[d.session] || "";

  // 12.7: realized gains and total return (absent in older data.json)
  const hasRealized = isFin(totals.realized);
  // every recorded sale without a known gain: the tracker's 0 is no break-even
  const unknownSales = isFin(d.salesUnknown) ? d.salesUnknown : 0;
  const realizedUnknown = hasRealized && unknownSales > 0 && isFin(d.salesCount) && unknownSales >= d.salesCount;
  const showDiv = isFin(totals.annualDividends) && totals.annualDividends > 0;   // no "div ~$0/yr"
  const perfBlk = d.performance && typeof d.performance === "object" ? d.performance : null;   // 12.8
  const showTotalReturn = isFin(totals.totalReturn) &&
    (hasRealized || (Array.isArray(d.sales) && d.sales.length > 0) ||
     (isFin(totals.dividendsReceived) && totals.dividendsReceived > 0));
  // 12.8: with the total-return row shown, only its %/yr joins that row (one
  // "total" in the header); otherwise its own row "+x% total · +y%/yr"
  const perfOn = perfShown(perfBlk);
  const perfYr = perfOn && isFin(perfBlk.xirrPct);
  const perfLeftOut = perfOn && Array.isArray(perfBlk.twrLeftOut) ? perfBlk.twrLeftOut.filter((t) => typeof t === "string") : [];
  const perfTip = !perfOn ? "" :
    "money-weighted since " + fmtIsoY(perfBlk.since) + ": purchases (at each day's exchange rate) vs sales, dividends and today's value, cash left out" +
    (perfYr ? " · " + pct1(perfBlk.totalPct) + " total, XIRR " + pct1(perfBlk.xirrPct) + "/yr" : " · no annual rate found for these cash flows") +
    (isFin(perfBlk.twrPct) ? "\ntime-weighted" + (typeof perfBlk.twrSince === "string" ? " since " + fmtIsoY(perfBlk.twrSince) : "") + ": " + pct1(perfBlk.twrPct) +
      (isFin(perfBlk.twrAnnualPct) ? " (" + pct1(perfBlk.twrAnnualPct) + "/yr)" : "") + ": the holdings' growth with new money taken out, cash left out" +
      (perfLeftOut.length ? "; without " + perfLeftOut.join(", ") + " (sold, no prices)" : "") : "");
  // ---- the layout (12.12): what this window shows at its size, from ONE pure
  // function (layoutFor). ctx: what is on (enabled and has something to show),
  // text widths for the header lines and the tab row, and a height estimate
  // per panel (est.*: LAYOUT_K rows; the carousel counts its tallest member).
  const G = state._geo || winGeom(state);
  const win = G.win;
  const K = LAYOUT_K;
  // the news panel (12.12): the stock open here, then news.top (no work while it is off)
  const newsCfg = enabled(win, "panel.news") ? newsCfgOf(win) : null;   // 13.1: the news page's options (null = the 13.0 panel)
  const newsQ = newsCfg ? newsQueryOf(state, newsCfg) : "";
  const feed = enabled(win, "panel.news") && newsOn(state) ? (newsCfg ? newsPageFeed(d, state, newsCfg) : newsFeedOf(d, state))
    : { rows: [], entries: [], busy: false };
  const newsEntries = newsCfg ? feed.entries || [] : feed.rows;   // the news page counts headings + stories as its rows
  const newsRowH = newsCfg && newsCfg.dense ? K.ROW_NEWS_DENSE : K.ROW_NEWS;
  const newsFilterOn = (w) => !!newsCfg && (w >= 240 || !!newsQ || !!newsCfg.q);   // an active filter is never hidden
  const tw = (text, px) => String(text).length * K.MONO * px;
  const salesN = Array.isArray(d.sales) ? d.sales.filter((s) => s && typeof s.ticker === "string").length : 0;
  const rulesN = alertRulesOf(d).length;
  const rulesBad = d.priceAlerts && isFin(d.priceAlerts.invalid) ? d.priceAlerts.invalid : 0;
  const isObj = (o) => !!(o && typeof o === "object" && !Array.isArray(o));
  const benchAny = !!(benchCap || benchLine || benchOff || benchCtl || benchNote);
  const lateAny = !!(lateShown.length || histProg || olderComing);
  // the annual rate joins the total-return row; with that row switched off it has its own
  const trOn = showTotalReturn && en("header.totalReturn");
  const has = { "header.div": showDiv, "header.realized": hasRealized, "header.totalReturn": showTotalReturn,
    "header.annual": perfOn && (trOn ? perfYr : true),
    "graph.bench": benchAny, "graph.late": lateAny, "graph.backtest": simShown,
    "panel.today": !empty, "panel.sectors": !empty, "panel.risk": !empty, "panel.days": !empty,
    "panel.sales": salesN > 0, "panel.income": isObj(d.dividends), "panel.rebalance": isObj(d.targets),
    "panel.priceAlerts": rulesN > 0 || rulesBad > 0, "panel.alerts": alerts.length > 0, "panel.news": true,
    // a tab row with nothing switched on in it goes; holdings needs a view (or the add
    // form of an empty portfolio, or a stock opened here); the footer one of its parts
    "graph.tabs": !!(rangeTabs.length || modesOn.length || inItems("graph.date") || readoutOn || inItems("graph.big") || from || state.mark),
    "panel.holdings": viewsOn.length > 0 || empty || !!focus,
    footer: inItems("footer.stats") || inItems("footer.updated") || inItems("footer.export") };
  const on = {};
  FEATURES.forEach((f) => { if (has[f.id] !== false && enabled(win, f.id)) on[f.id] = true; });
  const EYE = K.EYEBROW;
  const moversN = Math.max(((d.movers && d.movers.up) || []).length, ((d.movers && d.movers.down) || []).length);
  const rk = d.risk || {};
  const riskH = K.RISK_FIX + (perfBlk && perfBlk.ok === true && rk.real ? 2 * K.RISK_ROW : perfWhy(perfBlk) ? K.RISK_ROW : 0) +
    (rk.backtest ? K.RISK_ROW : 0) + (rk.unscored && rk.unscored.length ? K.RISK_ROW : 0);
  const addH = state.showAdd || empty ? K.ADD_FORM + importH(state) : 0;
  const holdList = !focus && !empty && state.view === "list";
  const est = {
    "panel.today": () => EYE + 5 + moversN * K.MOVER_ROW + K.TODAY_FIX,
    "panel.sectors": () => EYE + (d.themes || []).length * K.THEME_ROW,
    "panel.risk": () => EYE + riskH,
    "panel.days": (w, R) => EYE + (dayRows.length ? 3 + Math.min(R.days, dayRows.length) * K.ROW_DAY + K.PAGER : K.RISK_ROW + 5),
    "panel.holdings": (w, R) => {
      if (focus) return EYE + (focus.pending ? K.RISK_ROW + 8 : K.DETAIL + (hasPriceAlerts ? K.DETAIL_X : 0)) + (state.detailMsg ? K.RISK_ROW : 0);
      if (state.view === "watch") return EYE + addH + (watchRows.length ? watchRows.length * K.WATCH_ROW : K.EMPTY_MSG);
      if (empty) return EYE + addH + K.EMPTY_MSG;
      if (state.view === "map") return EYE + K.MAPTABS + addH + R.map;
      const r = Math.min(R.holdings, listRows.length);
      return EYE + addH + r * K.ROW_HOLD + (r < listRows.length && en("holdings.pages") ? K.DOTS : 0);
    },
    "panel.earnings": (w, R) => {
      const r = Math.min(R.earnings, calendar.length);
      return EYE + (calendar.length ? r * K.ROW_EARN : K.RISK_ROW + 3) + (r < calendar.length ? K.PAGER : 0);
    },
    "panel.sales": () => EYE + Math.min(salesN, state.salesExpanded === true ? salesN : SALES_ROWS) * K.SALE_ROW + (salesN > SALES_ROWS ? K.MORE : 0),
    "panel.income": () => EYE + K.INCOME,
    "panel.rebalance": () => EYE + K.REBAL_FIX + (d.targets && d.targets.set === true ? REBAL_ROWS * K.SALE_ROW : 0),
    "panel.priceAlerts": () => EYE + Math.min(rulesN, state.alertsExpanded ? rulesN : ALERT_ROWS) * K.RULE_ROW +
      (rulesN > ALERT_ROWS ? K.MORE : 0) + (state.alertMsg && !state.focusTicker ? K.RISK_ROW : 0),
    "panel.alerts": () => EYE + alerts.length * (K.ROW_ALERT + 1),
    "panel.news": (w, R) => {
      if (!newsCfg) return EYE + (feed.rows.length ? Math.min(R.news, feed.rows.length) * K.ROW_NEWS + (R.news < feed.rows.length ? K.PAGER : 0) : K.RISK_ROW + 3);
      const pgs = pageEntries(newsEntries, Math.max(1, R.news)), p0 = pgs[0];
      const body = p0.length ? p0.reduce((h, e) => h + (e.kind === "head" ? K.ROW_NEWS_GROUP : newsRowH), 0) : K.RISK_ROW + 3;
      return EYE + (newsFilterOn(w) && newsOn(state) ? K.NEWS_FILTER : 0) + body + (pgs.length > 1 ? K.PAGER : 0) + K.NEWS_STATUS;
    },
  };
  const headLines = [
    [{ id: "header.value", w: tw(money(totals.value), 22) },
     { id: "header.day", w: tw(signedMoney(totals.dayChange) + " · " + pct(totals.dayChangePct), 12) + K.COL_GAP }],
    [{ id: "header.fx", w: tw("prices " + signedMoney(totals.priceEffect) + (fxMain ? " · fx " + signedMoney(totals.fxEffect) + "  (" +
        fxMain.pair + " " + fxMain.rate + " " + pct(fxMain.changePct) + (d.fx.length > 1 ? " +" + (d.fx.length - 1) : "") + ")" : ""), 9) },
     { id: "header.pl", w: tw(state.plMode === "invested" ? "in " + money(totals.invested) + " → " + signedMoney(totals.plVsInvested) + " (" + pct(totals.plVsInvestedPct) + ")"
        : "P&L " + signedMoney(totals.pl) + " (" + pct(totals.plPct) + ")", 9) + K.COL_GAP },
     { id: "header.div", w: showDiv ? tw(" · div ~" + money(totals.annualDividends) + "/yr", 9) : 0 }],
    [{ id: "header.realized", w: hasRealized ? tw("realized " + signedMoney(totals.realized) + " · ytd " + signedMoney(totals.realizedYtd), 9) : 0 },
     { id: "header.totalReturn", w: tw("total return " + signedMoney(totals.totalReturn) + " (" + pct(totals.totalReturnPct) + ")", 9) + K.COL_GAP }]
      .concat(trOn && perfYr ? [{ id: "header.annual", w: tw(" · " + pct1(perfBlk.xirrPct) + "/yr", 9) }] : []),
    trOn ? [] : [{ id: "header.annual", w: perfOn ? tw(pct1(perfBlk.totalPct) + " total · " + pct1(perfBlk.xirrPct) + "/yr", 9) : 0 }],
  ];
  const tabW = (label, tight) => tw(label, 9) + (tight ? K.CHIP_TIGHT : K.CHIP_PAD);
  const dateOn = inItems("graph.date");
  const tabWs = rangeTabs.map((r) => tabW(r, btTabs.length > 0))
    .concat(rangeTabs.length && modesOn.length ? [K.TAB_SEP] : [], modesOn.map((m) => tabW(m === "pl" ? "p&l" : m)), dateOn ? [K.DATE_BOX] : []);
  if (from) tabWs.push(tabW("from " + fmtDayY(from.t) + " 00:00 ×") + 4);
  else if (state.mark) tabWs.push(tabW("start here") + 4);
  const sectorFacets = sectorMode && sectorData && sectorData.t && sectorData.t.length >= 2 ? 1 + (sectorData.themes || []).length : 0;
  // the welcome card (13.4): while the holdings are still the demo portfolio's,
  // in the first window only, until "hide" (set_setting welcome false)
  // (only where its buttons work: the + form lives in the holdings panel)
  const welcomeOn = d.demo === true && uiPrefs(state).welcome !== false && !(G.win && G.win.idx) && !compactOf(state) &&
    enabled(win, "panel.holdings");
  const L = layoutFor(win, {
    Wu: G.Wu, Hu: G.Hu, on: on, order: itemsOf(win), est: est, head: headLines, tabs: tabWs,
    lists: { holdings: holdList ? listRows.length : null, earnings: calendar.length || null,
      days: dayRows.length || null, news: newsEntries.length || null, map: !focus && !empty && state.view === "map" },
    big: bigOn, sector: sectorMode, facets: sectorFacets, focusSector: !!focusName,
    focusList: focusName && focusName !== "portfolio" ? 5 + 2 * K.RISK_ROW : 0,
    readoutOwnLine: readoutOwnLine, notesForced: !!state.dayMsg || sectorMode, benchLine: benchAny, lateLine: lateAny,
    simCap: simShown, benchPick: benchCtl && !!state.benchPick, loading: env.status === "loading",
    warn: !!((d.missingTickers || []).length || env.lastFetchFailed), welcome: welcomeOn,
    mapWide: state.view === "map", expanded: !!state.mapExpanded, tOn: tOn, undated: anyUndated,
    cellsOn: { spark: on["row.spark"], vol: on["row.vol"], drift: on["row.drift"], day: !!on["row.day"],
      value: on["row.value"], pl: on["row.pl"], price: on["row.price"] },
  });
  const sh = (id) => !!L.show[id];
  const editor = editorNode(state, dispatch, d, L, has);   // the ⚙ editor (null while closed)
  // folded (or switched off): the index line and its caption, the "starts later" note
  const bOn = sh("graph.bench"), lOn = sh("graph.late");
  if (!bOn) { benchLine = null; benchCap = null; benchOff = false; benchCtl = false; benchNote = null; }
  if (!lOn) { lateShown = []; histProg = null; olderComing = false; }
  const headOn = HEAD_IDS.some(sh);
  const graphOn = sh("graph") || sh("graph.mini");
  const colsGap = headOn || graphOn;
  const TAB_WRAP = { display: "flex", flexWrap: "wrap", alignItems: "baseline", rowGap: 2, flex: "1 1 auto", minWidth: 0 };
  const GAP_IN = K.GAP - 10;   // the part of a sectionGap inside an element's box (padding + border; the margin is outside)
  const lineStyle = (i, st) => (L.head[i] > 1 ? Object.assign({}, st, { flexWrap: "wrap", rowGap: 2 }) : st);
  const narrow = L.unitW < K.COL_BASE;   // columns narrower than 12.11's: labels are cut with "…"
  const CUT = { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 };
  // pages from the rows the layout gives each list
  const rowsH = L.rows.holdings, rowsE = L.rows.earnings;
  const pages = Math.max(1, Math.ceil(listRows.length / rowsH));
  const page = state.pinnedPage !== null && state.pinnedPage < pages
    ? state.pinnedPage
    : Math.floor(state.rot / TICKS_PER_PAGE) % pages;
  const pageRows = listRows.slice(page * rowsH, (page + 1) * rowsH);
  const earnPages = Math.max(1, Math.ceil(calendar.length / rowsE));
  const earnPage = Math.min(state.earnPage, earnPages - 1);
  const earningsShown = calendar.slice(earnPage * rowsE, (earnPage + 1) * rowsE);

  // the carousel's sections (pinnedSection indexes this whole list; a unit
  // of the layout shows its own members, rotating when there are several)
  const sections = [
    { id: "panel.today", label: "today · " + curSymbol() + " movers · top 5", node: <SectionToday d={d} /> },
    { id: "panel.sectors", label: "sectors · " + effRange + " trend · value · day · vol",
      node: <SectionThemes d={d} range={effRange} dispatch={dispatch} w={L.unitW} /> },
    { id: "panel.risk", label: d.performance || (d.risk && (d.risk.real || d.risk.backtest)) ? "risk · drawdown · beta · volatility" : "risk · volatility (3 mo)",
      node: <SectionRisk d={d} /> },
    { id: "panel.days", label: "days · value at each day's end",
      node: <SectionDays d={d} state={state} dispatch={dispatch} daily={dayRows} rows={L.rows.days} /> },
  ];
  // the title row: fixed above the scrolling body, and the drag handle
  const titleRow = (
      <div className={rowFlex}>
        <span className={eyebrow} style={{ cursor: "pointer" }} onClick={titleClick(state, dispatch)}
          title={(sessionTip ? sessionTip + "\n" : "") + "click: one line · drag the row to move the widget"}>
          {title}&nbsp;
          <span style={{ color: d.session === "open" ? C.up
            : d.session === "pre" || d.session === "after" ? C.amber
            : C.dim }}>●</span>
          <span> {d.session === "pre" ? "pre-market"
            : d.session === "after" ? "after hours"
            : d.session === "open" ? "open" : "closed"}</span>
        </span>
        <span className={eyebrow} title="display currency — set with _settings.currency in positions.json">
          {gearNode(state, dispatch, { marginRight: 8 })}{d.currency}
        </span>
      </div>
  );
  // each header line shows the items the layout keeps; a line wider than the
  // window wraps (lineStyle), a line with nothing left goes
  const headerBlock = !headOn ? null : (
    <div data-pw-panel="header" data-pw-est={L.est.header}>
      {sh("header.value") || sh("header.day") ? (
      <div className={rowFlex} style={lineStyle(0, { marginTop: 3 })}>
        {sh("header.value") ? (
        <span className={css`${mono} font-size: 22px; letter-spacing: -0.02em;`}>
          {money(totals.value)}
        </span>
        ) : null}
        {sh("header.day") ? (
        <span className={mono} style={{ fontSize: 12, color: upDown(totals.dayChange || 0) }} title="today's change">
          {signedMoney(totals.dayChange)} · {pct(totals.dayChangePct)}
        </span>
        ) : null}
      </div>
      ) : null}
      {sh("header.fx") || sh("header.pl") || sh("header.div") ? (
      <div className={rowFlex} style={lineStyle(1, { marginTop: 3 })}>
        {sh("header.fx") ? (
        <span className={css`${mono} font-size: 9px; color: ${C.dim};`}
          title={fxMain ? "today's change from prices vs. from exchange rates" + (d.fx.length > 1 ? "\n" + d.fx.map((f) => f.pair + " " + f.rate + " " + pct(f.changePct)).join("\n") : "") : "today's change from prices"}>
          prices {signedMoney(totals.priceEffect)}
          {fxMain ? " · fx " + signedMoney(totals.fxEffect) + "  (" + fxMain.pair + " " + fxMain.rate + " " + pct(fxMain.changePct) + (d.fx.length > 1 ? " +" + (d.fx.length - 1) : "") + ")" : ""}
        </span>
        ) : null}
        {sh("header.pl") || sh("header.div") ? (
        <span className={sh("header.pl") ? css`${mono} font-size: 9px; color: ${C.dim}; cursor: pointer;` : css`${mono} font-size: 9px; color: ${C.dim};`}
          onClick={sh("header.pl") ? () => dispatch({ type: "TOGGLE_PL_MODE" }) : undefined}
          title={sh("header.pl") ? "click to switch: P&L against what you paid, or against the money you put in (_invested in positions.json)" : undefined}>
          {!sh("header.pl") ? null : state.plMode === "invested" ? (
            totals.invested ? (
              <span>
                in {money(totals.invested)} → <span style={{ color: upDown(totals.plVsInvested || 0) }}>
                  {signedMoney(totals.plVsInvested)} ({pct(totals.plVsInvestedPct)})</span>
              </span>
            ) : (
              <span>vs invested — set _invested in positions.json</span>
            )
          ) : (
            <span>
              P&L <span style={{ color: upDown(totals.pl || 0) }}>
                {signedMoney(totals.pl)} ({pct(totals.plPct)})</span>
            </span>
          )}
          {sh("header.div") ? (sh("header.pl") ? " · div ~" : "div ~") : null}{sh("header.div") ? money(totals.annualDividends) : null}{sh("header.div") ? "/yr" : null}
        </span>
        ) : null}
      </div>
      ) : null}
      {sh("header.realized") || sh("header.totalReturn") ? (
        <div className={rowFlex} style={lineStyle(2, { marginTop: 2 })}>
          {hasRealized && !sh("header.realized") ? null : (
          <span className={css`${mono} font-size: 9px; color: ${C.dim};`}
            title="gains from recorded sales (oldest shares sold first, no fees) · ytd = sales this year">
            {realizedUnknown ? (
              <span title="no purchase price for the shares sold, so the gain is unknown">
                {"realized — (" + unknownSales + " unknown)"}
              </span>
            ) : hasRealized ? (
              <span>
                realized <span style={{ color: upDown(totals.realized) }}>{signedMoney(totals.realized)}</span>
                {" · ytd "}<span style={{ color: isFin(totals.realizedYtd) ? upDown(totals.realizedYtd) : C.dim }}>{signedMoney(isFin(totals.realizedYtd) ? totals.realizedYtd : null)}</span>
              </span>
            ) : null}
          </span>
          )}
          {sh("header.totalReturn") ? (
            <span className={css`${mono} font-size: 9px; color: ${C.dim};`}
              title={perfOn ? "total return: unrealized + realized + dividends received, cost at today's exchange rate\n" + perfTip
                : "unrealized + realized + dividends received"}>
              total return <span style={{ color: upDown(totals.totalReturn) }}>
                {signedMoney(totals.totalReturn)}{isFin(totals.totalReturnPct) ? " (" + pct(totals.totalReturnPct) + ")" : ""}</span>
              {perfYr && sh("header.annual") ? " · " : null}
              {perfYr && sh("header.annual") ? <span style={{ color: upDown(perfBlk.xirrPct) }}>{pct1(perfBlk.xirrPct) + "/yr"}</span> : null}
            </span>
          ) : null}
        </div>
      ) : null}
      {perfOn && !(showTotalReturn && sh("header.totalReturn")) && sh("header.annual") ? (
        <div className={rowFlex} style={lineStyle(3, { marginTop: 2 })}>
          <span className={css`${mono} font-size: 9px; color: ${C.dim};`} title={perfTip}>
            <span style={{ color: upDown(perfBlk.totalPct) }}>{pct1(perfBlk.totalPct)}</span>{" total"}
            {perfYr ? " · " : null}
            {perfYr ? <span style={{ color: upDown(perfBlk.xirrPct) }}>{pct1(perfBlk.xirrPct) + "/yr"}</span> : null}
          </span>
        </div>
      ) : null}
    </div>
  );

  const missing = d.missingTickers || [];
  // the export's message (12.11) stays EXPORT_TICKS data ticks
  const exportShown = state.exportMsg && state.tick - state.exportMsg.tick <= EXPORT_TICKS ? state.exportMsg : null;
  // the footer line (a fold unit) and the loading line (always); then the
  // "+N hidden" hint when the layout folded anything
  const footGap = headOn || graphOn || L.cols.length > 0 || !!state.mapExpanded;
  // its parts as switched on (footer.stats / .updated / .export); with the
  // footer off or folded its red warnings (no data, last refresh failed) stay
  const failed = !!env.lastFetchFailed;
  const footOn = sh("footer");
  const fStats = footOn && inItems("footer.stats"), fUpd = footOn && inItems("footer.updated"), fExp = footOn && inItems("footer.export");
  const upText = fUpd && env.status !== "loading" ? "updated " + fmtAge(env.cacheAgeSeconds) + " ago" : "";
  // (only "updated" switched on while loading: nothing to say yet, no empty line)
  const welcomeBlock = !welcomeOn ? null : (
    <div className={welcomeCss} data-pw-panel="welcome" data-pw-est={LAYOUT_K.WELCOME}>
      <div className={rowFlex} style={{ alignItems: "baseline" }}>
        <span className={eyebrow} style={{ color: C.ink }}>welcome — this is a demo portfolio</span>
        <span className={linkBtn} style={{ fontSize: 8.5 }} data-pw-welcome="hide"
          title="hide this card for good (it comes back only with welcome: true in positions.json)"
          onClick={() => saveSetting("welcome", "false", dispatch)}>hide</span>
      </div>
      <div className={welcomeLine}><span style={edDim}>1.</span><span>your stocks:</span>
        <span className={tabBtn} title="add one stock at a time (any stock Yahoo Finance lists)" data-pw-welcome="add"
          onClick={() => { if (!state.showAdd) dispatch({ type: "TOGGLE_ADD" }); }}>+ add one</span>
        <span className={tabBtn} title="paste a list, or pick a CSV file exported from your broker" data-pw-welcome="import"
          onClick={() => openImport(state, dispatch)}>import a list…</span>
        <span className={tabBtn} title="remove the demo holdings first (a backup of the file is kept)" data-pw-welcome="fresh"
          onClick={() => { if (!state.showAdd) dispatch({ type: "TOGGLE_ADD" });
            dispatch({ type: "SET_PENDING", pending: { cmd: helper(["sell", "--reset-all"]), label: "remove the demo holdings? (a backup is kept)" } }); }}>start fresh</span>
      </div>
      <div className={welcomeLine}><span style={edDim}>2.</span><span>your currency, index and look:</span>
        <span className={tabBtn} data-pw-welcome="portfolio" onClick={() => dispatch({ type: "OPEN_EDITOR", group: "portfolio" })}>⚙ portfolio settings</span>
      </div>
      <div className={welcomeLine}><span style={edDim}>3.</span><span>what this window shows:</span>
        <span className={tabBtn} data-pw-welcome="panels" onClick={() => dispatch({ type: "OPEN_EDITOR", group: "panels" })}>⚙ what it shows</span>
        <span style={edDim}>— or drag the edges to resize it</span>
      </div>
    </div>
  );
  // the update offer (13.4): GitHub's newest release when newer than this VERSION
  // (not after "later" for that version); the result of the last update.sh run
  const updInfo = d.update && typeof d.update === "object" ? d.update : null;
  const upd = updInfo && updInfo.latest && newerVersion(updInfo.latest, VERSION) && state.updateLater !== updInfo.latest ? updInfo : null;
  const updRes = env.updateResult && typeof env.updateResult === "object" ? env.updateResult : null;
  const updMsg = state.updateMsg && state.tick - state.updateMsg.tick <= EXPORT_TICKS ? state.updateMsg
    : updRes && updRes.ok === true && updRes.to === VERSION ? { text: "updated to " + updRes.to + " ✓", err: false }
    : updRes && updRes.ok === false && updRes.message ? { text: "update failed: " + String(updRes.message).slice(0, 90), err: true } : null;
  const askLine = upd && state.updateAsk ? (
    <div className={css`${mono} font-size: 8.5px; color: ${C.amber}; margin-top: 4px; line-height: 1.5;`} data-pw-update-ask="1">
      {"update to " + upd.latest + " now? Your holdings, settings and history stay; the widget reloads by itself. "}
      <span className={linkBtn} style={{ color: C.ink }} onClick={() => runUpdate(upd, dispatch)}>yes, update</span>{" · "}
      {upd.url ? <span className={linkBtn} onClick={() => run("open " + shq(upd.url))}>what's new</span> : null}{upd.url ? " · " : ""}
      <span className={linkBtn} onClick={() => dispatch({ type: "UPDATE_LATER", version: upd.latest })}>later</span>
    </div>
  ) : null;
  const footerBlock = (
    <div>
      {askLine}
      {fStats || fExp || upText || missing.length || failed || upd || updMsg ? (
      <div className={footGap ? css`${sectionGap} display:flex; justify-content:space-between;` : css`display:flex; justify-content:space-between;`}
        data-pw-panel="footer" data-pw-est={L.est.footer + (footGap ? GAP_IN : 0)}>
        <span className={css`${mono} font-size: 8px; color: ${C.dim};`}>
          {fStats && d.derivedBasisCount > 0 ? (
            <span title="≈ = no purchase price given, so the close on the buy date is used as the cost">
              {"≈ " + d.derivedBasisCount + " estimated cost · "}
            </span>
          ) : null}
          {fStats ? (
          <span title="value snapshots recorded so far (one per refresh); before them the graph is rebuilt from past prices (≈ when you hover)">
            {d.snapshotCount} snapshots
          </span>
          ) : null}
          {missing.length ? (
            <span style={{ color: C.down }} title={"Yahoo has no data for: " + missing.join(" ") + "\n(typo? delisted?) — they're left out of the totals"}>
              {(fStats ? " · " : "") + "no data: " + missing.slice(0, 4).join(" ") + (missing.length > 4 ? " +" + (missing.length - 4) : "")}
            </span>
          ) : null}
        </span>
        <span className={css`${mono} font-size: 8px; color: ${C.dim};`}>
          {upd ? (
            <span className={linkBtn} style={{ fontSize: 8, color: C.amber }} data-pw-update={upd.latest}
              title={"version " + upd.latest + " is out (you have " + VERSION + ") — click to update; your holdings and history stay"}
              onClick={() => dispatch({ type: "UPDATE_ASK", on: !state.updateAsk })}>{"update " + upd.latest + " ▸"}</span>
          ) : null}
          {upd && (updMsg || fExp || failed || upText) ? " · " : ""}
          {updMsg ? <span style={{ color: updMsg.err ? C.down : C.up }} data-pw-update-msg={updMsg.err ? "err" : "ok"} title={updMsg.text}>{updMsg.text}</span> : null}
          {updMsg && (fExp || failed || upText) ? " · " : ""}
          {fExp ? (
          <span className={linkBtn} style={{ fontSize: 8 }} onClick={() => exportCsv(state, dispatch)}
            title="save holdings, daily values and sales as CSV files in ~/Documents/Portfolio and show them in Finder">export</span>
          ) : null}
          {fExp && exportShown ? (
            <span style={{ color: exportShown.err ? C.down : C.dim }} title={exportShown.tip || ""}>{" " + exportShown.text}</span>
          ) : null}
          {fExp && (failed || upText || (fUpd && env.status !== "loading")) ? " · " : ""}
          {failed ? (
            <span style={{ color: C.down }} title={env.errorText || ""}>{"last refresh failed" + (fUpd ? " · " : "")}</span>
          ) : null}
          {upText}
        </span>
      </div>
      ) : null}
      {env.status === "loading" ? <LoadingLine progress={env.progress} /> : null}
      {!headOn && !graphOn && !L.cols.length && !state.mapExpanded && !footOn && !missing.length && !failed && env.status !== "loading" ? (
        <div className={css`${mono} font-size: 9px; color: ${C.dim}; margin-top: 6px; cursor: pointer;`} data-pw-hint="empty"
          onClick={() => dispatch({ type: "TOGGLE_EDITOR", group: "panels" })}>empty window — ⚙ to add features</div>
      ) : null}
      {L.hint ? (
        <div className={css`${mono} font-size: 8px; color: ${C.dim}; margin-top: 4px; cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;`}
          data-pw-hint="1" title={"hidden because the window is too short: " + L.folded.map((id) => (FEATURE_BY[id] ? FEATURE_BY[id].label : id)).join(", ") +
            "\nmake the window taller, or change what it shows with ⚙"}
          onClick={() => dispatch({ type: "TOGGLE_EDITOR", group: editGroupOf(L.folded[0]) })}>{"+" + L.folded.length + " hidden — ⚙"}</div>
      ) : null}
    </div>
  );

  // the header readout: the value (or p&l) under the crosshair, else the change over the range
  const readoutNode = (
    <span className={mono} style={{ fontSize: 10, whiteSpace: "nowrap" }}>
      {sectorMode ? (
        hovering || markT !== null
          ? <span style={{ color: C.dim }}>{fmtStamp(activeT, baseRange !== "1Y" && !btRange)}</span>
          : sectorData ? (
            <span style={{ color: C.dim }}>portfolio <span style={{ color: upDown(sectorData.total[sectorData.total.length - 1] || 0) }}>
              {pct(sectorData.total[sectorData.total.length - 1])}</span></span>
          ) : ""
      ) : readout ? (
        <span>
          <span style={{ color: C.ink, fontSize: 11 }}>{plGraph ? signedExact(plOf(readout)) : money(readout.v, true)}</span>
          <span style={{ color: C.dim }}>{"  " + fmtStamp(readout.t, !readout.d && !readout.sim && !btRange && !(readout.approx && baseRange === "1Y"))}</span>
        </span>
      ) : rangePerf ? (
        <span style={{ color: upDown(rangePerf.gain) }}
          title={"change over the range" + (Math.abs(rangePerf.flow) > 0.5 ? " — " + signedMoney(rangePerf.flow) + " of new buys left out" : "") +
            (rangePerf.twr ? "\nthe % is time-weighted: the growth of each stretch between purchases, chained, so new money never counts as a gain (it includes the simulated years)"
              : Math.abs(rangePerf.flow) > 0.5 ? "\nthe % is the return on money while it was invested (new money counts from the middle of the range), so it can differ from the P&L % up top (gain ÷ everything you paid)" : "")}>
          {signedMoney(rangePerf.gain) + " · " + pct(rangePerf.pct)}
        </span>
      ) : ""}
    </span>
  );

  /* -------- expanded heatmap: the map takes over the whole widget -------- */
  if (state.mapExpanded) {
    return frame(state, dispatch, titleRow, (
      <div data-pw-t={Math.round(L.T)} data-pw-scroll={L.scroll ? "1" : "0"}>
        {editor}
        {headerBlock}
        {welcomeBlock}
        <div className={headOn ? sectionGap : ""}>
          <div className={rowFlex}>
            <span className={eyebrow}>holdings · map</span>
            <MapTabs state={state} dispatch={dispatch} drift={driftOn} range={mapRange} extra={
              <span className={tabBtn} title="back to the normal layout"
                onClick={() => dispatch({ type: "TOGGLE_MAP_EXPAND" })}>collapse</span>
            } />
          </div>
          <Heatmap positions={positions} range={mapRange} w={L.mapBigW} h={L.mapBigH} d={d}
            onSelect={(t) => openStock(t, dispatch, state)} />
        </div>
        {footerBlock}
      </div>
    ), hover);
  }

  const carouselNode = (ids, first, attrs) => {
    const list = sections.map((sc, i) => Object.assign({ i: i }, sc)).filter((sc) => ids.indexOf(sc.id) >= 0);
    if (!list.length) return null;
    const pinned = list.length > 1 && state.pinnedSection !== null ? list.find((sc) => sc.i === state.pinnedSection) || null : null;
    const cur = pinned || list[Math.floor(state.rot / TICKS_PER_PAGE) % list.length];
    return (
      <div className={first ? undefined : sectionGap} {...attrs}>
        <div className={rowFlex}>
          <span className={eyebrow} style={narrow ? CUT : undefined} title={narrow ? cur.label : undefined}>
            {cur.label}{pinned ? " ⌖" : ""}
          </span>
          {list.length > 1 ? (
            <span style={narrow ? { flex: "none" } : undefined}>
              {list.map((sc) => (
                <span key={sc.label}
                  onClick={() => dispatch({ type: "SET_SECTION", section: sc.i })}
                  className={dot}
                  title={sc.label + (state.pinnedSection === sc.i ? " (pinned — click to resume rotating)" : " — click to pin")}
                  style={{ color: sc === cur ? C.ink : C.dim }}>●</span>
              ))}
            </span>
          ) : null}
        </div>
        {cur.node}
      </div>
    );
  };
  const holdingsNode = (first, attrs) => (
          <div className={first ? "" : sectionGap} {...attrs}>
            {focus ? (
              <div>
                <div className={rowFlex}>
                  <span className={eyebrow} style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: L.focusEyebrowW }}
                    title={(focus.name || "") + (focus.theme ? " · " + focus.theme : "")}>
                    {focus.ticker}{focus.name || focus.theme ? " · " + (focus.name || focus.theme) : ""}
                    {focusHeld ? "" : focusWatched ? " · watching" : ""}
                  </span>
                  <span style={{ whiteSpace: "nowrap" }}>
                    {focusHeld || focus.pending ? null : (
                      <span className={tabBtn} title={focusWatched ? "stop monitoring" : "monitor it in the watch tab"}
                        onClick={() => watchToggle(focus.ticker, !focusWatched, dispatch)}>
                        {focusWatched ? "unwatch" : "watch"}
                      </span>
                    )}
                    {focus.pending || !addOn ? null : (
                      <span className={tabBtn} title="record a buy of this stock"
                        onClick={() => dispatch({ type: "PREFILL", ticker: focus.ticker })}>buy</span>
                    )}
                    <span className={tabBtn} onClick={() => dispatch({ type: "SET_STOCK", ticker: null })}>back</span>
                  </span>
                </div>
                {state.detailMsg ? (
                  <div className={css`${mono} font-size:8.5px; color:${C.amber}; margin-top:3px;`}>{state.detailMsg}</div>
                ) : null}
                {focus.pending ? (
                  <div className={css`font-size:10px; color:${look.error ? C.down : C.dim}; margin-top:8px;`}>
                    {look.error || "looking up " + focus.ticker + "…"}
                  </div>
                ) : (
                  <StockDetail p={focus} earn={earnings.find((e) => e.ticker === focus.ticker)}
                    look={look} range={state.detailRange} dispatch={dispatch} chartW={L.priceW}
                    tg={tOn && en("detail.target") && bucketFor(d, focus.targetKey) ? Object.assign({ band: bandOf(d) }, bucketFor(d, focus.targetKey)) : null} />
                )}
                {!focus.pending && hasPriceAlerts && (en("detail.alerts") || en("detail.news")) ? (   // 12.9+ data: the alert box and headlines exist
                  <DetailExtras p={focus} d={d} state={state} dispatch={dispatch} alerts={en("detail.alerts")} news={en("detail.news")} />
                ) : null}
              </div>
            ) : (
              <div>
                <div className={rowFlex}>
                  <span className={eyebrow} style={narrow ? CUT : { whiteSpace: "nowrap" }}>
                    {state.view === "watch" ? "watchlist" : "holdings"}
                    {empty || state.view !== "list" ? "" : " " + (page + 1) + "/" + pages}
                    {state.view === "list" && state.pinnedPage !== null ? " ⌖" : ""}
                  </span>
                  <span style={narrow ? { flex: "none", whiteSpace: "nowrap" } : undefined}>
                    {addOn ? (
                    <span className={state.showAdd || empty ? css`${tabBtn} ${tabActive}` : tabBtn}
                      title="buy or sell (updates positions.json)"
                      onClick={() => dispatch({ type: "TOGGLE_ADD" })}>+</span>
                    ) : null}
                    {(empty && !watchRows.length) || viewsOn.length < 2 ? null : viewsOn.map((v) => (
                      <span key={v}
                        className={v === state.view ? css`${tabBtn} ${tabActive}` : tabBtn}
                        title={v === "map" ? "heatmap: tile size = value, color = move (or volatility)"
                          : v === "watch" ? "stocks you monitor without holding them" : "list"}
                        onClick={() => dispatch({ type: "SET_VIEW", view: v })}>
                        {v === "watch" && watchRows.length ? "watch " + watchRows.length : v}
                      </span>
                    ))}
                    {!empty && state.view === "list" && en("holdings.sort") ? (
                      <span className={tabBtn} title={SORT_TIP[state.sort] + " — click to change"}
                        onClick={() => dispatch({ type: "CYCLE_SORT" })}>
                        {"sort " + (state.sort === "value" ? curSymbol() : SORT_LABEL[state.sort])}
                      </span>
                    ) : null}
                  </span>
                </div>
                {!empty && state.view === "map" ? (
                  // the map's own controls on a line of their own: next to list/map/watch
                  // they ran past the column into the one beside it
                  <div className={css`display: flex; justify-content: flex-end; flex-wrap: wrap; min-width: 0; margin-top: 2px;`}>
                    <MapTabs state={state} dispatch={dispatch} drift={driftOn} range={mapRange} extra={
                      <span className={tabBtn} title="make the map fill the widget"
                        onClick={() => dispatch({ type: "TOGGLE_MAP_EXPAND" })}>⤢</span>
                    } />
                  </div>
                ) : null}
                {state.showAdd || empty ? <AddForm state={state} dispatch={dispatch} empty={empty} positions={positions} /> : null}
                {state.view === "watch" ? (
                  watchRows.length === 0 ? (
                    <div className={css`font-size:10px; color:${C.dim}; margin-top:8px; line-height:1.5;`}>
                      Nothing watched yet. Search a stock with + and press "watch" to monitor
                      it here — price, day move, sparkline and volatility, plus the big-move alerts.
                    </div>
                  ) : watchRows.map((w) => (
                    <div key={w.ticker} className={rowFlex} style={{ marginTop: 4 }}>
                      <span className={mono} onClick={() => openStock(w.ticker, dispatch, state)} title={(w.name || "") + " — click for details"}
                        style={withMarks(marksOf(w.ticker), { fontSize: 10, width: 60, cursor: "pointer", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" })}>
                        {marksOf(w.ticker) ? <span style={TICKER_SHRINK}>{w.ticker}</span> : w.ticker}{w.stale ? <span style={{ color: C.down }} title="last known price">!</span> : null}<Bell rules={rulesOn(w.ticker)} />
                      </span>
                      <span style={{ flex: 1, minWidth: 0, fontSize: 9, color: C.dim, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", paddingRight: 6 }}>{w.name || w.theme}</span>
                      {L.watchCells.spark ? <Spark values={w.spark} w={L.watchSparkW === LAYOUT_K.SPARK ? undefined : L.watchSparkW} /> : null}
                      {L.watchCells.vol ? <VolBadge pct={w.volPct} score={w.volScore} /> : null}
                      {on["row.day"] ? (
                      <span className={mono} title="today" style={{ fontSize: 9, width: 44, textAlign: "right", color: upDown(w.dayChangePct || 0) }}>
                        {pct(w.dayChangePct)}
                      </span>
                      ) : null}
                      <span className={mono} title={"price in " + w.currency} style={{ fontSize: 9, width: 54, textAlign: "right" }}>
                        {num(w.price, w.price >= 1000 ? 0 : 2)}
                      </span>
                      <span className={dot} title="stop watching" style={{ color: C.dim, width: 10, textAlign: "right" }}
                        onClick={() => watchToggle(w.ticker, false, dispatch, "ADD_MSG")}>×</span>
                    </div>
                  ))
                ) : empty ? (
                  <div className={css`font-size:10px; color:${C.dim}; margin-top:8px; line-height:1.5;`}>
                    No holdings yet. Add one above, or open positions.json ("show file")
                    and list them there — the README shows the format.
                  </div>
                ) : state.view === "map" ? (
                  <Heatmap positions={positions} range={mapRange} w={L.mapW} h={L.mapH} d={d}
                    onSelect={(t) => openStock(t, dispatch, state)} />
                ) : (
                  // with any undated holding the ticker column takes the row's slack
                  // (same for every row and page, so the columns stay aligned) to
                  // make room for the "undated" tag
                  pageRows.map((p) => { const marked = marksOf(p.ticker); return (
                    <div key={p.ticker} className={rowFlex} style={anyUndated ? { marginTop: 4, columnGap: 3 } : { marginTop: 4 }}>
                      <span className={mono}
                        onClick={() => openStock(p.ticker, dispatch, state)}
                        title={(p.name || "") + " — click for details" + (high52Tip(p) ? "\n" + high52Tip(p) : "")}
                        style={withMarks(marked, anyUndated
                          ? { fontSize: 10, flex: 1, minWidth: 52, cursor: "pointer", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }
                          : { fontSize: 10, width: 52, cursor: "pointer", whiteSpace: "nowrap", overflow: "hidden" })}>
                        {marked ? <span style={TICKER_SHRINK}>{p.ticker}</span> : p.ticker}
                        {p.basisDerived ? <span style={{ color: C.amber }} title="≈ estimated cost (no purchase price given)">≈</span> : null}
                        {p.stale ? <span style={{ color: C.down }} title="last known price — the latest fetch failed">!</span> : null}
                        <Bell rules={rulesOn(p.ticker)} />
                        {dotOn ? <NewsMark items={markNewsOf(d, p.ticker, p.dayChangePct)} /> : null}
                        {p.undated === true ? (
                          <span title={UNDATED_TIP} style={{ fontSize: 7, color: C.dim, marginLeft: 3, letterSpacing: "0.02em" }}>undated</span>
                        ) : null}
                      </span>
                      {/* the cells that fit the column (layoutFor: spark → 30 px, spark, price, value, vol, drift, P&L go first) */}
                      {L.cells.spark ? <Spark values={p.spark} w={L.sparkW === LAYOUT_K.SPARK ? undefined : L.sparkW} /> : null}
                      {L.cells.vol ? <VolBadge pct={p.volPct} score={p.volScore} /> : null}
                      {L.cells.drift ? <DriftBadge p={p} d={d} /> : null}
                      {L.cells.day ? (
                      <span className={mono} title="today" style={{ fontSize: 9, width: LAYOUT_K.CELL.day, textAlign: "right", color: upDown(p.dayChangePct || 0) }}>
                        {pct(p.dayChangePct)}
                      </span>
                      ) : null}
                      {L.cells.price ? (
                        <span className={mono} title={"price" + (p.currency ? " in " + p.currency : "")} style={{ fontSize: 9, width: LAYOUT_K.CELL.price, textAlign: "right" }}>
                          {isFin(p.price) ? num(p.price, p.price >= 1000 ? 0 : 2) : "—"}
                        </span>
                      ) : null}
                      {L.cells.value ? (
                        <span className={mono} title="value" style={{ fontSize: 9, width: LAYOUT_K.CELL.value, textAlign: "right" }}>
                          {money(p.value)}
                        </span>
                      ) : null}
                      {L.cells.pl ? (
                        <span className={mono} title="P&L since you bought" style={{ fontSize: 9, width: LAYOUT_K.CELL.pl, textAlign: "right", color: upDown(p.plPct || 0) }}>
                          {pct(p.plPct)}
                        </span>
                      ) : null}
                    </div>
                  ); })
                )}
                {!empty && state.view === "list" && pages > 1 && en("holdings.pages") ? (
                  <div style={{ marginTop: 5, textAlign: "center", lineHeight: "10px" }}>
                    {Array.from({ length: pages }).map((_, i) => (
                      <span key={i}
                        onClick={() => dispatch({ type: "SET_PAGE", page: i })}
                        className={dot}
                        title={"page " + (i + 1) + (state.pinnedPage === i ? " (pinned — click to resume rotating)" : " — click to pin this page")}
                        style={{ color: i === page ? C.ink : C.dim }}>●</span>
                    ))}
                  </div>
                ) : null}
              </div>
            )}
          </div>
  );
  // first in its column: no wrapper (12.11's right column starts with these rows)
  const earningsRows = () => [
          <div key="eh" className={rowFlex}>
            <span className={eyebrow} style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}
              title={"upcoming earnings · ± = the move options traders are pricing in for the report (shown within 30 days)" +
              (hasExDiv ? "\nex-div = announced ex-dividend date (own the shares before it to get the payment)" : "")}>
              {hasExDiv ? "earnings · ± move · ex-div" : "earnings · upcoming · ± expected move"}
            </span>
            <span className={css`${mono} font-size: 9px; color: ${C.dim};`}>{calendar.length}</span>
          </div>,
          calendar.length === 0 ? (
            <div key="en" className={css`font-size:10px; color:${C.dim}; margin-top:4px;`}>none scheduled</div>
          ) : (
            earningsShown.map((e) => {
              const away = daysAway(e.date);
              const soon = away !== null && away <= 7;
              const exd = e.kind === "exdiv";
              return (
                <div key={e.ticker + "|" + e.kind} className={rowFlex} style={{ marginTop: 3 }}
                  title={exd ? exDivTip(e) : undefined}>
                  <span className={mono} style={{ fontSize: 9.5 }}>
                    {e.ticker}
                    <span style={{ color: soon ? C.amber : C.dim }}> · {fmtDate(e.date)}
                      {away !== null && away >= 0 ? " (" + (away === 0 ? "today" : away + "d") + ")" : ""}</span>
                    {exd ? <span style={{ color: C.line }}> ex-div</span> : null}
                    {!exd && e.impliedMovePct !== null && e.impliedMovePct !== undefined ? (
                      <span style={{ color: C.ink, opacity: 0.85 }}> ±{e.impliedMovePct}%</span>
                    ) : null}
                  </span>
                  {e.watch ? (
                    <span className={mono} style={{ fontSize: 9, color: C.dim }} title="on your watchlist">watching</span>
                  ) : exd ? (
                    <span className={mono} style={{ fontSize: 9.5 }}>
                      {isFin(e.value) ? "~" + money(e.value, true) : ""} <span style={{ color: C.dim }}>div</span>
                    </span>
                  ) : (
                    <span className={mono} style={{ fontSize: 9.5 }}>
                      {money(e.value)} <span style={{ color: C.dim }}>{e.weightPct}%</span>
                    </span>
                  )}
                </div>
              );
            })
          ),
          earnPages > 1 ? (
            <div key="ep" className={rowFlex} style={{ marginTop: 5 }}>
              <span className={linkBtn} style={{ fontSize: 8, visibility: earnPage > 0 ? "visible" : "hidden" }}
                onClick={() => dispatch({ type: "SET_EARN_PAGE", page: earnPage - 1 })}>‹ sooner</span>
              <span className={css`${mono} font-size: 8px; color: ${C.dim};`}>
                {(earnPage * rowsE + 1) + "–" + (earnPage * rowsE + earningsShown.length) + " of " + calendar.length +
                  " · through " + fmtDate(calendar[calendar.length - 1].date)}
              </span>
              <span className={linkBtn} style={{ fontSize: 8, visibility: earnPage < earnPages - 1 ? "visible" : "hidden" }}
                onClick={() => dispatch({ type: "SET_EARN_PAGE", page: earnPage + 1 })}>later ›</span>
            </div>
          ) : null,
  ];
  const earningsNode = (first, attrs) => (first ? earningsRows()
    : <div className={sectionGap} {...attrs}>{earningsRows()}</div>);
  const alertsNode = (first, attrs) => (
            <div className={first ? "" : sectionGap} {...attrs}>
              <span className={eyebrow} title={hasPriceAlerts ? "notifications sent: your price alerts (_alerts) and big daily moves (_settings.alerts in positions.json)"
                : "big daily moves (turn on with _settings.alerts in positions.json)"}>alerts · last 7 days</span>
              {alerts.map((a, i) => (
                <div key={i} className={rowFlex} style={{ marginTop: 3 }}>
                  <span className={mono} style={{ fontSize: 9, color: C.dim }}>
                    {fmtDay(a.t)} {fmtTime(a.t)}
                  </span>
                  {a.kind ? (
                    <span className={mono} style={{ fontSize: 9 }}><AlertLogText a={a} /></span>
                  ) : (
                    <span className={mono} style={{ fontSize: 9 }}>
                      {a.ticker} <span style={{ color: upDown(a.pct) }}>{pct(a.pct)}</span>
                      {a.impact !== null && a.impact !== undefined ? (
                        <span style={{ color: C.dim }}> {signedMoney(a.impact)}</span>
                      ) : null}
                    </span>
                  )}
                </div>
              ))}
            </div>
  );
  // the news panel: headlines for the stock open here and today's movers,
  // paged by the rows the layout gives it (per-window newsPage); a click opens
  // the story (https only); with headlines off: "turn on" (_settings.news)
  const newsNode = (first, attrs) => {
    if (newsCfg) return newsPageNode(first, attrs);
    const rowsN = Math.max(1, L.rows.news || 1), all = feed.rows;
    const nPages = Math.max(1, Math.ceil(all.length / rowsN));
    const pg = Math.min(state.newsPage || 0, nPages - 1);
    const shown = all.slice(pg * rowsN, (pg + 1) * rowsN);
    const msg = css`${mono} font-size:8.5px; color:${C.dim}; margin-top:3px;`;
    return (
      <div className={first ? "" : sectionGap} {...attrs}>
        <span className={eyebrow} title="the latest headlines for the stock open in this window and today's biggest movers (Yahoo, _settings.news)">news</span>
        {!newsOn(state) ? (
          <div className={msg}>
            headlines off · <span className={linkBtn} style={{ fontSize: 8.5 }} title="show the latest headlines for the stock you open and for today's movers (_settings.news)"
              onClick={() => { savePref("news", true, dispatch).then(() => { if (state.focusTicker) loadNews(state.focusTicker, dispatch); }); }}>turn on</span>
          </div>
        ) : !all.length ? (
          <div className={msg}>{feed.busy ? "loading headlines…" : "no recent headlines for today's movers"}</div>
        ) : shown.map((r, i) => {
          const cmd = openCmd(r.it.url);
          const meta = [r.tk, typeof r.it.source === "string" && r.it.source ? r.it.source : null, agoText(r.it.time) || null]
            .filter((x) => x).join(" · ");
          return (
            <div key={pg + ":" + i} style={{ marginTop: 3, lineHeight: 1.25, minWidth: 0 }}>
              <div style={Object.assign({ fontSize: 9.5, cursor: cmd ? "pointer" : "default", color: C.ink }, CUT)}
                title={r.it.title + (cmd ? "\nclick to open " + r.it.url : "")}
                onClick={() => { if (cmd) run(cmd).catch(() => {}); }}>{r.it.title}</div>
              <div className={css`${mono} font-size:8px; color:${C.dim};`} style={CUT}>{meta}</div>
            </div>
          );
        })}
        {nPages > 1 ? (
          <div className={rowFlex} style={{ marginTop: 5 }}>
            <span className={linkBtn} style={{ fontSize: 8, visibility: pg > 0 ? "visible" : "hidden" }}
              onClick={() => dispatch({ type: "SET_NEWS_PAGE", page: pg - 1 })}>‹ back</span>
            <span className={css`${mono} font-size: 8px; color: ${C.dim};`}>
              {(pg * rowsN + 1) + "–" + (pg * rowsN + shown.length) + " of " + all.length}
            </span>
            <span className={linkBtn} style={{ fontSize: 8, visibility: pg < nPages - 1 ? "visible" : "hidden" }}
              onClick={() => dispatch({ type: "SET_NEWS_PAGE", page: pg + 1 })}>more ›</span>
          </div>
        ) : null}
      </div>
    );
  };
  // the news page (13.1): the window's `news` options — scope, per-ticker
  // cap, sort, span, group, dense, sources, mute and the keyword (the filter
  // box; Enter keeps it as cfg.q, Esc clears it). Tags open the stock (with a
  // holdings panel here) or narrow the feed; × on hover mutes a ticker here.
  const newsPageNode = (first, attrs) => {
    const cfg = newsCfg;
    const msg = css`${mono} font-size:8.5px; color:${C.dim}; margin-top:3px;`;
    const dimMono = css`${mono} font-size:8px; color:${C.dim};`;
    const setNews = (patch) => changeWin(state, win.id, { news: normNews(Object.assign({}, cfg, patch)) || {} }, dispatch);
    const setQuery = (v, from) => dispatch({ type: "SET_NEWS_QUERY", value: v, from: from });
    const clearQ = () => { setQuery("", ""); if (cfg.q) setNews({ q: "" }); };
    const openEditor = (ev) => {
      if (!state.editOpen) { bodyToTop(ev); dispatch({ type: "TOGGLE_EDITOR", group: "panels" }); }
      else if (state.editGroup !== "panels") dispatch({ type: "EDIT_GROUP", group: "panels" });
      const root = ev && ev.currentTarget && ev.currentTarget.closest ? ev.currentTarget.closest("[data-pw-win]") : null;
      setTimeout(() => {
        try {
          const el = root ? root.querySelector('[data-pw-feature="panel.news"]') : null;
          if (el && el.scrollIntoView) el.scrollIntoView({ block: "nearest" });
        } catch (e) { /* no DOM: fine */ }
      }, 80);
    };
    const canOpen = enabled(win, "panel.holdings");
    const tagClick = (tk) => (ev) => {
      ev.stopPropagation();
      if (isFeedKey(tk)) { setQuery(newsTagText(tk), cfg.q); return; }   // a market outlet (13.3): only its stories
      if (!TICKER_RE.test(tk)) return;
      if (canOpen) openStock(tk, dispatch, state); else setQuery(tk, cfg.q);
    };
    const tagTip = (tk) => (isFeedKey(tk) ? "only " + newsTagText(tk) + " stories" : canOpen ? "open " + tk : "only " + tk + "'s headlines");
    const tag = (tk, key, style) => <span key={key} className={newsTagCss} style={style} title={tagTip(tk)} onClick={tagClick(tk)}>{newsTagText(tk)}</span>;
    const muteX = (tk, key) => (cfg.mute.length >= NEWS_LIST_MAX || !TICKER_RE.test(tk) ? null
      : <span key={key} className="pw-mute" title={"hide " + tk + " here"}
          onClick={(ev) => { ev.stopPropagation(); setNews({ mute: cfg.mute.concat([tk]) }); }}>×</span>);
    const link = (txt, tip, fn) => <span className={linkBtn} style={{ fontSize: 8.5 }} title={tip} onClick={fn}>{txt}</span>;
    const agoShort = (t) => agoText(t).replace(" ago", "");
    const storyNode = (e, key) => {
      const r = e.row, cmd = openCmd(r.url);
      const tip = r.title + (r.source ? "\n" + r.source : "") + (isFin(r.time) ? " · " + agoText(r.time) : "") + (cmd ? "\nclick to open " + r.url : "");
      const open = () => { if (cmd) run(cmd).catch(() => {}); };
      if (cfg.dense) {
        return (
          <div key={key} className={newsRowCss} title={tip} onClick={open}
            style={{ display: "flex", alignItems: "baseline", marginTop: 2, lineHeight: 1.25, minWidth: 0, cursor: cmd ? "pointer" : "default" }}>
            <span style={Object.assign({ fontSize: 9.5, color: C.ink, flex: "1 1 auto" }, CUT)}>{r.title}</span>
            <span className={dimMono} style={{ whiteSpace: "nowrap", flex: "none" }}>
              {e.tags.slice(0, NEWS_DENSE_TAGS).map((t) => <span key={t}>{" · "}{tag(t, "t")}{muteX(t, "m")}</span>)}
              {e.tags.length > NEWS_DENSE_TAGS ? " +" + (e.tags.length - NEWS_DENSE_TAGS) : ""}
              {cfg.sources && isFin(r.time) ? " · " + agoShort(r.time) : ""}
            </span>
          </div>
        );
      }
      const meta = [];
      e.tags.forEach((t, i) => { if (i) meta.push(" · "); meta.push(tag(t, "t" + t)); meta.push(muteX(t, "m" + t)); });
      // a market story's source is its outlet — already the tag, not repeated
      const fromFeed = e.tags.some((t) => isFeedKey(t) && newsTagText(t) === r.source);
      const rest = (cfg.sources ? [fromFeed ? null : r.source || null, agoText(r.time) || null] : []).filter((x) => x).join(" · ");
      if (rest) meta.push((meta.length ? " · " : "") + rest);
      return (
        <div key={key} className={newsRowCss} style={{ marginTop: 3, lineHeight: 1.25, minWidth: 0 }}>
          <div style={Object.assign({ fontSize: 9.5, cursor: cmd ? "pointer" : "default", color: C.ink }, CUT)} title={tip} onClick={open}>{r.title}</div>
          <div className={dimMono} style={CUT}>{meta}</div>
        </div>
      );
    };
    const headNode = (e, key) => (
      <div key={key} className={dimMono} style={Object.assign({ marginTop: 4, fontSize: 8.5 }, CUT)}
        title={e.n + (e.n === 1 ? " story" : " stories") + (isFin(e.move) ? " · today " + pct(e.move) : "")}>
        {tag(e.tk, "t", { color: C.ink })}
        {(isFin(e.move) ? " · " + pct(e.move) : "") + " · " + e.n}
      </div>
    );
    const rowsN = Math.max(1, L.rows.news || 1);
    const pages = pageEntries(feed.entries || [], rowsN), nPages = pages.length;
    const pg = Math.min(state.newsPage || 0, nPages - 1);
    const shown = pages[pg];
    const storiesBefore = pages.slice(0, pg).reduce((n, p) => n + p.filter((e) => e.kind === "story").length, 0);
    const storiesHere = shown.filter((e) => e.kind === "story").length;
    const ci = L.cols.findIndex((c) => c.some((u) => u.ids.indexOf("panel.news") >= 0));
    const colW = ci >= 0 ? L.colW[ci] : L.CW;
    const filterOn = newsFilterOn(colW);
    const scopeWord = cfg.scope === "pick" ? cfg.tickers.length + " picked" : (NEWS_SCOPE_TEXT[cfg.scope] + (cfg.market.length ? " + market" : ""));
    const nStories = feed.counts ? feed.counts.stories : 0;
    const nPlaced = cfg.group ? (feed.entries || []).filter((e) => e.kind === "story").length : nStories;
    const eye = "news · " + scopeWord + " · " + nStories + (nStories === 1 ? " story" : " stories") + (feed.capped ? " · capped" : "") +
      (feed.updated ? " · updated " + agoText(feed.updated) : "");
    const eyeTip = "news · " + cfg.scope + " · " + NEWS_SORT_TIP[cfg.sort] + " · " + cfg.per + " per stock · " + NEWS_SPAN_TIP[cfg.span] +
      (cfg.mute.length ? " · " + cfg.mute.length + " muted" : "") + (newsQ ? " · filter '" + newsQ + "'" : "") +
      (feed.capped ? "\ncapped: the tracker keeps " + d.news.keep + " per stock (its largest window's setting, at most 300 stories)" : "");
    const lim = d.news && isFin(d.news.movePct) ? d.news.movePct : NEWS_MOVE_PCT;
    const toWatch = (ev) => {
      if (!canOpen) return openEditor(ev);
      if (state.focusTicker) dispatch({ type: "SET_STOCK", ticker: null });
      dispatch({ type: "SET_VIEW", view: "watch" });
    };
    let empty = null;
    if (!newsOn(state)) {
      empty = <div className={msg}>headlines off · {link("turn on", "show the latest headlines (_settings.news)", () => { savePref("news", true, dispatch); })}</div>;
    } else if (!shown.length) {
      if (cfg.scope === "pick" && feed.scopeEmpty) empty = <div className={msg}>{link("pick tickers in ⚙", "news page settings", openEditor)}</div>;
      else if (cfg.scope === "watch" && feed.scopeEmpty) empty = <div className={msg}>nothing on the watchlist · {link("add stocks with watch", canOpen ? "the holdings panel's watch view" : "news page settings", toWatch)}</div>;
      else if (cfg.scope === "movers" && feed.scopeEmpty) empty = <div className={msg}>{"no holding moved over " + lim + "% today · "}{link("show every holding", "headlines for every holding", () => setNews({ scope: "all" }))}</div>;
      // a typed keyword that matches nothing says so first (the fetch note
      // follows), so the user isn't told to wait for a word that isn't there
      else if (feed.qHid) empty = <div className={msg}>{"nothing matches '" + newsQ + "' · "}{link("clear", "clear the filter", clearQ)}
        {feed.pending.length ? " · " + feed.pending.length + " still fetching" : ""}</div>;
      else if (feed.pending.length) empty = <div className={msg}>{"fetching headlines… " + (feed.planned - feed.pending.length) + " of " + feed.planned + " tickers · next refresh in ~5 min · "}{link("⚙", "news page settings", openEditor)}</div>;
      else if (feed.allMuted) empty = <div className={msg}>everything is muted · <span className={newsChipCss} title="unmute all" onClick={() => setNews({ mute: [] })}>{cfg.mute.length + " muted ×"}</span></div>;
      else if (feed.spanHid) empty = <div className={msg}>{"no headlines " + NEWS_SPAN_TEXT[cfg.span] + " · "}{cfg.span === "week"
        ? link("show all", "headlines from any time", () => setNews({ span: "all" })) : link("widen to a week", "the last 7 days", () => setNews({ span: "week" }))}</div>;
      else if (feed.busy) empty = <div className={msg}>loading headlines…</div>;
      else empty = <div className={msg}>no headlines yet · {link("⚙", "news page settings", openEditor)}</div>;
    }
    const status = [];
    if (newsOn(state)) {
      if (feed.updated) status.push(<span key="u" title="when the tracker last fetched headlines">{"updated " + agoText(feed.updated)}</span>);
      if (feed.pending.length) status.push(<span key="p" title={"not fetched yet: " + feed.pending.join(" ")}>{"fetching " + feed.pending.length + " more…"}</span>);
      if (feed.failed.length) status.push(<span key="f" style={{ color: C.amber }} title={feed.failed.map((t) => t + ": headlines unavailable (Yahoo)").join("\n")}>{feed.failed.length + " unavailable"}</span>);
      if (newsQ) status.push(<span key="q" className={newsChipCss} title="clear the filter" onClick={clearQ}>{"filter: " + newsQ + " ×"}</span>);
      if (cfg.mute.length) status.push(<span key="m" className={newsChipCss} title={"muted here: " + cfg.mute.join(" ") + " — click to unmute all"} onClick={() => setNews({ mute: [] })}>{cfg.mute.length + " muted ×"}</span>);
      if (cfg.span !== "all") status.push(<span key="s" className={newsChipCss} title="show headlines from any time" onClick={() => setNews({ span: "all" })}>{NEWS_SPAN_CHIP[cfg.span] + " ×"}</span>);
    }
    return (
      <div className={first ? "" : sectionGap} {...attrs}>
        <div style={{ display: "flex", alignItems: "baseline", minWidth: 0 }}>
          <span className={eyebrow} style={CUT} title={eyeTip}>{eye}</span>
          <span className={newsChipCss} style={{ marginLeft: 5, flex: "none" }} title="news page settings" onClick={openEditor}>⚙</span>
        </div>
        {filterOn && newsOn(state) ? (
          <input className={inputCss} value={newsQ} placeholder="filter…" maxLength={NEWS_Q_MAX}
            style={{ width: "100%", boxSizing: "border-box", fontSize: 9, padding: "1px 4px", height: K.NEWS_FILTER - 4, marginTop: 2, display: "block" }}
            title="filter the headlines by a word (Enter keeps it for this window, Esc clears it)"
            onChange={(ev) => setQuery(ev.target.value, cfg.q)}
            onKeyDown={(ev) => {
              if (isEnter(ev)) { const v = ev.target.value; if (newsQOk(v)) { setNews({ q: v }); setQuery(v, v); } }
              else if (isEscape(ev)) { ev.stopPropagation(); clearQ(); }
            }} />
        ) : null}
        {empty}
        {!empty ? shown.map((e, i) => (e.kind === "head" ? headNode(e, pg + ":" + i) : storyNode(e, pg + ":" + i))) : null}
        {nPages > 1 ? (
          <div className={rowFlex} style={{ marginTop: 5 }}>
            <span className={linkBtn} style={{ fontSize: 8, visibility: pg > 0 ? "visible" : "hidden" }}
              onClick={() => dispatch({ type: "SET_NEWS_PAGE", page: pg - 1 })}>‹ back</span>
            <span className={dimMono}>{(storiesBefore + 1) + "–" + (storiesBefore + storiesHere) + " of " + nPlaced}</span>
            <span className={linkBtn} style={{ fontSize: 8, visibility: pg < nPages - 1 ? "visible" : "hidden" }}
              onClick={() => dispatch({ type: "SET_NEWS_PAGE", page: pg + 1 })}>more ›</span>
          </div>
        ) : null}
        <div className={dimMono} style={{ marginTop: 3, height: K.NEWS_STATUS - 3, lineHeight: "8px", display: "flex", alignItems: "baseline", columnGap: 5, minWidth: 0, overflow: "hidden", whiteSpace: "nowrap" }}>
          {status.map((x, i) => (i ? [<span key={"sep" + i}>·</span>, x] : x))}
        </div>
      </div>
    );
  };
  // one layout unit (a panel, or the carousel) at its place in a column
  const unitNode = (u, first) => {
    const attrs = { key: u.key, "data-pw-panel": u.key, "data-pw-est": L.est[u.key] + (first ? 0 : GAP_IN) };
    const id = u.ids[0];
    if (FEATURE_BY[id] && FEATURE_BY[id].car) return carouselNode(u.ids, first, attrs);
    if (id === "panel.holdings") return holdingsNode(first, attrs);
    if (id === "panel.earnings") return earningsNode(first, attrs);
    if (id === "panel.sales") return <SalesPanel d={d} totals={totals} expanded={state.salesExpanded === true} dispatch={dispatch} first={first} pw={attrs} />;
    if (id === "panel.income") return <IncomePanel d={d} first={first} pw={attrs} />;
    if (id === "panel.rebalance") return <RebalancePanel d={d} state={state} dispatch={dispatch} first={first} pw={attrs} />;
    if (id === "panel.priceAlerts") return <PriceAlertsPanel d={d} state={state} dispatch={dispatch} first={first} pw={attrs} />;
    if (id === "panel.alerts") return alertsNode(first, attrs);
    if (id === "panel.news") return newsNode(first, attrs);
    return null;
  };
  // the columns (layoutFor: 1–3, the holdings column wider in map view);
  // 12.11's two keep their classes
  const nCols = L.cols.length;
  const colClass = (i) => (nCols === 1 ? colSolo : i === 0 ? (L.flex[0] !== 1 ? colLeftWide : colLeft)
    : i === nCols - 1 ? colRight : colMid);
  const colStyle = (i) => (L.flex[i] !== 1 && !(i === 0 && nCols > 1) ? { flex: L.flex[i] } : undefined);
  return frame(state, dispatch, titleRow, (
    <div data-pw-t={Math.round(L.T)} data-pw-scroll={L.scroll ? "1" : "0"}>
      {editor}
      {headerBlock}
      {welcomeBlock}

      {/* ---------------- graph (full width; folded: a mini graph) ---------------- */}
      {graphOn ? (
      <div className={headOn ? sectionGap : ""} data-pw-panel="graph" data-pw-est={L.est.graph + (headOn ? GAP_IN : 0)}>
        {sh("graph.tabs") ? (
        <div style={{ display: "flex", flexWrap: readoutOwnLine || sectorMode || L.tabWrap ? "wrap" : "nowrap", alignItems: "baseline", columnGap: 8, rowGap: 2 }}>
          <div style={L.tabWrap ? TAB_WRAP : { whiteSpace: "nowrap", flex: "none" }}>
            {rangeTabs.map((r) => {
              const tb = BT_RANGES.indexOf(r) >= 0 ? btTab(d, r) : null;
              // with the backtest tabs the row gets tighter so it still fits the width
              const tight = btTabs.length ? { padding: "2px 4px" } : null;
              return (
                <span key={r}
                  className={r === effRange && !from ? css`${tabBtn} ${tabActive}` : tabBtn}
                  style={tb && tb.short ? Object.assign({ opacity: 0.5 }, tight) : tight || undefined}
                  title={r === "1D" ? "the latest trading session"
                    : r === "ALL" ? "everything since your first purchase — for any other start, type a date and press Enter"
                    : tb ? (tb.short ? "prices only reach back to " + fmtDayY(tb.start)
                      : r === "MAX" ? "as far back as prices go (since " + fmtDayY(tb.start) + ")" : "the last " + BT_YEARS[r] + " years") +
                      (tb.start < bt.anchor.t - 1 ? " — before your first purchase: today's holdings, simulated" : "")
                    : "the last " + { "1H": "hour", "1W": "week", "1M": "month", "1Y": "year" }[r]}
                  onClick={() => dispatch({ type: "SET_RANGE", range: r })}>
                  {r}
                </span>
              );
            })}
            {rangeTabs.length && modesOn.length ? <span className={css`color:${C.faint};`}> | </span> : null}
            {modesOn.map((m) => (
              <span key={m}
                className={m === state.graphMode ? css`${tabBtn} ${tabActive}` : tabBtn}
                title={m === "pl" ? "profit/loss over time (value minus what the holdings cost)"
                  : m === "sectors" ? "how each sector has done over this range" : "total value over time"}
                onClick={() => dispatch({ type: "SET_GRAPH_MODE", mode: m })}>
                {m === "pl" ? "p&l" : m}
              </span>
            ))}
            {dateOn ? (
            <input className={dayInputCss} placeholder="YYYY-MM-DD" value={state.dayInput}
              title="type any day (2026-03-14, or just 03-14): you see what your portfolio was worth then — press Enter to start the graph on that day"
              onChange={(ev) => onDayInput(ev.target.value, d, state, dispatch)}
              onKeyDown={(ev) => onDayKey(ev, d, state, dispatch)}
              onKeyPress={(ev) => (ev.charCode === 13 ? onDayKey(ev, d, state, dispatch) : null)} />
            ) : null}
            {from ? (
              <span className={css`${tabBtn} ${tabActive}`} style={{ marginLeft: 4 }}
                title="the graph starts here and every change is measured from here — click to go back to the normal ranges"
                onClick={() => dispatch({ type: "CLEAR_FROM" })}>
                {"from " + fmtDayY(from.t) + (rawSeries.length && rawSeries[rawSeries.length - 1].t - from.t <= 36 * 3600 ? " " + fmtTime(from.t) : "") + " ×"}
              </span>
            ) : state.mark ? (
              <span className={css`${tabBtn} ${tabActive}`} style={{ marginLeft: 4 }}
                title="start the graph at the pinned moment (or press Enter in the date box); every change figure is then measured from there"
                onClick={() => dispatch({ type: "SET_FROM", from: state.mark })}>
                start here
              </span>
            ) : null}
          </div>
          {(readoutOn && !readoutOwnLine) || (inItems("graph.big") && !sectorMode) ? (
          <span style={{ marginLeft: "auto", whiteSpace: "nowrap", display: "flex", alignItems: "baseline", minWidth: 0 }}>
            {readoutOwnLine || !readoutOn ? null : (   // too long (8-figure values, long dates): cut with "…" rather than wrap
              <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{readoutNode}</span>
            )}
            {sectorMode || !inItems("graph.big") ? null : (
              <span className={tabBtn} style={{ marginLeft: 6, fontSize: 10, flex: "none" }}
                title={bigOn ? "back to normal size" : "make the graph bigger"}
                onClick={() => (state._disp ? changeWin(state, state._win.id, { graphBig: !bigOn }, dispatch)
                  : savePref("graphBig", !bigOn, dispatch))}>{bigOn ? "⤡" : "⤢"}</span>
            )}
          </span>
          ) : null}
        </div>
        ) : null}
        {sh("graph.tabs") && readoutOwnLine ? (
          <div style={{ textAlign: "right", minHeight: 14, lineHeight: "14px", marginTop: 1, whiteSpace: "nowrap" }}>
            {readoutNode}
          </div>
        ) : null}
        {!sh("graph") ? (
          <Graph series={series} width={L.graphW} height={LAYOUT_K.MINI - AXIS_H} yTicks={2} hoverT={state.hoverT}
            markT={state.mark && state.mark.t >= (rawSeries.length ? rawSeries[0].t - 1 : 0) ? markT : null}
            onHover={onHoverPt} onPick={onPickPt} />
        ) : (
        <div style={{ marginTop: 4 }}>
          {focusName ? (
            <div>
              <div className={rowFlex} style={{ marginBottom: 3 }}>
                <span className={tabBtn} style={{ paddingLeft: 0 }} title="back to every sector side by side"
                  onClick={() => dispatch({ type: "SET_SECTOR_FOCUS", name: null })}>‹ all sectors</span>
                {(() => {
                  const times = sectorData.t;
                  const at = activeT !== null && activeT >= times[0] - 1 && activeT <= times[times.length - 1] + 1
                    ? nearestIdx(times, activeT) : times.length - 1;
                  const mainV = sectorSeriesOf(sectorData, focusName)[at];
                  const wholeV = (sectorData.total || [])[at];
                  return (
                    <span className={mono} style={{ fontSize: 9.5, whiteSpace: "nowrap" }}>
                      <LineKey color={C.line} />
                      <span style={{ color: C.ink }}>{focusName === "portfolio" ? "whole portfolio" : focusName}</span>{" "}
                      <span style={{ color: upDown(mainV || 0) }}>{pct(mainV)}</span>
                      {focusName === "portfolio" ? null : (
                        <span style={{ marginLeft: 12 }}>
                          <LineKey color={C.dim} />
                          <span style={{ color: C.dim }}>whole portfolio </span>
                          <span style={{ color: upDown(wholeV || 0) }}>{pct(wholeV)}</span>
                        </span>
                      )}
                    </span>
                  );
                })()}
              </div>
              <SectorFocus data={sectorData} name={focusName} width={L.graphW} height={L.graphH}
                hoverT={state.hoverT} markT={markT} onHover={onHoverPt} onPick={onPickPt} />
            </div>
          ) : sectorMode ? (
            <SectorGrid data={sectorData} width={L.graphW} height={L.graphH} cols={L.sectorCols} hoverT={state.hoverT} markT={markT}
              scaleMode={state.sectorScale} order={state.sectorOrder} rangeWords={rangeWords} onHover={onHoverPt}
              onOpen={(name) => dispatch({ type: "SET_SECTOR_FOCUS", name: name })} />
          ) : (
            <Graph series={series} width={L.graphW} height={L.graphH} yTicks={L.yTicks} hoverT={state.hoverT}
              bench={bOn ? benchLine : null} boughtT={bt ? bt.anchor.t : null}
              markT={state.mark && state.mark.t >= (rawSeries.length ? rawSeries[0].t - 1 : 0) ? markT : null}
              onHover={onHoverPt} onPick={onPickPt} />
          )}
        </div>
        )}
        {sh("graph") && (sh("graph.notes") || state.dayMsg || sectorMode) ? (
        <div className={rowFlex}>
          <span className={css`${mono} font-size: 8px; color: ${C.dim}; white-space: nowrap; min-width: 40px;`}>
            {sectorMode && !focusName && sectorData && sectorData.t && sectorData.t.length
              ? axisLabel(sectorData.t[0], sectorData.t[0], sectorData.t[sectorData.t.length - 1]) : ""}
          </span>
          <span className={css`${mono} font-size: 8px; color: ${C.dim}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: ${L.captionW}px; margin: 0 8px;`}>
            {state.dayMsg ? (
              <span style={{ color: C.amber }}>{state.dayMsg}</span>
            ) : focusName ? (
              <span title="today's holdings priced back through time, so a purchase never looks like a gain. Nights and weekends are left out.">
                {"change " + rangeWords}{focusName === "portfolio" ? "" : " · " + focusName + " vs the whole portfolio"}
                {hovering ? " · click to pin" : markT !== null ? " · pinned (click again to release)" : " · hover or click for a moment in time"}
              </span>
            ) : sectorMode ? (
              <span title="today's holdings priced back through time, so a purchase never looks like a gain. Nights and weekends are left out.">
                {"change " + rangeWords + " · "}
                <span className={linkBtn} style={{ fontSize: 8 }}
                  title="best first: the strongest sector leads. biggest first: ordered by how much you hold"
                  onClick={() => dispatch({ type: "TOGGLE_SECTOR_ORDER" })}>
                  {state.sectorOrder === "best" ? "best first" : "biggest first"}
                </span>
                {" · "}
                <span className={linkBtn} style={{ fontSize: 8 }}
                  title="shared scale: every sector on the same scale, so sizes compare. own scales: each sector fills its box, so shapes show"
                  onClick={() => dispatch({ type: "TOGGLE_SECTOR_SCALE" })}>
                  {state.sectorScale === "shared" ? "shared scale" : "own scales"}
                </span>
                {" · click a sector to enlarge it"}
              </span>
            ) : readout ? (
              <span title={readout.sim ? simTip(readout) : (readout.asked ? "the market was closed on " + readout.asked + ", so this is the last day before it. " : "") +
                  "≈ = rebuilt from that moment's market prices and the shares you held then; otherwise recorded live by the widget"}>
                {readout.asked ? (readout.sim ? "nearest to " + fmtDate(readout.asked) : "market closed " + readout.asked.slice(5)) +
                  " → " + fmtDate(readout.d) + " · " : ""}
                {readout.d ? "day's end, " : ""}{readout.sim ? "simulated · " + BT_MODE_WORDS[btModeNow]
                  : readout.approx ? "≈ from prices" : "recorded"}
                {readoutPerf && lastRaw && readout.t < lastRaw.t ? (
                  <span>
                    {" · since then "}
                    <span style={{ color: upDown(readoutPerf.gain) }}>{signedExact(readoutPerf.gain) + " (" + pct(readoutPerf.pct) + ")"}</span>
                    {Math.abs(readoutPerf.flow) > 0.5 ? " + " + money(readoutPerf.flow) + " added" : ""}
                  </span>
                ) : null}
                {hovering || readout.d ? "" : " · pinned"}
              </span>
            ) : plGraph ? (
              "p&l vs " + (vsInvested ? "the " + money(totals.invested) + " you put in" : "what the holdings cost") + " · hover or click for a moment in time"
            ) : series.length > 1 ? (series.some((p) => p.approx) ? "hover or click for a moment in time"
              : "hover or click the graph for the value at that moment") : ""}
          </span>
          <span className={css`${mono} font-size: 8px; color: ${C.dim}; white-space: nowrap; min-width: 40px; text-align: right;`}>
            {sectorMode && !focusName && sectorData && sectorData.t && sectorData.t.length
              ? axisLabel(sectorData.t[sectorData.t.length - 1], sectorData.t[0], sectorData.t[sectorData.t.length - 1]) : ""}
          </span>
        </div>
        ) : null}
        {simShown && sh("graph.backtest") ? (
          <div className={css`${mono} font-size: 8px; color: ${C.dim}; text-align: center; margin-top: 1px; white-space: nowrap;`}>
            <span title={"before the first real day (\"you bought here\") the line is today's holdings priced back, drawn lighter:" +
              "\nas held now = today's share counts carried back; as weighted now = today's percentages, rebalanced monthly" +
              "\neither way it meets your real value on the day you bought"}>
              {"simulated with today's holdings — hindsight flatters this · "}
            </span>
            {["held", "weighted"].map((m, i) => (
              <span key={m}>
                {i ? " | " : ""}
                <span className={linkBtn} style={{ fontSize: 8, color: btModeNow === m ? C.ink : C.dim }}
                  title={m === "held" ? "today's share counts carried back" : "today's percentages, rebalanced monthly"}
                  onClick={() => dispatch({ type: "SET_BT_MODE", mode: m })}>{BT_MODE_WORDS[m]}</span>
              </span>
            ))}
          </div>
        ) : null}
        {benchCap || benchLine || benchOff || benchCtl || benchNote || lateShown.length || histProg || olderComing ? (
          <div className={css`${mono} font-size: 8px; color: ${C.dim}; margin-top: 1px; display: flex; justify-content: center; white-space: nowrap;`}>
          <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
            {benchOff ? (
              <span className={linkBtn} style={{ fontSize: 8 }} title={"show the " + String((bench && bench.symbol) || benchWantSym || "index") + " line again"}
                onClick={() => savePref("showBenchmark", true, dispatch)}>show index</span>
            ) : null}
            {benchCap ? (
              <span title={"thin grey line: " + String(bench.symbol) + " bought with the same money on the same days as your purchases" +
                " (prices only — dividends left out on both sides)" + (bench.stale ? "\nits latest price is stale" : "") +
                (benchCtl ? "\npick another index with \"index ▾\"" : bench.source === "setting" ? "\nset with _settings.benchmark"
                  : "\nthe default for " + d.currency + " — change it with _settings.benchmark (\"none\" hides it)")}>
                {benchCap.lead}<span style={{ color: benchCap.diff ? upDown(benchCap.diff) : C.dim }}>{G.Wu < 400 && benchCap.short ? benchCap.short : benchCap.verdict}</span>
              </span>
            ) : null}
            {benchNote ? (
              <span title={benchLoading ? "the next refresh fetches its prices (older years follow in the background)"
                : "Yahoo has no prices for " + benchWantSym + " (a typo?) — pick another index"}>{benchNote}</span>
            ) : null}
            {(benchCap || benchOff || benchNote) && (lateShown.length || olderComing || histProg) ? " · " : null}
            {lateShown.length ? (
              <span title={lateShown.map((ls) => String(ls.ticker) + " from " + fmtIsoLong(ls.first)).join("\n") +
                "\nYahoo has no older prices for " + (lateShown.length === 1 ? "it" : "them") +
                ", so " + (lateShown.length === 1 ? "its" : "their") + " money counts as cash until the first price"}>
                {lateShown.length === 1 ? "1 holding starts later" : lateShown.length + " holdings start later"}
              </span>
            ) : null}
            {lateShown.length && (olderComing || histProg) ? " · " : ""}
            {olderComing ? "loading older days…" : ""}
            {olderComing && histProg ? " · " : ""}
            {histProg ? (
              <span title={"downloading older prices in the background so the graph can reach further back — everything else works as usual meanwhile" +
                (histProg.current ? "\nnow: " + String(histProg.current) : "")}>
                {"loading history" + histCount + "…"}
              </span>
            ) : null}
          </span>
            {benchLine || benchCtl ? (   // outside the part cut with "…", so it is always there; its own
              // flex item, where a plain leading space is dropped: hence the no-break space
              <span style={{ flex: "none" }}>{benchCap || benchNote || lateShown.length || olderComing || histProg ? "\u00a0· " : ""}
                {benchCtl ? (
                  <span className={linkBtn} style={{ fontSize: 8, color: state.benchPick ? C.ink : C.dim }} data-pw-benchpick="1"
                    title={"the index to compare with" + (benchWant === "auto" ? " (auto: the default for " + d.currency + ")" : "") +
                      " — click to pick another, or none"}
                    onClick={() => dispatch({ type: "BENCH_PICK" })}>
                    {"index: " + (benchWant === "none" ? "none" : benchWantSym) + " ▾"}
                  </span>
                ) : null}
                {benchCtl && benchLine ? " · " : null}
                {benchLine ? (
                  <span className={linkBtn} style={{ fontSize: 8 }} title="hide the index line (remembered in _settings.showBenchmark)"
                    onClick={() => savePref("showBenchmark", false, dispatch)}>hide</span>
                ) : null}
              </span>
            ) : null}
          </div>
        ) : null}
        {bOn && benchCtl && state.benchPick ? (
          <BenchPicker want={benchWant} cur={d.currency} hidden={!showBenchOf(state)} state={state} dispatch={dispatch} />
        ) : null}
        {sh("graph") && focusName && focusName !== "portfolio" ? (() => {
          // what's in the enlarged sector: its stocks, best first (click one for its own chart)
          const names = {};
          ((sectorData && sectorData.themes) || []).forEach((th) => { names[th.name] = true; });
          const inSector = positions.filter((q) => q.theme === focusName || (focusName === "Other" && !names[q.theme]));
          const perStock = !from && RANGES.indexOf(effRange) >= 0;   // per-stock changes exist for 1H…1Y only
          const chgOf = (q) => (perStock ? changeFor(q, effRange) : q.dayChangePct);
          const rowsIn = inSector.slice().sort((a, b) => (chgOf(b) || 0) - (chgOf(a) || 0));
          return (
            <div style={{ marginTop: 5, display: "flex", flexWrap: "wrap", alignItems: "baseline", columnGap: "10px", rowGap: "2px" }}>
              <span className={eyebrow} style={{ whiteSpace: "nowrap" }}>{rowsIn.length + " holdings · " + (perStock ? effRange : "today")}</span>
              {rowsIn.slice(0, 14).map((q) => (
                <span key={q.ticker} className={mono} title={(q.name || q.ticker) + " — click for its chart"}
                  style={{ fontSize: 9.5, cursor: "pointer", whiteSpace: "nowrap" }}
                  onClick={() => openStock(q.ticker, dispatch, state)}>
                  {q.ticker} <span style={{ color: upDown(chgOf(q) || 0) }}>{pct(chgOf(q))}</span>
                </span>
              ))}
              {rowsIn.length > 14 ? <span className={css`${mono} font-size: 8.5px; color: ${C.dim};`}>+{rowsIn.length - 14} more</span> : null}
            </div>
          );
        })() : null}
      </div>
      ) : null}

      {/* ---------------- columns ---------------- */}
      {nCols ? (
        <div className={colsGap ? css`${sectionGap} ${cols}` : cols}>
          {L.cols.map((c, i) => (
            <div key={i} className={colClass(i)} style={colStyle(i)} data-pw-col={i} data-pw-w={Math.floor(L.colW[i])}
              data-pw-panel={"col" + i} data-pw-est={c.reduce((h, u, j) => h + (j ? K.GAP : 0) + L.est[u.key], 0)}>
              {c.map((u, j) => unitNode(u, j === 0))}
            </div>
          ))}
        </div>
      ) : null}

      {footerBlock}
    </div>
  ), hover);
};

// A window's view of the state: the shared keys plus its own (WIN_KEYS), and
// _win / _disp for frame() and the display-aware clicks. Its events carry its
// id (`w`), so updateState files them under wins[id].
const renderWindow = (state, win, i, n, disp, dispatch) => {
  const ws = Object.assign({}, state, state.wins[win.id] || WIN_INITIAL,
    { _win: Object.assign({}, win, { idx: i, n: n }), _disp: disp || null });
  if (disp) { ws.compact = win.compact === true; ws.graphBig = win.graphBig === true; }
  const wd = (ev) => dispatch(Object.assign({ w: win.id }, ev));
  wd.w = win.id;
  return renderWin(ws, wd);
};

let mediaHook = null;   // {dispatch}: one prefers-color-scheme listener for the widget
const armMediaHook = (dispatch) => {
  if (mediaHook) { mediaHook.dispatch = dispatch; return; }
  mediaHook = { dispatch: dispatch };
  try {
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const fn = () => { if (mediaHook) mediaHook.dispatch({ type: "THEME_MEDIA" }); };
    if (mq.addEventListener) mq.addEventListener("change", fn); else if (mq.addListener) mq.addListener(fn);
  } catch (e) { /* no matchMedia: the theme follows the saved setting only */ }
};

export const render = (stateIn, dispatch) => {
  const state0 = sane(stateIn);
  const state = state0.wins && typeof state0.wins === "object" ? state0 : merge(state0, { wins: {} });
  THEME_NOW = themeOf(state);
  armMediaHook(dispatch);
  const disp = displayOf(state);
  const all = windowsOf(state, disp);
  // until there is data (starting, setup, an error) only the first window shows
  const wins = state.raw && state.raw.data ? all : all.slice(0, 1);
  const frames = wins.map((win, i) => renderWindow(state, win, i, wins.length, disp, dispatch));
  armEditKeys(hasData(state) && Object.keys(state.wins).some((id) => state.wins[id] && state.wins[id].editOpen), dispatch);
  return frames.length === 1 ? frames[0] : <div data-pw-wins={frames.length}>{frames}</div>;
};
