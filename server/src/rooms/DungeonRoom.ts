/**
 * Подземелье «Пепельные чертоги» (shared/dungeon.ts): отдельная комната с собственной картой, ОДНА общая на всех героев (а не по группам):
 * живёт всегда, мобы и Повелитель Пепла возрождаются по таймерам мира. Вход — только по резервации из мира (WorldRoom: «dungeon:enter» у лестницы);
 * выход — лестница у входа («dungeon:leave») или обрыв связи: герой сохраняется на карте мира у лестницы. Павший возрождается у входа внутри.
 * Трофеи босса — раз в сутки на героя (server/src/game/rewards.ts, shared/dungeon.ts bossLootStatus).
 */
import { matchMaker, Room, ServerError, type Client } from "@colyseus/core";
import { RECONNECT_SEC } from "../../../shared/accounts";
import { PATCH_MS, TICK_MS } from "../../../shared/constants";
import { DUNGEON_ENTRY, DUNGEON_EXIT, DUNGEON_GATES, bossLootStatus, generateDungeonMap } from "../../../shared/dungeon";
import { CELL_BLOCK } from "../../../shared/map";
import { gateAllows, gatePassable, newGate, stepGate } from "../../../shared/gates";
import { TILE } from "../../../shared/constants";
import { DOOR_FADE_MS, DOOR_RANGE } from "../../../shared/interiors";
import { DUNGEON_DOOR, MAP_VERSION } from "../../../shared/map";
import { ROOM_NAME } from "../../../shared/protocol";
import { homeCity } from "../../../shared/cities";
import type { PlayerSave } from "../db";
import { Player } from "../game/Player";
import { World } from "../game/World";
import { inDungeon, services } from "../arena/registry";
import { resetTargetAuras } from "../game/auras";
import { collectBags } from "../raid/rewards";
import { guard, makeOn, registerCombat } from "./common";
import { registerItems } from "./items";
import { WorldState } from "./schema";

export interface DungeonAuth {
  name: string;
  save: PlayerSave;
}
/** Где встаёт вышедший на карте мира: у основания лестницы. */
export const DUNGEON_OUT = { x: DUNGEON_DOOR.x, y: DUNGEON_DOOR.y + 28 };

export class DungeonRoom extends Room<WorldState> {
  override autoDispose = false;
  override maxClients = 150;
  world!: World;
  private homeBound = new Set<string>();
  private saveTimer = 0;
  /** Ворота данжа на общей модели (shared/gates.ts): нейтральные, автооткрытие при подходе героя, закрытие при пустом проёме; клетки проёма блокируются по состоянию. */
  private gates = DUNGEON_GATES.map((g) => ({ g, m: newGate(g.id, g.kind === "wood" ? "doors" : "portcullis", g.cells.length) }));
  private gateTick(dtMs: number) {
    const w = this.world;
    for (const s of this.gates) {
      const near = [...w.players.values()].some((p) => !p.dead && gateAllows(s.m.owner, undefined) && Math.abs(p.unit.x - s.g.cx) <= 96 && Math.abs(p.unit.y - s.g.cy) <= 80);
      const busy = (u: { x: number; y: number }) => s.g.cells.some(([cx, cy]) => Math.abs(u.x - (cx + 0.5) * TILE) < TILE * 0.75 && Math.abs(u.y - (cy + 0.5) * TILE) < TILE * 0.75);
      const was = s.m.state;
      const changed = stepGate(s.m, dtMs, near, [...w.players.values()].some((p) => busy(p.unit)) || [...w.mobs.values()].some((m) => busy(m.unit)));
      const m = w.map, pass = gatePassable(s.m);
      for (const [cx, cy] of s.g.cells) { if (pass) m.cell[cy * m.w + cx] &= ~CELL_BLOCK; else m.cell[cy * m.w + cx] |= CELL_BLOCK; }
      if (changed && (s.m.state === "opening" || s.m.state === "closing" || was === "open")) this.broadcast("dg:gate", { id: s.g.id, open: s.m.state === "opening" || s.m.state === "open" });
    }
  }
  private sendGates(c: Client) { c.send("dg:gates", { open: this.gates.filter((s) => s.m.state === "open" || s.m.state === "opening").map((s) => s.g.id) }); }

  override onCreate() {
    this.setPrivate(true);
    this.setSeatReservationTime(20);
    this.setState(new WorldState());
    this.world = new World(this.state, (t, m) => this.broadcast(t, m), { map: generateDungeonMap(), dungeon: true, quiet: true });
    for (const s of this.gates) for (const [cx, cy] of s.g.cells) this.world.map.cell[cy * this.world.map.w + cx] |= CELL_BLOCK; // ворота закрыты
    const on = makeOn(this, () => this.world);
    registerCombat(on, () => this.world);
    registerItems(on, () => this.world);
    this.onMessage("ping", (c) => c.send("pong", 0));
    on("respawn", (p) => this.world.respawn(p));
    on("dungeon:leave", (p) => this.leave(p));
    this.onMessage("dg:sync", (c) => this.sendGates(c));
    if (process.env.TEST_MODE === "1") {
      on<{ op: string; v?: unknown; x?: unknown; y?: unknown }>("dbg", (p, m) => {
        if (m.op === "god") { p.unit.maxHp = 999_999; p.unit.hp = 999_999; }
        else if (m.op === "tp" && typeof m.x === "number" && typeof m.y === "number") { p.unit.x = m.x; p.unit.y = m.y; p.moveTo = null; p.selfDirty = true; }
        else if (m.op === "kill") { p.unit.hp = 0; }
        else if (m.op === "gatecell") { const g = DUNGEON_GATES.find((q) => q.id === m.v), mp = this.world.map; if (g) p.send("dbg:gatecell", { id: g.id, blocked: g.cells.every(([cx, cy]) => !!(mp.cell[cy * mp.w + cx] & CELL_BLOCK)), free: g.cells.every(([cx, cy]) => !(mp.cell[cy * mp.w + cx] & CELL_BLOCK)) }); }
        else if (m.op === "bosshp") { for (const mob of this.world.mobs.values()) if (mob.def.boss) mob.unit.hp = Math.max(1, Math.round(mob.unit.maxHp * Number(m.v))); }
        else if (m.op === "dayshift" && typeof m.v === "number") { p.save.dgLoot = Object.fromEntries(Object.entries(p.save.dgLoot ?? {}).map(([k, t]) => [k, t + (m.v as number)])); }
      });
    }
    this.setPatchRate(PATCH_MS);
    this.setSimulationInterval(guard("DungeonRoom", (dt: number) => { this.world.update(dt); this.gateTick(dt); }), TICK_MS);
    // автосохранение героев внутри: позиция — снаружи у лестницы (внутри в игру не входят)
    this.saveTimer = setInterval(() => { for (const p of this.world.players.values()) this.persist(p); }, 60_000).unref() as unknown as number;
  }

  override onAuth(): never {
    throw new ServerError(403, "В подземелье можно войти только по лестнице на карте мира");
  }

  override onJoin(client: Client, _o: unknown, auth: DungeonAuth) {
    const key = auth.name.toLowerCase();
    if (this.world.findByName(key)) throw new ServerError(409, "Герой уже в подземелье");
    const id = client.sessionId;
    const p = new Player(id, auth.name, auth.save, (type, msg) => this.clients.find((c) => c.sessionId === id)?.send(type, msg));
    p.admin = services.db.isAdmin(p.name);
    p.accountId = services.db.ownerOf(p.name) ?? 0;
    p.unit.x = DUNGEON_ENTRY.x;
    p.unit.y = DUNGEON_ENTRY.y;
    p.dead = false;
    this.world.addPlayer(p);
    inDungeon.add(key);
    this.homeBound.delete(key);
    this.welcome(client, p);
  }

  private welcome(client: Client, p: Player) {
    client.send("welcome", { id: client.sessionId, dungeon: true });
    this.sendGates(client);
    this.sendStatus(p);
  }
  private sendStatus(p: Player) {
    const st = bossLootStatus(p.save.dgLoot?.ashlord, Date.now());
    p.send("dungeon:status", { looted: st.looted, leftMs: st.leftMs, at: Date.now() });
  }

  override async onLeave(client: Client, consented: boolean) {
    const p = this.world.players.get(client.sessionId);
    if (!p) return;
    const key = p.name.toLowerCase();
    if (!consented && !this.homeBound.has(key)) {
      p.input = { mx: 0, my: 0 };
      p.moveTo = null;
      try {
        const fresh = await this.allowReconnection(client, Number(process.env.RECONNECT_SEC) || RECONNECT_SEC);
        if (this.world.players.get(client.sessionId) === p) {
          p.targetId = null;
          p.moveTo = null;
          this.welcome(fresh, p);
          p.selfDirty = true;
          p.bagsDirty = true;
          p.aurasSig = null;
          resetTargetAuras(p);
          return;
        }
      } catch {}
      if (this.world.players.get(client.sessionId) !== p) return;
    }
    if (!this.homeBound.has(key)) this.persist(p);
    this.world.removePlayer(p.id);
    inDungeon.delete(key);
  }

  override onDispose() {
    clearInterval(this.saveTimer);
    for (const p of [...this.world.players.values()]) inDungeon.delete(p.name.toLowerCase());
  }

  /** Сохранение героя для мира: позиция — у лестницы снаружи; павший возвращается с полным здоровьем. */
  private saveFor(p: Player): PlayerSave {
    const s = p.toSave(homeCity(p.faction).spawn);
    s.x = DUNGEON_OUT.x;
    s.y = DUNGEON_OUT.y;
    if (p.dead) s.hp = -1;
    s.mapVer = MAP_VERSION;
    return JSON.parse(JSON.stringify(s)) as PlayerSave;
  }
  private persist(p: Player) {
    try {
      collectBags(p);
      services.db.save(p.name, this.saveFor(p));
    } catch (e) {
      console.error("[dungeon] сохранение:", e);
    }
  }

  /** Выход по лестнице: проверка дальности, затемнение, возврат в мир. */
  private leave(p: Player) {
    if (p.dead || this.homeBound.has(p.name.toLowerCase())) return;
    if (this.world.dist(p, DUNGEON_EXIT) > DOOR_RANGE) return void p.send("toast", { text: "Подойдите к лестнице выхода", kind: "error" });
    if (p.tele || p.mountCast || p.stunUntil > this.world.time) return void p.send("toast", { text: "Сейчас нельзя", kind: "error" });
    p.input = { mx: 0, my: 0 };
    p.moveTo = null;
    p.send("dungeon:fade", { ms: DOOR_FADE_MS });
    this.world.later(DOOR_FADE_MS, () => {
      const c = this.clients.find((x) => x.sessionId === p.id);
      if (c && this.world.players.has(p.id)) void this.sendHome(c);
    });
  }

  /** Возврат в мир: сохранение, резервация места в мире (как у рейда), клиент переключается. */
  private async sendHome(client: Client) {
    const p = this.world.players.get(client.sessionId);
    if (!p) return;
    const key = p.name.toLowerCase();
    if (this.homeBound.has(key)) return;
    this.homeBound.add(key);
    try {
      collectBags(p);
      const save = this.saveFor(p);
      services.db.save(p.name, save);
      const [world] = await matchMaker.query({ name: ROOM_NAME });
      if (!world) throw new Error("мир недоступен");
      const res = await matchMaker.reserveSeatFor(world, {}, { name: p.name, save, created: false, fromRaid: true });
      client.send("dungeon:return", { reservation: { sessionId: res.sessionId, room: { name: ROOM_NAME, roomId: world.roomId, processId: world.processId } } });
    } catch (e) {
      this.homeBound.delete(key);
      console.error("[dungeon] возврат в мир:", e);
      client.send("toast", { text: "Не удалось вернуться в мир, попробуйте ещё раз", kind: "error" });
    }
  }
}
