import { GP } from "./gameplay";
/** Простой общий цикл дня и ночи по часам: у всех клиентов совпадает. */
export const DAY_CYCLE_MS = GP.timers.dayCycleMin * 60 * 1000;

/** Степень ночи 0..1 (0 — день; плавные сумерки). Ночь занимает последнюю часть цикла. */
export function nightLevel(ms: number): number {
  const p = (((ms % DAY_CYCLE_MS) + DAY_CYCLE_MS) % DAY_CYCLE_MS) / DAY_CYCLE_MS;
  // 0..0.62 день, 0.62..0.72 закат, 0.72..0.92 ночь, 0.92..1 рассвет
  if (p < 0.62) return 0;
  if (p < 0.72) return (p - 0.62) / 0.1;
  if (p < 0.92) return 1;
  return 1 - (p - 0.92) / 0.08;
}

/** Фаза суток для распорядка жителей (data/schedules.json phases: [имя, начало доли цикла] по возрастанию). */
export function dayPhase(ms: number, phases: [string, number][]): string {
  const p = (((ms % DAY_CYCLE_MS) + DAY_CYCLE_MS) % DAY_CYCLE_MS) / DAY_CYCLE_MS;
  let cur = phases[phases.length - 1][0];
  for (const [id, from] of phases) if (p >= from) cur = id;
  return cur;
}
