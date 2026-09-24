import { RNG, makeNoise } from './rng.js';
import { Environment } from './environment.js';
import { Surface, F } from './surface.js';
import { Vegetation } from './vegetation.js';
import { Nest } from './nest.js';
import { Colony, RivalColony, defaultGenome, mutateGenome } from './colony.js';
import { Ants } from './ants.js';
import { Predators } from './predators.js';
import { Alerts } from './alerts.js';
import { setupScenario } from './scenarios.js';
import { RIVAL_POS, NW, LAYER, CASTE, sizeToCaste } from './constants.js';

// The simulation is independent of rendering: it can be stepped headless.
export class Sim {
  constructor({ scenario = 'young', seed, genome } = {}) {
    this.seed = seed ?? ((Math.random() * 1e9) | 0);
    this.scenario = scenario;
    this.rng = new RNG(this.seed);
    this.noise = makeNoise(this.seed);
    this.time = 0;
    this.tick = 0;
    this.events = [];
    this.selected = -1;
    this.godMode = scenario === 'sandbox';
    this.godPredators = 1;

    this.env = new Environment(this.rng);
    this.surface = new Surface(this.noise);
    this.veg = new Vegetation(this.rng, this.noise, this.surface);
    this.nest = new Nest(this.rng, this.noise);
    this.colony = new Colony(this, genome);
    const rival = new RivalColony(this, 1, RIVAL_POS.x, RIVAL_POS.z, 1500, mutateGenome(defaultGenome(), this.rng));
    this.colonies = [this.colony, rival];
    this.rivals = [rival];
    this.ants = new Ants(this);
    this.predators = new Predators(this);
    this.alerts = new Alerts(this);

    setupScenario(this, scenario);
    for (let k = 0; k < 30; k++) this.surface.addMound(RIVAL_POS.x + this.rng.range(-3, 3), RIVAL_POS.z + this.rng.range(-3, 3), 0.03, 2.2);
    this.nest.rebuild();
    for (let k = 0; k < 6; k++) this.nest.stepClimate(this.env, this.colony);
    this.ants.census();
    this.colony.computeNeeds(1);
    for (let i = 0; i < this.ants.count; i++) if (this.ants.alive[i] && this.ants.caste[i] < CASTE.GYNE) this.ants.decide(i);
    this.acc1 = 0;
  }

  step(dt) {
    this.time += dt;
    this.tick++;
    const env = this.env;
    env.step(dt);
    if (env.events.length) { this.events.push(...env.events); env.events.length = 0; }
    this.surface.step(dt, env);
    this.veg.step(dt, env);

    // Workers plug entrances with soil during heavy rain (and reopen them afterwards)
    const plugT = env.rain > 0.35 ? Math.min(1, this.colony.workers / 40) * (0.4 + this.colony.priorities.dig) : 0;
    this.nest.plug += (Math.min(1, plugT) - this.nest.plug) * Math.min(1, dt * 0.04);

    this.nest.step(dt, this);
    this.colony.step(dt);
    for (const r of this.rivals) r.step(dt);
    this.ants.update(dt);
    this.predators.step(dt);

    this.acc1 += dt;
    if (this.acc1 >= 1) {
      this.ants.census();
      this.computeThreat();
      this.alerts.check();
      this.stormDamage();
      this.acc1 = 0;
    }
  }

  computeThreat() {
    const s = this.surface, col = this.colony;
    let alarm = 0;
    for (let x = -16; x <= 16; x += 2) for (let z = -16; z <= 16; z += 2) alarm += s.sample(F.ALARM, x, z);
    let preds = 0;
    for (const p of this.predators.list) if (p.y < 2 && p.type !== 'phorid' && Math.hypot(p.x, p.z) < 22) preds++;
    let rivals = 0;
    this.ants.forNear(0, 0, 22, (j) => { if (this.ants.colony[j] !== 0) rivals++; });
    col.rivalNear = rivals;
    col.threat = Math.min(2, alarm * 0.015 + preds * 0.6 + rivals * 0.04);
  }

  stormDamage() {
    const env = this.env, nest = this.nest;
    if (env.weather !== 'storm' || !nest.entrances.length || !this.rng.chance(0.012)) return;
    const e = nest.entrances[this.rng.int(nest.entrances.length)];
    for (let x = e.x0; x <= e.x1; x++)
      for (let y = 0; y < 3; y++) {
        const i = y * NW + x;
        if (!nest.solid[i]) { nest.fill(i); nest.mark[i] = 1; }
      }
    this.alerts.push('collapse', 'ENTRANCE COLLAPSED IN STORM — WORKERS RE-EXCAVATING', 'warn', { layer: 1, x: e.wx, y: -1 }, 'flooding', 30);
  }

  // ---------- God mode ----------
  godAddWorkers(n) {
    const nest = this.nest, rng = this.rng;
    const cells = [];
    for (const ch of nest.chambers) for (const c of ch.cells) cells.push(c);
    if (!cells.length) return;
    for (let k = 0; k < n; k++) {
      const size = 0.5 + (this.colony.maxWorkerSize() - 0.5) * Math.pow(rng.next(), 2.2);
      const caste = sizeToCaste(size);
      if (this.ants.canSpawn()) {
        const c = cells[rng.int(cells.length)];
        this.ants.spawn(0, caste, size, LAYER.NEST, nest.wx(c % NW), nest.wy((c / NW) | 0), rng.range(0, 8));
      } else this.colony.virtual[caste]++;
    }
  }
  godKillWorkers(frac) {
    for (let i = 0; i < this.ants.count; i++) if (this.ants.alive[i] && this.ants.colony[i] === 0 && this.rng.chance(frac)) this.ants.kill(i, 'god');
    for (let c = 0; c < 4; c++) this.colony.virtual[c] *= 1 - frac;
  }
}
