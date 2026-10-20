/**
 * Настройки → «Управление» (задача 115, шаг 9; docs/controls.md, разделы 9 и 12): схема, переназначение клавиш, опции мыши и прицела.
 * Всё хранится в localStorage (keybinds:v1, mouse:v1); после изменения keybinds.onChange обновляет панель, справку и меню.
 */
import {
  ACTIONS, BAR_ACTIONS, MAX_COMBOS, MOUSE_DEFAULTS, PRESETS, comboFromEvent, comboKey, comboLabel, isForbidden, keybinds, mouseCode, mouseOpts, saveMouseOpts,
  type ActionId, type AimMode, type Combo, type MouseOpts, type PresetId,
} from "../game/keybinds";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const ONCE_KEY = "controls:scheme-chosen";
const nameOf = (a: ActionId) => ACTIONS.find((x) => x.id === a)!.name;

/** Небольшое окно-вопрос поверх игры: возвращает индекс нажатой кнопки (Esc или клик вне окна — -1). */
function ask(text: string, buttons: string[]): Promise<number> {
  return new Promise((resolve) => {
    const back = document.createElement("div");
    back.className = "ctl-modal";
    back.innerHTML = `<div class="ctl-ask panel" role="dialog"><p>${esc(text)}</p><div class="ctl-ask-btns">${buttons.map((b, i) => `<button type="button" class="btn${i ? "" : " primary"}" data-i="${i}">${esc(b)}</button>`).join("")}</div></div>`;
    const done = (i: number) => { window.removeEventListener("keydown", onKey, true); back.remove(); resolve(i); };
    const onKey = (e: KeyboardEvent) => { e.stopImmediatePropagation(); e.preventDefault(); if (e.code === "Escape") done(-1); };
    window.addEventListener("keydown", onKey, true);
    back.addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>("[data-i]");
      if (b) done(Number(b.dataset.i)); else if (e.target === back) done(-1);
    });
    document.body.append(back);
    back.querySelector<HTMLElement>("[data-i]")?.focus();
  });
}

type Group = { title: string; rows: ActionId[] };
function groups(): Group[] {
  const by = (...g: string[]) => ACTIONS.filter((a) => g.includes(a.group)).map((a) => a.id);
  return [
    { title: "Движение", rows: by("move") },
    { title: "Цель", rows: by("target") },
    { title: "Панель 1", rows: BAR_ACTIONS },
    { title: "Интерфейс", rows: by("act", "ui") },
  ];
}

/** Раздел «Управление» внутри окна настроек. */
export function buildControls(host: HTMLElement) {
  host.innerHTML = `<h3 class="ctl-h">Управление</h3>
    <div class="set-row set-gearfx"><label>Схема клавиш</label><div class="set-seg" id="ctl-preset" role="group"></div></div>
    <div class="ctl-opts" id="ctl-opts"></div>
    <div class="ctl-hint muted" id="ctl-hint">Нажмите на сочетание, чтобы изменить. Esc — отмена, Backspace — очистить. Можно назначить СКМ, Mouse4 и Mouse5.</div>
    <div id="ctl-groups"></div>
    <div class="set-row"><button type="button" class="btn" id="ctl-reset">Сбросить по умолчанию</button></div>`;
  const hint = host.querySelector<HTMLElement>("#ctl-hint")!;
  const baseHint = hint.textContent!;
  const say = (t: string, bad = false) => { hint.textContent = t || baseHint; hint.classList.toggle("bad", bad); };

  // ---- схема ----
  const presetBox = host.querySelector<HTMLElement>("#ctl-preset")!;
  const paintPreset = () => {
    presetBox.innerHTML = (Object.keys(PRESETS) as PresetId[]).map((p) => `<button type="button" class="btn small${keybinds.presetId === p ? " on" : ""}" data-p="${p}" aria-pressed="${keybinds.presetId === p}">${esc(PRESETS[p].name)}</button>`).join("");
  };
  presetBox.onclick = async (e) => {
    const p = (e.target as HTMLElement).closest<HTMLElement>("[data-p]")?.dataset.p as PresetId | undefined;
    if (!p) return;
    if (p === keybinds.presetId) return;
    if (customised() && (await ask(`Выбрать схему «${PRESETS[p].name}»? Ваши назначения будут сброшены.`, ["Выбрать", "Отмена"])) !== 0) return;
    keybinds.setPreset(p);
  };
  /** Есть ли у игрока свои назначения поверх схемы. */
  const customised = () => {
    const base = PRESETS[keybinds.presetId].layout;
    return ACTIONS.some((a) => !a.fixed && keybinds.combos(a.id).map(comboKey).join() !== base[a.id].map(comboKey).join());
  };
  host.querySelector<HTMLElement>("#ctl-reset")!.onclick = async () => {
    if (customised() && (await ask("Вернуть клавиши выбранной схемы? Ваши назначения будут сброшены.", ["Сбросить", "Отмена"])) !== 0) return;
    keybinds.reset();
    Object.assign(mouseOpts, DEFAULT_OPTS());
    saveMouseOpts();
    paintOpts();
    say("Клавиши и опции возвращены.");
  };

  // ---- список клавиш ----
  const list = host.querySelector<HTMLElement>("#ctl-groups")!;
  const paintList = () => {
    list.innerHTML = groups().map((g) => `<div class="ctl-group"><h4>${g.title}</h4>${g.rows.map((a) => {
      const def = ACTIONS.find((x) => x.id === a)!;
      const cs = keybinds.combos(a);
      const chips = def.fixed
        ? `<span class="ctl-chip fixed">${esc(comboLabel(cs[0] ?? { code: "Escape" }))}</span>`
        : Array.from({ length: MAX_COMBOS }, (_, i) => cs[i] ? `<button type="button" class="ctl-chip" data-a="${a}" data-i="${i}">${esc(comboLabel(cs[i]))}</button>` : (i === cs.length ? `<button type="button" class="ctl-chip empty" data-a="${a}" data-i="${i}">—</button>` : "")).join("");
      return `<div class="ctl-row"><span class="ctl-name">${esc(def.name)}</span>${chips}</div>`;
    }).join("")}${g.title === "Панель 1" ? `</div><div class="ctl-group"><h4>Панель 2</h4><div class="ctl-row"><span class="ctl-name">Те же клавиши с Shift (⇧)</span></div>` : ""}</div>`).join("");
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
  const paintOpts = () => {
    opts.innerHTML = `<div class="set-row set-gearfx"><label>Режим прицела</label><div class="set-seg" id="ctl-aim" role="group">${AIM.map(([m, t]) => `<button type="button" class="btn small${mouseOpts.aimMode === m ? " on" : ""}" data-m="${m}" aria-pressed="${mouseOpts.aimMode === m}">${t}</button>`).join("")}</div></div>
      ${CHECKS.map(([k, t, d]) => `<div class="set-row" title="${esc(d)}"><label for="ctl-${k}">${t}</label><input id="ctl-${k}" type="checkbox" data-k="${k}"${mouseOpts[k] ? " checked" : ""}></div>`).join("")}
      <div class="set-row" title="Сколько мс после нажатия умение ждёт окончания предыдущего"><label for="ctl-queueMs">Очередь умений, мс</label><input id="ctl-queueMs" type="range" min="0" max="500" step="50" value="${mouseOpts.queueMs}"><output id="ctl-queueMs-v">${mouseOpts.queueMs}</output></div>`;
  };
  opts.onclick = (e) => {
    const m = (e.target as HTMLElement).closest<HTMLElement>("[data-m]")?.dataset.m as AimMode | undefined;
    if (!m) return;
    mouseOpts.aimMode = m;
    saveMouseOpts();
    paintOpts();
  };
  opts.onchange = (e) => {
    const t = e.target as HTMLInputElement;
    if (t.dataset.k) { (mouseOpts as unknown as Record<string, boolean>)[t.dataset.k] = t.checked; saveMouseOpts(); }
  };
  opts.oninput = (e) => {
    const t = e.target as HTMLInputElement;
    if (t.id !== "ctl-queueMs") return;
    mouseOpts.queueMs = Math.min(500, Math.max(0, Number(t.value) || 0));
    opts.querySelector("#ctl-queueMs-v")!.textContent = String(mouseOpts.queueMs);
    saveMouseOpts();
  };
  paintPreset();
  paintOpts();
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
