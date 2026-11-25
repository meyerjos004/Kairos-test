/* KING_TOURDEMO (King, Nov 24): a short looping scene on every 1.0 tour stop that acts the feature out, with the blue buddy
   (Slab Chunk, the status-screen character) as the cursor. Pure SVG + CSS keyframes, 6 s loops, no assets.
   window.tourDemo(n) -> HTML for stop n (1-based). Reduced motion shows the finished frame. */
(function () {
  const L = 6;                                   // loop length (s)
  const UP = "#2bd4a0", DN = "#ff4d5e", BLUE = "#4696ff", GHOST = "#7aa7ff";
  const GRID = ["....................", "....................", "....................", ".........bb.........", ".........bb.........", ".....bbbbbbbbbb.....", ".....bbbbbbbbbb.....", ".....bbbbbbbbbb.....", ".....bbbbbbbbbb.....", ".....bbbbbbbbbb.....", ".....bbbbbbbbbb.....", ".....bbbbbbbbbb.....", ".....bbbbbbbbbb.....", ".....bbbbbbbbbb.....", ".....bbbbbbbbbb.....", ".....b........b.....", ".....b........b....."];
  let uid = 0;
  function make(n) {
    const id = "td" + n + "x" + (++uid), K = [];      // keyframes for this scene
    const pc = (t) => Math.max(0, Math.min(100, (t / L) * 100)).toFixed(2) + "%";
    const kf = (steps) => { const nm = id + "k" + K.length; K.push(`@keyframes ${nm}{${steps.map(([t, css]) => `${pc(t)}{${css}}`).join("")}}`); return nm; };
    const anim = (nm, ease = "linear") => `animation:${nm} ${L}s ${ease} infinite`;
    // visible from t0 to t1 (fades), finished frame = visible
    const show = (t0, t1 = 5.55, extra = "") => `style="${anim(kf([[0, "opacity:0" + extra], [t0, "opacity:0" + extra], [t0 + 0.18, "opacity:1;transform:none"], [t1, "opacity:1;transform:none"], [t1 + 0.3, "opacity:0;transform:none"], [L, "opacity:0"]]))};transform-box:fill-box;transform-origin:center"`;
    const pop = (t0, t1) => show(t0, t1, ";transform:scale(.6)");
    const rise = (t0, t1) => show(t0, t1, ";transform:translateY(10px)");
    // the buddy: path [[t,x,y]] = where his pointing hand is; taps [t] squash him + ripple at the hand
    function buddy(path, taps = [], color = BLUE, s = 2.1) {
      const hx = 16.5 * s, hy = 11.5 * s;
      const mv = kf(path.map(([t, x, y]) => [t, `transform:translate(${(x - hx).toFixed(1)}px,${(y - hy).toFixed(1)}px)`]).concat([[L, `transform:translate(${(path[0][1] - hx).toFixed(1)}px,${(path[0][2] - hy).toFixed(1)}px)`]]));
      const sq = kf([[0, "transform:none"]].concat(...taps.map((t) => [[t - 0.12, "transform:none"], [t, "transform:scale(1.08,.86)"], [t + 0.16, "transform:none"]])));
      let px = ""; GRID.forEach((row, j) => { for (let i = 0; i < row.length; i++) if (row[i] === "b") px += `<rect x="${i * s}" y="${j * s}" width="${s + 0.3}" height="${s + 0.3}"/>`; });
      const arm = (x0, dir) => `<rect x="${(x0 + dir) * s}" y="${10 * s}" width="${s + 0.3}" height="${s + 0.3}"/><rect x="${(x0 + 2 * dir) * s}" y="${11 * s}" width="${s + 0.3}" height="${s + 0.3}"/>`;
      const eyes = `<g fill="#0b0b10"><rect x="${8 * s}" y="${8 * s}" width="${s}" height="${2 * s}"/><rect x="${11 * s}" y="${8 * s}" width="${s}" height="${2 * s}"/></g>`;
      const at = (t) => { let a = path[0]; for (const p of path) if (p[0] <= t) a = p; return a; };
      const rip = taps.map((t) => { const [, x, y] = at(t); const nm = kf([[0, "opacity:0;transform:scale(.2)"], [t, "opacity:0;transform:scale(.2)"], [t + 0.02, "opacity:.7;transform:scale(.3)"], [t + 0.5, "opacity:0;transform:scale(1.4)"], [L, "opacity:0"]]);
        return `<circle cx="${x}" cy="${y}" r="11" fill="none" stroke="${color}" stroke-width="2" style="${anim(nm, "ease-out")};transform-box:fill-box;transform-origin:center"/>`; }).join("");
      return `${rip}<g class="tdbud" style="${anim(mv, "cubic-bezier(.45,0,.25,1)")}"><g style="${anim(sq)};transform-box:fill-box;transform-origin:50% 100%" fill="${color}">${px}${arm(5, -1)}${arm(14, 1)}${eyes}</g></g>`;
    }
    // a little candle chart; reveal: [t0,t1] candles appear one by one
    function chart(x, y, w, h, n, seed, reveal, cols) {
      let r = seed, p = 0.5, out = ""; const cw = w / n, rnd = () => (r = (r * 9301 + 49297) % 233280) / 233280, pts = [];
      for (let i = 0; i < n; i++) { const o = p, c = Math.max(0.08, Math.min(0.92, p + (rnd() - 0.48) * 0.22)), hi = Math.max(o, c) + rnd() * 0.06, lo = Math.min(o, c) - rnd() * 0.06; p = c; pts.push([o, c, hi, lo]); }
      pts.forEach(([o, c, hi, lo], i) => { const cx = x + i * cw + cw / 2, Y = (v) => y + h - v * h, col = c >= o ? (cols ? cols[0] : UP) : (cols ? cols[1] : DN);
        const st = typeof reveal === "function" ? show(...reveal(i)) : reveal ? show(reveal[0] + (reveal[1] - reveal[0]) * (i / n), reveal[2]) : "";
        out += `<g ${st}><line x1="${cx}" x2="${cx}" y1="${Y(hi)}" y2="${Y(lo)}" stroke="${col}" stroke-width="1.2"/><rect x="${cx - cw * 0.32}" y="${Math.min(Y(o), Y(c))}" width="${cw * 0.64}" height="${Math.max(1.5, Math.abs(Y(o) - Y(c)))}" rx="1" fill="${col}"/></g>`; });
      return { svg: out, y: (i, k = 1) => y + h - pts[Math.min(n - 1, i)][k] * h, x: (i) => x + i * cw + cw / 2 };
    }
    const box = (x, y, w, h, r = 10, op = 0.06, more = "") => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="currentColor" fill-opacity="${op}" ${more}/>`;
    const tx = (x, y, t, sz = 12, wt = 600, op = 1, more = "") => `<text x="${x}" y="${y}" font-size="${sz}" font-weight="${wt}" fill="currentColor" fill-opacity="${op}" ${more}>${t}</text>`;
    const NM = (() => { const x = window.__tourNames || {}, e = (v) => String(v).replace(/[<>&"]/g, ""); return { you: e(x.you || "You"), mate: e(x.mate || "Ben") }; })();
    let body = "";
    if (n === 1) {   // Reese log -> replay the day -> his video opens beside the chart
      const c = chart(196, 26, 200, 112, 22, 7, [1.7, 3.6]);
      body = box(16, 18, 160, 134) + tx(30, 40, "Reese log", 12, 700) +
        [["Nov 20 · NY", "Win"], ["Nov 19 · NY", "Win"], ["Nov 16 · NY", "Win"]].map(([d, r], k) => `<g>${box(26, 52 + k * 31, 140, 25, 7, 0.05)}<rect x="26" y="${52 + k * 31}" width="140" height="25" rx="7" fill="${BLUE}" fill-opacity=".16" ${k === 1 ? show(1.35, 5.55) : 'opacity="0"'}/>${tx(36, 69 + k * 31, d, 11, 500, 0.85)}${tx(140, 69 + k * 31, r, 10, 700, 1, `fill="${UP}" style="fill:${UP}"`)}</g>`).join("") +
        box(190, 18, 212, 134) + c.svg +
        `<g ${rise(2.6, 5.55)}>${box(414, 30, 130, 92, 10, 0.1)}<polygon points="470,64 470,88 490,76" fill="currentColor" fill-opacity=".55"/>${tx(424, 112, "His breakdown", 10.5, 600, 0.8)}</g>` +
        buddy([[0, 300, 150], [0.4, 300, 150], [1.2, 120, 96], [1.6, 120, 96], [2.4, 470, 76], [3.4, 470, 76], [4.4, 340, 60], [5.6, 300, 150]], [1.35, 2.6]);
    } else if (n === 2) {   // replay day ends -> Reese's real trade appears as a ghost -> recap
      const c = chart(24, 22, 400, 112, 30, 21, [0.2, 2.6]), ex = c.x(10), ey = c.y(10), fx = c.x(19), fy = c.y(19);
      body = box(14, 14, 420, 142) + c.svg +
        `<g ${show(2.7)}><line x1="${c.x(29) + 8}" x2="${c.x(29) + 8}" y1="20" y2="140" stroke="currentColor" stroke-opacity=".35" stroke-dasharray="3 4"/>${tx(c.x(29) - 52, 150, "Session end", 10, 600, 0.6)}</g>` +
        `<g ${show(3.1)}><line x1="${ex}" y1="${ey}" x2="${fx}" y2="${fy}" stroke="${GHOST}" stroke-width="1.6" stroke-dasharray="5 4"/><polygon points="${ex - 6},${ey + 14} ${ex + 6},${ey + 14} ${ex},${ey + 4}" fill="${GHOST}"/><circle cx="${fx}" cy="${fy}" r="4.5" fill="none" stroke="${GHOST}" stroke-width="2"/></g>` +
        `<g ${pop(3.5)}><rect x="${ex - 46}" y="${ey + 20}" width="112" height="22" rx="11" fill="${GHOST}"/>${tx(ex - 36, ey + 35, "Reese took this", 11, 700, 1, 'style="fill:#fff"')}</g>` +
        `<g ${rise(4.1)}>${box(446, 40, 104, 88, 12, 0.08)}${tx(458, 62, "Day recap", 11, 700, 0.8)}${tx(458, 86, "You  +1.0R", 12, 600)}${tx(458, 108, "Reese +2.4R", 12, 600, 1, `style="fill:${GHOST}"`)}</g>` +
        buddy([[0, 470, 150], [2.9, 470, 150], [3.5, ex + 2, ey + 30], [4.3, ex + 2, ey + 30], [5, 500, 108], [5.6, 470, 150]], [3.6, 5.05]);
    } else if (n === 3) {   // drag a chart screenshot in -> KAIROS jumps to that candle
      const c = chart(230, 26, 310, 110, 26, 33, [2.6, 3.4]);
      const drag = kf([[0, "opacity:1;transform:translate(0,0) rotate(-6deg)"], [1.0, "opacity:1;transform:translate(0,0) rotate(-6deg)"], [2.2, "opacity:1;transform:translate(250px,10px) rotate(0) scale(.7)"], [2.5, "transform:translate(250px,10px) scale(.7);opacity:0"], [5.6, "opacity:0"], [5.8, "opacity:0;transform:translate(0,0) rotate(-6deg)"], [L, "transform:translate(0,0) rotate(-6deg);opacity:1"]]);
      body = box(220, 14, 330, 142) + c.svg +
        `<g style="${anim(drag, "cubic-bezier(.45,0,.25,1)")};transform-box:fill-box;transform-origin:center">${box(30, 36, 150, 96, 10, 0.12)}<polyline points="44,112 66,96 84,104 104,78 124,86 146,60 166,70" fill="none" stroke="currentColor" stroke-opacity=".55" stroke-width="2"/>${tx(42, 54, "screenshot.png", 10, 600, 0.6)}</g>` +
        `<g ${show(3.0)}><line x1="${c.x(17)}" x2="${c.x(17)}" y1="22" y2="140" stroke="${BLUE}" stroke-width="1.5"/><rect x="${c.x(17) - 52}" y="140" width="104" height="18" rx="9" fill="${BLUE}"/>${tx(c.x(17) - 44, 153, "NQ · Nov 20 10:09", 10, 700, 1, 'style="fill:#fff"')}</g>` +
        buddy([[0, 120, 160], [0.6, 150, 120], [1.0, 150, 120], [2.2, 400, 110], [2.6, 400, 110], [3.4, 470, 150], [5.6, 120, 160]], [1.0, 2.3]);
    } else if (n === 4) {   // journal calendar -> tap a day -> its entries -> sort
      const days = "WLWWBWLWWWBWLWW"; let cal = "";
      for (let k = 0; k < 15; k++) { const x = 20 + (k % 5) * 44, y = 40 + Math.floor(k / 5) * 36, col = days[k] === "W" ? UP : days[k] === "L" ? DN : "currentColor";
        cal += `<rect x="${x}" y="${y}" width="38" height="30" rx="7" fill="${col}" fill-opacity="${days[k] === "B" ? 0.06 : 0.22}"/>${tx(x + 5, y + 12, k + 3, 9, 600, 0.55)}`; }
      const sw = kf([[0, "transform:none"], [3.4, "transform:none"], [3.7, "transform:translateY(34px)"], [5.6, "transform:translateY(34px)"], [L, "transform:none"]]), sw2 = kf([[0, "transform:none"], [3.4, "transform:none"], [3.7, "transform:translateY(-34px)"], [5.6, "transform:translateY(-34px)"], [L, "transform:none"]]);
      body = box(12, 14, 236, 146) + tx(24, 32, "November", 12, 700) + cal + `<rect x="${20 + 2 * 44}" y="76" width="38" height="30" rx="7" fill="none" stroke="${BLUE}" stroke-width="2.2" ${show(1.3)}/>` +
        `<g ${rise(1.5)}>${box(262, 14, 286, 146)}${tx(276, 34, "Thursday · 2 entries", 12, 700)}<g ${show(2.5)}><rect x="460" y="20" width="76" height="20" rx="10" fill="currentColor" fill-opacity=".1"/>${tx(470, 34, "Best R ▾", 10.5, 600, 0.8)}</g>
          <g style="${anim(sw)}">${box(274, 48, 262, 28, 8, 0.06)}${tx(286, 66, "Long NQ · 9:41", 11, 600, 0.85)}${tx(486, 66, "+1.2R", 11, 700, 1, `style="fill:${UP}"`)}</g>
          <g style="${anim(sw2)}">${box(274, 82, 262, 28, 8, 0.06)}${tx(286, 100, "Short NQ · 10:14", 11, 600, 0.85)}${tx(486, 100, "+2.6R", 11, 700, 1, `style="fill:${UP}"`)}</g></g>` +
        buddy([[0, 200, 158], [0.5, 200, 158], [1.2, 127, 92], [1.6, 127, 92], [2.8, 498, 30], [3.5, 498, 30], [4.4, 420, 140], [5.6, 200, 158]], [1.3, 3.2]);
    } else if (n === 5) {   // themes: tap a swatch, the whole chart changes
      const TH = [["#f4f1ea", "#1a1a1a", "#ffffff"], ["#101014", "#2bd4a0", "#ff4d5e"], ["#05060a", "#20f0ff", "#ff3ea5"], ["#0b1a2c", "#fecc02", "#2f6fb5"]];
      const bg = kf(TH.map(([b], k) => [k * 1.4, `fill:${b}`]).concat([[5.6, `fill:${TH[0][0]}`]]));
      let candles = ""; TH.forEach(([, u, d], k) => { const c = chart(36, 32, 330, 104, 24, 5, null, [u, d]); candles += `<g ${show(k * 1.4 + 0.01, k * 1.4 + 1.38)}>${c.svg}</g>`; });
      body = `<rect x="24" y="18" width="354" height="134" rx="12" style="${anim(bg, "steps(1,end)")}" stroke="currentColor" stroke-opacity=".12"/>` + candles + box(392, 18, 156, 134) + tx(406, 40, "Theme", 12, 700) +
        TH.map(([b, u, d], k) => `<g><rect x="${406 + (k % 2) * 66}" y="${54 + Math.floor(k / 2) * 46}" width="58" height="38" rx="9" fill="${b}" stroke="currentColor" stroke-opacity=".18"/><rect x="${418 + (k % 2) * 66}" y="${64 + Math.floor(k / 2) * 46}" width="8" height="18" rx="2" fill="${u}"/><rect x="${432 + (k % 2) * 66}" y="${68 + Math.floor(k / 2) * 46}" width="8" height="14" rx="2" fill="${d}"/></g>`).join("") +
        buddy([[0, 435, 73], [1.2, 435, 73], [1.4, 501, 73], [2.6, 501, 73], [2.8, 435, 119], [4.0, 435, 119], [4.2, 501, 119], [5.4, 501, 119], [5.6, 435, 73]], [0.02, 1.42, 2.82, 4.22]);
    } else if (n === 6) {   // prop firm: daily loss + trailing drawdown tracked live
      const bar = (y, lab, from, to, col) => { const g = kf([[0, `transform:scaleX(${from})`], [1.6, `transform:scaleX(${from})`], [3.2, `transform:scaleX(${to})`], [5.6, `transform:scaleX(${to})`], [L, `transform:scaleX(${from})`]]);
        return tx(290, y, lab, 11, 600, 0.75) + `<rect x="290" y="${y + 8}" width="240" height="10" rx="5" fill="currentColor" fill-opacity=".1"/><rect x="290" y="${y + 8}" width="240" height="10" rx="5" fill="${col}" style="${anim(g, "cubic-bezier(.2,.8,.2,1)")};transform-origin:290px 0"/>`; };
      const c = chart(26, 30, 230, 100, 18, 61, null);
      body = box(14, 14, 254, 146) + c.svg + `<g ${pop(1.5)}><rect x="${c.x(17) - 30}" y="${c.y(17) - 11}" width="60" height="22" rx="11" fill="${DN}"/>${tx(c.x(17) - 18, c.y(17) + 4, "SELL", 11, 800, 1, 'style="fill:#fff"')}</g>` +
        box(280, 14, 268, 146) + tx(294, 36, "Lucid 50K · Eval", 12, 700) + bar(54, "Daily loss limit · $1,000", 0.15, 0.15, UP) + bar(92, "Profit target · $3,000", 0.42, 0.78, UP) +
        `<g ${pop(3.4)}><rect x="294" y="128" width="118" height="22" rx="11" fill="${UP}" fill-opacity=".2"/>${tx(304, 143, "+$1,080 today", 11, 700, 1, `style="fill:${UP}"`)}</g>` +
        buddy([[0, 140, 160], [0.6, 140, 160], [1.3, c.x(17), c.y(17)], [2.0, c.x(17), c.y(17)], [3.0, 470, 110], [5.6, 140, 160]], [1.4]);
    } else if (n === 7) {   // the crew: invited into your dates (KING_FRIENDS3)
      const a = chart(28, 40, 230, 96, 20, 77, [0.4, 4.6]), b = chart(300, 40, 230, 96, 20, 77, [0.4, 3.0]);
      body = box(14, 14, 258, 146) + tx(28, 34, NM.you, 12, 700) + a.svg + box(286, 14, 258, 146) + tx(300, 34, NM.mate, 12, 700) + b.svg +
        tx(150, 34, "Nov 20 · 9:30", 10, 600, 0.55) + tx(422, 34, "Nov 20 · 9:30", 10, 600, 0.55) +
        `<g ${pop(4.7)}><rect x="210" y="138" width="140" height="20" rx="10" fill="currentColor" fill-opacity=".1"/>${tx(226, 152, "Invited into your dates", 10, 600, 0.8)}</g>` +
        buddy([[0, 70, 150], [4.6, 250, 70], [5.6, 70, 150]], [], BLUE, 1.7) + buddy([[0, 340, 150], [3.0, 520, 70], [5.6, 340, 150]], [], "#2bd4a0", 1.7);
    } else if (n === 8) {   // A+ checklist before the click
      const items = ["Liquidity taken", "Displacement", "Inside my time window"];
      body = box(14, 14, 300, 146) + tx(28, 36, "A+ checklist", 12, 700) +
        items.map((t, k) => `<g>${box(26, 48 + k * 32, 276, 26, 8, 0.05)}<rect x="34" y="${53 + k * 32}" width="16" height="16" rx="4" fill="none" stroke="currentColor" stroke-opacity=".35" stroke-width="1.5"/><g ${pop(0.9 + k * 0.7)}><rect x="34" y="${53 + k * 32}" width="16" height="16" rx="4" fill="${UP}"/><path d="M38 ${61 + k * 32}l3 3 6-6" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round"/></g>${tx(58, 66 + k * 32, t, 11.5, 600, 0.85)}</g>`).join("") +
        box(330, 14, 218, 146) + `<rect x="352" y="96" width="174" height="40" rx="12" fill="currentColor" fill-opacity=".12"/>${tx(406, 121, "Buy 2 MNQ", 13, 700, 0.35)}<g ${show(2.5)}><rect x="352" y="96" width="174" height="40" rx="12" fill="${UP}"/>${tx(406, 121, "Buy 2 MNQ", 13, 700, 1, 'style="fill:#06110c"')}</g>` +
        tx(346, 40, "Risk $200 · stop 25 pts", 11, 600, 0.7) + tx(346, 62, "= 2 contracts", 13, 700) +
        `<g ${pop(3.4)}>${tx(388, 152, "Clean entry ✓", 11, 700, 1, `style="fill:${UP}"`)}</g>` +
        buddy([[0, 160, 160], [0.5, 42, 61], [1.1, 42, 61], [1.4, 42, 93], [1.8, 42, 93], [2.1, 42, 125], [2.5, 42, 125], [3.1, 440, 116], [3.8, 440, 116], [5.6, 160, 160]], [0.92, 1.62, 2.32, 3.25]);
    } else if (n === 9) {   // the coach
      const dots = [0, 1, 2].map((k) => { const d = kf([[0, "opacity:0"], [1.2, "opacity:0"], [1.3, "opacity:.3"], [1.5 + k * 0.15, "opacity:1"], [1.8 + k * 0.15, "opacity:.3"], [2.3, "opacity:0"], [L, "opacity:0"]]); return `<circle cx="${92 + k * 12}" cy="104" r="3.5" fill="currentColor" style="${anim(d)}"/>`; }).join("");
      body = box(14, 14, 534, 146) + `<g ${rise(0.4)}><rect x="300" y="26" width="236" height="34" rx="14" fill="${BLUE}"/>${tx(314, 47, "Why do I keep losing on Tuesdays?", 11.5, 600, 1, 'style="fill:#fff"')}</g>` +
        `<g>${dots}</g><g ${rise(2.3)}>${box(74, 74, 440, 70, 14, 0.08)}${tx(88, 96, "3 of your 4 Tuesday losses were entries before 9:35,", 11.5, 500, 0.9)}${tx(88, 114, "before the opening sweep finished. Wait for 9:35 and", 11.5, 500, 0.9)}${tx(88, 132, "your Tuesday win rate goes from 38% to 61%.", 11.5, 600)}</g>` +
        buddy([[0, 56, 140], [5.6, 56, 140]], [2.35]);
    } else if (n === 10) {   // take it or fade it: the replay pauses, you call it, then it plays out
      const c = chart(26, 28, 300, 108, 26, 91, (k) => (k < 17 ? [0.1 + k * 0.07, 5.55] : [2.6 + (k - 17) * 0.11, 5.55]));
      body = box(14, 14, 324, 146) + c.svg +
        `<line x1="${c.x(16) + 6}" x2="${c.x(16) + 6}" y1="22" y2="140" stroke="currentColor" stroke-opacity=".3" stroke-dasharray="3 4"/>` + tx(c.x(16) - 30, 152, "paused", 10, 600, 0.55) +
        box(352, 14, 196, 146) + tx(366, 38, "Take it or fade it?", 12, 700) +
        `<rect x="366" y="54" width="80" height="36" rx="11" fill="${UP}" fill-opacity=".9"/>${tx(388, 77, "Take", 12.5, 700, 1, 'style="fill:#06110c"')}<rect x="454" y="54" width="80" height="36" rx="11" fill="currentColor" fill-opacity=".1"/>${tx(478, 77, "Fade", 12.5, 700, 0.75)}` +
        `<g ${pop(3.6)}>${tx(366, 118, "✓ Hit target · +2R", 12.5, 700, 1, `style="fill:${UP}"`)}${tx(366, 140, "+10 XP", 11, 700, 0.6)}</g>` +
        buddy([[0, 400, 160], [1.0, 406, 72], [2.3, 406, 72], [3.0, 450, 150], [5.6, 400, 160]], [2.35]);
    } else {   // the little things: XP, level up, name effects
      const fill = kf([[0, "transform:scaleX(.1)"], [0.4, "transform:scaleX(.1)"], [2.4, "transform:scaleX(1)"], [2.5, "transform:scaleX(0)"], [3.0, "transform:scaleX(.18)"], [5.6, "transform:scaleX(.18)"], [L, "transform:scaleX(.1)"]]);
      const shim = kf([[0, "transform:translateX(-140px)"], [3.2, "transform:translateX(-140px)"], [4.4, "transform:translateX(180px)"], [L, "transform:translateX(180px)"]]);
      let conf = ""; for (let k = 0; k < 14; k++) { const a = (k / 14) * 6.28, d = kf([[0, "opacity:0;transform:none"], [2.5, "opacity:0;transform:none"], [2.55, "opacity:1;transform:none"], [3.4, `opacity:0;transform:translate(${Math.round(Math.cos(a) * 46)}px,${Math.round(Math.sin(a) * 34)}px)`], [L, "opacity:0"]]);
        conf += `<rect x="296" y="56" width="5" height="5" fill="${[UP, BLUE, "#fecc02", DN][k % 4]}" style="${anim(d, "ease-out")}"/>`; }
      body = box(14, 14, 534, 146) + tx(30, 40, "Level 6", 12, 700, 0.8) + `<rect x="100" y="30" width="400" height="12" rx="6" fill="currentColor" fill-opacity=".1"/><rect x="100" y="30" width="400" height="12" rx="6" fill="${BLUE}" style="${anim(fill, "cubic-bezier(.3,.7,.3,1)")};transform-origin:100px 0"/>` +
        conf + `<g ${pop(2.55)}><rect x="246" y="44" width="110" height="30" rx="15" fill="#fecc02"/>${tx(262, 64, "Level 7 ★", 13, 800, 1, 'style="fill:#2b2206"')}</g>` +
        `<defs><clipPath id="${id}nm"><text x="200" y="128" font-size="30" font-weight="800">${NM.you}</text></clipPath><linearGradient id="${id}g" x1="0" x2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".95"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>` +
        `<text x="200" y="128" font-size="30" font-weight="800" fill="${BLUE}">${NM.you}</text><g clip-path="url(#${id}nm)"><rect x="180" y="96" width="60" height="40" fill="url(#${id}g)" style="${anim(shim)}"/></g>` + tx(290, 126, "your name, in style", 11, 600, 0.55) +
        buddy([[0, 520, 150], [2.4, 520, 150], [2.7, 440, 120], [5.6, 520, 150]], [2.55]);
    }
    return `<div class="tdemo" aria-hidden="true"><style>${K.join("")}</style><svg viewBox="0 0 560 170" role="presentation">${body}</svg></div>`;
  }
  window.tourDemo = (n) => { try { return make(n); } catch (e) { console.warn("tourDemo", n, e); return ""; } };
})();
