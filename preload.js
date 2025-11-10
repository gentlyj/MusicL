const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('api', {
  chooseRootDir: () => ipcRenderer.invoke('picker:chooseRootDir'),
  scanAlbums: (rootDir) => ipcRenderer.invoke('fs:scanAlbums', rootDir),
  fileUrl: (p) => ipcRenderer.invoke('path:fileUrl', p),
  sendOverlay: (data) => ipcRenderer.send('overlay:update', data),
  overlayIgnoreMouse: (flag) => ipcRenderer.invoke('overlay:setIgnoreMouse', flag),
  overlaySetInteract: (enabled) => ipcRenderer.invoke('overlay:setInteract', enabled),
  overlayHide: () => ipcRenderer.invoke('overlay:hide'),
  overlaySetVisible: (v) => ipcRenderer.invoke('overlay:setVisible', v),
  overlayToggle: () => ipcRenderer.invoke('overlay:toggle'),
  prefGet: () => ipcRenderer.invoke('pref:get'),
  prefSet: (patch) => ipcRenderer.invoke('pref:set', patch),
  onPlayerPause: (cb) => ipcRenderer.on('player:pause', (_e) => cb?.()),
  onOverlay: (cb) => ipcRenderer.on('overlay:update', (_e, d) => cb?.(d)),
    // 新增：悬浮窗等发播放控制命令 -> 主进程
  playerCommand: (cmd) => ipcRenderer.send('player:command', cmd),
  // 主进程转给主窗口，这里再转给 renderer.js
  onPlayerCommand: (cb) => ipcRenderer.on('player:command', (_e, cmd) => cb?.(cmd))
});