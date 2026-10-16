'use strict';
const $=id=>document.getElementById(id);
let payload=null,displayUnits=null,pollTimer=null,busy=false,connectionError=null;
try{displayUnits=localStorage.getItem('endurance.display.volumeUnits');}catch{}
function el(tag,text,className){const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(className)node.className=className;return node;}
function render(){
  if(!payload)return;
  const view=EnduranceView.build(payload,displayUnits,Date.now(),!!connectionError);
  $('units').value=view.units;
  $('summary').className=`summary tone-${view.tone}`;
  $('summary-title').textContent=view.title;$('summary-message').textContent=view.message;
  $('coverage').textContent=view.coverage;$('mode').hidden=!view.preview;
  $('updated').textContent=view.timestamp?`Updated ${new Date(view.timestamp).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',second:'2-digit'})}`:'Not yet updated';
  $('notification-note').textContent=view.preview?'Preview · notifications off':view.notifications?'Visual notifications enabled':'Notifications off';
  $('attention').hidden=!view.alerts.length;$('attention-list').replaceChildren(...view.alerts.map(a=>el('li',`${a.name}: ${a.message}`)));
  const open=new Set([...$('resources').querySelectorAll('details[open]')].map(d=>d.dataset.resource));
  const cards=view.cards.map(c=>{
    const article=el('article',undefined,`resource${c.disabled?' disabled':''}`);article.setAttribute('aria-label',c.name);
    const heading=el('div',undefined,'card-heading');heading.append(el('h3',c.name),el('span',c.badge,`badge ${c.tone}`));article.append(heading);
    const metric=el('div',c.metric.value,'metric');if(c.metric.unit)metric.append(el('span',c.metric.unit,'unit'));article.append(metric,el('p',c.label,'metric-label'));
    if(c.facts.length){const dl=el('dl',undefined,'facts');for(const f of c.facts){const div=el('div',undefined,'fact');div.append(el('dt',f.label),el('dd',f.value));dl.append(div);}article.append(dl);}
    if(c.note)article.append(el('p',c.note,'card-note'));
    if(c.tanks.length>1){const details=el('details');details.dataset.resource=c.key;details.open=open.has(c.key);details.append(el('summary',`${c.tanks.length} tanks`));const ul=el('ul',undefined,'tank-list');for(const t of c.tanks){const li=el('li'),name=el('span',t.name);if(t.issue)name.append(el('span',t.issue,'tank-issue'));li.append(name,el('span',t.value,'tank-value'));ul.append(li);}details.append(ul);article.append(details);}
    return article;
  });
  $('resources').replaceChildren(...cards);
  document.body.classList.toggle('disconnected',view.expired||view.connectionLost);
  $('connection').hidden=!view.expired&&!view.connectionLost;
  if(view.connectionLost)$('connection').textContent=connectionError;
  if(view.expired)$('connection').textContent='These readings are out of date. Check that Endurance is running.';
}
async function refresh(){
  if(busy)return;busy=true;$('refresh').disabled=true;
  const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),10000);
  try{
    const response=await fetch('/plugins/signalk-endurance/assessment',{credentials:'same-origin',cache:'no-store',signal:controller.signal});
    if(!response.ok)throw Error(response.status===401||response.status===403?'Sign in to Signal K to view Endurance.':`Cannot read Endurance right now (${response.status}).`);
    payload=await response.json();connectionError=null;window.EnduranceTheme?.update(payload.display);render();
    clearTimeout(pollTimer);pollTimer=setTimeout(refresh,Math.max(5000,Math.min(60000,(payload.display?.intervalSeconds||10)*1000)));
  }catch(error){
    connectionError=error.name==='AbortError'?'The server did not respond. Retrying shortly.':error.message;
    document.body.classList.add('disconnected');$('summary').className='summary tone-neutral';$('summary-title').textContent='Connection unavailable';$('summary-message').textContent='Current conditions cannot be confirmed. Any readings below are from the previous update.';$('connection').hidden=false;$('connection').textContent=connectionError;$('attention').hidden=true;
    if(payload)render();
    clearTimeout(pollTimer);pollTimer=setTimeout(refresh,10000);
  }finally{clearTimeout(timeout);busy=false;$('refresh').disabled=false;}
}
$('refresh').addEventListener('click',refresh);
$('units').addEventListener('change',()=>{displayUnits=$('units').value;try{localStorage.setItem('endurance.display.volumeUnits',displayUnits);}catch{}render();});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
refresh();
