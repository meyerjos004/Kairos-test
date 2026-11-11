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
const IND_DEF = { data: true, sess: true, pd: true, pw: false, eq: false, fvg: false, fvgTf: "1h", fvgTfs: ["1h"], ifvg: true, h4: false, po3: false };
const DEF_KEYS = { buy: "b", sell: "s", joinbid: "j", joinask: "a", reverse: "r", flatten: "f", cancel: "c", close: "x", be: "e", trend: "t", hline: "h", vline: "v", rect: "z", long: "l", short: "k", measure: "m" };
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
  review(id, ch) { if (DEMO) { const t = mem.trades.find((x) => x.id === id); if (t) Object.assign(t, ch); return; } sb.from("trades").update(ch).eq("id", id).then(() => {}); },
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
  const prevT = cursorT; cursorT = Math.min(...nxt); if (reese.length && prevT) reeseCheck(loc(prevT), loc(cursorT));
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
  { t: ck(I.data) + "Data highs / lows (news candles: 8:30, 10:00, 2:00)", f: flip("data") }, { t: ck(I.sess) + "Session highs / lows (Asia, London, NY AM)", f: flip("sess") }, { t: ck(I.pd) + "Previous day high / low", f: flip("pd") }, { t: ck(I.pw) + "Previous week high / low", f: flip("pw") }, { t: ck(I.eq) + "Equal highs / lows (resting liquidity)", f: flip("eq") },
  { t: ck(I.fvg) + "Fair value gaps (FVG)", f: flip("fvg") }, ...(I.fvg ? ["5m", "15m", "1h", "4h", "1D"].map((tf) => ({ t: "\u2003 " + ck((I.fvgTfs || []).includes(tf)) + tf + " gaps", f: () => { const s = new Set(I.fvgTfs || []); s.has(tf) ? s.delete(tf) : s.add(tf); I.fvgTfs = [...s]; savePrefs(); repaintAll(); } })).concat([{ t: "\u2003 " + ck(I.ifvg) + "Show inversions (IFVG)", f: flip("ifvg") }]) : []),
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
function rebuildAll() { if (blind) panes.forEach((p) => p.chart.applyOptions({ timeScale: { tickMarkFormatter: (t) => new Date(t * 1000).toISOString().slice(11, 16) }, localization: { timeFormatter: (t) => new Date(t * 1000).toISOString().slice(11, 16) } })); panes.forEach(rebuildPane); drawOpens(); drawOrders(); refresh(); }
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
  if (I.pw) {   // previous week high/low (week opens Sunday 18:00 New York)
    const wk = (lt) => { const d = new Date((lt + 6 * 3600) * 1000); return Math.floor((lt + 6 * 3600) / 86400) - d.getUTCDay(); }, cw = wk(loc(t)); let hi = null, lo = null;
    for (let k = i; k >= Math.max(0, i - 15 * 1440); k--) { const x = bars[k], w = wk(loc(x.t)); if (w === cw) continue; if (w < cw - 7) break; if (!hi || x.h > hi.h) hi = x; if (!lo || x.l < lo.l) lo = x; }
    if (hi) out.levels.push({ price: hi.h, t0: loc(hi.t), label: "PWH", col: "rgba(196,181,253,.8)" }, { price: lo.l, t0: loc(lo.t), label: "PWL", col: "rgba(196,181,253,.8)" }); }
  if (I.eq) {   // equal highs / lows: two 15m swing points within a hair of each other that price hasn't run yet = resting liquidity
    const cs = []; for (let k = Math.max(0, i - 3 * 1440); k <= i; k++) { const x = bars[k], bt = bucket(loc(x.t), 900), c = cs[cs.length - 1];
      if (c && c.t === bt) { c.h = Math.max(c.h, x.h); c.l = Math.min(c.l, x.l); c.c = x.c; } else cs.push({ t: bt, o: x.o, h: x.h, l: x.l, c: x.c }); }
    const tol = bars[i].c * 0.00012, sw = { h: [], l: [] };
    for (let k = 2; k < cs.length - 2; k++) { const c = cs[k];
      if (c.h >= cs[k - 1].h && c.h >= cs[k - 2].h && c.h > cs[k + 1].h && c.h > cs[k + 2].h) sw.h.push(k);
      if (c.l <= cs[k - 1].l && c.l <= cs[k - 2].l && c.l < cs[k + 1].l && c.l < cs[k + 2].l) sw.l.push(k); }
    const after = (k, f) => cs.slice(k + 1).some(f), seen = new Set();
    for (const [side, key] of [["h", "EQH"], ["l", "EQL"]]) { const xs = sw[side];
      for (let a1 = xs.length - 1; a1 > 0; a1--) for (let a2 = a1 - 1; a2 >= 0 && a1 - a2 <= 6; a2--) { const p1 = cs[xs[a1]][side], p2 = cs[xs[a2]][side]; if (Math.abs(p1 - p2) > tol) continue;
        const lvl = side === "h" ? Math.max(p1, p2) : Math.min(p1, p2); if (after(xs[a1], (z) => (side === "h" ? z.h > lvl : z.l < lvl))) continue; const kk = key + Math.round(lvl); if (seen.has(kk)) continue; seen.add(kk);
        out.levels.push({ price: lvl, t0: cs[xs[a2]].t, label: key, col: "rgba(255,214,102,.85)" }); } } }
  if (I.data) {   // data highs/lows: the high + low of a news candle (8:30, 10:00, 14:00 FOMC) that blew out the range. They act as draws until price trades through.
    const NEWS = ["08:30", "10:00", "14:00"], dl = [];
    for (const dd of order) { const xs = days[dd] || []; xs.sort((a, b) => a.t - b.t);
      for (let k = 0; k < xs.length; k++) { const x = xs[k], h = hm(x); if (!NEWS.includes(h)) continue; const prior = xs.slice(Math.max(0, k - 30), k).map((y) => y.h - y.l).sort((p, q) => p - q);
        if (prior.length < 10) continue; const med = prior[prior.length >> 1] || 0.25, rg = x.h - x.l; if (rg < 4 * med || rg < x.c * 0.0004) continue;
        let tH = false, tL = false; for (let m = bars.indexOf(x) + 1; m <= i && m > 0; m++) { if (bars[m].h > x.h) tH = true; if (bars[m].l < x.l) tL = true; if (tH && tL) break; }
        const lb = h.replace(/^0/, "") + (dd === today ? "" : " " + dd.slice(5));
        dl.push({ price: x.h, t0: loc(x.t), label: "Data H " + lb + (tH ? " ✓" : ""), col: tH ? "rgba(255,159,67,.35)" : "rgba(255,159,67,.95)" }, { price: x.l, t0: loc(x.t), label: "Data L " + lb + (tL ? " ✓" : ""), col: tL ? "rgba(255,159,67,.35)" : "rgba(255,159,67,.95)" }); } }
    out.levels.push(...dl.slice(-12)); out.data = dl; }
  if (I.sess) for (const [nm, a, z, col] of SESS) { for (const dd of [today, prev]) { const xs = (days[dd] || []).filter((x) => { const h = hm(x); return z === "24:00" ? h >= a : h >= a && h < z; }); if (!xs.length) continue;
      const hi = xs.reduce((m, x) => (x.h > m.h ? x : m)), lo = xs.reduce((m, x) => (x.l < m.l ? x : m)), tag = dd === today ? "" : " (prev)";
      out.levels.push({ price: hi.h, t0: loc(hi.t), label: nm + " H" + tag, col }, { price: lo.l, t0: loc(lo.t), label: nm + " L" + tag, col }); if (dd === today) break; } }
  if (I.pd && prev) { const rth = (days[prev] || []).filter((x) => hm(x) >= "09:30" && hm(x) < "16:00"); if (rth.length) { const hi = rth.reduce((m, x) => (x.h > m.h ? x : m)), lo = rth.reduce((m, x) => (x.l < m.l ? x : m));
      out.levels.push({ price: hi.h, t0: loc(hi.t), label: "PDH", col: "rgba(230,234,240,.7)" }, { price: lo.l, t0: loc(lo.t), label: "PDL", col: "rgba(230,234,240,.7)" }); } }
  if (I.fvg) {   // FVGs on each chosen timeframe. Shows only the UNFILLED part (it shrinks as price trades in). A candle closing through the far side flips it to an inversion gap (IFVG) that holds until a close back through.
    const lp = bars[i].c, all = [];
    for (const tf of (I.fvgTfs && I.fvgTfs.length ? I.fvgTfs : [I.fvgTf])) { const sec = SEC[tf] || 3600, cs = [];
      for (let k = Math.max(0, i - (sec >= 14400 ? 15 : 10) * 1440); k <= i; k++) { const x = bars[k], bt = bucket(loc(x.t), sec), c = cs[cs.length - 1];
        if (c && c.t === bt) { c.h = Math.max(c.h, x.h); c.l = Math.min(c.l, x.l); c.c = x.c; } else cs.push({ t: bt, o: x.o, h: x.h, l: x.l, c: x.c }); }
      const done = cs.slice(0, -1);
      for (let k = 2; k < done.length; k++) { const a0 = done[k - 2], c0 = done[k]; let g = null;
        if (c0.l > a0.h) g = { top: c0.l, bot: a0.h, dir: 1 }; else if (c0.h < a0.l) g = { top: a0.l, bot: c0.h, dir: -1 }; if (!g) continue;
        let alive = true, inv = false;
        for (let m = k + 1; m < cs.length; m++) { const z = cs[m], fin = m < cs.length - 1;
          if (!inv) { if (g.dir > 0) { if (z.l < g.top) g.top = Math.max(g.bot, z.l); } else if (z.h > g.bot) g.bot = Math.min(g.top, z.h);   // trade into it: keep only the unfilled part
            if (fin && (g.dir > 0 ? z.c < g.bot : z.c > g.top)) { if (!I.ifvg) { alive = false; break; } inv = true; g = { top: g.dir > 0 ? c0.l : a0.l, bot: g.dir > 0 ? a0.h : c0.h, dir: -g.dir }; }   // the whole original gap flips
            else if (g.top - g.bot <= 0) { alive = false; break; } }
          else if (fin && (g.dir > 0 ? z.c < g.bot : z.c > g.top)) { alive = false; break; } }
        if (alive && g.top > g.bot) all.push({ ...g, t0: done[k - 1].t, label: tf + (inv ? " IFVG" : " FVG"), inv, tf }); } }
    all.sort((a, b) => Math.abs((a.top + a.bot) / 2 - lp) - Math.abs((b.top + b.bot) / 2 - lp)); out.gaps = all.slice(0, 8); }
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
    g.fillStyle = z.dir > 0 ? "rgba(43,212,160,.09)" : "rgba(255,107,122,.09)"; g.fillRect(x1, y1, W - x1, y2 - y1);
    if (z.inv) { g.strokeStyle = z.dir > 0 ? "rgba(43,212,160,.5)" : "rgba(255,107,122,.5)"; g.setLineDash([4, 3]); g.strokeRect(x1, Math.min(y1, y2), W - x1, Math.abs(y2 - y1)); g.setLineDash([]); }
    g.fillStyle = "rgba(200,210,225,.55)"; g.fillText(z.label, x1 + 4, Math.min(y1, y2) + 11); }
  for (const l of S.levels) { const y = yOf(p, l.price); if (y == null || y < 0 || y > H) continue; const x1 = X(l.t0);
    g.strokeStyle = l.col; g.lineWidth = 1; g.setLineDash([5, 4]); g.beginPath(); g.moveTo(x1, y); g.lineTo(W, y); g.stroke(); g.setLineDash([]); g.fillStyle = l.col; g.fillText(l.label, W - g.measureText(l.label).width - 6, y - 4); }
  // contract roll marker: data switches contracts on the session after quarterly expiry (3rd Friday of Mar/Jun/Sep/Dec), so a price gap there is the roll, not a move
  if (p.sec < 86400) { const vr = ts.getVisibleLogicalRange(); if (vr && p.candles.length) { const a0 = p.candles[Math.max(0, Math.floor(vr.from))], a1 = p.candles[Math.min(p.candles.length - 1, Math.ceil(vr.to))];
    if (a0 && a1) for (let y = new Date(a0.time * 1000).getUTCFullYear(); y <= new Date(a1.time * 1000).getUTCFullYear(); y++) for (const m of [2, 5, 8, 11]) { const f = new Date(Date.UTC(y, m, 1)), fri = 1 + ((5 - f.getUTCDay() + 7) % 7) + 14, rt = Date.UTC(y, m, fri) / 1000 + 2 * 86400 + 18 * 3600;
      if (rt < a0.time || rt > a1.time + p.sec) continue; const x = xOf(p, rt); if (x == null) continue; g.strokeStyle = "rgba(255,198,92,.45)"; g.setLineDash([2, 4]); g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); g.setLineDash([]); g.fillStyle = "rgba(255,198,92,.8)"; g.fillText("contract roll", x + 4, 14); g.fillText("expiry (thin data)", X(rt - 2 * 86400 - 18 * 3600 + 9.5 * 3600) + 4, 26); } } }
  if (S.po3) { const P = S.po3, x = W - 26, yh = yOf(p, P.h), yl = yOf(p, P.l), yo = yOf(p, P.o), yc = yOf(p, P.c); if ([yh, yl, yo, yc].every((v) => v != null)) {
      const up = P.c >= P.o; g.strokeStyle = up ? "rgba(43,212,160,.8)" : "rgba(255,107,122,.8)"; g.fillStyle = up ? "rgba(43,212,160,.22)" : "rgba(255,107,122,.22)";
      g.beginPath(); g.moveTo(x, yh); g.lineTo(x, yl); g.stroke(); g.fillRect(x - 7, Math.min(yo, yc), 14, Math.max(1, Math.abs(yo - yc))); g.strokeRect(x - 7, Math.min(yo, yc), 14, Math.max(1, Math.abs(yo - yc)));
      g.fillStyle = "rgba(200,210,225,.6)"; g.fillText("D", x - 3, yh - 5); } }
  g.restore();
}
function paint(p) {   // data speed: Fast = every frame, Balanced ~30 fps, Lite ~10 fps
  if (!p) return; const gap = { balanced: 33, lite: 100 }[prefs.speed] || 0; if (gap) { const w = gap - (performance.now() - (p.lastPaint || 0)); if (w > 0) { if (!p.pt) p.pt = setTimeout(() => { p.pt = 0; paint(p); }, w); return; } p.lastPaint = performance.now(); }
  cancelAnimationFrame(p.raf); p.raf = requestAnimationFrame(() => {
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
function canTrade() { if (prefs.lockUntil && Date.now() < prefs.lockUntil) { toast("🔒 Personal lockout until " + new Date(prefs.lockUntil).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })); return false; } if (lockedNow()) { toast("🔒 " + lock.why); return false; } if (last() == null) { toast("Load a chart first"); return false; } return true; }
const lotsNow = () => Math.max(1, +prefs.lots || 1);
const autoBr = () => (prefs.autoBr ? { slPts: prefs.slPts, tpPts: prefs.tpPts } : null);
function market(side, qty) { if (!canTrade()) return; qty = qty || (prefs.byRisk ? Math.max(1, Math.floor((balance() * prefs.riskp / 100) / (prefs.slPts * inst.pt))) : lotsNow()); fill(side, qty, last(), nowT(), autoBr()); }
function joinBid() { if (canTrade()) place(1, "limit", last() - TICK, lotsNow(), autoBr()); }
function joinAsk() { if (canTrade()) place(-1, "limit", last() + TICK, lotsNow(), autoBr()); }
function place(side, type, price, qty, br, extra = {}) { if (!canTrade()) return; const o = { id: oid++, side, type, price: rnd(price), qty, br, ...extra }; orders.push(o); snd("place"); drawOrders(); refresh(); return o; }
function fill(side, qty, price, t, br, toolId) {
  if (!pos.qty || Math.sign(pos.qty) === side) { snd("fill"); buzz(25); }
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
  hist.push(row); pos.qty -= side * cq; snd(outcome === "win" ? "target" : outcome === "loss" ? "stop" : "closed"); buzz(pnl > 0 ? [20, 40, 20] : 60);
  if (!pos.qty) { const tl = drawings.find((d) => d.id === pos.tool); if (tl) tl.state = "done"; pos = flat(); repaintAll(); }
  db.addTrade(row).then((d) => { Object.assign(row, d); reviewCard(row); shot(d.id); if (notionAuto) notion("sync", { ids: [d.id] }).catch(() => {}); }).catch((e) => toast("Trade not saved: " + e.message));
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
    { t: "Start the replay from this candle", f: () => { if (pos.qty || orders.length) return toast("Close positions and cancel orders first"); $("start").value = fmt(t + 60).replace(" ", "T"); loadReplay(); } },
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
  else { const r = $("charts").getBoundingClientRect(); if (r.width) { pd.style.top = "auto"; pd.style.left = Math.round(r.left + r.width / 2 - 150) + "px"; pd.style.bottom = Math.round(innerHeight - r.bottom + 16) + "px"; } }   // default: bottom-centre of the charts
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
  $("clock").textContent = nowT() ? (blind ? "Mystery day · " + fmt(loc(nowT())).slice(11) : fmt(loc(nowT()))) + " NY" : "—";
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
// LucidFlex eval numbers (public summaries, Nov 2026): EOD trailing max loss, no daily limit, 50% consistency, max loss locks at start - $100 once the close passes start + target
const LUCID = { lf25: ["LucidFlex 25K eval", 25000, { mdd: 1000, dll: 0, ptg: 1250, eod: true, cons: 50, lock: true, maxMini: 2 }, 95], lf50: ["LucidFlex 50K eval", 50000, { mdd: 2000, dll: 0, ptg: 3000, eod: true, cons: 50, lock: true, maxMini: 4 }, 130],
  lf100: ["LucidFlex 100K eval", 100000, { mdd: 3000, dll: 0, ptg: 6000, eod: true, cons: 50, lock: true, maxMini: 6 }, 200], lf150: ["LucidFlex 150K eval", 150000, { mdd: 4500, dll: 0, ptg: 9000, eod: true, cons: 50, lock: true, maxMini: 10 }, 260] };
const ACCT_PRESETS = { practice: ["Practice", 50000, { mdd: 2000, dll: 1000, ptg: 0 }], ...Object.fromEntries(Object.entries(LUCID).map(([k, v]) => [k, v.slice(0, 3)])) };
async function loadAccts() { accts = await db.accounts(); acct = accts.find((a) => a.id === prefs.acct) || null; applyAcctRules(); }
function applyAcctRules() { if (!acct) return; const r = acct.rules || {}; ["mdd", "dll", "ptg"].forEach((k) => { if (r[k] != null) prefs[k] = +r[k]; }); fillSettings(); }
async function acctStart() {   // balance and high-water mark for the selected account (from its saved trades)
  if (!acct) { startBal = prefs.bal; acctPeak = 0; return; } const S = acctState(acct, await db.allTrades()); startBal = S.run; acctPeak = S.pk;
  if (S.blown) toast(acct.name + " is blown. Earn a new eval on the Learn page, or pick another account.");
}
function acctMenu() { const r = $("acctpill").getBoundingClientRect();
  menu([{ h: "Account" }, { t: (acct ? "\u2003 " : "✓ ") + "Replay (no account)", f: () => pickAcct(null) }, ...accts.map((a) => ({ t: (acct && acct.id === a.id ? "✓ " : "\u2003 ") + a.name, k: money(+a.start_bal).replace(/\.00$/, ""), f: () => pickAcct(a.id) })), "-", { t: "Manage accounts…", f: () => view("accounts") }], r.left, r.bottom + 6); }
function pickAcct(id) { if (pos.qty || orders.length) return toast("Close positions and cancel orders first"); prefs.acct = id; acct = accts.find((a) => a.id === id) || null; applyAcctRules(); savePrefs(); refresh(); toast(acct ? "Trading on " + acct.name + ". Load a replay to start a session on it." : "Trading without an account"); }
function acctState(a, all) {   // balance, max-loss line (intraday or end-of-day trailing, with Lucid-style lock), consistency, status
  const R = a.rules || {}, tr = all.filter((t) => t.account_id === a.id).sort((x, y) => x.t_exit - y.t_exit), start = +a.start_bal; let run = start, pk = start, floor = R.mdd ? start - R.mdd : -Infinity, blown = false; const byDay = {};
  for (const t of tr) { run += +t.pnl || 0; const d = sessDay(t.t_exit); byDay[d] = (byDay[d] || 0) + (+t.pnl || 0);
    if (!R.eod) { pk = Math.max(pk, run); if (R.mdd) floor = Math.max(floor, pk - R.mdd); } if (run <= floor) blown = true; }
  if (R.eod && R.mdd) { let bal = start; for (const d of Object.keys(byDay).sort()) { bal += byDay[d]; pk = Math.max(pk, bal); floor = Math.max(floor, pk - R.mdd); if (R.lock && R.ptg && pk >= start + R.ptg) floor = Math.max(floor, start - 100); } }
  if (R.lock && R.ptg && pk >= start + R.ptg) floor = Math.min(floor, start - 100) === floor ? floor : Math.max(floor, start - 100);
  const pnl = run - start, best = Math.max(0, ...Object.values(byDay)), consOk = !R.cons || pnl <= 0 || (100 * best) / pnl <= R.cons;
  const passed = R.ptg && pnl >= R.ptg && consOk, ddLeft = R.mdd ? run - floor : null; if (ddLeft != null && ddLeft <= 0) blown = true;
  return { tr, run, pk, floor, pnl, best, consOk, passed, blown, ddLeft, w: tr.filter((t) => t.pnl > 0).length };
}
async function renderAccts() {
  const all = await db.allTrades(), rows = await Promise.all(accts.map(async (a) => { const S = acctState(a, all), tr = S.tr, run = S.run, R = a.rules || {}, ddLeft = S.ddLeft, w = S.w, pnl = S.pnl;
    const st = S.blown ? ["Blown", "dn"] : S.passed ? ["Passed", "up"] : R.ptg && pnl >= R.ptg ? ["Target hit, consistency " + Math.round((100 * S.best) / pnl) + "%", ""] : ["Active", ""];
    return `<div class="acard ${acct && acct.id === a.id ? "on" : ""}" data-id="${a.id}"><div class="ah"><b>${a.name}</b><span class="pill ${st[1]}">${st[0]}</span></div>
      <div class="abig ${pnl >= 0 ? "pos-up" : "pos-dn"}">${money(run)}</div><div class="muted small">${pnl >= 0 ? "+" : ""}${money(pnl)} since start · ${tr.length} trades · ${tr.length ? Math.round((100 * w) / tr.length) : 0}% win</div>
      ${R.ptg ? `<div class="bar"><i style="width:${Math.max(0, Math.min(100, (100 * pnl) / R.ptg))}%"></i></div><div class="tiny muted">Profit target ${money(R.ptg)}</div>` : ""}
      <div class="kvs"><div><span>Drawdown left${R.eod ? " (end of day)" : ""}</span><b>${ddLeft == null ? "off" : money(ddLeft)}</b></div><div><span>Daily loss limit</span><b>${R.dll ? money(R.dll) : "none"}</b></div>${R.cons ? `<div><span>Best day vs total (max ${R.cons}%)</span><b>${pnl > 0 ? Math.round((100 * S.best) / pnl) + "%" : "—"}</b></div>` : ""}${R.maxMini ? `<div><span>Max size</span><b>${R.maxMini} minis / ${R.maxMini * 10} micros</b></div>` : ""}</div>
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

/* ---------------- themes (original palettes; candle colours stay yours) ---------------- */
const THEMES = { midnight: ["Midnight", { "--bg": "#08090c", "--panel": "#0e1116", "--acc": "#5ee6b8", "--acc2": "#7aa7ff", "--txt": "#e6eaf0", "--mut": "#8590a2", "--line": "rgba(255,255,255,.07)" }],
  grid: ["Neon grid", { "--bg": "#05070d", "--panel": "#0a0f1a", "--acc": "#38e8ff", "--acc2": "#ff3dce", "--txt": "#e9f4ff", "--mut": "#7f93ad", "--line": "rgba(56,232,255,.12)" }],
  ember: ["Ember", { "--bg": "#0d0907", "--panel": "#15100c", "--acc": "#ffb23d", "--acc2": "#ff6b4a", "--txt": "#f5ece4", "--mut": "#a8968a", "--line": "rgba(255,178,61,.10)" }],
  glacier: ["Glacier", { "--bg": "#070b10", "--panel": "#0d141c", "--acc": "#9fd8ff", "--acc2": "#c3b5ff", "--txt": "#e8f2fb", "--mut": "#8aa0b5", "--line": "rgba(159,216,255,.10)" }],
  mono: ["Mono", { "--bg": "#0a0a0a", "--panel": "#121212", "--acc": "#f2f2f2", "--acc2": "#9a9a9a", "--txt": "#ededed", "--mut": "#8a8a8a", "--line": "rgba(255,255,255,.08)" }] };
function applyTheme(k) { for (const [id, v] of Object.entries(prefs.myThemes || {})) THEMES[id] = v; const t = THEMES[k] || THEMES.midnight; for (const [v, c] of Object.entries(t[1])) document.documentElement.style.setProperty(v, c); prefs.theme = k in THEMES ? k : "midnight";
  if ($("s-themes")) $("s-themes").innerHTML = Object.entries(THEMES).map(([id, [nm, c]]) => `<button class="th ${id === prefs.theme ? "on" : ""}" data-th="${id}"><i style="background:${c["--bg"]};box-shadow:inset 0 0 0 1px ${c["--line"]}"><b style="background:${c["--acc"]}"></b><b style="background:${c["--acc2"]}"></b></i>${esc(nm)}</button>`).join(""); }

/* ---------------- quick trade review (rules followed? mistakes) ---------------- */
const MISTAKES = ["No setup", "Chased", "FOMO", "Early exit", "Moved stop", "Too big", "Revenge", "Fought the trend", "Ignored ES", "Off my hours"];
let revQ = [];
function reviewCard(t) { if (prefs.review === false || !t || !t.id) return; revQ.push(t); if (revQ.length === 1) showReview(); }
function showReview() { const t = revQ[0], el = $("review"); if (!t) return el.classList.add("hidden");
  el.innerHTML = `<div class="ah"><b>Rate that ${t.dir > 0 ? "long" : "short"} <span class="${t.pnl >= 0 ? "pos-up" : "pos-dn"}">${money(+t.pnl)}</span></b><button class="pb" id="rv-x" title="Skip">×</button></div>
    <div class="small">Did you follow your rules?</div><div class="row"><button data-ok="1" class="small">✅ Yes</button><button data-ok="0" class="small">❌ No</button></div>
    <div class="chips">${MISTAKES.map((m) => `<button class="chip" data-mk="${m}">${m}</button>`).join("")}</div><div class="row"><button id="rv-save" class="primary small">Save</button></div>`;
  el.classList.remove("hidden"); el.dataset.ok = ""; el.onclick = (e) => { const b = e.target.closest("button"); if (!b) return;
    if (b.id === "rv-x") { revQ.shift(); return showReview(); } if (b.dataset.ok != null) { el.dataset.ok = b.dataset.ok; el.querySelectorAll("[data-ok]").forEach((x) => x.classList.toggle("on", x === b)); }
    if (b.dataset.mk) b.classList.toggle("on");
    if (b.id === "rv-save") { const ch = { rules_ok: el.dataset.ok === "" ? null : el.dataset.ok === "1", mistakes: [...el.querySelectorAll(".chip.on")].map((x) => x.dataset.mk) }; Object.assign(t, ch); db.review(t.id, ch); if (ch.rules_ok) addXp(5); revQ.shift(); showReview(); } }; }

/* ---------------- mystery day (blind, random) + candle stepping ---------------- */
let blind = null;
async function mysteryDay() { if (pos.qty || orders.length) return toast("Close positions and cancel orders first");
  const a = Date.UTC(2021, 1, 1), z = Date.UTC(2026, 9, 30); let d; for (let i = 0; i < 50; i++) { d = new Date(a + Math.random() * (z - a)); const wd = d.getUTCDay(); if (wd >= 1 && wd <= 5 && !(d.getUTCMonth() === 11 && d.getUTCDate() >= 24) && !(d.getUTCMonth() === 0 && d.getUTCDate() <= 2)) break; }
  const day = d.toISOString().slice(0, 10); blind = { day }; $("start").value = day + "T08:30"; await loadReplay(); blindUI(); toast("🎲 Mystery day loaded. The date stays hidden until you press Reveal.");
}
function blindUI() { const on = !!blind; document.body.classList.toggle("blind", on); $("blindbtn").textContent = on ? "Reveal" : "🎲"; $("blindbtn").title = on ? "Show the date" : "Mystery day: a random day with the date hidden until you finish";
  panes.forEach((p) => p.chart.applyOptions({ timeScale: { tickMarkFormatter: on ? (t) => new Date(t * 1000).toISOString().slice(11, 16) : undefined }, localization: { timeFormatter: on ? (t) => new Date(t * 1000).toISOString().slice(11, 16) : undefined } })); refresh(); }
async function stepCandle() {   // play out one whole candle of the selected chart: stop when the next bar would start a new candle
  const p = panes[active]; if (!p || !p.candles.length) return stepFwd(); const base = p.sec < 60 ? B["15s"] : B["1m"];
  for (let n = 0; n < 3000; n++) { const g = await stepFwd(false); if (g === false) break; const nx = base.bars[base.i + 1]; if (!nx || bucket(loc(nx.t), p.sec) !== bucket(loc(nowT()), p.sec)) break; }
  rebuildAll(); }

/* ---------------- first-run tour + help ---------------- */
const TOUR = [["#start", "Pick a date and time (New York), then hit Load. Or press NY open / Asia open to jump there."], ["#tfbar", "Timeframes for the selected chart. Click a chart to select it; the grid button next to Indicators gives you 1 to 8 charts."],
  ["#tools", "Drawing tools. The long/short box is the star: place it, right-click, Arm, and it enters on its own with its stop and target. Right-click any tool to add it to your favorites bar."],
  ["#pad", "The Scalp Pad: buy, sell, join bid/ask. Drag it anywhere; right-click it for settings. Hot keys: B buy, S sell, X close, F flatten, C cancel, space play, ← → step."],
  ["#acctpill", "Accounts: make an eval or funded account with its own rules. Your trades, Stats, Learn (Reese log + quiz) and Friends live in the bar on the left."]];
let tourI = 0;
function tour(i = 0) { tourI = i; const t = TOUR[i]; if (!t) { $("tour").classList.add("hidden"); prefs.tourDone = true; savePrefs(); return; } view("trade");
  const el = document.querySelector(t[0]), r = el && el.getBoundingClientRect(); $("tour").classList.remove("hidden"); const hole = $("tourhole"), card = $("tourcard");
  if (r && r.width) { Object.assign(hole.style, { left: r.left - 6 + "px", top: r.top - 6 + "px", width: r.width + 12 + "px", height: r.height + 12 + "px" }); } else Object.assign(hole.style, { left: "50%", top: "50%", width: "0px", height: "0px" });
  const tall = r && r.height > 260, below = r && r.bottom + 180 < innerHeight;
  card.style.left = (tall ? Math.min(r.right + 14, innerWidth - 360) : Math.max(12, Math.min(r ? r.left : innerWidth / 2, innerWidth - 360))) + "px";
  card.style.top = (r ? (tall ? r.top + 40 : below ? r.bottom + 14 : Math.max(12, r.top - 170)) : innerHeight / 2) + "px";
  card.innerHTML = `<div class="tiny muted">${i + 1} of ${TOUR.length}</div><p>${t[1]}</p><div class="row"><button class="ghost small" id="tour-x">Skip</button><button class="primary small" id="tour-n">${i === TOUR.length - 1 ? "Done" : "Next"}</button></div>`;
  $("tour-n").onclick = () => tour(i + 1); $("tour-x").onclick = () => tour(99); }
function helpDlg() { const K = prefs.keys, rows = [["Play / pause", "Space"], ["Step forward / back", "→ / ←"], ["Buy / sell market", (K.buy + " / " + K.sell).toUpperCase()], ["Join bid / ask", (K.joinbid + " / " + K.joinask).toUpperCase()], ["Close / reverse", (K.close + " / " + K.reverse).toUpperCase()], ["Flatten / cancel all", (K.flatten + " / " + K.cancel).toUpperCase()],
    ["Trend / h-line / v-line / zone", (K.trend + " / " + K.hline + " / " + K.vline + " / " + K.rect).toUpperCase()], ["Long / short box", (K.long + " / " + K.short).toUpperCase()], ["Measure", K.measure.toUpperCase()], ["Cancel tool / deselect", "Esc"], ["Delete drawing", "Del"]];
  dlg(`<h3>Help</h3><table class="bt">${rows.map(([a, b]) => `<tr><td>${a}</td><td><kbd>${b}</kbd></td></tr>`).join("")}</table><p class="tiny muted">Change hot keys in Settings. Right-click the chart, an order line, a drawing or the Scalp Pad for more options.</p>`, () => tour(0));
  const ok = $("dl-ok"); if (ok) ok.textContent = "Show the tour"; }

/* ---------------- Utah prop firm tax estimate (2026 figures; estimate only) ---------------- */
const TAX26 = { s: { sd: 16100, br: [[12400, .10], [50400, .12], [105700, .22], [201775, .24], [256225, .32], [640600, .35], [Infinity, .37]] }, mfj: { sd: 32200, br: [[24800, .10], [100800, .12], [211400, .22], [403550, .24], [512450, .32], [768700, .35], [Infinity, .37]] }, ssBase: 184500, ut: 0.0445 };
function fedTax(ti, st) { let t = 0, lo = 0; for (const [hi, r] of TAX26[st].br) { if (ti > lo) t += (Math.min(ti, hi) - lo) * r; lo = hi; } return t; }
function taxCalc() { const st = $("tx-st").value, pay = +$("tx-pay").value || 0, exp = +$("tx-exp").value || 0, w2 = +$("tx-w2").value || 0, wh = +$("tx-wh").value || 0;
  const prof = Math.max(0, pay - exp), se = prof * 0.9235, ss = Math.min(se, Math.max(0, TAX26.ssBase - w2)) * 0.124, med = se * 0.029, seTax = prof > 400 ? ss + med : 0;
  const agi = w2 + prof - seTax / 2, ti = Math.max(0, agi - TAX26[st].sd), fed = fedTax(ti, st), fedW2 = fedTax(Math.max(0, w2 - TAX26[st].sd), st), ut = agi * TAX26.ut;
  const total = fed + seTax + ut, fromTrading = total - fedW2 - w2 * TAX26.ut, setAside = prof ? fromTrading / prof : 0, owe = Math.max(0, total - wh);
  $("tx-out").innerHTML = [["Trading profit", money(prof)], ["Self-employment tax", money(seTax)], ["Federal income tax", money(fed)], ["Utah income tax (before credits)", money(ut)], ["Total tax", money(total)], ["Still to pay (after withholding)", money(owe)], ["Set aside from each payout", prof ? Math.round(setAside * 100) + "%" : "—"], ["Quarterly payment (Apr 15, Jun 15, Sep 15, Jan 15)", money(owe / 4)]]
    .map(([k, v]) => `<div><span class="muted small">${k}</span><b>${v}</b></div>`).join(""); }

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
  const rs2 = tr.filter((t) => t.r != null).map((t) => +t.r), bins = [[-9, -1.5], [-1.5, -0.75], [-0.75, -0.25], [-0.25, 0.25], [0.25, 1], [1, 2], [2, 3], [3, 99]], lab = ["≤-1.5R", "-1R", "-0.5R", "~0", "+0.5R", "+1.5R", "+2.5R", "3R+"];
  const cnt = bins.map(([a, b]) => rs2.filter((r) => r > a && r <= b).length), mxc = Math.max(1, ...cnt);
  $("st-rd").innerHTML = rs2.length ? `<div class="rbars">${cnt.map((c, i) => `<div><i style="height:${Math.round((80 * c) / mxc)}px" class="${i < 3 ? "dn" : i > 3 ? "up" : ""}"></i><b>${c}</b><span>${lab[i]}</span></div>`).join("")}</div>` : '<div class="empty">No trades with R yet</div>';
  $("st-rule").innerHTML = table(grp((t) => (t.rules_ok === true ? "Followed rules" : t.rules_ok === false ? "Broke rules" : "Not rated")), ["Followed rules", "Broke rules", "Not rated"]);
  const after = []; for (let i = 1; i < tr.length; i++) { const a = tr[i - 1], b = tr[i]; if (a.pnl < 0 && b.t_entry - a.t_exit < 600) after.push(b); }
  const sizeUp = tr.filter((t, i) => i && tr[i - 1].pnl < 0 && t.qty > tr[i - 1].qty).length, aw = after.filter((t) => t.pnl > 0).length;
  $("st-tilt").innerHTML = `<div class="kvs"><div><span>Re-entries within 10 min of a loss</span><b>${after.length}${after.length ? " · " + Math.round((100 * aw) / after.length) + "% win · " + money(sum(after)) : ""}</b></div><div><span>Size went up right after a loss</span><b>${sizeUp}</b></div></div>` + table(grp((t) => (t.mistakes && t.mistakes.length ? t.mistakes : [])));
  if (!stC) { stC = LightweightCharts.createChart($("st-eq"), { autoSize: true, layout: { background: { type: "solid", color: "transparent" }, textColor: "#7f8a9c", fontFamily: "Geist Mono, monospace" }, grid: { vertLines: { visible: false }, horzLines: { color: "rgba(255,255,255,.04)" } }, rightPriceScale: { borderVisible: false }, timeScale: { borderVisible: false } }); stC.s = stC.addAreaSeries({ lineColor: "#5ee6b8", topColor: "rgba(94,230,184,.25)", bottomColor: "rgba(94,230,184,0)", lineWidth: 2 }); }
  const seen = new Set(); stC.s.setData(eq.filter((p) => (seen.has(p.time) ? false : seen.add(p.time)))); stC.timeScale().fitContent();
}

/* ---------------- learn: Reese log, quiz, course, earn an eval, time tracking ---------------- */
let reese = [], quizBank = [], QZ = null;
const RSES = { NY: ["08:30", "16:00", 0], Asia: ["19:30", "24:00", 0], London: ["02:00", "08:30", 0], Evening: ["17:30", "24:00", 0] };
async function loadReese() { if (DEMO) { reese = [{ id: "r1", day: "2026-10-15", session: "NY", symbol: "NQ", dir: 1, entry: 21420, exit: 21470, result: "win", summary: "Demo entry: 15s long after the 9:30 sweep, out at the 1h level.", quotes: ["ltf beating htf"] }]; return; }
  const { data } = await sb.from("reese_trades").select("*").order("day"); reese = data || []; }
const seen = () => new Set(prefs.seenSess || []);
function sessEnd(r) { const [, z] = RSES[r.session] || RSES.NY; const base = Date.parse(r.day + "T00:00:00Z") / 1000, [hh, mm] = z.split(":").map(Number); return base + hh * 3600 + mm * 60; }   // New York wall-clock as fake-UTC (same as loc())
function reeseCheck(prevLt, curLt) {   // called while stepping: a Reese session just ended on the replay clock
  for (const r of reese) { const e = sessEnd(r); if (prevLt < e && curLt >= e) { const k = r.day + "|" + r.session, sn = seen(); if (!sn.has(k)) { sn.add(k); prefs.seenSess = [...sn]; savePrefs(); } reesePop(r); } } }

/* Reese media: his Discord screenshots + what he said during that session (members-only bucket) */
function reeseMedia(r, open) { const sh = r.shots || [], nt = r.notes || []; if (!sh.length && !nt.length) return "";
  return `<details class="rmedia" ${open ? "open" : ""}><summary>📸 His screenshots${nt.length ? " + what he said live" : ""}</summary>
    ${sh.length ? `<div class="rshots">${sh.map((p) => `<a target="_blank" rel="noopener" data-rp="${esc(p)}"><img alt="Reese screenshot" data-rp="${esc(p)}"></a>`).join("")}</div>` : ""}
    ${nt.length ? `<div class="rnotes">${nt.map((n) => `<div><span class="muted">${esc(n.t)}</span> ${esc(n.x)}</div>`).join("")}</div>` : ""}</details>`; }
const rpCache = {};
async function fillReeseShots(root) { const els = [...root.querySelectorAll("[data-rp]")]; if (!els.length || DEMO) return; const need = [...new Set(els.map((e) => e.dataset.rp))].filter((p) => !rpCache[p]);
  if (need.length) { const { data } = await sb.storage.from("reese").createSignedUrls(need, 3600); (data || []).forEach((d, i) => { if (d.signedUrl) rpCache[need[i]] = d.signedUrl; }); }
  els.forEach((e) => { const u = rpCache[e.dataset.rp]; if (!u) return; if (e.tagName === "IMG") e.src = u; else e.href = u; }); }
function reesePop(r) {
  const st = sessEnd(r) - (r.session === "NY" ? 7.5 * 3600 : 4.5 * 3600), mine = hist.filter((t) => loc(t.t_entry) >= st && loc(t.t_entry) < sessEnd(r) && (t.symbol === r.symbol || t.symbol.replace("M", "") === r.symbol.replace("M", "")));
  let verdict = "", xp = 0; if (r.dir) { const same = mine.filter((t) => t.dir === r.dir), opp = mine.filter((t) => t.dir === -r.dir);
    if (same.length) { verdict = "✅ You took the same side as Reese."; xp = 50; } else if (opp.length) { verdict = "↔️ You traded the other way."; xp = 10; } else { verdict = r.result === "win" ? "👀 You sat out a session he won. Look at what he saw." : "🧘 You sat out. He " + (r.result === "loss" ? "took a loss here." : "didn't make much."); xp = r.result === "loss" ? 25 : 0; } }
  else if (r.result === "journal") verdict = "📸 Here's what Reese posted live this session. Compare it to what you saw.";
  else verdict = "📋 No trade from him here, just his plan. Did yours match?";
  if (xp) addXp(xp);
  dlg(`<h3>Reese ${r.dir ? "traded" : r.result === "journal" ? "posted" : "planned"} this session</h3><div class="muted small">${r.day} · ${r.session} · ${r.symbol}</div>
    ${r.dir ? `<div class="shrow"><span class="${r.dir > 0 ? "pos-up" : "pos-dn"}">${r.dir > 0 ? "Long" : "Short"}</span>${r.entry ? " @ " + px2(+r.entry) : ""}${r.exit ? " → " + px2(+r.exit) : ""} · <b>${r.result}</b></div>` : ""}
    <p class="small">${esc(r.summary)}</p>${(r.quotes || []).length ? `<div class="quotes">${r.quotes.slice(0, 4).map((q) => `<div>“${esc(q)}”</div>`).join("")}</div>` : ""}
    ${reeseMedia(r, true)}${r.video_url ? `<p><a href="${esc(r.video_url)}" target="_blank" rel="noopener">Watch his recap ↗</a></p>` : ""}
    <div class="riskcard">${verdict}${xp ? ` <b>+${xp} XP</b>` : ""}<br>Your trades this session: ${mine.length ? mine.map((t) => `${t.dir > 0 ? "long" : "short"} ${money(+t.pnl)}`).join(", ") : "none"}</div>`, () => {
    if (r.entry && panes[0]) { const t0 = sessEnd(r) - 3 * 3600; drawings.push({ id: did++, type: "hline", pane: 0, a: { t: t0, p: +r.entry }, label: "Reese entry" }); if (r.exit) drawings.push({ id: did++, type: "hline", pane: 0, a: { t: t0, p: +r.exit }, label: "Reese exit" }); repaintAll(); } });
  const ok = $("dl-ok"); if (ok) ok.textContent = r.entry ? "Show his levels" : "OK"; fillReeseShots($("dlgbox")); }
function addXp(n) { prefs.xp = (prefs.xp || 0) + n; prefs.credits = (prefs.credits || 0) + Math.round(n / 5); savePrefs(); xpUI(); }
function xpUI() { const x = prefs.xp || 0, lv = Math.floor(Math.sqrt(x / 50)) + 1, nx = 50 * lv * lv, pv = 50 * (lv - 1) * (lv - 1); $("xpbar").innerHTML = `Level <b>${lv}</b> <i class="xpb"><i style="width:${Math.round((100 * (x - pv)) / (nx - pv))}%"></i></i> ${x} XP · ${prefs.credits || 0} credits`; }
function ltab(k) { document.querySelectorAll("#ltabs button").forEach((b) => b.classList.toggle("on", b.dataset.l === k)); ["rl", "qz", "co", "ev"].forEach((x) => $("l-" + x).classList.toggle("hidden", x !== k)); xpUI(); ({ rl: renderRL, qz: qzStats, co: renderCourse, ev: renderEv })[k](); }
async function renderRL() { if (!reese.length) await loadReese(); const sn = seen(), hide = $("rl-spoil").checked;
  $("rl-list").innerHTML = reese.slice().reverse().map((r) => { const done = sn.has(r.day + "|" + r.session), sp = hide && !done;   // everything (trades, plans, his screenshots) unlocks after you replay that session
    return `<div class="card rc"><div class="ah"><b>${r.day} · ${r.session}</b><span class="pill ${sp ? "" : r.result === "win" ? "up" : r.result === "loss" ? "dn" : ""}">${sp ? "hidden" : r.result}</span></div>
      ${sp ? '<p class="small muted">Replay this session first. The result unlocks when you finish it.</p>' : `${r.dir ? `<div class="shrow"><span class="${r.dir > 0 ? "pos-up" : "pos-dn"}">${r.dir > 0 ? "Long" : "Short"} ${r.symbol}</span>${r.entry ? " @ " + px2(+r.entry) : ""}${r.exit ? " → " + px2(+r.exit) : ""}</div>` : ""}<p class="small">${esc(r.summary)}</p>${(r.quotes || []).slice(0, 2).map((q) => `<div class="small rnote">“${esc(q)}”</div>`).join("")}${reeseMedia(r)}`}
      <div class="row" style="justify-content:flex-start"><button class="small primary" data-rday="${r.id}">Replay this session</button></div></div>`; }).join("") || '<div class="empty">No Reese trades loaded</div>'; $("rl-list").querySelectorAll("details.rmedia").forEach((d) => (d.ontoggle = () => d.open && fillReeseShots(d))); }
async function replayReese(r) { if (pos.qty || orders.length) return toast("Close positions and cancel orders first"); const [a] = RSES[r.session] || RSES.NY; $("sym").value = r.symbol; $("start").value = r.day + "T" + a; view("trade"); await loadReplay(); }
// ---- quiz: "Taking dis? or fade it?"
async function loadQuiz() { if (quizBank.length) return; if (DEMO) { quizBank = []; return; } const { data } = await sb.from("quiz_setups").select("*").limit(2000); quizBank = data || [];
  if (!quizBank.length) try { quizBank = await (await fetch("quiz.json", { cache: "no-store" })).json(); } catch (e) {} }   // bank of real model setups (prices and times only), ships with the app
function qzStats() { const q = prefs.quiz || { n: 0, right: 0, streak: 0, best: 0 }; $("qz-stats").innerHTML = [["Answered", q.n], ["Right", q.n ? Math.round((100 * q.right) / q.n) + "%" : "—"], ["Streak", q.streak], ["Best streak", q.best]].map(([k, v]) => `<div><span class="muted small">${k}</span><b>${v}</b></div>`).join(""); }
async function quizNext() {
  if (pos.qty || orders.length) return toast("Close positions and cancel orders first"); await loadQuiz();
  let it = quizBank.length ? quizBank[Math.floor(Math.random() * quizBank.length)] : null;
  if (!it && DEMO) { await loadReplay(); for (let i = 0; i < 40; i++) await stepFwd(); const lp = last(); it = { symbol: "NQ", t_entry: nowT() + 60, dir: 1, entry: rnd(lp - 4), stop: rnd(lp - 16), target: rnd(lp + 26), outcome: "win", why: ["10AM manipulation", "SWEPT LIQUIDITY", "5M CLOSE BACK"] }; }
  if (!it) return toast("No quiz setups yet");
  QZ = { it, answered: false }; view("trade"); $("sym").value = it.symbol; $("start").value = fmt(loc(it.t_entry)).replace(" ", "T"); if (!DEMO || !B["1m"].bars.length) await loadReplay();
  drawings = drawings.filter((d) => !d.quiz); const d = { id: did++, type: it.dir > 0 ? "long" : "short", side: it.dir, pane: active, a: { t: loc(it.t_entry), p: +it.entry }, b: { t: loc(it.t_entry) + 90 * 60, p: +it.entry }, entry: +it.entry, sl: +it.stop, tp: +it.target, state: "idle", quiz: true }; drawings.push(d);
  const rr = Math.abs(it.target - it.entry) / Math.abs(it.entry - it.stop);
  $("qz-desc").innerHTML = `${it.dir > 0 ? "Long" : "Short"} ${it.symbol} @ <b>${px2(+it.entry)}</b> · stop ${px2(+it.stop)} · target ${px2(+it.target)} · ${rr.toFixed(1)}R`; $("qzbar").classList.remove("hidden"); $("qz-res").classList.add("hidden"); $("qz-next").classList.add("hidden"); ["qz-take", "qz-fade"].forEach((k) => ($(k).disabled = false));
  panes.forEach((p) => p.chart.timeScale().scrollToRealTime()); repaintAll(); }
async function quizAnswer(take) { if (!QZ || QZ.answered) return; QZ.answered = true; ["qz-take", "qz-fade"].forEach((k) => ($(k).disabled = true)); const it = QZ.it, right = (it.outcome === "win") === take;
  const q = prefs.quiz || { n: 0, right: 0, streak: 0, best: 0 }; q.n++; if (right) { q.right++; q.streak++; q.best = Math.max(q.best, q.streak); } else q.streak = 0; prefs.quiz = q; addXp(right ? 10 : 2); if (right) prefs.credits = (prefs.credits || 0) + 8; savePrefs();
  const end = it.t_exit || it.t_entry + 3600; for (let n = 0; n < 900 && nowT() < end + 600; n++) { const g = await stepFwd(false); if (g === false) break; } rebuildAll(); panes.forEach((p) => p.chart.timeScale().scrollToRealTime());
  sfx(right ? "win" : "loss"); $("qz-res").innerHTML = `<b class="${right ? "pos-up" : "pos-dn"}">${right ? "Right!" : "Not this time."}</b> It ${it.outcome === "win" ? "hit the target" : "hit the stop"}${it.r != null ? " (" + it.r + "R)" : ""}.<div class="tiny muted">Why it set up: ${(it.why || []).map(esc).join(" · ")}</div>${right ? '<div class="tiny">+10 XP, +8 credits</div>' : ""}`;
  $("qz-res").classList.remove("hidden"); $("qz-next").classList.remove("hidden"); }
function quizStop() { QZ = null; $("qzbar").classList.add("hidden"); drawings = drawings.filter((d) => !d.quiz); repaintAll(); }
// ---- course
const LESSONS = [["Sessions and times", "Which windows he trades (NY 9:30, the 10:00 open, Asia 8pm) and when he stays out."], ["Bias", "How he picks a direction from the higher timeframe range: premium vs discount, conditions, draws on liquidity."], ["Setup checklist", "His order: condition → manipulation into a level → SMT → displacement → entry gap."],
  ["Entry", "Inversion and respected gaps on the 15s-1m, entering off displacement, OTE 0.705-0.79."], ["Stop and targets", "Stop past the manipulation leg, 1:1 marked, partials and break-even, trailing to the next level."], ["When he skips", "No obvious draw, fighting ES, low conviction, structure that trades into a range before inversion."]];
function renderCourse() { const done = new Set(prefs.lessons || []);
  $("co-lessons").innerHTML = LESSONS.map(([t, d], i) => `<div class="card lc ${done.has(i) ? "done" : ""}"><div class="ah"><b>${i + 1}. ${t}</b>${done.has(i) ? '<span class="pill up">done</span>' : ""}</div><p class="small muted">${d}</p><button class="small ${done.has(i) ? "ghost" : "primary"}" data-les="${i}">${done.has(i) ? "Read again" : "Read + mark done (+20 XP)"}</button></div>`).join("");
  const wk = {}; reese.filter((r) => r.dir).forEach((r) => { const d = new Date(r.day + "T12:00:00Z"), mon = new Date(d - ((d.getUTCDay() + 6) % 7) * 864e5).toISOString().slice(0, 10); (wk[mon] = wk[mon] || []).push(r); });
  $("co-weeks").innerHTML = Object.entries(wk).sort().reverse().map(([m, rs]) => `<div class="card"><div class="ah"><b>Week of ${m}</b><span class="muted tiny">${rs.length} Reese trade${rs.length > 1 ? "s" : ""}</span></div><p class="small muted">Trade it your way. After each session he traded, you'll see his trade next to yours and earn XP for matching his read.</p><button class="small primary" data-wk="${m}">Start this week</button></div>`).join(""); }
function lessonDlg(i) { dlg(`<h3>${LESSONS[i][0]}</h3><p class="small">${LESSONS[i][1]}</p><p class="tiny muted">The full write-up lives in your playbook notes. Finish this lesson, then try a guided week to practice it.</p>`, () => { const s = new Set(prefs.lessons || []); if (!s.has(i)) { s.add(i); prefs.lessons = [...s]; addXp(20); prefs.credits = (prefs.credits || 0) + 20; savePrefs(); } renderCourse(); }); const ok = $("dl-ok"); if (ok) ok.textContent = "Mark done"; }
// ---- earn an eval
function renderEv() { $("ev-cr").textContent = (prefs.credits || 0) + " credits";
  $("ev-list").innerHTML = Object.entries(LUCID).map(([k, [nm, bal, R, cost]]) => `<div class="card"><div class="ah"><b>${nm}</b><span class="pill">${cost} credits</span></div><div class="kvs"><div><span>Profit target</span><b>${money(R.ptg)}</b></div><div><span>Max loss (end of day, trailing)</span><b>${money(R.mdd)}</b></div><div><span>Consistency</span><b>best day ≤ ${R.cons}%</b></div><div><span>Max size</span><b>${R.maxMini} minis</b></div></div><button class="small ${(prefs.credits || 0) >= cost ? "primary" : "ghost"}" data-buy="${k}">${(prefs.credits || 0) >= cost ? "Get this eval" : "Need " + (cost - (prefs.credits || 0)) + " more"}</button></div>`).join(""); }
async function buyEval(k) { const [nm, bal, R, cost] = LUCID[k]; if ((prefs.credits || 0) < cost) { ltab("qz"); return toast("Answer quiz questions to earn " + (cost - (prefs.credits || 0)) + " more credits"); }
  prefs.credits -= cost; savePrefs(); const n = await db.newAccount({ name: nm + " #" + (accts.filter((a) => a.name.startsWith(nm)).length + 1), kind: "eval", start_bal: bal, rules: R }); accts.push(n); pickAcct(n.id); renderEv(); toast(nm + " ready and selected. Good luck."); sfx("win"); }
// ---- time tracking (active replay time, saved on the session)
let actSecs = 0, lastAct = Date.now();
["pointerdown", "keydown", "wheel"].forEach((ev) => addEventListener(ev, () => (lastAct = Date.now()), { passive: true }));
setInterval(() => { if (!sess || document.visibilityState !== "visible" || $("v-trade").classList.contains("hidden")) return; if (timer || Date.now() - lastAct < 90000) { actSecs++; sess.active_secs = (sess.active_secs || 0) + 1; if (actSecs % 60 === 0 && !DEMO) sb.from("sessions").update({ active_secs: sess.active_secs }).eq("id", sess.id).then(() => {}); } }, 1000);

/* ---------------- media: Spotify, see-through YouTube overlay, video library ---------------- */
function spEmbed(u) { const m = String(u).match(/open\.spotify\.com\/(?:intl-[a-z]+\/)?(playlist|album|track|episode|show|artist)\/([A-Za-z0-9]+)/); return m ? `https://open.spotify.com/embed/${m[1]}/${m[2]}?utm_source=generator&theme=0` : null; }
function ytEmbed(u) { const m = String(u).match(/(?:youtu\.be\/|v=|embed\/|shorts\/|live\/)([A-Za-z0-9_-]{11})/); return m ? `https://www.youtube-nocookie.com/embed/${m[1]}?autoplay=1&rel=0` : null; }
function mediaUI() { const M = prefs.media || (prefs.media = { show: false, tab: "sp", op: 100, ct: false }); $("media").classList.toggle("hidden", !M.show); $("mediabtn").classList.toggle("on", !!M.show);
  document.querySelectorAll(".mt button").forEach((b) => b.classList.toggle("on", b.dataset.m === M.tab)); ["sp", "yt", "lib"].forEach((k) => $("m-" + k).classList.toggle("hidden", k !== M.tab));
  $("media").style.opacity = (M.op || 100) / 100; $("m-op").value = M.op || 100; $("m-ct").classList.toggle("on", !!M.ct); $("media").classList.toggle("thru", !!M.ct);
  if (M.x != null) { $("media").style.left = Math.min(M.x, innerWidth - 120) + "px"; $("media").style.top = Math.min(M.y, innerHeight - 60) + "px"; }
  if (M.sp && !$("sp-frame").innerHTML) setSp(M.sp, false); if (M.tab === "lib") renderLib(); }
function setSp(u, save = true) { const e = spEmbed(u); if (!e) return toast("That doesn't look like a Spotify link"); $("sp-url").value = u; $("sp-frame").innerHTML = `<iframe src="${e}" width="100%" height="232" frameborder="0" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy"></iframe>`; if (save) { prefs.media.sp = u; savePrefs(); } }
function setYt(u) { const e = ytEmbed(u); if (!e) return toast("That doesn't look like a YouTube link"); $("yt-url").value = u; $("yt-frame").innerHTML = `<iframe src="${e}" width="100%" height="236" frameborder="0" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>`; prefs.media.tab = "yt"; savePrefs(); mediaUI(); }
function renderLib() { const mine = prefs.vids || [], rv = reese.filter((r) => r.video_url).map((r) => ({ name: "Reese · " + r.day + " " + r.session, url: r.video_url }));
  $("lib-list").innerHTML = [...rv, ...mine].map((v, i) => `<div class="libr"><button class="small ghost" data-yt="${esc(v.url)}">▶</button><span>${esc(v.name || v.url)}</span>${i >= rv.length ? `<button class="pb" data-libdel="${i - rv.length}">×</button>` : ""}</div>`).join("") || '<div class="tiny muted">No videos yet. Add Reese recaps or any lesson you want next to the chart.</div>'; }

/* ---------------- friends: leaderboard, challenges, shared trades, suggestions, chat ---------------- */
let me = null, names = {}, chatSub = null, chatSeen = +(localStorage.getItem("rw-chat-seen") || 0);
const esc = (x) => String(x ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const ago = (iso) => { const s = (Date.now() - Date.parse(iso)) / 1000; return s < 60 ? "now" : s < 3600 ? Math.floor(s / 60) + "m" : s < 86400 ? Math.floor(s / 3600) + "h" : Math.floor(s / 86400) + "d"; };
async function loadMe() {
  if (DEMO) { me = { user_id: "demo", name: "You", share_stats: true }; names = { demo: "You", b: "Ben", w: "Will" }; return; }
  const { data } = await sb.from("profiles").select("*"); (data || []).forEach((p) => (names[p.user_id] = p.name || "trader")); me = (data || []).find((p) => p.user_id === user.id);
  if (!me) { const nm = (user.email || "me").split("@")[0].replace(/[0-9_.]+$/, "") || "me"; const r = await sb.from("profiles").insert({ name: nm }).select().single(); me = r.data || { user_id: user.id, name: nm, share_stats: true }; names[user.id] = me.name; }
  else sb.from("profiles").update({ seen_at: new Date().toISOString() }).eq("user_id", user.id).then(() => {});
}
function ftab(k) { document.querySelectorAll("#ftabs button").forEach((b) => b.classList.toggle("on", b.dataset.f === k)); ["lv", "lb", "ch", "sh", "sg"].forEach((x) => $("f-" + x).classList.toggle("hidden", x !== k)); ({ lv: renderLive, lb: renderLB, ch: renderCh, sh: renderSh, sg: renderSg })[k](); }
// ---- live sessions (Realtime presence + invites), like a game lobby
let liveCh = null, live = {}, room = null, roomSub = null;
function myLive() { const dayP = dayRpl(); return { name: (me && me.name) || "me", room: room && room.id, sym, start: sess ? sess.start_ts : null, t: nowT() || null, pnl: Math.round(hist.reduce((a, t) => a + (+t.pnl || 0), 0)), day: Math.round(dayP), n: hist.length, playing: !!timer, done: !!(room && room.done), at: Date.now() }; }
function initLive() {
  if (DEMO) { live = { b: [{ name: "Ben", sym: "NQ", t: Date.parse("2026-10-14T14:20:00Z") / 1000, pnl: 340, n: 2, playing: true }], w: [{ name: "Will", sym: "ES", t: Date.parse("2026-09-02T13:55:00Z") / 1000, pnl: -120, n: 1, playing: false }] }; return; }
  liveCh = sb.channel("live", { config: { presence: { key: user.id }, broadcast: { self: false } } });
  liveCh.on("presence", { event: "sync" }, () => { live = liveCh.presenceState(); delete live[user.id]; livePill(); if (!$("f-lv").classList.contains("hidden") && !$("v-friends").classList.contains("hidden")) renderLive(); })
    .on("broadcast", { event: "invite" }, ({ payload: p }) => { if (p.to !== user.id) return; sfx("fill"); buzz(40);
      dlg(`<h3>${esc(p.fromName)} invited you</h3><p class="small">Replay <b>${esc(p.sym)}</b> from <b>${fmt(loc(p.start))} New York</b> together. You each trade at your own pace and compare at the end.</p>`, () => joinRoom({ id: p.room, host: p.from, sym: p.sym, start: p.start })); const ok = $("dl-ok"); if (ok) ok.textContent = "Join"; })
    .subscribe((st) => { if (st === "SUBSCRIBED") liveCh.track(myLive()); });
  setInterval(() => { if (liveCh) liveCh.track(myLive()); }, 15000);
}
function livePill() { if (!room) return $("livepill").classList.add("hidden"); const mates = Object.values(live).map((x) => x[0]).filter((x) => x.room === room.id), going = mates.filter((x) => !x.done);
  $("livepill").classList.remove("hidden"); $("livepill").innerHTML = `<i></i> ${mates.length ? going.length + " of " + mates.length + " still trading" : "waiting for friends"}`; }
async function renderLive() { const rows = Object.entries(live).map(([id, xs]) => ({ id, ...xs[0] })).filter((x) => x.at == null || Date.now() - x.at < 120000 || DEMO);
  $("lv-list").innerHTML = rows.map((x) => `<div class="card lvc"><div class="ah"><b><i class="ldot ${x.playing ? "on" : ""}"></i> ${esc(x.name)}</b><span class="muted tiny">${x.done ? "done for the day" : x.playing ? "playing" : x.t ? "paused" : "in the app"}</span></div>
    <div class="shrow">${x.t ? `${esc(x.sym)} · ${fmt(loc(x.t))} NY` : "no replay loaded"}</div>${x.t ? `<div class="small">${x.n} trade${x.n === 1 ? "" : "s"} · <b class="${x.pnl >= 0 ? "pos-up" : "pos-dn"}">${money(x.pnl)}</b>${x.room && room && x.room === room.id ? ' · <span class="pill up">in your session</span>' : ""}</div>` : ""}
    <div class="row" style="justify-content:flex-start"><button class="small primary" data-inv="${x.id}">Invite to my replay</button></div></div>`).join("") || '<div class="empty">Nobody else is in Rewind right now.</div>';
  if (room) { const mates = rows.filter((x) => x.room === room.id); $("lv-room").classList.remove("hidden");
    $("lv-room").innerHTML = `<div class="ah"><b>Your live session · ${esc(room.sym)} from ${fmt(loc(room.start))} NY</b><span><button class="small ${room.done ? "ghost" : "primary"}" id="lv-done">${room.done ? "Back to trading" : "I'm done for the day"}</button> <button class="small ghost" id="lv-leave">Leave</button></span></div>
      <table class="bt"><tr><th>Trader</th><th>Status</th><th>Replay time</th><th>Trades</th><th>P&amp;L</th></tr>${[{ name: (me && me.name) || "me", ...myLive() }, ...mates].map((x) => `<tr><td>${esc(x.name)}</td><td>${x.done ? "done" : "trading"}</td><td>${x.t ? fmt(loc(x.t)).slice(5) : "—"}</td><td>${x.n}</td><td class="${x.pnl >= 0 ? "pos-up" : "pos-dn"}">${money(x.pnl)}</td></tr>`).join("")}</table>
      <div class="sub" style="margin:10px 0 4px">Shared notes</div><div class="fch-list roomnotes" id="rn-list"></div><div class="fch-in"><input id="rn-in" placeholder="What did you see? What would you do differently?"><button id="rn-send" class="primary small">Add</button></div>`;
    $("lv-done").onclick = () => { room.done = !room.done; if (liveCh) liveCh.track(myLive()); renderLive(); }; $("lv-leave").onclick = () => { room = null; if (roomSub) sb.removeChannel(roomSub), (roomSub = null); if (liveCh) liveCh.track(myLive()); livePill(); renderLive(); };
    $("rn-send").onclick = sendRoomNote; $("rn-in").onkeydown = (e) => { if (e.key === "Enter") sendRoomNote(); }; loadRoomNotes(); } else $("lv-room").classList.add("hidden"); }
async function loadRoomNotes() { if (!room || !$("rn-list")) return; let list = []; if (DEMO) list = mem.rn || []; else { const { data } = await sb.from("messages").select("*").eq("room", "room:" + room.id).order("created_at").limit(200); list = data || [];
    if (!roomSub) roomSub = sb.channel("rn:" + room.id).on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: "room=eq.room:" + room.id }, () => loadRoomNotes()).subscribe(); }
  $("rn-list").innerHTML = list.map(chatRow).join("") || '<div class="tiny muted">No notes yet.</div>'; }
async function sendRoomNote() { const b = $("rn-in").value.trim(); if (!b || !room) return; $("rn-in").value = ""; if (DEMO) { (mem.rn = mem.rn || []).push({ id: Date.now(), user_id: "demo", body: b, created_at: new Date().toISOString() }); return loadRoomNotes(); } await sb.from("messages").insert({ room: "room:" + room.id, body: b }); loadRoomNotes(); }
async function invite(uid) { if (!nowT() || !sess) return toast("Load a replay first, then invite");
  if (!room) room = { id: (me ? me.user_id.slice(0, 8) : "me") + "-" + sess.start_ts, host: me && me.user_id, sym, start: sess.start_ts };
  if (liveCh) { liveCh.send({ type: "broadcast", event: "invite", payload: { to: uid, from: user.id, fromName: (me && me.name) || "a friend", room: room.id, sym: room.sym, start: room.start } }); liveCh.track(myLive()); }
  toast("Invite sent to " + ((live[uid] && live[uid][0].name) || "your friend")); livePill(); renderLive(); }
async function joinRoom(r) { if (pos.qty || orders.length) return toast("Close positions and cancel orders first"); room = r; $("sym").value = r.sym; $("start").value = fmt(loc(r.start) + 60).replace(" ", "T"); view("trade"); await loadReplay(); if (liveCh) liveCh.track(myLive()); livePill(); }
async function lbRows(t0, t1, sy) { if (DEMO) return [{ user_id: "demo", name: "You", trades: mem.trades.length, wins: mem.trades.filter((t) => t.pnl > 0).length, net: mem.trades.reduce((a, t) => a + t.pnl, 0), avg_r: 0.4, best: 406 }, { user_id: "b", name: "Ben", trades: 9, wins: 5, net: 820, avg_r: 0.6, best: 640 }];
  const { data, error } = await sb.rpc("leaderboard", { t0, t1, sym: sy || null }); if (error) toast(error.message); return data || []; }
function lbTable(rows) { if (!rows.length) return '<div class="empty">No trades in this range yet</div>'; const medal = ["🥇", "🥈", "🥉"];
  return `<table class="bt lb"><tr><th></th><th>Trader</th><th>Trades</th><th>Win</th><th>Avg R</th><th>Best trade</th><th>Net</th></tr>${rows.map((r, i) => `<tr class="${me && r.user_id === me.user_id ? "mine" : ""}"><td>${medal[i] || i + 1}</td><td>${esc(r.name)}</td><td>${r.trades}</td><td>${r.trades ? Math.round((100 * r.wins) / r.trades) : 0}%</td><td>${r.avg_r ?? "—"}</td><td>${money(+r.best || 0)}</td><td class="${+r.net >= 0 ? "pos-up" : "pos-dn"}">${money(+r.net)}</td></tr>`).join("")}</table>`; }
async function renderLB() { const D = +$("lb-range").value, now = Math.floor(Date.now() / 1000); let t0 = 0, t1 = 9999999999;
  if (D) { const all = await db.allTrades(); const end = all.length ? Math.max(...all.map((t) => t.t_entry)) : now; t0 = end - D * 86400; }
  $("lb-share").checked = !me || me.share_stats !== false; $("lb-list").innerHTML = lbTable(await lbRows(t0, t1, $("lb-sym").value)); }
async function renderCh() { let list = [];
  if (DEMO) list = mem.ch || []; else { const { data } = await sb.from("challenges").select("*").order("created_at", { ascending: false }).limit(30); list = data || []; }
  const cards = await Promise.all(list.map(async (c) => { const rows = await lbRows(c.start_ts, c.end_ts, c.symbol); const mine = me && rows.some((r) => r.user_id === me.user_id);
    return `<div class="card chc"><div class="ah"><b>${esc(c.title)}</b><span class="muted tiny">${esc(names[c.user_id] || "")} · ${ago(c.created_at)}</span></div><div class="muted small">${c.symbol} · ${fmt(loc(c.start_ts)).slice(0, 10)} → ${fmt(loc(c.end_ts)).slice(0, 10)} (New York)</div>
      <div class="row" style="justify-content:flex-start"><button class="small primary" data-take="${c.id}">${mine ? "Replay it again" : "Take this week"}</button>${me && c.user_id === me.user_id ? `<button class="small ghost" data-delch="${c.id}">Delete</button>` : ""}</div>
      ${mine ? lbTable(rows) : `<div class="tiny muted">${rows.length} friend${rows.length === 1 ? "" : "s"} done. Results unlock after you trade it, so nobody gets spoiled.</div>`}</div>`; }));
  $("ch-list").innerHTML = cards.join("") || '<div class="empty">No challenges yet. Load a week, then hit the button above.</div>'; $("ch-list").dataset.ids = JSON.stringify(list); }
async function newChallenge() { if (!nowT()) return toast("Load a replay first, then challenge from the week you're on");
  const lt = loc(nowT()), wd = new Date(lt * 1000).getUTCDay(), monLt = Math.floor(lt / 86400) * 86400 - ((wd + 6) % 7) * 86400, start = monLt - 6 * 3600 - (loc(nowT()) - nowT()), end = start + 5 * 86400;
  const title = prompt("Name the challenge", sym + " week of " + fmt(monLt).slice(0, 10)); if (!title) return; const row = { title, symbol: sym, start_ts: start, end_ts: end };
  if (DEMO) (mem.ch = mem.ch || []).unshift({ id: "c" + Date.now(), user_id: "demo", created_at: new Date().toISOString(), ...row }); else { const { error } = await sb.from("challenges").insert(row); if (error) return toast(error.message); }
  view("friends"); ftab("ch"); toast("Challenge posted"); }
async function takeChallenge(c) { if (pos.qty || orders.length) return toast("Close positions and cancel orders first"); $("sym").value = c.symbol; $("start").value = fmt(loc(c.start_ts) + 60).replace(" ", "T"); view("trade"); await loadReplay(); }
async function shareTrade(t) { const note = prompt("Add a note for your friends (optional)", t.notes || ""); if (note === null) return;
  const snap = { symbol: t.symbol, dir: t.dir, qty: t.qty, entry: t.entry, stop: t.stop, target: t.target, exit: t.exit, r: t.r, pnl: t.pnl, outcome: t.outcome, t_entry: t.t_entry, t_exit: t.t_exit, tags: t.tags || [], shot: t.shots && t.shots[0] };
  if (DEMO) (mem.sh = mem.sh || []).unshift({ id: "s" + Date.now(), user_id: "demo", trade_id: t.id, snap, note, created_at: new Date().toISOString() }); else { const { error } = await sb.from("shared_trades").insert({ trade_id: t.id, snap, note }); if (error) return toast(error.message); }
  toast("Shared with the group"); }
async function renderSh() { let list = [], rt = [];
  if (DEMO) { list = mem.sh || []; rt = mem.rt || []; } else { const a = await sb.from("shared_trades").select("*").order("created_at", { ascending: false }).limit(40); list = a.data || []; const b = list.length ? await sb.from("ratings").select("*").in("share_id", list.map((x) => x.id)) : { data: [] }; rt = b.data || []; }
  $("sh-list").innerHTML = list.map((x) => { const t = x.snap, rs = rt.filter((r) => r.share_id === x.id), avg = rs.length ? rs.reduce((a, r) => a + r.stars, 0) / rs.length : 0, mine = rs.find((r) => me && r.user_id === me.user_id);
    return `<div class="card shc" data-id="${x.id}"><div class="ah"><b>${esc(names[x.user_id] || "trader")}</b><span class="muted tiny">${ago(x.created_at)}</span></div>
      <div class="shrow"><span class="${t.dir > 0 ? "pos-up" : "pos-dn"}">${t.dir > 0 ? "Long" : "Short"} ${t.qty} ${t.symbol}</span> @ ${px2(t.entry)} → ${px2(t.exit)} · <b class="${t.pnl >= 0 ? "pos-up" : "pos-dn"}">${money(+t.pnl)}</b>${t.r != null ? " · " + t.r + "R" : ""} · <span class="muted">${fmt(loc(t.t_entry))} NY</span></div>
      ${t.tags && t.tags.length ? `<div class="tags">${t.tags.map((g) => `<span class="pill">${esc(g)}</span>`).join("")}</div>` : ""}${x.note ? `<p class="small">"${esc(x.note)}"</p>` : ""}
      <div class="row" style="justify-content:flex-start;align-items:center"><span class="stars" data-share="${x.id}">${[1, 2, 3, 4, 5].map((n) => `<button class="star ${mine && n <= mine.stars ? "on" : ""}" data-n="${n}">★</button>`).join("")}</span><span class="muted small">${rs.length ? avg.toFixed(1) + " from " + rs.length : "not rated yet"}</span><button class="small ghost" data-replay="${x.id}">Replay this setup</button></div>
      ${rs.filter((r) => r.note).map((r) => `<div class="small rnote"><b>${esc(names[r.user_id] || "")}</b>: ${esc(r.note)}</div>`).join("")}</div>`; }).join("") || '<div class="empty">Nothing shared yet</div>';
  $("sh-list").dataset.list = JSON.stringify(list.map((x) => ({ id: x.id, snap: x.snap }))); }
async function rateShare(id, n) { const note = prompt("Leave a note with your " + n + "★ (optional)", "") ?? ""; const row = { share_id: id, stars: n, note };
  if (DEMO) { mem.rt = (mem.rt || []).filter((r) => !(r.share_id === id && r.user_id === "demo")); mem.rt.push({ ...row, user_id: "demo" }); } else { const { error } = await sb.from("ratings").upsert(row, { onConflict: "share_id,user_id" }); if (error) return toast(error.message); }
  renderSh(); }
async function renderSg() { let list = []; if (DEMO) list = mem.sg || []; else { const { data } = await sb.from("suggestions").select("*").limit(200); list = data || []; }
  list.sort((a, b) => (b.votes || []).length - (a.votes || []).length || Date.parse(b.created_at) - Date.parse(a.created_at)); const uid = me && me.user_id;
  const ST = { new: "📨 sent to Claude", planning: "🧠 Claude planning", waiting: "⏳ waiting on King", approved: "✅ approved", building: "🔨 building", done: "🚀 shipped", no: "✖ not doing", planned: "📋 planned" };
  $("sg-list").innerHTML = list.map((x) => `<div class="card sgc"><button class="vote ${(x.votes || []).includes(uid) ? "on" : ""}" data-vote="${x.id}">▲ ${(x.votes || []).length}</button><div class="sgb"><div>${x.kind === "fix" ? "🔧 " : "💡 "}${esc(x.body)}</div>${x.plan ? `<details class="tiny"><summary>Claude's plan</summary><div class="muted">${esc(x.plan)}</div></details>` : ""}${x.result ? `<div class="tiny up">${esc(x.result)}</div>` : ""}<div class="tiny muted">${esc(names[x.user_id] || "")} · ${ago(x.created_at)} · <span class="pill ${x.status === "done" ? "up" : ""}">${ST[x.status] || x.status}</span></div></div>
    ${isAdmin ? `<select data-st="${x.id}">${Object.keys(ST).map((s) => `<option value="${s}" ${s === x.status ? "selected" : ""}>${ST[s]}</option>`).join("")}</select>` : ""}</div>`).join("") || '<div class="empty">Nothing yet. Spot a bug or want something? Send it.</div>'; }
async function addSg() { const b = $("sg-text").value.trim(); if (b.length < 3) return; const kind = $("sg-kind").value; if (DEMO) (mem.sg = mem.sg || []).push({ id: "g" + Date.now(), user_id: "demo", body: b, kind, status: "new", votes: [], created_at: new Date().toISOString() }); else { const { error } = await sb.from("suggestions").insert({ body: b, kind }); if (error) return toast(error.message); } $("sg-text").value = ""; renderSg(); }
function chatRow(m) { const mine = me && m.user_id === me.user_id; return `<div class="cm ${mine ? "mine" : ""}"><span class="cn">${esc(names[m.user_id] || "trader")}</span><span class="cb">${esc(m.body)}</span><span class="ct">${new Date(m.created_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span></div>`; }
async function initChat() { let list = [];
  if (DEMO) list = mem.msgs || (mem.msgs = [{ id: 1, user_id: "b", body: "who's backtesting tonight", created_at: new Date(Date.now() - 6e5).toISOString() }]);
  else { const { data } = await sb.from("messages").select("id,cid,user_id,body,created_at").eq("room", "lobby").order("created_at", { ascending: false }).limit(150); list = (data || []).reverse();
    /* live chat rides Realtime broadcast: instant, no database round trip, nothing to clog */
    if (!chatSub) { chatSub = sb.channel("lobby-bc", { config: { broadcast: { self: false } } }).on("broadcast", { event: "msg" }, ({ payload }) => addChat(payload)).subscribe(); } }
  const box = $("chat"), f = document.createDocumentFragment(); box.innerHTML = "";
  list.forEach((m) => { const d = document.createElement("div"); d.innerHTML = chatRow(m); d.firstChild.dataset.mid = m.cid || m.id; f.appendChild(d.firstChild); });
  box.appendChild(f); box.scrollTop = 1e9; const lastT = list.length ? Date.parse(list[list.length - 1].created_at) : 0; $("chatdot").classList.toggle("hidden", !(lastT > chatSeen && list[list.length - 1].user_id !== (me && me.user_id))); }
let chatQ = [], chatT = 0;
function flushChat() { chatT = 0; const box = $("chat"), f = document.createDocumentFragment(); let other = false;
  chatQ.splice(0).forEach((m) => { const k = m.cid || m.id; if (box.querySelector(`[data-mid="${k}"]`)) return; const d = document.createElement("div"); d.innerHTML = chatRow(m); d.firstChild.dataset.mid = k; f.appendChild(d.firstChild); if (!me || m.user_id !== me.user_id) other = true; });
  const stick = box.scrollHeight - box.scrollTop - box.clientHeight < 80; box.appendChild(f); while (box.children.length > 400) box.firstChild.remove(); if (stick) box.scrollTop = 1e9;
  if (other) { if ($("v-friends").classList.contains("hidden")) $("chatdot").classList.remove("hidden"); sfx("click"); } }
function addChat(m) { chatQ.push(m); if (!chatT) chatT = requestAnimationFrame(flushChat); }
async function sendChat() { const b = $("chat-in").value.trim().slice(0, 2000); if (!b) return; $("chat-in").value = "";
  const m = { cid: (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random()), user_id: DEMO ? "demo" : me && me.user_id, body: b, created_at: new Date().toISOString() };
  addChat(m); if (DEMO) { mem.msgs.push(m); return; }
  chatSub && chatSub.send({ type: "broadcast", event: "msg", payload: m });
  sb.from("messages").insert({ body: b, cid: m.cid }).then(({ error }) => { if (error) console.warn("chat history save", error.message); }); }

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
  $("jrows").innerHTML = jT.slice().reverse().map((t) => `<tr data-id="${t.id}"><td>${fmt(loc(t.t_entry))}</td><td>${t.symbol}</td><td>${t.dir > 0 ? "Long" : "Short"}</td><td>${t.qty}</td><td>${px2(t.entry)}</td><td>${px2(t.exit)}</td><td>${t.r ?? "—"}</td><td class="${t.pnl >= 0 ? "pos-up" : "pos-dn"}">${money(+t.pnl)}</td><td><input class="note" value="${(t.notes || "").replace(/"/g, "&quot;")}" placeholder="add a note"></td><td>${t.shots && t.shots.length ? '<a href="#" class="shotlink">📷</a>' : ""}${t.notion_page ? " N" : ""} <button class="small ghost sharebtn" title="Share with friends">⤴</button></td></tr>`).join("");
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
const KEYNAMES = { buy: "Buy market", sell: "Sell market", joinbid: "Join bid", joinask: "Join ask", reverse: "Reverse", flatten: "Flatten all", cancel: "Cancel all", close: "Close all", be: "Stop to breakeven", trend: "Trend line", hline: "Horizontal line", vline: "Vertical line", rect: "Zone", long: "Long position", short: "Short position", measure: "Measure" };
function fillSettings() {
  if ($("s-name")) $("s-name").value = (me && me.name) || "";
  if ($("s-sound")) { $("s-sound").checked = prefs.sound !== false; $("s-vol").value = prefs.vol ?? 60; $("s-hap").checked = prefs.haptics !== false; $("s-splash").checked = prefs.splash !== false; $("s-review").checked = prefs.review !== false; }
  $("s-bal").value = prefs.bal; $("s-dll").value = prefs.dll; $("s-ptg").value = prefs.ptg; $("s-act").value = prefs.act; $("s-mdd").value = prefs.mdd; $("s-fee").value = prefs.fee; $("s-mfee").value = prefs.mfee;
  $("s-opens").checked = !!prefs.opens; $("s-sess").checked = !!prefs.sess; $("s-up").value = prefs.up; $("s-dn").value = prefs.dn; $("sym").value = prefs.sym; $("o-sl").value = prefs.slPts; $("o-tp").value = prefs.tpPts;
  $("s-keys").innerHTML = Object.entries(KEYNAMES).map(([k, n]) => `<div><span>${n}</span><input data-key="${k}" maxlength="1" value="${prefs.keys[k] || ""}"></div>`).join("");
  $("magnet").classList.toggle("on", prefs.magnet); tsSettingsUI();
}
function saveSettings() {
  Object.assign(prefs, { bal: +$("s-bal").value, dll: +$("s-dll").value, ptg: +$("s-ptg").value, act: $("s-act").value, mdd: +$("s-mdd").value, fee: +$("s-fee").value, mfee: +$("s-mfee").value, opens: $("s-opens").checked, sess: $("s-sess").checked, up: $("s-up").value, dn: $("s-dn").value });
  document.querySelectorAll("[data-key]").forEach((i) => (prefs.keys[i.dataset.key] = i.value.toLowerCase()));
  const nm = $("s-name").value.trim(); if (me && nm && nm !== me.name) { me.name = nm; names[me.user_id] = nm; if (!DEMO) sb.from("profiles").update({ name: nm }).eq("user_id", me.user_id).then(() => {}); }
  Object.assign(prefs, { sound: $("s-sound").checked, vol: +$("s-vol").value, haptics: $("s-hap").checked, splash: $("s-splash").checked, review: $("s-review").checked }); sfx("fill");
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
function view(v) { const el = $("v-" + v); if (el) { el.classList.remove("enter"); void el.offsetWidth; el.classList.add("enter"); } sfx("click"); document.querySelectorAll(".vtab[data-view]").forEach((b) => b.classList.toggle("on", b.dataset.view === v)); document.querySelectorAll(".view").forEach((x) => x.classList.toggle("hidden", x.id !== "v-" + v)); $("pad").style.visibility = $("favbar").style.visibility = v === "trade" ? "" : "hidden"; $("qzbar").style.visibility = v === "trade" ? "" : "hidden"; $("tools").style.visibility = v === "trade" ? "" : "hidden"; $("app").dataset.v = v; if (v === "journal") loadJournal(); if (v === "stats") renderStats(); if (v === "learn") ltab(document.querySelector("#ltabs .on").dataset.l); if (v === "friends") { ftab(document.querySelector("#ftabs .on").dataset.f); chatSeen = Date.now(); localStorage.setItem("rw-chat-seen", chatSeen); $("chatdot").classList.add("hidden"); setTimeout(() => ($("chat").scrollTop = 1e9), 50); } if (v === "accounts") { renderAccts(); taxCalc(); } if (v === "admin") loadAdmin(); if (v === "settings") { notionUI(); tsSettingsUI(); } }
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
  applyTheme(prefs.theme); await loadAccts().catch(() => {}); await loadMe().catch(() => {}); loadReese().catch(() => {}); try { initLive(); } catch (e) {} initChat().catch(() => {}); fillSettings(); lotsUI(); layMenu(); sideUI(); dockUI(); toolsUI(); buildPanes(); tfUI(); favUI(); requestAnimationFrame(padUI); requestAnimationFrame(watchScales); mediaUI(); if (!prefs.tourDone && !DEMO) setTimeout(() => tour(0), prefs.splash !== false ? 1500 : 400);
  if (!$("start").value) $("start").value = new Date(Date.now() - 8 * 864e5).toISOString().slice(0, 10) + "T09:20";
  if (!DEMO) notionUI().catch(() => {});
  const h = decodeURIComponent(location.hash || ""); if (h.startsWith("#notion=")) { history.replaceState(null, "", location.pathname); view("settings"); nmsg("Notion: " + h.slice(8)); }
  if (DEMO) { $("start").value = "2026-10-14T09:45"; await loadReplay(); for (let i = 0; i < 25; i++) await stepFwd(); }
  refresh();
}
$("a-in").onclick = async () => { const { error } = await sb.auth.signInWithPassword({ email: $("a-email").value.trim(), password: $("a-pass").value }); $("a-msg").textContent = error ? error.message : ""; if (!error) boot(); };
$("a-up").onclick = async () => { const { data, error } = await sb.auth.signUp({ email: $("a-email").value.trim(), password: $("a-pass").value, options: { emailRedirectTo: location.origin + location.pathname } }); $("a-msg").textContent = error ? error.message : data.session ? "" : "Check your email to confirm, then sign in here."; if (data && data.session) boot(); };
$("logout").onclick = async () => { await sb.auth.signOut(); location.reload(); }; $("lockbtn").onclick = lockDlg;

/* ---------------- AI themes: your words -> the PC's Claude Code -> a new theme ---------------- */
const TH_KEYS = ["--bg", "--panel", "--acc", "--acc2", "--txt", "--mut", "--line"], TH_OK = /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\))$/i;
function themeFrom(res) { if (!res || !res.vars) return null; const v = {}; for (const k of TH_KEYS) { const c = String(res.vars[k] || "").trim(); if (!TH_OK.test(c)) return null; v[k] = c; } return [String(res.name || "AI theme").slice(0, 24), v]; }
let aiThT = 0;
async function aiTheme() { const p = $("ai-th").value.trim(); if (p.length < 3) return; const msg = $("ai-th-msg");
  if (DEMO) { msg.textContent = "AI themes need a real login (they run on King's PC)."; return; }
  const { data, error } = await sb.from("theme_requests").insert({ prompt: p }).select("id").single(); if (error) return toast(error.message);
  $("ai-th").value = ""; msg.textContent = "🧠 Sent to Claude on King's PC… (if the PC is asleep it runs when it wakes; you can leave this page)"; aiThWatch(data.id, Date.now()); }
async function aiThWatch(id, t0) { clearTimeout(aiThT); const msg = $("ai-th-msg");
  const { data } = await sb.from("theme_requests").select("status,result").eq("id", id).single();
  if (data && data.status === "done") { const th = themeFrom(data.result); if (!th) { msg.textContent = "That one came back broken. Try wording it differently."; return; }
    const tid = "ai-" + id.slice(0, 6); prefs.myThemes = prefs.myThemes || {}; prefs.myThemes[tid] = th; THEMES[tid] = th; applyTheme(tid); savePrefs(); msg.textContent = "✅ " + th[0] + " is on. It's saved in your themes."; sfx("win"); return; }
  if (data && data.status === "failed") { msg.textContent = "Claude couldn't make that one. Try again with different words."; return; }
  msg.textContent = (data && data.status === "making" ? "🎨 Claude is making it…" : "🧠 Waiting for King's PC…") + " " + Math.round((Date.now() - t0) / 1000) + "s";
  aiThT = setTimeout(() => aiThWatch(id, t0), 4000); }

/* ---------------- TradeSea-style settings: order pad buttons, privacy masks, sounds per event, personal lockout, data speed ---------------- */
const PAD_GROUPS = { buysell: "Buy / sell", joinba: "Join bid / ask", close: "Close position", reverse: "Reverse", cancel: "Cancel all", flatten: "Flatten all", be: "Breakeven" };
const PAD_DEF = ["buysell", "joinba", "close", "reverse", "be", "flatten"];
function beNow() { if (!pos.qty) return toast("No open position"); const d = Math.sign(pos.qty); if ((last() - pos.avg) * d <= 0) return toast("Breakeven not available yet (trade isn't in profit)"); toBE(); snd("be"); toast("Stop moved to breakeven"); }
function padBtnsUI() { const on = prefs.padBtns || PAD_DEF; document.querySelectorAll("#pad [data-pg]").forEach((el) => el.classList.toggle("hidden", !on.includes(el.dataset.pg)));
  if ($("s-padbtns")) $("s-padbtns").innerHTML = Object.entries(PAD_GROUPS).map(([k, n]) => `<label class="ck"><input type="checkbox" data-pg2="${k}" ${on.includes(k) ? "checked" : ""}> ${n}</label>`).join(""); }
function maskUI() { const m = prefs.mask || {}; ["upl", "rpl", "bal", "ddl", "acct"].forEach((k) => document.body.classList.toggle("mask-" + k, !!(m.all || m[k])));
  document.querySelectorAll("[data-mask]").forEach((i) => (i.checked = !!m[i.dataset.mask])); }
const SND_EVENTS = { fill: "Order filled", place: "Order placed", cancel: "Order cancelled", stop: "Stop loss hit", target: "Take profit hit", closed: "Position closed", be: "Moved to breakeven", alert: "Alert triggered" };
const SND_KINDS = { chime: "Chime", buzz: "Buzz", pop: "Pop", coin: "Coin", bell: "Bell", custom: "My sound", off: "Off" };
const SND_DEF = { fill: "chime", place: "pop", cancel: "pop", stop: "buzz", target: "coin", closed: "chime", be: "pop", alert: "bell" };
function tone(kind) { if (prefs.sound === false) return; try { AC = AC || new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; } const t0 = AC.currentTime, vol = (prefs.vol ?? 60) / 100 * 0.18;
  const note = (f, at, dur, type = "sine", v = vol) => { const o = AC.createOscillator(), g = AC.createGain(); o.type = type; o.frequency.setValueAtTime(f, t0 + at); g.gain.setValueAtTime(0, t0 + at); g.gain.linearRampToValueAtTime(v, t0 + at + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + dur); o.connect(g).connect(AC.destination); o.start(t0 + at); o.stop(t0 + at + dur + 0.02); };
  if (kind === "chime") { note(880, 0, 0.12, "triangle"); note(1320, 0.06, 0.16); } else if (kind === "buzz") { note(150, 0, 0.22, "sawtooth", vol * 0.6); note(110, 0.05, 0.25, "square", vol * 0.35); }
  else if (kind === "pop") note(1200, 0, 0.05, "sine"); else if (kind === "coin") { note(988, 0, 0.08, "square", vol * 0.5); note(1319, 0.08, 0.25, "square", vol * 0.5); }
  else if (kind === "bell") { note(1568, 0, 0.6, "sine"); note(2349, 0, 0.4, "sine", vol * 0.4); }
  else if (kind === "custom") { try { const u = localStorage.getItem("rw-snd"); if (u) { const au = new Audio(u); au.volume = Math.min(1, (prefs.vol ?? 60) / 100); au.play().catch(() => {}); } } catch (e) {} } }
function snd(ev) { const m = { ...SND_DEF, ...(prefs.snd || {}) }; if (m[ev] && m[ev] !== "off") tone(m[ev]); }
function sndUI() { const m = { ...SND_DEF, ...(prefs.snd || {}) }; if (!$("s-snd")) return;
  $("s-snd").innerHTML = Object.entries(SND_EVENTS).map(([k, n]) => `<div><span>${n}</span><select data-snd="${k}">${Object.entries(SND_KINDS).map(([s, l]) => `<option value="${s}" ${m[k] === s ? "selected" : ""}>${l}</option>`).join("")}</select><button class="small" data-sndp="${k}">▶</button></div>`).join(""); }
function lockUI() { const u = prefs.lockUntil; $("s-lockmsg").textContent = u && Date.now() < u ? "🔒 Locked until " + new Date(u).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" }) : ""; }
function speedUI() { document.querySelectorAll("#s-speed [data-sp]").forEach((b) => b.classList.toggle("on", b.dataset.sp === (prefs.speed || "fast"))); }
function tsSettingsUI() { padBtnsUI(); maskUI(); sndUI(); lockUI(); speedUI(); }

/* ---------------- motion polish (Motion.dev springs + Anime.js count-ups; both optional, app works without them) ---------------- */
const FX = {
  ok: () => !matchMedia("(prefers-reduced-motion: reduce)").matches,
  spring(el, from = { opacity: [0, 1], y: [10, 0] }, o = {}) { try { if (el && window.Motion && FX.ok()) Motion.animate(el, from, { type: "spring", bounce: 0.22, duration: 0.45, ...o }); } catch (e) {} },
  pop(el) { FX.spring(el, { opacity: [0, 1], scale: [0.94, 1] }, { bounce: 0.3, duration: 0.4 }); },
  stagger(els) { try { if (window.Motion && FX.ok() && els.length) Motion.animate(els, { opacity: [0, 1], y: [8, 0] }, { delay: Motion.stagger(0.03), type: "spring", bounce: 0.2, duration: 0.4 }); } catch (e) {} },
  count(el) { try { if (!window.anime || !FX.ok() || !el) return; const txt = el.textContent, m = txt.match(/-?[\d,]*\.?\d+/); if (!m) return;
    const end = parseFloat(m[0].replace(/,/g, "")), dec = (m[0].split(".")[1] || "").length, pre = txt.slice(0, m.index), post = txt.slice(m.index + m[0].length), o = { v: 0 };
    anime.animate(o, { v: end, duration: 700, ease: "outExpo", onUpdate: () => { el.textContent = pre + o.v.toLocaleString(undefined, { minimumFractionDigits: dec, maximumFractionDigits: dec }) + post; }, onComplete: () => { el.textContent = txt; } }); } catch (e) { } },
};
{ const _view = view; view = function (v) { _view(v); const el = $("v-" + v); if (el) FX.spring(el, { opacity: [0.4, 1], y: [6, 0] }, { duration: 0.35 }); };
  const _rs = renderStats; renderStats = async function () { await _rs.apply(this, arguments); document.querySelectorAll("#st-kpi b").forEach(FX.count); FX.stagger([...document.querySelectorAll("#st-kpi > div")]); };
  const _dlg = dlg; dlg = function () { const r = _dlg.apply(this, arguments); FX.pop($("dlgbox")); return r; };
  const _toast = toast; toast = function (m) { _toast(m); if (m) FX.spring($("toast"), { opacity: [0, 1], y: [16, 0] }, { bounce: 0.35 }); };
  const _sp = splash; splash = function () { _sp(); const l = document.querySelector(".splash .sp-in"); if (l && window.anime && FX.ok()) try { anime.animate(l, { scale: [0.8, 1], opacity: [0, 1], rotate: ["-8deg", "0deg"], duration: 700, ease: "outElastic(1, .6)" }); } catch (e) {} }; }
document.querySelectorAll(".vtab[data-view]").forEach((b) => (b.onclick = () => view(b.dataset.view)));
$("go").onclick = () => { blind = null; blindUI(); loadReplay(); }; $("play").onclick = play; $("step").onclick = () => { pause(); $("stepsz").value === "candle" ? stepCandle() : stepFwd(); };
$("blindbtn").onclick = () => { if (blind) { const d = blind.day; blind = null; blindUI(); toast("It was " + new Date(d + "T12:00:00Z").toUTCString().slice(0, 16)); } else mysteryDay(); }; $("back").onclick = () => { pause(); stepBack(); };
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
["tx-st", "tx-pay", "tx-exp", "tx-w2", "tx-wh"].forEach((k) => ($(k).oninput = taxCalc));
$("acctpill").onclick = acctMenu; $("ac-new").onclick = () => acctDlg(null);
$("ac-list").onclick = (e) => { const b = e.target.closest("button"); if (!b) return; const id = b.dataset.use || b.dataset.edit || b.dataset.arch, a = accts.find((x) => x.id === id); if (!a) return;
  if (b.dataset.use) { pickAcct(id); renderAccts(); } else if (b.dataset.edit) acctDlg(a); else if (confirm("Archive " + a.name + "? Its trades stay in your journal.")) db.updAccount(id, { archived: true }).then(() => { accts = accts.filter((x) => x.id !== id); if (acct && acct.id === id) pickAcct(null); renderAccts(); }); };
["st-acct", "st-sym", "st-range"].forEach((k) => ($(k).onchange = () => { if (k === "st-acct") { prefs.stAcct = $(k).value; savePrefs(); } renderStats(); }));
$("ftabs").onclick = (e) => { const b = e.target.closest("[data-f]"); if (b) ftab(b.dataset.f); };
["lb-range", "lb-sym"].forEach((k) => ($(k).onchange = renderLB));
$("lb-share").onchange = async () => { if (!me) return; me.share_stats = $("lb-share").checked; if (!DEMO) await sb.from("profiles").update({ share_stats: me.share_stats }).eq("user_id", me.user_id); renderLB(); };
$("ch-new").onclick = newChallenge;
$("ch-list").onclick = async (e) => { const list = JSON.parse($("ch-list").dataset.ids || "[]"), b = e.target.closest("button"); if (!b) return; const c = list.find((x) => x.id === (b.dataset.take || b.dataset.delch)); if (!c) return;
  if (b.dataset.take) takeChallenge(c); else if (confirm("Delete this challenge?")) { if (DEMO) mem.ch = mem.ch.filter((x) => x.id !== c.id); else await sb.from("challenges").delete().eq("id", c.id); renderCh(); } };
$("sh-list").onclick = (e) => { const st = e.target.closest(".star"); if (st) return rateShare(st.closest(".stars").dataset.share, +st.dataset.n); const rb = e.target.closest("[data-replay]");
  if (rb) { const x = JSON.parse($("sh-list").dataset.list).find((z) => z.id === rb.dataset.replay); if (x) takeChallenge({ symbol: x.snap.symbol, start_ts: x.snap.t_entry - 3600 }); } };
$("sg-add").onclick = addSg; $("sg-text").onkeydown = (e) => { if (e.key === "Enter") addSg(); };
$("sg-list").onclick = async (e) => { const b = e.target.closest("[data-vote]"); if (!b) return; if (DEMO) { const x = mem.sg.find((z) => z.id === b.dataset.vote); x.votes = x.votes.includes("demo") ? [] : ["demo"]; } else { const { error } = await sb.rpc("vote_suggestion", { sid: b.dataset.vote }); if (error) toast(error.message); } renderSg(); };
$("sg-list").onchange = async (e) => { const id = e.target.dataset.st; if (id && !DEMO) { await sb.from("suggestions").update({ status: e.target.value }).eq("id", id); renderSg(); } };
$("lv-list").onclick = (e) => { const b = e.target.closest("[data-inv]"); if (b) invite(b.dataset.inv); }; $("livepill").onclick = () => { view("friends"); ftab("lv"); };
$("mediabtn").onclick = () => { prefs.media = prefs.media || {}; prefs.media.show = !prefs.media.show; savePrefs(); mediaUI(); };
document.querySelectorAll(".mt button").forEach((b) => (b.onclick = () => { prefs.media.tab = b.dataset.m; savePrefs(); mediaUI(); }));
$("m-op").oninput = () => { prefs.media.op = +$("m-op").value; mediaUI(); }; $("m-op").onchange = savePrefs;
$("m-ct").onclick = () => { prefs.media.ct = !prefs.media.ct; savePrefs(); mediaUI(); if (prefs.media.ct) toast("Click-through on: clicks go to the chart. Turn it off with the ⌖ button (it stays clickable)."); };
$("m-x").onclick = () => { prefs.media.show = false; savePrefs(); mediaUI(); };
$("sp-go").onclick = () => setSp($("sp-url").value.trim()); $("yt-go").onclick = () => setYt($("yt-url").value.trim());
$("lib-add").onclick = () => { const u = $("lib-url").value.trim(); if (!ytEmbed(u)) return toast("Add a YouTube link"); (prefs.vids = prefs.vids || []).push({ url: u, name: $("lib-name").value.trim() }); $("lib-url").value = $("lib-name").value = ""; savePrefs(); renderLib(); };
$("lib-list").onclick = (e) => { const p = e.target.closest("[data-yt]"); if (p) return setYt(p.dataset.yt); const d = e.target.closest("[data-libdel]"); if (d) { prefs.vids.splice(+d.dataset.libdel, 1); savePrefs(); renderLib(); } };
grip($("mgrip"), (e, st) => { if (e.target.closest("button,input")) return; const m = $("media"); if (!st.r) st.r = m.getBoundingClientRect(); m.style.left = Math.max(0, Math.min(innerWidth - 120, st.r.left + e.clientX - st.x)) + "px"; m.style.top = Math.max(0, Math.min(innerHeight - 60, st.r.top + e.clientY - st.y)) + "px"; },
  () => { const r = $("media").getBoundingClientRect(); prefs.media.x = r.left; prefs.media.y = r.top; savePrefs(); });
$("ai-th-go").onclick = aiTheme; $("ai-th").onkeydown = (e) => { if (e.key === "Enter") aiTheme(); };
$("s-padbtns").onchange = (e) => { const all = [...document.querySelectorAll("[data-pg2]:checked")].map((i) => i.dataset.pg2); if (all.length > 6) { e.target.checked = false; return toast("Up to 6 groups"); } prefs.padBtns = all; savePrefs(); padBtnsUI(); };
$("s-mask").onchange = (e) => { const k = e.target.dataset.mask; if (!k) return; prefs.mask = { ...(prefs.mask || {}), [k]: e.target.checked }; savePrefs(); maskUI(); };
$("s-snd").onchange = (e) => { const k = e.target.dataset.snd; if (!k) return; prefs.snd = { ...(prefs.snd || {}), [k]: e.target.value }; savePrefs(); snd(k); };
$("s-snd").onclick = (e) => { const k = e.target.dataset.sndp; if (k) snd(k); };
$("s-sndfile").onchange = (e) => { const f = e.target.files[0]; if (!f) return; if (f.size > 300000) return toast("Max 300 KB"); const r = new FileReader(); r.onload = () => { try { localStorage.setItem("rw-snd", r.result); toast("Sound saved. Pick 'My sound' for any event."); tone("custom"); } catch (er) { toast("Couldn't save the sound on this device"); } }; r.readAsDataURL(f); };
$("s-lockgo").onclick = () => { let v = $("s-lock").value; if (v === "0") return; if (v === "custom") { v = prompt("Lock out for how many hours?", "3"); if (!v || !(+v > 0)) return; }
  const until = v === "day" ? new Date(new Date().setHours(23, 59, 0, 0)).getTime() : Date.now() + +v * 3600e3; if (!confirm("Lock yourself out of trading until " + new Date(until).toLocaleString() + "? You can't undo this.")) return;
  prefs.lockUntil = until; savePrefs(); lockUI(); toast("🔒 Locked out"); };
$("s-speed").onclick = (e) => { const b = e.target.closest("[data-sp]"); if (!b) return; prefs.speed = b.dataset.sp; savePrefs(); speedUI(); };
$("pbe").onclick = beNow; $("pcan").onclick = () => { cancelAll(); snd("cancel"); }; $("pflat").onclick = flatten; $("pclose2").onclick = () => closeAll(); $("prev2").onclick = reverse;
$("s-themes").onclick = (e) => { const b = e.target.closest("[data-th]"); if (b) { applyTheme(b.dataset.th); savePrefs(); sfx("click"); } };
$("helpbtn").onclick = helpDlg; addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("tour").classList.contains("hidden")) tour(99); });
$("chat-send").onclick = sendChat; $("chat-in").onkeydown = (e) => { if (e.key === "Enter") sendChat(); };
$("ltabs").onclick = (e) => { const b = e.target.closest("[data-l]"); if (b) ltab(b.dataset.l); }; $("rl-spoil").onchange = renderRL;
$("rl-list").onclick = (e) => { const b = e.target.closest("[data-rday]"); if (b) replayReese(reese.find((r) => r.id === b.dataset.rday)); };
$("qz-go").onclick = quizNext; $("qz-take").onclick = () => quizAnswer(true); $("qz-fade").onclick = () => quizAnswer(false); $("qz-more").onclick = quizNext; $("qz-stop").onclick = quizStop;
$("co-lessons").onclick = (e) => { const b = e.target.closest("[data-les]"); if (b) lessonDlg(+b.dataset.les); };
$("co-weeks").onclick = async (e) => { const b = e.target.closest("[data-wk]"); if (!b) return; if (pos.qty || orders.length) return toast("Close positions and cancel orders first"); const d = new Date(b.dataset.wk + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() - 1); $("sym").value = "NQ"; $("start").value = d.toISOString().slice(0, 10) + "T17:30"; view("trade"); await loadReplay(); };
$("ev-list").onclick = (e) => { const b = e.target.closest("[data-buy]"); if (b) buyEval(b.dataset.buy); };
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
$("pbuy").onclick = () => market(1); $("psell").onclick = () => market(-1); $("pjb").onclick = joinBid; $("pja").onclick = joinAsk;
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
$("jrows").addEventListener("click", (e) => { if (!e.target.classList.contains("sharebtn")) return; const t = jT.find((x) => x.id === e.target.closest("tr").dataset.id); if (t) shareTrade(t); });
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
  if (e.code === "Space") { e.preventDefault(); play(); } else if (e.key === "ArrowRight") { pause(); $("stepsz").value === "candle" ? stepCandle() : stepFwd(); } else if (e.key === "ArrowLeft") { pause(); stepBack(); }
  else if (e.key === "Escape") { setTool("cursor"); sel = null; hideCtx(); repaintAll(); } else if ((e.key === "Delete" || e.key === "Backspace") && sel) { if (sel.state === "armed") disarmTool(sel); drawings = drawings.filter((d) => d !== sel); sel = null; repaintAll(); }
  else if (k === K.buy) market(1); else if (k === K.sell) market(-1); else if (k === K.joinbid) joinBid(); else if (k === K.joinask) joinAsk(); else if (k === K.reverse) reverse(); else if (k === K.flatten) flatten(); else if (k === K.cancel) cancelAll(); else if (k === K.be) beNow(); else if (k === K.close) closeAll();
  else if (k === K.trend) setTool("trend"); else if (k === K.hline) setTool("hline"); else if (k === K.vline) setTool("vline"); else if (k === K.rect) setTool("rect"); else if (k === K.long) setTool("long"); else if (k === K.short) setTool("short"); else if (k === K.measure) setTool("measure");
});
addEventListener("resize", () => { padUI(); repaintAll(); });
sb.auth.onAuthStateChange((ev) => { if (ev === "SIGNED_IN" && !user) boot(); });
boot();
