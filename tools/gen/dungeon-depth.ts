import { DUNGEON_ROOMS, dungeonDepthK, dungeonStyle } from "../../shared/map";
DUNGEON_ROOMS.forEach(([x0, y0, x1, y1], i) => { const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2; console.log(i, [x0, y0, x1, y1].join(","), "k=" + dungeonDepthK(cx, cy).toFixed(2), "style=" + dungeonStyle(cx, cy)); });
