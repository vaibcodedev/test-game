/**
 * Построение мира в Phaser: анимированная вода, слои поверхностей (dual grid), стены, объекты и огни.
 * Мир делится на куски CHUNK×CHUNK тайлов: тайлы и объекты создаются только рядом с камерой,
 * поэтому большая карта не держит сотни тысяч Phaser-тайлов и тысячи спрайтов разом.
 */
import Phaser from "phaser";
import { TILE } from "../../../shared/constants";
import { GROUND_OBJECTS, TERRAIN_COUNT, Zone, zoneStyle, type MapObject, type WorldMap } from "../../../shared/map";
import { FLIP_TREES, SWAY_TREES } from "../../../shared/decor";
import { CHUNK, cellHash, chunkRect, chunkRows, terrainLayers } from "./terrainTiles";
import { placeText, worldText } from "./worldText";
import { NO_SHADOW, Shadow, shadowTick } from "./shadows";

export const DEPTH = { water: -1000, terrain: -900, walls: -800, overlay: -700, ground: -600, top: 1e6 };

export interface WorldView {
  water: Phaser.GameObjects.TileSprite;
  /** Смещение течения воды (меняется сценой каждый кадр). */
  drift: { x: number; y: number };
  dark: Phaser.GameObjects.Rectangle;
  macro: Phaser.GameObjects.TileSprite;
  /** Узел добычи появился (true) или исчерпан (false). */
  setNode(id: number, up: boolean): void;
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
    if (flicker) tween({ targets: g, alpha: { from: alpha * 0.7, to: alpha * 1.1 }, scale: { from: scale * 0.92, to: scale * 1.05 }, duration: 160 + Math.random() * 220, yoyo: true, repeat: -1 });
  };
  // узлы добычи: картинка и свечение прячутся, пока ресурс исчерпан
  const nodeOf = new Map<MapObject, number>(m.nodes.map((n) => [m.objects[n.id], n.id]));
  const nodeObjs = new Map<number, Phaser.GameObjects.GameObject[]>();
  const depleted = new Set<number>();
  const NODE_GLOW: Record<string, number> = { node_cactus: 0xc8ff8a, node_ice: 0x9ae0ff, node_obsidian: 0xff7a2a, node_pearl: 0xe8d8ff };
  // анимированные объекты (огонь, горны, манекены, осадные машины, повреждённые штандарты — задача 132, шаг 10): вид объекта = id листа
  // из vfx/manifest.json (tools/gen/battlefield.ts, tools/gen/standards-to-game.ts); цикл с кадра по хэшу места, чтобы соседние не шли в такт
  const vfxCat = (scene.cache.json.get("vfxm") ?? {}) as Record<string, { anchor: [number, number]; frames: number }>;
  const makeImage = (o: MapObject): Phaser.GameObjects.Image | Phaser.GameObjects.Sprite => {
    const e = vfxCat[o.kind];
    if (e && !scene.textures.exists(`o_${o.kind}`) && scene.anims.exists(`vfx_${o.kind}`)) {
      const s = scene.add.sprite(o.x, o.y, `vfx_${o.kind}`).setOrigin(o.flip ? 1 - e.anchor[0] : e.anchor[0], e.anchor[1]);
      s.play({ key: `vfx_${o.kind}`, repeat: -1, startFrame: Math.floor(cellHash(o.x, o.y) * e.frames) % e.frames });
      return s.setFlipX(!!o.flip);
    }
    // вариант вида (задача 141, shared/cityart.ts): кадр o_<kind>__<v>, без него — общий кадр вида
    const key = o.v && scene.textures.exists(`o_${o.kind}__${o.v}`) ? `o_${o.kind}__${o.v}` : `o_${o.kind}`;
    return scene.add.image(o.x, o.y, key).setOrigin(0.5, 1).setFlipX(!!o.flip);
  };
  const makeObject = (o: MapObject, objs: Phaser.GameObjects.GameObject[]) => {
    const img = makeImage(o);
    objs.push(img);
    // динамическая тень из собственного кадра (game/shadows.ts): не для лежащего на земле, низкого и анимированного
    if (img.type === "Image" && (img as Phaser.GameObjects.Image).height >= 20 && !NO_SHADOW.has(o.kind) && !GROUND_OBJECTS.has(o.kind)) {
      const sh = new Shadow(scene, o.x, o.y);
      sh.mirror(0, img as Phaser.GameObjects.Image, 0, 0);
      objs.push(sh.box);
    }
    if (o.kind === "lilypad" || GROUND_OBJECTS.has(o.kind)) img.setDepth(DEPTH.ground - (GROUND_OBJECTS.has(o.kind) ? 1 : 0));
    else if (o.kind === "flowers" || o.kind === "tallgrass" || o.kind === "bones" || o.kind === "ember_vent") img.setDepth(o.y - 20);
    else img.setDepth(o.y + (o.dz ?? 0));
    if (SWAY_TREES.has(o.kind)) {
      // лёгкое покачивание крон (деревья Basic из shared/decor.ts)
      const sway = (cellHash(o.x, o.y) - 0.5) * 0.04;
      tween({ targets: img, angle: { from: -1 + sway, to: 1 + sway }, duration: 2400 + cellHash(o.y, o.x) * 1600, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
      if (FLIP_TREES.has(o.kind)) img.setFlipX(cellHash(o.x, o.y) > 0.5);
    }
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
    if (o.kind === "campfire") glow(objs, o.x, o.y - 12, 0xff9a3a, 2.4, 0.6, true);
    if (o.kind === "dark_obelisk") glow(objs, o.x, o.y - 50, 0x9a4aff, 1.8, 0.45, true);
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
      else if (k === "dg_gate_a") glow(objs, o.x, o.y - 30, 0xff7a30, 2.2, 0.5, true);
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
    if (o.kind === "brazier") glow(objs, o.x, o.y - 26, 0xff8a2a, 2.6, 0.6, true);
    if (o.kind === "teleport_stone") glow(objs, o.x, o.y - 34, 0x7ac0ff, 2.2, 0.5, true);
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
    if (o.kind === "bf-fire-s" || o.kind === "bf-fire-m") glow(objs, o.x, o.y - 12, 0xff8a2a, 2.2, 0.55, true);
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
    for (let t = 0; t < TERRAIN_COUNT; t++) {
      const src = layers[t];
      if (!src) continue;
      const data = chunkRows(m, src, x0, y0, cw, ch);
      if (!data) continue;
      const layer = tm.createBlankLayer(`t${t}`, ts, x0 * TILE, y0 * TILE, cw, ch)!;
      layer.putTilesAt(data, 0, 0);
      layer.setDepth(t === 0 ? DEPTH.walls : DEPTH.terrain + t);
    }
    // объекты раскладываются по ячейкам отсечения по опорной точке; рамка ячейки — по фактическим рамкам её объектов
    const objs: Phaser.GameObjects.GameObject[] = [], tweens: Phaser.Tweens.Tween[] = [];
    const cellPx = CELL * TILE, NC = CHUNK / CELL;
    const cells: Cell[] = [];
    for (const o of buckets[cy * NX + cx]) {
      const ci = Math.max(0, Math.min(NC - 1, Math.floor((o.x - x0 * TILE) / cellPx)));
      const cj = Math.max(0, Math.min(NC - 1, Math.floor((o.y - 1 - y0 * TILE) / cellPx)));
      const cell = (cells[cj * NC + ci] ??= { objs: [], tweens: [], box: { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity }, shown: true });
      const from = cell.objs.length;
      chunkTweens = cell.tweens;
      makeObject(o, cell.objs);
      for (let i = from; i < cell.objs.length; i++) {
        // запас 8 px — покачивание крон (±1°) и мерцание огней (масштаб до 1.05)
        const b = (cell.objs[i] as Phaser.GameObjects.Image).getBounds(), x = cell.box;
        x.x0 = Math.min(x.x0, b.x - 8); x.y0 = Math.min(x.y0, b.y - 8);
        x.x1 = Math.max(x.x1, b.right + 8); x.y1 = Math.max(x.y1, b.bottom + 8);
      }
    }
    chunkTweens = [];
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
    const v = cam.worldView;
    follow(v);
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
    if (!scene.textures.exists("terrain")) return;
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
  return { water, drift, dark, macro, setNode, update };
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
