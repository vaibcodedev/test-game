import express from "express";
import fs from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { matchMaker, Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { ROOM_NAME } from "../../shared/protocol";
import { accountRouter } from "./accounts";
import { newSave } from "./game/Player";
import { ArenaStore } from "./arena/store";
import { services } from "./arena/registry";
import { GameDB } from "./db";
import { ArenaRoom } from "./rooms/ArenaRoom";
import { RaidRoom } from "./rooms/RaidRoom";
import { DungeonRoom } from "./rooms/DungeonRoom";
import { homeCity } from "../../shared/cities";
import { classFaction } from "../../shared/classes";
import { WorldRoom } from "./rooms/WorldRoom";
import serverCfg from "../../data/server.json";
import { AC, makeVerifyClient, setSuspicionLog, SuspicionLog, suspicionLog } from "./anticheat";

const PORT = Number(process.env.PORT || 2567);

const app = express();
app.set("trust proxy", "loopback");
app.use(
  "/api",
  accountRouter({
    db: () => WorldRoom.db,
    map: () => WorldRoom.instance?.world.map ?? null,
    online: (key) => !!WorldRoom.instance?.world.findByName(key),
    // новый герой появляется в столице своей фракции
    newSave: (cls) => newSave(cls, homeCity(classFaction(cls)).spawn),
    test: process.env.TEST_MODE === "1",
  }),
);
app.get("/health", (_req, res) => {
  res.json({ ok: true });
});
app.get("/api/top", (_req, res) => {
  res.json(WorldRoom.db.top(10));
});
app.get("/api/arena/top/:mode", (req, res) => {
  const mode = req.params.mode === "2v2" ? "2v2" : "1v1";
  res.json({ season: services.arena.season(), mode, rows: services.arena.top(mode) });
});
const dist = path.resolve("dist");
if (fs.existsSync(path.join(dist, "index.html"))) app.use(express.static(dist));

const httpServer = createServer(app);
// античит, шаг 1 (data/anticheat.json): предел кадра, Origin и лимит соединений с IP — до рукопожатия
const transport = new WebSocketTransport({ server: httpServer, maxPayload: AC.maxPayloadBytes, verifyClient: makeVerifyClient() });
const gameServer = new Server({ transport, greet: false });

WorldRoom.db = new GameDB();
setSuspicionLog(new SuspicionLog(WorldRoom.db.raw));
services.db = WorldRoom.db;
services.arena = new ArenaStore(WorldRoom.db.raw);
gameServer.define(ROOM_NAME, WorldRoom);

// резервные копии базы (аудит, раздел 3): при старте и раз в intervalHours, keep последних; в тестах (TEST_MODE) — только с DB_BACKUPS=1
const backupsOn = process.env.DB_BACKUPS ? process.env.DB_BACKUPS === "1" : process.env.TEST_MODE !== "1";
const backupNow = () => {
  try {
    const db = WorldRoom.db, cfg = serverCfg.backups;
    const t = Date.now(), out = db.backup(path.join(path.dirname(db.file), cfg.dir), cfg.keep);
    if (out) console.log(`[backup] копия базы: ${out} (${Date.now() - t} мс)`);
  } catch (e) {
    console.error("[backup] не удалось сделать копию базы:", e);
  }
};
if (backupsOn) {
  backupNow();
  setInterval(backupNow, serverCfg.backups.intervalHours * 3600_000).unref();
}
gameServer.define("arena", ArenaRoom);
gameServer.define("raid", RaidRoom);
gameServer.define("dungeon", DungeonRoom);

// HOST — только для десктопа (127.0.0.1, без запроса брандмауэра); без переменной слушаем все интерфейсы, как раньше
await gameServer.listen(PORT, process.env.HOST || undefined);
await matchMaker.createRoom(ROOM_NAME, {});
await matchMaker.createRoom("dungeon", {}); // «Пепельные чертоги»: одна общая комната, живёт всегда
console.log(`[server] Пепельный Предел: http://localhost:${PORT}  (ws на том же порту)`);
if (!fs.existsSync(path.join(dist, "index.html"))) console.log("[server] Клиент в режиме разработки: http://localhost:5173");

let shuttingDown = false;
const shutdown = async () => {
  if (shuttingDown) return;
  shuttingDown = true;
  try {
    await gameServer.gracefullyShutdown(false);
  } finally {
    try { suspicionLog()?.close(); } catch {}
    WorldRoom.db.close();
    process.exit(0);
  }
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

/** Последняя попытка сохранить героев при сбое процесса. */
const emergencySave = () => {
  try {
    const n = WorldRoom.instance?.saveAll() ?? 0;
    console.error(`[crash] аварийное сохранение: героев ${n}`);
  } catch (e) {
    console.error("[crash] аварийное сохранение не удалось:", e);
  }
};
// необработанный отказ промиса: лог и сохранение, процесс продолжает работу
process.on("unhandledRejection", (reason) => {
  console.error("[crash] unhandledRejection:", reason);
  emergencySave();
});
// необработанное исключение: состояние процесса не гарантировано — сохраняем и выходим с кодом 1 (tsx watch / супервизор перезапустит)
process.on("uncaughtException", (e) => {
  console.error("[crash] uncaughtException:", e);
  if (shuttingDown) return;
  shuttingDown = true;
  emergencySave();
  try {
    suspicionLog()?.close();
    WorldRoom.db.close();
  } catch {}
  process.exit(1);
});
