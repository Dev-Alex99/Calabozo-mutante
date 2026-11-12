import {
  PlayerEntity,
  EnemyEntity,
  HeartPickup,
  AltarEntity,
  BarrelEntity,
  HazardZone,
  DoorState,
  WallSegment,
  SyncSeal,
} from '../types';

/**
 * Handcrafted, artistic 2D procedural sprite rendering engine.
 * Renders detailed, expressive characters, monsters, weapons, and animations
 * with dark medieval roguelite aesthetic (no geometric placeholders).
 */
export class SpriteModels {
  /**
   * Renders the Player character with class-specific armor, weapons, and animations.
   */
  public static drawPlayer(
    ctx: CanvasRenderingContext2D,
    player: PlayerEntity,
    isLocal: boolean,
    time: number
  ) {
    ctx.save();
    ctx.translate(player.x, player.y);

    const now = Date.now();
    // Mercy invulnerability i-frames flicker
    const isInvulnerable = player.invulnerableUntil && now < player.invulnerableUntil;
    if (isInvulnerable) {
      if (Math.floor(now / 65) % 2 === 0) {
        ctx.globalAlpha = 0.4;
      }
    }

    // Stealth shimmer for Pícaro
    const isStealthed = player.stealthedUntil && now < player.stealthedUntil;
    if (isStealthed) {
      ctx.globalAlpha = 0.45;
    }

    if (!player.isAlive) {
      // Co-op Soul Revival Circle (68px radius) — Purely visual runic resurrection ritual
      const revProg = player.reviveProgress || 0;
      const pulseR = 64 + Math.sin(time * 5) * 4;
      ctx.strokeStyle = revProg > 0 ? 'rgba(34, 197, 94, 0.78)' : 'rgba(245, 158, 11, 0.38)';
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 6]);
      ctx.beginPath();
      ctx.arc(0, 0, pulseR, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      if (revProg > 0) {
        ctx.strokeStyle = '#22c55e';
        ctx.lineWidth = 4.5;
        ctx.beginPath();
        ctx.arc(0, 0, 34, -Math.PI / 2, -Math.PI / 2 + revProg * Math.PI * 2);
        ctx.stroke();
      }

      // Fallen Hero: crimson pool, shattered shield, sword planted in stone & hovering soul wisp
      ctx.fillStyle = '#450a0a';
      ctx.beginPath();
      ctx.ellipse(0, 6, 20, 9, 0, 0, Math.PI * 2);
      ctx.fill();

      // Fallen cloak & pauldron
      ctx.fillStyle = '#292524';
      ctx.beginPath();
      ctx.moveTo(-14, 2);
      ctx.quadraticCurveTo(0, -6, 14, 4);
      ctx.lineTo(10, 10);
      ctx.lineTo(-12, 8);
      ctx.closePath();
      ctx.fill();

      // Planted Broadsword (Hilt + Crossguard + Blade in ground)
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, 4);
      ctx.lineTo(0, -22);
      ctx.stroke();

      ctx.strokeStyle = '#d97706';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-8, -14);
      ctx.lineTo(8, -14);
      ctx.stroke();

      // Hovering Soul Flame Wisp above the sword hilt
      const soulY = -28 + Math.sin(time * 6) * 3;
      ctx.fillStyle = revProg > 0 ? 'rgba(74, 222, 128, 0.35)' : 'rgba(56, 189, 248, 0.3)';
      ctx.beginPath();
      ctx.arc(0, soulY, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = revProg > 0 ? '#4ade80' : '#38bdf8';
      ctx.beginPath();
      ctx.moveTo(-4, soulY + 2);
      ctx.quadraticCurveTo(0, soulY - 10, 4, soulY + 2);
      ctx.arc(0, soulY + 2, 4, 0, Math.PI);
      ctx.fill();

      ctx.restore();
      return;
    }

    // Walking / breathing bobbing
    const speed = Math.hypot(player.vx, player.vy);
    const isMoving = speed > 15;
    const walkBob = isMoving ? Math.sin(time * 14) * 2.5 : Math.sin(time * 2.5) * 1.0;
    const walkTilt = isMoving ? Math.sin(time * 7) * 0.08 : 0;

    // Frenzy Combo Aura (10+ Combo)
    if (player.combo >= 10) {
      ctx.strokeStyle = player.combo >= 20 ? 'rgba(239, 68, 68, 0.55)' : 'rgba(245, 158, 11, 0.45)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 2, 22 + Math.sin(time * 12) * 2, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Active Shield Barrier Ring
    if (player.shieldHp > 0) {
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.65)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 20, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Guerrero Reflective Bulwark Spinning Aegis
    if (player.classType === 'GUERRERO' && player.skillActiveUntil && now < player.skillActiveUntil) {
      ctx.save();
      ctx.rotate(time * 6);
      ctx.strokeStyle = '#facc15';
      ctx.lineWidth = 3;
      for (let i = 0; i < 4; i++) {
        const a = (i * Math.PI) / 2;
        ctx.beginPath();
        ctx.arc(0, 0, 26, a, a + 0.8);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Shadow on floor
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.beginPath();
    ctx.ellipse(0, 14, 16, 7, 0, 0, Math.PI * 2);
    ctx.fill();

    // Rotate player towards aiming angle
    ctx.save();
    ctx.rotate(player.angle);

    if (player.classType === 'GUERRERO') {
      this.drawGuerrero(ctx, player, walkBob, walkTilt, time, isMoving);
    } else if (player.classType === 'CAZADOR') {
      this.drawCazador(ctx, player, walkBob, walkTilt, time, isMoving);
    } else if (player.classType === 'PICARO') {
      this.drawPicaro(ctx, player, walkBob, walkTilt, time, isMoving);
    } else {
      this.drawMago(ctx, player, walkBob, walkTilt, time, isMoving);
    }

    ctx.restore();

    // Overhead Visual Indicators: Health Bar, Shield Bar & Host Golden Crown (Zero Text Clutter)
    this.drawGothicHealthBar(ctx, 0, -22, 38, 5, player.currentHp, player.maxHp);
    if (player.shieldHp > 0) {
      const shieldPct = Math.min(1, player.shieldHp / 100);
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(-19, -26, 38 * shieldPct, 2.5);
    }
    if (player.isHost) {
      // Forged Golden Crown emblem above host's health bar
      ctx.fillStyle = '#facc15';
      ctx.strokeStyle = '#78350f';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-6, -29);
      ctx.lineTo(-7, -35);
      ctx.lineTo(-3, -32);
      ctx.lineTo(0, -37);
      ctx.lineTo(3, -32);
      ctx.lineTo(7, -35);
      ctx.lineTo(6, -29);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    ctx.restore();
  }

  /* ========================================================================= */
  /*                             PLAYER CLASSES                                */
  /* ========================================================================= */

  private static drawGuerrero(
    ctx: CanvasRenderingContext2D,
    player: PlayerEntity,
    bob: number,
    tilt: number,
    time: number,
    isMoving: boolean
  ) {
    ctx.translate(0, bob);
    ctx.rotate(tilt);

    const isAttacking = Date.now() - player.lastAttackAt < 160;
    const attackProg = isAttacking ? (Date.now() - player.lastAttackAt) / 160 : 1;

    // Cape with centrifugal wave momentum
    const capeFlutter = isAttacking
      ? Math.sin(attackProg * Math.PI) * 9
      : isMoving
      ? Math.sin(time * 12) * 4
      : 0;

    ctx.fillStyle = '#7f1d1d';
    ctx.beginPath();
    ctx.moveTo(-10, -6);
    ctx.lineTo(-26 - (isMoving ? 4 : 0), -14 + capeFlutter);
    ctx.lineTo(-26 - (isMoving ? 4 : 0), 14 + capeFlutter * 0.5);
    ctx.lineTo(-10, 6);
    ctx.closePath();
    ctx.fill();

    // Gold trim on cape
    ctx.strokeStyle = '#d97706';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // Plate Torso
    ctx.fillStyle = '#44403c';
    ctx.beginPath();
    ctx.ellipse(0, 0, 13, 11, 0, 0, Math.PI * 2);
    ctx.fill();

    // Iron Breastplate Trim
    ctx.fillStyle = '#78716c';
    ctx.beginPath();
    ctx.ellipse(2, 0, 9, 8, 0, 0, Math.PI * 2);
    ctx.fill();

    // Gold Inlaid Crest
    ctx.fillStyle = '#d97706';
    ctx.fillRect(0, -3, 5, 6);

    // Pauldrons (Shoulder Armor with steel bevel)
    ctx.fillStyle = '#57534e';
    ctx.beginPath();
    ctx.arc(-2, -12, 6, 0, Math.PI * 2);
    ctx.arc(-2, 12, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#292524';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Steel Horned Kettle Helmet
    ctx.fillStyle = '#78716c';
    ctx.beginPath();
    ctx.arc(3, 0, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#292524';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Visor Slit with glowing red warrior eye
    ctx.fillStyle = '#1c1917';
    ctx.fillRect(6, -4, 3, 8);
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(7, -2, 2, 4);

    // Heavy Claymore Zweihänder Sword with dynamic attack swing
    ctx.save();
    const swingAngle = isAttacking
      ? -Math.PI * 0.45 + attackProg * Math.PI * 0.95
      : 0;

    ctx.translate(14, 8);
    ctx.rotate(swingAngle);

    // Steel Crossguard
    ctx.fillStyle = '#b45309';
    ctx.fillRect(-2, -10, 4, 20);

    // Leather Grip & Pommel
    ctx.fillStyle = '#451a03';
    ctx.fillRect(-8, -2, 6, 4);
    ctx.fillStyle = '#d97706';
    ctx.beginPath();
    ctx.arc(-9, 0, 2.5, 0, Math.PI * 2);
    ctx.fill();

    // Two-Handed Steel Blade with fuller
    ctx.fillStyle = '#e7e5e4';
    ctx.beginPath();
    ctx.moveTo(2, -4);
    ctx.lineTo(34, -3);
    ctx.lineTo(38, 0); // Tip
    ctx.lineTo(34, 3);
    ctx.lineTo(2, 4);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#78716c';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Fuller (Center Blood Groove)
    ctx.strokeStyle = '#a8a29e';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(4, 0);
    ctx.lineTo(28, 0);
    ctx.stroke();

    ctx.restore();

    // Slashing Blade Arc Trail (Silver-Gold crescent motion ribbon)
    if (isAttacking) {
      ctx.save();
      const slashGrad = ctx.createRadialGradient(0, 0, 16, 0, 0, 44);
      slashGrad.addColorStop(0, 'rgba(254, 240, 138, 0)');
      slashGrad.addColorStop(0.65, 'rgba(245, 158, 11, 0.45)');
      slashGrad.addColorStop(1, 'rgba(255, 255, 255, 0.9)');

      ctx.fillStyle = slashGrad;
      ctx.beginPath();
      ctx.arc(0, 0, 44, -Math.PI * 0.45, -Math.PI * 0.45 + attackProg * Math.PI * 0.95);
      ctx.arc(0, 0, 18, -Math.PI * 0.45 + attackProg * Math.PI * 0.95, -Math.PI * 0.45, true);
      ctx.closePath();
      ctx.fill();

      // Sharp white cutting edge
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 44, -Math.PI * 0.45, -Math.PI * 0.45 + attackProg * Math.PI * 0.95);
      ctx.stroke();

      ctx.restore();
    }
  }

  private static drawCazador(
    ctx: CanvasRenderingContext2D,
    player: PlayerEntity,
    bob: number,
    tilt: number,
    time: number,
    isMoving: boolean
  ) {
    ctx.translate(0, bob);
    ctx.rotate(tilt);

    const isShooting = Date.now() - player.lastAttackAt < 140;
    const shootProg = isShooting ? (Date.now() - player.lastAttackAt) / 140 : 1;
    const recoilX = isShooting ? -Math.sin(shootProg * Math.PI) * 4 : 0;
    const twang = isShooting ? Math.sin((Date.now() - player.lastAttackAt) * 0.15) * 3 : 0;

    // Forest Ranger Quiver (On Back)
    ctx.fillStyle = '#78350f';
    ctx.fillRect(-14, -8, 8, 16);
    // Arrows with feather fletchings sticking out
    ctx.fillStyle = '#b91c1c';
    ctx.beginPath();
    ctx.moveTo(-18, -6);
    ctx.lineTo(-14, -7);
    ctx.lineTo(-18, -4);
    ctx.moveTo(-18, 2);
    ctx.lineTo(-14, 1);
    ctx.lineTo(-18, 4);
    ctx.fill();

    // Leather Jerkin Body
    ctx.fillStyle = '#292524';
    ctx.beginPath();
    ctx.ellipse(0, 0, 11, 9, 0, 0, Math.PI * 2);
    ctx.fill();

    // Camo Hooded Cowl
    ctx.fillStyle = '#14532d';
    ctx.beginPath();
    ctx.arc(2, 0, 8.5, 0, Math.PI * 2);
    ctx.fill();

    // Deep Hood Shadow over face
    ctx.fillStyle = '#052e16';
    ctx.beginPath();
    ctx.arc(4, 0, 6, -Math.PI / 2, Math.PI / 2);
    ctx.fill();

    // Sharp glowing eyes in shadow
    ctx.fillStyle = '#f59e0b';
    ctx.fillRect(5, -3, 2, 2);
    ctx.fillRect(5, 2, 2, 2);

    // Heavy Hunting Crossbow with Recoil
    ctx.save();
    ctx.translate(12 + recoilX, 4);

    // Wood Tiller / Stock
    ctx.fillStyle = '#78350f';
    ctx.fillRect(-2, -3, 16, 6);

    // Iron Curved Bow Prods
    ctx.strokeStyle = '#57534e';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(10, -14);
    ctx.quadraticCurveTo(14, 0, 10, 14);
    ctx.stroke();

    // Vibrating Bowstring
    ctx.strokeStyle = '#d6d3d1';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(10, -14);
    ctx.lineTo(2 + twang, 0);
    ctx.lineTo(10, 14);
    ctx.stroke();

    // Loaded Steel Broadhead Bolt (only when not in middle of shoot recoil)
    if (!isShooting || shootProg > 0.6) {
      ctx.strokeStyle = '#0284c7';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(2, 0);
      ctx.lineTo(16, 0);
      ctx.stroke();
      // Arrow tip
      ctx.fillStyle = '#f1f5f9';
      ctx.beginPath();
      ctx.moveTo(16, -3);
      ctx.lineTo(20, 0);
      ctx.lineTo(16, 3);
      ctx.fill();
    } else {
      // Muzzle spark star
      ctx.fillStyle = '#facc15';
      ctx.beginPath();
      ctx.arc(20, 0, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  private static drawMago(
    ctx: CanvasRenderingContext2D,
    player: PlayerEntity,
    bob: number,
    tilt: number,
    time: number,
    isMoving: boolean
  ) {
    ctx.translate(0, bob);
    ctx.rotate(tilt);

    const isCasting = Date.now() - player.lastAttackAt < 220;

    // Ground Magic Transmutation Circle during spellcast
    if (isCasting) {
      ctx.save();
      ctx.strokeStyle = 'rgba(234, 88, 12, 0.55)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, 0, 26, 0, Math.PI * 2);
      ctx.stroke();

      // Rotating inner runes
      ctx.strokeStyle = 'rgba(250, 204, 21, 0.6)';
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3 + time * 3;
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(a) * 26, Math.sin(a) * 26);
      }
      ctx.stroke();
      ctx.restore();
    }

    // Flowing Sorcerer Robes
    ctx.fillStyle = '#3b0764';
    ctx.beginPath();
    ctx.moveTo(-10, -8);
    ctx.lineTo(-20 - (isMoving ? 3 : 0), -12);
    ctx.lineTo(-20 - (isMoving ? 3 : 0), 12);
    ctx.lineTo(-10, 8);
    ctx.closePath();
    ctx.fill();

    // Inner Robe
    ctx.fillStyle = '#581c87';
    ctx.beginPath();
    ctx.ellipse(0, 0, 11, 8.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Pointed Warlock Hat & Cowl
    ctx.fillStyle = '#3b0764';
    ctx.beginPath();
    ctx.arc(2, 0, 7.5, 0, Math.PI * 2);
    ctx.fill();

    // Shadow Mask with occult purple eyes
    ctx.fillStyle = '#1e1b4b';
    ctx.beginPath();
    ctx.arc(3.5, 0, 5.5, -Math.PI / 2, Math.PI / 2);
    ctx.fill();

    ctx.fillStyle = '#c084fc';
    ctx.fillRect(5, -2, 2, 2);
    ctx.fillRect(5, 2, 2, 2);

    // Gnarled Pyromancer Staff
    ctx.save();
    ctx.translate(12, 7);

    // Twisted Oak Staff Body
    ctx.strokeStyle = '#451a03';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-6, -2);
    ctx.lineTo(16, 2);
    ctx.stroke();

    // Bronze Claw Topping
    ctx.strokeStyle = '#d97706';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(18, 2, 5, -Math.PI / 2, Math.PI / 2);
    ctx.stroke();

    // Pulsing Fiery Crystal Core (zero-blur layered glow)
    const pulse = isCasting ? 3.5 : Math.sin(time * 6) * 1.5;
    ctx.fillStyle = 'rgba(234, 88, 12, 0.35)';
    ctx.beginPath();
    ctx.arc(19, 2, 7.5 + pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ea580c';
    ctx.beginPath();
    ctx.arc(19, 2, 4 + pulse, 0, Math.PI * 2);
    ctx.fill();

    // 3 Orbiting Arcane Rune Orbs
    for (let i = 0; i < 3; i++) {
      const orbAngle = time * 5 + i * ((Math.PI * 2) / 3);
      const ox = 19 + Math.cos(orbAngle) * 9;
      const oy = 2 + Math.sin(orbAngle) * 5;
      ctx.fillStyle = i === 0 ? '#fde047' : i === 1 ? '#ea580c' : '#ef4444';
      ctx.beginPath();
      ctx.arc(ox, oy, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();

    // Floating Levitating Spell Grimoire
    const bookFloat = Math.sin(time * 4) * 3;
    ctx.save();
    ctx.translate(-8, -14 + bookFloat);
    ctx.rotate(isCasting ? -0.3 : Math.sin(time * 3) * 0.15);

    // Leather Tome Cover
    ctx.fillStyle = '#7f1d1d';
    ctx.fillRect(-6, -8, 12, 16);
    // Gold Rune on Cover
    ctx.fillStyle = '#d97706';
    ctx.fillRect(-2, -4, 4, 8);
    // Parchment Pages (fanning open when casting)
    ctx.fillStyle = '#fef3c7';
    if (isCasting) {
      ctx.fillRect(-8, -9, 16, 18);
      // Floating arcane ember rune
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(-1, -6, 2, 4);
    } else {
      ctx.fillRect(-4, -6, 8, 12);
    }

    ctx.restore();
  }

  private static drawPicaro(
    ctx: CanvasRenderingContext2D,
    player: PlayerEntity,
    bob: number,
    tilt: number,
    time: number,
    isMoving: boolean
  ) {
    ctx.translate(0, bob);
    ctx.rotate(tilt);

    const isAttacking = Date.now() - player.lastAttackAt < 130;
    const slashProg = isAttacking ? (Date.now() - player.lastAttackAt) / 130 : 1;

    // Flowing Shadow Scarf
    const scarfWave = isMoving ? Math.sin(time * 16) * 5 : Math.sin(time * 4) * 2;
    ctx.fillStyle = '#064e3b';
    ctx.beginPath();
    ctx.moveTo(-6, -4);
    ctx.lineTo(-24, -8 + scarfWave);
    ctx.lineTo(-22, 4 + scarfWave);
    ctx.lineTo(-6, 4);
    ctx.closePath();
    ctx.fill();

    // Midnight Leather Assassin Tunic
    ctx.fillStyle = '#18181b';
    ctx.beginPath();
    ctx.ellipse(0, 0, 10, 8.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Dark Hooded Cowl & Mask
    ctx.fillStyle = '#09090b';
    ctx.beginPath();
    ctx.arc(2, 0, 7.5, 0, Math.PI * 2);
    ctx.fill();

    // Glowing Emerald Viper Eyes
    ctx.fillStyle = '#10b981';
    ctx.fillRect(5, -3, 2.5, 2);
    ctx.fillRect(5, 1.5, 2.5, 2);

    // Twin Poisoned Daggers (Left & Right hands)
    const lunge = isAttacking ? Math.sin(slashProg * Math.PI) * 8 : 0;
    ctx.fillStyle = '#10b981';
    ctx.strokeStyle = '#d1fae5';
    ctx.lineWidth = 1;

    // Right Dagger
    ctx.beginPath();
    ctx.moveTo(8 + lunge, 5);
    ctx.lineTo(22 + lunge, 7);
    ctx.lineTo(10 + lunge, 9);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Left Dagger
    ctx.beginPath();
    ctx.moveTo(8 + lunge * 0.7, -5);
    ctx.lineTo(22 + lunge * 0.7, -7);
    ctx.lineTo(10 + lunge * 0.7, -9);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    if (isAttacking) {
      ctx.strokeStyle = 'rgba(16, 185, 129, 0.85)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(6, 0, 26, -Math.PI / 3, Math.PI / 3);
      ctx.stroke();
    }
  }

  /* ========================================================================= */
  /*                             ENEMIES & MONSTERS                            */
  /* ========================================================================= */

  /**
   * Draws telegraphed attack trajectory lines on the floor (e.g. Skeletons aiming bow).
   */
  public static drawEnemyTelegraph(ctx: CanvasRenderingContext2D, enemy: EnemyEntity) {
    if (enemy.aiState !== 'CHARGING' || typeof enemy.aimAngle !== 'number') return;

    ctx.save();
    ctx.translate(enemy.x, enemy.y);
    ctx.rotate(enemy.aimAngle);

    // Warning trajectory line (crimson laser)
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.75)';
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 6]);
    ctx.beginPath();
    ctx.moveTo(enemy.radius, 0);
    ctx.lineTo(enemy.radius + 380, 0);
    ctx.stroke();

    // Aim target reticle at end
    ctx.strokeStyle = 'rgba(220, 38, 38, 0.9)';
    ctx.setLineDash([]);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(enemy.radius + 380, 0, 6, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();
  }

  public static drawEnemy(ctx: CanvasRenderingContext2D, enemy: EnemyEntity, time: number) {
    ctx.save();
    ctx.translate(enemy.x, enemy.y);

    const now = Date.now();

    // 1. Elite Champion Golden/Crimson Floor Runic Ring
    if (enemy.isElite) {
      ctx.save();
      ctx.rotate(time * 2.5);
      ctx.strokeStyle = 'rgba(245, 158, 11, 0.7)';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.arc(0, 4, enemy.radius + 8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // White flash on damage hit (fast alpha overlay without GPU-stalling ctx.filter)
    const isFlashing = enemy.flashUntil && now < enemy.flashUntil;

    if (enemy.type === 'BOSS_TITAN') {
      this.drawBossTitan(ctx, enemy, time);
    } else if (enemy.type === 'BOSS_ARACHNID') {
      this.drawBossArachnid(ctx, enemy, time);
    } else if (enemy.isBoss) {
      this.drawBossDirector(ctx, enemy, time);
    } else if (enemy.type === 'SLIME' || enemy.type === 'MINI_SLIME') {
      this.drawSlime(ctx, enemy, time);
    } else if (enemy.type === 'ESQUELETO') {
      this.drawEsqueleto(ctx, enemy, time);
    } else if (enemy.type === 'GOLEM') {
      this.drawGolem(ctx, enemy, time);
    } else if (enemy.type === 'NIGROMANTE') {
      this.drawNigromante(ctx, enemy, time);
    } else if (enemy.type === 'ESPIRITU') {
      this.drawEspiritu(ctx, enemy, time);
    } else if (enemy.type === 'KAMIKAZE') {
      this.drawKamikaze(ctx, enemy, time);
    } else if (enemy.type === 'MIMICO') {
      this.drawMimico(ctx, enemy, time);
    } else if (enemy.type === 'ARANA') {
      this.drawArana(ctx, enemy, time);
    } else if (enemy.type === 'CENTINELA') {
      this.drawCentinela(ctx, enemy, time);
    } else {
      this.drawMurcielago(ctx, enemy, time);
    }

    if (isFlashing) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
      ctx.beginPath();
      ctx.arc(0, 0, enemy.radius, 0, Math.PI * 2);
      ctx.fill();
    }

    // Purely Visual Elemental & Elite Status Overlays (Zero Text Clutter)
    if (enemy.isElite) {
      // Spiked Forged Iron-Gold Champion Crown above head
      const cy = -enemy.radius - 15;
      ctx.fillStyle = '#f59e0b';
      ctx.strokeStyle = '#78350f';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(-8, cy);
      ctx.lineTo(-10, cy - 8);
      ctx.lineTo(-4, cy - 4);
      ctx.lineTo(0, cy - 11);
      ctx.lineTo(4, cy - 4);
      ctx.lineTo(10, cy - 8);
      ctx.lineTo(8, cy);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    if (enemy.burnUntil && now < enemy.burnUntil) {
      // Animated flickering flame tongues rising around body
      for (let i = -1; i <= 1; i++) {
        const fx = i * (enemy.radius * 0.55);
        const fy = Math.sin(time * 16 + i * 2) * 4;
        ctx.fillStyle = 'rgba(249, 115, 22, 0.85)';
        ctx.beginPath();
        ctx.moveTo(fx - 4, 4 + fy);
        ctx.quadraticCurveTo(fx, -12 + fy, fx + 4, 4 + fy);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#fef08a';
        ctx.beginPath();
        ctx.arc(fx, 1 + fy, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    if (enemy.poisonUntil && now < enemy.poisonUntil) {
      // Rising toxic venom bubbles around monster
      for (let i = 0; i < 3; i++) {
        const bx = Math.sin(time * 4 + i * 2.1) * (enemy.radius * 0.65);
        const by = -((time * 24 + i * 9) % (enemy.radius * 1.4)) + enemy.radius * 0.4;
        ctx.fillStyle = 'rgba(132, 204, 22, 0.8)';
        ctx.beginPath();
        ctx.arc(bx, by, 2.5 + (i % 2), 0, Math.PI * 2);
        ctx.fill();
      }
    }

    if (enemy.chillUntil && now < enemy.chillUntil) {
      // Translucent jagged frost crystals encasing flanks
      ctx.fillStyle = 'rgba(56, 189, 248, 0.55)';
      ctx.strokeStyle = '#bae6fd';
      ctx.lineWidth = 1;
      for (let side = -1; side <= 1; side += 2) {
        ctx.beginPath();
        ctx.moveTo(side * (enemy.radius * 0.4), 6);
        ctx.lineTo(side * (enemy.radius * 0.95), -8);
        ctx.lineTo(side * (enemy.radius * 0.55), -14);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
    }

    if (enemy.stunUntil && now < enemy.stunUntil) {
      // 3 Golden 4-pointed stars orbiting head in 3D ellipse
      for (let i = 0; i < 3; i++) {
        const a = time * 6 + (i * Math.PI * 2) / 3;
        const sx = Math.cos(a) * (enemy.radius * 0.75);
        const sy = -enemy.radius - 6 + Math.sin(a) * 4;
        ctx.fillStyle = '#fde047';
        ctx.beginPath();
        ctx.moveTo(sx, sy - 4);
        ctx.lineTo(sx + 1.5, sy - 1.5);
        ctx.lineTo(sx + 4, sy);
        ctx.lineTo(sx + 1.5, sy + 1.5);
        ctx.lineTo(sx, sy + 4);
        ctx.lineTo(sx - 1.5, sy + 1.5);
        ctx.lineTo(sx - 4, sy);
        ctx.lineTo(sx - 1.5, sy - 1.5);
        ctx.closePath();
        ctx.fill();
      }
    }

    ctx.restore();
  }

  /**
   * Articulated Stone-and-Magma Colossus (GOLEM):
   * Stomping legs, V-tapered craggy obsidian torso plates, asymmetrical spiked boulder pauldrons,
   * swinging stone-hammer fists, and glowing furnace visor head.
   */
  private static drawGolem(ctx: CanvasRenderingContext2D, enemy: EnemyEntity, time: number) {
    const isCharging = enemy.aiState === 'CHARGING';
    const stride = Math.sin(time * 7 + enemy.x * 0.1) * 4;
    const heave = Math.sin(time * 4.5) * 2;
    const slamRaise = isCharging ? -10 : 0;

    // Heavy ground shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.52)';
    ctx.beginPath();
    ctx.ellipse(0, 24, 26, 10, 0, 0, Math.PI * 2);
    ctx.fill();

    // 1. Articulated Stone Pillar Legs
    ctx.fillStyle = '#1c1917';
    ctx.strokeStyle = '#44403c';
    ctx.lineWidth = 2;
    for (let side = -1; side <= 1; side += 2) {
      const legY = side === -1 ? stride : -stride;
      ctx.beginPath();
      ctx.moveTo(side * 6, 8);
      ctx.lineTo(side * 16, 8);
      ctx.lineTo(side * 18, 22 + legY * 0.5);
      ctx.lineTo(side * 5, 22 + legY * 0.5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    // 2. Craggy V-Tapered Basalt Torso & Segmented Waist Plate
    ctx.fillStyle = '#292524';
    ctx.strokeStyle = isCharging ? '#f97316' : '#57534e';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(-22, -16 + heave);
    ctx.lineTo(0, -22 + heave);
    ctx.lineTo(22, -16 + heave);
    ctx.lineTo(16, 6 + heave);
    ctx.lineTo(10, 14 + heave);
    ctx.lineTo(-10, 14 + heave);
    ctx.lineTo(-16, 6 + heave);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 3. Asymmetrical Spiked Boulder Pauldrons
    ctx.fillStyle = '#1c1917';
    for (let side = -1; side <= 1; side += 2) {
      ctx.beginPath();
      ctx.moveTo(side * 14, -20 + heave);
      ctx.lineTo(side * 28, -24 + heave);
      ctx.lineTo(side * 31, -10 + heave);
      ctx.lineTo(side * 18, -6 + heave);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    // 4. Glowing Molten Core & Magma Veins Across Chest
    ctx.fillStyle = isCharging ? '#fef08a' : '#ea580c';
    ctx.beginPath();
    ctx.moveTo(0, -10 + heave);
    ctx.lineTo(7, -2 + heave);
    ctx.lineTo(0, 6 + heave);
    ctx.lineTo(-7, -2 + heave);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = isCharging ? '#fde047' : '#f97316';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-14, -12 + heave);
    ctx.lineTo(-6, -2 + heave);
    ctx.moveTo(14, -12 + heave);
    ctx.lineTo(6, -2 + heave);
    ctx.moveTo(0, 6 + heave);
    ctx.lineTo(0, 13 + heave);
    ctx.stroke();

    // 5. Sunken Iron-Grate Head & Furnace Visor
    ctx.fillStyle = '#1c1917';
    ctx.beginPath();
    ctx.moveTo(-9, -26 + heave);
    ctx.lineTo(9, -26 + heave);
    ctx.lineTo(11, -14 + heave);
    ctx.lineTo(-11, -14 + heave);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = isCharging ? '#fef08a' : '#f97316';
    ctx.beginPath();
    ctx.moveTo(-7, -21 + heave);
    ctx.lineTo(-2, -19 + heave);
    ctx.lineTo(-7, -18 + heave);
    ctx.moveTo(7, -21 + heave);
    ctx.lineTo(2, -19 + heave);
    ctx.lineTo(7, -18 + heave);
    ctx.fill();

    // 6. Articulated Swinging Stone-Hammer Arms
    for (let side = -1; side <= 1; side += 2) {
      const armSwing = side === -1 ? -stride * 1.2 : stride * 1.2;
      const fy = 4 + heave + armSwing + slamRaise;
      ctx.strokeStyle = '#44403c';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(side * 22, -12 + heave);
      ctx.lineTo(side * 26, fy);
      ctx.stroke();

      // Jagged Stone Fist
      ctx.fillStyle = '#292524';
      ctx.strokeStyle = isCharging ? '#f97316' : '#57534e';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(side * 20, fy - 6);
      ctx.lineTo(side * 33, fy - 4);
      ctx.lineTo(side * 32, fy + 9);
      ctx.lineTo(side * 19, fy + 8);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    this.drawGothicHealthBar(ctx, 0, -enemy.radius - 8, 46, 5, enemy.currentHp, enemy.maxHp);
  }

  /**
   * Abyssal Lich Cultist (NIGROMANTE):
   * Tattered multi-layered void vestments, horned bone skull mask,
   * skeletal hand clutching a levitating grimoire, and a goat-skull staff channeling a dark vortex.
   */
  private static drawNigromante(ctx: CanvasRenderingContext2D, enemy: EnemyEntity, time: number) {
    const floatY = Math.sin(time * 4 + enemy.x) * 3.5;
    const isCharging = enemy.aiState === 'CHARGING';
    const hemWave = Math.sin(time * 8 + enemy.y) * 3;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.42)';
    ctx.beginPath();
    ctx.ellipse(0, 19, 15, 5.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Occult Void Hexagram Aura when charging
    if (isCharging) {
      ctx.save();
      ctx.translate(0, floatY);
      ctx.rotate(time * 3);
      ctx.strokeStyle = 'rgba(192, 132, 252, 0.75)';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3;
        const r = 24;
        if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
        else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
    }

    // 1. Tattered Multi-Layered Void Robes with scalloped hem
    ctx.fillStyle = '#2e1065';
    ctx.strokeStyle = '#7e22ce';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-8, -14 + floatY);
    ctx.quadraticCurveTo(-18, 2 + floatY, -16 + hemWave, 16 + floatY);
    ctx.lineTo(-8, 12 + floatY);
    ctx.lineTo(0, 17 + floatY);
    ctx.lineTo(8, 12 + floatY);
    ctx.lineTo(16 + hemWave, 16 + floatY);
    ctx.quadraticCurveTo(18, 2 + floatY, 8, -14 + floatY);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Crimson & Gold Occult Stole
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-5, -8 + floatY);
    ctx.lineTo(-6, 12 + floatY);
    ctx.moveTo(5, -8 + floatY);
    ctx.lineTo(6, 12 + floatY);
    ctx.stroke();

    // 2. Pointed Arch-Cowl & Horned Bone Skull Mask
    ctx.fillStyle = '#1e1b4b';
    ctx.beginPath();
    ctx.moveTo(0, -24 + floatY);
    ctx.quadraticCurveTo(12, -16 + floatY, 10, -4 + floatY);
    ctx.lineTo(-10, -4 + floatY);
    ctx.quadraticCurveTo(-12, -16 + floatY, 0, -24 + floatY);
    ctx.fill();

    // Curved Ram Horns on Cowl
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-6, -15 + floatY);
    ctx.quadraticCurveTo(-15, -20 + floatY, -13, -10 + floatY);
    ctx.moveTo(6, -15 + floatY);
    ctx.quadraticCurveTo(15, -20 + floatY, 13, -10 + floatY);
    ctx.stroke();

    // Carved Bone Visage & Jaw
    ctx.fillStyle = '#e2e8f0';
    ctx.beginPath();
    ctx.moveTo(-5, -14 + floatY);
    ctx.lineTo(5, -14 + floatY);
    ctx.lineTo(4, -6 + floatY);
    ctx.lineTo(0, -4 + floatY);
    ctx.lineTo(-4, -6 + floatY);
    ctx.closePath();
    ctx.fill();

    // Glowing Amethyst Eyes
    ctx.fillStyle = isCharging ? '#f0abfc' : '#a855f7';
    ctx.beginPath();
    ctx.arc(-2.2, -10 + floatY, 1.6, 0, Math.PI * 2);
    ctx.arc(2.2, -10 + floatY, 1.6, 0, Math.PI * 2);
    ctx.fill();

    // 3. Right Hand: Twisted Bone Staff with Horned Skull & Void Orb
    const staffY = floatY + Math.sin(time * 6) * 2;
    ctx.strokeStyle = '#78350f';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(14, 14 + staffY);
    ctx.lineTo(17, -16 + staffY);
    ctx.stroke();

    ctx.fillStyle = '#c084fc';
    ctx.beginPath();
    ctx.arc(17, -19 + staffY, isCharging ? 5 : 3.5, 0, Math.PI * 2);
    ctx.fill();

    // 4. Left Hand: Levitating Open Necronomicon Pages
    const bookY = floatY - 4 + Math.cos(time * 5) * 2.5;
    ctx.fillStyle = '#450a0a';
    ctx.beginPath();
    ctx.moveTo(-19, bookY - 4);
    ctx.lineTo(-11, bookY - 2);
    ctx.lineTo(-11, bookY + 5);
    ctx.lineTo(-19, bookY + 3);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#fef3c7';
    ctx.beginPath();
    ctx.moveTo(-18, bookY - 3);
    ctx.lineTo(-12, bookY - 1);
    ctx.lineTo(-12, bookY + 4);
    ctx.lineTo(-18, bookY + 2);
    ctx.closePath();
    ctx.fill();

    this.drawGothicHealthBar(ctx, 0, -enemy.radius - 8, 36, 4, enemy.currentHp, enemy.maxHp);
  }

  /**
   * Banshee Frost Wraith (ESPIRITU):
   * Exposed spectral ribcage, tattered ectoplasmic ribbons, hooded skull, and elongated ice-clawed arms.
   */
  private static drawEspiritu(ctx: CanvasRenderingContext2D, enemy: EnemyEntity, time: number) {
    const floatY = Math.sin(time * 5 + enemy.x) * 4;
    const isCharging = enemy.aiState === 'CHARGING';
    const sway = Math.sin(time * 9 + enemy.y * 0.1) * 4;

    // Chilling frost mist halo
    ctx.fillStyle = 'rgba(56, 189, 248, 0.18)';
    ctx.beginPath();
    ctx.arc(0, floatY, 22, 0, Math.PI * 2);
    ctx.fill();

    // 1. Flowing Ectoplasmic Shroud with 4 undulating tail ribbons
    ctx.fillStyle = 'rgba(14, 165, 233, 0.72)';
    ctx.strokeStyle = '#bae6fd';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(0, -20 + floatY);
    ctx.quadraticCurveTo(15, -8 + floatY, 14 + sway * 0.4, 16 + floatY);
    ctx.lineTo(7 + sway * 0.6, 9 + floatY);
    ctx.lineTo(2 + sway, 19 + floatY);
    ctx.lineTo(-3 + sway * 0.5, 10 + floatY);
    ctx.lineTo(-9 + sway, 18 + floatY);
    ctx.lineTo(-14 + sway * 0.4, 14 + floatY);
    ctx.quadraticCurveTo(-15, -8 + floatY, 0, -20 + floatY);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 2. Translucent Spectral Ribcage Inside Shroud
    ctx.strokeStyle = 'rgba(224, 242, 254, 0.75)';
    ctx.lineWidth = 1.3;
    for (let r = -4; r <= 4; r += 4) {
      ctx.beginPath();
      ctx.moveTo(-6, r + floatY);
      ctx.quadraticCurveTo(0, r + 2 + floatY, 6, r + floatY);
      ctx.stroke();
    }

    // 3. Spectral Skull & Screaming Maw
    ctx.fillStyle = '#e0f2fe';
    ctx.beginPath();
    ctx.arc(0, -10 + floatY, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#082f49';
    ctx.beginPath();
    ctx.arc(-2.2, -11 + floatY, 1.6, 0, Math.PI * 2);
    ctx.arc(2.2, -11 + floatY, 1.6, 0, Math.PI * 2);
    ctx.ellipse(0, -7 + floatY, 2, isCharging ? 3 : 1.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // 4. Reaching Spectral Arms & Razor Ice Claws
    const reach = isCharging ? 5 : 0;
    ctx.strokeStyle = '#7dd3fc';
    ctx.lineWidth = 2;
    for (let side = -1; side <= 1; side += 2) {
      ctx.beginPath();
      ctx.moveTo(side * 8, -4 + floatY);
      ctx.lineTo(side * 18, -2 + floatY - reach);
      ctx.lineTo(side * 22, -7 + floatY - reach);
      ctx.stroke();
    }

    this.drawGothicHealthBar(ctx, 0, -enemy.radius - 8, 34, 4, enemy.currentHp, enemy.maxHp);
  }

  /**
   * Volatile Alchemical Sapper Imp (KAMIKAZE):
   * Hunched magma goblin sprinting on digitigrade legs, carrying a strapped iron-bound powder keg
   * on its back with a sizzling fuse and waving a lit torch!
   */
  private static drawKamikaze(ctx: CanvasRenderingContext2D, enemy: EnemyEntity, time: number) {
    const legRun = Math.sin(time * 22 + enemy.x) * 6;
    const bounce = Math.abs(Math.cos(time * 22)) * 2.5;
    const pulse = Math.abs(Math.sin(time * 15)) * 3;

    // Ground shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.beginPath();
    ctx.ellipse(0, 15, 13, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    // 1. Sprinting Digitigrade Imp Legs
    ctx.strokeStyle = '#9a3412';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(-5, 6 - bounce);
    ctx.lineTo(-8, 14 + legRun * 0.6);
    ctx.moveTo(5, 6 - bounce);
    ctx.lineTo(8, 14 - legRun * 0.6);
    ctx.stroke();

    // 2. Strapped Alchemical Powder Keg on Back (swelling with magma heat!)
    ctx.save();
    ctx.translate(-3, -6 - bounce);
    ctx.rotate(-0.25);
    ctx.fillStyle = '#451a03';
    ctx.strokeStyle = '#ea580c';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.ellipse(0, 0, 10 + pulse * 0.3, 12 + pulse * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Iron barrel hoops
    ctx.strokeStyle = '#292524';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-9, -4);
    ctx.lineTo(9, -4);
    ctx.moveTo(-9, 4);
    ctx.lineTo(9, 4);
    ctx.stroke();

    // Sizzling Fuse & Bright Sparks at top of keg
    ctx.strokeStyle = '#d6d3d1';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, -12);
    ctx.quadraticCurveTo(6, -18, 10, -15);
    ctx.stroke();

    ctx.fillStyle = '#fef08a';
    for (let s = 0; s < 4; s++) {
      const sa = time * 18 + (s * Math.PI) / 2;
      ctx.beginPath();
      ctx.arc(10 + Math.cos(sa) * 3.5, -15 + Math.sin(sa) * 3.5, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // 3. Hunched Imp Torso & Pointed Bat-Eared Head
    ctx.fillStyle = '#c2410c';
    ctx.strokeStyle = '#7c2d12';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(4, 1 - bounce, 9, 8, 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Imp Head with Long Jagged Ears & Curved Horns
    ctx.fillStyle = '#ea580c';
    ctx.beginPath();
    ctx.arc(7, -5 - bounce, 6.5, 0, Math.PI * 2);
    ctx.fill();

    // Long Bat Ears & Dark Horns
    ctx.fillStyle = '#9a3412';
    ctx.beginPath();
    ctx.moveTo(2, -8 - bounce);
    ctx.lineTo(-6, -14 - bounce);
    ctx.lineTo(4, -4 - bounce);
    ctx.moveTo(10, -8 - bounce);
    ctx.lineTo(17, -14 - bounce);
    ctx.lineTo(11, -4 - bounce);
    ctx.fill();

    // Manic Glowing Eyes & Fanged Grin
    ctx.fillStyle = '#fef08a';
    ctx.beginPath();
    ctx.arc(5, -6 - bounce, 1.7, 0, Math.PI * 2);
    ctx.arc(9.5, -6 - bounce, 1.7, 0, Math.PI * 2);
    ctx.fill();

    // 4. Right Arm Waving a Blazing Torch
    ctx.strokeStyle = '#78350f';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(11, 0 - bounce);
    ctx.lineTo(18, -8 - bounce + legRun * 0.4);
    ctx.stroke();
    ctx.fillStyle = '#facc15';
    ctx.beginPath();
    ctx.arc(18, -11 - bounce + legRun * 0.4, 3.5, 0, Math.PI * 2);
    ctx.fill();

    this.drawGothicHealthBar(ctx, 0, -enemy.radius - 10, 32, 4, enemy.currentHp, enemy.maxHp);
  }

  /**
   * Ravenous Disguised Chest Monster (MIMICO):
   * Ornate oak-and-iron chest when dormant; erupts with 4 scuttling spider-legs,
   * hinged snapping lid, rows of ivory fangs, and a whipping sinuous tongue when awake!
   */
  private static drawMimico(ctx: CanvasRenderingContext2D, enemy: EnemyEntity, time: number) {
    const isAwake = enemy.aiState !== 'IDLE';
    const chomp = isAwake ? Math.abs(Math.sin(time * 13)) * 8 : 0;
    const legScuttle = isAwake ? Math.sin(time * 20 + enemy.x) * 4.5 : 0;

    // Shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.48)';
    ctx.beginPath();
    ctx.ellipse(0, 15, 22, 8, 0, 0, Math.PI * 2);
    ctx.fill();

    // 1. 4 Clawed Spider-Wood Legs (erupt underneath when awake!)
    if (isAwake) {
      ctx.strokeStyle = '#451a03';
      ctx.lineWidth = 2.8;
      for (let side = -1; side <= 1; side += 2) {
        for (let l = 0; l < 2; l++) {
          const swing = (l === 0 ? legScuttle : -legScuttle) * side;
          ctx.beginPath();
          ctx.moveTo(side * (10 + l * 6), 8);
          ctx.lineTo(side * (20 + l * 6), 4 + swing * 0.5);
          ctx.lineTo(side * (24 + l * 6), 16 + swing);
          ctx.stroke();
        }
      }
    }

    // 2. Lower Carved Oak Chest Box with Wrought Iron Straps
    ctx.fillStyle = '#451a03';
    ctx.strokeStyle = '#292524';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-20, -4);
    ctx.lineTo(20, -4);
    ctx.lineTo(18, 12);
    ctx.lineTo(-18, 12);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Iron Straps on Lower Box
    ctx.fillStyle = '#292524';
    ctx.fillRect(-15, -4, 5, 16);
    ctx.fillRect(10, -4, 5, 16);

    if (isAwake) {
      // 3. Fleshy Abyssal Maw, Whipping Tongue & Rows of Jagged Fangs
      ctx.fillStyle = '#450a0a';
      ctx.beginPath();
      ctx.moveTo(-18, -4);
      ctx.lineTo(-19, -12 - chomp);
      ctx.lineTo(19, -12 - chomp);
      ctx.lineTo(18, -4);
      ctx.closePath();
      ctx.fill();

      // Sinuous Whipping Purple Tongue
      const tongueWave = Math.sin(time * 16) * 9;
      ctx.strokeStyle = '#be185d';
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(0, -4);
      ctx.quadraticCurveTo(tongueWave, -12 - chomp * 0.5, tongueWave * 1.4, -2 + chomp * 0.4);
      ctx.stroke();

      // Upper & Lower Jagged Ivory Teeth
      ctx.fillStyle = '#fef3c7';
      for (let tx = -14; tx <= 14; tx += 7) {
        // Upper fangs pointing down
        ctx.beginPath();
        ctx.moveTo(tx - 2.5, -11 - chomp);
        ctx.lineTo(tx, -5 - chomp * 0.5);
        ctx.lineTo(tx + 2.5, -11 - chomp);
        ctx.fill();
        // Lower fangs pointing up
        ctx.beginPath();
        ctx.moveTo(tx - 2, -3);
        ctx.lineTo(tx + 1, -9 - chomp * 0.2);
        ctx.lineTo(tx + 3, -3);
        ctx.fill();
      }
    }

    // 4. Hinged Arched Oak Lid
    ctx.save();
    ctx.translate(0, -4 - chomp);
    ctx.fillStyle = '#78350f';
    ctx.strokeStyle = '#292524';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-21, 0);
    ctx.quadraticCurveTo(-21, -13, 0, -13);
    ctx.quadraticCurveTo(21, -13, 21, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Iron bands on lid
    ctx.fillStyle = '#292524';
    ctx.fillRect(-15, -11, 5, 11);
    ctx.fillRect(10, -11, 5, 11);

    if (isAwake) {
      // 3 Glowing Predator Eyes on the Lid
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(-7, -6, 2.2, 0, Math.PI * 2);
      ctx.arc(0, -8, 2.8, 0, Math.PI * 2);
      ctx.arc(7, -6, 2.2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Dormant Ornate Gold Lock Clasp
      ctx.fillStyle = '#d97706';
      ctx.beginPath();
      ctx.arc(0, 1, 4.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    if (isAwake) {
      this.drawGothicHealthBar(ctx, 0, -enemy.radius - 12, 42, 4, enemy.currentHp, enemy.maxHp);
    }
  }

  /**
   * Abyssal Venom Weaver (ARANA):
   * 8 multi-segmented chitinous legs with claw tips, segmented bulbous abdomen with glowing venom sacs,
   * armored cephalothorax, and animated pinching chelicerae.
   */
  private static drawArana(ctx: CanvasRenderingContext2D, enemy: EnemyEntity, time: number) {
    const legSwing = Math.sin(time * 16 + enemy.x) * 4.5;
    const mandiblePinch = Math.abs(Math.sin(time * 10)) * 2.5;

    // 1. 8 Multi-Segmented Chitinous Legs (Femur -> Tibia -> Tarsus Claw)
    ctx.lineCap = 'round';
    for (let side = -1; side <= 1; side += 2) {
      for (let l = 0; l < 4; l++) {
        const phase = (l % 2 === 0 ? legSwing : -legSwing) * side;
        const baseX = side * 7;
        const baseY = -6 + l * 4;
        const kneeX = side * (17 + (l === 1 || l === 2 ? 3 : 0));
        const kneeY = baseY - 6 + phase * 0.6;
        const tipX = side * (24 + (l === 1 || l === 2 ? 3 : 0));
        const tipY = baseY + 5 + phase;

        ctx.strokeStyle = '#365314';
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.moveTo(baseX, baseY);
        ctx.lineTo(kneeX, kneeY);
        ctx.stroke();

        ctx.strokeStyle = '#65a30d';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(kneeX, kneeY);
        ctx.lineTo(tipX, tipY);
        ctx.stroke();
      }
    }

    // 2. Segmented Bulbous Abdomen with Bioluminescent Venom Sacs
    ctx.fillStyle = '#1a2e05';
    ctx.strokeStyle = '#4d7c0f';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.ellipse(0, 6, 12, 14, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Glowing Acid Sacs on Abdomen
    ctx.fillStyle = '#84cc16';
    ctx.beginPath();
    ctx.arc(-4, 4, 2.5, 0, Math.PI * 2);
    ctx.arc(4, 4, 2.5, 0, Math.PI * 2);
    ctx.arc(0, 10, 3.2, 0, Math.PI * 2);
    ctx.fill();

    // 3. Armored Cephalothorax & Pinching Chelicerae (Mandibles)
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.ellipse(0, -6, 8, 7, 0, 0, Math.PI * 2);
    ctx.fill();

    // Curved Venomous Mandibles
    ctx.strokeStyle = '#a3e635';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-4, -11);
    ctx.quadraticCurveTo(-8, -17, -2 + mandiblePinch * 0.5, -17);
    ctx.moveTo(4, -11);
    ctx.quadraticCurveTo(8, -17, 2 - mandiblePinch * 0.5, -17);
    ctx.stroke();

    // Cluster of 6 Gleaming Crimson Eyes
    ctx.fillStyle = '#ef4444';
    for (let ex = -4; ex <= 4; ex += 4) {
      ctx.beginPath();
      ctx.arc(ex, -9, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }

    this.drawGothicHealthBar(ctx, 0, -enemy.radius - 10, 36, 4, enemy.currentHp, enemy.maxHp);
  }

  /**
   * Seraphic Ophanim Arcane Sentinel (CENTINELA):
   * 4 beating metallic-and-bone wings, interlocking brass gimbal rings studded with runes,
   * and an organic veined dragon-eye that tracks its target.
   */
  private static drawCentinela(ctx: CanvasRenderingContext2D, enemy: EnemyEntity, time: number) {
    const wingBeat = Math.sin(time * 9 + enemy.x) * 5;
    const isCharging = enemy.aiState === 'CHARGING';

    // 1. 4 Articulated Seraphic Feathered Wings (Upper & Lower Pairs)
    ctx.fillStyle = '#4c1d95';
    ctx.strokeStyle = '#c084fc';
    ctx.lineWidth = 1.4;
    for (let side = -1; side <= 1; side += 2) {
      // Upper wing
      ctx.beginPath();
      ctx.moveTo(side * 10, -4);
      ctx.quadraticCurveTo(side * 26, -18 + wingBeat, side * 28, -4 + wingBeat);
      ctx.lineTo(side * 18, 2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Lower wing
      ctx.beginPath();
      ctx.moveTo(side * 8, 4);
      ctx.quadraticCurveTo(side * 22, 16 - wingBeat * 0.7, side * 24, 6 - wingBeat * 0.7);
      ctx.lineTo(side * 14, 8);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    // 2. Interlocking Gyroscope Brass Gimbal Rings (Tilted Ellipses)
    ctx.save();
    ctx.rotate(time * 2.4);
    ctx.strokeStyle = '#d97706';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.ellipse(0, 0, 19, 11, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.rotate(-time * 1.8 + Math.PI / 3);
    ctx.strokeStyle = '#e879f9';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.ellipse(0, 0, 18, 10, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // 3. Central Armored Ocular Core & Veined Sclera
    ctx.fillStyle = '#2e1065';
    ctx.strokeStyle = '#a855f7';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#fdf4ff';
    ctx.beginPath();
    ctx.ellipse(0, 0, 9.5, 7, 0, 0, Math.PI * 2);
    ctx.fill();

    // Slit Dragon Iris tracking aimAngle
    const lookX = typeof enemy.aimAngle === 'number' ? Math.cos(enemy.aimAngle) * 2.5 : 0;
    const lookY = typeof enemy.aimAngle === 'number' ? Math.sin(enemy.aimAngle) * 2 : 0;
    ctx.fillStyle = isCharging ? '#ef4444' : '#a21caf';
    ctx.beginPath();
    ctx.arc(lookX, lookY, 4.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#09090b';
    ctx.beginPath();
    ctx.ellipse(lookX, lookY, 1.3, 3.6, 0, 0, Math.PI * 2);
    ctx.fill();

    this.drawGothicHealthBar(ctx, 0, -enemy.radius - 10, 38, 4, enemy.currentHp, enemy.maxHp);
  }

  /**
   * BOSS 1: Ignis-Vulcan, Coloso de Magma y Cadenas (BOSS_TITAN)
   * Multi-jointed Obsidian Demon Colossus with unfurling magma wings in Phase 2/3,
   * exposed ribcage over a churning volcanic core, articulated arms with swinging magma gauntlets
   * and iron chains, horned demon skull with roaring hinged jaw, and Runic Shield Dome when shielded.
   */
  private static drawBossTitan(ctx: CanvasRenderingContext2D, enemy: EnemyEntity, time: number) {
    const phase = enemy.bossPhase || 1;
    const pulse = Math.sin(time * 5) * 4;
    const armSwing = Math.sin(time * 6) * 8;
    const jawRoar = enemy.aiState === 'ATTACKING' || enemy.aiState === 'CHARGING' ? 6 + Math.sin(time * 18) * 3 : 2;

    // Ground shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.58)';
    ctx.beginPath();
    ctx.ellipse(0, 48, 52, 18, 0, 0, Math.PI * 2);
    ctx.fill();

    // Volcanic Floor Crater Aura
    ctx.fillStyle = phase >= 2 ? 'rgba(220, 38, 38, 0.24)' : 'rgba(234, 88, 12, 0.18)';
    ctx.beginPath();
    ctx.arc(0, 0, enemy.radius + 14 + pulse, 0, Math.PI * 2);
    ctx.fill();

    // 1. Phase 2 & 3: Colossal Jagged Obsidian-and-Magma Wings
    if (phase >= 2) {
      const wingFlap = Math.sin(time * 4.5) * 9;
      ctx.fillStyle = '#1c1917';
      ctx.strokeStyle = phase === 3 ? '#fef08a' : '#f97316';
      ctx.lineWidth = 2.5;
      for (let side = -1; side <= 1; side += 2) {
        ctx.beginPath();
        ctx.moveTo(side * 18, -14);
        ctx.lineTo(side * 68, -48 + wingFlap);
        ctx.lineTo(side * 82, -16 + wingFlap * 0.6);
        ctx.lineTo(side * 58, -4);
        ctx.lineTo(side * 66, 18);
        ctx.lineTo(side * 24, 12);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
    }

    // 2. Massive V-Shaped Obsidian Torso & Exposed Ribcage over Molten Furnace Core
    ctx.fillStyle = '#1c1917';
    ctx.strokeStyle = phase >= 2 ? '#ef4444' : '#f97316';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-36, -24);
    ctx.lineTo(0, -32);
    ctx.lineTo(36, -24);
    ctx.lineTo(28, 14);
    ctx.lineTo(18, 34);
    ctx.lineTo(-18, 34);
    ctx.lineTo(-28, 14);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Churning Magma Heart Core
    ctx.fillStyle = '#ea580c';
    ctx.beginPath();
    ctx.arc(0, 2, 18 + pulse * 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fef08a';
    ctx.beginPath();
    ctx.arc(0, 2, 9, 0, Math.PI * 2);
    ctx.fill();

    // Obsidian Ribcage Bars curving over the Molten Core
    ctx.strokeStyle = '#292524';
    ctx.lineWidth = 3.5;
    for (let ry = -8; ry <= 12; ry += 10) {
      ctx.beginPath();
      ctx.moveTo(-20, ry);
      ctx.quadraticCurveTo(0, ry + 5, 20, ry);
      ctx.stroke();
    }

    // 3. Spiked Volcanic Pauldrons
    ctx.fillStyle = '#292524';
    ctx.strokeStyle = '#f97316';
    ctx.lineWidth = 2.2;
    for (let side = -1; side <= 1; side += 2) {
      ctx.beginPath();
      ctx.moveTo(side * 24, -28);
      ctx.lineTo(side * 48, -36);
      ctx.lineTo(side * 54, -14);
      ctx.lineTo(side * 30, -8);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    // 4. Articulated Multi-Jointed Arms, Colossal Clawed Magma Gauntlets & Swinging Iron Chains
    for (let side = -1; side <= 1; side += 2) {
      const gy = 10 + (side === -1 ? armSwing : -armSwing);
      const gx = side * 48;

      // Upper Arm & Bracer
      ctx.strokeStyle = '#44403c';
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(side * 36, -16);
      ctx.lineTo(gx, gy);
      ctx.stroke();

      // Clawed Obsidian Gauntlet
      ctx.fillStyle = '#1c1917';
      ctx.strokeStyle = '#f97316';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(gx - side * 10, gy - 10);
      ctx.lineTo(gx + side * 12, gy - 8);
      ctx.lineTo(gx + side * 14, gy + 12);
      ctx.lineTo(gx, gy + 18);
      ctx.lineTo(gx - side * 10, gy + 10);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Hanging Iron Chain Links from Gauntlet
      ctx.strokeStyle = '#78716c';
      ctx.lineWidth = 2;
      for (let link = 1; link <= 4; link++) {
        ctx.beginPath();
        ctx.ellipse(
          gx + Math.sin(time * 7 + link) * 3,
          gy + 16 + link * 7,
          3,
          4.5,
          0,
          0,
          Math.PI * 2
        );
        ctx.stroke();
      }
    }

    // 5. Horned Demon Skull & Hinged Roaring Jaw
    ctx.fillStyle = '#1c1917';
    ctx.strokeStyle = '#ea580c';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(-16, -38);
    ctx.lineTo(16, -38);
    ctx.lineTo(14, -20);
    ctx.lineTo(-14, -20);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Swept-back Great Demon Horns
    ctx.fillStyle = '#44403c';
    ctx.beginPath();
    ctx.moveTo(-14, -34);
    ctx.quadraticCurveTo(-36, -46, -28, -58);
    ctx.lineTo(-8, -38);
    ctx.moveTo(14, -34);
    ctx.quadraticCurveTo(36, -46, 28, -58);
    ctx.lineTo(8, -38);
    ctx.fill();

    // Hinged Lower Jaw with Molten Roar
    ctx.fillStyle = '#292524';
    ctx.beginPath();
    ctx.moveTo(-11, -20);
    ctx.lineTo(11, -20);
    ctx.lineTo(8, -12 + jawRoar);
    ctx.lineTo(-8, -12 + jawRoar);
    ctx.closePath();
    ctx.fill();

    // Blazing Visor Eyes
    ctx.fillStyle = '#fef08a';
    ctx.beginPath();
    ctx.moveTo(-10, -30);
    ctx.lineTo(-3, -27);
    ctx.lineTo(-10, -25);
    ctx.moveTo(10, -30);
    ctx.lineTo(3, -27);
    ctx.lineTo(10, -25);
    ctx.fill();

    // 6. Active Immunity Carapace Shield Dome
    if (enemy.bossShieldActive) {
      this.drawBossImmunityShield(ctx, enemy.radius + 18, time, '#38bdf8');
    }

    this.drawGothicHealthBar(ctx, 0, -enemy.radius - 20, 108, 8, enemy.currentHp, enemy.maxHp);
  }

  /**
   * BOSS 2: Aracne-Nyx, Reina Tejedora del Vórtice (BOSS_ARACHNID)
   * 8 multi-segmented scythe legs with IK stepping wave, segmented abdomen with pulsing bioluminescent
   * venom glands and scorpion tail stinger, plus a crowned Arachnid Empress torso with raptorial scythe-arms.
   */
  private static drawBossArachnid(ctx: CanvasRenderingContext2D, enemy: EnemyEntity, time: number) {
    const phase = enemy.bossPhase || 1;
    const legWave = Math.sin(time * 11) * 7;

    // Ground shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.beginPath();
    ctx.ellipse(0, 44, 54, 20, 0, 0, Math.PI * 2);
    ctx.fill();

    // 1. 8 Multi-Jointed Chitinous Scythe Legs (Coxa -> Spined Femur -> Curved Tibia -> Razor Claw)
    ctx.lineCap = 'round';
    for (let side = -1; side <= 1; side += 2) {
      for (let i = 0; i < 4; i++) {
        const wave = (i % 2 === 0 ? legWave : -legWave) * side;
        const yBase = -16 + i * 12;
        const kneeX = side * (46 + (i === 1 || i === 2 ? 8 : 0));
        const kneeY = yBase - 14 + wave * 0.7;
        const footX = side * (68 + (i === 1 || i === 2 ? 8 : 0));
        const footY = yBase + 12 + wave;

        // Armored Femur
        ctx.strokeStyle = '#365314';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(side * 22, yBase);
        ctx.lineTo(kneeX, kneeY);
        ctx.stroke();

        // Razor Tibia & Tarsus Scythe
        ctx.strokeStyle = phase >= 2 ? '#a3e635' : '#65a30d';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(kneeX, kneeY);
        ctx.lineTo(footX, footY);
        ctx.stroke();
      }
    }

    // 2. Segmented Chitinous Abdomen with Pulsing Bioluminescent Venom Glands
    ctx.fillStyle = '#1a2e05';
    ctx.strokeStyle = '#84cc16';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(0, 16, 32, 36, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Chitin plate ribs on abdomen
    ctx.strokeStyle = '#365314';
    ctx.lineWidth = 2;
    for (let ay = 2; ay <= 32; ay += 10) {
      ctx.beginPath();
      ctx.moveTo(-24, ay);
      ctx.quadraticCurveTo(0, ay + 6, 24, ay);
      ctx.stroke();
    }

    // Pulsing Bioluminescent Venom Sacs
    const sacPulse = 1 + Math.sin(time * 8) * 0.2;
    ctx.fillStyle = phase >= 2 ? '#bef264' : '#84cc16';
    for (let sy = 6; sy <= 26; sy += 10) {
      ctx.beginPath();
      ctx.arc(-12, sy, 4 * sacPulse, 0, Math.PI * 2);
      ctx.arc(12, sy, 4 * sacPulse, 0, Math.PI * 2);
      ctx.fill();
    }

    // 3. Crowned Arachnid Matriarch Upper Torso & Raptorial Mantis Fore-Scythes
    ctx.fillStyle = '#0f172a';
    ctx.strokeStyle = '#65a30d';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(-18, -8);
    ctx.lineTo(0, -24);
    ctx.lineTo(18, -8);
    ctx.lineTo(12, 8);
    ctx.lineTo(-12, 8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Raptorial Mantis Fore-Scythes & Snapping Chelicerae
    const pinch = Math.sin(time * 12) * 5;
    ctx.strokeStyle = '#bef264';
    ctx.lineWidth = 3;
    for (let side = -1; side <= 1; side += 2) {
      ctx.beginPath();
      ctx.moveTo(side * 14, -18);
      ctx.quadraticCurveTo(side * 30, -34, side * 12 - side * pinch * 0.5, -42);
      ctx.stroke();
    }

    // Matriarch Chitin Crown & 8 Glowing Eyes
    ctx.fillStyle = '#365314';
    ctx.beginPath();
    ctx.moveTo(-14, -24);
    ctx.lineTo(-18, -40);
    ctx.lineTo(-7, -30);
    ctx.lineTo(0, -44);
    ctx.lineTo(7, -30);
    ctx.lineTo(18, -40);
    ctx.lineTo(14, -24);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = phase >= 2 ? '#ef4444' : '#a3e635';
    for (let ex = -9; ex <= 9; ex += 6) {
      ctx.beginPath();
      ctx.arc(ex, -22, 2.5, 0, Math.PI * 2);
      ctx.arc(ex * 0.7, -27, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }

    if (enemy.bossShieldActive) {
      this.drawBossImmunityShield(ctx, enemy.radius + 18, time, '#a3e635');
    }

    this.drawGothicHealthBar(ctx, 0, -enemy.radius - 20, 108, 8, enemy.currentHp, enemy.maxHp);
  }

  /**
   * Renders the rotating hexagonal/octagonal Runic Immunity Barrier around a shielded Boss.
   */
  private static drawBossImmunityShield(
    ctx: CanvasRenderingContext2D,
    radius: number,
    time: number,
    color: string
  ) {
    ctx.save();
    ctx.rotate(time * 1.8);
    ctx.fillStyle = 'rgba(56, 189, 248, 0.14)';
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      const px = Math.cos(a) * radius;
      const py = Math.sin(a) * radius;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Orbiting shield nodes
    for (let i = 0; i < 4; i++) {
      const a = -time * 3.2 + (i * Math.PI) / 2;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(Math.cos(a) * radius, Math.sin(a) * radius, 4.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  /**
   * Renders Pickups (Zero Text Clutter):
   * - GOLD: Minted medieval gold coin with embossed royal crown crest
   * - SHIELD_ORB: Miniature Knight Aegis Kite Shield with glowing sapphire core
   * - FRENZY_ORB: Winged Arcane Lightning Crystal
   * - HEART: Faceted Ruby Crystal Heart
   */
  public static drawHeartPickup(ctx: CanvasRenderingContext2D, heart: HeartPickup, time: number) {
    const floatY = Math.sin(time * 4.5 + heart.x) * 3;
    const pType = heart.type || 'HEART';

    ctx.save();
    ctx.translate(heart.x, heart.y + floatY);

    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.beginPath();
    ctx.ellipse(0, 11 - floatY * 0.5, 8, 3.5, 0, 0, Math.PI * 2);
    ctx.fill();

    if (pType === 'GOLD') {
      const spinWidth = Math.max(3, Math.abs(Math.cos(time * 5 + heart.x)) * 8.5);
      ctx.fillStyle = 'rgba(250, 204, 21, 0.22)';
      ctx.beginPath();
      ctx.arc(0, 0, 12, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#facc15';
      ctx.strokeStyle = '#b45309';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.ellipse(0, 0, spinWidth, 8.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Embossed inner mint mark
      if (spinWidth > 4.5) {
        ctx.strokeStyle = '#fef08a';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(0, -4);
        ctx.lineTo(0, 4);
        ctx.stroke();
      }
      ctx.restore();
      return;
    }

    if (pType === 'SHIELD_ORB') {
      ctx.fillStyle = 'rgba(56, 189, 248, 0.25)';
      ctx.beginPath();
      ctx.arc(0, 0, 13, 0, Math.PI * 2);
      ctx.fill();

      // Kite Shield Silhouette
      ctx.fillStyle = '#0284c7';
      ctx.strokeStyle = '#bae6fd';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(0, -8);
      ctx.lineTo(7, -5);
      ctx.lineTo(5, 4);
      ctx.lineTo(0, 9);
      ctx.lineTo(-5, 4);
      ctx.lineTo(-7, -5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.restore();
      return;
    }

    if (pType === 'FRENZY_ORB') {
      ctx.fillStyle = 'rgba(168, 85, 247, 0.28)';
      ctx.beginPath();
      ctx.arc(0, 0, 14, 0, Math.PI * 2);
      ctx.fill();

      // Jagged Lightning Crystal
      ctx.fillStyle = '#a855f7';
      ctx.strokeStyle = '#fde047';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(2, -9);
      ctx.lineTo(-6, 1);
      ctx.lineTo(-1, 1);
      ctx.lineTo(-3, 9);
      ctx.lineTo(6, -1);
      ctx.lineTo(1, -1);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.restore();
      return;
    }

    // Default: Faceted Ruby Heart
    const pulse = Math.sin(time * 6 + heart.y) * 2;
    ctx.fillStyle = 'rgba(239, 68, 68, 0.25)';
    ctx.beginPath();
    ctx.arc(0, -2, 12 + pulse, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#dc2626';
    ctx.strokeStyle = '#7f1d1d';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, 5);
    ctx.bezierCurveTo(-7, -1, -9, -8, -4, -10);
    ctx.bezierCurveTo(0, -10, 0, -5, 0, -5);
    ctx.bezierCurveTo(0, -5, 0, -10, 4, -10);
    ctx.bezierCurveTo(9, -8, 7, -1, 0, 5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#fecaca';
    ctx.beginPath();
    ctx.arc(-2.5, -7.5, 1.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  /**
   * Viscous, translucent acidic Slime with a dissolved skeleton skull inside!
   * Enhanced with physics-based squash & stretch tied to AI hopping.
   */
  private static drawSlime(ctx: CanvasRenderingContext2D, enemy: EnemyEntity, time: number) {
    const isHopping = enemy.aiState === 'CHARGING';
    const hopScaleX = isHopping ? 0.78 : 1.0 + Math.sin(time * 6) * 0.08;
    const hopScaleY = isHopping ? 1.28 : 1.0 - Math.sin(time * 6) * 0.08;

    ctx.save();
    ctx.scale(hopScaleX, hopScaleY);

    const wobbleX = Math.sin(time * 8 + enemy.x) * 3.5;
    const wobbleY = Math.cos(time * 8 + enemy.y) * 3.5;

    // Slime shadow on floor
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.beginPath();
    ctx.ellipse(0, enemy.radius * 0.7, enemy.radius * 1.1, enemy.radius * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Outer Gelatinous Slime Body
    ctx.fillStyle = '#15803d';
    ctx.beginPath();
    ctx.ellipse(0, 0, enemy.radius + wobbleX, enemy.radius - wobbleY, 0, 0, Math.PI * 2);
    ctx.fill();

    // Inner Translucent Core
    ctx.fillStyle = '#22c55e';
    ctx.beginPath();
    ctx.ellipse(0, -2, enemy.radius * 0.75 + wobbleX * 0.5, enemy.radius * 0.7 - wobbleY * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Acid bubbles on surface
    ctx.fillStyle = '#86efac';
    ctx.beginPath();
    ctx.arc(-wobbleX * 0.5, -enemy.radius * 0.6, 2, 0, Math.PI * 2);
    ctx.arc(wobbleX * 0.7, -enemy.radius * 0.4, 2.5, 0, Math.PI * 2);
    ctx.fill();

    // Dissolved Skeleton Skull floating inside with buoyant lag!
    ctx.save();
    ctx.translate(wobbleX * 0.35, -wobbleY * 0.3 - (isHopping ? 3 : 0));
    ctx.rotate(-wobbleX * 0.05);
    ctx.fillStyle = '#e2e8f0';
    ctx.beginPath();
    ctx.arc(0, -1, 7, 0, Math.PI * 2);
    ctx.fill();
    // Hollow eye sockets
    ctx.fillStyle = '#14532d';
    ctx.beginPath();
    ctx.arc(-2.5, -1, 1.8, 0, Math.PI * 2);
    ctx.arc(2.5, -1, 1.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Malevolent glowing slime eyes
    ctx.fillStyle = '#fef08a';
    ctx.beginPath();
    ctx.ellipse(-6, -7, 3, 4, 0.2, 0, Math.PI * 2);
    ctx.ellipse(6, -7, 3, 4, -0.2, 0, Math.PI * 2);
    ctx.fill();

    // Dark slits
    ctx.fillStyle = '#14532d';
    ctx.fillRect(-7, -8, 2, 3);
    ctx.fillRect(5, -8, 2, 3);

    ctx.restore();

    this.drawGothicHealthBar(ctx, 0, -enemy.radius - 8, 34, 4, enemy.currentHp, enemy.maxHp);
  }

  /**
   * Anatomical bone Esqueleto holding longbow.
   * Bowstring flexes back taut when charging an attack!
   */
  private static drawEsqueleto(ctx: CanvasRenderingContext2D, enemy: EnemyEntity, time: number) {
    const isCharging = enemy.aiState === 'CHARGING';
    const rattle = Math.sin(time * 10) * 1.5;

    // Ground Shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.beginPath();
    ctx.ellipse(0, 16, 12, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Tattered red legionnaire cloak remnant
    ctx.fillStyle = '#7f1d1d';
    ctx.beginPath();
    ctx.moveTo(-8, -4);
    ctx.lineTo(-14, 10 + rattle);
    ctx.lineTo(0, 6);
    ctx.closePath();
    ctx.fill();

    // Spine & Ribcage (arched back if charging)
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(isCharging ? -3 : 0, -6);
    ctx.lineTo(0, 8); // Spine
    ctx.stroke();

    // Ribs
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-6, -3);
    ctx.lineTo(6, -3);
    ctx.moveTo(-5, 0);
    ctx.lineTo(5, 0);
    ctx.moveTo(-4, 3);
    ctx.lineTo(4, 3);
    ctx.stroke();

    // Skull
    ctx.fillStyle = '#f1f5f9';
    ctx.beginPath();
    ctx.arc(isCharging ? -2 : 0, -10 + rattle * 0.5, 7.5, 0, Math.PI * 2);
    ctx.fill();

    // Jagged Teeth / Jaw
    ctx.fillStyle = '#cbd5e1';
    ctx.fillRect(isCharging ? -5 : -3, -4 + rattle * 0.5, 6, 3);

    // Hollow Eye Sockets (ignite with burning crimson embers if charging!)
    ctx.fillStyle = isCharging ? '#ef4444' : '#0f172a';
    ctx.beginPath();
    ctx.arc((isCharging ? -2 : 0) - 2.5, -10 + rattle * 0.5, 2, 0, Math.PI * 2);
    ctx.arc((isCharging ? -2 : 0) + 2.5, -10 + rattle * 0.5, 2, 0, Math.PI * 2);
    ctx.fill();

    // Ancient Bone Longbow
    ctx.strokeStyle = '#78350f';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(10, 0, 12, -Math.PI / 2, Math.PI / 2);
    ctx.stroke();

    // Bowstring (pulled back taut towards cheekbone if charging)
    const pullX = isCharging ? -4 : 3;
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(10, -12);
    ctx.lineTo(pullX, 0);
    ctx.lineTo(10, 12);
    ctx.stroke();

    // Loaded Bone Arrow if charging
    if (isCharging) {
      ctx.fillStyle = '#e2e8f0';
      ctx.fillRect(pullX, -1, 14, 2);
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.moveTo(pullX + 14, -3);
      ctx.lineTo(pullX + 18, 0);
      ctx.lineTo(pullX + 14, 3);
      ctx.fill();
    }

    this.drawGothicHealthBar(ctx, 0, -enemy.radius - 12, 34, 4, enemy.currentHp, enemy.maxHp);
  }

  /**
   * Anatomical leathery Murciélago with flapping wings.
   */
  private static drawMurcielago(ctx: CanvasRenderingContext2D, enemy: EnemyEntity, time: number) {
    const flap = Math.sin(time * 18) * 14;

    // Small aerial shadow below
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.beginPath();
    ctx.ellipse(0, 18, 10, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    // Leathery Bat Wings (Multi-jointed)
    ctx.fillStyle = '#450a0a';
    ctx.strokeStyle = '#262626';
    ctx.lineWidth = 1.5;

    // Left Wing
    ctx.beginPath();
    ctx.moveTo(-4, 0);
    ctx.lineTo(-20, flap);
    ctx.lineTo(-24, flap * 0.6);
    ctx.lineTo(-14, 6);
    ctx.lineTo(-4, 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Right Wing
    ctx.beginPath();
    ctx.moveTo(4, 0);
    ctx.lineTo(20, flap);
    ctx.lineTo(24, flap * 0.6);
    ctx.lineTo(14, 6);
    ctx.lineTo(4, 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Furry Body
    ctx.fillStyle = '#1c1917';
    ctx.beginPath();
    ctx.ellipse(0, 0, 6, 8, 0, 0, Math.PI * 2);
    ctx.fill();

    // Pointed Vampiric Ears
    ctx.fillStyle = '#44403c';
    ctx.beginPath();
    ctx.moveTo(-5, -6);
    ctx.lineTo(-8, -13);
    ctx.lineTo(-2, -8);
    ctx.moveTo(5, -6);
    ctx.lineTo(8, -13);
    ctx.lineTo(2, -8);
    ctx.fill();

    // Glowing Crimson Eyes & Fangs
    ctx.fillStyle = '#dc2626';
    ctx.beginPath();
    ctx.arc(-2, -3, 1.5, 0, Math.PI * 2);
    ctx.arc(2, -3, 1.5, 0, Math.PI * 2);
    ctx.fill();

    // White Fangs
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-2, 1, 1, 2);
    ctx.fillRect(1, 1, 1, 2);

    this.drawGothicHealthBar(ctx, 0, -enemy.radius - 8, 28, 3.5, enemy.currentHp, enemy.maxHp);
  }

  /**
   * BOSS 3: El Gran Arquitecto del Abismo (BOSS_DIRECTOR)
   * 6-Winged Abyssal Seraph & Lich Inquisitor with a rotating halo of 8 obsidian daggers,
   * tattered multi-layered vestments over a singularity furnace core, horned mitre skull,
   * and articulated skeletal arms wielding an Abyssal Great-Scythe and an Astral Astrolabe.
   */
  private static drawBossDirector(ctx: CanvasRenderingContext2D, enemy: EnemyEntity, time: number) {
    const phase = enemy.bossPhase || 1;
    const isEnraged = phase >= 2;
    const hoverY = Math.sin(time * 3.2) * 6;

    // Giant ominous shadow on floor
    ctx.fillStyle = 'rgba(0, 0, 0, 0.62)';
    ctx.beginPath();
    ctx.ellipse(0, 58, 52, 18, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.translate(0, hoverY);

    // 1. Halo of 8 Levitating Obsidian Daggers fanning behind the Architect
    ctx.save();
    ctx.translate(0, -18);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + time * 1.4;
      const dx = Math.cos(a) * 64;
      const dy = Math.sin(a) * 38;
      ctx.save();
      ctx.translate(dx, dy);
      ctx.rotate(a + Math.PI / 2);
      ctx.fillStyle = isEnraged ? '#ef4444' : '#f59e0b';
      ctx.strokeStyle = '#1c1917';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, -14);
      ctx.lineTo(4, 4);
      ctx.lineTo(0, 10);
      ctx.lineTo(-4, 4);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();

    // 2. 6 Articulated Seraphim Bone-and-Shadow Wings (Upper, Middle & Lower Pairs)
    for (let side = -1; side <= 1; side += 2) {
      for (let pair = 0; pair < 3; pair++) {
        const beat = Math.sin(time * 4.2 - pair * 0.8) * (7 - pair * 1.5);
        const yAnchor = -22 + pair * 15;
        const span = 78 - pair * 12;
        const tipY = -48 + pair * 26 + beat;

        ctx.fillStyle = pair === 1 ? '#450a0a' : '#1c1917';
        ctx.strokeStyle = isEnraged ? '#dc2626' : '#78350f';
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(side * 16, yAnchor);
        ctx.quadraticCurveTo(side * (span * 0.65), tipY - 12, side * span, tipY);
        ctx.lineTo(side * (span * 0.72), tipY + 18);
        ctx.lineTo(side * 18, yAnchor + 12);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
    }

    // 3. Tattered Multi-Layered Inquisitor Vestments & Ribbed Obsidian Cuirass
    ctx.fillStyle = '#1c1917';
    ctx.strokeStyle = isEnraged ? '#dc2626' : '#b45309';
    ctx.lineWidth = 2.8;
    ctx.beginPath();
    ctx.moveTo(-28, -24);
    ctx.lineTo(0, -32);
    ctx.lineTo(28, -24);
    ctx.lineTo(22, 16);
    ctx.lineTo(28, 42);
    ctx.lineTo(10, 34);
    ctx.lineTo(0, 44);
    ctx.lineTo(-10, 34);
    ctx.lineTo(-28, 42);
    ctx.lineTo(-22, 16);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 4. Abyssal Singularity Core & Ribcage Grille in Chest
    ctx.fillStyle = isEnraged ? 'rgba(239, 68, 68, 0.35)' : 'rgba(245, 158, 11, 0.3)';
    ctx.beginPath();
    ctx.arc(0, 4, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = isEnraged ? '#dc2626' : '#d97706';
    ctx.beginPath();
    ctx.arc(0, 4, 14, 0, Math.PI * 2);
    ctx.fill();

    // Curved Gothic Ribcage over Core
    ctx.strokeStyle = '#292524';
    ctx.lineWidth = 3;
    for (let ry = -6; ry <= 14; ry += 10) {
      ctx.beginPath();
      ctx.moveTo(-16, ry);
      ctx.quadraticCurveTo(0, ry + 5, 16, ry);
      ctx.stroke();
    }

    // 5. Horned Lich Skull & Tall Gothic Inquisitor Mitre Crown
    ctx.fillStyle = '#e2e8f0';
    ctx.beginPath();
    ctx.moveTo(-12, -36);
    ctx.lineTo(12, -36);
    ctx.lineTo(10, -20);
    ctx.lineTo(0, -16);
    ctx.lineTo(-10, -20);
    ctx.closePath();
    ctx.fill();

    // Tall Spiked Obsidian Crown / Mitre
    ctx.fillStyle = '#1c1917';
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-14, -34);
    ctx.lineTo(-18, -56);
    ctx.lineTo(-7, -44);
    ctx.lineTo(0, -64);
    ctx.lineTo(7, -44);
    ctx.lineTo(18, -56);
    ctx.lineTo(14, -34);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Blazing Crimson Eye Sockets
    ctx.fillStyle = isEnraged ? '#fef08a' : '#ef4444';
    ctx.beginPath();
    ctx.arc(-5, -28, 2.8, 0, Math.PI * 2);
    ctx.arc(5, -28, 2.8, 0, Math.PI * 2);
    ctx.fill();

    // 6. Articulated Skeletal Arms: Right Arm Wields Abyssal Great-Scythe, Left Arm Channels Astral Astrolabe
    const scytheSwing = Math.sin(time * 4.5) * 0.28;
    ctx.save();
    ctx.translate(36, -4);
    ctx.rotate(scytheSwing);
    // Scythe Shaft
    ctx.strokeStyle = '#44403c';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-8, 32);
    ctx.lineTo(12, -38);
    ctx.stroke();
    // Curved Crimson Great-Scythe Blade
    ctx.fillStyle = '#dc2626';
    ctx.strokeStyle = '#fef08a';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(12, -38);
    ctx.quadraticCurveTo(46, -36, 54, -8);
    ctx.quadraticCurveTo(32, -22, 10, -26);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // Left Arm: Spinning Astral Astrolabe
    const orbY = -4 + Math.cos(time * 4.5) * 6;
    ctx.save();
    ctx.translate(-46, orbY);
    ctx.rotate(-time * 3);
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, 0, 14, 7, 0, 0, Math.PI * 2);
    ctx.ellipse(0, 0, 7, 14, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.arc(0, 0, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.restore();

    if (enemy.bossShieldActive) {
      this.drawBossImmunityShield(ctx, enemy.radius + 20, time, '#f59e0b');
    }

    // Boss Health Bar (Zero Text Clutter)
    this.drawGothicHealthBar(ctx, 0, -enemy.radius - 26, 120, 9, enemy.currentHp, enemy.maxHp);
  }

  /* ========================================================================= */
  /*                          ENVIRONMENT & OBJECTS                            */
  /* ========================================================================= */

  /**
   * Detailed carved medieval chest with arched oak lid, iron bandings, and golden treasure glow (Zero Text).
   */
  public static drawChest(ctx: CanvasRenderingContext2D, x: number, y: number, isOpen: boolean, time: number) {
    ctx.save();
    ctx.translate(x, y);

    // Floor shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.beginPath();
    ctx.ellipse(0, 16, 26, 10, 0, 0, Math.PI * 2);
    ctx.fill();

    if (isOpen) {
      // Open Chest with Golden Light Aura
      ctx.fillStyle = 'rgba(217, 119, 6, 0.22)';
      ctx.beginPath();
      ctx.arc(0, -6, 40, 0, Math.PI * 2);
      ctx.fill();

      // Lower box
      ctx.fillStyle = '#451a03';
      ctx.fillRect(-22, -8, 44, 24);
      ctx.fillStyle = '#292524';
      ctx.fillRect(-22, -8, 6, 24);
      ctx.fillRect(16, -8, 6, 24);

      // Open Arched Lid tilted back
      ctx.fillStyle = '#78350f';
      ctx.beginPath();
      ctx.moveTo(-24, -12);
      ctx.quadraticCurveTo(0, -32, 24, -12);
      ctx.closePath();
      ctx.fill();

      // Overflowing Gold & Gems Inside
      ctx.fillStyle = '#facc15';
      ctx.beginPath();
      ctx.ellipse(0, -6, 16, 5, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      const pulse = Math.sin(time * 3.5) * 1.5;

      // Golden invitation halo beneath closed chest
      ctx.strokeStyle = 'rgba(250, 204, 21, 0.45)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(0, 12, 28 + pulse, 11, 0, 0, Math.PI * 2);
      ctx.stroke();

      // Dark Oak Body
      ctx.fillStyle = '#451a03';
      ctx.fillRect(-22, -10 + pulse, 44, 24);

      // Arched Oak Lid (custom bezier arch, no roundRect)
      ctx.fillStyle = '#78350f';
      ctx.strokeStyle = '#292524';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-24, -10 + pulse);
      ctx.quadraticCurveTo(-24, -25 + pulse, 0, -25 + pulse);
      ctx.quadraticCurveTo(24, -25 + pulse, 24, -10 + pulse);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Wrought Iron Straps & Rivets
      ctx.fillStyle = '#292524';
      ctx.fillRect(-16, -23 + pulse, 6, 37);
      ctx.fillRect(10, -23 + pulse, 6, 37);

      // Golden Rivets
      ctx.fillStyle = '#d97706';
      ctx.beginPath();
      ctx.arc(-13, -16 + pulse, 1.5, 0, Math.PI * 2);
      ctx.arc(13, -16 + pulse, 1.5, 0, Math.PI * 2);
      ctx.arc(-13, 6 + pulse, 1.5, 0, Math.PI * 2);
      ctx.arc(13, 6 + pulse, 1.5, 0, Math.PI * 2);
      ctx.fill();

      // Ornate Brass Skull Padlock
      ctx.fillStyle = '#f59e0b';
      ctx.beginPath();
      ctx.arc(0, -8 + pulse, 5.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1c1917';
      ctx.beginPath();
      ctx.arc(0, -8 + pulse, 2, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  /**
   * Heavy double oak doors with iron bands, drop-portcullis, and swirling runic portals (Zero Text).
   */
  public static drawDoor(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    isOpen: boolean,
    door?: DoorState
  ) {
    ctx.save();

    // Stone Archway Frame with Chiseled Pillars
    ctx.fillStyle = '#1c1917';
    ctx.fillRect(x - 6, y - 6, w + 12, h + 12);
    ctx.strokeStyle = '#44403c';
    ctx.lineWidth = 3;
    ctx.strokeRect(x - 6, y - 6, w + 12, h + 12);

    const enc = door?.encounterType || 'STANDARD';
    const portalColor =
      enc === 'ELITE' ? '#dc2626' : enc === 'SANCTUARY' ? '#10b981' : enc === 'BOSS' ? '#f97316' : '#22c55e';

    if (isOpen) {
      ctx.fillStyle = '#090807';
      ctx.fillRect(x, y, w, h);

      // Swirling Energy Vortex inside open doorway
      ctx.fillStyle = portalColor;
      ctx.globalAlpha = 0.78;
      ctx.fillRect(x + 6, y + 4, w - 12, h - 8);
      ctx.globalAlpha = 1.0;

      // Bright Inner Portal Core & Crest Icon (Visual symbol instead of text: Skull for Elite/Boss, Scales for Sanctuary)
      const cx = x + w / 2;
      const cy = y + h / 2;
      ctx.strokeStyle = '#fef08a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, Math.min(w, h) * 0.28, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.fillStyle = '#292524';
      ctx.fillRect(x, y, w, h);

      ctx.strokeStyle = '#1c1917';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x + w / 2, y);
      ctx.lineTo(x + w / 2, y + h);
      ctx.stroke();

      // Iron Portcullis Bars & Crimson Spikes
      ctx.strokeStyle = '#78716c';
      ctx.lineWidth = 3.5;
      for (let barX = x + 12; barX < x + w - 4; barX += 16) {
        ctx.beginPath();
        ctx.moveTo(barX, y);
        ctx.lineTo(barX, y + h);
        ctx.stroke();

        ctx.fillStyle = '#991b1b';
        ctx.beginPath();
        ctx.moveTo(barX - 3, y + h - 8);
        ctx.lineTo(barX, y + h);
        ctx.lineTo(barX + 3, y + h - 8);
        ctx.fill();
      }
    }

    ctx.restore();
  }

  /**
   * Renders the Altar of Pacts & Armory:
   * Stepped Gothic Stone Pedestal with a Forged Iron Anvil & Warhammer + Levitating Blood Chalice (Zero Text).
   */
  public static drawAltar(ctx: CanvasRenderingContext2D, altar: AltarEntity, time: number) {
    ctx.save();
    ctx.translate(altar.x, altar.y);

    const pulse = Math.sin(time * 4) * 3;

    // Mystical Runic Halo on Floor
    ctx.fillStyle = altar.pact.used ? 'rgba(120, 113, 108, 0.15)' : 'rgba(168, 85, 247, 0.22)';
    ctx.beginPath();
    ctx.arc(0, 0, 48 + pulse, 0, Math.PI * 2);
    ctx.fill();

    // Stepped Chiseled Gothic Pedestal (Polygonal stone plinth)
    ctx.fillStyle = '#1c1917';
    ctx.strokeStyle = '#a855f7';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-26, 14);
    ctx.lineTo(-22, -12);
    ctx.lineTo(22, -12);
    ctx.lineTo(26, 14);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Forged Iron Anvil on Pedestal
    ctx.fillStyle = '#57534e';
    ctx.strokeStyle = '#d97706';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-14, -12);
    ctx.lineTo(-18, -20);
    ctx.lineTo(14, -20);
    ctx.lineTo(22, -16);
    ctx.lineTo(12, -12);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Floating Golden Pact Chalice / Flame above Anvil
    const floatY = -28 + pulse * 0.6;
    ctx.fillStyle = altar.pact.used ? '#f59e0b' : '#c084fc';
    ctx.beginPath();
    ctx.moveTo(-6, floatY - 6);
    ctx.lineTo(6, floatY - 6);
    ctx.lineTo(3, floatY + 2);
    ctx.lineTo(-3, floatY + 2);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  /**
   * Renders Interactive Barrels with curved wooden staves and iron hoops (Explosive, Frost, Toxic).
   */
  public static drawBarrel(ctx: CanvasRenderingContext2D, barrel: BarrelEntity, time: number) {
    ctx.save();
    ctx.translate(barrel.x, barrel.y);

    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.beginPath();
    ctx.ellipse(0, 14, 16, 7, 0, 0, Math.PI * 2);
    ctx.fill();

    const mainColor =
      barrel.type === 'FROST' ? '#0284c7' : barrel.type === 'TOXIC' ? '#15803d' : '#991b1b';
    const rimColor =
      barrel.type === 'FROST' ? '#38bdf8' : barrel.type === 'TOXIC' ? '#4ade80' : '#f97316';

    // Curved Wooden Stave Cask Silhouette (bezier curves instead of roundRect)
    ctx.fillStyle = mainColor;
    ctx.strokeStyle = '#1c1917';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-11, -16);
    ctx.lineTo(11, -16);
    ctx.quadraticCurveTo(16, 0, 11, 16);
    ctx.lineTo(-11, 16);
    ctx.quadraticCurveTo(-16, 0, -11, -16);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Iron Hoops
    ctx.fillStyle = '#44403c';
    ctx.fillRect(-14, -10, 28, 3.5);
    ctx.fillRect(-14, 6, 28, 3.5);

    // Glowing Elemental Core Emblem
    const pulse = Math.sin(time * 7 + barrel.x) * 1.5;
    ctx.fillStyle = rimColor;
    ctx.beginPath();
    ctx.arc(0, 0, 5 + pulse * 0.4, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  /**
   * Renders Environmental & Skill Hazards (Lava, Poison Cloud, Spike Traps, Arcane Vortex, Meteor Strike, Bear Trap, Decoy Bomb).
   */
  public static drawHazard(ctx: CanvasRenderingContext2D, h: HazardZone, time: number) {
    ctx.save();
    ctx.translate(h.x, h.y);

    if (h.type === 'LAVA') {
      const bubble = Math.sin(time * 5 + h.x) * 3;
      ctx.fillStyle = 'rgba(220, 38, 38, 0.38)';
      ctx.beginPath();
      ctx.arc(0, 0, h.radius + bubble, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#f97316';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, h.radius * 0.75, 0, Math.PI * 2);
      ctx.stroke();
    } else if (h.type === 'POISON_CLOUD') {
      const swirl = Math.cos(time * 4 + h.y) * 4;
      ctx.fillStyle = 'rgba(22, 163, 74, 0.28)';
      ctx.beginPath();
      ctx.arc(0, 0, h.radius + swirl, 0, Math.PI * 2);
      ctx.fill();
    } else if (h.type === 'SPIKE_TRAP') {
      ctx.fillStyle = '#1c1917';
      ctx.strokeStyle = h.active ? '#ef4444' : '#57534e';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, h.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      const positions = [
        { x: -12, y: -12 },
        { x: 12, y: -12 },
        { x: 0, y: 0 },
        { x: -12, y: 12 },
        { x: 12, y: 12 },
      ];
      for (const pos of positions) {
        if (h.active) {
          ctx.fillStyle = '#e2e8f0';
          ctx.beginPath();
          ctx.moveTo(pos.x - 5, pos.y + 4);
          ctx.lineTo(pos.x, pos.y - 12);
          ctx.lineTo(pos.x + 5, pos.y + 4);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = '#dc2626';
          ctx.fillRect(pos.x - 1.5, pos.y - 12, 3, 5);
        } else {
          ctx.fillStyle = '#090807';
          ctx.beginPath();
          ctx.arc(pos.x, pos.y, 4, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    } else if (h.type === 'ARCANE_VORTEX') {
      ctx.rotate(time * 6);
      ctx.fillStyle = 'rgba(147, 51, 234, 0.22)';
      ctx.beginPath();
      ctx.arc(0, 0, h.radius, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2.5;
      for (let i = 0; i < 3; i++) {
        const a = (i * Math.PI * 2) / 3;
        ctx.beginPath();
        ctx.arc(0, 0, h.radius * 0.65, a, a + 1.2);
        ctx.stroke();
      }
    } else if (h.type === 'METEOR_STRIKE') {
      const prog = Math.min(1, (Date.now() - h.createdAt) / h.durationMs);
      ctx.fillStyle = 'rgba(239, 68, 68, 0.18)';
      ctx.beginPath();
      ctx.arc(0, 0, h.radius, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, h.radius, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = 'rgba(220, 38, 38, 0.45)';
      ctx.beginPath();
      ctx.arc(0, 0, h.radius * prog, 0, Math.PI * 2);
      ctx.fill();
    } else if (h.type === 'DECOY_BOMB') {
      const pulse = Math.sin(time * 18) * 3;
      ctx.strokeStyle = 'rgba(16, 185, 129, 0.5)';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.arc(0, 0, h.radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      // Hooded Shadow Clone Silhouette with Ticking Alchemical Core (Zero Text)
      ctx.fillStyle = '#064e3b';
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, -16);
      ctx.lineTo(12, 12);
      ctx.lineTo(-12, 12);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#34d399';
      ctx.beginPath();
      ctx.arc(0, 2, 5 + pulse * 0.5, 0, Math.PI * 2);
      ctx.fill();
    } else if (h.type === 'BEAR_TRAP') {
      // Serrated Steel Jaws of Hunter's Bear Trap
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(0, 0, 14, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#f97316';
      ctx.beginPath();
      ctx.arc(0, 0, 5, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  /**
   * Wall Torch with multi-layered flickering flame and ornate serpent iron sconce.
   */
  public static drawTorch(ctx: CanvasRenderingContext2D, x: number, y: number, time: number) {
    ctx.save();
    ctx.translate(x, y);

    // Ornate Coiled Serpent Iron Sconce
    ctx.strokeStyle = '#1c1917';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(0, 14);
    ctx.quadraticCurveTo(-4, 6, 0, 0);
    ctx.lineTo(8, -6);
    ctx.stroke();

    // Rivet mounting plate
    ctx.fillStyle = '#44403c';
    ctx.fillRect(-3, 6, 6, 8);
    ctx.fillStyle = '#78716c';
    ctx.beginPath();
    ctx.arc(0, 10, 1.5, 0, Math.PI * 2);
    ctx.fill();

    // Blackened Iron Torch Basket
    ctx.fillStyle = '#292524';
    ctx.beginPath();
    ctx.moveTo(4, -5);
    ctx.lineTo(12, -5);
    ctx.lineTo(10, -11);
    ctx.lineTo(6, -11);
    ctx.closePath();
    ctx.fill();

    // Burning Coals inside Basket
    ctx.fillStyle = '#7f1d1d';
    ctx.fillRect(6, -10, 4, 3);

    // Multi-layered Flickering Flame
    const flick1 = Math.sin(time * 18 + x) * 2;
    const flick2 = Math.cos(time * 24 + y) * 1.5;

    ctx.fillStyle = '#ea580c';
    ctx.beginPath();
    ctx.moveTo(4, -10);
    ctx.quadraticCurveTo(2 + flick1, -18, 8 + flick2, -22);
    ctx.quadraticCurveTo(14 - flick1, -17, 12, -10);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#f59e0b';
    ctx.beginPath();
    ctx.moveTo(5, -10);
    ctx.quadraticCurveTo(4 + flick1 * 0.7, -15, 8 + flick2 * 0.5, -18);
    ctx.quadraticCurveTo(12 - flick1 * 0.7, -15, 11, -10);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#fef08a';
    ctx.beginPath();
    ctx.arc(8 + flick2 * 0.3, -12, 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  /**
   * Majestic Gothic Stone Pillar with fluting, iron bands, gargoyle capital, and cast floor shadow.
   */
  public static drawGothicPillar(ctx: CanvasRenderingContext2D, x: number, y: number, time: number) {
    ctx.save();
    ctx.translate(x, y);

    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.beginPath();
    ctx.ellipse(14, 18, 30, 14, Math.PI / 6, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#1c1917';
    ctx.fillRect(-22, 4, 44, 16);
    ctx.strokeStyle = '#44403c';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(-22, 4, 44, 16);

    ctx.fillStyle = '#292524';
    ctx.fillRect(-18, -4, 36, 8);
    ctx.strokeRect(-18, -4, 36, 8);

    ctx.fillStyle = '#1c1917';
    ctx.fillRect(-14, -48, 28, 44);

    ctx.strokeStyle = '#44403c';
    ctx.lineWidth = 1.5;
    for (let lx = -10; lx <= 10; lx += 5) {
      ctx.beginPath();
      ctx.moveTo(lx, -48);
      ctx.lineTo(lx, 0);
      ctx.stroke();
    }

    ctx.fillStyle = '#57534e';
    ctx.fillRect(-15, -28, 30, 5);
    ctx.fillStyle = '#d97706';
    ctx.beginPath();
    ctx.arc(-8, -25.5, 1.2, 0, Math.PI * 2);
    ctx.arc(0, -25.5, 1.2, 0, Math.PI * 2);
    ctx.arc(8, -25.5, 1.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#292524';
    ctx.beginPath();
    ctx.moveTo(-20, -48);
    ctx.lineTo(20, -48);
    ctx.lineTo(16, -58);
    ctx.lineTo(-16, -58);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#57534e';
    ctx.stroke();

    ctx.fillStyle = '#78716c';
    ctx.beginPath();
    ctx.arc(0, -53, 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  /**
   * Ancient Gothic Ritual Circle engraved into stone with carved crystal nodes and central eye crest (Zero Text).
   */
  public static drawRitualCircle(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    radius: number,
    time: number,
    theme: 'ice' | 'mud' | 'fire' | 'gold'
  ) {
    ctx.save();
    ctx.translate(x, y);

    const mainColor =
      theme === 'ice'
        ? '#38bdf8'
        : theme === 'mud'
        ? '#22c55e'
        : theme === 'fire'
        ? '#ea580c'
        : '#d97706';

    const glowColor =
      theme === 'ice'
        ? 'rgba(56, 189, 248, 0.16)'
        : theme === 'mud'
        ? 'rgba(34, 197, 94, 0.14)'
        : theme === 'fire'
        ? 'rgba(234, 88, 12, 0.2)'
        : 'rgba(217, 119, 6, 0.16)';

    ctx.fillStyle = glowColor;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = mainColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = mainColor;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.85, 0, Math.PI * 2);
    ctx.stroke();

    // Octagram (8-pointed star)
    ctx.lineWidth = 1.2;
    const rOuter = radius * 0.85;
    const rInner = radius * 0.42;
    ctx.beginPath();
    for (let i = 0; i < 16; i++) {
      const a = (i * Math.PI) / 8;
      const r = i % 2 === 0 ? rOuter : rInner;
      const px = Math.cos(a) * r;
      const py = Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.stroke();

    // 8 Carved Diamond Crystal Nodes around Ring
    ctx.fillStyle = mainColor;
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4 + Math.PI / 8;
      const rx = Math.cos(a) * (radius * 0.92);
      const ry = Math.sin(a) * (radius * 0.92);
      ctx.beginPath();
      ctx.moveTo(rx, ry - 4);
      ctx.lineTo(rx + 4, ry);
      ctx.lineTo(rx, ry + 4);
      ctx.lineTo(rx - 4, ry);
      ctx.closePath();
      ctx.fill();
    }

    // Center All-Seeing Eye Crest
    ctx.fillStyle = mainColor;
    ctx.beginPath();
    ctx.ellipse(0, 0, radius * 0.18, radius * 0.11, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0c0a09';
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.06, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  /**
   * Spun spiderweb in dungeon corners.
   */
  public static drawWallCobwebs(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    size: number,
    corner: 'TL' | 'TR' | 'BL' | 'BR'
  ) {
    ctx.save();
    ctx.translate(x, y);

    const sx = corner === 'TR' || corner === 'BR' ? -1 : 1;
    const sy = corner === 'BL' || corner === 'BR' ? -1 : 1;
    ctx.scale(sx, sy);

    ctx.strokeStyle = 'rgba(214, 211, 209, 0.2)';
    ctx.lineWidth = 1;

    for (let a = 0; a <= Math.PI / 2; a += Math.PI / 8) {
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * size, Math.sin(a) * size);
      ctx.stroke();
    }

    for (let r = size * 0.25; r <= size; r += size * 0.25) {
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI / 2);
      ctx.stroke();
    }

    ctx.restore();
  }

  /**
   * Weathered skull and shattered femur bone pile.
   */
  public static drawBonePile(ctx: CanvasRenderingContext2D, x: number, y: number) {
    ctx.save();
    ctx.translate(x, y);

    ctx.fillStyle = '#e2e8f0';
    ctx.beginPath();
    ctx.arc(0, 0, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1c1917';
    ctx.beginPath();
    ctx.arc(-1.5, -0.5, 1.2, 0, Math.PI * 2);
    ctx.arc(1.5, -0.5, 1.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(-9, 4);
    ctx.lineTo(7, -3);
    ctx.moveTo(-6, -4);
    ctx.lineTo(8, 5);
    ctx.stroke();

    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(4, 3, 5, -Math.PI / 2, Math.PI / 3);
    ctx.stroke();

    ctx.restore();
  }

  /**
   * Hanging iron chain dangling from dungeon wall with pendular sway.
   */
  public static drawWallChain(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    links: number,
    time: number
  ) {
    ctx.save();
    ctx.translate(x, y);

    const sway = Math.sin(time * 2.2 + x) * 1.5;

    ctx.fillStyle = '#44403c';
    ctx.fillRect(-4, 0, 8, 4);

    for (let i = 0; i < links; i++) {
      const ly = 4 + i * 7;
      const lx = (i / links) * sway;

      ctx.strokeStyle = '#57534e';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.ellipse(lx, ly, 2.5, 4.5, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    const endY = 4 + links * 7;
    ctx.strokeStyle = '#292524';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(sway, endY + 4, 5, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();
  }

  /**
   * Heavy iron floor drain with dark vertical bars.
   */
  public static drawFloorDrain(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
    ctx.save();
    ctx.translate(x, y);

    ctx.fillStyle = '#090807';
    ctx.fillRect(-size / 2, -size / 2, size, size);

    ctx.strokeStyle = '#292524';
    ctx.lineWidth = 2;
    ctx.strokeRect(-size / 2, -size / 2, size, size);

    ctx.strokeStyle = '#57534e';
    ctx.lineWidth = 1.5;
    for (let bx = -size / 2 + 5; bx < size / 2; bx += 6) {
      ctx.beginPath();
      ctx.moveTo(bx, -size / 2 + 2);
      ctx.lineTo(bx, size / 2 - 2);
      ctx.stroke();
    }

    ctx.restore();
  }

  /* ========================================================================= */
  /*                             GOTHIC HEALTH BAR                             */
  /* ========================================================================= */

  private static drawGothicHealthBar(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    current: number,
    max: number
  ) {
    const pct = Math.max(0, Math.min(1, current / max));

    ctx.fillStyle = '#0c0a09';
    ctx.fillRect(x - width / 2 - 1, y - height / 2 - 1, width + 2, height + 2);

    ctx.fillStyle = pct > 0.5 ? '#b91c1c' : pct > 0.25 ? '#ea580c' : '#7f1d1d';
    ctx.fillRect(x - width / 2, y - height / 2, width * pct, height);

    ctx.strokeStyle = '#44403c';
    ctx.lineWidth = 1;
    ctx.strokeRect(x - width / 2 - 1, y - height / 2 - 1, width + 2, height + 2);
  }

  /**
   * Renders interior Labyrinth Stone Masonry Walls and Cracked Secret Vault Walls
   * with golden lightbeams and treasure glints leaking through the fractures (Zero Text Clutter).
   */
  public static drawLabyrinthWall(ctx: CanvasRenderingContext2D, wall: WallSegment, time: number) {
    if (wall.isOpen) {
      // Scattered stone rubble on the floor where the secret wall shattered
      ctx.save();
      ctx.fillStyle = '#292524';
      ctx.strokeStyle = '#57534e';
      ctx.lineWidth = 1;
      for (let i = 0; i < 4; i++) {
        const rx = wall.x + 8 + ((i * 17) % Math.max(12, wall.width - 14));
        const ry = wall.y + 10 + ((i * 29) % Math.max(14, wall.height - 18));
        ctx.beginPath();
        ctx.arc(rx, ry, 5 + (i % 2) * 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
      return;
    }

    ctx.save();
    // Cast drop shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.fillRect(wall.x + 6, wall.y + 8, wall.width, wall.height);

    // Base Stone Masonry
    ctx.fillStyle = wall.isSecretWall ? '#292524' : '#1c1917';
    ctx.strokeStyle = wall.isSecretWall ? '#d97706' : '#44403c';
    ctx.lineWidth = 2;
    ctx.fillRect(wall.x, wall.y, wall.width, wall.height);
    ctx.strokeRect(wall.x, wall.y, wall.width, wall.height);

    // Individual Interlocking Stone Ashlar Blocks & Mortar Joints
    ctx.strokeStyle = '#0c0a09';
    ctx.lineWidth = 1.5;
    const isVertical = wall.height > wall.width;
    if (isVertical) {
      for (let by = wall.y + 28; by < wall.y + wall.height - 8; by += 28) {
        ctx.beginPath();
        ctx.moveTo(wall.x + 2, by);
        ctx.lineTo(wall.x + wall.width - 2, by);
        ctx.stroke();
      }
    } else {
      for (let bx = wall.x + 34; bx < wall.x + wall.width - 8; bx += 34) {
        ctx.beginPath();
        ctx.moveTo(bx, wall.y + 2);
        ctx.lineTo(bx, wall.y + wall.height - 2);
        ctx.stroke();
      }
    }

    if (wall.isSecretWall) {
      // Deep Structural Fractures Leaking Warm Golden Treasure Light & Floating Gold Motes (Zero Text!)
      const shimmer = 0.55 + Math.sin(time * 6) * 0.35;
      const cx = wall.x + wall.width / 2;
      const cy = wall.y + wall.height / 2;

      // Warm golden light spill around cracked masonry
      ctx.fillStyle = `rgba(250, 204, 21, ${shimmer * 0.24})`;
      ctx.beginPath();
      ctx.arc(cx, cy, 38, 0, Math.PI * 2);
      ctx.fill();

      // Jagged golden fissures & cracks
      ctx.strokeStyle = `rgba(253, 224, 71, ${shimmer})`;
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.moveTo(cx - 8, cy - 32);
      ctx.lineTo(cx + 5, cy - 10);
      ctx.lineTo(cx - 7, cy + 8);
      ctx.lineTo(cx + 8, cy + 30);
      ctx.moveTo(cx + 5, cy - 10);
      ctx.lineTo(cx + 13, cy - 2);
      ctx.stroke();
    }

    ctx.restore();
  }

  /**
   * Renders Co-op Runic Synchronization Seals on the floor:
   * Sunken octagonal stone pedestal with 8 crystal sockets that ignite progressively as players stand on it,
   * and an animated mechanical iris eye in the center (Zero Text Clutter).
   */
  public static drawSyncSeal(ctx: CanvasRenderingContext2D, seal: SyncSeal, time: number) {
    ctx.save();
    ctx.translate(seal.x, seal.y);

    const activeColor = seal.isActivated ? '#22c55e' : seal.progress > 0 ? '#38bdf8' : '#a855f7';
    const glowFill = seal.isActivated
      ? 'rgba(34, 197, 94, 0.22)'
      : seal.progress > 0
      ? 'rgba(56, 189, 248, 0.24)'
      : 'rgba(168, 85, 247, 0.16)';

    // Floor aura
    ctx.fillStyle = glowFill;
    ctx.beginPath();
    ctx.arc(0, 0, seal.radius, 0, Math.PI * 2);
    ctx.fill();

    // Sunken Octagonal Stone Pedestal Ring
    ctx.strokeStyle = '#44403c';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 0, seal.radius, 0, Math.PI * 2);
    ctx.stroke();

    // Progress Arc (0% -> 100%)
    const pct = seal.isActivated ? 1 : Math.max(0.06, seal.progress);
    ctx.strokeStyle = activeColor;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(0, 0, seal.radius, -Math.PI / 2, -Math.PI / 2 + pct * Math.PI * 2);
    ctx.stroke();

    // 8 Carved Crystal Sockets around the perimeter that light up one by one with progress!
    const litSockets = Math.round(pct * 8);
    for (let i = 0; i < 8; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 4;
      const sx = Math.cos(a) * (seal.radius - 10);
      const sy = Math.sin(a) * (seal.radius - 10);
      const isLit = seal.isActivated || i < litSockets;

      ctx.fillStyle = isLit ? activeColor : '#1c1917';
      ctx.strokeStyle = isLit ? '#ffffff' : '#57534e';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(sx, sy - 4.5);
      ctx.lineTo(sx + 4.5, sy);
      ctx.lineTo(sx, sy + 4.5);
      ctx.lineTo(sx - 4.5, sy);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    // Inner Rotating Astrolabe Star
    ctx.save();
    ctx.rotate(time * (seal.isActivated ? 1.5 : 3.2));
    ctx.strokeStyle = activeColor;
    ctx.lineWidth = 1.6;
    for (let r = 0; r < 2; r++) {
      ctx.rotate(Math.PI / 4);
      ctx.strokeRect(-16, -16, 32, 32);
    }
    ctx.restore();

    // Center Mechanical All-Seeing Eye (opens wider as seal charges!)
    const eyeOpen = seal.isActivated ? 9 : 4 + pct * 5;
    ctx.fillStyle = activeColor;
    ctx.beginPath();
    ctx.ellipse(0, 0, 15, eyeOpen, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#09090b';
    ctx.beginPath();
    ctx.arc(0, 0, 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }
}
