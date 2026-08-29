// 《像素幸存者》主入口:装配全部模块、场景流转
import { Engine, Bus } from './core/engine.js';
import { Camera } from './core/camera.js';
import { Input } from './core/input.js';
import { Save } from './core/save.js';
import { SFX } from './core/audio.js';
import { bake } from './sprites.js';
import { Player, CHARACTERS } from './game/player.js';
import { initMap } from './game/map.js';
import { initParticles } from './game/particles.js';
import { initCombat } from './game/enemies.js';
import { initSpawner, setEndless } from './game/spawner.js';
import { initBoss } from './game/boss.js';
import { initPickups } from './game/pickups.js';
import { rollChoices, applyChoice, applyShopBonuses, SHOP_UPGRADES } from './game/upgrades.js';
import { makeWeapon } from './game/weapons.js';
import { HUD } from './ui/hud.js?r=8';
import { Screens } from './ui/screens.js';
import { Joystick } from './ui/joystick.js';

const canvas = document.getElementById('game');
const engine = new Engine(canvas);
engine.save = Save;
window.__g = engine; // 调试句柄(测试/排查用)
const cam = new Camera();
engine.cam = cam;
const SHOP = new Map(SHOP_UPGRADES.map(u => [u.id, u]));

Save.load();
bake();
Input.init();
SFX.init();
Joystick.init(engine);
HUD.init(engine);
Screens.init(engine);
initParticles(engine);
initMap(engine);
initCombat(engine);
initSpawner(engine);
initBoss(engine);
initPickups(engine);

// 每帧即使暂停也刷新 HUD
engine.addAlways(() => HUD.update());
// 玩家绘制层(战斗模块只画敌人/弹幕)
engine.addDrawer('player', ctx => { if (engine.player) engine.player.draw(ctx); });

let inRun = false;
let lastChar = 'knight';

// ---------- 音效/反馈事件 ----------
Bus.on('sfx', name => SFX.play(name));
Bus.on('hurt', dmg => {
  SFX.play('hurt');
  if (Save.data.settings.shake) engine.shake(5, 0.25);
  const v = document.getElementById('vignette');
  v.classList.remove('hidden');
  clearTimeout(v._t); v._t = setTimeout(() => v.classList.add('hidden'), 220);
});
Bus.on('boss-spawn', ({ name }) => {
  SFX.play('boss');
  if (Save.data.settings.shake) engine.shake(8, 0.6);
  engine.spawnText(engine.player.x, engine.player.y - 60, name + ' 出现!', { color: '#e43b44', size: 24, life: 2 });
});

// ---------- 升级三选一(含 1 次免费刷新) ----------
Bus.on('levelup', () => {
  SFX.play('levelup');
  engine.pause();
  showLevelUpOnce(false);
});
function showLevelUpOnce(rerolled) {
  const choices = rollChoices(engine);
  Screens.showLevelUp(choices, c => {
    applyChoice(engine, c);
    engine.player.pendingLevels--;
    if (engine.player.pendingLevels > 0) showLevelUpOnce(false);
    else { Screens.hide(); engine.resume(); }
  }, () => {
    if (rerolled) return; // 每次升级仅 1 次刷新
    showLevelUpOnce(true);
  });
}

// ---------- 结算 ----------
Bus.on('runend', ({ victory }) => endRun(victory));

function endRun(victory) {
  if (!inRun) return;
  inRun = false;
  engine.pause();
  HUD.show(false); // 隐藏局内HUD,避免“满血倒下”的矛盾观感
  SFX.play(victory ? 'victory' : 'death');
  const s = engine.stats, d = Save.data;
  d.gold += s.gold;
  d.totalRuns++; d.totalKills += s.kills;
  const runTime = Math.floor(engine.time);
  if (runTime > d.best.time) d.best.time = runTime;
  if (s.kills > d.best.kills) d.best.kills = s.kills;
  if (engine.player.level > d.best.level) d.best.level = engine.player.level;
  if (victory) d.best.victory = true;
  Save.commit();
  Screens.showResult({ time: runTime, kills: s.kills, level: engine.player.level, gold: s.gold }, {
    victory,
    endless: victory,
    onAgain: () => startRun(lastChar),
    onEndless: () => { setEndless(engine); inRun = true; HUD.show(true); Screens.hide(); engine.resume(); },
    onMenu: () => { engine.reset(); showMenu(); },
  });
}

// ---------- 场景 ----------
function showMenu() {
  inRun = false;
  HUD.show(false);
  Screens.buildMenu({
    onPlay: () => {
      SFX.play('click');
      Screens.buildSelect({
        onPick: (id, unlocked) => { if (unlocked) startRun(id); else SFX.play('no'); },
        onBack: () => showMenu(),
      });
    },
    onShop: () => { SFX.play('click'); openShop(); },
    onToggle: (k, v) => applySetting(k, v),
  });
}

function openShop() {
  Screens.buildShop({
    onBuy: id => {
      const d = Save.data, u = SHOP.get(id), lv = d.shop[id] || 0;
      if (lv < u.max && d.gold >= u.cost[lv]) {
        d.gold -= u.cost[lv];
        d.shop[id] = lv + 1;
        Save.commit(); SFX.play('coin');
        openShop(); // 刷新
      }
    },
    onBack: () => showMenu(),
  });
}

function startRun(charId) {
  SFX.play('click');
  lastChar = charId;
  engine.reset();
  const p = new Player(charId);
  applyShopBonuses(p);
  p.weapons.push(makeWeapon(p.char.weapon));
  engine.player = p;
  engine.passiveLv = { might: 0, cd: 0, speed: 0, hp: 0, magnet: 0, xp: 0, gold: 0, armor: 0 };
  cam.snap(p.x, p.y);
  inRun = true;
  Screens.hide();
  HUD.show(true);
  engine.resume();
  engine.start();
  engine.spawnText(0, -50, '活下来!', { color: '#fee761', size: 26, life: 2 });
}

function applySetting(k, v) {
  Save.data.settings[k] = v; Save.commit();
  if (k === 'sfx') SFX.setSfx(v);
  if (k === 'music') SFX.setMusic(v);
}

// ---------- 暂停按钮 / 失焦自动暂停 ----------
function openPause() {
  engine.pause();
  Screens.buildPause({
    onResume: () => { Screens.hide(); engine.resume(); },
    onQuit: () => endRun(false),
    onToggle: applySetting,
  });
}
document.getElementById('btn-pause').addEventListener('click', () => {
  if (!inRun || engine.paused > 0) return;
  SFX.play('click');
  openPause();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && inRun && engine.paused === 0) openPause();
});

SFX.setSfx(Save.data.settings.sfx);
SFX.setMusic(Save.data.settings.music);
showMenu();
engine.start();

// 调试:?cheat 快速获得经验 ?fast 时间加速(测试升级/Boss/通关流程用)
if (location.search.includes('dev')) {
  window.addEventListener('error', e => {
    let d = document.getElementById('err-trap');
    if (!d) {
      d = document.createElement('div');
      d.id = 'err-trap';
      d.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:99999;background:rgba(60,0,0,.92);color:#fff;font-size:11px;max-width:90vw;white-space:pre-wrap;padding:4px 6px;';
      document.body.appendChild(d);
    }
    d.textContent += 'ERR: ' + e.message + ' @line' + e.lineno + '\n';
  });
}
if (location.search.includes('cheat')) {
  setInterval(() => {
    if (inRun && engine.player && engine.paused === 0) engine.player.addXp(10 + engine.player.level * 3);
  }, 1000);
}
if (location.search.includes('fast')) {
  setInterval(() => {
    if (inRun && engine.paused === 0) engine.time += 1.2;
  }, 100);
}

// PWA:注册 Service Worker(file:// 或 ?dev 下跳过)
if ('serviceWorker' in navigator && location.protocol.startsWith('http') && !location.search.includes('dev')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
