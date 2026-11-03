'use strict';
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.EnduranceDashboardLink=factory();})(globalThis,function(){
  function connect(link,host){
    let windows=false,pending=null,timer=null,sequence=0;
    const fallback=()=>{pending=null;host.clearTimeout(timer);host.location.assign(link.href);};
    const click=event=>{
      // Preserve the browser's modifier-click and context-menu behavior.
      if(!windows||event.defaultPrevented||event.button!==0||event.shiftKey||event.ctrlKey||event.metaKey||event.altKey)return;
      event.preventDefault();
      if(pending)return;
      pending=`dashboard-${++sequence}`;
      host.parent.postMessage({bus:'plotterExt/1',msg:{jsonrpc:'2.0',id:pending,method:'ui.openWindow',params:{panel:'endurance-dashboard',title:'Endurance dashboard',single:true,geometry:{anchor:'bottom-right',offset:{x:16,y:16},width:'85%',height:'85%'},restoreKey:'endurance-dashboard'}}},host.location.origin);
      timer=host.setTimeout(fallback,5000);
    };
    link.addEventListener('click',click);
    return {
      handshake:params=>{windows=Array.isArray(params?.capabilities)&&params.capabilities.includes('windows');},
      receive:message=>{if(!pending||message?.id!==pending)return;if(message.error){fallback();return;}pending=null;host.clearTimeout(timer);},
      dispose:()=>{host.clearTimeout(timer);pending=null;link.removeEventListener('click',click);}
    };
  }
  return {connect};
});
