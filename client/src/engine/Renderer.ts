import { GameWorldState, PlayerEntity, EnemyEntity, ProjectileEntity, DoorState } from '../types';
import { ParticleSystem } from './ParticleSystem';
import { FloatingTextManager } from './FloatingText';

export class GameRenderer {
  public cameraX = 0;
  public cameraY = 0;
  public screenShakeTime = 0;
  public screenShakeIntensity = 0;

  public particleSystem = new ParticleSystem();
  public textManager = new FloatingTextManager();

  public addScreenShake(intensity = 8, duration = 0.25) {
    this.screenShakeIntensity = intensity;
    this.screenShakeTime = duration;
  }

  public render(
    ctx: CanvasRenderingContext2D,
    world: GameWorldState,
    localPlayerId: string,
    canvasWidth: number,
    canvasHeight: number,
    dt: number
  ) {
    const localPlayer = world.players[localPlayerId];
    const roomW = world.room.width || 1200;
    const roomH = world.room.height || 800;

    // 1. Camera Tracking with smooth Lerp
    if (localPlayer) {
      const targetCamX = localPlayer.x - canvasWidth / 2;
      const targetCamY = localPlayer.y - canvasHeight / 2;
      this.cameraX += (targetCamX - this.cameraX) * 0.12;
      this.cameraY += (targetCamY - this.cameraY) * 0.12;
    } else {
      this.cameraX = roomW / 2 - canvasWidth / 2;
      this.cameraY = roomH / 2 - canvasHeight / 2;
    }

    // Update screen shake
    let shakeX = 0;
    let shakeY = 0;
    if (this.screenShakeTime > 0) {
      this.screenShakeTime -= dt;
      shakeX = (Math.random() * 2 - 1) * this.screenShakeIntensity;
      shakeY = (Math.random() * 2 - 1) * this.screenShakeIntensity;
      this.screenShakeIntensity = Math.max(0, this.screenShakeIntensity - dt * 25);
    }

    ctx.save();
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);

    // Apply Camera & Shake Transform
    ctx.translate(-Math.round(this.cameraX + shakeX), -Math.round(this.cameraY + shakeY));

    // 2. Draw Floor & Walls
    this.drawRoomFloorAndWalls(ctx, world, roomW, roomH);

    // 3. Draw Doors
    this.drawDoors(ctx, world.room.doors, world.room.isCleared);

    // 4. Draw Chest
    if (world.room.chest) {
      this.drawChest(ctx, world.room.chest.x, world.room.chest.y, world.room.chest.isOpen);
    }

    // 5. Draw Enemies
    for (const enemy of world.enemies) {
      this.drawEnemy(ctx, enemy);
    }

    // 6. Draw Players
    for (const player of Object.values(world.players)) {
      this.drawPlayer(ctx, player, player.id === localPlayerId);
    }

    // 7. Draw Projectiles
    for (const proj of world.projectiles) {
      this.drawProjectile(ctx, proj);
    }

    // 8. Update & Draw Particles
    this.particleSystem.update(dt);
    this.particleSystem.render(ctx);

    // 9. Update & Draw Floating Damage Numbers
    this.textManager.update(dt);
    this.textManager.render(ctx);

    // 10. Lighting / Dark Vignette / Low Visibility Fog
    this.drawLightingAndFog(ctx, world, localPlayer, roomW, roomH);

    ctx.restore();
  }

  private drawRoomFloorAndWalls(
    ctx: CanvasRenderingContext2D,
    world: GameWorldState,
    w: number,
    h: number
  ) {
    const pad = 42;

    // Floor Base
    const isIce = world.room.mutation.frictionMultiplier < 0.3;
    const isMud = world.room.mutation.frictionMultiplier === 0.5;

    ctx.fillStyle = isIce ? '#0f172a' : isMud ? '#1c1917' : '#111827';
    ctx.fillRect(pad, pad, w - pad * 2, h - pad * 2);

    // Checkerboard subtle tiles
    ctx.fillStyle = isIce ? 'rgba(56, 189, 248, 0.05)' : 'rgba(255, 255, 255, 0.025)';
    const tileSize = 60;
    for (let x = pad; x < w - pad; x += tileSize) {
      for (let y = pad; y < h - pad; y += tileSize) {
        if ((Math.floor(x / tileSize) + Math.floor(y / tileSize)) % 2 === 0) {
          ctx.fillRect(x, y, Math.min(tileSize, w - pad - x), Math.min(tileSize, h - pad - y));
        }
      }
    }

    // Hazards (Lava Pits or Spores)
    if (world.room.mutation.hazardType === 'LAVA_PITS') {
      ctx.fillStyle = '#ea580c';
      ctx.beginPath();
      ctx.arc(w / 3, h / 3, 50, 0, Math.PI * 2);
      ctx.arc((w * 2) / 3, (h * 2) / 3, 50, 0, Math.PI * 2);
      ctx.fill();
    } else if (world.room.mutation.hazardType === 'POISON_SPORES') {
      ctx.fillStyle = 'rgba(16, 185, 129, 0.12)';
      ctx.fillRect(pad + 80, pad + 80, w - pad * 2 - 160, h - pad * 2 - 160);
    }

    // Outer Thick Stone Walls
    ctx.fillStyle = '#1e293b';
    // North wall
    ctx.fillRect(0, 0, w, pad);
    // South wall
    ctx.fillRect(0, h - pad, w, pad);
    // West wall
    ctx.fillRect(0, 0, pad, h);
    // East wall
    ctx.fillRect(w - pad, 0, pad, h);

    // Stone Wall Highlights
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 4;
    ctx.strokeRect(pad, pad, w - pad * 2, h - pad * 2);
  }

  private drawDoors(ctx: CanvasRenderingContext2D, doors: Record<string, DoorState>, isCleared: boolean) {
    const northDoor = doors.NORTH;
    if (!northDoor) return;

    ctx.save();
    if (isCleared) {
      // Golden Shining Gateway to Next Room
      ctx.fillStyle = '#f59e0b';
      ctx.shadowColor = '#fbbf24';
      ctx.shadowBlur = 18;
      ctx.fillRect(northDoor.x, northDoor.y, northDoor.width, northDoor.height);

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 12px "Press Start 2P", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('ENTRAR ⬆️', northDoor.x + northDoor.width / 2, northDoor.y + northDoor.height / 2 + 5);
    } else {
      // Locked Iron Portcullis with Red Glowing Spikes
      ctx.fillStyle = '#475569';
      ctx.fillRect(northDoor.x, northDoor.y, northDoor.width, northDoor.height);

      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 3;
      for (let x = northDoor.x + 8; x < northDoor.x + northDoor.width; x += 14) {
        ctx.beginPath();
        ctx.moveTo(x, northDoor.y);
        ctx.lineTo(x, northDoor.y + northDoor.height);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  private drawChest(ctx: CanvasRenderingContext2D, x: number, y: number, isOpen: boolean) {
    ctx.save();
    ctx.translate(x, y);

    if (isOpen) {
      // Open radiant chest
      ctx.fillStyle = '#78350f';
      ctx.fillRect(-22, -14, 44, 28);
      ctx.fillStyle = '#fbbf24';
      ctx.shadowColor = '#fbbf24';
      ctx.shadowBlur = 20;
      ctx.fillRect(-18, -26, 36, 12);
    } else {
      // Closed chest with bounce pulse
      const pulse = Math.sin(Date.now() / 250) * 2;
      ctx.fillStyle = '#92400e';
      ctx.fillRect(-22, -16 + pulse, 44, 32);

      // Gold bands
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(-15, -16 + pulse, 6, 32);
      ctx.fillRect(9, -16 + pulse, 6, 32);

      // Golden Padlock
      ctx.fillStyle = '#fef08a';
      ctx.beginPath();
      ctx.arc(0, 0 + pulse, 5, 0, Math.PI * 2);
      ctx.fill();

      // Tooltip above chest
      ctx.fillStyle = '#fbbf24';
      ctx.font = 'bold 11px "Press Start 2P", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('ABRIR COFRE', 0, -28 + pulse);
    }

    ctx.restore();
  }

  private drawEnemy(ctx: CanvasRenderingContext2D, enemy: EnemyEntity) {
    ctx.save();
    ctx.translate(enemy.x, enemy.y);

    if (enemy.isBoss) {
      // Giant Cybernetic Dungeon Boss
      const pulse = Math.sin(Date.now() / 200) * 4;
      ctx.fillStyle = enemy.bossPhase === 2 ? '#dc2626' : '#9333ea';
      ctx.shadowColor = enemy.bossPhase === 2 ? '#ef4444' : '#a855f7';
      ctx.shadowBlur = 24;

      ctx.beginPath();
      ctx.arc(0, 0, enemy.radius + pulse, 0, Math.PI * 2);
      ctx.fill();

      // Eye of the Director
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, 0, 22, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(Math.sin(Date.now() / 400) * 6, 0, 10, 0, Math.PI * 2);
      ctx.fill();

      // Name & HP Bar
      this.drawHealthBar(ctx, 0, -enemy.radius - 18, 90, 10, enemy.currentHp, enemy.maxHp);
      ctx.fillStyle = '#f87171';
      ctx.font = 'bold 12px "Press Start 2P", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(enemy.name, 0, -enemy.radius - 28);
    } else if (enemy.type === 'SLIME') {
      // Bouncing Gelatinous Slime
      const squish = Math.sin(Date.now() / 150) * 3;
      ctx.fillStyle = enemy.color;
      ctx.beginPath();
      ctx.ellipse(0, 0, enemy.radius + squish, enemy.radius - squish, 0, 0, Math.PI * 2);
      ctx.fill();

      // Eyes
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(-6, -4, 4, 0, Math.PI * 2);
      ctx.arc(6, -4, 4, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.arc(-5, -4, 2, 0, Math.PI * 2);
      ctx.arc(7, -4, 2, 0, Math.PI * 2);
      ctx.fill();

      this.drawHealthBar(ctx, 0, -enemy.radius - 8, 36, 5, enemy.currentHp, enemy.maxHp);
    } else if (enemy.type === 'ESQUELETO') {
      // Skeleton Sniper
      ctx.fillStyle = '#f1f5f9';
      ctx.beginPath();
      ctx.arc(0, -6, 12, 0, Math.PI * 2); // skull
      ctx.fill();

      // Dark eye sockets
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.arc(-4, -6, 3, 0, Math.PI * 2);
      ctx.arc(4, -6, 3, 0, Math.PI * 2);
      ctx.fill();

      // Bone bow
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(14, 0, 10, -Math.PI / 2, Math.PI / 2);
      ctx.stroke();

      this.drawHealthBar(ctx, 0, -enemy.radius - 12, 34, 5, enemy.currentHp, enemy.maxHp);
    } else {
      // Bat Kamikaze
      const flap = Math.sin(Date.now() / 80) * 12;
      ctx.fillStyle = enemy.color;
      // Body
      ctx.beginPath();
      ctx.arc(0, 0, 10, 0, Math.PI * 2);
      ctx.fill();
      // Left Wing
      ctx.beginPath();
      ctx.moveTo(-6, 0);
      ctx.lineTo(-20, flap);
      ctx.lineTo(-12, 6);
      ctx.fill();
      // Right Wing
      ctx.beginPath();
      ctx.moveTo(6, 0);
      ctx.lineTo(20, flap);
      ctx.lineTo(12, 6);
      ctx.fill();

      this.drawHealthBar(ctx, 0, -enemy.radius - 8, 30, 4, enemy.currentHp, enemy.maxHp);
    }

    ctx.restore();
  }

  private drawPlayer(ctx: CanvasRenderingContext2D, player: PlayerEntity, isLocal: boolean) {
    ctx.save();
    ctx.translate(player.x, player.y);

    if (!player.isAlive) {
      // Dead Player Ghost
      ctx.fillStyle = 'rgba(148, 163, 184, 0.4)';
      ctx.beginPath();
      ctx.arc(0, 0, 16, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ef4444';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('💀 CAÍDO', 0, -22);
      ctx.restore();
      return;
    }

    // Ghost trail if dashing
    if (player.isDashing) {
      this.particleSystem.addGhostTrail(player.x, player.y, player.angle, 18, '#38bdf8');
    }

    // Aim Line / Reticle for local player
    if (isLocal) {
      ctx.save();
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.25)';
      ctx.setLineDash([4, 6]);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(player.angle) * 120, Math.sin(player.angle) * 120);
      ctx.stroke();
      ctx.restore();
    }

    // Rotate player weapon & body towards aim angle
    ctx.save();
    ctx.rotate(player.angle);

    if (player.classType === 'GUERRERO') {
      // Warrior: armored body + big claymore sword
      ctx.fillStyle = '#3b82f6';
      ctx.beginPath();
      ctx.arc(0, 0, 18, 0, Math.PI * 2);
      ctx.fill();

      // Sword
      ctx.fillStyle = '#e2e8f0';
      ctx.fillRect(16, -4, 28, 8);
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(12, -8, 5, 16); // Crossguard
    } else if (player.classType === 'CAZADOR') {
      // Ranger: green cowl + crossbow
      ctx.fillStyle = '#10b981';
      ctx.beginPath();
      ctx.arc(0, 0, 16, 0, Math.PI * 2);
      ctx.fill();

      // Crossbow
      ctx.fillStyle = '#78350f';
      ctx.fillRect(14, -3, 18, 6);
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(22, -12);
      ctx.lineTo(22, 12);
      ctx.stroke();
    } else {
      // Mage: purple arcane robe + glowing floating orb
      ctx.fillStyle = '#8b5cf6';
      ctx.beginPath();
      ctx.arc(0, 0, 15, 0, Math.PI * 2);
      ctx.fill();

      // Floating Orb
      const orbAngle = Date.now() / 180;
      ctx.fillStyle = '#f43f5e';
      ctx.shadowColor = '#f43f5e';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(20 + Math.cos(orbAngle) * 5, Math.sin(orbAngle) * 12, 6, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();

    // Name Tag & Local indicator
    ctx.fillStyle = isLocal ? '#38bdf8' : '#ffffff';
    ctx.font = 'bold 11px "Rajdhani", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${player.name} ${player.isHost ? '👑' : ''}`, 0, -28);

    // Health Bar
    this.drawHealthBar(ctx, 0, -20, 42, 6, player.currentHp, player.maxHp);

    ctx.restore();
  }

  private drawProjectile(ctx: CanvasRenderingContext2D, proj: ProjectileEntity) {
    ctx.save();
    ctx.translate(proj.x, proj.y);

    ctx.fillStyle = proj.color;
    ctx.shadowColor = proj.color;
    ctx.shadowBlur = 10;

    ctx.beginPath();
    ctx.arc(0, 0, proj.radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  private drawHealthBar(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    current: number,
    max: number
  ) {
    const pct = Math.max(0, Math.min(1, current / max));

    // Background
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(x - width / 2, y - height / 2, width, height);

    // Health Fill
    ctx.fillStyle = pct > 0.5 ? '#10b981' : pct > 0.25 ? '#f59e0b' : '#ef4444';
    ctx.fillRect(x - width / 2 + 1, y - height / 2 + 1, (width - 2) * pct, height - 2);

    // Border
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1;
    ctx.strokeRect(x - width / 2, y - height / 2, width, height);
  }

  private drawLightingAndFog(
    ctx: CanvasRenderingContext2D,
    world: GameWorldState,
    localPlayer: PlayerEntity | undefined,
    w: number,
    h: number
  ) {
    if (!world.room.mutation.lowVisibility || !localPlayer) return;

    ctx.save();
    const visRadius = world.room.mutation.visibilityRadius || 260;

    // Dark radial gradient centered on local player
    const grad = ctx.createRadialGradient(
      localPlayer.x,
      localPlayer.y,
      visRadius * 0.4,
      localPlayer.x,
      localPlayer.y,
      visRadius
    );
    grad.addColorStop(0, 'rgba(0, 0, 0, 0)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0.94)');

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }
}
