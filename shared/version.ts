/** Версия игры (data/version.json): одна строка для клиента (метка, опция входа) и сервера (сверка в onAuth). */
import V from "../data/version.json";

export const GAME_VERSION = `${V.stage} ${V.version}`;
