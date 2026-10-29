/**
 * Питомцы, проход 4: сборка листов, иконок и обзорных листов.
 * Модуль питомца (tools/gen/pets2/<имя>.ts) экспортирует `pet: PetDef` — рендер позы в вид и позы 6 анимаций; здесь общие эффекты:
 *  - урон: вспышка (кадры 1–2) поверх поз отдачи;
 *  - появление: печать-круг на земле, тело проявляется снизу вверх со светлой кромкой (позы — покой);
 *  - гибель: позы падения, затем тело рассыпается пеплом (последние 5 кадров), искры — в листе свечения.
 * Раскладка листа как у прохода 3 (tools/gen/pet-menagerie.ts кладёт его в игру без изменений): строки вниз, вверх, вбок;
 * idle 12 · act 16 · walk 12 · attack 10 · hurt 8 · spawn 12 · death 12.
 * Запуск (под замком): npx tsx tools/gen/pets2/build.ts --only=ash_bear,war_raven [--icons-only]
 *   → tools/out/pets/sheets/<id>.png (+ _glow, .json), tools/out/pets/icons/pet_<id>.png, tools/out/pets/p4/<id>.png (обзор ×3)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PC } from "../canvas";
import { groundBg, nightRect, scaleNN, shadowBlob, stackRows, text, type Row } from "../mobs/lib";
import { heroAt, loadAssets } from "../pets/petlib";
import { Cv, hash, hx, type C } from "./lib";

export type View = "front" | "back" | "side";
export type Fr = { img: Cv; emis: Cv };
export type AnimId = "idle" | "act" | "walk" | "attack" | "hurt" | "death";
export interface PetDef<P = unknown> {
  id: string; ru: string; N: number;
  /** летает (тело в верхней части кадра, тень отдельно) */
  fly?: boolean;
  /** ширина пятна тени в обзоре (px) */
  shadow: number;
  /** цвет печати появления и искр гибели: 3 тона (тёмный, средний, светлый) */
  fx?: [string, string, string];
  /** подпись живого действия и атаки (для обзора) */
  act: string; atk: string;
  render: (v: View, p: P) => Fr;
  anims: Record<AnimId, (v: View) => P[]>;
  /** иконка: вид и кадр покоя (по умолчанию вбок, кадр 0) */
  icon?: { view: View; anim?: AnimId; frame?: number; zoom?: number; focus?: [number, number] };
}
const ORDER: { id: AnimId | "spawn"; n: number; fps: number; loop: boolean; ru: string }[] = [
  { id: "idle", n: 12, fps: 10, loop: true, ru: "ПОКОЙ" },
  { id: "act", n: 16, fps: 10, loop: false, ru: "ЖИВОЕ ДЕЙСТВИЕ" },
  { id: "walk", n: 12, fps: 12, loop: true, ru: "ХОДЬБА / ПОЛЁТ" },
  { id: "attack", n: 10, fps: 14, loop: false, ru: "АТАКА" },
  { id: "hurt", n: 8, fps: 14, loop: false, ru: "УРОН" },
  { id: "spawn", n: 12, fps: 12, loop: false, ru: "ПОЯВЛЕНИЕ" },
  { id: "death", n: 12, fps: 12, loop: false, ru: "ГИБЕЛЬ" },
];
const VIEWS: View[] = ["front", "back", "side"];

// ---------------- общие эффекты ----------------
const mixC = (a: C, b: C, t: number): C => [Math.round(a[0] + (b[0] - a[0]) * t), Math.round(a[1] + (b[1] - a[1]) * t), Math.round(a[2] + (b[2] - a[2]) * t)];
function flash(f: Fr, k: number): Fr {
  if (k <= 0) return f;
  const o = new Cv(f.img.w, f.img.h), W = hx("#ffe6d8");
  for (let y = 0; y < o.h; y++) for (let x = 0; x < o.w; x++) if (f.img.has(x, y)) o.set(x, y, mixC(f.img.get(x, y), W, k));
  return { img: o, emis: f.emis };
}
/** печать на земле: эллипс ry = 0,4·rx, руны-штрихи; в рисунке и в свечении */
function seal(img: Cv, emis: Cv, cx: number, gy: number, rx: number, fx: C[], a: number) {
  if (a <= 0) return;
  const ry = rx * 0.4, n = Math.round(rx * 7);
  gy = Math.min(gy, img.h - 2.5 - ry);
  for (let i = 0; i < n; i++) {
    const t = (i / n) * 2 * Math.PI, x = Math.round(cx + Math.cos(t) * rx), y = Math.round(gy + Math.sin(t) * ry);
    if (hash(i, 3) > a + 0.15) continue;
    const c = i % 5 === 0 ? fx[2] : fx[1];
    if (!img.has(x, y)) img.set(x, y, c);
    emis.set(x, y, c);
  }
  for (let k = 0; k < 6; k++) {
    if (hash(k, 9) > a) continue;
    const t = (k / 6) * 2 * Math.PI + 0.3, x = cx + Math.cos(t) * rx * 0.6, y = gy + Math.sin(t) * ry * 0.6;
    for (let d = -1; d <= 1; d++) { const px = Math.round(x + d * 0.5), py = Math.round(y + d); if (!img.has(px, py)) img.set(px, py, fx[1]); emis.set(px, py, fx[1]); }
  }
}
function bbox(c: Cv) {
  let x0 = c.w, y0 = c.h, x1 = -1, y1 = -1;
  for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) if (c.has(x, y)) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  return { x0, y0, x1, y1 };
}
function spawnFx(f: Fr, i: number, n: number, fx: C[], gy: number): Fr {
  const img = new Cv(f.img.w, f.img.h), emis = new Cv(f.img.w, f.img.h), b = bbox(f.img);
  const t = (i + 1) / (n - 2);
  const cut = b.y1 + 1 - (b.y1 - b.y0 + 3) * Math.min(1, Math.max(0, (t - 0.15) / 0.75));
  for (let y = 0; y < f.img.h; y++) for (let x = 0; x < f.img.w; x++) {
    if (!f.img.has(x, y)) continue;
    if (y >= cut) { img.set(x, y, f.img.get(x, y)); if (f.emis.has(x, y)) emis.set(x, y, f.emis.get(x, y)); }
    else if (y >= cut - 1.5) { img.set(x, y, fx[2]); emis.set(x, y, fx[2]); }
  }
  const a = i < 2 ? (i + 1) / 3 : i > n - 4 ? Math.max(0, (n - 1 - i) / 3) : 1;
  seal(img, emis, (b.x0 + b.x1) / 2, gy, Math.min(f.img.w / 2 - 3 - Math.abs((b.x0 + b.x1) / 2 - f.img.w / 2), Math.max(6, (b.x1 - b.x0) / 2 + 1)), fx, a);
  // искры над кромкой
  for (let k = 0; k < 5 && i < n - 2; k++) {
    const x = Math.round(b.x0 + hash(k, i) * (b.x1 - b.x0)), y = Math.round(cut - 2 - hash(i, k) * 5);
    if (y > 0 && y < f.img.h) { img.set(x, y, fx[2]); emis.set(x, y, fx[2]); }
  }
  return { img, emis };
}
function deathFx(f: Fr, i: number, n: number, fx: C[]): Fr {
  const k = (i - (n - 6)) / 5; // 0..1 на последних кадрах
  if (k <= 0) return f;
  const img = new Cv(f.img.w, f.img.h), emis = new Cv(f.img.w, f.img.h), ASH = [hx("#3a3430"), hx("#5e5650"), hx("#8a8078")];
  for (let y = 0; y < f.img.h; y++) for (let x = 0; x < f.img.w; x++) {
    if (!f.img.has(x, y)) continue;
    const h = hash(Math.floor(x / 2) + 0.5, Math.floor(y / 2) + 0.3) * 0.75 + (1 - y / f.img.h) * 0.25;
    if (h > k * 1.1) { img.set(x, y, k > 0.5 ? mixC(f.img.get(x, y), ASH[0], (k - 0.5) * 1.2) : f.img.get(x, y)); if (f.emis.has(x, y)) emis.set(x, y, f.emis.get(x, y)); }
    else if (hash(x, y + 7) < 0.25) {
      const yy = Math.round(y - 2 - k * 6 * hash(y, x)), xx = Math.round(x + (hash(x, y) - 0.5) * 3);
      const c = hash(x + 3, y) < 0.3 ? fx[1] : ASH[Math.floor(hash(x, y + 1) * 3)];
      if (yy > 1) { img.set(xx, yy, c); if (c === fx[1]) emis.set(xx, yy, c); }
    }
  }
  return { img, emis };
}

// ---------------- сборка ----------------
export interface Built { pet: PetDef; frames: Record<string, Record<View, Fr[]>>; problems: string[] }
export function build(pet: PetDef): Built {
  const fx = (pet.fx ?? ["#6a4210", "#e0a630", "#fff2b0"]).map(hx);
  const N = pet.N, gy = Math.round(N * 30 / 32) - 1;
  const frames: Record<string, Record<View, Fr[]>> = {};
  const problems: string[] = [];
  for (const a of ORDER) {
    frames[a.id] = {} as Record<View, Fr[]>;
    for (const v of VIEWS) {
      const poses = a.id === "spawn" ? pet.anims.idle(v).concat(pet.anims.idle(v)).slice(0, a.n) : pet.anims[a.id as AnimId](v);
      if (poses.length !== a.n) problems.push(`${a.id} ${v}: ${poses.length} кадров вместо ${a.n}`);
      frames[a.id][v] = poses.slice(0, a.n).map((p, i) => {
        let f = pet.render(v, p);
        if (a.id === "hurt") f = flash(f, i === 1 ? 0.55 : i === 2 ? 0.3 : 0);
        if (a.id === "spawn") f = spawnFx(f, i, a.n, fx, gy);
        if (a.id === "death") f = deathFx(f, i, a.n, fx);
        let e = 0; for (let t = 0; t < N; t++) for (const [x, y] of [[0, t], [N - 1, t], [t, 0], [t, N - 1]]) if (f.img.has(x, y)) e++;
        if (e) problems.push(`${a.id} ${v} ${i}: ${e} px на краю кадра`);
        return f;
      });
    }
  }
  return { pet, frames, problems };
}
export const toPC = (c: Cv): PC => { const o = new PC(c.w, c.h); for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) if (c.has(x, y)) { const q = c.get(x, y); o.set(x, y, [q[0], q[1], q[2], 255]); } return o; };

export function saveSheets(b: Built, dir: string) {
  const N = b.pet.N, cols = ORDER.reduce((s, a) => s + a.n, 0);
  const sheet = new PC(cols * N, 3 * N), glow = new PC(cols * N, 3 * N), anims: Record<string, unknown> = {};
  let col = 0, hasGlow = false;
  for (const a of ORDER) {
    anims[a.id] = { col, n: a.n, fps: a.fps, loop: a.loop };
    VIEWS.forEach((v, r) => b.frames[a.id][v].forEach((f, i) => {
      sheet.blit(toPC(f.img), (col + i) * N, r * N);
      const g = toPC(f.emis); glow.blit(g, (col + i) * N, r * N);
      if (!hasGlow) for (let k = 3; k < g.data.length; k += 4) if (g.data[k]) { hasGlow = true; break; }
    }));
    col += a.n;
  }
  fs.mkdirSync(dir, { recursive: true });
  sheet.save(path.join(dir, `${b.pet.id}.png`));
  const gp = path.join(dir, `${b.pet.id}_glow.png`);
  if (hasGlow) glow.save(gp); else if (fs.existsSync(gp)) fs.rmSync(gp);
  fs.writeFileSync(path.join(dir, `${b.pet.id}.json`), JSON.stringify({ frame: N, rows: ["down", "up", "side"], anims }, null, 1));
}

/** Иконка 48×48: кадр покоя, целый масштаб, по центру; прозрачный фон, контур уже в кадре. */
export function icon(b: Built): PC {
  const ic = b.pet.icon ?? { view: "side" as View };
  const f = b.frames[ic.anim ?? "idle"][ic.view][ic.frame ?? 0].img, bb = bbox(f);
  const w = bb.x1 - bb.x0 + 1, h = bb.y1 - bb.y0 + 1;
  const k = ic.zoom ?? Math.max(1, Math.floor(46 / Math.max(w, h)));
  const o = new PC(48, 48);
  const fc = ic.focus ?? [(bb.x0 + bb.x1 + 1) / 2, (bb.y0 + bb.y1 + 1) / 2];
  const ox = Math.round(24 - fc[0] * k), oy = Math.round(24 - fc[1] * k);
  const big = scaleNN(toPC(f), k);
  for (let y = 0; y < big.h; y++) for (let x = 0; x < big.w; x++) { const c = big.get(x, y); if (c && c[3]) o.set(x + ox, y + oy, c); }
  // контур по краю иконки, если зум обрезал силуэт: не нужен — края прозрачные
  return o;
}

// ---------------- обзор ×3 ----------------
export function review(b: Built, A: ReturnType<typeof loadAssets>): PC {
  const N = b.pet.N, k = 3, rows: Row[] = [], W = Math.max(1400, 24 + 36 * k + 16 * (N + 1) * k + 40);
  rows.push({ h: 30, draw: (c, y) => text(c, `${b.pet.ru} · КАДР ${N} · ${b.pet.act} · АТАКА: ${b.pet.atk}`, 16, y + 8, 2) });
  const put = (c: PC, img: PC, x: number, yb: number, kk: number, sh: number) => {
    if (sh > 0) shadowBlob(c, x + (img.w / 2) * kk, yb - 1.4 * kk, sh * kk * (b.pet.fly ? 0.8 : 1), Math.max(1.4, sh * 0.32) * kk);
    c.blit(scaleNN(img, kk), x, yb - img.h * kk);
  };
  for (const a of ORDER) {
    const fr = b.frames[a.id];
    rows.push({
      h: (N + 2) * k * 3 + 34,
      draw: (c, y0) => {
        text(c, `×3 · ${a.ru} · ${a.n} КАДРОВ · ${a.fps} К/С · ВНИЗ / ВВЕРХ / ВБОК`, 16, y0 + 6);
        VIEWS.forEach((v, r) => {
          const y = y0 + 28 + r * (N + 2) * k;
          groundBg(c, A.terrain, 16, y, W - 32, (N + 2) * k, k, "grass");
          const yb = y + (N + 2) * k - 2 * k;
          put(c, heroAt(A, [0, 1, 2][r]), 24, yb, k, 6.5);
          fr[v].forEach((f, i) => put(c, toPC(f.img), 24 + 36 * k + i * (N + 1) * k, yb, k, b.pet.shadow));
        });
      },
    });
  }
  // ночь: покой и гибель со свечением
  rows.push({
    h: (N + 2) * k + 34,
    draw: (c, y0) => {
      text(c, "×3 · НОЧЬ: ПОКОЙ ВНИЗ / ВБОК / ВВЕРХ, ЖИВОЕ ДЕЙСТВИЕ, ИКОНКА", 16, y0 + 6);
      const y = y0 + 28, yb = y + (N + 2) * k - 2 * k;
      groundBg(c, A.terrain, 16, y, W - 32, (N + 2) * k, k, "grass");
      const items = [b.frames.idle.front[0], b.frames.idle.side[0], b.frames.idle.back[0], ...b.frames.act.side.filter((_, i) => i % 3 === 0)];
      items.forEach((f, i) => put(c, toPC(f.img), 24 + i * (N + 4) * k, yb, k, b.pet.shadow));
      nightRect(c, 16, y, W - 32, (N + 2) * k);
      items.forEach((f, i) => { const g = scaleNN(toPC(f.emis), k); c.blit(g, 24 + i * (N + 4) * k, yb - N * k); });
      const ic = scaleNN(icon(b), 2);
      c.blit(ic, W - 140, y);
    },
  });
  return stackRows(rows, W);
}

const isMain = !!process.argv[1] && path.resolve(process.argv[1]).replace(/\\/g, "/").endsWith("pets2/build.ts");
if (isMain) {
  const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
  const OUT = path.join(ROOT, "tools", "out", "pets");
  const only = (process.argv.find((a) => a.startsWith("--only=")) ?? "").slice(7).split(",").filter(Boolean);
  const MODS: Record<string, string> = {
    ash_bear: "./bear", war_raven: "./raven", cliff_lynx: "./lynx", iron_boar: "./boar", sol_falcon: "./falcon", bone_hound: "./hound",
    ash_salamander: "./salamander", rune_golem: "./golem", ghost_fox: "./fox", bog_lizard: "./lizard",
  };
  const A = loadAssets(ROOT);
  for (const id of only.length ? only : Object.keys(MODS)) {
    const file = path.join(path.dirname(fileURLToPath(import.meta.url)), MODS[id].slice(2) + ".ts");
    if (!fs.existsSync(file)) { console.log(`  ${id}: модуля нет — пропуск`); continue; }
    const t0 = Date.now();
    const pet = (await import(MODS[id])).pet as PetDef;
    const b = build(pet);
    saveSheets(b, path.join(OUT, "sheets"));
    fs.mkdirSync(path.join(OUT, "icons"), { recursive: true });
    icon(b).save(path.join(OUT, "icons", `pet_${id}.png`));
    fs.mkdirSync(path.join(OUT, "p4"), { recursive: true });
    review(b, A).save(path.join(OUT, "p4", `${id}.png`));
    console.log(`  ${id}: ${((Date.now() - t0) / 1000).toFixed(1)} с; замечаний ${b.problems.length}`);
    for (const p of b.problems.slice(0, 12)) console.log(`    ${p}`);
  }
}
