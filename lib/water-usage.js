'use strict';
// Independently implemented boat-wide usage estimation. Internal volume unit: m³.
const DAY = 86400000;
const finite = v => typeof v === 'number' && Number.isFinite(v);
const median = a => [...a].sort((a,b)=>a-b)[Math.floor(a.length/2)];
class WaterUsage {
  constructor(settings, saved = null) {
    this.settings = settings;
    this.supply = typeof saved?.signature === 'string' ? saved.signature : null;
    this.bins = {};
    if ([1,2].includes(saved?.version) && saved.bins && typeof saved.bins === 'object') {
      for (const [key,b] of Object.entries(saved.bins)) if (/^\d+$/.test(key) && b && finite(b.rate) && b.rate >= 0 && b.rate <= settings.maxDailyVolumeM3 / (saved.version === 1 ? 1 : 86400) && finite(b.hours) && b.hours >= 0 && Number.isInteger(b.intervals) && b.intervals >= 0) this.bins[key] = { rate:b.rate / (saved.version === 1 ? 86400 : 1), hours:b.hours, intervals:b.intervals };
    }
    this.reset('STARTING');
    this.dirty = false;
  }
  reset(reason) { this.history=[]; this.anchor=null;  this.pending=null; this.lastTimestamp=null; this.reason=reason; }
  snapshot() { return {version:2,signature:this.supply,bins:this.bins}; }
  prediction(crew) {
    const bin = this.bins[String(crew)];
    const learned = bin && bin.hours >= this.settings.minimumHours && bin.intervals >= 3;
    return { rate: learned ? bin.rate : this.settings.defaultDailyVolumeM3 * crew / 86400,
      source: learned ? 'learned' : bin ? 'learning' : 'default',
      observationHours:bin?.hours || 0, intervals:bin?.intervals || 0, crewCount:crew,
      reason:this.reason, ready:!!learned };
  }
  observe(sample) {
    const {now,crew,paused,signature,tanks,capacity} = sample;
    if (!finite(now) || !Number.isInteger(crew) || crew < 0) { this.reset('INVALID_CREW_OR_TIME'); return null; }
    const valid = Array.isArray(tanks) && tanks.length > 0 && tanks.every(t=>finite(t.volume) && t.volume >= 0 && finite(t.timestamp) && t.timestamp <= now+5000);
    if(signature !== this.supply) {this.bins={};this.supply=signature;this.dirty=true;this.reset('SUPPLY_CHANGED');}
    const key = JSON.stringify([signature,crew]);
    if (key !== this.key) { this.reset('SUPPLY_OR_CREW_CHANGED'); this.key=key; }
    if (!valid || paused) { this.reset(paused ? 'LEARNING_PAUSED' : 'INCOMPLETE_VOLUME'); return this.prediction(crew); }
    // Require a newly timestamped complete supply; polling is not a new observation.
    const timestamp = Math.min(...tanks.map(t=>t.timestamp));
    if(Math.max(...tanks.map(t=>t.timestamp))-timestamp>300000){this.reset('UNSETTLED_TIMESTAMPS');return this.prediction(crew);}
    if(this.lastTimestamp !== null && timestamp < this.lastTimestamp)this.reset('CLOCK_OR_SOURCE_CHANGED');
    if (this.lastTimestamp !== null && timestamp === this.lastTimestamp) return this.prediction(crew);
    if (this.lastTimestamp !== null && (timestamp-this.lastTimestamp > 6*3600000 || timestamp < this.lastTimestamp)) this.reset('OBSERVATION_GAP');
    if (this.lastTimestamp !== null && timestamp-this.lastTimestamp < 300000) return this.prediction(crew);
    this.lastTimestamp=timestamp;
    this.history.push(tanks.map(t=>t.volume)); if(this.history.length>3)this.history.shift();
    if(this.history.length<3) { this.reason='SETTLING'; return this.prediction(crew); }
    const volumes=tanks.map((_,i)=>median(this.history.map(h=>h[i])));
    const total=volumes.reduce((s,v)=>s+v,0);
    if(!finite(total)){this.reset('INVALID_VOLUME');return this.prediction(crew);}
    const point={volumes,total,timestamp};
    const noise=Math.max(.0005,finite(capacity)&&capacity>0?capacity*.002:0);
    if(!this.anchor) {this.anchor=point;this.reason='OBSERVING';return this.prediction(crew);}
    // Opposing tank movements suggest a transfer or asynchronous sender updates.
    // Ignore the entire unsettled interval, even if their measured totals differ.
    const changes=volumes.map((v,i)=>v-this.anchor.volumes[i]);
    if(changes.some(d=>d>noise)&&changes.some(d=>d< -noise)) {
      this.anchor=point;this.pending=null;this.reason='TRANSFER_OR_MIXED_MOVEMENT';return this.prediction(crew);
    }
    const drop=this.anchor.total-total;
    const elapsed=timestamp-this.anchor.timestamp;
    if(drop < -noise) {this.anchor=point;this.pending=null;this.reason='REFILL';return this.prediction(crew);}
    if(elapsed < 3600000) {return this.prediction(crew);}
    if(elapsed>7*DAY){this.anchor=point;this.pending=null;this.reason='OBSERVATION_TOO_LONG';return this.prediction(crew);}
    if(drop <= noise) {
      this.pending=null;this.reason='BELOW_SENSOR_RESOLUTION';return this.prediction(crew);
    } else if(!this.pending) { this.pending=point;this.reason='CONFIRMING_USAGE';return this.prediction(crew); }
    else if(total > this.pending.total+noise) {this.pending=null;this.reason='UNCONFIRMED_MOVEMENT';return this.prediction(crew);}
    const consumed=Math.max(0,drop);
    const rate=consumed/(elapsed/1000);
    if(rate>this.settings.maxDailyVolumeM3/86400){this.anchor=point;this.pending=null;this.reason='IMPLAUSIBLE_USAGE';return this.prediction(crew);}
    const hours=elapsed/3600000;
    const old=this.bins[String(crew)];
    // Blend by actual observed time, capping old influence at one week.
    const weight=old?Math.min(old.hours,168):0;
    this.bins[String(crew)]={rate:old?(old.rate*weight+rate*hours)/(weight+hours):rate,hours:(old?.hours||0)+hours,intervals:(old?.intervals||0)+1};
    this.dirty=true;this.anchor=point;this.pending=null;this.reason='OBSERVATION_ACCEPTED';
    return this.prediction(crew);
  }
}
module.exports={WaterUsage};
