// Drive the site in Chromium, record a video and assert the UI works.
// Usage: node tools/ui-check.mjs <url> <out-dir>
import { chromium } from "playwright";
import { mkdir, readdir, rename } from "node:fs/promises";
const [url, out] = process.argv.slice(2);
await mkdir(out, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, recordVideo: { dir: out, size: { width: 1280, height: 900 } } });
const page = await context.newPage();
const errors = [];
page.on("pageerror", e => errors.push(e.message));
page.on("response", r => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
const check = (cond, msg) => { console.log(`${cond ? "PASS" : "FAIL"} ${msg}`); if (!cond) process.exitCode = 1; };
const imgOk = () => page.$eval("#art", i => i.complete && i.naturalWidth === 1600 && i.naturalHeight === 1000);
const pause = ms => page.waitForTimeout(ms);

await page.goto(url, { waitUntil: "networkidle" });
await page.waitForFunction(() => document.querySelector("#art").complete && document.querySelector("#art").naturalWidth > 0);
await pause(1500);
const options = await page.$$eval("#beach option", os => os.map(o => o.value));
check(options.length === 4, `beach dropdown has 4 beaches (${options.join(", ")})`);
const londonHour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "2-digit", hourCycle: "h23" }).format(new Date()));
const expected = londonHour >= 5 && londonHour < 11 ? "Morning" : londonHour >= 11 && londonHour < 14 ? "Noon" : londonHour >= 14 && londonHour < 19 ? "Afternoon" : "Night";
const label = await page.textContent("#hour-label");
const sameDay = await page.$eval("#date", d => !d.textContent.includes("latest available"));
check(!sameDay || label.startsWith(expected), `initial picture matches the current UK time (${label}; UK hour ${londonHour}, expected ${expected}; today's data: ${sameDay})`);
check(await imgOk(), "artwork image loaded at 1600×1000");

for (const slug of options) {
  await page.selectOption("#beach", slug);
  await page.waitForFunction(s => location.search.includes(`beach=${s}`), slug);
  await page.waitForFunction(() => document.querySelector("#art").complete && document.querySelector("#art").naturalWidth > 0);
  await pause(1200);
  const src = await page.getAttribute("#art", "src");
  check(src.includes(`/${slug}/`) && await imgOk(), `${slug}: image ${src} shown`);
  const chips = await page.$$eval("#hours button", b => b.map(x => x.textContent));
  check(chips.length === 4, `${slug}: 4 time-of-day buttons (${chips.join(" | ")})`);
  const stats = await page.$$eval("#stats dd", d => d.map(x => x.textContent));
  check(stats.length === 6 && !stats[1].startsWith("–"), `${slug}: stats shown (${stats[1]})`);
  const tides = await page.$$eval("#tides li", l => l.length);
  check(tides >= 1, `${slug}: ${tides} tide estimates listed`);
}

await page.selectOption("#beach", options[0]);
await page.waitForFunction(() => document.querySelector("#art").complete);
await page.click("#hours button:first-child");
await pause(800);
check((await page.textContent("#hour-label")).startsWith("Morning"), "Morning button selects the morning picture");
check(await page.$eval("#prev", b => b.disabled), "previous disabled at first picture");
const seen = new Set([await page.getAttribute("#art", "src")]);
for (let i = 0; i < 3; i++) {
  await page.click("#next");
  await page.waitForFunction(() => document.querySelector("#art").complete && document.querySelector("#art").naturalWidth > 0);
  seen.add(await page.getAttribute("#art", "src"));
  await pause(1500);
}
check(seen.size === 4, `next button stepped through all 4 pictures (${[...seen].join(", ")})`);
check(await page.$eval("#next", b => b.disabled), "next disabled at last picture");
await page.click("#prev"); await pause(1200);
check((await page.textContent("#hour-label")).startsWith("Afternoon"), "previous button steps back to afternoon");
await page.keyboard.press("ArrowLeft"); await pause(1200);
check((await page.textContent("#hour-label")).startsWith("Noon"), "left arrow key steps back to noon");
if (await page.isVisible("#now")) { await page.click("#now"); await pause(1200); check((await page.textContent("#hour-label")).startsWith(expected), "jump to now"); }
await page.click("text=prompt & metadata").catch(() => {});
await pause(800);
check(errors.length === 0, `no page errors or failed requests ${errors.join(" | ")}`);
await page.setViewportSize({ width: 390, height: 844 }); await page.goto(url, { waitUntil: "networkidle" }); await pause(1500);
const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
check(!overflow, "no horizontal scroll at phone width");
await page.screenshot({ path: `${out}/mobile.png`, fullPage: false });
await context.close(); await browser.close();
const vid = (await readdir(out)).find(f => f.endsWith(".webm"));
if (vid) await rename(`${out}/${vid}`, `${out}/walkthrough.webm`);
