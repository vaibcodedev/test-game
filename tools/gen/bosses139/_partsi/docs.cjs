const fs = require("fs");
let s = fs.readFileSync("docs/systems/bosses.md", "utf8");
const nl = s.includes("\r\n") ? "\r\n" : "\n";
const J = (t) => t.split("\n").join(nl);
const rep = (a, b) => { if (!s.includes(a)) throw new Error("MISS " + a.slice(0, 60)); s = s.replace(a, b); };
rep("| 08 → ледяной владыка (топот, ледяные копья, носильщики) |", "| 08 → Кальдрам Ледяной Владыка (топот, ледяные копья, носильщики) — **в игре** |");
rep(
  "  - `shieldWhileAdds` — пока жив призыв или объект, босс получает в 2 раза меньше урона;",
  "  - `shieldWhileAdds` — пока жив призыв или объект, босс получает в 2 раза меньше урона; в игре — через клетки (`cage`), знамя (`banner`) и носильщиков (`bearers`: идут к боссу, дошедший лечит на `healPct`);",
);
const anchor = J("\n## Отбор 17 из 35");
if (!s.includes(anchor)) throw new Error("anchor");
const sec = J(`
### Кальдрам Ледяной Владыка (08 · r65n восток) — в игре
- id \`umb_frost_lord\` · Костяной хребет · ур. 65, группа 4–5 · кадр 80×80 · возрождение 60 мин · hp ×70, dmg ×3,2, armor ×1,7 · карточка, лор и реплики — data/ring-bosses.json, добыча — data/ring-boss-loot.json (Посох Ледяного Владыки — эпический, Корона-шлем Кальдрама, Осколок ледяного сердца).
- Ф1: «Топот» (кольцо 56–120 px вокруг владыки, 1,5 с, 0,4) — безопасно вплотную и за краем. «Ледяные копья» (\`spots\`, каждые 13 с) — три ряда кругов по 26 px веером в сторону танка (3, 4 и 5 кругов, ряды выходят подряд: 0,9 / 0,75 / 0,75 с), по 0,28.
- Ф2 (< 50 %, пауза 2 с, откаты ×0,85): «Сборка» (\`bearers\`, каждые 28 с) — четыре носильщика (моб \`umb_frost_lord_bearer\`, здоровье 1,2, без добычи) встают по краю арены и идут к владыке со скоростью 44 px/с; пока хоть один жив, босс получает урон ×0,5; каждый дошедший исчезает и лечит его на 3 % (убитый не лечит).
- Арт: tools/gen/bosses139/bone_frost_lord.ts (тело в двойном разрешении, свёрнутом в 1×; в профиль и вид сзади тело сдвинуто под шлейф плаща; лицо и ядро — 2D-штампы; эффекты льда — кольцо топота, копьё, круг сборки; носильщик со щитом из льда — лист 12 столбцов); в игру — tools/gen/bosses139/to-game.ts umb_frost_lord; сценарий — tests/ring-bosses-ingame.ts --boss=umb_frost_lord → tools/out/bosses139/umb_frost_lord-ingame-*.png. Механика носильщиков — server/src/game/zoneBosses.ts (\`bearerCall\`), тест — tests/zone-bosses.ts. MAP_VERSION 29.
`);
s = s.replace(anchor, sec + anchor);
fs.writeFileSync("docs/systems/bosses.md", s);
// MAP_VERSION
let m = fs.readFileSync("shared/map.ts", "utf8");
const a = "export const MAP_VERSION = 28; // 28 —";
if (!m.includes(a)) throw new Error("map ver");
m = m.replace(a, "export const MAP_VERSION = 29; // 29 — арена босса кольца r65n восток (Кальдрам Ледяной Владыка, задача 139); 28 —");
fs.writeFileSync("shared/map.ts", m);
console.log("ok");
