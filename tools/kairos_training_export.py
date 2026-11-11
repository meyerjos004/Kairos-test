#!/usr/bin/env python3
"""STAGED: export King's KAIROS replay trades as training rows for the trading bot (Reese/Powell learn loop).
Each row = the trade (strategy, rules met, mistakes, side, R, P&L, time of day) + the 30 one-minute NQ/ES bars before entry
from the PC's local data (Trading/data/<SYM>/<date>.csv), so the model sees what the chart looked like when King clicked.
Writes HermesVault/Trading/KAIROS/training/trades.jsonl (+ trades.csv summary). Run on the PC: python3 kairos_training_export.py"""
import json, csv, os, pathlib, re, urllib.request, datetime as dt
TOK = pathlib.Path("/mnt/c/Users/joshh/.secrets/rewind-fixbox.token").read_text().strip()
KEY = re.search(r'key:\s*"([^"]+)"', pathlib.Path("/root/fixbox/rewind/config.js").read_text()).group(1)
URL = "https://ojmjhqzmkombxrqlknuw.supabase.co/rest/v1/rpc/training_export"
DATA = pathlib.Path("/mnt/c/Users/joshh/HermesVault/Trading/data"); OUT = pathlib.Path("/mnt/c/Users/joshh/HermesVault/Trading/KAIROS/training")
def ny(ts):  # UTC seconds -> New York wall clock (DST-aware via zoneinfo)
    from zoneinfo import ZoneInfo; return dt.datetime.fromtimestamp(ts, ZoneInfo("America/New_York"))
def bars_before(sym, ts, n=30):
    d = ny(ts).date(); out = []
    for day in (d - dt.timedelta(days=1), d):
        f = DATA / ("NQ" if "NQ" in sym else "ES") / f"{day}.csv"
        if f.exists(): out += [r for r in csv.DictReader(open(f)) if int(r["t"]) < ts]
    return [{k: float(v) for k, v in r.items()} for r in out[-n:]]
def main():
    req = urllib.request.Request(URL, json.dumps({"tok": TOK}).encode(), {"apikey": KEY, "Content-Type": "application/json"})
    rows = json.loads(urllib.request.urlopen(req, timeout=60).read()); OUT.mkdir(parents=True, exist_ok=True)
    with open(OUT / "trades.jsonl", "w") as jf, open(OUT / "trades.csv", "w", newline="") as cf:
        w = csv.writer(cf); w.writerow(["date_ny", "time_ny", "symbol", "side", "strategy", "rules_met", "rules_total", "mistakes", "r", "pnl", "outcome"])
        for t in rows:
            strat = next((x[6:] for x in t["tags"] if x.startswith("strat:")), ""); rm = next((x[6:] for x in t["tags"] if x.startswith("rules:")), "/")
            a, b = (rm.split("/") + [""])[:2]; when = ny(t["t_entry"])
            t.update(strategy=strat, rules_met=a, rules_total=b, ny_date=str(when.date()), ny_time=when.strftime("%H:%M"), bars_before=bars_before(t["symbol"], t["t_entry"]))
            jf.write(json.dumps(t) + "\n"); w.writerow([t["ny_date"], t["ny_time"], t["symbol"], "long" if t["dir"] > 0 else "short", strat, a, b, "|".join(t["mistakes"]), t["r"], t["pnl"], t["outcome"]])
    print("exported", len(rows), "trades to", OUT)
if __name__ == "__main__": main()
