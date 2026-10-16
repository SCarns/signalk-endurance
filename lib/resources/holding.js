'use strict';
const { assessTanks } = require('./tanks');
module.exports = (config, app, selection, now) => assessTanks('holding', config, app, selection, now);
