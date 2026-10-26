// 导出：.box.json → 面板 SVG / 控件贴图清单 / rustomp.toml 片段
//
// 全部是纯函数（不碰 DOM），所以 Node 脚本和浏览器可以共用同一份代码 ——
// 预览与导出必然一致（docs/00-decisions.md D-001）。
import { byId } from "./assets.gen.js";
import { placeAsset } from "./embed.js";
import { layerOf, bbox, ledRadius, buttonRadius } from "./model.js";

const M = 25.4 / 72; // pt → mm

/** 数字格式化：最多 3 位小数，去掉尾随 0（TOML/SVG 都要稳定文本，便于 diff） */
export function num(v) {
  if (!Number.isFinite(v)) throw new Error(`非有限数：${v}`);
  const s = v.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
  return s === "-0" ? "0" : s;
}

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** 抽稀：只保留每层里真正"压进底图"的元素 */
const flattenable = (el) => ["rect", "frame", "image", "led", "button"].includes(el.kind);

/**
 * 面板 SVG。
 *
 * @param doc        .box.json
 * @param assets     { [assetId]: svgText }
 * @param opts.controls  是否把旋钮/拨杆也画出来（预览用；导出底图时不要）
 * @param opts.values    预览时的参数值 { [elementId]: 0..1 | bool }
 */
export function panelSvg(doc, assets, opts = {}) {
  const { controls = false, values = {}, bypassed = false, dimLayers = null } = opts;
  // 非焦点图层整体降低不透明度（画布上"虚化"，但仍可见位置）
  const wrap = (layer, html) => (dimLayers?.has(layer) ? `<g opacity="0.28">${html}</g>` : html);
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
      out.push(wrap(layer, flattenElement(el, assets, values, doc.canvas.canvas_mm)));
    }
  }

  if (controls) {
    // 之后按运行时的绘制顺序：LED → 旋钮 → 拨杆 → 脚踏按下反馈
    for (const el of doc.elements.filter((e) => e.kind === "led")) {
      out.push(wrap("leds", ledCircle(el, values[el.id] ?? el.lit, bypassed)));
    }
    for (const el of doc.elements.filter((e) => e.kind === "knob")) {
      out.push(wrap("knobs", knobSprite(el, assets, values)));
    }
    for (const el of doc.elements.filter((e) => e.kind === "toggle")) {
      out.push(wrap("toggles", toggleSprite(el, assets, values)));
    }
    for (const el of doc.elements.filter((e) => e.kind === "button")) {
      if (values[el.id]) out.push(wrap("buttons", buttonPress(el, assets, doc.canvas.background)));
    }
  }

  out.push("</svg>");
  return out.join("\n") + "\n";
}

function flattenElement(el, assets, values, canvas) {
  switch (el.kind) {
    case "frame": {
      // 面板边框：贴画布，只暴露内缩/圆角/线宽
      const [W, H] = canvas ?? [60, 112];
      const m = el.margin ?? 1.2;
      const w = Math.max(0, W - m * 2);
      const h = Math.max(0, H - m * 2);
      return (
        `<rect data-elid="${esc(el.id)}" x="${num(m)}" y="${num(m)}" width="${num(w)}" height="${num(h)}" ` +
        `rx="${num(el.rx)}" fill="none" stroke="${esc(el.stroke)}" stroke-width="${num(el.strokeWidth)}" ` +
        `pointer-events="all" stroke-linejoin="round"/>`
      );
    }
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

/**
 * 旁通态的灯色：照抄运行时（`rustomp-gui::led_grey`）—— 去色 + 抬亮度到"没通电的灰灯珠"。
 * 灯表示"这台效果器在不在工作"，所以旁通时不跟随音频闪。
 */
export function greyColor(offHex) {
  const h = offHex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;
  const l = Math.round(lum * 0.6 + 90);
  return `rgb(${l},${l},${l})`;
}

function ledCircle(el, lit, bypassed = false) {
  const color = bypassed ? greyColor(el.off_color) : lit ? el.on_color : el.off_color;
  return (
    `<circle data-elid="${esc(el.id)}" data-control="led" cx="${num(el.center[0])}" cy="${num(el.center[1])}" ` +
    `r="${num(ledRadius(el))}" fill="${esc(color)}"/>`
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
  const [cx, cy] = el.center;
  const r = buttonRadius(el);
  const erase = `<rect x="${num(cx - r)}" y="${num(cy - r)}" width="${num(r * 2)}" height="${num(r * 2)}" fill="${esc(bg)}"/>`;

  // 有按住态贴图 → 整张换上（与运行时一致，不缩放）
  if (el.image_hold && assets[el.image_hold]) {
    const a = byId(el.image_hold);
    const [w, h] = el.image_size ?? a.size_mm;
    return (
      erase +
      placeAsset({ assetId: el.image_hold, text: assets[el.image_hold], x: cx - w / 2, y: cy - h / 2, w, h })
    );
  }
  // 兜底：把原美术缩小贴回（旧行为）
  const a = byId(el.asset);
  const [x, y] = [cx - a.size_mm[0] / 2, cy - a.size_mm[1] / 2];
  return (
    erase +
    `<g transform="translate(${num(cx)} ${num(cy)}) scale(${num(el.press_scale ?? 0.9)}) translate(${num(-cx)} ${num(-cy)})">` +
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

  // 按住态贴图（脚踏）
  const holds = new Set();
  for (const el of doc.elements.filter((e) => e.kind === "button" && e.image_hold)) holds.add(el.image_hold);
  for (const asset of holds) {
    const a = byId(asset);
    plan.push({ file: `${asset}.png`, mm: a.size_mm, from: `asset ${asset}` });
  }

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
    L.push(`radius = ${num(el.image_size[0] / 2)}`); // 命中半径 = 贴图宽/2（不给用户改）
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
    L.push(`radius = ${num(ledRadius(el))}`); // = 素材镜片半径，不给用户调
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
    L.push(`radius = ${num(buttonRadius(el))}`); // = 美术宽/2（必须盖住美术）
    L.push(`press_scale = 0.9`); // 只在"没有按住态贴图"时兜底用；有贴图时整张换
    if (el.image_hold) {
      L.push(`image_hold = "${esc(el.image_hold)}"`);
      L.push(`image_size = ${vec(el.image_size)}`);
    }
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
