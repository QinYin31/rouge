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
p.stats = { maxHp, might, cdMult, speed, magnet, xpMult, goldMult, armor, areaMult, crit, critDmg, damageTakenMult, regen }
p.takeDamage(amount)            // 内部处理护甲/角色减伤/无敌帧/死亡
p.addXp(n)                      // 累积升级并在 pendingLevels 从 0 变为正数时 Bus.emit('levelup')
p.pendingLevels                 // 待处理的升级数
p.weapons                       // WeaponInstance 数组
p.bonuses                       // 被动加成槽(见下),applyChoice 修改后调用 p.recalc()
```
bonuses 槽:`{mightMult, cdMult, hpFlat, hpMult, speedMult, magnetFlat, xpMult, goldMult, armorFlat, areaMult, regenFlat}`(初始 0/1)
角色特性:剑客受到伤害×0.82;道人范围×1.18且经验×1.12;游侠暴击20%且暴击伤害×1.75。

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
export function initBoss(g)        // 300s 石像守卫(2800HP/30伤害,半血狂怒);600s 无常尊者(12000HP/36伤害,66%/33%三阶段)
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
磁吸半径 60+;默认暴击 10%×1.6(游侠 20%×1.75);金币掉率 8%,Boss/精英必掉宝箱。

## 质量红线
- 手机优先:竖屏可玩、触控 ≥44px、60fps、同屏 200+ 敌人不卡
- 所有文字中文;死亡/升级/通关有明确反馈;禁止 console 报错
- 不改他人文件;不引外部资源;写完自查语法(node --check)

---

# 契约 v2:玩法升级(霓虹暗黑版)

## 1. 武器进化合成(⚔️战斗agent)
- 规则:武器达到 Lv5(满级) 且 绑定被动达到 Lv5 → 三选一里以最高权重出现金色「进化」选项(kind:'evolve', desc 写明进化名与效果);选择后该武器替换为进化形态
- 进化矩阵(武器+被动 → 超武):
  | 武器 | 绑定被动 | 进化后 |
  |---|---|---|
  | knife 飞刀 | might 力量 | 影刃风暴:8把影刃环绕持续旋转,接触高伤+强击退 |
  | wand 魔弹 | cd 专注 | 魔能洪流:高频三连追踪弹,弹幕如洪流 |
  | bow 长弓 | speed 疾风靴 | 穿云贯日:巨型贯穿箭,无限穿透+大幅击退 |
  | orb 法球 | armor 铁甲 | 星辰护臂:6颗大法球,撞击时小范围爆发 |
  | lightning 闪电 | xp 聪慧 | 雷神之怒:同屏最多9道落雷,带小范围连锁 |
  | fireball 火球 | hp 生命之心 | 炎狱爆裂:超大爆炸+灼烧地面残留火区 |
  | boomerang 回旋镖 | gold 财运 | 黄金回旋刃:3枚巨型镖环,往返双倍伤害 |
  | holy 圣水 | magnet 贪婪 | 圣光领域:跟随玩家的大型永久圣域(缓慢旋转) |
  | shield 护盾 | crit 暴击之眼 | 雷霆壁垒:冲击环频率翻倍+环缘放电 |
- 新增被动 `crit 暴击之眼`(icon: p_crit):暴击率 +6%/级,maxLv5(第9种被动,加入 rollChoices 与商店?只进升级池,不进商店)
- 进化选项出现时必须独占一档(另两档普通);未满足条件不出现
-进化后 icon 用 `w_<id>_evo` 命名规则,精灵名清单见美术v2

## 2. 武器协同联动(⚔️战斗agent)
实现轻量元素状态系统(敌人身上 status: burn/wet,秒数):
- 火球/炎狱 命中 → 施加 burn(3s, 每秒灼烧DOT, 火焰小粒子)
- holy 圣水/圣光领域 → 施加 wet(3s, 水花粒子)
- **蒸汽爆发**:同时带 burn+wet 的敌人立即引爆(范围90px AoE, 伤害=该敌最大HP×8%+30, 白色蒸汽大粒子+震屏2)
- **感电连锁**:闪电击中 wet 敌人 → 电弧跳跃至 140px 内最多3个敌人(60%伤害, 画青色电弧粒子连线)
- **殉焰**:burn 敌人死亡 → 留下 2s 小型火区(半径40, 持续伤害)
- 联动发生时 g.spawnText 提示(如「蒸汽爆发!」青色),节流避免刷屏

## 3. 冲刺闪避(🧠主agent核心 + 🖥️UI按钮)
- Input.requestDash() 供按钮和电脑 Space 键调用;键盘双击方向键(250ms内)自动请求
- Player:向当前移动方向冲刺 0.18s、速度×4.5,冲刺期间无敌帧+可穿越敌人;冷却 3×p.stats.cdMult 秒
- 拖尾残影粒子由 player 自己发;HUD 需要冷却状态 → p.dashCd() 返回剩余秒数
- 疾风靴被动每级使冲刺冷却 -4%(战斗agent在 speed 被动 desc 注明「并减少冲刺冷却」)

## 4. 流畅性(🧠主agent)
- engine 新增 `g.inView(x,y,margin=40)`:视口剔除,所有实体 drawer 必须使用
- map.js 地图分块离屏缓存(256px chunk),不再每帧重铺 tile
- 移动端(宽<600)粒子预算减半;新增性能红线:同屏220敌+满特效桌面 60fps

## 5. 水墨武侠美术(🎨美术agent)
- 基调:宣纸米黄底(#ece5d3/#e7dfcc,带纸张杂点纹理),墨色 #2b2b2b/#4a4a4a/#6b6b5d,朱砂红印 #b03a2e,青焰 #5fb8c4/#7fd4de(参考用户提供的截图:青色灯笼鬼火、水墨圆环剑气、竹石山水、竖排书法+红印)
- 精灵:水墨笔触风——角色是黑衣侠客写意剪影(2帧走路),敌人是水墨妖物/青焰鬼火,深墨色身体+纸色高光;弹幕:青焰光点/墨色刀气;宝石→青焰火种、金币→铜钱、肉→馒头、宝箱→木匣
- 特殊精灵:lightning_v→青色雷符竖纹;zone_holy→淡墨圆环(半透明,像墨圈扩散);boss_overlord→「无常尊者」水墨魔头(56×56)
- 地面:宣纸底色图块(细微纸纹差异,几乎无对比)+ 装饰:淡墨竹/石/枯枝/墨点(亮度低,远景感)
- 发光:青焰类用预烘焙半透明光晕,禁止运行时 shadowBlur
- CSS:全套水墨风——面板宣纸底+墨色描边(粗细不均感用多重 box-shadow)+ 纸纹;标题墨字+朱砂印;按钮墨框纸底 hover 墨色加深;血条墨红、经验条墨青;升级卡宣纸卡片+墨框,进化卡加 `.evo` 类(朱砂描边+印泥脉动);#btn-dash 圆形水墨印章风按钮;摇杆淡墨圆环;竖排文字装饰(.vertical-text, writing-mode:vertical-rl)用于结算/菜单右侧书法
- 精灵名与尺寸完全不变(只换像素数据与调色板),新增:`w_knife_evo w_wand_evo w_bow_evo w_orb_evo w_lightning_evo w_fireball_evo w_boomerang_evo w_holy_evo w_shield_evo` + `p_crit`
- 图标:PWA 三枚改水墨风(宣纸底+墨色侠客剪影+朱砂印),重跑 gen-icons.ps1

## 6. 数值调整与武侠化命名(⚔️战斗agent)
- 三角色基础移速已 +18%(主agent已改);敌人接触伤害保持
- 前 120s 刷怪密度与同屏上限下调约 15%,2分钟后恢复原曲线
- **显示名武侠化**(只改 name/文案,不改任何 id;进化名同步替换):
  武器:knife=剑气 wand=御风 bow=贯日 orb=墨渊 lightning=五雷 fireball=焚天 boomerang=回风 holy=墨雨 shield=金钟罩
  进化:剑气+力量=万剑归宗 御风+专注=风卷残云 贯日+疾风=贯日长虹 墨渊+铁甲=周天星斗 五雷+聪慧=九天神雷 焚天+生命=焚天煮海 回风+财运=金刃轮回 墨雨+贪婪=墨染乾坤 金钟罩+暴击=雷动金钟
  敌人:slime=纸妖 bat=夜枭 skeleton=骨卫 spider=蛛妖 brute=金刚力士 bomber=火药童子 turtle=铁甲龟 wisp=青灯鬼火 reaper=黑无常
  Boss:boss_golem=石像守卫 boss_overlord=无常尊者
  被动:力量/沙漏(专注)/疾风靴/生命之心/磁石(拾取)/贤者帽(聪慧)/聚宝袋(财运)/铁甲/暴击之眼 → 可按武侠微调措辞,desc 中文武侠味
  被动新增 crit=暴击之眼(icon p_crit, +6%暴击/级, maxLv5, 只进升级池)
- 伤害数字配色:普通墨色 #3a3a3a、暴击朱砂红 #b03a2e、联动提示青焰 #4da7b4

---

# 契约 v2.1:手感与平衡补丁

## 1. 墨雨索敌判定优化(⚔️)
holy(墨雨)当前投掷点判定有问题;改为**朝怪物最多的方向丢**:对玩家周围 600px 内敌人按方向扇区(8~12 个)做直方图统计,选敌数最多的扇区,在扇区质心附近(且距离玩家 180~380px)落瓶;视野内无敌人时才回退随机方向。判定要在 O(n) 内完成(单次遍历分桶)。墨染乾坤(进化)保持跟随领域不变。

## 2. 剑气重做(⚔️)
knife(剑气)从「单发飞刀平A」改为**贯穿扇形长距离攻击**:朝最近敌人方向一次扇出 3~5 枚(随等级增加)剑气,每枚长射程(≥520px)、高弹速、穿透 2+(随等级+),扇形开角随数量扩大;伤害单发略降但覆盖质变。万剑归宗(进化)保持环绕风暴形态。

## 3. 升级强度有感(⚔️)
全武器每级斜率加大:每级伤害/数量/范围类增益约为原来的 1.5~2 倍,让每次升级都「明显变强」。

## 4. 后期压力软化(⚔️)
新生成敌人的血量按时间平滑成长：0s×1.00、60s×1.36、120s×1.84、300s×4.00、600s×10.00；刷怪密度后期增长放缓、同屏上限 200→180，玩家侧强度由第 3 条补偿。

## 5. 三选一刷新(🖥️ + 🧠)
每次升级三选一附带 **1 次免费刷新**:Screens.showLevelUp(choices, onPick, onReroll) 第三参可选;渲染「🔄刷新」按钮(用后隐藏,快捷键 R),onReroll 由 main 重新 roll(不消耗 pendingLevels)。

## 6. 摇杆固定底盘全速(🖥️)
移动端摇杆:按下时底盘固定在触点(**不跟手漂移**),摇杆方向即**全速移动**(输出向量恒为单位长度,无内圈减速),仅保留启动死区。

---

# 契约 v2.2:清怪爽感 + 组合推荐

## 7. 升级走「覆盖/效率」导向(⚔️)
升级选择的主体成长从「伤害%」转向「清怪效率」:每级至少一项可感知的覆盖性成长——投射物数量 +1 / 范围(爆炸半径、环绕半径、领域) / 射程 / 持续时间 / 穿透 / 冷却缩短,伤害只作次要增长(每级 +10~15%)。9 把武器逐把落实(含进化形态同步),lvText 如实描述(如「+1 道剑气」「墨域扩大 20%」「爆炸半径 +15」)。总体 DPS 仍随等级上升,但曲线以覆盖为先。已知基准:v2.1 数值表之上调整。

## 8. 组合技推荐标记(⚔️数据 + 🖥️渲染)
- `rollChoices(g)` 输出项可带 `rec` 字段(字符串,空无推荐):
  - 拥有满级未进化武器 W,且选项是该武器绑定心法(W.evo.passive)→ rec:'可进化·'+W.evo.evoName
  - 选项为新武器/武器升级,且其进化绑定心法玩家已满级(或≥4级)→ rec:'可进化·'+对应绝学名
  - 协同向:拥有焚天(或进化)时选项含墨雨/墨染乾坤 → rec:'联动·阴阳相激';拥有墨雨系时选项含五雷 → rec:'联动·感电连锁';拥有五雷时选项含墨雨系 → rec:'联动·感电连锁'
  - rec 项排序优先(置于卡列最前),rollChoices 不强制必占档,但同分时优先
- 🖥️ screens.js showLevelUp:对 rec 卡渲染右上角标「推荐·xxx」(朱砂底纸色字小签,内联兜底样式即可),并保持 evo 卡置顶逻辑共存(evo 优先于 rec)
