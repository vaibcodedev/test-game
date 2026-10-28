/**
 * Расписание погоды: чистая функция от часов (как shared/daynight.ts), поэтому у всех игроков и на сервере одинаково без обмена сообщениями.
 * Слот 5 минут: дождь в ~38% слотов, гроза в 40% дождливых. Смена слота плавная (30 с).
 */
export const WEATHER_SLOT_MS = 5 * 60 * 1000;
const RAMP_MS = 30000;
const THUNDER_STEP = 25000;

function hash(n: number): number {
  let x = Math.imul(n | 0, 0x9e3779b1) ^ 0x5bd1e995;
  x = Math.imul(x ^ (x >>> 15), 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}
const slotRain = (i: number) => (hash(i * 31 + 7) < 0.38 ? 0.55 + 0.45 * hash(i * 17 + 3) : 0);
const slotStorm = (i: number) => slotRain(i) > 0 && hash(i * 13 + 977) < 0.4;

export interface WeatherState { rain: number; storm: boolean }

export function weatherAt(ms: number): WeatherState {
  const i = Math.floor(ms / WEATHER_SLOT_MS), f = ms - i * WEATHER_SLOT_MS;
  const k = Math.min(1, f / RAMP_MS), a = slotRain(i), b = slotRain(i - 1);
  const e = k * k * (3 - 2 * k);
  return { rain: b + (a - b) * e, storm: slotStorm(i) };
}

/** Удар грома между prev и now (мс часов): в грозовых слотах, шаги по 25 с, ~65% шагов. Возвращает момент удара или null. */
export function thunderBetween(prev: number, now: number): number | null {
  for (let s = Math.floor(prev / THUNDER_STEP); s <= Math.floor(now / THUNDER_STEP); s++) {
    const t = s * THUNDER_STEP + hash(s * 7 + 3) * THUNDER_STEP;
    if (t > prev && t <= now && hash(s * 13 + 5) < 0.65 && slotStorm(Math.floor(t / WEATHER_SLOT_MS)) && weatherAt(t).rain > 0.5) return t;
  }
  return null;
}
