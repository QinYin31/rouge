import { Player } from '../js/game/player.js?v=17';
import { initCombat, ENEMY_TYPES, combatState } from '../js/game/enemies.js?v=17';
import { initBoss } from '../js/game/boss.js?v=17';
import { SpatialHash } from '../js/core/engine.js?v=17';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

// 角色特性与 Boss 阶段行为测试
const knight = new Player('knight');
const mage = new Player('mage');
const ranger = new Player('ranger');
assert(knight.stats.damageTakenMult === 0.82, 'knight damage reduction mismatch');
assert(mage.stats.areaMult === 1.18 && mage.stats.xpMult === 1.12 && mage.stats.cdMult === 0.85, 'mage trait mismatch');
assert(ranger.stats.crit === 0.20 && ranger.stats.critDmg === 1.75 && ranger.stats.magnet === 90, 'ranger trait mismatch');
knight.hp = knight.stats.maxHp;
knight.takeDamage(51);
assert(knight.hp === 79, `knight mitigation mismatch: ${knight.hp}`);

console.log('role stats passed', {
  knight: { hp: knight.stats.maxHp, damageTakenMult: knight.stats.damageTakenMult },
  mage: { areaMult: mage.stats.areaMult, xpMult: mage.stats.xpMult, cdMult: mage.stats.cdMult },
  ranger: { crit: ranger.stats.crit, critDmg: ranger.stats.critDmg, magnet: ranger.stats.magnet },
});

function makeHarness() {
  const updates = [], resets = [];
  const g = {
    enemies: [], projectiles: [], zones: [], pickups: [], qbuf: [], grid: new SpatialHash(80),
    player: { x: 0, y: 0, dash: { cd: 0 }, stats: { armor: 0, crit: 0, critDmg: 1.6, cdMult: 1 }, update() {}, takeDamage() {} },
    cam: { zoom: 1, follow() {} }, w: 1280, h: 720,
    _finalBoss: false, _endless: false, boss: null, stats: { kills: 0, dmg: 0 },
    addUpdater(fn) { updates.push(fn); }, addReset(fn) { resets.push(fn); }, addDrawer() {},
    addEnemy(e) { this.enemies.push(e); }, addProjectile(p) { this.projectiles.push(p); },
    addParticles() {}, spawnText() {}, addPickup(p) { this.pickups.push(p); }, addZone(z) { this.zones.push(z); },
    shake() {}, inView() { return true; }, remove(a, i) { a[i] = a[a.length - 1]; a.pop(); },
  };
  initCombat(g);
  initBoss(g);
  return { g, updates, resets };
}

const { g, updates, resets } = makeHarness();
assert(updates.length === 2, `unexpected updater count: ${updates.length}`);
for (const reset of resets) reset();
combatState.runActive = true;

g.time = 300;
updates[1]();
const golem = g.boss;
assert(golem && golem.type === 'boss_golem', 'golem did not spawn');
assert(Math.abs(golem.maxHp - 3080) < 0.01, `golem hp mismatch: ${golem.maxHp}`);
assert(Math.abs(golem.dmg - 38) < 0.01, `golem damage mismatch: ${golem.dmg}`);
updates[0](1 / 60);
const golemShots = g.projectiles.length;
golem.hp = golem.maxHp * 0.49;
updates[0](1 / 60);
const golemPhaseShots = g.projectiles.length - golemShots;
assert(golem.bossPhase === 2, `golem phase mismatch: ${golem.bossPhase}`);
assert(golemPhaseShots > 0, 'golem phase transition did not emit projectiles');

for (const reset of resets) reset();
combatState.runActive = true;
g.enemies.length = 0;
g.projectiles.length = 0;
g.boss = null;
g.time = 600;
updates[1]();
const overlord = g.boss;
assert(overlord && overlord.type === 'boss_overlord', 'overlord did not spawn');
assert(Math.abs(overlord.maxHp - 13800) < 0.01, `overlord hp mismatch: ${overlord.maxHp}`);
assert(Math.abs(overlord.dmg - 39.6) < 0.01, `overlord damage mismatch: ${overlord.dmg}`);
updates[0](1 / 60);
const phaseOneAdds = g.enemies.length;
const phaseOneShots = g.projectiles.length;
overlord.hp = overlord.maxHp * 0.64;
updates[0](1 / 60);
assert(overlord.bossPhase === 2, `overlord phase mismatch: ${overlord.bossPhase}`);
assert(g.enemies.length >= phaseOneAdds + 3, 'overlord phase transition did not summon adds');
assert(g.projectiles.length > phaseOneShots, 'overlord phase transition did not emit projectiles');

console.log('boss behavior passed', {
  golem: { hp: golem.maxHp, phase: golem.bossPhase, phaseShots: golemPhaseShots },
  overlord: { hp: overlord.maxHp, phase: overlord.bossPhase, adds: g.enemies.length - phaseOneAdds, shots: g.projectiles.length - phaseOneShots },
});
