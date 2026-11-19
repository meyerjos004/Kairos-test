/* KING_JOURNAL (King, Nov 18 2026): the trade journal, set up like King's Notion "Trading Journal".
   Three books (Live = typed by hand, Backtest = KAIROS replay trades, Reese = shared, from Discord) shown in one place; filter to any mix.
   Local-first: everything lives in this browser (IndexedDB) first, syncs to KAIROS's database second, and backs itself up to a folder
   on the person's own computer (plus an "Open my journal.html" that works with no site at all). Notion: full import (every property)
   and new Live trades sent back. Fields, tags, colors and the widget layout are all editable. */
(function () {
const NC = { default: ["#373737", "#d4d4d4"], gray: ["#474747", "#d4d4d4"], brown: ["#5c3b23", "#e8cfc0"], orange: ["#7a4a14", "#f6d6b4"], yellow: ["#7a6118", "#f5e3a8"],
  green: ["#2b5a3f", "#c8ead6"], blue: ["#284a73", "#c6dcf5"], purple: ["#4b3170", "#e0d0f5"], pink: ["#6d3150", "#f4cde0"], red: ["#7a3330", "#f5cdca"] };
const NCK = Object.keys(NC).slice(1);
const opts = (list, cols) => list.map((n, i) => ({ name: n, color: cols ? cols[i] : NCK[i % NCK.length] }));
const TF = ["1m", "2m", "3m", "5m", "15m", "30m", "1h", "4h", "1D"];
/* King's Notion Trades database, field for field */
const KING_FIELDS = () => [
  { k: "name", n: "Name", t: "title", core: 1 },
  { k: "date", n: "Date", t: "date", core: 1 },
  { k: "symbol", n: "Symbol", t: "select", core: 1, opts: opts(["NQ", "ES", "YM", "GC"], ["blue", "purple", "orange", "yellow"]) },
  { k: "position", n: "Position", t: "select", core: 1, opts: opts(["Long", "Short"], ["green", "red"]) },
  { k: "pnl", n: "Net P/L", t: "money", core: 1, big: 1 },
  { k: "risk", n: "$ Risk", t: "money", core: 1, big: 1 },
  { k: "account", n: "Account", t: "account", core: 1, pin: 1 },
  { k: "confluences", n: "Confluences", t: "multi", opts: opts(["Reversal", "Breakout", "Bullish SMT", "Bearish SMT", "Liquidity Sweep", ...TF, "FVG", "IFVG", "Displacement", "Retrace", "Rejection", "EQ", "Price Gap"]) },
  { k: "condition", n: "Market Condition", t: "multi", opts: opts(["Bullish", "HTF Bullish", "LTF Bullish", "Bearish", "HTF Bearish", "LTF Bearish", "Volatile", "Low Volatility", "Ranging", "Choppy", "1m Execution", "2m Execution", "5m Execution", "15m Execution"]) },
  { k: "catalyst", n: "Market Catalyst", t: "multi", opts: opts(["Unemployment Rate", "Unemployment Claims", "President Speech", "Retail Sales", "Inflation Rate", "Average Hourly Earnings", "Preliminary", "Housing", "Federal", "FOMC", "UoM", "PCE", "PMI", "GDP", "NFP", "CPI", "PPI", "MoM", "JOLTS", "No Catalyst"]) },
  { k: "targets", n: "Targets", t: "multi", opts: opts(["London High", "London Low", "Asia High", "Asia Low", "New York High", "New York Low", "Internal High", "Internal Low", "External High", "External Low", "EQ"]) },
  { k: "mentality", n: "Mentality", t: "multi", opts: opts(["Revenge Trade", "Emotional Trade", "Gamble", "Followed Rules", "A+", "A", "B+", "B", "C+", "C", "De-risk", "Up-Risk", "Negative RR", "1-1.5 RR", "1.5-2 RR", "2-4 RR", "4-20 RR"]) },
  { k: "notes", n: "Notes", t: "text" },
  { k: "takeaway", n: "Take away", t: "text" },
  { k: "files", n: "Charts & Attachments", t: "files", core: 1 },
];
/* Ben's Notion "New Trade" page (his screenshots, Nov 18) */
const BEN_FIELDS = () => [
  { k: "news", n: "News", t: "multi", opts: [["8:30AM", "gray"], ["10:00AM", "gray"], ["12:00PM", "gray"], ["2:00PM", "gray"], ["Fed Chair Speaks", "orange"], ["Consumer Confidence", "blue"], ["Unemployment Rate", "purple"], ["Unemployment Claims", "pink"], ["President Speech", "green"], ["Retail Sales", "orange"], ["Inflation Rate", "blue"], ["Average Hourly Earnings", "brown"], ["Preliminary", "pink"], ["Housing", "purple"], ["Federal", "blue"], ["FOMC", "yellow"], ["UoM", "pink"], ["PCE", "red"], ["PMI", "green"], ["GDP", "purple"], ["NFP", "orange"], ["CPI", "blue"], ["PPI", "red"], ["MoM", "brown"], ["JOLTS", "yellow"], ["ISM", "purple"], ["No News", "green"], ["No Catalyst", "gray"], ["Monday", "red"], ["Tuesday", "orange"], ["Wednesday", "yellow"], ["Thursday", "green"], ["Friday", "blue"]].map(([name, color]) => ({ name, color })) },
  { k: "thesis", n: "Thesis", t: "text" }, { k: "test", n: "Test", t: "text" }, { k: "corrections", n: "Corrections", t: "text" }, { k: "application", n: "Application", t: "text" },
  { k: "notes", n: "Notes", t: "text" }, { k: "keytake", n: "Key take away", t: "text" },
  { k: "l_entry", n: "Entry (15s,30s,1m)", t: "link" }, { k: "l_mtf", n: "MTF (5m-15m)", t: "link" }, { k: "l_htf", n: "HTF (1h-4h)", t: "link" },
];
const WIDGETS = { stats: "Overview", calendar: "Calendar", equity: "Equity curve", monthly: "Monthly P&L", breakdown: "Breakdown", accounts: "Accounts", sides: "Long vs short", mistakes: "Cost of mistakes" };
const DEF_LAYOUT = () => [{ id: "stats", w: 4 }, { id: "accounts", w: 4 }, { id: "calendar", w: 2 }, { id: "monthly", w: 2 }, { id: "equity", w: 2 }, { id: "breakdown", w: 2 }, { id: "sides", w: 2 }, { id: "mistakes", w: 2 }];
const BOOKS = { live: ["Live", "#2bd4a0"], backtest: ["Backtest", "#7aa7ff"], reese: ["Reese", "#c08bff"] };
const MISTAKE = /revenge|emotional|gamble|fomo|overtrad|negative rr|broke/i;

const J = window.JN = { cfg: null, ent: new Map(), bt: [], rs: [], kacc: [], view: "all", books: null, period: "all", side: "all", acct: "", q: "", day: null, cal: null, sel: null, edit: false, sort: ["net", -1], group: "month", ready: false };
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : "xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx".replace(/x/g, () => ((Math.random() * 16) | 0).toString(16)));
const nowIso = () => new Date().toISOString();
const $j = (id) => document.getElementById(id);
const fmtMoney = (x) => (x == null || isNaN(x) ? "—" : money(+x));
const field = (k) => J.cfg.fields.find((f) => f.k === k);
const optColor = (f, name) => { const o = f && (f.opts || []).find((x) => x.name === name); return NC[(o && o.color) || "default"] || NC.default; };
const chip = (f, name) => { const [bg, fg] = optColor(f, name); return `<span class="jtag" style="background:${bg};color:${fg}">${esc(name)}</span>`; };

/* ---------- local store (IndexedDB): entries, settings, files, the backup-folder handle ---------- */
let _idb;
function idb() { return _idb || (_idb = new Promise((ok, no) => { const r = indexedDB.open("kz-journal", 1); r.onupgradeneeded = () => { const d = r.result; d.createObjectStore("entries", { keyPath: "id" }); d.createObjectStore("kv"); d.createObjectStore("files"); }; r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); })); }
async function tx(store, mode, fn) { const d = await idb(); return new Promise((ok, no) => { const t = d.transaction(store, mode); const s = t.objectStore(store); const out = fn(s); t.oncomplete = () => ok(out && "result" in out ? out.result : out); t.onerror = () => no(t.error); }); }
const L = {
  all: () => tx("entries", "readonly", (s) => s.getAll()),
  put: (e) => tx("entries", "readwrite", (s) => { s.put(e); }),
  putMany: (es) => tx("entries", "readwrite", (s) => { es.forEach((e) => s.put(e)); }),
  get: (k) => tx("kv", "readonly", (s) => s.get(k)),
  set: (k, v) => tx("kv", "readwrite", (s) => { s.put(v, k); }),
  file: (k) => tx("files", "readonly", (s) => s.get(k)),
  setFile: (k, v) => tx("files", "readwrite", (s) => { s.put(v, k); }),
  allFiles: () => tx("files", "readonly", (s) => s.getAll()), fileKeys: () => tx("files", "readonly", (s) => s.getAllKeys()),
};
const scope = () => (typeof user !== "undefined" && user ? user.id : "local");

/* ---------- settings ---------- */
function defCfg() { return { v: 1, fields: KING_FIELDS(), accounts: [], layout: DEF_LAYOUT(), books: ["live", "backtest", "reese"], template: "king", notionMap: {}, updated: nowIso() }; }
async function loadCfg() {
  let c = await L.get("cfg:" + scope()).catch(() => null);
  if (!DEMO && user) try { const { data } = await sb.from("journal_config").select("data,updated_at").maybeSingle(); if (data && data.data && data.data.fields && (!c || data.data.updated > c.updated)) c = data.data; } catch (e) {}
  J.cfg = c || defCfg(); if (!J.cfg.layout) J.cfg.layout = DEF_LAYOUT(); for (const id of Object.keys(WIDGETS)) if (!J.cfg.layout.some((w) => w.id === id)) J.cfg.layout.push({ id, w: 2, hide: true });
  if (J.cfg.notionSrc && !J.cfg.notion) { J.cfg.notion = { [J.cfg.notionBook || "live"]: { db: J.cfg.notionSrc, sync: !!J.cfg.notionDb, pulled: J.cfg.notionPulled } }; }
  J.books = new Set(J.cfg.books || ["live", "backtest", "reese"]);
}
let _cfgT; function saveCfg() { J.cfg.updated = nowIso(); J.cfg.books = [...J.books]; L.set("cfg:" + scope(), J.cfg).catch(() => {}); clearTimeout(_cfgT);
  _cfgT = setTimeout(() => { if (!DEMO && user) sb.from("journal_config").upsert({ user_id: user.id, data: J.cfg, updated_at: nowIso() }).then(() => {}); backupSoon(); }, 1500); }

/* ---------- entries: sync with KAIROS's database (newest edit wins; offline edits wait in the browser) ---------- */
async function loadEntries() { const all = await L.all().catch(() => []); J.ent.clear(); for (const e of all) if (e.scope === scope()) J.ent.set(e.id, e); }
function saveEntry(e) { e.updated_at = nowIso(); e.dirty = true; e.scope = scope(); J.ent.set(e.id, e); L.put(e).catch(() => {}); syncSoon(); backupSoon(); }
let _syncT; const syncSoon = () => { clearTimeout(_syncT); _syncT = setTimeout(() => jSync().catch(() => {}), 2500); };
async function jSync() {
  if (DEMO || !user || !navigator.onLine) return;
  const dirty = [...J.ent.values()].filter((e) => e.dirty);
  for (let i = 0; i < dirty.length; i += 200) { const part = dirty.slice(i, i + 200);
    const { error } = await sb.from("journal_entries").upsert(part.map((e) => ({ id: e.id, user_id: user.id, book: e.book, ref: e.ref || null, src: e.src || "manual", src_id: e.src_id || null, data: e.data, deleted: !!e.deleted, updated_at: e.updated_at })));
    if (!error) { part.forEach((e) => { e.dirty = false; }); await L.putMany(part); } }
  const since = (await L.get("pulled:" + scope())) || "1970-01-01T00:00:00Z"; let last = since, got = 0;
  for (let p = 0; p < 50; p++) { const { data, error } = await sb.from("journal_entries").select("*").gt("updated_at", last).order("updated_at").limit(1000); if (error || !data || !data.length) break;
    const up = []; for (const r of data) { const l = J.ent.get(r.id); if (!l || (!l.dirty && r.updated_at >= l.updated_at)) { const e = { id: r.id, book: r.book, ref: r.ref, src: r.src, src_id: r.src_id, data: r.data, deleted: r.deleted, updated_at: r.updated_at, scope: scope() }; J.ent.set(e.id, e); up.push(e); } last = r.updated_at; }
    got += up.length; await L.putMany(up); if (data.length < 1000) break; }
  await L.set("pulled:" + scope(), last); if (got && J.ready) render();
}

/* ---------- the three books as one list of rows ---------- */
const nyHour = (lt) => new Date(lt * 1000).getUTCHours();
function rowLive(e) { let d = e.data || {}; if (!d.name) d = { ...d, name: [d.symbol, d.position, String(d.date || "").slice(5, 10)].filter(Boolean).join(" ") || "Untitled" }; const day = String(d.date || "").slice(0, 10) || String(e.updated_at).slice(0, 10);
  let hr = null; const ds = String(d.date || ""), m = ds.match(/T(\d\d):(\d\d)/);
  if (m) hr = /[zZ]|[+-]\d\d:?\d\d$/.test(ds) ? +new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", hourCycle: "h23" }).format(new Date(ds)) % 24 : +m[1];
  const at = (J.cfg.accounts.find((a) => a.name === (Array.isArray(d.account) ? (d.account[0] && (d.account[0].title || d.account[0])) : d.account)) || {}).type;
  return { id: e.id, book: e.book === "live" && at === "Backtest" ? "backtest" : e.book, e, d, day, hr, ts: Date.parse(day + "T12:00:00Z") / 1000 + (hr || 0) * 60, pnl: num(d.pnl), risk: num(d.risk), r0: null, base: null }; }
function rowBt(t) { const e = refEntry("backtest", t.id); const lt = loc(t.t_entry); const pv = (INST[t.symbol] || {}).pt || 20;
  const risk = t.stop != null ? Math.abs(t.entry - t.stop) * pv * (+t.qty || 1) : t.r ? Math.abs(t.pnl / t.r) : null; const ka = J.kacc.find((a) => a.id === t.account_id);
  const base = { name: `${t.symbol} ${t.dir > 0 ? "Long" : "Short"} ${t.qty}`, date: new Date(lt * 1000).toISOString().slice(0, 16), symbol: String(t.symbol).replace(/^M/, ""), position: t.dir > 0 ? "Long" : "Short", pnl: +t.pnl, risk, account: ka ? ka.name : "Backtest", notes: t.notes || "", confluences: (t.tags || []).filter((x) => !/^conf:/.test(x)), mentality: t.mistakes || [] };
  const d = { ...base, ...((e && e.data) || {}) }; return { id: "bt:" + t.id, book: "backtest", e, ref: t.id, d, base, day: sessDay(t.t_entry), hr: nyHour(lt), ts: t.t_entry, pnl: num(d.pnl), risk: num(d.risk), r0: t.r }; }
function rowRs(r) { const e = refEntry("reese", r.id); const pv = (INST[r.symbol] || {}).pt || 20; const pts = r.exit != null && r.entry != null && r.dir ? (r.exit - r.entry) * r.dir : null;
  const risk = r.stop != null && r.entry != null ? Math.abs(r.entry - r.stop) * pv : null; const hm = String(r.entry_t || "").match(/(\d{1,2}):(\d\d)/);
  const base = { name: `Reese ${r.symbol || ""} ${r.dir > 0 ? "Long" : r.dir < 0 ? "Short" : ""} · ${r.session || ""}`.trim(), date: r.day + (hm ? "T" + hm[1].padStart(2, "0") + ":" + hm[2] : ""), symbol: r.symbol, position: r.dir > 0 ? "Long" : r.dir < 0 ? "Short" : null,
    pnl: pts != null ? pts * pv : null, risk, account: "Reese", notes: r.summary || "", confluences: r.confluences || [] };
  const d = { ...base, ...((e && e.data) || {}) }; return { id: "rs:" + r.id, book: "reese", e, ref: r.id, d, base, day: r.day, hr: hm ? +hm[1] : null, ts: Date.parse(r.day + "T12:00:00Z") / 1000 + (hm ? +hm[1] * 60 : 0), pnl: num(d.pnl), risk: num(d.risk), r0: pts != null && risk ? (pts * pv) / risk : null }; }
const num = (v) => (v === "" || v == null || isNaN(+v) ? null : +v);
let _refIdx = null; function refEntry(book, id) { if (!_refIdx) { _refIdx = new Map(); for (const e of J.ent.values()) if (e.ref && !e.deleted) _refIdx.set(e.book + ":" + e.ref, e); } return _refIdx.get(book + ":" + id); }
function allRows() { _refIdx = null; const out = [];
  for (const e of J.ent.values()) if (!e.deleted && !e.ref) out.push(rowLive(e));
  for (const t of J.bt) out.push(rowBt(t)); for (const r of J.rs) if (r.dir || r.result) out.push(rowRs(r));
  for (const r of out) { r.r = r.risk ? r.pnl / r.risk : r.r0; r.out = r.pnl == null ? "Open" : r.pnl > 0 ? "Profit" : r.pnl < 0 ? "Loss" : "Breakeven"; }
  return out.sort((a, b) => b.ts - a.ts); }
function filtered(rows) { const y = new Date().getFullYear() + "", m = new Date().toISOString().slice(0, 7), q = J.q.toLowerCase();
  return rows.filter((r) => J.books.has(r.book) && (J.side === "all" || r.d.position === J.side) && (!J.acct || accName(r) === J.acct)
    && (J.period === "all" || (J.period === "year" ? r.day.startsWith(y) : J.period === "month" ? r.day.startsWith(m) : J.period === "30" ? r.day >= new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10) : r.day.startsWith(J.period)))
    && (!q || JSON.stringify(r.d).toLowerCase().includes(q))); }
const accName = (r) => { const a = r.d.account; return Array.isArray(a) ? (a[0] && (a[0].title || a[0])) || "" : a || ""; };

/* ---------- stats ---------- */
function agg(rows) { const c = rows.filter((r) => r.pnl != null); const w = c.filter((r) => r.pnl > 0), l = c.filter((r) => r.pnl < 0), b = c.length - w.length - l.length;
  const gp = w.reduce((s, r) => s + r.pnl, 0), gl = -l.reduce((s, r) => s + r.pnl, 0), rs = c.filter((r) => r.r != null && isFinite(r.r));
  let run = 0, pk = 0, dd = 0; [...c].sort((a, b2) => a.ts - b2.ts).forEach((r) => { run += r.pnl; pk = Math.max(pk, run); dd = Math.max(dd, pk - run); });
  return { n: c.length, w: w.length, l: l.length, b, net: gp - gl, wr: c.length ? (100 * w.length) / (w.length + l.length || 1) : null, pf: gl ? gp / gl : null, avgR: rs.length ? rs.reduce((s, r) => s + r.r, 0) / rs.length : null, avgW: w.length ? gp / w.length : null, avgL: l.length ? -gl / l.length : null, dd }; }
const GROUPS = { month: ["Month", (r) => r.day.slice(0, 7)], year: ["Year", (r) => r.day.slice(0, 4)], week: ["Week", (r) => { const d = new Date(r.day + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() - d.getUTCDay()); return "Wk of " + d.toISOString().slice(5, 10); }],
  weekday: ["Weekday", (r) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][new Date(r.day + "T00:00:00Z").getUTCDay()]], hour: ["Hour (NY)", (r) => (r.hr == null ? "No time" : String(r.hr).padStart(2, "0") + ":00")],
  account: ["Account", (r) => accName(r) || "No account"], book: ["Journal", (r) => BOOKS[r.book][0]], symbol: ["Symbol", (r) => r.d.symbol || "—"], side: ["Long / short", (r) => r.d.position || "—"], outcome: ["Outcome", (r) => r.out],
  rbucket: ["R bucket", (r) => (r.r == null ? "No R" : r.r < -1 ? "< -1R" : r.r < 0 ? "-1R to 0" : r.r < 1 ? "0 to 1R" : r.r < 2 ? "1R to 2R" : r.r < 4 ? "2R to 4R" : "4R+")] };
function groupers() { const g = { ...GROUPS }; for (const f of J.cfg.fields) if ((f.t === "multi" || f.t === "select") && !["symbol", "position"].includes(f.k)) g["f:" + f.k] = [f.n, (r) => { const v = r.d[f.k]; return Array.isArray(v) ? (v.length ? v : ["(none)"]) : v || "(none)"; }]; return g; }
function groupBy(rows, key) { const fn = groupers()[key][1]; const m = new Map(); for (const r of rows) { let k = fn(r); for (const x of Array.isArray(k) ? k : [k]) { if (!m.has(x)) m.set(x, []); m.get(x).push(r); } } return [...m.entries()].map(([k, rs]) => ({ k, ...agg(rs) })); }

/* ---------- render ---------- */
async function open() {
  if (!J.cfg) { await loadCfg(); await loadEntries(); J.ready = true; }
  render(); $j("tj-sync").textContent = "Loading trades…";
  try { const [bt, ka] = await Promise.all([db.allTrades(), db.accounts().catch(() => [])]); J.bt = bt || []; J.kacc = ka || []; J._loaded = 1; } catch (e) {}
  try { if (typeof reese !== "undefined") { if (!reese.length) await loadReese(); J.rs = reese || []; } } catch (e) {}
  render(); jSync().then(() => render()).catch(() => {}); backupUI(); $j("tj-sync").textContent = "";
  autoPull();
}
function render() { if (!J.cfg) return; const rows = allRows(); const fr = filtered(rows); J._rows = rows; J._fr = fr;
  $j("tj-books").innerHTML = Object.entries(BOOKS).map(([k, [n, c]]) => `<button class="jbook${J.books.has(k) ? " on" : ""}" data-b="${k}" style="--bc:${c}"><i></i>${n}<b>${rows.filter((r) => r.book === k).length}</b></button>`).join("");
  const accs = [...new Set(rows.map(accName).filter(Boolean))].sort();
  $j("tj-acct").innerHTML = `<option value="">All accounts</option>` + accs.map((a) => `<option${a === J.acct ? " selected" : ""}>${esc(a)}</option>`).join("");
  const months = [...new Set(rows.map((r) => r.day.slice(0, 7)))].sort().reverse(), years = [...new Set(rows.map((r) => r.day.slice(0, 4)))].sort().reverse();
  $j("tj-period").innerHTML = [["all", "All time"], ["year", "This year"], ["month", "This month"], ["30", "Last 30 days"], ...years.map((y) => [y, y]), ...months.map((m) => [m, new Date(m + "-15").toLocaleString("en-US", { month: "short", year: "numeric" })])].map(([v, n]) => `<option value="${v}"${v === J.period ? " selected" : ""}>${n}</option>`).join("");
  document.body.classList.toggle("jedit", J.edit); $j("tj-editbtn").textContent = J.edit ? "Done" : "Edit layout";
  $j("tj-wid").innerHTML = J.cfg.layout.filter((w) => !w.hide).map((w) => `<section class="jw" draggable="${J.edit}" data-w="${w.id}" style="grid-column:span ${w.w}"><header><span class="jgrip" title="Drag to move">⠿</span><b>${WIDGETS[w.id]}</b><span class="tsp"></span>${wHead(w.id)}<button class="jwsz" data-sz="${w.id}" title="Change width">${["", "¼", "½", "¾", "Full"][w.w]}</button><button class="jwx" data-hide="${w.id}" title="Hide this widget">×</button></header><div class="jwb" id="jw-${w.id}"></div></section>`).join("")
    + (J.edit ? `<section class="jw jadd" style="grid-column:span 4"><b>Add a widget:</b> ${J.cfg.layout.filter((w) => w.hide).map((w) => `<button data-show="${w.id}">+ ${WIDGETS[w.id]}</button>`).join("") || '<span class="muted small">All widgets are showing.</span>'}</section>` : "");
  for (const w of J.cfg.layout) if (!w.hide) try { WR[w.id](fr, rows); } catch (e) { $j("jw-" + w.id).textContent = "Couldn't draw this: " + e.message; }
  renderLog(fr);
}
function wHead(id) { if (id === "breakdown") return `<select id="tj-group">${Object.entries(groupers()).map(([k, [n]]) => `<option value="${k}"${k === J.group ? " selected" : ""}>By ${n.toLowerCase()}</option>`).join("")}</select>`;
  if (id === "calendar") return `<button class="jnav" data-cal="-1">‹</button><span class="small" id="tj-calt"></span><button class="jnav" data-cal="1">›</button><button class="jnav" data-share title="Share this month as a picture">⇪</button>`;
  if (id === "monthly") return `<button class="jnav" data-yr="-1">‹</button><span class="small" id="tj-yrt"></span><button class="jnav" data-yr="1">›</button>`; return ""; }
const stat = (k, v, cls = "") => `<div class="jst"><span>${k}</span><b class="${cls}">${v}</b></div>`;
const pc = (x) => (x == null ? "" : x > 0 ? "pos-up" : x < 0 ? "pos-dn" : "");
const WR = {
  stats(fr) { const a = agg(fr); $j("jw-stats").innerHTML = `<div class="jbig ${pc(a.net)}">${fmtMoney(a.net)}<small>net P&amp;L · ${a.n} trades</small></div><div class="jsts">` + stat("Win rate", a.wr == null ? "—" : Math.round(a.wr) + "%") + stat("W:L:B", `${a.w}:${a.l}:${a.b}`) + stat("Avg R", a.avgR == null ? "—" : a.avgR.toFixed(2) + "R") + stat("Profit factor", a.pf == null ? "—" : a.pf.toFixed(2)) + stat("Avg win", fmtMoney(a.avgW), "pos-up") + stat("Avg loss", fmtMoney(a.avgL), "pos-dn") + stat("Max drawdown", fmtMoney(-a.dd), "pos-dn") + "</div>"; },
  accounts(fr, rows) { const names = [...new Set([...J.cfg.accounts.map((a) => a.name), ...rows.filter((r) => J.books.has(r.book)).map(accName).filter(Boolean)])];
    $j("jw-accounts").innerHTML = names.length ? `<div class="jaccs">` + names.map((n) => { const meta = J.cfg.accounts.find((a) => a.name === n) || {}; const a = agg(rows.filter((r) => accName(r) === n && J.books.has(r.book))); const dep = +meta.deposit || 0;
      return `<button class="jacc${J.acct === n ? " on" : ""}" data-acc="${esc(n)}"><div class="row"><b>${esc(n)}</b>${meta.type ? `<span class="jtag" style="background:${NC[meta.type === "Live" || meta.type === "Funded" ? "green" : meta.type === "Demo" || meta.type === "Eval" ? "yellow" : "blue"][0]}">${meta.type}</span>` : ""}</div><div class="jab ${pc(a.net)}">${dep ? fmtMoney(dep + a.net) : fmtMoney(a.net)}</div><div class="muted small">${dep ? "Balance · deposit " + fmtMoney(dep) + " · " : ""}${a.n} trades · ${a.wr == null ? "—" : Math.round(a.wr) + "%"} · ${a.w}:${a.l}:${a.b}</div></button>`; }).join("") + `<button class="jacc jnew" id="tj-newacc">+ Account</button></div>` : `<div class="muted small">No accounts yet. <button class="ghost small" id="tj-newacc">+ Add account</button></div>`; },
  calendar(fr) { const m = J.cal || (fr[0] ? fr[0].day.slice(0, 7) : new Date().toISOString().slice(0, 7)); J.cal = m; const [y, mo] = m.split("-").map(Number); const first = new Date(Date.UTC(y, mo - 1, 1)), days = new Date(Date.UTC(y, mo, 0)).getUTCDate();
    $j("tj-calt").textContent = first.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" }); const by = {}; for (const r of fr) if (r.day.startsWith(m)) (by[r.day] = by[r.day] || []).push(r);
    let h = `<div class="jcal">${["S", "M", "T", "W", "T", "F", "S", "Wk"].map((d) => `<i>${d}</i>`).join("")}`, wk = 0, wn = 0; for (let i = 0; i < first.getUTCDay(); i++) h += "<span></span>";
    for (let d = 1; d <= days; d++) { const k = m + "-" + String(d).padStart(2, "0"), rs = by[k] || [], a = agg(rs); wk += a.net; wn += a.n;
      h += `<button class="jcd ${rs.length ? (a.net > 0 ? "up" : a.net < 0 ? "dn" : "be") : ""}${J.day === k ? " on" : ""}" data-day="${k}"><em>${d}</em>${rs.length ? `<b class="jfull">${fmtMoney(a.net)}</b><b class="jshort">${kM(a.net)}</b><small>${rs.length}</small>` : ""}</button>`;
      if ((first.getUTCDay() + d) % 7 === 0 || d === days) { if (d === days) for (let i = (first.getUTCDay() + d) % 7; i && i < 7; i++) h += "<span></span>"; h += `<div class="jcw ${pc(wk)}">${wn ? `<span class="jfull">${fmtMoney(wk)}</span><span class="jshort">${kM(wk)}</span>` : ""}</div>`; wk = 0; wn = 0; } }
    $j("jw-calendar").innerHTML = h + "</div>"; },
  monthly(fr) { const ys = [...new Set(fr.map((r) => r.day.slice(0, 4)))].sort(); if (!J.yr) J.yr = ys[ys.length - 1] || String(new Date().getFullYear()); $j("tj-yrt").textContent = J.yr;
    const ms = Array.from({ length: 12 }, (_, i) => agg(fr.filter((r) => r.day.startsWith(J.yr + "-" + String(i + 1).padStart(2, "0"))))); const mx = Math.max(1, ...ms.map((a) => Math.abs(a.net))); const tot = agg(fr.filter((r) => r.day.startsWith(J.yr)));
    $j("jw-monthly").innerHTML = `<div class="jbars">${ms.map((a, i) => `<button class="jbar" data-month="${J.yr}-${String(i + 1).padStart(2, "0")}" title="${a.n} trades"><span class="${a.net >= 0 ? "u" : "d"}" style="height:${(Math.abs(a.net) / mx) * 100}%"></span><em>${"JFMAMJJASOND"[i]}</em><small class="${pc(a.net)}">${a.n ? (Math.abs(a.net) >= 1000 ? (a.net / 1000).toFixed(1) + "k" : Math.round(a.net)) : ""}</small></button>`).join("")}</div><div class="muted small">${J.yr}: <b class="${pc(tot.net)}">${fmtMoney(tot.net)}</b> · ${tot.n} trades · ${tot.wr == null ? "—" : Math.round(tot.wr) + "%"} win rate</div>`; },
  equity(fr) { const c = [...fr].filter((r) => r.pnl != null).sort((a, b) => a.ts - b.ts); let run = 0; const pts = c.map((r) => (run += r.pnl)); const el = $j("jw-equity");
    if (pts.length < 2) { el.innerHTML = '<div class="muted small">Log two trades to see your curve.</div>'; return; } const W = 600, H = 150, mn = Math.min(0, ...pts), mx = Math.max(0, ...pts), sy = (v) => H - 6 - ((v - mn) / (mx - mn || 1)) * (H - 12);
    const d = pts.map((v, i) => `${((i / (pts.length - 1)) * W).toFixed(1)},${sy(v).toFixed(1)}`).join(" "); const col = run >= 0 ? "#2bd4a0" : "#ff4d5e";
    el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" class="jeq"><line x1="0" x2="${W}" y1="${sy(0)}" y2="${sy(0)}" stroke="rgba(255,255,255,.12)" stroke-dasharray="4 4"/><polygon points="0,${sy(0)} ${d} ${W},${sy(0)}" fill="${col}" opacity=".14"/><polyline points="${d}" fill="none" stroke="${col}" stroke-width="2" vector-effect="non-scaling-stroke"/></svg><div class="muted small">${pts.length} trades · ${fmtMoney(run)} · peak ${fmtMoney(Math.max(...pts))}</div>`; },
  breakdown(fr) { const g = groupBy(fr, J.group); const [sk, sd] = J.sort; g.sort((a, b) => (sk === "k" ? String(a.k).localeCompare(String(b.k)) : (a[sk] ?? -1e9) - (b[sk] ?? -1e9)) * sd); const mx = Math.max(1, ...g.map((x) => Math.abs(x.net)));
    const th = (k, n) => `<th data-sort="${k}" class="${sk === k ? "on" : ""}">${n}${sk === k ? (sd > 0 ? " ▲" : " ▼") : ""}</th>`;
    $j("jw-breakdown").innerHTML = g.length ? `<div class="jbd"><table class="tbl"><thead><tr>${th("k", groupers()[J.group][0])}${th("n", "Trades")}${th("wr", "Win %")}${th("net", "Net")}${th("avgR", "Avg R")}${th("pf", "PF")}</tr></thead><tbody>${g.map((x) => `<tr><td>${esc(x.k)}</td><td>${x.n}</td><td>${x.wr == null ? "—" : Math.round(x.wr) + "%"}</td><td class="${pc(x.net)}"><span class="jnb ${x.net >= 0 ? "u" : "d"}" style="width:${(Math.abs(x.net) / mx) * 60}px"></span>${fmtMoney(x.net)}</td><td>${x.avgR == null ? "—" : x.avgR.toFixed(2)}</td><td>${x.pf == null ? "—" : x.pf.toFixed(2)}</td></tr>`).join("")}</tbody></table></div>` : '<div class="muted small">No trades in this filter.</div>'; },
  sides(fr) { const L2 = agg(fr.filter((r) => r.d.position === "Long")), S = agg(fr.filter((r) => r.d.position === "Short"));
    const col = (n, a, c) => `<div class="jside"><b style="color:${c}">${n}</b><div class="jbig ${pc(a.net)}" style="font-size:22px">${fmtMoney(a.net)}</div><div class="muted small">${a.n} trades · ${a.wr == null ? "—" : Math.round(a.wr) + "%"} win · ${a.avgR == null ? "—" : a.avgR.toFixed(2) + "R"} avg</div></div>`;
    $j("jw-sides").innerHTML = `<div class="jsides">${col("Long", L2, "#2bd4a0")}${col("Short", S, "#ff4d5e")}</div>`; },
  mistakes(fr) { const tagged = fr.filter((r) => Object.values(r.d).some((v) => (Array.isArray(v) ? v : [v]).some((x) => typeof x === "string" && MISTAKE.test(x)))); const a = agg(tagged), all = agg(fr);
    $j("jw-mistakes").innerHTML = `<div class="jbig ${pc(a.net)}" style="font-size:24px">${fmtMoney(a.net)}<small>from ${a.n} trades tagged revenge, emotional, gamble or negative RR</small></div><div class="muted small">Without them you'd be at <b class="${pc(all.net - a.net)}">${fmtMoney(all.net - a.net)}</b>.</div>`; },
};
const VIEWS = { all: "All trades", gallery: "Gallery", Profit: "Profit", Loss: "Loss", Breakeven: "Breakeven" };
function renderLog(fr) { let rows = J.day ? fr.filter((r) => r.day === J.day) : fr; if (["Profit", "Loss", "Breakeven"].includes(J.view)) rows = rows.filter((r) => r.out === J.view);
  $j("tj-views").innerHTML = Object.entries(VIEWS).map(([k, n]) => `<button class="${J.view === k ? "on" : ""}" data-v="${k}">${n}</button>`).join("") + (J.day ? `<button class="on" data-clearday>${J.day} ×</button>` : "") + `<span class="tsp"></span><span class="muted small">${rows.length} shown</span>`;
  const show = J.cfg.fields.filter((f) => !f.hide && !["name", "date", "pnl", "risk", "files"].includes(f.k) && f.t !== "text").slice(0, 7);
  if (J.view === "gallery") { $j("tj-log").innerHTML = `<div class="jgal">${rows.slice(0, 200).map((r) => { const fl = (r.d.files || [])[0]; return `<button class="jcard" data-open="${r.id}"><div class="jcov" ${fl ? `data-fimg="${esc(fl.id || fl.path || fl.url)}"` : ""}>${fl ? "" : "No chart yet"}</div><b>${esc(r.d.name || "Untitled")}</b><div class="row"><span class="${pc(r.pnl)}">${fmtMoney(r.pnl)}</span>${outTag(r.out)}<span class="muted small">${r.r == null ? "" : r.r.toFixed(2) + "R"}</span></div><div class="muted small">${esc(accName(r))} · ${r.day}</div></button>`; }).join("") || '<div class="muted">Nothing here yet.</div>'}</div>`; fillImgs($j("tj-log")); return; }
  $j("tj-log").innerHTML = `<div class="tblwrap"><table class="tbl jtbl"><thead><tr><th>Date</th><th>Name</th><th>Journal</th><th>Outcome</th><th>R</th><th>Net P/L</th><th>$ Risk</th>${show.map((f) => `<th>${esc(f.n)}</th>`).join("")}</tr></thead><tbody>${rows.slice(0, J.lim || 500).map((r) => `<tr data-open="${r.id}"><td>${r.day}</td><td>${esc(r.d.name || "Untitled")}</td><td><span class="jbk" style="--bc:${BOOKS[r.book][1]}">${BOOKS[r.book][0]}</span></td><td>${outTag(r.out)}</td><td>${r.r == null ? "—" : r.r.toFixed(2)}</td><td class="${pc(r.pnl)}">${fmtMoney(r.pnl)}</td><td>${fmtMoney(r.risk)}</td>${show.map((f) => `<td>${cellVal(f, r.d[f.k])}</td>`).join("")}</tr>`).join("")}</tbody></table>${rows.length > (J.lim || 500) ? `<button class="btn jmore" data-more>Show ${Math.min(500, rows.length - (J.lim || 500))} more (${rows.length - (J.lim || 500)} hidden)</button>` : ""}${rows.length ? "" : '<div class="muted jempty">No trades match. Add one with <b>+ New trade</b>, or turn on another journal above.</div>'}</div>`; }
const outTag = (o) => `<span class="jtag" style="background:${NC[o === "Profit" ? "green" : o === "Loss" ? "red" : o === "Breakeven" ? "yellow" : "gray"][0]}">${o}</span>`;
function cellVal(f, v) { if (v == null || v === "") return '<span class="muted">—</span>'; if (f.t === "multi") return (Array.isArray(v) ? v : [v]).slice(0, 4).map((x) => chip(f, x)).join(" ") + ((v.length || 0) > 4 ? ` <span class="muted small">+${v.length - 4}</span>` : "");
  if (f.t === "select") return chip(f, v); if (f.t === "account") return esc(Array.isArray(v) ? (v[0] && (v[0].title || v[0])) || "" : v); if (f.t === "money") return fmtMoney(v); if (f.t === "link") return `<a href="${esc(v)}" target="_blank" rel="noopener">link</a>`; if (f.t === "check") return v ? "✓" : ""; return esc(String(v)).slice(0, 60); }

/* ---------- images: kept in this browser (works offline + goes into backups) and in KAIROS storage ---------- */
async function fillImgs(root) { for (const el of root.querySelectorAll("[data-fimg]")) { const k = el.dataset.fimg; const u = await fileUrl(k); if (u) { el.style.backgroundImage = `url("${u}")`; el.classList.add("has"); } } }
const _fu = {};
async function fileUrl(k) { if (!k) return null; if (_fu[k]) return _fu[k]; if (/^https?:/.test(k)) return (_fu[k] = k);
  const loc2 = await L.file(k).catch(() => null); if (loc2) return (_fu[k] = loc2);
  if (DEMO || !user) return null; try { const { data } = await sb.storage.from("journal").download(k); if (data) { const u = await blobUrl(data); L.setFile(k, u).catch(() => {}); return (_fu[k] = u); } } catch (e) {} return null; }
const blobUrl = (b) => new Promise((ok) => { const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.readAsDataURL(b); });
async function addImage(file) { const img = await createImageBitmap(file); const s = Math.min(1, 1800 / Math.max(img.width, img.height)); const c = document.createElement("canvas"); c.width = img.width * s; c.height = img.height * s; c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  const blob = await new Promise((ok) => c.toBlob(ok, "image/jpeg", 0.85)); const id = `${scope()}/${uid()}.jpg`; await L.setFile(id, await blobUrl(blob));
  if (!DEMO && user) sb.storage.from("journal").upload(id, blob, { contentType: "image/jpeg", upsert: true }).then(() => {}); return { id, name: file.name || "chart.jpg" }; }

/* ---------- quick backtest log: backtests matter less, so logging one takes a few taps ---------- */
const QUICK_DEF = new Set(["date", "symbol", "position", "confluences", "notes", "files", "news"]);
const isQuick = (f) => (f.quick != null ? f.quick : QUICK_DEF.has(f.k));
function openQuick(prev) { const e = { id: uid(), book: "backtest", src: "manual", data: { date: prev && prev.date ? String(prev.date).slice(0, 10) : new Date().toISOString().slice(0, 10), symbol: (prev && prev.symbol) || "NQ", risk: J.cfg.btRisk || 100, files: [] } };
  J.sel = { e, isNew: true, quick: true }; drawTrade(); $j("tj-page").classList.remove("hidden"); }
function drawQuick() { const s = J.sel, d = cur(), risk = num(d.risk) || J.cfg.btRisk || 100, pnl = num(d.pnl), R = pnl == null ? null : pnl / risk, man = !(s.r && s.r.ref);
  const res = pnl == null ? "" : pnl > 0 ? "win" : pnl < 0 ? "loss" : "be"; const sym = field("symbol"), pos = field("position");
  const one = (f, v) => (f && f.opts ? f.opts.map((o) => `<button class="qb${v === o.name ? " on" : ""}" data-qone="${f.k}" data-o="${esc(o.name)}">${chip(f, o.name)}</button>`).join("") : "");
  $j("tj-pagebox").innerHTML = `<div class="tph"><span class="jbk" style="--bc:${BOOKS.backtest[1]}">Backtest</span><b>Quick log</b><span class="tsp"></span>${privBox()}<button class="ghost small" id="tp-full">All fields</button>${s.isNew || !man ? "" : '<button class="ghost small danger" id="tp-del">Delete</button>'}<button class="ghost small" id="tp-close">Close</button></div>
  ${man ? `<div class="qrow"><span class="tpk">Result</span><div class="qres"><button class="qr w${res === "win" ? " on" : ""}" data-qres="win">Win</button><button class="qr l${res === "loss" ? " on" : ""}" data-qres="loss">Loss</button><button class="qr b${res === "be" ? " on" : ""}" data-qres="be">Breakeven</button>
    <label class="qrr">R <input type="number" step="0.1" id="tp-qr" value="${R == null ? "" : +R.toFixed(2)}" placeholder="2"></label></div></div>` : `<div class="qrow"><span class="tpk">Result (from the replay)</span><b class="${pc(pnl)}">${fmtMoney(pnl)} · ${R == null ? "—" : R.toFixed(2) + "R"}</b></div>`}
  ${man ? `<div class="qrow"><span class="tpk">Symbol</span><div class="qopts">${one(sym, d.symbol)}</div></div><div class="qrow"><span class="tpk">Side</span><div class="qopts">${one(pos, d.position)}</div></div>
  <div class="qrow"><span class="tpk">Date</span><input type="date" data-f="date" value="${esc(String(d.date || "").slice(0, 10))}"></div>` : ""}
  ${J.cfg.fields.filter((f) => !f.hide && isQuick(f) && f.t === "multi").map((f) => { const v = d[f.k] || []; return `<div class="qrow"><span class="tpk">${esc(f.n)}</span><div class="qopts">${(f.opts || []).map((o) => `<button class="qb${v.includes(o.name) ? " on" : ""}" data-qmul="${f.k}" data-o="${esc(o.name)}">${chip(f, o.name)}</button>`).join("")}</div></div>`; }).join("")}
  <div class="qrow"><span class="tpk">Note</span><textarea data-f="notes" rows="2" placeholder="One line on what you saw">${esc(d.notes || "")}</textarea></div>
  <div class="tpfiles"><div class="tpimgs" id="tp-imgs">${(d.files || []).map((fl, i) => `<div class="tpimg" data-fimg="${esc(fl.id || fl.path || fl.url)}"><button data-rmimg="${i}" title="Remove">×</button></div>`).join("")}<label class="tpadd">+ Chart<br><span class="muted small">or paste one</span><input type="file" accept="image/*" multiple id="tp-file" hidden></label></div></div>
  ${man ? '<div class="row qsave"><span class="tsp"></span><button class="primary" id="tp-next">Save + log another</button></div>' : ""}`; fillImgs($j("tj-pagebox")); }
function privBox() { const p = J.sel && J.sel.e && J.sel.e.data && J.sel.e.data._private; return `<label class="ck small jpriv" title="Keep this trade's notes out of the coach. Shared data helps everyone learn, so only use this when you need to."><input type="checkbox" id="tp-priv" ${p ? "checked" : ""}> 🔒 Private</label>`; }
function setMany(o) { const s = J.sel; s.e.data = { ...s.e.data, ...o }; if (s.isNew) { s.isNew = false; s.created = true; } saveEntry(s.e); pushSoon(s.e); }

/* ---------- the trade page (Notion-style: pinned row, big money, properties, charts) ---------- */
function openTrade(rid) { const r = rid ? J._rows.find((x) => x.id === rid) : null; let e;
  if (!r) { e = { id: uid(), book: "live", src: "manual", data: { name: "", date: new Date().toISOString().slice(0, 10), files: [] } }; J.sel = { e, isNew: true }; }
  else { e = r.e || (r.book === "live" ? null : { id: uid(), book: r.book, ref: r.ref, src: "manual", data: {} }); J.sel = { e, r }; }
  drawTrade(); $j("tj-page").classList.remove("hidden"); setTimeout(() => { const t = $j("tp-name"); if (!r && t) t.focus(); }, 50); }
function cur() { const s = J.sel; const base = (s.r && s.r.base) || {}; return { ...base, ...s.e.data }; }
function drawTrade() { if (J.sel.e.book === "backtest" && !J.sel.full) return drawQuick(); const s = J.sel, d = cur(), pnl = num(d.pnl), risk = num(d.risk), r = risk ? pnl / risk : s.r && s.r.r0; const out = pnl == null ? "Open" : pnl > 0 ? "Profit" : pnl < 0 ? "Loss" : "Breakeven"; const ro = s.e.book !== "live";
  const accs = [...new Set([...J.cfg.accounts.map((a) => a.name), ...(J._rows || []).map(accName).filter(Boolean)])];
  $j("tj-pagebox").innerHTML = `<div class="tph"><span class="jbk" style="--bc:${BOOKS[s.e.book][1]}">${BOOKS[s.e.book][0]}</span>${s.isNew ? `<select id="tp-book">${Object.entries(BOOKS).filter(([k]) => k !== "reese").map(([k, [n]]) => `<option value="${k}"${k === s.e.book ? " selected" : ""}>${n} journal</option>`).join("")}</select>` : ""}${ro ? `<span class="muted small">Prices come from the ${s.e.book === "reese" ? "Reese log" : "replay"}. Your tags and notes are yours.</span>` : ""}<span class="tsp"></span>${privBox()}${s.isNew ? "" : '<button class="ghost small" id="tp-coach" title="Ask the coach to review this trade">Review with coach</button>'}${!ro && !s.isNew ? '<button class="ghost small danger" id="tp-del">Delete</button>' : ""}<button class="ghost small" id="tp-close">Close</button></div>
  <input id="tp-name" class="tpname" placeholder="New trade" value="${esc(d.name || "")}">
  <div class="tppins"><div><span>Outcome</span>${outTag(out)}</div><div><span>R multiple</span><b>${r == null || !isFinite(r) ? "—" : r.toFixed(2) + "R"}</b></div><div><span>Account</span><input list="tp-accl" data-f="account" value="${esc(Array.isArray(d.account) ? (d.account[0] && (d.account[0].title || d.account[0])) || "" : d.account || "")}" placeholder="Empty"><datalist id="tp-accl">${accs.map((a) => `<option>${esc(a)}</option>`).join("")}</datalist></div></div>
  <div class="tpbig"><label><span>Net P/L</span><input type="number" step="any" data-f="pnl" value="${pnl ?? ""}" placeholder="Empty" class="${pc(pnl)}"></label><label><span>$ Risk</span><input type="number" step="any" data-f="risk" value="${risk ?? ""}" placeholder="Empty"></label></div>
  <div class="tpprops">${J.cfg.fields.filter((f) => !f.hide && !["name", "pnl", "risk", "account", "files"].includes(f.k)).map((f) => `<div class="tpp"><span class="tpk">${esc(f.n)}</span><div class="tpv">${editor(f, d[f.k])}</div></div>`).join("")}</div>
  <div class="tpfiles"><span class="tpk">Charts &amp; attachments</span><div class="tpimgs" id="tp-imgs">${(d.files || []).map((fl, i) => `<div class="tpimg" data-fimg="${esc(fl.id || fl.path || fl.url)}"><button data-rmimg="${i}" title="Remove">×</button></div>`).join("")}<label class="tpadd">+ Add chart<br><span class="muted small">or paste / drop an image</span><input type="file" accept="image/*" multiple id="tp-file" hidden></label></div></div>`;
  fillImgs($j("tj-pagebox")); }
function editor(f, v) { const a = `data-f="${f.k}"`;
  if (f.t === "multi" || f.t === "select") { const vs = v == null ? [] : Array.isArray(v) ? v : [v]; return `<div class="tpchips" ${a} data-t="${f.t}">${vs.map((x) => chip(f, x)).join(" ") || '<span class="muted">Empty</span>'}</div>`; }
  if (f.t === "date") return `<input type="datetime-local" ${a} value="${esc(String(v || "").slice(0, 16).length === 10 ? v + "T09:30" : String(v || "").slice(0, 16))}">`;
  if (f.t === "text") return `<textarea ${a} rows="${Math.min(8, Math.max(1, String(v || "").split("\n").length))}" placeholder="Empty">${esc(v || "")}</textarea>`;
  if (f.t === "number" || f.t === "money") return `<input type="number" step="any" ${a} value="${v ?? ""}" placeholder="Empty">`;
  if (f.t === "check") return `<input type="checkbox" ${a} ${v ? "checked" : ""}>`;
  if (f.t === "link") return `<div class="row"><input type="url" ${a} value="${esc(v || "")}" placeholder="Paste a TradingView link">${v ? `<a href="${esc(v)}" target="_blank" rel="noopener">Open</a>` : ""}</div>`;
  return `<input ${a} value="${esc(Array.isArray(v) ? v.join(", ") : v || "")}" placeholder="Empty">`; }
function setVal(k, v) { const s = J.sel; s.e.data = { ...s.e.data, [k]: v }; if (s.isNew) { s.isNew = false; s.created = true; } saveEntry(s.e); pushSoon(s.e); }
let _pt; function pushSoon(e) { const src = nsrc(e.book); if (!src || !src.db || !src.sync) return; clearTimeout(_pt); _pt = setTimeout(() => pushNotion(e).catch((er) => toast("Notion: " + er.message)), 4000); }
async function pushNotion(e) { const src = nsrc(e.book); const vals = {}; for (const f of J.cfg.fields) { const p = (f.nmap && f.nmap[e.book]) || (e.book === "live" && f.notion); if (!p) continue; let v = e.data[f.k]; if (f.t === "date" && v) v = String(v).length > 10 ? String(v).slice(0, 16) + ":00" : v; vals[p] = v; }
  const r = await notion("jpush", { db_id: src.db, page_id: e.src_id || undefined, values: vals, tz: Intl.DateTimeFormat().resolvedOptions().timeZone }); if (r.page_id && e.src_id !== r.page_id) { e.src_id = r.page_id; e.src = e.src || "notion"; saveEntry(e); } }
function tagPicker(el) { const f = field(el.dataset.f), multi = el.dataset.t === "multi"; const cur0 = cur()[f.k]; let sel = cur0 == null ? [] : Array.isArray(cur0) ? [...cur0] : [cur0];
  const pop = document.createElement("div"); pop.className = "jpop"; document.body.appendChild(pop); const rc = el.getBoundingClientRect(); pop.style.left = Math.min(rc.left, innerWidth - 330) + "px"; pop.style.top = Math.min(rc.bottom + 4, innerHeight - 380) + "px";
  const draw = (q = "") => { const ql = q.toLowerCase(); const list = (f.opts || []).filter((o) => o.name.toLowerCase().includes(ql)); const exact = (f.opts || []).some((o) => o.name.toLowerCase() === ql);
    pop.innerHTML = `<input placeholder="Search or create an option" value="${esc(q)}"><div class="jpsel">${sel.map((x) => chip(f, x)).join(" ")}</div><div class="jpl">${list.map((o) => `<button data-o="${esc(o.name)}" class="${sel.includes(o.name) ? "on" : ""}">${chip(f, o.name)}${sel.includes(o.name) ? " ✓" : ""}</button>`).join("")}${q && !exact ? `<button data-new="${esc(q)}">+ Create ${chip({ opts: [{ name: q, color: NCK[(f.opts || []).length % NCK.length] }] }, q)}</button>` : ""}</div>`;
    const inp = pop.querySelector("input"); inp.focus(); inp.setSelectionRange(q.length, q.length); inp.oninput = () => draw(inp.value);
    inp.onkeydown = (ev) => { if (ev.key === "Enter") { const b = pop.querySelector("[data-new],[data-o]"); b && b.click(); } if (ev.key === "Escape") close(); }; };
  const close = () => { pop.remove(); document.removeEventListener("mousedown", out, true); setVal(f.k, multi ? sel : sel[0] || null); drawTrade(); };
  const out = (ev) => { if (!pop.contains(ev.target)) close(); }; setTimeout(() => document.addEventListener("mousedown", out, true), 0);
  pop.onclick = (ev) => { const b = ev.target.closest("[data-o],[data-new]"); if (!b) return; let n = b.dataset.o || b.dataset.new;
    if (b.dataset.new) { f.opts = f.opts || []; f.opts.push({ name: n, color: NCK[f.opts.length % NCK.length] }); saveCfg(); }
    if (multi) sel = sel.includes(n) ? sel.filter((x) => x !== n) : [...sel, n]; else { sel = sel[0] === n ? [] : [n]; return close(); } draw(""); };
  draw(); }

/* ---------- backups on the person's own computer ---------- */
let _bkT; const backupSoon = () => { clearTimeout(_bkT); _bkT = setTimeout(() => backupNow(false).catch(() => {}), 8000); };
async function snapshot(withFiles = true) { const rows = J._rows || allRows(); const files = {};
  if (withFiles) { const keys = new Set(); rows.forEach((r) => (r.d.files || []).forEach((f) => keys.add(f.id || f.path))); for (const k of keys) { if (!k) continue; const u = await L.file(k).catch(() => null); if (u) files[k] = u; } }
  return { app: "KAIROS journal", v: 1, at: nowIso(), who: (typeof me !== "undefined" && me && me.name) || "", cfg: J.cfg, entries: [...J.ent.values()].map(({ dirty, scope: _s, ...e }) => e),
    rows: rows.map((r) => ({ id: r.id, book: r.book, day: r.day, out: r.out, r: r.r, pnl: r.pnl, risk: r.risk, d: r.d })), files }; }
async function backupNow(manual) {
  const dir = await L.get("dir:" + scope()).catch(() => null);
  if (!dir) { if (manual) return downloadBackup(); return; }
  if ((await dir.queryPermission({ mode: "readwrite" })) !== "granted") { if (!manual || (await dir.requestPermission({ mode: "readwrite" })) !== "granted") { backupUI("reconnect"); return; } }
  const snap = await snapshot(); const json = JSON.stringify(snap); const write = async (d, name, body) => { const fh = await d.getFileHandle(name, { create: true }); const w = await fh.createWritable(); await w.write(body); await w.close(); };
  await write(dir, "KAIROS journal backup.json", json); await write(dir, "Open my journal.html", viewerHtml(json));
  const daily = await dir.getDirectoryHandle("daily backups", { create: true }); await write(daily, "journal " + snap.at.slice(0, 10) + ".json", json);
  await L.set("bk:" + scope(), Date.now()); backupUI(); if (manual) toast("Backed up to your folder"); }
async function downloadBackup() { const snap = await snapshot(); const json = JSON.stringify(snap); const dl = (name, body, type) => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([body], { type })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); };
  dl("Open my journal " + snap.at.slice(0, 10) + ".html", viewerHtml(json), "text/html"); await L.set("bk:" + scope(), Date.now()); backupUI(); toast("Saved. Double-click that file any time to open your journal, no site needed."); }
async function pickFolder() { if (!window.showDirectoryPicker) return downloadBackup(); try { const d = await showDirectoryPicker({ id: "kairos-journal", mode: "readwrite", startIn: "documents" }); await L.set("dir:" + scope(), d); await backupNow(true); } catch (e) { if (e.name !== "AbortError") toast("Backup folder: " + e.message); } }
async function restoreFile(file) { const txt = await file.text(); let snap; try { snap = JSON.parse(txt); } catch (e) { const m = txt.match(/<script type="application\/json" id="jdata">([\s\S]*?)<\/script>/); if (m) snap = JSON.parse(m[1].replace(/<\\\//g, "</")); }
  if (!snap || snap.app !== "KAIROS journal") return toast("That isn't a KAIROS journal backup.");
  let n = 0; for (const e of snap.entries || []) { const l = J.ent.get(e.id); if (!l || e.updated_at > l.updated_at) { e.dirty = true; e.scope = scope(); J.ent.set(e.id, e); await L.put(e); n++; } }
  for (const [k, v] of Object.entries(snap.files || {})) await L.setFile(k, v).catch(() => {}); if (snap.cfg && (!J.cfg || snap.cfg.updated > J.cfg.updated)) { J.cfg = snap.cfg; saveCfg(); }
  syncSoon(); render(); toast(`Restored ${n} trade${n === 1 ? "" : "s"} from the backup.`); }
async function backupUI(state) { const el = $j("tj-bk"); if (!el) return; const dir = await L.get("dir:" + scope()).catch(() => null), t = await L.get("bk:" + scope()).catch(() => 0);
  const ago = t ? Math.round((Date.now() - t) / 60000) : null; const agoS = ago == null ? "never" : ago < 1 ? "just now" : ago < 60 ? ago + " min ago" : ago < 1440 ? Math.round(ago / 60) + " h ago" : Math.round(ago / 1440) + " days ago";
  const warn = state === "reconnect" || !t || ago > 7 * 1440; el.className = "jbkc" + (warn ? " warn" : ""); el.innerHTML = state === "reconnect" ? "Reconnect your backup folder" : dir ? "Backed up " + agoS : t ? "Last backup " + agoS : "Set up a backup"; }

/* the offline viewer: one HTML file with the whole journal inside. Opens by double-click, no internet, no site. */
function viewerHtml(json) { const data = json.replace(/<\//g, "<\\/");
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>My KAIROS journal (offline copy)</title><style>
body{margin:0;background:#0a0a0d;color:#ecebf3;font:14px/1.5 Geist,system-ui,sans-serif}header{padding:20px 24px;border-bottom:1px solid #222}h1{font-size:20px;margin:0}small,.m{color:#8b8a99}
.f{display:flex;gap:8px;flex-wrap:wrap;padding:12px 24px}.f button,.f input,.f select{background:#16161c;color:#ecebf3;border:1px solid #2a2a33;border-radius:999px;padding:6px 12px;font:inherit}.f button.on{border-color:#a78bfa;background:rgba(167,139,250,.18)}
.s{display:flex;gap:24px;padding:4px 24px 12px;flex-wrap:wrap}.s b{display:block;font-size:22px}table{border-collapse:collapse;width:100%}th,td{text-align:left;padding:8px 12px;border-bottom:1px solid #1d1d24;vertical-align:top}th{color:#8b8a99;font-weight:500;font-size:12px;position:sticky;top:0;background:#0a0a0d}
tr.r{cursor:pointer}tr.r:hover{background:#15151b}.u{color:#2bd4a0}.d{color:#ff4d5e}.t{display:inline-block;padding:1px 8px;border-radius:4px;margin:1px;font-size:12px}.x td{background:#101015}.x img{max-width:420px;max-height:260px;border-radius:8px;margin:4px}.x .k{color:#8b8a99;width:180px}
</style></head><body><header><h1>My KAIROS journal</h1><small id="w"></small></header><div class="f" id="f"></div><div class="s" id="s"></div><div style="overflow:auto"><table><thead><tr><th>Date</th><th>Name</th><th>Journal</th><th>Outcome</th><th>R</th><th>Net P/L</th><th>Account</th></tr></thead><tbody id="b"></tbody></table></div>
<p class="m" style="padding:16px 24px">This file is a full copy of your journal, made by KAIROS. It works with no internet. To put it back into KAIROS: Journal → Backup → Restore, and pick this file.</p>
<script type="application/json" id="jdata">${data}</script><script>
const D=JSON.parse(document.getElementById("jdata").textContent),C={default:"#373737",gray:"#474747",brown:"#5c3b23",orange:"#7a4a14",yellow:"#7a6118",green:"#2b5a3f",blue:"#284a73",purple:"#4b3170",pink:"#6d3150",red:"#7a3330"};
const B={live:"Live",backtest:"Backtest",reese:"Reese"},on=new Set(Object.keys(B)),e=s=>String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"})[c]),$m=x=>x==null?"—":(x<0?"-$":"$")+Math.abs(x).toLocaleString(undefined,{maximumFractionDigits:0});
document.getElementById("w").textContent="Saved "+new Date(D.at).toLocaleString()+(D.who?" · "+D.who:"")+" · "+D.rows.length+" trades";let q="",open=null;
const col=(f,n)=>{const o=f&&(f.opts||[]).find(x=>x.name===n);return C[(o&&o.color)||"default"]||C.default};
function draw(){document.getElementById("f").innerHTML=Object.entries(B).map(([k,n])=>'<button data-b="'+k+'" class="'+(on.has(k)?"on":"")+'">'+n+"</button>").join("")+'<input id="q" placeholder="Search" value="'+e(q)+'">';
const rs=D.rows.filter(r=>on.has(r.book)&&(!q||JSON.stringify(r.d).toLowerCase().includes(q.toLowerCase()))),c=rs.filter(r=>r.pnl!=null),w=c.filter(r=>r.pnl>0).length,l=c.filter(r=>r.pnl<0).length,net=c.reduce((s,r)=>s+r.pnl,0);
document.getElementById("s").innerHTML="<div><small>Net P&L</small><b class="+(net>=0?"u":"d")+">"+$m(net)+"</b></div><div><small>Trades</small><b>"+c.length+"</b></div><div><small>Win rate</small><b>"+(w+l?Math.round(100*w/(w+l))+"%":"—")+"</b></div><div><small>W:L</small><b>"+w+":"+l+"</b></div>";
document.getElementById("b").innerHTML=rs.map(r=>{const a=Array.isArray(r.d.account)?(r.d.account[0]&&(r.d.account[0].title||r.d.account[0])):r.d.account;let h='<tr class="r" data-id="'+r.id+'"><td>'+r.day+"</td><td>"+e(r.d.name||"Untitled")+"</td><td>"+B[r.book]+"</td><td>"+r.out+"</td><td>"+(r.r==null?"—":(+r.r).toFixed(2))+'</td><td class="'+(r.pnl>0?"u":r.pnl<0?"d":"")+'">'+$m(r.pnl)+"</td><td>"+e(a||"")+"</td></tr>";
if(open===r.id){h+='<tr class="x"><td colspan="7"><table>'+D.cfg.fields.map(f=>{const v=r.d[f.k];if(v==null||v===""||(Array.isArray(v)&&!v.length))return"";let o;if(f.t==="files")o=v.map(x=>{const s=D.files[x.id||x.path]||x.url;return s?'<img src="'+e(s)+'">':e(x.name)}).join("");else if(Array.isArray(v))o=v.map(x=>'<span class="t" style="background:'+col(f,x.title||x)+'">'+e(x.title||x)+"</span>").join("");else if(f.t==="select")o='<span class="t" style="background:'+col(f,v)+'">'+e(v)+"</span>";else if(f.t==="link")o='<a style="color:#a78bfa" href="'+e(v)+'">'+e(v)+"</a>";else o=e(v).replace(/\\n/g,"<br>");return'<tr><td class="k">'+e(f.n)+"</td><td>"+o+"</td></tr>"}).join("")+"</table></td></tr>"}return h}).join("")}
document.addEventListener("click",ev=>{const b=ev.target.closest("[data-b]");if(b){on.has(b.dataset.b)?on.delete(b.dataset.b):on.add(b.dataset.b);draw()}const t=ev.target.closest("tr.r");if(t){open=open===t.dataset.id?null:t.dataset.id;draw()}});
document.addEventListener("input",ev=>{if(ev.target.id==="q"){q=ev.target.value;draw();const i=document.getElementById("q");i.focus();i.setSelectionRange(q.length,q.length)}});draw();
<\/script></body></html>`; }

/* ---------- Notion: bring in a whole journal (every property, colors, charts) and send new Live trades back ---------- */
const NTYPE = { title: "title", rich_text: "text", number: "number", select: "select", status: "select", multi_select: "multi", date: "date", url: "link", files: "files", checkbox: "check", relation: "account", email: "text", phone_number: "text" };
function coreFor(name, type) { const n = name.toLowerCase();
  if (type === "title") return "name"; if (type === "date" && /date|day|time|opened/.test(n)) return "date"; if (/^(symbol|ticker|instrument|asset|market)$/.test(n)) return "symbol";
  if (/^(position|side|direction|long.?short)$/.test(n)) return "position"; if (/(net ?p\/?l|^p ?& ?l$|^pnl$|^profit$)/.test(n) && type === "number") return "pnl"; if (/risk/.test(n) && type === "number") return "risk";
  if (/account/.test(n) && (type === "relation" || type === "select")) return "account"; if (type === "files" && /chart|attach|screenshot|image/.test(n)) return "files"; return null; }
function mergeSchema(schema, kind = "live") { const map = {};
  for (const [name, p] of Object.entries(schema)) { const t = NTYPE[p.type]; if (!t) continue; let f = field(coreFor(name, p.type)) || J.cfg.fields.find((x) => x.n.toLowerCase() === name.toLowerCase());
    if (!f) { f = { k: "n_" + name.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 30), n: name, t: t === "number" && /\$|p\/l|pnl|profit|loss|risk/i.test(name) ? "money" : t }; J.cfg.fields.splice(J.cfg.fields.length - 1, 0, f); }
    f.notion = name; f.nmap = { ...(f.nmap || {}), [kind]: name }; if (p.options && p.options.length && (f.t === "multi" || f.t === "select")) { f.opts = f.opts || []; for (const o of p.options) { const ex = f.opts.find((x) => x.name === o.name); if (ex) ex.color = o.color; else f.opts.push({ name: o.name, color: o.color }); } }
    map[name] = f; }
  saveCfg(); return map; }
function rowFromNotion(nr, map) { const d = {}; for (const [name, v] of Object.entries(nr.props)) { const f = map[name]; if (!f || v == null) continue;
    if (f.t === "account") { const t = Array.isArray(v) ? v.map((x) => x.title || x).filter(Boolean)[0] : v; if (t) { d.account = t; if (!J.cfg.accounts.some((a) => a.name === t)) J.cfg.accounts.push({ name: t, type: "Live" }); } continue; }
    if (f.t === "files") { d[f.k] = (v || []).map((x) => ({ path: x.path, url: x.url, name: x.name })); continue; }
    if (f.t === "multi" && !Array.isArray(v)) { d[f.k] = v ? [v] : []; continue; } d[f.k] = v; }
  if (!d.date) d.date = nr.created; return d; }
/* Two Notion journals per person: a live one and a backtesting one. Each can be a one-time copy, or kept in sync both ways. */
const NK = { live: "live trade journal", backtest: "backtesting journal" };
const nsrc = (k) => (J.cfg.notion = J.cfg.notion || {})[k];
async function pullNotion(kind, say) {   // Notion -> KAIROS. First run copies everything; later runs only ask for pages changed since the last pull.
  const src = nsrc(kind); if (!src || !src.db) return { add: 0, upd: 0 }; const started = nowIso(); let cursor = null, map = null, n = 0, add = 0, upd = 0;
  const bySrc = new Map([...J.ent.values()].filter((e) => e.src_id).map((e) => [e.src_id, e]));
  if (!src.pulled) { const s0 = await notion("jschema", { db_id: src.db }); map = mergeSchema(s0.schema, kind); } else map = Object.fromEntries(J.cfg.fields.filter((f) => f.nmap && f.nmap[kind]).map((f) => [f.nmap[kind], f]));
  do { const res = await notion("jimport", { db_id: src.db, cursor, since: src.pulled || undefined }); if (res.schema) map = mergeSchema(res.schema, kind); const batch = [];
    for (const nr of res.rows) { n++; const ex = bySrc.get(nr.id); const data = rowFromNotion(nr, map);
      if (ex) { if (ex.data._edited === nr.edited || ex.dirty) continue; ex.data = { ...ex.data, ...data, _edited: nr.edited }; ex.updated_at = nowIso(); ex.dirty = true; batch.push(ex); upd++; }
      else { const e = { id: uid(), book: kind, src: "notion", src_id: nr.id, data: { ...data, _edited: nr.edited }, updated_at: nowIso(), dirty: true, scope: scope() }; bySrc.set(nr.id, e); batch.push(e); add++; } }
    batch.forEach((e) => J.ent.set(e.id, e)); await L.putMany(batch); say && say(`Copying… ${n} trades read (${add} new, ${upd} updated)`); cursor = res.next_cursor; } while (cursor);
  src.pulled = new Date(Date.parse(started) - 120e3).toISOString(); src.count = [...J.ent.values()].filter((e) => e.src === "notion" && e.book === kind && !e.deleted).length; saveCfg();
  if (add || upd) { render(); jSync().catch(() => {}); backupSoon(); } return { add, upd };
}
async function autoPull() { if (DEMO || Date.now() - (J._np || 0) < 120e3) return; const kinds = Object.keys(NK).filter((k) => nsrc(k) && nsrc(k).sync && nsrc(k).pulled); if (!kinds.length) return; J._np = Date.now(); $j("tj-sync").textContent = "Checking Notion…";
  let a = 0, u = 0; try { for (const k of kinds) { const r = await pullNotion(k); a += r.add; u += r.upd; } $j("tj-sync").textContent = a + u ? `Notion: ${a} new, ${u} updated` : ""; } catch (e) { $j("tj-sync").textContent = "Notion: " + e.message; } }
async function notionDlg() {
  let st; try { st = await notion("status"); } catch (e) { return wideDlg(`<h3>Notion</h3><p class="muted">${DEMO ? "Notion is off in the demo." : esc(e.message)}</p>`, [{ t: "Close" }]); }
  if (!st.connected) return wideDlg(`<h3>Connect Notion first</h3><p>Go to <b>Settings → Notion</b> and connect. Then in Notion, open each journal you want to bring in, tap <b>•••</b> → <b>Connections</b> → <b>KAIROS</b>. Come back here after.</p>`, [{ t: "Close" }, { t: "Open Settings", primary: 1, f: () => view("settings") }]);
  const r = await notion("dbs"); const card = (k, title, blurb) => { const s = nsrc(k) || {};
    return `<div class="njc"><h4>${title}</h4><p class="muted small">${blurb}</p><select id="nj-db-${k}"><option value="">Pick it from your Notion…</option>${r.dbs.map((d) => `<option value="${d.id}"${d.id === s.db ? " selected" : ""}>${esc(d.title)}</option>`).join("")}</select>
      <button class="primary" id="nj-go-${k}">${s.pulled ? "Import again" : "Import " + NK[k]}</button>
      <label class="njsync"><input type="checkbox" id="nj-sync-${k}" ${s.sync ? "checked" : ""}><span><b>Sync?</b> Keep this journal and KAIROS matched from now on. Add or change a trade in either one and it shows up in both. Leave it off to just copy what's there today.</span></label>
      <div class="muted small" id="nj-msg-${k}">${s.pulled ? `${s.count ?? "Your"} trades copied${s.sync ? " · syncing" : " · not syncing"}` : ""}</div></div>`; };
  wideDlg(`<h3>Bring in your Notion journals</h3><p class="muted small">Your Notion stays exactly how it is. KAIROS copies every trade, every property, your tag colors and your chart pictures.</p>
    <div class="njgrid">${card("live", "Live trades", "The journal you log your real trades in.")}${card("backtest", "Backtesting", "The journal you log your backtests in.")}</div>`, [{ t: "Done", primary: 1 }]);
  for (const k of Object.keys(NK)) {
    $j("nj-sync-" + k).onchange = (ev) => { const s = (J.cfg.notion[k] = J.cfg.notion[k] || {}); s.sync = ev.target.checked; saveCfg(); const m = $j("nj-msg-" + k); if (s.pulled) m.textContent = `${s.count ?? "Your"} trades copied · ${s.sync ? "syncing" : "not syncing"}`; };
    $j("nj-go-" + k).onclick = async () => { const db0 = $j("nj-db-" + k).value, m = $j("nj-msg-" + k), b = $j("nj-go-" + k); if (!db0) return (m.textContent = "Pick your journal first.");
      const s = (J.cfg.notion[k] = J.cfg.notion[k] || {}); if (s.db !== db0) { s.pulled = null; s.db = db0; } s.title = $j("nj-db-" + k).selectedOptions[0].textContent; s.sync = $j("nj-sync-" + k).checked; saveCfg(); b.disabled = true;
      try { const res = await pullNotion(k, (t) => (m.textContent = t)); m.textContent = `✓ ${res.add} new, ${res.upd} updated · ${s.sync ? "syncing from now on" : "one-time copy (turn on Sync? to keep it matched)"}`; b.textContent = "Import again"; } catch (e) { m.textContent = "Notion: " + e.message; } b.disabled = false; };
  }
}

/* ---------- customize: fields, tags and colors, templates, accounts ---------- */
function customizeDlg() { const tab = J._ctab || "fields";
  const fieldsH = `<div class="jflist">${J.cfg.fields.map((f, i) => `<div class="jfr" draggable="true" data-fi="${i}"><span class="jgrip">⠿</span><input data-fn="${i}" value="${esc(f.n)}"><select data-ft="${i}" ${f.core ? "disabled" : ""}>${Object.entries({ text: "Text", number: "Number", money: "Money", select: "Select", multi: "Tags", date: "Date", link: "Link", check: "Checkbox", files: "Files", account: "Account", title: "Title" }).map(([k, n]) => `<option value="${k}"${k === f.t ? " selected" : ""}>${n}</option>`).join("")}</select>
    ${f.t === "multi" || f.t === "select" ? `<button class="ghost small" data-fo="${i}">${(f.opts || []).length} options</button>` : "<span></span>"}<label class="ck small"><input type="checkbox" data-fh="${i}" ${f.hide ? "" : "checked"}> Show</label><label class="ck small" title="Show on the quick backtest log"><input type="checkbox" data-fq="${i}" ${isQuick(f) ? "checked" : ""}> Quick</label>${f.core ? "<span></span>" : `<button class="ghost small danger" data-fd="${i}" title="Delete field">×</button>`}</div>`).join("")}</div>
    <div class="row"><button class="ghost" id="jc-add">+ Add field</button><span class="tsp"></span><span class="muted small">Start from:</span><button class="ghost small" data-tpl="king">King's layout</button><button class="ghost small" data-tpl="ben">Ben's layout</button></div>`;
  const accH = `<div class="jflist">${J.cfg.accounts.map((a, i) => `<div class="jfr"><input data-an="${i}" value="${esc(a.name)}"><select data-at="${i}">${["Live", "Demo", "Backtest", "Eval", "Funded"].map((t) => `<option${t === a.type ? " selected" : ""}>${t}</option>`).join("")}</select><input type="number" data-ad="${i}" value="${a.deposit ?? ""}" placeholder="Deposit $"><input data-ap="${i}" value="${esc(a.place || "")}" placeholder="Firm (Lucid, Apex…)"><button class="ghost small danger" data-ax="${i}">×</button></div>`).join("") || '<div class="muted small">No accounts yet.</div>'}</div><button class="ghost" id="jc-acc">+ Add account</button>`;
  wideDlg(`<h3>Customize your journal</h3><div class="jtplcta"><div><b>Journal somewhere else already?</b><div class="muted small">Send screenshots of it and the setup helper builds the same fields and tags here.</div></div><button class="primary" id="jc-tpl">Set up from a screenshot</button></div><div class="jtabs">${[["fields", "Fields and tags"], ["accounts", "Accounts"]].map(([k, n]) => `<button data-ct="${k}" class="${tab === k ? "on" : ""}">${n}</button>`).join("")}</div><div id="jc-body">${tab === "fields" ? fieldsH : accH}</div>`, [{ t: "Done", primary: 1, f: () => { saveCfg(); render(); } }]);
  const box = $j("dlgbox"); let dragI = null;
  box.onclick = (ev) => { const t = ev.target, d = t.dataset;
    if (d.ct) { J._ctab = d.ct; return customizeDlg(); } if (d.fd) { if (confirmDel(J.cfg.fields[d.fd].n)) { J.cfg.fields.splice(+d.fd, 1); saveCfg(); customizeDlg(); } }
    if (d.fo) return optsDlg(J.cfg.fields[+d.fo]); if (d.tpl) { applyTpl(d.tpl); customizeDlg(); } if (d.ax) { J.cfg.accounts.splice(+d.ax, 1); saveCfg(); customizeDlg(); }
    if (t.id === "jc-tpl") { $j("dlg").classList.add("hidden"); window.BOT && BOT.openTemplate(); return; }
    if (t.id === "jc-add") { J.cfg.fields.splice(J.cfg.fields.length - 1, 0, { k: "c_" + Date.now().toString(36), n: "New field", t: "multi", opts: [] }); saveCfg(); customizeDlg(); }
    if (t.id === "jc-acc") { J.cfg.accounts.push({ name: "Account " + (J.cfg.accounts.length + 1), type: "Live" }); saveCfg(); customizeDlg(); } };
  box.onchange = (ev) => { const d = ev.target.dataset, v = ev.target.value;
    if (d.fn) J.cfg.fields[d.fn].n = v; if (d.ft) { J.cfg.fields[d.ft].t = v; if (v === "multi" || v === "select") J.cfg.fields[d.ft].opts = J.cfg.fields[d.ft].opts || []; } if (d.fh) J.cfg.fields[d.fh].hide = !ev.target.checked; if (d.fq) J.cfg.fields[d.fq].quick = ev.target.checked;
    if (d.an) { const old = J.cfg.accounts[d.an].name; J.cfg.accounts[d.an].name = v; renameAcct(old, v); } if (d.at) J.cfg.accounts[d.at].type = v; if (d.ad) J.cfg.accounts[d.ad].deposit = +v || null; if (d.ap) J.cfg.accounts[d.ap].place = v; saveCfg(); if (d.ft) customizeDlg(); };
  box.ondragstart = (ev) => { const r = ev.target.closest("[data-fi]"); if (r) dragI = +r.dataset.fi; };
  box.ondragover = (ev) => { if (dragI != null && ev.target.closest("[data-fi]")) ev.preventDefault(); };
  box.ondrop = (ev) => { const r = ev.target.closest("[data-fi]"); if (!r || dragI == null) return; const [m] = J.cfg.fields.splice(dragI, 1); J.cfg.fields.splice(+r.dataset.fi, 0, m); dragI = null; saveCfg(); customizeDlg(); }; }
const confirmDel = (n) => window.confirm(`Delete the "${n}" field? Values already saved stay in your backups.`);
function renameAcct(old, nu) { for (const e of J.ent.values()) if (e.data && e.data.account === old) { e.data.account = nu; saveEntry(e); } }
function optsDlg(f) { wideDlg(`<h3>${esc(f.n)}: options</h3><p class="muted small">Tap a color to change it. Drag to reorder.</p><div class="jflist">${(f.opts || []).map((o, i) => `<div class="jfr" draggable="true" data-oi="${i}"><span class="jgrip">⠿</span>${chip(f, o.name)}<input data-on="${i}" value="${esc(o.name)}"><span class="jsw">${NCK.concat("default").map((c) => `<button data-oc="${i}" data-c="${c}" style="background:${NC[c][0]}" class="${o.color === c ? "on" : ""}" title="${c}"></button>`).join("")}</span><button class="ghost small danger" data-ox="${i}">×</button></div>`).join("")}</div><div class="row"><input id="jo-new" placeholder="New option"><button class="ghost" id="jo-add">Add</button></div>`, [{ t: "Back", primary: 1, f: () => customizeDlg() }]);
  const box = $j("dlgbox"); let dI = null;
  box.onclick = (ev) => { const d = ev.target.dataset; if (d.oc) { f.opts[+d.oc].color = d.c; saveCfg(); optsDlg(f); } if (d.ox) { f.opts.splice(+d.ox, 1); saveCfg(); optsDlg(f); }
    if (ev.target.id === "jo-add") { const v = $j("jo-new").value.trim(); if (v) { f.opts.push({ name: v, color: NCK[f.opts.length % NCK.length] }); saveCfg(); optsDlg(f); } } };
  box.onchange = (ev) => { const d = ev.target.dataset; if (d.on) { const old = f.opts[+d.on].name, nu = ev.target.value.trim(); if (!nu) return; f.opts[+d.on].name = nu; for (const e of J.ent.values()) { const v = e.data && e.data[f.k]; if (Array.isArray(v) && v.includes(old)) { e.data[f.k] = v.map((x) => (x === old ? nu : x)); saveEntry(e); } else if (v === old) { e.data[f.k] = nu; saveEntry(e); } } saveCfg(); optsDlg(f); } };
  box.ondragstart = (ev) => { const r = ev.target.closest("[data-oi]"); if (r) dI = +r.dataset.oi; }; box.ondragover = (ev) => { if (dI != null) ev.preventDefault(); };
  box.ondrop = (ev) => { const r = ev.target.closest("[data-oi]"); if (!r || dI == null) return; const [m] = f.opts.splice(dI, 1); f.opts.splice(+r.dataset.oi, 0, m); dI = null; saveCfg(); optsDlg(f); }; }
function applyTpl(t) { const add = t === "ben" ? BEN_FIELDS() : KING_FIELDS(); for (const f of add) { const ex = J.cfg.fields.find((x) => x.k === f.k || x.n.toLowerCase() === f.n.toLowerCase()); if (ex) { ex.hide = false; continue; } J.cfg.fields.splice(J.cfg.fields.length - 1, 0, f); } J.cfg.template = t; saveCfg(); }

/* ---------- wiring ---------- */
function wire() {
  const v = $j("v-tj"); if (!v || v._w) return; v._w = 1;
  v.addEventListener("click", (ev) => { const t = ev.target, b = t.closest("button,[data-open],tr[data-open]"); if (!b) return; const d = b.dataset;
    if (d.b) { J.books.has(d.b) ? J.books.delete(d.b) : J.books.add(d.b); saveCfg(); render(); }
    else if (d.open && !t.closest("a")) openTrade(d.open);
    else if (d.v) { J.view = d.v; render(); } else if ("clearday" in d) { J.day = null; render(); } else if ("share" in d) shareCard(); else if ("more" in d) { J.lim = (J.lim || 500) + 500; render(); } /* KING_JMORE: table used to silently stop at 500 rows */
    else if (d.day) { J.day = J.day === d.day ? null : d.day; render(); }
    else if (d.cal) { const [y, m] = J.cal.split("-").map(Number); J.cal = new Date(Date.UTC(y, m - 1 + +d.cal, 1)).toISOString().slice(0, 7); render(); }
    else if (d.yr) { J.yr = String(+J.yr + +d.yr); render(); } else if (d.month) { J.cal = d.month; render(); }
    else if (d.acc != null) { J.acct = J.acct === d.acc ? "" : d.acc; render(); }
    else if (d.sz) { const w = J.cfg.layout.find((x) => x.id === d.sz); w.w = (w.w % 4) + 1; saveCfg(); render(); }
    else if (d.hide) { J.cfg.layout.find((x) => x.id === d.hide).hide = true; saveCfg(); render(); }
    else if (d.show) { const w = J.cfg.layout.find((x) => x.id === d.show); w.hide = false; J.cfg.layout.splice(J.cfg.layout.indexOf(w), 1); J.cfg.layout.push(w); saveCfg(); render(); }
    else if (d.sort) { J.sort = J.sort[0] === d.sort ? [d.sort, -J.sort[1]] : [d.sort, -1]; render(); }
    else if (b.id === "tj-new") openTrade(null); else if (b.id === "tj-quick") openQuick(); else if (b.id === "tj-editbtn") { J.edit = !J.edit; render(); }
    else if (b.id === "tj-custom") customizeDlg(); else if (b.id === "tj-notion") notionDlg();
    else if (b.id === "tj-newacc") { J._ctab = "accounts"; J.cfg.accounts.push({ name: "Account " + (J.cfg.accounts.length + 1), type: "Live" }); saveCfg(); customizeDlg(); }
    else if (b.id === "tj-bk") bkDlg(); });
  v.addEventListener("change", (ev) => { const t = ev.target; if (t.id === "tj-period") J.period = t.value; else if (t.id === "tj-side") J.side = t.value; else if (t.id === "tj-acct") J.acct = t.value; else if (t.id === "tj-group") J.group = t.value; else return; render(); });
  let qT; $j("tj-q").addEventListener("input", (ev) => { clearTimeout(qT); qT = setTimeout(() => { J.q = ev.target.value; render(); }, 200); });
  let dw = null; const wid = $j("tj-wid");
  wid.addEventListener("dragstart", (ev) => { const s = ev.target.closest(".jw[data-w]"); if (!J.edit || !s) return; dw = s.dataset.w; s.classList.add("drag"); });
  wid.addEventListener("dragover", (ev) => { if (dw && ev.target.closest(".jw[data-w]")) ev.preventDefault(); });
  wid.addEventListener("drop", (ev) => { const s = ev.target.closest(".jw[data-w]"); if (!s || !dw) return; ev.preventDefault(); const L2 = J.cfg.layout, a = L2.findIndex((x) => x.id === dw), b = L2.findIndex((x) => x.id === s.dataset.w); const [m] = L2.splice(a, 1); L2.splice(b, 0, m); dw = null; saveCfg(); render(); });
  wid.addEventListener("dragend", () => { dw = null; });
  const pg = $j("tj-page");
  pg.addEventListener("click", (ev) => { const t = ev.target; if (t === pg || t.id === "tp-close") { pg.classList.add("hidden"); J.sel = null; render(); return; }
    if (t.id === "tp-del") { if (!window.confirm("Delete this trade? It stays in your backups.")) return; J.sel.e.deleted = true; saveEntry(J.sel.e); pg.classList.add("hidden"); render(); return; }
    if (t.id === "tp-coach") { const rid = J.sel.r ? J.sel.r.id : J.sel.e.id; const row = (J._rows || allRows()).find((x) => x.id === rid) || allRows().find((x) => x.id === rid); if (row && window.BOT) BOT.review(row); return; }
    if (t.id === "tp-full") { J.sel.full = true; drawTrade(); return; }
    if (t.id === "tp-next") { const d0 = cur(); if (d0.pnl == null && !(d0.confluences || []).length) { toast("Pick a result first"); return; } toast("Saved"); openQuick(d0); return; }
    const q = t.closest("[data-qres],[data-qone],[data-qmul]");
    if (q) { const d0 = cur(), risk = num(d0.risk) || J.cfg.btRisk || 100;
      if (q.dataset.qres) { const R0 = Math.abs(num($j("tp-qr") && $j("tp-qr").value) || (d0.pnl > 0 ? d0.pnl / risk : 2)); const R = q.dataset.qres === "win" ? R0 : q.dataset.qres === "loss" ? -1 : 0; setMany({ risk, pnl: Math.round(R * risk * 100) / 100 }); }
      else if (q.dataset.qone) setMany({ [q.dataset.qone]: d0[q.dataset.qone] === q.dataset.o ? null : q.dataset.o });
      else { const v = [...(d0[q.dataset.qmul] || [])]; const i = v.indexOf(q.dataset.o); i >= 0 ? v.splice(i, 1) : v.push(q.dataset.o); setMany({ [q.dataset.qmul]: v }); }
      drawTrade(); return; }
    const c = t.closest(".tpchips"); if (c) return tagPicker(c); if (t.dataset.rmimg != null) { const fl = [...(cur().files || [])]; fl.splice(+t.dataset.rmimg, 1); setVal("files", fl); drawTrade(); } });
  pg.addEventListener("change", async (ev) => { const t = ev.target; if (t.id === "tp-book") { J.sel.e.book = t.value; drawTrade(); return; } if (t.id === "tp-file") { await addFiles([...t.files]); return; }
    if (t.id === "tp-priv") { setVal("_private", t.checked); if (t.checked) toast("Private: the coach won't see this trade's notes. Shared trades help everyone learn."); return; }
    if (t.id === "tp-qr") { const R = num(t.value); if (R == null) return; const risk = num(cur().risk) || J.cfg.btRisk || 100; setMany({ risk, pnl: Math.round(R * risk * 100) / 100 }); drawTrade(); return; }
    const k = t.dataset.f; if (!k) return; const f = field(k) || { t: k === "pnl" || k === "risk" ? "money" : "text" }; let v = t.type === "checkbox" ? t.checked : t.value;
    if (f.t === "number" || f.t === "money") v = num(v); setVal(k, v); if (k === "pnl" || k === "risk") drawTrade(); });
  pg.addEventListener("input", (ev) => { if (ev.target.id === "tp-name") { clearTimeout(pg._nt); pg._nt = setTimeout(() => setVal("name", ev.target.value), 500); } });
  pg.addEventListener("paste", (ev) => { const fs = [...(ev.clipboardData || {}).files || []].filter((f) => /^image\//.test(f.type)); if (fs.length) { ev.preventDefault(); addFiles(fs); } });
  pg.addEventListener("dragover", (ev) => ev.preventDefault()); pg.addEventListener("drop", (ev) => { const fs = [...ev.dataTransfer.files].filter((f) => /^image\//.test(f.type)); if (fs.length) { ev.preventDefault(); addFiles(fs); } });
  document.addEventListener("keydown", (ev) => { if (ev.key === "Escape" && !$j("tj-page").classList.contains("hidden") && !document.querySelector(".jpop")) { $j("tj-page").classList.add("hidden"); render(); } });
  window.addEventListener("online", () => jSync().catch(() => {}));
}
async function addFiles(fs) { const out = [...(cur().files || [])]; for (const f of fs) try { out.push(await addImage(f)); } catch (e) { toast("Couldn't add that image"); } setVal("files", out); drawTrade(); }
function bkDlg() { const fsApi = !!window.showDirectoryPicker;
  wideDlg(`<h3>Keep your journal safe</h3><p>Your journal lives in this browser first, then KAIROS's database. A backup puts a copy on your own computer too, so nothing is lost even if the site goes down.</p>
    <ul class="small"><li><b>${fsApi ? "Backup folder (recommended):" : "Your browser can't auto-save to a folder,"}</b> ${fsApi ? "pick a folder once (Documents or iCloud Drive works). KAIROS saves into it after every change and keeps a daily copy." : "so download a copy every week (KAIROS reminds you)."}</li>
    <li><b>Open my journal.html</b> is in every backup. Double-click it to read your whole journal with no internet and no site.</li><li><b>Restore</b> puts a backup back into KAIROS (newer edits win).</li></ul><input type="file" id="bk-file" accept=".json,.html" hidden>`,
    [{ t: "Close" }, { t: "Restore from a file", f: () => {} }, { t: "Download a copy now", f: () => downloadBackup() }, ...(fsApi ? [{ t: "Choose backup folder", primary: 1, f: () => pickFolder() }] : [])]);
  $j("wb1").onclick = () => $j("bk-file").click(); $j("bk-file").onchange = (e) => { $j("dlg").classList.add("hidden"); e.target.files[0] && restoreFile(e.target.files[0]); }; }

/* KING_CALSHORT: compact $ on phone calendars ($17.6k) so day cells don't overflow */
function kM(v) { const a = Math.abs(v), sg = v < 0 ? "-$" : "$"; return a >= 1000 ? sg + (a / 1000).toFixed(a >= 10000 ? 0 : 1) + "k" : sg + Math.round(a); }
/* KING_SHARECARD: one-tap month picture (P/L, calendar squares, stats) for the group chat */
async function shareCard() { const m = J.cal || new Date().toISOString().slice(0, 7), rows = (J._fr || []).filter((r) => r.day.startsWith(m)), a = agg(rows);
  const cs = getComputedStyle(document.documentElement), v = (k, f) => (cs.getPropertyValue(k) || "").trim() || f;
  const bg = v("--bg", "#0a0a0d"), txt = v("--txt", "#ecebf3"), mut = v("--mut", "#8b8a99"), acc = v("--acc", "#a78bfa"), up = "#2bd4a0", dn = "#ff4d5e";
  const c = document.createElement("canvas"); c.width = c.height = 1080; const g = c.getContext("2d"), F = (w, px) => `${w} ${px}px Geist, Inter, system-ui, sans-serif`;
  g.fillStyle = bg; g.fillRect(0, 0, 1080, 1080); g.fillStyle = "rgba(255,255,255,.03)"; g.strokeStyle = "rgba(255,255,255,.08)"; g.lineWidth = 2; g.beginPath(); g.roundRect(48, 48, 984, 984, 32); g.fill(); g.stroke();
  const [y, mo] = m.split("-").map(Number), first = new Date(Date.UTC(y, mo - 1, 1)), days = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  g.fillStyle = mut; g.font = F(600, 30); g.fillText(first.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" }), 96, 130);
  g.fillStyle = acc; g.textAlign = "right"; g.fillText("KAIROS", 984, 130); g.textAlign = "left";
  g.fillStyle = a.net >= 0 ? up : dn; const big = (a.net < 0 ? "-$" : "$") + Math.abs(Math.round(a.net)).toLocaleString("en-US"); let bs = 120; g.font = F(800, bs); while (bs > 48 && g.measureText(big).width > 888) g.font = F(800, (bs -= 6)); g.fillText(big, 90, 270);
  const by = {}; for (const r of rows) if (r.pnl != null) by[r.day] = (by[r.day] || 0) + r.pnl; const mx = Math.max(1, ...Object.values(by).map(Math.abs));
  const G = 12, S = (888 - 6 * G) / 7, x0 = 96, y0 = 330; g.font = F(600, 22); ["S", "M", "T", "W", "T", "F", "S"].forEach((d, i) => { g.fillStyle = mut; g.fillText(d, x0 + i * (S + G) + S / 2 - 7, y0); });
  for (let d = 1; d <= days; d++) { const i = first.getUTCDay() + d - 1, cx = x0 + (i % 7) * (S + G), cy = y0 + 20 + Math.floor(i / 7) * (S * 0.7 + G), k = m + "-" + String(d).padStart(2, "0"), p = by[k];
    g.fillStyle = p == null ? "rgba(255,255,255,.04)" : p === 0 ? "rgba(255,198,92,.35)" : (p > 0 ? up : dn) + Math.round(40 + 180 * Math.abs(p) / mx).toString(16).padStart(2, "0");
    g.beginPath(); g.roundRect(cx, cy, S, S * 0.7, 14); g.fill(); g.fillStyle = p == null ? mut : txt; g.font = F(600, 20); g.fillText(String(d), cx + 12, cy + 30); }
  const st = [["Trades", a.n], ["Win rate", a.wr == null ? "—" : Math.round(a.wr) + "%"], ["Profit factor", a.pf == null ? "—" : a.pf.toFixed(2)], ["Avg R", a.avgR == null ? "—" : a.avgR.toFixed(2)]];
  st.forEach(([l, val], i) => { const sx = 96 + i * 228; g.fillStyle = mut; g.font = F(500, 24); g.fillText(l, sx, 930); g.fillStyle = txt; g.font = F(800, 44); g.fillText(String(val), sx, 984); });
  const blob = await new Promise((r) => c.toBlob(r, "image/png")), name = "KAIROS " + m + ".png";
  try { const f = new File([blob], name, { type: "image/png" }); if (navigator.canShare && navigator.canShare({ files: [f] })) return await navigator.share({ files: [f], title: name }); } catch (e) { if (e.name === "AbortError") return; }
  const u = URL.createObjectURL(blob), l = document.createElement("a"); l.href = u; l.download = name; l.click(); setTimeout(() => URL.revokeObjectURL(u), 4000); toast("Saved " + name); return c; }
J.shareCard = shareCard;

J.open = () => { wire(); return open(); };
J.ensure = async () => { if (!J.cfg) { await loadCfg(); await loadEntries(); J.ready = true; } if (!J._loaded) { J._loaded = 1; try { const [bt, ka] = await Promise.all([db.allTrades(), db.accounts().catch(() => [])]); J.bt = bt || []; J.kacc = ka || []; } catch (e) {} } }; J.render = render; J.backupNow = backupNow; J.snapshot = snapshot; J.viewerHtml = viewerHtml; J.saveCfgPublic = saveCfg; J.mergeSchema = mergeSchema; J.pullNotion = pullNotion; J.rowFromNotion = rowFromNotion; J.openTrade = openTrade; J.openQuick = openQuick; J.agg = agg; J.applyTpl = applyTpl; J.restoreFile = restoreFile; J.saveEntry = saveEntry; J.allRows = allRows; J.groupBy = groupBy;
})();
