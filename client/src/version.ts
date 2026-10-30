/** Версия игры (data/version.json): метка в углу экранов входа и выбора героя, строка в меню Esc. */
import { GAME_VERSION } from "../../shared/version";

export { GAME_VERSION };

let el: HTMLElement | null = null;
/** Метка в углу; видна, пока игрок не в мире (вход, выбор героя). */
export function versionBadge(show: boolean) {
  if (!el) { el = document.createElement("div"); el.id = "game-ver"; el.textContent = GAME_VERSION; document.body.append(el); }
  el.hidden = !show;
}
