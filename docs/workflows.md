# 工作流（从打开到交付）

> 这是"现在怎么做"的操作手册。契约见 [`01-contract-panel-toml.md`](01-contract-panel-toml.md)
> 与 [`02-runtime-panelspec.md`](02-runtime-panelspec.md)；交付细节见
> [`06-export-runbook.md`](06-export-runbook.md)。

---

## 1. 跑起来

```bash
./scripts/dev.sh          # → http://localhost:8765/
./scripts/check.sh        # 素材清单 / 单测 / 示例导出 / 尺寸
```

- 零依赖：`index.html` + 原生 ES modules + 原生 SVG；没有 npm install / 构建步骤；
- `dev.sh` 用 Python 标准库同时提供静态文件和可选的 `/api/draft`；
- 直接看示例：`http://localhost:8765/?demo=1`。

> **第一次打开画布是虚的 —— 这是设计**：先在左下「图层」点一行聚焦，那一层才可编辑。

---

## 2. 一屏操作

| 动作 | 操作 |
|---|---|
| **聚焦图层** | 点左下图层行（或名字）；再点一次退出 → 全部虚化 |
| **新建元素** | 在该层聚焦状态下，**双击**左侧素材 |
| **选中 / 多选** | 单击；`Shift` / `⌘` 点选加入或移除 |
| **移动** | 方向键 `0.1 mm`，`Shift+方向键` `1 mm`；或右侧属性面板输入毫米 |
| **对齐 / 等间距** | 多选后，右侧面板按钮（基准可选“对选区”/“对画布”） |
| **改参数绑定** | 右侧下拉（只列类型匹配的参数） |
| **撤销 / 重做** | `⌘Z` / `⇧⌘Z`（`Ctrl+Y` 也行） |
| **删除** | `⌫` |
| **编辑 / 预览** | `Tab` 或顶栏按钮 |
| **导入 SVG** | 先聚焦「装饰」或「丝印」→「＋ 导入 SVG…」→ 选类别 |
| **暂存** | 顶栏「暂存」→ 写本地服务端缓存；下次打开自动恢复 |
| **导出** | 顶栏「导出」→ 下载素材包 zip |

**拖动是刻意关掉的**（D-012）：旧版"0.5 mm 栅格 + 吸附 + 每帧整块重渲染"手感不可控；
现在移动只有方向键 / 数值输入 / 对齐按钮三条精确路径。

---

## 3. 控件与图层

| 元素 | 尺寸来源 | 绑定 |
|---|---|---|
| **旋钮** | 素材（命中半径 = 贴图宽/2） | 只能绑 `float`，行程固定 270°（指针朝上 ⇔ 0.5） |
| **拨杆** | 素材两态 | 只能绑 `bool`；两态 `y` 差是六边形中心补偿 |
| **LED** | 素材镜片内圈半径 | 只能绑 `clip_indicator`（引擎活动量） |
| **脚踏** | 素材宽/2；按住态整张换图 | 只能绑 `bool`（通常是 `bypass`） |
| `frame` | 贴画布的圆角边框 | 纯装饰，压平进底图 |
| `image` | 内置丝印 / 外部导入 SVG | 纯装饰/丝印 |

7 层顺序（自下而上）：

```text
background → artwork → silkscreen → knobs → toggles → leds → buttons
```

- 没有焦点 = 全部虚化且不可交互；
- 显隐（眼睛）与焦点正交：隐藏 = 不渲染/不导出；焦点 = 不可编辑；
- 焦点是会话状态，不写进 `.box.json`。

---

## 4. 预览（L1）

拖旋钮转指针（向上=增大）、点拨杆换态、按住脚踏看按住态、点脚踏切换旁通
（旁通时 LED 去色变灰且不闪，与真插件同一套色值）。

---

## 5. 导出

顶栏「导出」→ **素材包 zip**：

| 文件 | 说明 |
|---|---|
| `panel.svg` | 面板矢量（自包含，可 1:1 打印） |
| `panel.png` | `mm × 12 px/mm`（60×112 mm → 720×1344） |
| `<knob>.png` / `<toggle>_up|down.png` / `<footswitch>_hold.png` | 控件贴图 |
| `ui.toml` | `[assets]` + `[ui]` 标记块 |
| `panel.box.json` | 设计文件本身 |

浏览器 PNG 与 CLI（Inkscape）PNG **像素尺寸一致、字节不同**；要权威产物跑：

```bash
node scripts/export.mjs my.box.json --out ../rustomp/plugins/<插件>/assets
node scripts/preview.mjs my.box.json --out /tmp/preview.png
```

完整交付步骤（6 步 + 验收 + 常见问题）见 [`06-export-runbook.md`](06-export-runbook.md)。

---

## 6. 暂存到服务端

```text
POST /api/draft { name, doc }  → <repo>/.cache/designs/<清洗后的名字>.box.json + last
GET  /api/draft               → 上次暂存（启动自动恢复）
```

- 写一份并**清空撤销/重做**（与 `rustomp-circuit-designer` 一致）；
- `BOXD_DATA=/path` 可改缓存目录；`.cache/` 已 gitignore；
- 静态托管（GitHub Pages 等）没有这个 API：按钮在状态栏提示失败，画图/导出不受影响；
- `?fresh=1` 跳过启动恢复；`?demo=1` / `?selftest=1` 也不恢复。

---

## 7. 外部 SVG 导入

| 规则 | 说明 |
|---|---|
| 类别手选 | 只能导入到「装饰 artwork」或「丝印 silkscreen」 |
| 自包含 | SVG 文本存进 `.box.json` 的 `imported[]`，不依赖外部文件 |
| 出现位置 | 左侧素材库对应分组，双击使用 |
| 尺寸 | 从 `viewBox` 读（pt→mm）；没有则退用 `width/height`；都读不出就报错 |

---

## 8. 调试开关与验证

| URL 参数 | 作用 |
|---|---|
| `?demo=1` | 载入 `examples/sparklin.box.json` |
| `?fresh=1` | 不恢复服务端暂存 |
| `?focus=knobs` | 启动即聚焦某图层 |
| `?mode=preview` | 启动即进预览 |
| `?selftest=1` | 无头冒烟：加元素 / 输入 / 导入 / 素材包，结果打状态栏 |
| `?probe=1` | 把浏览器栅格化的 `panel.png` 贴回画布 |

验证命令与覆盖范围见 [`verification.md`](verification.md)。
