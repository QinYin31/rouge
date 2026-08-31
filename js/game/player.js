// 玩家:属性/成长/移动/受伤/经验
import { Input } from '../core/input.js?v=17';
import { Bus } from '../core/engine.js?v=17';
import { drawSprite } from '../sprites.js?v=17';

export const CHARACTERS = {
  knight: {
    name: '剑客', weapon: 'knife', sprite: 'hero_knight', hp: 120, might: 1.0, speed: 144, armor: 1,
    damageTakenMult: 0.82,
    trait: '铁壁：受到伤害 -18%',
    desc: '一剑风流,自带 1 点护甲 · 初始武功:剑气', cost: 0,
  },
  mage: {
    name: '道人', weapon: 'wand', sprite: 'hero_mage', hp: 80, might: 0.95, speed: 137, cdMult: 0.85,
    areaMult: 1.18, xpMult: 1.12,
    trait: '灵脉：技能范围 +18%，经验获取 +12%',
    desc: '御风之术,冷却 -15% · 初始武功:御风', cost: 300,
  },
  ranger: {
    name: '游侠', weapon: 'bow', sprite: 'hero_ranger', hp: 95, might: 1.0, speed: 163, magnet: 30,
    crit: 0.20, critDmg: 1.75,
    trait: '猎心：暴击率 20%，暴击伤害 175%',
    desc: '身法迅捷、拾取范围大 · 初始武功:贯日', cost: 800,
  },
};

export class Player {
  constructor(charId) {
    const c = CHARACTERS[charId];
    this.charId = charId; this.char = c;
    this.x = 0; this.y = 0; this.facing = 1; this.animT = 0; this.moving = false;
    this.iframes = 0; this.hurtT = 0;
    this.level = 1; this.xp = 0; this.pendingLevels = 0;
    this.weapons = [];
    this.dash = { t: 0, cd: 0, dur: 0.18, dx: 1, dy: 0 };
    this.bonuses = {
      mightMult: 1, cdMult: 1, hpFlat: 0, hpMult: 1, speedMult: 1,
      magnetFlat: 0, xpMult: 1, goldMult: 1, armorFlat: 0, areaMult: 1, regenFlat: 0,
    };
    this.charBonus = {
      cdMult: c.cdMult || 1,
      magnetFlat: c.magnet || 0,
      areaMult: c.areaMult || 1,
      xpMult: c.xpMult || 1,
      damageTakenMult: c.damageTakenMult || 1,
      crit: c.crit || 0.1,
      critDmg: c.critDmg || 1.6,
    };
    this.recalc();
    this.hp = this.stats.maxHp;
  }

  recalc() {
    const b = this.bonuses, c = this.char;
    const oldMax = this.stats ? this.stats.maxHp : 0;
    const computedMaxHp = Math.round((c.hp + b.hpFlat) * b.hpMult);
    const maxHp = Number.isFinite(computedMaxHp) && computedMaxHp > 0 ? computedMaxHp : Math.max(1, c.hp);
    this.stats = {
      maxHp,
      might: c.might * b.mightMult,
      cdMult: this.charBonus.cdMult * b.cdMult,
      speed: c.speed * b.speedMult,
      magnet: 60 + this.charBonus.magnetFlat + b.magnetFlat,
      xpMult: this.charBonus.xpMult * b.xpMult, goldMult: b.goldMult,
      armor: c.armor + b.armorFlat,
      areaMult: this.charBonus.areaMult * b.areaMult,
      crit: this.charBonus.crit, critDmg: this.charBonus.critDmg,
      damageTakenMult: this.charBonus.damageTakenMult,
      regen: b.regenFlat,
    };
    if (!Number.isFinite(this.hp)) this.hp = this.stats.maxHp;
    if (oldMax && this.stats.maxHp > oldMax) this.hp += this.stats.maxHp - oldMax;
    if (this.hp > this.stats.maxHp) this.hp = this.stats.maxHp;
  }

  update(dt, g) {
    const mv = Input.move();
    this.moving = mv.x !== 0 || mv.y !== 0;

    // 冲刺:优先于普通移动;期间无敌帧+可穿越敌群
    if (this.dash.cd > 0) this.dash.cd -= dt;
    if (this.dash.t > 0) {
      this.dash.t -= dt;
      const v = this.stats.speed * 4.5;
      this.x += this.dash.dx * v * dt;
      this.y += this.dash.dy * v * dt;
      this.iframes = Math.max(this.iframes, 0.06);
      this.animT += dt;
      this._trailT = (this._trailT || 0) - dt;
      if (this._trailT <= 0) {
        this._trailT = 0.03;
        g.addParticles(this.x, this.y, { n: 2, color: '#00f0ff', speed: 15, life: 0.28, size: 4 });
      }
    } else if (Input.takeDashRequest() && this.dash.cd <= 0) {
      let dx = mv.x, dy = mv.y;
      if (!dx && !dy) { dx = this.facing; dy = 0; }
      const m = Math.hypot(dx, dy) || 1;
      this.dash.dx = dx / m; this.dash.dy = dy / m;
      this.dash.t = this.dash.dur;
      this.dash.cd = 3 * this.stats.cdMult; // 专注/疾风靴可缩短冷却
      if (this.dash.dx !== 0) this.facing = this.dash.dx > 0 ? 1 : -1;
      Bus.emit('sfx', 'dash');
    } else if (this.moving) {
      this.x += mv.x * this.stats.speed * dt;
      this.y += mv.y * this.stats.speed * dt;
      if (mv.x !== 0) this.facing = mv.x > 0 ? 1 : -1;
      this.animT += dt;
    } else this.animT = 0;

    if (this.iframes > 0) this.iframes -= dt;
    if (this.hurtT > 0) this.hurtT -= dt;
    if (this.stats.regen > 0 && this.hp < this.stats.maxHp) {
      this.hp = Math.min(this.stats.maxHp, this.hp + this.stats.regen * dt);
    }
    g.cam.follow(this.x, this.y, dt);
    for (const w of this.weapons) w.update(dt, g);
  }

  dashCd() { return Math.max(0, this.dash.cd); } // HUD 冷却显示用
  dashReady() { return this.dash.cd <= 0; }

  takeDamage(amount) {
    if (!Number.isFinite(this.hp)) this.hp = Number.isFinite(this.stats.maxHp) ? this.stats.maxHp : 1;
    if (this.iframes > 0 || this.hp <= 0) return;
    const rawAmount = Number(amount);
    const safeAmount = Number.isFinite(rawAmount) ? rawAmount : 1;
    const afterArmor = Math.max(1, safeAmount - this.stats.armor);
    const scaled = afterArmor * this.stats.damageTakenMult;
    const dmg = Number.isFinite(scaled) ? Math.max(1, Math.round(scaled)) : 1;
    this.hp = Math.max(0, this.hp - dmg);
    this.iframes = 0.6; this.hurtT = 0.25;
    Bus.emit('hurt', dmg); // main 监听此事件做震屏/红晕
    if (this.hp <= 0) { this.hp = 0; Bus.emit('runend', { victory: false }); }
  }

  addXp(n) {
    const hadPending = this.pendingLevels > 0;
    this.xp += Math.round(n * this.stats.xpMult);
    let need = xpNeed(this.level);
    while (this.xp >= need) {
      this.xp -= need; this.level++;
      this.pendingLevels++;
      need = xpNeed(this.level);
    }
    if (this.pendingLevels > 0 && !hadPending) Bus.emit('levelup', { level: this.level });
  }

  xpRatio() { return this.xp / xpNeed(this.level); }

  draw(ctx) {
    const walking = this.moving && Math.floor(this.animT / 0.16) % 2 === 1;
    const name = this.char.sprite + (walking ? '_1' : '_0');
    if (this.iframes > 0 && Math.floor(this.iframes * 12) % 2 === 0) return; // 无敌帧闪烁
    if (this.hurtT > 0) drawSprite(ctx, name, this.x, this.y, { flip: this.facing < 0, tint: '#ff5555' });
    else drawSprite(ctx, name, this.x, this.y, { flip: this.facing < 0 });
  }
}

export function xpNeed(level) { return Math.floor(6 + level * 4 + level * level * 0.35); }
