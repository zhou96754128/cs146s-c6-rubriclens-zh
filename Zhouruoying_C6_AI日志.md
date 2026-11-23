# C6 AI 日志 · RubricLens（挑战自评透镜）

记录 AI 参与的真实过程：每次调用、每次失败、每次修复后的可验证证据。失败与返工不删、不美化。
Student ID：2025105400318 · 仓库：https://github.com/zhou96754128/cs146s-c6-rubriclens-zh · 线上：https://zhou96754128.github.io/cs146s-c6-rubriclens-zh/

## 1. 通道实测（先证明能连上，再写代码）

| 通道 | 端点 / 模型 | 实测结果 |
|---|---|---|
| 公共免密钥（Pollinations） | `https://text.pollinations.ai/openai` · `openai` | HTTP 200 / 6904 ms / 751 chars / 实际返回模型 `gpt-oss-20b` |
| 本机 Ollama | `http://127.0.0.1:11434/v1` · `qwen3:8b` | HTTP 200 / 11891 ms / 1071 chars |

探测脚本 `C6/_probe/probe_ai.mjs` 先跑通再动手，避免"写完发现连不上"。结论直接影响设计：公共通道有 **IP 级限速（1 次 / 45 秒）**，产品必须显式处理 402/429，否则用户第一次点就失败。

## 2. 产品里的 AI 设计决策

**三阶段依赖式流水线**（不是一次问"给我打分"）：解析维度 → 证据映射 → 评分与风险，后一阶段以前一阶段输出为输入。一次性打分会让模型同时做理解、检索、算术三件事，任一环崩掉整份报告都不可信。

**只输出 JSON + 容错解析**：`extractJson` 处理 ```` ```json ```` 围栏、前置闲聊、尾逗号，并在无法解析时**显式抛错**，绝不静默返回空对象——空对象会伪装成"评分成功但全 0"。

**确定性收口**：模型只负责"判断"，分值上限与总分由 `finalize()` 用代码计算；模型漏掉的维度按 0 分计并标 `missing`。这是防"模型给面子"的唯一手段。

**红旗由代码实现，不靠提示词祈祷**：`missing_artifacts` / `no_ai_log` / `one_shot_ai` 触发时，对应维度上限被代码压到 5 分。

## 3. 迭代记录（三次真实失败）

### 迭代 1 — 首次真实调用就崩：`ReferenceError`

第一版 `finalize` 只声明 `(rubric, report)`，但函数体里要用 `mapping.mappings` 算证据覆盖率，调用方也没传。

```
ReferenceError: mapping is not defined
    at Object.finalize (.../C6/Zhouruoying_C6_repo/app/core.js:136:18)
    at .../tools/verify_ai.mjs:31
```

处理：签名改为 `finalize(rubric, report, mapping)`，调用点 `app/core.js:185` 显式传 `mapping`；`tools/verify_ai.mjs:31` 仍两参调用，因为函数体已用 `(mapping && mapping.mappings) || []` 兜底。

教训：JS 里未声明的标识符只在**执行到那一行**才炸，语法检查永远发现不了。所以单测必须真的跑完整流水线，不能只做静态检查。

### 迭代 2 — 公共通道跑到一半被限速打断：HTTP 402

```
HTTP 402 · {"status":402,"success":false,"error":{"code":"FREE_LIMIT",
"message":"Free limit reached: 1 reply every 45 seconds per IP. Retry after 38s, ..."}}
```

处理：`core.js` 增加 `retryAfterSeconds(res, txt)`，读 `retry-after` 响应头，读不到就解析正文 `/retry after\s*(\d+)\s*s/i`；公共通道 `maxAttempts = 3`（其他通道 2）；遇到 402 / 429 / ≥500 按服务端建议秒数退避重试，无建议值时退 15 秒。

修复后真实模型跑完整流水线：**VERDICT PASS 15/15**（8 条单元断言 + 7 条真实调用断言），证据落盘 `evidence/latest.json`（13506 B）——总分 45/100、覆盖 20%、风险 6 条、三阶段耗时 2194 / 7825 / 10187 ms、模型 `gpt-oss-20b`。失败的第一次跑也保留在 `evidence/run_public_2026-11-23T08-07-36-920Z.json`（2148 B，FAIL 1/9），不删。

### 迭代 3 — 「回放」按钮点了没反应（本轮才发现，最值得记的一条）

**现象**：演示截图里报告区一片空白，KPI 全是「–」。

**误判过程（如实记录）**：一开始归因为 headless 截图时机太早（`--dump-dom` 在脚本执行前就抓了），差点把它当成工具限制放过。

**定位**：改用 CDP 真实驱动浏览器，在页面里装 `window.addEventListener('error', ...)` 钩子再点按钮，读到 `#err` = 「没有可回放的实跑记录。」且 `__errs` 为空——**没有抛异常，是数据本身是空的**。

**根因**：`app/sample.js` 里写着 `replay: null`。生成器 `gen_sample.mjs` 写示例时，公开通道还没有任何一次成功实跑，于是直接写死 `null`。而 `typeof null === "object"`，我最初用 `typeof s.replay` 判断，把 null 误读成"有数据"，白跑了一轮排查。

**修复**：`gen_sample.mjs` 改为读 `evidence/latest.json` 的 `final`，补上 `ratio`（0.45）、`elapsedMs`（79529）、`log`（三阶段 ms + 模型）后写入 `replay`；缺证据时打印警告而不是静默写 null。`app/sample.js` 由 2751 B → 5176 B；补齐 AI 日志、AAR、demo 走查与两张截图后重跑生成器，最终 5369 B（16 文件 / 626125 B，由脚本实测写入）。

**防复发**：新增 `tools/verify_sample.mjs`，20 条断言锁死 `render()` 的字段契约——`replay` 非空、45/100、`ratio` 与总分自洽、`rows` 恰好 5 个、各维度分之和等于 `total`、`log` ≥ 3 条。结果 `VERIFY_SAMPLE PASS 20/20`。

**验收**：CDP 打开站点 → 点「回放」→ 读回 DOM：`hidden=false`、`45 / 100`、得分率 45%、覆盖 20%、强 1 / 部分 2 / 缺失 7、5 个维度、6 条风险、1 条红旗、2 条速赢，`verdict=PASS`。

教训：**截图是证据，不是证明**。同一份证据必须能把数值读回来；自动化验收要断言 DOM 值，不能只看图里有没有像素。

## 4. 自检与可复现命令

```
node tools/gen_sample.mjs     # 从真实文件 + 真实实跑证据重生成 app/sample.js
node tools/verify_sample.mjs  # 20 条断言：回放数据与 render 契约一致
node tools/verify_ai.mjs      # 真实模型跑完整流水线，原始响应落盘 evidence/
python3 -m http.server 8899   # 本地起站点，浏览器打开 127.0.0.1:8899
```

## 5. 诚实边界

- 公共通道限速 1 次 / 45 秒，演示与截图走**离线回放**（页面明确写"这是已保存的真实模型输出回放（离线可看），不是本次新调用"）。
- demo 是静态截图，**没有录屏**。
- 45/100 是真实模型对"示例证据"给出的分数，刻意保持难看——它反映的是示例证据本身的缺口（缺 README、缺复盘），不是产品能力的上限。
- 仓库体积与文件数由 `gen_sample.mjs` 实测写入，非手填。

## 6. AI 使用反思

- **AI 最擅长**：把"判断"与"算术"分开、写容错解析、批量搭骨架。三阶段流水线的 JSON 契约与容错解析几乎一次成型。
- **AI 最容易骗我的是什么**：自检"全绿"。三次真实缺陷（`mapping` 未声明、402 限速、`replay: null`）**没有一个是静态检查能发现的**，全是真的跑出来才暴露。
- **下一版**：把 `verify_sample` + `verify_ai` 接进 CI，每次 push 自动跑；给回放加"证据来源 run 文件名"显式标签，让截图自带出处。
