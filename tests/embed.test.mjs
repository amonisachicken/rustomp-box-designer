import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { flatten, parseCss, placeAsset } from "../src/embed.js";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("把 CSS 类展开成内联 style（自闭合标签也不能坏）", () => {
  const svg = `<svg viewBox="0 0 10 10"><defs><style>.cls-1{fill:maroon;stroke:#231815;}</style></defs>
    <g class="cls-1"><circle cx="5" cy="5" r="4" class="cls-1"/><polygon points="0,0 1,1" class="cls-1"/></g></svg>`;
  const { inner } = flatten(svg);
  // 关键回归：自闭合标签的样式必须加在 `/` **前面**，否则样式被丢掉、圆变成黑块（DEVLOG 记录）
  assert.match(inner, /<circle cx="5" cy="5" r="4" style="fill:maroon;stroke:#231815"\/>/);
  assert.match(inner, /<polygon points="0,0 1,1" style="fill:maroon;stroke:#231815"\/>/);
  assert.doesNotMatch(inner, /class=/);
  assert.doesNotMatch(inner, /<style/);
});

test("删掉 id / data-name（多个素材内联会重名）", () => {
  const svg = `<svg viewBox="0 0 4 4"><g id="layer1" data-name="图层 1"><rect id="r1" width="2" height="2"/></g></svg>`;
  const { inner } = flatten(svg);
  assert.doesNotMatch(inner, /\bid=/);
  assert.doesNotMatch(inner, /data-name/);
});

test("parseCss 支持逗号分隔的选择器组", () => {
  const css = parseCss(`<svg><style>.a,.b{fill:none;stroke:#000}.c{stroke-width:0.75px}</style></svg>`);
  assert.equal(css[".a"], "fill:none;stroke:#000");
  assert.equal(css[".b"], "fill:none;stroke:#000");
  assert.equal(css[".c"], "stroke-width:0.75px");
});

test("真实素材：LED 的填色必须是 maroon 而不是默认黑", () => {
  const { inner } = flatten(read("assets/leds/led_red.svg"));
  assert.match(inner, /fill:maroon/);
});

test("placeAsset 用嵌套 svg + viewBox（不是 transform），才能裁剪越界的坐标", () => {
  const text = read("assets/labels/gain.svg");
  const out = placeAsset({ assetId: "label_gain", text, x: 10, y: 20 });
  assert.match(out, /^<svg x="10" y="20"/);
  assert.match(out, /viewBox="0 0 22.02 6.72"/);
  // 素材 path 的绝对坐标在 viewBox 之外（M253,393），靠嵌套 viewport 裁掉
  assert.match(out, /M253\.44,393/);
});
