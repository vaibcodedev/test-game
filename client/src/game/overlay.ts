/** Подписи над юнитами: ники и полоски здоровья — отдельно для своего героя и для остальных. Хранится в localStorage. */
import { GEAR_FX } from "../../../shared/gearFx";
export type OverlayKey = "selfNames" | "selfBars" | "names" | "bars" | "autoNames" | "crowdNums";
const STORE: Record<OverlayKey, string> = { selfNames: "showSelfNames", selfBars: "showSelfBars", names: "showNames", bars: "showBars", autoNames: "autoNames", crowdNums: "crowdNums" };
function load(key: string): boolean {
  try { return localStorage.getItem(key) !== "0"; } catch { return true; }
}
export const overlay: Record<OverlayKey, boolean> = {
  selfNames: load(STORE.selfNames), selfBars: load(STORE.selfBars), names: load(STORE.names), bars: load(STORE.bars), autoNames: load(STORE.autoNames), crowdNums: load(STORE.crowdNums),
};
export function setOverlay(key: OverlayKey, on: boolean) {
  overlay[key] = on;
  try { localStorage.setItem(STORE[key], on ? "1" : "0"); } catch {}
}

/**
 * Эффекты снаряжения других игроков (docs/gear-visuals.md, 2.4; ключ и режимы — data/gear-fx.json, setting):
 * all — все, legend — только темы легендарок без бирюзы, off — только статичные цвета. На своём герое эффекты видны всегда.
 * GearLayers читает gearFxMode() при отрисовке чужого героя; onGearFxMode сообщает о смене, чтобы перерисовать видимых героев.
 */
export type GearFxMode = "all" | "legend" | "off";
const GEAR_MODES = GEAR_FX.setting.modes.map((m) => m.id) as GearFxMode[];
function loadGearMode(): GearFxMode {
  try {
    const v = localStorage.getItem(GEAR_FX.setting.key) as GearFxMode | null;
    if (v && GEAR_MODES.includes(v)) return v;
  } catch {}
  return GEAR_FX.setting.default as GearFxMode;
}
let gearMode: GearFxMode = loadGearMode();
const gearListeners = new Set<(m: GearFxMode) => void>();
export const gearFxMode = (): GearFxMode => gearMode;
export function setGearFxMode(m: GearFxMode) {
  if (!GEAR_MODES.includes(m) || m === gearMode) return;
  gearMode = m;
  try { localStorage.setItem(GEAR_FX.setting.key, m); } catch {}
  for (const fn of gearListeners) fn(m);
}
export function onGearFxMode(fn: (m: GearFxMode) => void): () => void {
  gearListeners.add(fn);
  return () => void gearListeners.delete(fn);
}
