const fs=require('fs');
function ed(f,pairs){let s=fs.readFileSync(f,'utf8');for(const [a,b] of pairs){if(!s.includes(a)){console.log('MISS',f,a.slice(0,60));continue;}s=s.replace(a,b);}fs.writeFileSync(f,s);}
ed('p1.part',[
 ['pitch: 0.03, yaw: 0, roll: 0, hp: -0.02,','pitch: 0.08, yaw: 0, roll: 0.02, hp: -0.04,'],
 ['const STF_FRONT = staffAt([12.8, 3.0, 0]','const STF_FRONT = staffAt([14.6, 3.0, 0]'],
 ['[-14.5, 7.5, 31]], pole: [[1, -0.4, -0.8], [-1, -0.6, -0.5]]','[-17, 9, 30]], pole: [[1, -0.4, -0.8], [-1, -0.6, -0.5]]'],
]);
ed('p2.part',[
 ['S.cone(g, wm(M.ice, W), a, 1.5, b, 1.7, { part: S.newPart(), tone: 0.1 });','S.cone(g, wm(M.ice, W), a, 0.7, b, 0.85, { part: S.newPart(), tone: -0.5 });'],
 ['S.ball(g, wm(M.ice, W), add(lerpV(a, b, q / 7.5), [-s * 2.0, 0.4, 0]), 0.6, { part: S.newPart(), tone: 0.5 });','S.ball(g, wm(M.ice, W), add(lerpV(a, b, q / 7.5), [-s * 1.6, 0.3, 0]), 0.42, { part: S.newPart(), tone: 0.0 });'],
 ['const rb = lerp(7.0, 10.4, col), ra = lerp(4.4, 8.0, col);','const rb = lerp(5.8, 10.4, col), ra = lerp(3.8, 8.0, col);'],
 ['PV([s * 2.6, 3.7, 29.5]);','PV([s * 2.2, 3.2, 29.5]);'],
 ['[pel[0] + s * 4.4, pel[1] + 6.0, 4.6];','[pel[0] + s * 3.6, pel[1] + 4.8, 4.6];'],
 ['[4.8, 3.6, 7.4], axes(TV), { tex: folds','[4.2, 3.2, 7.4], axes(TV), { tex: folds'],
 ['[3.6, 2.3, 5.6]','[3.2, 2.1, 5.6]'],
 ['[2.4, 1.1, 4.4]','[1.5, 0.8, 2.6]'],
 ['T([0, 3.9, 38.4])','T([0, 3.7, 38.8])'],
 ['[3.9, 4.0, 4.8], axes(HV), { tone: 0.1 }','[4.3, 4.4, 5.2], axes(HV), { tone: 0.1 }'],
 ['const m = T([s * 5.0, 5.4, 41.0]);','const m = T([s * 5.6, 5.6, 41.0]);'],
 ['S.cone(gh, wm(M.hair, W), a, 1.5, m, 1.7,','S.cone(gh, wm(M.hair, W), a, 1.9, m, 2.1,'],
 ['S.cone(gh, wm(M.hair, W), m, 1.7, b, 0.25,','S.cone(gh, wm(M.hair, W), m, 2.1, b, 0.3,'],
 ['[pel[0] - 36 + sw, pel[1] - 32 - fl * 2, 1.0]','[pel[0] - 41 + sw, pel[1] - 36 - fl * 2, 1.0]'],
 ['4.6, 14, 3, -0.4','4.6, 16, 3, -0.4'],
 ['[pel[0] - 22 - sw, pel[1] - 22 - fl, 1.0]','[pel[0] - 26 - sw, pel[1] - 25 - fl, 1.0]'],
]);
ed('p3b.part',[['const cx = view === "side" ? 46 : view === "up" ? 47 : 33;','const cx = view === "side" ? 47 : view === "up" ? 49 : 29;']]);
