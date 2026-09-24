import { MAX_ANTS, CASTE, TASK, NTASK, LAYER, CARRY, HALF, NW, DAY_LEN, ZONE } from './constants.js';
import { TGT, UNREACH } from './nest.js';
import { F } from './surface.js';
import { SPECIES } from './vegetation.js';
import { LIFESPAN } from './colony.js';

// Behaviour phases
export const P = {
  EXIT: 0, SEARCH: 1, APPROACH: 2, CUT: 3, RETURN: 4, STORE: 5, RIDE: 6,
  G_START: 10, G_TOCACHE: 11, G_CARRY: 12, G_PROCESS: 13, G_TOGARDEN: 14, G_GROOM: 15,
  N_START: 20, N_TOQUEEN: 21, N_CARRY: 22, N_TONURSERY: 23, N_TEND: 24,
  D_GO: 30, D_DIG: 31, D_HAUL: 32, D_DUMP: 33,
  W_GO: 40, W_SEARCH: 41, W_HAUL: 42, W_DROP: 43, W_DUMPOUT: 44,
  F_START: 50, F_EXIT: 51, F_PATROL: 52, F_NEST: 53,
  R_GO: 60, R_REST: 61,
  HOME: 90,
  FLIGHT: 95,
};
const START = [P.R_GO, P.EXIT, P.G_START, P.N_START, P.D_GO, P.W_GO, P.F_START, P.EXIT];

export const PHASE_TEXT = {
  [P.EXIT]: 'heading for the surface', [P.SEARCH]: 'searching for vegetation', [P.APPROACH]: 'approaching a plant',
  [P.CUT]: 'cutting a leaf fragment', [P.RETURN]: 'returning to the nest', [P.STORE]: 'carrying leaf to the store',
  [P.RIDE]: 'hitchhiking on a leaf (guarding against phorid flies)',
  [P.G_START]: 'assessing the garden', [P.G_TOCACHE]: 'fetching leaf material', [P.G_CARRY]: 'carrying leaf to the garden',
  [P.G_PROCESS]: 'chewing leaf pulp into the garden', [P.G_TOGARDEN]: 'going to the fungus garden', [P.G_GROOM]: 'weeding and grooming fungus',
  [P.N_START]: 'checking the brood', [P.N_TOQUEEN]: 'collecting eggs from the queen', [P.N_CARRY]: 'carrying brood to the nursery',
  [P.N_TONURSERY]: 'going to the nursery', [P.N_TEND]: 'feeding and licking larvae',
  [P.D_GO]: 'going to the excavation front', [P.D_DIG]: 'excavating soil', [P.D_HAUL]: 'hauling a soil pellet out', [P.D_DUMP]: 'depositing soil on the mound',
  [P.W_GO]: 'going to collect refuse', [P.W_SEARCH]: 'looking for spent substrate', [P.W_HAUL]: 'carrying refuse', [P.W_DROP]: 'dumping refuse', [P.W_DUMPOUT]: 'carrying refuse to the outside dump',
  [P.F_START]: 'assessing threats', [P.F_EXIT]: 'heading out to defend', [P.F_PATROL]: 'patrolling', [P.F_NEST]: 'guarding tunnel junctions',
  [P.R_GO]: 'going to rest', [P.R_REST]: 'resting', [P.HOME]: 'returning home', [P.FLIGHT]: 'leaving for the nuptial flight',
};

// Response thresholds [caste][task] — lower = responds more readily.
const THRESH = [
  // REST FORAGE GARDEN NURSE DIG  WASTE DEFEND EXPLORE
  [9, 1.4, 0.28, 0.3, 1.1, 0.9, 6, 1.8],   // minim
  [9, 0.38, 0.9, 1.0, 0.5, 0.75, 1.6, 0.7], // media
  [9, 0.55, 3, 3, 0.45, 1.8, 0.45, 1.1],   // major
  [9, 3, 9, 9, 1.4, 9, 0.22, 3],           // soldier
];
const AGE_YOUNG = [1, 1.7, 0.6, 0.55, 1.2, 2.0, 1.8, 1.7];
const AGE_OLD = [1, 0.7, 1.4, 1.7, 0.9, 0.5, 0.8, 0.7];

const BUCKETS = 128; // 1-unit spatial hash over the surface

export class Ants {
  constructor(sim, cap = MAX_ANTS) {
    this.sim = sim;
    this.cap = cap;
    this.count = 0;
    this.free = [];
    this.live = 0;
    const f32 = () => new Float32Array(cap), u8 = () => new Uint8Array(cap), i32 = () => new Int32Array(cap);
    this.alive = u8(); this.colony = u8(); this.caste = u8(); this.layer = u8();
    this.size = f32(); this.age = f32(); this.maxAge = f32(); this.energy = f32(); this.health = f32(); this.hunger = f32();
    this.x = f32(); this.y = f32(); this.hd = f32(); this.spd = f32(); this.anim = f32();
    this.task = u8(); this.phase = u8(); this.timer = f32();
    this.carry = u8(); this.carryAmt = f32(); this.carrySp = u8();
    this.target = i32(); this.wp = i32(); this.tx = f32(); this.ty = f32();
    this.homeX = f32(); this.homeZ = f32();
    this.rider = i32().fill(-1); this.ridingOn = i32().fill(-1);
    this.exp = new Float32Array(cap * NTASK);
    this.parasite = u8(); this.fightT = f32(); this.recruit = u8();
    this.contacts = f32(); this.pher = f32(); this.tempExp = f32(); this.injury = f32();
    this.head = new Int32Array(BUCKETS * BUCKETS);
    this.next = new Int32Array(cap);
    this.tick = 0;
    this.version = 0;
  }

  canSpawn() { return this.free.length > 0 || this.count < this.cap; }

  spawn(colony, caste, size, layer, x, y, ageDays = 0) {
    let i;
    if (this.free.length) i = this.free.pop();
    else if (this.count < this.cap) i = this.count++;
    else return -1;
    const rng = this.sim.rng;
    this.alive[i] = 1; this.colony[i] = colony; this.caste[i] = caste; this.layer[i] = layer;
    this.size[i] = size; this.age[i] = ageDays; this.maxAge[i] = LIFESPAN[caste] * rng.range(0.75, 1.25);
    this.energy[i] = rng.range(0.6, 1); this.health[i] = 1; this.hunger[i] = 0;
    this.x[i] = x; this.y[i] = y; this.hd[i] = rng.range(0, Math.PI * 2); this.spd[i] = 0; this.anim[i] = rng.range(0, 6.28);
    this.task[i] = TASK.REST; this.phase[i] = P.R_GO; this.timer[i] = 0;
    this.carry[i] = 0; this.carryAmt[i] = 0; this.carrySp[i] = 0;
    this.target[i] = -1; this.wp[i] = -1;
    this.homeX[i] = x; this.homeZ[i] = layer === LAYER.SURFACE ? y : 0;
    this.rider[i] = -1; this.ridingOn[i] = -1;
    for (let t = 0; t < NTASK; t++) this.exp[i * NTASK + t] = 0;
    this.parasite[i] = 0; this.fightT[i] = 0; this.recruit[i] = 0; this.contacts[i] = 0; this.injury[i] = 0;
    this.live++;
    if (caste < CASTE.GYNE && colony === 0) this.decide(i);
    return i;
  }

  assign(i, task) {
    this.task[i] = task;
    this.phase[i] = task === TASK.DEFEND ? P.F_PATROL : P.SEARCH;
    this.timer[i] = 0;
    if (this.layer[i] === LAYER.NEST) this.phase[i] = START[task];
  }

  kill(i, cause = 'unknown') {
    if (!this.alive[i]) return;
    const sim = this.sim;
    this.alive[i] = 0;
    this.live--;
    this.free.push(i);
    const c = this.colony[i];
    if (this.rider[i] >= 0) { const r = this.rider[i]; this.ridingOn[r] = -1; if (this.alive[r]) this.phase[r] = P.HOME; }
    if (this.ridingOn[i] >= 0) this.rider[this.ridingOn[i]] = -1;
    this.rider[i] = -1; this.ridingOn[i] = -1;
    if (c === 0) {
      sim.colony.stats.deaths++;
      if (this.carry[i] === CARRY.BROOD) sim.colony.dropBrood(i);
      if (this.layer[i] === LAYER.NEST) {
        const cell = sim.nest.cellAt(this.x[i], this.y[i]);
        if (cell >= 0) sim.nest.refuse[cell] += 0.25; // corpse — later removed by waste workers
      }
    } else if (cause !== 'home') {
      const r = sim.colonies[c];
      if (r) r.pop = Math.max(0, r.pop - 1);
    }
    if (c !== 0 && sim.colonies[c]) sim.colonies[c].surfaceCount--;
    if (sim.selected === i) sim.selectedLost = true;
  }

  // ---------- task allocation ----------
  threshold(i, t) {
    const lifeFrac = this.age[i] / this.maxAge[i];
    const ageT = lifeFrac < 0.2 ? AGE_YOUNG : lifeFrac > 0.6 ? AGE_OLD : null;
    return THRESH[Math.min(3, this.caste[i])][t] * (ageT ? ageT[t] : 1) * (1 - 0.45 * this.exp[i * NTASK + t]);
  }

  decide(i) {
    const sim = this.sim, rng = sim.rng;
    const cst = this.caste[i];
    this.timer[i] = 0; this.wp[i] = -1; this.target[i] = -1; this.recruit[i] = 0;
    if (cst >= CASTE.GYNE) { this.task[i] = TASK.REST; this.phase[i] = this.layer[i] ? P.R_GO : P.HOME; return; }
    const col = sim.colonies[this.colony[i]];
    if (!col.isPlayer) { this.phase[i] = P.HOME; return; }
    let task = TASK.REST;
    if (this.energy[i] > 0.2) {
      const probs = this._probs || (this._probs = new Float32Array(NTASK));
      let sum = 0.1 + (1 - this.energy[i]) * 0.3;
      probs[0] = sum;
      for (let t = 1; t < NTASK; t++) {
        const s = col.stim[t];
        const th = this.threshold(i, t);
        const p = (s * s) / (s * s + th * th + 1e-6);
        probs[t] = p;
        sum += p;
      }
      let r = rng.next() * sum;
      for (let t = 0; t < NTASK; t++) { r -= probs[t]; if (r <= 0) { task = t; break; } }
    }
    this.task[i] = task;
    const surfaceTask = task === TASK.FORAGE || task === TASK.EXPLORE || task === TASK.DEFEND;
    this.phase[i] = this.layer[i] === LAYER.SURFACE && !surfaceTask ? P.HOME : this.layer[i] === LAYER.SURFACE ? (task === TASK.DEFEND ? P.F_PATROL : P.SEARCH) : START[task];
  }

  // Keep doing the same job (task fidelity) unless the stimulus has faded.
  persist(i) {
    const col = this.sim.colonies[this.colony[i]];
    const t = this.task[i];
    const e = this.exp;
    e[i * NTASK + t] = Math.min(1, e[i * NTASK + t] + 0.03);
    for (let k = 0; k < NTASK; k++) if (k !== t) e[i * NTASK + k] *= 0.995;
    if (this.energy[i] > 0.2 && this.sim.rng.next() < 0.72 && col.stim[t] > 0.15) {
      this.timer[i] = 0; this.wp[i] = -1;
      this.phase[i] = this.layer[i] === LAYER.SURFACE && START[t] !== P.EXIT ? P.HOME : this.layer[i] === LAYER.SURFACE ? P.SEARCH : START[t];
      return;
    }
    this.decide(i);
  }

  releaseAlates(colony) {
    for (let i = 0; i < this.count; i++)
      if (this.alive[i] && this.colony[i] === colony && this.caste[i] >= CASTE.GYNE) { this.phase[i] = P.FLIGHT; this.wp[i] = -1; }
  }

  // ---------- movement helpers ----------
  navNest(i, tgt, dt, speed) {
    const nest = this.sim.nest;
    let c = nest.cellAt(this.x[i], this.y[i]);
    if (c < 0 || nest.solid[c]) {
      c = nest.nearestOpen(this.x[i], this.y[i]);
      if (c < 0) return -1;
      this.x[i] = nest.wx(c % NW); this.y[i] = nest.wy((c / NW) | 0); this.wp[i] = -1;
    }
    const big = this.size[i] >= 1.9;
    const field = nest.dist[tgt][big && nest.large[c] ? 1 : 0];
    const d = field[c];
    if (d === UNREACH) { this.spd[i] = 0; return -1; }
    nest.traffic[c] += dt;
    let w = this.wp[i];
    if (w < 0 || nest.solid[w]) {
      if (d === 0) { this.spd[i] = 0; return 1; }
      w = -1;
      let bd = d;
      const x = c % NW;
      const cand = [x > 0 ? c - 1 : -1, x < NW - 1 ? c + 1 : -1, c - NW, c + NW];
      const off = (Math.random() * 4) | 0;
      for (let k = 0; k < 4; k++) {
        const n = cand[(k + off) & 3];
        if (n < 0 || n >= nest.N || nest.solid[n]) continue;
        if (field[n] < bd) { bd = field[n]; w = n; }
      }
      if (w < 0) { this.spd[i] = 0; return d === 0 ? 1 : -1; }
      this.wp[i] = w;
      this.tx[i] = nest.wx(w % NW) + (Math.random() - 0.5) * 0.3;
      this.ty[i] = nest.wy((w / NW) | 0) + (Math.random() - 0.5) * 0.3;
    }
    let sp = speed;
    if (big && !nest.large[c]) sp *= 0.35; // squeezing through a narrow tunnel
    if (nest.water[c] > 0.3) sp *= 0.5;
    this.moveToward(i, this.tx[i], this.ty[i], sp, dt);
    return 0;
  }

  wanderNest(i, dt, zone, speed) {
    const nest = this.sim.nest;
    let c = nest.cellAt(this.x[i], this.y[i]);
    if (c < 0 || nest.solid[c]) { c = nest.nearestOpen(this.x[i], this.y[i]); if (c < 0) return; this.wp[i] = -1; }
    if (this.wp[i] < 0) {
      if (Math.random() < 0.02) {
        const x = c % NW;
        const cand = [x > 0 ? c - 1 : -1, x < NW - 1 ? c + 1 : -1, c - NW, c + NW, c];
        const n = cand[(Math.random() * 5) | 0];
        if (n >= 0 && n < nest.N && !nest.solid[n] && (zone < 0 || nest.zone[n] === zone || n === c)) {
          this.wp[i] = n;
          this.tx[i] = nest.wx(n % NW) + (Math.random() - 0.5) * 0.36;
          this.ty[i] = nest.wy((n / NW) | 0) + (Math.random() - 0.5) * 0.36;
        }
      }
      this.spd[i] = 0;
      return;
    }
    this.moveToward(i, this.tx[i], this.ty[i], speed * 0.5, dt);
  }

  moveToward(i, tx, ty, sp, dt) {
    const dx = tx - this.x[i], dy = ty - this.y[i];
    const d = Math.hypot(dx, dy), step = sp * dt;
    if (d > 1e-4) this.hd[i] = Math.atan2(dy, dx);
    if (d <= step) { this.x[i] = tx; this.y[i] = ty; this.wp[i] = -1; this.spd[i] = d / dt; }
    else { this.x[i] += (dx / d) * step; this.y[i] += (dy / d) * step; this.spd[i] = sp; }
  }

  moveSurf(i, sp, dt) {
    const surf = this.sim.surface;
    const ox = this.x[i], oz = this.y[i];
    const nx = ox + Math.cos(this.hd[i]) * sp * dt, nz = oz + Math.sin(this.hd[i]) * sp * dt;
    if (nx < -HALF + 1 || nx > HALF - 1 || nz < -HALF + 1 || nz > HALF - 1 || surf.isWater(nx, nz)) {
      this.hd[i] += Math.PI * (0.6 + Math.random() * 0.8);
      this.spd[i] = 0;
      return;
    }
    this.x[i] = nx; this.y[i] = nz; this.spd[i] = sp;
  }

  steer(i, tx, tz, rate, dt) {
    const want = Math.atan2(tz - this.y[i], tx - this.x[i]);
    let d = want - this.hd[i];
    d = Math.atan2(Math.sin(d), Math.cos(d));
    const m = rate * dt;
    this.hd[i] += d > m ? m : d < -m ? -m : d;
  }

  // three-sensor chemotaxis; returns max concentration, stores turn direction in this._turn
  sense(i, f) {
    const s = this.sim.surface, x = this.x[i], z = this.y[i], h = this.hd[i], D = 1.3, A = 0.6;
    const l = s.sample(f, x + Math.cos(h - A) * D, z + Math.sin(h - A) * D);
    const c = s.sample(f, x + Math.cos(h) * D, z + Math.sin(h) * D);
    const r = s.sample(f, x + Math.cos(h + A) * D, z + Math.sin(h + A) * D);
    this._turn = c >= l && c >= r ? 0 : l > r ? -1 : 1;
    return Math.max(l, c, r);
  }

  homeOf(i) {
    const col = this.sim.colonies[this.colony[i]];
    if (!col.isPlayer) { this._hx = col.nestX; this._hz = col.nestZ; return; }
    const ents = this.sim.nest.entrances;
    if (!ents.length) { this._hx = this.homeX[i]; this._hz = 0; return; }
    let best = ents[0], bd = 1e9;
    for (const e of ents) { const d = Math.abs(e.wx - this.x[i]) + Math.abs(this.y[i]) * 0.2; if (d < bd) { bd = d; best = e; } }
    this._hx = best.wx; this._hz = 0;
  }

  emerge(i) {
    this.layer[i] = LAYER.SURFACE;
    this.y[i] = (Math.random() - 0.5) * 0.4;
    this.hd[i] = Math.random() * Math.PI * 2;
    this.homeX[i] = this.x[i]; this.homeZ[i] = 0;
    this.wp[i] = -1;
    this.timer[i] = 0;
    if (this.rider[i] >= 0) this.x[this.rider[i]] = this.x[i];
  }

  enterNest(i) {
    const ents = this.sim.nest.entrances;
    if (!ents.length) return false;
    let best = ents[0], bd = 1e9;
    for (const e of ents) { const d = Math.abs(e.wx - this.x[i]); if (d < bd) { bd = d; best = e; } }
    this.layer[i] = LAYER.NEST;
    this.x[i] = best.wx + (Math.random() - 0.5) * 0.3 * (best.x1 - best.x0 + 1);
    this.y[i] = -0.25;
    this.wp[i] = -1;
    return true;
  }

  // ---------- main update ----------
  update(dt) {
    const sim = this.sim;
    this.tick++;
    this.buildHash();
    const env = sim.env, nest = sim.nest, colony = sim.colony;
    const foodOK = colony.food > 0.01;
    const hotSurface = env.temp > 38;
    for (let i = 0; i < this.count; i++) {
      if (!this.alive[i]) continue;
      // physiology
      this.age[i] += dt / DAY_LEN;
      if (this.age[i] > this.maxAge[i]) { this.kill(i, 'age'); continue; }
      const surf = this.layer[i] === LAYER.SURFACE;
      if (this.phase[i] !== P.R_REST) this.energy[i] -= dt * (surf ? 0.0022 : 0.0011);
      this.hunger[i] += dt * 0.0012;
      if (!surf && this.colony[i] === 0 && foodOK && this.hunger[i] > 0) this.hunger[i] = Math.max(0, this.hunger[i] - dt * 0.03);
      if (this.colony[i] !== 0) this.hunger[i] = 0;
      if (this.hunger[i] > 1) this.health[i] -= dt * 0.004;
      if (this.parasite[i]) this.health[i] -= dt * 0.0012;
      if (surf) {
        if (hotSurface) this.health[i] -= dt * 0.004;
        this.tempExp[i] = env.temp;
      } else {
        const c = nest.cellAt(this.x[i], this.y[i]);
        if (c >= 0) {
          this.tempExp[i] = nest.temp[c];
          if (nest.water[c] > 0.75) this.health[i] -= dt * 0.012;
          if (nest.temp[c] > 36) this.health[i] -= dt * 0.004;
        }
      }
      if (this.health[i] <= 0) { this.kill(i, 'health'); continue; }
      if (this.fightT[i] > 0) { this.fightT[i] -= dt; this.spd[i] = 0; this.anim[i] += dt * 20; continue; }

      if (this.ridingOn[i] >= 0) { this.updateRider(i); continue; }
      if (this.phase[i] === P.FLIGHT) { this.updateFlight(i, dt); continue; }
      if (surf) this.updateSurface(i, dt);
      else this.updateNest(i, dt);
      this.anim[i] += dt * (4 + this.spd[i] * 16 / Math.sqrt(this.size[i]));
    }
  }

  buildHash() {
    const head = this.head, next = this.next;
    head.fill(-1);
    for (let i = 0; i < this.count; i++) {
      if (!this.alive[i] || this.layer[i] !== LAYER.SURFACE) continue;
      const b = this.bucket(this.x[i], this.y[i]);
      next[i] = head[b];
      head[b] = i;
    }
  }
  bucket(x, z) {
    let bx = Math.floor(x + HALF), bz = Math.floor(z + HALF);
    bx = bx < 0 ? 0 : bx >= BUCKETS ? BUCKETS - 1 : bx;
    bz = bz < 0 ? 0 : bz >= BUCKETS ? BUCKETS - 1 : bz;
    return bz * BUCKETS + bx;
  }
  // iterate surface ants near (x,z)
  forNear(x, z, r, fn) {
    const bx0 = Math.max(0, Math.floor(x - r + HALF)), bx1 = Math.min(BUCKETS - 1, Math.floor(x + r + HALF));
    const bz0 = Math.max(0, Math.floor(z - r + HALF)), bz1 = Math.min(BUCKETS - 1, Math.floor(z + r + HALF));
    for (let bz = bz0; bz <= bz1; bz++)
      for (let bx = bx0; bx <= bx1; bx++)
        for (let j = this.head[bz * BUCKETS + bx]; j >= 0; j = this.next[j]) if (fn(j) === true) return;
  }

  updateRider(i) {
    const j = this.ridingOn[i];
    if (!this.alive[j] || this.carry[j] !== CARRY.LEAF) {
      this.ridingOn[i] = -1;
      if (this.alive[j]) this.rider[j] = -1;
      this.phase[i] = this.layer[i] === LAYER.SURFACE ? P.HOME : START[this.task[i]];
      return;
    }
    this.x[i] = this.x[j]; this.y[i] = this.y[j]; this.hd[i] = this.hd[j] + 1.2; this.layer[i] = this.layer[j];
    this.spd[i] = 0;
    if (this.layer[j] === LAYER.NEST) {
      this.ridingOn[i] = -1; this.rider[j] = -1;
      this.persist(i);
    }
  }

  updateFlight(i, dt) {
    if (this.layer[i] === LAYER.NEST) {
      const r = this.navNest(i, TGT.EXIT, dt, 1.2);
      if (r === 1) this.emerge(i);
      return;
    }
    this.sim.colony.launchAlate(this.caste[i] === CASTE.GYNE);
    this.kill(i, 'flight');
    this.sim.colony.stats.deaths--; // not a death
  }

  baseSpeed(i) {
    const s = this.size[i];
    return (0.9 + 0.35 * Math.sqrt(s)) * (this.carry[i] ? 0.75 : 1) * (this.health[i] < 0.4 ? 0.6 : 1);
  }

  // ---------- surface behaviour ----------
  updateSurface(i, dt) {
    const sim = this.sim, surf = sim.surface, veg = sim.veg;
    const c = this.colony[i], col = sim.colonies[c];
    const isPlayer = c === 0;
    const FOOD = c === 0 ? F.FOOD0 : F.FOOD1, HOME = c === 0 ? F.HOME0 : F.HOME1, TERR = c === 0 ? F.TERR0 : F.TERR1;
    const stagger = ((i + this.tick) & 3) === 0;
    const x = this.x[i], z = this.y[i];
    let sp = this.baseSpeed(i);
    surf.deposit(F.TRAFFIC, x, z, dt * 0.2);
    surf.deposit(TERR, x, z, dt * 0.05);

    // encounters: combat with foreign ants, antennal contact with nestmates
    if (stagger) {
      let enemy = -1;
      this.forNear(x, z, 0.5, (j) => {
        if (j === i || this.ridingOn[j] >= 0) return;
        const dx = this.x[j] - x, dz = this.y[j] - z;
        if (dx * dx + dz * dz > 0.2) return;
        if (this.colony[j] !== c) { enemy = j; return true; }
        this.contacts[i] += 1;
      });
      if (enemy >= 0) {
        const g = col.genome ? col.genome.aggression : 1;
        const dmg = 0.1 * Math.pow(this.size[enemy], 1.5) / this.size[i] * dt * 4;
        this.health[enemy] -= 0.1 * Math.pow(this.size[i], 1.5) / this.size[enemy] * dt * 4 * g;
        this.health[i] -= dmg;
        this.injury[i] += dmg;
        this.fightT[i] = 0.4;
        surf.deposit(F.ALARM, x, z, 0.8);
        if (this.carry[i] === CARRY.LEAF && Math.random() < 0.1) { this.carry[i] = 0; }
        return;
      }
    }

    // alarm response
    const alarm = surf.sample(F.ALARM, x, z);
    this.pher[i] = alarm;
    if (alarm > 0.6 && this.task[i] !== TASK.DEFEND) {
      if (this.caste[i] >= CASTE.MAJOR && Math.random() < 0.01) { this.task[i] = TASK.DEFEND; this.phase[i] = P.F_PATROL; this.timer[i] = 0; }
    }

    const ph = this.phase[i];
    if (ph === P.HOME || (!isPlayer && ph === P.RETURN)) {
      this.homeOf(i);
      const hx = this._hx, hz = this._hz;
      this.steer(i, hx, hz, 5, dt);
      this.hd[i] += (Math.random() - 0.5) * dt * 2;
      if (this.carry[i] === CARRY.LEAF) surf.deposit(FOOD, x, z, dt * 6 * SPECIES[this.carrySp[i]].quality * (this.recruit[i] ? 2 : 1));
      this.moveSurf(i, sp, dt);
      if (Math.hypot(hx - this.x[i], hz - this.y[i]) < 0.7) this.arrive(i);
      return;
    }

    if (this.task[i] === TASK.DEFEND) { this.updateDefender(i, dt, sp, isPlayer); return; }

    // rain drives foragers home
    if (sim.env.rain > 0.5 && ph === P.SEARCH) { this.phase[i] = isPlayer ? P.RETURN : P.HOME; return; }

    const exploring = this.task[i] === TASK.EXPLORE;
    if (ph === P.SEARCH) {
      this.timer[i] += dt;
      let turn = (Math.random() - 0.5) * (exploring ? 7 : 3.5) * dt;
      if (!exploring) {
        const m = this.sense(i, FOOD);
        this.pher[i] = m;
        if (m > 0.04) turn += this._turn * 3.2 * dt;
        else {
          // spread outward from the nest when no trail is present
          this.homeOf(i);
          const away = Math.atan2(z - this._hz, x - this._hx);
          let d = away - this.hd[i]; d = Math.atan2(Math.sin(d), Math.cos(d));
          turn += d * 0.25 * dt;
        }
      }
      // avoid strongly foreign-scented ground unless aggressive
      if (stagger) {
        const foreign = surf.sample(c === 0 ? F.TERR1 : F.TERR0, x, z);
        if (foreign > 3 && Math.random() < 0.3 / (col.genome ? col.genome.aggression : 1)) turn += Math.PI * 0.5;
      }
      this.hd[i] += turn;
      surf.deposit(HOME, x, z, dt * 0.25);
      if (stagger) {
        const p = veg.findPlant(x, z, exploring ? 4.5 : 2.6, col.reject, sim.rng);
        if (p) { this.target[i] = p.id; this.phase[i] = P.APPROACH; }
      }
      if (this.timer[i] > (exploring ? 160 : 100)) this.phase[i] = isPlayer ? P.RETURN : P.HOME;
      this.moveSurf(i, sp, dt);
      return;
    }
    if (ph === P.APPROACH) {
      const p = veg.plants[this.target[i]];
      if (!p || !p.alive || p.biomass < 2) { this.phase[i] = P.SEARCH; this.timer[i] *= 0.5; return; }
      this.steer(i, p.x, p.z, 7, dt);
      this.moveSurf(i, sp, dt);
      if (Math.hypot(p.x - this.x[i], p.z - this.y[i]) < p.r * 0.85) {
        this.phase[i] = P.CUT;
        const S = SPECIES[p.sp];
        this.timer[i] = (S.cut * 5) / Math.sqrt(this.size[i]) * (S.kind === 'tree' ? 1.6 : 1) * (0.8 + Math.random() * 0.4);
        if (this.caste[i] === CASTE.MINIM && isPlayer && this.tryHitchhike(i)) return;
      }
      return;
    }
    if (ph === P.CUT) {
      const p = veg.plants[this.target[i]];
      this.spd[i] = 0;
      this.anim[i] += dt * 30;
      this.timer[i] -= dt;
      if (!p || !p.alive || p.biomass < 1) { this.phase[i] = P.SEARCH; return; }
      if (this.timer[i] <= 0) {
        const amt = Math.min(p.biomass, (0.25 + 0.45 * this.size[i]) * (col.genome ? col.genome.forage : 1));
        p.biomass -= amt;
        p.lastCut = sim.time;
        this.carry[i] = CARRY.LEAF; this.carryAmt[i] = amt; this.carrySp[i] = p.sp;
        if (exploring) this.recruit[i] = 1;
        this.phase[i] = isPlayer ? P.RETURN : P.HOME;
      }
      return;
    }
    if (ph === P.RETURN) {
      this.homeOf(i);
      const hx = this._hx, hz = this._hz;
      // path integration toward the nest, refined by the home trail
      this.steer(i, hx, hz, 4.5, dt);
      const m = this.sense(i, HOME);
      if (m > 0.3) this.hd[i] += this._turn * 0.8 * dt;
      this.hd[i] += (Math.random() - 0.5) * dt * 1.5;
      if (this.carry[i] === CARRY.LEAF) {
        const q = SPECIES[this.carrySp[i]].quality * (1 - col.reject[this.carrySp[i]]);
        surf.deposit(FOOD, x, z, dt * 6 * q * (this.recruit[i] ? 2.2 : 1) * Math.min(1, this.carryAmt[i] / 0.7));
      }
      this.moveSurf(i, sp, dt);
      if (Math.hypot(hx - this.x[i], hz - this.y[i]) < 0.7) this.arrive(i);
      return;
    }
    if (ph === P.D_DUMP) {
      this.steer(i, this.tx[i], this.ty[i], 6, dt);
      this.moveSurf(i, sp, dt);
      if (Math.hypot(this.tx[i] - this.x[i], this.ty[i] - this.y[i]) < 0.35) {
        surf.addMound(this.x[i], this.y[i], 0.01);
        sim.colony.stats.soilOut++;
        this.carry[i] = 0;
        this.phase[i] = P.HOME;
        this.exp[i * NTASK + TASK.DIG] = Math.min(1, this.exp[i * NTASK + TASK.DIG] + 0.03);
      }
      return;
    }
    if (ph === P.W_DUMPOUT) {
      const d = sim.colony.dump;
      this.steer(i, d.x, d.z, 6, dt);
      this.moveSurf(i, sp, dt);
      if (Math.hypot(d.x - this.x[i], d.z - this.y[i]) < 0.9) {
        d.amount += this.carryAmt[i];
        sim.colony.stats.refuseOut += this.carryAmt[i];
        this.carry[i] = 0;
        this.phase[i] = P.HOME;
      }
      return;
    }
    // anything else on the surface: go home
    this.phase[i] = P.HOME;
  }

  tryHitchhike(i) {
    let found = -1;
    const x = this.x[i], z = this.y[i];
    this.forNear(x, z, 1.2, (j) => {
      if (j === i || this.colony[j] !== 0 || this.rider[j] >= 0 || this.size[j] < 0.9) return;
      if (this.carry[j] === CARRY.LEAF && Math.hypot(this.x[j] - x, this.y[j] - z) < 1.2) { found = j; return true; }
    });
    if (found < 0) return false;
    this.ridingOn[i] = found;
    this.rider[found] = i;
    this.phase[i] = P.RIDE;
    return true;
  }

  updateDefender(i, dt, sp, isPlayer) {
    const sim = this.sim, surf = sim.surface;
    const x = this.x[i], z = this.y[i];
    this.timer[i] += dt;
    const stagger = ((i + this.tick) & 1) === 0;
    // predators first
    const pred = sim.predators.nearest(x, z, 9);
    if (pred) {
      this.steer(i, pred.x, pred.z, 9, dt);
      this.moveSurf(i, sp * 1.15, dt);
      if (Math.hypot(pred.x - this.x[i], pred.z - this.y[i]) < pred.reach + 0.3) {
        pred.hp -= dt * 0.22 * this.size[i] * (this.caste[i] === CASTE.SOLDIER ? 1.6 : 1);
        pred.harassed = 1;
        this.fightT[i] = 0.25;
        surf.deposit(F.ALARM, x, z, 0.5);
      }
      this.timer[i] = Math.min(this.timer[i], 20);
      return;
    }
    if (stagger) {
      let best = -1, bd = 3.5 * 3.5;
      const c = this.colony[i];
      this.forNear(x, z, 3.5, (j) => {
        if (this.colony[j] === c || this.ridingOn[j] >= 0) return;
        const d = (this.x[j] - x) ** 2 + (this.y[j] - z) ** 2;
        if (d < bd) { bd = d; best = j; }
      });
      this.target[i] = best;
    }
    const t = this.target[i];
    if (t >= 0 && this.alive[t] && this.layer[t] === LAYER.SURFACE) {
      this.steer(i, this.x[t], this.y[t], 9, dt);
      this.moveSurf(i, sp * 1.1, dt);
      this.timer[i] = Math.min(this.timer[i], 20);
      return;
    }
    const m = this.sense(i, F.ALARM);
    if (m > 0.08) { this.hd[i] += this._turn * 4 * dt; this.timer[i] = Math.min(this.timer[i], 25); }
    else {
      this.homeOf(i);
      const r = Math.hypot(x - this._hx, z - this._hz);
      const patrolR = isPlayer ? 14 : 18;
      if (r > patrolR) this.steer(i, this._hx, this._hz, 3, dt);
      this.hd[i] += (Math.random() - 0.5) * 4 * dt;
    }
    this.moveSurf(i, sp * 0.8, dt);
    if (this.timer[i] > 50) { this.phase[i] = P.HOME; this.task[i] = isPlayer ? TASK.DEFEND : TASK.FORAGE; if (!isPlayer) this.phase[i] = P.HOME; }
    if (this.timer[i] > 50 && isPlayer) { this.phase[i] = P.HOME; this.task[i] = TASK.REST; }
  }

  arrive(i) {
    const sim = this.sim;
    const c = this.colony[i];
    if (c !== 0) {
      const r = sim.colonies[c];
      if (this.carry[i] === CARRY.LEAF) r.receiveLeaf(this.carryAmt[i]);
      this.kill(i, 'home');
      return;
    }
    if (!this.enterNest(i)) { this.hd[i] += Math.PI; this.phase[i] = P.HOME; return; }
    if (this.carry[i] === CARRY.LEAF) {
      if (sim.nest.has[TGT.STORE]) { this.phase[i] = P.STORE; return; }
      sim.colony.receiveLeaf(this.carryAmt[i], this.carrySp[i]);
      this.carry[i] = 0;
      if (this.task[i] === TASK.EXPLORE && Math.random() < 0.5) this.task[i] = TASK.FORAGE;
      this.persist(i);
      return;
    }
    if (this.task[i] === TASK.FORAGE || this.task[i] === TASK.EXPLORE) { this.persist(i); return; }
    if (this.task[i] === TASK.DIG && this.phase[i] === P.HOME) { this.persist(i); return; }
    if (this.task[i] === TASK.WASTE) { this.persist(i); return; }
    this.phase[i] = START[this.task[i]];
    this.wp[i] = -1;
  }

  // ---------- nest behaviour ----------
  updateNest(i, dt) {
    const sim = this.sim, nest = sim.nest, col = sim.colony;
    const sp = this.baseSpeed(i) * 0.8;
    const ph = this.phase[i];
    const task = this.task[i];
    let r;

    switch (ph) {
      // --- foraging / exploring: leave the nest ---
      case P.EXIT:
        if (col.surfaceActivity < 0.2 && Math.random() < dt * 0.2) { this.decide(i); return; }
        r = this.navNest(i, TGT.EXIT, dt, sp);
        if (r === 1) { this.emerge(i); this.phase[i] = task === TASK.DEFEND ? P.F_PATROL : P.SEARCH; }
        else if (r === -1) this.decide(i);
        return;
      case P.STORE:
        r = this.navNest(i, TGT.STORE, dt, sp);
        if (r !== 0) {
          col.receiveLeaf(this.carryAmt[i], this.carrySp[i]);
          this.carry[i] = 0;
          this.persist(i);
        }
        return;

      // --- gardening ---
      case P.G_START:
        if (!nest.has[TGT.GARDEN]) { this.task[i] = TASK.REST; this.phase[i] = P.R_GO; return; }
        this.phase[i] = col.leafCache > 0.3 ? P.G_TOCACHE : P.G_TOGARDEN;
        return;
      case P.G_TOCACHE:
        r = this.navNest(i, nest.has[TGT.STORE] ? TGT.STORE : TGT.EXIT, dt, sp);
        if (r === 1 || r === -1) {
          const leaf = r === 1 ? col.takeLeaf(0.2 + 0.3 * this.size[i]) : null;
          if (leaf) { this.carry[i] = CARRY.LEAF; this.carryAmt[i] = leaf.amt; this.carrySp[i] = leaf.sp; this.phase[i] = P.G_CARRY; }
          else this.phase[i] = P.G_TOGARDEN;
          this.wp[i] = -1;
        }
        return;
      case P.G_CARRY:
        r = this.navNest(i, TGT.GARDEN, dt, sp);
        if (r === 1) { this.phase[i] = P.G_PROCESS; this.timer[i] = 3 + Math.random() * 3; }
        else if (r === -1) { col.receiveLeaf(this.carryAmt[i], this.carrySp[i]); this.carry[i] = 0; this.decide(i); }
        return;
      case P.G_PROCESS: {
        this.wanderNest(i, dt, ZONE.GARDEN, sp);
        this.anim[i] += dt * 10;
        this.timer[i] -= dt;
        if (this.timer[i] <= 0) {
          const c = nest.cellAt(this.x[i], this.y[i]);
          if (c >= 0) {
            nest.addSubstrate(c, this.carryAmt[i], SPECIES[this.carrySp[i]].toxin);
            col.onSubstrate(this.carrySp[i], this.carryAmt[i]);
          }
          this.carry[i] = 0;
          this.persist(i);
        }
        return;
      }
      case P.G_TOGARDEN:
        r = this.navNest(i, TGT.GARDEN, dt, sp);
        if (r === 1) { this.phase[i] = P.G_GROOM; this.timer[i] = 8 + Math.random() * 8; }
        else if (r === -1) this.decide(i);
        return;
      case P.G_GROOM: {
        this.wanderNest(i, dt, ZONE.GARDEN, sp);
        this.anim[i] += dt * 6;
        const c = nest.cellAt(this.x[i], this.y[i]);
        if (c >= 0) nest.groom(c, dt * 0.12 * (this.caste[i] === CASTE.MINIM ? 1.5 : 1) * col.genome.disease, col.fungusTotal > 3);
        this.timer[i] -= dt;
        if (this.timer[i] <= 0) this.persist(i);
        return;
      }

      // --- nursing ---
      case P.N_START:
        this.phase[i] = col.broodAtQueen() && nest.has[TGT.NURSERY] ? P.N_TOQUEEN : P.N_TONURSERY;
        return;
      case P.N_TOQUEEN:
        r = this.navNest(i, TGT.QUEEN, dt, sp);
        if (r === 1) {
          const b = col.pickBroodAtQueen(i);
          if (b) { this.carry[i] = CARRY.BROOD; this.carryAmt[i] = b.st; this.phase[i] = P.N_CARRY; }
          else this.phase[i] = P.N_TONURSERY;
          this.wp[i] = -1;
        } else if (r === -1) this.phase[i] = P.N_TONURSERY;
        return;
      case P.N_CARRY:
        r = this.navNest(i, TGT.NURSERY, dt, sp);
        if (r === 1) {
          col.placeBrood(i, nest.cellAt(this.x[i], this.y[i]));
          this.carry[i] = 0;
          this.phase[i] = P.N_TEND; this.timer[i] = 6 + Math.random() * 6;
        } else if (r === -1) { col.dropBrood(i); this.carry[i] = 0; this.decide(i); }
        return;
      case P.N_TONURSERY:
        r = this.navNest(i, nest.has[TGT.NURSERY] ? TGT.NURSERY : TGT.QUEEN, dt, sp);
        if (r === 1) { this.phase[i] = P.N_TEND; this.timer[i] = 10 + Math.random() * 10; }
        else if (r === -1) this.decide(i);
        return;
      case P.N_TEND:
        this.wanderNest(i, dt, nest.has[TGT.NURSERY] ? ZONE.NURSERY : ZONE.QUEEN, sp);
        this.anim[i] += dt * 5;
        this.timer[i] -= dt;
        if (this.timer[i] <= 0) this.persist(i);
        return;

      // --- excavation ---
      case P.D_GO: {
        r = this.navNest(i, TGT.DIG, dt, sp);
        if (r === -1) { this.decide(i); return; }
        if (r === 1) {
          const c = nest.cellAt(this.x[i], this.y[i]);
          const cand = [c - 1, c + 1, c - NW, c + NW];
          let m = -1;
          for (const k of cand) if (k >= 0 && k < nest.N && nest.solid[k] === 1 && nest.mark[k]) { m = k; break; }
          if (m < 0) { this.timer[i] += dt; if (this.timer[i] > 3) this.decide(i); return; }
          this.target[i] = m; this.phase[i] = P.D_DIG;
          this.hd[i] = Math.atan2(nest.wy((m / NW) | 0) - this.y[i], nest.wx(m % NW) - this.x[i]);
        }
        return;
      }
      case P.D_DIG: {
        const m = this.target[i];
        if (m < 0 || nest.solid[m] !== 1 || !nest.mark[m]) { this.phase[i] = P.D_GO; this.wp[i] = -1; return; }
        this.spd[i] = 0;
        this.anim[i] += dt * 25;
        nest.dig[m] += dt * Math.pow(this.size[i], 0.7) * 0.6;
        if (nest.dig[m] >= nest.hard[m] * 3) {
          nest.finishDig(m);
          this.carry[i] = CARRY.SOIL; this.carryAmt[i] = 1;
          this.phase[i] = P.D_HAUL; this.wp[i] = -1;
        }
        return;
      }
      case P.D_HAUL:
        r = this.navNest(i, TGT.EXIT, dt, sp);
        if (r === 1) {
          this.emerge(i);
          const a = Math.random() * Math.PI * 2, d = 1.2 + Math.random() * 2.8;
          this.tx[i] = this.x[i] + Math.cos(a) * d; this.ty[i] = Math.sin(a) * d;
          this.phase[i] = P.D_DUMP;
        } else if (r === -1) {
          // nowhere to take it: drop it back into the nearest dig mark area
          this.carry[i] = 0; this.decide(i);
        }
        return;

      // --- waste management ---
      case P.W_GO:
        r = this.navNest(i, TGT.GARDEN, dt, sp);
        if (r === 1) { this.phase[i] = P.W_SEARCH; this.timer[i] = 2; }
        else if (r === -1) this.decide(i);
        return;
      case P.W_SEARCH: {
        const c = nest.cellAt(this.x[i], this.y[i]);
        const a = c >= 0 ? nest.takeRefuse(c, 0.6 + 0.2 * this.size[i]) : 0;
        if (a > 0) { this.carry[i] = CARRY.WASTE; this.carryAmt[i] = a; this.phase[i] = P.W_HAUL; this.wp[i] = -1; return; }
        this.wanderNest(i, dt, ZONE.GARDEN, sp);
        this.timer[i] -= dt;
        if (this.timer[i] <= 0) this.decide(i);
        return;
      }
      case P.W_HAUL:
        if (nest.has[TGT.WASTE]) {
          r = this.navNest(i, TGT.WASTE, dt, sp);
          if (r === 1) { this.phase[i] = P.W_DROP; this.timer[i] = 1 + Math.random(); }
          else if (r === -1) { this.phase[i] = P.W_DUMPOUT; }
        } else {
          r = this.navNest(i, TGT.EXIT, dt, sp);
          if (r === 1) { this.emerge(i); this.phase[i] = P.W_DUMPOUT; }
          else if (r === -1) { this.carry[i] = 0; this.decide(i); }
        }
        return;
      case P.W_DROP: {
        this.wanderNest(i, dt, ZONE.WASTE, sp);
        this.timer[i] -= dt;
        if (this.timer[i] <= 0) {
          const c = nest.cellAt(this.x[i], this.y[i]);
          if (c >= 0) nest.dropWaste(c, this.carryAmt[i]);
          this.carry[i] = 0;
          this.persist(i);
        }
        return;
      }
      case P.W_DUMPOUT:
        // external dumping is reached through the exit
        r = this.navNest(i, TGT.EXIT, dt, sp);
        if (r === 1) this.emerge(i);
        else if (r === -1) { this.carry[i] = 0; this.decide(i); }
        return;

      // --- defence ---
      case P.F_START:
        if (col.threat > 0.25 && nest.entrances.length) this.phase[i] = P.F_EXIT;
        else { this.phase[i] = P.F_NEST; this.timer[i] = 15 + Math.random() * 15; }
        return;
      case P.F_EXIT:
      case P.F_PATROL:
        r = this.navNest(i, TGT.EXIT, dt, sp);
        if (r === 1) { this.emerge(i); this.phase[i] = P.F_PATROL; this.timer[i] = 0; }
        else if (r === -1) { this.phase[i] = P.F_NEST; this.timer[i] = 15; }
        return;
      case P.F_NEST:
        this.wanderNest(i, dt, -1, sp * 1.4);
        this.timer[i] -= dt;
        if (this.timer[i] <= 0) this.persist(i);
        return;

      // --- resting ---
      case P.R_GO:
        r = this.navNest(i, TGT.CHAMBER, dt, sp);
        if (r !== 0) { this.phase[i] = P.R_REST; this.timer[i] = 15 + Math.random() * 25 * (this.caste[i] >= CASTE.MAJOR ? 2 : 1); }
        return;
      case P.R_REST:
        this.wanderNest(i, dt, -1, sp * 0.4);
        this.energy[i] = Math.min(1, this.energy[i] + dt * 0.025);
        this.timer[i] -= dt;
        if (this.timer[i] <= 0 && this.caste[i] < CASTE.GYNE) this.decide(i);
        else if (this.timer[i] <= 0) this.timer[i] = 20;
        return;
      case P.HOME:
        this.phase[i] = START[task];
        return;
      default:
        this.decide(i);
    }
  }

  // ---------- census (1 Hz) ----------
  census() {
    const sim = this.sim, nest = sim.nest;
    const col = sim.colony;
    const cnt = col.counts;
    cnt.byCaste.fill(0); cnt.byTask.fill(0);
    cnt.individuals = 0; cnt.workersInd = 0; cnt.sumSize = 0; cnt.nursing = 0; cnt.surface = 0; cnt.alatesInd = 0;
    for (const ch of nest.chambers) ch.ants = 0;
    for (const r of sim.rivals) r.surfaceCount = 0;
    const surfCounts = new Float32Array(NTASK);
    for (let i = 0; i < this.count; i++) {
      if (!this.alive[i]) continue;
      const c = this.colony[i];
      if (c !== 0) { const r = sim.colonies[c]; if (r) r.surfaceCount++; continue; }
      cnt.individuals++;
      cnt.byCaste[this.caste[i]]++;
      if (this.caste[i] >= CASTE.GYNE) { cnt.alatesInd++; continue; }
      cnt.workersInd++;
      cnt.sumSize += this.size[i];
      cnt.byTask[this.task[i]]++;
      if (this.phase[i] === P.N_TEND) cnt.nursing++;
      if (this.layer[i] === LAYER.SURFACE) { cnt.surface++; surfCounts[this.task[i]]++; }
      else {
        const cell = nest.cellAt(this.x[i], this.y[i]);
        if (cell >= 0) { const ch = nest.chamberOf[cell]; if (ch >= 0) nest.chambers[ch].ants++; }
      }
    }
    cnt.surfaceByTask = surfCounts;
    this.version++;
  }
}
