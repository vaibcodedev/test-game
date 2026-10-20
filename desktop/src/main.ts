/**
 * «Пепельный Предел» — десктоп-версия на Electron (задача 116).
 * Лаунчер → «Играть» (встроенный сервер в utilityProcess на 127.0.0.1) или «Подключиться» (удалённый сервер) → окно игры.
 * Данные: userData = %APPDATA%\AshenReach (game.sqlite, config.json, logs\). Режим проверки: SMOKE=1 или --smoke.
 */
import { app, BrowserWindow, dialog, ipcMain, Menu, net, screen, session, shell } from "electron";
import type { Event as ElectronEvent, Input, IpcMainInvokeEvent, WebContents } from "electron";
import fs from "node:fs";
import path from "node:path";
import { ConfigStore } from "./config";
import { EmbeddedServer, pickPort, ServerStartError, type ServerExitInfo } from "./server";
import { IPC, type ActionResult, type LauncherInfo, type LauncherStatus, type Stage, type WindowAction } from "./shared";

declare const __APP_VERSION__: string;

const TITLE = "Пепельный Предел";
const APP_ID = "com.ashenreach.game";
const DEFAULT_PORT = 47821;
const GAME_SIZE = { width: 1280, height: 800 };
const GAME_MIN = { width: 1024, height: 640 };
const BG = "#120f16";
const LOAD_TIMEOUT_MS = 60_000;
const SMOKE = process.env.SMOKE === "1" || process.argv.includes("--smoke");
const SMOKE_TIMEOUT_MS = 90_000;
/** DevTools: всегда без упаковки; в собранном приложении — только с флагом --devtools (или ASHEN_DEVTOOLS=1), по Ctrl+Shift+I. */
const DEVTOOLS = !app.isPackaged || process.argv.includes("--devtools") || process.env.ASHEN_DEVTOOLS === "1";

// ---------- пути ----------
// Папка данных с ASCII-именем (одна и та же в dev и в установленной версии); smoke — во временной, чтобы не трогать сохранения.
app.setPath("userData", SMOKE ? path.join(app.getPath("temp"), "AshenReach-smoke") : path.join(app.getPath("appData"), "AshenReach"));
const USER_DATA = app.getPath("userData");
const LOGS_DIR = path.join(USER_DATA, "logs");
const MAIN_LOG = path.join(LOGS_DIR, "main.log");
const SERVER_LOG = path.join(LOGS_DIR, "server.log");
const DB_PATH = path.join(USER_DATA, "game.sqlite");
/** Без упаковки main.cjs лежит в desktop/out/app — корень проекта тремя уровнями выше. */
const PROJECT_ROOT = path.resolve(__dirname, "..", "..", "..");
const SERVER_DIR = app.isPackaged ? path.join(process.resourcesPath, "server") : path.join(PROJECT_ROOT, "desktop", "out", "server");
const SERVER_CWD = app.isPackaged ? SERVER_DIR : PROJECT_ROOT;
const ICON = path.join(__dirname, "icon.ico");
const SMOKE_OUT = process.env.SMOKE_OUT
  ? path.resolve(process.env.SMOKE_OUT)
  : app.isPackaged
    ? path.join(process.env.PORTABLE_EXECUTABLE_DIR || path.dirname(process.execPath), "smoke.png")
    : path.join(PROJECT_ROOT, "release", "smoke.png");

let launcher: BrowserWindow | null = null;
let gameWin: BrowserWindow | null = null;
let busy = false;
let quitting = false;

const config = new ConfigStore(path.join(USER_DATA, "config.json"));
const server = new EmbeddedServer({ entry: path.join(SERVER_DIR, "server.mjs"), cwd: SERVER_CWD, db: DB_PATH, log: SERVER_LOG });

// ---------- журнал ----------
function log(msg: string): void {
  const line = `${new Date().toISOString()} ${msg}\n`;
  try {
    fs.appendFileSync(MAIN_LOG, line);
  } catch {
    // журнал недоступен — не критично
  }
  if (!app.isPackaged && !SMOKE) process.stdout.write(line);
}

function rotateLogs(): void {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
  for (const name of ["main", "server"]) {
    const cur = path.join(LOGS_DIR, `${name}.log`);
    try {
      if (fs.existsSync(cur)) fs.renameSync(cur, path.join(LOGS_DIR, `${name}.prev.log`));
    } catch {
      // файл занят — пишем дальше в него
    }
  }
}

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

// ---------- smoke ----------
const smoke = {
  t0: Date.now(),
  stage: "запуск",
  done: false,
  say(msg: string): void {
    const line = `[smoke] ${msg}`;
    console.log(line);
    log(line);
  },
  async capture(win: BrowserWindow, file: string): Promise<string> {
    const img = await win.webContents.capturePage();
    if (img.isEmpty()) throw new Error("пустой снимок окна");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, img.toPNG());
    const { width, height } = img.getSize();
    return `${file} (${width}×${height})`;
  },
  async finish(ok: boolean, msg: string): Promise<void> {
    if (this.done) return;
    this.done = true;
    this.say(ok ? msg : `ОШИБКА: ${msg}`);
    if (!ok) {
      await new Promise((r) => setTimeout(r, 800)); // лаунчер успевает показать ошибку
      const w = gameWin ?? launcher;
      if (w && !w.isDestroyed()) await this.capture(w, SMOKE_OUT).then((s) => this.say(`снимок для разбора: ${s}`), () => {});
      if (server.lastLines(1)) this.say(`хвост журнала сервера:\n${server.lastLines(8)}`);
    }
    const code = await server.stop();
    if (code !== null) this.say(`сервер остановлен, код ${code}`);
    const pass = ok && (code === null || code === 0);
    this.say(`${pass ? "OK" : "FAIL"} за ${((Date.now() - this.t0) / 1000).toFixed(1)} с; журналы: ${LOGS_DIR}`);
    server.closeLog();
    app.exit(pass ? 0 : 1);
  },
};

/** Ждёт экран входа (или canvas Phaser — он появляется при входе в мир), снимает окно, останавливает сервер и выходит. */
async function smokeGame(win: BrowserWindow): Promise<void> {
  smoke.stage = "ожидание экрана входа / canvas";
  const probe = `(() => {
    const c = document.querySelector("#game canvas");
    const l = document.getElementById("login");
    const login = !!l && !l.hidden && getComputedStyle(l).display !== "none" && !!document.getElementById("login-name");
    return { canvas: c ? c.width + "×" + c.height : "", login, size: innerWidth + "×" + innerHeight };
  })()`;
  let state = { canvas: "", login: false, size: "" };
  while (!state.canvas && !state.login) {
    if (win.isDestroyed()) throw new Error("окно игры закрылось");
    state = (await win.webContents.executeJavaScript(probe, true)) as typeof state;
    if (!state.canvas && !state.login) await new Promise((r) => setTimeout(r, 500));
  }
  smoke.say(`окно игры ${state.size}: ${win.webContents.getURL()} — ${state.login ? "экран входа виден" : `canvas ${state.canvas}`}`);
  await new Promise((r) => setTimeout(r, 1500)); // кадр отрисован, шрифты подгружены
  smoke.stage = "снимок окна";
  smoke.say(`снимок: ${await smoke.capture(win, SMOKE_OUT)}`);
  await smoke.finish(true, "игра загружена");
}

// ---------- окна ----------
const sameOrigin = (url: string, origin: string) => {
  try {
    return new URL(url).origin === origin;
  } catch {
    return false;
  }
};

function openExternal(url: string): void {
  try {
    const u = new URL(url);
    if (u.protocol === "https:" || u.protocol === "http:" || u.protocol === "mailto:") void shell.openExternal(u.toString());
  } catch {
    // не URL — игнорируем
  }
}

/** Навигация только внутри своего origin (у лаунчера — никуда); прочие ссылки — в системный браузер. */
function lockNavigation(contents: WebContents, origin: string | null): void {
  contents.on("will-navigate", (e, url) => {
    if (origin && sameOrigin(url, origin)) return;
    e.preventDefault();
    openExternal(url);
  });
}

function onKey(win: BrowserWindow, e: ElectronEvent, input: Input, game: boolean): void {
  if (input.type !== "keyDown") return;
  // F11 — полный экран; остальные клавиши (Tab, F1–F5, Alt…) уходят в игру: меню нет, ускорителей нет
  if (game && input.key === "F11" && !input.alt && !input.control && !input.meta) {
    e.preventDefault();
    if (!input.isAutoRepeat) win.setFullScreen(!win.isFullScreen());
    return;
  }
  if (DEVTOOLS && input.control && input.shift && input.code === "KeyI") {
    e.preventDefault();
    win.webContents.toggleDevTools();
  }
}

function createLauncher(): void {
  const win = new BrowserWindow({
    width: 440,
    height: 620,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    frame: false,
    show: false,
    center: true,
    title: TITLE,
    icon: ICON,
    backgroundColor: BG,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: DEVTOOLS,
      spellcheck: false,
    },
  });
  launcher = win;
  lockNavigation(win.webContents, null);
  win.webContents.on("before-input-event", (e, input) => onKey(win, e, input, false));
  win.once("ready-to-show", () => win.show());
  win.on("closed", () => {
    if (launcher === win) launcher = null;
  });
  if (SMOKE) {
    win.webContents.once("did-finish-load", () => {
      setTimeout(() => {
        if (win.isDestroyed()) return;
        const file = SMOKE_OUT.replace(/\.png$/i, "") + "-launcher.png";
        smoke
          .capture(win, file)
          .then((s) => smoke.say(`лаунчер: ${s}`))
          .catch((err) => smoke.say(`лаунчер: снимок не удался (${errText(err)})`));
      }, 500);
    });
  }
  void win.loadFile(path.join(__dirname, "launcher", "index.html"));
}

function restoreBounds(): { x?: number; y?: number; width: number; height: number } {
  const st = config.data.window;
  const width = Math.max(GAME_MIN.width, st?.width ?? GAME_SIZE.width);
  const height = Math.max(GAME_MIN.height, st?.height ?? GAME_SIZE.height);
  if (st && st.x !== undefined && st.y !== undefined) {
    const rect = { x: st.x, y: st.y, width, height };
    const area = screen.getDisplayMatching(rect).workArea;
    const overlapW = Math.min(rect.x + rect.width, area.x + area.width) - Math.max(rect.x, area.x);
    const overlapH = Math.min(rect.y + rect.height, area.y + area.height) - Math.max(rect.y, area.y);
    if (overlapW >= 200 && overlapH >= 120) return rect; // окно видно на одном из мониторов
  }
  const work = screen.getPrimaryDisplay().workAreaSize;
  return { width: Math.min(width, Math.max(GAME_MIN.width, work.width)), height: Math.min(height, Math.max(GAME_MIN.height, work.height)) };
}

function saveWindowState(win: BrowserWindow): void {
  if (win.isDestroyed()) return;
  const b = win.getNormalBounds();
  const maximized = win.isFullScreen() ? (config.data.window?.maximized ?? false) : win.isMaximized();
  config.update({ window: { x: b.x, y: b.y, width: b.width, height: b.height, maximized } });
}

function createGameWindow(origin: string): BrowserWindow {
  const win = new BrowserWindow({
    ...restoreBounds(),
    minWidth: GAME_MIN.width,
    minHeight: GAME_MIN.height,
    show: false,
    title: TITLE,
    icon: ICON,
    backgroundColor: BG,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: DEVTOOLS,
      spellcheck: false,
    },
  });
  gameWin = win;
  win.on("page-title-updated", (e) => e.preventDefault());
  lockNavigation(win.webContents, origin);
  win.webContents.on("before-input-event", (e, input) => onKey(win, e, input, true));
  win.webContents.on("console-message", (e) => {
    if (e.level === "error" || e.level === "warning") log(`[game ${e.level}] ${e.message} (${e.sourceId}:${e.lineNumber})`);
  });
  win.webContents.on("render-process-gone", (_e, d) => {
    log(`game renderer gone: ${d.reason} (${d.exitCode})`);
    if (d.reason !== "clean-exit" && !win.isDestroyed() && !quitting) win.webContents.reload();
  });
  let timer: NodeJS.Timeout | undefined;
  const saveLater = () => {
    clearTimeout(timer);
    timer = setTimeout(() => saveWindowState(win), 800);
  };
  win.on("resize", saveLater);
  win.on("move", saveLater);
  win.on("close", () => {
    clearTimeout(timer);
    saveWindowState(win);
  });
  win.on("closed", () => {
    if (gameWin === win) gameWin = null;
  });
  return win;
}

class GameLoadError extends Error {}

/** Окно игры: загрузка с таймаутом, затем показ (с восстановленной развёрнутостью) и закрытие лаунчера. */
async function openGame(url: string): Promise<void> {
  const win = createGameWindow(new URL(url).origin);
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      win.loadURL(url),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new GameLoadError(`Страница игры не загрузилась за ${LOAD_TIMEOUT_MS / 1000} с.`)), LOAD_TIMEOUT_MS);
      }),
    ]);
  } catch (err) {
    if (!win.isDestroyed()) win.destroy();
    throw err instanceof GameLoadError ? err : new GameLoadError(`Не удалось открыть ${url}: ${errText(err)}`);
  } finally {
    clearTimeout(timer);
  }
  if (config.data.window?.maximized) win.maximize();
  win.show();
  win.focus();
  const l = launcher;
  setTimeout(() => {
    if (l && !l.isDestroyed()) l.close();
  }, 150);
}

// ---------- действия лаунчера ----------
function status(stage: Stage, text: string, progress: number): void {
  if (launcher && !launcher.isDestroyed()) launcher.webContents.send(IPC.status, { stage, text, progress } satisfies LauncherStatus);
}

function failure(title: string, err: unknown, logFile?: string): ActionResult {
  const detail = err instanceof ServerStartError && err.detail ? `\n${err.detail}` : "";
  return { ok: false, title, message: errText(err) + detail, log: logFile };
}

async function play(): Promise<ActionResult> {
  if (busy || gameWin) return { ok: false, title: "Игра уже запускается", message: "Подождите несколько секунд." };
  busy = true;
  const t0 = Date.now();
  try {
    smoke.stage = "запуск сервера";
    status("port", "Поиск свободного порта…", 0.05);
    const port = await pickPort(config.data.port, DEFAULT_PORT);
    status("spawn", "Запуск сервера…", 0.15);
    await server.start(port, (text, p) => status("world", text, p));
    config.update({ port });
    log(`server ready: 127.0.0.1:${port} in ${Date.now() - t0} ms`);
    if (SMOKE) smoke.say(`сервер готов за ${((Date.now() - t0) / 1000).toFixed(1)} с: http://127.0.0.1:${port}/ (база ${DB_PATH})`);
  } catch (err) {
    log(`server start failed: ${errText(err)}`);
    await server.stop(5000);
    if (SMOKE) void smoke.finish(false, `сервер не запустился: ${errText(err)}`);
    return failure("Сервер не запустился", err, SERVER_LOG);
  } finally {
    busy = false;
  }
  try {
    busy = true;
    smoke.stage = "загрузка окна игры";
    status("client", "Загрузка игры…", 0.85);
    await openGame(`http://127.0.0.1:${server.port}/`);
    status("done", "Готово", 1);
    if (SMOKE && gameWin) smokeGame(gameWin).catch((err) => smoke.finish(false, `${smoke.stage}: ${errText(err)}`));
    return { ok: true };
  } catch (err) {
    log(`game load failed: ${errText(err)}`);
    await server.stop();
    if (SMOKE) void smoke.finish(false, `окно игры: ${errText(err)}`);
    return failure("Игра не загрузилась", err, MAIN_LOG);
  } finally {
    busy = false;
  }
}

/** «host:port», «http(s)://…», «ws(s)://…» → http(s)://host:port/ ; null — не адрес. */
function normalizeAddress(raw: string): string | null {
  let s = raw.trim();
  if (!s || s.length > 300) return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = `http://${s}`;
  s = s.replace(/^ws:/i, "http:").replace(/^wss:/i, "https:");
  try {
    const u = new URL(s);
    if ((u.protocol !== "http:" && u.protocol !== "https:") || !u.hostname || u.username || u.password) return null;
    return `${u.origin}/`;
  } catch {
    return null;
  }
}

async function connect(address: string): Promise<ActionResult> {
  if (busy || gameWin) return { ok: false, title: "Игра уже запускается", message: "Подождите несколько секунд." };
  const url = normalizeAddress(address);
  if (!url) return { ok: false, title: "Неверный адрес сервера", message: "Пример: 192.168.1.20:2567 или https://play.example.com" };
  config.update({ server: url });
  busy = true;
  try {
    const host = new URL(url).host;
    status("connect", `Подключение к ${host}…`, 0.3);
    try {
      // любой HTTP-ответ — сервер доступен; сетевые ошибки — понятное сообщение
      await net.fetch(new URL("/health", url).toString(), { signal: AbortSignal.timeout(6000) });
    } catch (err) {
      return { ok: false, title: "Сервер не отвечает", message: `${host}: ${errText(err)}\nПроверьте адрес, порт и что сервер запущен (npm start).` };
    }
    status("client", "Загрузка игры…", 0.8);
    await openGame(url);
    log(`connected to remote ${url}`);
    status("done", "Готово", 1);
    return { ok: true };
  } catch (err) {
    log(`remote load failed: ${errText(err)}`);
    return failure("Игра не загрузилась", err, MAIN_LOG);
  } finally {
    busy = false;
  }
}

function registerIpc(): void {
  const guard = (e: IpcMainInvokeEvent) => {
    if (!launcher || e.sender !== launcher.webContents) throw new Error("forbidden");
  };
  ipcMain.handle(IPC.info, (e): LauncherInfo => {
    guard(e);
    return {
      version: __APP_VERSION__,
      electron: process.versions.electron,
      server: config.data.server ?? "",
      logsDir: LOGS_DIR,
      serverLog: SERVER_LOG,
      smoke: SMOKE,
    };
  });
  ipcMain.handle(IPC.play, (e) => {
    guard(e);
    return play();
  });
  ipcMain.handle(IPC.connect, (e, address: unknown) => {
    guard(e);
    return connect(typeof address === "string" ? address : "");
  });
  ipcMain.handle(IPC.openLogs, async (e) => {
    guard(e);
    fs.mkdirSync(LOGS_DIR, { recursive: true });
    await shell.openPath(LOGS_DIR);
  });
  ipcMain.handle(IPC.openServerLog, async (e) => {
    guard(e);
    await shell.openPath(fs.existsSync(SERVER_LOG) ? SERVER_LOG : LOGS_DIR);
  });
  ipcMain.handle(IPC.window, (e, action: WindowAction) => {
    guard(e);
    if (action === "minimize") launcher?.minimize();
    else if (action === "close") launcher?.close();
  });
}

// ---------- сервер упал во время игры ----------
server.on("exit", (code: number, info: ServerExitInfo) => {
  if (info.expected || !info.wasReady || quitting) return;
  log(`server exited unexpectedly: code ${code}`);
  if (SMOKE) {
    void smoke.finish(false, `сервер завершился во время игры (код ${code})`);
    return;
  }
  const win = gameWin;
  if (!win) return;
  void dialog
    .showMessageBox(win, {
      type: "error",
      title: TITLE,
      message: "Встроенный сервер остановился",
      detail: `Код выхода: ${code}.\n${server.lastError()}\n\nЖурнал: ${SERVER_LOG}`,
      buttons: ["Перезапустить", "Открыть журнал", "Выйти"],
      defaultId: 0,
      cancelId: 2,
      noLink: true,
    })
    .then(async ({ response }) => {
      if (response === 0) {
        try {
          await server.start(server.port, () => {});
          if (!win.isDestroyed()) win.webContents.reload();
          return;
        } catch (err) {
          dialog.showErrorBox(TITLE, `Сервер не запустился: ${errText(err)}\n\nЖурнал: ${SERVER_LOG}`);
        }
      } else if (response === 1) {
        await shell.openPath(SERVER_LOG);
      }
      app.quit();
    });
});

// ---------- жизненный цикл ----------
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  rotateLogs();
  log(`start ${TITLE} v${__APP_VERSION__}, Electron ${process.versions.electron}, Node ${process.versions.node}, packaged=${app.isPackaged}, smoke=${SMOKE}, userData=${USER_DATA}`);
  Menu.setApplicationMenu(null);
  app.setAppUserModelId(APP_ID);

  app.on("second-instance", () => {
    const w = gameWin ?? launcher;
    if (!w || w.isDestroyed()) return;
    if (w.isMinimized()) w.restore();
    w.show();
    w.focus();
  });

  app.on("web-contents-created", (_e, contents) => {
    contents.setWindowOpenHandler(({ url }) => {
      openExternal(url);
      return { action: "deny" };
    });
    contents.on("will-attach-webview", (e) => e.preventDefault());
  });

  app.on("window-all-closed", () => app.quit());

  // выход: сначала штатно останавливаем сервер (герои сохраняются), потом закрываемся
  app.on("will-quit", (e) => {
    if (!server.running) {
      server.closeLog();
      return;
    }
    e.preventDefault();
    if (quitting) return;
    quitting = true;
    log("quit: stopping server");
    void server.stop().then((code) => {
      log(`server stopped: code ${code}`);
      app.quit();
    });
  });

  void app.whenReady().then(() => {
    const allowed = new Set(["fullscreen", "pointerLock", "keyboardLock", "clipboard-sanitized-write"]);
    session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => cb(allowed.has(permission)));
    registerIpc();
    createLauncher();
    if (SMOKE) {
      smoke.say(`старт: Electron ${process.versions.electron}, Node ${process.versions.node}, userData ${USER_DATA}`);
      setTimeout(() => void smoke.finish(false, `таймаут ${SMOKE_TIMEOUT_MS / 1000} с (этап: ${smoke.stage})`), SMOKE_TIMEOUT_MS).unref();
    }
  });
}
