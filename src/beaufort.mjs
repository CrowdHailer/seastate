// Beaufort wind force scale (upper bound of each force in km/h) and helpers.
export const BEAUFORT = [
  { force: 0, name: "Calm", max: 1 },
  { force: 1, name: "Light air", max: 5 },
  { force: 2, name: "Light breeze", max: 11 },
  { force: 3, name: "Gentle breeze", max: 19 },
  { force: 4, name: "Moderate breeze", max: 28 },
  { force: 5, name: "Fresh breeze", max: 38 },
  { force: 6, name: "Strong breeze", max: 49 },
  { force: 7, name: "Near gale", max: 61 },
  { force: 8, name: "Gale", max: 74 },
  { force: 9, name: "Strong gale", max: 88 },
  { force: 10, name: "Storm", max: 102 },
  { force: 11, name: "Violent storm", max: 117 },
  { force: 12, name: "Hurricane", max: Infinity }
];

// Tile colours from the classic painted Beaufort tea towel: blues and greens to amber, orange and brown.
export const BEAUFORT_COLOURS = [
  "#8fd3f4", "#3fa9e0", "#5cc6b4", "#2bb3a3", "#2e8b57", "#3fae6a",
  "#6b8e23", "#f2b632", "#e8a317", "#e07b1a", "#d4521c", "#a8461f", "#7a3b1d"
];

export function beaufort(kmh) {
  return BEAUFORT.find(b => kmh < b.max) ?? BEAUFORT.at(-1);
}

const POINTS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
export function compass(degrees) {
  return POINTS[Math.round(((degrees % 360) + 360) % 360 / 22.5) % 16];
}
