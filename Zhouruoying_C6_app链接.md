# C6 应用链接（RubricLens）

## 在线应用地址

**https://zhou96754128.github.io/cs146s-c6-rubriclens-zh/**

- 部署方式：GitHub Pages，直接托管 `main` 分支根目录的纯静态文件
- 打开即用：无安装、无账号、无后端、无数据库
- 访问实测：HTTP 200（2026-11-23 复核；页面返回的 `app/sample.js` 为 5369 B，与本仓库新构建的字节数一致，说明线上已是当前版本）

## 直达回放（离线可看）

**https://zhou96754128.github.io/cs146s-c6-rubriclens-zh/#replay**

不进表单，直接看一次已保存的真实实跑回放报告，用于快速判断产品长什么样。

## 本地运行（不依赖 Pages 也能跑）

```bash
git clone https://github.com/zhou96754128/cs146s-c6-rubriclens-zh
cd cs146s-c6-rubriclens-zh
python3 -m http.server 8000
# 浏览器打开 http://localhost:8000/
```

因为没有任何构建步骤与外部依赖，`index.html` 也可以直接用浏览器打开（`file://`）运行。

## 链接有效性怎么复核

1. 打开上面的应用地址，页面首屏应出现三个输入区与「开始自评」按钮；
2. 打开 `#replay` 深链，应直接渲染一次已保存的回放报告，不经过表单；
3. 任一环节打不开，说明 Pages 部署异常，可用上面的本地运行方式替代验证。
