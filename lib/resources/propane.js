'use strict';
const { assessTanks } = require('./tanks');
module.exports = (config, app, selection, now) => assessTanks('propane', config, app, selection, now);
