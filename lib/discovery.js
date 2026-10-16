'use strict';
const patterns = {
  energy: /^electrical\.batteries\.[^.]+\.capacity\.stateOfCharge$/,
  freshwater: /^tanks\.freshWater\.[^.]+\.currentLevel$/,
  fuel: /^tanks\.fuel\.[^.]+\.currentLevel$/,
  propane: /^tanks\.(?:lpg|gas)\.[^.]+\.currentLevel$/,
  holding: /^tanks\.(?:holding|wasteWater|blackWater)\.[^.]+\.currentLevel$/
};
function discover(app) {
  const found = Object.fromEntries(Object.keys(patterns).map(k => [k, []]));
  function walk(node, prefix, depth = 0) {
    if (!node || typeof node !== 'object' || depth > 8) return;
    if (Object.hasOwn(node, 'value')) {
      for (const [name, pattern] of Object.entries(patterns)) {
        if (!pattern.test(prefix)) continue;
        // A generic gas tank may contain something other than LPG.
        if (name === 'propane' && prefix.startsWith('tanks.gas.') && app.getSelfPath(prefix.replace(/currentLevel$/, 'type'))?.value !== 'lpg') continue;
        found[name].push({ path: prefix, value: node.value, timestamp: node.timestamp || null, source: node.$source || null });
      }
      return;
    }
    for (const [key, child] of Object.entries(node)) {
      if (['values', 'meta', '$source'].includes(key) || key.includes('.')) continue;
      walk(child, prefix ? `${prefix}.${key}` : key, depth + 1);
    }
  }
  for (const root of ['electrical.batteries', 'tanks']) walk(app.getSelfPath(root), root);
  for (const list of Object.values(found)) list.sort((a, b) => a.path.localeCompare(b.path));
  return found;
}
function read(app, path, staleSeconds, now) {
  if (!path) return { valid: false, reason: 'NOT_CONFIGURED', value: null };
  const leaf = app.getSelfPath(path);
  const timestamp = typeof leaf?.timestamp === 'string' ? Date.parse(leaf.timestamp) : NaN;
  const ageSeconds = (now - timestamp) / 1000;
  const valid = !!leaf && Object.hasOwn(leaf, 'value') && Number.isFinite(ageSeconds) && ageSeconds >= -5 && ageSeconds <= staleSeconds;
  return { path, value: leaf?.value ?? null, timestamp: leaf?.timestamp || null, source: leaf?.$source || null, ageSeconds: Number.isFinite(ageSeconds) ? ageSeconds : null, valid, reason: valid ? 'AVAILABLE' : 'MISSING_OR_STALE' };
}
function select(config, candidates) {
  if (config.levelPath) return { path: config.levelPath, reason: 'CONFIGURED' };
  if (candidates.length === 1) return { path: candidates[0].path, reason: 'AUTO_DISCOVERED' };
  return { path: '', reason: candidates.length ? 'CHOOSE_SOURCE' : 'NO_SOURCE' };
}
module.exports = { discover, read, select };
