import { ENEMY_TYPES, spawnEnemy } from '../js/game/enemies.js?v=17';
import { hpMultAt, eliteHpMultAt, minOrdinaryHpAt, spawnHpMultAt } from '../js/game/spawner.js?v=17';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const times = [0, 60, 120, 300, 450, 600, 900];
const normalCurve = times.map(hpMultAt);
const eliteCurve = times.map(eliteHpMultAt);
for (let i = 1; i < times.length; i++) {
  assert(normalCurve[i] > normalCurve[i - 1], `normal curve is not increasing at ${times[i]}s`);
  assert(eliteCurve[i] > eliteCurve[i - 1], `elite curve is not increasing at ${times[i]}s`);
}
assert(normalCurve[5] >= 27.9, `normal 600s multiplier too low: ${normalCurve[5]}`);
assert(normalCurve[6] > normalCurve[5], 'normal curve must continue growing after 600s');
assert(eliteCurve[5] < normalCurve[5], 'elite base curve should remain a separate balance curve');
assert(eliteCurve[6] > eliteCurve[5], 'elite curve must continue growing after 600s');

const harness = { enemies: [], addEnemy(e) { this.enemies.push(e); } };
const lateSlime = spawnEnemy(harness, 'slime', 0, 0, { hpMult: spawnHpMultAt('slime', 600) });
const lateSkeleton = spawnEnemy(harness, 'skeleton', 0, 0, { hpMult: spawnHpMultAt('skeleton', 600) });
const lateElite = spawnEnemy(harness, 'reaper', 0, 0, { hpMult: spawnHpMultAt('reaper', 600, { elite: true }), elite: true });
const lateEliteSlime = spawnEnemy(harness, 'slime', 0, 0, { hpMult: spawnHpMultAt('slime', 600, { elite: true }), elite: true });
const ordinaryIds = ['slime', 'bat', 'skeleton', 'spider', 'brute', 'bomber', 'turtle', 'wisp', 'reaper'];
const lateOrdinaryHp = Object.fromEntries(ordinaryIds.map(id => [id, ENEMY_TYPES[id].hp * spawnHpMultAt(id, 600)]));
for (const [id, hp] of Object.entries(lateOrdinaryHp)) {
  assert(hp >= 620, `late ${id} can still be removed by one hit: ${hp}`);
}
assert(lateSlime.maxHp >= minOrdinaryHpAt(600), `late slime floor missing: ${lateSlime.maxHp}`);
assert(lateSkeleton.maxHp >= minOrdinaryHpAt(600), `late skeleton floor missing: ${lateSkeleton.maxHp}`);
assert(lateElite.maxHp === ENEMY_TYPES.reaper.hp * spawnHpMultAt('reaper', 600, { elite: true }) * 6, `elite hp mismatch: ${lateElite.maxHp}`);
assert(lateElite.maxHp > ENEMY_TYPES.reaper.hp * normalCurve[5], 'elite must remain tougher than normal reaper');
assert(lateEliteSlime.maxHp > lateSlime.maxHp, 'elite low-hp enemy must remain tougher than normal enemy');
assert(spawnHpMultAt('slime', 900) > spawnHpMultAt('slime', 600), 'normal spawn multiplier stopped after 600s');
const hordeSlime = ENEMY_TYPES.slime.hp * spawnHpMultAt('slime', 600, { horde: true });
assert(hordeSlime >= minOrdinaryHpAt(600), `horde floor missing: ${hordeSlime}`);

console.log('enemy scaling passed', {
  normalCurve,
  eliteCurve,
  minLateHp: minOrdinaryHpAt(600),
  slime600: lateSlime.maxHp,
  skeleton600: lateSkeleton.maxHp,
  eliteReaper600: lateElite.maxHp,
  eliteSlime600: lateEliteSlime.maxHp,
  lateOrdinaryHp,
});
