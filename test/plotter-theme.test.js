'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
test('panel follows trusted Freeboard dark and light events, ignoring other windows and origins',()=>{
  const events={},messages=[],night=[];const parent={postMessage:message=>messages.push(message)};
  const context={window:{},parent,location:{origin:'https://boat'},document:{getElementById:()=>({}),body:{classList:{toggle:(name,value)=>night.push([name,value])}}},EnduranceDashboardLink:{connect:()=>({handshake(){},receive(){},dispose(){}})},EnduranceReserve:{createReader:()=>()=>[]},setTimeout(){},clearTimeout(){},setInterval(){},clearInterval(){},addEventListener:(name,fn)=>{events[name]=fn;},fetch:()=>new Promise(()=>{}),AbortSignal};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../public/plotterext/panel.js'),'utf8'),context);
  const send=(msg,extra={})=>events.message({source:parent,origin:'https://boat',data:{bus:'plotterExt/1',msg},...extra});
  send({method:'bus.handshake',params:{capabilities:['nightMode','windows']}});
  assert.ok(messages.some(m=>m.msg.method==='nightMode.get'));assert.ok(messages.some(m=>m.msg.method==='events.subscribe'&&m.msg.params.patterns.includes('nightMode.changed')));
  send({id:'theme',result:{enabled:true}});send({method:'nightMode.changed',params:{enabled:false}});send({method:'nightMode.changed',params:{enabled:true}});
  assert.deepEqual(night,[['night',true],['night',false],['night',true]]);
  send({method:'nightMode.changed',params:{enabled:false}},{source:{}});send({method:'nightMode.changed',params:{enabled:false}},{origin:'https://other'});assert.equal(night.length,3);
});
