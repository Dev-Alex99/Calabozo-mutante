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

  // Local predictive projectiles for 0ms client responsiveness
  public predictiveProjectiles: ProjectileEntity[] = [];

  // Active Auto-Aim / Gamepad Target Lock World Position
  public targetLockPos: { x: number; y: number } | null = null;

  public addPredictiveProjectile(proj: ProjectileEntity) {
    this.predictiveProjectiles.push(proj);
  }

  public updatePredictiveProjectiles(dt: number, serverProjectiles: ProjectileEntity[]) {
    for (let i = this.predictiveProjectiles.length - 1; i >= 0; i--) {
      const p = this.predictiveProjectiles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.lifetimeMs -= dt * 1000;

      // Retire predictive projectile if server confirmed it nearby (prevent duplicates)
      const matchedByServer = serverProjectiles.some(
        sp => sp.fromPlayer && Math.hypot(sp.x - p.x, sp.y - p.y) < 70
      );

      if (p.lifetimeMs <= 0 || matchedByServer) {
        this.predictiveProjectiles.splice(i, 1);
      }
    }
  }

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

  public chromaticAberrationTime = 0;
  public hitStopTime = 0;
  public quality: 'HIGH' | 'MEDIUM' | 'LOW' = (localStorage.getItem('calabozo_gfx_quality') as any) || 'HIGH';

  public addScreenShake(intensity = 6, duration = 0.2) {
    this.screenShakeIntensity = Math.max(this.screenShakeIntensity, intensity);
    this.screenShakeTime = Math.max(this.screenShakeTime, duration);
  }

  public addHitStop(duration = 0.045) {
    this.hitStopTime = Math.max(this.hitStopTime, duration);
  }

  public addChromaticAberration(duration = 0.14) {
    this.chromaticAberrationTime = Math.max(this.chromaticAberrationTime, duration);
  }

  public setQuality(q: 'HIGH' | 'MEDIUM' | 'LOW') {
    this.quality = q;
    localStorage.setItem('calabozo_gfx_quality', q);
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

  public clearSmoothPositions() {
    this.interpPositions.clear();
  }

  private getSmoothPos(
    id: string,
    targetX: number,
    targetY: number,
    dt: number,
    isLocal = false,
    targetVx = 0,
    targetVy = 0
  ) {
    if (isLocal) {
      const direct = { x: targetX, y: targetY };
      this.interpPositions.set(id, direct);
      return direct;
    }
    const prev = this.interpPositions.get(id);
    if (!prev || Math.hypot(targetX - prev.x, targetY - prev.y) > 320) {
      const fresh = { x: targetX, y: targetY };
      this.interpPositions.set(id, fresh);
      return fresh;
    }

    // Smooth predictive lead along velocity vector to eliminate 20Hz stepping
    const leadX = targetX + targetVx * 0.035;
    const leadY = targetY + targetVy * 0.035;
    const blend = Math.min(1, dt * 24);
    prev.x += (leadX - prev.x) * blend;
    prev.y += (leadY - prev.y) * blend;
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
    // Process Hit-Stop (Cinematic Freeze-Frame Impact)
    if (this.hitStopTime > 0) {
      this.hitStopTime -= dt;
      dt = 0;
    }
    if (this.chromaticAberrationTime > 0) {
      this.chromaticAberrationTime -= dt;
    }

    this.totalTime += dt;
    const localPlayer = world.players[localPlayerId];
    const roomW = world.room.width || 1200;
    const roomH = world.room.height || 800;

    // Viewport Bounding-Box Culling (2D Frustum Culling)
    const viewPad = 95;
    const viewLeft = this.cameraX - viewPad;
    const viewRight = this.cameraX + canvasWidth + viewPad;
    const viewTop = this.cameraY - viewPad;
    const viewBottom = this.cameraY + canvasHeight + viewPad;
    const inView = (x: number, y: number, r = 40) =>
      x + r >= viewLeft && x - r <= viewRight && y + r >= viewTop && y - r <= viewBottom;

    // 0. Client-side 60-144 FPS Dead-Reckoning Extrapolation between 20Hz server ticks
    if (world.phase === 'PLAYING') {
      const pad = 50;
      for (const enemy of world.enemies) {
        enemy.x = Math.max(pad, Math.min(roomW - pad, enemy.x + enemy.vx * dt));
        enemy.y = Math.max(pad, Math.min(roomH - pad, enemy.y + enemy.vy * dt));
      }
      for (const p of Object.values(world.players)) {
        if (p.id !== localPlayerId && p.isAlive) {
          p.x = Math.max(pad, Math.min(roomW - pad, p.x + p.vx * dt));
          p.y = Math.max(pad, Math.min(roomH - pad, p.y + p.vy * dt));
        }
      }
      for (const proj of world.projectiles) {
        proj.x += proj.vx * dt;
        proj.y += proj.vy * dt;
      }
      this.updatePredictiveProjectiles(dt, world.projectiles);
    }

    // 1. Camera Tracking with smooth Lerp
    if (localPlayer) {
      const smoothLocal = this.getSmoothPos(
        localPlayer.id,
        localPlayer.x,
        localPlayer.y,
        dt,
        true
      );
      const targetCamX = smoothLocal.x - canvasWidth / 2;
      const targetCamY = smoothLocal.y - canvasHeight / 2;
      const camBlend = Math.min(1, dt * 14);
      this.cameraX += (targetCamX - this.cameraX) * camBlend;
      this.cameraY += (targetCamY - this.cameraY) * camBlend;
    } else {
      // Gentle blend toward room center on transition/reconnect fallback without jarring snap
      const targetCamX = roomW / 2 - canvasWidth / 2;
      const targetCamY = roomH / 2 - canvasHeight / 2;
      const camBlend = Math.min(1, dt * 6);
      this.cameraX += (targetCamX - this.cameraX) * camBlend;
      this.cameraY += (targetCamY - this.cameraY) * camBlend;
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

    // 4.2. Interior Labyrinth Walls & Cracked Secret Walls
    if (world.room.walls) {
      for (const wall of world.room.walls) {
        SpriteModels.drawLabyrinthWall(ctx, wall, this.totalTime);
      }
    }

    // 4.3. Co-op Runic Synchronization Seals & Energy Tethers to the Central Eye
    if (world.room.seals && world.room.seals.length > 0) {
      const cx = roomW / 2;
      const cy = roomH / 2;
      for (const seal of world.room.seals) {
        ctx.save();
        ctx.strokeStyle = seal.isActivated
          ? 'rgba(34, 197, 94, 0.48)'
          : seal.progress > 0
          ? 'rgba(56, 189, 248, 0.55)'
          : 'rgba(168, 85, 247, 0.25)';
        ctx.lineWidth = seal.isActivated || seal.progress > 0 ? 3 : 1.8;
        ctx.setLineDash([10, 6]);
        ctx.beginPath();
        ctx.moveTo(seal.x, seal.y);
        ctx.lineTo(cx, cy);
        ctx.stroke();
        ctx.restore();

        SpriteModels.drawSyncSeal(ctx, seal, this.totalTime);
      }

      // Central Eye Visual Seal Synchronization Nodes (Zero text clutter)
      const totalCount = world.room.seals.length;
      ctx.save();
      for (let i = 0; i < totalCount; i++) {
        const seal = world.room.seals[i];
        const nodeX = cx + (i - (totalCount - 1) / 2) * 26;
        const nodeY = cy - 66;
        ctx.fillStyle = seal.isActivated || world.room.isCleared ? '#22c55e' : seal.progress > 0 ? '#38bdf8' : '#7e22ce';
        ctx.strokeStyle = '#fef08a';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(nodeX, nodeY - 7);
        ctx.lineTo(nodeX + 7, nodeY);
        ctx.lineTo(nodeX, nodeY + 7);
        ctx.lineTo(nodeX - 7, nodeY);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
    }

    // 4.5. Environmental & Skill Hazards with Frustum Culling
    if (world.room.hazards) {
      for (const h of world.room.hazards) {
        if (inView(h.x, h.y, h.radius || 90)) {
          SpriteModels.drawHazard(ctx, h, this.totalTime);
        }
      }
    }

    // 4.8. Interactive Barrels with Soft Contact Shadows
    if (world.room.barrels) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.42)';
      for (const b of world.room.barrels) {
        if (inView(b.x, b.y, 40)) {
          ctx.beginPath();
          ctx.ellipse(b.x, b.y + 11, 14, 6, 0, 0, Math.PI * 2);
          ctx.fill();
          SpriteModels.drawBarrel(ctx, b, this.totalTime);
        }
      }
    }

    // 5. Chest with Contact Shadow & Culling
    if (world.room.chest && inView(world.room.chest.x, world.room.chest.y, 60)) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
      ctx.beginPath();
      ctx.ellipse(world.room.chest.x, world.room.chest.y + 14, 22, 9, 0, 0, Math.PI * 2);
      ctx.fill();

      const localClaimed = world.room.chest.claimedByPlayerIds?.includes(localPlayerId);
      SpriteModels.drawChest(
        ctx,
        world.room.chest.x,
        world.room.chest.y,
        world.room.chest.isOpen || !!localClaimed,
        this.totalTime
      );
    }

    // 5.2. Altar of Pacts & Armory with Contact Shadow
    if (world.room.altar && inView(world.room.altar.x, world.room.altar.y, 70)) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.48)';
      ctx.beginPath();
      ctx.ellipse(world.room.altar.x, world.room.altar.y + 16, 26, 11, 0, 0, Math.PI * 2);
      ctx.fill();
      SpriteModels.drawAltar(ctx, world.room.altar, this.totalTime);
    }

    // 5.5. Draw Pickups (Hearts, Gold Coins, Shield Orbs, Frenzy Orbs)
    if (world.room.hearts) {
      for (const heart of world.room.hearts) {
        if (inView(heart.x, heart.y, 30)) {
          SpriteModels.drawHeartPickup(ctx, heart, this.totalTime);
        }
      }
    }

    // 5.6. Draw Enemy Aim Telegraph Warning Lines with Culling
    for (const enemy of world.enemies) {
      if (inView(enemy.x, enemy.y, enemy.radius + 180)) {
        SpriteModels.drawEnemyTelegraph(ctx, enemy);
      }
    }

    // 5.9. Draw Boss Immunity Shield Tethers to Ritual Guardians
    for (const enemy of world.enemies) {
      if (enemy.isBoss && enemy.bossShieldActive) {
        const bossPos = this.getSmoothPos(enemy.id, enemy.x, enemy.y, dt, false);
        for (const minion of world.enemies) {
          if (minion.isBoss) continue;
          const mPos = this.getSmoothPos(minion.id, minion.x, minion.y, dt, false);
          ctx.save();
          // Outer pulsing arcane tether
          ctx.strokeStyle = 'rgba(244, 63, 94, 0.55)';
          ctx.lineWidth = 5 + Math.sin(this.totalTime * 12) * 1.5;
          ctx.beginPath();
          ctx.moveTo(bossPos.x, bossPos.y);
          const midX = (bossPos.x + mPos.x) / 2 + Math.sin(this.totalTime * 8 + minion.x) * 14;
          const midY = (bossPos.y + mPos.y) / 2 + Math.cos(this.totalTime * 8 + minion.y) * 14;
          ctx.quadraticCurveTo(midX, midY, mPos.x, mPos.y);
          ctx.stroke();

          // Inner white-gold core beam
          ctx.strokeStyle = '#fde047';
          ctx.lineWidth = 2;
          ctx.setLineDash([8, 6]);
          ctx.lineDashOffset = -this.totalTime * 60;
          ctx.beginPath();
          ctx.moveTo(bossPos.x, bossPos.y);
          ctx.quadraticCurveTo(midX, midY, mPos.x, mPos.y);
          ctx.stroke();

          // Pylon Anchor Ring under Ritual Guardian
          ctx.setLineDash([]);
          ctx.strokeStyle = '#f43f5e';
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.arc(mPos.x, mPos.y, minion.radius + 9, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }
      }
    }

    // 6. Draw Enemies with Smooth 60 FPS Interpolation & Contact Drop Shadows
    for (const enemy of world.enemies) {
      if (!inView(enemy.x, enemy.y, enemy.radius + 40)) continue;
      const sp = this.getSmoothPos(enemy.id, enemy.x, enemy.y, dt, false, enemy.vx, enemy.vy);

      // Soft contact drop shadow under enemy
      ctx.fillStyle = 'rgba(0, 0, 0, 0.42)';
      ctx.beginPath();
      ctx.ellipse(sp.x, sp.y + enemy.radius * 0.72, enemy.radius * 0.95, enemy.radius * 0.45, 0, 0, Math.PI * 2);
      ctx.fill();

      SpriteModels.drawEnemy(ctx, { ...enemy, x: sp.x, y: sp.y }, this.totalTime);
    }

    // 6.5. Draw Target Lock Indicator (Auto-Aim / Mobile / Gamepad)
    if (this.targetLockPos) {
      ctx.save();
      ctx.translate(this.targetLockPos.x, this.targetLockPos.y);
      ctx.rotate(this.totalTime * 2.8);
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 2.2;
      const r = 26 + Math.sin(this.totalTime * 8) * 2.5;

      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 0.4);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, r, Math.PI * 0.5, Math.PI * 0.9);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, r, Math.PI, Math.PI * 1.4);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, r, Math.PI * 1.5, Math.PI * 1.9);
      ctx.stroke();

      // Inner center dot
      ctx.fillStyle = '#f87171';
      ctx.beginPath();
      ctx.arc(0, 0, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // 7. Draw Players with Smooth 60 FPS Interpolation & Motion Particles
    for (const player of Object.values(world.players)) {
      const isLocal = player.id === localPlayerId;
      const sp = this.getSmoothPos(player.id, player.x, player.y, dt, isLocal, player.vx, player.vy);
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

      if (player.isDisconnected) {
        ctx.save();
        ctx.translate(sp.x, sp.y);
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.arc(0, 0, 26, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = '#38bdf8';
        ctx.font = 'bold 10px sans-serif';
        ctx.textAlign = 'center';
        ctx.shadowColor = '#000';
        ctx.shadowBlur = 4;
        ctx.fillText('⚡ RECONECTANDO...', 0, -32);
        ctx.restore();
      }
    }

    // 8. Draw Projectiles (Server + Local Predictive) with Viewport Culling
    for (const proj of world.projectiles) {
      if (inView(proj.x, proj.y, proj.radius + 30)) {
        this.drawProjectile(ctx, proj);
      }
    }
    for (const proj of this.predictiveProjectiles) {
      if (inView(proj.x, proj.y, proj.radius + 30)) {
        this.drawProjectile(ctx, proj);
      }
    }

    // 9. Update & Draw Particles (Sparks, blood, shockwaves, lightning arcs, bouncing gibs, slash arcs)
    this.particleSystem.update(dt);
    this.particleSystem.render(ctx);

    // 10. Floating Damage Numbers & Synergy Callouts
    this.textManager.update(dt);
    this.textManager.render(ctx);

    // 10.5. Dynamic 2D Real-Time Lighting Pass (Additive Blending)
    if (this.quality !== 'LOW') {
      this.drawDynamicLighting(ctx, world, localPlayer, inView);
    }

    // 11. Lighting, Ambient Warmth, Fog of War & Drifting Dust Motes
    this.drawAmbianceAndFog(ctx, world, localPlayer, roomW, roomH, dt);

    // 11.5. Tactical On-Screen Compass Arrows (drawn OVER fog so players never lose track of enemies, seals, or open doors!)
    if (localPlayer && localPlayer.isAlive) {
      this.drawTacticalCompass(ctx, world, localPlayer, roomW, roomH);
    }

    ctx.restore();

    // 11.8. Screen-Space Cinematic Post-Processing Pass (Gothic Vignette, Low-HP Bloodied Screen, Chromatic Aberration, Dash Streaks)
    this.drawPostProcessing(ctx, world, localPlayer, canvasWidth, canvasHeight);

    // 12. Screen-Space Labyrinth Mini-Map (Top-Right Corner)
    this.drawMiniMap(ctx, world, localPlayer, canvasWidth);
  }

  private ensureOffscreenBackground(world: GameWorldState, w: number, h: number) {
    if (
      this.offscreenCanvas &&
      this.offscreenCanvas.width === w &&
      this.offscreenCanvas.height === h &&
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

    // 10. Pre-bake warm ambient torch glow into static offscreen canvas (saves 4 radial gradients per frame!)
    const torches = [
      { x: w * 0.25, y: pad },
      { x: w * 0.75, y: pad },
      { x: pad, y: h * 0.3 },
      { x: w - pad, y: h * 0.3 },
    ];
    for (const torch of torches) {
      const torchGrad = ctx.createRadialGradient(torch.x, torch.y, 8, torch.x, torch.y, 190);
      torchGrad.addColorStop(0, 'rgba(234, 88, 12, 0.16)');
      torchGrad.addColorStop(0.6, 'rgba(217, 119, 6, 0.06)');
      torchGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = torchGrad;
      ctx.fillRect(torch.x - 190, torch.y - 190, 380, 380);
    }
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
      const visRadius = world.room.mutation.visibilityRadius || 410;

      const grad = ctx.createRadialGradient(
        localPlayer.x,
        localPlayer.y,
        visRadius * 0.4,
        localPlayer.x,
        localPlayer.y,
        visRadius
      );
      grad.addColorStop(0, 'rgba(0, 0, 0, 0)');
      grad.addColorStop(1, 'rgba(10, 8, 7, 0.68)');

      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
    }

    ctx.restore();
  }

  private drawDynamicLighting(
    ctx: CanvasRenderingContext2D,
    world: GameWorldState,
    localPlayer: PlayerEntity | undefined,
    inView: (x: number, y: number, r?: number) => boolean
  ) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    const time = this.totalTime;

    // 1. Dynamic Wall Torch Point Lights (Warm golden/orange radiance with organic flicker)
    const pad = 44;
    const w = world.room.width || 1200;
    const h = world.room.height || 800;
    const torches = [
      { x: w * 0.25, y: pad },
      { x: w * 0.75, y: pad },
      { x: pad, y: h * 0.3 },
      { x: w - pad, y: h * 0.3 },
    ];
    for (const t of torches) {
      if (!inView(t.x, t.y, 220)) continue;
      const flicker = Math.sin(time * 12 + t.x) * 10 + Math.cos(time * 19 + t.y) * 6;
      const radius = Math.max(10, 210 + flicker);
      const grad = ctx.createRadialGradient(t.x, t.y, 6, t.x, t.y, radius);
      grad.addColorStop(0, 'rgba(249, 115, 22, 0.22)');
      grad.addColorStop(0.45, 'rgba(234, 88, 12, 0.07)');
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(t.x, t.y, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    // 2. Player Lanterns / Magical Class Auras
    for (const p of Object.values(world.players)) {
      if (!p.isAlive || !inView(p.x, p.y, 160)) continue;
      const radius = 135 + Math.sin(time * 6 + p.x) * 5;
      const grad = ctx.createRadialGradient(p.x, p.y, 8, p.x, p.y, radius);
      if (p.classType === 'MAGO') {
        grad.addColorStop(0, 'rgba(249, 115, 22, 0.26)');
        grad.addColorStop(0.5, 'rgba(234, 88, 12, 0.08)');
      } else if (p.classType === 'GUERRERO') {
        grad.addColorStop(0, 'rgba(250, 204, 21, 0.20)');
        grad.addColorStop(0.5, 'rgba(217, 119, 6, 0.06)');
      } else if (p.classType === 'PICARO') {
        grad.addColorStop(0, 'rgba(16, 185, 129, 0.20)');
        grad.addColorStop(0.5, 'rgba(5, 150, 105, 0.06)');
      } else {
        grad.addColorStop(0, 'rgba(56, 189, 248, 0.20)');
        grad.addColorStop(0.5, 'rgba(2, 132, 199, 0.06)');
      }
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    // 3. Glowing Projectiles
    for (const proj of world.projectiles) {
      if (!inView(proj.x, proj.y, 90)) continue;
      if (proj.isExplosive || proj.radius > 12 || !proj.fromPlayer) {
        const pRadius = Math.max(6, proj.radius * 3.2);
        const grad = ctx.createRadialGradient(proj.x, proj.y, 2, proj.x, proj.y, pRadius);
        grad.addColorStop(0, proj.color ? `${proj.color}44` : 'rgba(249, 115, 22, 0.25)');
        grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(proj.x, proj.y, pRadius, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.restore();
  }

  private drawPostProcessing(
    ctx: CanvasRenderingContext2D,
    world: GameWorldState,
    localPlayer: PlayerEntity | undefined,
    w: number,
    h: number
  ) {
    if (this.quality === 'LOW' || w <= 10 || h <= 10) return;

    ctx.save();

    // 1. Cinematic Gothic Vignette (Darkens edges and corners for deep dungeon atmosphere)
    const maxDim = Math.max(w, h);
    const minDim = Math.min(w, h);
    const vigGrad = ctx.createRadialGradient(w / 2, h / 2, minDim * 0.44, w / 2, h / 2, maxDim * 0.72);
    vigGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
    vigGrad.addColorStop(0.7, 'rgba(5, 4, 3, 0.35)');
    vigGrad.addColorStop(1, 'rgba(2, 2, 2, 0.72)');
    ctx.fillStyle = vigGrad;
    ctx.fillRect(0, 0, w, h);

    // 2. Visceral Low-HP Bloodied Screen Vignette (pulsing in sync with heartbeat!)
    if (localPlayer && localPlayer.isAlive && localPlayer.currentHp / localPlayer.maxHp <= 0.25) {
      const hpPct = localPlayer.currentHp / localPlayer.maxHp;
      const pulseSpeed = 7.8; // Matches 73 BPM visceral heartbeat
      const pulseIntensity = (0.28 + Math.sin(this.totalTime * pulseSpeed) * 0.18) * (1 - hpPct / 0.25);
      const bloodGrad = ctx.createRadialGradient(w / 2, h / 2, minDim * 0.35, w / 2, h / 2, maxDim * 0.7);
      bloodGrad.addColorStop(0, 'rgba(220, 38, 38, 0)');
      bloodGrad.addColorStop(0.65, `rgba(185, 28, 28, ${pulseIntensity * 0.5})`);
      bloodGrad.addColorStop(1, `rgba(127, 29, 29, ${pulseIntensity * 0.88})`);
      ctx.fillStyle = bloodGrad;
      ctx.fillRect(0, 0, w, h);
    }

    // 3. Chromatic Aberration & Critical Impact Border Pulse
    if (this.chromaticAberrationTime > 0) {
      const alpha = Math.min(0.35, this.chromaticAberrationTime * 2.2);
      ctx.fillStyle = `rgba(239, 68, 68, ${alpha})`;
      ctx.fillRect(0, 0, w, 3);
      ctx.fillRect(0, h - 3, w, 3);
      ctx.fillStyle = `rgba(56, 189, 248, ${alpha})`;
      ctx.fillRect(0, 0, 3, h);
      ctx.fillRect(w - 3, 0, 3, h);
    }

    // 4. Kinetic Dash Speed Streaks
    if (localPlayer && localPlayer.isAlive && localPlayer.isDashing) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
      ctx.lineWidth = 1.5;
      const cx = w / 2;
      const cy = h / 2;
      for (let i = 0; i < 14; i++) {
        const angle = (i / 14) * Math.PI * 2 + (this.totalTime * 3);
        const r1 = minDim * 0.44 + (Math.sin(i * 99) * 20);
        const r2 = r1 + 35 + (Math.cos(i * 44) * 25);
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(angle) * r1, cy + Math.sin(angle) * r1);
        ctx.lineTo(cx + Math.cos(angle) * r2, cy + Math.sin(angle) * r2);
        ctx.stroke();
      }
      ctx.restore();
    }

    ctx.restore();
  }

  /**
   * Draws sleek tactical directional arrows around the player pointing to:
   * - Open North/East/West Exit Portals when the room is cleared
   * - Remaining distant enemies (> 290px away) so no enemy ever hides in the labyrinth
   * - Unactivated Co-op Runic Seals
   */
  private drawTacticalCompass(
    ctx: CanvasRenderingContext2D,
    world: GameWorldState,
    localPlayer: PlayerEntity,
    roomW: number,
    roomH: number
  ) {
    const px = localPlayer.x;
    const py = localPlayer.y;
    const ringRadius = 64;

    ctx.save();
    if (world.room.isCleared) {
      // Point clearly toward the Open North Portal!
      const doorX = roomW / 2;
      const doorY = 30;
      const dist = Math.hypot(doorX - px, doorY - py);
      if (dist > 110) {
        const angle = Math.atan2(doorY - py, doorX - px);
        const ax = px + Math.cos(angle) * ringRadius;
        const ay = py + Math.sin(angle) * ringRadius;

        ctx.save();
        ctx.translate(ax, ay);
        ctx.rotate(angle);
        ctx.fillStyle = '#22c55e';
        ctx.strokeStyle = '#052e16';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(14, 0);
        ctx.lineTo(-8, -9);
        ctx.lineTo(-3, 0);
        ctx.lineTo(-8, 9);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Trailing second chevron (purely visual exit indicator, zero text)
        ctx.fillStyle = '#86efac';
        ctx.beginPath();
        ctx.moveTo(4, 0);
        ctx.lineTo(-14, -6);
        ctx.lineTo(-10, 0);
        ctx.lineTo(-14, 6);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    } else {
      // 1. Arrows to distant enemies (> 290px away)
      let shownEnemies = 0;
      for (const e of world.enemies) {
        const dist = Math.hypot(e.x - px, e.y - py);
        if (dist > 290 && shownEnemies < 4) {
          shownEnemies++;
          const angle = Math.atan2(e.y - py, e.x - px);
          const ax = px + Math.cos(angle) * ringRadius;
          const ay = py + Math.sin(angle) * ringRadius;

          ctx.save();
          ctx.translate(ax, ay);
          ctx.rotate(angle);
          ctx.fillStyle = e.isBoss ? '#facc15' : '#ef4444';
          ctx.beginPath();
          ctx.moveTo(9, 0);
          ctx.lineTo(-6, -5.5);
          ctx.lineTo(-3, 0);
          ctx.lineTo(-6, 5.5);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        }
      }

      // 2. Arrows to unactivated Co-op Seals
      if (world.room.seals) {
        for (const s of world.room.seals) {
          if (s.isActivated) continue;
          const dist = Math.hypot(s.x - px, s.y - py);
          if (dist > 180) {
            const angle = Math.atan2(s.y - py, s.x - px);
            const ax = px + Math.cos(angle) * (ringRadius + 10);
            const ay = py + Math.sin(angle) * (ringRadius + 10);

            ctx.save();
            ctx.translate(ax, ay);
            ctx.rotate(angle);
            ctx.fillStyle = '#38bdf8';
            ctx.beginPath();
            ctx.moveTo(8, 0);
            ctx.lineTo(-5, -5);
            ctx.lineTo(-5, 5);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
          }
        }
      }
    }
    ctx.restore();
  }

  /**
   * Renders the Live Labyrinth Mini-Map in the top-right corner of the screen.
   */
  private drawMiniMap(
    ctx: CanvasRenderingContext2D,
    world: GameWorldState,
    localPlayer: PlayerEntity | undefined,
    canvasWidth: number
  ) {
    const mapW = 176;
    const mapH = 126;
    const mapX = canvasWidth - mapW - 16;
    const mapY = 74;
    const roomW = world.room.width || 2000;
    const roomH = world.room.height || 1450;
    const scaleX = mapW / roomW;
    const scaleY = mapH / roomH;

    ctx.save();

    // Gothic Frame Background
    ctx.fillStyle = 'rgba(12, 10, 9, 0.84)';
    ctx.strokeStyle = world.room.isCleared ? '#22c55e' : '#78350f';
    ctx.lineWidth = 2;
    ctx.fillRect(mapX, mapY, mapW, mapH);
    ctx.strokeRect(mapX, mapY, mapW, mapH);

    // Visual Wave Crystal Pips Header (Zero canvas text)
    ctx.fillStyle = 'rgba(12, 10, 9, 0.9)';
    ctx.fillRect(mapX, mapY - 20, mapW, 18);
    const curWave = world.room.currentWave || 1;
    const totWaves = world.room.totalWaves || 1;
    for (let wIdx = 1; wIdx <= totWaves; wIdx++) {
      const pipX = mapX + 18 + (wIdx - 1) * 18;
      const pipY = mapY - 11;
      const isDone = world.room.isCleared || wIdx < curWave;
      const isCurrent = !world.room.isCleared && wIdx === curWave;
      ctx.fillStyle = isDone ? '#22c55e' : isCurrent ? '#facc15' : '#44403c';
      ctx.beginPath();
      ctx.moveTo(pipX, pipY - 5);
      ctx.lineTo(pipX + 5, pipY);
      ctx.lineTo(pipX, pipY + 5);
      ctx.lineTo(pipX - 5, pipY);
      ctx.closePath();
      ctx.fill();
    }

    // Interior Labyrinth Walls & Secret Wall
    if (world.room.walls) {
      for (const w of world.room.walls) {
        if (w.isOpen) continue;
        ctx.fillStyle = w.isSecretWall ? '#facc15' : '#57534e';
        ctx.fillRect(
          mapX + w.x * scaleX,
          mapY + w.y * scaleY,
          Math.max(2, w.width * scaleX),
          Math.max(2, w.height * scaleY)
        );
      }
    }

    // Co-op Runic Seals
    if (world.room.seals) {
      for (const s of world.room.seals) {
        ctx.fillStyle = s.isActivated ? '#22c55e' : '#38bdf8';
        ctx.beginPath();
        ctx.arc(mapX + s.x * scaleX, mapY + s.y * scaleY, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Doors (North, East, West)
    const doors = world.room.doors;
    if (doors?.NORTH) {
      ctx.fillStyle = doors.NORTH.open ? '#22c55e' : '#dc2626';
      ctx.fillRect(mapX + mapW / 2 - 8, mapY, 16, 4);
    }
    if (doors?.EAST && doors.EAST.open) {
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(mapX + mapW - 4, mapY + mapH / 2 - 6, 4, 12);
    }
    if (doors?.WEST && doors.WEST.open) {
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(mapX, mapY + mapH / 2 - 6, 4, 12);
    }

    // Enemies (Red dots, Gold for Boss)
    for (const e of world.enemies) {
      ctx.fillStyle = e.isBoss ? '#facc15' : '#ef4444';
      ctx.beginPath();
      ctx.arc(mapX + e.x * scaleX, mapY + e.y * scaleY, e.isBoss ? 4.5 : 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Players (Local = bright gold, Allies = sky blue)
    for (const p of Object.values(world.players)) {
      if (!p.isAlive) continue;
      const isMe = localPlayer && p.id === localPlayer.id;
      ctx.fillStyle = isMe ? '#fde047' : '#60a5fa';
      ctx.beginPath();
      ctx.arc(mapX + p.x * scaleX, mapY + p.y * scaleY, isMe ? 3.8 : 3, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }
}
