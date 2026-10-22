'use strict';
function crewCount(app, settings, now) {
  if (settings.crewSource === 'manual') return { count:settings.fallbackCrewCount, source:'manualOverride', reason:'MANUAL' };
  const leaf = app.getSelfPath('communication.crewNames');
  const wrapped = leaf && typeof leaf === 'object' && Object.hasOwn(leaf,'value');
  const roster = wrapped ? leaf.value : leaf;
  // Crew is a persisted roster, not a periodically sampled sensor. Old valid rosters
  // remain authoritative until changed. Reject malformed and future timestamps.
  const stamp = wrapped && leaf.timestamp !== undefined ? Date.parse(leaf.timestamp) : null;
  const validTime = stamp === null || (Number.isFinite(stamp) && stamp <= now + 5000);
  const valid = validTime && Array.isArray(roster) && roster.length <= 100 && roster.every(name => typeof name === 'string' && name.trim().length > 0) && new Set(roster.map(name=>name.trim())).size === roster.length;
  return valid ? {count:roster.length,source:'crewRoster',reason:'ROSTER'} : {count:settings.fallbackCrewCount,source:'configuredFallback',reason:leaf === undefined ? 'NO_ROSTER' : 'INVALID_ROSTER'};
}
module.exports = {crewCount};
