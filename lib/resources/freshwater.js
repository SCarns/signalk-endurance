'use strict';
const { assessLevel } = require('./level');
const { read } = require('../discovery');
module.exports = (config, app, selection, now) => {
  const r = assessLevel('freshwater', config, app, selection, now);
  r.volume = read(app, config.volumePath, config.staleSeconds, now);
  r.consumption = read(app, config.consumptionPath, config.staleSeconds, now);
  const v = r.volume.value, c = r.consumption.value;
  if (r.volume.valid && r.consumption.valid && typeof v === 'number' && Number.isFinite(v) && v >= 0 && typeof c === 'number' && Number.isFinite(c) && c > 0) {
    const rate = config.consumptionUnits === 'L/day' ? c / 1000 / 86400 : c;
    const seconds = v / rate;
    if (Number.isFinite(seconds)) r.time = seconds;
    // Duration is to empty, matching the reference flow. Levels still protect reserve.
    const status = seconds <= 86400 ? 'CRITICAL' : seconds <= 172800 ? 'WARNING' : 'OK';
    const ranks = { UNKNOWN: -1, OK: 0, WARNING: 1, CRITICAL: 2 };
    if (ranks[status] > ranks[r.status]) Object.assign(r, { status, action: status === 'CRITICAL' ? 'REPLENISH_WATER_NOW' : status === 'WARNING' ? 'REPLENISH_WATER_SOON' : 'NONE', reason: 'TIME_TO_EMPTY', message: status === 'CRITICAL' ? 'Replenish freshwater now.' : status === 'WARNING' ? 'Plan to replenish freshwater within 48 hours.' : 'No action required.' });
  }
  return r;
};
