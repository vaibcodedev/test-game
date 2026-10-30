/**
 * Три варианта «чуточку объёмнее» для прежнего сундука добычи (tools/gen/loot.ts не меняется, в игру не встраивается).
 * A — блик на оковке, тень снизу, контактная тень. B — + полоса крышки сверху, правая грань, тушёвка досок.
 * C — + выпуклая крышка с бликом, клёпки, отражённый свет, мягкая брошенная тень.
 * Запуск: npx tsx tools/gen/loot-volume-variants.ts  ->  tools/out/loot-volume/{index.html,variants.png}
 */
import fs from "node:fs";
import path from "node:path";
import { PC, hex, mix, withA, type RGBA } from "./canvas";
import { OUTLINE, P } from "./palette";
import { LOOT_DRAW, LOOT_FRAMES, buildLootSheet } from "./loot";

const OUT = path.resolve("tools/out/loot-volume");
const WOOD = [hex("#2a180e"), hex("#432716"), hex("#5e3a22"), hex("#80522e"), hex("#a06c40")];
const IRON = [hex("#16141e"), hex("#2a2836"), hex("#46445a"), hex("#6a6882"), hex("#a2a0bc")];
const eq = (a: RGBA, b: RGBA) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
const isWood = (p: RGBA) => p[3] === 255 && WOOD.some((w) => eq(p, w));
const isOut = (p: RGBA) => eq(p, OUTLINE);
const h2 = (x: number, y: number) => { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967295; };

type V = "A" | "B" | "C";
const orig = LOOT_DRAW.chest;

/** Доработка пикселей готового сундука; геометрия — как в drawChest. */
function volume(src: PC, v: V, r: number, k: number): PC {
  const c = src.clone(), W = c.w, H = c.h;
  const w = Math.round(17 * k), x0 = Math.round((W - w) / 2), x1 = x0 + w, g = H - 1, lip = Math.round(g - 8 * k), cx = x0 + w / 2;
  const band = r === 3 ? P.gold : IRON;
  const px = (x: number, y: number) => c.get(x, y);
  const tint = (x: number, y: number, to: RGBA, t: number) => { const p = px(x, y); if (p && p[3] === 255 && !isOut(p)) c.set(x, y, [...mix(p, to, t).slice(0, 3), 255] as RGBA); };
  const bwid = Math.max(2, Math.round(2 * k));
  const straps = [x0 + Math.round(2.5 * k), x1 - Math.round(2.5 * k) - bwid];
  // --- A: блик на оковке, тень снизу на передней стенке ---
  for (let x = x0 + 1; x < cx - 2 * k; x++) { const p = px(x, lip); if (p && eq(p, band[3])) c.set(x, lip, band[4]); }
  for (let y = lip + 3; y < g - 1; y++) { const p = px(straps[0], y); if (p && eq(p, band[3]) && y % 4 < 2) c.set(straps[0], y, band[4]); }
  for (let y = lip + 3; y < g; y++) for (let x = x0; x < x1; x++) {
    const d = g - y;
    if (d <= 3) tint(x, y, OUTLINE, [0, 0.55, 0.38, 0.2][d] ?? 0);
  }
  for (let x = x0; x < x1; x++) tint(x, lip + 3, OUTLINE, 0.25);
  if (v === "A") return c.outline(OUTLINE);
  // --- B: полоса крышки сверху, правая грань, тушёвка ---
  for (let x = x0 + 2; x < x1 - 2; x++) {
    let y = 0; while (y < lip && !(px(x, y) && px(x, y)![3] === 255 && !isOut(px(x, y)!))) y++;
    if (y >= lip - 2) continue;
    const t = (x - cx) / (w / 2);
    for (let j = 0; j < 2; j++) { const p = px(x, y + j); if (p && isWood(p)) c.set(x, y + j, j ? WOOD[3] : (t < 0.3 ? WOOD[4] : WOOD[3])); }
  }
  for (let y = lip + 3; y < g; y++) {
    for (let i = 0; i < 3; i++) tint(x1 - 1 - i, y, OUTLINE, [0.22, 0.3, 0.14][i]);
    const p = px(x1 - 5, y); if (p && isWood(p)) c.set(x1 - 5, y, WOOD[3]);
  }
  for (let y = lip + 3; y < g - 1; y++) for (let x = x0 + 1; x < x1 - 1; x++) {
    const p = px(x, y); if (!p || !isWood(p)) continue;
    const hh = h2(x >> 2, y);
    if (hh > 0.8 && (x & 3) < 3) c.set(x, y, hh > 0.9 ? WOOD[1] : (mix(p, WOOD[4], 0.25) as RGBA));
  }
  if (v === "B") return c.outline(OUTLINE);
  // --- C: выпуклая крышка, клёпки, отражённый свет ---
  for (let y = 0; y < lip; y++) for (let x = x0; x < x1; x++) {
    const p = px(x, y); if (!p || !isWood(p)) continue;
    const dx = (x - (cx - w * 0.2)) / (w * 0.32), dy = (y - (lip - 6.5 * k + 3)) / (3.2 * k), d = Math.hypot(dx, dy);
    if (d < 1) c.set(x, y, d < 0.45 ? WOOD[4] : WOOD[3]);
    else if (x > cx + w * 0.22) tint(x, y, OUTLINE, 0.2 + 0.2 * ((x - cx) / (w / 2)));
    if (y > lip - 2) tint(x, y, OUTLINE, 0.15);
  }
  for (const bx of straps) for (const ry of [Math.round(lip + 4 * k), g - 2]) {
    c.set(bx, ry, band[4]); c.set(bx + 1, ry, band[2]); c.set(bx, ry - 1, band[3]); c.set(bx + 1, ry + 1, band[0]);
  }
  for (let x = x0 + 1; x < x1 - 1; x++) { const p = px(x, g - 2); if (p && isWood(p)) c.set(x, g - 2, mix(p, hex("#c0804c"), 0.35) as RGBA); }
  return c.outline(OUTLINE);
}

/** Тень на земле поверх готового листа (только по прозрачному). */
function groundShadow(sheet: PC, fw: number, G: number, ow: number, v: V) {
  const lifts = [14, 14 * (1 - 0.2025), 14 * (1 - 0.6084), 0, 0, 2.4, 4, 4 * (1 - 0.36), 0, 0];
  for (let i = 0; i < LOOT_FRAMES; i++) {
    const lift = i < 10 ? lifts[i] : 0; if (lift > 3) continue;
    const ox = i * fw, CX = fw / 2, s = 1 - lift / 3;
    const put = (x: number, y: number, a: number) => { const p = sheet.get(ox + x, y); if (p && p[3] < 200) sheet.set(ox + x, y, withA(OUTLINE, Math.round(a * s))); };
    const half = ow / 2 - 1;
    for (let x = Math.round(CX - half); x < CX + half; x++) {
      const e = Math.abs(x + 0.5 - CX) / half;
      put(x, G, 215 - 70 * e * e);
      if (v !== "A") put(x, G + 1, 95 - 50 * e * e);
    }
    if (v === "C") for (let y = G - 1; y <= G + 2; y++) for (let x = 0; x < fw; x++) {
      const d = Math.hypot((x + 0.5 - CX - 3.5) / (ow * 0.58), (y + 0.5 - G - 0.6) / 2.6);
      if (d < 1) put(x, y, 85 * (1 - d));
    }
  }
}

type Built = { sheet: PC; fw: number; fh: number; ground: number };
export const VARIANTS = ["old", "A", "B", "C"] as const;
function build(v: (typeof VARIANTS)[number], r: number, boss: boolean): Built {
  if (v === "old") return buildLootSheet("chest", r, boss);
  LOOT_DRAW.chest = (rr, kk) => volume(orig(rr, kk), v, rr, kk);
  try {
    const b = buildLootSheet("chest", r, boss);
    groundShadow(b.sheet, b.fw, b.ground, Math.round(17 * (boss ? 1.35 : 1)), v);
    return b;
  } finally { LOOT_DRAW.chest = orig; }
}

const data: Record<string, string> = {};
let fw = 0, fh = 0;
const built: Record<string, Built> = {};
fs.mkdirSync(OUT, { recursive: true });
for (let r = 0; r < 4; r++) for (const boss of [false, true]) for (const v of VARIANTS) {
  const id = `${v}_r${r}${boss ? "b" : ""}`, b = build(v, r, boss);
  built[id] = b; b.sheet.save(path.join(OUT, `${id}.png`));
  data[id] = "data:image/png;base64," + fs.readFileSync(path.join(OUT, `${id}.png`)).toString("base64");
  fw = Math.max(fw, b.fw); fh = Math.max(fh, b.fh);
}
// монтаж: строки — редкость/босс, столбцы — прежний|A|B|C, кадр покоя 15, зум 3, фон трава
const Z = 3, cellW = fw * Z, cellH = fh * Z, rows = 8, M = new PC(cellW * 4, cellH * rows);
const grass = P.grass;
for (let y = 0; y < M.h; y++) for (let x = 0; x < M.w; x++) M.set(x, y, grass[1 + (Math.floor(h2((x / Z) | 0, (y / Z) | 0) * 2.99))]);
let row = 0;
for (let r = 0; r < 4; r++) for (const boss of [false, true]) {
  VARIANTS.forEach((v, col) => {
    const b = built[`${v}_r${r}${boss ? "b" : ""}`], f = 15, ox = col * cellW + Math.round((cellW - b.fw * Z) / 2), oy = row * cellH + cellH - b.fh * Z;
    for (let y = 0; y < b.fh; y++) for (let x = 0; x < b.fw; x++) {
      const p = b.sheet.get(f * b.fw + x, y); if (!p || !p[3]) continue;
      for (let j = 0; j < Z; j++) for (let i = 0; i < Z; i++) M.set(ox + x * Z + i, oy + y * Z + j, p);
    }
  });
  row++;
}
M.save(path.join(OUT, "variants.png"));

const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>Сундук: варианты объёма</title>
<style>body{margin:0;padding:16px;background:#14121a;color:#d8d0c0;font:14px system-ui}h1{font-size:18px}
button{background:#2a2636;color:#e8dcc0;border:1px solid #5a5068;padding:6px 12px;margin:0 4px 6px 0;cursor:pointer}button.on{background:#6a5424;border-color:#c9a24a}
table{border-collapse:collapse}td,th{padding:4px;text-align:center;font-weight:normal;color:#a89c88}canvas{display:block;image-rendering:pixelated}</style></head><body>
<h1>Прежний сундук добычи: прежний | A | B | C</h1>
<div><span>Зум:</span> <button data-z="2">2</button><button data-z="3">3</button>
<span>Время:</span> <button data-t="day">день</button><button data-t="night">ночь</button>
<span>Фон:</span> <button data-b="grass">трава</button><button data-b="stone">камень</button>
<button id="replay">повтор падения</button></div>
<p>A — блик оковки, тень снизу, контактная тень. B — плюс полоса крышки сверху, правая грань, тушёвка досок. C — плюс выпуклая крышка с бликом, клёпки, отражённый свет, мягкая брошенная тень.</p>
<table id="t"></table>
<script>
const D=${JSON.stringify(data)},V=["old","A","B","C"],L=["прежний","A","B","C"],ROWS=[["r0","Обычная"],["r1","Редкая"],["r2","Эпик"],["r3","Легендарная"],["r0b","Босс обычная"],["r1b","Босс редкая"],["r2b","Босс эпик"],["r3b","Босс легенд."]];
const S={z:3,t:"day",b:"grass"},FR=${LOOT_FRAMES},imgs={};let t0=performance.now();
const GR=["#2c5530","#3b6e36","#4f873c"],ST=["#2e2c34","#46444e","#625e6a"];
function h(x,y){let a=(x*374761393+y*668265263)|0;a=(a^(a>>>13))*1274126177;return((a^(a>>>16))>>>0)/4294967295}
const tbl=document.getElementById("t"),cvs=[];
tbl.innerHTML="<tr><th></th>"+L.map(l=>"<th>"+l+"</th>").join("")+"</tr>";
ROWS.forEach(([id,name])=>{const tr=document.createElement("tr");tr.innerHTML="<th>"+name+"</th>";V.forEach(v=>{const td=document.createElement("td"),c=document.createElement("canvas");td.appendChild(c);tr.appendChild(td);cvs.push({c,key:v+"_"+id})});tbl.appendChild(tr)});
let loaded=0;const N=Object.keys(D).length;Object.keys(D).forEach(k=>{const i=new Image();i.onload=()=>{if(++loaded==N)loop()};i.src=D[k];imgs[k]=i});
function frameIdx(ms){const f=Math.floor(ms/83);return f<10?f:10+((f-10)%10)}
function draw(){const f=frameIdx(performance.now()-t0);
cvs.forEach(({c,key})=>{const im=imgs[key],fw=im.width/FR,fh=im.height,z=S.z,W=fw*z,H=fh*z;
if(c.width!=W||c.height!=H){c.width=W;c.height=H}
const x=c.getContext("2d");x.imageSmoothingEnabled=false;x.filter="none";
const pal=S.b=="grass"?GR:ST;
for(let j=0;j<fh;j++)for(let i=0;i<fw;i++){x.fillStyle=pal[Math.floor(h(i,j)*2.99)];x.fillRect(i*z,j*z,z,z)}
if(S.t=="night"){x.fillStyle="rgba(8,12,40,0.62)";x.fillRect(0,0,W,H);x.filter="brightness(0.72) saturate(0.9)"}
x.drawImage(im,f*fw,0,fw,fh,0,0,W,H);x.filter="none"})}
function loop(){draw();requestAnimationFrame(loop)}
document.getElementById("replay").onclick=()=>{t0=performance.now()};
setInterval(()=>{if(performance.now()-t0>6000)t0=performance.now()},500);
function sync(){document.querySelectorAll("button[data-z],button[data-t],button[data-b]").forEach(b=>{const k=b.dataset.z?["z",+b.dataset.z]:b.dataset.t?["t",b.dataset.t]:["b",b.dataset.b];b.classList.toggle("on",S[k[0]]===k[1]);b.onclick=()=>{S[k[0]]=k[1];sync()}})}
sync();
</script></body></html>`;
fs.writeFileSync(path.join(OUT, "index.html"), html);
console.log("ok", fw, fh);
