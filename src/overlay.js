const lineEl = document.getElementById('line');
const nextEl = document.getElementById('next');
const nudgeEl = document.getElementById('nudge');
const card = document.getElementById('card');
const btnClose = document.getElementById('btnClose');

window.api.onOverlay((payload) => {
  if (!payload) return;
  if (payload.mode === 'title'){
    lineEl.textContent = payload.title || '';
    nextEl.textContent = payload.subtitle || '';
  } else if (payload.mode === 'sync'){
    lineEl.textContent = payload.line || '';
    nextEl.textContent = payload.next || '';
  } else if (payload.mode === 'plain'){
    const first = (payload.text||'').split(/\r?\n/).find(s=>s.trim().length) || '';
    lineEl.textContent = first; nextEl.textContent = '';
  } else if (payload.mode === 'nudge'){
    nudgeEl.style.display = 'block';
    setTimeout(()=> nudgeEl.style.display = 'none', 300);
  } else {
    lineEl.textContent = ''; nextEl.textContent = '';
  }
});


// —— 悬浮窗交互模式：鼠标移入时可拖动/可点，移出 2s 后恢复点穿 ——
let leaveTimer = null;
card.addEventListener('mouseenter', () => {
  window.api.overlaySetInteract(true);     // 允许鼠标事件&获得焦点
  card.classList.add('show-toolbar');      // 显示工具栏
  if (leaveTimer) { clearTimeout(leaveTimer); leaveTimer = null; }
});
card.addEventListener('mouseleave', () => {
  if (leaveTimer) clearTimeout(leaveTimer);
  leaveTimer = setTimeout(() => {
    card.classList.remove('show-toolbar');
    window.api.overlaySetInteract(false);  // 恢复点穿
  }, 2000);
});

// 关闭按钮：真正隐藏悬浮窗（通过主进程）
btnClose?.addEventListener('click', () => {
  window.api.overlayHide();
});

// 主进程要求显示/隐藏工具栏（配合 Ctrl+Alt+O）
window.api.onOverlay((payload) => {
  if (payload && payload.mode === undefined && payload.show !== undefined) {
    card.classList.toggle('show-toolbar', !!payload.show);
  }
});
