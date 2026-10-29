# rustomp-box-designer

**插件面板设计器** —— 在画布上摆旋钮/拨杆/LED/脚踏，导出 `rustomp.toml` 的 `[assets]`+`[ui]` 段与素材 PNG，
交给 [rustomp](https://github.com/amonisachicken/rustomp) 的 `rustomp-gui` 在宿主里渲染。

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

**状态（2026-10-27）：D0 与 D1 全部可用，已用它做出并验证了真插件（Sparklin Drive v2，用户自绘面板）。**

---

## 30 秒跑起来

```bash
./scripts/dev.sh          # → http://localhost:8765/   零依赖：只要 python3 + Node(测试用)
./scripts/check.sh        # 素材清单 / 单测（含暂存 API）/ 导出 / 产物尺寸，一条命令全绿
```

没有 `npm install`，没有构建步骤：`index.html` + 原生 ES modules + 原生 SVG。
`scripts/dev.sh` 同时提供静态文件与一个**可选的本地暂存 API**（Python 标准库）。

想直接看东西：`http://localhost:8765/?demo=1`（载入示例面板）。

**第一次打开时画布是虚的 —— 这是设计，不是 bug**：先在左下「图层」点一行聚焦，
那一层才可编辑（详见下文「焦点」）。

---

## 怎么用（一屏说明）

| 动作 | 操作 |
|---|---|
| **聚焦图层** | 点左下图层行（或名字）。再点一次退出 → 全部虚化 |
| **新建元素** | 在该层聚焦状态下，**双击**左侧素材 |
| **选中 / 多选** | 单击；`Shift` / `⌘` 点选加入或移除 |
| **移动** | 方向键 `0.1 mm`，`Shift+方向键` `1 mm`；或右侧属性面板直接输入毫米 |
| **对齐 / 等间距** | 多选后，右侧面板的按钮（基准可选"对选区"或"对画布"） |
| **改参数绑定** | 右侧下拉（只列出类型匹配的参数） |
| **撤销 / 重做** | `⌘Z` / `⇧⌘Z`（`Ctrl+Y` 也行），一次操作一步 |
| **删除** | `⌫` |
| **编辑 / 预览** | `Tab` 或顶栏按钮 |
| **导入 SVG** | 先聚焦「装饰」或「丝印」→「＋ 导入 SVG…」→ 手选类别 |
| **暂存** | 顶栏「暂存」→ 写到本地服务端缓存；下次打开自动恢复（静态托管时不可用） |
| **导出** | 顶栏「导出」→ **下载素材包（zip）**（8 个文件，PNG 由浏览器栅格化） |

**拖动是刻意关掉的**：旧版的"0.5 mm 栅格 + 吸附 + 每帧整块重渲染"手感不可控，
现在移动只有三条精确路径（方向键 / 数值输入 / 对齐按钮）。

### 暂存（服务端草稿）

顶栏「暂存」把当前 `.box.json` 写到本地服务端：

```text
POST /api/draft { name, doc }  → <repo>/.cache/designs/<name>.box.json + last 指针
GET  /api/draft               → 上次暂存（启动时自动恢复）
```

- 与 `rustomp-circuit-designer` 的「保存到服务端」同语义：**写一份、清空撤销/重做**；
- 缓存目录可用 `BOXD_DATA=/path` 覆盖；
- 文件名的路径分隔符/危险字符会被清洗；`last` 指针丢失时回退到最新一份；
- 用静态服务器（例如 GitHub Pages）打开时没有这个 API：按钮会在状态栏提示失败，画图/导出不受影响；
- `?fresh=1` 可跳过启动时的自动恢复。

### 预览（L1）

拖旋钮转指针（向上=增大）、点拨杆换态、按住脚踏看按住态、点脚踏切换旁通
（**旁通时 LED 去色变灰且不闪**，与真插件同一套色值）。

---

## 四类控件 + 两个纯美术元素

| 元素 | 尺寸来源 | 绑定 |
|---|---|---|
| **旋钮** | 素材（命中半径 = 贴图宽/2） | 只能绑 `float` 参数，行程写死 270°（指针朝上 ⇔ 0.5） |
| **拨杆** | 素材两态（各自一张） | 只能绑 `bool` 参数；两态 `y` 差是**六边形中心补偿**，不是对齐错误 |
| **LED** | 素材**镜片内圈**半径 | 只能绑 `clip_indicator`（虚拟指示量，读引擎活动量） |
| **脚踏** | 素材宽/2；按住态**整张换图** | 只能绑 `bool` 参数（通常是 `bypass`） |
| `frame` | **贴画布**的圆角边框，只调内缩/圆角/线宽 | 纯装饰，压平进底图 |
| `image` | 内置丝印标签 or 外部导入的 SVG | 纯装饰/丝印 |

> 尺寸与行程**都不给用户调**：它们由素材与框架契约决定，调了只会让点击区与美术对不上
> （见 `docs/00-decisions.md` D-013 / D-014 / D-015）。

---

## 图层与焦点

7 层，按"它最后去哪"划分：

```text
背景 background → 装饰 artwork → 丝印 silkscreen → 旋钮 knobs → 拨杆 toggles → LED leds → 脚踏 buttons
```

- **没有焦点 = 全部虚化且不可交互**（素材库同样变灰）
- 焦点把"现在改哪一层"变成显式状态，避免"以为在改 A 层其实动了 B 层"
- 显隐（眼睛按钮）与焦点正交：隐藏 = 不渲染/不导出；焦点 = 不可编辑
- 焦点是会话状态，**不写进 `.box.json`**

---

## 导出：一键素材包

顶栏「导出」→ **下载素材包（zip）**：

| 文件 | 说明 |
|---|---|
| `panel.svg` | 面板矢量（自包含，可 1:1 打印） |
| `panel.png` | `mm × 12 px/mm`（60×112 mm → 720×1344） |
| `<knob>.png` / `<toggle>_up|down.png` / `<footswitch>_hold.png` | 控件贴图 |
| `ui.toml` | `[assets]` + `[ui]` 标记块 |
| `panel.box.json` | 设计文件本身（可回来继续改） |

PNG 由**浏览器 canvas** 栅格化；想要 Inkscape 出的"权威"版本就跑 CLI：

```bash
node scripts/export.mjs my.box.json --out ../rustomp/plugins/<插件>/assets
node scripts/preview.mjs my.box.json --out /tmp/preview.png     # 带控件，等同宿主里的样子
```

接进插件的完整步骤（6 步命令 + 验收 + 常见问题）见 **`docs/06-export-runbook.md`**。

---

## 外部 SVG 导入

| 规则 | 说明 |
|---|---|
| 类必须手选 | 只能导入到**装饰 artwork** 或 **丝印 silkscreen**（控件层要两态贴图/旋转语义，走内置素材） |
| 自包含 | SVG 文本存进 `.box.json` 的 `imported[]`，设计文件不依赖外部文件 |
| 出现位置 | 左侧素材库对应分组，双击使用 |
| 尺寸 | 从 `viewBox` 读（pt→mm），没有就退用 `width/height`，都读不出就报错 |

---

## 代码结构

```text
index.html              三栏界面（素材库+图层 / 画布 / 属性面板）
src/main.js             交互：焦点、选中、多选、对齐、预览、导入、导出弹窗
src/model.js            .box.json 模型、元素工厂、bbox、对齐/分布、校验、导入素材
src/exporter.js         面板 SVG / 贴图清单 / [assets]+[ui] TOML（**纯函数**，预览与导出共用）
src/embed.js            素材内联：展开 CSS 类、删 id、嵌套 viewBox 裁剪
src/raster.js           浏览器 canvas 栅格化 SVG → PNG（素材包用）
src/zip.js              零依赖 store 模式 zip 写入（带 CRC32）
src/backend.js          服务端暂存客户端（draft.save / draft.last）
src/assets.gen.js       素材清单（由 scripts/gen-assets.mjs 从 viewBox 自动生成，入库可 diff）
assets/                 3 旋钮 / 20 丝印标签 / 3 LED / 6 开关 + 脚踏（含按住态）
scripts/gen-assets.mjs  扫素材 → 清单（--check 防漂移）
scripts/export.mjs      .box.json → SVG + PNG(Inkscape) + ui.toml
scripts/preview.mjs     渲染带控件的预览图（＝宿主里的样子）
scripts/check.sh        一条命令跑完全部校验
scripts/server.py       本地开发服务：静态文件 + /api/draft 暂存 API（Python 标准库）
tests/                  node --test：内联 / 模型 / 导出 / zip / 暂存 API
examples/sparklin.box.json   用设计器复刻的真实面板
docs/                   契约、运行时语义、素材规范、决策记录、交接手册
```

### 调试开关（URL 参数）

| 参数 | 作用 |
|---|---|
| `?demo=1` | 载入 `examples/sparklin.box.json` |
| `?fresh=1` | 不恢复服务端暂存，从空白面板开始 |
| `?focus=knobs` | 启动即聚焦某图层（`knobs`/`leds`/`artwork`…） |
| `?mode=preview` | 启动即进预览 |
| `?selftest=1` | 无头冒烟：加元素 / 输入 / 导入 / 素材包，结果打在状态栏（给 CI 用） |
| `?probe=1` | 把浏览器栅格化出的 `panel.png` 贴回画布，肉眼核对 |

---

## 设计器的边界

| 做 | 不做 |
|---|---|
| 面板布局（控件位置、丝印、贴图） | DSP、电路、参数范围 |
| 素材管理与导出 | 插件身份（名字 / AU 码 / VST3 id） |
| 生成 `[assets]` + `[ui]` | 改 `[plugin]` / `[au]` / `[[params]]` |
| 预览面板交互 | 实时音频 |

参数表由插件作者维护，设计器只**读**它来决定"哪些参数能绑到控件上"。

---

## 已知限制与后续

**限制**

- 未做：框选、素材热重载、1:1 打印 PDF、数值/表头显示（多位开关按 D0 决定不做，走"多电路"）
- 拖动已禁用（取舍见 D-012）：定位完全依赖方向键与数值输入
- 浏览器 PNG 与 Inkscape PNG **像素尺寸一致、字节不同**（抗锯齿实现不同）；CI 用 CLI 那份
- 只支持 `.box.json` 一种工程格式，没有版本迁移链（只有 `version: 1` 与 `load()` 的字段补齐）

**下一步候选**

1. 素材包"自动安装"：zip 拖进设计器 → 直接改写插件 `rustomp.toml` + 拷素材（把 6 步压成 1 步）
2. 框选（多选已可用，缺的是框选矩形）
3. `frame` 支持更多外壳（125B / 1590BB 之外的异形）与刻度环工具
4. 素材库分组与搜索（32 个素材还行，上百个就需要了）

---

## 文档

| 文档 | 内容 |
|---|---|
| **`docs/00-decisions.md`** | **决策记录 D-001…D-016**（结论 + 理由 + 影响），改动前先看这里 |
| `docs/01-contract-panel-toml.md` | 契约：`rustomp.toml [assets]/[ui]` 每个字段、单位、默认值 |
| `docs/02-runtime-panelspec.md` | 运行时语义：坐标缩放、旋钮角度、拨杆基线、LED、贴图生命周期 |
| `docs/03-assets.md` | 素材规范与坑（alpha、六边形基线 0.54 mm、pt→mm、内联三坑） |
| `docs/04-open-questions.md` | 当初的 9 个开放问题（已全部拍板，保留作理由存档） |
| `docs/05-spec-review.md` | 方案评审（图层/图形库/mm 坐标/画布预设）与 v0.2 规范草案 |
| **`docs/06-export-runbook.md`** | **交接手册**：导出 → 装进插件（6 步命令、缺件清单、验收 5 条、常见问题） |
| `DEVLOG.md` | 开发复盘：D0 → D1.5 的完整过程、踩过的坑、每次改动的理由 |

---

## 许可证

GPL-3.0-or-later（`LICENSE`）。
