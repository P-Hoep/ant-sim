import { HALF, LAYER, CARRY, CASTE } from './constants.js';
import { F } from './surface.js';

export const PRED_TYPES = {
  spider: { name: 'Wolf spider', hp: 4, speed: 2.4, reach: 0.9, mode: 'ambush', eatCd: 7, sat: 6, when: 'any', max: 3, base: 0.02 },
  lizard: { name: 'Anole lizard', hp: 14, speed: 3.6, reach: 0.8, mode: 'wander', eatCd: 2.2, sat: 18, when: 'day', max: 1, base: 0.01 },
  toad: { name: 'Cane toad', hp: 18, speed: 1.3, reach: 1.4, mode: 'ambush', eatCd: 2, sat: 30, when: 'night', max: 1, base: 0.015 },
  bird: { name: 'Antbird', hp: 9, speed: 5, reach: 1.0, mode: 'bird', eatCd: 1.6, sat: 16, when: 'day', max: 1, base: 0.006 },
  phorid: { name: 'Phorid fly', hp: 0.6, speed: 3.2, reach: 0.5, mode: 'hover', eatCd: 2, sat: 4, when: 'day', max: 3, base: 0.03 },
};

export class Predators {
  constructor(sim) {
    this.sim = sim;
    this.list = [];
    this.nextId = 1;
    this.acc = 0;
    this.killed = 0;
    this.eaten = 0;
  }

  spawn(type, x, z) {
    const T = PRED_TYPES[type], rng = this.sim.rng;
    if (x === undefined) {
      const a = rng.range(0, Math.PI * 2), r = rng.range(15, 45);
      x = Math.cos(a) * r; z = Math.sin(a) * r;
      if (this.sim.surface.isWater(x, z)) x -= 10;
    }
    const p = {
      id: this.nextId++, type, name: T.name, x, z, y: type === 'bird' ? 12 : type === 'phorid' ? 0.8 : 0, hd: rng.range(0, 6.28),
      hp: T.hp, maxHp: T.hp, reach: T.reach, state: type === 'bird' ? 'arrive' : 'move', timer: 0, cd: 0,
      eaten: 0, target: -1, harassed: 0, anim: 0, tx: x, tz: z, alive: true, successes: 0,
    };
    if (type === 'bird') { p.tx = x; p.tz = z; p.x = x + 50; p.z = z + 30; }
    this.list.push(p);
    this.pickSpot(p);
    return p;
  }

  nearest(x, z, r) {
    let best = null, bd = r * r;
    for (const p of this.list) {
      if (!p.alive || p.y > 2 || p.type === 'phorid') continue;
      const d = (p.x - x) ** 2 + (p.z - z) ** 2;
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  // Ambush predators pick spots on busy trails.
  pickSpot(p) {
    const sim = this.sim, rng = sim.rng, surf = sim.surface;
    let bx = p.x, bz = p.z, best = -1;
    for (let k = 0; k < 24; k++) {
      const x = rng.range(-HALF + 4, HALF - 4), z = rng.range(-HALF + 4, HALF - 4);
      if (surf.isWater(x, z)) continue;
      if (p.type === 'toad' && Math.hypot(x, z) > 12) continue;
      const v = surf.sample(F.TRAFFIC, x, z) + surf.sample(F.FOOD0, x, z) + rng.next() * 0.2;
      if (v > best) { best = v; bx = x; bz = z; }
    }
    p.tx = bx; p.tz = bz;
  }

  onFlight() {
    this.spawn('bird', 6, 4);
    this.spawn('bird', -5, -6);
    this.spawn('lizard', 10, 10);
  }

  step(dt) {
    const sim = this.sim, env = sim.env, rng = sim.rng;
    this.acc += dt;
    if (this.acc >= 5) {
      const sp = env.season(), night = env.isNight();
      for (const type in PRED_TYPES) {
        const T = PRED_TYPES[type];
        if (T.when === 'day' && night) continue;
        if (T.when === 'night' && !night) continue;
        if (env.rain > 0.5 && type !== 'toad') continue;
        const n = this.list.filter((p) => p.type === type).length;
        if (n < T.max && rng.chance(T.base * sp.predators * this.acc * (sim.godPredators || 1))) this.spawn(type);
      }
      this.acc = 0;
    }
    for (const p of this.list) this.update(p, dt);
    this.list = this.list.filter((p) => p.alive);
  }

  preyNear(p, r, filter) {
    const ants = this.sim.ants;
    let best = -1, bd = r * r;
    ants.forNear(p.x, p.z, r, (j) => {
      if (ants.layer[j] !== LAYER.SURFACE || ants.ridingOn[j] >= 0) return;
      if (filter && !filter(j)) return;
      const d = (ants.x[j] - p.x) ** 2 + (ants.y[j] - p.z) ** 2;
      if (d < bd) { bd = d; best = j; }
    });
    return best;
  }

  strike(p, j) {
    const sim = this.sim, ants = sim.ants;
    const s = ants.size[j];
    const pKill = 0.85 / (1 + 0.5 * (s - 1) * (s - 1) * (s > 1 ? 1 : 0)) * (ants.caste[j] === CASTE.SOLDIER ? 0.4 : 1);
    sim.surface.deposit(F.ALARM, ants.x[j], ants.y[j], 3);
    if (sim.rng.chance(pKill)) {
      ants.kill(j, 'predator');
      p.eaten++;
      this.eaten++;
    } else {
      ants.health[j] -= 0.3;
      ants.injury[j] += 0.3;
      p.hp -= 0.3 * s; // a major's mandibles bite back
    }
    p.cd = PRED_TYPES[p.type].eatCd;
  }

  leave(p) {
    p.state = 'leave';
    const a = Math.atan2(p.z, p.x);
    p.tx = Math.cos(a) * 80; p.tz = Math.sin(a) * 80;
  }

  update(p, dt) {
    const sim = this.sim, T = PRED_TYPES[p.type], rng = sim.rng;
    p.cd -= dt;
    p.timer += dt;
    p.anim += dt;
    p.harassed = Math.max(0, p.harassed - dt);
    if (p.hp <= 0) {
      p.alive = false;
      this.killed++;
      sim.alerts.push('predKilled' + p.id, `${p.name.toUpperCase()} KILLED BY DEFENDERS`, 'good', { layer: 0, x: p.x, z: p.z }, 'defense', 5);
      sim.events.push({ type: 'predDead', x: p.x, z: p.z });
      return;
    }
    if (p.state !== 'leave' && (p.hp < p.maxHp * 0.4 || p.eaten >= T.sat || p.timer > 260)) this.leave(p);

    const moveTo = (tx, tz, sp) => {
      const dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz);
      if (d < 0.05) return true;
      const want = Math.atan2(dz, dx);
      let dd = want - p.hd; dd = Math.atan2(Math.sin(dd), Math.cos(dd));
      p.hd += Math.max(-4 * dt, Math.min(4 * dt, dd));
      const step = Math.min(d, sp * dt);
      const nx = p.x + Math.cos(p.hd) * step, nz = p.z + Math.sin(p.hd) * step;
      if (p.y < 1 && sim.surface.isWater(nx, nz) && p.type !== 'toad') { p.hd += 1.5; return false; }
      p.x = nx; p.z = nz;
      p.moving = sp;
      return d < 0.3;
    };
    p.moving = 0;

    if (p.state === 'leave') {
      if (p.type === 'bird' || p.type === 'phorid') p.y += dt * 4;
      moveTo(p.tx, p.tz, T.speed * 1.3);
      if (Math.abs(p.x) > HALF + 4 || Math.abs(p.z) > HALF + 4 || p.y > 30) p.alive = false;
      return;
    }

    if (T.mode === 'ambush') {
      if (p.state === 'move') {
        if (moveTo(p.tx, p.tz, T.speed)) { p.state = 'sit'; p.sitTime = 0; }
        return;
      }
      p.sitTime = (p.sitTime || 0) + dt;
      if (p.cd <= 0) {
        const j = this.preyNear(p, T.reach);
        if (j >= 0) { this.strike(p, j); p.hd = Math.atan2(sim.ants.y[j] - p.z, sim.ants.x[j] - p.x); }
      }
      if (p.sitTime > 90 || (p.harassed && rng.chance(dt * 0.3))) { this.pickSpot(p); p.state = 'move'; }
      return;
    }

    if (T.mode === 'wander' || (T.mode === 'bird' && p.state === 'hunt')) {
      const j = this.preyNear(p, 3.5);
      if (j >= 0) {
        const ants = sim.ants;
        moveTo(ants.x[j], ants.y[j], T.speed * 1.2);
        if (p.cd <= 0 && Math.hypot(ants.x[j] - p.x, ants.y[j] - p.z) < T.reach) this.strike(p, j);
      } else {
        if (moveTo(p.tx, p.tz, T.speed * 0.6)) this.pickSpot(p);
      }
      if (p.type === 'bird') {
        p.hop = (p.hop || 0) + dt;
        p.y = Math.max(0, Math.sin(p.hop * 8) * 0.15);
        if (p.timer > 45) { p.state = 'leave'; p.tx = p.x + 60; p.tz = p.z + 40; }
      }
      return;
    }

    if (T.mode === 'bird') { // arriving
      p.y = Math.max(0, p.y - dt * 3);
      moveTo(p.tx, p.tz, T.speed * 2);
      if (p.y <= 0.01) { p.state = 'hunt'; p.timer = 0; }
      return;
    }

    if (T.mode === 'hover') {
      const ants = sim.ants;
      let t = p.target;
      if (t < 0 || !ants.alive[t] || ants.carry[t] !== CARRY.LEAF || ants.layer[t] !== LAYER.SURFACE) {
        t = this.preyNear(p, 12, (j) => ants.carry[j] === CARRY.LEAF && ants.size[j] > 0.85 && ants.size[j] < 1.9 && ants.colony[j] === 0);
        p.target = t;
      }
      p.y = 0.9 + Math.sin(p.anim * 3) * 0.15;
      if (t < 0) { if (moveTo(p.tx, p.tz, T.speed)) this.pickSpot(p); return; }
      moveTo(ants.x[t], ants.y[t], T.speed);
      if (p.cd <= 0 && Math.hypot(ants.x[t] - p.x, ants.y[t] - p.z) < 0.6) {
        p.cd = T.eatCd;
        const guarded = ants.rider[t] >= 0;
        if (rng.chance(guarded ? 0.02 : 0.12)) {
          ants.parasite[t] = 1;
          p.eaten++;
          p.successes++;
          p.target = -1;
          this.pickSpot(p);
        }
        ants.fightT[t] = 0.6; // defensive freeze
      }
    }
  }
}
