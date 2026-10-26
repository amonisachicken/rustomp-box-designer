// 导出：.box.json → 面板 SVG / 控件贴图清单 / rustomp.toml 片段
//
// 全部是纯函数（不碰 DOM），所以 Node 脚本和浏览器可以共用同一份代码 ——
// 预览与导出必然一致（docs/00-decisions.md D-001）。
import { byId } from "./assets.gen.js";
import { placeAsset } from "./embed.js";
import { layerOf, bbox } from "./model.js";

const M = 25.4 / 72; // pt → mm

/** 数字格式化：最多 3 位小数，去掉尾随 0（TOML/SVG 都要稳定文本，便于 diff） */
export function num(v) {
  if (!Number.isFinite(v)) throw new Error(`非有限数：${v}`);
  const s = v.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
  return s === "-0" ? "0" : s;
}

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** 抽稀：只保留每层里真正"压进底图"的元素 */
const flattenable = (el) => ["rect", "image", "led", "button"].includes(el.kind);

/**
 * 面板 SVG。
 *
 * @param doc        .box.json
 * @param assets     { [assetId]: svgText }
 * @param opts.controls  是否把旋钮/拨杆也画出来（预览用；导出底图时不要）
 * @param opts.values    预览时的参数值 { [elementId]: 0..1 | bool }
 */
export function panelSvg(doc, assets, opts = {}) {
  const { controls = false, values = {} } = opts;
  const [W, H] = doc.canvas.canvas_mm;
  const out = [];
  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ` +
      `width="${num(W)}mm" height="${num(H)}mm" viewBox="0 0 ${num(W)} ${num(H)}">`,
  );
  out.push(`<rect x="0" y="0" width="${num(W)}" height="${num(H)}" fill="${esc(doc.canvas.background)}"/>`);

  // 底图部分：背景 → 装饰 → 丝印 → LED 底座 → 脚踏美术（= 运行时 panel.png 的内容）
  const order = ["background", "artwork", "silkscreen", "leds", "buttons"];
  for (const layer of order) {
    for (const el of doc.elements.filter((e) => layerOf(e) === layer && flattenable(e))) {
      out.push(flattenElement(el, assets, values));
    }
  }

  if (controls) {
    // 之后按运行时的绘制顺序：LED → 旋钮 → 拨杆 → 脚踏按下反馈
    for (const el of doc.elements.filter((e) => e.kind === "led")) out.push(ledCircle(el, values[el.id] ?? el.lit));
    for (const el of doc.elements.filter((e) => e.kind === "knob")) out.push(knobSprite(el, assets, values));
    for (const el of doc.elements.filter((e) => e.kind === "toggle")) out.push(toggleSprite(el, assets, values));
    for (const el of doc.elements.filter((e) => e.kind === "button")) {
      if (values[el.id]) out.push(buttonPress(el, assets, doc.canvas.background));
    }
  }

  out.push("</svg>");
  return out.join("\n") + "\n";
}

function flattenElement(el, assets, values) {
  switch (el.kind) {
    case "rect": {
      const r = el.rx ? ` rx="${num(el.rx)}"` : "";
      return `<rect x="${num(el.x)}" y="${num(el.y)}" width="${num(el.w)}" height="${num(el.h)}"${r} fill="${esc(el.fill)}" stroke="${esc(el.stroke)}" stroke-width="${num(el.strokeWidth)}"/>`;
    }
    case "image":
      return withAttrs(
        placeAsset({ assetId: el.asset, text: assets[el.asset], x: el.x, y: el.y, w: el.size?.[0], h: el.size?.[1], rot: el.rot ?? 0 }),
        el.id,
      );
    case "led": {
      // 底座（灭态美术）+ 运行时画的亮点
      const a = byId(el.asset);
      const [x, y] = [el.center[0] - a.size_mm[0] / 2, el.center[1] - a.size_mm[1] / 2];
      return withAttrs(placeAsset({ assetId: el.asset, text: assets[el.asset], x, y }), el.id);
    }
    case "button": {
      const a = byId(el.asset);
      const [x, y] = [el.center[0] - a.size_mm[0] / 2, el.center[1] - a.size_mm[1] / 2];
      return withAttrs(placeAsset({ assetId: el.asset, text: assets[el.asset], x, y }), el.id);
    }
    default:
      return "";
  }
}

/** 给元素打上 data-elid，预览里用于命中测试 */
const withAttrs = (svg, id) => svg.replace("<svg ", `<svg data-elid="${esc(id)}" `);

function ledCircle(el, lit) {
  const color = lit ? el.on_color : el.off_color;
  return (
    `<circle data-elid="${esc(el.id)}" data-control="led" cx="${num(el.center[0])}" cy="${num(el.center[1])}" ` +
    `r="${num(el.radius)}" fill="${esc(color)}"/>`
  );
}

function knobSprite(el, assets, values) {
  const [w, h] = el.image_size;
  const value = values[el.id] ?? el.value ?? 0.5;
  const angle = (value - 0.5) * el.travel_deg; // 指针朝上 ⇔ 参数 0.5（E60 契约）
  return withAttrs(
    placeAsset({
      assetId: el.asset,
      text: assets[el.asset],
      x: el.center[0] - w / 2,
      y: el.center[1] - h / 2,
      w,
      h,
      rot: angle,
    }),
    el.id,
  ).replace("<svg ", `<svg data-control="knob" `);
}

function toggleSprite(el, assets, values) {
  const on = values[el.id] ?? el.state ?? false;
  const assetId = on ? el.image_down : el.image_up;
  const y = on ? el.y_down : el.y_up;
  return withAttrs(placeAsset({ assetId, text: assets[assetId], x: el.x, y, w: el.width, h: el.height }), el.id).replace(
    "<svg ",
    `<svg data-control="toggle" `,
  );
}

/**
 * 按下反馈：**照抄运行时**（crates/rustomp-gui/src/lib.rs 的 buttons 分支）——
 * 先用背景色方块抹掉原位，再把同样的美术按 press_scale 居中贴回。
 * 预览必须复刻这个行为，否则设计器里好看、装进宿主里却不一样。
 */
function buttonPress(el, assets, bg) {
  const a = byId(el.asset);
  const [x, y] = [el.center[0] - a.size_mm[0] / 2, el.center[1] - a.size_mm[1] / 2];
  const s = el.press_scale;
  const [cx, cy] = el.center;
  const r = el.radius;
  return (
    `<rect x="${num(cx - r)}" y="${num(cy - r)}" width="${num(r * 2)}" height="${num(r * 2)}" fill="${esc(bg)}"/>` +
    `<g transform="translate(${num(cx)} ${num(cy)}) scale(${num(s)}) translate(${num(-cx)} ${num(-cy)})">` +
    placeAsset({ assetId: el.asset, text: assets[el.asset], x, y }) +
    `</g>`
  );
}

/** 运行时需要的贴图（PNG）清单：{ file, mm:[w,h], source } */
export function spritePlan(doc) {
  const plan = [];
  const [W, H] = doc.canvas.canvas_mm;
  plan.push({ file: "panel.png", mm: [W, H], from: "panel.svg" });

  const knobs = new Map();
  for (const el of doc.elements.filter((e) => e.kind === "knob")) knobs.set(el.asset, el.image_size);
  for (const [asset, size] of knobs) plan.push({ file: `${asset}.png`, mm: size, from: `asset ${asset}` });

  const toggles = new Map();
  for (const el of doc.elements.filter((e) => e.kind === "toggle")) {
    for (const key of ["image_up", "image_down"]) {
      toggles.set(el[key], [el.width, el.height]);
    }
  }
  for (const [asset, mm] of toggles) plan.push({ file: `${asset}.png`, mm, from: `asset ${asset}` });
  return plan;
}

/** `[assets]` + `[ui]` 标记块（D-002/D-007） */
export function uiToml(doc) {
  const [W, H] = doc.canvas.canvas_mm;
  const px = doc.canvas.px_per_mm;
  const L = [];
  L.push("# >>> rustomp-box-designer（自动生成，勿手改；改请回设计器）");
  L.push("[assets]");
  L.push('panel = "assets/panel.png"');
  for (const p of spritePlan(doc)) {
    if (p.file === "panel.png") continue;
    L.push(`${p.file.replace(/\.png$/, "")} = "assets/${p.file}"`);
  }
  L.push("");
  L.push("[ui]");
  L.push(`# 素材坐标 = 毫米（1 单位 = 1 mm）；面板 ${num(W)} x ${num(H)} mm，导出 ${px} px/mm`);
  L.push(`svg_width = ${num(W)}`);
  L.push(`svg_height = ${num(H)}`);
  L.push(`window_width = ${Math.round(doc.canvas.window_px?.[0] ?? W * 6)}`);
  L.push(`window_height = ${Math.round(doc.canvas.window_px?.[1] ?? H * 6)}`);
  L.push(`background = "${doc.canvas.background}"`);

  const arr = (t) => (v) => `[${num(v[0])}, ${num(v[1])}]`;
  const vec = arr();

  for (const el of doc.elements.filter((e) => e.kind === "knob")) {
    L.push("");
    L.push("[[ui.knobs]]");
    L.push(`id = "${esc(el.id)}"`);
    L.push(`param = "${esc(el.param)}"`);
    L.push(`center = ${vec(el.center)}`);
    L.push(`radius = ${num(el.radius)}`);
    L.push(`asset = "${esc(el.asset)}"`);
    L.push(`image_size = ${vec(el.image_size)}`);
    L.push(`render = "rotate"`);
    L.push(`travel_deg = ${num(el.travel_deg)}`);
    L.push(`drag_full_range_px = ${num(el.drag_full_range_px)}`);
  }
  for (const el of doc.elements.filter((e) => e.kind === "led")) {
    L.push("");
    L.push("[[ui.leds]]");
    L.push(`param = "${esc(el.param)}"`);
    L.push(`center = ${vec(el.center)}`);
    L.push(`radius = ${num(el.radius)}`);
    L.push(`off_color = "${esc(el.off_color)}"`);
    L.push(`on_color = "${esc(el.on_color)}"`);
  }
  for (const el of doc.elements.filter((e) => e.kind === "toggle")) {
    L.push("");
    L.push("[[ui.toggles]]");
    L.push(`param = "${esc(el.param)}"`);
    L.push(`image_up = "${esc(el.image_up)}"`);
    L.push(`image_down = "${esc(el.image_down)}"`);
    L.push(`x = ${num(el.x)}`);
    L.push(`y_up = ${num(el.y_up)}`);
    L.push(`y_down = ${num(el.y_down)}`);
    L.push(`width = ${num(el.width)}`);
    L.push(`height = ${num(el.height)}`);
    L.push(`pivot = ${vec(el.pivot)}`);
    L.push(`press_scale = ${num(el.press_scale)}`);
  }
  for (const el of doc.elements.filter((e) => e.kind === "button")) {
    L.push("");
    L.push("[[ui.buttons]]");
    L.push(`param = "${esc(el.param)}"`);
    L.push(`center = ${vec(el.center)}`);
    L.push(`radius = ${num(el.radius)}`);
    L.push(`press_scale = ${num(el.press_scale)}`);
  }

  L.push("# <<< rustomp-box-designer");
  return L.join("\n") + "\n";
}

/** 从 rustomp.toml 读 `[[params]]`（只读 id/name/type，喂给控件下拉） */
export function parseParams(tomlText) {
  const params = [];
  const blocks = tomlText.split(/^\s*\[\[params\]\]\s*$/m).slice(1);
  for (const block of blocks) {
    const body = block.split(/^\s*\[/m)[0];
    const get = (k) => {
      const m = new RegExp(`^\\s*${k}\\s*=\\s*"?([^"\\n]*)"?`, "m").exec(body);
      return m ? m[1].trim() : undefined;
    };
    const id = get("id");
    if (id) params.push({ id, name: get("name") ?? id, type: get("type") ?? "float", default: get("default") });
  }
  return params;
}

/** 选中元素的外接框（给预览上的选中框用） */
export const elementBox = (el) => bbox(el);

export { M as PT_TO_MM };
