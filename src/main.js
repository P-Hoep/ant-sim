import { Sim } from './sim/sim.js';
import { mutateGenome } from './sim/colony.js';
import { World3D } from './render/world3d.js';
import { UI, saveDaughter } from './ui/ui.js';

const game = {
  sim: null,
  world: null,
  ui: null,
  speed: 1,
  lastSpeed: 1,
  setSpeed(s) {
    if (s > 0) this.lastSpeed = s;
    this.speed = s;
    if (this.ui) this.ui.refreshButtons();
  },
  foundDaughter() {
    const g = mutateGenome(this.sim.colony.genome, this.sim.rng);
    saveDaughter(g);
    location.search = '?scenario=daughter';
  },
};

const world = new World3D(document.getElementById('viewport'));
game.world = world;
const ui = new UI(game);
game.ui = ui;

function start(scenario, genome) {
  const sim = new Sim({ scenario, genome: genome || undefined });
  game.sim = sim;
  window.sim = sim; // handy for poking at the simulation from the console
  window.game = game;
  world.setSim(sim);
  ui.build();
  if (scenario === 'foundress' || scenario === 'daughter') world.rig.setMode('cutaway');
  requestAnimationFrame(loop);
}

let last = performance.now(), acc = 0;
function loop(now) {
  const frame = Math.min(0.1, (now - last) / 1000);
  last = now;
  const sim = game.sim;
  if (game.speed > 0) {
    const stepDt = game.speed >= 5 ? 0.1 : 0.05;
    acc += frame * game.speed;
    let steps = 0;
    const t0 = performance.now();
    while (acc >= stepDt && steps < 40) {
      sim.step(stepDt);
      acc -= stepDt;
      steps++;
      if (performance.now() - t0 > 28) { acc = 0; break; } // keep the frame responsive
    }
  }
  world.update(frame);
  ui.update(frame);
  requestAnimationFrame(loop);
}

const params = new URLSearchParams(location.search);
const scen = params.get('scenario');
if (scen) {
  const genome = scen === 'daughter' ? JSON.parse(localStorage.getItem('leafcutter.daughter') || 'null') : null;
  start(scen, genome);
} else {
  // a slowly orbiting live forest behind the title screen; choosing a scenario reloads cleanly
  const preview = new Sim({ scenario: 'young', seed: 7 });
  game.sim = preview;
  world.setSim(preview);
  world.rig.g.dist = 60; world.rig.g.pitch = 0.6;
  ui.showTitle((scenario) => { location.search = '?scenario=' + scenario; });
  let t = 0;
  const idle = () => {
    t += 0.016;
    world.rig.g.yaw = 0.4 + t * 0.03;
    preview.step(0.05);
    world.update(0.016);
    requestAnimationFrame(idle);
  };
  requestAnimationFrame(idle);
}
