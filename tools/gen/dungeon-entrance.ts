/**
 * Вход в «Пепельные чертоги» на карте мира (dg_entrance, 6×5 клеток) в 3/4 сверху: каменный портал вставлен в ПЕРЕДНИЙ СКАЛЬНЫЙ ОБРЫВ насыпи (холма с руинами):
 * сверху — освещённая травяная площадка с мхом и камнями, спереди — обрыв со слоями породы и тенью под кромкой, по бокам обрыв сходит на нет, зарастая травой;
 * перед порталом лестница врезана в землю — по бокам видны подпорные стенки выреза; вокруг лестницы выбитая земля, щебень, пепел; под основанием насыпи мягкая тень;
 * у подножия — статуи павших королей, жаровни, сломанные колонны. Опора — нижняя середина.
 */
import { PC, hash01, hex, mix, withA, ramp, type RGBA, type Ramp } from "./canvas";
import { cylV, frame32, box, grain } from "./volume-lib";
import { MAR, GLD, ASH, LAVA, braziA, statueB, type Scene } from "./dungeon-mock";

const tone = (r: Ramp, v: number): RGBA => r[Math.max(0, Math.min(r.length - 1, Math.round(v)))];
const GRASS = ramp("#16301a", "#234a22", "#34692b", "#4c8a36", "#72aa48", "#9cc866");
const ROCK = ramp("#15131a", "#26222a", "#3c3538", "#54493f", "#72655a", "#948773");
const DIRT = ramp("#1e1612", "#33261c", "#4a3826", "#654d34", "#84684a");
const rnd = (a: number, b: number, s = 1) => hash01(a, b, s);
const smooth = (x: number, seed: number, period = 14) => { const i = Math.floor(x / period), f = x / period - i, a = rnd(i, 0, seed), b = rnd(i + 1, 0, seed); return a + (b - a) * (f * f * (3 - 2 * f)); };

/** Вход: каменный цоколь руины (кладка вместо дёрна), выбор пользователя из вариантов a/b/c. */
export function entrance(): PC {
  const W = 240, H = 196, pc = new PC(W, H), cx = W / 2, yb = H - 6;
  const pp = new PC(W, H), S2: Scene = { pc: pp, lights: [], shadows: [], emit: new PC(W, H) };
  const hw = W / 2 - 6;
  // силуэт насыпи: u — поперёк (−1..1); ширина верхней площадки, высота обрыва и основание зависят от u, края неровные
  const baseY = (x: number) => yb - 54 + (rnd(Math.floor(x / 5), 1, 11) - 0.5) * 4 + Math.pow(Math.abs((x - cx) / hw), 3) * 14;
  const cliffH = (x: number) => { const u = Math.abs((x - cx) / hw); return (74 * Math.pow(Math.max(0, 1 - Math.pow(u, 3.2)), 0.8) + (smooth(x, 12) - 0.5) * 12) * (u > 0.96 ? 0 : 1); };
  const lipY = (x: number) => baseY(x) - cliffH(x);
  const depth = (x: number) => { const u = Math.abs((x - cx) / hw); return 50 * Math.pow(Math.max(0, 1 - u * u), 0.55) + (smooth(x, 13, 18) - 0.5) * 10; };
  // тень на землю: свет сверху-слева, тень падает вправо-вниз от насыпи
  for (let y = yb - 90; y < yb + 4; y++) for (let x = 0; x < W; x++) {
    const u = (x - (cx + 26)) / (hw + 14), vv = (y - (baseY(cx) + 10)) / 22, d = u * u + vv * vv;
    if (d < 1 && y >= baseY(x) - 6) pc.set(x, y, withA(hex("#04100a"), Math.round(150 * Math.pow(1 - d, 0.7))));
  }
  // верхняя площадка (светлая, свет сверху-слева, подсвеченная кромка) и обрыв (тёмные склоны, справа темнее)
  const plinth = true;
  for (let x = 4; x < W - 4; x++) {
    const lip = Math.round(lipY(x)), top = Math.round(lip - depth(x)), bot = Math.round(baseY(x)), uu = (x - cx) / hw;
    if (cliffH(x) <= 0.5) continue;
    for (let y = top; y < lip; y++) {
      const t = (y - top) / Math.max(1, lip - top), n = rnd(x, y, 21), m = smooth(x * 1.3 + y, 22, 9);
      const light = 4.1 - uu * 0.55 - (1 - t) * 0.35 + (n - 0.5) * 0.5 + (m - 0.5) * 0.6; // светлый верх, левее и ближе к кромке светлее
      let c = plinth ? tone(ROCK, light - 0.3 + (rnd(Math.floor(x / 8), Math.floor(y / 6), 24) - 0.5) * 0.7) : tone(GRASS, light);
      if (plinth && ((y - top) % 9 === 0 || (x + Math.floor((y - top) / 9) * 6) % 14 === 0)) c = tone(ROCK, light - 1.3); // швы плит
      if (!plinth && rnd(Math.floor(x / 3), Math.floor(y / 3), 23) < 0.06 && m > 0.45) c = tone(ROCK, 3.4 + n * 1.5);
      if (m < 0.2) c = mix(c, hex(plinth ? "#4a8a3a" : "#5a9a3a"), 0.4);
      if (y < top + 2) c = mix(c, hex("#0a1a0a"), 0.35);
      const edgeD = Math.min(y - top, Math.min(x - 4, W - 5 - x)); pc.set(x, y, edgeD < 2 ? withA(c, Math.round(255 * (edgeD + 1) / 3)) : c);
    }
    pc.set(x, lip - 2, tone(plinth ? ROCK : GRASS, 5)); pc.set(x, lip - 1, tone(plinth ? ROCK : GRASS, 5.4)); pc.set(x, lip, tone(DIRT, 1)); pc.set(x, lip + 1, tone(ROCK, 0.3)); // подсвеченная кромка и тень под ней
    for (let y = lip + 2; y < bot; y++) {
      const t = (y - lip) / Math.max(1, bot - lip), u = Math.abs(uu), band = Math.floor((y + smooth(x, 31, 22) * 6) / 7);
      let k = 2.4 + (rnd(band, 3, 32) - 0.5) * 0.9 - t * 0.9 - u * 0.6 + (rnd(x, y, 33) - 0.5) * 0.35 - (uu > 0 ? uu * 0.9 : uu * 0.2); // склоны тёмные, справа темнее
      if (plinth) { const row = Math.floor((y - lip) / 7), off = row % 2 ? 7 : 0; if ((y - lip) % 7 === 0 || (x + off) % 14 === 0) k -= 0.9; k += 0.35; }
      else {
        if ((y + Math.floor(smooth(x, 31, 22) * 6)) % 7 === 0) k -= 0.9;
        if (rnd(Math.floor(x / 6), 5, 34) < 0.07 && t > 0.1) k -= 1.1;
      }
      pc.set(x, y, tone(ROCK, k));
    }
    pc.set(x, bot, tone(ROCK, 0.3));
  }
  // земляной фартук у подножия лестницы: выбитая земля мягко переходит в траву (прозрачность падает к краю)
  for (let y = baseY(cx) - 2; y < yb + 2; y++) for (let x = cx - 74; x <= cx + 74; x++) {
    const u = (x - cx) / 74, v = (y - (yb - 10)) / 30, d = Math.sqrt(u * u + v * v);
    if (d < 1) pc.set(x, Math.round(y), withA(tone(DIRT, 1.6 + rnd(x, Math.round(y), 71) * 1.6), Math.round(235 * Math.pow(1 - d, 0.6))));
  }
  // портал, вставленный в обрыв: тёмный проём, косяки, перемычка (верх под дёрном)
  const oy0 = Math.round(lipY(cx)) + 14, oy1 = Math.round(baseY(cx)) - 2, ox0 = cx - 34, ox1 = cx + 34;
  for (let y = oy0; y < oy1; y++) for (let x = ox0; x < ox1; x++) { const g = Math.max(0, (y - oy0) / (oy1 - oy0)); pp.set(x, y, mix(hex("#06040a"), hex("#6a1a0a"), g * g * 0.85)); }
  for (const sx of [-1, 1]) {
    const px = sx < 0 ? ox0 - 11 : ox1 + 11;
    cylV(pp, px, oy0 - 4, oy1 + 3, 8, MAR, { k: 0.45, cap: null, tex: (phi) => (Math.floor((phi + 2) * 4) % 2 ? -0.25 : 0.2) });
    box(pp, px - 11, oy1 - 3, 22, 8, 8, { r: MAR, tex: grain(2, 0.2) }, { r: MAR }, { r: MAR });
    box(pp, px - 11, oy0 - 12, 22, 9, 8, { r: MAR, tex: grain(5, 0.2) }, { r: MAR }, { r: MAR });
  }
  box(pp, ox0 - 24, oy0 - 20, ox1 - ox0 + 48, 14, 10, { r: MAR, tex: grain(3, 0.2) }, { r: MAR }, { r: MAR });
  for (let x = ox0 - 20; x < ox1 + 20; x += 6) pp.set(x, oy0 - 13, tone(GLD, x % 12 ? 2.4 : 3.6));
  // лестница вниз: ближняя ступень самая широкая и светлая, каждая следующая уже и темнее (перспектива), у каждой светлая кромка и тёмный подступенок; боковые стенки в тени, выше к дальнему концу
  const sy0 = oy1 + 2, sy1 = yb - 2, steps = 8, sh = (sy1 - sy0) / steps;
  for (let i = steps - 1; i >= 0; i--) { // от дальней к ближней
    const t = i / (steps - 1), y1 = Math.round(sy1 - sh * i), y0 = Math.round(y1 - sh), hwd = Math.round(44 - 14 * t), base = 4.4 - 3.0 * t;
    for (let y = y0; y < y1; y++) for (let x = cx - hwd; x <= cx + hwd; x++) {
      const row = y - y0, edge = row === 0, riser = row >= Math.floor(sh) - 2;
      let k = base + (edge ? 1.3 : riser ? -0.9 : 0) + (rnd(x, y, 41) - 0.5) * 0.35 - (x > cx ? 0.2 : 0);
      pp.set(x, y, mix(tone(MAR, k), hex("#ff4a14"), Math.min(0.5, t * 0.5) * (edge ? 0.4 : 0.8)));
    }
    for (const sx of [-1, 1]) { // стенка: тёмная, светлый верх; выше к дальнему концу
      const wx = sx < 0 ? cx - hwd - 8 : cx + hwd + 1, h = 5 + Math.round(t * 12);
      for (let y = y0 - h; y < y1; y++) for (let x = wx; x < wx + 8; x++) pp.set(x, y, y === y0 - h ? tone(MAR, 4.6 - (sx > 0 ? 0.6 : 0)) : tone(MAR, 1.1 + (rnd(x, y, 62) - 0.5) * 0.3 + (sx < 0 ? 0.3 : 0) - t * 0.3));
    }
  }
  // выбитая земля вокруг лестницы, щебень, трава на краях обрыва
  for (let k = 0; k < 120; k++) {
    const a = rnd(k, 1, 51) * 6.283, r = 36 + rnd(k, 2, 51) * 26, x = Math.round(cx + Math.cos(a) * r * 1.5), y = Math.round(yb - 10 + Math.sin(a) * r * 0.22);
    if (y > yb - 2 || y < baseY(x) + 2) continue;
    pc.set(x, y, tone(DIRT, 1.5 + rnd(k, 3, 51) * 2.5)); if (rnd(k, 4, 51) < 0.5) pc.set(x + 1, y, tone(DIRT, 2 + rnd(k, 5, 51) * 2));
  }
  for (let k = 0; k < 70; k++) {
    const x = Math.round(8 + rnd(k, 6, 52) * (W - 16)), y = Math.round(baseY(x) + (rnd(k, 7, 52) - 0.35) * 8);
    if (Math.abs(x - cx) < 42) continue;
    pc.rect(x, y, 2 + (k % 3), 2, tone(GRASS, 2 + rnd(k, 8, 52) * 3)); pc.set(x + 1, y - 1, tone(GRASS, 4)); // пучки травы на подошве
  }
  for (let k = 0; k < 16; k++) {
    const x = Math.round(10 + rnd(k, 9, 53) * (W - 20)), y = Math.round(baseY(x) + 3 + rnd(k, 10, 53) * 9);
    if (Math.abs(x - cx) < 44) continue;
    pc.ellipse(x, y, 3 + rnd(k, 11, 53) * 3, 2 + rnd(k, 12, 53) * 1.5, withA(tone(ROCK, 2 + rnd(k, 13, 53) * 2.5), 235)); // щебень
  }
  // сломанные колонны и статуи павших королей у подножия, жаровни у лестницы
  for (const sx of [-1, 1]) {
    const x = cx + sx * 104, y = yb - 6;
    pp.ellipse(x, y + 1, 11, 3, withA(hex("#06100a"), 130));
    cylV(pp, x, y - 16, y, 7, MAR, { k: 0.5, cap: null, tex: (phi) => (Math.floor((phi + 2) * 4) % 2 ? -0.25 : 0.2) });
    pp.ellipse(x, y - 16, 7, 2.6, tone(MAR, 4));
  }
  statueB(S2, 30, yb - 18, 0); statueB(S2, W - 30, yb - 18, 2);
  braziA(S2, cx - 62, yb - 6, 1.1); braziA(S2, cx + 62, yb - 6, 1.1);
  // пепел и искры
  for (let k = 0; k < 14; k++) pc.ellipse(14 + rnd(k, 14, 54) * (W - 28), yb - 3 - rnd(k, 15, 54) * 6, 4 + rnd(k, 16, 54) * 5, 1.4, withA(tone(ASH, 1.2 + rnd(k, 17, 54)), 200));
  for (let k = 0; k < 34; k++) { const x = Math.round(rnd(k, 18, 55) * W), y = Math.round(oy0 + rnd(k, 19, 55) * (yb - oy0)); if (pc.alpha(x, y) && k % 2 === 0) pc.set(x, y, LAVA[2 + (k % 2)]); }
  pc.blit(pp.outline(hex("#0c0a12")), 0, 0);
  return frame32(pc);
}
void frame32;
