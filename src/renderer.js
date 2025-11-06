const $ = sel => document.querySelector(sel);
const albumsEl = $('#albums');
const tracksEl = $('#tracks');
const rootPathEl = $('#rootPath');
const pickBtn = $('#pickRoot');
const player = $('#player');
const nowLyric = $('#nowLyric');
const toggleOverlayBtn = $('#toggleOverlay');
const lockOverlayCk = $('#lockOverlay');

let ROOT = null;
let ALBUMS = [];
let currentAlbum = null;
let currentTrack = null;
let currentIndex = -1;     // 当前曲目索引（用于自动下一首）
let currentAlbumIndex = -1; // 当前正在查看的专辑索引
let playingAlbumIndex = -1;      // 当前真正正在播放的专辑（用于高亮判断）
let lrcList = [];
let lrcHint = -1;          // 关键：初始化为 -1，保证开头第一句就能显示
let timerId = 0;
let lastTime = 0;

async function pickRoot(){
  const dir = await window.api.chooseRootDir();
  if (!dir) return;
  ROOT = dir;
  rootPathEl.textContent = dir;
  // 记住选择
  try { await window.api.prefSet({ lastRootDir: ROOT }); } catch {}
  await loadAlbums();
}

// 初始化 & 自动加载上次的目录
document.addEventListener('DOMContentLoaded', async () => {
  try {
    const pref = await window.api.prefGet();
    if (pref?.lastRootDir) {
      ROOT = pref.lastRootDir;
      rootPathEl.textContent = ROOT;      // 同步显示路径
      await loadAlbums();
    }
  } catch {}
  // 你原有的其它初始化逻辑……
});

async function loadAlbums(){
  albumsEl.innerHTML = '<div style="opacity:.65">扫描中…</div>';
  tracksEl.classList.add('hidden');
  // 重置当前状态，避免旧高亮残留
  currentAlbum = null;
  currentAlbumIndex = -1;
  currentTrack = null;
  currentIndex = -1;
  playingAlbumIndex = -1;
  ALBUMS = await window.api.scanAlbums(ROOT);
  await renderAlbums(); // 渲染需要异步取 file:// URL
}

async function renderAlbums(){
  if (!ALBUMS?.length) {
    albumsEl.innerHTML = '<div style="opacity:.65">没有找到包含音频的子文件夹。</div>';
    return;
  }

  // 批量把封面本地路径转为 file:// URL（没有封面的为 null）
  const coverUrls = await Promise.all(
    ALBUMS.map(a => a.cover ? window.api.fileUrl(a.cover) : Promise.resolve(null))
  );

  const html = ALBUMS.map((a,i)=>{
    const url = coverUrls[i];
    // 封面：有就显示图片；没有就显示占位
    const coverHtml = url
      ? `<img src="${url}" alt="cover" style="width:72px;height:72px;object-fit:cover;border-radius:10px;display:block;">`
      : `<div style="width:72px;height:72px;border-radius:10px;background:linear-gradient(135deg, rgba(255,255,255,.08), rgba(255,255,255,.02));display:flex;align-items:center;justify-content:center;font-size:12px;opacity:.6;">No Cover</div>`;

    return `<div class="album-card" data-i="${i}" style="display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:12px;background:rgba(255,255,255,.04);cursor:pointer;">
      <div class="album-cover" style="flex:0 0 auto;">${coverHtml}</div>
      <div class="album-meta-wrap" style="min-width:0;display:flex;flex-direction:column;gap:4px;">
        <div class="album-title" style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${escapeHtml(a.name)}">${escapeHtml(a.name)}</div>
        <div class="album-meta" style="opacity:.7;font-size:12px;">${a.count} 首歌曲</div>
      </div>
    </div>`;
  }).join('');

  albumsEl.innerHTML = html;

  albumsEl.querySelectorAll('.album-card').forEach(card => {
    card.addEventListener('click', () => {
      const i = parseInt(card.dataset.i,10);
      openAlbum(i);
    });
  });
}

function openAlbum(i){
  currentAlbum = ALBUMS[i];
  currentAlbumIndex = i;

  const items = currentAlbum.tracks.map((t,idx)=>
    `<div class="track" data-i="${idx}">
       <span class="playico" aria-hidden="true"></span>
       <div class="title">${escapeHtml(t.title || 'Untitled')}</div>
       <div class="artist" style="color:#9aa0aa">${escapeHtml(t.artist||'')}</div>
       <div class="time" title="${escapeHtml(t.codec||'')}">${formatDur(t.duration)}</div>
     </div>`).join('');
  tracksEl.innerHTML = `<h3 style="margin:8px 4px 10px">${escapeHtml(currentAlbum.name)}</h3>${items}`;
  tracksEl.classList.remove('hidden');
  tracksEl.querySelectorAll('.track').forEach(el => el.addEventListener('click', () => playTrack(parseInt(el.dataset.i,10))));
  // 打开专辑后，根据 currentIndex 刷新一次“正在播放”的标记
  applyPlayingMarker();
}

async function playTrack(idx){
  currentIndex = idx;
  currentTrack = currentAlbum.tracks[idx];
  // 记录：当前播放属于哪一个专辑
  playingAlbumIndex = currentAlbumIndex;

  // 简单标注可能不被 Chromium 支持的编解码（典型：ALAC）
  const codec = (currentTrack.codec||'').toLowerCase();
  if (codec.includes('alac')) {
    nowLyric.textContent = '此音频为 ALAC（Apple Lossless），Chromium 可能不支持直接播放。请先转为 AAC/MP3，或用 ffmpeg 转码。';
  }
  const url = await window.api.getPlayablePath?.(currentTrack.path, codec)
             || await window.api.fileUrl(currentTrack.path);
  player.src = url;
  try { await player.play(); } catch (e) { console.warn('play() failed', e); }

  // 歌词预备：确保“第一句”不会被跳过
  const rawLrc = currentTrack.lrcSidecar || currentTrack.lrcEmbedded || '';
  lrcList = rawLrc && rawLrc.includes('[') ? window.LRC.parse(rawLrc) : [];
  lrcHint = -1;                     // 关键：重置为 -1
  nowLyric.textContent = '';        // 底栏先清空

  // 新歌开头先闪歌名（+歌手）到悬浮窗 ~2s
  window.api.sendOverlay({
    mode: 'title',
    title: currentTrack.title || 'Untitled',
    subtitle: currentTrack.artist || ''
  });

  // 立即跑一次 tick，保证如果第一句在 0:00 能立刻显示
  tick();
  clearInterval(timerId);
  timerId = setInterval(tick, 120); // 120ms 轮询更抗节流
  // 切歌后立刻刷新“正在播放”的标记
  applyPlayingMarker();
}

function tick(){
  const sec = player.currentTime || 0;
  lastTime = sec;  // 记录最后一次时间，用于调试或其它策略
  if (lrcList.length){
    const i = window.LRC.locate(lrcList, sec, lrcHint < 0 ? 0 : lrcHint);
    if (i !== -1 && i !== lrcHint){
      lrcHint = i;
      const line = lrcList[i].text;
      const next = lrcList[i+1]?.text || '';
      nowLyric.textContent = line;
      window.api.sendOverlay({ mode:'sync', line, next });
    }
  } else if (currentTrack?.lrcEmbedded) {
    const first = currentTrack.lrcEmbedded.split(/\r?\n/).find(s=>s.trim().length);
    nowLyric.textContent = first || '';
    window.api.sendOverlay({ mode:'plain', text: currentTrack.lrcEmbedded });
  } else {
    nowLyric.textContent = '';
    window.api.sendOverlay({ mode:'none' });
  }
}

// —— 自动播放下一首（同专辑内，播完循环到第一首） ——
player.addEventListener('ended', () => {
  if (!currentAlbum || currentIndex < 0) return;
  const next = (currentIndex + 1) % currentAlbum.tracks.length;
  playTrack(next);
});


// —— 给当前曲目行加 .playing 标记（只影响当前专辑面板） ——
function applyPlayingMarker(){
  if (!tracksEl || currentAlbumIndex < 0) return;
  const rows = tracksEl.querySelectorAll('.track');
  // 如果当前面板打开的专辑不是正在播放的专辑，清除所有高亮
  if (currentAlbumIndex !== playingAlbumIndex || currentIndex < 0) {
    rows.forEach(el => el.classList.remove('playing'));
    return;
  }
  rows.forEach((el, idx) => {
    if (idx === currentIndex) el.classList.add('playing');
    else el.classList.remove('playing');
  });
}

// —— 处理拖动进度条（回到开头 / 中途跳转）——
player.addEventListener('seeked', () => {
  const t = player.currentTime || 0;
  if (!lrcList.length) return;
  // 先清掉标题 hold，允许马上显示歌词
  window.api.sendOverlay({ mode: 'hold-clear' });

  if (t < 1.0) {
    // 视作回到开头：重置歌词索引，重发标题
    lrcHint = -1;
    nowLyric.textContent = '';
    window.api.sendOverlay({
      mode: 'title',
      title: currentTrack?.title || 'Untitled',
      subtitle: currentTrack?.artist || ''
    });
    tick(); // 让 0:00 的第一句能立即显示（若没有 hold）
  } else {
    // 中途跳转：从头定位，并立刻把这句推到 UI（不要等下次 tick）
    const i = window.LRC.locate(lrcList, t, 0);
    lrcHint = i; // 可能是 -1（跳到时间轴第一句之前）
    if (i >= 0) {
      const line = lrcList[i].text;
      const next = lrcList[i+1]?.text || '';
      nowLyric.textContent = line;
      window.api.sendOverlay({ mode: 'sync', line, next });
    } else {
      // 跳到第一句之前：清空当前显示
      nowLyric.textContent = '';
      window.api.sendOverlay({ mode: 'sync', line: '', next: lrcList[0]?.text || '' });
    }
    // 维持定时驱动（setInterval 会继续推进）
  }
});

function escapeHtml(s){
  return (s||'').replace(/[&<>"']/g, c=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  })[c]);
}
function formatDur(d){
  if (!d) return '--:--';
  const m = Math.floor(d/60), s = Math.floor(d%60);
  return `${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
}

pickBtn.addEventListener('click', pickRoot);

toggleOverlayBtn.addEventListener('click', async () => {
  const visible = await window.api.overlayToggle(); // 真正 show/hide 悬浮窗
  // 可选：根据 visible 更新按钮文案/图标
});

lockOverlayCk.addEventListener('change', () => {
  window.api.overlayIgnoreMouse(lockOverlayCk.checked);
});
