/** Preload лаунчера (sandbox + contextIsolation): узкое API window.launcher поверх IPC, без доступа к Node. */
import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import { IPC, type LauncherApi, type LauncherStatus, type WindowAction } from "./shared";

const api: LauncherApi = {
  info: () => ipcRenderer.invoke(IPC.info),
  play: () => ipcRenderer.invoke(IPC.play),
  connect: (address: string) => ipcRenderer.invoke(IPC.connect, String(address)),
  importDb: () => ipcRenderer.invoke(IPC.importDb),
  openLogs: () => ipcRenderer.invoke(IPC.openLogs),
  openServerLog: () => ipcRenderer.invoke(IPC.openServerLog),
  windowAction: (action: WindowAction) => ipcRenderer.invoke(IPC.window, action),
  onStatus: (cb: (status: LauncherStatus) => void) => {
    const handler = (_e: IpcRendererEvent, status: LauncherStatus) => cb(status);
    ipcRenderer.on(IPC.status, handler);
    return () => {
      ipcRenderer.removeListener(IPC.status, handler);
    };
  },
};

contextBridge.exposeInMainWorld("launcher", api);
