/** Встроенный сервер: server/src/index.ts, собранный в один файл, в utilityProcess Electron на 127.0.0.1. */
import { utilityProcess, type UtilityProcess } from "electron";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";

export interface ServerPaths {
  /** Бандл сервера (server.mjs). */
  entry: string;
  /** Рабочая папка процесса: в ней лежит dist/ с собранным клиентом (index.ts раздаёт path.resolve("dist")). */
  cwd: string;
  /** База SQLite (DB_PATH). */
  db: string;
  /** Журнал сервера (stdout + stderr). */
  log: string;
}

/** Ошибка запуска: message — для человека, detail — хвост журнала. */
export class ServerStartError extends Error {
  constructor(
    message: string,
    readonly detail = "",
  ) {
    super(message);
  }
}

export interface ServerExitInfo {
  /** Остановка запрошена нами (выход из игры). */
  expected: boolean;
  /** Сервер успел подняться. */
  wasReady: boolean;
}

const READY_TIMEOUT_MS = 60_000;
const HEALTH_TIMEOUT_MS = 10_000;
const TAIL_LINES = 60;

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class EmbeddedServer extends EventEmitter {
  port = 0;
  ready = false;
  private proc: UtilityProcess | null = null;
  private stopping: Promise<number | null> | null = null;
  private tail: string[] = [];
  private partial = "";
  private logFd: number | null = null;

  constructor(private readonly paths: ServerPaths) {
    super();
  }

  get running(): boolean {
    return this.proc !== null;
  }

  /** Запуск и ожидание готовности: сообщение «ready» от процесса (мир создан) + ответ /health. */
  async start(port: number, stage: (text: string, progress: number) => void): Promise<void> {
    if (this.proc) throw new ServerStartError("Сервер уже запущен.");
    const { entry, cwd, db } = this.paths;
    if (!fs.existsSync(entry)) throw new ServerStartError(`Не найден файл сервера: ${entry}`, "Пересоберите десктоп-версию: npm run desktop:bundle.");
    const dist = path.join(cwd, "dist");
    if (!fs.existsSync(path.join(dist, "index.html"))) throw new ServerStartError(`Не найден собранный клиент: ${dist}`, "Соберите клиент: npm run build.");

    this.port = port;
    this.ready = false;
    this.stopping = null;
    this.tail = [];
    this.partial = "";
    this.write(`\n---- ${new Date().toISOString()} запуск: 127.0.0.1:${port}, база ${db}\n`);

    const proc = utilityProcess.fork(entry, [], {
      serviceName: "Ashen Reach Server",
      stdio: "pipe",
      cwd,
      execArgv: ["--enable-source-maps"],
      env: { ...baseEnv(), PORT: String(port), HOST: "127.0.0.1", DB_PATH: db, NODE_ENV: "production" },
    });
    this.proc = proc;
    proc.stdout?.on("data", (b: Buffer) => this.output(b));
    proc.stderr?.on("data", (b: Buffer) => this.output(b));
    const exited = new Promise<number>((resolve) => {
      proc.once("exit", (code) => {
        const wasReady = this.ready;
        this.proc = null;
        this.ready = false;
        this.write(`---- ${new Date().toISOString()} сервер завершён, код ${code}\n`);
        this.emit("exit", code, { expected: this.stopping !== null, wasReady } satisfies ServerExitInfo);
        resolve(code);
      });
    });
    const readyMsg = new Promise<void>((resolve) => {
      proc.on("message", (m: unknown) => {
        if ((m as { type?: string } | null)?.type === "ready") resolve();
      });
    });

    // ожидание с плавным индикатором
    const t0 = Date.now();
    stage("Создание мира…", 0.3);
    const creep = setInterval(() => stage("Создание мира…", 0.3 + 0.35 * (1 - Math.exp(-(Date.now() - t0) / 5000))), 300);
    let outcome: "ready" | "timeout" | number;
    try {
      outcome = await Promise.race([readyMsg.then(() => "ready" as const), exited, delay(READY_TIMEOUT_MS).then(() => "timeout" as const)]);
    } finally {
      clearInterval(creep);
    }
    if (outcome === "timeout") {
      proc.kill();
      throw new ServerStartError(`Сервер не поднялся за ${READY_TIMEOUT_MS / 1000} с.`, this.lastLines(6));
    }
    if (typeof outcome === "number") throw new ServerStartError(`Сервер завершился при запуске (код ${outcome}).`, this.lastError());

    stage("Проверка соединения…", 0.7);
    const deadline = Date.now() + HEALTH_TIMEOUT_MS;
    for (;;) {
      if (!this.proc) throw new ServerStartError("Сервер завершился сразу после запуска.", this.lastError());
      try {
        const res = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(1500) });
        if (res.ok) break;
      } catch {
        // ещё не слушает — повторяем
      }
      if (Date.now() > deadline) {
        proc.kill();
        throw new ServerStartError(`Сервер запущен, но не отвечает на http://127.0.0.1:${port}/health.`, this.lastLines(6));
      }
      await delay(200);
    }
    this.ready = true;
  }

  /**
   * Штатная остановка: процесс сохраняет героев и закрывает базу (см. desktop/src/server-entry.ts).
   * Если сервер не готов или не ответил за timeoutMs — принудительное завершение. Возвращает код выхода.
   */
  stop(timeoutMs = 15_000): Promise<number | null> {
    const proc = this.proc;
    if (!proc) return Promise.resolve(null);
    if (this.stopping) return this.stopping;
    this.stopping = new Promise<number | null>((resolve) => {
      const timer = setTimeout(() => {
        this.write(`---- ${new Date().toISOString()} сервер не остановился за ${timeoutMs / 1000} с — принудительно\n`);
        proc.kill();
      }, timeoutMs);
      proc.once("exit", (code) => {
        clearTimeout(timer);
        resolve(code);
      });
      if (this.ready) {
        this.write(`---- ${new Date().toISOString()} остановка: сохранение героев\n`);
        proc.postMessage({ type: "shutdown" });
      } else {
        proc.kill();
      }
    });
    return this.stopping;
  }

  /** Последние строки журнала (для диалогов и smoke). */
  lastLines(n: number): string {
    return this.tail.slice(-n).join("\n");
  }

  /** Сообщение исключения из журнала («Error: …», «TypeError: …») с подсказкой; иначе хвост журнала. */
  lastError(): string {
    const t = this.tail;
    let line = "";
    for (let i = t.length - 1; i >= 0 && !line; i--) if (/^\s*(Uncaught\s+)?[A-Za-z]*Error\b[^:]*:/.test(t[i])) line = t[i].trim();
    for (let i = t.length - 1; i >= 0 && !line; i--) if (/ошибк|EADDRINUSE|EACCES|EPERM|SQLITE/i.test(t[i])) line = t[i].trim();
    if (!line) return this.lastLines(3);
    const all = t.join("\n");
    const hint = /file is not a database|SQLITE_CORRUPT|malformed/i.test(all)
      ? `Файл базы повреждён: ${this.paths.db}. Переименуйте его — при запуске создастся новая база.`
      : /database is locked|SQLITE_BUSY/i.test(all)
        ? "База занята другим процессом — возможно, сервер уже запущен."
        : /EADDRINUSE/.test(all)
          ? "Порт занят другой программой."
          : /EACCES|EPERM/.test(all)
            ? "Нет доступа к файлу или порту."
            : "";
    return hint ? `${line}\n${hint}` : line;
  }

  closeLog(): void {
    if (this.logFd === null) return;
    try {
      fs.closeSync(this.logFd);
    } catch {
      // уже закрыт
    }
    this.logFd = null;
  }

  private output(chunk: Buffer): void {
    const text = chunk.toString("utf8");
    this.write(text);
    const lines = (this.partial + text).split(/\r?\n/);
    this.partial = lines.pop() ?? "";
    for (const line of lines) if (line.trim()) this.tail.push(line);
    if (this.tail.length > TAIL_LINES) this.tail.splice(0, this.tail.length - TAIL_LINES);
  }

  private write(text: string): void {
    try {
      if (this.logFd === null) {
        fs.mkdirSync(path.dirname(this.paths.log), { recursive: true });
        this.logFd = fs.openSync(this.paths.log, "a");
      }
      fs.writeSync(this.logFd, text);
    } catch {
      // журнал недоступен — сервер всё равно работает
    }
  }
}

/** Окружение процесса сервера: как у приложения, но без флага запуска Electron «как Node». */
function baseEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined && k !== "ELECTRON_RUN_AS_NODE") env[k] = v;
  return env;
}

function isFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.unref();
    s.once("error", () => resolve(false));
    s.listen({ port, host: "127.0.0.1", exclusive: true }, () => s.close(() => resolve(true)));
  });
}

function anyFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.unref();
    s.once("error", reject);
    s.listen({ port: 0, host: "127.0.0.1", exclusive: true }, () => {
      const addr = s.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      s.close(() => (port ? resolve(port) : reject(new Error("no port"))));
    });
  });
}

/**
 * Свободный порт на 127.0.0.1. Сначала прежний (тот же origin → localStorage клиента не теряется),
 * затем 10 портов от стандартного, затем любой свободный.
 */
export async function pickPort(preferred: number | undefined, base: number): Promise<number> {
  const candidates = [preferred, ...Array.from({ length: 10 }, (_, i) => base + i)].filter(
    (p, i, arr): p is number => typeof p === "number" && p > 1024 && p < 65536 && arr.indexOf(p) === i,
  );
  for (const p of candidates) if (await isFree(p)) return p;
  return anyFreePort();
}
