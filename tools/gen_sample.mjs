// 用真实仓库文件生成 app/sample.js —— 示例数据不手写，随产物自动更新，避免"示例与实物不一致"
import fs from "node:fs";
import path from "node:path";

const REPO = "/Users/xiaowo/.cogseed-dev/userWorkSpace/检查挑战清单完成情况/C6/Zhouruoying_C6_repo";

const CHALLENGE = "构建真实可运行的产品，不是 demo：完整 Web Application，接入 AI，部署上线、任何人打开链接都能用。";

// 与平台 get-challenge 返回的 rubric 原文一致（ch-20260717031519-qqqx60）
const RUBRIC = [
  "productQuality 产品完成度（25分）：应用产品的完整度与用户体验",
  "  信号：功能完整、可用性高、有亮点；负信号：半成品、不可用",
  "technicalExecution 技术实现（20分）：技术方案合理性与工程质量",
  "  信号：代码规范、Git 提交清晰、架构设计；负信号：硬编码、代码混乱、无法运行",
  "artifactCompleteness 产物完整性（15分）：交付物是否齐全、可运行、可独立使用",
  "  信号：README 齐全、可运行、安装/使用说明；负信号：文件为空、缺少核心交付物",
  "aiUsage AI使用质量（20分）：AI 工具使用是否恰当、有效、可追溯",
  "  信号：多轮迭代、prompt 优化、工作流设计、AI 日志佐证；负信号：一句话指令直接提交、没有 AI 使用记录",
  "reflectionQuality 复盘质量（20分）：AAR 反思是否深入、有洞察、有改进方案",
  "  信号：具体问题分析、有改进方案、记录迭代过程、含失败经验；负信号：敷衍了事、没有实际反思",
  "红旗：missing_artifacts 核心交付物缺失（artifactCompleteness 上限 5 分）；no_ai_log 无 AI 使用记录（reflectionQuality 上限 5 分）；one_shot_ai 一句话指令直接提交（aiUsage 上限 5 分）"
].join("\n");

function walk(dir, base = REPO, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === ".git" || e.name === "node_modules") continue;
    const p = path.join(dir, e.name);
    const rel = path.relative(base, p);
    if (e.isDirectory()) walk(p, base, out);
    else out.push({ rel, bytes: fs.statSync(p).size });
  }
  return out;
}

const files = walk(REPO).filter(f => !/^app\/sample\.js$/.test(f.rel)).sort((a, b) => a.rel.localeCompare(b.rel));
const totalBytes = files.reduce((s, f) => s + f.bytes, 0);

const tree = files.map(f => `  ${f.rel}  (${f.bytes} B)`).join("\n");

const EVIDENCE = [
  "仓库文件树（实测字节数，共 " + files.length + " 个文件 / " + totalBytes + " B）：\n" + tree,
  "",
  "可运行性：纯静态站点，无构建步骤，双击 index.html 或任意静态服务器即可运行；GitHub Pages 已部署同一份文件。",
  "AI 接入：浏览器直连 OpenAI 兼容 /chat/completions，公共免密钥通道（Pollinations，实测 HTTP 200 / 6.9s / 合法 JSON）与本机 Ollama（qwen3:8b，实测 200 / 11.9s）双通道可选。",
  "流水线：三阶段依赖式调用（解析维度 → 证据映射 → 评分与风险），后一阶段以前一阶段输出为输入。",
  "工程约束：模型输出只做判断，分值上限与总分由 core.js 的 finalize() 确定性收口；模型漏掉的维度按 0 分计并显式标注。",
  "测试记录：tools/verify_ai.mjs 用真实模型跑完整流水线并把原始响应落盘为证据 JSON。",
  "无账号、无后端、无密钥硬编码；用户输入不上传第三方存储。"
].join("\n");

// 回放数据：直接取最近一次真实实跑证据（evidence/latest.json），不手写、不编造
const EV_PATH = path.join(REPO, "evidence/latest.json");
let replay = null;
if (fs.existsSync(EV_PATH)) {
  const ev = JSON.parse(fs.readFileSync(EV_PATH, "utf8"));
  const f = ev && ev.final;
  if (f && f.maxTotal) {
    replay = {
      total: f.total,
      maxTotal: f.maxTotal,
      ratio: f.total / f.maxTotal,
      coverage: f.coverage,
      claims: f.claims,
      verdict: f.verdict,
      rows: f.rows,
      blockers: f.blockers,
      quickWins: f.quickWins,
      elapsedMs: ev.elapsedMs,
      log: (ev.stageLog || [])
        .filter(function (s) { return s.state === "done"; })
        .map(function (s) { return { stage: s.stage, model: s.model || "", ms: s.ms || 0 }; }),
      sourceRun: path.basename(EV_PATH)
    };
  }
}
if (!replay) {
  console.error("警告：未找到 evidence/latest.json 的有效 final，sample.replay 将为 null（回放功能不可用）");
}

const body = `/* 自动生成：node tools/gen_sample.mjs（不要手改）。示例数据直接来自本仓库真实文件。 */
window.RL_SAMPLE = {
  challenge: ${JSON.stringify(CHALLENGE)},
  rubric: ${JSON.stringify(RUBRIC)},
  evidence: ${JSON.stringify(EVIDENCE)},
  replay: ${JSON.stringify(replay)},
  generatedAt: ${JSON.stringify(new Date().toISOString())},
  source: { files: ${files.length}, bytes: ${totalBytes} }
};
`;

fs.writeFileSync(path.join(REPO, "app/sample.js"), body, "utf8");
console.log("sample.js written:", Buffer.byteLength(body, "utf8"), "B ·", files.length, "files /", totalBytes, "B");
