/** Админ-команды ("admin:*"): права читаются из БД на каждое действие, остальные игроки игнорируются. */
import { LEGENDARIES, makeLegendary } from "../../../shared/legendary";
import { BASE_ITEMS, ITEM_MODELS, canEquip, isTwoHanded, itemName, makeItem, makeUnique, UNIQUES, Rarity, type Item } from "../../../shared/items";
import { MAX_PLUS } from "../../../shared/upgrade";
import { MAX_LEVEL, PLAYER_RADIUS, TILE } from "../../../shared/constants";
import { xpToNext } from "../../../shared/formulas";
import { walkable, ZONES, type WorldMap } from "../../../shared/map";
import { MOBS } from "../../../shared/mobs";
import { cleanText, num } from "../rooms/common";
import type { On } from "../rooms/common";
import type { WorldRoom } from "../rooms/WorldRoom";
import { GameDB } from "../db";
import { createBoss } from "./bosses";
import { Mob } from "./Mob";
import type { Player } from "./Player";
import { gainXp } from "./rewards";
import { addItem, equip } from "./inventory";
import { startEncounter, type EncKind } from "./encounters";
import { MOUNTS } from "../../../shared/mounts";
import { awardMount } from "./mountDrops";

const PERMA = 9e12;
/** Телепорт по координатам (карта админ-панели, поля x, y): насколько далеко, в тайлах, искать проходимую клетку, если в точку встать нельзя. */
const TP_SNAP_TILES = 6;

/**
 * Куда встать при телепорте в точку (x, y), пиксели. Точка проходима — она и есть. Иначе спираль по кольцам тайлов вокруг неё (до TP_SNAP_TILES,
 * кольцо 0 — собственная клетка): берётся центр ближайшей по прямой проходимой клетки; кольцо дальше найденной точки уже не просматривается.
 * Нет прохода рядом — null.
 */
function nearestWalkable(map: WorldMap, x: number, y: number): { x: number; y: number } | null {
  if (walkable(map, x, y, PLAYER_RADIUS)) return { x, y };
  const cx = Math.floor(x / TILE), cy = Math.floor(y / TILE);
  let best: { x: number; y: number } | null = null, bd = Infinity;
  for (let ring = 0; ring <= TP_SNAP_TILES; ring++) {
    if (best && (ring - 0.5) * TILE >= bd) break; // центр любой клетки кольца ring дальше от точки, чем (ring − 0.5) тайла
    for (let dy = -ring; dy <= ring; dy++) for (let dx = -ring; dx <= ring; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue; // только само кольцо
      const tx = cx + dx, ty = cy + dy;
      if (tx < 0 || ty < 0 || tx >= map.w || ty >= map.h) continue;
      const px = (tx + 0.5) * TILE, py = (ty + 0.5) * TILE, d = Math.hypot(px - x, py - y);
      if (d < bd && walkable(map, px, py, PLAYER_RADIUS)) { best = { x: px, y: py }; bd = d; }
    }
  }
  return best;
}

export function registerAdmin(room: WorldRoom, on: On) {
  const db = () => room.db();
  const w = () => room.world;
  const str = (v: unknown, max = 60) => (typeof v === "string" ? cleanText(v).slice(0, max) : "");
  const toast = (p: Player, text: string, kind = "info") => p.send("toast", { text, kind });

  /** Отказы не-админам пишем не чаще раза в DENY_LOG_MS на игрока и тип сообщения: иначе поток сообщений раздувает БД и консоль. */
  const deniedAt = new Map<string, number>();
  const DENY_LOG_MS = 10_000;
  /** Регистрирует админ-сообщение: не-админ молча игнорируется и пишется в журнал как попытка (с ограничением частоты). */
  const adm = <T>(type: string, fn: (p: Player, m: T) => void) =>
    on<T>(type, (p, m) => {
      if (!db().isAdmin(p.name)) {
        p.admin = false;
        const now = Date.now(), key = p.name + "|" + type;
        if (now - (deniedAt.get(key) ?? 0) < DENY_LOG_MS) return;
        if (deniedAt.size > 500) for (const [k, at] of deniedAt) if (now - at >= DENY_LOG_MS) deniedAt.delete(k);
        deniedAt.set(key, now);
        console.warn(`[admin] попытка без прав: ${p.name} -> ${type}`);
        try { db().adminLog(p.name, "denied:" + type, "", {}); } catch {}
        return;
      }
      p.admin = true;
      fn(p, m);
    });
  const log = (p: Player, action: string, target: string, details: unknown = {}) => db().adminLog(p.name, action, target, details);
  const online = (name: string) => w().findByName(GameDB.key(name));

  adm("admin:players", (p) => {
    p.send("admin:players", [...w().players.values()].map((x) => ({ name: x.name, cls: x.cls, level: x.level, x: Math.round(x.unit.x), y: Math.round(x.unit.y), admin: x.admin })));
  });

  /**
   * Выдача предмета. Ключ id — один из: model (модель каталога data/items.json), base (база/расходник), unique (босс; для совместимости
   * принимает и легендарный), legendary. Числа строго проверяются: редкость 0..2 (3 бывает только у настоящих легендарок из каталога),
   * ilvl 1..100 (у модели по умолчанию её уровень), заточка 0..MAX_PLUS, количество 1..99; не целое или вне диапазона — отказ, ничего
   * не выдаётся. equip — сразу надеть (одну вещь). Итог всегда один: тост админу и сообщение admin:give:result { kind, text, given, worn }.
   */
  adm<{ name: unknown; model: unknown; base: unknown; unique: unknown; legendary: unknown; mount: unknown; rarity: unknown; ilvl: unknown; plus: unknown; qty: unknown; equip: unknown }>("admin:give", (p, m) => {
    const reply = (kind: "info" | "warn" | "error", text: string, extra: object = {}) => {
      toast(p, text, kind === "info" ? "info" : "error");
      p.send("admin:give:result", { kind, text, given: 0, worn: false, ...extra });
    };
    const t = online(str(m.name));
    if (!t) return reply("error", "Игрок не в сети");
    // маунт: награда «Маунты» из data/mounts.json
    if (typeof m.mount === "string" && m.mount) {
      if (!Object.hasOwn(MOUNTS, m.mount)) return reply("error", `Нет маунта «${m.mount}»`);
      const ok = awardMount(t, m.mount);
      log(p, "give", t.name, { mount: m.mount, given: ok ? 1 : 0 });
      return reply(ok ? "info" : "warn", ok ? `Выдан маунт ${MOUNTS[m.mount].name} → ${t.name}` : `${t.name} уже имеет маунт ${MOUNTS[m.mount].name}`, { given: ok ? 1 : 0 });
    }
    // таблицы — обычные объекты: ключи прототипа («constructor», «__proto__») за предмет не считаются
    const own = (o: object, k: string) => Object.hasOwn(o, k);
    const sm = str(m.model), sl = str(m.legendary), su = str(m.unique), sb = str(m.base);
    const id = sm || sl || su || sb;
    let kind: "model" | "legendary" | "unique" | "base";
    if (sm) { if (!own(ITEM_MODELS, id)) return reply("error", `Нет модели «${id}»`); kind = "model"; }
    else if (sl) { if (!own(LEGENDARIES, id)) return reply("error", `Нет легендарного предмета «${id}»`); kind = "legendary"; }
    else if (su && own(LEGENDARIES, id)) kind = "legendary";
    else if (su && own(UNIQUES, id)) kind = "unique";
    else if (!su && (own(BASE_ITEMS, id) || own(ITEM_MODELS, id))) kind = "base";
    else return reply("error", `Нет предмета «${id}»`);
    const int = (v: unknown, min: number, max: number, def: number): number | undefined =>
      v === undefined || v === null ? def : typeof v === "number" && Number.isInteger(v) && v >= min && v <= max ? v : undefined;
    const fixed = kind === "legendary" || kind === "unique";
    const rarity = int(m.rarity, 0, kind === "legendary" ? 3 : 2, 0), ilvl = int(m.ilvl, 1, MAX_LEVEL, own(ITEM_MODELS, id) ? ITEM_MODELS[id].lvl : 1);
    const plus = int(m.plus, 0, MAX_PLUS, 0), qty = int(m.qty, 1, 99, 1);
    if (rarity === undefined || ilvl === undefined || plus === undefined || qty === undefined || (m.equip !== undefined && typeof m.equip !== "boolean"))
      return reply("error", `Неверные значения: редкость 0–2, ур. предмета 1–${MAX_LEVEL}, заточка 0–${MAX_PLUS}, количество 1–99`);
    const mk = (): Item => {
      const it = kind === "legendary" ? makeLegendary(id) : kind === "unique" ? makeUnique(id) : makeItem(id, ilvl, rarity as Rarity);
      if (plus && BASE_ITEMS[it.base].slot !== "consumable") it.plus = plus;
      return it;
    };
    let first: Item;
    try { first = mk(); } catch { return reply("error", `Не удалось создать предмет «${id}»`); }
    const stack = BASE_ITEMS[first.base].stack ?? 0;
    const want = fixed || stack ? (stack ? qty : 1) : qty;
    let given = 0;
    if (stack) {
      // место считаем заранее: addItem при нехватке места не откатывает уже долитые стопки
      let room = 0;
      for (const s of t.save.inventory) room += !s ? stack : s.base === first.base ? Math.max(0, stack - (s.qty ?? 1)) : 0;
      given = Math.min(qty, room);
      if (given) { first.qty = given; if (!addItem(t, first)) given = 0; }
    } else for (let i = 0; i < want; i++) if (addItem(t, i ? mk() : first)) given++;
    t.selfDirty = true;
    const nm = itemName(first);
    if (!given) {
      log(p, "give", t.name, { id, rarity: first.rarity, ilvl: first.ilvl, plus, qty, given, equip: false });
      return reply("error", `Нет места в сумке: ${nm} не выдано → ${t.name}`);
    }
    // надеть: причину отказа отдаём админу в том же ответе (equip() сам шлёт тост получателю)
    let worn = false, notWorn = "";
    if (m.equip === true && BASE_ITEMS[first.base].slot !== "consumable") {
      const why = canEquip(first, t.cls, t.level), at = t.save.inventory.indexOf(first), slot = BASE_ITEMS[first.base].slot;
      if (why) notWorn = why.charAt(0).toLowerCase() + why.slice(1);
      else if (at < 0) notWorn = "вещь не попала в сумку";
      else {
        equip(w(), t, at, true); // выдача админом: и в бою
        worn = Object.values(t.save.equip).includes(first);
        t.selfDirty = true;
        if (!worn) notWorn = slot === "offhand" && isTwoHanded(t.save.equip.weapon?.base) ? "двуручное оружие занимает обе руки" : slot === "weapon" && isTwoHanded(first.base) && t.save.equip.offhand ? "сумка полна: некуда снять вторую руку" : "не удалось надеть";
      }
    }
    toast(t, `Администратор выдал: ${nm}${given > 1 ? " ×" + given : ""}`, "loot");
    const part = given < want ? ` · не влезло: ${want - given}` : "";
    const text = `Выдано ${nm}${given > 1 ? " ×" + given : ""}${worn ? " (надето)" : ""} → ${t.name}${part}${notWorn ? ` · не надето: ${notWorn}` : ""}`;
    reply(notWorn || part ? "warn" : "info", text, { given, worn });
    log(p, "give", t.name, { id, rarity: first.rarity, ilvl: first.ilvl, plus, qty, given, equip: worn, ...(notWorn ? { notWorn } : {}) });
  });

  adm<{ name: unknown; v: unknown }>("admin:gold", (p, m) => {
    const t = online(str(m.name));
    const v = Math.round(num(m.v, -1e7, 1e7) ?? 0);
    if (!t || !v) return toast(p, "Игрок не в сети или сумма 0", "error");
    t.save.gold = Math.max(0, t.save.gold + v);
    t.selfDirty = true;
    toast(p, `Золото ${t.name}: ${v > 0 ? "+" : ""}${v}`);
    log(p, "gold", t.name, { v });
  });

  adm<{ name: unknown; xp: unknown; level: unknown }>("admin:xp", (p, m) => {
    const t = online(str(m.name));
    if (!t) return toast(p, "Игрок не в сети", "error");
    const lv = Math.round(num(m.level, 1, MAX_LEVEL) ?? 0);
    const xp = Math.round(num(m.xp, 0, 1e7) ?? 0);
    if (lv) while (t.level < lv) gainXp(w(), t, xpToNext(t.level) - t.save.xp);
    if (xp) gainXp(w(), t, xp);
    toast(p, `${t.name}: уровень ${t.level}`);
    log(p, "xp", t.name, { level: lv, xp });
  });

  adm<{ name: unknown; x: unknown; y: unknown; zone: unknown }>("admin:tp", (p, m) => {
    let pos: { x: number; y: number } | null = null;
    const target = str(m.name);
    let what = "";
    if (target) {
      const t = online(target);
      if (t) { pos = { x: t.unit.x, y: t.unit.y }; what = t.name; }
    } else if (typeof m.zone === "number" && ZONES[m.zone] && ZONES[m.zone].name !== "Арена") {
      const z = ZONES[m.zone];
      pos = z.safe ? w().map.playerSpawn : w().map.spawns.find((s) => z.mobs.includes(s.mob)) ?? null;
      what = z.name;
    } else {
      // по координатам (карта админ-панели, поля x, y): в стену, воду или за край карты не ставим — на ближайшую проходимую клетку
      const x = num(m.x, 0, 1e6), y = num(m.y, 0, 1e6);
      if (x !== null && y !== null) {
        pos = nearestWalkable(w().map, x, y);
        if (!pos) return toast(p, "Рядом нет прохода", "error");
        what = `${Math.round(x)},${Math.round(y)}`;
      }
    }
    if (!pos) return toast(p, "Цель телепорта не найдена", "error");
    p.unit.x = pos.x;
    p.unit.y = pos.y;
    p.moveTo = null;
    p.selfDirty = true;
    log(p, "tp", what, { x: Math.round(pos.x), y: Math.round(pos.y) });
  });

  const kick = (name: string, reason: string) => {
    const t = online(name);
    if (t) room.clients.getById(t.id)?.leave(4001, reason);
    return !!t;
  };
  adm<{ name: unknown }>("admin:kick", (p, m) => {
    const name = str(m.name);
    toast(p, kick(name, "Вы отключены администратором") ? `Отключён: ${name}` : "Игрок не в сети", "info");
    log(p, "kick", name);
  });
  adm<{ name: unknown; hours: unknown; reason: unknown }>("admin:ban", (p, m) => {
    const name = str(m.name);
    const hours = num(m.hours, 0, 24 * 365) ?? 0;
    const reason = str(m.reason, 120);
    const until = hours > 0 ? Date.now() + hours * 3600_000 : PERMA;
    if (!db().setBan(name, until, reason)) return toast(p, "Такого героя нет", "error");
    kick(name, "Аккаунт заблокирован");
    toast(p, `Заблокирован: ${name}`);
    log(p, "ban", name, { hours, reason });
  });
  adm<{ name: unknown }>("admin:unban", (p, m) => {
    const name = str(m.name);
    toast(p, db().setBan(name, 0, "") ? `Разблокирован: ${name}` : "Такого героя нет", "info");
    log(p, "unban", name);
  });

  /** Живые призванные монстры (admin:spawn любого админа) для вкладки «Мир»: ближние к админу сверху; d — расстояние в тайлах. */
  const sendSummoned = (p: Player) => p.send("admin:summoned", [...w().mobs.values()]
    .filter((x) => x.summoned && x.state !== "dead")
    .map((x) => ({ id: x.id, name: x.def.name, level: x.level, hp: Math.max(0, Math.round(x.unit.hp)), maxHp: x.unit.maxHp, boss: !!x.def.boss, d: Math.round(Math.hypot(x.unit.x - p.unit.x, x.unit.y - p.unit.y) / TILE) }))
    .sort((a, b) => a.d - b.d));
  /** Гибель от руки админа: без убийцы и без списка нанёсших урон — добыча и опыт никому; призванный исчезает после анимации (killMob),
   *  обычный возродится по своему таймеру. */
  const adminKill = (x: Mob) => {
    x.damageBy.clear();
    x.unit.hp = 0;
    w().killMob(x);
  };

  adm<{ mob: unknown; level: unknown }>("admin:spawn", (p, m) => {
    const def = MOBS[str(m.mob)];
    if (!def) return toast(p, "Нет такого моба", "error");
    const world = w();
    const level = def.level ?? Math.round(num(m.level, 1, 60) ?? p.level);
    const mob = new Mob(world.uid(def.boss ? "b" : "m"), def, level, { x: p.unit.x + 48, y: p.unit.y });
    mob.summoned = true; // без респауна, убирается после смерти
    if (def.boss) mob.boss = createBoss(world, mob, 300);
    world.addMob(mob);
    log(p, "spawn", def.id, { level, x: Math.round(p.unit.x), y: Math.round(p.unit.y) });
    sendSummoned(p);
  });

  adm("admin:summoned", (p) => sendSummoned(p));

  /** «Убить» призванного (id) или «Убить всех призванных» (all: true). */
  adm<{ id: unknown; all: unknown }>("admin:despawn", (p, m) => {
    const all = m.all === true;
    const list = [...w().mobs.values()].filter((x) => x.summoned && x.state !== "dead" && (all || x.id === m.id));
    for (const x of list) adminKill(x);
    if (!list.length) toast(p, all ? "Призванных монстров нет" : "Этот монстр уже погиб", "error");
    log(p, "despawn", all ? "все" : str(m.id), { n: list.length });
    sendSummoned(p);
  });

  /** «Убить цель»: монстр в цели админа — любой, не только призванный. */
  adm("admin:kill-target", (p) => {
    const t = w().mobs.get(p.unit.target);
    if (!t || t.state === "dead") return toast(p, "В цели нет живого монстра", "error");
    adminKill(t);
    toast(p, `Убит: ${t.def.name}`, "info");
    log(p, "kill", t.def.id, { level: t.level, summoned: t.summoned });
    sendSummoned(p);
  });

  adm<{ name: unknown; kind: unknown }>("admin:encounter", (p, m) => {
    const t = str(m.name) ? online(str(m.name)) : p;
    const kind = ["traveler", "ambush", "merchant"].includes(str(m.kind)) ? (str(m.kind) as EncKind) : undefined;
    if (!t) return toast(p, "Игрок не в сети", "error");
    const title = startEncounter(w(), t, kind);
    toast(p, title ? `Встреча: ${title} → ${t.name}` : "Встреча не создана (уже есть или город/подземелье)", title ? "info" : "error");
    log(p, "encounter", t.name, { kind: kind ?? "random", ok: !!title });
  });

  adm<{ text: unknown }>("admin:announce", (p, m) => {
    const text = str(m.text, 140);
    if (!text) return;
    w().system(`[Объявление] ${text}`);
    room.broadcast("admin:banner", { text });
    log(p, "announce", "", { text });
  });

  adm<{ kind: unknown; name: unknown }>("admin:logs", (p, m) => {
    const name = str(m.name, 16);
    if (m.kind === "trades") p.send("admin:logs", { kind: "trades", rows: db().tradeLogRows(name) });
    else p.send("admin:logs", { kind: "admin", rows: db().adminLogRows(name) });
  });
}
