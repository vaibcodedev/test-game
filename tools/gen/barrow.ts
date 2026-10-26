/**
 * Курган короля Морта под статуей в Мортхейме (shared/cities.ts, CAP_EXTRA.umbrath: ["umb_barrow", -2, 2]).
 * Кадр 128×152, опора — нижняя середина: след 4×4 клетки (128×128 px) внизу кадра, над ним ещё 24 px под подпорную стену.
 * Вид 3/4, свет сверху слева (как дома и реквизит 141): подпорная стена кольцом из тёмного камня, поверх неё сужающийся
 * земляной склон в сухой траве и плоская вершина с плитами и костями; на юге — лестница. Центр вершины — там, где стоит
 * статуя (центр следа 4×4 по центру кадра, опущен на высоту кургана). Лежит на земле (GROUND_OBJECTS): статуя всегда сверху.
 * Тень — tools/gen/shadow.ts (shadowFoot по следу). Запуск (только свой кадр): npx tsx tools/gen/barrow.ts
 */
import fs from "node:fs";
import path from "node:path";
import { PC, hash01, hex, mix, pnoise, ramp, shade, type RGBA } from "./canvas";
import { P } from "./palette";
import { OUT, tone } from "./walls141-lib";
import { shadowFoot } from "./shadow";

const W = 128, H = 152;
/** Центр вершины, высота стены, подъём склона. */
const CX = 64, TOP_Y = 87, WALL = 10, RISE = 4;
const GY = TOP_Y + WALL + RISE; // центр основания по y (после подъёма вершина сидит в TOP_Y)
const STONE = P.stone, DIRT = P.dirt;
const GRASS_DEAD = ramp("#2c2a1a", "#4a4626", "#6a6636", "#8a8446");
const BONE = P.bone;

/** Суперэллипс (скруглённый квадрат): <=1 — внутри. */
const f = (x: number, y: number, cx: number, cy: number, hx: number, hy: number) => (Math.abs((x - cx) / hx) ** 3 + Math.abs((y - cy) / hy) ** 3) ** (1 / 3);

export function umbBarrow(): PC {
  const c = new PC(W, H);
  const n = (x: number, y: number, cell: number, seed: number) => pnoise(x, y, cell, 256, seed);
  // основание: ground-контур (S0), стена поднимает его на WALL, склон — ещё на RISE
  const S0 = (x: number, y: number) => f(x, y, CX, GY, 62, 51);
  const S1 = (x: number, y: number) => f(x, y, CX, GY - WALL, 62, 51);       // верх стены
  const S2 = (x: number, y: number) => f(x, y, CX, GY - WALL - 3, 54, 47);       // внутренняя кромка венца
  const S3 = (x: number, y: number) => f(x, y, CX, TOP_Y - 1, 42, 35);            // вершина

  // тень на земле: контактная, по следу основания
  const fp: [number, number][] = [];
  for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a); fp.push([CX + 61 * Math.sign(ca) * Math.abs(ca) ** (2 / 3), GY + 50 * Math.sign(sa) * Math.abs(sa) ** (2 / 3)]); }
  shadowFoot(c, fp, 24);

  // 1. лицо стены: между основанием и верхом стены (кладка рядами, смещение по рядам)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (S0(x + 0.5, y + 0.5) > 1 || S1(x + 0.5, y + 0.5) <= 1) continue;
    const row = Math.floor((y - 40) / 5), off = (row % 2) * 6;
    const seam = (y - 40) % 5 === 4 || (x + off + row * 3) % 12 === 11;
    const side = (x - CX) / 62;            // справа лицо в тени
    let t = 2.5 - Math.max(0, side) * 1.0 + (side < -0.55 ? 0.3 : 0) + (n(x, y, 3, 5) - 0.5) * 1.1 + (hash01(x >> 1, row, 9) - 0.5) * 0.9;
    if (seam) t -= 1.1;
    if (y - 0 > 0) t -= Math.max(0, (S0(x + 0.5, y - 3.5) - 0.985)) * 18 * 0; // место для будущих подтёков
    c.set(x, y, tone(STONE, t));
  }
  // нижний край стены темнее (приземление) и мох у основания
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (S0(x + 0.5, y + 0.5) > 1 || S0(x + 0.5, y - 1.5) <= 1) continue;
    if (c.alpha(x, y)) c.set(x, y, shade(c.get(x, y)!, 0.72));
  }
  for (let i = 0; i < 70; i++) {
    const a = hash01(i, 1, 21) * Math.PI * 2, x = Math.round(CX + Math.cos(a) * 61 * 0.98), y = Math.round(GY + Math.sin(a) * 51 * 0.98 - 1);
    if (Math.sin(a) < -0.2) continue;
    const L = 2 + Math.floor(hash01(i, 2, 22) * 4);
    for (let k = 0; k < L; k++) if (c.alpha(x, y - k) && S0(x + 0.5, y - k + 0.5) <= 1) c.set(x + (k % 2), y - k, GRASS_DEAD[1 + (k > 1 ? 1 : 0) + (hash01(i, k, 23) > 0.7 ? 1 : 0)]);
  }
  // трещины и выбитые блоки на лице
  for (const [cx0, cy0, len] of [[34, 138, 7], [82, 143, 6], [104, 124, 5], [22, 118, 6]] as [number, number, number][]) {
    let x = cx0, y = cy0;
    for (let k = 0; k < len; k++) { if (c.alpha(x, y)) c.set(x, y, STONE[0]); x += k % 3 === 1 ? 1 : 0; y -= 1; }
  }

  // 2. венец стены: плоская верхняя грань кольцом (плиты чередуются по тону)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const s1 = S1(x + 0.5, y + 0.5), s2 = S2(x + 0.5, y + 0.5);
    if (s1 > 1 || s2 <= 1) continue;
    const ang = Math.atan2(y - (GY - WALL), (x - CX) * 51 / 62), seg = Math.floor(((ang + Math.PI) / (Math.PI * 2)) * 36);
    const edge = s1 > 0.965 ? 0.7 : (s2 < 1.05 ? -0.5 : 0);
    const joint = Math.abs(((ang + Math.PI) / (Math.PI * 2)) * 36 - seg - 0.5) > 0.46;
    const light = -((x - CX) / 62 * 0.5 + (y - GY) / 51 * 0.6);
    c.set(x, y, tone(STONE, 3.0 + light * 0.9 + edge + (seg % 2 ? -0.25 : 0.15) + (joint ? -1.2 : 0) + (n(x, y, 3, 7) - 0.5) * 0.6));
  }

  // 3. внутренний склон: земля в сухой траве, светлее с северо-запада
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const s2 = S2(x + 0.5, y + 0.5), s3 = S3(x + 0.5, y + 0.5);
    if (s2 > 1 || s3 <= 1) continue;
    const u = Math.min(1, (s3 - 1) / 0.85);
    const dx = (x - CX) / 42, dy = (y - TOP_Y) / 35, l = Math.hypot(dx, dy) || 1;
    const lit = -((dx / l) * 0.6 + (dy / l) * 0.7) * u;
    const noise = n(x, y, 4, 11), grass = n(x + 40, y, 3, 13) > 0.52 + u * 0.05;
    const base = grass ? GRASS_DEAD : DIRT;
    c.set(x, y, tone(base, (grass ? 1.7 : 2.2) + lit * 1.8 + (noise - 0.5) * 1.2 - u * (dy > 0 ? 1.3 : 0.2)));
  }
  // тень венца на склоне (узкая полоса под внутренней кромкой с юга)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!c.alpha(x, y) || S2(x + 0.5, y + 0.5) > 1 || S3(x + 0.5, y + 0.5) <= 1) continue;
    if (S2(x + 0.5, y - 2.5) > 1.0 && S2(x + 0.5, y + 0.5) < 1) c.set(x, y, shade(c.get(x, y)!, 0.82));
  }

  // 4. вершина: утоптанная земля, пятна сухой травы, края темнее справа-снизу
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const s3 = S3(x + 0.5, y + 0.5);
    if (s3 > 1) continue;
    const rim = s3 > 0.88 ? (s3 - 0.88) * 7 : 0, light = -((x - CX) / 42 * 0.25 + (y - TOP_Y) / 35 * 0.3);
    const grass = n(x, y + 30, 5, 17) > 0.62;
    c.set(x, y, tone(grass ? GRASS_DEAD : DIRT, (grass ? 1.8 : 2.4) + light * 0.8 - rim * 0.9 + (n(x, y, 2, 19) - 0.5) * 0.9));
  }
  // пучки сухой травы на склоне и вершине
  for (let i = 0; i < 90; i++) {
    const x = Math.round(CX + (hash01(i, 5, 31) - 0.5) * 100), y = Math.round(GY - WALL - 8 + (hash01(i, 6, 31) - 0.5) * 80);
    if (S2(x + 0.5, y + 0.5) > 0.98 || !c.alpha(x, y)) continue;
    if (Math.abs(x - CX) < 20 && y > TOP_Y - 14 && y < TOP_Y + 8) continue; // под статуей
    if (Math.abs(x - CX) < 14 && y > TOP_Y + 12) continue; // лестница
    const L = 2 + Math.floor(hash01(i, 7, 31) * 3);
    for (let k = 0; k < L; k++) { c.set(x + Math.round(k * 0.4 * (hash01(i, 8, 31) - 0.5) * 2), y - k, GRASS_DEAD[Math.min(3, 1 + k)]); }
  }

  // 5. плиты: тёмные плоские камни на вершине и склоне (две-три сидят вокруг основания статуи)
  const slab = (cx: number, cy: number, w: number, h: number, tilt: number) => {
    const pts: [number, number][] = [[cx - w / 2, cy - h / 2 + tilt], [cx + w / 2, cy - h / 2 - tilt], [cx + w / 2, cy + h / 2 - tilt], [cx - w / 2, cy + h / 2 + tilt]];
    shadowFoot(c, pts.map(([x, y]) => [x, y + 1] as [number, number]), 2);
    c.poly(pts, (x, y) => tone(STONE, 2.6 + (n(x, y, 2, 23) - 0.5) * 0.9 - (y - cy) * 0.05));
    c.line(cx - w / 2 + 1, cy - h / 2 + tilt, cx + w / 2 - 1, cy - h / 2 - tilt, STONE[4], 1);
    c.line(cx - w / 2, cy + h / 2 + tilt, cx + w / 2, cy + h / 2 - tilt, STONE[0], 1);
  };
  slab(40, 98, 14, 7, 1); slab(92, 100, 12, 6, -1); slab(46, 70, 11, 6, 0); slab(86, 72, 10, 5, 1);
  slab(30, 80, 9, 5, -1); slab(98, 86, 9, 5, 0);
  slab(28, 112, 9, 5, 1); slab(100, 108, 8, 5, -1);

  // 6. кости: рёбра, берцовая, череп; рядом со статуей и на склоне
  const bone = (x: number, y: number, len: number, dir: 1 | -1, rot = 0) => {
    for (let k = 0; k < len; k++) c.set(x + k * dir, y + Math.round(k * rot), BONE[2 + (k % 2 ? 0 : 1)]);
    c.set(x - dir, y - 1, BONE[3]); c.set(x - dir, y + 1, BONE[3]); c.set(x + len * dir, y - 1, BONE[3]); c.set(x + len * dir, y + 1, BONE[2]);
  };
  bone(50, 108, 7, 1, -0.2); bone(76, 62, 6, -1, 0.15); bone(94, 96, 5, 1, 0); bone(32, 90, 5, 1, 0.3);
  // череп
  const skull = (x: number, y: number) => {
    c.ellipse(x, y, 3.2, 2.7, BONE[3]); c.ellipse(x - 0.5, y - 0.6, 2.2, 1.6, BONE[3]); c.rect(x - 1, y + 2, 3, 1, BONE[2]);
    c.set(x - 1, y, hex("#16101c")); c.set(x + 1, y, hex("#16101c")); c.set(x, y + 1, BONE[1]);
  };
  skull(60, 106); skull(30, 126);
  // груда рёбер
  for (let k = 0; k < 4; k++) c.line(104 + k, 76 + k * 2, 110 + k, 78 + k * 2, BONE[2], 1);

  // 7. лестница на юге: вырез в стене и склоне, 5 ступеней (светлая проступь, тёмный подступенок), щёки по бокам
  const stepTop = 120, stepBot = 150, n5 = 5, sh = (stepBot - stepTop) / n5;
  for (let k = 0; k < n5; k++) {
    const y1 = Math.round(stepBot - k * sh), y0 = Math.round(y1 - sh), hw = 11 - k * 0.6;
    for (let y = y0; y < y1; y++) for (let x = Math.round(CX - hw); x <= Math.round(CX + hw - 1); x++) {
      const tread = y < y0 + sh - 2.5 ;
      c.set(x, y, tone(STONE, tread ? 3.4 - k * 0.15 + (n(x, y, 2, 29) - 0.5) * 0.7 - (x > CX + hw - 3 ? 0.4 : 0) : 1.6 + (n(x, y, 2, 31) - 0.5) * 0.5));
    }
    // щёки ступеней
    for (const sx of [-1, 1]) for (let y = y0; y < y1; y++) { const x = Math.round(CX + sx * (hw + 1)); c.set(x, y, tone(STONE, sx < 0 ? 3.0 : 1.1)); c.set(x + sx, y, tone(STONE, sx < 0 ? 2.2 : 0.6)); }
  }
  // плита у подножия лестницы
  c.rect(CX - 12, stepBot - 1, 24, 2, tone(STONE, 2.0));

  return c.outline(OUT);
}

if (process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("tools/gen/barrow.ts")) {
  const root = process.cwd();
  const png = path.join(root, "client/public/assets/objects/umb_barrow.png");
  const pc = umbBarrow();
  pc.save(png);
  const manPath = path.join(root, "client/public/assets/manifest.json");
  const man = JSON.parse(fs.readFileSync(manPath, "utf8"));
  man.objects.umb_barrow = { w: pc.w, h: pc.h };
  fs.writeFileSync(manPath, JSON.stringify(man, null, 1));
  console.log(`  umb_barrow ${pc.w}×${pc.h} → ${png}`);
}
void mix; void (null as unknown as RGBA);
