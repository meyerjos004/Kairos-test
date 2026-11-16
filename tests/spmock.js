(()=>{const cv=(c)=>{const k=document.createElement('canvas');k.width=k.height=64;const g=k.getContext('2d');const gr=g.createLinearGradient(0,0,64,64);gr.addColorStop(0,c[0]);gr.addColorStop(1,c[1]);g.fillStyle=gr;g.fillRect(0,0,64,64);return k.toDataURL()};
const C=[['#ff4d5e','#7c3aed'],['#2bd4a0','#0a84ff'],['#ffc65c','#ff4d5e'],['#a78bfa','#2bd4a0']];
const pls=[{id:'p1',name:'Locked in — trading focus',images:[{url:cv(C[0])}],owner:{display_name:'King'}},{id:'p2',name:'Daft vibes',images:[{url:cv(C[1])}],owner:{display_name:'King'}}];
const names=[['Night Drive','Neon Era'],['Pre-market','Low Tide'],['Fair Value Gap','The Wicks'],['Open Drive','Kairos'],['Liquidity Sweep','Ben H'],['Asia Range','Will'],['NY Open','Reese']];
const tr=names.map((n,i)=>({uri:'spotify:track:'+i,name:n[0],artists:[{name:n[1]}],duration_ms:150000+i*21000,album:{images:[{url:cv(C[i%4])}]},type:'track'}));
window.REWIND=Object.assign(window.REWIND||{},{spotify:'x'}); jset('kz-sp',{at:'x',rt:'x',exp:Date.now()+9e6,sc:''});
spApi=async(p)=>{ if(p==='/me') return {display_name:'King',id:'king'}; if(p.startsWith('/me/playlists')) return {items:pls}; if(p.startsWith('/me/player')&&!p.includes('volume')&&!p.includes('shuffle')) return {is_playing:true,device:{name:'KAIROS'},item:tr[3]}; if(p.includes('/playlists/')) return {items:tr.map(t=>({track:t}))}; return null; };
spPlayer=async()=>null; spMe=spPls=null; spReqMine={status:'added'};
prefs.media.show=true; prefs.media.tab='sp'; prefs.media.w=460; prefs.media.h=720; mediaUI(); setTimeout(()=>{spOpenPl('p1'); spNow();},300);
})()
