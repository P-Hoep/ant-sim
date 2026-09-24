export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class RNG {
  constructor(seed = 1) {
    this.f = mulberry32(seed);
  }
  next() { return this.f(); }
  range(a, b) { return a + (b - a) * this.f(); }
  int(n) { return Math.floor(this.f() * n); }
  chance(p) { return this.f() < p; }
  pick(arr) { return arr[Math.floor(this.f() * arr.length)]; }
  gauss() {
    const u = Math.max(1e-9, this.f());
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * this.f());
  }
}

export function makeNoise(seed) {
  const rnd = mulberry32(seed);
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  const P = new Uint8Array(512);
  for (let i = 0; i < 512; i++) P[i] = p[i & 255];
  const G = new Float32Array(256).map(() => rnd() * 2 - 1);

  function n2(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const X = xi & 255, Y = yi & 255;
    const a = G[P[P[X] + Y]], b = G[P[P[X + 1] + Y]];
    const c = G[P[P[X] + Y + 1]], d = G[P[P[X + 1] + Y + 1]];
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function fbm(x, y, oct = 4) {
    let s = 0, amp = 0.5, f = 1, norm = 0;
    for (let i = 0; i < oct; i++) {
      s += amp * n2(x * f + i * 17.3, y * f - i * 9.1);
      norm += amp;
      amp *= 0.5;
      f *= 2.03;
    }
    return s / norm;
  }
  return { n2, fbm };
}
