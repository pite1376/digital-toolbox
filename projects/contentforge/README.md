# 内容工坊 ContentForge

> Capture, clean, organize, and export web content.

ContentForge 同时提供浏览器扩展和同源网页版。GitHub Pages 直接发布扩展内的 `tab.html`，不另行维护第二套界面。扩展版可抓取当前网页、多选页面区域和读取虚拟滚动文档。

## Load the extension

1. 打开 `chrome://extensions` 或 `edge://extensions`。
2. 开启“开发者模式”。
3. 点击“加载已解压的扩展程序”。
4. 选择 `projects/contentforge/extension` 目录。

## Web and extension differences

GitHub Pages 是静态托管。同一份界面在网页环境中可使用文本、JSON、图片链接和文档导出功能；读取当前标签页、注入其他网页和复用登录态仍需要扩展环境。
