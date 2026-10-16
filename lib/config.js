'use strict';
const defaults = {
  energy: { warning: 0.70, critical: 0.50, staleSeconds: 300 },
  freshwater: { warning: 0.35, critical: 0.20, staleSeconds: 1200 },
  fuel: { warning: 0.30, critical: 0.20, staleSeconds: 1200 },
  propane: { warning: 0.25, critical: 0.10, staleSeconds: 86400 },
  holding: { warning: 0.75, critical: 0.90, staleSeconds: 1200 }
};
const pathPattern = '^(|[A-Za-z0-9_-]+(\\.[A-Za-z0-9_-]+)*)$';
const ratio = (title, value) => ({ type: 'number', title, default: value, minimum: 0, maximum: 1 });
const path = title => ({ type: 'string', title, default: '', pattern: pathPattern });
const tankSchema = {
  type: 'object', additionalProperties: false, required: ['levelPath'],
  properties: {
    name: { type: 'string', title: 'Tank name', default: '' },
    enabled: { type: 'boolean', title: 'Include this tank', default: true },
    levelPath: path('Tank level path'),
    volumePath: path('Current volume path in m³ (blank: discover currentVolume or remaining)'),
    capacityPath: path('Full capacity path in m³ (blank: discover capacity)'),
    capacityM3: { type: 'number', minimum: 0, default: 0, title: 'Full capacity in m³ (0: use capacity path)' }
  }
};
const schema = {
  type: 'object', additionalProperties: false,
  properties: {
    publishLive: { type: 'boolean', default: false, title: 'Publish live assessments to environment.endurance' },
    notifications: { type: 'boolean', default: false, title: 'Enable visual notifications (live mode only)' },
    intervalSeconds: { type: 'integer', minimum: 5, maximum: 3600, default: 10 },
    resources: { type: 'object', additionalProperties: false, properties: Object.fromEntries(Object.entries(defaults).map(([name, d]) => [name, {
      type: 'object', additionalProperties: false, title: name === 'freshwater' ? 'Freshwater' : name[0].toUpperCase() + name.slice(1),
      properties: {
        enabled: { type: 'boolean', default: true },
        levelPath: path(name === 'energy' ? 'SOC path (blank: discover a single battery bank)' : 'Level path for a single tank (blank: discover; use Tanks below for multiple tanks)'),
        warning: ratio('Warning threshold (ratio)', d.warning),
        critical: ratio('Critical threshold (ratio)', d.critical),
        staleSeconds: { type: 'integer', default: d.staleSeconds, minimum: 1, maximum: 604800 },
        ...(name === 'energy' ? { predictionPath: path('Optional Energy Predictor status path'), timePath: path('Optional measured time remaining (seconds)') } : {
          tanks: { type: 'array', title: 'Tanks', default: [], maxItems: 64, items: tankSchema },
          ...(name !== 'holding' ? { assessmentMode: { type: 'string', enum: ['combined', 'individual'], default: name === 'freshwater' ? 'combined' : 'individual', title: 'Assess combined supply or each tank individually' } } : {})
        }),
        ...(name === 'freshwater' ? {
          volumePath: path('Optional current volume for single-tank setup (m³)'),
          consumptionPath: path('Optional total freshwater consumption rate path'),
          consumptionUnits: { type: 'string', enum: ['m3/s', 'L/day'], default: 'm3/s', title: 'Consumption source units: verify provider version' }
        } : {})
      }
    }])) }
  }
};
function validPath(value) {
  return typeof value === 'string' && new RegExp(pathPattern).test(value) && !value.startsWith('environment.endurance');
}
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
    for (const k of ['levelPath', 'predictionPath', 'timePath', 'volumePath', 'consumptionPath']) if (r[k] !== undefined && !validPath(r[k])) throw Error(`${name}: invalid input path`);
    if (name !== 'energy') {
      r.assessmentMode ??= name === 'freshwater' ? 'combined' : 'individual';
      if (!['combined', 'individual'].includes(r.assessmentMode) || (name === 'holding' && r.assessmentMode !== 'individual')) throw Error(`${name}: invalid assessment mode`);
      r.tanks ??= [];
      if (!Array.isArray(r.tanks) || r.tanks.length > 64) throw Error(`${name}: Tanks must be a list of at most 64 tanks`);
      const paths = new Set(), volumes = new Set();
      r.tanks = r.tanks.map(t => {
        if (!t || typeof t !== 'object') throw Error(`${name}: invalid tank`);
        const tank = { enabled: true, name: '', volumePath: '', capacityPath: '', capacityM3: 0, ...t };
        if (typeof tank.enabled !== 'boolean' || typeof tank.name !== 'string') throw Error(`${name}: invalid tank name or enabled setting`);
        if (!validPath(tank.levelPath) || !tank.levelPath || !tank.levelPath.endsWith('.currentLevel')) throw Error(`${name}: each tank needs a currentLevel path`);
        const root = tank.levelPath.slice(0, -'.currentLevel'.length);
        if (!root.startsWith('tanks.')) throw Error(`${name}: a tank path must begin with tanks`);
        for (const key of ['volumePath', 'capacityPath']) if (!validPath(tank[key])) throw Error(`${name}: invalid tank ${key}`);
        if (typeof tank.capacityM3 !== 'number' || !Number.isFinite(tank.capacityM3) || tank.capacityM3 < 0) throw Error(`${name}: capacity must be a nonnegative m³ value`);
        if (tank.enabled) {
          if (paths.has(root) || (tank.volumePath && volumes.has(tank.volumePath))) throw Error(`${name}: duplicate tank or current volume path`);
          paths.add(root); if (tank.volumePath) volumes.add(tank.volumePath);
        }
        return tank;
      });
      if (r.levelPath && r.tanks.some(t=>t.enabled)) throw Error(`${name}: use either a single Level path or the Tanks list`);
    }
    r.consumptionUnits ??= 'm3/s';
    if (!['m3/s', 'L/day'].includes(r.consumptionUnits)) throw Error('Unsupported consumption units');
    return [name, r];
  }));
  return o;
}
module.exports = { schema, normalize, defaults };
