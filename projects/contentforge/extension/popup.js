// 智能图文处理工具（Chrome/Edge 扩展 popup 版）
// 说明：
// 1) 兼容 MV3 CSP：不使用内联脚本/内联 onclick
// 2) popup 宽度默认 600px；左右分栏比例可拖拽并持久化（chrome.storage.local）

// 全局状态管理
const state = {
  mode: 'image',
  currentImages: [],
  selectedImages: new Set(),
  history: [],
  currentContextImage: null,
  debugMode: false,
  textCompressed: false,
  textLastInput: '',
  textLastCleaned: '',
  imageLastInput: '',
  imageLastCleanedUrls: [],
  panelWidth: 280,
  gridCols: 'auto',
  jsonLastInput: '',
  jsonLastNormalized: '',
  jsonLastParsed: null,
  jsonView: 'format', // format | compress
  webDocument: null,
  webEditing: false,
  webDirty: false,
  webExported: false,
  webSource: null,
  webUrlInput: '',

  // 图片模式设置
  filterSmall: true,

  // 图片预览缩放/平移状态
  preview: {
    currentIndex: -1,
    scale: 1,
    x: 0,
    y: 0,
    dragging: false,
    moved: false,
    justDragged: false,
    dragStartX: 0,
    dragStartY: 0,
    dragOriginX: 0,
    dragOriginY: 0
  }
};

// 侧边栏输入框“默认高度”（页面打开时的高度，作为一键收起的目标）
state.composerBaseHeight = null;

// DOM 元素（init 时填充）
const elements = {};

// ========= 存储（用于面板宽度） =========
function getSetting(key, fallback) {
  return new Promise((resolve) => {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        chrome.storage.local.get([key], (res) => resolve(res?.[key] ?? fallback));
      } else {
        const raw = localStorage.getItem(key);
        resolve(raw == null ? fallback : JSON.parse(raw));
      }
    } catch (e) {
      resolve(fallback);
    }
  });
}

function setSetting(key, value) {
  return new Promise((resolve) => {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        chrome.storage.local.set({ [key]: value }, () => resolve());
      } else {
        localStorage.setItem(key, JSON.stringify(value));
        resolve();
      }
    } catch (e) {
      resolve();
    }
  });
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

// ========= 初始化 =========
async function initApp() {
  // 缓存元素
  Object.assign(elements, {
    mainContainer: document.getElementById('mainContainer'),
    splitter: document.getElementById('splitter'),
    gallerySection: document.getElementById('gallerySection'),
    controlPanel: document.getElementById('controlPanel'),
    gridColsSelect: document.getElementById('gridColsSelect'),
    webCaptureEntryBtn: document.getElementById('webCaptureEntryBtn'),

    inputText: document.getElementById('inputText'),
    processBtn: document.getElementById('processBtn'),
    clearBtn: document.getElementById('clearBtn'),
    galleryContent: document.getElementById('galleryContent'),
    imageCount: document.getElementById('imageCount'),
    statsDisplay: document.getElementById('statsDisplay'),
    selectAllBtn: document.getElementById('selectAllBtn'),
    downloadSelectedBtn: document.getElementById('downloadSelectedBtn'),
    zipSelectedBtn: document.getElementById('zipSelectedBtn'),
    zipAllBtn: document.getElementById('zipAllBtn'),
    downloadAllBtn: document.getElementById('downloadAllBtn'),
    selectedCount: document.getElementById('selectedCount'),
    historyBtn: document.getElementById('historyBtn'),
    historyDrawer: document.getElementById('historyDrawer'),
    closeHistoryBtn: document.getElementById('closeHistoryBtn'),
    historyBody: document.getElementById('historyBody'),
    overlay: document.getElementById('overlay'),
    toast: document.getElementById('toast'),
    toastMessage: document.getElementById('toastMessage'),
    inputHint: document.getElementById('inputHint'),
    imageOptions: document.getElementById('imageOptions'),
    filterSmallChk: document.getElementById('filterSmallChk'),
    grabPageBtn: document.getElementById('grabPageBtn'),
    clearGalleryBtn: document.getElementById('clearGalleryBtn'),
    modeSelect: document.getElementById('modeSelect'),
    composerBox: document.getElementById('composerBox'),
    composerEdge: document.getElementById('composerEdge'),
    composerEdgeIcon: document.getElementById('composerEdgeIcon'),
    composerToggleBtn: document.getElementById('composerToggleBtn'),
    modeBtns: document.querySelectorAll('.mode-btn'),
    contextMenu: document.getElementById('contextMenu'),
    copyImageMenu: document.getElementById('copyImageMenu'),
    copyLinkMenu: document.getElementById('copyLinkMenu'),
    downloadMenu: document.getElementById('downloadMenu'),
    previewMenu: document.getElementById('previewMenu'),
    debugBtn: document.getElementById('debugBtn'),
    debugInfo: document.getElementById('debugInfo'),
    debugContent: document.getElementById('debugContent'),
    imagePreviewBackdrop: document.getElementById('imagePreviewBackdrop'),
    imagePreviewDialog: document.getElementById('imagePreviewDialog'),
    imagePreviewImg: document.getElementById('imagePreviewImg'),
    imagePreviewIndex: document.getElementById('imagePreviewIndex'),
    imagePreviewPrevBtn: document.getElementById('imagePreviewPrevBtn'),
    imagePreviewNextBtn: document.getElementById('imagePreviewNextBtn'),
    imagePreviewLeftHotspot: document.getElementById('imagePreviewLeftHotspot'),
    imagePreviewRightHotspot: document.getElementById('imagePreviewRightHotspot'),
    imagePreviewResetBtn: document.getElementById('imagePreviewResetBtn'),
    imagePreviewCloseBtn: document.getElementById('imagePreviewCloseBtn')
  });

  // 读取并应用分栏宽度（右侧控制台宽度）
  const savedWidth = await getSetting('panelWidth', 280);
  applyPanelWidth(savedWidth);

  // 读取并应用图片网格列数
  const savedGridCols = await getSetting('gridCols', 'auto');
  applyGridCols(savedGridCols);
  if (elements.gridColsSelect) {
    elements.gridColsSelect.value = String(savedGridCols);
  }

  // 读取并应用“过滤小图”开关
  const savedFilterSmall = await getSetting('filterSmall', true);
  state.filterSmall = !!savedFilterSmall;
  if (elements.filterSmallChk) elements.filterSmallChk.checked = state.filterSmall;

  // 读取并应用“模式选择”（侧边栏可用下拉框）
  let savedModeSel = await getSetting('modeSelect', 'auto');
  if (savedModeSel === 'web') {
    savedModeSel = 'auto';
    await setSetting('modeSelect', 'auto');
  }
  if (elements.modeSelect) {
    elements.modeSelect.value = String(savedModeSel);
  }
  updateModeHint();

  // 侧边栏：输入框默认高度（浏览器高度的一半为上限）
  if (elements.composerBox && elements.inputText) {
    const maxH = Math.floor(window.innerHeight * 0.5);
    const minH = 92;
    const savedH = await getSetting('composerHeight', Math.min(Math.floor(window.innerHeight * 0.25), maxH));
    const h = clamp(Number(savedH) || minH, minH, maxH);
    applyComposerHeight(h);
    state.composerBaseHeight = h;
  }

  loadHistory();
  bindEvents();
  updatePlaceholder();
  if (savedModeSel === 'web') {
    state.mode = 'web';
    state.webDocument = await getSetting('lastWebDocument', null);
    state.webSource = state.webDocument?.source || null;
    updatePlaceholder();
    renderWebWorkspace();
  } else {
    renderEmptyState();
  }
}

function updateSendEnabled() {
  if (!elements.processBtn || !elements.inputText) return;
  if (!elements.processBtn.classList?.contains('send-btn')) return;
  const has = !!(elements.inputText.value || '').trim();
  elements.processBtn.disabled = !has;
}

function applyPanelWidth(width) {
  const containerWidth = elements.mainContainer?.getBoundingClientRect?.().width || 600;
  // 留给左侧至少 260px；右侧至少 240px
  const minPanel = 240;
  const maxPanel = Math.min(420, containerWidth - 260 - 8);
  const w = clamp(Number(width) || 280, minPanel, maxPanel);
  state.panelWidth = w;
  document.documentElement.style.setProperty('--panel-width', `${w}px`);
}

function applyGridCols(value) {
  const v = String(value ?? 'auto');
  state.gridCols = v;
  if (v === 'auto') {
    document.body.removeAttribute('data-grid-cols');
  } else {
    // 允许 2~6，其他值回退 auto
    const n = Number(v);
    if ([2, 3, 4, 5, 6].includes(n)) document.body.setAttribute('data-grid-cols', String(n));
    else document.body.removeAttribute('data-grid-cols');
  }
}

function applyComposerHeight(h) {
  if (!elements.composerBox || !elements.inputText) return;
  elements.composerBox.style.height = `${h}px`;
  // textarea 填满剩余空间（去掉 padding 与按钮区的预留）
  const padTop = 12;
  const padBottom = 12;
  const reserve = padTop + padBottom;
  const taH = Math.max(44, h - reserve);
  elements.inputText.style.height = `${taH}px`;
  syncComposerOffset();
}

function syncComposerOffset() {
  const composer = elements.controlPanel;
  if (!composer?.classList?.contains('composer')) return;
  const h = Math.ceil(composer.getBoundingClientRect().height);
  document.body.style.setProperty('--composer-offset', `${h + 14}px`);
}

function getCurrentGalleryCols() {
  const selected = String(state.gridCols || 'auto');
  if (selected !== 'auto') {
    const n = Number(selected);
    if (Number.isFinite(n) && n > 0) return n;
  }
  const boxW = elements.galleryContent?.getBoundingClientRect?.().width || elements.gallerySection?.getBoundingClientRect?.().width || 360;
  const minCol = 180;
  const gap = 12;
  return Math.max(1, Math.floor((boxW + gap) / (minCol + gap)));
}

function updateGalleryItemHeight(imageCount) {
  const grid = elements.galleryContent?.querySelector?.('.gallery-grid');
  if (!grid) return;
  const cols = Math.max(1, getCurrentGalleryCols());
  const rows = clamp(Math.ceil((imageCount || 0) / cols) || 1, 2, 3);
  const boxH = elements.gallerySection?.getBoundingClientRect?.().height || 600;
  const headerGap = 28; // 顶部工具条与网格间距
  const gap = 12;
  const available = Math.max(220, boxH - headerGap);
  const itemH = Math.max(220, Math.floor((available - gap * (rows - 1)) / rows));
  grid.style.setProperty('--gallery-item-height', `${itemH}px`);
}

function updateModeHint() {
  if (!elements.inputHint) return;
  const sel = elements.modeSelect?.value || 'auto';
  if (sel === 'image') {
    elements.inputHint.textContent = '图片链接模式：粘贴链接（多行/数组均可），支持抓取当前页图片与ZIP打包。';
  } else if (sel === 'text') {
    elements.inputHint.textContent = '文本模式：自动去 Markdown 符号、压缩空行；可复制与导出。';
  } else if (sel === 'json') {
    elements.inputHint.textContent = 'JSON 模式：支持转义/错误定位/树形查看与搜索；可复制与导出。';
  } else if (sel === 'web') {
    elements.inputHint.textContent = '网页文本：抓取整页正文，或回到网页多选内容区域。';
  } else {
    elements.inputHint.textContent = '自动模式：先识别是否为图片链接，其次尝试解析 JSON，否则按文本清洗处理。';
  }
}

function getSelectedProcessingMode(input) {
  if (elements.modeSelect) {
    const selected = elements.modeSelect.value || 'auto';
    if (selected === 'image' || selected === 'text' || selected === 'json' || selected === 'web') return selected;
  } else if (state.mode === 'image' || state.mode === 'text' || state.mode === 'json' || state.mode === 'web') {
    return state.mode;
  }
  return decideModeForInput(input);
}

function syncModeControls(mode) {
  if (elements.modeBtns?.length) {
    elements.modeBtns.forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.mode === mode);
    });
  }
}

function updateComposerEdgeIcon() {
  if (!elements.composerBox || !elements.composerEdgeIcon) return;
  const h = elements.composerBox.getBoundingClientRect().height;
  const maxH = Math.floor(window.innerHeight * 0.5);
  const minH = 92;
  const nearMin = h <= minH + 2;
  const nearMax = h >= maxH - 2;
  // 到最底部则显示往上，到顶部显示往下，中间显示双箭头
  elements.composerEdgeIcon.textContent = nearMin ? '↑' : nearMax ? '↓' : '↕';
}

function updateComposerToggleIcon() {
  if (!elements.composerBox || !elements.composerToggleBtn) return;
  const h = elements.composerBox.getBoundingClientRect().height;
  const maxH = Math.floor(window.innerHeight * 0.5);
  const nearMax = h >= maxH - 2;
  // 顶部按钮：短的斜向箭头（无边框）
  // 规则：最大时显示“往下”（提示可收起）；最小时显示“往上”（提示可展开）
  elements.composerToggleBtn.innerHTML = nearMax
    ? `<svg viewBox="0 0 24 24" fill="none">
         <path d="M7 7h8v8"></path>
         <path d="M7 7l10 10"></path>
       </svg>`   /* ↘ 收起（回到“原始高度”） */
    : `<svg viewBox="0 0 24 24" fill="none">
         <path d="M17 17h-8V9"></path>
         <path d="M17 17L7 7"></path>
       </svg>`;  /* ↖ 展开到最大（向上） */
}

function bindSplitter() {
  if (!elements.splitter || !elements.mainContainer) return;

  let dragging = false;
  let startX = 0;
  let startW = 0;

  const onMove = (e) => {
    if (!dragging) return;
    const dx = e.clientX - startX;
    // 右侧面板在右边：splitter 往右移动 => 面板变窄
    const nextW = startW - dx;
    applyPanelWidth(nextW);
  };

  const onUp = async () => {
    if (!dragging) return;
    dragging = false;
    elements.splitter.classList.remove('dragging');
    window.removeEventListener('mousemove', onMove, true);
    window.removeEventListener('mouseup', onUp, true);
    await setSetting('panelWidth', state.panelWidth);
  };

  elements.splitter.addEventListener('mousedown', (e) => {
    e.preventDefault();
    dragging = true;
    startX = e.clientX;
    startW = state.panelWidth;
    elements.splitter.classList.add('dragging');
    window.addEventListener('mousemove', onMove, true);
    window.addEventListener('mouseup', onUp, true);
  });
}

function bindEvents() {
  // 分隔条拖拽
  bindSplitter();

  if (elements.webCaptureEntryBtn) {
    elements.webCaptureEntryBtn.addEventListener('click', async () => {
      if (state.mode === 'web') {
        leaveWebCapture();
        return;
      }
      state.mode = 'web';
      if (!state.webDocument) state.webDocument = await getSetting('lastWebDocument', null);
      state.webSource = state.webDocument?.source || state.webSource;
      updatePlaceholder();
      renderWebWorkspace();
    });
  }

  // 新标签页打开（仅 popup.html 有这个按钮）
  const openTabBtn = document.getElementById('openTabBtn');
  if (openTabBtn) {
    openTabBtn.addEventListener('click', async () => {
      try {
        const [sourceTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (sourceTab?.id && /^https?:\/\//i.test(String(sourceTab.url || ''))) await setSetting('lastWebSourceTabId', sourceTab.id);
        const url = chrome?.runtime?.getURL ? chrome.runtime.getURL('tab.html') : 'tab.html';
        if (chrome?.tabs?.create) {
          chrome.tabs.create({ url });
        } else {
          window.open(url, '_blank', 'noopener,noreferrer');
        }
      } catch (e) {
        // 兜底：直接打开
        try { window.open('tab.html', '_blank'); } catch (_) {}
      }
    });
  }

  // 展示列数设置
  if (elements.gridColsSelect) {
    elements.gridColsSelect.addEventListener('change', async () => {
      const v = elements.gridColsSelect.value;
      applyGridCols(v);
      await setSetting('gridCols', v);
      if (state.currentImages?.length) updateGalleryItemHeight(state.currentImages.length);
    });
  }

  // 图片模式：过滤小图开关
  if (elements.filterSmallChk) {
    elements.filterSmallChk.addEventListener('change', async () => {
      state.filterSmall = !!elements.filterSmallChk.checked;
      await setSetting('filterSmall', state.filterSmall);
      // 若当前已有图片列表，重新渲染（不强制重新验证）
      if (state.mode === 'image' && state.currentImages?.length) {
        renderGallery(state.currentImages);
      }
    });
  }

  // 图片模式：抓取当前页图片
  if (elements.grabPageBtn) {
    elements.grabPageBtn.addEventListener('click', async () => {
      if (state.mode === 'web' || elements.modeSelect?.value === 'web') await grabWebPage(false);
      else await grabImagesFromActiveTab();
    });
  }

  // ZIP 下载
  if (elements.zipSelectedBtn) elements.zipSelectedBtn.addEventListener('click', downloadZipSelected);
  if (elements.zipAllBtn) elements.zipAllBtn.addEventListener('click', downloadZipAll);

  // 模式切换
  // 1) 旧版：按钮切换（如果存在）
  if (elements.modeBtns && elements.modeBtns.length) {
    elements.modeBtns.forEach((btn) => {
      btn.addEventListener('click', async () => {
        const prevMode = state.mode;
        const nextMode = btn.dataset.mode;

        // 离开当前模式时，缓存当前 textarea 内容与（如有）编辑后的结果
        if (prevMode === 'text') {
          state.textLastInput = elements.inputText.value ?? '';
          const ta = document.getElementById('cleanedTextContent');
          if (ta) state.textLastCleaned = ta.value ?? '';
        } else if (prevMode === 'image') {
          state.imageLastInput = elements.inputText.value ?? '';
        } else if (prevMode === 'json') {
          state.jsonLastInput = elements.inputText.value ?? '';
        }

        elements.modeBtns.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');

        state.mode = nextMode;
        updatePlaceholder();

        // 进入模式后恢复界面
        if (nextMode === 'text') {
          if (state.textLastInput) elements.inputText.value = state.textLastInput;
          if (state.textLastCleaned) {
            renderTextDisplay(state.textLastCleaned);
          } else {
            renderEmptyState();
          }
        } else if (nextMode === 'image') {
          // 图片模式：恢复图片输入，但不强制重新处理
          if (typeof state.imageLastInput === 'string') {
            elements.inputText.value = state.imageLastInput;
          }
          // 优先恢复上一次已验证的画廊
          if (state.currentImages && state.currentImages.length > 0) {
            renderGallery(state.currentImages);
          } else {
            renderEmptyState();
          }
        } else if (nextMode === 'json') {
          if (typeof state.jsonLastInput === 'string') elements.inputText.value = state.jsonLastInput;
          if (state.jsonLastParsed != null || state.jsonLastNormalized.trim() === 'null') {
            renderJsonDisplay({
              ok: true,
              normalized: state.jsonLastNormalized,
              parsed: state.jsonLastParsed
            });
          } else {
            renderEmptyState();
          }
        } else if (nextMode === 'web') {
          if (!state.webDocument) state.webDocument = await getSetting('lastWebDocument', null);
          state.webSource = state.webDocument?.source || state.webSource;
          renderWebWorkspace();
        }

        elements.inputText.focus();
      });
    });
  }

  // 2) 新版：下拉框选择（侧边栏）
  if (elements.modeSelect) {
    elements.modeSelect.addEventListener('change', async () => {
      const v = elements.modeSelect.value;
      await setSetting('modeSelect', v);
      if (v === 'web') {
        state.mode = 'web';
        if (!state.webDocument) state.webDocument = await getSetting('lastWebDocument', null);
        state.webSource = state.webDocument?.source || state.webSource;
        renderWebWorkspace();
      } else if (v === 'image' || v === 'text' || v === 'json') {
        state.mode = v;
        renderEmptyState();
      }
      updatePlaceholder();
      updateModeHint();
    });
  }

  // 处理按钮
  if (elements.processBtn) elements.processBtn.addEventListener('click', processInput);

  // 清空按钮
  if (elements.clearBtn) elements.clearBtn.addEventListener('click', () => {
    elements.inputText.value = '';
    if (state.mode === 'text') {
      state.textLastInput = '';
      state.textLastCleaned = '';
      renderEmptyState();
    } else if (state.mode === 'image') {
      state.imageLastInput = '';
      state.imageLastCleanedUrls = [];
    } else if (state.mode === 'json') {
      state.jsonLastInput = '';
      state.jsonLastNormalized = '';
      state.jsonLastParsed = null;
      renderEmptyState();
    } else if (state.mode === 'web') {
      state.webDocument = null;
      state.webSource = null;
      state.webDirty = false;
      setSetting('lastWebDocument', null);
      renderWebWorkspace();
    }
    elements.inputText.focus();
  });

  // 全选按钮
  if (elements.selectAllBtn) elements.selectAllBtn.addEventListener('click', toggleSelectAll);

  // 下载选中
  if (elements.downloadSelectedBtn) elements.downloadSelectedBtn.addEventListener('click', downloadSelected);

  // 下载全部
  if (elements.downloadAllBtn) elements.downloadAllBtn.addEventListener('click', downloadAll);

  // 历史记录
  if (elements.historyBtn) elements.historyBtn.addEventListener('click', openHistory);
  if (elements.closeHistoryBtn) elements.closeHistoryBtn.addEventListener('click', closeHistory);
  if (elements.overlay) elements.overlay.addEventListener('click', closeHistory);

  // 调试按钮
  if (elements.debugBtn) elements.debugBtn.addEventListener('click', toggleDebug);

  // 右键菜单
  if (elements.copyImageMenu) elements.copyImageMenu.addEventListener('click', copyImageToClipboard);
  if (elements.copyLinkMenu) elements.copyLinkMenu.addEventListener('click', copyLinkToClipboard);
  if (elements.downloadMenu) elements.downloadMenu.addEventListener('click', downloadContextImage);
  if (elements.previewMenu) elements.previewMenu.addEventListener('click', previewContextImage);

  // 点击其他地方关闭右键菜单
  document.addEventListener('click', () => {
    if (elements.contextMenu) elements.contextMenu.classList.remove('show');
  });

  if (chrome?.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((message) => {
      if (message?.action === 'tuwenPageSelectionComplete' && message.payload) acceptWebDocument(message.payload);
    });
  }

  // 键盘快捷键
  // 输入框快捷键：
  // - Cmd/Ctrl+Enter：发送（处理）
  // - Enter：换行（除非你想把 Enter 当发送，可自行调整）
  if (elements.inputText) elements.inputText.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      if (e.metaKey || e.ctrlKey) {
        e.preventDefault();
        processInput();
      }
    }
  });

  // 输入时控制“发送按钮”启用态（侧边栏）
  if (elements.inputText && elements.processBtn && elements.processBtn.classList?.contains('send-btn')) {
    elements.inputText.addEventListener('input', updateSendEnabled);
    updateSendEnabled();
  }

  // 清空展示区（不清空输入）
  if (elements.clearGalleryBtn) {
    elements.clearGalleryBtn.addEventListener('click', () => {
      state.currentImages = [];
      state.selectedImages.clear();
      state.jsonLastParsed = null;
      state.textLastCleaned = '';
      state.imageLastCleanedUrls = [];
      state.webDocument = null;
      state.webSource = null;
      setSetting('lastWebDocument', null);
      if (state.mode === 'web') renderWebWorkspace();
      else renderEmptyState();
    });
  }

  // 侧边栏：输入框自动增长（不出现滚动条），最大到浏览器高度的一半
  if (elements.composerBox && elements.inputText) {
    const autoGrow = () => {
      const maxH = Math.floor(window.innerHeight * 0.5);
      const minH = clamp(Number(state.composerBaseHeight) || 92, 92, maxH);
      const extra = 36; // 预留（内边距/按钮区）
      const fullNeed = elements.inputText.scrollHeight + extra;
      const need = clamp(fullNeed, minH, maxH);
      const cur = elements.composerBox.getBoundingClientRect().height;
      if (Math.abs(need - cur) > 1) applyComposerHeight(need);
      else syncComposerOffset();
      elements.inputText.style.overflowY = fullNeed > maxH ? 'auto' : 'hidden';
    };
    setTimeout(autoGrow, 0);
    window.addEventListener('resize', () => {
      autoGrow();
      if (state.currentImages?.length) updateGalleryItemHeight(state.currentImages.length);
    });
  }

  // 侧边栏：右上角单箭头，一键展开到最大/收起到最小
  if (elements.composerToggleBtn && elements.composerBox) {
    const toggle = async () => {
      const maxH = Math.floor(window.innerHeight * 0.5);
      const minH = clamp(Number(state.composerBaseHeight) || 92, 92, maxH);
      const h = elements.composerBox.getBoundingClientRect().height;
      const nearMax = h >= maxH - 2;
      const next = nearMax ? minH : maxH;
      applyComposerHeight(next);
      await setSetting('composerHeight', next);
      updateComposerEdgeIcon();
      updateComposerToggleIcon();
    };
    elements.composerToggleBtn.addEventListener('click', toggle);
    window.addEventListener('resize', updateComposerToggleIcon);
    updateComposerToggleIcon();
  }

  // 侧边栏：输入框上边沿拖拽拉伸（最大 1/2 屏）
  if (elements.composerEdge && elements.composerBox) {
    let dragging = false;
    let startY = 0;
    let startH = 0;
    const onMove = (e) => {
      if (!dragging) return;
      const dy = e.clientY - startY;
      const maxH = Math.floor(window.innerHeight * 0.5);
      const minH = 92;
      // 拖动上边沿：往上拖 => 变高；往下拖 => 变矮
      const next = clamp(startH - dy, minH, maxH);
      applyComposerHeight(next);
      updateComposerEdgeIcon();
    };
    const onUp = async () => {
      if (!dragging) return;
      dragging = false;
      elements.composerBox.classList.remove('dragging');
      window.removeEventListener('mousemove', onMove, true);
      window.removeEventListener('mouseup', onUp, true);
      const h = Math.floor(elements.composerBox.getBoundingClientRect().height);
      await setSetting('composerHeight', h);
      state.composerBaseHeight = h; // 用户手动调整后，新的“原始状态”
      updateComposerEdgeIcon();
      updateComposerToggleIcon();
      syncComposerOffset();
    };
    elements.composerEdge.addEventListener('mousedown', (e) => {
      e.preventDefault();
      dragging = true;
      elements.composerBox.classList.add('dragging');
      startY = e.clientY;
      startH = elements.composerBox.getBoundingClientRect().height;
      window.addEventListener('mousemove', onMove, true);
      window.addEventListener('mouseup', onUp, true);
    });
    elements.composerEdge.addEventListener('mouseenter', updateComposerEdgeIcon);
    window.addEventListener('resize', updateComposerEdgeIcon);
    updateComposerEdgeIcon();
  }

  // 文本模式：实时清洗（只做预览，不写历史）
  let textDebounceTimer = null;
  if (elements.inputText) elements.inputText.addEventListener('input', () => {
    if (state.mode !== 'text') return;
    const input = elements.inputText.value;
    if (!input.trim()) {
      renderEmptyState();
      return;
    }
    clearTimeout(textDebounceTimer);
    textDebounceTimer = setTimeout(() => {
      processText(input, { fromRealtime: true });
    }, 180);
  });

  // JSON 模式：不做实时解析（大 JSON 可能非常大），只保留输入
  if (elements.inputText) elements.inputText.addEventListener('input', () => {
    if (state.mode !== 'json') return;
    state.jsonLastInput = elements.inputText.value ?? '';
  });

  // 其他快捷键
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      elements.contextMenu.classList.remove('show');
      hideImagePreview();
      closeHistory();
    } else if (elements.imagePreviewBackdrop?.classList?.contains('show') && e.key === 'ArrowRight') {
      e.preventDefault();
      previewNextImage();
    } else if (elements.imagePreviewBackdrop?.classList?.contains('show') && e.key === 'ArrowLeft') {
      e.preventDefault();
      previewPrevImage();
    }
  });

  // 图片预览关闭事件
  if (elements.imagePreviewBackdrop) {
    elements.imagePreviewBackdrop.addEventListener('click', hideImagePreview);
  }
  if (elements.imagePreviewDialog) {
    elements.imagePreviewDialog.addEventListener('click', (e) => e.stopPropagation());
  }
  if (elements.imagePreviewResetBtn) {
    elements.imagePreviewResetBtn.addEventListener('click', resetImagePreviewTransform);
  }
  if (elements.imagePreviewPrevBtn) {
    elements.imagePreviewPrevBtn.addEventListener('click', previewPrevImage);
  }
  if (elements.imagePreviewNextBtn) {
    elements.imagePreviewNextBtn.addEventListener('click', previewNextImage);
  }
  if (elements.imagePreviewLeftHotspot) {
    elements.imagePreviewLeftHotspot.addEventListener('click', (e) => {
      e.stopPropagation();
      previewPrevImage();
    });
  }
  if (elements.imagePreviewRightHotspot) {
    elements.imagePreviewRightHotspot.addEventListener('click', (e) => {
      e.stopPropagation();
      previewNextImage();
    });
  }
  if (elements.imagePreviewCloseBtn) {
    elements.imagePreviewCloseBtn.addEventListener('click', hideImagePreview);
  }

  // 图片预览：滚轮缩放 + 拖拽平移
  bindImagePreviewInteractions();
}

// ========= 调试 =========
function toggleDebug() {
  state.debugMode = !state.debugMode;
  if (state.debugMode) {
    elements.debugInfo.classList.add('show');
  } else {
    elements.debugInfo.classList.remove('show');
  }
}

function logDebug(message, data = null) {
  if (!state.debugMode) return;
  const time = new Date().toLocaleTimeString();
  const debugItem = document.createElement('div');
  debugItem.className = 'debug-info-item';
  debugItem.textContent = `[${time}] ${message}`;
  if (data) debugItem.textContent += ': ' + JSON.stringify(data).substring(0, 140);
  elements.debugContent.insertBefore(debugItem, elements.debugContent.firstChild);
  while (elements.debugContent.children.length > 20) {
    elements.debugContent.removeChild(elements.debugContent.lastChild);
  }
}

// ========= UI =========
function updatePlaceholder() {
  document.body.classList.toggle('web-mode', state.mode === 'web');
  elements.webCaptureEntryBtn?.classList.toggle('active', state.mode === 'web');
  if (elements.gridColsSelect) elements.gridColsSelect.style.display = state.mode === 'web' ? 'none' : '';
  if (elements.grabPageBtn) {
    elements.grabPageBtn.title = state.mode === 'web' ? '抓取当前页文本' : '抓取当前页图片';
    elements.grabPageBtn.setAttribute('aria-label', elements.grabPageBtn.title);
  }
  if (state.mode === 'image') {
    elements.inputText.placeholder = `粘贴图片链接，支持多种格式：

• 每行一个链接
• 数组格式：["url1", "url2"]
• 带引号或符号的链接
• 支持复杂URL参数

系统将自动清洗并验证所有链接`;
    elements.inputHint.textContent = '支持自动识别数组、去除符号、智能验证图片链接';
    // 侧边栏（Apple UI）不重写 stats 区结构，只更新数字
    if (elements.statsDisplay && !elements.statsDisplay.classList.contains('pill')) {
      elements.statsDisplay.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
          <circle cx="8.5" cy="8.5" r="1.5"></circle>
          <polyline points="21 15 16 10 5 21"></polyline>
        </svg>
        <span id="imageCount">0</span> 张图片
      `;
      // 重新绑定 imageCount 引用（因为 statsDisplay 被重写）
      elements.imageCount = document.getElementById('imageCount');
    }
    if (elements.imageOptions) elements.imageOptions.style.display = 'flex';
  } else {
    if (elements.imageOptions) elements.imageOptions.style.display = 'none';
    if (state.mode === 'text') {
      elements.inputText.placeholder = `粘贴需要清洗的文本内容：

• 自动去除 Markdown 符号
• 压缩多余空行
• 统一格式化

适用于 Prompt 清洗、文本整理等场景`;
      elements.inputHint.textContent = '自动去除特殊符号、格式化文本结构';
    } else if (state.mode === 'json') {
      elements.inputText.placeholder = `粘贴 JSON 内容（支持转义/双重编码）：

• 自动判断是否为合格 JSON
• 不合格会定位行列与错误片段
• 支持层级折叠查看

提示：若你复制的是带引号的 JSON 字符串（例如 "{\\"a\\":1}"），也能识别`;
      elements.inputHint.textContent = '支持 JSON/JSON字符串（双重转义）/错误定位/树形查看';
    } else if (state.mode === 'web') {
      elements.inputText.placeholder = '网页文本由当前标签页直接抓取';
      elements.inputHint.textContent = '抓取整页正文，或在原网页上多选内容区域';
    }
  }
}

function renderEmptyState() {
  elements.galleryContent.innerHTML = `
    <div class="empty-state">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
        <circle cx="8.5" cy="8.5" r="1.5"></circle>
        <polyline points="21 15 16 10 5 21"></polyline>
      </svg>
      <div class="empty-state-title">暂无内容</div>
      <div class="empty-state-desc">在右侧输入内容并处理后，结果将在此展示</div>
    </div>
  `;
  if (elements.imageCount) elements.imageCount.textContent = '0';
  if (elements.selectAllBtn) elements.selectAllBtn.style.display = 'none';
  if (elements.downloadSelectedBtn) elements.downloadSelectedBtn.style.display = 'none';
  if (elements.downloadAllBtn) elements.downloadAllBtn.style.display = 'none';
  if (elements.zipSelectedBtn) elements.zipSelectedBtn.style.display = 'none';
  if (elements.zipAllBtn) elements.zipAllBtn.style.display = 'none';
}

// ========= 处理输入 =========
async function processInput() {
  const input = elements.inputText.value.trim();
  if (!input) {
    showToast('请输入内容', 'error');
    return;
  }

  if (elements.processBtn) {
    elements.processBtn.disabled = true;
    // 侧边栏发送按钮：不替换结构，避免样式跳动
    if (!elements.processBtn.classList?.contains('send-btn')) {
      elements.processBtn.innerHTML = '<div class="loading-spinner"></div> 处理中...';
    } else {
      elements.processBtn.classList.add('loading');
    }
  }

  try {
    // 侧边栏：支持“自动识别 + 下拉手动指定”
    state.mode = getSelectedProcessingMode(input);
    syncModeControls(state.mode);

    if (state.mode === 'image') {
      await processImages(input);
    } else if (state.mode === 'text') {
      processText(input, { fromRealtime: false });
    } else if (state.mode === 'json') {
      processJson(input);
    }
    await saveToHistory(input, state.mode);
  } catch (error) {
    showToast('处理失败，请检查输入内容', 'error');
    console.error(error);
    logDebug('处理失败', error.message);
  } finally {
    if (elements.processBtn) {
      if (!elements.processBtn.classList?.contains('send-btn')) {
        elements.processBtn.disabled = false;
        elements.processBtn.innerHTML = `
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="23 4 23 10 17 10"></polyline>
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
          </svg>
          开始处理
        `;
      } else {
        elements.processBtn.classList.remove('loading');
        // 发送按钮：根据输入内容决定是否启用
        const has = !!(elements.inputText?.value || '').trim();
        elements.processBtn.disabled = !has;
      }
    }
  }
}

function decideModeForInput(input) {
  const sel = elements.modeSelect?.value || 'auto';
  if (sel && sel !== 'auto') return sel;

  // 自动识别：优先图片链接（有 URL 且像图片/多链接）→ JSON → 文本
  const urls = extractImageUrls(input);
  if (urls.length > 0) {
    const looksImg = urls.some((item) => /\.(png|jpe?g|gif|webp|bmp)(\?|$)/i.test(item.url));
    if (urls.length >= 2 || looksImg) return 'image';
  }

  const res = tryParseJsonWithAdaptation(input);
  if (res.ok) return 'json';
  return 'text';
}

// ========= JSON 模式 =========
function processJson(inputRaw) {
  state.jsonLastInput = inputRaw;

  const res = tryParseJsonWithAdaptation(inputRaw);
  if (!res.ok) {
    state.jsonLastNormalized = res.normalized || '';
    state.jsonLastParsed = null;
    renderJsonDisplay(res);
    showToast('JSON 不合格', 'error');
    return;
  }

  state.jsonLastNormalized = res.normalized;
  state.jsonLastParsed = normalizeNestedJsonStrings(res.parsed);
  renderJsonDisplay(res);
  showToast('JSON 合格', 'success');
}

function getJsonOutput(pretty) {
  const parsed = state.jsonLastParsed;
  if (parsed === null) return state.jsonLastNormalized.trim() === 'null' ? 'null' : '';
  if (parsed == null) return '';
  return pretty ? JSON.stringify(parsed, null, 2) : JSON.stringify(parsed);
}

function normalizeNestedJsonStrings(value) {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    const looksStructured = (trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'));
    if (!looksStructured) return value;
    const parsed = parseJsonOrError(trimmed);
    if (!parsed.ok) return value;
    return normalizeNestedJsonStrings(parsed.value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeNestedJsonStrings(item));
  }

  if (value && typeof value === 'object') {
    const out = {};
    Object.keys(value).forEach((key) => {
      out[key] = normalizeNestedJsonStrings(value[key]);
    });
    return out;
  }

  return value;
}

function tryParseJsonWithAdaptation(inputRaw) {
  // 说明：尽量覆盖“复制出来是 JSON 字符串/双重转义”的情况
  // 流程：
  // 1) 直接 JSON.parse
  // 2) 若解析结果本身是字符串，再尝试把字符串内容作为 JSON 解析
  // 3) 若失败：给出错误定位（行/列/片段高亮）
  const raw = String(inputRaw ?? '').trim();
  if (!raw) return { ok: false, normalized: '', errorMessage: '空内容' };

  // 直接尝试
  const direct = parseJsonOrError(raw);
  if (direct.ok) {
    if (typeof direct.value === 'string') {
      const innerText = direct.value.trim();
      const inner = parseJsonOrError(innerText);
      if (inner.ok) {
        const parsed = normalizeNestedJsonStrings(inner.value);
        return { ok: true, normalized: JSON.stringify(parsed), parsed, variant: 'double-encoded' };
      }
    }
    const parsed = normalizeNestedJsonStrings(direct.value);
    return { ok: true, normalized: JSON.stringify(parsed), parsed, variant: 'direct' };
  }

  // 双重编码：输入本身是一个 JSON 字符串，内容才是真 JSON
  const looksQuoted = (raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"));
  if (looksQuoted) {
    const outer = parseJsonOrError(raw.startsWith("'") ? `"${raw.slice(1, -1).replace(/"/g, '\\"')}"` : raw);
    if (outer.ok && typeof outer.value === 'string') {
      const innerText = outer.value;
      const inner = parseJsonOrError(innerText);
      if (inner.ok) {
        const parsed = normalizeNestedJsonStrings(inner.value);
        return { ok: true, normalized: JSON.stringify(parsed), parsed, variant: 'double-encoded' };
      }
      return buildJsonErrorResult(innerText, inner.error, '已识别为 JSON 字符串，但内部 JSON 不合格');
    }
  }

  // 其它情况：直接报 direct 的错误
  return buildJsonErrorResult(raw, direct.error, 'JSON 不合格');
}

function parseJsonOrError(text) {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (e) {
    return { ok: false, error: e };
  }
}

function buildJsonErrorResult(text, error, prefixMsg) {
  const msg = (error && error.message) ? String(error.message) : '解析失败';
  const pos = extractJsonErrorPos(msg);
  const loc = pos != null ? calcLineCol(text, pos) : null;
  const snippet = pos != null ? buildSnippet(text, pos, 120) : null;
  return {
    ok: false,
    normalized: text,
    errorMessage: `${prefixMsg}：${msg}` + (loc ? `\n位置：第 ${loc.line} 行，第 ${loc.col} 列（offset ${pos}）` : ''),
    errorPos: pos,
    errorLoc: loc,
    snippet
  };
}

function extractJsonErrorPos(message) {
  // Chrome/Edge：Unexpected token ... in JSON at position 123
  // 也可能是：... at position 0
  const m = /position\s+(\d+)/i.exec(message);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

function calcLineCol(text, pos) {
  // pos：0-based offset
  let line = 1;
  let col = 1;
  const max = Math.min(pos, text.length);
  for (let i = 0; i < max; i++) {
    if (text.charCodeAt(i) === 10) { // '\n'
      line++;
      col = 1;
    } else {
      col++;
    }
  }
  return { line, col };
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildSnippet(text, pos, radius = 80) {
  const start = Math.max(0, pos - radius);
  const end = Math.min(text.length, pos + radius);
  const before = text.slice(start, pos);
  const ch = text.slice(pos, pos + 1) || '';
  const after = text.slice(pos + 1, end);
  return {
    start,
    end,
    html: `${escapeHtml(before)}<span class="hl">${escapeHtml(ch || ' ')}</span>${escapeHtml(after)}`
  };
}

function renderJsonDisplay(res) {
  const ok = !!res.ok;

  // 隐藏图片相关按钮
  if (elements.selectAllBtn) elements.selectAllBtn.style.display = 'none';
  if (elements.downloadSelectedBtn) elements.downloadSelectedBtn.style.display = 'none';
  if (elements.downloadAllBtn) elements.downloadAllBtn.style.display = 'none';
  if (elements.zipSelectedBtn) elements.zipSelectedBtn.style.display = 'none';
  if (elements.zipAllBtn) elements.zipAllBtn.style.display = 'none';

  if (!ok) {
    elements.galleryContent.innerHTML = `
      <div class="card">
        <div style="font-weight:900;margin-bottom:8px;">JSON 不合格</div>
        <div class="json-error">${escapeHtml(res.errorMessage || 'JSON 不合格')}</div>
        ${res.snippet ? `<div class="json-snippet">${res.snippet.html}</div>` : ''}
      </div>
    `;
    if (elements.statsDisplay?.classList?.contains('pill')) {
      elements.statsDisplay.textContent = 'JSON 解析失败';
    }
    return;
  }

  const isCompress = state.jsonView === 'compress';
  const typeText = `类型：${getJsonType(res.parsed)}${buildJsonMeta(res.parsed)}`;

  elements.galleryContent.innerHTML = `
    <div class="card" style="height:100%;display:flex;flex-direction:column;min-height:0;position:relative;">
      <div class="card-toolbar" style="justify-content:space-between;">
        <div class="segmented" aria-label="JSON 视图">
          <button id="jsonViewFormat" type="button" class="${!isCompress ? 'active' : ''}">格式化</button>
          <button id="jsonViewCompress" type="button" class="${isCompress ? 'active' : ''}">压缩</button>
        </div>
        <div style="display:flex;gap:8px;align-items:center;position:relative;">
          <div style="position:relative;">
            <button class="icon-mini" id="jsonExportBtn" type="button" title="导出">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 3v12"></path>
                <path d="M8 11l4 4 4-4"></path>
                <path d="M21 21H3"></path>
              </svg>
            </button>
            <div class="popover" id="jsonExportMenu" hidden>
              <button class="popover-item" id="jsonExportPretty" type="button">导出（格式化）.json</button>
              <button class="popover-item" id="jsonExportMin" type="button">导出（压缩）.json</button>
            </div>
          </div>
          <button class="icon-mini" id="jsonCopyBtn" type="button" title="复制">
            <svg id="jsonCopyIcon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="9" y="9" width="13" height="13" rx="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
          </button>
        </div>
      </div>

      <div class="json-path" style="margin:0 0 10px;color:var(--text-tertiary);">${escapeHtml(typeText)}</div>

      ${
        isCompress
          ? `<pre class="text-prose" id="jsonMinView" style="flex:1;min-height:0;overflow:auto;background:var(--bg-tertiary);border-radius:12px;padding:12px;"></pre>`
          : `<div class="json-searchbar">
              <input class="json-search-input" id="jsonSearchInput" placeholder="搜索 key / value（最多返回50条路径）" />
              <button class="popover-item" id="jsonSearchBtn" type="button" style="width:auto;padding:8px 12px;border:1px solid rgba(0,0,0,.10);border-radius:999px;">搜索</button>
            </div>
            <div class="json-search-results" id="jsonSearchResults"></div>
            <div class="json-tree" id="jsonTree" style="flex:1;min-height:0;"></div>`
      }
    </div>
  `;

  // stats：侧边栏用 pill，不重写结构
  if (elements.statsDisplay?.classList?.contains('pill')) {
    elements.statsDisplay.textContent = `JSON ${formatLen(res.normalized?.length || 0)}`;
  }

  // 绑定 segmented
  const btnFmt = document.getElementById('jsonViewFormat');
  const btnMin = document.getElementById('jsonViewCompress');
  if (btnFmt) btnFmt.addEventListener('click', () => { state.jsonView = 'format'; renderJsonDisplay(res); });
  if (btnMin) btnMin.addEventListener('click', () => { state.jsonView = 'compress'; renderJsonDisplay(res); });

  // 绑定导出菜单
  const exportBtn = document.getElementById('jsonExportBtn');
  const exportMenu = document.getElementById('jsonExportMenu');
  const exportPretty = document.getElementById('jsonExportPretty');
  const exportMin = document.getElementById('jsonExportMin');
  const closeMenu = () => { if (exportMenu) exportMenu.hidden = true; };
  if (exportBtn) exportBtn.addEventListener('click', (e) => { e.stopPropagation(); if (exportMenu) exportMenu.hidden = !exportMenu.hidden; });
  document.addEventListener('click', closeMenu, { once: true });

  const downloadAs = (filename, content) => {
    const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (exportPretty) exportPretty.addEventListener('click', () => { downloadAs(`data_${Date.now()}.json`, getJsonOutput(true)); closeMenu(); });
  if (exportMin) exportMin.addEventListener('click', () => { downloadAs(`data_${Date.now()}.json`, getJsonOutput(false)); closeMenu(); });

  // 复制
  const copyBtn = document.getElementById('jsonCopyBtn');
  if (copyBtn) {
    copyBtn.addEventListener('click', async () => {
      try {
        const content = getJsonOutput(!isCompress);
        await navigator.clipboard.writeText(content);
        const icon = document.getElementById('jsonCopyIcon');
        if (icon) {
          icon.innerHTML = '<path d="M20 6L9 17l-5-5"></path>';
          setTimeout(() => {
            icon.innerHTML = '<rect x="9" y="9" width="13" height="13" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>';
          }, 1500);
        }
      } catch (e) {
        showToast('复制失败', 'error');
      }
    });
  }

  // 渲染内容
  if (isCompress) {
    const pre = document.getElementById('jsonMinView');
    if (pre) pre.textContent = JSON.stringify(res.parsed);
    return;
  }

  // 搜索
  const searchBtn = document.getElementById('jsonSearchBtn');
  const searchInput = document.getElementById('jsonSearchInput');
  const doSearch = () => {
    const kw = (searchInput?.value || '').trim();
    if (!kw) {
      renderJsonSearchResults([]);
      return;
    }
    const results = searchJsonPaths(res.parsed, kw, 50);
    renderJsonSearchResults(results);
  };
  if (searchBtn) searchBtn.addEventListener('click', doSearch);
  if (searchInput) searchInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSearch(); });

  const treeRoot = document.getElementById('jsonTree');
  if (treeRoot) {
    treeRoot.innerHTML = '';
    treeRoot.appendChild(renderJsonNodeLazy(res.parsed, '$', 0));
  }
}

function approxSizeText(s) {
  const n = (s || '').length;
  if (n < 1024) return `${n} 字符`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function formatLen(n) {
  const x = Number(n) || 0;
  if (x < 1024) return `${x} 字符`;
  if (x < 1024 * 1024) return `${(x / 1024).toFixed(1)} KB`;
  return `${(x / (1024 * 1024)).toFixed(2)} MB`;
}

function buildJsonMeta(val) {
  if (Array.isArray(val)) return `，长度 ${val.length}`;
  if (val && typeof val === 'object') return `，键数 ${Object.keys(val).length}`;
  return '';
}

function getJsonType(val) {
  if (val === null) return 'null';
  if (Array.isArray(val)) return 'array';
  return typeof val;
}

function searchJsonPaths(root, keyword, limit = 50) {
  const kw = String(keyword).toLowerCase();
  const out = [];
  const stack = [{ value: root, path: '$' }];

  while (stack.length && out.length < limit) {
    const { value, path } = stack.pop();

    if (value === null) continue;
    const t = typeof value;

    if (t === 'string') {
      if (value.toLowerCase().includes(kw)) out.push({ path, preview: value.slice(0, 120) });
      continue;
    }
    if (t === 'number' || t === 'boolean') {
      const s = String(value);
      if (s.toLowerCase().includes(kw)) out.push({ path, preview: s });
      continue;
    }

    if (Array.isArray(value)) {
      for (let i = value.length - 1; i >= 0; i--) {
        stack.push({ value: value[i], path: `${path}[${i}]` });
      }
      continue;
    }

    if (t === 'object') {
      const keys = Object.keys(value);
      for (let i = keys.length - 1; i >= 0; i--) {
        const k = keys[i];
        const childPath = `${path}.${k}`;
        if (k.toLowerCase().includes(kw) && out.length < limit) {
          out.push({ path: childPath, preview: '(key match)' });
        }
        stack.push({ value: value[k], path: childPath });
      }
    }
  }
  return out;
}

function renderJsonSearchResults(results) {
  const box = document.getElementById('jsonSearchResults');
  if (!box) return;
  if (!results || results.length === 0) {
    box.innerHTML = '';
    return;
  }
  const list = document.createElement('div');
  list.style.display = 'flex';
  list.style.flexDirection = 'column';
  list.style.gap = '6px';

  results.forEach((r) => {
    const item = document.createElement('div');
    item.className = 'json-search-item';
    item.title = '点击复制路径';
    item.innerHTML = `<span class="json-search-path">${escapeHtml(r.path)}</span><span class="json-search-preview">${escapeHtml(r.preview || '')}</span>`;
    item.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(r.path);
        showToast('路径已复制', 'success');
      } catch (e) {
        showToast('复制失败', 'error');
      }
    });
    list.appendChild(item);
  });
  box.innerHTML = '';
  box.appendChild(list);
}

function showJsonFormatted(obj) {
  // 用 textarea 展示格式化结果，便于复制与编辑
  const pretty = JSON.stringify(obj, null, 2);
  elements.galleryContent.innerHTML = `
    <div class="text-display">
      <div class="text-display-header">
        <h3 class="text-display-title">格式化后的 JSON</h3>
        <div class="text-display-toolbar">
          <button class="btn-secondary" id="jsonBackToTreeBtn" type="button">返回树形</button>
          <button class="btn-primary" id="copyCleanedBtn" type="button">复制内容</button>
        </div>
      </div>
      <textarea class="text-display-content" id="cleanedTextContent" spellcheck="false"></textarea>
    </div>
  `;
  const ta = document.getElementById('cleanedTextContent');
  if (ta) ta.value = pretty;
  const backBtn = document.getElementById('jsonBackToTreeBtn');
  if (backBtn) backBtn.addEventListener('click', () => {
    renderJsonDisplay({ ok: true, normalized: state.jsonLastNormalized, parsed: state.jsonLastParsed, variant: 'direct' });
  });
  const copyBtn = document.getElementById('copyCleanedBtn');
  if (copyBtn) copyBtn.addEventListener('click', copyCleanedText);
}

async function copyJsonFormatted(obj) {
  try {
    const pretty = JSON.stringify(obj, null, 2);
    await navigator.clipboard.writeText(pretty);
    showToast('已复制格式化 JSON', 'success');
  } catch (e) {
    showToast('复制失败', 'error');
  }
}

function renderJsonNodeLazy(val, path, depth, displayKey) {
  const type = getJsonType(val);
  const wrapper = document.createElement('div');

  // 基本类型：key: value 一行
  if (val === null || type === 'string' || type === 'number' || type === 'boolean') {
    const keyPart = displayKey != null
      ? `<span class="json-k">${escapeHtml(String(displayKey))}</span><span class="json-colon">: </span>`
      : '';
    wrapper.innerHTML = keyPart + formatPrimitive(val);
    return wrapper;
  }

  // array/object：折叠 + 懒加载
  const isArray = Array.isArray(val);
  const count = isArray ? val.length : Object.keys(val).length;
  const openCh = isArray ? '[' : '{';
  const closeCh = isArray ? ']' : '}';
  const countText = isArray ? `${count} items` : `${count} keys`;

  const details = document.createElement('details');
  details.open = depth < 1;

  const summary = document.createElement('summary');
  summary.className = 'json-summary';
  const keyPart = displayKey != null
    ? `<span class="json-k">${escapeHtml(String(displayKey))}</span><span class="json-colon">: </span>`
    : '';
  summary.innerHTML = keyPart
    + `<span class="json-bracket">${openCh} ${closeCh}</span> `
    + `<span class="json-count">${countText}</span>`;
  details.appendChild(summary);

  const children = document.createElement('div');
  children.className = 'json-node';
  children.dataset.rendered = '0';
  details.appendChild(children);

  const renderChildren = () => {
    if (children.dataset.rendered === '1') return;
    children.dataset.rendered = '1';

    if (isArray) {
      for (let i = 0; i < val.length; i++) {
        children.appendChild(renderJsonNodeLazy(val[i], `${path}[${i}]`, depth + 1, null));
      }
    } else {
      for (const k of Object.keys(val)) {
        children.appendChild(renderJsonNodeLazy(val[k], `${path}.${k}`, depth + 1, k));
      }
    }
  };

  if (details.open) renderChildren();
  details.addEventListener('toggle', () => { if (details.open) renderChildren(); });

  wrapper.appendChild(details);
  return wrapper;
}

function formatPrimitive(v) {
  if (v === null) return `<span class="json-v-null">null</span>`;
  if (typeof v === 'string') return `<span class="json-v-string">"${escapeHtml(v)}"</span>`;
  if (typeof v === 'number') return `<span class="json-v-number">${String(v)}</span>`;
  if (typeof v === 'boolean') return `<span class="json-v-boolean">${String(v)}</span>`;
  return escapeHtml(String(v));
}

// ========= 图片模式 =========
function extractImageUrls(input) {
  logDebug('开始提取链接', { inputLength: input.length });
  let items = []; // {url: string, fieldName?: string}[]

  // 尝试解析 JSON
  try {
    const parsed = JSON.parse(input);
    if (Array.isArray(parsed)) {
      items = parsed.filter((item) => typeof item === 'string').map((url) => ({ url }));
      logDebug('JSON数组解析成功', { count: items.length });
    } else if (typeof parsed === 'object' && parsed !== null) {
      // JSON 对象：遍历每个 key，提取字段名 + URL 数组
      for (const key of Object.keys(parsed)) {
        const val = parsed[key];
        if (Array.isArray(val)) {
          const fieldUrls = val.filter((item) => typeof item === 'string');
          fieldUrls.forEach((url) => items.push({ url, fieldName: key }));
        } else if (typeof val === 'string') {
          items.push({ url: val, fieldName: key });
        }
      }
      logDebug('JSON对象解析成功', { count: items.length, keys: Object.keys(parsed).join(',') });
    } else if (typeof parsed === 'string') {
      items = [{ url: parsed }];
      logDebug('JSON字符串解析成功', { count: 1 });
    }
  } catch (e) {
    // 兜底1：尝试截取 [ ... ] 再解析（丢失字段名）
    try {
      const firstBracket = input.indexOf('[');
      const lastBracket = input.lastIndexOf(']');
      if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
        const jsonSlice = input.slice(firstBracket, lastBracket + 1);
        const parsedSlice = JSON.parse(jsonSlice);
        if (Array.isArray(parsedSlice)) {
          items = parsedSlice.filter((item) => typeof item === 'string').map((url) => ({ url }));
          logDebug('JSON片段解析成功', { count: items.length });
        }
      }
    } catch (e2) {
      // ignore
    }

    // 兜底1b：补外层 {} 尝试解析（保留字段名）
    if (items.length === 0) {
      try {
        const wrapped = JSON.parse('{' + input + '}');
        if (typeof wrapped === 'object' && wrapped !== null) {
          for (const key of Object.keys(wrapped)) {
            const val = wrapped[key];
            if (Array.isArray(val)) {
              val.filter((v) => typeof v === 'string').forEach((url) => items.push({ url, fieldName: key }));
            } else if (typeof val === 'string') {
              items.push({ url: val, fieldName: key });
            }
          }
          if (items.length > 0) logDebug('补花括号JSON解析成功', { count: items.length, keys: Object.keys(wrapped).join(',') });
        }
      } catch (e3) {
        // ignore
      }
    }

    // 兜底2：从任意文本中提取 http(s) URL
    if (items.length === 0) {
      const quoted = input.match(/["'""'''](https?:\/\/[^"'""'''\s<>]+)["'""''']/g) || [];
      const quotedUrls = quoted
        .map((s) => s.replace(/^[\s"'""''']+|[\s"'""''']+$/g, ''))
        .filter((s) => s.startsWith('http://') || s.startsWith('https://'));

      const matches = input.match(/https?:\/\/[^\s<>"'""''']+/g) || [];
      items = [...quotedUrls, ...matches].map((url) => ({ url: url.trim() })).filter((item) => item.url);
    }

    // 兜底3：按行/逗号分割
    if (items.length === 0) {
      items = input
        .split(/[\n,]/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .map((url) => ({ url }));
    }

    logDebug('文本提取链接', { count: items.length });
  }

  // 清洗 URL：去除两端常见包裹符号/标点
  items = items
    .map((item, index) => {
      let url = item.url;
      const original = url;
      url = String(url).trim();
      url = url.replace(/^[\s"'“”‘’「『【（(《<]+/g, '').replace(/[\s"'“”‘’」』】）)》>]+$/g, '');
      url = url.replace(/^[、，。；：！？,.;:!?]+/g, '').replace(/[、，。；：！？,.;:!?]+$/g, '');
      logDebug(`清洗链接 ${index}`, { original: original.substring(0, 60), cleaned: url.substring(0, 60), fieldName: item.fieldName || '' });
      return { url, fieldName: item.fieldName };
    })
    .filter((item) => item.url.startsWith('http://') || item.url.startsWith('https://'));

  // 去重（保留字段名）
  const seen = new Set();
  const uniqueItems = items.filter((item) => {
    if (seen.has(item.url)) return false;
    seen.add(item.url);
    return true;
  });
  logDebug('去重后', { original: items.length, unique: uniqueItems.length });
  return uniqueItems;
}

function validateImageUrlByImg(url, index, timeoutMs = 10000) {
  return new Promise((resolve) => {
    const img = new Image();
    const timeout = setTimeout(() => resolve({ ok: false, reason: 'timeout' }), timeoutMs);
    img.onload = () => {
      clearTimeout(timeout);
      resolve({ ok: true, width: img.width, height: img.height, reason: 'img' });
    };
    img.onerror = () => {
      clearTimeout(timeout);
      resolve({ ok: false, reason: 'load_error' });
    };
    img.src = url;
  });
}

async function fetchWithTimeout(url, timeoutMs = 12000) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { credentials: 'omit', signal: controller.signal });
    return res;
  } finally {
    clearTimeout(t);
  }
}

async function validateImageUrlDetailed(url, index) {
  logDebug(`开始验证图片 ${index}`, { url: url.substring(0, 80) });

  // 优先 fetch：能拿到 http 状态/类型（扩展有 host_permissions 时成功率更高）
  try {
    const res = await fetchWithTimeout(url, 12000);
    if (!res.ok) {
      return { ok: false, reason: `http_${res.status}`, status: res.status };
    }
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    if (ct && !ct.startsWith('image/')) {
      return { ok: false, reason: 'not_image', contentType: ct };
    }
    const blob = await res.blob();
    if (!blob.type || !blob.type.startsWith('image/')) {
      // 某些站点 content-type 不可靠，这里再兜底
      return { ok: false, reason: 'not_image', contentType: blob.type || ct || 'unknown' };
    }

    // 用 blob URL 获取尺寸
    const blobUrl = URL.createObjectURL(blob);
    const dim = await validateImageUrlByImg(blobUrl, index, 12000);
    URL.revokeObjectURL(blobUrl);
    if (!dim.ok) return { ok: false, reason: dim.reason };
    return { ok: true, reason: 'ok', width: dim.width, height: dim.height, contentType: blob.type, size: blob.size };
  } catch (e) {
    // fetch 不通时，回退到 <img> 加载（无法得知 http 状态）
    const dim = await validateImageUrlByImg(url, index, 10000);
    if (dim.ok) return { ok: true, reason: 'img_only', width: dim.width, height: dim.height };
    const reason = e?.name === 'AbortError' ? 'timeout' : 'fetch_error';
    return { ok: false, reason };
  }
}

async function mapLimit(items, limit, mapper) {
  const results = new Array(items.length);
  let i = 0;
  const workers = new Array(Math.min(limit, items.length)).fill(0).map(async () => {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await mapper(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return results;
}

async function processImages(input) {
  state.imageLastInput = input;
  const urlItems = extractImageUrls(input);
  state.imageLastCleanedUrls = urlItems.map((item) => item.url);

  if (urlItems.length === 0) {
    state.imageLastCleanedUrls = [];
    showToast('未检测到有效的链接', 'error');
    logDebug('未检测到有效链接');
    return;
  }

  showSkeletons(urlItems.length);

  const results = await mapLimit(urlItems, 4, async (item, i) => {
    const r = await validateImageUrlDetailed(item.url, i);
    return { url: item.url, fieldName: item.fieldName, index: i, ...r };
  });

  const validatedImages = [];
  const reasonCount = {};
  const smallFiltered = [];

  for (const r of results) {
    if (r.ok) {
      // 过滤小图（默认开）
      if (state.filterSmall && r.width != null && r.height != null && (r.width < 32 || r.height < 32)) {
        smallFiltered.push(r);
        reasonCount.too_small = (reasonCount.too_small || 0) + 1;
        continue;
      }
      validatedImages.push({
        url: r.url,
        fieldName: r.fieldName,
        index: r.index,
        originalIndex: r.index,
        id: `img_${Date.now()}_${r.index}`,
        width: r.width,
        height: r.height
      });
    } else {
      reasonCount[r.reason] = (reasonCount[r.reason] || 0) + 1;
    }
  }

  if (validatedImages.length === 0) {
    state.imageLastCleanedUrls = [];
    const msg = reasonCount.too_small
      ? `全部被过滤为小图（<32px）`
      : '所有链接均无法加载为图片，请检查链接有效性';
    showToast(msg, 'error');
    renderEmptyState();
    return;
  }

  state.currentImages = validatedImages;
  state.imageLastCleanedUrls = validatedImages.map((img) => img.url);
  state.selectedImages.clear();
  renderGallery(validatedImages);

  const invalidCount = urlItems.length - validatedImages.length - smallFiltered.length;
  const pieces = [];
  if (state.filterSmall && smallFiltered.length > 0) pieces.push(`小图 ${smallFiltered.length}`);
  const http403 = reasonCount.http_403 || 0;
  const http404 = reasonCount.http_404 || 0;
  if (http403) pieces.push(`403 ${http403}`);
  if (http404) pieces.push(`404 ${http404}`);
  if (reasonCount.timeout) pieces.push(`超时 ${reasonCount.timeout}`);
  if (reasonCount.not_image) pieces.push(`非图片 ${reasonCount.not_image}`);

  const extra = pieces.length ? `（${pieces.join('，')}）` : '';
  showToast(`成功加载 ${validatedImages.length}/${urlItems.length} 张${extra}`, 'success');
}

// 抓取当前活动标签页的图片链接
async function grabImagesFromActiveTab() {
  try {
    if (!chrome?.tabs?.query || !chrome?.scripting?.executeScript) {
      showToast('当前环境不支持抓取页面图片', 'error');
      return;
    }

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      showToast('未找到当前标签页', 'error');
      return;
    }
    const tabUrl = String(tab.url || '');
    // 不能对 chrome-extension:// / chrome:// 等页面注入脚本
    if (!/^https?:\/\//i.test(tabUrl)) {
      showToast('请切换到需要抓取的网页标签页（http/https）再点“抓取当前页图片”', 'error');
      return;
    }

    showToast('正在抓取当前页图片...', 'success');

    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const urls = new Set();

        // img
        for (const img of Array.from(document.images || [])) {
          const u = img.currentSrc || img.src;
          if (u) urls.add(u);
        }

        // source srcset
        const sources = document.querySelectorAll('source[srcset]');
        sources.forEach((s) => {
          const srcset = s.getAttribute('srcset') || '';
          // 取第一个候选
          const first = srcset.split(',')[0]?.trim()?.split(/\s+/)[0];
          if (first) urls.add(first);
        });

        // meta og:image / twitter:image
        const metas = document.querySelectorAll('meta[property="og:image"], meta[name="twitter:image"], meta[name="twitter:image:src"]');
        metas.forEach((m) => {
          const c = m.getAttribute('content');
          if (c) urls.add(c);
        });

        // rel=image_src
        const link = document.querySelector('link[rel="image_src"]');
        if (link?.getAttribute('href')) urls.add(link.getAttribute('href'));

        // inline background-image（只扫含 style 的元素，避免全量扫描）
        const styled = document.querySelectorAll('[style*="background"]');
        styled.forEach((el) => {
          const bg = (el.style && (el.style.backgroundImage || el.style.background)) || '';
          const m = /url\((['"]?)(.*?)\1\)/i.exec(bg);
          if (m && m[2]) urls.add(m[2]);
        });

        // 仅保留 http(s)
        return Array.from(urls).filter((u) => /^https?:\/\//i.test(u));
      }
    });

    const arr = Array.isArray(result) ? result : [];
    const unique = Array.from(new Set(arr));
    if (unique.length === 0) {
      showToast('未抓取到图片链接', 'error');
      return;
    }

    // 切换到图片模式并填充
    state.mode = 'image';
    elements.modeBtns.forEach((btn) => btn.classList.toggle('active', btn.dataset.mode === 'image'));
    updatePlaceholder();
    elements.inputText.value = unique.join('\n');
    elements.inputText.focus();
    updateSendEnabled(); // programmatic value set 不会触发 input 事件
    showToast(`已抓取 ${unique.length} 条链接，点击“开始处理”`, 'success');
  } catch (e) {
    console.error(e);
    showToast('抓取失败（可能是页面权限限制）', 'error');
  }
}

// ========= ZIP 打包下载（Store，无压缩） =========
async function downloadZipSelected() {
  if (state.selectedImages.size === 0) return;
  const selectedArray = Array.from(state.selectedImages);
  const imgs = selectedArray
    .map((id) => state.currentImages.find((x) => x.id === id))
    .filter(Boolean);
  await downloadZipForImages(imgs, `images_selected_${Date.now()}.zip`);
}

async function downloadZipAll() {
  if (!state.currentImages.length) return;
  await downloadZipForImages(state.currentImages, `images_all_${Date.now()}.zip`);
}

async function downloadZipForImages(images, zipName) {
  if (!images?.length) return;
  try {
    elements.zipAllBtn && (elements.zipAllBtn.disabled = true);
    elements.zipSelectedBtn && (elements.zipSelectedBtn.disabled = true);

    const files = [];
    let okCount = 0;

    for (let i = 0; i < images.length; i++) {
      const url = images[i].url;
      if (i % 3 === 0) showToast(`打包中... ${i}/${images.length}`, 'success');
      try {
        const res = await fetchWithTimeout(url, 20000);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        if (!blob.type || !blob.type.startsWith('image/')) throw new Error(`Not image: ${blob.type || 'unknown'}`);
        const ab = await blob.arrayBuffer();
        const data = new Uint8Array(ab);
        const ext = guessExt(url, blob.type);
        const name = `img_${String(i + 1).padStart(3, '0')}.${ext}`;
        files.push({ name, data });
        okCount++;
      } catch (e) {
        logDebug('打包抓取失败', { url: url.substring(0, 80), err: e.message });
      }
    }

    if (files.length === 0) {
      showToast('打包失败：没有可用图片数据', 'error');
      return;
    }

    showToast('正在生成 ZIP...', 'success');
    const zipBytes = makeZipStore(files);
    const blob = new Blob([zipBytes], { type: 'application/zip' });
    const blobUrl = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = zipName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);

    showToast(`ZIP 已生成（成功 ${okCount}/${images.length}）`, 'success');
  } finally {
    elements.zipAllBtn && (elements.zipAllBtn.disabled = false);
    elements.zipSelectedBtn && (elements.zipSelectedBtn.disabled = false);
  }
}

function guessExt(url, mime) {
  const urlExt = url.split('.').pop().split('?')[0].toLowerCase();
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(urlExt)) return urlExt === 'jpeg' ? 'jpg' : urlExt;
  const map = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp', 'image/bmp': 'bmp' };
  return map[mime] || 'jpg';
}

function makeZipStore(files) {
  // ZIP store (no compression) builder: local headers + central directory + EOCD
  const encoder = new TextEncoder();
  const parts = [];
  const central = [];
  let offset = 0;

  for (const f of files) {
    const nameBytes = encoder.encode(f.name);
    const data = f.data;
    const crc = crc32(data);

    const local = new Uint8Array(30 + nameBytes.length);
    writeU32(local, 0, 0x04034b50);
    writeU16(local, 4, 20); // version needed
    writeU16(local, 6, 0x0800); // UTF-8
    writeU16(local, 8, 0); // store
    writeU16(local, 10, 0); // mod time
    writeU16(local, 12, 0); // mod date
    writeU32(local, 14, crc);
    writeU32(local, 18, data.length);
    writeU32(local, 22, data.length);
    writeU16(local, 26, nameBytes.length);
    writeU16(local, 28, 0);
    local.set(nameBytes, 30);

    parts.push(local, data);

    const cen = new Uint8Array(46 + nameBytes.length);
    writeU32(cen, 0, 0x02014b50);
    writeU16(cen, 4, 20); // version made by
    writeU16(cen, 6, 20); // version needed
    writeU16(cen, 8, 0x0800); // UTF-8
    writeU16(cen, 10, 0); // store
    writeU16(cen, 12, 0);
    writeU16(cen, 14, 0);
    writeU32(cen, 16, crc);
    writeU32(cen, 20, data.length);
    writeU32(cen, 24, data.length);
    writeU16(cen, 28, nameBytes.length);
    writeU16(cen, 30, 0); // extra
    writeU16(cen, 32, 0); // comment
    writeU16(cen, 34, 0); // disk start
    writeU16(cen, 36, 0); // internal attrs
    writeU32(cen, 38, 0); // external attrs
    writeU32(cen, 42, offset); // local header offset
    cen.set(nameBytes, 46);
    central.push(cen);

    offset += local.length + data.length;
  }

  const centralSize = central.reduce((s, a) => s + a.length, 0);
  const centralOffset = offset;
  const eocd = new Uint8Array(22);
  writeU32(eocd, 0, 0x06054b50);
  writeU16(eocd, 4, 0);
  writeU16(eocd, 6, 0);
  writeU16(eocd, 8, files.length);
  writeU16(eocd, 10, files.length);
  writeU32(eocd, 12, centralSize);
  writeU32(eocd, 16, centralOffset);
  writeU16(eocd, 20, 0);

  const totalSize =
    parts.reduce((s, a) => s + a.length, 0) +
    centralSize +
    eocd.length;
  const out = new Uint8Array(totalSize);
  let p = 0;
  for (const a of parts) {
    out.set(a, p);
    p += a.length;
  }
  for (const a of central) {
    out.set(a, p);
    p += a.length;
  }
  out.set(eocd, p);
  return out;
}

function writeU16(buf, off, v) {
  buf[off] = v & 255;
  buf[off + 1] = (v >>> 8) & 255;
}
function writeU32(buf, off, v) {
  buf[off] = v & 255;
  buf[off + 1] = (v >>> 8) & 255;
  buf[off + 2] = (v >>> 16) & 255;
  buf[off + 3] = (v >>> 24) & 255;
}

const CRC32_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[i] = c >>> 0;
  }
  return t;
})();

function crc32(data) {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    c = CRC32_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function showSkeletons(count) {
  const skeletons = Array(Math.min(count, 12))
    .fill(0)
    .map(
      () => `
      <div class="gallery-item" style="height:180px;background:#fff;border:1px solid var(--border-color);border-radius:12px;">
        <div style="height:160px;background:#eee;"></div>
        <div style="padding:10px;color:#999;font-size:12px;">加载中...</div>
      </div>
    `
    )
    .join('');
  elements.galleryContent.innerHTML = `<div class="gallery-grid">${skeletons}</div>`;
}

function renderGallery(images) {
  if (!images || images.length === 0) {
    renderEmptyState();
    return;
  }

  // 检查是否有字段名分组
  const hasFieldNames = images.some((img) => img.fieldName);

  const container = document.createElement('div');

  if (hasFieldNames) {
    // 按字段名分组，保持顺序
    const groups = [];
    const groupMap = new Map();
    images.forEach((img) => {
      const key = img.fieldName || '';
      if (!groupMap.has(key)) {
        const group = { fieldName: key, images: [] };
        groupMap.set(key, group);
        groups.push(group);
      }
      groupMap.get(key).images.push(img);
    });

    groups.forEach((group) => {
      if (group.fieldName) {
        const header = document.createElement('div');
        header.className = 'gallery-group-header';
        header.textContent = group.fieldName;
        container.appendChild(header);
      }
      const grid = document.createElement('div');
      grid.className = 'gallery-grid';
      group.images.forEach((img) => {
        grid.appendChild(createGalleryItem(img, images));
      });
      container.appendChild(grid);
    });
  } else {
    const grid = document.createElement('div');
    grid.className = 'gallery-grid';
    images.forEach((img) => {
      grid.appendChild(createGalleryItem(img, images));
    });
    container.appendChild(grid);
  }

  elements.galleryContent.innerHTML = '';
  elements.galleryContent.appendChild(container);
  if (elements.imageCount) elements.imageCount.textContent = String(images.length);
  if (elements.selectAllBtn) elements.selectAllBtn.style.display = 'flex';
  if (elements.downloadAllBtn) elements.downloadAllBtn.style.display = 'flex';
  if (elements.zipAllBtn) elements.zipAllBtn.style.display = 'flex';
  updateGalleryItemHeight(images.length);
  updateSelectionUI();
}

function createGalleryItem(img, images) {
    const item = document.createElement('div');
    item.className = 'gallery-item';
    item.dataset.imageId = img.id;
    item.dataset.imageUrl = img.url;

    const imgEl = document.createElement('img');
    imgEl.loading = 'lazy';
    imgEl.alt = `Image ${img.originalIndex + 1}`;
    imgEl.src = img.url;
    // 点击图片：打开/关闭预览
    imgEl.addEventListener('click', () => {
      if (elements.imagePreviewBackdrop?.classList?.contains('show') && state.preview.currentIndex === images.findIndex((x) => x.id === img.id)) {
        hideImagePreview();
      } else {
        previewImageByIndex(images.findIndex((x) => x.id === img.id));
      }
    });

    const overlay = document.createElement('div');
    overlay.className = 'gallery-item-overlay';

    const checkboxWrap = document.createElement('div');
    checkboxWrap.className = 'gallery-item-checkbox';
    checkboxWrap.innerHTML = `
      <div class="checkbox-wrapper">
        <input type="checkbox" id="check_${img.id}" data-image-id="${img.id}">
        <label for="check_${img.id}" aria-label="选择"></label>
      </div>
    `;

    const actions = document.createElement('div');
    actions.className = 'gallery-item-actions';

    const previewBtn = document.createElement('button');
    previewBtn.type = 'button';
    previewBtn.className = 'btn-overlay';
    previewBtn.title = '预览（支持缩放/拖拽）';
    previewBtn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="11" cy="11" r="8"></circle>
        <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        <line x1="11" y1="8" x2="11" y2="14"></line>
        <line x1="8" y1="11" x2="14" y2="11"></line>
      </svg>
    `;
    previewBtn.addEventListener('click', () => previewImageByIndex(images.findIndex((x) => x.id === img.id)));

    const downloadBtn = document.createElement('button');
    downloadBtn.type = 'button';
    downloadBtn.className = 'btn-overlay';
    downloadBtn.title = '下载';
    downloadBtn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
        <polyline points="7 10 12 15 17 10"></polyline>
        <line x1="12" y1="15" x2="12" y2="3"></line>
      </svg>
    `;
    downloadBtn.addEventListener('click', () => downloadImageById(img.id));

    actions.appendChild(previewBtn);
    actions.appendChild(downloadBtn);
    overlay.appendChild(checkboxWrap);
    overlay.appendChild(actions);

    item.appendChild(imgEl);
    // 标签：有字段名显示字段名，无字段名显示顺序编号
    const labelText = img.fieldName || `#${img.originalIndex + 1}`;
    const fieldLabel = document.createElement('div');
    fieldLabel.className = 'gallery-item-field';
    fieldLabel.textContent = labelText;
    fieldLabel.title = img.fieldName || img.url;
    item.appendChild(fieldLabel);
    item.appendChild(overlay);


    // 绑定复选框事件
    const checkbox = checkboxWrap.querySelector('input[type="checkbox"]');
    checkbox.addEventListener('change', updateSelection);

    // 绑定右键菜单
    item.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      showContextMenu(e, img.url, img.originalIndex);
    });

    return item;
}
function updateSelection(e) {
  const imageId = e.target.dataset.imageId;
  const item = document.querySelector(`[data-image-id="${imageId}"]`);

  if (e.target.checked) {
    state.selectedImages.add(imageId);
    item.classList.add('selected');
  } else {
    state.selectedImages.delete(imageId);
    item.classList.remove('selected');
  }
  updateSelectionUI();
}

function updateSelectionUI() {
  const count = state.selectedImages.size;
  if (elements.selectedCount) elements.selectedCount.textContent = String(count);
  if (elements.downloadSelectedBtn) elements.downloadSelectedBtn.style.display = count > 0 ? 'flex' : 'none';
  if (elements.zipSelectedBtn) elements.zipSelectedBtn.style.display = count > 0 ? 'flex' : 'none';

  if (elements.selectAllBtn) {
    if (count === state.currentImages.length && count > 0) {
      elements.selectAllBtn.textContent = '取消全选';
    } else {
      elements.selectAllBtn.textContent = '全选';
    }
  }
}

function toggleSelectAll() {
  const checkboxes = document.querySelectorAll('.gallery-item input[type="checkbox"]');
  const allSelected = state.selectedImages.size === state.currentImages.length;

  checkboxes.forEach((checkbox) => {
    checkbox.checked = !allSelected;
    const imageId = checkbox.dataset.imageId;
    const item = document.querySelector(`[data-image-id="${imageId}"]`);

    if (!allSelected) {
      state.selectedImages.add(imageId);
      item.classList.add('selected');
    } else {
      state.selectedImages.delete(imageId);
      item.classList.remove('selected');
    }
  });
  updateSelectionUI();
}

async function downloadSelected() {
  if (state.selectedImages.size === 0) return;
  elements.downloadSelectedBtn.disabled = true;
  const oldText = elements.downloadSelectedBtn.textContent;
  elements.downloadSelectedBtn.textContent = '下载中...';

  let successCount = 0;
  const selectedArray = Array.from(state.selectedImages);

  for (let i = 0; i < selectedArray.length; i++) {
    const imageId = selectedArray[i];
    const img = state.currentImages.find((x) => x.id === imageId);
    if (!img) continue;
    try {
      await downloadImage(img.url, img.originalIndex);
      successCount++;
      await new Promise((r) => setTimeout(r, 150));
    } catch (e) {
      // ignore
    }
  }

  elements.downloadSelectedBtn.disabled = false;
  elements.downloadSelectedBtn.textContent = oldText || '下载选中';
  showToast(`成功下载 ${successCount}/${selectedArray.length} 张图片`, 'success');
}

async function downloadImageById(imageId) {
  const img = state.currentImages.find((x) => x.id === imageId);
  if (!img) return;
  try {
    await downloadImage(img.url, img.originalIndex);
    showToast('已开始下载', 'success');
  } catch (e) {
    showToast('下载失败：可能跨域/CORS/防盗链限制，已尝试打开原图', 'error');
  }
}

function updateImagePreviewIndexUI() {
  if (!elements.imagePreviewIndex) return;
  const total = state.currentImages?.length || 0;
  const cur = state.preview.currentIndex >= 0 ? state.preview.currentIndex + 1 : 0;
  elements.imagePreviewIndex.textContent = `${cur} / ${total}`;
}

function previewImageByIndex(index) {
  if (!state.currentImages?.length) return;
  const total = state.currentImages.length;
  const nextIndex = ((index % total) + total) % total;
  const url = state.currentImages[nextIndex].url;
  state.preview.currentIndex = nextIndex;
  previewImage(url);
  updateImagePreviewIndexUI();
}

function previewNextImage() {
  if (!state.currentImages?.length) return;
  previewImageByIndex(state.preview.currentIndex + 1);
}

function previewPrevImage() {
  if (!state.currentImages?.length) return;
  previewImageByIndex(state.preview.currentIndex - 1);
}

function previewImage(url) {
  if (!elements.imagePreviewBackdrop || !elements.imagePreviewImg) return;
  elements.imagePreviewBackdrop.classList.add('show');

  // 先清空，避免旧图残影
  elements.imagePreviewImg.src = '';
  elements.imagePreviewImg.style.transform = '';

  // 等图片加载完再做“适配显示 + 允许缩放拖拽”
  elements.imagePreviewImg.onload = () => {
    resetImagePreviewTransform(true);
  };
  elements.imagePreviewImg.src = url;
}

function hideImagePreview() {
  if (!elements.imagePreviewBackdrop || !elements.imagePreviewImg) return;
  elements.imagePreviewBackdrop.classList.remove('show');
  elements.imagePreviewImg.src = '';
  elements.imagePreviewImg.classList.remove('dragging');
  state.preview.currentIndex = -1;
  updateImagePreviewIndexUI();
}

function applyImagePreviewTransform() {
  if (!elements.imagePreviewImg) return;
  const { scale, x, y } = state.preview;
  elements.imagePreviewImg.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
}

function resetImagePreviewTransform(fit = false) {
  if (!elements.imagePreviewImg || !elements.imagePreviewBackdrop) return;
  const img = elements.imagePreviewImg;
  const body = elements.imagePreviewBackdrop.querySelector('.image-preview-body');
  if (!body) return;

  const bodyRect = body.getBoundingClientRect();

  let scale = 1;
  if (fit && img.naturalWidth && img.naturalHeight) {
    // 适配到可视区域（留一点内边距）
    const pad = 6;
    const maxW = Math.max(1, bodyRect.width - pad * 2);
    const maxH = Math.max(1, bodyRect.height - pad * 2);
    scale = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight, 1);
  }

  state.preview.scale = clamp(scale, 0.1, 8);
  state.preview.x = 0;
  state.preview.y = 0;
  applyImagePreviewTransform();
}

function bindImagePreviewInteractions() {
  if (!elements.imagePreviewImg || !elements.imagePreviewBackdrop) return;

  const img = elements.imagePreviewImg;
  const body = elements.imagePreviewBackdrop.querySelector('.image-preview-body');
  if (!body) return;

  // 滚轮缩放（以鼠标位置为中心）
  body.addEventListener(
    'wheel',
    (e) => {
      if (!elements.imagePreviewBackdrop.classList.contains('show')) return;
      e.preventDefault();

      const rect = body.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;

      const prevScale = state.preview.scale;
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      const nextScale = clamp(prevScale * delta, 0.1, 8);

      // 保持缩放中心：调整平移
      const scaleRatio = nextScale / prevScale;
      state.preview.x = cx - (cx - state.preview.x) * scaleRatio;
      state.preview.y = cy - (cy - state.preview.y) * scaleRatio;
      state.preview.scale = nextScale;
      applyImagePreviewTransform();
    },
    { passive: false }
  );

  // 拖拽平移
  img.addEventListener('mousedown', (e) => {
    if (!elements.imagePreviewBackdrop.classList.contains('show')) return;
    e.preventDefault();
    state.preview.dragging = true;
    state.preview.moved = false;
    img.classList.add('dragging');
    state.preview.dragStartX = e.clientX;
    state.preview.dragStartY = e.clientY;
    state.preview.dragOriginX = state.preview.x;
    state.preview.dragOriginY = state.preview.y;
  });

  window.addEventListener('mousemove', (e) => {
    if (!state.preview.dragging) return;
    const dx = e.clientX - state.preview.dragStartX;
    const dy = e.clientY - state.preview.dragStartY;
    if (Math.abs(dx) + Math.abs(dy) > 3) state.preview.moved = true;
    state.preview.x = state.preview.dragOriginX + dx;
    state.preview.y = state.preview.dragOriginY + dy;
    applyImagePreviewTransform();
  });

  window.addEventListener('mouseup', () => {
    if (!state.preview.dragging) return;
    state.preview.dragging = false;
    img.classList.remove('dragging');
    state.preview.justDragged = state.preview.moved;
    setTimeout(() => (state.preview.justDragged = false), 150);
  });

  // 双击复位（适配显示）
  img.addEventListener('dblclick', (e) => {
    e.preventDefault();
    resetImagePreviewTransform(true);
  });

  // 单击图片关闭（如果不是拖拽后触发的 click）
  img.addEventListener('click', () => {
    if (!elements.imagePreviewBackdrop.classList.contains('show')) return;
    if (state.preview.justDragged) return;
    hideImagePreview();
  });
}

async function downloadImage(url, index) {
  try {
    logDebug(`开始下载图片 ${index}`, { url: url.substring(0, 80) });

    const response = await fetch(url, { credentials: 'omit' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const blob = await response.blob();
    if (!blob.type || !blob.type.startsWith('image/')) throw new Error(`Not an image: ${blob.type || 'unknown'}`);

    const blobUrl = URL.createObjectURL(blob);
    let ext = 'jpg';
    const urlExt = url.split('.').pop().split('?')[0].toLowerCase();
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(urlExt)) ext = urlExt;
    else if (blob.type) {
      const typeMap = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp', 'image/bmp': 'bmp' };
      ext = typeMap[blob.type] || 'jpg';
    }

    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = `image_${index + 1}_${Date.now()}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);
    logDebug(`下载成功 ${index}`);
    return true;
  } catch (error) {
    logDebug(`下载失败 ${index}`, error.message);
    // 降级方案：直接打开原图
    try {
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (e) {
      // ignore
    }
    throw error;
  }
}

async function downloadAll() {
  if (state.currentImages.length === 0) return;
  elements.downloadAllBtn.disabled = true;
  const oldText = elements.downloadAllBtn.textContent;
  elements.downloadAllBtn.textContent = '下载中...';

  let successCount = 0;
  for (let i = 0; i < state.currentImages.length; i++) {
    try {
      await downloadImage(state.currentImages[i].url, i);
      successCount++;
      await new Promise((r) => setTimeout(r, 150));
    } catch (e) {
      // ignore
    }
  }

  elements.downloadAllBtn.disabled = false;
  elements.downloadAllBtn.textContent = oldText || '下载全部';
  showToast(`成功下载 ${successCount}/${state.currentImages.length} 张图片`, 'success');
}

// ========= 右键菜单 =========
function showContextMenu(e, url, index) {
  state.currentContextImage = { url, index };
  elements.contextMenu.style.left = `${e.clientX}px`;
  elements.contextMenu.style.top = `${e.clientY}px`;
  elements.contextMenu.classList.add('show');
}

async function copyImageToClipboard() {
  if (!state.currentContextImage) return;
  try {
    if (!window.isSecureContext) {
      showToast('复制图片需要安全环境（扩展页面一般满足）', 'error');
      return;
    }
    if (!window.ClipboardItem || !navigator.clipboard?.write) {
      showToast('当前浏览器不支持复制图片到剪贴板', 'error');
      return;
    }

    let blob = null;

    // 优先通过 background service worker 抓取（绕过 CORS）
    if (chrome?.runtime?.sendMessage) {
      try {
        const res = await chrome.runtime.sendMessage({ action: 'fetchImage', url: state.currentContextImage.url });
        if (res?.ok && res.data) {
          blob = new Blob([new Uint8Array(res.data)], { type: res.type || 'image/png' });
        }
      } catch (_) {
        // background 不可用，走 fallback
      }
    }

    // fallback：直接 fetch
    if (!blob) {
      const response = await fetch(state.currentContextImage.url, { credentials: 'omit' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      blob = await response.blob();
    }

    if (!blob.type || !blob.type.startsWith('image/')) throw new Error(`Not an image: ${blob.type || 'unknown'}`);
    await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
    showToast('图片已复制到剪贴板', 'success');
  } catch (error) {
    logDebug('复制图片失败', error.message);
    showToast('复制图片失败：多半是跨域/CORS/防盗链。可改用"复制链接"', 'error');
  } finally {
    elements.contextMenu.classList.remove('show');
  }
}

async function copyLinkToClipboard() {
  if (!state.currentContextImage) return;
  try {
    await navigator.clipboard.writeText(state.currentContextImage.url);
    showToast('链接已复制到剪贴板', 'success');
  } catch (error) {
    logDebug('复制链接失败', error.message);
    showToast('复制失败', 'error');
  } finally {
    elements.contextMenu.classList.remove('show');
  }
}

async function downloadContextImage() {
  if (!state.currentContextImage) return;
  try {
    await downloadImage(state.currentContextImage.url, state.currentContextImage.index);
    showToast('下载成功', 'success');
  } catch (e) {
    showToast('下载失败', 'error');
  } finally {
    elements.contextMenu.classList.remove('show');
  }
}

function previewContextImage() {
  if (!state.currentContextImage) return;
  try {
    window.open(state.currentContextImage.url, '_blank', 'noopener,noreferrer');
  } catch (e) {
    // ignore
  } finally {
    elements.contextMenu.classList.remove('show');
  }
}

// ========= 网页文本模式 =========
async function getWebSourceTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const active = tabs[0];
  if (active?.id && /^https?:\/\//i.test(String(active.url || ''))) {
    await setSetting('lastWebSourceTabId', active.id);
    return active;
  }
  const savedId = await getSetting('lastWebSourceTabId', null);
  if (savedId) {
    try {
      const saved = await chrome.tabs.get(savedId);
      if (/^https?:\/\//i.test(String(saved?.url || ''))) return saved;
    } catch (_) {}
  }
  return null;
}

async function ensurePageContent(tabId) {
  await chrome.scripting.executeScript({ target: { tabId }, files: ['page-content.js'] });
}

function sendTabMessage(tabId, message) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      const err = chrome.runtime.lastError;
      if (err) reject(new Error(err.message));
      else resolve(response);
    });
  });
}

function sendRuntimeMessage(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      const err = chrome.runtime.lastError;
      if (err) reject(new Error(err.message));
      else resolve(response);
    });
  });
}

function normalizeWebUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) throw new Error('请输入网页链接');
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  const url = new URL(withProtocol);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('仅支持 http/https 网页');
  return url.href;
}

function needsEnhancedWebExtraction(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === 'feishu.cn' || host.endsWith('.feishu.cn') || host === 'larksuite.com' || host.endsWith('.larksuite.com');
  } catch (_) {
    return false;
  }
}

function extractWebDocumentFromHtml(html, url) {
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  parsed.querySelectorAll('script,style,noscript,template,svg,nav,header,footer,aside,[aria-hidden="true"]').forEach((el) => el.remove());
  const root = parsed.querySelector('article') || parsed.querySelector('main') || parsed.body;
  const candidates = Array.from(root.querySelectorAll('h1,h2,h3,h4,h5,h6,p,blockquote,pre,ul,ol,table'));
  const sections = [];
  let current = null;
  const clean = (text) => String(text || '').replace(/\u00a0/g, ' ').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  for (const el of candidates) {
    const text = clean(el.textContent);
    if (text.length < 2) continue;
    if (/^H[1-6]$/.test(el.tagName)) {
      current = { id: `web_${Date.now()}_${sections.length}`, title: text, text: '', selected: true };
      sections.push(current);
    } else {
      if (!current) {
        current = { id: `web_${Date.now()}_${sections.length}`, title: parsed.title || '正文', text: '', selected: true };
        sections.push(current);
      }
      if (!current.text.includes(text)) current.text += `${current.text ? '\n\n' : ''}${text}`;
    }
  }
  return { title: parsed.title || '未命名网页', url, capturedAt: new Date().toISOString(), sections };
}

function waitForTabComplete(tabId, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error('网页加载超时'));
    }, timeoutMs);
    const listener = (updatedId, info) => {
      if (updatedId !== tabId || info.status !== 'complete') return;
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    };
    chrome.tabs.onUpdated.addListener(listener);
  });
}

async function grabWebUrl(rawUrl) {
  let url;
  try {
    url = normalizeWebUrl(rawUrl);
    state.webUrlInput = url;
    showToast('正在读取网页…', 'success');
    const response = needsEnhancedWebExtraction(url) ? null : await sendRuntimeMessage({ action: 'fetchPageHtml', url });
    if (response?.ok) {
      const doc = extractWebDocumentFromHtml(response.html, response.finalUrl || url);
      const chars = doc.sections.reduce((sum, section) => sum + section.text.length, 0);
      if (doc.sections.length && chars >= 200) {
        await acceptWebDocument(doc, { type: 'url', url: doc.url });
        return;
      }
    }

    showToast('正在加载动态页面…', 'success');
    const tempTab = await chrome.tabs.create({ url, active: false });
    try {
      if (tempTab.status !== 'complete') await waitForTabComplete(tempTab.id);
      await ensurePageContent(tempTab.id);
      const action = needsEnhancedWebExtraction(url) ? 'tuwenExtractEnhancedPage' : 'tuwenExtractFullPage';
      const rendered = await sendTabMessage(tempTab.id, { action });
      if (!rendered?.ok || !rendered.payload?.sections?.length) throw new Error('未识别到有效正文');
      await acceptWebDocument(rendered.payload, { type: 'url', url });
    } finally {
      await new Promise((resolve) => chrome.tabs.remove(tempTab.id, () => resolve()));
    }
  } catch (error) {
    const message = url && needsEnhancedWebExtraction(url)
      ? '飞书文档未读取到正文，请先打开文档并等待加载，再使用“在当前网页选择内容”'
      : `链接抓取失败：${error.message}`;
    showToast(message, 'error');
  }
}

async function grabWebPage(selectMode) {
  try {
    const tab = await getWebSourceTab();
    if (!tab?.id) {
      showToast('请先打开需要抓取的 http/https 网页', 'error');
      return;
    }
    await ensurePageContent(tab.id);
    if (selectMode) {
      await startPickerOnTab(tab);
      return;
    }
    showToast('正在提取网页正文…', 'success');
    state.webSource = { type: 'currentTab', tabId: tab.id, url: tab.url || '' };
    const action = needsEnhancedWebExtraction(tab.url || '') ? 'tuwenExtractEnhancedPage' : 'tuwenExtractFullPage';
    const response = await sendTabMessage(tab.id, { action });
    if (!response?.ok || !response.payload?.sections?.length) throw new Error('未识别到正文');
    acceptWebDocument(response.payload, { type: 'currentTab', tabId: tab.id, url: tab.url || '' });
  } catch (error) {
    const message = needsEnhancedWebExtraction(state.webSource?.url || '')
      ? '飞书文档未读取到正文，可尝试在页面上手动选择内容'
      : `抓取失败：${error.message}`;
    showToast(message, 'error');
  }
}

async function startPickerOnTab(tab) {
  if (!tab?.id) throw new Error('未找到可选取的网页');
  await ensurePageContent(tab.id);
  state.webSource = { type: 'selection', tabId: tab.id, url: tab.url || state.webDocument?.url || '' };
  await setSetting('lastWebSourceTabId', tab.id);
  await sendTabMessage(tab.id, { action: 'tuwenStartPagePicker' });
  await chrome.tabs.update(tab.id, { active: true });
  showToast('请在网页上点击选择内容', 'success');
}

async function repickWebContent() {
  try {
    const source = state.webSource || state.webDocument?.source;
    if (source?.tabId) {
      try {
        const tab = await chrome.tabs.get(source.tabId);
        await startPickerOnTab(tab);
        return;
      } catch (_) {}
    }
    const url = source?.url || state.webDocument?.url;
    if (url) {
      const tab = await chrome.tabs.create({ url, active: true });
      if (tab.status !== 'complete') await waitForTabComplete(tab.id);
      await startPickerOnTab(await chrome.tabs.get(tab.id));
      return;
    }
    await grabWebPage(true);
  } catch (error) {
    showToast(`无法重新选取：${error.message}`, 'error');
  }
}

async function acceptWebDocument(payload, source = null) {
  state.mode = 'web';
  state.webDocument = {
    title: String(payload.title || '未命名网页'),
    url: String(payload.url || ''),
    capturedAt: payload.capturedAt || new Date().toISOString(),
    sections: (payload.sections || []).map((section, index) => ({
      id: section.id || `web_${Date.now()}_${index}`,
      title: String(section.title || `内容 ${index + 1}`),
      text: String(section.text || '').trim(),
      selected: section.selected !== false
    }))
  };
  state.webSource = source || state.webSource || { type: 'currentTab', url: state.webDocument.url };
  state.webDocument.source = state.webSource;
  state.webDirty = false;
  state.webExported = false;
  syncModeControls('web');
  await setSetting('lastWebDocument', state.webDocument);
  renderWebWorkspace();
  showToast(`已抓取 ${state.webDocument.sections.length} 个章节`, 'success');
}

function getSelectedWebSections() {
  return (state.webDocument?.sections || []).filter((section) => section.selected);
}

function webWordCount() {
  return getSelectedWebSections().reduce((sum, section) => sum + section.title.length + section.text.length, 0);
}

function renderWebWorkspace() {
  const doc = state.webDocument;
  [elements.selectAllBtn, elements.downloadSelectedBtn, elements.downloadAllBtn, elements.zipSelectedBtn, elements.zipAllBtn]
    .forEach((button) => { if (button) button.style.display = 'none'; });
  document.body.classList.toggle('web-workspace-mode', !!doc && !elements.composerBox);
  if (!doc) {
    elements.galleryContent.innerHTML = `
      <div class="web-empty card">
        <button class="web-empty-back" id="webCloseBtn" type="button">← 返回其他工具</button>
        <div class="web-empty-icon">文</div>
        <h2>抓取网页内容</h2>
        <p>输入链接抓取指定网页，或直接处理当前标签页。</p>
        <form class="web-url-form" id="webUrlForm">
          <input id="webUrlInput" type="text" inputmode="url" autocomplete="url" placeholder="https://example.com/article" value="${escapeHtml(state.webUrlInput)}">
          <button class="btn-process" type="submit">抓取链接</button>
        </form>
        <div class="web-or"><span>或</span></div>
        <div class="web-empty-actions">
          <button class="btn-secondary" id="webGrabFullBtn" type="button">抓取当前网页</button>
          <button class="btn-secondary" id="webPickBtn" type="button">在当前网页选择内容</button>
        </div>
      </div>`;
    document.getElementById('webUrlForm')?.addEventListener('submit', (event) => {
      event.preventDefault();
      grabWebUrl(document.getElementById('webUrlInput')?.value);
    });
    document.getElementById('webCloseBtn')?.addEventListener('click', leaveWebCapture);
    document.getElementById('webGrabFullBtn')?.addEventListener('click', () => grabWebPage(false));
    document.getElementById('webPickBtn')?.addEventListener('click', () => grabWebPage(true));
    if (elements.statsDisplay) elements.statsDisplay.textContent = '网页文本';
    return;
  }

  const selectedCount = getSelectedWebSections().length;
  const sectionsHtml = doc.sections.map((section, index) => `
    <article class="web-section-card ${section.selected ? '' : 'is-disabled'}" data-web-id="${escapeHtml(section.id)}">
      <label class="web-section-check"><input type="checkbox" ${section.selected ? 'checked' : ''} data-web-check="${escapeHtml(section.id)}"><span>${String(index + 1).padStart(2, '0')}</span></label>
      <div class="web-section-body">
        <div class="web-section-title" contenteditable="true" data-web-title="${escapeHtml(section.id)}">${escapeHtml(section.title)}</div>
        <div class="web-section-text" contenteditable="true" data-web-text="${escapeHtml(section.id)}">${escapeHtml(section.text)}</div>
      </div>
      <button class="web-section-delete" data-web-delete="${escapeHtml(section.id)}" type="button" title="删除章节">×</button>
    </article>`).join('');

  elements.galleryContent.innerHTML = `
    <div class="web-result-shell">
      <div class="web-action-bar">
        <div class="web-action-summary"><strong>${escapeHtml(doc.title)}</strong><span>${selectedCount} 个章节 · ${webWordCount().toLocaleString()} 字符</span></div>
        <div class="web-action-buttons">
          <button id="webNewGrabBtn" type="button">新建抓取</button>
          <button id="webRefreshGrabBtn" type="button">重新抓取</button>
          <button id="webCopyBtn" type="button">复制</button>
          <div class="web-export-menu-wrap">
            <button class="is-primary" id="webExportMenuBtn" type="button">导出 ▾</button>
            <div class="web-export-popover" id="webExportPopover" hidden>
              <button data-web-export="docx" type="button">Word (.docx)</button>
              <button data-web-export="md" type="button">Markdown (.md)</button>
              <button data-web-export="txt" type="button">纯文本 (.txt)</button>
            </div>
          </div>
        </div>
      </div>
      <div class="web-workspace">
      <aside class="web-outline">
        <div class="web-outline-head"><strong>内容结构</strong><button id="webToggleAllBtn" type="button">${selectedCount === doc.sections.length ? '取消全选' : '全选'}</button></div>
        ${doc.sections.map((s, i) => `<button class="web-outline-item ${s.selected ? '' : 'is-disabled'}" data-web-scroll="${escapeHtml(s.id)}">${String(i + 1).padStart(2, '0')} ${escapeHtml(s.title)}</button>`).join('')}
        <button class="web-outline-pick" id="webRepickBtn" type="button">+ 重新选取</button>
      </aside>
      <main class="web-document">
        <div class="web-document-meta"><span>${escapeHtml(safeHostname(doc.url))}</span><span>${selectedCount}/${doc.sections.length} 个章节</span></div>
        <h1 contenteditable="true" id="webDocumentTitle">${escapeHtml(doc.title)}</h1>
        <div class="web-document-sections">${sectionsHtml}</div>
      </main>
      <aside class="web-export-panel">
        <button class="web-back-tools" id="webBackToolsBtn" type="button">← 返回其他工具</button>
        <strong>文档信息</strong>
        <p>${webWordCount().toLocaleString()} 字符</p>
        <p>${escapeHtml(webSourceLabel())}</p>
        <a href="${escapeHtml(doc.url)}" target="_blank" rel="noopener">查看原网页</a>
        <button class="web-outline-pick" id="webInfoRepickBtn" type="button">在网页上重新选择</button>
      </aside>
      </div>
    </div>`;

  bindWebWorkspaceEvents();
  updateWebStats();
}

function webSourceLabel() {
  const type = state.webSource?.type;
  if (type === 'url') return '抓取方式：输入链接';
  if (type === 'selection') return '抓取方式：手动选择';
  return '抓取方式：当前网页';
}

function leaveWebCapture() {
  const selected = elements.modeSelect?.value;
  state.mode = selected === 'text' || selected === 'json' || selected === 'image' ? selected : 'image';
  syncModeControls(state.mode);
  updatePlaceholder();
  renderEmptyState();
}

function safeHostname(url) {
  try { return new URL(url).hostname; } catch (_) { return '未知来源'; }
}

function startNewWebGrab() {
  if (state.webDirty && !state.webExported && !window.confirm('当前内容有未导出的修改，确定开始新的抓取吗？')) return;
  state.webDocument = null;
  state.webSource = null;
  state.webDirty = false;
  state.webExported = false;
  setSetting('lastWebDocument', null);
  renderWebWorkspace();
}

async function refreshWebGrab() {
  if (state.webDirty && !state.webExported && !window.confirm('重新抓取会覆盖当前修改，确定继续吗？')) return;
  const source = state.webSource || state.webDocument?.source;
  if (source?.type === 'url') {
    await grabWebUrl(source.url || state.webDocument.url);
  } else if (source?.type === 'selection') {
    await grabWebPage(true);
  } else {
    await grabWebPage(false);
  }
}

function bindWebWorkspaceEvents() {
  document.querySelectorAll('[data-web-check]').forEach((input) => input.addEventListener('change', () => {
    const section = state.webDocument.sections.find((s) => s.id === input.dataset.webCheck);
    if (section) section.selected = input.checked;
    state.webDirty = true;
    persistAndRenderWebDocument();
  }));
  document.querySelectorAll('[data-web-delete]').forEach((button) => button.addEventListener('click', () => {
    state.webDocument.sections = state.webDocument.sections.filter((s) => s.id !== button.dataset.webDelete);
    state.webDirty = true;
    persistAndRenderWebDocument();
  }));
  document.querySelectorAll('[data-web-title],[data-web-text]').forEach((node) => node.addEventListener('blur', () => {
    const id = node.dataset.webTitle || node.dataset.webText;
    const section = state.webDocument.sections.find((s) => s.id === id);
    if (section) section[node.dataset.webTitle ? 'title' : 'text'] = node.innerText.trim();
    state.webDirty = true;
    setSetting('lastWebDocument', state.webDocument);
    updateWebStats();
  }));
  document.getElementById('webDocumentTitle')?.addEventListener('blur', (event) => {
    state.webDocument.title = event.target.innerText.trim() || '未命名网页';
    state.webDirty = true;
    setSetting('lastWebDocument', state.webDocument);
  });
  document.getElementById('webToggleAllBtn')?.addEventListener('click', () => {
    const all = state.webDocument.sections.every((s) => s.selected);
    state.webDocument.sections.forEach((s) => { s.selected = !all; });
    state.webDirty = true;
    persistAndRenderWebDocument();
  });
  document.getElementById('webRepickBtn')?.addEventListener('click', repickWebContent);
  document.getElementById('webInfoRepickBtn')?.addEventListener('click', repickWebContent);
  document.getElementById('webNewGrabBtn')?.addEventListener('click', startNewWebGrab);
  document.getElementById('webRefreshGrabBtn')?.addEventListener('click', refreshWebGrab);
  document.getElementById('webBackToolsBtn')?.addEventListener('click', () => {
    leaveWebCapture();
  });
  document.querySelectorAll('[data-web-scroll]').forEach((button) => button.addEventListener('click', () => {
    document.querySelector(`[data-web-id="${CSS.escape(button.dataset.webScroll)}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }));
  document.querySelectorAll('[data-web-export]').forEach((button) => button.addEventListener('click', () => exportWebDocument(button.dataset.webExport)));
  const exportMenuBtn = document.getElementById('webExportMenuBtn');
  const exportPopover = document.getElementById('webExportPopover');
  exportMenuBtn?.addEventListener('click', (event) => {
    event.stopPropagation();
    exportPopover.hidden = !exportPopover.hidden;
  });
  exportPopover?.addEventListener('click', (event) => event.stopPropagation());
  document.addEventListener('click', () => { if (exportPopover) exportPopover.hidden = true; }, { once: true });
  document.getElementById('webCopyBtn')?.addEventListener('click', async () => {
    await navigator.clipboard.writeText(buildWebText());
    showToast('已复制选中内容', 'success');
  });
}

function persistAndRenderWebDocument() {
  setSetting('lastWebDocument', state.webDocument);
  renderWebWorkspace();
}

function updateWebStats() {
  if (elements.statsDisplay) elements.statsDisplay.textContent = `${getSelectedWebSections().length} 个章节 · ${webWordCount().toLocaleString()} 字符`;
}

function buildWebMarkdown() {
  const doc = state.webDocument;
  const body = getSelectedWebSections().map((s) => `## ${s.title}\n\n${s.text}`).join('\n\n');
  return `# ${doc.title}\n\n> 来源：${doc.url}\n> 抓取时间：${new Date(doc.capturedAt).toLocaleString('zh-CN')}\n\n${body}\n`;
}

function buildWebText() {
  const doc = state.webDocument;
  const body = getSelectedWebSections().map((s) => `${s.title}\n${s.text}`).join('\n\n');
  return `${doc.title}\n\n来源：${doc.url}\n抓取时间：${new Date(doc.capturedAt).toLocaleString('zh-CN')}\n\n${body}\n`;
}

function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function safeFileName(value) {
  return String(value || '网页内容').replace(/[\\/:*?"<>|]/g, '_').slice(0, 80);
}

function exportWebDocument(format) {
  if (!getSelectedWebSections().length) {
    showToast('请至少选择一个章节', 'error');
    return;
  }
  const base = safeFileName(state.webDocument.title);
  if (format === 'docx') downloadBlob(`${base}.docx`, buildWebDocx());
  else if (format === 'md') downloadBlob(`${base}.md`, new Blob([buildWebMarkdown()], { type: 'text/markdown;charset=utf-8' }));
  else downloadBlob(`${base}.txt`, new Blob([buildWebText()], { type: 'text/plain;charset=utf-8' }));
  state.webExported = true;
  showToast(`已导出 ${format.toUpperCase()}`, 'success');
}

function xmlEscape(value) {
  return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function docxParagraph(text, style) {
  const lines = String(text || '').split('\n');
  return lines.map((line) => `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ''}<w:r><w:t xml:space="preserve">${xmlEscape(line)}</w:t></w:r></w:p>`).join('');
}

function buildWebDocx() {
  const encoder = new TextEncoder();
  const doc = state.webDocument;
  const body = [docxParagraph(doc.title, 'Title'), docxParagraph(`来源：${doc.url}`), docxParagraph(`抓取时间：${new Date(doc.capturedAt).toLocaleString('zh-CN')}`)];
  getSelectedWebSections().forEach((section) => body.push(docxParagraph(section.title, 'Heading1'), docxParagraph(section.text)));
  const files = [
    { name: '[Content_Types].xml', data: encoder.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>') },
    { name: '_rels/.rels', data: encoder.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>') },
    { name: 'word/_rels/document.xml.rels', data: encoder.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>') },
    { name: 'word/styles.xml', data: encoder.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:rPr><w:b/><w:sz w:val="36"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:rPr><w:b/><w:sz w:val="28"/></w:rPr></w:style></w:styles>') },
    { name: 'word/document.xml', data: encoder.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body.join('')}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>`) }
  ];
  return new Blob([makeZipStore(files)], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}

// ========= 文本模式 =========
function processText(input, opts = { fromRealtime: false }) {
  let cleaned = String(input).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  cleaned = cleaned.replace(/\\r\\n/g, '\n').replace(/\\n/g, '\n').replace(/\\r/g, '\n');

  cleaned = cleaned.replace(/^\s*```.*$/gm, '');
  cleaned = cleaned
    .replace(/!\[([^\]]*)\]\([^\)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^\)]*\)/g, '$1');
  cleaned = cleaned
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s{0,3}>\s?/gm, '')
    .replace(/^\s{0,3}([-*+]|•)\s+/gm, '')
    .replace(/^\s{0,3}\d+[.)]\s+/gm, '');
  cleaned = cleaned.replace(/[*_~`]+/g, '').replace(/^[\s"'“”‘’]+|[\s"'“”‘’]+$/g, '');
  cleaned = cleaned
    .replace(/\n{3,}/g, '\n\n')
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .trim();

  if (state.textCompressed) cleaned = cleaned.replace(/\n+/g, ' ');

  state.textLastInput = input;
  state.textLastCleaned = cleaned;
  renderTextDisplay(cleaned);

  if (!opts.fromRealtime) showToast('文本清洗完成', 'success');
}

function renderTextDisplay(text) {
  elements.galleryContent.innerHTML = `
    <div class="card" style="position:relative;height:100%;display:flex;flex-direction:column;">
      <div class="card-toolbar">
        <div style="position:relative;">
          <button class="icon-mini" id="textExportBtn" type="button" title="导出">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 3v12"></path>
              <path d="M8 11l4 4 4-4"></path>
              <path d="M21 21H3"></path>
            </svg>
          </button>
          <div class="popover" id="textExportMenu" hidden>
            <button class="popover-item" id="exportTxtBtn" type="button">导出为 .txt</button>
            <button class="popover-item" id="exportMdBtn" type="button">导出为 .md</button>
          </div>
        </div>
        <button class="icon-mini" id="textCopyBtn" type="button" title="复制">
          <svg id="textCopyIcon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="9" y="9" width="13" height="13" rx="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
          </svg>
        </button>
      </div>
      <div class="text-prose" id="cleanedTextView" style="flex:1;min-height:0;overflow:auto;"></div>
    </div>
  `;

  const view = document.getElementById('cleanedTextView');
  if (view) view.textContent = text;

  // stats：侧边栏用 pill，不重写结构
  if (elements.statsDisplay?.classList?.contains('pill')) {
    elements.statsDisplay.textContent = `${text.length} 字符`;
  } else if (elements.statsDisplay) {
    elements.statsDisplay.innerHTML = `${text.length} 字符`;
  }

  if (elements.selectAllBtn) elements.selectAllBtn.style.display = 'none';
  if (elements.downloadSelectedBtn) elements.downloadSelectedBtn.style.display = 'none';
  if (elements.downloadAllBtn) elements.downloadAllBtn.style.display = 'none';
  if (elements.zipSelectedBtn) elements.zipSelectedBtn.style.display = 'none';
  if (elements.zipAllBtn) elements.zipAllBtn.style.display = 'none';

  const exportBtn = document.getElementById('textExportBtn');
  const exportMenu = document.getElementById('textExportMenu');
  const exportTxtBtn = document.getElementById('exportTxtBtn');
  const exportMdBtn = document.getElementById('exportMdBtn');
  const copyBtn = document.getElementById('textCopyBtn');

  const closeMenu = () => {
    if (exportMenu) exportMenu.hidden = true;
  };
  if (exportBtn) {
    exportBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (exportMenu) exportMenu.hidden = !exportMenu.hidden;
    });
  }
  document.addEventListener('click', closeMenu, { once: true });

  const downloadAs = (filename, content) => {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const getTextOutput = () => state.textLastCleaned || text || '';

  if (exportTxtBtn) exportTxtBtn.addEventListener('click', () => { downloadAs(`clean_text_${Date.now()}.txt`, getTextOutput()); closeMenu(); });
  if (exportMdBtn) exportMdBtn.addEventListener('click', () => { downloadAs(`clean_text_${Date.now()}.md`, getTextOutput()); closeMenu(); });

  if (copyBtn) {
    copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(getTextOutput());
        // 克制反馈：图标变 ✓ 1.5s
        const icon = document.getElementById('textCopyIcon');
        if (icon) {
          icon.innerHTML = '<path d="M20 6L9 17l-5-5"></path>';
          setTimeout(() => {
            icon.innerHTML = '<rect x="9" y="9" width="13" height="13" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>';
          }, 1500);
        }
      } catch (e) {
        showToast('复制失败', 'error');
      }
    });
  }
}

async function copyCleanedText() {
  const textContent = document.getElementById('cleanedTextContent');
  if (!textContent) return;
  try {
    const value = textContent.value ?? '';
    await navigator.clipboard.writeText(value);
    const btn = document.getElementById('copyCleanedBtn');
    if (btn) {
      const old = btn.textContent;
      btn.textContent = '已复制';
      setTimeout(() => (btn.textContent = old), 1200);
    } else {
      showToast('内容已复制到剪贴板', 'success');
    }
  } catch (error) {
    logDebug('复制文本失败', error.message);
    showToast('复制失败', 'error');
  }
}

function toggleTextCompress() {
  state.textCompressed = !state.textCompressed;
  if (state.mode === 'text') {
    const input = elements.inputText.value;
    if (input.trim()) processText(input, { fromRealtime: true });
  }
}

function exportCleanedText() {
  const textContent = document.getElementById('cleanedTextContent');
  if (!textContent) return;
  const value = textContent.value ?? '';
  if (!value) return;
  const blob = new Blob([value], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `clean_text_${Date.now()}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('已导出 txt', 'success');
}

// ========= 历史记录 =========
const IDB_NAME = 'tuwen_ext_db';
const IDB_STORE = 'history_full';
let __idbPromise = null;

function openIdb() {
  if (__idbPromise) return __idbPromise;
  __idbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return __idbPromise;
}

async function idbPutFull(id, content) {
  try {
    const db = await openIdb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put({ id, content });
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    return false;
  }
}

async function idbGetFull(id) {
  try {
    const db = await openIdb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(id);
      req.onsuccess = () => resolve(req.result?.content || '');
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    return '';
  }
}

async function saveToHistory(input, mode) {
  const id = Date.now();
  const tooLarge = input.length > 50000; // 保护 localStorage（约 5MB 上限，且各浏览器不同）

  // 超大内容存 IndexedDB；localStorage 仅保存预览
  if (tooLarge) {
    await idbPutFull(id, input);
  }

  const record = {
    id,
    timestamp: new Date().toLocaleString('zh-CN'),
    mode,
    content: input.substring(0, 200),
    imageCount: mode === 'image' ? state.currentImages.length : 0,
    fullContent: tooLarge ? '' : input,
    fullLength: input.length
  };

  state.history.unshift(record);
  if (state.history.length > 50) state.history = state.history.slice(0, 50);
  localStorage.setItem('imageProcessHistory', JSON.stringify(state.history));
  renderHistory();
}

function loadHistory() {
  try {
    const saved = localStorage.getItem('imageProcessHistory');
    if (saved) {
      state.history = JSON.parse(saved) || [];
    } else {
      state.history = [];
    }
  } catch (e) {
    state.history = [];
  }
  renderHistory();
}

function renderHistory() {
  if (!elements.historyBody) return;
  if (state.history.length === 0) {
    elements.historyBody.innerHTML = `
      <div class="empty-state" style="padding: 24px 16px;">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <polyline points="12 6 12 12 16 14"></polyline>
        </svg>
        <div class="empty-state-title">暂无历史记录</div>
        <div class="empty-state-desc">处理过的内容将自动保存在这里</div>
      </div>
    `;
    return;
  }

  elements.historyBody.innerHTML = '';
  state.history.forEach((record) => {
    const item = document.createElement('div');
    item.className = 'history-item';
    item.addEventListener('click', () => restoreHistory(record.id));

    const time = document.createElement('div');
    time.className = 'history-item-time';
    time.textContent = record.timestamp;

    const preview = document.createElement('div');
    preview.className = 'history-item-preview';
    preview.textContent = record.content;

    const meta = document.createElement('div');
    meta.className = 'history-item-meta';
    meta.textContent =
      record.mode === 'image'
        ? `${record.imageCount} 张图片`
        : record.mode === 'json'
          ? `JSON（${formatLen(record.fullLength)}）`
          : '文本清洗';

    item.appendChild(time);
    item.appendChild(preview);
    item.appendChild(meta);
    elements.historyBody.appendChild(item);
  });
}

async function restoreHistory(id) {
  const record = state.history.find((r) => r.id === id);
  if (!record) return;
  let full = record.fullContent || '';
  if (!full && record.fullLength > 0) {
    // 尝试从 IndexedDB 取全文
    full = await idbGetFull(record.id);
  }
  const contentToUse = full || record.content || '';
  elements.inputText.value = contentToUse;

  state.mode = record.mode;
  elements.modeBtns.forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.mode === record.mode);
  });

  updatePlaceholder();
  closeHistory();

  // 对文本/JSON：恢复后直接渲染结果
  if (record.mode === 'text' && contentToUse) {
    processText(contentToUse, { fromRealtime: false });
  } else if (record.mode === 'json' && contentToUse) {
    processJson(contentToUse);
  }

  showToast('已恢复历史记录', 'success');
}

function openHistory() {
  elements.historyDrawer.classList.add('open');
  elements.overlay.classList.add('show');
}

function closeHistory() {
  elements.historyDrawer.classList.remove('open');
  elements.overlay.classList.remove('show');
}

// ========= Toast =========
function showToast(message, type = 'success') {
  if (!elements.toast || !elements.toastMessage) return;
  elements.toastMessage.textContent = message;
  const icon =
    type === 'success'
      ? '<polyline points="20 6 9 17 4 12"></polyline>'
      : '<line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line>';
  const svg = elements.toast.querySelector('svg');
  if (svg) svg.innerHTML = icon;
  elements.toast.classList.add('show');
  setTimeout(() => elements.toast.classList.remove('show'), 2500);
}

// 启动
initApp();
