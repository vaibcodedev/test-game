/**
 * Инстанс рейда «Рогатый Рыцарь Хаоса» (задача 114, docs/raid.md §1): своя карта-цитадель, боты добирают состав, бой ведёт
 * RaidDirector. Войти можно только по резервации из сбора у Вестника (onAuth отклоняет прямые подключения). Прогресс пишется
 * в базу: после победы — сразу всем одной транзакцией, при выходе — каждому; позиция в мире — та, что была до рейда.
 */
import { resetTargetAuras } from "../game/auras";
import { matchMaker, Room, ServerError, type Client } from "@colyseus/core";
import { RECONNECT_SEC } from "../../../shared/accounts";
import { PATCH_MS, TICK_MS } from "../../../shared/constants";
import { MAP_VERSION } from "../../../shared/map";
import { ROOM_NAME } from "../../../shared/protocol";
import { generateRaidMap, RAID, RAID_BOSS, RAID_CFG, type RaidResultMsg, type RaidWelcome } from "../../../shared/raid";
import { homeCity } from "../../../shared/cities";
import type { PlayerSave } from "../db";
import { Player } from "../game/Player";
import { World } from "../game/World";
import { inRaid, raids, services, worldNews } from "../arena/registry";
import { RaidDirector, type RaidMember } from "../raid/director";
import { collectBags, grantRaidRewards, type RaidLoot } from "../raid/rewards";
import { guard, makeOn, registerCombat } from "./common";
import { registerItems } from "./items";
import { RaidState } from "./schema";

export interface RaidOptions {
  members: RaidMember[];
  /** HP босса × N/size, если игроков больше size. */
  hpScale?: number;
}
export interface RaidAuth {
  name: string;
  save: PlayerSave;
}

const RAID_MAP = generateRaidMap();
const NO_SHOW_MS = 25_000;
const env = (k: string, def: number) => Number(process.env[k]) || def;

export class RaidRoom extends Room<RaidState> {
  override autoDispose = true;
  world!: World;
  director!: RaidDirector;
  members: RaidMember[] = [];
  /** Игроки (не боты) в комнате. */
  readonly byKey = new Map<string, Player>();
  private loot = new Map<string, RaidLoot>();
  private resultSent = false;
  /** Уже отправлены домой (резервация в мире выдана). */
  private homeBound = new Set<string>();
  private createdAt = Date.now();
  private joinedAny = false;

  override onCreate(o: RaidOptions) {
    this.setPrivate(true);
    this.setSeatReservationTime(20);
    this.members = o.members;
    this.maxClients = this.members.filter((m) => !m.bot).length;
    raids.running++;
    this.setState(new RaidState());
    this.world = new World(this.state, (t, m) => this.broadcast(t, m), { map: RAID_MAP, mobs: false, quiet: true });
    // чат рейда общий для обеих фракций — без «чужого языка»
    this.world.playerChat = (p, text) => this.world.chat({ from: p.name, text, cls: p.cls, faction: p.faction, raid: true });
    this.director = new RaidDirector(this.world, {
      members: this.members,
      hpScale: o.hpScale,
      send: (t, m) => this.broadcast(t, m),
      gatherMs: env("RAID_GATHER_MS", RAID_CFG.gatherMs),
      pullMs: env("RAID_PULL_MS", RAID_CFG.pullMs),
      endMs: env("RAID_END_MS", RAID_CFG.endMs),
      wipeMs: env("RAID_WIPE_MS", RAID_CFG.wipeMs),
      onWin: () => this.onWin(),
      onEnd: () => this.closeAll(),
    });
    this.state.boss = this.director.boss.id;
    this.state.attempts = RAID_CFG.attempts;
    this.members.forEach((m, i) => {
      if (!m.bot) return;
      const p = new Player(`rb${i}_${this.roomId}`, m.name, JSON.parse(JSON.stringify(m.save)) as PlayerSave, () => {});
      this.director.addPlayer(p, m, true);
      p.unit.title = ""; // титул наёмника — в составе и итогах; над головой 14 одинаковых подписей мешали бы видеть бой
    });
    const on = makeOn(this, () => this.world);
    registerCombat(on, () => this.world);
    registerItems(on, () => this.world);
    this.onMessage("ping", (c) => c.send("pong", 0));
    this.onMessage("raid:leave", (c) => void this.sendHome(c));
    on<{ id: unknown }>("raid:revive", (p, m) => {
      const t = typeof m.id === "string" ? this.world.players.get(m.id) : undefined;
      if (!t) return;
      const err = this.director.startRevive(p, t);
      if (err) p.send("toast", { text: err, kind: "error" });
    });
    if (process.env.TEST_MODE === "1") {
      // только автотесты и скриншоты: героя ведёт ИИ рейда, здоровье босса, неуязвимость героя
      on<{ op: string; v?: unknown }>("dbg", (p, m) => {
        const b = this.director.boss;
        if (m.op === "auto") { if (m.v === false) this.director.auto.delete(p); else this.director.auto.add(p); }
        else if (m.op === "bosshp" && !b.dead) b.unit.hp = Math.max(1, Math.round(b.unit.maxHp * Number(m.v)));
        else if (m.op === "god") { p.unit.maxHp = 999_999; p.unit.hp = 999_999; }
      });
    }
    this.setPatchRate(PATCH_MS);
    this.setSimulationInterval(guard("рейд", (dt: number) => this.tick(dt)), TICK_MS);
  }

  override onAuth(): never {
    throw new ServerError(403, "В рейд можно войти только через сбор у Вестника Цитадели");
  }

  override onJoin(client: Client, _o: unknown, auth: RaidAuth) {
    const key = auth.name.toLowerCase();
    const member = this.members.find((m) => m.key === key && !m.bot);
    if (!member || this.byKey.has(key) || this.director.stage === "end") throw new ServerError(403, "Вы не участник этого рейда");
    const id = client.sessionId; // после переподключения объект клиента другой — ищем актуальный
    const p = new Player(id, auth.name, auth.save, (type, msg) => this.clients.find((c) => c.sessionId === id)?.send(type, msg));
    this.director.addPlayer(p, member, false);
    this.byKey.set(key, p);
    this.joinedAny = true;
    this.welcome(client);
    // все пришли — сбор в Преддверии короче
    if (this.members.every((m) => m.bot || this.byKey.has(m.key))) this.director.hurryGather(env("RAID_HURRY_MS", 6000));
  }

  private welcome(client: Client) {
    const msg: RaidWelcome & { id: string } = {
      id: client.sessionId,
      raid: true,
      members: this.members.map(({ name, cls, level, role, bot }) => ({ name, cls, level, role, bot })),
      attempts: RAID_CFG.attempts,
      enrageMs: RAID_CFG.enrageMs,
      boss: this.director.boss.id,
    };
    client.send("welcome", msg);
    if (this.resultSent) this.sendResult(client);
  }

  override async onLeave(client: Client, consented: boolean) {
    const p = this.world.players.get(client.sessionId);
    if (!p) return;
    const key = p.name.toLowerCase();
    // обрыв связи: героя ведёт ИИ рейда, пока игрок не вернётся
    if (!consented && !this.homeBound.has(key) && this.director.stage !== "end") {
      p.input = { mx: 0, my: 0 };
      p.moveTo = null;
      this.director.auto.add(p);
      try {
        const fresh = await this.allowReconnection(client, env("RECONNECT_SEC", RECONNECT_SEC));
        if (this.world.players.get(client.sessionId) === p) {
          this.director.auto.delete(p);
          p.targetId = null;
          p.moveTo = null;
          this.welcome(fresh);
          p.selfDirty = true;
          p.bagsDirty = true;
          p.aurasSig = null; // список эффектов — заново
          resetTargetAuras(p); // и список эффектов цели
          return;
        }
      } catch {}
      if (this.world.players.get(client.sessionId) !== p) return;
    }
    if (!this.homeBound.has(key)) {
      try {
        collectBags(p);
        services.db.save(p.name, this.saveFor(p));
      } catch (e) {
        console.error("[raid] сохранение при выходе:", e);
      }
    }
    this.director.removePlayer(p);
    this.byKey.delete(key);
    inRaid.delete(key);
    if (!this.byKey.size) this.clock.setTimeout(() => { if (!this.byKey.size) this.disconnect(); }, 1000);
  }

  override onDispose() {
    raids.running = Math.max(0, raids.running - 1);
    for (const m of this.members) if (!m.bot) inRaid.delete(m.key);
  }

  private tick(dt: number) {
    this.world.update(dt);
    const d = this.director;
    d.tick();
    const st = this.state;
    st.stage = d.stage;
    st.countdown = d.countdown();
    st.revives = d.revives;
    st.attempt = d.attempt;
    st.berserk = d.berserkLeft();
    if (d.stage === "end" && !this.resultSent) this.sendResults();
    // никто не пришёл — инстанс закрывается
    if (!this.joinedAny && Date.now() - this.createdAt > NO_SHOW_MS) {
      this.joinedAny = true;
      this.disconnect();
    }
  }

  /** Сохранение героя для мира: позиция — та, что до рейда; павший возвращается с полным здоровьем. */
  private saveFor(p: Player): PlayerSave {
    const m = this.members.find((x) => x.key === p.name.toLowerCase());
    const s = p.toSave(homeCity(p.faction).spawn);
    if (m?.from) { s.x = m.from.x; s.y = m.from.y; }
    if (p.dead) s.hp = -1;
    s.mapVer = MAP_VERSION;
    return JSON.parse(JSON.stringify(s)) as PlayerSave;
  }

  /** Победа: награды, сохранение всех участников одной транзакцией, объявление в чат мира, итоги. */
  private onWin() {
    this.loot = grantRaidRewards(this.director);
    try {
      services.db.saveMany([...this.byKey.values()].map((p) => ({ name: p.name, save: this.saveFor(p) })));
    } catch (e) {
      console.error("[raid] сохранение после победы:", e);
    }
    const heroes = [...this.byKey.values()].map((p) => p.name);
    worldNews.system(`${RAID.chat.win}${heroes.length ? ` Герои: ${heroes.join(", ")}.` : ""}`);
    for (const l of this.loot.values()) for (const t of l.trophies) worldNews.system(RAID.chat.trophy.replace("{name}", l.name).replace("{item}", t));
    this.sendResults();
  }

  private result(): Omit<RaidResultMsg, "loot" | "locked"> {
    const d = this.director;
    return { win: !!d.result?.win, durationMs: d.result?.durationMs ?? 0, attempt: d.attempt, players: d.results() };
  }
  private sendResult(c: Client) {
    const p = this.world.players.get(c.sessionId);
    const l = p ? this.loot.get(p.name.toLowerCase()) : undefined;
    c.send("raid:result", { ...this.result(), loot: l?.items ?? [], locked: l ? l.locked : true, title: l?.title, frame: l?.frame } satisfies RaidResultMsg);
  }
  private sendResults() {
    this.resultSent = true;
    if (!this.director.result?.win) worldNews.system(RAID.chat.wipe);
    for (const c of this.clients) this.sendResult(c);
  }

  /** Возврат в мир на прежнее место (как у арены): невзятая добыча — в сумку или в отложенные, сохранение, резервация. */
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
      client.send("raid:return", { reservation: { sessionId: res.sessionId, room: { name: ROOM_NAME, roomId: world.roomId, processId: world.processId } } });
    } catch (e) {
      this.homeBound.delete(key);
      console.error("[raid] возврат в мир:", e);
      client.send("toast", { text: "Не удалось вернуться в мир, войдите заново", kind: "error" });
    }
  }

  /** Конец рейда: всех домой, комната закрывается. */
  private closeAll() {
    for (const c of this.clients) void this.sendHome(c);
    this.clock.setTimeout(() => this.disconnect(), 30_000);
  }
}
