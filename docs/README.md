# 文档索引

本目录分两类：**当前文档**（随开发更新）与 **历史归档**（不再修改，只保留证据）。
README 只放"能开工"的摘要，细节都在这里。

---

## 当前文档

| 文档 | 内容 | 什么时候读 |
|---|---|---|
| [`status.md`](status.md) | **当前快照**：能力、已知限制、下一步 | 想知道"现在到哪了" |
| [`architecture.md`](architecture.md) | 数据流、模块、图层/焦点、本地服务、边界 | 想改代码/理解导出链 |
| [`workflows.md`](workflows.md) | 打开 → 编辑 → 预览 → 导出 → 暂存 → 验证 | 第一次用 / 日常操作 |
| [`verification.md`](verification.md) | `check.sh` 四步、43 个单测、浏览器冒烟、未覆盖项 | 改完要验收 |
| [`00-decisions.md`](00-decisions.md) | **决策账本 D-001…D-017**：结论/理由/影响（当前实现的依据） | 任何改动之前 |
| [`01-contract-panel-toml.md`](01-contract-panel-toml.md) | **契约**：`rustomp.toml [assets]/[ui]` 全字段、单位、示例 | 写导出逻辑之前 |
| [`02-runtime-panelspec.md`](02-runtime-panelspec.md) | **运行时语义**：缩放、旋钮角度、拨杆基线、LED、贴图生命周期 | 做预览/交互之前 |
| [`03-assets.md`](03-assets.md) | 素材规范与坑（alpha / 六边形基线 0.54 mm / pt→mm / 内联三坑） | 做导出与素材管理时 |
| [`06-export-runbook.md`](06-export-runbook.md) | **交接手册**：导出 → 装进插件（命令、缺件清单、验收、常见问题） | 每次交付面板时 |

---

## 历史归档

**历史 = `DEVLOG.md` + `history/`**。归档文档**不再更新**（只允许修正链接/加归档说明）。

| 位置 | 内容 |
|---|---|
| [`../DEVLOG.md`](../DEVLOG.md) | **主历史**：D0 → D1.5 的过程、踩坑、每次改动的理由 |
| [`history/README.md`](history/README.md) | 归档索引 + 归档流程 |
| [`history/open-questions.md`](history/open-questions.md) | 当初的 9 个开放问题（已全部拍板） |
| [`history/spec-review.md`](history/spec-review.md) | 早期方案评审 + v0.2 规范草案 |

---

## 文档维护规则（重要）

1. **当前 vs 历史**
   - 当前事实写进 `status.md` / `architecture.md` / `workflows.md` / `verification.md` / 契约文档；
   - 一旦某段描述过时（旧交互、旧方案、旧数据），**移到 `history/`**，不要留在当前文档里。
2. **归档一条内容时**
   - 新建/追加到 `history/<主题>.md`，顶部写：
     `> 归档：YYYY-MM-DD；原因；替代文档见 …`；
   - 在当前文档原位置留**一行指针**（或删除并在 history 索引登记）；
   - 在 `history/README.md` 的索引里登记。
3. **不修改历史**：归档文档只允许修正链接、补归档说明；不要用新结论改写旧记录
   （新结论写进当前文档或新 DEVLOG 条目）。
4. **DEVLOG 只追加**：每轮开发新增 E 编号；旧条目不修改（勘误写进新条目）。
5. **README 只放摘要**：状态细节进 `status.md`，操作细节进 `workflows.md`，
   验证细节进 `verification.md`。
6. **链接检查**：移动/归档文档后跑一次本地链接检查，并确认 README、契约文档、
   归档索引里的路径已更新。
