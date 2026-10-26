// 设计器主程序：素材库 → 画布（SVG 预览 = 导出同一份代码）→ 属性面板 → 导出
import { ASSETS, SWITCH_PAIRS, FOOTSWITCHES, byId, byKind } from "./assets.gen.js";
import {
  newDoc,
  factory,
  validate,
  move,
  resize,
  snap,
  bbox,
  layerOf,
  load,
  save,
  PRESETS,
  LAYERS,
  KIND_LAYER,
  layerState,
  editable,
  snapTargets,
  alignMoves,
  distributeMoves,
  duplicate,
  unionBox,
  toggleDy,
  syncTogglePivot,
  importSvg,
  assetInfo,
  mergedAssets,
  paramChoices,
  INDICATORS,
  ledRadius,
  buttonRadius,
} from "./model.js";
import { panelSvg, uiToml, parseParams, num } from "./exporter.js";

const $ = (s) => document.querySelector(s);
const state = {
  doc: newDoc({ name: "未命名面板" }),
  assets: {}, // id → svg 文本
  selection: [], // 选中的元素 id（多选）
  mode: "edit",
  values: {}, // 预览态：元素 id → 数值/布尔
  guides: [], // 预留：吸附参考线（拖动已禁用，暂不产生）
  bypassed: false, // 预览态的旁通开关（点脚踏切换，同真插件）
  focus: null, // 焦点图层（null = 不聚焦，全部可编辑）
  past: [], // 撤销栈（文档快照）
  future: [], // 重做栈
};

// ---------- 素材预载（预览要按需内联素材 SVG，必须离线也有文本） ----------
async function loadAssets() {
  await Promise.all(
    ASSETS.map(async (a) => {
      const r = await fetch(a.file);
      if (!r.ok) throw new Error(`读不到素材 ${a.file}`);
      state.assets[a.id] = await r.text();
    }),
  );
}

// ---------- 渲染 ----------
function render() {
  const stage = $("#stage");
  const [W, H] = state.doc.canvas.canvas_mm;

  // 画布按容器高度适配，宽度按比例
  const wrapH = $("#canvasWrap").clientHeight - 28;
  const scale = Math.min(wrapH / H, ($("#canvasWrap").clientWidth - 28) / W);
  stage.style.width = `${Math.round(W * scale)}px`;
  stage.style.height = `${Math.round(H * scale)}px`;

  // 编辑时也要画旋钮/拨杆（否则看不见自己在拖什么）；导出底图时才排除它们
  const doc = visibleDoc();
  const svg = panelSvg(doc, mergedAssets(state.doc, state.assets), {
    controls: true,
    values: state.mode === "preview" ? state.values : {},
    bypassed: state.mode === "preview" && state.bypassed,
    dimLayers: state.mode === "preview" ? null : dimLayers(),
  });
  stage.innerHTML = svg + selectionOverlay() + overlay();
  $("#stage svg").setAttribute("preserveAspectRatio", "xMidYMid meet");

  $("#stCount").textContent = state.doc.elements.length;
  if (document.getElementById("layerList")) renderLayers();
  $("#stCanvas").textContent = `${W} × ${H} mm`;
  $("#stDensity").textContent = `${state.doc.canvas.px_per_mm} px/mm`;
  $("#docName").value = state.doc.name;
}

function selectionOverlay() {
  const els = selectedElements();
  if (!els.length) return "";
  const out = els.map((el) => {
    const b = bbox(el);
    return `<rect class="sel" x="${num(b.x - 1)}" y="${num(b.y - 1)}" width="${num(b.w + 2)}" height="${num(b.h + 2)}" rx="1.5"/>`;
  });
  // 多选时再画一个联合外接框
  if (els.length > 1) {
    const u = unionBox(els);
    out.push(
      `<rect class="sel union" x="${num(u.x - 1.5)}" y="${num(u.y - 1.5)}" width="${num(u.w + 3)}" height="${num(u.h + 3)}" rx="2"/>`,
    );
  }
  return out.join("");
}

const selectedElements = () => state.doc.elements.filter((e) => state.selection.includes(e.id));

/** 是否可编辑：有焦点、所在图层没隐藏、且就是焦点图层 */
function canEdit(el) {
  return !!state.focus && editable(state.doc, el) && layerOf(el) === state.focus;
}

/**
 * 不是焦点的图层 → 传给导出器做虚化。
 *
 * **没有焦点时全部虚化**（焦点是"当前在改哪一层"的唯一入口），
 * 这样不会出现"以为在改 A 层，其实动的是 B 层"。
 */
const dimLayers = () => new Set(LAYERS.map((l) => l.id).filter((id) => id !== state.focus));

/** 只保留"没被隐藏"的元素给渲染用（导出不走这里，导出是另一条路径） */
function visibleDoc() {
  const hidden = (el) => layerState(state.doc, layerOf(el)).hidden;
  return { ...state.doc, elements: state.doc.elements.filter((el) => !hidden(el)) };
}

function overlay() {
  const [W, H] = state.doc.canvas.canvas_mm;
  const g = [];
  // 5 mm 网格
  for (let x = 0; x <= W; x += 5) g.push(`<line x1="${x}" y1="0" x2="${x}" y2="${H}"/>`);
  for (let y = 0; y <= H; y += 5) g.push(`<line x1="0" y1="${y}" x2="${W}" y2="${y}"/>`);
  const out = [`<g class="grid" pointer-events="none">${g.join("")}</g>`];

  // 安全边距
  const v = state.doc.view ?? {};
  const m = v.safe_margin_mm ?? 4;
  if (v.show_safe !== false) {
    out.push(
      `<rect class="safe" pointer-events="none" x="${m}" y="${m}" width="${W - m * 2}" height="${H - m * 2}" rx="1.5"/>`,
    );
  }
  // 吸附线
  for (const gd of state.guides) {
    out.push(
      gd.axis === "x"
        ? `<line class="guide" pointer-events="none" x1="${gd.at}" y1="0" x2="${gd.at}" y2="${H}"/>`
        : `<line class="guide" pointer-events="none" x1="0" y1="${gd.at}" x2="${W}" y2="${gd.at}"/>`,
    );
  }
  return out.join("");
}

// ---------- 撤销 / 重做 ----------
const HISTORY_MAX = 60;

/** 在改动**之前**调用：把当前文档压进撤销栈 */
function commit() {
  state.past.push(JSON.stringify(state.doc));
  if (state.past.length > HISTORY_MAX) state.past.shift();
  state.future.length = 0;
}

function undo() {
  if (!state.past.length) return;
  state.future.push(JSON.stringify(state.doc));
  state.doc = load(state.past.pop());
  state.selection = [];
  render();
  renderInspector();
}

function redo() {
  if (!state.future.length) return;
  state.past.push(JSON.stringify(state.doc));
  state.doc = load(state.future.pop());
  state.selection = [];
  render();
  renderInspector();
}

// ---------- 素材库 ----------
const KIND_TITLE = {
  knob: "旋钮",
  toggle: "拨杆（两态）",
  led: "LED",
  button: "脚踏",
  silkscreen: "丝印（内置标签）",
  artwork: "装饰（导入）",
  silk_import: "丝印（导入）",
};

/** 导入素材的缩略图（内联 SVG，省一次请求） */
function svgThumb(svg) {
  return `<div class="thumb">${svg}</div>`;
}

function renderLibrary() {
  const imp = state.doc.imported ?? [];
  const groups = {
    knob: byKind("knob"),
    toggle: Object.keys(SWITCH_PAIRS),
    led: byKind("led"),
    button: FOOTSWITCHES,
    silkscreen: byKind("label"),
    artwork: imp.filter((a) => a.kind === "artwork"),
    silk_import: imp.filter((a) => a.kind === "silkscreen"),
  };
  const html = Object.entries(groups)
    .map(([kind, items]) => {
      // 每组的"图层"：label/丝印导入 → silkscreen；装饰导入 → artwork
      const groupLayer = { knob: "knobs", toggle: "toggles", led: "leds", button: "buttons", silkscreen: "silkscreen", silk_import: "silkscreen", artwork: "artwork" }[kind];
      const dimmed = groupLayer !== state.focus;
      if (!items.length && kind !== "artwork" && kind !== "silk_import") return "";
      const cells = items
        .map((it) => {
          const id = typeof it === "string" ? it : it.id;
          if (kind === "artwork" || kind === "silk_import") {
            // 导入素材：直接内联 SVG 当缩略图
            const a = imp.find((x) => x.id === id);
            return `<div class="asset${dimmed ? " dimmed" : ""}" data-add="imported" data-id="${id}" data-layer="${a.kind}" title="${id}">
              ${svgThumb(a.svg)}<span>${id.replace(/^imp_/, "")}</span></div>`;
          }
          const file = kind === "toggle" ? byId(SWITCH_PAIRS[id].up).file : byId(id).file;
          const wide = kind === "silkscreen" ? " wide" : "";
          return `<div class="asset${wide}${dimmed ? " dimmed" : ""}" data-add="${kind}" data-id="${id}" title="${id}">
            <img src="${file}" alt="${id}"/><span>${id.replace(/^label_/, "")}</span></div>`;
        })
        .join("");
      if (!cells) return "";
      return `<h3>${KIND_TITLE[kind]}</h3><div class="asset-grid">${cells}</div>`;
    })
    .join("");
  $("#assetList").innerHTML = html;
}

// 双击新建（单击只用来"看"，避免误触）
$("#assetList").addEventListener("dblclick", (e) => {
  const cell = e.target.closest("[data-add]");
  if (!cell) return;
  addElement(cell.dataset.add, cell.dataset.id);
});

/** 切焦点图层；点已聚焦的那个 = 取消聚焦（全部可编辑） */
function setFocus(layer) {
  state.focus = state.focus === layer ? null : layer;
  // 焦点外的选中项要清掉
  state.selection = state.selection.filter((id) => {
    const el = state.doc.elements.find((e) => e.id === id);
    return el && canEdit(el);
  });
  renderLibrary();
  render();
  renderLayers();
  renderInspector();
  $("#stHint").textContent = state.focus
    ? `焦点：${LAYERS.find((l) => l.id === state.focus)?.name}（其它图层已虚化、不可选；再点一次退出）`
    : "未聚焦：全部图层可编辑";
}

// ---------- 图层：显隐 / 锁定 ----------
function renderLayers() {
  const rows = LAYERS.map((l) => {
    const st = layerState(state.doc, l.id);
    const n = state.doc.elements.filter((e) => layerOf(e) === l.id).length;
    const cls = [st.hidden ? "off" : "", state.focus === l.id ? "focus" : ""].filter(Boolean).join(" ");
    return `<div class="layer ${cls}" data-layer="${l.id}" title="点名字聚焦（只编辑这一层）">
      <button data-act="hidden" class="${st.hidden ? "" : "on"}" title="显示/隐藏">${st.hidden ? "○" : "●"}</button>
      <span class="name">${l.name}</span><span style="opacity:.5">${n || ""}</span>
    </div>`;
  }).join("");
  $("#layerList").innerHTML = rows;
}

$("#layerList").addEventListener("click", (e) => {
  const row = e.target.closest("[data-layer]");
  if (!row) return;
  const id = row.dataset.layer;
  const btn = e.target.closest("button[data-act]");
  if (btn?.dataset.act === "hidden") {
    const st = { ...layerState(state.doc, id), hidden: !layerState(state.doc, id).hidden };
    commit();
    state.doc.layers = { ...(state.doc.layers ?? {}), [id]: st };
    if (st.hidden) state.selection = [];
    renderLibrary();
    render();
    renderLayers();
    renderInspector();
    return;
  }
  setFocus(id); // 点名字/行 = 聚焦该图层
});

/** 画布中心（毫米，取整）——新元素一律出现在这里 */
const canvasCenter = () => [
  Math.floor(state.doc.canvas.canvas_mm[0] / 2),
  Math.floor(state.doc.canvas.canvas_mm[1] / 2),
];

function addElement(kind, id) {
  try {
    addElementInner(kind, id);
  } catch (err) {
    $("#stHint").textContent = `⚠ 添加失败：${err.message}`;
  }
}

function addElementInner(kind, id) {
  const d = state.doc;
  const [cx, cy] = canvasCenter();
  // 默认参数必须类型匹配（旋钮→float、拨杆/脚踏→bool、LED→指示量）
  const firstParam = (k) => {
    const list = paramChoices(d, k);
    return list[0] ?? (k === "led" ? INDICATORS[0] : "");
  };
  let el;
  // 一律以画布中心为基准（贴图类按中心反推左上角）
  if (kind === "knob") el = factory.knob(d, { asset: id, param: firstParam("knob"), center: [cx, cy] });
  else if (kind === "toggle") {
    const up = byId(SWITCH_PAIRS[id].up);
    el = factory.toggle(d, {
      pair: id,
      param: firstParam("toggle"),
      x: cx - Math.floor(up.size_mm[0] / 2),
      y: cy - Math.floor(up.size_mm[1] / 2),
    });
  } else if (kind === "led") el = factory.led(d, { asset: id, center: [cx, cy] });
  else if (kind === "button") el = factory.button(d, { asset: id, param: firstParam("button"), center: [cx, cy] });
  else {
    // 内置标签 or 外部导入：统一走 assetInfo（byId 只认识内置清单，导入的 id 是 imp_*）
    const a = assetInfo(state.doc, id);
    if (!a) throw new Error(`素材 ${id} 找不到（内置清单与 imported[] 里都没有）`);
    const layer = kind === "imported" ? a.kind : "silkscreen";
    el = factory.image(state.doc, {
      asset: id,
      x: cx - Math.floor(a.size_mm[0] / 2),
      y: cy - Math.floor(a.size_mm[1] / 2),
      layer,
      size: a.size_mm,
    });
  }
  commit();
  d.elements.push(el);
  state.selection = [el.id];
  // 新元素如果不在当前焦点图层里，自动把焦点切过去（否则"加了但拖不动"）
  if (state.focus && layerOf(el) !== state.focus) state.focus = layerOf(el);
  renderLibrary();
  render();
  renderLayers();
  renderInspector();
}

// ---------- 坐标换算 ----------
function toMm(ev) {
  const svg = $("#stage svg");
  const pt = new DOMPoint(ev.clientX, ev.clientY);
  const p = pt.matrixTransform(svg.getScreenCTM().inverse());
  return [p.x, p.y];
}

// ---------- 画布交互 ----------
let drag = null;

$("#stage").addEventListener("pointerdown", (ev) => {
  const [mx, my] = toMm(ev);
  $("#stCursor").textContent = `${mx.toFixed(2)} / ${my.toFixed(2)} mm`;

  const node = ev.target.closest("[data-elid]");
  const id = node?.dataset.elid;
  const el = state.doc.elements.find((e) => e.id === id);

  if (state.mode === "preview") {
    if (!el) return;
    if (el.kind === "knob") {
      // 纵向拖动改值：向上 = 增大（和真实插件的拖动方向一致）
      drag = { kind: "knob", id, startY: ev.clientY, startValue: state.values[id] ?? el.value ?? 0.5 };
      ev.preventDefault();
    } else if (el.kind === "toggle") {
      state.values[id] = !(state.values[id] ?? el.state);
      render();
    } else if (el.kind === "led") {
      state.values[id] = !(state.values[id] ?? el.lit);
      render();
    } else if (el.kind === "button") {
      state.values[id] = true; // 按下期间显示"按住态"贴图
      render();
      const up = () => {
        state.values[id] = false;
        // 抬起 = 切换旁通（与真插件一致：点按切换，不是按住）
        if (el.param === "bypass") {
          state.bypassed = !state.bypassed;
          $("#stHint").textContent = `预览：${state.bypassed ? "已旁通（LED 变灰、不闪）" : "已在工作"}`;
        }
        render();
        window.removeEventListener("pointerup", up);
      };
      window.addEventListener("pointerup", up);
    }
    return;
  }

  // 编辑模式：只做选中（拖动已禁用）
  if (id && el && canEdit(el)) {
    // Shift/⌘ 点：加入或移除选区
    if (ev.shiftKey || ev.metaKey || ev.ctrlKey) {
      state.selection = state.selection.includes(id)
        ? state.selection.filter((x) => x !== id)
        : [...state.selection, id];
    } else if (!state.selection.includes(id)) {
      state.selection = [id];
    }
  } else if (!(ev.shiftKey || ev.metaKey || ev.ctrlKey)) {
    state.selection = [];
  }
  renderInspector();
  if (!state.selection.length) {
    render();
    return;
  }
  // 拖动已禁用（手感不可控）：位置靠方向键微调 + 右侧属性面板精确输入
  ev.preventDefault();
});

$("#stage").addEventListener("pointermove", (ev) => {
  const [mx, my] = toMm(ev);
  $("#stCursor").textContent = `${mx.toFixed(2)} / ${my.toFixed(2)} mm`;
  if (!drag) return;

  if (drag.kind === "knob") {
    const dv = (drag.startY - ev.clientY) / 200; // 200 px = 全程
    state.values[drag.id] = Math.min(1, Math.max(0, drag.startValue + dv));
    render();
    return;
  }

});

window.addEventListener("pointerup", () => {
  if (drag) state.guides = [];
  drag = null;
});

window.addEventListener("keydown", (ev) => {
  if (ev.target.matches("input, textarea, select")) return;
  const els = selectedElements();
  const step = ev.shiftKey ? 1 : 0.1;
  const nudge = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[ev.key];
  if (nudge && els.length && els.every((e) => canEdit(e))) {
    commit();
    for (const el of els) move(el, ...nudge);
    render();
    renderInspector();
    ev.preventDefault();
  } else if ((ev.key === "Delete" || ev.key === "Backspace") && els.length) {
    commit();
    state.doc.elements = state.doc.elements.filter((e) => !state.selection.includes(e.id));
    state.selection = [];
    render();
    renderInspector();
    ev.preventDefault();
  } else if (ev.key === "Tab") {
    setMode(state.mode === "edit" ? "preview" : "edit");
    ev.preventDefault();
  } else if ((ev.metaKey || ev.ctrlKey) && ev.key.toLowerCase() === "z") {
    ev.shiftKey ? redo() : undo();
    ev.preventDefault();
  } else if ((ev.metaKey || ev.ctrlKey) && ev.key.toLowerCase() === "y") {
    redo();
    ev.preventDefault();
  }
});

// ---------- 属性面板 ----------
function renderInspector() {
  const els = selectedElements();
  const el = els.length === 1 ? els[0] : null;
  const d = state.doc;
  // 只列出**类型匹配**的参数；类型不匹配的当前值也显示出来（带 ⚠），方便发现历史错配
  const paramOptions = (kind, cur) => {
    const allowed = paramChoices(d, kind);
    const list = [...new Set([...allowed, ...(cur ? [cur] : [])])];
    const bad = cur && !allowed.includes(cur);
    return [
      `<option value="" ${!cur ? "selected" : ""}>（未绑定）</option>`,
      ...list.map(
        (p) =>
          `<option value="${p}" ${p === cur ? "selected" : ""}>${p}${cur && p === cur && bad ? " ⚠ 类型不匹配" : ""}</option>`,
      ),
    ].join("");
  };
  const numInput = (label, key, obj = el, opts = {}) =>
    `<div class="row"><label>${label}</label><input type="number" step="${opts.step ?? 1}" data-key="${key}" ${
      opts.obj ? `data-obj="${opts.obj}"` : ""
    } value="${obj?.[key] ?? 0}"/></div>`;

  let body = "";
  if (els.length > 1) {
    // ---- 多选：对齐 / 分布 / 批量操作 ----
    const u = unionBox(els);
    body += `<h3>已选 ${els.length} 个元素</h3>`;
    body += `<p style="font-size:11.5px;color:#6b6156;margin:0 0 6px">
      ${u.w.toFixed(1)} × ${u.h.toFixed(1)} mm（联合外接框）</p>`;
    const btn = (mode, label, title) => `<button data-align="${mode}" title="${title}">${label}</button>`;
    body += `<div class="row"><label>对齐</label><span style="flex:1;display:flex;gap:3px;flex-wrap:wrap">
      ${btn("left", "⇤", "左对齐")}${btn("hcenter", "↔", "水平居中")}${btn("right", "⇥", "右对齐")}
      ${btn("top", "⤒", "顶对齐")}${btn("vcenter", "↕", "垂直居中")}${btn("bottom", "⤓", "底对齐")}
    </span></div>`;
    body += `<div class="row"><label>对画布</label><span style="flex:1;display:flex;gap:3px;flex-wrap:wrap">
      ${["left", "hcenter", "right", "top", "vcenter", "bottom"]
        .map((m) => `<button data-align-canvas="${m}" title="对画布${m}">${m === "hcenter" ? "H" : m === "vcenter" ? "V" : m[0].toUpperCase()}</button>`)
        .join("")}
    </span></div>`;
    body += `<div class="row"><label>等间距</label><span style="flex:1;display:flex;gap:3px">
      <button data-distribute="x">横向</button><button data-distribute="y">纵向</button></span></div>`;
    // 批量改：同类元素共有字段
    const kinds = [...new Set(els.map((e) => e.kind))];

    if (kinds.length === 1 && kinds[0] === "image") {
      body += numInput("旋转 °（全部）", "rot", els[0], { step: 1 });
    }
    body += `<div class="row" style="margin-top:10px"><span style="flex:1"></span>
      <button id="btnDup">复制</button><button id="btnDel">删除</button></div>`;
  } else if (el) {
    body += `<h3>${el.kind} · ${el.id}</h3>`;
    if (["knob", "toggle", "led", "button"].includes(el.kind)) {
      body += `<div class="row"><label>参数</label><select data-key="param">${paramOptions(el.kind, el.param)}</select></div>`;
    }
    if (el.kind === "knob") {
      body += numInput("中心 x", 0, el.center, { obj: "center" }).replace('data-key="0"', 'data-key="0" data-vec="center"');
      body += numInput("中心 y", 1, el.center, { obj: "center" }).replace('data-key="1"', 'data-key="1" data-vec="center"');
      // 尺寸由素材决定（命中半径 = 贴图宽/2），不给调
      body += `<div class="row"><label>尺寸</label><span style="flex:1;font-size:11.5px;color:#6b6156">${el.image_size[0].toFixed(1)} × ${el.image_size[1].toFixed(1)} mm（随素材）</span></div>`;
      body += numInput("行程 °", "travel_deg", el, { step: 5 });
      body += `<div class="row"><label>素材</label><select data-key="asset">${byKind("knob")
        .map((a) => `<option ${a.id === el.asset ? "selected" : ""}>${a.id}</option>`)
        .join("")}</select></div>`;
      if (!el.param) body += `<p class="warn">没绑定参数，导出会被拦下</p>`;
    } else if (el.kind === "toggle") {
      body += numInput("x", "x");
      body += numInput("y", "y_up", el);
      body += `<p class="hint" style="font-size:11.5px;color:#6b6156">y 只影响上半态；下半态自动加 ${(
        el.y_down - el.y_up
      ).toFixed(2)} mm 补偿，保证两态六边形中心重合</p>`;
    } else if (el.kind === "led" || el.kind === "button") {
      body += numInput("中心 x", 0, el.center, { obj: "center" }).replace('data-key="0"', 'data-key="0" data-vec="center"');
      body += numInput("中心 y", 1, el.center, { obj: "center" }).replace('data-key="1"', 'data-key="1" data-vec="center"');
      // 半径/按下缩放都由素材决定（LED=镜片内圈、脚踏=美术宽/2 且按住态整张换图），不给调
      const note =
        el.kind === "led"
          ? `半径 ${ledRadius(el).toFixed(2)} mm（随素材镜片）`
          : `半径 ${buttonRadius(el).toFixed(2)} mm（随美术），按住态整张换图`;
      body += `<div class="row"><label>尺寸</label><span style="flex:1;font-size:11.5px;color:#6b6156">${note}</span></div>`;
    } else if (el.kind === "frame") {
      body += `<p class="hint" style="font-size:11.5px;color:#6b6156">面板边框贴着画布，改画布尺寸会自动跟随；只需调内缩/圆角/线宽。</p>`;
      body += numInput("内缩 mm", "margin", el, { step: 0.1 });
      body += numInput("圆角 mm", "rx", el, { step: 0.1 });
      body += numInput("线宽 mm", "strokeWidth", el, { step: 0.05 });
      body += `<div class="row"><label>描边</label><input type="color" data-key="stroke" value="${el.stroke}"/></div>`;
    } else if (el.kind === "image") {
      body += numInput("x", "x");
      body += numInput("y", "y");
      body += numInput("旋转 °", "rot", el, { step: 1 });
      body += `<div class="row"><label>层</label><select data-key="layer">${["artwork", "silkscreen"]
        .map((l) => `<option ${l === (el.layer ?? "silkscreen") ? "selected" : ""}>${l}</option>`)
        .join("")}</select></div>`;
    } else if (el.kind === "rect") {
      for (const k of ["x", "y", "w", "h", "rx", "strokeWidth"]) body += numInput(k, k);
      body += `<div class="row"><label>描边</label><input type="color" data-key="stroke" value="${el.stroke}"/></div>`;
      body += `<div class="row"><label>填充</label><input type="text" data-key="fill" value="${el.fill}"/></div>`;
    }
    body += `<div class="row" style="margin-top:10px"><label></label><span style="flex:1"></span>
      <button id="btnDup">复制</button><button id="btnDel">删除</button></div>`;
  } else {
    body += `<h3>面板</h3>`;
    body += `<div class="row"><label>画布 W</label><input type="number" data-canvas="0" value="${d.canvas.canvas_mm[0]}"/></div>`;
    body += `<div class="row"><label>画布 H</label><input type="number" data-canvas="1" value="${d.canvas.canvas_mm[1]}"/></div>`;
    body += `<div class="row"><label>底色</label><input type="color" data-canvas="bg" value="${d.canvas.background}"/></div>`;
    body += `<div class="row"><label>墨色</label><input type="color" data-canvas="ink" value="${d.canvas.ink}"/></div>`;
    body += `<div class="row"><label>素材密度</label><input type="number" data-canvas="px" value="${d.canvas.px_per_mm}"/></div>`;
    body += `<div class="row"><label>预设</label><select data-canvas="preset">${Object.keys(PRESETS)
      .map((p) => `<option ${p === d.canvas.preset ? "selected" : ""}>${p}</option>`)
      .join("")}</select></div>`;
    body += `<h3>参数（只读）</h3><div id="paramList">${
      d.params.length
        ? d.params.map((p) => `<div class="row"><label>${p.id}</label><span style="flex:1;font-size:11.5px;color:#6b6156">${p.name} · ${p.type}</span></div>`).join("")
        : `<p class="warn">还没有参数。点顶栏「打开」选插件的 rustomp.toml。</p>`
    }</div>`;
  }

  const problems = validate(d);
  body += `<h3>校验</h3>`;
  body += problems.length
    ? `<p class="warn">${problems.length} 个问题：</p><ul id="problems">${problems.map((p) => `<li>${p}</li>`).join("")}</ul>`
    : `<p class="ok">✓ 可以导出</p>`;

  $("#insp").innerHTML = body;

  // ---- 事件 ----
  // 注意：监听器在启动时统一挂一次（见文件末尾），这里不能再挂 `{once:true}`，
  // 否则第一次输入之后整个面板就"死"了（历史 bug）。
  for (const b of document.querySelectorAll("[data-align],[data-align-canvas]")) {
    b.addEventListener("click", () => {
      const mode = b.dataset.align ?? b.dataset.alignCanvas;
      const target = b.dataset.alignCanvas ? "canvas" : "selection";
      commit();
      for (const m of alignMoves(d, els, mode, target)) {
        const t = d.elements.find((e) => e.id === m.id);
        if (t) move(t, m.dx, m.dy);
      }
      render();
      renderInspector();
    });
  }
  for (const b of document.querySelectorAll("[data-distribute]")) {
    b.addEventListener("click", () => {
      commit();
      for (const m of distributeMoves(els, b.dataset.distribute)) {
        const t = d.elements.find((e) => e.id === m.id);
        if (t) move(t, m.dx, m.dy);
      }
      render();
      renderInspector();
    });
  }
  $("#btnDel")?.addEventListener("click", () => {
    commit();
    d.elements = d.elements.filter((e) => !state.selection.includes(e.id));
    state.selection = [];
    render();
    renderInspector();
  });
  $("#btnDup")?.addEventListener("click", () => {
    commit();
    const copies = duplicate(d, els, [3, 3]);
    d.elements.push(...copies);
    state.selection = copies.map((c) => c.id);
    render();
    renderInspector();
  });
}

function onInspectorInput(ev) {
  const t = ev.target;
  const d = state.doc;
  const el = d.elements.find((e) => e.id === state.selection[0]);

  // 坐标一律**向下取整**（毫米整数，做面板时对位更可靠）
  const int = (v) => Math.floor(Number(v));

  if (t.dataset.canvas !== undefined) {
    const key = t.dataset.canvas;
    if (key === "0" || key === "1") {
      d.canvas.canvas_mm[Number(key)] = int(t.value);
      d.canvas.window_px = d.canvas.canvas_mm.map((v) => Math.round(v * 6));
    } else if (key === "bg") d.canvas.background = t.value;
    else if (key === "ink") d.canvas.ink = t.value;
    else if (key === "px") d.canvas.px_per_mm = int(t.value);
    else if (key === "preset") {
      const p = PRESETS[t.value];
      if (p) {
        d.canvas.preset = t.value;
        d.canvas.outer_mm = p.outer_mm;
        d.canvas.canvas_mm = p.canvas_mm;
        d.canvas.window_px = p.canvas_mm.map((v) => Math.round(v * 6));
      }
    }
    render();
    return;
  }

  if (!el) return;
  const key = t.dataset.key;
  if (!key) return;

  if (t.dataset.vec) {
    // center / pivot 的分量
    el[t.dataset.vec][Number(key)] = int(t.value);
    if (t.dataset.vec === "center" || t.dataset.vec === "pivot") {
      if (el.kind === "toggle" && t.dataset.vec === "pivot") syncTogglePivot(el);
    }
  } else if (key === "x" || key === "y" || key === "y_up") {
    el[key] = int(t.value);
    // 拨杆：y_down 与 pivot 必须跟着（六边形中心补偿）
    if (el.kind === "toggle") syncTogglePivot(el);
  } else if (key === "w" || key === "h") {
    el[key] = int(t.value);
  } else if (["radius", "press_scale", "travel_deg", "rot", "rx", "margin"].includes(key)) {
    el[key] = Number(t.value);
  } else if (key === "strokeWidth") {
    el[key] = Number(t.value);
  } else {
    el[key] = t.value; // param / asset / layer / fill / stroke
  }
  render();
}


// ---------- 顶栏 ----------
function setMode(mode) {
  state.mode = mode;
  state.bypassed = false;
  document.body.classList.toggle("preview", mode === "preview");
  for (const b of document.querySelectorAll("#mode button")) b.classList.toggle("on", b.dataset.mode === mode);
  $("#stHint").textContent =
    mode === "preview" ? "拖旋钮改值 · 点拨杆/LED 切换 · 按住脚踏看按下反馈 · Tab 切回编辑" : "点图层聚焦 · 双击素材新建 · 方向键微调（Shift 1mm）· ⌫ 删除 · Tab 切模式";
  render();
}

for (const b of document.querySelectorAll("#mode button")) b.addEventListener("click", () => setMode(b.dataset.mode));

$("#docName").addEventListener("input", (e) => {
  state.doc.name = e.target.value;
});

$("#btnUndo").addEventListener("click", undo);
$("#btnRedo").addEventListener("click", redo);

$("#btnNew").addEventListener("click", () => {
  commit();
  state.doc = newDoc({ name: "未命名面板", params: state.doc.params });
  state.selection = [];
  state.values = {};
  render();
  renderInspector();
});

$("#btnOpen").addEventListener("click", () => $("#fileInput").click());

// ---------- 导入外部 SVG（D-014：类必须手选，只允许装饰/丝印） ----------
let pendingSvgs = [];
$("#btnImport").addEventListener("click", () => {
  if (!state.focus || !["artwork", "silkscreen"].includes(state.focus)) {
    $("#stHint").textContent = "导入前先聚焦「装饰」或「丝印」图层（导入的素材只属于这两层）";
    return;
  }
  $("#svgInput").click();
});
$("#svgInput").addEventListener("change", async (e) => {
  const files = [...(e.target.files ?? [])];
  e.target.value = "";
  if (!files.length) return;
  pendingSvgs = await Promise.all(files.map(async (f) => ({ name: f.name, svg: await f.text() })));
  // 默认选中当前焦点图层对应的类
  document.querySelector(`input[name="impKind"][value="${state.focus}"]`).checked = true;
  $("#impList").textContent = pendingSvgs.map((f) => f.name).join("、");
  $("#dlgImport").showModal();
});
$("#impCancel").addEventListener("click", () => {
  pendingSvgs = [];
  $("#dlgImport").close();
});
$("#impOk").addEventListener("click", () => {
  const kind = document.querySelector('input[name="impKind"]:checked').value;
  const d = state.doc;
  commit();
  const added = [];
  for (const f of pendingSvgs) {
    try {
      const item = importSvg(d, { name: f.name, svg: f.svg, kind });
      added.push(item.id);
    } catch (err) {
      alert(`${f.name}：${err.message}`);
    }
  }
  pendingSvgs = [];
  $("#dlgImport").close();
  if (added.length) {
    state.focus = kind; // 焦点跟到导入的层
    $("#stHint").textContent = `已导入 ${added.length} 个素材（${kind}），在左侧素材库双击使用`;
  }
  renderLibrary();
  render();
  renderLayers();
  renderInspector();
});
$("#fileInput").addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  const text = await file.text();
  try {
    if (file.name.endsWith(".toml")) {
      // 读参数表，保留当前布局
      state.doc.params = parseParams(text);
      $("#stHint").textContent = `已读入 ${state.doc.params.length} 个参数`;
    } else {
      commit();
      state.doc = load(text);
      state.selection = [];
    }
    render();
    renderInspector();
  } catch (err) {
    alert(`打不开：${err.message}`);
  }
  e.target.value = "";
});

$("#btnSave").addEventListener("click", () => {
  download(`${slug(state.doc.name)}.box.json`, save(state.doc), "application/json");
});

function download(name, text, type = "text/plain") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const slug = (s) => (s || "panel").toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-").replace(/^-|-$/g, "");

// ---------- 导出 ----------
$("#btnExport").addEventListener("click", () => {
  const problems = validate(state.doc);
  const plan = uiToml(state.doc);
  $("#expSummary").textContent = `${state.doc.name}：${state.doc.elements.length} 个元素，${state.doc.canvas.canvas_mm.join(" × ")} mm / ${state.doc.canvas.px_per_mm} px/mm`;
  $("#expProblems").textContent = problems.length ? `${problems.length} 个校验问题（导出仍会写文件，但插件可能跑不起来）：${problems.join("；")}` : "";
  $("#expCmd").textContent = `node scripts/export.mjs ${slug(state.doc.name)}.box.json --out <插件项目>/assets`;
  $("#expToml").onclick = () => download("ui.toml", plan);
  $("#expSvg").onclick = () => download("panel.svg", panelSvg(state.doc, state.assets, { controls: false }));
  $("#dlgExport").showModal();
});
$("#expClose").addEventListener("click", () => $("#dlgExport").close());

// ---------- 属性面板事件（只挂一次） ----------
$("#insp").addEventListener("focusin", (e) => {
  // 每次"开始编辑一个字段"记一步撤销（而不是每敲一个字）
  if (e.target.matches('input, select')) commit();
});
$("#insp").addEventListener("input", onInspectorInput);
$("#insp").addEventListener("change", (e) => {
  if (e.target.matches("select")) renderInspector();
});

// ---------- 启动 ----------
await loadAssets();
renderLibrary();
renderLayers();
render();
renderInspector();
setMode("edit");
$("#stHint").textContent = "先点左下「图层」里的一行聚焦（之后该层元素才能选中/编辑；双击素材库新建）";

const query = new URLSearchParams(location.search);
if (query.has("demo")) {
  const r = await fetch("examples/sparklin.box.json");
  state.doc = load(await r.text());
  render();
  renderInspector();
}
if (query.get("mode") === "preview") setMode("preview");
if (query.get("focus") && LAYERS.some((l) => l.id === query.get("focus"))) setFocus(query.get("focus"));

// 无头冒烟测试：在真实浏览器里跑一遍"加元素 → 移动 → 校验 → 导出"
if (query.has("selftest")) {
  const d = state.doc;
  const before = d.elements.length;
  addElement("knob", "knob_round_light");
  addElement("toggle", "toggle_large");
  addElement("led", "led_green");
  const added = d.elements.length - before;
  const moved = (() => {
    const el = d.elements.at(-1);
    const p0 = [...el.center];
    move(el, 2, 3);
    return el.center[0] === p0[0] + 2 && el.center[1] === p0[1] + 3;
  })();
  const toml = uiToml(d);
  const svg = panelSvg(d, state.assets, { controls: true, values: {} });
  // 位置/尺寸走"右侧属性面板"的 input 事件（拖动已禁用，这是唯一的精确改法）
  const inputOk = (() => {
    const knob = d.elements.find((e) => e.id === state.selection[0]);
    if (!knob) return "no-selection";
    renderInspector();
    const field = document.querySelector('#insp input[data-vec="center"][data-key="0"]');
    if (!field) return "no-field";
    const before = knob.center[0];
    field.value = String(before + 12.7);
    field.dispatchEvent(new Event("input", { bubbles: true }));
    const after = knob.center[0];
    // 小数要向下取整
    return after === Math.floor(before + 12.7) ? true : `stuck:${before}->${after}`;
  })();

  // 导入外部 SVG 的整条链路（用户报过 size_mm 崩溃）
  const importOk = (() => {
    try {
      const svg = '<svg viewBox="0 0 28.35 14.17"><rect width="28.35" height="14.17"/></svg>';
      const item = importSvg(state.doc, { name: "selftest", svg, kind: "silkscreen" });
      state.focus = "silkscreen";
      addElement("imported", item.id);
      const el = state.doc.elements.at(-1);
      return el && el.asset === item.id && el.layer === "silkscreen" ? true : "bad-element";
    } catch (e) {
      return e.message;
    }
  })();

  const ok =
    added === 3 &&
    importOk === true &&
    moved &&
    inputOk === true &&
    toml.includes("[[ui.knobs]]") &&
    toml.includes("[[ui.toggles]]") &&
    toml.includes("[[ui.leds]]") &&
    svg.startsWith("<svg") &&
    svg.includes('data-control="knob"');
  $("#stHint").textContent = `SELFTEST ${ok ? "ok" : "FAIL"} added=${added} moved=${moved} input=${inputOk} import=${importOk} toml=${toml.length}B svg=${svg.length}B`;
}
