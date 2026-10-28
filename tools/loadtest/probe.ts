/**
 * Замер сервера под нагрузкой (подключается через `node --import tsx --import ./tools/loadtest/probe.ts server/src/index.ts`).
 * Код игры не трогает: оборачивает Room.setSimulationInterval (такт комнаты LOADTEST_ROOM, по умолчанию world) и Room.broadcastPatch (рассылка состояния) в @colyseus/core.
 * Раз в секунду дописывает строку JSONL в LOADTEST_PROBE_OUT: такты, их среднее/макс мс, патчи, CPU и память процесса, число клиентов.
 */
import fs from "node:fs";
import { Room } from "@colyseus/core";

const out = process.env.LOADTEST_PROBE_OUT;
if (out) {
  const ROOM = process.env.LOADTEST_ROOM || "world";
  let rooms: Record<string, number> = {};
  let ticks = 0, tickSum = 0, tickMax = 0, patches = 0, patchSum = 0, patchMax = 0, clients = 0;
  const proto = Room.prototype as any;

  const origSim = proto.setSimulationInterval;
  proto.setSimulationInterval = function (cb: ((dt: number) => void) | undefined, delay?: number) {
    if (!cb) return origSim.call(this, cb, delay);
    const room = this;
    return origSim.call(this, (dt: number) => {
      const t0 = performance.now();
      try { cb(dt); } finally {
        const ms = performance.now() - t0;
        rooms[room.roomName] = (rooms[room.roomName] ?? 0) + 1;
        if (room.roomName === ROOM) { // такт меряем только у мира
          ticks++; tickSum += ms; if (ms > tickMax) tickMax = ms;
          clients = Math.max(clients, room.clients?.length ?? 0);
        }
      }
    }, delay);
  };

  const origPatch = proto.broadcastPatch;
  proto.broadcastPatch = function (...args: unknown[]) {
    const t0 = performance.now();
    if (this.roomName !== ROOM) return origPatch.apply(this, args);
    try { return origPatch.apply(this, args); } finally {
      const ms = performance.now() - t0;
      patches++; patchSum += ms; if (ms > patchMax) patchMax = ms;
    }
  };

  fs.writeFileSync(out, "");
  let cpu = process.cpuUsage(), t = performance.now();
  setInterval(() => {
    const c = process.cpuUsage(cpu), now = performance.now();
    const mem = process.memoryUsage();
    const line = {
      t: Date.now(),
      ticks, tickAvg: ticks ? +(tickSum / ticks).toFixed(3) : 0, tickMax: +tickMax.toFixed(3),
      patches, patchAvg: patches ? +(patchSum / patches).toFixed(3) : 0, patchMax: +patchMax.toFixed(3),
      cpuPct: +((100 * (c.user + c.system) / 1000) / (now - t)).toFixed(1),
      rssMB: +(mem.rss / 1048576).toFixed(1), heapMB: +(mem.heapUsed / 1048576).toFixed(1),
      clients, rooms,
    };
    fs.appendFileSync(out, JSON.stringify(line) + "\n");
    rooms = {};
    ticks = tickSum = tickMax = patches = patchSum = patchMax = clients = 0;
    cpu = process.cpuUsage(); t = now;
  }, 1000).unref();
}
