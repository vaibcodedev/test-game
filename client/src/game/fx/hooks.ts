/** Точки подписки для вау-эффектов: UnitView сообщает о смерти юнита (души летят к герою), не зная об эффектах. */
export const wowHooks: { death?: (v: { id: string; x: number; y: number; u: { kind: number; elite: number; sprite: string } }) => void } = {};
