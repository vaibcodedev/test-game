#!/bin/sh
# сборка sol_plague_raven.ts из частей _partsd и общих блоков военачальника (sol_goblin_warlord.ts)
cd "$(dirname "$0")/.."
g=sol_goblin_warlord.ts
{
cat _partsd/p1.part
sed -n 419,752p $g
sed -n 787,807p $g
sed -n 897,907p $g
sed -n 928,949p $g
cat _partsd/p2.part
sed -n 1173,1323p $g
cat _partsd/p3.part
sed -n 1397,1404p $g
sed -n 1439,1470p $g
} | sed 's/drawBurrow(img, pose.ghost)/drawFlock(img, emis, pose.ghost, pose.t)/' \
  | sed 's/sol_goblin_warlord/sol_plague_raven/g; s/r49s-w-compare/r59s-w-compare/g; s/РЕФЕРЕНС 07/РЕФЕРЕНС 09/g; s/ВОЕНАЧАЛЬНИК/ВОРОН-ДОКТОР/g; s/УДАР КОПЬЁМ | ХИТИНОВЫЙ ВАЛ | ПОДКОП/УДАР ПОСОХОМ | УДАР КРЫЛА | ПИКИРОВАНИЕ | ВЗЛЁТ (СТАЯ) | ПРИЗЕМЛЕНИЕ/; s/, 1500)/, 1950)/' > sol_plague_raven.ts
sed -i 's/dy = -3 \* k; dy <= 3 \* k/dy = -6 * k; dy <= 6 * k/; s/dx = -3 \* k; dx <= 3 \* k/dx = -6 * k; dx <= 6 * k/; s/(3.2 \* k)/(6.4 * k)/; s/0.035 \*/0.05 */' sol_plague_raven.ts
