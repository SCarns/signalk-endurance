'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {toM3,migrateOptions}=require('../lib/input-units');
const {normalize,schema}=require('../lib/config');
const {WaterUsage}=require('../lib/water-usage');
const create=require('..');
const tank={levelPath:'tanks.freshWater.main.currentLevel'};
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-12,`${a} != ${b}`);
const raw=(units,capacity)=>({inputVolumeUnits:units,resources:{freshwater:{tanks:[{...tank,capacity}]}}});
test('manual volumes use exact US gallon, litre and m³ conversion',()=>{
 assert.equal(toM3(1,'gallons'),.003785411784);assert.equal(toM3(400,'litres'),.4);assert.equal(toM3(.4,'m3'),.4);
 for(const [units,value] of [['litres',400],['m3',.4],['gallons',.4/.003785411784]])close(normalize(raw(units,value)).resources.freshwater.tanks[0].capacityM3,.4);
});
test('litres are default and user unit choice survives configuration round-trip',()=>{
 assert.equal(normalize().inputVolumeUnits,'litres');assert.equal(schema.properties.inputVolumeUnits.default,'litres');
 for(const units of ['litres','gallons','m3']){const saved=JSON.parse(JSON.stringify(migrateOptions(raw(units,100))));assert.equal(saved.inputVolumeUnits,units);assert.equal(saved.resources.freshwater.tanks[0].capacity,100);close(normalize(saved).resources.freshwater.tanks[0].capacityM3,toM3(100,units));assert.deepEqual(migrateOptions(saved),saved);}
});
test('existing m³ capacities migrate to litres without changing physical capacity',()=>{
 const old={resources:{freshwater:{tanks:[{...tank,capacityM3:.4}],learning:{defaultLitresPerPersonPerDay:8,maxLitresPerDay:1200}}}};
 const saved=migrateOptions(old);assert.equal(saved.inputVolumeUnits,'litres');assert.equal(saved.resources.freshwater.tanks[0].capacity,400);assert.equal(saved.resources.freshwater.learning.defaultUsagePerPersonPerDay,8);assert.equal(Object.hasOwn(saved.resources.freshwater.tanks[0],'capacityM3'),false);assert.equal(old.resources.freshwater.tanks[0].capacityM3,.4);
 const normalized=normalize(saved);assert.equal(normalized.resources.freshwater.tanks[0].capacityM3,.4);assert.equal(normalized.resources.freshwater.learning.defaultDailyVolumeM3,.008);
});
test('legacy values retain SI meaning even when a unit selection has already been added',()=>{
 const options=raw('gallons',0);delete options.resources.freshwater.tanks[0].capacity;options.resources.freshwater.tanks[0].capacityM3=.4;
 close(normalize(options).resources.freshwater.tanks[0].capacityM3,.4);close(migrateOptions(options).resources.freshwater.tanks[0].capacity,.4/.003785411784);
});
test('freshwater daily allowances convert at configuration boundary and estimator uses m³/s',()=>{
 for(const units of ['litres','gallons','m3']){const input=raw(units,0);input.resources.freshwater.learning={defaultUsagePerPersonPerDay:.006/toM3(1,units),maxUsagePerDay:1/toM3(1,units)};const settings=normalize(input).resources.freshwater.learning;close(settings.defaultDailyVolumeM3,.006);close(settings.maxDailyVolumeM3,1);const usage=new WaterUsage(settings);close(usage.prediction(1).rate,.006/86400);}
});
test('invalid, infinite and unsupported unit values cannot silently become capacities',()=>{
 for(const [value,units] of [[-1,'litres'],['100','litres'],[null,'litres'],[Infinity,'m3'],[NaN,'litres'],[1,'imperialGallons'],[Number.MAX_VALUE,'bad']])assert.throws(()=>normalize(raw(units,value)));
});
test('normalizing twice does not apply conversion twice',()=>{
 const first=normalize(raw('gallons',40));const second=normalize(first);close(first.resources.freshwater.tanks[0].capacityM3,second.resources.freshwater.tanks[0].capacityM3);close(first.resources.freshwater.learning.defaultDailyVolumeM3,second.resources.freshwater.learning.defaultDailyVolumeM3);
});
test('plugin persists editable units and migrates legacy inputs, but keeps SI output and path values',()=>{
 let saved=null;const messages=[];const stamp=new Date().toISOString();const model={tanks:{freshWater:{main:{currentLevel:{value:.5,timestamp:stamp},capacity:{value:.4}}}}};
 const app={getSelfPath:p=>p.split('.').reduce((o,k)=>o?.[k],model),handleMessage:(_id,d)=>messages.push(d),setPluginStatus:()=>{},setPluginError:e=>{throw Error(e)},savePluginOptions:(options,cb)=>{saved=options;cb(null);}};
 const plugin=create(app);
 try{plugin.start({resources:{freshwater:{tanks:[{...tank,capacityM3:.4}]}}});assert.equal(saved.inputVolumeUnits,'litres');assert.equal(saved.resources.freshwater.tanks[0].capacity,400);assert.equal(Object.hasOwn(saved.resources.freshwater.tanks[0],'capacityM3'),false);
 plugin.start(raw('gallons',0));const values=messages.at(-1).updates[0].values;assert.equal(values.find(v=>v.path.endsWith('freshwater.totals.capacityM3')).value,.4);assert.equal(values.find(v=>v.path.endsWith('freshwater.totals.currentVolumeM3')).value,.2);assert.equal(saved.inputVolumeUnits,'gallons');
 }finally{plugin.stop();}
});
test('v1 learned daily rates migrate to v2 SI rates without losing progress',()=>{
 const settings=normalize().resources.freshwater.learning;const engine=new WaterUsage(settings,{version:1,signature:'water',bins:{'1':{rate:.012,hours:80,intervals:10}}});assert.equal(engine.prediction(1).source,'learned');close(engine.prediction(1).rate,.012/86400);const saved=engine.snapshot();assert.equal(saved.version,2);const restored=new WaterUsage(settings,saved);close(restored.prediction(1).rate,.012/86400);assert.equal(restored.prediction(1).intervals,10);
});
test('unit selection applies to all four tank systems',()=>{
 const resources=Object.fromEntries(['freshwater','fuel','propane','holding'].map(name=>[name,{tanks:[{levelPath:`tanks.${name}.main.currentLevel`,capacity:100}]}]));
 const result=normalize({inputVolumeUnits:'litres',resources});for(const name of Object.keys(resources))assert.equal(result.resources[name].tanks[0].capacityM3,.1);
});
test('pre-upgrade configuration and learned-state backups preserve rollback data',()=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path');const {storage,backupOptions}=require('../lib/usage-store');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'endurance-unit-upgrade-'));const app={getDataDirPath:()=>dir};
 const old={resources:{freshwater:{tanks:[{...tank,capacityM3:.4}]}}};backupOptions(app,old);backupOptions(app,{different:true});assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir,'config-before-alpha4.json'),'utf8')),old);
 const history={version:1,signature:'water',bins:{'1':{rate:.012,hours:80,intervals:10}}};fs.writeFileSync(path.join(dir,'freshwater-usage-v1.json'),JSON.stringify(history));const store=storage(app);const engine=new WaterUsage(normalize().resources.freshwater.learning,store.load());store.save(engine.snapshot());assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir,'freshwater-usage-v1.json.alpha3-backup'),'utf8')),history);assert.equal(store.load().version,2);
});
