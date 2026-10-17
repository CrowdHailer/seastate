# seastate
The state of the sea, painted every hour.

A daily GitHub Actions job fetches the forecast for four beaches (Gwithian, Maenporth,
Sidmouth and Woolacombe), paints four pictures a day (morning 08:00, noon 12:00, afternoon 15:00, night 22:00) in the style of a hand-painted
Beaufort-scale tea towel, and publishes them to GitHub Pages. The page opens on the
picture for the current UK time; use the arrows or the four time buttons to scroll through
the day, and the drop-down to change beach.

## Pipeline

1. `fetch-data.mjs`: Open-Meteo weather and marine forecasts plus USNO sun and moon data
   for each location in `locations.json`, written to `_site/data/<beach>.json`. Tides are
   hourly estimates from modelled sea level, not official tide tables.
2. `build-art.mjs`: for each of the four times, asks Ollama Cloud (`kimi-k2.6`) for a standalone SVG,
   sanitises it, overlays a readable Beaufort tile and data caption, and renders it to PNG in Chromium. The prompt, model and timestamp are kept
   next to each image. If `OLLAMA_API_KEY` is not set, or a response is unusable, the
   procedural painter in `src/scene.mjs` paints that hour instead.
3. `.github/workflows/static.yml` runs both daily at 00:17 UTC, on push to `main`, or on
   demand, and deploys `_site` to Pages.

## Setup

Add the Ollama key as a repository secret named `OLLAMA_API_KEY`
(Settings → Secrets and variables → Actions). Never commit it.

## Local run

```sh
npm ci
node fetch-data.mjs
OLLAMA_API_KEY=... node build-art.mjs   # omit the key for the procedural painter
cp index.html _site/ && npx http-server _site
node tools/ui-check.mjs http://localhost:8080/ out/   # UI checks plus a walkthrough video
```
