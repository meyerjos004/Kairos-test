/* KING_CARREVEAL (Nov 22, King): the KAIROS logo reveal. A drift car (King's own design, built in Blender) comes in on one long slide,
   the K + KAIROS fades in behind it, and the car runs over the camera. The clip is one mp4 with colour on top and its transparency matte
   underneath, combined here in WebGL so it plays over any theme's background in every browser. Sound is synthesized (gear whine + hum). */
(function () {
// KING_REVEALSND: synthesized reveal sound. Hybrid: a throaty engine with exhaust pops, a straight-cut gear whine on top and a faint electric hum, tyre squeal in the slide, a pass-by rush and a thump at the cut.
function revealSound(ac, dur, vol = 1) {
  const t0 = ac.currentTime + .03, out = ac.createGain(); out.gain.value = .9 * vol;
  const comp = ac.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 5; out.connect(comp); comp.connect(ac.destination);
  const env = (g, pts) => { g.gain.setValueAtTime(pts[0][1], t0 + pts[0][0] * dur); for (const [t, v] of pts.slice(1)) g.gain.linearRampToValueAtTime(v, t0 + t * dur); };
  const osc = (type, f, dest) => { const o = ac.createOscillator(); o.type = type; o.frequency.value = f; o.connect(dest); o.start(t0); o.stop(t0 + dur + .6); return o; };
  // rpm curve: pull, shift, pull, lift for the slide, back on it toward the camera
  const rpm = [[0, .46], [.2, .82], [.205, .58], [.4, .9], [.41, .66], [.5, .7], [.62, .5], [.7, .62], [.92, 1], [1, .92]];
  const sweep = (p, base) => { p.setValueAtTime(base * rpm[0][1], t0); for (const [t, v] of rpm.slice(1)) p.linearRampToValueAtTime(base * v, t0 + t * dur); };
  // 1. straight-cut gear whine: two detuned saws + an octave, through a narrow band that tracks the pitch
  const wg = ac.createGain(), wf = ac.createBiquadFilter(); wf.type = "bandpass"; wf.Q.value = 9; wg.connect(out); wf.connect(wg);
  for (const [m, d] of [[1, 0], [1.007, 0], [2.01, 0]]) { const o = osc("sawtooth", 1, wf); sweep(o.frequency, 1650 * m); }
  sweep(wf.frequency, 1700); env(wg, [[0, 0], [.06, .16], [.5, .2], [.62, .1], [.9, .26], [.97, .3], [1, 0]]);
  // 2. KING_HYBRIDSND (King, Nov 24): throaty combustion engine. Low saws + a sub octave through hard-ish clipping, a lowpass that opens with
  //    the revs, and a lope: the engine's gain pulses at half the firing rate so it burbles instead of buzzing.
  const eg = ac.createGain(), sh = ac.createWaveShaper(), lp = ac.createBiquadFilter(), lope = ac.createGain(); lp.type = "lowpass"; lp.Q.value = 1.6;
  const cv = new Float32Array(1024); for (let i = 0; i < 1024; i++) { const x = i / 512 - 1; cv[i] = Math.tanh(x * 3.2) * 0.9; } sh.curve = cv; sh.oversample = "4x";
  sh.connect(lp); lp.connect(lope); lope.connect(eg); eg.connect(out); sweep(lp.frequency, 1500);
  for (const [m, typ] of [[0.5, "sawtooth"], [1, "sawtooth"], [1.003, "sawtooth"], [2, "square"]]) { const g = ac.createGain(); g.gain.value = m === 2 ? 0.25 : m === 0.5 ? 0.9 : 0.6; g.connect(sh); const o = osc(typ, 1, g); sweep(o.frequency, 68 * m); }
  const lfo = osc("square", 1, ac.createGain()); sweep(lfo.frequency, 34); const lfoG = ac.createGain(); lfoG.gain.value = 0.32; lope.gain.value = 0.7; lfo.disconnect(); lfo.connect(lfoG); lfoG.connect(lope.gain);
  env(eg, [[0, 0], [.04, .22], [.2, .27], [.205, .13], [.24, .26], [.4, .28], [.41, .13], [.45, .25], [.5, .2], [.62, .1], [.7, .2], [.9, .32], [.98, .36], [1, 0]]);
  // 2b. exhaust pops on the lift-off and at each shift
  for (const tp of [.205, .41, .52, .555, .6]) { const b = ac.createBuffer(1, Math.ceil(ac.sampleRate * .07), ac.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ac.sampleRate * .012));
    const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain(); s.buffer = b; f.type = "bandpass"; f.frequency.value = 420 + Math.random() * 260; f.Q.value = 1.2; g.gain.value = .38; s.connect(f); f.connect(g); g.connect(out); s.start(t0 + tp * dur); }
  // 3. the hybrid part: a faint electric hum and a quiet inverter tone that rises with speed, under the engine
  const hg = ac.createGain(); hg.connect(out); osc("sine", 55, hg); osc("sine", 110.6, hg); env(hg, [[0, 0], [.04, .05], [.9, .05], [1, 0]]);
  const ig = ac.createGain(); ig.connect(out); const io = osc("sine", 1, ig); sweep(io.frequency, 4300); env(ig, [[0, 0], [.1, .012], [.9, .018], [1, 0]]);
  // 4. noise: tyre squeal while it slides, then the rush past the camera
  const nb = ac.createBuffer(1, Math.ceil(ac.sampleRate * (dur + .6)), ac.sampleRate), nd = nb.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  const ns = () => { const s = ac.createBufferSource(); s.buffer = nb; s.start(t0); s.stop(t0 + dur + .6); return s; };
  const sq = ac.createBiquadFilter(), sqg = ac.createGain(); sq.type = "bandpass"; sq.Q.value = 14; sq.frequency.setValueAtTime(1500, t0); sq.frequency.linearRampToValueAtTime(2300, t0 + .5 * dur); sq.frequency.linearRampToValueAtTime(1300, t0 + .8 * dur);
  ns().connect(sq); sq.connect(sqg); sqg.connect(out); env(sqg, [[0, 0], [.12, .05], [.3, .3], [.55, .38], [.72, .16], [.86, .05], [1, 0]]);
  const rf = ac.createBiquadFilter(), rg = ac.createGain(); rf.type = "lowpass"; rf.frequency.setValueAtTime(300, t0); rf.frequency.exponentialRampToValueAtTime(5200, t0 + .95 * dur); rf.frequency.exponentialRampToValueAtTime(200, t0 + dur + .3);
  ns().connect(rf); rf.connect(rg); rg.connect(out); env(rg, [[0, 0], [.6, .03], [.9, .3], [.97, .7], [1, .25]]); rg.gain.linearRampToValueAtTime(0, t0 + dur + .5);
  // 5. the cut: a short sub thump
  const tg = ac.createGain(); tg.connect(out); const to = ac.createOscillator(); to.frequency.setValueAtTime(120, t0 + dur * .975); to.frequency.exponentialRampToValueAtTime(38, t0 + dur + .25); to.connect(tg); to.start(t0 + dur * .975); to.stop(t0 + dur + .5);
  tg.gain.setValueAtTime(0, t0); tg.gain.setValueAtTime(.9, t0 + dur * .975); tg.gain.exponentialRampToValueAtTime(.001, t0 + dur + .45);
  return () => { try { out.gain.cancelScheduledValues(ac.currentTime); out.gain.linearRampToValueAtTime(0, ac.currentTime + .08); } catch (e) {} };
}

// KING_REALSND (King, Nov 24: "find real sounds from online"): the reveal plays a mix of real recordings (CC0, Freesound: a drift-car
// pull + slide, V8 Supercar straight-cut whine + fly-by, a tyre squeal), cut to the car's moves: brand/reveal-sound.mp3. Decoded once and
// cached; if it can't load in time the synthesized sound plays instead. Credits in brand/CREDITS.md.
let _recBuf = null, _recP = null;
function loadRecorded(ac) { if (_recBuf) return Promise.resolve(_recBuf); if (!_recP) _recP = fetch("brand/reveal-sound.mp3?v=1").then((r) => r.arrayBuffer()).then((b) => new Promise((ok, no) => ac.decodeAudioData(b, ok, no))).then((buf) => (_recBuf = buf)).catch(() => null); return _recP; }
function playRecorded(ac, dur, vol = 1) { let src = null, stop = null, dead = false; const g = ac.createGain(); g.gain.value = 0.95 * vol; g.connect(ac.destination);
  const t0 = ac.currentTime;
  const go = (buf) => { if (dead) return; if (!buf) { stop = revealSound(ac, dur, vol); return; } const late = ac.currentTime - t0; if (late > 0.35) { stop = revealSound(ac, dur, vol); return; }
    src = ac.createBufferSource(); src.buffer = buf; src.playbackRate.value = Math.max(0.85, Math.min(1.15, buf.duration > 0.5 ? (buf.duration - 0.6) / Math.max(1, dur) : 1)); src.connect(g); src.start(ac.currentTime, late); };
  if (_recBuf) go(_recBuf); else loadRecorded(ac).then(go);
  return () => { dead = true; try { if (stop) stop(); if (src) { g.gain.cancelScheduledValues(ac.currentTime); g.gain.linearRampToValueAtTime(0, ac.currentTime + 0.08); src.stop(ac.currentTime + 0.1); } } catch (e) {} }; }
try { const _w = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(2, 48000, 48000); setTimeout(() => loadRecorded(_w), 1500); } catch (e) {}   // warm the cache
// KING_LOGOREVEAL player: colour+matte stacked video -> WebGL, tyre lines on a canvas, logo wiped in behind the car.
async function mountReveal(stage, {src, track, onEnd}) {
  const T = typeof track === "string" ? await (await fetch(track)).json() : track, FR = T.frames, N = FR.length;
  stage.innerHTML = '<canvas class="rv-lines"></canvas><div class="rv-logo"><span class="kmark">K</span><span class="kword">KAIROS</span></div><canvas class="rv-gl"></canvas>';
  const lines = stage.querySelector(".rv-lines"), gl_c = stage.querySelector(".rv-gl"), logo = stage.querySelector(".rv-logo");
  const v = document.createElement("video"); v.muted = true; v.playsInline = true; v.setAttribute("playsinline", ""); v.preload = "auto"; v.src = src;
  const gl = gl_c.getContext("webgl", {premultipliedAlpha: true, alpha: true}); let ok = !!gl, prog, tex;
  if (ok) {
    const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); return o; };
    prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, "attribute vec2 p;varying vec2 u;void main(){u=p*.5+.5;gl_Position=vec4(p,0.,1.);}"));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, "precision mediump float;varying vec2 u;uniform sampler2D t;void main(){vec3 c=texture2D(t,vec2(u.x,1.-(1.-u.y)*.5)).rgb;float a=smoothstep(.07,.93,texture2D(t,vec2(u.x,.5-(1.-u.y)*.5)).r);gl_FragColor=vec4(c*a,a);}"));
    gl.linkProgram(prog); gl.useProgram(prog);
    const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const l = gl.getAttribLocation(prog, "p"); gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, 2, gl.FLOAT, false, 0, 0);
    tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    for (const k of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T]) gl.texParameteri(gl.TEXTURE_2D, k, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  }
  let W = 0, H = 0, reveal = 0, done = false, raf = 0, sw0 = null, sw1 = null, cur = [0, 0];
  const size = () => { const r = stage.getBoundingClientRect(), d = Math.min(2, devicePixelRatio || 1); W = r.width; H = r.height; for (const c of [lines, gl_c]) { c.width = Math.round(W * d); c.height = Math.round(H * d); } if (ok) gl.viewport(0, 0, gl_c.width, gl_c.height); };
  size(); const ro = new ResizeObserver(size); ro.observe(stage);
  // the clip is 16:9 and is fitted to the stage width, sitting on the stage's vertical centre
  const map = (p) => { const h = W * 9 / 16, y0 = (H - h) / 2; return [p[0] * W, y0 + p[1] * h]; };
  const fit = () => { const h = W * 9 / 16; gl_c.style.cssText = `position:absolute;left:0;width:100%;height:${h}px;top:${(H - h) / 2}px`; };
  const draw = () => {
    const f = Math.min(N - 1, Math.max(0, Math.round(v.currentTime * T.fps))); fit();
    if (ok && v.readyState >= 2) { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, v); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); }
    const c = lines.getContext("2d"), d = lines.width / W; c.setTransform(d, 0, 0, d, 0, 0); c.clearRect(0, 0, W, H);
    c.strokeStyle = (getComputedStyle(stage).getPropertyValue("--rv-line") || "").trim() || "#000"; c.lineCap = "round"; c.lineJoin = "round"; const KW = T.k || 1.667;
    if (!T.marks3d) for (const k of ["wRL", "wRR"]) { let prev = null; for (let i = 0; i <= f; i++) { const q = FR[i][k]; if (!(q[2] > 1.6) || Math.abs(q[0]) > 1.3) { prev = null; continue; } const [x, y] = map(q); if (prev) { c.lineWidth = Math.max(1, W * KW * .30 / q[2]); c.beginPath(); c.moveTo(prev[0], prev[1]); c.lineTo(x, y); c.stroke(); } prev = [x, y]; } }
    // logo: sits behind the clip and fades in as the car reaches the middle; the car and its smoke pass in front of it.
    const F_IN = T.logoIn || [46, 70]; logo.style.opacity = Math.max(0, Math.min(1, (f - F_IN[0]) / (F_IN[1] - F_IN[0])));
  };
  const loop = () => { if (done) return; draw(); raf = requestAnimationFrame(loop); };
  const end = () => { if (done) return; done = true; cancelAnimationFrame(raf); gl_c.style.opacity = 0; logo.style.opacity = 1; logo.classList.add("rv-land"); onEnd && onEnd(); };
  v.addEventListener("ended", end); v.addEventListener("error", end);
  let stopSnd = null; return { play(snd, from) { if (stopSnd) stopSnd(); stopSnd = null; from = from || 0;
      const go = () => { try { v.currentTime = from; } catch (e) {} if (snd && !from) { try { const ac = snd.resume ? snd : (this._ac || (this._ac = new (window.AudioContext || window.webkitAudioContext)())); ac.resume(); stopSnd = playRecorded(ac, isFinite(v.duration) && v.duration ? v.duration : N / T.fps, typeof snd === "number" ? snd : 1); } catch (e) {} }
        done = false; gl_c.style.opacity = 1; logo.classList.remove("rv-land"); logo.style.opacity = 0; const p = v.play(); if (p) p.catch(end); loop(); };
      if (v.readyState >= 1) go(); else { v.addEventListener("loadedmetadata", go, { once: true }); v.load(); } }, destroy() { done = true; ro.disconnect(); v.pause(); } };
}

  let trackP = null;
  window.kReveal = async function (host, o) { o = o || {};
    const st = document.createElement("div"); st.className = "rv-stage" + (o.cls ? " " + o.cls : ""); host.appendChild(st);
    try { trackP = trackP || fetch("brand/reveal-track.json").then((r) => r.json()); const T = await trackP;
      const big = (st.getBoundingClientRect().width || innerWidth) * Math.min(2, devicePixelRatio || 1) > 1500;   // KING_CARHD: the 2560x1440 render on big screens, the light one elsewhere
      const R = await mountReveal(st, { src: big ? "brand/reveal-stack-hd.mp4" : "brand/reveal-stack.mp4", track: T, onEnd: o.onEnd }); R.el = st; R.play(o.sound, o.from); return R;
    } catch (e) { st.innerHTML = '<div class="rv-logo rv-land" style="opacity:1"><span class="kmark">K</span><span class="kword">KAIROS</span></div>'; o.onEnd && o.onEnd(); return { el: st, play() {}, destroy() {} }; } };
  window.kRevealSound = revealSound;
})();
