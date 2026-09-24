import * as THREE from 'three';
import { makeNoise, mulberry32 } from '../sim/rng.js';

const noise = makeNoise(777);

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

// Leaf-litter forest floor, tiled.
export function groundTexture() {
  const S = 512, c = canvas(S, S), g = c.getContext('2d');
  const rnd = mulberry32(5);
  const img = g.createImageData(S, S);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      // tileable noise via torus sampling
      const a = (x / S) * Math.PI * 2, b = (y / S) * Math.PI * 2;
      const n = noise.fbm(Math.cos(a) * 3 + 10, Math.sin(a) * 3 + Math.cos(b) * 3, 4) * 0.5 + noise.fbm(Math.sin(b) * 3 + 40, Math.cos(a) * 2, 3) * 0.5;
      const k = (y * S + x) * 4;
      const v = 0.5 + n * 0.8;
      img.data[k] = 92 * v + 20; img.data[k + 1] = 70 * v + 14; img.data[k + 2] = 44 * v + 8; img.data[k + 3] = 255;
    }
  g.putImageData(img, 0, 0);
  const leafCols = ['#7a5230', '#8c6236', '#5f4026', '#a0703c', '#6b4a2a', '#94763f', '#51472a', '#7d6a35'];
  for (let i = 0; i < 520; i++) {
    const x = rnd() * S, y = rnd() * S, r = 5 + rnd() * 16, ang = rnd() * Math.PI;
    for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
      if (x + ox < -30 || x + ox > S + 30 || y + oy < -30 || y + oy > S + 30) continue;
      g.save();
      g.translate(x + ox, y + oy); g.rotate(ang);
      g.fillStyle = leafCols[(rnd() * leafCols.length) | 0];
      g.globalAlpha = 0.55 + rnd() * 0.4;
      g.beginPath(); g.ellipse(0, 0, r, r * 0.42, 0, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(40,25,12,0.5)'; g.lineWidth = 0.8;
      g.beginPath(); g.moveTo(-r, 0); g.lineTo(r, 0); g.stroke();
      g.restore();
    }
  }
  g.globalAlpha = 0.6;
  for (let i = 0; i < 80; i++) {
    g.strokeStyle = rnd() < 0.5 ? '#3d2a18' : '#5a4228';
    g.lineWidth = 1 + rnd() * 2;
    const x = rnd() * S, y = rnd() * S, a = rnd() * 6.28, l = 10 + rnd() * 40;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// Cross-section of soil strata for the cutaway, in world coordinates.
export const SLICE = { x0: -64, x1: 64, y0: -48, y1: 3, ppu: 12 };

export function soilSliceCanvas() {
  const W = (SLICE.x1 - SLICE.x0) * SLICE.ppu, H = (SLICE.y1 - SLICE.y0) * SLICE.ppu;
  const c = canvas(W, H), g = c.getContext('2d');
  const img = g.createImageData(W, H);
  const d = img.data;
  const rnd = mulberry32(9);
  for (let py = 0; py < H; py++) {
    const wy = SLICE.y1 - py / SLICE.ppu;
    const depth = -wy;
    for (let px = 0; px < W; px++) {
      const wx = SLICE.x0 + px / SLICE.ppu;
      const n = noise.fbm(wx * 0.18, wy * 0.18, 4);
      const fine = noise.n2(wx * 2.2, wy * 2.2) * 0.5 + (rnd() - 0.5) * 0.35;
      const band = Math.sin(depth * 0.9 + n * 3) * 0.5 + 0.5;
      let r, gg, b;
      if (depth < 1.6 + n * 0.8) { r = 52; gg = 38; b = 26; }            // humus
      else if (depth < 9 + n * 2) { r = 96; gg = 62; b = 38; }           // topsoil
      else if (depth < 26 + n * 3) { r = 128; gg = 72; b = 42; }         // red clay (oxisol)
      else { r = 150; gg = 98; b = 60; }                                  // deep saprolite
      const v = (0.62 + n * 0.22 + fine * 0.1 + band * 0.05) * (1 - Math.min(0.35, depth * 0.008));
      const k = (py * W + px) * 4;
      d[k] = r * v; d[k + 1] = gg * v; d[k + 2] = b * v; d[k + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  // pebbles
  for (let i = 0; i < 700; i++) {
    const x = rnd() * W, y = rnd() * H * 0.95 + H * 0.05, r = 0.6 + rnd() * rnd() * 3;
    g.fillStyle = `rgba(${120 + rnd() * 50},${100 + rnd() * 40},${80 + rnd() * 30},${0.2 + rnd() * 0.35})`;
    g.beginPath(); g.ellipse(x, y, r * 1.3, r, rnd() * 3, 0, Math.PI * 2); g.fill();
  }
  // roots near the surface
  const surfPy = SLICE.y1 * SLICE.ppu;
  for (let i = 0; i < 60; i++) {
    let x = rnd() * W, y = surfPy + rnd() * 20;
    g.strokeStyle = `rgba(${70 + rnd() * 40},${48 + rnd() * 20},${30},0.75)`;
    g.lineWidth = 0.6 + rnd() * 2.2;
    g.beginPath(); g.moveTo(x, y);
    const len = 20 + rnd() * 120;
    for (let s = 0; s < len; s += 6) {
      x += (rnd() - 0.5) * 9; y += 3 + rnd() * 5;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  // bottom fade into darkness
  const grad = g.createLinearGradient(0, H - 70, 0, H);
  grad.addColorStop(0, 'rgba(10,6,4,0)');
  grad.addColorStop(1, 'rgba(10,6,4,0.9)');
  g.fillStyle = grad;
  g.fillRect(0, H - 70, W, 70);
  return c;
}

export function waterNormalTexture() {
  const S = 256, c = canvas(S, S), g = c.getContext('2d');
  const img = g.createImageData(S, S);
  const h = (x, y) => {
    const a = (x / S) * Math.PI * 2, b = (y / S) * Math.PI * 2;
    return noise.fbm(Math.cos(a) * 2 + 5, Math.sin(a) * 2 + Math.cos(b) * 2 + Math.sin(b), 3);
  };
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const dx = h(x + 1, y) - h(x - 1, y), dy = h(x, y + 1) - h(x, y - 1);
      const nx = -dx * 6, ny = -dy * 6, nz = 1, l = Math.hypot(nx, ny, nz);
      const k = (y * S + x) * 4;
      img.data[k] = ((nx / l) * 0.5 + 0.5) * 255; img.data[k + 1] = ((ny / l) * 0.5 + 0.5) * 255; img.data[k + 2] = ((nz / l) * 0.5 + 0.5) * 255; img.data[k + 3] = 255;
    }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export function barkTexture() {
  const W = 128, H = 512, c = canvas(W, H), g = c.getContext('2d');
  const img = g.createImageData(W, H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const a = (x / W) * Math.PI * 2;
      const n = noise.fbm(Math.cos(a) * 1.5 + 3, y * 0.02 + Math.sin(a) * 1.5, 4);
      const ridge = Math.abs(noise.n2(Math.cos(a) * 4, y * 0.01 + Math.sin(a) * 4));
      const v = 0.6 + n * 0.5 + ridge * 0.4;
      const k = (y * W + x) * 4;
      img.data[k] = 88 * v; img.data[k + 1] = 76 * v; img.data[k + 2] = 60 * v; img.data[k + 3] = 255;
    }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
