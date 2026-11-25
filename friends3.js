/* KING_FRIENDS3 (King, Nov 24 drawing): the Friends page.
   Left: Leaderboard (flex page) / Chat / Trades / Notes / Friend sessions. Right, always: who's online + the group chat.
   No "Your games": 1v1 results live in the leaderboard, backtests live in calendar/stats/journal. Invite = bring people into
   your current session, or pick dates when you're not in one. Clicking a person = 1v1, invite, recent sessions.
   Phones only SHOW (no invites, no 1v1, nothing that touches charts).
   Also here: KING_CHATLOOK (chat styles) and KING_VOICE2 (click = live speech-to-text, hold = voice note with waveform + transcript). */
(function () {
  const $ = (id) => document.getElementById(id);
  const phone = () => matchMedia("(max-width:900px) and (pointer:coarse)").matches;
  const myId = () => (DEMO ? "demo" : me && me.user_id);
  const IC = (p) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
  const dShort = (t) => new Date(t * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/New_York" });
  const hm = (s) => { s = Math.round(+s || 0); const h = Math.floor(s / 3600), m = Math.round((s % 3600) / 60); return h ? `${h}h ${m}m` : `${m}m`; };
  let page = "lb", sessCache = null, sessAt = 0, duelCache = null;

  /* ---------- pages ---------- */
  const TITLES = { lb: "Leaderboard", chat: "Chat", trades: "Trades", notes: "Notes", sess: "Friend sessions" };
  function placeChat() { const ch = document.querySelector(".fchat"), rail = document.querySelector(".fr3rail"); if (!ch || !rail) return;
    if (!document.querySelector("#v-friends").classList.contains("hidden") || ch.parentElement === $("fp-chat") || rail.contains(ch) || !$("sfr").contains(ch)) {
      const dest = page === "chat" ? $("fp-chat") : rail; if (ch.parentElement !== dest) dest.appendChild(ch); }
    document.querySelector(".fr3").classList.toggle("chatpage", page === "chat"); setTimeout(() => { const c = $("chat"); if (c) c.scrollTop = 1e9; }, 30); }
  function fpage(k) { if (!TITLES[k]) k = "lb"; page = k; try { sessionStorage.setItem("kz-fp", k); } catch (e) {}
    document.querySelectorAll(".fr3tab").forEach((b) => b.classList.toggle("on", b.dataset.fp === k));
    document.querySelectorAll(".fpage").forEach((p) => p.classList.toggle("hidden", p.id !== "fp-" + k)); $("fr3-title").textContent = TITLES[k];
    placeChat(); if (k === "chat") $("fr3-chatdot").classList.add("hidden");
    ({ lb: renderLB3, chat: () => {}, trades: renderTrades, notes: () => window.renderNotes && window.renderNotes(), sess: renderSess })[k](); }
  window.fpage = fpage;
  try { const k = sessionStorage.getItem("kz-fp"); if (TITLES[k]) page = k; } catch (e) {}

  /* old entry points now land on the new pages */
  window.frHome = function () { document.body.classList.toggle("fr3view", phone()); fpage(page); renderStatus(); };
  window.ftab = function (k) { if (k === "sh") return fpage("trades"); if (k === "sg") return frSug(true); if (k === "keep" || k === "ch" || k === "lv") return fpage(page); if (k === "dl" || k === "lb") return fpage("lb"); fpage(k); };
  window.chatTab = function (k) { if (k === "sh") return fpage("trades"); setTimeout(() => ($("chat").scrollTop = 1e9), 20); };

  /* ---------- people (right rail) ---------- */
  window.renderStatus = function () { const on = $("fr-online"), off = $("fr-offline"); if (!on) return; const ids = friendIds(), order = { play: 0, duel: 0, on: 1, off: 2 };
    const rows = ids.map((id) => ({ id, st: statusOf(id) })).sort((a, b) => order[a.st[0]] - order[b.st[0]] || String(names[a.id] || "").localeCompare(names[b.id] || ""));
    const row = ({ id, st }) => { const x = liveOf(id), rk = rankOf(id); return `<button class="frp3 st-${st[0]}" data-pm="${esc(id)}">${avatarHtml(id, 34, "frav")}<i class="frdot"></i><span class="frpt"><b>${who(id, "friend")}</b><span class="tiny muted">${st[1]}</span></span>${rk ? `<span class="rkb">#${rk}</span>` : ""}${x && x.t ? `<span class="frpnl ${x.pnl >= 0 ? "pos-up" : "pos-dn"}">${money(x.pnl)}</span>` : ""}</button>`; };
    const A = rows.filter((r) => r.st[0] !== "off"), B = rows.filter((r) => r.st[0] === "off");
    on.innerHTML = A.map(row).join("") || '<div class="tiny muted frnone">Nobody online right now</div>'; off.innerHTML = B.map(row).join("");
    $("fr-on-n").textContent = A.length; $("fr-off-n").textContent = B.length; document.querySelector(".frl-h.off").classList.toggle("hidden", !B.length);
    const oc = $("fr-oncount"); if (oc) oc.textContent = rows.length ? `${A.length} of ${rows.length} online` : ""; };
  const rankOf = (uid) => { const i = (frLB || []).findIndex((r) => r.user_id === uid); return i >= 0 ? i + 1 : 0; };

  /* ---------- leaderboard (flex page) ---------- */
  async function duels() { if (!duelCache || Date.now() - duelCache[1] > 30000) { try { duelCache = [await duelRows(), Date.now()]; } catch (e) { duelCache = [[], Date.now()]; } } return duelCache[0]; }
  function wl(rows, uid) { let w = 0, l = 0, t = 0; rows.filter((d) => d.status === "done" && (d.a === uid || d.b === uid)).forEach((d) => { const x = d.winner || duelWinner(d); if (x === "tie") t++; else if (x === uid) w++; else if (x) l++; }); return { w, l, t }; }
  const wlTxt = (r) => (r.w + r.l + r.t ? `${r.w}-${r.l}${r.t ? "-" + r.t : ""}` : "—");
  window.renderLB = renderLB3;
  async function renderLB3() { const D = +$("lb-range").value, now = Math.floor(Date.now() / 1000); let t0 = 0, t1 = 9999999999; if (D) t0 = now - D * 86400;
    $("lb-share").checked = !me || me.share_stats !== false;
    const [rows, dl] = await Promise.all([lbRows(t0, t1, $("lb-sym").value), duels()]); frLB = rows;
    const top = rows.slice(0, 3), order = [1, 0, 2].filter((i) => top[i]);
    $("fr-podium").innerHTML = rows.length ? order.map((i) => { const r = top[i]; return `<div class="pod p${i + 1}" data-pm="${esc(r.user_id)}">${avatarHtml(r.user_id, i ? 54 : 70, "podav")}<b class="podn">${nmFx(r.name, r.user_id)}</b><span class="podnet ${+r.net >= 0 ? "pos-up" : "pos-dn"}">${money(+r.net)}</span><div class="podstep"><span>${i + 1}</span></div></div>`; }).join("") : "";
    $("lb-list").innerHTML = rows.length ? `<table class="bt lb lb3"><tr><th></th><th>Trader</th><th>Trades</th><th>Win</th><th>Avg R</th><th>Best trade</th><th>1v1</th><th>Net</th></tr>${rows.map((r, i) => `<tr class="${r.user_id === myId() ? "mine" : ""}" data-uid="${esc(r.user_id)}"><td><span class="rkb r${i + 1}">${i + 1}</span></td><td><span class="lbwho" data-pm="${esc(r.user_id)}">${avatarHtml(r.user_id, 26)}${nmFx(r.name, r.user_id)}</span></td><td>${r.trades}</td><td>${r.trades ? Math.round((100 * r.wins) / r.trades) : 0}%</td><td>${r.avg_r ?? "—"}</td><td>${money(+r.best || 0)}</td><td class="wl">${wlTxt(wl(dl, r.user_id))}</td><td class="${+r.net >= 0 ? "pos-up" : "pos-dn"}">${money(+r.net)}</td></tr>`).join("")}</table>` : '<div class="empty">No trades in this range yet</div>';
    renderDuelStrip(dl); renderMe(rows, dl); renderStatus(); badges(); }
  function badges() { document.querySelectorAll(".fchat .cm[data-uid]").forEach((m) => { const h = m.querySelector(".cmh"), rk = rankOf(m.dataset.uid); if (!h) return; let b = h.querySelector(".rkb"); if (!rk) { b && b.remove(); return; } if (!b) { b = document.createElement("span"); b.className = "rkb"; h.querySelector(".cn").after(b); } b.textContent = "#" + rk; }); }
  function renderDuelStrip(dl) { const m = myId(), box = $("fr-duels"); if (!box) return;
    const mine = dl.filter((d) => (d.a === m || d.b === m) && d.status !== "done" && d.status !== "declined" && d.status !== "cancelled");
    if (!mine.length) { box.innerHTML = ""; return; }
    box.innerHTML = `<div class="dstrip">${mine.map((d) => { const o = duelOpp(d), inc = d.status === "pending" && d.b === m, out = d.status === "pending" && d.a === m, done = d.status === "active" && d[o.side + "_done"];
      const act = phone() ? "" : inc ? `<button class="primary small" data-dacc="${d.id}">Accept</button><button class="ghost small" data-ddec="${d.id}">Decline</button>` : out ? `<button class="ghost small" data-dcan="${d.id}">Cancel</button>` : done ? "" : `<button class="primary small" data-dplay="${d.id}">Play</button>`;
      return `<div class="dchip">${IC('<path d="M4 4l9 9M4 4h4M4 4v4M20 4l-9 9M20 4h-4M20 4v4"/>')}<span><b>1v1 vs ${nmFx(o.name, o.id)}</b><span class="tiny muted">${inc ? "challenged you" : out ? "waiting for them to accept" : done ? "you're done, they're still trading" : "your turn"} · ${esc(d.sym)}</span></span>${act}</div>`; }).join("")}</div>`; }
  async function renderMe(rows, dl) { const box = $("fr-me"); if (!box) return; const m = myId(), i = rows.findIndex((r) => r.user_id === m), r = i >= 0 ? rows[i] : null, rec = wl(dl, m);
    let ss = []; try { ss = (await sessions()).filter((x) => x.user_id === m); } catch (e) {}
    const time = ss.reduce((a, x) => a + (+x.active_secs || 0), 0), wr = r && r.trades ? Math.round((100 * r.wins) / r.trades) : null;
    const T = [["Rank", r ? "#" + (i + 1) : "—", r ? `of ${rows.length}` : "make a trade to get on the board"], ["Net", r ? money(+r.net) : "—", r ? `${r.trades} trades` : "", r ? (+r.net >= 0 ? "pos-up" : "pos-dn") : ""],
      ["Win rate", wr == null ? "—" : wr + "%", r ? `${r.wins} wins` : ""], ["Avg R", r && r.avg_r != null ? r.avg_r + "R" : "—", "per trade"], ["Best trade", r ? money(+r.best || 0) : "—", ""],
      ["1v1 record", wlTxt(rec), rec.w > rec.l ? "winning" : rec.w < rec.l ? "losing" : rec.w ? "even" : "no 1v1s yet"], ["Sessions", ss.length || "—", ss.length ? "recent" : ""], ["Time backtesting", time ? hm(time) : "—", "recent sessions"]];
    box.innerHTML = T.map(([k, v, s, c]) => `<div class="mt"><span class="tiny muted">${k}</span><b class="${c || ""}">${v}</b><span class="tiny muted">${s || "&nbsp;"}</span></div>`).join(""); }

  /* ---------- friend sessions ---------- */
  async function sessions(force) { if (!force && sessCache && Date.now() - sessAt < 30000) return sessCache;
    if (DEMO) { const d = (s) => Math.floor(Date.parse(s) / 1000), mk = (u, n, a) => a.map(([sy, st, tr, w, net, sec], k) => ({ user_id: u, name: n, session_id: u + k, sname: "", symbol: sy, start_ts: d(st), cursor_ts: d(st) + 86400 * 4, updated_at: new Date(Date.now() - (k + 1) * 36e5 * 7).toISOString(), active_secs: sec, trades: tr, wins: w, net, r: null }));
      sessCache = [...mk("demo", "You", [["NQ", "2026-10-12T22:00:00Z", 6, 4, 820, 5400], ["MNQ", "2026-09-07T22:00:00Z", 3, 1, -140, 2100]]), ...mk("b", "Ben", [["NQ", "2026-10-12T22:00:00Z", 5, 3, 410, 4800], ["ES", "2026-08-03T22:00:00Z", 4, 2, 90, 3000], ["NQ", "2026-06-15T22:00:00Z", 7, 5, 1260, 7600]]), ...mk("w", "Will", [["ES", "2026-09-02T22:00:00Z", 2, 0, -220, 1500]]), ...mk("r", "Ryan", [["MNQ", "2026-10-05T22:00:00Z", 8, 5, 360, 6900], ["NQ", "2026-07-20T22:00:00Z", 3, 2, 300, 2400]])];
    } else { const { data, error } = await sb.rpc("friend_sessions", { per_user: 12 }); if (error) { toast(error.message); return sessCache || []; } sessCache = data || []; }
    sessAt = Date.now(); return sessCache; }
  async function renderSess() { const box = $("fr-sess"); box.innerHTML = '<div class="tiny muted">Loading…</div>'; const rows = await sessions(true), by = {};
    rows.forEach((x) => (by[x.user_id] = by[x.user_id] || []).push(x));
    const users = Object.keys(by).sort((a, b) => Date.parse(by[b][0].updated_at) - Date.parse(by[a][0].updated_at));
    box.innerHTML = users.length ? users.map((u) => `<div class="scol"><div class="sch" data-pm="${u === myId() ? "" : esc(u)}">${avatarHtml(u, 32)}<b>${who(u, by[u][0].name || "trader")}</b><span class="tiny muted">${by[u].length} session${by[u].length > 1 ? "s" : ""}</span></div>
      ${by[u].map((x) => `<button class="srow" data-rs="${esc(x.session_id)}" ${phone() ? "disabled" : ""}><span class="sdate">${dShort(x.start_ts)}${x.cursor_ts && x.cursor_ts - x.start_ts > 86400 ? " – " + dShort(x.cursor_ts).replace(/, \d{4}$/, "") : ""}</span><span class="smeta"><b>${esc(x.symbol || "")}</b>${x.sname ? " · " + esc(x.sname) : ""} · ${x.trades} trade${x.trades == 1 ? "" : "s"}${x.trades ? " · " + Math.round((100 * x.wins) / x.trades) + "%" : ""}${x.active_secs ? " · " + hm(x.active_secs) : ""}</span><b class="snet ${+x.net >= 0 ? "pos-up" : "pos-dn"}">${x.trades ? money(+x.net) : "—"}</b><span class="tiny muted sago">${ago(x.updated_at)}</span></button>`).join("")}</div>`).join("")
      : '<div class="empty">No sessions yet. Everyone who backtests (and shares stats) shows up here.</div>'; }
  async function replaySess(id) { if (phone()) return; const x = (sessCache || []).find((s) => String(s.session_id) === String(id)); if (!x) return;
    if (typeof pos !== "undefined" && (pos.qty || orders.length)) return toast("Close positions and cancel orders first");
    $("sym").value = x.symbol || "NQ"; $("start").value = fmt(loc(x.start_ts) + 60).replace(" ", "T"); view("trade"); await loadReplay(); toast(`Replaying ${who(x.user_id, "their")} dates`); }

  /* ---------- trades (screenshots + shared trades) ---------- */
  let shots = [];
  async function renderTrades() { renderSh(); const box = $("fr-posts"); let list = [];
    if (DEMO) list = mem.posts || (mem.posts = [{ id: "p1", user_id: "b", kind: "shot", caption: "Backtest week of Oct 12: 5 trades, +$410, 2.1R best. The 9:50 IFVG was the one.", att: [], created_at: new Date(Date.now() - 52e5).toISOString() }]);
    else { const { data, error } = await sb.from("friend_posts").select("*").order("created_at", { ascending: false }).limit(60); if (error) toast(error.message); list = data || []; }
    box.innerHTML = list.map((p) => `<div class="card fpost" data-pid="${esc(p.id)}"><div class="cmh">${avatarHtml(p.user_id, 30)}<span class="cn" data-pm="${esc(p.user_id)}">${who(p.user_id, "trader")}</span>${rankOf(p.user_id) ? `<span class="rkb">#${rankOf(p.user_id)}</span>` : ""}<span class="ct">${ago(p.created_at)}</span><span class="tsp"></span>${p.user_id === myId() ? `<button class="ghost small" data-pdel="${esc(p.id)}">Delete</button>` : ""}</div>${p.caption ? `<p class="fpcap">${esc(p.caption)}</p>` : ""}${attHtml(p.att)}</div>`).join("") || '<div class="empty">No screenshots yet. Post your backtest numbers or a trade you liked.</div>';
    fillAtt(box); }
  function drawShots() { const b = $("fr-shot-pend"); b.classList.toggle("hidden", !shots.length); b.innerHTML = shots.map((a, k) => `<span class="fpend ${a.busy ? "busy" : ""}">${a.preview ? `<img src="${a.preview}" alt="">` : ""}<span>${esc(a.name)}</span>${a.busy ? '<i class="spin"></i>' : `<button data-srm="${k}" aria-label="Remove">${IC('<path d="M6 6l12 12M18 6L6 18"/>')}</button>`}</span>`).join(""); }
  async function addShots(files) { for (const f of files) { if (!f.type.startsWith("image/")) continue; if (f.size > 15e6) { toast(f.name + " is over 15 MB"); continue; }
      const a = { name: f.name || "screenshot", type: f.type, size: f.size, busy: true, preview: URL.createObjectURL(f) }; shots.push(a); drawShots();
      if (DEMO) { a.demo = a.preview; a.busy = false; drawShots(); continue; }
      const path = `${me.user_id}/posts/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${(f.name || "shot").replace(/[^\w.-]+/g, "_").slice(-50)}`;
      const { error } = await sb.storage.from("chat").upload(path, f, { contentType: f.type, upsert: false }); a.busy = false; if (error) { shots.splice(shots.indexOf(a), 1); toast("Upload failed: " + error.message); } else a.path = path; drawShots(); } }
  async function post() { const cap = $("fr-cap").value.trim().slice(0, 500), att = shots.filter((a) => a.path || a.demo).map(({ path, name, type, size, demo }) => ({ path, name, type, size, demo }));
    if (shots.some((a) => a.busy)) return toast("Still uploading…"); if (!cap && !att.length) return toast("Add a screenshot or write something");
    const row = { kind: "shot", caption: cap, att }; if (DEMO) mem.posts.unshift({ id: "p" + Date.now(), user_id: "demo", created_at: new Date().toISOString(), ...row });
    else { const { error } = await sb.from("friend_posts").insert(row); if (error) return toast(error.message); }
    shots = []; drawShots(); $("fr-cap").value = ""; renderTrades(); }
  async function delPost(id) { if (DEMO) mem.posts = mem.posts.filter((p) => p.id !== id); else { const { error } = await sb.from("friend_posts").delete().eq("id", id); if (error) return toast(error.message); } renderTrades(); }

  /* ---------- person menu: 1v1, invite, recent sessions ---------- */
  window.personMenu = async function (uid, x, y) { if (!uid || uid === myId()) return; const st = statusOf(uid), P = profs[uid] || {}, rk = rankOf(uid), lr = rk ? frLB[rk - 1] : null;
    let rec = { w: 0, l: 0, t: 0 }; try { rec = duelRecord(await duels(), uid); } catch (e) {}
    let ss = []; try { ss = (await sessions()).filter((s) => s.user_id === uid).slice(0, 5); } catch (e) {}
    const ro = phone();
    const el = popAt(`<div class="pmh">${avatarHtml(uid, 52, "pmav")}<div><b class="pmn">${who(uid, "friend")}</b>${P.username ? `<span class="tiny muted">@${esc(P.username)}</span>` : ""}<span class="pmst st-${st[0]}"><i></i>${st[1]}</span></div></div>
      <div class="pmstats"><div><span class="tiny muted">Leaderboard</span><b>${rk ? "#" + rk : "—"}</b></div><div><span class="tiny muted">Net</span><b class="${lr && +lr.net >= 0 ? "pos-up" : "pos-dn"}">${lr ? money(+lr.net) : "—"}</b></div><div><span class="tiny muted">1v1 vs you</span><b>${wlTxt(rec)}</b></div></div>
      ${ro ? "" : `<div class="pmacts"><button class="primary" data-pa="duel">${IC('<path d="M4 4l9 9M4 4h4M4 4v4M20 4l-9 9M20 4h-4M20 4v4"/><path d="M7 14l3 3-2 2-3-3zM17 14l-3 3 2 2 3-3z"/>')}1v1</button><button data-pa="inv">${IC('<path d="M12 5v14M5 12h14"/>')}Invite</button></div>`}
      <div class="pmwk"><div class="tiny muted">Recent sessions</div>${ss.length ? ss.map((s) => `<button class="pmw" data-pa="rs" data-rs="${esc(s.session_id)}" ${ro ? "disabled" : ""}><span>${dShort(s.start_ts)} · ${esc(s.symbol || "")}</span>${s.trades ? `<b class="${+s.net >= 0 ? "pos-up" : "pos-dn"}">${money(+s.net)}</b>` : '<span class="tiny muted">no trades</span>'}</button>`).join("") : '<div class="tiny muted pmnone">No sessions yet.</div>'}</div>`, x, y, "pmenu");
    el.onclick = (e) => { const b = e.target.closest("[data-pa]"); if (!b || b.disabled) return; el.remove(); const a = b.dataset.pa;
      if (a === "duel") duelNew(uid); else if (a === "inv") inviteMenu($("fr-invite"), uid); else if (a === "rs") replaySess(b.dataset.rs); }; };

  /* ---------- invite: to my session, or pick dates ---------- */
  window.inviteMenu = function (btn, pre) { if (phone()) return toast("Invites are on the computer version");
    const r = (btn || $("fr-invite")).getBoundingClientRect(), ids = friendIds().sort((a, b) => (statusOf(a)[0] === "off") - (statusOf(b)[0] === "off")), inS = !!(nowT() && sess);
    const startV = $("start").value || new Date().toISOString().slice(0, 10) + "T09:29";
    const el = popAt(`<div class="imh"><b>Invite</b><span class="tiny muted">${inS ? "They join your dates and replay alongside you. It's tracked like any backtest." : "You're not in a session. Pick the dates, then invite."}</span></div>
      ${inS ? `<div class="imcur">${IC('<rect x="3" y="5" width="18" height="15" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>')}<span><b>${esc(sym)}</b> · ${fmt(loc(sess.start_ts)).slice(0, 16)} NY</span></div>`
        : `<div class="imdates"><label>Symbol<select id="im-sym">${["NQ", "MNQ", "ES", "MES"].map((s) => `<option ${s === ($("sym").value || "NQ") ? "selected" : ""}>${s}</option>`).join("")}</select></label><label>Start (NY)<input id="im-start" type="datetime-local" value="${esc(startV)}"></label></div>`}
      <div class="imppl">${ids.map((id) => `<label class="impick"><input type="checkbox" value="${esc(id)}" ${id === pre ? "checked" : ""}>${avatarHtml(id, 26)}<span>${who(id, "friend")}</span><i class="frdot st-${statusOf(id)[0]}"></i></label>`).join("") || '<span class="tiny muted">No friends yet</span>'}</div>
      <button class="primary wide" id="im-go">${inS ? "Send invites" : "Start and invite"}</button>`, r.right - 340, r.bottom + 8, "imenu");
    el.querySelector("#im-go").onclick = async () => { const who0 = [...el.querySelectorAll(".impick input:checked")].map((i) => i.value); if (!who0.length) return toast("Pick at least one person");
      if (!inS) { if (typeof pos !== "undefined" && (pos.qty || orders.length)) return toast("Close positions and cancel orders first"); $("sym").value = el.querySelector("#im-sym").value; $("start").value = el.querySelector("#im-start").value; el.remove(); view("trade"); await loadReplay(); if (!(nowT() && sess)) return; } else el.remove();
      for (const u of who0) await invite(u); }; };

  /* ---------- chat rows: avatar, name, rank badge, time ---------- */
  window.chatRow = function (m) { const mine = me && m.user_id === me.user_id, uid = m.user_id, rk = rankOf(uid);
    return `<div class="cm ${mine ? "mine" : ""}" data-uid="${esc(uid || "")}">${avatarHtml(uid, 30, "cav")}<div class="cbx"><div class="cmh"><span class="cn" data-pm="${esc(uid || "")}">${who(uid, "trader")}</span>${rk ? `<span class="rkb">#${rk}</span>` : ""}<span class="ct">${new Date(m.created_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span></div>${m.body ? `<span class="cb">${esc(m.body)}</span>` : ""}${attHtml(m.att)}</div></div>`; };

  /* ---------- voice notes: waveform + transcript dropdown ---------- */
  const baseAtt = window.attHtml;
  window.attHtml = function (att) { if (!att || !att.length) return ""; const voice = att.filter((a) => (a.type || "").startsWith("audio/")), rest = att.filter((a) => !(a.type || "").startsWith("audio/"));
    return voice.map((a) => { const pk = (a.peaks && a.peaks.length ? a.peaks : Array.from({ length: 40 }, (_, i) => 0.25 + 0.5 * Math.abs(Math.sin(i * 1.7)))), n = pk.length;
      return `<div class="cvn"><button class="vnplay" aria-label="Play voice note"><span class="vnp">${IC('<path d="M8 5l11 7-11 7z" fill="currentColor"/>')}</span><span class="vns">${IC('<path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" fill="currentColor" stroke="none"/>')}</span></button><svg class="vnwave" viewBox="0 0 ${n * 4} 28" preserveAspectRatio="none">${pk.map((p, i) => { const h = Math.max(3, Math.round(+p * 26)); return `<rect x="${i * 4}" y="${(28 - h) / 2}" width="2.4" height="${h}" rx="1.2"/>`; }).join("")}</svg><span class="vndur">${a.dur ? Math.max(1, Math.round(a.dur)) + "s" : ""}</span><audio preload="none" data-att="${esc(a.path || a.demo || "")}"></audio>
        ${a.text ? `<details class="vntx"><summary>Transcript</summary><p>${esc(a.text)}</p></details>` : `<details class="vntx"><summary>Transcript</summary><p class="muted">No words picked up.</p></details>`}</div>`; }).join("") + baseAtt(rest); };
  document.addEventListener("click", (e) => { const b = e.target.closest(".vnplay"); if (!b) return; const box = b.closest(".cvn"), au = box.querySelector("audio");
    document.querySelectorAll(".cvn audio").forEach((x) => { if (x !== au) x.pause(); });
    if (!au.src) { fillAtt(box).then(() => au.play().catch(() => toast("Couldn't play that clip"))); } else if (au.paused) au.play(); else au.pause();
    if (!au._w) { au._w = 1; const svg = box.querySelector(".vnwave"); au.ontimeupdate = () => { const p = au.duration ? au.currentTime / au.duration : 0; box.style.setProperty("--vp", (p * 100).toFixed(1) + "%"); svg.querySelectorAll("rect").forEach((r, i, all) => r.classList.toggle("on", i / all.length < p)); };
      au.onplay = () => box.classList.add("playing"); au.onpause = au.onended = () => { box.classList.remove("playing"); if (au.ended) { svg.querySelectorAll("rect").forEach((r) => r.classList.remove("on")); } }; } });

  /* ---------- mic: click = live speech-to-text, hold = voice note ---------- */
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let stt = null, note = null;
  const liveBox = () => $("chat-live");
  function sttStart() { if (!SR) return toast("Live talk-to-text needs Chrome, Edge or Safari"); const inp = $("chat-in"), base = inp.value ? inp.value.replace(/\s*$/, " ") : "";
    const r = new SR(); r.continuous = true; r.interimResults = true; r.lang = navigator.language || "en-US"; let fin = "";
    r.onresult = (e) => { let tmp = ""; for (let i = e.resultIndex; i < e.results.length; i++) { const t = e.results[i][0].transcript; if (e.results[i].isFinal) fin += t; else tmp += t; } inp.value = (base + fin + tmp).replace(/\s+/g, " ").trimStart(); liveBox().innerHTML = `<i class="lvdot"></i><span>${esc(tmp || fin.slice(-60) || "Listening…")}</span>`; };
    r.onerror = (e) => { if (e.error === "not-allowed") toast("Microphone blocked. Allow it in the browser's site settings."); };
    r.onend = () => { if (stt === r) sttStop(); };
    try { r.start(); } catch (e) { return; } stt = r; $("chat-mic").classList.add("stt"); liveBox().classList.remove("hidden"); liveBox().innerHTML = '<i class="lvdot"></i><span>Listening… click the mic again to stop</span>'; }
  function sttStop() { const r = stt; stt = null; try { r && r.stop(); } catch (e) {} $("chat-mic").classList.remove("stt"); liveBox().classList.add("hidden"); $("chat-in").focus(); }
  async function noteStart() { if (!navigator.mediaDevices || !window.MediaRecorder) return toast("Voice notes need a newer browser");
    let stream; try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch (e) { return toast("Microphone blocked. Allow it in the browser's site settings."); }
    const mt = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"].find((t) => MediaRecorder.isTypeSupported(t)) || "", rec = new MediaRecorder(stream, mt ? { mimeType: mt } : {}), parts = [], t0 = Date.now();
    const N = { rec, stream, parts, t0, text: "", cancel: false }; note = N; rec.ondataavailable = (e) => e.data.size && parts.push(e.data);
    if (SR) { try { const r = new SR(); r.continuous = true; r.interimResults = false; r.lang = navigator.language || "en-US"; r.onresult = (e) => { for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) N.text += e.results[i][0].transcript + " "; }; r.start(); N.sr = r; } catch (e) {} }
    let ac, an, raf; try { ac = new (window.AudioContext || window.webkitAudioContext)(); an = ac.createAnalyser(); an.fftSize = 256; ac.createMediaStreamSource(stream).connect(an); } catch (e) {}
    const bars = 28, lv = liveBox(); lv.classList.remove("hidden"); lv.innerHTML = `<i class="lvdot rec"></i><span class="lvt">0s</span><span class="lvbars">${"<i></i>".repeat(bars)}</span><span class="tiny muted">Release to send · Esc cancels</span>`;
    const bi = lv.querySelectorAll(".lvbars i"), buf = an ? new Uint8Array(an.fftSize) : null, hist0 = [];
    const tick = () => { if (note !== N) return; lv.querySelector(".lvt").textContent = Math.round((Date.now() - t0) / 1000) + "s"; if (an) { an.getByteTimeDomainData(buf); let m = 0; for (const v of buf) m = Math.max(m, Math.abs(v - 128)); hist0.push(Math.min(1, m / 70)); if (hist0.length > bars) hist0.shift(); bi.forEach((b, i) => (b.style.height = 3 + Math.round((hist0[i] || 0) * 18) + "px")); } raf = requestAnimationFrame(tick); }; tick();
    $("chat-mic").classList.add("rec");
    rec.onstop = async () => { cancelAnimationFrame(raf); stream.getTracks().forEach((t) => t.stop()); try { N.sr && N.sr.stop(); } catch (e) {} try { ac && ac.close(); } catch (e) {} $("chat-mic").classList.remove("rec"); lv.classList.add("hidden"); note = null;
      const dur = (Date.now() - t0) / 1000; if (N.cancel || dur < 0.6) return;
      await new Promise((r) => setTimeout(r, 350));   // let the last words of the transcript land
      const type = (rec.mimeType || "audio/webm").split(";")[0], blob = new Blob(parts, { type }), f = new File([blob], `voice-${new Date().toISOString().slice(11, 19).replace(/:/g, "")}.${type.includes("mp4") ? "m4a" : "webm"}`, { type });
      f._dur = dur; f._text = N.text.trim().slice(0, 2000); f._peaks = await peaksOf(blob, 40);
      addFiles([f]).then(() => { if (!chatPending.some((a) => a.busy)) sendChat(); }); };
    rec.start(); setTimeout(() => { if (note === N) rec.stop(); }, 120000); }
  async function peaksOf(blob, n) { try { const ac = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(1, 2, 44100), ab = await ac.decodeAudioData(await blob.arrayBuffer()), d = ab.getChannelData(0), step = Math.floor(d.length / n) || 1, out = [];
      for (let i = 0; i < n; i++) { let m = 0; for (let j = i * step; j < Math.min(d.length, (i + 1) * step); j += 8) m = Math.max(m, Math.abs(d[j])); out.push(m); }
      const mx = Math.max(...out, 0.01); return out.map((v) => Math.round((v / mx) * 100) / 100); } catch (e) { return null; } }
  (() => { const old = $("chat-mic"), mic = old.cloneNode(true); old.replaceWith(mic); let downAt = 0, holdT = 0, held = false;
    mic.addEventListener("pointerdown", (e) => { e.preventDefault(); downAt = Date.now(); held = false; if (stt) return; holdT = setTimeout(() => { held = true; noteStart(); }, 320); });
    const up = () => { clearTimeout(holdT); if (held) { held = false; if (note) note.rec.stop(); else setTimeout(() => note && note.rec.stop(), 200); return; } if (Date.now() - downAt < 320) { if (stt) sttStop(); else sttStart(); } };
    mic.addEventListener("pointerup", up); mic.addEventListener("pointerleave", () => { if (held) up(); });
    mic.addEventListener("contextmenu", (e) => e.preventDefault());
    addEventListener("keydown", (e) => { if (e.key === "Escape" && note) { note.cancel = true; note.rec.stop(); } if (e.key === "Escape" && stt) sttStop(); }); })();

  /* ---------- chat looks ---------- */
  const LOOKS = {
    imessage: { n: "iMessage", bg: "#ffffff", me: "#0a84ff", meT: "#fff", th: "#e9e9eb", thT: "#000", r: 18, f: "-apple-system,BlinkMacSystemFont,'SF Pro Text',system-ui,sans-serif", tail: 1, dbg: "#000000", dth: "#26252a", dthT: "#fff" },
    messages: { n: "Messages (Android)", bg: "#ffffff", me: "#d3e3fd", meT: "#041e49", th: "#f2f3f6", thT: "#1f1f1f", r: 20, f: "'Google Sans',Roboto,system-ui,sans-serif", dbg: "#131314", dme: "#0b57d0", dmeT: "#fff", dth: "#2a2b2e", dthT: "#e3e3e3" },
    whatsapp: { n: "WhatsApp", bg: "#efeae2", me: "#d9fdd3", meT: "#111b21", th: "#ffffff", thT: "#111b21", r: 8, f: "'Segoe UI',Helvetica,Arial,sans-serif", tail: 1, pat: 1, dbg: "#0b141a", dme: "#005c4b", dmeT: "#e9edef", dth: "#202c33", dthT: "#e9edef" },
    telegram: { n: "Telegram", bg: "linear-gradient(160deg,#a8d5a2,#d9e7a5 45%,#8fc6c2)", me: "#effdde", meT: "#000", th: "#ffffff", thT: "#000", r: 14, f: "Roboto,'Segoe UI',system-ui,sans-serif", tail: 1, dbg: "linear-gradient(160deg,#0e1621,#17212b)", dme: "#2b5278", dmeT: "#fff", dth: "#182533", dthT: "#fff" },
    discord: { n: "Discord", bg: "#ffffff", me: "transparent", meT: "#313338", th: "transparent", thT: "#313338", r: 0, f: "'gg sans','Noto Sans',system-ui,sans-serif", flat: 1, dbg: "#313338", dmeT: "#dbdee1", dthT: "#dbdee1" },
    slack: { n: "Slack", bg: "#ffffff", me: "transparent", meT: "#1d1c1d", th: "transparent", thT: "#1d1c1d", r: 0, f: "Lato,'Slack-Lato',system-ui,sans-serif", flat: 1, dbg: "#1a1d21", dmeT: "#d1d2d3", dthT: "#d1d2d3" },
    snapchat: { n: "Snapchat", bg: "#ffffff", me: "transparent", meT: "#000", th: "transparent", thT: "#000", r: 0, f: "'Avenir Next',system-ui,sans-serif", flat: 1, bar: 1, meBar: "#f23c57", thBar: "#0eadff", dbg: "#121212", dmeT: "#fff", dthT: "#fff" },
    instagram: { n: "Instagram", bg: "#ffffff", me: "#3797f0", meT: "#fff", th: "#efefef", thT: "#000", r: 22, f: "-apple-system,'Segoe UI',Roboto,sans-serif", dbg: "#000000", dth: "#262626", dthT: "#fff" },
    tiktok: { n: "TikTok", bg: "#ffffff", me: "#fe2c55", meT: "#fff", th: "#f1f1f2", thT: "#161823", r: 12, f: "'TikTok Sans','Proxima Nova',system-ui,sans-serif", dbg: "#121212", dth: "#2f2f2f", dthT: "#fff" },
    signal: { n: "Signal", bg: "#ffffff", me: "#2c6bed", meT: "#fff", th: "#e9e9e9", thT: "#000", r: 18, f: "Inter,system-ui,sans-serif", dbg: "#121212", dth: "#3b3b3b", dthT: "#fff" },
    x: { n: "X", bg: "#ffffff", me: "#1d9bf0", meT: "#fff", th: "#eff3f4", thT: "#0f1419", r: 24, f: "'Chirp',-apple-system,system-ui,sans-serif", dbg: "#000000", dth: "#2f3336", dthT: "#e7e9ea" },
    messenger: { n: "Messenger", bg: "#ffffff", me: "linear-gradient(180deg,#00b2ff,#006aff)", meT: "#fff", th: "#f0f0f0", thT: "#050505", r: 18, f: "-apple-system,'Segoe UI',Helvetica,sans-serif", dbg: "#000000", dth: "#303030", dthT: "#e4e6eb" },
    kairos: { n: "KAIROS", bg: "var(--panel)", me: "color-mix(in srgb,#4696ff 14%,var(--panel,#fff))", meT: "var(--ink,inherit)", th: "var(--panel2,rgba(0,0,0,.04))", thT: "var(--ink,inherit)", r: 14, f: "Geist,system-ui,sans-serif" } };
  const FONTS = [["App font", "Geist,system-ui,sans-serif"], ["System", "-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif"], ["Rounded", "'SF Pro Rounded',ui-rounded,'Nunito','Varela Round',system-ui,sans-serif"], ["Serif", "'Iowan Old Style',Georgia,serif"], ["Mono", "'JetBrains Mono','SF Mono',ui-monospace,monospace"], ["Wide", "'Status Solid','Orbitron','Eurostile',system-ui,sans-serif"]];
  const dark = () => { const bg = getComputedStyle(document.body).backgroundColor.match(/\d+/g) || [255, 255, 255]; return (+bg[0] * 299 + +bg[1] * 587 + +bg[2] * 114) / 1000 < 128; };
  function lookNow() { const L = (prefs.chatLook = prefs.chatLook || { p: "imessage" }); if (L.p === "custom") return L.c || LOOKS.imessage; const b = LOOKS[L.p] || LOOKS.imessage;
    if (!dark() || L.p === "kairos") return b; return { ...b, bg: b.dbg || b.bg, me: b.dme || b.me, meT: b.dmeT || b.meT, th: b.dth || b.th, thT: b.dthT || b.thT }; }
  function applyLook() { const ch = document.querySelector(".fchat"); if (!ch) return; const L = lookNow(), cl = (prefs.chatLook || {}).p || "imessage";
    ch.classList.add("cl"); ch.dataset.cl = cl; ch.classList.toggle("clflat", !!L.flat); ch.classList.toggle("cltail", !!L.tail); ch.classList.toggle("clbar", !!L.bar); ch.classList.toggle("clpat", !!L.pat); ch.classList.toggle("clnoav", !!L.noav);
    const S = ch.style, bg = L.img ? `center/cover no-repeat url("${L.img}")` : L.bg;
    S.setProperty("--cl-bg", bg); S.setProperty("--cl-me", L.me); S.setProperty("--cl-meT", L.meT); S.setProperty("--cl-th", L.th); S.setProperty("--cl-thT", L.thT); S.setProperty("--cl-r", (L.r ?? 18) + "px"); S.setProperty("--cl-f", L.f); S.setProperty("--cl-fs", (L.fs || 14) + "px");
    S.setProperty("--cl-meBar", L.meBar || L.me); S.setProperty("--cl-thBar", L.thBar || L.th); S.setProperty("--cl-ink", L.ink || (dark() ? "#e9e9ee" : "#1c1c1e")); }
  window.applyChatLook = applyLook;
  function lookDlg() { const L0 = JSON.parse(JSON.stringify(prefs.chatLook || { p: "imessage" })), cur = L0.c || { ...lookNow() };
    const sw = (k, v) => `<button class="clp ${L0.p === k ? "on" : ""}" data-clp="${k}"><span class="clpv" style="--b:${(LOOKS[k] || cur).bg};--m:${(LOOKS[k] || cur).me};--t:${(LOOKS[k] || cur).th};--r:${Math.min(12, (LOOKS[k] || cur).r ?? 12)}px"><i></i><i></i><i></i></span><span>${v}</span></button>`;
    wideDlg(`<h3>Chat style</h3><p class="small muted">Only you see your chat style. Pick a preset or make your own.</p>
      <div class="clgrid">${Object.entries(LOOKS).map(([k, v]) => sw(k, v.n)).join("")}${sw("custom", "Custom")}</div>
      <div class="clcust ${L0.p === "custom" ? "" : "hidden"}" id="cl-c">
        <div class="clrow"><span>Background</span><span class="seg mini" id="cl-bgk"><button data-k="color">Color</button><button data-k="grad">Gradient</button><button data-k="img">Picture</button></span><input type="color" id="cl-bg1" value="${/^#/.test(cur.bg) ? cur.bg : "#ffffff"}"><input type="color" id="cl-bg2" value="#d9e7ff"><input type="file" id="cl-img" accept="image/*" hidden><button class="ghost small" id="cl-imgb">Choose picture</button></div>
        <div class="clrow"><span>My bubbles</span><input type="color" id="cl-me" value="${/^#/.test(cur.me) ? cur.me : "#0a84ff"}"><span>Theirs</span><input type="color" id="cl-th" value="${/^#/.test(cur.th) ? cur.th : "#e9e9eb"}"></div>
        <div class="clrow"><span>Message type</span><span class="seg mini" id="cl-type"><button data-k="bub">Bubbles</button><button data-k="tail">Bubbles with tails</button><button data-k="flat">Flat list</button><button data-k="bar">Side bar</button></span></div>
        <div class="clrow"><span>Corners</span><input type="range" id="cl-r" min="0" max="26" value="${cur.r ?? 18}"><span class="tiny muted" id="cl-rv"></span></div>
        <div class="clrow"><span>Font</span><select id="cl-f">${FONTS.map(([n, f]) => `<option value="${esc(f)}" ${cur.f === f ? "selected" : ""}>${n}</option>`).join("")}</select><span>Size</span><input type="range" id="cl-fs" min="12" max="18" value="${cur.fs || 14}"></div>
        <div class="clrow"><label class="ck small"><input type="checkbox" id="cl-noav" ${cur.noav ? "checked" : ""}> Hide pictures next to messages</label></div>
      </div>
      <div class="clprev fchat cl" id="cl-prev"><div class="fch-list"><div class="cm" ><span class="av" style="--s:30px;--h:200"><span>B</span></span><div class="cbx"><div class="cmh"><span class="cn">Ben</span><span class="rkb">#2</span><span class="ct">9:41</span></div><span class="cb">who's backtesting tonight</span></div></div><div class="cm mine"><span class="av" style="--s:30px;--h:30"><span>Y</span></span><div class="cbx"><div class="cmh"><span class="cn">You</span><span class="rkb">#1</span><span class="ct">9:42</span></div><span class="cb">me, Oct 12 NQ. join my dates</span></div></div></div></div>`,
      [{ t: "Cancel" }, { t: "Save", primary: true, f: () => { prefs.chatLook = L0; savePrefs(); applyLook(); } }]);
    const box = $("dlgbox"), prev = $("cl-prev"), c = () => L0.c || (L0.c = { ...cur, img: null, bg: /^#/.test(cur.bg) ? cur.bg : "#ffffff" });
    const draw = () => { const L = L0.p === "custom" ? c() : null, P = L0.p === "custom" ? L : (() => { const save = prefs.chatLook; prefs.chatLook = L0; const r = lookNow(); prefs.chatLook = save; return r; })();
      const S = prev.style, bg = P.img ? `center/cover no-repeat url("${P.img}")` : P.bg; S.setProperty("--cl-bg", bg); S.setProperty("--cl-me", P.me); S.setProperty("--cl-meT", P.meT); S.setProperty("--cl-th", P.th); S.setProperty("--cl-thT", P.thT); S.setProperty("--cl-r", (P.r ?? 18) + "px"); S.setProperty("--cl-f", P.f); S.setProperty("--cl-fs", (P.fs || 14) + "px"); S.setProperty("--cl-meBar", P.meBar || P.me); S.setProperty("--cl-thBar", P.thBar || P.th); S.setProperty("--cl-ink", P.ink || (dark() ? "#e9e9ee" : "#1c1c1e"));
      ["flat", "tail", "bar", "pat", "noav"].forEach((k) => prev.classList.toggle("cl" + k, !!P[k])); box.querySelectorAll("[data-clp]").forEach((b) => b.classList.toggle("on", b.dataset.clp === L0.p)); $("cl-c").classList.toggle("hidden", L0.p !== "custom");
      if (L0.p === "custom") { const C = c(), k = C.img ? "img" : /gradient/.test(C.bg) ? "grad" : "color"; $("cl-bgk").querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.k === k)); $("cl-bg2").classList.toggle("hidden", k !== "grad"); $("cl-bg1").classList.toggle("hidden", k === "img"); $("cl-imgb").classList.toggle("hidden", k !== "img");
        const t = C.flat ? "flat" : C.bar ? "bar" : C.tail ? "tail" : "bub"; $("cl-type").querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.k === t)); $("cl-rv").textContent = (C.r ?? 18) + "px"; } };
    const contrast = (hex) => { const m = hex.replace("#", "").match(/../g) || ["ff", "ff", "ff"]; const [r, g, b] = m.map((x) => parseInt(x, 16)); return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? "#111" : "#fff"; };
    box.querySelector(".clgrid").onclick = (e) => { const b = e.target.closest("[data-clp]"); if (!b) return; L0.p = b.dataset.clp; if (L0.p === "custom") c(); draw(); };
    $("cl-bgk").onclick = (e) => { const b = e.target.closest("[data-k]"); if (!b) return; const C = c(); if (b.dataset.k === "img") { $("cl-img").click(); return; } C.img = null; C.bg = b.dataset.k === "grad" ? `linear-gradient(160deg,${$("cl-bg1").value},${$("cl-bg2").value})` : $("cl-bg1").value; C.ink = contrast($("cl-bg1").value); draw(); };
    const bgIn = () => { const C = c(), g = /gradient/.test(C.bg); C.img = null; C.bg = g ? `linear-gradient(160deg,${$("cl-bg1").value},${$("cl-bg2").value})` : $("cl-bg1").value; C.ink = contrast($("cl-bg1").value); draw(); };
    $("cl-bg1").oninput = bgIn; $("cl-bg2").oninput = bgIn; $("cl-imgb").onclick = () => $("cl-img").click();
    $("cl-img").onchange = async (e) => { const f = e.target.files[0]; if (!f) return; const img = new Image(); img.src = URL.createObjectURL(f); await img.decode().catch(() => {}); const s = Math.min(1, 900 / Math.max(img.width, img.height)), cv = document.createElement("canvas"); cv.width = Math.round(img.width * s); cv.height = Math.round(img.height * s); const x = cv.getContext("2d"); x.drawImage(img, 0, 0, cv.width, cv.height);
      const d = x.getImageData(0, 0, cv.width, cv.height).data; let L = 0; for (let i = 0; i < d.length; i += 400) L += d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114; L /= d.length / 400; const C = c(); C.img = cv.toDataURL("image/jpeg", 0.72); C.ink = L > 150 ? "#111" : "#fff"; draw(); };
    $("cl-me").oninput = (e) => { const C = c(); C.me = e.target.value; C.meT = contrast(e.target.value); C.meBar = e.target.value; draw(); };
    $("cl-th").oninput = (e) => { const C = c(); C.th = e.target.value; C.thT = contrast(e.target.value); C.thBar = e.target.value; draw(); };
    $("cl-type").onclick = (e) => { const b = e.target.closest("[data-k]"); if (!b) return; const C = c(); C.flat = b.dataset.k === "flat" || b.dataset.k === "bar" ? 1 : 0; C.bar = b.dataset.k === "bar" ? 1 : 0; C.tail = b.dataset.k === "tail" ? 1 : 0; draw(); };
    $("cl-r").oninput = (e) => { c().r = +e.target.value; draw(); }; $("cl-f").onchange = (e) => { c().f = e.target.value; draw(); }; $("cl-fs").oninput = (e) => { c().fs = +e.target.value; draw(); }; $("cl-noav").onchange = (e) => { c().noav = e.target.checked ? 1 : 0; draw(); };
    draw(); }

  /* ---------- wiring ---------- */
  document.querySelector(".fr3nav").onclick = (e) => { const b = e.target.closest("[data-fp]"); if (b) fpage(b.dataset.fp); };
  $("fr-invite").onclick = (e) => inviteMenu(e.currentTarget);
  $("chat-look").onclick = lookDlg;
  $("fr-shot").onclick = () => $("fr-shot-file").click(); $("fr-shot-file").onchange = (e) => { addShots([...e.target.files]); e.target.value = ""; };
  $("fr-cap").addEventListener("paste", (e) => { const fs = [...((e.clipboardData && e.clipboardData.files) || [])]; if (fs.length) { e.preventDefault(); addShots(fs); } });
  $("fr-cap").onkeydown = (e) => { if (e.key === "Enter") post(); }; $("fr-post").onclick = post;
  $("fr-shot-pend").onclick = (e) => { const b = e.target.closest("[data-srm]"); if (b) { shots.splice(+b.dataset.srm, 1); drawShots(); } };
  $("fr-posts").onclick = (e) => { const b = e.target.closest("[data-pdel]"); if (b) delPost(b.dataset.pdel); };
  $("fr-sess").onclick = (e) => { const b = e.target.closest("[data-rs]"); if (b && !b.disabled) replaySess(b.dataset.rs); };
  $("fr-duels").onclick = (e) => { const b = e.target.closest("[data-dacc],[data-ddec],[data-dcan],[data-dplay]"); if (!b) return; const dl = $("dl-list"); if (!dl) return;   // reuse the 1v1 handlers that live on the old list
    const ghost = document.createElement("button"); for (const k of ["dacc", "ddec", "dcan", "dplay"]) if (b.dataset[k]) ghost.dataset[k] = b.dataset[k]; dl.appendChild(ghost); ghost.click(); ghost.remove(); duelCache = null; setTimeout(renderLB3, 600); };
  // chat in the rail is always there: a new message while you're on another Friends page lights the Chat tab
  new MutationObserver(() => { if (page !== "chat" && !document.querySelector("#v-friends").classList.contains("hidden")) $("fr3-chatdot").classList.remove("hidden"); }).observe($("chat"), { childList: true });
  addEventListener("resize", () => document.body.classList.toggle("fr3view", phone()));
  document.body.classList.toggle("fr3view", phone());
  const tryLook = () => { try { applyLook(); } catch (e) {} }; tryLook(); setTimeout(tryLook, 1500); new MutationObserver(tryLook).observe(document.body, { attributes: true, attributeFilter: ["class", "data-theme"] });
})();
