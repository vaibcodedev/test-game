/**
 * Объекты Цитадели Хаоса v2 с настоящим объёмом — трассировка SDF той же камерой, что природа nature3d (tools/gen/nature3d-lib.ts:
 * вид 3/4, высота 1:1, глубина ×0.4, свет сверху-слева, контур тёмным тоном материала, контактная тень):
 *  - колонна 2×2: квадратный плинт 62×62 (= след коллизии) со ступенью, каннелированный ствол, железные обручи, руны, капитель,
 *    рогатая чаша с углями;
 *  - жаровня: каменная пята, кованый треножник, чаша с углями (огонь — лист fire v2 fire-brazier, клиент);
 *  - кости: черепа и рёбра nature3d (те же модели, что у природы вулкана).
 * Каждый кадр обрезан так, что под передней кромкой основания ровно 2 ряда тени (docs/art/perspective.md §4).
 */
import { PC, hex, ramp, type RGBA } from "./canvas";
import { Scene, renderFull, capsule, cylinder, ellipsoid, len3, noise3, smin, type Mat, type SDF, type V3 } from "./nature3d-lib";
import { skull, ribs } from "./nature3d-flora";

const STONE = ramp("#0b090d", "#141016", "#241c22", "#3a2c30", "#54403c", "#6e5650", "#8a7064");
const IRON = ramp("#0a090d", "#17151c", "#28242e", "#3e3844", "#5c5462", "#857a86");
const EMB = ramp("#7a140a", "#c0300e", "#ff6a1a", "#ffb04a", "#ffe8a0");
const O = (c: string): RGBA => hex(c);

/** Скруглённый ящик (центр, полуразмеры). */
const box = (cx: number, cy: number, cz: number, hx: number, hy: number, hz: number, r = 0.8): SDF => (x, y, z) => {
  const qx = Math.abs(x - cx) - hx + r, qy = Math.abs(y - cy) - hy + r, qz = Math.abs(z - cz) - hz + r;
  return len3(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - r;
};
const sub = (a: SDF, b: SDF): SDF => (x, y, z) => Math.max(a(x, y, z), -b(x, y, z));
/** Кладка: шов по рядам (по z) и вертикальные швы со сдвигом — сдвиг тона вниз. */
const masonry = (rowH: number, bw: number) => (x: number, y: number, z: number) => {
  const row = Math.floor(z / rowH), u = (Math.abs(y) > Math.abs(x) ? x : y) + row * (bw / 2);
  const lz = z - row * rowH, lu = ((u % bw) + bw) % bw;
  return lz < 0.9 || lu < 0.9 ? -1.4 : (noise3(Math.floor(u / bw), row, 0, 5) - 0.5) * 0.5 + (lz > rowH - 1.4 ? 0.4 : 0);
};

export interface Prop { pc: PC; fire?: [number, number] }
/** Рендер сцены и обрезка: низ кадра = передняя кромка основания + 2 ряда тени; fire — точка (x, z) мира над центром → координаты кадра. */
function finish(sc: Scene, w: number, h: number, fire?: V3): Prop {
  const r = renderFull(sc, { w, h, ax: w / 2, ay: h - 30, shadow: 0.9, inner: 2 });
  const { pc, mat } = r;
  let bottom = 0;
  for (let y = 0; y < pc.h; y++) for (let x = 0; x < pc.w; x++) if (mat[y * pc.w + x] >= 0) bottom = Math.max(bottom, y);
  const H = bottom + 3, out = new PC(pc.w, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < pc.w; x++) { const c = pc.get(x, y); if (c && c[3]) out.set(x, y, c); }
  // контактная тень: 2 ряда под основанием (альфа ≈150 и ≈65), шире основания на 1 px
  let x0 = pc.w, x1 = -1;
  for (let x = 0; x < pc.w; x++) for (let y = bottom - 1; y <= bottom; y++) if (mat[y * pc.w + x] >= 0) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); }
  for (let x = x0 - 1; x <= x1 + 1; x++) { out.set(x, bottom + 1, [12, 8, 18, 150]); out.set(x, bottom + 2, [12, 8, 18, 65]); }
  // точка огня: мировая (x, y, z) → кадр (px = ax + x, py = ay − (z + 0.4·y))
  const f: [number, number] | undefined = fire ? [r.ax + fire[0], r.ay - (fire[2] + 0.4 * fire[1])] : undefined;
  return { pc: out, fire: f };
}

const stoneM: Mat = { r: STONE, out: O("#070508"), tex: masonry(8, 18), texK: 0.35 };
const shaftM: Mat = { r: STONE, out: O("#070508"), tex: (x, y, z) => (noise3(x * 0.3, y * 0.3, z * 0.15, 3) - 0.5) * 0.8, spec: 0.94 };
const ironM: Mat = { r: IRON, out: O("#050408"), spec: 0.9, tex: (x, y, z) => (noise3(x * 0.5, y * 0.5, z * 0.5, 4) - 0.5) * 0.5 };
const emberM: Mat = { r: EMB, out: O("#3a0804"), emit: true, tex: (x, y, z) => (noise3(x * 0.6, y * 0.6, z, 6) - 0.5) * 2.2, texK: 0.5 };

/** Колонна-укрытие 2×2 (след 64×64 → плинт 62×62). */
export function pillar3d(): Prop {
  const sc = new Scene([stoneM, shaftM, ironM, emberM]);
  sc.add(box(0, 0, 6, 31, 31, 6, 1.2), 0, [0, 0, 6], 46);
  sc.add(box(0, 0, 15, 25, 25, 3, 1), 0, [0, 0, 15], 36);
  const H0 = 18, H1 = 108, R = 15.5;
  const flutes: SDF = (x, y, z) => cylinder(0, 0, H0, H1, R, 0.5)(x, y, z) + Math.max(0, Math.cos(Math.atan2(y, x) * 14)) * 0.9;
  sc.add(flutes, 1, [0, 0, (H0 + H1) / 2], (H1 - H0) / 2 + R + 2);
  sc.add(cylinder(0, 0, H0, H0 + 5, R + 2.5, 0.8), 0, [0, 0, H0 + 2], R + 4); // база ствола
  for (const z0 of [30, 92]) sc.add(cylinder(0, 0, z0, z0 + 5, R + 1.8, 0.6), 2, [0, 0, z0 + 2.5], R + 3);
  // капитель: эхин и абака
  sc.add(cylinder(0, 0, H1 - 1, H1 + 4, R + 4, 1), 0, [0, 0, H1 + 2], R + 6);
  sc.add(box(0, 0, H1 + 8, 22, 22, 4, 1), 0, [0, 0, H1 + 8], 32);
  // руны на лицевой стороне ствола (y < 0 — к зрителю): раскалённые штрихи, утоплены в камень
  const glyphs: [number, number, number, number][][] = [
    [[0, 52, 0, 64], [-4, 60, 4, 56]],
    [[-4, 74, 4, 68], [4, 68, -4, 62], [0, 66, 0, 72]],
    [[0, 82, -4, 78], [-4, 78, 0, 74], [0, 74, 4, 78], [4, 78, 0, 82]],
  ];
  for (const g of glyphs) for (const [ax, az, bx, bz] of g) sc.add(capsule([ax, -R + 0.2, az], [bx, -R + 0.2, bz], 0.85), 3, [(ax + bx) / 2, -R, (az + bz) / 2], 8);
  // рогатая чаша с углями
  const zc = H1 + 12;
  const bowl = sub(ellipsoid(0, 0, zc + 4, 13, 13, 6), ellipsoid(0, 0, zc + 8, 11, 11, 5.5));
  sc.add(bowl, 2, [0, 0, zc + 4], 16);
  const coals: SDF = (x, y, z) => ellipsoid(0, 0, zc + 6.5, 10.5, 10.5, 2.4)(x, y, z) - noise3(x * 0.5, y * 0.5, 0, 9) * 1.2;
  sc.add(coals, 3, [0, 0, zc + 7], 13);
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + (k * Math.PI) / 2, ca = Math.cos(a), sa = Math.sin(a);
    let p: V3 = [ca * 11, sa * 11, zc + 6];
    for (let i = 1; i <= 5; i++) {
      const t = i / 5, q: V3 = [ca * (11 + t * 8), sa * (11 + t * 8), zc + 6 + t * 18 - t * t * 4];
      sc.add(capsule(p, q, 2.6 - t * 1.6, 2.6 - (t + 0.2) * 1.6), i === 5 ? 3 : 2, [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2], 6, 0.6);
      p = q;
    }
  }
  return finish(sc, 120, 240, [0, 0, zc + 8]);
}

/** Жаровня на берегу: каменная пята, кованый треножник, чаша с углями. */
export function brazier3d(): Prop {
  const sc = new Scene([stoneM, ironM, emberM]);
  sc.add(box(0, 0, 1.5, 14, 14, 1.5, 0.8), 0, [0, 0, 1.5], 20);
  const zb = 22;
  for (const deg of [90, 210, 330]) {
    const a = (deg * Math.PI) / 180, ca = Math.cos(a), sa = Math.sin(a);
    // нога: от чаши наружу и вниз, лапа на пяте
    sc.add(capsule([ca * 6, sa * 6, zb], [ca * 10, sa * 10, 11], 1.7, 1.5), 1, [ca * 8, sa * 8, 16], 9, 0.5);
    sc.add(capsule([ca * 10, sa * 10, 11], [ca * 12, sa * 12, 3.5], 1.5, 2.1), 1, [ca * 11, sa * 11, 7], 7, 0.5);
  }
  sc.add(cylinder(0, 0, 13, 14.2, 9.6, 0.4), 1, [0, 0, 13.6], 11); // обруч ног
  const bowl = sub(ellipsoid(0, 0, zb + 4, 12, 12, 6), ellipsoid(0, 0, zb + 8, 10.4, 10.4, 5.5));
  sc.add(bowl, 1, [0, 0, zb + 4], 15);
  const coals: SDF = (x, y, z) => ellipsoid(0, 0, zb + 6.5, 10, 10, 2.4)(x, y, z) - noise3(x * 0.5, y * 0.5, 0, 9) * 1.2;
  sc.add(coals, 2, [0, 0, zb + 7], 12);
  for (const s of [-1, 1]) sc.add(capsule([s * 11.5, 0, zb + 7], [s * 14, 0, zb + 13], 1.2, 0.5), 1, [s * 13, 0, zb + 10], 5); // рожки по бокам
  return finish(sc, 60, 90, [0, 0, zb + 8]);
}

/** Кости: черепа (0, 2 — простые, 1, 3 — бараньи) и рёбра (0–2) — модели nature3d. */
export function bones3d(): Record<string, PC> {
  const out: Record<string, PC> = {};
  for (const v of [0, 1, 2, 3]) out[`cit_skull_${v}`] = skull(v);
  for (const v of [0, 1, 2]) out[`cit_ribs_${v}`] = ribs(v);
  void smin;
  return out;
}
