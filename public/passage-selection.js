'use strict';
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.EndurancePassageSelection=factory();})(globalThis,function(){
  function read(storage,defaultRoute=''){
    let routeId=defaultRoute,fuelBasis='route-profile';
    try{routeId=storage.getItem('endurance.passage.route')||defaultRoute;if(storage.getItem('endurance.passage.fuelBasis')==='full-duration')fuelBasis='full-duration';}catch{}
    return {routeId,fuelBasis};
  }
  function query(routeId,fuelBasis,pbFuel){
    const params=new URLSearchParams({routeId,fuelBasis});
    if(pbFuel){params.set('passageBriefFuelLitresPerHour',pbFuel.litresPerHour);params.set('passageBriefFuelFetchedAt',pbFuel.fetchedAt);}
    return '/passage/assessment?'+params;
  }
  function summary(p){
    const titles={UNKNOWN:'More information needed',SHORTFALL:'Projected shortfall',PROVISIONAL:'Provisional outlook',SUFFICIENT:'Monitored resources cover this passage'};
    const reasons={NO_ACTIVE_ROUTE:'No active route. Choose a planning passage in Endurance.',UNSUPPORTED_ROUTE:'This route has no supported passage profile.',ROUTE_ENDED_OR_UNDATED:'The route schedule has ended or is undated. Update its passage estimates.'};
    return {title:titles[p.status]||titles.UNKNOWN,message:reasons[p.reason]||p.message||'Passage information unavailable.',routeName:p.route?.name||'',context:p.navigation?.following?'Following this route in Signal K':'Planning only · this route is not active in Signal K'};
  }
  return {read,query,summary};
});
