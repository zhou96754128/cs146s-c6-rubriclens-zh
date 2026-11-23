/*! RubricLens UI — 只做 DOM 装配与状态流转，所有判断逻辑在 core.js */
(function () {
  "use strict";
  var RL = window.RL;
  var $ = function (s) { return document.querySelector(s); };
  var state = { provider: null, result: null, qa: [], busy: false };

  /* ---------- 通道 ---------- */
  function buildProviders() {
    var sel = $("#provider");
    RL.PROVIDERS.forEach(function (p) {
      var o = document.createElement("option");
      o.value = p.id; o.textContent = p.label;
      sel.appendChild(o);
    });
    sel.value = "public";
    sel.addEventListener("change", syncProvider);
    $("#base").addEventListener("input", syncProvider);
    $("#model").addEventListener("input", syncProvider);
    $("#key").addEventListener("input", syncProvider);
    syncProvider();
  }
  function syncProvider() {
    var id = $("#provider").value;
    var base = RL.PROVIDERS.filter(function (p) { return p.id === id; })[0] || {};
    var custom = id === "custom";
    $("#base").style.display = custom ? "" : "none";
    $("#model").style.display = custom ? "" : "none";
    $("#key").style.display = custom ? "" : "none";
    if (!custom) { $("#model").value = base.model || ""; $("#base").value = base.base || ""; }
    var hint = {
      public: "免密钥公共通道（Pollinations），无需注册即可试用。若返回 429，稍等 10 秒或切换到本机 Ollama。",
      ollama: "使用本机 Ollama。网页访问 127.0.0.1 需要以 OLLAMA_ORIGINS=* 启动服务。",
      custom: "任何 OpenAI 兼容端点：填到 /v1 为止，Key 只存在浏览器内存与 localStorage。"
    }[id] || "";
    $("#provider-hint").textContent = hint;
    state.provider = {
      id: id,
      base: $("#base").value || base.base,
      model: $("#model").value || base.model,
      apiKey: $("#key").value || ""
    };
    try { localStorage.setItem("rl.provider", JSON.stringify({ id: id, base: state.provider.base, model: state.provider.model })); } catch (e) {}
  }
  function restoreProvider() {
    try {
      var s = JSON.parse(localStorage.getItem("rl.provider") || "null");
      if (s && s.id) { $("#provider").value = s.id; $("#base").value = s.base || ""; $("#model").value = s.model || ""; }
    } catch (e) {}
    syncProvider();
  }

  /* ---------- 阶段 ---------- */
  function setStage(id, cls, note) {
    var li = document.querySelector('.stages li[data-stage="' + id + '"]');
    if (!li) return;
    li.className = cls;
    if (note) li.querySelector("em").textContent = note;
  }
  function resetStages() {
    ["rubric", "evidence", "report"].forEach(function (id) { setStage(id, "", "待运行"); });
  }

  /* ---------- 渲染 ---------- */
  function sevTag(s) {
    var k = (s === "high" || s === "medium") ? s : "low";
    var label = { high: "高", medium: "中", low: "低" }[k];
    return '<span class="sev ' + k + '">' + label + "</span>";
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  function render(fin) {
    state.result = fin;
    $("#result").hidden = false;
    $("#kpi-score").textContent = fin.total + " / " + fin.maxTotal;
    $("#kpi-ratio").textContent = "得分率 " + Math.round(fin.ratio * 100) + "%";
    $("#kpi-cov").textContent = Math.round(fin.coverage * 100) + "%";
    $("#kpi-claims").textContent = "强 " + fin.claims.strong + " · 部分 " + fin.claims.partial + " · 缺失 " + fin.claims.missing;
    $("#kpi-verdict").textContent = fin.verdict || "（模型未给出结论）";
    $("#kpi-meta").textContent = (fin.elapsedMs / 1000).toFixed(1) + "s";
    $("#kpi-meta").title = (fin.log || []).map(function (l) { return l.stage + " " + (l.model || "") + " " + l.ms + "ms"; }).join(" | ");

    var host = $("#dims");
    host.innerHTML = fin.rows.map(function (r) {
      var pct = r.maxPoints ? Math.round((r.score / r.maxPoints) * 100) : 0;
      var cls = r.missing ? "dim miss" : pct < 60 ? "dim warn" : "dim";
      var risks = (r.risks || []).map(function (k) {
        return "<li>" + sevTag(k.severity) + esc(k.risk) + '<span class="fix">修复：' + esc(k.fix || "—") + "</span></li>";
      }).join("");
      return '<div class="' + cls + '"><div class="dim-hd"><b>' + esc(r.label) + "</b><span>" +
        r.score + " / " + r.maxPoints + "</span></div>" +
        '<div class="bar"><i style="width:' + pct + '%"></i></div>' +
        "<p>" + esc(r.rationale) + "</p>" +
        (risks ? '<ul class="risks">' + risks + "</ul>" : "") + "</div>";
    }).join("");

    $("#blockers").innerHTML = (fin.blockers.length ? fin.blockers : ["（未识别到会直接打回的问题）"])
      .map(function (b) { return "<li>" + esc(b) + "</li>"; }).join("");
    $("#quickwins").innerHTML = (fin.quickWins.length ? fin.quickWins : ["（模型未给出速赢项）"])
      .map(function (b) { return "<li>" + esc(b) + "</li>"; }).join("");
    $("#result").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /* ---------- 导出 ---------- */
  function toMarkdown(fin) {
    var L = [];
    L.push("# RubricLens 自评报告", "");
    L.push("- 挑战目标：" + ($("#challenge").value || "—"));
    L.push("- 通道 / 模型：" + (state.provider.id || "—") + " / " + (state.provider.model || "—"));
    L.push("- 预估总分：**" + fin.total + " / " + fin.maxTotal + "**（得分率 " + Math.round(fin.ratio * 100) + "%）");
    L.push("- 证据覆盖：" + Math.round(fin.coverage * 100) + "%（强 " + fin.claims.strong + " · 部分 " + fin.claims.partial + " · 缺失 " + fin.claims.missing + "）");
    L.push("- 结论：" + (fin.verdict || "—"), "");
    L.push("## 维度明细", "", "| 维度 | 得分 | 理由 |", "|---|---|---|");
    fin.rows.forEach(function (r) { L.push("| " + r.label + " | " + r.score + " / " + r.maxPoints + " | " + (r.rationale || "").replace(/\|/g, "/") + " |"); });
    L.push("", "## 扣分风险与修复");
    fin.rows.forEach(function (r) {
      (r.risks || []).forEach(function (k) { L.push("- [" + k.severity + "] " + r.label + "：" + k.risk + " → 修复：" + (k.fix || "—")); });
    });
    L.push("", "## 会打回的问题", "");
    (fin.blockers.length ? fin.blockers : ["—"]).forEach(function (b) { L.push("- " + b); });
    L.push("", "## 速赢动作", "");
    (fin.quickWins.length ? fin.quickWins : ["—"]).forEach(function (b) { L.push("- " + b); });
    L.push("", "---", "由 RubricLens 生成 · " + new Date().toISOString() + " · 模型输出经确定性代码收口（分值上限与总分由代码计算）");
    return L.join("\n");
  }
  function download(name, text) {
    var blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  }

  /* ---------- 主流程 ---------- */
  async function run() {
    if (state.busy) return;
    var input = {
      challenge: $("#challenge").value.trim(),
      rubric: $("#rubric").value.trim(),
      evidence: $("#evidence").value.trim()
    };
    if (input.rubric.length < 20) return showErr("评分 rubric 太短，至少要有维度与分值。");
    if (input.evidence.length < 20) return showErr("证据清单太短，至少写上文件与关键内容。");
    showErr(""); resetStages();
    state.busy = true; $("#btn-run").disabled = true; $("#btn-run").textContent = "运行中…";
    var t0 = Date.now();
    try {
      var fin = await RL.runPipeline({
        input: input, provider: state.provider,
        onStage: function (id, st, info) {
          if (st === "running") setStage(id, "running", "调用中…");
          else if (st === "done") setStage(id, "done", (info.ms / 1000).toFixed(1) + "s · " + (info.model || ""));
        }
      });
      render(fin);
      $("#pipe-note").textContent = "完成 3/3 阶段，总耗时 " + ((Date.now() - t0) / 1000).toFixed(1) + "s。分值为代码收口后的结果。";
    } catch (e) {
      var msg = String(e && e.message || e);
      showErr("分析失败：" + msg);
      ["rubric", "evidence", "report"].forEach(function (id) {
        var li = document.querySelector('.stages li[data-stage="' + id + '"]');
        if (li && li.className === "" ) setStage(id, "fail", "未执行");
      });
      document.querySelectorAll('.stages li.running').forEach(function (li) { li.className = "fail"; li.querySelector("em").textContent = "失败"; });
    } finally {
      state.busy = false; $("#btn-run").disabled = false; $("#btn-run").textContent = "开始三阶段分析";
    }
  }
  function showErr(t) { $("#err").textContent = t; }

  /* ---------- 追问 ---------- */
  async function ask() {
    var q = $("#followup").value.trim();
    if (!q || !state.result) return;
    var box = $("#qa");
    $("#followup").value = "";
    box.insertAdjacentHTML("beforeend", '<div class="turn q"><b>你</b>' + esc(q) + "</div>");
    box.insertAdjacentHTML("beforeend", '<div class="turn a" id="qa-typing"><b>RubricLens</b>思考中…</div>');
    var ctx = {
      verdict: state.result.verdict,
      rows: state.result.rows.map(function (r) { return { dimension: r.label, score: r.score, max: r.maxPoints, risks: (r.risks || []).map(function (k) { return k.risk; }) }; }),
      blockers: state.result.blockers, quickWins: state.result.quickWins
    };
    try {
      var r = await RL.chat({
        provider: state.provider,
        messages: [
          { role: "system", content: RL.SYS },
          { role: "user", content: "这是刚才的自评报告 JSON：\n" + JSON.stringify(ctx) + "\n\n在此基础上回答追问，不要重复整份报告，只给结论与可执行步骤。" },
          { role: "user", content: q }
        ]
      });
      var el = $("#qa-typing"); if (el) el.innerHTML = "<b>RubricLens</b>" + esc(r.content).replace(/\n/g, "<br>");
    } catch (e) {
      var el2 = $("#qa-typing"); if (el2) el2.innerHTML = "<b>RubricLens</b>调用失败：" + esc(String(e.message || e));
    }
  }

  /* ---------- 初始化 ---------- */
  document.addEventListener("DOMContentLoaded", function () {
    buildProviders(); restoreProvider();
    $("#btn-run").addEventListener("click", run);
    $("#btn-ask").addEventListener("click", ask);
    $("#followup").addEventListener("keydown", function (e) { if (e.key === "Enter") ask(); });
    $("#btn-export").addEventListener("click", function () {
      if (state.result) download("RubricLens_自评报告.md", toMarkdown(state.result));
    });
    $("#btn-json").addEventListener("click", function () {
      if (!state.result) return;
      var t = JSON.stringify(state.result, null, 2);
      if (navigator.clipboard) navigator.clipboard.writeText(t);
      $("#btn-json").textContent = "已复制";
      setTimeout(function () { $("#btn-json").textContent = "复制 JSON"; }, 1500);
    });
    $("#btn-clear").addEventListener("click", function () {
      $("#challenge").value = ""; $("#rubric").value = ""; $("#evidence").value = "";
      $("#result").hidden = true; resetStages(); showErr("");
    });
    $("#btn-sample").addEventListener("click", function () {
      var s = window.RL_SAMPLE || {};
      $("#challenge").value = s.challenge || "";
      $("#rubric").value = s.rubric || "";
      $("#evidence").value = s.evidence || "";
    });
    $("#btn-replay").addEventListener("click", function () {
      var s = window.RL_SAMPLE || {};
      if (!s.replay) return showErr("没有可回放的实跑记录。");
      $("#challenge").value = s.challenge || "";
      $("#rubric").value = s.rubric || "";
      $("#evidence").value = s.evidence || "";
      render(s.replay);
      $("#pipe-note").textContent = "这是已保存的真实模型输出回放（离线可看），不是本次新调用。";
    });
    resetStages();
  });
})();
