import { DAY_LEN, SEASON_DAYS, SEASONS, clamp, lerp } from './constants.js';

// Seasonal climate for a lowland Neotropical forest, mapped onto four named seasons.
const SEASON_PARAMS = [
  { temp: 25.5, rain: 0.38, growth: 1.25, predators: 1.0, drought: 0.0 },  // Spring
  { temp: 28.5, rain: 0.5, growth: 1.5, predators: 1.3, drought: 0.03 },   // Summer
  { temp: 24.5, rain: 0.25, growth: 0.85, predators: 0.9, drought: 0.06 }, // Autumn
  { temp: 20.5, rain: 0.1, growth: 0.45, predators: 0.5, drought: 0.3 },   // Winter
];

const WEATHER_LABEL = { clear: 'Clear', cloudy: 'Overcast', rain: 'Rain', storm: 'Thunderstorm', drought: 'Drought' };

export class Environment {
  constructor(rng, startDay = 0.28) {
    this.rng = rng;
    this.time = startDay * DAY_LEN;
    this.weather = 'clear';
    this.weatherTimer = 90;
    this.rain = 0;
    this.cloud = 0.1;
    this.wind = 0.2;
    this.soilMoisture = 0.6;
    this.temp = 25;
    this.hum = 0.75;
    this.lightning = 0;
    this.lastRainEnd = -1e9;
    this.rainAccum = 0; // recent rain, decays — used for nuptial flight cues
    this.godRain = null;
    this.godTemp = 0;
    this.gust = 0;
    this.events = [];
  }

  get day() { return this.time / DAY_LEN; }
  get tod() { return (this.time / DAY_LEN) % 1; }
  get seasonIdx() { return Math.floor(this.day / SEASON_DAYS) % 4; }
  get seasonName() { return SEASONS[this.seasonIdx]; }
  get seasonT() { return (this.day / SEASON_DAYS) % 1; }
  get year() { return Math.floor(this.day / (SEASON_DAYS * 4)) + 1; }
  get weatherLabel() { return WEATHER_LABEL[this.weather]; }

  season() {
    const a = SEASON_PARAMS[this.seasonIdx], b = SEASON_PARAMS[(this.seasonIdx + 1) % 4];
    const t = Math.max(0, (this.seasonT - 0.7) / 0.3); // blend into next season over the last 30%
    const o = {};
    for (const k in a) o[k] = lerp(a[k], b[k], t);
    return o;
  }

  sunElevation() { return Math.sin(2 * Math.PI * (this.tod - 0.25)); }
  isNight() { return this.sunElevation() < -0.05; }

  chooseWeather() {
    const sp = this.season();
    const r = this.rng.next();
    let w, dur;
    const pStorm = sp.rain * 0.25, pRain = sp.rain * 0.75, pDrought = sp.drought;
    if (r < pStorm) { w = 'storm'; dur = this.rng.range(30, 70); }
    else if (r < pStorm + pRain) { w = 'rain'; dur = this.rng.range(40, 120); }
    else if (r < pStorm + pRain + pDrought) { w = 'drought'; dur = this.rng.range(300, 700); }
    else if (r < pStorm + pRain + pDrought + 0.2) { w = 'cloudy'; dur = this.rng.range(60, 150); }
    else { w = 'clear'; dur = this.rng.range(80, 220); }
    this.setWeather(w, dur);
  }

  setWeather(w, dur) {
    const wasWet = this.weather === 'rain' || this.weather === 'storm';
    if (wasWet && !(w === 'rain' || w === 'storm')) this.lastRainEnd = this.time;
    if (w !== this.weather) this.events.push({ type: 'weather', weather: w });
    this.weather = w;
    this.weatherTimer = dur;
  }

  step(dt) {
    this.time += dt;
    this.weatherTimer -= dt;
    if (this.weatherTimer <= 0) this.chooseWeather();

    const sp = this.season();
    let rainT = { clear: 0, cloudy: 0, rain: 0.55, storm: 1, drought: 0 }[this.weather];
    if (this.godRain !== null) rainT = this.godRain;
    this.rain += (rainT - this.rain) * Math.min(1, dt * 0.15);
    if (this.rain < 0.002) this.rain = 0;
    const cloudT = { clear: 0.1, cloudy: 0.7, rain: 0.9, storm: 1, drought: 0 }[this.weather];
    this.cloud += (Math.max(cloudT, this.rain) - this.cloud) * Math.min(1, dt * 0.1);
    const windT = this.weather === 'storm' ? 1 : this.weather === 'rain' ? 0.5 : 0.2;
    this.wind += (windT - this.wind) * Math.min(1, dt * 0.2);

    const diurnal = Math.sin(2 * Math.PI * (this.tod - 0.33));
    const drought = this.weather === 'drought' ? 1 : 0;
    const targetTemp = sp.temp + 4.5 * diurnal * (1 - 0.6 * this.cloud) - 3 * this.rain + drought * 3 + this.godTemp;
    this.temp += (targetTemp - this.temp) * Math.min(1, dt * 0.05);
    this.hum = clamp(0.62 + 0.3 * this.rain + 0.15 * this.soilMoisture - 0.1 * diurnal - drought * 0.2, 0.15, 1);

    const evap = 0.0014 * (1 + Math.max(0, this.temp - 25) * 0.1) * (drought ? 2 : 1);
    this.soilMoisture = clamp(this.soilMoisture + (this.rain * 0.012 - evap) * dt, 0.02, 1);
    this.rainAccum = this.rainAccum * Math.exp(-dt / DAY_LEN) + this.rain * dt;

    this.lightning = Math.max(0, this.lightning - dt * 4);
    if (this.weather === 'storm' && this.rng.chance(dt * 0.12)) {
      this.lightning = 1;
      this.events.push({ type: 'lightning' });
    }
    this.gust = this.weather === 'storm' && this.rng.chance(dt * 0.02) ? 1 : 0;
  }

  timeString() {
    const h = this.tod * 24;
    const hh = Math.floor(h), mm = Math.floor((h - hh) * 60);
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  }
}
