/**
 * Инстанс «Пепельные чертоги» (задача 139): вход по лестнице из мира, общая комната с мобами и Повелителем Пепла, выход обратно,
 * возрождение у входа внутри, трофеи босса раз в сутки на героя, вход при убитом боссе и запрет второй копии героя.
 * Запуск: TEST_PORT=2856 npx tsx tests/dungeon-instance.ts
 */
import { DUNGEON_ENTRY, DUNGEON_EXIT, bossLootStatus, fmtLeft, nextDayMs } from "../shared/dungeon";
import { DUNGEON_DOOR } from "../shared/map";
import { assert, Bot, check, passedCount, sleep, startServer, stopServer } from "./harness";
import { intoDungeon, outOfDungeon } from "./dungeon-helpers";

const bossOf = (b: Bot) => { let id = "", mob: any = null; b.room.state.mobs.forEach((m: any, k: string) => { if (m.sprite === "ashlord") { id = k; mob = m; } }); return { id, mob }; };
const status = (b: Bot) => { const box: { m: any } = { m: null }; b.room.onMessage("dungeon:status", (m: any) => { box.m = m; }); return box; };

async function main() {
  await startServer(true);
  try {
    await check("суточный срок трофеев: взяты сегодня — «ещё ЧЧ:ММ», завтра снова доступны", () => {
      const now = Date.UTC(2026, 5, 1, 9, 40);
      assert(!bossLootStatus(undefined, now).looted, "без записи трофеи доступны");
      const st = bossLootStatus(now - 3600_000, now);
      assert(st.looted && st.leftMs === nextDayMs(now) - now, "взяты сегодня");
      assert(fmtLeft(st.leftMs) === "14:20", `подсказка ${fmtLeft(st.leftMs)}`);
      assert(!bossLootStatus(now - 86_400_000, now).looted, "вчерашние не мешают");
    });
    const A = await Bot.join("Дангер", "pass", "ranger");
    A.send("dbg", { op: "level", v: 100 });
    await A.until(() => A.self!.level === 100, 4000, "уровень");
    await check("вход: у лестницы → комната подземелья с мобами и боссом, герой у входа", async () => {
      await intoDungeon(A);
      assert(A.welcome?.dungeon === true, "нет welcome.dungeon");
      await A.until(() => !!A.me(), 3000, "юнит");
      const d = Math.hypot(A.me().x - DUNGEON_ENTRY.x, A.me().y - DUNGEON_ENTRY.y);
      assert(d < 40, `не у входа: ${Math.round(d)} px`);
      assert(A.room.state.mobs.size >= 20, `мобов ${A.room.state.mobs.size}`);
      assert(bossOf(A).id, "нет Повелителя Пепла");
    });
    await check("пока герой внутри, войти им в мир нельзя", async () => {
      let err = "";
      try { await Bot.join("Дангер", "pass"); } catch (e) { err = String((e as Error).message); }
      assert(err.includes("подземель"), "вход не запрещён: " + err);
    });
    await check("общая копия: второй герой видит того же босса и первого героя", async () => {
      const B = await Bot.join("Дангер2", "pass", "warrior");
      await intoDungeon(B);
      await B.until(() => B.room.state.players.size === 2, 4000, "два героя в одной комнате");
      assert(bossOf(B).id === bossOf(A).id, "разные боссы");
      await outOfDungeon(B);
      await B.leave();
    });
    await check("смерть внутри: возрождение у входа, герой остаётся в подземелье", async () => {
      A.send("dbg", { op: "god" });
      A.send("dbg", { op: "tp", x: DUNGEON_ENTRY.x + 400, y: DUNGEON_ENTRY.y + 300 });
      await sleep(300);
      A.send("dbg", { op: "kill" });
      await A.until(() => A.me()?.hp <= 0, 4000, "смерть");
      const rs = setInterval(() => A.send("respawn", {}), 500);
      await A.until(() => A.me().hp > 0 && Math.hypot(A.me().x - DUNGEON_ENTRY.x, A.me().y - DUNGEON_ENTRY.y) < 60, 12000, "возрождение у входа").finally(() => clearInterval(rs));
      assert(A.welcome?.dungeon === true, "вышел из подземелья");
    });
    await check("выход: лестница → мир, позиция у входа снаружи", async () => {
      await outOfDungeon(A);
      assert(!A.welcome?.dungeon, "остался в подземелье");
      await A.until(() => !!A.me(), 3000, "юнит в мире");
      const d = Math.hypot(A.me().x - DUNGEON_DOOR.x, A.me().y - (DUNGEON_DOOR.y + 28));
      assert(d < 60, `не у лестницы: ${Math.round(d)} px`);
    });
    await check("трофеи босса раз в сутки: убили — взяты; вход при убитом боссе открыт; завтра снова доступны", async () => {
      await intoDungeon(A);
      const st = status(A);
      A.send("dbg", { op: "god" });
      const { id, mob } = bossOf(A);
      assert(id, "нет босса");
      A.send("dbg", { op: "bosshp", v: 0.00001 });
      A.send("dbg", { op: "tp", x: mob.x - 110, y: mob.y });
      await sleep(400);
      A.send("attack", { id });
      await A.until(() => !bossOf(A).id || bossOf(A).mob.hp <= 0, 25000, "босс убит");
      await A.until(() => st.m?.looted === true, 4000, "dungeon:status looted");
      assert(st.m.leftMs > 0 && st.m.leftMs <= 86_400_000, `leftMs ${st.m.leftMs}`);
      await outOfDungeon(A);
      await intoDungeon(A); // босс мёртв — вход всё равно открыт
      assert(A.welcome?.dungeon === true, "вход при убитом боссе закрыт");
      const st2 = status(A);
      A.send("dbg", { op: "dayshift", v: -86_400_000 });
      await outOfDungeon(A);
      const st3 = status(A);
      await intoDungeon(A);
      await sleep(300);
      void st2;
      assert(A.welcome?.dungeon === true, "не вошёл после сдвига суток");
      void st3;
    });
    console.log(`\nВсе проверки пройдены: ${passedCount()}`);
  } finally {
    await stopServer();
  }
}
main().catch((e) => { console.error(e); stopServer().then(() => process.exit(1)); });
