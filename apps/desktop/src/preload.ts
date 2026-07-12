import { contextBridge, ipcRenderer } from 'electron';

export interface DesktopAPI {
  restartBackend: () => Promise<{ ok: boolean }>;
  getVersion: () => Promise<string>;
}

const api: DesktopAPI = {
  restartBackend: () => ipcRenderer.invoke('backend:restart'),
  getVersion: () => ipcRenderer.invoke('app:version'),
};

contextBridge.exposeInMainWorld('desktopAPI', api);
