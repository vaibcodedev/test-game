// Сверяет цвета shared/palette.ts с токенами :root в client/src/styles.css:
// ключ P.numGold ↔ --num-gold, P.lineHi ↔ --line-hi и т. д.
import fs from "node:fs";
import path from "node:path";
import { P } from "../shared/palette";

const css = fs.readFileSync(path.resolve("client/src/styles.css"), "utf8");
const root = css.match(/:root\s*\{([^}]*)\}/);
if (!root) throw new Error("в styles.css нет блока :root");

const vars = new Map<string, string>();
for (const m of root[1].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) vars.set(m[1], m[2].trim());

const norm = (v: string) => v.toLowerCase().replace(/\s+/g, "").replace(/(^|[(,])0\./g, "$1.");
const kebab = (k: string) => "--" + k.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase());

let bad = 0;
for (const [key, value] of Object.entries(P)) {
  const name = kebab(key);
  const cssValue = vars.get(name);
  if (cssValue === undefined) {
    console.log(`FAIL ${name} нет в :root (P.${key} = ${value})`);
    bad++;
  } else if (norm(cssValue) !== norm(value)) {
    console.log(`FAIL ${name}: в CSS ${cssValue}, в palette.ts ${value}`);
    bad++;
  } else {
    console.log(`ok   ${name} = ${value}`);
  }
}
if (bad) throw new Error(`style-tokens: ${bad} расхождений между :root и shared/palette.ts`);
console.log(`\nВсе ${Object.keys(P).length} цветов palette.ts совпадают с :root.`);
