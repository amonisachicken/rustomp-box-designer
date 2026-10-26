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

## 现状（2026-10-26）

**只有契约文档，没有代码。** 先把"设计器要满足什么"写清楚，再约定实现规范、动手。

| 项 | 状态 |
|---|---|
| 与 rustomp 的**面板契约**（`rustomp.toml [assets]/[ui]` 全字段） | ✅ `docs/01-contract-panel-toml.md` |
| 运行时语义（`rustomp-gui::PanelSpec` 怎么画、坐标/缩放/贴图生命周期） | ✅ `docs/02-runtime-panelspec.md` |
| 素材规范（PNG、@2x、透明通道、命名、尺寸关系） | ✅ `docs/03-assets.md` |
| **待约定的实现规范**（技术栈、文件格式、控件库、导出方式…） | ✅ `docs/04-open-questions.md`（**下一次讨论的议程**） |
| 代码 | ⬜ 未开始 |

---

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
| `docs/04-open-questions.md` | **待约定的实现规范**（技术栈 / 文件格式 / 控件库 / 导出 / 能力扩展） |

---

## 许可证

GPL-3.0-or-later（`LICENSE`）。
