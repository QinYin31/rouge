import { rollChoices } from '../js/game/upgrades.js';
import { makeWeapon } from '../js/game/weapons.js';

// 场景③:拥有焚天 lv1 → 墨雨卡应带 rec:'联动·阴阳相激'
const gA = {
  player: { weapons: [makeWeapon('fireball')], stats: { hp: 1, maxHp: 100 } },
  passiveLv: {},
};
let seen = 0, recHits = 0, samples = [];
for (let i = 0; i < 600; i++) {
  for (const c of rollChoices(gA)) {
    if (c.name === '墨雨') {
      seen++;
      if (c.rec) { recHits++; if (samples.length < 2) samples.push(c.rec); }
      break;
    }
  }
}
console.log('联动场景: 墨雨出现', seen, '次, 带rec', recHits, '次', JSON.stringify(samples));

// 场景②:沙漏(cd)4级 → 魔弹新武器卡应带 rec:'可进化·风卷残云'
const gB = {
  player: { weapons: [makeWeapon('knife')], stats: { hp: 1, maxHp: 100 } },
  passiveLv: { cd: 4 },
};
let seen2 = 0, recHits2 = 0, samples2 = [];
for (let i = 0; i < 600; i++) {
  for (const c of rollChoices(gB)) {
    if (c.kind === 'newWeapon' && c.id === 'wand') {
      seen2++;
      if (c.rec) { recHits2++; if (samples2.length < 2) samples2.push(c.rec); }
      break;
    }
  }
}
console.log('进化场景: 魔弹卡出现', seen2, '次, 带rec', recHits2, '次', JSON.stringify(samples2));

// 场景①:剑气 lv5 + 力量 5 → 必出进化卡 + 力量卡带 rec
const gC = {
  player: { weapons: [makeWeapon('knife')], stats: { hp: 1, maxHp: 100 } },
  passiveLv: { might: 5 }, save: null,
};
gC.player.weapons[0].lv = 5;
let evo = 0, mightRec = 0;
for (let i = 0; i < 300; i++) {
  const cs = rollChoices(gC);
  if (cs.some(c => c.kind === 'evolve')) evo++;
  const m = cs.find(c => c.kind === 'passive' && c.id === 'might');
  if (m && m.rec) mightRec++;
}
console.log('进化场景: 300抽进化卡出现', evo, '次, 力量卡带rec', mightRec, '次');
