#!/bin/sh
# сборка umb_plague_priestess.ts из частей и общих блоков военачальника (sol_goblin_warlord.ts)
cd "$(dirname "$0")/.."
f=sol_goblin_warlord.ts
ln() { grep -n "$1" $f | head -1 | cut -d: -f1; }
wm_a=$(ln "^const WCACHE")
wm_b=$(( $(ln "^// ---------------- поза") - 1 ))
l2_a=$(ln "^// ---------------- 2D-слои")
l2_b=$(( $(ln "^/\*\* Подкоп") - 1 ))
ds_a=$(ln "^const colEq")
ds_b=$(( $(ln "^// ---------------- анимации") - 1 ))
h_a=$(ln "^type Num")
h_b=$(( $(ln "^/\*\* Завиток") - 1 ))
t_a=$(ln "^const TREMBLE")
t_b=$(( $(ln "^const rv") - 1 ))
s_a=$(ln "^function animSheets")
s_b=$(( $(ln "^interface Assets") - 1 ))
r_a=$(ln "^/\*\* Строка анимации")
{
cat _partsn/p1.part
sed -n "${wm_a},${wm_b}p" $f
cat _partsn/p2.part
sed -n "${l2_a},${l2_b}p" $f
sed -n "${ds_a},${ds_b}p" $f | grep -v "drawBurrow(img, pose.ghost)" | sed 's/const RIM: RGBA = \[170, 205, 245, 255\]/const RIM: RGBA = [150, 195, 245, 255]/; s/drawSigil(c, X.sigil);/void 0;/'
echo "// ---------------- анимации ----------------"
sed -n "${h_a},${h_b}p" $f
sed -n "${t_a},${t_b}p" $f
cat _partsn/p3.part
sed -n "${s_a},${s_b}p" $f > _partsn/sheets.tmp
awk 'FNR==NR{a[n++]=$0; next} /^PLACEHOLDER_SHEETS$/{for(i=0;i<n;i++)print a[i]; next} {print}' _partsn/sheets.tmp _partsn/p4.part
sed -n "${r_a},\$p" $f
} | sed 's/\.\.\.BRONZE/...BONE/; s/sol_goblin_warlord/umb_plague_priestess/g; s/ГЕРОЙ 32 · РУНОЛИТ 64 · ВОЕНАЧАЛЬНИК 64/ГЕРОЙ/g' > umb_plague_priestess.ts
rm -f _partsn/sheets.tmp
