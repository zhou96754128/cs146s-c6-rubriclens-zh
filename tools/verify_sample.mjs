// 回归自检：确保 app/sample.js 的回放数据齐全且符合 ui.js render() 的字段契约
// 背景：曾出现 replay: null，页面点「回放」只弹「没有可回放的实跑记录」，demo 截图是空页
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const REPO = "/Users/xiaowo/.cogseed-dev/userWorkSpace/检查挑战清单完成情况/C6/Zhouruoying_C6_repo";
const src = fs.readFileSync(path.join(REPO, "app/sample.js"), "utf8");

const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(src, sandbox);
const S = sandbox.window.RL_SAMPLE;

const fails = [];
const ok = (cond, msg) => { if (!cond) fails.push(msg); };

ok(S && typeof S === "object", "RL_SAMPLE 未定义");
ok(typeof S.challenge === "string" && S.challenge.length > 30, "challenge 缺失或过短");
ok(typeof S.rubric === "string" && S.rubric.length > 200, "rubric 缺失或过短");
ok(typeof S.evidence === "string" && S.evidence.length > 200, "evidence 缺失或过短");

// render() 直接读取的字段
const R = S.replay;
ok(R && typeof R === "object", "replay 为 null —— 回放功能不可用（本次缺陷）");
if (R && typeof R === "object") {
  ["total", "maxTotal", "ratio", "coverage", "elapsedMs"].forEach(function (k) {
    ok(typeof R[k] === "number" && isFinite(R[k]), "replay." + k + " 不是有效数字");
  });
  ok(R.total === 45 && R.maxTotal === 100, "replay.total/maxTotal 与证据不一致（期望 45/100，实际 " + R.total + "/" + R.maxTotal + "）");
  ok(Math.abs(R.ratio - 0.45) < 1e-9, "replay.ratio 与 total/maxTotal 不自洽");
  ok(R.claims && typeof R.claims.strong === "number", "replay.claims 缺 strong/partial/missing");
  ok(typeof R.verdict === "string" && R.verdict.length > 0, "replay.verdict 为空");
  ok(Array.isArray(R.rows) && R.rows.length === 5, "replay.rows 应含 5 个评分维度，实际 " + (Array.isArray(R.rows) ? R.rows.length : "非数组"));
  if (Array.isArray(R.rows)) {
    R.rows.forEach(function (r, i) {
      ok(typeof r.label === "string" && r.label, "rows[" + i + "].label 缺失");
      ok(typeof r.maxPoints === "number", "rows[" + i + "].maxPoints 缺失");
      ok(typeof r.score === "number", "rows[" + i + "].score 缺失");
      ok(Array.isArray(r.risks), "rows[" + i + "].risks 不是数组");
    });
    const sum = R.rows.reduce(function (s, r) { return s + r.score; }, 0);
    ok(sum === R.total, "各维度得分之和 " + sum + " 与 total " + R.total + " 不一致");
  }
  ok(Array.isArray(R.blockers), "replay.blockers 不是数组");
  ok(Array.isArray(R.quickWins), "replay.quickWins 不是数组");
  ok(Array.isArray(R.log) && R.log.length >= 3, "replay.log 应含 ≥3 条已完成的阶段记录");
  if (Array.isArray(R.log)) {
    R.log.forEach(function (l, i) {
      ok(typeof l.stage === "string" && l.stage, "log[" + i + "].stage 缺失");
      ok(typeof l.ms === "number" && l.ms > 0, "log[" + i + "].ms 无效");
    });
  }
}

const total = 20;
const passed = total - fails.length;
console.log("VERIFY_SAMPLE " + (fails.length ? "FAIL" : "PASS") + " " + passed + "/" + total);
fails.forEach(function (f) { console.log("  ✗ " + f); });
process.exitCode = fails.length ? 1 : 0;
