/**
 * Пилот прохода 4 (питомцы по методу боссов кольца): Пепельный медведь и Боевой ворон.
 * → tools/out/pets/pilot.png: «final3 | новое» ×4, все кадры покоя / ходьбы (полёта) / атаки ×3 в трёх видах,
 *   сцена с героем на зуме 2 днём и вечером; листы → tools/out/pets/pilot/<id>.png (+ _glow), в игру не кладутся.
 * Запуск (под замком): npx tsx tools/gen/pets2/pilot.ts
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PC } from "../canvas";
import { crop, groundBg, loadPC, nightRect, scaleNN, shadowBlob, stackRows, text, type Row } from "../mobs/lib";
import { heroAt, loadAssets } from "../pets/petlib";
import { flipCv, type Cv } from "./lib";
import * as Bear from "./bear";
import * as Raven from "./raven";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const OUT = path.join(ROOT, "tools", "out", "pets");
const A = loadAssets(ROOT);
type View = "front" | "back" | "side";
const VIEWS: View[] = ["front", "back", "side"]; // строки листа: вниз, вверх, вбок
type Fr = { img: Cv; emis: Cv };
interface PetDef { id: string; ru: string; N: number; shadow: number; fly: boolean; anims: { id: string; ru: string; fps: number; frames: (v: View) => Fr[] }[] }

const toPC = (c: Cv): PC => { const o = new PC(c.w, c.h); for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) if (c.has(x, y)) { const q = c.get(x, y); o.set(x, y, [q[0], q[1], q[2], 255]); } return o; };
const mk = <P>(render: (v: View, p: P) => Fr, f: (v: View) => P[]) => (v: View) => f(v).map((p) => render(v, p));
const PETS: PetDef[] = [
  { id: "ash_bear", ru: "ПЕПЕЛЬНЫЙ МЕДВЕДЬ", N: Bear.N, shadow: 15, fly: false, anims: [
    { id: "idle", ru: "ПОКОЙ", fps: 10, frames: mk(Bear.render, () => Bear.idle()) },
    { id: "walk", ru: "ХОДЬБА", fps: 12, frames: mk(Bear.render, Bear.walk) },
    { id: "attack", ru: "АТАКА: ВСТАЁТ И БЬЁТ ЛАПОЙ", fps: 14, frames: mk(Bear.render, Bear.attack) },
  ] },
  { id: "war_raven", ru: "БОЕВОЙ ВОРОН", N: Raven.N, shadow: 5, fly: true, anims: [
    { id: "idle", ru: "ПОКОЙ: ПАРИТ НА МЕСТЕ", fps: 10, frames: mk(Raven.render, Raven.idle) },
    { id: "walk", ru: "ПОЛЁТ", fps: 12, frames: mk(Raven.render, Raven.walk) },
    { id: "attack", ru: "АТАКА: ПИКИРУЕТ И КЛЮЁТ", fps: 14, frames: mk(Raven.render, Raven.attack) },
  ] },
];

// ---- сцена: спрайт ×k на линии земли, тень отдельно ----
function put(c: PC, img: PC, x: number, yb: number, k: number, shadow: number, fly: boolean, flip = false) {
  if (shadow > 0) shadowBlob(c, x + (img.w / 2) * k, yb - 1.4 * k, shadow * k * (fly ? 0.8 : 1), Math.max(1.4, shadow * (fly ? 0.3 : 0.34)) * k);
  c.blit(scaleNN(img, k, flip), x, yb - img.h * k);
}
function glowOver(c: PC, emis: PC, x: number, yb: number, k: number, flip = false) {
  const y0 = yb - emis.h * k;
  for (let j = 0; j < emis.h; j++) for (let i = 0; i < emis.w; i++) {
    const q = emis.get(flip ? emis.w - 1 - i : i, j); if (!q || !q[3]) continue;
    for (let b = 0; b < k; b++) for (let a = 0; a < k; a++) c.set(x + i * k + a, y0 + j * k + b, q);
    for (let r = 1; r <= 2; r++) for (const [dx, dy] of [[r, 0], [-r, 0], [0, r], [0, -r]]) for (let b = 0; b < k; b++) for (let a = 0; a < k; a++) c.set(x + (i + dx) * k + a, y0 + (j + dy) * k + b, [q[0], q[1], q[2], 50 / r]);
  }
}
function evening(c: PC, x0: number, y0: number, w: number, h: number) {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
    const q = c.get(x, y); if (!q) continue;
    c.set(x, y, [Math.round(q[0] * 0.8 + 12), Math.round(q[1] * 0.64 + 4), Math.round(q[2] * 0.6 + 12), 255]);
  }
}
type It = { img: PC; emis?: PC; flip?: boolean; shadow: number; fly: boolean; gap?: number; label?: string };
function scene(title: string, items: It[], k: number, H: number, mode: "day" | "eve" | "night", W: number): Row {
  return {
    h: H * k + 44,
    draw: (c, y0) => {
      text(c, title, 16, y0 + 8);
      const y = y0 + 34;
      groundBg(c, A.terrain, 16, y, W - 32, H * k, k, "grass");
      const yb = y + H * k - 4 * k;
      let x = 28; const pos: number[] = [];
      for (const it of items) { x += it.gap ?? 0; put(c, it.img, x, yb, k, it.shadow, it.fly, it.flip); pos.push(x); x += (it.img.w + 4) * k; }
      if (mode === "eve") evening(c, 16, y, W - 32, H * k);
      if (mode === "night") nightRect(c, 16, y, W - 32, H * k);
      if (mode !== "day") items.forEach((it, i) => it.emis && glowOver(c, it.emis, pos[i], yb, k, it.flip));
      items.forEach((it, i) => it.label && text(c, it.label, pos[i], yb + 6, 1));
    },
  };
}

const W = 1840;
const rows: Row[] = [{ h: 40, draw: (c, y) => text(c, "ПИТОМЦЫ · ПИЛОТ ПРОХОДА 4 · ШТАМПЫ ПО СКЕЛЕТУ, ТЕЛО В 2× · ФИНАЛ 3 | НОВОЕ · В ИГРУ НЕ ВКЛЮЧЕНО", 16, y + 10, 3) }];
const problems: string[] = [];
fs.mkdirSync(path.join(OUT, "pilot"), { recursive: true });
for (const pet of PETS) {
  const N = pet.N;
  const all = pet.anims.map((a) => ({ a, fr: Object.fromEntries(VIEWS.map((v) => [v, a.frames(v)])) as Record<View, Fr[]> }));
  // край кадра
  for (const { a, fr } of all) for (const v of VIEWS) fr[v].forEach((f, i) => {
    let n = 0; for (let t = 0; t < N; t++) for (const [x, y] of [[0, t], [N - 1, t], [t, 0], [t, N - 1]]) if (f.img.has(x, y)) n++;
    if (n) problems.push(`${pet.id} ${a.id} ${v} ${i}: ${n} px на краю`);
  });
  // лист: строки вниз, вверх, вбок
  const cols = all.reduce((s, x) => s + x.fr.front.length, 0);
  const sheet = new PC(cols * N, 3 * N), glow = new PC(cols * N, 3 * N), lay: Record<string, unknown> = {};
  let col = 0;
  for (const { a, fr } of all) {
    lay[a.id] = { col, n: fr.front.length, fps: a.fps, loop: a.id !== "attack" };
    VIEWS.forEach((v, r) => fr[v].forEach((f, i) => { sheet.blit(toPC(f.img), (col + i) * N, r * N); glow.blit(toPC(f.emis), (col + i) * N, r * N); }));
    col += fr.front.length;
  }
  sheet.save(path.join(OUT, "pilot", `${pet.id}.png`)); glow.save(path.join(OUT, "pilot", `${pet.id}_glow.png`));
  fs.writeFileSync(path.join(OUT, "pilot", `${pet.id}.json`), JSON.stringify({ frame: N, rows: ["down", "up", "side"], anims: lay }, null, 1));

  const old = loadPC(path.join(OUT, "sheets", `${pet.id}.png`)), oldGlow = loadPC(path.join(OUT, "sheets", `${pet.id}_glow.png`));
  const oN = old.h / 3;
  const oldF = (row: number, c = 0) => crop(old, c * oN, row * oN, oN, oN), oldG = (row: number, c = 0) => crop(oldGlow, c * oN, row * oN, oN, oN);
  const nw = (v: View, a = 0, i = 0) => all[a].fr[v][i];
  // 1) сравнение ×4
  const cmp: It[] = [
    { img: oldF(0), shadow: pet.shadow, fly: pet.fly, label: "ФИНАЛ 3: ВНИЗ" }, { img: oldF(2), shadow: pet.shadow, fly: pet.fly, label: "ВБОК" }, { img: oldF(1), shadow: pet.shadow, fly: pet.fly, label: "ВВЕРХ" },
    { img: toPC(nw("front").img), shadow: pet.shadow, fly: pet.fly, gap: 60, label: "НОВОЕ: ВНИЗ" }, { img: toPC(nw("side").img), shadow: pet.shadow, fly: pet.fly, label: "ВБОК" },
    { img: toPC(nw("back").img), shadow: pet.shadow, fly: pet.fly, label: "ВВЕРХ" }, { img: toPC(flipCv(nw("side").img)), shadow: pet.shadow, fly: pet.fly, label: "ВЛЕВО, ЗЕРКАЛО" },
  ];
  rows.push(scene(`×4 · ${pet.ru} · СЛЕВА ФИНАЛ 3 | СПРАВА НОВОЕ · ПОКОЙ, КАДР 1`, cmp, 4, N + 4, "day", W));
  // 2) анимации ×3: все кадры, три вида
  for (const { a, fr } of all) {
    const k = 3, n = fr.front.length;
    rows.push({
      h: (N + 2) * k * 3 + 40,
      draw: (c, y0) => {
        text(c, `×3 · ${pet.ru} · ${a.ru} · ${n} КАДРОВ · ${a.fps} К/С · ВНИЗ / ВВЕРХ / ВБОК`, 16, y0 + 8);
        VIEWS.forEach((v, r) => {
          const y = y0 + 34 + r * (N + 2) * k;
          groundBg(c, A.terrain, 16, y, W - 32, (N + 2) * k, k, "grass");
          const yb = y + (N + 2) * k - 2 * k;
          put(c, heroAt(A, [0, 1, 2][r]), 24, yb, k, 6.5, false);
          fr[v].forEach((f, i) => put(c, toPC(f.img), 24 + 40 * k + i * (N + 2) * k, yb, k, pet.shadow, pet.fly));
        });
      },
    });
  }
  // 3) сцена с героем, зум 2: день, вечер, ночь
  const sceneItems = (): It[] => [
    { img: heroAt(A, 0), shadow: 6.5, fly: false, label: "ГЕРОЙ" },
    { img: oldF(0), emis: oldG(0), shadow: pet.shadow, fly: pet.fly, label: "ФИНАЛ 3" }, { img: oldF(2), emis: oldG(2), shadow: pet.shadow, fly: pet.fly },
    { img: heroAt(A, 0), shadow: 6.5, fly: false, gap: 40, label: "ГЕРОЙ" },
    { img: toPC(nw("front").img), emis: toPC(nw("front").emis), shadow: pet.shadow, fly: pet.fly, label: "НОВОЕ" },
    { img: toPC(nw("side", 1, 3).img), emis: toPC(nw("side", 1, 3).emis), shadow: pet.shadow, fly: pet.fly },
    { img: toPC(nw("back", 1, 6).img), emis: toPC(nw("back", 1, 6).emis), shadow: pet.shadow, fly: pet.fly },
    { img: heroAt(A, 2), shadow: 6.5, fly: false },
    { img: toPC(nw("side", 2, 5).img), emis: toPC(nw("side", 2, 5).emis), shadow: pet.shadow, fly: pet.fly, flip: true, label: "АТАКА" },
  ];
  rows.push(scene(`ЗУМ 2 · ${pet.ru} РЯДОМ С ГЕРОЕМ · ДЕНЬ`, sceneItems(), 2, 52, "day", W));
  rows.push(scene(`ЗУМ 2 · ${pet.ru} · ВЕЧЕР`, sceneItems(), 2, 52, "eve", W));
  rows.push(scene(`ЗУМ 3 · ${pet.ru} · НОЧЬ`, sceneItems(), 3, 52, "night", W));
}
stackRows(rows, W).save(path.join(OUT, "pilot.png"));
console.log(`  → ${path.join(OUT, "pilot.png")}`);
fs.writeFileSync(path.join(OUT, "pilot", "edge.txt"), problems.join("\n"));
console.log("edge", problems.length);
