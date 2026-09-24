import * as THREE from 'three';
import { LAYER, CARRY, CASTE } from '../sim/constants.js';
import { SPECIES } from '../sim/vegetation.js';
import { antGeometry, antMaterial, leafShapeGeometry } from './geometry.js';
import { writeNestMatrix } from './nestView.js';

// linear-space colours (instance colours are not colour-managed)
const CASTE_COL = [
  [0.34, 0.08, 0.022], [0.26, 0.05, 0.013], [0.19, 0.033, 0.008], [0.12, 0.02, 0.006], [0.1, 0.024, 0.007], [0.02, 0.013, 0.01],
];
const RIVAL_COL = [0.018, 0.007, 0.004];

function surfMatrix(e, x, y, z, hd, s) {
  const c = Math.cos(hd), sn = Math.sin(hd);
  e[0] = c * s; e[1] = 0; e[2] = sn * s; e[3] = 0;
  e[4] = 0; e[5] = s; e[6] = 0; e[7] = 0;
  e[8] = -sn * s; e[9] = 0; e[10] = c * s; e[11] = 0;
  e[12] = x; e[13] = y; e[14] = z; e[15] = 1;
}

class AntBatch {
  constructor(geo, mat, max) {
    this.geo = geo.clone();
    this.anim = new Float32Array(max * 3);
    this.animAttr = new THREE.InstancedBufferAttribute(this.anim, 3);
    this.animAttr.setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('iAnim', this.animAttr);
    this.mesh = new THREE.InstancedMesh(this.geo, mat, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.setColorAt(0, new THREE.Color());
    this.mat = this.mesh.instanceMatrix.array;
    this.col = this.mesh.instanceColor.array;
    this.max = max;
    this.n = 0;
  }
  begin() { this.n = 0; }
  next() { return this.n < this.max ? this.n++ : -1; }
  end() {
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;
    this.animAttr.needsUpdate = true;
  }
}

class ItemBatch {
  constructor(geo, mat, max) {
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.setColorAt(0, new THREE.Color());
    this.max = max; this.n = 0;
  }
  add(m, c) { if (this.n >= this.max) return; this.mesh.setMatrixAt(this.n, m); this.mesh.setColorAt(this.n, c); this.n++; }
  end() { this.mesh.count = this.n; this.mesh.instanceMatrix.needsUpdate = true; this.mesh.instanceColor.needsUpdate = true; }
}

const Mant = new THREE.Matrix4(), Mloc = new THREE.Matrix4(), Mout = new THREE.Matrix4(), Col = new THREE.Color();
const Rtilt = new THREE.Matrix4(), Rflat = new THREE.Matrix4().makeRotationX(-Math.PI / 2);

export class AntsView {
  constructor(sim, clip) {
    this.sim = sim;
    this.group = new THREE.Group();
    const hiGeo = antGeometry('hi'), loGeo = antGeometry('lo');
    const cap = sim.ants.cap;
    this.surfHi = new AntBatch(hiGeo, antMaterial({ clip }), 2500);
    this.surfLo = new AntBatch(loGeo, antMaterial({ clip, lo: true }), cap);
    this.nestHi = new AntBatch(hiGeo, antMaterial(), 2500);
    this.nestLo = new AntBatch(loGeo, antMaterial({ lo: true }), cap);
    for (const b of [this.surfHi, this.surfLo, this.nestHi, this.nestLo]) this.group.add(b.mesh);
    const leafGeo = leafShapeGeometry(true);
    this.leafSurf = new ItemBatch(leafGeo, new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.55, clippingPlanes: clip }), cap);
    this.leafNest = new ItemBatch(leafGeo, new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.55 }), cap);
    const pel = new THREE.IcosahedronGeometry(1, 1);
    this.pelSurf = new ItemBatch(pel, new THREE.MeshStandardMaterial({ roughness: 0.9, clippingPlanes: clip }), 3000);
    this.pelNest = new ItemBatch(pel, new THREE.MeshStandardMaterial({ roughness: 0.9 }), 3000);
    for (const b of [this.leafSurf, this.leafNest, this.pelSurf, this.pelNest]) this.group.add(b.mesh);
    this.leafSurf.mesh.castShadow = true;
    // selection ring
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.025, 6, 48), new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.7, depthTest: false }));
    this.ring.renderOrder = 10;
    this.ring.visible = false;
    this.group.add(this.ring);
  }

  update(camera, time, selected) {
    const sim = this.sim, A = sim.ants, surf = sim.surface;
    const cam = camera.position;
    const batches = [this.surfHi, this.surfLo, this.nestHi, this.nestLo];
    for (const b of batches) b.begin();
    for (const b of [this.leafSurf, this.leafNest, this.pelSurf, this.pelNest]) b.n = 0;
    const HI2 = 16 * 16;
    this.ring.visible = false;
    for (let i = 0; i < A.count; i++) {
      if (!A.alive[i]) continue;
      const nestL = A.layer[i] === LAYER.NEST;
      const size = A.size[i];
      let s = 0.35 + 0.65 * size;
      if (A.caste[i] >= CASTE.GYNE) s *= 0.9;
      let x, y, z;
      const riding = A.ridingOn[i];
      if (nestL) { x = A.x[i]; y = A.y[i]; z = 0.32; }
      else {
        x = A.x[i]; z = A.y[i];
        y = surf.heightAt(x, z) + 0.01;
        if (riding >= 0) { const cs = 0.35 + 0.65 * A.size[riding]; y += cs * 0.2 + (0.25 + 0.3 * A.carryAmt[riding]) * 0.75; }
      }
      const dx = x - cam.x, dy = y - cam.y, dz = z - cam.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      const hi = d2 < HI2;
      let boost = 1;
      if (!hi) { const d = Math.sqrt(d2); boost = Math.min(2.2, Math.max(1, d / 40)); }
      let bb = nestL ? (hi ? this.nestHi : this.nestLo) : (hi ? this.surfHi : this.surfLo);
      let k = bb.next();
      if (k < 0) { bb = nestL ? this.nestLo : this.surfLo; k = bb.next(); if (k < 0) continue; }
      const e = bb.mat, o = k * 16;
      const ss = s * boost;
      if (nestL) writeNestMatrix(tmpE, x, y, z, A.hd[i], ss);
      else surfMatrix(tmpE, x, y, z, riding >= 0 ? A.hd[riding] + 1.3 : A.hd[i], ss);
      for (let q = 0; q < 16; q++) e[o + q] = tmpE[q];
      const cc = A.colony[i] === 0 ? CASTE_COL[A.caste[i]] : RIVAL_COL;
      let r = cc[0], g = cc[1], bl = cc[2];
      if (i === selected) { r = Math.min(1, r * 2.2 + 0.08); g = g * 2.2 + 0.05; bl *= 2; }
      else if (A.parasite[i]) { r *= 0.85; g *= 1.1; }
      bb.col[k * 3] = r; bb.col[k * 3 + 1] = g; bb.col[k * 3 + 2] = bl;
      bb.anim[k * 3] = A.anim[i];
      bb.anim[k * 3 + 1] = Math.min(1, A.spd[i] * 1.5 + (A.fightT[i] > 0 ? 1 : 0));
      bb.anim[k * 3 + 2] = 1 + Math.max(0, size - 1) * 0.33;

      if (i === selected) {
        this.ring.visible = true;
        this.ring.position.set(x, y + (nestL ? 0 : 0.03), z + (nestL ? 0.05 : 0));
        this.ring.rotation.set(nestL ? 0 : Math.PI / 2, 0, 0);
        this.ring.scale.setScalar(0.35 * s * boost + 0.05 * Math.sin(time * 5));
      }

      // carried items
      const cr = A.carry[i];
      if (cr) {
        Mant.fromArray(tmpE);
        if (cr === CARRY.LEAF) {
          const ls = (0.2 + 0.25 * A.carryAmt[i]) / s;
          if (nestL) {
            Mloc.makeTranslation(0.05, 0.14, 0).multiply(Rflat);
            Mloc.multiply(Mtmp.makeRotationZ(-1.2)).multiply(Mtmp2.makeScale(ls * 0.8, ls * 0.8, ls * 0.8));
          } else {
            Rtilt.makeRotationZ(0.4);
            Mloc.makeTranslation(0.17, 0.12, 0).multiply(Rtilt).multiply(Mtmp2.makeScale(ls, ls, ls));
          }
          Mout.multiplyMatrices(Mant, Mloc);
          const base = SPECIES[A.carrySp[i]].color;
          Col.setHex(base).multiplyScalar(1.15);
          (nestL ? this.leafNest : this.leafSurf).add(Mout, Col);
        } else {
          const ps = cr === CARRY.BROOD ? 0.05 : 0.055;
          Mloc.makeTranslation(0.25, 0.08, 0).multiply(Mtmp2.makeScale(ps / 1, ps * (cr === CARRY.BROOD ? 0.7 : 1), ps));
          Mout.multiplyMatrices(Mant, Mloc);
          if (cr === CARRY.SOIL) Col.setRGB(0.2, 0.09, 0.04);
          else if (cr === CARRY.WASTE) Col.setRGB(0.06, 0.05, 0.035);
          else Col.setRGB(0.9, 0.86, 0.72);
          (nestL ? this.pelNest : this.pelSurf).add(Mout, Col);
        }
      }
    }
    for (const b of batches) b.end();
    for (const b of [this.leafSurf, this.leafNest, this.pelSurf, this.pelNest]) b.end();
  }
}

const tmpE = new Float32Array(16);
const Mtmp = new THREE.Matrix4(), Mtmp2 = new THREE.Matrix4();
