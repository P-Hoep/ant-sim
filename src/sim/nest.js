import { NW, NH, NCELL, NX0, ZONE, ZONE_NAMES, clamp } from './constants.js';

// Flow-field targets. Each target has a BFS distance map for small ants and for large
// ants (large ants only fit through tunnels at least two cells wide).
export const TGT = { EXIT: 0, GARDEN: 1, NURSERY: 2, QUEEN: 3, WASTE: 4, STORE: 5, DIG: 6, CHAMBER: 7, VENT: 8 };
const NT = 9;
export const UNREACH = 65535;

export class Nest {
  constructor(rng, noise) {
    this.rng = rng;
    this.W = NW; this.H = NH;
    const N = (this.N = NW * NH);
    this.solid = new Uint8Array(N).fill(1); // 0 open, 1 soil, 2 rock
    this.zone = new Uint8Array(N);
    this.mark = new Uint8Array(N);
    this.dig = new Float32Array(N);
    this.hard = new Float32Array(N);
    this.water = new Float32Array(N);
    this.temp = new Float32Array(N).fill(25);
    this.hum = new Float32Array(N).fill(0.85);
    this.fungus = new Float32Array(N);
    this.substrate = new Float32Array(N);
    this.refuse = new Float32Array(N);
    this.contam = new Float32Array(N);
    this.toxin = new Float32Array(N);
    this.waste = new Float32Array(N);
    this.wasteNear = new Float32Array(N);
    this.traffic = new Float32Array(N);
    this.large = new Uint8Array(N);
    this.chamberOf = new Int16Array(N).fill(-1);
    this.dist = Array.from({ length: NT }, () => [new Uint16Array(N).fill(UNREACH), new Uint16Array(N).fill(UNREACH)]);
    this.has = new Uint8Array(NT);
    this.queue = new Int32Array(N);
    this.chambers = [];
    this.entrances = [];
    this.gardenCells = [];
    this.plug = 0;
    this.dirty = true;
    this.rebuildCd = 0;
    this.version = 0;     // topology version (for rendering)
    this.dataVersion = 0; // cell data changes (water/waste) for rendering
    this.acc = { water: 0, climate: 0, fungus: 0, stats: 0, wasteNear: 0 };
    this.totalWater = 0;
    this.markCount = 0;

    for (let y = 0; y < NH; y++) {
      for (let x = 0; x < NW; x++) {
        const i = y * NW + x;
        this.hard[i] = 1 + (y / NH) * 1.2 + noise.fbm(x * 0.09, y * 0.09, 2) * 0.3;
      }
    }
    // Buried stones that cannot be excavated
    for (let k = 0; k < 34; k++) {
      const cx = rng.int(NW), cy = 8 + rng.int(NH - 10);
      const rx = rng.range(0.8, 2.6), ry = rng.range(0.6, 1.8);
      if (Math.abs(cx - NW / 2) < 8 && cy < 30) continue;
      for (let y = Math.floor(cy - ry); y <= cy + ry; y++)
        for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
          if (x < 0 || y < 0 || x >= NW || y >= NH) continue;
          if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) this.solid[y * NW + x] = 2;
        }
    }
  }

  // ---- coordinates ----
  wx(col) { return NX0 + (col + 0.5) * NCELL; }
  wy(row) { return -(row + 0.5) * NCELL; }
  cellAt(x, y) {
    const c = Math.floor((x - NX0) / NCELL), r = Math.floor(-y / NCELL);
    if (c < 0 || r < 0 || c >= NW || r >= NH) return -1;
    return r * NW + c;
  }
  cx(i) { return i % NW; }
  cy(i) { return (i / NW) | 0; }
  open(i) { return this.solid[i] === 0; }

  // ---- construction ----
  carve(x, y, zone = null) {
    if (x < 0 || y < 0 || x >= NW || y >= NH) return;
    const i = y * NW + x;
    this.solid[i] = 0;
    this.mark[i] = 0;
    if (zone !== null) this.zone[i] = zone;
    this.dirty = true;
  }
  carveEllipse(cx, cy, rx, ry, zone) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++)
        if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) this.carve(x, y, zone);
  }
  carveLine(x0, y0, x1, y1, w = 1, zone = 0) {
    const n = Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))) * 2 + 1;
    for (let k = 0; k <= n; k++) {
      const x = Math.round(x0 + ((x1 - x0) * k) / n), y = Math.round(y0 + ((y1 - y0) * k) / n);
      for (let a = 0; a < w; a++) for (let b = 0; b < w; b++) {
        const xx = x + a - Math.floor((w - 1) / 2), yy = y + b - Math.floor((w - 1) / 2);
        if (xx >= 0 && yy >= 0 && xx < NW && yy < NH && this.zone[yy * NW + xx] === 0) this.carve(xx, yy, zone);
        else this.carve(xx, yy);
      }
    }
  }
  markLine(x0, y0, x1, y1) {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2 + 1;
    for (let k = 0; k <= n; k++) {
      const x = Math.round(x0 + ((x1 - x0) * k) / n), y = Math.round(y0 + ((y1 - y0) * k) / n);
      const i = y * NW + x;
      if (this.solid[i] === 0) this.solid[i] = 1;
      this.mark[i] = 1;
    }
    this.dirty = true;
  }

  // Player tools. Returns true if anything changed.
  paint(i, tool) {
    if (i < 0) return false;
    const s = this.solid[i];
    if (tool === 'dig') {
      if (s === 1 && !this.mark[i]) { this.mark[i] = 1; this.dirty = true; return true; }
      return false;
    }
    if (tool === 'erase') {
      let ch = false;
      if (this.mark[i]) { this.mark[i] = 0; this.dig[i] = 0; ch = true; }
      if (this.zone[i] && this.zone[i] !== ZONE.QUEEN) { this.zone[i] = 0; ch = true; }
      if (ch) this.dirty = true;
      return ch;
    }
    const z = { garden: ZONE.GARDEN, nursery: ZONE.NURSERY, waste: ZONE.WASTE, store: ZONE.STORE, vent: ZONE.VENT }[tool];
    if (z === undefined || s === 2) return false;
    if (this.zone[i] === ZONE.QUEEN) return false;
    let ch = false;
    if (this.zone[i] !== z) { this.zone[i] = z; ch = true; }
    if (s === 1 && !this.mark[i]) { this.mark[i] = 1; ch = true; }
    if (ch) this.dirty = true;
    return ch;
  }

  finishDig(i) {
    this.solid[i] = 0;
    this.mark[i] = 0;
    this.dig[i] = 0;
    this.dirty = true;
  }

  fill(i) { // collapse / backfill
    this.solid[i] = 1;
    this.fungus[i] = 0; this.substrate[i] = 0; this.water[i] = 0; this.waste[i] = 0; this.refuse[i] = 0;
    this.dirty = true;
  }

  nearestOpen(x, y) {
    const c0 = Math.floor((x - NX0) / NCELL), r0 = Math.floor(-y / NCELL);
    for (let rad = 0; rad < 8; rad++)
      for (let dy = -rad; dy <= rad; dy++)
        for (let dx = -rad; dx <= rad; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== rad) continue;
          const c = c0 + dx, r = r0 + dy;
          if (c < 0 || r < 0 || c >= NW || r >= NH) continue;
          const i = r * NW + c;
          if (this.solid[i] === 0) return i;
        }
    return -1;
  }

  // ---- topology rebuild: chambers, entrances, flow fields ----
  rebuild() {
    const { W, H, solid, zone, large } = this;
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        large[i] = 0;
        if (solid[i]) continue;
        for (let oy = -1; oy <= 0 && !large[i]; oy++)
          for (let ox = -1; ox <= 0; ox++) {
            const x0 = x + ox, y0 = y + oy;
            if (x0 < 0 || y0 < 0 || x0 + 1 >= W || y0 + 1 >= H) continue;
            const k = y0 * W + x0;
            if (!solid[k] && !solid[k + 1] && !solid[k + W] && !solid[k + W + 1]) { large[i] = 1; break; }
          }
      }
    // Entrances: runs of open cells in the top row
    const oldEnt = this.entrances;
    this.entrances = [];
    for (let x = 0; x < W; x++) {
      if (solid[x]) continue;
      let x1 = x;
      while (x1 + 1 < W && !solid[x1 + 1]) x1++;
      const col = (x + x1) / 2;
      this.entrances.push({ x0: x, x1, col, wx: NX0 + (col + 0.5) * NCELL, id: this.entrances.length });
      x = x1;
    }
    this.entranceLost = oldEnt.length > this.entrances.length;

    // Chambers: connected zones of the same type
    const cof = this.chamberOf;
    cof.fill(-1);
    const old = this.chambers;
    this.chambers = [];
    const q = this.queue;
    for (let i = 0; i < this.N; i++) {
      if (solid[i] || !zone[i] || cof[i] >= 0) continue;
      const z = zone[i], id = this.chambers.length;
      const cells = [];
      let qh = 0, qt = 0;
      q[qt++] = i;
      cof[i] = id;
      while (qh < qt) {
        const c = q[qh++];
        cells.push(c);
        const x = c % W, y = (c / W) | 0;
        const nb = [x > 0 ? c - 1 : -1, x < W - 1 ? c + 1 : -1, y > 0 ? c - W : -1, y < H - 1 ? c + W : -1];
        for (const n of nb) if (n >= 0 && !solid[n] && zone[n] === z && cof[n] < 0) { cof[n] = id; q[qt++] = n; }
      }
      let sx = 0, sy = 0;
      for (const c of cells) { sx += c % W; sy += (c / W) | 0; }
      const ch = { id, zone: z, cells, cx: sx / cells.length, cy: sy / cells.length, stats: {}, ants: 0 };
      const prev = old.find((o) => o.zone === z && Math.abs(o.cx - ch.cx) < 6 && Math.abs(o.cy - ch.cy) < 6);
      ch.stats = prev ? prev.stats : {};
      this.chambers.push(ch);
    }
    this.nameChambers();
    this.gardenCells = [];
    for (const ch of this.chambers) if (ch.zone === ZONE.GARDEN) for (const c of ch.cells) this.gardenCells.push(c);

    // Flow fields
    const targets = Array.from({ length: NT }, () => []);
    this.markCount = 0;
    for (let i = 0; i < this.N; i++) {
      if (solid[i] === 0) {
        if (i < W) targets[TGT.EXIT].push(i);
        const z = zone[i];
        if (z && z !== ZONE.WASTE) targets[TGT.CHAMBER].push(i);
        if (z === ZONE.GARDEN) targets[TGT.GARDEN].push(i);
        else if (z === ZONE.NURSERY) targets[TGT.NURSERY].push(i);
        else if (z === ZONE.QUEEN) targets[TGT.QUEEN].push(i);
        else if (z === ZONE.WASTE) targets[TGT.WASTE].push(i);
        else if (z === ZONE.STORE) targets[TGT.STORE].push(i);
        else if (z === ZONE.VENT) targets[TGT.VENT].push(i);
        // dig frontier: open cells next to marked soil
        const x = i % W, y = (i / W) | 0;
        if ((x > 0 && this.mark[i - 1] && solid[i - 1] === 1) || (x < W - 1 && this.mark[i + 1] && solid[i + 1] === 1) ||
            (y > 0 && this.mark[i - W] && solid[i - W] === 1) || (y < H - 1 && this.mark[i + W] && solid[i + W] === 1))
          targets[TGT.DIG].push(i);
      } else if (this.mark[i] && solid[i] === 1) this.markCount++;
    }
    for (let t = 0; t < NT; t++) {
      this.has[t] = targets[t].length > 0 ? 1 : 0;
      this.bfs(targets[t], this.dist[t][0], false);
      this.bfs(targets[t], this.dist[t][1], true);
    }
    this.dirty = false;
    this.version++;
  }

  bfs(targets, out, big) {
    out.fill(UNREACH);
    const { W, H, solid, large, queue: q } = this;
    let qh = 0, qt = 0;
    for (const t of targets) if (!big || large[t]) { out[t] = 0; q[qt++] = t; }
    while (qh < qt) {
      const c = q[qh++], d = out[c] + 1;
      const x = c % W, y = (c / W) | 0;
      if (x > 0) { const n = c - 1; if (!solid[n] && (!big || large[n]) && out[n] > d) { out[n] = d; q[qt++] = n; } }
      if (x < W - 1) { const n = c + 1; if (!solid[n] && (!big || large[n]) && out[n] > d) { out[n] = d; q[qt++] = n; } }
      if (y > 0) { const n = c - W; if (!solid[n] && (!big || large[n]) && out[n] > d) { out[n] = d; q[qt++] = n; } }
      if (y < H - 1) { const n = c + W; if (!solid[n] && (!big || large[n]) && out[n] > d) { out[n] = d; q[qt++] = n; } }
    }
  }

  nameChambers() {
    const used = {};
    for (const ch of this.chambers) {
      const horiz = ch.cx < NW * 0.36 ? 'Western' : ch.cx > NW * 0.64 ? 'Eastern' : 'Central';
      const depth = ch.cy < 14 ? 'upper ' : ch.cy > 46 ? 'deep ' : '';
      let name = `${horiz} ${depth}${ZONE_NAMES[ch.zone].toLowerCase()}`;
      used[name] = (used[name] || 0) + 1;
      if (used[name] > 1) name += ' ' + ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'][Math.min(8, used[name])];
      ch.name = name;
    }
  }

  chamberAtCell(i) { const c = this.chamberOf[i]; return c >= 0 ? this.chambers[c] : null; }

  randomCellOfZone(z) {
    const list = this.chambers.filter((c) => c.zone === z);
    if (!list.length) return -1;
    const ch = list[this.rng.int(list.length)];
    return ch.cells[this.rng.int(ch.cells.length)];
  }

  // ---- per-cell actions used by ants ----
  addSubstrate(i, amt, toxin) {
    // prefer the neediest garden cell in a small neighbourhood
    let best = i, bs = 1e9;
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) {
        const x = (i % NW) + dx, y = ((i / NW) | 0) + dy;
        if (x < 0 || y < 0 || x >= NW || y >= NH) continue;
        const k = y * NW + x;
        if (this.solid[k] || this.zone[k] !== ZONE.GARDEN) continue;
        const s = this.substrate[k] - (this.fungus[k] > 0.05 ? 0.2 : 0) + this.rng.next() * 0.05;
        if (s < bs) { bs = s; best = k; }
      }
    this.substrate[best] = Math.min(3, this.substrate[best] + amt);
    this.toxin[best] = Math.min(2, this.toxin[best] + amt * toxin);
    return best;
  }

  takeRefuse(i, maxAmt) {
    let best = -1, br = 0.05;
    for (let dy = -3; dy <= 3; dy++)
      for (let dx = -3; dx <= 3; dx++) {
        const x = (i % NW) + dx, y = ((i / NW) | 0) + dy;
        if (x < 0 || y < 0 || x >= NW || y >= NH) continue;
        const k = y * NW + x;
        if (this.solid[k] || this.zone[k] === ZONE.WASTE) continue;
        if (this.refuse[k] > br) { br = this.refuse[k]; best = k; }
      }
    if (best < 0) return 0;
    const a = Math.min(maxAmt, this.refuse[best]);
    this.refuse[best] -= a;
    return a;
  }

  dropWaste(i, amt) {
    let k = i;
    for (let tries = 0; tries < 12 && this.waste[k] > 2.5; tries++) {
      const n = [k - 1, k + 1, k - NW, k + NW][this.rng.int(4)];
      if (n >= 0 && n < this.N && !this.solid[n] && this.zone[n] === ZONE.WASTE) k = n;
    }
    this.waste[k] += amt;
    this.dataVersion++;
  }

  groom(i, power, canSeed = false) {
    for (let d = 0; d < 5; d++) {
      const k = d === 0 ? i : d === 1 ? i - 1 : d === 2 ? i + 1 : d === 3 ? i - NW : i + NW;
      if (k < 0 || k >= this.N || this.zone[k] !== ZONE.GARDEN || this.solid[k]) continue;
      const p = d === 0 ? power : power * 0.4;
      this.contam[k] = Math.max(0, this.contam[k] - p);
      // transport fungal fragments into empty garden cells (inoculation)
      if (this.fungus[k] < 0.05 && this.hasFungalNeighbour(k)) this.fungus[k] += 0.04 * (p / power);
      // workers carry mycelium fragments from established gardens into new chambers
      else if (d === 0 && canSeed && this.fungus[k] < 0.02 && this.rng.next() < power * 1.5) this.fungus[k] = 0.08;
    }
  }

  hasFungalNeighbour(k) {
    const f = this.fungus;
    return (f[k - 1] > 0.3) || (f[k + 1] > 0.3) || (k >= NW && f[k - NW] > 0.3) || (k + NW < this.N && f[k + NW] > 0.3);
  }

  // ---- simulation ----
  step(dt, sim) {
    const { env, colony } = sim;
    this.rebuildCd -= dt;
    if (this.dirty && this.rebuildCd <= 0) { this.rebuild(); this.rebuildCd = 0.35; }
    const a = this.acc;
    a.water += dt; a.climate += dt; a.fungus += dt; a.stats += dt; a.wasteNear += dt;
    if (a.water >= 0.1) { this.stepWater(a.water, env, sim); a.water = 0; }
    if (a.climate >= 1) { this.stepClimate(env, colony); a.climate = 0; }
    if (a.wasteNear >= 2) { this.computeWasteNear(); a.wasteNear = 0; }
    if (a.fungus >= 0.5) { this.stepFungus(a.fungus, colony); a.fungus = 0; }
    if (a.stats >= 1) { this.computeStats(a.stats); a.stats = 0; }
  }

  stepWater(t, env, sim) {
    const { W, H, solid, water } = this;
    const inflowBase = env.rain * env.rain * 0.35 * (1 - this.plug * 0.85);
    if (inflowBase > 0.001) {
      for (const e of this.entrances) {
        const shield = 1 / (1 + sim.surface.moundAt(e.wx, 0) * 1.2);
        for (let x = e.x0; x <= e.x1; x++) water[x] = Math.min(1, water[x] + inflowBase * shield * t);
      }
    }
    if (this.totalWater < 0.001 && inflowBase <= 0.001) return;
    const kDown = Math.min(1, 10 * t), kSide = Math.min(0.5, 3 * t);
    const seep = 0.02 * t * (1.3 - env.soilMoisture);
    let total = 0;
    for (let y = H - 1; y >= 0; y--) {
      const dir = (y & 1) ? 1 : -1;
      for (let xx = 0; xx < W; xx++) {
        const x = dir > 0 ? xx : W - 1 - xx;
        const i = y * W + x;
        let w = water[i];
        if (w <= 0.0005 || solid[i]) { if (solid[i]) water[i] = 0; continue; }
        if (y < H - 1) {
          const b = i + W;
          if (!solid[b] && water[b] < 1) {
            const mv = Math.min(w, 1 - water[b]) * kDown;
            water[b] += mv; w -= mv;
          }
        }
        if (x > 0 && !solid[i - 1] && water[i - 1] < w) { const mv = (w - water[i - 1]) * kSide; water[i - 1] += mv; w -= mv; }
        if (x < W - 1 && !solid[i + 1] && water[i + 1] < w) { const mv = (w - water[i + 1]) * kSide; water[i + 1] += mv; w -= mv; }
        // soil absorbs water through walls
        let soilN = 0;
        if (y < H - 1 && solid[i + W]) soilN++;
        if (x > 0 && solid[i - 1]) soilN++;
        if (x < W - 1 && solid[i + 1]) soilN++;
        w -= seep * (0.3 + soilN);
        if (w < 0) w = 0;
        water[i] = w;
        total += w;
      }
    }
    this.totalWater = total;
    this.dataVersion++;
  }

  stepClimate(env, colony) {
    const sp = env.season();
    const deepT = 24.5 + (sp.temp - 24) * 0.3;
    const deepH = 0.86 + 0.1 * (env.soilMoisture - 0.5);
    const ex = this.dist[TGT.EXIT][0], vent = this.dist[TGT.VENT][0], hasVent = this.has[TGT.VENT];
    const plugF = 1 - 0.7 * this.plug;
    const { W, solid, temp, hum } = this;
    for (let i = 0; i < this.N; i++) {
      if (solid[i]) continue;
      const depth = (((i / W) | 0) + 0.5) * NCELL;
      const df = Math.exp(-depth / 6);
      let coup = ex[i] === UNREACH ? 0 : Math.exp(-ex[i] / 16);
      if (hasVent && vent[i] !== UNREACH) coup = Math.max(coup, 0.8 * Math.exp(-vent[i] / 12));
      if (this.large[i]) coup *= 1.2;
      coup *= plugF;
      const a = clamp(Math.max(df, coup * 0.85), 0, 1);
      const T = deepT + (env.temp - deepT) * a + this.fungus[i] * 0.9;
      temp[i] += (T - temp[i]) * 0.35;
      const Hh = clamp(deepH + (env.hum - deepH) * a * 0.9 + this.water[i] * 0.25 + this.fungus[i] * 0.03, 0.1, 1);
      hum[i] += (Hh - hum[i]) * 0.35;
    }
  }

  computeWasteNear() {
    const wn = this.wasteNear;
    wn.fill(0);
    for (const ch of this.chambers) {
      if (ch.zone !== ZONE.WASTE) continue;
      for (const c of ch.cells) {
        const w = this.waste[c];
        if (w < 0.1) continue;
        const cx = c % NW, cy = (c / NW) | 0;
        for (let dy = -5; dy <= 5; dy++)
          for (let dx = -5; dx <= 5; dx++) {
            const x = cx + dx, y = cy + dy;
            if (x < 0 || y < 0 || x >= NW || y >= NH) continue;
            const d = Math.abs(dx) + Math.abs(dy);
            if (d > 6) continue;
            wn[y * NW + x] += w * 0.02 * (1 - d / 7);
          }
      }
    }
  }

  stepFungus(t, colony) {
    const g = colony.genome;
    const { fungus: F, substrate: S, contam: C, refuse: R, toxin: X, temp: T, hum: Hm, water: Wt, wasteNear: WN } = this;
    for (const ch of this.chambers) if (ch.zone === ZONE.GARDEN) ch.growth = 0;
    const cells = this.gardenCells;
    // leaf pulp is worked through the spongy garden matrix by the workers
    const kd = Math.min(0.24, 0.12 * t);
    for (let n = 0; n < cells.length; n++) {
      const i = cells[n];
      for (const k of [i + 1, i + NW]) {
        if (k >= this.N || this.zone[k] !== ZONE.GARDEN || this.solid[k]) continue;
        const d = (S[i] - S[k]) * kd;
        S[i] -= d; S[k] += d;
      }
    }
    for (let n = 0; n < cells.length; n++) {
      const i = cells[n];
      let f = F[i], s = S[i], c = C[i];
      const tf = Math.exp(-(((T[i] - 25.5) / 4.5) ** 2));
      const hf = clamp((Hm[i] - 0.45) / 0.35, 0, 1);
      const sf = s / (s + 0.25);
      const grow = 0.06 * g.fungus * f * (1 - f) * sf * tf * hf * (1 - c);
      f += grow * t;
      S[i] = Math.max(0, s - grow * t * 0.9);
      R[i] += grow * t * 0.25;
      let loss = 0;
      if (s < 0.02) loss += 0.0012;
      if (T[i] > 31) loss += (T[i] - 31) * 0.012;
      if (T[i] < 17) loss += 0.004;
      if (hf < 0.25) loss += 0.006 * (1 - hf * 4);
      loss += X[i] * 0.03 + c * c * 0.06;
      if (Wt[i] > 0.35) loss += 0.02;
      f -= loss * f * t;
      X[i] *= Math.exp(-0.004 * t);

      const rc = (0.004 + R[i] * 0.015 + WN[i] * 0.05 + X[i] * 0.04 + (Wt[i] > 0.3 ? 0.05 : 0) + (Hm[i] > 0.98 ? 0.01 : 0)) / g.disease;
      c += rc * c * (1 - c) * t - 0.012 * c * f * t;
      if (this.rng.next() < 0.00005 * t * (1 + R[i] * 3 + WN[i] * 6 + X[i] * 3)) c = Math.max(c, 0.05);
      if (c > 0.25) {
        const sp = 0.012 * c * t;
        for (const k of [i - 1, i + 1, i - NW, i + NW])
          if (k >= 0 && k < this.N && this.zone[k] === ZONE.GARDEN && !this.solid[k]) C[k] = Math.min(1, C[k] + sp);
      }
      if (f > 0.5) {
        for (const k of [i - 1, i + 1, i - NW, i + NW])
          if (k >= 0 && k < this.N && this.zone[k] === ZONE.GARDEN && !this.solid[k] && F[k] < 0.1 && C[k] < 0.3) F[k] += 0.004 * t * f;
      }
      F[i] = clamp(f, 0, 1);
      C[i] = clamp(c, 0, 1);
      const chm = this.chamberOf[i];
      if (chm >= 0) this.chambers[chm].growth += grow;
    }
  }

  computeStats(t) {
    for (const ch of this.chambers) {
      const s = { fungus: 0, contam: 0, temp: 0, hum: 0, water: 0, refuse: 0, waste: 0, substrate: 0, n: ch.cells.length };
      for (const c of ch.cells) {
        s.fungus += this.fungus[c]; s.contam += this.contam[c]; s.temp += this.temp[c]; s.hum += this.hum[c];
        s.water += this.water[c]; s.refuse += this.refuse[c]; s.waste += this.waste[c]; s.substrate += this.substrate[c];
      }
      s.contam /= s.n; s.temp /= s.n; s.hum /= s.n; s.water /= s.n;
      s.growth = (ch.growth || 0) * 60; // biomass per minute
      s.ants = ch.ants;
      ch.stats = s;
    }
    for (let i = 0; i < this.N; i++) this.traffic[i] *= Math.exp(-0.05 * t);
  }
}
