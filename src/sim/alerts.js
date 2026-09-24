import { ZONE } from './constants.js';
import { F } from './surface.js';

// Emergencies are detected from simulation state — never scripted.
export class Alerts {
  constructor(sim) {
    this.sim = sim;
    this.list = [];
    this.log = [];
    this.cd = {};
    this.nextId = 1;
    this.prevTrail = 0;
  }

  push(key, text, level = 'warn', focus = null, why = null, cooldown = 45) {
    const now = this.sim.time;
    if (this.cd[key] !== undefined && this.cd[key] > now) return;
    this.cd[key] = now + cooldown;
    const e = { id: this.nextId++, key, text, level, focus, why, time: now, day: this.sim.env.day };
    this.list.unshift(e);
    this.log.unshift(e);
    if (this.log.length > 60) this.log.pop();
    if (this.list.length > 5) this.list.pop();
  }

  chamberFocus(ch) {
    const n = this.sim.nest;
    return { layer: 1, x: n.wx(ch.cx), y: n.wy(ch.cy), chamber: ch.id };
  }

  check() {
    const sim = this.sim, nest = sim.nest, col = sim.colony, env = sim.env;
    const now = sim.time;
    this.list = this.list.filter((a) => now - a.time < 25);

    for (const ch of nest.chambers) {
      const s = ch.stats;
      if (!s || !s.n) continue;
      const up = ch.name.toUpperCase();
      if (ch.zone === ZONE.GARDEN && s.contam > 0.22) this.push('contam' + ch.id, `FUNGAL CONTAMINATION DETECTED — ${up}`, 'critical', this.chamberFocus(ch), 'contamination');
      if ((ch.zone === ZONE.NURSERY || ch.zone === ZONE.GARDEN || ch.zone === ZONE.QUEEN) && s.water > 0.15)
        this.push('water' + ch.id, `WATER INFILTRATION — ${up}`, 'critical', this.chamberFocus(ch), 'flooding');
      if (ch.zone === ZONE.NURSERY && (s.temp > 31 || s.temp < 19))
        this.push('ntemp' + ch.id, `NURSERY TEMPERATURE CRITICAL — ${s.temp.toFixed(1)}°C`, 'warn', this.chamberFocus(ch), 'temperature');
      if (ch.zone === ZONE.GARDEN && s.hum < 0.55) this.push('dry' + ch.id, `FUNGUS GARDEN DRYING — ${up}`, 'warn', this.chamberFocus(ch), 'humidity');
    }
    for (const p of sim.predators.list) {
      if (p.state === 'leave' || p.y > 3) continue;
      const nearNest = Math.hypot(p.x, p.z) < 22;
      const onTrail = sim.surface.sample(F.FOOD0, p.x, p.z) > 0.5;
      if (nearNest || onTrail) this.push('pred' + p.type, `PREDATOR DETECTED — ${p.name.toUpperCase()}`, 'warn', { layer: 0, x: p.x, z: p.z, predator: p.id }, p.type === 'phorid' ? 'phorid' : 'predators', 60);
    }
    const trail = sim.surface.totals[F.FOOD0];
    if (this.prevTrail > 60 && trail < this.prevTrail * 0.55 && env.rain > 0.3) this.push('trail', 'FORAGING TRAIL COLLAPSED', 'warn', { layer: 0, x: 0, z: 0 }, 'rainTrails', 90);
    this.prevTrail = trail;
    if (col.workers > 5 && col.foodFrac < 0.1) this.push('food', 'FOOD SHORTAGE', 'critical', null, 'fungusFood');
    if (col.rivalNear > 12) this.push('rival', 'RIVAL COLONY ENCROACHMENT', 'warn', { layer: 0, x: 0, z: 0 }, 'territory', 80);
    if (col.queen.alive && col.queen.health < 0.5) this.push('queenH', 'QUEEN HEALTH DECLINING', 'critical', { layer: 1, x: col.queen.x, y: col.queen.y }, 'queen', 60);
    if (col.brood.length > col.broodCapacity()) this.push('crowd', 'NURSERY OVERCROWDED — BUILD MORE NURSERY SPACE', 'warn', null, 'nursery', 120);
    if (!nest.gardenCells.length) this.push('nogarden', 'NO FUNGUS GARDEN — THE COLONY WILL STARVE', 'critical', null, 'fungusFood', 120);
    if (nest.has && !nest.entrances.length) this.push('noent', 'NEST SEALED — NO OPEN ENTRANCE', 'warn', null, 'flooding', 60);
  }
}
