'use strict';
const { read } = require('../discovery');
const actions = {
  energy: ['PLAN_CHARGE', 'CHARGE_NOW', 'Plan battery charging.', 'Charge batteries now.'],
  freshwater: ['REPLENISH_WATER_SOON', 'REPLENISH_WATER_NOW', 'Plan to replenish freshwater.', 'Replenish freshwater now.'],
  fuel: ['PLAN_REFUEL', 'REFUEL_NOW', 'Plan diesel refueling.', 'Refuel diesel now.'],
  propane: ['PLAN_PROPANE_REFILL', 'CONSERVE_PROPANE', 'Plan a propane refill or tank swap.', 'Propane reserve is critically low. Conserve propane.'],
  holding: ['PLAN_PUMP_OUT', 'PUMP_OUT_NOW', 'Plan a holding tank pump-out.', 'Pump out the holding tank now.']
};
function assessLevel(name, config, app, selection, now) {
  const input = read(app, selection.path, config.staleSeconds, now);
  return assessInput(name, config, input, selection.reason, selection.path ? input.reason : selection.reason);
}
function assessInput(name, config, input, selection, reason = input.reason) {
  const r = { resource: name, status: 'UNKNOWN', action: 'NONE', message: 'Resource data unavailable.', reason, time: null, input, selection };
  if (!input.valid || typeof input.value !== 'number' || !Number.isFinite(input.value) || input.value < 0 || input.value > 1) {
    if (input.valid) r.reason = 'INVALID_RATIO';
    return r;
  }
  const level = input.value;
  const critical = name === 'holding' ? level >= config.critical : level <= config.critical;
  const warning = name === 'holding' ? level >= config.warning : level <= config.warning;
  r.status = critical ? 'CRITICAL' : warning ? 'WARNING' : 'OK';
  r.reason = critical ? 'RESERVE_CRITICAL' : warning ? 'RESERVE_LOW' : 'LEVEL_HEALTHY';
  const a = actions[name];
  r.action = critical ? a[1] : warning ? a[0] : 'NONE';
  r.message = critical ? a[3] : warning ? a[2] : 'No action required.';
  return r;
}
module.exports = { assessLevel, assessInput };
