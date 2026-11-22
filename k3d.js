// KING_3DBG v2 (Nov 22, King): in the 3D theme every page that isn't the chart has a real object turning slowly behind it,
// in semi-transparent gray glass: Journal = a hardcover book, Stats = a 3D bar chart with a trend line, Calendar = a desk calendar,
// Accounts = a stack of coins, Learn = a graduation cap, Friends = three people, Tax = a calculator, Helper = a life ring, Settings = a gear.
// Built from rounded, beveled shapes in three.js; only loads while the 3D theme is on.
let K3 = null;
async function k3dInit() {
  if (K3) return K3; const THREE = await import("https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js");
  const cv = document.createElement("canvas"); cv.id = "k3d"; document.body.prepend(cv);
  const R = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true }); R.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75)); R.outputColorSpace = THREE.SRGBColorSpace;
  const S = new THREE.Scene(), C = new THREE.PerspectiveCamera(30, 1, 0.1, 100); C.position.set(0, 1.4, 11);
  S.add(new THREE.HemisphereLight(0xffffff, 0x8e97a8, 1.4)); const D = new THREE.DirectionalLight(0xffffff, 2.4); D.position.set(5, 8, 6); S.add(D);
  const D2 = new THREE.DirectionalLight(0xdfe6ff, 1.1); D2.position.set(-6, 3, -4); S.add(D2); const D3 = new THREE.DirectionalLight(0xffffff, 0.8); D3.position.set(0, -4, 6); S.add(D3);
  const glass = (shade = 0x9aa1ad, op = 0.5) => new THREE.MeshPhysicalMaterial({ color: shade, roughness: 0.22, metalness: 0.05, clearcoat: 1, clearcoatRoughness: 0.15, transparent: true, opacity: op, depthWrite: false, side: THREE.DoubleSide });
  const M1 = glass(0x9aa1ad, 0.5), M2 = glass(0x7d8592, 0.6), M3 = glass(0xc3c8d1, 0.42), EM = new THREE.LineBasicMaterial({ color: 0x5c6472, transparent: true, opacity: 0.35 });
  const edge = (mesh) => { const e = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, 28), EM); mesh.add(e); return mesh; };
  // rounded, beveled box (an extruded rounded rectangle) so every part looks manufactured, not like a raw cube
  const rbox = (w, h, d, r, m) => { r = Math.min(r, w / 2, h / 2); const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
    s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r); s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
    const bv = Math.min(0.06, d / 4), g = new THREE.ExtrudeGeometry(s, { depth: Math.max(0.01, d - bv * 2), bevelEnabled: true, bevelSize: bv, bevelThickness: bv, bevelSegments: 4, curveSegments: 10 }); g.center(); return edge(new THREE.Mesh(g, m)); };
  const at = (o, x, y, z, rx = 0, ry = 0, rz = 0) => { o.position.set(x, y, z); o.rotation.set(rx, ry, rz); return o; };
  const make = {
    journal: () => { const g = new THREE.Group(); g.add(at(rbox(3.4, 4.4, 0.18, 0.12, M2), 0, 0, 0.36)); g.add(at(rbox(3.4, 4.4, 0.18, 0.12, M2), 0, 0, -0.36));
      g.add(at(rbox(3.15, 4.2, 0.56, 0.05, M3), 0.08, 0, 0)); for (let i = -4; i <= 4; i++) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.004, 4.1, 0.5), M2); l.position.set(1.66, 0, i * 0.055); g.add(l); }
      g.add(at(rbox(0.3, 4.4, 0.9, 0.14, M2), -1.62, 0, 0)); g.add(at(rbox(0.16, 1.4, 0.02, 0.02, M1), 0.6, -2.7, 0.2)); g.rotation.set(-0.35, 0.65, 0.12); return g; },
    stats: () => { const g = new THREE.Group(); g.add(at(rbox(5.4, 2.6, 0.22, 0.2, M2), 0, -1.55, 0, -Math.PI / 2)); const hs = [1.1, 1.9, 1.5, 2.6, 3.3];
      hs.forEach((h, i) => g.add(at(rbox(0.66, h, 0.66, 0.12, i === 4 ? M2 : M1), -2 + i, -1.44 + h / 2, 0)));
      const pts = hs.map((h, i) => new THREE.Vector3(-2 + i, -1.2 + h + 0.25, 0.55)); const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 80, 0.05, 10), M2); g.add(tube);
      pts.forEach((p) => { const s = new THREE.Mesh(new THREE.SphereGeometry(0.12, 24, 16), M2); s.position.copy(p); g.add(s); }); g.rotation.set(0.22, -0.55, 0); return g; },
    calendar: () => { const g = new THREE.Group(); g.add(at(rbox(3.8, 3.4, 0.16, 0.18, M1), 0, 0, 0)); g.add(at(rbox(3.8, 0.8, 0.2, 0.18, M2), 0, 1.3, 0.02));
      for (let i = 0; i < 4; i++) { const t = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.045, 14, 40), M2); t.position.set(-1.35 + i * 0.9, 1.72, 0); g.add(t); }
      for (let r = 0; r < 4; r++) for (let c = 0; c < 6; c++) g.add(at(rbox(0.46, 0.4, 0.08, 0.07, r === 1 && c === 3 ? M2 : M3), -1.45 + c * 0.58, 0.48 - r * 0.56, 0.12));
      const st = at(rbox(3.6, 3.2, 0.12, 0.16, M3), 0, -0.25, -1.1, 0.5); g.add(st); g.rotation.set(-0.12, 0.6, 0); return g; },
    accounts: () => { const g = new THREE.Group(), prof = [[0, -0.12], [1.02, -0.12], [1.1, -0.08], [1.1, 0.08], [1.02, 0.12], [0.86, 0.12], [0.86, 0.09], [0, 0.09]].map(([x, y]) => new THREE.Vector2(x, y));
      const coin = () => edge(new THREE.Mesh(new THREE.LatheGeometry(prof, 64), M1)); for (let i = 0; i < 8; i++) { const c = coin(); c.position.set(Math.sin(i * 1.7) * 0.07, -1.5 + i * 0.25, Math.cos(i * 1.3) * 0.07); c.rotation.y = i; g.add(c); }
      const c2 = coin(); c2.position.set(2.1, -0.7, 0.6); c2.rotation.set(1.25, 0, 0.5); g.add(c2); const c3 = coin(); c3.position.set(-1.9, -1.45, 0.4); g.add(c3); const c4 = coin(); c4.position.set(-1.9, -1.2, 0.4); g.add(c4); g.rotation.set(0.32, 0, 0); return g; },
    learn: () => { const g = new THREE.Group(); g.add(at(rbox(3.6, 3.6, 0.14, 0.06, M2), 0, 0.5, 0, -Math.PI / 2, 0, 0)); const cap = edge(new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.25, 1.0, 64, 1, true), M1)); cap.position.y = -0.05; g.add(cap);
      const btn = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.1, 24), M2); btn.position.y = 0.64; g.add(btn);
      const cord = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0.62, 0), new THREE.Vector3(1.2, 0.6, 0.6), new THREE.Vector3(1.75, 0.5, 1.2), new THREE.Vector3(1.78, -0.6, 1.25)]), 60, 0.03, 8), M2); g.add(cord);
      const tas = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.6, 24), M2); tas.position.set(1.78, -0.85, 1.25); g.add(tas); g.rotation.set(0.38, 0.4, 0); return g; },
    friends: () => { const g = new THREE.Group(); [[-1.7, 0, 0.2, 0.9], [1.7, 0, 0.2, 0.9], [0, 0.15, -0.6, 1.05]].forEach(([x, y, z, s], i) => { const p = new THREE.Group();
        const body = edge(new THREE.Mesh(new THREE.CapsuleGeometry(0.62, 0.9, 10, 32), i === 2 ? M2 : M1)); body.position.y = -0.9; p.add(body); const head = edge(new THREE.Mesh(new THREE.SphereGeometry(0.5, 40, 28), i === 2 ? M2 : M1)); head.position.y = 0.6; p.add(head);
        p.position.set(x, y, z); p.scale.setScalar(s); g.add(p); }); return g; },
    tax: () => { const g = new THREE.Group(); g.add(at(rbox(2.8, 3.9, 0.36, 0.28, M1), 0, 0, 0)); g.add(at(rbox(2.2, 0.85, 0.06, 0.1, M2), 0, 1.2, 0.2));
      for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) g.add(at(rbox(0.46, 0.42, 0.16, 0.1, c === 3 ? M2 : M3), -0.8 + c * 0.54, 0.25 - r * 0.52, 0.24)); g.rotation.set(-0.25, -0.5, 0.06); return g; },
    help: () => { const g = new THREE.Group(); for (let i = 0; i < 8; i++) { const seg = edge(new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.46, 28, 24, Math.PI / 4), i % 2 ? M2 : M3)); seg.rotation.z = (i * Math.PI) / 4; g.add(seg); }
      const rope = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.5, 8, 96), new THREE.MeshBasicMaterial({ color: 0x5c6472, wireframe: true, transparent: true, opacity: 0.06 })); g.add(rope); g.rotation.set(0.5, 0.3, 0); return g; },
    settings: () => { const sh = new THREE.Shape(), T = 12, R1 = 1.5, R2 = 1.95, n = T * 4; for (let i = 0; i <= n; i++) { const a = (i / n) * Math.PI * 2, r = (Math.floor((i + 1) / 2) % 2 ? R2 : R1); i ? sh.lineTo(Math.cos(a) * r, Math.sin(a) * r) : sh.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
      const hole = new THREE.Path(); hole.absarc(0, 0, 0.55, 0, Math.PI * 2, true); sh.holes.push(hole); const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.5, bevelEnabled: true, bevelSize: 0.07, bevelThickness: 0.07, bevelSegments: 4, curveSegments: 24 }); geo.center();
      const g = new THREE.Group(), gear = edge(new THREE.Mesh(geo, M1)); g.add(gear); const hub = edge(new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.8, 48, 1, true), M2)); hub.rotation.x = Math.PI / 2; g.add(hub);
      const g2 = gear.clone(); g2.scale.setScalar(0.55); g2.position.set(2.15, -1.3, -0.3); g2.rotation.z = 0.2; g.add(g2); g.userData.spin = [gear, g2]; return g; } };
  make.tj = make.journal; make.journal = make.calendar; make.admin = make.help;
  K3 = { THREE, R, S, C, cv, make, cur: null, id: null, t0: performance.now(), raf: 0 };
  const size = () => { const w = innerWidth, h = innerHeight; R.setSize(w, h, false); cv.style.width = w + "px"; cv.style.height = h + "px"; C.aspect = w / h; C.updateProjectionMatrix(); }; size(); addEventListener("resize", size);
  return K3; }
async function k3dView(v) {
  const on = document.body.classList.contains("at-d3") && v && v !== "trade" && !matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!on) { if (K3) { K3.cv.classList.remove("on"); cancelAnimationFrame(K3.raf); K3.raf = 0; } return; }
  let k; try { k = await k3dInit(); } catch (e) { return; } if (!document.body.classList.contains("at-d3")) return;
  if (k.id !== v) { if (k.cur) k.S.remove(k.cur); const f = k.make[v] || k.make.help; k.cur = f(); k.cur.position.x = 2.9; k.cur.scale.setScalar(0.001); k.S.add(k.cur); k.id = v; k.born = performance.now(); k.ry = k.cur.rotation.y; }
  k.cv.classList.add("on"); if (k.raf) return;
  const loop = (now) => { const t = (now - k.t0) / 1000, o = k.cur; if (o) { const b = Math.min(1, (now - k.born) / 1100), e = b === 1 ? 1 : 1 - Math.pow(2, -10 * b); o.scale.setScalar(Math.max(0.001, e));
      k.ry += 0.0011; o.rotation.y = k.ry; o.position.y = Math.sin(t * 0.45) * 0.1; (o.userData.spin || []).forEach((g, i) => (g.rotation.z += i ? -0.004 : 0.0022)); }
    k.C.position.x = Math.sin(t * 0.05) * 1.2; k.C.position.y = 1.4 + Math.sin(t * 0.07) * 0.35; k.C.lookAt(1.9, 0, 0); k.R.render(k.S, k.C); k.raf = requestAnimationFrame(loop); };
  k.raf = requestAnimationFrame(loop); }
window.k3dView = k3dView;
// KING_CRITTERS3D (Nov 22, King): the Animated theme's walkers are real lit 3D models now (a little robot and a round bird),
// with walk cycles, hops and wing flaps, drawn in a see-through layer that never blocks clicks.
let KC = null;
async function kCritters(on) {
  if (!on) { if (KC) { cancelAnimationFrame(KC.raf); KC.raf = 0; KC.cv.style.display = "none"; } return; }
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  if (!KC) { let THREE; try { THREE = await import("https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js"); } catch (e) { return; }
    const cv = document.createElement("canvas"); cv.id = "kcrit"; Object.assign(cv.style, { position: "fixed", inset: "0", pointerEvents: "none", zIndex: 2147480000 }); document.body.appendChild(cv);
    const R = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true }); R.setPixelRatio(Math.min(devicePixelRatio || 1, 2)); R.outputColorSpace = THREE.SRGBColorSpace;
    const S = new THREE.Scene(), C = new THREE.OrthographicCamera(0, 1, 0, -1, -500, 500); S.add(new THREE.HemisphereLight(0xffffff, 0x445066, 1.6)); const D = new THREE.DirectionalLight(0xffffff, 2.2); D.position.set(2, 4, 6); S.add(D);
    const mat = (c, r = 0.45, m = 0.1) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });
    const robot = (col) => { const g = new THREE.Group(), body = new THREE.Mesh(new THREE.CapsuleGeometry(7, 6, 8, 24), mat(col, 0.35, 0.25)); body.position.y = 15; g.add(body);
      const visor = new THREE.Mesh(new THREE.SphereGeometry(5.2, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2.4), mat(0x0c0f18, 0.15, 0.6)); visor.rotation.x = Math.PI / 2; visor.position.set(3.6, 17.5, 0); visor.rotation.z = -Math.PI / 2; g.add(visor);
      const eyeM = new THREE.MeshBasicMaterial({ color: 0x8ff7ff }); [-1.8, 1.8].forEach((z) => { const e = new THREE.Mesh(new THREE.SphereGeometry(0.9, 12, 8), eyeM); e.position.set(7.4, 18.2, z); g.add(e); });
      const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 5, 8), mat(0x9aa3b5)); ant.position.set(0, 27, 0); g.add(ant); const tip = new THREE.Mesh(new THREE.SphereGeometry(1.3, 16, 12), new THREE.MeshBasicMaterial({ color: col })); tip.position.set(0, 29.8, 0); g.add(tip);
      const legs = [-3, 3].map((z) => { const p = new THREE.Group(); p.position.set(0, 8, z); const l = new THREE.Mesh(new THREE.CapsuleGeometry(1.5, 4.5, 4, 12), mat(0x3a4152, 0.5)); l.position.y = -3.5; p.add(l); const f = new THREE.Mesh(new THREE.BoxGeometry(4.2, 1.4, 2.6), mat(0x2a2f3c)); f.position.set(1, -7, 0); p.add(f); g.add(p); return p; });
      const arms = [-7.6, 7.6].map((z) => { const p = new THREE.Group(); p.position.set(0, 17, z); const a = new THREE.Mesh(new THREE.CapsuleGeometry(1.2, 5, 4, 12), mat(col, 0.4, 0.2)); a.position.y = -3.5; p.add(a); g.add(p); return p; });
      return { g, legs, arms, body, kind: "robot" }; };
    const bird = (col) => { const g = new THREE.Group(), body = new THREE.Mesh(new THREE.SphereGeometry(8, 32, 24), mat(col, 0.6)); body.scale.set(1.15, 1, 0.95); body.position.y = 13; g.add(body);
      const belly = new THREE.Mesh(new THREE.SphereGeometry(6.4, 24, 16), mat(0xf6efe2, 0.7)); belly.position.set(3, 11.5, 0); belly.scale.set(0.9, 0.9, 0.85); g.add(belly);
      const beak = new THREE.Mesh(new THREE.ConeGeometry(1.9, 4.5, 16), mat(0xffb23d, 0.4)); beak.rotation.z = -Math.PI / 2; beak.position.set(10, 15, 0); g.add(beak);
      [-3.4, 3.4].forEach((z) => { const e = new THREE.Mesh(new THREE.SphereGeometry(1.15, 12, 8), mat(0x101218, 0.2)); e.position.set(7, 17.4, z); g.add(e); });
      const wings = [-7, 7].map((z) => { const p = new THREE.Group(); p.position.set(-1, 15, z); const w = new THREE.Mesh(new THREE.SphereGeometry(5, 20, 12), mat(col, 0.6)); w.scale.set(1.1, 0.55, 0.25); w.position.set(-2, -1, 0); p.add(w); g.add(p); return p; });
      const legs = [-2.5, 2.5].map((z) => { const p = new THREE.Group(); p.position.set(1, 6, z); const l = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 5.5, 8), mat(0xffb23d)); l.position.y = -2.6; p.add(l); const f = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.7, 2.4), mat(0xffb23d)); f.position.set(1, -5.4, 0); p.add(f); g.add(p); return p; });
      const tail = new THREE.Mesh(new THREE.ConeGeometry(3, 6, 12), mat(col, 0.6)); tail.rotation.z = Math.PI / 2 + 0.5; tail.position.set(-9, 16, 0); g.add(tail);
      return { g, legs, wings, body, kind: "bird" }; };
    const mk = [robot(0x7cc4ff), bird(0xff8ab0), robot(0x5af0b0), bird(0xffd36b)];
    const list = mk.map((m, i) => { S.add(m.g); return { ...m, lane: i === 2 ? "top" : "bottom", x: 80 + Math.random() * (innerWidth - 160), vx: (Math.random() < 0.5 ? -1 : 1) * (26 + Math.random() * 16), y: 0, vy: 0, pause: 0, ph: Math.random() * 6, s: m.kind === "bird" ? 1.7 : 1.75, face: 1, flap: 0 }; });
    KC = { THREE, R, S, C, cv, list, raf: 0, mx: -999, my: -999 }; addEventListener("pointermove", (e) => { KC.mx = e.clientX; KC.my = e.clientY; }, { passive: true });
    const size = () => { const w = innerWidth, h = innerHeight; R.setSize(w, h, false); C.left = 0; C.right = w; C.top = 0; C.bottom = -h; C.updateProjectionMatrix(); }; size(); addEventListener("resize", size); }
  KC.cv.style.display = ""; if (KC.raf) return; let last = performance.now();
  const loop = (now) => { const dt = Math.min(0.05, (now - last) / 1000); last = now; const t = now / 1000, rail = document.querySelector(".rail"), topY = rail ? rail.getBoundingClientRect().bottom : 58;
    for (const c of KC.list) { const gy = c.lane === "top" ? topY : innerHeight - 6, walking = c.pause <= 0 && c.y === 0;
      if (c.pause > 0) c.pause -= dt; else { c.x += c.vx * dt; if (Math.random() < dt * 0.1) c.pause = 0.8 + Math.random() * 2.4; if (Math.random() < dt * 0.04) c.vx *= -1; }
      if (c.x < 30) { c.x = 30; c.vx = Math.abs(c.vx); } if (c.x > innerWidth - 30) { c.x = innerWidth - 30; c.vx = -Math.abs(c.vx); }
      const near = Math.hypot(KC.mx - c.x, KC.my - (gy - 16 + c.y)) < 80; if (near && c.y === 0) { c.vy = 300; c.vx = (c.x > KC.mx ? 1 : -1) * 90; c.pause = 0; c.flap = 0.6; }
      if (c.y > 0 || c.vy > 0) { c.vy -= 950 * dt; c.y = Math.max(0, c.y + c.vy * dt); if (c.y === 0) { c.vy = 0; c.vx = Math.sign(c.vx) * (26 + Math.random() * 16); } }
      c.face += ((c.vx < 0 ? -1 : 1) - c.face) * Math.min(1, dt * 8); const sw = walking ? Math.sin(t * 11 + c.ph) : 0;
      c.legs.forEach((l, i) => (l.rotation.z = (i ? 1 : -1) * sw * 0.6)); if (c.arms) c.arms.forEach((a, i) => (a.rotation.z = (i ? -1 : 1) * sw * 0.5));
      if (c.wings) { c.flap = Math.max(0, c.flap - dt); const f = c.y > 0 || c.flap > 0 ? Math.sin(t * 40) * 0.9 : Math.sin(t * 2 + c.ph) * 0.05; c.wings.forEach((w, i) => (w.rotation.x = (i ? 1 : -1) * f)); }
      c.body.position.y = (c.kind === "bird" ? 13 : 15) + (walking ? Math.abs(sw) * 1.2 : Math.sin(t * 2 + c.ph) * 0.4);
      c.g.position.set(c.x, -gy + c.y, 0); c.g.scale.setScalar(c.s); c.g.rotation.set(0.12, (c.face > 0 ? 0 : Math.PI) + (c.face > 0 ? -0.55 : 0.55) * Math.abs(c.face), 0); }
    KC.R.render(KC.S, KC.C); KC.raf = requestAnimationFrame(loop); };
  KC.raf = requestAnimationFrame(loop); }
window.kCritters = kCritters;
