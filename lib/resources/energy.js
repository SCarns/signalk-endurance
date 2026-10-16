'use strict';
const { assessLevel } = require('./level');
const { read, resolveEnergyInputs } = require('../discovery');
module.exports = (config, app, selection, now) => {
  const r = assessLevel('energy', config, app, selection, now);
  const paths=resolveEnergyInputs(app,config,selection.path);
  r.prediction = {...read(app, paths.prediction.path, config.staleSeconds, now),selection:paths.prediction.selection};
  r.duration = {...read(app, paths.duration.path, config.staleSeconds, now),selection:paths.duration.selection};
  if (r.status === 'UNKNOWN') return r;
  if (r.duration.valid && typeof r.duration.value === 'number' && Number.isFinite(r.duration.value) && r.duration.value >= 0) r.time = r.duration.value;
  if (r.status === 'OK' && r.prediction.valid) {
    const p = String(r.prediction.value).toLowerCase();
    if (p === 'critical') Object.assign(r, { status: 'WARNING', action: 'PLAN_CHARGE', reason: 'PREDICTED_CRITICAL', message: 'Plan battery charging: forecast reserve crossing.' });
    if (p === 'deficit') Object.assign(r, { status: 'WATCH', reason: 'PREDICTED_DEFICIT', message: 'Energy imbalance detected; monitoring.' });
  }
  // No generic 240-hour/infinite sentinel: that behavior is specific to the BMV.
  return r;
};
