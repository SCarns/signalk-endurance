'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const {build}=require('../public/passage-view-model');
test('passage cards retain forecast gaps, minima, reserve and source without changing assessment',()=>{
 const p={status:'PROVISIONAL',resources:{energy:{status:'PROVISIONAL',reason:'FORECAST_HORIZON',minimumSOC:.807,reserve:.65,coveredSeconds:7200,uncoveredSeconds:3600,forecastSource:'Open-Meteo'}}};const before=structuredClone(p);
 const v=build(p,'litres');assert.equal(v.tone,'watch');assert.equal(v.cards[0].name,'Power');assert.equal(v.cards[0].metric.value,'80.7');
 assert(v.cards[0].facts.some(f=>f.label==='Beyond forecast'&&f.value==='1.0 hours'));assert.deepEqual(p,before);
});
test('fuel card preserves zero demand and shows planning source, units and full-duration allowance',()=>{
 const r={status:'SUFFICIENT',reason:'PROFILE_AT_PASSAGE_BRIEF_RATE',requiredM3:.0733186,availableM3:.10865,reserveM3:.075,litresPerHour:1.8,rateBasis:'PASSAGE_BRIEF_SETTING',fuelDemandSeconds:146637.2,fuelDurationBasis:'FULL_PLANNED_DURATION'};
 const card=build({status:'SUFFICIENT',resources:{fuel:r}},'gallons').cards[0];assert.equal(card.metric.unit,'US gal');assert.equal(card.metric.value,'19.4');assert(card.facts.some(f=>f.value==='Passage Brief setting'));assert(card.facts.some(f=>f.label==='Full-duration engine allowance'));
 r.requiredM3=0;assert.equal(build({resources:{fuel:r}},'litres').cards[0].metric.value,'0');
});
test('unknown enabled resources remain cards; unavailable and below-reserve data do not become zero demand',()=>{
 const cards=build({resources:{freshwater:{status:'SHORTFALL',reason:'RESERVE',availableM3:-.08},propane:{status:'UNKNOWN',reason:'CONSUMPTION_UNAVAILABLE'}}},'litres').cards;
 assert.deepEqual(cards.map(c=>c.key),['freshwater','propane']);assert.equal(cards[0].badge,'Shortfall');assert.equal(cards[1].badge,'Incomplete');assert(cards.every(c=>c.metric.value==='—'));assert.equal(cards[0].facts.length,0);
});
