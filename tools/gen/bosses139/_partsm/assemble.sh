#!/bin/sh
# сборка cliff_minotaur_knight.ts из частей и общих блоков капеллана (sol_fallen_chaplain.ts)
cd "$(dirname "$0")/.."
f=sol_fallen_chaplain.ts
ln() { grep -n "$1" $f | head -1 | cut -d: -f1; }
a1=$(ln "^const WCACHE"); b1=$(( $(ln "^// ---------------- поза") - 1 ))
a2=$(ln "^function scaleScene"); b2=$(( $(ln "^/\*\* Сгустки теней") - 1 ))
a3=$(ln "^type Num"); b3=$(( $(ln "^/\*\* Остриё меча") - 1 ))
a4=$(ln "^const TREMBLE"); b4=$(ln "^const sv")
a5=$(ln "^function relight"); b5=$(( $(ln "^interface Assets") - 1 ))
{
cat _partsm/p1.part
sed -n "${a1},${b1}p" $f
cat _partsm/p2.part
sed -n "${a2},${b2}p" $f
cat _partsm/p3.part
echo "// ---------------- анимации ----------------"
sed -n "${a3},${b3}p" $f
sed -n "${a4},${b4}p" $f
sed -n "${a5},${b5}p" $f
cat _partsm/p4.part
cat _partsm/p5.part
} > cliff_minotaur_knight.ts
