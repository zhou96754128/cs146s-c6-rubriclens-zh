// 真实模型跑完整流水线 + 确定性单元断言 —— 证据落盘到 evidence/，不是"我声称跑过"
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const REPO = "/Users/xiaowo/.cogseed-dev/userWorkSpace/检查挑战清单完成情况/C6/Zhouruoying_C6_repo";
const EV = path.join(REPO, "evidence");
fs.mkdirSync(EV, { recursive: true });

globalThis.window = globalThis;
await import(pathToFileURL(path.join(REPO, "app/core.js")).href);
await import(pathToFileURL(path.join(REPO, "app/sample.js")).href);
const RL = globalThis.RL;
const S = globalThis.RL_SAMPLE;

const results = [];
function ok(name, cond, extra = "") {
  results.push({ name, pass: !!cond, extra });
  console.log((cond ? "PASS  " : "FAIL  ") + name + (extra ? "  · " + extra : ""));
  return !!cond;
}

/* ---------- 1. 确定性单元断言（不依赖网络） ---------- */
ok("extractJson 处理 ```json 围栏", JSON.stringify(RL.extractJson('```json\n{"a":1}\n```')) === '{"a":1}');
ok("extractJson 忽略前导寒暄", JSON.stringify(RL.extractJson('好的，结果如下：{"a":1}')) === '{"a":1}');
ok("extractJson 修复尾随逗号", RL.extractJson('{"a":1,}').a === 1);
let threw = false;
try { RL.extractJson("完全没有 JSON"); } catch (e) { threw = true; }
ok("extractJson 对非 JSON 明确报错", threw);

const cl = RL.finalize(
  { dimensions: [{ id: "a", label: "A", maxPoints: 25 }, { id: "b", label: "B", maxPoints: 20 }] },
  { dimensions: [{ id: "a", score: 999, rationale: "超上限", risks: [] }, { id: "zzz", score: 10 }] }
);
ok("分值上限由代码收口（999 → 25）", cl.rows[0].score === 25);
ok("模型漏掉的维度按 0 分并标记", cl.rows[1].missing === true && cl.rows[1].score === 0);
ok("总分等于各维度收口后之和", cl.total === 25 && cl.maxTotal === 45);
ok("模型编造的多余维度不计入", cl.rows.length === 2);

/* ---------- 2. 真实模型跑三阶段流水线 ---------- */
const channel = (process.argv[2] || "public").trim();
const base = channel === "ollama"
  ? { id: "ollama", base: "http://127.0.0.1:11434/v1", model: "qwen3:8b" }
  : { id: "public", base: "https://text.pollinations.ai/openai", model: "openai" };

const t0 = Date.now();
const stageLog = [];
let fin = null, err = null;
try {
  fin = await RL.runPipeline({
    input: { challenge: S.challenge, rubric: S.rubric, evidence: S.evidence },
    provider: base,
    onStage: (id, st, info) => { stageLog.push({ stage: id, state: st, ...info }); console.log("  stage " + id + " → " + st + (info ? "  " + info.ms + "ms " + info.model : "")); }
  });
} catch (e) {
  err = String(e && e.message || e);
}

ok("三阶段全部完成（无异常）", !err, err || "");
if (fin) {
  ok("解析出的维度数 ≥ 4", fin.rubric.dimensions && fin.rubric.dimensions.length >= 4, "dims=" + (fin.rubric.dimensions || []).length);
  ok("总分不超过满分", fin.total <= fin.maxTotal, fin.total + "/" + fin.maxTotal);
  ok("每个维度都有给分理由", fin.rows.every(r => (r.rationale || "").length > 3));
  const nRisk = fin.rows.reduce((s, r) => s + (r.risks || []).length, 0);
  ok("产出至少 3 条扣分风险", nRisk >= 3, "risks=" + nRisk);
  ok("产出至少 1 条速赢动作", (fin.quickWins || []).length >= 1);
  ok("证据覆盖率为 0–1", fin.coverage >= 0 && fin.coverage <= 1, (fin.coverage * 100).toFixed(0) + "%");
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const rec = {
  channel, provider: base, startedAt: new Date(t0).toISOString(), elapsedMs: Date.now() - t0,
  input: { challenge: S.challenge, rubricBytes: Buffer.byteLength(S.rubric), evidenceBytes: Buffer.byteLength(S.evidence) },
  stageLog, error: err,
  final: fin ? { total: fin.total, maxTotal: fin.maxTotal, coverage: fin.coverage, claims: fin.claims, verdict: fin.verdict, rows: fin.rows, blockers: fin.blockers, quickWins: fin.quickWins } : null,
  rawModelOutputs: fin ? fin.log : [],
  results
};
const file = path.join(EV, "run_" + channel + "_" + stamp + ".json");
fs.writeFileSync(file, JSON.stringify(rec, null, 2), "utf8");
console.log("\nEVIDENCE " + file + "  (" + fs.statSync(file).size + " B)");
if (fin && channel === "public") {
  fs.writeFileSync(path.join(EV, "latest.json"), JSON.stringify(rec, null, 2), "utf8");
  console.log("LATEST  evidence/latest.json");
}

const failed = results.filter(r => !r.pass);
console.log("\nVERDICT " + (failed.length ? "FAIL " + failed.length + "/" + results.length : "PASS " + results.length + "/" + results.length));
process.exit(failed.length ? 1 : 0);
