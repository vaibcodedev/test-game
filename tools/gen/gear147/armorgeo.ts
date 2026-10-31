/**
 * Описание формы доспеха — общее для иконки (icons.ts) и героя (gear.ts → armor): из чего тело (body), длина подола (len), наплечные части (shoulders), ворот (collar).
 * body: plate — кираса; mail — кольчуга; quilt — стёганка; brig — бригантина (сукно на заклёпках); lamellar — ламеллярная (горизонтальные пластины); scale — чешуя.
 * len: 0 — до пояса; 1 — фолды и тассеты; 2 — юбка до середины бедра; 3 — до колен. shoulders: 0 нет, 1 — малые наплечья, 2 — крупные. collar: 0 вырез, 1 горжет, 2 высокий ворот.
 * Старые поля (cut: plain | brig, pauldronsOnIcon) приводятся сюда; новые вещи задают форму явно (новая вещь — новое описание).
 */
export interface ArmorShape { body: "plate" | "mail" | "quilt" | "brig" | "lamellar" | "scale"; len: 0 | 1 | 2 | 3; shoulders: 0 | 1 | 2; collar: 0 | 1 | 2; waist: number; wide: number }
export function armorShape(it: any): ArmorShape {
  return {
    body: it.body ?? (it.cut === "brig" ? "brig" : "plate"),
    len: it.len ?? (it.cut === "plain" ? 0 : it.cut === "brig" ? 2 : 1),
    shoulders: it.shoulders ?? (it.pauldronsOnIcon ? 2 : 0),
    collar: it.collar ?? 1,
    waist: it.waist ?? 1,
    wide: it.wide ?? 1,
  };
}
/** материал тела доспеха по виду */
export const bodyMat = (it: any, s: ArmorShape): string => (s.body === "mail" ? it.mail ?? "mail" : s.body === "quilt" || s.body === "brig" ? it.cloth : it.plate);
/** форма наплечника (общая для иконки и героя): старые поля form small/lames и size приводятся к новым названиям */
export function pdForm(it: any): string { return it.form === "small" ? "cop" : it.form === "lames" ? "lamellar" : it.form ?? "spaulder"; }
