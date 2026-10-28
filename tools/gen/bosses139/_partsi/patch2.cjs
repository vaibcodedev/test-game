const fs=require('fs');
function ed(f,pairs){let s=fs.readFileSync(f,'utf8');for(const [a,b] of pairs){if(!s.includes(a)){console.log('MISS',f,a.slice(0,50));continue;}s=s.replace(a,b);}fs.writeFileSync(f,s);}
ed('p1.part',[
 ['down: rowsOf2(["dd..dd", "c3..3c", "......", "..kk.."], -3, -1),','down: rowsOf2(["ddd..ddd", "3cc..cc3", "3cc..cc3", "........", "...kk..."], -4, -1),'],
 ['side: rowsOf2(["ddd", "c3.", "...", "kk."], -1, -1),','side: rowsOf2(["ddd", "3cc", "3cc", "...", "kk."], -1, -1),'],
]);
ed('p3b.part',[
 ['export function renderFrost(view: View, pose: Pose): { img: PC; emis: PC } {','export function renderFrost(view: View, pose: Pose): { img: PC; emis: PC } {\n  // хвост плаща уходит назад и в сторону: тело сдвинуто в кадре, чтобы шлейф помещался\n  const cx = view === "side" ? 46 : view === "up" ? 47 : 33;\n  CAM.CX = cx; CAMR.CX = cx * 2;'],
]);
ed('p4.part',[
 ['for (let t = 0; t < (k > 0.5 ? 3 : 2) + tooth; t++) {','for (let t = 0; t < (k > 0.5 ? 5 : 3) + tooth; t++) {'],
 ['c.set(x, y, t === 0 ? FIRE[k > 0.45 ? 4 : 3] : t === 1 ? GLOWC[k > 0.3 ? 3 : 2] : ICE[2]);','c.set(x, y, t === 0 ? FIRE[4] : t === 1 ? FIRE[3] : t === 2 ? GLOWC[k > 0.3 ? 4 : 3] : t === 3 ? GLOWC[2] : ICE[2]);'],
 ['const hw = Math.max(0.5, 5.2 * Math.pow(1 - v, 0.85) + (y < 3 ? 1 : 0)) + (f === 0 ? 2 : 0);','const hw = Math.max(0.5, 7.0 * Math.pow(1 - v, 0.85) + (y < 3 ? 1 : 0)) + (f === 0 ? 2 : 0);'],
 ['    // осколки у основания','    // малые шипы кустом у основания\n    for (const [dx, hh] of [[-9, 8], [-5, 14], [5, 12], [9, 7]] as [number, number][]) {\n      const hk = Math.round(hh * Math.min(1, H / 30));\n      for (let y = 0; y < hk; y++) { const hw = Math.max(0, 2.2 * (1 - y / hk)); for (let x = -Math.ceil(hw); x <= Math.ceil(hw); x++) { if (Math.abs(x) > hw + 0.2) continue; const X = cx + dx + x, Y = gy - y; if (X > f * w && X < (f + 1) * w - 1 && f > 0) c.set(X, Y, x < 0 ? FIRE[3] : ICE[y > hk - 3 ? 4 : 2]); } }\n    }\n    // осколки у основания'],
]);
// death mode
let s=fs.readFileSync('p4.part','utf8');
s=s.replace('  const fx = [\n','  if (process.argv.includes("--death")) {\n    const fr = [6, 9, 13].map((i) => renderFrost("down", POSES.death("down")[i]).img).concat([6, 13].map((i) => renderFrost("side", POSES.death("side")[i]).img));\n    const sc = new PC(fr.length * (N * 6 + 8), FH * 6);\n    fill(sc, 0, 0, sc.w, sc.h, [120, 104, 84, 255]);\n    fr.forEach((f, i) => sc.blit(scaleNN(f, 6), i * (N * 6 + 8), 0));\n    save(sc, "r65n-e-death.png");\n    return files;\n  }\n  const fx = [\n');
s=s.replace('const quick = ','const quick = ');
s=s.replace('process.argv.includes("--quick") || process.argv.includes("--sil"));','process.argv.includes("--quick") || process.argv.includes("--sil") || process.argv.includes("--death"));');
fs.writeFileSync('p4.part',s);
