'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const create=require('..');
const {normalize}=require('../lib/config');
const {discover,read,select}=require('../lib/discovery');
const {crewCount}=require('../lib/crew');
const fuel=require('../lib/resources/fuel');
const holding=require('../lib/resources/holding');
const {decide}=require('../lib/decision');
const {build}=require('../public/view-model');
const now=Date.now(), stamp=new Date(now).toISOString();
function fixture(entries){const root={};for(const [path,value,age=0] of entries){let obj=root;const keys=path.split('.');for(const k of keys.slice(0,-1))obj=obj[k]||={};obj[keys.at(-1)]={value,timestamp:new Date(now-age*1000).toISOString()};}return {getSelfPath:p=>p.split('.').reduce((a,k)=>a?.[k],root)};}
function run(app,options={}){const messages=[];Object.assign(app,{handleMessage:(_,d)=>messages.push(d),setPluginStatus:()=>{},setPluginError:e=>{throw Error(e)}});const p=create(app);try{p.start(options);return {values:messages.at(-1).updates[0].values,meta:messages.flatMap(d=>d.updates.flatMap(u=>u.meta||[]))};}finally{p.stop();}}
test('days are exact conversions of existing seconds in live and preview with metadata',()=>{
 for(const publishLive of [true,false])for(const seconds of [0,43200,453600,null,-1,'86400',Infinity]){
  const app=fixture([['electrical.batteries.house.capacity.stateOfCharge',.9],['electrical.batteries.house.capacity.timeRemaining',seconds]]);
  const {values,meta}=run(app,{publishLive});const base=publishLive?'environment.endurance':'environment.endurancePreview';const get=p=>values.find(v=>v.path===`${base}.${p}`).value;
  assert.equal(get('estimatedDays'),get('time')===null?null:get('time')/86400);
  assert.equal(get('resources.energy.estimatedDays'),get('estimatedDays'));
  assert.equal(get('resources.fuel.estimatedDays'),null);
  assert.equal(meta.find(m=>m.path===`${base}.estimatedDays`).value.units,'d');
  assert.ok(values.every(v=>!v.path.startsWith(publishLive?'environment.endurancePreview':'environment.endurance.')));
 }
});
test('days clear on source expiry, null and disabled resource, while fresh water conversion is exact',()=>{
 const paths=[['tanks.freshWater.main.currentLevel',.8],['tanks.freshWater.main.capacity',.1],['custom.waterRate',.01/86400]];
 const options={resources:{freshwater:{consumptionPath:'custom.waterRate'}}};
 const first=run(fixture(paths),options).values;
 const seconds=first.find(v=>v.path.endsWith('.resources.freshwater.time')).value;
 assert.equal(first.find(v=>v.path.endsWith('.resources.freshwater.estimatedDays')).value,seconds/86400);
 for(const entries of [paths.map(x=>[...x.slice(0,2),1201]),[],[['custom.waterRate',null]]])assert.equal(run(fixture(entries),options).values.find(v=>v.path.endsWith('.resources.freshwater.estimatedDays')).value,null);
 assert.equal(run(fixture(paths),{resources:{freshwater:{enabled:false}}}).values.find(v=>v.path.endsWith('.resources.freshwater.estimatedDays')).value,null);
});
const fuelEntries=[['tanks.fuel.main.currentLevel',.5],['tanks.fuel.main.capacity',.2],['propulsion.main.fuel.rate',.001/3600]];
function assessFuel(entries,extra={}){const app=fixture(entries),config=normalize({resources:{fuel:{ratePath:'propulsion.main.fuel.rate',...extra}}}).resources.fuel;return fuel(config,app,select(config,discover(app).fuel),now);}
test('configured existing fuel rate gives running hours without changing chronological or level decisions',()=>{
 const r=assessFuel(fuelEntries);assert.ok(Math.abs(r.engineTime-360000)<1e-8);assert.equal(r.time,null);assert.equal(r.status,'OK');assert.equal(decide({fuel:r}).time,null);
 const card=build({running:true,assessment:{timestamp:stamp,status:'OK',resources:{fuel:r}}},'litres',now).cards.find(c=>c.key==='fuel');assert.equal(card.facts.at(-1).value,'100 hours to empty');
 const values=run(fixture(fuelEntries),{resources:{fuel:{ratePath:'propulsion.main.fuel.rate'}}}).values;assert.ok(values.find(v=>v.path.endsWith('.fuel.engineTime')).value>0);assert.equal(values.find(v=>v.path.endsWith('.fuel.estimatedDays')).value,null);
 const critical=assessFuel(fuelEntries.map(e=>e[0].endsWith('currentLevel')?[e[0],.1]:e));assert.equal(critical.status,'CRITICAL');
});
test('fuel rejects missing, stale, invalid, stopped and runtime-only rates; empty supply is zero running time',()=>{
 for(const rate of [0,-1,null,false,'0.1',NaN,Infinity])assert.equal(assessFuel([...fuelEntries.slice(0,2),['propulsion.main.fuel.rate',rate]]).engineTime,null);
 for(const age of [1201,-60])assert.equal(assessFuel([...fuelEntries.slice(0,2),['propulsion.main.fuel.rate',.0001,age]]).engineTime,null);
 assert.equal(assessFuel(fuelEntries,{ratePath:''}).engineTime,null);
 assert.equal(assessFuel([...fuelEntries.slice(0,2),['propulsion.main.runTime',50000],['propulsion.main.revolutions',30]]).engineTime,null);
 assert.equal(assessFuel([fuelEntries[0],fuelEntries[2]]).engineTime,null);
 assert.equal(assessFuel(fuelEntries.map(e=>e[0].endsWith('currentLevel')?[e[0],0]:e)).engineTime,0);
});
test('fuel requires every selected tank volume and never adds discovered tanks to explicit supply',()=>{
 const tanks=['main','spare'].map(id=>({levelPath:`tanks.fuel.${id}.currentLevel`}));
 assert.equal(assessFuel(fuelEntries,{tanks}).engineTime,null);
 const r=assessFuel([...fuelEntries,['tanks.fuel.spare.currentLevel',1],['tanks.fuel.spare.capacity',.1]],{tanks:[tanks[0]]});assert.ok(Math.abs(r.engineTime-360000)<1e-8);
});
test('crew integration validates roster, retains persisted state, and offers manual override including zero',()=>{
 const settings={fallbackCrewCount:2,crewSource:'auto'};
 const count=leaf=>crewCount({getSelfPath:()=>leaf},settings,now);
 assert.equal(count({value:['A','B','C'],timestamp:stamp}).count,3);
 assert.equal(count({value:[],timestamp:stamp}).count,0);
 assert.equal(count({value:['A'],timestamp:'2020-01-01T00:00:00Z'}).count,1);
 for(const leaf of [undefined,null,{value:[null]}, {value:['']},{value:['A',' A ']},{value:['A'],timestamp:'bad'},{value:['A'],timestamp:new Date(now+60000).toISOString()},{value:Array(101).fill('A')}])assert.equal(count(leaf).source,'configuredFallback');
 assert.equal(crewCount({getSelfPath:()=>({value:['A']})},{...settings,crewSource:'manual',fallbackCrewCount:0},now).source,'manualOverride');
 assert.throws(()=>normalize({resources:{freshwater:{learning:{crewSource:'invalid'}}}}));
 assert.throws(()=>normalize({resources:{fuel:{ratePath:'environment.endurance.time'}}}));
});
test('manual crew affects internal allowance once while external total usage remains authoritative',()=>{
 const entries=[['tanks.freshWater.main.currentLevel',1],['tanks.freshWater.main.capacity',.12],['communication.crewNames',['A','B','C']],['custom.waterRate',.012/86400]];
 for(const external of [false,true]){const options={resources:{freshwater:{learning:{crewSource:'manual',fallbackCrewCount:1},...(external?{consumptionPath:'custom.waterRate'}:{})}}};const values=run(fixture(entries),options).values;const get=s=>values.find(v=>v.path.endsWith(s)).value;
 assert.ok(Math.abs(get('.freshwater.estimatedDays')-(external?10:20))<1e-10);
 if(!external){assert.equal(get('.freshwater.learning').crewSource,'manualOverride');assert.equal(get('.freshwater.learning').crewCount,1);}
 }
});
test('discovery distinguishes present stale sources from valid numeric measurements without changing shared read reasons',()=>{
 for(const [value,age,state,valid] of [[.5,0,'FRESH',true],[null,0,'FRESH',false],[.5,1201,'STALE',false],[.5,-60,'FUTURE',false]]){const app=fixture([['tanks.holding.main.currentLevel',value,age]]);const c=discover(app,{},now).holding[0];assert.equal(c.freshness,state);assert.equal(c.measurementValid,valid);}
 const app={getSelfPath:()=>({value:.5})};assert.equal(read(app,'a',300,now).state,'INVALID_TIMESTAMP');assert.equal(read(app,'a',300,now).reason,'MISSING_OR_STALE');
});
test('holding keeps full tank alerts with missing selected tanks and never invents fill duration',()=>{
 const config=normalize({resources:{holding:{tanks:['a','b'].map(id=>({levelPath:`tanks.holding.${id}.currentLevel`}))}}}).resources.holding;
 const app=fixture([['tanks.holding.a.currentLevel',.95],['tanks.holding.a.capacity',.1]]);
 const r=holding(config,app,{path:'',reason:'CHOOSE_SOURCE'},now);assert.equal(r.status,'CRITICAL');assert.equal(r.action,'PUMP_OUT_NOW');assert.equal(r.totals.freeVolumeM3,null);assert.equal(r.time,null);assert.equal(r.tanks[1].status,'UNKNOWN');
});
