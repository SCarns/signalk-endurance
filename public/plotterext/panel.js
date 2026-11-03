 'use strict';
const summary=document.getElementById('summary'),cards=document.getElementById('cards'),passage=document.getElementById('passage');
const reserve=EnduranceReserve.createReader((url,options)=>fetch(url,options));
const node=(tag,text)=>{const e=document.createElement(tag);e.textContent=text;return e;};
let stopped=false,timeout;
function card(c){const e=node('article','');e.className=c.tone;e.append(node('h2',c.name),node('small',c.badge),node('strong',`${c.metric.value} ${c.metric.unit}`),node('p',c.label));for(const f of c.facts)e.append(node('small',`${f.label}: ${f.value}`));if(c.note)e.append(node('small',c.note));return e;}
async function refresh(){
  try{
    const response=await fetch('/plugins/signalk-endurance/assessment',{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(5000)});
    if(!response.ok)throw Error('Assessment unavailable');
    const payload=await response.json();
    window.EnduranceTheme.update(payload.display);
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
addEventListener('pagehide',()=>{stopped=true;clearTimeout(timeout);});
void refresh();
