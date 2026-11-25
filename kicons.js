/* KING_NOEMOJI (King, Nov 24: "no more emojis. ever. period. remove each one and make its own icon"):
   every emoji in KAIROS becomes a drawn line icon in the KAIROS look. kIcon(name) returns the SVG; a light pass swaps any emoji that
   reaches the page (labels, toasts, menus, buttons) for its icon, strips them from <option>s and tooltips, and leaves what people type
   in chat, notes and journal text alone. */
(function () {
  const P = {
    lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    bulb: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.3 1 2.2h5.2c0-.9.4-1.7 1-2.2A6 6 0 0 0 12 3z"/>',
    wrench: '<path d="M14.7 6.3a4 4 0 0 0-5.3 5.3L3 18l3 3 6.4-6.4a4 4 0 0 0 5.3-5.3l-2.6 2.6-2.4-.6-.6-2.4z"/>',
    check: '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.7 2.7L16.5 9.5"/>',
    bell: '<path d="M6 17V11a6 6 0 0 1 12 0v6l1.5 2h-15z"/><path d="M10 21h4"/>',
    swords: '<path d="M4 4l9 9M4 4h4M4 4v4M20 4l-9 9M20 4h-4M20 4v4"/><path d="M7 14l3 3-2 2-3-3zM17 14l-3 3 2 2 3-3z"/>',
    volume: '<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/>',
    mute: '<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M17 9l5 6M22 9l-5 6"/>',
    cash: '<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.6"/><path d="M6 9.5v5M18 9.5v5"/>',
    dice: '<rect x="4" y="4" width="16" height="16" rx="3"/><circle cx="9" cy="9" r="1" fill="currentColor"/><circle cx="15" cy="15" r="1" fill="currentColor"/><circle cx="15" cy="9" r="1" fill="currentColor"/><circle cx="9" cy="15" r="1" fill="currentColor"/>',
    clipboard: '<rect x="6" y="4" width="12" height="17" rx="2"/><path d="M9 4h6v3H9zM9 12h6M9 16h4"/>',
    music: '<path d="M9 18V5l11-2v13"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>',
    ghost: '<path d="M6 20V10a6 6 0 0 1 12 0v10l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5z"/><circle cx="10" cy="10" r=".9" fill="currentColor"/><circle cx="14" cy="10" r=".9" fill="currentColor"/>',
    calendar: '<rect x="4" y="5" width="16" height="16" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>',
    pause: '<path d="M9 6v12M15 6v12"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/>',
    flame: '<path d="M12 21a6 6 0 0 0 6-6c0-3-2-5-3-7-1 2-2 3-3 3 0-3-1-5-3-8-1 4-3 6-3 12a6 6 0 0 0 6 6z"/>',
    scissors: '<circle cx="6" cy="7" r="2.5"/><circle cx="6" cy="17" r="2.5"/><path d="M8 8.5L20 18M8 15.5L20 6"/>',
    back: '<path d="M18 6l-8 6 8 6zM6 6v12"/>',
    next: '<path d="M6 6l8 6-8 6zM18 6v12"/>',
    fwd: '<path d="M4 6l7 6-7 6zM12 6l7 6-7 6z"/>',
    rew: '<path d="M20 6l-7 6 7 6zM12 6l-7 6 7 6z"/>',
    playpause: '<path d="M4 6l7 6-7 6zM15 6v12M19 6v12"/>',
    brain: '<path d="M9 4a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 2 5 3 3 0 0 0 6 1V5a2 2 0 0 0-3-1zM15 4a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-2 5 3 3 0 0 1-6 1"/>',
    camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
    bolt: '<path d="M13 2L5 14h6l-1 8 8-12h-6z"/>',
    aplus: '<rect x="3" y="4" width="18" height="16" rx="4"/><path d="M7 16l2.5-8 2.5 8M8 13.5h3M16 10v4M14 12h4"/>',
    download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
    eye: '<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z"/><circle cx="12" cy="12" r="2.8"/>',
    trophy: '<path d="M8 4h8v6a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 14v4M8 21h8"/>',
    hourglass: '<path d="M7 3h10M7 21h10M8 3c0 5 8 5 8 9s-8 4-8 9M16 3c0 5-8 5-8 9s8 4 8 9"/>',
    rocket: '<path d="M12 3c3 2 5 6 5 10l-2 3H9l-2-3c0-4 2-8 5-10z"/><circle cx="12" cy="10" r="1.8"/><path d="M9 16l-2 4 3-1.5M15 16l2 4-3-1.5"/>',
    party: '<path d="M4 20l5-13 8 8z"/><path d="M14 4v2M18 7l1.5-1.5M20 11h-2M15 9l3-3"/>',
    palette: '<path d="M12 3a9 9 0 1 0 0 18c1 0 1.5-.7 1.5-1.5 0-1.5-1.5-1.5-1.5-3 0-1 .8-1.5 2-1.5h3a4 4 0 0 0 4-4c0-4.5-4-8-9-8z"/><circle cx="7.5" cy="11" r="1" fill="currentColor"/><circle cx="10" cy="7" r="1" fill="currentColor"/><circle cx="15" cy="7" r="1" fill="currentColor"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>',
    wind: '<path d="M3 8h11a3 3 0 1 0-3-3M3 12h15a3 3 0 1 1-3 3M3 16h7"/>',
    swirl: '<path d="M6 19h12a3 3 0 0 0 0-6h-1a3 3 0 0 0 0-6h-1a2.5 2.5 0 0 0-4-2c1 1 1 2 0 2a3 3 0 0 0 0 6H9a3 3 0 0 0-3 6z"/>',
    sparkles: '<path d="M10 3l1.8 5.2L17 10l-5.2 1.8L10 17l-1.8-5.2L3 10l5.2-1.8z"/><path d="M18 14l.8 2.2L21 17l-2.2.8L18 20l-.8-2.2L15 17l2.2-.8z"/>',
    calm: '<circle cx="12" cy="5" r="2"/><path d="M12 8v5M5 19c2-1 4-2 7-2s5 1 7 2M8 13l4 2 4-2"/>',
    headphones: '<path d="M4 15v-3a8 8 0 0 1 16 0v3"/><rect x="3" y="14" width="4" height="7" rx="1.5"/><rect x="17" y="14" width="4" height="7" rx="1.5"/>',
    medal1: '<path d="M8 3l4 6 4-6" /><circle cx="12" cy="15" r="6" fill="#d4a017" stroke="#9a7410"/><path d="M12 12v6" stroke="#fff"/>',
    medal2: '<path d="M8 3l4 6 4-6"/><circle cx="12" cy="15" r="6" fill="#c0c6cc" stroke="#8a9096"/><path d="M10 13h4l-4 5h4" stroke="#fff"/>',
    medal3: '<path d="M8 3l4 6 4-6"/><circle cx="12" cy="15" r="6" fill="#b87333" stroke="#7d4c20"/><path d="M10 13h4l-2 2.2 2 2.8h-4" stroke="#fff"/>',
    medal: '<path d="M8 3l4 6 4-6"/><circle cx="12" cy="15" r="6"/><path d="M12 12l.9 2 2.1.2-1.6 1.4.5 2.1-1.9-1.1-1.9 1.1.5-2.1-1.6-1.4 2.1-.2z" fill="currentColor"/>',
    send: '<path d="M21 3L10 14M21 3l-7 18-4-7-7-4z"/>',
    hammer: '<path d="M14 6l4 4M3 21l9-9M12 4l3-1 6 6-1 3-3-1-6-6z"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    xcircle: '<circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/>',
    mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
    clip: '<path d="M20 11l-8.5 8.5a5 5 0 0 1-7-7L13 4a3.5 3.5 0 0 1 5 5l-8.5 8.5a2 2 0 0 1-3-3L14 7"/>',
    image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 17l-5-5-9 8"/>',
    warn: '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18h.01"/>',
    shuffle: '<path d="M3 6h4l10 12h4M3 18h4l3-3.6M14 9.6L17 6h4M18 3l3 3-3 3M18 15l3 3-3 3"/>',
    notebook: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 3v18M12 8h4M12 12h4"/>',
    books: '<path d="M4 4h4v16H4zM10 4h4v16h-4zM15.5 5l3.8-1 3 15.5-3.8 1z"/>',
    peach: '<path d="M12 7c-4 0-7 3-7 7a7 7 0 0 0 14 0c0-4-3-7-7-7z"/><path d="M12 7c0 4 0 8 0 13M12 7c1-3 3-4 6-4-1 2-3 4-6 4z"/>',
    horns: '<path d="M7 9c-3-1-4-4-3-6 2 1 4 2 5 4M17 9c3-1 4-4 3-6-2 1-4 2-5 4"/><path d="M7 9a5 5 0 0 1 10 0v4a5 5 0 0 1-10 0z"/><circle cx="10" cy="11" r=".8" fill="currentColor"/><circle cx="14" cy="11" r=".8" fill="currentColor"/>',
    crown: '<path d="M3 8l4 4 5-7 5 7 4-4-2 11H5z"/>',
    moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
    drop: '<path d="M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11z"/>',
    chat: '<path d="M4 5h16v11H9l-5 4z"/>',
    chartup: '<path d="M3 20h18M5 16l5-5 3 3 6-7M14 7h5v5"/>',
    keyboard: '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.2-4 4.5-6 8-6s6.8 2 8 6"/>',
    link: '<path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1"/>',
    shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>',
    key: '<circle cx="8" cy="14" r="4"/><path d="M11 11l9-9M17 5l3 3M15 7l2 2"/>',
    hundred: '<path d="M4 8l2-1v10M10 7h3v10h-3zM16 7h3v10h-3z"/><path d="M3 20h18"/>',
    bow: '<path d="M5 3c8 3 13 8 16 16M5 3l-1 6M5 3l6-1M3 21l12-12M15 9l3-1-1 3"/>',
    bank: '<path d="M3 10l9-6 9 6M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 21h18"/>',
    steam: '<circle cx="12" cy="13" r="7"/><path d="M9 12h.01M15 12h.01M9.5 16h5M5 6c1 1 1 2 0 3M19 6c-1 1-1 2 0 3"/>',
    sparkle: '<path d="M12 3l2.2 6.8L21 12l-6.8 2.2L12 21l-2.2-6.8L3 12l6.8-2.2z" fill="currentColor" stroke="none"/>',
    flower: '<circle cx="12" cy="12" r="2.4"/><path d="M12 9.6a3 3 0 1 1 0-6 3 3 0 1 1 0 6M14.4 12a3 3 0 1 1 6 0 3 3 0 1 1-6 0M12 14.4a3 3 0 1 1 0 6 3 3 0 1 1 0-6M9.6 12a3 3 0 1 1-6 0 3 3 0 1 1 6 0"/>',
    dot: '<circle cx="12" cy="12" r="5" fill="currentColor"/>',
    dotyellow: '<circle cx="12" cy="12" r="6" fill="#f5c518" stroke="none"/>',
    dotwhite: '<circle cx="12" cy="12" r="6" fill="#fff" stroke="#9aa0a6"/>',
    sqgreen: '<rect x="5" y="5" width="14" height="14" rx="3" fill="#2bd4a0" stroke="none"/>',
    party2: '<path d="M4 20l5-13 8 8z"/><circle cx="17" cy="5" r="1" fill="currentColor"/><circle cx="20" cy="9" r="1" fill="currentColor"/>',
  };
  const MAP = { "🔒": "lock", "💡": "bulb", "🔧": "wrench", "✅": "check", "🔔": "bell", "⚔": "swords", "🔊": "volume", "🔇": "mute", "💸": "cash", "💰": "cash", "💵": "cash", "🎲": "dice", "🎰": "dice", "📋": "clipboard", "🎵": "music", "🎶": "music", "♪": "music", "👻": "ghost", "📅": "calendar", "📆": "calendar", "⏸": "pause", "🎯": "target", "🔥": "flame", "✂": "scissors", "⏮": "back", "⏭": "next", "⏩": "fwd", "⏪": "rew", "⏯": "playpause", "🧠": "brain", "📷": "camera", "📸": "camera", "⚡": "bolt", "🅰": "aplus", "⬇": "download", "👀": "eye", "🏆": "trophy", "⏳": "hourglass", "⌛": "hourglass", "🚀": "rocket", "🎉": "party", "🥳": "party2", "🎨": "palette", "⚙": "gear", "💨": "wind", "💩": "swirl", "✨": "sparkles", "🧘": "calm", "🎧": "headphones", "🥇": "medal1", "🥈": "medal2", "🥉": "medal3", "🏅": "medal", "📨": "send", "📩": "send", "🔨": "hammer", "✖": "x", "❌": "xcircle", "🎙": "mic", "🎤": "mic", "📎": "clip", "🖼": "image", "⚠": "warn", "🟡": "dotyellow", "⚪": "dotwhite", "🟢": "dot", "🔴": "dot", "🔀": "shuffle", "📒": "notebook", "📓": "notebook", "📝": "notebook", "📚": "books", "🍑": "peach", "🐐": "horns", "👑": "crown", "🌙": "moon", "💧": "drop", "💬": "chat", "📈": "chartup", "📊": "chartup", "⌨": "keyboard", "👤": "user", "🔗": "link", "🛡": "shield", "🔑": "key", "💯": "hundred", "🏹": "bow", "🟩": "sqgreen", "🏦": "bank", "😤": "steam", "✦": "sparkle", "✿": "flower", "🌟": "sparkle", "⭐": "sparkle" };
  const ROLE = (n) => `<svg class="kic kic-${n}" viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[n] || P.dot}</svg>`;
  window.kIcon = (n) => ROLE(n); window.__kicScan = (r) => scan(r);
  window.kIconFor = (ch) => ROLE(MAP[ch] || "dot");
  const keys = Object.keys(MAP).sort((a, b) => b.length - a.length).map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const KEEP = new Set(["↔", "↕", "↖", "↗", "↘", "↙", "✎", "©", "®", "™", "‼", "⁉", "▶", "◀", "↩", "↪", "⤴", "⤵", "⬆", "⬅", "➡", "⏏"]);   // typography, not emoji
  const RX0 = new RegExp(`(?:${keys.join("|")}|\\p{Extended_Pictographic})\\uFE0F?`, "gu");
  const RX = { lastIndex: 0, test(v) { RX0.lastIndex = 0; let m; while ((m = RX0.exec(v))) { if (!KEEP.has(m[0].replace(/\uFE0F/g, ""))) return true; } return false; },
    exec(v) { let m; while ((m = RX0.exec(v))) { if (!KEEP.has(m[0].replace(/\uFE0F/g, ""))) return m; } return null; }, set li(x) { RX0.lastIndex = x; } };
  const SKIP = "script,style,textarea,input,code,pre,[contenteditable],.cb,.knoic,.jn-body,.nbody,.ntext,.noteorig";
  const strip = (s) => s.replace(RX0, (m) => (KEEP.has(m.replace(/\uFE0F/g, "")) ? m : "")).replace(/\uFE0F/g, "").replace(/\s{2,}/g, " ").trim();
  function swapText(t) { const v = t.nodeValue; RX.lastIndex = 0; if (!RX.test(v)) return; const pe = t.parentElement; if (!pe || pe.closest(SKIP)) return;
    if (pe.closest("option,optgroup,title,svg")) { t.nodeValue = strip(v); return; }
    RX0.lastIndex = 0; const f = document.createDocumentFragment(); let last = 0, m;
    while ((m = RX.exec(v))) { if (m.index > last) f.appendChild(document.createTextNode(v.slice(last, m.index))); const ch = m[0].replace(/️/g, ""), sp = document.createElement("span"); sp.className = "kicw"; sp.innerHTML = window.kIconFor(ch); f.appendChild(sp); last = m.index + m[0].length; }
    if (last < v.length) f.appendChild(document.createTextNode(v.slice(last))); t.replaceWith(f); }
  function swapAttrs(el) { for (const a of ["title", "placeholder", "aria-label", "data-tip"]) { const v = el.getAttribute && el.getAttribute(a); if (v) { RX.lastIndex = 0; if (RX.test(v)) el.setAttribute(a, strip(v)); } } }
  function scan(root) { if (!root) return; if (root.nodeType === 3) return swapText(root); if (root.nodeType !== 1) return; if (root.closest && root.closest(SKIP)) return;
    swapAttrs(root); root.querySelectorAll && root.querySelectorAll("[title],[placeholder],[aria-label],[data-tip]").forEach(swapAttrs);
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT), list = []; let n; while ((n = w.nextNode())) list.push(n); list.forEach(swapText); }
  let q = new Set(), raf = 0; const flush = () => { raf = 0; const items = [...q]; q.clear(); items.forEach((n) => { if (n.isConnected) scan(n); }); };
  const mo = new MutationObserver((ms) => { for (const m of ms) { if (m.type === "characterData") q.add(m.target); else if (m.type === "attributes") q.add(m.target); else m.addedNodes.forEach((x) => q.add(x)); } if (!raf) raf = requestAnimationFrame(flush); });
  const start = () => { scan(document.body); mo.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["title", "placeholder", "aria-label", "data-tip"] }); };
  if (document.body) start(); else document.addEventListener("DOMContentLoaded", start);
  document.title = strip(document.title);
})();
