'use strict';
(function(){
  const modes=['auto','day','night','red'];
  const normalize=mode=>modes.includes(mode)?mode:'auto';
  function resolve(mode,environmentMode,navigationState){
    mode=normalize(mode);if(mode!=='auto')return mode;
    const light=String(environmentMode||'').trim().toLowerCase();
    const state=String(navigationState||'').trim().toLowerCase();
    if(light==='day')return 'day';
    if(light==='night'&&['sailing','motoring'].includes(state))return 'red';
    return 'night';
  }
  const next=mode=>modes[(modes.indexOf(normalize(mode))+1)%modes.length];
  if(typeof module==='object'&&module.exports){module.exports={resolve,next,normalize};return;}
  let mode='auto',environmentMode=null,navigationState=null;
  try{mode=normalize(localStorage.getItem('endurance.display.theme'));}catch{}
  const label=value=>value[0].toUpperCase()+value.slice(1);
  function apply(){
    const effective=resolve(mode,environmentMode,navigationState);
    document.documentElement.dataset.theme=effective;
    const meta=document.querySelector('meta[name="theme-color"]');if(meta)meta.content={day:'#edf3f3',night:'#0b1218',red:'#080000'}[effective];
    const button=document.getElementById('theme');
    if(button){button.textContent={day:'☀︎',night:'☾',red:'◉'}[effective];button.setAttribute('aria-label',`Display theme: ${label(effective)}. Switch to ${label(next(effective)==='auto'?'day':next(effective))}.`);button.title=`${label(effective)} display. Click to select the next manual theme.`;}
    const auto=document.getElementById('theme-auto');
    if(auto){auto.setAttribute('aria-pressed',String(mode==='auto'));auto.title=mode==='auto'&&!['day','night'].includes(String(environmentMode||'').trim().toLowerCase())?'Auto: vessel day/night state unavailable; using Night.':'Auto follows vessel day/night; night sailing or motoring uses Red.';}

  }
  window.EnduranceTheme={update(data={}){environmentMode=data.environmentMode;navigationState=data.navigationState;apply();}};
  apply();
  function select(value){mode=value;try{localStorage.setItem('endurance.display.theme',mode);}catch{}apply();}
  document.addEventListener('DOMContentLoaded',()=>{apply();document.getElementById('theme').addEventListener('click',()=>{const effective=resolve(mode,environmentMode,navigationState);select({day:'night',night:'red',red:'day'}[effective]);});document.getElementById('theme-auto').addEventListener('click',()=>select('auto'));});
})();
