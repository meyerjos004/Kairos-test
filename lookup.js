/* KING_LOOKUP (King, Nov 24): "Go to a date" = look anything up in the chart data without starting a session.
   Type any time ("6pm EST on april 7th 2022", "3/14/24 9:30", "jan 5 2023 noon"), pick the symbol and the timeframe, and the chart opens right on
   that candle with a marker. Zoom or scroll out and older / newer months load in, so every bar KAIROS has is reachable. "Replay from here" is
   a separate, explicit button; nothing starts a session on its own. */
(function () {
  const $ = (id) => document.getElementById(id);
  const TFS = [["15s", 15], ["30s", 30], ["1m", 60], ["3m", 180], ["5m", 300], ["15m", 900], ["30m", 1800], ["1h", 3600], ["4h", 14400], ["1D", 86400]];
  let L = null;   // state of the open lookup

  function parseWhen(q) { let s = " " + String(q || "").toLowerCase().replace(/,/g, " ") + " ", tz = "ny", hh = null, mm = 0;
    const T = [[/\b(est|edt|et|eastern|new york|ny)\b/, "ny"], [/\b(cst|cdt|ct|central|chicago)\b/, "ct"], [/\b(pst|pdt|pt|pacific)\b/, "pt"], [/\b(mst|mdt|mt|mountain|utah)\b/, "mt"], [/\b(utc|gmt|zulu)\b/, "utc"]];
    for (const [re, z] of T) if (re.test(s)) { tz = z; s = s.replace(re, " "); }
    if (/\bnoon\b/.test(s)) { hh = 12; s = s.replace(/\bnoon\b/, " "); } else if (/\bmidnight\b/.test(s)) { hh = 0; s = s.replace(/\bmidnight\b/, " "); }
    let m = s.match(/\b(\d{1,2}):(\d{2})\s*(am|pm|a|p)?\b/) || s.match(/\b(\d{1,2})\s*(am|pm|a|p)\b/);
    if (hh == null && m) { const ap = (m[3] || (m[2] && /[ap]/.test(m[2]) ? m[2] : "") || "").toString(); hh = +m[1]; mm = m[2] && /^\d+$/.test(m[2]) ? +m[2] : 0; if (/^p/.test(ap) && hh < 12) hh += 12; if (/^a/.test(ap) && hh === 12) hh = 0; s = s.replace(m[0], " "); }
    s = s.replace(/\b(at|on|the|of|around)\b/g, " ");
    const d = typeof dpSearch === "function" ? dpSearch(s) : null; if (!d || d.y == null) return null; const day = d.d || 1, mon = d.m >= 0 ? d.m : 0;
    const ds = `${d.y}-${String(mon + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`, h = hh == null ? 9 : hh, mi = hh == null ? 30 : mm;
    const shift = { ny: 0, ct: 1, mt: 2, pt: 3 }[tz]; let t;
    if (tz === "utc") t = Date.parse(`${ds}T${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}:00Z`) / 1000;
    else { const nyH = h + (shift || 0), base = Date.parse(ds + "T00:00:00Z") / 1000 + nyH * 3600 + mi * 60, iso = new Date(base * 1000).toISOString().slice(0, 16); t = nyToUtc(iso); }
    return { t, guessedTime: hh == null, ds }; }

  const ymOfT = (t) => new Date(t * 1000).toISOString().slice(0, 7);
  async function bars(symb, tf, ym) { const ds = (INST[symb] || INST.NQ).data; return loadMonth(ds, tf, ym); }
  function agg(raw, sec) { const out = []; let c = null; for (const x of raw) { const k = bucket(loc(x.t), sec); if (!c || c.time !== k) { c = { time: k, open: x.o, high: x.h, low: x.l, close: x.c }; out.push(c); } else { c.high = Math.max(c.high, x.h); c.low = Math.min(c.low, x.l); c.close = x.c; } } return out; }
  async function fill(dir) { if (!L || L.busy) return; const src = L.sec < 60 ? "15s" : "1m", ym = dir < 0 ? addM(L.months[0], -1) : addM(L.months[L.months.length - 1], 1);
    if (dir > 0 && ym > new Date().toISOString().slice(0, 7)) return; if (dir < 0 && (ym < "2019-01" || L.endOld)) return; L.busy = true;
    try { const more = await bars(L.sym, src, ym); if (!more.length) { if (dir < 0) L.endOld = true; L.months[dir < 0 ? "unshift" : "push"](ym); return; }
      L.raw = dir < 0 ? more.concat(L.raw) : L.raw.concat(more); L.months[dir < 0 ? "unshift" : "push"](ym); draw(true); } finally { L.busy = false; } }
  function draw(keep) { const ts = L.chart.timeScale(), vr = keep ? ts.getVisibleRange() : null; L.cs = agg(L.raw, L.sec); L.series.setData(L.cs);
    const mt = bucket(loc(L.t), L.sec); try { L.series.setMarkers([{ time: mt, position: "aboveBar", color: kReadable("#3b82f6"), shape: "arrowDown", text: L.label }]); } catch (e) {}
    if (vr) { try { ts.setVisibleRange(vr); } catch (e) {} } else { const k = L.cs.findIndex((c) => c.time >= mt), i = k < 0 ? L.cs.length - 1 : k; ts.setVisibleLogicalRange({ from: i - 80, to: i + 60 }); }
    $("lk-info").textContent = L.cs.length ? `${L.cs.length.toLocaleString()} candles loaded · ${L.months[0]} to ${L.months[L.months.length - 1]} · scroll or zoom out for more` : "No data for that time"; }
  async function go() { const q = $("lk-q").value.trim(), w = parseWhen(q); if (!w) return toast("Couldn't read that date. Try “april 7 2022 6pm”."); const symb = $("lk-sym").value, tf = $("lk-tf").querySelector(".on").dataset.tf, sec = TFS.find((x) => x[0] === tf)[1];
    const src = sec < 60 ? "15s" : "1m", ym = ymOfT(w.t), want = sec >= 86400 ? [-6, -5, -4, -3, -2, -1, 0, 1] : sec >= 3600 ? [-2, -1, 0, 1] : [-1, 0, 1], months = want.map((k) => addM(ym, k));
    $("lk-info").textContent = "Loading…"; const raw = (await Promise.all(months.map((m) => bars(symb, src, m)))).flat().sort((a, b) => a.t - b.t);
    if (src === "15s" && !raw.length) return toast("No 15s data around that date. Try 1m or higher.");
    const lt = loc(w.t), d = new Date(lt * 1000);
    L = Object.assign(L || {}, { sym: symb, tf, sec, t: w.t, raw, months, endOld: false, label: `${d.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })} ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")} NY` });
    if (w.guessedTime) toast("No time given, so it opens at 9:30 New York"); draw(false); }
  function open() { if (window.isPhone && isPhone()) {}   // phones may look too: it doesn't touch the replay
    let el = $("lookup"); if (!el) { el = document.createElement("div"); el.id = "lookup"; el.className = "lkwrap"; document.body.appendChild(el);
      el.innerHTML = `<div class="lk" role="dialog" aria-label="Go to a date"><div class="lkh"><b>Go to a date</b><span class="tiny muted">Looks it up in the data. It doesn't start a session.</span><span class="tsp"></span><button class="ghost lkx" aria-label="Close"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
        <div class="lkbar"><input id="lk-q" placeholder="Any time: “6pm EST on april 7th 2022”, “3/14/24 9:30”, “jan 5 2023 noon”" autocomplete="off"><select id="lk-sym">${["NQ", "MNQ", "ES", "MES"].map((s) => `<option ${s === (typeof sym !== "undefined" ? sym : "NQ") ? "selected" : ""}>${s}</option>`).join("")}</select><button class="primary" id="lk-go">Go</button></div>
        <div class="seg mini lktf" id="lk-tf">${TFS.map(([n]) => `<button data-tf="${n}" class="${n === "5m" ? "on" : ""}">${n}</button>`).join("")}</div>
        <div class="lkchart" id="lk-chart"></div><div class="lkfoot"><span class="tiny muted" id="lk-info">Type a date and time, pick a timeframe, press Go.</span><span class="tsp"></span><button class="ghost" id="lk-replay">Replay from here</button></div></div>`;
      el.addEventListener("pointerdown", (e) => { if (e.target === el) close(); }); el.querySelector(".lkx").onclick = close;
      $("lk-go").onclick = go; $("lk-q").onkeydown = (e) => { if (e.key === "Enter") go(); if (e.key === "Escape") close(); };
      $("lk-tf").onclick = (e) => { const b = e.target.closest("[data-tf]"); if (!b) return; $("lk-tf").querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b)); if (L && L.cs) go(); };
      $("lk-sym").onchange = () => { if (L && L.cs) go(); };
      $("lk-replay").onclick = async () => { if (!L || !L.cs) return toast("Look a time up first"); if (pos.qty || orders.length) return toast("Close positions and cancel orders first"); $("sym").value = L.sym; $("start").value = fmt(loc(L.t)).replace(" ", "T").slice(0, 16); close(); view("trade"); await loadReplay(); try { dpLabel(); } catch (e) {} };
      const C = csG(), bg = (() => { try { return kChartBg(); } catch (e) { return "#fff"; } })();
      L = { chart: LightweightCharts.createChart($("lk-chart"), { autoSize: true, layout: { background: { type: "solid", color: bg }, textColor: kReadable("#6b7280", bg), fontFamily: "Geist, system-ui, sans-serif" }, grid: { vertLines: { color: "rgba(127,127,127,.08)" }, horzLines: { color: "rgba(127,127,127,.08)" } }, timeScale: { timeVisible: true, secondsVisible: false, rightOffset: 6 }, crosshair: { mode: 0, vertLine: { color: kReadable("#888888", bg) }, horzLine: { color: kReadable("#888888", bg) } } }) };
      L.series = L.chart.addCandlestickSeries({ upColor: (C && C.styUp) || prefs.up, downColor: (C && C.styDn) || prefs.dn, wickUpColor: prefs.up, wickDownColor: prefs.dn, borderVisible: false });
      L.chart.timeScale().subscribeVisibleLogicalRangeChange((r) => { if (!L || !L.cs || !r) return; if (r.from < 25) fill(-1); else if (r.to > L.cs.length - 10 && L.t < Date.now() / 1000 - 86400 * 20) fill(1); }); }
    el.classList.remove("hidden"); setTimeout(() => $("lk-q").focus(), 30); }
  function close() { const el = $("lookup"); if (el) el.classList.add("hidden"); }
  window.lookupOpen = open; window.parseWhen = parseWhen;
  const btn = $("gotobtn"); if (btn) { btn.onclick = open; btn.title = "Go to a date (look it up without starting a session)"; }
})();
