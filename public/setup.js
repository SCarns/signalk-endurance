'use strict';
async function refresh() {
  const status=document.getElementById('connection');
  try {
    const results=await Promise.all(['discovery','assessment'].map(async name=>{
      const response=await fetch(`/plugins/signalk-endurance/${name}`,{credentials:'same-origin'});
      if(!response.ok) throw Error(`Server returned ${response.status}. Sign in as a Signal K administrator and enable Endurance.`);
      return response.json();
    }));
    const [discovery,result]=results;
    status.textContent=discovery.running?'Endurance is running.':'Enable Endurance in Plugin Config to begin discovery.';
    const container=document.getElementById('sources');container.replaceChildren();
    for(const [name,list] of Object.entries(discovery.candidates)) {
      const section=document.createElement('div'),title=document.createElement('h3');title.textContent=name==='energy'?'Energy — SOC':`${name} — Level`;section.append(title);
      const config=discovery.configuration?.resources[name];
      const note=document.createElement('p');
      note.textContent=config?.enabled===false?'Disabled':config?.tanks?.length?`${config.tanks.filter(t=>t.enabled).length} configured tanks; ${config.assessmentMode} assessment`:config?.levelPath?`Configured: ${config.levelPath}`:list.length===1?'Automatically selected':list.length?(name==='energy'?'Choose a house bank in Plugin Config':'Add tanks in Plugin Config'):(name==='energy'?'No SOC source found':'No level source found');section.append(note);
      for(const source of list){const p=document.createElement('p');p.textContent=`${source.path} — ${JSON.stringify(source.value)}; ${source.timestamp||'no timestamp'}; ${source.source||'source unavailable'}`;section.append(p);if(name!=='energy'){const paths=document.createElement('p');paths.textContent=`Full capacity: ${source.capacityPath} (${source.capacityM3??'unavailable'} m³); current volume: ${source.volumePath||'calculated from level × capacity when available'}`;section.append(paths);}}
      if(name==='energy'&&result.assessment?.resources?.energy){
        const energy=result.assessment.resources.energy;
        for(const [label,input] of [['Energy forecast',energy.prediction],['Battery time remaining',energy.duration]]){const p=document.createElement('p');p.textContent=`${label}: ${input?.path||'No matching battery bank selected'} — ${input?.selection==='CONFIGURED'?'configured':input?.selection==='AUTO_DISCOVERED'?'automatically discovered':'not found'}; ${input?.valid?'fresh':'unavailable or stale'}`;section.append(p);}
      }
      container.append(section);
    }
    const forecast=result.assessment?.resources?.energy?.prediction;
    const recognized=['surplus','rising','stable','deficit','critical'].includes(String(forecast?.value||'').toLowerCase());
    document.getElementById('energy-integration').textContent=forecast?.valid&&recognized?`Energy forecast data is available from ${forecast.path}. Endurance can use it for advance charging guidance.`:forecast?.selection==='AUTO_DISCOVERED'||forecast?.selection==='CONFIGURED'?`The forecast path ${forecast.path} is selected, but its status is stale, unavailable or unrecognized. Check Energy Predictor and the selected path.`:'Energy Predictor status data has not been found. If you use Energy Predictor, check that it is enabled and publishing, or enter its custom status path. SOC assessment still works.';
    const water=result.assessment?.resources?.freshwater;
    const duration=water?.time;
    const labels={default:'Default estimate',learning:'Learning — starting estimate',learned:'Learned estimate',external:'External estimate',unavailable:'Unavailable'};
    const label=labels[water?.rateSource]||'Unavailable';
    const reasons={STARTING:'Starting observations',SUPPLY_CHANGED:'Water supply changed',SUPPLY_OR_CREW_CHANGED:'Starting observations for this crew',SETTLING:'Settling tank readings',OBSERVING:'Observing usage',BELOW_SENSOR_RESOLUTION:'Waiting for a measurable change',CONFIRMING_USAGE:'Confirming usage',UNCONFIRMED_MOVEMENT:'Waiting for stable readings',TRANSFER_OR_MIXED_MOVEMENT:'Transfer or unsettled readings excluded',REFILL:'Refill excluded',OBSERVATION_ACCEPTED:'Usage observation accepted',IMPLAUSIBLE_USAGE:'Unusually large change excluded',OBSERVATION_GAP:'Observation gap excluded',OBSERVATION_TOO_LONG:'Old observation interval excluded',INCOMPLETE_VOLUME:'Waiting for all tank volumes',LEARNING_PAUSED:'Learning paused',UNSETTLED_TIMESTAMPS:'Waiting for aligned tank readings',CLOCK_OR_SOURCE_CHANGED:'Sensor timing changed'};
    const progress=water?.learning?` (${(water.learning.observationHours||0).toFixed(1)} observed hours; ${reasons[water.learning.reason]||'Waiting for observations'})`:'';
    document.getElementById('water-duration').textContent=typeof duration==='number'&&Number.isFinite(duration)?`${(duration/86400).toFixed(1)} days to empty — ${label}${progress}`:`Unavailable — ${label}${progress}`;
    document.getElementById('assessment').textContent=result.assessment?JSON.stringify(result.assessment,null,2):'No assessment yet.';
  }catch(error){status.textContent=error.message;}
}
document.getElementById('refresh').addEventListener('click',refresh);refresh();
