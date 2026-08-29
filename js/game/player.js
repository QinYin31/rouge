// 玩家:属性/成长/移动/受伤/经验
import { Input } from '../core/input.js';
import { Bus } from '../core/engine.js';
import { drawSprite } from '../sprites.js';

export const CHARACTERS = {
  knight: {
    name: '战士', weapon: 'knife', sprite: 'hero_knight', hp: 120, might: 1.0, speed: 122, armor: 1,
    desc: '皮糙肉厚,自带 1 点护甲 · 初始武器:飞刀', cost: 0,
  },
  mage: {
    name: '法师', weapon: 'wand', sprite: 'hero_mage', hp: 80, might: 0.95, speed: 116, cdMult: 0.85,
    desc: '施法冷却 -15% · 初始武器:魔弹', cost: 300,
  },
  ranger: {
    name: '游侠', weapon: 'bow', sprite: 'hero_ranger', hp: 95, might: 1.0, speed: 138, magnet: 30,
    desc: '移速突出、拾取范围大 · 初始武器:长弓', cost: 800,
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
    this.bonuses = {
      mightMult: 1, cdMult: 1, hpFlat: 0, hpMult: 1, speedMult: 1,
      magnetFlat: 0, xpMult: 1, goldMult: 1, armorFlat: 0, areaMult: 1, regenFlat: 0,
    };
    this.charBonus = { cdMult: c.cdMult || 1, magnetFlat: c.magnet || 0 };
    this.recalc();
    this.hp = this.stats.maxHp;
  }

  recalc() {
    const b = this.bonuses, c = this.char;
    const oldMax = this.stats ? this.stats.maxHp : 0;
    this.stats = {
      maxHp: Math.round((c.hp + b.hpFlat) * b.hpMult),
      might: c.might * b.mightMult,
      cdMult: this.charBonus.cdMult * b.cdMult,
      speed: c.speed * b.speedMult,
      magnet: 60 + this.charBonus.magnetFlat + b.magnetFlat,
      xpMult: b.xpMult, goldMult: b.goldMult,
      armor: c.armor + b.armorFlat,
      areaMult: b.areaMult,
      crit: 0.1, critDmg: 1.6,
      regen: b.regenFlat,
    };
    if (oldMax && this.stats.maxHp > oldMax) this.hp += this.stats.maxHp - oldMax;
    if (this.hp > this.stats.maxHp) this.hp = this.stats.maxHp;
  }

  update(dt, g) {
    const mv = Input.move();
    this.moving = mv.x !== 0 || mv.y !== 0;
    if (this.moving) {
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

  takeDamage(amount) {
    if (this.iframes > 0 || this.hp <= 0) return;
    const dmg = Math.max(1, Math.round(amount - this.stats.armor));
    this.hp -= dmg;
    this.iframes = 0.6; this.hurtT = 0.25;
    Bus.emit('hurt', dmg); // main 监听此事件做震屏/红晕
    if (this.hp <= 0) { this.hp = 0; Bus.emit('runend', { victory: false }); }
  }

  addXp(n) {
    this.xp += Math.round(n * this.stats.xpMult);
    let need = xpNeed(this.level);
    while (this.xp >= need) {
      this.xp -= need; this.level++;
      this.pendingLevels++;
      need = xpNeed(this.level);
    }
    if (this.pendingLevels > 0) Bus.emit('levelup', { level: this.level });
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
