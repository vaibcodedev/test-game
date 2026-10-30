/**
 * Проверка шага основы «Б»: где ступня стоит на земле и не скользит ли она.
 * contacts — опорные точки ступней на кадре (координаты листа: кадр рендера, ступни в (24+OX, 45+OY), «влево» — отражено);
 * slideCheck — скольжение опорной ступни между соседними кадрами одного контакта (вбок/влево: сдвиг ≠ шагу кадра больше 1 px — ошибка;
 * вниз/вверх: в проекции 3/4 шаг вглубь сжат в KZ раз, поэтому проверяется только направление — ступня не едет вперёд).
 */
import { FY, NF, frameOf, gaitSpeed, isLagPart, pose, proj, renderLayers, solve, DATA, type AnimId, type Look, type V3 } from "./base_b";
import { baseView, viewLook, type View4 } from "../gear147/gear";

/** Сдвиг земли за кадр, px: скорость / к/с (только для ходьбы и бега). */
export const frameStep = (a: AnimId): number => (a === "walk" || a === "run" ? gaitSpeed(a) / DATA.anims[a].fps : 0);

export type Contact = { s: "L" | "R"; x: number; y: number; piv: 0 | 1; pts: [number, number][] };
/** Опора ступни на кадре: pts — пятка и носок в координатах листа, piv — какая из них стоит на земле (x, y — она). */
export function contacts(l0: Look, v: View4, a: AnimId, i: number): (Contact | null)[] {
  const l = viewLook(l0, v), bv = baseView(v), P = pose(l, a, i, bv), sk = solve(l, P), { FRx, OX, OY } = frameOf(l);
  const out: (Contact | null)[] = [];
  const scr = (q: V3): [number, number] => { const p = proj(sk.T(q), bv); return [v === "left" ? FRx - (p[0] + OX) : p[0] + OX, p[1] + OY]; };
  for (const s of ["L", "R"] as const) {
    const ft = s === "L" ? sk.footL : sk.footR, g: V3 | undefined = P.plant?.[s];
    let piv: 0 | 1 | -1 = -1;
    if (P.plant) { if (g) piv = Math.hypot(ft[0][1] - g[1], ft[0][2] - g[2]) <= Math.hypot(ft[1][1] - g[1], ft[1][2] - g[2]) ? 0 : 1; }
    else { const lo = ft[0][1] > ft[1][1] ? 0 : 1; if (ft[lo][1] >= FY - 0.75) piv = lo; } // старые позы: на земле, если нижняя точка у земли
    if (piv < 0) { out.push(null); continue; }
    const pts = [scr(ft[0]), scr(ft[1])];
    out.push({ s, x: pts[piv][0], y: pts[piv][1], piv: piv as 0 | 1, pts });
  }
  return out;
}

/** Ошибки скольжения цикла: «анимация/вид/кадр/ступня: сдвиг». */
export function slideCheck(l: Look, a: AnimId, views: View4[] = ["side", "left", "down", "up"]): string[] {
  const st = frameStep(a), n = NF(a), errs: string[] = [];
  for (const v of views) {
    const cs = Array.from({ length: n }, (_, i) => contacts(l, v, a, i));
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      if (!DATA.anims[a].loop && j === 0) continue;
      for (const s of ["L", "R"] as const) {
        const p0 = cs[i].find((c) => c?.s === s), q = cs[j].find((c) => c?.s === s);
        if (!p0 || !q) continue;
        const p = { x: p0.pts[q.piv][0], y: p0.pts[q.piv][1] }; // та же точка стопы, что опорная в следующем кадре
        if (v === "side" || v === "left") {
          const err = q.x - p.x + (v === "side" ? st : -st);
          if (Math.abs(err) > 1 + 1e-6 || Math.abs(Math.round(q.y) - Math.round(p.y)) > 1) errs.push(`${a}/${v}/${i}→${j}/${s}: ${err.toFixed(1)} px`);
        } else {
          const back = v === "down" ? -1 : 1; // вниз: герой идёт к зрителю, опорная ступня уходит вверх по экрану
          if (st > 0 && (q.y - p.y) * back < -0.75) errs.push(`${a}/${v}/${i}→${j}/${s}: едет вперёд ${(q.y - p.y).toFixed(1)} px`);
        }
      }
    }
  }
  return errs;
}

/**
 * Плавность подвижных частей на корпусе (наплечники, табард, сумки — из isLagPart): их пиксели относительно груди
 * не прыгают больше чем на 1 px между соседними кадрами цикла (центр масс по y и x). Ошибки: «анимация/вид/кадр: сдвиг».
 */
export function lagCheck(l0: Look, a: AnimId, views: View4[] = ["down", "up", "side", "left"]): string[] {
  const n = NF(a), errs: string[] = [];
  for (const v of views) {
    const l = viewLook(l0, v), bv = baseView(v), { OX, OY } = frameOf(l);
    const c = Array.from({ length: n }, (_, i) => {
      // части, висящие на корпусе (юбка и тассеты идут за бёдрами — их ход задаёт нога, а не запаздывание)
      const [f] = renderLayers(l, bv, a, i, [(p) => isLagPart(p) && !/^(a_tas|c_skirt|c_skw|c_skst|c_tail)/.test(p.g)]);
      let sx = 0, sy = 0, k = 0;
      for (let y = 0; y < f.img.h; y++) for (let x = 0; x < f.img.w; x++) if (f.img.has(x, y)) { sx += x; sy += y; k++; }
      if (!k) return null;
      const ch = proj(f.sk.T(f.sk.chest), bv);
      return [sx / k - (ch[0] + OX), sy / k - (ch[1] + OY)];
    });
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n; if (!DATA.anims[a].loop && j === 0) continue;
      const p = c[i], q = c[j]; if (!p || !q) continue;
      const d = Math.max(Math.abs(Math.round(q[0]) - Math.round(p[0])), Math.abs(Math.round(q[1]) - Math.round(p[1]))); // в пикселях кадра
      if (d > 1) errs.push(`${a}/${v}/${i}→${j}: ${d.toFixed(2)} px`);
    }
  }
  return errs;
}
