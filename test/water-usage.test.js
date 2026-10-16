'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {WaterUsage}=require('../lib/water-usage');
const {storage}=require('../lib/usage-store');
const {normalize}=require('../lib/config');
const create=require('..');
const settings=()=>normalize().resources.freshwater.learning;
const epoch=Date.parse('2026-10-16T00:00:00Z');
function observe(engine,minute,volumes,opts={}) {
 const now=epoch+minute*60000;
 return engine.observe({now,crew:1,signature:'two-tanks',capacity:.4,tanks:volumes.map(volume=>({volume,timestamp:now})),...opts});
}
function run(engine,hours,fn,opts={}) {let result;for(let m=0;m<=hours*60;m+=5)result=observe(engine,m,fn(m),opts);return result;}
const daily=.012;
test('new supply has one configurable default for all tanks, not one per tank',()=>{
 const engine=new WaterUsage(settings());const r=observe(engine,0,[.2,.2]);assert.equal(r.rate,.006/86400);assert.equal(r.source,'default');assert.equal(r.ready,false);
});
test('steady boat-wide consumption learns 12 L/day over stationary observations',()=>{
 const engine=new WaterUsage(settings());const r=run(engine,80,m=>[.2-daily*m/1440,.2]);assert.equal(r.source,'learned');assert.ok(Math.abs(r.rate-daily/86400)<1e-9);assert.ok(r.observationHours>=72);assert.ok(r.intervals>=3);
});
test('switching tanks does not change total learned usage',()=>{
 const engine=new WaterUsage(settings());const r=run(engine,80,m=>m<=2400?[.2-daily*m/1440,.2]:[.18,.2-daily*(m-2400)/1440]);assert.equal(r.source,'learned');assert.ok(Math.abs(r.rate-daily/86400)<1e-9);
});
test('balanced transfers and staggered updates cannot become learned consumption',()=>{
 const engine=new WaterUsage(settings());run(engine,4,()=>[.2,.2]);
 for(let m=245;m<=500;m+=5){const stage=(m-245)/255;observe(engine,m,[.2-.1*stage,.2+.1*Math.max(0,stage-.03)]);}
 assert.equal(Object.keys(engine.bins).length,0);
});
test('refill interval is excluded rather than learned as negative usage',()=>{
 const engine=new WaterUsage(settings());run(engine,3,m=>[.1-daily*m/1440,.1]);
 const count=engine.prediction(1).intervals;
 observe(engine,185,[.2,.2]);observe(engine,190,[.2,.2]);observe(engine,195,[.2,.2]);
 assert.equal(engine.prediction(1).intervals,count);assert.equal(engine.reason,'REFILL');
});
test('single sensor dip is rejected by three-sample median',()=>{
 const engine=new WaterUsage(settings());run(engine,3,()=>[.2,.2]);observe(engine,185,[.01,.2]);observe(engine,190,[.2,.2]);observe(engine,195,[.2,.2]);assert.equal(Object.keys(engine.bins).length,0);
});
test('repeated polls of cached readings cannot advance learning',()=>{
 const engine=new WaterUsage(settings());for(let m=0;m<10000;m+=5)observe(engine,m,[.2,.2],{tanks:[{volume:.2,timestamp:epoch},{volume:.2,timestamp:epoch}]});assert.equal(Object.keys(engine.bins).length,0);
});
test('missing readings reset observations without erasing learned history',()=>{
 const engine=new WaterUsage(settings());run(engine,80,m=>[.2-daily*m/1440,.2]);const saved=JSON.stringify(engine.bins);observe(engine,4805,[null,.2]);assert.equal(JSON.stringify(engine.bins),saved);assert.equal(engine.anchor,null);assert.equal(engine.reason,'INCOMPLETE_VOLUME');
});
test('large timestamp skew, pauses and long gaps prevent observations across discontinuities',()=>{
 const engine=new WaterUsage(settings());run(engine,3,()=>[.2,.2]);observe(engine,185,[.19,.2],{tanks:[{volume:.19,timestamp:epoch+185*60000},{volume:.2,timestamp:epoch+170*60000}]});assert.equal(engine.reason,'UNSETTLED_TIMESTAMPS');
 observe(engine,190,[.19,.2],{paused:true});assert.equal(engine.reason,'LEARNING_PAUSED');assert.equal(engine.anchor,null);
 observe(engine,200,[.19,.2]);observe(engine,600,[.18,.2]);assert.equal(engine.anchor,null);assert.equal(engine.history.length,1);
});
test('crew counts learn separately and zero crew never creates infinite duration',()=>{
 const engine=new WaterUsage(settings());run(engine,80,m=>[.2-daily*m/1440,.2]);const r=observe(engine,4805,[.16,.2],{crew:2});assert.equal(r.source,'default');assert.equal(r.rate,.012/86400);assert.equal(engine.anchor,null);assert.equal(observe(engine,4810,[.16,.2],{crew:0}).rate,0);assert.ok(engine.bins['1']);
});
test('changing included supply invalidates incompatible learned history',()=>{
 const engine=new WaterUsage(settings());run(engine,80,m=>[.2-daily*m/1440,.2]);assert.equal(observe(engine,4805,[.1],{signature:'one-different-tank'}).source,'default');assert.equal(Object.keys(engine.bins).length,0);
});
test('restored state preserves learned rates but never spans offline time',()=>{
 const engine=new WaterUsage(settings());run(engine,80,m=>[.2-daily*m/1440,.2]);const next=new WaterUsage(settings(),JSON.parse(JSON.stringify(engine.snapshot())));const r=observe(next,6000,[.1,.2]);assert.equal(r.source,'learned');assert.equal(next.anchor,null);assert.equal(r.intervals,engine.prediction(1).intervals);
});
test('corrupt learned bins are ignored and state writes round-trip atomically',()=>{
 const engine=new WaterUsage(settings(),{version:1,signature:'two-tanks',bins:{'1':{rate:-1,hours:72,intervals:3},'2':{rate:'12',hours:72,intervals:3}}});assert.deepEqual(engine.bins,{});
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'endurance-usage-'));const store=storage({getDataDirPath:()=>dir});assert.equal(store.load(),null);store.save(engine.snapshot());assert.deepEqual(store.load(),engine.snapshot());assert.equal(fs.existsSync(path.join(dir,'freshwater-usage-v1.json.tmp')),false);
});
test('implausible fast drops do not create a huge learned rate',()=>{
 const engine=new WaterUsage({...settings(),maxDailyVolumeM3:.001});run(engine,5,m=>[.2-.024*m/1440,.2]);assert.equal(Object.keys(engine.bins).length,0);assert.equal(engine.reason,'IMPLAUSIBLE_USAGE');
});
function server(extra={}) {
 const data={tanks:{freshWater:{a:{currentLevel:{value:1,timestamp:new Date().toISOString()},capacity:{value:.2}},b:{currentLevel:{value:1,timestamp:new Date().toISOString()},capacity:{value:.2}}}},communication:{crewNames:{value:['Steve']}}};
 const messages=[];
 const app={getSelfPath:p=>p.split('.').reduce((o,k)=>o?.[k],data),handleMessage:(_id,d)=>messages.push(d),setPluginStatus:()=>{},setPluginError:e=>{throw Error(e)},...extra};
 const options={resources:{freshwater:{tanks:['a','b'].map(id=>({levelPath:`tanks.freshWater.${id}.currentLevel`}))}}};
 return {app,data,messages,options};
}
test('installed lifecycle estimates days from total volume with default source and SI publication',()=>{
 const {app,messages,options}=server();const plugin=create(app);try{plugin.start(options);const values=messages.at(-1).updates[0].values;assert.ok(Math.abs(values.find(v=>v.path.endsWith('freshwater.time')).value-.4/.006*86400)<1e-6);assert.equal(values.find(v=>v.path.endsWith('freshwater.rateSource')).value,'default');assert.equal(values.find(v=>v.path.endsWith('freshwater.consumptionRate')).value,.006/86400);}finally{plugin.stop();}
});
test('default forecast does not cause an intervention before learning is ready',()=>{
 const {app,data,messages,options}=server();data.tanks.freshWater.a.capacity.value=.001;data.tanks.freshWater.b.capacity.value=.001;const plugin=create(app);try{plugin.start(options);const values=messages.at(-1).updates[0].values;assert.equal(values.find(v=>v.path.endsWith('freshwater.status')).value,'OK');assert.equal(values.find(v=>v.path.endsWith('freshwater.rateSource')).value,'default');}finally{plugin.stop();}
});
test('explicit external path stays authoritative; invalid external data does not silently fall back',()=>{
 const {app,options,messages}=server();options.resources.freshwater.consumptionPath='missing.rate';const plugin=create(app);try{plugin.start(options);const values=messages.at(-1).updates[0].values;assert.equal(values.find(v=>v.path.endsWith('freshwater.time')).value,null);assert.equal(values.find(v=>v.path.endsWith('freshwater.rateSource')).value,'external');}finally{plugin.stop();}
});
test('lifecycle surfaces corrupt disk state without losing monitoring',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'endurance-bad-state-'));fs.writeFileSync(path.join(dir,'freshwater-usage-v1.json'),'{bad');const {app,options,messages}=server({getDataDirPath:()=>dir});const plugin=create(app);try{plugin.start(options);const values=messages.at(-1).updates[0].values;assert.equal(values.find(v=>v.path.endsWith('freshwater.learning')).value.persistence,'error');}finally{plugin.stop();}
});
test('invalid usage configuration is rejected at startup',()=>{
 for(const learning of [{minimumHours:0},{fallbackCrewCount:-1},{defaultLitresPerPersonPerDay:'6'},{paused:'yes'}])assert.throws(()=>normalize({resources:{freshwater:{learning}}}));
 assert.throws(()=>normalize({resources:{freshwater:{usageSource:'guess'}}}));
});
test('days of unchanged levels never become a learned zero-use guarantee',()=>{
 const engine=new WaterUsage(settings());const r=run(engine,80,()=>[.2,.2]);assert.equal(r.source,'default');assert.equal(r.ready,false);assert.equal(r.intervals,0);assert.equal(r.rate,.006/86400);
});
test('underway state prevents internal learning while keeping a labelled estimate',()=>{
 const {app,data,options,messages}=server();data.navigation={state:{value:'sailing'}};const plugin=create(app);try{plugin.start(options);const learning=messages.at(-1).updates[0].values.find(v=>v.path.endsWith('freshwater.learning')).value;assert.equal(learning.reason,'LEARNING_PAUSED');assert.equal(learning.consumptionRate,.006/86400);assert.equal(Object.hasOwn(learning,'rate'),false);}finally{plugin.stop();}
});
test('full plugin learns a switched supply, publishes SI rate, and reloads it after restart',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'endurance-integration-'));
 const {app,data,options,messages}=server({getDataDirPath:()=>dir});
 const originalNow=Date.now,originalInterval=global.setInterval,originalClear=global.clearInterval;
 let tick,clock=epoch;
 Date.now=()=>clock;global.setInterval=fn=>{tick=fn;return 1;};global.clearInterval=()=>{};
 const plugin=create(app);
 function update(minute){clock=epoch+minute*60000;const volumes=minute<=2400?[.2-daily*minute/1440,.2]:[.18,.2-daily*(minute-2400)/1440];for(let i=0;i<2;i++){const t=data.tanks.freshWater[['a','b'][i]];t.currentLevel={value:volumes[i]/.2,timestamp:new Date(clock).toISOString()};}}
 try{
  update(0);plugin.start(options);
  for(let m=5;m<=4800;m+=5){update(m);tick();}
  let values=messages.at(-1).updates[0].values;
  assert.equal(values.find(v=>v.path.endsWith('freshwater.rateSource')).value,'learned');
  assert.ok(Math.abs(values.find(v=>v.path.endsWith('freshwater.consumptionRate')).value-daily/86400)<1e-12);
  assert.equal(values.find(v=>v.path.endsWith('freshwater.learning')).value.persistence,'disk');
  const seconds=values.find(v=>v.path.endsWith('freshwater.time')).value;assert.ok(Math.abs(seconds-(.4-daily*4800/1440)/daily*86400)<1e-5);
  plugin.stop();update(6000);plugin.start(options);values=messages.at(-1).updates[0].values;
  assert.equal(values.find(v=>v.path.endsWith('freshwater.rateSource')).value,'learned');
  assert.equal(values.find(v=>v.path.endsWith('freshwater.learning')).value.reason,'SETTLING');
 }finally{plugin.stop();Date.now=originalNow;global.setInterval=originalInterval;global.clearInterval=originalClear;}
});
