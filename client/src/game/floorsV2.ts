/**
 * Полы помещений (tools/gen/floors-install.ts, tools/gen/floors-maps.ts → /assets/floors-v2), по умолчанию (решение пользователя):
 *  - залы храма Аурелиона и зиккурата Мортхейма — новая картинка зала с полом;
 *  - данж «Пепельные чертоги» и зал рейда — пол одной картинкой на всю карту (без сетки тайлов) над слоями земли и под стенами,
 *    слой свечения (трещины, тлеющие пятна, свет жаровен) — сложением на полу, под юнитами и предметами;
 *    строки атласа terrain подменяются на время сцены (кромки у лавы) и возвращаются в мире.
 */
import Phaser from "phaser";
import { DEPTH } from "./terrain";

const DIR = "/assets/floors-v2";

/** Картинка зала интерьера: пол залов — новый (картинка floors-v2), остальные слои прежние. */
export const interiorUrl = (id: string, layer: string, def: string) => (layer === "base" ? `${DIR}/${id}_base.png` : def);

export function preloadFloorsV2(scene: Phaser.Scene) {
  scene.load.image("floorsV2_rows", `${DIR}/rows.png`);
  scene.load.json("floorsV2_rows", `${DIR}/rows.json`);
  for (const k of ["dungeon", "raid"]) for (const l of ["floor", "emit"]) scene.load.image(`floorsV2_${k}_${l}`, `${DIR}/${k}_${l}.png`);
}

const kindNow = () => (window as unknown as { __net?: { kind?: string } }).__net?.kind ?? "world";

/** Подмена строк атласа terrain до create сцены игры (событие start идёт раньше buildWorld); пол-картинка — на create. */
export function attachFloorsV2(game: Phaser.Game) {
  const gs = game.scene.getScene("game");
  let orig: HTMLImageElement | HTMLCanvasElement | null = null, cur: string | null = null;
  const swap = () => {
    const tm = game.textures;
    if (!tm.exists("terrain") || !tm.exists("floorsV2_rows")) return;
    const kind = kindNow();
    const want = kind === "dungeon" || kind === "raid" ? kind : null;
    if (want === cur) return;
    orig ??= tm.get("terrain").getSourceImage() as HTMLImageElement;
    let src: HTMLImageElement | HTMLCanvasElement = orig;
    if (want) {
      const rows = (game.cache.json.get("floorsV2_rows") as Record<string, [number, number][]>)[want] ?? [];
      const img = tm.get("floorsV2_rows").getSourceImage() as HTMLImageElement;
      const cv = document.createElement("canvas");
      cv.width = orig.width; cv.height = orig.height;
      const ctx = cv.getContext("2d")!;
      ctx.drawImage(orig, 0, 0);
      for (const [t, j] of rows) { ctx.clearRect(0, t * 32, 18 * 32, 32); ctx.drawImage(img, 0, j * 32, 18 * 32, 32, 0, t * 32, 18 * 32, 32); }
      src = cv;
    }
    tm.remove("terrain");
    if (src instanceof HTMLCanvasElement) tm.addCanvas("terrain", src); else tm.addImage("terrain", src);
    cur = want;
  };
  gs.events.on("start", swap);
  gs.events.on("create", () => {
    const kind = kindNow();
    if (kind !== "dungeon" && kind !== "raid") return;
    const key = `floorsV2_${kind}`;
    if (!gs.textures.exists(`${key}_floor`)) return;
    // пол — над слоями земли (DEPTH.terrain + t, t < 20), под стенами (DEPTH.walls); свечение — только на полу, под предметами и юнитами
    gs.add.image(0, 0, `${key}_floor`).setOrigin(0).setDepth(DEPTH.terrain + 40);
    gs.add.image(0, 0, `${key}_emit`).setOrigin(0).setDepth(DEPTH.ground - 3).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.8);
  });
}
