import { HALF, RIVAL_POS, clamp } from './constants.js';

// Plant species available to the ants. quality = substrate value for the fungus,
// toxin = antifungal compounds (the ants cannot detect these directly — the fungus can).
export const SPECIES = [
  { name: 'Cecropia sapling', kind: 'sapling', quality: 0.9, toxin: 0, maxB: [70, 120], regrow: 0.8, cut: 1.3, color: 0x5e9a3f },
  { name: 'Inga shrub', kind: 'bush', quality: 1.0, toxin: 0, maxB: [30, 55], regrow: 1.0, cut: 1.0, color: 0x3f8a36 },
  { name: 'Piper shrub', kind: 'bush', quality: 0.7, toxin: 0, maxB: [25, 45], regrow: 1.1, cut: 1.0, color: 0x5b8f2e },
  { name: 'Hymenaea seedling', kind: 'bush', quality: 0.85, toxin: 0.9, maxB: [25, 40], regrow: 0.7, cut: 1.2, color: 0x2f6e3b },
  { name: 'Paspalum grass', kind: 'grass', quality: 0.45, toxin: 0, maxB: [8, 14], regrow: 1.8, cut: 0.7, color: 0x8aa645 },
  { name: 'Heliconia', kind: 'herb', quality: 0.75, toxin: 0, maxB: [35, 60], regrow: 0.9, cut: 1.1, color: 0x3d9146 },
  { name: 'Ficus canopy tree', kind: 'tree', quality: 0.65, toxin: 0.05, maxB: [300, 500], regrow: 0.5, cut: 2.2, color: 0x2d6a2a },
];

const BUCKET = 8;
const NB = Math.ceil((HALF * 2) / BUCKET);

export class Vegetation {
  constructor(rng, noise, surface) {
    this.rng = rng;
    this.surface = surface;
    this.plants = [];
    this.buckets = Array.from({ length: NB * NB }, () => []);
    this.version = 0;
    this.acc = 0;
    this.generate(noise);
  }

  validSpot(x, z, clear = 1.5) {
    if (Math.abs(x) > HALF - 2 || Math.abs(z) > HALF - 2) return false;
    if (Math.hypot(x, z) < 7) return false;
    if (Math.hypot(x - RIVAL_POS.x, z - RIVAL_POS.z) < 6) return false;
    if (Math.abs(x - this.surface.streamX(z)) < 3.2) return false;
    for (const p of this.nearby(x, z, clear + 3)) if (Math.hypot(p.x - x, p.z - z) < clear + p.r * 0.5) return false;
    return true;
  }

  generate(noise) {
    const rng = this.rng;
    const place = (sp, n, fn) => {
      let tries = 0, made = 0;
      while (made < n && tries < n * 60) {
        tries++;
        const [x, z] = fn();
        if (!this.validSpot(x, z, SPECIES[sp].kind === 'tree' ? 5 : 1.4)) continue;
        this.addPlant(sp, x, z);
        made++;
      }
    };
    const anywhere = () => [rng.range(-HALF + 3, HALF - 3), rng.range(-HALF + 3, HALF - 3)];
    const clustered = (bias) => () => {
      for (let k = 0; k < 20; k++) {
        const [x, z] = anywhere();
        if (noise.fbm(x * 0.05 + bias, z * 0.05, 3) > 0.05) return [x, z];
      }
      return anywhere();
    };
    // Big trees on the margins of the clearing
    place(6, 12, () => {
      const a = rng.range(0, Math.PI * 2), r = rng.range(48, 60);
      return [Math.cos(a) * r, Math.sin(a) * r];
    });
    place(0, 20, clustered(3));
    place(1, 34, clustered(10));
    place(2, 30, clustered(20));
    place(3, 12, clustered(30));
    place(5, 16, clustered(40));
    place(4, 70, anywhere);
    // A lush Inga thicket across the stream, reachable only over the fallen log.
    place(1, 10, () => [rng.range(48, 60), rng.range(-30, 10)]);
    this.version++;
  }

  addPlant(sp, x, z, frac = 1) {
    const S = SPECIES[sp];
    const max = this.rng.range(S.maxB[0], S.maxB[1]);
    const r = { sapling: 1.4, bush: 1.2, grass: 0.8, herb: 1.3, tree: 3.2 }[S.kind];
    const p = {
      id: this.plants.length, sp, x, z, r: r * (0.8 + 0.4 * (max - S.maxB[0]) / (S.maxB[1] - S.maxB[0] + 1)),
      biomass: max * frac, max, alive: true, seed: this.rng.next(), lastCut: -1e9, lowTime: 0,
    };
    this.plants.push(p);
    this.bucketOf(x, z).push(p);
    this.version++;
    return p;
  }

  bucketOf(x, z) {
    const i = clamp(Math.floor((x + HALF) / BUCKET), 0, NB - 1), j = clamp(Math.floor((z + HALF) / BUCKET), 0, NB - 1);
    return this.buckets[j * NB + i];
  }

  *nearby(x, z, r) {
    const i0 = clamp(Math.floor((x - r + HALF) / BUCKET), 0, NB - 1), i1 = clamp(Math.floor((x + r + HALF) / BUCKET), 0, NB - 1);
    const j0 = clamp(Math.floor((z - r + HALF) / BUCKET), 0, NB - 1), j1 = clamp(Math.floor((z + r + HALF) / BUCKET), 0, NB - 1);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) for (const p of this.buckets[j * NB + i]) if (p.alive) yield p;
  }

  // Nearest harvestable plant within sensing radius.
  findPlant(x, z, r, reject, rng) {
    let best = null, bd = 1e9;
    for (const p of this.nearby(x, z, r + 3)) {
      if (p.biomass < 3) continue;
      const d = Math.hypot(p.x - x, p.z - z) - p.r;
      if (d > r || d >= bd) continue;
      if (reject && reject[p.sp] > 0 && rng.next() < reject[p.sp]) continue;
      bd = d;
      best = p;
    }
    return best;
  }

  removeIn(x, z, r) {
    for (const p of this.nearby(x, z, r)) if (Math.hypot(p.x - x, p.z - z) < r) p.alive = false;
    this.version++;
  }

  step(dt, env) {
    this.acc += dt;
    if (this.acc < 1) return;
    const t = this.acc;
    this.acc = 0;
    const sp = env.season();
    const water = 0.4 + env.soilMoisture;
    const g = sp.growth * water * (env.weather === 'drought' ? 0.35 : 1);
    let died = false;
    for (const p of this.plants) {
      if (!p.alive) continue;
      const S = SPECIES[p.sp];
      p.biomass += 0.004 * S.regrow * g * (p.max - p.biomass) * t + 0.02 * S.regrow * g * t;
      if (p.biomass > p.max) p.biomass = p.max;
      if (env.weather === 'storm' && S.kind !== 'tree') p.biomass -= p.biomass * 0.002 * t;
      // Repeated total defoliation can kill small plants
      if (p.biomass < p.max * 0.03) p.lowTime += t; else p.lowTime = Math.max(0, p.lowTime - t);
      if (p.lowTime > 400 && S.kind !== 'tree') { p.alive = false; died = true; }
    }
    // Succession: new seedlings recruit into gaps
    const alive = this.plants.reduce((n, p) => n + (p.alive ? 1 : 0), 0);
    if (alive < 240 && this.rng.chance(0.03 * g * t)) {
      const x = this.rng.range(-HALF + 4, HALF - 4), z = this.rng.range(-HALF + 4, HALF - 4);
      const s = this.rng.pick([0, 1, 2, 2, 3, 4, 4, 4, 5]);
      if (this.validSpot(x, z)) this.addPlant(s, x, z, 0.15);
    }
    if (died) this.version++;
  }

  totalBiomass() {
    let b = 0, m = 0;
    for (const p of this.plants) if (p.alive) { b += p.biomass; m += p.max; }
    return { b, m };
  }
}
