#!/bin/sh
# сборка sol_mirage_sorcerer.ts из частей и общих блоков палача
cd "$(dirname "$0")/.."
f=umb_ash_executioner.ts
a=$(grep -n "^function relight" $f | cut -d: -f1)
b=$(grep -n "^type Sheets" $f | cut -d: -f1)
c=$(grep -n "^function fxRow" $f | cut -d: -f1)
d=$(grep -n "^/\*\*$" $f | awk -F: -v c=$(grep -n "^function buildCompare" $f | cut -d: -f1) '$1<c{l=$1} END{print l}')
{
cat _partsv/p1a.part _partsv/p1b.part _partsv/p1c.part _partsv/p1z.part _partsv/p2.part _partsv/p3.part
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
cat _partsv/p4.part
} | sed 's/ExecAnim/MirAnim/g; s/EXEC_ANIMS/MIR_ANIMS/g; s/EXEC_COLS/MIR_COLS/g' | sed 's/sol_mirage_sorcerer/umb_crimson_vampire/g; s/"mir-/"vam-/g; s/r45n-w-compare/r45n-e-compare/g; s/РЕФЕРЕНС 33/РЕФЕРЕНС 11/g; s/ref-33/ref-11/g; s|/33.jpg|/11.jpg|g; s|"33.jpg"|"11.jpg"|g; s/ХОЗЯИН МИРАЖЕЙ/ВАМПИР/g; s/360,540/450,500/g' > umb_crimson_vampire.ts
