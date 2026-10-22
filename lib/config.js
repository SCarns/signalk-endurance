'use strict';
const {unitSchema,toM3,migrateOptions}=require('./input-units');
const defaults = {
  energy: { warning: 0.70, critical: 0.50, staleSeconds: 300, predictionStaleSeconds: 7200 },
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
    capacity: { type: 'number', minimum: 0, title: 'Full capacity in selected input units (0: use capacity path)' }
  }
};
const schema = {
  type: 'object', additionalProperties: false,
  properties: {
    inputVolumeUnits: unitSchema,
    publishLive: { type: 'boolean', default: false, title: 'Publish live assessments to environment.endurance' },
    notifications: { type: 'boolean', default: false, title: 'Enable visual notifications (live mode only)' },
    intervalSeconds: { type: 'integer', minimum: 5, maximum: 3600, default: 10 },
    resources: { type: 'object', additionalProperties: false, properties: Object.fromEntries(Object.entries(defaults).map(([name, d]) => [name, {
      type: 'object', additionalProperties: false, title: name === 'freshwater' ? 'Freshwater' : name[0].toUpperCase() + name.slice(1),
      ...(name === 'energy' ? {description:'Energy is assessed from measured SOC. The optional Energy Predictor plugin adds forecast context: deficit monitoring and advance charging warnings for a predicted reserve crossing. If installed and publishing, its standard status path is discovered automatically when blank. No Energy Predictor dependency is required.'} : {}),
      properties: {
        enabled: { type: 'boolean', default: true },
        levelPath: path(name === 'energy' ? 'SOC path (blank: discover a single battery bank)' : 'Level path for a single tank (blank: discover; use Tanks below for multiple tanks)'),
        warning: ratio('Warning threshold (ratio)', d.warning),
        critical: ratio('Critical threshold (ratio)', d.critical),
        staleSeconds: { type: 'integer', default: d.staleSeconds, minimum: 1, maximum: 604800 },
        ...(name === 'energy' ? { predictionStaleSeconds: { type: 'integer', title: 'Forecast freshness window (seconds)', description: 'Separate from measured SOC and battery time. Energy Predictor defaults to hourly forecasts; two hours allows one delayed cycle.', default: 7200, minimum: 1, maximum: 604800 }, predictionPath: path('Energy Predictor status path (blank: discover electrical.energy.prediction.status)'), timePath: path('Measured time remaining path in seconds (blank: discover for selected battery bank)') } : {
          tanks: { type: 'array', title: 'Tanks', default: [], maxItems: 64, items: tankSchema },
          ...(name !== 'holding' ? { assessmentMode: { type: 'string', enum: ['combined', 'individual'], default: name === 'freshwater' ? 'combined' : 'individual', title: 'Assess combined supply or each tank individually' } } : {})
        }),
        ...(name === 'fuel' ? { ratePath: path('Optional total fuel rate for selected usable supply (m³/s; blank: no estimate)') } : {}),
        ...(name === 'freshwater' ? {
          usageSource: { type: 'string', enum: ['auto', 'internal', 'external'], default: 'auto', title: 'Usage estimate (auto: external path if set, otherwise internal)' },
          learning: { type: 'object', additionalProperties: false, title: 'Freshwater usage learning', properties: {
            defaultUsagePerPersonPerDay: { type: 'number', minimum: 0, title: 'Starting estimate per person per day (selected input units)' },
            crewSource: { type: 'string', enum: ['auto', 'manual'], default: 'auto', title: 'Crew count: shared roster with fallback, or manual override' },
            fallbackCrewCount: { type: 'integer', minimum: 0, maximum: 100, default: 2, title: 'People aboard (manual override or roster fallback)' },
            minimumHours: { type: 'number', minimum: 24, maximum: 720, default: 72, title: 'Observed hours before using learned rate' },
            maxUsagePerDay: { type: 'number', exclusiveMinimum: 0, title: 'Maximum plausible total use per day (selected input units)' },
            paused: { type: 'boolean', default: false, title: 'Pause usage learning (filling, transferring or maintenance)' }
          } },
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
  options=migrateOptions(options);
  const o = { publishLive: false, notifications: false, intervalSeconds: 10, ...options };
  if (typeof o.publishLive !== 'boolean' || typeof o.notifications !== 'boolean') throw Error('Publish and notification settings must be boolean');
  if (!Number.isInteger(o.intervalSeconds) || o.intervalSeconds < 5 || o.intervalSeconds > 3600) throw Error('Update interval must be 5–3600 seconds');
  o.resources = Object.fromEntries(Object.entries(defaults).map(([name, d]) => {
    const r = { enabled: true, levelPath: '', ...d, ...(options.resources?.[name] || {}) };
    if (typeof r.enabled !== 'boolean') throw Error(`${name}: enabled must be boolean`);
    for (const k of ['warning', 'critical']) if (typeof r[k] !== 'number' || !Number.isFinite(r[k]) || r[k] < 0 || r[k] > 1) throw Error(`${name}: invalid ${k} ratio`);
    if (name === 'holding' ? r.critical <= r.warning : r.critical >= r.warning) throw Error(`${name}: thresholds are reversed or equal`);
    if (!Number.isInteger(r.staleSeconds) || r.staleSeconds < 1 || r.staleSeconds > 604800) throw Error(`${name}: invalid freshness window`);
    if (name === 'energy' && (!Number.isInteger(r.predictionStaleSeconds) || r.predictionStaleSeconds < 1 || r.predictionStaleSeconds > 604800)) throw Error('energy: invalid forecast freshness window');
    for (const k of ['levelPath', 'predictionPath', 'timePath', 'volumePath', 'consumptionPath', 'ratePath']) if (r[k] !== undefined && !validPath(r[k])) throw Error(`${name}: invalid input path`);
    if (name !== 'energy') {
      r.assessmentMode ??= name === 'freshwater' ? 'combined' : 'individual';
      if (!['combined', 'individual'].includes(r.assessmentMode) || (name === 'holding' && r.assessmentMode !== 'individual')) throw Error(`${name}: invalid assessment mode`);
      r.tanks ??= [];
      if (!Array.isArray(r.tanks) || r.tanks.length > 64) throw Error(`${name}: Tanks must be a list of at most 64 tanks`);
      const paths = new Set(), volumes = new Set();
      r.tanks = r.tanks.map(t => {
        if (!t || typeof t !== 'object') throw Error(`${name}: invalid tank`);
        const tank = { enabled: true, name: '', volumePath: '', capacityPath: '', capacity: 0, ...t };
        tank.capacityM3=toM3(tank.capacity,o.inputVolumeUnits);
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
    if(name === 'freshwater') {
      r.usageSource ??= 'auto';
      if(!['auto','internal','external'].includes(r.usageSource))throw Error('Invalid freshwater usage source');
      r.learning = { crewSource:'auto', fallbackCrewCount:2, minimumHours:72, paused:false, ...(r.learning||{}) };
      r.learning.defaultDailyVolumeM3=toM3(r.learning.defaultUsagePerPersonPerDay,o.inputVolumeUnits);
      r.learning.maxDailyVolumeM3=toM3(r.learning.maxUsagePerDay,o.inputVolumeUnits);
      const l=r.learning;
      if(!['auto','manual'].includes(l.crewSource))throw Error('Invalid freshwater crew source');
      for(const [k,min,max] of [['defaultDailyVolumeM3',0,1],['minimumHours',24,720],['maxDailyVolumeM3',.001,100]])if(typeof l[k]!=='number'||!Number.isFinite(l[k])||l[k]<min||l[k]>max)throw Error(`Invalid freshwater learning ${k}`);
      if(!Number.isInteger(l.fallbackCrewCount)||l.fallbackCrewCount<0||l.fallbackCrewCount>100||typeof l.paused!=='boolean')throw Error('Invalid freshwater crew count or learning pause');
    }
    r.consumptionUnits ??= 'm3/s';
    if (!['m3/s', 'L/day'].includes(r.consumptionUnits)) throw Error('Unsupported consumption units');
    return [name, r];
  }));
  return o;
}
module.exports = { schema, normalize, defaults };
