/*! RubricLens core — 纯逻辑层，浏览器与 Node 共用（挂到 window.RL / globalThis.RL）
 * 设计要点：LLM 只负责「判断」，分值上限与总分一律由确定性代码计算，不让模型自报总分。
 */
(function (root) {
  "use strict";

  var PROVIDERS = [
    { id: "public", label: "公共通道 · 免密钥", base: "https://text.pollinations.ai/openai", model: "openai" },
    { id: "ollama", label: "本地 Ollama", base: "http://127.0.0.1:11434/v1", model: "qwen3:8b" },
    { id: "custom", label: "自备 OpenAI 兼容端点", base: "", model: "", needsKey: true }
  ];

  var SYS = [
    "你是一名极其严格的课程评审员。",
    "三条硬规则：1) 只依据给出的证据判断，证据不足即扣分，绝不臆测或补全；2) 每条风险必须配一个可立即执行的修复动作；3) 只输出一个 JSON 对象，不要 markdown 代码块，不要任何解释性文字。"
  ].join("\n");

  function clamp(n, lo, hi) {
    n = typeof n === "number" ? n : parseFloat(n);
    if (!isFinite(n)) return lo;
    return Math.min(hi, Math.max(lo, n));
  }

  function sleep(ms) {
    return new Promise(function (r) { setTimeout(r, ms); });
  }

  function extractJson(text) {
    if (!text) throw new Error("模型返回为空");
    var s = String(text).trim();
    var fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fence) s = fence[1].trim();
    var a = s.indexOf("{"), b = s.lastIndexOf("}");
    if (a >= 0 && b > a) s = s.slice(a, b + 1);
    try { return JSON.parse(s); } catch (e) {}
    try { return JSON.parse(s.replace(/,\s*([}\]])/g, "$1")); } catch (e) {}
    throw new Error("模型返回不是合法 JSON（前 120 字：" + s.slice(0, 120) + "）");
  }

  /* 从响应头或错误正文里取服务端要求的等待秒数（公共通道会回 "Retry after 38s"） */
  function retryAfterSeconds(res, txt) {
    try {
      var h = res && res.headers && res.headers.get ? res.headers.get("retry-after") : null;
      if (h && isFinite(parseFloat(h))) return Math.ceil(parseFloat(h));
    } catch (e) {}
    var m = String(txt || "").match(/retry after\s*(\d+)\s*s/i);
    return m ? parseInt(m[1], 10) : 0;
  }

  /* 单次对话调用：所有通道都是 OpenAI 兼容 /chat/completions */
  async function chat(o) {
    var p = o.provider;
    if (!p || !p.base) throw new Error("未选择可用的 AI 通道");
    var url = p.base.replace(/\/+$/, "") + "/chat/completions";
    var body = {
      model: p.model || "openai",
      messages: o.messages,
      temperature: o.temperature == null ? 0.2 : o.temperature,
      stream: false
    };
    var headers = { "content-type": "application/json" };
    if (p.apiKey) headers.authorization = "Bearer " + p.apiKey;

    var lastErr = null;
    var maxAttempts = p.id === "public" ? 3 : 2;
    for (var attempt = 1; attempt <= maxAttempts; attempt++) {
      var ctl = typeof AbortController !== "undefined" ? new AbortController() : null;
      var timer = ctl ? setTimeout(function () { ctl.abort(); }, o.timeoutMs || 90000) : null;
      var t0 = Date.now();
      try {
        var f = o.fetchImpl || (typeof fetch !== "undefined" ? fetch : null);
        if (!f) throw new Error("当前环境没有 fetch");
        var r = await f(url, {
          method: "POST",
          headers: headers,
          body: JSON.stringify(body),
          signal: ctl ? ctl.signal : undefined
        });
        var txt = await r.text();
        if (timer) clearTimeout(timer);
        if (!r.ok) {
          lastErr = new Error("HTTP " + r.status + " · " + txt.slice(0, 200));
          // 公共通道的限流是常态（402 FREE_LIMIT / 429），按服务端提示的秒数等待后重试
          if (r.status === 402 || r.status === 429 || r.status >= 500) {
            if (attempt >= maxAttempts) break;
            await sleep((retryAfterSeconds(r, txt) || 15) * 1000);
            continue;
          }
          throw lastErr;
        }
        var j = JSON.parse(txt);
        var m = (j.choices && j.choices[0] && j.choices[0].message) || {};
        var content = String(m.content || "").trim() || String(m.reasoning || "").trim();
        if (!content) throw new Error("模型返回空内容");
        return { content: content, ms: Date.now() - t0, model: j.model || body.model, usage: j.usage || null };
      } catch (e) {
        if (timer) clearTimeout(timer);
        lastErr = e;
        if (attempt === 2) break;
        await sleep(1200);
      }
    }
    throw lastErr || new Error("AI 调用失败");
  }

  function stage1Prompt(input) {
    return "【阶段1｜解析评分维度】\n挑战：" + input.challenge +
      "\n\n原始 rubric：\n" + input.rubric +
      '\n\n只输出 JSON：{"totalPoints":100,"dimensions":[{"id":"英文短id","label":"中文维度名","maxPoints":25,"signals":["正向信号"],"negativeSignals":["扣分信号"]}]}' +
      "\n要求：维度只能来自 rubric 原文，不得新增；各 maxPoints 之和尽量等于 totalPoints。";
  }

  function stage2Prompt(input, rubric) {
    return "【阶段2｜证据映射】\n评分维度（JSON）：\n" + JSON.stringify(rubric) +
      "\n\n证据清单：\n" + input.evidence +
      '\n\n只输出 JSON：{"coverage":0.0,"mappings":[{"dimensionId":"维度id","claims":[{"claim":"一条判断","evidenceRef":"证据中的文件名或原文片段","strength":"strong|partial|missing"}]}]}' +
      "\n要求：evidenceRef 必须能在证据清单里找到；找不到就 strength 填 missing 并说明缺什么，绝不编造文件名。";
  }

  function stage3Prompt(input, rubric, mapping) {
    return "【阶段3｜评分与扣分风险】\n挑战：" + input.challenge +
      "\n维度与分值：" + JSON.stringify(rubric) +
      "\n证据映射：" + JSON.stringify(mapping) +
      '\n\n只输出 JSON：{"dimensions":[{"id":"维度id","score":0,"rationale":"给分理由","risks":[{"risk":"扣分风险","severity":"high|medium|low","fix":"可立即执行的修复"}]}],"blockers":["会让这份提交被打回的一句话问题"],"quickWins":["30分钟内能做完的提分动作"],"verdict":"一句话结论"}' +
      "\n要求：score 不得超过该维度 maxPoints；证据缺失必须体现在分数和 risks 里。";
  }

  /* 确定性收口：模型的分数只做参考，上限、缺维、总分由代码算 */
  function finalize(rubric, report, mapping) {
    var dims = (rubric && rubric.dimensions) || [];
    var byId = {};
    var list = (report && report.dimensions) || [];
    for (var i = 0; i < list.length; i++) if (list[i] && list[i].id) byId[list[i].id] = list[i];
    var maxTotal = 0, total = 0, rows = [];
    for (var k = 0; k < dims.length; k++) {
      var d = dims[k];
      var maxP = clamp(d.maxPoints, 0, 100);
      maxTotal += maxP;
      var got = byId[d.id];
      var s = got ? clamp(got.score, 0, maxP) : 0;
      total += s;
      rows.push({
        id: d.id,
        label: d.label || d.id,
        maxPoints: maxP,
        score: s,
        rationale: got ? String(got.rationale || "") : "模型未覆盖该维度，按 0 分计",
        risks: (got && got.risks) || [],
        missing: !got
      });
    }
    var claims = (mapping && mapping.mappings) || [];
    var strong = 0, partial = 0, missing = 0;
    for (var c = 0; c < claims.length; c++) {
      var cs = (claims[c].claims) || [];
      for (var x = 0; x < cs.length; x++) {
        var st = cs[x].strength;
        if (st === "strong") strong++; else if (st === "partial") partial++; else missing++;
      }
    }
    var denom = strong + partial + missing;
    return {
      rows: rows,
      total: total,
      maxTotal: maxTotal,
      ratio: maxTotal ? total / maxTotal : 0,
      coverage: denom ? (strong + 0.5 * partial) / denom : 0,
      claims: { strong: strong, partial: partial, missing: missing },
      blockers: (report && report.blockers) || [],
      quickWins: (report && report.quickWins) || [],
      verdict: (report && report.verdict) || ""
    };
  }

  async function runPipeline(o) {
    var input = o.input, provider = o.provider, onStage = o.onStage || function () {};
    var log = [];
    var t0 = Date.now();

    onStage("rubric", "running");
    var r1 = await chat({ provider: provider, messages: [
      { role: "system", content: SYS }, { role: "user", content: stage1Prompt(input) } ], fetchImpl: o.fetchImpl });
    var rubric = extractJson(r1.content);
    log.push({ stage: "rubric", ms: r1.ms, model: r1.model, usage: r1.usage, out: rubric });
    onStage("rubric", "done", { ms: r1.ms, model: r1.model });

    onStage("evidence", "running");
    var r2 = await chat({ provider: provider, messages: [
      { role: "system", content: SYS }, { role: "user", content: stage2Prompt(input, rubric) } ], fetchImpl: o.fetchImpl });
    var mapping = extractJson(r2.content);
    log.push({ stage: "evidence", ms: r2.ms, model: r2.model, usage: r2.usage, out: mapping });
    onStage("evidence", "done", { ms: r2.ms, model: r2.model });

    onStage("report", "running");
    var r3 = await chat({ provider: provider, messages: [
      { role: "system", content: SYS }, { role: "user", content: stage3Prompt(input, rubric, mapping) } ], fetchImpl: o.fetchImpl });
    var report = extractJson(r3.content);
    log.push({ stage: "report", ms: r3.ms, model: r3.model, usage: r3.usage, out: report });
    onStage("report", "done", { ms: r3.ms, model: r3.model });

    var fin = finalize(rubric, report, mapping);
    fin.elapsedMs = Date.now() - t0;
    fin.rubric = rubric;
    fin.mapping = mapping;
    fin.log = log;
    return fin;
  }

  root.RL = {
    PROVIDERS: PROVIDERS, SYS: SYS, chat: chat, extractJson: extractJson,
    runPipeline: runPipeline, finalize: finalize, clamp: clamp,
    prompts: { stage1: stage1Prompt, stage2: stage2Prompt, stage3: stage3Prompt }
  };
})(typeof window !== "undefined" ? window : globalThis);
