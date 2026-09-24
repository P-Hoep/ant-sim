Be sure to always create tasks in markdown files and update them when completed so we can resume from different sessions.

## Game Design Instruction Set — **LEAFCUTTER: Colony**

### Core Concept

Create a browser-based colony simulation game in which the player develops and manages a realistic leafcutter ant colony from a founding queen into a massive, complex underground superorganism.

The game should combine:

* **SimCity** — zoning, infrastructure, resource management, expansion, disasters
* **Dwarf Fortress** — emergent simulation and individual creature behavior
* **Planet Zoo** — detailed animals and living ecosystems
* **Anno** — production chains and logistics
* **Oxygen Not Included** — interconnected environmental systems

The key design principle is:

> **The player does not directly command individual ants. They shape the colony's environment, priorities, infrastructure, and resource allocation, while thousands of ants autonomously behave according to realistic biological rules.**

---

# 1. The Colony Is the Player's "City"

The colony should visually and mechanically resemble a living city.

Instead of:

> roads → houses → factories

the player manages:

> tunnels → chambers → fungus gardens → nurseries → refuse dumps → entrances → foraging trails → ventilation

The colony should become increasingly complex as it grows.

A small colony might contain:

```text
Queen chamber
    │
Nursery
    │
Fungus garden
    │
Waste chamber
```

A mature colony could contain hundreds of interconnected chambers and thousands of meters of tunnels.

The player should be able to **zoom continuously**:

```text
WORLD
 ↓
FOREST
 ↓
COLONY TERRITORY
 ↓
ANT TRAILS
 ↓
COLONY ENTRANCE
 ↓
TUNNEL SYSTEM
 ↓
CHAMBER
 ↓
INDIVIDUAL ANT
```

---

# 2. Species Accuracy

Base the simulation primarily around **Atta** leafcutter ants, while allowing other species as unlockable scenarios.

The simulation should accurately model:

### Castes

* Queen
* Workers
* Minims
* Media workers
* Majors
* Soldiers
* Males
* Alate queens

Workers should not simply be cosmetic variants.

Their behavior should emerge from:

* body size
* age
* task specialization
* colony needs
* pheromone signals
* environmental conditions
* experience
* local stimuli

---

# 3. Ant AI

Every ant should have an autonomous behavior system.

Do **not** have the player manually select an ant and issue:

> "Go collect leaf."

Instead, ants evaluate colony needs.

Example:

```text
Fungus garden productivity ↓
        ↓
Colony releases stronger foraging demand
        ↓
Workers investigate existing trails
        ↓
More ants begin cutting vegetation
        ↓
Leaf transport increases
        ↓
Fungus receives more substrate
        ↓
Fungus productivity ↑
        ↓
Foraging demand decreases
```

This creates an emergent colony.

### Individual ant state

Each ant should track:

```text
Age
Body size
Caste
Energy
Health
Hunger
Current task
Task preference
Experience
Position
Destination
Carrying load
Pheromone exposure
Social interactions
Temperature exposure
Injury
```

---

# 4. Pheromone Simulation

Pheromones should be one of the most important mechanics.

Create an actual pheromone field over the map rather than simply assigning ants predefined paths.

Types could include:

* food trail pheromone
* alarm pheromone
* nest-marking pheromone
* recruitment pheromone
* waste-related chemical signals

Pheromones should:

* diffuse
* decay over time
* strengthen through repeated use
* influence ant pathfinding
* interact with environmental conditions

This should produce beautiful emergent highways.

A successful foraging route should gradually transform from:

```text
random ants
     ↓
small trail
     ↓
reinforced trail
     ↓
major ant highway
```

---

# 5. The Fungus Is the Real "Farm"

One of the most important mechanics should be that **leafcutting ants don't eat the leaves directly**.

They cultivate fungus.

The production chain should therefore be:

```text
Vegetation
   ↓
Cut leaves
   ↓
Leaf transport
   ↓
Processing
   ↓
Fungus garden
   ↓
Fungal growth
   ↓
Colony nutrition
   ↓
Larval development
   ↓
More workers
```

This should become the equivalent of SimCity's industrial economy.

Players need to maintain:

* fungus temperature
* humidity
* substrate supply
* fungal health
* contamination control
* waste removal

---

# 6. Fungus Garden Simulation

Make the fungus visually spectacular.

Instead of representing the fungus garden as one resource number, simulate it as a living organism.

Each garden has:

```text
Biomass
Growth rate
Moisture
Temperature
Nutrient availability
Contamination
Age
Worker attention
Ventilation
```

Workers should:

* add leaf material
* groom fungus
* remove contamination
* remove dead material
* manipulate substrate
* transport fungal material
* maintain garden structure

The garden should visibly expand and contract.

---

# 7. Underground City

The underground colony is effectively the player's city.

Allow the player to construct infrastructure such as:

### Chambers

* fungus gardens
* nursery chambers
* queen chamber
* brood chambers
* food-processing chambers
* waste chambers
* ventilation chambers
* emergency chambers

### Tunnels

Different tunnel sizes should matter.

Small tunnels:

* efficient
* easy to maintain
* restrict large ants

Large tunnels:

* expensive
* allow soldiers and heavy transport
* increase airflow

The colony should dynamically remodel itself.

---

# 8. Construction

The player shouldn't simply magically build tunnels.

Instead:

```text
Player marks excavation area
        ↓
Workers excavate
        ↓
Soil transported
        ↓
Tunnel expands
        ↓
Tunnel becomes usable
```

Excavation should consume worker labor.

Players therefore have to balance:

> expansion vs. food collection vs. brood care vs. fungus maintenance.

---

# 9. SimCity-Style Management

Give the player a high-level colony management interface.

For example:

### Colony priorities

Sliders:

```text
FORAGING       ████████░░
EXCAVATION     █████░░░░░
NURSERY        █████████░
FUNGUS         ███████░░░
DEFENSE        ████░░░░░░
WASTE          ██████░░░░
EXPLORATION    █████░░░░░
```

The player isn't ordering individual ants.

They're changing **colony priorities**.

This is the game's primary strategic interface.

---

# 10. Outside World

The colony should exist inside a fully simulated ecosystem.

Generate a beautiful 3D forest floor containing:

* trees
* bushes
* grasses
* flowers
* fallen leaves
* roots
* rocks
* streams
* soil layers
* insects
* spiders
* birds
* reptiles
* amphibians
* fungi
* microorganisms

Vegetation should grow.

Leaves should regenerate.

Weather should alter resource availability.

---

# 11. Seasons

Introduce seasonal ecology.

### Spring

Abundant vegetation.

### Summer

Maximum growth and colony expansion.

### Autumn

Changing vegetation and declining food availability.

### Winter

For species/scenarios where relevant, greatly reduced activity or severe environmental stress.

Seasonality should affect:

* plant growth
* temperature
* rainfall
* soil moisture
* predator activity
* fungal growth
* colony metabolism

---

# 12. Weather

Weather should be a major simulation system.

Examples:

### Rain

Can:

* flood tunnels
* wash away pheromone trails
* increase vegetation growth
* change soil conditions
* create mud
* expose tunnels

### Drought

Can:

* reduce vegetation
* dry fungus gardens
* increase water stress
* increase foraging distances

### Storm

Can:

* destroy trails
* damage vegetation
* collapse entrances
* temporarily alter the environment

---

# 13. Predators

The colony should exist in a hostile ecosystem.

Potential threats:

* spiders
* beetles
* birds
* lizards
* frogs
* other ants
* parasitic organisms
* fungal pathogens

Predators should not simply be scripted attacks.

They should be autonomous animals participating in the ecosystem.

---

# 14. Colony Warfare

Allow interactions with rival colonies.

Colonies should have:

* territory
* scent boundaries
* resource competition
* patrol workers
* soldiers
* territorial conflicts

Conflicts should emerge naturally from overlapping foraging territories.

The player shouldn't get an RTS-style "attack button."

Instead, colony behavior determines what happens.

---

# 15. Reproduction

The late game should revolve around producing reproductive ants.

A mature colony eventually produces:

### Winged females

Future queens.

### Males

Reproductive males.

Trigger a spectacular **nuptial flight** event.

Thousands of alates emerge from the colony and enter the environment.

This should be one of the game's biggest visual events.

The player can potentially establish a new colony from a successful queen.

---

# 16. Multi-Colony World

Eventually allow the player to simulate an entire landscape containing hundreds of colonies.

Each colony has:

```text
Population
Territory
Resources
Fungus health
Genetic traits
Behavioral tendencies
Age
Queen
Workers
Infrastructure
```

The world becomes an ecological simulation rather than a single colony game.

---

# 17. Genetics

Introduce genetics later in the game.

Colonies could have inherited traits affecting:

* worker size
* growth rate
* fungus efficiency
* disease resistance
* aggression
* foraging efficiency
* environmental tolerance
* reproductive output

Don't turn this into RPG stat grinding.

Genetics should primarily create **biological variation**.

---

# 18. Incredible Graphics

The visual target should be **high-end natural-history documentary quality**.

Use a modern browser 3D engine such as:

* WebGPU
* Three.js
* Babylon.js

Use:

### Physically based rendering

* realistic soil
* wet leaves
* organic materials
* translucent insect bodies
* detailed exoskeletons

### Instanced rendering

Thousands of ants must be visible simultaneously without destroying performance.

### Level of Detail

At maximum zoom:

```text
individual ant
```

At medium zoom:

```text
hundreds of ants
```

At strategic zoom:

```text
entire colony
```

At world zoom:

```text
ecosystem
```

---

# 19. Ant Animation

Ants should have hundreds of subtle behavioral animations.

Examples:

* walking
* climbing
* cutting leaves
* carrying leaves
* grooming
* antennae interaction
* feeding larvae
* excavating
* fighting
* dragging debris
* tending fungus
* carrying brood
* resting
* cleaning themselves

The colony should look **alive even when the player does absolutely nothing**.

---

# 20. Camera

Use an extremely smooth camera.

### Strategic view

Isometric/SimCity-style.

### Colony view

Cutaway underground.

### Biological view

Ground-level first-person/third-person camera.

### Ant view

Optional camera following an individual ant.

### Microscope mode

Extreme close-up showing:

* mandibles
* antennae
* fungus
* brood
* mites
* microbial interactions

---

# 21. UI Philosophy

Avoid conventional strategy-game clutter.

The UI should feel like a **scientific visualization tool disguised as a beautiful game**.

Main controls:

```text
┌──────────────────────────────────────────────┐
│ POPULATION 12,483   FOOD 82%   FUNGUS 94%   │
├──────────────────────────────────────────────┤
│                                              │
│              COLONY VIEW                     │
│                                              │
│                                              │
├──────────────────────────────────────────────┤
│ Colony │ Infrastructure │ Ecology │ Research │
└──────────────────────────────────────────────┘
```

Clicking a chamber opens biological statistics.

---

# 22. Information Layers

Allow overlays such as:

**Population**

```text
Workers
Brood
Soldiers
Queen
```

**Pheromones**

Show the invisible chemical network as a glowing visualization.

**Temperature**

```text
blue → cold
red → hot
```

**Humidity**

Show moisture distribution.

**Traffic**

Visualize worker movement.

**Food**

Show resource distribution.

**Fungus**

Show fungal health.

**Disease**

Show contamination hotspots.

These overlays should make the game useful as an educational simulation without feeling like an educational game.

---

# 23. Progression

Don't use a traditional technology tree.

Instead use **biological development**.

### Stage 1 — Foundress

One queen.

Tiny chamber.

Minimal fungus.

### Stage 2 — Founding Colony

Dozens of workers.

First foraging trails.

### Stage 3 — Growing Colony

Hundreds of workers.

Multiple fungus gardens.

### Stage 4 — Mature Colony

Thousands of workers.

Complex tunnel network.

Specialized castes.

### Stage 5 — Supercolony

Tens/hundreds of thousands depending on species and scenario.

Huge territory.

Multiple entrances.

Massive logistics network.

### Stage 6 — Reproductive Colony

Produce alates.

Launch nuptial flights.

Establish daughter colonies.

---

# 24. Emergencies

The simulation should generate unexpected problems.

Examples:

> **FUNGAL CONTAMINATION DETECTED**

> **TUNNEL FLOODING**

> **PREDATOR DETECTED**

> **FORAGING TRAIL COLLAPSED**

> **FOOD SHORTAGE**

> **NURSERY TEMPERATURE CRITICAL**

> **RIVAL COLONY ENCROACHMENT**

> **QUEEN HEALTH DECLINING**

The player solves these through colony-level decisions rather than clicking through canned events.

---

# 25. "God Mode"

Add a sandbox mode.

The player can manipulate:

* rainfall
* temperature
* vegetation
* predators
* colony size
* soil
* fungus
* rival colonies

Allow things like:

> "What happens if I introduce 10,000 workers into this ecosystem?"

or:

> "What happens if I remove all vegetation within 50 meters?"

This could make the game extremely compelling for educational use.

---

# 26. Simulation Speed

Provide:

```text
▶ 1×
▶▶ 2×
▶▶▶ 5×
▶▶▶▶ 10×
⏸ Pause
```

But maintain the ability to pause the simulation and inspect individual ants.

---

# 27. The Most Important Gameplay Loop

The core loop should be:

```text
OBSERVE
   ↓
IDENTIFY BOTTLENECK
   ↓
CHANGE COLONY PRIORITIES
   ↓
ANTS RESPOND
   ↓
COLONY CHANGES
   ↓
ENVIRONMENT CHANGES
   ↓
NEW PROBLEM EMERGES
   ↓
OBSERVE AGAIN
```

The player should constantly feel:

> **"I didn't tell them to do that. The colony figured it out."**

That is the central fantasy.

---

# 28. Technical Architecture

For a browser implementation, separate the simulation from rendering.

```text
                    ┌───────────────┐
                    │   WebGPU      │
                    │   Renderer    │
                    └───────┬───────┘
                            │
                    ┌───────▼───────┐
                    │ Visualization │
                    └───────┬───────┘
                            │
              ┌─────────────▼─────────────┐
              │     Simulation Engine     │
              ├───────────────────────────┤
              │ Ant behavior               │
              │ Colony economy             │
              │ Pheromones                 │
              │ Fungus                     │
              │ Vegetation                 │
              │ Weather                    │
              │ Soil                       │
              │ Predators                  │
              │ Disease                    │
              └─────────────┬─────────────┘
                            │
                    ┌───────▼───────┐
                    │ Web Workers   │
                    │ Parallel Sim  │
                    └───────────────┘
```

The simulation should **not** require one JavaScript object and one physics body for every ant.

Use:

* typed arrays
* spatial hashing
* instanced rendering
* Web Workers
* WebGPU compute shaders where appropriate
* event-driven behavior
* LOD simulation

For 100,000+ ants, simulate distant ants statistically while maintaining full individual simulation near the camera.

---

# 29. Accuracy Rules

The game should distinguish between:

### Known biology

Implement accurately.

### Reasonable scientific approximation

Document the approximation.

### Unknown biology

Expose it as a simulation assumption rather than pretending it is established fact.

Include an optional:

> **"Why does this happen?"**

button that explains the underlying biological mechanism.

The goal is **scientific plausibility first, game mechanics second**.

---

# 30. Overall Visual Direction

The aesthetic should feel like:

**BBC Earth + SimCity + microscopic nature documentary + high-end game engine.**

Imagine opening the game and seeing:

A lush tropical forest at dawn.

Tiny ants emerge from a mound.

A few scouts explore.

One discovers a fallen leaf.

The first workers arrive.

A faint trail forms.

More ants follow.

The trail becomes a highway.

Workers carry enormous green fragments back underground.

The camera descends through the soil.

Below the surface is an enormous living city.

Fungus gardens glow softly under humid chamber lighting.

Thousands of ants move through tunnels.

Workers tend larvae.

Soldiers patrol intersections.

Waste workers haul debris into distant chambers.

The player zooms out.

The entire colony is visible.

Then rain begins.

The forest darkens.

Water begins entering an entrance.

The player pauses.

A warning appears:

> **WATER INFILTRATION — EASTERN NURSERY**

The player redirects excavation priorities.

Thousands of ants begin responding.

**That is the game.**
