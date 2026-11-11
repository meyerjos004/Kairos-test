# ⟲ Rewind

Bar-by-bar futures replay for practicing and backtesting by hand, in the browser. NQ, MNQ, ES, MES.

- **Replay:** 15s, 30s, 1m–30m, 1h, 4h and daily, all built from the base bars. 4h and daily line up with the 18:00 NY futures open. You can play, pause, step, change speed and jump to a date.
- **Trading panel:** buy or sell with a stop and an R target, and size from a risk % or a fixed quantity. Fills are conservative: if the stop and target are both hit in the same bar, it counts as the stop. Gaps through the stop fill at the open.
- **Prop rules:** daily loss limit and a trailing max drawdown. The session locks when either one is hit.
- **Journal:** every trade is saved with a chart screenshot and notes. Stats include win rate, avg R, profit factor, drawdown and the equity curve, and you can export to CSV.
- **Trading station:** scalp pad, a DOM price ladder, an order ticket, limit/stop orders with brackets, draggable stop/target lines, drawings (lines, trend, fib, measure), 2-chart layout, hotkeys (B/S/X/R/C, space, arrows, H/T/F/M).
- **Notion:** every user can connect their own Notion and get trades sent to a "Rewind Journal" database.
- **Accounts:** each person has their own account. Supabase row-level security keeps your trades, settings and screenshots private, invite only.

## Stack
A static site on GitHub Pages, with [TradingView Lightweight Charts™](https://www.tradingview.com/lightweight-charts/) and Supabase (auth, Postgres, storage, one edge function for data uploads).

**This repo is code only.** Price data lives in a private storage bucket that only invited users can read. The key in `config.js` is a Supabase *publishable* key, and on its own it can't read anything.

## Adding features
Everything is in `app.js`, grouped into sections: time, data, replay, opens, account, trading, journal, prefs, admin. Features can be switched on and off for everyone from the Admin tab (`public.features`).

Not financial advice. It's a practice tool.
