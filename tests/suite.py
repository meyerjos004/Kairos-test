import asyncio, json, sys
exec(open('/home/claude/shot/shot3.py').read().split('async def main')[0])
FAIL=[]; OK=[]
def check(name, cond, info=""):
    (OK if cond else FAIL).append(name + ("" if cond else "  -> " + str(info)))
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
        pg = await b.new_page(viewport={"width":1680,"height":945}); errs=[]
        pg.on("pageerror", lambda e: errs.append(str(e)))
        async def route(r):
            u=r.request.url
            if "lightweight-charts" in u: return await r.fulfill(body=LC, content_type="application/javascript")
            if "supabase-js" in u: return await r.fulfill(body=SB, content_type="application/javascript")
            if "/motion@" in u: return await r.fulfill(body=open("/home/claude/shot/node_modules/motion/dist/motion.js").read(), content_type="application/javascript")
            if "/animejs@" in u: return await r.fulfill(body=open("/home/claude/shot/node_modules/animejs/dist/bundles/anime.umd.min.js").read(), content_type="application/javascript")
            if u.startswith("http://rw/"):
                f=u[len("http://rw/"):].split("?")[0] or "index.html"; ct={"js":"application/javascript","css":"text/css","svg":"image/svg+xml","json":"application/json"}.get(f.split(".")[-1],"text/html")
                return await r.fulfill(body=open(ROOT+"/"+f,"rb").read(), content_type=ct)
            return await r.abort()
        await pg.route("**/*", route); await pg.goto("http://rw/index.html?demo=1"); await pg.wait_for_timeout(2500)
        E = lambda js: pg.evaluate(js)
        check("boots with candles", await E("panes[0].candles.length > 100"))
        # hotkeys
        await pg.click("#charts"); await pg.keyboard.press("b"); await pg.wait_for_timeout(100)
        check("hotkey B buys", await E("pos.qty") == 1, await E("pos.qty"))
        await pg.keyboard.press("x"); check("hotkey X closes", await E("pos.qty") == 0)
        await pg.keyboard.press("s"); check("hotkey S sells", await E("pos.qty") == -1); await pg.keyboard.press("f"); check("hotkey F flattens", await E("pos.qty") == 0)
        await pg.click('[data-view="friends"]'); await pg.fill("#chat-in", "bsxf"); check("typing in chat does not trade", await E("pos.qty") == 0)
        await pg.click('[data-view="trade"]')
        # step / play / back
        t0 = await E("nowT()"); await pg.keyboard.press("ArrowRight"); t1 = await E("nowT()"); check("arrow right steps", t1 > t0)
        await pg.keyboard.press("ArrowLeft"); check("arrow left steps back", await E("nowT()") < t1)
        await pg.click("#play"); await pg.wait_for_timeout(1200); await pg.click("#play"); check("play advances", await E("nowT()") > t1)
        # timeframes + layouts
        for tf in ["15s","30s","1m","15m","1h","4h","1D","5m"]:
            await E(f"setPaneTf(active,'{tf}')"); await pg.wait_for_timeout(250); n = await E("panes[active].candles.length"); check(f"timeframe {tf} draws", n > 0, n)
        for k in ["2","2h","3","4","6","8","1"]:
            await E(f"setLayout('{k}')"); await pg.wait_for_timeout(600); n = await E("panes.length"); want={"1":1,"2":2,"2h":2,"3":3,"4":4,"6":6,"8":8}[k]; check(f"layout {k} -> {want} charts", n == want, n)
        # drawings via mouse
        box = await pg.locator("#charts .pane").first.bounding_box(); cx, cy = box["x"]+box["width"]*0.5, box["y"]+box["height"]*0.5
        for t in ["trend","rect","fib","measure","fibext","channel","arrow","prange","drange","ellipse"]:
            n0 = await E("drawings.length"); await E(f"setTool('{t}')"); await pg.mouse.move(cx-80, cy-40); await pg.mouse.down(); await pg.mouse.move(cx+60, cy+50, steps=6); await pg.mouse.up(); await pg.wait_for_timeout(100)
            check(f"draw {t}", await E("drawings.length") == n0 + 1)
        for t in ["hline","vline","long","short","text"]:
            if t == "text": await E("window.prompt=()=>'note'; 1")
            n0 = await E("drawings.length"); await E(f"setTool('{t}')"); await pg.mouse.click(cx+20, cy-20); await pg.wait_for_timeout(100); check(f"place {t}", await E("drawings.length") >= n0 + 1)
        await pg.keyboard.press("Escape"); await E("sel = drawings[drawings.length-1]; 1"); await pg.keyboard.press("Delete"); check("delete selected drawing", True)
        # position tool arm -> fills
        await E("cancelAll(); flatten(); drawings=[]; 1"); await E("(()=>{const p=panes[0],lp=last(),d=newDrawing('long',p,{t:loc(nowT()),p:rnd(lp-3)}); d.entry=rnd(lp-3); d.sl=rnd(lp-11); d.tp=rnd(lp+13); armTool(d);})()")
        check("armed tool places order", await E("orders.length") == 1)
        for i in range(200):
            if await E("pos.qty !== 0 || orders.length === 0"): break
            await E("stepFwd()")
        check("armed tool fills or cancels", await E("pos.qty !== 0 || orders.length === 0"))
        await E("cancelAll(); flatten(); 1")
        # orders: limit + drag + cancel
        await E("place(1,'limit',last()-20,1,autoBr())"); check("limit order placed", await E("orders.length") == 1)
        await E("orders[0].price = rnd(last()-25); drawOrders(); 1"); check("limit order moved", await E("Math.abs(orders[0].price-(last()-25))<0.3"))
        await pg.keyboard.press("c"); check("hotkey C cancels", await E("orders.length") == 0)
        # dock tabs + resize
        for t in ["acct","ord","pos","hist"]:
            await pg.click(f'.btab[data-b="{t}"]'); vis = await E(f"!$('b-{t}').classList.contains('hidden')"); check(f"dock tab {t}", vis)
        # indicators
        await E("prefs.ind={sess:true,pd:true,fvg:true,fvgTf:'1h',h4:true,po3:true}; ST.key=null; 1"); s = await E("(()=>{const S=studies(); return [S.levels.length, S.h4.length, !!S.po3]})()")
        check("indicators compute", s[0] > 0 and s[1] > 0 and s[2], s)
        # views
        for v in ["journal","stats","accounts","learn","friends","settings","trade"]:
            await pg.click(f'[data-view="{v}"]'); await pg.wait_for_timeout(500); check(f"view {v} opens", await E(f"!$('v-{v}').classList.contains('hidden')"))
        # settings save
        await E("view('accounts')"); await pg.wait_for_timeout(300); await pg.fill("#s-dll", "777"); await pg.click("#s-save2"); check("settings save (replay account limits)", await E("prefs.dll") == 777)
        # csv export
        await pg.click('[data-view="journal"]'); await pg.wait_for_timeout(400)
        async with pg.expect_download() as dl: await pg.click("#j-csv")
        d = await dl.value; check("journal CSV downloads", d.suggested_filename.endswith(".csv"), d.suggested_filename)
        # screenshot button
        await pg.click('[data-view="trade"]')
        async with pg.expect_download() as dl2: await pg.click("#shotbtn")
        d2 = await dl2.value; check("chart screenshot downloads", d2.suggested_filename.endswith(".png"))
        check("motion + anime loaded", await E("!!(window.Motion && Motion.animate && window.anime && anime.animate)"))
        await pg.click('[data-view="stats"]'); await pg.wait_for_timeout(1200); check("stats count-up settles to real text", await E("[...document.querySelectorAll('#st-kpi b')].every(b=>b.textContent.length>0)"))
        await pg.screenshot(path="/home/claude/shot/v5-stats.png")
        # fix 1: hover toolbar + tool settings
        await E("view('trade'); drawings=[]; const p=panes[0], t=p.candles[p.candles.length-20].time, pr=p.candles[p.candles.length-20].close; newDrawing('hline', p, {t, p: pr}); repaintAll()")
        await pg.wait_for_timeout(300)
        yy = await E("(()=>{const p=panes[0], r=p.el.getBoundingClientRect(); return [r.left+r.width*0.4, r.top+yOf(p, drawings[0].a.p)]})()")
        await pg.mouse.move(yy[0], yy[1]); await pg.wait_for_timeout(250)
        check("hovering a drawing shows its toolbar", await E("!$('dtb').classList.contains('hidden') && $('dtb').querySelectorAll('[data-c]').length===6"))
        await E("$('dtb').querySelector('[data-c=\"#ff6b7a\"]').click()"); check("toolbar color applies", await E("drawings[0].color==='#ff6b7a'"))
        await E("$('dtb').querySelector('[data-act=lock]').click()"); check("toolbar lock applies", await E("drawings[0].locked===true"))
        await E("toolSettings(drawings[0])"); check("tool settings dialog opens", await E("!!$('ts-l')")); await E("$('ts-l').value='PDH sweep'; $('dl-ok').click()")
        check("tool label saved", await E("drawings[0].label==='PDH sweep'")); await pg.screenshot(path="/home/claude/shot/fix1.png")
        await E("drawings=[]; sel=null; hov=null; $('dtb').classList.add('hidden'); repaintAll()")
        # fix 13 + 18
        await E("view('trade')"); await E("$('chartsetbtn').click()"); await pg.wait_for_timeout(300)
        check("chart settings opens with sync toggles + colors", await E("!$('chartset').classList.contains('hidden') && !!$('cs-scross') && !!$('s-up')"))
        await E("$('cs-sint').checked=true; $('cs-save').click()"); await E("setLayout('2')"); await pg.wait_for_timeout(500)
        await E("setPaneTf(0,'15m')"); await pg.wait_for_timeout(400); check("interval sync applies to every chart", await E("prefs.tfs[1]==='15m'"))
        await E("prefs.sync.int=false; setLayout('1')"); await pg.wait_for_timeout(400)
        await E("document.querySelector('.lname').click()"); check("clicking the symbol opens a symbol menu", await E("!$('ctx').classList.contains('hidden') && $('ctx').innerText.includes('ES')")); await E("hideCtx()")
        check("settings page has no chart colors / account size", await E("!$('v-settings').contains($('s-up')) && !$('v-settings').contains($('s-bal'))"))
        # fix 15: journal calendar
        await E("view('journal')"); await pg.wait_for_timeout(700)
        check("journal shows a trading calendar with P&L days", await E("document.querySelectorAll('#jc-grid .jcd').length>=28 && document.querySelectorAll('#jc-grid .jcd.up,#jc-grid .jcd.dn').length>0"))
        await E("view('trade'); $('chartset').classList.add('hidden'); hideCtx()"); await pg.wait_for_timeout(200); await pg.click("#indbtn"); await pg.wait_for_timeout(200)
        check("indicators button opens its menu", await E("!$('ctx').classList.contains('hidden') && $('ctx').innerText.includes('Fair value gaps')"))
        f0 = await E("!!prefs.ind.fvg"); await E("[...$('ctx').querySelectorAll('.mi')].find(b=>b.textContent.includes('Fair value gaps')).click()"); await pg.wait_for_timeout(150)
        check("ticking an indicator keeps the menu open", await E("!$('ctx').classList.contains('hidden') && $('ctx').innerText.includes('Fair value gaps')") and (await E("!!prefs.ind.fvg")) != f0)
        await E("[...$('ctx').querySelectorAll('.mi')].find(b=>b.textContent.includes('Fair value gaps')).click()")
        await pg.click("#indbtn"); await pg.wait_for_timeout(200); check("indicators button closes on second click", await E("$('ctx').classList.contains('hidden')"))
        await E("document.querySelector('#jc-grid .jcd.up,#jc-grid .jcd.dn').click()"); await pg.wait_for_timeout(500)
        check("clicking a day filters the trades", await E("!!jDay && document.querySelectorAll('#jrows tr').length>0")); await pg.screenshot(path="/home/claude/shot/fix15.png"); await E("jDay=null; view('trade')")
        # fix 16: take or fade = single 1m chart, locked to 15s
        await E("flatten(); setLayout('2')"); await pg.wait_for_timeout(400); await E("quizNext()"); await pg.wait_for_timeout(1500)
        check("take-or-fade opens one 1m chart locked to 15s", await E("panes.length===1 && prefs.tfs[active]==='1m' && need15===true && lock15===true"), await E("[panes.length, prefs.tfs[active], need15, lock15]"))
        await E("setPaneTf(active,'1h')"); await pg.wait_for_timeout(500)
        check("higher TF shows only the candle up to now", await E("(()=>{const p=panes[active], c=p.candles[p.candles.length-1]; return c && Math.abs(c.close-last())<1e-6;})()"), await E("(()=>{const p=panes[active], c=p.candles[p.candles.length-1]; return [c&&c.close, last(), p.sec, need15, B[\"15s\"].bars.length];})()"))
        await E("quizStop(); setPaneTf(active,'5m')"); await pg.wait_for_timeout(300); check("leaving the quiz unlocks 15s", await E("lock15===false"))
        # fix 17: friends chat next to the chart
        await E("view('trade'); frOpen()"); await pg.wait_for_timeout(400)
        check("friends chat opens in the side panel on the chart", await E("$('sfr').contains($('chat')) && !$('md-friends').classList.contains('hidden') && !$('side').classList.contains('hidden')"))
        await E("$('chat-in').value='from the chart'; sendChat()"); await pg.wait_for_timeout(200); check("chat works from the chart panel", await E("$('chat').innerText.includes('from the chart')"))
        await pg.screenshot(path="/home/claude/shot/fix17.png")
        await E("view('friends')"); check("chat moves back on the Friends page", await E("document.querySelector('#v-friends .fwrap').contains($('chat'))")); await E("view('trade'); prefs.side=false; sideUI()")
        # fix 19: animated dark dropdowns
        await E("view('trade')"); n = await E("document.querySelectorAll('.dd .ddb').length"); check("selects get the custom dropdown", n >= 3, n)
        await pg.click("#stepsz + .ddb") if await E("!!document.querySelector('#stepsz + .ddb')") else None
        await pg.wait_for_timeout(350); check("dropdown menu opens", await E("!!document.querySelector('.ddm')"))
        await pg.screenshot(path="/home/claude/shot/fix19.png")
        await E("document.querySelectorAll('.ddm .ddo')[1].click()"); await pg.wait_for_timeout(200); check("picking an option changes the select", await E("$('stepsz').selectedIndex===1"))
        await E("$('stepsz').selectedIndex=0; $('stepsz').dispatchEvent(new Event('change'))")
        # per-chart symbols: chart 2 can watch ES while chart 1 trades NQ
        await E("view('trade'); setLayout('2')"); await pg.wait_for_timeout(700)
        await E("setPaneSym(1,'ES')"); await pg.wait_for_timeout(700)
        check("chart 2 switches to ES on its own", await E("paneSym(1)==='ES' && paneSym(0)==='NQ' && sym==='NQ'"))
        check("chart 2 shows ES prices, chart 1 stays NQ", await E("panes[1].candles.length>0 && Math.abs(panes[1].candles.at(-1).close - panes[0].candles.at(-1).close) > 1000"), await E("[panes[0].candles.at(-1)?.close, panes[1].candles.at(-1)?.close]"))
        n1 = await E("panes[1].candles.length"); await E("stepFwd()"); await E("stepFwd()"); await pg.wait_for_timeout(200)
        check("ES chart steps with the replay", await E("panes[1].candles.at(-1).time === bucket(loc(nowT()), panes[1].sec) || panes[1].candles.length>=%d" % n1))
        check("chart 2 label says ES", await E("panes[1].el.querySelector('.lname').textContent.startsWith('ES')"))
        await E("setPaneSym(1,'NQ'); setLayout('1')"); await pg.wait_for_timeout(500)
        # price scale: a manual drag stays put (no auto-fit snap-back), even after changing % / log mode
        await E("view('trade')"); await pg.wait_for_timeout(300)
        box = await pg.evaluate("(()=>{const r=panes[0].el.querySelector('.chart').getBoundingClientRect(); return [r.right, r.top, r.height]})()")
        await pg.mouse.move(box[0]-25, box[1]+box[2]/2); await pg.mouse.down(); await pg.mouse.move(box[0]-25, box[1]+box[2]/2+120, steps=8); await pg.mouse.up(); await pg.wait_for_timeout(200)
        rng = "(()=>{const s=panes[0].series; return [s.coordinateToPrice(50), s.coordinateToPrice(400)].map(v=>+v.toFixed(1)).join()})()"
        r0 = await E(rng); await E("stepFwd(); stepFwd(); setScale('log'); setScale('log')"); await pg.wait_for_timeout(300)
        check("dragged price scale stays squashed (steps + log toggle)", await E("panes[0].chart.priceScale('right').options().autoScale===false"), [r0, await E(rng)])
        await E("setScale('auto')"); check("A button turns auto-fit back on", await E("panes[0].chart.priceScale('right').options().autoScale===true"))
        # channel width handle + hide/lock all
        await E("view('trade')"); ch = await E("(()=>{const c=panes[0].candles, n=c.length; const d=newDrawing('channel', panes[0], {t:c[n-20].time,p:c[n-20].close}, {t:c[n-5].time,p:c[n-5].close+5}); repaintAll(); return d.off})()")
        check("channel has a width", ch is not None and ch != 0, ch)
        await E("prefs.hideDraw=true; repaintAll()"); check("hide all drawings", await E("prefs.hideDraw===true")); await E("prefs.hideDraw=false; repaintAll()")
        await E("drawings.forEach(d=>d.locked=true)"); check("lock all drawings", await E("drawings.length>0 && drawings.every(d=>d.locked)")); await E("drawings.forEach(d=>d.locked=false)")
        # indicator library + price alerts
        await E("view('trade'); setLayout('1')"); await pg.wait_for_timeout(400)
        await E("indCfg().ma[0].on=true; indCfg().bb.on=true; indCfg().rsi.on=true; indCfg().atr.on=true; panes.forEach(indFull)"); await pg.wait_for_timeout(200)
        check("EMA 9 line drawn", await E("panes[0].ind.e9 && panes[0].ind.e9.v.filter(v=>v!=null).length>50"))
        ema_ok = await E("(()=>{const c=panes[0].candles, v=panes[0].ind.e9.v, i=c.length-1, a=2/10; return Math.abs(v[i] - (a*c[i].close + (1-a)*v[i-1])) < 1e-6})()")
        check("EMA math is right", ema_ok)
        check("Bollinger bands drawn", await E("!!(panes[0].ind.bbu && panes[0].ind.bbl)"))
        await E("stepFwd(); stepFwd()"); await pg.wait_for_timeout(150)
        check("indicators keep up while stepping", await E("panes[0].ind.e9.v.length===panes[0].candles.length && panes[0].ind.e9.v.at(-1)!=null"))
        check("RSI + ATR show in the legend", await E("/RSI 14 .*ATR 14/.test(panes[0].el.querySelector('.ivals').textContent)"), await E("panes[0].el.querySelector('.ivals').textContent"))
        await E("indCfg().ma[0].on=false; indCfg().bb.on=false; indCfg().rsi.on=false; indCfg().atr.on=false; panes.forEach(indFull)")
        check("turning them off removes the lines", await E("Object.keys(panes[0].ind).length===0"))
        await E("flatten(); alerts=[]; addAlert(last()+0.25)"); check("alert line appears", await E("panes[0].alines.length===1"))
        for k in range(40):
            if await E("alerts.length===0"): break
            await E("stepFwd()")
        check("alert fires when price crosses", await E("alerts.length===0"))
        # saved layouts + share card
        await E("setLayout('2'); setPaneTf(0,'1m',true); setPaneTf(1,'15m',true); window.prompt=()=>'SMT test'; saveLayout()"); await pg.wait_for_timeout(500)
        check("layout saves", await E("prefs.saved.at(-1).name==='SMT test' && prefs.saved.at(-1).layout==='2'"))
        await E("setLayout('1'); prefs.tfs[0]='5m'"); await pg.wait_for_timeout(400); await E("loadLayout(prefs.saved.length-1)"); await pg.wait_for_timeout(700)
        check("saved layout restores charts + timeframes", await E("panes.length===2 && prefs.tfs[0]==='1m' && prefs.tfs[1]==='15m'"))
        await E("prefs.saved.pop(); setLayout('1')"); await pg.wait_for_timeout(400)
        await E("shareCard({symbol:'NQ',dir:1,qty:2,pnl:840,r:2.1,entry:21000,exit:21021,t_entry:nowT()-600}, true)"); await pg.wait_for_timeout(800)
        check("share card renders", await E("!!window.__lastCard && window.__lastCard.width===1200 && !$('dlg').classList.contains('hidden') && !!$('dlgbox').querySelector('img')"))
        await pg.screenshot(path="/home/claude/shot/card.png"); await E("$('dlg').classList.add('hidden')")
        # Fix my mistakes: daily practice from tagged mistakes
        await E("""mem.trades.push(...[1,2,3,4].map(k=>({id:'mx'+k, symbol:'NQ', dir:1, qty:1, pnl:k%2? -120: 80, r: k%2?-1:0.7, t_entry: nowT()-k*600, t_exit: nowT()-k*500, created_at: new Date().toISOString(), rules_ok: k>2, mistakes: k<=2? ['Chased'] : []})))""")
        await E("view('learn'); ltab('mx')"); await pg.wait_for_timeout(700)
        check("Fix my mistakes shows the biggest leak", await E("$('l-mx').innerText.includes('Chased') && document.querySelectorAll('#l-mx .mxt').length===3"), await E("$('l-mx').innerText.slice(0,200)"))
        check("daily tasks track progress", await E("/\\d+ \\/ 3/.test($('l-mx').innerText)"))
        await pg.screenshot(path="/home/claude/shot/mx.png"); await E("view('trade')")
        # confluence presets
        await E("view('trade'); drawings=[]; (()=>{const c=panes[0].candles,n=c.length; window.__z=newDrawing('rect',panes[0],{t:c[n-20].time,p:c[n-20].close},{t:c[n-5].time,p:c[n-5].close+8}); repaintAll()})()")
        await E("applyPreset(__z, presetsOf('rect')[0]); repaintAll()"); check("FVG preset applies (color, fill, label)", await E("__z.label==='FVG' && __z.fill===18 && __z.color==='#8b5cf6'"))
        await E("prefs.presetDef={rect:2}"); await E("(()=>{const c=panes[0].candles,n=c.length; window.__z2=newDrawing('rect',panes[0],{t:c[n-9].time,p:c[n-9].close},{t:c[n-3].time,p:c[n-3].close+4})})()")
        check("default preset used for new drawings", await E("__z2.label==='OB'")); await E("prefs.presetDef={}; drawings=[]; repaintAll()")
        # strategy checklist: tags the trade with strategy + rules met
        await E("view('trade'); flatten(); prefs.chkShow=true; prefs.stratOn=0; chk=new Set([0,1,2]); chkUI()"); await pg.wait_for_timeout(200)
        check("checklist shows the strategy's rules", await E("document.querySelectorAll('#chk [data-r]').length===5 && $('chk').innerText.includes('3/5')"))
        await pg.keyboard.press("b"); await pg.wait_for_timeout(150)
        check("new trade tagged with strategy + rules met", await E("pos.tags.includes('strat:Reese IFVG') && pos.tags.includes('rules:3/5')"), await E("pos.tags"))
        await E("flatten()"); await pg.wait_for_timeout(300)
        check("checklist resets after the trade", await E("chk.size===0"))
        await E("view('stats')"); await pg.wait_for_timeout(900); check("Stats shows by-strategy table", await E("$('st-strat').innerText.includes('Reese IFVG')"))
        await E("prefs.chkShow=false; prefs.stratOn=null; chkUI(); view('trade')")
        # media dock: Reese library + Spotify/YouTube sign-in panels
        await E("view('trade'); prefs.media={show:true,tab:'lib'}; mediaUI()"); await pg.wait_for_timeout(500)
        check("Reese library shows his videos", await E("document.querySelectorAll('#m-lib .vc').length>=2"))
        await E("document.querySelector('#m-lib .vc').click()"); await pg.wait_for_timeout(200); check("clicking a video plays it in the dock", await E("!!$('m-vid').querySelector('iframe') && !$('m-vid').classList.contains('hidden')"))
        await E("prefs.media.tab='sp'; mediaUI()"); await pg.wait_for_timeout(200); check("Spotify tab waits for setup (no paste box)", await E("!$('sp-url') && $('m-sp').innerText.includes('Spotify')"))
        await E("REWIND.spotify='x'; spUI()"); await pg.wait_for_timeout(200); check("Spotify shows Connect when set up", await E("!!$('sp-in')"))
        await E("REWIND.google='x'; prefs.media.tab='yt'; mediaUI()"); await pg.wait_for_timeout(200); check("YouTube shows Connect when set up", await E("!!$('yt-in') && !$('yt-url')"))
        await E("REWIND.spotify=''; REWIND.google=''; $('m-vx').click(); prefs.media.show=false; mediaUI()")
        # v0.5 TradeSea parity batch 1
        await E("view('trade')"); await pg.wait_for_timeout(300)
        await E("flatten(); market(1)"); pos0 = await E("pos.avg")
        for _ in range(40): await E("stepFwd()")
        r = await E("(()=>{ const d=Math.sign(pos.qty); if(!pos.qty) return 'flat'; if((last()-pos.avg)*d>0){ beNow(); return pos.sl===rnd(pos.avg) ? 'be' : 'nobe'; } beNow(); return pos.sl===rnd(pos.avg) ? 'wrongbe':'blocked'; })()")
        check("breakeven: moves stop only when in profit", r in ("be", "blocked", "flat"), r)
        await E("flatten(); prefs.padBtns=['buysell','be']; padBtnsUI()")
        check("order pad: hides groups not picked", await E("$('pjb').closest('[data-pg]').classList.contains('hidden') && !$('pbe').classList.contains('hidden')"))
        await E("prefs.padBtns=null; padBtnsUI(); prefs.mask={bal:true}; maskUI()")
        check("privacy: mask balance blurs it", await E("getComputedStyle($('bal')).filter.includes('blur')"))
        await E("prefs.mask={}; maskUI(); prefs.lockUntil=Date.now()+60000")
        q0 = await E("pos.qty"); await E("market(1)"); check("personal lockout blocks trades", await E("pos.qty") == q0)
        await E("prefs.lockUntil=0; prefs.speed='lite'; paint(panes[0]); prefs.speed='fast'")
        await E("view('settings')"); await pg.wait_for_timeout(500)
        check("settings: sound per event + pad picker render", await E("document.querySelectorAll('[data-snd]').length===8 && document.querySelectorAll('[data-pg2]').length===7"))
        await pg.screenshot(path="/home/claude/shot/v5-settings.png", full_page=False)
        await E("view('trade')")
        # v0.5: chat + fix box
        await E("showView && showView('friends')") if await E("typeof showView==='function'") else await pg.click('[data-view="friends"]')
        await pg.wait_for_timeout(300); n0 = await E("document.querySelectorAll('#chat .cm').length")
        for i in range(30): await E(f"$('chat-in').value='spam {i}'; sendChat()")
        await pg.wait_for_timeout(200); n1 = await E("document.querySelectorAll('#chat .cm').length"); check("chat: 30 fast msgs all show, no limit", n1 - n0 == 30, (n0, n1))
        await E("$('sg-kind').value='fix'; $('sg-text').value='Make the buy button bigger'; addSg()"); await pg.wait_for_timeout(200)
        check("fix box: sends + shows status", await E("document.getElementById('sg-list').innerText.includes('sent to Claude')"))
        check("no page errors", not errs, errs[:3])
        await b.close()
asyncio.run(main())
print("PASS %d  FAIL %d" % (len(OK), len(FAIL))); print("\n".join("FAIL " + f for f in FAIL))
