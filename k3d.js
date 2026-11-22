// KING_3DBG (Nov 22, King): in the 3D theme every page that isn't the chart gets a slow 3D object behind it that fits the page
// (Journal = a book, Stats = bar chart, Calendar = desk calendar, Accounts = coin stack, Learn = stacked books, Friends = linked spheres,
// Tax = calculator, Helper = knot, Settings = gear). Built from plain shapes in three.js; loads only when the 3D theme is on.
let K3 = null;
async function k3dInit() {
  if (K3) return K3; const THREE = await import("https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js");
  const cv = document.createElement("canvas"); cv.id = "k3d"; document.body.prepend(cv);
  const R = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true }); R.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
  const S = new THREE.Scene(), C = new THREE.PerspectiveCamera(34, 1, 0.1, 100); C.position.set(0, 1.2, 9);
  S.add(new THREE.HemisphereLight(0xffffff, 0xb8c0d0, 1.6)); const D = new THREE.DirectionalLight(0xffffff, 2.2); D.position.set(4, 6, 5); S.add(D); const D2 = new THREE.DirectionalLight(0x9db8ff, 0.8); D2.position.set(-5, 2, -3); S.add(D2);
  const clay = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.55, metalness: 0.05 }), W = clay(0xf4f6fa), G = clay(0xd5dbe5), B = clay(0x2a5bd7), Y = clay(0xe8b64a), N = clay(0x1f9a62);
  const box = (w, h, d, m, x = 0, y = 0, z = 0) => { const g = new THREE.Mesh(new THREE.BoxGeometry(w, h, d, 1, 1, 1), m); g.position.set(x, y, z); return g; };
  const rbox = (w, h, d, m, x, y, z) => { const g = box(w, h, d, m, x, y, z); return g; };
  const make = {
    tj: () => { const g = new THREE.Group(); g.add(box(3.2, 0.3, 4.2, B, 0, -0.32, 0), box(3.0, 0.5, 4.0, W, 0.05, 0.05, 0), box(3.2, 0.3, 4.2, B, 0, 0.42, 0)); const rib = box(0.25, 0.05, 4.3, Y, 1, 0.6, 0); g.add(rib); g.rotation.set(0.5, -0.5, 0.15); return g; },
    stats: () => { const g = new THREE.Group(); g.add(box(5.2, 0.25, 2.2, G, 0, -1.4, 0)); [1.2, 2.1, 1.6, 2.9, 3.6].forEach((h, i) => g.add(box(0.7, h, 0.7, i === 4 ? B : W, -2 + i, -1.27 + h / 2, 0))); g.rotation.set(0.25, -0.6, 0); return g; },
    calendar: () => { const g = new THREE.Group(); g.add(box(3.6, 3.2, 0.5, W, 0, 0, 0), box(3.6, 0.7, 0.55, B, 0, 1.25, 0.01)); for (let i = 0; i < 2; i++) { const t = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.06, 12, 32), G); t.position.set(-0.9 + i * 1.8, 1.65, 0); g.add(t); }
      for (let r = 0; r < 3; r++) for (let c = 0; c < 5; c++) g.add(box(0.45, 0.4, 0.1, r === 1 && c === 2 ? Y : G, -1.25 + c * 0.62, 0.35 - r * 0.62, 0.28)); g.rotation.set(-0.15, 0.55, 0); return g; },
    accounts: () => { const g = new THREE.Group(); for (let i = 0; i < 7; i++) { const c = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 0.22, 48), i % 2 ? Y : clay(0xf0c766)); c.position.set(Math.sin(i) * 0.08, -1.2 + i * 0.24, Math.cos(i) * 0.08); g.add(c); }
      const c2 = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 0.22, 48), Y); c2.position.set(1.9, -0.9, 0.4); c2.rotation.set(1.2, 0, 0.4); g.add(c2); g.rotation.set(0.3, 0, 0); return g; },
    learn: () => { const g = new THREE.Group(); [[B, 0], [W, 0.15], [N, -0.1], [Y, 0.25]].forEach(([m, r], i) => { const b = box(3.2 - i * 0.2, 0.5, 2.3, m, 0, -1 + i * 0.52, 0); b.rotation.y = r; g.add(b); }); g.rotation.set(0.35, -0.4, 0); return g; },
    friends: () => { const g = new THREE.Group(), P = [[-1.6, -0.6, 0], [1.5, -0.4, 0.3], [0, 1.3, -0.2]], M = [B, Y, N]; P.forEach((p, i) => { const s = new THREE.Mesh(new THREE.SphereGeometry(0.75, 40, 24), M[i]); s.position.set(...p); g.add(s); });
      for (let i = 0; i < 3; i++) { const a = new THREE.Vector3(...P[i]), b = new THREE.Vector3(...P[(i + 1) % 3]), m = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, a.distanceTo(b), 12), G); m.position.copy(a.clone().add(b).multiplyScalar(0.5)); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()); g.add(m); } return g; },
    tax: () => { const g = new THREE.Group(); g.add(box(2.6, 3.6, 0.5, W, 0, 0, 0), box(2.1, 0.8, 0.1, clay(0xbfe3cf), 0, 1.15, 0.28)); for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) g.add(box(0.4, 0.38, 0.18, c === 3 ? B : G, -0.75 + c * 0.5, 0.3 - r * 0.5, 0.3)); g.rotation.set(-0.2, -0.5, 0.05); return g; },
    help: () => { const k = new THREE.Mesh(new THREE.TorusKnotGeometry(1.2, 0.36, 160, 24), B); return k; },
    settings: () => { const sh = new THREE.Shape(), T = 12, R1 = 1.55, R2 = 1.95; for (let i = 0; i < T * 4; i++) { const a = (i / (T * 4)) * Math.PI * 2, r = (Math.floor(i / 2) % 2 ? R1 : R2); i ? sh.lineTo(Math.cos(a) * r, Math.sin(a) * r) : sh.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
      const hole = new THREE.Path(); hole.absarc(0, 0, 0.6, 0, Math.PI * 2, true); sh.holes.push(hole); const g = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 0.55, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.06, bevelSegments: 3 }), G); g.geometry.center(); return g; } };
  make.journal = make.tj; make.accounts2 = make.accounts; make.admin = make.help;
  K3 = { THREE, R, S, C, cv, make, cur: null, id: null, t0: performance.now(), raf: 0 };
  const size = () => { const w = innerWidth, h = innerHeight; R.setSize(w, h, false); cv.style.width = w + "px"; cv.style.height = h + "px"; C.aspect = w / h; C.updateProjectionMatrix(); }; size(); addEventListener("resize", size);
  return K3; }
async function k3dView(v) {
  const on = document.body.classList.contains("at-d3") && v && v !== "trade" && !matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!on) { if (K3) { K3.cv.classList.remove("on"); cancelAnimationFrame(K3.raf); K3.raf = 0; } return; }
  let k; try { k = await k3dInit(); } catch (e) { return; } if (!document.body.classList.contains("at-d3")) return;
  if (k.id !== v) { if (k.cur) { k.S.remove(k.cur); } const f = k.make[v] || k.make.help; k.cur = f(); k.cur.position.x = 2.6; k.cur.scale.setScalar(0.001); k.S.add(k.cur); k.id = v; k.born = performance.now(); }
  k.cv.classList.add("on"); if (k.raf) return;
  const loop = (now) => { const t = (now - k.t0) / 1000, o = k.cur; if (o) { const b = Math.min(1, (now - k.born) / 900), e = b === 1 ? 1 : 1 - Math.pow(2, -10 * b); o.scale.setScalar(Math.max(0.001, e)); o.rotation.y += 0.0035; o.position.y = Math.sin(t * 0.6) * 0.12; }
    k.C.position.x = Math.sin(t * 0.08) * 1.4; k.C.position.y = 1.2 + Math.sin(t * 0.11) * 0.4; k.C.lookAt(1.6, 0, 0); k.R.render(k.S, k.C); k.raf = requestAnimationFrame(loop); };
  k.raf = requestAnimationFrame(loop); }
window.k3dView = k3dView;
