import { PlayerEntity, EnemyEntity, HeartPickup } from '../types';

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

    // Mercy invulnerability i-frames flicker
    const isInvulnerable = player.invulnerableUntil && Date.now() < player.invulnerableUntil;
    if (isInvulnerable) {
      if (Math.floor(Date.now() / 65) % 2 === 0) {
        ctx.globalAlpha = 0.35;
      }
    }

    if (!player.isAlive) {
      // Fallen Hero: Skeletal tombstone & pool of blood
      ctx.fillStyle = '#450a0a';
      ctx.beginPath();
      ctx.ellipse(0, 4, 18, 9, 0, 0, Math.PI * 2);
      ctx.fill();

      // Stone grave marker
      ctx.fillStyle = '#44403c';
      ctx.strokeStyle = '#292524';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(-10, -20, 20, 24, [6, 6, 0, 0]);
      ctx.fill();
      ctx.stroke();

      // Inscribed cross
      ctx.strokeStyle = '#1c1917';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, -16);
      ctx.lineTo(0, -6);
      ctx.moveTo(-5, -12);
      ctx.lineTo(5, -12);
      ctx.stroke();

      ctx.fillStyle = '#991b1b';
      ctx.font = 'bold 10px "Cinzel", serif';
      ctx.textAlign = 'center';
      ctx.fillText('CAÍDO', 0, -25);

      ctx.restore();
      return;
    }

    // Walking / breathing bobbing
    const speed = Math.hypot(player.vx, player.vy);
    const isMoving = speed > 15;
    const walkBob = isMoving ? Math.sin(time * 14) * 2.5 : Math.sin(time * 2.5) * 1.0;
    const walkTilt = isMoving ? Math.sin(time * 7) * 0.08 : 0;

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
    } else {
      this.drawMago(ctx, player, walkBob, walkTilt, time, isMoving);
    }

    ctx.restore();

    // Overhead HUD: Name & Health Bar (Gothic Frame)
    ctx.fillStyle = isLocal ? '#f59e0b' : '#d6d3d1';
    ctx.font = 'bold 11px "Cinzel", serif';
    ctx.textAlign = 'center';
    ctx.shadowColor = '#000000';
    ctx.shadowBlur = 4;
    ctx.fillText(`${player.name} ${player.isHost ? '👑' : ''}`, 0, -28);
    ctx.shadowBlur = 0;

    this.drawGothicHealthBar(ctx, 0, -20, 38, 5, player.currentHp, player.maxHp);

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

    // Pulsing Fiery Crystal Core
    const pulse = isCasting ? 3.5 : Math.sin(time * 6) * 1.5;
    ctx.fillStyle = '#ea580c';
    ctx.shadowColor = '#ea580c';
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(19, 2, 4 + pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

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

    // White flash on damage hit
    const isFlashing = enemy.flashUntil && Date.now() < enemy.flashUntil;
    if (isFlashing) {
      ctx.filter = 'brightness(2.5)';
    }

    if (enemy.isBoss) {
      this.drawBossDirector(ctx, enemy, time);
    } else if (enemy.type === 'SLIME') {
      this.drawSlime(ctx, enemy, time);
    } else if (enemy.type === 'ESQUELETO') {
      this.drawEsqueleto(ctx, enemy, time);
    } else {
      this.drawMurcielago(ctx, enemy, time);
    }

    ctx.restore();
  }

  /**
   * Floating ruby heart pickup with glowing aura and floating animation.
   */
  public static drawHeartPickup(ctx: CanvasRenderingContext2D, heart: HeartPickup, time: number) {
    const floatY = Math.sin(time * 4 + heart.x) * 3;

    ctx.save();
    ctx.translate(heart.x, heart.y + floatY);

    // Floor shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.beginPath();
    ctx.ellipse(0, 12 - floatY * 0.5, 9, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    // Red aura glow
    const pulse = Math.sin(time * 6 + heart.y) * 2;
    ctx.fillStyle = 'rgba(239, 68, 68, 0.25)';
    ctx.beginPath();
    ctx.arc(0, -2, 12 + pulse, 0, Math.PI * 2);
    ctx.fill();

    // Ruby Heart Shape
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

    // Specular shine
    ctx.fillStyle = '#fecaca';
    ctx.beginPath();
    ctx.arc(-2.5, -7.5, 1.5, 0, Math.PI * 2);
    ctx.fill();

    // +20 HP label
    ctx.fillStyle = '#fca5a5';
    ctx.font = 'bold 9px "Cinzel", serif';
    ctx.textAlign = 'center';
    ctx.fillText('+20 HP', 0, -15);

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
   * The Grand Boss: "El Gran Maestre / Director del Abismo".
   * A towering gothic gargoyle colossus with an iron furnace heart,
   * stone crown, and floating detached gauntlets.
   */
  private static drawBossDirector(ctx: CanvasRenderingContext2D, enemy: EnemyEntity, time: number) {
    const isEnraged = enemy.bossPhase === 2;
    const hoverY = Math.sin(time * 3) * 6;

    // Giant ominous shadow on floor
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.beginPath();
    ctx.ellipse(0, 60, 48, 16, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.translate(0, hoverY);

    // Stone Gargoyle Wings (Spread out)
    const wingFlap = Math.sin(time * 2.5) * 4;
    ctx.fillStyle = '#292524';
    ctx.strokeStyle = '#1c1917';
    ctx.lineWidth = 3;

    // Left Wing
    ctx.beginPath();
    ctx.moveTo(-20, -10);
    ctx.lineTo(-75, -50 + wingFlap);
    ctx.lineTo(-55, 0);
    ctx.lineTo(-20, 20);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Right Wing
    ctx.beginPath();
    ctx.moveTo(20, -10);
    ctx.lineTo(75, -50 + wingFlap);
    ctx.lineTo(55, 0);
    ctx.lineTo(20, 20);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Massive Stone Body / Obsidian Torso
    ctx.fillStyle = '#1c1917';
    ctx.beginPath();
    ctx.roundRect(-36, -36, 72, 72, [20]);
    ctx.fill();
    ctx.strokeStyle = '#44403c';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Molten Iron Furnace Heart (Center)
    ctx.fillStyle = isEnraged ? '#dc2626' : '#d97706';
    ctx.shadowColor = isEnraged ? '#ef4444' : '#f59e0b';
    ctx.shadowBlur = 20;
    ctx.beginPath();
    ctx.arc(0, 8, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Heavy Iron Furnace Grille Bars
    ctx.strokeStyle = '#1c1917';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(-14, -4);
    ctx.lineTo(-14, 20);
    ctx.moveTo(0, -8);
    ctx.lineTo(0, 24);
    ctx.moveTo(14, -4);
    ctx.lineTo(14, 20);
    ctx.stroke();

    // Obsidian Head & Horned Stone Crown
    ctx.fillStyle = '#292524';
    ctx.beginPath();
    ctx.arc(0, -32, 22, 0, Math.PI * 2);
    ctx.fill();

    // Horns
    ctx.fillStyle = '#44403c';
    ctx.beginPath();
    ctx.moveTo(-16, -38);
    ctx.lineTo(-32, -58);
    ctx.lineTo(-8, -44);
    ctx.moveTo(16, -38);
    ctx.lineTo(32, -58);
    ctx.lineTo(8, -44);
    ctx.fill();

    // Menacing Molten Eyes
    ctx.fillStyle = isEnraged ? '#f87171' : '#fef08a';
    ctx.fillRect(-10, -34, 6, 4);
    ctx.fillRect(4, -34, 6, 4);

    // Floating Detached Iron Gauntlets (Left & Right)
    const gauntletL = Math.sin(time * 4) * 8;
    const gauntletR = Math.cos(time * 4) * 8;

    // Left Gauntlet
    ctx.fillStyle = '#44403c';
    ctx.strokeStyle = '#1c1917';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(-60, -8 + gauntletL, 18, 26, [6]);
    ctx.fill();
    ctx.stroke();

    // Right Gauntlet
    ctx.beginPath();
    ctx.roundRect(42, -8 + gauntletR, 18, 26, [6]);
    ctx.fill();
    ctx.stroke();

    ctx.restore();

    // Huge Boss Health Bar
    this.drawGothicHealthBar(ctx, 0, -enemy.radius - 38, 120, 9, enemy.currentHp, enemy.maxHp);
    ctx.fillStyle = '#f59e0b';
    ctx.font = 'bold 13px "Cinzel", serif';
    ctx.textAlign = 'center';
    ctx.shadowColor = '#000000';
    ctx.shadowBlur = 4;
    ctx.fillText(enemy.name.toUpperCase(), 0, -enemy.radius - 50);
    ctx.shadowBlur = 0;
  }

  /* ========================================================================= */
  /*                          ENVIRONMENT & OBJECTS                            */
  /* ========================================================================= */

  /**
   * Detailed carved medieval chest with iron bandings and rivets.
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
      ctx.fillStyle = 'rgba(217, 119, 6, 0.2)';
      ctx.beginPath();
      ctx.arc(0, -6, 40, 0, Math.PI * 2);
      ctx.fill();

      // Lower box
      ctx.fillStyle = '#451a03';
      ctx.fillRect(-22, -8, 44, 24);
      ctx.fillStyle = '#292524';
      ctx.fillRect(-22, -8, 6, 24);
      ctx.fillRect(16, -8, 6, 24);

      // Open Lid tilted back
      ctx.fillStyle = '#78350f';
      ctx.fillRect(-24, -26, 48, 14);
      ctx.fillStyle = '#b45309';
      ctx.fillRect(-18, -26, 6, 14);
      ctx.fillRect(12, -26, 6, 14);

      // Treasure Glow Inside
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(-16, -6, 32, 6);
    } else {
      // Closed Ornate Treasure Chest
      const pulse = Math.sin(time * 3) * 1.5;

      // Dark Wood Body
      ctx.fillStyle = '#451a03';
      ctx.fillRect(-22, -14 + pulse, 44, 28);

      // Curved Wood Lid
      ctx.fillStyle = '#78350f';
      ctx.beginPath();
      ctx.roundRect(-24, -24 + pulse, 48, 14, [6, 6, 0, 0]);
      ctx.fill();

      // Wrought Iron Straps & Rivets
      ctx.fillStyle = '#292524';
      ctx.fillRect(-16, -24 + pulse, 6, 38);
      ctx.fillRect(10, -24 + pulse, 6, 38);

      // Golden Rivets
      ctx.fillStyle = '#d97706';
      ctx.beginPath();
      ctx.arc(-13, -18 + pulse, 1.5, 0, Math.PI * 2);
      ctx.arc(13, -18 + pulse, 1.5, 0, Math.PI * 2);
      ctx.arc(-13, 6 + pulse, 1.5, 0, Math.PI * 2);
      ctx.arc(13, 6 + pulse, 1.5, 0, Math.PI * 2);
      ctx.fill();

      // Ornate Brass Skull Padlock
      ctx.fillStyle = '#b45309';
      ctx.beginPath();
      ctx.arc(0, -6 + pulse, 5.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1c1917';
      ctx.beginPath();
      ctx.arc(0, -6 + pulse, 2, 0, Math.PI * 2);
      ctx.fill();

      // Floating Prompt
      ctx.fillStyle = '#f59e0b';
      ctx.font = 'bold 11px "Cinzel", serif';
      ctx.textAlign = 'center';
      ctx.shadowColor = '#000000';
      ctx.shadowBlur = 4;
      ctx.fillText('ABRIR COFRE', 0, -32 + pulse);
      ctx.shadowBlur = 0;
    }

    ctx.restore();
  }

  /**
   * Heavy double oak doors with iron bands and drop-portcullis.
   */
  public static drawDoor(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    isOpen: boolean
  ) {
    ctx.save();

    // Stone Archway Frame
    ctx.fillStyle = '#1c1917';
    ctx.fillRect(x - 6, y - 6, w + 12, h + 12);
    ctx.strokeStyle = '#44403c';
    ctx.lineWidth = 3;
    ctx.strokeRect(x - 6, y - 6, w + 12, h + 12);

    if (isOpen) {
      // Golden Portal to Next Chamber
      ctx.fillStyle = '#0c0a09';
      ctx.fillRect(x, y, w, h);

      // Golden light spilling out
      ctx.fillStyle = '#d97706';
      ctx.shadowColor = '#f59e0b';
      ctx.shadowBlur = 16;
      ctx.fillRect(x + 6, y + 4, w - 12, h - 8);
      ctx.shadowBlur = 0;

      ctx.fillStyle = '#fef3c7';
      ctx.font = 'bold 11px "Cinzel", serif';
      ctx.textAlign = 'center';
      ctx.fillText('AVANZAR ⬆', x + w / 2, y + h / 2 + 4);
    } else {
      // Heavy Oak Doors & Iron Portcullis Spikes
      ctx.fillStyle = '#292524';
      ctx.fillRect(x, y, w, h);

      // Wood Grain Lines
      ctx.strokeStyle = '#1c1917';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x + w / 2, y);
      ctx.lineTo(x + w / 2, y + h);
      ctx.stroke();

      // Iron Portcullis Spikes
      ctx.strokeStyle = '#78716c';
      ctx.lineWidth = 3.5;
      for (let barX = x + 12; barX < x + w - 4; barX += 16) {
        ctx.beginPath();
        ctx.moveTo(barX, y);
        ctx.lineTo(barX, y + h);
        ctx.stroke();

        // Spike tip
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
   * Wall Torch with flickering flame and warm ambient light.
   */
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

    // 1. Outer Flame Mantle (Fiery Orange with heat tongue)
    ctx.fillStyle = '#ea580c';
    ctx.beginPath();
    ctx.moveTo(4, -10);
    ctx.quadraticCurveTo(2 + flick1, -18, 8 + flick2, -22);
    ctx.quadraticCurveTo(14 - flick1, -17, 12, -10);
    ctx.closePath();
    ctx.fill();

    // 2. Mid Flame (Brilliant Gold)
    ctx.fillStyle = '#f59e0b';
    ctx.beginPath();
    ctx.moveTo(5, -10);
    ctx.quadraticCurveTo(4 + flick1 * 0.7, -15, 8 + flick2 * 0.5, -18);
    ctx.quadraticCurveTo(12 - flick1 * 0.7, -15, 11, -10);
    ctx.closePath();
    ctx.fill();

    // 3. Hot Core (Blinding Yellow-White)
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

    // Cast soft diagonal ground shadow (southeast)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.beginPath();
    ctx.ellipse(14, 18, 30, 14, Math.PI / 6, 0, Math.PI * 2);
    ctx.fill();

    // Stepped Chiseled Plinth (Base)
    ctx.fillStyle = '#1c1917';
    ctx.fillRect(-22, 4, 44, 16);
    ctx.strokeStyle = '#44403c';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(-22, 4, 44, 16);

    ctx.fillStyle = '#292524';
    ctx.fillRect(-18, -4, 36, 8);
    ctx.strokeRect(-18, -4, 36, 8);

    // Fluted Column Shaft
    ctx.fillStyle = '#1c1917';
    ctx.fillRect(-14, -48, 28, 44);

    // Fluting ridges (Vertical chisel lines)
    ctx.strokeStyle = '#44403c';
    ctx.lineWidth = 1.5;
    for (let lx = -10; lx <= 10; lx += 5) {
      ctx.beginPath();
      ctx.moveTo(lx, -48);
      ctx.lineTo(lx, 0);
      ctx.stroke();
    }

    // Iron Band around center column with rivets
    ctx.fillStyle = '#57534e';
    ctx.fillRect(-15, -28, 30, 5);
    ctx.fillStyle = '#d97706';
    ctx.beginPath();
    ctx.arc(-8, -25.5, 1.2, 0, Math.PI * 2);
    ctx.arc(0, -25.5, 1.2, 0, Math.PI * 2);
    ctx.arc(8, -25.5, 1.2, 0, Math.PI * 2);
    ctx.fill();

    // Ornate Carved Capital at top
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

    // Gargoyle stone crest on capital
    ctx.fillStyle = '#78716c';
    ctx.beginPath();
    ctx.arc(0, -53, 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  /**
   * Ancient Gothic Ritual Circle engraved into stone with runic symbols and glowing center crest.
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

    // Ambient runic floor glow
    ctx.fillStyle = glowColor;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();

    // Outer Concentric Ring
    ctx.strokeStyle = mainColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.stroke();

    // Inner Secondary Ring
    ctx.strokeStyle = mainColor;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.85, 0, Math.PI * 2);
    ctx.stroke();

    // Octagram (8-pointed geometric star)
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

    // Concentric Center Medallion
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.32, 0, Math.PI * 2);
    ctx.stroke();

    // 8 Engraved Arcane Runes in Ring
    ctx.fillStyle = mainColor;
    ctx.font = 'bold 12px "Cinzel", serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const runes = ['ᚦ', 'ᚱ', 'ᚲ', 'ᚷ', 'ᚹ', 'ᚺ', 'ᛃ', 'ᛈ'];
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4 + Math.PI / 8;
      const rx = Math.cos(a) * (radius * 0.92);
      const ry = Math.sin(a) * (radius * 0.92);
      ctx.fillText(runes[i], rx, ry);
    }

    // Center Demon Eye / Sol Invictus crest
    ctx.fillStyle = mainColor;
    ctx.beginPath();
    ctx.ellipse(0, 0, radius * 0.16, radius * 0.1, 0, 0, Math.PI * 2);
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

    // Radial spines
    for (let a = 0; a <= Math.PI / 2; a += Math.PI / 8) {
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * size, Math.sin(a) * size);
      ctx.stroke();
    }

    // Concentric web arches
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

    // Weathered skull
    ctx.fillStyle = '#e2e8f0';
    ctx.beginPath();
    ctx.arc(0, 0, 5, 0, Math.PI * 2);
    ctx.fill();
    // Eye sockets
    ctx.fillStyle = '#1c1917';
    ctx.beginPath();
    ctx.arc(-1.5, -0.5, 1.2, 0, Math.PI * 2);
    ctx.arc(1.5, -0.5, 1.2, 0, Math.PI * 2);
    ctx.fill();

    // Shattered Femur Bones
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(-9, 4);
    ctx.lineTo(7, -3);
    ctx.moveTo(-6, -4);
    ctx.lineTo(8, 5);
    ctx.stroke();

    // Ribcage curved remnant
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

    // Iron Wall Staple
    ctx.fillStyle = '#44403c';
    ctx.fillRect(-4, 0, 8, 4);

    // Interlocking Chain Links
    for (let i = 0; i < links; i++) {
      const ly = 4 + i * 7;
      const lx = (i / links) * sway;

      ctx.strokeStyle = '#57534e';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.ellipse(lx, ly, 2.5, 4.5, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Heavy Iron Shackle Collar at end
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

    // Dark square pit
    ctx.fillStyle = '#090807';
    ctx.fillRect(-size / 2, -size / 2, size, size);

    // Iron border rim
    ctx.strokeStyle = '#292524';
    ctx.lineWidth = 2;
    ctx.strokeRect(-size / 2, -size / 2, size, size);

    // Vertical Iron Grating Bars
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

    // Dark Iron Casing
    ctx.fillStyle = '#0c0a09';
    ctx.fillRect(x - width / 2 - 1, y - height / 2 - 1, width + 2, height + 2);

    // Blood Fill
    ctx.fillStyle = pct > 0.5 ? '#b91c1c' : pct > 0.25 ? '#ea580c' : '#7f1d1d';
    ctx.fillRect(x - width / 2, y - height / 2, width * pct, height);

    // Iron Rivet Border
    ctx.strokeStyle = '#44403c';
    ctx.lineWidth = 1;
    ctx.strokeRect(x - width / 2 - 1, y - height / 2 - 1, width + 2, height + 2);
  }
}
