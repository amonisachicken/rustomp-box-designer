# 运行时语义：`rustomp-gui` 怎么画面板

> 设计器画出来的东西**最终由这段代码渲染**。文档里写的是"渲染端的既定行为"，
> 设计器必须让它设计的面板在这套规则下看着对。
> 来源：`rustomp/crates/rustomp-gui/src/lib.rs`（约 350 行）。

---

## 1. 缩放与坐标

```rust
let scale = (avail.width() / spec.svg_w).min(avail.height() / spec.svg_h);
let rect  = Rect::from_center_size(avail.center(), vec2(svg_w * scale, svg_h * scale));
let to_screen = |p| pos2(rect.left() + p.0 * scale, rect.top() + p.1 * scale);
```

要点：

- **等比缩放 + 居中留边**（不拉伸）→ 设计器必须按 `svg_w : svg_h` 的比例出图，
  否则宿主窗口比例不同时会有留边（露出 `background` 色）。
- 所有控件坐标都是**素材坐标**，运行时统一乘 `scale`。
- 宿主可以改变窗口尺寸；布局会重新缩放，但**相对位置不变**。

---

## 2. 面板底图与贴图生命周期

- 底图按 `rect 尺寸 × pixels_per_point` 生成一次纹理，**尺寸变了才重建**。
- 具名贴图（拨杆两态）**按需加载**，键就是 `[assets]` 里的名字。
- ⚠️ **纹理句柄绑定 egui Context**：窗口重开（新建 Context）后旧句柄全部失效。
  插件必须在 `create_egui_editor` 的 setup 回调里调用 `rustomp_gui::reset_textures(state)`。
  → 这条是插件侧的责任，但**设计器在"预览"里也要遵守同样的生命周期**（自己实现预览时注意）。

---

## 3. 各控件的交互与绘制

### 3.1 旋钮 `KnobSpec`

| 行为 | 规则 |
|---|---|
| 值域 | 0..1（归一化）；真实参数范围由 `ParamAccess` 背后的 nih-plug 参数决定 |
| 角度映射 | `angle = angle_min + value * (angle_max - angle_min)`；**0.5 对正上方（0°）** |
| 拖动 | 竖向拖动，`drag_range` 屏幕像素走完全程；双击回 0.5；滚轮微调 |
| 渲染 A（默认） | **整图旋转**：`KnobSpec.image` 按 `image_size` 贴到 `center`，绕中心转 `angle` |
| 渲染 B | **指针线**：从 `center` 画长 `pointer_len`、宽 `pointer_width` 的线（颜色固定近白 `0xf5f5f5`，线宽 ≥2px） |

**约定：素材指针朝上 ⇔ 参数 0.5**（所以 `angle_min + angle_max == 0`）。
导出前素材必须"指针朝上"；设计器负责把导入的素材旋正。

> 两种渲染的取舍：整图旋转与素材风格一致（扁平风），但**阴影/高光也会跟着转**；
> 写实素材请用 `pointer` 模式（旋钮本体压平进底图，只有指针转）。

### 3.2 指示灯 `LedSpec`

- `activity`（0..1，插件给的活动量）→ 在 `off_color` 与 `on_color` 之间插值，画实心圆。
- 插件通常用"快起慢落"包络把削波强度变成 activity（150 ms 释放）。

> 设计器：底图上灯的位置要**空出来**（或画成熄灭态的颜色，让运行时覆盖）。

### 3.3 拨杆 `ToggleSpec`

- 布尔参数 `0` → `image_up`，`1` → `image_down`。
- 两态**各自的 y**（`y_up`/`y_down`）；**按"六边形中心 = 锚点"归一化后两者相等**。
- 交互：点击命中矩形（`x..x+width`, `y_*. .+height`）切换；按住时以 `pivot` 为原点缩放到 `press_scale`。
- 交互 id 用 `(kind, index)`，因此**两个拨杆可以绑同一个参数**（联动）。

### 3.4 按钮 `ButtonSpec`

- 布尔参数；外形不变，只有按下时以 `center` 为原点缩放 `press_scale`。
- 判定"按住"要用 `Response::is_pointer_button_down_on()`（不是 `clicked()`），否则看着不跟手。
- 按钮的**美术在底图里**（运行时按 `center±radius` 抠出来缩放），所以多个按钮互不影响。

---

## 4. 参数桥 `ParamAccess`

```rust
pub trait ParamAccess {
    fn get(&self, id: &str) -> Option<f32>;   // 归一只 0..1
    fn set(&self, id: &str, value: f32);
}
```

- **布尔参数用 0.0 / 1.0 表示**（`get` 返回 0 或 1）。
- 虚拟 id（如 `clip_indicator`）可以由插件**只读不写**地提供（GUI 拿它当活动量）。
- 设计器不需要知道参数类型，只需要知道 **id 字符串**。

---

## 5. 当前能力边界（会影响设计器的控件库）

| 控件 | 数量上限 | 备注 |
|---|---|---|
| 旋钮 | **不限** | 支持整图旋转（默认）或指针线 |
| 指示灯 | **不限** | |
| 拨杆 | **不限** | 每个两张贴图 |
| 按钮 | **不限** | 美术必须压平进底图 |
| 文字/丝印 | **无** | 只能画进底图（运行时不渲染文字） |

**绘制顺序是固定的**（`rustomp_gui::DRAW_ORDER`）：

```text
panel.png → leds → knobs → toggles → buttons
```

跨类型不可重排 —— 例如"LED 压在旋钮上"无法表达；同类内部按数组顺序叠放。

---

## 6. 设计器"预览"要复刻的最小行为

如果设计器自带预览（强烈建议），至少要能复刻：

1. 等比缩放 + 居中（窗口比例不同时留边）；
2. 旋钮指针的角度映射（`0.5` 对正上方）；
3. 拨杆两态切换 + 各自的 y；
4. LED 的颜色插值（`off → on`）；
5. 按住缩放（`press_scale`，原点 `pivot`/`center`）。
