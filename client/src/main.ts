import "@fontsource/rubik/400.css";
import "@fontsource/rubik/600.css";
import "./styles.css";
import Phaser from "phaser";
import { api, apiBase, session } from "./account";
import { BootScene } from "./game/BootScene";
import { GameScene } from "./game/GameScene";
import { net } from "./net";
import { setArtViewer } from "../../shared/mountArt";
import { CharSelect } from "./ui/charselect";
import { Hud } from "./ui/hud";
import { loading } from "./ui/loading";
import { T } from "../../shared/texts";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

// пиксель шрифта заголовков (styles/tokens.css, --hu): 10 пикселей экрана в CSS-px; меняется с масштабом Windows и браузера
const syncHeadUnit = () => {
  document.documentElement.style.setProperty("--hu", `${10 / (window.devicePixelRatio || 1)}px`);
  matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`).addEventListener("change", syncHeadUnit, { once: true });
};
syncHeadUnit();
// иконки гербовых маунтов и их печатей — по фракции своего героя (задача 142)
setArtViewer(() => net.self?.faction ?? "");
const netMsg = (ex: unknown) => {
  const msg = (ex as Error)?.message || String(ex);
  return /ECONNREFUSED|Failed to fetch|NetworkError|offline/i.test(msg) ? T("ui.main.739") : msg;
};

let game: Phaser.Game | null = null;
let hud: Hud | null = null;

const charsel = new CharSelect($("charsel"), {
  play: (name) => playChar(name),
  logout: () => void logoutAccount(),
});

// ---------- вход в аккаунт ----------
try {
  const saved = localStorage.getItem("emberfall-login");
  if (saved) $<HTMLInputElement>("login-name").value = JSON.parse(saved).name || "";
} catch {}

/** Режим регистрации: та же форма, повтор пароля и «Назад». */
let reg = false;
function setReg(on: boolean) {
  reg = on;
  document.querySelectorAll<HTMLElement>(".reg-only").forEach((x) => (x.hidden = !on));
  const go = $<HTMLButtonElement>("login-go"), make = $<HTMLButtonElement>("login-new");
  go.hidden = on;
  make.classList.toggle("primary", on);
  make.textContent = on ? T("ui.main.266") : T("ui.main.740");
  $<HTMLInputElement>("login-pass2").required = on;
  $<HTMLInputElement>("login-pass").autocomplete = on ? "new-password" : "current-password";
  $("login-error").textContent = "";
}
$("login-back").addEventListener("click", () => setReg(false));
$("login").addEventListener("keydown", (e) => {
  if (e.key === "Escape" && reg) {
    e.preventDefault();
    setReg(false);
  }
});

function showLogin(msg = "") {
  charsel.hide();
  setReg(false);
  $("login").hidden = false;
  $("login-error").textContent = msg;
  const go = $<HTMLButtonElement>("login-go"), make = $<HTMLButtonElement>("login-new");
  go.disabled = make.disabled = false;
  go.textContent = T("ui.main.263");
  $<HTMLInputElement>("login-pass").value = "";
  ($<HTMLInputElement>("login-name").value ? $("login-pass") : $("login-name")).focus();
}

async function doLogin(create: boolean) {
  const form = $<HTMLFormElement>("login-form");
  if (!form.reportValidity()) return;
  const login = $<HTMLInputElement>("login-name").value.trim();
  const password = $<HTMLInputElement>("login-pass").value;
  const go = $<HTMLButtonElement>("login-go"), make = $<HTMLButtonElement>("login-new");
  const err = $("login-error");
  err.textContent = "";
  if (create && password !== $<HTMLInputElement>("login-pass2").value) return void (err.textContent = T("ui.main.264"));
  go.disabled = make.disabled = true;
  if (!create) go.textContent = T("ui.main.265");
  try {
    const view = await api.login(login, password, create);
    try { localStorage.setItem("emberfall-login", JSON.stringify({ name: login })); } catch {}
    $("login").hidden = true;
    charsel.show(view);
  } catch (ex) {
    err.textContent = netMsg(ex);
    go.disabled = make.disabled = false;
    if (create) make.textContent = T("ui.main.266");
    go.textContent = T("ui.main.263");
  }
}
$<HTMLFormElement>("login-form").addEventListener("submit", (e) => {
  e.preventDefault();
  void doLogin(reg);
});
$("login-new").addEventListener("click", () => {
  if (!reg) {
    setReg(true);
    $("login-name").focus();
  } else void doLogin(true);
});

async function logoutAccount(msg = "") {
  await api.logout();
  showLogin(msg);
}

/** К выбору героя (после выхода из мира или при перезагрузке вкладки с живой сессией). */
async function toCharSelect(msg = "") {
  try {
    const view = await api.chars();
    $("login").hidden = true;
    charsel.show(view, msg);
  } catch (ex) {
    showLogin((ex as Error & { status?: number }).status === 401 ? "" : netMsg(ex));
  }
}

// ---------- мир ----------
/** Последний герой, которым входили (для «Войти снова» и переподключения). */
let lastChar = "";
/** Игра сломалась (исключение в цикле Phaser): при следующем входе пересоздаём её целиком. */
let broken = false;

/**
 * Ассеты ещё грузятся (BootScene не дошла до запуска мира): сцену мира запустит она сама, по текущей комнате. Старт раньше строил куски
 * мира без набора тайлов terrain, и Phaser PutTileAt падал на tiles[index] = undefined у точки появления (баг задачи 132: связь рвалась
 * посреди загрузки на входе новым героем, переподключение присылало «switch»).
 */
function booting(g: Phaser.Game) {
  const boot = g.scene.getScene("boot");
  return !boot || boot.sys.settings.status < Phaser.Scenes.SHUTDOWN;
}

function enterWorld() {
  // экран загрузки (ui/loading.ts) закрывает HUD до готовности мира; уходит сам из GameScene
  loading.show(lastChar ? T("ui.main.741", { lastchar: lastChar }) : "", T("ui.loading.652"));
  $("ui").hidden = false;
  if (!hud) hud = new Hud($("ui"));
  if (game && !broken) {
    if (booting(game)) return;
    loading.progress(0.9, T("ui.main.742"));
    game.scene.start("game");
    return;
  }
  if (game) destroyGame();
  broken = false;
  game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: "game",
    backgroundColor: "#120f16",
    pixelArt: true,
    roundPixels: true,
    scale: { mode: Phaser.Scale.RESIZE, width: window.innerWidth, height: window.innerHeight },
    scene: [BootScene, GameScene],
    input: { mouse: { preventDefaultWheel: false } },
    disableContextMenu: true,
  });
  game.registry.set("hud", hud);
  (window as any).__game = game;
  (window as any).__net = net;
}

/** Полное уничтожение Phaser (после ошибки цикл может быть остановлен — разрушаем сразу, не дожидаясь кадра). */
function destroyGame() {
  const g = game;
  game = null;
  if (!g) return;
  try {
    g.destroy(true);
    (g as unknown as { runDestroy?: () => void }).runDestroy?.();
  } catch (e) {
    console.warn("[game] destroy:", e);
  }
  $("game").replaceChildren();
}

/** Убрать мир с экрана: сцена, HUD, окна. Ничто здесь не должно помешать выходу. */
function hideWorld() {
  loading.hide();
  try { game?.scene.stop("game"); } catch { broken = true; }
  try { hud?.reset(); } catch {}
  $("ui").hidden = true;
  reconnectBox.hide();
}

/** Выход к экрану входа или выбору героя — работает всегда, даже если связь или игра сломаны. */
function forceExit(to: "char" | "account", msg = "") {
  try { net.close(); } catch {}
  hideWorld();
  sysModal.hide();
  if (to === "account") void logoutAccount(msg);
  else void toCharSelect(msg);
}

/** Войти героем: сцена мира строится заново (используется и для «Войти снова»). */
async function playChar(name: string) {
  lastChar = name;
  await net.connect({ token: session.token, character: name });
  charsel.hide();
  enterWorld();
}

// переход мир ⇄ арена и переподключение: сцена перестраивается под новую комнату
net.on("switch", () => {
  sysModal.hide();
  reconnectBox.hide();
  $("ui").hidden = false;
  if (!game || broken) return enterWorld();
  if (booting(game)) return; // мир по новой комнате запустит BootScene, когда догрузит ассеты
  loading.show("", T("ui.main.742"));
  loading.progress(0.9);
  try {
    const sc = game.scene.getScene("game");
    if (sc && (sc.sys.isActive() || sc.sys.isPaused())) sc.scene.restart();
    else game.scene.start("game");
  } catch {
    broken = true;
    enterWorld();
  }
});
// выход из мира без перезагрузки страницы
net.on("logout", (mode) => {
  hideWorld();
  if (mode === "account") void logoutAccount();
  else void toCharSelect();
});
net.on("reconnecting", (m) => reconnectBox.show(m));
net.on("reconnected", () => reconnectBox.hide());
// сеть вернулась — повторяем сразу, не дожидаясь паузы
window.addEventListener("online", () => net.retryNow());
net.on("lost", (msg) => forceExit("account", msg));
/** Окно «Вы вошли с другого устройства» с кнопкой «Войти снова» (вход вытеснит другую вкладку). */
function kickedModal(text: string) {
  sysModal.show(T("ui.main.743"), text, [
    [T("ui.main.744"), true, () => {
      sysModal.busy(T("ui.main.265"));
      playChar(lastChar).then(() => sysModal.hide(), (e) => {
        if ((e as { code?: number }).code === 401) forceExit("account", T("srv.accounts.9"));
        else kickedModal(netMsg(e));
      });
    }],
    [T("ui.main.745"), false, () => forceExit("account")],
  ]);
}
net.on("kicked", (text) => {
  hideWorld();
  kickedModal(text);
});
// меню Esc: «Переподключиться» — выход из комнат и вход заново с полной загрузкой; выход при сломанной связи
window.addEventListener("emberfall:reconnect", () => void net.recover(net.kind === "arena", net.kind !== "arena"));
window.addEventListener("emberfall:exit", (e) => forceExit((e as CustomEvent).detail === "account" ? "account" : "char"));

// ---------- окно «Переподключение…» ----------
const reconnectBox = (() => {
  const back = document.createElement("div");
  back.className = "sys-back reconnect";
  back.hidden = true;
  back.innerHTML = `<div class="panel gmenu sys-panel"><h2>${T("ui.main.746")}</h2>
    <p class="muted sys-text">${T("ui.main.747")}</p>
    <div class="logout-wait" id="rc-time">0 с</div><p class="muted sys-text" id="rc-next"></p>
    <button class="btn gm-item primary" id="rc-now">${T("ui.main.748")}</button>
    <button class="btn gm-item" id="rc-exit">${T("ui.main.745")}</button></div>`;
  document.body.append(back);
  let since = 0, nextAt = 0, attempt = 0, timer = 0;
  const tick = () => {
    const now = performance.now();
    back.querySelector("#rc-time")!.textContent = `${Math.floor((now - since) / 1000)} с`;
    const left = Math.ceil((nextAt - now) / 1000);
    back.querySelector("#rc-next")!.textContent = attempt === 0 || left <= 0 ? T("ui.main.749") : T("ui.main.750", { attempt: attempt, left: left });
  };
  back.querySelector<HTMLButtonElement>("#rc-now")!.onclick = () => net.retryNow();
  back.querySelector<HTMLButtonElement>("#rc-exit")!.onclick = () => forceExit("account");
  return {
    show(m: { attempt: number; nextAt: number; since: number }) {
      since = m.since;
      nextAt = m.nextAt;
      attempt = m.attempt;
      if (back.hidden) {
        back.hidden = false;
        timer = window.setInterval(tick, 250);
      }
      tick();
    },
    hide() {
      back.hidden = true;
      window.clearInterval(timer);
    },
  };
})();

// ---------- системное окно (ошибка, вытеснение) ----------
const sysModal = (() => {
  const back = document.createElement("div");
  back.className = "sys-back";
  back.hidden = true;
  document.body.append(back);
  return {
    get open() {
      return !back.hidden;
    },
    show(title: string, text: string, buttons: [string, boolean, () => void, string?][]) {
      const p = document.createElement("div");
      p.className = "panel gmenu sys-panel";
      const h = document.createElement("h2"), t = document.createElement("p");
      h.textContent = title;
      t.className = "muted sys-text";
      t.textContent = text;
      p.append(h, t);
      for (const [label, primary, fn, id] of buttons) {
        const b = document.createElement("button");
        b.className = `btn gm-item${primary ? " primary" : ""}`;
        b.textContent = label;
        if (id) b.id = id;
        b.onclick = fn;
        p.append(b);
      }
      back.replaceChildren(p);
      back.hidden = false;
      p.querySelector("button")?.focus();
    },
    busy(text: string) {
      back.querySelectorAll("button").forEach((b) => (b.disabled = true));
      const t = back.querySelector(".sys-text");
      if (t) t.textContent = text;
    },
    hide() {
      back.hidden = true;
      back.replaceChildren();
    },
  };
})();

// ---------- глобальный перехват ошибок: вместо белого или замёрзшего экрана — окно ----------
let errSent = 0, errWindow = 0;
function reportError(kind: string, err: unknown, where = "") {
  const e = err as Error | undefined;
  const message = (e?.message ?? String(err)).slice(0, 300);
  console.error(`[${kind}]`, err);
  const now = Date.now();
  if (now - errWindow > 60_000) { errWindow = now; errSent = 0; }
  if (errSent++ >= 5) return;
  try {
    void fetch(apiBase() + "/client-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, message, where: where.slice(0, 200), stack: (e?.stack ?? "").slice(0, 1200), who: net.self?.name ?? "" }),
      keepalive: true,
    }).catch(() => 0);
  } catch {}
}
/** Ошибки, из-за которых окно не нужно: сеть (её чинит переподключение), чужие скрипты, ResizeObserver. */
function benign(err: unknown, msg: string) {
  if (/ResizeObserver loop|^Script error\.?$/i.test(msg)) return true;
  if (typeof (err as { code?: unknown })?.code === "number") return true; // ответ сервера (ServerError)
  return /Failed to fetch|NetworkError|WebSocket|seat reservation|таймаут/i.test(msg);
}
function crash(kind: string, err: unknown, where = "") {
  const msg = (err as Error)?.message ?? String(err ?? "");
  if (benign(err, msg)) return void console.warn(`[${kind}]`, err);
  reportError(kind, err, where);
  if (sysModal.open) return;
  const inGame = !$("ui").hidden;
  if (inGame) broken = true; // цикл Phaser мог остановиться — следующий вход пересоздаёт игру
  sysModal.show(T("ui.main.751"), T("ui.main.752"), [
    [T("ui.gamemenu.501"), true, () => {
      sysModal.busy(T("ui.main.746"));
      if (inGame && lastChar) {
        try { destroyGame(); } catch {}
        void net.recover(net.kind === "arena", net.kind !== "arena");
      } else {
        sysModal.hide();
        void toCharSelect();
      }
    }],
    [T("ui.main.745"), false, () => forceExit("account")],
  ]);
}
window.addEventListener("error", (e) => crash("error", e.error ?? e.message, `${e.filename ?? ""}:${e.lineno ?? 0}:${e.colno ?? 0}`));
window.addEventListener("unhandledrejection", (e) => crash("unhandledrejection", e.reason));
(window as any).__crash = (msg = T("ui.main.753")) => crash("test", new Error(msg));

$("ui").hidden = true;
(window as any).__net = net;
if (session.token) void toCharSelect();
else showLogin();
