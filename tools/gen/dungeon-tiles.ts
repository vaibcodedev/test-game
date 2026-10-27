/** Быстрая пересборка только атласа тайлов (для проверки пола и стен данжа без полного npm run assets). */
import path from "node:path";
import { buildTileset } from "./tiles";
buildTileset().save(path.resolve("client/public/assets/tiles/terrain.png"));
console.log("terrain.png saved");
