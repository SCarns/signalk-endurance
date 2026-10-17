'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const {normalize}=require('../lib/config');const {discover,select}=require('../lib/discovery');const energy=require('../lib/resources/energy');
const now=Date.now();const soc='electrical.batteries.House.capacity.stateOfCharge',duration='electrical.batteries.House.capacity.timeRemaining',prediction='electrical.energy.prediction.status';
function fixture(entries){const root={};for(const [path,value,age=0] of entries){let p=root;const ks=path.split('.');for(const k of ks.slice(0,-1))p=p[k]||={};p[ks.at(-1)]={value,timestamp:new Date(now-age*1000).toISOString()};}return {getSelfPath:p=>p.split('.').reduce((o,k)=>o?.[k],root)};}
function assess(entries,options={}){const app=fixture(entries),config=normalize({resources:{energy:options}}).resources.energy;return energy(config,app,select(config,discover(app).energy),now);}
test('blank energy paths discover the standard forecast and matching House duration',()=>{const r=assess([[soc,.9],[duration,172800],[prediction,'deficit']]);assert.equal(r.status,'WATCH');assert.equal(r.time,172800);assert.equal(r.duration.path,duration);assert.equal(r.duration.selection,'AUTO_DISCOVERED');assert.equal(r.prediction.path,prediction);assert.equal(r.prediction.selection,'AUTO_DISCOVERED');});
test('explicit SOC selection drives matching duration across multiple banks',()=>{const r=assess([[soc,.9],[duration,1000],['electrical.batteries.start.capacity.stateOfCharge',.8],['electrical.batteries.start.capacity.timeRemaining',10]],{levelPath:soc});assert.equal(r.time,1000);assert.equal(r.duration.path,duration);});
test('ambiguous SOC never borrows time remaining from a random bank',()=>{const r=assess([[soc,.9],[duration,1000],['electrical.batteries.start.capacity.stateOfCharge',.8],[prediction,'critical']]);assert.equal(r.status,'UNKNOWN');assert.equal(r.time,null);assert.equal(r.duration.selection,'NO_SOURCE');});
test('explicit optional paths override discovered ones',()=>{const r=assess([[soc,.9],[duration,1000],[prediction,'critical'],['custom.prediction','surplus'],['custom.duration',500]],{predictionPath:'custom.prediction',timePath:'custom.duration'});assert.equal(r.status,'OK');assert.equal(r.time,500);assert.equal(r.prediction.selection,'CONFIGURED');assert.equal(r.duration.selection,'CONFIGURED');});
test('missing explicit paths do not silently fall back to the standard inputs',()=>{const r=assess([[soc,.9],[duration,1000],[prediction,'critical']],{predictionPath:'missing.prediction',timePath:'missing.duration'});assert.equal(r.status,'OK');assert.equal(r.time,null);assert.equal(r.prediction.path,'missing.prediction');assert.equal(r.duration.selection,'CONFIGURED');});
test('stale automatically discovered forecast and duration are ignored',()=>{const r=assess([[soc,.9],[duration,1000,301],[prediction,'critical',7201]]);assert.equal(r.status,'OK');assert.equal(r.time,null);assert.equal(r.prediction.valid,false);});
test('no matching duration is borrowed from another bank; absent optional sources are benign',()=>{const r=assess([[soc,.9],['electrical.batteries.start.capacity.timeRemaining',1000]]);assert.equal(r.status,'OK');assert.equal(r.time,null);assert.equal(r.duration.path,duration);assert.equal(r.duration.selection,'NO_SOURCE');});
test('discovery exposes related energy paths for setup',()=>{const list=discover(fixture([[soc,.9],[duration,1000],[prediction,'stable']])).energy;assert.equal(list[0].timePath,duration);assert.equal(list[0].predictionPath,prediction);});
test('late optional sources are discovered on the next assessment',()=>{const config=normalize().resources.energy,app=fixture([[soc,.9]]),selection={path:soc,reason:'AUTO_DISCOVERED'};assert.equal(energy(config,app,selection,now).time,null);const withDuration=fixture([[soc,.9],[duration,300]]);app.getSelfPath=withDuration.getSelfPath;assert.equal(energy(config,app,selection,now).time,300);});

test('eight-minute rising forecast is available with explicit or discovered path; measured duration still expires',()=>{
 for(const options of [{},{predictionPath:prediction}]){
  const r=assess([[soc,.99],[duration,1000,480],[prediction,'rising',480]],options);
  assert.equal(r.prediction.valid,true);assert.equal(r.prediction.value,'rising');assert.equal(r.status,'OK');assert.equal(r.action,'NONE');assert.equal(r.time,null);
  const view=require('../public/view-model').build({running:true,assessment:{timestamp:new Date(now).toISOString(),status:r.status,resources:{energy:r}},display:{intervalSeconds:10}},'litres',now);
  assert.equal(view.cards.find(c=>c.key==='energy').facts.find(f=>f.label==='Energy forecast').value,'Improving');
 }
});
test('forecast freshness has an independent bounded configurable window',()=>{
 for(const [age,valid] of [[3601,true],[7200,true],[7201,false]]){
  const r=assess([[soc,.99],[prediction,'critical',age]]);
  assert.equal(r.prediction.valid,valid);assert.equal(r.status,valid?'WARNING':'OK');
 }
 assert.equal(assess([[soc,.99],[prediction,'critical',601]],{predictionStaleSeconds:600}).prediction.valid,false);
 for(const value of [0,-1,1.5,'7200',604801])assert.throws(()=>normalize({resources:{energy:{predictionStaleSeconds:value}}}),/forecast freshness/);
});
test('forecast never rescues stale SOC or overrides measured reserve',()=>{
 assert.equal(assess([[soc,.99,301],[prediction,'rising',480]]).status,'UNKNOWN');
 assert.equal(assess([[soc,.4],[prediction,'rising',480]]).status,'CRITICAL');
 for(const entries of [[],[[prediction,null]],[[prediction,'rising',7201]],[[prediction,'rising',-6]]])assert.equal(assess([[soc,.99],...entries]).status,'OK');
});

test('battery duration states survive assessment and dashboard without changing decisions',()=>{
 const cases=[
  [[], 'WAITING_FOR_DATA','Waiting for data',null],
  [[[duration,null]],'NO_ESTIMATE','No estimate',null],
  [[[duration,null,301]],'STALE','Data stale',null],
  [[[duration,3600,301]],'STALE','Data stale',null],
  ...[undefined,'3600',-1,NaN,Infinity].map(v=>[[[duration,v]],'UNAVAILABLE','Unavailable',null]),
  [[[duration,null,-6]],'UNAVAILABLE','Unavailable',null],
  [[[duration,0]],'AVAILABLE','0 hours',0],
  [[[duration,3600]],'AVAILABLE','1 hours',3600],
  [[[duration,900000]],'AVAILABLE','10.4 days',900000]
 ];
 for(const [entries,state,label,time] of cases){
  for(const [level,forecast] of [[.99,'surplus'],[.99,'critical'],[.4,'surplus']]){
   const baseline=assess([[soc,level],[prediction,forecast]]);
   const r=assess([[soc,level],[prediction,forecast],...entries]);
   assert.equal(r.duration.state,state);assert.equal(r.duration.valid,state==='AVAILABLE');assert.equal(r.time,time);
   for(const key of ['status','action','reason','message'])assert.equal(r[key],baseline[key]);
   const view=require('../public/view-model').build({running:true,assessment:{timestamp:new Date(now).toISOString(),status:r.status,resources:{energy:r}}},'litres',now);
   assert.equal(view.cards[0].facts.find(f=>f.label==='Battery monitor time').value,label);
  }
 }
});
test('duration timestamps and absent value fields cannot masquerade as explicit null',()=>{
 const {readDuration}=require('../lib/discovery');
 for(const leaf of [{value:null},{value:null,timestamp:'bad'},{timestamp:new Date(now).toISOString()},null]){
  assert.equal(readDuration({getSelfPath:()=>leaf},duration,300,now).state,'UNAVAILABLE');
 }
 assert.equal(readDuration(fixture([[duration,null,300]]),duration,300,now).state,'NO_ESTIMATE');
 assert.equal(readDuration(fixture([[duration,0,301]]),duration,300,now).state,'STALE');
 const config=normalize().resources.energy,app=fixture([[soc,.99],[duration,null]]),selection={path:soc,reason:'CONFIGURED'};
 assert.equal(energy(config,app,selection,now).duration.state,'NO_ESTIMATE');
 assert.equal(energy(config,app,selection,now+301000).duration.state,'STALE');
 app.getSelfPath=fixture([[soc,.99],[duration,7200]]).getSelfPath;
 assert.equal(energy(config,app,selection,now).time,7200);
});
