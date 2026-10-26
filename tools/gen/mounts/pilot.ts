/**
 * Задача 142, этап 1 — пилот: боевой конь со знаменем (Сольгард и Умбрат) и королевский грифон. В игру не ставится.
 * Запуск: npx tsx tools/gen/mounts/pilot.ts → tools/out/mounts-pilot/
 *   sheets/<id>.png (+ <id>-emis.png) — лист: столбцы 0..11 бег, 12..35 покой; строки 0–3 задний слой (вниз, вверх, вправо, влево —
 *     настоящий левый бок, не зеркало), 4–7 передний (поверх всадника); sheets.json — кадр, линия земли, посадка всадника по виду и кадру;
 *   preview.png — каждый маунт во всех направлениях: «старый | новый | новый с героем», день и ночь, затем «наш | референс»;
 *   mounts-pilot.html — анимация (бег/покой, с героем и без).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildSheet, loadAssets, withRider, oldFrame, sceneRow, refRow, stackRows, pngDataUrl, fill, crop, scaleNN, text,
  type MountSpec, type SheetOut, type Cell,
} from "./lib";
import { loadPC, PC, type Row } from "../mobs/lib";
import { warHorse } from "./war_horse";
import { griffin } from "./griffin";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const OUT = path.join(ROOT, "tools", "out", "mounts-pilot");
const REFS = path.join(ROOT, "tools", "out", "refs", "mounts");

interface Item { spec: MountSpec; hero: string; old: string; refs: string[] }
const ITEMS: Item[] = [
  { spec: warHorse("solgard"), hero: "warrior", old: "war_horse", refs: ["20-banner_armored_horse", "07-banner_parade_horse", "03-spiked_armored_horse"] },
  { spec: warHorse("umbrath"), hero: "deathknight", old: "skel_horse", refs: ["20-banner_armored_horse", "03-spiked_armored_horse"] },
  { spec: griffin(), hero: "warrior", old: "griffin", refs: ["11-owl_gryphon_gold", "12-owl_gryphon_gold_side", "13-white_gryphon_armored"] },
];
const only = process.argv.slice(2).filter((a) => !a.startsWith("-"));

function main() {
  fs.mkdirSync(path.join(OUT, "sheets"), { recursive: true });
  const A = loadAssets(ROOT);
  const rows: Row[] = [];
  const W = 4100, k = 2;
  const metas: Record<string, SheetOut["meta"]> = {};
  const html: { id: string; ru: string; sheet: string; meta: SheetOut["meta"]; hero: string }[] = [];
  let problems = 0;
  for (const it of ITEMS) {
    if (only.length && !only.includes(it.spec.id)) continue;
    const t0 = Date.now();
    const s = buildSheet(it.spec, it.spec.ru);
    s.sheet.save(path.join(OUT, "sheets", `${it.spec.id}.png`));
    s.emis.save(path.join(OUT, "sheets", `${it.spec.id}-emis.png`));
    metas[it.spec.id] = s.meta;
    problems += s.problems.length;
    if (s.problems.length) console.warn(`${it.spec.ru}: ${s.problems.length} замечаний\n  ${s.problems.slice(0, 12).join("\n  ")}`);
    console.log(`${it.spec.ru}: лист ${s.sheet.w}×${s.sheet.h} за ${((Date.now() - t0) / 1000).toFixed(1)} с`);
    const hero = A.heroes[it.hero];
    const N = it.spec.N, GY = it.spec.GY;
    const oldViews: [number, boolean][] = [[0, false], [1, false], [2, false], [2, true]];
    const views = [0, 1, 2, 3];
    const idleCol = 12;
    for (const night of [false, true]) {
      const cells: Cell[] = [];
      for (const [row, flip] of oldViews) { const o = oldFrame(ROOT, it.old, row, hero); cells.push({ img: o.img, GY: o.GY, flip }); }
      cells.push({ img: new PC(1, 1), GY: 0, label: "|" });
      for (const row of views) { const r = withRider(s.sheet, N, GY, idleCol, row, s.meta.seat[row][idleCol], null, s.emis); cells.push({ img: r.img, emis: r.emis, GY }); }
      cells.push({ img: new PC(1, 1), GY: 0, label: "|" });
      for (const row of views) { const r = withRider(s.sheet, N, GY, idleCol, row, s.meta.seat[row][idleCol], hero, s.emis); cells.push({ img: r.img, emis: r.emis, GY }); }
      rows.push(sceneRow(`×2 · ${it.spec.ru.toUpperCase()} · СТАРЫЙ | НОВЫЙ | НОВЫЙ С ГЕРОЕМ · ВНИЗ ВВЕРХ ВПРАВО ВЛЕВО · ${night ? "НОЧЬ" : "ДЕНЬ"}`, cells, A, night, W, k, 230, night ? "dirt" : "grass"));
    }
    // наш | референс: крупно сбоку, на светлом фоне
    const big = 4;
    const side = withRider(s.sheet, N, GY, idleCol, 2, s.meta.seat[2][idleCol], hero).img, bare = withRider(s.sheet, N, GY, idleCol, 2, s.meta.seat[2][idleCol], null).img;
    const refs = it.refs.map((r) => loadPC(path.join(REFS, `${r}.png`)));
    rows.push({
      h: N * big + 40,
      draw: (c, y0) => {
        text(c, `×${big} · ${it.spec.ru.toUpperCase()} · НАШ | РЕФЕРЕНС`, 16, y0 + 8);
        fill(c, 16, y0 + 34, N * big * 2 + 16, N * big, [206, 200, 188, 255]);
        c.blit(scaleNN(bare, big), 16, y0 + 34);
        c.blit(scaleNN(side, big), 16 + N * big + 16, y0 + 34);
        const tmp = new PC(W, N * big + 40);
        refRow("", refs, N * big).draw(tmp, -34);
        c.blit(crop(tmp, 0, 0, W - (N * big * 2 + 64), N * big), N * big * 2 + 64, y0 + 34);
      },
    });
    html.push({ id: it.spec.id, ru: it.spec.ru, sheet: pngDataUrl(s.sheet), meta: s.meta, hero: it.hero });
  }
  fs.writeFileSync(path.join(OUT, "sheets", "sheets.json"), JSON.stringify(metas, null, 1));
  stackRows(rows, W).save(path.join(OUT, "preview.png"));
  writeHtml(html, A);
  console.log(`${OUT} · замечаний по кадрам: ${problems}`);
}

function writeHtml(list: { id: string; ru: string; sheet: string; meta: SheetOut["meta"]; hero: string }[], A: ReturnType<typeof loadAssets>) {
  const heroes: Record<string, string> = {};
  for (const n of new Set(list.map((l) => l.hero))) heroes[n] = pngDataUrl(A.heroes[n]);
  const data = JSON.stringify({ list, heroes });
  const page = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>Маунты: пилот</title>
<style>body{background:#1b1820;color:#e8e0d0;font:14px system-ui;margin:16px}h2{margin:18px 0 6px;font-size:16px}
.row{display:flex;gap:8px;flex-wrap:wrap}canvas{image-rendering:pixelated;background:#5f7f48;border:1px solid #333}
label{margin-right:14px}.bar{margin:8px 0}</style></head><body>
<h1 style="font-size:18px">Задача 142 — пилот маунтов</h1>
<div class="bar"><label><input type="checkbox" id="rider" checked> герой в седле</label>
<label><input type="checkbox" id="night"> ночь</label>
<label>увеличение <select id="zoom"><option>2</option><option selected>3</option><option>4</option></select></label>
<label>бег, кадр/с <input id="fr" type="number" value="14" min="1" max="30" style="width:50px"></label>
<label>покой, кадр/с <input id="fi" type="number" value="10" min="1" max="30" style="width:50px"></label></div>
<div id="root"></div>
<script>
const D=${data};
const img=(s)=>{const i=new Image();i.src=s;return i};
const heroes=Object.fromEntries(Object.entries(D.heroes).map(([k,v])=>[k,img(v)]));
const views=[[0,0,false,'вниз'],[1,1,false,'вверх'],[2,2,false,'вправо'],[3,2,true,'влево']];
const cv=[];
for(const m of D.list){
  const sh=img(m.sheet);
  for(const anim of ['run','idle']){
    const h=document.createElement('h2');h.textContent=m.ru+' — '+(anim==='run'?'бег, '+m.meta.run+' кадров':'покой, '+m.meta.idle+' кадров');
    document.getElementById('root').appendChild(h);
    const row=document.createElement('div');row.className='row';document.getElementById('root').appendChild(row);
    for(const [r,hr,hf,name] of views){const c=document.createElement('canvas');c.title=name;row.appendChild(c);cv.push({c,m,sh,anim,r,hr,hf});}
  }
}
function draw(t){
  const z=+document.getElementById('zoom').value, rider=document.getElementById('rider').checked, night=document.getElementById('night').checked;
  for(const o of cv){
    const N=o.m.meta.frame, c=o.c; if(c.width!==N*z){c.width=N*z;c.height=N*z;}
    const x=c.getContext('2d');x.imageSmoothingEnabled=false;x.clearRect(0,0,c.width,c.height);
    const n=o.anim==='run'?o.m.meta.run:o.m.meta.idle, fps=+document.getElementById(o.anim==='run'?'fr':'fi').value;
    const i=Math.floor(t/1000*fps)%n, col=(o.anim==='run'?0:o.m.meta.run)+i;
    x.drawImage(o.sh,col*N,o.r*N,N,N,0,0,N*z,N*z);
    if(rider){const s=o.m.meta.seat[o.r][col], hx=(N/2+Math.round(s[0])-16)*z, hy=(o.m.meta.gy+Math.round(s[1])+9-30)*z;
      x.save();if(o.hf){x.translate(hx+32*z,0);x.scale(-1,1);x.drawImage(heroes[o.m.hero],0,o.hr*32,32,32,0,hy,32*z,32*z);}else x.drawImage(heroes[o.m.hero],0,o.hr*32,32,32,hx,hy,32*z,32*z);x.restore();}
    x.drawImage(o.sh,col*N,(o.r+4)*N,N,N,0,0,N*z,N*z);
    if(night){x.fillStyle='rgba(20,30,80,0.55)';x.globalCompositeOperation='multiply';x.fillRect(0,0,c.width,c.height);x.globalCompositeOperation='source-over';}
  }
  requestAnimationFrame(draw);
}
requestAnimationFrame(draw);
</script></body></html>`;
  fs.writeFileSync(path.join(OUT, "mounts-pilot.html"), page);
}
main();
