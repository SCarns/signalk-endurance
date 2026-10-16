'use strict';
const priority = ['freshwater', 'energy', 'fuel', 'propane', 'holding'];
function decide(resources) {
  const active = priority.map(k => resources[k]).filter(Boolean);
  const missing = active.filter(r => r.status === 'UNKNOWN').map(r => r.resource);
  const intervention = ['CRITICAL', 'WARNING'].flatMap(status => active.filter(r => r.status === status))[0];
  const watch = active.find(r => r.status === 'WATCH');
  const healthy = active.some(r => r.status === 'OK');
  const status = intervention?.status || (watch ? 'WATCH' : healthy ? 'OK' : 'UNKNOWN');
  const durations = ['freshwater', 'energy'].map(k => resources[k]?.time).filter(v => typeof v === 'number' && Number.isFinite(v) && v >= 0);
  return {
    status, action: intervention?.action || 'NONE',
    limitingResource: intervention?.resource || 'none',
    reason: intervention?.reason || (watch ? watch.reason : healthy ? (missing.length ? 'PARTIAL_DATA_HEALTHY' : 'ALL_RESOURCES_HEALTHY') : 'NO_VALID_DATA'),
    message: intervention?.message || watch?.message || (healthy ? 'No endurance action currently required.' : 'Endurance data unavailable.'),
    time: durations.length ? Math.min(...durations) : null,
    coverage: { monitored: active.length, valid: active.length - missing.length, missing }, resources
  };
}
module.exports = { decide };
