/**
 * Раскладка клавиш (задача 115, шаг 1; docs/systems/combat.md, разделы 3, 9, 11).
 * Действие → до двух сочетаний; пресеты «Классика» и «Экшен»; запрещённые сочетания; хранение в localStorage (keybinds:v1);
 * подписи для справки и панели. Без Phaser и DOM на уровне модуля: тестируется из Node (tests/keybinds.ts).
 * Что делает действие — решает GameScene.setupInput; здесь только «какое нажатие какому действию принадлежит».
 */

/** Сочетание: code — KeyboardEvent.code (физическая клавиша, язык раскладки не важен) либо кнопка мыши Mouse3 (СКМ), Mouse4, Mouse5. */
export interface Combo { code: string; shift?: boolean; ctrl?: boolean; alt?: boolean }
/** То, что нужно от KeyboardEvent (тесты подают простые объекты). */
export interface KeyLike { code: string; shiftKey: boolean; ctrlKey: boolean; altKey: boolean; metaKey?: boolean }

export type MoveAction = "moveUp" | "moveDown" | "moveLeft" | "moveRight";
export type SlotAction = `slot${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10}`;
export type ActionId =
  | MoveAction | SlotAction
  | "targetNext" | "targetPrev" | "attack" | "selectSelf" | "selectParty1" | "selectParty2" | "selectParty3" | "selectParty4" | "potionHp" | "potionMp" | "interact" | "talk" | "mount" | "mountNext" | "pet" | "petNext" | "autorun" | "follow"
  | "winChar" | "winInv" | "winSkills" | "winMap" | "winBestiary" | "winArena" | "winMuster" | "winAdmin" | "chat" | "escape";

export const GROUPS = { move: "Движение", target: "Цель", bar: "Панель умений", act: "Действия", ui: "Интерфейс" } as const;
export type GroupId = keyof typeof GROUPS;
/** hold — удерживаемое действие (движение); fixed — клавишу нельзя менять (Esc). */
export interface ActionDef { id: ActionId; group: GroupId; name: string; hold?: boolean; fixed?: boolean }
type Def = Omit<ActionDef, "id">;

const slot = (n: number): Def => ({ group: "bar", name: `Умение ${n}` });
/** Полный перечень: Record по ActionId не даст забыть действие ни здесь, ни в пресетах. Порядок — порядок в окне настроек. */
const DEFS: Record<ActionId, Def> = {
  moveUp: { group: "move", name: "Идти вверх", hold: true },
  moveDown: { group: "move", name: "Идти вниз", hold: true },
  moveLeft: { group: "move", name: "Идти влево", hold: true },
  moveRight: { group: "move", name: "Идти вправо", hold: true },
  targetNext: { group: "target", name: "Следующая цель" },
  targetPrev: { group: "target", name: "Предыдущая цель" },
  attack: { group: "target", name: "Атаковать цель" },
  selectSelf: { group: "target", name: "Выбрать себя" },
  selectParty1: { group: "target", name: "Выбрать члена группы 1" },
  selectParty2: { group: "target", name: "Выбрать члена группы 2" },
  selectParty3: { group: "target", name: "Выбрать члена группы 3" },
  selectParty4: { group: "target", name: "Выбрать члена группы 4" },
  slot10: { group: "bar", name: "Слот 10" },
  slot1: slot(1), slot2: slot(2), slot3: slot(3), slot4: slot(4), slot5: slot(5), slot6: slot(6), slot7: slot(7), slot8: slot(8), slot9: slot(9),
  potionHp: { group: "bar", name: "Зелье здоровья" },
  potionMp: { group: "bar", name: "Зелье маны" },
  interact: { group: "act", name: "Подобрать или поговорить" },
  talk: { group: "act", name: "Поговорить с NPC" },
  mount: { group: "act", name: "Маунт: сесть и слезть" },
  mountNext: { group: "act", name: "Маунт: следующий" },
  autorun: { group: "move", name: "Автобег" },
  follow: { group: "act", name: "Следовать за целью" },
  pet: { group: "act", name: "Питомец: призвать и отпустить" },
  petNext: { group: "act", name: "Питомец: следующий" },
  winChar: { group: "ui", name: "Герой" },
  winInv: { group: "ui", name: "Сумка" },
  winSkills: { group: "ui", name: "Умения" },
  winMap: { group: "ui", name: "Карта" },
  winBestiary: { group: "ui", name: "Бестиарий" },
  winArena: { group: "ui", name: "Арена" },
  winMuster: { group: "ui", name: "Сборы" },
  winAdmin: { group: "ui", name: "Админ-панель" },
  chat: { group: "ui", name: "Чат" },
  escape: { group: "ui", name: "Закрыть окно, снять цель, меню", fixed: true },
};
export const ACTION_IDS = Object.keys(DEFS) as ActionId[];
export const ACTIONS: ActionDef[] = ACTION_IDS.map((id) => ({ id, ...DEFS[id] }));
export const SLOT_IDS: SlotAction[] = ["slot1", "slot2", "slot3", "slot4", "slot5", "slot6", "slot7", "slot8", "slot9"];
/** Действия слотов панели 1 по порядку (12 слотов); панель 2 — те же клавиши с Shift. Схема решает, какая клавиша какому слоту (docs/systems/combat.md, раздел 8). */
export const BAR_ACTIONS: ActionId[] = [...SLOT_IDS, "potionHp", "potionMp", "slot10"];
const MOVE_IDS: MoveAction[] = ["moveUp", "moveDown", "moveLeft", "moveRight"];
export const isMoveAction = (a: ActionId): a is MoveAction => (MOVE_IDS as string[]).includes(a);
export const MAX_COMBOS = 2;

// ---------- пресеты ----------
export type Layout = Record<ActionId, Combo[]>;
export type PresetId = "classic" | "action";

const k = (code: string): Combo => ({ code });
const shift = (code: string): Combo => ({ code, shift: true });

/** Раздел 3: WASD и стрелки, умения 1–9, зелья Q и E. Это нынешние клавиши игры. */
const CLASSIC: Layout = {
  moveUp: [k("KeyW"), k("ArrowUp")], moveDown: [k("KeyS"), k("ArrowDown")], moveLeft: [k("KeyA"), k("ArrowLeft")], moveRight: [k("KeyD"), k("ArrowRight")],
  targetNext: [k("Tab")], targetPrev: [shift("Tab")], attack: [k("KeyT")],
  selectSelf: [k("F1")], selectParty1: [k("F2")], selectParty2: [k("F3")], selectParty3: [k("F4")], selectParty4: [k("F5")],
  slot1: [k("Digit1")], slot2: [k("Digit2")], slot3: [k("Digit3")], slot4: [k("Digit4")], slot5: [k("Digit5")], slot6: [k("Digit6")], slot7: [k("Digit7")], slot8: [k("Digit8")], slot9: [k("Digit9")], slot10: [k("Digit0")],
  potionHp: [k("KeyQ")], potionMp: [k("KeyE")],
  interact: [k("Space")], talk: [k("KeyF")],
  autorun: [k("KeyR"), k("NumLock")], follow: [shift("KeyF")],
  mount: [k("KeyX")], mountNext: [shift("KeyX")], pet: [k("KeyG")], petNext: [shift("KeyG")],
  winChar: [k("KeyC")], winInv: [k("KeyI")], winSkills: [k("KeyK")], winMap: [k("KeyM")], winBestiary: [k("KeyB")], winArena: [k("KeyP")], winMuster: [k("KeyJ")], winAdmin: [k("F10")],
  chat: [k("Enter")], escape: [k("Escape")],
};
/**
 * Раздел 11: умения на Q W E R A S D F T, зелья на 1 и 2 (места 3 и 4 займут предметы панели, шаги 4–5), G — взаимодействие, X и Z — маунт и питомец.
 * WASD заняты умениями: идём стрелками и мышью (ПКМ-движение и ПКМ-атака приходят в шагах 2, 3 и 10).
 */
const ACTION: Layout = {
  ...CLASSIC,
  moveUp: [k("ArrowUp")], moveDown: [k("ArrowDown")], moveLeft: [k("ArrowLeft")], moveRight: [k("ArrowRight")],
  slot1: [k("KeyQ")], slot2: [k("KeyW")], slot3: [k("KeyE")], slot4: [k("KeyR")], slot5: [k("KeyA")], slot6: [k("KeyS")], slot7: [k("KeyD")], slot8: [k("KeyF")], slot9: [k("KeyT")],
  potionHp: [k("Digit1")], potionMp: [k("Digit2")], slot10: [k("Digit3")],
  // G уже «подобрать, а рядом с NPC — поговорить», отдельная клавиша разговора не нужна
  interact: [k("KeyG")], talk: [],
  pet: [k("KeyZ")], petNext: [shift("KeyZ")],
  autorun: [k("NumLock"), k("KeyV")], // R занята умением 4, Shift+R — слот 4 панели 2
  attack: [k("Space")], // T занята умением 9: атака цели — Пробел и ПКМ (задача 134, шаг 3)
};
export const PRESETS: Record<PresetId, { name: string; layout: Layout }> = {
  classic: { name: "Классика", layout: CLASSIC },
  action: { name: "Экшен", layout: ACTION },
};
/**
 * Схема новых игроков. Решение пользователя — «Экшен», но он держится на ПКМ-движении и ПКМ-атаке (шаги 2, 3, 10):
 * без них у героя нет WASD, а клик мышью по-прежнему одинаков для обеих кнопок. До шага 10 по умолчанию «Классика» (docs/systems/combat.md).
 */
export const DEFAULT_PRESET: PresetId = "action";

// ---------- сочетания ----------
const norm = (c: Combo): Combo => {
  const o: Combo = { code: c.code };
  if (c.shift) o.shift = true;
  if (c.ctrl) o.ctrl = true;
  if (c.alt) o.alt = true;
  return o;
};
export const comboKey = (c: Combo): string => [c.ctrl && "ctrl", c.alt && "alt", c.shift && "shift", c.code].filter(Boolean).join("+");
const sameList = (a: Combo[], b: Combo[]) => a.length === b.length && a.every((c, i) => comboKey(c) === comboKey(b[i]));
const clone = (l: Layout): Layout => Object.fromEntries(ACTION_IDS.map((a) => [a, l[a].map(norm)])) as Layout;

/** Клавиши-модификаторы сами по себе сочетанием не бывают. */
const MODIFIER_KEYS = new Set(["ShiftLeft", "ShiftRight", "ControlLeft", "ControlRight", "AltLeft", "AltRight", "AltGraph", "MetaLeft", "MetaRight", "OSLeft", "OSRight", "Unidentified", ""]);
const CODE_RE = /^[A-Za-z][A-Za-z0-9]{0,23}$/;

/** Сочетание из нажатия; null — нажат один модификатор. */
export function comboFromEvent(e: KeyLike): Combo | null {
  if (!e.code || MODIFIER_KEYS.has(e.code)) return null;
  return norm({ code: e.code, shift: e.shiftKey, ctrl: e.ctrlKey, alt: e.altKey });
}
/** Кнопка мыши (MouseEvent.button) → код: 1 — СКМ, 3 и 4 — боковые. ЛКМ и ПКМ остаются указателем игры. */
export function mouseCode(button: number): string | null {
  return button === 1 ? "Mouse3" : button === 3 ? "Mouse4" : button === 4 ? "Mouse5" : null;
}
/** Сочетания браузера: вкладки и окна (Ctrl+W/T/N/Tab, в том числе с Shift), полный экран и DevTools (F11, F12), Alt+F4. */
export function isForbidden(c: Combo): boolean {
  if (c.code === "F11" || c.code === "F12") return true;
  if (c.alt && c.code === "F4") return true;
  return !!c.ctrl && (c.code === "KeyW" || c.code === "KeyT" || c.code === "KeyN" || c.code === "Tab");
}
/** Esc — отмена, в том числе при переназначении: на него ничего не назначить. */
const isReserved = (c: Combo) => c.code === "Escape";

function parseCombo(x: unknown): Combo | null {
  if (!x || typeof x !== "object") return null;
  const r = x as Record<string, unknown>;
  if (typeof r.code !== "string" || !CODE_RE.test(r.code) || MODIFIER_KEYS.has(r.code)) return null;
  const c = norm({ code: r.code, shift: r.shift === true, ctrl: r.ctrl === true, alt: r.alt === true });
  return isForbidden(c) || isReserved(c) ? null : c;
}

// ---------- подписи ----------
const KEY_NAMES: Record<string, string> = {
  Space: "Пробел", Enter: "Enter", Escape: "Esc", Tab: "Tab", Backspace: "Backspace", Delete: "Del", Insert: "Ins", Home: "Home", End: "End", PageUp: "PgUp", PageDown: "PgDn",
  ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→",
  Minus: "-", Equal: "=", BracketLeft: "[", BracketRight: "]", Semicolon: ";", Quote: "'", Comma: ",", Period: ".", Slash: "/", Backslash: "\\", Backquote: "`",
  NumpadAdd: "Num +", NumpadSubtract: "Num -", NumpadMultiply: "Num *", NumpadDivide: "Num /", NumpadEnter: "Num Enter", NumpadDecimal: "Num .",
  NumLock: "NumLock", Mouse3: "СКМ", Mouse4: "Mouse4", Mouse5: "Mouse5",
};
export function keyName(code: string): string {
  if (KEY_NAMES[code]) return KEY_NAMES[code];
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (/^Numpad\d$/.test(code)) return `Num ${code.slice(6)}`;
  return code;
}
export const comboLabel = (c: Combo): string => [c.ctrl && "Ctrl", c.alt && "Alt", c.shift && "Shift", keyName(c.code)].filter(Boolean).join("+");

// ---------- хранение ----------
export interface Saved { v: 1; preset: PresetId; custom: Partial<Record<ActionId, Combo[]>> }
export interface Store { getItem(key: string): string | null; setItem(key: string, value: string): void }
export const STORAGE_KEY = "keybinds:v1";

/** Разбор сохранённого: любой мусор даёт схему по умолчанию, неизвестные действия и запрещённые сочетания выбрасываются. */
export function parseSaved(text: string | null | undefined): Saved {
  const out: Saved = { v: 1, preset: DEFAULT_PRESET, custom: {} };
  if (!text) return out;
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return out; }
  if (!raw || typeof raw !== "object") return out;
  const r = raw as { preset?: unknown; custom?: unknown };
  if (typeof r.preset === "string" && Object.hasOwn(PRESETS, r.preset)) out.preset = r.preset as PresetId;
  if (r.custom && typeof r.custom === "object") {
    const custom = r.custom as Record<string, unknown>;
    for (const a of ACTION_IDS) {
      const list = custom[a];
      if (DEFS[a].fixed || !Array.isArray(list)) continue;
      const combos = list.slice(0, MAX_COMBOS).map(parseCombo).filter((c): c is Combo => !!c);
      // из непустого списка не осталось ни одного годного сочетания (его запретили позже) — остаётся клавиша схемы
      if (list.length && !combos.length) continue;
      out.custom[a] = combos;
    }
  }
  return out;
}
export const serializeSaved = (s: Saved): string => JSON.stringify({ v: 1, preset: s.preset, custom: s.custom });

/** Действующая раскладка: схема + изменения игрока. Сочетание принадлежит одному действию (при споре выигрывает изменённое игроком). */
function compute(preset: PresetId, custom: Saved["custom"]): Layout {
  const lay = clone(PRESETS[preset].layout);
  const own = ACTION_IDS.filter((a) => custom[a] && !DEFS[a].fixed);
  for (const a of own) lay[a] = custom[a]!.slice(0, MAX_COMBOS).map(norm);
  const taken = new Set<string>();
  for (const a of [...own, ...ACTION_IDS.filter((x) => !own.includes(x))]) {
    lay[a] = lay[a].filter((c) => {
      const key = comboKey(c);
      if (taken.has(key)) return false;
      taken.add(key);
      return true;
    });
  }
  return lay;
}

export type Rebind = { ok: true; swapped?: ActionId } | { ok: false; why: "forbidden" | "reserved" | "fixed" | "unknown" };

export class Keybinds {
  private preset: PresetId = DEFAULT_PRESET;
  private custom: Saved["custom"] = {};
  private eff: Layout = clone(PRESETS[DEFAULT_PRESET].layout);
  private idx = new Map<string, ActionId[]>();
  private subs = new Set<() => void>();

  constructor(private store: Store | null = null, private key = STORAGE_KEY) {
    let text: string | null = null;
    try { text = store?.getItem(key) ?? null; } catch {}
    const s = parseSaved(text);
    this.preset = s.preset;
    this.custom = s.custom;
    this.rebuild();
  }

  get presetId(): PresetId { return this.preset; }
  /** Действующая раскладка (копия). */
  layout(): Layout { return clone(this.eff); }
  combos(a: ActionId): Combo[] { return this.eff[a].map(norm); }
  /** Подпись клавиши: «W / ↑»; с i — только i-е сочетание; пусто, если клавиши нет. */
  label(a: ActionId, i?: number): string {
    return (i === undefined ? this.eff[a] : this.eff[a].slice(i, i + 1)).map(comboLabel).join(" / ");
  }
  /** Подпись клавиши i-го умения панели (с нуля); у умения без клавиши — пусто. */
  /** Слот панели (0 — основная, 1 — с Shift) → подпись клавиши схемы: «Q», «⇧Q»; пусто, если клавиши нет. */
  barLabel(bar: number, i: number): string {
    const a = BAR_ACTIONS[i];
    const c = a ? this.eff[a][0] : undefined;
    return c ? (bar ? "⇧" : "") + comboLabel(c) : "";
  }
  /** Нажатие → слот панели: сочетание действия слота (панель 1) либо оно же с Shift (панель 2). Точное совпадение других действий (Shift+Tab, Shift+X) главнее. */
  barSlotFor(e: KeyLike): { bar: number; i: number } | null {
    if (e.metaKey || e.ctrlKey || e.altKey) return null;
    const acts = this.actionsFor(e);
    for (const a of acts) { const i = BAR_ACTIONS.indexOf(a); if (i >= 0) return { bar: 0, i }; }
    if (!e.shiftKey || acts.length) return null;
    for (const a of this.actionsFor({ ...e, shiftKey: false })) { const i = BAR_ACTIONS.indexOf(a); if (i >= 0) return { bar: 1, i }; }
    return null;
  }
  slotLabel(i: number): string { return i >= 0 && i < SLOT_IDS.length ? this.label(SLOT_IDS[i], 0) : ""; }

  /**
   * Действия, которым принадлежит нажатие. Модификаторы должны совпасть точно: Ctrl+C — не «Герой», Shift+X — не маунт.
   * Исключение — удерживаемое движение: Shift+W идёт вперёд, как W (Shift часто зажат на бегу).
   */
  actionsFor(e: KeyLike): ActionId[] {
    if (e.metaKey) return [];
    const c = comboFromEvent(e);
    if (!c) return [];
    const exact = this.idx.get(comboKey(c));
    if (exact) return [...exact];
    if (c.shift && !c.ctrl && !c.alt) return (this.idx.get(comboKey({ code: c.code })) ?? []).filter(isMoveAction);
    return [];
  }

  /** Назначить сочетание на место slot (0 или 1) действия. Занятое сочетание меняется местами: прежнее сочетание действия уходит владельцу. */
  rebind(a: ActionId, slotIndex: number, combo: Combo): Rebind {
    const def = DEFS[a];
    if (!def) return { ok: false, why: "unknown" };
    if (def.fixed) return { ok: false, why: "fixed" };
    const c = norm(combo);
    if (typeof c.code !== "string" || !CODE_RE.test(c.code) || MODIFIER_KEYS.has(c.code)) return { ok: false, why: "unknown" };
    if (isForbidden(c)) return { ok: false, why: "forbidden" };
    if (isReserved(c)) return { ok: false, why: "reserved" };
    const lay = this.layout();
    const mine = lay[a];
    const at = Math.min(Math.max(0, slotIndex | 0), MAX_COMBOS - 1, mine.length);
    let owner: [ActionId, number] | null = null;
    for (const o of ACTION_IDS) {
      const j = lay[o].findIndex((x) => comboKey(x) === comboKey(c));
      if (j >= 0) { owner = [o, j]; break; }
    }
    if (owner && owner[0] === a && owner[1] === at) return { ok: true };
    const old = mine[at];
    mine[at] = c;
    if (owner) {
      const [o, j] = owner;
      if (old) lay[o][j] = old;
      else lay[o].splice(j, 1);
    }
    this.commit(lay);
    return owner && owner[0] !== a ? { ok: true, swapped: owner[0] } : { ok: true };
  }
  /** Убрать сочетание (Backspace в окне переназначения). */
  clear(a: ActionId, slotIndex: number) {
    if (DEFS[a]?.fixed) return;
    const lay = this.layout();
    if (slotIndex < 0 || slotIndex >= lay[a].length) return;
    lay[a].splice(slotIndex, 1);
    this.commit(lay);
  }
  /** Выбрать схему целиком; свои изменения сбрасываются. */
  setPreset(p: PresetId) {
    if (!Object.hasOwn(PRESETS, p)) return;
    this.preset = p;
    this.custom = {};
    this.afterChange();
  }
  /** «Сбросить»: вернуть клавиши текущей схемы. */
  reset() {
    this.custom = {};
    this.afterChange();
  }

  serialize(): string { return serializeSaved({ v: 1, preset: this.preset, custom: this.custom }); }
  /** Подписка на смену раскладки (справка, подписи на панели). Возвращает отписку. */
  onChange(fn: () => void): () => void {
    this.subs.add(fn);
    return () => void this.subs.delete(fn);
  }

  /** Записать раскладку как отличия от схемы: новые действия схем у тех, кто ничего не менял, появятся сами. */
  private commit(lay: Layout) {
    const base = PRESETS[this.preset].layout;
    const custom: Saved["custom"] = {};
    for (const a of ACTION_IDS) if (!DEFS[a].fixed && !sameList(lay[a], base[a])) custom[a] = lay[a];
    this.custom = custom;
    this.afterChange();
  }
  private afterChange() {
    this.rebuild();
    try { this.store?.setItem(this.key, this.serialize()); } catch {}
    for (const fn of [...this.subs]) fn();
  }
  private rebuild() {
    this.eff = compute(this.preset, this.custom);
    this.idx.clear();
    for (const a of ACTION_IDS) for (const c of this.eff[a]) {
      const key = comboKey(c);
      this.idx.set(key, [...(this.idx.get(key) ?? []), a]);
    }
  }
}

function browserStorage(): Store | null {
  try { return typeof window !== "undefined" ? window.localStorage : null; } catch { return null; }
}
/** Раскладка этого браузера. */
export const keybinds = new Keybinds(browserStorage());

/** Зажатые клавиши движения. Ключ — код клавиши: отпускание срабатывает при любых Shift и Alt. */
export class HeldKeys {
  private m = new Map<string, MoveAction>();
  press(code: string, a: MoveAction) { this.m.set(code, a); }
  release(code: string) { this.m.delete(code); }
  clear() { this.m.clear(); }
  get size() { return this.m.size; }
  /** Направление по осям −1…1 (не нормировано); две клавиши одного направления (A и ←) считаются одной. */
  axis(): { mx: number; my: number } {
    const on = new Set(this.m.values());
    return { mx: (on.has("moveRight") ? 1 : 0) - (on.has("moveLeft") ? 1 : 0), my: (on.has("moveDown") ? 1 : 0) - (on.has("moveUp") ? 1 : 0) };
  }
}

// ---------- DOM: где печатают ----------
/** Элемент DOM, достаточный для проверки (модуль работает и без DOM). */
export interface FieldLike { tagName?: string; type?: string; isContentEditable?: boolean }
const NON_TEXT_INPUT = new Set(["button", "checkbox", "radio", "range", "color", "file", "image", "reset", "submit", "hidden"]);
/** Хоткеи молчат, только если фокус в текстовом поле: input (кроме ползунка, флажка, кнопки…), textarea, select, contenteditable. */
export function isTextField(el: FieldLike | null | undefined): boolean {
  if (!el) return false;
  const tag = (el.tagName ?? "").toUpperCase();
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag === "INPUT") return !NON_TEXT_INPUT.has((el.type ?? "text").toLowerCase());
  return el.isContentEditable === true;
}

// ---------- справка из раскладки ----------
/** Клавиши умений одной строкой: подряд идущие цифры — «1–9», иначе через пробел («Q W E R A S D F T»). */
export function skillKeys(kb: Keybinds): string {
  const keys = SLOT_IDS.map((a) => kb.label(a, 0)).filter(Boolean);
  const n = keys.map(Number);
  if (keys.length > 1 && keys.every((x) => /^\d$/.test(x)) && n.every((v, i) => i === 0 || v === n[i - 1] + 1)) return `${keys[0]}–${keys[keys.length - 1]}`;
  return keys.join(" ");
}
/** Часть подписи клавиш в справке: сочетание (рисуется плашкой) или слово — «стрелки», «клик» (word, без плашки). */
export interface HelpKey { text: string; word?: boolean }
/** Строка справки: клавиши (в окне — через « / ») и что они делают. */
export interface HelpRow { keys: HelpKey[]; what: string }
export interface HelpSection { title: string; rows: HelpRow[] }
/** Клавиши движения частями: «WASD», «стрелки», «клик» — последние два словами. */
function moveParts(kb: Keybinds): HelpKey[] {
  const dirs: MoveAction[] = ["moveUp", "moveLeft", "moveDown", "moveRight"];
  const parts: HelpKey[] = [];
  for (const i of [0, 1]) {
    const ks = dirs.map((a) => kb.label(a, i));
    const have = ks.filter(Boolean);
    if (!have.length) continue;
    if (have.length < 4) parts.push({ text: have.join(" ") });
    else if (ks.every((x) => /^[←↑→↓]$/.test(x))) parts.push({ text: "стрелки", word: true });
    else parts.push({ text: ks.every((x) => x.length === 1) ? ks.join("") : ks.join(" ") });
  }
  return [...parts, { text: "клик", word: true }];
}
/** Клавиши движения: «WASD / стрелки / клик». */
const moveKeys = (kb: Keybinds) => moveParts(kb).map((p) => p.text).join(" / ");
/** Клавиши выбора членов группы: подряд идущие F-клавиши — «F2–F5», иначе перечисление. */
function partyKeys(kb: Keybinds): string {
  const ks = (["selectParty1", "selectParty2", "selectParty3", "selectParty4"] as const).map((a) => kb.label(a, 0)).filter(Boolean);
  const n = ks.map((k) => Number(/^F(\d+)$/.exec(k)?.[1]));
  if (ks.length > 1 && n.every((v, i) => v > 0 && (i === 0 || v === n[i - 1] + 1))) return `${ks[0]}–${ks[ks.length - 1]}`;
  return ks.join(" ");
}
/** Строки справки «клавиши — действие» из раскладки; действия без клавиши пропускаются. */
export function hotkeyRows(kb: Keybinds): [string, string][] {
  const rows: [string, string][] = [];
  const first = (a: ActionId) => kb.label(a, 0);
  const add = (keys: string, what: string) => { if (keys) rows.push([keys, what]); };
  /** Клавиши и названия только тех действий, у которых клавиша есть, — чтобы подписи не разъезжались. */
  const pairs = (items: [ActionId, string][]) => {
    const have = items.filter(([a]) => first(a));
    add(have.map(([a]) => first(a)).join(" / "), have.map(([, name]) => name).join(" / "));
  };
  const hp = first("potionHp"), mp = first("potionMp");
  rows.push([moveKeys(kb), "движение"]);
  add(skillKeys(kb), "умения");
  add([hp, mp].filter(Boolean).join(" / "), hp && mp ? "зелья здоровья и маны" : hp ? "зелье здоровья" : "зелье маны");
  add(first("targetNext"), "следующая цель");
  add(first("targetPrev"), "предыдущая цель");
  add(first("attack"), "атаковать цель");
  add([first("selectSelf"), first("selectParty1") && "F2–F5"].filter(Boolean).join(" / "), "выбрать себя / члена группы");
  add(first("interact"), "подобрать предмет или поговорить");
  add(first("talk"), "поговорить с NPC");
  add([first("mount"), first("mountNext")].filter(Boolean).join(" / "), "ездовое животное");
  add([first("pet"), first("petNext")].filter(Boolean).join(" / "), "питомец");
  pairs([["winChar", "герой"], ["winInv", "сумка"], ["winSkills", "умения"]]);
  pairs([["winArena", "арена"], ["winBestiary", "бестиарий"], ["winMap", "карта"]]);
  add(first("winMuster"), "сборы на события и мировых боссов");
  add(first("chat"), "чат");
  add(first("escape"), "закрыть окно, снять цель, меню");
  return rows;
}
/**
 * Справка «клавиши — действие» по разделам GROUPS (те же, что в Настройки → Клавиши): строка на действие, у маунта и питомца — на пару.
 * Названия берутся из DEFS (с заглавной), действия без клавиши пропускаются. Плоский список hotkeyRows остаётся: его сверяет tests/keybinds.ts.
 */
export function hotkeySections(kb: Keybinds): HelpSection[] {
  /** Строка по действиям ids: все их сочетания; what по умолчанию — название первого действия. */
  const row = (ids: ActionId[], what = DEFS[ids[0]].name): HelpRow | null => {
    const keys = ids.flatMap((a) => kb.combos(a).map((c): HelpKey => ({ text: comboLabel(c) })));
    return keys.length ? { keys, what } : null;
  };
  /** Строка с готовой подписью клавиш («1–9», «F2–F5»). */
  const text = (t: string, what: string): HelpRow | null => (t ? { keys: [{ text: t }], what } : null);
  const sec = (g: GroupId, rows: (HelpRow | null)[]): HelpSection => ({ title: GROUPS[g], rows: rows.filter((r): r is HelpRow => r !== null) });
  const wins = (...ids: ActionId[]) => ids.map((a) => row([a]));
  return [
    sec("move", [{ keys: moveParts(kb), what: "Ходьба" }, row(["autorun"])]), // не «Движение»: так уже называется раздел
    sec("target", [row(["targetNext"]), row(["targetPrev"]), row(["attack"]), row(["selectSelf"]), text(partyKeys(kb), "Выбрать члена группы")]),
    sec("bar", [text(skillKeys(kb), "Умения"), row(["potionHp"]), row(["potionMp"])]),
    sec("act", [row(["interact"]), row(["talk"]), row(["mount", "mountNext"], "Ездовое животное"), row(["pet", "petNext"], "Питомец"), row(["follow"])]),
    sec("ui", [...wins("winChar", "winInv", "winSkills", "winMap", "winBestiary", "winArena", "winMuster"), row(["chat"]), row(["escape"])]),
  ].filter((s) => s.rows.length > 0);
}

/**
 * Настройки мыши и управления (localStorage mouse:v1): «ЛКМ атакует», «Преследовать цель», «Режим прицела», «Каст по наведению»,
 * «Автоцель», «Подходить к цели», «Очередь умений, мс» (0–500), «Крупные цели» (hitTest + магнит), «Колесо — масштаб».
 */
export type AimMode = "preview" | "quick" | "confirm";
export interface MouseOpts { lmbAttacks: boolean; chase: boolean; aimMode: AimMode; hoverCast: boolean; autoTarget: boolean; approach: boolean; queueMs: number; bigTargets: boolean; zoomWheel: boolean }
export const MOUSE_DEFAULTS: MouseOpts = { lmbAttacks: false, chase: false, aimMode: "preview", hoverCast: true, autoTarget: false, approach: true, queueMs: 400, bigTargets: false, zoomWheel: true };
export function loadMouseOpts(store: Store | null = browserStorage()): MouseOpts {
  let r: Record<string, unknown> = {};
  try { const p = JSON.parse(store?.getItem("mouse:v1") ?? "{}"); if (p && typeof p === "object") r = p; } catch {}
  const d = MOUSE_DEFAULTS, bool = (k: keyof MouseOpts): boolean => (typeof r[k] === "boolean" ? (r[k] as boolean) : (d[k] as boolean));
  const q = Number(r.queueMs);
  return {
    lmbAttacks: r.lmbAttacks === true, chase: r.chase === true,
    aimMode: r.aimMode === "quick" || r.aimMode === "confirm" || r.aimMode === "preview" ? r.aimMode : d.aimMode,
    hoverCast: bool("hoverCast"), autoTarget: r.autoTarget === true, approach: bool("approach"),
    queueMs: r.queueMs === undefined || !Number.isFinite(q) ? d.queueMs : Math.min(500, Math.max(0, Math.round(q))),
    bigTargets: r.bigTargets === true, zoomWheel: bool("zoomWheel"),
  };
}
export const mouseOpts: MouseOpts = loadMouseOpts();
export function saveMouseOpts(store: Store | null = browserStorage()) { try { store?.setItem("mouse:v1", JSON.stringify(mouseOpts)); } catch {} }
