// "Why does this happen?" — every mechanic is labelled by how well it is grounded.
export const LEVEL = {
  known: 'Known biology',
  approx: 'Reasonable approximation',
  assume: 'Simulation assumption',
};

export const KNOWLEDGE = {
  trails: {
    title: 'Foraging trails & pheromones', level: 'known',
    body: `Returning foragers lay a trail pheromone from their poison gland (in Atta, largely methyl 4-methylpyrrole-2-carboxylate) in proportion to how good the food was. Outbound ants follow the strongest gradient, so good routes are reinforced and poor ones evaporate. Heavily used trails are physically cleared of litter and vegetation, becoming the bare "highways" you see.`,
    sim: 'Each surface cell stores trail, home, alarm and territory chemicals. They diffuse, evaporate faster in heat, and wash out in rain. Ants steer using three sensors (left, centre, right).',
    refs: 'Hölldobler & Wilson 2011, The Leafcutter Ants; Tumlinson et al. 1971',
  },
  rainTrails: {
    title: 'Rain erases trails', level: 'known',
    body: 'Trail pheromones are volatile and water soluble. Heavy rain removes them, and foraging largely stops during downpours. After the rain, scouts have to re-establish the network.',
    sim: 'Wash-off rate scales with rain intensity squared.',
  },
  taskAllocation: {
    title: 'Who decides what an ant does?', level: 'approx',
    body: `No ant is in charge. Each worker has an internal threshold for each task. When the local stimulus for a task (for example, uncut leaves piling up, or brood begging for food) exceeds its threshold, it is likely to take the task on. Doing a task lowers the threshold for it (specialisation), so the colony self-organises into a workforce matched to its needs.`,
    sim: 'Response-threshold model: P(task) = s² / (s² + θ²). Stimulus = colony need × your priority slider. Thresholds depend on caste, age and experience.',
    refs: 'Bonabeau, Theraulaz & Deneubourg 1996; Theraulaz et al. 1998',
  },
  agePolyethism: {
    title: 'Age-based division of labour', level: 'known',
    body: 'Young workers tend to stay deep in the nest, caring for brood and fungus. As they age they move outwards to excavation, foraging and finally waste handling, the most dangerous and least valuable jobs.',
    sim: 'Young and old ants get lower thresholds for age-appropriate tasks.',
    refs: 'Wilson 1980; Camargo et al. 2007',
  },
  polymorphism: {
    title: 'Worker castes', level: 'known',
    body: 'Atta workers vary more than 200-fold in body mass. Minims (head width < 1 mm) tend fungus and brood and ride on leaves. Medias cut and carry leaves. Majors and soldiers (head width > 3 mm) have huge, muscle-filled heads and defend the colony and clear trails. Small, young colonies cannot yet produce the largest castes.',
    sim: 'Adult size is set by larval nutrition and the colony’s size, then mapped onto caste. Head size scales faster than body size (allometry).',
    refs: 'Wilson 1980, Behav Ecol Sociobiol 7:143–156',
  },
  fungusFood: {
    title: 'Leafcutters don’t eat leaves', level: 'known',
    body: 'The leaves feed a mutualistic fungus, Leucoagaricus gongylophorus. It produces nutrient-rich swollen hyphal tips (gongylidia) that feed the larvae and much of the adults’ diet. Adults also drink plant sap while cutting. No leaves means no fungus growth, which in turn means no brood and, eventually, collapse.',
    sim: 'Leaf substrate → fungal biomass (per cell) → harvested food. Food is consumed by adults, larvae and the queen.',
  },
  contamination: {
    title: 'Garden parasites (Escovopsis)', level: 'known',
    body: 'The specialised parasitic fungus Escovopsis attacks leafcutter gardens. Workers weed infected fragments, groom the garden, and carry Pseudonocardia bacteria that produce antifungal compounds. Spent substrate and nearby waste raise infection risk.',
    sim: 'Contamination grows logistically, is fed by refuse, nearby waste and water, and spreads between garden cells. Gardeners groom it away. Minims groom best.',
    refs: 'Currie et al. 1999, Nature 398:701',
  },
  waste: {
    title: 'Waste management', level: 'known',
    body: 'Exhausted substrate and corpses are pathogen reservoirs. Atta colonies move them to dedicated waste chambers or external dumps, depending on species (A. colombica dumps outside, A. cephalotes uses deep internal chambers). Waste handlers tend to be old workers, and are kept apart from the garden.',
    sim: 'Refuse accumulates in gardens as fungus grows. Waste workers carry it to the nearest waste chamber, or out of the nest if there is none. Waste close to gardens raises contamination.',
    refs: 'Bot et al. 2001; Hart & Ratnieks 2001; Waddington & Hughes 2010',
  },
  rejection: {
    title: 'Delayed plant rejection', level: 'known',
    body: 'Foragers cannot detect every plant defence. When substrate harms the fungus (for example, the antifungal terpenoids of Hymenaea), the fungus appears to emit a signal and the colony stops collecting that plant for weeks, even though no individual ant "knew" the plant was harmful.',
    sim: 'Toxic substrate damages the garden and raises a colony-level rejection value that foragers consult when choosing plants.',
    refs: 'Ridley, Howse & Jackson 1996; Herz et al. 2008',
  },
  phorid: {
    title: 'Phorid flies & hitchhikers', level: 'known',
    body: 'Parasitoid phorid flies (e.g. Eibesfeldtphora, Apocephalus) lay eggs in medium workers on the trail. The larva later decapitates the host. Minims ride on carried leaves and fend off the flies, which is why you see tiny ants riding on leaf fragments.',
    sim: 'Unguarded leaf carriers are parasitised far more often than those with a hitchhiker. Parasitised ants slowly lose health.',
    refs: 'Feener & Moss 1990, Behav Ecol Sociobiol 26:17–29',
  },
  nuptial: {
    title: 'Nuptial flight', level: 'known',
    body: 'Mature colonies raise thousands of winged queens and males. After heavy rains at the start of the wet season, often at dawn, they leave together. Queens mate with several males in the air, shed their wings and dig a founding chamber, carrying a pellet of fungus in the infrabuccal pocket. More than 99% of queens die.',
    sim: 'Alates are produced by large, well-fed colonies in late winter and spring. Flights trigger after substantial rain at dawn, or on request. Founding success is ~0.6% per queen.',
  },
  founding: {
    title: 'Claustral founding', level: 'known',
    body: 'An Atta queen seals herself underground and raises her first workers entirely from her body reserves, including her now-useless wing muscles. She manures her tiny garden with fecal fluid. The first workers are all minims. Only later do they open the nest and begin foraging.',
    sim: 'The founding queen has a reserve pool that feeds her, her brood and her garden until workers take over.',
  },
  temperature: {
    title: 'Nest climate', level: 'approx',
    body: 'The fungus grows best around 25 °C and dies above ~30–32 °C. Brood develops fastest near 25–28 °C. Soil buffers daily temperature swings, so deep chambers are stable. Large Atta nests use wind-induced ventilation through central and peripheral openings.',
    sim: 'Cell temperature blends deep-soil temperature with the surface, weighted by depth and by airflow distance to entrances and ventilation shafts. Fungal metabolism adds heat.',
    refs: 'Kleineidam, Ernst & Roces 2001; Powell & Stradling 1986',
  },
  humidity: {
    title: 'Humidity', level: 'approx',
    body: 'The fungus needs very high humidity. Dry air near entrances or during drought desiccates gardens, and workers relocate gardens deeper.',
    sim: 'Humidity falls toward the surface and entrances, rises with soil moisture, and drops in droughts.',
  },
  flooding: {
    title: 'Flooding', level: 'approx',
    body: 'Heavy rain can flood shallow chambers. Workers plug entrances with soil during storms and reopen them afterwards. Mound shape and turret-like entrances reduce water entry. Deep dead-end shafts can act as sumps.',
    sim: 'Water enters open entrances in proportion to rain², is reduced by mound height and entrance plugging, flows downward and sideways, and seeps into the soil.',
  },
  defense: {
    title: 'Colony defence', level: 'known',
    body: 'Injured or disturbed ants release alarm pheromone (in Atta, largely 4-methyl-3-heptanone). Small workers flee it. Majors and soldiers are attracted and attack with shearing mandibles. Soldiers are especially important against vertebrates.',
    sim: 'Alarm pheromone is laid in fights and predator strikes. Large workers are recruited. Defenders damage predators until they flee.',
  },
  territory: {
    title: 'Territory & rival colonies', level: 'approx',
    body: 'Neighbouring leafcutter colonies compete for the same plants. Foragers mark their territory chemically. Where foraging areas overlap, fights break out and colonies avoid heavily contested ground.',
    sim: 'Each colony deposits its own territory scent. Foragers tend to avoid strongly foreign-marked ground (less so in aggressive colonies). Meetings between colonies become fights.',
  },
  predators: {
    title: 'Predators', level: 'known',
    body: 'Spiders ambush foragers on trails. Lizards, toads (at nest entrances at night) and antbirds eat workers, and swarms of predators gather during nuptial flights.',
    sim: 'Predators are autonomous animals with hunger, health and behaviour modes, not scripted events.',
  },
  queen: {
    title: 'The queen', level: 'known',
    body: 'An Atta queen can live over a decade and lay hundreds of millions of eggs, storing sperm from her nuptial flight for life. The colony cannot replace her: when she dies, the colony dies.',
    sim: 'Queen egg rate scales with colony size and nutrition. Starvation, flooding and extreme temperatures reduce her health.',
  },
  nursery: {
    title: 'Brood care', level: 'known',
    body: 'Nurses move eggs from the queen to nursery chambers, feed larvae with fungus and lick them clean. Brood is moved to chambers with good temperature and humidity.',
    sim: 'Larvae grow only when nurses are present to feed them. Underfed larvae become small workers or die. Crowded nurseries limit brood.',
  },
  excavation: {
    title: 'Excavation', level: 'known',
    body: 'Workers dig soil pellets with their mandibles and carry them to the surface, building the characteristic bare mound. A mature Atta nest can move tonnes of soil. Excavation is also self-organised: crowding and full gardens trigger digging.',
    sim: 'Marked soil is dug cell by cell (harder deeper). Each pellet is carried out and added to the mound. With colony autonomy on, the colony extends full gardens and crowded nurseries by itself.',
  },
  tunnels: {
    title: 'Tunnel width', level: 'approx',
    body: 'Large workers need wider galleries. Narrow tunnels are cheaper, but slow large-worker traffic and limit airflow.',
    sim: 'Majors and soldiers path only through tunnels at least two cells wide, squeezing slowly through narrow ones. Wide tunnels also ventilate better.',
  },
  idle: {
    title: 'Why are so many ants resting?', level: 'known',
    body: 'In real colonies a large fraction of workers is inactive at any moment. These reserve workers let the colony respond quickly to sudden demand.',
    sim: 'Resting is always an option in task choice, weighted by fatigue.',
  },
  time: {
    title: 'Compressed time', level: 'assume',
    body: 'Real brood takes ~6–8 weeks to develop and workers live months. To keep the game playable, one in-game day is 4 minutes and development and lifespans are compressed by roughly 30–50×. Ratios between processes are preserved where possible.',
  },
  scale: {
    title: 'Compressed space', level: 'assume',
    body: 'One world unit ≈ 2 cm, so the map is ~2.5 m across. Real Atta colonies forage over 100 m and nests reach 8 m deep. Distances are compressed so trails, mound and nest fit on one screen.',
  },
  lod: {
    title: 'Statistical workers', level: 'assume',
    body: 'Beyond ~9,000 individually simulated ants, extra workers are simulated statistically. They do the same mix of tasks as the individual ants, and their foraging yield is measured from the individual foragers.',
  },
  genetics: {
    title: 'Colony genetics', level: 'approx',
    body: 'Colonies differ heritably in worker size, growth, disease resistance and aggression. Atta queens mate with several males, which increases genetic diversity and disease resistance. Here, traits are colony-level multipliers passed to daughter colonies with small mutations.',
  },
};
