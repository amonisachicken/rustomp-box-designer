# rustomp-box-designer

**插件面板设计器** —— 在画布上摆旋钮 / 拨杆 / LED / 脚踏，导出 `rustomp.toml` 的
`[assets]` + `[ui]` 段与素材 PNG，交给 [rustomp](https://github.com/amonisachicken/rustomp)
的 `rustomp-gui` 在宿主里渲染。

```text
 本设计器                          rustomp                            宿主
 ─────────                        ─────────                          ─────
 .box.json（设计文件）
   │ 导出：ui.toml（[assets]+[ui]）
   │       panel.svg / panel.png（12 px/mm）
   │       旋钮/拨杆/按住态贴图
   ▼
 ·····························► rustomp.toml ──► rustomp-gen ──► panel.rs + assets.rs
                                                                      │
                                                        rustomp-gui::draw() ──► AU/VST3/CLAP
```

当前 **D0 + D1 + D1.5 全部可用**，已用它做出并验证真插件（Sparklin Drive v2，用户自绘面板）。
当前状态与下一步见 [`docs/status.md`](docs/status.md)。

---

## 1. 产品介绍

| 交付物 | 用来做什么 |
|---|---|
| **`.box.json`** | 设计文件（唯一事实来源，可版本化、可 diff、可回设计器继续改） |
| **`ui.toml`** | 复制进插件 `rustomp.toml` 的 `[assets]` + `[ui]` 标记块 |
| **`panel.svg` / `panel.png`** | 面板底图（12 px/mm；SVG 可 1:1 打印） |
| **控件贴图** | 旋钮 / 拨杆两态 / 脚踏按住态（浏览器 canvas 或 Inkscape 栅格化） |
| **素材包 zip** | 上面全部 + 设计文件，一次下载齐 |

**面向谁**：rustomp 插件的面板作者。
**不做什么**：不碰 DSP / 电路 / 参数表 / 插件身份（名字、AU 码、VST3 id）。

### 当前状态（摘要）

| 项 | 状态 |
|---|---|
| 控件 | ✅ 旋钮 / 拨杆 / LED / 脚踏 + `frame` / `image` |
| 图层与焦点 | ✅ 7 层；焦点显式化，避免"以为在改 A 层" |
| 编辑 | ✅ 多选、对齐/等间距、复制、撤销/重做、数值定位 |
| 素材 | ✅ 32 个内置素材 + 外部 SVG 导入（自包含） |
| 预览 | ✅ L1：拖旋钮、拨杆、脚踏按住态、旁通 LED 去色 |
| 导出 | ✅ 一键素材包 / CLI（Inkscape 权威 PNG） |
| 暂存 | ✅ 顶栏「暂存」→ 本地服务端缓存；启动自动恢复 |
| 验证 | ✅ 43 个 Node 单测 + 浏览器 `?selftest=1` + 导出尺寸校验 |
| 下一步 | 素材包自动安装、框选、更多外壳、素材库分组/搜索 |

---

## 2. 架构

**纯静态浏览器应用**：没有构建步骤、没有 npm 运行时依赖、没有 Rust 后端；
开发服务（Python 标准库）只额外提供可选的本地暂存 API。

```text
.box.json ──► exporter.js ──► panel.svg / panel.png + 控件贴图 + ui.toml
    │                              │
    └── 浏览器预览（同一份 exporter）  └──► rustomp.toml → rustomp-gen → rustomp-gui
```

| 模块 | 作用 |
|---|---|
| `src/main.js` | 交互与状态：焦点、选中、多选、对齐、预览、导入、导出、暂存 |
| `src/model.js` | `.box.json` 模型、元素工厂、bbox、对齐/分布、校验、素材导入 |
| `src/exporter.js` | 面板 SVG / 贴图清单 / `[assets]`+`[ui]` TOML（纯函数，预览与导出共用） |
| `src/embed.js` / `src/raster.js` / `src/zip.js` | 素材内联 / canvas 栅格化 / 零依赖 zip |
| `src/backend.js` + `scripts/server.py` | 可选的服务端暂存（`/api/draft`） |

细节（模块边界、图层/焦点、开发服务、边界）见 [`docs/architecture.md`](docs/architecture.md)。

---

## 3. 功能范围

### 能做

| 类别 | 内容 |
|---|---|
| **布局** | 四类控件 + 边框/图片；7 层；多选、对齐、等间距、复制 |
| **参数绑定** | 按类型过滤：旋钮→`float`、拨杆/脚踏→`bool`、LED→`clip_indicator` |
| **素材** | 内置素材库；外部 SVG 导入到装饰/丝印（自包含存进 `.box.json`） |
| **预览** | L1 交互：旋钮旋转、拨杆两态、脚踏按住、旁通时 LED 去色 |
| **导出** | 素材包 zip / `panel.svg` / `panel.png` / `ui.toml` / `panel.box.json` |
| **暂存** | 顶栏「暂存」→ `.cache/designs/`，启动自动恢复（`?fresh=1` 跳过） |
| **验证** | `check.sh` 四步 + 浏览器冒烟（`?selftest=1` / `?probe=1`） |

### 暂不（有明确边界）

| 项 | 状态 |
|---|---|
| 框选 | 多选已可用，缺框选矩形 |
| 素材热重载 | 未做；改素材后刷新页面 |
| 1:1 打印 PDF | 未做；`panel.svg` 可作矢量源 |
| 数值显示 / 表头指针 | D0 明确不做，等真实需求 |
| 多位开关 | 走"多电路 + Branch"，面板上仍是普通拨杆（D0） |
| 多草稿列表 / 冲突合并 | 暂存只保留"上次一份" |

### 明确不做

| 不做 | 原因 |
|---|---|
| **DSP / 电路 / 参数范围** | 那是 rustomp 与插件项目的职责 |
| **插件身份**（名字 / AU 码 / VST3 id） | 由 `rustomp.toml` 的 `[plugin]`/`[au]` 决定 |
| **实时音频** | 设计器只做面板布局与预览 |
| **拖动移动** | 刻意关闭（D-012）：方向键 / 数值输入 / 对齐按钮更可控 |

---

## 4. 部署与运行

```bash
./scripts/dev.sh          # → http://localhost:8765/
./scripts/check.sh        # 素材清单 / 单测 / 示例导出 / 尺寸
```

- 零依赖：`index.html` + 原生 ES modules + 原生 SVG；没有 `npm install`、没有构建步骤；
- `scripts/dev.sh` 同时提供静态文件与可选的 `/api/draft` 暂存 API（Python 标准库）；
- 看示例：`http://localhost:8765/?demo=1`。

### 一屏操作

| 动作 | 操作 |
|---|---|
| **聚焦图层** | 点左下图层行；再点一次退出 → 全部虚化 |
| **新建元素** | 在该层聚焦状态下，**双击**左侧素材 |
| **选中 / 多选** | 单击；`Shift` / `⌘` 点选 |
| **移动** | 方向键 `0.1 mm`，`Shift+方向键` `1 mm`；或属性面板输入毫米 |
| **对齐 / 等间距** | 多选后，右侧面板按钮 |
| **编辑 / 预览** | `Tab` 或顶栏按钮 |
| **暂存 / 导出** | 顶栏「暂存」/「导出」 |

> **第一次打开画布是虚的 —— 这是设计**：先在左下「图层」点一行聚焦，那一层才可编辑。

完整操作（导入 SVG、预览语义、URL 调试参数、暂存 API）见
[`docs/workflows.md`](docs/workflows.md)；交付步骤见
[`docs/06-export-runbook.md`](docs/06-export-runbook.md)。

### 导出与验证

```bash
node scripts/export.mjs my.box.json --out ../rustomp/plugins/<插件>/assets
node scripts/preview.mjs my.box.json --out /tmp/preview.png
./scripts/check.sh
```

浏览器 PNG 与 CLI（Inkscape）PNG 像素尺寸一致、字节不同；需要可复现的权威产物时用 CLI 那份。

---

## 5. 契约

| 契约 | 内容 |
|---|---|
| **输入 `.box.json`** | 设计文件（`version: 1`）；素材自包含在 `imported[]` |
| **输出 `ui.toml`** | `[assets]` + `[ui]` 标记块，复制进插件 `rustomp.toml` |
| **输出素材** | `panel.png` 12 px/mm；控件贴图按 `[assets]` 名字命名 |
| **单位** | 1 单位 = 1 mm；`y` 向下；`svg_w:svg_h` 必须与画布比例一致 |

全字段、示例与设计器必须遵守的四条：见
[`docs/01-contract-panel-toml.md`](docs/01-contract-panel-toml.md)；
运行时语义见 [`docs/02-runtime-panelspec.md`](docs/02-runtime-panelspec.md)；
素材规范与坑见 [`docs/03-assets.md`](docs/03-assets.md)。

---

## 6. 文档

全部文档见 **[`docs/README.md`](docs/README.md)**（当前文档 + 历史归档 + 维护规则）。

**当前**：`status.md` / `architecture.md` / `workflows.md` / `verification.md` /
`00-decisions.md`（D-001…D-017）/ 01–03 契约 / `06-export-runbook.md`。

**历史**：[`DEVLOG.md`](DEVLOG.md)（D0 → D1.5 全过程）+
[`docs/history/`](docs/history/README.md)（已拍板的开放问题、早期方案评审）。

> **维护规则**：当前状态写 `status.md`；一旦描述过时，就移到 `docs/history/` 并留指针。
> DEVLOG 只追加。详见 [`docs/README.md`](docs/README.md)。

---

## 7. 许可证

GPL-3.0-or-later（[`LICENSE`](LICENSE)）。
