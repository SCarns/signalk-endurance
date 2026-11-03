'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {listRoutes,passageView}=require('../lib/passage-view');
const {normalize}=require('../lib/config');
const now=Date.now();
const resource={name:'Harbor passage',feature:{properties:{source:'signalk-weather-router-plus',total_time_s:7200,sailing_time_s:3600,motoring_time_s:3600,departure:new Date(now).toISOString(),arrival:new Date(now+7200000).toISOString()}}};
function app(){return {getSelfPath:p=>p==='navigation.position'?{value:{latitude:41,longitude:-87},timestamp:new Date(now).toISOString()}:undefined,getCourse:async()=>({activeRoute:{href:'/resources/routes/a',pointIndex:2,pointTotal:8}}),resourcesApi:{listResources:async()=>({a:resource,b:{name:'A manually drawn route'}}),getResource:async()=>resource}};}
test('saved route list retains unsupported routes, names and stable IDs',async()=>{
 const routes=await listRoutes(app());assert.deepEqual(routes.map(r=>r.id),['@active','b','a']);assert.equal(routes[1].profileAvailable,false);assert.equal(routes[2].profileAvailable,true);
});
test('selected route assessment works without activating it and leaves course unchanged',async()=>{
 const provider=app();let courseCalls=0;provider.getCourse=async()=>{courseCalls++;return {activeRoute:null};};
 const view=await passageView(provider,'a',{resources:{}},normalize(),now);
 assert.equal(view.route.name,'Harbor passage');assert.equal(view.navigation.following,false);assert.equal(view.navigation.nextWaypointIndex,null);assert.equal(view.navigation.vesselPosition.longitude,-87);assert.equal(courseCalls,1);
});
test('reported waypoint progress only belongs to matching active route and never reduces demand',async()=>{
 const provider=app();const current=await passageView(provider,'a',{resources:{}},normalize(),now);
 assert.equal(current.navigation.nextWaypointIndex,2);assert.equal(current.navigation.waypointCount,8);assert.equal(current.route.durationSeconds,7200);
 const other=await passageView(provider,'b',{resources:{}},normalize(),now);assert.equal(other.navigation.following,false);assert.equal(other.navigation.nextWaypointIndex,null);
});
test('stale position and absent course do not invent progress',async()=>{
 const provider=app();provider.getCourse=async()=>{throw Error('offline');};provider.getSelfPath=()=>({value:{latitude:41,longitude:-87},timestamp:new Date(now-121000).toISOString()});
 const view=await passageView(provider,'a',{resources:{}},normalize(),now);assert.equal(view.navigation.vesselPosition,null);assert.equal(view.navigation.nextWaypointIndex,null);
});
test('route read failures are explicit; invalid route IDs never reach provider',async()=>{
 const provider=app();let calls=0;provider.resourcesApi.getResource=async()=>{calls++;throw Error('missing');};
 await assert.rejects(()=>passageView(provider,'../other',{resources:{}},normalize(),now));assert.equal(calls,0);
 await assert.rejects(()=>passageView(provider,'a',{resources:{}},normalize(),now),/missing/);
 await assert.rejects(()=>listRoutes({}),/unavailable/);
});
test('readonly route endpoints require enabled passage and do not expose selection writes',async()=>{
 const create=require('..');const routes={};const provider={...app(),handleMessage:()=>{},setPluginStatus:()=>{},setPluginError:e=>{throw Error(e);}};const plugin=create(provider);
 plugin.registerWithRouter({access:level=>{assert.equal(level,'readonly');return {get:(p,fn)=>{routes[p]=fn;}};},get:()=>{}});
 const response={code:200,status(n){this.code=n;return this;},json(d){this.data=d;}};
 await routes['/passage/routes']({},response);assert.equal(response.code,409);
 try{plugin.start({passage:{enabled:true}});response.code=200;await routes['/passage/routes']({},response);assert.equal(response.data.routes.length,3);await routes['/passage/assessment']({query:{routeId:'../x'}},response);assert.equal(response.code,400);}finally{plugin.stop();}
});

test('active route entry is first, keeps all saved routes, and disappears without an active route',async()=>{
 const provider=app();const routes=await listRoutes(provider);
 assert.equal(routes[0].id,'@active');assert.equal(routes[0].routeId,'a');assert.equal(routes[0].name,'Active route · Harbor passage');
 assert(routes.some(r=>r.id==='a'));assert(routes.some(r=>r.id==='b'));
 provider.getCourse=async()=>({activeRoute:null});assert.deepEqual((await listRoutes(provider)).map(r=>r.id),['b','a']);
});
test('active selection follows route changes and never reuses a cancelled route',async()=>{
 const provider=app();let id='a';const calls=[];
 provider.getCourse=async()=>({activeRoute:id?{href:'/resources/routes/'+id}:null});
 provider.resourcesApi.getResource=async(type,route)=>{calls.push(route);return resource;};
 assert.equal((await passageView(provider,'@active',{resources:{}},normalize(),now)).route.id,'a');
 id='b';assert.equal((await passageView(provider,'@active',{resources:{}},normalize(),now)).route.id,'b');
 id=null;assert.equal((await passageView(provider,'@active',{resources:{}},normalize(),now)).reason,'NO_ACTIVE_ROUTE');
 assert.deepEqual(calls,['a','b']);
});
test('upstream visibility requires a current complete route profile, not healthy resource readings',async()=>{
 const {usableEstimate}=require('../lib/passage-view');const {adaptRoute}=require('../lib/passage');
 const plan=adaptRoute(resource,'a');assert.equal(usableEstimate(plan,now),true);
 for(const invalid of [{...plan,status:'UNKNOWN'},{...plan,durationSeconds:0},{...plan,arrival:new Date(now-1).toISOString()},{...plan,departure:null}])assert.equal(usableEstimate(invalid,now),false);
 const view=await passageView(app(),'a',{resources:{}},normalize(),now);assert.equal(view.status,'UNKNOWN');assert.equal(view.estimateAvailable,true);
});
test('no upstream estimates leaves passage pane hidden without affecting resource cards',()=>{
 const {passageVisible,build}=require('../public/view-model');
 assert.equal(passageVisible(true,[]),false);assert.equal(passageVisible(true,[{profileAvailable:false}]),false);
 assert.equal(passageVisible(false,[{profileAvailable:true}]),false);assert.equal(passageVisible(true,[{profileAvailable:false},{profileAvailable:true}]),true);
 const view=build({running:true,assessment:{timestamp:new Date(now).toISOString(),status:'OK',resources:{energy:{status:'OK',input:{value:.9}}}},display:{}},null,now);
 assert.equal(view.cards.length,1);
});
test('view fuel scenario is isolated from shared configuration and other viewers',async()=>{
 const provider=app();const config=normalize({passage:{fuelLitresPerHour:1.8}});
 const original=structuredClone(config);
 const assessment={resources:{fuel:{status:'OK',totals:{complete:true,capacityM3:1,currentVolumeM3:.8},consumptionRate:null}}};
 const standard=await passageView(provider,'a',assessment,config,now);
 const full=await passageView(provider,'a',assessment,config,now,{fuelBasis:'full-duration'});
 assert.equal(standard.fuelBasis,'route-profile');assert.equal(full.fuelBasis,'full-duration');
 assert(full.resources.fuel.requiredM3>standard.resources.fuel.requiredM3);
 assert.deepEqual(full.route,standard.route);assert.deepEqual(config,original);
 assert.deepEqual(await passageView(provider,'a',assessment,config,now),standard);
});
