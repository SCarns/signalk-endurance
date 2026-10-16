'use strict';
const { assessLevel } = require('./level');
module.exports = (config, app, selection, now) => assessLevel('holding', config, app, selection, now);
