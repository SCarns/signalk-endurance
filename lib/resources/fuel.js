'use strict';
const { assessLevel } = require('./level');
module.exports = (config, app, selection, now) => assessLevel('fuel', config, app, selection, now);
