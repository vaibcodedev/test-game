/** Подписи над юнитами: ники и полоски здоровья — отдельно для своего героя и для остальных. Хранится в localStorage. */
import { GEAR_FX } from "../../../shared/gearFx";
export type OverlayKey = "selfNames" | "selfBars" | "names" | "bars" | "autoNames" | "crowdNums" | "camLead" | "bossIntro";
const STORE: Record<OverlayKey, string> = { selfNames: "showSelfNames", selfBars: "showSelfBars", names: "showNames", bars: "showBars", autoNames: "autoNames", crowdNums: "crowdNums", camLead: "camLead", bossIntro: "bossIntro" };
function load(key: string): boolean {
  try { return localStorage.getItem(key) !== "0"; } catch { return true; }
}
function loadOff(key: string): boolean {
  try { return localStorage.getItem(key) === "1"; } catch { return false; }
}
export const overlay: Record<OverlayKey, boolean> = {
  selfNames: load(STORE.selfNames), selfBars: load(STORE.selfBars), names: load(STORE.names), bars: load(STORE.bars), autoNames: loadOff(STORE.autoNames), crowdNums: load(STORE.crowdNums), camLead: load(STORE.camLead), bossIntro: load(STORE.bossIntro),
};
export function setOverlay(key: OverlayKey, on: boolean) {
  overlay[key] = on;
  try { localStorage.setItem(STORE[key], on ? "1" : "0"); } catch {}
}

/**
 * Эффекты снаряжения других игроков (docs/art/gear.md, 2.4; ключ и режимы — data/gear-fx.json, setting):
 * all — все, legend — только темы легендарок без бирюзы, off — только статичные цвета. На своём герое эффекты видны всегда.
 * GearLayers читает gearFxMode() при отрисовке чужого героя.
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
export const gearFxMode = (): GearFxMode => gearMode;
export function setGearFxMode(m: GearFxMode) {
  if (!GEAR_MODES.includes(m) || m === gearMode) return;
  gearMode = m;
  try { localStorage.setItem(GEAR_FX.setting.key, m); } catch {}
}

/** Свечение заточки героя Б (data/gear-fx.json → enchantB.setting): all — у всех, self — только своё, off — выкл. */
export type EnchantFxMode = "all" | "self" | "off";
const ENCH_SET = GEAR_FX.enchantB.setting, ENCH_MODES = ENCH_SET.modes.map((m) => m.id) as EnchantFxMode[];
let enchMode: EnchantFxMode = (() => { try { const v = localStorage.getItem(ENCH_SET.key) as EnchantFxMode | null; if (v && ENCH_MODES.includes(v)) return v; } catch {} return ENCH_SET.default as EnchantFxMode; })();
export const enchantFxMode = (): EnchantFxMode => enchMode;
export function setEnchantFxMode(m: EnchantFxMode) {
  if (!ENCH_MODES.includes(m) || m === enchMode) return;
  enchMode = m;
  try { localStorage.setItem(ENCH_SET.key, m); } catch {}
}
