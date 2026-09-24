import * as THREE from 'three';
import { alateGeometry, buildPredator } from './geometry.js';
import { mulberry32 } from '../sim/rng.js';

export class Rain {
  constructor(clip) {
    this.N = 5000;
    const pos = new Float32Array(this.N * 6);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.mat = new THREE.LineBasicMaterial({ color: 0xaac4d8, transparent: true, opacity: 0, depthWrite: false, clippingPlanes: clip });
    this.mesh = new THREE.LineSegments(this.geo, this.mat);
    this.mesh.frustumCulled = false;
    this.drops = new Float32Array(this.N * 3);
    for (let i = 0; i < this.N; i++) { this.drops[i * 3] = (Math.random() - 0.5) * 80; this.drops[i * 3 + 1] = Math.random() * 40; this.drops[i * 3 + 2] = (Math.random() - 0.5) * 80; }
  }
  update(dt, env, center) {
    const I = env.rain;
    this.mat.opacity = Math.min(0.55, I * 0.8);
    this.mesh.visible = I > 0.02;
    if (!this.mesh.visible) return;
    const p = this.geo.attributes.position.array, d = this.drops;
    const n = Math.floor(this.N * Math.min(1, I * 1.2));
    const wind = env.wind * 6;
    for (let i = 0; i < this.N; i++) {
      if (i >= n) { p[i * 6 + 1] = p[i * 6 + 4] = -999; continue; }
      d[i * 3 + 1] -= dt * 28;
      d[i * 3] += dt * wind;
      if (d[i * 3 + 1] < 0) { d[i * 3 + 1] += 40; d[i * 3] = (Math.random() - 0.5) * 80; d[i * 3 + 2] = (Math.random() - 0.5) * 80; }
      const x = center.x + d[i * 3], y = Math.max(center.y, 0) + d[i * 3 + 1] - 5, z = center.z + d[i * 3 + 2];
      p[i * 6] = x; p[i * 6 + 1] = y; p[i * 6 + 2] = z;
      p[i * 6 + 3] = x - wind * 0.03; p[i * 6 + 4] = y - 0.9; p[i * 6 + 5] = z;
    }
    this.geo.attributes.position.needsUpdate = true;
  }
}

// Winged reproductives streaming into the sky.
export class NuptialFlight {
  constructor() {
    this.max = 3000;
    this.mesh = new THREE.InstancedMesh(alateGeometry(), new THREE.MeshStandardMaterial({ color: 0x5a2a12, roughness: 0.4, transparent: true, opacity: 0.95, side: THREE.DoubleSide }), this.max);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.f = [];
    this.m = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.v = new THREE.Vector3(); this.s = new THREE.Vector3(); this.e = new THREE.Euler();
  }
  launch(x, z, gyne, h0 = 0) {
    if (this.f.length >= this.max) return;
    this.f.push({ x: x + (Math.random() - 0.5) * 0.6, y: 0.3, z: z + (Math.random() - 0.5) * 0.6, vy: 1 + Math.random() * 2, a: Math.random() * 6.28, r: 0.5 + Math.random() * 2, w: (Math.random() - 0.5) * 2, h0, t: 0, life: 25 + Math.random() * 15, s: gyne ? 1.6 : 1.1, flap: Math.random() * 6 });
  }
  update(dt) {
    const out = [];
    let n = 0;
    for (const a of this.f) {
      a.t += dt;
      if (a.t > a.life) continue;
      a.a += a.w * dt;
      a.vy = Math.min(4, a.vy + dt * 0.4);
      a.x += Math.cos(a.a) * a.r * dt + dt * 1.2;
      a.z += Math.sin(a.a) * a.r * dt;
      a.y += a.vy * dt;
      a.flap += dt * 60;
      out.push(a);
      this.e.set(Math.sin(a.flap) * 0.6, -a.a, 0.3);
      this.q.setFromEuler(this.e);
      this.m.compose(this.v.set(a.x, a.h0 + a.y, a.z), this.q, this.s.setScalar(a.s));
      this.mesh.setMatrixAt(n++, this.m);
    }
    this.f = out;
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

export class PredatorsView {
  constructor(sim, clip) {
    this.sim = sim;
    this.clip = clip;
    this.group = new THREE.Group();
    this.map = new Map();
  }
  update(dt, selectedPred) {
    const sim = this.sim, surf = sim.surface;
    const seen = new Set();
    for (const p of sim.predators.list) {
      seen.add(p.id);
      let g = this.map.get(p.id);
      if (!g) {
        g = buildPredator(p.type, this.clip);
        const scale = { spider: 0.8, lizard: 1.25, toad: 1.3, bird: 1.4, phorid: 0.8 }[p.type];
        g.scale.setScalar(scale);
        this.group.add(g);
        this.map.set(p.id, g);
      }
      const h = surf.heightAt(p.x, p.z);
      g.position.set(p.x, h + p.y, p.z);
      g.rotation.y = -p.hd;
      const legs = g.userData.legs;
      const moving = p.moving > 0 ? 1 : 0.1;
      for (const l of legs) {
        if (l.userData.wing) {
          const flying = p.y > 0.2 || p.type === 'phorid';
          l.rotation.x = flying ? Math.sin(p.anim * (l.userData.fast ? 90 : 18)) * 0.9 * l.userData.wing : 0.1 * l.userData.wing;
        } else l.rotation.z = Math.sin(p.anim * 12 + l.userData.phase) * 0.25 * moving;
      }
      if (p.type === 'bird' && p.y < 0.2) g.rotation.z = Math.sin(p.anim * 10) * 0.08;
      g.traverse((o) => { if (o.material && o.material.emissive) o.material.emissive.setHex(p.id === selectedPred ? 0x553311 : 0x000000); });
    }
    for (const [id, g] of this.map) {
      if (!seen.has(id)) {
        this.group.remove(g);
        g.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
        this.map.delete(id);
      }
    }
  }
}

// Refuse heap outside the nest (for species/colonies that dump externally) and soil pellets.
export class DumpView {
  constructor(sim, clip) {
    this.sim = sim;
    this.mesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: 0x4d463a, roughness: 1, clippingPlanes: clip }), 800);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.receiveShadow = true;
    this.last = -1;
  }
  update() {
    const d = this.sim.colony.dump;
    const n = Math.min(800, Math.floor(d.amount * 6));
    if (n === this.last) return;
    this.last = n;
    const rnd = mulberry32(17);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), s = new THREE.Vector3(), e = new THREE.Euler();
    const R = 0.6 + Math.sqrt(n) * 0.08;
    for (let i = 0; i < n; i++) {
      const a = rnd() * 6.28, r = Math.sqrt(rnd()) * R;
      const x = d.x + Math.cos(a) * r, z = d.z + Math.sin(a) * r;
      const pile = (1 - r / R) * Math.sqrt(n) * 0.02;
      e.set(rnd() * 3, rnd() * 3, rnd() * 3); q.setFromEuler(e);
      m.compose(v.set(x, this.sim.surface.heightAt(x, z) + pile, z), q, s.setScalar(0.05 + rnd() * 0.05));
      this.mesh.setMatrixAt(i, m);
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
