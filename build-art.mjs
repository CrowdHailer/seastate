// Generate one artwork per beach per hour and render it to PNG in Chromium.
//
// With OLLAMA_API_KEY set, each image is an SVG authored by an Ollama Cloud model
// (OLLAMA_MODEL, default kimi-k2.6). Anything missing, invalid or unrenderable falls back
// to the procedural painter in src/scene.mjs so the site always has a full set of images.
// Output: _site/art/<slug>/<HH>.{svg,png,json}; each forecast file gains an `art` entry per hour.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
import { renderScene } from "./src/scene.mjs";

const SITE = process.env.SEASTATE_SITE ?? "_site";
const MODEL = process.env.OLLAMA_MODEL ?? "kimi-k2.6";
const API_KEY = process.env.OLLAMA_API_KEY;
const CONCURRENCY = Number(process.env.OLLAMA_CONCURRENCY ?? 4);
const TIMEOUT_MS = Number(process.env.OLLAMA_TIMEOUT_MS ?? 300000);
const locations = JSON.parse(await readFile(new URL("./locations.json", import.meta.url), "utf8"));

export function buildPrompt(data, hour) {
  const loc = data.location;
  const w = hour.wind, v = hour.waves, t = hour.tide;
  const moonState = hour.moon.up ? "above the horizon" : "below the horizon (do not draw it in the sky)";
  const tides = data.tides.events.map(e => `${e.type} ${e.localTime}`).join(", ") || "none identified";
  return `You are an illustrator painting one panel of a cheerful hand-painted "Beaufort Wind Force Scale" tea towel.
Paint the sea at ${loc.name}, ${loc.county}, UK, on ${data.date} at ${hour.localTime} (UK local time).
Scene: ${loc.scene}. The beach faces ${loc.facing}.

Forecast to depict faithfully:
- Wind: Beaufort force ${w.beaufort} "${w.beaufortName}", ${w.speedKmh} km/h gusting ${w.gustKmh} km/h, blowing FROM the ${w.compassFrom} (${w.directionFrom}°).
- Sea: significant wave height ${v.heightM} m, period ${v.periodS} s, swell from the ${v.compassFrom}. Calm glassy water at force 0-1, small ripples and sailing boats at 2-4, white horses at 5-6, heaped-up foaming swirls at 7-9, towering white curling breakers and spray at 10-12.
- Tide (hourly estimate): ${t.trend ?? "unknown"}, ${t.fraction == null ? "mid" : Math.round(t.fraction * 100) + "% of the way from low to high water"} — show ${t.fraction != null && t.fraction > 0.7 ? "only a narrow strip of sand" : t.fraction != null && t.fraction < 0.3 ? "a wide expanse of wet sand" : "a medium strip of sand"}. Today's turning points: ${tides}.
- Sky: cloud cover ${hour.cloudCover}%. Sun phase: ${hour.sun.phase} (sunrise ${data.sun.rise[0] ?? "-"}, sunset ${data.sun.set[0] ?? "-"}). ${hour.sun.phase === "night" ? "Night sky: deep indigo and violet with twinkling stars (fewer behind clouds)." : hour.sun.phase === "day" ? "Daylight: bright blues." : "Glowing pink, orange and violet twilight."}
- Moon: ${data.moon.phase}, ${Math.round(data.moon.illumination * 100)}% illuminated, ${moonState}. If shown, draw the correct phase shape (${data.moon.waxing ? "lit on the right" : "lit on the left"}) and its reflection on the water at night.

Composition (keep to this layout): sky from y=0 to the horizon at about y=470; sea from y=470 down to the shoreline; a sandy (or pebbly) beach in the foreground along the bottom whose depth follows the tide. Distant land, headlands, lighthouses and houses sit ON LAND at the horizon or on the beach, never floating on the water. Boats sit on the sea. Keep the bottom 70 px clear for a caption strip.

Style: bold, colourful, fun naive folk-art oil painting — saturated cobalt, turquoise, ultramarine and violet sea in horizontal painted bands, swirling spiral wave curls in white, little boats, cottages with glowing windows at night, visible brush-stroke texture (use SVG filters such as feTurbulence + feDisplacementMap). In the top-left corner paint a square tile coloured for the force (blue/green for light winds, amber for gales, orange-brown for storms) containing the large number ${w.beaufort}, with the words "${w.beaufortName}" and "${hour.localTime}" beside it. Along the bottom paint a dark caption strip with white text: "Wind ${Math.round(w.speedKmh)} km/h from ${w.compassFrom} · Waves ${v.heightM} m · Tide ${t.trend ?? "-"}".

Output requirements: reply with ONLY one standalone SVG document, starting with <svg and ending with </svg>, xmlns="http://www.w3.org/2000/svg", viewBox="0 0 1600 1000". Fill the whole canvas. Self-contained: no <script>, no event handlers, no <foreignObject>, no <image>, no external fonts, links or resources. No markdown fences or commentary.`;
}

async function askOllama(prompt) {
  const response = await fetch("https://ollama.com/api/chat", {
    method: "POST",
    headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ model: MODEL, stream: false, think: false, messages: [{ role: "user", content: prompt }] }),
    signal: AbortSignal.timeout(TIMEOUT_MS)
  });
  if (!response.ok) throw new Error(`Ollama HTTP ${response.status}: ${(await response.text()).slice(0, 200)}`);
  const json = await response.json();
  return json.message?.content ?? "";
}

// Extract the SVG and strip anything active or external.
export function sanitiseSvg(text) {
  const start = text.indexOf("<svg"), end = text.lastIndexOf("</svg>");
  if (start < 0 || end < start) throw new Error("no <svg> element in response");
  let svg = text.slice(start, end + 6)
    .replace(/<script[\s\S]*?<\/script\s*>/gi, "")
    .replace(/<foreignObject[\s\S]*?<\/foreignObject\s*>/gi, "")
    .replace(/<(image|use|a|iframe|audio|video)\b[^>]*?(\/>|>[\s\S]*?<\/\1\s*>)/gi, (m, tag) => tag === "use" && /href="#/.test(m) ? m : "")
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*')/gi, "")
    .replace(/(xlink:)?href\s*=\s*("(?!#)[^"]*"|'(?!#)[^']*')/gi, "")
    .replace(/@import[^;]*;/gi, "")
    .replace(/url\(\s*['"]?(?!#)[^)]*\)/gi, "none");
  if (!/viewBox=/.test(svg.slice(0, 400))) svg = svg.replace("<svg", '<svg viewBox="0 0 1600 1000"');
  if (!/xmlns=/.test(svg.slice(0, 400))) svg = svg.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
  const elements = (svg.match(/<[a-zA-Z]/g) ?? []).length;
  if (elements < 25) throw new Error(`SVG too simple (${elements} elements)`);
  return svg;
}

async function render(page, svg) {
  await page.setContent(`<!doctype html><html><body style="margin:0;background:#fff"><div id="art">${svg}</div>
<style>#art svg{display:block;width:1600px;height:1000px}</style></body></html>`, { waitUntil: "load" });
  const ok = await page.evaluate(() => {
    const el = document.querySelector("#art svg");
    if (!el || document.querySelector("parsererror")) return false;
    const box = el.getBBox();
    return box.width > 400 && box.height > 250;
  });
  if (!ok) throw new Error("SVG did not render");
  return page.screenshot({ type: "png", clip: { x: 0, y: 0, width: 1600, height: 1000 } });
}

async function pool(items, size, fn) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) await fn(items[next++]);
  }));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(API_KEY ? `Artwork: Ollama Cloud model ${MODEL} (concurrency ${CONCURRENCY}).` : "Artwork: OLLAMA_API_KEY not set — using the procedural painter.");
  const browser = await chromium.launch();
  const forecasts = [];
  for (const loc of locations) {
    try {
      forecasts.push(JSON.parse(await readFile(`${SITE}/data/${loc.slug}.json`, "utf8")));
    } catch {
      console.error(`No forecast for ${loc.name}; skipping artwork.`);
    }
  }
  const jobs = forecasts.flatMap(data => data.hours.map(hour => ({ data, hour })));
  const counts = { ollama: 0, procedural: 0, fallback: 0 };
  const pages = await Promise.all(Array.from({ length: Math.max(1, CONCURRENCY) }, () => browser.newPage({ viewport: { width: 1600, height: 1000 } })));
  const free = [...pages];

  await pool(jobs, Math.max(1, CONCURRENCY), async ({ data, hour }) => {
    const slug = data.location.slug;
    const name = String(hour.index).padStart(2, "0");
    const dir = `${SITE}/art/${slug}`;
    await mkdir(dir, { recursive: true });
    const prompt = buildPrompt(data, hour);
    const meta = { location: slug, date: data.date, localTime: hour.localTime, prompt, model: null, source: "procedural", generatedAt: null, errors: [] };
    const page = free.pop();
    let svg, png;
    try {
      if (API_KEY) {
        for (let attempt = 1; attempt <= 2 && !png; attempt++) {
          const started = new Date();
          try {
            const candidate = sanitiseSvg(await askOllama(prompt));
            png = await render(page, candidate);
            svg = candidate;
            Object.assign(meta, { model: MODEL, source: "ollama", generatedAt: new Date().toISOString(), requestedAt: started.toISOString() });
          } catch (error) {
            meta.errors.push(`attempt ${attempt}: ${error.message}`);
          }
        }
      }
      if (!png) {
        svg = renderScene(data, hour.index);
        png = await render(page, svg);
        Object.assign(meta, { model: "procedural painter (src/scene.mjs)", source: "procedural", generatedAt: new Date().toISOString() });
        counts[API_KEY ? "fallback" : "procedural"]++;
      } else counts.ollama++;
    } finally {
      free.push(page);
    }
    await writeFile(`${dir}/${name}.svg`, svg);
    await writeFile(`${dir}/${name}.png`, png);
    await writeFile(`${dir}/${name}.json`, JSON.stringify(meta, null, 2));
    hour.art = { png: `art/${slug}/${name}.png`, svg: `art/${slug}/${name}.svg`, meta: `art/${slug}/${name}.json`, source: meta.source, model: meta.model, generatedAt: meta.generatedAt };
    console.log(`${slug} ${hour.localTime}: ${meta.source}${meta.errors.length ? ` (${meta.errors.join("; ")})` : ""}`);
  });

  for (const data of forecasts) await writeFile(`${SITE}/data/${data.location.slug}.json`, JSON.stringify(data, null, 2));
  await browser.close();
  console.log(`Artwork complete: ${counts.ollama} from Ollama, ${counts.procedural} procedural, ${counts.fallback} procedural fallbacks.`);
}
