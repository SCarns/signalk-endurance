'use strict';
const { read } = require('./discovery');
const { assessPassage } = require('./passage');
const { activeCourse, bounded } = require('./passage-view');

const fields = {
  routeId: { description: 'Signal K route used for the active passage projection' },
  assessedAt: { description: 'UTC time of the active passage projection' },
  arrival: { description: 'Projected route arrival at current progress' },
  fuelAtArrivalM3: { units: 'm3', description: 'Projected fuel remaining at arrival, floored at zero' },
  fuelMarginM3: { units: 'm3', description: 'Projected surplus or shortfall against fuel demand plus reserve' }
};
const toRad = Math.PI / 180;
const validPoint = p => Array.isArray(p) && Number.isFinite(p[0]) && Math.abs(p[0]) <= 180 &&
  Number.isFinite(p[1]) && Math.abs(p[1]) <= 90;
function leg(from, to) {
  const lat1 = from[1] * toRad;
  const lat2 = to[1] * toRad;
  const longitude = (to[0] - from[0]) * toRad;
  const a = Math.sin((lat2 - lat1) / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(longitude / 2) ** 2;
  return {
    distance: 12742000 * Math.asin(Math.sqrt(Math.min(1, a))),
    bearing: Math.atan2(Math.sin(longitude) * Math.cos(lat2),
      Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(longitude))
  };
}

async function activePassage(app, resources, config, now) {
  const { course, id } = await activeCourse(app);
  const active = course?.activeRoute;
  if (!id) return { reason: 'NO_ACTIVE_ROUTE' };
  const resource = await bounded(() => app.resourcesApi.getResource('routes', id));
  const route = { id, name: resource?.name || id };
  const unavailable = reason => ({ route, reason });
  const current = await activeCourse(app);
  if (current.id !== id || current.course?.activeRoute?.pointIndex !== active?.pointIndex ||
      current.course?.activeRoute?.reverse !== active?.reverse) return { reason: 'COURSE_CHANGED' };
  if (resource?.feature?.geometry?.type !== 'LineString') return unavailable('ROUTE_GEOMETRY_UNAVAILABLE');
  const coordinates = resource.feature.geometry.coordinates;
  const index = active?.pointIndex;
  if (!Array.isArray(coordinates) || !coordinates.every(validPoint) ||
      !Number.isInteger(index) || index < 0 || index >= coordinates.length) return unavailable('ROUTE_GEOMETRY_UNAVAILABLE');
  const target = course.nextPoint?.position;
  const targetPoint = [target?.longitude, target?.latitude];
  const points = active.reverse ? [...coordinates].reverse() : coordinates;
  // Verify the course index against the actual destination before counting any remaining legs.
  const indexedPoint = points[index];
  const originalPoint = coordinates[index];
  let nextIndex = index;
  if (!validPoint(targetPoint)) return unavailable('ROUTE_GEOMETRY_UNAVAILABLE');
  if (leg(indexedPoint, targetPoint).distance > 5) {
    if (!active.reverse || leg(originalPoint, targetPoint).distance > 5) return unavailable('ROUTE_GEOMETRY_UNAVAILABLE');
    nextIndex = points.length - 1 - index;
  }
  const position = read(app, 'navigation.position', 30, now);
  const sog = read(app, 'navigation.speedOverGround', 30, now);
  const cog = read(app, 'navigation.courseOverGroundTrue', 30, now);
  const boat = [position.value?.longitude, position.value?.latitude];
  if (![position, sog, cog].every(input => input.valid) || !validPoint(boat) ||
      !Number.isFinite(sog.value) || !Number.isFinite(cog.value)) return unavailable('PROGRESS_UNAVAILABLE');
  const first = leg(boat, targetPoint);
  const progress = sog.value * Math.cos(cog.value - first.bearing);
  if (sog.value <= 0 || progress < 0.25 || first.distance < 5) return unavailable('PROGRESS_UNAVAILABLE');
  let distanceM = first.distance;
  for (let i = nextIndex + 1; i < points.length; i++) distanceM += leg(points[i - 1], points[i]).distance;
  const durationSeconds = distanceM / progress;
  if (durationSeconds > 366 * 86400) return unavailable('PROGRESS_UNAVAILABLE');
  const arrival = new Date(now + durationSeconds * 1000).toISOString();
  const result = assessPassage({
    ...route, status: 'AVAILABLE', departure: new Date(now).toISOString(), arrival,
    durationSeconds, sailingSeconds: 0, motoringSeconds: durationSeconds
  }, resources, config, app, now, { fuelBasis: 'full-duration', liveFuelOnly: true });

  const revolutions = read(app, config.passage.engineRevolutionsPath, 30, now);
  const rpm = revolutions.valid && Number.isFinite(revolutions.value) && revolutions.value >= 0 ? revolutions.value * 60 : null;
  const fuel = resources.fuel;
  const rate = fuel?.consumptionRate;
  const totals = fuel?.totals;
  const currentVolume = totals?.currentVolumeM3;
  const capacity = totals?.capacityM3;
  const validFuel = fuel?.status !== 'UNKNOWN' && totals?.complete && Number.isFinite(rate) && rate > 0 &&
    Number.isFinite(currentVolume) && currentVolume >= 0 && Number.isFinite(capacity) && capacity > 0 &&
    Number.isFinite(rate * durationSeconds);
  const balance = validFuel ? currentVolume - rate * durationSeconds : null;
  return {
    ...result, route, arrival, durationSeconds, distanceM, progressMps: progress, nextWaypoint: nextIndex + 1,
    waypointCount: points.length, assessedAt: new Date(now).toISOString(),
    rpm,
    burnM3PerSecond: validFuel ? rate : null,
    fuelAtArrivalM3: balance === null ? null : Math.max(0, balance),
    fuelMarginM3: balance === null ? null : balance - capacity * config.resources.fuel.warning
  };
}

function publication(base, estimate) {
  const prefix = `${base}.activePassage`;
  return Object.keys(fields).map(key => ({
    path: `${prefix}.${key}`, value: (key === 'routeId' ? estimate?.route?.id : estimate?.[key]) ?? null
  }));
}
module.exports = { activePassage, publication, fields };
