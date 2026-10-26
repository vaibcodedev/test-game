/** Задача 142: иконки маунтов и печатей по фракции зрителя — у гербовых маунтов (data/mount-art.json factionArt) у Умбрата свой вариант. */
import art from "../data/mount-art.json";

export const FACTION_ART = new Set<string>(art.factionArt);
let viewer: () => string = () => "";
/** Клиент задаёт фракцию своего героя (main.ts): по ней выбираются иконки в хотбаре, конюшне, сумке и подсказках. */
export const setArtViewer = (fn: () => string) => { viewer = fn; };
/** Иконка маунта id для текущего зрителя. */
export const mountIconFor = (id: string) => `mount_${id}${FACTION_ART.has(id) && viewer() === "umbrath" ? "_umbrath" : ""}`;
/** Иконка печати (mseal_<id>) для текущего зрителя; прочие иконки — как есть. */
export const sealIconFor = (icon: string) => (icon.startsWith("mseal_") && FACTION_ART.has(icon.slice(6)) && viewer() === "umbrath" ? `${icon}_umbrath` : icon);
/** Фракция текущего зрителя ("" на сервере). */
export const artViewer = () => viewer();
type Named = { name: string; desc: string; names?: Record<string, { name?: string; desc?: string }> };
/** Имя и описание маунта для фракции (data/mounts.json names.solgard / names.umbrath); без пары — общие. */
export const nameFor = (m: Named, faction = viewer()) => m.names?.[faction]?.name ?? m.name;
export const descFor = (m: Named, faction = viewer()) => m.names?.[faction]?.desc ?? m.desc;
