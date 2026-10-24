/** Пиксель-арт городских мелочей: шатёр лагеря, частокол безопасной полосы, жаровня, камень телепорта. */
import { PC, hash01, hex, withA } from "./canvas";
import { CITY, P } from "./palette";

type Art = () => PC;

const { SAND, TEAL, SNOWC, LOG } = CITY;
const FIRE = P.magic.fire;
/** Снежная шапка на горизонтальной кромке. */
function snowCap(c: PC, x: number, y: number, w: number, seed: number) {
  for (let i = 0; i < w; i++) {
    const h = 2 + Math.floor(hash01(i, seed, 5) * 3);
    for (let j = 0; j < h; j++) c.set(x + i, y - j, SNOWC[j === h - 1 ? 3 : 2]);
    c.set(x + i, y + 1, SNOWC[1]);
  }
}


const tent: Art = () => {
  const c = new PC(96, 80);
  c.poly([[2, 76], [94, 76], [48, 8]], (x, y) => {
    const stripe = Math.floor((x + (76 - y) * 0.4) / 8) % 2;
    const lit = x < 48 ? 0 : 1;
    return stripe ? (lit ? hex("#cdbfa8") : hex("#e8e0d0")) : lit ? TEAL[1] : TEAL[2];
  });
  c.poly([[34, 76], [62, 76], [48, 38]], hex("#1c1210"));
  c.poly([[34, 76], [46, 76], [40, 56]], P.cloth.brown[1]);
  c.rect(47, 0, 2, 12, P.wood[2]);
  c.poly([[49, 0], [60, 3], [49, 6]], P.cloth.red[2]);
  c.rect(2, 74, 92, 3, SAND[1]);
  return c.outline();
};

// ---------------- Снежная долина ----------------
function palisade(w: number, h: number, seed: number): PC {
  const c = new PC(w, h);
  for (let i = 0; i < w; i += 8) {
    const top = 8 + Math.floor(hash01(i, seed, 3) * 6);
    c.poly([[i, top + 8], [i + 4, top], [i + 8, top + 8], [i + 8, h], [i, h]], (x, y) => LOG[x - i < 3 ? 4 : x - i > 5 ? 1 : 3 - ((y >> 3) & 1) * 0 - (hash01(x, y >> 2, seed) < 0.18 ? 1 : 0)]);
    c.rect(i + 7, top + 8, 1, h - top - 8, LOG[0]);
    snowCap(c, i + 1, top + 5, 6, seed + i);
  }
  c.rect(0, 30, w, 3, LOG[0]);
  c.rect(0, 31, w, 1, LOG[2]);
  c.rect(0, h - 22, w, 3, LOG[0]);
  c.rect(0, h - 21, w, 1, LOG[2]);
  c.rect(0, h - 3, w, 3, SNOWC[1]);
  return c;
}
const palH: Art = () => palisade(32, 56, 4);
const palV: Art = () => palisade(32, 56, 9);
const brazier: Art = () => {
  const c = new PC(32, 48);
  for (const [x0, x1] of [[8, 13], [24, 19], [16, 16]]) c.line(x0, 46, x1, 28, P.darkSteel[2], 2);
  c.shadedEllipse(16, 27, 10, 4, P.darkSteel);
  c.ellipse(16, 25, 8, 3, hex("#2a1410"));
  c.ellipse(16, 24, 6, 2, FIRE[2]);
  c.poly([[10, 25], [13, 12], [16, 19], [19, 8], [22, 25]], (x, y) => (y > 18 ? FIRE[3] : FIRE[2]));
  c.poly([[13, 25], [16, 16], [19, 25]], FIRE[4]);
  return c.outline();
};

// ---------------- камень телепорта ----------------
const teleportStone: Art = () => {
  const c = new PC(48, 80);
  const ST = P.stone;
  c.shadedEllipse(24, 74, 20, 6, P.stone);
  c.ellipse(24, 73, 15, 4, hex("#2a1a4a"));
  c.ellipse(24, 73, 11, 2.5, P.magic.purple[2]);
  // стела
  c.poly([[14, 72], [34, 72], [36, 30], [30, 12], [24, 6], [18, 12], [12, 30]], (x, y) => ST[x < 20 ? 3 : x < 27 ? 2 : 1] ?? ST[2]);
  for (let y = 10; y < 70; y += 3) if (hash01(y, 7, 2) < 0.5) c.rect(14 + Math.floor(hash01(y, 3, 5) * 18), y, 2, 1, ST[4]);
  // руны
  const rune = P.magic.blue;
  for (const [x, y] of [[24, 22], [24, 28], [21, 34], [27, 34], [24, 42], [20, 48], [28, 48], [24, 56]]) c.rect(x - 1, y, 3, 2, rune[3]);
  c.rect(23, 20, 2, 40, withA(rune[2], 150));
  c.ellipse(24, 26, 3, 3, rune[4]);
  return c.outline();
};

export const CITY_ART: Record<string, Art> = {
  tent, pal_h: palH, pal_v: palV,
  brazier, teleport_stone: teleportStone,
};
