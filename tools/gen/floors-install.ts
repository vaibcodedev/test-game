/**
 * ВРЕМЕННО (до утверждения): новые полы в игру под флагом window.__floorsV2 / localStorage floorsV2=1 (client/src/game/floorsV2.ts).
 * Пишет client/public/assets/floors-v2/:
 *   rows.png + rows.json — строки атласа terrain для данжа и рейда (15 масок перехода: форма берётся из текущего атласа, цвет — новый тайл; 4 варианта сплошного);
 *   <id>_base.png — залы интерьеров (задача 144) с новым полом: стены, двери и ритуальный круг — из текущих картинок tools/gen/interiors.ts.
 * Запуск (под tools/out/scenario.lock): npx tsx tools/gen/floors-install.ts
 */
import fs from "node:fs";
import path from "node:path";
import { PC, mix, type RGBA } from "./canvas";
import { readPng, crop } from "./vendor-lib";
import { R, tileOf, paintFloor, decals, carpet, daisFace, daisSide, steps, dq, vn, type RoomSpec } from "./floors";
import { T } from "../../shared/map";
import { P } from "./palette";
import data from "../../data/interiors.json";

const S = 32, OUT = path.resolve("client/public/assets/floors-v2");
const ATLAS = path.resolve("client/public/assets/tiles/terrain.png");

/** Какой новый материал встаёт на место строки атласа в каждом виде помещения. */
const ROWS: Record<string, [T, string][]> = {
  dungeon: [[T.Marble, "cathedral"], [T.CrackedMarble, "cracked"], [T.Basalt, "ashen"], [T.Worn, "worn"]],
  raid: [[T.Obsidian, "raid"], [T.Ash, "ashen"], [T.Cobble, "cathedral"], [T.Floor, "crypt"]],
};

function rows() {
  const atlas = readPng(ATLAS);
  const list: { kind: string; t: number; key: string }[] = [];
  for (const [kind, rs] of Object.entries(ROWS)) for (const [t, key] of rs) list.push({ kind, t, key });
  const out = new PC(18 * S, list.length * S);
  list.forEach(({ t, key }, j) => {
    const full = [0, 1, 2, 3].map((v) => tileOf(key, v, 0, 0.6));
    for (let col = 0; col < 18; col++) {
      const old = crop(atlas, col * S, t * S, S, S);
      const mine = col < 14 ? full[col % 4] : full[col - 14];
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const o = old.get(x, y)!;
        // маска перехода: где старый тайл сплошной — новый цвет, полупрозрачная кромка остаётся прежней
        const c = col >= 14 || o[3] === 255 ? mine.get(x, y)! : o;
        if (c[3]) out.set(col * S + x, j * S + y, c);
      }
    }
  });
  out.save(path.join(OUT, "rows.png"));
  const json: Record<string, [number, number][]> = {};
  list.forEach(({ kind, t }, j) => (json[kind] ??= []).push([t, j]));
  fs.writeFileSync(path.join(OUT, "rows.json"), JSON.stringify({ _doc: "tools/gen/floors-install.ts: [строка атласа terrain (T), строка rows.png] по виду помещения", ...json }, null, 1));
}

function mul(pc: PC, x: number, y: number, k: number) { const c = pc.get(x, y); if (c && c[3]) pc.set(x, y, [c[0] * k, c[1] * k, c[2] * k, 255].map(Math.round) as RGBA); }

interface Room { id: string; style: string; w: number; h: number; wall: number; door: number; props: [string, number, number][] }
function interior(room: Room) {
  const src = path.resolve(`client/public/assets/interiors/${room.id}_base.png`);
  const old = readPng(src), pc = old.clone();
  const W = room.w * S, Hh = room.h * S, sol = room.style === "sol";
  const x0 = S, y0 = room.wall * S, x1 = W - S, y1 = Hh - S;
  const spec = { id: room.id, title: "", wall: sol ? "sol" : "umb", lower: sol ? "sol" : "umb", medallion: { cx: 4, cy: 1.2, rad: 1.4 } } as RoomSpec;
  paintFloor(pc, sol ? "sol" : "umb", x0, y0, x1, y1, 3, spec);
  decals(pc, sol ? "sol" : "umb", x0, y0, x1, y1, 3);
  const cx = W / 2;
  if (sol) {
    // кайма вдоль стен, дорожка от двери, помост под алтарём (мозаика) с бордюром и ступенями
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const e = Math.min(x - x0, x1 - 1 - x, y - y0, y1 - 1 - y);
      if (e > 9) continue;
      if (e === 9) pc.set(x, y, R.gold[2]); else if (e === 8) pc.set(x, y, R.gold[0]);
      else pc.set(x, y, (x + y) % 8 === 0 || (x - y + 800) % 8 === 0 ? R.solInlay[0] : dq(R.solInlay, 1.6 + (((x >> 3) + (y >> 3)) % 2) * 0.6, x, y));
    }
    carpet(pc, { x: room.door * S + 8, y: 6 * S + 20, w: 2 * S - 16, h: y1 - 6 * S - 22, r: P.cloth.red, band: R.gold[2] });
    const dx0 = 6 * S, dx1 = 14 * S, yb = 6 * S + 4;
    paintFloor(pc, "mosaic", dx0, y0, dx1, yb, 5, { ...spec, lower: "mosaic", medallion: { cx: 4, cy: 1.3, rad: 1.6 } });
    daisSide(pc, dx0, y0, yb, R.solMarble, true); daisSide(pc, dx1 - 1, y0, yb, R.solMarble, false);
    daisFace(pc, dx0, dx1, yb, 8, "stone", R.solMarble, R.gold[2]);
    steps(pc, cx, 64, yb, 8, 2, R.solMarble, (x, y) => dq(R.solMarble, 3 + (vn(x, y, 6, 3, 31) - 0.5) * 0.5, x, y));
  } else {
    // ритуальный помост и круг — прежние (с костями вокруг), остальное — новая плитка
    const cy = (room.wall + (room.h - room.wall - 1) / 2) * S + 8;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (((x - cx) / 106) ** 2 + ((y - cy - 4) / 84) ** 2 < 1) pc.set(x, y, old.get(x, y)!);
    carpet(pc, { x: room.door * S + 14, y: cy + 88, w: 2 * S - 28, h: y1 - cy - 90, r: P.cloth.purple, band: R.violet[1] });
  }
  // тени: задняя стена (длинная), левая стена шире правой, контакт убранства
  for (let y = y0; y < y0 + 18; y++) for (let x = x0; x < x1; x++) mul(pc, x, y, y === y0 ? 0.4 : 0.5 + 0.5 * ((y - y0) / 18) ** 0.65);
  for (let y = y0; y < y1; y++) { for (let i = 0; i < 16; i++) mul(pc, x0 + i, y, i === 0 ? 0.45 : 0.55 + 0.45 * (i / 16) ** 0.65); for (let i = 0; i < 6; i++) mul(pc, x1 - 1 - i, y, i === 0 ? 0.5 : 0.72 + 0.28 * (i / 6)); }
  const fp = data.props as Record<string, { w: number; h: number }>;
  for (const [kind, px, py] of room.props) {
    const f = fp[kind], scx = (px + f.w / 2) * S + 3, scy = (py + f.h) * S - 4, rx = f.w * 16 + 4, ry = Math.max(6, f.h * 10);
    for (let y = Math.floor(scy - ry); y <= scy + ry; y++) for (let x = Math.floor(scx - rx); x <= scx + rx; x++) {
      const d = ((x + 0.5 - scx) / rx) ** 2 + ((y + 0.5 - scy) / ry) ** 2;
      if (d < 1 && y >= y0 && y < y1) mul(pc, x, y, 0.7 + 0.3 * d ** 0.7);
    }
  }
  // порог двери — прежний
  for (let y = y1 - 10; y < Hh; y++) for (let x = room.door * S - 8; x < (room.door + 2) * S + 8; x++) if (y >= y1) pc.set(x, y, old.get(x, y)!);
  void mix;
  pc.save(path.join(OUT, `${room.id}_base.png`));
}

fs.mkdirSync(OUT, { recursive: true });
rows();
for (const r of data.list as unknown as Room[]) interior(r);
console.log(`floors-v2 → ${OUT}`);
