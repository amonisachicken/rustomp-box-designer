# 架构

> 设计器是**纯静态浏览器应用**：没有构建步骤、没有 npm 运行时依赖、没有 Rust 后端。
> 开发服务只多做一件事：可选的本地暂存 API（D-017）。

---

## 1. 数据流

```text
 .box.json（设计文件，唯一事实来源，D-002）
   │
   ├─ 浏览器预览 ──► panelSvg(..., controls:true)
   │
   └─ 导出 ──► panel.svg / panel.png（12 px/mm）
              ├─ 控件贴图（旋钮 / 拨杆两态 / 脚踏按住态）
              ├─ ui.toml（[assets] + [ui] 标记块）
              └─ panel.box.json（设计文件本身）
                        │
                        ▼
                 rustomp.toml ──► rustomp-gen ──► panel.rs + assets.rs
                        │
                        ▼
                 rustomp-gui::draw() ──► 宿主
```

导出是**单向**的：`.box.json` 只读回设计器，`rustomp.toml` 的标记块由设计器生成，
不会反向修改设计稿（D-002）。

---

## 2. 模块

```text
index.html              三栏界面：素材库+图层 / 画布 / 属性面板
src/main.js             交互与状态：焦点、选中、多选、对齐、预览、导入、导出、暂存
src/model.js            `.box.json` 模型、元素工厂、bbox、对齐/分布、校验、素材导入
src/exporter.js         panel SVG / 贴图清单 / [assets]+[ui] TOML（纯函数，预览与导出共用）
src/embed.js            素材内联：展开 CSS 类、删 id、嵌套 viewBox 裁剪
src/raster.js           浏览器 canvas 栅格化 SVG → PNG（素材包用）
src/zip.js              零依赖 store 模式 zip 写入（带 CRC32）
src/backend.js          暂存客户端（draft.save / draft.last）
src/assets.gen.js       素材清单（gen-assets.mjs 从 viewBox 生成，入库可 diff）
assets/                 内置素材（旋钮 / 丝印 / LED / 开关 / 脚踏）
scripts/gen-assets.mjs  扫素材 → 清单（--check 防漂移）
scripts/export.mjs      .box.json → SVG + PNG(Inkscape) + ui.toml
scripts/preview.mjs     渲染带控件的预览图
scripts/check.sh        一条命令跑完全部校验
scripts/server.py       本地开发服务：静态文件 + /api/draft（Python 标准库）
tests/                  node --test
```

**预览与导出共用 `exporter.js`**：预览看到的是同一份 SVG 生成逻辑（只多了控件与交互），
所以"预览对 → 导出基本不会错"。

---

## 3. 图层与焦点

7 层按"它最后去哪"划分（D-003）：

```text
background → artwork → silkscreen → knobs → toggles → leds → buttons
```

- 焦点是**会话状态**，不写进 `.box.json`：没有焦点时全部虚化、不可交互；
- 显隐（眼睛）与焦点正交：隐藏 = 不渲染/不导出；焦点 = 不可编辑；
- 命中区与控件尺寸由素材/契约决定，不给用户调（D-013 / D-014）。

---

## 4. 本地开发服务

`scripts/dev.sh` 启动 `scripts/server.py`：

| 路由 | 作用 |
|---|---|
| 静态文件 | 仓库根（ES modules 需要 http://，不能 `file://`） |
| `POST /api/draft` | 暂存 `.box.json` 到 `.cache/designs/` + `last` 指针 |
| `GET /api/draft` | 读回上次暂存（启动自动恢复） |

- 缓存目录可用 `BOXD_DATA` 覆盖；`.cache/` 已 gitignore；
- `/api/draft` 是**开发态可选能力**：静态托管时前端静默降级，不影响画图/导出；
- 服务只监听 `127.0.0.1`，不引入 npm / Rust 依赖。

---

## 5. 边界

| 负责 | 不负责 |
|---|---|
| 面板布局（控件/丝印/贴图） | DSP、电路、参数范围 |
| 素材管理与导出 | 插件身份（名字 / AU 码 / VST3 id） |
| 生成 `[assets]` + `[ui]` | 改 `[plugin]` / `[au]` / `[[params]]` |
| 预览面板交互 | 实时音频 |

契约细节见 [`01-contract-panel-toml.md`](01-contract-panel-toml.md)、
[`02-runtime-panelspec.md`](02-runtime-panelspec.md)、[`03-assets.md`](03-assets.md)。
