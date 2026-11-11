import { GameWorldState, PlayerEntity, EnemyEntity, ProjectileEntity, DoorState } from '../types';
import { ParticleSystem } from './ParticleSystem';
import { FloatingTextManager } from './FloatingText';
import { SpriteModels } from './SpriteModels';

export class GameRenderer {
  public cameraX = 0;
  public cameraY = 0;
  public screenShakeTime = 0;
  public screenShakeIntensity = 0;

  public particleSystem = new ParticleSystem();
  public textManager = new FloatingTextManager();

  private offscreenCanvas: HTMLCanvasElement | null = null;
  private offscreenCtx: CanvasRenderingContext2D | null = null;
  private cachedRoomIndex = -1;
  private cachedMutationTitle = '';
  private totalTime = 0;

  public addScreenShake(intensity = 6, duration = 0.2) {
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
    this.totalTime += dt;
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

    // 2. High-Performance Pre-rendered Dungeon Floor & Walls
    this.ensureOffscreenBackground(world, roomW, roomH);
    if (this.offscreenCanvas) {
      ctx.drawImage(this.offscreenCanvas, 0, 0);
    }

    // 3. Wall Torches with Animated Flickering Flames
    this.drawTorches(ctx, roomW, roomH, this.totalTime);

    // 4. Doors (Portcullis and Golden Archway)
    const northDoor = world.room.doors.NORTH;
    if (northDoor) {
      SpriteModels.drawDoor(
        ctx,
        northDoor.x,
        northDoor.y,
        northDoor.width,
        northDoor.height,
        world.room.isCleared
      );
    }

    // 5. Chest (Ornate Carved Medieval Chest)
    if (world.room.chest) {
      SpriteModels.drawChest(
        ctx,
        world.room.chest.x,
        world.room.chest.y,
        world.room.chest.isOpen,
        this.totalTime
      );
    }

    // 5.5. Draw Heart Pickups (Healing drops)
    if (world.room.hearts) {
      for (const heart of world.room.hearts) {
        SpriteModels.drawHeartPickup(ctx, heart, this.totalTime);
      }
    }

    // 5.6. Draw Enemy Aim Telegraph Warning Lines (Floor laser)
    for (const enemy of world.enemies) {
      SpriteModels.drawEnemyTelegraph(ctx, enemy);
    }

    // 6. Draw Enemies (Original Art Models)
    for (const enemy of world.enemies) {
      SpriteModels.drawEnemy(ctx, enemy, this.totalTime);
    }

    // 7. Draw Players (Detailed Class Models)
    for (const player of Object.values(world.players)) {
      SpriteModels.drawPlayer(ctx, player, player.id === localPlayerId, this.totalTime);
    }

    // 8. Draw Projectiles (Arrows, Fireballs, Slashing waves)
    for (const proj of world.projectiles) {
      this.drawProjectile(ctx, proj);
    }

    // 9. Update & Draw Particles (Sparks, blood, smoke)
    this.particleSystem.update(dt);
    this.particleSystem.render(ctx);

    // 10. Floating Damage Numbers
    this.textManager.update(dt);
    this.textManager.render(ctx);

    // 11. Lighting, Torch Ambient Warmth & Dark Fog of War
    this.drawAmbianceAndFog(ctx, world, localPlayer, roomW, roomH);

    ctx.restore();
  }

  /**
   * PERFORMANCE OPTIMIZATION:
   * Bakes flagstones, stone wall bricks, cracks, and floor tiles to an offscreen canvas.
   * Eliminates thousands of per-frame draw calls.
   */
  private ensureOffscreenBackground(world: GameWorldState, w: number, h: number) {
    if (
      this.offscreenCanvas &&
      this.cachedRoomIndex === world.room.roomIndex &&
      this.cachedMutationTitle === world.room.mutation.title
    ) {
      return;
    }

    if (!this.offscreenCanvas) {
      this.offscreenCanvas = document.createElement('canvas');
      this.offscreenCtx = this.offscreenCanvas.getContext('2d');
    }

    this.offscreenCanvas.width = w;
    this.offscreenCanvas.height = h;
    this.cachedRoomIndex = world.room.roomIndex;
    this.cachedMutationTitle = world.room.mutation.title;

    const ctx = this.offscreenCtx;
    if (!ctx) return;

    const pad = 44;
    const isIce = world.room.mutation.frictionMultiplier < 0.3;
    const isMud = world.room.mutation.frictionMultiplier === 0.5;

    // Floor Base (Deep dark stone)
    ctx.fillStyle = isIce ? '#0f172a' : isMud ? '#1c1917' : '#141210';
    ctx.fillRect(pad, pad, w - pad * 2, h - pad * 2);

    // Carved Stone Flagstones
    const tileSize = 64;
    for (let x = pad; x < w - pad; x += tileSize) {
      for (let y = pad; y < h - pad; y += tileSize) {
        const tw = Math.min(tileSize, w - pad - x);
        const th = Math.min(tileSize, h - pad - y);

        // Subtle variation in stone tone
        const hash = (Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1;
        ctx.fillStyle = isIce
          ? hash > 0.5 ? '#1e293b' : '#0f172a'
          : hash > 0.6 ? '#1c1917' : hash > 0.3 ? '#171513' : '#141210';
        ctx.fillRect(x + 1, y + 1, tw - 2, th - 2);

        // Grout line
        ctx.strokeStyle = '#090807';
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, tw, th);

        // Occasional stone cracks
        if (hash > 0.8) {
          ctx.strokeStyle = '#292524';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(x + 10, y + 15);
          ctx.lineTo(x + 25, y + 28);
          ctx.lineTo(x + 35, y + 25);
          ctx.stroke();
        }
      }
    }

    // Heavy Stone Dungeon Perimeter Walls
    ctx.fillStyle = '#1c1917';
    ctx.fillRect(0, 0, w, pad);
    ctx.fillRect(0, h - pad, w, pad);
    ctx.fillRect(0, 0, pad, h);
    ctx.fillRect(w - pad, 0, pad, h);

    // Wall Brick Details
    ctx.strokeStyle = '#292524';
    ctx.lineWidth = 1.5;
    for (let x = 0; x < w; x += 32) {
      ctx.strokeRect(x, 0, 32, pad);
      ctx.strokeRect(x, h - pad, 32, pad);
    }
    for (let y = 0; y < h; y += 24) {
      ctx.strokeRect(0, y, pad, 24);
      ctx.strokeRect(w - pad, y, pad, 24);
    }

    // Inner chiseled stone ledge
    ctx.strokeStyle = '#44403c';
    ctx.lineWidth = 2.5;
    ctx.strokeRect(pad, pad, w - pad * 2, h - pad * 2);
  }

  private drawTorches(ctx: CanvasRenderingContext2D, w: number, h: number, time: number) {
    const pad = 44;
    // Torches mounted on North wall
    SpriteModels.drawTorch(ctx, w * 0.25, pad, time);
    SpriteModels.drawTorch(ctx, w * 0.75, pad, time);
    // Torches on side walls
    SpriteModels.drawTorch(ctx, pad, h * 0.5, time);
    SpriteModels.drawTorch(ctx, w - pad, h * 0.5, time);
  }

  private drawProjectile(ctx: CanvasRenderingContext2D, proj: ProjectileEntity) {
    ctx.save();
    ctx.translate(proj.x, proj.y);

    const angle = Math.atan2(proj.vy, proj.vx);
    ctx.rotate(angle);

    if (proj.fromPlayer) {
      if (proj.isExplosive) {
        // Mage Fireball: Fiery core with ember trail
        ctx.fillStyle = '#ea580c';
        ctx.beginPath();
        ctx.arc(0, 0, proj.radius, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#fef08a';
        ctx.beginPath();
        ctx.arc(2, 0, proj.radius * 0.5, 0, Math.PI * 2);
        ctx.fill();

        // Flame trail
        ctx.fillStyle = 'rgba(234, 88, 12, 0.4)';
        ctx.beginPath();
        ctx.moveTo(0, -proj.radius * 0.7);
        ctx.lineTo(-proj.radius * 2.5, 0);
        ctx.lineTo(0, proj.radius * 0.7);
        ctx.fill();
      } else if (proj.radius > 16) {
        // Warrior Melee Cleave Arc
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(0, 0, proj.radius, -Math.PI / 3, Math.PI / 3);
        ctx.stroke();

        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, proj.radius - 2, -Math.PI / 4, Math.PI / 4);
        ctx.stroke();
      } else {
        // Ranger Arrow: Wooden shaft with steel broadhead and red fletchings
        ctx.fillStyle = '#78350f';
        ctx.fillRect(-12, -1, 16, 2);

        // Steel Tip
        ctx.fillStyle = '#f1f5f9';
        ctx.beginPath();
        ctx.moveTo(4, -3);
        ctx.lineTo(9, 0);
        ctx.lineTo(4, 3);
        ctx.fill();

        // Fletching
        ctx.fillStyle = '#b91c1c';
        ctx.beginPath();
        ctx.moveTo(-12, -3);
        ctx.lineTo(-8, 0);
        ctx.lineTo(-12, 3);
        ctx.fill();
      }
    } else {
      // Enemy Dark Magic Projectile
      ctx.fillStyle = '#991b1b';
      ctx.beginPath();
      ctx.arc(0, 0, proj.radius, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#fca5a5';
      ctx.beginPath();
      ctx.arc(1, 0, proj.radius * 0.4, 0, Math.PI * 2);
      ctx.fill();

      // Shadow trail
      ctx.fillStyle = 'rgba(153, 27, 27, 0.35)';
      ctx.beginPath();
      ctx.moveTo(0, -proj.radius * 0.8);
      ctx.lineTo(-proj.radius * 2.2, 0);
      ctx.lineTo(0, proj.radius * 0.8);
      ctx.fill();
    }

    ctx.restore();
  }

  private drawAmbianceAndFog(
    ctx: CanvasRenderingContext2D,
    world: GameWorldState,
    localPlayer: PlayerEntity | undefined,
    w: number,
    h: number
  ) {
    // 1. Subtle warm torch illumination
    ctx.save();
    const pad = 44;
    const torchGradL = ctx.createRadialGradient(w * 0.25, pad, 10, w * 0.25, pad, 180);
    torchGradL.addColorStop(0, 'rgba(234, 88, 12, 0.12)');
    torchGradL.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = torchGradL;
    ctx.fillRect(w * 0.25 - 180, 0, 360, 240);

    const torchGradR = ctx.createRadialGradient(w * 0.75, pad, 10, w * 0.75, pad, 180);
    torchGradR.addColorStop(0, 'rgba(234, 88, 12, 0.12)');
    torchGradR.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = torchGradR;
    ctx.fillRect(w * 0.75 - 180, 0, 360, 240);
    ctx.restore();

    // 2. Low Visibility / Dungeon Darkness
    if (world.room.mutation.lowVisibility && localPlayer) {
      ctx.save();
      const visRadius = world.room.mutation.visibilityRadius || 260;

      // Dark radial shadow mask centered on local player
      const grad = ctx.createRadialGradient(
        localPlayer.x,
        localPlayer.y,
        visRadius * 0.35,
        localPlayer.x,
        localPlayer.y,
        visRadius
      );
      grad.addColorStop(0, 'rgba(0, 0, 0, 0)');
      grad.addColorStop(1, 'rgba(12, 10, 9, 0.96)');

      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }
  }
}
