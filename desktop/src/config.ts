/** Настройки десктоп-версии: userData/config.json (адрес сервера, порт встроенного сервера, окно игры). */
import fs from "node:fs";
import path from "node:path";

export interface WindowState {
  x?: number;
  y?: number;
  width: number;
  height: number;
  maximized: boolean;
  /** Игра была во весь экран (F11, Alt+Enter или «Экран» в настройках) — так и откроется. */
  fullscreen?: boolean;
}

export interface DesktopConfig {
  /** Последний адрес удалённого сервера (нормализованный, http(s)://хост:порт/). */
  server?: string;
  /** Порт встроенного сервера: тот же порт → тот же origin → настройки клиента в localStorage сохраняются. */
  port?: number;
  window?: WindowState;
}

export class ConfigStore {
  data: DesktopConfig = {};

  constructor(readonly file: string) {
    try {
      const raw = JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
      if (raw && typeof raw === "object") this.data = sanitize(raw as Record<string, unknown>);
    } catch {
      // нет файла или битый JSON — начинаем с пустых настроек
    }
  }

  update(patch: Partial<DesktopConfig>): void {
    this.data = { ...this.data, ...patch };
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = `${this.file}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
      fs.renameSync(tmp, this.file);
    } catch {
      // настройки не критичны: при ошибке записи игра продолжает работать
    }
  }
}

const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? Math.round(v) : undefined);

function sanitize(raw: Record<string, unknown>): DesktopConfig {
  const out: DesktopConfig = {};
  if (typeof raw.server === "string" && raw.server.length < 512) out.server = raw.server;
  const port = num(raw.port);
  if (port && port > 1024 && port < 65536) out.port = port;
  const w = raw.window as Record<string, unknown> | undefined;
  if (w && typeof w === "object") {
    const width = num(w.width);
    const height = num(w.height);
    if (width && height) out.window = { x: num(w.x), y: num(w.y), width, height, maximized: w.maximized === true, fullscreen: w.fullscreen === true };
  }
  return out;
}
