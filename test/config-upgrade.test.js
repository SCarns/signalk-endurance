'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const Ajv=require('ajv');
const {schema,normalize}=require('../lib/config');
const {migrateOptions}=require('../lib/input-units');
const create=require('..');
// Match Admin UI's configuration wrapper: validation happens before submission/start.
const validate=new Ajv({strict:false}).compile({type:'object',properties:{configuration:schema}});
const valid=configuration=>assert.equal(validate({configuration}),true,JSON.stringify(validate.errors));
function legacy(){return migrateOptions({inputVolumeUnits:'gallons',publishLive:true,notifications:true,enableFreeboard:false,intervalSeconds:30,passage:{enabled:true,fuelLitresPerHour:2.4},resources:{freshwater:{enabled:true,tanks:[{levelPath:'tanks.freshWater.main.currentLevel',capacity:100}],learning:{fallbackCrewCount:3,paused:true}},fuel:{enabled:false}}});}
test('legacy passage route passes pre-start validation and is removed without losing settings',()=>{
 for(const passage of [{enabled:true,routeId:'Suag2Hol'},{enabled:true,fuelLitresPerHour:2.4,routeId:''}]){
  const clean=legacy();clean.passage={...passage};delete clean.passage.routeId;
  const old=structuredClone(clean);old.passage.routeId=passage.routeId;
  valid(old);const migrated=migrateOptions(old);
  assert.deepEqual(migrated,clean);assert.equal(old.passage.routeId,passage.routeId);
  assert.deepEqual(migrateOptions(migrated),migrated);valid(migrated);
  assert.equal(Object.hasOwn(normalize(old).passage,'routeId'),false);
 }
 assert.equal(Object.hasOwn(schema.properties.passage.properties,'routeId'),false);
 assert.equal(validate({configuration:{passage:{routeId:42}}}),false);
 assert.equal(validate({configuration:{passage:{unrelated:'reject'}}}),false);
 assert.equal(validate({configuration:{passage:{fuelLitresPerHour:-1}}}),false);
});
test('upgrade persists cleaned configuration and subsequent settings changes validate and save',()=>{
 const clean=legacy(),old=structuredClone(clean);old.passage.routeId='Suag2Hol';
 let persisted=structuredClone(old),saves=0;
 const plugin=create({getSelfPath:()=>undefined,handleMessage:()=>{},setPluginStatus:()=>{},setPluginError:e=>assert.fail(e),savePluginOptions:(options,cb)=>{valid(options);persisted=structuredClone(options);saves++;cb(null);}});
 try{
  valid(persisted);plugin.start(persisted);
  assert.deepEqual(persisted,clean);assert.equal(saves,1);
  for(const enabled of [false,true]){
   const submitted=structuredClone(persisted);submitted.resources.freshwater.enabled=enabled;
   valid(submitted);persisted=submitted;plugin.start(persisted);
   assert.equal(persisted.resources.freshwater.enabled,enabled);
   assert.deepEqual(persisted,{...clean,resources:{...clean.resources,freshwater:{...clean.resources.freshwater,enabled}}});
  }
  assert.equal(saves,1,'cleaned configuration does not trigger repeated migration saves');
 }finally{plugin.stop();}
});
