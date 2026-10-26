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
| 角度映射 | `angle = angle_min + value * (angle_max - angle_min)`；**0.5 对正上方** |
| 拖动 | 竖向拖动，`drag_range` 屏幕像素走完全程；按住 `Shift` 通常是精调（如实现） |
| 绘制 | 从 `center` 沿角度画一条长 `pointer_len`、宽 `pointer_width` 的线（覆盖在底图上） |

> 结论：**旋钮的"看起来"由底图决定，指针由运行时画**。
> 设计器要么在底图上留出指针区域（不要把指针画进底图），要么就接受指针被覆盖。

### 3.2 指示灯 `LedSpec`

- `activity`（0..1，插件给的活动量）→ 在 `off_color` 与 `on_color` 之间插值，画实心圆。
- 插件通常用"快起慢落"包络把削波强度变成 activity（150 ms 释放）。

> 设计器：底图上灯的位置要**空出来**（或画成熄灭态的颜色，让运行时覆盖）。

### 3.3 拨杆 `ToggleSpec`

- 布尔参数 `0` → `image_up`，`1` → `image_down`。
- 两态**各自的 y**（`y_up`/`y_down`）；高度可以不同，但视觉基线必须一致。
- 交互：点击命中矩形（`x..x+width`, `y_*. .+height`）切换；按住时以 `pivot` 为原点缩放到 `press_scale`。
- ⚠️ legacy 实测：两态贴图的六边形基线差 **1.53（素材坐标）**，用同一个 y 会跳。

### 3.4 按钮 `ButtonSpec`

- 布尔参数；外形不变，只有按下时以 `center` 为原点缩放 `press_scale`。
- 判定"按住"要用 `Response::is_pointer_button_down_on()`（不是 `clicked()`），否则看着不跟手。

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
| 旋钮 | **不限**（`&'static [KnobSpec]`） | |
| 指示灯 | **1 个**（`Option<LedSpec>`） | |
| 拨杆 | **1 个**（`Option<ToggleSpec>`） | 两态贴图 |
| 按钮 | **1 个**（`Option<ButtonSpec>`） | |
| 文字/丝印 | **无**（只能画进底图） | 底图是 PNG，文字不可选中、不可改 |

> 如果面板想要"两个拨杆"或"三个指示灯"，需要**先扩展 `rustomp-gui`**
> （把 `Option<T>` 改成 `&'static [T]`）。这是设计器规范的第一个待定项，见 `04-open-questions.md`。

---

## 6. 设计器"预览"要复刻的最小行为

如果设计器自带预览（强烈建议），至少要能复刻：

1. 等比缩放 + 居中（窗口比例不同时留边）；
2. 旋钮指针的角度映射（`0.5` 对正上方）；
3. 拨杆两态切换 + 各自的 y；
4. LED 的颜色插值（`off → on`）；
5. 按住缩放（`press_scale`，原点 `pivot`/`center`）。
