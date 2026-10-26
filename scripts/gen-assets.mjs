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

/**
 * 六边形中心（拨杆两态的"轴心"）。
 *
 * 两态素材是**镜像**画的：上半的六边形偏下、下半的六边形偏上，
 * 各自贴回同一个 y 就会让六边形中心差 1.53 mm（legacy 版的老毛病）。
 * 所以从 polyline/polygon 的点里算出它的包围盒中心，导出时两态各让开这个差值。
 */
function hexCenter(svg) {
  const polys = [...svg.matchAll(/<(?:polyline|polygon)\b[^>]*\bpoints="([\d.\s,-]+)"/g)];
  for (const [, pts] of polys) {
    const nums = pts.trim().split(/[\s,]+/).map(Number);
    if (nums.length < 6) continue;
    const xs = [], ys = [];
    for (let i = 0; i + 1 < nums.length; i += 2) { xs.push(nums[i]); ys.push(nums[i + 1]); }
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    return { x_pt: cx, y_pt: cy };
  }
  return null;
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
    hex_center_mm: (() => {
      const hex = hexCenter(svg);
      if (!hex) return null;
      return [+(hex.x_pt * PT_TO_MM).toFixed(4), +(hex.y_pt * PT_TO_MM).toFixed(4)];
    })(),
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
  // 文件名里的 `-` 不是合法 Rust 标识/贴图名习惯 → 统一成 `_`
  const norm = base.replace(/[^A-Za-z0-9_]/g, "_");
  items.push({
    id: kind === "label" ? `label_${norm}` : norm,
    kind,
    file: `assets/${rel}`,
    size_mm: [info.w_mm, info.h_mm],
    r_outer_mm: info.r_outer_mm,
    r_inner_mm: info.r_inner_mm,
    cx_pt: info.cx_pt,
    hex_center_mm: info.hex_center_mm,
  });
}

// 拨杆成对：xxx_up / xxx_down 自动配对，方便 UI 一次拖两个
const pairs = {};
for (const it of items) {
  if (it.kind !== "switch") continue;
  const m = /^(.*)_(up|down)$/.exec(it.id);
  if (m) (pairs[m[1]] ??= {})[m[2]] = it.id;
}

// 「按住态」配对：xxx_hold.svg 是 xxx.svg 的按下态（同一画布尺寸）
const holds = {};
for (const it of items) {
  const m = /^(.*)_hold$/.exec(it.id);
  if (m && items.some((a) => a.id === m[1])) holds[m[1]] = it.id;
}
for (const [base, hold] of Object.entries(holds)) {
  const a = items.find((x) => x.id === base);
  if (Math.abs(a.size_mm[0] - items.find((x) => x.id === hold).size_mm[0]) > 0.01) {
    console.warn(`  ! ${hold} 与 ${base} 尺寸不一致，按住时会跳`);
  }
  a.hold = hold;
}

/** 脚踏 = 不带 _up/_down/_hold 后缀的开关素材 */
const FOOTSWITCHES = items.filter((a) => a.kind === "switch" && !/_(up|down|hold)$/.test(a.id)).map((a) => a.id);

const body = `// 由 scripts/gen-assets.mjs 生成，请勿手改。
export const PT_TO_MM = ${PT_TO_MM};
export const ASSETS = ${JSON.stringify(items, null, 2)};
export const SWITCH_PAIRS = ${JSON.stringify(pairs, null, 2)};
export const FOOTSWITCHES = ${JSON.stringify(FOOTSWITCHES, null, 2)};
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
