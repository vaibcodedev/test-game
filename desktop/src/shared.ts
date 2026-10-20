/** Общее для main, preload и лаунчера: типы IPC и имена каналов. */

export type Stage = "port" | "spawn" | "world" | "connect" | "client" | "done";

export interface LauncherStatus {
  stage: Stage;
  text: string;
  /** 0…1 */
  progress: number;
}

export interface LauncherInfo {
  version: string;
  electron: string;
  /** Последний адрес удалённого сервера из config.json. */
  server: string;
  logsDir: string;
  serverLog: string;
  smoke: boolean;
}

export type ActionResult = { ok: true } | { ok: false; title: string; message: string; log?: string };

export type WindowAction = "minimize" | "close";

/** API, которое preload выставляет в window.launcher. */
export interface LauncherApi {
  info(): Promise<LauncherInfo>;
  play(): Promise<ActionResult>;
  connect(address: string): Promise<ActionResult>;
  openLogs(): Promise<void>;
  openServerLog(): Promise<void>;
  windowAction(action: WindowAction): Promise<void>;
  onStatus(cb: (status: LauncherStatus) => void): () => void;
}

export const IPC = {
  info: "launcher:info",
  play: "launcher:play",
  connect: "launcher:connect",
  openLogs: "launcher:open-logs",
  openServerLog: "launcher:open-server-log",
  window: "launcher:window",
  status: "launcher:status",
} as const;
