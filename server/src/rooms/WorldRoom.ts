import { matchMaker, Room, ServerError, type Client } from "@colyseus/core";
import { resetTargetAuras } from "../game/auras";
import { ARENA_MODES, MODE_NAMES, rankOf, TEAM_SIZE, type ArenaInfo, type ArenaMode, type ModeRating } from "../../../shared/arena";
import { classFaction, STAT_NAMES, type StatKey } from "../../../shared/classes";
import { homeCity } from "../../../shared/cities";
import { PATCH_MS, SAVE_INTERVAL_MS, TICK_MS } from "../../../shared/constants";
import { KICK_CODE, KICK_TEXT, LOGOUT_CODE, LOGOUT_COMBAT_MS, RECONNECT_SEC } from "../../../shared/accounts";
import { freshChars, sessionOf } from "../accounts";
import { xpToNext } from "../../../shared/formulas";
import { MOUNTS } from "../../../shared/mounts";
import { buySeal, stableBuy, stableCraft } from "../game/stable";
import { bestArenaRating } from "../arena/gladiator";
import { selectPet, togglePet } from "../game/Pet";
import { keeperBuy } from "../game/menagerie";
import { MAX_LEVEL, MERCHANT_RANGE, PLAYER_RADIUS } from "../../../shared/constants";
import { DUNGEON_DOOR, MAP_VERSION, walkable } from "../../../shared/map";
import { DUNGEON_ENTRY, bossLootStatus } from "../../../shared/dungeon";
import { DOOR_FADE_MS, DOOR_RANGE } from "../../../shared/interiors";
import { DUNGEON_OUT } from "./DungeonRoom";
import { makeItem, makeUnique, Rarity, SLOTS } from "../../../shared/items";
import { makeLegendary } from "../../../shared/legendary";
import { INSPECT_COOLDOWN_MS, INSPECT_RANGE } from "../../../shared/gearFx";
import type { InspectReply, JoinOptions } from "../../../shared/protocol";
import { canLearn, SKILLS } from "../../../shared/skills";
import { Parties } from "../arena/party";
import { ArenaQueue, type PendingMatch } from "../arena/queue";
import { inArena, inDungeon, inRaid, services, worldNews } from "../arena/registry";
import { deliverArenaRewards } from "../arena/rewards";
import { RaidMuster, type MusterEntry } from "../raid/muster";
import { deliverPending } from "../raid/rewards";
import { raidBotSave } from "../arena/botgear";
import type { RaidMember } from "../raid/director";
import type { RaidOptions } from "./RaidRoom";
import { heraldNear, RAID, RAID_CFG, RAID_ROLES, type RaidRole } from "../../../shared/raid";
import { serviceRefusal } from "../../../shared/npcs";
import { CLASSES, type ClassId } from "../../../shared/classes";
import { GameDB, type PlayerSave } from "../db";
import { sendPrices, setMarketDb } from "../game/market";
import { buyMaterial, upgradeItem } from "../game/smith";
import { tmApply, tmExtract, tmReset } from "../game/transmog";
import { registerAdmin } from "../game/admin";
import { registerEncounters } from "../game/encounters";
import { registerBiomes, sendNodes } from "../game/biomes";
import { questProgress, registerCities } from "../game/cities";
import { registerInteriors } from "../game/interiors";
import { addItem, buy, buyFood, merchantRefusal, nearMerchant, equip, pickup, sell, swap, unequip, useBase, useItem } from "../game/inventory";
import { Player } from "../game/Player";
import { gainXp } from "../game/rewards";
import { forgetRumors, rumorFor } from "../game/rumors";
import { World } from "../game/World";
import { fileWarStore } from "../game/bannerWar";
import { fileWbStore } from "../worldboss";
import path from "node:path";
import { TradeManager } from "../trade/TradeManager";
import { BankService } from "../game/bank";
import { expandBag } from "../game/bags";
import { destroyItem, dropItem, pickupBag } from "../game/drop";
import type { ArenaOptions, Participant } from "./ArenaRoom";
import { guard, makeOn, registerCombat, type On } from "./common";
import { autoPlace, setSlot } from "../../../shared/hotbar";
import { OpenWorldState } from "./schema";
import { Visibility } from "./visibility";
import { versionError } from "../anticheat";
import { T } from "../../../shared/texts";

interface AuthResult {
  name: string;
  save: PlayerSave;
  created: boolean;
  fromArena?: boolean;
  fromRaid?: boolean;
  accountId?: number;
}
/** Классы ботов рейда по ролям (обе фракции). */
const RAID_BOT_CLASSES: Record<RaidRole, ClassId[]> = {
  tank: ["warrior", "deathknight"],
  healer: ["healer", "bloodweaver"],
  melee: ["rogue", "reaver"],
  ranged: ["ranger", "mage", "darkranger", "warlock"],
};

export class WorldRoom extends Room<OpenWorldState> {
  override maxClients = 200;
  override autoDispose = false;
  world!: World;
  parties!: Parties;
  queue!: ArenaQueue;
  trade!: TradeManager;
  bank!: BankService;
  muster!: RaidMuster;
  /** Фильтр видимости юнитов (задача 76, ./visibility.ts). */
  vis!: Visibility;
  static db: GameDB;
  /** Единственная комната мира (для HTTP API аккаунтов: карта, кто онлайн). */
  static instance: WorldRoom | null = null;
  db() {
    return WorldRoom.db;
  }

  override onCreate() {
    WorldRoom.instance = this;
    setMarketDb(WorldRoom.db);
    this.setState(new OpenWorldState());
    this.setPatchRate(PATCH_MS);
    this.world = new World(this.state, (type, msg) => this.broadcast(type, msg), {
      warStore: fileWarStore(path.join(path.dirname(WorldRoom.db.file), path.basename(WorldRoom.db.file, ".sqlite") + "-war.json")),
      wbossStore: fileWbStore(path.join(path.dirname(WorldRoom.db.file), path.basename(WorldRoom.db.file, ".sqlite") + "-wboss.json")),
    });
    const find = (key: string) => this.world.findByName(key);
    this.vis = new Visibility(this.state, () => this.world, (p) => (this.parties.members(p.name.toLowerCase()) ?? []).map((m) => find(m.key)));
    const visTick = guard("vis", () => this.vis.tick(Date.now(), (id, dots) => this.sockets.get(id)?.send("dots", dots)));
    this.setSimulationInterval(guard(T("srv.WorldRoom.838"), (dt: number) => { this.world.update(dt); visTick(); }), TICK_MS);
    this.parties = new Parties(find, (key) => !!find(key) || inArena.has(key) || inRaid.has(key));
    this.queue = new ArenaQueue(services.arena, find, (m) => void this.startMatch(m), (keys) => keys.forEach((k) => this.sendArenaInfo(k)));
    const away = (p: Player) => p.goingToArena || inArena.has(p.name.toLowerCase()) || inRaid.has(p.name.toLowerCase()) || inDungeon.has(p.name.toLowerCase());
    this.trade = new TradeManager(() => this.world, () => WorldRoom.db, away, () => this.world.map.playerSpawn);
    this.clock.setInterval(guard(T("srv.WorldRoom.839"), () => this.trade.tick()), 1000);
    this.bank = new BankService(() => this.world, () => WorldRoom.db, () => this.world.map.playerSpawn, away, (p, i) => this.trade.locked(p, i));
    // сбор рейда (задача 114): у Вестников Цитадели, один на сервер
    this.muster = new RaidMuster(find, (list) => void this.startRaid(list), (keys) => keys.forEach((k) => this.sendMuster(k)),
      (key) => (this.queue.busy(key) ? T("srv.WorldRoom.840") : find(key)?.goingToArena ? T("srv.WorldRoom.841") : null));
    this.clock.setInterval(guard(T("srv.WorldRoom.842"), () => this.muster.tick()), 1000);
    worldNews.system = (text) => this.world.system(text);
    const on = makeOn(this, () => this.world);
    registerCombat(on, () => this.world);
    this.onMessage("ping", (c) => c.send("pong", 0)); // сторож связи клиента
    on("war:tp", (p) => this.world.war?.teleport(p)); // «Знамёна Предела»: в свой форт перед битвой и в битве
    on("siege:tp", (p) => this.world.siege?.teleport(p)); // осада форта: нападающие — в лагерь у ворот, оборона — в свой форт
    this.registerMessages(on);
    this.registerArena(on);
    this.registerRaid(on);
    registerAdmin(this, on);
    registerEncounters(on, () => this.world);
    registerBiomes(on, () => this.world);
    registerCities(on, () => this.world);
    registerInteriors(on, () => this.world);
    if (process.env.TEST_MODE === "1") this.registerDebug(on);
    this.clock.setInterval(guard(T("srv.WorldRoom.843"), () => this.saveAll(true)), SAVE_INTERVAL_MS);
    this.clock.setInterval(guard(T("srv.WorldRoom.844"), () => this.queue.tick()), 1000);
    this.clock.setInterval(guard(T("srv.WorldRoom.845"), () => this.tickLogouts()), 200);
    this.clock.setInterval(guard(T("srv.WorldRoom.846"), () => this.checkSeason()), 60_000);
    this.checkSeason();
  }

  /** Вход героя аккаунта: токен сессии HTTP API + имя героя (герой должен принадлежать аккаунту). */
  override async onAuth(_client: Client, options: JoinOptions): Promise<AuthResult> {
    // старая сборка клиента (другой протокол) — не пускаем, с понятной просьбой обновить страницу
    const old = versionError(options?.version);
    if (old) throw new ServerError(426, old);
    const sess = sessionOf(options?.token);
    if (!sess) throw new ServerError(401, "Сессия истекла, войдите снова");
    const db = WorldRoom.db;
    const want = typeof options?.character === "string" ? options.character.trim() : "";
    if (!want || db.ownerOf(want) !== sess.accountId) throw new ServerError(403, "Этот герой не принадлежит аккаунту");
    const name = db.find(want)!.name;
    const key = GameDB.key(name);
    if (inArena.has(key)) throw new ServerError(409, "Этот герой сейчас на арене");
    const chars = db.charsOf(sess.accountId).map((c) => GameDB.key(c.name));
    // на аккаунте одновременно играет один герой; герой аккаунта на арене — ждём конца матча
    for (const k of chars) if (inArena.has(k)) throw new ServerError(409, "На аккаунте другой герой сейчас на арене");
    if (inRaid.has(key)) throw new ServerError(409, "Этот герой сейчас в рейде");
    if (inDungeon.has(key)) throw new ServerError(409, "Этот герой сейчас в подземелье «Пепельные чертоги»");
    for (const k of chars) if (inRaid.has(k)) throw new ServerError(409, "На аккаунте другой герой сейчас в рейде");
    for (const k of chars) if (inDungeon.has(k)) throw new ServerError(409, "На аккаунте другой герой сейчас в подземелье");
    const ban = db.banOf(name);
    if (ban) throw new ServerError(403, `Герой заблокирован ${ban.until > 4e12 ? T("srv.WorldRoom.847") : "до " + new Date(ban.until).toLocaleString("ru-RU")}${ban.reason ? ": " + ban.reason : ""}`);
    // вход с другой вкладки: старая сессия (этого или другого героя аккаунта) закрывается с сообщением, герой сохраняется
    for (const k of chars) {
      const old = this.world.findByName(k);
      if (old) this.kick(old);
    }
    const save = db.load(name);
    if (!save) throw new ServerError(404, "Герой не найден");
    return { name, save, created: freshChars.delete(key), accountId: sess.accountId };
  }

  override onJoin(client: Client, _options: JoinOptions, auth: AuthResult) {
    // позиция из сохранения другой версии карты или в стене/воде — в столицу своей фракции
    const s = auth.save, map = this.world.map;
    const home = homeCity(s.faction ?? classFaction(s.cls));
    const oldMap = s.mapVer !== MAP_VERSION;
    if (oldMap || !walkable(map, s.x, s.y, PLAYER_RADIUS)) {
      const sp = home.capital ? home.spawn : map.playerSpawn;
      s.x = sp.x;
      s.y = sp.y;
    }
    // с новой раскладкой (задача 132) Эмберхолл, Оазис и Снежная долина переехали: прежние открытые телепорты ведут не туда, где герой был, и дали бы
    // обойти поход к новым местам — остаётся своя столица, остальные города открываются заново пешком
    const reopen = oldMap && (s.cities ?? []).some((id) => id !== home.id);
    if (oldMap) s.cities = [home.id];
    s.mapVer = MAP_VERSION;
    const id = client.sessionId;
    this.sockets.set(id, client);
    // после переподключения у сессии новый объект клиента: отправка идёт через актуальный
    const p = new Player(id, auth.name, auth.save, (type, msg) => this.sockets.get(id)?.send(type, msg));
    p.admin = WorldRoom.db.isAdmin(p.name);
    p.accountId = auth.accountId ?? WorldRoom.db.ownerOf(p.name) ?? 0;
    this.world.addPlayer(p, auth.fromArena ? T("srv.WorldRoom.848", { name: p.name }) : auth.fromRaid ? T("srv.WorldRoom.849", { name: p.name }) : undefined);
    this.vis.attach(client, p); // до полного состояния: клиенту сразу уходят юниты вокруг героя
    client.send("welcome", { id: client.sessionId, seed: this.world.map.seed, created: auth.created });
    sendNodes(this.world, p);
    if (auth.created) client.send("toast", { text: T("srv.WorldRoom.213"), kind: "level" });
    if (reopen) client.send("toast", { text: T("srv.WorldRoom.214"), kind: "info" });
    deliverArenaRewards(p);
    deliverPending(p);
    const key = p.name.toLowerCase();
    client.send("party", this.parties.state(key));
    for (const m of this.parties.members(key) ?? []) if (m.key !== key) this.world.findByName(m.key)?.send("party", this.parties.state(m.key));
    this.sendArenaInfo(key);
    { const st = bossLootStatus(p.save.dgLoot?.ashlord, Date.now()); p.send("dungeon:status", { looted: st.looted, leftMs: st.leftMs, at: Date.now() }); }
  }

  /**
   * Уход клиента. Обрыв связи (не согласованный выход) — герой RECONNECT_SEC ждёт в мире:
   * обмен отменяется, маунт снимается, группа сохраняется. Не вернулся — сохранение и удаление.
   */
  override async onLeave(client: Client, consented: boolean) {
    const p = this.world.players.get(client.sessionId);
    if (!p) return;
    if (!consented && !p.noReconnect && !p.goingToArena) {
      this.suspend(p);
      const key = p.name.toLowerCase();
      try {
        const wait = this.allowReconnection(client, Number(process.env.RECONNECT_SEC) || RECONNECT_SEC);
        this.waiting.set(key, wait);
        const fresh = await wait;
        if (this.waiting.get(key) === (wait as unknown)) this.waiting.delete(key);
        if (this.world.players.get(client.sessionId) === p) return this.resume(p, fresh);
        return;
      } catch {
        if (this.waiting.get(key)) this.waiting.delete(key);
        if (this.world.players.get(client.sessionId) !== p) return; // уже вытеснен новым входом
      }
    }
    this.finalLeave(p);
  }

  /** Актуальный клиент сессии (после переподключения объект клиента другой). */
  private sockets = new Map<string, Client>();
  /** Ожидающие переподключения (ключ имени → отложенное переподключение Colyseus). */
  private waiting = new Map<string, { reject: Function }>();

  /** Обрыв связи: герой остаётся на месте, без движения и цели; обмен отменён, маунт снят. */
  private suspend(p: Player) {
    p.offline = true;
    p.logout = null;
    p.input = { mx: 0, my: 0 };
    p.moveTo = null;
    p.targetId = null;
    try {
      this.trade.leave(p);
      this.world.breakMount(p);
      this.queue.drop(p.name.toLowerCase());
      WorldRoom.db.save(p.name, p.toSave(this.world.map.playerSpawn));
    } catch (e) {
      console.error("[world] обрыв связи:", e);
    }
  }

  /** Переподключение: тот же герой (HP, мана, баффы, группа), клиенту — полное состояние заново. */
  private resume(p: Player, client: Client) {
    this.sockets.set(p.id, client);
    this.vis.attach(client, p); // Colyseus переносит вид на новый клиент; пересчёт на случай нового объекта
    p.offline = false;
    p.selfDirty = true;
    p.bagsDirty = true;
    p.aurasSig = null; // список эффектов — заново: пока связи не было, сообщения терялись
    resetTargetAuras(p); // и список эффектов цели
    const key = p.name.toLowerCase();
    client.send("welcome", { id: client.sessionId, seed: this.world.map.seed, created: false, resumed: true });
    sendNodes(this.world, p);
    p.send("combat", { on: p.combatSent });
    const t = this.world.time;
    for (const [id, until] of p.cds) if (until > t) p.send("cd", { id, ms: until - t });
    client.send("party", this.parties.state(key));
    this.sendArenaInfo(key);
    p.send("toast", { text: T("srv.WorldRoom.215"), kind: "info" });
  }

  /** Окончательный уход: сохранение (всегда), отмена обмена, очередь и группа, удаление из мира. */
  private finalLeave(p: Player, keepParty = false) {
    const key = p.name.toLowerCase();
    try {
      forgetRumors(p.id);
      p.logout = null;
      this.trade.leave(p);
      this.world.breakMount(p);
      this.world.wboss?.onLeave(p); // невзятое из мешков мирового босса — в сумку или pendingItems до сохранения
      if (!p.goingToArena) {
        this.queue.drop(key);
        if (!keepParty) this.parties.leave(key);
      }
    } catch (e) {
      console.error("[world] выход:", e);
    }
    try {
      WorldRoom.db.save(p.name, p.toSave(this.world.map.playerSpawn));
    } catch (e) {
      console.error("[world] сохранение при выходе:", e);
    }
    this.sockets.delete(p.id);
    this.vis.detach(p.id);
    this.world.removePlayer(p.id, p.goingToArena ? (inRaid.has(p.name.toLowerCase()) ? T("srv.WorldRoom.850", { name: p.name }) : T("srv.WorldRoom.851", { name: p.name })) : undefined);
  }

  /** Вход тем же аккаунтом с другой вкладки: старая сессия закрывается с сообщением, герой сохраняется. */
  private kick(p: Player) {
    console.warn(T("srv.WorldRoom.216", { name: p.name, id: p.id }));
    p.noReconnect = true;
    const key = p.name.toLowerCase();
    const client = this.clients.find((c) => c.sessionId === p.id);
    try {
      p.send("kicked", { text: KICK_TEXT });
    } catch {}
    this.finalLeave(p, true);
    const wait = this.waiting.get(key);
    this.waiting.delete(key);
    wait?.reject(new Error("kicked"));
    try {
      client?.leave(KICK_CODE);
    } catch {}
  }

  override onDispose() {
    this.saveAll();
    if (WorldRoom.instance === this) WorldRoom.instance = null;
  }

  // ---------- выход из игры (задача 29) ----------
  /** Вне боя — сразу; в бою — отсчёт LOGOUT_COMBAT_MS, полученный урон его прерывает. */
  private requestLogout(p: Player) {
    if (p.logout) return;
    if (p.goingToArena) return p.send("logout:cancel", { reason: T("srv.WorldRoom.852") });
    const t = this.world.time;
    if (p.inCombat(t)) {
      p.logout = { start: t, end: t + LOGOUT_COMBAT_MS };
      p.input = { mx: 0, my: 0 };
      p.moveTo = null;
      p.send("logout:wait", { ms: LOGOUT_COMBAT_MS });
      return;
    }
    this.finishLogout(p);
  }
  private cancelLogout(p: Player, reason: string) {
    if (!p.logout) return;
    p.logout = null;
    p.send("logout:cancel", { reason });
    if (reason) p.send("toast", { text: reason, kind: "error" });
  }
  private tickLogouts() {
    const t = this.world.time;
    for (const p of this.world.players.values()) {
      if (!p.logout) continue;
      if (p.hurtAt > p.logout.start) this.cancelLogout(p, T("srv.WorldRoom.853"));
      else if (t >= p.logout.end) this.finishLogout(p);
    }
  }
  /** Завершение: сохранение, отмена обмена, выход из очереди и группы, питомец и маунт убираются в onLeave. */
  private finishLogout(p: Player) {
    p.logout = null;
    const client = this.clients.find((c) => c.sessionId === p.id);
    if (!client) return;
    p.noReconnect = true;
    p.send("logout:ok", {});
    client.leave(LOGOUT_CODE);
  }

  /** Сохранение всех героев мира одной транзакцией (аудит 1.5); onlyChanged — только изменившиеся с прошлой записи (автосохранение). */
  saveAll(onlyChanged = false) {
    const spawn = this.world.map.playerSpawn;
    return WorldRoom.db.saveMany([...this.world.players.values()].map((p) => ({ name: p.name, save: p.toSave(spawn) })), onlyChanged);
  }

  // ---------- арена ----------
  private checkSeason() {
    const closed = services.arena.closeSeasonIfDue();
    if (closed !== null) this.onSeasonClosed(closed);
  }
  private onSeasonClosed(id: number) {
    this.world.system(T("srv.WorldRoom.854", { id: id }));
    for (const p of this.world.players.values()) {
      deliverArenaRewards(p);
      this.sendArenaInfo(p.name.toLowerCase());
    }
  }

  arenaInfo(key: string): ArenaInfo {
    const store = services.arena;
    const season = store.season();
    const ratings = {} as Record<ArenaMode, ModeRating>;
    for (const mode of ARENA_MODES) {
      const r = store.rating(key, mode);
      ratings[mode] = { ...r, rank: rankOf(r.rating).id, place: store.place(key, mode) };
    }
    const p = this.world.findByName(key);
    return {
      season: { id: season.id, endsAt: season.ends, now: Date.now() },
      ratings,
      queue: this.queue.status(key),
      pending: !!this.queue.pendingOf(key),
      party: this.parties.state(key),
      titles: (p?.save.titles ?? []).map((t) => t.name),
      title: p?.save.title ?? "",
      frame: p?.save.frame ?? "",
    };
  }
  sendArenaInfo(key: string) {
    this.world.findByName(key)?.send("arena:info", this.arenaInfo(key));
  }

  /** Все подтвердили матч: сохраняем героев, создаём инстанс арены и резервируем места. */
  private async startMatch(m: PendingMatch) {
    const keys = m.teams.flatMap((t) => t.flatMap((e) => e.members));
    const players = keys.map((k) => this.world.findByName(k));
    if (players.some((p) => !p || p.dead)) {
      for (const p of players) p?.send("arena:cancelled", { reason: T("srv.WorldRoom.855") });
      return;
    }
    const season = services.arena.season().id;
    const participants: Participant[] = [];
    m.teams.forEach((t, ti) => {
      for (const e of t) for (const k of e.members) {
        const p = this.world.findByName(k)!;
        participants.push({ name: p.name, nameKey: k, cls: p.cls, level: p.level, team: ti + 1, rating: e.ratings[k] });
      }
      for (const b of m.bots?.[ti] ?? []) participants.push({ name: b.name, nameKey: b.nameKey, cls: b.cls, level: b.level, team: ti + 1, rating: b.rating, bot: b.save });
    });
    for (const p of players as Player[]) {
      inArena.add(p.name.toLowerCase());
      p.goingToArena = true;
      this.world.breakMount(p);
      p.input = { mx: 0, my: 0 };
      p.moveTo = null;
      WorldRoom.db.save(p.name, p.toSave(this.world.map.playerSpawn));
    }
    try {
      const options: ArenaOptions = { mode: m.mode, season, participants, bots: !!m.bots };
      const room = await matchMaker.createRoom("arena", options);
      for (const p of players as Player[]) {
        const res = await matchMaker.reserveSeatFor(room, {}, { name: p.name, save: JSON.parse(JSON.stringify(p.save)) });
        p.send("arena:go", { mode: m.mode, reservation: { sessionId: res.sessionId, room: { name: "arena", roomId: room.roomId, processId: room.processId } } });
      }
    } catch (e) {
      console.error("[arena] не удалось создать матч:", e);
      for (const p of players as Player[]) {
        inArena.delete(p.name.toLowerCase());
        p.goingToArena = false;
        p.send("arena:cancelled", { reason: T("srv.WorldRoom.856") });
      }
    }
  }

  private registerArena(on: On) {
    const key = (p: Player) => p.name.toLowerCase();
    on("arena:info", (p) => this.sendArenaInfo(key(p)));
    on<{ mode: unknown }>("arena:queue", (p, m) => {
      const mode = m.mode as ArenaMode;
      if (!ARENA_MODES.includes(mode)) return;
      if (p.goingToArena) return;
      if (this.muster.has(key(p))) return p.send("toast", { text: T("srv.WorldRoom.217"), kind: "error" });
      let group = [p];
      const party = this.parties.members(key(p));
      if (mode === "2v2" && party && party.length === TEAM_SIZE["2v2"]) {
        const mates = party.map((x) => this.world.findByName(x.key));
        if (mates.some((x) => !x)) return p.send("toast", { text: T("srv.WorldRoom.218"), kind: "error" });
        group = mates as Player[];
      }
      const err = this.queue.join(group, mode);
      if (err) return p.send("toast", { text: err, kind: "error" });
      for (const g of group) g.send("toast", { text: T("srv.WorldRoom.219", { mode: MODE_NAMES[mode], length: group.length > 1 ? ` ${T("srv.WorldRoom.857")}` : "" }), kind: "info" });
    });
    on("arena:cancel", (p) => this.queue.cancel(key(p)));
    on("arena:accept", (p) => this.queue.accept(key(p)));
    on("arena:decline", (p) => this.queue.decline(key(p)));
    on<{ mode: unknown }>("arena:top", (p, m) => {
      const mode = m.mode as ArenaMode;
      if (ARENA_MODES.includes(mode)) p.send("arena:top", { mode, rows: services.arena.top(mode) });
    });
    on("arena:history", (p) => p.send("arena:history", services.arena.history(key(p))));
    on<{ name: unknown }>("arena:title", (p, m) => {
      const t = typeof m.name === "string" ? (p.save.titles ?? []).find((x) => x.name === m.name) : undefined;
      p.save.title = t?.name ?? "";
      p.save.frame = t?.rank ?? "";
      p.applyCosmetics();
      this.sendArenaInfo(key(p));
    });
    on<{ name: unknown }>("party:invite", (p, m) => {
      if (typeof m.name !== "string") return;
      const err = this.parties.invite(p, m.name);
      p.send("toast", { text: err ?? T("srv.WorldRoom.858", { name: m.name }), kind: err ? "error" : "info" });
    });
    on<{ accept: unknown }>("party:respond", (p, m) => {
      const err = this.parties.respond(p, m.accept === true);
      if (err) p.send("toast", { text: err, kind: "error" });
      for (const x of this.parties.members(key(p)) ?? []) this.sendArenaInfo(x.key);
    });
    on("party:leave", (p) => {
      const mates = this.parties.members(key(p)) ?? [];
      for (const x of mates) this.queue.cancel(x.key);
      this.parties.leave(key(p));
      for (const x of mates) this.sendArenaInfo(x.key);
    });
  }

  // ---------- рейд (задача 114) ----------
  sendMuster(key: string) {
    const p = this.world.findByName(key);
    p?.send("raid:muster", this.muster.status(p, key));
  }

  private registerRaid(on: On) {
    const key = (p: Player) => p.name.toLowerCase();
    on("raid:info", (p) => this.sendMuster(key(p)));
    on("raid:join", (p) => {
      if (!heraldNear(p.x, p.y, RAID.npc.range + 40)) return p.send("toast", { text: T("srv.WorldRoom.220"), kind: "error" });
      const no = serviceRefusal("raid", p.x, p.y, p.faction, RAID.npc.range + 40);
      if (no) return p.send("toast", { text: no, kind: "error" });
      // группа входит целиком
      let group = [p];
      const party = this.parties.members(key(p));
      if (party && party.length > 1) {
        const mates = party.map((x) => this.world.findByName(x.key));
        if (mates.some((x) => !x)) return p.send("toast", { text: T("srv.WorldRoom.221"), kind: "error" });
        group = mates as Player[];
      }
      const err = this.muster.join(group);
      if (err) return p.send("toast", { text: err, kind: "error" });
      for (const g of group) g.send("toast", { text: T("srv.WorldRoom.222", { name: RAID.boss.name, length: group.length > 1 ? ` ${T("srv.WorldRoom.857")}` : "" }), kind: "info" });
    });
    on("raid:cancel", (p) => this.muster.cancel(key(p)));
    // мировые боссы (задача 151): тот же Вестник в Эмберхолле — регистрация в сбор своей фракции (общий Muster, автосбор отрядов по ролям)
    const wb = () => this.world.wboss;
    on("wboss:info", (p) => wb()?.sendMuster(key(p)));
    on("wboss:chronicle", (p) => p.send("wboss:chronicle", wb()?.chronicle() ?? []));
    on("wboss:join", (p) => {
      if (!wb()) return;
      if (!heraldNear(p.x, p.y, RAID.npc.range + 40)) return p.send("toast", { text: T("srv.WorldRoom.220"), kind: "error" });
      let group = [p];
      const party = this.parties.members(key(p));
      if (party && party.length > 1) {
        const mates = party.map((x) => this.world.findByName(x.key));
        if (mates.some((x) => !x)) return p.send("toast", { text: T("srv.WorldRoom.221"), kind: "error" });
        group = mates as Player[];
      }
      const err = wb()!.join(group);
      if (err) return p.send("toast", { text: err, kind: "error" });
    });
    on("wboss:cancel", (p) => wb()?.cancel(p));
    on("wboss:tp", (p) => { const err = wb()?.teleport(p); if (err) p.send("toast", { text: err, kind: "error" }); });
    on("wboss:start", (p) => { const err = wb()?.startNow(p); if (err) p.send("toast", { text: err, kind: "error" }); });
    on("raid:start", (p) => {
      const err = this.muster.startNow(key(p));
      if (err) p.send("toast", { text: err, kind: "error" });
    });
  }

  /** Сбор окончен: боты добирают роли, герои сохраняются, создаётся инстанс рейда и резервируются места. */
  private async startRaid(list: MusterEntry[]) {
    const players = list.map((e) => this.world.findByName(e.key)).filter((p): p is Player => !!p && !p.dead && !p.goingToArena);
    if (!players.length) return;
    const members: RaidMember[] = players.map((p) => ({
      key: p.name.toLowerCase(), name: p.name, cls: p.cls, level: p.level, role: list.find((e) => e.key === p.name.toLowerCase())!.role,
      save: JSON.parse(JSON.stringify(p.save)) as PlayerSave, from: { x: p.x, y: p.y },
    }));
    // боты по недостающим ролям, классы обеих фракций, имена — data/raid.json
    const need = RaidMuster.fill(members);
    const taken = new Set(members.map((m) => m.key));
    const names = RAID.bots.names.filter((n) => !taken.has(n.toLowerCase())).sort(() => Math.random() - 0.5);
    let ni = 0;
    for (const role of RAID_ROLES) for (let i = 0; i < need[role]; i++) {
      const pool = RAID_BOT_CLASSES[role], cls = pool[Math.floor(Math.random() * pool.length)];
      const name = names[ni++] ?? `${RAID.bots.title} ${ni}`;
      members.push({ key: name.toLowerCase(), name, cls, level: 100, role, bot: true, save: raidBotSave(cls, 100, RAID.bots.title) });
    }
    const hpScale = players.length > RAID_CFG.size ? players.length / RAID_CFG.size : 1;
    for (const p of players) {
      inRaid.add(p.name.toLowerCase());
      p.goingToArena = true;
      this.world.breakMount(p);
      this.trade.leave(p);
      p.input = { mx: 0, my: 0 };
      p.moveTo = null;
      WorldRoom.db.save(p.name, p.toSave(this.world.map.playerSpawn));
    }
    try {
      const options: RaidOptions = { members, hpScale };
      const room = await matchMaker.createRoom("raid", options);
      for (const p of players) {
        const res = await matchMaker.reserveSeatFor(room, {}, { name: p.name, save: JSON.parse(JSON.stringify(p.save)) });
        p.send("raid:go", { reservation: { sessionId: res.sessionId, room: { name: "raid", roomId: room.roomId, processId: room.processId } } });
      }
      this.world.system(RAID.chat.start);
    } catch (e) {
      console.error("[raid] не удалось создать рейд:", e);
      for (const p of players) {
        inRaid.delete(p.name.toLowerCase());
        p.goingToArena = false;
        p.send("toast", { text: T("srv.WorldRoom.223"), kind: "error" });
      }
    }
  }

  /** Спуск в подземелье «Пепельные чертоги»: у лестницы вплотную, вне боя; затемнение, сохранение, резервация места в общей комнате. */
  private async enterDungeon(p: Player) {
    const w = this.world, no = (text: string) => p.send("toast", { text, kind: "error" });
    if (p.dead || p.goingToArena || p.team !== 0 || inDungeon.has(p.name.toLowerCase())) return;
    if (w.dist(p, DUNGEON_DOOR) > DOOR_RANGE) return no("Подойдите к лестнице вплотную");
    if (p.inCombat(w.time)) return no("В бою спуститься нельзя");
    if (p.tele || p.mountCast || p.stunUntil > w.time) return no("Сейчас нельзя");
    const key = p.name.toLowerCase();
    p.goingToArena = true;
    p.input = { mx: 0, my: 0 };
    p.moveTo = null;
    w.stopFollow(p, false);
    p.send("dungeon:fade", { ms: DOOR_FADE_MS });
    await new Promise<void>((res) => this.clock.setTimeout(res, DOOR_FADE_MS));
    if (!w.players.has(p.id) || p.dead) { p.goingToArena = false; return; }
    w.breakMount(p);
    this.trade.leave(p);
    try {
      const sv = p.toSave(w.map.playerSpawn);
      sv.x = DUNGEON_OUT.x;
      sv.y = DUNGEON_OUT.y;
      WorldRoom.db.save(p.name, sv);
      inDungeon.add(key);
      const room = (await matchMaker.query({ name: "dungeon" }))[0] ?? (await matchMaker.createRoom("dungeon", {}));
      const res = await matchMaker.reserveSeatFor(room, {}, { name: p.name, save: JSON.parse(JSON.stringify(sv)) });
      p.send("dungeon:go", { reservation: { sessionId: res.sessionId, room: { name: "dungeon", roomId: room.roomId, processId: room.processId } } });
    } catch (e) {
      console.error("[dungeon] вход:", e);
      inDungeon.delete(key);
      p.goingToArena = false;
      no("Не удалось спуститься, попробуйте ещё раз");
    }
  }

  private registerMessages(on: On) {
    const w = () => this.world;
    on("respawn", (p) => w().respawn(p));
    on("dungeon:enter", (p) => void this.enterDungeon(p));
    on("logout:request", (p) => this.requestLogout(p));
    on("logout:cancel", (p) => this.cancelLogout(p, ""));
    on<{ id: unknown }>("mount:select", (p, m) => {
      if (typeof m.id !== "string" || !p.save.mounts?.includes(m.id)) return;
      p.save.mount = m.id;
      p.selfDirty = true;
    });
    on("pet:toggle", (p) => togglePet(w(), p));
    on<{ id: unknown }>("pet:select", (p, m) => typeof m.id === "string" && selectPet(w(), p, m.id));
    // Смотритель зверинца (задача 150): «Печать питомца» в сумку (server/src/game/menagerie.ts)
    on<{ id: unknown }>("pet:buy", (p, m) => keeperBuy(w(), p, m.id));
    // маунты торговки (vendor) и конюшего (vendor, rep): печать в сумку; сборка из деталей — у конюшего (server/src/game/stable.ts)
    on<{ id: unknown }>("mount:buy", (p, m) => {
      const def = typeof m.id === "string" && Object.hasOwn(MOUNTS, m.id) ? MOUNTS[m.id] : undefined;
      if (!def || p.dead) return;
      if (!nearMerchant(w(), p)) return p.send("toast", { text: T("srv.WorldRoom.224"), kind: "error" });
      const no = merchantRefusal(p);
      if (no) return p.send("toast", { text: no, kind: "error" });
      if (def.source !== "vendor") return p.send("toast", { text: T("srv.WorldRoom.225"), kind: "error" });
      buySeal(p, def.id);
    });
    on<{ id: unknown }>("stable:buy", (p, m) => stableBuy(w(), p, m.id));
    on<{ id: unknown }>("stable:craft", (p, m) => stableCraft(w(), p, m.id, bestArenaRating(p.name.toLowerCase())));
    on("stable:open", (p) => p.send("stable:info", { arenaRating: bestArenaRating(p.name.toLowerCase()) }));
    on<{ npc: unknown }>("rumor", (p, m) => {
      const r = rumorFor(w(), p, m.npc);
      if (r) p.send("rumor", r);
    });
    on<{ stat: unknown; n: unknown }>("alloc", (p, m) => {
      // hasOwn, а не in: иначе «constructor» и «toString» из прототипа пишут NaN в сохранение
      if (typeof m.stat !== "string" || !Object.hasOwn(STAT_NAMES, m.stat)) return;
      const n = m.n === undefined ? 1 : m.n; // без n — одно очко, как раньше
      if (typeof n !== "number" || !Number.isInteger(n) || n < 1 || n > 10) return;
      if (!p.allocate(m.stat as StatKey, n)) p.send("toast", { text: T("srv.WorldRoom.226"), kind: "error" });
    });
    on<{ id: unknown }>("learn", (p, m) => {
      const def = typeof m.id === "string" && Object.hasOwn(SKILLS, m.id) ? SKILLS[m.id] : undefined;
      if (!def || def.cls !== p.cls) return;
      const why = canLearn(def, p.save.skills, p.level, p.skillPoints());
      if (why) return p.send("toast", { text: why, kind: "error" });
      const bars = p.bars(); // миграция по прежним умениям — до вложения очка
      const first = !p.save.skills[def.id];
      p.save.skills[def.id] = (p.save.skills[def.id] || 0) + 1;
      p.recalc();
      // ранг 0→1: активное умение встаёт в свободный слот; клиент допишет «— клавиша R» по своей схеме
      const at = first && def.kind === "active" ? autoPlace(bars, p.cls, def.id) : null;
      if (at) { p.save.bars = setSlot(bars, at.bar, at.i, { s: def.id }); p.selfDirty = true; }
      p.send("toast", { text: T("srv.WorldRoom.227", { name: def.name, id: p.save.skills[def.id] }), kind: "info", ...(at ? { slot: at } : {}) });
    });
    const lock = (p: Player, ...idx: unknown[]) => {
      if (!idx.some((i) => this.trade.locked(p, i))) return false;
      p.send("toast", { text: T("srv.bank.65"), kind: "error" });
      return true;
    };
    // осмотр игрока (docs/art/gear.md, раздел 4): цель в зоне видимости, не чаще раза в секунду
    on<{ sid: unknown }>("inspect", (p, m) => {
      if (typeof m.sid !== "string") return;
      if (w().time - p.lastInspect < INSPECT_COOLDOWN_MS) return p.send("toast", { text: T("srv.common.212"), kind: "error" });
      p.lastInspect = w().time;
      const t = w().players.get(m.sid);
      if (!t || (t !== p && w().stealthed(t))) return;
      if (t !== p && w().dist(p, t) > INSPECT_RANGE) return p.send("toast", { text: T("srv.WorldRoom.228"), kind: "error" });
      const reply: InspectReply = {
        sid: m.sid,
        name: t.name,
        cls: t.cls,
        lvl: t.level,
        fac: t.faction,
        equip: SLOTS.map((slot) => {
          const it = t.save.equip[slot];
          return { slot, base: it?.base ?? "", r: it?.rarity ?? 0, plus: it?.plus || 0, leg: it?.legendary ?? "", model: it?.model ?? "", item: it ?? null };
        }),
      };
      p.send("inspect", reply);
    });
    on<{ index: unknown }>("equip", (p, m) => !lock(p, m.index) && equip(w(), p, m.index));
    on<{ slot: unknown }>("unequip", (p, m) => unequip(w(), p, m.slot));
    on<{ index: unknown }>("use", (p, m) => !lock(p, m.index) && useItem(w(), p, m.index));
    on<{ base: unknown }>("use:base", (p, m) => useBase(w(), p, m.base, (j) => this.trade.locked(p, j)));
    on<unknown>("market:get", (p) => sendPrices(p));
    on<{ index: unknown }>("sell",(p, m) => !lock(p, m.index) && sell(w(), p, m.index));
    on<{ a: unknown; b: unknown }>("swap", (p, m) => !lock(p, m.a, m.b) && swap(p, m.a, m.b));
    // обмен
    on<{ id: unknown }>("trade:request", (p, m) => this.trade.request(p, m.id));
    on<{ accept: unknown }>("trade:respond", (p, m) => this.trade.respond(p, m.accept === true));
    on<{ index: unknown; slot: unknown }>("trade:add", (p, m) => this.trade.add(p, m.index, m.slot));
    on<{ slot: unknown }>("trade:remove", (p, m) => this.trade.remove(p, m.slot));
    on<{ v: unknown }>("trade:gold", (p, m) => this.trade.gold(p, m.v));
    on("trade:ready", (p) => this.trade.ready(p));
    on("trade:confirm", (p) => this.trade.confirm(p));
    on("trade:cancel", (p) => this.trade.cancel(p.name.toLowerCase(), T("srv.WorldRoom.859", { name: p.name })));
    on<{ base: unknown; qty: unknown }>("buy", (p, m) => buy(w(), p, m.base, m.qty));
    on<{ id: unknown; qty: unknown }>("cook:buy", (p, m) => buyFood(w(), p, m.id, m.qty));
    on<{ id: unknown; qty: unknown }>("smith:buy", (p, m) => buyMaterial(w(), p, m.id, m.qty));
    on<{ index: unknown; slot: unknown }>("smith:upgrade", (p, m) => upgradeItem(w(), p, m.index, m.slot, (i) => this.trade.locked(p, i)));
    // Перековщик (docs/art/gear.md): снять оболочку, наложить, сбросить вид
    on<{ index: unknown }>("tm:extract", (p, m) => tmExtract(w(), p, m.index, (i) => this.trade.locked(p, i)));
    on<{ shell: unknown; index: unknown; slot: unknown }>("tm:apply", (p, m) => tmApply(w(), p, m.shell, m.index, m.slot, (i) => this.trade.locked(p, i)));
    on<{ index: unknown; slot: unknown }>("tm:reset", (p, m) => tmReset(w(), p, m.index, m.slot, (i) => this.trade.locked(p, i)));
    on<{ bag: unknown }>("pickup", (p, m) => pickupBag(w(), WorldRoom.db, p, m.bag));
    const here = () => this.world.map.playerSpawn;
    on<{ index: unknown; qty: unknown; gold: unknown }>("drop", (p, m) => dropItem(w(), WorldRoom.db, here(), p, m, (i) => this.trade.locked(p, i)));
    on<{ index: unknown; word: unknown }>("destroy", (p, m) => destroyItem(w(), WorldRoom.db, here(), p, m, (i) => this.trade.locked(p, i)));
    // банк
    on("bag:expand", (p) => expandBag(w(), WorldRoom.db, w().map.playerSpawn, p, p.goingToArena || inArena.has(p.name.toLowerCase())));
    on("bank:open", (p) => this.bank.open(p));
    on<{ index: unknown; tab: unknown; slot: unknown }>("bank:put", (p, m) => this.bank.put(p, m.index, m.tab, m.slot));
    on<{ tab: unknown; slot: unknown; index: unknown }>("bank:take", (p, m) => this.bank.take(p, m.tab, m.slot, m.index));
    on<{ tab: unknown; slot: unknown; toTab: unknown; toSlot: unknown }>("bank:move", (p, m) => this.bank.move(p, m.tab, m.slot, m.toTab, m.toSlot));
    on<{ v: unknown }>("bank:gold", (p, m) => this.bank.gold(p, m.v));
    on("bank:buy", (p) => this.bank.buy(p));
  }

  /** Отладочные команды только для автотестов (TEST_MODE=1). */
  private registerDebug(on: On) {
    const w = () => this.world;
    on<{ op: string; [k: string]: unknown }>("dbg", (p, m) => {
      switch (m.op) {
        case "tp": p.unit.x = Number(m.x); p.unit.y = Number(m.y); p.moveTo = null; break;
        case "mount": { // тест маунтов: выдать и сразу сесть (без каста); пустой id — спешиться
          const id = String(m.id ?? "");
          if (id && Object.hasOwn(MOUNTS, id) && !p.save.mounts?.includes(id)) (p.save.mounts ??= []).push(id);
          if (id && Object.hasOwn(MOUNTS, id)) p.save.mount = id;
          p.unit.mount = id && Object.hasOwn(MOUNTS, id) ? id : "";
          p.selfDirty = true;
          break;
        }
        case "gear": { // тест внешности: {slots:{helmet:{r,plus,leg}}} — надевает без проверок
          const sl = (m.slots || {}) as Record<string, { base?: string; r?: number; plus?: number; leg?: string; rags?: boolean } | null>;
          for (const [k, v] of Object.entries(sl)) { if (!v) { (p.save.equip as Record<string, unknown>)[k] = null; continue; } const it = v.leg ? makeLegendary(v.leg) : makeItem(v.base || k, 20, (v.r || 0) as Rarity); it.plus = v.plus || 0; if (v.rags) it.rags = true; (p.save.equip as Record<string, unknown>)[k] = it; }
          if (m.faction) { p.save.faction = String(m.faction) as typeof p.save.faction; p.unit.faction = String(m.faction); }
          p.recalc(); break;
        }
        case "xp": gainXp(w(), p, Number(m.v)); break;
        case "level": { const lv = Math.min(MAX_LEVEL, Number(m.v) || 1); while (p.level < lv) gainXp(w(), p, xpToNext(p.level) - p.save.xp); break; }
        case "gold": p.save.gold += Number(m.v); p.selfDirty = true; break;
        case "rep": p.save.rep = Number(m.rep) || 0; p.save.marks = Number(m.marks) || 0; p.selfDirty = true; break; // конюшня (задача 142)
        case "hp": p.unit.hp = Math.max(1, Number(m.v)); break;
        case "god": p.unit.maxHp = 999999; p.unit.hp = 999999; break;
        case "drop": p.forceDrop = !!m.v; break;
        case "item": addItem(p, m.unique ? makeUnique(String(m.unique)) : makeItem(String(m.base), Number(m.ilvl || 1), Number(m.rarity || 0) as Rarity)); break;
        case "mobhp": { const mob = w().mobs.get(String(m.id)); if (mob) mob.unit.hp = Math.max(1, Math.round(mob.unit.maxHp * Number(m.v))); break; }
        case "hurt": w().applyDamage(p, Number(m.v)); break;
        case "qp": questProgress(p, m.kind === "gather" ? "gather" : "kill", String(m.target), Number(m.n || 1)); break;
        case "calm": p.combatAt = -1e9; break;
        case "slow": p.slowUntil = w().time + Number(m.ms || 5000); p.slowPct = Number(m.v || 50); break; // проверка шага героя Б при замедлении
        case "fight": p.combatAt = w().time; break;
        case "fill": for (let i = 0; i < p.save.inventory.length; i++) if (!p.save.inventory[i]) p.save.inventory[i] = makeItem("ring", 1, Rarity.Common); break;
        case "rating": services.arena.setRating(p.name.toLowerCase(), p.name, p.cls, m.mode as ArenaMode, Number(m.v)); this.sendArenaInfo(p.name.toLowerCase()); break;
        case "war": w().war?.debug(String(m.act ?? ""), m); break; // «Знамёна Предела»: act start [front] | heart | end | skip ms | prep ms | owner base f | reset
        case "siege": w().siege?.debug(String(m.act ?? ""), m); break;
        case "wboss": w().wboss?.debug(String(m.act ?? ""), m, p); break; // мировые боссы (задача 151): act start | soon [ms] | kill | reset | end | skip ms [boss] // осада форта: act start [att] | breach [gate] | hp gate pct | end [win] | prep ms | reset
        case "season:end": { const id = services.arena.closeSeasonIfDue(Date.now(), true); if (id !== null) this.onSeasonClosed(id); break; }
      }
      p.selfDirty = true;
    });
  }
}
