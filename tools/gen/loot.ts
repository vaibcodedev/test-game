/**
 * Добыча на земле (мешок / сундучок): листы 20 кадров в строку — 0..9 падение с отскоком, 10..19 покой (мерцание у редких).
 * Цвет акцента — токены редкости из docs/gear-visuals.md. Свет сверху слева, контур 1 px (OUTLINE), 4–5 тонов на материал.
 * В игру идёт LOOT_VARIANT (objects/loot_r{0..3}[_boss].png), оба варианта рисует монтаж tools/loot-look.ts.
 */
import { PC, hex, mix, shade, withA, type RGBA, type Ramp } from "./canvas";
import { OUTLINE, P } from "./palette";

export type LootVariant = "bag" | "chest";
/** Вариант в игре; второй остаётся в монтаже tools/out/loot-look/. */
export const LOOT_VARIANT: LootVariant = "chest";
export const LOOT_FRAMES = 20;
export const LOOT_DROP = 10;

const RARITY = ["#e8e2d0", "#5fa8ff", "#c47bff", "#ff9a2e"];
const WHITE = hex("#fffaf0");
/** Светлый контур заметности (тёплый нейтральный, полупрозрачный). */
const VIS_RING = hex("#efe2c0", 190);
/** Рампа редкости: 0 — тень, 2 — токен, 4 — почти белый. */
function rr(r: number): Ramp {
  const t = hex(RARITY[r]);
  return [shade(t, 0.32), shade(t, 0.58), t, mix(t, WHITE, 0.5), mix(t, WHITE, 0.85)];
}
const LEATHER = [hex("#2a1810"), hex("#46291a"), hex("#6a4228"), hex("#94613a"), hex("#c09060")];
const WOOD = [hex("#2a180e"), hex("#432716"), hex("#5e3a22"), hex("#80522e"), hex("#a06c40")];
const IRON = [hex("#16141e"), hex("#2a2836"), hex("#46445a"), hex("#6a6882"), hex("#a2a0bc")];
const GOLD = P.gold;
const BONE = [hex("#4a4238"), ...P.bone];
const ROPE = [hex("#3a2c1c"), hex("#6a5434"), hex("#9a8058"), hex("#c8b088")];

function coin(c: PC, x: number, y: number, flat = true) {
  if (flat) {
    c.ellipse(x, y, 1.6, 1.1, GOLD[1]);
    c.ellipse(x - 0.3, y - 0.3, 1.1, 0.7, GOLD[3]);
    c.set(x - 1, y - 1, GOLD[4]);
  } else {
    c.rect(x - 1, y - 1.5, 2, 3, GOLD[2]);
    c.rect(x - 1, y - 1.5, 1, 2, GOLD[3]);
    c.set(x, y + 1, GOLD[1]);
  }
}

/** Кожаный мешок с завязкой (k — масштаб для босса). Основание — нижний край холста. */
function drawBag(r: number, k: number): PC {
  const W = Math.round(22 * k), H = Math.round(22 * k);
  const c = new PC(W, H);
  const cx = W / 2, g = H - 1;
  const R = rr(r);
  const body = k > 1 && r !== 3 ? [hex("#1e1422"), ...P.cloth.purple] : LEATHER;
  // тело: тяжёлое, осевшее на землю, шире книзу
  c.shadedEllipse(cx, g - 6 * k, 8.4 * k, 6.6 * k, body, [-0.6, -0.75], true, g + 1);
  c.shadedEllipse(cx - 0.5, g - 9.5 * k, 6.4 * k, 4.6 * k, body, [-0.6, -0.75], true, g - 6 * k);
  c.rect(cx - 6 * k, g, 12 * k, 1, body[1]);
  // складка-тень под горловиной и вертикальная ложбинка
  const ny = Math.round(g - 14 * k);
  c.ellipse(cx + 0.5, ny + 4 * k, 3 * k, 1.2 * k, body[1]);
  c.ellipse(cx - 0.5, ny + 3.6 * k, 2.4 * k, 0.8 * k, body[2]);
  for (let y = ny + 5 * k; y < g - 3 * k; y++) { c.set(cx + 2 * k, y, body[1]); c.set(cx + 2 * k - 1, y, body[3]); }
  // горловина
  c.poly([[cx - 2.6 * k, ny + 3.2 * k], [cx + 2.6 * k, ny + 3.2 * k], [cx + 1.8 * k, ny], [cx - 1.8 * k, ny]], (x) => body[x < cx - 1 ? 3 : x > cx + 1 ? 1 : 2]);
  // оборка из трёх лепестков
  for (const [dx, dy, s] of [[-2.8, 0.4, 1], [2.8, 0.2, 1], [0, -0.8, 1.15]] as const)
    c.shadedEllipse(cx + dx * k, ny - 1 + dy * k, 2.4 * k * s, 1.8 * k * s, body, [-0.6, -0.75], true);
  c.ellipse(cx + 0.3, ny - 1.2 * k, 1.8 * k, 0.8 * k, body[0]);
  // монеты в горловине
  coin(c, cx - 0.8, ny - 1.6 * k);
  coin(c, cx + 1.6, ny - 1.1 * k);
  // завязка: шнур в 2 px цвета редкости (у обычной — пеньковый), бант справа
  const cord = r ? R : ROPE;
  const cy = ny + 2 * k;
  c.rect(cx - 2.8 * k, cy, 5.6 * k, 2, cord[1]);
  c.rect(cx - 2.8 * k, cy, 5.6 * k, 1, cord[2]);
  c.set(cx - 2 * k, cy, cord[3]);
  for (const [dx, dy] of [[1.6, -0.6], [3.4, 0.4]] as const) c.shadedEllipse(cx + 2.6 * k + dx, cy + dy + 1, 1.5, 1.2, cord, [-0.6, -0.7], true);
  c.line(cx + 3.2 * k, cy + 2, cx + 3.8 * k, cy + 4.5 * k, cord[1], 2);
  c.set(cx + 3.2 * k, cy + 2, cord[3]);
  // камень-застёжка в узле у редких
  const gx = cx + 2.6 * k, gy = cy + 0.6;
  if (r) {
    c.ellipse(gx, gy + 0.5, 1.6, 1.6, R[1]);
    c.ellipse(gx - 0.3, gy + 0.2, 1, 1, R[3]);
    c.set(gx - 1, gy, R[4]);
  } else c.ellipse(gx, gy + 0.5, 1.3, 1.3, ROPE[0]);
  // легендарная и боссовая: золотая печать на боку
  if (r === 3 || k > 1) {
    const sx = cx - 2.6 * k, sy = g - 4.8 * k;
    c.shadedEllipse(sx, sy, 2 * k, 2 * k, GOLD, [-0.6, -0.7], true);
    c.ellipse(sx + 0.4, sy + 0.4, 0.9 * k, 0.9 * k, r ? R[1] : GOLD[1]);
    c.set(sx - 1, sy - 1, GOLD[4]);
  }
  return c.outline(OUTLINE);
}

/** Окованный сундучок с черепом-замком (вид спереди, крышка-полуцилиндр). */
function drawChest(r: number, k: number): PC {
  const W = Math.round(22 * k), H = Math.round(19 * k);
  const c = new PC(W, H);
  const R = rr(r);
  const band = r === 3 ? GOLD : IRON;
  const w = Math.round(17 * k), x0 = Math.round((W - w) / 2), x1 = x0 + w;
  const g = H - 1, lip = Math.round(g - 8 * k), cx = x0 + w / 2;
  // корпус: доски
  c.shadedRect(x0, lip, w, g - lip + 1, WOOD, 0);
  for (let y = lip + Math.round(3.5 * k); y < g - 1; y += Math.round(3.5 * k)) { c.rect(x0 + 1, y, w - 2, 1, WOOD[1]); c.rect(x0 + 1, y + 1, w - 2, 1, WOOD[3]); }
  for (const x of [x0 + Math.round(w * 0.5)]) for (let y = lip + 2; y < g; y++) if ((y - lip) % 7 < 3) c.set(x, y, WOOD[1]);
  // крышка-купол
  c.shadedEllipse(cx, lip + 0.5, w / 2, 6.5 * k, WOOD, [-0.55, -0.85], true, lip + 1);
  for (let x = x0 + 3; x < x1 - 4; x++) if (x % 4) c.set(x, Math.round(lip - 6.5 * k + 1.5 + Math.pow((x - cx) / (w / 2), 2) * 5 * k), WOOD[4]);
  // обод между крышкой и корпусом (2 px), щель светится цветом редкости
  c.rect(x0, lip, w, 2, band[2]);
  c.rect(x0, lip, w, 1, band[3]);
  c.rect(x0, lip + 2, w, 1, r ? R[2] : band[0]);
  if (r) for (let x = x0 + 1; x < x1 - 1; x++) { c.set(x, lip + 3, withA(R[1], 150)); if (x % 3 === 0) c.set(x, lip + 2, R[3]); }
  // вертикальные полосы с заклёпками (2 px), по куполу и корпусу
  const bw = Math.max(2, Math.round(2 * k));
  for (const bx of [x0 + Math.round(2.5 * k), x1 - Math.round(2.5 * k) - bw]) {
    for (let y = 0; y <= g; y++) for (let i = 0; i < bw; i++) if (c.alpha(bx + i, y)) c.set(bx + i, y, band[i === 0 ? 3 : 1]);
    for (let y = 0; y <= g; y++) if (c.alpha(bx, y) && !c.alpha(bx, y - 1)) { c.set(bx, y, band[4]); break; }
    for (const ry of [lip + 4 * k, g - 2]) { c.set(bx, ry, band[4]); c.set(bx + 1, ry, band[2]); }
  }
  // кованые уголки
  for (const [ux, s] of [[x0, 1], [x1 - 1, -1]] as const) { c.rect(Math.min(ux, ux + s * 2), g - 2, 3, 3, band[s > 0 ? 2 : 1]); c.set(ux + s, g - 1, band[4]); }
  // череп-замок на ободе
  const sx = cx, sy = lip + 1.5 * k;
  c.shadedEllipse(sx, sy, 2.7 * k, 2.4 * k, BONE, [-0.6, -0.7], true);
  c.rect(sx - 1.5 * k, sy + 1.4 * k, 3 * k, 1.8 * k, BONE[2]);
  c.rect(sx - 1.5 * k, sy + 1.4 * k, 1, 1.8 * k, BONE[3]);
  for (let i = 0; i < 3 * k; i += 2) c.set(sx - 1.2 * k + i, sy + 2.4 * k, BONE[0]);
  for (const ex of [sx - 1.4 * k, sx + 0.5 * k]) {
    c.rect(Math.round(ex), Math.round(sy - 0.2), Math.max(1, Math.round(1 * k)), Math.max(1, Math.round(1.2 * k)), r ? R[2] : OUTLINE);
    if (r) c.set(Math.round(ex), Math.round(sy - 0.2), R[4]);
  }
  c.set(sx - 0.3, sy + 1, BONE[0]);
  // камень во лбу у редких
  if (r) { c.rect(Math.round(sx - 1), Math.round(sy - 2.6 * k), 2, 2, R[1]); c.set(Math.round(sx - 1), Math.round(sy - 2.6 * k), R[4]); }
  // боссовый: монеты на крышке
  if (k > 1) { coin(c, x0 + 6, lip - 3.5 * k); coin(c, x1 - 6, lip - 3 * k, false); }
  return c.outline(OUTLINE);
}

export const LOOT_DRAW: Record<LootVariant, (r: number, k: number) => PC> = { bag: drawBag, chest: drawChest };

/** Вклейка с масштабом вокруг нижней середины (ближайший сосед). */
function place(dst: PC, src: PC, cx: number, bottom: number, sx = 1, sy = 1) {
  const w = Math.ceil(src.w * sx) + 2, h = Math.ceil(src.h * sy) + 2;
  for (let y = Math.floor(bottom - h); y <= bottom; y++) for (let x = Math.floor(cx - w / 2); x <= cx + w / 2; x++) {
    const u = Math.floor((x + 0.5 - cx) / sx + src.w / 2), v = Math.floor((y + 0.5 - bottom) / sy + src.h);
    const p = src.get(u, v);
    if (p && p[3]) dst.set(x, y, p);
  }
}
const ease = {
  inQuad: (t: number) => t * t,
  outQuad: (t: number) => 1 - (1 - t) * (1 - t),
  inOutSine: (t: number) => 0.5 - Math.cos(Math.PI * t) / 2,
};
/** Звёздочка-блик: крест с белым центром (s 0..1 — фаза появления). */
function sparkle(c: PC, x: number, y: number, s: number, R: Ramp) {
  if (s <= 0.08) return;
  const a = Math.round(255 * Math.min(1, s * 1.4));
  const arm = s > 0.6 ? 3 : s > 0.3 ? 2 : 1;
  for (let i = 1; i <= arm; i++) {
    const col = withA(i === arm ? R[2] : R[3], a * (i === arm ? 0.7 : 1));
    c.set(x + i, y, col); c.set(x - i, y, col); c.set(x, y + i, col); c.set(x, y - i, col);
  }
  if (s > 0.5) for (const [dx, dy] of [[1, 1], [-1, -1], [1, -1], [-1, 1]]) c.set(x + dx, y + dy, withA(R[3], a * 0.45));
  c.set(x, y, withA(R[4], a));
}

/** Лист 20 кадров: падение и отскок (0..9), покой с мерцанием (10..19). */
export function buildLootSheet(variant: LootVariant, r: number, boss: boolean, vis = true) {
  const k = boss ? 1.35 : 1;
  const obj = LOOT_DRAW[variant](r, k);
  // заметность на любой земле: светлый тёплый контур 1 px поверх тёмного (нейтральный, не цвет редкости)
  if (vis) obj.outline(VIS_RING);
  const FW = obj.w + 12, FH = obj.h + 16, G = FH - 3, CX = FW / 2;
  const R = rr(r);
  const sheet = new PC(FW * LOOT_FRAMES, FH);
  // разлетевшиеся монеты (у мешка — всегда, у сундучка — у боссового и легендарного)
  const spill: [number, number][] = variant === "bag" || boss || r === 3 ? [[-obj.w / 2 - 2, 0], [obj.w / 2 + 1, 1], [-obj.w / 2 + 2, 1.5]] : [];
  if (r === 3 || boss) spill.push([obj.w / 2 + 3.5, -0.5]);
  const glow = (f: PC, amp: number) => {
    if (!r) return;
    const t = hex(RARITY[r]);
    for (let y = G - 6; y <= G + 3; y++) for (let x = 0; x < FW; x++) {
      const d = Math.hypot((x + 0.5 - CX) / (obj.w * 0.62), (y + 0.5 - G) / 4.2);
      if (d < 1) f.set(x, y, withA(t, Math.round((1 - d) * amp)));
    }
  };
  const shadow = (f: PC, lift: number) => {
    const rx = (obj.w * 0.42) * (1 - lift / 40), a = 110 * (1 - lift / 30);
    // мягкое тёмное пятно под предметом: широкий слабый слой и плотное ядро
    if (vis) f.ellipse(CX + 0.5, G + 0.5, rx + 3, 3, withA(OUTLINE, Math.round(a * 0.5)));
    f.ellipse(CX + 0.5, G + 0.5, rx, vis ? 2.2 : 1.8, withA(OUTLINE, Math.round(vis ? a * 1.25 : a)));
  };
  const frames: PC[] = [];
  // 0..9: падение (easeIn), удар со сплющиванием, отскок (easeOut), осадка
  const drop: [number, number, number][] = [
    [14 * (1 - ease.inQuad(0)), 0.9, 1.12], [14 * (1 - ease.inQuad(0.45)), 0.92, 1.1], [14 * (1 - ease.inQuad(0.78)), 0.95, 1.06],
    [0, 1.16, 0.8], [0, 1.08, 0.9], [4 * ease.outQuad(0.6), 0.97, 1.05], [4, 1, 1.02], [4 * (1 - ease.inQuad(0.6)), 1, 1], [0, 1.06, 0.93], [0, 1, 1],
  ];
  drop.forEach(([lift, sx, sy], i) => {
    const f = new PC(FW, FH);
    if (i >= 3) glow(f, 60 * ease.outQuad(Math.min(1, (i - 3) / 6)));
    shadow(f, lift);
    // монеты вылетают на ударе и катятся по дуге
    if (i >= 3) {
      const t = ease.outQuad(Math.min(1, (i - 3) / 5));
      spill.forEach(([dx, dy], j) => {
        const hop = Math.sin(Math.PI * Math.min(1, t * 1.1)) * (5 + j);
        coin(f, CX + dx * t, G - 1 + dy * t - hop, t > 0.95 || j % 2 === 0);
      });
    }
    place(f, obj, CX, G - Math.round(lift), sx, sy);
    // пыль/пепел на ударе
    if (i >= 3 && i <= 6) {
      const t = ease.outQuad((i - 3) / 3), a = Math.round(170 * (1 - t));
      for (const s of [-1, 1]) {
        const px = CX + s * (obj.w / 2 + 1 + 4 * t), py = G - 1 - 2 * t;
        f.ellipse(px, py, 2 + t, 1.5 + t * 0.6, withA(P.ash[4], a));
        f.ellipse(px - s, py - 0.5, 1.2, 1, withA(P.bone[2], Math.round(a * 0.8)));
      }
    }
    frames.push(f);
  });
  // 10..19: покой; у редких — пульс ореола, блик бежит по металлу, звёздочки; у эпика и легендарки — искры вверх
  const spots: [number, number][] = [[CX - obj.w / 2 + 1, G - obj.h + 4], [CX + obj.w / 2 - 1, G - obj.h * 0.55], [CX - obj.w * 0.15, G - obj.h - 1]];
  for (let i = 0; i < 10; i++) {
    const f = new PC(FW, FH), ph = i / 10;
    glow(f, r ? 55 + 45 * ease.inOutSine(ph < 0.5 ? ph * 2 : 2 - ph * 2) * (r >= 2 ? 1.3 : 1) : 0);
    shadow(f, 0);
    spill.forEach(([dx, dy]) => coin(f, CX + dx, G - 1 + dy, true));
    place(f, obj, CX, G);
    if (r) {
      // косой блик по предмету (кадры 1..5)
      if (i >= 1 && i <= 5) {
        const t = ease.inOutSine((i - 1) / 4), bx = CX - obj.w / 2 + t * obj.w;
        for (let y = G - obj.h; y < G; y++) for (const o of [-1, 0, 1]) {
          const x = Math.round(bx + (G - y) * 0.5 + o - obj.h * 0.25);
          const p = f.get(x, y);
          if (p && p[3] > 200 && p[0] + p[1] + p[2] > 330) f.set(x, y, withA(o ? R[3] : R[4], o ? 110 : 190));
        }
      }
      spots.slice(0, r === 1 ? 2 : 3).forEach(([x, y], j) => {
        const t = (ph + j * 0.37) % 1;
        sparkle(f, Math.round(x), Math.round(y), Math.sin(Math.PI * Math.min(1, t / 0.6)) * (t < 0.6 ? 1 : 0), R);
      });
      if (r >= 2) for (let j = 0; j < 3; j++) {
        const t = (ph + j / 3) % 1, y = G - 3 - ease.outQuad(t) * (obj.h + 4), x = CX + (j - 1) * obj.w * 0.32 + Math.sin(t * 6 + j) * 1.2;
        const a = Math.round(230 * Math.sin(Math.PI * t));
        f.rect(Math.round(x), Math.round(y), 2, 2, withA(R[2], a));
        f.set(Math.round(x), Math.round(y), withA(R[4], a));
      }
    }
    frames.push(f);
  }
  frames.forEach((f, i) => sheet.blit(f, i * FW, 0));
  return { sheet, fw: FW, fh: FH, ground: G };
}

/** Объекты для манифеста: objects/loot_r{0..3}[_boss].png (лист 20×1). */
export function lootObjects(): Record<string, () => PC> {
  const out: Record<string, () => PC> = {};
  for (let r = 0; r < 4; r++) for (const boss of [false, true]) out[`loot_r${r}${boss ? "_boss" : ""}`] = () => buildLootSheet(LOOT_VARIANT, r, boss).sheet;
  return out;
}
