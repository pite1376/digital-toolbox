(() => {
  if (window.__tuwenPageContentInstalled) return;
  window.__tuwenPageContentInstalled = true;

  const BLOCK_SELECTOR = 'article,main,section,h1,h2,h3,h4,h5,h6,p,blockquote,pre,ul,ol,table,figure,div';
  const state = { active: false, hovered: null, selected: [], toolbar: null, style: null };

  function cleanText(value) {
    return String(value || '').replace(/\u00a0/g, ' ').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  function isVisible(el) {
    if (!el || !(el instanceof Element)) return false;
    const style = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) > 0 && rect.width > 16 && rect.height > 12;
  }

  function sectionFromElement(el, index) {
    const heading = el.matches('h1,h2,h3,h4,h5,h6') ? el : el.querySelector('h1,h2,h3,h4,h5,h6');
    const title = cleanText(heading?.innerText) || `内容 ${index + 1}`;
    let text = cleanText(el.innerText);
    if (heading && text.startsWith(title)) text = cleanText(text.slice(title.length));
    if (!text && heading) text = title;
    return { id: `web_${Date.now()}_${index}`, title, text, selected: true };
  }

  function extractFullPage() {
    const root = document.querySelector('article') || document.querySelector('main') || document.body;
    const candidates = Array.from(root.querySelectorAll('h1,h2,h3,h4,h5,h6,p,blockquote,pre,ul,ol,table'));
    const sections = [];
    let current = null;
    for (const el of candidates) {
      if (!isVisible(el) || el.closest('nav,header,footer,aside,[role="navigation"],[aria-hidden="true"]')) continue;
      const text = cleanText(el.innerText);
      if (text.length < 2) continue;
      if (el.matches('h1,h2,h3,h4,h5,h6')) {
        current = { id: `web_${Date.now()}_${sections.length}`, title: text, text: '', selected: true };
        sections.push(current);
      } else {
        if (!current) {
          current = { id: `web_${Date.now()}_${sections.length}`, title: sections.length ? `内容 ${sections.length + 1}` : document.title, text: '', selected: true };
          sections.push(current);
        }
        if (!current.text.includes(text)) current.text += `${current.text ? '\n\n' : ''}${text}`;
      }
    }
    return makeResult(sections.filter((s) => cleanText(`${s.title}${s.text}`).length > 2));
  }

  function findPrimaryScroller() {
    const candidates = [document.scrollingElement, ...document.querySelectorAll('main,article,[role="main"],div')].filter(Boolean);
    let best = document.scrollingElement;
    let bestRange = Math.max(0, (best?.scrollHeight || 0) - (best?.clientHeight || innerHeight));
    for (const el of candidates) {
      const style = getComputedStyle(el);
      const range = el.scrollHeight - el.clientHeight;
      if (range > bestRange && (el === document.scrollingElement || /(auto|scroll)/.test(style.overflowY))) {
        best = el;
        bestRange = range;
      }
    }
    return best;
  }

  function collectVisibleBlocks(store) {
    const root = document.querySelector('article') || document.querySelector('main') || document.body;
    let nodes = Array.from(root.querySelectorAll('h1,h2,h3,h4,h5,h6,p,blockquote,pre,li,table'));
    if (nodes.filter(isVisible).reduce((sum, el) => sum + cleanText(el.innerText).length, 0) < 100) {
      nodes = Array.from(root.querySelectorAll('[data-block-id],[data-node-id],[contenteditable="true"] > div'));
    }
    for (const el of nodes) {
      if (!isVisible(el) || el.closest('nav,header,footer,aside,[role="navigation"],[aria-hidden="true"],#__tuwen-picker-toolbar')) continue;
      const text = cleanText(el.innerText);
      if (text.length < 2) continue;
      const key = text.replace(/\s+/g, ' ').slice(0, 500);
      if (store.has(key)) continue;
      store.set(key, { heading: el.matches('h1,h2,h3,h4,h5,h6'), text });
    }
  }

  async function extractFullPageEnhanced() {
    const scroller = findPrimaryScroller();
    const isRoot = scroller === document.scrollingElement;
    const original = isRoot ? window.scrollY : scroller.scrollTop;
    const blocks = new Map();
    const getTop = () => isRoot ? window.scrollY : scroller.scrollTop;
    const setTop = (value) => isRoot ? window.scrollTo(0, value) : scroller.scrollTo(0, value);
    const getViewport = () => isRoot ? window.innerHeight : scroller.clientHeight;
    const getMax = () => Math.max(0, scroller.scrollHeight - getViewport());
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    try {
      setTop(0);
      await wait(350);
      let previous = -1;
      for (let step = 0; step < 180; step++) {
        collectVisibleBlocks(blocks);
        const top = getTop();
        const max = getMax();
        if (top >= max - 4 || top === previous) break;
        previous = top;
        setTop(Math.min(max, top + Math.max(280, Math.floor(getViewport() * 0.72))));
        await wait(220);
      }
      collectVisibleBlocks(blocks);
    } finally {
      setTop(original);
    }

    const sections = [];
    let current = null;
    for (const block of blocks.values()) {
      if (block.heading) {
        current = { id: `web_${Date.now()}_${sections.length}`, title: block.text, text: '', selected: true };
        sections.push(current);
      } else {
        if (!current) {
          current = { id: `web_${Date.now()}_${sections.length}`, title: document.title || '正文', text: '', selected: true };
          sections.push(current);
        }
        if (!current.text.includes(block.text)) current.text += `${current.text ? '\n\n' : ''}${block.text}`;
      }
    }
    return makeResult(sections.filter((s) => cleanText(`${s.title}${s.text}`).length > 2));
  }

  function makeResult(sections) {
    return { title: document.title || '未命名网页', url: location.href, capturedAt: new Date().toISOString(), sections };
  }

  function pickTarget(target) {
    if (!(target instanceof Element) || target.closest('#__tuwen-picker-toolbar')) return null;
    let el = target.closest(BLOCK_SELECTOR);
    while (el && (el === document.body || el === document.documentElement || cleanText(el.innerText).length < 2)) el = el.parentElement;
    if (!el || el === document.body || el === document.documentElement) return null;
    const textLen = cleanText(el.innerText).length;
    if (el.matches('div,section') && textLen > 1600) {
      const child = target.closest('h1,h2,h3,h4,h5,h6,p,blockquote,pre,ul,ol,table,figure');
      if (child) el = child;
    }
    return isVisible(el) ? el : null;
  }

  function updateToolbar() {
    const count = state.toolbar?.querySelector('[data-count]');
    if (count) count.textContent = `已选择 ${state.selected.length} 个区域`;
  }

  function onMove(event) {
    const next = pickTarget(event.target);
    if (state.hovered === next) return;
    state.hovered?.classList.remove('__tuwen-picker-hover');
    state.hovered = next;
    if (next && !state.selected.includes(next)) next.classList.add('__tuwen-picker-hover');
  }

  function onClick(event) {
    if (event.target.closest('#__tuwen-picker-toolbar')) return;
    const el = pickTarget(event.target);
    if (!el) return;
    event.preventDefault();
    event.stopPropagation();
    const index = state.selected.indexOf(el);
    if (index >= 0) {
      state.selected.splice(index, 1);
      el.classList.remove('__tuwen-picker-selected');
    } else {
      state.selected.push(el);
      el.classList.add('__tuwen-picker-selected');
    }
    el.classList.remove('__tuwen-picker-hover');
    updateToolbar();
  }

  function onKey(event) {
    if (event.key === 'Escape') stopPicker(false);
  }

  function stopPicker(complete) {
    if (!state.active) return;
    const result = complete ? makeResult(state.selected.map(sectionFromElement).filter((s) => cleanText(`${s.title}${s.text}`).length > 2)) : null;
    state.active = false;
    state.hovered?.classList.remove('__tuwen-picker-hover');
    state.selected.forEach((el) => el.classList.remove('__tuwen-picker-selected'));
    state.selected = [];
    document.removeEventListener('mousemove', onMove, true);
    document.removeEventListener('click', onClick, true);
    document.removeEventListener('keydown', onKey, true);
    state.toolbar?.remove();
    state.style?.remove();
    state.toolbar = null;
    state.style = null;
    if (complete && result) chrome.runtime.sendMessage({ action: 'tuwenPageSelectionComplete', payload: result });
  }

  function startPicker() {
    if (state.active) return;
    state.active = true;
    state.style = document.createElement('style');
    state.style.textContent = `
      .__tuwen-picker-hover{outline:2px dashed #0071e3!important;outline-offset:3px!important;cursor:crosshair!important}
      .__tuwen-picker-selected{outline:2px solid #0071e3!important;outline-offset:3px!important;background-color:rgba(0,113,227,.10)!important}
      #__tuwen-picker-toolbar{position:fixed;z-index:2147483647;top:16px;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:14px;background:rgba(29,29,31,.94);box-shadow:0 8px 30px rgba(0,0,0,.25);color:#fff;font:13px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
      #__tuwen-picker-toolbar button{border:0;border-radius:9px;padding:7px 12px;cursor:pointer;font-weight:700}
      #__tuwen-picker-toolbar [data-cancel]{background:#48484a;color:#fff}
      #__tuwen-picker-toolbar [data-done]{background:#fff;color:#1d1d1f}
    `;
    document.documentElement.appendChild(state.style);
    state.toolbar = document.createElement('div');
    state.toolbar.id = '__tuwen-picker-toolbar';
    state.toolbar.innerHTML = '<strong data-count>已选择 0 个区域</strong><span>单击选择 · Esc 取消</span><button data-cancel>取消</button><button data-done>完成</button>';
    state.toolbar.querySelector('[data-cancel]').addEventListener('click', () => stopPicker(false));
    state.toolbar.querySelector('[data-done]').addEventListener('click', () => {
      if (state.selected.length) stopPicker(true);
    });
    document.documentElement.appendChild(state.toolbar);
    document.addEventListener('mousemove', onMove, true);
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKey, true);
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.action === 'tuwenExtractFullPage') sendResponse({ ok: true, payload: extractFullPage() });
    if (message?.action === 'tuwenExtractEnhancedPage') {
      extractFullPageEnhanced()
        .then((payload) => sendResponse({ ok: true, payload }))
        .catch((error) => sendResponse({ ok: false, error: error.message }));
      return true;
    }
    if (message?.action === 'tuwenStartPagePicker') {
      startPicker();
      sendResponse({ ok: true });
    }
  });
})();
