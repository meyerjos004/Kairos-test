/* KING_PRANK (King, Nov 18 2026): after the 1.0 intro, a fake "5-day free trial" paywall (KAIROS-branded, the layout of a familiar
   replay site's pricing page), then 5 seconds later a terminal cancels the paywall in KAIROS's own words. Shown once, with the intro. */
window.kairosPrank = function (done) {
  const ck = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5L20 7"/></svg>';
  const feats = (a) => a.map((t) => `<li>${ck}<span>${t}</span></li>`).join("");
  const el = document.createElement("div"); el.id = "kprank";
  el.innerHTML = `<div class="kp-nav"><b class="kp-logo">KAIROS</b><span>Features ▾</span><span>Resources ▾</span><span>⚔ KAIROS Battles</span><span>Pricing</span><i></i><span class="kp-pill">🇺🇸 EN</span><span>Sign in</span><button class="kp-btn">Get Started</button></div>
  <div class="kp-main"><div class="kp-trial">Your 5-day free trial has ended. Choose a plan to keep using KAIROS.</div>
  <div class="kp-toggle"><span>Monthly</span><span class="on">Yearly <em>Save up to 17%</em></span></div>
  <div class="kp-cards">
    <div class="kp-card"><span class="kp-tag">Student deal</span><h2>Interested in using KAIROS?</h2><p>Share your contact details and we'll be in touch.</p><button class="kp-dark">I'm interested</button><small>**Verified students only</small><ul>${feats(["Unlimited backtesting sessions", "Unlimited records per session"])}</ul></div>
    <div class="kp-card"><h3>Intermediate</h3><div class="kp-price">$15 <span>USD /mo</span></div><p class="kp-sub">$180 / yearly. <em>Save $36</em></p><button class="kp-dark">Start free trial</button><small>*Taxes may apply</small><ul>${feats(["10 backtesting sessions", "200 records per session"])}</ul></div>
    <div class="kp-card pro"><span class="kp-tag">✦ Best deal</span><h3>Pro</h3><div class="kp-price">$29.17 <span>USD /mo</span></div><p class="kp-sub">$350 / yearly. <em>Save $70</em></p><button class="kp-btn big">Start free trial</button><small>*Taxes may apply</small><ul class="blue">${feats(["Unlimited backtesting sessions", "Unlimited records per session"])}</ul></div>
  </div></div>
  <div class="kp-term hidden"><div class="kp-lines"></div></div>`;
  document.body.appendChild(el); requestAnimationFrame(() => el.classList.add("in"));
  // the reveal: KAIROS cancels its own paywall in a terminal, one line at a time
  const term = el.querySelector(".kp-term"), box = el.querySelector(".kp-lines");
  const LINES = [["$", "kairos billing --cancel-everything"], [">", "paywall.exe has been deleted."], [">", "no trial. no card. no catch."], [">", "this one was built for the four of us."], [">", "welcome in. the tape is waiting."]];
  const typeLine = (i) => { if (i >= LINES.length) return setTimeout(end, 2000); const [p, txt] = LINES[i], row = document.createElement("div"); row.className = "kp-tline" + (p === ">" ? " out" : "");
    row.innerHTML = `<span class="kp-who">${p === "$" ? "kairos-os:~$" : "&gt;"}</span> <span class="kp-typed"></span><span class="kp-cur">▋</span>`; box.querySelectorAll(".kp-cur").forEach((c) => c.remove()); box.appendChild(row);
    const out = row.querySelector(".kp-typed"); let k = 0; const tick = () => { out.textContent = txt.slice(0, ++k); if (k < txt.length) setTimeout(tick, p === "$" ? 45 + Math.random() * 60 : 22 + Math.random() * 25); else setTimeout(() => typeLine(i + 1), p === "$" ? 600 : 420); }; setTimeout(tick, i ? 0 : 500); };
  setTimeout(() => { term.classList.remove("hidden"); typeLine(0); }, 5000);
  const end = () => { el.classList.add("out"); setTimeout(() => { el.remove(); done && done(); }, 600); };
};
