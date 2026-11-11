import { Server } from 'socket.io';
import { config } from '../config.js';
import {
  CLASS_CONFIGS,
  DirectorDialogue,
  DoorDirection,
  DoorState,
  EnemyEntity,
  EnemyType,
  GamePhase,
  GameWorldState,
  HeartPickup,
  PlayerClass,
  PlayerEntity,
  ProjectileEntity,
  Relic,
  RoomMutation,
  RoomState,
} from '../types.js';
import { DungeonDirector } from '../ai/DungeonDirector.js';

export class DungeonRoom {
  public code: string;
  public phase: GamePhase = 'LOBBY';
  public roomIndex = 1;
  public totalRooms: number;
  public players: Record<string, PlayerEntity> = {};
  public enemies: EnemyEntity[] = [];
  public projectiles: ProjectileEntity[] = [];
  public hearts: HeartPickup[] = [];
  public currentMutation: RoomMutation;
  public chestRelics: Relic[] = [];
  public isChestOpen = false;

  private io: Server;
  private director: DungeonDirector;
  private tickInterval: NodeJS.Timeout | null = null;
  private lastTickAt = Date.now();
  private nextEnemyId = 1;
  private nextProjectileId = 1;
  private nextHeartId = 1;

  public telemetry = {
    totalDamageDealt: 0,
    rangedAttacksCount: 0,
    meleeAttacksCount: 0,
    totalPlayerDeaths: 0,
  };

  public directorDialogue: DirectorDialogue = {
    speaker: 'Director del Calabozo',
    text: 'Bienvenidos a las pruebas de selección. La supervivencia no está garantizada.',
    mood: 'MOCKING',
    timestamp: Date.now(),
  };

  constructor(code: string, io: Server, director: DungeonDirector) {
    this.code = code;
    this.io = io;
    this.director = director;
    this.totalRooms = config.game.totalRoomsToBoss;

    // Room 1 mutation
    this.currentMutation = {
      title: 'Vestíbulo de los Ingenuos',
      description: 'Habitación de entrenamiento con piso de piedra sólida.',
      directorRoast: 'Si no pasan esta sala, mejor dedíquense a la contabilidad.',
      frictionMultiplier: 1.0,
      bulletBouncesBonus: 0,
      enemySpeedMultiplier: 1.0,
      playerDamageMultiplier: 1.0,
      lowVisibility: false,
      visibilityRadius: 900,
      hazardType: 'NONE',
    };

    // Pre-fetch Room 1 and Room 2 immediately
    this.director.prefetchNextRoom(1, this.totalRooms);
    this.director.prefetchNextRoom(2, this.totalRooms);
  }

  public addPlayer(socketId: string, name: string, classType: PlayerClass, avatarIndex: number): PlayerEntity {
    const isHost = Object.keys(this.players).length === 0;
    const stats = CLASS_CONFIGS[classType] || CLASS_CONFIGS.CAZADOR;

    const player: PlayerEntity = {
      id: socketId,
      name: (name || 'Aventurero').trim().slice(0, 16),
      classType,
      avatarIndex,
      isHost,
      x: config.game.roomWidth / 2 + (Object.keys(this.players).length * 40 - 60),
      y: config.game.roomHeight / 2 + 100,
      vx: 0,
      vy: 0,
      angle: 0,
      currentHp: stats.maxHp,
      maxHp: stats.maxHp,
      isAlive: true,
      isDashing: false,
      dashCooldownEndsAt: 0,
      dashEndsAt: 0,
      lastAttackAt: 0,
      invulnerableUntil: 0,
      relics: [],
      kills: 0,
      damageDealt: 0,
    };

    this.players[socketId] = player;
    return player;
  }

  public removePlayer(socketId: string): void {
    const wasHost = this.players[socketId]?.isHost;
    delete this.players[socketId];

    const remaining = Object.values(this.players);
    if (wasHost && remaining.length > 0) {
      remaining[0].isHost = true;
    }

    if (remaining.length === 0) {
      this.stopLoop();
    }
  }

  public async startGame(): Promise<void> {
    if (this.phase !== 'LOBBY' && this.phase !== 'VICTORY' && this.phase !== 'GAME_OVER') return;

    this.phase = 'PLAYING';
    this.roomIndex = 1;
    this.telemetry = {
      totalDamageDealt: 0,
      rangedAttacksCount: 0,
      meleeAttacksCount: 0,
      totalPlayerDeaths: 0,
    };

    // Reset players
    Object.values(this.players).forEach(p => {
      const stats = CLASS_CONFIGS[p.classType];
      p.currentHp = stats.maxHp;
      p.maxHp = stats.maxHp;
      p.isAlive = true;
      p.isDashing = false;
      p.invulnerableUntil = 0;
      p.relics = [];
      p.kills = 0;
      p.damageDealt = 0;
      p.x = config.game.roomWidth / 2;
      p.y = config.game.roomHeight / 2 + 120;
      p.vx = 0;
      p.vy = 0;
    });

    await this.setupRoom(1);
    this.startLoop();
  }

  private async setupRoom(index: number): Promise<void> {
    this.roomIndex = index;
    this.projectiles = [];
    this.hearts = [];
    this.isChestOpen = false;

    // Fetch room mutation and relics from Director
    const roomData = await this.director.getRoomData(index, this.totalRooms);
    this.currentMutation = roomData.mutation;
    this.chestRelics = roomData.relics;

    // Reposition players near entrance and give a restorative heal (+35% HP)
    Object.values(this.players).forEach(p => {
      p.x = config.game.roomWidth / 2;
      p.y = config.game.roomHeight - 140;
      p.vx = 0;
      p.vy = 0;
      p.isAlive = true;
      p.invulnerableUntil = Date.now() + 1000; // 1s entrance grace
      p.currentHp = Math.min(p.maxHp, p.currentHp + Math.floor(p.maxHp * 0.35));
    });

    this.directorDialogue = {
      speaker: 'Director del Calabozo',
      text: this.currentMutation.directorRoast,
      mood: 'MOCKING',
      timestamp: Date.now(),
    };

    const isBoss = index >= this.totalRooms;
    if (isBoss) {
      this.spawnBoss();
    } else {
      this.spawnEnemiesForRoom(index);
    }

    // Prefetch next room in background
    this.director.prefetchNextRoom(index + 1, this.totalRooms);
    this.broadcastState();
  }

  /**
   * Pacing & Difficulty Curve:
   * Room 1: 3 gentle Slimes (learn movement & attacks).
   * Room 2: 2 Slimes + 2 Skeletons (learn dodges & line of sight).
   * Room 3: 3 Bats + 2 Slimes (swarms).
   * Room 4: 3 Skeletons + 3 Bats (high intensity).
   * Room 5: Elite gauntlet (4 Slimes + 3 Skeletons + 2 Bats).
   */
  private spawnEnemiesForRoom(index: number): void {
    this.enemies = [];
    const speedMult = this.currentMutation.enemySpeedMultiplier;

    let types: EnemyType[] = [];
    if (index === 1) {
      types = ['SLIME', 'SLIME', 'SLIME'];
    } else if (index === 2) {
      types = ['SLIME', 'SLIME', 'ESQUELETO', 'ESQUELETO'];
    } else if (index === 3) {
      types = ['MURCIELAGO', 'MURCIELAGO', 'MURCIELAGO', 'SLIME', 'SLIME'];
    } else if (index === 4) {
      types = ['ESQUELETO', 'ESQUELETO', 'ESQUELETO', 'MURCIELAGO', 'MURCIELAGO', 'SLIME'];
    } else {
      types = ['SLIME', 'SLIME', 'SLIME', 'ESQUELETO', 'ESQUELETO', 'MURCIELAGO', 'MURCIELAGO'];
    }

    types.forEach(type => {
      const enemyId = `enemy_${this.nextEnemyId++}`;
      // Spawn in upper half of room away from players
      const x = 180 + Math.random() * (config.game.roomWidth - 360);
      const y = 140 + Math.random() * (config.game.roomHeight / 2 - 120);

      if (type === 'SLIME') {
        this.enemies.push({
          id: enemyId,
          type,
          name: 'Slime Mutante',
          x,
          y,
          vx: 0,
          vy: 0,
          radius: 22,
          currentHp: 40 + index * 10,
          maxHp: 40 + index * 10,
          speed: 100 * speedMult, // Measured speed during leap
          damage: 14,
          color: '#15803d',
          lastAttackAt: 0,
          attackCooldownMs: 1400,
          stateTimer: Math.random() * 800,
          aiState: 'IDLE',
        });
      } else if (type === 'ESQUELETO') {
        this.enemies.push({
          id: enemyId,
          type,
          name: 'Esqueleto Centinela',
          x,
          y,
          vx: 0,
          vy: 0,
          radius: 18,
          currentHp: 32 + index * 8,
          maxHp: 32 + index * 8,
          speed: 75 * speedMult,
          damage: 12,
          color: '#e2e8f0',
          lastAttackAt: 0,
          attackCooldownMs: 2200,
          stateTimer: 0,
          aiState: 'IDLE',
          aimAngle: 0,
        });
      } else {
        this.enemies.push({
          id: enemyId,
          type,
          name: 'Murciélago Kamikaze',
          x,
          y,
          vx: 0,
          vy: 0,
          radius: 15,
          currentHp: 24 + index * 6,
          maxHp: 24 + index * 6,
          speed: 135 * speedMult,
          damage: 15,
          color: '#991b1b',
          lastAttackAt: 0,
          attackCooldownMs: 1600,
          stateTimer: Math.random() * 1000,
          aiState: 'IDLE',
        });
      }
    });
  }

  private async spawnBoss(): Promise<void> {
    this.enemies = [];
    const bossData = await this.director.getBossAdaptation(this.telemetry);

    this.directorDialogue = {
      speaker: bossData.bossName,
      text: bossData.introQuote,
      mood: 'ANGRY',
      timestamp: Date.now(),
    };

    this.enemies.push({
      id: 'boss_director_final',
      type: 'BOSS_DIRECTOR',
      name: bossData.bossName,
      x: config.game.roomWidth / 2,
      y: 220,
      vx: 0,
      vy: 0,
      radius: 52,
      currentHp: 950,
      maxHp: 950,
      speed: 85 * this.currentMutation.enemySpeedMultiplier,
      damage: 22,
      color: '#b91c1c',
      lastAttackAt: 0,
      attackCooldownMs: 1700,
      stateTimer: 0,
      isBoss: true,
      bossPhase: 1,
    });
  }

  /**
   * Highly responsive player input processing with snappy acceleration.
   */
  public handlePlayerInput(
    socketId: string,
    input: {
      moveX: number;
      moveY: number;
      angle: number;
      isAttacking?: boolean;
      isDashing?: boolean;
    }
  ): void {
    const player = this.players[socketId];
    if (!player || !player.isAlive || this.phase !== 'PLAYING') return;

    player.angle = input.angle;
    const now = Date.now();
    const stats = this.getPlayerEffectiveStats(player);

    // Handle Dash with 100% i-frames
    if (input.isDashing && now >= player.dashCooldownEndsAt && !player.isDashing) {
      player.isDashing = true;
      player.dashEndsAt = now + stats.dashDurationMs;
      player.dashCooldownEndsAt = now + stats.dashCooldownMs;
      player.invulnerableUntil = now + stats.dashDurationMs + 50; // Invulnerable throughout dash

      const len = Math.hypot(input.moveX, input.moveY) || 1;
      const dirX = len > 0.1 ? input.moveX / len : Math.cos(player.angle);
      const dirY = len > 0.1 ? input.moveY / len : Math.sin(player.angle);

      player.vx = dirX * stats.dashSpeed;
      player.vy = dirY * stats.dashSpeed;
    } else if (!player.isDashing) {
      // Snappy, agile movement
      const targetSpeed = stats.moveSpeed;
      const len = Math.hypot(input.moveX, input.moveY);
      const normX = len > 0 ? (input.moveX / len) * targetSpeed : 0;
      const normY = len > 0 ? (input.moveY / len) * targetSpeed : 0;

      const isIce = this.currentMutation.frictionMultiplier < 0.3;
      if (isIce) {
        // Ice physics: Instant acceleration to top speed, but low friction coasting
        const accel = len > 0 ? 0.75 : 0.08;
        player.vx += (normX - player.vx) * accel;
        player.vy += (normY - player.vy) * accel;
      } else {
        // Normal ground: Instant 85% response, no sluggish ramp-up
        player.vx += (normX - player.vx) * 0.85;
        player.vy += (normY - player.vy) * 0.85;
      }
    }

    // Handle Attack
    if (input.isAttacking && now - player.lastAttackAt >= stats.attackCooldownMs) {
      player.lastAttackAt = now;
      this.firePlayerAttack(player, stats);
    }
  }

  private firePlayerAttack(player: PlayerEntity, stats: ReturnType<typeof this.getPlayerEffectiveStats>): void {
    const isMelee = player.classType === 'GUERRERO';
    if (isMelee) {
      this.telemetry.meleeAttacksCount++;
    } else {
      this.telemetry.rangedAttacksCount++;
    }

    const bulletCount = stats.bulletCount;
    const spread = stats.bulletSpreadRad;
    const baseAngle = player.angle;

    for (let i = 0; i < bulletCount; i++) {
      const angleOffset = bulletCount === 1 ? 0 : (i - (bulletCount - 1) / 2) * (spread / (bulletCount - 1 || 1));
      const finalAngle = baseAngle + angleOffset;

      const speed = isMelee ? 220 : stats.bulletSpeed;
      const radius = isMelee ? 24 : player.classType === 'MAGO' ? 14 : 7;
      const color = isMelee ? '#f59e0b' : player.classType === 'MAGO' ? '#ea580c' : '#0284c7';

      this.projectiles.push({
        id: `proj_${this.nextProjectileId++}`,
        ownerId: player.id,
        fromPlayer: true,
        x: player.x + Math.cos(finalAngle) * 30,
        y: player.y + Math.sin(finalAngle) * 30,
        vx: Math.cos(finalAngle) * speed,
        vy: Math.sin(finalAngle) * speed,
        radius,
        damage: Math.round(stats.attackDamage * this.currentMutation.playerDamageMultiplier),
        color,
        bouncesRemaining: stats.bulletBounces + this.currentMutation.bulletBouncesBonus,
        createdAt: Date.now(),
        lifetimeMs: stats.bulletLifetimeMs,
        isExplosive: player.classType === 'MAGO',
        explosionRadius: player.classType === 'MAGO' ? 65 : 0,
      });
    }
  }

  public handleRelicChoice(socketId: string, relicId: string): void {
    const player = this.players[socketId];
    if (!player) return;

    const relic = this.chestRelics.find(r => r.id === relicId);
    if (relic) {
      player.relics.push(relic);
      if (relic.modifiers.maxHpBonus) {
        player.maxHp += relic.modifiers.maxHpBonus;
        player.currentHp = Math.min(player.maxHp, player.currentHp + relic.modifiers.maxHpBonus);
      }
      this.isChestOpen = true;
      this.broadcastState();
    }
  }

  private startLoop(): void {
    if (this.tickInterval) return;
    this.lastTickAt = Date.now();

    this.tickInterval = setInterval(() => {
      this.tick();
    }, 1000 / config.game.tickRateHz);
  }

  private stopLoop(): void {
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
  }

  private tick(): void {
    const now = Date.now();
    const dt = Math.min(0.06, (now - this.lastTickAt) / 1000);
    this.lastTickAt = now;

    if (this.phase !== 'PLAYING') return;

    this.updatePlayers(dt, now);
    this.updateEnemies(dt, now);
    this.updateProjectiles(dt, now);
    this.checkRoomClearance();
    this.broadcastState();
  }

  private updatePlayers(dt: number, now: number): void {
    const W = config.game.roomWidth;
    const H = config.game.roomHeight;
    const pad = 48;

    Object.values(this.players).forEach(p => {
      if (!p.isAlive) return;

      if (p.isDashing && now >= p.dashEndsAt) {
        p.isDashing = false;
        p.vx *= 0.3;
        p.vy *= 0.3;
      }

      p.x += p.vx * dt;
      p.y += p.vy * dt;

      // Heart pickup check
      for (let i = this.hearts.length - 1; i >= 0; i--) {
        const h = this.hearts[i];
        const distSq = (p.x - h.x) * (p.x - h.x) + (p.y - h.y) * (p.y - h.y);
        if (distSq < 32 * 32 && p.currentHp < p.maxHp) {
          p.currentHp = Math.min(p.maxHp, p.currentHp + h.healAmount);
          this.hearts.splice(i, 1);
        }
      }

      // Door transitions
      const isCleared = this.enemies.length === 0;

      if (p.y < pad) {
        if (isCleared && Math.abs(p.x - W / 2) < 55) {
          this.advanceToNextRoom();
          return;
        }
        p.y = pad;
        p.vy = 0;
      }
      if (p.y > H - pad) {
        p.y = H - pad;
        p.vy = 0;
      }
      if (p.x < pad) {
        p.x = pad;
        p.vx = 0;
      }
      if (p.x > W - pad) {
        p.x = W - pad;
        p.vx = 0;
      }
    });
  }

  /**
   * Telegraphed Enemy AI with clear wind-up and attack windows.
   */
  private updateEnemies(dt: number, now: number): void {
    const alivePlayers = Object.values(this.players).filter(p => p.isAlive);
    if (alivePlayers.length === 0) return;

    this.enemies.forEach(e => {
      let closestPlayer = alivePlayers[0];
      let minDist = Infinity;
      for (const p of alivePlayers) {
        const dist = Math.hypot(p.x - e.x, p.y - e.y);
        if (dist < minDist) {
          minDist = dist;
          closestPlayer = p;
        }
      }

      const angleToPlayer = Math.atan2(closestPlayer.y - e.y, closestPlayer.x - e.x);

      if (e.type === 'SLIME') {
        // SLIME: Hop & Squish state machine
        e.stateTimer = (e.stateTimer || 0) + dt * 1000;
        const cycle = e.stateTimer % 1400;

        if (cycle < 450) {
          // CHARGING: Squishes on the spot, telegraphing leap
          e.aiState = 'CHARGING';
          e.vx *= 0.6;
          e.vy *= 0.6;
        } else if (cycle < 850) {
          // ATTACKING: Leaps forward rapidly
          e.aiState = 'ATTACKING';
          e.vx = Math.cos(angleToPlayer) * (e.speed * 1.8);
          e.vy = Math.sin(angleToPlayer) * (e.speed * 1.8);

          // Contact damage only during leap
          if (minDist < e.radius + 18) {
            this.damagePlayer(closestPlayer, e.damage);
          }
        } else {
          // RESTING
          e.aiState = 'IDLE';
          e.vx *= 0.4;
          e.vy *= 0.4;
        }
      } else if (e.type === 'ESQUELETO') {
        // ESQUELETO: Keeps distance and aims telegraphed shot
        e.stateTimer = (e.stateTimer || 0) + dt * 1000;
        const cycle = e.stateTimer % e.attackCooldownMs;

        if (cycle > e.attackCooldownMs - 600) {
          // AIMING (Telegraph laser line)
          e.aiState = 'CHARGING';
          e.aimAngle = angleToPlayer;
          e.vx = 0;
          e.vy = 0;

          if (now - e.lastAttackAt >= e.attackCooldownMs) {
            e.lastAttackAt = now;
            this.projectiles.push({
              id: `proj_${this.nextProjectileId++}`,
              ownerId: e.id,
              fromPlayer: false,
              x: e.x + Math.cos(angleToPlayer) * 22,
              y: e.y + Math.sin(angleToPlayer) * 22,
              vx: Math.cos(angleToPlayer) * 360,
              vy: Math.sin(angleToPlayer) * 360,
              radius: 6,
              damage: e.damage,
              color: '#991b1b',
              bouncesRemaining: 0,
              createdAt: now,
              lifetimeMs: 2500,
            });
          }
        } else {
          // Reposition slowly
          e.aiState = 'IDLE';
          if (minDist < 220) {
            e.vx = -Math.cos(angleToPlayer) * e.speed;
            e.vy = -Math.sin(angleToPlayer) * e.speed;
          } else if (minDist > 340) {
            e.vx = Math.cos(angleToPlayer) * e.speed;
            e.vy = Math.sin(angleToPlayer) * e.speed;
          } else {
            e.vx *= 0.5;
            e.vy *= 0.5;
          }
        }
      } else if (e.type === 'MURCIELAGO') {
        // MURCIELAGO: Swoop and glide
        e.stateTimer = (e.stateTimer || 0) + dt * 1000;
        const cycle = e.stateTimer % 2000;

        if (cycle < 700) {
          // DIVE-BOMB in straight line
          e.aiState = 'ATTACKING';
          e.vx = Math.cos(angleToPlayer) * (e.speed * 1.5);
          e.vy = Math.sin(angleToPlayer) * (e.speed * 1.5);

          if (minDist < e.radius + 16) {
            this.damagePlayer(closestPlayer, e.damage);
          }
        } else {
          // Circling glide
          e.aiState = 'IDLE';
          const orbitAngle = angleToPlayer + Math.PI / 2;
          e.vx = Math.cos(orbitAngle) * e.speed;
          e.vy = Math.sin(orbitAngle) * e.speed;
        }
      } else if (e.isBoss) {
        // BOSS DIRECTOR: Multi-phase Bullet Dance
        const isPhase2 = e.currentHp <= e.maxHp * 0.5;
        if (isPhase2 && e.bossPhase === 1) {
          e.bossPhase = 2;
          this.directorDialogue = {
            speaker: e.name,
            text: '¡FASE 2 ACTIVADA! ¡EL TRIBUNAL DICTA SENTENCIA INMEDIATA!',
            mood: 'ANGRY',
            timestamp: now,
          };
        }

        // Center hover
        const centerX = config.game.roomWidth / 2;
        const centerY = 230;
        e.vx = (centerX - e.x) * 0.6;
        e.vy = (centerY - e.y) * 0.6;

        if (now - e.lastAttackAt >= (isPhase2 ? 1100 : 1600)) {
          e.lastAttackAt = now;
          const bulletCount = isPhase2 ? 10 : 7;
          for (let i = 0; i < bulletCount; i++) {
            const shotAngle = (i / bulletCount) * Math.PI * 2 + (now / 350);
            this.projectiles.push({
              id: `proj_${this.nextProjectileId++}`,
              ownerId: e.id,
              fromPlayer: false,
              x: e.x + Math.cos(shotAngle) * 44,
              y: e.y + Math.sin(shotAngle) * 44,
              vx: Math.cos(shotAngle) * (isPhase2 ? 260 : 200),
              vy: Math.sin(shotAngle) * (isPhase2 ? 260 : 200),
              radius: 10,
              damage: e.damage,
              color: isPhase2 ? '#dc2626' : '#d97706',
              bouncesRemaining: isPhase2 ? 1 : 0,
              createdAt: now,
              lifetimeMs: 3200,
            });
          }
        }
      }

      e.x += e.vx * dt;
      e.y += e.vy * dt;
    });
  }

  /**
   * Optimized Projectile & Collision Pipeline with Knockback and Heart Drops.
   */
  private updateProjectiles(dt: number, now: number): void {
    const W = config.game.roomWidth;
    const H = config.game.roomHeight;
    const pad = 42;

    const remaining: ProjectileEntity[] = [];

    for (const p of this.projectiles) {
      if (now - p.createdAt > p.lifetimeMs) continue;

      p.x += p.vx * dt;
      p.y += p.vy * dt;

      // Wall bounce or destroy
      if (p.x <= pad || p.x >= W - pad) {
        if (p.bouncesRemaining > 0) {
          p.vx = -p.vx;
          p.bouncesRemaining--;
          p.x = Math.max(pad + 1, Math.min(W - pad - 1, p.x));
        } else {
          continue;
        }
      }
      if (p.y <= pad || p.y >= H - pad) {
        if (p.bouncesRemaining > 0) {
          p.vy = -p.vy;
          p.bouncesRemaining--;
          p.y = Math.max(pad + 1, Math.min(H - pad - 1, p.y));
        } else {
          continue;
        }
      }

      // Hit Player
      if (!p.fromPlayer) {
        let hit = false;
        for (const pl of Object.values(this.players)) {
          if (!pl.isAlive || pl.isDashing) continue;
          const r = 22 + p.radius;
          const dx = pl.x - p.x;
          if (Math.abs(dx) > r) continue;
          const dy = pl.y - p.y;
          if (Math.abs(dy) > r) continue;

          if (dx * dx + dy * dy < r * r) {
            this.damagePlayer(pl, p.damage);
            hit = true;
            break;
          }
        }
        if (hit) continue;
      }

      // Hit Enemy
      if (p.fromPlayer) {
        let hit = false;
        for (let i = this.enemies.length - 1; i >= 0; i--) {
          const e = this.enemies[i];
          const r = e.radius + p.radius;
          const dx = e.x - p.x;
          if (Math.abs(dx) > r) continue;
          const dy = e.y - p.y;
          if (Math.abs(dy) > r) continue;

          if (dx * dx + dy * dy < r * r) {
            hit = true;
            e.currentHp -= p.damage;
            e.flashUntil = now + 90; // Visual damage flash
            this.telemetry.totalDamageDealt += p.damage;

            // Knockback on enemy
            const knockAngle = Math.atan2(p.vy, p.vx);
            e.vx += Math.cos(knockAngle) * (p.isExplosive ? 140 : 80);
            e.vy += Math.sin(knockAngle) * (p.isExplosive ? 140 : 80);

            const owner = this.players[p.ownerId];
            if (owner) {
              owner.damageDealt += p.damage;
            }

            // Enemy death
            if (e.currentHp <= 0) {
              this.enemies.splice(i, 1);
              if (owner) owner.kills++;

              // 30% chance to drop a healing heart pickup!
              if (Math.random() < 0.35) {
                this.hearts.push({
                  id: `heart_${this.nextHeartId++}`,
                  x: e.x,
                  y: e.y,
                  healAmount: 20,
                  createdAt: now,
                });
              }
            }
            break;
          }
        }
        if (hit) continue;
      }

      remaining.push(p);
    }

    this.projectiles = remaining;
  }

  private damagePlayer(player: PlayerEntity, damage: number): void {
    const now = Date.now();
    // Mercy i-frames (grace period)
    if (now < player.invulnerableUntil || player.isDashing) return;

    player.currentHp = Math.max(0, player.currentHp - damage);
    player.invulnerableUntil = now + 650; // 650ms of immunity after taking damage

    if (player.currentHp === 0 && player.isAlive) {
      player.isAlive = false;
      this.telemetry.totalPlayerDeaths++;
      this.directorDialogue = this.director.getDirectorQuote('playerDown');

      const anyAlive = Object.values(this.players).some(p => p.isAlive);
      if (!anyAlive) {
        this.phase = 'GAME_OVER';
        this.directorDialogue = {
          speaker: 'Director del Calabozo',
          text: 'EXTINCIÓN TOTAL DEL EQUIPO. Archívese el expediente como pérdida sin valor.',
          mood: 'MOCKING',
          timestamp: Date.now(),
        };
      }
    }
  }

  private checkRoomClearance(): void {
    if (this.enemies.length === 0 && this.phase === 'PLAYING') {
      const isBoss = this.roomIndex >= this.totalRooms;
      if (isBoss) {
        this.phase = 'VICTORY';
        this.directorDialogue = {
          speaker: 'Director del Calabozo',
          text: '¡INCREÍBLE! Han derrotado al sistema central. Su indemnización será pagada en la próxima reencarnación.',
          mood: 'SURPRISED',
          timestamp: Date.now(),
        };
      } else {
        this.directorDialogue = this.director.getDirectorQuote('roomClear');
      }
    }
  }

  public advanceToNextRoom(): void {
    if (this.enemies.length > 0) return;
    const nextIdx = this.roomIndex + 1;
    if (nextIdx > this.totalRooms) {
      this.phase = 'VICTORY';
    } else {
      this.setupRoom(nextIdx);
    }
  }

  private getPlayerEffectiveStats(player: PlayerEntity) {
    const base = CLASS_CONFIGS[player.classType] || CLASS_CONFIGS.CAZADOR;
    let damageMult = 1;
    let speedMult = 1;
    let cooldownMult = 1;
    let bouncesBonus = 0;
    let countBonus = 0;

    for (const r of player.relics) {
      if (r.modifiers.damageMultiplier) damageMult *= r.modifiers.damageMultiplier;
      if (r.modifiers.moveSpeedMultiplier) speedMult *= r.modifiers.moveSpeedMultiplier;
      if (r.modifiers.attackCooldownMultiplier) cooldownMult *= r.modifiers.attackCooldownMultiplier;
      if (r.modifiers.bulletBouncesBonus) bouncesBonus += r.modifiers.bulletBouncesBonus;
      if (r.modifiers.bulletCountBonus) countBonus += r.modifiers.bulletCountBonus;
    }

    return {
      ...base,
      attackDamage: Math.round(base.attackDamage * damageMult),
      moveSpeed: Math.round(base.moveSpeed * speedMult),
      attackCooldownMs: Math.round(base.attackCooldownMs * cooldownMult),
      bulletBounces: base.bulletBounces + bouncesBonus,
      bulletCount: base.bulletCount + countBonus,
    };
  }

  public getState(): GameWorldState {
    const isCleared = this.enemies.length === 0;
    const W = config.game.roomWidth;
    const H = config.game.roomHeight;

    const doors: Record<DoorDirection, DoorState> = {
      NORTH: {
        direction: 'NORTH',
        open: isCleared,
        targetRoomIndex: this.roomIndex + 1,
        x: W / 2 - 50,
        y: 10,
        width: 100,
        height: 40,
      },
      SOUTH: {
        direction: 'SOUTH',
        open: false,
        targetRoomIndex: this.roomIndex - 1,
        x: W / 2 - 50,
        y: H - 50,
        width: 100,
        height: 40,
      },
      EAST: {
        direction: 'EAST',
        open: false,
        targetRoomIndex: this.roomIndex,
        x: W - 50,
        y: H / 2 - 50,
        width: 40,
        height: 100,
      },
      WEST: {
        direction: 'WEST',
        open: false,
        targetRoomIndex: this.roomIndex,
        x: 10,
        y: H / 2 - 50,
        width: 40,
        height: 100,
      },
    };

    const room: RoomState = {
      roomIndex: this.roomIndex,
      totalRooms: this.totalRooms,
      isBossRoom: this.roomIndex >= this.totalRooms,
      mutation: this.currentMutation,
      isCleared,
      doors,
      chest: isCleared && this.chestRelics.length > 0 ? {
        x: W / 2,
        y: H / 2,
        isOpen: this.isChestOpen,
        relicOptions: this.chestRelics,
      } : null,
      hearts: this.hearts,
      width: W,
      height: H,
    };

    return {
      code: this.code,
      phase: this.phase,
      room,
      players: this.players,
      enemies: this.enemies,
      projectiles: this.projectiles,
      directorDialogue: this.directorDialogue,
      telemetry: this.telemetry,
    };
  }

  public broadcastState(): void {
    this.io.to(this.code).emit('world:state', this.getState());
  }
}
