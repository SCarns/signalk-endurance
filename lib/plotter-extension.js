 'use strict';
// Signal K Plotter Extensions API v1; same provider and window action as Passage Brief.
module.exports = function createExtension(app, enabled) {
  let registered = false;
  const id = 'signalk-endurance';
  const manifest = () => ({ name: 'Endurance', version: require('../package.json').version,
    apiVersion: '1', requires: ['buttons', 'panels.iframe', 'windows'], optional: ['nightMode'],
    buttons: [{ id: 'open-endurance', title: 'Endurance', slot: 'mapToolbar', icon: 'hourglass_empty',
      action: { type: 'toggleWindow', panel: 'endurance-status', geometry: { anchor: 'bottom-right', offset: { x: 16, y: 16 }, width: 380, height: 520 }, restoreKey: 'endurance-status' } }],
    panels: [{ id: 'endurance-status', title: 'Endurance', type: 'iframe', url: `/signalk-endurance/plotterext/panel.html?v=${require('../package.json').version}` },
      { id: 'endurance-dashboard', title: 'Endurance dashboard', type: 'iframe', url: `/signalk-endurance/?v=${require('../package.json').version}` }]
  });
  return () => {
    if (registered || typeof app.registerResourceProvider !== 'function') return;
    try {
      app.registerResourceProvider({ type: 'plotterExtensions', methods: {
        listResources: async () => enabled() ? { [id]: manifest() } : {},
        getResource: async key => { if (!enabled() || key !== id) throw Error('Endurance extension unavailable'); return manifest(); },
        setResource: async () => { throw Error('Read only'); }, deleteResource: async () => { throw Error('Read only'); }
      } });
      registered = true;
    } catch (error) { app.debug?.(`Endurance extension registration unavailable: ${error.message}`); }
  };
};
