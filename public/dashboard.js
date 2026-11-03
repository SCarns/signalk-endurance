'use strict';
const $=id=>document.getElementById(id);
let selectedPassage='',passageGeneration=0,routesLoadedAt=0,upstreamRoutes=[];
let passageFuelBasis='route-profile';
try{const saved=EndurancePassageSelection.read(localStorage);selectedPassage=saved.routeId;passageFuelBasis=saved.fuelBasis;}catch{}
$('passage-fuel-basis').value=passageFuelBasis;
$('passage-fuel-note').hidden=passageFuelBasis!=='full-duration';
let payload=null,displayUnits=null,pollTimer=null,busy=false,connectionError=null;
let reserveCards=[];
const readReserve=EnduranceReserve.createReader((url,options)=>fetch(url,options));
const passageBriefFuel=EndurancePassageFuel.createReader((url,options)=>fetch(url,options));
try{displayUnits=localStorage.getItem('endurance.display.volumeUnits');}catch{}
function el(tag,text,className){const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(className)node.className=className;return node;}
function render(){
  if(!payload)return;
  const view=EnduranceView.build(payload,displayUnits,Date.now(),!!connectionError);
  $('passage').hidden=!EnduranceView.passageVisible(payload.display?.passageEnabled,upstreamRoutes);
  if(view.expired||view.connectionLost){passageGeneration++;$('passage-result').replaceChildren(el('p','Passage information is out of date. Waiting for a fresh resource assessment.'));}
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
    if(payload.display?.passageEnabled)void refreshPassage();
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
    routesLoadedAt=Date.now();upstreamRoutes=data.routes;
    $('passage').hidden=!EnduranceView.passageVisible(payload.display?.passageEnabled,upstreamRoutes);
    if(!selectedPassage&&data.routes.some(r=>r.active))selectedPassage='@active';
    const options=[];
    if(!data.routes.some(r=>r.active)){const empty=el('option','Choose a saved route…');empty.value='';options.push(empty);}
    for(const route of data.routes){const option=el('option',route.name+(typeof route.distanceM==='number'?' · '+(route.distanceM/1852).toFixed(1)+' nm':'')+(route.profileAvailable?'':' · passage estimates unavailable'));option.value=route.id;options.push(option);}
    if(selectedPassage&&!data.routes.some(r=>r.id===selectedPassage)){const missing=el('option',selectedPassage==='@active'?'Active route · none currently active':'Previously selected route · unavailable');missing.value=selectedPassage;options.push(missing);}
    $('passage-route').replaceChildren(...options);$('passage-route').value=selectedPassage;
    $('passage-route-note').textContent=data.routes.length?'Choosing a route here does not activate it in Freeboard.':'No saved routes found. Save or publish a route in Signal K first.';
  }catch(error){upstreamRoutes=[];routesLoadedAt=Date.now();$('passage').hidden=true;}
  finally{$('passage-routes-refresh').disabled=false;}
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
    const p=await passageFetch(EndurancePassageSelection.query(selectedPassage,passageFuelBasis,pbFuel));
    if(token!==passageGeneration)return;
    const labels={UNKNOWN:'More information needed',SHORTFALL:'Projected shortfall',PROVISIONAL:'Provisional outlook',SUFFICIENT:'Monitored resources cover this passage'};
    const reasons={NO_ACTIVE_ROUTE:'No route is currently active in Signal K. Choose a saved route to plan a passage.',UNSUPPORTED_ROUTE:'This route has no supported passage profile. Publish a Weather Router Plus result to add sailing and motoring estimates.',ROUTE_ENDED_OR_UNDATED:'The route schedule has ended or is undated. Update its passage estimates.',CONSUMPTION_UNAVAILABLE:'Consumption estimate unavailable',FORECAST_HORIZON:'Passage extends beyond the energy forecast',ROUTE_LOADS_UNVERIFIED:'Route-specific electrical loads are not verified',INCOMPLETE_SUPPLY:'Supply data is incomplete',NO_FORECAST_COVERAGE:'No forecast coverage for this passage',FORECAST_UNAVAILABLE:'Energy forecast unavailable'};
    const result=$('passage-result');result.hidden=p.estimateAvailable!==true;
    if(result.hidden){result.replaceChildren();return;}
    const view=EndurancePassageView.build(p,$('units').value);
    const summary=el('article',undefined,`summary passage-summary tone-${view.tone}`);
    summary.setAttribute('aria-label','Passage summary');
    const copy=el('div',undefined,'summary-copy');
    copy.append(el('p',p.route?.name||'THIS PASSAGE','eyebrow'),el('h3',labels[p.status]||p.status),el('p',reasons[p.reason]||p.message||'Passage information unavailable.'));
    if(p.route?.durationSeconds!==undefined)copy.append(el('p',`${(p.route.durationSeconds/3600).toFixed(1)} hours total · ${(p.route.sailingSeconds/3600).toFixed(1)} sailing · ${(p.route.motoringSeconds/3600).toFixed(1)} motoring`));
    const nav=p.navigation;
    if(nav){let text=nav.following?'Following this route in Signal K':'Planning only · this route is not active in Signal K';
      if(nav.following&&nav.nextWaypointIndex!==null)text+=` · next waypoint ${nav.nextWaypointIndex+1}${nav.waypointCount?' of '+nav.waypointCount:''}${nav.reverse?' · reverse direction':''}`;
      copy.append(el('p',text));
      if(nav.vesselPosition)copy.append(el('p',`Boat position: ${nav.vesselPosition.latitude.toFixed(4)}, ${nav.vesselPosition.longitude.toFixed(4)}`));
    }
    summary.append(copy);
    const grid=el('div',undefined,'resources passage-resources');grid.setAttribute('aria-label','Passage resource outlook');
    for(const c of view.cards){
      const card=el('article',undefined,'resource');card.setAttribute('aria-label',`Passage ${c.name}`);
      const heading=el('div',undefined,'card-heading');heading.append(el('h3',c.name),el('span',c.badge,`badge ${c.tone}`));
      const metric=el('div',c.metric.value,'metric');if(c.metric.unit)metric.append(el('span',c.metric.unit,'unit'));
      card.append(heading,metric,el('p',c.label,'metric-label'));
      if(c.facts.length){const dl=el('dl',undefined,'facts');for(const f of c.facts){const fact=el('div',undefined,'fact');fact.append(el('dt',f.label),el('dd',f.value));dl.append(fact);}card.append(dl);}
      card.append(el('p',c.note,'card-note'));grid.append(card);
    }
    result.replaceChildren(summary,grid);
    result.append(el('p','Resource demand uses the full route. Waypoint position does not reduce the passage estimate.','card-note'));
  }catch(error){if(token===passageGeneration){$('passage-result').hidden=true;$('passage-result').replaceChildren();}}
}
$('passage-route').addEventListener('change',()=>{selectedPassage=$('passage-route').value;try{localStorage.setItem('endurance.passage.route',selectedPassage);}catch{}$('passage-result').hidden=true;$('passage-result').replaceChildren();void refreshPassage();});
$('passage-fuel-basis').addEventListener('change',()=>{passageFuelBasis=$('passage-fuel-basis').value;try{localStorage.setItem('endurance.passage.fuelBasis',passageFuelBasis);}catch{}$('passage-fuel-note').hidden=passageFuelBasis!=='full-duration';$('passage-result').hidden=true;void refreshPassage();});
$('passage-routes-refresh').addEventListener('click',()=>{void loadRoutes().then(()=>refreshPassage());});
