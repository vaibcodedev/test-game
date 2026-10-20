/**
 * Встроенный сервер десктоп-версии: тот же server/src/index.ts, собранный esbuild в desktop/out/server/server.mjs.
 * Работает в utilityProcess Electron (desktop/src/server.ts). Связь с главным процессом — process.parentPort:
 *   → {type:"ready"} — сервер слушает порт и мир создан (top-level await в index.ts завершён);
 *   ← {type:"shutdown"} — сохранить героев и остановиться штатным обработчиком SIGTERM из index.ts
 *     (gracefullyShutdown + закрытие базы). Под обычным Node parentPort нет — сервер ведёт себя как npm start.
 */
import "../../server/src/index";
import { WorldRoom } from "../../server/src/rooms/WorldRoom";

const parent = process.parentPort as Electron.ParentPort | undefined;
let stopping = false;

function shutdown(): void {
  if (stopping) return;
  stopping = true;
  // Сохраняем явно: обработчики SIGTERM у Colyseus и index.ts идут параллельно,
  // и onDispose (saveAll) может не успеть до db.close() + process.exit().
  const room = WorldRoom.instance;
  try {
    const count = room?.world?.players.size ?? 0;
    room?.saveAll();
    console.log(`[desktop] остановка: прогресс сохранён (в мире: ${count})`);
  } catch (err) {
    console.error("[desktop] не удалось сохранить героев перед остановкой:", err);
  }
  if (process.listenerCount("SIGTERM") > 0) process.emit("SIGTERM", "SIGTERM");
  else process.exit(0);
}

if (parent) {
  parent.on("message", (e) => {
    if ((e.data as { type?: string } | null)?.type === "shutdown") shutdown();
  });
  parent.postMessage({ type: "ready", port: Number(process.env.PORT) });
}
