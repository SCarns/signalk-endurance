'use strict';
const { test }=require('node:test');
const assert=require('node:assert/strict');
const reference=require('./reference-functions.json');
const {normalize}=require('../lib/config');
const config=normalize();
const constants=new Function('msg','flow',reference['Endurance Constants'])({}, {set:()=>{}}).payload;
test('preserved Node-RED 2.3 resource decisions agree across 303 measured levels',()=>{
  const names={energy:['Energy Endurance','batterySOC','batterySOCAgeSeconds','energyStatus','energyAction'],fuel:['Fuel Endurance','fuelLevel','fuelLevelAgeSeconds','fuelStatus','fuelAction'],propane:['Propane Endurance','propaneLevel','propaneLevelAgeSeconds','propaneStatus','propaneAction']};
  for(const [resource,[name,input,age,status,action]] of Object.entries(names)) {
    const legacy=new Function('msg',reference[name]);
    const monitor=require(`../lib/resources/${resource}`);
    for(let i=0;i<=100;i++) {
      const level=i/100,now=Date.now();
      const expected=legacy({payload:{constants,[input]:level,[age]:0}}).payload;
      const actual=monitor(config.resources[resource],{getSelfPath:()=>({value:level,timestamp:new Date(now).toISOString()})},{path:'test.level',reason:'CONFIGURED'},now);
      assert.equal(actual.status,expected[status],`${resource} ${level}`);
      assert.equal(actual.action,expected[action]||'NONE',`${resource} ${level}`);
    }
  }
});
