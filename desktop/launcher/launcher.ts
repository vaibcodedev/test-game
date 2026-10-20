/** Лаунчер: логика окна (renderer без Node). Всё общение с главным процессом — через window.launcher из preload. */
import type { ActionResult, ImportResult, LauncherApi, LauncherStatus } from "../src/shared";

declare global {
  interface Window {
    launcher: LauncherApi;
  }
}

const api = window.launcher;
const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const playBtn = el<HTMLButtonElement>("play");
const connectBtn = el<HTMLButtonElement>("connect");
const importBtn = el<HTMLButtonElement>("import");
const address = el<HTMLInputElement>("address");
const form = el<HTMLFormElement>("remote");
const hint = el("hint");
const progress = el("progress");
const bar = el("bar");
const statusText = el("status");
const errorBox = el("error");
const errorTitle = el("error-title");
const errorText = el("error-text");
const errorLogRow = el("error-log-row");
const errorLog = el("error-log");
const openLog = el<HTMLButtonElement>("open-log");
const errorBtns = el("error-btns");

let busy = false;

function setBusy(on: boolean): void {
  busy = on;
  playBtn.disabled = on;
  connectBtn.disabled = on;
  importBtn.disabled = on;
  address.disabled = on;
  document.body.classList.toggle("busy", on);
}

function showStatus(s: LauncherStatus): void {
  hint.hidden = true;
  errorBox.hidden = true;
  document.body.classList.remove("boxed");
  progress.hidden = false;
  bar.style.transform = `scaleX(${Math.max(0, Math.min(1, s.progress))})`;
  statusText.textContent = s.text;
}

function showIdle(): void {
  progress.hidden = true;
  errorBox.hidden = true;
  document.body.classList.remove("boxed");
  hint.hidden = false;
}

/** Сообщение об успехе — в той же рамке, что и ошибка, но спокойного цвета и без кнопок журнала. */
function showNotice(title: string, message: string): void {
  showError({ ok: false, title, message });
  errorBox.classList.add("ok");
  errorBox.setAttribute("role", "status");
  errorBtns.hidden = true;
}

function showError(r: Extract<ActionResult, { ok: false }>): void {
  progress.hidden = true;
  hint.hidden = true;
  errorBox.hidden = false;
  document.body.classList.add("boxed");
  errorBox.classList.remove("ok");
  errorBox.setAttribute("role", "alert");
  errorBtns.hidden = false;
  errorTitle.textContent = r.title;
  errorText.textContent = r.message;
  errorLogRow.hidden = !r.log;
  openLog.hidden = !r.log;
  errorLog.textContent = r.log ?? "";
}

async function run(action: () => Promise<ActionResult>): Promise<void> {
  if (busy) return;
  setBusy(true);
  showStatus({ stage: "port", text: "Запуск…", progress: 0.02 });
  try {
    const r = await action();
    if (r.ok) return; // окно игры открыто — лаунчер закроется сам
    showError(r);
  } catch (err) {
    showError({ ok: false, title: "Ошибка лаунчера", message: err instanceof Error ? err.message : String(err) });
  }
  setBusy(false);
}

playBtn.addEventListener("click", () => void run(() => api.play()));
form.addEventListener("submit", (e) => {
  e.preventDefault();
  void run(() => api.connect(address.value));
});
importBtn.addEventListener("click", async () => {
  if (busy) return;
  setBusy(true);
  try {
    const r: ImportResult = await api.importDb();
    if (r.status === "done") showNotice(r.title, r.message);
    else if (r.status === "error") showError({ ok: false, title: r.title, message: r.message, log: r.log });
    else showIdle();
  } catch (err) {
    showError({ ok: false, title: "Ошибка лаунчера", message: err instanceof Error ? err.message : String(err) });
  }
  setBusy(false);
});
el("open-log").addEventListener("click", () => void api.openServerLog());
el("open-logs").addEventListener("click", () => void api.openLogs());
el("logs-link").addEventListener("click", () => void api.openLogs());
el("win-min").addEventListener("click", () => void api.windowAction("minimize"));
el("win-close").addEventListener("click", () => void api.windowAction("close"));
api.onStatus(showStatus);

void (async () => {
  const info = await api.info();
  el("version").textContent = `версия ${info.version}`;
  el("logs-link").title = info.logsDir;
  address.value = info.server;
  playBtn.focus();
  // режим проверки (SMOKE=1): сам жмёт «Играть» (или «Подключиться», если задан SMOKE_CONNECT)
  if (info.smoke)
    setTimeout(() => {
      if (!info.smokeConnect) return playBtn.click();
      address.value = info.smokeConnect;
      form.requestSubmit();
    }, 900);
})();
