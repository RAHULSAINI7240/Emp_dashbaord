'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('autovynAgent', {
  getConfig: () => ipcRenderer.invoke('agent:get-config'),
  getState: () => ipcRenderer.invoke('agent:get-state'),
  login: (payload) => ipcRenderer.invoke('agent:login', payload),
  logout: () => ipcRenderer.invoke('agent:logout'),
  updateSettings: (payload) => ipcRenderer.invoke('agent:update-settings', payload),
  openWindow: () => ipcRenderer.invoke('agent:open-window')
});
