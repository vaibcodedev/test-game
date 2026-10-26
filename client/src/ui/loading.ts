/**
 * Экран загрузки при входе в мир и переходе мир ⇄ арена: лого (эмблема и название), полоса прогресса с этапом, совет из data/loading-tips.json.
 * Закрывает пустой HUD, пока грузятся ассеты (BootScene) и строится мир (GameScene: свой герой на месте), затем тает.
 * Слой — между меню Esc (9000) и системными окнами (20000): ошибки связи видны поверх (styles/loading.css).
 */
import data from "../../../data/loading-tips.json";
import { setHidden } from "./kit";
import { GP } from "../../../shared/gameplay";
import { T } from "../../../shared/texts";

const FADE_MS = GP.ui.loadingFadeMs;
/** Мир так и не сообщил о готовности (сбой сцены) — экран всё равно уходит. */
const SAFETY_MS = GP.ui.loadingSafetyMs;
const EMBERS = GP.ui.loadingEmbers;
/** Эмблема игры (пиксель-арт 105×118); размер задаёт styles/loading.css целым множителем пикселя экрана. */
const EMBLEM = "/ui/logo-emblem.png";
// картинка грузится, пока игрок на экране входа: к первому показу экрана загрузки она уже в кеше и не «выпрыгивает»
new Image().src = EMBLEM;

let root: HTMLElement | null = null;
let fill: HTMLElement, pct: HTMLElement, stageEl: HTMLElement, tipEl: HTMLElement, subEl: HTMLElement;
let shown = false, value = 0, safety = 0, fadeTimer = 0;

function build(): HTMLElement {
  const r = document.createElement("div");
  r.id = "loading";
  r.className = "loading";
  r.hidden = true;
  r.setAttribute("role", "status");
  r.setAttribute("aria-live", "polite");
  // искры: своё место, задержка, длительность и размер у каждой (переменные CSS)
  const embers = Array.from({ length: EMBERS }, () =>
    `<i style="--x:${(Math.random() * 100).toFixed(1)}%;--d:${(-Math.random() * 9).toFixed(2)}s;--t:${(6 + Math.random() * 6).toFixed(2)}s;--s:${(0.6 + Math.random() * 0.8).toFixed(2)}"></i>`).join("");
  r.innerHTML = `<div class="ld-embers" aria-hidden="true">${embers}</div>
    <div class="ld-box">
      <div class="ld-logo"><img class="ld-emblem" src="${EMBLEM}" width="105" height="118" alt="" draggable="false"><span class="ld-kicker">MMORPG</span><h1 class="ld-title">${T("ui.gamemenu.505")}</h1><div class="ld-rule" aria-hidden="true"></div></div>
      <p class="ld-sub"></p>
      <div class="progress ld-progress"><div class="bar lg"><i></i><span></span></div></div>
      <p class="ld-stage"></p>
      <p class="ld-tip"><span class="ld-tip-h">${T("ui.loading.651")}</span><span class="ld-tip-t"></span></p>
    </div>`;
  document.body.append(r);
  // нет файла — экран остаётся прежним (название без эмблемы), без значка битой картинки и пустого места
  const emblem = r.querySelector<HTMLImageElement>(".ld-emblem")!;
  emblem.addEventListener("error", () => emblem.remove(), { once: true });
  fill = r.querySelector<HTMLElement>(".ld-progress .bar > i")!;
  pct = r.querySelector<HTMLElement>(".ld-progress .bar > span")!;
  stageEl = r.querySelector<HTMLElement>(".ld-stage")!;
  tipEl = r.querySelector<HTMLElement>(".ld-tip-t")!;
  subEl = r.querySelector<HTMLElement>(".ld-sub")!;
  return r;
}

function paint() {
  const p = Math.round(value * 100);
  fill.style.width = `${p}%`;
  const t = `${p}%`;
  if (pct.textContent !== t) pct.textContent = t;
}

export const loading = {
  /** Показать с подписью (кто и куда входит) и новым советом; если экран уже показан — только подпись и этап. */
  show(sub = "", stage = T("ui.loading.652")) {
    root ??= build();
    clearTimeout(fadeTimer);
    clearTimeout(safety);
    safety = window.setTimeout(() => loading.hide(), SAFETY_MS);
    subEl.textContent = sub;
    setHidden(subEl, !sub);
    stageEl.textContent = stage;
    if (!shown) {
      shown = true;
      value = 0;
      const tips = data.tips;
      tipEl.textContent = tips[Math.floor(Math.random() * tips.length)];
      root.classList.remove("out");
      root.hidden = false;
    }
    paint();
  },
  /** Прогресс 0..1 (полоса идёт только вперёд) и, если задан, новый этап. */
  progress(p: number, stage?: string) {
    if (!root || !shown) return;
    value = Math.max(value, Math.min(1, p));
    if (stage && stageEl.textContent !== stage) stageEl.textContent = stage;
    paint();
  },
  /** Мир готов: 100% и плавный уход. */
  done() {
    if (!root || !shown) return;
    loading.progress(1, T("ui.loading.653"));
    shown = false;
    clearTimeout(safety);
    root.classList.add("out");
    fadeTimer = window.setTimeout(() => { if (root && !shown) root.hidden = true; }, FADE_MS);
  },
  /** Сразу убрать (выход из мира, сбой). */
  hide() {
    shown = false;
    clearTimeout(safety);
    clearTimeout(fadeTimer);
    if (root) root.hidden = true;
  },
};
