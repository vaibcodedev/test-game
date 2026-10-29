/**
 * Выжженная земля вокруг сгоревшего (data/scorch.json): до постройки мира вершины dual grid вокруг шатров, повозок, катапульт, костров,
 * воронок и горелых штандартов становятся пепелищем → обугленной землёй → опалённой травой (поверхности AshField, Charred, Singed;
 * тайлы и переходы — tools/gen/ground2.ts). Только клиент: на проходимость поверхности не влияют, сервер их не знает.
 * Горевшие сами источники (шатёр, повозка, катапульта) — с огнём в центре гари (лист vfx) и обугленным кадром (тёмная тонировка).
 */
import Phaser from "phaser";
import { mapPost, T, type WorldMap } from "../../../shared/map";
import scorch from "../../../data/scorch.json";

const SOURCES = (scorch.sources as [string, number, string | null][]).map(([re, r, fire]) => [new RegExp(re), r * 32, fire] as const);
const [RA, RC, RS] = scorch.rings as [number, number, number];
const CHAR_TINT = 0x6e5e56;
/** Сглаженный шум по вершинам (значения в узлах через 3 вершины, между ними — плавно): кромка округлая и рваная, без ступенек сетки. */
const hh = (x: number, y: number) => { let h = Math.imul(x, 73856093) ^ Math.imul(y, 19349663); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const vnoise = (x: number, y: number, c: number) => {
  const fx = x / c, fy = y / c, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0, sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
  const a = hh(x0, y0), b = hh(x0 + 1, y0), c2 = hh(x0, y0 + 1), d = hh(x0 + 1, y0 + 1);
  return a + (b - a) * sx + (c2 - a) * sy + (a - b - c2 + d) * sx * sy;
};

mapPost.push((m: WorldMap) => {
  const OK = new Set<number>([T.Grass, T.Forest, T.Dirt, T.Sand, T.Ash, T.Dune, T.Bog]);
  for (const o of m.objects) {
    const src = SOURCES.find(([re]) => re.test(o.kind));
    if (!src) continue;
    const R = src[1], sx = scorch.stretch, cx = o.x + R * scorch.shift, cy = o.y - 10;
    for (let vy = Math.floor((cy - R * 1.3) / 32); vy <= Math.ceil((cy + R * 1.3) / 32); vy++) for (let vx = Math.floor((cx - R * sx * 1.3) / 32); vx <= Math.ceil((cx + R * sx * 1.3) / 32); vx++) {
      if (vx < 0 || vy < 0 || vx > m.w || vy > m.h) continue;
      const i = vy * (m.w + 1) + vx;
      if (!OK.has(m.vtx[i])) continue;
      const u = Math.hypot((vx * 32 - cx) / (R * sx), (vy * 32 - cy) / (R * 0.75)) + (vnoise(vx, vy, 3) - 0.5) * 0.35 + (hh(vx, vy) - 0.5) * 0.12;
      const t = u < RA ? T.AshField : u < RC ? T.Charred : u < RS ? T.Singed : -1;
      if (t >= 0 && t > m.vtx[i]) m.vtx[i] = t;
    }
  }
});

/** Подключается один раз из BootScene: огонь в центре гари и обугленные кадры горевших источников, только рядом с камерой. */
export function attachScorch(game: Phaser.Game) {
  const gs = game.scene.getScene("game");
  if (!gs) return;
  gs.events.on("create", () => {
    const map = (gs as unknown as { map?: WorldMap }).map;
    if (!map) return;
    const BIN = 512, NEAR = 2, bins = new Map<number, { x: number; y: number; fire: string; phase: number }[]>();
    for (const o of map.objects) {
      const src = SOURCES.find(([re]) => re.test(o.kind));
      if (!src || !src[2]) continue;
      const k = Math.floor(o.x / BIN) * 65536 + Math.floor(o.y / BIN);
      (bins.get(k) ?? bins.set(k, []).get(k)!).push({ x: o.x, y: o.y, fire: src[2], phase: Math.floor(hh(o.x | 0, o.y | 0) * 16) });
    }
    if (!bins.size) return;
    const live = new Map<number, Phaser.GameObjects.GameObject[]>();
    const charAt = new Set<number>(), charred = new WeakSet<Phaser.GameObjects.GameObject>(), pkey = (x: number, y: number) => Math.round(x) * 65536 + Math.round(y);
    let tick = 0;
    const update = () => {
      if ((tick = (tick + 1) % 15) !== 0) return;
      // объекты мира создаёт terrain.ts по кускам — находим кадры источников по точке опоры и тонируем один раз
      if (charAt.size) for (const c of gs.children.list) {
        if (charred.has(c) || !(c instanceof Phaser.GameObjects.Image) || !charAt.has(pkey(c.x, c.y))) continue;
        c.setTint(CHAR_TINT); charred.add(c);
      }
      const cam = gs.cameras.main, cx = Math.floor(cam.midPoint.x / BIN), cy = Math.floor(cam.midPoint.y / BIN), want = new Set<number>();
      for (let j = -NEAR; j <= NEAR; j++) for (let i = -NEAR; i <= NEAR; i++) want.add((cx + i) * 65536 + cy + j);
      for (const [k, objs] of live) if (!want.has(k)) { for (const o of objs) o.destroy(); live.delete(k); }
      for (const k of want) {
        if (live.has(k) || !bins.has(k)) continue;
        const objs: Phaser.GameObjects.GameObject[] = [];
        for (const s of bins.get(k)!) {
          charAt.add(pkey(s.x, s.y));
          if (gs.anims.exists(`vfx_${s.fire}`)) objs.push(gs.add.sprite(s.x + 4, s.y - 2, `vfx_${s.fire}`).setOrigin(0.5, 1).setDepth(s.y + 1).play({ key: `vfx_${s.fire}`, repeat: -1, startFrame: s.phase }));
        }
        live.set(k, objs);
      }
    };
    gs.events.on("update", update);
    gs.events.once("shutdown", () => { gs.events.off("update", update); live.clear(); });
  });
}
