'use strict';
const { assessTanks } = require('./tanks');
module.exports = (config, app, selection, now) => assessTanks('fuel', config, app, selection, now);
