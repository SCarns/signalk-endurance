'use strict';
// Optional readers and assessment only: routing and forecasting remain upstream.
const { read } = require('./discovery');
const finite = n => typeof n === 'number' && Number.isFinite(n) && n >= 0;
const unknown = reason => ({ status: 'UNKNOWN', reason });
// EP publishes Date objects in-process; REST serialization turns them into ISO strings.
const forecastTime = value => value instanceof Date ? value.getTime() : typeof value === 'string' ? Date.parse(value) : NaN;
function routeId(app, configured) {
  if (configured) return configured;
  const leaf = app.getSelfPath('navigation.course.activeRoute');
  const unwrap = node => node && typeof node === 'object' && Object.hasOwn(node, 'value') ? node.value : node;
  const active = unwrap(leaf);
  const value = typeof active === 'string' ? active : unwrap(active?.href);
  if (typeof value !== 'string') return null;
  return value.match(/(?:^|\/)routes\/([^/]+)$/)?.[1] || (/^[\w:-]+$/.test(value) ? value : null);
}
function adaptRoute(resource, id) {
  const p = resource?.feature?.properties;
  if (p?.source !== 'signalk-weather-router-plus') return { ...unknown('UNSUPPORTED_ROUTE'), id };
  if (![p.total_time_s, p.motoring_time_s, p.sailing_time_s].every(finite) ||
      p.motoring_time_s + p.sailing_time_s > p.total_time_s + 2) return { ...unknown('INVALID_PROFILE'), id };
  return { status: 'AVAILABLE', source: p.source, id, name: resource.name,
    durationSeconds: p.total_time_s, motoringSeconds: p.motoring_time_s,
    sailingSeconds: p.sailing_time_s, departure: p.departure, arrival: p.arrival,
    basis: 'FULL_ROUTE_NO_PROGRESS_CREDIT' };
}
function energy(app, config, resource, start, duration, now) {
  if (!resource || resource.status === 'UNKNOWN') return unknown('MEASURED_SOC_UNAVAILABLE');
  const reserve = config.resources.energy.warning;
  if (!finite(resource.input?.value)) return unknown('MEASURED_SOC_UNAVAILABLE');
  if (resource.input.value <= reserve) return { status: 'SHORTFALL', reason: 'MEASURED_RESERVE', reserve };
  const base = 'electrical.energy.prediction';
  const age = config.resources.energy.predictionStaleSeconds;
  const forecast = read(app, `${base}.forecast.hourly`, age, now);
  const validTo = read(app, `${base}.weather.validTo`, age, now);
  const source = read(app, `${base}.weather.source`, age, now);
  if (!forecast.valid || !Array.isArray(forecast.value) || !validTo.valid || typeof validTo.value !== 'string') return unknown('FORECAST_UNAVAILABLE');
  if (forecast.value.some(p => !p || !Number.isFinite(forecastTime(p.time)))) return unknown('INVALID_FORECAST');
  const end = Math.min(start + duration * 1000, Date.parse(validTo.value));
  const points = forecast.value.filter(p => forecastTime(p?.time) >= start && forecastTime(p?.time) < end);
  if (!Number.isFinite(end) || end <= start || !points.length) return unknown('NO_FORECAST_COVERAGE');
  let previous = start;
  for (const p of points) {
    const t = forecastTime(p.time);
    if (t < previous || t - previous > 3600000 || !finite(p.detectedSoC) || p.detectedSoC > 1) return unknown('INCOMPLETE_FORECAST');
    previous = t;
  }
  const coveredTo = Math.min(end, previous + 3600000);
  const minimumSOC = Math.min(resource.input.value, ...points.map(p => p.detectedSoC));
  return { status: minimumSOC <= reserve ? 'SHORTFALL' : 'PROVISIONAL',
    reason: minimumSOC <= reserve ? 'FORECAST_RESERVE_CROSSING' : coveredTo < start + duration * 1000 ? 'FORECAST_HORIZON' : 'ROUTE_LOADS_UNVERIFIED',
    minimumSOC, reserve, forecastSource: source.valid ? source.value : null,
    coveredSeconds: Math.max(0, (coveredTo - start) / 1000),
    uncoveredSeconds: Math.max(0, duration - (coveredTo - start) / 1000), track: 'detectedSoC' };
}
function assessPassage(route, resources, config, app, now, scenario = {}) {
  if (route.status === 'AVAILABLE' && (!Number.isFinite(Date.parse(route.arrival)) || Date.parse(route.arrival) <= now)) return { ...unknown('ROUTE_ENDED_OR_UNDATED'), resources: {} };
  if (route.status !== 'AVAILABLE') return { ...route, resources: {} };
  const result = {};
  for (const [name, r] of Object.entries(resources)) {
    if (name === 'energy') {
      const departure = Date.parse(route.departure);
      result.energy = energy(app, config, r, Math.max(now, Number.isFinite(departure) ? departure : now), route.durationSeconds, now);
      continue;
    }
    if (r.assessmentMode === 'individual' && r.tanks?.some(t => typeof t.levelRatio === 'number' && (name === 'holding' ? t.levelRatio >= config.resources[name].warning : t.levelRatio <= config.resources[name].warning))) {
      result[name] = { status: 'SHORTFALL', reason: 'INDIVIDUAL_TANK_RESERVE' }; continue;
    }
    const totals = r.totals;
    const planningFuelRate = name === 'fuel' && config.passage?.fuelLitresPerHour > 0;
    const pb=scenario.passageBriefFuel;
    const pbAge=now-Date.parse(pb?.fetchedAt);
    const passageBriefRate=name==='fuel'&&!planningFuelRate&&!(finite(r.consumptionRate)&&r.consumptionRate>0)&&
      finite(pb?.litresPerHour)&&pb.litresPerHour>0&&Number.isFinite(pbAge)&&pbAge>=-5000&&pbAge<=90000;
    const rate = planningFuelRate ? config.passage.fuelLitresPerHour / 3600000 : passageBriefRate ? pb.litresPerHour / 3600000 : r.consumptionRate;
    if (!totals?.complete || r.status === 'UNKNOWN') { result[name] = unknown('INCOMPLETE_SUPPLY'); continue; }
    // Warning threshold is the passage reserve; do not change existing alert rules.
    const reserve = totals.capacityM3 * config.resources[name].warning;
    const available = name === 'holding' ? reserve - totals.currentVolumeM3 : totals.currentVolumeM3 - reserve;
    const fullDurationFuel = name === 'fuel' && scenario.fuelBasis === 'full-duration';
    const seconds = name === 'fuel' && !fullDurationFuel ? route.motoringSeconds : route.durationSeconds;
    if (available <= 0) { result[name] = { status: 'SHORTFALL', reason: 'RESERVE', availableM3: available }; continue; }
    if (seconds !== 0 && !finite(rate)) { result[name] = unknown('CONSUMPTION_UNAVAILABLE'); continue; }
    const required = seconds === 0 ? 0 : rate * seconds;
    result[name] = { status: Number.isFinite(required) ? required <= available ? 'SUFFICIENT' : 'SHORTFALL' : 'UNKNOWN', reason: planningFuelRate ? 'PROFILE_AT_PLANNING_RATE' : passageBriefRate ? 'PROFILE_AT_PASSAGE_BRIEF_RATE' : 'PROFILE_AT_CURRENT_RATE', requiredM3: Number.isFinite(required) ? required : null, availableM3: available, reserveM3: reserve, rateSource: planningFuelRate ? 'configured-passage-estimate' : passageBriefRate ? 'passage-brief-viewer-setting' : r.rateSource || r.consumption?.source || null,
      ...(name === 'fuel' ? { litresPerHour: planningFuelRate ? config.passage.fuelLitresPerHour : passageBriefRate ? pb.litresPerHour : finite(rate) ? rate * 3600000 : null, rateBasis: planningFuelRate ? 'PLANNING_ESTIMATE' : passageBriefRate ? 'PASSAGE_BRIEF_SETTING' : 'LIVE_SOURCE', fuelDemandSeconds: seconds, fuelDurationBasis: fullDurationFuel ? 'FULL_PLANNED_DURATION' : 'UPSTREAM_MOTORING' } : {}) };
  }
  const values = Object.values(result);
  const status = values.some(r => r.status === 'SHORTFALL') ? 'SHORTFALL' : !values.length || values.some(r => r.status === 'UNKNOWN') ? 'UNKNOWN' : values.some(r => r.status === 'PROVISIONAL') ? 'PROVISIONAL' : 'SUFFICIENT';
  return { status, route, resources: result, assessedAt: new Date(now).toISOString(), message: status === 'SHORTFALL' ? 'Plan replenishment or revise the passage.' : status === 'SUFFICIENT' ? 'Monitored resources cover the full route at current rates and configured reserves.' : 'Passage coverage is incomplete; review resource details.' };
}
// Course API is authoritative when available; data-path fallback is for older servers.
function createRouteReader(app) {
  let pending = false, generation = 0, latest = unknown('WAITING_FOR_ROUTE');
  const selectedId = async config => {
    if (config.routeId || typeof app.getCourse !== 'function') return routeId(app, config.routeId);
    const course = await app.getCourse();
    return routeId({ getSelfPath: () => course?.activeRoute }, '');
  };
  return {
    reset() { generation++; pending = false; latest = unknown('WAITING_FOR_ROUTE'); },
    current(config) {
      if (!config.routeId && typeof app.getCourse === 'function') return latest;
      const id = routeId(app, config.routeId);
      if (!id) return unknown('NO_SELECTED_ROUTE');
      return latest.id === id ? latest : { ...unknown('WAITING_FOR_ROUTE'), id };
    },
    async refresh(config) {
      if (pending) return;
      const token = generation;
      pending = true;
      let timer, id;
      try {
        const next = await Promise.race([
          (async () => {
            id = await selectedId(config);
            if (!id) return unknown('NO_SELECTED_ROUTE');
            if (!app.resourcesApi?.getResource) return { ...unknown('RESOURCES_API_UNAVAILABLE'), id };
            const resource = await app.resourcesApi.getResource('routes', id);
            // Never dispatch the old route if navigation changed during the read.
            if (await selectedId(config) !== id) return unknown('ROUTE_CHANGED');
            return adaptRoute(resource, id);
          })(),
          new Promise((_, reject) => { timer = setTimeout(() => reject(Error('timeout')), 5000); })
        ]);
        if (token === generation) latest = next;
      } catch (_) { if (token === generation) latest = { ...unknown('ROUTE_READ_FAILED'), id }; }
      finally { clearTimeout(timer); if (token === generation) pending = false; }
    }
  };
}
module.exports = { routeId, adaptRoute, assessPassage, createRouteReader };
