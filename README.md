# Portfolio — an Übersicht widget

A desktop widget for [Übersicht](https://tracesof.net/uebersicht/) that tracks
a stock portfolio: total value and a value graph, your holdings as a list or a
heatmap, a volatility score for every stock, upcoming earnings, and optional
alerts on big moves. Prices come from Yahoo Finance.

![screenshot](screenshot.png)

- **Any stock Yahoo Finance lists**: US and foreign shares (`SHOP.TO`,
  `VOD.L`, `7203.T`, `M&M.NS`), ETFs, funds, crypto (`BTC-USD`), futures.
  Search by company name right in the widget.
- **Any currency mix**: each holding is converted to your currency (any code —
  USD, EUR, GBP, SEK, JPY, CHF… — picked from your Mac's region) at live
  exchange rates, and past values at that day's rate.
- **Years of history**: the graph and the day-by-day table reach back 5 years
  by default (or 3, 10, or everything — `backtestYears`), and to your earliest
  purchase when that is older. The long history downloads in the background
  after the first load, so the widget shows up just as fast.
- **Look up and watch any stock**: search by name, see its chart (1H to 1Y),
  moves and volatility score without adding it, and keep it on a watchlist
  that gets the same big-move alerts as your holdings.
- **What was it worth then?** Hover or click anywhere on the value graph for
  the exact value at that moment, type a date to jump to a day, or page
  through the day-by-day table.
- **Sector graphs**: how each sector has done over the hour, day, week, month
  or year, side by side on one scale.
- **Volatility score 1–10** for each stock, each sector and the whole portfolio.
- Value history with 1H/1D/1W/1M/1Y graphs, P&L against what you paid or
  against the money you put in, sector breakdown, top movers, dividends,
  earnings dates with the options-implied move.
- **Your layout**: drag it anywhere, resize it, zoom it, or split it into
  several windows — each showing just the parts you pick (graph, holdings,
  headlines, alerts…). The content adapts to the size you give it.
- **Returns that mean something**: real annual return (XIRR), time-weighted
  return, realized gains, dividends, drawdown, beta, an index to beat, target
  mix with rebalancing trades, price alerts, CSV export and a menu-bar summary.

## Install

1. Install [Übersicht](https://tracesof.net/uebersicht/).
2. Download `Portfolio.widget.zip` from the releases page and unzip it into
   your widgets folder (Übersicht menu → *Open Widgets Folder*). The folder must
   be named **`Portfolio.widget`**.
3. Open Terminal and run the one-time setup, which installs the
   [yfinance](https://pypi.org/project/yfinance/) package into its own
   environment (`~/.portfolio-widget/venv`):

   ```bash
   bash ~/Library/Application\ Support/Übersicht/widgets/Portfolio.widget/install.sh
   ```

   Already have Python with yfinance? Skip this — the widget finds Homebrew,
   python.org, pyenv and conda installs on its own.
4. Turn on Übersicht → *Preferences* → **Enable interaction** so the buttons
   work.

**First run.** The widget starts with a demo portfolio of 22 stocks. Prices
show up within a minute; the years of history behind the 3Y/5Y tabs then
download in the background ("loading history 12/40…" under the graph — once;
later refreshes only add new days). Replace the demo with your holdings
(below), or click **+ → start fresh** to clear it.

Needs macOS with Übersicht and Python 3.9 or newer (the one that comes with
the Xcode command line tools is fine); `install.sh` adds the one package the
widget uses, yfinance.

## Adding stocks

**In the widget:** click **+**, type a company name or a ticker ("apple",
"shopify", `VOD.L`), pick a match, enter **shares** (`10`, `2.5`) or a
**money amount** (`$1000`), and press **buy**. The widget looks the stock up
and asks you to confirm with its real name and price. Leave the price empty to
use today's price; add a date for older purchases. **sell** works the same way
(`all` sells the whole position).

**Selling records the gain.** Each sale is written to a `_realized` list in
`positions.json` — date, shares, proceeds, cost (oldest shares first) and
gain — so the **realized** line under the P&L and the **sales · realized**
panel keep your profit after the shares are gone. Sales made before version
12.7 weren't recorded and can't be recovered; add them to `_realized` by hand
if you want them counted. **Total return** = unrealized P&L + realized gains +
dividends received.

**Dividends.** The **income · dividends** panel estimates the next 12 months
of dividends (last year's payments × the shares you hold), the yield, the
yield on cost, and draws 12 monthly bars; dividends received are estimated
from the shares you held on each payment date — lots with a purchase date,
including shares sold since 12.7 (undated lots and older sales can't be
placed in time, so they don't count). Upcoming ex-dividend dates are tagged in
the earnings list. The panel hides when nothing you hold pays.

**look** opens the stock's detail view without adding it — price, day move,
1H/1D/1W/1M/3M/1Y chart, volatility score, next earnings — and **watch** puts
it on the watchlist (the **watch** tab next to list/map). Watched stocks show
price, day move, sparkline and volatility, and trigger the same alerts as
holdings. Click any ticker in the list, the heatmap or the watchlist for its
detail view; from there you can watch/unwatch it or start a buy.

**In the file:** holdings live in `positions.json` in the widget folder
(**+ → show file** reveals it). The simplest form is ticker → shares:

```json
{
  "MSFT": 10,
  "SHOP.TO": 25,
  "VOD.L": 300
}
```

Add a cost and date to get P&L, and several lots if you bought in stages:

```json
{
  "MSFT": { "shares": 10, "avgCost": 412.30, "purchaseDate": "2025-03-14" },
  "JNJ": { "lots": [
    { "shares": 5, "date": "2024-11-01", "avgCost": 155.00 },
    { "shares": 2, "date": "2025-06-02" }
  ], "theme": "Health care" }
}
```

- `avgCost` is per share, in the stock's own currency. Without it, the
  closing price on `purchaseDate` is used (marked **≈** in the widget).
- `theme` groups holdings in the heatmap and sector list; untagged stocks use
  Yahoo's sector.
- `_invested` (optional): the total money you've put in, in your display
  currency — enables the "vs invested" P&L view. Buys and sells made in the
  widget update it for you.
- `_cash` (optional): `{"USD": 1200, "CAD": 300}` is added to the total.
- `_watch` (optional): `["AMD", "SHOP.TO", "BTC-USD"]` — tickers to monitor
  without holding them.

From Terminal, the same helpers the widget uses:

```bash
cd ~/Library/Application\ Support/Übersicht/widgets/Portfolio.widget
python3 ticker_lookup.py search "shopify"
python3 add_position.py SHOP.TO 10
python3 add_position.py MSFT --amount 1000
python3 remove_position.py MSFT 5 --price 190
python3 remove_position.py --reset-all      # start over (backup kept)
python3 watchlist.py add AMD                # monitor without holding
python3 ticker_lookup.py look AMD           # detail + chart data as JSON
```

## Reading the graph

The tabs above the graph pick the range — 1H to 1Y; **3Y**, **5Y**, **10Y**
and **MAX** (as far as `backtestYears` allows); or **ALL** for everything
since your first purchase (or `backtestYears` back, for holdings without a
date) — and what it shows.

**Backtest.** On 3Y/5Y/10Y/MAX the years before your first purchase show what
today's holdings would have done: that stretch is drawn lighter, a line
marks "you bought here", and hovering it says "simulated". Switch under the
graph between **as held now** (today's share counts carried back) and **as
weighted now** (today's percentages, rebalanced monthly). It's hindsight —
these are the stocks you ended up picking — and it never changes the real
part of the graph. With simulated years on screen, the change % in the corner
is time-weighted, so new money never counts as a gain.

**Index comparison.** The thin grey line is the same money put into an
index on the same days as each of your purchases; the caption reads like
"you +12.0% · SPY +9.5% · beat by 2.5 pts" and follows any start date,
backtest years included. Click **index: SPY ▾** under the graph to pick
another — popular index funds grouped by region (yours first), "auto" (the
default for your currency), "none" (no comparison, no index downloads) or
any other Yahoo symbol; **hide** / **show index** turns the line off and on.
The choice is saved as `benchmark` (see Settings).

The graph modes:

- **value** — what the portfolio was worth. Most of it was recorded by
  the widget as it happened; stretches before you installed it, or while the
  Mac slept, are rebuilt from market prices (hovering them shows ≈) and **the shares you
  held at the time**, which is why purchase dates in `positions.json` matter:
  a day before a purchase doesn't count those shares. A purchase shows as a
  step up in value — the change figure in the corner leaves new buys out, so
  it measures gain, not deposits.
  Holdings without a purchase date carry a small **undated** tag and count as
  held for the whole graph. A holding whose prices start later than the graph
  (a recent IPO, a renamed or delisted ticker, a foreign listing Yahoo has
  little data for) counts as cash until its first price, so there is no gap
  and no jump; the graph notes "2 holdings start later" (hover for which).
- **p&l** — value minus what the holdings cost, over time.
- **sectors** — one small chart per sector (and one for the whole portfolio),
  best performer first, all on the same % scale so sizes compare ("shared
  scale" / "best first" under the charts switch to own scales or to biggest
  holding first). It prices today's holdings back through time, so a purchase
  never looks like a gain, and it leaves nights and weekends out, so the lines
  don't turn into steps. **Click a sector to enlarge it**: a full-size chart
  with a % axis, the whole portfolio as a grey reference line, and the
  sector's stocks underneath (click one for its own chart). "‹ all sectors"
  goes back. Clicking a row in the **sectors** panel on the left opens the
  same enlarged chart.

**⤢** at the end of the tabs makes the value and p&l graphs more than twice
as tall (**⤡** shrinks them back). **Type any date** in the date box to see
what the portfolio was worth that day and press Enter to start the graph
there — as far back as the price history goes. The day-by-day table shows the
newest days first; "older ›" and older dates load the rest as needed. Right
after installing, "loading history 12/40…" under the graph means the long
price history is still downloading (once; later refreshes only add new days).

**Hover** the graph and a crosshair snaps to the nearest data point and shows
the exact value and time; **click** to pin it (click it again to release). In
the sector view the crosshair runs through every chart at once. To look up a
day, type it in the date box (`2026-03-14`, or just `03-14`) — weekends and
holidays fall back to the last trading day — or open the **days** panel, a
table of each day's closing value and gain (≈ marks days rebuilt from closing
prices; the rest are the widget's own end-of-day recordings).

**Start the graph on any date:** type it in the date box (`2025-02-03`, or
`02-03` for the most recent one) and press **Enter** — or pin a moment by
clicking the graph or a day in the days panel and press **start here**. The
graph (value, p&l or sectors) then begins there, with one point per trading
day for long spans and every change figure measured from that point. The
"from Feb 3 ×" tab, or any range tab, returns to the normal ranges. History
reaches back to your earliest purchase date, however far that is; days before
you held anything aren't shown.

Inside the period the widget has been recording, rebuilt stretches
are shifted to meet the recorded values on both sides, so the line doesn't
zigzag when the two disagree — for instance after you add a holding with an
older purchase date. Before the first recording the rebuilt values stand as
they are.

The **earnings** column lists every upcoming report for your holdings and
your watchlist, 24 at a time — "later ›" pages through the rest.

## Targets and rebalancing

Tell the widget what mix you're aiming for in `_settings.targets` — tickers or
sector names (as shown in the widget) plus `"cash"`, in percent of the whole
portfolio:

```json
"targets": {"Tech": 30, "Health care": 20, "Financials": 15, "KO": 10, "cash": 5, "Energy": 20}
```

Each holding then gets a small **drift** badge (percentage points above or
below target; orange when over), the heatmap gets a **drift** colouring, and a
**rebalance** panel lists the trades that move the fewest dollars to get
everything within ±1 point of target — in whole shares or fractional, never
spending cash you don't have — plus where new money should go first. The widget
warns when targets don't add up to 100 or name something you don't hold.
Holdings without a target count as 0%. With no targets, none of this shows.

## Returns and risk

After 30 days of history the header shows your **real annual return**, e.g.
"+12.0% total · 9.8%/yr": a money-weighted rate (XIRR) where every purchase is
money out and sales, dividends and today's value are money in, each at that
day's exchange rate (cash is left out). Hover it for the **time-weighted**
return too — the holdings' own growth, no matter when you added money. Younger
portfolios see "…appear after 30 days" instead of a number that would mean
little. The **risk** panel adds the **drawdown** (how far below its peak the
portfolio is now, and the worst drop with its date), **beta** against your
index and the **Sharpe ratio** ((annual return − 4%) ÷ annual volatility).
The same figures for the backtest years are shown separately, labelled e.g.
"(backtest, 10y)". Hover a holding for its 52-week closing high.

## Windows, size and what's shown

**Move** a window by dragging its **title row** (double-click the ⠿ grip for
the default spot). **Resize** it by dragging its right edge, bottom edge or
bottom-right corner (they appear on hover) — this changes the real width and
height, and the content adjusts: one column when narrow, two or three when
wide, a bigger or smaller graph, more or fewer rows, and panels folding away
when there isn't room ("+N hidden — ⚙" says what). Double-click an edge to go
back to the default width or to "fit content".

**⚙** in the title row opens the editor for that window:

- **window** — title; **+ new window** from a template (full, graph only,
  holdings, news & alerts, ticker line, blank), duplicate, one line, delete;
  **reset everything** to the default look.
- **size** — exact width and height (empty height = fit content), zoom
  60–160%, and whether the left panels rotate or stack.
- **features** — every header line, graph part (each range tab, modes, date
  box, index line and picker, backtest, ⤢), panel (movers, sectors, risk, days,
  holdings, earnings, alerts, price alerts, sales, income, rebalance, news),
  holding-row detail and footer part can be switched on or off. Panels can be
  moved up/down, to the other column (a⇄b) or to another window, and given a
  priority: **always**, normal, or **room** (only when there's space) — the
  layout folds "room" panels first when a window is short. A part (a range
  tab, the index line, a footer item…) shows only while its block (the graph,
  the footer…) is on: switching a block off hides its parts and remembers
  which were on.

Each window keeps its own range, mode, page and view. Everything is saved in
`_settings.display` and survives restarts; without it you get the single
default widget. Adding a **news** panel turns headlines on.

## Compact mode, export, backups, menu bar

**Compact mode.** Click the widget's title to fold it into one line — total,
today's % and $, and a small sparkline. Click the title again to open it. It
stays folded after Übersicht restarts (`compact` in `_settings`), and dragging
the title still moves the widget.

**Export.** "export" in the footer writes three CSV files to
`~/Documents/Portfolio/` and shows them in Finder: `holdings.csv` (each
purchase with its cost, plus cash), `daily_values.csv` (the whole day-by-day
history with the money put in and the index) and `sales.csv` (sales recorded
since 12.7). They open in Numbers and Excel (UTF-8, ISO dates, plain numbers;
in Excel with a comma as decimal separator, use Data → From Text). macOS may
ask once whether Übersicht may use your Documents folder. From Terminal:
`python3 export.py`, or `PORTFOLIO_EXPORT_DIR=/some/folder python3 export.py`.

**Daily backup.** Once a weekday after the US market closes, the widget copies
`positions.json` to `positions.backup-YYYYMMDD-HHMMSS-daily.json` in the widget
folder and keeps the newest 30. "Start fresh" backups (`--reset-all`) are
never touched. To restore, copy a backup over `positions.json`.

**Menu bar** (optional, with [SwiftBar](https://swiftbar.app) or
[xbar](https://xbarapp.com)): shows e.g. "$32.3k +0.8%" and a small dropdown,
read from the widget's last refresh — it never downloads anything itself, so
Übersicht must be running. Link the script into your plugins folder with a
refresh interval in its name:

```bash
ln -s ~/Library/Application\ Support/Übersicht/widgets/Portfolio.widget/menubar.sh \
      ~/path/to/your/SwiftBar/Plugins/portfolio.1m.sh
```

(xbar's folder is `~/Library/Application Support/xbar/plugins`.) If the widget
lives somewhere else, set `PORTFOLIO_WIDGET_DIR` for the plugin.

## Settings

In `positions.json`, under `"_settings"`. Every key is optional — leave one
out for its default. Most are set for you by clicking in the widget.

| key | default | what it does |
|---|---|---|
| `title` | `"portfolio"` | the name in the title row |
| `currency` | `"auto"` | the currency everything is shown in |
| `backtestYears` | `5` | how far back the price history goes: `3`, `5`, `10` or `"max"` |
| `benchmark` | `"auto"` | the index under the graph (**index: … ▾**) |
| `showBenchmark` | `true` | the index line shown (**hide** / **show index**) |
| `graphBig` | `false` | the taller graph (**⤢** / **⤡**) |
| `compact` | `false` | folded to one line (click the title) |
| `news` | `false` | headlines — no headline requests at all while off |
| `alerts` | `false` | a notification when a holding or the portfolio moves a lot in a day |
| `alertThreshold` | `5` | the daily move (%) of one holding that alerts |
| `portfolioAlertThreshold` | `2.5` | the daily move (%) of the whole portfolio that alerts |
| `targets` | none | your target mix, for drift and rebalancing |
| `rebalanceWhole` | automatic | rebalance in whole shares (`true`) or fractional (`false`) |
| `display` | none | your windows and what each shows (the **⚙** editor) |
| `position`, `scale` | none | the single window's spot and zoom from before windows existed |

For example:

```json
"_settings": {
  "title": "my stocks",
  "currency": "EUR",
  "backtestYears": 10,
  "benchmark": "IWDA.AS",
  "news": true,
  "alerts": true,
  "alertThreshold": 4
}
```

Next to `_settings` the file can also hold `_invested`, `_cash` and `_watch`
(see *Adding stocks*), `_alerts` (below) and `_realized` (written when you
sell). Other keys starting with `_` are ignored, so `"_note": "…"` is a safe
place for a comment.

In detail:

- `currency`: any currency code — `"USD"`, `"EUR"`, `"GBP"`, `"SEK"`, `"JPY"`,
  `"CHF"`, `"AUD"`… — or `"auto"` (default): your Mac's region decides
  (System Settings → General → Language & Region). Holdings in other
  currencies are converted at live rates, and past values at that day's rate.
- `backtestYears`: how far back the price history goes — `3`, `5` (default),
  `10` or `"max"` (everything Yahoo has). Purchases older than that still
  reach back to their purchase date. It also decides which backtest tabs
  appear (3 → 3Y; 5 → 3Y, 5Y; 10 → also 10Y; "max" → also MAX).
- `benchmark`: the index on the graph — any Yahoo symbol (`"VT"`, `"^GSPC"`,
  `"IWDA.AS"`…), `"none"` to hide it, or `"auto"` (default): SPY for USD,
  XIU.TO for CAD, EXW1.DE for EUR, ISF.L for GBP, STW.AX for AUD, 1306.T for
  JPY, CSSMI.SW for CHF, 2800.HK for HKD, and ACWI (converted) for any other
  currency. Easiest: click "index: … ▾" under the graph and pick from popular
  index funds (SPY, QQQ, VTI, DIA, IWM, VT, ACWI, EFA, EEM, XIU.TO, XIC.TO,
  VFV.TO, XEQT.TO, EXW1.DE, IWDA.AS, ISF.L) or type any symbol.
- `targets` / `rebalanceWhole`: your target mix (see *Targets and
  rebalancing*) and whether the rebalance panel suggests whole shares (`true`)
  or fractional (`false`; unset = whole shares when all your holdings are).
- `showBenchmark` / `graphBig`: whether the index line is shown and whether
  the graph is enlarged. The widget sets them for you when you click "hide" /
  "show index" or ⤢ / ⤡ (`widget_command.sh setting showBenchmark false` does
  the same from Terminal).
- `display`: your windows and what each shows — set by the ⚙ editor, rarely
  edited by hand. Shape: `{"windows": [{"id": "main", "title": "…", "x": 40,
  "y": 40, "w": 664, "h": "auto", "zoom": 1, "items": ["graph", "panel.news",
  …], "prio": {"panel.news": "always"}, "side": {…}, "carousel": "rotate"}]}`
  (1–8 windows; feature ids are listed in `display_prefs.py`). Remove it to
  get the default single widget back.
- `position` / `scale`: the default window's spot and zoom from before
  windows existed (still honoured; the editor moves them into `display`).
- `alerts`: a macOS notification when a holding moves more than
  `alertThreshold` % in a day, or the whole portfolio more than
  `portfolioAlertThreshold` %. Once per stock per trading day. Notifications
  come from Script Editor, so allow it under System Settings → Notifications.
- `news`: `true` shows the latest headlines in a stock's detail view and marks
  holdings moving more than 3% (default `false`: no headline requests at all).

**Price alerts** live next to `_settings` in a `_alerts` list — separate from
the daily-move `alerts` above, and on whenever the list has entries:

```json
"_alerts": [
  {"ticker": "KO", "above": 70},
  {"ticker": "KO", "below": 55},
  {"ticker": "MSFT", "pctFromCost": -20},
  {"ticker": "*", "drawdownPct": 15}
]
```

`above` / `below` are prices in the stock's own currency; `pctFromCost` is the
change from what you paid (needs a purchase price or date); `"*"` with
`drawdownPct` watches the whole portfolio's drop from its peak. Each fires
once when crossed and re-arms after the price crosses back. Add and remove them
in a stock's detail view ("alert at…", ×), in the **price alerts** panel, or
from Terminal: `python3 alerts.py add KO above 70`, `python3 alerts.py list`,
`python3 alerts.py remove <id>`.

## Volatility scores

Each stock gets its **annualized volatility**: how much its price has been
swinging, measured as the standard deviation of daily returns over the last 3
months, scaled to a year. The **score** is simply that number divided by ten,
kept between 1 and 10:

| score | volatility | feels like |
|---|---|---|
| 1–2 | under 20%/yr | very calm / calm: utilities, consumer staples |
| 3–4 | 20–40% | moderate: most large companies |
| 5–6 | 40–60% | lively: fast-growing tech |
| 7–8 | 60–80% | wild: chip makers, turnarounds |
| 9–10 | 80%+ | extreme: speculative small caps, crypto |

The scale is fixed, so a 6 means the same in every portfolio and doesn't
change when you add stocks. The **risk** panel shows the portfolio's own
volatility next to the average of its holdings — the gap is what
diversification buys you — plus the wildest and calmest names. Switch the
heatmap to **vol** to color tiles by score. Past volatility describes how a
stock *has* moved, not a forecast.

## Privacy

- Everything stays on your Mac: your holdings in `positions.json`, the value
  history in `.cache/`, backups in the widget folder, exports in
  `~/Documents/Portfolio/` (only when you click export). No account, no
  analytics, no server of this project's.
- The only requests go to Yahoo Finance, through yfinance: prices and history
  for your tickers, the index and exchange rates (about every 5 minutes while
  Übersicht runs), your searches in the + form, and headlines only when
  `news` is on. Yahoo sees which symbols are asked for — never how many
  shares you hold or what you paid.
- Sharing a screenshot shows your numbers; the demo portfolio is there for
  that.

## Updating

Replace the code files and keep your `positions.json`, its
`positions.backup-*.json` copies and the `.cache/` folder (the value
history). Or copy those into the new folder before switching. Settings and
files from older versions keep working.

## Troubleshooting

- **"one-time setup"** on the widget: run `install.sh` (step 3). If you use
  a Python the widget can't find, put its full path in a file named
  `python.txt` in the widget folder.
- **"no data: XYZ"** in the footer: Yahoo has no prices for that ticker
  (typo or delisted). It's left out of the totals — search for the right one.
- **"last refresh failed"**: hover it to see why. The widget keeps showing
  the last good prices (holdings marked **!**) and tries again after 2
  minutes, then waits twice as long after each further failure, up to 30
  minutes — at least 15 when Yahoo says "too many requests", since retrying
  sooner only makes the block last longer.
- **A message about `positions.json`** (e.g. "is not valid JSON"): the file
  has a typo — often a missing comma or quote. It names the line; fix it in a
  text editor, or copy the newest `positions.backup-….json` over it.
- **A window is off-screen or the layout is a mess**: double-click the ⠿ grip
  for the default spot, use **⚙ → reset everything**, or in Terminal
  (in the widget folder) `python3 set_setting.py display reset-all`.
- **Buttons don't react**: turn on Übersicht → Preferences → *Enable
  interaction*.
- The market-hours dot follows US hours (NYSE/Nasdaq).

## Files

| file | what it does |
|---|---|
| `index.jsx` | the widget UI |
| `widget_command.sh` | what Übersicht runs every few seconds; starts refreshes, finds Python |
| `portfolio_tracker.py` | fetches prices and computes everything (needs yfinance) |
| `ticker_lookup.py` | stock search and lookups for the + form (needs yfinance) |
| `add_position.py`, `remove_position.py`, `watchlist.py`, `portfolio_file.py` | buy/sell/watch helpers (standard library only); selling records the gain in `_realized` |
| `export.py` | writes the three CSV files (`export` in the footer) |
| `menubar.sh` | optional SwiftBar / xbar menu bar summary (reads the last refresh only) |
| `rebalance.py` | the rebalance maths (targets, drift, fewest-dollar trades) |
| `alerts.py` | add, remove and list price alerts (`_alerts`) |
| `display_prefs.py` | checks the `display` setting (windows, features, sizes) |
| `set_setting.py` | saves what you click in the widget (index, ⤢, one line, news, windows…) into `_settings` |
| `positions.example.json` | the demo portfolio; copied to `positions.json` on first run |
| `install.sh`, `requirements.txt` | one-time Python setup |

## License

MIT — see `LICENSE`. Made by Markus Packalen.

Data comes from Yahoo Finance through the unofficial `yfinance` library. This
project isn't affiliated with Yahoo; the data is for personal use and may be
delayed or wrong. Not financial advice.
