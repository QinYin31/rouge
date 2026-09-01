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
    // 防御类内功状态：护盾优先吸收伤害，反伤由 weapons.js 监听 player-hurt 事件结算。
    this.shield = 0;
    this.shieldMax = 0;
    this.shieldRegen = 0;
    this.reflectRatio = 0;
    this._g = null;
    this.bonuses = {
      mightMult: 1, cdMult: 1, hpFlat: 0, hpMult: 1, speedMult: 1,
      magnetFlat: 0, xpMult: 1, goldMult: 1, armorFlat: 0, areaMult: 1, regenFlat: 0,
      damageTakenMult: 1,
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
    // 等级成长：每级三维提升，缓解后期乏力
    const lv = Math.max(1, this.level || 1);
    const lvMight = 1 + (lv - 1) * 0.06;
    const lvHpFlat = (lv - 1) * 8;
    const lvSpeedMult = 1 + (lv - 1) * 0.012;
    const computedMaxHp = Math.round((c.hp + b.hpFlat + lvHpFlat) * b.hpMult);
    const maxHp = Number.isFinite(computedMaxHp) && computedMaxHp > 0 ? computedMaxHp : Math.max(1, c.hp);
    const takenMult = (this.charBonus.damageTakenMult || 1) * (b.damageTakenMult || 1);
    this.stats = {
      maxHp,
      might: c.might * b.mightMult * lvMight,
      cdMult: this.charBonus.cdMult * b.cdMult,
      speed: c.speed * b.speedMult * lvSpeedMult,
      magnet: 60 + this.charBonus.magnetFlat + b.magnetFlat,
      xpMult: this.charBonus.xpMult * b.xpMult, goldMult: b.goldMult,
      armor: c.armor + b.armorFlat,
      areaMult: this.charBonus.areaMult * b.areaMult,
      crit: this.charBonus.crit, critDmg: this.charBonus.critDmg,
      damageTakenMult: Number.isFinite(takenMult) ? Math.max(0.25, takenMult) : 1,
      regen: b.regenFlat,
    };
    if (!Number.isFinite(this.hp)) this.hp = this.stats.maxHp;
    if (oldMax && this.stats.maxHp > oldMax) this.hp += this.stats.maxHp - oldMax;
    if (this.hp > this.stats.maxHp) this.hp = this.stats.maxHp;
    if (!Number.isFinite(this.shieldMax) || this.shieldMax < 0) this.shieldMax = 0;
    if (!Number.isFinite(this.shield) || this.shield < 0) this.shield = 0;
    if (this.shield > this.shieldMax) this.shield = this.shieldMax;
  }

  // 增加永久护盾容量并立即补满新增部分。
  addShieldCapacity(amount) {
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) return 0;
    this.shieldMax += n;
    const before = this.shield;
    this.shield = Math.min(this.shieldMax, this.shield + n);
    return this.shield - before;
  }

  // 组合技使用：没有防御被动时也能建立一个可用的小型护盾。
  gainShield(amount) {
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) return 0;
    this.shieldMax = Math.max(this.shieldMax, n);
    const before = this.shield;
    this.shield = Math.min(this.shieldMax, this.shield + n);
    return this.shield - before;
  }

  update(dt, g) {
    this._g = g;
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
    if (this.shieldRegen > 0 && this.shield < this.shieldMax) {
      this.shield = Math.min(this.shieldMax, this.shield + this.shieldRegen * dt);
    }
    g.cam.follow(this.x, this.y, dt);
    for (const w of this.weapons) w.update(dt, g);
  }

  dashCd() { return Math.max(0, this.dash.cd); } // HUD 冷却显示用
  dashReady() { return this.dash.cd <= 0; }

  takeDamage(amount) {
    if (!Number.isFinite(this.hp)) this.hp = Number.isFinite(this.stats.maxHp) ? this.stats.maxHp : 1;
    if (this.iframes > 0 || this.hp <= 0) return;
    if (!Number.isFinite(this.shield) || this.shield < 0) this.shield = 0;
    const rawAmount = Number(amount);
    const safeAmount = Number.isFinite(rawAmount) ? rawAmount : 1;
    const afterArmor = Math.max(1, safeAmount - this.stats.armor);
    const scaled = afterArmor * this.stats.damageTakenMult;
    const incoming = Number.isFinite(scaled) ? Math.max(1, Math.round(scaled)) : 1;
    const blocked = Math.min(this.shield, incoming);
    this.shield = Math.max(0, this.shield - blocked);
    const dmg = Math.max(0, incoming - blocked);
    if (dmg > 0) this.hp = Math.max(0, this.hp - dmg);
    this.iframes = 0.6; this.hurtT = dmg > 0 ? 0.25 : 0.12;
    const g = this._g;
    if (blocked > 0 && g && g.spawnText) {
      g.spawnText(this.x, this.y - 34, `护盾 -${blocked}`, { color: '#5fb8c4', size: 13, life: 0.7 });
      if (g.addParticles) g.addParticles(this.x, this.y, { n: 5, color: '#7fd4de', speed: 80, life: 0.28, size: 3 });
    }
    Bus.emit('player-hurt', { player: this, g, rawAmount: safeAmount, mitigated: incoming, damage: dmg, blocked });
    if (dmg > 0) Bus.emit('hurt', dmg); // main 监听此事件做震屏/红晕
    else if (blocked > 0) Bus.emit('shield-hit', blocked);
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
    if (this.shield > 0 && this.shieldMax > 0) {
      const f = Math.max(0.18, Math.min(1, this.shield / this.shieldMax));
      ctx.save();
      ctx.globalAlpha = 0.2 + f * 0.45;
      ctx.strokeStyle = '#5fb8c4'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(this.x, this.y, 25 + f * 3, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 0.18 + f * 0.16;
      ctx.fillStyle = '#7fd4de';
      ctx.beginPath(); ctx.arc(this.x, this.y, 22 + f * 2, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    const walking = this.moving && Math.floor(this.animT / 0.16) % 2 === 1;
    const name = this.char.sprite + (walking ? '_1' : '_0');
    if (this.iframes > 0 && Math.floor(this.iframes * 12) % 2 === 0) return; // 无敌帧闪烁
    if (this.hurtT > 0) drawSprite(ctx, name, this.x, this.y, { flip: this.facing < 0, tint: '#ff5555' });
    else drawSprite(ctx, name, this.x, this.y, { flip: this.facing < 0 });
  }
}

export function xpNeed(level) { return Math.floor(6 + level * 4 + level * level * 0.35); }