#!/usr/bin/env node
// 扫 assets/**/*.svg → src/assets.gen.js（素材清单）。
//
// 为什么要有这一步：素材是「pt 坐标 + viewBox」的 SVG（Illustrator/Inkscape 导出），
// 尺寸只能从 viewBox 读出来。手抄 33 个尺寸必然会错，所以让它自动生成、并入库可 diff。
//
// 用法：node scripts/gen-assets.mjs [--check]
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const PT_TO_MM = 25.4 / 72; // 1 pt = 0.352778 mm

/** 目录 → 素材种类（决定了它在面板里怎么用） */
const KINDS = {
  knobs: "knob",
  leds: "led",
  sw: "switch",
  labels: "label",
};

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (name.endsWith(".svg")) out.push(p);
  }
  return out;
}

/** 从 SVG 文本里抠出我们需要的几个数：viewBox 尺寸、圆形半径 */
function inspect(svg) {
  const vb = /viewBox="([-\d.\s]+)"/.exec(svg);
  if (!vb) throw new Error("没有 viewBox");
  const [, , w, h] = vb[1].trim().split(/\s+/).map(Number);
  const radii = [...svg.matchAll(/<circle\b[^>]*\br="([\d.]+)"/g)].map((m) => Number(m[1]));
  const cx = /<circle\b[^>]*\bcx="([\d.]+)"/.exec(svg);
  return {
    w_pt: w,
    h_pt: h,
    w_mm: +(w * PT_TO_MM).toFixed(4),
    h_mm: +(h * PT_TO_MM).toFixed(4),
    r_outer_mm: radii.length ? +(Math.max(...radii) * PT_TO_MM).toFixed(4) : null,
    r_inner_mm: radii.length > 1 ? +(Math.min(...radii) * PT_TO_MM).toFixed(4) : null,
    cx_pt: cx ? Number(cx[1]) : null,
    hasCenterCircle: radii.length > 0,
  };
}

const items = [];
for (const file of walk(join(ROOT, "assets"))) {
  const rel = relative(join(ROOT, "assets"), file).replaceAll("\\", "/");
  const [dir, base] = [rel.split("/")[0], rel.split("/").pop().replace(/\.svg$/, "")];
  const kind = KINDS[dir];
  if (!kind) throw new Error(`未知素材目录：${rel}`);
  const info = inspect(readFileSync(file, "utf8"));
  items.push({
    id: kind === "label" ? `label_${base}` : base,
    kind,
    file: `assets/${rel}`,
    size_mm: [info.w_mm, info.h_mm],
    r_outer_mm: info.r_outer_mm,
    r_inner_mm: info.r_inner_mm,
    cx_pt: info.cx_pt,
  });
}

// 拨杆成对：xxx_up / xxx_down 自动配对，方便 UI 一次拖两个
const pairs = {};
for (const it of items) {
  if (it.kind !== "switch") continue;
  const m = /^(.*)_(up|down)$/.exec(it.id);
  if (m) (pairs[m[1]] ??= {})[m[2]] = it.id;
}

const body = `// 由 scripts/gen-assets.mjs 生成，请勿手改。
export const PT_TO_MM = ${PT_TO_MM};
export const ASSETS = ${JSON.stringify(items, null, 2)};
export const SWITCH_PAIRS = ${JSON.stringify(pairs, null, 2)};
export const byId = (id) => ASSETS.find((a) => a.id === id);
export const byKind = (kind) => ASSETS.filter((a) => a.kind === kind);
`;
const out = join(ROOT, "src/assets.gen.js");
if (process.argv.includes("--check")) {
  const cur = readFileSync(out, "utf8");
  if (cur !== body) {
    console.error("✗ src/assets.gen.js 已过期，请跑 node scripts/gen-assets.mjs");
    process.exit(1);
  }
  console.log(`✓ 素材清单无漂移（${items.length} 个）`);
} else {
  writeFileSync(out, body);
  console.log(`✓ 写入 src/assets.gen.js（${items.length} 个素材）`);
  for (const p of Object.keys(pairs)) {
    if (!pairs[p].up || !pairs[p].down) console.log(`  ! 拨杆 ${p} 缺一态`);
  }
}
