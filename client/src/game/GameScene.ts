import { layoutLabels } from "./labelLayout";
import { bindPreviewScene } from "./gearPreview";
import { PickBest } from "./hit";
import Phaser from "phaser";
import { MERCHANT_RANGE, PICKUP_RANGE, PLAYER_RADIUS, PLAYER_SPEED, STATUE_RANGE, TALK_RANGE, TILE } from "../../../shared/constants";
import { Nav } from "../../../shared/path";
import { generateMap, lineClear, moveWithCollision, terrainSpeedMul, zoneAtPx, zoneDanger, zoneStyle, ZONES, type WorldMap, Zone } from "../../../shared/map";
import { ENV, RESOURCES } from "../../../shared/biomes";
import * as sfx from "./sfx";
import { nightLevel, warmLevel } from "../../../shared/daynight";
import { Anim, Dir, BUFF_STEALTH, BUFF_ROOT, BUFF_SLOW, BUFF_STUN, BUFF_FEAR, UnitKind, type LootBag } from "../../../shared/protocol";
import { slowMul } from "../../../shared/cc";
import { SKILLS, skillMana, type SkillDef } from "../../../shared/skills";
import { CITIES, inEmberWalls } from "../../../shared/cities";
import { WORLD_NPCS, type WorldNpcKind } from "../../../shared/npcs";
import { ARENA_BLOCKED_TEXT, arenaBlocked, generateArenaMap, MODE_NAMES } from "../../../shared/arena";
import { MOUNTS } from "../../../shared/mounts";
import { generateRaidMap } from "../../../shared/raid";
import { DUNGEON_EXIT, DUNGEON_EXIT_LABEL, DUNGEON_GATES, generateDungeonMap } from "../../../shared/dungeon";
import { CELL_BLOCK, DUNGEON_DOOR } from "../../../shared/map";
import { fmtLeft } from "../../../shared/dungeon";
import { net, type UnitState } from "../net";
import { PETS } from "../../../shared/pets";
import { CLASSES } from "../../../shared/classes";
import { factionsHostile, landLabel, pvpPlace, soldierHostile, zoneLand } from "../../../shared/factions";
import type { Hud } from "../ui/hud";
import { Effects } from "./effects";
import { Scenes } from "./scenes";
import { buildWorld, DEPTH, dgGateOpen, zoneTint, type WorldView } from "./terrain";
import { shaderEnv } from "./waterLava";
import { setLightMode } from "./shadows";
import { NightMask, updateLights } from "./lights";
import { PostFx, glowOn, shineOn } from "./postfx";
import { overlay } from "./overlay";
import { CollisionGrid } from "./collisionDebug";
import { updateTreeFade, updateBuildingFade } from "./treeFade";
import { Weather } from "./weather";
import lighting from "../../../data/lighting.json";
import { RING_ALLY, RING_FOE, UnitView } from "./UnitView";
import { capBand, HALO, placeText, syncTextRes, worldText } from "./worldText";
import { NPC_ICON_SIZE, NPC_ICON_TEX, npcIconFrame } from "./npcIcons";
import { ArenaIntroFx } from "./arenaIntro";
import { ArenaCrowd } from "./arenaCrowd";
import { WowHost } from "./fx/host";
import { HoverGlow, type GlowSrc } from "./hoverGlow";
import { goDist, texDist } from "./objPick";
import { preloadCursors, setCursor, type CursorKind } from "./cursor";
import { HeldKeys, isMoveAction, keybinds, mouseOpts, type ActionId, type MoveAction } from "./keybinds";
import { AimPreview } from "./aim";
import { aimUnit, castAim, hitUnitsOf, PICK_NEAR, pickOrder, pickReach, resolveCast, selTarget, tabOrder, TrapWatch, unitRadius, type CastPlan, type CastUnit, type HitView, type PickCtx, type PickOut, type PickSource } from "./castResolve";
import { aimSpec, type HitUnit } from "../../../shared/skillShape";
import { loading } from "../ui/loading";
import { removeLoot, spawnLoot } from "./lootView";
import { chestReveal } from "../ui/lootfx";
import { DOOR_RANGE, INTERIORS, interiorAt, type Interior } from "../../../shared/interiors";
import { InteriorViews } from "./interiors";
import { TowerArchers } from "./towerArchers";
import { FortScenes } from "./fortScenes";
import { Bubble, setBubbleObstacles, type LabelRect } from "./bubble";
import { BannerBases } from "./bannerBases";
import { SiegeView } from "./siegeView";
import { moveGated } from "../../../shared/siege";
import { STATUES, type StatueKey } from "../ui/statue";
import { T } from "../../../shared/texts";
import { objHas, objTex } from "./objTex";

/** Дистанция, на которой цель сбрасывается (≈ 25 тайлов — дальше края экрана на любом зуме). */
const TARGET_DROP_PX = 800;
type NpcKind = WorldNpcKind | "enc" | "stone" | "door" | "statue" | "dgdoor" | "dgexit";
/** hit — точка и радиус нажатия, если предмет крупный (статуя): по умолчанию 18 px вокруг (x, y − 14). */
type Npc = { sprite: Phaser.GameObjects.Sprite; kind: NpcKind; id?: string; name?: string; objs?: Phaser.GameObjects.GameObject[]; hit?: { dy: number; r: number }; glow?: Omit<GlowSrc, "depth"> };

/** Звуковой фон: по зоне, иначе по её биому (новые зоны звучат как биом, которым нарисованы). */
const AMBIENCE: Partial<Record<Zone, string>> = {
  [Zone.Town]: "town", [Zone.FortSolgard]: "town", [Zone.FortUmbrath]: "dungeon", [Zone.Meadow]: "meadow", [Zone.Forest]: "forest", [Zone.Swamp]: "swamp", [Zone.Ashlands]: "ash", [Zone.Dungeon]: "dungeon", [Zone.Arena]: "ash",
  [Zone.Desert]: "desert", [Zone.Snow]: "snow", [Zone.Volcano]: "volcano", [Zone.Coast]: "water", [Zone.Frontier]: "meadow",
  [Zone.SolgardCity]: "town", [Zone.UmbrathCity]: "dungeon",
};
const ZONE_COLOR: Partial<Record<Zone, string>> = {
  [Zone.FortSolgard]: "#ffe27a", [Zone.FortUmbrath]: "#c890ff", [Zone.Desert]: "#f0c070", [Zone.Snow]: "#bfe4ff", [Zone.Volcano]: "#ff8a4a", [Zone.Coast]: "#7ad0ff", [Zone.Swamp]: "#a8d890", [Zone.Forest]: "#a8e080",
  [Zone.SolgardCity]: "#ffe27a", [Zone.SunFields]: "#ffe8a0", [Zone.KingsWood]: "#c8f0a0", [Zone.GryphonCliffs]: "#d8ecff", [Zone.FallenBarrens]: "#f0d090",
  [Zone.UmbrathCity]: "#c890ff", [Zone.Barrows]: "#b8a0e0", [Zone.MistWood]: "#a8c0b0", [Zone.BoneRidge]: "#d8d0c0", [Zone.PlagueMarsh]: "#a0e070",
  [Zone.StormPeaks]: "#a8d0ff", [Zone.AshFoothills]: "#e0a080", [Zone.Fields]: "#ff6a5a",
};
/** Зоны Умбрата: туман и пурпурная дымка. */
const GLOOM = new Set<Zone>([Zone.UmbrathCity, Zone.FortUmbrath, Zone.Barrows, Zone.MistWood, Zone.PlagueMarsh, Zone.BoneRidge]);
/** Юниты дальше этого (px) не создаются на клиенте (мобы и NPC; герои — всегда). */
const UNIT_NEAR = 1500, UNIT_FAR = 1900;

/**
 * Холст и целый масштаб камеры для масштаба z (пикселей CSS на пиксель мира). Возвращает масштаб камеры.
 * Пиксель-арт ровный, только если пиксель мира — целое число пикселей холста, а холст выходит на экран 1:1, в целое число раз
 * или уменьшается сглаженно. Раньше холст был в пикселях CSS и браузер растягивал его до экрана с image-rendering: pixelated:
 * при масштабе экрана 1,25 удваивался каждый 4-й столбец и строка, при масштабе колесом 2,25–2,75 тексели были по 2 и 3 пикселя.
 * Сетка «толстых» столбцов стоит на экране, мир едет сквозь неё — при беге по экрану бегут полосы.
 * Теперь камера с целым масштабом n ≈ z·dpr (с запасом вверх: ⌈z·dpr⌉, если холст выходит не больше чем в 1,34 раза крупнее экрана),
 * холст в n/z раз больше окна в пикселях CSS, и браузер выводит его 1:1 или масштабирует сглаженно. Размер мира на экране прежний —
 * z пикселей CSS на пиксель мира. При целых z и dpr (масштаб 2 или 3 на обычном экране) холст, как и раньше, в пикселях CSS:
 * браузер растягивает его в целое число раз без сглаживания.
 */
function fitCanvas(game: Phaser.Game, z: number): number {
  const dpr = window.devicePixelRatio || 1;
  const d = z * dpr, up = Math.ceil(d - 1e-3);
  const n = Number.isInteger(z) && Number.isInteger(dpr) ? z : up / d <= 1.34 ? up : Math.max(1, Math.floor(d + 1e-3));
  const k = n / z; // пикселей холста на пиксель CSS
  const w = window.innerWidth, h = window.innerHeight; // #game — на всё окно
  const sm = game.scale;
  const bw = Math.round(w * k), bh = Math.round(h * k);
  if (sm.width !== bw || sm.height !== bh) sm.resize(bw, bh);
  const st = game.canvas.style;
  st.width = `${w}px`;
  st.height = `${h}px`;
  // 1:1 и целое увеличение — без сглаживания (чёткие пиксели); дробное — только сглаженно, иначе вернутся повторы столбцов
  const s = dpr / k;
  st.imageRendering = Math.abs(s - Math.round(s)) < 1e-3 ? "pixelated" : "auto";
  sm.refresh(); // рамка холста для пересчёта координат мыши
  return n;
}

/** «С превью»: через сколько мс удержания клавиши умения показывается прицел (короче — каст без вспышки превью). */
const HOLD_PREVIEW_MS = 180;
/** Камера с упреждением: сколько секунд держать направление после последнего шага героя. */
const CAM_LEAD_HOLD = 0.35;

export class GameScene extends Phaser.Scene {
  map!: WorldMap;
  world!: WorldView;
  hud!: Hud;
  fx!: Effects;
  units = new Map<string, UnitView>();
  me: UnitView | null = null;
  /** Кадров с момента, как свой герой на месте (экран загрузки уходит на третьем). */
  private readyFrames = 0;
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
  private layoutAt = 0;
  /** Масштаб камеры, под который сделаны текстуры мировых текстов (разрешение текста = zoom). */
  private textZoom = 0;
  bagViews = new Map<string, Phaser.GameObjects.Image>();
  private lastBags: LootBag[] = [];
  pendingPickup: string | null = null;
  /** NPC города (только в мире): торговка и распорядитель арены. */
  npcs: Npc[] = [];
  pendingNpc: Npc | null = null;
  /** Узлы добычи: исчерпанные и узел, к которому идём. */
  depletedNodes = new Set<number>();
  pendingGather: number | null = null;
  private npcExtras: Phaser.GameObjects.GameObject[] = [];
  private cleanup: (() => void)[] = [];
  /** Имена NPC-служб (имя + роль) — рамки для разводки реплик. */
  private npcLabels: { name: Phaser.GameObjects.Text; role?: Phaser.GameObjects.Text }[] = [];
  bubbles: { b: Bubble; id: string; until: number }[] = [];
  zone: Zone = Zone.Town;
  clickMark!: Phaser.GameObjects.Image;
  hoverId: string | null = null;
  /** Масштаб в пикселях CSS на пиксель мира (cssZoom): допуск клика и магнит заданы в пикселях экрана. */
  private css = 2;
  /** Курсор мыши в мире, результаты выбора (подсветка, курсор, клик) и источник для pickOrder — постоянные объекты: наведение считается каждый кадр без аллокаций. */
  private mouse = new Phaser.Math.Vector2();
  private mouseSeen = false;
  /** Что под курсором из мешков, узлов и NPC (id мешка или ссылка) — для подсказки «G»: она про тот же объект, что свечение и курсор. Обновляется каждый кадр в updateHover. */
  private hoverItem: unknown = null;
  private cursorKind: CursorKind = "arrow";
  private pickCtx: PickCtx = { aim: false, right: false, action: true, world: true, css: 2, bigTargets: false };
  private hoverPick: PickOut = { kind: "ground", id: null, ref: null };
  private cursorPick: PickOut = { kind: "ground", id: null, ref: null };
  private clickPick: PickOut = { kind: "ground", id: null, ref: null };
  /** Подсветка мешка или узла добычи под курсором (их берёт ЛКМ): одна картинка на сцену, переезжает за наведением. */
  private takeGlow!: Phaser.GameObjects.Image;
  /** Свечение по силуэту NPC, статуи, двери, камня, входа под курсором (hoverGlow.ts). */
  private hoverGlow!: HoverGlow;
  /** Порядок при наложении (game/hit.ts): точно → передний → текущая цель → ближе центр. */
  private best = new PickBest();
  private pickSrc: PickSource = {
    foe: (reach) => this.foeAt(this.mouse.x, this.mouse.y, reach, "open"),
    townFoe: (reach) => this.foeAt(this.mouse.x, this.mouse.y, reach, "town"),
    item: (out) => this.itemAt(this.mouse.x, this.mouse.y, out),
    menu: (reach) => this.menuAt(this.mouse.x, this.mouse.y, reach),
    friend: (reach, own) => this.friendAt(this.mouse.x, this.mouse.y, reach, own),
  };
  ambient: Record<string, Phaser.GameObjects.Particles.ParticleEmitter> = {};
  /** Текущий цвет дымки зоны (плавно идёт к цвету зоны и ночи). */
  private hazeRGB: [number, number, number] | null = null;
  dust!: Phaser.GameObjects.Particles.ParticleEmitter;
  selfLight!: Phaser.GameObjects.Image;
  dustAt = new Map<string, number>();

  constructor() {
    super("game");
  }

  private scenes: Scenes | null = null;
  /** Интерьеры зданий (задача 144): залы за краем карты и зал, где сейчас герой. */
  private interiors: InteriorViews | null = null;
  /** Лучники на вышках стен у рек (задача 141): бойцы фракции без сети, см. towerArchers.ts. */
  private towerArchers: TowerArchers | null = null;
  /** Сценки в фортах (задача 132, шаг 12): муштра, кузнецы, приказы, катапульта — см. fortScenes.ts. */
  private fortScenes: FortScenes | null = null;
  /** Основания «Знамён Предела» (задача 132, шаг 14): тумба, мачта, знамя на высоте подъёма, круг и кольцо прогресса — см. bannerBases.ts. */
  private bannerBases: BannerBases | null = null;
  /** Осада форта и ворота городов (задача 132, шаг 15): кадры ворот по состоянию, машины, знамя двора — см. siegeView.ts. */
  private siegeView: SiegeView | null = null;
  private room: Interior | null = null;
  /** Переход через дверь: куда перенесён герой; кадр проявляется, когда позиция придёт в состоянии (патч идёт позже сообщения). */
  private arrive: { x: number; y: number; at: number } | null = null;
  private fadeSeq = 0;

  create() {
    // сцена перезапускается при переходе мир ⇄ арена: сбрасываем состояние прошлого запуска
    this.units = new Map();
    this.farUnits = new Map(); // иначе дальние юниты прошлой комнаты (мир) всплывают в рейде/на арене
    this.me = null;
    this.readyFrames = 0;
    this.targetId = null;
    this.bagViews = new Map();
    this.pendingPickup = null;
    this.pendingNpc = null;
    this.bubbles = [];
    this.npcLabels = [];
    setBubbleObstacles(() => this.labelRects());
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
    this.hud.onTakeBag = (id) => this.takeBag(id);
    this.map = net.kind === "arena" ? generateArenaMap(net.arena?.map ?? "ash") : net.kind === "raid" ? generateRaidMap() : net.kind === "dungeon" ? generateDungeonMap() : generateMap(net.seed);
    this.world = buildWorld(this, this.map);
    const cam = this.cameras.main;
    cam.setBounds(0, 0, this.map.w * TILE, this.map.h * TILE);
    /** Масштаб в пикселях CSS на пиксель мира: выбранный колесом или по размеру окна (2–3). Камера получает целый масштаб холста (fitCanvas). */
    // камера чуть дальше (просьба пользователя 2026-10-27): по умолчанию шаг 0,25 от размера окна, 1,75–3; колесо — так же
    const ZMIN = 1.75, ZMAX = 3;
    const cssZoom = () => userZoom ?? Math.max(ZMIN, Math.min(ZMAX, Math.round(Math.min(window.innerWidth / 760, window.innerHeight / 450) * 4) / 4));
    const fitZoom = () => { this.css = cssZoom(); cam.setZoom(fitCanvas(this.game, this.css)); };
    let userZoom: number | null = null;
    try { const z = Number(localStorage.getItem("zoom:v2")); if (z >= ZMIN && z <= ZMAX) userZoom = z; } catch {}
    // размер холста ведёт fitCanvas, а не Phaser: в режиме RESIZE он при каждом изменении окна возвращал бы холст к размеру в пикселях CSS
    this.scale.scaleMode = Phaser.Scale.NONE;
    fitZoom();
    // тексты мира (таблички) созданы в buildWorld ещё при zoom 1 — перерисовываем; новые создаются сразу с этим разрешением, дальше смену масштаба ловит update
    this.textZoom = cam.zoom;
    syncTextRes(cam.zoom);
    // колесо / жест щипка (ctrl+wheel) над игровым полем: масштаб 2–3 (опция «Колесо — масштаб»); над окнами интерфейса не работает
    const onWheel = (e: WheelEvent) => {
      if (!mouseOpts.zoomWheel || e.target !== this.game.canvas) return;
      e.preventDefault();
      userZoom = Math.min(ZMAX, Math.max(ZMIN, Math.round((cssZoom() - Math.sign(e.deltaY) * 0.25) * 4) / 4));
      try { localStorage.setItem("zoom:v2", String(userZoom)); } catch {}
      fitZoom();
    };
    window.addEventListener("wheel", onWheel, { passive: false });
    this.cleanup.push(() => window.removeEventListener("wheel", onWheel));
    // окно и масштаб экрана (перенос на другой монитор, масштаб браузера): не событие Phaser resize — его шлёт и сам fitCanvas
    window.addEventListener("resize", fitZoom);
    let dprQuery: MediaQueryList | null = null;
    const onDpr = () => { fitZoom(); watchDpr(); };
    const watchDpr = () => { dprQuery?.removeEventListener("change", onDpr); dprQuery = matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`); dprQuery.addEventListener("change", onDpr); };
    watchDpr();
    this.cleanup.push(() => { window.removeEventListener("resize", fitZoom); dprQuery?.removeEventListener("change", onDpr); });

    this.fx = new Effects(this, (id) => this.units.get(id), net.id, (id, text) => this.say(id, text));
    this.cleanup.push(
      net.on("node", (m) => { this.world.setNode(m.id, m.up); if (m.up) this.depletedNodes.delete(m.id); else this.depletedNodes.add(m.id); }),
      net.on("nodes", (m) => { for (const id of m.depleted) { this.depletedNodes.add(id); this.world.setNode(id, false); } }),
    );
    let lastGold = -1;
    this.cleanup.push(net.on("queue", (m) => { if (m.id) sfx.play("queue"); }));
    this.cleanup.push(net.on("cast", (m) => { this.castHold = m.ms > 0 ? this.time.now + m.ms : 0; }));
    this.cleanup.push(net.on("self", (s) => { if (lastGold >= 0 && s.gold > lastGold) { const u = this.units.get(net.id); if (u) this.fx.goldPop(u.x, u.y - 40, s.gold - lastGold); this.wow?.gold(s.gold - lastGold); } lastGold = s.gold; }));
    this.cleanup.push(net.on("fx", (list) => this.fx.play(list)), net.on("loot", (bags) => this.syncBags(bags)));
    // свои капканы — для превью капкана (отказ «Слишком близко к другому капкану»)
    this.traps = new TrapWatch();
    this.cleanup.push(net.on("fx", (list) => this.traps.note(list, net.id, performance.now(), net.self?.skills)));

    // NPC — декоративные, проверки дальности делает сервер; расстановка — из данных (shared/npcs.ts: Эмберхолл, города, столицы, поселения)
    bindPreviewScene(this); // превью героя в окнах (Перековщик, подсказка «Оболочки»): client/src/game/gearPreview.ts
    if (net.kind === "world") {
      for (const n of WORLD_NPCS) this.addNpc(n.kind, n.sprite, n, n.name, n.color, n.tint, n.id);
      for (const c of CITIES) {
        // камень телепорта нарисован картой; здесь только невидимая точка нажатия
        const st = this.add.sprite(c.stone.x, c.stone.y - 14, "u_merchant", 0).setVisible(false);
        this.npcs.push({ sprite: st, kind: "stone", id: c.id, name: T("ui.cities.430"), glow: { ...this.objGlowTex("teleport_stone"), x: c.stone.x, y: c.stone.y, ox: 0.5, oy: 1 } });
      }
      // статуи правителей в столицах (задача 141): невидимая точка нажатия по высоте статуи, окно истории — data/statues.json
      for (const o of this.map.objects) {
        const key: StatueKey | null = o.kind === "sun_statue" ? "solgard" : o.kind === "umb_statue" ? "umbrath" : null;
        if (!key) continue;
        this.npcs.push({ sprite: this.add.sprite(o.x, o.y + 4, "u_merchant", 0).setVisible(false), kind: "statue", id: key, name: T("ui.GameScene.754", { name: STATUES[key].name }), hit: { dy: 66, r: 44 }, glow: { ...this.objGlowTex(o.kind), x: o.x, y: o.y, ox: 0.5, oy: 1 } });
      }
      // вход в подземелье «Пепельные чертоги» (задача 139): большая лестница на карте мира, точка нажатия у основания
      this.npcs.push({ sprite: this.add.sprite(DUNGEON_DOOR.x, DUNGEON_DOOR.y, "u_merchant", 0).setVisible(false), kind: "dgdoor", id: "dungeon", name: "Войти: Пепельные чертоги", hit: { dy: 70, r: 96 }, glow: this.objGlow("dg_entrance") });
      this.scenes = new Scenes(this, this.map);
      this.setupEncounters();
      // двери интерьеров (задача 144): снаружи — у двери здания, изнутри — в нижней стене зала; точки нажатия невидимы
      for (const r of INTERIORS) {
        const city = CITIES.find((c) => c.id === r.city)?.name ?? "";
        this.npcs.push({ sprite: this.add.sprite(r.outDoor.x, r.outDoor.y, "u_merchant", 0).setVisible(false), kind: "door", id: r.id, name: T("ui.GameScene.755", { name: r.name }) });
        this.npcs.push({ sprite: this.add.sprite(r.exitDoor.x, r.exitDoor.y, "u_merchant", 0).setVisible(false), kind: "door", id: r.id, name: T("ui.GameScene.756", { city: city || "на улицу" }) });
      }
      this.interiors = new InteriorViews(this);
      this.towerArchers = new TowerArchers(this, this.map);
      this.cleanup.push(() => { this.towerArchers?.destroy(); this.towerArchers = null; });
      this.fortScenes = new FortScenes(this, () => this.units.values());
      this.cleanup.push(() => { this.fortScenes?.destroy(); this.fortScenes = null; });
      this.bannerBases = new BannerBases(this, () => this.units.values());
      this.cleanup.push(() => { this.bannerBases?.destroy(); this.bannerBases = null; });
      this.siegeView = new SiegeView(this, () => this.units);
      this.cleanup.push(() => { this.siegeView?.destroy(); this.siegeView = null; });
      // выстрел башни (fx proj от точки башни, без юнита-стрелка): лучник на вышке поворачивается и стреляет
      this.cleanup.push(net.on("fx", (list) => { for (const f of list) if (f.t === "proj" && f.fx !== undefined && f.fy !== undefined) this.towerArchers?.shot(f.fx, f.fy, f.tx, f.ty); }));
      this.room = null;
      // переход: сервер затемняет (fade), переносит героя и шлёт arrive — камера встаёт на новое место и кадр проявляется
      this.cleanup.push(net.on("int", (m) => {
        const cam = this.cameras.main;
        if (m.ph === "fade") {
          this.clickGoal = null; this.pendingNpc = null;
          const seq = ++this.fadeSeq;
          cam.fadeOut(m.ms ?? 240, 0, 0, 0);
          // страховка: перенос не пришёл (разрыв, смерть) — кадр всё равно проявляется
          this.time.delayedCall(2500, () => { if (seq === this.fadeSeq && !this.arrive) cam.fadeIn(200, 0, 0, 0); });
          return;
        }
        if (m.ph === "arrive") this.arrive = { x: m.x, y: m.y, at: this.time.now };
      }));
      this.arrive = null;
    } else {
      this.scenes = null; this.interiors = null; this.room = null;
      // подземелье: лестница выхода у входа
      if (net.kind === "dungeon") this.npcs.push({ sprite: this.add.sprite(DUNGEON_EXIT.x, DUNGEON_EXIT.y, "u_merchant", 0).setVisible(false), kind: "dgexit", id: "exit", name: DUNGEON_EXIT_LABEL, hit: { dy: 30, r: 48 }, glow: this.objGlow("dg_exit") });
    }
    // ворота подземелья: сервер шлёт состояние; клиент зеркалит проходимость клеток просвета (клик-ход и расчёт пути)
    if (net.kind === "dungeon") {
      const apply = (id: string, open: boolean) => {
        dgGateOpen.set(id, open);
        const g = DUNGEON_GATES.find((q) => q.id === id);
        if (g) for (const [cx, cy] of g.cells) { const i = cy * this.map.w + cx; if (open) this.map.cell[i] &= ~CELL_BLOCK; else this.map.cell[i] |= CELL_BLOCK; }
      };
      dgGateOpen.clear();
      for (const g of DUNGEON_GATES) apply(g.id, net.dgGates.get(g.id) ?? false); // то, что сервер уже прислал, пока сцена создавалась
      net.send("dg:sync", {}); // и на всякий случай запросить состояние заново: ответ придёт dg:gates
      this.cleanup.push(net.on("dg:gate", (m) => apply(m.id, m.open)));
      this.cleanup.push(net.on("dg:gates", (m) => { for (const g of DUNGEON_GATES) apply(g.id, m.open.includes(g.id)); }));
    }
    // затемнение перед переходом в подземелье и обратно (сервер шлёт dungeon:fade, затем резервацию — сцена пересоздаётся)
    this.cleanup.push(net.on("dungeon:fade", (m) => { this.clickGoal = null; this.pendingNpc = null; this.cameras.main.fadeOut(m.ms ?? 300, 0, 0, 0); this.wow?.dungeonFade(m.ms ?? 300); }));

    if (mouseOpts.chase) net.send("chase", { on: true });
    this.aim = new AimPreview(this);
    // вступление боя арены: подсветка бойцов на отсчёте, кольца на «В бой!» (game/arenaIntro.ts)
    this.arenaIntro = net.kind === "arena" ? new ArenaIntroFx(this, net) : null;
    this.cleanup.push(() => { this.arenaIntro?.destroy(); this.arenaIntro = null; });
    // трибуны и толпа с овациями и репликами (game/arenaCrowd.ts)
    this.arenaCrowd = net.kind === "arena" ? new ArenaCrowd(this, net, net.arena?.map ?? "ash") : null;
    this.cleanup.push(() => { this.arenaCrowd?.destroy(); this.arenaCrowd = null; });
    this.clickMark = this.add.image(0, 0, "fx_target").setDepth(DEPTH.ground + 7).setVisible(false).setScale(0.6);
    this.hoverGlow = new HoverGlow(this);
    this.cleanup.push(() => this.hoverGlow.destroy());
    this.takeGlow = this.add.image(0, 0, "fx_glow").setBlendMode(Phaser.BlendModes.ADD).setTint(0xffe6a0).setAlpha(0.8).setVisible(false);

    net.watchUnits("players", (id, u) => this.addUnit(id, u), (id) => this.removeUnit(id));
    net.watchUnits("mobs", (id, u) => this.addUnit(id, u), (id) => this.removeUnit(id));

    this.hud.bind({
      net,
      map: this.map,
      pressSlot: (bar, i) => this.pressSlot(bar, i),
      toggleMount: () => this.toggleMount(),
      togglePet: () => this.togglePet(),
      closeTarget: () => this.setTarget(null),
      selectTarget: (id) => this.setTarget(id),
      selectParty: (n) => this.selectParty(n),
      focusGame: () => this.game.canvas.focus(),
    });

    this.setupInput();
    this.setupAmbient();
    this.postfx = new PostFx(this);
    this.nightMask = new NightMask(this);
    this.weather = new Weather(this, this.map);
    this.weather.onRainStart = () => this.npcRainLine();
    this.wow = new WowHost(this, { units: () => this.units, selfId: net.id, map: this.map, hero: () => this.pos, followTarget: () => this.me?.sprite });
    this.fx.wow = this.wow;
    (window as unknown as { __wow?: unknown }).__wow = this.wow;
  }
  private wow: WowHost | null = null;

  private postfx!: PostFx;
  private nightMask!: NightMask;
  private weather!: Weather;
  /** Дождь начался: ближайший к герою NPC иногда роняет реплику. */
  private npcRainLine() {
    if (Math.random() > lighting.weather.npcLineChance) return;
    let best: Npc | null = null, bd = 520;
    for (const n of this.npcs) { const d = Math.hypot(n.sprite.x - this.pos.x, n.sprite.y - this.pos.y); if (n.id && n.kind !== "stone" && d < bd) { bd = d; best = n; } }
    const lines = lighting.weather.npcLines;
    if (best?.id) this.say(best.id, lines[Math.floor(Math.random() * lines.length)]);
  }

  private addNpc(kind: NpcKind, sprite: string, at: { x: number; y: number }, name: string, color: string, tint?: number, id?: string) {
    const tex = this.textures.exists(`u_${sprite}`) ? `u_${sprite}` : "u_merchant";
    // лист со своими анимациями (смотрители зверинца, data/unit-anims.json): живой покой вместо смены двух кадров
    const live = tex === `u_${sprite}` && this.anims.exists(`${sprite}-rest-0`);
    const fh = live ? this.textures.get(tex).get(0).height : 32;
    const s = this.add.sprite(at.x, at.y, tex, 0).setOrigin(0.5, (fh - 2) / fh).setDepth(at.y);
    if (live) s.play({ key: `${sprite}-rest-0`, startFrame: Math.floor(Math.random() * 12) });
    if (tint) s.setTint(tint);
    const shadow = this.add.image(at.x, at.y - 2, "fx_shadow_blob").setDepth(DEPTH.ground + 5);
    // подпись NPC (решение пользователя 2026-10-27): роль мелко над именем, имя на ступень крупнее ника героя, тень 1 px вместо обводки,
    // значок службы слева от имени; «!» над подписью — только у квестодателей и встреч
    const shadowed = { fontSize: "8px", fontStyle: "600", color, stroke: HALO, strokeThickness: 1, shadow: { offsetX: 0, offsetY: 1, color: "#120a10", blur: 0, fill: true } };
    // роль и имя: последнее слово — личное имя, остальное — роль («Старый стражник Ивор»); без личного имени (вестник рейда, распорядитель арены) — одна строка
    const words = name.split(" "), split = kind !== "enc" && kind !== "raid" && kind !== "arena" && words.length > 1;
    const nameT = placeText(worldText(this, 0, 0, split ? words[words.length - 1] : name, "plain", shadowed).setDepth(DEPTH.top - 5), at.x, at.y - 31, 0.5, 1);
    const extras: Phaser.GameObjects.GameObject[] = [];
    let roleT: Phaser.GameObjects.Text | undefined;
    if (split) {
      const role = worldText(this, 0, 0, `«${words.slice(0, -1).join(" ")}»`, "plain", { ...shadowed, fontSize: "6px", color: "#e2d4b8" }).setDepth(DEPTH.top - 5);
      placeText(role, at.x, at.y - 31 - Math.round(nameT.height) + 2, 0.5, 1);
      extras.push(role);
      roleT = role;
    }
    this.npcLabels.push({ name: nameT, role: roleT });
    if (npcIconFrame(kind) >= 0) {
      const { base, cap } = capBand(nameT);
      extras.push(this.add.image(Math.round(nameT.x) - NPC_ICON_SIZE - 1, Math.round(nameT.y + (base + cap) / 2 - NPC_ICON_SIZE / 2), NPC_ICON_TEX, npcIconFrame(kind)).setOrigin(0, 0).setDepth(DEPTH.top - 5));
    }
    const markY = split ? at.y - 40 - 7 : at.y - 40;
    const mark = placeText(worldText(this, 0, 0, kind === "enc" ? (at as { icon?: string }).icon ?? "!" : npcIconFrame(kind) >= 0 ? "" : "!", "plain", { ...shadowed, fontSize: "10px", color: "#ffd84a" }).setDepth(DEPTH.top - 5), at.x, markY, 0.5, 1);
    if (!live) this.time.addEvent({ delay: 2600 + Math.random() * 800, loop: true, callback: () => s.active && s.setFrame(Math.random() < 0.5 ? 0 : 24) });
    this.npcExtras = [shadow, nameT, mark, ...extras];
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
        // над подписью NPC: имя 8 px + роль 6 px + значок → плашка выше на ~24 px от ног
        const bb = new Bubble(this);
        bb.at(n.sprite.x, n.sprite.y - 56);
        bb.say(m.text, 3500);
        this.hud.chatLine({ from: n.name ?? "", text: m.text, sys: false });
      }),
      net.on("enc:move", (m) => {
        const n = find(m.id);
        if (!n) return;
        n.sprite.setAngle(0);
        const dx = m.x - n.sprite.x, dy = m.y - n.sprite.y;
        // надписи NPC идут вместе с ним, но стоят на целых пикселях каждый кадр (твин даёт дробные координаты)
        const texts = (n.objs ?? []).filter((o): o is Phaser.GameObjects.Text => o instanceof Phaser.GameObjects.Text);
        this.tweens.add({ targets: [n.sprite, ...(n.objs ?? [])], x: `+=${dx}`, y: `+=${dy}`, duration: m.ms, onUpdate: () => { for (const t of texts) if (t.scene) t.setPosition(Math.round(t.x), Math.round(t.y)); } });
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
      e.setDepth(DEPTH.top - 15).setAlpha(0);
      this.ambient[key] = e;
    };
    mk("leaves", "fx_leaf", { frequency: 260, lifespan: 6000, speedX: { min: -14, max: 14 }, speedY: { min: 10, max: 22 }, rotate: { start: 0, end: 360 }, alpha: { start: 0.9, end: 0 }, tint: [0x8ac850, 0xd09a34, 0x6aa040] });
    mk("fireflies", "fx_spark", { frequency: 220, lifespan: 4000, speed: { min: 4, max: 14 }, scale: { start: 0.35, end: 0.1 }, alpha: { values: [0, 1, 0.3, 1, 0] } as any, tint: 0xc8ff6a, blendMode: Phaser.BlendModes.ADD });
    mk("embers", "fx_ember", { frequency: 120, lifespan: 3500, speedY: { min: -30, max: -12 }, speedX: { min: -8, max: 8 }, alpha: { start: 1, end: 0 }, scale: { start: 1, end: 0.3 }, blendMode: Phaser.BlendModes.ADD });
    mk("snow", "fx_spark", { frequency: 40, lifespan: 5000, speedX: { min: -20, max: 10 }, speedY: { min: 30, max: 60 }, scale: { min: 0.15, max: 0.35 }, alpha: { start: 0.9, end: 0.2 }, tint: 0xffffff });
    mk("sand", "fx_smoke", { frequency: 90, lifespan: 2600, speedX: { min: 120, max: 220 }, speedY: { min: -10, max: 10 }, scale: { start: 0.35, end: 0.8 }, alpha: { start: 0.18, end: 0 }, tint: 0xe0b878 });
    mk("ash", "fx_smoke", { frequency: 120, lifespan: 5000, speedX: { min: -10, max: 12 }, speedY: { min: 14, max: 30 }, scale: { start: 0.18, end: 0.1 }, alpha: { start: 0.55, end: 0 }, tint: 0x6a6460 });
    mk("fog", "fx_smoke", { frequency: 420, lifespan: 7000, speedX: { min: 6, max: 14 }, scale: { start: 2.2, end: 3.4 }, alpha: { values: [0, 0.14, 0.14, 0] } as any, tint: 0x9ab8a0 });
    mk("pollen", "fx_spark", { frequency: 500, lifespan: 5000, speedX: { min: 4, max: 14 }, speedY: { min: -4, max: 4 }, scale: 0.2, alpha: { start: 0.8, end: 0 }, tint: 0xfff6c0 });
    this.dust = this.add.particles(0, 0, "fx_smoke", { emitting: false, lifespan: 420, speed: { min: 4, max: 12 }, angle: { min: 200, max: 340 }, scale: { start: 0.45, end: 0.1 }, alpha: { start: 0.45, end: 0 }, tint: 0xc8b898 });
    this.dust.setDepth(DEPTH.ground + 4);
    this.selfLight = this.add.image(0, 0, "fx_glow").setBlendMode(Phaser.BlendModes.ADD).setTint(0xffc88a).setScale(5.5).setAlpha(0).setDepth(DEPTH.top - 10);
  }

  private updateAmbient(zone: Zone, dt: number) {
    const z = zoneStyle(zone);
    const cam = this.cameras.main;
    const v = cam.worldView;
    const want: Record<string, boolean> = {
      leaves: z === Zone.Forest && zone !== Zone.MistWood, fireflies: z === Zone.Swamp, fog: z === Zone.Swamp || GLOOM.has(zone),
      embers: z === Zone.Ashlands || z === Zone.Dungeon || z === Zone.Arena || z === Zone.Volcano, ash: z === Zone.Volcano,
      pollen: (z === Zone.Meadow || z === Zone.Town) && zone !== Zone.UmbrathCity && zone !== Zone.FortUmbrath, snow: z === Zone.Snow, sand: z === Zone.Desert,
    };
    for (const [k, e] of Object.entries(this.ambient)) {
      e.setPosition(v.x - 40, v.y - (k === "leaves" ? 60 : 0));
      (e.emitZones[0] as any)?.source?.setSize?.(v.width + 80, v.height + 40);
      // смена зоны: погода не обрывается, а проявляется и тает за ~1,5 с (прозрачность всего эмиттера); растаявшая — останавливается
      e.setAlpha(e.alpha + ((want[k] ? 1 : 0) - e.alpha) * Math.min(1, dt * 1.5));
      if (want[k] && !e.emitting) e.start();
      else if (!want[k] && e.emitting && e.alpha < 0.02) e.stop(true);
    }
    this.selfLight.setPosition(this.pos.x, this.pos.y - 12).setAlpha(this.world.dark.alpha * 0.55);
    updateBuildingFade(this.pos.x, this.pos.y, dt);
    updateTreeFade(this.pos.x, this.pos.y, dt); // крона полупрозрачна, когда герой за деревом (treeFade.ts)
    // пыль из-под ног идущих
    const now = this.time.now;
    for (const [id, u] of this.units) {
      if (u.dead || u.u.anim !== Anim.Walk) continue;
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
    const old = this.units.get(id);
    if ((old ? old.u : this.farUnits.get(id)) === u) return;
    // тот же id, новый объект состояния: питомец сменился другим призывом (у всех питомцев героя id pet_<герой>) —
    // прежний вид снимается, иначе на карте остаётся старый питомец, а рамка показывает нового
    const retarget = !!old && this.targetId === id;
    if (old) { old.destroy(); this.units.delete(id); }
    this.farUnits.delete(id);
    if (retarget) queueMicrotask(() => { if (this.targetId === id) this.setTarget(id); });
    if (!near && id !== net.id && u.kind !== UnitKind.Player && u.kind !== UnitKind.Pet && (!this.me || this.isFar(u, UNIT_NEAR))) {
      this.farUnits.set(id, u);
      return;
    }
    const v = new UnitView(this, id, u, id === net.id);
    if (u.kind === UnitKind.Boss) glowOn(v.sprite);
    this.units.set(id, v);
    if (id === net.id) {
      this.me = v;
      this.pos = { x: u.x, y: u.y };
      this.cameras.main.startFollow(v.sprite, true, 0.15, 0.15, 0, 12);
      this.cameras.main.centerOn(u.x, u.y - 12); // сразу на героя: под уходящим экраном загрузки камера не едет от края мира
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
      // setTintFill, а не setTint: текстура кольца золотая, и умножение дало бы оранжево-красное и оливковое вместо цветов палитры
      if (v) { v.selected = true; v.ring.setTintFill(this.isEnemy(v) ? RING_FOE : RING_ALLY); }
    }
    net.send("target", { id });
  }

  /** Выбрать врага и начать атаку: подход до дальности и автоатака (сообщение attack). */
  attackTarget(id: string | null = this.targetId) {
    const v = id ? this.units.get(id) : undefined;
    if (!id || !v || v.dead || !this.isEnemy(v)) return this.hud.toast({ text: T("ui.GameScene.253"), kind: "error" });
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
      return this.hud.toast({ text: T("ui.GameScene.254"), kind: "error" });
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
      interact: () => this.interactNearest(),
      talk: () => this.interactNearest(),
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
      winMuster: () => this.hud.toggle("muster"),
      winAdmin: () => this.hud.toggle("admin"),
      chat: () => this.hud.focusChat(),
      // Esc: прицел → очередь, подход, канал (сервер, cancel) → окно, цель, меню
      escape: () => {
        if (this.aimState) return this.cancelAim();
        const busy = !!net.queued || net.pending || this.time.now < this.castHold;
        net.send("cancel");
        if (!busy) this.hud.escape(!!this.targetId, () => this.setTarget(null));
      },
    };
    // единственный обработчик клавиатуры; молчит только при вводе текста (ползунки, флажки и кнопки ему не мешают)
    const onKeyDown = (e: KeyboardEvent) => {
      if (this.hud.isTyping() || e.isComposing) return;
      // умолчания браузера, мешающие игре: Tab уводит фокус на кнопки, F1–F5 — справка, поиск, обновление страницы
      if (e.code === "Tab" || (/^F[1-5]$/.test(e.code) && !e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey)) e.preventDefault();
      const bs = keybinds.barSlotFor(e);
      if (bs) { e.preventDefault(); if (!e.repeat) { this.pressSlot(bs.bar, bs.i, e.code, e.altKey); this.startHold(bs.bar, bs.i, e.code, e.altKey); } return; }
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
      if (e.code === this.holdCode) this.stopHold();
      // «С превью»: клавиша слота отпущена — каст
      const st = this.aimState;
      if (st && st.hold === e.code) { this.aimState = null; this.castNow(SKILLS[st.id], e.altKey); }
    };
    const onBlur = () => { this.held.clear(); this.cancelAim(); this.stopHold(); };
    this.cleanup.push(() => this.stopHold());
    const onMouseMove = (e: MouseEvent) => { this.overUi = e.target !== this.game.canvas; this.mouseSeen = true; };
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

    preloadCursors();
    // подсветка и курсор мира считаются каждый кадр (updateHover), а не по движению мыши
    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      if (!this.me || this.me.dead) return;
      (document.activeElement as HTMLElement | null)?.blur?.();
      const wx = p.worldX, wy = p.worldY;
      const right = p.rightButtonDown();
      this.mouse.set(wx, wy);
      // один порядок с подсветкой и курсором (castResolve.pickOrder): прицел → враг → мешок, узел, NPC → меню союзника → союзник → враг магнитом → земля;
      // мешки, узлы добычи и NPC берут обе кнопки (враг точно — раньше них)
      const hit = this.pickAt(right, this.clickPick);
      switch (hit.kind) {
        case "aim": {
          // прицел: ПКМ отменяет, ЛКМ в режиме «С подтверждением» кастует; при зажатой клавише клики не двигают героя
          const st = this.aimState!;
          if (right) this.cancelAim();
          else if (!st.hold) { this.aimState = null; this.castNow(SKILLS[st.id], (p.event as MouseEvent).altKey); }
          else {
            // зажатая клавиша умения («С превью») пропускает ЛКМ к выбору цели (тот же порядок, что без прицела); героя клик не двигает
            const sel = this.pickAt(false, this.clickPick, true);
            if (sel.kind === "foe" || sel.kind === "magnet" || sel.kind === "friend") this.setTarget(sel.id);
          }
          return;
        }
        case "foe":
          // враг: ЛКМ выбирает (атакует только при опции «ЛКМ атакует»), ПКМ атакует
          return right || mouseOpts.lmbAttacks ? this.attackTarget(hit.id) : this.setTarget(hit.id);
        case "magnet":
          // промах ЛКМ в радиусе магнита: только выбор, даже при «ЛКМ атакует» — в пачке магнит может взять не того, а атака начала бы бой с чужим мобом
          return this.setTarget(hit.id);
        case "bag": {
          // мешок с добычей
          return this.takeBag(hit.id!);
        }
        case "node": {
          // узлы добычи (кактус, кристалл, обсидиан, жемчуг)
          const n = hit.ref as WorldMap["nodes"][number];
          this.pendingGather = n.id;
          if (Math.hypot(n.x - this.pos.x, n.y - 14 - this.pos.y) > ENV.gatherRange - 12) net.send("moveTo", { x: n.x, y: n.y + 26 });
          return;
        }
        case "npc":
          return this.talk(hit.ref as Npc);
        case "menu": {
          // правый клик по другому игроку — меню обмена
          const v = this.units.get(hit.id!), ev = p.event as MouseEvent;
          if (!v) return;
          const uid = v.id;
          return this.hud.trade.showMenu(uid, v.u.name, ev.clientX, ev.clientY, () => this.hud.inspect.open(uid), () => this.followUnit(uid));
        }
        case "friend":
          // союзник: выбор
          return this.setTarget(hit.id);
      }
      // земля: цель не снимается; ЛКМ ведёт героя только в «Классике»
      if (!right && keybinds.presetId !== "classic") return;
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

  /** Курсор над миром — что сделает ПКМ: враг (в допуске, без магнита) — меч, NPC — рука, мешок и узел добычи (их берут обе кнопки) — перчатка, иначе стрелка. */
  private cursorAt(hit: PickOut): CursorKind {
    return hit.kind === "foe" ? "attack" : hit.kind === "npc" ? "talk" : hit.kind === "bag" || hit.kind === "node" ? "take" : "arrow";
  }

  /** Что под курсором (this.mouse) для кнопки: один порядок для клика, подсветки и курсора (castResolve.pickOrder). */
  private pickAt(right: boolean, out: PickOut, ignoreAim = false): PickOut {
    const c = this.pickCtx;
    c.aim = !ignoreAim && !!this.aimState;
    c.right = right;
    c.action = keybinds.presetId !== "classic";
    c.world = net.kind === "world" || net.kind === "dungeon";
    c.css = this.css;
    c.bigTargets = mouseOpts.bigTargets;
    return pickOrder(c, this.pickSrc, out);
  }

  /** Каждый кадр по activePointer (камера и мобы едут, а мышь стоит): подсветка — кого выберет ЛКМ (с магнитом), курсор — что сделает ПКМ.
   *  Мышь вне холста (вышла из окна — activePointer хранит последнюю точку у края) и над интерфейсом — без подсветки. Себя не подсвечиваем:
   *  свои ник и полоска включаются настройками «Свои имена» и «Свои полоски», а не наведением.
   *  Без аллокаций: курсор в мире — один Vector2, результаты — постоянные объекты. */
  private updateHover() {
    let hov: string | null = null, foe = true, cur: CursorKind = "arrow", glow = false, npcGlow: Npc | null = null;
    this.hoverItem = null;
    const me = this.me;
    if (this.mouseSeen && !this.overUi && this.input.manager.isOver && me && !me.dead) {
      const ap = this.input.activePointer;
      this.cameras.main.getWorldPoint(ap.x, ap.y, this.mouse);
      const l = this.pickAt(false, this.hoverPick);
      this.hoverItem = l.kind === "bag" ? l.id : l.kind === "node" || l.kind === "npc" ? l.ref : null;
      if (l.kind === "foe" || l.kind === "magnet") hov = l.id;
      else if (l.kind === "friend" && l.id !== net.id) { hov = l.id; foe = false; }
      else if (l.kind === "bag" || l.kind === "node") {
        // мешок или узел добычи, который возьмёт ЛКМ: мягкое свечение под ним
        const bag = l.kind === "bag" ? this.bagViews.get(l.id!) : undefined, n = l.kind === "node" ? (l.ref as WorldMap["nodes"][number]) : undefined;
        const gx = bag ? bag.x : n ? n.x : 0, gy = bag ? bag.y - 8 : n ? n.y - 14 : 0;
        if (bag || n) { glow = true; this.takeGlow.setPosition(gx, gy).setDepth(gy + 18).setScale(n ? 1.3 : 1); }
      }
      else if (l.kind === "npc") npcGlow = l.ref as Npc;
      cur = this.cursorAt(this.pickAt(true, this.cursorPick));
    }
    // юнит под курсором — свечение по силуэту текущего кадра: враг красное, союзник зелёное (у NPC — золотое)
    const fv = hov ? this.units.get(hov) : undefined, fs = fv?.sprite;
    const foeGlow: GlowSrc | null = fs && fs.active && fs.visible && !fv!.dead ? { id: `u:${hov}`, color: foe ? "rgb(230,70,60)" : "rgb(90,210,110)", tex: fs.texture.key, frame: fs.frame.name, x: fs.x, y: fs.y, ox: fs.originX, oy: fs.originY, flip: fs.flipX, depth: fs.depth } : null;
    this.hoverGlow.update(npcGlow ? this.glowOf(npcGlow) : foeGlow, this.game.loop.delta, this.time.now);
    if (hov !== this.hoverId) {
      const old = this.hoverId ? this.units.get(this.hoverId) : undefined;
      if (old) old.hovered = false;
      this.hoverId = hov;
    }
    const v = hov ? this.units.get(hov) : undefined;
    if (v) { v.hovered = true; v.hoverFoe = foe; }
    if (cur !== this.cursorKind) { this.cursorKind = cur; setCursor(cur); }
    if (glow !== this.takeGlow.visible) this.takeGlow.setVisible(glow);
    this.lootRowHover();
  }

  /** Картинка объекта карты по виду (вход и выход подземелья): силуэт для свечения. */
  private objGlow(kind: string): Npc["glow"] {
    const o = this.map.objects.find((q) => q.kind === kind);
    return o && objHas(this, kind) ? { ...this.objGlowTex(kind), x: o.x, y: o.y, ox: 0.5, oy: 1 } : undefined;
  }
  /** Текстура и кадр объекта карты для свечения (атлас объектов, game/objTex.ts). */
  private objGlowTex(kind: string): { tex: string; frame?: string } {
    const [tex, frame] = objTex(kind);
    return frame === undefined ? { tex } : { tex, frame };
  }

  /** Что светить для NPC под курсором: силуэт объекта карты, текущий кадр видимого NPC или пятно по зоне нажатия (двери в стенах зданий). */
  private glowOf(n: Npc): GlowSrc | null {
    const s = n.sprite;
    if (!s.active) return null;
    if (n.glow) return { ...n.glow, depth: n.glow.y };
    if (s.visible && s.angle === 0) return { tex: s.texture.key, frame: s.frame.name, x: s.x, y: s.y, ox: s.originX, oy: s.originY, flip: s.flipX, depth: s.depth };
    const r = Math.min(n.hit?.r ?? 18, 40);
    return { tex: null, x: s.x, y: s.y - (n.hit?.dy ?? 14), ox: 0.5, oy: 0.5, depth: s.y + 1, spot: { w: r * 2.4, h: r * 2 } };
  }

  /** Враг ли юнит: мобы всегда; игроки — на арене из другой команды, в мире — противоположная фракция в спорной зоне или нейтральном городе (как World.hostile). */
  isEnemy(v: UnitView): boolean {
    if (v.u.kind === UnitKind.Pet || v.npc) return false;
    // боец фракции (задача 132, шаг 5): враг только героям мира чужой фракции — то же правило, что World.hostile (shared soldierHostile);
    // внутри стен Эмберхолла атаки запрещены (World.noFight) — там боец не предлагается целью атаки
    if (v.u.kind === UnitKind.Soldier) return !!net.self && net.kind === "world" && soldierHostile(net.self.faction, net.unit(net.id)?.team ?? 0, v.u.faction) && !inEmberWalls(this.pos.x, this.pos.y);
    if (v.u.kind !== UnitKind.Player) return true;
    if (v.u.buffs & BUFF_STEALTH) return false;
    if (net.kind === "arena") return v.u.team !== 0 && v.u.team !== net.arena?.team;
    if (net.kind === "raid") return false; // в рейде все герои — союзники, враг только босс и его приспешники
    const me = net.self;
    return !!me && v.id !== net.id && factionsHostile(this.map, me.faction, this.pos.x, this.pos.y, v.u.faction, v.u.x, v.u.y);
  }

  /** Герой чужой фракции в нейтральном городе: клиент считает его врагом (isEnemy), но бой там запрещён — удар клеймит нарушителем и зовёт стражу (World.townSafe). */
  private townFoe(v: UnitView): boolean {
    return v.u.kind === UnitKind.Player && net.kind === "world" && pvpPlace(this.map, this.pos.x, this.pos.y) === "neutral";
  }

  /** Ближайший к точке мира живой враг: тело юнита с запасом reach (пиксели мира). set: open — те, кого здесь можно бить (мобы, боссы, герои в спорной зоне и на арене),
   *  town — герои чужой фракции в нейтральном городе, any — все (каст по наведению). Без аллокаций — вызывается каждый кадр. */
  private foeAt(wx: number, wy: number, reach: number, set: "open" | "town" | "any" = "any"): string | null {
    const b = this.best; b.reset();
    for (const v of this.units.values()) {
      if (v.hitTest(wx, wy, reach) < Infinity && this.isEnemy(v) && (set === "any" || this.townFoe(v) === (set === "town"))) b.offer(v.id, v.hit, v.id === this.targetId);
    }
    return b.id;
  }

  /** Союзник-игрок, которому ПКМ откроет меню обмена: не я, не враг, не скрытый. */
  private menuAt(wx: number, wy: number, reach: number): string | null {
    const b = this.best; b.reset();
    for (const v of this.units.values()) {
      if (v.hitTest(wx, wy, reach) < Infinity && v.u.kind === UnitKind.Player && v.id !== net.id && !v.unseen && !this.isEnemy(v)) b.offer(v.id, v.hit, v.id === this.targetId);
    }
    return b.id;
  }

  /** Мой герой и мои питомцы. */
  private mine(v: UnitView): boolean {
    return v.id === net.id || (v.u.kind === UnitKind.Pet && v.u.ownerId === net.id);
  }

  /** Союзник для выбора и лекаря: игроки, включая себя, и питомцы; скрытый игрок не виден и не выбирается.
   *  Мой герой и мои питомцы берутся с запасом own (в кликах — 0: допуск вокруг героя в центре экрана съел бы клик-шаг), остальные — с запасом reach. */
  private friendAt(wx: number, wy: number, reach: number, own = reach): string | null {
    const b = this.best; b.reset();
    for (const v of this.units.values()) {
      // свои — без следа и без маунта: клик туда, где герой был миг назад или рядом с конём, — это шаг, а не выбор себя
      const mine = this.mine(v);
      if (v.hitTest(wx, wy, mine ? own : reach, !mine, !mine) < Infinity && (v.u.kind === UnitKind.Player || v.u.kind === UnitKind.Pet) && !v.unseen && !this.isEnemy(v)) b.offer(v.id, v.hit, v.id === this.targetId);
    }
    return b.id;
  }

  /** Мешок с добычей, узел добычи или NPC под точкой мира — в таком порядке; нашлось — кладёт в out kind, id и ref.
   *  Попадание везде одно: по непрозрачным пикселям текущего кадра с допуском клика (objPick.ts), у высоких — по всей высоте; круг — только запасной (нет картинки) и у NPC с зоной hit.
   *  Среди NPC и объектов: точно → человек раньше объекта → передний по глубине. */
  private itemAt(wx: number, wy: number, out: PickOut): boolean {
    const tol = pickReach(this.css, false, mouseOpts.bigTargets);
    for (const [id, img] of this.bagViews) {
      const dx = img.x - wx, dy = img.y - 10 - wy, d = goDist(this, img, wx, wy, tol);
      if (dx * dx + dy * dy < 16 * 16 || d < Infinity) { out.kind = "bag"; out.id = id; return true; }
    }
    for (const n of this.map.nodes) {
      if (this.depletedNodes.has(n.id)) continue;
      const img = this.world.nodeImage(n.id), d = img ? goDist(this, img, wx, wy, tol) : NaN, dx = n.x - wx, dy = n.y - 16 - wy;
      if (d < Infinity || (d !== d && dx * dx + dy * dy <= 24 * 24)) { out.kind = "node"; out.ref = n; return true; }
    }
    let best: Npc | null = null, bd = Infinity, brank = 9, bdepth = -Infinity;
    for (const n of this.npcs) {
      const d = this.npcDist(n, wx, wy, tol);
      if (!(d < Infinity)) continue;
      const exact = d === 0 ? 0 : 1, rank = n.kind === "stone" || n.kind === "door" || n.kind === "statue" || n.kind === "dgdoor" || n.kind === "dgexit" ? 1 : 0;
      const key = exact * 10 + rank, bkey = (bd === 0 ? 0 : 1) * 10 + brank;
      if (best === null || key < bkey || (key === bkey && n.sprite.y > bdepth)) { best = n; bd = d; brank = rank; bdepth = n.sprite.y; }
    }
    if (best) { out.kind = "npc"; out.ref = best; return true; }
    return false;
  }

  /** Расстояние от точки мира до NPC или объекта: силуэт картинки (источник свечения или видимый спрайт) ∪ запасной круг зоны нажатия; Infinity — мимо. */
  private npcDist(n: Npc, wx: number, wy: number, tol: number): number {
    const s = n.sprite, g = n.glow;
    let d = Infinity, hasImg = false;
    if (g?.tex) {
      const r = texDist(this, g.tex, g.frame, g.x, g.y, g.ox, g.oy, 1, 1, !!g.flip, wx, wy, tol);
      if (r === r) { hasImg = true; d = r; }
    } else if (s.active && s.visible && s.angle === 0) {
      const r = goDist(this, s, wx, wy, tol);
      if (r === r) { hasImg = true; d = r; }
    }
    // круг: зона нажатия, если задана; у видимого человека без картинки и у невидимых точек (двери в стенах) — по умолчанию
    if (n.hit || !hasImg) {
      const dx = s.x - wx, dy = s.y - (n.hit?.dy ?? 14) - wy, r = n.hit?.r ?? 18;
      if (dx * dx + dy * dy < r * r) d = 0;
    }
    return d;
  }

  /** Ближайший к курсору живой враг: допуск клика, а с magnet — радиус магнита. */
  pick(wx: number, wy: number, magnet = false): string | null {
    return this.foeAt(wx, wy, pickReach(this.css, magnet, mouseOpts.bigTargets));
  }

  /** Союзник под курсором (для лекаря): игроки, включая себя, и питомцы; допуск клика. */
  pickFriend(wx: number, wy: number): string | null {
    return this.friendAt(wx, wy, pickReach(this.css, false, mouseOpts.bigTargets));
  }

  private tabList: string[] = [];
  private tabAt = 0;
  /** Tab / Shift+Tab: только враги на экране (cameras.main.worldView) с прямой видимостью, сначала те, у кого цель — я, затем ближние (castResolve.tabOrder);
   *  за краем экрана не берём — Tab не пуллит лагерь, которого не видно. Список замораживается на 2 с. */
  cycleTarget(dir = 1) {
    const now = performance.now();
    if (now - this.tabAt > 2000 || !this.tabList.length) {
      const view = this.cameras.main.worldView;
      this.tabList = tabOrder([...this.units.values()].map((v) => {
        const enemy = this.isEnemy(v) && !v.dead, inView = enemy && view.contains(v.x, v.y);
        return {
          id: v.id, x: v.x, y: v.y, dead: v.dead, enemy, inView,
          los: inView && lineClear(this.map, this.pos.x, this.pos.y, v.x, v.y), onMe: (v.u as { target?: string }).target === net.id,
        };
      }), this.pos);
    }
    this.tabAt = now;
    const list = this.tabList.filter((id) => { const v = this.units.get(id); return v && !v.dead; });
    if (!list.length) return;
    const i = list.indexOf(this.targetId ?? "");
    this.setTarget(list[i < 0 ? (dir > 0 ? 0 : list.length - 1) : (i + dir + list.length) % list.length]);
  }

  /** Запрещено на арене (shared/arena.ts): короткий тост вместо сообщения серверу. */
  private arenaRefuse(ref: object | null | undefined): boolean {
    if (net.kind !== "arena" || !arenaBlocked(ref)) return false;
    this.hud.toast({ text: ARENA_BLOCKED_TEXT, kind: "error" });
    return true;
  }

  toggleMount() {
    if (!this.me || this.me.dead || this.arenaRefuse({ a: "mount" })) return;
    net.send("mount:toggle");
  }

  togglePet() {
    if (!this.me || this.me.dead || this.arenaRefuse({ a: "pet" })) return;
    net.send("pet:toggle");
  }

  /** Shift+G: выбрать следующего из своих питомцев. */
  cyclePet() {
    const own = Object.keys(net.self?.pets ?? {});
    if (own.length < 2) return;
    const next = own[(own.indexOf(net.self?.pet ?? "") + 1) % own.length];
    net.send("pet:select", { id: next });
    this.hud.toast({ text: T("ui.GameScene.255", { v: PETS[next]?.name ?? next }), kind: "info" });
  }

  /** Shift+X: выбрать следующий из своих маунтов. */
  cycleMount() {
    const own = net.self?.mounts ?? [];
    if (own.length < 2) return;
    const next = own[(own.indexOf(net.self?.mount ?? "") + 1) % own.length];
    net.send("mount:select", { id: next });
    this.hud.toast({ text: T("ui.GameScene.256", { v: MOUNTS[next]?.name ?? next }), kind: "info" });
  }

  /** Нажатие слота панели (клавиша или клик): умение, предмет (по base) или действие. */
  pressSlot(bar: number, i: number, code: string | null = null, alt = false) {
    const ref = net.self?.bars?.[bar]?.[i];
    if (!ref || this.arenaRefuse(ref)) return;
    this.hud.flashSlot(bar, i);
    if ("s" in ref) this.useSkillId(ref.s, code, alt);
    else if ("i" in ref) { if (net.self && !this.me?.dead) net.send("use:base", { base: ref.i }); }
    else if (ref.a === "mount") this.toggleMount();
    else if (ref.a === "pet") this.togglePet();
    else if (ref.a === "attack") this.attackTarget();
    else this.interactNearest();
  }

  private arenaIntro: ArenaIntroFx | null = null;
  private arenaCrowd: ArenaCrowd | null = null;
  private holdTimer = 0;
  private holdCode = "";
  /** Удержание клавиши умения в режиме «Быстрый» повторяет нажатие каждые 150 мс. */
  private startHold(bar: number, i: number, code: string, alt: boolean) {
    this.stopHold();
    const ref = net.self?.bars?.[bar]?.[i];
    if (!ref || !("s" in ref) || mouseOpts.aimMode !== "quick") return;
    this.holdCode = code;
    this.holdTimer = window.setInterval(() => this.pressSlot(bar, i, code, alt), 150);
  }
  private stopHold() { clearInterval(this.holdTimer); this.holdTimer = 0; this.holdCode = ""; }

  private aimState: { id: string; hold: string | null; t0: number } | null = null;
  private aimHover: string | null = null;
  private overUi = false;
  private aim!: AimPreview;

  /** Умение с панели: по режиму прицела — сразу, с прицелом до отпускания клавиши (hold) или до ЛКМ. */
  useSkillId(id: string, hold: string | null = null, alt = false) {
    const self = net.self;
    if (!self || !this.me || this.me.dead) return;
    const def = SKILLS[id];
    if (!def || def.cls !== self.cls || def.kind !== "active") return;
    if (!self.skills[def.id]) return this.hud.toast({ text: T("ui.GameScene.257", { v: def.name }), kind: "error" });
    this.aimState = null;
    const mode = mouseOpts.aimMode;
    if (mode === "quick" || (def.aim === "self" && mode === "confirm")) return this.castNow(def, alt);
    // «С превью»: клавиша зажата — прицел, каст при отпускании; клик по слоту — сразу
    if (mode === "preview" && !hold) return this.castNow(def, alt);
    this.aimState = { id, hold: mode === "preview" ? hold : null, t0: performance.now() };
  }

  cancelAim() { this.aimState = null; this.aim?.clear(); }

  /** Юнит для выбора адресата и прицела: радиус — как у сервера (unitRadius), взгляд — за спину («Теневой шаг»), босс — его не притягивают. */
  private castUnit(id: string | null): CastUnit | null {
    const v = id ? this.units.get(id) : undefined;
    if (!v) return null;
    const enemy = this.isEnemy(v);
    return {
      id: v.id, x: v.x, y: v.y, enemy, friend: !enemy && (v.u.kind === UnitKind.Player || v.u.kind === UnitKind.Pet), dead: v.dead,
      r: unitRadius(v.u), dir: v.u.dir, boss: v.u.kind === UnitKind.Boss,
    };
  }

  /** Вход для resolveCast: курсор (последнее положение над картой), юнит под ним, цель, «вперёд». */
  private castInput(def: SkillDef, alt: boolean) {
    const ap = this.input.activePointer, cur = this.cameras.main.getWorldPoint(ap.x, ap.y);
    // адресат — как у подсветки (тот же PickBest: точно → передний → текущая цель → ближе центр); без точного наведения — выбранная цель,
    // враг у курсора (подсвеченный магнитом в «Экшене», иначе ближайший в 80 px экрана) — только если цели нет (resolveCast)
    const hoverId = this.overUi ? null : def.target === "ally" ? this.pickFriend(cur.x, cur.y) : this.pick(cur.x, cur.y);
    const nearId = this.overUi || def.target !== "enemy" || keybinds.presetId === "classic" ? null : this.pick(cur.x, cur.y, true);
    const d = this.me?.u.dir;
    const facing = d === Dir.Left ? { x: -1, y: 0 } : d === Dir.Right ? { x: 1, y: 0 } : d === Dir.Up ? { x: 0, y: -1 } : { x: 0, y: 1 };
    return {
      skill: { aim: def.aim ?? "self", target: def.target, range: def.range },
      self: { id: net.id, x: this.pos.x, y: this.pos.y },
      cursor: { x: cur.x, y: cur.y }, overUi: this.overUi,
      hover: this.castUnit(hoverId), selected: this.castUnit(this.targetId),
      units: [...this.units.keys()].map((k) => this.castUnit(k)).filter((x): x is CastUnit => !!x),
      facing, alt, hoverCast: mouseOpts.hoverCast, autoTarget: mouseOpts.autoTarget,
      hoverNear: this.castUnit(nearId), nearReach: PICK_NEAR / (this.css > 0 ? this.css : 1),
    };
  }

  castNow(def: SkillDef | undefined, alt = false) {
    if (!def || !this.me || this.me.dead) return;
    const plan = resolveCast(this.castInput(def, alt));
    const fail = (text: string) => this.hud.castError(text, def.id);
    if (!plan.ok) return fail(plan.err === "Нет цели" ? T("ui.GameScene.757") : plan.err);
    // предпроверка до отправки (отклик без RTT): мана, дальность, перезарядка; сервер всё равно судья
    const self = net.self, mp = this.me.u.mp, need = self ? skillMana(def, self.skills[def.id] || 1, self.level) : 0;
    if (mp < need) return fail(T("ui.GameScene.258", { v: Math.floor(mp), v2: need }));
    if (def.aim === "unit" && def.range && plan.far && !mouseOpts.approach) {
      // как у сервера: дальше дальности + радиус цели
      const over = Math.hypot(plan.x - this.pos.x, plan.y - this.pos.y) - def.range - (this.castUnit(plan.target)?.r ?? PLAYER_RADIUS);
      return fail(T("ui.GameScene.259", { v: Math.max(1, Math.ceil(over / TILE)) }));
    }
    const now = performance.now(), cds = net.cooldowns;
    const own = (cds.get(def.id) ?? 0) - now, gcd = def.offGcd ? 0 : (cds.get("gcd") ?? 0) - now;
    if (Math.max(own, gcd) > mouseOpts.queueMs) {
      if (own > 0) fail(T("ui.GameScene.260", { v: (own / 1000).toFixed(1).replace(".", ",") }));
      return;
    }
    // куда ляжет — та же функция, которой решает сервер: его отказ (видимость, луч до стены, рывок в упор) — сразу, без RTT, но только если каст
    // исполнится сейчас: из очереди (готовность в пределах queueMs) сервер сам проверит видимость, путь и правила в момент исполнения, а наш расчёт
    // от нынешних мест к тому времени устареет (цель выйдет из-за колонны, пачка добежит в круг). В запросе — прижатая точка, угол линии и стены,
    // вектор рывка и до точки линии (сервер применит их от своей позиции)
    const { g, msg } = this.aimOf(def, plan, aimSpec(def).pick === "near" ? this.hitUnits() : undefined);
    if (g.err && own <= 0 && gcd <= 0) return fail(g.err);
    this.hud.notePress(def.id);
    net.send("skill", { id: def.id, ...msg, target: plan.target, q: mouseOpts.queueMs, ap: mouseOpts.approach });
  }

  /** Геометрия умения по плану (shared/skillShape.ts через castAim): от предсказанной позиции, ранг и пассивки героя (неизученное — 1 ранг).
   *  Цель плана (ноги, радиус как у сервера, взгляд, босс) — для самонаведения шара и умений на цель; мир — свои капканы и, если нужны, юниты
   *  (цели роя, метки «кого заденет» — hitUnits; список строит вызывающий, только когда он нужен). */
  private aimOf(def: SkillDef, plan: { x: number; y: number; target: string | null }, units?: readonly HitUnit[]) {
    const ranks = net.self?.skills;
    const t = plan.target ? this.castUnit(plan.target) : null;
    return castAim(this.map, def, ranks?.[def.id] || 1, ranks, this.pos, plan, aimUnit(t), { traps: this.traps.live(performance.now()), units });
  }
  /** Свои живые капканы (по fx сервера) — превью знает отказ «Слишком близко к другому капкану». */
  private traps = new TrapWatch();
  /** Юниты для «кого заденет» — по правилам сервера (castResolve.hitUnitsOf): враги, которых задевают площадные, союзники и питомцы по хозяину;
   *  скрытых и павших нет (метка выдала бы невидимку). Радиус — как у сервера. */
  private hitUnits(): HitUnit[] {
    const me = net.self, list: HitView[] = [];
    for (const v of this.units.values()) {
      const k = v.u.kind, hero = k === UnitKind.Player, pet = k === UnitKind.Pet;
      list.push({
        id: v.id, x: v.x, y: v.y, r: unitRadius(v.u), dead: v.dead, unseen: v.unseen, hero, pet, boss: k === UnitKind.Boss,
        foe: !pet && this.isEnemy(v) && (!hero || this.affectable(v)), hostile: hero && this.hostileHero(v), kin: hero && !!me && v.u.faction === me.faction, owner: v.u.ownerId,
      });
    }
    return hitUnitsOf(list, net.id);
  }
  /** Враждебен ли мне герой — как World.hostile: без скидки на скрытность (в отличие от isEnemy) — для союзников и питомцев в «кого заденет». */
  private hostileHero(v: UnitView): boolean {
    if (v.id === net.id) return false;
    if (net.kind === "arena") return v.u.team !== 0 && v.u.team !== net.arena?.team;
    if (net.kind === "raid") return false;
    const me = net.self;
    return !!me && factionsHostile(this.map, me.faction, this.pos.x, this.pos.y, v.u.faction, v.u.x, v.u.y);
  }
  /** Задевают ли героя площадные — как World.canAffect: в нейтральном городе бой героев запрещён, кроме отпора нарушителю. */
  private affectable(v: UnitView): boolean {
    return !this.townFoe(v) || (!!v.u.outlaw && !this.me?.u.outlaw);
  }

  /** Каждый кадр: превью по состоянию прицела или наведению на слот; метки — кого заденет у роя, щитов и лечения союзникам и цель самонаведения
   *  (только вместе с формой: при наведении на слот площадного круга нет — и меток нет; у новы — всегда). Юниты — только когда нужны.
   *  Заодно радиус и сторона выбранной цели — для панели умений (selTarget: «далеко» и «нет видимости» как у сервера). */
  private updateAim() {
    // свой герой погиб — сервер молча погасил его капканы
    if (this.me?.dead) this.traps.clear();
    const sel = this.castUnit(this.targetId);
    selTarget.r = sel?.r ?? PLAYER_RADIUS; selTarget.friend = !!sel?.friend; selTarget.enemy = !!sel?.enemy;
    // «С превью»: короткое нажатие кастует без вспышки прицела — превью появляется, только если клавишу держат дольше HOLD_PREVIEW_MS
    const st = this.aimState && (!this.aimState.hold || performance.now() - this.aimState.t0 >= HOLD_PREVIEW_MS) ? this.aimState : null;
    const def = SKILLS[st?.id ?? this.aimHover ?? ""];
    if (!def || !this.me || this.me.dead) return this.aim.clear();
    const plan: CastPlan = resolveCast(this.castInput(def, false));
    const sp = aimSpec(def), rangeOnly = !st || def.aim === "unit", shown = !rangeOnly || sp.shape === "nova";
    const units = plan.ok && shown && (sp.pick === "near" || sp.who === "ally") ? this.hitUnits() : undefined;
    const r = plan.ok ? this.aimOf(def, plan, units) : null, g = r?.g ?? null;
    const marks: { x: number; y: number; r: number }[] = [];
    if (r && units && r.hits.length) { const hit = new Set(r.hits); for (const u of units) if (hit.has(u.id)) marks.push({ x: u.x, y: u.y, r: u.r }); }
    if (g?.home && plan.ok && plan.target && shown) { const t = this.castUnit(plan.target); if (t) marks.push({ x: t.x, y: t.y, r: t.r ?? PLAYER_RADIUS }); }
    this.aim.draw(def, this.pos, plan, g, rangeOnly, marks);
  }

  pickupNearest() { this.interactNearest(); }
  talkNearest() { this.interactNearest(); }

  /** Единое взаимодействие (docs/controls.md, раздел 7): под курсором (24 px) → ближайший в 110 px по приоритету мешок, узел, NPC, камень, встреча → до 300 px с подходом. */
  private interactList() {
    type It = { rank: number; d: number; cx: number; cy: number; text: string; under?: boolean; r?: number; ref?: unknown; go: () => void };
    const out: It[] = [], hx = this.pos.x, hy = this.pos.y;
    const reset = () => { this.pendingPickup = null; this.pendingNpc = null; this.pendingGather = null; };
    for (const [id, img] of this.bagViews) {
      const d = Math.hypot(img.x - hx, img.y - hy);
      out.push({ rank: 0, d, ref: id, cx: img.x, cy: img.y - 10, text: T("ui.GameScene.261"), go: () => { reset(); this.pendingPickup = id; if (d > PICKUP_RANGE - 8) net.send("moveTo", { x: img.x, y: img.y }); } });
    }
    for (const n of this.map.nodes) {
      if (this.depletedNodes.has(n.id)) continue;
      const d = Math.hypot(n.x - hx, n.y - 14 - hy);
      out.push({ rank: 1, d, ref: n, cx: n.x, cy: n.y - 16, text: T("ui.GameScene.262", { v: RESOURCES[n.res]?.name ?? T("ui.GameScene.758") }), go: () => { reset(); this.pendingGather = n.id; if (d > ENV.gatherRange - 12) net.send("moveTo", { x: n.x, y: n.y + 26 }); } });
    }
    for (const n of this.npcs) {
      const d = Math.hypot(n.sprite.x - hx, n.sprite.y - hy);
      out.push({ ref: n, rank: n.kind === "stone" || n.kind === "door" || n.kind === "statue" || n.kind === "dgdoor" || n.kind === "dgexit" ? 3 : n.kind === "enc" ? 4 : 2, d, cx: n.sprite.x, cy: n.sprite.y - (n.hit?.dy ?? 14), r: n.hit?.r, text: n.kind === "stone" ? T("ui.GameScene.759") : n.kind === "dgdoor" ? this.dungeonHint(n.name ?? "") : n.kind === "dgexit" ? n.name ?? "" : n.kind === "door" || n.kind === "statue" ? n.name ?? T("ui.GameScene.760") : T("ui.GameScene.761", { name: n.name ?? "собеседник" }), go: () => { reset(); this.talk(n); } });
    }
    return out;
  }
  private interactPick() {
    const list = this.interactList();
    const by = (a: { rank: number; d: number }, b: { rank: number; d: number }) => a.rank - b.rank || a.d - b.d;
    if (!this.overUi) {
      // под курсором — тот же объект, что подсвечен и меняет курсор (updateHover)
      const under = this.hoverItem == null ? undefined : list.find((i) => i.ref === this.hoverItem);
      if (under) { under.under = true; return under; }
    }
    return list.filter((i) => i.d <= 110).sort(by)[0] ?? list.filter((i) => i.d <= 300).sort((a, b) => a.d - b.d)[0] ?? null;
  }
  interactNearest() {
    if (!this.me || this.me.dead) return;
    this.interactPick()?.go();
  }
  private tipAt = 0;
  private npcLast = { x: 0, y: 0 };
  private npcStill = 0;

  /** Подойти к NPC и открыть его окно. */
  /** Дальность разговора: статую на кургане или постаменте осматривают с любой стороны подножия, а не из одной точки вплотную. */
  /** Подсказка у входа в подземелье: уровень и состояние трофеев босса на сегодня («ещё 14:20» до новых). */
  private dungeonHint(name: string): string {
    const st = net.dungeon;
    if (!st) return name;
    const left = Math.max(0, st.leftMs - (Date.now() - st.at));
    return st.looted && left > 0 ? `${name} · Трофеи Повелителя Пепла уже получены — новые через ${fmtLeft(left)}` : `${name} · Трофеи Повелителя Пепла доступны сегодня`;
  }
  // дверь зала: дальность сервера (DOOR_RANGE 110) с запасом — изнутри дверь в стене в 44 px от входа, при TALK_RANGE 30 клиент вёл героя «к двери» в стену и не открывал её
  private talkRange(n: Npc) { return n.kind === "statue" ? STATUE_RANGE : n.kind === "door" ? DOOR_RANGE - 20 : TALK_RANGE; }
  talk(n: Npc) {
    const d = Math.hypot(n.sprite.x - this.pos.x, n.sprite.y - this.pos.y);
    if (d < this.talkRange(n)) {
      this.pendingNpc = null;
      this.openNpc(n);
    } else {
      this.pendingNpc = n;
      this.npcStill = 0;
      net.send("moveTo", { x: n.sprite.x, y: n.sprite.y + 20 });
    }
  }
  private openNpc(n: Npc) {
    if (n.kind === "shop") this.hud.openShop(n.name);
    else if (n.kind === "cook") this.hud.cook.open(n.id);
    else if (n.kind === "smith") this.hud.smith.open(n.id);
    else if (n.kind === "transmog") this.hud.transmog.open(n.id);
    else if (n.kind === "bank") this.hud.bank.open(n.id);
    else if (n.kind === "bags") this.hud.bags.open(n.id);
    else if (n.kind === "stable") this.hud.stable.open(n.id);
    else if (n.kind === "pets") this.hud.menagerie.open(n.id);
    else if (n.kind === "quest") this.hud.quest.open(n.id!);
    else if (n.kind === "stone") this.hud.tp.open(this.pos);
    else if (n.kind === "door") net.send("door", { id: n.id });
    else if (n.kind === "dgdoor") net.send("dungeon:enter", {});
    else if (n.kind === "dgexit") net.send("dungeon:leave", {});
    else if (n.kind === "statue") this.hud.statue.open(n.id as StatueKey);
    else if (n.kind === "rumor") this.hud.rumor.open(n.id!, n.name!);
    else if (n.kind === "enc") this.hud.enc.open(n.id!);
    else if (n.kind === "raid") this.hud.raid.open(n.id!);
    else this.hud.arena.open();
  }

  /** Камера с упреждением: плавный сдвиг followOffset на LEAD px мира по направлению бега (дельтой к текущему смещению — вступление босса и др. не ломаются).
   *  Без мёртвой зоны (давала рывки при возврате). Направление держится CAM_LEAD_HOLD с после последнего шага — пропуски шага между кадрами
   *  и остановки на изгибах пути не дёргают сдвиг туда-обратно; сглаживание по экспоненте (не зависит от fps). */
  private camLeadStep(dt: number, dir: { x: number; y: number } | null) {
    const cam = this.cameras.main, on = overlay.camLead && !this.room && net.kind !== "arena";
    if (dir) { this.camDir.x = dir.x; this.camDir.y = dir.y; this.camDirT = 0; } else this.camDirT += dt;
    // герой стоит — сдвиг не трогаем: медленный возврат при привязке камеры к целым пикселям ползёт ступеньками по 1 px (заметные рывки);
    // сдвиг меняется только на бегу, где ступеньки не видны. Выключено (настройка, зал, арена) — плавно в ноль.
    const moving = this.camDirT < CAM_LEAD_HOLD;
    if (on && !moving) return;
    const tx = on ? this.camDir.x * 30 : 0, ty = on ? this.camDir.y * 24 : 0;
    const k = 1 - Math.exp(-dt * (on ? 2.4 : 3));
    const nx = this.camLead.x + (tx - this.camLead.x) * k, ny = this.camLead.y + (ty - this.camLead.y) * k;
    cam.followOffset.x -= nx - this.camLead.x; cam.followOffset.y -= ny - this.camLead.y;
    this.camLead.x = nx; this.camLead.y = ny;
    if (this.camDead) { this.camDead = false; cam.setDeadzone(); }
  }
  private camDir = { x: 0, y: 0 };
  private camDirT = 99;
  private camLead = { x: 0, y: 0 };
  private collGrid: CollisionGrid | null = null;
  private camDead = false;
  /** Герой вошёл в зал интерьера или вышел на улицу: границы камеры, надпись зала. */
  private enterRoom(r: Interior | null) {
    if (r === this.room) return;
    this.room = r;
    const cam = this.cameras.main;
    if (r) {
      this.fitRoom();
      this.hud.showZone(r.name, CITIES.find((c) => c.id === r.city)?.name ?? "", r.style === "sol" ? "#ffd27a" : "#c08aff");
    } else cam.setBounds(0, 0, this.map.w * TILE, this.map.h * TILE);
  }
  /** Границы камеры в зале (каждый кадр: окно и масштаб меняются): по оси, где зал меньше кадра, границы — кадр с залом посередине
   *  (Phaser прижал бы зал к левому/верхнему краю), вокруг — тьма за залом; где зал больше — камера идёт за героем внутри зала. */
  private fitRoom() {
    const r = this.room;
    if (!r) return;
    const cam = this.cameras.main, vw = cam.width / cam.zoom, vh = cam.height / cam.zoom;
    const rw = r.w * TILE, rh = r.h * TILE, bw = Math.max(rw, Math.ceil(vw)), bh = Math.max(rh, Math.ceil(vh));
    const bx = Math.round(r.ox + rw / 2 - bw / 2), by = Math.round(r.oy + rh / 2 - bh / 2);
    const b = cam.getBounds();
    if (b.x !== bx || b.y !== by || b.width !== bw || b.height !== bh) cam.setBounds(bx, by, bw, bh);
  }

  /** Забрать мешок: подойти и взять всё (клик по мешку или по ряду содержимого). */
  private takeBag(id: string) {
    const img = this.bagViews.get(id);
    if (!img) return;
    this.pendingPickup = id;
    if (Math.hypot(img.x - this.pos.x, img.y - this.pos.y) > PICKUP_RANGE - 8) net.send("moveTo", { x: img.x, y: img.y });
  }

  /** Сундук зонного босса (вариант A): тряска 0,6 с после падения, затем свет и предмет вылетает вверх (ui/lootfx.ts chestReveal). */
  private chestOpen(spr: Phaser.GameObjects.Sprite, b: LootBag) {
    const best = [...b.items].sort((x, y) => y.rarity - x.rarity)[0];
    const x0 = spr.x;
    this.time.delayedCall(500, () => {
      if (!spr.active) return;
      this.tweens.add({ targets: spr, x: { from: x0 - 2, to: x0 + 2 }, angle: { from: -2, to: 2 }, duration: 60, yoyo: true, repeat: 4, ease: "Sine.easeInOut", onComplete: () => spr.setPosition(x0, spr.y).setAngle(0) });
    });
    if (!best) return;
    this.time.delayedCall(800, () => {
      if (!spr.active) return;
      const cam = this.cameras.main, r = this.game.canvas.getBoundingClientRect(), v = cam.worldView, k = cam.zoom * r.width / cam.width;
      chestReveal(this.hud.root, r.left + (spr.x - v.x) * k, r.top + (spr.y - 10 - v.y) * k, best);
    });
  }

  /** Ряд содержимого над мешком под курсором (hud.lootRow): экранная точка над макушкой спрайта. */
  private lootRowHover() {
    const id = typeof this.hoverItem === "string" && this.bagViews.has(this.hoverItem) ? this.hoverItem : null;
    const bag = id ? this.lastBags.find((b) => b.id === id) : undefined, img = id ? this.bagViews.get(id) : undefined;
    if (!bag || !img) return this.hud.lootRow.hover(null, null, 0);
    const cam = this.cameras.main, r = this.game.canvas.getBoundingClientRect(), v = cam.worldView, k = cam.zoom * r.width / cam.width;
    this.hud.lootRow.hover(bag.id, bag.items, r.left + (img.x - v.x) * k, r.top + (img.y - img.displayHeight + 12 - v.y) * k);
  }

  syncBags(bags: LootBag[]) {
    this.lastBags = bags;
    const ids = new Set(bags.map((b) => b.id));
    // убранный мешок: рядом с героем — эффект подбора (lootView.ts), иначе тихо гаснет
    for (const [id, img] of this.bagViews) if (!ids.has(id)) { removeLoot(this, img, this.pos, PICKUP_RANGE + 24); this.bagViews.delete(id); }
    for (const b of bags) {
      if (this.bagViews.has(b.id)) continue;
      // добыча: падение с отскоком и мерцание по редкости — кадры листа (lootView.ts, tools/gen/loot.ts)
      const spr = spawnLoot(this, b);
      shineOn(spr, spr.getData("rarity") ?? 0);
      this.bagViews.set(b.id, spr);
      if (b.boss) this.chestOpen(spr, b);
    }
  }

  /** Рамки подписей для разводки реплик: ники героев, горожан, стражи, мобов и имена NPC-служб; реплика их не закрывает. */
  private labelRects(): LabelRect[] {
    const out: LabelRect[] = [];
    for (const [id, v] of this.units) {
      if (!v.label.visible || v.dead) continue;
      const l = v.label, x0 = Math.min(l.x - 10, v.x - 10), x1 = Math.max(l.x + l.width, v.x + 10);
      out.push({ x0, x1, y0: v.topY - v.blockH(), y1: v.topY + 3, id });
    }
    this.npcLabels = this.npcLabels.filter((n) => n.name.active);
    for (const n of this.npcLabels) {
      const top = n.role?.active ? n.role : n.name;
      out.push({ x0: n.name.x - 11, x1: Math.max(n.name.x + n.name.width, n.role?.active ? n.role.x + n.role.width : 0), y0: top.y, y1: n.name.y + n.name.height });
    }
    return out;
  }

  say(id: string, text: string) {
    const v = this.units.get(id);
    if (!v) return;
    const old = this.bubbles.find((x) => x.id === id);
    const b = old?.b ?? new Bubble(this);
    b.owner = id;
    b.set(text);
    b.at(v.x, v.topY - v.blockH() - 2);
    if (old) old.until = this.time.now + 3500; else this.bubbles.push({ b, id, until: this.time.now + 3500 });
    // болтовня горожан, стражи и бойцов — только пузырём над головой, в чат не идёт (иначе чат тонет в «Добрый вечер»); реплики боссов и мобов — в чат
    if (v.u.kind !== UnitKind.Citizen && v.u.kind !== UnitKind.Guard && v.u.kind !== UnitKind.Soldier) this.hud.chatLine({ from: v.u.name, text, sys: false });
  }

  // ---------- кадр ----------
  override update(_time: number, deltaMs: number) {
    const dt = Math.min(0.05, deltaMs / 1000);
    // разрешение текстур мировых текстов (подписи, цифры, реплики, таблички) = масштаб камеры: тогда 1 тексель = 1 пиксель холста
    // и NEAREST не выбрасывает тексели. Сверяем здесь, а не только в fitZoom: колесо, resize и tests/screenshot.ts (setZoom напрямую) меняют zoom по-разному
    const zoom = this.cameras.main.zoom;
    if (zoom !== this.textZoom) {
      this.textZoom = zoom;
      syncTextRes(zoom);
    }
    this.updateAim();
    this.updateHover();
    this.arenaIntro?.update(this.units.values(), dt);
    this.arenaCrowd?.update(dt);
    this.world.update(this.cameras.main);
    // экран загрузки уходит, когда свой герой на месте и куски мира вокруг него построены (камера встаёт на героя кадром раньше)
    if (this.me && this.readyFrames < 3 && ++this.readyFrames === 3) loading.done();
    this.world.drift.x += dt * 6;
    this.world.drift.y += dt * 3;

    // движение своего героя: предсказание + мягкая сверка с сервером
    const me = this.me;
    const now = this.time.now;
    let mx = 0, my = 0;
    const alive = !!me && !me.dead && !this.hud.isTyping() && !this.wow?.locked;
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
      // телепорт (админка, камень, возрождение): дальний скачок — герой и камера сразу в новой точке и экран мягко проявляется из темноты, без пролёта камеры через карту
      if (Math.hypot(u.x - this.pos.x, u.y - this.pos.y) > 400) {
        this.pos = { x: u.x, y: u.y };
        this.clickGoal = null;
        const cam = this.cameras.main;
        cam.centerOn(u.x, u.y - 12);
        if (!cam.fadeEffect.isRunning) cam.fadeIn(700, 0, 0, 0); // мягкое проявление после прыжка — не мгновенно
      }
      // сервер держит героя: оглушение, корни, страх (ведёт сервер), канал (castHold), заморозка арены до боя
      const arenaPhase = net.kind === "arena" ? (net.room?.state as { phase?: string } | undefined)?.phase : "fight";
      const blocked = u.buffs & (BUFF_STUN | BUFF_ROOT | BUFF_FEAR) || u.anim === Anim.Dead || now < this.castHold || arenaPhase !== "fight";
      const g = this.clickGoal;
      if (g && (blocked || moving || (now - g.at > 600 && u.anim !== Anim.Walk))) this.clickGoal = null;
      let vx = 0, vy = 0;
      const sp = PLAYER_SPEED * (MOUNTS[u.mount]?.speed ?? 1) * (u.buffs & BUFF_SLOW ? slowMul(u.slowPct ?? 0) : 1) * terrainSpeedMul(this.map, this.pos.x, this.pos.y) * dt;
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
        // в мире — ещё и ворота городов (shared/siege.ts): чужие упираются в закрытые, как на сервере
        const n = net.kind === "world" && this.siegeView ? moveGated(this.map, this.pos.x, this.pos.y, vx * step, vy * step, PLAYER_RADIUS, net.self?.faction ?? "") : moveWithCollision(this.map, this.pos.x, this.pos.y, vx * step, vy * step, PLAYER_RADIUS);
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
      this.camLeadStep(dt, (vx || vy) && step > 0 ? { x: vx, y: vy } : null);
      (this.collGrid ??= new CollisionGrid(this, this.map)).update(this.pos.x, this.pos.y);
    }
    if (now >= this.cullAt) { this.cullAt = now + 400; this.cullUnits(); }
    for (const [id, v] of this.units) {
      if (id !== net.id) v.update(dt);
      // шаги и звон доспехов идущей стражи рядом (до ~20 тайлов, громкость по расстоянию)
      if ((v.u.kind === UnitKind.Guard || v.u.kind === UnitKind.Soldier) && v.u.anim === Anim.Walk && !v.dead && now >= v.stepAt) {
        const k = 1 - Math.hypot(v.x - this.pos.x, v.y - this.pos.y) / 640;
        v.stepAt = now + 330 + Math.random() * 60;
        if (k > 0.03) { sfx.play("step", k * 0.8); if (Math.random() < 0.28) sfx.play("clink", k * 0.7); }
      }
    }
    if (now >= this.layoutAt) {
      this.layoutAt = now + 100;
      this.fx.heroes = layoutLabels(this.units, net.id, this.targetId, new Set(net.party?.members.map((m) => m.name) ?? []), this.cameras.main.worldView);
    }
    this.scenes?.update(this.pos.x, this.pos.y);
    if (this.targetId && !this.units.get(this.targetId)) this.targetId = null;
    // далеко убежал от цели (за пределы экрана с запасом) — цель сбрасывается, как в MMO; свою цель (себя) не трогаем
    if (this.targetId && this.targetId !== net.id) {
      const tv = this.units.get(this.targetId);
      if (tv && Math.hypot(tv.x - this.pos.x, tv.y - this.pos.y) > TARGET_DROP_PX) this.setTarget(null);
    }

    // подсказка взаимодействия над ближайшим объектом (с клавишей из раскладки)
    if (now >= this.tipAt) {
      this.tipAt = now + 100;
      // не подсказываем, пока герой уже занят: каст или канал (телепорт, сбор), открыто окно NPC или другое окно поверх мира
      const busy = now < this.castHold || !!document.querySelector("#ui .win:not([hidden]):not(.win-help), #ui .dialog, .cb-self:not([hidden])"); // .cb-self — любая полоса каста героя (телепорт камня, сбор, призыв)
      const it = alive && !busy ? this.interactPick() : null;
      const key = keybinds.label("talk", 0) || keybinds.label("interact", 0);
      this.hud.setInteractTip(it && (it.d <= 110 || it.under) ? `${key ? `[${key}] ` : ""}${it.text}` : null);
    }

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
      const n = this.pendingNpc, d = Math.hypot(n.sprite.x - this.pos.x, n.sprite.y - this.pos.y);
      // вплотную; если путь упёрся (прилавок, стена) — с того места, где герой встал, в пределах сервера
      const still = Math.hypot(this.pos.x - this.npcLast.x, this.pos.y - this.npcLast.y) < 0.5;
      this.npcStill = still ? this.npcStill + 1 : 0;
      this.npcLast = { x: this.pos.x, y: this.pos.y };
      if (d < this.talkRange(n) || (this.npcStill > 20 && d < MERCHANT_RANGE - 10)) {
        this.pendingNpc = null;
        this.openNpc(n);
      }
    }

    // реплики
    this.bubbles = this.bubbles.filter((b) => {
      const v = this.units.get(b.id);
      if (!v || now > b.until) { b.b.close(); return false; }
      b.b.at(v.x, v.topY - v.blockH() - 2); // каждый кадр: юнит движется
      return true;
    });

    // зал интерьера (задача 144): камера ограничена залом, своё освещение
    const ar = this.arrive;
    if (ar && me && (Math.hypot(me.u.x - ar.x, me.u.y - ar.y) < 6 || now - ar.at > 1500)) {
      this.arrive = null;
      this.pos = { x: me.u.x, y: me.u.y };
      me.update(0, this.pos.x, this.pos.y);
      this.enterRoom(interiorAt(this.pos.x, this.pos.y));
      this.fadeSeq++;
      this.cameras.main.centerOn(this.pos.x, this.pos.y - 12).fadeIn(320, 0, 0, 0);
    }
    if (this.interiors) { const r = interiorAt(this.pos.x, this.pos.y); if (r !== this.room) this.enterRoom(r); else this.fitRoom(); }
    // зона: название, затемнение
    const z = zoneAtPx(this.map, this.pos.x, this.pos.y);
    if (z !== this.zone) {
      this.zone = z;
      if (z === Zone.Arena) this.hud.showZone(T("ui.GameScene.762", { v1: MODE_NAMES[net.arena?.mode ?? "1v1"] }), T("ui.GameScene.763"));
      else {
        // фракции: спорная зона (PvP с противоположной фракцией) и нейтральный город (бой запрещён)
        const place = net.kind === "world" || net.kind === "dungeon" ? pvpPlace(this.map, this.pos.x, this.pos.y) : "peace";
        // опасность (кольцо 40–80 — «Небезопасная зона», Поля — «Опасная зона») или земли фракции, затем уровни — как на карте мира и миникарте
        const lv = T("ui.GameScene.764", { levels: ZONES[z].levels[0], levels2: ZONES[z].levels[1] }), land = zoneLand(z);
        const tag = zoneDanger(z) ?? (land ? landLabel(land) : null);
        const base = ZONES[z].note ?? (ZONES[z].safe ? T("ui.GameScene.765") : tag ? `${tag} · ${lv.toLowerCase()}` : lv);
        const cap = z === Zone.SolgardCity ? "solgard" : z === Zone.UmbrathCity ? "umbrath" : null;
        const sub = cap ? (net.self?.faction === cap ? T("ui.GameScene.766") : T("ui.GameScene.767"))
          : place === "pvp" ? T("ui.GameScene.768", { base: base }) : place === "neutral" ? T("ui.GameScene.769") : base;
        this.hud.showZone(ZONES[z].name, sub, place === "pvp" ? "#ff7a5a" : ZONE_COLOR[z] ?? ZONE_COLOR[zoneStyle(z)]);
      }
    }
    const cam = this.cameras.main;
    const tint = zoneTint(z);
    // ночь (общий цикл по часам): затемнение и синева на поверхности, не в подземельях/арене/под водой
    const zs = zoneStyle(z);
    const night = net.kind === "arena" || z === Zone.Dungeon || z === Zone.Arena || zs === Zone.Volcano ? 0 : nightLevel(Date.now()); // на PvP-арене ночи нет
    setLightMode(this.room || z === Zone.Arena || z === Zone.Dungeon ? "none" : "sun"); // длинные тени (game/shadows.ts) только под открытым небом
    // в зале — своё затемнение: днём почти нет (свет из окон), ночью мягче улицы (свечи и огонь)
    // золотой час вечера и рассвет: тёплый оттенок поверх мира, плавно переходит в ночную синеву
    const warm = night === 0 && (net.kind === "arena" || z === Zone.Dungeon || z === Zone.Arena || zs === Zone.Volcano) ? 0 : this.room ? 0 : warmLevel(Date.now());
    // темнота нарастает медленно в начале сумерек и полностью наступает только к ночи (кривая night², а не линейно): сумерки — это ещё светло, с тёплым закатом
    const dk = night * night;
    const target = net.kind === "arena" ? 0 : this.room ? this.room.dark + dk * 0.1 : Math.min(0.42, Math.max(tint.dark, dk * 0.36, warm * 0.12) + this.weather.dim); // общий предел темноты вне света 0,42 (жалобы «слишком темно»); в зданиях ночью светло: чуть темнее, чем днём
    this.interiors?.update(dt, night, this.room);
    this.towerArchers?.update(dt);
    this.fortScenes?.update(dt, this.pos.x, this.pos.y);
    this.bannerBases?.update(dt, this.cameras.main.midPoint.x, this.cameras.main.midPoint.y);
    this.siegeView?.update(dt, this.cameras.main.midPoint.x, this.cameras.main.midPoint.y);
    const dark = this.world.dark;
    const base = Phaser.Display.Color.Interpolate.ColorWithColor(Phaser.Display.Color.IntegerToColor(tint.color), Phaser.Display.Color.IntegerToColor(0x7a3a10), 100, Math.round(warm * (1 - night) * 100)); // вечером — янтарь
    const nc = Phaser.Display.Color.Interpolate.ColorWithColor(Phaser.Display.Color.ObjectToColor(base), Phaser.Display.Color.IntegerToColor(0x060a28), 100, Math.round(dk * 100));
    // цвет дымки зоны (снежная синева, пустынный жар) меняется так же плавно, как её плотность, а не скачком на границе
    const k = Math.min(1, dt * 2), c0 = (this.hazeRGB ??= [nc.r, nc.g, nc.b]);
    c0[0] += (nc.r - c0[0]) * k; c0[1] += (nc.g - c0[1]) * k; c0[2] += (nc.b - c0[2]) * k;
    dark.setFillStyle(Phaser.Display.Color.GetColor(Math.round(c0[0]), Math.round(c0[1]), Math.round(c0[2])), 1);
    sfx.setAmbience(AMBIENCE[z] ?? AMBIENCE[zs] ?? null);
    dark.setSize(cam.width / cam.zoom + 4, cam.height / cam.zoom + 4).setPosition(-2, -2);
    dark.setAlpha(dark.alpha + (target - dark.alpha) * Math.min(1, dt * 2));
    dark.setDisplayOrigin(0, 0);
    dark.setScrollFactor(0);
    dark.x = (cam.width - cam.width / cam.zoom) / 2 - 2;
    dark.y = (cam.height - cam.height / cam.zoom) / 2 - 2;

    this.updateAmbient(z, dt);
    const lit = this.room || z === Zone.Dungeon || z === Zone.Arena || zs === Zone.Volcano;
    updateLights(this.time.now, lit ? 1 : night, this.cameras.main.worldView);
    this.weather.update(dt, zs, !!this.room);
    this.wow?.update(deltaMs, { zone: zs, indoor: !!this.room, night: lit ? 0 : night });
    this.postfx.update(dt, me && me.u.maxHp > 0 && !me.dead ? me.u.hp / me.u.maxHp : 1, lit ? 0 : night, zs, !!me?.dead);
    shaderEnv.night = lit ? 0 : night; shaderEnv.rain = Math.min(1, this.weather.dim * 20); // среда шейдеров воды (waterLava.ts)
    // ночь вырезается светом факелов (lights.ts); на «Простых» остаётся плоское затемнение
    // маска — только от НОЧИ, не от дымки зоны: у Полей, топей, курганов своя дымка 0,2 днём, и маска включалась бы среди дня
    this.nightMask.update(this.room || net.kind === "arena" ? 0 : Math.min(dark.alpha, dk * 0.36 + this.weather.dim), this.pos, 240, 0.9); // круг вокруг героя шире
    dark.setVisible(!this.nightMask.active);
    this.hud.frame({
      me: me?.u ?? null,
      target: this.targetId ? (this.units.get(this.targetId)?.u ?? null) : null,
      targetId: this.targetId,
      // в зале миникарта и карта мира показывают героя у двери здания
      pos: this.room ? this.room.outSpot : this.pos,
      units: this.units,
    });
  }
}

export { SKILLS };
