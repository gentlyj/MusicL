// overlay.js

const titleEl = document.getElementById('title');   // 歌名 - 歌手（可选）
const lineEl = document.getElementById('line');     // 当前行歌词
const nextEl = document.getElementById('next');     // 下一行歌词
const nudgeEl = document.getElementById('nudge');   // 轻提示
const card = document.getElementById('card');

const btnClose = document.getElementById('btnClose');
const btnPrev = document.getElementById('btnPrev');
const btnToggle = document.getElementById('btnToggle');
const btnNext = document.getElementById('btnNext');

let currentTitle = '';
let currentSubtitle = '';

function safeApi(name) {
  return window.api && typeof window.api[name] === 'function'
    ? window.api[name]
    : null;
}

// 渲染标题：始终用「歌名 - 艺术家」的形式
function renderTitle() {
  if (!titleEl) return;

  const t = (currentTitle || '').trim();
  const s = (currentSubtitle || '').trim();
  const text = t ? (s ? `${t} - ${s}` : t) : '';

  if (!text) {
    titleEl.textContent = '';
    titleEl.style.display = 'none';
  } else {
    titleEl.textContent = text;
    titleEl.style.display = 'block';
  }
}

// ====== 接收主进程 / 主窗口发来的 overlay:update ======

safeApi('onOverlay')?.((payload) => {
  if (!payload) return;

  // 兼容：只带 show 的（未来如果你从 main.js 用 overlay:update 控制工具栏）
  if (payload.mode === undefined && payload.show !== undefined) {
    card.classList.toggle('show-toolbar', !!payload.show);
    return;
  }

  const mode = payload.mode;

  if (mode === 'title') {
    // 只更新曲目信息
    currentTitle = payload.title || '';
    currentSubtitle = payload.subtitle || '';
    renderTitle();

    lineEl.textContent = '';
    nextEl.textContent = '';

  } else if (mode === 'sync') {
    // 同步当前行/下一行，同时可顺带更新标题
    if (payload.title !== undefined) currentTitle = payload.title || '';
    if (payload.subtitle !== undefined) currentSubtitle = payload.subtitle || '';
    renderTitle();

    lineEl.textContent = payload.line || '';
    nextEl.textContent = payload.next || '';

  } else if (mode === 'plain') {
    // 纯文本模式（无时间轴 lrc）
    if (payload.title !== undefined) currentTitle = payload.title || '';
    if (payload.subtitle !== undefined) currentSubtitle = payload.subtitle || '';
    renderTitle();

    const first = (payload.text || '')
      .split(/\r?\n/)
      .find((s) => s.trim().length) || '';
    lineEl.textContent = first;
    nextEl.textContent = '';

  } else if (mode === 'nudge') {
    // 短暂提示
    if (!nudgeEl) return;
    nudgeEl.textContent = payload.text || '';
    nudgeEl.style.display = 'block';
    setTimeout(() => {
      nudgeEl.style.display = 'none';
    }, 1500);

  } else if (mode === 'none') {
    // 清空
    lineEl.textContent = '';
    nextEl.textContent = '';
  }
});

// ====== 悬浮交互：鼠标移入变“可点”，移出恢复点穿 ======

let leaveTimer = null;

card.addEventListener('mouseenter', () => {
  if (leaveTimer) {
    clearTimeout(leaveTimer);
    leaveTimer = null;
  }

  // 允许鼠标事件命中当前窗口
  safeApi('overlaySetInteract')?.(true);
  // 如果你有 overlayIgnoreMouse(true) 的旧逻辑，这里等价于 false

  card.classList.add('show-toolbar');
});

card.addEventListener('mouseleave', () => {
  if (leaveTimer) clearTimeout(leaveTimer);
  leaveTimer = setTimeout(() => {
    card.classList.remove('show-toolbar');
    // 恢复点穿（只看歌词不点的时候）
    safeApi('overlaySetInteract')?.(false);
  }, 800);
});

// ====== 顶部按钮 ======

// 关闭悬浮歌词
btnClose?.addEventListener('click', (e) => {
  e.stopPropagation();
  safeApi('overlayHide')?.();
});

// 上一首
btnPrev?.addEventListener('click', (e) => {
  e.stopPropagation();
//   console.log('点击上一首');
  safeApi('playerCommand')?.('prev');
});

// 播放 / 暂停
btnToggle?.addEventListener('click', (e) => {
//   console.log('点击play');
  e.stopPropagation();
  safeApi('playerCommand')?.('toggle');
});

// 下一首
btnNext?.addEventListener('click', (e) => {
//   console.log('点击next');
  e.stopPropagation();
  safeApi('playerCommand')?.('next');
});
