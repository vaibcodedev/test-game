const fs = require("fs");
const f = "tools/gen/bosses139/to-game.ts";
let s = fs.readFileSync(f, "utf8");
const nl = s.includes("\r\n") ? "\r\n" : "\n";
const J = (t) => t.split("\n").join(nl);
const rep = (a, b) => { if (!s.includes(a)) throw new Error("MISS " + a.slice(0, 50)); s = s.replace(a, b); };
rep('|sol_fallen_chaplain|plg_drowned_bellringer]', '|sol_fallen_chaplain|plg_drowned_bellringer|umb_frost_lord]');
rep('import * as bel from "./plg_drowned_bellringer";', 'import * as bel from "./plg_drowned_bellringer";\nimport * as frost from "./bone_frost_lord";'.split("\n").join(nl));
const anchor = J("\nconst only = process.argv[2];");
if (!s.includes(anchor)) throw new Error("anchor");
const block = J(`
const frostFx = Object.fromEntries((["ring", "spear", "circle"] as const).map((k) => [k, { src: \`frost-fx-\${k}.png\`, def: fxDef(frost.ID, k, frost.FX[k] as FxIn) }]));
// круг сборки держится по кругу, пока идёт замах
frostFx.circle.def.anims.circle.loop = true;
BOSSES.push({
  id: frost.ID, sheet: "frost-sheet.png", frame: frost.FRAME, frameH: frost.FRAME_H, cols: frost.FROST_COLS, wrap: 64,
  // phase (переход фазы 50 %) — сборка: кадры листа общие; стоит раньше summon: тест кадра по столбцу берёт первое совпадение
  anims: { ...anims({ idle: frost.FROST_ANIMS.idle, walk: frost.FROST_ANIMS.walk }), phase: { col: frost.FROST_ANIMS.summon.col, n: 8, fps: 12, loop: false, hit: 2 }, ...anims(Object.fromEntries(Object.entries(frost.FROST_ANIMS).filter(([k]) => k !== "idle" && k !== "walk"))) },
  fx: frostFx,
  skills: {
    // топот: нога и посох оземь, от стопы расходится кольцо льда
    stomp: { waves: [{ pre: ["stompWind", "stompHold"], strike: "stomp" }], fx: [{ fx: "ring", waves: [0], seq: ["ring"], pin: 0, timing: "strike", place: "marks" }] },
    // ледяные копья: три волны-ряда подряд (замах один, дальше — удержание и бросок), копьё встаёт в каждом круге
    ice_spears: { waves: [{ pre: ["spearWind", "spearHold"], strike: "spearCast" }, { pre: ["spearHold"], strike: "spearCast" }, { pre: ["spearHold"], strike: "spearCast" }], fx: [{ fx: "spear", waves: [0, 1, 2], seq: ["spear"], pin: 0, timing: "strike", place: "marks" }] },
    // сборка: руки к небу, у ног ледяной круг; носильщики — моб-спутник \`<босс>_bearer\`
    assemble: { waves: [{ pre: ["summonWind", "summonHold"], strike: "summon" }], fx: [{ fx: "circle", waves: [0], seq: ["circle"], pin: 0, timing: "wind", place: "self", holds: { circle: 1400 } }] },
  },
  units: [{ src: "frost-bearer.png", id: \`\${frost.ID}_bearer\`, frame: frost.BEARER_UNIT.frame, frameH: frost.BEARER_UNIT.frameH }],
});
`);
s = s.replace(anchor, block + anchor);
fs.writeFileSync(f, s);
console.log("ok");
