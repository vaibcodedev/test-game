/**
 * Фильтр видимости мира (задача 76, server/src/rooms/visibility.ts): два героя далеко друг от друга не видят мобов и друг друга,
 * подошёл (телепорт) — видит сразу; группа видна всегда; трафик полного состояния при входе — до (VIS_OFF=1) и после.
 * Запуск: TEST_PORT=2731 npx tsx tests/stateview.ts
 */
import { Room } from "colyseus.js";
import { MAP_SEED } from "../shared/constants";
import { generateMap } from "../shared/map";
import { VIS_CELL, VIS_OUT } from "../server/src/rooms/visibility";
import { assert, Bot, check, passedCount, sleep, startServer, stopServer } from "./harness";

// счёт байт, пришедших в каждую комнату (до разбора)
const bytes = new WeakMap<object, number>();
const proto = Room.prototype as any, orig = proto.onMessageCallback;
proto.onMessageCallback = function (event: MessageEvent) {
  const d = event.data as ArrayBuffer | Uint8Array;
  bytes.set(this, (bytes.get(this) ?? 0) + ((d as any).byteLength ?? 0));
  return orig.call(this, event);
};

const MAP = generateMap(MAP_SEED);
const far = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
const mobsNear = (b: Bot, p: { x: number; y: number }, r: number) => {
  let n = 0;
  b.room.state.mobs.forEach((m: any) => { if (far(m, p) <= r) n++; });
  return n;
};
const sees = (b: Bot, id: string) => b.room.state.players.has(id);

/** Вход и замер: байты до ответа «self» и спокойные 1,5 с после (полное состояние + первые патчи). */
async function joinMeasured(name: string) {
  const b = await Bot.join(name);
  await sleep(1500);
  return { b, bytes: bytes.get(b.room) ?? 0, mobs: b.room.state.mobs.size as number };
}

async function measure(off: boolean) {
  await startServer(true, off ? { VIS_OFF: "1" } : {});
  try {
    const r = await joinMeasured(off ? "Замер" : "Замерщик");
    await r.b.leave();
    return r;
  } finally {
    await stopServer();
  }
}

async function main() {
  // две точки спавна мобов далеко друг от друга (и от столиц)
  const spawns = MAP.spawns;
  const A = spawns[Math.floor(spawns.length * 0.2)];
  const B = spawns.find((s) => far(s, A) > 8000 && far(s, MAP.playerSpawn) > 4000)!;
  assert(B, "нет далёкой точки");

  const before = await measure(true);
  const after = await measure(false);
  console.log(`  трафик входа: до ${(before.bytes / 1024).toFixed(1)} КБ (${before.mobs} мобов в состоянии), после ${(after.bytes / 1024).toFixed(1)} КБ (${after.mobs})`);

  await startServer();
  try {
    const a = await Bot.join("Алая"), b = await Bot.join("Бурый");
    await check("трафик входа уменьшился в разы, мобов в состоянии — только окрестность", () => {
      assert(after.bytes * 3 < before.bytes, `до ${before.bytes} Б, после ${after.bytes} Б`);
      assert(after.mobs * 3 < before.mobs, `мобов до ${before.mobs}, после ${after.mobs}`);
    });
    await check("рядом при входе — видят друг друга", async () => {
      await a.until(() => sees(a, b.id) && sees(b, a.id), 3000, "видят друг друга");
    });

    a.send("dbg", { op: "tp", x: A.x, y: A.y });
    b.send("dbg", { op: "tp", x: B.x, y: B.y });
    await check("далеко: не видят друг друга и мобов друг друга", async () => {
      await a.until(() => !sees(a, b.id) && !sees(b, a.id), 3000, "друг друга не видно");
      await a.until(() => mobsNear(a, A, 600) > 0 && mobsNear(b, B, 600) > 0, 3000, "свои мобы вокруг");
      const lim = (VIS_OUT + 1) * VIS_CELL;
      let bad = 0;
      a.room.state.mobs.forEach((m: any) => { if (far(m, A) > lim) bad++; });
      b.room.state.mobs.forEach((m: any) => { if (far(m, B) > lim) bad++; });
      assert(bad === 0, `юнитов дальше ${lim} px: ${bad}`);
      assert(mobsNear(a, B, 1500) === 0 && mobsNear(b, A, 1500) === 0, "видны чужие мобы");
    });

    await check("точки на миникарте: далёкий игрок приходит каналом dots", async () => {
      let dots: number[] = [];
      a.room.onMessage("dots", (m: number[]) => (dots = m));
      await a.until(() => dots.length >= 3, 4000, "dots");
      assert(far({ x: dots[0], y: dots[1] }, B) < 50, "точка не там: " + dots.slice(0, 3));
    });

    await check("подошёл (телепорт) — сразу видит героя и его мобов", async () => {
      const nB = mobsNear(b, B, 600);
      const t0 = Date.now();
      a.send("dbg", { op: "tp", x: B.x + 40, y: B.y });
      await a.until(() => sees(a, b.id) && mobsNear(a, B, 600) >= nB, 1000, "соседи после телепорта");
      console.log(`    после телепорта соседи через ${Date.now() - t0} мс`);
      await b.until(() => sees(b, a.id), 1000, "Бурый видит Алую");
      await a.until(() => mobsNear(a, A, 600) === 0, 2000, "мобы прежнего места ушли");
    });

    await check("гистерезис: на границе юнит не мигает", async () => {
      // Бурый в клетке, Алая отходит на VIS_OUT клеток (за VIS_IN, но в пределах VIS_OUT) — остаётся видна
      const me = b.me();
      const base = Math.floor(me.x / VIS_CELL) * VIS_CELL;
      a.send("dbg", { op: "tp", x: base + VIS_OUT * VIS_CELL + 100, y: me.y });
      await sleep(600);
      assert(sees(b, a.id), "ушла из вида внутри полосы гистерезиса");
      a.send("dbg", { op: "tp", x: base + (VIS_OUT + 2) * VIS_CELL + 100, y: me.y });
      await b.until(() => !sees(b, a.id), 1500, "ушла за VIS_OUT");
    });

    await check("группа видна через весь мир", async () => {
      a.send("dbg", { op: "tp", x: A.x, y: A.y });
      await b.until(() => !sees(b, a.id), 2000, "далеко");
      a.send("party:invite", { name: "Бурый" });
      await b.until(() => !!b.partyInvite, 3000, "приглашение");
      b.send("party:respond", { accept: true });
      await b.until(() => sees(b, a.id) && sees(a, b.id), 2000, "участники группы видят друг друга");
      a.send("dbg", { op: "god" });
      await b.until(() => b.room.state.players.get(a.id)?.maxHp === 999999, 2000, "HP союзника обновляется");
      a.send("party:leave");
      await b.until(() => !sees(b, a.id), 2000, "после выхода из группы снова не видно");
    });

    await a.leave();
    await b.leave();
    console.log(`\nВсе проверки пройдены: ${passedCount()}`);
  } finally {
    await stopServer();
  }
}

main().catch((e) => {
  console.error(e);
  stopServer().finally(() => process.exit(1));
});
