#!/bin/sh
# сборка sol_mirage_sorcerer.ts из частей и общих блоков палача
cd "$(dirname "$0")/.."
f=umb_ash_executioner.ts
a=$(grep -n "^function relight" $f | cut -d: -f1)
b=$(grep -n "^type Sheets" $f | cut -d: -f1)
c=$(grep -n "^function fxRow" $f | cut -d: -f1)
d=$(grep -n "^/\*\*$" $f | awk -F: -v c=$(grep -n "^function buildCompare" $f | cut -d: -f1) '$1<c{l=$1} END{print l}')
{
cat _partsg/p1a.part _partsg/p1b.part _partsg/p1c.part _partsg/p1z.part _partsg/p2.part _partsg/p3.part
cat <<'EOF'

// ---------------- листы, проверки, монтажи ----------------
function animSheets(only?: MirAnim[], maxFrames = 99): { img: Record<MirAnim, PC>; emis: Record<MirAnim, PC> } {
  const img = {} as Record<MirAnim, PC>, emis = {} as Record<MirAnim, PC>;
  for (const [a, d] of ANIM_ORDER) {
    const I = new PC(N * d.n, FH * 3), E = new PC(N * d.n, FH * 3);
    if (!only || only.includes(a)) VIEWS.forEach((v, row) => POSES[a](v).slice(0, Math.min(d.n, maxFrames)).forEach((p, i) => {
      const r = renderMir(v, p);
      I.blit(r.img, i * N, row * FH);
      E.blit(r.emis, i * N, row * FH);
    }));
    img[a] = I;
    emis[a] = E;
  }
  return { img, emis };
}
EOF
sed -n "${a},${b}p" $f
sed -n "${c},$((d-1))p" $f
cat _partsg/p4.part
} | sed 's/ExecAnim/MirAnim/g; s/EXEC_ANIMS/MIR_ANIMS/g; s/EXEC_COLS/MIR_COLS/g' | sed 's/sol_mirage_sorcerer/sol_goblin_warlord/g; s/"mir-/"gob-/g; s/r45n-w-compare/r49s-w-compare/g; s/РЕФЕРЕНС 33/РЕФЕРЕНС 07/g; s/ref-33/ref-07/g; s|"33.jpg"|"07-военачальник-гоблинов.jpg"|g; s|/33.jpg|/07.jpg|g; s/ХОЗЯИН МИРАЖЕЙ/ВОЕНАЧАЛЬНИК/g; s/360,540/500,500/g' > sol_goblin_warlord.ts
