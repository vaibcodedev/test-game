/** Тела Пепельнорождённых — стражи Эмберхолла (data/ember-guard.json body): лист nude_<класс> → кожа и волосы в шлак и пепел,
 *  глаза тлеют, тусклые жилы углей. Лист того же размера и раскладки — в игре подменяет nude_<класс> у стражи Эмберхолла
 *  (client/src/game/UnitView.ts). В игру — npm run assets (writeAshBodiesGame), превью — tools/gen/npc-sets.ts. */
import path from "node:path";
import { PC, hex } from "./canvas";
import { readPng } from "./standards";
import EMBER_DATA from "../../data/ember-guard.json";

/** Классы стражи (по наборам figs). */
export const ASH_CLASSES = [...new Set(EMBER_DATA.figs.map((f) => f.cls))];

/** Тело Пепельнорождённого из листа nude_<класс> (src). */
export function ashBody(src: PC): PC {
  const B = EMBER_DATA.body, skin = new Map(Object.entries(B.skin).map(([k, v]) => [k, hex(v)]));
  const ash = B.ash.map((q) => hex(q)), OUTL = new Set(["1b1422", "2a1a24"]), EYE = "2a1a24";
  const b = src.clone().map((c) => {
    if (!c[3]) return c;
    const k = c.slice(0, 3).map((v) => v.toString(16).padStart(2, "0")).join("");
    if (k === "1b1422") return c;
    if (k === EYE) return hex(B.eye);
    const m = skin.get("#" + k);
    if (m) return m;
    if (OUTL.has(k)) return c;
    const lum = (0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2]) / 255;               // волосы и прочее — по яркости в рампу пепла
    return ash[Math.max(0, Math.min(ash.length - 1, Math.round(lum * (ash.length - 1) * 1.15)))];
  });
  // жилы углей: по виду (строка листа), во всех кадрах шага и удара — только там, где тело
  for (let row = 0; row < 3; row++) for (let col = 0; col < 8; col++) for (const [i, [x, y]] of B.veins[row].entries()) {
    const X = col * 32 + x, Y = row * 32 + y + (col === 3 || col === 7 ? -1 : 0);
    const c = b.get(X, Y);
    if (c && c[3] && c.slice(0, 3).join() !== "27,20,34") b.set(X, Y, hex(B.vein[i % 2]));
  }
  return b;
}

/** Листы для игры: units/nude_ashborn_<класс>.png из уже собранных units/nude_<класс>.png; возвращает id листов (кадр 32). */
export function writeAshBodiesGame(assetsRoot: string): string[] {
  return ASH_CLASSES.map((cls) => {
    const id = `nude_ashborn_${cls}`;
    ashBody(readPng(path.join(assetsRoot, "units", `nude_${cls}.png`))).save(path.join(assetsRoot, "units", `${id}.png`));
    return id;
  });
}
