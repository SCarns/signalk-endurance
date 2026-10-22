'use strict';
const { assessTanks } = require('./tanks');
const {crewCount} = require('../crew');
const { read } = require('../discovery');
module.exports = (config, app, selection, now, runtime = {}) => {
  const r = assessTanks('freshwater', config, app, selection, now);
  r.volume = config.tanks?.length ? { value: r.totals.currentVolumeM3, valid: r.totals.currentVolumeM3 !== null, reason: 'TANK_TOTAL' } : config.volumePath ? read(app, config.volumePath, config.staleSeconds, now) : { value: r.totals.currentVolumeM3, valid: r.totals.currentVolumeM3 !== null, reason: 'TANK_TOTAL' };
  const internal = config.usageSource === 'internal' || (config.usageSource !== 'external' && !config.consumptionPath);
  r.learning = null;
  if(internal && runtime.waterUsage) {
    const crewInfo=crewCount(app,config.learning,now);
    const crew=crewInfo.count;
    const navLeaf=app.getSelfPath('navigation.state');
    const nav=String(navLeaf?.value ?? navLeaf ?? '').toLowerCase();
    const paused=config.learning.paused || ['sailing','motoring','under way','underway'].includes(nav);
    let samples=r.tanks.map(t=>({volume:t.currentVolumeM3,timestamp:Date.parse((t.volumePath?t.measuredVolume:t.level)?.timestamp||'')}));
    let identity=[r.tanks.map(t=>[t.levelPath,t.volumePath,t.capacityPath]),(config.tanks||[]).filter(t=>t.enabled).map(t=>[t.levelPath,t.capacityM3])];
    if(!config.tanks?.length && config.volumePath) {samples=[{volume:r.volume.valid?r.volume.value:null,timestamp:Date.parse(r.volume.timestamp||'')}];identity=[[config.volumePath,r.volume.source]];}
    r.learning=runtime.waterUsage.observe({now,crew,paused,signature:JSON.stringify(identity),capacity:r.totals.capacityM3,tanks:samples});
    if(!r.learning)r.learning={rate:null,source:'unavailable',reason:'INVALID_INPUT',ready:false};
    r.learning.persistence=runtime.persistence || 'memory';
    r.learning.crewSource=crewInfo.source;
    r.learning.crewReason=crewInfo.reason;
    const ratePerSecond=r.learning.rate;
    delete r.learning.rate;
    r.learning.consumptionRate=typeof ratePerSecond === 'number' ? ratePerSecond : null;
    r.consumption={valid:Number.isFinite(r.learning.consumptionRate),value:r.learning.consumptionRate,units:'m3/s',source:r.learning.source,reason:r.learning.reason};
  } else r.consumption = {...read(app, config.consumptionPath, config.staleSeconds, now),units:config.consumptionUnits,mode:'external'};
  const v = r.volume.value, c = r.consumption.value;
  if (r.volume.valid && r.consumption.valid && typeof v === 'number' && Number.isFinite(v) && v >= 0 && typeof c === 'number' && Number.isFinite(c) && c > 0) {
    const rate = r.consumption.units === 'L/day' ? c / 1000 / 86400 : c;
    r.consumptionRate = rate;
    const seconds = v / rate;
    if (Number.isFinite(seconds)) r.time = seconds;
    // Duration is to empty. Level thresholds separately protect the configured reserve.
    const status = seconds <= 86400 ? 'CRITICAL' : seconds <= 172800 ? 'WARNING' : 'OK';
    const ranks = { UNKNOWN: -1, OK: 0, WARNING: 1, CRITICAL: 2 };
    if ((!internal || r.learning?.ready) && ranks[status] > ranks[r.status]) Object.assign(r, { status, action: status === 'CRITICAL' ? 'REPLENISH_WATER_NOW' : status === 'WARNING' ? 'REPLENISH_WATER_SOON' : 'NONE', reason: 'TIME_TO_EMPTY', message: status === 'CRITICAL' ? 'Replenish freshwater now.' : status === 'WARNING' ? 'Plan to replenish freshwater within 48 hours.' : 'No action required.' });
  }
  r.consumptionRate ??= r.consumption.valid && typeof c === 'number' && Number.isFinite(c) && c >= 0 ? (r.consumption.units === 'L/day' ? c/1000/86400 : c) : null;
  r.rateSource = r.learning?.source || (internal ? 'unavailable' : 'external');
  return r;
};
