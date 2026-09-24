import { TASK_NAMES, CASTE_NAMES, PRIORITY_KEYS, PRIORITY_TASK, TASK, ZONE, ZONE_NAMES, LAYER, CARRY, NW, NTASK, CASTE } from '../sim/constants.js';
import { SPECIES } from '../sim/vegetation.js';
import { PRED_TYPES } from '../sim/predators.js';
import { PHASE_TEXT } from '../sim/ants.js';
import { SCENARIOS } from '../sim/scenarios.js';
import { KNOWLEDGE, LEVEL } from './knowledge.js';

const $ = (sel, el = document) => el.querySelector(sel);
const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
const fmt = (n) => n >= 10000 ? (n / 1000).toFixed(1) + 'k' : Math.round(n).toLocaleString();
const pct = (v) => Math.round(v * 100) + '%';
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const STAGES = ['Foundress', 'Founding colony', 'Growing colony', 'Mature colony', 'Supercolony', 'Reproductive colony'];
const PRIO_LABEL = { forage: 'Foraging', dig: 'Excavation', nurse: 'Nursery', garden: 'Fungus', defend: 'Defence', waste: 'Waste', explore: 'Exploration' };
const TOOLS = [
  ['select', 'Select', null], ['dig', 'Dig tunnel', '#e2b454'], ['garden', 'Fungus garden', '#e8dcc0'], ['nursery', 'Nursery', '#f0c070'],
  ['waste', 'Waste chamber', '#8a8272'], ['store', 'Leaf store', '#9ccf6a'], ['vent', 'Ventilation', '#6fb0dc'], ['erase', 'Cancel / unzone', '#e5654e'],
];
const GOD_TOOLS = [['plant', 'Plant vegetation'], ['clearveg', 'Clear vegetation'], ['spider', 'Drop spider'], ['lizard', 'Drop lizard'], ['toad', 'Drop toad'], ['phorid', 'Release phorid fly']];
const OVERLAYS = [
  ['pheromones', 'Pheromones', '#9ccf6a'], ['territory', 'Territory', '#c08be0'], ['traffic', 'Traffic', '#e2b454'], ['food', 'Food plants', '#8ab84a'],
  ['temperature', 'Temperature', '#e5654e'], ['humidity', 'Humidity', '#6fb0dc'], ['fungus', 'Fungus health', '#e8dcc0'], ['disease', 'Disease', '#d060c0'],
];

export class UI {
  constructor(game) {
    this.game = game;
    this.root = $('#ui');
    this.tab = 'colony';
    this.tool = 'select';
    this.brush = 1;
    this.selection = null;
    this.acc = 0;
  }

  // ---------- title ----------
  showTitle(onStart) {
    const daughter = loadDaughter();
    const cards = Object.entries(SCENARIOS)
      .filter(([k]) => k !== 'daughter' || daughter)
      .map(([k, s]) => `<div class="c panel" data-s="${k}"><div class="st">${s.stage}</div><h3>${s.title}</h3><p>${s.desc}</p></div>`).join('');
    const el = h(`<div id="title">
      <h1><b>LEAFCUTTER</b> Colony</h1>
      <div class="tag">Shape the colony's world. Thousands of ants decide the rest.</div>
      <div class="scen">${cards}</div>
      <div class="foot">Atta leafcutter ants · simulation-first natural history<br/>Left-drag pan · right-drag rotate · wheel zoom · click to inspect · Space pause · C cutaway</div>
    </div>`);
    this.root.appendChild(el);
    el.querySelectorAll('.c').forEach((c) => c.addEventListener('click', () => {
      el.innerHTML = '<div id="loading">Growing the forest…</div>';
      setTimeout(() => { el.remove(); onStart(c.dataset.s, c.dataset.s === 'daughter' ? daughter : null); }, 30);
    }));
  }

  // ---------- main HUD ----------
  build() {
    const r = this.root;
    r.innerHTML = '';
    r.appendChild(h(`<div id="topbar" class="panel">
      <div class="brand">LEAFCUTTER <span>Colony</span></div>
      <div class="stat"><span class="k">Population</span><span class="v" id="s-pop">0</span></div>
      <div class="stat"><span class="k">Food</span><span class="v" id="s-food">0</span></div>
      <div class="stat"><span class="k">Fungus</span><span class="v" id="s-fung">0</span></div>
      <div class="stat"><span class="k">Brood</span><span class="v" id="s-brood">0</span></div>
      <div class="stat"><span class="k">Leaves</span><span class="v" id="s-leaf">0</span></div>
      <div class="stat"><span class="k">Queen</span><span class="v" id="s-queen">0</span></div>
      <div class="stat" style="min-width:120px"><span class="k">Stage</span><span class="v" id="s-stage" style="font-family:var(--sans);font-size:13px">—</span></div>
      <div class="spacer"></div>
      <div id="clock"><div class="t" id="c-t"></div><div class="s" id="c-s"></div></div>
      <div id="speed">
        <button data-sp="0" title="Pause (Space)">❚❚</button><button data-sp="1">▶ 1×</button><button data-sp="2">▶▶ 2×</button><button data-sp="5">5×</button><button data-sp="10">10×</button>
      </div>
    </div>`));
    r.appendChild(h('<div id="paused" class="panel hidden">PAUSED — INSPECT FREELY</div>'));
    r.appendChild(h('<div id="alerts"></div>'));
    r.appendChild(h(`<div id="left">
      <div class="panel"><div class="h">View</div><div class="btncol" id="views">
        <button data-v="surface">Strategic <kbd>1</kbd></button>
        <button data-v="cutaway">Colony cutaway <kbd>C</kbd></button>
        <button data-v="ground">Ground level <kbd>G</kbd></button>
        <button data-v="follow">Follow ant <kbd>F</kbd></button>
        <button data-v="micro">Microscope <kbd>M</kbd></button>
      </div></div>
      <div class="panel"><div class="h">Information layers</div><div class="btncol" id="layers">
        ${OVERLAYS.map(([k, n, c]) => `<button data-o="${k}"><span><span class="swatch" style="background:${c}"></span>${n}</span></button>`).join('')}
      </div></div>
    </div>`));
    r.appendChild(h('<div id="inspector" class="panel"></div>'));
    r.appendChild(h(`<div id="bottom"><div id="panel" class="panel"></div>
      <div id="tabs" class="panel">
        <button data-t="colony">Colony</button><button data-t="infra">Infrastructure</button><button data-t="ecology">Ecology</button><button data-t="research">Research</button><button data-t="god">God Mode</button>
      </div></div>`));
    r.appendChild(h(`<div id="hint" class="panel"><b>Left-drag</b> pan · <b>Right-drag</b> rotate<br/><b>Wheel</b> zoom · <b>Click</b> inspect<br/><b>Space</b> pause · <b>2–5</b> speed<br/><b>1</b> strategic · <b>C</b> cutaway<br/><b>Esc</b> deselect</div>`));
    r.appendChild(h('<div id="why" class="hidden"><div class="card panel"></div></div>'));
    r.appendChild(h('<div id="vignette"></div>'));

    r.querySelectorAll('#speed button').forEach((b) => b.addEventListener('click', () => this.game.setSpeed(+b.dataset.sp)));
    r.querySelectorAll('#views button').forEach((b) => b.addEventListener('click', () => this.setView(b.dataset.v)));
    r.querySelectorAll('#layers button').forEach((b) => b.addEventListener('click', () => {
      const w = this.game.world;
      w.overlay = w.overlay === b.dataset.o ? null : b.dataset.o;
      if (['fungus', 'disease'].includes(w.overlay) && !w.rig.clipped) this.setView('cutaway');
      this.refreshButtons();
    }));
    r.querySelectorAll('#tabs button').forEach((b) => b.addEventListener('click', () => this.setTab(b.dataset.t)));
    $('#why').addEventListener('click', (e) => { if (e.target.id === 'why') this.closeWhy(); });
    this.setTab('colony');
    this.bindKeys();
    this.bindWorld();
    this.refreshButtons();
  }

  bindKeys() {
    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT') return;
      const g = this.game;
      if (e.code === 'Space') { e.preventDefault(); g.setSpeed(g.speed === 0 ? g.lastSpeed || 1 : 0); }
      else if (e.code === 'Digit1' && !e.shiftKey) this.setView('surface');
      else if (e.code === 'KeyC') this.setView(g.world.rig.mode === 'cutaway' ? 'surface' : 'cutaway');
      else if (e.code === 'KeyG') this.setView('ground');
      else if (e.code === 'KeyF') this.setView('follow');
      else if (e.code === 'KeyM') this.setView('micro');
      else if (e.code === 'Escape') { this.closeWhy(); this.select(null); this.setTool('select'); g.world.rig.stopFollow(); this.refreshButtons(); }
      else if (e.code === 'Digit2') g.setSpeed(1);
      else if (e.code === 'Digit3') g.setSpeed(2);
      else if (e.code === 'Digit4') g.setSpeed(5);
      else if (e.code === 'Digit5') g.setSpeed(10);
    });
  }

  bindWorld() {
    const w = this.game.world, rig = w.rig, sim = this.game.sim;
    rig.onClick = (e) => {
      const hit = w.pickEntity(e.clientX, e.clientY);
      this.select(hit && hit.kind !== 'ground' && hit.kind !== 'cell' ? hit : null);
    };
    rig.isPainting = () => this.tool !== 'select';
    let lastPlant = 0;
    rig.onPaint = (e, down) => {
      const p = w.pickPoint(e.clientX, e.clientY);
      if (!p) return;
      const t = this.tool;
      if (TOOLS.some(([k]) => k === t)) {
        if (p.layer !== LAYER.NEST) return;
        const nest = sim.nest;
        const c0 = Math.floor((p.x + 40) / 0.5), r0 = Math.floor(-p.y / 0.5);
        const R = this.brush - 1;
        for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
          if (dx * dx + dy * dy > R * R + R) continue;
          const c = c0 + dx, rr = r0 + dy;
          if (c < 0 || rr < 0 || c >= NW || rr >= nest.H) continue;
          nest.paint(rr * NW + c, t);
        }
        return;
      }
      if (p.layer !== LAYER.SURFACE) return;
      if (t === 'plant') {
        if (!down && performance.now() - lastPlant < 250) return;
        lastPlant = performance.now();
        const sp = sim.rng.pick([0, 1, 1, 2, 3, 4, 5]);
        if (sim.veg.validSpot(p.x, p.z, 1)) sim.veg.addPlant(sp, p.x, p.z, 0.6);
      } else if (t === 'clearveg') sim.veg.removeIn(p.x, p.z, 4);
      else if (down && PRED_TYPES[t]) sim.predators.spawn(t, p.x, p.z);
    };
  }

  setView(v) {
    const w = this.game.world, rig = w.rig, sim = this.game.sim;
    if (v === 'follow' || v === 'micro') {
      let i = this.selection && this.selection.kind === 'ant' ? this.selection.id : -1;
      if (i < 0) {
        // pick an interesting ant: a forager carrying a leaf, near the camera
        const A = sim.ants;
        let best = -1, bd = 1e9;
        for (let k = 0; k < A.count; k++) {
          if (!A.alive[k] || A.colony[k] !== 0) continue;
          const score = (A.carry[k] === CARRY.LEAF ? 0 : 50) + Math.abs(A.x[k] - rig.t.x) + (A.layer[k] === LAYER.SURFACE ? 0 : 30);
          if (score < bd) { bd = score; best = k; }
        }
        i = best;
        if (i >= 0) this.select({ kind: 'ant', id: i });
      }
      if (i < 0) return;
      const A = sim.ants;
      rig.startFollow(() => {
        if (!A.alive[i]) return null;
        if (A.layer[i] === LAYER.NEST) return { x: A.x[i], y: A.y[i], z: 0.3, nest: true };
        return { x: A.x[i], y: sim.surface.heightAt(A.x[i], A.y[i]) + 0.1, z: A.y[i], nest: false };
      }, v === 'micro');
    } else {
      rig.follow = null;
      rig.setMode(v);
    }
    this.refreshButtons();
  }

  setTab(t) {
    this.tab = this.tab === t && $('#panel').innerHTML ? null : t;
    const p = $('#panel');
    p.classList.toggle('hidden', !this.tab);
    this.tabView = null;
    if (this.tab) {
      p.innerHTML = '';
      this.tabView = this['tab_' + this.tab](p);
    }
    if (this.tab !== 'infra' && this.tab !== 'god') this.setTool('select');
    this.root.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.t === this.tab));
  }

  setTool(t) {
    this.tool = t;
    if (TOOLS.some(([k]) => k === t) && t !== 'select' && this.game.world.rig && !this.game.world.rig.clipped) this.setView('cutaway');
    this.root.querySelectorAll('[data-tool]').forEach((b) => b.classList.toggle('on', b.dataset.tool === t));
    this.game.world.renderer.domElement.style.cursor = t === 'select' ? 'default' : 'crosshair';
  }

  refreshButtons() {
    const w = this.game.world, rig = w.rig;
    const mode = rig.follow ? rig.mode : rig.mode;
    this.root.querySelectorAll('#views button').forEach((b) => b.classList.toggle('on', b.dataset.v === mode));
    this.root.querySelectorAll('#layers button').forEach((b) => b.classList.toggle('on', b.dataset.o === w.overlay));
    this.root.querySelectorAll('#speed button').forEach((b) => b.classList.toggle('on', +b.dataset.sp === this.game.speed));
    $('#paused').classList.toggle('hidden', this.game.speed !== 0);
    $('#vignette').classList.toggle('on', rig.mode === 'micro');
  }

  select(hit) {
    const sim = this.game.sim;
    this.selection = hit;
    sim.selected = hit && hit.kind === 'ant' ? hit.id : -1;
    this.game.world.selectedPred = hit && hit.kind === 'predator' ? hit.id : -1;
    this.game.world.nest.highlight = hit && hit.kind === 'chamber' ? hit.id : null;
    this.game.world.nest.acc.draw = 99;
    this.renderInspector();
  }

  // ---------- periodic update ----------
  update(dt) {
    this.acc += dt;
    if (this.acc < 0.25) return;
    this.acc = 0;
    const sim = this.game.sim, col = sim.colony, env = sim.env;
    const set = (id, v, cls) => { const e = $('#' + id); e.textContent = v; e.className = 'v' + (cls ? ' ' + cls : ''); };
    set('s-pop', fmt(col.workers));
    set('s-food', pct(col.foodFrac), col.foodFrac < 0.15 ? 'bad' : col.foodFrac < 0.35 ? 'warn' : '');
    const gc = sim.nest.gardenCells.length;
    const fh = gc ? col.fungusTotal / gc : 0;
    set('s-fung', pct(fh * (1 - (col.avgContam || 0))), fh < 0.3 || col.avgContam > 0.2 ? 'bad' : fh < 0.5 ? 'warn' : 'good');
    set('s-brood', fmt(col.brood.length));
    set('s-leaf', col.leafCache.toFixed(0));
    set('s-queen', col.queen.alive ? pct(col.queen.health) : 'DEAD', !col.queen.alive || col.queen.health < 0.5 ? 'bad' : '');
    $('#s-stage').textContent = STAGES[col.stage];
    $('#c-t').textContent = `Day ${Math.floor(env.day) + 1} · ${env.timeString()}`;
    $('#c-s').textContent = `${env.seasonName} · Yr ${env.year} · ${env.weatherLabel} · ${env.temp.toFixed(1)}°C`;
    if (sim.selectedLost) { sim.selectedLost = false; if (this.selection && this.selection.kind === 'ant') { this.selection.dead = true; } }
    this.renderAlerts();
    this.renderInspector();
    if (this.tabView && this.tabView.update) this.tabView.update();
    this.refreshButtons();
  }

  renderAlerts() {
    const sim = this.game.sim;
    const el = $('#alerts');
    const ids = sim.alerts.list.map((a) => a.id).join(',');
    if (el.dataset.ids === ids) return;
    el.dataset.ids = ids;
    el.innerHTML = '';
    for (const a of sim.alerts.list) {
      const icon = { critical: '!', warn: '!', info: 'i', good: '✓' }[a.level];
      const n = h(`<div class="alert ${a.level}"><span class="ic">${icon}</span><span>${esc(a.text)}</span>${a.why ? '<span class="why">Why?</span>' : ''}</div>`);
      n.addEventListener('click', (e) => {
        if (e.target.classList.contains('why')) { this.openWhy(a.why); return; }
        if (a.focus) {
          const f = a.focus;
          this.game.world.rig.focus(f.x, f.y ?? 0, f.z ?? 0, f.layer === LAYER.NEST);
          if (f.chamber !== undefined) this.select({ kind: 'chamber', id: f.chamber });
          if (f.predator !== undefined) this.select({ kind: 'predator', id: f.predator });
          this.refreshButtons();
        }
      });
      el.appendChild(n);
    }
  }

  // ---------- inspector ----------
  renderInspector() {
    const el = $('#inspector'), sim = this.game.sim, s = this.selection;
    if (!s) { el.innerHTML = ''; return; }
    let html = '';
    const bar = (v, color) => `<div class="bar"><i style="width:${Math.max(0, Math.min(100, v * 100))}%;${color ? 'background:' + color : ''}"></i></div>`;
    const why = (key, label = 'Why does this happen?') => `<button data-why="${key}">${label}</button>`;
    if (s.kind === 'ant') {
      const A = sim.ants, i = s.id;
      if (!A.alive[i] || s.dead) { html = `<h3>Deceased worker</h3><div class="sub">This ant has died. Its body becomes refuse for the waste workers.</div>`; }
      else {
        const col = sim.colonies[A.colony[i]];
        const caste = CASTE_NAMES[A.caste[i]];
        const ex = [];
        for (let t = 1; t < NTASK; t++) ex.push([t, A.exp[i * NTASK + t]]);
        ex.sort((a, b) => b[1] - a[1]);
        const carry = ['nothing', `leaf fragment (${SPECIES[A.carrySp[i]].name})`, 'soil pellet', 'refuse', 'brood'][A.carry[i]];
        const doing = A.ridingOn[i] >= 0 ? PHASE_TEXT[6] : PHASE_TEXT[A.phase[i]] || '…';
        html = `<h3>${caste}${A.colony[i] ? ' <span class="muted" style="font-size:12px">(rival)</span>' : ''}</h3>
          <div class="sub">${col.species} · head width ${(A.size[i] * 1.35).toFixed(2)} mm · ${A.layer[i] ? 'underground' : 'surface'}</div>
          <div class="doing"><b>${TASK_NAMES[A.task[i]]}</b> — ${doing}</div>
          <div class="kv">
            <span class="k">Age</span><span class="v">${A.age[i].toFixed(1)} / ${A.maxAge[i].toFixed(0)} d</span>
            <span class="k">Carrying</span><span class="v" style="max-width:170px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${carry}</span>
            <span class="k">Temperature</span><span class="v">${A.tempExp[i].toFixed(1)}°C</span>
            <span class="k">Pheromone sensed</span><span class="v">${A.pher[i].toFixed(2)}</span>
            <span class="k">Antennal contacts</span><span class="v">${Math.round(A.contacts[i])}</span>
            <span class="k">Specialisation</span><span class="v">${ex[0][1] > 0.05 ? TASK_NAMES[ex[0][0]] + ' ' + pct(ex[0][1]) : 'none yet'}</span>
            ${A.parasite[i] ? '<span class="k" style="color:var(--red)">Parasitised</span><span class="v" style="color:var(--red)">phorid larva</span>' : ''}
            ${A.injury[i] > 0.05 ? `<span class="k">Injuries</span><span class="v">${pct(A.injury[i])}</span>` : ''}
          </div>
          <div style="margin-top:8px" class="kv"><span class="k">Energy</span><span class="v">${pct(A.energy[i])}</span></div>${bar(A.energy[i])}
          <div class="kv"><span class="k">Health</span><span class="v">${pct(A.health[i])}</span></div>${bar(A.health[i], A.health[i] < 0.4 ? 'var(--red)' : '')}
          <div class="kv"><span class="k">Hunger</span><span class="v">${pct(Math.min(1, A.hunger[i]))}</span></div>${bar(Math.min(1, A.hunger[i]), 'var(--amber)')}
          <div class="row"><button data-act="follow">Follow</button><button data-act="micro">Microscope</button>${A.colony[i] === 0 ? '<button data-act="whyant">Why this task?</button>' : ''}</div>`;
      }
    } else if (s.kind === 'chamber') {
      const ch = sim.nest.chambers[s.id];
      if (!ch) { html = '<h3>Chamber</h3><div class="sub">This chamber no longer exists.</div>'; }
      else {
        const st = ch.stats || {};
        const z = ch.zone;
        const k = { [ZONE.GARDEN]: 'contamination', [ZONE.NURSERY]: 'nursery', [ZONE.QUEEN]: 'queen', [ZONE.WASTE]: 'waste', [ZONE.STORE]: 'fungusFood', [ZONE.VENT]: 'temperature' }[z];
        html = `<h3>${esc(ch.name)}</h3><div class="sub">${ZONE_NAMES[z]} · ${ch.cells.length} cells · ${(ch.cells.length * 0.25 * 4).toFixed(0)} cm²</div>
          <div class="kv">
            ${z === ZONE.GARDEN ? `<span class="k">Fungal biomass</span><span class="v">${(st.fungus || 0).toFixed(1)} (${pct((st.fungus || 0) / Math.max(1, st.n))})</span>
            <span class="k">Growth</span><span class="v">${(st.growth || 0).toFixed(2)}/min</span>
            <span class="k">Leaf substrate</span><span class="v">${(st.substrate || 0).toFixed(1)}</span>
            <span class="k">Contamination</span><span class="v" style="${st.contam > 0.15 ? 'color:var(--red)' : ''}">${pct(st.contam || 0)}</span>
            <span class="k">Spent refuse</span><span class="v">${(st.refuse || 0).toFixed(1)}</span>` : ''}
            ${z === ZONE.WASTE ? `<span class="k">Waste stored</span><span class="v">${(st.waste || 0).toFixed(1)}</span>` : ''}
            ${z === ZONE.NURSERY ? `<span class="k">Brood here</span><span class="v">${sim.colony.brood.filter((b) => b.cell >= 0 && sim.nest.chamberOf[b.cell] === ch.id).length}</span>` : ''}
            <span class="k">Temperature</span><span class="v">${(st.temp || 0).toFixed(1)}°C</span>
            <span class="k">Humidity</span><span class="v">${pct(st.hum || 0)}</span>
            <span class="k">Water</span><span class="v" style="${st.water > 0.1 ? 'color:var(--blue)' : ''}">${pct(st.water || 0)}</span>
            <span class="k">Workers present</span><span class="v">${st.ants || 0}</span>
          </div>
          <div class="row">${k ? why(k) : ''}</div>`;
      }
    } else if (s.kind === 'plant') {
      const p = sim.veg.plants[s.id], S = SPECIES[p.sp];
      const rej = sim.colony.reject[p.sp];
      html = `<h3>${S.name}</h3><div class="sub">${p.alive ? 'Living plant' : 'Dead'} · reach ${p.r.toFixed(1)}</div>
        <div class="kv"><span class="k">Leaf biomass</span><span class="v">${p.biomass.toFixed(0)} / ${p.max.toFixed(0)}</span></div>${bar(p.biomass / p.max)}
        <div class="kv" style="margin-top:6px">
          <span class="k">Substrate quality</span><span class="v">${pct(S.quality)}</span>
          <span class="k">Antifungal compounds</span><span class="v">${S.toxin > 0.3 ? (rej > 0.2 ? 'detected by fungus' : 'unknown to ants') : 'none'}</span>
          <span class="k">Colony rejection</span><span class="v">${pct(rej)}</span>
        </div><div class="row">${why(S.toxin > 0.3 ? 'rejection' : 'fungusFood')}</div>`;
    } else if (s.kind === 'predator') {
      const p = sim.predators.list.find((x) => x.id === s.id);
      if (!p) html = '<h3>Predator</h3><div class="sub">It has left or been killed.</div>';
      else html = `<h3>${p.name}</h3><div class="sub">${p.state === 'leave' ? 'Leaving the area' : p.state === 'sit' ? 'Waiting in ambush' : 'Hunting'}</div>
        <div class="kv"><span class="k">Health</span><span class="v">${pct(p.hp / p.maxHp)}</span></div>${bar(p.hp / p.maxHp, 'var(--red)')}
        <div class="kv" style="margin-top:6px"><span class="k">${p.type === 'phorid' ? 'Ants parasitised' : 'Ants eaten'}</span><span class="v">${p.eaten}</span>
        <span class="k">Harassed by defenders</span><span class="v">${p.harassed > 0 ? 'yes' : 'no'}</span></div>
        <div class="row">${why(p.type === 'phorid' ? 'phorid' : 'predators')}${why('defense', 'How do ants defend?')}</div>`;
    } else if (s.kind === 'queen') {
      const q = sim.colony.queen;
      html = `<h3>The Queen</h3><div class="sub">Atta cephalotes · ${q.alive ? 'alive' : 'dead'}</div>
        <div class="kv"><span class="k">Health</span><span class="v">${pct(q.health)}</span></div>${bar(q.health)}
        <div class="kv" style="margin-top:6px"><span class="k">Age</span><span class="v">${(q.age / 365).toFixed(1)} yr</span>
        <span class="k">Egg laying</span><span class="v">${q.eggRate.toFixed(0)}/day</span>
        ${q.reserve > 0 ? `<span class="k">Body reserves</span><span class="v">${q.reserve.toFixed(1)}</span>` : ''}</div>
        <div class="row">${why('queen')}${q.reserve > 0 ? why('founding', 'Founding') : ''}</div>`;
    } else if (s.kind === 'rival') {
      const r = sim.colonies[s.id];
      html = `<h3>Rival colony</h3><div class="sub">${r.species} · ${r.alive ? 'active' : 'collapsed'}</div>
        <div class="kv"><span class="k">Estimated population</span><span class="v">${fmt(r.pop)}</span>
        <span class="k">Foragers on surface</span><span class="v">${r.surfaceCount}</span>
        <span class="k">Fungus (estimate)</span><span class="v">${r.fungus.toFixed(0)}</span></div>
        <div class="row">${why('territory')}</div>`;
    }
    if (el.dataset.html === html) return;
    el.dataset.html = html;
    el.innerHTML = html;
    el.querySelectorAll('[data-why]').forEach((b) => b.addEventListener('click', () => this.openWhy(b.dataset.why)));
    el.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => {
      const a = b.dataset.act;
      if (a === 'follow') this.setView('follow');
      else if (a === 'micro') this.setView('micro');
      else if (a === 'whyant') this.openAntWhy(s.id);
    }));
  }

  // ---------- why modal ----------
  openWhy(key, extra = '') {
    const k = KNOWLEDGE[key];
    if (!k) return;
    const card = $('#why .card');
    card.innerHTML = `<span class="badge ${k.level}">${LEVEL[k.level]}</span><h2>${k.title}</h2><p>${k.body}</p>
      ${k.sim ? `<div class="simbox"><b>In this simulation:</b> ${k.sim}</div>` : ''}${extra}
      ${k.refs ? `<div class="refs">Sources: ${k.refs}</div>` : ''}<div class="row" style="justify-content:flex-end"><button id="why-close">Close</button></div>`;
    $('#why-close').addEventListener('click', () => this.closeWhy());
    $('#why').classList.remove('hidden');
  }
  closeWhy() { $('#why').classList.add('hidden'); }

  openAntWhy(i) {
    const sim = this.game.sim, A = sim.ants, col = sim.colony;
    const rows = [];
    const lifeFrac = A.age[i] / A.maxAge[i];
    for (const key of PRIORITY_KEYS) {
      const t = PRIORITY_TASK[key];
      const s = col.stim[t];
      const th = A.threshold(i, t), p = (s * s) / (s * s + th * th + 1e-6);
      rows.push(`<tr${t === A.task[i] ? ' style="color:var(--leaf)"' : ''}><td>${TASK_NAMES[t]}</td><td class="n">${col.needs[t].toFixed(2)}</td><td class="n">${Math.round(col.priorities[key] * 100)}%</td><td class="n">${s.toFixed(2)}</td><td class="n">${th.toFixed(2)}</td><td class="n">${pct(p)}</td></tr>`);
    }
    const extra = `<p style="margin-top:14px">This <b>${CASTE_NAMES[A.caste[i]].toLowerCase()}</b> is ${lifeFrac < 0.2 ? '<b>young</b>, so it responds more readily to nursing and gardening' : lifeFrac > 0.6 ? '<b>old</b>, so outside work and waste handling attract it more' : 'middle-aged'}. It is currently <b>${TASK_NAMES[A.task[i]].toLowerCase()}</b>.</p>
      <table><tr><th>Task</th><th>Colony need</th><th>Your priority</th><th>Stimulus s</th><th>Its threshold θ</th><th>Response</th></tr>${rows.join('')}</table>`;
    this.openWhy('taskAllocation', extra);
  }

  // ---------- tabs ----------
  tab_colony(p) {
    const sim = this.game.sim, col = sim.colony;
    const el = h(`<div class="cols">
      <div><div class="h">Colony priorities <span class="muted" style="text-transform:none;letter-spacing:0">— you set the stimulus, ants decide</span></div><div id="prios"></div>
        <label class="check"><input type="checkbox" id="auto" ${col.autonomy ? 'checked' : ''}/> Colony autonomy (self-directed expansion)</label></div>
      <div><div class="h">Workforce by task</div><div class="tasks" id="tasks"></div></div>
      <div><div class="h">Colony</div><div class="stage" id="stagebar"></div><div id="cstats" class="kv"></div></div>
      <div><div class="h">History</div><div id="sparks"></div></div>
    </div>`);
    p.appendChild(el);
    const pr = $('#prios', el);
    for (const key of PRIORITY_KEYS) {
      const row = h(`<div class="prio"><span>${PRIO_LABEL[key]}</span><input type="range" min="0" max="100" value="${Math.round(col.priorities[key] * 100)}"/><span class="n" data-n="${key}">0</span></div>`);
      row.querySelector('input').addEventListener('input', (e) => { col.priorities[key] = e.target.value / 100; });
      pr.appendChild(row);
    }
    $('#auto', el).addEventListener('change', (e) => { col.autonomy = e.target.checked; });
    const sparks = [
      ['Workers', () => col.history.pop, (v) => fmt(v)],
      ['Food store', () => col.history.food, (v) => pct(v)],
      ['Fungal biomass', () => col.history.fungus, (v) => v.toFixed(0)],
      ['Brood', () => col.history.brood, (v) => fmt(v)],
    ].map(([name, get, f]) => {
      const s = h(`<div class="spark"><div class="top"><span>${name}</span><b>—</b></div><canvas></canvas></div>`);
      $('#sparks', el).appendChild(s);
      const cv = s.querySelector('canvas');
      const o = { name, get, f, s, cv, hover: -1 };
      cv.addEventListener('mousemove', (e) => { const r = cv.getBoundingClientRect(); o.hover = (e.clientX - r.left) / r.width; drawSpark(o); });
      cv.addEventListener('mouseleave', () => { o.hover = -1; drawSpark(o); });
      return o;
    });
    const update = () => {
      const bt = col.counts.byTask, total = Math.max(1, col.counts.workersInd);
      for (const key of PRIORITY_KEYS) { const n = el.querySelector(`[data-n="${key}"]`); if (n) n.textContent = fmt(bt[PRIORITY_TASK[key]] * col.workers / total); }
      $('#tasks', el).innerHTML = [0, 1, 2, 3, 4, 5, 6, 7].map((t) => `<div class="t"><span>${TASK_NAMES[t]}</span><div class="bar"><i style="width:${(bt[t] / total) * 100}%"></i></div><span class="n">${pct(bt[t] / total)}</span></div>`).join('');
      $('#stagebar', el).innerHTML = [0, 1, 2, 3, 4, 5].map((k) => `<i class="${k <= col.stage ? 'on' : ''}" title="${STAGES[k]}"></i>`).join('');
      const bc = col.counts.byCaste, V = col.virtual;
      $('#cstats', el).innerHTML = `
        <span class="k">Stage</span><span class="v">${STAGES[col.stage]}</span>
        <span class="k">Minims / Medias</span><span class="v">${fmt(bc[0] + V[0])} / ${fmt(bc[1] + V[1])}</span>
        <span class="k">Majors / Soldiers</span><span class="v">${fmt(bc[2] + V[2])} / ${fmt(bc[3] + V[3])}</span>
        <span class="k">Simulated individually</span><span class="v">${fmt(col.counts.workersInd)}</span>
        <span class="k">Eggs · larvae · pupae</span><span class="v">${[0, 1, 2].map((st) => col.brood.filter((b) => b.st === st).length).join(' · ')}</span>
        <span class="k">Alates (queens + males)</span><span class="v">${fmt(col.alatesTotal)}</span>
        <span class="k">Workers on surface</span><span class="v">${fmt(col.counts.surface)}</span>
        <span class="k">Threat level</span><span class="v">${pct(Math.min(1, col.threat))}</span>`;
      for (const o of sparks) drawSpark(o);
    };
    update();
    return { update };
  }

  tab_infra(p) {
    const sim = this.game.sim, nest = sim.nest;
    const el = h(`<div class="cols">
      <div><div class="h">Excavation & zoning</div>
        <div class="tools">${TOOLS.map(([k, n, c]) => `<button data-tool="${k}">${c ? `<span class="swatch" style="background:${c}"></span>` : ''}${n}</button>`).join('')}</div>
        <div class="row" style="align-items:center"><span class="muted">Brush</span>${[1, 2, 3].map((b) => `<button data-brush="${b}">${b}</button>`).join('')}</div>
        <p class="note">Paint soil in the cutaway to mark it. Workers excavate marked cells and carry every pellet to the surface. Zoned chambers are used as soon as they open. Majors need tunnels at least two cells wide.</p>
        <div class="row">${['excavation', 'tunnels', 'flooding'].map((k) => `<button data-why="${k}">${KNOWLEDGE[k].title}</button>`).join('')}</div>
      </div>
      <div><div class="h">Nest</div><div class="kv" id="nstats"></div></div>
      <div style="grid-column: span 2"><div class="h">Chambers</div><div class="list" id="chambers" style="columns:2;display:block"></div></div>
    </div>`);
    p.appendChild(el);
    el.querySelectorAll('[data-tool]').forEach((b) => b.addEventListener('click', () => this.setTool(b.dataset.tool)));
    el.querySelectorAll('[data-brush]').forEach((b) => b.addEventListener('click', () => { this.brush = +b.dataset.brush; el.querySelectorAll('[data-brush]').forEach((x) => x.classList.toggle('on', x === b)); }));
    el.querySelector(`[data-brush="${this.brush}"]`).classList.add('on');
    el.querySelectorAll('[data-why]').forEach((b) => b.addEventListener('click', () => this.openWhy(b.dataset.why)));
    this.setTool(this.tool);
    let lastV = -1;
    const update = () => {
      let open = 0;
      for (let i = 0; i < nest.N; i++) if (!nest.solid[i]) open++;
      $('#nstats', el).innerHTML = `
        <span class="k">Entrances</span><span class="v">${nest.entrances.length}</span>
        <span class="k">Excavated area</span><span class="v">${(open * 0.25 * 4).toFixed(0)} cm²</span>
        <span class="k">Cells marked for digging</span><span class="v">${nest.markCount}</span>
        <span class="k">Soil pellets removed</span><span class="v">${fmt(sim.colony.stats.soilOut)}</span>
        <span class="k">Entrances plugged</span><span class="v">${pct(nest.plug)}</span>
        <span class="k">Water in nest</span><span class="v">${nest.totalWater.toFixed(1)}</span>
        <span class="k">Brood capacity</span><span class="v">${sim.colony.brood.length} / ${sim.colony.broodCapacity()}</span>`;
      if (lastV === nest.version && Math.random() > 0.25) return;
      lastV = nest.version;
      const list = $('#chambers', el);
      list.innerHTML = nest.chambers.filter((c) => c.cells.length >= 3).map((c) => {
        const s = c.stats || {};
        const v = c.zone === ZONE.GARDEN ? `fungus ${pct((s.fungus || 0) / Math.max(1, s.n))}${s.contam > 0.15 ? ' · ⚠' : ''}` : c.zone === ZONE.WASTE ? `waste ${(s.waste || 0).toFixed(0)}` : `${(s.temp || 0).toFixed(1)}°C`;
        return `<div class="it" data-c="${c.id}"><span>${esc(c.name)}</span><span class="v">${v}${s.water > 0.1 ? ' · 💧' : ''}</span></div>`;
      }).join('');
      list.querySelectorAll('.it').forEach((it) => it.addEventListener('click', () => {
        const c = nest.chambers[+it.dataset.c];
        this.game.world.rig.focus(nest.wx(c.cx), nest.wy(c.cy), 0, true);
        this.select({ kind: 'chamber', id: c.id });
        this.refreshButtons();
      }));
    };
    update();
    return { update };
  }

  tab_ecology(p) {
    const sim = this.game.sim;
    const el = h(`<div class="cols">
      <div><div class="h">Climate</div><div class="kv" id="clim"></div><div class="row"><button data-why="temperature">Nest climate</button><button data-why="rainTrails">Rain & trails</button></div></div>
      <div><div class="h">Vegetation</div><div class="list" id="veg"></div></div>
      <div><div class="h">Wildlife</div><div class="list" id="preds"></div><div class="row"><button data-why="predators">Predators</button><button data-why="phorid">Phorid flies</button></div></div>
      <div><div class="h">Neighbours</div><div class="kv" id="rival"></div><div class="row"><button data-why="territory">Territory</button></div></div>
    </div>`);
    p.appendChild(el);
    el.querySelectorAll('[data-why]').forEach((b) => b.addEventListener('click', () => this.openWhy(b.dataset.why)));
    const update = () => {
      const env = sim.env, sp = env.season();
      $('#clim', el).innerHTML = `
        <span class="k">Season</span><span class="v">${env.seasonName} (${pct(env.seasonT)})</span>
        <span class="k">Weather</span><span class="v">${env.weatherLabel}</span>
        <span class="k">Air temperature</span><span class="v">${env.temp.toFixed(1)}°C</span>
        <span class="k">Humidity</span><span class="v">${pct(env.hum)}</span>
        <span class="k">Rain intensity</span><span class="v">${pct(env.rain)}</span>
        <span class="k">Soil moisture</span><span class="v">${pct(env.soilMoisture)}</span>
        <span class="k">Plant growth</span><span class="v">${pct(sp.growth / 1.5)}</span>
        <span class="k">Predator activity</span><span class="v">${pct(sp.predators / 1.3)}</span>`;
      const bySp = SPECIES.map(() => ({ b: 0, m: 0, n: 0 }));
      for (const pl of sim.veg.plants) if (pl.alive) { const o = bySp[pl.sp]; o.b += pl.biomass; o.m += pl.max; o.n++; }
      $('#veg', el).innerHTML = SPECIES.map((S, k) => `<div class="it"><span><span class="swatch" style="background:#${S.color.toString(16).padStart(6, '0')}"></span>${S.name} <span class="muted">×${bySp[k].n}</span></span><span class="v">${pct(bySp[k].b / Math.max(1, bySp[k].m))}${sim.colony.reject[k] > 0.3 ? ' · rejected' : ''}</span></div>`).join('');
      const preds = sim.predators.list;
      $('#preds', el).innerHTML = preds.length ? preds.map((pr) => `<div class="it" data-p="${pr.id}"><span>${pr.name}</span><span class="v">${pr.state === 'leave' ? 'leaving' : pr.state === 'sit' ? 'ambush' : 'active'} · ${pr.eaten}</span></div>`).join('') : '<div class="muted">No predators nearby.</div>';
      $('#preds', el).querySelectorAll('.it').forEach((it) => it.addEventListener('click', () => {
        const pr = sim.predators.list.find((x) => x.id === +it.dataset.p);
        if (pr) { this.game.world.rig.focus(pr.x, 0, pr.z, false); this.select({ kind: 'predator', id: pr.id }); this.refreshButtons(); }
      }));
      const r = sim.rivals[0];
      $('#rival', el).innerHTML = `<span class="k">${r.species}</span><span class="v">${r.alive ? 'active' : 'collapsed'}</span>
        <span class="k">Population (est.)</span><span class="v">${fmt(r.pop)}</span>
        <span class="k">Foragers out</span><span class="v">${r.surfaceCount}</span>
        <span class="k">Rivals near your nest</span><span class="v">${sim.colony.rivalNear}</span>
        <span class="k">Predators killed</span><span class="v">${sim.predators.killed}</span>
        <span class="k">Ants taken by predators</span><span class="v">${sim.predators.eaten}</span>`;
    };
    update();
    return { update };
  }

  tab_research(p) {
    const sim = this.game.sim, col = sim.colony;
    const el = h(`<div class="cols">
      <div><div class="h">Colony genome</div><div id="genes"></div><div class="row"><button data-why="genetics">About genetics</button></div></div>
      <div><div class="h">Reproduction</div><div class="kv" id="repro"></div><div class="row" id="reprobtn"></div></div>
      <div><div class="h">Field notes — why does this happen?</div><div class="list" id="notes"></div></div>
    </div>`);
    p.appendChild(el);
    const g = col.genome;
    const names = { size: 'Worker size', growth: 'Growth rate', fungus: 'Fungus efficiency', disease: 'Disease resistance', aggression: 'Aggression', forage: 'Foraging efficiency', heat: 'Heat tolerance', repro: 'Reproductive output' };
    $('#genes', el).innerHTML = Object.keys(names).map((k) => `<div class="gene"><span>${names[k]}</span><div class="bar"><i style="width:${(g[k] / 1.6) * 100}%"></i></div><span class="mono muted">${g[k].toFixed(2)}</span></div>`).join('');
    const notes = $('#notes', el);
    notes.innerHTML = Object.entries(KNOWLEDGE).map(([k, v]) => `<div class="it" data-why="${k}"><span>${v.title}</span><span class="v"><span class="badge ${v.level}" style="font-size:8.5px">${v.level}</span></span></div>`).join('');
    notes.style.maxHeight = '200px'; notes.style.overflow = 'auto';
    notes.querySelectorAll('[data-why]').forEach((b) => b.addEventListener('click', () => this.openWhy(b.dataset.why)));
    el.querySelector('[data-why="genetics"]').addEventListener('click', () => this.openWhy('genetics'));
    let lastKey = '';
    const update = () => {
      const lf = col.lastFlight;
      $('#repro', el).innerHTML = `
        <span class="k">Alate queens / males</span><span class="v">${fmt(col.counts.byCaste[CASTE.GYNE] + col.virtualAlates.gynes)} / ${fmt(col.counts.byCaste[CASTE.MALE] + col.virtualAlates.males)}</span>
        <span class="k">Nuptial flights</span><span class="v">${col.stats.flights}${col.flight ? ' (underway)' : ''}</span>
        <span class="k">Queens launched</span><span class="v">${fmt(col.stats.launchedQueens)}</span>
        <span class="k">Daughter colonies founded</span><span class="v">${col.stats.daughterQueens}</span>
        ${lf ? `<span class="k">Last flight</span><span class="v">day ${Math.floor(lf.day) + 1}: ${lf.success}/${lf.gynes}</span>` : ''}
        <span class="k">Workers born / died</span><span class="v">${fmt(col.stats.born)} / ${fmt(col.stats.deaths)}</span>
        <span class="k">Leaf material harvested</span><span class="v">${fmt(col.stats.leavesIn)}</span>`;
      const key = `${col.alatesTotal > 0}|${!!col.flight}|${col.stats.daughterQueens}`;
      if (key === lastKey) return;
      lastKey = key;
      const b = $('#reprobtn', el);
      b.innerHTML = `<button data-why="nuptial">Nuptial flights</button>`;
      if (col.alatesTotal > 0 && !col.flight) b.appendChild(h('<button id="flightbtn">Encourage nuptial flight</button>'));
      if (col.stats.daughterQueens > 0) b.appendChild(h('<button id="daughterbtn" class="on">Found a daughter colony →</button>'));
      if (col.alatesTotal === 0 && col.workers < 1200) b.appendChild(h('<span class="note">Colonies produce alates once they pass ~1,200 workers and are well fed in late winter/spring.</span>'));
      b.querySelector('[data-why]').addEventListener('click', () => this.openWhy('nuptial'));
      const fb = $('#flightbtn', b); if (fb) fb.addEventListener('click', () => { col.flightRequested = true; });
      const db = $('#daughterbtn', b); if (db) db.addEventListener('click', () => this.game.foundDaughter());
    };
    update();
    return { update };
  }

  tab_god(p) {
    const sim = this.game.sim, env = sim.env;
    if (!sim.godMode) {
      const el = h(`<div><div class="h">God Mode</div><p class="note">Sandbox controls let you manipulate rainfall, temperature, vegetation, predators, population and rivals, and ask "what happens if…?" Enabling them marks this colony as an experiment.</p><button id="enable" class="on">Enable God Mode</button></div>`);
      p.appendChild(el);
      $('#enable', el).addEventListener('click', () => { sim.godMode = true; this.setTab('god'); this.setTab('god'); });
      return null;
    }
    const el = h(`<div class="cols">
      <div><div class="h">Weather</div>
        <div class="tools">${['clear', 'cloudy', 'rain', 'storm', 'drought'].map((w) => `<button data-w="${w}">${w[0].toUpperCase() + w.slice(1)}</button>`).join('')}</div>
        <label class="check"><input type="checkbox" id="rainov"/> Override rainfall</label>
        <input type="range" id="rain" min="0" max="100" value="50"/>
        <div class="prio" style="grid-template-columns:120px 1fr 44px;margin-top:8px"><span>Temperature offset</span><input type="range" id="temp" min="-10" max="10" value="${env.godTemp}"/><span class="n" id="tempv">${env.godTemp}°</span></div>
        <div class="prio" style="grid-template-columns:120px 1fr 44px"><span>Predator activity</span><input type="range" id="predact" min="0" max="500" value="${sim.godPredators * 100}"/><span class="n" id="predv">${sim.godPredators}×</span></div>
      </div>
      <div><div class="h">Population</div>
        <div class="tools"><button data-add="100">+100 workers</button><button data-add="1000">+1,000 workers</button><button data-add="10000">+10,000 workers</button><button data-cull="0.5" class="danger">Kill 50%</button></div>
        <div class="tools" style="margin-top:6px"><button id="food">Fill food store</button><button id="fung">Boost fungus</button><button id="contam" class="danger">Infect gardens</button><button id="alates">+200 alates</button></div>
        <div class="h" style="margin-top:10px">Rival colony</div>
        <div class="tools"><button id="rivalup">Rival +2,000</button><button id="rivalraid">Send rival raid</button><button id="rivaldown" class="danger">Rival −50%</button></div>
      </div>
      <div><div class="h">Click the world to use</div>
        <div class="tools">${GOD_TOOLS.map(([k, n]) => `<button data-tool="${k}">${n}</button>`).join('')}<button data-tool="select">Select</button></div>
        <div class="tools" style="margin-top:6px"><button id="clear50" class="danger">Remove all vegetation within 50 units</button><button id="regrow">Regrow all plants</button></div>
      </div>
    </div>`);
    p.appendChild(el);
    el.querySelectorAll('[data-w]').forEach((b) => b.addEventListener('click', () => env.setWeather(b.dataset.w, b.dataset.w === 'drought' ? 500 : 120)));
    const rainov = $('#rainov', el), rain = $('#rain', el);
    const applyRain = () => { env.godRain = rainov.checked ? rain.value / 100 : null; };
    rainov.addEventListener('change', applyRain); rain.addEventListener('input', applyRain);
    $('#temp', el).addEventListener('input', (e) => { env.godTemp = +e.target.value; $('#tempv', el).textContent = env.godTemp + '°'; });
    $('#predact', el).addEventListener('input', (e) => { sim.godPredators = e.target.value / 100; $('#predv', el).textContent = sim.godPredators.toFixed(1) + '×'; });
    el.querySelectorAll('[data-add]').forEach((b) => b.addEventListener('click', () => sim.godAddWorkers(+b.dataset.add)));
    el.querySelectorAll('[data-cull]').forEach((b) => b.addEventListener('click', () => sim.godKillWorkers(+b.dataset.cull)));
    $('#food', el).addEventListener('click', () => { sim.colony.food = sim.colony.foodCap; });
    $('#fung', el).addEventListener('click', () => { for (const c of sim.nest.gardenCells) { sim.nest.fungus[c] = Math.max(sim.nest.fungus[c], 0.9); sim.nest.contam[c] = 0; } });
    $('#contam', el).addEventListener('click', () => { const gc = sim.nest.gardenCells; for (let k = 0; k < gc.length / 6; k++) sim.nest.contam[gc[sim.rng.int(gc.length)]] = 0.4; });
    $('#alates', el).addEventListener('click', () => { sim.colony.virtualAlates.gynes += 80; sim.colony.virtualAlates.males += 120; });
    const r = sim.rivals[0];
    $('#rivalup', el).addEventListener('click', () => { r.pop += 2000; r.fungus += 100; r.alive = true; });
    $('#rivaldown', el).addEventListener('click', () => { r.pop *= 0.5; });
    $('#rivalraid', el).addEventListener('click', () => {
      for (let k = 0; k < 120 && sim.ants.canSpawn(); k++) {
        const size = sim.rng.range(1.4, 3);
        const i = sim.ants.spawn(r.id, size > 2.3 ? 3 : 2, size, LAYER.SURFACE, r.nestX + sim.rng.range(-1, 1), r.nestZ + sim.rng.range(-1, 1), 3);
        sim.ants.assign(i, TASK.DEFEND);
        sim.ants.hd[i] = Math.atan2(-r.nestZ, -r.nestX);
        sim.surface.deposit(4, sim.rng.range(-3, 3), sim.rng.range(-3, 3), 4);
      }
    });
    el.querySelectorAll('[data-tool]').forEach((b) => b.addEventListener('click', () => { this.setTool(b.dataset.tool); if (b.dataset.tool !== 'select' && this.game.world.rig.clipped) this.setView('surface'); }));
    $('#clear50', el).addEventListener('click', () => sim.veg.removeIn(0, 0, 50));
    $('#regrow', el).addEventListener('click', () => { for (const pl of sim.veg.plants) if (pl.alive) pl.biomass = pl.max; });
    return null;
  }
}

function drawSpark(o) {
  const data = o.get();
  const cv = o.cv, dpr = window.devicePixelRatio || 1;
  const W = cv.clientWidth, H = cv.clientHeight;
  if (!W) return;
  if (cv.width !== W * dpr) { cv.width = W * dpr; cv.height = H * dpr; }
  const g = cv.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, W, H);
  const label = o.s.querySelector('b');
  if (data.length < 2) { label.textContent = data.length ? o.f(data[0]) : '—'; return; }
  let mn = Math.min(...data), mx = Math.max(...data);
  if (mx - mn < 1e-6) { mx += 1; mn -= 1; }
  mn = Math.min(mn, 0);
  const x = (i) => (i / (data.length - 1)) * (W - 2) + 1, y = (v) => H - 3 - ((v - mn) / (mx - mn)) * (H - 6);
  g.strokeStyle = 'rgba(232,228,218,0.08)'; g.lineWidth = 1;
  g.beginPath(); g.moveTo(0, H - 2.5); g.lineTo(W, H - 2.5); g.stroke();
  g.beginPath();
  data.forEach((v, i) => (i ? g.lineTo(x(i), y(v)) : g.moveTo(x(i), y(v))));
  g.strokeStyle = '#9ccf6a'; g.lineWidth = 2; g.lineJoin = 'round'; g.stroke();
  let idx = data.length - 1;
  if (o.hover >= 0) {
    idx = Math.round(o.hover * (data.length - 1));
    g.strokeStyle = 'rgba(232,228,218,0.35)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(x(idx), 0); g.lineTo(x(idx), H); g.stroke();
  }
  g.fillStyle = '#9ccf6a';
  g.beginPath(); g.arc(x(idx), y(data[idx]), 3, 0, Math.PI * 2); g.fill();
  label.textContent = o.hover >= 0 ? `${o.f(data[idx])} · ${Math.round(((data.length - 1 - idx) * 5) / 60)} min ago` : o.f(data[idx]);
}

export function loadDaughter() {
  try { const s = localStorage.getItem('leafcutter.daughter'); return s ? JSON.parse(s) : null; } catch { return null; }
}
export function saveDaughter(genome) {
  try { localStorage.setItem('leafcutter.daughter', JSON.stringify(genome)); } catch { /* storage unavailable */ }
}
