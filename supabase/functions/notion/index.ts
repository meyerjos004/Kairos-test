import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
// Notion for KAIROS users. Each user connects their OWN Notion (OAuth if NOTION_CLIENT_ID/SECRET are set, else an internal-integration token).
// Two directions, never mixed (KING_NOTION2, Nov 13 2026):
//   OUT: backtest trades -> a database KAIROS creates ("KAIROS Backtesting Trades"). KAIROS only ever writes there.
//   IN:  the user's own real-trade journal database (they pick it) -> read-only import, shown on the chart after that replay day ends.
// Tokens live in notion_links, readable only here (service role). Users only ever see their own status.
const SB = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const NV = "2022-06-28";
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const J = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
const notion = async (token: string, path: string, method = "GET", body?: unknown) => {
  const r = await fetch("https://api.notion.com/v1/" + path, { method, headers: { Authorization: "Bearer " + token, "Notion-Version": NV, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.message || ("Notion " + r.status)); return j;
};
const notion2 = async (token: string, path: string, method = "GET", body?: unknown) => {   // same, on the 2025-09-03 API (data sources)
  const r = await fetch("https://api.notion.com/v1/" + path, { method, headers: { Authorization: "Bearer " + token, "Notion-Version": "2025-09-03", "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.message || ("Notion " + r.status)); return j;
};
const title = (o: any) => { const p = o.properties || {}; for (const k in p) if (p[k].type === "title") return (p[k].title || []).map((t: any) => t.plain_text).join("") || "Untitled"; return (o.title || []).map((t: any) => t.plain_text).join("") || "Untitled"; };
const fmtNY = (t: number) => new Date(t * 1000).toLocaleString("sv-SE", { timeZone: "America/New_York" }).slice(0, 16);
const plain = (v: any): string => {
  if (!v) return "";
  switch (v.type) {
    case "title": case "rich_text": return (v[v.type] || []).map((t: any) => t.plain_text).join("");
    case "select": return v.select?.name || ""; case "status": return v.status?.name || "";
    case "multi_select": return (v.multi_select || []).map((x: any) => x.name).join(" ");
    case "number": return v.number == null ? "" : String(v.number);
    case "formula": { const f = v.formula || {}; return f.type === "number" ? (f.number == null ? "" : String(f.number)) : f.type === "string" ? (f.string || "") : f.type === "date" ? (f.date?.start || "") : ""; }
    case "rollup": { const r = v.rollup || {}; return r.type === "number" ? String(r.number ?? "") : ""; }
    case "date": return v.date?.start || "";
    default: return "";
  }
};
const num = (s: string) => { const m = String(s).replace(/[,$\s]/g, "").match(/-?\d+(\.\d+)?/); return m ? +m[0] : null; };
const SYMS = /\b(M?NQ|M?ES|M?YM|M?RTY|M?GC|M?CL|NQ1!|ES1!)\b/i;
// map one Notion page from the user's journal to a plain trade (guessing property names the way people actually name them)
function mapRow(pg: any) {
  const P = pg.properties || {}; const names = Object.keys(P); const find = (re: RegExp, types?: string[]) => names.find((k) => re.test(k) && (!types || types.includes(P[k].type)));
  const dateK = find(/date|day|entry ?time|opened|time/i, ["date"]) || names.find((k) => P[k].type === "date");
  const created = pg.created_time;
  const all = names.map((k) => plain(P[k])).join(" ");
  const symK = find(/symbol|ticker|instrument|market|contract|asset/i); let sym = symK ? plain(P[symK]) : "";
  if (!SYMS.test(sym)) { const m = all.match(SYMS); sym = m ? m[1] : sym; }
  const sideK = find(/side|direction|long.?short|position|type|bias/i); const sd = (sideK ? plain(P[sideK]) : all).toLowerCase();
  const side = /\b(long|buy|bull)/.test(sd) ? 1 : /\b(short|sell|bear)/.test(sd) ? -1 : 0;
  const g = (re: RegExp) => { const k = find(re); return k ? num(plain(P[k])) : null; };
  const timeK = find(/entry ?time|time in|^time$|open time/i, ["rich_text", "title", "select"]);
  return { id: pg.id, url: pg.url, title: title(pg), date: dateK ? (P[dateK].date?.start || "") : "", created, time: timeK ? plain(P[timeK]) : "",
    symbol: (sym || "").toUpperCase().replace("1!", ""), side, entry: g(/^entry|entry ?price|^in$|fill|avg ?entry/i), exit: g(/^exit|exit ?price|^out$|avg ?exit/i),
    pnl: g(/p ?& ?l|pnl|profit|result \$|net|\$ ?result|gain/i), r: g(/\br\b|r ?multiple|^rr$|r:r/i), qty: g(/qty|quantity|contracts|size|lots/i) };
}


// KING_JOURNAL (Nov 18): full-fidelity journal import (every property, typed) + push KAIROS live entries back into the same database
const typed = (v: any): any => {
  if (!v) return null;
  switch (v.type) {
    case "title": case "rich_text": return (v[v.type] || []).map((t: any) => t.plain_text).join("");
    case "number": return v.number; case "checkbox": return !!v.checkbox;
    case "select": return v.select?.name || null; case "status": return v.status?.name || null;
    case "multi_select": return (v.multi_select || []).map((x: any) => x.name);
    case "date": return v.date?.start || null; case "url": return v.url; case "email": return v.email; case "phone_number": return v.phone_number;
    case "files": return (v.files || []).map((f: any) => ({ name: f.name, url: f.file?.url || f.external?.url, ext: !!f.external }));
    case "relation": return (v.relation || []).map((r: any) => r.id);
    case "people": return (v.people || []).map((p: any) => p.name || p.id);
    case "formula": { const f = v.formula || {}; return f.type === "date" ? (f.date?.start || null) : f[f.type] ?? null; }
    case "rollup": { const r = v.rollup || {}; return r.type === "number" ? r.number : r.type === "array" ? (r.array || []).map(typed) : null; }
    case "created_time": return v.created_time; case "last_edited_time": return v.last_edited_time;
    default: return null;
  }
};
async function dsOf(token: string, dbId: string) {   // properties + a query path that works on old and new Notion databases
  try { const db = await notion(token, `databases/${dbId}`); if (db.properties && Object.keys(db.properties).length) return { props: db.properties, title: title(db), q: (b: any) => notion(token, `databases/${dbId}/query`, "POST", b) }; } catch (_) { /* new API below */ }
  const db = await notion2(token, `databases/${dbId}`); const ds = db?.data_sources?.[0]?.id; if (!ds) throw new Error("Couldn't open that database");
  const d = await notion2(token, `data_sources/${ds}`); return { props: d.properties || {}, title: title(db), q: (b: any) => notion2(token, `data_sources/${ds}/query`, "POST", b) };
}
const schemaOf = (props: any) => Object.fromEntries(Object.entries(props).map(([k, v]: any) => [k, { type: v.type, options: (v[v.type]?.options || []).map((o: any) => ({ name: o.name, color: o.color })) }]));
async function copyFiles(uid: string, pageId: string, key: string, files: any[]) {   // Notion file links expire after an hour: keep our own copy
  const out: any[] = [];
  for (let i = 0; i < files.length && i < 12; i++) { const f = files[i]; if (!f?.url) continue;
    if (f.ext) { out.push({ name: f.name, url: f.url }); continue; }
    try { const r = await fetch(f.url); if (!r.ok) continue; const b = new Uint8Array(await r.arrayBuffer()); if (b.length > 8e6) continue;
      const ext = (f.name.match(/\.(\w{2,5})$/) || [, "png"])[1].toLowerCase(); const path = `${uid}/notion/${pageId}/${key.replace(/[^\w]/g, "_")}-${i}.${ext}`;
      await SB.storage.from("journal").upload(path, b, { upsert: true, contentType: r.headers.get("content-type") || "image/" + ext }); out.push({ name: f.name, path });
    } catch (_) { /* skip one bad file */ } }
  return out;
}
const toProp = (type: string, v: any) => {   // KAIROS value -> Notion property value (only the types a person types into)
  const rt = (s: any) => [{ text: { content: String(s ?? "").slice(0, 1990) } }];
  switch (type) {
    case "title": return { title: rt(v || "Trade") }; case "rich_text": return { rich_text: rt(v) };
    case "number": return { number: v === "" || v == null || isNaN(+v) ? null : +v };
    case "select": return { select: v ? { name: String(v) } : null }; case "status": return v ? { status: { name: String(v) } } : undefined;
    case "multi_select": return { multi_select: (Array.isArray(v) ? v : []).map((n: string) => ({ name: n })) };
    case "date": return { date: v ? { start: v } : null }; case "url": return { url: v || null }; case "checkbox": return { checkbox: !!v };
    default: return undefined;
  }
};

async function syncTrades(uid: string, link: any, ids?: string[]) {
  let q = SB.from("trades").select("*").eq("user_id", uid).is("notion_page", null).order("t_exit").limit(50);
  if (ids && ids.length) q = q.in("id", ids);
  const { data: trades } = await q; let n = 0;
  for (const t of trades || []) {
    const page = await notion(link.token, "pages", "POST", { parent: { database_id: link.db_id }, properties: {
      Trade: { title: [{ text: { content: `${t.symbol} ${t.dir > 0 ? "Long" : "Short"} ${t.qty} · ${fmtNY(t.t_entry)}` } }] },
      Date: { date: { start: new Date(t.t_entry * 1000).toISOString() } }, Symbol: { select: { name: t.symbol } }, Side: { select: { name: t.dir > 0 ? "Long" : "Short" } },
      Qty: { number: +t.qty }, Entry: { number: +t.entry }, Exit: { number: t.exit == null ? null : +t.exit }, Stop: { number: t.stop == null ? null : +t.stop }, Target: { number: t.target == null ? null : +t.target },
      R: { number: t.r == null ? null : +t.r }, "P&L": { number: +t.pnl }, Fees: { number: +t.fees || 0 }, Outcome: { select: { name: t.outcome || "manual" } },
      Notes: { rich_text: [{ text: { content: (t.notes || "").slice(0, 1900) } }] }, Source: { select: { name: "KAIROS backtest" } } } });
    await SB.from("trades").update({ notion_page: page.id }).eq("id", t.id); n++;
  }
  return n;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const jwt = (req.headers.get("authorization") || "").replace("Bearer ", "");
    const { data: { user } } = await SB.auth.getUser(jwt); if (!user) return J({ error: "sign in first" }, 401);
    const { data: mem } = await SB.from("allowlist").select("email").ilike("email", user.email || "").maybeSingle(); if (!mem) return J({ error: "not on the invite list" }, 403);
    const body = await req.json().catch(() => ({})); const act = body.action;
    const { data: link } = await SB.from("notion_links").select("*").eq("user_id", user.id).maybeSingle();
    if (act === "status") return J({ connected: !!link, workspace: link?.workspace, db_url: link?.db_url, db: !!link?.db_id, auto_sync: link?.auto_sync ?? true,
      oauth: !!Deno.env.get("NOTION_CLIENT_ID"), source: link?.source_db_id || null, source_title: link?.source_title || null, journal: link?.journal_db_id || null, journal_title: link?.journal_title || null });
    if (act === "oauth_url") {
      const cid = Deno.env.get("NOTION_CLIENT_ID"); if (!cid) return J({ error: "Notion login isn't set up yet, use the token option" }, 400);
      const state = crypto.randomUUID(); await SB.from("notion_oauth_states").insert({ state, user_id: user.id });
      const redirect = Deno.env.get("SUPABASE_URL") + "/functions/v1/notion-oauth";
      return J({ url: `https://api.notion.com/v1/oauth/authorize?client_id=${cid}&response_type=code&owner=user&redirect_uri=${encodeURIComponent(redirect)}&state=${state}` });
    }
    if (act === "save_token") {
      const tok = String(body.token || "").trim(); if (!/^(secret_|ntn_)/.test(tok)) return J({ error: "That doesn't look like a Notion integration token (starts with ntn_ or secret_)" }, 400);
      const me = await notion(tok, "users/me");
      await SB.from("notion_links").upsert({ user_id: user.id, token: tok, workspace: me?.bot?.workspace_name || me?.name || "Notion", bot_id: me?.id, updated_at: new Date().toISOString() });
      return J({ ok: true });
    }
    if (!link) return J({ error: "Connect Notion first" }, 400);
    if (act === "pages") {
      const r = await notion(link.token, "search", "POST", { filter: { property: "object", value: "page" }, page_size: 50 });
      return J({ pages: (r.results || []).filter((p: any) => p.parent?.type !== "database_id").map((p: any) => ({ id: p.id, title: title(p) })) });
    }
    if (act === "dbs") {   // databases the user shared, minus KAIROS's own backtest database (never import our own writes)
      const r = await notion(link.token, "search", "POST", { filter: { property: "object", value: "database" }, page_size: 100 });
      const own = (link.db_id || "").replace(/-/g, "");
      const list = (r.results || []).map((d: any) => ({ id: d.id, title: title(d) }));
      try {   // newer databases only show up as data sources on the 2025-09-03 API; list them by their parent database
        const r2 = await notion2(link.token, "search", "POST", { filter: { property: "object", value: "data_source" }, page_size: 100 });
        for (const d of r2.results || []) { const pid = d.parent?.database_id || d.database_parent?.database_id; if (pid && !list.some((x: any) => x.id.replace(/-/g, "") === pid.replace(/-/g, ""))) list.push({ id: pid, title: title(d) }); }
      } catch (_) { /* older workspaces: the first list is enough */ }
      return J({ dbs: list.filter((d: any) => d.id.replace(/-/g, "") !== own) });
    }
    if (act === "jschema") { const d = await dsOf(link.token, String(body.db_id)); return J({ ok: true, title: d.title, schema: schemaOf(d.props) }); }
    if (act === "jimport") {   // one page (100 rows) per call; the app loops with next_cursor so big journals never time out
      const d = await dsOf(link.token, String(body.db_id)); const r = await d.q({ page_size: 100, start_cursor: body.cursor || undefined, sorts: [{ timestamp: "created_time", direction: "ascending" }], ...(body.since ? { filter: { timestamp: "last_edited_time", last_edited_time: { on_or_after: String(body.since) } } } : {}) });   // since: only pages changed after the last pull (two-way sync)
      const relT: Record<string, string> = {}; const rows: any[] = [];
      for (const pg of r.results || []) { const props: any = {};
        for (const [k, v] of Object.entries(pg.properties || {}) as any) {
          let val = typed(v);
          if (v.type === "files" && val?.length) val = await copyFiles(user.id, pg.id, k, val);
          if (v.type === "relation" && val?.length) { val = await Promise.all(val.slice(0, 5).map(async (id: string) => { if (!(id in relT)) { try { relT[id] = title(await notion(link.token, "pages/" + id)); } catch (_) { relT[id] = ""; } } return { id, title: relT[id] }; })); }
          props[k] = val; }
        rows.push({ id: pg.id, url: pg.url, created: pg.created_time, edited: pg.last_edited_time, cover: pg.cover?.file?.url || pg.cover?.external?.url || null, props }); }
      return J({ ok: true, rows, next_cursor: r.has_more ? r.next_cursor : null, schema: body.cursor ? undefined : schemaOf(d.props) });
    }
    if (act === "jpush") {   // create or update one page in the user's chosen journal database; only properties that already exist there
      const d = await dsOf(link.token, String(body.db_id)); const props: any = {}; const vals = body.values || {};
      for (const [k, v] of Object.entries(vals)) { const sp = d.props[k]; if (!sp) continue; const pv = sp.type === "date" && typeof v === "string" && v.includes("T") && !/[zZ]|[+-]\d\d:?\d\d$/.test(v) ? { date: { start: v, time_zone: String(body.tz || "America/New_York") } } : toProp(sp.type, v); if (pv !== undefined) props[k] = pv; }
      const page = body.page_id ? await notion(link.token, "pages/" + body.page_id, "PATCH", { properties: props })
        : await notion(link.token, "pages", "POST", { parent: { database_id: String(body.db_id) }, properties: props });
      return J({ ok: true, page_id: page.id, url: page.url });
    }
    if (act === "jset") { await SB.from("notion_links").update({ journal_db_id: body.db_id || null, journal_title: body.title || null, updated_at: new Date().toISOString() }).eq("user_id", user.id); return J({ ok: true }); }
    if (act === "set_source") {
      const id = String(body.db_id || ""); if (id && id.replace(/-/g, "") === (link.db_id || "").replace(/-/g, "")) return J({ error: "That's the KAIROS backtest database. Pick your real-trade journal." }, 400);
      await SB.from("notion_links").update({ source_db_id: id || null, source_title: body.title || null, updated_at: new Date().toISOString() }).eq("user_id", user.id);
      return J({ ok: true });
    }
    if (act === "import") {   // read-only: never writes to the user's journal
      if (!link.source_db_id) return J({ error: "Pick your trade journal first" }, 400);
      const out: any[] = []; let cursor: string | undefined; let dsid: string | undefined;
      for (let i = 0; i < 10; i++) {
        const q = { page_size: 100, start_cursor: cursor, sorts: [{ timestamp: "created_time", direction: "descending" }] };
        let r: any;
        try { r = await notion(link.token, `databases/${link.source_db_id}/query`, "POST", q); }
        catch (e) {   // newer multi-source databases (Notion API 2025-09-03): query the first data source instead
          if (!dsid) { const db = await notion2(link.token, `databases/${link.source_db_id}`); dsid = db?.data_sources?.[0]?.id; if (!dsid) throw e; }
          r = await notion2(link.token, `data_sources/${dsid}/query`, "POST", q);
        }
        for (const pg of r.results || []) out.push(mapRow(pg));
        if (!r.has_more) break; cursor = r.next_cursor;
      }
      return J({ ok: true, trades: out });
    }
    if (act === "setup") {
      const db = await notion(link.token, "databases", "POST", { parent: { type: "page_id", page_id: body.page_id }, title: [{ text: { content: "KAIROS Backtesting Trades" } }], properties: {
        Trade: { title: {} }, Date: { date: {} }, Symbol: { select: {} }, Side: { select: { options: [{ name: "Long", color: "green" }, { name: "Short", color: "red" }] } }, Qty: { number: {} },
        Entry: { number: {} }, Exit: { number: {} }, Stop: { number: {} }, Target: { number: {} }, R: { number: {} }, "P&L": { number: { format: "dollar" } }, Fees: { number: { format: "dollar" } },
        Outcome: { select: {} }, Notes: { rich_text: {} }, Source: { select: {} } } });
      await SB.from("notion_links").update({ db_id: db.id, db_url: db.url, updated_at: new Date().toISOString() }).eq("user_id", user.id);
      return J({ ok: true, db_url: db.url });
    }
    if (act === "sync") { if (!link.db_id) return J({ error: "Pick a page for the backtest database first" }, 400); return J({ ok: true, synced: await syncTrades(user.id, link, body.ids) }); }
    if (act === "auto") { await SB.from("notion_links").update({ auto_sync: !!body.on }).eq("user_id", user.id); return J({ ok: true }); }
    if (act === "disconnect") { await SB.from("notion_links").delete().eq("user_id", user.id); return J({ ok: true }); }
    return J({ error: "unknown action" }, 400);
  } catch (e) { return J({ error: String((e as Error).message || e) }, 500); }
});
