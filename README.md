# rustomp-box-designer

**插件面板（GUI）设计器** —— 画面板 → 导出 `rustomp.toml` 的 `[ui]` 段 + 素材 PNG，
交给 [rustomp](https://github.com/amonisachicken/rustomp) 的 `rustomp-gui` 在插件里渲染。

```text
 本设计器                    rustomp 框架                     插件
 ─────────                  ───────────────                  ──────
 画面板（旋钮/拨杆/LED/丝印）
   │ 导出：rustomp.toml 的 [assets] + [ui] 段
   │       + PNG 素材（面板底图、拨杆两态贴图…）
   ▼
 rustomp-gen ──► plugin/src/generated/panel.rs（PanelSpec 字面量）
                              │
                              ▼
                     rustomp-gui::draw()（egui）──► 宿主里的插件窗口
```

---

## 现状（2026-10-26）：**D0 可用**

| 项 | 状态 |
|---|---|
| 契约 / 运行时语义 / 素材规范 / 方案评审 | ✅ `docs/01`–`docs/05` |
| **决策**（D0 范围、技术栈、图层、坐标、导出、素材内联） | ✅ `docs/00-decisions.md` |
| 画布编辑器（拖放、吸附、微调、属性面板、校验） | ✅ |
| **D1 编辑增强**：安全边距参考线、吸附到中线/其它控件、图层显隐与锁定、撤销/重做 | ✅ |
| **D1.5 多选**：Shift 点选、对齐（对选区/对画布）、等间距、批量改、Alt 拖动复制 | ✅ |
| **图层焦点**：**默认无焦点（全部虚化不可交互）**，点图层名聚焦后才能编辑；取代"锁定" | ✅ |
| 新建元素 | **双击**素材库（落在画布中心）；位置用方向键或属性面板调（**拖动已禁用**） | ✅ |
| 装饰层边框 | `frame` 元素：贴画布、改画布自动跟随，只调内缩/圆角/线宽 | ✅ |
| **导入外部 SVG** | 只能导入到**装饰/丝印**层（类必须手选），存进 `.box.json`，双击使用 | ✅ |
| 控件尺寸 | 旋钮/LED/脚踏的尺寸与按下缩放**全部随素材**，面板里只有只读显示 | ✅ |
| 参数绑定 | 按类型过滤：旋钮↔float、拨杆/脚踏↔bool、LED↔`clip_indicator`，错配在校验里报错 | ✅ |
| 四类控件：旋钮 / 拨杆 / LED / 脚踏 | ✅（多位开关走"多电路"，不做；数值显示暂不做） |
| 预览 L1（拖旋钮 / 点拨杆 / 按脚踏 / LED 亮灭） | ✅ |
| 导出：`panel.svg` + `panel.png` + 控件贴图 + `[assets]/[ui]` 标记块 | ✅ |
| 用设计器复刻真实面板（Sparklin Drive） | ✅ `examples/sparklin.box.json` |
| **产物已进发布路径**（D0.5） | ✅ rustomp 的 Sparklin Drive：面板/旋钮/拨杆贴图 + `[assets]`+`[ui]` 全部来自设计器，音频 RMS 逐位不变 |
| 脚踏"按住态"贴图（`3pdt_alt-hold.svg`） | ✅ 设计器预览 + rustomp 运行时都支持 |
| 拨杆两态**六边形中心**对齐（0.54 mm 补偿） | ✅ 导出 `y_down` 时自动补偿，校验按六边形中心判 |
| 旁通预览：LED 去色变灰、不闪 | ✅ 与运行时同一套色值 |
| 数值/表头显示、素材热重载、1:1 打印 PDF | ⬜ 后续 |

### 快速开始

```bash
./scripts/dev.sh            # → http://localhost:8765/    （零依赖，只需要 python3 + Node）
./scripts/check.sh          # 素材清单 / 单元测试 / 导出 / 产物尺寸，一条命令全跑
```

浏览器里没有安装步骤（没有 npm 依赖）：`index.html` + 原生 ES modules。
打开 `http://localhost:8765/?demo=1` 会直接载入示例面板。

### 导出到插件项目（详见 `docs/06-export-runbook.md`）

```bash
# 1) 出 PNG + SVG（Inkscape 栅格化，12 px/mm）
node scripts/export.mjs my.box.json --out ../rustomp/plugins/<插件>/assets
# 2) 把 ui.toml 里的 `# >>> rustomp-box-designer` … `# <<<` 块替换掉 rustomp.toml 的同名段
# 3) 回到 rustomp：重新生成 → 构建
python3 tools/meta/plugin_meta.py plugins/<插件>/rustomp.toml --panel-rust > plugins/<插件>/plugin/src/generated/panel.rs
cargo run -q -p rustomp-gen -- plugins/<插件> && ./scripts/build-all.sh
```

> 素材名（`knob_round_dark` / `toggle_small_up`…）会直接出现在 rustomp 的
> `generated/assets.rs` 里，`editor.rs` 不需要跟着改（rustomp DEVLOG E65）。

> **契约验证**：`rustomp` 的 Sparklin Drive v2 已经用这套契约做出了第一个面板
> （毫米坐标 60×112 mm、12 px/mm、旋钮整图旋转、拨杆两态、LED），
> AU 报 CocoaUI 且音色与原无界面版一致（DEVLOG E61）。

---

## 代码结构

```text
index.html              三栏界面（素材库 / 画布 / 属性面板）
src/main.js             交互：拖放、吸附、预览、导出弹窗
src/model.js            .box.json 数据模型 + 元素工厂 + 校验
src/exporter.js         面板 SVG / 贴图清单 / [ui] TOML（**纯函数**，预览与导出共用）
src/embed.js            素材 SVG 内联（展开 CSS 类、删 id、嵌套 viewBox 裁剪）
src/assets.gen.js       素材清单（由 scripts/gen-assets.mjs 从 viewBox 生成，入库可 diff）
assets/                 旋钮 / 拨杆 / LED / 脚踏 / 丝印标签（SVG，pt 坐标）
scripts/gen-assets.mjs  扫素材 → 清单
scripts/export.mjs      .box.json → SVG + PNG（Inkscape）+ ui.toml
scripts/preview.mjs     渲染带控件的预览图（等同浏览器里看到的）
scripts/check.sh        一条命令跑完全部校验
tests/                  node --test（28 个用例）
examples/sparklin.box.json   用设计器复刻的真实面板
```

## 设计器的定位（先说清楚边界）

| 做 | 不做 |
|---|---|
| 面板布局（控件位置/尺寸/角度/丝印） | DSP、电路、参数范围 |
| 素材管理（底图、拨杆贴图）与导出 | 插件身份（名字/AU 码/VST3 id） |
| 生成/更新 `rustomp.toml` 的 `[assets]` + `[ui]` 段 | 改 `rustomp.toml` 的 `[plugin]/[au]/[[params]]` |
| 预览（离线渲染面板 + 控件交互） | 实时音频 |

> **参数表（`[[params]]`）由插件作者维护**，设计器只**读**它来决定"有哪些参数可以绑到控件上"。

---

## 文档

| 文档 | 内容 |
|---|---|
| `docs/01-contract-panel-toml.md` | 契约：`[assets]` 与 `[ui]` 的每个字段、单位、默认值 |
| `docs/02-runtime-panelspec.md` | 运行时语义：坐标缩放、旋钮角度映射、拨杆基线、LED、贴图生命周期 |
| `docs/03-assets.md` | 素材规范与已知坑（@2x、alpha、六边形基线偏移 1.53） |
| **`docs/06-export-runbook.md`** | **导出交接手册**：`ui.toml`+`panel.svg` → 插件（6 步命令、缺件清单、验收 5 条、常见问题） |
| `docs/00-decisions.md` | **已拍板的决策**（D0 范围、技术栈、图层、坐标、导出、素材内联） |
| `docs/04-open-questions.md` | 当初的 9 个开放问题（现已全部拍板，保留作理由存档） |

---

## 许可证

GPL-3.0-or-later（`LICENSE`）。
