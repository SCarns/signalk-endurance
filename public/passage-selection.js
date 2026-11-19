'use strict';
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.EndurancePassageSelection=factory();})(globalThis,function(){
  function read(storage,defaultRoute=''){
    let routeId=defaultRoute,fuelBasis='route-profile';
    try{routeId=storage.getItem('endurance.passage.route')||defaultRoute;const saved=storage.getItem('endurance.passage.fuelBasis');if(['full-duration','motor-full'].includes(saved))fuelBasis=saved;}catch{}
    return {routeId,fuelBasis};
  }
  function readTiming(storage,routeId){
    try{return JSON.parse(storage.getItem('endurance.passage.timing.'+routeId))||{};}
    catch{return {};}
  }
  function query(routeId,fuelBasis,pbFuel,timing){
    const params=new URLSearchParams({routeId,fuelBasis});
    if(pbFuel){params.set('passageBriefFuelLitresPerHour',pbFuel.litresPerHour);params.set('passageBriefFuelFetchedAt',pbFuel.fetchedAt);}
    if(timing){
      params.set('planning','true');
      if(timing.departNow)params.set('departureAt','now');
      else if(timing.departure){
        const departure=Date.parse(timing.departure);
        if(Number.isFinite(departure))params.set('departureAt',new Date(departure).toISOString());
      }
      if(timing.duration){
        params.set('durationHours',timing.duration);
        if(timing.motor&&fuelBasis==='route-profile')params.set('motorHours',timing.motor);
      }
    }
    return '/passage/assessment?'+params;
  }
  function summary(p){
    const titles={UNKNOWN:'More information needed',SHORTFALL:'Projected shortfall',PROVISIONAL:'Provisional outlook',SUFFICIENT:'Monitored resources cover this passage'};
    const reasons={NO_ACTIVE_ROUTE:'No active route. Choose a planning passage in Endurance.',UNSUPPORTED_ROUTE:'This route has no supported passage profile.',ROUTE_ENDED_OR_UNDATED:'The route schedule has ended or is undated. Update its passage estimates.'};
    return {title:titles[p.status]||titles.UNKNOWN,message:reasons[p.reason]||p.message||'Passage information unavailable.',routeName:p.route?.name||'',context:p.navigation?.following?'Following this route in Signal K':'Planning only · this route is not active in Signal K'};
  }
  return {read,readTiming,query,summary};
});
