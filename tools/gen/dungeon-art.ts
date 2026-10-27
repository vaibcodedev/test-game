/**
 * Кадры реквизита данжа «Пепельные чертоги» (задача 139): собор павших королей (dg_*_c_*), переход (dg_*_t_*), пепельный склеп (dg_*_a_*), арки и ворота.
 * Рисуются теми же приёмами, что и макеты (tools/gen/dungeon-mock.ts, выбор пользователя «смешать оба»); у основания — контактная тень (shadow.ts), длинную даёт клиент.
 * Опора кадра — нижняя середина; настенные предметы (знамёна, витражи, решётки, цепи) рассчитаны на лицо стены в один тайл.
 */
import { PC, hash01, hex, mix, withA, type RGBA, ramp, type Ramp } from "./canvas";
import { frame32, cylV, ellipseFace, log, box, fillPoly, litC, grain, planksH, CLOTH, depth } from "./volume-lib";
import { shadowDisc, shadowBox } from "./shadow";
import {
  type Scene, MAR, MARW, GLD, MOSS, WAT, CAND, FIRE, LAVA, BAS, BASW, IRN, ASH,
  flame, braziA, sarcA, bonesA, pillarA, pillarB, statueB, sarcB, candles, altarB, rubbleB, chainHang,
} from "./dungeon-mock";

const stub = (pc: PC): Scene => ({ pc, lights: [], shadows: [], emit: new PC(pc.w, pc.h) });
const mk = (w: number, h: number, fn: (S: Scene, pc: PC) => void) => (): PC => { const pc = new PC(w, h); fn(stub(pc), pc); return frame32(pc.outline(hex("#0c0a12"))); };
const tone = (r: Ramp, v: number): RGBA => r[Math.max(0, Math.min(r.length - 1, Math.round(v)))];
const rnd = (a: number, b: number, s = 1) => hash01(a, b, s);
const clip = (pc: PC, fn: (x: number, y: number) => boolean) => { for (let y = 0; y < pc.h; y++) for (let x = 0; x < pc.w; x++) if (fn(x, y)) pc.clear(x, y); };
const scorch = (pc: PC, k = 0.55, y0 = 0.45) => pc.map((c, x, y) => (c[3] ? [c[0] * (1 - k * Math.max(0, (y / pc.h - y0) / (1 - y0))), c[1] * (1 - k * Math.max(0, (y / pc.h - y0) / (1 - y0))), c[2] * (1 - k * Math.max(0, (y / pc.h - y0) / (1 - y0))), c[3]] as RGBA : c));
const emberDots = (pc: PC, n: number, seed: number) => { for (let i = 0; i < n; i++) { const x = Math.floor(rnd(i, seed, 1) * pc.w), y = Math.floor(rnd(i, seed, 2) * pc.h); const p = pc.get(x, y); if (p && p[3] && p[0] < 110) pc.set(x, y, i % 3 ? LAVA[2] : LAVA[3]); } };
const lavaCrack = (pc: PC, x0: number, y0: number, len: number, seed: number, dir = 1) => { let x = x0, y = y0, a = 1.5 * dir; for (let t = 0; t < len; t++) { const p = pc.get(Math.round(x), Math.round(y)); if (p && p[3]) pc.set(Math.round(x), Math.round(y), t % 5 === 2 ? LAVA[4] : t % 2 ? LAVA[3] : LAVA[2]); x += Math.cos(a) * 1.0 + (rnd(t, seed, 3) - 0.5) * 1.2; y += Math.sin(a) * 1.0 + 0.5; a += (rnd(t, seed, 4) - 0.5) * 0.6; } };

// ---------- колонны ----------
const pillarCA = mk(64, 120, (S, pc) => { shadowBox(pc, 14, 50, 112, [8, -5], 80); pillarB(S, 32, 112); });
const pillarCB = mk(64, 120, (S, pc) => { shadowBox(pc, 14, 50, 112, [8, -5], 60); pillarB(S, 32, 112); clip(pc, (x, y) => y < 26 && x + (26 - y) * 0.9 > 46 && x > 30); for (let k = 0; k < 8; k++) ellipseFace(pc, 24 + k * 3, 26 + (k % 3), 2.4, 1.8, MAR, [-0.3, 0.7, 0.5]); for (let k = 0; k < 14; k++) pc.set(22 + (k * 5) % 22, 40 + Math.floor(rnd(k, 1, 90) * 50), MOSS[k % 3]); });
const pillarTA = mk(64, 120, (S, pc) => { shadowBox(pc, 14, 50, 112, [8, -5], 80); pillarB(S, 32, 112); scorch(pc, 0.5, 0.35).data.length; for (let k = 0; k < 3; k++) lavaCrack(pc, 26 + k * 6, 30 + k * 10, 26, k + 5); emberDots(pc, 14, 3); });
const pillarTB = mk(64, 120, (S, pc) => { shadowBox(pc, 14, 50, 112, [8, -5], 60); pillarB(S, 32, 112); const o = scorch(pc, 0.7, 0.2); void o; clip(pc, (x, y) => y < 34 && x > 34 && y + (x - 34) * 1.2 < 30); lavaCrack(pc, 30, 40, 30, 11); lavaCrack(pc, 38, 60, 24, 12, -1); emberDots(pc, 20, 7); for (let k = 0; k < 10; k++) { const x = 20 + Math.floor(rnd(k, 1, 91) * 24), y = 104 + Math.floor(rnd(k, 2, 91) * 6); ellipseFace(pc, x, y, 2.4, 1.6, ASH, [0, 0.8, 0.5]); } });
const pillarAA = mk(56, 100, (S, pc) => { shadowBox(pc, 8, 40, 94, [8, -5], 70); pillarA(S, 24, 94); });
const pillarAB = mk(56, 100, (S, pc) => { shadowBox(pc, 8, 40, 94, [8, -5], 50); pillarA(S, 24, 94); clip(pc, (x, y) => y < 22 && x + y * 0.5 > 34); lavaCrack(pc, 20, 24, 26, 21); emberDots(pc, 10, 4); });

// ---------- статуи, саркофаги, алтарь ----------
const statue = (v: number) => mk(64, 100, (S, pc) => { shadowBox(pc, 12, 48, 92, [8, -5], 60); statueB(S, 30, 92, v); });
const sarcCA = mk(96, 56, (S, pc) => { shadowBox(pc, 6, 62, 50, [14, -8], 28); sarcB(S, 6, 50); });
const sarcCB = mk(96, 56, (S, pc) => { shadowBox(pc, 6, 62, 50, [14, -8], 28); sarcB(S, 6, 50); pc.rect(40, 22, 24, 3, hex("#05080c")); pc.rect(42, 25, 22, 1, hex("#1a3a4a")); for (let k = 0; k < 6; k++) pc.set(44 + k * 3, 26, MOSS[k % 3]); });
const sarcTA = mk(96, 56, (S, pc) => { shadowBox(pc, 6, 62, 50, [14, -8], 28); sarcB(S, 6, 50); scorch(pc, 0.5, 0.3); lavaCrack(pc, 20, 22, 16, 31); lavaCrack(pc, 44, 30, 14, 32, -1); lavaCrack(pc, 56, 20, 12, 33); emberDots(pc, 12, 5); });
const sarcAA = mk(96, 56, (S, pc) => { shadowBox(pc, 6, 62, 50, [14, -8], 28); sarcA(S, 6, 50, false); });
const sarcAB = mk(96, 56, (S, pc) => { shadowBox(pc, 6, 62, 50, [14, -8], 28); sarcA(S, 6, 50, true); });
const altarC = mk(128, 78, (S, pc) => { shadowBox(pc, 14, 98, 70, [18, -10], 44); altarB(S, 52, 70); });
const brazier = (s: number) => mk(40, 56, (S, pc) => { shadowDisc(pc, 20, 48, 9 * s, 3, 24); braziA(S, 20, 48, s); });

// ---------- свет, мелочь на полу ----------
const candlesN = (n: number) => mk(40, 30, (S, pc) => { candles(S, 20, 24, n); void pc; });
const rubble = (v: number) => mk(56, 28, (S, pc) => { rubbleB(S, 28, 22); if (v === 1) { ellipseFace(pc, 40, 20, 5, 3.5, MAR, [-0.4, 0.7, 0.5]); ellipseFace(pc, 12, 21, 4, 2.8, MAR, [-0.2, 0.7, 0.5]); } if (v === 2) { log(pc, 6, 22, 24, 17, 2, MAR, { end: MAR }); for (let k = 0; k < 6; k++) pc.set(10 + k * 6, 14 + (k % 3), MOSS[k % 3]); } });
const rubbleT = (v: number) => mk(56, 28, (S, pc) => { rubbleB(S, 28, 22); scorch(pc, 0.6, 0.0); for (let k = 0; k < 12; k++) ellipseFace(pc, 10 + rnd(k, v, 92) * 36, 22 - rnd(k, 2, 92) * 4, 3, 1.8, ASH, [0, 0.8, 0.5]); lavaCrack(pc, 16 + v * 8, 14, 10, 40 + v); emberDots(pc, 10, 9 + v); });
const bonesN = (v: number) => mk(40, 24, (S, pc) => { bonesA(S, 20, 18); if (v === 1) { bonesA(S, 12, 20); } if (v === 2) { log(pc, 8, 17, 30, 13, 1.1, ramp("#3a3238", "#5c525a", "#8a7e86", "#b8aeb2", "#dcd4d6"), { end: null }); } });
function decalPuddle(v: number): PC {
  const pc = new PC(40, 16), cx = 20, cy = 8, rx = v ? 15 : 17, ry = v ? 5 : 6;
  for (let y = 0; y < 16; y++) for (let x = 0; x < 40; x++) { const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 + (hash01(x, y, 5 + v) - 0.5) * 0.12; if (d > 1) continue; const rim = d > 0.78; pc.set(x, y, rim ? withA(WAT[1], 150) : withA(mix(WAT[0], WAT[2], 0.25 + (y - cy) / ry * 0.15 + Math.sin(x * 0.9 + y * 2) * 0.1), 200)); }
  for (let k = 0; k < 5; k++) pc.rect(cx - rx * 0.5 + k * rx * 0.22, cy - 2 + (k % 2) * 2, 3, 1, withA(WAT[3], 220));
  return frame32(pc);
}
function decalAsh(v: number): PC {
  const pc = new PC(48, 16);
  for (let k = 0; k < 4; k++) { const cx = 10 + k * 9 + (v ? 3 : 0), cy = 8 + (k % 2) * 2; pc.ellipse(cx, cy, 7 - k, 3, withA(tone(ASH, 1.5), 210)); pc.ellipse(cx - 1, cy - 1, 5 - k * 0.6, 2, withA(tone(ASH, 2.6), 220)); }
  for (let i = 0; i < 10; i++) { const x = 6 + Math.floor(rnd(i, v, 95) * 34), y = 5 + Math.floor(rnd(i, 2, 95) * 8); if (pc.alpha(x, y) && i % 3 === 0) pc.set(x, y, LAVA[2 + (i % 2)]); }
  return frame32(pc);
}

// ---------- настенные: знамёна, витражи, решётки, цепи (лицо стены — 32 px) ----------
function banner(cloth: Ramp, burnt: boolean, v: number): PC {
  const pc = new PC(24, 40), w = 14, h = 26, x = 12, y0 = 6;
  pc.rect(x - w / 2 - 1, y0 - 2, w + 2, 2, tone(GLD, 2.6)); pc.rect(x - w / 2 - 1, y0 - 2, w + 2, 1, tone(GLD, 4));
  pc.rect(x - w / 2 - 2, y0 - 3, 2, 3, tone(GLD, 3)); pc.rect(x + w / 2, y0 - 3, 2, 3, tone(GLD, 3));
  const cutY = (px: number) => (burnt ? h * (0.78 - 0.34 * hash01(px, v, 96) - Math.abs(px - x) * 0.03) : h * 0.82 + (px < x ? 0 : -2) + Math.abs(px - x) * 0.4);
  fillPoly(pc, [[x - w / 2, y0], [x + w / 2, y0], [x + w / 2, y0 + h + 4], [x - w / 2, y0 + h + 4]], (px, py) => { const rel = py - y0; if (rel > cutY(px) + (burnt ? 0 : (px === x ? 6 : 0))) return null; return burnt ? litC(cloth.map((c) => mix(c, [20, 14, 14, 255], 0.55)) as Ramp, [Math.sin((px - x) * 0.7) * 0.4, 0.2, 1], (hash01(px, py, 97) - 0.5) * 0.5 - rel / h * 0.4) : litC(cloth, [Math.sin((px - x) * 0.7) * 0.5, 0.2, 1], (hash01(px, py, 98) - 0.5) * 0.3 - rel / h * 0.4); });
  if (!burnt) { for (let k = 0; k < 3; k++) pc.set(x - 1 + (k % 2) * 2, y0 + 7 + k * 4, tone(GLD, 3.4)); pc.set(x, y0 + 4, tone(GLD, 4)); }
  else for (let k = 0; k < 8; k++) { const px = x - w / 2 + 1 + Math.floor(rnd(k, v, 99) * w), py = y0 + Math.floor(h * 0.5 + rnd(k, 2, 99) * h * 0.4); if (pc.alpha(px, py)) pc.set(px, py, k % 2 ? LAVA[2] : LAVA[3]); }
  return frame32(pc.outline(hex("#0c0a12")));
}
function windowC(c1: RGBA, c2: RGBA, broken: boolean): PC {
  const pc = new PC(24, 40), cx = 12, w = 14, h = 24, y0 = 8;
  for (let y = 0; y < h; y++) { const hw = y < 7 ? Math.sqrt(Math.max(0, 1 - ((7 - y) / 7) ** 2)) * (w / 2) : w / 2; for (let x = -Math.ceil(hw); x <= Math.ceil(hw); x++) { if (Math.abs(x) > hw) continue; const lead = (x + 20) % 5 === 0 || (y + 2) % 6 === 0, c = lead ? tone(MAR, 1) : (Math.floor((x + 40) / 5) + Math.floor(y / 6)) % 2 ? c1 : mix(c1, c2, 0.6); if (broken && hash01(x, y, 101) < 0.18) continue; pc.set(cx + x, y0 + y, lead ? c : mix(c, hex("#000000"), 0.1 + (y / h) * 0.2)); } }
  for (let x = -w / 2 - 1; x <= w / 2 + 1; x++) { pc.set(cx + x, y0 + h, tone(MAR, 4.2)); pc.set(cx + x, y0 + h + 1, tone(MAR, 0.8)); }
  for (let y = 0; y < h; y++) { pc.set(cx - w / 2 - 1, y0 + y + 2, tone(MAR, 4)); pc.set(cx + w / 2 + 1, y0 + y + 2, tone(MAR, 1)); }
  return frame32(pc.outline(hex("#0c0a12")));
}
function grateW(v: number): PC {
  const pc = new PC(28, 24), x = 5, y = 5, w = 18, h = 14;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const g = 1 - j / h; pc.set(x + i, y + j, mix(hex("#2a0e08"), v ? LAVA[3] : LAVA[2], 0.35 + g * 0.5 * (0.6 + 0.4 * Math.sin(i * 0.5)))); }
  for (let i = 3; i < w; i += 5) { pc.rect(x + i, y, 2, h, tone(IRN, 2)); pc.rect(x + i, y, 1, h, tone(IRN, 4)); }
  pc.rect(x - 1, y - 1, w + 2, 2, tone(IRN, 3)); pc.rect(x - 1, y + h - 1, w + 2, 2, tone(IRN, 1)); pc.rect(x - 1, y - 1, 1, h + 2, tone(IRN, 4)); pc.rect(x + w, y - 1, 1, h + 2, tone(IRN, 1));
  if (v) { pc.rect(x + 6, y + 4, 2, 2, tone(IRN, 0.5)); }
  return frame32(pc.outline(hex("#0c0a12")));
}
function chainsW(v: number): PC {
  const pc = new PC(24, 40);
  for (const [x, len] of v ? [[8, 14], [16, 10]] as const : [[12, 17]] as const) { chainHang(stub(pc), x, 3, len, IRN); }
  if (v) { pc.rect(10, 4, 8, 2, tone(IRN, 3)); }
  const shackle = (x: number, y: number) => { pc.rect(x - 2, y, 5, 3, tone(IRN, 3)); pc.set(x, y + 1, hex("#0a0810")); };
  shackle(v ? 8 : 12, 34); if (v) shackle(16, 30);
  return frame32(pc.outline(hex("#0c0a12")));
}

// ---------- арки и ворота: 5 тайлов в ширину ----------
function archBase(w: number, h: number, mat: Ramp, glow: RGBA | null, pointed: boolean, crack: boolean): PC {
  const pc = new PC(w + 16, h + 14), cx = (w + 16) / 2, yb = h + 8, inner = w - 36;
  shadowBox(pc, 8, w + 8, yb, [10, -6], 40);
  for (const sx of [-1, 1]) {
    const x0 = sx < 0 ? 8 : cx + inner / 2, pw = 18;
    box(pc, x0, yb - 8, pw, 8, 8, { r: mat, tex: grain(2, 0.2) }, { r: mat }, { r: mat });
    cylV(pc, x0 + pw / 2, yb - h + 12, yb - 8, 7, mat, { k: 0.42, cap: null, tex: (phi) => (Math.floor((phi + 2) * 4) % 2 ? -0.25 : 0.2) });
    box(pc, x0, yb - h + 4, pw, 8, 8, { r: mat, tex: grain(5, 0.2) }, { r: mat }, { r: mat });
    for (let i = 0; i < pw - 4; i++) pc.set(x0 + 2 + i, yb - h + 8, tone(GLD, i % 3 ? 2.6 : 3.8));
  }
  // проём: тёмный, с мягким свечением; арка-стрела или плоская перемычка
  for (let y = 0; y < h - 6; y++) for (let x = -inner / 2; x <= inner / 2; x++) {
    const top = pointed ? Math.abs(x) * 0.5 : 0, ry = yb - h + 10 + (pointed ? 0 : 0);
    if (y + ry < ry + top - (pointed ? 6 : 0)) continue;
    const g = glow ? Math.max(0, 1 - Math.abs(x) / (inner / 2)) * 0.3 * (y / h) : 0;
    pc.set(Math.round(cx + x), ry + y, glow ? mix(hex("#050408"), glow, g) : hex("#050a12"));
  }
  const lintelY = yb - h;
  box(pc, 8, lintelY - 4, w, 10, 8, { r: mat, tex: grain(3, 0.2) }, { r: mat }, { r: mat });
  for (let x = 12; x < w + 4; x += 6) pc.set(8 + x, lintelY + 1, tone(GLD, x % 12 ? 2.4 : 3.6));
  if (crack) { lavaCrack(pc, cx - 18, lintelY - 2, 14, 51); lavaCrack(pc, cx + 22, lintelY, 12, 52, -1); }
  return pc;
}
const archC = mk(176, 110, (S, pc) => { const a = archBase(144, 88, MAR, hex("#4aa0c8"), true, false); pc.blit(a, 0, 4); for (let k = 0; k < 6; k++) pc.rect(60 + k * 9, 100 - (k % 2) * 2, 6, 2, hex("#4aa0c8")); });
const archT = mk(176, 110, (S, pc) => { const a = archBase(144, 88, MAR, hex("#ff7a30"), true, true); pc.blit(a, 0, 4); scorch(pc, 0.45, 0.25); emberDots(pc, 18, 6); });
const gateA = mk(176, 112, (S, pc) => {
  const a = archBase(144, 90, BASW, hex("#ff7a30"), false, false); pc.blit(a, 0, 4);
  const cx = 88, yb = 104;
  // створки: железные, чуть приоткрыты — в щели свечение; череп на перемычке
  for (const sx of [-1, 1]) { const x0 = sx < 0 ? cx - 52 : cx + 6; pc.rect(x0, yb - 66, 46, 66, tone(IRN, 1.5)); for (let i = 0; i < 6; i++) { pc.rect(x0 + 2, yb - 62 + i * 10, 42, 2, tone(IRN, 3)); pc.set(x0 + 5, yb - 62 + i * 10, tone(IRN, 5)); pc.set(x0 + 39, yb - 62 + i * 10, tone(IRN, 5)); } for (let i = 4; i < 44; i += 7) pc.rect(x0 + i, yb - 66, 1, 66, tone(IRN, 0.6)); pc.rect(x0, yb - 66, 2, 66, tone(IRN, 4)); pc.rect(x0 + 44, yb - 66, 2, 66, tone(IRN, 0.6)); }
  for (let y = 0; y < 66; y++) for (let x = -3; x <= 4; x++) pc.set(cx + x, yb - 66 + y, mix(hex("#1a0808"), LAVA[2 + (Math.abs(x) < 2 ? 1 : 0)], 0.25 + 0.75 * (y / 66)));
  const B = ramp("#3a3238", "#5c525a", "#8a7e86", "#b8aeb2", "#dcd4d6");
  ellipseFace(pc, cx, 22, 8, 7, B, [-0.3, 0.7, 0.6]); pc.rect(cx - 5, 20, 3, 3, hex("#0a0808")); pc.rect(cx + 2, 20, 3, 3, hex("#0a0808")); for (let i = 0; i < 5; i++) pc.set(cx - 4 + i * 2, 28, B[1]);
  emberDots(pc, 10, 2);
});


// ---------- зал босса: помост-ритуальный круг и колонны с цепями ----------
function chainDrape(pc: PC, x0: number, y0: number, x1: number, y1: number, sag: number) {
  const n = Math.round(Math.hypot(x1 - x0, y1 - y0) * 0.55);
  for (let i = 0; i <= n; i++) { const t = i / n, x = Math.round(x0 + (x1 - x0) * t), y = Math.round(y0 + (y1 - y0) * t + Math.sin(t * Math.PI) * sag); pc.rect(x, y, i % 2 ? 2 : 3, 2, tone(IRN, i % 2 ? 2 : 4.4)); pc.set(x + 1, y + 2, tone(IRN, 0.6)); }
}
const pillarAC = mk(64, 108, (S, pc) => { shadowBox(pc, 12, 44, 100, [8, -5], 70); pillarA(S, 28, 100); chainDrape(pc, 20, 28, 38, 60, 6); chainDrape(pc, 38, 30, 20, 66, 7); pc.rect(19, 59, 4, 4, tone(IRN, 3)); lavaCrack(pc, 26, 30, 12, 61); });
const pillarAD = mk(64, 108, (S, pc) => { shadowBox(pc, 12, 44, 100, [8, -5], 70); pillarA(S, 28, 100); chainDrape(pc, 18, 40, 40, 44, 8); chainDrape(pc, 18, 56, 40, 60, 8); for (let k = 0; k < 3; k++) { pc.rect(36 + k, 63 + k * 5, 3, 5, tone(IRN, 3)); } emberDots(pc, 8, 5); });
/** Помост под точкой появления босса: три ступени базальта, на верхней — ритуальный круг с пентаграммой и рунами, жилы лавы по ступеням. Опора — низ кадра; центр круга — на 52 px выше. */
function dais(): PC {
  const W = 320, H = 192, pc = new PC(W, H), cx = W / 2, cy = 96;
  const steps: [number, number, number][] = [[140, 58, cy + 16], [114, 47, cy + 6], [88, 37, cy - 4]];
  pc.ellipse(cx + 8, cy + 30, 150, 52, withA(hex("#06040a"), 90)); // тень под помостом
  steps.forEach(([rx, ry, topY], i) => {
    // боковая стенка 10 px: тёмная, слева светлее
    for (let y = Math.floor(topY - ry); y <= topY + ry + 10; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
      const u = (x + 0.5 - cx) / rx, a = ((y + 0.5 - topY) / ry) ** 2 + u * u, b = ((y + 0.5 - topY - 10) / ry) ** 2 + u * u;
      if (a > 1 && b <= 1) { const v = 2.0 + (-u * 0.9) * 0.9 + (hash01(x, y, 3) - 0.5) * 0.4 - ((y - topY) % 5 === 4 ? 0.4 : 0); pc.set(x, y, tone(BAS, v)); }
    }
    // верхняя грань: плиты, светлая фаска у дальнего края
    for (let y = Math.floor(topY - ry); y <= topY + ry; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
      const u = (x + 0.5 - cx) / rx, w = (y + 0.5 - topY) / ry, d = u * u + w * w;
      if (d > 1) continue;
      let v = 3.4 + (i === 2 ? 0.3 : 0) + (hash01(Math.floor(x / 12), Math.floor(y / 8), 7 + i) - 0.5) * 0.6 + (hash01(x, y, 9) - 0.5) * 0.3;
      if (d > 0.9) v += w < 0 ? 1.0 : -0.5;
      if ((x + Math.floor(y / 8) * 6) % 12 === 0 && d < 0.88) v -= 0.5;
      pc.set(x, y, tone(BAS, v));
    }
    // жилы лавы по краю ступеней
    for (let k = 0; k < 7; k++) { const a = rnd(k, i, 120) * 6.283, x = cx + Math.cos(a) * rx * 0.97, y = topY + Math.sin(a) * ry * 0.97; if (Math.sin(a) > -0.2) for (let t = 0; t < 7; t++) pc.set(Math.round(x + Math.cos(a + 1.5708) * t), Math.round(y + Math.sin(a + 1.5708) * t * 0.4), t % 3 === 1 ? LAVA[4] : LAVA[3]); }
  });
  // ритуальный круг на верхней ступени
  const [rx, ry, ty] = steps[2], R = 0.8;
  const ring = (k: number, col: RGBA) => { for (let a = 0; a < 6.3; a += 0.012) pc.set(Math.round(cx + Math.cos(a) * rx * k), Math.round(ty + Math.sin(a) * ry * k), col); };
  ring(R, LAVA[3]); ring(R - 0.04, LAVA[2]); ring(0.58, LAVA[3]);
  const pts: [number, number][] = Array.from({ length: 5 }, (_, i) => [cx + Math.cos(-1.5708 + (i * 6.283) / 5) * rx * R, ty + Math.sin(-1.5708 + (i * 6.283) / 5) * ry * R]);
  for (let i = 0; i < 5; i++) { const a = pts[i], b = pts[(i + 2) % 5], n = Math.round(Math.hypot(b[0] - a[0], (b[1] - a[1]) * 2.2)); for (let t = 0; t <= n; t++) { const f = t / n, x = Math.round(a[0] + (b[0] - a[0]) * f), y = Math.round(a[1] + (b[1] - a[1]) * f); pc.set(x, y, LAVA[3]); if (t % 3 === 0) pc.set(x, y + 1, LAVA[1]); } }
  // руны между кругами: короткие штрихи
  for (let k = 0; k < 28; k++) { const a = (k / 28) * 6.283, r0 = 0.66, x = cx + Math.cos(a) * rx * r0, y = ty + Math.sin(a) * ry * r0; pc.rect(Math.round(x), Math.round(y), 2, k % 3 === 0 ? 3 : 1, LAVA[k % 2 ? 2 : 3]); }
  for (let k = 0; k < 5; k++) { const [x, y] = pts[k]; pc.rect(Math.round(x) - 1, Math.round(y) - 1, 3, 3, LAVA[4]); }
  pc.ellipse(cx, ty, 9, 3.6, hex("#1a0808")); pc.ellipse(cx, ty, 6, 2.4, LAVA[2]); pc.ellipse(cx, ty - 0.5, 3, 1.2, LAVA[4]);
  const out = frame32(pc);
  return out;
}

export const DUNGEON_ART: Record<string, () => PC> = {
  dg_pillar_c_a: pillarCA, dg_pillar_c_b: pillarCB, dg_pillar_t_a: pillarTA, dg_pillar_t_b: pillarTB, dg_pillar_a_a: pillarAA, dg_pillar_a_b: pillarAB, dg_pillar_a_c: pillarAC, dg_pillar_a_d: pillarAD, dg_dais: dais,
  dg_statue_c_a: statue(0), dg_statue_c_b: statue(1), dg_statue_c_c: statue(2),
  dg_sarc_c_a: sarcCA, dg_sarc_c_b: sarcCB, dg_sarc_t_a: sarcTA, dg_sarc_a_a: sarcAA, dg_sarc_a_b: sarcAB,
  dg_altar_c: altarC, dg_brazier_a: brazier(1), dg_brazier_b: brazier(1.25),
  dg_candles_a: candlesN(3), dg_candles_b: candlesN(5), dg_candles_c: candlesN(2),
  dg_rubble_c_a: rubble(0), dg_rubble_c_b: rubble(1), dg_rubble_c_c: rubble(2), dg_rubble_t_a: rubbleT(0), dg_rubble_t_b: rubbleT(1),
  dg_bones_a: bonesN(0), dg_bones_b: bonesN(1), dg_bones_c: bonesN(2),
  dg_puddle_a: () => decalPuddle(0), dg_puddle_b: () => decalPuddle(1), dg_ashpile_a: () => decalAsh(0), dg_ashpile_b: () => decalAsh(1),
  dg_banner_c_a: () => banner(CLOTH.purple, false, 0), dg_banner_c_b: () => banner(CLOTH.blue, false, 1), dg_banner_c_c: () => banner(CLOTH.red, false, 2),
  dg_banner_t_a: () => banner(CLOTH.purple, true, 3), dg_banner_t_b: () => banner(CLOTH.red, true, 4),
  dg_window_c_a: () => windowC(hex("#c04a8a"), hex("#e0b040"), false), dg_window_c_b: () => windowC(hex("#4a8ac0"), hex("#e0b040"), true),
  dg_grate_a: () => grateW(0), dg_grate_b: () => grateW(1), dg_chains_a: () => chainsW(0), dg_chains_b: () => chainsW(1),
  dg_arch_c: archC, dg_arch_t: archT, dg_gate_a: gateA,
};
void BAS; void CAND; void FIRE; void flame; void planksH; void depth;
