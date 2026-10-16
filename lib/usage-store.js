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
    save(data){fs.mkdirSync(dir,{recursive:true});const temp=file+'.tmp';fs.writeFileSync(temp,JSON.stringify(data)+'\n',{mode:0o600});fs.renameSync(temp,file);}
  };
}
module.exports={storage};
