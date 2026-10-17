// Procedural painted-seascape renderer. Produces a self-contained 1600 × 1000 SVG for one
// beach and hour, in the style of a hand-painted Beaufort-scale tea towel: bold blues,
// swirling wave curls, little boats and houses, a numbered Beaufort tile and the moon.
// Used when Ollama Cloud is unavailable or returns unusable artwork.
import { BEAUFORT_COLOURS } from "./beaufort.mjs";

const W = 1600, H = 1000, HORIZON = 470;

function seeded(text) {
  let h = 1779033703 ^ text.length;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 3432918353), h = h << 13 | h >>> 19;
  let a = h >>> 0;
  return () => {
    a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const f1 = n => Math.round(n * 10) / 10;
const minutes = hhmm => hhmm ? Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5)) : null;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

function mix(a, b, t) {
  const p = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return "#" + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, "0")).join("");
}

const SKIES = {
  night: ["#0a0f3a", "#1d1f63", "#3a2f80"],
  dawn: ["#283a85", "#d9739a", "#ffc46b"],
  day: ["#1f8fe0", "#62c2f2", "#c9f0ff"],
  dusk: ["#1d2268", "#b8478f", "#ff9645"]
};
const SEAS = {
  night: ["#2a3a8f", "#16206a", "#0b1048"],
  dawn: ["#6a6fb8", "#2b4c9e", "#162a72"],
  day: ["#4fd0d8", "#1789c9", "#0b4a9a"],
  dusk: ["#7a5aa8", "#2c3f95", "#141f63"]
};

export function renderScene(data, hourIndex) {
  const hour = data.hours[hourIndex];
  const loc = data.location;
  const rnd = seeded(`${loc.slug}|${data.date}|${hour.localTime}`);
  const r = (lo, hi) => lo + rnd() * (hi - lo);
  const force = hour.wind.beaufort ?? 0;
  const cloud = (hour.cloudCover ?? 0) / 100;
  const waveH = hour.waves.heightM ?? 0.5;
  const period = hour.waves.periodS ?? 6;
  const phase = hour.sun.phase;
  const night = phase === "night";
  const storm = clamp((force - 5) / 6, 0, 1);
  // Wind blows towards dir + 180°. Positive drift means the wind pushes things to the right of the picture.
  const windFrom = hour.wind.directionFrom ?? 270;
  const drift = -Math.sin(windFrom * Math.PI / 180);
  const tideFrac = hour.tide.fraction ?? 0.5;
  const shoreY = 790 + tideFrac * 120;
  const out = [];
  const push = s => out.push(s);

  // Colour palette: storms and heavy cloud grey the sky; the sea darkens with wind.
  const grey = clamp(cloud * 0.45 + storm * 0.4, 0, 0.75);
  const sky = SKIES[phase].map(c => mix(c, night ? "#2b2b45" : "#7f8aa3", grey));
  const sea = SEAS[phase].map(c => mix(c, "#1a2a55", storm * 0.5));

  push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">`);
  push(`<title>${esc(loc.name)} at ${hour.localTime}: Beaufort ${force} ${esc(hour.wind.beaufortName ?? "")}</title>`);
  push(`<defs>
  <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sky[0]}"/><stop offset=".62" stop-color="${sky[1]}"/><stop offset="1" stop-color="${sky[2]}"/></linearGradient>
  <linearGradient id="sea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sea[0]}"/><stop offset=".45" stop-color="${sea[1]}"/><stop offset="1" stop-color="${sea[2]}"/></linearGradient>
  <radialGradient id="glow"><stop offset="0" stop-color="#fff8d0" stop-opacity=".9"/><stop offset=".35" stop-color="#ffe9a0" stop-opacity=".35"/><stop offset="1" stop-color="#ffe9a0" stop-opacity="0"/></radialGradient>
  <radialGradient id="sunglow"><stop offset="0" stop-color="#fff3b0" stop-opacity="1"/><stop offset=".3" stop-color="#ffcf4a" stop-opacity=".55"/><stop offset="1" stop-color="#ff9a3c" stop-opacity="0"/></radialGradient>
  <filter id="paint" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency="0.018" numOctaves="2" seed="${Math.floor(r(1, 99))}"/><feDisplacementMap in="SourceGraphic" scale="9"/></filter>
  <filter id="soft"><feGaussianBlur stdDeviation="6"/></filter>
  <filter id="canvas" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" seed="7" result="n"/><feColorMatrix in="n" type="matrix" values="0 0 0 0 0.5  0 0 0 0 0.45  0 0 0 0 0.4  0 0 0 .55 0"/></filter>
</defs>`);

  // Sky with oil-paint dabs.
  push(`<rect width="${W}" height="${HORIZON + 20}" fill="url(#sky)"/>`);
  push(`<g opacity=".22" filter="url(#paint)">`);
  for (let i = 0; i < 70; i++) {
    const y = r(10, HORIZON), x = r(-40, W);
    const c = mix(sky[0], sky[2], y / HORIZON + r(-.25, .25));
    push(`<path d="M${f1(x)} ${f1(y)} q${f1(r(40, 90))} ${f1(r(-8, 8))} ${f1(r(90, 200))} ${f1(r(-4, 4))}" stroke="${c}" stroke-width="${f1(r(8, 22))}" stroke-linecap="round" fill="none"/>`);
  }
  push(`</g>`);

  // Stars.
  if (phase !== "day") {
    const n = Math.round((night ? 90 : 25) * (1 - cloud * 0.85));
    push(`<g fill="#fff6c8">`);
    for (let i = 0; i < n; i++) {
      const x = r(0, W), y = r(0, HORIZON - 60), s = r(1.5, night ? 7 : 4);
      push(rnd() < .25
        ? `<path d="M${f1(x)} ${f1(y - s * 1.8)}Q${f1(x)} ${f1(y)} ${f1(x + s * 1.8)} ${f1(y)}Q${f1(x)} ${f1(y)} ${f1(x)} ${f1(y + s * 1.8)}Q${f1(x)} ${f1(y)} ${f1(x - s * 1.8)} ${f1(y)}Q${f1(x)} ${f1(y)} ${f1(x)} ${f1(y - s * 1.8)}Z" opacity="${f1(r(.6, 1))}"/>`
        : `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(s / 2.5)}" opacity="${f1(r(.4, 1))}"/>`);
    }
    push(`</g>`);
  }

  // Sun, following an arc from sunrise to sunset.
  const now = minutes(hour.localTime);
  let sunPos = null;
  const rise = minutes(data.sun.rise[0]), set = minutes(data.sun.set[0]);
  if (hour.sun.up || phase === "dawn" || phase === "dusk") {
    const f = rise != null && set != null ? clamp((now + 30 - rise) / (set - rise), 0.02, 0.98) : 0.5;
    sunPos = { x: 160 + f * 1280, y: HORIZON - 10 - Math.sin(Math.PI * f) * 330 };
    const sunVisible = 1 - cloud * 0.6;
    push(`<circle cx="${f1(sunPos.x)}" cy="${f1(sunPos.y)}" r="210" fill="url(#sunglow)" opacity="${f1(sunVisible)}"/>`);
    push(`<g opacity="${f1(sunVisible)}" stroke="#ffd34d" stroke-width="7" stroke-linecap="round" fill="none">`);
    for (let i = 0; i < 14; i++) {
      const a = i / 14 * Math.PI * 2, r1 = 72, r2 = 110 + (i % 2) * 22;
      const [cx, cy] = [sunPos.x, sunPos.y];
      push(`<path d="M${f1(cx + Math.cos(a) * r1)} ${f1(cy + Math.sin(a) * r1)} Q${f1(cx + Math.cos(a + .18) * (r1 + r2) / 2)} ${f1(cy + Math.sin(a + .18) * (r1 + r2) / 2)} ${f1(cx + Math.cos(a) * r2)} ${f1(cy + Math.sin(a) * r2)}"/>`);
    }
    push(`</g><circle cx="${f1(sunPos.x)}" cy="${f1(sunPos.y)}" r="58" fill="${phase === "day" ? "#ffd84a" : "#ff8a3c"}" stroke="#ffb02e" stroke-width="6" filter="url(#paint)" opacity="${f1(Math.max(.55, sunVisible))}"/>`);
  }

  // Moon with its true phase, when it is above the horizon.
  let moonPos = null;
  if (hour.moon.up) {
    const mr = minutes(data.moon.rise[0]), ms = minutes(data.moon.set[0]);
    let f = 0.5;
    if (mr != null && mr <= now) f = (now - mr) / 720;
    else if (ms != null && ms > now) f = 1 - (ms - now) / 720;
    f = clamp(f, 0.06, 0.94);
    moonPos = { x: 1460 - f * 1260, y: HORIZON - 40 - Math.sin(Math.PI * f) * 300 };
    if (sunPos && Math.abs(moonPos.x - sunPos.x) < 260) moonPos.x = clamp(moonPos.x + (moonPos.x > sunPos.x ? 280 : -280), 140, 1460);
    const R = 62, k = data.moon.illumination ?? 0.5;
    const { x, y } = moonPos;
    const rx = f1(Math.abs(1 - 2 * k) * R);
    const lit = `M${f1(x)} ${f1(y - R)} A${R} ${R} 0 0 1 ${f1(x)} ${f1(y + R)} A${rx} ${R} 0 0 ${k < 0.5 ? 0 : 1} ${f1(x)} ${f1(y - R)}Z`;
    const dayMoon = phase === "day";
    push(`<circle cx="${f1(x)}" cy="${f1(y)}" r="${R * 3}" fill="url(#glow)" opacity="${dayMoon ? .15 : f1(.35 + k * .5)}"/>`);
    push(`<circle cx="${f1(x)}" cy="${f1(y)}" r="${R}" fill="${dayMoon ? "#9fc4e8" : "#2c2a6e"}" opacity="${dayMoon ? .35 : .85}"/>`);
    push(`<g transform="${data.moon.waxing ? "" : `translate(${f1(2 * x)} 0) scale(-1 1)`}"><path d="${lit}" fill="${dayMoon ? "#f4f6ff" : "#fff3c4"}" stroke="#ffe48a" stroke-width="2"/></g>`);
    push(`<g fill="#e6d79a" opacity=".45"><circle cx="${f1(x - 18)}" cy="${f1(y - 12)}" r="9"/><circle cx="${f1(x + 16)}" cy="${f1(y + 20)}" r="12"/><circle cx="${f1(x + 22)}" cy="${f1(y - 24)}" r="6"/></g>`);
  }

  // Clouds: more and darker with cover and storminess, stretched by the wind.
  const nClouds = Math.round(cloud * 10) + (cloud > 0.05 ? 1 : 0);
  if (cloud > 0.85) push(`<rect y="0" width="${W}" height="${f1(150 + cloud * 120)}" fill="${night ? "#2a2a52" : mix("#c9d3e6", "#5e6880", storm)}" opacity=".7" filter="url(#paint)"/>`);
  for (let i = 0; i < nClouds; i++) {
    const cx = r(-60, W + 60), cy = r(50, HORIZON - 120), s = r(.7, 1.5) * (1 + cloud * .4);
    const base = night ? mix("#3d3b78", "#26264a", storm) : mix(phase === "day" ? "#ffffff" : "#ffd9e6", "#6c7591", storm * .9 + cloud * .2);
    const shade = mix(base, night ? "#151538" : "#8a93b5", .45);
    const stretch = 1 + Math.abs(drift) * force * 0.05;
    push(`<g transform="translate(${f1(cx)} ${f1(cy)}) scale(${f1(s * stretch)} ${f1(s)})" filter="url(#paint)">`);
    push(`<ellipse cx="0" cy="24" rx="150" ry="34" fill="${shade}"/>`);
    for (let j = 0; j < 6; j++) push(`<circle cx="${f1(-110 + j * 44 + r(-10, 10))}" cy="${f1(r(-22, 8))}" r="${f1(r(32, 58))}" fill="${base}"/>`);
    push(`<path d="M-120 30 Q0 50 130 28" stroke="${shade}" stroke-width="8" fill="none" opacity=".6"/></g>`);
  }

  // Wind streaks.
  if (force >= 2) {
    push(`<g stroke="${night ? "#c9c6ff" : "#ffffff"}" stroke-linecap="round" fill="none" opacity="${f1(.35 + storm * .4)}">`);
    for (let i = 0; i < force * 2; i++) {
      const x = r(0, W), y = r(40, HORIZON - 40), len = 60 + force * 14;
      const dx = drift >= 0 ? len : -len;
      push(`<path d="M${f1(x)} ${f1(y)} q${f1(dx / 2)} ${f1(r(-14, 14))} ${f1(dx)} 0 ${drift >= 0 ? "q20 -6 14 -20" : "q-20 -6 -14 -20"}" stroke-width="${f1(r(3, 6))}"/>`);
    }
    push(`</g>`);
  }

  // Distant land on the horizon for each beach.
  push(landscape(loc.slug, { r, night, phase, storm, rnd }));

  // The sea.
  push(`<rect y="${HORIZON}" width="${W}" height="${H - HORIZON}" fill="url(#sea)"/>`);
  // Light path on the water from the sun or moon.
  const light = sunPos && phase !== "day" ? { ...sunPos, c: "#ffb35c" } : moonPos && night ? { ...moonPos, c: "#fff1b0" } : sunPos ? { ...sunPos, c: "#fff6c0" } : null;
  if (light) {
    push(`<g stroke="${light.c}" stroke-linecap="round" opacity="${night ? .75 : .55}">`);
    for (let i = 0; i < 26; i++) {
      const t = i / 26, y = HORIZON + 12 + t * (shoreY - HORIZON - 30), w = 14 + t * 120;
      const x = light.x + r(-w, w) * .6;
      push(`<line x1="${f1(x - w / 2)}" y1="${f1(y)}" x2="${f1(x + w / 2)}" y2="${f1(y)}" stroke-width="${f1(2 + t * 6)}"/>`);
    }
    push(`</g>`);
  }

  // Wave rows, back to front.
  const rows = 11;
  const amp = clamp(0.35 + waveH * 0.55 + force * 0.07, 0.3, 4.2);
  const lenScale = 0.6 + clamp(period, 2, 18) / 11;
  const foam = night ? "#cfd6ff" : "#ffffff";
  const curls = [];
  for (let i = 0; i < rows; i++) {
    const t = i / (rows - 1);
    const y0 = HORIZON + 6 + (shoreY - HORIZON - 20) * Math.pow(t, 1.45);
    const a = (2.5 + 26 * t) * amp;
    const lambda = (50 + 300 * t) * lenScale;
    let x = -r(0, lambda), d = `M-80 ${H} L${f1(x)} ${f1(y0)}`;
    const crestPts = [];
    while (x < W + lambda) {
      const ca = a * r(.6, 1.15);
      d += ` Q${f1(x + lambda * .25)} ${f1(y0 - ca)} ${f1(x + lambda * .5)} ${f1(y0)} Q${f1(x + lambda * .75)} ${f1(y0 + ca * .25)} ${f1(x + lambda)} ${f1(y0)}`;
      crestPts.push({ x: x + lambda * .25, y: y0 - ca * .5, a: ca });
      x += lambda;
    }
    d += ` L${W + 80} ${H}Z`;
    const band = i % 2 ? mix(sea[1], night ? "#3a3aa0" : "#2ec4c4", .35) : sea[1];
    const fill = mix(band, sea[2], t * .7 + r(-.08, .08));
    push(`<path d="${d}" fill="${fill}" stroke="${mix(fill, foam, .45)}" stroke-width="${f1(1.5 + t * 3)}" filter="url(#paint)"/>`);
    // Brushy highlights and whitecaps.
    push(`<g stroke="${foam}" stroke-linecap="round" fill="none">`);
    for (const c of crestPts) {
      if (rnd() < 0.35 + force * 0.05) push(`<path d="M${f1(c.x - c.a * .8 - 6)} ${f1(c.y + 4)} q${f1(c.a * .5 + 4)} ${f1(-c.a * .35 - 3)} ${f1(c.a + 10)} 0" stroke-width="${f1(1 + t * 3.5)}" opacity="${f1(.35 + force * .05)}"/>`);
      if (force >= 4 && rnd() < (force - 3) * 0.12) curls.push({ ...c, t });
    }
    push(`</g>`);
  }

  // Tea-towel swirls: curling crests that multiply with the wind.
  if (curls.length) {
    push(`<g stroke="${foam}" fill="none" stroke-linecap="round">`);
    for (const c of curls) {
      const R = (8 + c.t * 34) * (0.6 + storm * 0.9) * r(.8, 1.2);
      const dir = drift >= 0 ? 1 : -1;
      let p = "";
      for (let k = 0; k <= 28; k++) {
        const th = k / 28 * Math.PI * 2.6, rad = R * (1 - k / 34);
        const px = c.x + dir * Math.cos(th + Math.PI) * rad, py = c.y - R * .3 + Math.sin(th + Math.PI) * rad;
        p += `${k ? "L" : "M"}${f1(px)} ${f1(py)}`;
      }
      push(`<path d="${p}" stroke-width="${f1(2 + c.t * 5)}"/>`);
      if (force >= 7) for (let s = 0; s < 6; s++) push(`<circle cx="${f1(c.x + dir * r(R * .5, R * 2))}" cy="${f1(c.y - r(R * .5, R * 1.6))}" r="${f1(r(1.5, 4))}" fill="${foam}" stroke="none"/>`);
    }
    push(`</g>`);
  }

  // Boats and surfers depend on the wind.
  push(boats({ force, drift, r, rnd, night, slug: loc.slug, waveH, phase, shoreY }));

  // Gulls by day in light to fresh winds.
  if (!night && force >= 1 && force <= 6) {
    push(`<g stroke="${phase === "day" ? "#1d2a55" : "#2a1d45"}" stroke-width="4" fill="none" stroke-linecap="round">`);
    for (let i = 0; i < 2 + Math.floor(r(0, 4)); i++) {
      const x = r(200, 1400), y = r(160, 420), s = r(.7, 1.3);
      push(`<path d="M${f1(x - 18 * s)} ${f1(y)} q${f1(9 * s)} ${f1(-12 * s)} ${f1(18 * s)} 0 q${f1(9 * s)} ${f1(-12 * s)} ${f1(18 * s)} 0"/>`);
    }
    push(`</g>`);
  }

  // Beach in the foreground; the tide sets how much sand shows.
  push(beach(loc.slug, { shoreY, r, rnd, night, phase, foam, force }));
  push(windFlag({ force, drift, night, shoreY }));

  // Canvas texture over everything.
  push(`<rect width="${W}" height="${H}" filter="url(#canvas)" opacity=".16" style="mix-blend-mode:multiply"/>`);

  // Painted Beaufort tile and label, echoing the tea towel.
  push(label({ data, hour, force, night }));
  push(`</svg>`);
  return out.join("\n");
}

function landscape(slug, { r, night, phase, storm }) {
  const g = [];
  const hill = night ? "#1f3b5a" : mix(phase === "day" ? "#3f9c5a" : "#5a6f7a", "#4a5a66", storm * .5);
  const farHill = night ? "#26305e" : mix(phase === "day" ? "#79b7a8" : "#8a7fa0", "#7d8796", storm * .5);
  const lit = night || phase === "dusk";
  const houses = (x0, y0, n, scale, palette) => {
    const s = [];
    for (let i = 0; i < n; i++) {
      const w = 40 * scale, h = r(36, 54) * scale, x = x0 + i * (w + 4 * scale), y = y0 - h;
      const c = palette[i % palette.length];
      s.push(`<rect x="${f1(x)}" y="${f1(y)}" width="${f1(w)}" height="${f1(h)}" fill="${night ? mix(c, "#1a1840", .55) : c}" stroke="#1d2550" stroke-width="2"/>`);
      s.push(`<path d="M${f1(x - 3)} ${f1(y)} L${f1(x + w / 2)} ${f1(y - 18 * scale)} L${f1(x + w + 3)} ${f1(y)}Z" fill="${night ? "#2a2550" : "#3b4a7a"}"/>`);
      for (const wx of [.22, .6]) s.push(`<rect x="${f1(x + w * wx)}" y="${f1(y + h * .3)}" width="${f1(w * .2)}" height="${f1(h * .25)}" fill="${lit && r(0, 1) < .8 ? "#ffd65a" : "#20305e"}"/>`);
    }
    return s.join("");
  };
  g.push(`<g filter="url(#paint)">`);
  if (slug === "gwithian") {
    // St Ives on the far left, Godrevy Island and lighthouse on the right.
    g.push(`<path d="M-20 ${HORIZON} Q120 ${HORIZON - 70} 300 ${HORIZON - 40} Q380 ${HORIZON - 30} 430 ${HORIZON}Z" fill="${farHill}"/>`);
    g.push(houses(60, HORIZON - 22, 6, .45, ["#f4efe2", "#cfe8f4", "#ffe6a8"]));
    g.push(`<path d="M1060 ${HORIZON + 4} Q1120 ${HORIZON - 55} 1240 ${HORIZON - 62} Q1340 ${HORIZON - 58} 1400 ${HORIZON + 4}Z" fill="${night ? "#1a2448" : "#3a3f52"}"/>`);
    g.push(`<path d="M1060 ${HORIZON - 8} Q1150 ${HORIZON - 64} 1240 ${HORIZON - 68} Q1330 ${HORIZON - 64} 1398 ${HORIZON - 8}" stroke="${night ? "#2f4a4a" : "#6a9a4a"}" stroke-width="10" fill="none"/>`);
    g.push(`<path d="M1222 ${HORIZON - 62} L1228 ${HORIZON - 170} L1252 ${HORIZON - 170} L1258 ${HORIZON - 62}Z" fill="#fbfbf5" stroke="#1d2550" stroke-width="3"/>`);
    g.push(`<rect x="1224" y="${HORIZON - 192}" width="32" height="24" fill="${night ? "#ffe066" : "#d8eef5"}" stroke="#1d2550" stroke-width="3"/><path d="M1220 ${HORIZON - 192} L1240 ${HORIZON - 212} L1260 ${HORIZON - 192}Z" fill="#c8312b"/>`);
    g.push(`<rect x="1272" y="${HORIZON - 100}" width="60" height="38" fill="#fbfbf5" stroke="#1d2550" stroke-width="3"/>`);
  } else if (slug === "maenporth") {
    g.push(`<path d="M-20 ${HORIZON + 10} Q60 ${HORIZON - 160} 260 ${HORIZON - 150} Q420 ${HORIZON - 120} 520 ${HORIZON + 10}Z" fill="${hill}"/>`);
    for (let i = 0; i < 14; i++) g.push(`<circle cx="${f1(r(10, 470))}" cy="${f1(r(HORIZON - 140, HORIZON - 40))}" r="${f1(r(18, 34))}" fill="${mix(hill, night ? "#0d1a33" : "#1f5a35", r(.2, .6))}"/>`);
    g.push(houses(150, HORIZON - 30, 4, .6, ["#ffffff", "#f5e7c9", "#d7ecf7", "#ffd0c0"]));
    g.push(`<path d="M1180 ${HORIZON + 10} Q1300 ${HORIZON - 130} 1460 ${HORIZON - 120} Q1580 ${HORIZON - 110} 1640 ${HORIZON - 60} L1640 ${HORIZON + 10}Z" fill="${hill}"/>`);
    for (let i = 0; i < 10; i++) g.push(`<circle cx="${f1(r(1230, 1600))}" cy="${f1(r(HORIZON - 120, HORIZON - 30))}" r="${f1(r(16, 30))}" fill="${mix(hill, night ? "#0d1a33" : "#1f5a35", r(.2, .6))}"/>`);
    g.push(`<path d="M600 ${HORIZON} Q760 ${HORIZON - 26} 960 ${HORIZON - 14} Q1060 ${HORIZON - 8} 1120 ${HORIZON}Z" fill="${farHill}" opacity=".8"/>`);
  } else if (slug === "sidmouth") {
    const cliff = night ? "#5a2a4a" : mix("#c4502e", "#7d4a42", storm * .5);
    const cliffDark = night ? "#3a1a3a" : "#8c3020";
    g.push(`<path d="M-20 ${HORIZON + 10} L-20 ${HORIZON - 230} Q80 ${HORIZON - 250} 190 ${HORIZON - 215} L250 ${HORIZON - 60} L300 ${HORIZON + 10}Z" fill="${cliff}"/>`);
    for (let i = 0; i < 6; i++) g.push(`<path d="M-20 ${HORIZON - 200 + i * 34} Q100 ${HORIZON - 210 + i * 34} ${200 + i * 12} ${HORIZON - 190 + i * 38}" stroke="${cliffDark}" stroke-width="5" fill="none" opacity=".6"/>`);
    g.push(`<path d="M-20 ${HORIZON - 228} Q80 ${HORIZON - 252} 190 ${HORIZON - 214}" stroke="${night ? "#1f3b3a" : "#5aa04a"}" stroke-width="16" fill="none"/>`);
    g.push(`<path d="M1300 ${HORIZON + 10} L1360 ${HORIZON - 150} Q1470 ${HORIZON - 190} 1640 ${HORIZON - 180} L1640 ${HORIZON + 10}Z" fill="${cliff}"/>`);
    g.push(`<path d="M1360 ${HORIZON - 152} Q1470 ${HORIZON - 194} 1640 ${HORIZON - 184}" stroke="${night ? "#1f3b3a" : "#5aa04a"}" stroke-width="14" fill="none"/>`);
    g.push(`<path d="M1450 ${HORIZON + 10} L1470 ${HORIZON - 70} L1500 ${HORIZON - 80} L1510 ${HORIZON + 10}Z" fill="${cliffDark}"/>`);
    g.push(`<path d="M300 ${HORIZON} Q700 ${HORIZON - 30} 1300 ${HORIZON}Z" fill="${farHill}" opacity=".7"/>`);
  } else {
    // Woolacombe: dunes on the left, Morte Point reaching out on the right.
    g.push(`<path d="M-20 ${HORIZON + 10} Q100 ${HORIZON - 90} 260 ${HORIZON - 70} Q380 ${HORIZON - 50} 460 ${HORIZON + 10}Z" fill="${farHill}"/>`);
    g.push(`<path d="M980 ${HORIZON + 6} Q1120 ${HORIZON - 30} 1260 ${HORIZON - 90} Q1420 ${HORIZON - 160} 1640 ${HORIZON - 170} L1640 ${HORIZON + 6}Z" fill="${hill}"/>`);
    for (let i = 0; i < 9; i++) {
      const x = 1000 + i * 70;
      g.push(`<path d="M${x} ${HORIZON + 6} l${f1(r(10, 25))} ${f1(-r(14, 40) - i * 6)} l${f1(r(15, 30))} ${f1(r(5, 20))} l10 ${f1(r(14, 50))}Z" fill="${night ? "#1a2040" : "#4a4f63"}"/>`);
    }
    g.push(houses(1420, HORIZON - 150, 3, .5, ["#ffffff", "#f6e3b4", "#e0f0fa"]));
  }
  g.push(`</g>`);
  return g.join("\n");
}

function boats({ force, drift, r, night, slug, waveH, phase, shoreY }) {
  const g = [];
  const lean = clamp(drift * force * 3.2, -24, 24);
  const hull = night ? "#c84a3a" : "#e2533c";
  const sail = night ? "#e6e2ff" : "#ffffff";
  const sailboat = (x, y, s) => g.push(`<g transform="translate(${f1(x)} ${f1(y)}) scale(${f1(s)}) rotate(${f1(lean + r(-4, 4))})">
    <path d="M-50 0 L50 0 L36 22 L-36 22Z" fill="${hull}" stroke="#1d2550" stroke-width="4"/>
    <line x1="0" y1="0" x2="0" y2="-120" stroke="#3b2a20" stroke-width="5"/>
    <path d="M4 -116 Q${lean > 0 ? 60 : 50} -60 54 -6 L4 -6Z" fill="${sail}" stroke="#1d2550" stroke-width="3"/>
    <path d="M-4 -100 Q-34 -50 -40 -8 L-4 -8Z" fill="${night ? "#c9c3f0" : "#ffd84a"}" stroke="#1d2550" stroke-width="3"/>
    ${night ? `<circle cx="0" cy="-124" r="5" fill="#ffe066"/>` : ""}</g>`);
  const fishing = (x, y, s, tilt) => g.push(`<g transform="translate(${f1(x)} ${f1(y)}) scale(${f1(s)}) rotate(${f1(tilt)})">
    <path d="M-70 -6 L70 -6 Q60 26 -56 26Z" fill="${night ? "#2f6bb0" : "#3d8ee0"}" stroke="#1d2550" stroke-width="4"/>
    <rect x="-20" y="-44" width="40" height="38" fill="${night ? "#f4e6c8" : "#ffffff"}" stroke="#1d2550" stroke-width="4"/>
    <rect x="-12" y="-36" width="12" height="12" fill="${night ? "#ffd65a" : "#8fd3f4"}"/>
    <line x1="34" y1="-6" x2="34" y2="-70" stroke="#3b2a20" stroke-width="4"/>
    <path d="M34 -70 L60 -60 L34 -50Z" fill="#e2533c"/></g>`);
  if (force <= 1) {
    fishing(r(350, 650), HORIZON + 90, .8, 0);
    fishing(r(900, 1200), HORIZON + 150, 1, r(-2, 2));
  } else if (force <= 5) {
    const n = force <= 3 ? 3 : 2;
    for (let i = 0; i < n; i++) sailboat(r(200 + i * 330, 400 + i * 330), HORIZON + 40 + i * 50 + r(0, 30), .55 + i * .2);
    if (force <= 4) fishing(r(1300, 1460), HORIZON + 190, .9, r(-6, 6));
  } else if (force <= 9) {
    fishing(r(500, 1100), HORIZON + 120, 1, clamp(-lean * 1.4, -28, 28) + r(-6, 6));
  }
  // Surfers on the bigger surf beaches.
  if ((slug === "woolacombe" || slug === "gwithian") && waveH >= 0.5 && force <= 5 && phase !== "night") {
    for (let i = 0; i < 3; i++) {
      const x = r(300, 1300), y = shoreY - r(40, 120);
      g.push(`<g transform="translate(${f1(x)} ${f1(y)}) rotate(${f1(r(-12, 12))})"><ellipse cx="0" cy="0" rx="34" ry="6" fill="${["#ffd84a", "#ff6b6b", "#7ce0c3"][i]}" stroke="#1d2550" stroke-width="3"/><path d="M-2 -4 L-6 -30 M-6 -30 L-22 -20 M-6 -30 L10 -24 M-2 -4 L8 -2" stroke="#1d2550" stroke-width="5" stroke-linecap="round"/><circle cx="-7" cy="-38" r="7" fill="#1d2550"/></g>`);
    }
  }
  return `<g>${g.join("\n")}</g>`;
}

function beach(slug, { shoreY, r, rnd, night, phase, foam, force }) {
  const g = [];
  const sand = slug === "sidmouth" ? (night ? "#5a5070" : "#b9a58e") : (night ? "#6a5a7a" : phase === "day" ? "#f1cf7a" : "#e0a874");
  let edge = `M-20 ${H + 20} L-20 ${f1(shoreY)}`;
  for (let x = -20; x <= W + 40; x += 80) edge += ` Q${x + 40} ${f1(shoreY + r(-12, 12))} ${x + 80} ${f1(shoreY + r(-4, 4))}`;
  edge += ` L${W + 20} ${H + 20}Z`;
  g.push(`<path d="${edge}" fill="${sand}" filter="url(#paint)"/>`);
  // Wet sand and foam line.
  g.push(`<path d="${edge}" fill="none" stroke="${mix(sand, "#5a6a9a", .35)}" stroke-width="22" opacity=".5"/>`);
  let foamLine = `M-20 ${f1(shoreY - 4)}`;
  for (let x = -20; x <= W + 40; x += 40) foamLine += ` q20 ${f1(-r(4, 10 + force))} 40 0`;
  g.push(`<path d="${foamLine}" stroke="${foam}" stroke-width="${4 + force * .6}" fill="none" stroke-linecap="round" opacity=".9"/>`);
  // Texture: pebbles or sand flecks.
  g.push(`<g>`);
  for (let i = 0; i < (slug === "sidmouth" ? 160 : 120); i++) {
    const x = r(0, W), y = r(shoreY + 20, H);
    g.push(slug === "sidmouth"
      ? `<ellipse cx="${f1(x)}" cy="${f1(y)}" rx="${f1(r(4, 10))}" ry="${f1(r(3, 6))}" fill="${mix(sand, rnd() < .5 ? "#6a5a50" : "#f4e8d8", r(.2, .6))}"/>`
      : `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(r(1, 3))}" fill="${mix(sand, "#8a6a3a", r(.2, .5))}" opacity=".7"/>`);
  }
  g.push(`</g>`);
  if (slug === "gwithian" || slug === "woolacombe") {
    // Marram grass on a dune in the corner.
    g.push(`<path d="M-20 ${H} L-20 ${H - 120} Q120 ${H - 170} 300 ${H - 90} Q360 ${H - 50} 380 ${H}Z" fill="${mix(sand, "#c8a050", .3)}" filter="url(#paint)"/>`);
    g.push(`<g stroke="${night ? "#3a6a5a" : "#5f9a3a"}" stroke-width="4" fill="none" stroke-linecap="round">`);
    for (let i = 0; i < 38; i++) {
      const x = r(0, 320), y = H - 100 + x * 0.12 + r(-20, 30);
      g.push(`<path d="M${f1(x)} ${f1(y + 40)} q${f1(r(-6, 6) + force * 2)} -30 ${f1(r(-14, 14) + force * 3)} ${f1(-r(40, 80))}"/>`);
    }
    g.push(`</g>`);
  } else if (slug === "maenporth") {
    for (let i = 0; i < 5; i++) {
      const x = r(1250, 1580), y = r(shoreY + 10, H - 20), s = r(30, 70);
      g.push(`<path d="M${f1(x - s)} ${f1(y + s * .4)} Q${f1(x - s * .7)} ${f1(y - s * .5)} ${f1(x)} ${f1(y - s * .6)} Q${f1(x + s * .8)} ${f1(y - s * .4)} ${f1(x + s)} ${f1(y + s * .4)}Z" fill="${night ? "#2a2a48" : "#5a5a6a"}" stroke="#1d2550" stroke-width="3" filter="url(#paint)"/>`);
    }
  } else {
    // Sidmouth: a row of colourful beach huts on the promenade.
    const colours = ["#ff6b6b", "#ffd84a", "#7ce0c3", "#8fd3f4", "#f49ac2", "#ffffff"];
    for (let i = 0; i < 6; i++) {
      const x = 1180 + i * 62, y = H - 30;
      g.push(`<g filter="url(#paint)"><rect x="${x}" y="${y - 80}" width="54" height="80" fill="${night ? mix(colours[i], "#1a1840", .5) : colours[i]}" stroke="#1d2550" stroke-width="3"/><path d="M${x - 4} ${y - 80} L${x + 27} ${y - 108} L${x + 58} ${y - 80}Z" fill="#3b4a7a"/><rect x="${x + 18}" y="${y - 50}" width="18" height="50" fill="#1d2550" opacity=".5"/></g>`);
    }
  }
  return g.join("\n");
}

function windFlag({ force, drift, night, shoreY }) {
  // A windsock-style pennant whose length and angle follow the wind.
  const x = 1440, base = H - 70, top = base - 190;
  const dir = drift >= 0 ? 1 : -1;
  const len = 40 + force * 14;
  const droop = clamp(70 - force * 9, 0, 70);
  const wobble = force >= 6 ? 14 : 6;
  return `<g filter="url(#paint)">
  <line x1="${x}" y1="${base}" x2="${x}" y2="${top}" stroke="${night ? "#d8d4ff" : "#3b2a20"}" stroke-width="7"/>
  <path d="M${x} ${top} q${f1(dir * len / 2)} ${f1(droop / 2 - wobble)} ${f1(dir * len)} ${f1(droop)} l${f1(-dir * 6)} 30 q${f1(-dir * len / 2)} ${f1(-droop / 2 + wobble)} ${f1(-dir * (len - 6))} ${f1(-droop + 10)}Z" fill="#e2533c" stroke="#1d2550" stroke-width="3"/>
  <path d="M${f1(x + dir * len * .35)} ${f1(top + droop * .35 - 2)} l0 30" stroke="#ffffff" stroke-width="8"/>
  <circle cx="${x}" cy="${top - 6}" r="8" fill="#ffd84a" stroke="#1d2550" stroke-width="3"/></g>`;
}

function label({ data, hour, force, night }) {
  const c = BEAUFORT_COLOURS[force] ?? BEAUFORT_COLOURS[0];
  const name = hour.wind.beaufortName ?? "";
  const w = hour.wind, v = hour.waves, t = hour.tide;
  const k = data.moon.illumination ?? 0.5;
  const R = 22, mx = 566, my = 146;
  const rx = f1(Math.abs(1 - 2 * k) * R);
  const lit = `M${mx} ${my - R} A${R} ${R} 0 0 1 ${mx} ${my + R} A${rx} ${R} 0 0 ${k < 0.5 ? 0 : 1} ${mx} ${my - R}Z`;
  const caption = [
    w.speedKmh != null ? `Wind ${Math.round(w.speedKmh)} km/h from ${w.compassFrom} (gusts ${Math.round(w.gustKmh ?? w.speedKmh)})` : null,
    v.heightM != null ? `Waves ${v.heightM.toFixed(1)} m · ${Math.round(v.periodS ?? 0)} s from ${v.compassFrom}` : null,
    t.trend ? `Tide ${t.trend}` : null,
    hour.cloudCover != null ? `Cloud ${Math.round(hour.cloudCover)}%` : null
  ].filter(Boolean).join("   ·   ");
  return `<g font-family="'Trebuchet MS', 'DejaVu Sans', sans-serif">
  <g filter="url(#paint)">
    <rect x="34" y="34" width="600" height="196" rx="10" fill="#fffdf4" stroke="#1d2550" stroke-width="5" opacity=".95"/>
    <rect x="52" y="52" width="160" height="160" rx="8" fill="${c}" stroke="#1d2550" stroke-width="5"/>
    <rect x="66" y="66" width="132" height="132" rx="4" fill="none" stroke="#ffffff" stroke-width="5" opacity=".75"/>
  </g>
  <text x="132" y="${force >= 10 ? 162 : 170}" text-anchor="middle" font-size="${force >= 10 ? 84 : 104}" font-weight="700" fill="#ffffff" stroke="#1d2550" stroke-width="3" paint-order="stroke">${force}</text>
  <text x="232" y="${name.length > 12 ? 102 : 112}" font-size="${name.length > 12 ? 34 : 42}" font-weight="700" fill="#1d2550">${esc(name)}</text>
  <text x="232" y="156" font-size="30" fill="#1d2550">${esc(hour.localTime)}</text>
  <text x="232" y="196" font-size="24" fill="#3b4a7a">${esc(data.location.name)}</text>
  <circle cx="${mx}" cy="${my}" r="${R}" fill="#2c2a6e"/>
  <g transform="${data.moon.waxing ? "" : `translate(${2 * mx} 0) scale(-1 1)`}"><path d="${lit}" fill="#fff3c4"/></g>
  <circle cx="${mx}" cy="${my}" r="${R}" fill="none" stroke="#1d2550" stroke-width="3"/>
  <text x="${mx}" y="${my + 46}" text-anchor="middle" font-size="16" fill="#3b4a7a">${Math.round(k * 100)}%</text>
  <g filter="url(#paint)"><rect x="0" y="${H - 64}" width="${W}" height="64" fill="${night ? "#141a4a" : "#1d2550"}" opacity=".88"/></g>
  <text x="${W / 2}" y="${H - 24}" text-anchor="middle" font-size="27" fill="#ffffff">${esc(caption)}</text>
</g>`;
}
