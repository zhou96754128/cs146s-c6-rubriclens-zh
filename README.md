# RubricLens · 挑战自评透镜

> 提交前 30 秒自查：把 **rubric** 和 **证据清单** 贴进去，AI 按三阶段流水线解析维度 → 映射证据 → 给出分数区间、扣分风险与可执行修复动作，最后导出一份 Markdown 自评报告。

一句话价值：**它不告诉你「你很好」，它告诉你「哪里会被打回」。**

- 纯静态前端：无后端、无账号、无数据库，所有输入只留在你自己的浏览器里
- AI 只负责「判断」，**分值上限、缺维补零、总分** 一律由确定性代码计算，不让模型自报分数
- 自带离线「回放最近一次实跑结果」，没网也能看完整报告长什么样

## 为什么值得做（问题来自真实痛点）

课程/项目提交的评分 rubric 通常是几百字的自然语言，学生读完之后**无法把它翻译成「我这份材料的哪一句对应哪一条要求」**。常见失败模式有三种：

1. 交付物齐全但证据没对上维度（做完了没写清楚，被当没做）
2. 维度整块漏掉（rubric 有 5 个维度，材料只覆盖 3 个）
3. 模型自评爱给高分，给出「98 分」这种无法追溯的数字

RubricLens 对这三件事分别给出工程解法：证据逐条映射（含 `strong/partial/missing`）、缺维按 0 分并标记、分数上限与总分行强制由代码收口。

## 三阶段流水线（阶段之间是依赖关系）

```
          ┌─────────────────────────────────────────────┐
rubric ─▶ │ 1 解析评分维度  产出 {dimensions[],maxPoints}│
          └──────────────────┬──────────────────────────┘
                             ▼  (rubric 是该阶段输出，也是下阶段输入)
证据清单 ─▶ │ 2 证据逐条映射  产出 {mappings[].claims[].strength} │
                             ▼
          ┌───────────────────────────────────────────────┐
          │ 3 评分与扣分风险 产出 {dimensions[].score/risks} │
          └──────────────────┬────────────────────────────┘
                             ▼
                    确定性收口 finalize()
        clamp 到 maxPoints · 缺维补 0 · 总分 = Σ 收口后分值 · 证据覆盖率
```

`finalize()` 是纯函数，不碰网络，单测可离线跑：模型给 999 分会被夹到该维度满分；模型编造 rubric 里不存在的维度会被丢弃；模型漏掉的维度记 0 分并打上 `missing` 标记。

## 目录结构

```
index.html              单页应用入口（无框架、无构建步骤）
app/core.js             纯逻辑层：通道、三阶段 prompt、JSON 提取、finalize 收口
app/ui.js               界面层：输入、流水线状态、报告渲染、导出、追问
app/sample.js           由 tools/gen_sample.mjs 从本仓库真实文件生成（见下）
assets/style.css        样式
tools/gen_sample.mjs    扫描仓库生成示例数据（跳过 .git / node_modules）
tools/verify_ai.mjs     真跑 + 单测：15 项断言，证据落盘 evidence/
evidence/*.json         每次实跑的原始输出（含每阶段耗时、模型名、token 用量）
```

## 快速开始

### 本机打开（推荐，离线可用）

```bash
cd Zhouruoying_C6_repo
python3 -m http.server 8000
# 浏览器打开 http://127.0.0.1:8000/
```

不需要 `npm install`，没有构建步骤——`index.html` 直接引用三个普通脚本。

### 三个 AI 通道

| 通道 | 需要密钥 | 说明 |
| --- | --- | --- |
| 公共通道（默认） | 否 | Pollinations 提供的 OpenAI 兼容端点，免密钥；**有 IP 级限流（约每 45 秒 1 次回复）**，代码已内置按服务端 `Retry after Ns` 自动等待重试 |
| 本地 Ollama | 否 | `OLLAMA_ORIGINS=* ollama serve`，然后用 `qwen3:8b`；数据不出本机 |
| 自备 OpenAI 兼容端点 | 是 | 任意 `base`（含 `/v1`）+ model + key，key 只存浏览器 localStorage |

> 公共通道的 402/429 是**正常现象**而不是 bug：`app/core.js` 的 `chat()` 会解析响应里或响应头里的等待秒数，等够再重试（公共通道最多 3 次），所以三阶段串行跑完大约需要 1–2 分钟。

## 自证：这些数字怎么来的

```bash
node tools/verify_ai.mjs public     # 走公共通道真跑一遍
node tools/verify_ai.mjs ollama     # 走本地 Ollama 真跑一遍
```

最近一次真实运行（公共通道，2026-11-23）：

```
PASS  extractJson 处理 ```json 围栏
PASS  extractJson 忽略前导寒暄
PASS  extractJson 修复尾随逗号
PASS  extractJson 对非 JSON 明确报错
PASS  分值上限由代码收口（999 → 25）
PASS  模型漏掉的维度按 0 分并标记
PASS  总分等于各维度收口后之和
PASS  模型编造的多余维度不计入
  stage rubric   → done  2194ms  gpt-oss-20b
  stage evidence → done  7825ms  gpt-oss-20b
  stage report   → done 10187ms  gpt-oss-20b
PASS  三阶段全部完成（无异常）
PASS  解析出的维度数 ≥ 4  · dims=5
PASS  总分不超过满分  · 45/100
PASS  每个维度都有给分理由
PASS  产出至少 3 条扣分风险  · risks=6
PASS  产出至少 1 条速赢动作
PASS  证据覆盖率为 0–1  · 20%
VERDICT PASS 15/15
```

原始输出见 `evidence/latest.json`。注意上表里 **45/100** 这个分数是模型对本项目真实证据的判定，不是我们编的好评——它恰好说明工具会给出难看的分数。

## 示例数据是怎么生成的

`app/sample.js` 不是手写的美化样例，而是由 `tools/gen_sample.mjs` **遍历本仓库真实文件**生成的（跳过 `.git`、`node_modules`，按大小排序取前若干项，记录每个文件的字节数）。所以点击「载入示例」做的事是：**用 C6 自己的 rubric，去评 RubricLens 自己这一份交付**——一次自指的端到端冒烟测试。

```bash
node tools/gen_sample.mjs    # 重新生成 app/sample.js
```

## 已知边界（不做的事）

- 不做账号、不做云端存储：报告不落库，刷新即失，隐私换 simplicity
- 不做自动提交：工具只产出自评与修复建议，提交动作仍由人决定
- 不做多文件批量分析：一次一份 rubric + 一份证据清单
- 公共通道的限流与模型漂移不受我们控制，关键场景建议切本地 Ollama 或自备 key

## 许可

MIT
