"""KAIROS fix #4: measure how smooth 15s/30s playback is on a real PC (KING_PERF4).

Headless Chrome caps around 15 fps, so this has to run headed on jeffery with the real GPU.
Run from PowerShell on the PC:
    py -m pip install playwright ; py -m playwright install chrome
    py tools\\perf_replay.py
It opens Kairos-test in demo mode, plays each timeframe/speed combo for 15 s, and prints
frames per second, the slowest frames and long tasks. It also saves a Chrome trace for the worst run
(open it in chrome://tracing or the Performance panel). Nothing is written to any database.
"""
import asyncio, json, sys, time
from playwright.async_api import async_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else "https://meyerjos004.github.io/Kairos-test/?demo"
COMBOS = [("15s", "60"), ("15s", "120"), ("15s", "300"), ("30s", "120"), ("30s", "300"), ("1m", "300")]
SECONDS = 15

PROBE = """() => { window.__f = []; window.__lt = []; let last = performance.now();
  const loop = (t) => { window.__f.push(t - last); last = t; if (window.__on) requestAnimationFrame(loop); };
  window.__on = true; requestAnimationFrame(loop);
  try { new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__lt.push(e.duration))).observe({ type: "longtask", buffered: false }); } catch (e) {} }"""

def summary(frames, longs):
    f = sorted(frames[5:]) or [0]
    fps = 1000 / (sum(f) / len(f)) if sum(f) else 0
    p = lambda q: f[min(len(f) - 1, int(q * len(f)))]
    return {"fps": round(fps, 1), "p50_ms": round(p(.5), 1), "p95_ms": round(p(.95), 1), "worst_ms": round(f[-1], 1),
            "janky_frames_over_50ms": sum(1 for x in f if x > 50), "long_tasks": len(longs), "long_task_ms": round(sum(longs))}

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(channel="chrome", headless=False, args=["--start-maximized", "--disable-renderer-backgrounding", "--disable-background-timer-throttling", "--disable-backgrounding-occluded-windows", "--disable-features=CalculateNativeWinOcclusion"])
        ctx = await b.new_context(no_viewport=True); pg = await ctx.new_page()
        await pg.goto(URL); await pg.wait_for_timeout(9000)   # intro + data preload
        await pg.keyboard.press("Escape")
        results, worst = [], None
        for tf, sp in COMBOS:
            await pg.evaluate(f"setPaneTf(active,'{tf}')"); await pg.wait_for_timeout(800)
            await pg.evaluate(f"document.getElementById('speed').value='{sp}'; document.getElementById('speed').onchange && document.getElementById('speed').onchange()")
            await pg.evaluate(PROBE); await pg.click("#play"); t0 = time.time()
            await pg.wait_for_timeout(SECONDS * 1000)
            await pg.click("#play"); await pg.evaluate("window.__on=false")
            fr, lt = await pg.evaluate("window.__f"), await pg.evaluate("window.__lt")
            s = summary(fr, lt); s.update(tf=tf, speed=sp + "x"); results.append(s); print(json.dumps(s))
            if worst is None or s["fps"] < worst[2]["fps"]: worst = (tf, sp, s)
        tf, sp, _ = worst
        await b.close()
        b = await p.chromium.launch(channel="chrome", headless=False, args=["--start-maximized", "--disable-renderer-backgrounding", "--disable-background-timer-throttling", "--disable-backgrounding-occluded-windows", "--disable-features=CalculateNativeWinOcclusion"])
        ctx = await b.new_context(no_viewport=True); pg = await ctx.new_page()
        await pg.goto(URL); await pg.wait_for_timeout(9000); await pg.keyboard.press("Escape")
        await pg.evaluate(f"setPaneTf(active,'{tf}')"); await pg.evaluate(f"document.getElementById('speed').value='{sp}'")
        await b.start_tracing(page=pg, path=f"kairos-trace-{tf}-{sp}x.json", screenshots=True)
        await pg.click("#play"); await pg.wait_for_timeout(8000); await pg.click("#play")
        await b.stop_tracing(); await b.close()
        json.dump(results, open("kairos-perf-results.json", "w"), indent=1)
        print(f"\nWorst: {tf} at {sp}x. Trace saved to kairos-trace-{tf}-{sp}x.json; all results in kairos-perf-results.json")
        print("Smooth = fps 55+ and p95 under 25 ms. Fix #4 target: 15s/30s at 120x stays smooth.")

asyncio.run(main())
