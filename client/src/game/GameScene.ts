import Phaser from "phaser";
import { MERCHANT_RANGE, PICKUP_RANGE, PLAYER_RADIUS, PLAYER_SPEED, TILE } from "../../../shared/constants";
import { Nav } from "../../../shared/path";
import { generateMap, lineClear, moveWithCollision, terrainSpeedMul, zoneAtPx, zoneStyle, ZONES, type WorldMap, Zone } from "../../../shared/map";
import { ENV } from "../../../shared/biomes";
import * as sfx from "./sfx";
import { nightLevel } from "../../../shared/daynight";
import { Anim, Dir, BUFF_STEALTH, BUFF_ROOT, BUFF_SLOW, BUFF_STUN, UnitKind, type LootBag } from "../../../shared/protocol";
import { SKILLS, type SkillDef } from "../../../shared/skills";
import { RUMOR_NPCS } from "../../../shared/rumors";
import { COOK } from "../../../shared/food";
import { CITIES } from "../../../shared/cities";
import { SMITH } from "../../../shared/upgrade";
import { BANKER } from "../../../shared/bank";
import { BAGMAN } from "../../../shared/bags";
import { ARENA_NPC, generateArenaMap, MODE_NAMES } from "../../../shared/arena";
import { MOUNTS } from "../../../shared/mounts";
import { net, type UnitState } from "../net";
import { PETS } from "../../../shared/pets";
import { CLASSES } from "../../../shared/classes";
import { factionsHostile, pvpPlace } from "../../../shared/factions";
import type { Hud } from "../ui/hud";
import { Effects } from "./effects";
import { Scenes } from "./scenes";
import { buildWorld, DEPTH, zoneTint, type WorldView } from "./terrain";
import { FONT, UnitView } from "./UnitView";
import { HeldKeys, isMoveAction, keybinds, mouseOpts, type ActionId, type MoveAction } from "./keybinds";
import { AimPreview } from "./aim";
import { resolveCast, type CastUnit } from "./castResolve";

type NpcKind = "shop" | "arena" | "rumor" | "cook" | "smith" | "bank" | "bags" | "enc" | "quest" | "stone";
type Npc = { sprite: Phaser.GameObjects.Sprite; kind: NpcKind; id?: string; name?: string; objs?: Phaser.GameObjects.GameObject[] };

/** Звуковой фон: по зоне, иначе по её биому (новые зоны звучат как биом, которым нарисованы). */
const AMBIENCE: Partial<Record<Zone, string>> = {
  [Zone.Town]: "town", [Zone.OasisCity]: "desert", [Zone.SnowCity]: "snow", [Zone.Meadow]: "meadow", [Zone.Forest]: "forest", [Zone.Swamp]: "swamp", [Zone.Ashlands]: "ash", [Zone.Dungeon]: "dungeon", [Zone.Arena]: "ash",
  [Zone.Desert]: "desert", [Zone.Snow]: "snow", [Zone.Volcano]: "volcano", [Zone.Coast]: "water", [Zone.Frontier]: "meadow",
  [Zone.SolgardCity]: "town", [Zone.UmbrathCity]: "dungeon",
};
const ZONE_COLOR: Partial<Record<Zone, string>> = {
  [Zone.OasisCity]: "#f0c070", [Zone.SnowCity]: "#bfe4ff", [Zone.Desert]: "#f0c070", [Zone.Snow]: "#bfe4ff", [Zone.Volcano]: "#ff8a4a", [Zone.Coast]: "#7ad0ff", [Zone.Swamp]: "#a8d890", [Zone.Forest]: "#a8e080",
  [Zone.SolgardCity]: "#ffe27a", [Zone.SunFields]: "#ffe8a0", [Zone.KingsWood]: "#c8f0a0", [Zone.GryphonCliffs]: "#d8ecff", [Zone.FallenBarrens]: "#f0d090",
  [Zone.UmbrathCity]: "#c890ff", [Zone.Barrows]: "#b8a0e0", [Zone.MistWood]: "#a8c0b0", [Zone.BoneRidge]: "#d8d0c0", [Zone.PlagueMarsh]: "#a0e070",
  [Zone.StormPeaks]: "#a8d0ff", [Zone.AshFoothills]: "#e0a080",
};
/** Зоны Умбрата: туман и пурпурная дымка. */
const GLOOM = new Set<Zone>([Zone.UmbrathCity, Zone.Barrows, Zone.MistWood, Zone.PlagueMarsh, Zone.BoneRidge]);
/** Юниты дальше этого (px) не создаются на клиенте (мобы и NPC; герои — всегда). */
const UNIT_NEAR = 1500, UNIT_FAR = 1900;

export class GameScene extends Phaser.Scene {
  map!: WorldMap;
  world!: WorldView;
  hud!: Hud;
  fx!: Effects;
  units = new Map<string, UnitView>();
  me: UnitView | null = null;
  /** Предсказанная позиция своего героя. */
  pos = { x: 0, y: 0 };
  /** Зажатые клавиши движения (раскладка — keybinds.ts). */
  held = new HeldKeys();
  lastInput = { mx: 0, my: 0, at: 0 };
  /** Удержание кнопки мыши на земле (>200 мс — движение за курсором), автобег, клик-путь (предсказание), следование. */
  mouseHold: { right: boolean; since: number } | null = null;
  autorun: { dx: number; dy: number; since: number } | null = null;
  clickGoal: { x: number; y: number; at: number } | null = null;
  clickNav = new Nav();
  lastDir: { dx: number; dy: number } | null = null;
  following = false;
  /** Сервер держит героя (канал, воскрешение, танец) до этого момента: шаги не предсказываем. */
  castHold = 0;
  targetId: string | null = null;
  bagViews = new Map<string, Phaser.GameObjects.Image>();
  pendingPickup: string | null = null;
  /** NPC города (только в мире): торговка и распорядитель арены. */
  npcs: Npc[] = [];
  pendingNpc: Npc | null = null;
  /** Узлы добычи: исчерпанные и узел, к которому идём. */
  depletedNodes = new Set<number>();
  pendingGather: number | null = null;
  private npcExtras: Phaser.GameObjects.GameObject[] = [];
  private cleanup: (() => void)[] = [];
  bubbles: { t: Phaser.GameObjects.Text; id: string; until: number }[] = [];
  zone: Zone = Zone.Town;
  clickMark!: Phaser.GameObjects.Image;
  hoverId: string | null = null;
  ambient: Record<string, Phaser.GameObjects.Particles.ParticleEmitter> = {};
  dust!: Phaser.GameObjects.Particles.ParticleEmitter;
  selfLight!: Phaser.GameObjects.Image;
  dustAt = new Map<string, number>();

  constructor() {
    super("game");
  }

  private scenes: Scenes | null = null;

  create() {
    // сцена перезапускается при переходе мир ⇄ арена: сбрасываем состояние прошлого запуска
    this.units = new Map();
    this.me = null;
    this.targetId = null;
    this.bagViews = new Map();
    this.pendingPickup = null;
    this.pendingNpc = null;
    this.bubbles = [];
    this.held.clear();
    this.ambient = {};
    this.dustAt = new Map();
    this.npcs = [];
    this.hoverId = null;
    this.zone = -1 as Zone;
    this.lastInput = { mx: 0, my: 0, at: 0 };
    this.mouseHold = this.autorun = this.clickGoal = this.lastDir = null;
    this.following = false;
    this.castHold = 0;
    // shutdown — перезапуск/остановка сцены, destroy — пересоздание игры после ошибки: подписки снимаются в обоих случаях
    const done = () => {
      this.events.off("shutdown", done);
      this.events.off("destroy", done);
      for (const fn of this.cleanup.splice(0)) {
        try { fn(); } catch {}
      }
    };
    this.events.once("shutdown", done);
    this.events.once("destroy", done);

    this.hud = this.registry.get("hud") as Hud;
    this.map = net.kind === "arena" ? generateArenaMap() : generateMap(net.seed);
    this.world = buildWorld(this, this.map);
    const cam = this.cameras.main;
    cam.setBounds(0, 0, this.map.w * TILE, this.map.h * TILE);
    const fitZoom = () => cam.setZoom(Math.max(2, Math.min(3, Math.round(Math.min(window.innerWidth / 640, window.innerHeight / 400)))));
    fitZoom();
    this.scale.on("resize", fitZoom);
    this.cleanup.push(() => this.scale.off("resize", fitZoom));

    this.fx = new Effects(this, (id) => this.units.get(id), net.id, (id, text) => this.say(id, text));
    this.cleanup.push(
      net.on("node", (m) => { this.world.setNode(m.id, m.up); if (m.up) this.depletedNodes.delete(m.id); else this.depletedNodes.add(m.id); }),
      net.on("nodes", (m) => { for (const id of m.depleted) { this.depletedNodes.add(id); this.world.setNode(id, false); } }),
    );
    let lastGold = -1;
    this.cleanup.push(net.on("cast", (m) => { this.castHold = m.ms > 0 ? this.time.now + m.ms : 0; }));
    this.cleanup.push(net.on("self", (s) => { if (lastGold >= 0 && s.gold > lastGold) { const u = this.units.get(net.id); if (u) this.fx.goldPop(u.x, u.y - 40, s.gold - lastGold); } lastGold = s.gold; }));
    this.cleanup.push(net.on("fx", (list) => this.fx.play(list)), net.on("loot", (bags) => this.syncBags(bags)));

    // NPC — декоративные, проверки дальности делает сервер
    if (net.kind === "world") {
      this.addNpc("shop", "merchant", this.map.merchant, "Торговка Марфа", "#ffd27a");
      this.addNpc("arena", "arenamaster", ARENA_NPC, "Распорядитель арены", "#ff9a7a");
      this.addNpc("cook", COOK.sprite, COOK, COOK.name, COOK.color, COOK.tint, COOK.id);
      this.addNpc("smith", SMITH.sprite, SMITH, SMITH.name, SMITH.color, SMITH.tint, SMITH.id);
      this.addNpc("bank", BANKER.sprite, BANKER, BANKER.name, BANKER.color, BANKER.tint, BANKER.id);
      this.addNpc("bags", BAGMAN.sprite, BAGMAN, BAGMAN.name, BAGMAN.color, BAGMAN.tint, BAGMAN.id);
      for (const r of RUMOR_NPCS) this.addNpc("rumor", r.sprite, r, r.name, r.color, r.tint, r.id);
      for (const c of CITIES) {
        if (c.style) {
          const m = c.merchant!, k = c.cook!, q = c.quest!;
          this.addNpc("shop", m.sprite, m, m.name, m.color, m.tint, m.id);
          this.addNpc("cook", k.sprite, k, k.name, k.color, k.tint, k.id);
          this.addNpc("quest", q.sprite, q, q.name, q.color, q.tint, q.id);
        }
        // камень телепорта нарисован картой; здесь только невидимая точка нажатия
        const st = this.add.sprite(c.stone.x, c.stone.y - 14, "u_merchant", 0).setVisible(false);
        this.npcs.push({ sprite: st, kind: "stone", id: c.id, name: "Камень телепорта" });
      }
      this.scenes = new Scenes(this, this.map);
      this.setupEncounters();
    } else this.scenes = null;

    if (mouseOpts.chase) net.send("chase", { on: true });
    this.aim = new AimPreview(this);
    this.clickMark = this.add.image(0, 0, "fx_target").setDepth(DEPTH.ground + 7).setVisible(false).setScale(0.6);

    net.watchUnits("players", (id, u) => this.addUnit(id, u), (id) => this.removeUnit(id));
    net.watchUnits("mobs", (id, u) => this.addUnit(id, u), (id) => this.removeUnit(id));

    this.hud.bind({
      net,
      map: this.map,
      pressSlot: (bar, i) => this.pressSlot(bar, i),
      toggleMount: () => this.toggleMount(),
      togglePet: () => this.togglePet(),
      closeTarget: () => this.setTarget(null),
      focusGame: () => this.game.canvas.focus(),
    });

    this.setupInput();
    this.setupAmbient();
  }

  private addNpc(kind: NpcKind, sprite: string, at: { x: number; y: number }, name: string, color: string, tint?: number, id?: string) {
    const tex = this.textures.exists(`u_${sprite}`) ? `u_${sprite}` : "u_merchant";
    const s = this.add.sprite(at.x, at.y, tex, 0).setOrigin(0.5, 30 / 32).setDepth(at.y);
    if (tint) s.setTint(tint);
    const shadow = this.add.image(at.x, at.y - 2, "fx_shadow_blob").setDepth(DEPTH.ground + 5);
    const label = { fontFamily: FONT, fontSize: "9px", fontStyle: "600", color, stroke: "#120a10", strokeThickness: 4, resolution: 4 };
    const nameT = this.add.text(at.x, at.y - 31, name, label).setOrigin(0.5, 1).setDepth(DEPTH.top - 5);
    const mark = this.add.text(at.x, at.y - 40, kind === "enc" ? (at as { icon?: string }).icon ?? "!" : kind === "arena" ? "⚔" : kind === "rumor" ? "…" : kind === "cook" ? "♨" : kind === "smith" ? "⚒" : kind === "bank" ? "$" : kind === "bags" ? "▣" : "!", { ...label, fontSize: "10px", color: "#ffd84a" }).setOrigin(0.5, 1).setDepth(DEPTH.top - 5);
    this.time.addEvent({ delay: 2600 + Math.random() * 800, loop: true, callback: () => s.active && s.setFrame(Math.random() < 0.5 ? 0 : 24) });
    this.npcExtras = [shadow, nameT, mark];
    this.npcs.push({ sprite: s, kind, id, name });
  }

  /** Случайные встречи: NPC видит только его владелец, сервер присылает появление, реплики, уход. */
  private setupEncounters() {
    const find = (id: string) => this.npcs.find((n) => n.kind === "enc" && n.id === id);
    const drop = (n: Npc) => {
      this.npcs = this.npcs.filter((x) => x !== n);
      this.tweens.killTweensOf(n.objs ?? []);
      for (const o of n.objs ?? []) o.destroy();
      n.sprite.destroy();
    };
    this.cleanup.push(
      net.on("enc:npc", (m) => {
        const old = find(m.id);
        if (old) drop(old);
        this.addNpc("enc", m.sprite, m, m.name, m.color, m.tint, m.id);
        const n = this.npcs[this.npcs.length - 1];
        n.sprite.setFlipX(false);
        if (m.lying) n.sprite.setAngle(90).y += 8;
        n.objs = this.npcExtras;
      }),
      net.on("enc:say", (m) => {
        const n = find(m.id);
        if (!n) return;
        const t = this.add.text(n.sprite.x, n.sprite.y - 52, m.text, { fontFamily: FONT, fontSize: "10px", color: "#ffe0b0", stroke: "#200a0a", strokeThickness: 4, resolution: 4, align: "center", wordWrap: { width: 160 } }).setOrigin(0.5, 1).setDepth(DEPTH.top);
        this.time.delayedCall(3500, () => t.destroy());
        this.hud.chatLine({ from: n.name ?? "", text: m.text, sys: false });
      }),
      net.on("enc:move", (m) => {
        const n = find(m.id);
        if (!n) return;
        n.sprite.setAngle(0);
        const dx = m.x - n.sprite.x, dy = m.y - n.sprite.y;
        this.tweens.add({ targets: [n.sprite, ...(n.objs ?? [])], x: `+=${dx}`, y: `+=${dy}`, duration: m.ms });
        this.tweens.add({ targets: n.sprite, alpha: 0, delay: m.ms * 0.7, duration: m.ms * 0.3 });
        n.sprite.setDepth(m.y);
      }),
      net.on("enc:gone", (m) => {
        const n = find(m.id);
        if (n) drop(n);
      }),
    );
  }

  /** Атмосферные частицы по зонам, пыль из-под ног, свет героя в темноте. */
  private setupAmbient() {
    const area = () => new Phaser.Geom.Rectangle(0, 0, 700, 420);
    const mk = (key: string, tex: string, cfg: Phaser.Types.GameObjects.Particles.ParticleEmitterConfig) => {
      const e = this.add.particles(0, 0, tex, { emitZone: { type: "random", source: area() } as any, emitting: false, ...cfg });
      e.setDepth(DEPTH.top - 15);
      this.ambient[key] = e;
    };
    mk("leaves", "fx_leaf", { frequency: 260, lifespan: 6000, speedX: { min: -14, max: 14 }, speedY: { min: 10, max: 22 }, rotate: { start: 0, end: 360 }, alpha: { start: 0.9, end: 0 }, tint: [0x8ac850, 0xd09a34, 0x6aa040] });
    mk("fireflies", "fx_spark", { frequency: 220, lifespan: 4000, speed: { min: 4, max: 14 }, scale: { start: 0.35, end: 0.1 }, alpha: { values: [0, 1, 0.3, 1, 0] } as any, tint: 0xc8ff6a, blendMode: Phaser.BlendModes.ADD });
    mk("embers", "fx_ember", { frequency: 120, lifespan: 3500, speedY: { min: -30, max: -12 }, speedX: { min: -8, max: 8 }, alpha: { start: 1, end: 0 }, scale: { start: 1, end: 0.3 }, blendMode: Phaser.BlendModes.ADD });
    mk("snow", "fx_spark", { frequency: 40, lifespan: 5000, speedX: { min: -20, max: 10 }, speedY: { min: 30, max: 60 }, scale: { min: 0.15, max: 0.35 }, alpha: { start: 0.9, end: 0.2 }, tint: 0xffffff });
    mk("sand", "fx_smoke", { frequency: 90, lifespan: 2600, speedX: { min: 120, max: 220 }, speedY: { min: -10, max: 10 }, scale: { start: 0.35, end: 0.8 }, alpha: { start: 0.18, end: 0 }, tint: 0xe0b878 });
    mk("ash", "fx_smoke", { frequency: 120, lifespan: 5000, speedX: { min: -10, max: 12 }, speedY: { min: 14, max: 30 }, scale: { start: 0.18, end: 0.1 }, alpha: { start: 0.55, end: 0 }, tint: 0x6a6460 });
    mk("fog", "fx_smoke", { frequency: 420, lifespan: 7000, speedX: { min: 6, max: 14 }, scale: { start: 2.2, end: 3.4 }, alpha: { values: [0, 0.14, 0.14, 0] } as any, tint: 0x9ab8a0 });
    mk("bubbles", "fx_bubble", { frequency: 100, lifespan: 4000, speedY: { min: -50, max: -25 }, speedX: { min: -8, max: 8 }, scale: { start: 0.8, end: 1.6 }, alpha: { start: 0.8, end: 0 } });
    mk("pollen", "fx_spark", { frequency: 500, lifespan: 5000, speedX: { min: 4, max: 14 }, speedY: { min: -4, max: 4 }, scale: 0.2, alpha: { start: 0.8, end: 0 }, tint: 0xfff6c0 });
    this.dust = this.add.particles(0, 0, "fx_smoke", { emitting: false, lifespan: 420, speed: { min: 4, max: 12 }, angle: { min: 200, max: 340 }, scale: { start: 0.45, end: 0.1 }, alpha: { start: 0.45, end: 0 }, tint: 0xc8b898 });
    this.dust.setDepth(DEPTH.ground + 4);
    this.selfLight = this.add.image(0, 0, "fx_glow").setBlendMode(Phaser.BlendModes.ADD).setTint(0xffc88a).setScale(5.5).setAlpha(0).setDepth(DEPTH.top - 10);
  }

  private updateAmbient(zone: Zone) {
    const z = zoneStyle(zone);
    const cam = this.cameras.main;
    const v = cam.worldView;
    const want: Record<string, boolean> = {
      leaves: z === Zone.Forest && zone !== Zone.MistWood, fireflies: z === Zone.Swamp, fog: z === Zone.Swamp || GLOOM.has(zone),
      embers: z === Zone.Ashlands || z === Zone.Dungeon || z === Zone.Arena || z === Zone.Volcano, ash: z === Zone.Volcano,
      pollen: (z === Zone.Meadow || z === Zone.Town) && zone !== Zone.UmbrathCity, snow: z === Zone.Snow || z === Zone.SnowCity, sand: z === Zone.Desert || z === Zone.OasisCity, bubbles: false,
    };
    for (const [k, e] of Object.entries(this.ambient)) {
      e.setPosition(v.x - 40, v.y - (k === "leaves" ? 60 : 0));
      (e.emitZones[0] as any)?.source?.setSize?.(v.width + 80, v.height + 40);
      if (want[k] && !e.emitting) e.start();
      else if (!want[k] && e.emitting) e.stop();
    }
    this.selfLight.setPosition(this.pos.x, this.pos.y - 12).setAlpha(this.world.dark.alpha * 0.55);
    // пыль из-под ног идущих
    const now = this.time.now;
    for (const [id, u] of this.units) {
      if (u.dead || u.u.anim !== Anim.Walk || u.frame > 32 && u.u.sprite === "witch") continue;
      if ((this.dustAt.get(id) ?? 0) > now) continue;
      this.dustAt.set(id, now + 260);
      if (z !== Zone.Dungeon) this.dust.emitParticleAt(u.x, u.y);
    }
  }

  // ---------- юниты ----------
  /** Мобы и NPC далеко от героя: только состояние, без спрайтов (создаются при приближении). */
  private farUnits = new Map<string, UnitState>();
  private cullAt = 0;
  private isFar(u: UnitState, r: number) {
    return Math.abs(u.x - this.pos.x) > r || Math.abs(u.y - this.pos.y) > r;
  }
  /** Подгрузка юнитов вокруг героя и выгрузка далёких (как куски карты). */
  private cullUnits() {
    if (!this.me) return;
    for (const [id, u] of this.farUnits) if (!this.isFar(u, UNIT_NEAR)) { this.farUnits.delete(id); this.addUnit(id, u, true); }
    for (const [id, v] of this.units) {
      if (id === net.id || id === this.targetId || v.u.kind === UnitKind.Player || !this.isFar(v.u, UNIT_FAR)) continue;
      v.destroy();
      this.units.delete(id);
      this.farUnits.set(id, v.u);
    }
  }
  addUnit(id: string, u: UnitState, near = false) {
    if (this.units.has(id) || this.farUnits.has(id)) return;
    if (!near && id !== net.id && u.kind !== UnitKind.Player && u.kind !== UnitKind.Pet && (!this.me || this.isFar(u, UNIT_NEAR))) {
      this.farUnits.set(id, u);
      return;
    }
    const v = new UnitView(this, id, u, id === net.id);
    this.units.set(id, v);
    if (id === net.id) {
      this.me = v;
      this.pos = { x: u.x, y: u.y };
      this.cameras.main.startFollow(v.sprite, true, 0.15, 0.15, 0, 12);
    }
  }
  removeUnit(id: string) {
    this.farUnits.delete(id);
    this.units.get(id)?.destroy();
    this.units.delete(id);
    if (this.targetId === id) this.setTarget(null);
  }

  setTarget(id: string | null) {
    if (this.targetId) {
      const old = this.units.get(this.targetId);
      if (old) { old.selected = false; old.ring.clearTint(); }
    }
    this.targetId = id;
    if (id) {
      const v = this.units.get(id);
      if (v) { v.selected = true; v.ring.setTint(this.isEnemy(v) ? 0xff4040 : 0x50e060); }
    }
    net.send("target", { id });
  }

  /** Выбрать врага и начать атаку: подход до дальности и автоатака (сообщение attack). */
  attackTarget(id: string | null = this.targetId) {
    const v = id ? this.units.get(id) : undefined;
    if (!id || !v || v.dead || !this.isEnemy(v)) return this.hud.toast({ text: "Нужна цель: враг", kind: "error" });
    if (this.targetId !== id) this.setTarget(id);
    net.send("attack", { id });
  }

  /** Клик-путь: клиент ведёт героя тем же путём (shared/path.ts), не дожидаясь сервера. */
  startClickPath(x: number, y: number) {
    this.clickNav.reset();
    this.clickGoal = { x, y, at: this.time.now };
  }

  toggleAutorun() {
    if (!this.me || this.me.dead) return;
    if (this.autorun) { this.autorun = null; return; }
    let d = this.me.u.anim === Anim.Walk ? this.lastDir : null;
    if (!d) {
      const ap = this.input.activePointer, c = this.cameras.main.getWorldPoint(ap.x, ap.y);
      const dx = c.x - this.pos.x, dy = c.y - this.pos.y, len = Math.hypot(dx, dy);
      if (len < 12) return;
      d = { dx: dx / len, dy: dy / len };
    }
    this.autorun = { dx: d.dx, dy: d.dy, since: this.time.now };
    this.clickGoal = null;
    this.following = false;
    this.pendingPickup = null;
    this.pendingNpc = null;
  }
  turnAutorun(deg: number) {
    if (!this.autorun) return;
    const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a), { dx, dy } = this.autorun;
    this.autorun.dx = dx * c - dy * s;
    this.autorun.dy = dx * s + dy * c;
    this.autorun.since = this.time.now;
  }

  /** Shift+F: следовать за выбранным игроком; без игрока в цели — прекратить следование. */
  followTarget() {
    const v = this.targetId ? this.units.get(this.targetId) : undefined;
    if (!v || v.u.kind !== UnitKind.Player || v.id === net.id) {
      if (this.following) { this.following = false; return net.send("follow", { id: null }); }
      return this.hud.toast({ text: "Выберите игрока, чтобы следовать", kind: "error" });
    }
    this.followUnit(v.id);
  }
  followUnit(id: string) {
    this.autorun = this.clickGoal = null;
    this.following = true;
    net.send("follow", { id });
  }

  /** F2–F5: член группы по имени среди видимых игроков. */
  selectParty(n: number) {
    const m = net.party?.members?.filter((x) => x.name !== net.self?.name)[n];
    if (!m) return;
    for (const [id, v] of this.units) if (v.u.kind === UnitKind.Player && v.u.name === m.name) return this.setTarget(id);
  }

  // ---------- ввод ----------
  private setupInput() {
    // что делает каждое действие раскладки; какая клавиша какое действие — keybinds.ts. Движение (удержание) ведёт HeldKeys
    const noop = () => {};
    const run: Record<Exclude<ActionId, MoveAction>, () => void> = {
      // слоты панели обрабатывает pressSlot (ниже, в onKeyDown): ссылка слота решает, что это — умение, предмет или действие
      slot1: noop, slot2: noop, slot3: noop, slot4: noop, slot5: noop, slot6: noop, slot7: noop, slot8: noop, slot9: noop, slot10: noop, potionHp: noop, potionMp: noop,
      targetNext: () => this.cycleTarget(1), targetPrev: () => this.cycleTarget(-1), attack: () => this.attackTarget(),
      selectSelf: () => this.setTarget(net.id),
      selectParty1: () => this.selectParty(0), selectParty2: () => this.selectParty(1), selectParty3: () => this.selectParty(2), selectParty4: () => this.selectParty(3),
      interact: () => this.pickupNearest(),
      talk: () => this.talkNearest(),
      mount: () => this.toggleMount(),
      mountNext: () => this.cycleMount(),
      autorun: () => this.toggleAutorun(),
      follow: () => this.followTarget(),
      pet: () => this.togglePet(),
      petNext: () => this.cyclePet(),
      winChar: () => this.hud.toggle("char"),
      winInv: () => this.hud.toggle("inv"),
      winSkills: () => this.hud.toggle("skills"),
      winMap: () => this.hud.toggleWorldMap(),
      winBestiary: () => this.hud.toggle("bestiary"),
      winArena: () => this.hud.toggle("arena"),
      winAdmin: () => this.hud.toggle("admin"),
      chat: () => this.hud.focusChat(),
      escape: () => { if (this.aimState) this.cancelAim(); else this.hud.escape(!!this.targetId, () => this.setTarget(null)); },
    };
    // единственный обработчик клавиатуры; молчит только при вводе текста (ползунки, флажки и кнопки ему не мешают)
    const onKeyDown = (e: KeyboardEvent) => {
      if (this.hud.isTyping() || e.isComposing) return;
      // умолчания браузера, мешающие игре: Tab уводит фокус на кнопки, F1–F5 — справка, поиск, обновление страницы
      if (e.code === "Tab" || (/^F[1-5]$/.test(e.code) && !e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey)) e.preventDefault();
      const bs = keybinds.barSlotFor(e);
      if (bs) { e.preventDefault(); if (!e.repeat) this.pressSlot(bs.bar, bs.i, e.code, e.altKey); return; }
      const acts = keybinds.actionsFor(e);
      if (!acts.length) return;
      e.preventDefault();
      for (const a of acts) {
        if (isMoveAction(a)) {
          // автобег: в «Классике» A и D поворачивают на 45°, S останавливает, W ничего не меняет
          if (this.autorun) {
            if (keybinds.presetId === "classic" && (a === "moveLeft" || a === "moveRight")) { if (!e.repeat) this.turnAutorun(a === "moveLeft" ? -45 : 45); continue; }
            if (a === "moveDown") { this.autorun = null; continue; }
            if (a === "moveUp") continue;
          }
          this.autorun = this.clickGoal = null;
          this.following = false;
          this.held.press(e.code, a);
          this.pendingPickup = null;
          this.pendingNpc = null;
        } else if (!e.repeat) run[a]();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      this.held.release(e.code);
      // «С превью»: клавиша слота отпущена — каст
      const st = this.aimState;
      if (st && st.hold === e.code) { this.aimState = null; this.castNow(SKILLS[st.id], e.altKey); }
    };
    const onBlur = () => { this.held.clear(); this.cancelAim(); };
    const onMouseMove = (e: MouseEvent) => { this.overUi = e.target !== this.game.canvas; };
    // наведение на слот панели с умением: кольцо дальности
    const onOver = (e: MouseEvent) => {
      const el = (e.target as HTMLElement | null)?.closest?.(".hb-slot") as HTMLElement | null;
      const ref = el ? net.self?.bars?.[Number(el.dataset.bar)]?.[Number(el.dataset.i)] : null;
      this.aimHover = ref && "s" in ref ? ref.s : null;
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseover", onOver);
    this.cleanup.push(() => { window.removeEventListener("mousemove", onMouseMove); window.removeEventListener("mouseover", onOver); });
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    this.cleanup.push(() => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    });

    this.input.on("pointermove", (p: Phaser.Input.Pointer) => {
      const id = this.pick(p.worldX, p.worldY);
      if (id !== this.hoverId) {
        if (this.hoverId) { const v = this.units.get(this.hoverId); if (v) v.hovered = false; }
        this.hoverId = id;
        if (id) { const v = this.units.get(id); if (v) v.hovered = true; }
        this.game.canvas.style.cursor = id ? "crosshair" : "default";
      }
    });
    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      if (!this.me || this.me.dead) return;
      (document.activeElement as HTMLElement | null)?.blur?.();
      const wx = p.worldX, wy = p.worldY;
      const right = p.rightButtonDown();
      // прицел: ПКМ отменяет, ЛКМ в режиме «С подтверждением» кастует; при зажатой клавише клики не двигают героя
      if (this.aimState) {
        const st = this.aimState;
        if (right) this.cancelAim();
        else if (!st.hold) { this.aimState = null; this.castNow(SKILLS[st.id], (p.event as MouseEvent).altKey); }
        return;
      }
      const classic = keybinds.presetId === "classic";
      // в «Экшене» взаимодействуют только ПКМ; в «Классике» обе кнопки
      const act = right || classic;
      // мешок с добычей
      for (const [bid, img] of this.bagViews) {
        if (act && Math.hypot(img.x - wx, img.y - 10 - wy) < 16) {
          this.pendingPickup = bid;
          if (Math.hypot(img.x - this.pos.x, img.y - this.pos.y) > PICKUP_RANGE - 8) net.send("moveTo", { x: img.x, y: img.y });
          return;
        }
      }
      // узлы добычи (кактус, кристалл, обсидиан, жемчуг)
      for (const n of this.map.nodes) {
        if (!act || this.depletedNodes.has(n.id) || Math.hypot(n.x - wx, n.y - 16 - wy) > 24) continue;
        this.pendingGather = n.id;
        if (Math.hypot(n.x - this.pos.x, n.y - 14 - this.pos.y) > ENV.gatherRange - 12) net.send("moveTo", { x: n.x, y: n.y + 26 });
        return;
      }
      // NPC
      if (act) for (const n of this.npcs) if (Math.hypot(n.sprite.x - wx, n.sprite.y - 14 - wy) < 18) return this.talk(n);
      // правый клик по другому игроку — меню обмена
      if (right && net.kind === "world") {
        for (const [uid, v] of this.units) {
          if (uid === net.id || v.u.kind !== UnitKind.Player || this.isEnemy(v) || v.unseen || v.hitTest(wx, wy) > 20) continue;
          const ev = p.event as MouseEvent;
          return this.hud.trade.showMenu(uid, v.u.name, ev.clientX, ev.clientY, () => this.hud.inspect.open(uid), () => this.followUnit(uid));
        }
      }
      // враг: ЛКМ выбирает (атакует только при опции «ЛКМ атакует»), ПКМ атакует; союзник: выбор
      const foe = this.pick(wx, wy);
      if (foe) return right || mouseOpts.lmbAttacks ? this.attackTarget(foe) : this.setTarget(foe);
      const friend = this.pickFriend(wx, wy);
      if (friend) return this.setTarget(friend);
      // земля: цель не снимается; ЛКМ ведёт героя только в «Классике»
      if (!right && !classic) return;
      this.pendingPickup = null;
      this.pendingNpc = null;
      this.pendingGather = null;
      this.autorun = null;
      this.following = false;
      net.send("moveTo", { x: wx, y: wy });
      this.startClickPath(wx, wy);
      this.mouseHold = { right, since: this.time.now };
      this.clickMark.setPosition(wx, wy).setVisible(true).setAlpha(1).setScale(0.9);
      this.tweens.add({ targets: this.clickMark, alpha: 0, scale: 0.4, duration: 500 });
    });
  }

  /** Враг ли юнит: мобы всегда; игроки — на арене из другой команды, в мире — противоположная фракция в спорной зоне или нейтральном городе (как World.hostile). */
  isEnemy(v: UnitView): boolean {
    if (v.u.kind === UnitKind.Pet || v.npc) return false;
    if (v.u.kind !== UnitKind.Player) return true;
    if (v.u.buffs & BUFF_STEALTH) return false;
    if (net.kind === "arena") return v.u.team !== 0 && v.u.team !== net.arena?.team;
    const me = net.self;
    return !!me && v.id !== net.id && factionsHostile(this.map, me.faction, this.pos.x, this.pos.y, v.u.faction, v.u.x, v.u.y);
  }

  /** Ближайший к курсору живой враг. */
  pick(wx: number, wy: number): string | null {
    let best: string | null = null, bd = Infinity;
    for (const [id, v] of this.units) {
      if (!this.isEnemy(v)) continue;
      const d = v.hitTest(wx, wy);
      if (d < bd) { bd = d; best = id; }
    }
    return best;
  }

  /** Союзник под курсором (для лекаря): игроки, включая себя и павших, и питомцы. */
  pickFriend(wx: number, wy: number): string | null {
    let best: string | null = null, bd = 22;
    for (const [id, v] of this.units) {
      if (this.isEnemy(v) || (v.u.kind !== UnitKind.Player && v.u.kind !== UnitKind.Pet)) continue;
      const d = v.hitTest(wx, wy);
      if (d < bd) { bd = d; best = id; }
    }
    return best;
  }

  private tabList: string[] = [];
  private tabAt = 0;
  /** Tab / Shift+Tab: враги в радиусе с прямой видимостью, сначала те, у кого цель — я, затем ближние; список замораживается на 2 с. */
  cycleTarget(dir = 1) {
    const now = performance.now();
    if (now - this.tabAt > 2000 || !this.tabList.length) {
      const dist = (v: UnitView) => Math.hypot(v.x - this.pos.x, v.y - this.pos.y);
      const onMe = (v: UnitView) => (v.u as { target?: string }).target === net.id ? 0 : 1;
      this.tabList = [...this.units.entries()]
        .filter(([, v]) => this.isEnemy(v) && !v.dead && dist(v) < (net.kind === "arena" ? 1400 : 420) && lineClear(this.map, this.pos.x, this.pos.y, v.x, v.y))
        .sort((a, b) => onMe(a[1]) - onMe(b[1]) || dist(a[1]) - dist(b[1]))
        .map(([id]) => id);
    }
    this.tabAt = now;
    const list = this.tabList.filter((id) => { const v = this.units.get(id); return v && !v.dead; });
    if (!list.length) return;
    const i = list.indexOf(this.targetId ?? "");
    this.setTarget(list[i < 0 ? (dir > 0 ? 0 : list.length - 1) : (i + dir + list.length) % list.length]);
  }

  toggleMount() {
    if (!this.me || this.me.dead) return;
    net.send("mount:toggle");
  }

  togglePet() {
    if (!this.me || this.me.dead) return;
    net.send("pet:toggle");
  }

  /** Shift+G: выбрать следующего из своих питомцев. */
  cyclePet() {
    const own = Object.keys(net.self?.pets ?? {});
    if (own.length < 2) return;
    const next = own[(own.indexOf(net.self?.pet ?? "") + 1) % own.length];
    net.send("pet:select", { id: next });
    this.hud.toast({ text: `Питомец: ${PETS[next]?.name ?? next}`, kind: "info" });
  }

  /** Shift+X: выбрать следующий из своих маунтов. */
  cycleMount() {
    const own = net.self?.mounts ?? [];
    if (own.length < 2) return;
    const next = own[(own.indexOf(net.self?.mount ?? "") + 1) % own.length];
    net.send("mount:select", { id: next });
    this.hud.toast({ text: `Маунт: ${MOUNTS[next]?.name ?? next}`, kind: "info" });
  }

  /** Нажатие слота панели (клавиша или клик): умение, предмет (по base) или действие. */
  pressSlot(bar: number, i: number, code: string | null = null, alt = false) {
    const ref = net.self?.bars?.[bar]?.[i];
    if (!ref) return;
    this.hud.flashSlot(bar, i);
    if ("s" in ref) this.useSkillId(ref.s, code, alt);
    else if ("i" in ref) { if (net.self && !this.me?.dead) net.send("use:base", { base: ref.i }); }
    else if (ref.a === "mount") this.toggleMount();
    else if (ref.a === "pet") this.togglePet();
    else if (ref.a === "attack") this.attackTarget();
    else this.pickupNearest();
  }

  private aimState: { id: string; hold: string | null } | null = null;
  private aimHover: string | null = null;
  private overUi = false;
  private aim!: AimPreview;

  /** Умение с панели: по режиму прицела — сразу, с прицелом до отпускания клавиши (hold) или до ЛКМ. */
  useSkillId(id: string, hold: string | null = null, alt = false) {
    const self = net.self;
    if (!self || !this.me || this.me.dead) return;
    const def = SKILLS[id];
    if (!def || def.cls !== self.cls || def.kind !== "active") return;
    if (!self.skills[def.id]) return this.hud.toast({ text: `«${def.name}» ещё не изучено (K — умения)`, kind: "error" });
    this.aimState = null;
    const mode = mouseOpts.aimMode;
    if (mode === "quick" || (def.aim === "self" && mode === "confirm")) return this.castNow(def, alt);
    // «С превью»: клавиша зажата — прицел, каст при отпускании; клик по слоту — сразу
    if (mode === "preview" && !hold) return this.castNow(def, alt);
    this.aimState = { id, hold: mode === "preview" ? hold : null };
  }

  cancelAim() { this.aimState = null; this.aim?.clear(); }

  private castUnit(id: string | null): CastUnit | null {
    const v = id ? this.units.get(id) : undefined;
    if (!v) return null;
    const enemy = this.isEnemy(v);
    return { id: v.id, x: v.x, y: v.y, enemy, friend: !enemy && (v.u.kind === UnitKind.Player || v.u.kind === UnitKind.Pet), dead: v.dead };
  }

  /** Вход для resolveCast: курсор (последнее положение над картой), юнит под ним, цель, «вперёд». */
  private castInput(def: SkillDef, alt: boolean) {
    const ap = this.input.activePointer, cur = this.cameras.main.getWorldPoint(ap.x, ap.y);
    const hoverId = this.overUi ? null : def.target === "ally" ? this.pickFriend(cur.x, cur.y) : this.pick(cur.x, cur.y);
    const d = this.me?.u.dir;
    const facing = d === Dir.Left ? { x: -1, y: 0 } : d === Dir.Right ? { x: 1, y: 0 } : d === Dir.Up ? { x: 0, y: -1 } : { x: 0, y: 1 };
    return {
      skill: { aim: def.aim ?? "self", target: def.target, range: def.range },
      self: { id: net.id, x: this.pos.x, y: this.pos.y },
      cursor: { x: cur.x, y: cur.y }, overUi: this.overUi,
      hover: this.castUnit(hoverId), selected: this.castUnit(this.targetId),
      units: [...this.units.keys()].map((k) => this.castUnit(k)).filter((x): x is CastUnit => !!x),
      facing, alt, hoverCast: mouseOpts.hoverCast, autoTarget: mouseOpts.autoTarget,
    };
  }

  castNow(def: SkillDef | undefined, alt = false) {
    if (!def || !this.me || this.me.dead) return;
    const plan = resolveCast(this.castInput(def, alt));
    if (!plan.ok) return this.hud.toast({ text: plan.err, kind: "error" });
    net.send("skill", { id: def.id, x: plan.x, y: plan.y, target: plan.target });
  }

  /** Каждый кадр: превью по состоянию прицела или наведению на слот. */
  private updateAim() {
    const def = SKILLS[this.aimState?.id ?? this.aimHover ?? ""];
    if (!def || !this.me || this.me.dead) return this.aim.clear();
    const plan = resolveCast(this.castInput(def, false));
    this.aim.draw(def, this.pos, plan, !this.aimState || def.aim === "unit");
  }

  pickupNearest() {
    let best: string | null = null, bd = PICKUP_RANGE + 40;
    for (const [id, img] of this.bagViews) {
      const d = Math.hypot(img.x - this.pos.x, img.y - this.pos.y);
      if (d < bd) { bd = d; best = id; }
    }
    if (best) {
      this.pendingPickup = best;
      const img = this.bagViews.get(best)!;
      if (bd > PICKUP_RANGE - 8) net.send("moveTo", { x: img.x, y: img.y });
    } else this.talkNearest();
  }

  talkNearest() {
    const n = this.npcs.find((x) => Math.hypot(x.sprite.x - this.pos.x, x.sprite.y - this.pos.y) < MERCHANT_RANGE);
    if (n) this.talk(n);
  }

  /** Подойти к NPC и открыть его окно. */
  talk(n: Npc) {
    const d = Math.hypot(n.sprite.x - this.pos.x, n.sprite.y - this.pos.y);
    if (d < MERCHANT_RANGE - 10) {
      this.pendingNpc = null;
      this.openNpc(n);
    } else {
      this.pendingNpc = n;
      net.send("moveTo", { x: n.sprite.x, y: n.sprite.y + 26 });
    }
  }
  private openNpc(n: Npc) {
    if (n.kind === "shop") this.hud.openShop();
    else if (n.kind === "cook") this.hud.cook.open(n.id);
    else if (n.kind === "smith") this.hud.smith.open();
    else if (n.kind === "bank") this.hud.bank.open();
    else if (n.kind === "bags") this.hud.bags.open();
    else if (n.kind === "quest") this.hud.quest.open(n.id!);
    else if (n.kind === "stone") this.hud.tp.open(this.pos);
    else if (n.kind === "rumor") this.hud.rumor.open(n.id!, n.name!);
    else if (n.kind === "enc") this.hud.enc.open(n.id!);
    else this.hud.arena.open();
  }

  syncBags(bags: LootBag[]) {
    const ids = new Set(bags.map((b) => b.id));
    for (const [id, img] of this.bagViews) if (!ids.has(id)) { img.destroy(); this.bagViews.delete(id); }
    for (const b of bags) {
      if (this.bagViews.has(b.id)) continue;
      const img = this.add.image(b.x, b.y, b.boss ? "o_bag_boss" : "o_bag").setOrigin(0.5, 1).setDepth(b.y - 1);
      img.y -= 30;
      this.tweens.add({ targets: img, y: b.y, duration: 380, ease: "Bounce.easeOut" });
      const best = Math.max(...b.items.map((it) => it.rarity));
      if (best > 0) {
        const glow = this.add.image(b.x, b.y - 8, "fx_glow").setBlendMode(Phaser.BlendModes.ADD).setTint(best >= 3 ? 0xff9a2e : best >= 2 ? 0xc47bff : 0x5fa8ff).setScale(0.9).setDepth(b.y - 2);
        this.tweens.add({ targets: glow, alpha: { from: 0.7, to: 0.25 }, duration: 700, yoyo: true, repeat: -1 });
        img.once("destroy", () => glow.destroy());
      }
      this.bagViews.set(b.id, img);
    }
  }

  say(id: string, text: string) {
    const v = this.units.get(id);
    if (!v) return;
    const t = this.add.text(v.x, v.y - 70, text, { fontFamily: FONT, fontSize: "10px", color: "#ffe0b0", stroke: "#200a0a", strokeThickness: 4, resolution: 4, align: "center", wordWrap: { width: 160 } }).setOrigin(0.5, 1).setDepth(DEPTH.top);
    this.bubbles.push({ t, id, until: this.time.now + 3500 });
    this.hud.chatLine({ from: v.u.name, text, sys: false });
  }

  // ---------- кадр ----------
  override update(_time: number, deltaMs: number) {
    const dt = Math.min(0.05, deltaMs / 1000);
    this.updateAim();
    this.world.update(this.cameras.main);
    this.world.drift.x += dt * 6;
    this.world.drift.y += dt * 3;

    // движение своего героя: предсказание + мягкая сверка с сервером
    const me = this.me;
    const now = this.time.now;
    let mx = 0, my = 0;
    const alive = !!me && !me.dead && !this.hud.isTyping();
    if (alive) ({ mx, my } = this.held.axis());
    if (alive && this.mouseHold) {
      // удержание кнопки на земле дольше 200 мс: вектор к курсору, мёртвая зона 12 px
      const h = this.mouseHold, ap = this.input.activePointer;
      if (mx || my || !(h.right ? ap.rightButtonDown() : ap.leftButtonDown())) this.mouseHold = null;
      else if (now - h.since >= 200) {
        this.clickGoal = null;
        this.autorun = null;
        this.pendingPickup = this.pendingNpc = null;
        const c = this.cameras.main.getWorldPoint(ap.x, ap.y), dx = c.x - this.pos.x, dy = c.y - this.pos.y, len = Math.hypot(dx, dy);
        if (len >= 12) { mx = dx / len; my = dy / len; }
      }
    } else if (!alive) this.mouseHold = null;
    if (alive && this.autorun && !mx && !my) {
      if (now - this.autorun.since > 700 && me!.u.anim !== Anim.Walk) this.autorun = null;
      else { mx = this.autorun.dx; my = this.autorun.dy; }
    }
    if (!alive) this.autorun = this.clickGoal = null;
    const li = this.lastInput;
    const moving = !!(mx || my), wasMoving = !!(li.mx || li.my);
    const changed = moving && wasMoving ? Math.hypot(mx - li.mx, my - li.my) > 0.06 && now - li.at > 50 : mx !== li.mx || my !== li.my;
    if (changed || (moving && now - li.at > 250)) {
      net.send("input", { mx, my });
      this.lastInput = { mx, my, at: now };
    }
    if (me) {
      const u = me.u;
      // сервер держит героя: оглушение, корни, канал (castHold), заморозка арены до боя
      const arenaPhase = net.kind === "arena" ? (net.room?.state as { phase?: string } | undefined)?.phase : "fight";
      const blocked = u.buffs & (BUFF_STUN | BUFF_ROOT) || u.anim === Anim.Dead || now < this.castHold || arenaPhase !== "fight";
      const g = this.clickGoal;
      if (g && (blocked || moving || (now - g.at > 600 && u.anim !== Anim.Walk))) this.clickGoal = null;
      let vx = 0, vy = 0;
      const sp = PLAYER_SPEED * (MOUNTS[u.mount]?.speed ?? 1) * (u.buffs & BUFF_SLOW ? 0.55 : 1) * terrainSpeedMul(this.map, this.pos.x, this.pos.y) * dt;
      let step = sp;
      if (moving && !blocked) {
        const len = Math.hypot(mx, my);
        vx = mx / len; vy = my / len;
      } else if (this.clickGoal && !blocked) {
        const goal = this.clickGoal;
        if (Math.hypot(goal.x - this.pos.x, goal.y - this.pos.y) <= 2.5) this.clickGoal = null;
        else {
          const wp = this.clickNav.next(this.map, this.pos.x, this.pos.y, goal.x, goal.y, PLAYER_RADIUS, now);
          if (!wp) this.clickGoal = null;
          else {
            const dx = wp.x - this.pos.x, dy = wp.y - this.pos.y, d = Math.hypot(dx, dy) || 1;
            step = Math.min(sp, wp.x === goal.x && wp.y === goal.y ? d - 2 : d);
            vx = dx / d; vy = dy / d;
          }
        }
      }
      if ((vx || vy) && step > 0) {
        this.lastDir = { dx: vx, dy: vy };
        const n = moveWithCollision(this.map, this.pos.x, this.pos.y, vx * step, vy * step, PLAYER_RADIUS);
        this.pos.x = n.x;
        this.pos.y = n.y;
        const err = Math.hypot(u.x - this.pos.x, u.y - this.pos.y);
        const k = err > 64 ? 1 : err > 24 ? 0.15 : 0.03;
        this.pos.x += (u.x - this.pos.x) * k;
        this.pos.y += (u.y - this.pos.y) * k;
      } else {
        const err = Math.hypot(u.x - this.pos.x, u.y - this.pos.y);
        const k = err > 96 ? 1 : Math.min(1, dt * 14);
        this.pos.x += (u.x - this.pos.x) * k;
        this.pos.y += (u.y - this.pos.y) * k;
      }
      me.update(dt, this.pos.x, this.pos.y);
    }
    if (now >= this.cullAt) { this.cullAt = now + 400; this.cullUnits(); }
    for (const [id, v] of this.units) {
      if (id !== net.id) v.update(dt);
      // шаги и звон доспехов идущей стражи рядом (до ~20 тайлов, громкость по расстоянию)
      if (v.u.kind === UnitKind.Guard && v.u.anim === Anim.Walk && !v.dead && now >= v.stepAt) {
        const k = 1 - Math.hypot(v.x - this.pos.x, v.y - this.pos.y) / 640;
        v.stepAt = now + 330 + Math.random() * 60;
        if (k > 0.03) { sfx.play("step", k * 0.8); if (Math.random() < 0.28) sfx.play("clink", k * 0.7); }
      }
    }
    this.scenes?.update(this.pos.x, this.pos.y);
    if (this.targetId && !this.units.get(this.targetId)) this.targetId = null;

    // отложенные действия по прибытии
    if (this.pendingPickup) {
      const img = this.bagViews.get(this.pendingPickup);
      if (!img) this.pendingPickup = null;
      else if (Math.hypot(img.x - this.pos.x, img.y - this.pos.y) < PICKUP_RANGE - 4) {
        net.send("pickup", { bag: this.pendingPickup });
        this.pendingPickup = null;
      }
    }
    if (this.pendingGather !== null) {
      const n = this.map.nodes.find((q) => q.id === this.pendingGather);
      if (!n || this.depletedNodes.has(n.id)) this.pendingGather = null;
      else if (Math.hypot(n.x - this.pos.x, n.y - 14 - this.pos.y) < ENV.gatherRange - 12) {
        this.pendingGather = null;
        net.send("gather", { id: n.id });
      }
    }
    if (this.pendingNpc) {
      const n = this.pendingNpc;
      if (Math.hypot(n.sprite.x - this.pos.x, n.sprite.y - this.pos.y) < MERCHANT_RANGE - 10) {
        this.pendingNpc = null;
        this.openNpc(n);
      }
    }

    // реплики
    this.bubbles = this.bubbles.filter((b) => {
      const v = this.units.get(b.id);
      if (!v || now > b.until) { b.t.destroy(); return false; }
      b.t.setPosition(v.x, v.y - (v.frame > 32 ? 76 : 44));
      return true;
    });

    // зона: название, затемнение
    const z = zoneAtPx(this.map, this.pos.x, this.pos.y);
    if (z !== this.zone) {
      this.zone = z;
      if (z === Zone.Arena) this.hud.showZone(`Арена · ${MODE_NAMES[net.arena?.mode ?? "1v1"]}`, "Победит тот, кто устоит");
      else {
        // фракции: спорная зона (PvP с противоположной фракцией) и нейтральный город (бой запрещён)
        const place = net.kind === "world" ? pvpPlace(this.map, this.pos.x, this.pos.y) : "peace";
        const base = ZONES[z].note ?? (ZONES[z].safe ? "Безопасная зона" : `Уровни ${ZONES[z].levels[0]}–${ZONES[z].levels[1]}`);
        const cap = z === Zone.SolgardCity ? "solgard" : z === Zone.UmbrathCity ? "umbrath" : null;
        const sub = cap ? (net.self?.faction === cap ? "Столица вашей фракции" : "Вражеская столица: стража атакует чужаков")
          : place === "pvp" ? `${base} · спорная зона: PvP фракций` : place === "neutral" ? "Нейтральный город: бой фракций запрещён" : base;
        this.hud.showZone(ZONES[z].name, sub, place === "pvp" ? "#ff7a5a" : ZONE_COLOR[z] ?? ZONE_COLOR[zoneStyle(z)]);
      }
    }
    const cam = this.cameras.main;
    const tint = zoneTint(z);
    // ночь (общий цикл по часам): затемнение и синева на поверхности, не в подземельях/арене/под водой
    const zs = zoneStyle(z);
    const night = z === Zone.Dungeon || z === Zone.Arena || zs === Zone.Volcano ? 0 : nightLevel(Date.now());
    const target = Math.max(tint.dark, night * 0.5);
    const dark = this.world.dark;
    const nc = Phaser.Display.Color.Interpolate.ColorWithColor(Phaser.Display.Color.IntegerToColor(tint.color), Phaser.Display.Color.IntegerToColor(0x060a28), 100, Math.round(night * 100));
    dark.setFillStyle(Phaser.Display.Color.GetColor(nc.r, nc.g, nc.b), 1);
    sfx.setAmbience(AMBIENCE[z] ?? AMBIENCE[zs] ?? null);
    dark.setSize(cam.width / cam.zoom + 4, cam.height / cam.zoom + 4).setPosition(-2, -2);
    dark.setAlpha(dark.alpha + (target - dark.alpha) * Math.min(1, dt * 2));
    dark.setDisplayOrigin(0, 0);
    dark.setScrollFactor(0);
    dark.x = (cam.width - cam.width / cam.zoom) / 2 - 2;
    dark.y = (cam.height - cam.height / cam.zoom) / 2 - 2;

    this.updateAmbient(z);
    this.hud.frame({
      me: me?.u ?? null,
      target: this.targetId ? (this.units.get(this.targetId)?.u ?? null) : null,
      targetId: this.targetId,
      pos: this.pos,
      units: this.units,
    });
  }
}

export { SKILLS };
