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
  public currentMutation: RoomMutation;
  public chestRelics: Relic[] = [];
  public isChestOpen = false;

  private io: Server;
  private director: DungeonDirector;
  private tickInterval: NodeJS.Timeout | null = null;
  private lastTickAt = Date.now();
  private nextEnemyId = 1;
  private nextProjectileId = 1;

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

    // Default room 1 mutation
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

    // Position player in the center-bottom of room
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
    this.isChestOpen = false;

    // Fetch room mutation and relics from Director
    const roomData = await this.director.getRoomData(index, this.totalRooms);
    this.currentMutation = roomData.mutation;
    this.chestRelics = roomData.relics;

    // Reposition players near entrance
    Object.values(this.players).forEach(p => {
      p.x = config.game.roomWidth / 2;
      p.y = config.game.roomHeight - 140;
      p.vx = 0;
      p.vy = 0;
      p.isAlive = true;
      p.currentHp = Math.min(p.maxHp, p.currentHp + Math.floor(p.maxHp * 0.25)); // Heal 25% on new room
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

    // Immediately trigger prefetch for next room in background!
    this.director.prefetchNextRoom(index + 1, this.totalRooms);
    this.broadcastState();
  }

  private spawnEnemiesForRoom(index: number): void {
    this.enemies = [];
    const count = 3 + index * 2;
    const speedMult = this.currentMutation.enemySpeedMultiplier;

    for (let i = 0; i < count; i++) {
      const type: EnemyType = i % 3 === 0 ? 'MURCIELAGO' : i % 2 === 0 ? 'ESQUELETO' : 'SLIME';
      const enemyId = `enemy_${this.nextEnemyId++}`;

      // Spawn away from players (upper half of the room)
      const x = 150 + Math.random() * (config.game.roomWidth - 300);
      const y = 140 + Math.random() * (config.game.roomHeight / 2 - 100);

      if (type === 'SLIME') {
        this.enemies.push({
          id: enemyId,
          type,
          name: 'Slime Mutante',
          x,
          y,
          vx: 0,
          vy: 0,
          radius: 24,
          currentHp: 60 + index * 15,
          maxHp: 60 + index * 15,
          speed: 130 * speedMult,
          damage: 18,
          color: '#10b981',
          lastAttackAt: 0,
          attackCooldownMs: 1200,
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
          radius: 20,
          currentHp: 45 + index * 10,
          maxHp: 45 + index * 10,
          speed: 95 * speedMult,
          damage: 14,
          color: '#e2e8f0',
          lastAttackAt: 0,
          attackCooldownMs: 2200,
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
          radius: 16,
          currentHp: 30 + index * 8,
          maxHp: 30 + index * 8,
          speed: 180 * speedMult,
          damage: 22,
          color: '#ec4899',
          lastAttackAt: 0,
          attackCooldownMs: 1500,
        });
      }
    }
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
      radius: 55,
      currentHp: 1200,
      maxHp: 1200,
      speed: 100 * this.currentMutation.enemySpeedMultiplier,
      damage: 32,
      color: '#f43f5e',
      lastAttackAt: 0,
      attackCooldownMs: 1600,
      isBoss: true,
      bossPhase: 1,
    });
  }

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

    // Movement acceleration and friction
    const now = Date.now();
    const stats = this.getPlayerEffectiveStats(player);

    // Handle Dash
    if (input.isDashing && now >= player.dashCooldownEndsAt && !player.isDashing) {
      player.isDashing = true;
      player.dashEndsAt = now + stats.dashDurationMs;
      player.dashCooldownEndsAt = now + stats.dashCooldownMs;

      // Dash direction
      const len = Math.hypot(input.moveX, input.moveY) || 1;
      const dirX = len > 0.1 ? input.moveX / len : Math.cos(player.angle);
      const dirY = len > 0.1 ? input.moveY / len : Math.sin(player.angle);

      player.vx = dirX * stats.dashSpeed;
      player.vy = dirY * stats.dashSpeed;
    } else if (!player.isDashing) {
      // Normal movement with friction
      const targetSpeed = stats.moveSpeed;
      const len = Math.hypot(input.moveX, input.moveY);
      const normX = len > 0 ? (input.moveX / len) * targetSpeed : 0;
      const normY = len > 0 ? (input.moveY / len) * targetSpeed : 0;

      const friction = this.currentMutation.frictionMultiplier;
      player.vx += (normX - player.vx) * Math.min(1, 0.25 * friction);
      player.vy += (normY - player.vy) * Math.min(1, 0.25 * friction);
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

      const speed = isMelee ? 180 : stats.bulletSpeed;
      const radius = isMelee ? 22 : player.classType === 'MAGO' ? 14 : 7;
      const color = isMelee ? '#f59e0b' : player.classType === 'MAGO' ? '#a855f7' : '#38bdf8';

      this.projectiles.push({
        id: `proj_${this.nextProjectileId++}`,
        ownerId: player.id,
        fromPlayer: true,
        x: player.x + Math.cos(finalAngle) * 28,
        y: player.y + Math.sin(finalAngle) * 28,
        vx: Math.cos(finalAngle) * speed,
        vy: Math.sin(finalAngle) * speed,
        radius,
        damage: Math.round(stats.attackDamage * this.currentMutation.playerDamageMultiplier),
        color,
        bouncesRemaining: stats.bulletBounces + this.currentMutation.bulletBouncesBonus,
        createdAt: Date.now(),
        lifetimeMs: stats.bulletLifetimeMs,
        isExplosive: player.classType === 'MAGO',
        explosionRadius: player.classType === 'MAGO' ? 55 : 0,
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

    // 1. Update Players
    this.updatePlayers(dt, now);

    // 2. Update Enemies & AI
    this.updateEnemies(dt, now);

    // 3. Update Projectiles & Collisions
    this.updateProjectiles(dt, now);

    // 4. Check Room Clearance
    this.checkRoomClearance();

    // 5. Broadcast snapshot
    this.broadcastState();
  }

  private updatePlayers(dt: number, now: number): void {
    const W = config.game.roomWidth;
    const H = config.game.roomHeight;
    const pad = 48;

    Object.values(this.players).forEach(p => {
      if (!p.isAlive) return;

      // End dash
      if (p.isDashing && now >= p.dashEndsAt) {
        p.isDashing = false;
        p.vx *= 0.4;
        p.vy *= 0.4;
      }

      p.x += p.vx * dt;
      p.y += p.vy * dt;

      // Wall boundaries
      const isCleared = this.enemies.length === 0;

      // North door check
      if (p.y < pad) {
        if (isCleared && Math.abs(p.x - W / 2) < 55) {
          this.advanceToNextRoom();
          return;
        }
        p.y = pad;
        p.vy = 0;
      }
      // South door check
      if (p.y > H - pad) {
        p.y = H - pad;
        p.vy = 0;
      }
      // West / East
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

  private updateEnemies(dt: number, now: number): void {
    const alivePlayers = Object.values(this.players).filter(p => p.isAlive);
    if (alivePlayers.length === 0) return;

    this.enemies.forEach(e => {
      // Find closest alive player
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

      // AI Behavior by Type
      if (e.type === 'SLIME') {
        // Slime leaps directly towards player
        e.vx = Math.cos(angleToPlayer) * e.speed;
        e.vy = Math.sin(angleToPlayer) * e.speed;

        // Contact attack
        if (minDist < e.radius + 20 && now - e.lastAttackAt >= e.attackCooldownMs) {
          e.lastAttackAt = now;
          this.damagePlayer(closestPlayer, e.damage);
        }
      } else if (e.type === 'ESQUELETO') {
        // Skeleton keeps range (~240px) and shoots
        if (minDist < 200) {
          e.vx = -Math.cos(angleToPlayer) * e.speed;
          e.vy = -Math.sin(angleToPlayer) * e.speed;
        } else if (minDist > 320) {
          e.vx = Math.cos(angleToPlayer) * e.speed;
          e.vy = Math.sin(angleToPlayer) * e.speed;
        } else {
          e.vx = 0;
          e.vy = 0;
        }

        if (now - e.lastAttackAt >= e.attackCooldownMs) {
          e.lastAttackAt = now;
          this.projectiles.push({
            id: `proj_${this.nextProjectileId++}`,
            ownerId: e.id,
            fromPlayer: false,
            x: e.x + Math.cos(angleToPlayer) * 24,
            y: e.y + Math.sin(angleToPlayer) * 24,
            vx: Math.cos(angleToPlayer) * 320,
            vy: Math.sin(angleToPlayer) * 320,
            radius: 8,
            damage: e.damage,
            color: '#ef4444',
            bouncesRemaining: 0,
            createdAt: now,
            lifetimeMs: 2500,
          });
        }
      } else if (e.type === 'MURCIELAGO') {
        // High speed zig-zag rush
        const zigZag = Math.sin(now / 180) * 0.8;
        e.vx = Math.cos(angleToPlayer + zigZag) * e.speed;
        e.vy = Math.sin(angleToPlayer + zigZag) * e.speed;

        if (minDist < e.radius + 18 && now - e.lastAttackAt >= e.attackCooldownMs) {
          e.lastAttackAt = now;
          this.damagePlayer(closestPlayer, e.damage);
        }
      } else if (e.isBoss) {
        // Boss AI
        const isPhase2 = e.currentHp <= e.maxHp * 0.5;
        if (isPhase2 && e.bossPhase === 1) {
          e.bossPhase = 2;
          this.directorDialogue = {
            speaker: e.name,
            text: '¡PROTOCOLO DE EMERGENCIA ACTIVADO! ¡SOBRECARGA DE RAYOS!',
            mood: 'ANGRY',
            timestamp: now,
          };
        }

        // Slow hover movement towards center
        const centerX = config.game.roomWidth / 2;
        const centerY = 240;
        e.vx = (centerX - e.x) * 0.5;
        e.vy = (centerY - e.y) * 0.5;

        // Attack wave
        if (now - e.lastAttackAt >= (isPhase2 ? 1000 : 1600)) {
          e.lastAttackAt = now;
          const bulletCount = isPhase2 ? 12 : 8;
          for (let i = 0; i < bulletCount; i++) {
            const shotAngle = (i / bulletCount) * Math.PI * 2 + (now / 400);
            this.projectiles.push({
              id: `proj_${this.nextProjectileId++}`,
              ownerId: e.id,
              fromPlayer: false,
              x: e.x + Math.cos(shotAngle) * 45,
              y: e.y + Math.sin(shotAngle) * 45,
              vx: Math.cos(shotAngle) * (isPhase2 ? 280 : 220),
              vy: Math.sin(shotAngle) * (isPhase2 ? 280 : 220),
              radius: 11,
              damage: e.damage,
              color: isPhase2 ? '#fbbf24' : '#f43f5e',
              bouncesRemaining: isPhase2 ? 1 : 0,
              createdAt: now,
              lifetimeMs: 3000,
            });
          }
        }
      }

      e.x += e.vx * dt;
      e.y += e.vy * dt;
    });
  }

  private updateProjectiles(dt: number, now: number): void {
    const W = config.game.roomWidth;
    const H = config.game.roomHeight;
    const pad = 42;

    const remaining: ProjectileEntity[] = [];

    for (const p of this.projectiles) {
      // Check lifetime
      if (now - p.createdAt > p.lifetimeMs) continue;

      p.x += p.vx * dt;
      p.y += p.vy * dt;

      // Wall bounce or destroy
      let bounced = false;
      if (p.x <= pad || p.x >= W - pad) {
        if (p.bouncesRemaining > 0) {
          p.vx = -p.vx;
          p.bouncesRemaining--;
          p.x = Math.max(pad + 1, Math.min(W - pad - 1, p.x));
          bounced = true;
        } else {
          continue;
        }
      }
      if (p.y <= pad || p.y >= H - pad) {
        if (p.bouncesRemaining > 0) {
          p.vy = -p.vy;
          p.bouncesRemaining--;
          p.y = Math.max(pad + 1, Math.min(H - pad - 1, p.y));
          bounced = true;
        } else {
          continue;
        }
      }

      // Check hit Player
      if (!p.fromPlayer) {
        let hit = false;
        for (const pl of Object.values(this.players)) {
          if (!pl.isAlive || pl.isDashing) continue;
          const r = 24 + p.radius;
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

      // Check hit Enemy
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
            this.telemetry.totalDamageDealt += p.damage;

            const owner = this.players[p.ownerId];
            if (owner) {
              owner.damageDealt += p.damage;
            }

            // Enemy death
            if (e.currentHp <= 0) {
              this.enemies.splice(i, 1);
              if (owner) owner.kills++;
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
    player.currentHp = Math.max(0, player.currentHp - damage);

    if (player.currentHp === 0 && player.isAlive) {
      player.isAlive = false;
      this.telemetry.totalPlayerDeaths++;

      // Roast from director
      this.directorDialogue = this.director.getDirectorQuote('playerDown');

      // Check all dead
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
        // Room cleared
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
