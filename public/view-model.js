'use strict';
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.EnduranceView=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const names={energy:'Power',freshwater:'Freshwater',fuel:'Fuel',propane:'Propane',holding:'Holding tanks'};
  const units={litres:{factor:.001,label:'L'},gallons:{factor:.003785411784,label:'US gal'},m3:{factor:1,label:'m³'}};
  const finite=v=>typeof v==='number'&&Number.isFinite(v);
  const number=(v,d=1)=>new Intl.NumberFormat(undefined,{maximumFractionDigits:d}).format(v);
  function volume(v,u){return finite(v)&&v>=0?{value:number(v/units[u].factor,u==='m3'?3:1),unit:units[u].label}:null;}
  function duration(v,alwaysDays=false){if(!finite(v)||v<0)return null;return alwaysDays||v>=172800?{value:number(v/86400,1),unit:'days'}:{value:number(v/3600,1),unit:'hours'};}
  const percent=v=>finite(v)&&v>=0&&v<=1?`${Math.round(v*100)}%`:null;
  function build(payload,u,now=Date.now(),connectionLost=false){
    u=units[u]?u:units[payload?.display?.volumeUnits]?payload.display.volumeUnits:'litres';
    const a=payload?.assessment;
    const timestamp=Date.parse(a?.timestamp||'');
    const expired=!!a&&(!Number.isFinite(timestamp)||now-timestamp>Math.max(30000,(payload.display?.intervalSeconds||10)*2500)||timestamp>now+5000);
    const running=payload?.running===true&&!!a;
    const unavailable=!running||expired||connectionLost;
    const resources=a?.resources||{};
    const unknown=Object.keys(names).filter(k=>resources[k]?.status==='UNKNOWN');
    const monitored=Object.keys(resources).filter(k=>names[k]);
    const healthyPartial=a?.status==='OK'&&unknown.length>0;
    const summaries={OK:['No action needed','good'],WATCH:['Keeping an eye on things','watch'],WARNING:['Plan ahead','warning'],CRITICAL:['Needs attention now','critical'],UNKNOWN:['Waiting for vessel data','neutral']};
    let [title,tone]=summaries[a?.status]||summaries.UNKNOWN;
    let message=a?.message||'No resource assessment is available yet.';
    if(healthyPartial){title='Available readings look healthy';message=`No action indicated by available readings. Data unavailable for ${unknown.map(k=>names[k]).join(', ')}.`;}
    if(!running){title='Endurance is not running';tone='neutral';message='Enable Endurance in Plugin Config to start monitoring.';}
    if(expired){title='Waiting for a fresh update';tone='neutral';message='The last assessment is out of date. The readings below are from the previous update.';}
    if(connectionLost){title='Connection unavailable';tone='neutral';message='Current conditions cannot be confirmed. Any readings below are from the previous update.';}
    const alerts=unavailable?[]:monitored.filter(k=>['CRITICAL','WARNING'].includes(resources[k].status)).sort((x,y)=>(resources[x].status==='CRITICAL'?0:1)-(resources[y].status==='CRITICAL'?0:1)).map(k=>({name:names[k],message:resources[k].message}));
    const cards=Object.entries(names).map(([key,name])=>{
      const r=running?resources[key]:null;
      const states={OK:['Healthy','good'],WATCH:['Monitoring','watch'],WARNING:['Plan ahead','warning'],CRITICAL:['Act now','critical'],UNKNOWN:['No data','neutral']};
      const badge=connectionLost?['Last known','neutral']:expired?['Out of date','neutral']:r?(states[r.status]||states.UNKNOWN):['Not monitored','neutral'];
      const card={key,name,badge:badge[0],tone:badge[1],disabled:!r,metric:{value:r?'—':'Not monitored',unit:''},label:r?'Reading unavailable':'',facts:[],note:'',tanks:[]};
      if(!r)return card;
      const fact=(label,value)=>card.facts.push({label,value:value||'Unavailable'});
      if(key==='energy'){
        const soc=r.input?.valid?percent(r.input.value):null;
        if(soc)card.metric={value:soc,unit:''};card.label='Battery state of charge';
        const time=duration(r.time);fact('Battery monitor time',time?`${time.value} ${time.unit}`:null);
        const forecast=r.prediction?.valid?String(r.prediction.value).toLowerCase():'';
        fact('Energy forecast',({surplus:'Surplus expected',rising:'Improving',stable:'Stable',deficit:'Deficit expected',critical:'Reserve crossing expected'})[forecast]||'Not available');
      }else{
        const t=r.totals||{};const current=volume(t.currentVolumeM3,u),full=volume(t.capacityM3,u),free=volume(t.freeVolumeM3,u);
        const text=v=>v?`${v.value} ${v.unit}`:null;
        if(key==='freshwater'){
          const time=duration(r.time,true);if(time)card.metric=time;else if(current)card.metric=current;
          card.label=time?'Estimated until empty':current?'Water available':'Water estimate unavailable';
          fact('Water available',text(current));
          const rate=finite(r.consumptionRate)&&r.consumptionRate>=0?volume(r.consumptionRate*86400,u):null;
          fact('Daily use',rate?`${rate.value} ${rate.unit}/day`:null);
          const source=({default:'Starting estimate',learning:'Learning · using starting estimate',learned:'Learned usage',external:'External usage estimate'})[r.rateSource];
          card.note=source||'Usage estimate unavailable';
          if(r.learning?.source==='learning'||r.learning?.source==='learned')card.note+=` · ${number(r.learning.observationHours||0,1)} hours observed`;
          if(r.learning?.reason==='LEARNING_PAUSED')card.note+=' · learning paused';
        }else if(key==='holding'){
          const fullest=Math.max(-1,...(r.tanks||[]).map(t=>finite(t.levelRatio)?t.levelRatio:-1));
          if(free){card.metric=free;card.label='Combined space available';}else if(fullest>=0){card.metric={value:percent(fullest),unit:''};card.label='Fullest tank';}
          fact('Fullest tank',fullest>=0?percent(fullest):null);fact('Total capacity',text(full));
        }else{
          const ratio=t.levelRatio??(r.tanks?.length===1?r.tanks[0].levelRatio:null);
          if(current)card.metric=current;else if(percent(ratio))card.metric={value:percent(ratio),unit:''};
          card.label='Combined supply available';fact('Total capacity',text(full));fact('Remaining',percent(ratio)||(!t.complete?'Total unavailable':null));
        }
        if(r.assessmentMode==='individual'&&(r.tanks||[]).length>1&&key!=='holding')card.note='Individual tank alerts enabled';
        card.tanks=(r.tanks||[]).map(tank=>{const v=volume(tank.currentVolumeM3,u),cap=volume(tank.capacityM3,u);return {name:tank.name||'Tank',value:v?`${v.value}${cap?` / ${cap.value}`:''} ${v.unit}`:percent(tank.levelRatio)||'Unavailable',issue:['WARNING','CRITICAL'].includes(tank.status)?tank.message:tank.status==='UNKNOWN'?'Data unavailable':''};});
      }
      if(r.status==='UNKNOWN'&&!card.note)card.note=r.reason==='CHOOSE_SOURCE'?'Choose a source in Plugin Config.':r.reason==='INCOMPLETE_TANK_DATA'?'Some tank readings are unavailable.':'Waiting for valid readings.';
      return card;
    });
    return {units:u,title,tone,message,cards,alerts,expired,connectionLost,running,preview:payload?.display?.preview===true,notifications:payload?.display?.notifications===true,timestamp:Number.isFinite(timestamp)?timestamp:null,coverage:running?`${monitored.length-unknown.length} of ${monitored.length} resources reporting`:'No active assessment'};
  }
  return {build,volume,duration};
});
