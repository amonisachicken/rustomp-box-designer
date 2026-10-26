# 从设计器到插件：导出交接手册（runbook）

> 这份文档只讲一件事：**你在设计器里点了「导出」，接下来怎么把它变成能装进宿主的插件。**
> 2026-10-26 按真实交接跑过一遍（Sparklin Drive v2），步骤与命令都在下面。

---

## 0. 你会拿到什么

### 推荐：一键「下载素材包（zip）」

一次拿到 **11 个文件**，全部就位、不必再手工栅格化：

```text
panel.svg   panel.png
knob_round_dark.png   toggle_small_up.png   toggle_small_down.png   3pdt_alt_hold.png
ui.toml   panel.box.json
```

把 PNG 放进 `assets/`、把 `ui.toml` 的块贴进 `rustomp.toml`，然后直接跳到第 4 步。

> PNG 由**浏览器 canvas** 栅格化（12 px/mm）；想要 Inkscape 出的"权威"版本就跑第 2、3 步的 CLI。
> 两者像素尺寸完全一致，只有抗锯齿的极小差异。

### 或者：单件导出

导出弹窗里还有两个单件按钮：

| 文件 | 内容 | 说明 |
|---|---|---|
| `ui.toml` | `# >>> rustomp-box-designer` … `# <<<` 标记块 | 里面是 `[assets]` + `[ui]` 两段，**直接整段替换**进插件的 `rustomp.toml` |
| `panel.svg` | 底图（背景+装饰+丝印+LED 底座+脚踏美术） | 自包含、mm 单位，可直接 1:1 打印，也可以栅格化成 PNG |

**单件模式没给你的**：`panel.png` 与控件贴图。它们由第 2、3 步生成
（`ui.toml` 的 `[assets]` 会点名它们，缺文件时 `rustomp-gen` 在生成阶段就报错）。

---

## 1. 把 `[assets]` + `[ui]` 塞进 `rustomp.toml`

`rustomp.toml` 里只允许设计器改这两段，其余（`[plugin] [au] [build] [circuit] [[params]]`）由插件作者维护。

```bash
cd plugins/<你的插件>
# 用编辑器把 [assets] 到文件末尾替换成下载的 ui.toml 内容
```

或者一条命令（截断后再拼接，因为 `[ui]` 之后没有别的段）：

```bash
python3 - <<'PY'
import pathlib
p = pathlib.Path('rustomp.toml'); s = p.read_text(encoding='utf-8')
new = pathlib.Path('~/develop/inbox/ui.toml').expanduser().read_text(encoding='utf-8')
p.write_text(s[:s.index('[assets]')] + new, encoding='utf-8')
PY
```

> ⚠️ 如果 `[ui]` 后面还有你自己的段，别用这条命令 —— 手工只替换标记块之间的内容。

---

## 2. 底图：`panel.svg` → `panel.png`

12 px/mm 是全局约定（= 304.8 dpi，逻辑窗口 mm × 6 的 2 倍）。

```bash
# 60 mm 宽 → 720 px
inkscape --export-type=png --export-width=720 \
         --export-filename=assets/panel.png assets/panel.svg
```

`--export-width` 用「面板宽（mm）× 12」算，高度会按比例自动出来（60×112 → 720×1344）。

**别信 PNG 里的 DPI 元数据**，判断清晰度只看「像素 ÷ 物理尺寸」。

---

## 3. 控件贴图（`[assets]` 里点名的那几张）

| 文件 | 尺寸来源 | 注意 |
|---|---|---|
| `<knob>.png` | 素材原始尺寸（如 `knob_round_dark` = 20 mm → 240 px） | 指针朝上，运行时整图旋转 |
| `<toggle>_up.png` / `_down.png` | 素材原始尺寸（8.35×8.89 mm → 100×107 px） | 两态各自一张，**不要**自己对齐 |
| `<footswitch>_hold.png` | 与常态同尺寸 | 按住态，整张换 |

一次全出（推荐，带尺寸校验）：

```bash
cd ~/develop/rustomp-box-designer
node scripts/export.mjs examples/<你的>.box.json --out /tmp/export
# 逐行打印 ARTIFACT: <路径>，把 png 拷到插件 assets/
```

---

## 4. 生成插件代码

```bash
cd ~/develop/rustomp
cargo run -q -p rustomp-gen -- plugins/<你的插件>
```

生成三个跟界面有关的文件：

| 文件 | 来源 |
|---|---|
| `plugin/src/generated/panel.rs` | `[ui]` → `PanelSpec` |
| `plugin/src/generated/bridge.rs` | `[[params]]` → `ParamAccess`（界面 ↔ 参数的桥） |
| `plugin/src/generated/assets.rs` | `[assets]` → `PANEL_PNG` + `IMAGES`（`include_bytes!`） |

缺素材文件会在这一步报错（比等 cargo 报 include 路径好懂）。

---

## 5. 自检 + 构建

```bash
cargo test -p <插件> --features gui --release     # validate_panel：参数/素材/越界/角度对称
./scripts/build-all.sh                            # 会自动先跑一次 rustomp-gen
```

`build-all.sh` 装好后会跑 `au_smoke`，输出里应该看到：

```text
[ ok ] 提供自定义界面（CocoaUI）
[info] 渲染 512 帧: 非有限值=0, 输出均值=…, RMS=…
[ ok ] 音频通路正常（1kHz 正弦已通过电路）
```

> RMS 与"无界面版"完全一致 = 界面没有碰到音频路径（这是设计目标，不是巧合）。

---

## 6. 宿主里验收（5 条）

| # | 看什么 |
|---|---|
| 1 | 面板清晰度：丝印是矢量标签（不是宿主字体渲染） |
| 2 | 旋钮：拖到两端，指针与刻度一致；松手不跳 |
| 3 | 拨杆：切换时**六边形不跳**（设计器已按六边形中心补偿 `y_down`） |
| 4 | LED：削波时亮、松开衰减；**踩旁通时变灰不闪** |
| 5 | 脚踏：按下显示按住态；点击切换旁路（点按切换，不是按住） |

宿主可能缓存旧图形 —— 在插件管理器里 **Reset & Rescan** 一次。

---

## 常见问题

| 现象 | 原因 | 修法 |
|---|---|---|
| `rustomp-gen` 报 `[assets] x = "…" 指向的文件不存在` | 只拿了 `ui.toml`，没拿贴图 | 回到第 3 步 |
| 面板糊 | `--export-width` 写小了 | 用 `面板宽 mm × 12` |
| 旋钮点击区偏了 | 手改了 `[ui]` 里的 `radius` | 别手改：命中半径由设计器按素材算出 |
| 拨杆切换时图形跳 | 手写了 `y_up == y_down` | 两态 y 差是**补偿值**，不要"对齐"成同一个数 |
| 界面不出现 | `build.gui = false` 或没有 `[ui]` | `[build] gui = true` |
| 设计稿里有**导入的 SVG**，CLI 报 `素材缺少 viewBox` | 旧版 CLI 不认 `box.json.imported[]` | 已修（DEVLOG E68 / D-016）；或直接用浏览器素材包 |
| 拖了旋钮没反应 | 参数 id 绑错类型（旋钮绑了 bool） | 设计器的校验会报「只能绑 float 类型参数」 |

---

## 关于「文件在哪」

设计器的导出走浏览器下载。若你希望用命令行/脚本再处理这些文件，
注意 macOS 的 TCC 会拦住终端读 `~/Downloads`（`Operation not permitted`）。

养成一个习惯：导出后把它们放到项目目录或固定收件箱，例如

```bash
mkdir -p ~/develop/inbox
cp ~/Downloads/ui.toml ~/Downloads/panel.svg ~/develop/inbox/
```
