/* KING_NOTES (King, Nov 24): the group's notes, organized by topic.
   - The original is kept exactly as written (text and screenshots).
   - "Organized" = the AI reformats it so every note looks the same, keeping the content.
   - "Kairos' Input" = the AI's additions, in their own section with the rainbow glow.
   - Anyone can propose an edit or request a deletion; the note's creator accepts or declines. */
(function () {
  const $ = (id) => document.getElementById(id);
  const IC = (p) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
  const TOPICS = ["Mental", "Model", "Execution", "Risk", "Strategy"];
  const myId = () => (DEMO ? "demo" : me && me.user_id);
  let notes = [], reqs = [], topic = "All", q = "", openId = null;

  /* tiny formatter: "## " headings, "- " bullets, **bold**; everything escaped first */
  function md(t) { const out = []; let ul = false; const inl = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
    String(t || "").split("\n").forEach((l) => { const L = l.trim(); if (/^-\s+/.test(L)) { if (!ul) { out.push("<ul>"); ul = true; } out.push(`<li>${inl(L.replace(/^-\s+/, ""))}</li>`); return; }
      if (ul) { out.push("</ul>"); ul = false; } if (/^#{1,3}\s+/.test(L)) out.push(`<h4>${inl(L.replace(/^#{1,3}\s+/, ""))}</h4>`); else if (L) out.push(`<p>${inl(L)}</p>`); });
    if (ul) out.push("</ul>"); return out.join(""); }

  async function load() {
    if (DEMO) { if (!mem.notes) { const t = Date.now(); mem.notes = [
        { id: "n1", user_id: "b", topic: "Model", title: "IFVG entry checklist", original: "need liquidity taken first (session hi/lo or pdh/pdl)\nthen displacement thru a fvg, inverse it\nenter on close back thru, stop above the swing\n9:50-10:10 best window. skip if no smt", original_att: [], organized: "## Setup\n- **Liquidity taken first**: session high/low or previous day high/low\n- **Displacement** through a fair value gap, then it inverts\n## Entries\n- Enter on the close back through the gap\n- Best window: **9:50 to 10:10**\n## Exits\n- Stop above the swing\n## Rules\n- Skip it if there's **no SMT**", expanded: "- \"Close back through\" could mean the 1m or 15s close; pick one and write it down so backtests are consistent.\n- The 9:50 to 10:10 window is a good backtest filter: compare win rate inside vs outside it.\n- Test question: how often does the trade still work when SMT is present but weak?", created_at: new Date(t - 864e5 * 2).toISOString(), updated_at: new Date(t - 864e5).toISOString() },
        { id: "n2", user_id: "demo", topic: "Mental", title: "After two losses", original: "two red trades = done for the day. walk away, no revenge. journal it first", original_att: [], organized: "## Rules\n- **Two losing trades = done for the day**\n- Walk away; no revenge trades\n- Journal the day before leaving", expanded: "- On a prop account this also protects the daily loss limit on bad days.\n- Track it: count the days you stopped at two and what the next day looked like.", created_at: new Date(t - 36e5 * 5).toISOString(), updated_at: new Date(t - 36e5 * 5).toISOString() }];
        mem.nreq = [{ id: "r1", note_id: "n2", user_id: "b", kind: "edit", body: "two red trades = done for the day. walk away, no revenge. journal it first. also no trading the first 5 min after", reason: "added the open rule we talked about", status: "pending", created_at: new Date(t - 36e5).toISOString() }]; }
      notes = mem.notes; reqs = mem.nreq; return; }
    const [a, b] = await Promise.all([sb.from("notes").select("*").order("updated_at", { ascending: false }).limit(300), sb.from("note_requests").select("*").order("created_at", { ascending: false }).limit(300)]);
    if (a.error) toast(a.error.message); notes = a.data || []; reqs = b.data || []; }

  window.renderNotes = async function () { const root = $("notes-app"); if (!root) return; if (!root.dataset.ok) { root.dataset.ok = 1; root.innerHTML = `<div class="ntop"><div class="ntopics" id="n-topics"></div><span class="tsp"></span><input id="n-q" placeholder="Search notes" class="nq"><button class="primary nnew" id="n-new">${IC('<path d="M12 5v14M5 12h14"/>')}New note</button></div><div class="nmine" id="n-mine"></div><div class="ngrid" id="n-grid"></div>`;
      $("n-new").onclick = () => editor(); $("n-q").oninput = (e) => { q = e.target.value.toLowerCase(); draw(); };
      $("n-topics").onclick = (e) => { const b = e.target.closest("[data-t]"); if (b) { topic = b.dataset.t; draw(); } };
      $("n-grid").onclick = (e) => { const c = e.target.closest("[data-nid]"); if (c && !e.target.closest("[data-pm]")) view(c.dataset.nid); };
      $("n-mine").onclick = (e) => { const b = e.target.closest("[data-nid]"); if (b) view(b.dataset.nid); }; }
    await load(); draw(); if (openId) view(openId); };

  function draw() { const all = [...new Set([...TOPICS, ...notes.map((n) => n.topic).filter(Boolean)])];
    $("n-topics").innerHTML = ["All", ...all].map((t) => `<button data-t="${esc(t)}" class="${t === topic ? "on" : ""}">${esc(t)}<span>${t === "All" ? notes.length : notes.filter((n) => n.topic === t).length}</span></button>`).join("");
    const pend = reqs.filter((r) => r.status === "pending" && (notes.find((n) => n.id === r.note_id) || {}).user_id === myId());
    $("n-mine").innerHTML = pend.length ? `<div class="nreqbar">${IC('<path d="M6 17V11a6 6 0 0 1 12 0v6l1.5 2h-15z"/><path d="M10 21h4"/>')}<span><b>${pend.length} request${pend.length > 1 ? "s" : ""} on your notes</b><span class="tiny muted">${pend.map((r) => `${who(r.user_id, "someone")} ${r.kind === "delete" ? "asked to delete" : "proposed an edit to"} "${esc(((notes.find((n) => n.id === r.note_id) || {}).title) || "a note")}"`).slice(0, 2).join(" · ")}</span></span>${pend.slice(0, 3).map((r) => `<button class="ghost small" data-nid="${esc(r.note_id)}">Review</button>`).join("")}</div>` : "";
    const L = notes.filter((n) => (topic === "All" || n.topic === topic) && (!q || [n.title, n.original, n.organized, n.topic, names[n.user_id]].join(" ").toLowerCase().includes(q)));
    $("n-grid").innerHTML = L.map((n) => { const pr = reqs.filter((r) => r.note_id === n.id && r.status === "pending").length, body = n.organized || n.original || "";
      return `<article class="ncard" data-nid="${esc(n.id)}" tabindex="0"><div class="nch"><span class="ntag">${esc(n.topic || "General")}</span>${pr ? `<span class="npend">${pr} pending</span>` : ""}${n.organized ? "" : '<span class="ntag soft">not organized yet</span>'}</div>
        <h4>${esc(n.title || "Untitled")}</h4><div class="nprev">${n.organized ? md(body.split("\n").slice(0, 7).join("\n")) : `<p>${esc(body.slice(0, 220))}</p>`}</div>
        <div class="nfoot"><span data-pm="${esc(n.user_id === myId() ? "" : n.user_id)}">${avatarHtml(n.user_id, 22)}</span><span>${who(n.user_id, "trader")}</span><span class="tiny muted">${ago(n.updated_at || n.created_at)}</span>${(n.original_att || []).length ? `<span class="tiny muted nimg">${IC('<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 17l-5-5-9 8"/>')}${n.original_att.length}</span>` : ""}</div></article>`; }).join("")
      || `<div class="empty">${notes.length ? "No notes match." : "No notes yet. Paste your best rules, screenshots of your notes, or what you learned this week. KAIROS lays them out the same way for everyone."}</div>`; }

  /* ---------- new / edit ---------- */
  let pend = [];
  function editor(n) { pend = (n && n.original_att ? n.original_att.map((a) => ({ ...a })) : []); const all = [...new Set([...TOPICS, ...notes.map((x) => x.topic).filter(Boolean)])];
    wideDlg(`<h3>${n ? "Edit your note" : "New note"}</h3><p class="small muted">Paste text or add screenshots. Your original is always kept as you wrote it; KAIROS lays it out in the shared style and adds its own input in a separate section.</p>
      <div class="ned"><input id="ne-title" placeholder="Title (optional)" maxlength="120" value="${esc((n && n.title) || "")}"><div class="netopic"><select id="ne-topic">${all.map((t) => `<option ${n ? (t === n.topic ? "selected" : "") : t === (topic !== "All" ? topic : "Model") ? "selected" : ""}>${esc(t)}</option>`).join("")}<option value="+">New topic…</option></select><input id="ne-newt" class="hidden" placeholder="Topic name" maxlength="30"></div>
      <textarea id="ne-text" rows="10" placeholder="Paste or type your note…">${esc((n && n.original) || "")}</textarea>
      <div class="neatt"><button class="ghost small" id="ne-add">${IC('<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 17l-5-5-9 8"/>')}Add screenshots</button><input id="ne-file" type="file" accept="image/*" multiple hidden><div id="ne-pend" class="fch-att"></div></div>
      <label class="ck small"><input type="checkbox" id="ne-ai" checked> Organize it with AI (keeps your words, same look as every note)</label></div>`,
      [{ t: "Cancel" }, { t: n ? "Save" : "Add note", primary: true, f: () => save(n) }]);
    $("ne-topic").onchange = (e) => $("ne-newt").classList.toggle("hidden", e.target.value !== "+");
    $("ne-add").onclick = () => $("ne-file").click(); $("ne-file").onchange = (e) => { addImgs([...e.target.files]); e.target.value = ""; };
    $("ne-text").addEventListener("paste", (e) => { const fs = [...((e.clipboardData && e.clipboardData.files) || [])].filter((f) => f.type.startsWith("image/")); if (fs.length) { e.preventDefault(); addImgs(fs); } });
    $("ne-pend").onclick = (e) => { const b = e.target.closest("[data-rm]"); if (b) { pend.splice(+b.dataset.rm, 1); drawPend(); } }; drawPend(); }
  function drawPend() { const b = $("ne-pend"); if (!b) return; b.innerHTML = pend.map((a, k) => `<span class="fpend ${a.busy ? "busy" : ""}">${a.preview ? `<img src="${a.preview}" alt="">` : ""}<span>${esc(a.name || "screenshot")}</span>${a.busy ? '<i class="spin"></i>' : `<button data-rm="${k}" aria-label="Remove">${IC('<path d="M6 6l12 12M18 6L6 18"/>')}</button>`}</span>`).join(""); }
  async function addImgs(files) { for (const f of files) { if (!f.type.startsWith("image/")) continue; if (f.size > 15e6) { toast(f.name + " is over 15 MB"); continue; }
      const a = { name: f.name || "screenshot", type: f.type, size: f.size, busy: true, preview: URL.createObjectURL(f) }; pend.push(a); drawPend();
      if (DEMO) { a.demo = a.preview; a.busy = false; drawPend(); continue; }
      const path = `${me.user_id}/notes/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${(f.name || "shot").replace(/[^\w.-]+/g, "_").slice(-50)}`;
      const { error } = await sb.storage.from("chat").upload(path, f, { contentType: f.type, upsert: false }); a.busy = false; if (error) { pend.splice(pend.indexOf(a), 1); toast("Upload failed: " + error.message); } else a.path = path; drawPend(); } }
  async function save(n) { if (pend.some((a) => a.busy)) { toast("Still uploading…"); return false; }
    const text = $("ne-text").value.trim().slice(0, 20000), att = pend.filter((a) => a.path || a.demo).map(({ path, name, type, size, demo }) => ({ path, name, type, size, demo }));
    if (!text && !att.length) { toast("Write something or add a screenshot"); return false; }
    let tp = $("ne-topic").value; if (tp === "+") tp = $("ne-newt").value.trim().slice(0, 30) || "General";
    const row = { title: $("ne-title").value.trim().slice(0, 120), topic: tp, original: text, original_att: att, updated_at: new Date().toISOString() }, ai = $("ne-ai").checked;
    let id = n && n.id;
    if (DEMO) { if (n) Object.assign(n, row, { organized: ai ? n.organized : null }); else { id = "n" + Date.now(); mem.notes.unshift({ id, user_id: "demo", created_at: row.updated_at, organized: null, expanded: null, ...row }); } }
    else if (n) { const { error } = await sb.from("notes").update({ ...row, ...(ai ? {} : { organized: null, expanded: null }) }).eq("id", n.id); if (error) { toast(error.message); return false; } }
    else { const { data, error } = await sb.from("notes").insert(row).select().single(); if (error) { toast(error.message); return false; } id = data.id; }
    topic = tp; openId = null; await window.renderNotes(); if (ai) organize(id); return true; }
  async function organize(id) { const n = notes.find((x) => x.id === id); if (!n) return; const card = document.querySelector(`.ncard[data-nid="${id}"]`); card && card.classList.add("busy"); const vb = $("nv-org"); vb && vb.classList.add("busy");
    if (DEMO) { await new Promise((r) => setTimeout(r, 900)); if (!n.title) n.title = String(n.original || "").split("\n")[0].slice(0, 40); n.organized = "## Notes\n" + String(n.original || "").split(/\n+/).filter(Boolean).map((l) => "- " + l.trim()).join("\n"); n.expanded = "- In the live app, KAIROS lays this out in the shared style and adds its own input here."; await window.renderNotes(); if (openId === id) view(id); return; }
    const { data, error } = await sb.functions.invoke("helper", { body: { mode: "note", note_id: id } });
    if (error || (data && data.error)) { let msg = (data && data.error) || (error && error.message) || "failed"; try { const j = error && error.context && (await error.context.json()); if (j && j.error) msg = j.error; } catch (e) {} toast("Couldn't organize: " + msg); card && card.classList.remove("busy"); vb && vb.classList.remove("busy"); return; }
    Object.assign(n, data); draw(); if (openId === id) view(id); }

  /* ---------- open a note ---------- */
  function view(id) { const n = notes.find((x) => x.id === id); if (!n) return; openId = id; const mine = n.user_id === myId(), rq = reqs.filter((r) => r.note_id === id), pendR = rq.filter((r) => r.status === "pending");
    wideDlg(`<div class="nview"><div class="nvh"><span class="ntag">${esc(n.topic || "General")}</span><span class="tsp"></span>${avatarHtml(n.user_id, 26)}<b>${who(n.user_id, "trader")}</b><span class="tiny muted">${ago(n.updated_at || n.created_at)}</span></div>
      <h3 class="nvt">${esc(n.title || "Untitled")}</h3>
      <div class="seg mini nvtabs" id="nv-tabs"><button data-v="org" class="on">Organized</button><button data-v="orig">Original</button></div>
      <div id="nv-org" class="nbody nvorg">${n.organized ? md(n.organized) : `<p class="muted">Not organized yet.${mine ? " Use Organize below." : ""}</p>`}</div>
      <div id="nv-orig" class="nbody nvorig hidden"><div class="noteorig">${esc(n.original || "")}</div>${attHtml(n.original_att)}</div>
      ${n.expanded ? `<section class="kin"><h4 class="kinh">${IC('<path d="M12 3l1.8 4.6L18.5 9l-4.7 1.6L12 15l-1.8-4.4L5.5 9l4.7-1.4z"/><path d="M19 15l.8 2 2 .8-2 .7-.8 2-.8-2-2-.7 2-.8z"/>')}<span>Kairos' Input</span></h4><div class="nbody">${md(n.expanded)}</div></section>` : ""}
      ${mine && pendR.length ? `<section class="nreqs"><h4>Requests</h4>${pendR.map((r) => `<div class="nreq"><div class="nrh">${avatarHtml(r.user_id, 22)}<b>${who(r.user_id, "someone")}</b><span class="tiny muted">${r.kind === "delete" ? "asked to delete this note" : "proposed an edit"} · ${ago(r.created_at)}</span></div>${r.reason ? `<p class="small">"${esc(r.reason)}"</p>` : ""}${r.kind === "edit" ? `<details class="ndiff"><summary>See their version</summary><div class="noteorig">${esc(r.body || "")}</div></details>` : ""}<div class="row nra"><button class="primary small" data-ra="${esc(r.id)}">${r.kind === "delete" ? "Delete the note" : "Accept edit"}</button><button class="ghost small" data-rd="${esc(r.id)}">Decline</button></div></div>`).join("")}</section>` : ""}
      ${!mine && rq.some((r) => r.user_id === myId() && r.status === "pending") ? `<p class="tiny muted">You have a request waiting on ${who(n.user_id, "the creator")}.${rq.filter((r) => r.user_id === myId() && r.status === "pending").map((r) => ` <button class="linkb" data-rw="${esc(r.id)}">Withdraw</button>`).join("")}</p>` : ""}
      <div class="nacts">${mine ? `<button class="ghost small" data-na="edit">Edit</button><button class="ghost small" data-na="org">${n.organized ? "Re-organize" : "Organize"}</button><span class="tsp"></span><button class="ghost small danger" data-na="del">Delete</button>`
        : `<button class="ghost small" data-na="prop">Propose an edit</button><button class="ghost small" data-na="rdel">Request deletion</button>`}</div></div>`, [{ t: "Close" }]);
    const box = $("dlgbox"); fillAtt(box);
    $("nv-tabs").onclick = (e) => { const b = e.target.closest("[data-v]"); if (!b) return; $("nv-tabs").querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b)); $("nv-org").classList.toggle("hidden", b.dataset.v !== "org"); $("nv-orig").classList.toggle("hidden", b.dataset.v !== "orig"); };
    box.querySelector(".nview").onclick = async (e) => { const b = e.target.closest("[data-na],[data-ra],[data-rd],[data-rw]"); if (!b) return;
      if (b.dataset.na === "edit") return editor(n); if (b.dataset.na === "org") return organize(n.id); if (b.dataset.na === "del") return del(n);
      if (b.dataset.na === "prop") return propose(n); if (b.dataset.na === "rdel") return reqDel(n);
      if (b.dataset.ra) return decide(b.dataset.ra, true); if (b.dataset.rd) return decide(b.dataset.rd, false); if (b.dataset.rw) return withdraw(b.dataset.rw); }; }
  const closeDlg = () => { const x = document.querySelector("#dlgbox .wbtns button"); x && x.click(); };
  async function del(n) { if (!(await kAsk("Delete this note for everyone?", { ok: "Delete", danger: true }))) return; if (DEMO) mem.notes = mem.notes.filter((x) => x.id !== n.id); else { const { error } = await sb.from("notes").delete().eq("id", n.id); if (error) return toast(error.message); } openId = null; closeDlg(); window.renderNotes(); }
  function propose(n) { wideDlg(`<h3>Propose an edit</h3><p class="small muted">${who(n.user_id, "The creator")} sees your version and can accept it. Their original stays until they do.</p><textarea id="np-text" rows="10">${esc(n.original || "")}</textarea><input id="np-why" placeholder="What changed and why (optional)" maxlength="300">`,
      [{ t: "Cancel" }, { t: "Send", primary: true, f: () => sendReq(n, "edit", $("np-text").value.trim().slice(0, 20000), $("np-why").value.trim()) }]); }
  function reqDel(n) { wideDlg(`<h3>Request deletion</h3><p class="small muted">${who(n.user_id, "The creator")} decides. Say why.</p><input id="nd-why" placeholder="Why should it go?" maxlength="300">`, [{ t: "Cancel" }, { t: "Send request", primary: true, f: () => sendReq(n, "delete", null, $("nd-why").value.trim()) }]); }
  async function sendReq(n, kind, body, reason) { if (kind === "edit" && (!body || body === n.original)) { toast("Change something first"); return false; }
    const row = { note_id: n.id, kind, body, reason, status: "pending" }; if (DEMO) mem.nreq.unshift({ id: "r" + Date.now(), user_id: "demo", created_at: new Date().toISOString(), ...row }); else { const { error } = await sb.from("note_requests").insert(row); if (error) { toast(error.message); return false; } }
    toast("Sent to " + (names[n.user_id] || "the creator")); window.renderNotes(); return true; }
  async function decide(rid, yes) { const r = reqs.find((x) => x.id === rid), n = r && notes.find((x) => x.id === r.note_id); if (!r || !n) return; const st = { status: yes ? "accepted" : "declined", decided_at: new Date().toISOString() };
    if (DEMO) Object.assign(r, st); else { const { error } = await sb.from("note_requests").update(st).eq("id", rid); if (error) return toast(error.message); }
    if (yes && r.kind === "delete") { if (DEMO) mem.notes = mem.notes.filter((x) => x.id !== n.id); else await sb.from("notes").delete().eq("id", n.id); openId = null; closeDlg(); toast("Note deleted"); return window.renderNotes(); }
    if (yes && r.kind === "edit") { if (DEMO) Object.assign(n, { original: r.body, updated_at: new Date().toISOString() }); else { const { error } = await sb.from("notes").update({ original: r.body, updated_at: new Date().toISOString() }).eq("id", n.id); if (error) return toast(error.message); } await window.renderNotes(); organize(n.id); toast("Edit accepted. Re-organizing…"); return; }
    await window.renderNotes(); view(n.id); }
  async function withdraw(rid) { if (DEMO) mem.nreq = mem.nreq.filter((x) => x.id !== rid); else { const { error } = await sb.from("note_requests").delete().eq("id", rid); if (error) return toast(error.message); } await window.renderNotes(); if (openId) view(openId); }
})();
