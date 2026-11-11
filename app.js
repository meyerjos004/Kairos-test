/* Rewind v0.4: bar-by-bar futures replay that works like a prop-firm trading station.
   - 1 to 8 synced charts (any timeframe each), canvas drawing layer (trend, ray, h-line, h-ray, v-line, zone, fib, long/short position, measure, text)
   - Long/Short position tool can be ARMED: it places the entry order with its own stop + target and fills automatically (FX Replay style)
   - Floating Scalp Pad (drag it anywhere, right-click for settings), DOM ladder with My Bid/My Ask, Order mode with draft order lines
   - Right-click menus on the chart, order lines, positions and drawings; drag stop / target / orders; PDLL / PDPT / lockouts; configurable hot keys
   Data: monthly gz CSVs (t,o,h,l,c UTC seconds) from the private 'bars' bucket; 1m always, 15s for NY mornings when a pane needs it.
   ?demo runs on made-up prices with nothing saved. */
"use strict";
const DEMO = new URLSearchParams(location.search).has("demo");
const sb = supabase.createClient(REWIND.url, REWIND.key);
const $ = (id) => document.getElementById(id);
const INST = { NQ: { data: "NQ", pt: 20, micro: false }, MNQ: { data: "NQ", pt: 2, micro: true }, ES: { data: "ES", pt: 50, micro: false }, MES: { data: "ES", pt: 5, micro: true } };
const TFS = [["15s", 15], ["30s", 30], ["1m", 60], ["2m", 120], ["3m", 180], ["5m", 300], ["15m", 900], ["30m", 1800], ["1h", 3600], ["4h", 14400], ["1D", 86400]];
const SEC = Object.fromEntries(TFS);
const TICK = 0.25;
const LAYOUTS = { "1": [1, 1], "2": [2, 1], "2h": [1, 2], "3": [3, 1], "4": [2, 2], "6": [3, 2], "8": [4, 2] };
const DEF_TFS = ["5m", "1m", "15m", "1h", "4h", "30m", "1D", "15s"];
const IND_DEF = { sess: true, pd: true, fvg: false, fvgTf: "1h", h4: false, po3: false };
const DEF_KEYS = { buy: "b", sell: "s", joinbid: "j", joinask: "a", reverse: "r", flatten: "f", cancel: "c", close: "x", trend: "t", hline: "h", vline: "v", rect: "z", long: "l", short: "k", measure: "m" };
let user = null, isAdmin = false, features = {}, notionAuto = false;
let prefs = { bal: 50000, dll: 1000, ptg: 0, act: "block", mdd: 2000, fee: 4.5, mfee: 1.5, opens: true, sess: true, up: "#2bd4a0", dn: "#ff6b7a", sym: "NQ", layout: "1", tfs: DEF_TFS.slice(),
  lots: 1, lotset: [1, 2, 3, 5, 10], slPts: 15, tpPts: 45, autoBr: true, byRisk: false, riskp: 1, trail: 0, keys: { ...DEF_KEYS }, pad: { show: true, x: null, y: null }, magnet: false, dockClosed: true, side: false, ind: { ...IND_DEF }, dockH: 150, favs: ["trend", "hline", "rect", "long", "short"], favShow: true, favPos: null, toolsPos: null };

/* ---------------- time (shown in New York time) ---------------- */
const offCache = new Map();
function nyOffset(t) {
  const h = Math.floor(t / 3600); if (offCache.has(h)) return offCache.get(h);
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(new Date(t * 1000)).map((x) => [x.type, x.value]));
  const o = Math.round((Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) / 1000 - t) / 60) * 60; offCache.set(h, o); return o;
}
const loc = (t) => t + nyOffset(t);
const fmt = (lt) => new Date(lt * 1000).toISOString().slice(0, 16).replace("T", " ");
const lhm = (lt) => new Date(lt * 1000).toISOString().slice(11, 16);
const sessDay = (t) => new Date((loc(t) + 6 * 3600) * 1000).toISOString().slice(0, 10);
function nyToUtc(s) { const g = Date.parse(s + ":00Z") / 1000; return g - nyOffset(g - nyOffset(g)); }
function bucket(lt, sec) { if (sec >= 14400) { const b = 18 * 3600; return Math.floor((lt - b) / sec) * sec + b; } return Math.floor(lt / sec) * sec; }
const money = (x) => (x < 0 ? "-$" : "$") + Math.abs(x).toLocaleString(undefined, { maximumFractionDigits: 0 });
const px2 = (p) => (p == null ? "—" : (+p).toFixed(2));
const rnd = (p) => Math.round(p / TICK) * TICK;
function endOfTradingDay(t) { const lt = loc(t), d0 = Math.floor((lt + 6 * 3600) / 86400) * 86400 - 6 * 3600 + 23 * 3600; return d0 - nyOffset(t); }

/* ---------------- data ---------------- */
const monthCache = new Map();
async function loadMonth(sym, tf, ym) {
  const key = sym + "/" + tf + "/" + ym; if (monthCache.has(key)) return monthCache.get(key);
  const p = DEMO ? Promise.resolve(demoMonth(sym, tf, ym)) : (async () => {
    const { data, error } = await sb.storage.from("bars").download(key + ".csv.gz"); if (error || !data) return [];
    const txt = await new Response(data.stream().pipeThrough(new DecompressionStream("gzip"))).text(); const out = []; const L = txt.split("\n");
    for (let i = 1; i < L.length; i++) { const c = L[i].split(","); if (c.length >= 5) out.push({ t: +c[0], o: +c[1], h: +c[2], l: +c[3], c: +c[4] }); }
    return out;
  })();
  monthCache.set(key, p); return p;
}
function demoMonth(sym, tf, ym) {
  if (tf === "15s") { const out = []; for (const b of demoMonth(sym, "1m", ym)) { const h = new Date(loc(b.t) * 1000).getUTCHours(), mi = new Date(loc(b.t) * 1000).getUTCMinutes(); if (!((h === 9 && mi >= 20) || h === 10 || h === 11)) continue;
      const pts = [b.o, b.o + (b.h - b.o) * 0.6, b.l + (b.c - b.l) * 0.4, b.c]; for (let k = 0; k < 4; k++) { const o = k ? pts[k - 1] : b.o, c = pts[k]; out.push({ t: b.t + 15 * k, o: rnd(o), h: rnd(Math.max(o, c, k === 1 ? b.h : -1e9)), l: rnd(Math.min(o, c, k === 2 ? b.l : 1e9)), c: rnd(c) }); } } return out; }
  const [y, m] = ym.split("-").map(Number); const t0 = Date.UTC(y, m - 1, 1) / 1000, t1 = Date.UTC(y, m, 1) / 1000, step = tf === "15s" ? 15 : 60;
  let seed = y * 100 + m + (tf === "15s" ? 7 : 0), p = sym === "NQ" ? 21000 + (m * 137) % 900 : 5900 + (m * 31) % 200; const rr = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const out = []; let drift = 0;
  for (let t = t0; t < t1; t += step) {
    const lt = loc(t), d = new Date(lt * 1000), dow = d.getUTCDay(), hr = d.getUTCHours();
    if (dow === 6 || (dow === 0 && hr < 18) || (dow === 5 && hr >= 17) || hr === 17) continue;
    if (tf === "15s" && !((hr === 9 && d.getUTCMinutes() >= 20) || hr === 10 || hr === 11)) continue;
    if (rr() < 0.003) drift = (rr() - 0.5) * 0.6;
    const vol = (hr >= 9 && hr < 12 ? 3.2 : 1.2) * (sym === "NQ" ? 1 : 0.3) * Math.sqrt(step / 60);
    const o = p, c = rnd(p + drift + (rr() - 0.5) * vol * 2), h = rnd(Math.max(o, c) + rr() * vol), l = rnd(Math.min(o, c) - rr() * vol);
    out.push({ t, o, h, l, c }); p = c;
  }
  return out;
}
const ymOf = (t) => new Date(t * 1000).toISOString().slice(0, 7);
function addM(ym, n) { const [y, m] = ym.split("-").map(Number); return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7); }

/* ---------------- storage layer ---------------- */
const mem = { trades: [] };
const db = {
  async newSession(row) { if (DEMO) return { id: "s" + Date.now(), ...row }; const { data, error } = await sb.from("sessions").insert(row).select().single(); if (error) throw error; return data; },
  saveCursor(id, ts) { if (!DEMO) sb.from("sessions").update({ cursor_ts: ts, updated_at: new Date().toISOString() }).eq("id", id).then(() => {}); },
  async addTrade(row) { if (DEMO) { const r = { id: "t" + Math.random().toString(36).slice(2), ...row }; mem.trades.push(r); return r; } const { data, error } = await sb.from("trades").insert(row).select().single(); if (error) throw error; return data; },
  async trades(sym) { if (DEMO) return mem.trades.filter((t) => !sym || t.symbol === sym); let q = sb.from("trades").select("*").order("t_exit").limit(5000); if (sym) q = q.eq("symbol", sym); const { data } = await q; return data || []; },
  async accounts() { if (DEMO) return (mem.accounts || (mem.accounts = [])).slice(); const { data } = await sb.from("accounts").select("*").eq("archived", false).order("created_at"); return data || []; },
  async newAccount(row) { if (DEMO) { const r = { id: "a" + Date.now(), created_at: new Date().toISOString(), ...row }; (mem.accounts = mem.accounts || []).push(r); return r; } const { data, error } = await sb.from("accounts").insert(row).select().single(); if (error) throw error; return data; },
  async updAccount(id, ch) { if (DEMO) { Object.assign(mem.accounts.find((a) => a.id === id), ch); return; } const { error } = await sb.from("accounts").update(ch).eq("id", id); if (error) throw error; },
  async allTrades() { if (DEMO) return mem.trades; const { data } = await sb.from("trades").select("*").order("t_exit").limit(10000); return data || []; },
  note(id, v) { if (DEMO) { const t = mem.trades.find((x) => x.id === id); if (t) t.notes = v; return; } sb.from("trades").update({ notes: v }).eq("id", id).then(() => {}); },
};
async function notion(action, extra = {}) {
  if (DEMO) throw new Error("off in the demo");
  const { data, error } = await sb.functions.invoke("notion", { body: { action, ...extra } });
  if (error) { let m = error.message; try { m = (await error.context.json()).error || m; } catch (e) {} throw new Error(m); } return data;
}

/* ---------------- replay core: two bases (1m always, 15s when a pane needs it), one shared clock ---------------- */
const B = { "1m": { bars: [], i: -1 }, "15s": { bars: [], i: -1 } };
let need15 = false, cursorT = 0, sym = "NQ", inst = INST.NQ, timer = null, months = new Set(), sess = null;
const paneSec = (i) => SEC[prefs.tfs[i] || "5m"];
function lastBar() { const a = B["1m"].bars[B["1m"].i], b = need15 ? B["15s"].bars[B["15s"].i] : null; if (!a) return b; if (!b) return a; return b.t >= a.t ? b : a; }
const last = () => (lastBar() ? lastBar().c : null);
const nowT = () => cursorT;
async function loadReplay() {
  pause(); if (pos.qty || orders.length) return toast("Close positions and cancel orders first");
  sym = $("sym").value; inst = INST[sym]; need15 = panes.some((p) => paneSec(p.i) < 60);
  const s = $("start").value; if (!s) return toast("Pick a start date and time"); const t0 = nyToUtc(s), ym = ymOf(t0);
  toast("Loading " + sym + "…"); months = new Set([addM(ym, -1), ym, addM(ym, 1)]);
  for (const tf of ["1m", "15s"]) { B[tf].bars = []; B[tf].i = -1; if (tf === "15s" && !need15) continue; B[tf].bars = (await Promise.all([...months].sort().map((m) => loadMonth(inst.data, tf, m)))).flat().sort((a, b) => a.t - b.t); }
  if (!B["1m"].bars.length) return toast("No data for that month");
  if (need15 && !B["15s"].bars.length) toast("No 15s data around that date (15s covers NY mornings). 15s and 30s panes will be empty.");
  cursorT = t0 - 1; for (const tf of ["1m", "15s"]) { const bs = B[tf].bars; let k = -1; for (let j = 0; j < bs.length && bs[j].t <= cursorT; j++) k = j; B[tf].i = k; }
  await acctStart();
  try { sess = await db.newSession({ name: sym + " " + fmt(loc(t0)), symbol: sym, start_ts: t0, cursor_ts: t0, tf: prefs.tfs[0], account_start: startBal, risk_pct: prefs.riskp, rules: { dll: prefs.dll, mdd: prefs.mdd, ptg: prefs.ptg }, ...(acct ? { account_id: acct.id } : {}) }); }
  catch (e) { return toast("Could not start a session: " + e.message); }
  hist = []; lock = null; rebuildAll(); panes.forEach((p) => p.chart.timeScale().scrollToRealTime()); toast(""); prefs.sym = sym; savePrefs();
}
async function ensure15() {   // a pane switched to 15s/30s mid-session: load 15s data without resetting the session
  need15 = true; if (B["15s"].bars.length || !B["1m"].bars.length) return;
  toast("Loading 15s data…"); B["15s"].bars = (await Promise.all([...months].sort().map((m) => loadMonth(inst.data, "15s", m)))).flat().sort((a, b) => a.t - b.t);
  let k = -1; for (let j = 0; j < B["15s"].bars.length && B["15s"].bars[j].t <= cursorT; j++) k = j; B["15s"].i = k;
  if (!B["15s"].bars.length) toast("No 15s data around this date (15s covers NY mornings)"); else toast("");
}
async function ensureAhead() {
  const b = B["1m"]; if (b.bars.length - b.i > 3000) return; const nx = addM([...months].sort().pop(), 1);
  if (months.has(nx) || nx > new Date().toISOString().slice(0, 7)) return; months.add(nx);
  for (const tf of ["1m", "15s"]) { if (tf === "15s" && !need15) continue; const more = await loadMonth(inst.data, tf, nx), lt = B[tf].bars.length ? B[tf].bars[B[tf].bars.length - 1].t : 0; for (const x of more) if (x.t > lt) B[tf].bars.push(x); }
}
async function stepFwd(ui = true) {
  if (!B["1m"].bars.length) return;
  const nxt = ["1m", "15s"].filter((tf) => tf === "1m" || need15).map((tf) => B[tf].bars[B[tf].i + 1]).filter(Boolean).map((b) => b.t);
  if (!nxt.length) { await ensureAhead(); if (!B["1m"].bars[B["1m"].i + 1]) { pause(); toast("End of data"); return false; } return stepFwd(ui); }
  cursorT = Math.min(...nxt);
  const fresh = { "1m": [], "15s": [] };
  for (const tf of ["1m", "15s"]) { const b = B[tf]; while (b.bars[b.i + 1] && b.bars[b.i + 1].t <= cursorT) { b.i++; fresh[tf].push(b.bars[b.i]); } }
  if (ui) panes.forEach((p) => { const src = paneSec(p.i) < 60 ? fresh["15s"] : fresh["1m"]; for (const x of src) p.series.update(pushBar(p, x)); });
  for (const x of fresh["15s"]) engineBar(x);                                   // fills use the finest bars available
  for (const x of fresh["1m"]) if (!(need15 && hasFine(x.t))) engineBar(x);
  if (B["1m"].i % 500 === 0) await ensureAhead(); if (B["1m"].i % 60 === 0 && sess) db.saveCursor(sess.id, cursorT);
  if (!ui) return fresh["1m"];
  if (fresh["1m"].some((x) => ["00:00", "09:30", "10:00", "18:00"].includes(lhm(loc(x.t))))) drawOpens();
  refresh(); repaintAll(); return fresh["1m"];
}
// Skip ahead to the next NY open (09:30) or Asia open (20:00), New York time. Orders and stops still fill on the way.
async function skipTo(hm, name) {
  pause(); if (!B["1m"].bars.length) return toast("Load a chart first"); toast("Skipping to the " + name + "…");
  for (let n = 0; n < 6000; n++) { const got = await stepFwd(false); if (got === false || got === undefined) break; if (n > 0 && got.some((x) => lhm(loc(x.t)) === hm)) break; }
  rebuildAll(); panes.forEach((p) => p.chart.timeScale().scrollToRealTime()); toast("");
}
function hasFine(t) { const b = B["15s"].bars; let lo = 0, hi = b.length - 1; while (lo <= hi) { const m = (lo + hi) >> 1; if (b[m].t < t) lo = m + 1; else if (b[m].t >= t + 60) hi = m - 1; else return true; } return false; }
function stepBack() {
  if (pos.qty || orders.length) return toast("Close positions and cancel orders before stepping back");
  const b = B["1m"]; if (b.i <= 0) return; b.i--; cursorT = b.bars[b.i].t; const f = B["15s"]; while (f.i >= 0 && f.bars[f.i].t > cursorT) f.i--; rebuildAll();
}
function play() { if (timer) return pause(); $("play").textContent = "⏸"; const tick = async () => { await stepFwd(); if (timer) timer = setTimeout(tick, +$("speed").value); }; timer = setTimeout(tick, 0); }
function pause() { clearTimeout(timer); timer = null; $("play").textContent = "▶"; }

/* ---------------- panes (1-8 charts) ---------------- */
let panes = [], active = 0;
function pushBar(p, b) {
  const k = bucket(loc(b.t), p.sec), lc = p.candles[p.candles.length - 1];
  if (lc && lc.time === k) { lc.high = Math.max(lc.high, b.h); lc.low = Math.min(lc.low, b.l); lc.close = b.c; return lc; }
  const c = { time: k, open: b.o, high: b.h, low: b.l, close: b.c }; p.candles.push(c); return c;
}
function makePane(i) {
  const el = document.createElement("div"); el.className = "pane"; el.innerHTML = `<div class="wmark"></div><div class="legend"><span class="lname"></span><i></i><span class="ohlc"></span></div><div class="chart"></div><canvas class="overlay"></canvas>`;
  $("charts").appendChild(el);
  const chart = LightweightCharts.createChart(el.querySelector(".chart"), { layout: { background: { type: "solid", color: "transparent" }, textColor: "#7f8a9c", fontSize: 11, fontFamily: "Geist Mono, ui-monospace, monospace" },
    grid: { vertLines: { color: "rgba(255,255,255,.035)" }, horzLines: { color: "rgba(255,255,255,.035)" } }, rightPriceScale: { borderColor: "rgba(255,255,255,.06)" },
    timeScale: { borderColor: "rgba(255,255,255,.06)", timeVisible: true, secondsVisible: true, rightOffset: 12 }, crosshair: { mode: 1, vertLine: { color: "rgba(255,255,255,.25)", labelBackgroundColor: "#1d2430" }, horzLine: { color: "rgba(255,255,255,.25)", labelBackgroundColor: "#1d2430" } }, autoSize: true });
  const series = chart.addCandlestickSeries({ upColor: prefs.up, downColor: prefs.dn, borderVisible: false, wickUpColor: prefs.up, wickDownColor: prefs.dn, priceFormat: { type: "price", precision: 2, minMove: TICK } });
  const p = { i, el, chart, series, sec: paneSec(i), candles: [], lines: [], opens: [], cv: el.querySelector("canvas.overlay") };
  p.mode = 0; p.auto = true;
  el.addEventListener("pointerdown", () => setActive(i), true);
  chart.timeScale().subscribeVisibleLogicalRangeChange(() => paint(p)); new ResizeObserver(() => paint(p)).observe(el);
  chart.subscribeCrosshairMove((pr) => { if (pr.point) p.hover = { point: pr.point }; const d = pr.seriesData && pr.seriesData.get(series);
    el.querySelector(".ohlc").innerHTML = d ? `O <b>${px2(d.open)}</b> H <b>${px2(d.high)}</b> L <b>${px2(d.low)}</b> C <b class="${d.close >= d.open ? "pos-up" : "pos-dn"}">${px2(d.close)}</b>` : ""; });
  initPointer(p);
  return p;
}
function setActive(i) { active = i; panes.forEach((p) => p.el.classList.toggle("active", p.i === i && panes.length > 1)); tfUI(); scaleUI(); }
function label(p) { const tf = prefs.tfs[p.i] || "5m"; p.el.querySelector(".lname").textContent = `${sym} · ${tf} · CME`; p.el.querySelector(".wmark").textContent = `CME ${sym} ${tf}`; }
function tfUI() { const cur = prefs.tfs[active]; $("tfbar").innerHTML = TFS.filter(([n]) => features.sec15 !== false || !n.endsWith("s")).map(([n]) => `<button class="tf ${n === cur ? "on" : ""}" data-tf="${n}">${n === "1D" ? "D" : n}</button>`).join(""); }
async function setPaneTf(i, tf) { const p = panes[i]; if (!p) return; prefs.tfs[i] = tf; savePrefs(); tfUI(); label(p); if (panes.some((q) => paneSec(q.i) < 60)) await ensure15(); else need15 = false; rebuildPane(p); drawOrders(); drawOpens(); }
function scaleUI() { const p = panes[active]; if (!p) return; $("sc-pct").classList.toggle("on", p.mode === 2); $("sc-log").classList.toggle("on", p.mode === 1); $("sc-auto").classList.toggle("on", p.auto); }
function setScale(k) { const p = panes[active]; if (!p) return; if (k === "auto") p.auto = !p.auto; else { const m = k === "pct" ? 2 : 1; p.mode = p.mode === m ? 0 : m; } p.chart.priceScale("right").applyOptions({ mode: p.mode, autoScale: p.auto }); scaleUI(); paint(p); }
function showRange(days) { const p = panes[active]; if (!p || !p.candles.length) return; const to = p.candles[p.candles.length - 1].time, from = Math.max(p.candles[0].time, to - days * 86400); p.chart.timeScale().setVisibleRange({ from, to: to + p.sec * 6 }); }
function saveShot() { const p = panes[active]; if (!p) return; const c = p.chart.takeScreenshot(), g = c.getContext("2d"); try { g.drawImage(p.cv, 0, 0, c.width, c.height); } catch (e) {}
  const a = document.createElement("a"); a.download = `rewind-${sym}-${prefs.tfs[active]}-${nowT() ? fmt(loc(nowT())).replace(/[: ]/g, "-") : "chart"}.png`; a.href = c.toDataURL("image/png"); a.click(); }
function indMenu() { const r = $("indbtn").getBoundingClientRect(), I = prefs.ind, ck = (v) => (v ? "✓ " : "\u2003 "), flip = (k) => () => { I[k] = !I[k]; savePrefs(); repaintAll(); };
  menu([{ h: "Indicators" }, { t: ck(prefs.opens) + "Key opens (18:00, midnight, 9:30, 10:00)", f: () => { prefs.opens = !prefs.opens; savePrefs(); fillSettings(); drawOpens(); } },
  { t: ck(prefs.sess) + "Shade the NY session", f: () => { prefs.sess = !prefs.sess; savePrefs(); fillSettings(); repaintAll(); } },
  { t: ck(I.sess) + "Session highs / lows (Asia, London, NY AM)", f: flip("sess") }, { t: ck(I.pd) + "Previous day high / low", f: flip("pd") },
  { t: ck(I.fvg) + "Higher-timeframe gaps (FVG)", k: I.fvgTf, f: flip("fvg") }, I.fvg ? { t: "\u2003 Gap timeframe: " + I.fvgTf + " → " + (I.fvgTf === "1h" ? "15m" : I.fvgTf === "15m" ? "4h" : "1h"), f: () => { I.fvgTf = I.fvgTf === "1h" ? "15m" : I.fvgTf === "15m" ? "4h" : "1h"; savePrefs(); repaintAll(); } } : null,
  { t: ck(I.h4) + "4H candle outlines", f: flip("h4") }, { t: ck(I.po3) + "Daily candle (PO3) on the right", f: flip("po3") }], r.left, r.bottom + 6); }
const TOOLNAMES = { cursor: "Cursor", cross: "Crosshair", trend: "Trend line", ray: "Ray", hline: "Horizontal line", hray: "Horizontal ray", vline: "Vertical line", rect: "Rectangle", fib: "Fib", long: "Long position", short: "Short position", measure: "Measure", text: "Text" };
function favUI() {
  const fb = $("favbar"); fb.classList.toggle("hidden", !prefs.favShow); $("favbtn").classList.toggle("on", !!prefs.favShow);
  fb.querySelector(".fbtools").innerHTML = prefs.favs.map((t) => { const src = document.querySelector('#tools [data-tool="' + t + '"]'); return src ? `<button data-tool="${t}" class="tool ${src.className.replace(/\btool\b|\bon\b/g, "").trim()} ${t === tool ? "on" : ""}" title="${src.title}">${src.innerHTML}</button>` : ""; }).join("") || '<span class="tiny muted" style="padding:0 8px">Right-click a tool to add it here</span>';
  if (prefs.favPos) { fb.style.left = Math.min(prefs.favPos.x, innerWidth - 80) + "px"; fb.style.top = Math.min(prefs.favPos.y, innerHeight - 40) + "px"; fb.style.transform = "none"; }
}
function toolsUI() { const t = $("tools"), f = prefs.toolsPos; t.classList.toggle("float", !!f); if (f) { t.style.left = Math.min(f.x, innerWidth - 50) + "px"; t.style.top = Math.min(f.y, innerHeight - 120) + "px"; } else { t.style.left = t.style.top = ""; } panes.forEach(paint); }
function dockH() { const b = document.querySelector("#dock .bbody"); b.style.height = prefs.dockClosed ? "0px" : (prefs.dockH || 150) + "px"; if (prefs.pad.x == null) setTimeout(padUI, 240); }
function grip(el, onMove, onEnd) {   // pointer drag helper
  el.addEventListener("pointerdown", (e) => { if (e.button !== 0) return; e.preventDefault(); el.setPointerCapture(e.pointerId); const st = { x: e.clientX, y: e.clientY };
    const mv = (ev) => onMove(ev, st), up = (ev) => { el.removeEventListener("pointermove", mv); el.removeEventListener("pointerup", up); onEnd && onEnd(ev, st); };
    el.addEventListener("pointermove", mv); el.addEventListener("pointerup", up); });
}
function sideUI() { $("side").classList.toggle("hidden", !prefs.side); $("sidebtn").classList.toggle("on", !!prefs.side); }
function dockUI() { $("dock").classList.toggle("closed", !!prefs.dockClosed); dockH(); }
function buildPanes() {
  panes.forEach((p) => p.chart.remove()); $("charts").innerHTML = ""; panes = [];
  const [c, r] = LAYOUTS[prefs.layout] || [1, 1], n = c * r; $("charts").style.gridTemplateColumns = `repeat(${c},minmax(0,1fr))`; $("charts").style.gridTemplateRows = `repeat(${r},minmax(0,1fr))`;
  while (prefs.tfs.length < 8) prefs.tfs.push(DEF_TFS[prefs.tfs.length]);
  for (let i = 0; i < n; i++) { const p = makePane(i); panes.push(p); label(p); } setActive(Math.min(active, n - 1)); need15 = panes.some((p) => paneSec(p.i) < 60);
}
function rebuildPane(p) {
  p.sec = paneSec(p.i); p.candles = []; const src = p.sec < 60 ? B["15s"] : B["1m"];
  for (let j = 0; j <= src.i && j < src.bars.length; j++) pushBar(p, src.bars[j]);
  p.series.setData(p.candles); label(p); paint(p);
}
function watchScales() {
  for (const p of panes) { if (!p.candles.length) continue; const ref = p.candles[p.candles.length - 1].close, ts = p.chart.timeScale();
    const sig = (p.series.priceToCoordinate(ref) || 0).toFixed(1) + "|" + (p.series.priceToCoordinate(ref + 10) || 0).toFixed(1) + "|" + (ts.logicalToCoordinate(p.candles.length - 1) || 0).toFixed(1) + "|" + ts.width();
    if (sig !== p.sig) { p.sig = sig; paint(p); } }
  requestAnimationFrame(watchScales);
}
function rebuildAll() { panes.forEach(rebuildPane); drawOpens(); drawOrders(); refresh(); }
function setLayout(k) {
  prefs.layout = k; savePrefs(); $("laymenu").classList.add("hidden");
  const had = B["1m"].bars.length; buildPanes(); if (had) (need15 ? ensure15() : Promise.resolve()).then(() => { rebuildAll(); panes.forEach((p) => p.chart.timeScale().scrollToRealTime()); });
}

/* ---------------- coordinates for the canvas layer ---------------- */
function idxOf(p, lt) { const c = p.candles; if (!c.length) return 0; const k = bucket(lt, p.sec); let lo = 0, hi = c.length - 1;
  if (k >= c[hi].time) return hi + (lt - c[hi].time) / p.sec; if (k <= c[0].time) return (lt - c[0].time) / p.sec;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (c[m].time <= k) lo = m; else hi = m - 1; } return lo + (lt - c[lo].time) / p.sec; }
function xOf(p, lt) { const ts = p.chart.timeScale(), l = idxOf(p, lt), k = Math.floor(l), a = ts.logicalToCoordinate(k), b = ts.logicalToCoordinate(k + 1);   // logicalToCoordinate wants whole bar indexes
  if (a == null || b == null) return null; return a + (l - k) * (b - a); }
const yOf = (p, pr) => p.series.priceToCoordinate(pr);
function tOf(p, x) { const l = p.chart.timeScale().coordinateToLogical(x), c = p.candles; if (l == null || !c.length) return null; const n = c.length - 1;
  if (l >= n) return c[n].time + (l - n) * p.sec; if (l <= 0) return c[0].time + l * p.sec; const k = Math.floor(l); return c[k].time + (l - k) * p.sec; }
function pOf(p, y, x) { let pr = p.series.coordinateToPrice(y); if (pr == null) return null;
  if (prefs.magnet && x != null) { const l = Math.round(p.chart.timeScale().coordinateToLogical(x)), c = p.candles[l]; if (c) { const best = [c.open, c.high, c.low, c.close].reduce((a, b) => (Math.abs(yOf(p, b) - y) < Math.abs(yOf(p, a) - y) ? b : a)); if (Math.abs(yOf(p, best) - y) < 14) pr = best; } }
  return rnd(pr); }

/* ---------------- drawings (canvas layer) ---------------- */
let tool = "cursor", drawings = [], pend = null, sel = null, did = 1;
const FIB = [[1, "0"], [0.5, "0.5"], [0.62, "0.62"], [0.705, "0.705"], [0.79, "0.79"], [0, "1"], [-0.27, "-0.27"], [-0.62, "-0.62"]];
const SHARED = ["hline"];   // horizontal lines show on every chart; everything else stays on the chart it was drawn on
function setTool(t) { tool = t; pend = null; document.querySelectorAll("[data-tool]").forEach((b) => b.classList.toggle("on", b.dataset.tool === t)); panes.forEach((p) => { p.el.style.cursor = t === "cursor" ? "" : "crosshair"; p.chart.applyOptions({ crosshair: { mode: t === "cross" ? 0 : 1 } }); paint(p); }); }
function newDrawing(type, p, a, b) {
  const d = { id: did++, type, pane: p.i, a: { ...a }, b: b ? { ...b } : { ...a } };
  if (type === "long" || type === "short") { const s = type === "long" ? 1 : -1; d.b = { t: a.t + p.sec * 30, p: a.p }; d.entry = a.p; d.sl = rnd(a.p - s * prefs.slPts); d.tp = rnd(a.p + s * prefs.tpPts); d.side = s; d.state = "idle"; d.qty = null; }
  if (type === "text") d.text = prompt("Note text") || "Note";
  drawings.push(d); sel = d; return d;
}
/* ---------------- indicators (session highs/lows, previous day, HTF gaps, 4H candles, daily PO3) ---------------- */
let ST = { key: null };
const SESS = [["Asia", "20:00", "24:00", "rgba(255,198,92,.75)"], ["London", "02:00", "05:00", "rgba(122,167,255,.8)"], ["NY AM", "09:30", "11:00", "rgba(94,230,184,.8)"]];
function studies() {
  const b1 = B["1m"], key = b1.i + ":" + JSON.stringify(prefs.ind); if (ST.key === key) return ST; const bars = b1.bars, i = b1.i, out = { key, levels: [], gaps: [], h4: [], po3: null }; ST = out; if (i < 0) return out;
  const I = prefs.ind, t = bars[i].t, today = sessDay(t), hm = (x) => lhm(loc(x.t));
  let j = i; const lim = Math.max(0, i - 15 * 1440); const days = {};
  for (let k = i; k >= lim; k--) { const d = sessDay(bars[k].t); (days[d] = days[d] || []).push(bars[k]); if (Object.keys(days).length > 3) { delete days[d]; break; } }
  const order = Object.keys(days).sort(), prev = order[order.length - 2], cur = days[today] || [];
  if (I.sess) for (const [nm, a, z, col] of SESS) { for (const dd of [today, prev]) { const xs = (days[dd] || []).filter((x) => { const h = hm(x); return z === "24:00" ? h >= a : h >= a && h < z; }); if (!xs.length) continue;
      const hi = xs.reduce((m, x) => (x.h > m.h ? x : m)), lo = xs.reduce((m, x) => (x.l < m.l ? x : m)), tag = dd === today ? "" : " (prev)";
      out.levels.push({ price: hi.h, t0: loc(hi.t), label: nm + " H" + tag, col }, { price: lo.l, t0: loc(lo.t), label: nm + " L" + tag, col }); if (dd === today) break; } }
  if (I.pd && prev) { const rth = (days[prev] || []).filter((x) => hm(x) >= "09:30" && hm(x) < "16:00"); if (rth.length) { const hi = rth.reduce((m, x) => (x.h > m.h ? x : m)), lo = rth.reduce((m, x) => (x.l < m.l ? x : m));
      out.levels.push({ price: hi.h, t0: loc(hi.t), label: "PDH", col: "rgba(230,234,240,.7)" }, { price: lo.l, t0: loc(lo.t), label: "PDL", col: "rgba(230,234,240,.7)" }); } }
  if (I.fvg) { const sec = SEC[I.fvgTf] || 3600, cs = []; for (let k = Math.max(0, i - 10 * 1440); k <= i; k++) { const x = bars[k], bt = bucket(loc(x.t), sec), c = cs[cs.length - 1];
      if (c && c.t === bt) { c.h = Math.max(c.h, x.h); c.l = Math.min(c.l, x.l); c.c = x.c; } else cs.push({ t: bt, o: x.o, h: x.h, l: x.l, c: x.c }); }
    const done = cs.slice(0, -1);   // only finished candles make gaps
    for (let k = 2; k < done.length; k++) { const a = done[k - 2], c = done[k]; let g = null;
      if (c.l > a.h) g = { top: c.l, bot: a.h, dir: 1 }; else if (c.h < a.l) g = { top: a.l, bot: c.h, dir: -1 }; if (!g) continue;
      let alive = true; for (let m = k + 1; m < cs.length; m++) { if (g.dir > 0 ? cs[m].l <= g.bot : cs[m].h >= g.top) { alive = false; break; } }
      if (alive) out.gaps.push({ ...g, t0: done[k - 1].t, label: I.fvgTf + " FVG" }); }
    const lp = bars[i].c; out.gaps.sort((a, b) => Math.abs((a.top + a.bot) / 2 - lp) - Math.abs((b.top + b.bot) / 2 - lp)); out.gaps = out.gaps.slice(0, 5); }
  if (I.h4) { const cs = []; for (let k = Math.max(0, i - 3 * 1440); k <= i; k++) { const x = bars[k], bt = bucket(loc(x.t), 14400), c = cs[cs.length - 1];
      if (c && c.t === bt) { c.h = Math.max(c.h, x.h); c.l = Math.min(c.l, x.l); c.c = x.c; } else cs.push({ t: bt, o: x.o, h: x.h, l: x.l, c: x.c }); } out.h4 = cs.slice(-8); }
  if (I.po3 && cur.length) { const xs = cur.slice().reverse(); out.po3 = { o: xs[0].o, h: Math.max(...xs.map((x) => x.h)), l: Math.min(...xs.map((x) => x.l)), c: bars[i].c }; }
  return out;
}
function paintStudies(p, g, W, H) {
  if (!prefs.ind || p.sec >= 86400 || !p.candles.length) return; const S = studies(), ts = p.chart.timeScale();
  const X = (lt) => { const x = xOf(p, lt); return x == null ? 0 : Math.max(0, x); };
  g.save(); g.font = "500 10px Geist Mono, monospace";
  for (const z of S.h4) { if (p.sec >= 14400) break; const x1 = X(z.t), x2 = Math.min(W, X(z.t + 14400) || W), y1 = yOf(p, z.h), y2 = yOf(p, z.l); if (y1 == null || y2 == null || x2 <= x1) continue;
    g.strokeStyle = z.c >= z.o ? "rgba(43,212,160,.35)" : "rgba(255,107,122,.35)"; g.lineWidth = 1; g.setLineDash([]); g.strokeRect(x1, y1, x2 - x1, y2 - y1);
    const yo = yOf(p, z.o), yc = yOf(p, z.c); if (yo != null && yc != null) { g.fillStyle = z.c >= z.o ? "rgba(43,212,160,.06)" : "rgba(255,107,122,.06)"; g.fillRect(x1, Math.min(yo, yc), x2 - x1, Math.abs(yo - yc)); } }
  for (const z of S.gaps) { const y1 = yOf(p, z.top), y2 = yOf(p, z.bot); if (y1 == null || y2 == null) continue; const x1 = X(z.t0);
    g.fillStyle = z.dir > 0 ? "rgba(43,212,160,.09)" : "rgba(255,107,122,.09)"; g.fillRect(x1, y1, W - x1, y2 - y1); g.fillStyle = "rgba(200,210,225,.55)"; g.fillText(z.label, x1 + 4, Math.min(y1, y2) + 11); }
  for (const l of S.levels) { const y = yOf(p, l.price); if (y == null || y < 0 || y > H) continue; const x1 = X(l.t0);
    g.strokeStyle = l.col; g.lineWidth = 1; g.setLineDash([5, 4]); g.beginPath(); g.moveTo(x1, y); g.lineTo(W, y); g.stroke(); g.setLineDash([]); g.fillStyle = l.col; g.fillText(l.label, W - g.measureText(l.label).width - 6, y - 4); }
  if (S.po3) { const P = S.po3, x = W - 26, yh = yOf(p, P.h), yl = yOf(p, P.l), yo = yOf(p, P.o), yc = yOf(p, P.c); if ([yh, yl, yo, yc].every((v) => v != null)) {
      const up = P.c >= P.o; g.strokeStyle = up ? "rgba(43,212,160,.8)" : "rgba(255,107,122,.8)"; g.fillStyle = up ? "rgba(43,212,160,.22)" : "rgba(255,107,122,.22)";
      g.beginPath(); g.moveTo(x, yh); g.lineTo(x, yl); g.stroke(); g.fillRect(x - 7, Math.min(yo, yc), 14, Math.max(1, Math.abs(yo - yc))); g.strokeRect(x - 7, Math.min(yo, yc), 14, Math.max(1, Math.abs(yo - yc)));
      g.fillStyle = "rgba(200,210,225,.6)"; g.fillText("D", x - 3, yh - 5); } }
  g.restore();
}
function paint(p) {
  if (!p) return; cancelAnimationFrame(p.raf); p.raf = requestAnimationFrame(() => {
    const cv = p.cv, r = p.el.getBoundingClientRect(), dpr = devicePixelRatio || 1; if (cv.width !== Math.round(r.width * dpr) || cv.height !== Math.round(r.height * dpr)) { cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr); }
    const g = cv.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, r.width, r.height); const W = r.width - 64;
    if (prefs.sess && p.sec < 14400 && p.candles.length) {
      const ts = p.chart.timeScale(), vr = ts.getVisibleLogicalRange(); if (vr) { let s0 = null; const from = Math.max(0, Math.floor(vr.from)), to = Math.min(p.candles.length - 1, Math.ceil(vr.to));
        g.fillStyle = "rgba(122,167,255,.04)";
        for (let k = from; k <= to + 1; k++) { const c = p.candles[k], inS = c && lhm(c.time) >= "09:30" && lhm(c.time) < "16:00";
          if (inS && s0 == null) s0 = k; if ((!inS || k === to + 1) && s0 != null) { const x1 = ts.logicalToCoordinate(s0) - 0.5 * (ts.logicalToCoordinate(s0 + 1) - ts.logicalToCoordinate(s0)), x2 = ts.logicalToCoordinate(k) - 0.5 * (ts.logicalToCoordinate(k + 1) - ts.logicalToCoordinate(k)); if (x1 != null && x2 != null) g.fillRect(x1, 0, x2 - x1, r.height); s0 = null; } } } }
    try { paintStudies(p, g, W, r.height); } catch (e) {}
    const all = drawings.filter((d) => d.pane === p.i || SHARED.includes(d.type));
    if (pend && pend.pane === p.i && pend.b) all.push({ ...pend.d, b: pend.b, preview: true });
    for (const d of all) { try { drawOne(p, g, d, W, r.height); } catch (e) {} }
  });
}
function drawOne(p, g, d, W, H) {
  const on = sel && sel.id === d.id; g.lineWidth = on ? 2 : 1.4; g.font = "11px Geist Mono, monospace"; g.setLineDash([]);
  const gold = "rgba(255,206,120,.9)", blue = "rgba(122,167,255,.95)"; g.strokeStyle = gold; g.fillStyle = gold;
  const x1 = xOf(p, d.a.t), y1 = yOf(p, d.a.p), x2 = xOf(p, d.b.t), y2 = yOf(p, d.b.p); if (y1 == null) return;
  const dot = (x, y) => { if (on && x != null && y != null) { g.beginPath(); g.arc(x, y, 4.5, 0, 7); g.fillStyle = "#0c1016"; g.fill(); g.strokeStyle = "#fff"; g.lineWidth = 1.5; g.stroke(); g.strokeStyle = gold; g.fillStyle = gold; } };
  if (d.type === "measure") { if (x1 == null || x2 == null || y2 == null) return; const up = d.b.p >= d.a.p; g.fillStyle = up ? "rgba(43,212,160,.13)" : "rgba(255,107,122,.13)";
    g.fillRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1)); const pts = d.b.p - d.a.p, bars = Math.round((d.b.t - d.a.t) / p.sec);
    g.fillStyle = "#e6eaf0"; g.fillText(`${pts >= 0 ? "+" : ""}${pts.toFixed(2)} pts · ${money(Math.abs(pts) * inst.pt)}/lot · ${(Math.abs(pts) / (prefs.slPts || 1)).toFixed(2)}R · ${bars} bars`, Math.min(x1, x2) + 4, Math.min(y1, y2) - 6); return; }
  if (d.type === "trend" || d.type === "ray") { if (x1 == null || x2 == null || y2 == null) return; let ex = x2, ey = y2;
    if (d.type === "ray" && x2 !== x1) { const k = ((x2 > x1 ? W : 0) - x1) / (x2 - x1); if (k > 1) { ex = x1 + (x2 - x1) * k; ey = y1 + (y2 - y1) * k; } }
    g.beginPath(); g.moveTo(x1, y1); g.lineTo(ex, ey); g.stroke(); dot(x1, y1); dot(x2, y2); return; }
  if (d.type === "hline") { g.beginPath(); g.moveTo(0, y1); g.lineTo(W, y1); g.stroke(); g.fillText(px2(d.a.p), W - 60, y1 - 4); return; }
  if (d.type === "hray") { if (x1 == null) return; g.beginPath(); g.moveTo(x1, y1); g.lineTo(W, y1); g.stroke(); dot(x1, y1); return; }
  if (d.type === "vline") { if (x1 == null) return; g.beginPath(); g.moveTo(x1, 0); g.lineTo(x1, H); g.stroke(); return; }
  if (d.type === "text") { if (x1 == null) return; g.font = "600 12px Geist, sans-serif"; g.fillStyle = "#e6eaf0"; g.fillText(d.text, x1, y1); return; }
  if (d.type === "rect") { if (x1 == null || x2 == null || y2 == null) return; g.fillStyle = "rgba(122,167,255,.10)"; g.strokeStyle = blue;
    g.fillRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1)); g.strokeRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1)); dot(x1, y1); dot(x2, y2); return; }
  if (d.type === "fib") { if (y2 == null) return; const xa = Math.min(x1 ?? 0, x2 ?? W);
    for (const [f, lab] of FIB) { const pr = d.b.p + (d.a.p - d.b.p) * f, y = yOf(p, pr); if (y == null) continue;
      g.strokeStyle = [0.79, 0.62, 0.705].includes(f) ? blue : f === 0.5 ? "rgba(255,255,255,.6)" : "rgba(255,206,120,.55)"; g.setLineDash(f === 0 || f === 1 ? [] : [4, 4]);
      g.beginPath(); g.moveTo(xa, y); g.lineTo(W, y); g.stroke(); g.setLineDash([]); g.fillStyle = g.strokeStyle; g.fillText(`${lab}  ${px2(pr)}`, xa + 4, y - 3); }
    g.strokeStyle = gold; dot(x1, y1); dot(x2, y2); return; }
  if (d.type === "long" || d.type === "short") {
    const xa = x1 ?? 0, xb = x2 ?? W, ye = yOf(p, d.entry), ys = yOf(p, d.sl), yt = yOf(p, d.tp); if (ye == null || ys == null || yt == null) return;
    const live = d.state === "armed" || d.state === "filled", done = d.state === "done";
    g.fillStyle = `rgba(43,212,160,${done ? 0.06 : live ? 0.22 : 0.14})`; g.fillRect(xa, Math.min(ye, yt), xb - xa, Math.abs(yt - ye));
    g.fillStyle = `rgba(255,107,122,${done ? 0.06 : live ? 0.22 : 0.14})`; g.fillRect(xa, Math.min(ye, ys), xb - xa, Math.abs(ys - ye));
    g.strokeStyle = live ? "#fff" : "rgba(255,255,255,.6)"; g.setLineDash(d.state === "armed" ? [6, 4] : []); g.beginPath(); g.moveTo(xa, ye); g.lineTo(xb, ye); g.stroke(); g.setLineDash([]);
    const risk = Math.abs(d.entry - d.sl), q = posQty(d), rr = Math.abs(d.tp - d.entry) / (risk || 1);
    const tag = d.state === "armed" ? "ARMED · auto-entry" : d.state === "filled" ? "IN TRADE" : d.state === "done" ? "DONE" : "right-click → Arm";
    const label = `${d.side > 0 ? "LONG" : "SHORT"} ${q} @ ${px2(d.entry)} · ${rr.toFixed(2)}R · risk ${money(risk * q * inst.pt)} · ${tag}`;
    g.font = "600 11px Geist Mono, monospace"; const tw = g.measureText(label).width; g.fillStyle = "rgba(12,16,22,.85)"; g.fillRect(xa + 4, ye - 20, tw + 12, 16); g.fillStyle = "#e6eaf0"; g.fillText(label, xa + 10, ye - 8);
    g.fillStyle = "#7fffd0"; g.fillText(`TP ${px2(d.tp)}  +${money(Math.abs(d.tp - d.entry) * q * inst.pt)}`, xa + 8, yt + (d.side > 0 ? 14 : -6));
    g.fillStyle = "#ffb1b9"; g.fillText(`SL ${px2(d.sl)}  -${money(risk * q * inst.pt)}`, xa + 8, ys + (d.side > 0 ? -6 : 14));
    if (on) [[xb, ye], [xb, ys], [xb, yt], [xa, ye]].forEach(([x, y]) => dot(x, y));
  }
}
function posQty(d) { if (d.qty) return d.qty; const risk = Math.abs(d.entry - d.sl) || 1; if (prefs.byRisk) return Math.max(1, Math.floor((balance() * prefs.riskp / 100) / (risk * inst.pt))); return lotsNow(); }
function hitDrawing(p, x, y) {
  const near = (ax, ay, bx, by) => { if (ax == null || bx == null || ay == null || by == null) return 1e9; const l2 = (bx - ax) ** 2 + (by - ay) ** 2; let t = l2 ? ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / l2 : 0; t = Math.max(0, Math.min(1, t)); return Math.hypot(x - (ax + t * (bx - ax)), y - (ay + t * (by - ay))); };
  for (const d of drawings.slice().reverse()) {
    if (!(d.pane === p.i || SHARED.includes(d.type))) continue; const x1 = xOf(p, d.a.t), y1 = yOf(p, d.a.p), x2 = xOf(p, d.b.t), y2 = yOf(p, d.b.p);
    if (d.type === "long" || d.type === "short") { const ye = yOf(p, d.entry), ys = yOf(p, d.sl), yt = yOf(p, d.tp), xa = x1 ?? 0, xb = x2 ?? 9999;
      if (x >= xa - 6 && x <= xb + 8) { if (Math.abs(y - ys) < 7) return { d, h: "sl" }; if (Math.abs(y - yt) < 7) return { d, h: "tp" }; if (Math.abs(y - ye) < 7) return { d, h: Math.abs(x - xb) < 10 ? "w" : "entry" };
        if (y > Math.min(ys, yt) && y < Math.max(ys, yt)) return { d, h: "move" }; } continue; }
    if (d.type === "hline") { if (Math.abs(y - y1) < 6) return { d, h: "a" }; continue; }
    if (d.type === "vline") { if (x1 != null && Math.abs(x - x1) < 6) return { d, h: "a" }; continue; }
    if (x1 != null && Math.hypot(x - x1, y - y1) < 8) return { d, h: "a" }; if (x2 != null && y2 != null && Math.hypot(x - x2, y - y2) < 8) return { d, h: "b" };
    if (["trend", "ray"].includes(d.type) && near(x1, y1, x2, y2) < 6) return { d, h: "move" };
    if (d.type === "hray" && x1 != null && Math.abs(y - y1) < 6 && x >= x1) return { d, h: "move" };
    if ((d.type === "rect" || d.type === "measure") && x1 != null && x2 != null && x >= Math.min(x1, x2) && x <= Math.max(x1, x2) && y >= Math.min(y1, y2) && y <= Math.max(y1, y2)) return { d, h: "move" };
    if (d.type === "fib" && y2 != null) for (const [f] of FIB) { const yy = yOf(p, d.b.p + (d.a.p - d.b.p) * f); if (yy != null && Math.abs(y - yy) < 5 && x >= Math.min(x1 ?? 0, x2 ?? 0)) return { d, h: "move" }; }
    if (d.type === "text" && x1 != null && x >= x1 - 4 && x <= x1 + 140 && Math.abs(y - y1 + 4) < 10) return { d, h: "move" };
  }
  return null;
}
function hitLine(p, y) { for (const l of p.lines) { if (l.kind === "pos") continue; const ly = yOf(p, l.price); if (ly != null && Math.abs(ly - y) < 7) return l; } return null; }
function initPointer(p) {
  let drag = null;
  const pt = (e) => { const r = p.el.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const hold = (on) => p.chart.applyOptions({ handleScroll: !on, handleScale: !on });
  p.el.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || e.target.closest(".ptitle")) return; const { x, y } = pt(e); hideCtx();
    if (tool !== "cursor" && tool !== "cross") {
      const a = { t: tOf(p, x), p: pOf(p, y, x) }; if (a.t == null || a.p == null) return;
      if (["hline", "vline", "hray", "text", "long", "short"].includes(tool)) { newDrawing(tool, p, a); if (!e.shiftKey) setTool("cursor"); repaintAll(); e.stopPropagation(); e.preventDefault(); return; }
      pend = { pane: p.i, d: { id: 0, type: tool, pane: p.i, a }, b: a }; hold(true); p.el.setPointerCapture(e.pointerId); e.stopPropagation(); e.preventDefault(); return;
    }
    const l = hitLine(p, y); if (l) { drag = { kind: "line", l }; hold(true); p.el.setPointerCapture(e.pointerId); e.stopPropagation(); e.preventDefault(); return; }
    const h = hitDrawing(p, x, y); if (h) { sel = h.d; drag = { kind: "draw", h, a0: { t: tOf(p, x), p: pOf(p, y) }, snap: JSON.parse(JSON.stringify(h.d)) }; hold(true); p.el.setPointerCapture(e.pointerId); repaintAll(); e.stopPropagation(); e.preventDefault(); return; }
    if (sel) { sel = null; repaintAll(); }
  }, true);
  p.el.addEventListener("pointermove", (e) => {
    const { x, y } = pt(e);
    if (pend && pend.pane === p.i) { const t = tOf(p, x), pr = pOf(p, y, x); if (t != null && pr != null) pend.b = { t, p: pr }; paint(p); return; }
    if (!drag) { if (tool === "cursor") { const l = hitLine(p, y), h = !l && hitDrawing(p, x, y); p.el.style.cursor = l ? "ns-resize" : h ? (h.h === "move" ? "move" : h.h === "w" ? "ew-resize" : "pointer") : ""; } return; }
    const pr = pOf(p, y, x), tt = tOf(p, x); if (pr == null || tt == null) return;
    if (drag.kind === "line") { const l = drag.l; l.price = pr; l.ref.applyOptions({ price: pr }); if (l.kind === "sl") pos.sl = pr; else if (l.kind === "tp") pos.tp = pr; else if (l.obj) l.obj.price = pr; if (l.kind === "draft") $("o-px").value = pr; return; }
    const { h, snap, a0 } = drag, d = h.d, dp = pr - a0.p, dt = tt - a0.t;
    if (d.type === "long" || d.type === "short") {
      if (h.h === "sl") d.sl = pr; else if (h.h === "tp") d.tp = pr; else if (h.h === "entry") d.entry = pr; else if (h.h === "w") d.b.t = Math.max(d.a.t + p.sec, tt);
      else { d.entry = rnd(snap.entry + dp); d.sl = rnd(snap.sl + dp); d.tp = rnd(snap.tp + dp); d.a.t = snap.a.t + dt; d.b.t = snap.b.t + dt; }
      syncTool(d);
    } else if (h.h === "a") d.a = { t: tt, p: pr }; else if (h.h === "b") d.b = { t: tt, p: pr };
    else { d.a = { t: snap.a.t + dt, p: rnd(snap.a.p + dp) }; d.b = { t: snap.b.t + dt, p: rnd(snap.b.p + dp) }; }
    repaintAll();
  });
  const up = (e) => {
    if (pend && pend.pane === p.i) { const d = pend.d, b = pend.b; pend = null; hold(false);
      if (b && (b.p !== d.a.p || Math.abs(b.t - d.a.t) >= p.sec)) { const n = newDrawing(d.type, p, d.a, b); if (n.type === "measure") setTimeout(() => { drawings = drawings.filter((z) => z !== n); repaintAll(); }, 8000); }
      if (!e.shiftKey) setTool("cursor"); repaintAll(); return; }
    if (!drag) return; hold(false);
    if (drag.kind === "line") { const l = drag.l; if (l.kind === "sl" && pos.qty) pos.risk = Math.abs(pos.avg - pos.sl) || pos.risk; if (l.kind === "ord" && l.obj.tool) { const d = drawings.find((z) => z.id === l.obj.tool); if (d) d.entry = l.obj.price; } drawOrders(); refresh(); }
    drag = null; repaintAll();
  };
  p.el.addEventListener("pointerup", up); p.el.addEventListener("pointercancel", up);
  p.el.addEventListener("contextmenu", (e) => { e.preventDefault(); const { x, y } = pt(e); setActive(p.i); chartMenu(p, x, y, e.clientX, e.clientY); });
}
function repaintAll() { panes.forEach(paint); }

/* ---------------- order engine ---------------- */
let hist = [], lock = null;     // lock = {why, until (replay epoch, or Infinity)}
const flat = () => ({ qty: 0, avg: 0, sl: null, tp: null, t: 0, risk: 0, trail: 0, hi: 0, tool: null, tags: [] });
let pos = flat(), orders = [], oid = 1, draft = null;
const fee = (q) => Math.abs(q) * (inst.micro ? prefs.mfee : prefs.fee);
const balance = () => (sess ? +sess.account_start : prefs.bal) + hist.reduce((s, t) => s + (+t.pnl || 0), 0);
const openPnl = () => (pos.qty && last() != null ? (last() - pos.avg) * pos.qty * inst.pt : 0);
const dayRpl = () => { const d = sessDay(nowT()); return hist.filter((t) => sessDay(t.t_exit) === d).reduce((s, t) => s + (+t.pnl || 0), 0); };
function lockedNow() { if (!lock) return false; if (nowT() >= lock.until) { lock = null; return false; } return true; }
function guard() {
  if (features.prop_rules === false || lockedNow() || !nowT()) return; const dp = dayRpl() + openPnl();
  let peak = sess ? +sess.account_start : prefs.bal, run = peak; for (const t of hist) { run += +t.pnl || 0; peak = Math.max(peak, run); }
  const hit = (why) => { const blk = prefs.act === "block" || why.startsWith("Max"); lock = { why, until: blk ? (why.startsWith("Max") ? Infinity : endOfTradingDay(nowT())) : nowT() + 1 }; if (pos.qty) closeAll(why); orders = []; drawOrders(); if (!blk) lock = null; toast("🔒 " + why); refresh(); };
  if (prefs.dll && dp <= -prefs.dll) hit("Personal daily loss limit hit"); else if (prefs.ptg && dp >= prefs.ptg) hit("Personal daily profit target reached");
  else if (prefs.mdd && peak - (balance() + openPnl()) >= prefs.mdd) hit("Max drawdown hit");
}
function canTrade() { if (lockedNow()) { toast("🔒 " + lock.why); return false; } if (last() == null) { toast("Load a chart first"); return false; } return true; }
const lotsNow = () => Math.max(1, +prefs.lots || 1);
const autoBr = () => (prefs.autoBr ? { slPts: prefs.slPts, tpPts: prefs.tpPts } : null);
function market(side, qty) { if (!canTrade()) return; qty = qty || (prefs.byRisk ? Math.max(1, Math.floor((balance() * prefs.riskp / 100) / (prefs.slPts * inst.pt))) : lotsNow()); fill(side, qty, last(), nowT(), autoBr()); }
function joinBid() { if (canTrade()) place(1, "limit", last() - TICK, lotsNow(), autoBr()); }
function joinAsk() { if (canTrade()) place(-1, "limit", last() + TICK, lotsNow(), autoBr()); }
function place(side, type, price, qty, br, extra = {}) { if (!canTrade()) return; const o = { id: oid++, side, type, price: rnd(price), qty, br, ...extra }; orders.push(o); drawOrders(); refresh(); return o; }
function fill(side, qty, price, t, br, toolId) {
  if (!pos.qty || Math.sign(pos.qty) === side) { sfx("fill"); buzz(25); }
  if (!pos.qty || Math.sign(pos.qty) === side) {
    const nq = pos.qty + side * qty; pos.avg = pos.qty ? (pos.avg * Math.abs(pos.qty) + price * qty) / Math.abs(nq) : price; if (!pos.qty) { pos.t = t; pos.hi = price; } pos.qty = nq;
    if (br) { if (br.slPx != null) pos.sl = br.slPx; else if (br.slPts) pos.sl = rnd(pos.avg - side * br.slPts); if (br.tpPx != null) pos.tp = br.tpPx; else if (br.tpPts) pos.tp = rnd(pos.avg + side * br.tpPts); }
    pos.trail = (br && br.trail) || prefs.trail || 0; pos.risk = pos.sl != null ? Math.abs(pos.avg - pos.sl) : pos.risk || 0; if (toolId) { pos.tool = toolId; const td = drawings.find((z) => z.id === toolId); if (td && td.tags) pos.tags = td.tags.slice(); }
  } else { const cq = Math.min(Math.abs(pos.qty), qty); record(cq, price, t, "manual"); const rest = qty - cq; if (rest > 0) fill(side, rest, price, t, br, toolId); }
  drawOrders(); refresh(); repaintAll();
}
function record(cq, price, t, outcome) {
  const side = Math.sign(pos.qty), pnl = (price - pos.avg) * side * cq * inst.pt - fee(cq), r = pos.risk ? ((price - pos.avg) * side) / pos.risk : null;
  const row = { session_id: sess && sess.id, ...(acct ? { account_id: acct.id } : {}), tags: pos.tags || [], symbol: sym, dir: side, qty: cq, entry: +pos.avg.toFixed(2), stop: pos.sl, target: pos.tp, exit: price, t_entry: pos.t, t_exit: t, outcome, r: r == null ? null : +r.toFixed(2), pnl: +pnl.toFixed(2), fees: fee(cq) };
  hist.push(row); pos.qty -= side * cq; sfx(outcome === "win" || pnl > 0 ? "win" : "loss"); buzz(pnl > 0 ? [20, 40, 20] : 60);
  if (!pos.qty) { const tl = drawings.find((d) => d.id === pos.tool); if (tl) tl.state = "done"; pos = flat(); repaintAll(); }
  db.addTrade(row).then((d) => { Object.assign(row, d); shot(d.id); if (notionAuto) notion("sync", { ids: [d.id] }).catch(() => {}); }).catch((e) => toast("Trade not saved: " + e.message));
  guard();
}
function engineBar(b) {
  for (const o of orders.slice()) {
    const st = o.type === "stop" || o.type === "stoplimit", hit = !st ? (o.side > 0 ? b.l <= o.price : b.h >= o.price) : (o.side > 0 ? b.h >= o.price : b.l <= o.price); if (!hit) continue;
    const fp = !st ? (o.side > 0 ? Math.min(o.price, b.o) : Math.max(o.price, b.o)) : o.type === "stoplimit" ? o.price : (o.side > 0 ? Math.max(o.price, b.o) : Math.min(o.price, b.o));
    orders = orders.filter((x) => x !== o); if (lockedNow()) continue;
    if (o.tool) { const d = drawings.find((z) => z.id === o.tool); if (d) d.state = "filled"; }
    fill(o.side, o.qty, fp, b.t, o.br, o.tool);
  }
  if (pos.qty && b.t > pos.t) {
    const d = Math.sign(pos.qty);
    if (pos.trail && pos.sl != null) { pos.hi = d > 0 ? Math.max(pos.hi, b.h) : Math.min(pos.hi || b.l, b.l); const ns = rnd(pos.hi - d * pos.trail); if (d > 0 ? ns > pos.sl : ns < pos.sl) pos.sl = ns; }
    const hs = pos.sl != null && (d > 0 ? b.l <= pos.sl : b.h >= pos.sl), ht = pos.tp != null && (d > 0 ? b.h >= pos.tp : b.l <= pos.tp);
    if (hs) { const gp = d > 0 ? b.o < pos.sl : b.o > pos.sl; record(Math.abs(pos.qty), gp ? b.o : pos.sl, b.t, Math.abs(pos.sl - pos.avg) < 1e-9 ? "be" : (pos.sl - pos.avg) * d > 0 ? "trail" : "loss"); }
    else if (ht) record(Math.abs(pos.qty), pos.tp, b.t, "win");
  }
  guard(); drawOrders();
}
function closeAll(why) { if (pos.qty) record(Math.abs(pos.qty), last(), nowT(), why ? "rule" : "manual"); drawOrders(); refresh(); }
function reverse() { if (!pos.qty || !canTrade()) return; const q = Math.abs(pos.qty), s = -Math.sign(pos.qty); closeAll(); fill(s, q, last(), nowT(), autoBr()); }
function toBE() { if (pos.qty) { pos.sl = rnd(pos.avg); drawOrders(); refresh(); } }
function cancelAll() { orders.forEach((o) => { const d = drawings.find((z) => z.id === o.tool); if (d && d.state === "armed") d.state = "idle"; }); orders = []; draft = null; drawOrders(); refresh(); repaintAll(); }
function flatten() { cancelAll(); closeAll(); }
async function shot(id) {
  if (DEMO || features.journal === false) return;
  try { const cv = panes[active].chart.takeScreenshot(); const blob = await new Promise((r) => cv.toBlob(r, "image/png")); const path = `${user.id}/${id}.png`;
    const up = await sb.storage.from("shots").upload(path, blob, { contentType: "image/png", upsert: true }); if (!up.error) await sb.from("trades").update({ shots: [path] }).eq("id", id); } catch (e) {}
}
/* position tool → working order (FX Replay-style auto-entry) */
function armTool(d) {
  if (!canTrade()) return; const lp = last(), s = d.side, q = posQty(d);
  if ((d.sl - d.entry) * s >= 0 || (d.tp - d.entry) * s <= 0) return toast("For a long the stop goes below entry and the target above it. A short is the reverse.");
  const br = { slPx: d.sl, tpPx: d.tp }; d.qty = q;
  if (Math.abs(d.entry - lp) < TICK / 2) { d.state = "filled"; fill(s, q, lp, nowT(), br, d.id); }
  else { const type = (s > 0 ? d.entry < lp : d.entry > lp) ? "limit" : "stop"; place(s, type, d.entry, q, br, { tool: d.id }); d.state = "armed"; }
  repaintAll(); toast(d.state === "armed" ? `Armed: ${s > 0 ? "buy" : "sell"} ${q} @ ${px2(d.entry)}, stop ${px2(d.sl)}, target ${px2(d.tp)}. It fills on its own.` : "Filled");
}
function disarmTool(d) { orders = orders.filter((o) => o.tool !== d.id); if (d.state === "armed") d.state = "idle"; drawOrders(); refresh(); repaintAll(); }
function syncTool(d) {
  const o = orders.find((x) => x.tool === d.id); if (o) { o.price = d.entry; o.br = { slPx: d.sl, tpPx: d.tp }; drawOrders(); }
  if (d.state === "filled" && pos.tool === d.id) { pos.sl = d.sl; pos.tp = d.tp; pos.risk = Math.abs(pos.avg - pos.sl); drawOrders(); refresh(); }
}

/* ---------------- price lines (orders, position, draft) on every pane ---------------- */
function drawOrders() {
  for (const p of panes) {
    p.lines.forEach((l) => p.series.removePriceLine(l.ref)); p.lines = [];
    const L = (price, color, title, kind, obj, style = 2) => p.lines.push({ ref: p.series.createPriceLine({ price, color, lineWidth: 2, lineStyle: style, title, axisLabelVisible: true }), kind, price, obj });
    if (pos.qty) { L(pos.avg, "#c9d2df", `${pos.qty > 0 ? "LONG" : "SHORT"} ${Math.abs(pos.qty)}  ${money(openPnl())}`, "pos", null, 0);
      if (pos.sl != null) L(pos.sl, "#ff6b7a", (pos.trail ? "TRAIL " : "SL ") + money((pos.sl - pos.avg) * pos.qty * inst.pt), "sl");
      if (pos.tp != null) L(pos.tp, "#2bd4a0", "TP " + money((pos.tp - pos.avg) * pos.qty * inst.pt), "tp"); }
    for (const o of orders) L(o.price, "#7aa7ff", `${o.side > 0 ? "BUY" : "SELL"} ${o.type.toUpperCase()} ${o.qty}${o.tool ? " · auto" : ""}`, "ord", o);
    if (draft) L(draft.price, "#ffc65c", `DRAFT ${draft.side > 0 ? "BUY" : "SELL"} ${draft.type.toUpperCase()} · drag, then Submit`, "draft", draft);
  }
}
function drawOpens() {
  for (const p of panes) {
    p.opens.forEach((l) => p.series.removePriceLine(l)); p.opens = []; if (!prefs.opens || !nowT()) continue;
    const day = sessDay(nowT()), marks = { "18:00": "18:00", "00:00": "Midnight", "09:30": "9:30", "10:00": "10AM" }, b1 = B["1m"];
    for (let i = b1.i; i >= 0 && i > b1.i - 1500; i--) { const b = b1.bars[i]; if (sessDay(b.t) !== day) break; const k = lhm(loc(b.t)); if (marks[k]) { p.opens.push(p.series.createPriceLine({ price: b.o, color: "rgba(140,155,180,.55)", lineWidth: 1, lineStyle: 1, axisLabelVisible: false, title: marks[k] })); delete marks[k]; } }
  }
}

/* ---------------- context menus + dialogs ---------------- */
function menu(items, cx, cy) {
  items = items.filter(Boolean); const m = $("ctx");
  m.innerHTML = items.map((it, i) => it === "-" ? '<div class="sepm"></div>' : it.h ? `<div class="mh">${it.h}</div>` : `<button class="mi ${it.c || ""}" data-i="${i}">${it.t}${it.k ? `<span>${it.k}</span>` : ""}</button>`).join("");
  m.classList.remove("hidden"); m.style.left = "0px"; m.style.top = "0px"; const r = m.getBoundingClientRect(); m.style.left = Math.min(cx, innerWidth - r.width - 8) + "px"; m.style.top = Math.min(cy, innerHeight - r.height - 8) + "px";
  m.onclick = (e) => { const b = e.target.closest(".mi"); if (!b) return; hideCtx(); items[+b.dataset.i].f(); };
}
const hideCtx = () => $("ctx").classList.add("hidden");
document.addEventListener("pointerdown", (e) => { if (!e.target.closest("#ctx")) hideCtx(); if (!e.target.closest(".laywrap")) $("laymenu").classList.add("hidden"); });
function chartMenu(p, x, y, cx, cy) {
  const l = hitLine(p, y), h = !l && hitDrawing(p, x, y), pr = pOf(p, y, x), lp = last();
  if (l && l.kind === "ord") { const o = l.obj; return menu([{ h: `${o.side > 0 ? "Buy" : "Sell"} ${o.type} ${o.qty} @ ${px2(o.price)}` },
      { t: "Change quantity…", f: () => { const q = +prompt("Quantity", o.qty); if (q > 0) { o.qty = q; drawOrders(); refresh(); } } }, o.tool ? null : { t: "Change bracket…", f: () => bracketDlg(o) },
      { t: "Cancel order", c: "s", f: () => { orders = orders.filter((z) => z !== o); const d = drawings.find((z) => z.id === o.tool); if (d) d.state = "idle"; drawOrders(); refresh(); repaintAll(); } }], cx, cy); }
  if (l && (l.kind === "sl" || l.kind === "tp")) return menu([{ h: l.kind === "sl" ? "Stop loss" : "Take profit" }, { t: "Move stop to breakeven", f: toBE },
      { t: pos.trail ? "Turn trailing off" : "Trail the stop…", f: () => { if (pos.trail) pos.trail = 0; else { const v = +prompt("Trail by points", prefs.slPts); if (v > 0) { pos.trail = v; pos.hi = last(); } } drawOrders(); } },
      { t: "Remove " + (l.kind === "sl" ? "stop" : "target"), c: "s", f: () => { if (l.kind === "sl") pos.sl = null; else pos.tp = null; drawOrders(); refresh(); } }, "-", { t: "Close position", k: prefs.keys.close.toUpperCase(), f: () => closeAll() }], cx, cy);
  if (h) { const d = h.d; sel = d; repaintAll();
    if (d.type === "long" || d.type === "short") return menu([{ h: `${d.side > 0 ? "Long" : "Short"} position · ${d.state}` },
        d.state === "armed" ? { t: "Disarm (cancel the auto-entry)", f: () => disarmTool(d) } : d.state === "idle" ? { t: "Arm: auto-enter when price reaches entry", c: d.side > 0 ? "b" : "s", f: () => armTool(d) } : null,
        d.state === "idle" ? { t: "Enter now at market", f: () => { const q = posQty(d); d.qty = q; d.state = "filled"; fill(d.side, q, last(), nowT(), { slPx: d.sl, tpPx: d.tp }, d.id); } } : null,
        { t: "Confluences…" + (d.tags && d.tags.length ? " (" + d.tags.length + ")" : ""), f: () => confDlg(d) },
        ...RISK_PRESETS.map((pr) => ({ t: "\u2003 Risk preset " + pr[0], f: () => { if (d.state === "filled") return toast("Already filled"); applyRisk(d, pr); } })),
        { t: "Settings…", f: () => toolDlg(d) }, { t: "Flip to " + (d.side > 0 ? "short" : "long"), f: () => { if (d.state !== "idle") return toast("Disarm it first"); d.side = -d.side; d.type = d.side > 0 ? "long" : "short"; [d.sl, d.tp] = [rnd(2 * d.entry - d.sl), rnd(2 * d.entry - d.tp)]; repaintAll(); } },
        "-", { t: "Delete", c: "s", k: "Del", f: () => { disarmTool(d); drawings = drawings.filter((z) => z !== d); sel = null; repaintAll(); } }], cx, cy);
    return menu([{ h: d.type }, d.type === "text" ? { t: "Edit text…", f: () => { d.text = prompt("Note", d.text) || d.text; repaintAll(); } } : null,
      { t: "Clone", f: () => { const c = JSON.parse(JSON.stringify(d)); c.id = did++; drawings.push(c); repaintAll(); } }, { t: "Delete", c: "s", k: "Del", f: () => { drawings = drawings.filter((z) => z !== d); sel = null; repaintAll(); } }], cx, cy); }
  if (pr == null || lp == null) return menu([{ h: "Chart" }, { t: "Load a replay first", f: () => {} }], cx, cy);
  const above = pr > lp, q = lotsNow(), br = autoBr(), t = tOf(p, x);
  menu([{ h: `${sym} @ ${px2(pr)} · ${q} lot${q > 1 ? "s" : ""}` },
    { t: above ? `Sell limit @ ${px2(pr)}` : `Buy limit @ ${px2(pr)}`, c: above ? "s" : "b", f: () => place(above ? -1 : 1, "limit", pr, q, br) },
    { t: above ? `Buy stop @ ${px2(pr)}` : `Sell stop @ ${px2(pr)}`, c: above ? "b" : "s", f: () => place(above ? 1 : -1, "stop", pr, q, br) },
    "-", { t: "Long position here", c: "b", k: prefs.keys.long.toUpperCase(), f: () => { newDrawing("long", p, { t, p: pr }); repaintAll(); } },
    { t: "Short position here", c: "s", k: prefs.keys.short.toUpperCase(), f: () => { newDrawing("short", p, { t, p: pr }); repaintAll(); } },
    { t: "Horizontal line here", k: prefs.keys.hline.toUpperCase(), f: () => { newDrawing("hline", p, { t, p: pr }); repaintAll(); } },
    "-", { t: "Chart settings…", f: () => view("settings") }, { t: "Magnet: " + (prefs.magnet ? "on" : "off"), f: toggleMagnet },
    { t: "Remove all drawings", f: () => { drawings.filter((d) => d.state === "armed").forEach(disarmTool); drawings = []; sel = null; repaintAll(); } }], cx, cy);
}
function dlg(html, onOk) { $("dlgbox").innerHTML = html + '<div class="row" style="margin-top:12px"><button id="dl-x">Cancel</button><button id="dl-ok" class="primary">Save</button></div>'; $("dlg").classList.remove("hidden");
  $("dl-x").onclick = () => $("dlg").classList.add("hidden"); $("dl-ok").onclick = () => { onOk(); $("dlg").classList.add("hidden"); }; }
function toolDlg(d) { dlg(`<h3>${d.side > 0 ? "Long" : "Short"} position</h3><div class="row2"><label>Entry<input id="tdE" type="number" step="0.25" value="${d.entry}"></label><label>Quantity (blank = auto)<input id="tdQ" type="number" value="${d.qty || ""}"></label></div><div class="row2"><label>Stop<input id="tdS" type="number" step="0.25" value="${d.sl}"></label><label>Target<input id="tdT" type="number" step="0.25" value="${d.tp}"></label></div>`,
  () => { d.entry = rnd(+$("tdE").value); d.sl = rnd(+$("tdS").value); d.tp = rnd(+$("tdT").value); d.qty = +$("tdQ").value || null; syncTool(d); repaintAll(); }); }
function bracketDlg(o) { dlg(`<h3>Order bracket</h3><div class="row2"><label>Stop (pts)<input id="bS" type="number" step="0.25" value="${(o.br && o.br.slPts) || prefs.slPts}"></label><label>Target (pts)<input id="bT" type="number" step="0.25" value="${(o.br && o.br.tpPts) || prefs.tpPts}"></label></div>`, () => { o.br = { slPts: +$("bS").value, tpPts: +$("bT").value }; refresh(); }); }
function padDlg() { dlg(`<h3>Scalp Pad settings</h3><label>Lot buttons (comma separated)<input id="pdL" value="${prefs.lotset.join(",")}"></label>
  <label class="ck"><input id="pdB" type="checkbox" ${prefs.autoBr ? "checked" : ""}> Auto position bracket on every entry</label><div class="row2"><label>Stop (pts)<input id="pdS" type="number" step="0.25" value="${prefs.slPts}"></label><label>Target (pts)<input id="pdT" type="number" step="0.25" value="${prefs.tpPts}"></label></div>
  <label>Trailing stop (pts, 0 = off)<input id="pdTr" type="number" step="0.25" value="${prefs.trail}"></label><label class="ck"><input id="pdR" type="checkbox" ${prefs.byRisk ? "checked" : ""}> Size by risk instead of lots</label><label>Risk % of balance<input id="pdRp" type="number" step="0.1" value="${prefs.riskp}"></label>`,
  () => { prefs.lotset = $("pdL").value.split(",").map((x) => +x.trim()).filter((x) => x > 0).slice(0, 6); if (!prefs.lotset.length) prefs.lotset = [1]; prefs.autoBr = $("pdB").checked; prefs.slPts = +$("pdS").value; prefs.tpPts = +$("pdT").value; prefs.trail = +$("pdTr").value || 0; prefs.byRisk = $("pdR").checked; prefs.riskp = +$("pdRp").value; savePrefs(); lotsUI(); refresh(); }); }
function lockDlg() { dlg(`<h3>Personal lockout</h3><p class="small muted">Flattens you and blocks new orders. It runs on replay time.</p><label>Lock for<select id="lkS"><option value="day">Rest of this trading day</option><option value="1">1 hour</option><option value="2">2 hours</option><option value="4">4 hours</option><option value="c">Custom hours</option></select></label><label>Custom hours<input id="lkH" type="number" value="3"></label>`,
  () => { if (!nowT()) return toast("Load a replay first"); const v = $("lkS").value, hrs = v === "day" ? null : v === "c" ? +$("lkH").value : +v; flatten(); lock = { why: "Personal lockout", until: hrs == null ? endOfTradingDay(nowT()) : nowT() + hrs * 3600 }; refresh(); }); }
function toggleMagnet() { prefs.magnet = !prefs.magnet; $("magnet").classList.toggle("on", prefs.magnet); savePrefs(); toast("Magnet " + (prefs.magnet ? "on" : "off")); }

/* ---------------- scalp pad (floating) ---------------- */
function padUI() {
  const pd = $("pad"); pd.classList.toggle("hidden", !prefs.pad.show); $("padshow").textContent = prefs.pad.show ? "Hide Scalp Pad" : "Show Scalp Pad";
  $("padx2").classList.toggle("hidden", !prefs.pad.more); $("padmore").classList.toggle("on", !!prefs.pad.more);
  if (prefs.pad.x != null) { pd.style.bottom = "auto"; pd.style.left = Math.max(0, Math.min(prefs.pad.x, innerWidth - 300)) + "px"; pd.style.top = Math.max(0, Math.min(prefs.pad.y, innerHeight - 130)) + "px"; }
  else { const r = $("charts").getBoundingClientRect(); if (r.width) { pd.style.top = "auto"; pd.style.left = Math.round(r.left + r.width / 2 - 150) + "px"; pd.style.bottom = Math.round(innerHeight - r.bottom + 40) + "px"; } }   // default: bottom-centre of the charts
}
(() => { const bar = $("padbar"), pd = $("pad"); let d0 = null;
  bar.addEventListener("pointerdown", (e) => { if (e.target.closest(".pb")) return; const r = pd.getBoundingClientRect(); d0 = { dx: e.clientX - r.left, dy: e.clientY - r.top }; bar.setPointerCapture(e.pointerId); bar.style.cursor = "grabbing"; });
  bar.addEventListener("pointermove", (e) => { if (!d0) return; pd.style.left = Math.max(0, Math.min(innerWidth - 300, e.clientX - d0.dx)) + "px"; pd.style.top = Math.max(0, Math.min(innerHeight - 120, e.clientY - d0.dy)) + "px"; });
  bar.addEventListener("pointerup", () => { if (!d0) return; d0 = null; bar.style.cursor = ""; const r = pd.getBoundingClientRect(); prefs.pad.x = r.left; prefs.pad.y = r.top; savePrefs(); });
  pd.addEventListener("contextmenu", (e) => { e.preventDefault(); menu([{ h: "Scalp Pad" }, { t: "Pad settings…", f: padDlg }, { t: "Auto bracket: " + (prefs.autoBr ? "on" : "off"), f: () => { prefs.autoBr = !prefs.autoBr; savePrefs(); refresh(); } }, { t: "Dock (hide)", f: () => { prefs.pad.show = false; savePrefs(); padUI(); } }], e.clientX, e.clientY); });
})();
function lotsUI() { $("qn").textContent = prefs.lots; $("lots").innerHTML = prefs.lotset.map((n) => `<button data-lot="${n}" class="${n === prefs.lots ? "on" : ""}">${n}</button>`).join(""); }

/* ---------------- DOM ladder ---------------- */
let domDrag = null;
function renderDom() {
  if ($("md-dom").classList.contains("hidden") || last() == null) return; const lp = rnd(last()), rows = [];
  for (let i = 20; i >= -20; i--) { const p = +(lp + i * TICK).toFixed(2), my = orders.filter((o) => o.price === p), mb = my.filter((o) => o.side > 0), ma = my.filter((o) => o.side < 0);
    const tag = (pos.qty && pos.sl === p ? '<span class="tag sl">SL</span>' : "") + (pos.qty && pos.tp === p ? '<span class="tag tp">TP</span>' : "");
    rows.push(`<div class="r${i === 0 ? " last" : ""}${pos.qty && Math.abs(pos.avg - p) < TICK / 2 ? " avg" : ""}"><span class="mb" data-o="${mb.map((o) => o.id).join(",")}">${mb.reduce((s, o) => s + o.qty, 0) || ""}</span><span class="b" data-p="${p}">${p < lp ? "lmt" : p > lp ? "stp" : "mkt"}</span><span class="p">${px2(p)}${tag}</span><span class="s" data-p="${p}">${p > lp ? "lmt" : p < lp ? "stp" : "mkt"}</span><span class="ma" data-o="${ma.map((o) => o.id).join(",")}">${ma.reduce((s, o) => s + o.qty, 0) || ""}</span></div>`); }
  $("dom").innerHTML = rows.join("");
}
$("dom").addEventListener("pointerdown", (e) => { const ids = e.target.dataset.o; if (ids) domDrag = ids.split(",").map(Number); });
$("dom").addEventListener("pointerup", (e) => {
  const row = e.target.closest(".r"); if (!row) { domDrag = null; return; } const p = +row.querySelector(".b").dataset.p;
  if (domDrag) { orders.filter((o) => domDrag.includes(o.id)).forEach((o) => (o.price = p)); domDrag = null; drawOrders(); refresh(); return; }
  if (!e.target.classList.contains("b") && !e.target.classList.contains("s")) return; const lp = rnd(last()), buy = e.target.classList.contains("b"), side = buy ? 1 : -1;
  if (p === lp) return market(side); place(side, (buy ? p < lp : p > lp) ? "limit" : "stop", p, lotsNow(), autoBr());
});

/* ---------------- panels ---------------- */
function refresh() {
  const bal = balance(), op = openPnl(), rp = dayRpl(), cls = (v) => (v >= 0 ? "pos-up" : "pos-dn");
  flashNum("bal", Math.round(bal)); flashNum("rpl", Math.round(rp)); $("bal").textContent = money(bal); $("rpl").textContent = money(rp); $("rpl").className = cls(rp); $("upl").textContent = money(op); $("upl").className = cls(op);
  let run = sess ? +sess.account_start : prefs.bal, peak = Math.max(run, acctPeak || 0); for (const t of hist) { run += +t.pnl || 0; peak = Math.max(peak, run); }
  $("ddl").textContent = prefs.mdd ? money(prefs.mdd - (peak - (bal + op))) : "off";
  const L = lockedNow(); $("status").textContent = L ? (lock.until === Infinity ? "Locked" : "Locked · " + Math.max(0, Math.ceil((lock.until - nowT()) / 60)) + "m") : "Active"; $("status").classList.toggle("locked", L); $("status").title = L ? lock.why : "";
  const lp = last(); $("acctname").textContent = acct ? acct.name : `Replay · ${money(sess ? +sess.account_start : prefs.bal).replace(/\.00$/, "")}`;
  $("b-acct").innerHTML = `<table class="bt"><tr><th>Account</th><th>Start</th><th>Balance</th><th>RP&amp;L today</th><th>UP&amp;L</th><th>Drawdown left</th><th>Daily loss limit</th><th>Status</th></tr><tr><td>${$("acctname").textContent}</td><td>${money(sess ? +sess.account_start : prefs.bal)}</td><td>${money(bal)}</td><td class="${cls(rp)}">${money(rp)}</td><td class="${cls(op)}">${money(op)}</td><td>${$("ddl").textContent}</td><td>${prefs.dll ? money(prefs.dll) : "off"}</td><td>${$("status").textContent}</td></tr></table>`;
  $("pbid").textContent = lp != null ? px2(lp) : "—"; $("pask").textContent = lp != null ? px2(lp + TICK) : "—"; $("padsym").textContent = sym;
  $("padpos").innerHTML = pos.qty ? `<span class="${cls(pos.qty)}">${pos.qty > 0 ? "LONG" : "SHORT"} ${Math.abs(pos.qty)}</span> @ ${px2(pos.avg)} · <span class="${cls(op)}">${money(op)}</span>` : "Flat";
  $("clock").textContent = nowT() ? fmt(loc(nowT())) + " NY" : "—";
  $("sb-br").textContent = prefs.autoBr ? `SL ${prefs.slPts} / TP ${prefs.tpPts} pts` : "off"; $("sb-sz").textContent = prefs.byRisk ? prefs.riskp + "% risk" : prefs.lots + " lot(s)"; $("sb-tr").textContent = prefs.trail ? prefs.trail + " pts" : "off";
  $("b-pos").innerHTML = pos.qty ? `<table class="bt"><tr><th>Symbol</th><th>Side</th><th>Qty</th><th>Avg</th><th>Last</th><th>Stop</th><th>Target</th><th>UPL</th><th></th></tr><tr><td>${sym}</td><td class="${cls(pos.qty)}">${pos.qty > 0 ? "Long" : "Short"}</td><td>${Math.abs(pos.qty)}</td><td>${px2(pos.avg)}</td><td>${px2(lp)}</td><td>${px2(pos.sl)}</td><td>${px2(pos.tp)}</td><td class="${cls(op)}">${money(op)}</td><td><button data-a="close">Close</button> <button data-a="rev">Reverse</button> <button data-a="be">BE</button></td></tr></table>` : '<div class="empty">Flat</div>';
  $("b-ord").innerHTML = orders.length ? `<table class="bt"><tr><th>Side</th><th>Type</th><th>Qty</th><th>Price</th><th>Bracket</th><th></th></tr>${orders.map((o) => `<tr><td class="${cls(o.side)}">${o.side > 0 ? "Buy" : "Sell"}</td><td>${o.type}${o.tool ? " (position tool)" : ""}</td><td>${o.qty}</td><td>${px2(o.price)}</td><td>${o.br ? (o.br.slPx != null ? `SL ${px2(o.br.slPx)} / TP ${px2(o.br.tpPx)}` : `SL ${o.br.slPts} / TP ${o.br.tpPts} pts`) : "—"}</td><td><button data-c="${o.id}">Cancel</button></td></tr>`).join("")}</table>` : '<div class="empty">No working orders</div>';
  $("ordn").textContent = orders.length ? "(" + orders.length + ")" : "";
  $("b-hist").innerHTML = hist.length ? `<table class="bt"><tr><th>Time (NY)</th><th>Side</th><th>Qty</th><th>Entry</th><th>Exit</th><th>Result</th><th>R</th><th>P&L</th></tr>${hist.slice().reverse().map((t) => `<tr><td>${fmt(loc(t.t_entry)).slice(5)}</td><td>${t.dir > 0 ? "Long" : "Short"}</td><td>${t.qty}</td><td>${px2(t.entry)}</td><td>${px2(t.exit)}</td><td>${t.outcome}</td><td>${t.r ?? "—"}</td><td class="${cls(t.pnl)}">${money(t.pnl)}</td></tr>`).join("")}</table>` : '<div class="empty">No trades this session</div>';
  const w = hist.filter((t) => t.pnl > 0).length; $("bstat").textContent = hist.length ? `${hist.length} trades · ${Math.round((100 * w) / hist.length)}% win · net ${money(hist.reduce((s, t) => s + t.pnl, 0))}` : "";
  const sl = +$("o-sl").value, q = +$("o-qty").value, tp = +$("o-tp").value || 0; $("o-risk").innerHTML = sl && q ? `Risk <b>${money(sl * q * inst.pt + fee(q))}</b> · reward <b>${money(tp * q * inst.pt)}</b> · <b>${(tp / sl).toFixed(2)}R</b>` : "";
  renderDom();
}

/* ---------------- feel: sounds (made here with Web Audio, no files), haptics, number flashes ---------------- */
let AC = null;
function sfx(kind) {
  if (prefs.sound === false) return; try { AC = AC || new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; } const t0 = AC.currentTime, vol = (prefs.vol ?? 60) / 100 * 0.18;
  const note = (f, at, dur, type = "sine", v = vol) => { const o = AC.createOscillator(), g = AC.createGain(); o.type = type; o.frequency.setValueAtTime(f, t0 + at); g.gain.setValueAtTime(0, t0 + at); g.gain.linearRampToValueAtTime(v, t0 + at + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + dur); o.connect(g).connect(AC.destination); o.start(t0 + at); o.stop(t0 + at + dur + 0.02); };
  if (kind === "fill") { note(880, 0, 0.09, "triangle"); note(1320, 0.05, 0.12, "sine", vol * 0.7); }
  else if (kind === "win") { [660, 880, 1320].forEach((f, i) => note(f, i * 0.07, 0.22, "sine")); }
  else if (kind === "loss") { note(330, 0, 0.18, "triangle"); note(247, 0.1, 0.3, "triangle", vol * 0.8); }
  else if (kind === "click") note(1600, 0, 0.03, "square", vol * 0.25);
  else if (kind === "lock") { note(220, 0, 0.35, "sawtooth", vol * 0.5); }
}
function buzz(ms) { if (prefs.haptics !== false && navigator.vibrate) try { navigator.vibrate(ms); } catch (e) {} }
const lastShown = {};
function flashNum(id, v) { const el = $(id); if (lastShown[id] != null && v !== lastShown[id]) { el.classList.remove("fl-up", "fl-dn"); void el.offsetWidth; el.classList.add(v > lastShown[id] ? "fl-up" : "fl-dn"); } lastShown[id] = v; }

/* ---------------- accounts (portfolio) ---------------- */
let accts = [], acct = null, startBal = 50000, acctPeak = 0;
const ACCT_PRESETS = { practice: ["Practice", 50000, { mdd: 2000, dll: 1000, ptg: 0 }], e25: ["Eval 25K", 25000, { mdd: 1000, dll: 500, ptg: 1250 }], e50: ["Eval 50K", 50000, { mdd: 2000, dll: 1000, ptg: 3000 }],
  e100: ["Eval 100K", 100000, { mdd: 3000, dll: 1500, ptg: 6000 }], e150: ["Eval 150K", 150000, { mdd: 4500, dll: 2250, ptg: 9000 }], f50: ["Funded 50K", 50000, { mdd: 2000, dll: 1000, ptg: 0 }] };
async function loadAccts() { accts = await db.accounts(); acct = accts.find((a) => a.id === prefs.acct) || null; applyAcctRules(); }
function applyAcctRules() { if (!acct) return; const r = acct.rules || {}; ["mdd", "dll", "ptg"].forEach((k) => { if (r[k] != null) prefs[k] = +r[k]; }); fillSettings(); }
async function acctStart() {   // balance and high-water mark for the selected account (from its saved trades)
  if (!acct) { startBal = prefs.bal; acctPeak = 0; return; } const tr = (await db.allTrades()).filter((t) => t.account_id === acct.id).sort((a, b) => a.t_exit - b.t_exit);
  let run = +acct.start_bal, pk = run; for (const t of tr) { run += +t.pnl || 0; pk = Math.max(pk, run); } startBal = run; acctPeak = pk;
}
function acctMenu() { const r = $("acctpill").getBoundingClientRect();
  menu([{ h: "Account" }, { t: (acct ? "\u2003 " : "✓ ") + "Replay (no account)", f: () => pickAcct(null) }, ...accts.map((a) => ({ t: (acct && acct.id === a.id ? "✓ " : "\u2003 ") + a.name, k: money(+a.start_bal).replace(/\.00$/, ""), f: () => pickAcct(a.id) })), "-", { t: "Manage accounts…", f: () => view("accounts") }], r.left, r.bottom + 6); }
function pickAcct(id) { if (pos.qty || orders.length) return toast("Close positions and cancel orders first"); prefs.acct = id; acct = accts.find((a) => a.id === id) || null; applyAcctRules(); savePrefs(); refresh(); toast(acct ? "Trading on " + acct.name + ". Load a replay to start a session on it." : "Trading without an account"); }
async function renderAccts() {
  const all = await db.allTrades(), rows = await Promise.all(accts.map(async (a) => { const tr = all.filter((t) => t.account_id === a.id).sort((x, y) => x.t_exit - y.t_exit); let run = +a.start_bal, pk = run; for (const t of tr) { run += +t.pnl || 0; pk = Math.max(pk, run); }
    const R = a.rules || {}, ddLeft = R.mdd ? R.mdd - (pk - run) : null, w = tr.filter((t) => t.pnl > 0).length, pnl = run - a.start_bal;
    const st = ddLeft != null && ddLeft <= 0 ? ["Blown", "dn"] : R.ptg && pnl >= R.ptg ? ["Target hit", "up"] : ["Active", ""];
    return `<div class="acard ${acct && acct.id === a.id ? "on" : ""}" data-id="${a.id}"><div class="ah"><b>${a.name}</b><span class="pill ${st[1]}">${st[0]}</span></div>
      <div class="abig ${pnl >= 0 ? "pos-up" : "pos-dn"}">${money(run)}</div><div class="muted small">${pnl >= 0 ? "+" : ""}${money(pnl)} since start · ${tr.length} trades · ${tr.length ? Math.round((100 * w) / tr.length) : 0}% win</div>
      ${R.ptg ? `<div class="bar"><i style="width:${Math.max(0, Math.min(100, (100 * pnl) / R.ptg))}%"></i></div><div class="tiny muted">Profit target ${money(R.ptg)}</div>` : ""}
      <div class="kvs"><div><span>Drawdown left</span><b>${ddLeft == null ? "off" : money(ddLeft)}</b></div><div><span>Daily loss limit</span><b>${R.dll ? money(R.dll) : "off"}</b></div></div>
      <div class="row"><button data-use="${a.id}" class="small">${acct && acct.id === a.id ? "Selected" : "Use"}</button><button data-edit="${a.id}" class="ghost small">Edit</button><button data-arch="${a.id}" class="ghost small">Archive</button></div></div>`; }));
  $("ac-list").innerHTML = rows.join("") || '<div class="empty">No accounts yet. Make one to track an eval or a funded account separately.</div>';
}
function acctDlg(a) { const r = (a && a.rules) || {}; dlg(`<h3>${a ? "Edit account" : "New account"}</h3>${a ? "" : `<label>Start from<select id="acP">${Object.entries(ACCT_PRESETS).map(([k, v]) => `<option value="${k}">${v[0]}</option>`).join("")}</select></label>`}
    <label>Name<input id="acN" value="${a ? a.name : "Practice"}"></label><label>Starting balance ($)<input id="acB" type="number" value="${a ? a.start_bal : 50000}"></label>
    <div class="row2"><label>Max drawdown, trailing ($)<input id="acM" type="number" value="${r.mdd ?? 2000}"></label><label>Daily loss limit ($)<input id="acD" type="number" value="${r.dll ?? 1000}"></label></div><label>Profit target ($, 0 = none)<input id="acT" type="number" value="${r.ptg ?? 0}"></label><p class="tiny muted">Presets are examples. Set the numbers to match your firm's current rules.</p>`,
  async () => { const row = { name: $("acN").value.trim() || "Account", start_bal: +$("acB").value || 50000, rules: { mdd: +$("acM").value || 0, dll: +$("acD").value || 0, ptg: +$("acT").value || 0 } };
    try { if (a) { await db.updAccount(a.id, row); Object.assign(a, row); } else { const n = await db.newAccount(row); accts.push(n); } if (acct && a && acct.id === a.id) applyAcctRules(); renderAccts(); } catch (e) { toast(e.message); } });
  if (!a) $("acP").onchange = () => { const v = ACCT_PRESETS[$("acP").value]; $("acN").value = v[0]; $("acB").value = v[1]; $("acM").value = v[2].mdd; $("acD").value = v[2].dll; $("acT").value = v[2].ptg; };
}

/* ---------------- position presets + confluence checklist ---------------- */
const CONF_REESE = ["HTF bias agrees", "Liquidity swept", "Inversion FVG", "SMT with ES", "PO3 / manipulation", "Key open", "In the killzone", "5m / 15m FVG entry", "Clear draw on liquidity"];
const RISK_PRESETS = [["1:2", 0, 2], ["1:3 (Reese)", 0, 3], ["1:4", 0, 4], ["10 pt stop · 1:2", 10, 2], ["15 pt stop · 1:3", 15, 3], ["25 pt stop · 1:4", 25, 4]];
function applyRisk(d, [nm, stopPts, rr]) { const risk = stopPts || Math.abs(d.entry - d.sl) || 10; d.sl = rnd(d.entry - d.side * risk); d.tp = rnd(d.entry + d.side * risk * rr); syncTool(d); repaintAll(); toast(nm + " applied"); }
function confDlg(d) { const tags = prefs.tagset && prefs.tagset.length ? prefs.tagset : CONF_REESE, on = new Set(d.tags || []);
  dlg(`<h3>Confluences</h3><p class="tiny muted">Tick what's there before you arm it. The ticks are saved with the trade, and Stats shows which ones actually pay.</p><div class="cks">${tags.map((t, i) => `<label class="ck"><input type="checkbox" data-t="${i}" ${on.has(t) ? "checked" : ""}> ${t}</label>`).join("")}</div>
    <label>Add your own (comma separated)<input id="cfX" placeholder="e.g. NWOG, CISD"></label><div class="score" id="cfS"></div>`,
  () => { const pick = [...document.querySelectorAll("#dlgbox [data-t]")].filter((x) => x.checked).map((x) => tags[+x.dataset.t]); const extra = $("cfX").value.split(",").map((x) => x.trim()).filter(Boolean);
    if (extra.length) { prefs.tagset = [...new Set([...tags, ...extra])]; savePrefs(); } d.tags = [...pick, ...extra]; repaintAll(); toast(d.tags.length + " confluence" + (d.tags.length === 1 ? "" : "s") + " saved"); });
  const sc = () => { const n = [...document.querySelectorAll("#dlgbox [data-t]")].filter((x) => x.checked).length; $("cfS").innerHTML = `Score <b>${n}/${tags.length}</b>`; }; document.querySelectorAll("#dlgbox [data-t]").forEach((x) => (x.onchange = sc)); sc(); }

/* ---------------- stats ---------------- */
let stC = null;
async function renderStats() {
  $("st-acct").innerHTML = `<option value="">All accounts</option><option value="none">Replay (no account)</option>` + accts.map((a) => `<option value="${a.id}">${a.name}</option>`).join(""); $("st-acct").value = prefs.stAcct || "";
  let tr = (await db.allTrades()).slice().sort((a, b) => a.t_exit - b.t_exit); const A = $("st-acct").value, S = $("st-sym").value, D = +$("st-range").value;
  if (A === "none") tr = tr.filter((t) => !t.account_id); else if (A) tr = tr.filter((t) => t.account_id === A); if (S) tr = tr.filter((t) => t.symbol === S);
  if (D && tr.length) { const end = tr[tr.length - 1].t_exit; tr = tr.filter((t) => t.t_exit >= end - D * 86400); }
  const n = tr.length, W = tr.filter((t) => t.pnl > 0), L = tr.filter((t) => t.pnl <= 0), sum = (a) => a.reduce((s, t) => s + (+t.pnl || 0), 0), gw = sum(W), gl = -sum(L);
  let run = 0, pk = 0, dd = 0, cw = 0, cl = 0, bw = 0, bl = 0; const eq = [];
  for (const t of tr) { run += +t.pnl || 0; pk = Math.max(pk, run); dd = Math.max(dd, pk - run); if (t.pnl > 0) { cw++; cl = 0; } else { cl++; cw = 0; } bw = Math.max(bw, cw); bl = Math.max(bl, cl); eq.push({ time: t.t_exit, value: +run.toFixed(2) }); }
  const rs = tr.filter((t) => t.r != null), K = [["Trades", n], ["Win rate", n ? Math.round((100 * W.length) / n) + "%" : "—"], ["Net", money(run)], ["Expectancy / trade", n ? money(run / n) : "—"], ["Avg R", rs.length ? (rs.reduce((s, t) => s + +t.r, 0) / rs.length).toFixed(2) + "R" : "—"],
    ["Profit factor", gl ? (gw / gl).toFixed(2) : n ? "∞" : "—"], ["Avg win", W.length ? money(gw / W.length) : "—"], ["Avg loss", L.length ? money(-gl / L.length) : "—"], ["Worst drop", money(-dd)], ["Best streak", bw + " wins"], ["Worst streak", bl + " losses"]];
  $("st-kpi").innerHTML = K.map(([k, v]) => `<div><span class="muted small">${k}</span><b>${v}</b></div>`).join("");
  const grp = (key) => { const g = {}; for (const t of tr) for (const k of [].concat(key(t))) { (g[k] = g[k] || []).push(t); } return g; };
  const table = (g, order) => { const ks = order ? order.filter((k) => g[k]) : Object.keys(g).sort((a, b) => sum(g[b]) - sum(g[a])); if (!ks.length) return '<div class="empty">No trades yet</div>'; const mx = Math.max(...ks.map((k) => Math.abs(sum(g[k])))) || 1;
    return `<table class="bt"><tr><th></th><th>Trades</th><th>Win</th><th>Net</th><th></th></tr>${ks.map((k) => { const v = sum(g[k]), w = g[k].filter((t) => t.pnl > 0).length; return `<tr><td>${k}</td><td>${g[k].length}</td><td>${Math.round((100 * w) / g[k].length)}%</td><td class="${v >= 0 ? "pos-up" : "pos-dn"}">${money(v)}</td><td><i class="hbar ${v >= 0 ? "up" : "dn"}" style="width:${Math.round((60 * Math.abs(v)) / mx)}px"></i></td></tr>`; }).join("")}</table>`; };
  $("st-hour").innerHTML = table(grp((t) => lhm(loc(t.t_entry)).slice(0, 2) + ":00"), [...Array(24).keys()].map((h) => String(h).padStart(2, "0") + ":00"));
  $("st-wd").innerHTML = table(grp((t) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][new Date(loc(t.t_entry) * 1000).getUTCDay()]), ["Mon", "Tue", "Wed", "Thu", "Fri", "Sun"]);
  $("st-tag").innerHTML = table(grp((t) => (t.tags && t.tags.length ? t.tags : ["(no tags)"])));
  if (!stC) { stC = LightweightCharts.createChart($("st-eq"), { autoSize: true, layout: { background: { type: "solid", color: "transparent" }, textColor: "#7f8a9c", fontFamily: "Geist Mono, monospace" }, grid: { vertLines: { visible: false }, horzLines: { color: "rgba(255,255,255,.04)" } }, rightPriceScale: { borderVisible: false }, timeScale: { borderVisible: false } }); stC.s = stC.addAreaSeries({ lineColor: "#5ee6b8", topColor: "rgba(94,230,184,.25)", bottomColor: "rgba(94,230,184,0)", lineWidth: 2 }); }
  const seen = new Set(); stC.s.setData(eq.filter((p) => (seen.has(p.time) ? false : seen.add(p.time)))); stC.timeScale().fitContent();
}

/* ---------------- journal ---------------- */
let eqC, eqS, jT = [];
async function loadJournal() {
  jT = await db.trades($("j-sym").value); const n = jT.length, w = jT.filter((t) => t.pnl > 0), l = jT.filter((t) => t.pnl < 0);
  const gp = w.reduce((s, t) => s + +t.pnl, 0), gl = -l.reduce((s, t) => s + +t.pnl, 0); let run = 0, pk = 0, mdd = 0; const eq = [];
  jT.forEach((t, i) => { run += +t.pnl; pk = Math.max(pk, run); mdd = Math.max(mdd, pk - run); eq.push({ time: i + 1, value: run }); });
  const rs = jT.filter((t) => t.r != null), avgR = rs.length ? rs.reduce((s, t) => s + +t.r, 0) / rs.length : 0; const box = (k, v) => `<div><span class="muted small">${k}</span><b>${v}</b></div>`;
  $("stats").innerHTML = box("Trades", n) + box("Win rate", n ? Math.round((100 * w.length) / n) + "%" : "—") + box("Avg R", avgR.toFixed(2)) + box("Profit factor", gl ? (gp / gl).toFixed(2) : "—") + box("Net P&L", money(gp - gl)) + box("Max drawdown", money(-mdd)) + box("Avg win", w.length ? money(gp / w.length) : "—") + box("Avg loss", l.length ? money(-gl / l.length) : "—");
  if (!eqC) { eqC = LightweightCharts.createChart($("eqchart"), { layout: { background: { type: "solid", color: "transparent" }, textColor: "#7f8a9c" }, grid: { vertLines: { visible: false }, horzLines: { color: "rgba(255,255,255,.04)" } }, timeScale: { visible: false }, autoSize: true }); eqS = eqC.addAreaSeries({ lineColor: "#5ee6b8", topColor: "rgba(94,230,184,.25)", bottomColor: "rgba(94,230,184,0)", lineWidth: 2 }); }
  eqS.setData(eq); eqC.timeScale().fitContent();
  $("jrows").innerHTML = jT.slice().reverse().map((t) => `<tr data-id="${t.id}"><td>${fmt(loc(t.t_entry))}</td><td>${t.symbol}</td><td>${t.dir > 0 ? "Long" : "Short"}</td><td>${t.qty}</td><td>${px2(t.entry)}</td><td>${px2(t.exit)}</td><td>${t.r ?? "—"}</td><td class="${t.pnl >= 0 ? "pos-up" : "pos-dn"}">${money(+t.pnl)}</td><td><input class="note" value="${(t.notes || "").replace(/"/g, "&quot;")}" placeholder="add a note"></td><td>${t.shots && t.shots.length ? '<a href="#" class="shotlink">📷</a>' : ""}${t.notion_page ? " N" : ""}</td></tr>`).join("");
}
function exportCsv() {
  const h = ["date_ny", "symbol", "side", "qty", "entry", "stop", "target", "exit", "r", "pnl", "fees", "outcome", "notes"];
  const rows = jT.map((t) => [fmt(loc(t.t_entry)), t.symbol, t.dir > 0 ? "long" : "short", t.qty, t.entry, t.stop, t.target, t.exit, t.r, t.pnl, t.fees, t.outcome, JSON.stringify(t.notes || "")].join(","));
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([h.join(",") + "\n" + rows.join("\n")], { type: "text/csv" })); a.download = "rewind-journal.csv"; a.click();
}

/* ---------------- Notion ---------------- */
async function notionUI() {
  const show = (id) => ["n-connect", "n-setup", "n-ready"].forEach((x) => $(x).classList.toggle("hidden", x !== id));
  try { const s = await notion("status"); $("n-oauth").classList.toggle("hidden", !s.oauth); $("n-tokenbox").open = !s.oauth;
    if (!s.connected) { $("n-state").textContent = "Not connected"; notionAuto = false; return show("n-connect"); }
    $("n-state").innerHTML = "Connected to <b>" + (s.workspace || "Notion") + "</b>";
    if (!s.db) { show("n-setup"); const r = await notion("pages"); $("n-pages").innerHTML = r.pages.length ? r.pages.map((p) => `<option value="${p.id}">${p.title}</option>`).join("") : "<option value=''>No pages shared yet. Add your integration to a page first</option>"; return; }
    show("n-ready"); $("n-open").href = s.db_url; $("n-auto").checked = s.auto_sync; notionAuto = s.auto_sync;
  } catch (e) { $("n-state").textContent = DEMO ? "Not connected (demo)" : "Notion: " + e.message; show("n-connect"); $("n-tokenbox").open = true; }
}
const nmsg = (m) => ($("n-msg").textContent = m);

/* ---------------- prefs / settings / admin ---------------- */
async function loadPrefs() { if (DEMO) return; const { data } = await sb.from("prefs").select("data").maybeSingle(); if (data && data.data) { const d = data.data; Object.assign(prefs, d); prefs.keys = { ...DEF_KEYS, ...(d.keys || {}) }; prefs.pad = { show: true, x: null, y: null, ...(d.pad || {}) }; if (!Array.isArray(prefs.tfs)) prefs.tfs = DEF_TFS.slice(); if (!LAYOUTS[prefs.layout]) prefs.layout = "1"; if (!Array.isArray(prefs.lotset)) prefs.lotset = [1, 2, 3, 5, 10]; if (!Array.isArray(prefs.favs)) prefs.favs = ["trend", "hline", "rect", "long", "short"]; if (prefs.favShow == null) prefs.favShow = true; prefs.ind = { ...IND_DEF, ...(d.ind || {}) }; } }
function savePrefs() { if (!DEMO && user) sb.from("prefs").upsert({ user_id: user.id, data: prefs, updated_at: new Date().toISOString() }).then(() => {}); }
const KEYNAMES = { buy: "Buy market", sell: "Sell market", joinbid: "Join bid", joinask: "Join ask", reverse: "Reverse", flatten: "Flatten all", cancel: "Cancel all", close: "Close all", trend: "Trend line", hline: "Horizontal line", vline: "Vertical line", rect: "Zone", long: "Long position", short: "Short position", measure: "Measure" };
function fillSettings() {
  if ($("s-sound")) { $("s-sound").checked = prefs.sound !== false; $("s-vol").value = prefs.vol ?? 60; $("s-hap").checked = prefs.haptics !== false; $("s-splash").checked = prefs.splash !== false; }
  $("s-bal").value = prefs.bal; $("s-dll").value = prefs.dll; $("s-ptg").value = prefs.ptg; $("s-act").value = prefs.act; $("s-mdd").value = prefs.mdd; $("s-fee").value = prefs.fee; $("s-mfee").value = prefs.mfee;
  $("s-opens").checked = !!prefs.opens; $("s-sess").checked = !!prefs.sess; $("s-up").value = prefs.up; $("s-dn").value = prefs.dn; $("sym").value = prefs.sym; $("o-sl").value = prefs.slPts; $("o-tp").value = prefs.tpPts;
  $("s-keys").innerHTML = Object.entries(KEYNAMES).map(([k, n]) => `<div><span>${n}</span><input data-key="${k}" maxlength="1" value="${prefs.keys[k] || ""}"></div>`).join("");
  $("magnet").classList.toggle("on", prefs.magnet);
}
function saveSettings() {
  Object.assign(prefs, { bal: +$("s-bal").value, dll: +$("s-dll").value, ptg: +$("s-ptg").value, act: $("s-act").value, mdd: +$("s-mdd").value, fee: +$("s-fee").value, mfee: +$("s-mfee").value, opens: $("s-opens").checked, sess: $("s-sess").checked, up: $("s-up").value, dn: $("s-dn").value });
  document.querySelectorAll("[data-key]").forEach((i) => (prefs.keys[i.dataset.key] = i.value.toLowerCase()));
  Object.assign(prefs, { sound: $("s-sound").checked, vol: +$("s-vol").value, haptics: $("s-hap").checked, splash: $("s-splash").checked }); sfx("fill");
  if (acct) { acct.rules = { ...(acct.rules || {}), mdd: prefs.mdd, dll: prefs.dll, ptg: prefs.ptg }; db.updAccount(acct.id, { rules: acct.rules }).catch(() => {}); }
  panes.forEach((p) => p.series.applyOptions({ upColor: prefs.up, downColor: prefs.dn, wickUpColor: prefs.up, wickDownColor: prefs.dn })); savePrefs(); drawOpens(); repaintAll(); refresh(); $("s-msg").textContent = "Saved";
}
async function loadAdmin() {
  const { data: al } = await sb.from("allowlist").select("*").order("added_at");
  $("ad-list").innerHTML = (al || []).map((a) => `<div class="row"><span style="flex:3">${a.email} <span class="muted">(${a.role})</span></span>${a.role === "admin" ? "<span></span>" : `<button class="ghost small" data-del="${a.email}">Remove</button>`}</div>`).join("");
  const { data: fs } = await sb.from("features").select("*").order("key"); $("ad-feat").innerHTML = (fs || []).map((f) => `<label class="ck"><input type="checkbox" data-feat="${f.key}" ${f.enabled ? "checked" : ""}> ${f.label}</label>`).join("");
  const { data: bf } = await sb.from("bar_files").select("symbol,tf,day").order("day"); const g = {}; (bf || []).forEach((r) => (g[r.symbol + " " + r.tf] = g[r.symbol + " " + r.tf] || []).push(r.day));
  $("ad-data").innerHTML = Object.entries(g).map(([k, d]) => `${k}: ${d.length} months (${d[0].slice(0, 7)} → ${d[d.length - 1].slice(0, 7)})`).join("<br>") || "No data yet";
}

/* ---------------- boot + wiring ---------------- */
let toastT; function toast(m) { const t = $("toast"); if (!m) return t.classList.add("hidden"); t.textContent = m; t.classList.remove("hidden"); t.style.animation = "none"; void t.offsetWidth; t.style.animation = ""; clearTimeout(toastT); toastT = setTimeout(() => t.classList.add("hidden"), 3600); }
function view(v) { const el = $("v-" + v); if (el) { el.classList.remove("enter"); void el.offsetWidth; el.classList.add("enter"); } sfx("click"); document.querySelectorAll(".vtab[data-view]").forEach((b) => b.classList.toggle("on", b.dataset.view === v)); document.querySelectorAll(".view").forEach((x) => x.classList.toggle("hidden", x.id !== "v-" + v)); $("pad").style.visibility = $("favbar").style.visibility = v === "trade" ? "" : "hidden"; $("tools").style.visibility = v === "trade" ? "" : "hidden"; $("app").dataset.v = v; if (v === "journal") loadJournal(); if (v === "stats") renderStats(); if (v === "accounts") renderAccts(); if (v === "admin") loadAdmin(); if (v === "settings") notionUI(); }
function layMenu() { $("laymenu").innerHTML = Object.entries(LAYOUTS).map(([k, [c, r]]) => `<button class="lay ${k === prefs.layout ? "on" : ""}" data-lay="${k}"><i style="grid-template-columns:repeat(${c},1fr);grid-template-rows:repeat(${r},1fr)">${"<b></b>".repeat(c * r)}</i>${c * r} chart${c * r > 1 ? "s" : ""}${k === "2h" ? " ↕" : ""}</button>`).join(""); }
function splash() { const s = document.createElement("div"); s.className = "splash"; s.innerHTML = '<div class="sp-in"><span class="sp-logo">⟲</span><span class="sp-name">Rewind</span></div>'; document.body.appendChild(s); setTimeout(() => s.classList.add("out"), 900); setTimeout(() => s.remove(), 1400); }
if (prefs.splash !== false) splash();
async function boot() {
  if (DEMO) { user = { id: "demo", email: "demo" }; const d = document.createElement("div"); d.className = "demo"; d.textContent = "DEMO · made-up prices · nothing is saved"; document.body.appendChild(d); }
  else {
    const { data: { session } } = await sb.auth.getSession(); if (!session) { $("auth").classList.remove("hidden"); $("app").classList.add("hidden"); return; }
    user = session.user; const { data: okm } = await sb.rpc("is_member");
    if (!okm) { $("auth").classList.remove("hidden"); $("a-msg").textContent = "Signed in as " + user.email + ", but this email isn't on the invite list yet. Ask King to add you."; return; }
    isAdmin = !!(await sb.rpc("is_admin")).data; $("vt-admin").classList.toggle("hidden", !isAdmin);
    const { data: fs } = await sb.from("features").select("key,enabled"); (fs || []).forEach((f) => (features[f.key] = f.enabled)); await loadPrefs();
  }
  $("auth").classList.add("hidden"); $("app").classList.remove("hidden");
  if (features.journal === false) document.querySelector('[data-view="journal"]').classList.add("hidden"); if (features.dom === false) $("m-dom").classList.add("hidden");
  if (features.drawings === false) document.querySelectorAll("[data-tool]").forEach((b) => !["cursor", "cross"].includes(b.dataset.tool) && b.classList.add("hidden"));
  if (features.multichart === false) { prefs.layout = "1"; $("laybtn").classList.add("hidden"); } if (features.notion === false) $("notioncard").classList.add("hidden");
  $("avatar").textContent = (user.email || "?")[0]; $("avatar").title = user.email;
  await loadAccts().catch(() => {}); fillSettings(); lotsUI(); layMenu(); sideUI(); dockUI(); toolsUI(); buildPanes(); tfUI(); favUI(); requestAnimationFrame(padUI); requestAnimationFrame(watchScales);
  if (!$("start").value) $("start").value = new Date(Date.now() - 8 * 864e5).toISOString().slice(0, 10) + "T09:20";
  if (!DEMO) notionUI().catch(() => {});
  const h = decodeURIComponent(location.hash || ""); if (h.startsWith("#notion=")) { history.replaceState(null, "", location.pathname); view("settings"); nmsg("Notion: " + h.slice(8)); }
  if (DEMO) { $("start").value = "2026-10-14T09:45"; await loadReplay(); for (let i = 0; i < 25; i++) await stepFwd(); }
  refresh();
}
$("a-in").onclick = async () => { const { error } = await sb.auth.signInWithPassword({ email: $("a-email").value.trim(), password: $("a-pass").value }); $("a-msg").textContent = error ? error.message : ""; if (!error) boot(); };
$("a-up").onclick = async () => { const { data, error } = await sb.auth.signUp({ email: $("a-email").value.trim(), password: $("a-pass").value, options: { emailRedirectTo: location.origin + location.pathname } }); $("a-msg").textContent = error ? error.message : data.session ? "" : "Check your email to confirm, then sign in here."; if (data && data.session) boot(); };
$("logout").onclick = async () => { await sb.auth.signOut(); location.reload(); }; $("lockbtn").onclick = lockDlg;
document.querySelectorAll(".vtab[data-view]").forEach((b) => (b.onclick = () => view(b.dataset.view)));
$("go").onclick = loadReplay; $("play").onclick = play; $("step").onclick = () => { pause(); stepFwd(); }; $("back").onclick = () => { pause(); stepBack(); };
$("laybtn").onclick = () => $("laymenu").classList.toggle("hidden"); $("laymenu").onclick = (e) => { const b = e.target.closest(".lay"); if (b) { setLayout(b.dataset.lay); layMenu(); } };
document.addEventListener("click", (e) => { const b = e.target.closest("#tools [data-tool], #favbar [data-tool]"); if (b) setTool(b.dataset.tool); });
$("tools").addEventListener("contextmenu", (e) => { const b = e.target.closest("[data-tool]"); e.preventDefault(); const items = [{ h: "Toolbar" }];
  if (b) { const t = b.dataset.tool, on = prefs.favs.includes(t); items.push({ t: (on ? "Remove " : "Add ") + (TOOLNAMES[t] || t) + (on ? " from" : " to") + " favorites", f: () => { prefs.favs = on ? prefs.favs.filter((x) => x !== t) : [...prefs.favs, t]; prefs.favShow = true; savePrefs(); favUI(); } }); }
  items.push({ t: prefs.toolsPos ? "Dock toolbar on the left" : "Float toolbar (drag the grip)", f: () => { prefs.toolsPos = prefs.toolsPos ? null : { x: 70, y: 140 }; savePrefs(); toolsUI(); } }); menu(items, e.clientX, e.clientY); });
$("favbtn").onclick = () => { prefs.favShow = !prefs.favShow; savePrefs(); favUI(); };
$("favbar").addEventListener("contextmenu", (e) => { const b = e.target.closest("[data-tool]"); e.preventDefault(); menu([{ h: "Favorites" }, b ? { t: "Remove " + (TOOLNAMES[b.dataset.tool] || b.dataset.tool), f: () => { prefs.favs = prefs.favs.filter((x) => x !== b.dataset.tool); savePrefs(); favUI(); } } : null, { t: "Hide favorites bar", f: () => { prefs.favShow = false; savePrefs(); favUI(); } }], e.clientX, e.clientY); });
grip($("favgrip"), (e, st) => { const fb = $("favbar"), r = fb.getBoundingClientRect(); if (!st.r) st.r = r; fb.style.transform = "none"; fb.style.left = Math.max(0, Math.min(innerWidth - r.width, st.r.left + e.clientX - st.x)) + "px"; fb.style.top = Math.max(0, Math.min(innerHeight - r.height, st.r.top + e.clientY - st.y)) + "px"; },
  () => { const r = $("favbar").getBoundingClientRect(); prefs.favPos = { x: r.left, y: r.top }; savePrefs(); });
grip($("toolgrip"), (e, st) => { const t = $("tools"); if (!prefs.toolsPos) { prefs.toolsPos = { x: e.clientX - 20, y: e.clientY - 10 }; toolsUI(); } if (!st.r) st.r = t.getBoundingClientRect(); t.style.left = Math.max(0, Math.min(innerWidth - 50, st.r.left + e.clientX - st.x)) + "px"; t.style.top = Math.max(0, Math.min(innerHeight - 100, st.r.top + e.clientY - st.y)) + "px"; },
  () => { const r = $("tools").getBoundingClientRect(); if (prefs.toolsPos) { prefs.toolsPos = { x: r.left, y: r.top }; savePrefs(); } });
$("toolgrip").ondblclick = () => { prefs.toolsPos = null; savePrefs(); toolsUI(); };
grip($("dockgrip"), (e, st) => { if (st.h == null) { st.h = prefs.dockClosed ? 0 : prefs.dockH || 150; prefs.dockClosed = false; $("dock").classList.remove("closed"); } prefs.dockH = Math.max(60, Math.min(Math.round(innerHeight * 0.6), st.h + st.y - e.clientY)); dockH(); },
  () => { if (prefs.dockH < 70) { prefs.dockClosed = true; prefs.dockH = 150; } savePrefs(); dockUI(); });
$("sym").onchange = () => {   // switch instrument right away, at the same replay time
  if (!B["1m"].bars.length) return; if (pos.qty || orders.length) { $("sym").value = sym; return toast("Close positions and cancel orders before switching instrument"); }
  $("start").value = fmt(loc(cursorT + 61)).replace(" ", "T"); loadReplay();
};
$("skipny").onclick = () => skipTo("09:30", "NY open"); $("skipasia").onclick = () => skipTo("20:00", "Asia open");
$("clr").onclick = () => { drawings.filter((d) => d.state === "armed").forEach(disarmTool); drawings = []; sel = null; repaintAll(); }; $("magnet").onclick = toggleMagnet;
document.querySelectorAll(".mode").forEach((b) => (b.onclick = () => { document.querySelectorAll(".mode").forEach((x) => x.classList.toggle("on", x === b)); ["scalp", "dom", "order"].forEach((m) => $("md-" + m).classList.toggle("hidden", m !== b.dataset.mode)); if (b.dataset.mode === "scalp" && !prefs.pad.show) { prefs.pad.show = true; padUI(); } refresh(); }));
document.querySelectorAll(".btab").forEach((b) => (b.onclick = () => { if (b.classList.contains("on") && !prefs.dockClosed) { prefs.dockClosed = true; savePrefs(); return dockUI(); } prefs.dockClosed = false; savePrefs(); dockUI();
  document.querySelectorAll(".btab").forEach((x) => x.classList.toggle("on", x === b)); ["acct", "pos", "ord", "hist"].forEach((k) => $("b-" + k).classList.toggle("hidden", k !== b.dataset.b)); }));
$("acctpill").onclick = acctMenu; $("ac-new").onclick = () => acctDlg(null);
$("ac-list").onclick = (e) => { const b = e.target.closest("button"); if (!b) return; const id = b.dataset.use || b.dataset.edit || b.dataset.arch, a = accts.find((x) => x.id === id); if (!a) return;
  if (b.dataset.use) { pickAcct(id); renderAccts(); } else if (b.dataset.edit) acctDlg(a); else if (confirm("Archive " + a.name + "? Its trades stay in your journal.")) db.updAccount(id, { archived: true }).then(() => { accts = accts.filter((x) => x.id !== id); if (acct && acct.id === id) pickAcct(null); renderAccts(); }); };
["st-acct", "st-sym", "st-range"].forEach((k) => ($(k).onchange = () => { if (k === "st-acct") { prefs.stAcct = $(k).value; savePrefs(); } renderStats(); }));
$("dockbtn").onclick = () => { prefs.dockClosed = !prefs.dockClosed; savePrefs(); dockUI(); };
$("tfbar").onclick = (e) => { const b = e.target.closest(".tf"); if (b) setPaneTf(active, b.dataset.tf); };
$("ranges").onclick = (e) => { const b = e.target.closest("[data-r]"); if (b) showRange(+b.dataset.r); };
$("gotobtn").onclick = () => { const s = $("start"); s.focus(); try { s.showPicker(); } catch (e) {} };
$("sc-pct").onclick = () => setScale("pct"); $("sc-log").onclick = () => setScale("log"); $("sc-auto").onclick = () => setScale("auto");
$("indbtn").onclick = indMenu; $("shotbtn").onclick = saveShot; $("sidebtn").onclick = () => { prefs.side = !prefs.side; savePrefs(); sideUI(); };
$("fullbtn").onclick = () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => {});
$("qdn").onclick = () => { prefs.lots = Math.max(1, prefs.lots - 1); lotsUI(); savePrefs(); refresh(); }; $("qup").onclick = () => { prefs.lots = prefs.lots + 1; lotsUI(); savePrefs(); refresh(); };
$("padmore").onclick = () => { prefs.pad.more = !prefs.pad.more; savePrefs(); padUI(); };
$("padshow").onclick = () => { prefs.pad.show = !prefs.pad.show; savePrefs(); padUI(); }; $("padx").onclick = () => { prefs.pad.show = false; savePrefs(); padUI(); };
$("lots").onclick = (e) => { const n = +e.target.dataset.lot; if (!n) return; prefs.lots = n; lotsUI(); savePrefs(); refresh(); };
$("pbuy").onclick = () => market(1); $("psell").onclick = () => market(-1); $("pjb").onclick = joinBid; $("pja").onclick = joinAsk; $("pclose").onclick = () => closeAll(); $("prev").onclick = reverse;
$("scancel").onclick = cancelAll; $("sflat").onclick = flatten; $("d-buy").onclick = () => market(1); $("d-sell").onclick = () => market(-1); $("d-jb").onclick = joinBid; $("d-ja").onclick = joinAsk; $("d-close").onclick = () => closeAll(); $("d-rev").onclick = reverse;
let oside = 1;
$("o-buy").onclick = () => { oside = 1; $("o-buy").classList.add("on"); $("o-sell").classList.remove("on"); if (draft) { draft.side = 1; drawOrders(); } };
$("o-sell").onclick = () => { oside = -1; $("o-sell").classList.add("on"); $("o-buy").classList.remove("on"); if (draft) { draft.side = -1; drawOrders(); } };
document.querySelectorAll("[data-q]").forEach((b) => (b.onclick = () => { $("o-qty").value = Math.max(1, (+$("o-qty").value || 1) + +b.dataset.q); refresh(); }));
["o-sl", "o-tp", "o-qty"].forEach((k) => ($(k).oninput = refresh));
$("o-type").onchange = () => { const t = $("o-type").value; $("o-pxrow").classList.toggle("hidden", t === "market"); if (t === "market") draft = null; else if (last() != null) { draft = { side: oside, type: t, price: rnd(+$("o-px").value || last() - oside * 10) }; $("o-px").value = draft.price; } drawOrders(); };
$("o-px").oninput = () => { if (draft) { draft.price = rnd(+$("o-px").value); drawOrders(); } };
$("o-send").onclick = () => { const ty = $("o-type").value, q = +$("o-qty").value || 1, br = { slPts: +$("o-sl").value || 0, tpPts: +$("o-tp").value || 0, trail: $("o-trail").checked ? +$("o-sl").value : 0 };
  if (ty === "market") { if (canTrade()) fill(oside, q, last(), nowT(), br); return; } const p = draft ? draft.price : +$("o-px").value; if (!p) return toast("Set a price (drag the draft line)");
  place(oside, ty, p, q, br); draft = null; $("o-type").value = "market"; $("o-pxrow").classList.add("hidden"); drawOrders(); };
$("b-pos").onclick = (e) => { const a = e.target.dataset.a; if (a === "close") closeAll(); if (a === "rev") reverse(); if (a === "be") toBE(); };
$("b-ord").onclick = (e) => { const c = +e.target.dataset.c; if (c) { const o = orders.find((z) => z.id === c); orders = orders.filter((z) => z.id !== c); const d = o && drawings.find((z) => z.id === o.tool); if (d) d.state = "idle"; drawOrders(); refresh(); repaintAll(); } };
$("s-save").onclick = saveSettings; $("j-sym").onchange = loadJournal; $("j-csv").onclick = exportCsv;
$("j-notion").onclick = async () => { $("j-msg").textContent = "Syncing…"; try { const r = await notion("sync"); $("j-msg").textContent = "Sent " + r.synced + " trades to Notion"; loadJournal(); } catch (e) { $("j-msg").textContent = e.message; } };
$("jrows").addEventListener("change", (e) => { if (e.target.classList.contains("note")) db.note(e.target.closest("tr").dataset.id, e.target.value); });
$("jrows").addEventListener("click", async (e) => { if (!e.target.classList.contains("shotlink")) return; e.preventDefault(); const t = jT.find((x) => x.id === e.target.closest("tr").dataset.id); const { data } = await sb.storage.from("shots").createSignedUrl(t.shots[0], 300); if (data) window.open(data.signedUrl, "_blank"); });
$("n-oauth").onclick = async () => { try { const r = await notion("oauth_url"); location.href = r.url; } catch (e) { nmsg(e.message); } };
$("n-save").onclick = async () => { nmsg("Checking token…"); try { await notion("save_token", { token: $("n-token").value }); $("n-token").value = ""; nmsg(""); notionUI(); } catch (e) { nmsg(e.message); } };
$("n-create").onclick = async () => { const id = $("n-pages").value; if (!id) return nmsg("Share a page with your integration first, then reload"); nmsg("Creating…"); try { await notion("setup", { page_id: id }); nmsg("Journal created. New trades will show up there."); notionUI(); } catch (e) { nmsg(e.message); } };
$("n-sync").onclick = async () => { nmsg("Syncing…"); try { const r = await notion("sync"); nmsg("Sent " + r.synced + " trades"); } catch (e) { nmsg(e.message); } };
$("n-auto").onchange = async () => { notionAuto = $("n-auto").checked; await notion("auto", { on: notionAuto }).catch(() => {}); };
$("n-off").onclick = async () => { if (!confirm("Disconnect Notion? Your Notion journal stays in Notion.")) return; await notion("disconnect").catch(() => {}); notionUI(); };
$("ad-add").onclick = async () => { const e = $("ad-email").value.trim().toLowerCase(); if (!e) return; const { error } = await sb.from("allowlist").insert({ email: e }); if (error) alert(error.message); $("ad-email").value = ""; loadAdmin(); };
$("ad-list").addEventListener("click", async (e) => { const em = e.target.dataset.del; if (!em || !confirm("Remove " + em + "? Their saved data stays, they just can't get in.")) return; await sb.from("allowlist").delete().eq("email", em); loadAdmin(); });
$("ad-feat").addEventListener("change", async (e) => { const k = e.target.dataset.feat; if (k) await sb.from("features").update({ enabled: e.target.checked, updated_at: new Date().toISOString() }).eq("key", k); });
document.addEventListener("keydown", (e) => {
  if (["INPUT", "SELECT", "TEXTAREA"].includes(e.target.tagName) || $("v-trade").classList.contains("hidden") || !$("dlg").classList.contains("hidden")) return; const k = e.key.toLowerCase(), K = prefs.keys;
  if (e.code === "Space") { e.preventDefault(); play(); } else if (e.key === "ArrowRight") { pause(); stepFwd(); } else if (e.key === "ArrowLeft") { pause(); stepBack(); }
  else if (e.key === "Escape") { setTool("cursor"); sel = null; hideCtx(); repaintAll(); } else if ((e.key === "Delete" || e.key === "Backspace") && sel) { if (sel.state === "armed") disarmTool(sel); drawings = drawings.filter((d) => d !== sel); sel = null; repaintAll(); }
  else if (k === K.buy) market(1); else if (k === K.sell) market(-1); else if (k === K.joinbid) joinBid(); else if (k === K.joinask) joinAsk(); else if (k === K.reverse) reverse(); else if (k === K.flatten) flatten(); else if (k === K.cancel) cancelAll(); else if (k === K.close) closeAll();
  else if (k === K.trend) setTool("trend"); else if (k === K.hline) setTool("hline"); else if (k === K.vline) setTool("vline"); else if (k === K.rect) setTool("rect"); else if (k === K.long) setTool("long"); else if (k === K.short) setTool("short"); else if (k === K.measure) setTool("measure");
});
addEventListener("resize", () => { padUI(); repaintAll(); });
sb.auth.onAuthStateChange((ev) => { if (ev === "SIGNED_IN" && !user) boot(); });
boot();
