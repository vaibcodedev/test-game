/** Варианты значка подземелья для карты мира (A арка, B череп над воротами, C лестница вниз, D факелы над проёмом): норма, наведение, «трофеи взяты» (галочка / замок), миниатюра. Лист: tools/out/dungeon/map-icons.png. */
import path from "node:path";
import { PC, hex, mix, withA, type RGBA } from "./canvas";

const OUT = hex("#120a10");
const STONE = [hex("#2a2e38"), hex("#454b58"), hex("#68707e"), hex("#8f98a6"), hex("#bcc4d0")];
const RED = [hex("#2a0808"), hex("#6a1408"), hex("#c0300e"), hex("#ff7a2a"), hex("#ffd27a")];
const WOOD = [hex("#2a1a10"), hex("#5a3a1c"), hex("#8a5e30")];
const IRON = [hex("#16161e"), hex("#34344a"), hex("#6a6a8a"), hex("#a0a0c4")];

type Draw = (pc: PC, big: boolean) => void;
/** A: каменная арка с тёмным проёмом и красным светом. */
const A: Draw = (pc) => {
  for (let y = 4; y <= 21; y++) for (let x = 4; x <= 19; x++) { const dx = x - 11.5, top = y < 8 ? Math.abs(dx) > 7.5 - (8 - y) * 0.9 : false; if (!top) pc.set(x, y, STONE[y < 7 ? 3 : y % 4 === 0 ? 1 : 2]); }
  for (let y = 8; y <= 21; y++) for (let x = 8; x <= 15; x++) { const dx = x - 11.5; if (y < 10 && Math.abs(dx) > 3.2 - (10 - y) * 0.4 + 0.6) continue; pc.set(x, y, mix(hex("#080408"), RED[3], Math.max(0, (y - 9) / 12) * 0.9)); }
  pc.set(11, 5, RED[4]); pc.set(12, 5, RED[4]); pc.rect(10, 6, 4, 2, STONE[4]);
};
/** B: череп над воротами. */
const B: Draw = (pc) => {
  for (let y = 12; y <= 21; y++) for (let x = 4; x <= 19; x++) { const dx = x - 11.5; if (y < 14 && Math.abs(dx) > 7 - (14 - y)) continue; pc.set(x, y, STONE[2]); }
  for (let y = 14; y <= 21; y++) for (let x = 6; x <= 17; x++) pc.set(x, y, x % 3 === 0 ? IRON[3] : y % 4 === 1 ? IRON[2] : IRON[0]);
  pc.set(11, 21, RED[3]); pc.set(12, 21, RED[3]);
  pc.ellipse(11.5, 8, 6, 5, hex("#e8e0d6")); pc.rect(7, 10, 9, 4, hex("#e8e0d6"));
  pc.rect(8, 7, 3, 3, hex("#18101a")); pc.rect(13, 7, 3, 3, hex("#18101a")); pc.rect(11, 10, 2, 2, hex("#18101a"));
  for (let x = 8; x <= 15; x += 2) pc.set(x, 13, hex("#18101a"));
};
/** C: лестница вниз в тёмный провал (вид сверху), угли на дне. */
const C: Draw = (pc) => {
  for (let y = 3; y <= 21; y++) for (let x = 3; x <= 20; x++) pc.set(x, y, STONE[1 + (x + y) % 2]);
  for (let y = 5; y <= 19; y++) for (let x = 6; x <= 17; x++) { const t = (y - 5) / 14, step = Math.floor((y - 5) / 2); pc.set(x, y, mix(hex("#05030a"), RED[2], (1 - t) * 0.55 * (step % 2 ? 0.7 : 1))); }
  for (let i = 0; i < 7; i++) { const y = 19 - i * 2; for (let x = 6; x <= 17; x++) pc.set(x, y, mix(STONE[3 - Math.min(2, Math.floor(i / 3))], hex("#05030a"), i * 0.1)); }
  pc.rect(9, 5, 6, 2, RED[3]); pc.rect(10, 5, 4, 1, RED[4]);
};
/** D: два скрещённых факела над тёмным проёмом. */
const D: Draw = (pc) => {
  for (let y = 12; y <= 21; y++) for (let x = 6; x <= 17; x++) { const dx = x - 11.5; if (y < 14 && Math.abs(dx) > 4.5 - (14 - y)) continue; pc.set(x, y, mix(hex("#080408"), RED[2], Math.max(0, (y - 14) / 8) * 0.7)); }
  for (let x = 4; x <= 19; x++) pc.set(x, 12 + (x < 6 || x > 17 ? 1 : 0), STONE[3]);
  pc.rect(4, 13, 2, 9, STONE[2]); pc.rect(18, 13, 2, 9, STONE[2]);
  for (let i = 0; i < 12; i++) { pc.set(5 + i, 15 - Math.floor(i * 0.75), WOOD[1 + (i % 2)]); pc.set(18 - i, 15 - Math.floor(i * 0.75), WOOD[1 + (i % 2)]); }
  for (const x of [5, 18]) { pc.rect(x - 1, 3, 3, 4, RED[3]); pc.rect(x, 2, 1, 2, RED[4]); pc.rect(x - 1, 6, 3, 1, RED[2]); }
};
const VARIANTS: Draw[] = [A, B, C, D];

function build(v: number, state: "normal" | "hover" | "cleared-check" | "cleared-lock"): PC {
  const pc = new PC(24, 24);
  VARIANTS[v](pc, true);
  let o = pc.outline(OUT, true);
  if (state === "cleared-check" || state === "cleared-lock") {
    o = o.map((c) => { const g = (c[0] + c[1] + c[2]) / 3; return [Math.round(g * 0.9), Math.round(g * 0.9), Math.round(g * 0.95), c[3]] as RGBA; });
    // значок: галочка (зелёная) или замок (золотой) на тёмной плашке в правом нижнем углу
    o.rect(14, 14, 10, 10, OUT);
    if (state === "cleared-check") { o.rect(15, 15, 8, 8, hex("#2a6a3a")); for (const [x, y] of [[16, 19], [17, 20], [18, 21], [19, 20], [20, 19], [21, 18], [22, 17]]) o.rect(x, y, 1, 1, hex("#e8f8e8")); }
    else { o.rect(15, 15, 8, 8, hex("#6a5a2a")); o.rect(17, 16, 4, 3, hex("#c8a848")); o.rect(16, 19, 6, 4, hex("#e0c060")); o.rect(18, 20, 2, 2, OUT); }
  }
  if (state === "hover") {
    o = o.map((c) => [Math.min(255, c[0] + 28), Math.min(255, c[1] + 24), Math.min(255, c[2] + 20), c[3]] as RGBA);
    const ring = new PC(24, 24);
    for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) if (!o.alpha(x, y)) { for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (o.alpha(x + dx, y + dy)) ring.set(x, y, hex("#ffe08a")); }
    const g = ring.clone(); g.blit(o, 0, 0); o = g;
  }
  return o;
}
/** Миниатюра для миникарты: тот же значок, ужатый до 12 px (выборка через один пиксель, контур заново). */
function mini(v: number): PC {
  const big = new PC(24, 24); VARIANTS[v](big, false);
  const pc = new PC(12, 12);
  for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) { const c = big.get(x * 2, y * 2) ?? big.get(x * 2 + 1, y * 2 + 1); if (c && c[3]) pc.set(x, y, c); }
  return pc.outline(OUT);
}
const up = (pc: PC, k: number) => { const o = new PC(pc.w * k, pc.h * k); for (let y = 0; y < o.h; y++) for (let x = 0; x < o.w; x++) { const c = pc.get(Math.floor(x / k), Math.floor(y / k)); if (c) o.set(x, y, c); } return o; };

const K = 4, CELL = 40 * K, states = ["normal", "hover", "cleared-check", "cleared-lock"] as const;
const sheet = new PC(CELL * 4 + 8, CELL * 6);
for (let y = 0; y < sheet.h; y++) for (let x = 0; x < sheet.w; x++) sheet.set(x, y, (Math.floor(x / 8) + Math.floor(y / 8)) % 2 ? hex("#6d6a3c") : hex("#74713f")); // фон карты
for (let v = 0; v < 4; v++) {
  states.forEach((st, r) => sheet.blit(up(build(v, st), K), v * CELL + 8 * K, r * CELL + 4 * K));
  sheet.blit(up(mini(v), K), v * CELL + 14 * K, 4 * CELL + 6 * K);
  sheet.blit(up(mini(v), 2), v * CELL + 14 * K, 5 * CELL + 6 * K);
}
void withA;
sheet.save(path.resolve("tools/out/dungeon/map-icons.png"));
// значок A (выбор пользователя) для клиента: палитра + строки пикселей по состояниям
import fs from "node:fs";
const hx = (c: RGBA) => "#" + [c[0], c[1], c[2], c[3]].map((n) => n.toString(16).padStart(2, "0")).join("");
const pack = (pc: PC) => { const pal: string[] = [], rows: string[] = []; for (let y = 0; y < pc.h; y++) { let r = ""; for (let x = 0; x < pc.w; x++) { const c = pc.get(x, y); if (!c || !c[3]) { r += "."; continue; } const h = hx(c); let i = pal.indexOf(h); if (i < 0) { pal.push(h); i = pal.length - 1; } r += String.fromCharCode(48 + i); } rows.push(r); } return { pal, rows }; };
const data = { normal: pack(build(0, "normal")), hover: pack(build(0, "hover")), taken: pack(build(0, "cleared-check")), locked: pack(build(0, "cleared-lock")), mini: pack(mini(0)) };
fs.writeFileSync(path.resolve("client/src/ui/dungeonIconData.ts"), "// Сгенерировано tools/gen/dungeon-icons.ts: значок входа в подземелье (вариант A), состояния и миниатюра для карты и миникарты.\nexport const DG_ICON_DATA = " + JSON.stringify(data) + " as const;\n");
console.log("ok");
