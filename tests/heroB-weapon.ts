/**
 * Герой «Б» (задача 147): оружие одно и только из его листа. Запуск: npx tsx tests/heroB-weapon.ts
 * 1) В сведении облика слои weapon@ приходят из одной группы (сет оружия), у тела и причёски оружия нет.
 * 2) Двуручник «за спиной» (weaponPlace back) — только в сборе и верхом; в гибели — «выпал»; в остальных анимациях — в руке.
 * 3) Ткань «Спины» (Rope) не сводится в лист, плащ сета с тканью не дублируется; у UnitView старые слои GearLayers при герое Б не рисуются.
 * 4) Листы оружия Рыцаря: в каждом кадре один клинок — пиксели всех weapon@ кадра одна связная компонента (без второго меча «за спиной»).
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import { PNG } from "pngjs";
import { ANIMS, NF, pose, type AnimId, type Look } from "../tools/gen/hero147/base_b";
import { dress, setOf } from "../tools/gen/gear147/gear";

let n = 0;
const ok = (c: boolean, m: string) => { assert.ok(c, m); n++; };
const root = "client/public/assets/hero147", man = JSON.parse(fs.readFileSync(`${root}/manifest.json`, "utf8"));

// 1) источники слоёв оружия
for (const g of Object.keys(man.groups)) if (g.startsWith("body/") || g.startsWith("hair/")) ok(!Object.keys(man.groups[g]).some((k) => k.startsWith("weapon@")), `нет оружия в ${g}`);
for (const set of ["chaos-knight", "recruit-plate"]) for (const sex of ["m", "f"]) {
  const g = man.groups[`gear/${set}/${sex}/great`];
  ok(!!g && Object.keys(g).some((k) => k.startsWith("weapon@")), `${set}/${sex}: оружие в листе сета`);
}

// 2) режим двуручника по анимациям (поза с поправкой оружия сета, как в экспорте)
for (const set of ["chaos-knight", "recruit-plate"]) {
  const look = dress({ fac: "sol", sex: "m", hair: "tousled" } as Look, setOf(set));
  for (const a of ANIMS as AnimId[]) {
    if (!man.rows.great.some((r: string[]) => r[0] === a)) continue;
    for (const v of ["down", "up", "side"] as const) for (let i = 0; i < NF(a); i++) {
      const P = pose(look, a, i, v), back = !P.weapon && a !== "death";
      if (back) ok(a === "ride" || a === "gather", `${set}: «за спиной» только в сборе и верхом, а тут ${a} ${v} ${i}`);
    }
  }
  n++;
}

// 3) сборка и UnitView (исходник): плащ с тканью не сводится, GearLayers при герое Б выключены
const hb = fs.readFileSync("client/src/game/heroB.ts", "utf8"), uv = fs.readFileSync("client/src/game/UnitView.ts", "utf8");
ok(/s === "cloak" && set === clothSet/.test(hb), "плащ с тканью не сводится в лист");
ok(/gearOn = [^\n]*!this\.hb/.test(uv), "GearLayers при герое Б не рисуются");

// 4) один клинок в кадре: все листы weapon@ Рыцаря в кадре — одна связная компонента (допуск 2 px на перекрытие кистью)
{
  const groups = ["body/sol_m/great", "gear/chaos-knight/m/great"], rows = man.rows.great as [string, string][];
  const ents: any[] = groups.flatMap((g) => Object.entries(man.groups[g]).filter(([k]) => k.startsWith("weapon@")).map(([, e]) => e));
  const pngs = new Map(ents.map((e) => [e.file, PNG.sync.read(fs.readFileSync(`${root}/${e.file}`))]));
  let bad = 0, frames = 0;
  rows.forEach(([a], r) => {
    for (let i = 0; i < Math.min(12, man.anims[a].frames); i++) {
      const F = 96, img = new Uint8Array(F * F * 3), has = new Uint8Array(F * F);
      for (const e of ents.filter((e) => e.z[r]?.[i] != null).sort((p, q) => p.z[r][i] - q.z[r][i])) {
        const p = pngs.get(e.file)!, f = e.frame, dx = 48 - e.origin[0], dy = 81 - e.origin[1];
        for (let y = 0; y < f; y++) for (let x = 0; x < f; x++) { const s = ((r * f + y) * p.width + i * f + x) * 4; if (p.data[s + 3] < 24) continue; const q = (y + dy) * F + x + dx; img[q * 3] = p.data[s]; img[q * 3 + 1] = p.data[s + 1]; img[q * 3 + 2] = p.data[s + 2]; has[q] = 1; }
      }
      const fire = (q: number) => !!has[q];
      const seen = new Uint8Array(F * F); let comps = 0;
      for (let q = 0; q < F * F; q++) if (fire(q) && !seen[q]) {
        let size = 0; const st = [q]; seen[q] = 1;
        while (st.length) { const c = st.pop()!; size++; const x = c % F, y = (c / F) | 0; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= F || yy >= F) continue; const qq = yy * F + xx; if (!seen[qq] && fire(qq)) { seen[qq] = 1; st.push(qq); } } }
        if (size >= 6) comps++;
      }
      frames++;
      if (comps > 1) { bad++; if (bad <= 5) console.log(`  два куска оружия: ${a} ${rows[r][1]} кадр ${i}`); }
    }
  });
  ok(bad === 0, `Рыцарь: один клинок в кадре (${bad} из ${frames} кадров с двумя)`);
}

// 5) lookOf не падает для обеих фракций и полов: индекс причёски по хешу имени в пределах списка (хеш беззнаковый — сдвиг >>>, а не >>)
{
  const hashSrc = hb.match(/const hash = \(s: string\) => \{[^\n]+\};/)?.[0];
  ok(!!hashSrc && /styles\[\(h >>> 3\) % styles\.length\]/.test(hb), "lookOf: причёска по хешу — беззнаковый сдвиг");
  const hash = new Function("return " + hashSrc!.replace(/^const hash = /, "").replace(/: string/g, "").replace(/;$/, ""))() as (s: string) => number;
  let bad = 0;
  for (const fac of ["solgard", "umbrath"]) for (const sex of ["m", "f"] as const) for (let k = 0; k < 4000; k++) {
    const h = hash(`${fac}-Герой${k}x${k * 7919}`), styles = man.hair[sex] as { id: string }[];
    if (!styles?.length || !styles[(h >>> 3) % styles.length]?.id) bad++;
  }
  ok(bad === 0, `lookOf: причёска найдена для любых имён обеих фракций и полов (${bad} промахов)`);
}

console.log(`heroB-weapon: ${n} ok`);
