const fs = require("fs");
const ID = "umb_frost_lord";
const rd = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
const wr = (f, o) => {
  const raw = fs.readFileSync(f, "utf8");
  const nl = raw.includes("\r\n") ? "\r\n" : "\n";
  let t = JSON.stringify(o, null, 2);
  if (nl === "\r\n") t = t.replace(/\n/g, "\r\n");
  fs.writeFileSync(f, t + (raw.endsWith("\n") ? nl : ""));
};
// --- карточка
const rb = rd("data/ring-bosses.json");
if (rb.bosses.some((b) => b.id === ID)) throw new Error("already");
const row = (fwd, lats) => lats.map((l) => [fwd, l]);
const card = {
  id: ID, faction: "umbrath", location: "Костяной хребет", slot: "r65n", levels: { band: [60, 70], boss: 65 }, group: [4, 5],
  name: "Кальдрам Ледяной Владыка", title: "Владыка Костяного хребта", respawnMs: 3600000, frame: 80,
  mob: { hp: 70, dmg: 3.2, armor: 1.7, xp: 40, gold: 1, speed: 56, aggro: 280, range: 70, attackCd: 2.3, radius: 28, color: "#4aa8d8" },
  visual: {
    ref: "08",
    take: "высокий синекожий владыка в чёрной короне с высоким центральным пиком и ледяными шипами, серебряные волосы ниже шлема по обе стороны груди, меховой воротник и угольные наплечники в сосульках и белом инее, длинный тёмный сюртук с тонкой бирюзовой каймой и ледяным подолом, в отставленной руке посох с ледяной звездой, другая ладонь раскрыта; за спиной огромный тёмный плащ-шлейф с ледяной бахромой, тянется по земле назад и в сторону",
    simplify: "кадр 80×80, тело в двойном разрешении, свёрнутое в 1×; лицо и глаза — 2D-штампы; тело сдвинуто в кадре под шлейф (вниз и вверх — в сторону от шлейфа, вбок — вправо); контровой холодный свет по краю",
    palette: "угольная сталь и мех, тёмно-синий сюртук, бирюза только каймой, льдом и светом, голубая кожа, серебро волос",
  },
  lore: "Кальдрам правил хребтом, пока его двор не вмёрз в лёд вместе с троном. Столетиями он тянул холод из костей павших и сам стал холодом: корона срослась с шлемом, сердце превратилось в осколок. Когда лёд трескается, из толщи вылезают стражи с щитами и несут владыке куски его же трона. Пока они идут, он почти неуязвим. Говорят, он собирает себя заново и когда-нибудь соберёт целиком.",
  gimmick: "Топот бьёт кольцом: безопасно вплотную и далеко. Ледяные копья вырастают тремя рядами кругов веером от владыки к героям. С половины здоровья лёд трескается и четыре стража-носильщика идут со щитами к Кальдраму: пока они живы, он получает вдвое меньше урона, а каждый дошедший лечит его на 3 %. Их нужно убить по пути.",
  phases: [{ at: 0.5, abilities: ["assemble"], everyMul: 0.85, pauseMs: 2000, yell: ["Лёд трескается. Несите мне меня."] }],
  abilities: [
    {
      id: "stomp", name: "Топот", does: "Бьёт ногой оземь: от владыки расходится кольцо льда от 56 до 120 px. Вплотную и за краем кольца безопасно.",
      tele: "ring", at: "self", r: 56, r2: 120, windupMs: 1500, dmgPct: 0.4, k: "frost", every: 11, phase: 0,
      dodge: "Встать вплотную к Кальдраму (внутри 56 px) или отойти дальше 120 px; в кольце 56–120 px урон.",
    },
    {
      id: "ice_spears", name: "Ледяные копья",
      does: "Вонзает посох в землю в сторону танка: три ряда ледяных кругов по 26 px веером, ряды выходят один за другим и расходятся шире. Копьё бьёт в центре каждого круга.",
      tele: "circle", at: "spots", r: 26, spots: row(70, [-48, 0, 48]), windupMs: 900, dmgPct: 0.28, k: "frost", every: 13, phase: 0,
      then: [
        { tele: "circle", at: "spots", r: 26, spots: row(135, [-100, -36, 36, 100]), windupMs: 750, dmgPct: 0.28, k: "frost" },
        { tele: "circle", at: "spots", r: 26, spots: row(200, [-160, -80, 0, 80, 160]), windupMs: 750, dmgPct: 0.28, k: "frost" },
      ],
      dodge: "Не стоять в кругах: между ними есть проходы по ~30 px; держаться сбоку от линии на танка и сходить с круга, как только он лёг.",
    },
    {
      id: "assemble", name: "Сборка",
      does: "Лёд трескается: из него встают четыре стража со щитами и несут куски трона к владыке. Пока хоть один жив, Кальдрам получает вдвое меньше урона; каждый дошедший лечит его на 3 % здоровья.",
      tele: "circle", at: "self", r: 24, windupMs: 1400, dmgPct: 0, every: 28, phase: 1,
      bearers: { count: 4, hp: 1.2, shield: 0.5, healPct: 0.03, speed: 44 },
      dodge: "Убивать носильщиков по пути к боссу, пока они не дошли: чем дольше они живы, тем меньше урона по Кальдраму.",
    },
  ],
  loot: [
    { name: "Посох Ледяного Владыки", cat: "staff", slot: "две руки", rarity: "r3", lvl: 64, affix: ["int", "crit"] },
    { name: "Корона-шлем Кальдрама", cat: "cloth_helm", slot: "голова", rarity: "r2", lvl: 63, affix: ["int", "vit"] },
    { name: "Осколок ледяного сердца", cat: "amulet", slot: "шея", rarity: "r2", lvl: 62, affix: ["int", "hp"] },
  ],
  lines: {
    spawn: ["Вы пришли в мой лёд.", "Ещё одни кости для хребта."],
    abilities: { stomp: ["Хрусти, хребет!", "Лёд помнит каждый шаг."], ice_spears: ["Копья льда!", "Раз. Два. Три."], assemble: ["Несите мне меня.", "Соберите трон."] },
    lowHp: ["Холод… уходит из меня."],
    death: ["Лёд… снова… сомкнётся…", "Я… рассыпаюсь…"],
    kill: ["{name} — ещё один камень для хребта.", "Холод принял {name}."],
  },
};
{
  let raw = fs.readFileSync("data/ring-bosses.json", "utf8");
  const CR = String.fromCharCode(13), LF = String.fromCharCode(10);
  const nl = raw.includes(CR + LF) ? CR + LF : LF;
  const tail = nl + "    }" + nl + "  ]" + nl + "}" + nl;
  if (!raw.endsWith(tail)) throw new Error("tail");
  const body = JSON.stringify(card, null, 2).split(LF).map((l) => "    " + l).join(nl);
  raw = raw.slice(0, raw.length - tail.length) + nl + "    }" + "," + nl + body + nl + "  ]" + nl + "}" + nl;
  fs.writeFileSync("data/ring-bosses.json", raw);
}
// --- добыча
const rl = rd("data/ring-boss-loot.json");
const lich = rl.bosses.umb_crown_lich;
rl.bosses[ID] = {
  name: card.name, level: 65, band: [60, 70],
  special: [{ item: "zb_frost_staff", chance: 0.04 }, { item: "zb_frost_crown", chance: 0.04 }, { item: "zb_frost_heart", chance: 0.04 }],
  gold: lich.gold, loot: lich.loot, potion: lich.potion, mats: lich.mats, legendary: lich.legendary, pet: lich.pet,
};
const cls = ["mage", "warlock", "healer", "bloodweaver"];
rl.items.zb_frost_staff = {
  id: "zb_frost_staff", name: "Посох Ледяного Владыки", base: "staff", ilvl: 64, rarity: 2, fac: "umbrath", cls: ["mage", "warlock"], affix: ["int", "crit"], stats: { int: 38, crit: 1 },
  prop: "Каждое десятое заклинание носителя покрывает цель инеем: она на 2 с теряет скорость.", lore: "Звезда на навершии не тает даже у костра. Холод в ней чужой, старый, не твой.",
  look: { shape: "cage", mat: "blued", trim: "silver", cloth: "azure", haft: "darkwood", fx: "diamond", guard: "curved", pommel: "gem" }, boss: ID, card: "r3",
};
rl.items.zb_frost_crown = {
  id: "zb_frost_crown", name: "Корона-шлем Кальдрама", base: "cloth_helm", ilvl: 63, rarity: 1, fac: "umbrath", cls, affix: ["int", "vit"], stats: { int: 17, vit: 16 },
  prop: "Когда здоровье носителя падает ниже трети, шлем покрывается льдом: следующий удар по нему слабее.", lore: "Чёрная сталь с белой каймой инея. Изнутри холоднее, чем снаружи.",
  look: { shape: "horncrown", rich: 1, mat: "blued", trim: "silver", cloth: "azure", gem: "diamond", haft: "darkwood", deco: "spikes", fx: "diamond", guard: "ornate", pommel: "gem" }, boss: ID, card: "r2",
};
rl.items.zb_frost_heart = {
  id: "zb_frost_heart", name: "Осколок ледяного сердца", base: "amulet", ilvl: 62, rarity: 1, fac: "umbrath", cls, affix: ["int", "hp"], stats: { int: 17, hp: 170 },
  prop: "Первое заклинание после паузы в бою замораживает ближайшего врага на секунду.", lore: "Прозрачный, как стекло, и тяжёлый, как гиря. Внутри бьётся что-то медленное.",
  look: { shape: "medallion", rich: 1, mat: "silver", trim: "iron", cloth: "azure", gem: "diamond", haft: "yew", deco: "chains", fx: "diamond", guard: "ornate", pommel: "ring" }, boss: ID, card: "r2",
};
wr("data/ring-boss-loot.json", rl);
// --- бестиарий
const be = rd("data/bestiary.json");
be[ID] = {
  desc: "Кальдрам правил хребтом, пока двор не вмёрз в лёд вместе с троном. Топот бьёт кольцом: безопасно вплотную и далеко. Ледяные копья идут тремя рядами веером. С половины здоровья лёд трескается: четыре стража несут владыке куски трона, пока они живы, он почти неуязвим, а каждый дошедший лечит его на 3 %.",
  habitat: ["Костяной хребет"],
};
wr("data/bestiary.json", be);
// --- мир
let w = fs.readFileSync("data/world.json", "utf8");
const anchor = '{ "slot": "r59s", "west": "sol_plague_raven", "east": "plg_drowned_bellringer", "x": 278, "y": 252, "arena": 10 },';
if (!w.includes(anchor)) throw new Error("world anchor");
const nl = w.includes("\r\n") ? "\r\n" : "\n";
w = w.replace(anchor, anchor + nl + '      { "slot": "r65n", "west": null, "east": "' + ID + '", "x": 324, "y": 84, "arena": 10 },');
fs.writeFileSync("data/world.json", w);
console.log("ok");
