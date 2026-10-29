/** Правила контроля из data/cc.json (задача 148): потолки, DR, цепочка, страх, боссы, поля умений. Механика — server/src/game/effects.ts applyCc. */
import data from "../data/cc.json";

export type CcKind = "stun" | "root" | "slow" | "silence" | "fear";
export const CC_KINDS: readonly CcKind[] = ["stun", "root", "slow", "silence", "fear"];

/** Поля контроля умения (data/cc.json skills.<id>). */
export interface SkillCc {
  usableInStun?: boolean;
  usableInSilence?: boolean;
  breaksRoot?: boolean;
  /** Снять с себя эти виды контроля при применении. */
  cleanse?: CcKind[];
  /** Иммунитет к видам kinds на ms (без ms — на срок умения v.dur). */
  immune?: { kinds: CcKind[]; ms?: number };
}

export interface CcRules {
  maxMs: Record<CcKind, number>;
  maxSlowPct: number;
  dr: number[];
  drMs: number;
  slowDr: number[];
  drCat: Record<CcKind, string>;
  chain: { kinds: CcKind[]; capMs: number; windowMs: number; immuneMs: number };
  fear: { speedMul: number; breakHp: number; dotWeight: number; selfDotGraceMs: number; wobble: number; wobbleMs: number };
  boss: { stun: "slow" | "immune" | "full"; root: "slow" | "immune" | "full"; fear: "slow" | "immune" | "full"; silence: "interrupt" | "immune" | "full"; slowMult: number; convSlow: number };
  eliteMult: number;
  silenceLockMs: number;
  mobMaxMs: number;
  skills: Record<string, SkillCc>;
}
export const CC = data as unknown as CcRules;

/** Поля контроля умения (пусто — обычное умение). */
export const ccOf = (id: string): SkillCc => CC.skills[id] ?? {};

/** Действующий процент замедления (потолок maxSlowPct). Общий для сервера и клиентского предсказания шага. */
export const slowPctCap = (pct: number) => Math.max(0, Math.min(pct, CC.maxSlowPct));
/** Множитель скорости при замедлении pct% — та же формула на сервере (World.playerSpeed/mobSpeed) и в клиенте (GameScene). */
export const slowMul = (pct: number) => 1 - slowPctCap(pct) / 100;
