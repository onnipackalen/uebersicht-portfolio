# Changelog

## 13.0

The first public release: everything from 12.5–12.12 (history for any
portfolio, backtests and an index to compare with, realized gains and
dividends, XIRR and risk, alerts and news, targets and rebalancing, export,
backups, compact mode, the menu bar, windows and the ⚙ editor), tested end to
end, plus:

- **Kinder to Yahoo when it's down or rate-limiting**: when every price
  request fails, the widget keeps the last known prices (holdings marked
  **!**, "last refresh failed" in the footer) and waits 2 minutes before the
  next try, then twice as long after each further failure, up to 30 minutes —
  and at least 15 when Yahoo says "Too Many Requests". A ticker with no data
  at all (typo, delisted) no longer gets retried: 2 requests per refresh
  instead of 6.
- **A broken `positions.json` says what's wrong** ("is not valid JSON (line 12
  …) — fix it or copy back a backup") instead of a Python traceback; a search
  or lookup in the + form that fails says "lookup failed — Yahoo may be busy"
  instead of showing nothing.
- **Changing `currency` no longer draws a spike**: the values the widget
  records are kept per currency (`.cache/history.jsonl` plus a
  `history.currency` note; the other currency's recordings wait in
  `history.<CODE>.jsonl` and come back if you switch back). Before, switching
  e.g. CAD → USD drew the day's earlier CAD values as dollars — a 40% jump —
  and shifted the rebuilt history to match them.
- **New windows open beside the existing ones**, not on top of them.
- Numbers that round to zero show no sign ("0.00%", not "−0.00%" or
  "−$0.21 · +0.00%").
- A nearly flat graph keeps some height and readable labels ("$36,500"
  instead of "36507.50").
- The ⚙ editor lists panels in one column unless the window is wide enough
  for a whole row of buttons on one line.
- README rewritten for new users: first run, every setting in one table,
  privacy, troubleshooting.

## 12.12

- **Windows**: the widget can show several windows on your desktop, each with
  its own position, size, zoom and content — e.g. the graph in one, holdings
  in another, headlines and alerts in a third. Start one from a template (full,
  graph only, holdings, news & alerts, ticker line, blank), duplicate, rename
  or delete it (never the last). Without any of this you get the same single
  widget as before.
- **Choose what's shown**: ⚙ in a window's title row opens an editor listing
  every feature — each header line, the graph and each of its tabs and extras,
  every panel, each holding-row detail, the footer parts — with an on/off
  switch. Panels can be reordered, moved to the other column or another
  window, and given a priority (always / normal / only when there is room).
  "Reset everything" brings back the default look.
- **Real sizes that adjust what's shown**: drag a window's right edge, bottom
  edge or corner (or type the numbers in the editor; "fit content" for auto
  height). The layout follows: one column when narrow, two or three when wide,
  a bigger or smaller graph, more or fewer rows, and panels folding away by
  priority when the window is short ("+N hidden — ⚙"). Zoom (60–160%) moved
  to a slider in the editor.
- **News panel**: headlines for your biggest movers and the stock you're
  looking at, as a panel you can put in any window; adding it turns headlines
  on.
- Links are underlined with a solid line (no dotted lines anywhere).

## 12.11

- **Export to CSV**: "export" in the footer writes three spreadsheets to
  `~/Documents/Portfolio/` and shows them in Finder — `holdings.csv` (every
  purchase with its cost, plus cash), `daily_values.csv` (the whole day-by-day
  history, with the money put in and the index), and `sales.csv` (your
  recorded sales). They open directly in Numbers and Excel: ISO dates, plain
  numbers, one header row.
- **Daily backup**: once a day after the US close the widget saves a dated
  copy of `positions.json` next to it (`positions.backup-…-daily.json`) and
  keeps the newest 30. It never backs up on every refresh, and never deletes
  the backups "start fresh" makes.
- **Compact mode**: click the title to fold the widget into one line — total,
  today's % and $, and a small sparkline. Click the title again to open it.
  It stays that way after Übersicht restarts, and dragging the title still
  moves the widget.
- **Menu bar**: `menubar.sh` shows e.g. "$32.3k +0.8%" in the menu bar with
  SwiftBar or xbar, straight from the widget's last data — it never downloads
  anything.

## 12.10

- **Target allocation**: set targets in `_settings.targets` — tickers or sector
  names plus `"cash"`, in % (`{"Tech": 40, "Health care": 20, "MSFT": 10,
  "cash": 5, …}`). The widget warns when they don't add up to 100 or name
  something you don't hold.
- **Drift** per holding and per sector: a small badge on each holding row
  (orange when over target; a fainter badge when the target is its sector's),
  and a **drift** colouring for the heatmap next to **vol**.
- **Rebalance panel** (only when targets are set): the trades that move the
  fewest dollars to bring everything within ±1 percentage point of target, in
  whole shares or fractional (toggle), never spending cash you don't have —
  plus where new money should go first and how much it takes to get back in
  line without selling. With no targets nothing changes.
- **Pick the index to compare with**: click "index: XIU.TO ▾" under the graph
  for popular choices — S&P 500 (SPY), Nasdaq-100 (QQQ), total US (VTI), Dow
  (DIA), small caps (IWM), total world (VT), all-country world (ACWI),
  developed ex-US (EFA), emerging markets (EEM), TSX 60 (XIU.TO), TSX
  Composite (XIC.TO), S&P 500 in CAD (VFV.TO), all-equity (XEQT.TO), EURO STOXX
  50 (EXW1.DE), MSCI World (IWDA.AS), FTSE 100 (ISF.L) — your currency's group
  first, or type any symbol, "auto" or "none". "hide" / "show index" switch it
  off and on.
- **Solid lines everywhere**: the graphs no longer draw rebuilt stretches,
  backtest years or the index dashed (the backtest years are just a little
  lighter), and the "recording starts here" marker and its legend are gone.
- **Fix**: two settings changed at the same moment (e.g. showing the index and
  picking a new one) could lose one of them; the helpers now take turns.

## 12.9

- **Price alerts**: set them in a stock's detail view ("alert at…": a price
  like `250`, or `-20%` from what you paid) or in `positions.json` under
  `_alerts` — `{"ticker": "KO", "above": 70}`, `{"ticker": "KO", "below": 55}`,
  `{"ticker": "KO", "pctFromCost": -20}` and `{"ticker": "*", "drawdownPct":
  15}` for the whole portfolio falling 15% from its peak. Each fires one macOS
  notification when crossed and re-arms once the price crosses back. Holdings
  with alerts show a bell; a **price alerts** panel lists them with × to
  remove. From Terminal: `python3 alerts.py add|remove|list`.
- **Headlines** (off by default; turn on with `"news": true` in `_settings` or
  "turn on" in a stock's detail view): the 3 latest headlines for the stock
  you're viewing and for holdings moving more than 3%, with source and time;
  big movers get a small marker. Checked at most every 30 minutes; with news
  off nothing is ever requested. Links open in your browser (https only).
- The map view's range buttons and ⤢ (was "expand") moved to their own line —
  they used to run into the earnings column — and the earnings heading no
  longer wraps.

## 12.8

- **Your real annual return**: the header adds a money-weighted rate (XIRR —
  purchases as money out; sales, dividends and today's value as money in,
  each at that day's exchange rate), e.g. "+12.0% total · 9.8%/yr". Its
  tooltip also gives the time-weighted return from the daily values, which
  ignores when you added money. Shown after 30 days of history; before that
  the figures are hidden, not guessed.
- **Risk panel**: current drawdown from the peak and the maximum drawdown with
  its date, beta against your index, and the Sharpe ratio ((annual return −
  4%) ÷ annual volatility). The same figures for the backtest years are shown
  separately and labelled, e.g. "(backtest, 10y)".
- **52-week high** on hover over a holding: its closing high and how far it is
  from it.
- **Move it**: drag the widget by its title row anywhere on your screen.
- **Resize it**: the corner grip (bottom right, on hover) scales the whole
  widget from 60% to 160%. Double-click a grip to undo.
- **Scroll it**: when the widget is taller than the screen, its body scrolls
  and the title row stays put. Position and size are remembered across
  restarts (`_settings.position` / `scale`).

## 12.7

- **Realized gains are kept**: every sale — the widget's **sell** button or
  `remove_position.py` — is recorded in a new `_realized` list in
  `positions.json` (ticker, date, shares, proceeds, cost, gain, currency),
  using the same oldest-lots-first cost as before. A **realized** line under
  the P&L shows the total and this year's, and a **sales · realized** panel
  lists the last 20 sales. Sales made before 12.7 weren't recorded and can't
  be recovered.
- **Dividend income**: the widget now reads each holding's past payments and
  next ex-dividend date (checked once a day). An **income · dividends** panel
  shows the estimated income for the next 12 months (last year's payments ×
  shares you hold), the yield, the yield on cost, and 12 monthly bars. Upcoming
  ex-dividend dates are tagged in the earnings list. Holdings without
  dividends hide the panel.
- **Total return**: unrealized P&L + realized gains + dividends received
  (estimated from the shares you held on each payment date, including shares
  sold since), shown with the P&L. A sale without a price shows "realized —
  (1 unknown)" instead of a made-up $0.
- **Hide the index line** with "hide" in its caption ("show index" brings it
  back), and the ⤢ bigger graph now stays that way after Übersicht restarts —
  both are saved as `showBenchmark` / `graphBig` in `_settings`, instantly and
  without a new download.
- **Fix**: where the rebuilt (dashed) history meets the recorded (solid) part,
  the graph could read a difference in bookkeeping as money added or taken
  out — a one-point spike in the index line, "$1,500 added" on hover, a dip in
  the p&l graph. Money now only moves where you really bought or sold.
- **Fix**: a quarterly dividend could count five payments in a year for a few
  days around its anniversary.
- **Fix**: a refresh could briefly show an error while a file was being
  replaced.

## 12.6

- **Backtest before your first purchase**: new range tabs **3Y**, **5Y**,
  **10Y** and **MAX** (as far as `backtestYears` allows) show what today's
  holdings would have done before you bought them. That part is dashed and
  lighter, a line marks "you bought here", and hovering it says "simulated".
  It is kept apart from your recorded history — it never changes the real
  part of the graph.
- **Two backtest modes**, switched under the graph: **as held now** (today's
  share counts carried back) and **as weighted now** (today's percentages,
  rebalanced monthly). The caption reminds you that hindsight flatters this.
- **Compare with an index**: a dashed grey line shows the same money put
  into an index on the same days as each of your purchases, with a caption
  like "you +12.0% · SPY +9.5% · beat by 2.5 pts". It follows any start date
  you pick and runs through the backtest years too. New setting `benchmark`:
  any Yahoo symbol, `"none"` to hide it, or `"auto"` — SPY (USD), XIU.TO
  (CAD), EXW1.DE (EUR), ISF.L (GBP), STW.AX (AUD), 1306.T (JPY), CSSMI.SW
  (CHF), 2800.HK (HKD), and ACWI converted to your currency for any other.
- The sector graphs have the new tabs too.
- The demo portfolio now shows several years through the backtest.
- On graphs that include simulated years, the change % in the corner is
  time-weighted (new money never counts as a gain), so decades-long spans
  read correctly; percentages of 1,000% and more drop their decimals.

## 12.5

- **Years of history for any portfolio**: the graph, the day-by-day table and
  the date box now reach back `backtestYears` (new setting: 3, 5, 10 or
  `"max"`; default 5) — even when your holdings have no purchase dates — and
  as far as your earliest purchase when that is older. A portfolio bought in
  2012 can start its graph in 2012.
- **Fast first load**: a refresh still downloads only the last year. The long
  history comes in the background once the widget is showing ("loading
  history 12/40…" under the graph) and is cached, so later refreshes only add
  new days. Stock splits are detected and that stock's history re-fetched.
- **No more 5-year cap on the day-by-day table**: it holds everything that was
  downloaded. The widget gets the newest 400 days; "older ›" and typing an
  older date load the rest on demand.
- **Holdings with a short history** (recent IPOs, renamed or delisted
  tickers, thinly covered foreign listings) count as cash until their first
  price — no gap and no jump — and the graph notes "2 holdings start later".
- **"undated" tag** on holdings bought without a date (they count as held for
  the whole graph).
- **Any home currency**: `currency` accepts any code (EUR, GBP, SEK, AUD, JPY,
  CHF…), and `"auto"` follows your Mac's region. Old values use that day's
  exchange rate, from daily rate history for the whole period. Letter symbols
  get a space ("kr 27,250"), and yen and won show no decimals.
- **Bigger graph**: ⤢ at the end of the range tabs makes the value and p&l
  graphs more than twice as tall; ⤡ goes back.
- The value readout next to the range tabs no longer gets cut off ("Tue,
  Sep…") when a custom start is showing: it moves to its own line.
- The ALL range's % now explains itself on hover: it is the return on money
  while it was invested, so it can differ from the P&L % up top.
- **Fix**: after the close, the 1D graph could dip and jump along its dashed
  (rebuilt) stretch. Rebuilt 5-minute points were lined up with recorded
  values five minutes off; they now line up with the end of their bar.
- **Fix**: in the evening Yahoo sometimes publishes the day's closing prices
  hours after its live quotes. Until it did, the 1Y and ALL sector graphs
  stopped a day early and left out today's move, and the 1W / 1M / 1Y changes
  were measured from one trading day too far back. Today's live price now
  fills in until Yahoo catches up (it is never saved as a closing price).

## 12.4

- **Start the graph on any date**: type a date in the box and press Enter (or
  pin a moment and press "start here"). No longer limited to the last year —
  the tracker now fetches daily prices back to your earliest purchase date
  (2, 5, 10 years or all history as needed), and long custom spans are drawn
  one point per trading day from the day-by-day table.
- **ALL** range tab: everything since your first purchase, for the value,
  p&l and sector graphs.
- **Fix**: a purchase older than the fetched price history used to get the
  wrong cost basis (the first available close, months later), and that wrong
  cost was cached for good. Cost bases are now taken from bars that cover the
  purchase date, and a stale cached value is corrected automatically.
- Sector graphs on a custom start begin on that day's first bar.

## 12.3

- **Enlarge a sector**: click a sector's chart (or its row in the sectors
  panel) for a full-size chart — % axis, the whole portfolio as a grey
  reference line, a crosshair with both values, and the sector's stocks
  underneath.
- **Start the graph on any date**: pin a moment (graph click, date box, or a
  day in the days panel) and press **from here**; value, p&l and sector graphs
  then start there, with every change measured from that point.
- **Friendlier sector charts**: four wider charts per row with full names,
  best performer first (or biggest first), a dot on each line's end, a hover
  highlight, and — the big one — the time axis is built only from bars in
  which a real share of the holdings traded and drawn one step per bar, so
  one 24-hour future or coin no longer stretches every sector into flat
  overnight steps.
- Date labels along the bottom of the value graph and the enlarged charts.
- Rebuilt stretches inside the recorded period are level-adjusted to the
  recorded values, so the value line no longer zigzags when the two disagree.
- **Fix**: updating the widget while Übersicht is running no longer crashes it
  ("undefined is not an object (evaluating 'state.look.ticker')"). Übersicht
  keeps a widget's state across a hot reload; state from another version is
  now reset instead of being read as if it had the new fields.

## 12.2

- **The value at any moment**: hover the graph for a crosshair that snaps to
  the nearest data point and shows the exact value and time; click to pin it.
  The caption adds the gain from that moment to now.
- **Value on a day**: a date box above the graph (`2026-03-14` or `03-14`;
  closed days fall back to the last trading day) and a new **days** panel —
  each day's closing value and gain, newest first, click a row to pin it.
- **Sector graphs**: a `sectors` graph mode with one small chart per sector
  plus the whole portfolio, on a shared % scale, with a crosshair that moves
  through all of them together; sector rows also get a trend sparkline.
- **History is date-aware**: rebuilt (dashed) values count only the lots held
  at the time, so "what was it worth on March 3rd" is answered with what you
  owned then. The P&L graph subtracts the cost of the lots held at each
  moment, and "change over the range" leaves new buys out of the gain.
- **Earnings**: 24 rows per page with paging through all upcoming reports
  (was the next 16 only); watchlist earnings are listed too.

## 12.1

- **Look up any stock** from the + form ("look"): detail view with a
  1H/1D/1W/1M/3M/1Y chart at full resolution (5-minute bars intraday, hourly
  for weeks, daily for months), moves, volatility score, next earnings —
  without adding it. Clicking a holding opens the same view.
- **Watchlist**: "watch" a stock from the + form or a detail view; a new
  `watch` tab lists price, day move, sparkline and volatility for each; big-
  move alerts cover watched stocks too. Stored as `_watch` in positions.json;
  `watchlist.py add|remove|list` from Terminal.
- Company names on holdings, watchlist rows and detail views.
- **Sharper graphs**: the value graph keeps up to 320 points per range (was
  50), sparklines 90 sessions (was 50), 1-px gridlines on pixel centres, and
  anti-aliased round-joined lines.

## 12.0 — first public release

- **Add any stock easily**: the + form searches Yahoo Finance by company name
  or ticker, looks the stock up before you confirm (real name and price, so a
  typo can't slip in), and takes shares or a money amount (`$1000`). Any
  symbol Yahoo lists works, including `M&M.NS`-style tickers.
- **Volatility scores** (1–10, fixed scale) for every stock, sector and the
  portfolio; a risk panel; a volatility color mode for the heatmap; sort the
  list by volatility.
- **Any currency**: each holding's currency comes from Yahoo and is converted
  at live rates (pence-quoted London prices included). Display currency from
  the Mac's region, or `_settings.currency`.
- **Easy install**: finds Python with yfinance by itself (or `install.sh`
  sets one up), shows a setup card instead of an error, starts from a demo
  portfolio, works with an empty one ("start fresh"), explains a renamed
  folder. Settings live in `positions.json`; alerts are off by default.
- Tooltips on every control; pages pause while the pointer is over the widget;
  numbers and dates follow the Mac's region settings; sort the holdings list.
- Fixes: the "vs invested" P&L no longer drops by the whole amount when you
  sell; a buy/sell shows up within seconds even mid-refresh; `Infinity` and
  decimal commas can't corrupt positions.json; exchange-local dates for the 1D
  change of non-US stocks; a holiday no longer shows as "open"; a mid-day
  price is no longer cached as that day's close; untagged stocks get Yahoo's
  sector instead of "Other".

## 11.4

- A ticker with no data no longer freezes the widget; failed refreshes back
  off instead of retrying every tick; hung refreshes are cleaned up safely.
- Alerts no longer repeat overnight and on weekends.
- 1D graph shows the latest trading session; gaps while the Mac slept are
  filled (dashed) instead of drawn as a straight line.
- Daily/hourly price bars are cached, so a refresh is one request per stock.
- Earnings list capped so the widget fits on screen with 100+ holdings.
