 'use strict';
const summary=document.getElementById('summary'),cards=document.getElementById('cards'),passage=document.getElementById('passage');
const dashboardLink=EnduranceDashboardLink.connect(document.getElementById('open-dashboard'),window);
const reserve=EnduranceReserve.createReader((url,options)=>fetch(url,options));
const node=(tag,text)=>{const e=document.createElement(tag);e.textContent=text;return e;};
let stopped=false,timeout,ready;
const post=msg=>parent.postMessage({bus:'plotterExt/1',msg},location.origin);
addEventListener('message',event=>{
  if(event.source!==parent||event.origin!==location.origin||event.data?.bus!=='plotterExt/1')return;
  const m=event.data.msg;
  if(m?.method==='bus.handshake'){
    clearInterval(ready);
    dashboardLink.handshake(m.params);
    if(m.params?.capabilities?.includes('nightMode')){
      post({jsonrpc:'2.0',id:'theme',method:'nightMode.get',params:{}});
      post({jsonrpc:'2.0',id:'events',method:'events.subscribe',params:{patterns:['nightMode.changed']}});
    }
  }
  dashboardLink.receive(m);
  if(m?.id==='theme'&&m.result)document.body.classList.toggle('night',m.result.enabled===true);
  if(m?.method==='nightMode.changed')document.body.classList.toggle('night',m.params?.enabled===true);
});
ready=setInterval(()=>post({jsonrpc:'2.0',method:'bus.ready',params:{}}),250);
setTimeout(()=>clearInterval(ready),10000);
function card(c){const e=node('article','');e.className=c.tone;e.append(node('h2',c.name),node('small',c.badge),node('strong',`${c.metric.value} ${c.metric.unit}`),node('p',c.label));for(const f of c.facts)e.append(node('small',`${f.label}: ${f.value}`));if(c.note)e.append(node('small',c.note));return e;}
async function refresh(){
  try{
    const response=await fetch('/plugins/signalk-endurance/assessment',{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(5000)});
    if(!response.ok)throw Error('Assessment unavailable');
    const payload=await response.json();
    if(!payload.display?.freeboardEnabled){summary.textContent='Freeboard integration is disabled.';cards.replaceChildren();passage.replaceChildren();return;}
    const v=EnduranceView.build(payload);
    summary.replaceChildren(node('h2',v.title),node('p',v.message),node('small',`${v.preview?'Preview · ':''}${v.coverage}`));
    const extra=await reserve();
    cards.replaceChildren(...[...v.cards,...(!v.expired&&v.running?extra:[])].map(card));
    passage.replaceChildren();
    if(payload.assessment?.passage&&!v.expired&&v.running){const p=payload.assessment.passage;passage.append(node('h2','Passage readiness'),node('p',p.status||'UNKNOWN'));passage.append(...EndurancePassageView.build(p,v.units).cards.map(card));}
  }catch{summary.textContent='Connection unavailable. Current conditions cannot be confirmed.';cards.replaceChildren();passage.replaceChildren();}
  finally{if(!stopped)timeout=setTimeout(refresh,10000);}
}
addEventListener('pagehide',()=>{stopped=true;dashboardLink.dispose();clearTimeout(timeout);clearInterval(ready);});
void refresh();
