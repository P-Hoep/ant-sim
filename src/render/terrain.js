import * as THREE from 'three';
import { SG, SCELL, HALF } from '../sim/constants.js';
import { F } from '../sim/surface.js';
import { SPECIES } from '../sim/vegetation.js';
import { groundTexture } from './textures.js';

export class Terrain {
  constructor(sim, clip) {
    this.sim = sim;
    const n = SG + 1;
    const pos = new Float32Array(n * n * 3), col = new Float32Array(n * n * 3), uv = new Float32Array(n * n * 2);
    const noise = sim.noise;
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++) {
        const k = j * n + i, x = -HALF + i * SCELL, z = -HALF + j * SCELL;
        pos[k * 3] = x; pos[k * 3 + 2] = z;
        uv[k * 2] = i / SG; uv[k * 2 + 1] = j / SG;
        const m = noise.fbm(x * 0.05 + 100, z * 0.05, 3);
        const moss = THREE.MathUtils.clamp(m * 1.5 + 0.2, 0, 1);
        const wet = Math.max(0, 1 - Math.abs(x - sim.surface.streamX(z)) / 5);
        const c = new THREE.Color(0.95, 0.9, 0.82).lerp(new THREE.Color(0.62, 0.78, 0.42), moss * 0.55).multiplyScalar(1 - wet * 0.35);
        col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b;
      }
    const idx = new Uint32Array(SG * SG * 6);
    let t = 0;
    for (let j = 0; j < SG; j++)
      for (let i = 0; i < SG; i++) {
        const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
        idx[t++] = a; idx[t++] = c; idx[t++] = b;
        idx[t++] = b; idx[t++] = c; idx[t++] = d;
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    this.geo = g;
    this.updateHeights();

    this.groundData = new Uint8Array(SG * SG * 4);
    this.groundTex = new THREE.DataTexture(this.groundData, SG, SG, THREE.RGBAFormat);
    this.groundTex.magFilter = THREE.LinearFilter; this.groundTex.minFilter = THREE.LinearFilter;
    this.overlayData = new Uint8Array(SG * SG * 4);
    this.overlayTex = new THREE.DataTexture(this.overlayData, SG, SG, THREE.RGBAFormat);
    this.overlayTex.magFilter = THREE.LinearFilter; this.overlayTex.minFilter = THREE.LinearFilter;

    const map = groundTexture();
    map.repeat.set(22, 22);
    const mat = new THREE.MeshStandardMaterial({ map, vertexColors: true, roughness: 0.95, metalness: 0, clippingPlanes: clip });
    this.uniforms = {
      uGround: { value: this.groundTex }, uOverlay: { value: this.overlayTex }, uWet: { value: 0 },
      uBare: { value: new THREE.Color(0.47, 0.3, 0.19) }, uOverlayOn: { value: 0 },
    };
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.uniforms);
      sh.vertexShader = 'varying vec2 vWUv;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>\n vWUv = vec2((position.x + ${HALF.toFixed(1)}) / ${(HALF * 2).toFixed(1)}, (position.z + ${HALF.toFixed(1)}) / ${(HALF * 2).toFixed(1)});`);
      sh.fragmentShader = 'varying vec2 vWUv;\nuniform sampler2D uGround;\nuniform sampler2D uOverlay;\nuniform float uWet;\nuniform float uOverlayOn;\nuniform vec3 uBare;\n' +
        sh.fragmentShader
          .replace('#include <color_fragment>', `#include <color_fragment>
            vec4 gd = texture2D(uGround, vWUv);
            float bare = clamp(max(gd.r * 1.4, gd.g), 0.0, 1.0);
            vec3 bareCol = uBare * (0.12 + 1.05 * gd.b) * mix(1.0, 0.85, gd.r);
            diffuseColor.rgb = mix(diffuseColor.rgb, bareCol, bare);
            diffuseColor.rgb *= mix(1.0, 0.62, uWet);
            vec4 ov = texture2D(uOverlay, vWUv) * uOverlayOn;
            diffuseColor.rgb = mix(diffuseColor.rgb, ov.rgb, ov.a * 0.8);
            totalEmissiveRadiance += ov.rgb * ov.a * 0.55;`)
          .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
            roughnessFactor *= mix(1.0, 0.45, uWet);`);
    };
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.receiveShadow = true;
    this.moundVersion = sim.surface.moundVersion;
    this.acc = { h: 0, g: 0, o: 0 };
    this.updateGround();
  }

  updateHeights() {
    const s = this.sim.surface, p = this.geo.attributes.position.array;
    const n = SG + 1;
    for (let k = 0; k < n * n; k++) p[k * 3 + 1] = s.base[k] + s.mound[k];
    this.geo.attributes.position.needsUpdate = true;
    this.geo.computeVertexNormals();
    this.geo.computeBoundingSphere();
  }

  updateGround() {
    const s = this.sim.surface, d = this.groundData;
    const tr = s.fields[F.TRAFFIC];
    const n = SG + 1;
    for (let j = 0; j < SG; j++)
      for (let i = 0; i < SG; i++) {
        const k = j * SG + i;
        const m = s.mound[j * n + i];
        d[k * 4] = Math.min(255, Math.sqrt(tr[k]) * 120);
        d[k * 4 + 1] = Math.min(255, m * 700);
        d[k * 4 + 2] = 128 + ((i * 7 + j * 13) % 17) * 4;
        d[k * 4 + 3] = 255;
      }
    // entrances: dark holes
    for (const e of this.sim.nest.entrances) this.stamp(d, e.wx, 0, 0.6 + (e.x1 - e.x0) * 0.2, 0, 0, 0, true);
    const r = this.sim.rivals[0];
    if (r && r.alive) for (const [dx, dz] of [[0, 0], [2.2, 1.4], [-1.8, 2]]) this.stamp(d, r.nestX + dx, r.nestZ + dz, 0.6, 0, 0, 0, true);
    this.groundTex.needsUpdate = true;
  }

  stamp(d, x, z, r, rr, gg, bb, hole) {
    const ci = (x + HALF) / SCELL, cj = (z + HALF) / SCELL, R = r / SCELL;
    for (let j = Math.floor(cj - R); j <= cj + R; j++)
      for (let i = Math.floor(ci - R); i <= ci + R; i++) {
        if (i < 0 || j < 0 || i >= SG || j >= SG) continue;
        if ((i - ci) ** 2 + (j - cj) ** 2 > R * R) continue;
        const k = (j * SG + i) * 4;
        if (hole) { d[k] = 255; d[k + 1] = 255; d[k + 2] = 0; }
      }
  }

  updateOverlay(mode) {
    const s = this.sim.surface, d = this.overlayData;
    d.fill(0);
    this.uniforms.uOverlayOn.value = mode ? 1 : 0;
    if (!mode) { this.overlayTex.needsUpdate = true; return; }
    const N = SG * SG;
    const put = (k, r, g, b, a) => { d[k * 4] = r; d[k * 4 + 1] = g; d[k * 4 + 2] = b; d[k * 4 + 3] = Math.min(255, a); };
    if (mode === 'pheromones') {
      const f0 = s.fields[F.FOOD0], h0 = s.fields[F.HOME0], al = s.fields[F.ALARM], f1 = s.fields[F.FOOD1];
      for (let k = 0; k < N; k++) {
        const a = f0[k] * 0.5, b = h0[k] * 0.05, c = al[k] * 1.2, e = f1[k] * 0.5;
        const tot = a + b + c + e;
        if (tot < 0.03) continue;
        put(k, Math.min(255, (c * 255 + e * 250 + a * 80) / tot), Math.min(255, (a * 255 + e * 150 + b * 110) / tot), Math.min(255, (b * 255 + a * 60) / tot), Math.min(1, Math.sqrt(tot) * 0.9) * (b > a + c + e ? 90 : 230));
      }
    } else if (mode === 'territory') {
      const t0 = s.fields[F.TERR0], t1 = s.fields[F.TERR1];
      for (let k = 0; k < N; k++) {
        const a = t0[k], b = t1[k];
        if (a + b < 0.05) continue;
        put(k, (b * 230 + a * 40) / (a + b), (a * 200 + b * 60) / (a + b), (a * 190 + b * 230) / (a + b), Math.sqrt(a + b) * 90);
      }
    } else if (mode === 'traffic') {
      const t = s.fields[F.TRAFFIC];
      for (let k = 0; k < N; k++) {
        const v = Math.sqrt(t[k]) * 0.6;
        if (v < 0.03) continue;
        const c = heat(Math.min(1, v));
        put(k, c[0], c[1], c[2], 60 + v * 200);
      }
    } else if (mode === 'food') {
      for (const p of this.sim.veg.plants) {
        if (!p.alive) continue;
        const f = p.biomass / p.max, q = SPECIES[p.sp];
        const R = p.r + 0.8;
        const ci = (p.x + HALF) / SCELL, cj = (p.z + HALF) / SCELL, Rc = R / SCELL;
        const rej = this.sim.colony.reject[p.sp];
        for (let j = Math.floor(cj - Rc); j <= cj + Rc; j++)
          for (let i = Math.floor(ci - Rc); i <= ci + Rc; i++) {
            if (i < 0 || j < 0 || i >= SG || j >= SG || (i - ci) ** 2 + (j - cj) ** 2 > Rc * Rc) continue;
            const k = j * SG + i;
            if (rej > 0.5) put(k, 200, 60, 200, 200);
            else put(k, 255 * (1 - f), 120 + 135 * f * q.quality, 40, 210);
          }
      }
    } else if (mode === 'temperature') {
      const T = this.sim.env.temp;
      for (let k = 0; k < N; k++) {
        const shade = s.fields[F.TRAFFIC][k] > 0.5 ? 0.4 : 0;
        const c = tempColor(T + shade + ((k * 31) % 7) * 0.05);
        put(k, c[0], c[1], c[2], 150);
      }
    } else if (mode === 'humidity') {
      const H = this.sim.env.hum;
      for (let k = 0; k < N; k++) {
        const w = s.water[k] ? 1 : H;
        put(k, 110 * (1 - w), 150 + 60 * w, 120 + 135 * w, 150);
      }
    } else {
      this.uniforms.uOverlayOn.value = 0;
    }
    this.overlayTex.needsUpdate = true;
  }

  update(dt, overlay) {
    const a = this.acc;
    a.h += dt; a.g += dt; a.o += dt;
    if (a.h > 2 && this.moundVersion !== this.sim.surface.moundVersion) { this.updateHeights(); this.moundVersion = this.sim.surface.moundVersion; a.h = 0; }
    if (a.g > 0.5) { this.updateGround(); a.g = 0; }
    if (a.o > 0.25) { this.updateOverlay(overlay); a.o = 0; }
    const env = this.sim.env;
    this.uniforms.uWet.value += (Math.min(1, env.rain * 1.4 + (env.soilMoisture > 0.85 ? 0.2 : 0)) - this.uniforms.uWet.value) * Math.min(1, dt * 0.5);
  }
}

export function heat(v) {
  const stops = [[20, 20, 90], [40, 120, 220], [60, 220, 120], [250, 220, 60], [255, 70, 40]];
  const x = Math.max(0, Math.min(0.999, v)) * (stops.length - 1), i = Math.floor(x), f = x - i;
  return stops[i].map((c, k) => c + (stops[i + 1][k] - c) * f);
}
export function tempColor(T) {
  return heat((T - 14) / 24);
}
