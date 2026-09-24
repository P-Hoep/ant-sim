import { SG, SCELL, HALF, BRIDGE_Z, clamp } from './constants.js';

// Chemical and physical fields covering the forest floor.
export const F = { FOOD0: 0, HOME0: 1, FOOD1: 2, HOME1: 3, ALARM: 4, TERR0: 5, TERR1: 6, TRAFFIC: 7 };
const NF = 8;

// per-second evaporation, extra wash-off per unit rain, and diffusion coefficient
const DECAY = [0.03, 0.018, 0.03, 0.018, 0.45, 0.004, 0.004, 0.006];
const WASH = [0.35, 0.2, 0.35, 0.2, 0.6, 0.03, 0.03, 0.0];
const DIFF = [0.05, 0.05, 0.05, 0.05, 0.12, 0, 0, 0];

export class Surface {
  constructor(noise) {
    this.fields = Array.from({ length: NF }, () => new Float32Array(SG * SG));
    this.tmp = new Float32Array(SG * SG);
    this.hN = SG + 1;
    this.base = new Float32Array(this.hN * this.hN);
    this.mound = new Float32Array(this.hN * this.hN);
    this.water = new Uint8Array(SG * SG);
    this.moundVersion = 0;
    this.acc = 0;
    this.totals = new Float32Array(NF);

    for (let j = 0; j < this.hN; j++) {
      for (let i = 0; i < this.hN; i++) {
        const x = -HALF + i * SCELL, z = -HALF + j * SCELL;
        let h = noise.fbm(x * 0.028, z * 0.028, 4) * 1.6 + noise.fbm(x * 0.13 + 50, z * 0.13, 3) * 0.22;
        const d = Math.abs(x - this.streamX(z));
        if (d < 4) h -= Math.pow(1 - d / 4, 1.6) * 1.7;
        // flatten near the nest so the mound reads clearly
        const r = Math.hypot(x, z);
        if (r < 14) h *= 0.4 + 0.6 * (r / 14);
        this.base[j * this.hN + i] = h;
      }
    }
    for (let j = 0; j < SG; j++) {
      for (let i = 0; i < SG; i++) {
        const x = -HALF + (i + 0.5) * SCELL, z = -HALF + (j + 0.5) * SCELL;
        const d = Math.abs(x - this.streamX(z));
        if (d < 2.3 && Math.abs(z - BRIDGE_Z) > 0.7) this.water[j * SG + i] = 1;
      }
    }
  }

  streamX(z) { return 44 + 5 * Math.sin(z * 0.07) + 2 * Math.sin(z * 0.19 + 1); }

  cellIdx(x, z) {
    let i = Math.floor((x + HALF) / SCELL), j = Math.floor((z + HALF) / SCELL);
    i = i < 0 ? 0 : i >= SG ? SG - 1 : i;
    j = j < 0 ? 0 : j >= SG ? SG - 1 : j;
    return j * SG + i;
  }

  heightAt(x, z) {
    const gx = clamp((x + HALF) / SCELL, 0, SG - 0.001), gz = clamp((z + HALF) / SCELL, 0, SG - 0.001);
    const i = Math.floor(gx), j = Math.floor(gz), fx = gx - i, fz = gz - j;
    const n = this.hN, k = j * n + i;
    const b = this.base, m = this.mound;
    const h00 = b[k] + m[k], h10 = b[k + 1] + m[k + 1], h01 = b[k + n] + m[k + n], h11 = b[k + n + 1] + m[k + n + 1];
    return (h00 * (1 - fx) + h10 * fx) * (1 - fz) + (h01 * (1 - fx) + h11 * fx) * fz;
  }

  moundAt(x, z) {
    const i = clamp(Math.round((x + HALF) / SCELL), 0, SG), j = clamp(Math.round((z + HALF) / SCELL), 0, SG);
    return this.mound[j * this.hN + i];
  }

  isWater(x, z) { return this.water[this.cellIdx(x, z)] === 1; }

  deposit(f, x, z, a) {
    const k = this.cellIdx(x, z), A = this.fields[f];
    const v = A[k] + a;
    A[k] = v > 40 ? 40 : v;
  }

  sample(f, x, z) { return this.fields[f][this.cellIdx(x, z)]; }

  // Soil pellets carried out of the nest build the mound.
  addMound(x, z, amount, sigma = 1.6) {
    const n = this.hN;
    const ci = Math.round((x + HALF) / SCELL), cj = Math.round((z + HALF) / SCELL);
    const R = Math.ceil((sigma * 2.5) / SCELL);
    for (let j = cj - R; j <= cj + R; j++) {
      if (j < 0 || j >= n) continue;
      for (let i = ci - R; i <= ci + R; i++) {
        if (i < 0 || i >= n) continue;
        const dx = (i - ci) * SCELL, dz = (j - cj) * SCELL;
        const g = Math.exp(-(dx * dx + dz * dz) / (2 * sigma * sigma));
        const k = j * n + i;
        this.mound[k] += amount * g * Math.max(0, 1 - this.mound[k] / 3.2);
      }
    }
    this.moundVersion++;
  }

  step(dt, env) {
    this.acc += dt;
    if (this.acc < 0.25) return;
    const t = this.acc;
    this.acc = 0;
    const heat = 1 + Math.max(0, env.temp - 25) * 0.06;
    for (let f = 0; f < NF; f++) {
      const factor = Math.exp(-(DECAY[f] * heat + WASH[f] * env.rain * env.rain) * t);
      const A = this.fields[f];
      if (DIFF[f] > 0) this.diffuse(A, Math.min(0.2, DIFF[f] * t * 4), factor, f);
      else {
        let s = 0;
        for (let k = 0; k < A.length; k++) { const v = A[k] * factor; A[k] = v; s += v; }
        this.totals[f] = s;
      }
    }
  }

  diffuse(A, d, factor, f) {
    const N = SG, T = this.tmp;
    let s = 0;
    for (let j = 1; j < N - 1; j++) {
      const row = j * N;
      for (let i = 1; i < N - 1; i++) {
        const k = row + i, c = A[k];
        const v = (c + d * (A[k - 1] + A[k + 1] + A[k - N] + A[k + N] - 4 * c)) * factor;
        T[k] = v < 1e-4 ? 0 : v;
        s += T[k];
      }
    }
    A.set(T);
    this.totals[f] = s;
  }
}
