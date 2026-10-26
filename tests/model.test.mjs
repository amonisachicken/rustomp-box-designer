import { test } from "node:test";
import assert from "node:assert/strict";
import { byId } from "../src/assets.gen.js";
import {
  newDoc,
  factory,
  validate,
  move,
  resize,
  snap,
  load,
  save,
  bbox,
  layerOf,
  layerState,
  editable,
  snapTargets,
  toggleDy,
  syncTogglePivot,
  alignMoves,
  distributeMoves,
  duplicate,
  importSvg,
  mergedAssets,
  ledRadius,
  buttonRadius,
  paramChoices,
} from "../src/model.js";

const doc = () =>
  newDoc({
    params: [
      { id: "gain", type: "float" },
      { id: "bypass", type: "bool" },
    ],
  });

test("新建文档的窗口 = 面板 mm × 6 px/mm", () => {
  const d = newDoc({ preset: "1590B" });
  assert.deepEqual(d.canvas.window_px, [Math.round(d.canvas.canvas_mm[0] * 6), Math.round(d.canvas.canvas_mm[1] * 6)]);
});

test("旋钮：尺寸只由素材决定，行程写死 270°（模型里不再有字段）", () => {
  const d = doc();
  const k = factory.knob(d, { param: "gain" });
  assert.equal(k.radius, undefined, "旋钮不该再有 radius（命中半径 = 贴图宽/2）");
  assert.equal(k.travel_deg, undefined, "行程写死 270°，不再进模型/面板");
  const asset = byId("knob_round_dark").size_mm;
  assert.deepEqual(k.image_size, asset);
  assert.equal(bbox(k).w, asset[0]);
});

test("拨杆：两态 y 差正好抵消素材的六边形偏移（切换时六边形不跳）", () => {
  const d = doc();
  const t = factory.toggle(d, { x: 20, y: 30 });
  const up = byId(t.image_up);
  const down = byId(t.image_down);
  assert.ok(t.y_up !== t.y_down, "素材是镜像画的，两态 y 一定不同");
  const cyUp = t.y_up + up.hex_center_mm[1];
  const cyDown = t.y_down + down.hex_center_mm[1];
  assert.ok(Math.abs(cyUp - cyDown) < 0.01, `六边形中心差 ${(cyUp - cyDown).toFixed(3)} mm`);
  // pivot = 六边形中心（按下缩放以它为原点）
  assert.ok(Math.abs(t.pivot[1] - cyUp) < 0.01);
});

test("LED 半径由素材镜片推出（不再有 radius 字段）", () => {
  const d = doc();
  const l = factory.led(d);
  assert.equal(l.radius, undefined, "LED 不该再有 radius");
  const r = ledRadius(l);
  assert.ok(r > 2 && r < 3, `半径应≈2.25，实际 ${r}`);
  assert.equal(l.param, "clip_indicator"); // 虚拟指示，不需要在 params 里
});

test("脚踏：命中半径 = 美术宽/2（盖住美术），且带按住态", () => {
  const d = doc();
  const b = factory.button(d);
  assert.equal(b.radius, undefined, "脚踏不该再有 radius");
  const art = byId(b.asset).size_mm[0];
  assert.ok(buttonRadius(b) >= art / 2 - 0.01, `实际 ${buttonRadius(b)}，美术半径 ${art / 2}`);
  assert.equal(b.image_hold, "3pdt_alt_hold");
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

test("校验：手工把两态六边形中心弄歪会被拦下", () => {
  const d = doc();
  const t = factory.toggle(d, { param: "bypass" });
  d.elements.push(t);
  t.y_down = t.y_up; // 破坏掉那个 0.54 mm 的补偿
  assert.match(validate(d).join(), /六边形中心没对齐/);
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

test("resize 只影响旋钮的显示尺寸；LED/脚踏尺寸随素材，不受影响", () => {
  const d = doc();
  const k = factory.knob(d, { param: "gain", center: [20, 20] });
  const w0 = k.image_size[0];
  resize(k, 0.5);
  assert.deepEqual(k.center, [20, 20]);
  assert.equal(k.image_size[0], +(w0 * 0.5).toFixed(2));
  const led = factory.led(d, { center: [30, 30] });
  const r0 = ledRadius(led);
  resize(led, 0.5);
  assert.equal(ledRadius(led), r0, "LED 半径只由素材决定");
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

test("图层：隐藏后不可编辑；锁定逻辑已退役（改用焦点）", () => {
  const d = doc();
  const k = factory.knob(d, { param: "gain" });
  d.elements.push(k);
  assert.equal(editable(d, k), true);
  d.layers = { knobs: { hidden: true } };
  assert.equal(editable(d, k), false);
  d.layers = { knobs: { hidden: false } };
  assert.equal(editable(d, k), true);
});

test("吸附：旋钮拖到画布中线附近会被吸到正中", () => {
  const d = doc();
  d.canvas.canvas_mm = [60, 112];
  const k = factory.knob(d, { param: "gain", center: [30.4, 30] });
  d.elements.push(k);
  const t = snapTargets(d, k, 1.2);
  assert.ok(Math.abs(t.dx) > 0, "应当给出横向修正量");
  move(k, t.dx, 0);
  assert.equal(k.center[0], 30); // 面板中线
  assert.ok(t.guides.some((g) => g.axis === "x"));
});

test("吸附：也会对齐到其它控件的中线", () => {
  const d = doc();
  const a = factory.knob(d, { param: "gain", center: [20, 20] });
  const b = factory.knob(d, { param: "gain", center: [20.3, 40] });
  d.elements.push(a, b);
  const t = snapTargets(d, b, 1.2);
  move(b, t.dx, t.dy);
  assert.equal(b.center[0], 20);
});

test("syncTogglePivot：改 y_up 后 y_down 与 pivot 自动跟随（六边形仍重合）", () => {
  const d = doc();
  const t = factory.toggle(d, { param: "bypass", x: 20, y: 30 }); // 拨杆只能绑 bool
  d.elements.push(t);
  const dy = toggleDy(t);
  assert.ok(dy > 0.4, `两态 y 差应≈0.54，实际 ${dy}`);
  t.y_up = 41;
  syncTogglePivot(t);
  assert.equal(t.y_down, +(41 + dy).toFixed(2));
  const up = byId(t.image_up);
  const down = byId(t.image_down);
  const cyUp = t.y_up + up.hex_center_mm[1];
  const cyDown = t.y_down + down.hex_center_mm[1];
  assert.ok(Math.abs(cyUp - cyDown) < 0.01, `六边形中心差 ${(cyUp - cyDown).toFixed(3)}`);
  assert.ok(Math.abs(t.pivot[1] - cyUp) < 0.01);
  assert.deepEqual(validate(d), []);
});

test("新建文档自带边框（装饰层），随画布尺寸变化", () => {
  const d = newDoc({});
  const f = d.elements.find((e) => e.kind === "frame");
  assert.ok(f, "应当自带一个面板边框");
  assert.equal(layerOf(f), "artwork");
  let b = bbox(f, d.canvas.canvas_mm);
  assert.deepEqual([b.x, b.y], [1.2, 1.2]);
  assert.equal(b.w, 60 - 2.4);
  // 改画布 → 边框自动跟随（不需要手工改数值）
  d.canvas.canvas_mm = [100, 140];
  b = bbox(f, d.canvas.canvas_mm);
  assert.equal(b.w, 100 - 2.4);
  assert.deepEqual(validate(d), []);
});

test("导入 SVG：必须指定类，且只允许装饰/丝印", () => {
  const d = newDoc({});
  const svg = '<svg viewBox="0 0 28.35 14.17"><rect width="28.35" height="14.17"/></svg>'; // 10 × 5 mm
  assert.throws(() => importSvg(d, { name: "x", svg, kind: "knobs" }), /装饰|丝印/);
  const a = importSvg(d, { name: "my logo.svg", svg, kind: "artwork" });
  assert.equal(a.id, "imp_my_logo");
  assert.ok(Math.abs(a.size_mm[0] - 10) < 0.01 && Math.abs(a.size_mm[1] - 5) < 0.01, `${a.size_mm}`);
  assert.equal(d.imported.length, 1);
  // 重名自动加序号
  const b = importSvg(d, { name: "my logo.svg", svg, kind: "artwork" });
  assert.equal(b.id, "imp_my_logo_2");
  // 读不出尺寸要报错
  assert.throws(() => importSvg(d, { name: "bad", svg: "<svg></svg>", kind: "artwork" }), /尺寸/);
});

test("导入素材能进元素并参与校验/合并", () => {
  const d = doc();
  const svg = '<svg viewBox="0 0 28.35 14.17"><rect width="28.35" height="14.17"/></svg>';
  const imp = importSvg(d, { name: "deco", svg, kind: "silkscreen" });
  const el = factory.image(d, { asset: imp.id, x: 10, y: 10, layer: "silkscreen", size: imp.size_mm });
  d.elements.push(el);
  assert.deepEqual(validate(d), []);
  assert.ok(imp.id in mergedAssets(d, {}));
  // 控件不能用导入素材
  const k = factory.knob(d, { param: "gain" });
  k.asset = imp.id;
  d.elements.push(k);
  assert.match(validate(d).join(), /控件不能用导入素材/);
});

test("参数类型必须匹配控件（D-014）：旋钮只 float、拨杆/脚踏只 bool、LED 只指示量", () => {
  const d = newDoc({
    params: [
      { id: "gain", type: "float" },
      { id: "bypass", type: "bool" },
      { id: "mode", type: "bool" },
    ],
  });
  assert.deepEqual(paramChoices(d, "knob"), ["gain"]);
  assert.deepEqual(paramChoices(d, "toggle"), ["bypass", "mode"]);
  assert.deepEqual(paramChoices(d, "button"), ["bypass", "mode"]);
  assert.deepEqual(paramChoices(d, "led"), ["clip_indicator"]);

  // 错配要在校验里报出来（不会崩，但会"拖了没反应"）
  const k = factory.knob(d, { param: "bypass" });
  d.elements.push(k);
  assert.match(validate(d).join(), /knob 只能绑 float 类型参数/);

  const l = factory.led(d, { param: "gain" });
  d.elements.push(l);
  assert.match(validate(d).join(), /led 只能绑 指示灯指示量/);
});
