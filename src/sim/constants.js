// Shared constants for the simulation. World units: 1 unit ≈ 2 cm of forest floor
// (a documented compression — see knowledge.js "scale").

export const WORLD_SIZE = 128;
export const HALF = WORLD_SIZE / 2;
export const SG = 256; // surface grid resolution (pheromones, traffic, territory)
export const SCELL = WORLD_SIZE / SG;

// Underground cutaway grid. It lies in the vertical plane z = 0, directly under the nest.
export const NW = 160;
export const NH = 80;
export const NCELL = 0.5;
export const NX0 = -NW * NCELL / 2;
export const NEST_DEPTH = NH * NCELL;

export const DAY_LEN = 240; // sim seconds per in-game day
export const SEASON_DAYS = 4;
export const SEASONS = ['Spring', 'Summer', 'Autumn', 'Winter'];

export const MAX_ANTS = 9000; // individually simulated ants; beyond this workers are simulated statistically

export const CASTE = { MINIM: 0, MEDIA: 1, MAJOR: 2, SOLDIER: 3, GYNE: 4, MALE: 5 };
export const CASTE_NAMES = ['Minim', 'Media', 'Major', 'Soldier', 'Alate queen', 'Male'];

export const TASK = { REST: 0, FORAGE: 1, GARDEN: 2, NURSE: 3, DIG: 4, WASTE: 5, DEFEND: 6, EXPLORE: 7 };
export const NTASK = 8;
export const TASK_NAMES = ['Resting', 'Foraging', 'Gardening', 'Nursing', 'Excavating', 'Waste disposal', 'Defending', 'Exploring'];
export const PRIORITY_KEYS = ['forage', 'dig', 'nurse', 'garden', 'defend', 'waste', 'explore'];
export const PRIORITY_TASK = { forage: TASK.FORAGE, dig: TASK.DIG, nurse: TASK.NURSE, garden: TASK.GARDEN, defend: TASK.DEFEND, waste: TASK.WASTE, explore: TASK.EXPLORE };

export const LAYER = { SURFACE: 0, NEST: 1 };
export const CARRY = { NONE: 0, LEAF: 1, SOIL: 2, WASTE: 3, BROOD: 4 };

export const ZONE = { NONE: 0, GARDEN: 1, NURSERY: 2, QUEEN: 3, WASTE: 4, STORE: 5, VENT: 6 };
export const ZONE_NAMES = ['Tunnel', 'Fungus garden', 'Nursery', 'Queen chamber', 'Waste chamber', 'Leaf store', 'Ventilation shaft'];

export const RIVAL_POS = { x: -40, z: -36 };
export const BRIDGE_Z = -12;

export function sizeToCaste(s) {
  return s < 0.8 ? CASTE.MINIM : s < 1.4 ? CASTE.MEDIA : s < 2.3 ? CASTE.MAJOR : CASTE.SOLDIER;
}

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => t * t * (3 - 2 * t);
