'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { activePassage, publication } = require('../lib/active-passage');
const { normalize } = require('../lib/config');

const now = Date.now();
const config = normalize({ passage: { fuelLitresPerHour: 99, engineRevolutionsPath: 'propulsion.main.revolutions' } });
const line = { type: 'LineString', coordinates: [[0, 0], [.05, 0], [.10, 0]] };
function fixture({ speed = 2, longitude = .025, cog = Math.PI / 2, stale = false, reverse = false } = {}) {
  const values = {
    'navigation.position': { latitude: 0, longitude },
    'navigation.speedOverGround': speed,
    'navigation.courseOverGroundTrue': cog,
    'propulsion.main.revolutions': 30
  };
  return {
    getCourse: async () => ({
      activeRoute: { href: '/resources/routes/a', pointIndex: 1, reverse },
      nextPoint: { position: { latitude: 0, longitude: .05 } }
    }),
    resourcesApi: { getResource: async () => ({ name: 'Test route', feature: { geometry: line } }) },
    getSelfPath: path => Object.hasOwn(values, path) ?
      { value: values[path], timestamp: new Date(now - (stale ? 31000 : 0)).toISOString() } : undefined
  };
}
function resources(litresPerHour) {
  return { fuel: { status: 'OK', consumptionRate: litresPerHour === null ? null : litresPerHour / 3600000,
    totals: { complete: true, capacityM3: .05, currentVolumeM3: .025 } } };
}
test('throttle scenarios move both ETA and fuel margin using only the live burn rate', async () => {
  const fast = await activePassage(fixture({ speed: 2.5 }), resources(22), config, now);
  const slow = await activePassage(fixture({ speed: 2 }), resources(8), config, now);
  assert(fast.arrival < slow.arrival);
  assert(fast.fuelMarginM3 < 0);
  assert(slow.fuelMarginM3 > 0);
  assert.equal(slow.rpm, 1800);
  assert.equal(slow.resources.fuel.fuelDemandSeconds, slow.durationSeconds);
  assert(Math.abs(slow.resources.fuel.litresPerHour - 8) < 1e-9);
  assert(slow.distanceM > 8300 && slow.distanceM < 8400);
});
test('reverse travel, invalid progress and missing fuel stay distinct', async () => {
  const reverse = await activePassage(fixture({ longitude: .075, cog: 3 * Math.PI / 2, reverse: true }), resources(8), config, now);
  assert(reverse.distanceM > 8300 && reverse.distanceM < 8400);
  assert.equal((await activePassage(fixture({ cog: 0 }), resources(8), config, now)).reason, 'PROGRESS_UNAVAILABLE');
  assert.equal((await activePassage(fixture({ stale: true }), resources(8), config, now)).reason, 'PROGRESS_UNAVAILABLE');
  const noRate = await activePassage(fixture(), resources(null), config, now);
  assert(noRate.arrival);
  assert.equal(noRate.fuelMarginM3, null);
});
test('route changes during calculation invalidate the projection and publication clears stale values', async () => {
  const app = fixture();
  const initialCourse = await app.getCourse();
  let calls = 0;
  app.getCourse = async () => ++calls === 1 ? initialCourse : { activeRoute: null };
  const estimate = await activePassage(app, resources(8), config, now);
  assert.equal(estimate.reason, 'COURSE_CHANGED');
  assert(publication('environment.endurance', estimate).every(item => item.value === null));
  assert(publication('environment.endurancePreview', null).every(item => item.path.startsWith('environment.endurancePreview.activePassage.')));
});

test('plugin publishes active fuel with the webapp closed and clears it on stop', async () => {
  const create = require('..');
  const app = fixture();
  const navigation = app.getSelfPath;
  const messages = [];
  app.getSelfPath = path => {
    const readings = { 'tanks.fuel.main.currentLevel': .5, 'tanks.fuel.main.capacity': .05, 'propulsion.main.fuel.rate': 8 / 3600000 };
    return Object.hasOwn(readings, path) ? { value: readings[path], timestamp: new Date().toISOString() } : navigation(path);
  };
  app.handleMessage = (_source, delta) => messages.push(...delta.updates.flatMap(update => update.values || []));
  app.setPluginStatus = () => {};
  app.setPluginError = error => { throw Error(error); };
  const plugin = create(app);
  const paths = 'environment.endurance.activePassage.';
  try {
    plugin.start({
      publishLive: true,
      passage: { enabled: true },
      resources: {
        energy: { enabled: false }, freshwater: { enabled: false }, propane: { enabled: false }, holding: { enabled: false },
        fuel: { ratePath: 'propulsion.main.fuel.rate', levelPath: 'tanks.fuel.main.currentLevel' }
      }
    });
    await new Promise(setImmediate);
    assert(messages.some(item => item.path === paths + 'routeId' && item.value === 'a'));
    assert(messages.some(item => item.path === paths + 'fuelAtArrivalM3' && item.value > 0));
  } finally { plugin.stop(); }
  assert.equal(messages.findLast(item => item.path === paths + 'fuelAtArrivalM3').value, null);
});
