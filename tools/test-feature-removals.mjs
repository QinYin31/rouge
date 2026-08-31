import { readFile } from 'node:fs/promises';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const files = Object.fromEntries(await Promise.all([
  ['index', 'index.html'],
  ['main', 'js/main.js'],
  ['screens', 'js/ui/screens.js'],
  ['upgrades', 'js/game/upgrades.js'],
  ['save', 'js/core/save.js'],
  ['engine', 'js/core/engine.js'],
].map(async ([key, path]) => [key, await readFile(new URL(`../${path}`, import.meta.url), 'utf8')])));

assert(!files.index.includes('btn-shop') && !files.index.includes('screen-shop'), 'permanent upgrade UI still exists');
assert(!files.main.includes('applyShopBonuses') && !files.main.includes('setHfr') && !files.main.includes('SHOP_UPGRADES'), 'removed feature still wired in main');
assert(!files.screens.includes('buildShop') && !files.screens.includes("'hfr'") && !files.screens.includes('screen-shop'), 'removed feature still wired in screens');
assert(!files.upgrades.includes('SHOP_UPGRADES') && !files.upgrades.includes('applyShopBonuses'), 'permanent upgrade exports still exist');
assert(!files.save.includes('shop:') && !files.save.includes('hfr:'), 'removed feature remains in new save defaults');
assert(files.engine.includes('this.step = 1 / 120') && !files.engine.includes('setHfr('), '120Hz default physics is not enforced');

console.log('feature removal/default physics passed');
