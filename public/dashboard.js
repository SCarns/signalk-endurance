'use strict';
const $=id=>document.getElementById(id);
let selectedPassage='',passageGeneration=0,routesLoadedAt=0;
const routeTiming=new Map();
let passageFuelBasis='route-profile';
try{const saved=EndurancePassageSelection.read(localStorage);selectedPassage=saved.routeId==='@active'?'':saved.routeId;passageFuelBasis=saved.fuelBasis;}catch{}
$('passage-fuel-basis').value=passageFuelBasis;
$('passage-fuel-note').hidden=passageFuelBasis==='route-profile';
let payload=null,displayUnits=null,pollTimer=null,busy=false,connectionError=null;
let reserveCards=[];
const readReserve=EnduranceReserve.createReader((url,options)=>fetch(url,options));
const passageBriefFuel=EndurancePassageFuel.createReader((url,options)=>fetch(url,options));
try{displayUnits=localStorage.getItem('endurance.display.volumeUnits');}catch{}
function el(tag,text,className){const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(className)node.className=className;return node;}
const viewNavigation=$('view-navigation');
const viewButtons=viewNavigation.querySelectorAll('button[aria-controls]');
const resourcesButton=viewNavigation.querySelector('[aria-controls="resources-view"]');
const passageButtons=[...viewButtons].filter(button=>button!==resourcesButton);
function showView(selected){
  for(const button of viewButtons){
    const active=button===selected;
    button.setAttribute('aria-pressed',String(active));
    $(button.getAttribute('aria-controls')).hidden=!active;
  }
}
for(const button of viewButtons)button.addEventListener('click',()=>showView(button));

function updatePassageNavigation(){
  const available=payload?.display?.passageEnabled===true;
  for(const button of passageButtons){
    if(!available&&button.getAttribute('aria-pressed')==='true'){
      const panel=$(button.getAttribute('aria-controls'));
      const restoreFocus=button===document.activeElement||panel.contains(document.activeElement);
      showView(resourcesButton);
      if(restoreFocus)resourcesButton.focus();
    }
    button.hidden=!available;
  }
}

function render(){
  if(!payload)return;
  const view=EnduranceView.build(payload,displayUnits,Date.now(),!!connectionError);
  updatePassageNavigation();
  renderActive(view);
  if(view.expired||view.connectionLost){passageGeneration++;$('passage-result').hidden=false;$('passage-result').replaceChildren(el('p','Passage information is out of date. Waiting for a fresh resource assessment.'));}
  $('units').value=view.units;
  $('summary').className=`summary tone-${view.tone}`;
  $('summary-title').textContent=view.title;$('summary-message').textContent=view.message;
  $('coverage').textContent=view.coverage;$('mode').hidden=!view.preview;
  $('updated').textContent=view.timestamp?`Updated ${new Date(view.timestamp).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',second:'2-digit'})}`:'Not yet updated';
  $('notification-note').textContent=view.preview?'Preview · notifications off':view.notifications?'Visual notifications enabled':'Notifications off';
  $('attention').hidden=!view.alerts.length;$('attention-list').replaceChildren(...view.alerts.map(a=>el('li',`${a.name}: ${a.message}`)));
  const open=new Set([...$('resources').querySelectorAll('details[open]')].map(d=>d.dataset.resource));
  const cards=[...view.cards,...(view.running&&!view.expired&&!view.connectionLost?reserveCards:[])].map(c=>{
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
    payload=await response.json();connectionError=null;
    void readReserve().then(cards=>{reserveCards=cards;render();});window.EnduranceTheme?.update(payload.display);render();
    if(payload.running&&payload.display?.passageEnabled&&!EnduranceView.build(payload,displayUnits).expired)void refreshPassage();
    clearTimeout(pollTimer);pollTimer=setTimeout(refresh,Math.max(5000,Math.min(60000,(payload.display?.intervalSeconds||10)*1000)));
  }catch(error){
    connectionError=error.name==='AbortError'?'The server did not respond. Retrying shortly.':error.message;
    document.body.classList.add('disconnected');$('summary').className='summary tone-neutral';$('summary-title').textContent='Connection unavailable';$('summary-message').textContent='Current conditions cannot be confirmed. Any readings below are from the previous update.';$('connection').hidden=false;$('connection').textContent=connectionError;$('attention').hidden=true;
    if(payload)render();
    clearTimeout(pollTimer);pollTimer=setTimeout(refresh,10000);
  }finally{clearTimeout(timeout);busy=false;$('refresh').disabled=false;}
}
$('refresh').addEventListener('click',refresh);
$('units').addEventListener('change',()=>{displayUnits=$('units').value;try{localStorage.setItem('endurance.display.volumeUnits',displayUnits);}catch{}render();if(payload?.display?.passageEnabled)void refreshPassage();});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
refresh();

async function passageFetch(path){
  const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),10000);
  try{const response=await fetch('/plugins/signalk-endurance'+path,{credentials:'same-origin',cache:'no-store',signal:controller.signal});const data=await response.json();if(!response.ok)throw Error(data.error||'Passage information unavailable.');return data;}
  finally{clearTimeout(timeout);}
}
async function loadRoutes(){
  $('passage-routes-refresh').disabled=true;
  try{
    const data=await passageFetch('/passage/routes');
    routesLoadedAt=Date.now();
    const routes=data.routes.filter(route=>!route.active);
    const empty=el('option','Choose a saved route…');empty.value='';
    const options=[empty];
    for(const route of routes){
      const option=el('option',route.name+(typeof route.distanceM==='number'?' · '+(route.distanceM/1852).toFixed(1)+' nm':'')+(route.profileAvailable?'':' · enter trip hours'));
      option.value=route.id;options.push(option);
    }
    if(selectedPassage&&!routes.some(route=>route.id===selectedPassage)){
      const missing=el('option','Previously selected route · unavailable');missing.value=selectedPassage;options.push(missing);
    }
    $('passage-route').replaceChildren(...options);$('passage-route').value=selectedPassage;
    $('passage-route-note').textContent=routes.length?'Leave trip hours blank to use saved timing. Engine hours use the saved split when available and otherwise assume full motoring.':'No saved routes found. Save or publish a route in Signal K first.';
  }catch(error){routesLoadedAt=Date.now();$('passage-route-note').textContent=error.message;}
  finally{$('passage-routes-refresh').disabled=false;}
}
function selectedTiming(){
  if(!routeTiming.has(selectedPassage)){
    let timing={};
    try{timing=EndurancePassageSelection.readTiming(localStorage,selectedPassage);}catch{}
    routeTiming.set(selectedPassage,timing);
  }
  return routeTiming.get(selectedPassage);
}

async function refreshPassage(){
  const token=++passageGeneration;
  if(!$('passage-route').dataset.loaded){$('passage-route').dataset.loaded='true';await loadRoutes();}
  if(Date.now()-routesLoadedAt>60000)await loadRoutes();
  if(token!==passageGeneration)return;
  if(!selectedPassage){$('passage-result').hidden=true;$('passage-result').replaceChildren();return;}
  try{
    const pbFuel=await passageBriefFuel.read();
    if(token!==passageGeneration)return;
    const p=await passageFetch(EndurancePassageSelection.query(selectedPassage,passageFuelBasis,pbFuel,selectedTiming()));
    if(token!==passageGeneration)return;
    const wording=EndurancePassageSelection.summary(p);
    const result=$('passage-result');result.hidden=false;
    if(p.estimateAvailable!==true){
      result.replaceChildren(el('p','Enter trip hours to estimate resources for this route. Engine hours are optional.'));
      return;
    }
    const view=EndurancePassageView.build(p,$('units').value);
    const summary=el('article',undefined,`summary passage-summary tone-${view.tone}`);
    summary.setAttribute('aria-label','Passage summary');
    const copy=el('div',undefined,'summary-copy');
    copy.append(el('p',p.route?.name||'THIS PASSAGE','eyebrow'),el('h3',wording.title),el('p',wording.message));
    if(p.route?.durationSeconds!==undefined){
      const motor=passageFuelBasis==='route-profile'?p.route.motoringSeconds:p.route.durationSeconds;
      copy.append(el('p',`${(p.route.durationSeconds/3600).toFixed(1)} hours total · ${(motor/3600).toFixed(1)} engine hours`));
      copy.append(el('p',`Departure ${new Date(p.route.departure).toLocaleString()} · ${p.route.timingBasis==='manual'?'Entered timing':'Saved route timing'}`));
    }
    summary.append(copy);
    result.replaceChildren(summary,passageCards(view));
    result.append(el('p','Planning uses the full trip and current supplies.','card-note'));
  }catch(error){if(token===passageGeneration){$('passage-result').hidden=false;$('passage-result').replaceChildren(el('p',error.message));}}
}
function passageCards(view,active=false){
  const grid=el('div',undefined,'resources passage-resources');grid.setAttribute('aria-label','Passage resource outlook');
    for(const c of view.cards){
      const card=el('article',undefined,'resource');card.setAttribute('aria-label',`Passage ${c.name}`);
      const heading=el('div',undefined,'card-heading');heading.append(el('h3',c.name),el('span',c.badge,`badge ${c.tone}`));
      const metric=el('div',c.metric.value,'metric');if(c.metric.unit)metric.append(el('span',c.metric.unit,'unit'));
      const label=active&&c.key!=='energy'?c.label.replace('Planned','Remaining'):c.label;
      card.append(heading,metric,el('p',label,'metric-label'));
      if(c.facts.length){const dl=el('dl',undefined,'facts');for(const f of c.facts){const fact=el('div',undefined,'fact');fact.append(el('dt',f.label),el('dd',f.value));dl.append(fact);}card.append(dl);}
      card.append(el('p',c.note,'card-note'));grid.append(card);
    }
  return grid;
}

function renderActive(view){
  const estimate=payload.activePassage;
  const result=$('active-passage-result');
  const stale=view.expired||view.connectionLost||!view.running||
    (estimate?.assessedAt&&Date.now()-Date.parse(estimate.assessedAt)>Math.max(15000,(payload.display?.intervalSeconds||10)*2000));
  const states={
    NO_ACTIVE_ROUTE:'Activate a route in Signal K to monitor the passage.',
    COURSE_CHANGED:'Course changed. Waiting for the next assessment.',
    ROUTE_GEOMETRY_UNAVAILABLE:'Remaining route distance is unavailable. Check the active route and next waypoint.',
    PROGRESS_UNAVAILABLE:'Waiting for fresh position and steady progress toward the next waypoint.',
    ACTIVE_PASSAGE_UNAVAILABLE:'Active course information is unavailable.'
  };
  if(stale||!estimate?.arrival){
    result.replaceChildren(el('p',stale?'Waiting for a fresh active-passage assessment.':states[estimate?.reason]||'Waiting for the first active-passage assessment.'));
  }else{
    const volume=(amount,signed=false)=>{
      const v=EnduranceView.volume(Math.abs(amount??NaN),view.units);
      return v?`${signed&&amount!==0?(amount<0?'−':'+'):''}${v.value} ${v.unit}`:'Unavailable';
    };
    const activeView=EndurancePassageView.build(estimate,view.units);
    const summary=el('article',undefined,`summary passage-summary tone-${activeView.tone}`);
    const copy=el('div',undefined,'summary-copy');
    copy.append(el('p',estimate.route.name,'eyebrow'),el('h3','At current pace'));
    const metrics=el('dl',undefined,'active-metrics');
    for(const [label,value] of [
      ['ETA',new Date(estimate.arrival).toLocaleString()],
      ['Fuel at arrival',volume(estimate.fuelAtArrivalM3)],
      ['Fuel margin vs. reserve',volume(estimate.fuelMarginM3,true)]
    ]){
      const fact=el('div');fact.append(el('dt',label),el('dd',value));metrics.append(fact);
    }
    const details=[`${(estimate.progressMps*3600/1852).toFixed(1)} kn toward next waypoint`,
      `${(estimate.distanceM/1852).toFixed(1)} nm remaining`,`waypoint ${estimate.nextWaypoint} of ${estimate.waypointCount}`];
    if(Number.isFinite(estimate.rpm))details.push(`${Math.round(estimate.rpm)} RPM`);
    if(Number.isFinite(estimate.burnM3PerSecond))details.push(`${volume(estimate.burnM3PerSecond*3600)}/h`);
    copy.append(metrics,el('p',details.join(' · ')),el('p','Fuel projection assumes continuous motoring at the current burn rate.'));
    if(estimate.fuelAtArrivalM3===null)copy.append(el('p','Fuel projection needs a fresh burn rate and complete fuel tank readings.'));
    summary.append(copy);
    result.replaceChildren(summary,passageCards(activeView,true));
  }
  $('active-publication-mode').textContent=payload.display?.preview?'Preview paths':'Live paths';
  const rows=[];
  for(const {path,value} of payload.activePassagePaths||[]){
    rows.push(el('dt',path),el('dd',stale||value===null?'Unavailable':String(value)+(path.endsWith('M3')?' m³':'')));
  }
  $('active-publication').replaceChildren(...rows);
}

function renderPlanInputs(){
  const timing=selectedTiming();
  $('passage-departure').value=timing?.departure||'';
  $('passage-depart-now').checked=!!timing?.departNow;
  $('passage-departure').disabled=!!timing?.departNow;
  $('passage-duration').value=timing?.duration||'';
  $('passage-motor-hours').value=timing?.motor||'';
  $('passage-motor-label').hidden=passageFuelBasis!=='route-profile';
}
$('passage-depart-now').addEventListener('change',()=>{$('passage-departure').disabled=$('passage-depart-now').checked;});
$('passage-timing').addEventListener('submit',event=>{
  event.preventDefault();
  if(!selectedPassage)return;
  routeTiming.set(selectedPassage,{
    departure:$('passage-departure').value,departNow:$('passage-depart-now').checked,
    duration:$('passage-duration').value,motor:$('passage-motor-hours').value
  });
  try{localStorage.setItem('endurance.passage.timing.'+selectedPassage,JSON.stringify(selectedTiming()));}catch{}
  void refreshPassage();
});
renderPlanInputs();
$('passage-route').addEventListener('change',()=>{selectedPassage=$('passage-route').value;renderPlanInputs();try{localStorage.setItem('endurance.passage.route',selectedPassage);}catch{}$('passage-result').hidden=true;$('passage-result').replaceChildren();void refreshPassage();});
$('passage-fuel-basis').addEventListener('change',()=>{passageFuelBasis=$('passage-fuel-basis').value;$('passage-motor-label').hidden=passageFuelBasis!=='route-profile';try{localStorage.setItem('endurance.passage.fuelBasis',passageFuelBasis);}catch{}$('passage-fuel-note').hidden=passageFuelBasis==='route-profile';$('passage-result').hidden=true;void refreshPassage();});
$('passage-routes-refresh').addEventListener('click',()=>{void loadRoutes().then(()=>refreshPassage());});
