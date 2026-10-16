'use strict';
const { schema, normalize } = require('./lib/config');
const { discover, select } = require('./lib/discovery');
const { decide } = require('./lib/decision');
const {WaterUsage}=require('./lib/water-usage');
const {storage}=require('./lib/usage-store');
const modules = Object.fromEntries(['energy', 'freshwater', 'fuel', 'propane', 'holding'].map(k => [k, require(`./lib/resources/${k}`)]));
module.exports = app => {
  let waterUsage, store=null, lastSave=0, storageError=null;
  let timer, config, latest = null, discovery = {}, signature = null, running = false;
  const plugin = { id: 'signalk-endurance', name: 'Endurance', description: 'Stop watching gauges. Go sailing.', schema };
  const prefix = () => config.publishLive ? 'environment.endurance' : 'environment.endurancePreview';
  function publish(result) {
    const base = prefix();
    const values = ['status', 'action', 'limitingResource', 'message', 'reason', 'time', 'coverage'].map(key => ({ path: `${base}.${key}`, value: result[key] }));
    for (const [key, r] of Object.entries(result.resources)) {
      for (const field of ['status', 'action', 'reason', 'time']) values.push({ path: `${base}.resources.${key}.${field}`, value: r[field] });
      if (key !== 'energy') {
        for (const field of ['capacityM3', 'currentVolumeM3', 'availableVolumeM3', 'freeVolumeM3', 'levelRatio', 'complete', 'selectedTanks', 'volumeTanks']) values.push({ path: `${base}.resources.${key}.totals.${field}`, value: r.totals[field] });
        values.push({ path: `${base}.resources.${key}.tanks`, value: r.tanks });
      }
    }
    const water=result.resources.freshwater;
    values.push({path:`${base}.resources.freshwater.consumptionRate`,value:water?.consumptionRate??null}, {path:`${base}.resources.freshwater.rateSource`,value:water?.rateSource??'unavailable'}, {path:`${base}.resources.freshwater.learning`,value:water?.learning??null});
    // Publish null durations to invalidate earlier estimates; never substitute zero.
    values.push({ path: `${base}.energyTime`, value: result.resources.energy?.time ?? null }, { path: `${base}.waterTime`, value: result.resources.freshwater?.time ?? null });
    if (config.publishLive && config.notifications) {
      const notification = ['WARNING', 'CRITICAL'].includes(result.status) ? { state: result.status === 'CRITICAL' ? 'alarm' : 'warn', method: ['visual'], message: result.message } : null;
      const next = JSON.stringify(notification);
      if (next !== signature) { values.push({ path: 'notifications.environment.endurance', value: notification }); signature = next; }
    }
    app.handleMessage(plugin.id, { context: 'vessels.self', updates: [{ timestamp: new Date().toISOString(), values }] });
  }
  function tick() {
    if (!running) return;
    try {
      discovery = discover(app);
      const resources = {};
      const now = Date.now();
      for (const [name, monitor] of Object.entries(modules)) {
        const c = config.resources[name];
        if (c.enabled) resources[name] = monitor(c, app, select(c, discovery[name]), now, {waterUsage,persistence:storageError?'error':store?'disk':'memory'});
      }
      latest = { ...decide(resources), timestamp: new Date(now).toISOString(), outputPrefix: prefix() };
      publish(latest);
      if(waterUsage?.dirty && now-lastSave>=300000)saveUsage(now);
      app.setPluginStatus(`${latest.status}: ${latest.message} (${latest.coverage.valid}/${latest.coverage.monitored} resources; ${config.publishLive ? 'live' : 'preview'})`);
    } catch (error) { app.setPluginError(error.message); }
  }
  function saveUsage(now=Date.now()) {
    if(!store||!waterUsage?.dirty)return;
    try{store.save(waterUsage.snapshot());waterUsage.dirty=false;lastSave=now;storageError=null;}
    catch(e){storageError=e.message;app.debug?.(`Endurance usage history could not be saved: ${e.message}`);}
  }
  plugin.start = options => {
    plugin.stop();
    config = normalize(options);
    store=null;storageError=null;lastSave=0;let saved=null;
    try{store=storage(app);saved=store?.load()??null;}catch(e){storageError=e.message;app.debug?.(`Endurance usage history could not be loaded: ${e.message}`);}
    waterUsage=new WaterUsage(config.resources.freshwater.learning,saved);
    running = true;
    const base = prefix();
    app.handleMessage(plugin.id, { updates: [{ meta: ['time', 'energyTime', 'waterTime', ...Object.keys(modules).map(k => `resources.${k}.time`)].map(p => ({ path: `${base}.${p}`, value: { units: 's', description: 'Estimated duration; null when unavailable. Fuel engine time is excluded.' } })) }] });
    app.handleMessage(plugin.id, { updates: [{ meta: Object.keys(modules).filter(k=>k !== 'energy').flatMap(k => ['capacityM3', 'currentVolumeM3', 'availableVolumeM3', 'freeVolumeM3', 'levelRatio'].map(field => ({ path: `${base}.resources.${k}.totals.${field}`, value: { units: field === 'levelRatio' ? 'ratio' : 'm3', description: field === 'levelRatio' ? 'Combined current volume divided by combined full capacity' : 'Combined tank volume in cubic metres; null if incomplete' } }))) }] });
    app.handleMessage(plugin.id,{updates:[{meta:[{path:`${base}.resources.freshwater.consumptionRate`,value:{units:'m3/s',description:'Estimated total freshwater usage rate; inspect rateSource for default, learning, learned or external'}}]}]});
    tick();
    timer = setInterval(tick, config.intervalSeconds * 1000);
  };
  plugin.stop = () => {
    saveUsage();
    running = false;
    if (timer) clearInterval(timer);
    timer = undefined;
    latest = null; discovery = {}; signature = null;
  };
  plugin.registerWithRouter = router => {
    router.get('/assessment', (_req, res) => res.json({ running, assessment: latest }));
    router.get('/discovery', (_req, res) => res.json({ running, candidates: discovery, configuration: config || null }));
  };
  return plugin;
};
