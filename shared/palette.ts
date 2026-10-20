// Единый источник цветов для TS, canvas и Phaser.
// Значения должны совпадать с CSS-токенами :root.
export const P = {
  // Интерфейс
  bg:      "#120f16",
  panel:   "rgba(24,19,28,.97)",
  line:    "#4d3f4a",
  lineHi:  "#8a6a4a",
  fg:      "#efe6d2",
  dim:     "#bdb09c",
  gold:    "#d6a84b",   // акцент Сольгарда
  numGold: "#ffd84a",   // золотые цифры (крит, щит, уровень)
  well:    "#0e0b10",   // «колодец»: фон ячеек, полей, полос, миникарты
  card:    "#1a141e",   // карточка внутри окна
  hp:      "#d0443c",
  mp:      "#3f7ad8",
  xp:      "#b08aff",
  ok:      "#7ad05a",
  bad:     "#ff6a5a",
  badLine: "#8a2a2a",
  common:  "#e8e2d0",
  rare:    "#5fa8ff",
  epic:    "#c47bff",
  legend:  "#ff9a2e",
  enchant: "#3ff0d0",
  // Смысловые игровые
  foe:     "#ff3030",   // враг (ник, полоска)
  ally:    "#9ae07a",   // союзник на арене, кольцо цели
  self:    "#5ad04a",   // полоска своего героя
  heal:    "#7aff7a",   // цифры лечения
  boss:    "#ff6a2a",   // имя/реплики босса в HUD/чате
} as const;
