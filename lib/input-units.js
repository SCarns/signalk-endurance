'use strict';
const factors = Object.freeze({ litres: 0.001, gallons: 0.003785411784, m3: 1 });
const unitSchema = {type:'string',title:'Units for entered volumes',enum:['litres','gallons','m3'],enumNames:['Litres','US gallons','Cubic metres (m³)'],default:'litres',description:'Applies to manual tank capacities and daily usage allowances. If you change units, enter the matching numeric values before saving. Signal K path values always remain in SI units.'};
function toM3(value, units) {
  if(!Object.hasOwn(factors,units))throw Error('Choose litres, US gallons or m³ for entered volumes');
  if(typeof value!=='number'||!Number.isFinite(value)||value<0)throw Error('Entered volume must be a finite nonnegative number');
  const result=value*factors[units];
  if(!Number.isFinite(result))throw Error('Entered volume is too large');
  return result;
}
function legacyValue(value, fromFactor, factor) {return typeof value==='number'?value*fromFactor/factor:value;}
function migrateOptions(options={}) {
  // Only editable values go back to the server. Runtime m³ values are derived separately.
  const result=JSON.parse(JSON.stringify(options));
  result.inputVolumeUnits??='litres';
  const factor=factors[result.inputVolumeUnits];
  if(!factor)throw Error('Choose litres, US gallons or m³ for entered volumes');
  if(result.resources) for(const resource of Object.values(result.resources)) {
    if(!resource||typeof resource!=='object')continue;
    if(Array.isArray(resource.tanks))for(const tank of resource.tanks){
      if(!tank||typeof tank!=='object')continue;
      if(tank.capacity===undefined && Object.hasOwn(tank,'capacityM3'))tank.capacity=legacyValue(tank.capacityM3,1,factor);
      delete tank.capacityM3;
    }
  }
  result.resources??={};
  result.resources.freshwater??={};
  const freshwater=result.resources.freshwater;
  if(freshwater){
    freshwater.learning??={};
    const l=freshwater.learning;
    if(l.defaultUsagePerPersonPerDay===undefined)l.defaultUsagePerPersonPerDay=legacyValue(l.defaultLitresPerPersonPerDay??6,.001,factor);
    if(l.maxUsagePerDay===undefined)l.maxUsagePerDay=legacyValue(l.maxLitresPerDay??1000,.001,factor);
    delete l.defaultLitresPerPersonPerDay;delete l.maxLitresPerDay;
  }
  return result;
}
module.exports={factors,unitSchema,toM3,migrateOptions};
