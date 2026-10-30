/** Общие заготовки быстрых тестов: мир без сети (карта мира, без мобов), герои с почтовым ящиком, база в памяти. */
import { World } from "../../server/src/game/World";
import { Player, newSave } from "../../server/src/game/Player";
import { WorldState } from "../../server/src/rooms/schema";
import { GameDB } from "../../server/src/db";
import type { ClassId } from "../../shared/classes";
import { makeItem, Rarity, type Item } from "../../shared/items";
import { inbox } from "./lib";

let shared: World | null = null;
/** Один мир на файл (генерация карты дорогая); герои между тестами удаляются через drop(). */
export function world(): World {
  return (shared ??= new World(new WorldState(), () => {}, { mobs: false, quiet: true } as never));
}

let uid = 0;
export type Hero = Player & { box: ReturnType<typeof inbox> };
export function hero(w: World, cls: ClassId = "warrior", at?: { x: number; y: number }, level = 30): Hero {
  const box = inbox();
  const spot = at ?? w.map.playerSpawn;
  const save = newSave(cls, spot);
  save.level = level;
  const n = ++uid;
  const p = new Player(`u${n}`, `Тестер${n}`, save, box.send) as Hero;
  p.box = box;
  w.addPlayer(p);
  p.unit.x = spot.x;
  p.unit.y = spot.y;
  p.combatAt = -1e12; // не в бою
  return p;
}
export function drop(w: World, ...ps: Player[]) {
  for (const p of ps) w.removePlayer(p.id);
}
/** Поставить героя к NPC (в пределах дальности услуг). */
export function at(p: Player, npc: { x: number; y: number }, dx = 0, dy = 24) {
  p.unit.x = npc.x + dx;
  p.unit.y = npc.y + dy;
}
/** Очистить сумку (размер сохраняется). */
export function emptyBag(p: Player) {
  p.save.inventory = p.save.inventory.map(() => null);
}
/** Заполнить все пустые ячейки сумки мечами. */
export function fillBag(p: Player) {
  p.save.inventory = p.save.inventory.map((it) => it ?? makeItem("sword", 5, Rarity.Common));
}
export const gear = (base = "sword", ilvl = 10, r = Rarity.Rare): Item => makeItem(base, ilvl, r);
export const stack = (base: string, qty: number): Item => ({ ...makeItem(base, 1, Rarity.Common), qty });
/** Сумма qty предмета base в сумке. */
export const countIn = (cells: (Item | null)[], base: string) => cells.reduce((n, it) => n + (it && it.base === base ? it.qty ?? 1 : 0), 0);
export const uids = (cells: (Item | null)[]) => cells.filter(Boolean).map((it) => it!.uid);

/** База в памяти с аккаунтом и героем (save пишется в players). */
export function memDb() {
  return new GameDB(":memory:");
}
export function register(db: GameDB, p: Player, login = p.name): number {
  const id = db.accountCreate(login, "secret-pass");
  db.createChar(id, p.name, p.save);
  p.accountId = id;
  return id;
}

/** Подменить Date.now на время fn (сдвиг вперёд в мс). */
export function shiftNow(ms: number) {
  const orig = Date.now;
  const base = orig();
  Date.now = () => base + ms;
  return () => void (Date.now = orig);
}
