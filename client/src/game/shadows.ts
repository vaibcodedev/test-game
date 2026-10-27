/**
 * Динамические тени (прототип): у предмета, здания, дерева, статуи, юнита и маунта длинная тень строится из его же кадра:
 * тот же кадр, залитый чёрным, перевёрнутый от основания вниз, сплющенный по вертикали и скошенный от «солнца» (альфа ≈ 0,36).
 * Солнце идёт по общему циклу дня (shared/daynight.ts, тот же Date.now(), что у ночного затемнения): утром тень длинная и ложится влево,
 * в полдень короткая и под предмет, вечером длинная вправо; ночью почти пропадает.
 * В кадры запечена только маленькая контактная тень у основания (tools/gen/shadow.ts).
 * Скос Phaser не умеет (у Image нет skew), поэтому матрица тени [[1, −k], [0, −sy]] раскладывается на поворот · масштаб · поворот:
 * контейнер (поворот φ, масштаб sx, sy) и картинка в нём (поворот θ). Параметры у всех теней общие и пересчитываются раз в 5 с игрового цикла.
 * Режим: Выкл (нет теней-спрайтов) / Простые (фиксированное солнце, один раз) / Динамические (следуют за временем суток), localStorage «shadowMode».
 */
import Phaser from "phaser";
import { DAY_CYCLE_MS, nightLevel } from "../../../shared/daynight";

export type ShadowMode = "off" | "simple" | "dynamic";
const MODES: ShadowMode[] = ["off", "simple", "dynamic"];
function load(): ShadowMode {
  try { const v = localStorage.getItem("shadowMode") as ShadowMode | null; if (v && MODES.includes(v)) return v; } catch {}
  return "dynamic";
}
let mode: ShadowMode = load();
export const shadowMode = (): ShadowMode => mode;
export function setShadowMode(m: ShadowMode) {
  if (!MODES.includes(m) || m === mode) return;
  mode = m;
  try { localStorage.setItem("shadowMode", m); } catch {}
  lastKey = -1;
}

/** Глубина теней: над землёй и землёй-декором, под пятном юнита (DEPTH.ground + 5) и всеми объектами. */
const SHADOW_DEPTH = -600 + 2;
const ALPHA = 0.46;
/** Подземелья и залы без солнца. */
/** Освещение: «sun» — солнце суток, «torch» — данж (тени от факелов и жаровен: фиксированный наклон вправо-вниз), «none» — залы и арена без теней. */
export type LightMode = "sun" | "torch" | "none";
let lightMode: LightMode = "sun";
export function setLightMode(v: LightMode) { if (v !== lightMode) { lightMode = v; lastKey = -1; } }

interface Params { phi: number; sx: number; sy: number; theta: number; alpha: number }
/** Матрица тени для доли суток p (0 — утро, ~0,68 — вечер): k — сдвиг по x на пиксель высоты, sy — сжатие по вертикали. */
export function sunParams(p: number, ms: number): Params {
  const day = Math.max(0, Math.min(1, p / 0.68)), e = Math.sin(Math.PI * day);
  const L = 0.32 + 1.5 * Math.pow(1 - e, 1.6);
  const phi = (-1 + 2 * day) * 1.25;
  const k = L * Math.sin(phi), sy = Math.max(0.32, L * Math.cos(phi) * 0.55 + 0.14);
  return decompose(1, -k, 0, -sy, ALPHA * (1 - 0.9 * nightLevel(ms)));
}
function decompose(m00: number, m01: number, m10: number, m11: number, alpha: number): Params {
  const E = (m00 + m11) / 2, F = (m00 - m11) / 2, G = (m10 + m01) / 2, H = (m10 - m01) / 2;
  const Q = Math.hypot(E, H), R = Math.hypot(F, G);
  const a1 = Math.atan2(G, F), a2 = Math.atan2(H, E);
  return { phi: (a2 + a1) / 2, sx: Q + R, sy: Q - R, theta: (a2 - a1) / 2, alpha };
}
const SIMPLE: Params = decompose(1, -0.55, 0, -0.3, ALPHA);
const TORCH: Params = decompose(1, -0.7, 0, -0.34, ALPHA * 0.9);

/** Тень одного предмета: контейнер (поворот и масштаб) с картинками-копиями кадров. */
export class Shadow {
  readonly box: Phaser.GameObjects.Container;
  readonly imgs: Phaser.GameObjects.Image[] = [];
  /** boost — множитель плотности: у юнитов и маунтов тень гуще (мелкие силуэты). */
  constructor(scene: Phaser.Scene, x: number, y: number, private readonly boost = 1) {
    this.box = scene.add.container(x, y).setDepth(SHADOW_DEPTH);
    all.add(this);
    this.box.once("destroy", () => all.delete(this));
    this.apply(cur);
  }
  /** Копия кадра источника: те же текстура, кадр, начало координат, отражение и масштаб; смещение (dx, dy) от основания тени. */
  mirror(i: number, src: Phaser.GameObjects.Image, dx: number, dy: number) {
    let im = this.imgs[i];
    if (!im) { im = this.box.scene.add.image(0, 0, src.texture.key, src.frame.name).setTintFill(0x000000); this.imgs[i] = im; this.box.add(im); im.setRotation(cur.theta); }
    if (im.texture.key !== src.texture.key || im.frame.name !== src.frame.name) im.setTexture(src.texture.key, src.frame.name);
    im.setOrigin(src.originX, src.originY).setPosition(dx, dy).setFlipX(src.flipX).setScale(src.scaleX, src.scaleY).setVisible(src.visible && src.alpha > 0.05);
  }
  apply(p: Params) {
    this.box.setRotation(p.phi).setScale(p.sx, p.sy).setAlpha(mode === "off" || lightMode === "none" ? 0 : Math.min(0.7, p.alpha * this.boost));
    for (const im of this.imgs) im.setRotation(p.theta);
  }
  destroy() { this.box.destroy(); }
}

const all = new Set<{ apply(p: Params): void }>();

/** Виды тайлов крепостной стены: тень склеивается в одну полосу на прямой участок (WallShadow). */
export const WALL_KINDS = new Set(["wall_h", "wall_v", "sol_wall_h", "sol_wall_v", "umb_wall_h", "umb_wall_v"]);
export interface WallTile { img: Phaser.GameObjects.Image; x: number; y: number }
/**
 * Одна тень прямого участка стены. Каждый тайл со своей тенью давал «гребёнку» (края и наложения соседних тайлов, где альфа складывается),
 * поэтому тайлы рисуются чёрным с полной альфой в одну RenderTexture (наложение чёрного на чёрное не темнеет), а прозрачность — один раз на всю полосу.
 * Скос (поворот θ в каждой точке опоры) запекается при рисовании, текстура перерисовывается только когда сменился θ (шаг 5 с).
 */
export class WallShadow {
  readonly box: Phaser.GameObjects.Container;
  private readonly rt: Phaser.GameObjects.RenderTexture;
  private readonly stamp: Phaser.GameObjects.Image;
  private readonly items: { key: string; frame: string | number; ox: number; oy: number; fx: boolean; sx: number; sy: number; dx: number; dy: number }[];
  private readonly mx: number; private readonly my: number;
  private theta = NaN;
  constructor(scene: Phaser.Scene, tiles: WallTile[]) {
    const o = tiles[0];
    this.box = scene.add.container(o.x, o.y).setDepth(SHADOW_DEPTH);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    this.items = tiles.map((t) => {
      const im = t.img, r = Math.hypot(im.width * Math.abs(im.scaleX) / 2, im.height * im.scaleY) + 2, dx = t.x - o.x, dy = t.y - o.y;
      x0 = Math.min(x0, dx - r); y0 = Math.min(y0, dy - r); x1 = Math.max(x1, dx + r); y1 = Math.max(y1, dy + r);
      return { key: im.texture.key, frame: im.frame.name, ox: im.originX, oy: im.originY, fx: im.flipX, sx: im.scaleX, sy: im.scaleY, dx, dy };
    });
    this.mx = Math.floor(x0); this.my = Math.floor(y0);
    this.rt = scene.add.renderTexture(this.mx, this.my, Math.ceil(x1) - this.mx, Math.ceil(y1) - this.my).setOrigin(0, 0);
    this.box.add(this.rt);
    this.stamp = scene.make.image({ x: 0, y: 0, key: this.items[0].key, add: false }).setTintFill(0x000000);
    all.add(this);
    this.box.once("destroy", () => { all.delete(this); this.stamp.destroy(); });
    this.apply(cur);
  }
  apply(p: Params) {
    this.box.setRotation(p.phi).setScale(p.sx, p.sy).setAlpha(mode === "off" || lightMode === "none" ? 0 : Math.min(0.7, p.alpha));
    if (p.theta === this.theta) return;
    this.theta = p.theta;
    this.rt.clear();
    this.stamp.setRotation(p.theta);
    for (const it of this.items) {
      this.stamp.setTexture(it.key, it.frame).setOrigin(it.ox, it.oy).setFlipX(it.fx).setScale(it.sx, it.sy);
      this.rt.draw(this.stamp, it.dx - this.mx, it.dy - this.my);
    }
  }
}
let cur: Params = SIMPLE, lastKey = -1;
/** Раз в кадр из мира: пересчёт общих параметров, только когда сменился 5-секундный шаг цикла, режим или зона. */
export function shadowTick(): void {
  const ms = (window as unknown as { __shadowMs?: number }).__shadowMs ?? Date.now(), p = (((ms % DAY_CYCLE_MS) + DAY_CYCLE_MS) % DAY_CYCLE_MS) / DAY_CYCLE_MS;
  const key = (mode === "dynamic" ? Math.floor(p * 240) : 0) + MODES.indexOf(mode) * 1000 + (lightMode === "none" ? 10000 : lightMode === "torch" ? 20000 : 0);
  if (key === lastKey) return;
  lastKey = key;
  cur = lightMode === "torch" ? TORCH : mode === "dynamic" ? sunParams(p, ms) : SIMPLE;
  for (const s of all) s.apply(cur);
}
export const shadowCount = () => all.size;

/** Виды без длинной тени: лежат на земле, низкие или сами огонь. */
export const NO_SHADOW = new Set(["flowers", "tallgrass", "fern", "reeds", "lilypad", "bones", "ember_vent", "mushrooms", "mushrooms_glow", "soul_brazier", "campfire", "ward-sol", "ward-umb"]);

// отладка и замеры (скриншоты tools/shadows-shots.ts): переключатель режима из консоли
if (typeof window !== "undefined") (window as unknown as { __setShadowMode: typeof setShadowMode }).__setShadowMode = setShadowMode;
