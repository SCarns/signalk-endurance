'use strict';
const { assessTanks } = require('./tanks');
const { read } = require('../discovery');
module.exports = (config, app, selection, now) => {
  const r = assessTanks('fuel', config, app, selection, now);
  // Explicit supply-to-rate mapping avoids silently assigning an engine to a tank.
  // The selected rate may be measured or already derived upstream from calibrated RPM.
  r.consumption = read(app, config.ratePath, config.staleSeconds, now);
  const rate = r.consumption.value;
  r.consumptionRate = r.consumption.valid && typeof rate === 'number' && Number.isFinite(rate) && rate > 0 ? rate : null;
  r.engineTime = null;
  r.engineTimeReason = r.consumptionRate === null ? 'NO_VALID_RATE' : 'INCOMPLETE_SUPPLY';
  const volume = r.totals.availableVolumeM3;
  if (r.consumptionRate !== null && volume !== null) {
    const seconds = volume / r.consumptionRate;
    r.engineTimeReason = 'INVALID_DURATION';
    if (Number.isFinite(seconds)) { r.engineTime = seconds; r.engineTimeReason = 'AVAILABLE'; }
  }
  // Existing level alerts and chronological duration remain unchanged.
  return r;
};
