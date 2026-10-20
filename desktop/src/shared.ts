/** Общее для main, preload и лаунчера: типы IPC и имена каналов. */

export type Stage = "port" | "spawn" | "world" | "connect" | "client" | "import" | "done";

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
  /** SMOKE_CONNECT: адрес, к которому smoke-проверка подключается вместо «Играть». */
  smokeConnect: string;
}

export type ActionResult = { ok: true } | { ok: false; title: string; message: string; log?: string };

/** «Перенести мой аккаунт из базы проекта». */
export type ImportResult =
  | { status: "done"; title: string; message: string }
  | { status: "cancelled" }
  | { status: "error"; title: string; message: string; log?: string };

export type WindowAction = "minimize" | "close";

/** API, которое preload выставляет в window.launcher. */
export interface LauncherApi {
  info(): Promise<LauncherInfo>;
  play(): Promise<ActionResult>;
  connect(address: string): Promise<ActionResult>;
  importDb(): Promise<ImportResult>;
  openLogs(): Promise<void>;
  openServerLog(): Promise<void>;
  windowAction(action: WindowAction): Promise<void>;
  onStatus(cb: (status: LauncherStatus) => void): () => void;
}

export const IPC = {
  info: "launcher:info",
  play: "launcher:play",
  connect: "launcher:connect",
  importDb: "launcher:import-db",
  openLogs: "launcher:open-logs",
  openServerLog: "launcher:open-server-log",
  window: "launcher:window",
  status: "launcher:status",
} as const;
