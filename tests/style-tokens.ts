// Минимальный тест палитры: проверяет ключевые значения shared/palette.ts
import { P } from "../shared/palette";

const checks: [keyof typeof P, string][] = [
  ["gold",    "#d6a84b"],
  ["boss",    "#ff6a2a"],
  ["foe",     "#ff3030"],
  ["bg",      "#120f16"],
  ["hp",      "#d0443c"],
  ["badLine", "#8a2a2a"],
  ["goldNum", "#ffd84a"],
];

let passed = 0;
for (const [key, expected] of checks) {
  const actual = P[key];
  if (actual !== expected) {
    throw new Error(`palette.${key}: expected ${expected}, got ${actual}`);
  }
  console.log(`ok  palette ${key} === ${expected}`);
  passed++;
}
console.log(`\nAll ${passed} checks passed.`);
