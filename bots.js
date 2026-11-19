/* KING_BOTS (King, Nov 18 2026): two locked-down helpers.
   - KAIROS helper: on every page (sidebar "Ask" button) and on its own page. Cheapest model, hard daily + monthly caps, small cost note.
   - Template helper: builds a person's journal template from screenshots. Answered by King's Mac (Claude Code, no tools).
     It only talks about the template; anything else gets a button that hands the question to the KAIROS helper. */
(function () {
const $b = (id) => document.getElementById(id);
const B = window.BOT = { thread: null, msgs: [], tpl: null, tplMsgs: [], subs: {}, busy: false };
const DEMO_ON = typeof DEMO !== "undefined" && DEMO;

/* ---------- data layer (Supabase; an in-memory stand-in in the demo) ---------- */
const mem = { th: [], ms: [] };
const api = B.api = {
  async newThread(kind) { if (DEMO_ON) { const t = { id: "t" + Math.random().toString(36).slice(2), kind, status: "waiting", user_id: "demo" }; mem.th.push(t); return t; }
    const { data, error } = await sb.from("bot_threads").insert({ kind }).select().single(); if (error) throw error; return data; },
  async latest(kind) { if (DEMO_ON) return mem.th.filter((t) => t.kind === kind).pop() || null;
    const { data } = await sb.from("bot_threads").select("*").eq("kind", kind).order("created_at", { ascending: false }).limit(1); return (data || [])[0] || null; },
  async thread(id) { if (DEMO_ON) return mem.th.find((t) => t.id === id); const { data } = await sb.from("bot_threads").select("*").eq("id", id).maybeSingle(); return data; },
  async messages(id) { if (DEMO_ON) return mem.ms.filter((m) => m.thread_id === id); const { data } = await sb.from("bot_messages").select("*").eq("thread_id", id).order("id"); return data || []; },
  async upload(blob) { const path = `${user.id}/tpl/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`; const { error } = await sb.storage.from("journal").upload(path, blob, { contentType: "image/jpeg" }); if (error) throw error; return path; },
  async send(t, body, images = []) { if (DEMO_ON) { mem.ms.push({ id: mem.ms.length + 1, thread_id: t.id, role: "user", body, images, created_at: new Date().toISOString() }); demoReply(t, body, images); return; }
    const paths = []; for (const b of images) paths.push(await api.upload(b));
    const { error } = await sb.from("bot_messages").insert({ thread_id: t.id, role: "user", body, images: paths.length ? paths : null }); if (error) throw error; },
  async askHelper(t, context) { if (DEMO_ON) return; const { error } = await sb.functions.invoke("helper", { body: { thread_id: t.id, context } }); if (error) { let m = error.message; try { m = (await error.context.json()).error || m; } catch (e) {} throw new Error(m); } },
  subscribe(t, cb) { if (DEMO_ON || !sb.channel) return () => {}; const ch = sb.channel("bot-" + t.id).on("postgres_changes", { event: "INSERT", schema: "public", table: "bot_messages", filter: "thread_id=eq." + t.id }, cb).subscribe(); return () => sb.removeChannel(ch); },
};
function demoReply(t, body, images) { setTimeout(() => {   // demo only: canned replies so the screens can be tried without the server
  const push = (m) => { t.status = m.meta && m.meta.template ? "done" : "needs_user"; mem.ms.push({ id: mem.ms.length + 1, thread_id: t.id, role: "bot", created_at: new Date().toISOString(), ...m }); B.refresh(t.id); };
  if (t.kind === "helper") return push({ body: "Demo helper: in the real app I answer questions about KAIROS here. Try the Journal's \"+ Quick backtest\" button for fast logging." });
  const nUser = mem.ms.filter((m) => m.thread_id === t.id && m.role === "user").length;
  if (/poem|ignore|weather/i.test(body)) return push({ body: "I only set up your journal template. The KAIROS helper can answer that.", meta: { redirect: true } });
  if (nUser === 1) return push({ body: "Got your screenshot. Is \"Mentality\" a list of tags you pick from, or something you write out?", choices: ["Tags I pick", "I write it out"] });
  push({ body: "Here's your template. 5 fields, matching your screenshot.", meta: { template: { summary: "Demo template", fields: [{ n: "Setup", t: "multi", opts: [{ name: "IFVG", color: "purple" }, { name: "Sweep", color: "blue" }], quick: true }, { n: "Mentality", t: "multi", opts: [{ name: "Calm", color: "green" }, { name: "FOMO", color: "red" }] }, { n: "Pre-trade plan", t: "text" }, { n: "Review", t: "text" }, { n: "Chart link", t: "link" }] } } });
}, 400); }

/* ---------- shared chat renderer ---------- */
const escH = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const fmtBody = (s) => escH(s).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/\n/g, "<br>");
function bubbles(msgs, kind) { return msgs.map((m) => { const mine = m.role === "user";
  let extra = ""; if (!mine && m.choices && m.choices.length) extra += `<div class="bchoices">${m.choices.map((c) => `<button data-choice="${escH(c)}">${escH(c)}</button>`).join("")}</div>`;
  if (!mine && m.meta && m.meta.redirect) extra += `<div class="bchoices"><button data-tohelper="1">Ask the KAIROS helper</button></div>`;
  if (!mine && m.meta && m.meta.template) extra += tplPreview(m.meta.template);
  return `<div class="bmsg ${mine ? "me" : "bot"}">${m.images && m.images.length ? `<div class="bimgs">${m.images.length} screenshot${m.images.length > 1 ? "s" : ""} sent</div>` : ""}${m.body ? `<div class="btxt">${fmtBody(m.body)}</div>` : ""}${extra}</div>`; }).join(""); }

/* ---------- KAIROS helper (every page + its own page) ---------- */
const HELP_NOTE = `<div class="bnote">Each message costs King a little, so please don't spam it. Limit: 30 a day.</div>`;
function helperHtml(big) { return `<div class="bchat${big ? " big" : ""}"><div class="bhead"><b>KAIROS helper</b><span class="tsp"></span>${big ? "" : '<button class="ghost small" data-hp="page">Open page</button>'}<button class="ghost small" data-hp="new">New chat</button>${big ? "" : '<button class="ghost small" data-hp="close" aria-label="Close">×</button>'}</div>
  <div class="blog" data-blog="helper">${B.msgs.length ? bubbles(B.msgs, "helper") : `<div class="bempty">Ask anything about KAIROS: "how do I log a quick backtest?", "what does profit factor mean?", "where do I set my drawdown?"</div>`}${B.busy ? '<div class="bmsg bot"><div class="btxt bdots">…</div></div>' : ""}</div>
  <form class="bform" data-bform="helper"><textarea rows="1" maxlength="1500" placeholder="Ask about KAIROS…"></textarea><button class="primary" type="submit">Send</button></form>${HELP_NOTE}</div>`; }
function drawHelper() { const pop = $b("botpop"), pg = $b("v-help");
  if (pop && !pop.classList.contains("hidden")) pop.innerHTML = helperHtml(false);
  if (pg && !pg.classList.contains("hidden")) $b("help-host").innerHTML = helperHtml(true);
  document.querySelectorAll('[data-blog="helper"]').forEach((el) => (el.scrollTop = 1e9)); }
async function loadHelper(fresh) { if (fresh || !B.thread) { B.thread = fresh ? null : await api.latest("helper").catch(() => null); B.msgs = B.thread ? await api.messages(B.thread.id) : []; watch(B.thread); } drawHelper(); }
function watch(t) { if (!t || B.subs[t.id]) return; B.subs[t.id] = api.subscribe(t, () => B.refresh(t.id)); }
B.refresh = async (id) => { if (B.thread && id === B.thread.id) { B.msgs = await api.messages(id); if (B.msgs.length && B.msgs[B.msgs.length - 1].role === "bot") B.busy = false; drawHelper(); }
  if (B.tpl && id === B.tpl.id) { B.tplMsgs = await api.messages(id); B.tpl = (await api.thread(id)) || B.tpl; drawTpl(); } };
function pageContext() { const v = (document.getElementById("app") || {}).dataset ? $b("app").dataset.v : ""; let s = "Page: " + (v || "trade");
  try { if (window.JN && JN.cfg && JN._fr) { const a = JN.agg(JN._fr); s += `\nJournal (current filter): ${a.n} trades, win rate ${a.wr == null ? "n/a" : Math.round(a.wr) + "%"}, net ${Math.round(a.net)}, avg R ${a.avgR == null ? "n/a" : a.avgR.toFixed(2)}, profit factor ${a.pf == null ? "n/a" : a.pf.toFixed(2)}, max drawdown ${Math.round(a.dd)}. Fields: ${JN.cfg.fields.map((f) => f.n).join(", ")}.`; } } catch (e) {}
  return s; }
async function sendHelper(text) { text = text.trim(); if (!text || B.busy) return; if (!B.thread) { B.thread = await api.newThread("helper"); watch(B.thread); }
  B.msgs.push({ role: "user", body: text }); B.busy = true; drawHelper();
  try { await api.send(B.thread, text); await api.askHelper(B.thread, pageContext()); } catch (e) { B.busy = false; B.msgs.push({ role: "bot", body: "Couldn't reach the helper: " + e.message }); drawHelper(); return; }
  B.msgs = await api.messages(B.thread.id); if (B.msgs.length && B.msgs[B.msgs.length - 1].role === "bot") B.busy = false; drawHelper(); setTimeout(() => { if (B.busy) B.refresh(B.thread.id); }, 6000); }
function openPop(prefill) { const p = $b("botpop"); p.classList.remove("hidden"); loadHelper().then(() => { if (prefill) { const ta = p.querySelector("textarea"); if (ta) { ta.value = prefill; ta.focus(); } } else { const ta = p.querySelector("textarea"); ta && ta.focus(); } }); }
B.openHelper = openPop;

/* ---------- template helper ---------- */
const TPL_TYPES = { text: "Text", number: "Number", money: "Money", select: "Pick one", multi: "Tags", date: "Date", link: "Link", check: "Checkbox", files: "Pictures" };
function tplPreview(t) { const NC = { gray: "#474747", brown: "#5c3b23", orange: "#7a4a14", yellow: "#7a6118", green: "#2b5a3f", blue: "#284a73", purple: "#4b3170", pink: "#6d3150", red: "#7a3330", default: "#373737" };
  return `<div class="tplprev"><div class="muted small">${(t.fields || []).length} fields${t.summary ? " · " + escH(t.summary) : ""}</div>${(t.fields || []).map((f) => `<div class="tplf"><b>${escH(f.n)}</b><span class="muted small">${TPL_TYPES[f.t] || f.t}${f.quick ? " · on quick log" : ""}</span><div>${(f.opts || []).slice(0, 30).map((o) => `<span class="jtag" style="background:${NC[o.color] || NC.default}">${escH(o.name)}</span>`).join(" ")}</div></div>`).join("")}
    <div class="row"><button class="primary" data-tpluse="add">Add these to my fields</button><button class="ghost" data-tpluse="replace">Replace my fields with these</button></div></div>`; }
function tplHtml() { const t = B.tpl, msgs = B.tplMsgs, st = t ? t.status : null;
  const wait = st === "waiting" || st === "working"; const pending = B.tplImgs || [];
  return `<div class="bhead"><b>Set up my journal from a screenshot</b><span class="tsp"></span>${t ? '<button class="ghost small" data-tp="restart">Start over</button>' : ""}<button class="ghost small" data-tp="close">Close</button></div>
  <p class="muted small">Send screenshots of your current journal (Notion, Excel, TradeZella, paper, anything). The setup helper asks a few questions, then shows your template. Nothing changes until you tap to use it.</p>
  <div class="blog tpllog">${msgs.length ? bubbles(msgs, "template") : ""}${wait ? `<div class="bmsg bot"><div class="btxt bdots">${st === "working" ? "Reading your journal…" : "Waiting for the setup helper. It runs on King's computer, so if it's off this can take a while. You can close this; it'll be here when you come back."}</div></div>` : ""}</div>
  <div class="tplimgs">${pending.map((p, i) => `<span class="tplth" style="background-image:url('${p.url}')"><button data-tprm="${i}" aria-label="Remove">×</button></span>`).join("")}<label class="tpladd">+ Screenshot<input type="file" accept="image/*" multiple id="tpl-file" hidden></label></div>
  <form class="bform" data-bform="template"><textarea rows="2" maxlength="1500" placeholder="${t ? "Answer, or tell it what to change…" : "Anything it should know? (optional) e.g. \"I also log my sleep and mood\""}"></textarea><button class="primary" type="submit">${t ? "Send" : "Send to setup helper"}</button></form>`; }
function drawTpl() { const p = $b("tplpop"); if (!p || p.classList.contains("hidden")) return; p.querySelector(".tplbox").innerHTML = tplHtml(); const l = p.querySelector(".tpllog"); if (l) l.scrollTop = 1e9; }
async function openTpl() { const p = $b("tplpop"); p.classList.remove("hidden"); if (!B.tpl) { const t = await api.latest("template").catch(() => null); if (t && t.status !== "done") { B.tpl = t; B.tplMsgs = await api.messages(t.id); watch(t); } } drawTpl(); }
B.openTemplate = openTpl;
async function shrink(file) { const img = await createImageBitmap(file); const s = Math.min(1, 2000 / Math.max(img.width, img.height)); const c = document.createElement("canvas"); c.width = img.width * s; c.height = img.height * s; c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  const blob = await new Promise((ok) => c.toBlob(ok, "image/jpeg", 0.88)); return { blob, url: URL.createObjectURL(blob) }; }
async function addTplImgs(files) { B.tplImgs = B.tplImgs || []; for (const f of files) if (/^image\//.test(f.type) && B.tplImgs.length < 6) B.tplImgs.push(await shrink(f)); drawTpl(); }
async function sendTpl(text) { const imgs = B.tplImgs || []; if (!B.tpl && !imgs.length) { toast("Add a screenshot of your journal first"); return; } if (!text.trim() && !imgs.length) return;
  if (!B.tpl) { B.tpl = await api.newThread("template"); watch(B.tpl); }
  const t = B.tpl; B.tplImgs = []; B.tplMsgs.push({ role: "user", body: text, images: imgs.map(() => "x") }); t.status = "waiting"; drawTpl();
  try { await api.send(t, text, imgs.map((i) => i.blob)); } catch (e) { toast("Couldn't send: " + e.message); } B.tplMsgs = await api.messages(t.id); drawTpl(); }
function useTemplate(t, mode) { if (!window.JN || !JN.cfg) return toast("Open the Journal first");
  const cfg = JN.cfg, keep = cfg.fields.filter((f) => f.core); const made = (t.fields || []).map((f, i) => ({ k: "t_" + String(f.n).toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 28) + "_" + i, n: String(f.n).slice(0, 40), t: TPL_TYPES[f.t] ? (f.t === "files" ? "files" : f.t) : "text", opts: (f.opts || []).map((o) => ({ name: String(o.name).slice(0, 40), color: o.color || "default" })), quick: !!f.quick }));
  const fresh = made.filter((m) => !cfg.fields.some((x) => x.n.toLowerCase() === m.n.toLowerCase() && !x.hide));
  if (mode === "replace") { cfg.fields.forEach((f) => { if (!f.core) f.hide = true; }); cfg.fields = [...keep.filter((f) => f.k !== "files"), ...cfg.fields.filter((f) => !f.core), ...made.filter((m) => !keep.some((x) => x.n.toLowerCase() === m.n.toLowerCase())), ...keep.filter((f) => f.k === "files")]; }
  else { const at = cfg.fields.findIndex((f) => f.k === "files"); cfg.fields.splice(at < 0 ? cfg.fields.length : at, 0, ...fresh); }
  JN.saveCfgPublic(); JN.render(); toast(mode === "replace" ? "Your journal now uses this template. Old fields are hidden, not deleted." : `Added ${fresh.length} field${fresh.length === 1 ? "" : "s"} to your journal.`); }

/* ---------- wiring ---------- */
function wire() {
  document.addEventListener("click", (ev) => { const t = ev.target, b = t.closest("button,[data-hp]"); if (!b) return; const d = b.dataset;
    if (b.id === "rail-ask") { const p = $b("botpop"); p.classList.contains("hidden") ? openPop() : p.classList.add("hidden"); return; }
    if (d.hp === "close") $b("botpop").classList.add("hidden"); else if (d.hp === "page") { $b("botpop").classList.add("hidden"); view("help"); } else if (d.hp === "new") { B.thread = null; B.msgs = []; B.busy = false; drawHelper(); }
    else if (d.tp === "close") $b("tplpop").classList.add("hidden"); else if (d.tp === "restart") { B.tpl = null; B.tplMsgs = []; B.tplImgs = []; drawTpl(); }
    else if (d.tprm != null) { B.tplImgs.splice(+d.tprm, 1); drawTpl(); }
    else if (d.choice != null && t.closest("#tplpop")) sendTpl(d.choice); else if (d.choice != null) sendHelper(d.choice);
    else if (d.tohelper) { const last = [...B.tplMsgs].reverse().find((m) => m.role === "user" && m.body); $b("tplpop").classList.add("hidden"); openPop(last ? last.body : ""); }
    else if (d.tpluse) { const m = [...B.tplMsgs].reverse().find((x) => x.meta && x.meta.template); if (m) { if (d.tpluse === "replace" && !confirm("Use only these fields? Your current fields get hidden (not deleted) and your trades keep their data.")) return; useTemplate(m.meta.template, d.tpluse); $b("tplpop").classList.add("hidden"); } } });
  document.addEventListener("submit", (ev) => { const f = ev.target.closest("[data-bform]"); if (!f) return; ev.preventDefault(); const ta = f.querySelector("textarea"), v = ta.value; ta.value = ""; f.dataset.bform === "helper" ? sendHelper(v) : sendTpl(v); });
  document.addEventListener("keydown", (ev) => { const ta = ev.target.closest && ev.target.closest("[data-bform] textarea"); if (ta && ev.key === "Enter" && !ev.shiftKey) { ev.preventDefault(); ta.form.requestSubmit(); } if (ev.key === "Escape" && !$b("botpop").classList.contains("hidden")) $b("botpop").classList.add("hidden"); });
  document.addEventListener("change", (ev) => { if (ev.target.id === "tpl-file") addTplImgs([...ev.target.files]); });
  document.addEventListener("paste", (ev) => { if ($b("tplpop").classList.contains("hidden")) return; const fs = [...((ev.clipboardData || {}).files || [])].filter((f) => /^image\//.test(f.type)); if (fs.length) { ev.preventDefault(); addTplImgs(fs); } });
}
B.pageOpen = () => loadHelper();
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wire); else wire();
})();
