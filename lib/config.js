'use strict';
const defaults = {
  energy: { warning: 0.70, critical: 0.50, staleSeconds: 300 },
  freshwater: { warning: 0.35, critical: 0.20, staleSeconds: 1200 },
  fuel: { warning: 0.30, critical: 0.20, staleSeconds: 1200 },
  propane: { warning: 0.25, critical: 0.10, staleSeconds: 86400 },
  holding: { warning: 0.75, critical: 0.90, staleSeconds: 1200 }
};
const ratio = (title, value) => ({ type: 'number', title, default: value, minimum: 0, maximum: 1 });
const path = title => ({ type: 'string', title, default: '', pattern: '^(|[A-Za-z0-9_-]+(\\.[A-Za-z0-9_-]+)*)$' });
const schema = {
  type: 'object', additionalProperties: false,
  properties: {
    publishLive: { type: 'boolean', default: false, title: 'Publish to environment.endurance (disable Node-RED publisher first)' },
    notifications: { type: 'boolean', default: false, title: 'Enable visual notifications (live mode only)' },
    intervalSeconds: { type: 'integer', minimum: 5, maximum: 3600, default: 10 },
    resources: { type: 'object', properties: Object.fromEntries(Object.entries(defaults).map(([name, d]) => [name, {
      type: 'object', additionalProperties: false, title: name,
      properties: {
        enabled: { type: 'boolean', default: true },
        levelPath: path('Level / SOC path (blank: discover a single candidate)'),
        warning: ratio('Warning threshold (ratio)', d.warning),
        critical: ratio('Critical threshold (ratio)', d.critical),
        staleSeconds: { type: 'integer', default: d.staleSeconds, minimum: 1, maximum: 604800 },
        ...(name === 'energy' ? { predictionPath: path('Optional Energy Predictor status path'), timePath: path('Optional measured time remaining (seconds)') } : {}),
        ...(name === 'freshwater' ? {
          volumePath: path('Optional available volume path (m³)'),
          consumptionPath: path('Optional consumption rate path'),
          consumptionUnits: { type: 'string', enum: ['m3/s', 'L/day'], default: 'm3/s', title: 'Consumption source units: verify provider version' }
        } : {})
      }
    }])) }
  }
};
function normalize(options = {}) {
  const o = { publishLive: false, notifications: false, intervalSeconds: 10, ...options };
  if (typeof o.publishLive !== 'boolean' || typeof o.notifications !== 'boolean') throw Error('Publish and notification settings must be boolean');
  if (!Number.isInteger(o.intervalSeconds) || o.intervalSeconds < 5 || o.intervalSeconds > 3600) throw Error('Update interval must be 5–3600 seconds');
  o.resources = Object.fromEntries(Object.entries(defaults).map(([name, d]) => {
    const r = { enabled: true, levelPath: '', ...d, ...(options.resources?.[name] || {}) };
    if (typeof r.enabled !== 'boolean') throw Error(`${name}: enabled must be boolean`);
    for (const k of ['warning', 'critical']) if (typeof r[k] !== 'number' || !Number.isFinite(r[k]) || r[k] < 0 || r[k] > 1) throw Error(`${name}: invalid ${k} ratio`);
    if (name === 'holding' ? r.critical <= r.warning : r.critical >= r.warning) throw Error(`${name}: thresholds are reversed or equal`);
    if (!Number.isInteger(r.staleSeconds) || r.staleSeconds < 1 || r.staleSeconds > 604800) throw Error(`${name}: invalid freshness window`);
    for (const k of ['levelPath', 'predictionPath', 'timePath', 'volumePath', 'consumptionPath']) {
      if (r[k] !== undefined && (typeof r[k] !== 'string' || !new RegExp(schema.properties.resources.properties[name].properties.levelPath.pattern).test(r[k]) || r[k].startsWith('environment.endurance'))) throw Error(`${name}: invalid input path`);
    }
    r.consumptionUnits ??= 'm3/s';
    if (!['m3/s', 'L/day'].includes(r.consumptionUnits)) throw Error('Unsupported consumption units');
    return [name, r];
  }));
  return o;
}
module.exports = { schema, normalize, defaults };
