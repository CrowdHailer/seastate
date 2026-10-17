import { writeFile } from "node:fs/promises";
// Replace this with your actual API endpoint.
const response = await fetch("https://api.open-meteo.com/v1/forecast?latitude=52.52&longitude=13.41&hourly=temperature_2m", {
    signal: AbortSignal.timeout(30000)
});

if (!response.ok) {
    throw new Error(`API request failed: ${response.status}`);
}

const data = await response.json();

// Save the response so your website can read it.
await writeFile(
    "api-data.json",
    JSON.stringify(data, null, 2),
    "utf8"
);

console.log("API data updated successfully.");
