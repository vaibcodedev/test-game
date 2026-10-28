const fs=require('fs');
let s=fs.readFileSync('p2.part','utf8');
const rep=(a,b)=>{ if(!s.includes(a)){console.log('MISS',a.slice(0,60));return;} s=s.replace(a,b); };
rep("S.ell(gh, wm(M.hair, W), H([0, -1.5, HC + 0.4]), [3.9, 3.5, 4.6], axes(HV), { cut: { n: [0, 1, 0], d: 0.2 }, tone: 0.1, big: true });",
"// шлем-обрамление: тёмная сталь вокруг лица (затылок, виски, нащёчники), лицо открыто спереди\n    S.ell(gh, wm(M.steel, W), H([0, -0.9, HC + 0.6]), [4.9, 4.7, 5.6], axes(HV), { cut: { n: [0, 1, 0], d: 1.6 }, tone: 0.2, big: true });\n    for (const s of [1, -1]) {\n      S.ell(gh, wm(M.steel, W), H([s * 4.3, 1.6, HC + 0.4]), [1.3, 2.6, 4.6], axes(HV, s * 0.15), { part: S.newPart(), tone: 0.3 });\n      S.ell(gh, wm(M.steel, W), H([s * 3.4, 3.0, HC - 3.4]), [1.0, 2.0, 2.0], axes(HV), { part: S.newPart(), tone: 0.1 });\n    }\n    S.ell(gh, wm(M.steel, W), H([0, 2.8, HC + 4.9]), [3.6, 2.2, 1.0], axes(HV), { part: S.newPart(), tone: 0.4 });");
rep("const a = H([s * 3.2, 1.6, HC + 0.2]);","const a = T([s * 5.6, 3.8, 44.6]);");
rep("const m = T([s * 5.6, 5.6, 41.0]);","const m = T([s * 6.0, 5.6, 40.0]);");
fs.writeFileSync('p2.part',s);
