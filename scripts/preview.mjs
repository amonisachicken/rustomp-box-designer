#!/usr/bin/env node
// 渲染「预览图」：带旋钮/拨杆/LED/按下反馈，用来肉眼验收渲染路径（等同浏览器里看到的）
//
// 用法：node scripts/preview.mjs examples/sparklin.box.json --out /tmp/preview.png
//       [--value k1=0.75] [--value t1=on] [--value l1=on] [--value b1=pressed]
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { load } from "../src/model.js";
import { panelSvg } from "../src/exporter.js";

const args = process.argv.slice(2);
const boxPath = args.find((a) => a.endsWith(".json"));
const flag = (n, d) => (args.indexOf(`--${n}`) >= 0 ? args[args.indexOf(`--${n}`) + 1] : d);
const out = resolve(flag("out", "/tmp/boxd-preview.png"));

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), "..");
const doc = load(readFileSync(boxPath, "utf8"));

// 默认给个"有变化"的状态，方便一眼看出渲染是否正确
const values = {};
for (const el of doc.elements) {
  if (el.kind === "knob") values[el.id] = 0.72;
  if (el.kind === "toggle") values[el.id] = true;
  if (el.kind === "led") values[el.id] = true;
  if (el.kind === "button") values[el.id] = true;
}
for (let i = 0; i < args.length; i++) {
  if (args[i] !== "--value") continue;
  const [id, v] = args[i + 1].split("=");
  values[id] = ["on", "pressed", "true"].includes(v) ? true : ["off", "false"].includes(v) ? false : Number(v);
}

const assets = {};
const manifest = readFileSync(join(ROOT, "src/assets.gen.js"), "utf8");
for (const [, id, , file] of manifest.matchAll(/"id": "([^"]+)",\s*"kind": "([^"]+)",\s*"file": "([^"]+)"/g)) {
  assets[id] = readFileSync(join(ROOT, file), "utf8");
}

const svg = panelSvg(doc, assets, { controls: true, values });
const svgPath = out.replace(/\.png$/, ".svg");
writeFileSync(svgPath, svg);
const width = Math.round(doc.canvas.canvas_mm[0] * doc.canvas.px_per_mm);
execFileSync("inkscape", ["--export-type=png", `--export-width=${width}`, `--export-filename=${out}`, svgPath], {
  stdio: "pipe",
});
console.log(`ARTIFACT: ${out}`);
console.log(`ARTIFACT: ${svgPath}`);
