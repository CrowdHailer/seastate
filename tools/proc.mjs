import { readFile, writeFile } from "node:fs/promises";
import { renderScene } from "../src/scene.mjs";
const [file, idx, out, force] = process.argv.slice(2);
const d = JSON.parse(await readFile(file, "utf8"));
if (force) { const h = d.hours[+idx]; h.wind.beaufort = +force; h.wind.beaufortName = ["Calm","Light air","Light breeze","Gentle breeze","Moderate breeze","Fresh breeze","Strong breeze","Near gale","Gale","Strong gale","Storm","Violent storm","Hurricane"][+force]; h.wind.speedKmh = force*9; h.waves.heightM = force*0.6; h.cloudCover = 90; }
await writeFile(out, renderScene(d, +idx));
