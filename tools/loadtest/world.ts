/**
 * Нагрузочный сценарий WorldRoom: N ботов входят как клиент (HTTP /api/login + /api/chars → joinOrCreate("world", { token, character })),
 * бегают по случайным точкам рядом со стартом, иногда атакуют ближайшего моба; считают входящие байты и задержку ping/pong.
 *
 *   npm run loadtest -- --clients 20 --duration 60 --port 2567 [--spread] [--tui] [--out file.json]
 *
 * Сервер должен быть уже запущен с TEST_MODE=1 (без лимитов регистрации; --spread разносит ботов к мобам через dbg tp).
 * --tui — живая панель @colyseus/loadtest (blessed, нужна консоль); без него — тихий режим с итогом в консоль и JSON.
 */
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { Client, type Room } from "colyseus.js";
import { GAME_VERSION } from "../../shared/version";

const { values: args } = parseArgs({
  options: {
    clients: { type: "string", default: "20" },
    duration: { type: "string", default: "60" },
    port: { type: "string", default: "2567" },
    host: { type: "string", default: "localhost" },
    spread: { type: "boolean", default: false },
    tui: { type: "boolean", default: false },
    out: { type: "string" },
    prefix: { type: "string", default: "ltb" },
  },
  strict: false,
});
const N = Math.max(1, Math.min(200, Number(args.clients) || 20));
const DURATION_MS = Math.max(5, Number(args.duration) || 60) * 1000;
const HTTP = `http://${args.host}:${args.port}`;
const WS = `ws://${args.host}:${args.port}`;
const OUT = path.resolve(String(args.out ?? `tools/out/loadtest/run-${N}.json`));

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

type BotStats = { bytes: number; msgs: number; rtt: number[]; moves: number; attacks: number; errToasts: number; left: boolean };
const bots: BotStats[] = [];
let joined = 0, failed = 0;
const errors: string[] = [];

async function api(p: string, body?: unknown, token = ""): Promise<any> {
  const res = await fetch(`${HTTP}/api${p}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `HTTP ${res.status}`), { status: res.status });
  return data;
}

/** Как tests/harness.ts ensureChar: аккаунт (создать при 404) и герой на нём. */
async function ensureChar(login: string, password: string, cls: string): Promise<string> {
  let v: any;
  try { v = await api("/login", { login, password }); } catch (e) {
    if ((e as any).status !== 404) throw e;
    v = await api("/login", { login, password, create: true });
  }
  if (!v.chars.some((c: any) => c.name.toLowerCase() === login.toLowerCase())) v = await api("/chars", { name: login, cls, look: 0 }, v.token);
  return v.token;
}

const CLASSES = ["warrior", "deathknight", "mage", "warlock", "ranger", "darkranger"]; // обе фракции

/** Один бот: вход, бег/атака до конца прогона. В TUI-режиме @colyseus/loadtest сам перехватывает joinOrCreate. */
async function runBot(i: number, deadline: number, onJoined?: () => void) {
  const name = `${args.prefix}${String(i).padStart(3, "0")}`;
  const token = await ensureChar(name, "loadtest", CLASSES[i % CLASSES.length]).catch(() => ensureChar(name, "loadtest", "warrior"));
  const client = new Client(WS);
  const room: Room<any> = await client.joinOrCreate("world", { token, character: name, version: GAME_VERSION });
  const s: BotStats = { bytes: 0, msgs: 0, rtt: [], moves: 0, attacks: 0, errToasts: 0, left: false };
  bots.push(s);
  joined++;
  onJoined?.();
  const ws = (room.connection.transport as any).ws;
  ws.addEventListener("message", (e: any) => { s.bytes += e.data?.byteLength ?? e.data?.length ?? 0; s.msgs++; });
  let pingAt = 0;
  room.onMessage("pong", () => { if (pingAt) s.rtt.push(performance.now() - pingAt); pingAt = 0; });
  room.onMessage("toast", (t: any) => { if (t?.kind === "error") s.errToasts++; });
  room.onMessage("*", () => {});
  room.onLeave(() => (s.left = true));

  const me = () => room.state?.players?.get(room.sessionId);
  for (let k = 0; k < 100 && !me(); k++) await sleep(50);
  if (args.spread) {
    const mobs = [...(room.state?.mobs?.values?.() ?? [])].filter((m: any) => m.hp > 0);
    const m: any = mobs[Math.floor(Math.random() * mobs.length)];
    if (m) { room.send("dbg", { op: "tp", x: m.x + rnd(-120, 120), y: m.y + rnd(-120, 120) }); await sleep(200); }
  }
  const home = { x: me()?.x ?? 0, y: me()?.y ?? 0 };

  const pinger = setInterval(() => { if (!s.left) { pingAt = performance.now(); room.send("ping"); } }, 2000);
  try {
    while (Date.now() < deadline && !s.left) {
      const p = me();
      let attacked = false;
      if (p && Math.random() < 0.3) {
        let best: any = null, bd = 500 * 500;
        room.state?.mobs?.forEach((m: any) => {
          if (m.hp <= 0) return;
          const d = (m.x - p.x) ** 2 + (m.y - p.y) ** 2;
          if (d < bd) { bd = d; best = m; }
        });
        const id = best && [...room.state.mobs.entries()].find(([, v]: any) => v === best)?.[0];
        if (id) { room.send("attack", { id }); s.attacks++; attacked = true; }
      }
      if (!attacked) {
        room.send("moveTo", { x: Math.max(0, home.x + rnd(-250, 250)), y: Math.max(0, home.y + rnd(-250, 250)) });
        s.moves++;
      }
      await sleep(rnd(1500, 3500));
    }
  } finally {
    clearInterval(pinger);
    if (!s.left) await room.leave(true).catch(() => {});
  }
}

const pct = (a: number[], q: number) => {
  if (!a.length) return 0;
  const b = [...a].sort((x, y) => x - y);
  return b[Math.min(b.length - 1, Math.floor(q * b.length))];
};

async function headless() {
  const t0 = Date.now();
  const deadline = t0 + DURATION_MS;
  const runs: Promise<void>[] = [];
  for (let i = 0; i < N; i++) {
    runs.push(runBot(i, deadline).catch((e) => { failed++; errors.push(String((e as Error).message ?? e)); }));
    await sleep(150); // вход по очереди, как живые игроки, без шторма на /api
  }
  // устойчивое окно: от входа последнего бота до конца прогона
  while (joined + failed < N && Date.now() < deadline) await sleep(100);
  const steadyT0 = Date.now();
  const bytes0 = bots.map((b) => b.bytes);
  const timer = setInterval(() => {
    const kb = bots.reduce((a, b) => a + b.bytes, 0) / 1024;
    process.stdout.write(`\r${Math.round((Date.now() - t0) / 1000)} с: ботов ${joined}/${N}, ошибок ${failed}, принято ${kb.toFixed(0)} КБ   `);
  }, 2000);
  await Promise.all(runs);
  clearInterval(timer);
  const steadyT1 = Date.now();
  const sec = Math.max(1, (steadyT1 - steadyT0) / 1000);
  const perClient = bots.map((b, i) => (b.bytes - (bytes0[i] ?? 0)) / sec);
  const rtt = bots.flatMap((b) => b.rtt);
  const result = {
    clients: N, joined, failed, durationS: DURATION_MS / 1000, spread: !!args.spread,
    start: t0, steadyStart: steadyT0, steadyEnd: steadyT1,
    bytesPerClientPerSec: { avg: Math.round(perClient.reduce((a, b) => a + b, 0) / Math.max(1, perClient.length)), max: Math.round(Math.max(0, ...perClient)) },
    joinBytesAvg: Math.round(bytes0.reduce((a, b) => a + b, 0) / Math.max(1, bytes0.length)),
    msgsPerClientPerSec: +(bots.reduce((a, b) => a + b.msgs, 0) / Math.max(1, bots.length) / ((steadyT1 - t0) / 1000)).toFixed(1),
    pingMs: { avg: +(rtt.reduce((a, b) => a + b, 0) / Math.max(1, rtt.length)).toFixed(1), p95: +pct(rtt, 0.95).toFixed(1), max: +Math.max(0, ...rtt).toFixed(1), n: rtt.length },
    moves: bots.reduce((a, b) => a + b.moves, 0), attacks: bots.reduce((a, b) => a + b.attacks, 0), errToasts: bots.reduce((a, b) => a + b.errToasts, 0),
    errors: [...new Set(errors)].slice(0, 5),
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(result, null, 2));
  console.log("\n" + JSON.stringify(result, null, 2));
  process.exit(failed === N ? 1 : 0);
}

async function tui() {
  const { cli } = await import("@colyseus/loadtest");
  // cli читает свои ключи из argv: подставляем их из наших --clients/--port
  process.argv.push("--numClients", String(N), "--endpoint", WS, "--room", "world", "--delay", "150");
  const deadline = Date.now() + DURATION_MS;
  setTimeout(() => process.exit(0), DURATION_MS + 3000).unref();
  // main у cli ждётся по очереди: отпускаем его сразу после входа, бег идёт в фоне
  cli((o) => new Promise<void>((res, rej) => { runBot(o.clientId, deadline, res).catch(rej); }));
}

void (args.tui ? tui() : headless());
