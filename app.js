/* Rewind v0.2: bar-by-bar futures replay with a trading-station layout.
   Data: monthly gz CSVs (t,o,h,l,c, UTC seconds) in the private 'bars' bucket. Each user's sessions, trades, prefs,
   screenshots and Notion link are walled off by row-level security. ?demo runs with made-up prices and no account. */
"use strict";
const DEMO = new URLSearchParams(location.search).has("demo");
const sb = supabase.createClient(REWIND.url, REWIND.key);
const $ = (id) => document.getElementById(id);
const INST = { NQ: { data: "NQ", pt: 20, micro: false }, MNQ: { data: "NQ", pt: 2, micro: true }, ES: { data: "ES", pt: 50, micro: false }, MES: { data: "ES", pt: 5, micro: true } };
const TFS = [["15s", 15], ["30s", 30], ["1m", 60], ["2m", 120], ["3m", 180], ["5m", 300], ["15m", 900], ["30m", 1800], ["1h", 3600], ["4h", 14400], ["1D", 86400]];
const TICK = 0.25;
let user = null, isAdmin = false, features = {}, notionAuto = false;
let prefs = { bal: 50000, dll: 1000, ptg: 0, mdd: 2000, fee: 4.5, mfee: 1.5, opens: true, sym: "NQ", tf: "5m", tf1: "1m", riskp: 1, sl: 15, tp: 45, bracket: true, byRisk: false, lots: 1, layout: 1 };

/* ---------------- time (everything shown in New York time) ---------------- */
const offCache = new Map();
function nyOffset(t) {
  const h = Math.floor(t / 3600); if (offCache.has(h)) return offCache.get(h);
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(new Date(t * 1000)).map((x) => [x.type, x.value]));
  const o = Math.round((Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) / 1000 - t) / 60) * 60; offCache.set(h, o); return o;
}
const loc = (t) => t + nyOffset(t);
const fmt = (lt) => new Date(lt * 1000).toISOString().slice(0, 16).replace("T", " ");
const hhmm = (t) => new Date(loc(t) * 1000).toISOString().slice(11, 16);
const sessDay = (t) => new Date((loc(t) + 6 * 3600) * 1000).toISOString().slice(0, 10);   // futures day starts 18:00 NY
function nyToUtc(s) { const g = Date.parse(s + ":00Z") / 1000; return g - nyOffset(g - nyOffset(g)); }
function bucket(lt, sec) { if (sec >= 14400) { const b = 18 * 3600; return Math.floor((lt - b) / sec) * sec + b; } return Math.floor(lt / sec) * sec; }
const money = (x) => (x < 0 ? "-$" : "$") + Math.abs(x).toLocaleString(undefined, { maximumFractionDigits: 0 });
const px2 = (p) => (+p).toFixed(2);
const rnd = (p) => Math.round(p / TICK) * TICK;

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
function demoMonth(sym, tf, ym) {   // made-up random-walk prices for the demo only
  const [y, m] = ym.split("-").map(Number); const t0 = Date.UTC(y, m - 1, 1) / 1000, t1 = Date.UTC(y, m, 1) / 1000, step = tf === "15s" ? 15 : 60;
  let seed = y * 100 + m, p = sym === "NQ" ? 21000 + (m * 137) % 900 : 5900 + (m * 31) % 200; const rr = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const out = []; let drift = 0;
  for (let t = t0; t < t1; t += step) {
    const lt = loc(t), dow = new Date(lt * 1000).getUTCDay(), hr = new Date(lt * 1000).getUTCHours();
    if (dow === 6 || (dow === 0 && hr < 18) || (dow === 5 && hr >= 17) || hr === 17) continue;
    if (rr() < 0.003) drift = (rr() - 0.5) * 0.6;
    const vol = (hr >= 9 && hr < 12 ? 3.2 : 1.2) * (sym === "NQ" ? 1 : 0.3) * Math.sqrt(step / 60);
    const o = p, c = rnd(p + drift + (rr() - 0.5) * vol * 2), h = rnd(Math.max(o, c) + rr() * vol), l = rnd(Math.min(o, c) - rr() * vol);
    out.push({ t, o, h, l, c }); p = c;
  }
  return out;
}
const ymOf = (t) => new Date(t * 1000).toISOString().slice(0, 7);
function addM(ym, n) { const [y, m] = ym.split("-").map(Number); return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7); }

/* ---------------- storage layer (Supabase, or memory in the demo) ---------------- */
const mem = { sessions: [], trades: [] };
const db = {
  async newSession(row) { if (DEMO) { const r = { id: "s" + Date.now(), ...row }; mem.sessions.push(r); return r; } const { data, error } = await sb.from("sessions").insert(row).select().single(); if (error) throw error; return data; },
  saveCursor(id, ts) { if (!DEMO) sb.from("sessions").update({ cursor_ts: ts, updated_at: new Date().toISOString() }).eq("id", id).then(() => {}); },
  async addTrade(row) { if (DEMO) { const r = { id: "t" + Math.random().toString(36).slice(2), ...row }; mem.trades.push(r); return r; } const { data, error } = await sb.from("trades").insert(row).select().single(); if (error) throw error; return data; },
  async trades(sym) { if (DEMO) return mem.trades.filter((t) => !sym || t.symbol === sym); let q = sb.from("trades").select("*").order("t_exit").limit(5000); if (sym) q = q.eq("symbol", sym); const { data } = await q; return data || []; },
  note(id, v) { if (DEMO) { const t = mem.trades.find((x) => x.id === id); if (t) t.notes = v; return; } sb.from("trades").update({ notes: v }).eq("id", id).then(() => {}); },
};
async function notion(action, extra = {}) {
  if (DEMO) return { connected: false, oauth: false };
  const { data, error } = await sb.functions.invoke("notion", { body: { action, ...extra } });
  if (error) { let m = error.message; try { m = (await error.context.json()).error || m; } catch (e) {} throw new Error(m); } return data;
}

/* ---------------- chart panes ---------------- */
function mkChart(el) {
  const c = LightweightCharts.createChart(el, { layout: { background: { color: "#090c11" }, textColor: "#8b96a8", fontSize: 11 }, grid: { vertLines: { color: "#10161e" }, horzLines: { color: "#10161e" } },
    rightPriceScale: { borderColor: "#1c2430" }, timeScale: { borderColor: "#1c2430", timeVisible: true, secondsVisible: true, rightOffset: 10 }, crosshair: { mode: 0 }, autoSize: true });
  const s = c.addCandlestickSeries({ upColor: "#1fb38a", downColor: "#e5484d", borderVisible: false, wickUpColor: "#1fb38a", wickDownColor: "#e5484d", priceFormat: { type: "price", precision: 2, minMove: TICK } });
  return { chart: c, series: s, candles: [], sec: 300, lines: [], opens: [] };
}
let P = [], base = [], cursor = 0, inst = INST.NQ, sym = "NQ", baseTf = "1m", timer = null, monthsLoaded = new Set(), loadedFor = "";
function paneTf(i) { return TFS.find((x) => x[0] === (i === 0 ? prefs.tf : prefs.tf1))[1]; }
function pushBar(p, b) {
  const k = bucket(loc(b.t), p.sec), last = p.candles[p.candles.length - 1];
  if (last && last.time === k) { last.high = Math.max(last.high, b.h); last.low = Math.min(last.low, b.l); last.close = b.c; return last; }
  const c = { time: k, open: b.o, high: b.h, low: b.l, close: b.c }; p.candles.push(c); return c;
}
function rebuild() {
  P.forEach((p, i) => { p.sec = paneTf(i); p.candles = []; for (let j = 0; j <= cursor && j < base.length; j++) pushBar(p, base[j]); p.series.setData(p.candles); });
  $("p0t").textContent = sym + " · " + prefs.tf; $("p1t").textContent = sym;
  drawOpens(); drawOrders(); drawDrawings(); refresh();
}
async function ensureAhead() {
  if (base.length - cursor > 3000) return; const last = [...monthsLoaded].sort().pop(), nx = addM(last, 1);
  if (monthsLoaded.has(nx) || nx > new Date().toISOString().slice(0, 7)) return; monthsLoaded.add(nx);
  const more = await loadMonth(inst.data, baseTf, nx), lt = base.length ? base[base.length - 1].t : 0; for (const b of more) if (b.t > lt) base.push(b);
}
async function stepFwd() {
  if (!base.length) return; if (cursor >= base.length - 1) { await ensureAhead(); if (cursor >= base.length - 1) { pause(); return toast("End of data"); } }
  cursor++; const b = base[cursor]; P.forEach((p) => p.series.update(pushBar(p, b))); engineBar(b);
  if (["00:00", "09:30", "10:00", "18:00"].includes(hhmm(b.t))) drawOpens();
  refresh(); if (cursor % 500 === 0) ensureAhead(); if (cursor % 60 === 0 && sess) db.saveCursor(sess.id, b.t);
}
function stepBack() { if (pos.qty || orders.length) return toast("Close positions and cancel orders before stepping back"); if (cursor > 0) { cursor--; rebuild(); } }
function play() { if (timer) return pause(); $("play").textContent = "⏸"; const tick = async () => { await stepFwd(); if (timer) timer = setTimeout(tick, +$("speed").value); }; timer = setTimeout(tick, 0); }
function pause() { clearTimeout(timer); timer = null; $("play").textContent = "▶"; }
const last = () => (base[cursor] ? base[cursor].c : null);

async function loadReplay() {
  pause(); if (pos.qty || orders.length) return toast("Close positions and cancel orders first");
  sym = $("sym").value; inst = INST[sym]; const minSec = Math.min(paneTf(0), prefs.layout === 2 ? paneTf(1) : 1e9);
  baseTf = minSec < 60 ? "15s" : "1m";
  const s = $("start").value; if (!s) return toast("Pick a start date and time"); const t0 = nyToUtc(s), ym = ymOf(t0);
  toast("Loading " + sym + " " + baseTf + "…");
  monthsLoaded = new Set([addM(ym, -1), ym, addM(ym, 1)]);
  base = (await Promise.all([...monthsLoaded].sort().map((m) => loadMonth(inst.data, baseTf, m)))).flat().sort((a, b) => a.t - b.t);
  if (!base.length) return toast(baseTf === "15s" ? "No 15s data there (15s covers NY mornings only). Pick 1m or higher." : "No data for that month");
  cursor = Math.max(0, base.findIndex((b) => b.t >= t0) - 1); if (cursor < 0) cursor = base.length - 1;
  loadedFor = sym + baseTf; rebuild(); P.forEach((p) => p.chart.timeScale().scrollToRealTime());
  try { sess = await db.newSession({ name: sym + " " + fmt(loc(t0)), symbol: sym, start_ts: t0, cursor_ts: t0, tf: prefs.tf, account_start: prefs.bal, risk_pct: prefs.riskp, rules: { dll: prefs.dll, mdd: prefs.mdd, ptg: prefs.ptg } }); }
  catch (e) { return toast("Could not start a session: " + e.message); }
  hist = []; locked = ""; refresh(); toast(""); prefs.sym = sym; savePrefs();
}

/* ---------------- key opens + drawings ---------------- */
function drawOpens() {
  const p = P[0]; p.opens.forEach((l) => p.series.removePriceLine(l)); p.opens = []; if (!prefs.opens || !base[cursor]) return;
  const day = sessDay(base[cursor].t), marks = { "18:00": "18:00", "00:00": "Midnight", "09:30": "9:30", "10:00": "10AM" };
  for (let i = cursor; i >= 0 && i > cursor - 6000; i--) { const b = base[i]; if (sessDay(b.t) !== day) break; const k = hhmm(b.t); if (marks[k]) { p.opens.push(p.series.createPriceLine({ price: b.o, color: "#3c4a5e", lineWidth: 1, lineStyle: 2, axisLabelVisible: false, title: marks[k] })); delete marks[k]; } }
}
let tool = "cursor", drawings = [], pend = null, drawObjs = [];
const FIB = [[0, "1"], [0.5, "0.5 EQ"], [0.62, "0.62"], [0.705, "0.705"], [0.79, "0.79"], [1, "0"], [-0.27, "-0.27"], [-0.62, "-0.62"]];
function drawDrawings() {
  const p = P[0]; drawObjs.forEach((o) => (o.kind === "line" ? p.series.removePriceLine(o.ref) : p.chart.removeSeries(o.ref))); drawObjs = [];
  for (const d of drawings) {
    if (d.type === "hline") drawObjs.push({ kind: "line", ref: p.series.createPriceLine({ price: d.p, color: "#c79b3b", lineWidth: 1, title: "" }) });
    if (d.type === "fib") for (const [f, lab] of FIB) drawObjs.push({ kind: "line", ref: p.series.createPriceLine({ price: d.b + (d.a - d.b) * f, color: f === 0.79 || f === 0.62 ? "#4c8dff" : "#5b6b82", lineWidth: 1, lineStyle: f === 0.5 ? 0 : 2, title: "fib " + lab }) });
    if (d.type === "trend") { const s = p.chart.addLineSeries({ color: "#c79b3b", lineWidth: 1, lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false }); s.setData(d.t1 < d.t2 ? [{ time: d.t1, value: d.p1 }, { time: d.t2, value: d.p2 }] : [{ time: d.t2, value: d.p2 }, { time: d.t1, value: d.p1 }]); drawObjs.push({ kind: "series", ref: s }); }
  }
}
function setTool(t) { tool = t; pend = null; document.querySelectorAll("[data-tool]").forEach((b) => b.classList.toggle("on", b.dataset.tool === t)); }
function chartClick(param) {
  if (tool === "cursor" || !param.point) return; const price = rnd(P[0].series.coordinateToPrice(param.point.y)); const time = param.time;
  if (tool === "hline") { drawings.push({ type: "hline", p: price }); setTool("cursor"); return drawDrawings(); }
  if (!pend) { pend = { p: price, t: time }; return toast(tool === "fib" ? "Fib: now click the other end of the leg" : "Now click the second point"); }
  if (tool === "fib") drawings.push({ type: "fib", a: pend.p, b: price });
  if (tool === "trend" && time && pend.t && time !== pend.t) drawings.push({ type: "trend", p1: pend.p, t1: pend.t, p2: price, t2: time });
  if (tool === "measure") { const pts = Math.abs(price - pend.p); toast(`${pts.toFixed(2)} pts · ${money(pts * inst.pt)} per lot · ${(pts / (+$("b-sl").value || 1)).toFixed(2)}R at your stop`); }
  setTool("cursor"); drawDrawings();
}

/* ---------------- order engine ---------------- */
let sess = null, hist = [], locked = "";
let pos = { qty: 0, avg: 0, sl: null, tp: null, t: 0, risk: 0 };   // qty signed: + long, - short
let orders = [];   // {id, side, type: limit|stop, price, qty, br:{sl,tp} pts}
let oid = 1;
function fee(q) { return Math.abs(q) * (inst.micro ? prefs.mfee : prefs.fee); }
function balance() { return (sess ? +sess.account_start : prefs.bal) + hist.reduce((s, t) => s + (+t.pnl || 0), 0); }
function openPnl() { return pos.qty ? (last() - pos.avg) * pos.qty * inst.pt : 0; }
function dayPnl() { const d = base[cursor] ? sessDay(base[cursor].t) : ""; return hist.filter((t) => sessDay(t.t_exit) === d).reduce((s, t) => s + (+t.pnl || 0), 0); }
function guard() {
  if (locked || features.prop_rules === false) return; const dp = dayPnl() + openPnl();
  let peak = sess ? +sess.account_start : prefs.bal, run = peak; for (const t of hist) { run += +t.pnl || 0; peak = Math.max(peak, run); }
  if (prefs.dll && dp <= -prefs.dll) lockOut("Daily loss limit hit");
  else if (prefs.ptg && dp >= prefs.ptg) lockOut("Profit target reached for today");
  else if (prefs.mdd && peak - (balance() + openPnl()) >= prefs.mdd) lockOut("Max drawdown hit");
}
function lockOut(why) { locked = why + " (" + (base[cursor] ? sessDay(base[cursor].t) : "") + ")"; if (pos.qty) closeAll(); orders = []; drawOrders(); toast("🔒 " + why + ". Trading locked."); refresh(); }
function lockedNow() { if (!locked) return false; const d = base[cursor] ? sessDay(base[cursor].t) : ""; if (locked.endsWith("(" + d + ")") || locked.startsWith("Max drawdown")) return true; locked = ""; return false; }
function lotsFor(slPts) {
  if (!$("b-risk").checked) return Math.max(1, +$("qqty").value || prefs.lots);
  return Math.max(0, Math.floor((balance() * (+$("riskp").value / 100)) / (slPts * inst.pt)));
}
function market(side, qty) {
  if (lockedNow()) return toast("🔒 " + locked); if (!last()) return toast("Load a chart first");
  qty = qty || lotsFor(+$("b-sl").value); if (qty < 1) return toast("Risk % too small for that stop. Try the micro."); fill(side, qty, last(), base[cursor].t, $("b-on").checked ? { sl: +$("b-sl").value, tp: +$("b-tp").value } : null);
}
function place(side, type, price, qty, br) {
  if (lockedNow()) return toast("🔒 " + locked); if (!last()) return toast("Load a chart first");
  orders.push({ id: oid++, side, type, price: rnd(price), qty, br }); drawOrders(); refresh();
}
function fill(side, qty, price, t, br) {
  const q = side * qty;
  if (!pos.qty || Math.sign(pos.qty) === side) {   // open or add
    const nq = pos.qty + q; pos.avg = pos.qty ? (pos.avg * Math.abs(pos.qty) + price * qty) / Math.abs(nq) : price; if (!pos.qty) pos.t = t; pos.qty = nq;
    if (br) { if (br.sl) pos.sl = rnd(pos.avg - side * br.sl); if (br.tp) pos.tp = rnd(pos.avg + side * br.tp); }
    pos.risk = pos.sl != null ? Math.abs(pos.avg - pos.sl) : pos.risk || 0;
  } else {   // reduce / close / flip
    const closeQ = Math.min(Math.abs(pos.qty), qty); record(closeQ, price, t, "manual"); const rest = qty - closeQ;
    if (rest > 0) { pos = { qty: 0, avg: 0, sl: null, tp: null, t: 0, risk: 0 }; fill(side, rest, price, t, br); }
  }
  drawOrders(); refresh();
}
function record(closeQ, price, t, outcome) {
  const side = Math.sign(pos.qty), pnl = (price - pos.avg) * side * closeQ * inst.pt - fee(closeQ), r = pos.risk ? ((price - pos.avg) * side) / pos.risk : null;
  const row = { session_id: sess && sess.id, symbol: sym, dir: side, qty: closeQ, entry: +pos.avg.toFixed(2), stop: pos.sl, target: pos.tp, exit: price, t_entry: pos.t, t_exit: t, outcome, r: r == null ? null : +r.toFixed(2), pnl: +pnl.toFixed(2), fees: fee(closeQ) };
  hist.push(row); pos.qty -= side * closeQ; if (!pos.qty) { pos = { qty: 0, avg: 0, sl: null, tp: null, t: 0, risk: 0 }; orders = orders.filter((o) => o.oco !== true); }
  db.addTrade(row).then((d) => { Object.assign(row, d); shot(d.id); if (notionAuto) notion("sync", { ids: [d.id] }).catch(() => {}); }).catch((e) => toast("Trade not saved: " + e.message));
  guard();
}
function engineBar(b) {
  // working orders (stop first if both sides could fill in one bar is not an issue: one order at a time fills per bar in order of distance)
  for (const o of orders.slice()) {
    const hit = o.type === "limit" ? (o.side > 0 ? b.l <= o.price : b.h >= o.price) : (o.side > 0 ? b.h >= o.price : b.l <= o.price);
    if (!hit) continue; const fp = o.type === "limit" ? (o.side > 0 ? Math.min(o.price, b.o) : Math.max(o.price, b.o)) : (o.side > 0 ? Math.max(o.price, b.o) : Math.min(o.price, b.o));
    orders = orders.filter((x) => x !== o); fill(o.side, o.qty, fp, b.t, o.br);
  }
  if (pos.qty && b.t > pos.t) {   // bracket: stop wins if both are touched in the same bar (safe side); gaps fill at the open
    const d = Math.sign(pos.qty);
    const hs = pos.sl != null && (d > 0 ? b.l <= pos.sl : b.h >= pos.sl), ht = pos.tp != null && (d > 0 ? b.h >= pos.tp : b.l <= pos.tp);
    if (hs) { const g = d > 0 ? b.o < pos.sl : b.o > pos.sl; record(Math.abs(pos.qty), g ? b.o : pos.sl, b.t, Math.abs(pos.sl - pos.avg) < 1e-9 ? "be" : "loss"); }
    else if (ht) record(Math.abs(pos.qty), pos.tp, b.t, "win");
  }
  guard(); drawOrders();
}
function closeAll() { if (pos.qty) record(Math.abs(pos.qty), last(), base[cursor].t, "manual"); drawOrders(); refresh(); }
function reverse() { if (!pos.qty) return; const q = Math.abs(pos.qty), s = -Math.sign(pos.qty); closeAll(); market(s, q); }
function toBE() { if (pos.qty) { pos.sl = rnd(pos.avg); drawOrders(); refresh(); } }
function cancelAll() { orders = []; drawOrders(); refresh(); }
async function shot(id) {
  if (DEMO || features.journal === false) return;
  try { const cv = P[0].chart.takeScreenshot(); const blob = await new Promise((r) => cv.toBlob(r, "image/png")); const path = `${user.id}/${id}.png`;
    const up = await sb.storage.from("shots").upload(path, blob, { contentType: "image/png", upsert: true }); if (!up.error) await sb.from("trades").update({ shots: [path] }).eq("id", id); } catch (e) {}
}

/* ---------------- chart order lines (drag stop / target / orders) ---------------- */
function drawOrders() {
  const p = P[0]; if (!p) return; p.lines.forEach((l) => p.series.removePriceLine(l.ref)); p.lines = [];
  const L = (price, color, title, kind, ref) => p.lines.push({ ref: p.series.createPriceLine({ price, color, lineWidth: 2, lineStyle: kind === "pos" ? 0 : 2, title }), kind, price, obj: ref });
  if (pos.qty) { L(pos.avg, "#9aa6b8", `${pos.qty > 0 ? "LONG" : "SHORT"} ${Math.abs(pos.qty)}  ${money(openPnl())}`, "pos");
    if (pos.sl != null) L(pos.sl, "#e5484d", "SL " + money((pos.sl - pos.avg) * pos.qty * inst.pt), "sl"); if (pos.tp != null) L(pos.tp, "#1fb38a", "TP " + money((pos.tp - pos.avg) * pos.qty * inst.pt), "tp"); }
  for (const o of orders) L(o.price, "#4c8dff", `${o.side > 0 ? "BUY" : "SELL"} ${o.type.toUpperCase()} ${o.qty}`, "ord", o);
}
let drag = null;
function initDrag(el) {
  el.addEventListener("pointerdown", (e) => {
    if (tool !== "cursor") return; const y = e.clientY - el.getBoundingClientRect().top, p = P[0];
    for (const l of p.lines) { if (l.kind === "pos") continue; const ly = p.series.priceToCoordinate(l.price); if (ly != null && Math.abs(ly - y) < 7) { drag = l; p.chart.applyOptions({ handleScroll: false, handleScale: false }); el.setPointerCapture(e.pointerId); e.preventDefault(); return; } }
  });
  el.addEventListener("pointermove", (e) => {
    if (!drag) return; const y = e.clientY - el.getBoundingClientRect().top, price = rnd(P[0].series.coordinateToPrice(y)); if (price == null || isNaN(price)) return;
    if (drag.kind === "sl") pos.sl = price; else if (drag.kind === "tp") pos.tp = price; else if (drag.kind === "ord") drag.obj.price = price;
    drag.ref.applyOptions({ price }); drag.price = price;
  });
  const end = () => { if (!drag) return; if (drag.kind === "sl" && pos.qty) pos.risk = Math.abs(pos.avg - pos.sl) || pos.risk; drag = null; P[0].chart.applyOptions({ handleScroll: true, handleScale: true }); drawOrders(); refresh(); };
  el.addEventListener("pointerup", end); el.addEventListener("pointercancel", end);
}

/* ---------------- DOM ladder ---------------- */
function renderDom() {
  if ($("md-dom").classList.contains("hidden") || !last()) return; const lp = rnd(last()), rows = [];
  const tags = (p) => [...orders.filter((o) => o.price === p).map((o) => `<span class="tag o">${o.side > 0 ? "B" : "S"}${o.qty}</span>`), pos.qty && pos.sl === p ? '<span class="tag sl">SL</span>' : "", pos.qty && pos.tp === p ? '<span class="tag tp">TP</span>' : ""].join("");
  for (let i = 18; i >= -18; i--) { const p = +(lp + i * TICK).toFixed(2), cls = (i === 0 ? " last" : "") + (pos.qty && Math.abs(pos.avg - p) < TICK / 2 ? " avg" : "");
    rows.push(`<div class="r${cls}"><span class="b" data-p="${p}">${p < lp ? "limit" : p > lp ? "stop" : "mkt"}</span><span class="p">${px2(p)} ${tags(p)}</span><span class="s" data-p="${p}">${p > lp ? "limit" : p < lp ? "stop" : "mkt"}</span></div>`); }
  $("dom").innerHTML = rows.join("");
}

/* ---------------- panels ---------------- */
function refresh() {
  const bal = balance(), op = openPnl(), dp = dayPnl() + op;
  $("bal").textContent = money(bal); $("openp").textContent = money(op); $("openp").className = op >= 0 ? "pos-up" : "pos-dn"; $("dayp").textContent = money(dp); $("dayp").className = dp >= 0 ? "pos-up" : "pos-dn";
  $("dll").textContent = prefs.dll ? money(prefs.dll + Math.min(0, dp)) : "off";
  let peak = sess ? +sess.account_start : prefs.bal, run = peak; for (const t of hist) { run += +t.pnl || 0; peak = Math.max(peak, run); }
  $("ddl").textContent = prefs.mdd ? money(prefs.mdd - (peak - (bal + op))) : "off"; $("lockchip").classList.toggle("hidden", !lockedNow()); $("lockchip").title = locked;
  const lp = last(); $("qbid").textContent = lp ? px2(lp) : "—"; $("qask").textContent = lp ? px2(lp + TICK) : "—";
  $("clock").textContent = base[cursor] ? fmt(loc(base[cursor].t)) + " NY" : "—";
  $("b-pos").innerHTML = pos.qty ? `<table class="bt"><tr><th>Symbol</th><th>Side</th><th>Qty</th><th>Avg</th><th>Last</th><th>Stop</th><th>Target</th><th>Open P&L</th><th></th></tr><tr><td>${sym}</td><td class="${pos.qty > 0 ? "pos-up" : "pos-dn"}">${pos.qty > 0 ? "Long" : "Short"}</td><td>${Math.abs(pos.qty)}</td><td>${px2(pos.avg)}</td><td>${px2(lp)}</td><td>${pos.sl != null ? px2(pos.sl) : "—"}</td><td>${pos.tp != null ? px2(pos.tp) : "—"}</td><td class="${op >= 0 ? "pos-up" : "pos-dn"}">${money(op)}</td><td><button data-a="close">Close</button> <button data-a="rev">Reverse</button> <button data-a="be">BE</button></td></tr></table>` : '<p class="muted small" style="padding:8px 12px">Flat</p>';
  $("b-ord").innerHTML = orders.length ? `<table class="bt"><tr><th>Side</th><th>Type</th><th>Qty</th><th>Price</th><th>Bracket</th><th></th></tr>${orders.map((o) => `<tr><td class="${o.side > 0 ? "pos-up" : "pos-dn"}">${o.side > 0 ? "Buy" : "Sell"}</td><td>${o.type}</td><td>${o.qty}</td><td>${px2(o.price)}</td><td>${o.br ? `SL ${o.br.sl} / TP ${o.br.tp} pts` : "—"}</td><td><button data-c="${o.id}">×</button></td></tr>`).join("")}</table>` : '<p class="muted small" style="padding:8px 12px">No working orders</p>';
  $("ordn").textContent = orders.length ? "(" + orders.length + ")" : "";
  $("b-hist").innerHTML = hist.length ? `<table class="bt"><tr><th>Time (NY)</th><th>Side</th><th>Qty</th><th>Entry</th><th>Exit</th><th>Result</th><th>R</th><th>P&L</th></tr>${hist.slice().reverse().map((t) => `<tr><td>${fmt(loc(t.t_entry)).slice(5)}</td><td>${t.dir > 0 ? "Long" : "Short"}</td><td>${t.qty}</td><td>${px2(t.entry)}</td><td>${px2(t.exit)}</td><td>${t.outcome}</td><td>${t.r == null ? "—" : t.r}</td><td class="${t.pnl >= 0 ? "pos-up" : "pos-dn"}">${money(t.pnl)}</td></tr>`).join("")}</table>` : '<p class="muted small" style="padding:8px 12px">No trades this session</p>';
  const w = hist.filter((t) => t.pnl > 0).length; $("bstat").textContent = hist.length ? `${hist.length} trades · ${Math.round((100 * w) / hist.length)}% win · net ${money(hist.reduce((s, t) => s + t.pnl, 0))}` : "";
  const sl = +$("o-sl").value, q = +$("o-qty").value; $("o-risk").textContent = sl && q ? `Risk ${money(sl * q * inst.pt + fee(q))} · reward ${money((+$("o-tp").value || 0) * q * inst.pt)}` : "";
  renderDom();
}

/* ---------------- journal ---------------- */
let eqC, eqS, jT = [];
async function loadJournal() {
  jT = await db.trades($("j-sym").value); const n = jT.length, w = jT.filter((t) => t.pnl > 0), l = jT.filter((t) => t.pnl < 0);
  const gp = w.reduce((s, t) => s + +t.pnl, 0), gl = -l.reduce((s, t) => s + +t.pnl, 0); let run = 0, pk = 0, mdd = 0; const eq = [];
  jT.forEach((t, i) => { run += +t.pnl; pk = Math.max(pk, run); mdd = Math.max(mdd, pk - run); eq.push({ time: i + 1, value: run }); });
  const rs = jT.filter((t) => t.r != null), avgR = rs.length ? rs.reduce((s, t) => s + +t.r, 0) / rs.length : 0; const box = (k, v) => `<div><span class="muted small">${k}</span><b>${v}</b></div>`;
  $("stats").innerHTML = box("Trades", n) + box("Win rate", n ? Math.round((100 * w.length) / n) + "%" : "—") + box("Avg R", avgR.toFixed(2)) + box("Profit factor", gl ? (gp / gl).toFixed(2) : "—") + box("Net P&L", money(gp - gl)) + box("Max drawdown", money(-mdd)) + box("Avg win", w.length ? money(gp / w.length) : "—") + box("Avg loss", l.length ? money(-gl / l.length) : "—");
  if (!eqC) { eqC = LightweightCharts.createChart($("eqchart"), { layout: { background: { color: "#090c11" }, textColor: "#8b96a8" }, grid: { vertLines: { visible: false }, horzLines: { color: "#10161e" } }, timeScale: { visible: false }, autoSize: true }); eqS = eqC.addLineSeries({ color: "#3dd6a4", lineWidth: 2 }); }
  eqS.setData(eq); eqC.timeScale().fitContent();
  $("jrows").innerHTML = jT.slice().reverse().map((t) => `<tr data-id="${t.id}"><td>${fmt(loc(t.t_entry))}</td><td>${t.symbol}</td><td>${t.dir > 0 ? "Long" : "Short"}</td><td>${t.qty}</td><td>${px2(t.entry)}</td><td>${t.exit != null ? px2(t.exit) : ""}</td><td>${t.r ?? "—"}</td><td class="${t.pnl >= 0 ? "pos-up" : "pos-dn"}">${money(+t.pnl)}</td><td><input class="note" value="${(t.notes || "").replace(/"/g, "&quot;")}" placeholder="add a note"></td><td>${t.shots && t.shots.length ? '<a href="#" class="shotlink">📷</a>' : ""}${t.notion_page ? " N" : ""}</td></tr>`).join("");
}
function exportCsv() {
  const h = ["date_ny", "symbol", "side", "qty", "entry", "stop", "target", "exit", "r", "pnl", "fees", "outcome", "notes"];
  const rows = jT.map((t) => [fmt(loc(t.t_entry)), t.symbol, t.dir > 0 ? "long" : "short", t.qty, t.entry, t.stop, t.target, t.exit, t.r, t.pnl, t.fees, t.outcome, JSON.stringify(t.notes || "")].join(","));
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([h.join(",") + "\n" + rows.join("\n")], { type: "text/csv" })); a.download = "rewind-journal.csv"; a.click();
}

/* ---------------- Notion ---------------- */
async function notionUI() {
  const show = (id) => ["n-connect", "n-setup", "n-ready"].forEach((x) => $(x).classList.toggle("hidden", x !== id));
  try {
    const s = await notion("status"); $("n-oauth").classList.toggle("hidden", !s.oauth); $("n-tokenbox").open = !s.oauth;
    if (!s.connected) { $("n-state").textContent = "Not connected"; notionAuto = false; return show("n-connect"); }
    $("n-state").innerHTML = "Connected to <b>" + (s.workspace || "Notion") + "</b>";
    if (!s.db) { show("n-setup"); const r = await notion("pages"); $("n-pages").innerHTML = r.pages.length ? r.pages.map((p) => `<option value="${p.id}">${p.title}</option>`).join("") : "<option value=''>No pages shared yet. Add your integration to a page first</option>"; return; }
    show("n-ready"); $("n-open").href = s.db_url; $("n-auto").checked = s.auto_sync; notionAuto = s.auto_sync;
  } catch (e) { $("n-state").textContent = DEMO ? "Demo: Notion is off" : "Notion: " + e.message; if (DEMO) show(""); }
}
const nmsg = (m) => ($("n-msg").textContent = m);

/* ---------------- prefs / settings / admin ---------------- */
async function loadPrefs() { if (DEMO) return; const { data } = await sb.from("prefs").select("data").maybeSingle(); if (data && data.data) Object.assign(prefs, data.data); }
function savePrefs() { if (!DEMO && user) sb.from("prefs").upsert({ user_id: user.id, data: prefs, updated_at: new Date().toISOString() }).then(() => {}); }
function fillSettings() {
  $("s-bal").value = prefs.bal; $("s-dll").value = prefs.dll; $("s-ptg").value = prefs.ptg; $("s-mdd").value = prefs.mdd; $("s-fee").value = prefs.fee; $("s-mfee").value = prefs.mfee; $("s-opens").checked = !!prefs.opens;
  $("b-sl").value = prefs.sl; $("b-tp").value = prefs.tp; $("b-on").checked = prefs.bracket; $("b-risk").checked = prefs.byRisk; $("riskp").value = prefs.riskp; $("qqty").value = prefs.lots; $("sym").value = prefs.sym;
}
function saveSettings() { Object.assign(prefs, { bal: +$("s-bal").value, dll: +$("s-dll").value, ptg: +$("s-ptg").value, mdd: +$("s-mdd").value, fee: +$("s-fee").value, mfee: +$("s-mfee").value, opens: $("s-opens").checked }); savePrefs(); drawOpens(); refresh(); $("s-msg").textContent = "Saved. A new balance applies to the next session."; }
async function loadAdmin() {
  const { data: al } = await sb.from("allowlist").select("*").order("added_at");
  $("ad-list").innerHTML = (al || []).map((a) => `<div class="row"><span style="flex:3">${a.email} <span class="muted">(${a.role})</span></span>${a.role === "admin" ? "<span></span>" : `<button class="ghost small" data-del="${a.email}">Remove</button>`}</div>`).join("");
  const { data: fs } = await sb.from("features").select("*").order("key"); $("ad-feat").innerHTML = (fs || []).map((f) => `<label class="ck"><input type="checkbox" data-feat="${f.key}" ${f.enabled ? "checked" : ""}> ${f.label}</label>`).join("");
  const { data: bf } = await sb.from("bar_files").select("symbol,tf,day").order("day"); const g = {}; (bf || []).forEach((r) => (g[r.symbol + " " + r.tf] = g[r.symbol + " " + r.tf] || []).push(r.day));
  $("ad-data").innerHTML = Object.entries(g).map(([k, d]) => `${k}: ${d.length} months (${d[0].slice(0, 7)} → ${d[d.length - 1].slice(0, 7)})`).join("<br>") || "No data yet";
}

/* ---------------- boot + wiring ---------------- */
let toastT; function toast(m) { const t = $("toast"); if (!m) return t.classList.add("hidden"); t.textContent = m; t.classList.remove("hidden"); clearTimeout(toastT); toastT = setTimeout(() => t.classList.add("hidden"), 3500); }
function view(v) { document.querySelectorAll(".vtab").forEach((b) => b.classList.toggle("on", b.dataset.view === v)); document.querySelectorAll(".view").forEach((x) => x.classList.toggle("hidden", x.id !== "v-" + v)); if (v === "journal") loadJournal(); if (v === "admin") loadAdmin(); if (v === "settings") notionUI(); }
function setLayout(n) { prefs.layout = n; $("pane1").classList.toggle("hidden", n !== 2); document.querySelectorAll(".lay").forEach((b) => b.classList.toggle("on", +b.dataset.layout === n)); savePrefs(); if (base.length) { const need = Math.min(paneTf(0), n === 2 ? paneTf(1) : 1e9) < 60 ? "15s" : "1m"; if (need !== baseTf) loadReplay(); else rebuild(); } }
function tfChips() {
  const ok = TFS.filter(([n]) => features.sec15 !== false || !n.endsWith("s"));
  $("tfchips").innerHTML = ok.map(([n]) => `<button data-tf="${n}" class="${n === prefs.tf ? "on" : ""}">${n}</button>`).join("");
  $("tf1").innerHTML = ok.map(([n]) => `<option ${n === prefs.tf1 ? "selected" : ""}>${n}</option>`).join("");
  $("lots").innerHTML = [1, 2, 3, 5, 10].map((n) => `<button data-lot="${n}" class="${n === prefs.lots ? "on" : ""}">${n}</button>`).join("");
}
async function boot() {
  if (DEMO) { user = { id: "demo", email: "demo" }; const d = document.createElement("div"); d.className = "demo"; d.textContent = "DEMO: made-up prices, nothing is saved"; document.body.appendChild(d); }
  else {
    const { data: { session } } = await sb.auth.getSession(); if (!session) { $("auth").classList.remove("hidden"); $("app").classList.add("hidden"); return; }
    user = session.user; const { data: okm } = await sb.rpc("is_member");
    if (!okm) { $("auth").classList.remove("hidden"); $("a-msg").textContent = "Signed in as " + user.email + ", but this email isn't on the invite list yet. Ask King to add you."; return; }
    isAdmin = !!(await sb.rpc("is_admin")).data; $("vt-admin").classList.toggle("hidden", !isAdmin);
    const { data: fs } = await sb.from("features").select("key,enabled"); (fs || []).forEach((f) => (features[f.key] = f.enabled)); await loadPrefs();
  }
  $("auth").classList.add("hidden"); $("app").classList.remove("hidden");
  if (features.journal === false) document.querySelector('[data-view="journal"]').classList.add("hidden");
  if (features.dom === false) $("m-dom").classList.add("hidden"); if (features.drawings === false) document.querySelectorAll("[data-tool]").forEach((b) => b.dataset.tool !== "cursor" && b.classList.add("hidden"));
  if (features.multichart === false) document.querySelector('[data-layout="2"]').classList.add("hidden"); if (features.notion === false) $("notioncard").classList.add("hidden");
  tfChips(); fillSettings();
  if (!P.length) { P = [mkChart($("chart0")), mkChart($("chart1"))]; P[0].chart.subscribeClick(chartClick); initDrag($("chart0"));
    P[0].chart.timeScale().subscribeVisibleLogicalRangeChange(() => {}); }
  setLayout(prefs.layout || 1);
  if (!$("start").value) $("start").value = new Date(Date.now() - 8 * 864e5).toISOString().slice(0, 10) + "T09:20";
  if (!DEMO) notionUI().catch(() => {});
  const h = decodeURIComponent(location.hash || ""); if (h.startsWith("#notion=")) { history.replaceState(null, "", location.pathname); view("settings"); nmsg("Notion: " + h.slice(8)); }
  if (DEMO) { $("start").value = "2026-10-14T09:45"; await loadReplay(); for (let i = 0; i < 25; i++) await stepFwd(); }
}
$("a-in").onclick = async () => { const { error } = await sb.auth.signInWithPassword({ email: $("a-email").value.trim(), password: $("a-pass").value }); $("a-msg").textContent = error ? error.message : ""; if (!error) boot(); };
$("a-up").onclick = async () => { const { data, error } = await sb.auth.signUp({ email: $("a-email").value.trim(), password: $("a-pass").value, options: { emailRedirectTo: location.origin + location.pathname } }); $("a-msg").textContent = error ? error.message : data.session ? "" : "Check your email to confirm, then sign in here."; if (data && data.session) boot(); };
$("logout").onclick = async () => { await sb.auth.signOut(); location.reload(); };
document.querySelectorAll(".vtab").forEach((b) => (b.onclick = () => view(b.dataset.view)));
$("go").onclick = loadReplay; $("play").onclick = play; $("step").onclick = () => { pause(); stepFwd(); }; $("back").onclick = () => { pause(); stepBack(); };
$("tfchips").onclick = (e) => { const t = e.target.dataset.tf; if (!t) return; prefs.tf = t; tfChips(); savePrefs(); if (base.length) { const need = Math.min(paneTf(0), prefs.layout === 2 ? paneTf(1) : 1e9) < 60 ? "15s" : "1m"; need !== baseTf ? loadReplay() : rebuild(); } };
$("tf1").onchange = () => { prefs.tf1 = $("tf1").value; savePrefs(); if (base.length) { const need = Math.min(paneTf(0), paneTf(1)) < 60 ? "15s" : "1m"; need !== baseTf ? loadReplay() : rebuild(); } };
document.querySelectorAll("[data-layout]").forEach((b) => (b.onclick = () => setLayout(+b.dataset.layout)));
document.querySelectorAll("[data-tool]").forEach((b) => (b.onclick = () => setTool(b.dataset.tool))); $("clr").onclick = () => { drawings = []; drawDrawings(); };
document.querySelectorAll(".mode").forEach((b) => (b.onclick = () => { document.querySelectorAll(".mode").forEach((x) => x.classList.toggle("on", x === b)); ["scalp", "dom", "order"].forEach((m) => $("md-" + m).classList.toggle("hidden", m !== b.dataset.mode)); refresh(); }));
document.querySelectorAll(".btab").forEach((b) => (b.onclick = () => { document.querySelectorAll(".btab").forEach((x) => x.classList.toggle("on", x === b)); ["pos", "ord", "hist"].forEach((k) => $("b-" + k).classList.toggle("hidden", k !== b.dataset.b)); }));
$("lots").onclick = (e) => { const n = +e.target.dataset.lot; if (!n) return; prefs.lots = n; $("qqty").value = n; tfChips(); savePrefs(); };
$("qbuy").onclick = () => market(1); $("qsell").onclick = () => market(-1); $("sbuy").onclick = () => market(1); $("ssell").onclick = () => market(-1);
$("sclose").onclick = closeAll; $("srev").onclick = reverse; $("sbe").onclick = toBE; $("scancel").onclick = cancelAll; $("sflat").onclick = () => { cancelAll(); closeAll(); };
$("slock").onclick = () => { if (confirm("Lock trading for the rest of this replay day?")) lockOut("Personal lockout"); };
["b-sl", "b-tp", "riskp"].forEach((k) => ($(k).onchange = () => { prefs.sl = +$("b-sl").value; prefs.tp = +$("b-tp").value; prefs.riskp = +$("riskp").value; savePrefs(); }));
$("b-on").onchange = () => { prefs.bracket = $("b-on").checked; savePrefs(); }; $("b-risk").onchange = () => { prefs.byRisk = $("b-risk").checked; savePrefs(); };
let oside = 1; $("o-buy").onclick = () => { oside = 1; $("o-buy").classList.add("on"); $("o-sell").classList.remove("on"); }; $("o-sell").onclick = () => { oside = -1; $("o-sell").classList.add("on"); $("o-buy").classList.remove("on"); };
["o-sl", "o-tp", "o-qty"].forEach((k) => ($(k).oninput = refresh));
$("o-send").onclick = () => { const ty = $("o-type").value, q = +$("o-qty").value || 1, br = { sl: +$("o-sl").value || 0, tp: +$("o-tp").value || 0 };
  if (ty === "market") return lockedNow() ? toast("🔒 " + locked) : fill(oside, q, last(), base[cursor].t, br); const p = +$("o-px").value; if (!p) return toast("Enter a price"); place(oside, ty, p, q, br); };
$("dom").onclick = (e) => { const p = +e.target.dataset.p; if (!p) return; const lp = rnd(last()), buy = e.target.classList.contains("b"), side = buy ? 1 : -1, q = +$("qqty").value || prefs.lots, br = $("b-on").checked ? { sl: +$("b-sl").value, tp: +$("b-tp").value } : null;
  if (p === lp) return market(side, q); place(side, (buy ? p < lp : p > lp) ? "limit" : "stop", p, q, br); };
$("b-pos").onclick = (e) => { const a = e.target.dataset.a; if (a === "close") closeAll(); if (a === "rev") reverse(); if (a === "be") toBE(); };
$("b-ord").onclick = (e) => { const c = +e.target.dataset.c; if (c) { orders = orders.filter((o) => o.id !== c); drawOrders(); refresh(); } };
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
  if (["INPUT", "SELECT"].includes(e.target.tagName) || $("v-trade").classList.contains("hidden")) return; const k = e.key.toLowerCase();
  if (e.code === "Space") { e.preventDefault(); play(); } else if (e.key === "ArrowRight") { pause(); stepFwd(); } else if (e.key === "ArrowLeft") { pause(); stepBack(); }
  else if (k === "b") market(1); else if (k === "s") market(-1); else if (k === "x") closeAll(); else if (k === "r") reverse(); else if (k === "c") cancelAll();
  else if (k === "h") setTool("hline"); else if (k === "t") setTool("trend"); else if (k === "f") setTool("fib"); else if (k === "m") setTool("measure"); else if (e.key === "Escape") setTool("cursor");
});
sb.auth.onAuthStateChange((ev) => { if (ev === "SIGNED_IN" && !user) boot(); });
boot();
