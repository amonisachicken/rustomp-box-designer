import { test } from "node:test";
import assert from "node:assert/strict";
import { newDoc, factory, validate, move, resize, snap, load, save, bbox, layerOf } from "../src/model.js";

const doc = () => newDoc({ params: [{ id: "gain" }, { id: "bypass" }] });

test("新建文档的窗口 = 面板 mm × 6 px/mm", () => {
  const d = newDoc({ preset: "1590B" });
  assert.deepEqual(d.canvas.window_px, [Math.round(d.canvas.canvas_mm[0] * 6), Math.round(d.canvas.canvas_mm[1] * 6)]);
});

test("旋钮：半径来自素材尺寸，指针朝上 = 0.5（travel_deg 对称）", () => {
  const d = doc();
  const k = factory.knob(d, { param: "gain" });
  assert.equal(k.radius, 7.5); // knob_round_dark 15 mm
  assert.equal(k.travel_deg, 270);
  assert.deepEqual(k.image_size, [15.0036, 15.0036]);
});

test("拨杆：两态 y 相同（= 运行时归一化后的契约），pivot 在中心", () => {
  const d = doc();
  const t = factory.toggle(d, { x: 20, y: 30 });
  assert.equal(t.y_up, t.y_down);
  assert.equal(t.pivot[0], +(20 + t.width / 2).toFixed(2));
  assert.ok(t.height > 8);
});

test("LED 半径 = 素材内圈（镜片），底座外圈留在底图里", () => {
  const d = doc();
  const l = factory.led(d);
  assert.ok(l.radius > 2 && l.radius < 3, `半径应≈2.25，实际 ${l.radius}`);
  assert.equal(l.param, "clip_indicator"); // 虚拟指示，不需要在 params 里
});

test("脚踏半径 = 3PDT 外圈", () => {
  const d = doc();
  const b = factory.button(d);
  assert.ok(b.radius > 5 && b.radius < 5.5, `实际 ${b.radius}`);
});

test("校验：绑定了不存在的参数要报错", () => {
  const d = doc();
  d.elements.push(factory.knob(d, { param: "nope" }));
  assert.match(validate(d).join(), /nope/);
});

test("校验：LED 允许 clip_indicator 这个虚拟 id", () => {
  const d = doc();
  d.elements.push(factory.led(d, { param: "clip_indicator" }));
  assert.deepEqual(validate(d), []);
});

test("校验：拨杆两态 y 不一致会被拦下（切换会跳）", () => {
  const d = doc();
  const t = factory.toggle(d, { param: "gain" });
  d.elements.push(t);
  t.y_down = t.y_up + 1.5;
  assert.match(validate(d).join(), /两态 y 不一致/);
});

test("校验：超出画布要报错", () => {
  const d = doc();
  d.elements.push(factory.knob(d, { param: "gain", center: [-5, 10] }));
  assert.match(validate(d).join(), /超出画布/);
});

test("move 对四类控件都生效（拨杆要带上 pivot）", () => {
  const d = doc();
  const t = factory.toggle(d, { param: "gain", x: 10, y: 10 });
  const before = t.pivot[0];
  move(t, 5, 5);
  assert.equal(t.x, 15);
  assert.equal(t.pivot[0], +(before + 5).toFixed(2));
});

test("resize 保持圆心不变（只改直径/半径）", () => {
  const d = doc();
  const k = factory.knob(d, { param: "gain", center: [20, 20] });
  resize(k, 0.5);
  assert.deepEqual(k.center, [20, 20]);
  assert.equal(k.radius, 3.75);
});

test("snap 吸附 0.5 mm", () => {
  assert.equal(snap(12.34), 12.5);
  assert.equal(snap(12.2), 12);
});

test("bbox / layerOf 覆盖所有 kind", () => {
  const d = doc();
  const els = [factory.knob(d), factory.toggle(d), factory.led(d), factory.button(d), factory.image(d), factory.rect(d)];
  assert.deepEqual(els.map(layerOf), ["knobs", "toggles", "leds", "buttons", "silkscreen", "artwork"]);
  for (const el of els) {
    const b = bbox(el);
    assert.ok(b.w >= 0 && b.h >= 0, `${el.kind} 的 bbox 有问题`);
  }
});

test("save/load 往返一致", () => {
  const d = doc();
  d.elements.push(factory.knob(d, { param: "gain" }));
  const back = load(save(d));
  assert.deepEqual(back, JSON.parse(JSON.stringify(d)));
});

test("load 拒绝未知版本", () => {
  assert.throws(() => load('{"version":99}'), /版本/);
});
