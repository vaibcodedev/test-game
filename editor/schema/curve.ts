import { num, mult, pct } from "./fmt";

export type Pts = number[][];
/** Значение кривой на уровне L: между точками — по логарифму значения (log) или степенная (loglog, прямая в log-log), за краями — крайнее значение. */
export function evalCurve(pts: Pts, level: number, interp: "log" | "loglog" | "lin" = "log"): number {
  if (!pts?.length) return NaN;
  if (level <= pts[0][0]) return interp === "loglog" ? extend(pts, level, 0) : pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    const [l1, v1] = pts[i];
    if (level <= l1) return seg(pts[i - 1], [l1, v1], level, interp);
  }
  return interp === "loglog" ? extend(pts, level, pts.length - 2) : pts[pts.length - 1][1];
}
function seg([l0, v0]: number[], [l1, v1]: number[], L: number, interp: string): number {
  if (l1 === l0) return v1;
  if (interp === "lin") return v0 + ((v1 - v0) * (L - l0)) / (l1 - l0);
  if (interp === "loglog") return v0 * Math.pow(L / l0, Math.log(v1 / v0) / Math.log(l1 / l0));
  const t = (L - l0) / (l1 - l0);
  return Math.exp(Math.log(v0) + (Math.log(v1) - Math.log(v0)) * t);
}
function extend(pts: Pts, L: number, i: number): number {
  return seg(pts[i], pts[i + 1], Math.max(1, L), "loglog");
}
export const fmtY = (kind: "mult" | "num" | "pct") => (y: number) => (kind === "mult" ? mult(y) : kind === "pct" ? pct(y) : num(y, y < 10 ? 2 : 0));

/** «на 30 уровне ×1,5, к 100 уровню плавно снижается до ×1,1» */
export function describeCurve(pts: Pts, y: "mult" | "num" | "pct"): string {
  if (!Array.isArray(pts) || !pts.length || pts.some((p) => !Array.isArray(p) || p.length < 2)) return "Точки не заданы.";
  const f = fmtY(y);
  const show = pts.length <= 4 ? pts : [pts[0], pts[Math.floor(pts.length / 3)], pts[Math.floor((2 * pts.length) / 3)], pts[pts.length - 1]];
  const parts: string[] = [`на ${show[0][0]} уровне ${f(show[0][1])}`];
  for (let i = 1; i < show.length; i++) {
    const d = show[i][1] - show[i - 1][1];
    const word = Math.abs(d) < 1e-9 ? "держится на" : d > 0 ? "плавно растёт до" : "плавно снижается до";
    parts.push(`${i === show.length - 1 ? "к" : "к"} ${show[i][0]} уровню ${word} ${f(show[i][1])}`);
  }
  return parts.join(", ") + (pts[0][0] > 1 ? `; ниже ${pts[0][0]} уровня — как на нём` : "") + ".";
}
/** Таблица значений на опорных уровнях. */
export function sampleCurve(pts: Pts, y: "mult" | "num" | "pct", interp: "log" | "loglog" | "lin", levels = [1, 10, 30, 60, 100]): string {
  const f = fmtY(y);
  return levels.map((L) => `${L} ур. — ${f(evalCurve(pts, L, interp))}`).join(" · ");
}
