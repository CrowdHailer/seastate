import { chromium } from "playwright"; import { readFile } from "node:fs/promises";
const [inp, out] = process.argv.slice(2);
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1600, height: 1000 } });
await p.setContent(`<body style="margin:0"><style>svg{display:block;width:1600px;height:1000px}</style>${await readFile(inp,"utf8")}</body>`);
await p.screenshot({ path: out, type: "jpeg", quality: 70 }); await b.close();
