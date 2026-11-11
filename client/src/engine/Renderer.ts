import { GameWorldState, PlayerEntity, EnemyEntity, ProjectileEntity } from '../types';
import { ParticleSystem } from './ParticleSystem';
import { FloatingTextManager } from './FloatingText';
import { SpriteModels } from './SpriteModels';

interface DustMote {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  pulseSpeed: number;
}

export class GameRenderer {
  public cameraX = 0;
  public cameraY = 0;
  public screenShakeTime = 0;
  public screenShakeIntensity = 0;

  public particleSystem = new ParticleSystem();
  public textManager = new FloatingTextManager();

  private offscreenCanvas: HTMLCanvasElement | null = null;
  private offscreenCtx: CanvasRenderingContext2D | null = null;
  private decalsCanvas: HTMLCanvasElement | null = null;
  private decalsCtx: CanvasRenderingContext2D | null = null;
  private cachedRoomIndex = -1;
  private cachedMutationTitle = '';
  private totalTime = 0;
  private dustMotes: DustMote[] = [];

  // Smooth 60-144 FPS entity position interpolation buffer for multiplayer
  private interpPositions = new Map<string, { x: number; y: number }>();

  constructor() {
    this.initDustMotes();
  }

  private initDustMotes() {
    this.dustMotes = [];
    for (let i = 0; i < 40; i++) {
      this.dustMotes.push({
        x: Math.random() * 1200,
        y: Math.random() * 800,
        vx: (Math.random() - 0.5) * 18,
        vy: -8 - Math.random() * 14,
        size: 1 + Math.random() * 2,
        alpha: 0.15 + Math.random() * 0.35,
        pulseSpeed: 1.5 + Math.random() * 2.5,
      });
    }
  }

  public addScreenShake(intensity = 6, duration = 0.2) {
    this.screenShakeIntensity = Math.max(this.screenShakeIntensity, intensity);
    this.screenShakeTime = Math.max(this.screenShakeTime, duration);
  }

  public addBloodDecal(x: number, y: number, color = '#7f1d1d') {
    if (!this.decalsCtx) return;
    const ctx = this.decalsCtx;
    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, 6 + Math.random() * 7, 0, Math.PI * 2);
    for (let i = 0; i < 4; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = 7 + Math.random() * 12;
      ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, 1.8 + Math.random() * 2.2, 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.restore();
  }

  private getSmoothPos(id: string, targetX: number, targetY: number, vx: number, vy: number, dt: number) {
    const prev = this.interpPositions.get(id);
    if (!prev || Math.hypot(targetX - prev.x, targetY - prev.y) > 160) {
      const fresh = { x: targetX, y: targetY };
      this.interpPositions.set(id, fresh);
      return fresh;
    }
    // Velocity dead-reckoning + high-gain convergence for zero-jitter 60+ FPS rendering
    prev.x += vx * dt * 0.35;
    prev.y += vy * dt * 0.35;
    const blend = Math.min(1, dt * 24);
    prev.x += (targetX - prev.x) * blend;
    prev.y += (targetY - prev.y) * blend;
    return prev;
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
      const smoothLocal = this.getSmoothPos(
        localPlayer.id,
        localPlayer.x,
        localPlayer.y,
        localPlayer.vx,
        localPlayer.vy,
        dt
      );
      const targetCamX = smoothLocal.x - canvasWidth / 2;
      const targetCamY = smoothLocal.y - canvasHeight / 2;
      this.cameraX += (targetCamX - this.cameraX) * 0.14;
      this.cameraY += (targetCamY - this.cameraY) * 0.14;
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

    ctx.translate(-Math.round(this.cameraX + shakeX), -Math.round(this.cameraY + shakeY));

    // 2. High-Performance Pre-rendered Dungeon Floor, Walls & Gothic Scenery
    this.ensureOffscreenBackground(world, roomW, roomH);
    if (this.offscreenCanvas) {
      ctx.drawImage(this.offscreenCanvas, 0, 0);
    }

    // 2.5. Permanent Battlefield Blood Decals
    if (this.decalsCanvas) {
      ctx.drawImage(this.decalsCanvas, 0, 0);
    }

    // 3. Wall Torches with Animated Multi-Layered Flames
    this.drawTorches(ctx, roomW, roomH, this.totalTime);

    // 4. Branching Doors (NORTH, EAST, WEST)
    const doors = world.room.doors;
    if (doors.NORTH) {
      SpriteModels.drawDoor(
        ctx,
        doors.NORTH.x,
        doors.NORTH.y,
        doors.NORTH.width,
        doors.NORTH.height,
        doors.NORTH.open,
        doors.NORTH
      );
    }
    if (doors.EAST && doors.EAST.open) {
      SpriteModels.drawDoor(
        ctx,
        doors.EAST.x,
        doors.EAST.y,
        doors.EAST.width,
        doors.EAST.height,
        doors.EAST.open,
        doors.EAST
      );
    }
    if (doors.WEST && doors.WEST.open) {
      SpriteModels.drawDoor(
        ctx,
        doors.WEST.x,
        doors.WEST.y,
        doors.WEST.width,
        doors.WEST.height,
        doors.WEST.open,
        doors.WEST
      );
    }

    // 4.5. Environmental & Skill Hazards (Lava, Poison Spores, Spike Traps, Arcane Vortex, Meteor Strikes)
    if (world.room.hazards) {
      for (const h of world.room.hazards) {
        SpriteModels.drawHazard(ctx, h, this.totalTime);
      }
    }

    // 4.8. Interactive Barrels (Explosive, Frost, Toxic)
    if (world.room.barrels) {
      for (const b of world.room.barrels) {
        SpriteModels.drawBarrel(ctx, b, this.totalTime);
      }
    }

    // 5. Chest (Ornate Carved Medieval Chest)
    if (world.room.chest) {
      const localClaimed = world.room.chest.claimedByPlayerIds?.includes(localPlayerId);
      SpriteModels.drawChest(
        ctx,
        world.room.chest.x,
        world.room.chest.y,
        world.room.chest.isOpen || !!localClaimed,
        this.totalTime
      );
    }

    // 5.2. Altar of Pacts & Armory
    if (world.room.altar) {
      SpriteModels.drawAltar(ctx, world.room.altar, this.totalTime);
    }

    // 5.5. Draw Pickups (Hearts, Gold Coins, Shield Orbs, Frenzy Orbs)
    if (world.room.hearts) {
      for (const heart of world.room.hearts) {
        SpriteModels.drawHeartPickup(ctx, heart, this.totalTime);
      }
    }

    // 5.6. Draw Enemy Aim Telegraph Warning Lines
    for (const enemy of world.enemies) {
      SpriteModels.drawEnemyTelegraph(ctx, enemy);
    }

    // 6. Draw Enemies with Smooth 60 FPS Interpolation
    for (const enemy of world.enemies) {
      const sp = this.getSmoothPos(enemy.id, enemy.x, enemy.y, enemy.vx, enemy.vy, dt);
      SpriteModels.drawEnemy(ctx, { ...enemy, x: sp.x, y: sp.y }, this.totalTime);
    }

    // 7. Draw Players with Smooth 60 FPS Interpolation & Motion Particles
    for (const player of Object.values(world.players)) {
      const sp = this.getSmoothPos(player.id, player.x, player.y, player.vx, player.vy, dt);
      const smoothPlayer: PlayerEntity = { ...player, x: sp.x, y: sp.y };

      if (player.isAlive) {
        if (player.isDashing) {
          const ghostColor =
            player.classType === 'GUERRERO'
              ? '#dc2626'
              : player.classType === 'CAZADOR'
              ? '#16a34a'
              : player.classType === 'PICARO'
              ? '#10b981'
              : '#9333ea';
          this.particleSystem.addGhostTrail(sp.x, sp.y, player.angle, 16, ghostColor);
        }
        if (Math.hypot(player.vx, player.vy) > 35 && Math.random() > 0.65) {
          this.particleSystem.emitDustPuff(sp.x, sp.y + 12, 1);
        }
      }

      SpriteModels.drawPlayer(ctx, smoothPlayer, player.id === localPlayerId, this.totalTime);
    }

    // 8. Draw Projectiles
    for (const proj of world.projectiles) {
      this.drawProjectile(ctx, proj);
    }

    // 9. Update & Draw Particles (Sparks, blood, shockwaves, lightning arcs)
    this.particleSystem.update(dt);
    this.particleSystem.render(ctx);

    // 10. Floating Damage Numbers & Synergy Callouts
    this.textManager.update(dt);
    this.textManager.render(ctx);

    // 11. Lighting, Ambient Warmth, Fog of War & Drifting Dust Motes
    this.drawAmbianceAndFog(ctx, world, localPlayer, roomW, roomH, dt);

    ctx.restore();
  }

  private ensureOffscreenBackground(world: GameWorldState, w: number, h: number) {
    if (
      this.offscreenCanvas &&
      this.cachedRoomIndex === world.room.roomIndex &&
      this.cachedMutationTitle === world.room.mutation.title
    ) {
      return;
    }

    this.interpPositions.clear();

    if (!this.offscreenCanvas) {
      this.offscreenCanvas = document.createElement('canvas');
      this.offscreenCtx = this.offscreenCanvas.getContext('2d');
    }
    if (!this.decalsCanvas) {
      this.decalsCanvas = document.createElement('canvas');
      this.decalsCtx = this.decalsCanvas.getContext('2d');
    }

    this.offscreenCanvas.width = w;
    this.offscreenCanvas.height = h;
    this.decalsCanvas.width = w;
    this.decalsCanvas.height = h;
    if (this.decalsCtx) {
      this.decalsCtx.clearRect(0, 0, w, h);
    }

    this.cachedRoomIndex = world.room.roomIndex;
    this.cachedMutationTitle = world.room.mutation.title;

    const ctx = this.offscreenCtx;
    if (!ctx) return;

    const pad = 44;
    const isIce = world.room.mutation.frictionMultiplier < 0.3;
    const isMud = world.room.mutation.frictionMultiplier === 0.5;
    const isBoss = world.room.isBossRoom;
    const theme = isIce ? 'ice' : isMud ? 'mud' : isBoss ? 'fire' : 'gold';

    // 1. Floor Base
    ctx.fillStyle = isIce ? '#0a1120' : isMud ? '#141210' : '#0e0c0b';
    ctx.fillRect(pad, pad, w - pad * 2, h - pad * 2);

    // 2. Chiseled Stone Flagstones with 3D Bevel Lighting
    const tileSize = 64;
    for (let x = pad; x < w - pad; x += tileSize) {
      for (let y = pad; y < h - pad; y += tileSize) {
        const tw = Math.min(tileSize, w - pad - x);
        const th = Math.min(tileSize, h - pad - y);

        const hash = (Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1;

        ctx.fillStyle = isIce
          ? hash > 0.5
            ? '#162032'
            : '#0f172a'
          : hash > 0.6
          ? '#1c1917'
          : hash > 0.3
          ? '#171412'
          : '#13110f';
        ctx.fillRect(x + 1, y + 1, tw - 2, th - 2);

        ctx.strokeStyle = isIce ? '#25334d' : hash > 0.5 ? '#292524' : '#221f1d';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x + 1, y + th - 2);
        ctx.lineTo(x + 1, y + 1);
        ctx.lineTo(x + tw - 2, y + 1);
        ctx.stroke();

        ctx.strokeStyle = '#070605';
        ctx.beginPath();
        ctx.moveTo(x + tw - 1, y + 1);
        ctx.lineTo(x + tw - 1, y + th - 1);
        ctx.lineTo(x + 1, y + th - 1);
        ctx.stroke();

        if (hash > 0.78) {
          ctx.strokeStyle = isIce ? '#38bdf8' : '#292524';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(x + 12, y + 16);
          ctx.lineTo(x + 28, y + 30);
          ctx.lineTo(x + 38, y + 26);
          ctx.stroke();
        }

        if (isMud && hash > 0.72) {
          ctx.fillStyle = 'rgba(21, 128, 61, 0.25)';
          ctx.beginPath();
          ctx.ellipse(x + tw / 2, y + th / 2, tw * 0.3, th * 0.2, hash, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // 3. Central Ancient Gothic Ritual Octagram
    SpriteModels.drawRitualCircle(ctx, w / 2, h / 2, 125, 0, theme);

    // 4. Four Grand Gothic Stone Pillars with Cast Shadows (Match physical pillar coordinates)
    const pillars = world.room.pillars || [
      { id: '1', x: w * 0.22, y: h * 0.28, radius: 25 },
      { id: '2', x: w * 0.78, y: h * 0.28, radius: 25 },
      { id: '3', x: w * 0.22, y: h * 0.72, radius: 25 },
      { id: '4', x: w * 0.78, y: h * 0.72, radius: 25 },
    ];
    for (const pil of pillars) {
      SpriteModels.drawGothicPillar(ctx, pil.x, pil.y, 0);
    }

    // 5. Hanging Iron Chains on North Wall
    SpriteModels.drawWallChain(ctx, w * 0.15, pad, 5, 0);
    SpriteModels.drawWallChain(ctx, w * 0.38, pad, 7, 0);
    SpriteModels.drawWallChain(ctx, w * 0.62, pad, 6, 0);
    SpriteModels.drawWallChain(ctx, w * 0.85, pad, 4, 0);

    // 6. Spiderwebs in All 4 Corners
    SpriteModels.drawWallCobwebs(ctx, pad + 2, pad + 2, 38, 'TL');
    SpriteModels.drawWallCobwebs(ctx, w - pad - 2, pad + 2, 38, 'TR');
    SpriteModels.drawWallCobwebs(ctx, pad + 2, h - pad - 2, 38, 'BL');
    SpriteModels.drawWallCobwebs(ctx, w - pad - 2, h - pad - 2, 38, 'BR');

    // 7. Piles of Skulls & Broken Bones
    SpriteModels.drawBonePile(ctx, pad + 26, h - pad - 18);
    SpriteModels.drawBonePile(ctx, w - pad - 30, h - pad - 18);

    // 8. Iron Floor Drains
    SpriteModels.drawFloorDrain(ctx, w * 0.12, h * 0.5, 24);
    SpriteModels.drawFloorDrain(ctx, w * 0.88, h * 0.5, 24);

    // 9. Heavy Stone Dungeon Perimeter Walls
    ctx.fillStyle = '#1c1917';
    ctx.fillRect(0, 0, w, pad);
    ctx.fillRect(0, h - pad, w, pad);
    ctx.fillRect(0, 0, pad, h);
    ctx.fillRect(w - pad, 0, pad, h);

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

    ctx.strokeStyle = '#44403c';
    ctx.lineWidth = 2.5;
    ctx.strokeRect(pad, pad, w - pad * 2, h - pad * 2);
  }

  private drawTorches(ctx: CanvasRenderingContext2D, w: number, h: number, time: number) {
    const pad = 44;
    SpriteModels.drawTorch(ctx, w * 0.25, pad, time);
    SpriteModels.drawTorch(ctx, w * 0.75, pad, time);
    SpriteModels.drawTorch(ctx, pad, h * 0.3, time);
    SpriteModels.drawTorch(ctx, w - pad, h * 0.3, time);
  }

  private drawProjectile(ctx: CanvasRenderingContext2D, proj: ProjectileEntity) {
    ctx.save();
    ctx.translate(proj.x, proj.y);

    const angle = Math.atan2(proj.vy, proj.vx);
    ctx.rotate(angle);

    if (proj.fromPlayer) {
      if (proj.isExplosive) {
        ctx.fillStyle = '#ea580c';
        ctx.beginPath();
        ctx.arc(0, 0, proj.radius, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#fef08a';
        ctx.beginPath();
        ctx.arc(2, 0, proj.radius * 0.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = 'rgba(234, 88, 12, 0.4)';
        ctx.beginPath();
        ctx.moveTo(0, -proj.radius * 0.7);
        ctx.lineTo(-proj.radius * 2.5, 0);
        ctx.lineTo(0, proj.radius * 0.7);
        ctx.fill();
      } else if (proj.radius > 16) {
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
      } else if (proj.element === 'POISON') {
        // Pícaro Throwing Viper Dagger
        ctx.fillStyle = '#10b981';
        ctx.beginPath();
        ctx.moveTo(-10, -2.5);
        ctx.lineTo(10, 0);
        ctx.lineTo(-10, 2.5);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = '#d1fae5';
        ctx.fillRect(-4, -1, 10, 2);
      } else {
        ctx.fillStyle = proj.isCrit ? '#38bdf8' : '#78350f';
        ctx.fillRect(-12, -1.5, 16, 3);

        ctx.fillStyle = '#f1f5f9';
        ctx.beginPath();
        ctx.moveTo(4, -3.5);
        ctx.lineTo(10, 0);
        ctx.lineTo(4, 3.5);
        ctx.fill();

        ctx.fillStyle = proj.isCrit ? '#facc15' : '#b91c1c';
        ctx.beginPath();
        ctx.moveTo(-12, -3);
        ctx.lineTo(-8, 0);
        ctx.lineTo(-12, 3);
        ctx.fill();
      }
    } else {
      ctx.fillStyle = proj.color || '#991b1b';
      ctx.beginPath();
      ctx.arc(0, 0, proj.radius, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#fca5a5';
      ctx.beginPath();
      ctx.arc(1, 0, proj.radius * 0.4, 0, Math.PI * 2);
      ctx.fill();

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
    h: number,
    dt: number
  ) {
    const pad = 44;
    ctx.save();

    const torches = [
      { x: w * 0.25, y: pad },
      { x: w * 0.75, y: pad },
      { x: pad, y: h * 0.3 },
      { x: w - pad, y: h * 0.3 },
    ];

    for (const torch of torches) {
      const flick = Math.sin(this.totalTime * 14 + torch.x) * 6;
      const torchGrad = ctx.createRadialGradient(
        torch.x,
        torch.y,
        8,
        torch.x,
        torch.y,
        190 + flick
      );
      torchGrad.addColorStop(0, 'rgba(234, 88, 12, 0.16)');
      torchGrad.addColorStop(0.6, 'rgba(217, 119, 6, 0.06)');
      torchGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');

      ctx.fillStyle = torchGrad;
      ctx.fillRect(torch.x - 200, torch.y - 200, 400, 400);
    }

    if (localPlayer) {
      const playerGrad = ctx.createRadialGradient(
        localPlayer.x,
        localPlayer.y,
        10,
        localPlayer.x,
        localPlayer.y,
        150
      );
      playerGrad.addColorStop(0, 'rgba(245, 158, 11, 0.09)');
      playerGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = playerGrad;
      ctx.fillRect(localPlayer.x - 150, localPlayer.y - 150, 300, 300);
    }

    for (const mote of this.dustMotes) {
      mote.x += mote.vx * dt;
      mote.y += mote.vy * dt;

      if (mote.x < pad) mote.x = w - pad - 2;
      if (mote.x > w - pad) mote.x = pad + 2;
      if (mote.y < pad) mote.y = h - pad - 2;
      if (mote.y > h - pad) mote.y = pad + 2;

      const pulseAlpha = mote.alpha * (0.6 + Math.sin(this.totalTime * mote.pulseSpeed + mote.x) * 0.4);

      ctx.fillStyle = '#fde68a';
      ctx.globalAlpha = Math.max(0.05, Math.min(0.7, pulseAlpha));
      ctx.beginPath();
      ctx.arc(mote.x, mote.y, mote.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1.0;

    if (world.room.mutation.lowVisibility && localPlayer) {
      const visRadius = world.room.mutation.visibilityRadius || 270;

      const grad = ctx.createRadialGradient(
        localPlayer.x,
        localPlayer.y,
        visRadius * 0.35,
        localPlayer.x,
        localPlayer.y,
        visRadius
      );
      grad.addColorStop(0, 'rgba(0, 0, 0, 0)');
      grad.addColorStop(1, 'rgba(10, 8, 7, 0.94)');

      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
    }

    ctx.restore();
  }
}
