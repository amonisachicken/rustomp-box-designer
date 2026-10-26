# 契约：`rustomp.toml` 的 `[assets]` 与 `[ui]`

> 这是设计器**唯一**要产出的东西（外加 PNG 素材）。
> 字段全部来自 `rustomp` 仓库的 `crates/rustomp-gui` 与 `template/rustomp.toml`；
> 本文档只记录**现状**，不发明新字段（要加字段见 `04-open-questions.md`）。

---

## 1. 文件位置与单位

`rustomp.toml` 在**插件项目根目录**；素材路径**相对项目根**。

```text
<插件项目>/
├── rustomp.toml          ← 设计器写这里的 [assets] + [ui]
└── assets/
    ├── panel@2x.png      ← 面板底图（整张）
    ├── switch_up@4x.png  ← 拨杆贴图（上/下两态）
    └── switch_down@4x.png
```

**两套坐标，别混：**

| 坐标 | 用途 | 谁定义 |
|---|---|---|
| `svg_width` / `svg_height`（**素材坐标**） | 底图与所有控件的布局单位 | 设计器决定（通常取底图 SVG 的 viewBox） |
| `window_width` / `window_height`（**像素**） | 宿主窗口的初始逻辑尺寸 | 设计器决定 |

运行时按 `scale = min(可用宽/svg_w, 可用高/svg_h)` 等比缩放并居中（不是拉伸），详见 `02-runtime-panelspec.md`。

---

## 2. `[assets]`

| 键 | 类型 | 说明 |
|---|---|---|
| `panel` | 路径 | 面板底图 PNG |
| `switch_up` | 路径 | 拨杆「上」态贴图（只有 `[ui.toggle]` 用到时才需要） |
| `switch_down` | 路径 | 拨杆「下」态贴图 |

> 无 GUI 的插件不写 `[assets]` / `[ui]`；`plugin_meta.py` 已经能容忍缺失（E49）。

---

## 3. `[ui]`

| 键 | 类型 | 说明 |
|---|---|---|
| `svg_width` / `svg_height` | f32 | 素材坐标的画布尺寸 |
| `window_width` / `window_height` | u32 | 窗口逻辑尺寸（像素） |
| `background` | `"#rrggbb"` | 窗口底色（宿主给的区域比画布大时露出的颜色） |

### 3.1 `[[ui.knobs]]`（可多个）

| 键 | 类型 | 说明 |
|---|---|---|
| `id` | string | 控件 id（**仅文档/调试用**，运行时不读） |
| `param` | string | 绑定的参数 id（`[[params]]` 里的 `id`） |
| `center` | `[x, y]` | 旋钮圆心（素材坐标） |
| `radius` | f32 | 命中半径（也是指针绘制参考） |
| `pointer_len` | f32 | 指针长度（圆心到端点） |
| `pointer_width` | f32 | 指针线宽 |
| `angle_min` / `angle_max` | f32（度） | 指针角度范围；**0.5 的位置对着正上方**（0° 指向 −y） |
| `drag_full_range_px` | f32 | 竖向拖动多少**屏幕像素**走完 0..1 全程 |

### 3.2 `[ui.led]`（**至多一个**）

| 键 | 类型 | 说明 |
|---|---|---|
| `param` | string | 绑定的参数 id（一般是虚拟 id，如 `clip_indicator`，由插件提供活动量） |
| `center` | `[x, y]` | 圆心 |
| `radius` | f32 | 半径 |
| `off_color` / `on_color` | `"#rrggbb"` | 熄灭 / 点亮色（中间按 activity 插值） |

### 3.3 `[ui.toggle]`（**至多一个**，拨杆）

| 键 | 类型 | 说明 |
|---|---|---|
| `param` | string | 绑定的**布尔**参数 id |
| `image_up` / `image_down` | string | 贴图名（对应 `[assets]` 里的键，如 `switch_up`） |
| `x` | f32 | 贴图左边界（素材坐标） |
| `y_up` / `y_down` | f32 | **两态各自的贴图顶部 y** —— 必须各自对齐到同一视觉基线 |
| `width` / `height` | f32 | 贴图绘制尺寸（素材坐标） |
| `pivot` | `[x, y]` | 按下缩放的原点（通常取六边形基线中点） |
| `press_scale` | f32 | 按住时的缩放（0.9 = 缩到 90%） |

> `y_up` / `y_down` 分开写不是冗余：两态贴图的高度可能不同，
> 用同一个 y 会让切换瞬间"跳一下"。legacy 实测基线差 **1.53**（素材坐标）。

### 3.4 `[ui.button]`（**至多一个**，如 bypass）

| 键 | 类型 | 说明 |
|---|---|---|
| `param` | string | 绑定的**布尔**参数 id |
| `center` | `[x, y]` | 圆心 |
| `radius` | f32 | 命中半径 |
| `press_scale` | f32 | 按住时缩放 |

---

## 4. 完整示例（legacy Sparklin Drive，节选）

```toml
[assets]
panel = "assets/panel@2x.png"
switch_up = "assets/switch_up@4x.png"
switch_down = "assets/switch_down@4x.png"

[ui]
svg_width = 170.08
svg_height = 317.48
window_width = 340
window_height = 635
background = "#faf1e0"

[[ui.knobs]]
id = "level"
param = "level"
center = [43.41, 71.59]
radius = 27.86
pointer_len = 24.59
pointer_width = 0.98
angle_min = -135.0
angle_max = 135.0
drag_full_range_px = 260.0

[ui.led]
param = "clip_indicator"
center = [85.04, 33.83]
radius = 8.5
off_color = "#a00000"
on_color = "#ff0000"

[ui.toggle]
param = "symmetric"
image_up = "switch_up"
image_down = "switch_down"
x = 73.49
y_up = 108.455
y_down = 109.985
width = 23.68
height = 25.21
pivot = [85.33, 121.825]
press_scale = 0.9
```

---

## 5. 设计器要遵守的三条

1. **只写 `[assets]` + `[ui]`**，`[plugin]/[au]/[[params]]` 原样保留（可以只替换这两个段）。
2. **`param` 必须指向真实存在的参数 id**（从 `[[params]]` 读），否则运行时不响应。
3. **坐标一律是素材坐标**，不要写屏幕像素（除了 `drag_full_range_px` 与 `window_*`）。
