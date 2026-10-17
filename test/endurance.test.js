'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const create = require('..');
const { normalize } = require('../lib/config');
const { discover, select, read } = require('../lib/discovery');
const { decide } = require('../lib/decision');
const monitors = Object.fromEntries(['energy','freshwater','fuel','propane','holding'].map(k => [k, require(`../lib/resources/${k}`)]));
const now = Date.now();
function fixture(entries) {
  const root = {};
  for (const [path, value, age = 0] of entries) {
    const keys = path.split('.'); let obj = root;
    for (const key of keys.slice(0,-1)) obj = obj[key] ||= {};
    obj[keys.at(-1)] = { value, timestamp: new Date(now-age*1000).toISOString(), $source: 'test.sensor' };
  }
  return { getSelfPath: path => path.split('.').reduce((a,k) => a?.[k], root) };
}
function evaluate(entries, options = {}) {
  const app = fixture(entries), config = normalize(options), d = discover(app);
  const resources = {};
  for (const [k, m] of Object.entries(monitors)) if(config.resources[k].enabled) resources[k] = m(config.resources[k], app, select(config.resources[k], d[k]), now);
  return decide(resources);
}
const energyPath = 'electrical.batteries.house.capacity.stateOfCharge';
const fuelPath = 'tanks.fuel.main.currentLevel';
test('no source and all disabled never claim healthy', () => {
  assert.equal(evaluate([]).status, 'UNKNOWN');
  assert.equal(evaluate([], { resources: Object.fromEntries(Object.keys(monitors).map(k=>[k,{enabled:false}])) }).status, 'UNKNOWN');
});
test('single measured source works without optional plugins', () => {
  const r = evaluate([[energyPath,.9]]);
  assert.equal(r.status,'OK'); assert.equal(r.action,'NONE'); assert.equal(r.limitingResource,'none');
  assert.equal(r.coverage.valid,1); assert.equal(r.time,null);
});
test('freshness uses original timestamp, rejects future and missing stamps', () => {
  assert.equal(evaluate([[energyPath,.1,301]]).status,'UNKNOWN');
  assert.equal(evaluate([[energyPath,.1,-60]]).status,'UNKNOWN');
  assert.equal(read({getSelfPath:()=>({value:.1})},energyPath,300,now).valid,false);
});
test('null, boolean, string, NaN, infinity, and out of range are not measurements', () => {
  for (const v of [null, false, '', '.1', NaN, Infinity, -1, 2]) assert.equal(evaluate([[energyPath,v]]).status,'UNKNOWN',String(v));
  assert.equal(evaluate([[energyPath,0]]).status,'CRITICAL');
});
test('multiple battery banks require choice, explicit source does not fall back', () => {
  const entries = [[energyPath,.9],['electrical.batteries.start.capacity.stateOfCharge',.1]];
  assert.equal(evaluate(entries).resources.energy.reason,'CHOOSE_SOURCE');
  assert.equal(evaluate(entries,{resources:{energy:{levelPath:energyPath}}}).status,'OK');
  assert.equal(evaluate(entries,{resources:{energy:{levelPath:'missing.soc'}}}).status,'UNKNOWN');
});
test('all resource thresholds include equality and holding direction is reversed', () => {
  const paths={energy:energyPath,freshwater:'tanks.freshWater.main.currentLevel',fuel:fuelPath,propane:'tanks.lpg.main.currentLevel',holding:'tanks.wasteWater.main.currentLevel'};
  const config=normalize();
  for(const [name,path] of Object.entries(paths)) {
    for(const [key,status] of [['critical','CRITICAL'],['warning','WARNING']]) assert.equal(evaluate([[path,config.resources[name][key]]]).resources[name].status,status,name);
  }
  assert.equal(evaluate([['tanks.holding.main.currentLevel',0]]).resources.holding.status,'OK');
});
test('all critical alerts precede warnings, water wins same severity, responsible resource is correct', () => {
  const r=evaluate([[energyPath,.6],[fuelPath,.1]]);
  assert.equal(r.action,'REFUEL_NOW'); assert.equal(r.limitingResource,'fuel'); assert.equal(r.time,null);
  assert.equal(evaluate([[fuelPath,.1],['tanks.freshWater.main.currentLevel',.1]]).limitingResource,'freshwater');
});
test('optional predictor adds WATCH or WARNING but never overrides measured critical', () => {
  for(const [p,status] of [['deficit','WATCH'],['critical','WARNING'],['surplus','OK'],['garbage','OK']]) {
    const r=evaluate([[energyPath,.9],['electrical.prediction.status',p]],{resources:{energy:{predictionPath:'electrical.prediction.status'}}});
    assert.equal(r.status,status); if(status==='WATCH') assert.equal(r.limitingResource,'none');
  }
  assert.equal(evaluate([[energyPath,.4],['electrical.prediction.status','surplus']],{resources:{energy:{predictionPath:'electrical.prediction.status'}}}).status,'CRITICAL');
  assert.equal(evaluate([[energyPath,.9],['electrical.prediction.status','critical',7201]],{resources:{energy:{predictionPath:'electrical.prediction.status'}}}).status,'OK');
});
test('water rate units produce identical seconds and stale rates clear estimate', () => {
  const volumePath='tanks.freshWater.total.currentVolume',consumptionPath='tanks.freshWater.total.prediction.consumption24h';
  for(const units of ['m3/s','L/day']) {
    const entries=[[volumePath,.1],[consumptionPath,units==='L/day'?100:.1/86400]];
    const options={resources:{freshwater:{volumePath,consumptionPath,consumptionUnits:units}}};
    const r=evaluate(entries,options);
    assert.equal(r.time,86400);assert.equal(r.status,'CRITICAL');
    assert.equal(evaluate([[volumePath,.1],[consumptionPath,100,1201]],options).time,null);
  }
});
test('invalid config cannot silently change thresholds or freshness', () => {
  for(const options of [{intervalSeconds:0},{resources:{fuel:{warning:.1,critical:.2}}},{resources:{holding:{warning:.9,critical:.1}}},{resources:{energy:{levelPath:'environment.endurance.time'}}},{resources:{fuel:{staleSeconds:-1}}}]) assert.throws(()=>normalize(options));
});
test('lifecycle publishes valid deltas, null invalidation, preview isolation and router state', () => {
  const app=fixture([[energyPath,.9]]), messages=[];
  Object.assign(app,{handleMessage:(id,d)=>{assert.equal(id,'signalk-endurance');messages.push(d)},setPluginStatus:()=>{},setPluginError:e=>{throw Error(e)}});
  const plugin=create(app),routes={};plugin.registerWithRouter({get:(path,handler)=>routes[path]=handler});
  try {
    plugin.start({});
    const values=messages.at(-1).updates[0].values;
    assert.equal(values.find(v=>v.path==='environment.endurancePreview.status').value,'OK');
    assert.equal(values.find(v=>v.path==='environment.endurancePreview.time').value,null);
    assert.ok(values.every(v=>!v.path.startsWith('notifications.')));
    JSON.parse(JSON.stringify(messages));
    routes['/discovery']({}, {json:v=>assert.equal(v.candidates.energy.length,1)});
    plugin.start({publishLive:true,notifications:true});
    assert.equal(messages.at(-1).updates[0].values.find(v=>v.path==='notifications.environment.endurance').value,null);
  } finally {plugin.stop();}
  routes['/assessment']({}, {json:v=>{assert.equal(v.running,false);assert.equal(v.assessment,null)}});
});
