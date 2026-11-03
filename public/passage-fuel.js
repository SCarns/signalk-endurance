'use strict';
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.EndurancePassageFuel=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
  // Read only PB's public simulation settings with the viewer's existing session.
  // No credentials, plugin configuration files, or server-side auth bypass.
  function createReader(fetcher,{now=Date.now,ttlMs=60000,timeoutMs=5000}={}){
    let checkedAt=-Infinity,snapshot=null,pending=null;
    return {async read(){
      if(pending)return pending;
      if(now()-checkedAt>=0&&now()-checkedAt<ttlMs)return snapshot;
      snapshot=null;
      pending=(async()=>{
        const controller=new AbortController();
        const timer=setTimeout(()=>controller.abort(),timeoutMs);
        try{
          const response=await fetcher('/plugins/signalk-passage-briefing/api/config',{credentials:'same-origin',signal:controller.signal});
          if(!response.ok)throw Error('Passage Brief settings unavailable');
          const data=await response.json();
          const rate=data?.motor_fuel_l_per_hour;
          if(typeof rate==='number'&&Number.isFinite(rate)&&rate>0)snapshot={litresPerHour:rate,fetchedAt:new Date(now()).toISOString()};
        }catch{snapshot=null;}
        finally{clearTimeout(timer);checkedAt=now();pending=null;}
        return snapshot;
      })();
      return pending;
    }};
  }
  return {createReader};
});
