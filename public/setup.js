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
      container.append(section);
    }
    document.getElementById('assessment').textContent=result.assessment?JSON.stringify(result.assessment,null,2):'No assessment yet.';
  }catch(error){status.textContent=error.message;}
}
document.getElementById('refresh').addEventListener('click',refresh);refresh();
