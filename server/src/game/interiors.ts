/**
 * Двери интерьеров на сервере (задача 144, shared/interiors.ts): вход по двери здания снаружи, выход — по двери изнутри.
 * Герой переносится в зал за краем карты мира и обратно как есть: группа, бафы, питомец (догоняет хозяина сам), маунт. В бою входить нельзя.
 * Клиент шлёт намерение «door» с id зала; сервер проверяет дальность и бой, шлёт «int» ph=fade (клиент затемняет экран), через DOOR_FADE_MS
 * переносит героя и шлёт ph=arrive (клиент ставит камеру на зал или на улицу и проявляет кадр).
 */
import { DOOR_FADE_MS, DOOR_RANGE, interiorAt, interiorById, type Interior } from "../../../shared/interiors";
import type { On } from "../rooms/common";
import type { Player } from "./Player";
import type { World } from "./World";

const err = (p: Player, text: string) => p.send("toast", { text, kind: "error" });
/** Герои, которых уже переносят (повторное нажатие во время затемнения ничего не делает). */
const moving = new WeakSet<Player>();

/** Нажатие двери зала id: изнутри — выход на улицу, снаружи — вход. Возвращает текст отказа или null. */
export function useDoor(w: World, p: Player, id: unknown): string | null {
  const room = typeof id === "string" ? interiorById(id) : undefined;
  if (!room || p.dead || p.team !== 0 || moving.has(p)) return "";
  const inside = interiorAt(p.x, p.y);
  if (inside && inside !== room) return "";
  const door = inside ? room.exitDoor : room.outDoor;
  if (w.dist(p, door) > DOOR_RANGE) return "Подойдите к двери";
  if (!inside && p.inCombat(w.time)) return "Нельзя войти в бою";
  if (p.tele || p.mountCast || p.stunUntil > w.time) return "Сейчас нельзя";
  const to = inside ? room.outSpot : room.entry;
  moving.add(p);
  p.input = { mx: 0, my: 0 };
  p.moveTo = null;
  w.stopFollow(p, false);
  p.send("int", { ph: "fade", id: room.id, ms: DOOR_FADE_MS });
  w.later(DOOR_FADE_MS, () => {
    moving.delete(p);
    if (!w.players.has(p.id)) return;
    // погиб за время затемнения — остаётся на месте, кадр у клиента проявляется
    if (p.dead) return void p.send("int", { ph: "arrive", id: "", x: p.x, y: p.y });
    place(p, to.x, to.y);
    p.send("int", { ph: "arrive", id: inside ? "" : room.id, x: to.x, y: to.y });
  });
  return null;
}

function place(p: Player, x: number, y: number) {
  p.unit.x = x;
  p.unit.y = y;
  p.unit.dir = 0;
  p.moveTo = null;
  p.input = { mx: 0, my: 0 };
  p.nav.reset();
  p.selfDirty = true;
}

/** Куда сохранить героя в зале: на улицу перед дверью (зал — не место для входа в игру). */
export function saveSpot(x: number, y: number): { x: number; y: number } | null {
  const r: Interior | null = interiorAt(x, y);
  return r ? r.outSpot : null;
}

export function registerInteriors(on: On, w: () => World) {
  on<{ id: unknown }>("door", (p, m) => {
    const why = useDoor(w(), p, m.id);
    if (why) err(p, why);
  });
}
