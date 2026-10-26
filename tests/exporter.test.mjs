import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { newDoc, factory, load } from "../src/model.js";
import { num, panelSvg, spritePlan, uiToml, parseParams } from "../src/exporter.js";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const assets = () => {
  const map = {};
  const manifest = read("src/assets.gen.js");
  for (const [, id, , file] of manifest.matchAll(/"id": "([^"]+)",\s*"kind": "([^"]+)",\s*"file": "([^"]+)"/g)) {
    map[id] = read(file);
  }
  return map;
};

const demo = () => {
  const d = newDoc({ name: "t", params: [{ id: "gain" }, { id: "bypass" }] });
  d.canvas.canvas_mm = [60, 112];
  d.canvas.window_px = [360, 672];
  d.elements.push(factory.rect(d, { x: 1.2, y: 1.2, w: 57.6, h: 109.6, rx: 2.2, fill: "none" }));
  d.elements.push(factory.knob(d, { param: "gain", center: [30, 30] }));
  d.elements.push(factory.toggle(d, { param: "gain", x: 26, y: 50 }));
  d.elements.push(factory.led(d, { param: "clip_indicator", center: [30, 10] }));
  d.elements.push(factory.button(d, { param: "bypass", center: [30, 85] }));
  return d;
};

test("num：最多 3 位小数、无尾随 0、-0 归一", () => {
  assert.equal(num(15), "15");
  assert.equal(num(15.32), "15.32");
  assert.equal(num(15.0036), "15.004");
  assert.equal(num(-0.0001), "0"); // 不输出 "-0"
  assert.equal(num(-3.5), "-3.5");
  assert.equal(num(0.0000001), "0");
});

test("panel.svg 导出底图时不含旋钮/拨杆（它们是运行时贴图）", () => {
  const d = demo();
  const flat = panelSvg(d, assets(), { controls: false });
  assert.doesNotMatch(flat, /data-control="knob"/);
  assert.doesNotMatch(flat, /data-control="toggle"/);
  // LED 底座与脚踏美术必须在底图里（运行时要从底图抠/photocopy）
  assert.match(flat, /data-elid="l\d+"/);
  assert.match(flat, /data-elid="b\d+"/);
});

test("预览时才画旋钮/拨杆/LED 亮点/按下反馈", () => {
  const d = demo();
  const knobs = d.elements.filter((e) => e.kind === "knob");
  const toggles = d.elements.filter((e) => e.kind === "toggle");
  const svg = panelSvg(d, assets(), {
    controls: true,
    values: Object.fromEntries([
      ...knobs.map((k) => [k.id, 0.5]),
      ...toggles.map((t) => [t.id, true]),
      ...d.elements.filter((e) => e.kind === "button").map((b) => [b.id, true]),
    ]),
  });
  assert.match(svg, /data-control="knob"/);
  assert.match(svg, /data-control="toggle"/);
  assert.match(svg, /data-control="led"/);
  // 旋钮 0.5 → 角度 0，不该有 rotate
  assert.doesNotMatch(svg, /rotate\(/);
});

test("旋钮角度 = (value-0.5) × travel（指针朝上 ⇔ 0.5）", () => {
  const d = demo();
  const k = d.elements.find((e) => e.kind === "knob");
  const svg = panelSvg(d, assets(), { controls: true, values: { [k.id]: 1.0 } });
  assert.match(svg, new RegExp(`rotate\\(135 ${k.center[0]} ${k.center[1]}\\)`));
});

test("spritePlan：面板 + 去重后的旋钮/拨杆/按住态贴图", () => {
  const d = demo();
  const plan = spritePlan(d).map((p) => p.file);
  assert.deepEqual(plan, [
    "panel.png",
    "knob_round_dark.png",
    "3pdt_alt_hold.png", // 脚踏的按住态
    "toggle_small_up.png",
    "toggle_small_down.png",
  ]);
});

test("ui.toml：四类控件字段齐全且顺序稳定（幂等）", () => {
  const d = demo();
  const a = uiToml(d);
  assert.equal(a, uiToml(load(JSON.stringify(d)))); // 同一个文档两次导出必须逐字节相同
  assert.match(a, /# >>> rustomp-box-designer/);
  assert.match(a, /# <<< rustomp-box-designer/);
  for (const k of ["[[ui.knobs]]", "[[ui.toggles]]", "[[ui.leds]]", "[[ui.buttons]]"]) assert.ok(a.includes(k), k);
  for (const k of ['render = "rotate"', "travel_deg = 270", "image_up =", "y_down =", "off_color =", "press_scale = 0.9"]) {
    assert.ok(a.includes(k), `缺 ${k}`);
  }
  // [assets] 里的键必须与贴图清单一致
  assert.match(a, /knob_round_dark = "assets\/knob_round_dark.png"/);
  assert.match(a, /panel = "assets\/panel.png"/);
});

test("window_px 缺省时按 canvas × 6 推算", () => {
  const d = demo();
  delete d.canvas.window_px;
  assert.match(uiToml(d), /window_width = 360/);
});

test("parseParams 能从 rustomp.toml 抠出 id/name/type", () => {
  const toml = `
[plugin]
name = "X"
[[params]]
id = "gain"
name = "Gain"
type = "float"
default = 0.5

[[params]]
id = "bypass"
name = "Bypass"
type = "bool"
default = false

[ui]
svg_width = 60
`;
  const p = parseParams(toml);
  assert.deepEqual(
    p.map((x) => [x.id, x.name, x.type]),
    [
      ["gain", "Gain", "float"],
      ["bypass", "Bypass", "bool"],
    ],
  );
});

test("旁通时 LED 去色变灰（与运行时的 led_grey 同一公式）", () => {
  const d = demo();
  const on = panelSvg(d, assets(), { controls: true, values: {}, bypassed: false });
  const off = panelSvg(d, assets(), { controls: true, values: {}, bypassed: true });
  const litColour = /data-control="led"[^>]*fill="([^"]+)"/.exec(on)[1];
  const greyColour = /data-control="led"[^>]*fill="([^"]+)"/.exec(off)[1];
  assert.match(greyColour, /^rgb\((\d+),\1,\1\)$/, `应当是灰度色，实际 ${greyColour}`);
  assert.notEqual(greyColour, litColour);
  // 灰要比暗红更亮一档（暗红 #800000 太暗，看不出是"灰"）
  const lum = (c) => {
    const n = /rgb\((\d+),(\d+),(\d+)\)/.exec(c).slice(1).map(Number);
    return 0.299 * n[0] + 0.587 * n[1] + 0.114 * n[2];
  };
  assert.ok(lum(greyColour) > lum("rgb(38,38,38)"), "灰灯不该是接近黑");
});
