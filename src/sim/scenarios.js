import { NW, ZONE, LAYER, sizeToCaste } from './constants.js';
import { F } from './surface.js';
import { EGG_T, LARVA_T } from './colony.js';

export const SCENARIOS = {
  foundress: { title: 'Foundress', stage: 'Stage 1', desc: 'A newly mated queen seals herself underground with a pellet of fungus carried from her mother colony. Raise the first workers from her body reserves.' },
  young: { title: 'Young Colony', stage: 'Stage 3', desc: 'Two hundred workers, two fungus gardens and the first foraging trails. The best place to learn the colony.' },
  mature: { title: 'Mature Colony', stage: 'Stage 4', desc: 'Thousands of workers of every caste, a deep tunnel network and a hostile neighbour across the clearing.' },
  sandbox: { title: 'God Mode', stage: 'Sandbox', desc: 'A mature colony with every lever unlocked: weather, predators, vegetation, rivals and population.' },
  daughter: { title: 'Daughter Colony', stage: 'Stage 1', desc: 'A queen from your last nuptial flight founds a new colony, carrying her mother colony’s genetics.' },
};

const C = NW / 2;

function seedFungus(sim, lo, hi) {
  const { nest, rng } = sim;
  nest.rebuild();
  for (const c of nest.gardenCells) {
    nest.fungus[c] = rng.range(lo, hi);
    nest.substrate[c] = rng.range(0.2, 0.45);
  }
}

function spawnWorkers(sim, n, maxSize) {
  const { nest, rng, ants } = sim;
  const cells = [];
  for (const ch of nest.chambers) for (const c of ch.cells) cells.push(c);
  for (let k = 0; k < n; k++) {
    const size = 0.5 + (maxSize - 0.5) * Math.pow(rng.next(), 2.2);
    const c = cells[rng.int(cells.length)];
    const caste = sizeToCaste(size);
    ants.spawn(0, caste, size, LAYER.NEST, nest.wx(c % NW) + rng.range(-0.2, 0.2), nest.wy((c / NW) | 0) + rng.range(-0.2, 0.2), rng.range(0, 10));
  }
}

function addBrood(sim, n) {
  const { colony, nest, rng } = sim;
  for (let k = 0; k < n; k++) {
    const st = rng.int(3);
    const hasNur = nest.chambers.some((c) => c.zone === ZONE.NURSERY);
    const cell = hasNur ? nest.randomCellOfZone(ZONE.NURSERY) : colony.queenCell();
    colony.brood.push({ st, t: rng.range(0, st === 0 ? EGG_T : st === 1 ? LARVA_T * 0.8 : 100), fed: st === 1 ? rng.range(0.2, 0.8) : 1, loc: hasNur ? 1 : 0, cell, repro: 0, size: st === 2 ? 0.5 + Math.pow(rng.next(), 2.2) : 0, seed: rng.next() });
  }
}

function moundAround(sim, amount) {
  const { nest, surface, rng } = sim;
  for (const e of nest.entrances) {
    for (let k = 0; k < amount; k++) {
      const a = rng.range(0, 6.28), d = rng.range(0.5, 4);
      surface.addMound(e.wx + Math.cos(a) * d, Math.sin(a) * d, 0.012, 1.8);
    }
  }
}

function seedTrail(sim, strength, n) {
  const { veg, surface, nest } = sim;
  const good = veg.plants.filter((p) => p.alive && p.sp <= 2 && Math.hypot(p.x, p.z) < 30).sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z)).slice(0, n);
  for (const p of good) {
    const e = nest.entrances[0];
    const x0 = e ? e.wx : 0;
    const L = Math.hypot(p.x - x0, p.z);
    for (let s = 0; s <= L; s += 0.25) {
      const t = s / L;
      surface.deposit(F.FOOD0, x0 + (p.x - x0) * t, p.z * t, strength);
      surface.deposit(F.TRAFFIC, x0 + (p.x - x0) * t, p.z * t, strength * 4);
    }
  }
}

export function setupScenario(sim, name) {
  const { nest, colony, rng } = sim;
  const rival = sim.rivals[0];

  if (name === 'foundress' || name === 'daughter') {
    nest.carveEllipse(C - 1, 13, 3.2, 2.2, ZONE.QUEEN);
    nest.carveEllipse(C + 3.2, 13, 1.8, 1.6, ZONE.GARDEN);
    nest.markLine(C - 1, 0, C - 1, 10); // the founding shaft is back-filled; the first workers dig out
    seedFungus(sim, 0.3, 0.45);
    colony.queen.reserve = 45;
    colony.queen.age = 0;
    colony.food = 4;
    for (let k = 0; k < 5; k++) colony.brood.push({ st: 0, t: rng.range(0, EGG_T), fed: 0, loc: 0, cell: -1, repro: 0, size: 0, seed: rng.next() });
    for (let k = 0; k < 3; k++) colony.brood.push({ st: 1, t: rng.range(0, LARVA_T * 0.5), fed: 0.3, loc: 0, cell: -1, repro: 0, size: 0, seed: rng.next() });
    rival.pop = 900;
    nest.rebuild();
    for (const b of colony.brood) b.cell = colony.queenCell();
    return;
  }

  if (name === 'young') {
    nest.carveLine(C, 0, C, 28, 2);
    nest.carveLine(C - 14, 0, C - 12, 13, 1);
    nest.carveEllipse(C - 11, 16, 5.5, 3.2, ZONE.GARDEN);
    nest.carveEllipse(C + 11, 18, 5.5, 3.2, ZONE.GARDEN);
    nest.carveLine(C, 14, C - 6, 16, 1);
    nest.carveLine(C, 16, C + 6, 18, 2);
    nest.carveEllipse(C, 30, 4, 2.6, ZONE.QUEEN);
    nest.carveEllipse(C + 9, 35, 4.5, 2.6, ZONE.NURSERY);
    nest.carveLine(C + 3, 31, C + 6, 34, 1);
    nest.carveEllipse(C + 30, 27, 4, 2.5, ZONE.WASTE);
    nest.carveLine(C + 16, 19, C + 27, 26, 1);
    seedFungus(sim, 0.45, 0.8);
    spawnWorkers(sim, 190, 1.6);
    addBrood(sim, 50);
    colony.food = 18;
    colony.receiveLeaf(6, 1);
    rival.pop = 1400;
    moundAround(sim, 40);
    seedTrail(sim, 2, 1);
    return;
  }

  // mature / sandbox
  nest.carveLine(C, 0, C, 50, 2);
  nest.carveLine(C - 24, 0, C - 22, 14, 2);
  nest.carveLine(C + 22, 0, C + 20, 12, 1);
  nest.carveLine(C + 36, 0, C + 36, 18, 1);
  nest.carveEllipse(C + 36, 20, 1.5, 2, ZONE.VENT);
  nest.carveEllipse(C - 7, 8, 4, 2, ZONE.STORE);
  nest.carveLine(C - 3, 8, C, 8, 1);
  const gardens = [[C - 12, 17], [C + 12, 17], [C - 25, 27], [C + 25, 27], [C - 11, 40], [C + 12, 42]];
  for (const [x, y] of gardens) nest.carveEllipse(x, y, 6, 3.4, ZONE.GARDEN);
  nest.carveLine(C - 6, 17, C + 6, 17, 1);
  nest.carveLine(C - 19, 27, C + 19, 27, 2);
  nest.carveLine(C - 5, 41, C + 6, 41, 2);
  nest.carveLine(C - 22, 14, C - 25, 24, 1);
  nest.carveLine(C + 20, 12, C + 24, 24, 1);
  nest.carveLine(C + 36, 20, C + 30, 26, 1);
  nest.carveEllipse(C, 53, 4.5, 3, ZONE.QUEEN);
  nest.carveEllipse(C - 9, 59, 5, 2.8, ZONE.NURSERY);
  nest.carveEllipse(C + 10, 60, 5, 2.8, ZONE.NURSERY);
  nest.carveLine(C - 3, 55, C - 6, 58, 1);
  nest.carveLine(C + 3, 55, C + 6, 58, 2);
  nest.carveEllipse(C + 46, 42, 5, 3.4, ZONE.WASTE);
  nest.carveEllipse(C - 46, 46, 5, 3.4, ZONE.WASTE);
  nest.carveLine(C + 30, 29, C + 42, 40, 1);
  nest.carveLine(C - 30, 29, C - 42, 44, 1);
  seedFungus(sim, 0.55, 0.9);
  spawnWorkers(sim, 2600, 3.0);
  colony.virtual = [900, 800, 240, 60];
  addBrood(sim, 380);
  colony.food = 110;
  colony.receiveLeaf(30, 1);
  for (const c of nest.chambers) if (c.zone === ZONE.WASTE) for (const k of c.cells) nest.waste[k] = rng.range(0, 1.2);
  rival.pop = 2600;
  moundAround(sim, 160);
  seedTrail(sim, 3, 3);
}
