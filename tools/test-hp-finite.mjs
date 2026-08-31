import { Player } from '../js/game/player.js?v=17';
import { ENEMY_TYPES, MAX_ENTITY_HP, spawnEnemy, damageEnemy } from '../js/game/enemies.js?v=17';
import { bossHpAt } from '../js/game/boss.js?v=17';
import { applyChoice } from '../js/game/upgrades.js?v=17';
import { SpatialHash } from '../js/core/engine.js?v=17';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function makeHarness() {
  return {
    enemies: [], projectiles: [], zones: [], pickups: [], qbuf: [], grid: new SpatialHash(80),
    player: null, stats: { kills: 0, dmg: 0 },
    addEnemy(e) { this.enemies.push(e); },
    addParticles() {}, spawnText() {}, addPickup(p) { this.pickups.push(p); }, addZone(z) { this.zones.push(z); },
    shake() {},
  };
}

const g = makeHarness();
const baseHp = ENEMY_TYPES.slime.hp;
const invalidSpawn = spawnEnemy(g, 'slime', 0, 0, { hpOverride: Number.NaN });
assert(Number.isFinite(invalidSpawn.hp) && Number.isFinite(invalidSpawn.maxHp), 'NaN spawn HP leaked');
assert(invalidSpawn.hp === baseHp && invalidSpawn.maxHp === baseHp, `invalid spawn fallback mismatch: ${invalidSpawn.hp}`);

const overflowSpawn = spawnEnemy(g, 'slime', 0, 0, { hpOverride: Number.POSITIVE_INFINITY });
assert(overflowSpawn.hp === MAX_ENTITY_HP && overflowSpawn.maxHp === MAX_ENTITY_HP, `overflow HP was not capped: ${overflowSpawn.hp}`);
const cappedSpawn = spawnEnemy(g, 'slime', 0, 0, { hpOverride: Number.MAX_VALUE });
assert(cappedSpawn.hp === MAX_ENTITY_HP && cappedSpawn.maxHp === MAX_ENTITY_HP, `large HP was not capped: ${cappedSpawn.hp}`);

const bossOverflowHp = bossHpAt('boss_overlord', Number.MAX_VALUE);
assert(Number.isFinite(bossOverflowHp) && bossOverflowHp === MAX_ENTITY_HP, `boss overflow HP mismatch: ${bossOverflowHp}`);

const malformed = spawnEnemy(g, 'boss_overlord', 0, 0, { hpOverride: 100 });
malformed.hp = Number.POSITIVE_INFINITY;
malformed.maxHp = Number.POSITIVE_INFINITY;
damageEnemy(g, malformed, Number.POSITIVE_INFINITY, { crit: false });
assert(Number.isFinite(malformed.hp) && Number.isFinite(malformed.maxHp), 'Infinity damage produced non-finite HP');
assert(malformed.hp < malformed.maxHp, 'malformed enemy did not take damage');

const nanDamage = spawnEnemy(g, 'slime', 0, 0, { hpOverride: 2 });
damageEnemy(g, nanDamage, Number.NaN, { crit: false });
assert(nanDamage.hp === 1 && Number.isFinite(nanDamage.hp), `NaN damage fallback mismatch: ${nanDamage.hp}`);

const player = new Player('knight');
player.takeDamage(Number.NaN);
assert(player.hp === 119 && Number.isFinite(player.hp), `player NaN damage fallback mismatch: ${player.hp}`);

const corruptedPlayer = new Player('knight');
corruptedPlayer.hp = Number.NaN;
corruptedPlayer.takeDamage(10);
assert(Number.isFinite(corruptedPlayer.hp) && corruptedPlayer.hp < corruptedPlayer.stats.maxHp, 'corrupted player HP stayed non-finite');

const upgradePlayer = new Player('knight');
upgradePlayer.hp = Number.NaN;
const upgradeHarness = { player: upgradePlayer, passiveLv: {}, addParticles() {}, spawnText() {} };
applyChoice(upgradeHarness, { kind: 'passive', id: 'hp' });
assert(Number.isFinite(upgradePlayer.hp) && upgradePlayer.hp === upgradePlayer.stats.maxHp, 'HP upgrade did not repair corrupted player HP');

console.log('HP finite/overflow regression passed', {
  cap: MAX_ENTITY_HP,
  bossOverflowHp,
  invalidSpawnHp: invalidSpawn.hp,
  playerHpAfterNaN: player.hp,
  corruptedPlayerHp: corruptedPlayer.hp,
});
