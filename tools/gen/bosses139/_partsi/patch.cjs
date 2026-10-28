const fs=require('fs');
let s=fs.readFileSync('p2.part','utf8');
const rep=(a,b)=>{ if(!s.includes(a)) {console.log('MISS',a.slice(0,60)); return;} s=s.replace(a,b); };
rep("const n0: V3 = norm([0.35, 0.9, 0.25]);","const n0At = (u: number): V3 => norm(lerpV([0.35, 0.9, 0.25], [0.1, 0.25, 1], clamp((u - 0.25) / 0.6, 0, 1)));");
rep("const t = norm(sub(b, a)), wd = norm(cross(t, n0)), nn = norm(cross(wd, t));","const t = norm(sub(b, a)), wd = norm(cross(t, n0At(um))), nn = norm(cross(wd, t));");
rep("        S.ell(g, wm(M.cloak, W), c, [len, 0.95, w], [t, nn, wd], { tex: tx as never, big: true, part: rp, tone: (i % 2 ? 0.06 : -0.06) + tone });",
"        S.ell(g, wm(M.cloak, W), c, [len, 0.95, w], [t, nn, wd], { tex: tx as never, big: true, part: rp, tone: (i % 2 ? 0.06 : -0.06) + tone });\n        if (i > 1 && (i % 2 === 0 || tipIce)) for (const sg of Math.abs(wd[2]) > 0.3 ? [wd[2] < 0 ? 1 : -1] : [1, -1]) {\n          const e0 = add(c, mul(wd, sg * w * 0.92));\n          S.cone(g, wm(M.ice, W), e0, 0.85, add(add(e0, mul(wd, sg * (1.8 + 0.6 * (i % 3)))), [0, 0, -1.0]), 0.1, { part: S.newPart(), tone: (i % 3) * 0.3 });\n        }");
rep("const wd = norm(cross(t, n0));","const wd = norm(cross(t, n0At(0.9)));");
rep("[pel[0] - 33 + sw, pel[1] - 29 - fl * 2, 1.0], 8.4, 22","[pel[0] - 38 + sw, pel[1] - 34 - fl * 2, 1.0], 8.4, 26");
rep("[pel[0] - 17 - sw, pel[1] - 17 - fl, 1.0], 4.6, 12","[pel[0] - 22 - sw, pel[1] - 22 - fl, 1.0], 4.6, 14");
// core dimmer
rep("{ part: S.newPart(), tone: Math.round(p.glow * 0.8) - 0.4 }","{ part: S.newPart(), tone: Math.round(p.glow * 0.8) - 1.4 }");
rep("px: ST_CORE, colors: keys,","px: ST_CORE, colors: stampKeys(p.glow * 0.55, W),");
// hair strands
rep("const m = T([s * 4.3, 3.6, 41.0]);","const m = T([s * 5.0, 5.4, 41.0]);");
rep("const b = T([s * 3.4 + (s > 0 ? 0.4 : -0.4), 4.4, 31.5]);","const b = T([s * 4.2, 5.8, 29.5]);");
rep("S.cone(gh, wm(M.hair, W), a, 1.1, m, 1.2,","S.cone(gh, wm(M.hair, W), a, 1.5, m, 1.7,");
rep("S.cone(gh, wm(M.hair, W), m, 1.2, b, 0.2,","S.cone(gh, wm(M.hair, W), m, 1.7, b, 0.25,");
// crown
const i=s.indexOf("      const ps = S.newPart();\n      const horn");
const j=s.indexOf("      // ледяные кристаллы позади рогов");
if(i<0||j<0) console.log('MISS crown'); else {
 s=s.slice(0,i)+`      const ps = S.newPart();
      const spike = (x: number, y: number, len: number, lean: number, r: number, m: Mat, tone: number) => {
        const b = [x, y, 54.0] as V3;
        const md = [x + lean * 0.4, y - 0.2, 54.0 + len * 0.55] as V3;
        const t = [x + lean, y - 0.4, 54.0 + len] as V3;
        S.cone(g, wm(m, W), tf(b), r, tf(md), r * 0.62, { part: ps, tone });
        S.cone(g, wm(m, W), tf(md), r * 0.62, tf(t), 0.1, { part: ps, tone: tone + 0.2 });
      };
      // шлем: лобная пластина с высоким центральным пиком, пики по бокам, ледяные шипы-сосульки по краям
      S.ell(g, wm(M.steel, W), tf([0, 2.6, 53.2]), [3.4, 1.6, 2.2], ax, { part: S.newPart(), tone: 0.35 });
      spike(0, 2.2, 10.5, 0, 1.3, M.steel, 0.45);
      for (const s of [1, -1]) {
        spike(s * 1.9, 1.4, 7.4, s * 0.6, 1.0, M.steel, 0.35);
        spike(s * 3.3, 0.2, 5.2, s * 1.6, 0.9, M.ice, 0.5);
        spike(s * 3.9, -1.0, 3.4, s * 1.8, 0.8, M.ice, 0.3);
      }
`+s.slice(j);
}
// pauldron white fur + bigger ice spikes
rep("      // ледяные кристаллы на плече","      // белый мех по верху плеча\n      S.ell(g, wm(M.hair, W), T([s * 10.4, 0.0, 45.6]), [5.6, 4.6, 2.2], axes(TV, s * 0.4), { tex: furTex as never, part: S.newPart(), tone: 0.1, big: true });\n      for (let k = 0; k < 7; k++) {\n        const b = T([s * (7.6 + k * 1.2), 1.8 - 0.3 * k, 45.2]);\n        S.cone(g, wm(M.hair, W), b, 1.1, add(b, TV([s * 0.6, 0.6, 2.4 + 1.2 * hash01(k, s + 5, 37)])), 0.15, { part: S.newPart(), tone: (k % 2) * 0.3 });\n      }\n      // ледяные кристаллы на плече");
rep("[[8.4, 5.2], [10.6, 4.0]] as [number, number][]","[[8.0, 8.2], [10.0, 6.4], [12.2, 4.6]] as [number, number][]");
// tabard stripes wider + pattern
rep("S.cone(g, wm(M.ice, W), a, 1.0, b, 1.15, { part: S.newPart(), tone: 0.1 });","S.cone(g, wm(M.ice, W), a, 1.5, b, 1.7, { part: S.newPart(), tone: 0.1 });\n        for (let q = 1; q < 7; q++) S.ball(g, wm(M.ice, W), add(lerpV(a, b, q / 7.5), [-s * 2.0, 0.4, 0]), 0.6, { part: S.newPart(), tone: 0.5 });");
fs.writeFileSync('p2.part',s);
