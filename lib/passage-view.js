'use strict';
const { adaptRoute, assessPassage, routeId } = require('./passage');
const { read } = require('./discovery');
async function bounded(work) {
  let timer;
  try { return await Promise.race([Promise.resolve().then(work), new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Route provider did not respond.')),5000);})]); }
  finally { clearTimeout(timer); }
}
async function activeCourse(app) {
  if (typeof app.getCourse==='function') {
    const course=await bounded(()=>app.getCourse());
    return {course,id:routeId({getSelfPath:()=>course?.activeRoute},'')};
  }
  return {course:null,id:routeId(app,'')};
}
function usableEstimate(route,now=Date.now()) {
  return route?.status==='AVAILABLE' && route.durationSeconds>0 &&
    Number.isFinite(Date.parse(route.departure)) && Date.parse(route.arrival)>now &&
    Date.parse(route.departure)<Date.parse(route.arrival);
}
async function listRoutes(app) {
  if (!app.resourcesApi?.listResources) throw Error('Saved routes are unavailable on this server.');
  const [routes,active]=await Promise.all([bounded(()=>app.resourcesApi.listResources('routes',{})),activeCourse(app).catch(()=>({id:null}))]);
  const saved=Object.entries(routes||{}).map(([id,r])=>({id,name:typeof r?.name==='string'?r.name:id,
    distanceM:typeof r?.distance==='number'&&Number.isFinite(r.distance)&&r.distance>=0?r.distance:null,
    profileAvailable:usableEstimate(adaptRoute(r,id))})).sort((a,b)=>a.name.localeCompare(b.name));
  if(active.id){
    const selected=saved.find(r=>r.id===active.id);
    saved.unshift({id:'@active',name:'Active route'+(selected?' · '+selected.name:''),active:true,routeId:active.id,distanceM:selected?.distanceM??null,profileAvailable:selected?.profileAvailable??false});
  }
  return saved;
}
async function passageView(app,id,assessment,config,now=Date.now(),scenario={}) {
  if(typeof id!=='string'||!id||(id!=='@active'&&!/^[\w:-]+$/.test(id))) throw Error('Choose a saved route.');
  if(!app.resourcesApi?.getResource) throw Error('Saved routes are unavailable on this server.');
  const activeSelection=await activeCourse(app).catch(()=>({course:null,id:null}));
  const {course}=activeSelection;
  const activeId=activeSelection.id;
  if(id==='@active'){
    if(!activeId)return {status:'UNKNOWN',reason:'NO_ACTIVE_ROUTE',resources:{},navigation:{following:false,vesselPosition:null,nextWaypointIndex:null,waypointCount:null,reverse:null}};
    id=activeId;
  }
  const resource=await bounded(()=>app.resourcesApi.getResource('routes',id));
  const route=adaptRoute(resource,id);
  const position=read(app,'navigation.position',120,now);
  const p=position.value;
  const vesselPosition=position.valid&&typeof p?.latitude==='number'&&Math.abs(p.latitude)<=90&&typeof p?.longitude==='number'&&Math.abs(p.longitude)<=180?{latitude:p.latitude,longitude:p.longitude}:null;
  const active=course?.activeRoute;
  const matches=activeId===id;
  const navigation={following:matches,vesselPosition,
    nextWaypointIndex:matches&&Number.isInteger(active?.pointIndex)&&active.pointIndex>=0?active.pointIndex:null,
    waypointCount:matches&&Number.isInteger(active?.pointTotal)&&active.pointTotal>0?active.pointTotal:null,
    reverse:matches?!!active?.reverse:null};
  const result=assessPassage(route,assessment.resources,config,app,now,scenario);
  return {...result,fuelBasis:scenario.fuelBasis==='full-duration'?'full-duration':'route-profile',estimateAvailable:usableEstimate(route,now),route:{...route,name:resource?.name||id},navigation};
}
module.exports={listRoutes,passageView,usableEstimate};
