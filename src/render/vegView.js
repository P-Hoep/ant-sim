import * as THREE from 'three';
import { HALF, BRIDGE_Z } from '../sim/constants.js';
import { F } from '../sim/surface.js';
import { SPECIES } from '../sim/vegetation.js';
import { mulberry32 } from '../sim/rng.js';
import { blobGeometry, leafShapeGeometry, bladeGeometry } from './geometry.js';
import { barkTexture, waterNormalTexture } from './textures.js';

const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), V = new THREE.Vector3(), S = new THREE.Vector3(), C = new THREE.Color();

function windMaterial(base, uniforms, amp) {
  const m = new THREE.MeshStandardMaterial(base);
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uniforms.uTime;
    sh.uniforms.uWind = uniforms.uWind;
    sh.vertexShader = 'uniform float uTime;\nuniform float uWind;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      #ifdef USE_INSTANCING
      vec4 wp = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
      float hh = clamp(position.y, 0.0, 1.0);
      float sway = sin(uTime * 1.7 + wp.x * 0.35 + wp.z * 0.27) + 0.5 * sin(uTime * 3.1 + wp.z * 0.9);
      transformed.x += sway * ${amp.toFixed(3)} * hh * hh * uWind;
      transformed.z += cos(uTime * 1.3 + wp.x * 0.3) * ${(amp * 0.5).toFixed(3)} * hh * hh * uWind;
      #endif`);
  };
  return m;
}

class Batch {
  constructor(geo, mat, max, shadow = true) {
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.castShadow = shadow;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    this.max = max;
    this.n = 0;
    this.mesh.setColorAt(0, new THREE.Color(1, 1, 1));
  }
  add(matrix, color) {
    if (this.n >= this.max) return;
    this.mesh.setMatrixAt(this.n, matrix);
    this.mesh.setColorAt(this.n, color);
    this.n++;
  }
  done() {
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

export class VegetationView {
  constructor(sim, clip) {
    this.sim = sim;
    this.group = new THREE.Group();
    this.uniforms = { uTime: { value: 0 }, uWind: { value: 0.3 } };
    const bark = barkTexture();
    const barkMat = new THREE.MeshStandardMaterial({ map: bark, roughness: 0.9, clippingPlanes: clip });
    const foliage = windMaterial({ roughness: 0.62, metalness: 0, clippingPlanes: clip, flatShading: false }, this.uniforms, 0.05);
    const leafMat = windMaterial({ roughness: 0.5, side: THREE.DoubleSide, clippingPlanes: clip }, this.uniforms, 0.12);
    const bladeMat = windMaterial({ roughness: 0.7, side: THREE.DoubleSide, clippingPlanes: clip }, this.uniforms, 0.18);
    const trunkGeo = new THREE.CylinderGeometry(0.6, 1, 1, 9, 1); trunkGeo.translate(0, 0.5, 0);
    this.trunks = new Batch(trunkGeo, barkMat, 500);
    this.blobs = new Batch(blobGeometry(1, 0.22), foliage, 3500);
    this.leaves = new Batch(leafShapeGeometry(true), leafMat, 7000);
    this.blades = new Batch(bladeGeometry(), bladeMat, 4000, false);
    const cone = new THREE.ConeGeometry(0.5, 1, 6); cone.translate(0, 0.5, 0);
    this.bracts = new Batch(cone, new THREE.MeshStandardMaterial({ roughness: 0.4, clippingPlanes: clip, emissive: 0x220500 }), 300);
    for (const b of [this.trunks, this.blobs, this.leaves, this.blades, this.bracts]) this.group.add(b.mesh);

    // decorative ground cover
    this.grass = new Batch(bladeGeometry(), bladeMat, 16000, false);
    this.litter = new Batch(leafShapeGeometry(false), new THREE.MeshStandardMaterial({ roughness: 0.85, side: THREE.DoubleSide, clippingPlanes: clip }), 5000, false);
    this.group.add(this.grass.mesh, this.litter.mesh);
    this.decor = [];
    this.buildDecor(clip, bark);
    this.buildStatic(clip, bark);
    this.version = -1;
    this.acc = { plants: 0, decor: 0 };
    this.rebuildPlants();
    this.updateDecor();
  }

  buildDecor() {
    const sim = this.sim, surf = sim.surface, rnd = mulberry32(sim.seed + 3);
    const items = [];
    for (let k = 0; k < 16000; k++) {
      const x = (rnd() - 0.5) * 2 * (HALF - 1), z = (rnd() - 0.5) * 2 * (HALF - 1);
      if (surf.isWater(x, z) || Math.hypot(x, z) < 5) continue;
      const dens = sim.noise.fbm(x * 0.07 + 7, z * 0.07, 3);
      if (dens < -0.1 + rnd() * 0.3) continue;
      items.push({ type: 'g', x, z, r: rnd() * 6.28, s: 0.35 + rnd() * 0.7, lean: (rnd() - 0.5) * 0.6, c: rnd() });
    }
    for (let k = 0; k < 5000; k++) {
      const x = (rnd() - 0.5) * 2 * (HALF - 1), z = (rnd() - 0.5) * 2 * (HALF - 1);
      if (surf.isWater(x, z)) continue;
      items.push({ type: 'l', x, z, r: rnd() * 6.28, s: 0.25 + rnd() * 0.5, c: rnd(), tilt: (rnd() - 0.5) * 0.4 });
    }
    this.decor = items;
  }

  updateDecor() {
    const sim = this.sim, surf = sim.surface, tr = surf.fields[F.TRAFFIC];
    this.grass.n = 0; this.litter.n = 0;
    const litCols = [0x7a5230, 0x8e6534, 0x5f4228, 0xa5793f, 0x6d5a2f, 0x9b5a2c];
    for (const d of this.decor) {
      const k = surf.cellIdx(d.x, d.z);
      const trail = Math.min(1, Math.sqrt(tr[k]) * 0.9 + surf.moundAt(d.x, d.z) * 6);
      if (trail > 0.85) continue; // ants clear their trails of litter and vegetation
      const h = surf.heightAt(d.x, d.z);
      if (d.type === 'g') {
        E.set(d.lean, d.r, 0);
        Q.setFromEuler(E);
        S.set(d.s, d.s * (1 - trail) * 0.9, d.s);
        M.compose(V.set(d.x, h, d.z), Q, S);
        C.setHSL(0.22 + d.c * 0.08, 0.45, 0.22 + d.c * 0.12);
        this.grass.add(M, C);
      } else {
        E.set(-Math.PI / 2 + d.tilt, 0, d.r);
        Q.setFromEuler(E);
        S.setScalar(d.s * (1 - trail * 0.6));
        M.compose(V.set(d.x, h + 0.02, d.z), Q, S);
        C.set(litCols[Math.floor(d.c * litCols.length)]).multiplyScalar(0.8 + d.c * 0.3);
        this.litter.add(M, C);
      }
    }
    this.grass.done(); this.litter.done();
  }

  buildStatic(clip, bark) {
    const sim = this.sim, surf = sim.surface, rnd = mulberry32(sim.seed + 11);
    // rocks
    const rockGeo = blobGeometry(1, 0.35);
    const rocks = new Batch(rockGeo, new THREE.MeshStandardMaterial({ roughness: 0.85, clippingPlanes: clip }), 120);
    for (let k = 0; k < 90; k++) {
      const x = (rnd() - 0.5) * 120, z = (rnd() - 0.5) * 120;
      if (Math.hypot(x, z) < 8) continue;
      const s = 0.3 + rnd() * rnd() * 2.2;
      E.set(rnd() * 3, rnd() * 3, rnd() * 3); Q.setFromEuler(E);
      M.compose(V.set(x, surf.heightAt(x, z) - s * 0.3, z), Q, S.set(s * (1 + rnd() * 0.5), s * 0.7, s));
      C.setHSL(0.08, 0.1 + rnd() * 0.1, 0.3 + rnd() * 0.15);
      rocks.add(M, C);
    }
    rocks.done();
    // mushrooms
    const capGeo = new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2);
    const stemGeo = new THREE.CylinderGeometry(0.12, 0.16, 1, 6); stemGeo.translate(0, 0.5, 0);
    const caps = new Batch(capGeo, new THREE.MeshStandardMaterial({ roughness: 0.6, clippingPlanes: clip }), 80);
    const stems = new Batch(stemGeo, new THREE.MeshStandardMaterial({ color: 0xe8dcc0, roughness: 0.7, clippingPlanes: clip }), 80);
    for (let k = 0; k < 70; k++) {
      const x = (rnd() - 0.5) * 120, z = (rnd() - 0.5) * 120;
      if (surf.isWater(x, z) || Math.hypot(x, z) < 8) continue;
      const s = 0.12 + rnd() * 0.25, h = surf.heightAt(x, z);
      M.compose(V.set(x, h, z), Q.identity(), S.set(s, s * 2.2, s));
      stems.add(M, C.set(0xffffff));
      M.compose(V.set(x, h + s * 2.1, z), Q.identity(), S.set(s * 2.4, s * 1.4, s * 2.4));
      C.set(rnd() < 0.3 ? 0xc2562e : rnd() < 0.5 ? 0xe7d8b8 : 0x9a6a3a);
      caps.add(M, C);
    }
    caps.done(); stems.done();
    this.group.add(rocks.mesh, caps.mesh, stems.mesh);

    // stream
    const pts = [], idx = [];
    const seg = 160;
    for (let s = 0; s <= seg; s++) {
      const z = -HALF + (s / seg) * HALF * 2;
      const cx = surf.streamX(z);
      let lvl = Infinity;
      for (const dx of [-2.6, 2.6]) lvl = Math.min(lvl, surf.heightAt(cx + dx, z));
      const y = Math.min(lvl - 0.15, surf.heightAt(cx, z) + 0.9);
      pts.push(cx - 2.9, y, z, cx + 2.9, y, z);
      if (s < seg) { const a = s * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    }
    const wg = new THREE.BufferGeometry();
    wg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const uvs = [];
    for (let s = 0; s <= seg; s++) uvs.push(0, s / 8, 1, s / 8);
    wg.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    wg.setIndex(idx);
    wg.computeVertexNormals();
    this.waterNormal = waterNormalTexture();
    this.waterNormal.repeat.set(1, 1);
    const wm = new THREE.MeshPhysicalMaterial({ color: 0x1f3b36, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.82, normalMap: this.waterNormal, normalScale: new THREE.Vector2(0.6, 0.6), clearcoat: 1, clippingPlanes: clip });
    const water = new THREE.Mesh(wg, wm);
    water.receiveShadow = true;
    this.group.add(water);
    // fallen log bridge
    const bx = surf.streamX(BRIDGE_Z);
    const lg = new THREE.CylinderGeometry(0.55, 0.65, 11, 12, 1);
    lg.rotateZ(Math.PI / 2);
    const log = new THREE.Mesh(lg, new THREE.MeshStandardMaterial({ map: bark, color: 0x9a8a70, roughness: 0.95, clippingPlanes: clip }));
    log.position.set(bx, Math.max(surf.heightAt(bx - 4, BRIDGE_Z), surf.heightAt(bx + 4, BRIDGE_Z)) + 0.1, BRIDGE_Z);
    log.castShadow = true; log.receiveShadow = true;
    this.bridgeY = log.position.y + 0.55;
    this.group.add(log);
    const moss = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 6), new THREE.MeshStandardMaterial({ color: 0x4f7a2e, roughness: 1, clippingPlanes: clip }));
    moss.scale.set(2.5, 0.25, 0.5); moss.position.set(bx - 1, log.position.y + 0.45, BRIDGE_Z);
    this.group.add(moss);
  }

  rebuildPlants() {
    const sim = this.sim, surf = sim.surface;
    for (const b of [this.trunks, this.blobs, this.leaves, this.blades, this.bracts]) b.n = 0;
    for (const p of sim.veg.plants) {
      if (!p.alive) continue;
      const Sp = SPECIES[p.sp];
      const rnd = mulberry32(Math.floor(p.seed * 1e9));
      const frac = Math.max(0, p.biomass / p.max);
      const k = 0.2 + 0.8 * Math.sqrt(frac);
      const h0 = surf.heightAt(p.x, p.z);
      const base = new THREE.Color(Sp.color);
      const R = p.r;
      if (Sp.kind === 'bush') {
        M.compose(V.set(p.x, h0, p.z), Q.identity(), S.set(0.07, R * 0.7, 0.07));
        this.trunks.add(M, C.set(0x6b5a44));
        const nb = 5 + Math.floor(rnd() * 4);
        for (let i = 0; i < nb; i++) {
          const a = rnd() * 6.28, d = R * 0.45 * rnd();
          const r = R * (0.38 + 0.2 * rnd()) * k;
          M.compose(V.set(p.x + Math.cos(a) * d, h0 + R * (0.5 + 0.3 * rnd()) * (0.5 + 0.5 * k), p.z + Math.sin(a) * d), Q.identity(), S.set(r, r * 0.8, r));
          C.copy(base).multiplyScalar(0.7 + 0.35 * rnd());
          this.blobs.add(M, C);
        }
        const nl = Math.floor(18 * k);
        for (let i = 0; i < nl; i++) {
          const a = rnd() * 6.28, el = rnd() * 1.1;
          const d = R * (0.6 + 0.25 * rnd()) * (0.5 + 0.5 * k);
          E.set(0.55 + el * 0.6, -a + Math.PI / 2, 0, 'YXZ');
          Q.setFromEuler(E);
          const s = R * 0.5 * (0.7 + 0.5 * rnd());
          M.compose(V.set(p.x + Math.cos(a) * d * Math.cos(el * 0.7), h0 + R * 0.55 + Math.sin(el) * R * 0.4 * k, p.z + Math.sin(a) * d * Math.cos(el * 0.7)), Q, S.set(s, s, s));
          C.copy(base).multiplyScalar(0.85 + 0.3 * rnd());
          this.leaves.add(M, C);
        }
      } else if (Sp.kind === 'sapling') {
        const H = 3.2 + rnd() * 1.8;
        M.compose(V.set(p.x, h0, p.z), Q.identity(), S.set(0.13, H, 0.13));
        this.trunks.add(M, C.set(0xa8a090));
        const nl = Math.max(2, Math.round(9 * k));
        for (let i = 0; i < nl; i++) {
          const a = (i / nl) * 6.28 + rnd() * 0.3;
          E.set(1.05 + rnd() * 0.5, -a + Math.PI / 2, 0, 'YXZ');
          Q.setFromEuler(E);
          const s = 1.5 * (0.8 + 0.3 * rnd());
          M.compose(V.set(p.x + Math.cos(a) * 0.1, h0 + H - rnd() * 0.3, p.z + Math.sin(a) * 0.1), Q, S.set(s, s, s));
          C.copy(base).multiplyScalar(0.9 + 0.25 * rnd());
          this.leaves.add(M, C);
        }
      } else if (Sp.kind === 'herb') {
        const nl = Math.max(2, Math.round(7 * k));
        for (let i = 0; i < nl; i++) {
          const a = rnd() * 6.28;
          E.set(0.25 + rnd() * 0.4, -a + Math.PI / 2, 0, 'YXZ');
          Q.setFromEuler(E);
          M.compose(V.set(p.x, h0, p.z), Q, S.set(0.9, 2.6 * (0.7 + 0.3 * k), 0.9));
          C.copy(base).multiplyScalar(0.85 + 0.3 * rnd());
          this.leaves.add(M, C);
        }
        for (let i = 0; i < 3; i++) {
          const a = rnd() * 6.28;
          E.set(0.5, a, 0.3); Q.setFromEuler(E);
          M.compose(V.set(p.x + Math.cos(a) * 0.2, h0 + 1.3 + i * 0.25, p.z + Math.sin(a) * 0.2), Q, S.set(0.14, 0.4, 0.14));
          this.bracts.add(M, C.set(i % 2 ? 0xd8382a : 0xf0b030));
        }
      } else if (Sp.kind === 'grass') {
        const nb = Math.round(30 * (0.3 + 0.7 * k));
        for (let i = 0; i < nb; i++) {
          const a = rnd() * 6.28, d = R * 0.55 * Math.sqrt(rnd());
          E.set((rnd() - 0.5) * 0.7, rnd() * 6.28, (rnd() - 0.5) * 0.7); Q.setFromEuler(E);
          const s = (0.8 + rnd() * 0.9) * k;
          M.compose(V.set(p.x + Math.cos(a) * d, h0, p.z + Math.sin(a) * d), Q, S.set(1.4, s * 1.4, 1.4));
          C.copy(base).multiplyScalar(0.75 + 0.35 * rnd());
          this.blades.add(M, C);
        }
      } else if (Sp.kind === 'tree') {
        const H = 20 + rnd() * 6;
        M.compose(V.set(p.x, h0 - 0.5, p.z), Q.identity(), S.set(1.0, H, 1.0));
        this.trunks.add(M, C.set(0xb0a38a));
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * 6.28 + rnd();
          E.set(0, a, 0); Q.setFromEuler(E);
          M.compose(V.set(p.x + Math.cos(a) * 1.1, h0, p.z - Math.sin(a) * 1.1), Q, S.set(1.6, 1.4, 0.25));
          this.blobs.add(M, C.set(0x7d705a));
        }
        const kk = 0.7 + 0.3 * k;
        for (let i = 0; i < 11; i++) {
          const a = rnd() * 6.28, d = rnd() * 5.5;
          const r = (3.5 + rnd() * 2.8) * kk;
          M.compose(V.set(p.x + Math.cos(a) * d, h0 + H - 5 + rnd() * 5, p.z + Math.sin(a) * d), Q.identity(), S.set(r, r * 0.65, r));
          C.copy(base).multiplyScalar(0.7 + 0.35 * rnd());
          this.blobs.add(M, C);
        }
      }
    }
    for (const b of [this.trunks, this.blobs, this.leaves, this.blades, this.bracts]) b.done();
  }

  update(dt, time) {
    this.uniforms.uTime.value = time;
    this.uniforms.uWind.value += (0.25 + this.sim.env.wind * 1.2 - this.uniforms.uWind.value) * Math.min(1, dt);
    this.waterNormal.offset.y -= dt * 0.08;
    this.acc.plants += dt; this.acc.decor += dt;
    if (this.acc.plants > 1.5 || this.version !== this.sim.veg.version) { this.rebuildPlants(); this.acc.plants = 0; this.version = this.sim.veg.version; }
    if (this.acc.decor > 4) { this.updateDecor(); this.acc.decor = 0; }
  }
}
