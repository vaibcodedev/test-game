/**
 * Построение мира в Phaser: анимированная вода, слои поверхностей (dual grid), стены, объекты и огни.
 * Мир делится на куски CHUNK×CHUNK тайлов: тайлы и объекты создаются только рядом с камерой,
 * поэтому большая карта не держит сотни тысяч Phaser-тайлов и тысячи спрайтов разом.
 */
import Phaser from "phaser";
import { TILE } from "../../../shared/constants";
import { GROUND_OBJECTS, SHORE_GID, TERRAIN_COUNT, Zone, zoneStyle, type MapObject, type WorldMap } from "../../../shared/map";
import { FLIP_TREES, SWAY_TREES } from "../../../shared/decor";
import { CHUNK, cellHash, chunkRect, chunkRows, shoreSpillLayer, terrainLayers } from "./terrainTiles";
import { placeText, worldText } from "./worldText";
import { NO_SHADOW, Shadow, SHADOW_DEPTH, shadowTick, WALL_KINDS, WallShadow, type WallTile } from "./shadows";
import * as sfx from "./sfx";
import { DUNGEON_GATES } from "../../../shared/dungeon";
import { trackLight } from "./lights";
import { addTreeFade, addBuildingFade, FADE_BUILDINGS } from "./treeFade";
import { glowOn } from "./postfx";
import { objAo, objFoot, objHas, objId, objTex, setObj } from "./objTex";
import { setupWaterLava } from "./waterLava";

/** Ворота данжа «Пепельные чертоги»: состояние (id → открыты) приходит с сервера (DungeonRoom: dg:gate, dg:gates); створки на экране плавно доходят до него. */
export const dgGateOpen = new Map<string, boolean>();
/** Отладка/съёмка: принудительный кадр створок (id → 0..7), см. tools/gen/dungeon-shots.ts. */
export const dgGateForce = new Map<string, number>();
if (typeof window !== "undefined") (window as unknown as { __dgGateForce: Map<string, number> }).__dgGateForce = dgGateForce;
interface DgGate { img: Phaser.GameObjects.Image; id: string; prefix: string; t: number }

export const DEPTH = { water: -1000, terrain: -900, walls: -800, overlay: -700, ground: -600, top: 1e6 };

export interface WorldView {
  water: Phaser.GameObjects.TileSprite;
  /** Смещение течения воды (меняется сценой каждый кадр). */
  drift: { x: number; y: number };
  dark: Phaser.GameObjects.Rectangle;
  macro: Phaser.GameObjects.TileSprite;
  /** Узел добычи появился (true) или исчерпан (false). */
  setNode(id: number, up: boolean): void;
  /** Картинка узла добычи (попадание мышью по силуэту); кусок не загружен или узел исчерпан — undefined. */
  nodeImage(id: number): Phaser.GameObjects.Image | undefined;
  /** Подгрузка и выгрузка кусков мира вокруг камеры (каждый кадр, дёшево). */
  update(cam: Phaser.Cameras.Scene2D.Camera): void;
}

/** Ячейка куска CELL×CELL тайлов для отсечения: её объекты в списке отрисовки, только пока ячейка в кадре. */
interface Cell {
  objs: Phaser.GameObjects.GameObject[];
  /** Твины объектов ячейки (покачивание, мерцание огней): на паузе вне кадра. */
  tweens: Phaser.Tweens.Tween[];
  /** Рамка всего, что рисуют объекты ячейки (здания и кроны торчат за её край), в пикселях мира. */
  box: { x0: number; y0: number; x1: number; y1: number };
  shown: boolean;
}

interface Chunk {
  tm: Phaser.Tilemaps.Tilemap;
  objs: Phaser.GameObjects.GameObject[];
  nodes: number[];
  tweens: Phaser.Tweens.Tween[];
  cells: Cell[];
}

/** Размер ячейки отсечения в тайлах (кусок — 4×4 ячейки): кадр задевает 6–12 ячеек вместо 1–4 целых кусков. */
const CELL = 8;
/** Огонь мира (tools/gen/fire.ts): вид объекта карты → свой лист огня с основой (угли, поленья, камни/чаша). Виды карты прежние — их знают правила декора и гарь. */
/** Плоское и мелкое на земле: без подложки-контакта. */
const AO_SKIP = new Set(["flowers", "tallgrass", "fern", "reeds", "lilypad", "bones", "ember_vent", "mushrooms", "mushrooms_glow"]);
/** Мягкий тёмный эллипс контакта (растягивается по ширине основания). */
function aoTexture(scene: Phaser.Scene) {
  const c = scene.textures.createCanvas("fx_ao", 32, 8)!, g = c.getContext();
  const grd = g.createRadialGradient(16, 4, 0, 16, 4, 16);
  grd.addColorStop(0, "rgba(12,8,18,0.62)"); grd.addColorStop(0.6, "rgba(12,8,18,0.42)"); grd.addColorStop(1, "rgba(12,8,18,0)");
  g.setTransform(1, 0, 0, 0.25, 0, 3); g.fillStyle = grd; g.fillRect(0, -12, 32, 32);
  c.refresh();
}
const FIRE_SHEET: Record<string, string> = { "bf-fire-s": "fire-ground", "bf-fire-m": "fire-pile", campfire: "fire-camp", brazier: "fire-brazier" };

/** Крупный бесшовный шум для разбивки повторяемости тайлов (рисуется поверх земли). */
function macroNoise(scene: Phaser.Scene) {
  const S = 256;
  if (scene.textures.exists("macro")) return; // уже создана при прошлом запуске сцены
  const tex = scene.textures.createCanvas("macro", S, S)!;
  const ctx = tex.getContext();
  const img = ctx.createImageData(S, S);
  const g = (x: number, y: number, c: number) => cellHash(((x % c) + c) % c, ((y % c) + c) % c);
  const vn = (x: number, y: number, cell: number) => {
    const n = S / cell, fx = x / cell, fy = y / cell, x0 = Math.floor(fx), y0 = Math.floor(fy);
    const tx = fx - x0, ty = fy - y0, sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const a = g(x0, y0, n), b = g(x0 + 1, y0, n), c = g(x0, y0 + 1, n), d = g(x0 + 1, y0 + 1, n);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const n = vn(x, y, 64) * 0.65 + vn(x, y, 32) * 0.35;
    const i = (y * S + x) * 4;
    const dark = n < 0.5;
    img.data[i] = dark ? 0 : 255; img.data[i + 1] = dark ? 0 : 250; img.data[i + 2] = dark ? 10 : 200;
    img.data[i + 3] = Math.round(Math.abs(n - 0.5) * 2 * 60);
  }
  ctx.putImageData(img, 0, 0);
  tex.refresh();
}

export function buildWorld(scene: Phaser.Scene, m: WorldMap): WorldView {
  const W = m.w * TILE, H = m.h * TILE;
  // вода и шум размером с экран и следуют за камерой: текстура на всю карту превысила бы предел WebGL
  const water = scene.add.tileSprite(0, 0, 16, 16, "water").setOrigin(0).setDepth(DEPTH.water);
  const drift = { x: 0, y: 0 };

  // индексы тайлов всех слоёв считаются один раз (слой 0 — стены данжа, 1..TERRAIN_COUNT−1 — поверхности; terrainTiles.ts, офлайн — tests/terrain-tiles.ts)
  const layers = terrainLayers(m);
  const spill = shoreSpillLayer(m); // низ стенок берега в клетке под берегом (над водой, под сушей)

  const wl = setupWaterLava(scene, m, water, !!layers[1]);
  macroNoise(scene);
  const macro = scene.add.tileSprite(0, 0, 16, 16, "macro").setOrigin(0).setDepth(DEPTH.overlay).setAlpha(0.6);
  const follow = (v: Phaser.Geom.Rectangle) => {
    const pad = 64, x = Math.floor(v.x) - pad, y = Math.floor(v.y) - pad, w = Math.ceil(v.width) + pad * 2, h = Math.ceil(v.height) + pad * 2;
    if (water.width !== w || water.height !== h) { water.setSize(w, h); macro.setSize(w, h); }
    water.setPosition(x, y).setTilePosition(x + drift.x, y + drift.y);
    // шум только в пределах карты, чтобы не ложиться на воду за краем
    const mx = Math.max(0, x), my = Math.max(0, y);
    macro.setPosition(mx, my).setTilePosition(mx, my);
    macro.setSize(Math.max(1, Math.min(x + w, W) - mx), Math.max(1, Math.min(y + h, H) - my));
  };

  // объекты раскладываются по кускам по опорной точке
  const NX = Math.ceil(m.w / CHUNK), NY = Math.ceil(m.h / CHUNK);
  const buckets: MapObject[][] = Array.from({ length: NX * NY }, () => []);
  for (const o of m.objects) {
    const cx = Math.max(0, Math.min(NX - 1, Math.floor(o.x / TILE / CHUNK)));
    const cy = Math.max(0, Math.min(NY - 1, Math.floor((o.y - 1) / TILE / CHUNK)));
    buckets[cy * NX + cx].push(o);
  }

  /** Куда складывать твины создаваемых объектов (покачивание деревьев, мерцание огней, свечение узлов): createChunk подставляет список ячейки, чтобы ставить их на паузу вне кадра. */
  let chunkTweens: Phaser.Tweens.Tween[] = [];
  const tween = (cfg: Phaser.Types.Tweens.TweenBuilderConfig) => { chunkTweens.push(scene.tweens.add(cfg)); };
  const glow = (objs: Phaser.GameObjects.GameObject[], x: number, y: number, color: number, scale: number, alpha: number, flicker = false) => {
    const g = scene.add.image(x, y, "fx_glow").setBlendMode(Phaser.BlendModes.ADD).setTint(color).setScale(scale).setAlpha(alpha).setDepth(DEPTH.top - 10);
    objs.push(g);
    trackLight(g, scale, alpha, flicker); // свет по времени суток и вырезы в ночной маске (lights.ts)
    if (flicker) tween({ targets: g, alpha: { from: alpha * 0.7, to: alpha * 1.1 }, scale: { from: scale * 0.92, to: scale * 1.05 }, duration: 160 + Math.random() * 220, yoyo: true, repeat: -1 });
  };
  // узлы добычи: картинка и свечение прячутся, пока ресурс исчерпан
  const nodeOf = new Map<MapObject, number>(m.nodes.map((n) => [m.objects[n.id], n.id]));
  const nodeObjs = new Map<number, Phaser.GameObjects.GameObject[]>();
  const dgGates = new Set<DgGate>();
  const depleted = new Set<number>();
  const NODE_GLOW: Record<string, number> = { node_cactus: 0xc8ff8a, node_ice: 0x9ae0ff, node_obsidian: 0xff7a2a, node_pearl: 0xe8d8ff };
  // анимированные объекты (огонь, горны, манекены, осадные машины, повреждённые штандарты — задача 132, шаг 10): вид объекта = id листа
  // из vfx/manifest.json (tools/gen/battlefield.ts, tools/gen/standards-to-game.ts); цикл с кадра по хэшу места, чтобы соседние не шли в такт
  const vfxCat = (scene.cache.json.get("vfxm") ?? {}) as Record<string, { anchor: [number, number]; frames: number }>;
  const makeImage = (o: MapObject): Phaser.GameObjects.Image | Phaser.GameObjects.Sprite => {
    const e = vfxCat[o.kind];
    if (e && !objHas(scene, o.kind) && scene.anims.exists(`vfx_${o.kind}`)) {
      const s = scene.add.sprite(o.x, o.y, `vfx_${o.kind}`).setOrigin(o.flip ? 1 - e.anchor[0] : e.anchor[0], e.anchor[1]);
      s.play({ key: `vfx_${o.kind}`, repeat: -1, startFrame: Math.floor(cellHash(o.x, o.y) * e.frames) % e.frames });
      return s.setFlipX(!!o.flip);
    }
    // вариант вида (задача 141, shared/cityart.ts): кадр <kind>__<v>, без него — общий кадр вида (атлас или o_<id> — game/objTex.ts)
    const id = o.v && objHas(scene, `${o.kind}__${o.v}`) ? `${o.kind}__${o.v}` : o.kind;
    return scene.add.image(o.x, o.y, ...objTex(id)).setOrigin(0.5, 1).setFlipX(!!o.flip);
  };
  /** Тайлы стены текущего куска: их тени склеиваются в полосы по прямым участкам (shadows.ts WallShadow). */
  let wallTiles: WallTile[] | null = null;
  const wallShadows = (tiles: WallTile[], objs: Phaser.GameObjects.GameObject[]) => {
    const run = (key: (t: WallTile) => number, pos: (t: WallTile) => number) => {
      const by = new Map<number, WallTile[]>();
      for (const t of tiles) { const k = key(t); (by.get(k) ?? by.set(k, []).get(k)!).push(t); }
      for (const g of by.values()) {
        g.sort((a, b) => pos(a) - pos(b));
        let cur: WallTile[] = [];
        const flush = () => { if (cur.length) objs.push(new WallShadow(scene, cur).box); cur = []; };
        for (const t of g) { if (cur.length && (pos(t) - pos(cur[cur.length - 1]) > TILE * 1.5 || cur.length >= 24)) flush(); cur.push(t); }
        flush();
      }
    };
    const isH = (t: WallTile) => !!objId(t.img)?.includes("wall_h");
    const hs = tiles.filter(isH), vs = tiles.filter((t) => !isH(t));
    tiles = hs; run((t) => t.y, (t) => t.x);
    tiles = vs; run((t) => t.x, (t) => t.y);
  };
  const makeObject = (o: MapObject, objs: Phaser.GameObjects.GameObject[]) => {
    const fireSheet = FIRE_SHEET[o.kind];
    if (fireSheet && scene.anims.exists(`vfx_${fireSheet}`)) o = { ...o, kind: fireSheet };
    const img = makeImage(o);
    objs.push(img);
    // основание кадра (manifest.foot, tools/gen/object-feet.ts): опора — нижняя кромка основания, а не низ кадра с пустыми рядами;
    // картинка на карте остаётся на месте, длинная тень и глубина — от основания (иначе объект «парит», docs/art-perspective.md §4)
    const oid = img.type === "Image" ? objId(img as Phaser.GameObjects.Image) : null;
    const old = (window as unknown as { __perspOld?: boolean }).__perspOld; // снимки «было» (tools/fix-shots.ts)
    const foot = oid && !old && !WALL_KINDS.has(o.kind) ? objFoot(oid) : 0;
    if (foot) img.setOrigin(img.originX, 1 - foot / img.height).setY(o.y - foot);
    const by = o.y - foot;
    // контакт с землёй у кадров без запечённой тени (статуи, кристаллы, фонтан, паки): мягкая тёмная полоса под основанием
    const ao = oid && !old && !AO_SKIP.has(o.kind) && !GROUND_OBJECTS.has(o.kind) ? objAo(oid) : undefined;
    if (ao) {
      if (!scene.textures.exists("fx_ao")) aoTexture(scene);
      const w = img.width, cx = (ao[0] + ao[1] + 1) / 2 - w / 2;
      objs.push(scene.add.image(o.x + (o.flip ? -cx : cx), by + 0.5, "fx_ao").setDisplaySize(ao[1] - ao[0] + 5, 5).setDepth(SHADOW_DEPTH + 1));
    }
    // динамическая тень из собственного кадра (game/shadows.ts): не для лежащего на земле и низкого; анимированным — по кадру анимации
    if (wallTiles && WALL_KINDS.has(o.kind) && img.type === "Image") wallTiles.push({ img: img as Phaser.GameObjects.Image, x: o.x, y: o.y });
    else if (img.type === "Image" && (img as Phaser.GameObjects.Image).height >= 20 && !NO_SHADOW.has(o.kind) && !GROUND_OBJECTS.has(o.kind)) {
      const sh = new Shadow(scene, o.x, by);
      sh.mirror(0, img as Phaser.GameObjects.Image, 0, 0);
      objs.push(sh.box);
    } else if (!old && img.type === "Sprite" && img.height >= 20 && !NO_SHADOW.has(o.kind) && !GROUND_OBJECTS.has(o.kind) && !/fire|smoke|flame|vent|beam/.test(o.kind)) {
      // знамёна, обереги, осадные машины: тень повторяет текущий кадр анимации
      const sp = img as Phaser.GameObjects.Sprite, sh = new Shadow(scene, o.x, o.y);
      sh.mirror(0, sp, 0, 0);
      sp.on(Phaser.Animations.Events.ANIMATION_UPDATE, () => sh.mirror(0, sp, 0, 0));
      objs.push(sh.box);
    }
    if (o.kind === "lilypad" || GROUND_OBJECTS.has(o.kind)) img.setDepth(DEPTH.ground - (GROUND_OBJECTS.has(o.kind) ? 1 : 0));
    else if (o.kind === "flowers" || o.kind === "tallgrass" || o.kind === "bones" || o.kind === "ember_vent") img.setDepth(o.y - 20);
    else img.setDepth(by + (o.dz ?? 0));
    if (SWAY_TREES.has(o.kind)) {
      // лёгкое покачивание крон (деревья Basic из shared/decor.ts)
      const sway = (cellHash(o.x, o.y) - 0.5) * 0.04;
      tween({ targets: img, angle: { from: -1 + sway, to: 1 + sway }, duration: 2400 + cellHash(o.y, o.x) * 1600, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
      if (FLIP_TREES.has(o.kind)) img.setFlipX(cellHash(o.x, o.y) > 0.5);
    }
    // полупрозрачная крона, когда герой за деревом: у деревьев nature3d есть кадр ствола <id>_trunk (treeFade.ts)
    if (oid && objHas(scene, `${oid}_trunk`)) objs.push(addTreeFade(scene, img as Phaser.GameObjects.Image, `${oid}_trunk`));
    if (FADE_BUILDINGS.has(o.kind) && img.type === "Image") addBuildingFade(img as Phaser.GameObjects.Image); // здание полупрозрачно, когда герой за ним (treeFade.ts)
    const nid = nodeOf.get(o);
    if (nid !== undefined) {
      const mine: Phaser.GameObjects.GameObject[] = [img];
      glow(mine, o.x, o.y - 14, NODE_GLOW[o.kind] ?? 0xffffff, 1.1, 0.4);
      tween({ targets: mine[1], alpha: { from: 0.2, to: 0.5 }, duration: 900 + (nid % 7) * 90, yoyo: true, repeat: -1 });
      objs.push(mine[1]);
      nodeObjs.set(nid, mine);
      if (depleted.has(nid)) for (const g of mine) (g as Phaser.GameObjects.Image).setVisible(false);
    }
    // указатель: надпись с направлениями над столбом
    if (o.label) objs.push(placeText(worldText(scene, 0, 0, o.label, "plain", { fontSize: "8px", color: "#ffe8b0", stroke: "#1a0e08", strokeThickness: 3, align: "center", wordWrap: { width: 190 } }).setDepth(o.y + 1), o.x, o.y - 50, 0.5, 1));
    if (o.kind === "soul_brazier") glow(objs, o.x, o.y - 26, 0xb46aff, 2.6, 0.6, true);
    if (o.kind === "dark_obelisk") glow(objs, o.x, o.y - 50, 0x9a4aff, 1.8, 0.45, true);
    if (o.kind === "ice_spike") glow(objs, o.x, o.y - 16, 0x7cd8ff, 1.0, 0.22); // слабый голубой ореол льдины (ночью ярче, lights.ts)
    // анимированный огонь жаровен статуй (tools/gen/statues.ts writeStatueFire): листы statue-fire-sol/umb поверх кадра
    if ((o.kind === "sun_statue" || o.kind === "umb_statue") && scene.anims.exists(`vfx_statue-fire-${o.kind === "sun_statue" ? "sol" : "umb"}`)) {
      const key = `vfx_statue-fire-${o.kind === "sun_statue" ? "sol" : "umb"}`;
      for (const [dx, dy] of [[-20, -25], [19, -26]]) { const f = scene.add.sprite(o.x + dx, o.y + dy, key).setOrigin(0.5, 1).setDepth(o.y + 1); f.play({ key, repeat: -1, startFrame: Math.floor(cellHash(o.x + dx, o.y) * 6) % 6 }); objs.push(f); }
    }
    // данж (задача 139): свечи и алтарь собора, витражи, жаровни, решётки, лава в склепе, арки и ворота
    if (o.kind.startsWith("dg_")) {
      const k = o.kind;
      if (k.startsWith("dg_candles")) glow(objs, o.x, o.y - 10, 0xffc060, 0.9, 0.5, true);
      else if (k === "dg_altar_c") glow(objs, o.x, o.y - 40, 0xffb858, 2.2, 0.5, true);
      else if (k.startsWith("dg_brazier")) glow(objs, o.x, o.y - 28, 0xff9a40, 2.4, 0.6, true);
      else if (k === "dg_window_c_a") glow(objs, o.x, o.y - 14, 0xc04a8a, 1.2, 0.32);
      else if (k === "dg_window_c_b") glow(objs, o.x, o.y - 14, 0x4a8ac0, 1.2, 0.32);
      else if (k.startsWith("dg_grate")) glow(objs, o.x, o.y - 10, 0xff7a30, 1.2, 0.5, true);
      else if (k === "dg_entrance") { glow(objs, o.x, o.y - 40, 0xff5a20, 3.2, 0.5, true); glow(objs, o.x - 66, o.y - 40, 0xff7a30, 1.6, 0.4, true); glow(objs, o.x + 66, o.y - 40, 0xff7a30, 1.6, 0.4, true); }
      else if (k === "dg_exit") {
        // свой источник света (аддитивное свечение выше ночного затемнения): проём и конус на ступенях не гаснут ночью
        glow(objs, o.x, o.y - 118, 0xffe2a0, 3.6, 0.65);
        glow(objs, o.x, o.y - 60, 0xffd890, 3.0, 0.4);
        glow(objs, o.x, o.y - 18, 0xffcc80, 2.2, 0.26);
        // пылинки в луче дневного света из проёма: медленно плывут вниз по конусу, мерцают (твины на кадр, ≥12 fps)
        for (let i = 0; i < 16; i++) {
          const h = cellHash(o.x + i * 7, o.y + i * 13), x0 = o.x + (h - 0.5) * 70, y0 = o.y - 110 + cellHash(i, o.x) * 70;
          const d = scene.add.rectangle(Math.round(x0), Math.round(y0), 2, 2, 0xffecc0, 0).setDepth(o.y + 2);
          tween({ targets: d, y: Math.round(y0 + 36 + h * 20), x: Math.round(x0 + (h - 0.5) * 16), alpha: { from: 0, to: 0.38 }, duration: 4200 + h * 4000, delay: h * 3000, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
          objs.push(d);
        }
      }
      else if (k === "dg_door_w" || k === "dg_port") {
        if (k === "dg_port") glow(objs, o.x, o.y - 22, 0xff7a30, 2.0, 0.35, true);
        const gate = DUNGEON_GATES.find((q) => Math.abs(q.cx - o.x) < 2 && Math.abs(q.cy + 16 - o.y) < 40);
        if (gate) {
          const g: DgGate = { img: img as Phaser.GameObjects.Image, id: gate.id, prefix: k, t: dgGateOpen.get(gate.id) ? 1 : 0 };
          dgGates.add(g);
          img.setDepth(o.y - 3);
          setObj(img as Phaser.GameObjects.Image, `${k}_${g.t ? 7 : 0}`);
          img.once("destroy", () => dgGates.delete(g));
        }
      }
      else if (k === "dg_arch_t") glow(objs, o.x, o.y - 30, 0xff7a30, 1.8, 0.3, true);
      else if (k === "dg_arch_c") glow(objs, o.x, o.y - 30, 0x4aa0c8, 2.0, 0.3);
      else if (k === "dg_dais") {
        // помост под боссом: мягкое свечение круга и тёплые световые пятна вокруг — контраст вместо тёмной плоскости
        glow(objs, o.x, o.y - 85, 0xff7a30, 4.2, 0.4, true);
        for (const [dx, dy] of [[-150, -70], [150, -70], [-110, -120], [110, -120]]) glow(objs, o.x + dx, o.y + dy, 0xff9a40, 2.2, 0.16);
      }
      else if (k === "dg_pillar_a_a" || k === "dg_pillar_a_b" || k === "dg_pillar_a_c" || k === "dg_pillar_a_d") glow(objs, o.x, o.y - 40, 0xff7a30, 1.3, 0.35, true);
      else if (k === "dg_sarc_a_b" || k === "dg_sarc_t_a" || k === "dg_pillar_t_a" || k === "dg_pillar_t_b") glow(objs, o.x, o.y - 18, 0xff7a30, 1.2, 0.3, true);
    }
    if (o.kind === "sun_statue") glow(objs, o.x - 15, o.y - 138, 0xffe08a, 1.0, 0.3, true);
    if (o.kind === "umb_statue") glow(objs, o.x, o.y - 146, 0xa060ff, 1.1, 0.3, true);
    // здания с входом (задача 141): купол и свет из двери храма Солнца, фиолетовый огонь вершины и портал зиккурата
    if (o.kind === "sol_church") { glow(objs, o.x + 7, o.y - 150, 0xffd860, 2.2, 0.35); glow(objs, o.x - 9, o.y - 24, 0xffcf6a, 1.6, 0.45); }
    if (o.kind === "umb_ziggurat") { glow(objs, o.x - 2, o.y - 190, 0xb46aff, 2.4, 0.55, true); glow(objs, o.x - 9, o.y - 24, 0xa060ff, 1.6, 0.5); }
    if (o.kind === "umb_tower") glow(objs, o.x, o.y - 70, 0xb46aff, 1.4, 0.45, true);
    // окна домов в 3/4 (задача 141, tools/gen/walls141-buildings.ts): слева −42 и справа +22 от середины, на 45 px выше основания
    if (o.kind === "umb_house" || o.kind === "umb_crypt") for (const dx of [-42, 22]) glow(objs, o.x + dx, o.y - 45, 0xb46aff, 1.1, 0.35);
    if (o.kind === "sol_house") for (const dx of [-42, 22]) glow(objs, o.x + dx, o.y - 45, 0xffd27a, 1.2, 0.35);
    if (o.kind === "torch") glow(objs, o.x, o.y - 22, 0xff9a3a, 2.4, 0.55, true);
    if (o.kind === "teleport_stone") glowOn(img, 0x7ac0ff);
    if (o.kind === "teleport_stone") glow(objs, o.x, o.y - ((window as unknown as { __perspOld?: boolean }).__perspOld ? 34 : 44), 0x7ac0ff, 2.2, 0.5, true); // ореол у кристалла (камень v2, tools/gen/teleport-v2.ts)
    if (o.kind === "lamp") glow(objs, o.x, o.y - 46, 0xffd27a, 2.2, 0.45, true);
    if (o.kind === "ember_vent") glow(objs, o.x, o.y - 6, 0xff5a1a, 1.4, 0.5, true);
    if (o.kind === "mushrooms_glow") glow(objs, o.x, o.y - 8, 0x5aa8ff, 1.1, 0.35);
    if (o.kind === "ward-sol") glow(objs, o.x, o.y - 32, 0xffd860, 1.3, 0.35);
    if (o.kind === "ward-umb") glow(objs, o.x, o.y - 30, 0xa070ff, 1.3, 0.38);
    if (o.kind === "ember-std") glow(objs, o.x, o.y - 84, 0xffa040, 1.1, 0.4, true); // живой огонь жаровни-навершия штандарта Эмберхолла
    if (o.kind === "crystal") glow(objs, o.x, o.y - 12, 0x9a8aff, 1.3, 0.4);
    if (o.kind === "house" || o.kind === "house_blue" || o.kind === "hut_sol") for (const dx of o.kind === "hut_sol" ? [-28, 14] : [-42, 22]) glow(objs, o.x + dx, o.y - (o.kind === "hut_sol" ? 33 : 45), 0xffd27a, 1.2, 0.35);
    if (o.kind === "tavern") for (const dx of [-87, -50, 26, 63]) for (const dy of [-32, -78]) glow(objs, o.x + dx, o.y + dy, 0xffc870, 1.2, 0.38);
    if (o.kind === "forge") {
      glow(objs, o.x - 48, o.y - 24, 0xff7a2a, 2.2, 0.6, true);
      glow(objs, o.x + 49, o.y - 138, 0xff8a3a, 0.9, 0.5, true);
    }
    if (o.kind === "fire-ground") glow(objs, o.x, o.y - 12, 0xff8a2a, 2.2, 0.55, true);
    if (o.kind === "fire-camp") glow(objs, o.x, o.y - 16, 0xff9a3a, 2.8, 0.6, true);
    if (o.kind === "fire-pile") glow(objs, o.x, o.y - 22, 0xff8a2a, 3.2, 0.6, true);
    if (o.kind === "fire-brazier") glow(objs, o.x, o.y - 34, 0xff9a3a, 2.4, 0.6, true);
    if (o.kind === "bf-forge-small") glow(objs, o.x, o.y - 26, 0xff7a2a, 1.8, 0.55, true);
    if (o.kind === "bf-forge-cone") glow(objs, o.x, o.y - 40, 0xff7a2a, 2.6, 0.55, true);
    if (o.kind === "cauldron") glow(objs, o.x, o.y - 4, 0xff8a3a, 0.9, 0.45, true);
    if (o.kind === "arena_gate") glow(objs, o.x, o.y - 30, 0xff4a2a, 1.6, 0.35, true);
  };

  const chunks = new Map<number, Chunk>();
  const createChunk = (cx: number, cy: number): Chunk => {
    const { x0, y0, cw, ch } = chunkRect(m, cx, cy);
    const tm = scene.make.tilemap({ width: cw, height: ch, tileWidth: TILE, tileHeight: TILE });
    const ts = tm.addTilesetImage("terrain", "terrain", TILE, TILE, 0, 0, 0)!;
    // автотайлы берега (shores.png, индексы с SHORE_GID — terrainTiles.ts); куски строятся, только когда обе текстуры загружены
    const tss = [ts, tm.addTilesetImage("shores", "shores", TILE, TILE, 0, 0, SHORE_GID)!];
    const sd = spill && chunkRows(m, spill, x0, y0, cw, ch);
    if (sd) tm.createBlankLayer("spill", tss, x0 * TILE, y0 * TILE, cw, ch)!.putTilesAt(sd, 0, 0).setDepth(DEPTH.terrain + 1.5); // над слоем лавы (terrain + 1), под сушей (terrain + 2…)
    for (let t = 0; t < TERRAIN_COUNT; t++) {
      const src = layers[t];
      if (!src) continue;
      const data = chunkRows(m, src, x0, y0, cw, ch);
      if (!data) continue;
      const layer = tm.createBlankLayer(`t${t}`, tss, x0 * TILE, y0 * TILE, cw, ch)!;
      layer.putTilesAt(data, 0, 0);
      layer.setDepth(t === 0 ? DEPTH.walls : DEPTH.terrain + t);
      if (t === 1) wl.lava(layer);
    }
    // объекты раскладываются по ячейкам отсечения по опорной точке; рамка ячейки — по фактическим рамкам её объектов
    const objs: Phaser.GameObjects.GameObject[] = [], tweens: Phaser.Tweens.Tween[] = [];
    const cellPx = CELL * TILE, NC = CHUNK / CELL;
    const cells: Cell[] = [];
    wallTiles = [];
    for (const o of buckets[cy * NX + cx]) {
      const ci = Math.max(0, Math.min(NC - 1, Math.floor((o.x - x0 * TILE) / cellPx)));
      const cj = Math.max(0, Math.min(NC - 1, Math.floor((o.y - 1 - y0 * TILE) / cellPx)));
      const cell = (cells[cj * NC + ci] ??= { objs: [], tweens: [], box: { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity }, shown: true });
      const from = cell.objs.length;
      chunkTweens = cell.tweens;
      makeObject(o, cell.objs);
      for (let i = from; i < cell.objs.length; i++) {
        // запас 8 px — покачивание крон (±1°) и мерцание огней (масштаб до 1.05)
        const go = cell.objs[i] as Phaser.GameObjects.Image;
        const b = go.getBounds(), x = cell.box;
        x.x0 = Math.min(x.x0, b.x - 8); x.y0 = Math.min(x.y0, b.y - 8);
        x.x1 = Math.max(x.x1, b.right + 8); x.y1 = Math.max(x.y1, b.bottom + 8);
      }
    }
    chunkTweens = [];
    wallShadows(wallTiles, objs);
    wallTiles = null;
    const list = cells.filter((c): c is Cell => !!c);
    for (const c of list) { objs.push(...c.objs); tweens.push(...c.tweens); }
    return { tm, objs, nodes: buckets[cy * NX + cx].map((o) => nodeOf.get(o)).filter((v): v is number => v !== undefined), tweens, cells: list };
  };
  const dropChunk = (c: Chunk) => {
    for (const id of c.nodes) nodeObjs.delete(id);
    // твины куска уничтожаются напрямую: killTweensOf перебирал бы все твины сцены на каждый объект
    for (const t of c.tweens) t.destroy();
    for (const o of c.objs) o.destroy();
    c.tm.destroy();
  };
  /**
   * Ячейка вне кадра убирается из списка отрисовки, её твины — на паузу. Загружено до 16 кусков вокруг камеры (запас в полкуска
   * и гистерезис), а в кадре — малая их часть: без отсечения Phaser каждый кадр сортировал по глубине, обходил и отправлял в GPU
   * ~2,5 тыс. объектов (деревья, дома, огни) и обновлял ~1 тыс. твинов покачивания, почти все — за краем экрана.
   */
  const showCell = (c: Cell, on: boolean) => {
    if (c.shown === on) return;
    c.shown = on;
    for (const o of c.objs) {
      if (on) o.addToDisplayList(); else o.removeFromDisplayList();
      if (o instanceof Phaser.GameObjects.Sprite) { if (on) o.anims.resume(); else o.anims.pause(); }
    }
    for (const t of c.tweens) if (on) t.resume(); else t.pause();
  };
  /** Отсечение всех ячеек куска по кадру [x0, x1) × [y0, y1). */
  const cull = (c: Chunk, x0: number, y0: number, x1: number, y1: number) => {
    for (const e of c.cells) showCell(e, e.box.x0 < x1 && e.box.x1 > x0 && e.box.y0 < y1 && e.box.y1 > y0);
  };
  scene.events.once("shutdown", () => {
    for (const c of chunks.values()) dropChunk(c);
    chunks.clear();
  });

  let last = "";
  /** Куски, которые пора создать: ближние к центру кадра первыми. */
  let want: number[] = [];
  const span = CHUNK * TILE;
  /** Запас вокруг кадра для отсечения, пиксели мира: worldView отстаёт на кадр, а камера за кадр сдвигается на несколько пикселей. */
  const PAD = 48;
  const update = (cam: Phaser.Cameras.Scene2D.Camera) => {
    shadowTick();
    // ворота данжа: створки доходят до состояния сервера (кадры объектов dg_door_w_0..7 и dg_port_0..7), звук при начале хода
    if (dgGates.size) {
      const dt = Math.min(0.1, scene.game.loop.delta / 1000);
      for (const g of dgGates) {
        const target = dgGateOpen.get(g.id) ? 1 : 0, was = g.t;
        if (target > g.t) g.t = Math.min(1, g.t + dt / 0.9); else if (target < g.t) g.t = Math.max(0, g.t - dt / 0.9);
        if (was === 0 && g.t > 0) sfx.play(g.prefix === "dg_port" ? "clink" : "step", 0.7);
        else if (was === 1 && g.t < 1) sfx.play("clink", 0.5);
        else if (was > 0 && g.t === 0) sfx.play("slam", 0.6);
        const id = `${g.prefix}_${dgGateForce.get(g.id) ?? Math.round(g.t * 7)}`;
        if (objId(g.img) !== id && objHas(scene, id)) setObj(g.img, id);
      }
    }
    const v = cam.worldView;
    follow(v);
    wl.update(cam);
    const vx0 = v.x - PAD, vy0 = v.y - PAD, vx1 = v.right + PAD, vy1 = v.bottom + PAD;
    for (const c of chunks.values()) cull(c, vx0, vy0, vx1, vy1);
    // запас в полкуска (снизу больше: высокие здания торчат вверх от опорной точки)
    const ax = Math.max(0, Math.floor((v.x - span / 2) / span)), bx = Math.min(NX - 1, Math.floor((v.right + span / 2) / span));
    const ay = Math.max(0, Math.floor((v.y - span / 2) / span)), by = Math.min(NY - 1, Math.floor((v.bottom + span / 2 + 200) / span));
    const key = `${ax},${bx},${ay},${by}`;
    if (key !== last) {
      last = key;
      for (const [id, c] of chunks) {
        const cx = id % NX, cy = Math.floor(id / NX);
        // выгрузка с гистерезисом в один кусок, чтобы не мигало на границе
        if (cx < ax - 1 || cx > bx + 1 || cy < ay - 1 || cy > by + 1) {
          dropChunk(c);
          chunks.delete(id);
        }
      }
      want = [];
      for (let cy = ay; cy <= by; cy++) for (let cx = ax; cx <= bx; cx++) if (!chunks.has(cy * NX + cx)) want.push(cy * NX + cx);
      const mx = (v.x + v.right) / 2, my = (v.y + v.bottom) / 2;
      const d = (id: number) => Math.hypot(((id % NX) + 0.5) * span - mx, (Math.floor(id / NX) + 0.5) * span - my);
      want.sort((a, b) => d(a) - d(b));
    }
    if (!want.length) return;
    // Набора тайлов terrain ещё нет (сцену мира запустили раньше конца загрузки BootScene): куски ждут его. Без набора addTilesetImage
    // даёт null, и Phaser PutTileAt падал на tiles[index] = undefined у точки появления (баг задачи 132; main.ts такой старт больше не делает).
    if (!scene.textures.exists("terrain") || !scene.textures.exists("shores")) return;
    // Кусок, который уже задевает кадр (с объектами, торчащими вверх и в стороны), создаётся сразу, иначе на экране дыра;
    // запасные — по одному за кадр: кусок леса — это до ~200 деревьев с твинами и 3–5 слоёв тайлов, и пачка из 2–3 кусков
    // при переходе границы давала update в 20–25 мс (кадр 33 мс) раз в ~7 с бега.
    let spare = 1;
    want = want.filter((id) => {
      const cx = id % NX, cy = Math.floor(id / NX);
      const near = cx * span - 128 < vx1 && (cx + 1) * span + 128 > vx0 && cy * span - 256 < vy1 && (cy + 1) * span + 16 > vy0;
      if (!near && spare-- <= 0) return true;
      const c = createChunk(cx, cy);
      chunks.set(id, c);
      cull(c, vx0, vy0, vx1, vy1);
      return false;
    });
  };

  // затемнение в данже (над миром, под огнями и интерфейсом)
  const dark = scene.add.rectangle(0, 0, 10, 10, 0x0a0614, 1).setOrigin(0).setScrollFactor(0).setDepth(DEPTH.top - 20).setAlpha(0);

  const setNode = (id: number, up: boolean) => {
    if (up) depleted.delete(id);
    else depleted.add(id);
    for (const g of nodeObjs.get(id) ?? []) (g as Phaser.GameObjects.Image).setVisible(up);
  };
  const nodeImage = (id: number) => { const g = nodeObjs.get(id)?.[0] as Phaser.GameObjects.Image | undefined; return g && g.visible ? g : undefined; };
  return { water, drift, dark, macro, setNode, nodeImage, update };
}

/** Затемнение и цвет подложки зоны (над миром, под интерфейсом). */
export function zoneTint(zone: Zone): { dark: number; color: number } {
  // земли Умбрата (столица и четыре зоны 1–40 востока: Курганы, Мглистый бор, Пепельные предгорья, Гнилые топи): пурпурный сумрак;
  // Чумные топи и Костяной хребет теперь в кольце 40–80 и тонируются биомом (топь, пепел), как их западные пары
  switch (zone) {
    case Zone.UmbrathCity: return { dark: 0.22, color: 0x1a0828 };
    case Zone.Barrows: return { dark: 0.2, color: 0x140a20 };
    case Zone.MistWood: return { dark: 0.16, color: 0x10141a };
    case Zone.AshFoothills: return { dark: 0.18, color: 0x140a1c };
    case Zone.Swamp: return { dark: 0.2, color: 0x100c1c };
    case Zone.SolgardCity:
    case Zone.SunFields: return { dark: 0, color: 0x2a1a06 };
    case Zone.StormPeaks: return { dark: 0.18, color: 0x0a1a3a };
    // Поля вечных битв (80–100): багровый сумрак поля боя
    case Zone.Fields: return { dark: 0.2, color: 0x1c0a12 };
  }
  const z = zoneStyle(zone);
  switch (z) {
    case Zone.Dungeon: return { dark: 0.5, color: 0x0a0614 };
    case Zone.Swamp: return { dark: 0.18, color: 0x0a1410 };
    case Zone.Ashlands: return { dark: 0.16, color: 0x0a0614 };
    case Zone.Forest: return { dark: 0.08, color: 0x0a1008 };
    case Zone.Arena: return { dark: 0.28, color: 0x0a0614 };
    case Zone.Desert: return { dark: 0.1, color: 0xd88a30 };
    case Zone.Snow: return { dark: 0.12, color: 0x9ac8ff };
    case Zone.Volcano: return { dark: 0.22, color: 0x2a0806 };
    default: return { dark: 0, color: 0x0a0614 };
  }
}
