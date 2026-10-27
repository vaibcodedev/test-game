/** Общее для тестов подземелья «Пепельные чертоги»: спуск по лестнице входа и подъём по лестнице выхода через резервации комнат. */
import { DUNGEON_EXIT } from "../shared/dungeon";
import { DUNGEON_DOOR } from "../shared/map";
import { Bot, sleep } from "./harness";

export const DOOR_STAND = { x: DUNGEON_DOOR.x, y: DUNGEON_DOOR.y + 28 };

/** Герой в мире встаёт у лестницы, жмёт вход и переходит в комнату подземелья. */
export async function intoDungeon(b: Bot) {
  let go: any = null;
  b.room.onMessage("dungeon:go", (m: any) => { go = m; });
  b.send("dbg", { op: "tp", x: DOOR_STAND.x, y: DOOR_STAND.y });
  await sleep(400);
  b.send("dungeon:enter", {});
  await b.until(() => !!go, 5000, "dungeon:go");
  await b.switchTo(go.reservation);
}
/** Подъём: герой у лестницы выхода жмёт выход и возвращается в мир. */
export async function outOfDungeon(b: Bot) {
  let ret: any = null;
  b.room.onMessage("dungeon:return", (m: any) => { ret = m; });
  b.send("dbg", { op: "tp", x: DUNGEON_EXIT.x, y: DUNGEON_EXIT.y + 10 });
  await sleep(400);
  b.send("dungeon:leave", {});
  await b.until(() => !!ret, 5000, "dungeon:return");
  await b.switchTo(ret.reservation);
}
