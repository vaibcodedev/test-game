/** Редактор конфигов (задача 145): схема покрывает balance.json, запись сохраняет оформление, значение вне границ отклоняется. */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createStore, DATA } from "../editor/server/store";
import { patchJson, parseJson } from "../editor/server/jsonpatch";
import { uncovered, validate, resolve, liveText } from "../editor/schema/index";

const store = createStore();
const balance = store.read("balance");

// 1. схема объясняет каждый ключ balance.json
const missing = uncovered("balance", balance.data);
assert.deepEqual(missing, [], `нет объяснения для: ${missing.join(", ")}`);

// 2. сохранение без изменений — тот же файл, байт в байт (все файлы data/)
for (const f of store.list().filter((x) => !x.readonly)) {
  const text = fs.readFileSync(store.file(f.name), "utf8");
  assert.equal(patchJson(text, parseJson(text)), text, `${f.name}.json изменился при пустом сохранении`);
}

// 3. правка одного числа — diff в одну строку, оформление (CRLF, встроенные массивы) сохранено
{
  const text = balance.text;
  const d: any = JSON.parse(JSON.stringify(balance.data));
  d.pvp.class.healer.dmg = [[30, 1.8], [100, 1.1]];
  d.moveMul = 0.8;
  const after = patchJson(text, d);
  const a = text.split("\r\n"), b = after.split("\r\n");
  assert.equal(a.length, b.length, "число строк не должно меняться");
  const diff = a.map((l, i) => (l === b[i] ? 0 : 1) as number).reduce((x, y) => x + y, 0);
  assert.equal(diff, 2, `изменилось ${diff} строк вместо 2`);
  assert.ok(after.includes("[[30, 1.8], [100, 1.1]]"), "массив точек остался в одной строке");
  assert.deepEqual(parseJson(after), d);
  // добавленный ключ: файл остаётся валидным JSON, остальное не тронуто
  d.pvp.class.mage.extra = 1;
  assert.deepEqual(parseJson(patchJson(text, d)), d);
}

// 4. значение вне границ отклоняется (схема и сохранение)
{
  const bad: any = JSON.parse(JSON.stringify(balance.data));
  bad.moveMul = 7;
  assert.ok(validate("balance", bad, balance.data).some((p) => p.path === "moveMul"), "moveMul 7 должен быть отклонён");
  const bad2: any = JSON.parse(JSON.stringify(balance.data));
  bad2.loot.item = 1.5;
  bad2.pet.refLevel = 3.5;
  const probs = validate("balance", bad2, balance.data).map((p) => p.path);
  assert.ok(probs.includes("loot.item") && probs.includes("pet.refLevel"), "вероятность >1 и дробный уровень отклоняются");
  const bad3: any = JSON.parse(JSON.stringify(balance.data));
  bad3.mob.hp = [[10, 100], [5, 50]];
  assert.ok(validate("balance", bad3, balance.data).some((p) => p.path === "mob.hp"), "точки не по возрастанию отклоняются");
  const bad4: any = JSON.parse(JSON.stringify(balance.data));
  bad4.gcd = "быстро";
  assert.ok(validate("balance", bad4, balance.data).length > 0, "смена типа отклоняется");
  // сохранение в копии каталога: отказ не меняет файл, нормальная правка пишется
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "editor-"));
  try {
    fs.copyFileSync(path.join(DATA, "balance.json"), path.join(tmp, "balance.json"));
    const s = createStore(tmp);
    const before = fs.readFileSync(path.join(tmp, "balance.json"), "utf8");
    const r = s.save("balance", bad);
    assert.equal(r.ok, false);
    assert.equal(fs.readFileSync(path.join(tmp, "balance.json"), "utf8"), before, "отклонённое сохранение не пишет файл");
    const good: any = JSON.parse(JSON.stringify(balance.data));
    good.gcd = 0.8;
    const r2 = s.save("balance", good);
    assert.ok(r2.ok && r2.changed);
    assert.equal((parseJson(fs.readFileSync(path.join(tmp, "balance.json"), "utf8")) as any).gcd, 0.8);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

// 5. объяснения считают понятные числа
{
  const b: any = balance.data;
  const ctx = (p: string[]) => liveText("balance", p, p.reduce((o: any, k) => o[k], b), b, b, p.slice(0, -1).reduce((o: any, k) => o[k], b));
  assert.match(ctx(["aggroMul"]), /3,75 клетки/, "aggro 150 с множителем 0,8 → 3,75 клетки");
  assert.match(ctx(["moveMul"]), /3,5/, "герой 150 × 0,75 → 3,5 клетки/с");
  assert.match(ctx(["pvp", "class", "healer", "dmg"]), /Клирик/);
  assert.ok(resolve("balance", ["pvp", "class", "healer", "dmg"], 1.57).doc.live!(1.57, { bal: b, root: b, parent: b.pvp.class.healer, path: ["pvp", "class", "healer", "dmg"] }).includes("57 % сильнее"));
}
console.log("editor: ok");
