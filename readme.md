# LEAFCUTTER: Colony

A browser colony simulator about *Atta* leafcutter ants. You never command an ant. You shape the colony's priorities, infrastructure and environment, and thousands of autonomous ants work out the rest.

The full design brief is in [claude.md](claude.md).

## Running

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build in dist/
```

Pick a scenario on the title screen: **Foundress**, **Young Colony**, **Mature Colony** or **God Mode** (sandbox). After a successful nuptial flight you can also found a **Daughter Colony** that inherits your colony's genome. You can jump straight into a scenario with `?scenario=young` (or `foundress`, `mature`, `sandbox`).

## Controls

| Input | Action |
|---|---|
| Left-drag / WASD | Pan |
| Right-drag / Q E | Rotate |
| Wheel | Zoom (continuous, from the whole landscape down to a single ant) |
| Click | Inspect an ant, chamber, plant, predator, the queen or the rival nest |
| `1` / `C` / `G` / `F` / `M` | Strategic / cutaway / ground level / follow ant / microscope |
| Space | Pause (inspection still works) |
| `2`–`5` | 1×, 2×, 5×, 10× speed |
| Esc | Deselect, stop following, drop the current tool |

**Infrastructure tab:** paint soil in the cutaway to mark tunnels and zone chambers (fungus garden, nursery, waste, leaf store, ventilation). Workers excavate marked soil pellet by pellet and carry it out to the mound.

## What is simulated

- **Individual ants** in typed arrays (up to 9,000). Each has caste, size, age, energy, health, hunger, task, experience, carried load, pheromone exposure, antennal contacts, temperature exposure, injuries and parasitism. Workers beyond that cap are simulated statistically, with the same task mix and a foraging yield measured from the individual ants.
- **Task allocation** uses a response-threshold model. Stimulus = colony need × your priority slider. Thresholds depend on caste, age (polyethism) and experience (specialisation). *Why this task?* on any ant shows the actual numbers.
- **Pheromone fields** (trail, home, alarm, and territory per colony) diffuse, evaporate faster in heat and wash out in rain. Trails and cleared highways emerge from these fields. They are not scripted paths.
- **Fungus gardens** are simulated per cell: biomass, substrate, temperature, humidity, spent refuse, toxins and *Escovopsis*-style contamination. Gardeners groom and inoculate, waste workers remove refuse. The colony learns to reject plants that harm its fungus.
- **Brood**: the queen lays eggs; nurses carry them to nurseries and feed larvae. Larval nutrition and colony size decide adult caste. Mature, well-fed colonies raise alates for a nuptial flight.
- **Underground**: a flow-field nest grid with tunnel width (majors need tunnels at least two cells wide), climate, ventilation, flooding, entrance plugging, storm collapse, and self-directed expansion.
- **Ecosystem**: seasons, weather, regrowing vegetation, a stream crossed by a fallen log, autonomous predators (spiders, lizards, toads, antbirds, phorid flies with minim hitchhikers), and a rival colony competing for territory.

Every mechanic is labelled in-game (*Why does this happen?*) as known biology, a reasonable approximation, or a simulation assumption. Time and space are compressed; see `src/ui/knowledge.js`.

## Architecture

```
src/sim/      simulation, independent of rendering (runs headless in Node)
  sim.js          orchestrator, fixed-step
  ants.js         individual ant AI, spatial hash, census
  colony.js       player colony economy, brood, statistical workers; rival colony
  nest.js         underground grid, chambers, BFS flow fields, fungus, climate, water
  surface.js      pheromone/territory/traffic fields, terrain height, mound
  vegetation.js   plants, regrowth, succession
  environment.js  seasons, weather, day/night
  predators.js    autonomous predators
  alerts.js       emergencies detected from state
src/render/   Three.js: instanced ants with shader-driven leg animation, LOD,
              terrain, forest, cutaway slice, effects, camera rig
src/ui/       HUD, tabs, inspector, knowledge base
```

The simulation runs on the main thread at a fixed timestep. A mature colony costs about 9 ms per simulated second. Moving it into a Web Worker is the natural next step for larger colonies.
