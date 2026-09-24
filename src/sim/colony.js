import { DAY_LEN, TASK, NTASK, CASTE, LAYER, ZONE, NW, sizeToCaste, clamp, PRIORITY_TASK } from './constants.js';
import { TGT } from './nest.js';
import { SPECIES } from './vegetation.js';
import { F } from './surface.js';

export const EGG_T = 0.6 * DAY_LEN;
export const LARVA_T = 1.3 * DAY_LEN;
export const PUPA_T = 0.7 * DAY_LEN;
const LARVA_NEED = 0.45 / LARVA_T; // food per second a growing larva can absorb

export const LIFESPAN = [12, 16, 20, 24, 30, 10]; // days by caste (compressed — see knowledge "time")

export function defaultGenome() {
  return { size: 1, growth: 1, fungus: 1, disease: 1, aggression: 1, forage: 1, heat: 1, repro: 1 };
}
export function mutateGenome(g, rng) {
  const o = {};
  for (const k in g) o[k] = clamp(g[k] * (1 + rng.gauss() * 0.07), 0.6, 1.6);
  return o;
}

export class Colony {
  constructor(sim, genome) {
    this.sim = sim;
    this.id = 0;
    this.isPlayer = true;
    this.alive = true;
    this.species = 'Atta cephalotes';
    this.genome = genome || defaultGenome();
    this.priorities = { forage: 0.5, dig: 0.5, nurse: 0.5, garden: 0.5, defend: 0.4, waste: 0.5, explore: 0.35 };
    this.food = 10;
    this.leafCache = 0;
    this.cacheSp = new Float32Array(SPECIES.length);
    this.brood = [];
    this.queen = { alive: true, health: 1, age: 2.5 * 365, reserve: 0, cell: -1, x: 0, y: -10, eggAcc: 0, eggRate: 0 };
    this.virtual = [0, 0, 0, 0];
    this.virtualAlates = { gynes: 0, males: 0 };
    this.counts = { byCaste: new Float32Array(6), byTask: new Float32Array(NTASK), individuals: 0, workersInd: 0, sumSize: 0, nursing: 0, surface: 0, alatesInd: 0 };
    this.needs = new Float32Array(NTASK);
    this.stim = new Float32Array(NTASK);
    this.reject = new Float32Array(SPECIES.length);
    this.rejectAnnounced = new Uint8Array(SPECIES.length);
    this.stats = { leavesIn: 0, soilOut: 0, deaths: 0, born: 0, flights: 0, launchedQueens: 0, launchedMales: 0, daughterQueens: 0, refuseOut: 0 };
    this.leafWindow = 0;
    this.leafRatePerForager = 0.004;
    this.history = { pop: [], food: [], fungus: [], brood: [], leaves: [] };
    this.autonomy = true;
    this.autoCd = 8;
    this.dump = { x: 8, z: 7, amount: 0 };
    this.threat = 0;
    this.rivalNear = 0;
    this.flight = null;
    this.flightRequested = false;
    this.virtualNurse = 0;
    this.fungusTotal = 0;
    this.acc = { needs: 0, hist: 0, virt: 0, flight: 0 };
    this.stage = 0;
    this.carriedBrood = new Map();
  }

  get workers() { return this.counts.workersInd + this.virtual[0] + this.virtual[1] + this.virtual[2] + this.virtual[3]; }
  get alatesTotal() { return this.counts.alatesInd + this.virtualAlates.gynes + this.virtualAlates.males; }
  get foodCap() { return 10 + this.workers * 0.03; }
  get foodFrac() { return clamp(this.food / this.foodCap, 0, 1); }

  // ---- leaves ----
  receiveLeaf(amt, sp) {
    this.leafCache += amt;
    this.cacheSp[sp] += amt;
    this.stats.leavesIn += amt;
    this.leafWindow += amt;
  }
  takeLeaf(maxAmt) {
    if (this.leafCache < 0.05) return null;
    let r = this.sim.rng.next() * this.leafCache, sp = 0;
    for (; sp < SPECIES.length - 1; sp++) { r -= this.cacheSp[sp]; if (r <= 0) break; }
    const amt = Math.min(maxAmt, this.cacheSp[sp]);
    if (amt <= 0) return null;
    this.cacheSp[sp] -= amt;
    this.leafCache = Math.max(0, this.leafCache - amt);
    return { amt, sp };
  }
  // The fungus signals when substrate harms it; the colony learns to avoid that plant
  // (delayed rejection — Ridley et al. 1996).
  onSubstrate(sp, amt) {
    const tox = SPECIES[sp].toxin;
    if (tox <= 0.1) return;
    this.reject[sp] = Math.min(0.97, this.reject[sp] + amt * tox * 0.03);
    if (this.reject[sp] > 0.5 && !this.rejectAnnounced[sp]) {
      this.rejectAnnounced[sp] = 1;
      this.sim.alerts.push('reject', `COLONY NOW REJECTING ${SPECIES[sp].name.toUpperCase()}`, 'info', null, 'rejection');
    }
  }

  // ---- brood ----
  queenCell() {
    const n = this.sim.nest;
    if (this.queen.cell >= 0 && n.zone[this.queen.cell] === ZONE.QUEEN && !n.solid[this.queen.cell]) return this.queen.cell;
    const ch = n.chambers.find((c) => c.zone === ZONE.QUEEN);
    if (!ch) return this.queen.cell;
    let best = ch.cells[0], bd = 1e9;
    for (const c of ch.cells) {
      const d = Math.abs((c % NW) - ch.cx) + Math.abs(((c / NW) | 0) - ch.cy);
      if (d < bd) { bd = d; best = c; }
    }
    this.queen.cell = best;
    return best;
  }
  broodAtQueen() {
    for (const b of this.brood) if (b.loc === 0) return true;
    return false;
  }
  pickBroodAtQueen(antIdx) {
    for (const b of this.brood) if (b.loc === 0) { b.loc = 2; this.carriedBrood.set(antIdx, b); return b; }
    return null;
  }
  placeBrood(antIdx, cell) {
    const b = this.carriedBrood.get(antIdx);
    if (!b) return;
    this.carriedBrood.delete(antIdx);
    b.loc = 1;
    b.cell = this.sim.nest.zone[cell] === ZONE.NURSERY ? cell : this.sim.nest.randomCellOfZone(ZONE.NURSERY);
  }
  dropBrood(antIdx) {
    const b = this.carriedBrood.get(antIdx);
    if (b) { b.loc = 0; b.cell = this.queenCell(); this.carriedBrood.delete(antIdx); }
  }
  broodCapacity() {
    let n = 20;
    for (const ch of this.sim.nest.chambers) {
      if (ch.zone === ZONE.NURSERY) n += ch.cells.length * 6;
      else if (ch.zone === ZONE.QUEEN) n += ch.cells.length * 3;
    }
    return n;
  }

  maxWorkerSize() {
    const w = this.workers;
    return (w < 30 ? 1.0 : w < 200 ? 1.5 : w < 1500 ? 2.3 : 3.0) * this.genome.size;
  }

  step(dt) {
    const sim = this.sim, nest = sim.nest, env = sim.env, rng = sim.rng;
    const q = this.queen;

    // --- queen ---
    if (q.alive) {
      const qc = this.queenCell();
      if (qc >= 0) { q.x = nest.wx(qc % NW); q.y = nest.wy((qc / NW) | 0); }
      q.age += dt / DAY_LEN;
      let fed = false;
      if (this.food > 0.01) { this.food -= 0.0015 * dt; fed = true; }
      else if (q.reserve > 0) { q.reserve -= 0.0015 * dt; fed = true; }
      if (!fed) q.health -= 0.002 * dt;
      if (qc >= 0) {
        if (nest.water[qc] > 0.5) q.health -= 0.004 * dt;
        const T = nest.temp[qc];
        if (T > 34 || T < 14) q.health -= 0.002 * dt;
      }
      if (fed) q.health = Math.min(1, q.health + 0.0006 * dt);
      if (q.health <= 0) {
        q.alive = false; q.health = 0;
        sim.alerts.push('queen', 'THE QUEEN HAS DIED', 'critical', { layer: 1, x: q.x, y: q.y }, 'queen');
      }
      // egg laying
      const pop = this.workers;
      const founding = pop < 10;
      let rate = (founding ? 14 : Math.min(900, 10 + pop * 0.12)) * this.genome.growth;
      if (!fed) rate *= 0.1;
      rate *= 0.4 + 0.6 * q.health;
      q.eggRate = rate;
      q.eggAcc += (rate / DAY_LEN) * dt;
      const cap = this.broodCapacity();
      while (q.eggAcc >= 1) {
        q.eggAcc -= 1;
        if (this.brood.length > cap * 1.2) { this.food += 0.02; continue; } // trophic egg
        this.brood.push({ st: 0, t: 0, fed: 0, loc: 0, cell: qc, repro: 0, size: 0, seed: rng.next() });
      }
    }

    // --- brood development ---
    let larvae = 0;
    for (const b of this.brood) if (b.st === 1) larvae++;
    const nurseWork = this.counts.nursing + this.virtualNurse + (this.counts.workersInd < 5 ? 1.5 : 0);
    const feedCap = nurseWork * 0.02;
    const supply = Math.min(feedCap, larvae * LARVA_NEED, Math.max(0, this.food + q.reserve) / Math.max(dt, 1e-6));
    const per = larvae > 0 ? supply / larvae : 0;
    let usedFood = per * larvae * dt;
    if (this.food >= usedFood) this.food -= usedFood;
    else { usedFood -= this.food; this.food = 0; q.reserve = Math.max(0, q.reserve - usedFood); }

    const alive = [];
    for (const b of this.brood) {
      const c = b.cell >= 0 ? b.cell : this.queenCell();
      const T = c >= 0 ? nest.temp[c] : 25;
      const tf = Math.exp(-(((T - 26) / 5) ** 2));
      let dead = false;
      if (c >= 0 && nest.water[c] > 0.55 && rng.chance(0.01 * dt)) dead = true;
      if ((T > 33 || T < 15) && rng.chance(0.004 * dt)) dead = true;
      if (b.st === 0) {
        b.t += dt * tf;
        if (b.t >= EGG_T) { b.st = 1; b.t = 0; b.fed = 0; }
      } else if (b.st === 1) {
        b.fed += per * dt;
        const expected = (b.t / LARVA_T) * 0.45;
        b.t += dt * tf * clamp(b.fed / Math.max(0.05, expected), 0.2, 1);
        if (b.t > LARVA_T * 0.4 && b.fed < expected * 0.15 && rng.chance(0.003 * dt)) dead = true;
        if (b.t >= LARVA_T) {
          b.st = 2; b.t = 0;
          const quality = clamp(b.fed / 0.45, 0.2, 1.2);
          const reproSeason = env.seasonIdx === 3 || env.seasonIdx === 0;
          if (this.workers > 1200 && this.foodFrac > 0.45 && reproSeason && rng.chance(0.08 * this.genome.repro)) {
            b.repro = rng.chance(0.4) ? 1 : 2;
            b.size = b.repro === 1 ? 3.4 : 2.6;
          } else {
            const ms = this.maxWorkerSize();
            b.size = 0.5 + (ms - 0.5) * Math.pow(rng.next() * quality, 2.2);
          }
        }
      } else {
        b.t += dt * tf;
        if (b.t >= PUPA_T) { this.eclose(b, c); continue; }
      }
      if (dead) { if (c >= 0) nest.refuse[c] += 0.1; continue; }
      alive.push(b);
    }
    this.brood = alive;

    // --- metabolism & fungus harvest ---
    const adults = this.counts.sumSize + (this.virtual[0] * 0.65 + this.virtual[1] * 1.1 + this.virtual[2] * 1.8 + this.virtual[3] * 2.6);
    this.food -= (adults * 0.00012 + this.alatesTotal * 0.0003) * dt;
    if (this.food < 0) this.food = 0;
    const room = this.foodCap - this.food;
    if (room > 0 && nest.gardenCells.length) {
      let ft = 0;
      for (const c of nest.gardenCells) ft += nest.fungus[c];
      this.fungusTotal = ft;
      const harvest = Math.min(room, ft * 0.004 * dt);
      if (harvest > 0 && ft > 0) {
        const k = harvest / ft;
        for (const c of nest.gardenCells) nest.fungus[c] *= 1 - k;
        this.food += harvest;
      }
    } else {
      let ft = 0;
      for (const c of nest.gardenCells) ft += nest.fungus[c];
      this.fungusTotal = ft;
    }
    // founding queen manures her tiny garden from body reserves
    if (q.alive && q.reserve > 0 && this.counts.workersInd < 5) {
      for (const c of nest.gardenCells) {
        if (nest.substrate[c] < 0.4) { nest.substrate[c] += 0.004 * dt; q.reserve -= 0.001 * dt; }
        nest.contam[c] = Math.max(0, nest.contam[c] - 0.01 * dt);
      }
    }

    const a = this.acc;
    a.needs += dt; a.hist += dt; a.virt += dt; a.flight += dt;
    if (a.needs >= 1) { this.computeNeeds(a.needs); a.needs = 0; }
    if (a.virt >= 1) { this.virtualLabour(a.virt); a.virt = 0; }
    if (a.hist >= 5) { this.recordHistory(); a.hist = 0; }
    if (a.flight >= 2) { this.checkFlight(a.flight); a.flight = 0; }
    this.autoCd -= dt;
    if (this.autonomy && this.autoCd <= 0) { this.selfOrganise(); this.autoCd = 25; }
    this.updateStage();
  }

  eclose(b, cell) {
    const sim = this.sim, nest = sim.nest;
    const c = cell >= 0 ? cell : nest.nearestOpen(0, -5);
    const x = nest.wx(c % NW), y = nest.wy((c / NW) | 0);
    this.stats.born++;
    if (b.repro) {
      const caste = b.repro === 1 ? CASTE.GYNE : CASTE.MALE;
      if (sim.ants.canSpawn() && this.counts.alatesInd < 300) sim.ants.spawn(0, caste, b.size, LAYER.NEST, x, y, 0);
      else if (b.repro === 1) this.virtualAlates.gynes++; else this.virtualAlates.males++;
      return;
    }
    const caste = sizeToCaste(b.size);
    if (sim.ants.canSpawn()) sim.ants.spawn(0, caste, b.size, LAYER.NEST, x, y, 0);
    else this.virtual[caste]++;
  }

  computeNeeds(t) {
    const sim = this.sim, nest = sim.nest, env = sim.env;
    const N = this.needs;
    const gc = nest.gardenCells.length;
    let contam = 0, refuse = 0, empty = 0;
    for (const c of nest.gardenCells) { contam += nest.contam[c]; if (nest.fungus[c] < 0.05) empty++; }
    for (let i = 0; i < nest.N; i++) refuse += nest.refuse[i];
    const avgContam = gc ? contam / gc : 0;
    this.avgContam = avgContam;
    this.refuseTotal = refuse;

    const leafTarget = 6 + this.fungusTotal * 0.9 + gc * 0.05;
    let forage = clamp((leafTarget - this.leafCache) / leafTarget, 0, 1) * 0.85 + (this.foodFrac < 0.3 ? 0.35 : 0) + 0.1;
    let activity = 1;
    if (env.rain > 0.4) activity *= 0.12;
    if (env.temp > 34) activity *= 0.3;
    if (!nest.entrances.length) activity = 0;
    this.surfaceActivity = activity;
    N[TASK.FORAGE] = forage * activity;
    N[TASK.GARDEN] = gc ? clamp(this.leafCache / (6 + gc * 0.05), 0, 1) * 0.7 + avgContam * 4 + 0.15 + (empty / gc) * 0.3 : 0;
    let nurses = this.counts.byTask[TASK.NURSE] + 1;
    N[TASK.NURSE] = this.brood.length ? clamp(this.brood.length / (nurses * 6 + 4), 0, 1.3) + (this.broodAtQueen() && nest.has[TGT.NURSERY] ? 0.15 : 0) : 0;
    N[TASK.DIG] = nest.markCount > 0 && nest.has[TGT.DIG] ? clamp(0.35 + nest.markCount / 40, 0, 1.2) : 0;
    N[TASK.WASTE] = clamp(refuse / (8 + gc * 0.03), 0, 1.3);
    N[TASK.DEFEND] = clamp(this.threat, 0, 1.5) + 0.04;
    const trails = sim.surface.totals[F.FOOD0];
    N[TASK.EXPLORE] = (0.12 + forage * 0.35 * (trails < 60 ? 1 : 0.3)) * activity;
    for (const k in PRIORITY_TASK) this.stim[PRIORITY_TASK[k]] = N[PRIORITY_TASK[k]] * 2 * this.priorities[k];

    // measured foraging efficiency of individually simulated foragers (drives statistical workers)
    const f = this.counts.byTask[TASK.FORAGE];
    if (f > 3) this.leafRatePerForager = this.leafRatePerForager * 0.9 + 0.1 * (this.leafWindow / t / f);
    this.leafWindow = 0;
  }

  // Workers beyond the individual simulation cap contribute labour statistically,
  // in the same proportions as the individually simulated workers.
  virtualLabour(t) {
    const V = this.virtual[0] + this.virtual[1] + this.virtual[2] + this.virtual[3];
    this.virtualNurse = 0;
    if (V < 1) return;
    const sim = this.sim, nest = sim.nest, rng = sim.rng;
    const ind = Math.max(1, this.counts.workersInd);
    const frac = (task) => this.counts.byTask[task] / ind;

    // foraging: take leaves from recently harvested plants
    const vF = V * frac(TASK.FORAGE);
    let want = vF * this.leafRatePerForager * t;
    if (want > 0) {
      const recent = sim.veg.plants.filter((p) => p.alive && sim.time - p.lastCut < 120 && p.biomass > 2);
      for (const p of recent) {
        if (want <= 0) break;
        const take = Math.min(want / recent.length * 2, p.biomass * 0.05);
        p.biomass -= take;
        this.receiveLeaf(take, p.sp);
        want -= take;
      }
    }
    // gardening
    const vG = V * frac(TASK.GARDEN);
    const gc = nest.gardenCells;
    if (gc.length && vG > 0) {
      let amt = Math.min(this.leafCache, vG * 0.01 * t);
      for (let k = 0; k < 40 && amt > 0.01; k++) {
        const leaf = this.takeLeaf(Math.max(0.05, amt / 20));
        if (!leaf) break;
        nest.addSubstrate(gc[rng.int(gc.length)], leaf.amt, SPECIES[leaf.sp].toxin);
        this.onSubstrate(leaf.sp, leaf.amt);
        amt -= leaf.amt;
      }
      const g = Math.exp(-0.015 * (vG / gc.length) * t);
      for (const c of gc) nest.contam[c] *= g;
    }
    this.virtualNurse = V * frac(TASK.NURSE) * 0.5;
    // waste removal
    const vW = V * frac(TASK.WASTE);
    if (vW > 0) {
      let rem = vW * 0.01 * t;
      const hasWaste = nest.has[TGT.WASTE];
      for (let k = 0; k < 30 && rem > 0; k++) {
        const c = gc.length ? gc[rng.int(gc.length)] : -1;
        if (c < 0) break;
        const a = Math.min(rem / 10, nest.refuse[c]);
        nest.refuse[c] -= a; rem -= a;
        if (hasWaste) { const w = nest.randomCellOfZone(ZONE.WASTE); if (w >= 0) nest.dropWaste(w, a); }
        else this.dump.amount += a;
      }
    }
    // excavation
    const vD = V * frac(TASK.DIG);
    if (vD > 0 && nest.markCount > 0) {
      let budget = vD * 0.25 * t;
      for (let i = 0; i < nest.N && budget > 0; i++) {
        if (nest.solid[i] !== 1 || !nest.mark[i]) continue;
        const x = i % NW;
        const adj = (x > 0 && !nest.solid[i - 1]) || (x < NW - 1 && !nest.solid[i + 1]) || (i >= NW && !nest.solid[i - NW]) || (i + NW < nest.N && !nest.solid[i + NW]);
        if (!adj) continue;
        const use = Math.min(budget, 2);
        nest.dig[i] += use;
        budget -= use;
        if (nest.dig[i] >= nest.hard[i] * 3) {
          nest.finishDig(i);
          const e = nest.entrances.length ? nest.entrances[rng.int(nest.entrances.length)] : null;
          if (e) sim.surface.addMound(e.wx + rng.range(-3, 3), rng.range(-3, 3), 0.012);
          this.stats.soilOut++;
        }
      }
    }
    // mortality of statistical workers
    for (let c = 0; c < 4; c++) this.virtual[c] = Math.max(0, this.virtual[c] - (this.virtual[c] * t) / (LIFESPAN[c] * DAY_LEN));
  }

  // Autonomous colony responses the player never ordered.
  selfOrganise() {
    const nest = this.sim.nest;
    if (nest.markCount > 80) return;
    for (const ch of nest.chambers) {
      const s = ch.stats;
      if (!s || !s.n) continue;
      if (ch.zone === ZONE.GARDEN && s.fungus / s.n > 0.8 && s.contam < 0.2 && this.leafCache > 5) this.expandChamber(ch, 2);
      if (ch.zone === ZONE.WASTE && s.waste / s.n > 2) this.expandChamber(ch, 3);
    }
    if (this.brood.length > this.broodCapacity() * 0.9) {
      const nur = nest.chambers.filter((c) => c.zone === ZONE.NURSERY);
      if (nur.length) this.expandChamber(nur[this.sim.rng.int(nur.length)], 4);
    }
    // re-open the nest if every entrance has collapsed
    if (!nest.entrances.length) {
      let best = -1;
      for (let i = 0; i < nest.N; i++) if (!nest.solid[i]) { best = i; break; }
      if (best >= 0) {
        const x = best % NW, y = (best / NW) | 0;
        for (let r = 0; r < y; r++) if (nest.solid[r * NW + x] === 1) { nest.mark[r * NW + x] = 1; }
        nest.dirty = true;
      }
    }
  }

  expandChamber(ch, n) {
    const nest = this.sim.nest, rng = this.sim.rng;
    const cand = [];
    for (const c of ch.cells) {
      for (const k of [c - 1, c + 1, c - NW, c + NW]) {
        if (k < NW * 3 || k >= nest.N) continue;
        if (nest.solid[k] === 1 && !nest.mark[k]) cand.push(k);
      }
    }
    for (let j = 0; j < n && cand.length; j++) {
      const k = cand.splice(rng.int(cand.length), 1)[0];
      nest.mark[k] = 1;
      nest.zone[k] = ch.zone;
    }
    nest.dirty = true;
  }

  checkFlight(t) {
    const sim = this.sim, env = sim.env;
    if (this.flight) {
      this.flight.t += t;
      // virtual alates stream out through the flight
      const f = this.flight;
      const rate = (f.virtG + f.virtM) / 50;
      let n = Math.min(Math.ceil(rate * t), this.virtualAlates.gynes + this.virtualAlates.males);
      while (n-- > 0) {
        const g = this.virtualAlates.gynes > 0 && (this.virtualAlates.males === 0 || sim.rng.chance(0.4));
        if (g) this.virtualAlates.gynes--; else this.virtualAlates.males--;
        this.launchAlate(g);
      }
      if (f.t > 60) this.endFlight();
      return;
    }
    if (this.alatesTotal < 12) { this.flightRequested = false; return; }
    const cue = (env.seasonIdx <= 1 && env.rainAccum > 25 && env.rain < 0.1 && env.tod > 0.22 && env.tod < 0.42) || this.flightRequested;
    if (cue && sim.nest.entrances.length) this.startFlight();
  }

  startFlight() {
    this.flightRequested = false;
    this.flight = { t: 0, launchedG: 0, launchedM: 0, virtG: this.virtualAlates.gynes, virtM: this.virtualAlates.males };
    this.stats.flights++;
    this.sim.ants.releaseAlates(0);
    this.sim.events.push({ type: 'nuptial', start: true });
    this.sim.alerts.push('nuptial', 'NUPTIAL FLIGHT UNDERWAY', 'good', { layer: 0, x: 0, z: 0 }, 'nuptial');
    this.sim.predators.onFlight();
  }

  launchAlate(isGyne) {
    const sim = this.sim;
    const e = sim.nest.entrances[sim.rng.int(Math.max(1, sim.nest.entrances.length))];
    if (this.flight) { if (isGyne) this.flight.launchedG++; else this.flight.launchedM++; }
    if (isGyne) this.stats.launchedQueens++; else this.stats.launchedMales++;
    sim.events.push({ type: 'alate', x: e ? e.wx : 0, z: 0, gyne: isGyne });
  }

  endFlight() {
    const f = this.flight, sim = this.sim;
    this.flight = null;
    // Survival of founding queens is extremely low in nature (well under 1%).
    const p = 0.006 * this.genome.repro;
    let s = 0;
    for (let i = 0; i < f.launchedG; i++) if (sim.rng.chance(p)) s++;
    if (s === 0 && f.launchedG > 40 && sim.rng.chance(0.5)) s = 1;
    this.stats.daughterQueens += s;
    this.lastFlight = { gynes: f.launchedG, males: f.launchedM, success: s, day: sim.env.day };
    sim.alerts.push('flightEnd', `FLIGHT COMPLETE — ${f.launchedG} queens, ${s} founded colonies`, 'good', null, 'nuptial');
    sim.events.push({ type: 'nuptial', start: false });
  }

  updateStage() {
    const w = this.workers;
    let s = w < 1 ? 0 : w < 100 ? 1 : w < 1000 ? 2 : w < 10000 ? 3 : 4;
    if (this.alatesTotal > 0 || this.stats.flights > 0) s = Math.max(s, 5);
    this.stage = s;
  }

  recordHistory() {
    const h = this.history, max = 240;
    const push = (arr, v) => { arr.push(v); if (arr.length > max) arr.shift(); };
    push(h.pop, this.workers);
    push(h.food, this.foodFrac);
    push(h.fungus, this.fungusTotal);
    push(h.brood, this.brood.length);
    push(h.leaves, this.leafCache);
  }
}

// A rival colony simulated at colony level (its underground is statistical); its foragers are
// individually simulated on the surface.
export class RivalColony {
  constructor(sim, id, x, z, pop, genome) {
    this.sim = sim;
    this.id = id;
    this.isPlayer = false;
    this.alive = true;
    this.species = 'Atta colombica';
    this.nestX = x; this.nestZ = z;
    this.pop = pop;
    this.fungus = pop * 0.05;
    this.leafIn = 0;
    this.genome = genome;
    this.spawnAcc = 0;
    this.surfaceCount = 0;
    this.reject = new Float32Array(SPECIES.length);
    this.stim = new Float32Array(NTASK);
    this.boost = 1;
  }

  receiveLeaf(amt) { this.leafIn += amt; }

  step(dt) {
    if (!this.alive) return;
    const sim = this.sim, env = sim.env, rng = sim.rng;
    let activity = 1;
    if (env.rain > 0.4) activity *= 0.1;
    if (env.temp > 34) activity *= 0.3;
    const target = Math.min(420, this.pop * 0.1) * activity * this.boost;
    if (this.surfaceCount < target) {
      this.spawnAcc += dt * (1 + this.pop * 0.002);
      while (this.spawnAcc >= 1) {
        this.spawnAcc -= 1;
        if (!sim.ants.canSpawn()) break;
        const r = rng.next();
        const size = r < 0.08 ? rng.range(0.55, 0.8) : r < 0.78 ? rng.range(0.85, 1.4) : r < 0.96 || this.pop < 2000 ? rng.range(1.5, 2.2) : rng.range(2.4, 3);
        const i = sim.ants.spawn(this.id, sizeToCaste(size), size, LAYER.SURFACE, this.nestX + rng.range(-0.6, 0.6), this.nestZ + rng.range(-0.6, 0.6), rng.range(0.1, 0.7) * 14);
        const task = size > 2.3 || (size > 1.5 && rng.chance(0.35 * this.genome.aggression)) ? TASK.DEFEND : rng.chance(0.12) ? TASK.EXPLORE : TASK.FORAGE;
        sim.ants.assign(i, task);
      }
    }
    this.fungus += this.leafIn * 0.6;
    this.leafIn = 0;
    this.fungus -= this.fungus * 0.0006 * dt;
    const ratio = this.fungus / (this.pop * 0.05 + 1);
    this.pop += this.pop * 0.00015 * dt * clamp(ratio - 1, -1, 1) * (ratio > 1 ? Math.max(0, 1 - this.pop / 7000) : 1);
    if (this.pop < 15) {
      this.alive = false;
      sim.alerts.push('rivalDead', 'RIVAL COLONY HAS COLLAPSED', 'good', { layer: 0, x: this.nestX, z: this.nestZ }, 'territory');
    }
  }
}
