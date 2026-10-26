#!/usr/bin/env node
// .box.json → 面板 SVG + PNG + rustomp.toml 片段（docs/00-decisions.md D-007）
//
// 用法：
//   node scripts/export.mjs examples/sparklin.box.json --out /tmp/sparklin-ui
//   node scripts/export.mjs examples/sparklin.box.json --out plugins/x/assets --px 12
//
// 产物（成功时逐行打印 ARTIFACT: <绝对路径>，与 rustomp 的打包后端契约同形）：
//   panel.svg / panel.png / <knob>.png / <toggle>_up|down.png / ui.toml
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join, resolve, basename } from "node:path";
import { load, validate } from "../src/model.js";
import { panelSvg, spritePlan, uiToml, num } from "../src/exporter.js";
import { flatten } from "../src/embed.js";

const args = process.argv.slice(2);
const boxPath = args.find((a) => !a.startsWith("--") && a.endsWith(".json"));
const flag = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : dflt;
};
if (!boxPath) {
  console.error("用法：node scripts/export.mjs <box.json> --out <目录> [--px 12] [--svg-only] [--force]");
  process.exit(2);
}

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), "..");
const outDir = resolve(flag("out", join(ROOT, "dist")));
const pxPerMm = Number(flag("px", 12));
const svgOnly = args.includes("--svg-only");
const force = args.includes("--force");

const doc = load(readFileSync(boxPath, "utf8"));
if (flag("px")) doc.canvas.px_per_mm = pxPerMm;

const problems = validate(doc);
if (problems.length) {
  console.error("✗ 面板校验失败：");
  for (const p of problems) console.error("  -", p);
  if (!force) process.exit(1);
}

function readAssets() {
  const map = {};
  const need = new Set();
  for (const el of doc.elements) {
    if (el.asset) need.add(el.asset);
    if (el.kind === "toggle") {
      need.add(el.image_up);
      need.add(el.image_down);
    }
  }
  // byId 在 model 内部用，这里直接从磁盘读（box.json 里存的是素材 id → 路径由清单给出）
  const manifest = readFileSync(join(ROOT, "src/assets.gen.js"), "utf8");
  const entries = [...manifest.matchAll(/"id": "([^"]+)",\s*"kind": "([^"]+)",\s*"file": "([^"]+)"/g)];
  for (const [, id, , file] of entries) {
    if (need.has(id)) map[id] = readFileSync(join(ROOT, file), "utf8");
  }
  const missing = [...need].filter((id) => !map[id]);
  if (missing.length) throw new Error(`素材文件读不到：${missing.join(", ")}`);
  return map;
}

const assets = readAssets();
mkdirSync(outDir, { recursive: true });

// 1) 面板 SVG（不含旋钮/拨杆贴图：那些是运行时画的）
const panelSvgText = panelSvg(doc, assets, { controls: false });
const panelSvgPath = join(outDir, "panel.svg");
writeFileSync(panelSvgPath, panelSvgText);

// 2) 贴图 SVG 临时件 + 3) Inkscape 栅格化
function rasterize(svgText, pngPath, mm) {
  const svgPath = join(outDir, `.${basename(pngPath, ".png")}.src.svg`);
  writeFileSync(svgPath, svgText);
  const widthPx = Math.round(mm[0] * doc.canvas.px_per_mm);
  execFileSync("inkscape", ["--export-type=png", `--export-width=${widthPx}`, `--export-filename=${pngPath}`, svgPath], {
    stdio: "pipe",
  });
  if (!existsSync(pngPath)) throw new Error(`Inkscape 没有产出 ${pngPath}`);
}

const artifacts = [panelSvgPath];
if (!svgOnly) {
  rasterize(panelSvgText, join(outDir, "panel.png"), doc.canvas.canvas_mm);
  artifacts.push(join(outDir, "panel.png"));

  for (const item of spritePlan(doc)) {
    if (item.file === "panel.png") continue;
    const assetId = item.file.replace(/\.png$/, "");
    const text = assets[assetId];
    if (!text) throw new Error(`贴图素材缺失：${assetId}`);
    const { viewBox, inner } = flatten(text); // 展开 CSS 类，否则贴图会没有颜色
    const [w, h] = item.mm.map((v) => num(v));
    const inline =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${w}mm" height="${h}mm" viewBox="0 0 ${w} ${h}">` +
      `<svg x="0" y="0" width="${w}" height="${h}" viewBox="${viewBox}">${inner}</svg>` +
      `</svg>`;
    rasterize(inline, join(outDir, item.file), item.mm);
    artifacts.push(join(outDir, item.file));
  }
}

// 4) [assets] + [ui] 片段
const tomlPath = join(outDir, "ui.toml");
writeFileSync(tomlPath, uiToml(doc));
artifacts.push(tomlPath);

console.log(`面板：${doc.name}（${doc.canvas.canvas_mm.join(" × ")} mm，${doc.canvas.px_per_mm} px/mm）`);
for (const a of artifacts) console.log(`ARTIFACT: ${a}`);
if (problems.length) console.log(`（${problems.length} 条校验问题被 --force 忽略）`);
