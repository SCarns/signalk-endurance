'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createReader}=require('../public/passage-fuel');
test('Passage Brief reader uses same-origin session and refreshes only a validated setting',async()=>{
 let now=Date.parse('2026-11-02T01:00:00Z'),calls=0,rate=1.8;
 const reader=createReader(async(url,options)=>{calls++;assert.equal(url,'/plugins/signalk-passage-briefing/api/config');assert.equal(options.credentials,'same-origin');return {ok:true,json:async()=>({motor_fuel_l_per_hour:rate})};},{now:()=>now});
 assert.deepEqual(await reader.read(),{litresPerHour:1.8,fetchedAt:new Date(now).toISOString()});
 await reader.read();assert.equal(calls,1);
 now+=60001;rate=2.2;assert.equal((await reader.read()).litresPerHour,2.2);assert.equal(calls,2);
});
test('absent, unauthorized, malformed or failed Passage Brief never provides a fallback rate',async()=>{
 for(const response of [{ok:false},{ok:true,json:async()=>{throw Error('bad JSON');}},...['1.8',null,0,-1,Infinity].map(rate=>({ok:true,json:async()=>({motor_fuel_l_per_hour:rate})}))]){
  assert.equal(await createReader(async()=>response).read(),null);
 }
 assert.equal(await createReader(async()=>{throw Error('offline');}).read(),null);
});
test('a failed refresh clears the previous Passage Brief estimate; concurrent reads share work',async()=>{
 let now=0,calls=0;
 const reader=createReader(async()=>{calls++;return calls===1?{ok:true,json:async()=>({motor_fuel_l_per_hour:1.8})}:{ok:false};},{now:()=>now});
 const first=await Promise.all([reader.read(),reader.read()]);assert.equal(calls,1);assert.deepEqual(first[0],first[1]);
 now=60001;assert.equal(await reader.read(),null);assert.equal(await reader.read(),null);assert.equal(calls,2);
});
test('a stalled Passage Brief request aborts without blocking passage assessment indefinitely',async()=>{
 const reader=createReader((_url,{signal})=>new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(Error('aborted')))),{timeoutMs:5});
 assert.equal(await reader.read(),null);
});
