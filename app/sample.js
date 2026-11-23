/* 自动生成：node tools/gen_sample.mjs（不要手改）。示例数据直接来自本仓库真实文件。 */
window.RL_SAMPLE = {
  challenge: "构建真实可运行的产品，不是 demo：完整 Web Application，接入 AI，部署上线、任何人打开链接都能用。",
  rubric: "productQuality 产品完成度（25分）：应用产品的完整度与用户体验\n  信号：功能完整、可用性高、有亮点；负信号：半成品、不可用\ntechnicalExecution 技术实现（20分）：技术方案合理性与工程质量\n  信号：代码规范、Git 提交清晰、架构设计；负信号：硬编码、代码混乱、无法运行\nartifactCompleteness 产物完整性（15分）：交付物是否齐全、可运行、可独立使用\n  信号：README 齐全、可运行、安装/使用说明；负信号：文件为空、缺少核心交付物\naiUsage AI使用质量（20分）：AI 工具使用是否恰当、有效、可追溯\n  信号：多轮迭代、prompt 优化、工作流设计、AI 日志佐证；负信号：一句话指令直接提交、没有 AI 使用记录\nreflectionQuality 复盘质量（20分）：AAR 反思是否深入、有洞察、有改进方案\n  信号：具体问题分析、有改进方案、记录迭代过程、含失败经验；负信号：敷衍了事、没有实际反思\n红旗：missing_artifacts 核心交付物缺失（artifactCompleteness 上限 5 分）；no_ai_log 无 AI 使用记录（reflectionQuality 上限 5 分）；one_shot_ai 一句话指令直接提交（aiUsage 上限 5 分）",
  evidence: "仓库文件树（实测字节数，共 5 个文件 / 36918 B）：\n  app/core.js  (9175 B)\n  app/ui.js  (12047 B)\n  assets/style.css  (6581 B)\n  index.html  (4967 B)\n  tools/gen_sample.mjs  (4148 B)\n\n可运行性：纯静态站点，无构建步骤，双击 index.html 或任意静态服务器即可运行；GitHub Pages 已部署同一份文件。\nAI 接入：浏览器直连 OpenAI 兼容 /chat/completions，公共免密钥通道（Pollinations，实测 HTTP 200 / 6.9s / 合法 JSON）与本机 Ollama（qwen3:8b，实测 200 / 11.9s）双通道可选。\n流水线：三阶段依赖式调用（解析维度 → 证据映射 → 评分与风险），后一阶段以前一阶段输出为输入。\n工程约束：模型输出只做判断，分值上限与总分由 core.js 的 finalize() 确定性收口；模型漏掉的维度按 0 分计并显式标注。\n测试记录：tools/verify_ai.mjs 用真实模型跑完整流水线并把原始响应落盘为证据 JSON。\n无账号、无后端、无密钥硬编码；用户输入不上传第三方存储。",
  replay: null,
  generatedAt: "2026-11-23T08:06:53.020Z",
  source: { files: 5, bytes: 36918 }
};
