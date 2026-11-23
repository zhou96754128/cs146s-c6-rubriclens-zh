# C6 源码仓库链接

## 仓库地址

**https://github.com/zhou96754128/cs146s-c6-rubriclens-zh**

- 可见性：PUBLIC（无需授权即可 clone 与审阅）
- 主分支：`main`，GitHub Pages 直接托管该分支根目录
- clone 命令：`git clone https://github.com/zhou96754128/cs146s-c6-rubriclens-zh`

## 仓库结构

```
index.html                      单页入口（无构建步骤）
app/core.js                     三阶段流水线 + 确定性分值收口
app/ui.js                       表单、渲染、导出 Markdown
app/sample.js                   离线回放用的真实实跑结果（由 tools/gen_sample.mjs 生成）
assets/style.css                样式
demo/01_首屏.png                首屏截图
demo/02_回放报告.png            回放报告截图
evidence/                       本机真实模型调用的原始记录（含 latest.json 与带时间戳的 run_public_*.json）
tools/gen_sample.mjs            从 evidence 生成 app/sample.js
tools/verify_ai.mjs             AI 流水线自检（15 项断言）
tools/verify_sample.mjs         离线回放数据一致性自检
Zhouruoying_C6_AI日志.md        AI 使用日志（含返工与纠错记录）
Zhouruoying_C6_demo走查.md      demo 截图逐项说明
Zhouruoying_C6_app链接.md       应用地址与复核方法
Zhouruoying_C6_repo链接.md      本文件
Zhouruoying_C6_AAR.md           复盘
README.md                       总说明（在线地址 / 本地运行 / 自检怎么跑）
```

## 自证怎么跑（任何人都能复现）

```bash
node tools/verify_sample.mjs   # 离线回放数据一致性
node tools/verify_ai.mjs       # AI 流水线 15 项断言（需本机模型服务）
```

`evidence/` 下的 `run_public_*.json` 是真实调用产生的原始记录，文件名带 UTC 时间戳，可与 `Zhouruoying_C6_AI日志.md` 中记录的时间逐条对上。

## 提交历史说明

仓库按功能分阶段提交（页面骨架 → 三阶段流水线 → 回放深链 → demo 与断言 → 提交前复跑证据），每次提交对应一处可验证的改动，便于按提交粒度审阅实现路径。
