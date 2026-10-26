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
| `switch_up` | 路径 | 拨杆「上」态贴图 |
| `switch_down` | 路径 | 拨杆「下」态贴图 |
| *（任意键）* | 路径 | **自由映射**：旋钮贴图、额外拨杆贴图等都可以登记在这里，键就是 `asset`/`image_*` 引用的名字 |

> 运行时的 `Assets::images` 是按**名字**查的（`&[(&str, &[u8])]`），
> 所以 `[assets]` 的键必须与 `[[ui.knobs]].asset` / `image_up` / `image_down` 一致。

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
| `id` | string | 控件 id（仅文档/调试用，运行时不读） |
| `param` | string | 绑定的参数 id（`[[params]]` 里的 `id`） |
| `center` | `[x, y]` | 旋钮圆心 = **旋转中心** = **锚点**（素材坐标） |
| `radius` | f32 | 命中半径（点击/拖动区域） |
| `asset` | string | **整图旋转用的贴图名**（`[assets]` 里的键），导入 `Assets::images` |
| `image_size` | `[w, h]` | 贴图绘制尺寸（素材坐标）；旋转围绕 `center`，**建议正方形** |
| `render` | `"rotate" \| "pointer"` | 默认 `rotate`（整图旋转）；`pointer` 为写实素材保留 |
| `travel_deg` | f32 | **设计器只暴露这个**：总转角（默认 270）；导出成对称的 `angle_min/max` |
| `pointer_len` / `pointer_width` | f32 | **仅 `pointer` 模式**使用（rotate 模式忽略） |
| `drag_full_range_px` | f32 | 竖向拖动多少**屏幕像素**走完 0..1 全程 |

> **约定「素材指针朝上 ⇔ 参数 0.5」**：整图旋转时 0° 指向正上方。
> 因此 `angle_min + angle_max` 必须为 0（对称范围），否则指针会整体偏转 ——
> 所以设计器不暴露 `angle_min/max`，只暴露 `travel_deg`，导出时写 `−travel/2 .. +travel/2`。
> 用户导入的素材若指针不朝上，导出前由设计器**旋正**（不引入额外字段）。

### 3.2 `[[ui.leds]]`（可多个）

| 键 | 类型 | 说明 |
|---|---|---|
| `param` | string | 绑定的参数 id（一般是虚拟 id，如 `clip_indicator`，由插件提供活动量） |
| `center` | `[x, y]` | 圆心 |
| `radius` | f32 | 半径 |
| `off_color` / `on_color` | `"#rrggbb"` | 熄灭 / 点亮色（中间按 activity 插值） |

### 3.3 `[[ui.toggles]]`（可多个，拨杆）

| 键 | 类型 | 说明 |
|---|---|---|
| `param` | string | 绑定的**布尔**参数 id |
| `image_up` / `image_down` | string | 贴图名（对应 `[assets]` 里的键，如 `switch_up`） |
| `x` | f32 | 贴图左边界（素材坐标） |
| `y_up` / `y_down` | f32 | 两态各自的贴图顶部 y。**按"六边形中心 = 锚点"归一化后两者相等** |
| `width` / `height` | f32 | 贴图绘制尺寸（素材坐标） |
| `pivot` | `[x, y]` | 按下缩放的原点 = **六边形中心 = 锚点**（由设计器自动填，不让用户点） |
| `press_scale` | f32 | 按住时的缩放（0.9 = 缩到 90%） |

> `y_up` / `y_down` 仍然保留：导入素材可能无法归一化（两态图形尺寸差异过大）。
> **规范化之后两者相等**，legacy 那个"基线差 1.53、切换跳一下"的坑就此消失。

### 3.4 `[[ui.buttons]]`（可多个，如 bypass / 脚踏）

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

## 5. 设计器要遵守的四条

1. **只写 `[assets]` + `[ui]`**，`[plugin]/[au]/[[params]]` 原样保留（可以只替换这两个段）。
2. **`param` 必须指向真实存在的参数 id**（从 `[[params]]` 读），否则运行时不响应。
3. **坐标一律是素材坐标**，不要写屏幕像素（除了 `drag_full_range_px` 与 `window_*`）。
4. **跨类型叠放不可表达**：绘制顺序固定为
   `panel → leds → knobs → toggles → buttons`（`rustomp_gui::DRAW_ORDER`）。
   同类内部按数组顺序叠放；设计器的层列表照这个顺序**只读**显示。

## 6. 导出前必须过校验

`rustomp_gui::validate_panel(spec, assets)` 会拦住：

- `rotate` 旋钮的 `angle_min + angle_max ≠ 0`（指针会整体偏转）；
- `rotate` 旋钮缺 `asset` 贴图 / `image_size` 非法；
- 拨杆引用了不存在的贴图名；
- `radius == 0`（点不到）、`press_scale` 不在 (0, 1]。

> 设计器在"导出"按钮前跑一遍同样的检查（规则清单见 `rustomp-gui` 源码）。
