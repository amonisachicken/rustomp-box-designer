// `.box.json` 的数据模型：默认文档、元素工厂、校验（docs/00-decisions.md D-002/D-004）
import { byId } from "./assets.gen.js";

export const VERSION = 1;

/**
 * 画布预设（**竖放**：面板的可见面，= 素材坐标系）。
 * `outer_mm` 是外壳外尺寸（横放标注），`canvas_mm` 是竖起来以后的面板宽×高。
 * 外尺寸 ≠ 面板尺寸见 05-spec-review §1.6。
 */
export const PRESETS = {
  "1590B": { outer_mm: [112, 60], canvas_mm: [60, 112] },
  "125B": { outer_mm: [122, 66], canvas_mm: [66, 122] },
  "1590BB": { outer_mm: [120, 94], canvas_mm: [94, 120] },
  custom: { outer_mm: [112, 60], canvas_mm: [60, 112] },
};

export const LAYERS = [
  { id: "background", name: "背景" },
  { id: "artwork", name: "装饰" },
  { id: "silkscreen", name: "丝印" },
  { id: "knobs", name: "旋钮" },
  { id: "toggles", name: "拨杆" },
  { id: "leds", name: "LED" },
  { id: "buttons", name: "脚踏" },
];

/** 新建文档 */
export function newDoc({ name = "未命名面板", preset = "1590B", params = [] } = {}) {
  const p = PRESETS[preset] ?? PRESETS["1590B"];
  const [w, h] = p.canvas_mm;
  return {
    version: VERSION,
    name,
    canvas: {
      preset,
      outer_mm: p.outer_mm,
      canvas_mm: p.canvas_mm,
      px_per_mm: 12, // 导出素材密度
      window_px: [Math.round(w * 6), Math.round(h * 6)], // 逻辑窗口 = mm × 6
      background: "#faf1e0",
      ink: "#231815",
    },
    params, // 从 rustomp.toml 读来的 [[params]]（D-009），只读
    elements: [],
    // 视图/图层状态（D1）：不影响导出，只影响编辑
    view: {
      safe_margin_mm: 4, // 面板边缘的安全区（丝印/控件别贴边）
      snap_mm: 0.5, // 拖动吸附步长
      snap_to_targets: true, // 吸附到画布中线/其它控件的中线
      show_safe: true,
    },
    layers: {}, // { [layerId]: { hidden: false, locked: false } }
    nextId: 1,
  };
}

const uid = (doc, kind) => `${kind}${doc.nextId++}`;

/** 元素工厂：四类控件 + 两类纯美术 */
export const factory = {
  /** 旋钮（运行时整图旋转；指针朝上 = 0.5） */
  knob(doc, { asset = "knob_round_dark", param = "", center = [30, 30], travel_deg = 270 } = {}) {
    const a = byId(asset);
    return {
      id: uid(doc, "k"),
      kind: "knob",
      asset,
      param,
      center,
      radius: +(a.size_mm[0] / 2).toFixed(2),
      image_size: a.size_mm,
      travel_deg,
      drag_full_range_px: 260,
    };
  },

  /** 拨杆（两态各一张贴图；两态锚点归一化后 y_up == y_down） */
  toggle(doc, { pair = "toggle_small", param = "", x = 25, y = 40 } = {}) {
    const up = byId(`${pair}_up`);
    const down = byId(`${pair}_down`);
    const w = up.size_mm[0];
    const h = up.size_mm[1];
    return {
      id: uid(doc, "t"),
      kind: "toggle",
      param,
      image_up: `${pair}_up`,
      image_down: `${pair}_down`,
      // x = 贴图左边；y_up / y_down = 贴图顶边（素材本身两态对齐，故相同）
      x,
      y_up: y,
      y_down: y,
      width: w,
      height: h,
      pivot: [+(x + w / 2).toFixed(2), +(y + h / 2).toFixed(2)],
      press_scale: 0.9,
      state: false,
    };
  },

  /** LED（底座压进底图，亮点由运行时画） */
  led(doc, { asset = "led_red", param = "clip_indicator", center = [30, 10] } = {}) {
    const a = byId(asset);
    const color = { led_red: ["#800000", "#ff0000"], led_green: ["#003800", "#00e000"], led_blue: ["#001a40", "#0080ff"] }[asset];
    return {
      id: uid(doc, "l"),
      kind: "led",
      asset,
      param,
      center,
      radius: a.r_inner_mm ?? +(a.size_mm[0] / 2).toFixed(3),
      off_color: color?.[0] ?? "#800000",
      on_color: color?.[1] ?? "#ff0000",
      lit: false,
    };
  },

  /** 脚踏（常态美术压进底图；按住态用它自己的贴图） */
  button(doc, { asset = "3pdt_alt", param = "bypass", center = [30, 85] } = {}) {
    const a = byId(asset);
    return {
      id: uid(doc, "b"),
      kind: "button",
      asset,
      image_hold: a.hold ?? "",
      image_size: a.size_mm,
      param,
      center,
      // 命中半径必须 ≥ 美术半径（按下时要擦掉这块）
      radius: +(a.size_mm[0] / 2).toFixed(2),
      press_scale: 0.9,
      pressed: false,
    };
  },

  /** 纯美术/丝印：引用一个素材（label/形状/logo），左上角定位 */
  image(doc, { asset = "label_gain", x = 20, y = 20, rot = 0, layer = "silkscreen" } = {}) {
    const a = byId(asset);
    return { id: uid(doc, "i"), kind: "image", asset, x, y, rot, layer, size: a.size_mm };
  },

  /** 矩形（底板/色块） */
  rect(doc, { x = 0, y = 0, w = 20, h = 10, rx = 0, fill = "none", stroke = "#231815", strokeWidth = 0.35, layer = "artwork" } = {}) {
    return { id: uid(doc, "r"), kind: "rect", x, y, w, h, rx, fill, stroke, strokeWidth, layer };
  },
};

/** 每个元素在哪一层 */
export function layerOf(el) {
  if (el.kind === "knob") return "knobs";
  if (el.kind === "toggle") return "toggles";
  if (el.kind === "led") return "leds";
  if (el.kind === "button") return "buttons";
  return el.layer ?? "silkscreen";
}

/** 元素的外接框（mm），用于选中高亮与拖拽命中 */
export function bbox(el) {
  switch (el.kind) {
    case "knob":
    case "led":
    case "button": {
      const r = el.kind === "knob" ? el.radius : el.radius;
      return { x: el.center[0] - r, y: el.center[1] - r, w: r * 2, h: r * 2 };
    }
    case "toggle":
      return { x: el.x, y: el.y_up, w: el.width, h: el.height };
    case "image":
      return { x: el.x, y: el.y, w: el.size[0], h: el.size[1] };
    default:
      return { x: el.x, y: el.y, w: el.w, h: el.h };
  }
}

/** 移动元素（统一入口，避免每个调用点各写一份分支） */
export function move(el, dx, dy) {
  switch (el.kind) {
    case "knob":
    case "led":
    case "button":
      el.center = [round2(el.center[0] + dx), round2(el.center[1] + dy)];
      break;
    case "toggle":
      el.x = round2(el.x + dx);
      el.y_up = round2(el.y_up + dy);
      el.y_down = round2(el.y_down + dy);
      el.pivot = [round2(el.pivot[0] + dx), round2(el.pivot[1] + dy)];
      break;
    default:
      el.x = round2(el.x + dx);
      el.y = round2(el.y + dy);
  }
}

/** 以 bbox 中心为基准缩放（旋钮直径 / LED 半径 / 脚踏半径） */
export function resize(el, factor) {
  if (el.kind === "knob") {
    el.image_size = [round2(el.image_size[0] * factor), round2(el.image_size[1] * factor)];
    el.radius = round2(el.image_size[0] / 2);
  } else if (el.kind === "led" || el.kind === "button") {
    el.radius = round2(el.radius * factor);
  }
}

const round2 = (v) => Math.round(v * 100) / 100;
export const snap = (v, step = 0.5) => Math.round(v / step) * step;

/** 校验：导出前挡住"引用了不存在的参数/素材"（D-009） */
export function validate(doc) {
  const problems = [];
  const params = new Set((doc.params ?? []).map((p) => p.id));
  const virtual = new Set(["clip_indicator"]);
  const seen = new Set();

  if (!(doc.canvas.canvas_mm[0] > 0 && doc.canvas.canvas_mm[1] > 0)) problems.push("画布尺寸不合法");

  for (const el of doc.elements) {
    if (seen.has(el.id)) problems.push(`元素 id 重复：${el.id}`);
    seen.add(el.id);

    if (el.kind === "knob" || el.kind === "toggle" || el.kind === "button" || el.kind === "led") {
      if (!el.param) problems.push(`${el.id}：没有绑定参数`);
      else if (!params.has(el.param) && !(el.kind === "led" && virtual.has(el.param))) {
        problems.push(`${el.id}：参数 "${el.param}" 不在 rustomp.toml 里`);
      }
    }
    if (el.asset && !byId(el.asset)) problems.push(`${el.id}：素材 "${el.asset}" 不存在`);
    if (el.kind === "button" && el.image_hold && !byId(el.image_hold)) {
      problems.push(`${el.id}：按住态素材 "${el.image_hold}" 不存在`);
    }
    if (el.kind === "toggle") {
      if (!byId(el.image_up) || !byId(el.image_down)) problems.push(`${el.id}：拨杆两态素材缺失`);
      if (el.y_up !== el.y_down) problems.push(`${el.id}：两态 y 不一致（会在切换时跳）`);
    }
    if (el.kind === "knob" && el.travel_deg <= 0) problems.push(`${el.id}：travel_deg 必须 > 0`);

    const b = bbox(el);
    const [W, H] = doc.canvas.canvas_mm;
    if (b.x < -1 || b.y < -1 || b.x + b.w > W + 1 || b.y + b.h > H + 1) {
      problems.push(`${el.id}：超出画布（画布 ${W}×${H} mm）`);
    }
  }

  // 素材组合检查：每个控件引用的素材必须存在
  return problems;
}

/** 读回 .box.json（做最小迁移/校验，避免旧文件把 UI 搞崩） */
export function load(text) {
  const doc = JSON.parse(text);
  if (doc.version !== VERSION) throw new Error(`不支持的 .box.json 版本：${doc.version}`);
  doc.params ??= [];
  doc.elements ??= [];
  doc.nextId ??= doc.elements.length + 1;
  return doc;
}

export const save = (doc) => JSON.stringify(doc, null, 2) + "\n";

/** 图层是否为隐藏/锁定（缺省 = 可见可编辑） */
export const layerState = (doc, layer) => doc.layers?.[layer] ?? { hidden: false, locked: false };

/** 元素当前是否可选中/可拖动 */
export function editable(doc, el) {
  const st = layerState(doc, layerOf(el));
  return !st.hidden && !st.locked;
}

/**
 * 吸附：给定一个正在拖动的元素的新 bbox，找出最近的吸附目标。
 *
 * 目标 = 画布中线/边 + 其它元素的中线/边 + 安全边距线。
 * 返回 { dx, dy, guides: [{axis, at}] }（dx/dy 是要额外补的位移）。
 */
export function snapTargets(doc, el, threshold = 1.2) {
  const b = bbox(el);
  const [W, H] = doc.canvas.canvas_mm;
  const m = doc.view?.safe_margin_mm ?? 0;
  const xs = [0, W / 2, W, m, W - m];
  const ys = [0, H / 2, H, m, H - m];
  for (const o of doc.elements) {
    if (o.id === el.id) continue;
    const ob = bbox(o);
    xs.push(ob.x, ob.x + ob.w / 2, ob.x + ob.w);
    ys.push(ob.y, ob.y + ob.h / 2, ob.y + ob.h);
  }
  const candX = [b.x, b.x + b.w / 2, b.x + b.w];
  const candY = [b.y, b.y + b.h / 2, b.y + b.h];

  let best = { dx: 0, dy: 0, dist: threshold, guides: [] };
  for (const cx of candX) {
    for (const tx of xs) {
      const d = Math.abs(tx - cx);
      if (d < best.dist) best = { dx: tx - cx, dy: 0, dist: d, guides: [{ axis: "x", at: tx }] };
    }
  }
  let bestY = { dy: 0, dist: threshold, guides: [] };
  for (const cy of candY) {
    for (const ty of ys) {
      const d = Math.abs(ty - cy);
      if (d < bestY.dist) bestY = { dy: ty - cy, dist: d, guides: [{ axis: "y", at: ty }] };
    }
  }
  return {
    dx: best.dx,
    dy: bestY.dy,
    guides: [...best.guides, ...bestY.guides],
  };
}
