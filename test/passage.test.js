'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { normalize } = require('../lib/config');
const { adaptRoute, assessPassage, routeId, createRouteReader } = require('../lib/passage');
const now = Date.parse('2026-10-31T12:00:00Z');
const iso = hours => new Date(now + hours * 3600000).toISOString();
const raw = () => ({ name: 'Test passage', feature: { properties: { source: 'signalk-weather-router-plus', total_time_s: 7200, sailing_time_s: 3600, motoring_time_s: 3600, departure: iso(0), arrival: iso(2) } } });
const route = () => adaptRoute(raw(), 'test');
const supply = (rate=.00001) => ({ status:'OK', totals:{complete:true,capacityM3:1,currentVolumeM3:.8}, consumptionRate:rate });
const leaf = value => ({value,timestamp:iso(0),$source:'fixture'});
const app = (points, hours=3) => ({getSelfPath:p=>({
  'electrical.energy.prediction.forecast.hourly':leaf(points),
  'electrical.energy.prediction.weather.validTo':leaf(iso(hours)),
  'electrical.energy.prediction.weather.source':leaf('fixture')
})[p]});
const points = [0,1,2].map(h=>({time:iso(h),detectedSoC:.9,idealSoC:1}));
const measured = {status:'OK',input:{value:.9}};
const assess = (resources, provider=app(points)) => assessPassage(route(),resources,normalize(),provider,now);
test('route adapter accepts verified WR properties only; validates numeric profiles',()=>{
  assert.equal(route().motoringSeconds,3600);
  for(const value of [null,'7200',NaN,Infinity,-1]){const r=raw();r.feature.properties.total_time_s=value;assert.equal(adaptRoute(r,'x').status,'UNKNOWN');}
  const r=raw();r.feature.properties.source='routeiq';assert.equal(adaptRoute(r,'x').reason,'UNSUPPORTED_ROUTE');
  r.feature.properties.source='signalk-weather-router-plus';r.feature.properties.motoring_time_s=10000;assert.equal(adaptRoute(r,'x').reason,'INVALID_PROFILE');
});
test('fuel uses engine hours, water uses full duration, reserves apply before sufficiency',()=>{
  const r=assess({fuel:supply(),freshwater:supply()});
  assert.equal(r.resources.fuel.requiredM3,.036000000000000004);
  assert.equal(r.resources.freshwater.requiredM3,.07200000000000001);
  assert.equal(r.status,'SUFFICIENT');
  assert.equal(assess({fuel:supply(.001)}).status,'SHORTFALL');
  const water=supply();water.totals.currentVolumeM3=.3;assert.equal(assess({freshwater:water}).status,'SHORTFALL');
});
test('missing and partial supplies never imply coverage; disabled resources excluded',()=>{
  const fuel=supply();fuel.totals.complete=false;
  assert.equal(assess({fuel}).status,'UNKNOWN');
  assert.equal(assess({}).status,'UNKNOWN');
  assert.equal(assess({propane:supply(null)}).status,'UNKNOWN');
  assert.equal(assess({fuel:supply(),propane:supply(null)}).status,'UNKNOWN');
  const r=route();r.motoringSeconds=0;
  assert.equal(assessPassage(r,{fuel:supply(null)},normalize(),app(points),now).status,'SUFFICIENT');
});
test('energy compares lowest detected SOC, never final SOC or ideal track alone',()=>{
  const p=structuredClone(points);p[1].detectedSoC=.6;
  assert.equal(assess({energy:measured},app(p)).status,'SHORTFALL');
  assert.equal(assess({energy:{status:'UNKNOWN'}},app(p)).resources.energy.reason,'MEASURED_SOC_UNAVAILABLE');
  assert.equal(assess({energy:{status:'OK',input:{value:.6}}}).status,'SHORTFALL');
});
test('Energy Predictor in-process Dates and serialized ISO times produce the same outlook',()=>{
  const native=points.map(p=>({...p,time:new Date(p.time)}));
  assert.deepEqual(assess({energy:measured},app(native)),assess({energy:measured},app(points)));
  native[1].detectedSoC=.6;
  assert.equal(assess({energy:measured},app(native)).resources.energy.reason,'FORECAST_RESERVE_CROSSING');
  for(const time of [new Date(NaN),null,now,{},'not-a-date']){
    assert.equal(assess({energy:measured},app([{time,detectedSoC:.9}])).resources.energy.reason,'INVALID_FORECAST');
  }
});
test('explicit passage planning fuel rate works while stopped without changing live resources',()=>{
  const config=normalize({passage:{fuelLitresPerHour:1.8}});
  const fuel=supply(null);fuel.engineTime=null;
  const original=structuredClone(fuel);
  const r=route();r.durationSeconds=146637.2;r.motoringSeconds=1295.5;r.sailingSeconds=145341.6;r.arrival=iso(41);
  const result=assessPassage(r,{fuel,freshwater:supply(.000001)},config,app(points),now);
  assert.equal(result.resources.fuel.reason,'PROFILE_AT_PLANNING_RATE');
  assert.equal(result.resources.fuel.rateBasis,'PLANNING_ESTIMATE');
  assert.equal(result.resources.fuel.rateSource,'configured-passage-estimate');
  assert.equal(result.resources.fuel.litresPerHour,1.8);
  assert(Math.abs(result.resources.fuel.requiredM3-.00064775)<1e-12);
  assert.equal(result.resources.fuel.status,'SUFFICIENT');
  assert.equal(result.resources.freshwater.reason,'PROFILE_AT_CURRENT_RATE');
  assert.deepEqual(fuel,original);
  assert.equal(assessPassage(r,{fuel},normalize(),app(points),now).resources.fuel.reason,'CONSUMPTION_UNAVAILABLE');
  const live=supply(.001);
  assert.equal(assessPassage(r,{fuel:live},normalize(),app(points),now).resources.fuel.rateBasis,'LIVE_SOURCE');
  assert.equal(assessPassage(r,{fuel:live},normalize(),app(points),now).resources.fuel.status,'SHORTFALL');
  const missing=supply(null);missing.totals.complete=false;
  assert.equal(assessPassage(r,{fuel:missing},config,app(points),now).resources.fuel.reason,'INCOMPLETE_SUPPLY');
  fuel.totals.currentVolumeM3=.2;
  assert.equal(assessPassage(r,{fuel},config,app(points),now).resources.fuel.status,'SHORTFALL');
});
test('full-duration engine allowance changes only fuel demand, preserving upstream plan and reserves',()=>{
  const config=normalize({passage:{fuelLitresPerHour:1.8}});
  const r=route();r.durationSeconds=146637.2;r.motoringSeconds=1295.5;r.sailingSeconds=145341.6;r.arrival=iso(41);
  const original=structuredClone(r);
  const resources={fuel:supply(null),freshwater:supply(.000001),energy:measured};
  const standard=assessPassage(r,resources,config,app(points),now);
  const full=assessPassage(r,resources,config,app(points),now,{fuelBasis:'full-duration'});
  assert(Math.abs(full.resources.fuel.requiredM3-.0733186)<1e-12);
  assert.equal(full.resources.fuel.fuelDemandSeconds,146637.2);
  assert.equal(full.resources.fuel.fuelDurationBasis,'FULL_PLANNED_DURATION');
  assert.equal(standard.resources.fuel.fuelDurationBasis,'UPSTREAM_MOTORING');
  assert.deepEqual(full.resources.freshwater,standard.resources.freshwater);
  assert.deepEqual(full.resources.energy,standard.resources.energy);
  assert.deepEqual(r,original);
  assert.deepEqual(full.route,original);
  const limited=supply(null);limited.totals.currentVolumeM3=.35;
  assert.equal(assessPassage(r,{fuel:limited},config,app(points),now).resources.fuel.status,'SUFFICIENT');
  assert.equal(assessPassage(r,{fuel:limited},config,app(points),now,{fuelBasis:'full-duration'}).resources.fuel.status,'SHORTFALL');
  assert.equal(assessPassage(r,{fuel:supply(null)},normalize(),app(points),now,{fuelBasis:'full-duration'}).resources.fuel.reason,'CONSUMPTION_UNAVAILABLE');
  r.motoringSeconds=0;r.sailingSeconds=r.durationSeconds;
  assert.equal(assessPassage(r,{fuel:supply(null)},config,app(points),now).resources.fuel.requiredM3,0);
  assert(assessPassage(r,{fuel:supply(null)},config,app(points),now,{fuelBasis:'full-duration'}).resources.fuel.requiredM3>0);
});
test('Passage Brief setting supplies planning fallback until a positive live rate is available',()=>{
 const config=normalize();const fuel=supply(null);
 const scenario={passageBriefFuel:{litresPerHour:1.8,fetchedAt:iso(0)}};
 const get=(c=config,s=scenario)=>assessPassage(route(),{fuel},c,app(points),now,s).resources.fuel;
 assert.equal(get().rateBasis,'PASSAGE_BRIEF_SETTING');
 assert.equal(get().litresPerHour,1.8);
 assert.equal(get().rateSource,'passage-brief-viewer-setting');
 assert(Math.abs(get().requiredM3-.0018)<1e-12);
 fuel.consumptionRate=0;assert.equal(get().rateBasis,'PASSAGE_BRIEF_SETTING');
 fuel.consumptionRate=.000001;assert.equal(get().rateBasis,'LIVE_SOURCE');
 assert(Math.abs(get().litresPerHour-3.6)<1e-12);
 assert.equal(get(normalize({passage:{fuelLitresPerHour:2.2}})).rateBasis,'PLANNING_ESTIMATE');
 fuel.consumptionRate=null;fuel.consumption={valid:false,state:'STALE'};
 assert.equal(get().rateBasis,'PASSAGE_BRIEF_SETTING');
 for(const pb of [{litresPerHour:1.8,fetchedAt:new Date(now-90001).toISOString()},{litresPerHour:1.8,fetchedAt:iso(1)},{litresPerHour:'1.8',fetchedAt:iso(0)},{litresPerHour:0,fetchedAt:iso(0)},{litresPerHour:1.8,fetchedAt:'invalid'}])assert.equal(get(config,{passageBriefFuel:pb}).reason,'CONSUMPTION_UNAVAILABLE');
 assert.equal(get(config,{}).reason,'CONSUMPTION_UNAVAILABLE');
});
test('forecast horizon, expiry, gaps, nulls and invalid stamps remain explicit',()=>{
  const r=assess({energy:measured},app(points,1));assert.equal(r.status,'PROVISIONAL');assert.equal(r.resources.energy.uncoveredSeconds,3600);
  assert.equal(assess({energy:measured}).resources.energy.reason,'ROUTE_LOADS_UNVERIFIED');
  assert.equal(assess({energy:measured},{getSelfPath:()=>undefined}).status,'UNKNOWN');
  assert.equal(assess({energy:measured},app([null])).status,'UNKNOWN');
  assert.equal(assess({energy:measured},app([{time:iso(0),detectedSoC:null}])).status,'UNKNOWN');
  const stale=app(points);const read=stale.getSelfPath;stale.getSelfPath=p=>({...read(p),timestamp:iso(-3)});assert.equal(assess({energy:measured},stale).status,'UNKNOWN');
  const r2=route();r2.departure=iso(4);assert.equal(assessPassage(r2,{energy:measured},normalize(),app(points),now).status,'UNKNOWN');
});
test('reassessment uses changed supplies and rejects past routes without inventing progress',()=>{
  assert.equal(assess({fuel:supply()}).status,'SUFFICIENT');
  assert.equal(assess({fuel:supply(.01)}).status,'SHORTFALL');
  assert.equal(assessPassage(route(),{},normalize(),app(points),now+3*3600000).reason,'ROUTE_ENDED_OR_UNDATED');
});
test('route reader isolates provider errors and active-route changes; reset ignores late results',async()=>{
  let id='a', resolve;
  const provider={getSelfPath:()=>leaf('/resources/routes/'+id),resourcesApi:{getResource:async()=>raw()}};
  assert.equal(routeId(provider,''),'a');
  const reader=createRouteReader(provider);await reader.refresh({routeId:''});assert.equal(reader.current({routeId:''}).status,'AVAILABLE');
  id='b';assert.equal(reader.current({routeId:''}).status,'UNKNOWN');
  provider.resourcesApi.getResource=async()=>{throw Error('offline');};await reader.refresh({routeId:''});assert.equal(reader.current({routeId:''}).reason,'ROUTE_READ_FAILED');
  provider.resourcesApi.getResource=()=>new Promise(r=>{resolve=r;});const pending=reader.refresh({routeId:''});await new Promise(r=>setImmediate(r));reader.reset();resolve(raw());await pending;assert.equal(reader.current({routeId:''}).status,'UNKNOWN');
});
test('passage configuration is opt-in and validated',()=>{
  assert.equal(normalize().passage.enabled,false);
  assert.equal(normalize().passage.fuelLitresPerHour,0);
  for(const fuelLitresPerHour of [null,'1.8',-1,NaN,Infinity])assert.throws(()=>normalize({passage:{fuelLitresPerHour}}));
  for(const passage of [{enabled:'yes'},{routeId:'../../other'}])assert.throws(()=>normalize({passage}));
});
test('individual tank reserves cannot be hidden by aggregate volume',()=>{
  const fuel=supply();fuel.assessmentMode='individual';fuel.tanks=[{levelRatio:.2},{levelRatio:.9}];
  assert.equal(assess({fuel}).resources.fuel.reason,'INDIVIDUAL_TANK_RESERVE');
});
test('installed plugin publishes separate passage object and clears it when disabled',async()=>{
  const create=require('..');const messages=[];let handler;
  const provider={getSelfPath:p=>p==='navigation.course.activeRoute'?leaf('test'):undefined,
    resourcesApi:{getResource:async()=>raw()},handleMessage:(_id,m)=>messages.push(m),
    setPluginStatus:()=>{},setPluginError:message=>{throw Error(message);}};
  const plugin=create(provider);
  plugin.registerWithRouter({get:(path,fn)=>{if(path==='/assessment')handler=fn;}});
  const options={passage:{enabled:true},resources:Object.fromEntries(['energy','freshwater','fuel','propane','holding'].map(k=>[k,{enabled:false}]))};
  try {
    plugin.start(options);await new Promise(resolve=>setImmediate(resolve));
    let result;handler({}, {json:r=>{result=r;}});
    assert.equal(result.assessment.passage.status,'UNKNOWN');
    assert.equal(result.assessment.action,'NONE');
    assert(messages.flatMap(m=>m.updates.flatMap(u=>u.values||[])).some(v=>v.path==='environment.endurancePreview.passage'));
    plugin.start({...options,passage:{enabled:false}});
    handler({}, {json:r=>{result=r;}});assert.equal(result.assessment.passage,undefined);
    assert(messages.flatMap(m=>m.updates.flatMap(u=>u.values||[])).some(v=>v.path==='environment.endurancePreview.passage'&&v.value===null));
  } finally { plugin.stop(); }
});

test('active route accepts canonical href wrappers',()=>{
  for(const value of [{value:{href:'/resources/routes/test'}},{href:{value:'/signalk/v1/api/resources/routes/test'}}]) {
    assert.equal(routeId({getSelfPath:()=>value},''),'test');
  }
  assert.equal(routeId({getSelfPath:()=>({value:null})},''),null);
  assert.equal(routeId({getSelfPath:()=>({value:{href:'https://example.com/not-a-route'}})},''),null);
});
test('Course API selects Freeboard route when data-model path is absent',async()=>{
  let activeRoute={href:'/resources/routes/from-freeboard'};
  const ids=[];
  const provider={getSelfPath:()=>undefined,getCourse:async()=>({activeRoute}),resourcesApi:{getResource:async(type,id)=>{ids.push(id);return raw();}}};
  const reader=createRouteReader(provider);
  await reader.refresh({routeId:''});
  assert.equal(reader.current({routeId:''}).id,'from-freeboard');
  assert.equal(reader.current({routeId:''}).status,'AVAILABLE');
  activeRoute=null;await reader.refresh({routeId:''});
  assert.equal(reader.current({routeId:''}).reason,'NO_SELECTED_ROUTE');
  assert.equal(ids.length,1);
});
test('Course API takes precedence over stale paths; explicit selection bypasses Course API',async()=>{
  const provider={getSelfPath:()=>leaf('/resources/routes/stale'),getCourse:async()=>({activeRoute:null}),resourcesApi:{getResource:async()=>raw()}};
  const reader=createRouteReader(provider);await reader.refresh({routeId:''});assert.equal(reader.current({routeId:''}).reason,'NO_SELECTED_ROUTE');
  provider.getCourse=async()=>{throw Error('unavailable');};
  await reader.refresh({routeId:'explicit'});assert.equal(reader.current({routeId:'explicit'}).status,'AVAILABLE');
  await reader.refresh({routeId:''});assert.equal(reader.current({routeId:''}).reason,'ROUTE_READ_FAILED');
});
test('Course API route switch during resource retrieval discards old result',async()=>{
  let id='a';
  const provider={getSelfPath:()=>undefined,getCourse:async()=>({activeRoute:{href:'/resources/routes/'+id}}),resourcesApi:{getResource:async()=>{id='b';return raw();}}};
  const reader=createRouteReader(provider);await reader.refresh({routeId:''});assert.equal(reader.current({routeId:''}).reason,'ROUTE_CHANGED');
});
