import * as THREE from 'three';
import { NW, NH, NCELL, NX0, ZONE, SG, HALF } from '../sim/constants.js';
import { TGT } from '../sim/nest.js';
import { SLICE, soilSliceCanvas } from './textures.js';
import { spongeGeometry, queenGeometry, antMaterial, leafShapeGeometry } from './geometry.js';
import { heat, tempColor } from './terrain.js';
import { mulberry32 } from '../sim/rng.js';

const ZONE_FILL = ['#24170f', '#3a2616', '#3b2a16', '#402018', '#2c2822', '#2a2c16', '#1d2530'];
const ZONE_RIM = ['#6e4a30', '#8a6a44', '#9a7a48', '#9a5a40', '#6a645a', '#6e7a44', '#5a6e84'];
const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), S = new THREE.Vector3(), C = new THREE.Color(), E = new THREE.Euler();

export class NestView {
  constructor(sim) {
    this.sim = sim;
    this.group = new THREE.Group();
    this.base = soilSliceCanvas();
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.base.width; this.canvas.height = this.base.height;
    this.ctx = this.canvas.getContext('2d');
    this.bump = document.createElement('canvas');
    this.bump.width = this.base.width / 2; this.bump.height = this.base.height / 2;
    this.bctx = this.bump.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 8;
    this.bumpTex = new THREE.CanvasTexture(this.bump);

    // slice mesh whose top edge follows the terrain profile along z = 0
    const segX = 256;
    const geo = new THREE.PlaneGeometry(SLICE.x1 - SLICE.x0, SLICE.y1 - SLICE.y0, segX, 1);
    geo.translate((SLICE.x0 + SLICE.x1) / 2, (SLICE.y0 + SLICE.y1) / 2, 0);
    this.sliceGeo = geo;
    this.fitTop();
    const mat = new THREE.MeshStandardMaterial({
      map: this.tex, bumpMap: this.bumpTex, bumpScale: 3, roughness: 0.92,
      emissive: 0xffffff, emissiveMap: this.tex, emissiveIntensity: 0.1,
    });
    this.slice = new THREE.Mesh(geo, mat);
    this.slice.receiveShadow = true;
    this.group.add(this.slice);
    // thin dark backing so the diorama reads as a solid block
    const back = new THREE.Mesh(new THREE.BoxGeometry(SLICE.x1 - SLICE.x0, SLICE.y1 - SLICE.y0 - 3, 0.5), new THREE.MeshStandardMaterial({ color: 0x1a110b, roughness: 1 }));
    back.position.set(0, (SLICE.y0 + SLICE.y1 - 3) / 2 - 1.5, -0.3);
    this.group.add(back);

    // fungus gardens
    this.fungusMat = new THREE.MeshPhysicalMaterial({ roughness: 0.85, sheen: 1, sheenColor: new THREE.Color(1, 1, 0.95), sheenRoughness: 0.4, emissive: 0x3a3222, emissiveIntensity: 0.3 });
    this.fungus = new THREE.InstancedMesh(spongeGeometry(), this.fungusMat, 4500);
    this.fungus.frustumCulled = false;
    this.fungus.setColorAt(0, C.set(1, 1, 1));
    this.group.add(this.fungus);
    // brood
    const broodGeo = new THREE.SphereGeometry(1, 10, 8);
    this.brood = new THREE.InstancedMesh(broodGeo, new THREE.MeshPhysicalMaterial({ roughness: 0.35, transmission: 0.0, sheen: 0.6, emissive: 0x2a2620, emissiveIntensity: 0.6 }), 4000);
    this.brood.frustumCulled = false;
    this.brood.setColorAt(0, C.set(1, 1, 1));
    this.group.add(this.brood);
    // cached leaves
    this.cache = new THREE.InstancedMesh(leafShapeGeometry(true), new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.6 }), 600);
    this.cache.frustumCulled = false;
    this.cache.setColorAt(0, C.set(1, 1, 1));
    this.group.add(this.cache);
    // queen
    const qm = antMaterial();
    this.queenMesh = new THREE.InstancedMesh(queenGeometry(), qm, 1);
    this.queenMesh.geometry.setAttribute('iAnim', new THREE.InstancedBufferAttribute(new Float32Array([0, 0, 1.25]), 3));
    this.queenMesh.setColorAt(0, C.setRGB(0.12, 0.025, 0.008));
    this.queenMesh.frustumCulled = false;
    this.group.add(this.queenMesh);
    // drifting spores / humid haze above gardens
    const sp = new Float32Array(600 * 3);
    this.sporeGeo = new THREE.BufferGeometry();
    this.sporeGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    this.spores = new THREE.Points(this.sporeGeo, new THREE.PointsMaterial({ color: 0xfff2c8, size: 0.09, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.spores.frustumCulled = false;
    this.group.add(this.spores);
    this.sporeData = [];
    // selection outline for chambers
    this.highlight = null;

    this.lastVersion = -1;
    this.acc = { draw: 0, inst: 0 };
    this.overlay = null;
    this.visible = true;
    this.redraw();
    this.updateInstances();
  }

  fitTop() {
    const p = this.sliceGeo.attributes.position, uv = this.sliceGeo.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      let y = p.getY(i);
      if (y > SLICE.y0 + 1) y = Math.min(SLICE.y1, this.sim.surface.heightAt(x, 0) - 0.02);
      p.setY(i, y);
      uv.setXY(i, (x - SLICE.x0) / (SLICE.x1 - SLICE.x0), (y - SLICE.y0) / (SLICE.y1 - SLICE.y0));
    }
    p.needsUpdate = true; uv.needsUpdate = true;
    this.sliceGeo.computeVertexNormals();
  }

  // world → canvas pixels
  px(x) { return (x - SLICE.x0) * SLICE.ppu; }
  py(y) { return (SLICE.y1 - y) * SLICE.ppu; }

  redraw() {
    const sim = this.sim, nest = sim.nest, g = this.ctx, b = this.bctx;
    g.drawImage(this.base, 0, 0);
    b.fillStyle = '#808080'; b.fillRect(0, 0, this.bump.width, this.bump.height);
    const cp = NCELL * SLICE.ppu;
    const ox = this.px(NX0), oy = this.py(0);
    const { solid, zone, mark, water, waste, refuse } = nest;
    // tunnel walls then floors
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < nest.N; i++) {
        if (solid[i] !== 0) continue;
        const x = ox + ((i % NW) + 0.5) * cp, y = oy + (((i / NW) | 0) + 0.5) * cp;
        const z = zone[i];
        g.fillStyle = pass === 0 ? ZONE_RIM[z] : ZONE_FILL[z];
        g.beginPath();
        g.arc(x, y, cp * (pass === 0 ? 0.92 : 0.72), 0, Math.PI * 2);
        g.fill();
        if (pass === 1) { b.fillStyle = '#101010'; b.beginPath(); b.arc(x / 2, y / 2, cp * 0.4, 0, Math.PI * 2); b.fill(); }
      }
    }
    // chamber floor texture, waste, refuse, water
    for (let i = 0; i < nest.N; i++) {
      const cx = i % NW, cy = (i / NW) | 0;
      const x = ox + cx * cp, y = oy + cy * cp;
      if (solid[i] === 0) {
        if (waste[i] > 0.05) {
          g.fillStyle = `rgba(120,108,88,${Math.min(0.95, waste[i] * 0.35)})`;
          g.fillRect(x - 1, y - 1, cp + 2, cp + 2);
          g.fillStyle = 'rgba(70,60,48,0.8)';
          for (let k = 0; k < Math.min(6, waste[i] * 3); k++) g.fillRect(x + ((i * 7 + k * 13) % 5), y + ((i * 3 + k * 11) % 5), 1.5, 1.5);
        }
        if (refuse[i] > 0.15) {
          g.fillStyle = `rgba(60,50,30,${Math.min(0.7, refuse[i] * 0.5)})`;
          g.fillRect(x + 1, y + cp * 0.5, cp - 2, cp * 0.45);
        }
        if (water[i] > 0.02) {
          g.fillStyle = `rgba(70,120,170,${Math.min(0.85, water[i] * 0.9)})`;
          const h = cp * Math.min(1, water[i]);
          g.fillRect(x - 1, y + cp - h, cp + 2, h + 1);
        }
      } else if (mark[i] && solid[i] === 1) {
        const prog = nest.dig[i] / (nest.hard[i] * 3);
        g.fillStyle = zone[i] ? 'rgba(255,214,120,0.28)' : 'rgba(255,200,90,0.22)';
        g.fillRect(x, y, cp, cp);
        g.strokeStyle = 'rgba(255,220,140,0.7)';
        g.lineWidth = 1;
        g.beginPath(); g.moveTo(x, y + cp); g.lineTo(x + cp, y); g.stroke();
        if (prog > 0) { g.fillStyle = 'rgba(255,230,160,0.55)'; g.fillRect(x, y + cp * (1 - prog), cp, cp * prog); }
      }
    }
    // overlays
    const ov = this.overlay;
    if (ov && ['temperature', 'humidity', 'traffic', 'fungus', 'disease', 'population'].includes(ov)) {
      for (let i = 0; i < nest.N; i++) {
        if (solid[i] !== 0) continue;
        let c = null, a = 0.6;
        if (ov === 'temperature') c = tempColor(nest.temp[i]);
        else if (ov === 'humidity') { const h = nest.hum[i]; c = [140 * (1 - h) + 40, 90 + 100 * h, 60 + 195 * h]; }
        else if (ov === 'traffic' || ov === 'population') { const t = Math.sqrt(nest.traffic[i]) * 0.5; if (t < 0.02) continue; c = heat(Math.min(1, t)); }
        else if (ov === 'fungus') { if (zone[i] !== ZONE.GARDEN) continue; const f = nest.fungus[i], cc = nest.contam[i]; c = [255 * Math.max(cc * 2, 1 - f), 220 * f * (1 - cc), 60]; a = 0.75; }
        else if (ov === 'disease') { const d = nest.contam[i] + nest.refuse[i] * 0.3 + nest.wasteNear[i] * 0.5; if (d < 0.02) continue; c = [230, 60, 200]; a = Math.min(0.9, d * 1.5); }
        if (!c) continue;
        g.fillStyle = `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
        g.fillRect(ox + (i % NW) * cp, oy + ((i / NW) | 0) * cp, cp + 0.5, cp + 0.5);
      }
    }
    if (this.highlight !== null) {
      const ch = nest.chambers[this.highlight];
      if (ch) {
        g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 2;
        for (const c of ch.cells) {
          const x = ox + (c % NW) * cp, y = oy + ((c / NW) | 0) * cp;
          const edge = [c - 1, c + 1, c - NW, c + NW].some((k) => k < 0 || k >= nest.N || nest.chamberOf[k] !== ch.id);
          if (edge) g.strokeRect(x + 1, y + 1, cp - 2, cp - 2);
        }
      }
    }
    this.tex.needsUpdate = true;
    this.bumpTex.needsUpdate = true;
  }

  updateInstances() {
    const sim = this.sim, nest = sim.nest, col = sim.colony;
    // fungus
    let n = 0;
    for (const c of nest.gardenCells) {
      const f = nest.fungus[c];
      if (f < 0.03) continue;
      const rnd = mulberry32(c * 7919);
      const x = nest.wx(c % NW), y = nest.wy((c / NW) | 0);
      const r = 0.34 * (0.3 + 0.8 * f);
      E.set(rnd() * 6, rnd() * 6, rnd() * 6); Q.setFromEuler(E);
      M.compose(V.set(x + (rnd() - 0.5) * 0.12, y + (rnd() - 0.5) * 0.12, 0.1 + rnd() * 0.15), Q, S.set(r, r * (0.85 + rnd() * 0.3), r));
      const cc = nest.contam[c], sub = Math.min(1, nest.substrate[c] * 0.6), tox = Math.min(1, nest.toxin[c]);
      C.setRGB(0.84, 0.8, 0.66)
        .lerp(C2.setRGB(0.55, 0.78, 0.4), sub * 0.35)
        .lerp(C2.setRGB(0.55, 0.42, 0.25), tox * 0.5)
        .lerp(C2.setRGB(0.35, 0.42, 0.28), cc);
      this.fungus.setMatrixAt(n, M);
      this.fungus.setColorAt(n, C);
      n++;
      if (n >= this.fungus.instanceMatrix.count) break;
    }
    this.fungus.count = n;
    this.fungus.instanceMatrix.needsUpdate = true;
    if (this.fungus.instanceColor) this.fungus.instanceColor.needsUpdate = true;

    // brood
    n = 0;
    const qc = col.queenCell();
    for (const b of col.brood) {
      if (b.loc === 2) continue;
      const c = b.cell >= 0 ? b.cell : qc;
      if (c < 0) continue;
      const x = nest.wx(c % NW) + (b.seed - 0.5) * 0.36, y = nest.wy((c / NW) | 0) + (((b.seed * 7.3) % 1) - 0.5) * 0.3;
      let sx, sy;
      if (b.st === 0) { sx = sy = 0.04; C.setRGB(1, 0.98, 0.9); }
      else if (b.st === 1) { const g = 0.05 + 0.06 * Math.min(1, b.t / 300 + b.fed); sx = g * 1.2; sy = g; C.setRGB(0.98, 0.96, 0.9); }
      else { sx = 0.14 * Math.max(0.7, b.size * 0.8); sy = sx * 0.55; C.setRGB(0.93, 0.85, 0.7); if (b.repro) C.setRGB(0.8, 0.6, 0.45); }
      E.set(0, 0, b.seed * 6); Q.setFromEuler(E);
      M.compose(V.set(x, y, 0.2), Q, S.set(sx, sy, sy));
      this.brood.setMatrixAt(n, M);
      this.brood.setColorAt(n, C);
      if (++n >= 4000) break;
    }
    this.brood.count = n;
    this.brood.instanceMatrix.needsUpdate = true;
    if (this.brood.instanceColor) this.brood.instanceColor.needsUpdate = true;

    // leaf cache
    n = 0;
    const cells = [];
    if (nest.has[TGT.STORE]) for (const ch of nest.chambers) { if (ch.zone === ZONE.STORE) cells.push(...ch.cells); }
    else for (const e of nest.entrances) for (let x = e.x0; x <= e.x1; x++) cells.push(NW * 1 + x);
    const count = Math.min(600, Math.floor(col.leafCache * 3));
    if (cells.length) {
      const rnd = mulberry32(99);
      for (let k = 0; k < count; k++) {
        const c = cells[k % cells.length];
        if (nest.solid[c]) continue;
        const x = nest.wx(c % NW) + (rnd() - 0.5) * 0.4, y = nest.wy((c / NW) | 0) - 0.15 + (rnd() - 0.2) * 0.3;
        E.set(0, 0, rnd() * 6.28); Q.setFromEuler(E);
        M.compose(V.set(x, y, 0.15 + rnd() * 0.1), Q, S.setScalar(0.18 + rnd() * 0.12));
        C.setHSL(0.26 + rnd() * 0.06, 0.55, 0.3 + rnd() * 0.1);
        this.cache.setMatrixAt(n, M);
        this.cache.setColorAt(n, C);
        n++;
      }
    }
    this.cache.count = n;
    this.cache.instanceMatrix.needsUpdate = true;
    if (this.cache.instanceColor) this.cache.instanceColor.needsUpdate = true;

    // queen
    const q = col.queen;
    this.queenMesh.visible = q.alive || q.health > 0;
    const hd = Math.PI + Math.sin(sim.time * 0.2) * 0.2;
    writeNestMatrix(M.elements, q.x, q.y, 0.35, hd, 2.8);
    this.queenMesh.setMatrixAt(0, M);
    this.queenMesh.instanceMatrix.needsUpdate = true;
    if (!q.alive) { this.queenMesh.setColorAt(0, C.setRGB(0.03, 0.028, 0.025)); this.queenMesh.instanceColor.needsUpdate = true; }

    // spores follow gardens
    const sp = this.sporeGeo.attributes.position.array;
    const gc = nest.gardenCells;
    for (let k = 0; k < 600; k++) {
      let d = this.sporeData[k];
      if (!d || d.life <= 0) {
        if (!gc.length) { sp[k * 3 + 1] = -999; continue; }
        const c = gc[Math.floor(Math.random() * gc.length)];
        d = this.sporeData[k] = { x: nest.wx(c % NW), y: nest.wy((c / NW) | 0), vx: (Math.random() - 0.5) * 0.1, vy: 0.03 + Math.random() * 0.05, life: 2 + Math.random() * 4 };
      }
    }
  }

  update(dt, overlay, cutawayVisible) {
    const nest = this.sim.nest;
    this.acc.draw += dt; this.acc.inst += dt;
    if (overlay !== this.overlay) { this.overlay = overlay; this.acc.draw = 99; }
    const topo = nest.version !== this.lastVersion;
    if (topo) this.fitTop();
    if (topo || (cutawayVisible && this.acc.draw > 0.5)) { this.redraw(); this.lastVersion = nest.version; this.acc.draw = 0; }
    if (this.acc.inst > 0.4) { this.updateInstances(); this.acc.inst = 0; }
    const sp = this.sporeGeo.attributes.position.array;
    for (let k = 0; k < this.sporeData.length; k++) {
      const d = this.sporeData[k];
      if (!d) continue;
      d.life -= dt; d.x += d.vx * dt; d.y += d.vy * dt;
      sp[k * 3] = d.x; sp[k * 3 + 1] = d.life > 0 ? d.y : -999; sp[k * 3 + 2] = 0.4;
    }
    this.sporeGeo.attributes.position.needsUpdate = true;
  }
}

const C2 = new THREE.Color();

// Dorsal view matrix for ants in the cutaway plane: forward = heading in x/y, up = +z (toward viewer).
export function writeNestMatrix(e, x, y, z, hd, s) {
  const c = Math.cos(hd), sn = Math.sin(hd);
  e[0] = c * s; e[1] = sn * s; e[2] = 0; e[3] = 0;
  e[4] = 0; e[5] = 0; e[6] = s; e[7] = 0;
  e[8] = sn * s; e[9] = -c * s; e[10] = 0; e[11] = 0;
  e[12] = x; e[13] = y; e[14] = z; e[15] = 1;
}
