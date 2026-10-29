/**
 * Варианты формы объёмных камней, льдин и снегов (tools/gen/nature3d.ts): у вида kind есть кадры kind (вариант 0) и kind__1…kind__{n-1}.
 * Вариант выбирается хешем клетки в конце генерации карты (shared/cityart.ts assignArtVariants), соседние камни — разной формы.
 * Клиент берёт кадр `${kind}__${v}`, если он есть (client/src/game/terrain.ts makeImage). След на карте (OBJECT_FOOTPRINT) не меняется.
 */
export const NATURE_VARIANTS: Record<string, number> = {
  rock: 4, big_rock: 3, rock_moss: 4, sandstone: 4, basalt: 4, snow_rock: 4, ice_spike: 4, snow_bush: 4, snowdrift: 4,
  v_volcano_rock_a: 2, v_volcano_rock_b: 2, v_volcano_rock_c: 2, v_volcano_boulder: 2, v_volcano_rock_pile: 1,
};

/** Вариант для клетки (cx, cy): 0 — базовый кадр; хеш клетки со сдвигом по столбцу, чтобы соседние камни обычно были разной формы. */
export function natureVariant(kind: string, cx: number, cy: number): number {
  const n = NATURE_VARIANTS[kind] ?? 1;
  if (n <= 1) return 0;
  let h = Math.imul(cx | 0, 374761393) ^ Math.imul(cy | 0, 668265263) ^ 0x5bd1e995;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  const r = ((h ^ (h >>> 16)) >>> 0) % n;
  return (r + cx * 2 + cy) % n;
}
