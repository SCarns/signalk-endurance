'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const extension=require('../lib/plotter-extension');const {normalize,schema}=require('../lib/config');
test('Freeboard defaults on, validates config, and does not change resource settings',()=>{assert.equal(normalize({}).enableFreeboard,true);assert.equal(normalize({enableFreeboard:false}).enableFreeboard,false);assert.deepEqual(normalize({}).resources,normalize({enableFreeboard:false}).resources);assert.throws(()=>normalize({enableFreeboard:'false'}));assert.equal(schema.properties.enableFreeboard.default,true);});
test('provider follows live enablement, registers once, exposes only its own read-only resource',async()=>{let active=true,provider,count=0;const register=extension({registerResourceProvider:p=>{provider=p;count++;}},()=>active);register();register();assert.equal(count,1);const m=provider.methods;const manifest=await m.getResource('signalk-endurance');assert.equal(manifest.buttons[0].slot,'mapToolbar');assert.equal(manifest.buttons[0].icon,'hourglass_empty');assert.equal(manifest.buttons[0].action.type,'toggleWindow');assert.equal(manifest.panels[0].type,'iframe');assert.ok(manifest.requires.includes('windows'));assert.ok((await m.listResources())['signalk-endurance']);await assert.rejects(m.getResource('other'));await assert.rejects(m.setResource());await assert.rejects(m.deleteResource());active=false;assert.deepEqual(await m.listResources(),{});await assert.rejects(m.getResource('signalk-endurance'));active=true;assert.ok((await m.listResources())['signalk-endurance']);});
test('old servers without provider API and registration errors leave monitoring alone',()=>{assert.doesNotThrow(()=>extension({},()=>true)());assert.doesNotThrow(()=>extension({registerResourceProvider(){throw Error('unsupported');}},()=>true)());});
test('plugin restarts withdraw extension while assessments and Signal K publication continue',async()=>{
  let provider,count=0;const messages=[],routes={};
  const app={getSelfPath:()=>undefined,handleMessage:(_id,message)=>messages.push(message),setPluginStatus(){},setPluginError:e=>{throw Error(e);},registerResourceProvider:p=>{provider=p;count++;}};
  const plugin=require('../index')(app);plugin.registerWithRouter({get:(url,handler)=>{routes[url]=handler;}});
  try{
    plugin.start({});assert.ok((await provider.methods.listResources())['signalk-endurance']);
    let payload;routes['/assessment']({}, {json:v=>{payload=v;}});assert.equal(payload.display.freeboardEnabled,true);const baseline=payload.assessment;
    plugin.start({enableFreeboard:false});assert.deepEqual(await provider.methods.listResources(),{});assert.equal(count,1);
    routes['/assessment']({}, {json:v=>{payload=v;}});assert.equal(payload.running,true);assert.equal(payload.display.freeboardEnabled,false);assert.deepEqual(payload.assessment.resources,baseline.resources);assert.equal(payload.assessment.status,baseline.status);assert.ok(messages.at(-1).updates[0].values.some(v=>v.path==='environment.endurancePreview.status'));
    plugin.start({});assert.ok((await provider.methods.listResources())['signalk-endurance']);
  }finally{plugin.stop();}
  assert.deepEqual(await provider.methods.listResources(),{});
});
