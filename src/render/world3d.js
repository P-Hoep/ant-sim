import * as THREE from 'three';
import { LAYER, NW, HALF } from '../sim/constants.js';
import { Terrain } from './terrain.js';
import { VegetationView } from './vegView.js';
import { NestView } from './nestView.js';
import { AntsView } from './antsView.js';
import { Rain, NuptialFlight, PredatorsView, DumpView } from './effects.js';
import { CameraRig } from './camera.js';

const SKY_VS = `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * p; }`;
const SKY_FS = `varying vec3 vDir; uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uGround; uniform vec3 uSunDir; uniform vec3 uSunCol;
void main(){ vec3 d = normalize(vDir); float h = d.y;
  vec3 c = mix(uHorizon, uTop, pow(clamp(h,0.0,1.0), 0.45));
  c = mix(c, uGround, clamp(-h * 4.0, 0.0, 1.0));
  float s = max(dot(d, normalize(uSunDir)), 0.0);
  c += uSunCol * (pow(s, 900.0) * 6.0 + pow(s, 12.0) * 0.28);
  gl_FragColor = vec4(c, 1.0); }`;

const C = (r, g, b) => new THREE.Color(r, g, b);
const NIGHT_TOP = C(0.01, 0.015, 0.04), DAY_TOP = C(0.2, 0.42, 0.72), DAWN_H = C(0.95, 0.52, 0.28), DAY_H = C(0.72, 0.8, 0.82), NIGHT_H = C(0.03, 0.04, 0.07), GREY = C(0.5, 0.52, 0.54);

export class World3D {
  constructor(container) {
    this.container = container;
    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' }));
    r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    r.setSize(container.clientWidth, container.clientHeight);
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    r.localClippingEnabled = true;
    container.appendChild(r.domElement);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.05, 900);
    this.clipPlane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 500);
    this.clip = [this.clipPlane];
    this.raycaster = new THREE.Raycaster();
    window.addEventListener('resize', () => this.resize());

    // sky & light
    this.skyU = { uTop: { value: DAY_TOP.clone() }, uHorizon: { value: DAY_H.clone() }, uGround: { value: C(0.06, 0.05, 0.04) }, uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: C(1, 0.9, 0.7) } };
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), new THREE.ShaderMaterial({ vertexShader: SKY_VS, fragmentShader: SKY_FS, uniforms: this.skyU, side: THREE.BackSide, depthWrite: false, fog: false }));
    this.sky.renderOrder = -1;
    this.scene.add(this.sky);
    this.scene.fog = new THREE.FogExp2(0x9fb0b0, 0.006);
    this.sun = new THREE.DirectionalLight(0xfff0d8, 3);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.03;
    const sc = this.sun.shadow.camera;
    sc.left = -45; sc.right = 45; sc.top = 45; sc.bottom = -45; sc.near = 1; sc.far = 260;
    this.scene.add(this.sun, this.sun.target);
    this.moon = new THREE.DirectionalLight(0x6f86c8, 0.0);
    this.scene.add(this.moon);
    this.hemi = new THREE.HemisphereLight(0xcfe4ff, 0x4a3a28, 0.6);
    this.scene.add(this.hemi);
    this.nestLight = new THREE.DirectionalLight(0xffd8a8, 0);
    this.nestLight.position.set(-8, -6, 60);
    this.nestLight.target.position.set(0, -20, 0);
    this.scene.add(this.nestLight, this.nestLight.target);
    this.labels = document.createElement('div');
    this.labels.className = 'chamber-labels';
    container.appendChild(this.labels);
    this.labelEls = [];
    this.flash = 0;
    this.time = 0;
    this.overlay = null;
    this.selectedPred = -1;
  }

  setSim(sim) {
    this.sim = sim;
    const clip = this.clip;
    this.terrain = new Terrain(sim, clip);
    this.veg = new VegetationView(sim, clip);
    this.nest = new NestView(sim);
    this.ants = new AntsView(sim, clip);
    this.rain = new Rain(clip);
    this.flight = new NuptialFlight();
    this.preds = new PredatorsView(sim, clip);
    this.dump = new DumpView(sim, clip);
    this.scene.add(this.terrain.mesh, this.veg.group, this.nest.group, this.ants.group, this.rain.mesh, this.flight.mesh, this.preds.group, this.dump.mesh);
    this.rig = new CameraRig(this.camera, this.renderer.domElement, (x, z) => sim.surface.heightAt(x, z));
    this.rig.update(1);
  }

  resize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  handleEvents() {
    const sim = this.sim;
    for (const e of sim.events) {
      if (e.type === 'alate') this.flight.launch(e.x, e.z, e.gyne, sim.surface.heightAt(e.x, e.z));
      else if (e.type === 'lightning') this.flash = 1;
    }
    sim.events.length = 0;
  }

  update(dt) {
    const sim = this.sim, env = sim.env;
    this.time += dt;
    this.handleEvents();
    this.rig.update(dt);
    const clipped = this.rig.clipped;
    const want = clipped ? 0.02 : 500;
    this.clipPlane.constant += (want - this.clipPlane.constant) * Math.min(1, dt * (clipped ? 6 : 2));
    if (!clipped && this.clipPlane.constant > 150) this.clipPlane.constant = 500;

    // time of day
    const e = env.sunElevation();
    const th = 2 * Math.PI * (env.tod - 0.25);
    const sunDir = new THREE.Vector3(Math.cos(th), Math.sin(th), 0.38).normalize();
    const day = THREE.MathUtils.smoothstep(e, -0.12, 0.25);
    const dawn = Math.max(0, 1 - Math.abs(e) / 0.3) * (e > -0.2 ? 1 : 0);
    const cloud = env.cloud;
    const top = NIGHT_TOP.clone().lerp(DAY_TOP, day).lerp(GREY.clone().multiplyScalar(0.2 + 0.6 * day), cloud * 0.8);
    const hor = NIGHT_H.clone().lerp(DAY_H, day).lerp(DAWN_H, dawn * 0.7 * (1 - cloud)).lerp(GREY.clone().multiplyScalar(0.25 + 0.65 * day), cloud * 0.7);
    this.flash = Math.max(0, this.flash - dt * 3);
    if (this.flash > 0) { top.lerp(C(0.8, 0.85, 1), this.flash * 0.7); hor.lerp(C(0.9, 0.9, 1), this.flash * 0.7); }
    this.skyU.uTop.value.copy(top);
    this.skyU.uHorizon.value.copy(hor);
    this.skyU.uSunDir.value.copy(sunDir);
    this.skyU.uSunCol.value.setRGB(1, 0.85 - dawn * 0.3, 0.6 - dawn * 0.3).multiplyScalar(day * (1 - cloud * 0.85));
    this.sky.position.copy(this.camera.position);
    this.scene.fog.color.copy(hor);
    this.scene.fog.density = (clipped ? 0.002 : 0.0035) + env.rain * 0.004 + (1 - day) * 0.0015;

    const tgt = this.rig.t;
    this.sun.position.copy(tgt).addScaledVector(sunDir, 120);
    this.sun.target.position.copy(tgt);
    this.sun.intensity = Math.max(0, day * 3.2 * (1 - cloud * 0.7));
    this.sun.color.setRGB(1, 0.9 - dawn * 0.25, 0.8 - dawn * 0.35);
    const sc = this.sun.shadow.camera;
    const ext = THREE.MathUtils.clamp(this.rig.dist * 0.9, 12, 70);
    if (Math.abs(sc.right - ext) > 2) { sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext; sc.updateProjectionMatrix(); }
    this.moon.position.copy(tgt).add(new THREE.Vector3(-sunDir.x * 100, 60, -30));
    this.moon.target.position.copy(tgt);
    this.moon.intensity = (1 - day) * 0.45;
    this.hemi.intensity = 0.25 + day * 0.65 + this.flash * 2;
    this.hemi.color.copy(top).lerp(C(1, 1, 1), 0.4);
    this.nestLight.intensity += ((clipped ? 1.0 : 0.15) - this.nestLight.intensity) * Math.min(1, dt * 3);

    this.terrain.update(dt, this.overlaySurface());
    this.veg.update(dt, this.time);
    this.nest.update(dt, this.overlayNest(), clipped || this.rig.dist < 80);
    this.ants.update(this.camera, this.time, sim.selected);
    this.rain.update(dt, env, this.camera.position);
    this.flight.update(dt);
    this.preds.update(dt, this.selectedPred);
    this.dump.update();
    this.renderer.render(this.scene, this.camera);
    this.updateLabels(clipped);
  }

  // Chamber names as crisp screen-space labels in the cutaway.
  updateLabels(show) {
    const nest = this.sim.nest;
    const list = show && this.rig.dist < 70 ? nest.chambers.filter((c) => c.cells.length >= 8) : [];
    while (this.labelEls.length < list.length) { const d = document.createElement('div'); this.labels.appendChild(d); this.labelEls.push(d); }
    const w = this.container.clientWidth, h = this.container.clientHeight;
    const v = new THREE.Vector3();
    for (let k = 0; k < this.labelEls.length; k++) {
      const el = this.labelEls[k], ch = list[k];
      if (!ch) { el.style.display = 'none'; continue; }
      const top = Math.min(...ch.cells.map((c) => (c / NW) | 0));
      v.set(nest.wx(ch.cx), nest.wy(top) + 0.6, 0.4).project(this.camera);
      if (v.z > 1) { el.style.display = 'none'; continue; }
      el.style.display = 'block';
      el.style.transform = `translate(-50%, -100%) translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px)`;
      if (el.textContent !== ch.name) el.textContent = ch.name;
    }
  }

  overlaySurface() {
    const o = this.overlay;
    return ['pheromones', 'territory', 'traffic', 'food', 'temperature', 'humidity'].includes(o) ? o : null;
  }
  overlayNest() {
    const o = this.overlay;
    return ['temperature', 'humidity', 'traffic', 'fungus', 'disease', 'population'].includes(o) ? o : null;
  }

  // Returns the point under the cursor: {layer, x, y} underground or {layer, x, z} on the surface.
  pickPoint(clientX, clientY) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const { origin: o, direction: d } = this.raycaster.ray;
    const surf = this.sim.surface;
    const clipped = this.rig.clipped;
    if (clipped && Math.abs(d.z) > 1e-4) {
      const t = -o.z / d.z;
      if (t > 0) {
        const x = o.x + d.x * t, y = o.y + d.y * t;
        if (y < surf.heightAt(x, 0) - 0.05 && y > -48 && Math.abs(x) < 64) return { layer: LAYER.NEST, x, y };
      }
    }
    let t = 0;
    for (let i = 0; i < 800; i++) {
      const x = o.x + d.x * t, y = o.y + d.y * t, z = o.z + d.z * t;
      if (Math.abs(x) > HALF + 40 || Math.abs(z) > HALF + 40 || y < -60) break;
      const h = surf.heightAt(x, z);
      if (y <= h && !(clipped && z > 0.05)) return { layer: LAYER.SURFACE, x, z };
      t += Math.max(0.05, (y - h) * 0.4);
    }
    return null;
  }

  // What entity is under the cursor?
  pickEntity(clientX, clientY) {
    const p = this.pickPoint(clientX, clientY);
    if (!p) return null;
    const sim = this.sim, A = sim.ants;
    const rad = THREE.MathUtils.clamp(this.rig.dist * 0.018, 0.35, 2.5);
    let best = -1, bd = rad * rad;
    for (let i = 0; i < A.count; i++) {
      if (!A.alive[i] || A.layer[i] !== p.layer) continue;
      const dx = A.x[i] - p.x, dy = A.y[i] - (p.layer === LAYER.NEST ? p.y : p.z);
      const d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = i; }
    }
    if (best >= 0) return { kind: 'ant', id: best, point: p };
    if (p.layer === LAYER.SURFACE) {
      for (const pr of sim.predators.list) if (Math.hypot(pr.x - p.x, pr.z - p.z) < 1.5 + pr.reach) return { kind: 'predator', id: pr.id, point: p };
      for (const r of sim.rivals) if (r.alive && Math.hypot(r.nestX - p.x, r.nestZ - p.z) < 4) return { kind: 'rival', id: r.id, point: p };
      let bp = null, bpd = 1e9;
      for (const pl of sim.veg.nearby(p.x, p.z, 6)) { const d = Math.hypot(pl.x - p.x, pl.z - p.z) - pl.r; if (d < 0.6 && d < bpd) { bpd = d; bp = pl; } }
      if (bp) return { kind: 'plant', id: bp.id, point: p };
    } else {
      const q = sim.colony.queen;
      if (Math.hypot(q.x - p.x, q.y - p.y) < 1.2) return { kind: 'queen', point: p };
      const c = sim.nest.cellAt(p.x, p.y);
      if (c >= 0 && sim.nest.chamberOf[c] >= 0) return { kind: 'chamber', id: sim.nest.chamberOf[c], point: p };
      if (c >= 0) return { kind: 'cell', id: c, point: p };
    }
    return { kind: 'ground', point: p };
  }
}

export { NW };
