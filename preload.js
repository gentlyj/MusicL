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
  onOverlay: (cb) => ipcRenderer.on('overlay:update', (_e, d) => cb?.(d))
});