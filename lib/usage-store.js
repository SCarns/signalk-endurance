'use strict';
const fs=require('node:fs');
const path=require('node:path');
function storage(app) {
  if(typeof app.getDataDirPath!=='function')return null;
  const dir=app.getDataDirPath();
  if(typeof dir!=='string'||!dir)throw Error('Endurance data directory is unavailable');
  const file=path.join(dir,'freshwater-usage-v1.json');
  return {
    load(){try{const stat=fs.statSync(file);if(stat.size>262144)throw Error('Usage history is too large');return JSON.parse(fs.readFileSync(file,'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw e;}},
    save(data){fs.mkdirSync(dir,{recursive:true});
      let old=null;try{old=JSON.parse(fs.readFileSync(file,'utf8'));}catch{}
      if(old?.version===1 && data.version===2 && !fs.existsSync(file+'.alpha3-backup'))fs.copyFileSync(file,file+'.alpha3-backup',fs.constants.COPYFILE_EXCL);
      const temp=file+'.tmp';fs.writeFileSync(temp,JSON.stringify(data)+'\n',{mode:0o600});fs.renameSync(temp,file);}
  };
}
function backupOptions(app,options){
  if(typeof app.getDataDirPath!=='function')return;
  const dir=app.getDataDirPath();fs.mkdirSync(dir,{recursive:true});
  const file=path.join(dir,'config-before-alpha4.json');
  if(!fs.existsSync(file))fs.writeFileSync(file,JSON.stringify(options,null,2)+'\n',{flag:'wx',mode:0o600});
}
module.exports={storage,backupOptions};
