/**
 * Задача 140, партия 2: помощники для зверей на 4–8 лапах поверх общего rig.ts (rig.ts не меняется по поведению).
 * Тело зверя строится в той же Ctx, что и гуманоид: хребет вдоль +Y (вперёд), лапы ставятся от поз ступней rig
 * (fR/fL — ходьба, прыжок): задняя правая и передняя левая идут с fR, задняя левая и передняя правая — с fL (рысь).
 * Руки и ноги гуманоида rig считает, но зверь их не рисует; c.hand используется только как «ход» клешней/головы в атаке.
 */
import { add, ik, lerpV, mul, norm, restPose, sub, type Ctx, type Mat, type TexFn, type V3 } from "./rig";

export interface Legs { top: V3; knee: V3; paw: V3 }
/** Смещение стопы позы от покоя (вперёд, вверх). */
export function footDelta(c: Ctx, i: 0 | 1): V3 {
  const f = i ? c.p.fL : c.p.fR;
  const r: V3 = i ? [-c.d.footX, -0.2, 1.0] : [c.d.footX, 0.2, 1.0];
  return sub(f, r);
}
/**
 * Пары лап: pairs — [x, y, верх z, длины [бедро, голень], полюс сустава]; лапы чередуются по фазам fR/fL
 * (k-я пара: нечётные — в противофазе). pz — высота ступни.
 */
export function legsOf(c: Ctx, pairs: { x: number; y: number; z: number; len: [number, number]; pole: V3; spread?: number; py?: number }[], pz = 0.6): Legs[][] {
  const dR = footDelta(c, 0), dL = footDelta(c, 1);
  return pairs.map((pr, k) => [1, -1].map((s) => {
    const right = s > 0;
    const d = (k % 2 === 0) === right ? dR : dL;
    const top = c.up([pr.x * s, pr.y, pr.z]);
    const paw: V3 = [(pr.x + (pr.spread ?? 0)) * s, (pr.py ?? pr.y) + d[1], pz + d[2]];
    const pole: V3 = [pr.pole[0] * s, pr.pole[1], pr.pole[2]];
    const knee = ik(top, paw, pr.len[0], pr.len[1], pole);
    return { top, knee, paw };
  }));
}
/** Лапа: бедро, голень, стопа с когтями. */
export function drawLeg4(c: Ctx, L: Legs, m: Mat, r: [number, number, number], o: { tex?: TexFn; paw?: Mat; pawR?: number; claws?: Mat; clawN?: number; fwd?: V3 } = {}) {
  const S = c.S;
  const g = S.group(0.45);
  const p1 = S.newPart();
  S.cone(g, m, L.top, r[0], L.knee, r[1], { part: p1, tex: o.tex });
  const g2 = S.group(0.4);
  const p2 = S.newPart();
  S.cone(g2, m, L.knee, r[1], L.paw, r[2], { part: p2, tex: o.tex });
  const fwd = o.fwd ?? c.rotU([0, 1, 0]);
  if (o.pawR) S.ell(g2, o.paw ?? m, add(L.paw, mul(fwd, 0.4)), [o.pawR, o.pawR * 1.25, o.pawR * 0.7], undefined, { part: p2 });
  if (o.claws) {
    const n = o.clawN ?? 3;
    for (let k = 0; k < n; k++) {
      const sx = (k - (n - 1) / 2) * 0.55;
      const a = add(L.paw, add(mul(fwd, (o.pawR ?? r[2]) * 1.0), [sx, 0, -0.1]));
      S.cone(S.group(0), o.claws, a, 0.28, add(a, add(mul(fwd, 0.8), [sx * 0.3, 0, -0.3])), 0.12, { part: S.newPart() });
    }
  }
}
/** Членистая лапа (паук, краб): три звена, коленом вверх. */
export function drawJointed(c: Ctx, top: V3, paw: V3, m: Mat, r: number, lift: number, tex?: TexFn) {
  const S = c.S;
  const mid = lerpV(top, paw, 0.42);
  const knee: V3 = add(mid, [0, 0, lift]);
  const ank = lerpV(knee, paw, 0.55);
  const g = S.group(0.3);
  const p = S.newPart();
  S.cone(g, m, top, r, knee, r * 0.9, { part: p, tex });
  S.cone(g, m, knee, r * 0.9, ank, r * 0.7, { part: p, tex });
  S.cone(g, m, ank, r * 0.7, paw, r * 0.4, { part: p, tex });
  return knee;
}
/** Ход атаки: насколько кисти позы ушли от покоя (усреднение по двум рукам), в осях мира. */
export function attackReach(c: Ctx, cr: Parameters<typeof restPose>[0]): V3 {
  const R0 = restPose(cr, c.role);
  const d0 = sub(c.p.hR, R0.hR), d1 = sub(c.p.hL, R0.hL);
  return mul(add(d0, d1), 0.5);
}
export const unit = norm;
