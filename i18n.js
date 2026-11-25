/* KING_SWEDISH (King, Nov 24, for Will): KAIROS in Swedish. The whole interface is translated from a word list (i18n/sv.json) as it
   appears on screen: labels, buttons, menus, tips, placeholders, toasts. What people type (chat, notes, journal) is never touched.
   Settings → General → Language picks English or Svenska; ?lang=sv / ?lang=en work too (used by the side-by-side preview). */
(function () {
  const qs = new URLSearchParams(location.search), qLang = qs.get("lang");
  const want = () => qLang || (window.prefs && prefs.lang) || "en";
  const SKIP = "script,style,textarea,input,code,pre,[contenteditable],.nfx,.cn,.podn,.frpt b,.sch b,.cb,.nbody,.noteorig,.jn-body,.ntext,.fpcap,.vntx p,.knoic,.ktxed,.lk .tiny#lk-info";
  let D = null, on = false, obs = null; const orig = new WeakMap(), oAttr = new WeakMap();
  const num = (s) => s.replace(/[-+−]?\$?\d[\d,]*(?:\.\d+)?%?/g, "#");
  let P = null;   // number-free lookup: "Loading 12 candles" -> "Loading # candles"
  function tr(s) { if (!D) return null; const k = s.trim(); if (!k || !/[A-Za-z]{2}/.test(k)) return null; let v = D[k]; if (v) return s.replace(k, v);
    const nk = num(k); if (nk !== k && P[nk]) { const ns = k.match(/[-+−]?\$?\d[\d,]*(?:\.\d+)?%?/g) || []; let i = 0; return s.replace(k, P[nk].replace(/#/g, () => ns[i++] ?? "#")); } return null; }
  function walk(root) { if (!on || !root) return; if (root.nodeType === 3) return node(root); if (root.nodeType !== 1 || root.closest && root.closest(SKIP)) return;
    const it = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, { acceptNode: (n) => (n.nodeType === 1 ? (n.matches(SKIP) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_SKIP) : NodeFilter.FILTER_ACCEPT) });
    let n; const list = []; while ((n = it.nextNode())) list.push(n); list.forEach(node); if (root.querySelectorAll) [root, ...root.querySelectorAll("[placeholder],[title],[aria-label],[data-tip]")].forEach(attrs); }
  function node(n) { const p = n.parentElement; if (!p || p.closest(SKIP)) return; const v = tr(n.nodeValue); if (v != null && v !== n.nodeValue) { if (!orig.has(n)) orig.set(n, n.nodeValue); n.nodeValue = v; } }
  function attrs(el) { if (!el.getAttribute || el.closest(SKIP + ",.knoic")) return; for (const a of ["placeholder", "title", "aria-label", "data-tip"]) { const s = el.getAttribute(a); if (!s) continue; const v = tr(s); if (v != null && v !== s) { const o = oAttr.get(el) || {}; if (!(a in o)) o[a] = s; oAttr.set(el, o); el.setAttribute(a, v); } } }
  async function load() { if (D) return D; try { const sv0 = (document.querySelector("script[src*=\"i18n.js\"]") || {}).src || "", r = await fetch("i18n/sv.json?v=" + ((sv0.split("v=")[1]) || Date.now())); D = await r.json(); } catch (e) { D = {}; } window.__svD = D; P = {}; for (const [k, v] of Object.entries(D)) { const nk = num(k); if (nk !== k) P[nk] = num(v); } return D; }
  async function apply() { const sv = want() === "sv"; document.documentElement.lang = sv ? "sv" : "en";
    if (sv) { await load(); on = true; walk(document.body); if (!obs) { obs = new MutationObserver((ms) => { if (!on) return; for (const m of ms) { if (m.type === "characterData") node(m.target); else if (m.type === "attributes") attrs(m.target); else m.addedNodes.forEach(walk); } }); obs.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["placeholder", "title", "aria-label", "data-tip"] }); } }
    else if (on) { on = false; location.reload(); } }
  window.kLang = { apply, set: (l) => { if (window.prefs) { prefs.lang = l; try { savePrefs(); } catch (e) {} } apply(); }, t: (s) => (on && tr(s)) || s };
  if (document.readyState === "loading") addEventListener("DOMContentLoaded", () => setTimeout(apply, 50)); else setTimeout(apply, 50);
  // toasts are often set before the observer sees them: route them through the dictionary too
  const wrapToast = () => { if (typeof window.toast !== "function" || window.toast.__k) return; const t0 = window.toast; window.toast = function (m, ...a) { return t0.call(this, typeof m === "string" ? kLang.t(m) : m, ...a); }; window.toast.__k = 1; };
  setTimeout(wrapToast, 0);
})();
