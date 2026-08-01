# Digital Toolbox

一个面向内容与效率工具的项目合集。每个项目位于 `projects/` 下的独立子目录，共享一套项目展示首页和 GitHub Pages 发布流程。

## Projects

### ModelBench

AI 模型横向对比平台。将同一个问题同时发送给多个模型，实时对比回答质量、响应速度和 token 消耗。

- [在线体验](https://pite1376.github.io/ModelBench/)
- [GitHub 仓库](https://github.com/pite1376/ModelBench)

### 内容工坊 ContentForge

一站式网页内容采集、清洗、整理与导出工具。

- Chrome / Edge 侧边栏扩展
- 网页正文和图片抓取
- 飞书/Lark 虚拟滚动文档增强采集
- 文本清洗与 JSON 处理
- Word、Markdown、TXT 导出
- 独立静态网页版

代码位于 [`projects/contentforge`](projects/contentforge)。

## Repository layout

```text
projects/contentforge/extension/  浏览器扩展与同源网页版
portal/                           项目合集首页
.github/workflows/                GitHub Pages 部署
```

## License

[MIT](LICENSE)
