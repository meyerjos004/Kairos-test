import asyncio, sys, json
import os
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # KING_JOURNAL tests: run with python3 tests/journal.py
exec(open('/home/claude/shot/shot3.py').read().split('async def main')[0])
OK=[];FAIL=[]
def check(n,c,i=""): (OK if c else FAIL).append(n+("" if c else "  -> "+str(i)))
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
        E=lambda js: pg.evaluate(js); W=lambda ms=300: pg.wait_for_timeout(ms)
        check("journal: old tab renamed Calendar", await E("document.querySelector('[data-view=journal]').title.startsWith('Calendar') && document.querySelector('#v-journal .vh').textContent==='Calendar'"))
        await pg.click('[data-view="tj"]'); await W(900)
        check("journal: new tab opens", await E("!document.getElementById('v-tj').classList.contains('hidden') && !!JN.cfg"))
        check("journal: King's Notion fields loaded", await E("['Confluences','Market Condition','Market Catalyst','Targets','Mentality','Take away'].every(n=>JN.cfg.fields.some(f=>f.n===n))"))
        check("journal: 3 book chips", await E("document.querySelectorAll('#tj-books .jbook').length")==3)
        await pg.click("#tj-new"); await W(300)
        check("journal: new trade page opens", await E("!document.getElementById('tj-page').classList.contains('hidden')"))
        await pg.fill("#tp-name","NQ Long test"); await W(700)
        await pg.fill('.tpbig input[data-f=pnl]',"450"); await pg.press('.tpbig input[data-f=pnl]',"Tab"); await pg.fill('.tpbig input[data-f=risk]',"300"); await pg.press('.tpbig input[data-f=risk]',"Tab"); await W(200)
        check("journal: R multiple computed 1.50R", "1.50R" in await E("document.querySelector('.tppins').textContent"))
        await pg.click('.tpchips[data-f=confluences]'); await W(200)
        check("journal: tag picker opens", await E("!!document.querySelector('.jpop')"))
        await pg.keyboard.type("My Setup"); await pg.keyboard.press("Enter"); await W(150)
        await pg.click('.jpop [data-o="IFVG"]'); await W(100); await pg.mouse.click(1200,60); await W(200)
        e=await E("(()=>{const e=[...JN.ent.values()].find(x=>x.data.name==='NQ Long test');return e&&{b:e.book,c:e.data.confluences,p:e.data.pnl,r:e.data.risk}})()")
        check("journal: entry saved live with tags + money", e and e['b']=="live" and e['c']==["My Setup","IFVG"] and e['p']==450 and e['r']==300, e)
        check("journal: new tag added to the field's options", await E("JN.cfg.fields.find(f=>f.k==='confluences').opts.some(o=>o.name==='My Setup')"))
        await pg.keyboard.press("Escape"); await W(300)
        check("journal: row shows in the log", await E("[...document.querySelectorAll('#tj-log tr[data-open]')].some(t=>t.textContent.includes('NQ Long test'))"))
        await E("JN.books.delete('live'); JN.render()"); check("journal: book filter hides live", not await E("[...document.querySelectorAll('#tj-log tr[data-open]')].some(t=>t.textContent.includes('NQ Long test'))"))
        await E("JN.books.add('live'); JN.render()")
        bad=await E("Object.keys(JN.groupBy ? {} : {})") ; 
        g=await E("(()=>{const out=[];for(const k of ['month','year','week','weekday','hour','account','book','symbol','side','outcome','rbucket','f:confluences','f:mentality']){try{JN.group=k;JN.render();if(!document.querySelector('#jw-breakdown table'))out.push(k)}catch(e){out.push(k+':'+e.message)}}return out})()")
        check("journal: every breakdown grouping draws", g==[], g)
        for v in ["gallery","Profit","Loss","Breakeven","all"]:
            await E(f"JN.view='{v}';JN.render()"); 
        check("journal: views switch", await E("!!document.querySelector('#tj-log table')"))
        await E("JN.edit=true;JN.render()"); n0=await E("JN.cfg.layout.find(w=>w.id==='equity').w")
        await pg.click('[data-sz=equity]'); check("journal: widget resize", await E("JN.cfg.layout.find(w=>w.id==='equity').w")!=n0)
        await pg.click('[data-hide=sides]'); check("journal: widget hide", await E("!document.querySelector('.jw[data-w=sides]')"))
        await pg.click('[data-show=sides]'); check("journal: widget show again", await E("!!document.querySelector('.jw[data-w=sides]')"))
        await E("JN.edit=false;JN.render()")
        html=await E("(async()=>JN.viewerHtml(JSON.stringify(await JN.snapshot())))()")
        vp=await b.new_page(); verr=[]; vp.on("pageerror",lambda e: verr.append(str(e))); await vp.set_content(html); await vp.wait_for_timeout(300)
        check("backup: offline viewer opens with no site", (await vp.evaluate("document.querySelectorAll('tr.r').length"))>=1 and not verr, verr)
        await vp.click("tr.r"); check("backup: viewer shows trade details", "My Setup" in await vp.evaluate("document.body.textContent")); await vp.close()
        r=await E("""(async()=>{const s=await JN.snapshot();const e=s.entries.find(x=>x.data.name==='NQ Long test');e.data.name='Restored name';e.updated_at=new Date(Date.now()+60000).toISOString();
          await JN.restoreFile(new File([JN.viewerHtml(JSON.stringify(s))],'b.html'));return [...JN.ent.values()].some(x=>x.data.name==='Restored name')})()""")
        check("backup: restore from the offline html file", r)
        m=await E("""(()=>{const map=JN.mergeSchema({"Name":{type:"title",options:[]},"Date":{type:"date",options:[]},"News":{type:"multi_select",options:[{name:"CPI",color:"blue"},{name:"ISM",color:"purple"}]},"Thesis":{type:"rich_text",options:[]},"Entry (15s,30s,1m)":{type:"url",options:[]},"Account":{type:"relation",options:[]},"Net P/L":{type:"number",options:[]},"Outcome":{type:"formula",options:[]},"Confluences":{type:"multi_select",options:[{name:"IFVG",color:"red"}]}});
          const d=JN.rowFromNotion({created:"2026-01-02T15:00:00Z",props:{"Name":"Ben trade","Date":"2026-01-02","News":["CPI"],"Thesis":"sweep then ifvg","Entry (15s,30s,1m)":"https://tradingview.com/x","Account":[{id:"a",title:"Apex 1"}],"Net P/L":-120,"Outcome":"Loss","Confluences":["IFVG"]}},map);
          return {fields:Object.values(map).map(f=>f.k),d,ifvg:JN.cfg.fields.find(f=>f.k==='confluences').opts.find(o=>o.name==='IFVG').color,acct:JN.cfg.accounts.some(a=>a.name==='Apex 1')}})()""")
        check("notion: Ben's columns become fields", "n_news" in m['fields'] and "n_thesis" in m['fields'] and "name" in m['fields'] and "pnl" in m['fields'] and "account" in m['fields'], m['fields'])
        check("notion: formulas skipped (KAIROS computes them)", "Outcome" not in json.dumps(m['d']), m['d'])
        check("notion: values mapped", m['d'].get('n_news')==["CPI"] and m['d'].get('pnl')==-120 and m['d'].get('account')=="Apex 1" and m['d'].get('name')=="Ben trade", m['d'])
        check("notion: tag colors copied", m['ifvg']=="red"); check("notion: accounts created", m['acct'])
        # two-way Notion: pull only changed pages, push edits back, backtest accounts split out of a mixed journal
        r=await E("""(async()=>{const calls=[];window.notion=async(a,x)=>{calls.push([a,x]);if(a==='jschema')return{schema:{"Name":{type:"title"},"Net P/L":{type:"number"},"Account":{type:"relation"}}};
          if(a==='jimport')return{rows:[{id:'pg1',edited:'e1',created:'2026-03-01T15:00:00Z',props:{"Name":"Mixed bt",'Net P/L':200,'Account':[{id:'x',title:'BT acct'}]}}],next_cursor:null};if(a==='jpush')return{page_id:x.page_id||'pg1'};return{}};
          JN.cfg.notion={live:{db:'db1',sync:true}};const r1=await JN.pullNotion('live');const since1=JN.cfg.notion.live.pulled;const r2=await JN.pullNotion('live');
          JN.cfg.accounts.find(a=>a.name==='BT acct').type='Backtest';JN.render();const row=JN.allRows().find(x=>x.d.name==='Mixed bt');
          return{r1,r2,since:!!since1,usedSince:calls.filter(c=>c[0]==='jimport')[1][1].since===since1,book:row&&row.book}})()""")
        check("notion sync: first pull imports", r['r1']['add']==1, r)
        check("notion sync: next pull asks only for changes", r['usedSince'] and r['r2']['add']==0, r)
        check("notion sync: Backtest-type account moves trades to Backtest journal", r['book']=="backtest", r)
        p2=await E("""(async()=>{const calls=[];window.notion=async(a,x)=>{calls.push([a,x]);return{page_id:'pg1'}};const row=JN.allRows().find(x=>x.d.name==='Mixed bt');JN.openTrade(row.id);
          document.querySelector('.tpbig input[data-f=pnl]').value='250';document.querySelector('.tpbig input[data-f=pnl]').dispatchEvent(new Event('change',{bubbles:true}));await new Promise(r=>setTimeout(r,4600));
          document.getElementById('tj-page').classList.add('hidden');return calls.filter(c=>c[0]==='jpush').map(c=>[c[1].page_id,c[1].values['Net P/L']])})()""")
        check("notion sync: editing in KAIROS updates the same Notion page", p2==[["pg1",250]], p2)
        q=await E("""(async()=>{const n0=JN.allRows().filter(r=>r.book==='backtest').length;document.getElementById('tj-page').classList.add('hidden');document.getElementById('tj-quick').click();await new Promise(r=>setTimeout(r,200));
          const ok1=!!document.querySelector('[data-qres=win]');document.querySelector('[data-qres=win]').click();await new Promise(r=>setTimeout(r,100));document.querySelector('[data-qmul=confluences][data-o=IFVG]').click();await new Promise(r=>setTimeout(r,100));
          document.getElementById('tp-next').click();await new Promise(r=>setTimeout(r,200));document.querySelector('[data-qres=loss]').click();await new Promise(r=>setTimeout(r,100));document.getElementById('tj-page').classList.add('hidden');JN.render();
          const bt=JN.allRows().filter(r=>r.book==='backtest');return{ok1,added:bt.length-n0,win:bt.some(r=>r.r===2&&(r.d.confluences||[]).includes('IFVG')),loss:bt.some(r=>r.r===-1)}})()""")
        check("quick backtest: opens with Win/Loss buttons", q['ok1'], q)
        check("quick backtest: two taps log a 2R win with a tag, 'log another' starts the next", q['added']==2 and q['win'] and q['loss'], q)
        await E("JN.applyTpl('ben')"); check("template: Ben's fields", await E("['Key take away','MTF (5m-15m)','HTF (1h-4h)','Corrections','Application'].every(n=>JN.cfg.fields.some(f=>f.n===n))"))
        await pg.click("#tj-custom"); await W(200); check("customize: opens with field list", await E("document.querySelectorAll('#dlgbox [data-fi]').length")>10)
        await pg.click('#dlgbox [data-fo]'); await W(150); check("customize: options editor with colors", await E("document.querySelectorAll('#dlgbox [data-oc]').length")>9)
        await E("document.getElementById('dlg').classList.add('hidden')")
        # KING_BOTS: helper on every page + own page, template helper from screenshots
        await E("document.getElementById('dlg').classList.add('hidden')")
        check("bots: Ask button in the sidebar", await E("!!document.getElementById('rail-ask')"))
        await pg.click("#rail-ask"); await W(300)
        check("bots: helper pop-over opens with cost note", await E("!document.getElementById('botpop').classList.contains('hidden') && document.querySelector('#botpop .bnote').textContent.includes('costs King')"))
        await pg.fill("#botpop textarea","how do I log a quick backtest?"); await pg.keyboard.press("Enter"); await W(900)
        check("bots: helper answers in the thread", await E("document.querySelectorAll('#botpop .bmsg.bot').length")>=1)
        await pg.click('#botpop [data-hp=page]'); await W(400)
        check("bots: helper has its own page with the same chat", await E("!document.getElementById('v-help').classList.contains('hidden') && document.querySelectorAll('#help-host .bmsg').length>=2"))
        await E("view('tj')"); await W(500); await pg.click("#tj-custom"); await W(200)
        await pg.click("#jc-tpl"); await W(300)
        check("bots: template helper opens from Customize", await E("!document.getElementById('tplpop').classList.contains('hidden')"))
        await pg.set_input_files("#tpl-file", files=[{"name":"j.png","mimeType":"image/png","buffer":open(ROOT+"/icon-192.png","rb").read()}]); await W(400)
        check("bots: screenshot attached", await E("document.querySelectorAll('.tplth').length")==1)
        await pg.click('#tplpop [data-bform] button'); await W(900)
        check("bots: setup helper asks a tap-to-answer question", await E("document.querySelectorAll('#tplpop [data-choice]').length")>=2)
        await pg.fill("#tplpop textarea","write me a poem"); await pg.keyboard.press("Enter"); await W(800)
        check("bots: off-topic gets the hand-off button", await E("!!document.querySelector('#tplpop [data-tohelper]')"))
        await pg.click('#tplpop [data-choice]'); await W(800)
        check("bots: template preview shows before anything changes", await E("!!document.querySelector('.tplprev') && !JN.cfg.fields.some(f=>f.n==='Pre-trade plan')"))
        await pg.click('[data-tpluse=add]'); await W(300)
        check("bots: 'Add these' adds the fields", await E("['Setup','Pre-trade plan','Review','Chart link'].every(n=>JN.cfg.fields.some(f=>f.n===n))"))
        check("bots: template tags keep colors", await E("JN.cfg.fields.find(f=>f.n==='Setup').opts.find(o=>o.name==='IFVG').color==='purple'"))
        await E("window.__pd=0; kairosPrank(()=>window.__pd=1)"); await W(400)
        check("prank: fake KAIROS pricing screen shows", await E("!!document.querySelector('#kprank .kp-card.pro') && document.querySelector('#kprank').textContent.includes('KAIROS') && !/FX ?REPLAY/i.test(document.querySelector('#kprank').textContent)"))
        await W(11800); check("prank: terminal types 'just kidding' and hands back to the app", await E("window.__pd===1 && !document.getElementById('kprank')"))
        await pg.set_viewport_size({"width":390,"height":844}); await E("JN.render()"); await W(300)
        ov=await E("document.getElementById('v-tj').scrollWidth - document.getElementById('v-tj').clientWidth")
        print(await E("[...document.querySelectorAll('#v-tj *')].filter(e=>e.getBoundingClientRect().right>392).slice(0,8).map(e=>e.tagName+'.'+e.className+'#'+e.id+' '+Math.round(e.getBoundingClientRect().right))"))
        await pg.screenshot(path="/tmp/journal-mobile.png")
        check("mobile: no sideways overflow on the page", ov<=2, ov)
        check("journal: no page errors", not errs, errs[:3])
        await b.close()
asyncio.run(main())
print("PASS",len(OK),"FAIL",len(FAIL)); print("\n".join("FAIL "+f for f in FAIL))
