'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {normalize,schema}=require('../lib/config');
const {discover,select}=require('../lib/discovery');
const create=require('..');
const now=Date.now();
const paths=(kind,id)=>`tanks.${kind}.${id}`;
const tank=(kind,id,extra={})=>({levelPath:`${paths(kind,id)}.currentLevel`,...extra});
function fixture(entries) {
  const root={};
  for(const [path,value,age=0] of entries){let node=root;const keys=path.split('.');for(const key of keys.slice(0,-1))node=node[key]||={};node[keys.at(-1)]={value,timestamp:new Date(now-age*1000).toISOString(),$source:'sensor'};}
  return {getSelfPath:path=>path.split('.').reduce((o,k)=>o?.[k],root)};
}
function assess(name,entries,tanks,extra={}) {
  const config=normalize({resources:{[name]:{tanks,...extra}}}).resources[name];
  const app=fixture(entries);
  return require(`../lib/resources/${name}`)(config,app,select(config,discover(app)[name]),now);
}
const fresh=[tank('freshWater','port'),tank('freshWater','starboard')];
const freshEntries=[['tanks.freshWater.port.currentLevel',.5],['tanks.freshWater.port.capacity',.1],['tanks.freshWater.starboard.currentLevel',1],['tanks.freshWater.starboard.capacity',.3]];
test('two unequal freshwater tanks use summed capacity and weighted level',()=>{
  const r=assess('freshwater',freshEntries,fresh);
  assert.equal(r.totals.capacityM3,.4);assert.equal(r.totals.currentVolumeM3,.35);assert.ok(Math.abs(r.totals.levelRatio-.875)<1e-12);assert.equal(r.status,'OK');assert.equal(r.tanks.length,2);
});
test('calibrated Derived Data volumes take precedence over linear level estimates',()=>{
  const r=assess('freshwater',[...freshEntries,['tanks.freshWater.port.currentVolume',.01]],fresh);
  assert.equal(r.tanks[0].currentVolumeM3,.01);assert.equal(r.tanks[0].volumeMethod,'MEASURED_VOLUME');assert.equal(r.totals.currentVolumeM3,.31);
});
test('constant capacities do not expire with sensor freshness',()=>{
  const r=assess('freshwater',freshEntries.map(e=>e[0].endsWith('.capacity')?[e[0],e[1],864000]:e),fresh);
  assert.equal(r.totals.complete,true);
});
test('manual capacities allow tank totals without a capacity provider',()=>{
  const r=assess('freshwater',freshEntries.filter(e=>!e[0].endsWith('.capacity')),[{...fresh[0],capacityM3:.1},{...fresh[1],capacityM3:.3}]);
  assert.equal(r.totals.capacityM3,.4);assert.equal(r.totals.currentVolumeM3,.35);
});
test('stale calibrated volumes do not fall back to linear estimates or partial totals',()=>{
  const r=assess('freshwater',[...freshEntries,['tanks.freshWater.port.currentVolume',.01,1201]],fresh);
  assert.equal(r.totals.currentVolumeM3,null);assert.equal(r.totals.levelRatio,null);assert.equal(r.status,'UNKNOWN');assert.equal(r.totals.volumeTanks,1);
});
test('one missing tank does not turn into an empty tank or a healthy full-system total',()=>{
  const r=assess('freshwater',freshEntries.filter(e=>!e[0].includes('starboard')),fresh);
  assert.equal(r.totals.capacityM3,null);assert.equal(r.totals.currentVolumeM3,null);assert.equal(r.status,'UNKNOWN');assert.equal(r.tanks[1].levelRatio,null);
});
test('a zero measured volume is valid; an invalid calibrated volume is not linearized',()=>{
  const empty=assess('freshwater',[...freshEntries,['tanks.freshWater.port.currentVolume',0]],fresh);
  assert.equal(empty.tanks[0].currentVolumeM3,0);
  for(const value of [null,-1,.2,'0.05',Infinity])assert.equal(assess('freshwater',[...freshEntries,['tanks.freshWater.port.currentVolume',value]],fresh).totals.currentVolumeM3,null);
});
test('a remaining-volume source and explicit custom volume/capacity paths work',()=>{
  const r=assess('freshwater',[['custom.water.volume',.04],['custom.water.capacity',.08]],[tank('freshWater','main',{volumePath:'custom.water.volume',capacityPath:'custom.water.capacity'})]);
  assert.equal(r.totals.levelRatio,.5);assert.equal(r.status,'OK');
  const second=assess('freshwater',[['tanks.freshWater.main.remaining',.04],['tanks.freshWater.main.capacity',.08]],[tank('freshWater','main')]);
  assert.equal(second.totals.currentVolumeM3,.04);
});
test('two fuel tanks have a combined total and preserve the individual low-tank action',()=>{
  const r=assess('fuel',[['tanks.fuel.a.currentLevel',.1],['tanks.fuel.a.capacity',.1],['tanks.fuel.b.currentLevel',1],['tanks.fuel.b.capacity',.3]],[tank('fuel','a',{name:'Engine supply'}),tank('fuel','b')]);
  assert.equal(r.totals.currentVolumeM3,.31);assert.equal(r.status,'CRITICAL');assert.equal(r.limitingTank,'tanks.fuel.a.currentLevel');assert.match(r.message,/Engine supply/);
  const combined=assess('fuel',[['tanks.fuel.a.currentLevel',.1],['tanks.fuel.a.capacity',.1],['tanks.fuel.b.currentLevel',1],['tanks.fuel.b.capacity',.3]],[tank('fuel','a'),tank('fuel','b')],{assessmentMode:'combined'});
  assert.equal(combined.status,'OK');
});
test('multiple propane tanks are supported without a consumption plugin',()=>{
  const r=assess('propane',[['tanks.lpg.a.currentLevel',0],['tanks.lpg.b.currentLevel',1]],[tank('lpg','a',{capacityM3:.02}),tank('lpg','b',{capacityM3:.02})]);
  assert.equal(r.totals.capacityM3,.04);assert.equal(r.totals.currentVolumeM3,.02);assert.equal(r.status,'CRITICAL');
});
test('empty holding tank cannot mask a full one',()=>{
  const r=assess('holding',[['tanks.blackWater.a.currentLevel',.95],['tanks.blackWater.b.currentLevel',0]],[tank('blackWater','a',{capacityM3:.1}),tank('blackWater','b',{capacityM3:.3})]);
  assert.equal(r.status,'CRITICAL');assert.equal(r.totals.capacityM3,.4);assert.ok(Math.abs(r.totals.freeVolumeM3-.305)<1e-12);assert.equal(r.totals.availableVolumeM3,null);
});
test('freshwater duration uses the sum once and one explicit total rate',()=>{
  const r=assess('freshwater',[...freshEntries,['water.consumption',100]],fresh,{consumptionPath:'water.consumption',consumptionUnits:'L/day',volumePath:'unused.total'});
  assert.ok(Math.abs(r.time-3.5*86400)<1e-8);assert.equal(r.status,'OK');
});
test('disabled tanks are excluded and disabling all explicit tanks never selects discovered tanks',()=>{
  const r=assess('freshwater',freshEntries,[{...fresh[0],enabled:false},fresh[1]]);assert.equal(r.totals.capacityM3,.3);
  const empty=assess('freshwater',freshEntries,fresh.map(t=>({...t,enabled:false})));assert.equal(empty.status,'UNKNOWN');assert.equal(empty.totals.selectedTanks,0);
});
test('duplicate tanks, duplicate volume paths, bad capacities and conflicting setup are rejected',()=>{
  const cases=[{tanks:[fresh[0],fresh[0]]},{tanks:[{...fresh[0],volumePath:'water.total'},{...fresh[1],volumePath:'water.total'}]},{tanks:[{...fresh[0],capacityM3:-1}]},{tanks:fresh,levelPath:fresh[0].levelPath}];
  for(const c of cases)assert.throws(()=>normalize({resources:{freshwater:c}}));
  assert.throws(()=>normalize({resources:{holding:{assessmentMode:'combined'}}}));
});
test('configuration names battery SOC and tank Level distinctly',()=>{
  assert.match(schema.properties.resources.properties.energy.properties.levelPath.title,/^SOC/);
  for(const n of ['freshwater','fuel','propane','holding'])assert.match(schema.properties.resources.properties[n].properties.levelPath.title,/^Level/);
});
test('discovery shows capacity and current volume paths for tank setup',()=>{
  const found=discover(fixture([...freshEntries,['tanks.freshWater.port.currentVolume',.05]]));
  assert.equal(found.freshwater[0].volumePath,'tanks.freshWater.port.currentVolume');assert.equal(found.freshwater[0].capacityM3,.1);
});
test('published tank totals have SI metadata and null invalidation on missing inputs',()=>{
  const app=fixture(freshEntries),messages=[];Object.assign(app,{handleMessage:(id,d)=>messages.push(d),setPluginStatus:()=>{},setPluginError:e=>{throw Error(e)}});
  const plugin=create(app);
  try{plugin.start({resources:{freshwater:{tanks:fresh}}});
    const values=messages.at(-1).updates[0].values;assert.equal(values.find(v=>v.path==='environment.endurancePreview.resources.freshwater.totals.capacityM3').value,.4);
    assert.ok(messages.some(d=>d.updates[0].meta?.some(m=>m.value.units==='m3')));
    plugin.start({resources:{freshwater:{tanks:[...fresh,tank('freshWater','missing')]}}});
    assert.equal(messages.at(-1).updates[0].values.find(v=>v.path==='environment.endurancePreview.resources.freshwater.totals.currentVolumeM3').value,null);
  }finally{plugin.stop();}
});
test('an explicit alias cannot double-count another tanks discovered volume',()=>{
  const entries=[...freshEntries,['tanks.freshWater.port.currentVolume',.05]];
  const r=assess('freshwater',entries,[fresh[0],{...fresh[1],volumePath:'tanks.freshWater.port.currentVolume'}]);
  assert.equal(r.totals.currentVolumeM3,null);assert.equal(r.tanks[1].reason,'DUPLICATE_VOLUME_SOURCE');assert.equal(r.status,'UNKNOWN');
});
