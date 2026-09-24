import * as THREE from 'three';
import { HALF, clamp } from '../sim/constants.js';

const LIMITS = {
  surface: { dMin: 1.2, dMax: 170, pMin: 0.1, pMax: 1.5 },
  cutaway: { dMin: 2.5, dMax: 120, pMin: -0.3, pMax: 0.75 },
  ground: { dMin: 1, dMax: 30, pMin: 0.03, pMax: 0.6 },
  follow: { dMin: 0.5, dMax: 40, pMin: -0.2, pMax: 1.4 },
  micro: { dMin: 0.25, dMax: 3, pMin: -0.2, pMax: 1.4 },
};

export class CameraRig {
  constructor(camera, dom, heightAt) {
    this.cam = camera;
    this.dom = dom;
    this.heightAt = heightAt;
    this.t = new THREE.Vector3(0, 0, 0);
    this.yaw = 0.55; this.pitch = 0.95; this.dist = 70;
    this.g = { t: new THREE.Vector3(0, 0, 0), yaw: 0.55, pitch: 0.82, dist: 48 };
    this.mode = 'surface';
    this.follow = null;       // () => {x,y,z,nest} | null
    this.keys = {};
    this.onClick = null;
    this.onPaint = null;
    this.isPainting = () => false;
    this.drag = null;
    this.bind();
  }

  bind() {
    const el = this.dom;
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('pointerdown', (e) => {
      el.setPointerCapture(e.pointerId);
      this.drag = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, button: e.button, moved: 0, paint: e.button === 0 && this.isPainting() };
      if (this.drag.paint && this.onPaint) this.onPaint(e, true);
    });
    el.addEventListener('pointermove', (e) => {
      const d = this.drag;
      if (!d) return;
      const dx = e.clientX - d.x, dy = e.clientY - d.y;
      d.x = e.clientX; d.y = e.clientY;
      d.moved += Math.abs(dx) + Math.abs(dy);
      if (d.paint) { if (this.onPaint) this.onPaint(e, false); return; }
      const rotate = d.button === 2 || (d.button === 0 && e.shiftKey);
      if (d.button === 1 || rotate) {
        this.g.yaw -= dx * 0.005;
        this.g.pitch += dy * 0.004;
        if (this.mode === 'cutaway') this.g.yaw = clamp(this.g.yaw, -0.7, 0.7);
      } else if (d.button === 0) this.pan(dx, dy);
    });
    el.addEventListener('pointerup', (e) => {
      const d = this.drag;
      this.drag = null;
      if (d && d.button === 0 && d.moved < 6 && !d.paint && this.onClick) this.onClick(e);
    });
    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.g.dist *= Math.exp(e.deltaY * 0.0012);
    }, { passive: false });
    window.addEventListener('keydown', (e) => { if (e.target.tagName !== 'INPUT') this.keys[e.code] = true; });
    window.addEventListener('keyup', (e) => { this.keys[e.code] = false; });
  }

  pan(dx, dy) {
    if (this.follow) this.stopFollow();
    const s = this.dist * 0.0016;
    if (this.mode === 'cutaway') {
      this.g.t.x -= dx * s;
      this.g.t.y += dy * s;
    } else {
      const c = Math.cos(this.yaw), sn = Math.sin(this.yaw);
      this.g.t.x += -dx * s * c - dy * s * sn;
      this.g.t.z += dx * s * sn - dy * s * c;
    }
  }

  setMode(mode) {
    const prev = this.mode;
    this.mode = mode;
    const g = this.g;
    if (mode === 'surface') {
      if (prev === 'cutaway') g.t.set(g.t.x, 0, 4);
      g.pitch = 0.82; g.dist = Math.max(g.dist, 30); g.yaw = prev === 'cutaway' ? 0.4 : g.yaw;
      this.follow = null;
    } else if (mode === 'cutaway') {
      g.t.set(clamp(g.t.x, -40, 40), -16, 0);
      g.yaw = 0; g.pitch = 0.1; g.dist = 44;
      this.follow = null;
    } else if (mode === 'ground') {
      if (prev === 'cutaway') g.t.set(g.t.x, 0, 6);
      g.pitch = 0.1; g.dist = 6;
      this.follow = null;
    } else if (mode === 'follow') {
      g.dist = 3.5; g.pitch = 0.55;
    } else if (mode === 'micro') {
      g.dist = 0.9; g.pitch = 0.45;
    }
  }

  startFollow(fn, micro = false) {
    this.follow = fn;
    this.setMode(micro ? 'micro' : 'follow');
  }
  stopFollow() {
    if (!this.follow) return;
    const p = this.follow();
    this.follow = null;
    this.mode = p && p.nest ? 'cutaway' : 'surface';
    if (p && p.nest) { this.g.yaw = 0; this.g.pitch = 0.1; }
  }

  get clipped() {
    if (this.mode === 'cutaway') return true;
    if (this.follow) { const p = this.follow(); return !!(p && p.nest); }
    return false;
  }

  focus(x, y, z, nest) {
    this.stopFollow();
    if (nest) {
      if (this.mode !== 'cutaway') this.setMode('cutaway');
      this.g.t.set(x, y, 0);
      this.g.dist = Math.min(this.g.dist, 22);
    } else {
      if (this.mode === 'cutaway') this.setMode('surface');
      this.g.t.set(x, 0, z);
      this.g.dist = Math.min(this.g.dist, 25);
    }
  }

  update(dt) {
    const k = this.keys, g = this.g;
    const sp = 500 * dt;
    if (k.KeyW || k.ArrowUp) this.pan(0, sp);
    if (k.KeyS || k.ArrowDown) this.pan(0, -sp);
    if (k.KeyA || k.ArrowLeft) this.pan(sp, 0);
    if (k.KeyD || k.ArrowRight) this.pan(-sp, 0);
    if (k.KeyQ) g.yaw += dt * 1.2;
    if (k.KeyE) g.yaw -= dt * 1.2;
    if (k.Equal || k.NumpadAdd) g.dist *= Math.exp(-dt * 1.5);
    if (k.Minus || k.NumpadSubtract) g.dist *= Math.exp(dt * 1.5);

    let fp = null;
    if (this.follow) {
      fp = this.follow();
      if (!fp) { this.follow = null; this.mode = 'surface'; }
      else {
        g.t.set(fp.x, fp.y, fp.z);
        if (fp.nest) { g.yaw = clamp(g.yaw, -0.6, 0.6); }
      }
    }
    const L = LIMITS[this.follow ? this.mode : this.mode] || LIMITS.surface;
    g.dist = clamp(g.dist, L.dMin, L.dMax);
    g.pitch = clamp(g.pitch, fp && fp.nest ? -0.3 : L.pMin, L.pMax);
    if (this.mode === 'cutaway') {
      g.t.x = clamp(g.t.x, -62, 62); g.t.y = clamp(g.t.y, -44, 6); g.t.z = 0;
    } else if (!this.follow) {
      g.t.x = clamp(g.t.x, -HALF, HALF); g.t.z = clamp(g.t.z, -HALF, HALF);
      g.t.y = this.heightAt(g.t.x, g.t.z);
    }

    const a = 1 - Math.exp(-dt * (this.follow ? 10 : 7));
    this.t.lerp(g.t, a);
    let dy = g.yaw - this.yaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    this.yaw += dy * a;
    this.pitch += (g.pitch - this.pitch) * a;
    this.dist *= Math.exp((Math.log(g.dist) - Math.log(this.dist)) * a);

    const cp = Math.cos(this.pitch);
    const cam = this.cam;
    cam.position.set(this.t.x + Math.sin(this.yaw) * cp * this.dist, this.t.y + Math.sin(this.pitch) * this.dist, this.t.z + Math.cos(this.yaw) * cp * this.dist);
    // keep the camera above the ground on the surface
    if (!this.clipped) {
      const h = this.heightAt(cam.position.x, cam.position.z) + 0.15;
      if (cam.position.y < h) cam.position.y = h;
    }
    cam.lookAt(this.t);
    const near = clamp(this.dist * 0.01, 0.02, 1.5);
    if (Math.abs(cam.near - near) > near * 0.2) { cam.near = near; cam.updateProjectionMatrix(); }
  }
}
