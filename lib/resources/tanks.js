'use strict';
const { read } = require('../discovery');
const { assessInput } = require('./level');
const finite = value => typeof value === 'number' && Number.isFinite(value);
const rank = { UNKNOWN: -1, OK: 0, WARNING: 1, CRITICAL: 2 };
function unwrap(leaf) { return leaf && typeof leaf === 'object' && Object.hasOwn(leaf, 'value') ? leaf.value : leaf; }
function assessTank(name, config, app, tank, now) {
  const root = tank.levelPath.replace(/\.currentLevel$/, '');
  const level = read(app, tank.levelPath, config.staleSeconds, now);
  const capacityPath = tank.capacityPath || `${root}.capacity`;
  const capacityValue = tank.capacityM3 > 0 ? tank.capacityM3 : unwrap(app.getSelfPath(capacityPath));
  // Capacity is a fixed vessel property, not a sensor reading. It need not be republished.
  const capacity = finite(capacityValue) && capacityValue > 0 ? capacityValue : null;
  const volumePath = tank.volumePath || ['currentVolume', 'remaining'].map(k=>`${root}.${k}`).find(p=>app.getSelfPath(p) !== undefined);
  const measuredVolume = read(app, volumePath, config.staleSeconds, now);
  const levelValid = level.valid && finite(level.value) && level.value >= 0 && level.value <= 1;
  let volume = null, volumeMethod = null;
  if (volumePath) {
    // Never replace an invalid calibrated volume with a linear estimate.
    if (measuredVolume.valid && finite(measuredVolume.value) && measuredVolume.value >= 0 && (capacity === null || measuredVolume.value <= capacity)) {
      volume = measuredVolume.value; volumeMethod = 'MEASURED_VOLUME';
    }
  } else if (levelValid && capacity !== null) {
    volume = level.value * capacity; volumeMethod = 'LEVEL_TIMES_CAPACITY';
  }
  const volumeRatio = volume !== null && capacity !== null ? volume / capacity : null;
  const input = volumeRatio !== null ? { ...(volumePath ? measuredVolume : level), valid: true, value: volumeRatio, path: volumePath || tank.levelPath } : level;
  const result = assessInput(name, config, input, volumeRatio !== null ? 'VOLUME_RATIO' : 'TANK_LEVEL');
  return {
    ...result, name: tank.name || root.split('.').at(-1), levelPath: tank.levelPath,
    level, measuredVolume, volumePath: volumePath || null, capacityPath: tank.capacityM3 > 0 ? null : capacityPath,
    capacityM3: capacity, currentVolumeM3: volume, freeVolumeM3: volume !== null && capacity !== null ? capacity - volume : null,
    levelRatio: volumeRatio ?? (levelValid ? level.value : null), volumeMethod
  };
}
function assessTanks(name, config, app, selection, now) {
  const configured = config.tanks || [];
  const selected = configured.length ? configured.filter(t=>t.enabled) : selection.path ? [{ levelPath: selection.path, name: '', capacityM3: 0 }] : [];
  const tanks = selected.map(t=>assessTank(name, config, app, t, now));
  const seenVolumes = new Set();
  for (const tank of tanks) {
    if (!tank.volumePath) continue;
    if (seenVolumes.has(tank.volumePath)) Object.assign(tank, { currentVolumeM3: null, freeVolumeM3: null, levelRatio: null, status: 'UNKNOWN', action: 'NONE', reason: 'DUPLICATE_VOLUME_SOURCE', message: 'This current-volume source is already included by another tank.' });
    seenVolumes.add(tank.volumePath);
  }
  const count = tanks.length;
  const volumeComplete = count > 0 && tanks.every(t=>t.currentVolumeM3 !== null);
  const capacityComplete = count > 0 && tanks.every(t=>t.capacityM3 !== null);
  const sum = key => { const n = tanks.reduce((s,t)=>s+t[key],0); return Number.isFinite(n) ? n : null; };
  const volume = volumeComplete ? sum('currentVolumeM3') : null;
  const capacity = capacityComplete ? sum('capacityM3') : null;
  const combinedRatio = volume !== null && capacity !== null && capacity > 0 ? volume / capacity : null;
  const totals = { capacityM3: capacity, currentVolumeM3: volume, availableVolumeM3: name === 'holding' ? null : volume, freeVolumeM3: volume !== null && capacity !== null ? capacity-volume : null, levelRatio: combinedRatio, complete: volumeComplete && capacityComplete && volume !== null && capacity !== null, selectedTanks: count, volumeTanks: tanks.filter(t=>t.currentVolumeM3!==null).length };
  const mode = name === 'holding' ? 'individual' : config.assessmentMode || (name === 'freshwater' ? 'combined' : 'individual');
  let result;
  if (mode === 'combined' && combinedRatio !== null) {
    result = assessInput(name, config, { value: combinedRatio, valid: true, reason: 'AVAILABLE' }, 'COMBINED_TANKS');
  } else {
    const worst = tanks.reduce((current,t)=>!current || rank[t.status] > rank[current.status] ? t : current,null);
    result = worst ? { status: worst.status, action: worst.action, reason: worst.reason, message: worst.message, input: worst.input, selection: configured.length ? 'CONFIGURED_TANKS' : selection.reason, resource: name, time: null } : assessInput(name, config, { valid: false, value: null, reason: configured.length ? 'NO_ENABLED_TANKS' : selection.reason }, selection.reason);
    if (worst && ['WARNING','CRITICAL'].includes(worst.status)) { result.message = `${worst.name}: ${worst.message}`; result.limitingTank = worst.levelPath; }
    const incomplete = tanks.some(t=>t.status === 'UNKNOWN') || (mode === 'combined' && count > 1 && combinedRatio === null);
    if (incomplete && !['WARNING','CRITICAL'].includes(result.status)) Object.assign(result, { status: 'UNKNOWN', reason: 'INCOMPLETE_TANK_DATA', message: 'Tank data is incomplete; combined supply cannot be confirmed.' });
  }
  return { ...result, tanks, totals, assessmentMode: mode };
}
module.exports = { assessTanks };
