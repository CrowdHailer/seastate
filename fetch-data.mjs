// Fetch weather, marine and astronomy data for every beach in locations.json
// and write one forecast file per beach to _site/data/<slug>.json.
//
// The forecast day is the Europe/London calendar day (override with SEASTATE_DATE=YYYY-MM-DD).
// All upstream requests are made in UTC; hours are re-labelled to London time for display.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { beaufort, compass } from "./src/beaufort.mjs";

const OUT_DIR = process.env.SEASTATE_OUT ?? "_site/data";
const TZ = "Europe/London";
const locations = JSON.parse(await readFile(new URL("./locations.json", import.meta.url), "utf8"));

const localDate = process.env.SEASTATE_DATE ?? londonParts(new Date()).date;
const range = { start: addDays(localDate, -1), end: addDays(localDate, 1) };

// Four pictures a day. Each slot is painted at `hour` and shown for the UK hours in [from, to).
export const SLOTS = [
  { key: "morning", label: "Morning", hour: 8, from: 5, to: 11 },
  { key: "noon", label: "Noon", hour: 12, from: 11, to: 14 },
  { key: "afternoon", label: "Afternoon", hour: 15, from: 14, to: 19 },
  { key: "night", label: "Night", hour: 22, from: 19, to: 5 }
];

const ATTRIBUTION = [
  { name: "Open-Meteo weather forecast API", url: "https://open-meteo.com/", licence: "CC BY 4.0", note: "Weather data by Open-Meteo.com and its national weather service model providers." },
  { name: "Open-Meteo marine forecast API", url: "https://open-meteo.com/en/docs/marine-weather-api", licence: "CC BY 4.0", note: "Marine data by Open-Meteo.com with DWD, Copernicus Marine Service and Météo-France models." },
  { name: "US Naval Observatory Astronomical Applications API", url: "https://aa.usno.navy.mil/data/api", note: "Sun and moon data courtesy of the Astronomical Applications Department, USNO." }
];

export function londonParts(date) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23"
  }).formatToParts(date).map(p => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour), time: `${parts.hour}:${parts.minute}` };
}

function addDays(isoDate, days) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function getJson(url, label) {
  let lastError;
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const response = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(30000) });
      if (response.ok) return await response.json();
      lastError = new Error(`${label}: HTTP ${response.status} ${(await response.text()).slice(0, 200)}`);
      if (response.status < 500 && response.status !== 429) break;
    } catch (error) {
      lastError = new Error(`${label}: ${error.message}`);
    }
    await new Promise(resolve => setTimeout(resolve, 2000 * 2 ** (attempt - 1)));
  }
  throw lastError;
}

function fetchWeather(loc) {
  const q = new URLSearchParams({
    latitude: loc.latitude, longitude: loc.longitude, timezone: "GMT",
    start_date: range.start, end_date: range.end, wind_speed_unit: "kmh",
    hourly: "wind_speed_10m,wind_gusts_10m,wind_direction_10m,cloud_cover"
  });
  return getJson(`https://api.open-meteo.com/v1/forecast?${q}`, `weather ${loc.slug}`);
}

function fetchMarine(loc) {
  const q = new URLSearchParams({
    latitude: loc.latitude, longitude: loc.longitude, timezone: "GMT",
    start_date: range.start, end_date: range.end, cell_selection: "sea",
    hourly: "wave_height,wave_period,wave_direction,sea_level_height_msl"
  });
  return getJson(`https://marine-api.open-meteo.com/v1/marine?${q}`, `marine ${loc.slug}`);
}

async function fetchAstronomy(loc) {
  // Three UTC days so that events either side of the London day are known.
  const days = [];
  for (const date of [range.start, localDate, range.end]) {
    const q = new URLSearchParams({ date, coords: `${loc.latitude},${loc.longitude}`, tz: "0" });
    const json = await getJson(`https://aa.usno.navy.mil/api/rstt/oneday?${q}`, `astronomy ${loc.slug} ${date}`);
    days.push({ date, data: json.properties.data });
  }
  return days;
}

// Rise/Set events as absolute timestamps, sorted.
function events(astroDays, key) {
  return astroDays.flatMap(({ date, data }) => (data[key] ?? [])
    .filter(e => e.phen === "Rise" || e.phen === "Set")
    .map(e => ({ phen: e.phen, at: new Date(`${date}T${e.time}:00Z`) })))
    .sort((a, b) => a.at - b.at);
}

function isUp(evts, at) {
  const before = evts.filter(e => e.at <= at).at(-1);
  if (before) return before.phen === "Rise";
  const after = evts.find(e => e.at > at);
  return after ? after.phen === "Set" : false;
}

function sunPhase(sunEvents, at) {
  const minutes = target => Math.min(...sunEvents.filter(e => e.phen === target).map(e => Math.abs(at - e.at) / 60000));
  if (minutes("Rise") <= 50) return "dawn";
  if (minutes("Set") <= 50) return "dusk";
  return isUp(sunEvents, at) ? "day" : "night";
}

// Strict hourly extrema of sea level, excluding missing, flat and boundary samples.
export function tideEvents(times, levels) {
  const out = [];
  for (let i = 1; i < levels.length - 1; i++) {
    const [a, b, c] = [levels[i - 1], levels[i], levels[i + 1]];
    if ([a, b, c].some(v => v == null)) continue;
    if (b > a && b > c) out.push({ type: "high", time: times[i], heightM: b });
    else if (b < a && b < c) out.push({ type: "low", time: times[i], heightM: b });
  }
  return out;
}

function moonPhaseInfo(curphase) {
  const p = curphase.toLowerCase();
  return { phase: curphase, waxing: p.includes("waxing") || p.includes("first") || p.includes("new") };
}

async function buildLocation(loc) {
  const [weather, marine, astro] = await Promise.all([fetchWeather(loc), fetchMarine(loc), fetchAstronomy(loc)]);
  const wh = weather.hourly, mh = marine.hourly;
  const marineIndex = new Map(mh.time.map((t, i) => [t, i]));
  const times = mh.time.map(t => `${t}:00Z`);
  const tides = tideEvents(times, mh.sea_level_height_msl);
  const sunEvents = events(astro, "sundata"), moonEvents = events(astro, "moondata");
  const today = astro.find(d => d.date === localDate).data;
  const moon = { ...moonPhaseInfo(today.curphase), illumination: parseFloat(today.fracillum) / 100 };

  const hours = [];
  for (let i = 0; i < wh.time.length; i++) {
    const at = new Date(`${wh.time[i]}:00Z`);
    const local = londonParts(at);
    if (local.date !== localDate) continue;
    const m = marineIndex.get(wh.time[i]);
    const level = mh.sea_level_height_msl[m] ?? null;
    const prev = mh.sea_level_height_msl[m - 1], next = mh.sea_level_height_msl[m + 1];
    // Position of this hour's sea level between the nearest low and high (0 = low, 1 = high).
    const nearLow = tides.filter(t => t.type === "low").sort((a, b) => Math.abs(new Date(a.time) - at) - Math.abs(new Date(b.time) - at))[0];
    const nearHigh = tides.filter(t => t.type === "high").sort((a, b) => Math.abs(new Date(a.time) - at) - Math.abs(new Date(b.time) - at))[0];
    const fraction = level != null && nearLow && nearHigh && nearHigh.heightM > nearLow.heightM
      ? Math.max(0, Math.min(1, (level - nearLow.heightM) / (nearHigh.heightM - nearLow.heightM))) : null;
    const speed = wh.wind_speed_10m[i];
    const bf = speed == null ? null : beaufort(speed);
    hours.push({
      index: hours.length,
      time: at.toISOString(),
      localTime: local.time,
      localHour: local.hour,
      wind: {
        speedKmh: speed, gustKmh: wh.wind_gusts_10m[i], directionFrom: wh.wind_direction_10m[i],
        compassFrom: wh.wind_direction_10m[i] == null ? null : compass(wh.wind_direction_10m[i]),
        beaufort: bf?.force ?? null, beaufortName: bf?.name ?? null
      },
      cloudCover: wh.cloud_cover[i],
      waves: {
        heightM: mh.wave_height[m] ?? null, periodS: mh.wave_period[m] ?? null,
        directionFrom: mh.wave_direction[m] ?? null,
        compassFrom: mh.wave_direction[m] == null ? null : compass(mh.wave_direction[m])
      },
      tide: {
        seaLevelM: level,
        trend: level == null || prev == null || next == null ? null : next > prev ? "rising" : next < prev ? "falling" : "slack",
        fraction
      },
      sun: { up: isUp(sunEvents, at), phase: sunPhase(sunEvents, at) },
      moon: { up: isUp(moonEvents, at) }
    });
  }

  const fmt = evts => kind => evts.filter(e => e.phen === kind && londonParts(e.at).date === localDate).map(e => londonParts(e.at).time);
  const sun = fmt(sunEvents), moonTimes = fmt(moonEvents);
  const missing = hours.filter(h => h.wind.speedKmh == null || h.waves.heightM == null).length;
  return {
    location: loc,
    date: localDate,
    timezone: TZ,
    fetchedAt: new Date().toISOString(),
    grid: {
      weather: { latitude: weather.latitude, longitude: weather.longitude },
      marine: { latitude: marine.latitude, longitude: marine.longitude }
    },
    sun: { rise: sun("Rise"), set: sun("Set") },
    moon: { ...moon, rise: moonTimes("Rise"), set: moonTimes("Set"), closestPhase: today.closestphase },
    tides: {
      label: "Hourly tide estimates",
      note: "Derived from hourly modelled sea level relative to global mean sea level (not chart datum, ~8 km coastal resolution). Not official tide-table predictions.",
      events: tides.filter(t => londonParts(new Date(t.time)).date === localDate)
        .map(t => ({ ...t, localTime: londonParts(new Date(t.time)).time }))
    },
    hours,
    slots: SLOTS.map(slot => ({ ...slot, index: hours.findIndex(h => h.localHour === slot.hour) })).filter(slot => slot.index >= 0),
    quality: { hours: hours.length, hoursWithMissingData: missing },
    attribution: ATTRIBUTION
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await mkdir(OUT_DIR, { recursive: true });
  const index = [];
  let failures = 0;
  for (const loc of locations) {
    try {
      const data = await buildLocation(loc);
      await writeFile(`${OUT_DIR}/${loc.slug}.json`, JSON.stringify(data, null, 2));
      const h = data.hours[12] ?? data.hours[0];
      console.log(`✔ ${loc.name}: ${data.hours.length} hours for ${data.date}; noon wind ${h.wind.speedKmh} km/h (F${h.wind.beaufort}) from ${h.wind.compassFrom}, waves ${h.waves.heightM} m @ ${h.waves.periodS}s, cloud ${h.cloudCover}%, ${data.tides.events.length} tide events, moon ${data.moon.phase} ${Math.round(data.moon.illumination * 100)}%, missing ${data.quality.hoursWithMissingData}`);
      index.push({ slug: loc.slug, name: loc.name, county: loc.county, date: data.date, fetchedAt: data.fetchedAt });
    } catch (error) {
      failures++;
      console.error(`✘ ${loc.name}: ${error.message}`);
    }
  }
  await writeFile(`${OUT_DIR}/index.json`, JSON.stringify({ date: localDate, timezone: TZ, generatedAt: new Date().toISOString(), locations: index }, null, 2));
  if (failures) {
    console.error(`${failures} location(s) failed.`);
    process.exit(1);
  }
}
