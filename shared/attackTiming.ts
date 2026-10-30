/**
 * Ритм удара ближнего боя, общий для сервера и клиента (data/hero-b-live.json → attackTiming, кадры — data/hero-base-b.json anims).
 * Удар начинается с aseq; урон (и всплывающая цифра) — в кадр контакта клинка anims[atk].hit. Анимация не длиннее fit × перезарядки:
 * быстрее — ускоряется (scale > 1), и задержка урона сокращается в том же отношении (не обрывается на середине).
 */
import base from "../data/hero-base-b.json";
import live from "../data/hero-b-live.json";

type A = { frames: number; fps: number; hit?: number };
const ANIMS = (base as unknown as { anims: Record<string, A> }).anims;
const LIVE = live as unknown as { attackTiming: { fit: number; fallbackMs: number }; weaponClass: Record<string, { cls: string; atk: string }> };

/** Анимация удара по строке оружия юнита (u.weapon: «база:…»). */
export function attackAnimOf(weapon: string): string {
  const b = (weapon || "").split(":")[0];
  return (LIVE.weaponClass[b] ?? LIVE.weaponClass[""]).atk;
}

/**
 * Ритм удара: atk — анимация, fullMs — её длина при 1×, hitMs — задержка урона от начала удара, scale — ускорение анимации (timeScale ≥ 1).
 * cdMs — перезарядка удара с ускорением (на клиенте — замеренный промежуток между ударами; 0 — неизвестна).
 */
export function meleeTiming(weapon: string, cdMs: number, atk = attackAnimOf(weapon)): { atk: string; fullMs: number; hitMs: number; scale: number } {
  const a = ANIMS[atk];
  if (!a || a.hit === undefined) return { atk, fullMs: 0, hitMs: LIVE.attackTiming.fallbackMs, scale: 1 };
  const fullMs = (a.frames / a.fps) * 1000;
  const scale = cdMs > 0 ? Math.max(1, fullMs / (cdMs * LIVE.attackTiming.fit)) : 1;
  return { atk, fullMs, hitMs: ((a.hit / a.fps) * 1000) / scale, scale };
}
