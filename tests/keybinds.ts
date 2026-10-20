/**
 * Раскладка клавиш (задача 115, шаг 1): пресеты без конфликтов, запреты, обмен при конфликте, round-trip сохранения,
 * разбор нажатий, поле ввода, справка из раскладки. Без браузера и сервера. Запуск: npx tsx tests/keybinds.ts
 */
import assert from "node:assert/strict";
import {
  ACTION_IDS, ACTIONS, GROUPS, HeldKeys, Keybinds, MAX_COMBOS, PRESETS, STORAGE_KEY,
  comboKey, comboLabel, hotkeyRows, isForbidden, isTextField, mouseCode, parseSaved, skillKeys,
  type ActionId, type Combo, type PresetId, type Store,
} from "../client/src/game/keybinds";

let count = 0;
const test = (name: string, fn: () => void) => {
  fn();
  count++;
  console.log("  ok   " + name);
};
const ev = (code: string, m: { shift?: boolean; ctrl?: boolean; alt?: boolean; meta?: boolean } = {}) => ({ code, shiftKey: !!m.shift, ctrlKey: !!m.ctrl, altKey: !!m.alt, metaKey: !!m.meta });
class MemStore implements Store {
  m = new Map<string, string>();
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
}
const presets = Object.keys(PRESETS) as PresetId[];
const acts = (kb: Keybinds, code: string, m: Parameters<typeof ev>[1] = {}) => kb.actionsFor(ev(code, m));
const noDupes = (kb: Keybinds, what: string) => {
  const seen = new Map<string, ActionId>();
  for (const a of ACTION_IDS) for (const c of kb.layout()[a]) {
    assert.ok(!seen.has(comboKey(c)), `${what}: ${comboKey(c)} у ${seen.get(comboKey(c))} и ${a}`);
    seen.set(comboKey(c), a);
  }
};

test("перечень действий: группы известны, удерживаются только движения, неизменяема только Esc", () => {
  assert.equal(ACTIONS.length, ACTION_IDS.length);
  for (const d of ACTIONS) {
    assert.ok(d.name && d.group in GROUPS, d.id);
    assert.equal(!!d.hold, d.id.startsWith("move"), `hold у ${d.id}`);
    assert.equal(!!d.fixed, d.id === "escape", `fixed у ${d.id}`);
  }
});

test("пресеты: все действия описаны, сочетаний не больше двух, конфликтов и запрещённых нет", () => {
  for (const id of presets) {
    const lay = PRESETS[id].layout;
    assert.deepEqual(Object.keys(lay).sort(), [...ACTION_IDS].sort(), `${id}: набор действий`);
    const seen = new Map<string, ActionId>();
    for (const a of ACTION_IDS) {
      assert.ok(lay[a].length <= MAX_COMBOS, `${id}: ${a} больше ${MAX_COMBOS} сочетаний`);
      for (const c of lay[a]) {
        assert.ok(!isForbidden(c), `${id}: ${a} занял запрещённое ${comboKey(c)}`);
        assert.ok(c.code !== "Escape" || a === "escape", `${id}: Esc у ${a}`);
        assert.ok(!seen.has(comboKey(c)), `${id}: ${comboKey(c)} у ${seen.get(comboKey(c))} и ${a}`);
        seen.set(comboKey(c), a);
      }
    }
    noDupes(new Keybinds(null), id);
  }
});

test("по умолчанию — «Классика» (пока нет ПКМ-движения и ПКМ-атаки, шаги 2, 3, 10), и это нынешние клавиши игры", () => {
  const kb = new Keybinds(null);
  assert.equal(kb.presetId, "classic");
  const want: [string, ActionId][] = [
    ["KeyW", "moveUp"], ["KeyA", "moveLeft"], ["KeyS", "moveDown"], ["KeyD", "moveRight"],
    ["ArrowUp", "moveUp"], ["ArrowLeft", "moveLeft"], ["ArrowDown", "moveDown"], ["ArrowRight", "moveRight"],
    ["Digit1", "slot1"], ["Digit2", "slot2"], ["Digit3", "slot3"], ["Digit4", "slot4"], ["Digit5", "slot5"], ["Digit6", "slot6"], ["Digit7", "slot7"], ["Digit8", "slot8"], ["Digit9", "slot9"],
    ["KeyQ", "potionHp"], ["KeyE", "potionMp"], ["Tab", "targetNext"], ["Space", "interact"], ["KeyF", "talk"], ["KeyX", "mount"], ["KeyG", "pet"],
    ["KeyC", "winChar"], ["KeyI", "winInv"], ["KeyK", "winSkills"], ["KeyM", "winMap"], ["KeyB", "winBestiary"], ["KeyP", "winArena"], ["F10", "winAdmin"], ["Enter", "chat"], ["Escape", "escape"],
  ];
  for (const [code, a] of want) assert.deepEqual(acts(kb, code), [a], code);
  assert.deepEqual(acts(kb, "KeyX", { shift: true }), ["mountNext"]);
  assert.deepEqual(acts(kb, "KeyG", { shift: true }), ["petNext"]);
});

test("«Экшен» описывает раздел 11: умения Q W E R A S D F T, зелья 1 и 2, G, X, Z, стрелки; WASD не движение", () => {
  const kb = new Keybinds(null);
  kb.setPreset("action");
  const slots: [string, ActionId][] = [["KeyQ", "slot1"], ["KeyW", "slot2"], ["KeyE", "slot3"], ["KeyR", "slot4"], ["KeyA", "slot5"], ["KeyS", "slot6"], ["KeyD", "slot7"], ["KeyF", "slot8"], ["KeyT", "slot9"]];
  for (const [code, a] of slots) assert.deepEqual(acts(kb, code), [a], code);
  assert.deepEqual(acts(kb, "Digit1"), ["potionHp"]);
  assert.deepEqual(acts(kb, "Digit2"), ["potionMp"]);
  assert.deepEqual(acts(kb, "KeyG"), ["interact"]);
  assert.deepEqual(acts(kb, "Tab"), ["targetNext"]);
  assert.deepEqual(acts(kb, "KeyX"), ["mount"]);
  assert.deepEqual(acts(kb, "KeyZ"), ["pet"]);
  assert.deepEqual(acts(kb, "ArrowUp"), ["moveUp"]);
  assert.deepEqual(acts(kb, "KeyW", { shift: true }), [], "Shift+W не должно идти вперёд: W — умение");
  assert.deepEqual(kb.combos("talk"), [], "отдельной клавиши разговора нет: G подбирает и разговаривает");
  noDupes(kb, "action");
});

test("запреты: Ctrl+W/T/N/Tab, F11, F12, Alt+F4 не назначить и не загрузить", () => {
  const bad: Combo[] = [
    { code: "KeyW", ctrl: true }, { code: "KeyT", ctrl: true }, { code: "KeyN", ctrl: true }, { code: "Tab", ctrl: true },
    { code: "KeyT", ctrl: true, shift: true }, { code: "KeyN", ctrl: true, shift: true }, { code: "Tab", ctrl: true, shift: true },
    { code: "F11" }, { code: "F12" }, { code: "F12", shift: true }, { code: "F4", alt: true },
  ];
  for (const c of bad) assert.ok(isForbidden(c), comboKey(c));
  for (const c of [{ code: "KeyW" }, { code: "KeyC", ctrl: true }, { code: "KeyC", alt: true }, { code: "F10" }, { code: "F4" }, { code: "Tab" }, { code: "KeyT", shift: true }] as Combo[]) assert.ok(!isForbidden(c), comboKey(c));
  const kb = new Keybinds(null);
  const before = JSON.stringify(kb.layout());
  for (const c of bad) assert.deepEqual(kb.rebind("slot1", 0, c), { ok: false, why: "forbidden" }, comboKey(c));
  assert.deepEqual(kb.rebind("slot1", 0, { code: "Escape" }), { ok: false, why: "reserved" });
  assert.deepEqual(kb.rebind("slot1", 0, { code: "ShiftLeft", shift: true }), { ok: false, why: "unknown" });
  assert.deepEqual(kb.rebind("escape", 0, { code: "KeyP" }), { ok: false, why: "fixed" });
  assert.equal(JSON.stringify(kb.layout()), before, "отказы раскладку не меняют");
  // запрещённое в сохранении выбрасывается, клавиша схемы остаётся
  const s = parseSaved(JSON.stringify({ preset: "classic", custom: { slot1: [{ code: "F12" }], slot2: [{ code: "KeyW", ctrl: true }, { code: "Digit7" }], slot3: [{ code: "Escape" }] } }));
  assert.equal(s.custom.slot1, undefined);
  assert.deepEqual(s.custom.slot2, [{ code: "Digit7" }]);
  assert.equal(s.custom.slot3, undefined);
});

test("конфликт: сочетание меняется местами с владельцем", () => {
  const kb = new Keybinds(null);
  assert.deepEqual(kb.rebind("slot1", 0, { code: "Digit2" }), { ok: true, swapped: "slot2" });
  assert.deepEqual(kb.combos("slot1"), [{ code: "Digit2" }]);
  assert.deepEqual(kb.combos("slot2"), [{ code: "Digit1" }]);
  assert.deepEqual(acts(kb, "Digit1"), ["slot2"]);
  assert.deepEqual(acts(kb, "Digit2"), ["slot1"]);
  // на свободную клавишу: прежняя освобождается
  assert.deepEqual(kb.rebind("slot3", 0, { code: "KeyZ" }), { ok: true });
  assert.deepEqual(acts(kb, "KeyZ"), ["slot3"]);
  assert.deepEqual(acts(kb, "Digit3"), []);
  // второе сочетание, и не больше двух: третье место занять нельзя, второе заменяется
  assert.deepEqual(kb.rebind("talk", 1, { code: "KeyV" }), { ok: true });
  assert.deepEqual(kb.combos("talk"), [{ code: "KeyF" }, { code: "KeyV" }]);
  assert.deepEqual(kb.rebind("talk", 5, { code: "KeyB" }), { ok: true, swapped: "winBestiary" });
  assert.deepEqual(kb.combos("talk"), [{ code: "KeyF" }, { code: "KeyB" }]);
  assert.deepEqual(kb.combos("winBestiary"), [{ code: "KeyV" }]);
  // у Классики W/↑ — два сочетания одного действия: перестановка внутри действия
  assert.deepEqual(kb.rebind("moveUp", 1, { code: "KeyW" }), { ok: true });
  assert.deepEqual(kb.combos("moveUp"), [{ code: "ArrowUp" }, { code: "KeyW" }]);
  // то же сочетание на то же место — ничего не меняет
  assert.deepEqual(kb.rebind("moveUp", 1, { code: "KeyW" }), { ok: true });
  // у владельца не было сочетания на обмен — он остаётся без клавиши
  const ax = new Keybinds(null);
  ax.setPreset("action");
  assert.deepEqual(ax.rebind("talk", 0, { code: "KeyG" }), { ok: true, swapped: "interact" });
  assert.deepEqual(ax.combos("interact"), []);
  assert.deepEqual(ax.combos("talk"), [{ code: "KeyG" }]);
  noDupes(kb, "после обмена");
  noDupes(ax, "после обмена в «Экшене»");
});

test("Backspace в окне настроек: clear убирает сочетание, Esc не трогается", () => {
  const kb = new Keybinds(null);
  kb.clear("moveUp", 0);
  assert.deepEqual(kb.combos("moveUp"), [{ code: "ArrowUp" }]);
  assert.deepEqual(acts(kb, "KeyW"), []);
  kb.clear("escape", 0);
  assert.deepEqual(kb.combos("escape"), [{ code: "Escape" }]);
  kb.clear("slot1", 7);
  assert.deepEqual(kb.combos("slot1"), [{ code: "Digit1" }]);
});

test("сохранение: round-trip через keybinds:v1, хранятся только отличия от схемы, размер < 4 КБ", () => {
  const store = new MemStore();
  const kb = new Keybinds(store);
  assert.equal(store.getItem(STORAGE_KEY), null, "без изменений ничего не пишем");
  kb.rebind("slot1", 0, { code: "Digit2" });
  kb.rebind("talk", 1, { code: "Mouse4" });
  kb.rebind("mount", 0, { code: "KeyX", ctrl: true });
  kb.clear("pet", 0);
  const text = store.getItem(STORAGE_KEY)!;
  assert.ok(text && text.length < 4096);
  const raw = JSON.parse(text);
  assert.equal(raw.v, 1);
  assert.equal(raw.preset, "classic");
  assert.deepEqual(Object.keys(raw.custom).sort(), ["mount", "pet", "slot1", "slot2", "talk"], "только изменённые действия");
  const back = new Keybinds(store);
  assert.deepEqual(back.layout(), kb.layout());
  assert.deepEqual(back.combos("talk"), [{ code: "KeyF" }, { code: "Mouse4" }]);
  assert.deepEqual(acts(back, "KeyX", { ctrl: true }), ["mount"]);
  assert.deepEqual(acts(back, "KeyX"), []);
  // смена схемы сбрасывает отличия и сохраняется
  back.setPreset("action");
  const again = new Keybinds(store);
  assert.equal(again.presetId, "action");
  const fresh = new Keybinds(null);
  fresh.setPreset("action");
  assert.deepEqual(again.layout(), fresh.layout());
  assert.deepEqual(JSON.parse(store.getItem(STORAGE_KEY)!).custom, {});
  // сброс возвращает клавиши схемы
  again.rebind("slot1", 0, { code: "KeyZ" });
  again.reset();
  assert.deepEqual(again.combos("slot1"), [{ code: "KeyQ" }]);
  assert.deepEqual(JSON.parse(store.getItem(STORAGE_KEY)!).custom, {});
  // возвращённое наружу изменить нельзя
  const lay = again.layout();
  lay.slot1.push({ code: "KeyV" });
  lay.slot2[0].code = "KeyV";
  assert.deepEqual(again.combos("slot1"), [{ code: "KeyQ" }]);
  assert.deepEqual(PRESETS.action.layout.slot2, [{ code: "KeyW" }]);
  assert.deepEqual(PRESETS.classic.layout.slot1, [{ code: "Digit1" }]);
});

test("сохранение: мусор, чужие схемы и дубли не ломают раскладку", () => {
  const def = new Keybinds(null).layout();
  for (const text of ["", "null", "[]", "42", "{", '"x"', '{"preset":"constructor"}', '{"preset":"nope","custom":5}', '{"custom":{"slot1":"x","slot2":{}}}']) {
    const store = new MemStore();
    store.setItem(STORAGE_KEY, text);
    assert.deepEqual(new Keybinds(store).layout(), def, JSON.stringify(text));
  }
  // неизвестные действия и Esc из сохранения игнорируются, лишние сочетания обрезаются, сочетание остаётся у одного действия
  const store = new MemStore();
  store.setItem(STORAGE_KEY, JSON.stringify({ v: 1, preset: "classic", custom: {
    bogus: [{ code: "KeyA" }], escape: [{ code: "KeyZ" }], talk: [],
    slot3: [{ code: "Digit4" }, { code: "Digit5", shift: true }, { code: "Digit6" }, "x", null],
    moveUp: [{ code: 5 }, { code: "Key W" }, { code: "ShiftLeft" }],
  } }));
  const kb = new Keybinds(store);
  assert.deepEqual(kb.combos("escape"), [{ code: "Escape" }]);
  assert.deepEqual(kb.combos("talk"), [], "явное «без клавиши» сохраняется");
  assert.deepEqual(kb.combos("slot3"), [{ code: "Digit4" }, { code: "Digit5", shift: true }]);
  assert.deepEqual(kb.combos("slot4"), [], "Digit4 отдан slot3, у slot4 клавиш не осталось");
  assert.deepEqual(kb.combos("moveUp"), [{ code: "KeyW" }, { code: "ArrowUp" }], "ни одного годного сочетания — клавиши схемы");
  noDupes(kb, "из мусора");
  // хранилище, которое бросает исключения
  const boom: Store = { getItem() { throw new Error("denied"); }, setItem() { throw new Error("quota"); } };
  const k2 = new Keybinds(boom);
  assert.deepEqual(k2.layout(), def);
  assert.deepEqual(k2.rebind("slot1", 0, { code: "Digit2" }), { ok: true, swapped: "slot2" });
});

test("нажатия: Ctrl+C не «Герой», Shift+X — следующий маунт, Shift не мешает ходить, Meta и модификаторы сами по себе молчат", () => {
  const kb = new Keybinds(null);
  assert.deepEqual(acts(kb, "KeyC"), ["winChar"]);
  assert.deepEqual(acts(kb, "KeyC", { ctrl: true }), []);
  assert.deepEqual(acts(kb, "KeyC", { alt: true }), []);
  assert.deepEqual(acts(kb, "KeyC", { meta: true }), []);
  assert.deepEqual(acts(kb, "KeyC", { ctrl: true, shift: true }), []);
  assert.deepEqual(acts(kb, "KeyW", { ctrl: true }), [], "Ctrl+W — закрыть вкладку, не движение");
  assert.deepEqual(acts(kb, "KeyW", { shift: true }), ["moveUp"]);
  assert.deepEqual(acts(kb, "ArrowLeft", { shift: true }), ["moveLeft"]);
  assert.deepEqual(acts(kb, "Digit1", { shift: true }), [], "Shift+1 — не умение 1");
  assert.deepEqual(acts(kb, "KeyX", { shift: true }), ["mountNext"]);
  assert.deepEqual(acts(kb, "Tab", { shift: true }), []);
  for (const code of ["ShiftLeft", "ControlRight", "AltLeft", "MetaLeft", "", "Unidentified", "Keyÿÿÿÿÿÿÿÿÿÿÿÿÿÿÿÿÿÿÿÿÿÿÿÿÿÿÿÿÿÿÿÿÿÿÿ"]) assert.deepEqual(acts(kb, code), [], code || "(пусто)");
  assert.deepEqual(kb.actionsFor({ code: undefined as unknown as string, shiftKey: false, ctrlKey: false, altKey: false }), []);
  // свои сочетания с Ctrl работают, если назначены
  kb.rebind("winChar", 0, { code: "KeyC", ctrl: true });
  assert.deepEqual(acts(kb, "KeyC", { ctrl: true }), ["winChar"]);
  assert.deepEqual(acts(kb, "KeyC"), []);
});

test("удерживаемое движение: A и ← — одно направление, противоположные гасят друг друга, отпускание по коду", () => {
  const h = new HeldKeys();
  assert.deepEqual(h.axis(), { mx: 0, my: 0 });
  h.press("KeyA", "moveLeft");
  h.press("ArrowLeft", "moveLeft");
  assert.deepEqual(h.axis(), { mx: -1, my: 0 });
  h.press("KeyW", "moveUp");
  assert.deepEqual(h.axis(), { mx: -1, my: -1 });
  h.press("KeyD", "moveRight");
  assert.deepEqual(h.axis(), { mx: 0, my: -1 });
  h.release("KeyA");
  assert.deepEqual(h.axis(), { mx: 0, my: -1 }, "← ещё зажата");
  h.release("ArrowLeft");
  assert.deepEqual(h.axis(), { mx: 1, my: -1 });
  h.press("KeyS", "moveDown");
  assert.deepEqual(h.axis(), { mx: 1, my: 0 });
  h.clear();
  assert.deepEqual(h.axis(), { mx: 0, my: 0 });
  assert.equal(h.size, 0);
});

test("поле ввода: печатают в text/search/number/password, textarea, select, contenteditable; ползунок, флажок, кнопка — нет", () => {
  for (const type of ["text", "search", "number", "password", "email", "url", "tel", "date", "TEXT"]) assert.ok(isTextField({ tagName: "INPUT", type }), type);
  assert.ok(isTextField({ tagName: "INPUT" }), "input без типа — текст");
  assert.ok(isTextField({ tagName: "input", type: "text" }), "регистр тега");
  for (const type of ["range", "checkbox", "radio", "button", "submit", "reset", "color", "file", "image", "hidden"]) assert.ok(!isTextField({ tagName: "INPUT", type }), type);
  assert.ok(isTextField({ tagName: "TEXTAREA" }));
  assert.ok(isTextField({ tagName: "SELECT", type: "select-one" }));
  assert.ok(isTextField({ tagName: "DIV", isContentEditable: true }));
  for (const el of [{ tagName: "BUTTON" }, { tagName: "DIV" }, { tagName: "BODY" }, { tagName: "CANVAS" }, {}, null, undefined]) assert.ok(!isTextField(el), JSON.stringify(el));
});

test("подписи и справка строятся из раскладки: «1–9», «Q / E», «X / Shift+X», смена схемы меняет текст", () => {
  const kb = new Keybinds(null);
  assert.equal(skillKeys(kb), "1–9");
  assert.equal(kb.label("moveUp"), "W / ↑");
  assert.equal(kb.label("moveUp", 1), "↑");
  assert.equal(kb.label("talk"), "F");
  assert.equal(kb.label("mountNext"), "Shift+X");
  assert.equal(kb.slotLabel(0), "1");
  assert.equal(kb.slotLabel(8), "9");
  assert.equal(kb.slotLabel(9), "");
  assert.equal(kb.slotLabel(-1), "");
  const rows = new Map(hotkeyRows(kb));
  assert.equal(rows.get("WASD / стрелки / клик"), "движение");
  assert.equal(rows.get("1–9"), "умения");
  assert.equal(rows.get("Q / E"), "зелья здоровья и маны");
  assert.equal(rows.get("Tab"), "следующая цель");
  assert.equal(rows.get("Пробел"), "подобрать предмет или поговорить");
  assert.equal(rows.get("F"), "поговорить с NPC");
  assert.equal(rows.get("X / Shift+X"), "ездовое животное");
  assert.equal(rows.get("G / Shift+G"), "питомец");
  assert.equal(rows.get("C / I / K"), "герой / сумка / умения");
  assert.equal(rows.get("P / B / M"), "арена / бестиарий / карта");
  assert.equal(rows.get("Enter"), "чат");
  assert.equal(rows.get("Esc"), "закрыть окно, снять цель, меню");
  assert.ok(![...rows.keys()].some((k) => k === "1–4"), "старой справки «1–4» нет");
  // «Экшен»
  kb.setPreset("action");
  assert.equal(skillKeys(kb), "Q W E R A S D F T");
  const a = new Map(hotkeyRows(kb));
  assert.equal(a.get("стрелки / клик"), "движение");
  assert.equal(a.get("Q W E R A S D F T"), "умения");
  assert.equal(a.get("1 / 2"), "зелья здоровья и маны");
  assert.equal(a.get("G"), "подобрать предмет или поговорить");
  assert.equal(a.get("Z / Shift+Z"), "питомец");
  assert.ok(![...a.values()].includes("поговорить с NPC"), "строки без клавиши пропускаются");
  // перестановка умений меняет «1–9» на перечисление
  const kb2 = new Keybinds(null);
  kb2.rebind("slot1", 0, { code: "Digit2" });
  assert.equal(skillKeys(kb2), "2 1 3 4 5 6 7 8 9");
  // подписи сочетаний
  assert.equal(comboLabel({ code: "KeyX", shift: true }), "Shift+X");
  assert.equal(comboLabel({ code: "KeyK", ctrl: true, alt: true, shift: true }), "Ctrl+Alt+Shift+K");
  assert.equal(comboLabel({ code: "Space" }), "Пробел");
  assert.equal(comboLabel({ code: "ArrowDown" }), "↓");
  assert.equal(comboLabel({ code: "Mouse3" }), "СКМ");
  assert.equal(comboLabel({ code: "Mouse4" }), "Mouse4");
  assert.equal(comboLabel({ code: "Numpad5" }), "Num 5");
  assert.equal(comboLabel({ code: "F10" }), "F10");
});

test("кнопки мыши: СКМ, Mouse4, Mouse5 назначаются, ЛКМ и ПКМ — указатель игры", () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5].map(mouseCode), [null, "Mouse3", null, "Mouse4", "Mouse5", null]);
  const kb = new Keybinds(null);
  assert.deepEqual(kb.rebind("slot1", 0, { code: "Mouse4" }), { ok: true });
  assert.deepEqual(kb.combos("slot1"), [{ code: "Mouse4" }]);
  assert.deepEqual(acts(kb, "Digit1"), [], "Digit1 освободилась");
});

test("подписка на смену: вызывается при изменении, отписка работает", () => {
  const kb = new Keybinds(null);
  let n = 0;
  const off = kb.onChange(() => n++);
  kb.rebind("slot1", 0, { code: "Digit2" });
  kb.clear("slot2", 0);
  kb.setPreset("action");
  kb.reset();
  assert.equal(n, 4);
  kb.rebind("slot1", 0, { code: "KeyZ" });
  assert.equal(n, 5);
  off();
  kb.rebind("slot1", 0, { code: "KeyV" });
  assert.equal(n, 5);
  kb.rebind("slot1", 0, { code: "ShiftLeft" });
  assert.equal(n, 5, "отказ не считается изменением");
});

console.log(`keybinds: ${count} проверок пройдено`);
