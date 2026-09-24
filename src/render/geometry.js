import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { makeNoise } from '../sim/rng.js';

const noise = makeNoise(31);

// Tag every vertex of a part so the vertex shader can animate it.
// part: 0 body, 1 head, 2 leg, 3 antenna. leg = [tripod group ±1, weight 0 (hip) … 1 (foot)]
function tag(geo, part, legGroup = 0, w0 = 0, w1 = 0, axisFrom = null, axisTo = null) {
  const n = geo.attributes.position.count;
  const aPart = new Float32Array(n).fill(part);
  const aLeg = new Float32Array(n * 2);
  const p = geo.attributes.position;
  for (let i = 0; i < n; i++) {
    aLeg[i * 2] = legGroup;
    let w = 0;
    if (axisFrom) {
      const v = new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i));
      const ab = axisTo.clone().sub(axisFrom);
      w = THREE.MathUtils.clamp(v.sub(axisFrom).dot(ab) / ab.lengthSq(), 0, 1);
    }
    aLeg[i * 2 + 1] = w0 + (w1 - w0) * w;
  }
  geo.setAttribute('aPart', new THREE.BufferAttribute(aPart, 1));
  geo.setAttribute('aLeg', new THREE.BufferAttribute(aLeg, 2));
  return geo;
}

function ellipsoid(rx, ry, rz, x, y, z, ws = 10, hs = 8) {
  const g = new THREE.SphereGeometry(1, ws, hs);
  g.scale(rx, ry, rz);
  g.translate(x, y, z);
  return g;
}

export function segment(a, b, r0, r1 = r0, radial = 5) {
  const dir = b.clone().sub(a);
  const len = dir.length();
  const g = new THREE.CylinderGeometry(r1, r0, len, radial, 1, false);
  g.translate(0, len / 2, 0);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  g.applyQuaternion(q);
  g.translate(a.x, a.y, a.z);
  return g;
}

// Atta worker, ~0.42 units long at size 1, facing +x, feet at y = 0.
export function antGeometry(detail = 'hi', opts = {}) {
  const gasterScale = opts.gaster || 1;
  const parts = [];
  const ws = detail === 'hi' ? 12 : 6, hs = detail === 'hi' ? 9 : 4;
  parts.push(tag(ellipsoid(0.1 * gasterScale, 0.078 * gasterScale, 0.085 * gasterScale, -0.13 - (gasterScale - 1) * 0.08, 0.075, 0, ws, hs), 0));
  parts.push(tag(ellipsoid(0.074, 0.045, 0.04, 0.045, 0.075, 0, ws, hs), 0));
  parts.push(tag(ellipsoid(0.066, 0.056, 0.072, 0.15, 0.08, 0, ws, hs), 1));
  if (detail === 'hi') {
    parts.push(tag(ellipsoid(0.022, 0.02, 0.02, -0.035, 0.066, 0, 6, 4), 0));
    parts.push(tag(ellipsoid(0.02, 0.019, 0.019, -0.008, 0.07, 0, 6, 4), 0));
    // mesosomal spines, characteristic of Atta
    for (const s of [-1, 1]) {
      parts.push(tag(segment(new THREE.Vector3(0.07, 0.11, 0.02 * s), new THREE.Vector3(0.06, 0.145, 0.035 * s), 0.008, 0.001, 4), 0));
      parts.push(tag(segment(new THREE.Vector3(0.02, 0.105, 0.018 * s), new THREE.Vector3(0.0, 0.135, 0.03 * s), 0.007, 0.001, 4), 0));
      // occipital spines on the head
      parts.push(tag(segment(new THREE.Vector3(0.11, 0.12, 0.04 * s), new THREE.Vector3(0.095, 0.145, 0.055 * s), 0.008, 0.001, 4), 1));
      // mandibles
      parts.push(tag(segment(new THREE.Vector3(0.2, 0.06, 0.028 * s), new THREE.Vector3(0.245, 0.055, 0.008 * s), 0.013, 0.004, 4), 1));
      // antennae: scape + funiculus
      const a0 = new THREE.Vector3(0.18, 0.1, 0.025 * s), a1 = new THREE.Vector3(0.19, 0.16, 0.07 * s), a2 = new THREE.Vector3(0.29, 0.14, 0.11 * s);
      parts.push(tag(segment(a0, a1, 0.006, 0.005, 4), 3, 0, 0, 0.4, a0, a1));
      parts.push(tag(segment(a1, a2, 0.005, 0.007, 4), 3, 0, 0.4, 1, a1, a2));
    }
  }
  // legs: attach at the mesosoma
  const hips = [0.075, 0.045, 0.015];
  const fwd = [0.07, 0.0, -0.07];
  for (let k = 0; k < 3; k++) {
    for (const s of [-1, 1]) {
      const group = (k % 2 === 0 ? 1 : -1) * s;
      const hip = new THREE.Vector3(hips[k], 0.06, 0.028 * s);
      const knee = new THREE.Vector3(hips[k] + fwd[k] * 0.6, 0.115, 0.11 * s);
      const foot = new THREE.Vector3(hips[k] + fwd[k] * 1.6, 0.0, 0.17 * s);
      const r = detail === 'hi' ? 0.008 : 0.012;
      const rad = detail === 'hi' ? 4 : 3;
      parts.push(tag(segment(hip, knee, r, r * 0.9, rad), 2, group, 0, 0.5, hip, knee));
      parts.push(tag(segment(knee, foot, r * 0.9, r * 0.5, rad), 2, group, 0.5, 1, knee, foot));
    }
  }
  return mergeGeometries(parts.map((p) => p.toNonIndexed()));
}

export function antMaterial({ clip = [], lo = false } = {}) {
  const m = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, roughness: 0.42, metalness: 0.05, clearcoat: lo ? 0 : 0.8, clearcoatRoughness: 0.35,
    sheen: lo ? 0 : 0.4, sheenColor: new THREE.Color(0.8, 0.5, 0.3), sheenRoughness: 0.5,
    clippingPlanes: clip,
  });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = 'attribute float aPart;\nattribute vec2 aLeg;\nattribute vec3 iAnim;\n' + sh.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      float ph = iAnim.x, mv = iAnim.y, hs = iAnim.z;
      if (aPart > 0.5 && aPart < 1.5 || aPart > 2.5) {
        vec3 hc = vec3(0.13, 0.08, 0.0);
        transformed = hc + (transformed - hc) * hs;
      }
      if (aPart > 1.5 && aPart < 2.5) {
        float legPh = ph + (aLeg.x > 0.0 ? 0.0 : 3.14159);
        transformed.x += sin(legPh) * 0.05 * aLeg.y * mv;
        transformed.y += max(0.0, cos(legPh)) * 0.035 * aLeg.y * mv;
      }
      if (aPart > 2.5) {
        transformed.y += sin(ph * 0.37 + aLeg.y * 2.0 + transformed.z * 40.0) * 0.025 * aLeg.y;
        transformed.z += cos(ph * 0.29 + transformed.z * 30.0) * 0.015 * aLeg.y;
      }`
    );
  };
  return m;
}

// Leaf fragment shape in the XY plane, base at origin, ~1 unit tall.
export function leafShapeGeometry(serrated = true) {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  const pts = 14;
  for (let i = 1; i <= pts; i++) {
    const t = i / pts;
    const w = Math.sin(t * Math.PI) * 0.42 * (serrated && i % 2 ? 0.88 : 1);
    s.lineTo(w, t);
  }
  for (let i = pts - 1; i >= 1; i--) {
    const t = i / pts;
    const w = Math.sin(t * Math.PI) * 0.42 * (serrated && i % 2 ? 0.88 : 1);
    s.lineTo(-w, t);
  }
  s.lineTo(0, 0);
  const g = new THREE.ShapeGeometry(s);
  // gentle curl so it catches light
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setZ(i, p.getX(i) * p.getX(i) * 0.4 - p.getY(i) * 0.05);
  g.computeVertexNormals();
  return g;
}

// A lumpy sponge for fungus garden masses.
export function spongeGeometry() {
  const g = new THREE.IcosahedronGeometry(1, 3);
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = noise.fbm(v.x * 2.4 + v.z, v.y * 2.4 - v.z, 3) * 0.28 + Math.abs(noise.n2(v.x * 7, v.y * 7 + v.z * 3)) * 0.12;
    v.multiplyScalar(1 + n);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

export function blobGeometry(detail = 1, amp = 0.2) {
  const g = new THREE.IcosahedronGeometry(1, detail);
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    v.multiplyScalar(1 + noise.n2(v.x * 2 + v.z * 1.3, v.y * 2) * amp);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

export function bladeGeometry() {
  const g = new THREE.PlaneGeometry(0.06, 1, 1, 4);
  g.translate(0, 0.5, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    p.setX(i, p.getX(i) * (1 - y * 0.9));
    p.setZ(i, y * y * 0.25);
  }
  g.computeVertexNormals();
  return g;
}

export function alateGeometry() {
  const body = new THREE.CapsuleGeometry(0.04, 0.22, 3, 6);
  body.rotateZ(Math.PI / 2);
  const wing = new THREE.PlaneGeometry(0.34, 0.1);
  const w1 = wing.clone(); w1.rotateX(-Math.PI / 2); w1.translate(0.02, 0.03, 0.18);
  const w2 = wing.clone(); w2.rotateX(-Math.PI / 2); w2.translate(0.02, 0.03, -0.18);
  const g = mergeGeometries([body.toNonIndexed(), w1.toNonIndexed(), w2.toNonIndexed()].map((x) => { x.deleteAttribute('uv'); return x; }));
  return g;
}

// ---------- predators ----------
function mat(color, rough = 0.6, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, ...extra });
}

export function buildPredator(type, clip) {
  const grp = new THREE.Group();
  const legs = [];
  const add = (geo, m) => { const mesh = new THREE.Mesh(geo, m); mesh.castShadow = true; grp.add(mesh); return mesh; };
  const cm = (c, r, e) => { const m = mat(c, r, e); m.clippingPlanes = clip; return m; };
  if (type === 'spider') {
    const m = cm(0x3b2a1e, 0.75), m2 = cm(0x5a4330, 0.7);
    add(ellipsoid(0.42, 0.3, 0.34, -0.38, 0.35, 0), m);
    add(ellipsoid(0.3, 0.22, 0.26, 0.18, 0.3, 0), m2);
    add(ellipsoid(0.06, 0.06, 0.06, 0.45, 0.4, 0.06), cm(0x111111, 0.2));
    add(ellipsoid(0.06, 0.06, 0.06, 0.45, 0.4, -0.06), cm(0x111111, 0.2));
    for (let k = 0; k < 4; k++)
      for (const s of [-1, 1]) {
        const a = (k - 1.5) * 0.45;
        const hip = new THREE.Vector3(0.18 + Math.cos(a) * 0.12, 0.32, s * 0.15);
        const knee = new THREE.Vector3(0.18 + Math.cos(a) * 0.6, 0.75, s * (0.5 + Math.sin(Math.abs(a)) * 0.1));
        const foot = new THREE.Vector3(0.18 + Math.cos(a) * 1.05 * Math.sign(Math.cos(a) || 1), 0, s * 1.0);
        const leg = new THREE.Group();
        leg.add(new THREE.Mesh(segment(hip, knee, 0.045, 0.035, 5), m2));
        leg.add(new THREE.Mesh(segment(knee, foot, 0.035, 0.015, 5), m2));
        leg.userData = { phase: k + (s > 0 ? 3.14 : 0) };
        grp.add(leg);
        legs.push(leg);
      }
  } else if (type === 'lizard') {
    const m = cm(0x6f7d3a, 0.55), belly = cm(0x9aa25a, 0.6);
    add(ellipsoid(1.1, 0.35, 0.42, 0, 0.42, 0), m);
    add(ellipsoid(0.5, 0.28, 0.3, 1.25, 0.5, 0), m);
    add(ellipsoid(0.25, 0.3, 0.05, 1.05, 0.25, 0), cm(0xd8622b, 0.5)); // dewlap
    add(segment(new THREE.Vector3(-0.9, 0.38, 0), new THREE.Vector3(-3.4, 0.12, 0), 0.25, 0.03, 8), m);
    add(ellipsoid(0.05, 0.05, 0.05, 1.5, 0.62, 0.2), cm(0x111111, 0.1));
    add(ellipsoid(0.05, 0.05, 0.05, 1.5, 0.62, -0.2), cm(0x111111, 0.1));
    for (const x of [0.6, -0.6]) for (const s of [-1, 1]) {
      const leg = new THREE.Group();
      leg.add(new THREE.Mesh(segment(new THREE.Vector3(x, 0.4, s * 0.3), new THREE.Vector3(x + 0.15, 0.2, s * 0.75), 0.1, 0.07, 6), belly));
      leg.add(new THREE.Mesh(segment(new THREE.Vector3(x + 0.15, 0.2, s * 0.75), new THREE.Vector3(x + 0.3, 0, s * 0.85), 0.07, 0.04, 6), belly));
      leg.userData = { phase: (x > 0 ? 0 : 3.14) + (s > 0 ? 3.14 : 0) };
      grp.add(leg); legs.push(leg);
    }
  } else if (type === 'toad') {
    const m = cm(0x7a5a38, 0.85), b = cm(0xb89a6a, 0.8);
    const body = blobGeometry(2, 0.08); body.scale(1.1, 0.75, 1.0); body.translate(0, 0.7, 0);
    add(body, m);
    add(ellipsoid(0.12, 0.12, 0.12, 0.85, 1.2, 0.4), cm(0xc9a24a, 0.2));
    add(ellipsoid(0.12, 0.12, 0.12, 0.85, 1.2, -0.4), cm(0xc9a24a, 0.2));
    add(ellipsoid(0.4, 0.3, 0.9, -0.5, 0.3, 0), b);
    add(ellipsoid(0.22, 0.25, 0.35, 0.7, 0.25, 0.5), b);
    add(ellipsoid(0.22, 0.25, 0.35, 0.7, 0.25, -0.5), b);
  } else if (type === 'bird') {
    const m = cm(0x3a3530, 0.7), m2 = cm(0x6b5b4a, 0.7);
    add(ellipsoid(0.7, 0.45, 0.4, 0, 0.9, 0), m);
    add(ellipsoid(0.32, 0.3, 0.28, 0.65, 1.25, 0), m);
    add(segment(new THREE.Vector3(0.9, 1.25, 0), new THREE.Vector3(1.25, 1.2, 0), 0.07, 0.01, 6), cm(0x222222, 0.3));
    add(ellipsoid(0.05, 0.05, 0.05, 0.85, 1.35, 0.15), cm(0xffffff, 0.1, { emissive: 0x442222 }));
    add(ellipsoid(0.05, 0.05, 0.05, 0.85, 1.35, -0.15), cm(0xffffff, 0.1, { emissive: 0x442222 }));
    add(ellipsoid(0.7, 0.1, 0.25, -0.9, 0.95, 0), m2);
    for (const s of [-1, 1]) {
      const wing = new THREE.Group();
      const w = new THREE.Mesh(ellipsoid(0.55, 0.06, 0.7, 0, 0, s * 0.65), m2);
      wing.add(w); wing.position.set(0, 1.05, s * 0.2);
      wing.userData = { wing: s };
      grp.add(wing); legs.push(wing);
    }
    add(segment(new THREE.Vector3(0, 0.5, 0.12), new THREE.Vector3(0.05, 0, 0.14), 0.03, 0.02, 4), cm(0x9a7a50, 0.5));
    add(segment(new THREE.Vector3(0, 0.5, -0.12), new THREE.Vector3(0.05, 0, -0.14), 0.03, 0.02, 4), cm(0x9a7a50, 0.5));
  } else if (type === 'phorid') {
    const m = cm(0x3a2e1a, 0.5);
    add(ellipsoid(0.1, 0.07, 0.07, 0, 0, 0), m);
    add(ellipsoid(0.05, 0.05, 0.05, 0.1, 0.02, 0), m);
    const wm = new THREE.MeshStandardMaterial({ color: 0xddeeff, transparent: true, opacity: 0.35, side: THREE.DoubleSide, roughness: 0.1, clippingPlanes: clip });
    for (const s of [-1, 1]) {
      const wing = new THREE.Group();
      const g = new THREE.PlaneGeometry(0.18, 0.08); g.rotateX(-Math.PI / 2); g.translate(-0.04, 0, s * 0.1);
      wing.add(new THREE.Mesh(g, wm));
      wing.position.y = 0.04;
      wing.userData = { wing: s, fast: true };
      grp.add(wing); legs.push(wing);
    }
  }
  grp.userData.legs = legs;
  return grp;
}

export function queenGeometry() {
  return antGeometry('hi', { gaster: 2.1 });
}
