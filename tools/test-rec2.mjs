import { rollChoices } from '../js/game/upgrades.js';
import { makeWeapon } from '../js/game/weapons.js';
// 复现浏览器状态:剑气5/御风5/贯日1/墨渊1,心法 cd=3(沙漏选过3次),未选力量
const knife = makeWeapon('knife'); knife.lv = 5;
const wand = makeWeapon('wand'); wand.lv = 5;
const bow = makeWeapon('bow');
const holy = makeWeapon('holy');
const g = {
  player: { weapons: [knife, wand, bow, holy], stats: { hp: 1, maxHp: 100 } },
  passiveLv: { cd: 3 },
};
let wandEvolve = 0, knifeEvolve = 0, recOnWand = 0, recTexts = new Set(), n = 400;
for (let i = 0; i < n; i++) {
  const cs = rollChoices(g);
  for (const c of cs) {
    if (c.kind === 'evolve') { c.id === 'wand' ? wandEvolve++ : knifeEvolve++; }
    if (c.id === 'wand' && c.rec) { recOnWand++; recTexts.add(c.rec); }
  }
}
console.log('400抽: 御风进化卡', wandEvolve, '次 / 剑气进化卡', knifeEvolve, '次');
console.log('御风卡带rec', recOnWand, '次, 文案:', JSON.stringify([...recTexts]));
