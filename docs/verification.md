# 验证

> 当前验证体系与最近一次结果。历史实验过程见 [`../DEVLOG.md`](../DEVLOG.md)。

---

## 1. 一条命令

```bash
./scripts/check.sh
```

四个步骤：

| 步骤 | 内容 |
|---|---|
| 1. 素材清单 | `gen-assets.mjs --check`：素材改了但 `assets.gen.js` 没重生成 → 失败 |
| 2. 纯逻辑单测 | `node --test tests/*.test.mjs`：模型 / 内联 / 导出 / zip / 暂存 API（43 项） |
| 3. 示例导出 | `examples/sparklin.box.json` → SVG + PNG(Inkscape) + ui.toml |
| 4. 产物尺寸 | `panel.png` 720×1344；`knob_round_dark.png` 240×240（12 px/mm） |

最近一次：**全绿**。

---

## 2. 单元测试覆盖

| 文件 | 覆盖 |
|---|---|
| `tests/model.test.mjs` | 新建/载入/保存、元素工厂、bbox、对齐/分布、复制、导入素材、校验 |
| `tests/exporter.test.mjs` | `panelSvg` / `uiToml` / 参数解析 / 确定性 |
| `tests/embed.test.mjs` | 素材内联（CSS 类展开、id 删除、viewBox 裁剪） |
| `tests/zip.test.mjs` | 零依赖 zip（CRC32 / 目录项） |
| `tests/draft.test.mjs` | 真起 Python 服务：POST 落盘、`last` 指针、GET 回读、坏 JSON 不崩 |

---

## 3. 浏览器冒烟

```text
http://localhost:8765/?selftest=1
```

覆盖：加元素 → 属性面板输入 → 导入 SVG 全链路 → 浏览器素材包（canvas 栅格化 + zip）→
结果打在状态栏（供无头 Chromium/CI 抓取）。

`?probe=1` 会把浏览器栅格化的 `panel.png` 贴回画布，肉眼核对。

---

## 4. 真插件验证（人工）

Sparklin Drive v2 用本设计器（用户自绘面板）走过完整链路：

```text
.box.json → ui.toml + 素材 → rustomp-gen → rustomp-gui → 宿主
```

验收记录见 `DEVLOG.md` E3 / E10（含"用户自绘下载件完整安装"）。

---

## 5. 没覆盖的部分

- **像素级视觉 diff**：没有截图基准；浏览器 PNG 与 Inkscape PNG 字节不同。
- **宿主兼容**：没有自动跑 Logic/AU/VST3 宿主；以人工验收为准。
- **浏览器差异**：日常用 Chromium/Safari 手测，没有 Firefox 矩阵。
- **暂存的并发/多用户**：只做单机单草稿；没有锁或冲突合并。
