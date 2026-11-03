'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const selection=require('../public/passage-selection');
const store=values=>({getItem:key=>values[key]??null});
test('planning selection and fuel scenario match the dashboard without activating a route',()=>{
 const saved=selection.read(store({'endurance.passage.route':'Saug2Island','endurance.passage.fuelBasis':'full-duration'}),'@active');assert.deepEqual(saved,{routeId:'Saug2Island',fuelBasis:'full-duration'});
 const query=new URL('https://boat'+selection.query(saved.routeId,saved.fuelBasis,{litresPerHour:2,fetchedAt:'2026-11-03T02:00:00Z'})).searchParams;
 assert.equal(query.get('routeId'),'Saug2Island');assert.equal(query.get('fuelBasis'),'full-duration');assert.equal(query.get('passageBriefFuelLitresPerHour'),'2');
 assert.equal(selection.read(store({}),'configured-route').routeId,'configured-route');assert.equal(selection.read(store({}),'@active').routeId,'@active');assert.equal(selection.read({getItem(){throw Error('unavailable');}},'@active').routeId,'@active');
});
function element(){return {children:[],textContent:'',append(...nodes){this.children.push(...nodes);},replaceChildren(...nodes){this.children=nodes;}};}
const text=e=>e.textContent+' '+e.children.map(text).join(' ');
async function run({enabled=true,failed=false,expired=false}={}){
 const nodes={summary:element(),cards:element(),passage:element()},calls=[];
 const p={status:'SHORTFALL',message:'Plan replenishment or revise the passage.',estimateAvailable:true,route:{name:'Saug2Island',durationSeconds:146520},navigation:{following:false},resources:{fuel:{status:'SUFFICIENT',requiredM3:.001,availableM3:.1}}};
 const context={window:{EnduranceTheme:{update(){}}},localStorage:store({'endurance.passage.route':'saved-route','endurance.passage.fuelBasis':'full-duration'}),document:{getElementById:id=>nodes[id],createElement:()=>element()},EndurancePassageSelection:selection,EnduranceView:require('../public/view-model'),EndurancePassageView:require('../public/passage-view-model'),EnduranceReserve:{createReader:()=>async()=>[]},EndurancePassageFuel:{createReader:()=>({read:async()=>({litresPerHour:2,fetchedAt:new Date().toISOString()})})},AbortSignal,JSON,setTimeout(){},clearTimeout(){},addEventListener(){},fetch:async(url,options)=>{
 calls.push({url,options});if(url.endsWith('/assessment'))return {ok:true,json:async()=>({running:true,display:{freeboardEnabled:true,passageEnabled:enabled},assessment:{status:'OK',message:'Healthy',timestamp:new Date(Date.now()-(expired?3600000:0)).toISOString(),resources:{energy:{status:'OK',input:{valid:true,value:.9}}},passage:{status:'UNKNOWN',reason:'NO_ACTIVE_ROUTE',resources:{}}}})};
 if(failed)throw Error('offline');return {ok:true,json:async()=>p};
 }};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../public/plotterext/panel.js'),'utf8'),context);
 await new Promise(resolve=>setImmediate(resolve));return {nodes,calls};
}
test('widget replaces unknown default passage with the saved planning route assessment',async()=>{const {nodes,calls}=await run();const passage=text(nodes.passage);assert.match(passage,/Saug2Island/);assert.match(passage,/Projected shortfall/);assert.match(passage,/Planning only/);assert.match(passage,/full planned duration/);assert.doesNotMatch(passage,/UNKNOWN/);assert.equal(calls.length,2);const q=new URL('https://boat'+calls[1].url).searchParams;assert.equal(q.get('routeId'),'saved-route');assert.equal(q.get('fuelBasis'),'full-duration');assert.equal(q.get('passageBriefFuelLitresPerHour'),'2');assert.ok(calls.every(c=>!c.options.method||c.options.method==='GET'));});
test('failed planning assessment does not blank or invalidate live resource cards',async()=>{const {nodes}=await run({failed:true});assert.match(text(nodes.passage),/Passage assessment unavailable/);assert.match(text(nodes.cards),/Power/);assert.match(text(nodes.summary),/No action needed/);});
test('disabled passage and stale resource assessments do not trigger a passage request',async()=>{for(const options of [{enabled:false},{expired:true}]){const {nodes,calls}=await run(options);assert.equal(calls.length,1);assert.equal(nodes.passage.children.length,0);}});
test('no active route explains how to select a planning passage',()=>{assert.match(selection.summary({status:'UNKNOWN',reason:'NO_ACTIVE_ROUTE'}).message,/Choose a planning passage/);});
test('retired config route override is hidden and ignored while saved options remain loadable',()=>{const {normalize,schema}=require('../lib/config');assert.equal(schema.properties.passage.properties.routeId,undefined);const options=normalize({passage:{enabled:true,routeId:'retired-override'}});assert.equal(options.passage.enabled,true);assert.equal(Object.hasOwn(options.passage,'routeId'),false);const selected=selection.read(store({}),'@active');assert.equal(selected.routeId,'@active');});
test('viewer payload has no hidden config route selection',()=>{let handler;require('../index')({}).registerWithRouter({get:(url,fn)=>{if(url==='/assessment')handler=fn;}});let payload;handler({}, {json:value=>{payload=value;}});assert.equal(Object.hasOwn(payload.display,'passageRouteId'),false);});
