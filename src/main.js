// 设计器主程序：素材库 → 画布（SVG 预览 = 导出同一份代码）→ 属性面板 → 导出
import { ASSETS, SWITCH_PAIRS, byId, byKind } from "./assets.gen.js";
import { newDoc, factory, validate, move, resize, snap, bbox, layerOf, load, save, PRESETS } from "./model.js";
import { panelSvg, uiToml, parseParams, num } from "./exporter.js";

const $ = (s) => document.querySelector(s);
const state = {
  doc: newDoc({ name: "未命名面板" }),
  assets: {}, // id → svg 文本
  selected: null, // 元素 id
  mode: "edit",
  values: {}, // 预览态：元素 id → 数值/布尔
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
  const svg = panelSvg(state.doc, state.assets, {
    controls: true,
    values: state.mode === "preview" ? state.values : {},
  });
  stage.innerHTML = svg + (state.selected ? selectionOverlay() : "") + gridOverlay();
  $("#stage svg").setAttribute("preserveAspectRatio", "xMidYMid meet");

  $("#stCount").textContent = state.doc.elements.length;
  $("#stCanvas").textContent = `${W} × ${H} mm`;
  $("#stDensity").textContent = `${state.doc.canvas.px_per_mm} px/mm`;
  $("#docName").value = state.doc.name;
}

function selectionOverlay() {
  const el = state.doc.elements.find((e) => e.id === state.selected);
  if (!el) return "";
  const b = bbox(el);
  return `<rect class="sel" x="${num(b.x - 1)}" y="${num(b.y - 1)}" width="${num(b.w + 2)}" height="${num(b.h + 2)}" rx="1.5"/>`;
}

function gridOverlay() {
  const [W, H] = state.doc.canvas.canvas_mm;
  const lines = [];
  for (let x = 0; x <= W; x += 5) lines.push(`<line x1="${x}" y1="0" x2="${x}" y2="${H}"/>`);
  for (let y = 0; y <= H; y += 5) lines.push(`<line x1="0" y1="${y}" x2="${W}" y2="${y}"/>`);
  return `<g class="grid" pointer-events="none">${lines.join("")}</g>`;
}

// ---------- 素材库 ----------
const KIND_TITLE = { knob: "旋钮", toggle: "拨杆（两态）", led: "LED", button: "脚踏", label: "丝印标签" };

function renderLibrary() {
  const groups = {
    knob: byKind("knob"),
    toggle: Object.keys(SWITCH_PAIRS),
    led: byKind("led"),
    button: ["3pdt", "3pdt_alt"],
    label: byKind("label"),
  };
  const html = Object.entries(groups)
    .map(([kind, items]) => {
      const cells = items
        .map((it) => {
          // 拨杆这一组是「pair 名」，缩略图取 up 态；其它组直接是素材 id
          const id = typeof it === "string" ? it : it.id;
          const file = kind === "toggle" ? byId(SWITCH_PAIRS[id].up).file : byId(id).file;
          const wide = kind === "label" ? " wide" : "";
          return `<div class="asset${wide}" data-add="${kind}" data-id="${id}" title="${id}">
            <img src="${file}" alt="${id}"/><span>${id.replace(/^label_/, "")}</span></div>`;
        })
        .join("");
      return `<h3>${KIND_TITLE[kind]}</h3><div class="asset-grid">${cells}</div>`;
    })
    .join("");
  $("#lib").innerHTML = html;
}

$("#lib").addEventListener("click", (e) => {
  const cell = e.target.closest("[data-add]");
  if (!cell) return;
  addElement(cell.dataset.add, cell.dataset.id);
});

/** 新元素放在画布中央（毫米），避免一加就超出边界 */
const centerAt = (lens) => [+(state.doc.canvas.canvas_mm[0] / 2).toFixed(2), +(state.doc.canvas.canvas_mm[1] / 2 + lens).toFixed(2)];

function addElement(kind, id) {
  const d = state.doc;
  const [cx, cy] = centerAt(0);
  const firstParam = d.params[0]?.id ?? "";
  let el;
  if (kind === "knob") el = factory.knob(d, { asset: id, param: firstParam, center: [cx, cy] });
  else if (kind === "toggle") el = factory.toggle(d, { pair: id, param: firstParam, x: cx - 4, y: cy - 4 });
  else if (kind === "led") el = factory.led(d, { asset: id, center: [cx, cy] });
  else if (kind === "button") el = factory.button(d, { asset: id, param: firstParam, center: [cx, cy] });
  else el = factory.image(d, { asset: id, x: cx, y: cy });
  d.elements.push(el);
  state.selected = el.id;
  render();
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
      state.values[id] = true;
      render();
      const up = () => {
        state.values[id] = false;
        render();
        window.removeEventListener("pointerup", up);
      };
      window.addEventListener("pointerup", up);
    }
    return;
  }

  // 编辑模式：选中 + 开始拖动
  state.selected = id ?? null;
  renderInspector();
  if (!el) {
    render();
    return;
  }
  drag = { kind: "move", id, last: [mx, my], moved: false };
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

  const el = state.doc.elements.find((e) => e.id === drag.id);
  if (!el) return;
  const step = ev.altKey ? 0.01 : 0.5; // Alt 关闭吸附
  const [dx, dy] = [snap(mx, step) - snap(drag.last[0], step), snap(my, step) - snap(drag.last[1], step)];
  if (dx || dy) {
    move(el, dx, dy);
    drag.last = [snap(mx, step), snap(my, step)];
    drag.moved = true;
    render();
    renderInspector();
  }
});

window.addEventListener("pointerup", () => {
  drag = null;
});

window.addEventListener("keydown", (ev) => {
  if (ev.target.matches("input, textarea, select")) return;
  const el = state.doc.elements.find((e) => e.id === state.selected);
  const step = ev.shiftKey ? 1 : 0.1;
  const nudge = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[ev.key];
  if (nudge && el) {
    move(el, ...nudge);
    render();
    renderInspector();
    ev.preventDefault();
  } else if ((ev.key === "Delete" || ev.key === "Backspace") && el) {
    state.doc.elements = state.doc.elements.filter((e) => e.id !== el.id);
    state.selected = null;
    render();
    renderInspector();
    ev.preventDefault();
  } else if (ev.key === "Tab") {
    setMode(state.mode === "edit" ? "preview" : "edit");
    ev.preventDefault();
  }
});

// ---------- 属性面板 ----------
function renderInspector() {
  const el = state.doc.elements.find((e) => e.id === state.selected);
  const d = state.doc;
  const params = d.params.map((p) => p.id);
  if (el && el.kind === "led") params.unshift("clip_indicator");
  const paramOptions = (cur) =>
    ["", ...new Set([...params, cur].filter((v) => v !== undefined))]
      .map((p) => `<option value="${p}" ${p === cur ? "selected" : ""}>${p || "（未绑定）"}</option>`)
      .join("");
  const numInput = (label, key, obj = el, opts = {}) =>
    `<div class="row"><label>${label}</label><input type="number" step="${opts.step ?? 0.1}" data-key="${key}" ${
      opts.obj ? `data-obj="${opts.obj}"` : ""
    } value="${obj?.[key] ?? 0}"/></div>`;

  let body = "";
  if (el) {
    body += `<h3>${el.kind} · ${el.id}</h3>`;
    if (["knob", "toggle", "led", "button"].includes(el.kind)) {
      body += `<div class="row"><label>参数</label><select data-key="param">${paramOptions(el.param)}</select></div>`;
    }
    if (el.kind === "knob") {
      body += numInput("中心 x", 0, el.center, { obj: "center" }).replace('data-key="0"', 'data-key="0" data-vec="center"');
      body += numInput("中心 y", 1, el.center, { obj: "center" }).replace('data-key="1"', 'data-key="1" data-vec="center"');
      body += numInput("半径 mm", "radius");
      body += numInput("行程 °", "travel_deg", el, { step: 5 });
      body += `<div class="row"><label>素材</label><select data-key="asset">${byKind("knob")
        .map((a) => `<option ${a.id === el.asset ? "selected" : ""}>${a.id}</option>`)
        .join("")}</select></div>`;
      if (!el.param) body += `<p class="warn">没绑定参数，导出会被拦下</p>`;
    } else if (el.kind === "toggle") {
      body += numInput("x", "x");
      body += numInput("y", "y_up", el);
      body += `<p class="hint" style="font-size:11.5px;color:#6b6156">两态 y 会自动保持相同（运行时归一化后不会跳）</p>`;
    } else if (el.kind === "led" || el.kind === "button") {
      body += numInput("中心 x", 0, el.center, { obj: "center" }).replace('data-key="0"', 'data-key="0" data-vec="center"');
      body += numInput("中心 y", 1, el.center, { obj: "center" }).replace('data-key="1"', 'data-key="1" data-vec="center"');
      body += numInput("半径 mm", "radius");
      if (el.kind === "button") body += numInput("按下缩放", "press_scale", el, { step: 0.05 });
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
  $("#insp").addEventListener("input", onInspectorInput, { once: true });
  $("#btnDel")?.addEventListener("click", () => {
    d.elements = d.elements.filter((e) => e.id !== el.id);
    state.selected = null;
    render();
    renderInspector();
  });
  $("#btnDup")?.addEventListener("click", () => {
    const copy = JSON.parse(JSON.stringify(el));
    copy.id = `${el.kind[0]}${d.nextId++}`;
    move(copy, 3, 3);
    d.elements.push(copy);
    state.selected = copy.id;
    render();
    renderInspector();
  });
}

function onInspectorInput(ev) {
  const t = ev.target;
  const d = state.doc;
  const el = d.elements.find((e) => e.id === state.selected);

  if (t.dataset.canvas !== undefined) {
    const key = t.dataset.canvas;
    if (key === "0" || key === "1") {
      d.canvas.canvas_mm[Number(key)] = Number(t.value);
      d.canvas.window_px = d.canvas.canvas_mm.map((v) => Math.round(v * 6));
    } else if (key === "bg") d.canvas.background = t.value;
    else if (key === "ink") d.canvas.ink = t.value;
    else if (key === "px") d.canvas.px_per_mm = Number(t.value);
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
    renderInspector();
    return;
  }

  if (!el) return;
  const key = t.dataset.key;
  if (!key) return;

  if (t.dataset.vec) {
    el[t.dataset.vec][Number(key)] = Number(t.value);
  } else if (key === "y_up") {
    // 两态 y 必须一致（D-006：运行时归一化后不跳）
    el.y_up = Number(t.value);
    el.y_down = Number(t.value);
  } else if (key === "press_scale" || key.startsWith("radius") || key === "travel_deg" || key === "rot") {
    el[key] = Number(t.value);
  } else if (["x", "y", "w", "h", "rx", "strokeWidth"].includes(key)) {
    el[key] = Number(t.value);
  } else {
    el[key] = t.value;
  }
  render();
}

// ---------- 顶栏 ----------
function setMode(mode) {
  state.mode = mode;
  document.body.classList.toggle("preview", mode === "preview");
  for (const b of document.querySelectorAll("#mode button")) b.classList.toggle("on", b.dataset.mode === mode);
  $("#stHint").textContent =
    mode === "preview" ? "拖旋钮改值 · 点拨杆/LED 切换 · 按住脚踏看按下反馈 · Tab 切回编辑" : "点素材添加 · 拖动移动 · 方向键微调 · ⌫ 删除 · Tab 切模式";
  render();
}

for (const b of document.querySelectorAll("#mode button")) b.addEventListener("click", () => setMode(b.dataset.mode));

$("#docName").addEventListener("input", (e) => {
  state.doc.name = e.target.value;
});

$("#btnNew").addEventListener("click", () => {
  state.doc = newDoc({ name: "未命名面板", params: state.doc.params });
  state.selected = null;
  state.values = {};
  render();
  renderInspector();
});

$("#btnOpen").addEventListener("click", () => $("#fileInput").click());
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
      state.doc = load(text);
      state.selected = null;
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

// ---------- 启动 ----------
await loadAssets();
renderLibrary();
render();
renderInspector();
setMode("edit");

const query = new URLSearchParams(location.search);
if (query.has("demo")) {
  const r = await fetch("examples/sparklin.box.json");
  state.doc = load(await r.text());
  render();
  renderInspector();
}
if (query.get("mode") === "preview") setMode("preview");

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
  const ok =
    added === 3 &&
    moved &&
    toml.includes("[[ui.knobs]]") &&
    toml.includes("[[ui.toggles]]") &&
    toml.includes("[[ui.leds]]") &&
    svg.startsWith("<svg") &&
    svg.includes('data-control="knob"');
  $("#stHint").textContent = `SELFTEST ${ok ? "ok" : "FAIL"} added=${added} moved=${moved} toml=${toml.length}B svg=${svg.length}B`;
}
