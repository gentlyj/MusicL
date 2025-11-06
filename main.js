const { app, BrowserWindow, dialog, ipcMain, globalShortcut, screen } = require('electron');
const path = require('path');
const fs = require('fs-extra');
const { pathToFileURL } = require('url');
const mm = require('music-metadata');
const { powerSaveBlocker } = require('electron');
let psbId = null;

let mainWin = null;
let overlayWin = null;
let splashWin  = null;

// ----- 简单首选项：保存在 userData/settings.json -----
function settingsPath() {
  return path.join(app.getPath('userData'), 'settings.json');
}
async function readSettings() {
  try { return await fs.readJSON(settingsPath()); } catch { return {}; }
}
async function writeSettings(patch) {
  const cur = await readSettings();
  const next = { ...cur, ...patch };
  await fs.outputJSON(settingsPath(), next, { spaces: 2 });
  return next;
}


function createMain() {
  mainWin = new BrowserWindow({
    width: 1100,
    height: 720,
    show: false,
    icon: path.join(__dirname, 'res', 'icon_v2.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false
    }
  });
  mainWin.loadFile(path.join(__dirname, 'src', 'index.html'));
//   mainWin.webContents.openDevTools({ mode: 'detach' });

  // 主窗就绪后显示，并关闭闪屏
  mainWin.once('ready-to-show', () => {
    if (splashWin && !splashWin.isDestroyed()) splashWin.close();
    splashWin = null;
    mainWin.show();
  });

  // 关主窗时，把悬浮窗也销毁（避免留后台）
  mainWin.on('closed', () => {
    if (overlayWin && !overlayWin.isDestroyed()) {
      try { overlayWin.destroy(); } catch {}
    }
    overlayWin = null;
    mainWin = null;
  });
}

function createSplash() {
  const { screen, BrowserWindow } = require('electron');
  const primary = screen.getPrimaryDisplay();
  splashWin = new BrowserWindow({
    width: 520,
    height: 220,
    x: Math.round(primary.workArea.x + (primary.workArea.width - 520) / 2),
    y: Math.round(primary.workArea.y + (primary.workArea.height - 220) / 2),
    frame: false,
    transparent: true,
    resizable: false,
    movable: true,
    alwaysOnTop: true,             // 让它在最上层，主窗 ready 后我们会关闭它
    skipTaskbar: true,
    show: true,
    webPreferences: { sandbox: true }  // 闪屏不用 Node 能力，越轻越好
  });
  splashWin.loadFile(path.join(__dirname, 'src', 'splash.html'));
}

function createOverlay() {

  const primary = screen.getPrimaryDisplay();
  const W = 900, H = 140, M = 10; // 宽、高、底部边距
  overlayWin = new BrowserWindow({
    width: W,
    height: H,
    x: Math.round(primary.workArea.x + (primary.workArea.width - W) / 2),
    y: primary.workArea.y + primary.workArea.height - H - M, // 底边缘居中
    // parent: mainWin,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: true,
    focusable: false,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false
    }
  });
  overlayWin.loadFile(path.join(__dirname, 'src', 'overlay.html'));
//   overlayWin.webContents.openDevTools({ mode: 'detach' });
  overlayWin.setIgnoreMouseEvents(true, { forward: true });

  overlayWin.setSkipTaskbar(true);
  overlayWin.setAlwaysOnTop(true, 'screen-saver');  // 在所有层级之上但不夺焦点
  overlayWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  overlayWin.on('show', () => overlayWin.setSkipTaskbar(true));
  overlayWin.on('restore', () => overlayWin.setSkipTaskbar(true));
}


// 让被遮挡/最小化的渲染进程不被节流
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('disable-background-timer-throttling');

// 主窗最小化时，保持 overlay 仍可见且不抢焦点
function bindMainWindowEvents() {
  if (!mainWin) return;
  mainWin.on('minimize', () => {
    if (overlayWin && !overlayWin.isDestroyed()) {
      try {
        overlayWin.showInactive();      // 显示但不抢焦点
        overlayWin.setSkipTaskbar(true);
      } catch {}
    }
  });
}

app.whenReady().then(() => {
  createSplash();
  createMain();
  createOverlay();
  bindMainWindowEvents();

  globalShortcut.register('CommandOrControl+Alt+L', () => {
    if (!overlayWin) return;
    if (overlayWin.isVisible()) overlayWin.hide();
    else overlayWin.show();
  });

  // 新增：切换悬浮窗交互（点穿<->可点），并让工具栏可见几秒
  globalShortcut.register('CommandOrControl+Alt+O', () => {
    if (!overlayWin) return;
    const nowIgnore = overlayWin.isFocusable() === false; // 我们用 ignoreMouseEvents 来判定
    const next = !nowIgnore;
    overlayWin.setIgnoreMouseEvents(next, { forward: true });
    overlayWin.webContents.send('overlay:toolbar', { show: true });
    // 3 秒后自动恢复点穿（可按自己喜好调整/去掉）
    if (!next) {
      setTimeout(() => {
        overlayWin.setIgnoreMouseEvents(true, { forward: true });
        overlayWin.webContents.send('overlay:toolbar', { show: false });
      }, 3000);
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMain();
      createOverlay();
    }
  });
});

app.setName('MusicL');
app.setAppUserModelId('com.ifading.lyrics');


app.on('window-all-closed', () => {
  if (psbId !== null) { try { powerSaveBlocker.stop(psbId); } catch {} }
  if (process.platform !== 'darwin') app.quit();
});

// 应用退出前兜底销毁悬浮窗（防多实例/异常状态）
app.on('before-quit', () => {
  if (overlayWin && !overlayWin.isDestroyed()) {
    try { overlayWin.destroy(); } catch {}
  }
});

// ----- 首选项 IPC -----
ipcMain.handle('pref:get', async () => {
  return readSettings();
});
ipcMain.handle('pref:set', async (_evt, patch) => {
  return writeSettings(patch || {});
});


ipcMain.handle('picker:chooseRootDir', async () => {
  const ret = await dialog.showOpenDialog({
    properties: ['openDirectory']
  });
  if (ret.canceled || !ret.filePaths?.[0]) return null;
  return ret.filePaths[0];
});

const AUDIO_EXT = new Set(['.m4a', '.mp3', '.flac', '.wav', '.aac']);

ipcMain.handle('fs:scanAlbums', async (_evt, rootDir) => {
  try {
    if (!rootDir || !(await fs.pathExists(rootDir))) return [];
    const entries = await fs.readdir(rootDir, { withFileTypes: true });
    const albums = [];
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const dir = path.join(rootDir, e.name);
      let files;
      try { files = await fs.readdir(dir); } catch { continue; }
      const tracks = [];
      for (const fname of files) {
        const ext = path.extname(fname).toLowerCase();
        if (!AUDIO_EXT.has(ext)) continue;
        const fpath = path.join(dir, fname);
        try {
          const meta = await mm.parseFile(fpath);
          const title = meta.common?.title || path.parse(fname).name;
          const artist = meta.common?.artist || '';
          const duration = meta.format?.duration || 0;
          const lrcPath = fpath.replace(/\.[^.]+$/, '.lrc');
          const lrcFromSidecar = (await fs.pathExists(lrcPath)) ? await fs.readFile(lrcPath, 'utf8') : null;
          let embedded = '';
          if (meta.common?.lyrics && meta.common.lyrics.length) embedded = meta.common.lyrics.join('\n');
          if (!embedded && meta.native?.mp4) {
            const n = meta.native.mp4.find(t => t?.name === '©lyr' && typeof t.value === 'string');
            if (n) embedded = n.value;
          }
          tracks.push({ path: fpath, title, artist, duration, codec: meta.format?.codec || '', lrcSidecar: lrcFromSidecar, lrcEmbedded: embedded });
        } catch (err) {
          console.warn('parse error', fpath, err?.message);
        }
      }
      if (tracks.length) {
        // albums.push({ name: e.name, dir, count: tracks.length, tracks });
        const coverPath = path.join(dir, 'cover.jpg');
        const cover = (await fs.pathExists(coverPath)) ? coverPath : null;
        albums.push({ name: e.name, dir, count: tracks.length, cover, tracks });
      }
    }
    albums.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'));
    return albums;
  } catch (e) {
    console.error(e);
    return [];
  }
});

ipcMain.handle('path:fileUrl', async (_evt, filePath) => {
  return pathToFileURL(filePath).href;
});

ipcMain.on('overlay:update', (_evt, payload) => {
  if (overlayWin) overlayWin.webContents.send('overlay:update', payload);
});

// —— 进入/退出“可交互模式”（允许点击&拖动，并临时可获得焦点）
ipcMain.removeHandler('overlay:setInteract');
ipcMain.handle('overlay:setInteract', (_evt, enabled) => {
  if (!overlayWin) return;
  const en = !!enabled;
  overlayWin.setIgnoreMouseEvents(!en, { forward: true });
  overlayWin.setFocusable(false);
//   if (en) { try { overlayWin.focus(); } catch {} }
});

ipcMain.removeHandler('overlay:hide');
ipcMain.handle('overlay:hide', () => {
  if (!overlayWin) return false;
  try {
    overlayWin.setIgnoreMouseEvents(true, { forward: true }); // 恢复点穿
    overlayWin.setFocusable(false);
    overlayWin.hide();                                        // 无条件隐藏
    return true;
  } catch { return false; }
});

// 显示/隐藏悬浮窗
ipcMain.removeHandler('overlay:setVisible');
ipcMain.handle('overlay:setVisible', (_evt, visible) => {
  if (!overlayWin) return false;
  if (visible) overlayWin.show(); else overlayWin.hide();
  return overlayWin.isVisible();
});

// 也给一个 toggle 方便按钮直接调用
ipcMain.removeHandler('overlay:toggle');
ipcMain.handle('overlay:toggle', () => {
  if (!overlayWin) return false;
  if (overlayWin.isVisible()) overlayWin.hide(); else overlayWin.showInactive();
  return overlayWin.isVisible();
});

// —— 点穿开关（供复选框/老代码使用）
ipcMain.removeHandler('overlay:setIgnoreMouse');
ipcMain.handle('overlay:setIgnoreMouse', (_evt, flag) => {
  if (!overlayWin) return false;
  overlayWin.setIgnoreMouseEvents(!!flag, { forward: true });
  // 点穿时一般不需要焦点；关闭点穿时允许获得焦点，便于拖动/点击按钮
  overlayWin.setFocusable(!flag);
  return true;
});
