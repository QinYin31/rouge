# 《像素幸存者》模块契约(所有 agent 必读)

零构建原生 JS(ES Modules)游戏。**禁止引入任何外部资源/CDN/字体文件**,全中文 UI。
**只能修改自己名下的文件**。如需其他模块的能力,只能按本契约调用,不得越界改文件。

## 运行架构
- 世界坐标:像素单位。相机跟随玩家,zoom = clamp(min(w,h)/500, 0.7, 2.4)。
- 固定步长 60Hz 更新;`ctx` 已应用相机变换后交给各 layer 绘制。
- 游戏上下文对象 **g 即 Engine 实例**,所有模块函数第一个参数都是 g。

## Engine (js/core/engine.js) API — 已实现,不可修改
```js
g.w, g.h            // 画布 CSS 尺寸
g.time              // 本局秒数
g.player            // Player 实例
g.stats             // {kills, gold, level, dmg}
g.boss              // 当前 Boss 引用或 null(HUD 据此显示血条)
g.enemies, g.projectiles, g.zones, g.pickups   // 实体数组(swap-remove,可直接遍历)
g.grid              // SpatialHash(每帧重建,只装敌人): g.grid.query(x,y,r,out) -> out 填充
g.cam               // Camera: g.cam.follow(px,py,dt); g.cam.shake(mag,dur)
g.addEnemy(e) / g.addProjectile(p) / g.addZone(z) / g.addPickup(p)
g.spawnText(x,y,str,{color,size,crit})         // 伤害/提示数字
g.addParticles(x,y,{n,color,speed,life,size,grav,spread})
g.addUpdater(fn(dt))           // 每帧更新(暂停时不调用)
g.addDrawer(layer,fn(ctx))     // layer: 'ground'|'zones'|'under'|'enemies'|'player'|'projectiles'|'fx'|'texts'
g.addReset(fn)                 // 开新局时调用(清空自己模块的状态)
g.pause()/g.resume()           // 计数式;g.paused 为 true 时更新暂停
g.remove(arr, i)               // swap-remove 工具
Bus.on(evt,fn) / Bus.emit(evt,data)
// 事件:'levelup'(玩家升级,内部已暂停游戏流程由 main 控制) 'runend'{victory} 'hurt' 'boss-spawn'{name}
```

## Player (js/game/player.js) — 已实现,不可修改
```js
p.x,p.y,p.hp,p.level,p.xp,p.facing(1/-1),p.animT,p.moving,p.iframes
p.stats = { maxHp, might, cdMult, speed, magnet, xpMult, goldMult, armor, areaMult, crit, critDmg, regen }
p.takeDamage(amount)            // 内部处理护甲/无敌帧/死亡
p.addXp(n)                      // 升级时 pendingLevels++ 并 Bus.emit('levelup')
p.pendingLevels                 // 待处理的升级数
p.weapons                       // WeaponInstance 数组
p.bonuses                       // 被动加成槽(见下),applyChoice 修改后调用 p.recalc()
```
bonuses 槽:`{mightMult, cdMult, hpFlat, hpMult, speedMult, magnetFlat, xpMult, goldMult, armorFlat, areaMult, regenFlat}`(初始 0/1)

## 美术模块 (js/sprites.js) — 🎨美术agent 名下
```js
export const SCALE = 3;                      // 全局绘制放大倍数
export function bake()                       // 启动时调用一次,烘焙全部精灵
export function has(name) -> bool
export function drawSprite(ctx, name, cx, cy, o)  // 以世界坐标 cx,cy 为中心绘制
// o: {flip:bool, angle:number, alpha:0-1, tint:'#hex 或 null', frame:备用}
export function spriteSize(name) -> {w,h}    // 原始像素尺寸
```
要求:字符点阵(如 `"..11.."`)+调色板 → 离屏 canvas;`drawSprite` 用 drawImage 缩放,禁止平滑。
**必需精灵名**(尺寸为原始像素):
- 英雄(16×16,各 2 帧走路):`hero_knight_0/1` `hero_mage_0/1` `hero_ranger_0/1`
- 敌人:`slime`(14) `bat`(14) `skeleton`(16) `spider`(14) `brute`(20) `bomber`(14) `turtle`(18) `wisp`(12) `reaper`(20·精英) `boss_golem`(40·小Boss) `boss_overlord`(56·最终Boss)
- 武器弹体/表现:`w_knife`(10) `w_bolt`(8) `w_arrow`(12) `w_orb`(10) `w_fireball`(12) `w_boomerang`(12) `w_flask`(10) `w_shield`(16) `lightning_v`(8×28 竖向闪电) `zone_holy`(48 半透明光圈,可 alpha)
- 拾取:`gem_b/gem_g/gem_r`(8) `coin`(8) `meat`(12) `magnet`(12) `chest`(16)
- 地面图块:`tile_grass_0/1/2` `tile_dirt`(各 16) 装饰:`dec_rock` `dec_flower` `dec_bones` `dec_stump`(16)
- 图标(商店/被动,16×16):`p_might` `p_cd` `p_speed` `p_hp` `p_magnet` `p_xp` `p_gold` `p_armor`
- 其他:`hero_face_knight/mage/ranger`(16×16 用于选人卡)

## 战斗模块 — ⚔️战斗agent 名下
```js
// js/game/weapons.js
export const WEAPON_ORDER = ['knife','wand','bow','orb','lightning','fireball','boomerang','holy','shield'];
export const WEAPONS = { id: { name:'中文名', icon:'w_knife', maxLv:5, base:{...}, lvText:[5条升级描述] } };
export function makeWeapon(id) -> { id, lv, cd, timer, update(dt, g) }   // 对象带 update 即可
// 武器逻辑约定:用 p.stats.might/cdMult/areaMult/crit;伤害经 damageEnemy()
// 投射物约定:{x,y,vx,vy,r,dmg,life,pierce,rot,sprite,fromEnemy:false,hitIds:Set}
//   加入 g.addProjectile(p);enemies 模块负责判定命中并结算
// 敌方弹幕用 {fromEnemy:true} 由 enemies 模块判定对玩家伤害

// js/game/enemies.js
export const ENEMY_TYPES = { slime:{name,sprite,hp,speed,dmg,r,xp,coinP} , ...9种+boss };
export function spawnEnemy(g, typeId, x, y, o={hpMult,dmgMult,elite}) -> e
export function damageEnemy(g, e, amount, o={kx,ky,crit})   // 唯一伤害入口:数字/闪白/击退/死亡掉落
export function initCombat(g)      // 注册敌人更新/绘制/弹幕命中判定(updater+drawer 'enemies'/'projectiles')
// 敌人对象:{x,y,type,hp,maxHp,speed,dmg,r,flashT,kx,ky,elite,id}
// 命中玩家:p.takeDamage(e.dmg)(带 0.5s 每敌接触冷却)

// js/game/spawner.js
export function initSpawner(g)     // updater:按时间曲线成波刷怪(环带半径=视野外缘),难度递增
export function setEndless(g)      // 通关后无尽模式曲线

// js/game/boss.js
export function initBoss(g)        // 300s 小Boss boss_golem;600s 最终 boss_overlord
// 最终 Boss 死亡 -> Bus.emit('runend',{victory:true});小Boss掉宝箱。Boss 血条写 g.boss

// js/game/upgrades.js
export const PASSIVES = { might:{name:'力量',icon:'p_might',maxLv:5,desc:lv描述}, ...8种 };
export const SHOP_UPGRADES = [ {id:'might',name:'力量',desc:'+5%/级',icon:'p_might',max:5,cost:[...递增]}, ...8种 ] // cost 数组各等级价格
export function rollChoices(g) -> [{kind:'newWeapon'|'weapon'|'passive'|'gold', id, name, desc, icon}] // 3个不同项;不修改等级,只读
export function applyChoice(g, c) // 被动需 g.passiveLv[id]++ 并把加成写入 p.bonuses -> p.recalc()
export function applyShopBonuses(p) // 开局读取 Save.data.shop 应用永久强化到 p.bonuses 后 recalc()
```

## 引擎补充
- `g.addAlways(fn)`:每帧调用(即使暂停),HUD 用
- 事件补充:`'enemy-death'(e)`(敌人死亡,pickups 监听掉落)、`'sfx'(name)`(任意模块发音效)
- 商店数值约定(与 PASSIVES 一致方向):might+4%/级 hp+8/级 speed+2%/级 cd-2%/级 magnet+8/级 xp+3%/级 gold+5%/级 armor+1/级(护甲商店 max2)

## UI 模块 — 🖥️UI agent 名下
```js
// js/core/save.js
export const Save = { load(), data, commit(), reset() };
// data: {v,gold,chars:['knight'],shop:{might:0,...8},settings:{sfx,music,shake},best:{time,kills,level,victory},totalRuns}
// localStorage key: 'pxs_save'

// js/core/audio.js
export const SFX = { init(), play(name), setSfx(b), setMusic(b) };
// name: shoot hit hurt pickup coin levelup chest boss death victory click no

// js/ui/joystick.js
export const Joystick = { init(g), vector:{x,y,active} };  // 动态摇杆:触点即中心,拖动偏移;写入 Input.setTouch

// js/ui/hud.js
export const HUD = { init(g), update() };   // 每帧由 main 调用;绑定 CONTRACT 指定 DOM id

// js/ui/screens.js
export const Screens = {
  init(g), show(id), hide(), current,
  buildMenu(cb:{onPlay,onShop,onToggle})         // 主菜单含最佳纪录+3个设置开关
  buildSelect(cb:{onPick(charId),onBack})        // 角色卡:已解锁高亮/价格与解锁提示
  buildShop(cb:{onBack,onBuy(id)})               // 商店列表从 SHOP_UPGRADES 生成,买后回调刷新
  buildPause(cb:{onResume,onQuit,onToggle})
  showLevelUp(choices, onPick)                   // 三选一卡片,选择后回调
  showResult(stats, {victory,endless,onAgain,onMenu,onEndless})
};
```
DOM id 已在 index.html 中全部定义,样式类以 css/style.css 现有类为准(🎨美术agent 拥有该文件,UI agent 不得改 CSS,只用已有类名与 id)。

## 玩法数值基线(战斗agent 可调优)
单局 600s;玩家 speed≈120、基础 HP 80-120;敌人 8 种常规+精英变体(hp×6、体型×1.3、掉宝箱);
经验:gem 1/5/25(蓝/绿/红),升级需求 `Math.floor(6+lv*4+lv*lv*0.35)`;
磁吸半径 60+;伤害数字暴击 10% ×1.6;金币掉率 8%,Boss/精英必掉宝箱。

## 质量红线
- 手机优先:竖屏可玩、触控 ≥44px、60fps、同屏 200+ 敌人不卡
- 所有文字中文;死亡/升级/通关有明确反馈;禁止 console 报错
- 不改他人文件;不引外部资源;写完自查语法(node --check)
