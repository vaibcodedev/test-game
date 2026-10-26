/** Поля вечных битв, форты и лагеря: анимации и объекты шага 9 задачи 132 (в игру — шаг 10).
 *
 *  Запуск: node node_modules/tsx/dist/cli.mjs tools/gen/battlefield.ts (после tools/gen/vendor.ts, который даёт статичные v_* из паков).
 *  Вход:   vendor/<пак>/src (CraftPix Fortress Kit и Undead, [LPC] Blacksmith, [LPC] Flames, [LPC] Siege Weapons, Elthen Training Dummy,
 *          Devkidd Pixel Fire Pack 1 и 3) — только данные: ничего из архивов не запускается.
 *  Выход:  client/public/assets/vfx/r/bf-*.png — кадры из паков (закрытые лицензии: хранить как Schwarnhild, «r» в манифесте);
 *          client/public/assets/vfx/bf-*.png — свои анимации; client/public/assets/objects/bf_*.png — свои статичные объекты;
 *          client/public/assets/vfx/manifest.json — записи листов (кадры в ряд; клиент грузит их сам);
 *          tools/out/map-step9/ — монтажи «наш | эталон из пака» и листы кадров (в .gitignore).
 *  Кадры вырезаются из листов, перекрашиваются в рампы палитры по оттенку (яркость каждой группы подгоняется под рампу по статистике
 *  всего набора кадров, как в vendor.ts), контур — OUTLINE снаружи. Циклы 12–16 кадров с плавными задержками (easing), без одиночных пикселей.
 *  Недостающее (башни стен, шатры фракций, тела, павшая лошадь, повозки, требушет, таран, осадная башня, оружие и колья) рисуется
 *  в bf-gen.ts в том же стиле. */
import fs from "node:fs";
import path from "node:path";
import { PC, OUTLINE, type RGBA, type Ramp } from "./canvas";
import { P } from "./palette";
import { ROOT, readPng, writePng, crop, trim, scaleNN, downscaleMode, tidy, luma, hsv, opaqueBox, fill, paintGround, chipText, BG } from "./vendor-lib";

export const ASSETS = path.join(ROOT, "client/public/assets");
export const OUT = path.join(ROOT, "tools/out/map-step9");
export interface Anim { id: string; frames: PC[]; fps: number; anchor: [number, number]; /** кадры из паков с закрытой лицензией */ r?: boolean }

// ---------- перекраска набора кадров ----------
interface Px { r: number; g: number; b: number; h: number; s: number; v: number; y: number }
export type Rule = { ramp: Ramp; when?: (p: Px) => boolean; abs?: boolean };
const pct = (a: number[], q: number) => a[Math.min(a.length - 1, Math.max(0, Math.floor(q * (a.length - 1))))];
/** Перекраска набора кадров одним словарём правил: статистика яркости по группе — по всем кадрам набора. Прозрачное остаётся прозрачным. */
export function recolor(frames: PC[], rules: Rule[], dark = 14): PC[] {
  const grp = (c: RGBA) => {
    const [h, s, v] = hsv(c[0], c[1], c[2]);
    const px: Px = { r: c[0], g: c[1], b: c[2], h, s, v, y: luma(c[0], c[1], c[2]) };
    const gi = rules.findIndex((ru) => !ru.when || ru.when(px));
    return { gi: gi < 0 ? rules.length - 1 : gi, y: px.y };
  };
  const pool: number[][] = rules.map(() => []);
  for (const f of frames) for (let i = 0; i < f.w * f.h; i++) if (f.data[i * 4 + 3] >= 100) {
    const g = grp([f.data[i * 4], f.data[i * 4 + 1], f.data[i * 4 + 2], 255]);
    if (g.y > dark) pool[g.gi].push(g.y);
  }
  const maps = rules.map((ru, gi) => {
    const s = [...pool[gi]].sort((a, b) => a - b);
    const ry = ru.ramp.map((c) => luma(c[0], c[1], c[2]));
    const lo = s.length ? pct(s, 0.02) : 0, hi = s.length ? pct(s, 0.98) : 255, spread = Math.max(1, hi - lo);
    const rMin = ry[0], rMax = ry[ry.length - 1], rMid = (rMin + rMax) / 2, mid = (lo + hi) / 2;
    const k = Math.min(1.6, Math.max(0.6, (rMax - rMin) / spread)), w = ru.abs ? 0 : Math.min(1, spread / (0.6 * (rMax - rMin)));
    return (y: number): RGBA => {
      const t = w * (rMid + (y - mid) * k) + (1 - w) * y;
      let best = 0, bd = 1e9;
      ry.forEach((v, i) => { const d = Math.abs(v - t); if (d < bd) { bd = d; best = i; } });
      return ru.ramp[best];
    };
  });
  return frames.map((f) => {
    const o = new PC(f.w, f.h);
    for (let i = 0; i < f.w * f.h; i++) {
      if (f.data[i * 4 + 3] < 100) continue;
      const c: RGBA = [f.data[i * 4], f.data[i * 4 + 1], f.data[i * 4 + 2], 255];
      const g = grp(c);
      const out = g.y <= dark ? OUTLINE : maps[g.gi](g.y);
      o.data[i * 4] = out[0]; o.data[i * 4 + 1] = out[1]; o.data[i * 4 + 2] = out[2]; o.data[i * 4 + 3] = 255;
    }
    return o;
  });
}

/** Общий кадр: все кадры на холсте с общим размером по объединённой рамке; опора — нижняя середина. Вернёт кадры и рамку. */
export function unify(frames: PC[], pad = 1): PC[] {
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  for (const f of frames) { const b = opaqueBox(f); if (!b) continue; x0 = Math.min(x0, b[0]); y0 = Math.min(y0, b[1]); x1 = Math.max(x1, b[0] + b[2]); y1 = Math.max(y1, b[1] + b[3]); }
  const w = x1 - x0 + pad * 2, h = y1 - y0 + pad * 2;
  return frames.map((f) => { const o = new PC(w, h); o.blit(crop(f, x0, y0, x1 - x0, y1 - y0), pad, pad); return o; });
}
/** Масштаб набора кадров единым коэффициентом (по блокам, преобладающий цвет), чистка одиночных пикселей. */
export function shrinkSet(frames: PC[], k: number): PC[] {
  const w2 = Math.max(1, Math.round(frames[0].w * k)), h2 = Math.max(1, Math.round(frames[0].h * k));
  return frames.map((f) => tidy(downscaleMode(f, w2, h2, 0.5), 1));
}
/** Контур снаружи каждого кадра, холст +1 px со всех сторон. */
export function outlineSet(frames: PC[], diagonal = false): PC[] {
  return frames.map((f) => { const o = new PC(f.w + 2, f.h + 2); o.blit(f, 1, 1); return o.outline(OUTLINE, diagonal); });
}
export const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
/** Выборка кадров по последовательности (для задержек на концах: покой — несколько тактов, быстрая часть — по одному). */
export const seq = (frames: PC[], order: number[]) => order.map((i) => frames[i]);

// ---------- запись ----------
const MF = path.join(ASSETS, "vfx/manifest.json");
const manifestAdd: Record<string, unknown> = {};
export function saveAnim(a: Anim) {
  const w = a.frames[0].w, h = a.frames[0].h;
  const row = new PC(w * a.frames.length, h);
  a.frames.forEach((f, i) => row.blit(f, i * w, 0));
  const dir = path.join(ASSETS, "vfx", a.r ? "r" : "");
  writePng(row, path.join(dir, `${a.id}.png`));
  manifestAdd[a.id] = { frameW: w, frameH: h, frames: a.frames.length, fps: a.fps, anchor: a.anchor, blend: "normal", ...(a.r ? { r: 1 } : {}) };
}
export function flushManifest() {
  const m = JSON.parse(fs.readFileSync(MF, "utf8")) as Record<string, unknown>;
  for (const k of Object.keys(m)) if (k.startsWith("bf-")) delete m[k];
  Object.assign(m, manifestAdd);
  const sorted = Object.fromEntries(Object.entries(m).sort(([a], [b]) => (a < b ? -1 : 1)));
  fs.writeFileSync(MF, JSON.stringify(sorted, null, 1) + "\n");
}
/** Статичный объект в игру: холст кратен 32, опора — нижняя середина (как padGrid в vendor.ts). */
export function saveObject(id: string, pc: PC) {
  const t = trim(pc).pc, W = Math.ceil(t.w / 32) * 32, H = Math.ceil(t.h / 32) * 32;
  const o = new PC(W, H);
  o.blit(t, Math.floor((W - t.w) / 2), H - t.h);
  writePng(o, path.join(ASSETS, "objects", `${id}.png`));
  return o;
}

// ---------- вход: листы паков ----------
const V = (p: string) => path.join(ROOT, "vendor", p);
const cut = (sheet: PC, cols: number, rows: number, fw: number, fh: number, row: number, n = cols) => Array.from({ length: n }, (_, i) => crop(sheet, i * fw, row * fh, fw, fh));
const FIRE_RAMP = P.magic.fire, ASH = P.ash;
const R_STONE: Rule = { ramp: P.stone }, R_WOOD: Rule = { ramp: P.wood }, R_IRON: Rule = { ramp: P.darkSteel };
const BROWN = (p: Px) => p.s >= 0.3 && p.h >= 8 && p.h < 50;
const R_FIRE: Rule = { ramp: FIRE_RAMP.slice(1), when: (p) => p.s >= 0.4 && p.v >= 0.62 && (p.h <= 62 || p.h >= 340), abs: true };

export function buildPackAnims(): Anim[] {
  const out: Anim[] = [];

  // --- горн кузни: [LPC] Blacksmith, кадры 0 (холодный) и 1–3 (огонь); 12 тактов мерцания с неровными задержками
  const smith = readPng(V("lpc-blacksmith/src/lpc-blacksmith/blacksmith-smelter.png"));
  const forge = (id: string, x0: number, w: number, h: number, scale: number, order: number[], dir?: string) => {
    const raw = [0, 1, 2, 3].map((i) => crop(smith, x0 + i * w, 0, w, h));
    let fr = recolor(raw, [R_FIRE, { ramp: P.wood, when: BROWN }, R_STONE]);
    fr = unify(fr, 0);
    if (scale !== 1) fr = shrinkSet(fr, scale);
    fr = outlineSet(unify(fr, 0));
    out.push({ id, frames: seq(fr, order), fps: 8, anchor: [0.5, 1], r: true });
    return fr;
  };
  forge("bf-forge-cone", 256, 128, 192, 0.75, [1, 2, 3, 2, 1, 3, 2, 1, 2, 3, 1, 2]);
  forge("bf-forge-small", 0, 64, 128, 1, [1, 2, 3, 1, 3, 2, 1, 2, 3, 2, 1, 3]);

  // --- ворота: CraftPix Fortress Kit Gate.png, 6 кадров по 80×80 (закрыты → распахнуты); цикл туда-обратно по 12 тактам с торможением на концах
  const gate = readPng(V("craftpix-fortress-kit/src/Tileset/Gate.png"));
  const gf = outlineSet(unify(recolor(cut(gate, 6, 1, 80, 80, 0), [{ ramp: P.wood, when: BROWN }, R_STONE]), 0));
  out.push({ id: "bf-gate-stone", frames: seq(gf, [0, 0, 0, 1, 2, 3, 4, 5, 5, 5, 4, 3, 2, 1].slice(0, 14)), fps: 10, anchor: [0.5, 1], r: true });

  // --- манекен: Elthen Training Dummy, 3 ряда ударов; щит перекрашивается по фракциям
  const dummy = readPng(V("elthen-dummy/Training Dummy Sprite Sheet.png"));
  for (let row = 0; row < 3; row++) {
    const raw = cut(dummy, 8, 3, 32, 32, row, 8).filter((f) => opaqueBox(f));
    const fr = outlineSet(unify(recolor(raw, [{ ramp: P.leather, when: BROWN }, { ramp: P.bone.slice(1), when: (p) => p.s < 0.5 && p.v > 0.5 }, { ramp: P.leather }]), 0));
    out.push({ id: `bf-dummy-${row}`, frames: fr, fps: 12, anchor: [0.5, 1], r: true });
  }

  // --- огонь и дым: Devkidd Pixel Fire Pack 3 (красный, 16 кадров) и Pack 1 (дым), рампа огня игры; дым — вставка полукадров до 16
  const p3 = V("devkidd-fire3/src/Pixel Fire Asset Pack v3.2/Pixel Fire Asset Pack  v3.2 Floored/Pixel Fire Asset Pack v3.2 Floored Red");
  const frames = (dir: string, g: string, n: number) => Array.from({ length: n }, (_, i) => readPng(path.join(dir, g, `${g}_${i + 1}.png`)));
  const FIRE_ALL: Rule[] = [{ ramp: FIRE_RAMP, abs: false }];
  for (const [id, g] of [["s", "Group 4 - 1"], ["m", "Group 4 - 3"], ["l", "Group 4 - 4"], ["t", "Group 4 - 5"]] as const) {
    const fr = unify(recolor(frames(p3, g, 16), FIRE_ALL, 0), 0);
    out.push({ id: `bf-fire-${id}`, frames: fr, fps: 14, anchor: [0.5, 1], r: true });
  }
  const p1 = V("devkidd-fire1/src/Pixel fire asset pack v1.2/Pixel Fire Asset Pack Colored/fire asset smoke");
  const smoke = unify(recolor(frames(p1, "Smoke Dark - 4", 8), [{ ramp: ASH.slice(2) }], 0), 0).map((f) => f.map((c) => [c[0], c[1], c[2], 210] as RGBA));
  const smoke16: PC[] = [];
  smoke.forEach((f, i) => {
    smoke16.push(f);
    const g = smoke[(i + 1) % smoke.length], mid = new PC(f.w, f.h);
    for (let k = 0; k < f.w * f.h; k++) { // полукадр: пиксель берётся из того кадра, где он есть; пересечение — из следующего, края мягче (полупрозрачность)
      const a = f.data[k * 4 + 3], b = g.data[k * 4 + 3];
      if (!a && !b) continue;
      const src = b ? g : f;
      for (let q = 0; q < 3; q++) mid.data[k * 4 + q] = src.data[k * 4 + q];
      mid.data[k * 4 + 3] = a && b ? 205 : 130;
    }
    smoke16.push(mid);
  });
  out.push({ id: "bf-smoke", frames: smoke16, fps: 12, anchor: [0.5, 1], r: true });
  // LPC Flames: 12 кадров 16×24, ×2 целым масштабом
  const lf = Array.from({ length: 12 }, (_, i) => scaleNN(readPng(V(`lpc-flames/src/${String(i + 1).padStart(2, "0")}.png`)), 2));
  out.push({ id: "bf-flame-torch", frames: unify(recolor(lf, FIRE_ALL, 0), 0), fps: 10, anchor: [0.5, 1], r: true });

  // --- осадные машины: [LPC] Siege Weapons; слои собираются в кадр 128×128, 6 кадров выстрела растягиваются до 12 тактов (замах — долго, бросок — быстро)
  const sw = (n: string) => readPng(V(`lpc-siege-weapons/${n}.png`));
  const layerSets: Record<string, string[]> = {
    catapult: ["wheels-bg", "catapult_1", "wheels-fg"],
    ballista: ["wheels-bg", "ballista", "ballista-arm", "wheels-fg"],
  };
  const orders: Record<string, number[]> = { catapult: [0, 0, 0, 0, 1, 1, 2, 3, 4, 4, 5, 5], ballista: [0, 0, 0, 0, 1, 1, 2, 3, 4, 4, 5, 5] };
  for (const [name, layers] of Object.entries(layerSets)) {
    const L = layers.map(sw);
    for (const [dir, row] of [["s", 0], ["w", 2], ["n", 4]] as const) {
      const raw = Array.from({ length: 6 }, (_, i) => {
        const f = new PC(128, 128);
        for (const l of L) f.blit(crop(l, i * 128, row * 128, 128, 128), 0, 0);
        return f;
      });
      const fr = outlineSet(shrinkSet(unify(recolor(raw, [{ ramp: P.wood, when: BROWN }, { ramp: P.stone, when: (p) => p.s < 0.25 }, { ramp: P.wood }]), 0), 0.75));
      out.push({ id: `bf-${name}-${dir}`, frames: seq(fr, orders[name]), fps: 10, anchor: [0.5, 0.92], r: true });
    }
  }
  return out;
}

/** Лист кадров: ряд на анимацию, кадры подряд на нашей траве рядом с героем 32 px, подпись «id кадров fps размер». */
export function storyboard(anims: Anim[], k = 2): PC {
  const hero = trim(crop(readPng(path.join(ASSETS, "units/warrior.png")), 0, 0, 32, 32)).pc;
  const rows = anims.map((a) => ({ a, w: 40 + a.frames.length * (a.frames[0].w + 2), h: a.frames[0].h + 12 }));
  const W = Math.max(...rows.map((r) => r.w)), H = rows.reduce((s, r) => s + r.h, 0);
  const sh = new PC(W, H); fill(sh, BG);
  let y = 0;
  for (const r of rows) {
    paintGround(sh, 0, y, W, r.h, "grass");
    const base = y + r.h - 3;
    sh.blit(hero, 4, base - hero.h);
    r.a.frames.forEach((f, i) => sh.blit(f, 40 + i * (f.w + 2), base - Math.round(r.a.anchor[1] * f.h)));
    chipText(sh, `${r.a.id} ${r.a.frames.length}F ${r.a.fps}FPS ${r.a.frames[0].w}X${r.a.frames[0].h}`.toUpperCase(), 3, y + 2);
    y += r.h;
  }
  return scaleNN(sh, k);
}

if (process.argv[1] && path.resolve(process.argv[1]).endsWith("battlefield.ts")) {
  const t0 = Date.now();
  const anims = buildPackAnims();
  const gen = await import("./bf-gen");
  const gen2 = await import("./bf-gen2");
  // объёмные версии шатров, осадных машин, повозок и т. п. (tools/gen/volume-bf.ts) заменяют плоские с теми же id
  const objs = { ...gen.OBJECTS, ...gen2.OBJECTS, ...(await import("./volume-bf")).BF_VOLUME };
  const made: Record<string, PC> = {};
  for (const [id, f] of Object.entries(objs)) made[id] = saveObject(id, f());
  const genAnims = gen2.ANIMS();
  // только эталоны для монтажей bf-montage (в игре не стоят, аудит 2026-10-24) — в client/public не пишутся
  const REF_ONLY = new Set(["bf-gate-stone", "bf-flame-torch", "bf-fire-l", "bf-fire-t", "bf-catapult-w", "bf-ballista-w"]);
  for (const a of [...anims, ...genAnims]) if (!REF_ONLY.has(a.id)) saveAnim(a);
  flushManifest();
  fs.mkdirSync(OUT, { recursive: true });
  const all = [...anims, ...genAnims];
  for (let i = 0; i < all.length; i += 6) writePng(storyboard(all.slice(i, i + 6)), path.join(OUT, `anims-${i / 6}.png`));
  const { buildMontages } = await import("./bf-montage");
  buildMontages(made, all);
  console.log(`[battlefield] ${anims.length} анимаций из паков за ${Date.now() - t0} мс`);
}
