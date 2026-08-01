// 打开扩展图标时自动打开侧边栏
chrome.runtime.onInstalled.addListener(() => {
  if (chrome.sidePanel?.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  }
});


// 处理来自 popup/sidepanel 的图片抓取请求（绕过 CORS）
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.action === 'fetchImage' && msg.url) {
    fetch(msg.url, { credentials: 'omit' })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.blob();
      })
      .then(async (blob) => {
        const buf = await blob.arrayBuffer();
        return sendResponse({ ok: true, data: Array.from(new Uint8Array(buf)), type: blob.type });
      })
      .catch((e) => sendResponse({ ok: false, error: e.message }));
    return true; // 异步 sendResponse
  }

  if (msg?.action === 'fetchPageHtml' && msg.url) {
    fetch(msg.url, { credentials: 'omit', redirect: 'follow' })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const type = res.headers.get('content-type') || '';
        if (!type.includes('text/html') && !type.includes('application/xhtml+xml')) throw new Error('该链接不是网页 HTML');
        return Promise.all([res.text(), Promise.resolve(res.url || msg.url)]);
      })
      .then(([html, finalUrl]) => sendResponse({ ok: true, html: html.slice(0, 5_000_000), finalUrl }))
      .catch((e) => sendResponse({ ok: false, error: e.message }));
    return true;
  }
});
