/* KING_TOOLBAR2 (King, Nov 24): the drawing toolbar.
   - No little triangles: double-click a tool to open its other tools (hover says "Double-click to select more").
   - Right-click a tool: a star to add/remove it from favorites, and "Float the bar" / "Dock the bar".
   - The grip shows a pop-out icon while docked and a three-line icon while floating (click it to switch).
   - Drag the bar from anywhere, tools included: a click that stays still selects the tool, a click that moves drags the bar. */
(function () {
  const $ = (id) => document.getElementById(id), T = $("tools"), G = $("toolgrip"); if (!T || !G) return;
  const POP = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6M20 4l-8 8"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>';
  const BARS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M5 7h14M5 12h14M5 17h14"/></svg>';
  const STAR = (on) => `<svg class="mstar" viewBox="0 0 24 24" fill="${on ? "currentColor" : "none"}" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.8z"/></svg>`;
  function gripUI() { const fl = !!prefs.toolsPos; G.innerHTML = fl ? BARS : POP; G.title = fl ? "Dock the bar" : "Float the bar"; G.setAttribute("aria-label", G.title); G.classList.add("tgrip2"); }
  const base = window.toolsUI; window.toolsUI = function () { const r = base.apply(this, arguments); try { gripUI(); } catch (e) {} return r; }; gripUI();
  G.addEventListener("click", (e) => { if (G._moved) { G._moved = false; return; } prefs.toolsPos = prefs.toolsPos ? null : { x: Math.max(8, T.getBoundingClientRect().left + 60), y: Math.max(70, T.getBoundingClientRect().top + 20) }; savePrefs(); toolsUI(); });
  G.addEventListener("pointerdown", () => { G._moved = false; }); G.addEventListener("pointermove", (e) => { if (e.buttons) G._moved = true; });
  // hover text + double-click for more
  const label = () => T.querySelectorAll(".tg").forEach((g) => { const m = g.querySelector(".tgm"); if (!m || !g.querySelector(".tfly")) return; const base0 = (m.title || "").split(" · Double-click")[0]; m.title = base0 + " · Double-click to select more"; });
  label(); new MutationObserver(label).observe(T, { subtree: true, attributes: true, attributeFilter: ["data-tool"] });
  T.addEventListener("dblclick", (e) => { const m = e.target.closest(".tgm"), g = m && m.closest(".tg"); if (!g || !g.querySelector(".tfly")) return; e.preventDefault(); e.stopPropagation(); tgOpen(g.dataset.g); }, true);
  // right-click: star + float/dock only
  document.addEventListener("contextmenu", (e) => { if (!e.target.closest("#tools") || e.target.closest(".tfly")) return; e.preventDefault(); e.stopImmediatePropagation();
    const b = e.target.closest("[data-tool]"), items = [];
    if (b) { const t = b.dataset.tool, on = (prefs.favs || []).includes(t); items.push({ t: STAR(on) + `<span class="srh">${on ? "Remove from" : "Add to"} favorites</span>`, c: "mistar" + (on ? " on" : ""), f: () => { prefs.favs = on ? prefs.favs.filter((x) => x !== t) : [...(prefs.favs || []), t]; prefs.favShow = true; savePrefs(); favUI(); toast(on ? "Removed from favorites" : "Added to favorites"); } }); }
    items.push({ t: prefs.toolsPos ? "Dock the bar" : "Float the bar", f: () => { prefs.toolsPos = prefs.toolsPos ? null : { x: e.clientX + 12, y: Math.max(70, e.clientY - 40) }; savePrefs(); toolsUI(); } });
    menu(items, e.clientX, e.clientY); }, true);
  // drag from anywhere: still click = select, moving click = drag the bar (docked bars pop out when dragged)
  let D = null;
  T.addEventListener("pointerdown", (e) => { if (e.button !== 0 || e.target.closest(".tfly") || e.target === G || G.contains(e.target)) return; D = { x: e.clientX, y: e.clientY, id: e.pointerId, on: false }; }, true);
  addEventListener("pointermove", (e) => { if (!D || e.pointerId !== D.id) return; const dx = e.clientX - D.x, dy = e.clientY - D.y;
    if (!D.on) { if (Math.hypot(dx, dy) < 6) return; D.on = true; if (!prefs.toolsPos) { const r = T.getBoundingClientRect(); prefs.toolsPos = { x: r.left + dx, y: r.top + dy }; toolsUI(); } D.r = T.getBoundingClientRect(); document.body.classList.add("tdragging"); try { T.setPointerCapture(D.id); } catch (er) {} }
    T.style.left = Math.max(0, Math.min(innerWidth - 50, D.r.left + dx)) + "px"; T.style.top = Math.max(0, Math.min(innerHeight - 100, D.r.top + dy)) + "px"; e.preventDefault(); }, true);
  const end = (e) => { if (!D || e.pointerId !== D.id) return; const was = D.on; D = null; document.body.classList.remove("tdragging"); if (!was) return;
    const r = T.getBoundingClientRect(); prefs.toolsPos = { x: Math.round(r.left), y: Math.round(r.top) }; savePrefs(); const swallow = (ev) => { ev.stopPropagation(); ev.preventDefault(); removeEventListener("click", swallow, true); }; addEventListener("click", swallow, true); setTimeout(() => removeEventListener("click", swallow, true), 50); };
  addEventListener("pointerup", end, true); addEventListener("pointercancel", end, true);
})();
