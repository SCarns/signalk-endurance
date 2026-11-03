'use strict';
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./view-model'));else root.EndurancePassageView=factory(root.EnduranceView);})(typeof globalThis!=='undefined'?globalThis:this,function(view){
  const finite=n=>typeof n==='number'&&Number.isFinite(n);
  const names={energy:'Power',freshwater:'Freshwater',fuel:'Fuel',propane:'Propane',holding:'Holding tanks'};
  const states={SUFFICIENT:['Covered','good'],SHORTFALL:['Shortfall','critical'],PROVISIONAL:['Provisional','watch'],UNKNOWN:['Incomplete','neutral']};
  const reasons={CONSUMPTION_UNAVAILABLE:'Consumption estimate unavailable',FORECAST_HORIZON:'Passage extends beyond the energy forecast',ROUTE_LOADS_UNVERIFIED:'Route-specific electrical loads are not verified',INCOMPLETE_SUPPLY:'Supply data is incomplete',NO_FORECAST_COVERAGE:'No forecast coverage for this passage',FORECAST_UNAVAILABLE:'Energy forecast unavailable',INVALID_FORECAST:'Energy forecast could not be read',INCOMPLETE_FORECAST:'Energy forecast coverage is incomplete',MEASURED_SOC_UNAVAILABLE:'Measured SOC is unavailable',MEASURED_RESERVE:'Current SOC is at or below reserve',FORECAST_RESERVE_CROSSING:'Forecast SOC reaches the reserve',RESERVE:'Supply is at or beyond the configured reserve',INDIVIDUAL_TANK_RESERVE:'An individual tank has reached its reserve',PROFILE_AT_CURRENT_RATE:'At the current consumption estimate',PROFILE_AT_PLANNING_RATE:'At your configured planning fuel rate',PROFILE_AT_PASSAGE_BRIEF_RATE:'At Passage Brief’s planning fuel rate'};
  function build(p,units){
    const volume=n=>{const v=view.volume(n,units);return v?`${v.value} ${v.unit}`:'Unavailable';};
    const hours=n=>finite(n)&&n>=0?`${(n/3600).toFixed(1)} hours`:'Unavailable';
    const percent=n=>finite(n)&&n>=0&&n<=1?`${(n*100).toFixed(1)}%`:'Unavailable';
    const cards=Object.entries(p.resources||{}).map(([key,r])=>{
      const [badge,tone]=states[r.status]||states.UNKNOWN;
      const c={key,name:names[key]||key,badge,tone,metric:{value:'—',unit:''},label:'Passage estimate unavailable',facts:[],note:reasons[r.reason]||'Passage information is incomplete.'};
      if(key==='energy'){
        if(finite(r.minimumSOC)&&r.minimumSOC>=0&&r.minimumSOC<=1)c.metric={value:(r.minimumSOC*100).toFixed(1),unit:'%'};
        c.label='Lowest forecast SOC';
        c.facts.push({label:'SOC reserve',value:percent(r.reserve)},{label:'Forecast covers',value:hours(r.coveredSeconds)});
        if(finite(r.uncoveredSeconds)&&r.uncoveredSeconds>0)c.facts.push({label:'Beyond forecast',value:hours(r.uncoveredSeconds)});
        if(r.forecastSource)c.facts.push({label:'Forecast source',value:r.forecastSource});
      }else{
        const v=view.volume(r.requiredM3,units);if(v)c.metric=v;
        c.label='Planned fuel use';if(key!=='fuel')c.label='Planned resource use';
        if(key==='freshwater')c.label='Planned freshwater use';
        if(finite(r.availableM3)&&r.availableM3>=0)c.facts.push({label:'Available above reserve',value:volume(r.availableM3)});
        if(finite(r.reserveM3))c.facts.push({label:'Reserved',value:volume(r.reserveM3)});
        if(key==='fuel'){
          if(finite(r.litresPerHour))c.facts.push({label:'Burn rate',value:`${r.litresPerHour.toFixed(2)} L/hour`});
          if(r.rateBasis)c.facts.push({label:'Rate source',value:({PLANNING_ESTIMATE:'Configured planning estimate',PASSAGE_BRIEF_SETTING:'Passage Brief setting',LIVE_SOURCE:'Live consumption source'})[r.rateBasis]||'Unavailable'});
          if(finite(r.fuelDemandSeconds))c.facts.push({label:r.fuelDurationBasis==='FULL_PLANNED_DURATION'?'Full-duration engine allowance':'Predicted engine use',value:hours(r.fuelDemandSeconds)});
        }
      }
      return c;
    });
    return {tone:(states[p.status]||states.UNKNOWN)[1],cards};
  }
  return {build};
});
