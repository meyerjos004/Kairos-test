/* Rewind: bar-by-bar futures replay. Data comes from the private 'bars' bucket (monthly gz CSVs, t,o,h,l,c in UTC seconds).
   Every user's sessions, trades, prefs and screenshots are walled off by row-level security. */
"use strict";
const sb = supabase.createClient(REWIND.url, REWIND.key);
const $ = (id) => document.getElementById(id);
const INST = { NQ: { data: "NQ", pt: 20, micro: false }, MNQ: { data: "NQ", pt: 2, micro: true }, ES: { data: "ES", pt: 50, micro: false }, MES: { data: "ES", pt: 5, micro: true } };
const TFS = [["15s", 15], ["30s", 30], ["1m", 60], ["2m", 120], ["3m", 180], ["5m", 300], ["15m", 900], ["30m", 1800], ["1h", 3600], ["4h", 14400], ["1D", 86400]];
const TICK = 0.25;
let user = null, isAdmin = false, features = {}, prefs = { bal: 50000, dll: 1000, mdd: 2000, fee: 4.5, mfee: 1.5, opens: true, sym: "NQ", tf: "5m", riskp: 1, stoppts: 15, tgtr: 3 };

/* ---------- time helpers (everything shown in New York time) ---------- */
const offCache = new Map();
function nyOffset(t) { // seconds to add to UTC to get NY wall clock
  const h = Math.floor(t / 3600); if (offCache.has(h)) return offCache.get(h);
  const d = new Date(t * 1000);
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(d).map((x) => [x.type, x.value]));
  const local = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) / 1000;
  const o = Math.round((local - t) / 60) * 60; offCache.set(h, o); return o;
}
const loc = (t) => t + nyOffset(t);                       // NY wall clock as fake-UTC seconds (what the chart shows)
const fmt = (lt) => new Date(lt * 1000).toISOString().slice(0, 16).replace("T", " ");
const sessDay = (t) => { const l = loc(t) + 6 * 3600; return new Date(l * 1000).toISOString().slice(0, 10); }; // futures day starts 18:00 NY
function nyToUtc(str) { // "YYYY-MM-DDTHH:MM" NY -> UTC seconds
  const guess = Date.parse(str + ":00Z") / 1000; return guess - nyOffset(guess - nyOffset(guess));
}
function bucket(lt, sec) {
  if (sec >= 14400) { const base = 18 * 3600; return Math.floor((lt - base) / sec) * sec + base; } // 4h / daily aligned to the 18:00 futures open
  return Math.floor(lt / sec) * sec;
}

/* ---------- data ---------- */
const monthCache = new Map();
async function loadMonth(dataSym, tf, ym) {
  const key = dataSym + "/" + tf + "/" + ym; if (monthCache.has(key)) return monthCache.get(key);
  const p = (async () => {
    const { data, error } = await sb.storage.from("bars").download(key + ".csv.gz");
    if (error || !data) return [];
    const txt = await new Response(data.stream().pipeThrough(new DecompressionStream("gzip"))).text();
    const out = []; const L = txt.split("\n");
    for (let i = 1; i < L.length; i++) { const c = L[i].split(","); if (c.length < 5) continue; out.push({ t: +c[0], o: +c[1], h: +c[2], l: +c[3], c: +c[4] }); }
    return out;
  })();
  monthCache.set(key, p); return p;
}
const ymOf = (t) => new Date(t * 1000).toISOString().slice(0, 7);
function addMonths(ym, n) { const [y, m] = ym.split("-").map(Number); const d = new Date(Date.UTC(y, m - 1 + n, 1)); return d.toISOString().slice(0, 7); }

/* ---------- replay state ---------- */
let chart, series, base = [], cursor = 0, candles = [], tfSec = 300, baseTf = "1m", inst = INST.NQ, sym = "NQ", timer = null, lines = [], openLines = [], monthsLoaded = new Set();
let sess = null, sessTrades = [], pos = null, locked = false;

function initChart() {
  const el = $("chart");
  chart = LightweightCharts.createChart(el, { layout: { background: { color: "#0b0e13" }, textColor: "#9aa4b2" }, grid: { vertLines: { color: "#141a22" }, horzLines: { color: "#141a22" } },
    rightPriceScale: { borderColor: "#1f2630" }, timeScale: { borderColor: "#1f2630", timeVisible: true, secondsVisible: true, rightOffset: 8 }, crosshair: { mode: 0 }, autoSize: true });
  series = chart.addCandlestickSeries({ upColor: "#26a69a", downColor: "#ef5350", borderVisible: false, wickUpColor: "#26a69a", wickDownColor: "#ef5350", priceFormat: { type: "price", precision: 2, minMove: TICK } });
}
function rebuild() {
  candles = []; const ref = {};
  for (let i = 0; i <= cursor && i < base.length; i++) push(base[i]);
  series.setData(candles); drawOpens(); updateClock();
}
function push(b) {
  const lt = loc(b.t), k = bucket(lt, tfSec), last = candles[candles.length - 1];
  if (last && last.time === k) { last.high = Math.max(last.high, b.h); last.low = Math.min(last.low, b.l); last.close = b.c; return last; }
  const c = { time: k, open: b.o, high: b.h, low: b.l, close: b.c }; candles.push(c); return c;
}
async function ensureAhead() { // load the next month before we run out of bars
  if (base.length - cursor > 2000) return;
  const lastYm = [...monthsLoaded].sort().pop(); const nx = addMonths(lastYm, 1);
  if (monthsLoaded.has(nx) || nx > new Date().toISOString().slice(0, 7)) return;
  monthsLoaded.add(nx); const more = await loadMonth(inst.data, baseTf, nx);
  const lastT = base.length ? base[base.length - 1].t : 0; for (const b of more) if (b.t > lastT) base.push(b);
}
async function stepFwd() {
  if (cursor >= base.length - 1) { await ensureAhead(); if (cursor >= base.length - 1) { pause(); return; } }
  cursor++; const b = base[cursor]; series.update(push(b)); checkFills(b); maybeOpens(b); updateClock(); updateAcct();
  if (cursor % 500 === 0) ensureAhead(); if (cursor % 30 === 0) saveCursor();
}
function stepBack() { if (pos) return toast("Close the position before stepping back"); if (cursor > 0) { cursor--; rebuild(); } }
function play() { if (timer) return pause(); $("play").textContent = "⏸"; const tick = async () => { await stepFwd(); if (timer) timer = setTimeout(tick, +$("speed").value); }; timer = setTimeout(tick, 0); }
function pause() { clearTimeout(timer); timer = null; $("play").textContent = "▶"; }
function updateClock() { const b = base[cursor]; $("clock").textContent = b ? fmt(loc(b.t)) + " NY" : "—"; }

async function loadReplay() {
  pause(); if (pos) return toast("Close the position first");
  sym = $("sym").value; inst = INST[sym]; const tfName = $("tf").value; tfSec = TFS.find((x) => x[0] === tfName)[1];
  baseTf = tfSec < 60 ? "15s" : "1m";
  const startStr = $("start").value; if (!startStr) return toast("Pick a start date/time");
  const t0 = nyToUtc(startStr); const ym = ymOf(t0);
  toast("Loading data…"); monthsLoaded = new Set([addMonths(ym, -1), ym, addMonths(ym, 1)]);
  const parts = await Promise.all([...monthsLoaded].sort().map((m) => loadMonth(inst.data, baseTf, m)));
  base = parts.flat().sort((a, b) => a.t - b.t);
  if (!base.length) return toast(baseTf === "15s" ? "No 15s data for that month (15s covers NY mornings only)" : "No data for that month");
  cursor = base.findIndex((b) => b.t >= t0); if (cursor < 0) cursor = base.length - 1; cursor = Math.max(0, cursor - 1);
  rebuild(); chart.timeScale().scrollToRealTime();
  await newSession(t0, tfName); toast("");
  prefs.sym = sym; prefs.tf = tfName; savePrefs();
}

/* ---------- key opens ---------- */
let opensDay = null;
function maybeOpens(b) { const lt = loc(b.t), hm = new Date(lt * 1000).toISOString().slice(11, 16); if (["00:00", "09:30", "10:00", "18:00"].includes(hm)) drawOpens(); }
function drawOpens() {
  openLines.forEach((l) => series.removePriceLine(l)); openLines = [];
  if (!prefs.opens || !base[cursor]) return;
  const now = base[cursor].t, day = sessDay(now), marks = { "00:00": "Midnight", "09:30": "9:30", "10:00": "10AM" };
  for (let i = cursor; i >= 0 && i > cursor - 2000; i--) {
    const b = base[i]; if (sessDay(b.t) !== day) break;
    const hm = new Date(loc(b.t) * 1000).toISOString().slice(11, 16);
    if (marks[hm]) { openLines.push(series.createPriceLine({ price: b.o, color: "#5b6b82", lineWidth: 1, lineStyle: 2, axisLabelVisible: false, title: marks[hm] })); delete marks[hm]; }
  }
}

/* ---------- account / sessions ---------- */
async function newSession(t0, tf) {
  const { data, error } = await sb.from("sessions").insert({ name: sym + " " + fmt(loc(t0)), symbol: sym, start_ts: t0, cursor_ts: t0, tf, account_start: prefs.bal, risk_pct: prefs.riskp, rules: { dll: prefs.dll, mdd: prefs.mdd } }).select().single();
  if (error) return toast("Could not start session: " + error.message);
  sess = data; sessTrades = []; locked = false; $("locked").classList.add("hidden"); renderRecent(); updateAcct();
}
let lastSave = 0;
function saveCursor() { if (!sess || Date.now() - lastSave < 5000) return; lastSave = Date.now(); sb.from("sessions").update({ cursor_ts: base[cursor].t, updated_at: new Date().toISOString() }).eq("id", sess.id).then(() => {}); }
function balance() { return (sess ? +sess.account_start : prefs.bal) + sessTrades.reduce((s, t) => s + (+t.pnl || 0), 0); }
function updateAcct() {
  const bal = balance(); $("bal").textContent = money(bal);
  const today = base[cursor] ? sessDay(base[cursor].t) : ""; const dp = sessTrades.filter((t) => sessDay(t.t_exit) === today).reduce((s, t) => s + (+t.pnl || 0), 0);
  $("dayp").textContent = money(dp); $("dayp").className = dp >= 0 ? "pos-up" : "pos-dn";
  let peak = sess ? +sess.account_start : bal, run = peak; for (const t of sessTrades) { run += +t.pnl || 0; peak = Math.max(peak, run); }
  const ddLeft = prefs.mdd ? prefs.mdd - (peak - bal) : Infinity; $("ddl").textContent = prefs.mdd ? money(ddLeft) : "off";
  if (features.prop_rules !== false && !locked && ((prefs.dll && dp <= -prefs.dll) || (prefs.mdd && ddLeft <= 0))) { locked = true; $("locked").classList.remove("hidden"); }
  if (pos) { const px = base[cursor].c, open = (px - pos.entry) * pos.dir * pos.qty * inst.pt; $("pos").innerHTML = `${pos.dir > 0 ? "LONG" : "SHORT"} ${pos.qty} @ ${pos.entry.toFixed(2)}\nStop ${pos.stop.toFixed(2)} · Target ${pos.target.toFixed(2)}\nOpen P&L <b class="${open >= 0 ? "pos-up" : "pos-dn"}">${money(open)}</b>`; }
  else $("pos").textContent = locked ? "Locked" : "Flat";
}
const money = (x) => (x < 0 ? "-$" : "$") + Math.abs(x).toLocaleString(undefined, { maximumFractionDigits: 0 });

/* ---------- trading ---------- */
const rnd = (p) => Math.round(p / TICK) * TICK;
function enter(dir) {
  if (locked) return toast("Session locked by prop rules"); if (pos) return toast("Already in a position"); if (!base[cursor]) return toast("Load a chart first");
  const px = base[cursor].c, stopPts = +$("stoppts").value, tgtR = +$("tgtr").value; if (!(stopPts > 0)) return toast("Set a stop in points");
  let qty = +$("qty").value; if (!(qty > 0)) qty = Math.floor((balance() * (+$("riskp").value / 100)) / (stopPts * inst.pt));
  if (qty < 1) return toast("Risk % too small for that stop. Use the micro or a smaller stop");
  pos = { dir, qty, entry: px, stop: rnd(px - dir * stopPts), target: rnd(px + dir * stopPts * tgtR), t_entry: base[cursor].t, risk: stopPts };
  drawPos(); updateAcct();
}
function drawPos() {
  lines.forEach((l) => series.removePriceLine(l)); lines = []; if (!pos) return;
  lines.push(series.createPriceLine({ price: pos.entry, color: "#9aa4b2", lineWidth: 1, title: (pos.dir > 0 ? "Long " : "Short ") + pos.qty }));
  lines.push(series.createPriceLine({ price: pos.stop, color: "#ef5350", lineWidth: 1, title: "Stop" }));
  lines.push(series.createPriceLine({ price: pos.target, color: "#26a69a", lineWidth: 1, title: "Target" }));
}
function checkFills(b) {
  if (!pos || b.t <= pos.t_entry) return; const d = pos.dir;
  const hitStop = d > 0 ? b.l <= pos.stop : b.h >= pos.stop, hitTgt = d > 0 ? b.h >= pos.target : b.l <= pos.target;
  if (hitStop) { const gap = d > 0 ? b.o < pos.stop : b.o > pos.stop; return exit(gap ? b.o : pos.stop, b.t, pos.stop === pos.entry ? "be" : "loss"); } // both in one bar = stop (safe side)
  if (hitTgt) return exit(pos.target, b.t, "win");
}
async function exit(px, t, outcome) {
  const p = pos; pos = null; drawPos();
  const fee = p.qty * (inst.micro ? prefs.mfee : prefs.fee), pnl = (px - p.entry) * p.dir * p.qty * inst.pt - fee, r = ((px - p.entry) * p.dir) / p.risk;
  const row = { session_id: sess && sess.id, symbol: sym, dir: p.dir, qty: p.qty, entry: p.entry, stop: p.stop, target: p.target, exit: px, t_entry: p.t_entry, t_exit: t, outcome, r: +r.toFixed(2), pnl: +pnl.toFixed(2), fees: fee };
  sessTrades.push(row); renderRecent(); updateAcct();
  const { data, error } = await sb.from("trades").insert(row).select().single();
  if (error) return toast("Trade not saved: " + error.message);
  Object.assign(row, data);
  if (features.journal !== false) shot(data.id);
}
function flatten() { if (!pos) return; const b = base[cursor]; exit(b.c, b.t, "manual"); }
function toBE() { if (!pos) return; pos.stop = pos.entry; drawPos(); updateAcct(); }
async function shot(id) {
  try {
    const cv = chart.takeScreenshot(); const blob = await new Promise((r) => cv.toBlob(r, "image/png"));
    const path = `${user.id}/${id}.png`; const up = await sb.storage.from("shots").upload(path, blob, { contentType: "image/png", upsert: true });
    if (!up.error) await sb.from("trades").update({ shots: [path] }).eq("id", id);
  } catch (e) { /* screenshots are optional */ }
}
function renderRecent() {
  $("recent").innerHTML = sessTrades.slice().reverse().map((t) => `<div><span>${t.dir > 0 ? "L" : "S"} ${t.qty} · ${fmt(loc(t.t_entry)).slice(5)}</span><b class="${t.pnl >= 0 ? "pos-up" : "pos-dn"}">${t.r > 0 ? "+" : ""}${t.r}R ${money(t.pnl)}</b></div>`).join("") || '<span class="muted">No trades yet</span>';
}

/* ---------- journal ---------- */
let eqChart, eqSeries, jTrades = [];
async function loadJournal() {
  let q = sb.from("trades").select("*").order("t_exit", { ascending: true }).limit(5000); const fs = $("j-sym").value; if (fs) q = q.eq("symbol", fs);
  const { data, error } = await q; if (error) return toast(error.message); jTrades = data || [];
  const n = jTrades.length, w = jTrades.filter((t) => t.pnl > 0), l = jTrades.filter((t) => t.pnl < 0);
  const gp = w.reduce((s, t) => s + +t.pnl, 0), gl = -l.reduce((s, t) => s + +t.pnl, 0), tot = gp - gl;
  let run = 0, peak = 0, mdd = 0; const eq = []; jTrades.forEach((t, i) => { run += +t.pnl; peak = Math.max(peak, run); mdd = Math.max(mdd, peak - run); eq.push({ time: i + 1, value: run }); });
  const avgR = n ? jTrades.reduce((s, t) => s + +t.r, 0) / n : 0;
  const box = (k, v) => `<div><span class="muted small">${k}</span><b>${v}</b></div>`;
  $("stats").innerHTML = box("Trades", n) + box("Win rate", n ? Math.round((100 * w.length) / n) + "%" : "—") + box("Avg R", avgR.toFixed(2)) + box("Profit factor", gl ? (gp / gl).toFixed(2) : "—") + box("Net P&L", money(tot)) + box("Max drawdown", money(-mdd)) + box("Avg win", w.length ? money(gp / w.length) : "—") + box("Avg loss", l.length ? money(-gl / l.length) : "—");
  if (!eqChart) { eqChart = LightweightCharts.createChart($("eqchart"), { layout: { background: { color: "#0b0e13" }, textColor: "#9aa4b2" }, grid: { vertLines: { visible: false }, horzLines: { color: "#141a22" } }, timeScale: { visible: false }, autoSize: true }); eqSeries = eqChart.addLineSeries({ color: "#38d39f", lineWidth: 2 }); }
  eqSeries.setData(eq); eqChart.timeScale().fitContent();
  $("jrows").innerHTML = jTrades.slice().reverse().map((t) => `<tr data-id="${t.id}"><td>${fmt(loc(t.t_entry))}</td><td>${t.symbol}</td><td>${t.dir > 0 ? "Long" : "Short"}</td><td>${t.qty}</td><td>${(+t.entry).toFixed(2)}</td><td>${t.exit != null ? (+t.exit).toFixed(2) : ""}</td><td>${t.r}</td><td class="${t.pnl >= 0 ? "pos-up" : "pos-dn"}">${money(+t.pnl)}</td><td><input class="note" value="${(t.notes || "").replace(/"/g, "&quot;")}" placeholder="add a note"></td><td>${t.shots && t.shots.length ? '<a href="#" class="shotlink">📷</a>' : ""}</td></tr>`).join("");
}
async function exportCsv() {
  const h = ["date_ny", "symbol", "side", "qty", "entry", "stop", "target", "exit", "r", "pnl", "fees", "outcome", "notes"];
  const rows = jTrades.map((t) => [fmt(loc(t.t_entry)), t.symbol, t.dir > 0 ? "long" : "short", t.qty, t.entry, t.stop, t.target, t.exit, t.r, t.pnl, t.fees, t.outcome, JSON.stringify(t.notes || "")].join(","));
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([h.join(",") + "\n" + rows.join("\n")], { type: "text/csv" })); a.download = "rewind-journal.csv"; a.click();
}

/* ---------- prefs / settings ---------- */
async function loadPrefs() { const { data } = await sb.from("prefs").select("data").maybeSingle(); if (data && data.data) Object.assign(prefs, data.data); }
function savePrefs() { sb.from("prefs").upsert({ user_id: user.id, data: prefs, updated_at: new Date().toISOString() }).then(() => {}); }
function fillSettings() { $("s-bal").value = prefs.bal; $("s-dll").value = prefs.dll; $("s-mdd").value = prefs.mdd; $("s-fee").value = prefs.fee; $("s-mfee").value = prefs.mfee; $("s-opens").checked = !!prefs.opens; $("riskp").value = prefs.riskp; $("stoppts").value = prefs.stoppts; $("tgtr").value = prefs.tgtr; $("sym").value = prefs.sym; }
function saveSettings() {
  Object.assign(prefs, { bal: +$("s-bal").value, dll: +$("s-dll").value, mdd: +$("s-mdd").value, fee: +$("s-fee").value, mfee: +$("s-mfee").value, opens: $("s-opens").checked });
  savePrefs(); drawOpens(); updateAcct(); $("s-msg").textContent = "Saved. Balance changes apply to the next session.";
}

/* ---------- admin ---------- */
async function loadAdmin() {
  const { data: al } = await sb.from("allowlist").select("*").order("added_at");
  $("ad-list").innerHTML = (al || []).map((a) => `<div class="row"><span style="flex:1">${a.email} <span class="muted">(${a.role})</span></span>${a.role === "admin" ? "" : `<button class="ghost small" data-del="${a.email}">Remove</button>`}</div>`).join("");
  const { data: fs } = await sb.from("features").select("*").order("key");
  $("ad-feat").innerHTML = (fs || []).map((f) => `<label><input type="checkbox" data-feat="${f.key}" ${f.enabled ? "checked" : ""}> ${f.label}</label>`).join("");
  const { data: bf } = await sb.from("bar_files").select("symbol,tf,day").order("day");
  const g = {}; (bf || []).forEach((r) => { const k = r.symbol + " " + r.tf; (g[k] = g[k] || []).push(r.day); });
  $("ad-data").innerHTML = Object.entries(g).map(([k, d]) => `${k}: ${d.length} months (${d[0].slice(0, 7)} → ${d[d.length - 1].slice(0, 7)})`).join("<br>") || "No data uploaded yet";
}

/* ---------- boot ---------- */
let toastT; function toast(m) { $("clock").dataset.msg = m; if (!m) return updateClock(); $("clock").textContent = m; clearTimeout(toastT); toastT = setTimeout(updateClock, 3000); }
function tab(name) { document.querySelectorAll(".tab").forEach((b) => b.classList.toggle("on", b.dataset.tab === name)); document.querySelectorAll(".view").forEach((v) => v.classList.toggle("hidden", v.id !== "v-" + name)); if (name === "journal") loadJournal(); if (name === "admin") loadAdmin(); }
async function boot() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) { $("auth").classList.remove("hidden"); $("app").classList.add("hidden"); return; }
  user = session.user;
  const { data: me } = await sb.rpc("is_member");
  if (!me) { $("auth").classList.remove("hidden"); $("a-msg").textContent = "Signed in as " + user.email + ", but this email isn't on the invite list yet. Ask King to add you."; return; }
  isAdmin = !!(await sb.rpc("is_admin")).data; $("tab-admin").classList.toggle("hidden", !isAdmin);
  const { data: fs } = await sb.from("features").select("key,enabled"); (fs || []).forEach((f) => (features[f.key] = f.enabled));
  await loadPrefs();
  $("auth").classList.add("hidden"); $("app").classList.remove("hidden"); $("who").textContent = user.email;
  const tfs = TFS.filter(([n]) => features.sec15 !== false || !n.endsWith("s")); $("tf").innerHTML = tfs.map(([n]) => `<option ${n === prefs.tf ? "selected" : ""}>${n}</option>`).join("");
  if (features.journal === false) document.querySelector('[data-tab="journal"]').classList.add("hidden");
  fillSettings(); if (!chart) initChart();
  if (!$("start").value) { const d = new Date(Date.now() - 7 * 864e5); $("start").value = d.toISOString().slice(0, 10) + "T09:20"; }
}
$("a-in").onclick = async () => { const { error } = await sb.auth.signInWithPassword({ email: $("a-email").value.trim(), password: $("a-pass").value }); $("a-msg").textContent = error ? error.message : ""; if (!error) boot(); };
$("a-up").onclick = async () => { const { data, error } = await sb.auth.signUp({ email: $("a-email").value.trim(), password: $("a-pass").value, options: { emailRedirectTo: location.origin + location.pathname } }); $("a-msg").textContent = error ? error.message : data.session ? "" : "Check your email to confirm, then sign in here."; if (data && data.session) boot(); };
$("logout").onclick = async () => { await sb.auth.signOut(); location.reload(); };
document.querySelectorAll(".tab").forEach((b) => (b.onclick = () => tab(b.dataset.tab)));
$("go").onclick = loadReplay; $("play").onclick = play; $("step").onclick = () => { pause(); stepFwd(); }; $("back").onclick = () => { pause(); stepBack(); };
$("buy").onclick = () => enter(1); $("sell").onclick = () => enter(-1); $("flat").onclick = flatten; $("be").onclick = toBE;
["riskp", "stoppts", "tgtr"].forEach((k) => ($(k).onchange = () => { prefs[k] = +$(k).value; savePrefs(); }));
$("s-save").onclick = saveSettings; $("j-sym").onchange = loadJournal; $("j-csv").onclick = exportCsv;
$("jrows").addEventListener("change", (e) => { if (!e.target.classList.contains("note")) return; const id = e.target.closest("tr").dataset.id; sb.from("trades").update({ notes: e.target.value }).eq("id", id).then(() => {}); });
$("jrows").addEventListener("click", async (e) => { if (!e.target.classList.contains("shotlink")) return; e.preventDefault(); const t = jTrades.find((x) => x.id === e.target.closest("tr").dataset.id); const { data } = await sb.storage.from("shots").createSignedUrl(t.shots[0], 300); if (data) window.open(data.signedUrl, "_blank"); });
$("ad-add").onclick = async () => { const e = $("ad-email").value.trim().toLowerCase(); if (!e) return; const { error } = await sb.from("allowlist").insert({ email: e }); if (error) alert(error.message); $("ad-email").value = ""; loadAdmin(); };
$("ad-list").addEventListener("click", async (e) => { const em = e.target.dataset.del; if (!em || !confirm("Remove " + em + "? Their saved data stays, they just can't get in.")) return; await sb.from("allowlist").delete().eq("email", em); loadAdmin(); });
$("ad-feat").addEventListener("change", async (e) => { const k = e.target.dataset.feat; if (!k) return; await sb.from("features").update({ enabled: e.target.checked, updated_at: new Date().toISOString() }).eq("key", k); });
document.addEventListener("keydown", (e) => {
  if (e.target.tagName === "INPUT" || $("v-replay").classList.contains("hidden")) return;
  if (e.code === "Space") { e.preventDefault(); play(); } else if (e.key === "ArrowRight") { pause(); stepFwd(); } else if (e.key === "ArrowLeft") { pause(); stepBack(); }
  else if (e.key === "b") enter(1); else if (e.key === "s") enter(-1); else if (e.key === "x") flatten();
});
sb.auth.onAuthStateChange((ev) => { if (ev === "SIGNED_IN" && !user) boot(); });
boot();
