/**
 * Настройки → «Управление» (задача 115, шаг 9; docs/controls.md, разделы 9 и 12): схема, переназначение клавиш, опции мыши и прицела.
 * Всё хранится в localStorage (keybinds:v1, mouse:v1); после изменения keybinds.onChange обновляет панель, справку и меню.
 * Разметка — общие компоненты kit.css (.sec, .set-list/.set-row, .seg, .range, .kbd). Строки настроек строят checkRow, rangeRow, segRow и buttonRow:
 * их же берёт окно настроек в hud.ts.
 */
import {
  ACTIONS, BAR_ACTIONS, GROUPS, MAX_COMBOS, MOUSE_DEFAULTS, PRESETS, comboFromEvent, comboKey, comboLabel, isForbidden, keybinds, mouseCode, mouseOpts, saveMouseOpts,
  type ActionId, type AimMode, type Combo, type GroupId, type MouseOpts, type PresetId,
} from "../game/keybinds";
import { openModal, rangeFill, seg, type SegHandle } from "./kit";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const ONCE_KEY = "controls:scheme-chosen";
const nameOf = (a: ActionId) => ACTIONS.find((x) => x.id === a)!.name;

// ---------- строки настроек (kit.css: .set-list > .set-row) ----------
/** Подпись строки: название и под ним пояснение; id называет и описывает контрол (aria-labelledby, aria-describedby). */
const caption = (id: string, name: string, hint = "") =>
  `<span class="set-label"><span id="${id}-n">${esc(name)}</span>${hint ? `<span class="set-hint" id="${id}-h">${esc(hint)}</span>` : ""}</span>`;
const named = (id: string, hint: string) => ` aria-labelledby="${id}-n"${hint ? ` aria-describedby="${id}-h"` : ""}`;
/** Строка-флажок: щёлкается вся строка (label), сам флажок — у правого края. attrs — лишние атрибуты флажка. */
export const checkRow = (id: string, name: string, hint = "", attrs = "") =>
  `<label class="set-row check">${caption(id, name, hint)}<span class="set-ctl"><input type="checkbox" id="${id}"${attrs}${named(id, hint)}></span></label>`;
/** Строка-ползунок: ползунок и значение (output #id-v) стоят в колонке контролов; заливку дорожки ставит rangeFill. */
export const rangeRow = (id: string, name: string, min: number, max: number, step: number, hint = "") =>
  `<div class="set-row">${caption(id, name, hint)}<span class="set-ctl"><input type="range" class="range" id="${id}" min="${min}" max="${max}" step="${step}"${named(id, hint)}><output class="set-val" id="${id}-v" for="${id}"></output></span></div>`;
/** Строка с переключателем вариантов: подпись над .seg на всю ширину; значение варианта — в data-<attr> (его читает seg() из kit.ts). */
export const segRow = (id: string, name: string, options: [value: string, text: string][], attr: string, hint = "") =>
  `<div class="set-row stack">${caption(id, name, hint)}<div class="seg" id="${id}" role="group"${named(id, hint)}>${options.map(([v, t]) => `<button type="button" class="seg-opt" data-${attr}="${esc(v)}">${esc(t)}</button>`).join("")}</div></div>`;
/** Строка с кнопкой справа: «Расположение окон — Сбросить». */
export const buttonRow = (id: string, name: string, hint: string, label: string) =>
  `<div class="set-row">${caption(id, name, hint)}<span class="set-ctl"><button type="button" class="btn small" id="${id}" aria-labelledby="${id}-n ${id}"${hint ? ` aria-describedby="${id}-h"` : ""}>${esc(label)}</button></span></div>`;

/**
 * Небольшое окно-вопрос поверх игры (openModal из kit.ts): возвращает индекс нажатой кнопки (Esc или клик вне окна — -1).
 * Кнопка 0 — главная, она стоит справа. Классы ctl-modal и ctl-ask — зацепки для tests/*.ts.
 */
function ask(text: string, buttons: string[]): Promise<number> {
  return new Promise((resolve) => {
    let chosen = -1;
    const foot = buttons.map((b, i) => `<button type="button" class="btn${i ? "" : " primary"}" data-i="${i}">${esc(b)}</button>`).reverse().join("");
    const m = openModal(
      `<section class="panel dialog sm ctl-ask" role="dialog" aria-modal="true" aria-labelledby="ctl-ask-text"><div class="dialog-body"><p class="card-text" id="ctl-ask-text">${esc(text)}</p></div><div class="dialog-foot">${foot}</div></section>`,
      { focus: '[data-i="0"]', onClose: () => resolve(chosen) },
    );
    m.back.classList.add("ctl-modal");
    m.dialog.addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>("[data-i]");
      if (b) { chosen = Number(b.dataset.i); m.close(); }
    });
  });
}

type Group = { title: string; rows: ActionId[]; note?: string };
/** Разделы списка клавиш — те же, что в справке (GROUPS из keybinds.ts); панель умений — в порядке слотов. */
function groups(): Group[] {
  const by = (g: GroupId) => ACTIONS.filter((a) => a.group === g).map((a) => a.id);
  return [
    { title: GROUPS.move, rows: by("move") },
    { title: GROUPS.target, rows: by("target") },
    { title: GROUPS.bar, rows: BAR_ACTIONS, note: "Панель 2 — те же клавиши с Shift (⇧)." },
    { title: GROUPS.act, rows: by("act") },
    { title: GROUPS.ui, rows: by("ui") },
  ];
}

const AIM: [AimMode, string][] = [["preview", "С превью"], ["quick", "Быстрый"], ["confirm", "С подтверждением"]];
const CHECKS: [keyof MouseOpts, string, string][] = [
  ["lmbAttacks", "ЛКМ атакует", "Левая кнопка выбирает и сразу атакует врага (без этого — только выбор цели)."],
  ["chase", "Преследовать цель", "Герой сам идёт за атакуемой целью."],
  ["hoverCast", "Каст по наведению", "Умение применяется к цели под курсором, не меняя текущую."],
  ["autoTarget", "Автоцель", "Умение без цели выбирает ближайшего врага."],
  ["approach", "Подходить к цели", "Если цель далеко, герой подойдёт и применит умение."],
  ["bigTargets", "Крупные цели", "Увеличенная область клика по существам (удобно на тачпаде)."],
  ["zoomWheel", "Колесо — масштаб", "Колесо мыши или жест щипка над полем меняет масштаб камеры (2–3)."],
];
const HINT = "Нажмите на сочетание, чтобы изменить. Esc — отмена, Backspace — очистить. Можно назначить СКМ, Mouse4 и Mouse5.";

/** Разделы «Управление» и «Клавиши» внутри окна настроек; host — обёртка #set-controls. */
export function buildControls(host: HTMLElement) {
  host.innerHTML = `<section class="sec flat">
      <h3 class="sec-h">Управление</h3>
      <div class="set-list" id="ctl-opts">
        ${segRow("ctl-preset", "Схема клавиш", (Object.keys(PRESETS) as PresetId[]).map((p): [string, string] => [p, PRESETS[p].name]), "p")}
        ${segRow("ctl-aim", "Режим прицела", AIM, "m")}
        ${CHECKS.map(([k, name, hint]) => checkRow(`ctl-${k}`, name, hint, ` data-k="${k}"`)).join("")}
        ${rangeRow("ctl-queueMs", "Очередь умений", 0, 500, 50, "Сколько мс после нажатия умение ждёт окончания предыдущего")}
      </div>
    </section>
    <section class="sec">
      <h3 class="sec-h">Клавиши</h3>
      <p class="note ctl-hint" id="ctl-hint">${HINT}</p>
      <div id="ctl-groups"></div>
      <div class="set-list ctl-foot">${buttonRow("ctl-reset", "Значения по умолчанию", "Клавиши выбранной схемы и опции мыши", "Сбросить")}</div>
    </section>`;
  const hint = host.querySelector<HTMLElement>("#ctl-hint")!;
  const say = (t: string, bad = false) => { hint.textContent = t || HINT; hint.classList.toggle("bad", bad); };

  // ---- схема ----
  /** Есть ли у игрока свои назначения поверх схемы. */
  const customised = () => {
    const base = PRESETS[keybinds.presetId].layout;
    return ACTIONS.some((a) => !a.fixed && keybinds.combos(a.id).map(comboKey).join() !== base[a.id].map(comboKey).join());
  };
  // seg() отмечает вариант сразу; отказ от смены (Отмена, Esc) возвращает прежний
  const presetSeg: SegHandle = seg(host.querySelector<HTMLElement>("#ctl-preset")!, async (value) => {
    const p = value as PresetId;
    if (p === keybinds.presetId) return;
    if (customised() && (await ask(`Выбрать схему «${PRESETS[p].name}»? Ваши назначения будут сброшены.`, ["Выбрать", "Отмена"])) !== 0) {
      presetSeg.set(keybinds.presetId);
      return;
    }
    keybinds.setPreset(p);
  }, "p");
  const paintPreset = () => presetSeg.set(keybinds.presetId);
  host.querySelector<HTMLElement>("#ctl-reset")!.onclick = async () => {
    if (customised() && (await ask("Вернуть клавиши выбранной схемы? Ваши назначения будут сброшены.", ["Сбросить", "Отмена"])) !== 0) return;
    keybinds.reset();
    Object.assign(mouseOpts, DEFAULT_OPTS());
    saveMouseOpts();
    syncOpts();
    say("Клавиши и опции возвращены.");
  };

  // ---- список клавиш ----
  const list = host.querySelector<HTMLElement>("#ctl-groups")!;
  /** Сочетания действия плашками (до MAX_COMBOS); после занятых — пустая «—» под новое. Клавишу Esc менять нельзя. */
  const chips = (a: ActionId) => {
    const def = ACTIONS.find((x) => x.id === a)!;
    const cs = keybinds.combos(a);
    if (def.fixed) return `<span class="kbd ctl-chip fixed">${esc(comboLabel(cs[0] ?? { code: "Escape" }))}</span>`;
    return Array.from({ length: MAX_COMBOS }, (_, i) => cs[i]
      ? `<button type="button" class="kbd ctl-chip" data-a="${a}" data-i="${i}">${esc(comboLabel(cs[i]))}</button>`
      : (i === cs.length ? `<button type="button" class="kbd ctl-chip empty" data-a="${a}" data-i="${i}">—</button>` : "")).join("");
  };
  const paintList = () => {
    list.innerHTML = groups().map((g) => `<div class="ctl-group"><h4 class="sub-h">${esc(g.title)}</h4><div class="set-list">${g.rows.map((a) => `<div class="set-row ctl-row"><span class="set-label">${esc(nameOf(a))}</span><span class="set-ctl">${chips(a)}</span></div>`).join("")}</div>${g.note ? `<p class="note">${esc(g.note)}</p>` : ""}</div>`).join("");
  };
  const unsub = keybinds.onChange(() => { if (!host.isConnected) return unsub(); if (!capturing) { paintPreset(); paintList(); } });
  let capturing = false;
  list.onclick = (e) => {
    const chip = (e.target as HTMLElement).closest<HTMLButtonElement>(".ctl-chip[data-a]");
    if (chip && !capturing) void capture(chip, chip.dataset.a as ActionId, Number(chip.dataset.i));
  };

  /** Ждёт нажатия клавиши или кнопки мыши; игра в это время ничего не видит. */
  async function capture(chip: HTMLElement, a: ActionId, slot: number) {
    capturing = true;
    const before = chip.textContent;
    chip.textContent = "Нажмите клавишу";
    chip.classList.add("wait");
    say(`«${nameOf(a)}»: нажмите клавишу или кнопку мыши. Esc — отмена, Backspace — очистить.`);
    const combo = await new Promise<Combo | "clear" | null>((resolve) => {
      const end = (v: Combo | "clear" | null) => { window.removeEventListener("keydown", onKey, true); window.removeEventListener("mousedown", onMouse, true); setTimeout(() => { window.removeEventListener("mouseup", swallow, true); window.removeEventListener("auxclick", swallow, true); }, 400); resolve(v); }; // mouseup боковой кнопки ещё придёт: без отмены браузер уйдёт назад по истории
      const swallow = (e: Event) => { e.preventDefault(); e.stopImmediatePropagation(); };
      const onKey = (e: KeyboardEvent) => {
        e.preventDefault(); e.stopImmediatePropagation();
        if (e.repeat) return;
        if (e.code === "Escape") return end(null);
        if (e.code === "Backspace" && !e.shiftKey && !e.ctrlKey && !e.altKey) return end("clear");
        const c = comboFromEvent(e);
        if (!c) return; // нажат один модификатор: ждём клавишу
        if (isForbidden(c)) return say(`${comboLabel(c)} занято браузером — выберите другое сочетание.`, true);
        end(c);
      };
      const onMouse = (e: MouseEvent) => {
        const code = mouseCode(e.button);
        if (code) { swallow(e); return end({ code, shift: e.shiftKey || undefined, ctrl: e.ctrlKey || undefined, alt: e.altKey || undefined }); }
        end(null); // ЛКМ и ПКМ — отмена, клик доходит до окна как обычно
      };
      window.addEventListener("keydown", onKey, true);
      window.addEventListener("mousedown", onMouse, true);
      window.addEventListener("mouseup", swallow, true);
      window.addEventListener("auxclick", swallow, true);
    });
    capturing = false;
    chip.classList.remove("wait");
    chip.textContent = before;
    say("");
    if (combo === "clear") keybinds.clear(a, slot);
    else if (combo) {
      const owner = ACTIONS.find((o) => keybinds.combos(o.id).some((x) => comboKey(x) === comboKey(combo)));
      if (owner && !(owner.id === a && keybinds.combos(a)[slot] && comboKey(keybinds.combos(a)[slot]) === comboKey(combo))) {
        const ok = (await ask(`${comboLabel(combo)} уже занято: «${owner.name}». Поменять местами?`, ["Поменять", "Отмена"])) === 0;
        if (!ok) { paintList(); return; }
      }
      const r = keybinds.rebind(a, slot, combo);
      if (!r.ok) say(r.why === "forbidden" ? "Это сочетание занято браузером." : "Это сочетание назначить нельзя.", true);
    }
    paintList();
  }

  // ---- опции ----
  const opts = host.querySelector<HTMLElement>("#ctl-opts")!;
  const aimSeg: SegHandle = seg(host.querySelector<HTMLElement>("#ctl-aim")!, (m) => { mouseOpts.aimMode = m as AimMode; saveMouseOpts(); }, "m");
  const queue = host.querySelector<HTMLInputElement>("#ctl-queueMs")!;
  const queueV = host.querySelector<HTMLElement>("#ctl-queueMs-v")!;
  const queueFill = rangeFill(queue);
  /** Показать сохранённые опции мыши: флажки, режим прицела, очередь умений (после «Сбросить»). */
  const syncOpts = () => {
    for (const [k] of CHECKS) host.querySelector<HTMLInputElement>(`#ctl-${k}`)!.checked = !!mouseOpts[k];
    aimSeg.set(mouseOpts.aimMode);
    queue.value = String(mouseOpts.queueMs);
    queueV.textContent = `${mouseOpts.queueMs} мс`;
    queueFill();
  };
  opts.onchange = (e) => {
    const t = e.target as HTMLInputElement;
    if (t.dataset.k) { (mouseOpts as unknown as Record<string, boolean>)[t.dataset.k] = t.checked; saveMouseOpts(); }
  };
  opts.oninput = (e) => {
    const t = e.target as HTMLInputElement;
    if (t.id !== "ctl-queueMs") return;
    mouseOpts.queueMs = Math.min(500, Math.max(0, Number(t.value) || 0));
    queueV.textContent = `${mouseOpts.queueMs} мс`;
    saveMouseOpts();
  };
  syncOpts();
  paintPreset();
  paintList();
}

const DEFAULT_OPTS = (): MouseOpts => ({ ...MOUSE_DEFAULTS });

/** Один раз после обновления: предложить выбрать схему («Экшен» — по умолчанию). Флаг лежит в localStorage. */
export async function offerSchemeOnce() {
  let seen = false;
  try { seen = localStorage.getItem(ONCE_KEY) === "1"; } catch { return; }
  // автотесты (puppeteer) не должны упираться в окно выбора; тест самого окна ставит controls:force-offer
  if (seen || (navigator.webdriver && localStorage.getItem("controls:force-offer") !== "1")) return;
  const i = await ask("В игре новое управление. Выберите схему клавиш. «Экшен»: умения на Q W E R A S D F T, ходьба стрелками и правой кнопкой мыши. «Классика»: ходьба WASD, умения 1–9. Позже схему можно сменить в Настройках.", ["Экшен", "Классика"]);
  try { localStorage.setItem(ONCE_KEY, "1"); } catch {}
  if (i === 1 && keybinds.presetId !== "classic") keybinds.setPreset("classic");
  else if (i === 0 && keybinds.presetId !== "action") keybinds.setPreset("action");
}
