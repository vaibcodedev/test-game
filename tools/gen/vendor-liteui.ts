/** Нарезка LiteUI Fantasy (cathean, vendor/liteui) для рамок интерфейса (задача 126, пачка 4).
 *  Запуск: npx tsx tools/gen/vendor-liteui.ts
 *  Перекраска по таблице судьи (SP/ui-recolor/11-liteui-rc.png), увеличение ×2 без сглаживания, вывод в client/public/ui/liteui/
 *  (папка в .gitignore: лицензия молчит о раздаче). Выход:
 *   ring.png  36×36, центр прозрачный — тонкая рамка ячейки .cell, слота .hb-slot и полос HP/MP (slice 2);
 *   panel.png 128×128, центр прозрачный — плашка героя .hud-player и рамка панели умений .hud-bar (slice 18).
 *  Нет картинки — CSS остаётся с обычной рамкой (border-color). */
import { PNG } from "pngjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SRC = path.join(ROOT, "vendor/liteui/src/LiteUI-Fantasy/Exported");
const OUT = path.join(ROOT, "client/public/ui/liteui");

/** Исходный цвет → наш (таблица судьи). Незнакомые оттенки тычинок рамки уходят в цвет линии панелей. */
const MAP: Record<string, string> = {
  bdaa97: "1a141e", d4c2b6: "241c29", c0a899: "2a2030",
  fbf2eb: "a58167", ede4da: "a58167",
  "353540": "0e0b11", "454751": "0e0b11",
  "4d3f38": "4d3f4a", a88b79: "4d3f4a", bfb8b4: "4d3f4a", "918d8d": "4d3f4a", "636167": "4d3f4a",
  "86735b": "1a141e", "7e674c": "241c29",
};
const hx = (r: number, g: number, b: number) => [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");

function load(name: string): PNG {
  return PNG.sync.read(fs.readFileSync(path.join(SRC, name + ".png")));
}
/** Перекраска, центру (по маске) — прозрачность; затем ×2 ближайшим соседом. */
function recolor(p: PNG, clear: (x: number, y: number, key: string) => boolean): PNG {
  const o = new PNG({ width: p.width * 2, height: p.height * 2 });
  for (let y = 0; y < p.height; y++) for (let x = 0; x < p.width; x++) {
    const i = (y * p.width + x) * 4;
    let rgb = [0, 0, 0], a = p.data[i + 3];
    if (a) {
      const key = hx(p.data[i], p.data[i + 1], p.data[i + 2]);
      if (clear(x, y, key)) a = 0;
      else {
        const to = MAP[key];
        if (!to) throw new Error(`нет цвета ${key} в таблице (${x},${y})`);
        rgb = [0, 2, 4].map((k) => parseInt(to.slice(k, k + 2), 16));
      }
    }
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
      const j = ((y * 2 + dy) * o.width + x * 2 + dx) * 4;
      o.data[j] = rgb[0]; o.data[j + 1] = rgb[1]; o.data[j + 2] = rgb[2]; o.data[j + 3] = a;
    }
  }
  return o;
}
const save = (name: string, p: PNG) => { fs.writeFileSync(path.join(OUT, name), PNG.sync.write(p)); console.log("записано", name, p.width + "×" + p.height); };

fs.mkdirSync(OUT, { recursive: true });
// кольцо: только внешняя линия слота (1 px исходника), всё внутри прозрачно
const slot = load("Slot");
save("ring.png", recolor(slot, (x, y, key) => key !== "ede4da"));
// плашка: линия, тёмный контур с угловыми накладками и внутренняя кайма; заливка прозрачна — под ней фон панели
const panel = load("Panel");
save("panel.png", recolor(panel, (_x, _y, key) => key === "bdaa97"));
