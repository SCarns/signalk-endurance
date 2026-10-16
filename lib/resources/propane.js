'use strict';
const { assessLevel } = require('./level');
module.exports = (config, app, selection, now) => assessLevel('propane', config, app, selection, now);
