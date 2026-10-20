/**
 * Рейд через комнаты (задача 114): клиент у Вестника → сбор → raid:go → welcome с raid → выход → raid:return.
 * Золото сохранено, позиция — та, что до рейда; вход тем же героем в мир во время рейда отклоняется.
 * Запускается из tests/raid.ts (--only room) или отдельно: npx tsx tests/raid-room.ts. Порт — TEST_PORT (по умолчанию 2601).
 */
import { RAID_HERALDS } from "../shared/raid";
import { assert, Bot, check, sleep, startServer, stopServer } from "./harness";

/** Подписка на сообщения рейда в текущей комнате бота (после перехода — заново). */
function hook(b: Bot, box: Record<string, any>) {
  for (const t of ["raid:muster", "raid:go", "raid:return", "raid:result", "raid:banner", "raid:cast"]) b.room.onMessage(t, (m: any) => { box[t] = m; });
}

export async function roomTest(): Promise<number> {
  console.log("Комната рейда (сервер на порту TEST_PORT)");
  let fails = 0;
  const run = async (name: string, fn: () => Promise<void>) => { try { await check(name, fn); } catch { fails++; } };
  await startServer(true, { RAID_MUSTER_MS: "60000", RAID_GATHER_MS: "4000", RAID_PULL_MS: "4000", RAID_END_MS: "4000", RAID_HURRY_MS: "3000" });
  try {
    const A = await Bot.join("Рейдер", "pass", "warrior");
    const box: Record<string, any> = {};
    hook(A, box);
    A.send("dbg", { op: "level", v: 100 });
    A.send("dbg", { op: "gold", v: 5000 });
    await A.until(() => A.self!.level === 100 && A.self!.gold >= 5000, 4000, "100 уровень");
    const h = RAID_HERALDS[0];
    A.send("dbg", { op: "tp", x: h.x, y: h.y + 30 });
    await sleep(300);
    const gold0 = A.self!.gold;
    const pos0 = { x: A.me().x, y: A.me().y };

    await run("окно сбора у Вестника: можно встать, ботов доберут до 15", async () => {
      A.send("raid:info", {});
      await A.until(() => !!box["raid:muster"], 2000, "raid:muster");
      const m = box["raid:muster"];
      assert(m.why === "" && !m.joined, `нельзя встать: ${m.why}`);
      A.send("raid:join", { npc: h.id });
      await A.until(() => box["raid:muster"]?.joined === true, 2000, "встал в сбор");
      assert(box["raid:muster"].bots === 14, `ботов ${box["raid:muster"].bots}`);
    });
    await run("лидер начинает рейд: raid:go и welcome с raid", async () => {
      A.send("raid:start", {});
      await A.until(() => !!box["raid:go"], 6000, "raid:go");
      await A.switchTo(box["raid:go"].reservation);
      hook(A, box);
      assert(A.welcome?.raid === true && A.welcome.members.length === 15, "не в комнате рейда");
      await A.until(() => A.room.state.players.size === 15, 3000, "15 участников");
      let boss = false;
      A.room.state.mobs.forEach((u: any) => { if (u.sprite === "chaos_knight") boss = true; });
      assert(boss, "нет босса");
    });
    await run("пока герой в рейде, войти им в мир нельзя", async () => {
      let err = "";
      try { await Bot.join("Рейдер", "pass"); } catch (e) { err = String((e as Error).message); }
      assert(err.includes("в рейде"), "вход не запрещён: " + err);
    });
    await run("этапы: сбор → начало боя", async () => {
      await A.until(() => A.room.state.stage === "pull" || A.room.state.stage === "fight", 9000, "этап pull");
      await A.until(() => !!box["raid:banner"], 3000, "баннер начала");
    });
    await run("выход из рейда: raid:return, золото и позиция до рейда", async () => {
      A.send("raid:leave", {});
      await A.until(() => !!box["raid:return"], 4000, "raid:return");
      await A.switchTo(box["raid:return"].reservation);
      assert(!A.welcome?.raid, "не вернулся в мир");
      await A.until(() => !!A.me(), 2000, "юнит в мире");
      assert(A.self!.gold === gold0, `золото ${A.self!.gold} ≠ ${gold0}`);
      const d = Math.hypot(A.me().x - pos0.x, A.me().y - pos0.y);
      assert(d < 40, `позиция сдвинулась на ${Math.round(d)} px`);
    });
    await A.leave();
  } catch (e) {
    console.log("  FAIL комната рейда:", (e as Error).message);
    fails++;
  } finally {
    await stopServer();
  }
  return fails;
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("tests/raid-room.ts")) {
  const f = await roomTest();
  process.exit(f ? 1 : 0);
}
