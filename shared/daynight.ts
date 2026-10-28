import { GP } from "./gameplay";
/** Простой общий цикл дня и ночи по часам: у всех клиентов совпадает. */
export const DAY_CYCLE_MS = GP.timers.dayCycleMin * 60 * 1000;

const smooth = (t: number) => { const x = Math.max(0, Math.min(1, t)); return x * x * (3 - 2 * x); };
const phase = (ms: number) => (((ms % DAY_CYCLE_MS) + DAY_CYCLE_MS) % DAY_CYCLE_MS) / DAY_CYCLE_MS;

/**
 * Степень ночи 0..1 (0 — день). Сумерки долгие и плавные (smoothstep), а не линейный обрыв:
 * 0..0.55 день, 0.55..0.78 вечер и закат (≈4,5 мин из 20), 0.78..0.88 ночь, 0.88..1 рассвет.
 */
export function nightLevel(ms: number): number {
  const p = phase(ms);
  if (p < 0.55) return 0;
  if (p < 0.78) return smooth((p - 0.55) / 0.23);
  if (p < 0.88) return 1;
  return 1 - smooth((p - 0.88) / 0.12);
}

/** Тёплый свет вечера и утра 0..1: золотой час перед закатом (пик ~0.62) и розовый рассвет (пик ~0.93). */
export function warmLevel(ms: number): number {
  const p = phase(ms);
  const bell = (c: number, w: number) => Math.max(0, 1 - Math.abs(p - c) / w);
  return smooth(Math.max(bell(0.62, 0.1), bell(0.93, 0.06) * 0.7));
}

/** Фаза суток для распорядка жителей (data/schedules.json phases: [имя, начало доли цикла] по возрастанию). */
export function dayPhase(ms: number, phases: [string, number][]): string {
  const p = (((ms % DAY_CYCLE_MS) + DAY_CYCLE_MS) % DAY_CYCLE_MS) / DAY_CYCLE_MS;
  let cur = phases[phases.length - 1][0];
  for (const [id, from] of phases) if (p >= from) cur = id;
  return cur;
}
