 'use strict';
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.EnduranceReserve=factory();})(globalThis,function(){
  function cards(items,sites){
    if(!Array.isArray(items))return [];
    const aboard=items.map(i=>{if(!i||!Array.isArray(i.site_quantities))return i;
      if(!Array.isArray(sites))return null;
      const vesselIds=new Set(sites.filter(s=>s.is_vessel===true||s.is_vessel===1).map(s=>s.id));
      const quantities=i.site_quantities.filter(q=>vesselIds.has(q.site_id));
      if(!quantities.length||quantities.some(q=>typeof q.quantity!=='number'||!Number.isFinite(q.quantity)||q.quantity<0))return null;
      return {...i,actual_quantity:quantities.reduce((sum,q)=>sum+q.quantity,0)};
    });
    return aboard.filter(i=>i && typeof i.name==='string' && /(?:^|[^\p{L}])rum(?:$|[^\p{L}])/iu.test(i.name) && typeof i.actual_quantity==='number' && Number.isFinite(i.actual_quantity) && i.actual_quantity>0)
      .map(i=>({key:'reserve',name:'Rum Reserve',badge:'Aboard',tone:'neutral',metric:{value:String(i.actual_quantity),unit:typeof i.unit==='string'?i.unit:''},label:i.name,facts:[],note:'For the captain’s consideration. 🏴‍☠️',tanks:[]}));
  }
  function createReader(fetcher){let next=0,cached=[],pending;
    return async function(){if(pending)return pending;if(Date.now()<next)return cached;
      next=Date.now()+60000;
      pending=(async()=>{try{const res=await fetcher('/plugins/signalk-stowage-mgmt/items',{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(5000)});if(!res.ok){cached=[];}else{const items=await res.json();let sites;
        if(Array.isArray(items)&&items.some(i=>Array.isArray(i?.site_quantities))){const response=await fetcher('/plugins/signalk-stowage-mgmt/sites',{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(5000)});if(response.ok)sites=await response.json();}
        cached=cards(items,sites);}}catch{cached=[];}finally{pending=null;}return cached;})();return pending;
    };
  }
  return {cards,createReader};
});
