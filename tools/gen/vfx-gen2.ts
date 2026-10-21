/** Генерация эффектов шага 2 (задача 127): ауры и щиты на героях, кольца под ногами, берсерк, руны, знамя, капкан, ворон,
 *  дождь стрел, топор, кандалы, лужа крови. Стиль как у паков: жёсткие пиксели, 4–6 тонов рампы стихии из vfx-lib (RAMPS),
 *  кадры 4–10, циклы замыкаются. Запуск отдельно: tsx tools/gen/vfx-gen2.ts — tools/out/vfx-preview/gen2-raw.png. */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PC, rng, hex, type RGBA } from "./canvas";
import { RAMPS, gradientMap, storyboard, stackV } from "./vfx-lib";
import { erode, type Gen } from "./vfx-gen";

const put = (f: PC, x: number, y: number, c: RGBA) => f.set(Math.round(x), Math.round(y), c);
const TAU = Math.PI * 2;
const mk = (id: string, role: Gen["role"], frames: PC[], w: number, h: number, anchor: [number, number], fps: number, hero?: string): Gen => ({ id, pack: "gen", role, frames, w, h, anchor, fps, blend: "normal", hero });

/** Щит-пузырь на герое: обод в 2 пикселя, крупа стекла внутри, блик бежит по кругу. 8 кадров цикла. */
function auraBubble(id: string, ramp: string): Gen {
  const W = 44, H = 50, cx = W / 2, cy = H / 2, rx = 20, ry = 23, N = 8, R = RAMPS[ramp];
  const frames = Array.from({ length: N }, (_, t) => {
    const f = new PC(W, H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry, d = dx * dx + dy * dy;
      if (d > 1) continue;
      if (d > 0.82) f.set(x, y, d > 0.93 ? R[3] : R[2]);
      else if ((x + y * 2 + t) % 7 === 0 && d > 0.35) f.set(x, y, R[1]);
    }
    const a0 = (t / N) * TAU;
    for (let k = 0; k < 7; k++) { const a = a0 + k * 0.11; put(f, cx + Math.cos(a) * (rx - 0.5), cy + Math.sin(a) * (ry - 0.5), k < 2 ? R[5] : R[4]); }
    put(f, cx - 11, cy - 15, R[5]); put(f, cx - 12, cy - 14, R[4]); put(f, cx - 10, cy - 16, R[4]);
    return f;
  });
  return mk(id, "aura", frames, W, H, [0.5, 0.5], 10, "warrior");
}

/** Кольцо под ногами героя (бафы-круги): две дуги и ползущие засечки. 8 кадров цикла. */
function auraRing(id: string, ramp: string): Gen {
  const W = 52, H = 28, cx = W / 2, cy = H / 2, rx = 24, ry = 11, N = 8, R = RAMPS[ramp];
  const frames = Array.from({ length: N }, (_, t) => {
    const f = new PC(W, H);
    for (let i = 0; i < 220; i++) { const a = (i / 220) * TAU; put(f, cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, R[2]); put(f, cx + Math.cos(a) * (rx - 3), cy + Math.sin(a) * (ry - 1.5), R[1]); }
    for (let k = 0; k < 10; k++) {
      const a = ((k + t / N) / 10) * TAU;
      for (let rr = rx - 3; rr <= rx; rr++) put(f, cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * (ry / rx), k % 2 ? R[3] : R[5]);
    }
    return f;
  });
  return mk(id, "aura", frames, W, H, [0.5, 0.5], 10, "healer");
}

/** Берсерк: языки красного пламени снизу вверх вокруг героя. 8 кадров цикла. */
function auraRage(id: string): Gen {
  const W = 36, H = 46, N = 8, R = RAMPS.blood, r = rng(21);
  const tongues = Array.from({ length: 20 }, () => ({ x: 4 + r() * 28, ph: r(), len: 6 + Math.floor(r() * 6) }));
  const frames = Array.from({ length: N }, (_, t) => {
    const f = new PC(W, H);
    for (const g of tongues) {
      const p = (g.ph + t / N) % 1, y = H - 4 - p * (H - 10), sway = Math.sin((p + g.ph) * TAU) * 1.5;
      for (let k = 0; k < g.len; k++) { const kk = k / g.len; put(f, g.x + sway * (1 - kk), y - k, R[kk < 0.4 ? 4 : kk < 0.75 ? 3 : 2]); put(f, g.x + 1 + sway, y - k, R[kk < 0.4 ? 3 : 2]); }
      put(f, g.x + sway, y - g.len, R[5]);
    }
    return f;
  });
  return mk(id, "aura", frames, W, H, [0.5, 0.85], 12, "reaver");
}

/** Цикл пламени (стена огня, ожог): широкое основание, языки тянутся вверх и гаснут. 8 кадров цикла. */
function flameLoop(id: string): Gen {
  const W = 34, H = 44, N = 8, R = RAMPS.fire, r = rng(55);
  const tongues = Array.from({ length: 16 }, () => ({ x: 4 + r() * 26, ph: r(), len: 8 + Math.floor(r() * 9) }));
  const frames = Array.from({ length: N }, (_, t) => {
    const f = new PC(W, H);
    for (let x = 3; x < W - 3; x++) for (let y = H - 6; y < H - 1; y++) { const d = Math.abs(x - W / 2) / (W / 2); if (d < 0.9 - (H - 2 - y) * 0.08) put(f, x, y, d < 0.4 ? R[4] : d < 0.65 ? R[3] : R[2]); }
    for (const g of tongues) {
      const p = (g.ph + t / N) % 1, top = H - 6 - g.len * (0.6 + 0.4 * Math.sin(p * Math.PI)), sway = Math.sin((p + g.ph) * TAU) * 1.2;
      for (let y = H - 6; y > top; y--) { const k = (H - 6 - y) / g.len; put(f, g.x + sway * k, y, k < 0.35 ? R[4] : k < 0.7 ? R[3] : R[2]); put(f, g.x + 1 + sway * k, y, k < 0.35 ? R[5] : R[3]); }
      put(f, g.x + sway, top, R[1]);
    }
    return f;
  });
  return mk(id, "aura", frames, W, H, [0.5, 0.9], 12, "mage");
}

/** Руны на клинке: четыре ромба по эллипсу вокруг героя, задние тусклее. 8 кадров цикла. */
function auraRunes(id: string, ramp: string): Gen {
  const W = 46, H = 40, cx = W / 2, cy = H / 2, N = 8, R = RAMPS[ramp];
  const frames = Array.from({ length: N }, (_, t) => {
    const f = new PC(W, H);
    const items = Array.from({ length: 4 }, (_, k) => { const a = ((k + t / N) / 4) * TAU; return { x: cx + Math.cos(a) * 19, y: cy + 6 + Math.sin(a) * 7, back: Math.sin(a) < 0 }; }).sort((p, q) => p.y - q.y);
    for (const it of items) {
      const c = it.back ? R[2] : R[4], d = it.back ? R[1] : R[3];
      for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) { const m = Math.abs(dx) + Math.abs(dy); if (m <= 3 && !(m === 3 && it.back)) put(f, it.x + dx, it.y + dy, m === 0 ? R[5] : m === 1 ? c : m === 2 ? d : R[2]); }
    }
    return f;
  });
  return mk(id, "aura", frames, W, H, [0.5, 0.5], 10, "deathknight");
}

/** Знамя на земле: древко с камнями у основания и колышущееся полотнище. 6 кадров цикла. */
function banner(id: string, ramp: string): Gen {
  const W = 30, H = 46, N = 6, R = RAMPS[ramp], wood = hex("#6a4228"), woodL = hex("#94613a"), stone = hex("#58525e");
  const frames = Array.from({ length: N }, (_, t) => {
    const f = new PC(W, H);
    for (let y = 3; y < 44; y++) { put(f, 7, y, wood); put(f, 8, y, woodL); }
    put(f, 7, 2, R[5]); put(f, 8, 2, R[5]); put(f, 7, 1, R[4]); put(f, 8, 1, R[4]);
    for (let x = 0; x < 16; x++) {
      const wave = Math.round(Math.sin((x / 16) * 5 - (t / N) * TAU) * 1.5 * (x / 16)), len = 14 - Math.floor(x / 5);
      for (let y = 0; y < len; y++) put(f, 9 + x, 4 + y + wave, y === 0 ? R[4] : y > len - 3 ? R[1] : (x + y) % 5 === 0 ? R[3] : R[2]);
    }
    f.ellipse(8, 44, 6, 2, stone); f.ellipse(8, 43.5, 4, 1, hex("#746e7a"));
    return f;
  });
  return mk(id, "aura", frames, W, H, [0.27, 0.95], 8, "warrior");
}

/** Капкан: раскрытые челюсти с зубьями захлопываются, искры. 7 кадров, один проход. */
function trap(id: string): Gen {
  const W = 36, H = 28, N = 7, D = hex("#23262f"), M = hex("#5d667c"), L = hex("#a9b4c8"), Wh = hex("#f2f6ff"), rust = hex("#8a5a3a");
  const frames = Array.from({ length: N }, (_, t) => {
    const f = new PC(W, H), cx = W / 2, cy = 15, open = t < 3 ? 1 : t === 3 ? 0.4 : 0;
    f.ellipse(cx, cy + 1, 15, 6, D); f.ellipse(cx, cy, 14, 5, M); f.ellipse(cx, cy - 0.5, 12, 4, rust);        // плита с ржавой серединой
    for (const side of [-1, 1]) {
      const off = side * open * 7;
      for (let i = 0; i <= 56; i++) {                                                                        // дуга челюсти в 2 пикселя
        const a = (i / 56) * Math.PI, x = cx - Math.cos(a) * 13, y = cy + off - side * Math.sin(a) * 6;
        put(f, x, y, side < 0 ? L : M); put(f, x, y + side, side < 0 ? M : D);
      }
      for (let k = -5; k <= 5; k++) {                                                                        // зубья внутрь
        const x = cx + k * 2.2, base = cy + off - side * Math.sqrt(Math.max(0, 1 - (k * 2.2 / 13) ** 2)) * 6;
        put(f, x, base + side * 2, L); put(f, x, base + side * 3, side < 0 ? M : L);
      }
    }
    if (t === 3 || t === 4) for (const [dx, dy] of [[-10, -6], [10, -6], [0, -9], [-6, 6], [6, 6]]) put(f, cx + dx, cy + dy, Wh);
    return f;
  });
  return mk(id, "cast", frames, W, H, [0.5, 0.6], 12, "ranger");
}

/** Ворон в полёте вправо: крупное тело, голова с клювом, взмах двух крыльев. 4 кадра цикла. */
function raven(id: string): Gen {
  const W = 34, H = 28, N = 4, R = RAMPS.shadow, beak = hex("#e0b84a"), eye = hex("#ffffff");
  const frames = Array.from({ length: N }, (_, t) => {
    const f = new PC(W, H), cx = 15, cy = 15, up = [-11, -5, 3, 8][t];
    for (const dz of [0, 1]) {                                                                               // дальнее крыло темнее и сзади
      const wy = cy + up * (dz ? 0.6 : 1), tip = cx - 7 - (dz ? 2 : 0);
      f.poly([[cx - 2, cy - 1], [cx + 5, cy - 1], [tip, wy], [cx - 8, wy + (up < 0 ? 3 : -3)]], dz ? R[0] : R[2]);
      f.line(cx + 2, cy - 1, tip, wy, dz ? R[1] : R[4], 1);
    }
    f.ellipse(cx, cy, 8, 4, R[1]); f.ellipse(cx - 1, cy - 1, 6.5, 2.6, R[2]);                                 // тело
    f.poly([[cx - 8, cy], [cx - 15, cy + 2], [cx - 14, cy - 2]], R[0]);                                        // хвост
    f.ellipse(cx + 8, cy - 1, 3.2, 3, R[2]);                                                                   // голова
    f.poly([[cx + 10, cy - 2], [cx + 15, cy - 1], [cx + 10, cy + 1]], beak); put(f, cx + 9, cy - 2, eye); put(f, cx + 8, cy - 2, R[5]);
    for (let x = -4; x < 6; x++) put(f, cx + x, cy - 3, R[3]);                                                // блик по спине
    return f;
  });
  return mk(id, "proj", frames, W, H, [0.55, 0.55], 14, "darkranger");
}

/** Дождь стрел: пять стрел падают наискось, втыкаются и дрожат, пыль. 10 кадров, один проход. */
function arrowVolley(id: string): Gen {
  const W = 56, H = 52, N = 10, wood = hex("#b08a5a"), steel = hex("#c8d0de"), fl = hex("#e8e0d0"), dust = hex("#d8c8a0"), dk = hex("#6a4c34");
  const arrows = [[10, 38, 0], [22, 44, 1], [34, 36, 2], [44, 42, 3], [28, 30, 4]].map(([x, y, i]) => ({ x, y, land: 2 + i }));
  const frames = Array.from({ length: N }, (_, t) => {
    const f = new PC(W, H);
    for (const a of arrows) {
      const dt = t - a.land;
      if (dt < -2) continue;
      if (dt < 0) {
        const k = -dt, hx = a.x - 5 * k, hy = a.y - 10 * k;
        for (let s = 0; s < 8; s++) put(f, hx - s * 0.5, hy - s, s < 2 ? steel : s > 5 ? fl : wood);
      } else {
        const sw = dt < 3 ? (dt % 2 ? 1 : -1) * (dt === 0 ? 0 : 1) : 0;
        if (t >= N - 2 && (a.x + t) % 2) continue;
        for (let s = 0; s < 9; s++) put(f, a.x - s * 0.4 + sw * (s / 9), a.y - s, s < 1 ? steel : s > 6 ? fl : wood);
        put(f, a.x, a.y + 1, dk); put(f, a.x + 1, a.y + 1, dk);
        if (dt < 3) for (const [dx, dy] of [[-3, 0], [3, 0], [-5, -1], [5, -1], [0, -2]]) put(f, a.x + (dx * (dt + 1)) / 2, a.y + dy - dt, dust);
      }
    }
    return f;
  });
  return mk(id, "aoe", frames, W, H, [0.5, 0.7], 14, "ranger");
}

/** Метательный топор: вращение, 4 кадра цикла 20×20. */
function axeSpin(id: string, ramp?: string): Gen {
  const S = 20, N = 4, wood = hex("#7a4e2c"), woodL = hex("#a8723e"), M = hex("#6e788e"), L = hex("#c8d0de"), W = hex("#ffffff"), D = hex("#2a2e3a");
  const base = new PC(S, S);
  base.line(10, 16, 10, 5, wood, 1); base.line(11, 16, 11, 5, woodL, 1);
  base.poly([[11, 3], [17, 1], [18, 8], [11, 8]], M); base.poly([[11, 3], [16, 2], [17, 5], [11, 6]], L);
  base.line(17, 2, 17, 8, W, 1); base.line(11, 8, 18, 8, D, 1);
  const frames = Array.from({ length: N }, (_, t) => base.rotated((t * Math.PI) / 2, 10.5, 10.5));
  return mk(id, "proj", ramp ? gradientMap(frames, RAMPS[ramp], 1.3) : frames, S, S, [0.5, 0.5], 16, "reaver");
}

/** Кандалы: цепное кольцо смыкается вокруг цели, держится и рассыпается. 10 кадров, один проход. */
function shackle(id: string, ramp?: string): Gen {
  const W = 52, H = 34, cx = W / 2, cy = H / 2 + 1, N = 10, D = hex("#23262f"), M = hex("#5d667c"), L = hex("#a9b4c8"), Wh = hex("#f2f6ff");
  const raw = Array.from({ length: N }, (_, t) => {
    const f = new PC(W, H), k = t < 4 ? 1.5 - t * 0.17 : 1, rx = 18 * k, ry = 8 * k, links = 14;
    const order = Array.from({ length: links }, (_, i) => i).sort((a, b) => Math.sin(((a / links) * TAU)) - Math.sin(((b / links) * TAU)));   // задние звенья рисуем первыми
    for (const i of order) {
      const a = (i / links) * TAU + (t < 4 ? t * 0.35 : 0), x = cx + Math.cos(a) * rx, y = cy + Math.sin(a) * ry, back = Math.sin(a) < 0;
      const c = back ? M : L, d = back ? D : M;
      if (i % 2) { for (const [dx, dy] of [[-2, -1], [-1, -1], [0, -1], [1, -1], [2, -1], [-2, 0], [2, 0], [-2, 1], [-1, 1], [0, 1], [1, 1], [2, 1]]) put(f, x + dx, y + dy, dy < 0 ? c : d); }
      else { for (let dy = -2; dy <= 2; dy++) put(f, x, y + dy, dy < 0 ? c : d); put(f, x + 1, y, d); }
    }
    if (t === 4) for (const [dx, dy] of [[-15, -4], [15, -4], [0, 10], [-10, 7], [10, 7]]) put(f, cx + dx, cy + dy, Wh);
    if (t >= N - 2) erode(f, (t - (N - 3)) * 0.3, 5 + t);
    return f;
  });
  return mk(id, "hit", ramp ? gradientMap(raw, RAMPS[ramp], 1) : raw, W, H, [0.5, 0.55], 14, "deathknight");
}

/** Лужа крови: вязкая поверхность с лопающимися пузырями. 8 кадров цикла. */
function bloodPool(id: string): Gen {
  const W = 66, H = 42, cx = W / 2, cy = H / 2, N = 8, B = RAMPS.blood, r = rng(33);
  const bubbles = Array.from({ length: 6 }, () => ({ a: r() * TAU, d: r() * 0.7, ph: r() }));
  const frames = Array.from({ length: N }, (_, t) => {
    const f = new PC(W, H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const ang = Math.atan2((y - cy) * 1.7, x - cx), wob = 1 + 0.06 * Math.sin(ang * 4 + t * 0.8) + 0.04 * Math.sin(ang * 7 - t);
      const d = Math.hypot((x + 0.5 - cx) / 31, (y + 0.5 - cy) / 18) / wob;
      if (d > 1) continue;
      f.set(x, y, d > 0.88 ? B[0] : d > 0.55 ? B[1] : B[2]);
    }
    for (let k = 0; k < 6; k++) { const a = -2.6 + k * 0.12 + t * 0.02; put(f, cx + Math.cos(a) * 22, cy + Math.sin(a) * 11, B[4]); }
    for (const b of bubbles) {
      const p = (b.ph + t / N) % 1, x = cx + Math.cos(b.a) * b.d * 26, y = cy + Math.sin(b.a) * b.d * 13;
      if (p < 0.6) { put(f, x, y, B[3]); put(f, x + 1, y, B[3]); put(f, x, y - 1, B[3]); put(f, x + 1, y - 1, B[4]); }
      else if (p < 0.8) for (const [dx, dy] of [[-2, 0], [2, 0], [0, -2], [0, 2]]) put(f, x + dx, y + dy, B[4]);
    }
    return f;
  });
  return mk(id, "aoe", frames, W, H, [0.5, 0.5], 8, "bloodweaver");
}

export function GENERATED2(): Gen[] {
  return [
    auraBubble("bubble-steel", "steel"), auraBubble("bubble-arcane", "arcane"), auraBubble("bubble-holy", "holy"), auraBubble("bubble-bone", "bone"), auraBubble("bubble-shadow", "shadow"),
    auraRing("ring-blood", "blood"), auraRing("ring-holy", "holy"), auraRing("ring-frost", "frost"), auraRing("ring-shadow", "shadow"), auraRing("ring-arcane", "arcane"),
    auraRage("aura-rage"), flameLoop("flame-loop"), auraRunes("aura-runes-frost", "frost"), auraRunes("aura-runes-holy", "holy"),
    banner("banner-holy", "holy"), banner("banner-blood", "blood"),
    trap("trap-snap"), raven("raven-fly"), arrowVolley("arrow-volley"),
    axeSpin("axe-spin"), axeSpin("axe-spin-blood", "blood"),
    shackle("shackle-steel"), shackle("shackle-shadow", "shadow"), bloodPool("blood-pool"),
  ];
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../out/vfx-preview/gen2-raw.png");
  stackV(GENERATED2().map((g) => storyboard(g.frames, g.w, g.h, g.anchor, `${g.id} ${g.frames.length}f`, 3))).save(out);
  console.log(out);
}
