import { Server } from 'socket.io';
import { config } from '../config.js';
import {
  AltarEntity,
  BarrelEntity,
  CLASS_CONFIGS,
  DirectorDialogue,
  DoorDirection,
  DoorState,
  EliteModifier,
  EnemyEntity,
  EnemyType,
  GamePhase,
  GameWorldState,
  HazardZone,
  HeartPickup,
  PillarEntity,
  PlayerClass,
  PlayerEntity,
  ProjectileEntity,
  Relic,
  RoomEncounterType,
  RoomMutation,
  RoomState,
  WorldEventFX,
} from '../types.js';
import { DungeonDirector } from '../ai/DungeonDirector.js';

const ELITE_MODIFIERS: EliteModifier[] = ['VAMPIRICO', 'EXPLOSIVO', 'TORMENTA', 'FRENETICO', 'BLINDADO'];
const BOT_NAMES: Record<PlayerClass, string[]> = {
  GUERRERO: ['Sir Bors [IA]', 'Garrick [IA]', 'Valerius [IA]'],
  CAZADOR: ['Sylas [IA]', 'Lyra [IA]', 'Vex [IA]'],
  MAGO: ['Ignis [IA]', 'Malakor [IA]', 'Zara [IA]'],
  PICARO: ['Kaelen [IA]', 'Nyx [IA]', 'Sombra [IA]'],
};

export class DungeonRoom {
  public code: string;
  public phase: GamePhase = 'LOBBY';
  public roomIndex = 1;
  public totalRooms: number;
  public encounterType: RoomEncounterType = 'STANDARD';
  public players: Record<string, PlayerEntity> = {};
  public enemies: EnemyEntity[] = [];
  public projectiles: ProjectileEntity[] = [];
  public hearts: HeartPickup[] = [];
  public pillars: PillarEntity[] = [];
  public barrels: BarrelEntity[] = [];
  public hazards: HazardZone[] = [];
  public recentEvents: WorldEventFX[] = [];
  public currentMutation: RoomMutation;
  public chestRelics: Relic[] = [];
  public chestClaimedBy: string[] = [];
  public altar: AltarEntity | null = null;
  public directorAnger = 0;

  private io: Server;
  private director: DungeonDirector;
  private tickInterval: NodeJS.Timeout | null = null;
  private lastTickAt = Date.now();
  private lastDoTTickAt = Date.now();
  private nextEnemyId = 1;
  private nextProjectileId = 1;
  private nextHeartId = 1;
  private nextEventId = 1;
  private roomClearAnnounced = false;
  private interventionTriggeredInRoom = false;
  private isTransitioningRoom = false;
  private lastClientSyncAt: Record<string, number> = {};

  public telemetry = {
    totalDamageDealt: 0,
    rangedAttacksCount: 0,
    meleeAttacksCount: 0,
    skillsUsedCount: 0,
    synergiesCount: 0,
    totalPlayerDeaths: 0,
    totalGoldCollected: 0,
  };

  public directorDialogue: DirectorDialogue = {
    speaker: 'Director del Calabozo',
    text: 'Bienvenidos a las pruebas de selección. La supervivencia no está cubierta por el seguro.',
    mood: 'MOCKING',
    timestamp: Date.now(),
  };

  constructor(code: string, io: Server, director: DungeonDirector) {
    this.code = code;
    this.io = io;
    this.director = director;
    this.totalRooms = config.game.totalRoomsToBoss;

    this.currentMutation = {
      title: 'Vestíbulo de los Ingenuos',
      description: 'Habitación de iniciación con pilares góticos y barriles volátiles.',
      directorRoast: 'Si no pasan esta sala, mejor dedíquense a la contabilidad.',
      frictionMultiplier: 1.0,
      bulletBouncesBonus: 0,
      enemySpeedMultiplier: 1.0,
      playerDamageMultiplier: 1.0,
      lowVisibility: false,
      visibilityRadius: 900,
      hazardType: 'NONE',
    };

    this.director.prefetchNextRoom(1, this.totalRooms);
    this.director.prefetchNextRoom(2, this.totalRooms);
  }

  public addPlayer(
    socketId: string,
    name: string,
    classType: PlayerClass,
    avatarIndex: number,
    isBot = false
  ): PlayerEntity {
    const humanPlayers = Object.values(this.players).filter(p => !p.isBot);
    const isHost = !isBot && humanPlayers.length === 0;
    const stats = CLASS_CONFIGS[classType] || CLASS_CONFIGS.CAZADOR;

    const player: PlayerEntity = {
      id: socketId,
      name: (name || 'Aventurero').trim().slice(0, 16),
      classType,
      avatarIndex,
      isHost,
      isBot,
      x: config.game.roomWidth / 2 + (Object.keys(this.players).length * 48 - 72),
      y: config.game.roomHeight - 130,
      vx: 0,
      vy: 0,
      angle: -Math.PI / 2,
      currentHp: stats.maxHp,
      maxHp: stats.maxHp,
      shieldHp: 0,
      isAlive: true,
      isDashing: false,
      dashCooldownEndsAt: 0,
      dashEndsAt: 0,
      skillCooldownEndsAt: 0,
      skillActiveUntil: 0,
      stealthedUntil: 0,
      lastAttackAt: 0,
      invulnerableUntil: 0,
      relics: [],
      kills: 0,
      damageDealt: 0,
      gold: 25,
      weaponLevel: 1,
      combo: 0,
      maxCombo: 0,
      comboExpiresAt: 0,
      reviveProgress: 0,
      revivesCount: 0,
      synergiesTriggered: 0,
    };

    this.players[socketId] = player;
    return player;
  }

  public addBotCompanion(classType?: PlayerClass): PlayerEntity | null {
    if (Object.keys(this.players).length >= config.game.maxPlayers) return null;
    const classes: PlayerClass[] = ['GUERRERO', 'CAZADOR', 'MAGO', 'PICARO'];
    const chosenClass = classType || classes[Object.keys(this.players).length % classes.length];
    const names = BOT_NAMES[chosenClass];
    const botName = names[Math.floor(Math.random() * names.length)];
    const botId = `bot_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    return this.addPlayer(botId, botName, chosenClass, 0, true);
  }

  public removeBots(): void {
    for (const id of Object.keys(this.players)) {
      if (this.players[id]?.isBot) {
        delete this.players[id];
      }
    }
  }

  public changePlayerClass(socketId: string, classType: PlayerClass): void {
    const p = this.players[socketId];
    if (!p || this.phase !== 'LOBBY') return;
    if (!CLASS_CONFIGS[classType]) return;
    p.classType = classType;
    p.maxHp = CLASS_CONFIGS[classType].maxHp;
    p.currentHp = p.maxHp;
  }

  public removePlayer(socketId: string): void {
    const wasHost = this.players[socketId]?.isHost;
    delete this.players[socketId];

    const remainingHumans = Object.values(this.players).filter(p => !p.isBot);
    if (wasHost && remainingHumans.length > 0) {
      remainingHumans[0].isHost = true;
    }

    if (remainingHumans.length === 0) {
      this.stopLoop();
      // Clean up bots if no humans remain
      this.players = {};
    }
  }

  private emitFX(fx: Omit<WorldEventFX, 'id' | 'timestamp'>): void {
    this.recentEvents.push({
      ...fx,
      id: `fx_${this.nextEventId++}`,
      timestamp: Date.now(),
    });
    if (this.recentEvents.length > 28) {
      this.recentEvents.splice(0, this.recentEvents.length - 28);
    }
  }

  public handlePlayerPing(socketId: string, x: number, y: number, kind?: string): void {
    const p = this.players[socketId];
    if (!p) return;
    this.emitFX({
      type: 'PING',
      x: Math.max(60, Math.min(config.game.roomWidth - 60, x)),
      y: Math.max(60, Math.min(config.game.roomHeight - 60, y)),
      text: kind || `📍 ${p.name}`,
      color: '#f59e0b',
    });
  }

  public async startGame(): Promise<void> {
    if (this.phase !== 'LOBBY' && this.phase !== 'VICTORY' && this.phase !== 'GAME_OVER') return;

    this.phase = 'PLAYING';
    this.roomIndex = 1;
    this.totalRooms = config.game.totalRoomsToBoss;
    this.directorAnger = 0;
    this.telemetry = {
      totalDamageDealt: 0,
      rangedAttacksCount: 0,
      meleeAttacksCount: 0,
      skillsUsedCount: 0,
      synergiesCount: 0,
      totalPlayerDeaths: 0,
      totalGoldCollected: 0,
    };

    Object.values(this.players).forEach((p, idx) => {
      const stats = CLASS_CONFIGS[p.classType];
      p.currentHp = stats.maxHp;
      p.maxHp = stats.maxHp;
      p.shieldHp = 0;
      p.isAlive = true;
      p.isDashing = false;
      p.invulnerableUntil = 0;
      p.skillCooldownEndsAt = 0;
      p.skillActiveUntil = 0;
      p.stealthedUntil = 0;
      p.relics = [];
      p.kills = 0;
      p.damageDealt = 0;
      p.gold = 30;
      p.weaponLevel = 1;
      p.combo = 0;
      p.maxCombo = 0;
      p.reviveProgress = 0;
      p.revivesCount = 0;
      p.synergiesTriggered = 0;
      p.title = undefined;
      p.x = config.game.roomWidth / 2 + (idx * 45 - 65);
      p.y = config.game.roomHeight - 130;
      p.vx = 0;
      p.vy = 0;
    });

    await this.setupRoom(1, 'STANDARD');
    this.startLoop();
  }

  /**
   * Allows players who defeated the Boss to continue into Endless Ascension Mode!
   */
  public async continueEndlessMode(): Promise<void> {
    if (this.phase !== 'VICTORY') return;
    this.totalRooms += 3; // Next Boss in 3 chambers
    this.phase = 'PLAYING';
    await this.setupRoom(this.roomIndex + 1, 'ELITE');
    this.startLoop();
  }

  private async setupRoom(index: number, encounterType: RoomEncounterType = 'STANDARD'): Promise<void> {
    if (this.isTransitioningRoom) return;
    this.isTransitioningRoom = true;

    try {
      this.roomIndex = index;
      const isBoss = index === this.totalRooms || (index > this.totalRooms && index % 3 === 0);
      this.encounterType = isBoss ? 'BOSS' : encounterType;
      this.projectiles = [];
      this.hearts = [];
      this.recentEvents = [];
      this.chestClaimedBy = [];
      this.roomClearAnnounced = false;
      this.interventionTriggeredInRoom = false;
      this.lastClientSyncAt = {};

      const W = config.game.roomWidth;
      const H = config.game.roomHeight;

      // Immediately move players away from doors before any async work!
      Object.values(this.players).forEach((p, idx) => {
        p.x = W / 2 + (idx * 44 - 66);
        p.y = H - 125;
        p.vx = 0;
        p.vy = 0;
      });

      const roomData = await this.director.getRoomData(index, this.totalRooms);
      this.currentMutation = {
        ...roomData.mutation,
        encounterType: this.encounterType,
      };
      this.chestRelics = roomData.relics;

    // 1. Setup Physical Gothic Stone Pillars (match Renderer positions)
    this.pillars = isBoss
      ? [
          { id: 'pil_1', x: W * 0.2, y: H * 0.32, radius: 24 },
          { id: 'pil_2', x: W * 0.8, y: H * 0.32, radius: 24 },
          { id: 'pil_3', x: W * 0.2, y: H * 0.72, radius: 24 },
          { id: 'pil_4', x: W * 0.8, y: H * 0.72, radius: 24 },
        ]
      : [
          { id: 'pil_1', x: W * 0.22, y: H * 0.28, radius: 25 },
          { id: 'pil_2', x: W * 0.78, y: H * 0.28, radius: 25 },
          { id: 'pil_3', x: W * 0.22, y: H * 0.72, radius: 25 },
          { id: 'pil_4', x: W * 0.78, y: H * 0.72, radius: 25 },
        ];

    // 2. Setup Interactive Barrels (Explosive, Frost, Toxic)
    this.barrels = [];
    const barrelTypes: Array<'EXPLOSIVE' | 'FROST' | 'TOXIC'> = ['EXPLOSIVE', 'FROST', 'TOXIC'];
    const barrelPositions = [
      { x: W * 0.34, y: H * 0.45 },
      { x: W * 0.66, y: H * 0.45 },
      { x: W * 0.5, y: H * 0.26 },
    ];
    barrelPositions.forEach((pos, idx) => {
      if (idx < 2 || Math.random() < 0.75) {
        this.barrels.push({
          id: `barrel_${index}_${idx}`,
          x: pos.x + (Math.random() * 40 - 20),
          y: pos.y + (Math.random() * 30 - 15),
          radius: 18,
          type: barrelTypes[(index + idx) % barrelTypes.length],
        });
      }
    });

    // 3. Setup Environmental Hazards based on Mutation
    this.hazards = [];
    const now = Date.now();
    const hazType = this.currentMutation.hazardType;
    if (hazType === 'LAVA_PITS') {
      this.hazards.push(
        { id: 'haz_1', type: 'LAVA', x: W * 0.36, y: H * 0.36, radius: 52, active: true, createdAt: now, durationMs: 999999, damage: 12 },
        { id: 'haz_2', type: 'LAVA', x: W * 0.64, y: H * 0.36, radius: 52, active: true, createdAt: now, durationMs: 999999, damage: 12 },
        { id: 'haz_3', type: 'LAVA', x: W * 0.5, y: H * 0.6, radius: 46, active: true, createdAt: now, durationMs: 999999, damage: 12 }
      );
    } else if (hazType === 'POISON_SPORES') {
      this.hazards.push(
        { id: 'haz_1', type: 'POISON_CLOUD', x: W * 0.35, y: H * 0.5, radius: 58, active: true, createdAt: now, durationMs: 999999, damage: 9 },
        { id: 'haz_2', type: 'POISON_CLOUD', x: W * 0.65, y: H * 0.5, radius: 58, active: true, createdAt: now, durationMs: 999999, damage: 9 }
      );
    } else if (hazType === 'SPIKE_TRAPS') {
      this.hazards.push(
        { id: 'spike_1', type: 'SPIKE_TRAP', x: W * 0.38, y: H * 0.38, radius: 36, active: false, createdAt: now, durationMs: 999999, damage: 18 },
        { id: 'spike_2', type: 'SPIKE_TRAP', x: W * 0.62, y: H * 0.38, radius: 36, active: false, createdAt: now, durationMs: 999999, damage: 18 },
        { id: 'spike_3', type: 'SPIKE_TRAP', x: W * 0.38, y: H * 0.62, radius: 36, active: false, createdAt: now, durationMs: 999999, damage: 18 },
        { id: 'spike_4', type: 'SPIKE_TRAP', x: W * 0.62, y: H * 0.62, radius: 36, active: false, createdAt: now, durationMs: 999999, damage: 18 }
      );
    }

    // 4. Setup Altar of Pacts & Armory
    const discount = this.encounterType === 'SANCTUARY' ? 0.65 : 1.0;
    this.altar = {
      x: W * 0.28,
      y: H * 0.52,
      pact: roomData.pact,
      weaponUpgradeCost: Math.round((35 + index * 15) * discount),
      healCost: Math.round(25 * discount),
      shieldCost: Math.round(30 * discount),
    };

    // 5. Reposition & Heal Players (Sanctuary gives +60% heal, normal gives +35%)
    const healRatio = this.encounterType === 'SANCTUARY' ? 0.6 : 0.35;
    Object.values(this.players).forEach((p, idx) => {
      p.x = W / 2 + (idx * 44 - 66);
      p.y = H - 125;
      p.vx = 0;
      p.vy = 0;
      p.isAlive = true;
      p.reviveProgress = 0;
      p.invulnerableUntil = Date.now() + 1200;
      p.currentHp = Math.min(p.maxHp, p.currentHp + Math.floor(p.maxHp * healRatio));
      if (this.encounterType === 'SANCTUARY') {
        p.shieldHp = Math.max(p.shieldHp, 30);
      }
    });

    this.directorDialogue = {
      speaker: 'Director del Calabozo',
      text:
        this.encounterType === 'ELITE'
          ? `¡CÁMARA ÉLITE MALDITA! ${this.currentMutation.directorRoast}`
          : this.encounterType === 'SANCTUARY'
          ? 'Un Santuario del Pacto... disfruten su breve respiro y gasten su oro antes de morir.'
          : this.currentMutation.directorRoast,
      mood: this.encounterType === 'ELITE' ? 'ANGRY' : 'MOCKING',
      timestamp: Date.now(),
    };

      if (isBoss) {
        await this.spawnBoss();
      } else {
        this.spawnEnemiesForRoom(index, this.encounterType);
      }

      this.director.prefetchNextRoom(index + 1, this.totalRooms);
      this.broadcastState(false);
    } finally {
      this.isTransitioningRoom = false;
    }
  }

  private spawnEnemiesForRoom(index: number, encounterType: RoomEncounterType): void {
    this.enemies = [];
    const playerCount = Math.max(1, Object.keys(this.players).length);
    const coopHpScale = 1 + (playerCount - 1) * 0.25;
    const eliteRoomMult = encounterType === 'ELITE' ? 1.3 : 1.0;

    let types: EnemyType[] = [];
    if (encounterType === 'SANCTUARY') {
      types = ['SLIME', 'ESQUELETO', 'GOLEM'];
    } else if (index === 1) {
      types = ['SLIME', 'SLIME', 'MURCIELAGO'];
    } else if (index === 2) {
      types = ['SLIME', 'ESQUELETO', 'ESQUELETO', 'MURCIELAGO'];
    } else if (index === 3) {
      types = ['GOLEM', 'MURCIELAGO', 'MURCIELAGO', 'SLIME', 'ESQUELETO'];
    } else if (index === 4) {
      types = ['NIGROMANTE', 'ESQUELETO', 'ESQUELETO', 'GOLEM', 'MURCIELAGO'];
    } else {
      types = ['NIGROMANTE', 'GOLEM', 'ESQUELETO', 'ESQUELETO', 'SLIME', 'MURCIELAGO', 'MURCIELAGO'];
    }

    types.forEach((type, idx) => {
      const isElite = encounterType === 'ELITE' && (idx === 0 || idx === 1) ? true : index >= 3 && idx === 0 && Math.random() < 0.45;
      this.createEnemy(type, index, coopHpScale * eliteRoomMult, isElite);
    });
  }

  private createEnemy(
    type: EnemyType,
    roomIdx: number,
    hpScale = 1.0,
    isElite = false,
    customX?: number,
    customY?: number
  ): EnemyEntity {
    const enemyId = `enemy_${this.nextEnemyId++}`;
    const speedMult = this.currentMutation.enemySpeedMultiplier * (isElite ? 1.15 : 1.0);
    const eliteHpMult = isElite ? 2.0 : 1.0;
    const eliteMod = isElite ? ELITE_MODIFIERS[Math.floor(Math.random() * ELITE_MODIFIERS.length)] : undefined;

    const x = customX ?? 160 + Math.random() * (config.game.roomWidth - 320);
    const y = customY ?? 130 + Math.random() * (config.game.roomHeight * 0.42);

    let baseHp = 42 + roomIdx * 11;
    let radius = 22;
    let speed = 100 * speedMult;
    let damage = 14 + Math.floor(roomIdx * 1.5);
    let color = '#15803d';
    let name = 'Slime Mutante';
    let cooldown = 1400;

    if (type === 'MINI_SLIME') {
      baseHp = 22 + roomIdx * 5;
      radius = 13;
      speed = 135 * speedMult;
      damage = 9;
      color = '#22c55e';
      name = 'Mini-Slime Ácido';
      cooldown = 1000;
    } else if (type === 'ESQUELETO') {
      baseHp = 35 + roomIdx * 9;
      radius = 18;
      speed = 78 * speedMult;
      damage = 13 + Math.floor(roomIdx * 1.5);
      color = '#e2e8f0';
      name = 'Esqueleto Francotirador';
      cooldown = 2100;
    } else if (type === 'MURCIELAGO') {
      baseHp = 26 + roomIdx * 7;
      radius = 15;
      speed = 142 * speedMult;
      damage = 14 + roomIdx;
      color = '#991b1b';
      name = 'Murciélago Vampiro';
      cooldown = 1500;
    } else if (type === 'GOLEM') {
      baseHp = 95 + roomIdx * 22;
      radius = 30;
      speed = 62 * speedMult;
      damage = 22 + roomIdx * 2;
      color = '#57534e';
      name = 'Gólem de Hierro Sísmico';
      cooldown = 2600;
    } else if (type === 'NIGROMANTE') {
      baseHp = 52 + roomIdx * 14;
      radius = 20;
      speed = 85 * speedMult;
      damage = 18 + roomIdx * 2;
      color = '#6b21a8';
      name = 'Cultista Abisal';
      cooldown = 2800;
    }

    if (isElite && eliteMod) {
      name = `★ ${name} [${eliteMod}]`;
      radius = Math.round(radius * 1.25);
      damage = Math.round(damage * 1.25);
    }

    const finalHp = Math.round(baseHp * hpScale * eliteHpMult);
    const enemy: EnemyEntity = {
      id: enemyId,
      type,
      name,
      x,
      y,
      vx: 0,
      vy: 0,
      radius,
      currentHp: finalHp,
      maxHp: finalHp,
      speed,
      damage,
      color,
      lastAttackAt: Date.now() - Math.random() * 800,
      attackCooldownMs: cooldown,
      stateTimer: Math.random() * 900,
      aiState: 'IDLE',
      aimAngle: 0,
      isElite,
      eliteModifier: eliteMod,
    };

    this.enemies.push(enemy);
    return enemy;
  }

  private async spawnBoss(): Promise<void> {
    this.enemies = [];
    const bossData = await this.director.getBossAdaptation(this.telemetry);
    const playerCount = Math.max(1, Object.keys(this.players).length);
    const scale = (1 + (playerCount - 1) * 0.3) * (1 + Math.max(0, this.roomIndex - 6) * 0.25);

    this.directorDialogue = {
      speaker: bossData.bossName,
      text: bossData.introQuote,
      mood: 'ANGRY',
      timestamp: Date.now(),
    };

    const bossHp = Math.round(1150 * scale);
    this.enemies.push({
      id: `boss_director_${this.roomIndex}`,
      type: 'BOSS_DIRECTOR',
      name: bossData.bossName,
      x: config.game.roomWidth / 2,
      y: 220,
      vx: 0,
      vy: 0,
      radius: 52,
      currentHp: bossHp,
      maxHp: bossHp,
      speed: 92 * this.currentMutation.enemySpeedMultiplier,
      damage: 24,
      color: '#b91c1c',
      lastAttackAt: Date.now(),
      attackCooldownMs: 1500,
      stateTimer: 0,
      isBoss: true,
      bossPhase: 1,
      bossPattern: 'SPIRAL',
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
      isUsingSkill?: boolean;
      x?: number;
      y?: number;
      vx?: number;
      vy?: number;
      roomIndex?: number;
    }
  ): void {
    const player = this.players[socketId];
    if (!player || !player.isAlive || this.phase !== 'PLAYING') return;

    player.angle = input.angle;
    const now = Date.now();
    const stats = this.getPlayerEffectiveStats(player);

    // Accept client-predicted position when valid & in same room for zero-rubberband movement
    if (
      !player.isBot &&
      input.roomIndex === this.roomIndex &&
      typeof input.x === 'number' &&
      typeof input.y === 'number'
    ) {
      const dist = Math.hypot(input.x - player.x, input.y - player.y);
      if (dist < 340) {
        const W = config.game.roomWidth;
        const H = config.game.roomHeight;
        player.x = Math.max(32, Math.min(W - 32, input.x));
        player.y = Math.max(32, Math.min(H - 32, input.y));
        if (typeof input.vx === 'number' && typeof input.vy === 'number' && !player.isDashing) {
          player.vx = input.vx;
          player.vy = input.vy;
        }
        this.lastClientSyncAt[socketId] = now;
      }
    }

    // 1. Handle Dash with 100% i-frames
    if (input.isDashing && now >= player.dashCooldownEndsAt && !player.isDashing) {
      player.isDashing = true;
      player.dashEndsAt = now + stats.dashDurationMs;
      player.dashCooldownEndsAt = now + stats.dashCooldownMs;
      player.invulnerableUntil = Math.max(player.invulnerableUntil, now + stats.dashDurationMs + 60);

      const len = Math.hypot(input.moveX, input.moveY);
      const dirX = len > 0.1 ? input.moveX / len : Math.cos(player.angle);
      const dirY = len > 0.1 ? input.moveY / len : Math.sin(player.angle);

      player.vx = dirX * stats.dashSpeed;
      player.vy = dirY * stats.dashSpeed;
    } else if (!player.isDashing && (player.isBot || !this.lastClientSyncAt[socketId] || now - this.lastClientSyncAt[socketId] > 90)) {
      const frenzyBonus = player.combo >= 15 ? 1.15 : player.combo >= 8 ? 1.08 : 1.0;
      const stealthBonus = now < player.stealthedUntil ? 1.25 : 1.0;
      const targetSpeed = stats.moveSpeed * frenzyBonus * stealthBonus;
      const len = Math.hypot(input.moveX, input.moveY);
      const normX = len > 0 ? (input.moveX / len) * targetSpeed : 0;
      const normY = len > 0 ? (input.moveY / len) * targetSpeed : 0;

      const isIce = this.currentMutation.frictionMultiplier < 0.3;
      if (isIce) {
        const accel = len > 0 ? 0.72 : 0.07;
        player.vx += (normX - player.vx) * accel;
        player.vy += (normY - player.vy) * accel;
      } else {
        player.vx += (normX - player.vx) * 0.85;
        player.vy += (normY - player.vy) * 0.85;
      }
    }

    // 2. Handle Active Class Skill (Right-Click / E / Q)
    if (input.isUsingSkill && now >= player.skillCooldownEndsAt) {
      player.skillCooldownEndsAt = now + stats.skillCooldownMs;
      this.telemetry.skillsUsedCount++;
      this.activateClassSkill(player, stats, now);
    }

    // 3. Handle Primary Attack
    if (input.isAttacking && now - player.lastAttackAt >= stats.attackCooldownMs) {
      player.lastAttackAt = now;
      this.firePlayerAttack(player, stats, now);
    }
  }

  /**
   * Executes the player's signature Class Active Skill!
   */
  private activateClassSkill(
    player: PlayerEntity,
    stats: ReturnType<typeof this.getPlayerEffectiveStats>,
    now: number
  ): void {
    const W = config.game.roomWidth;
    const H = config.game.roomHeight;

    if (player.classType === 'GUERRERO') {
      // BALUARTE SÍSMICO: Shockwave stun + Reflective Shield + +30 Shield HP
      player.skillActiveUntil = now + 2200;
      player.shieldHp = Math.min(100, player.shieldHp + 30);

      this.emitFX({
        type: 'SHOCKWAVE',
        x: player.x,
        y: player.y,
        radius: 170,
        color: '#f59e0b',
        text: '🛡️ ¡BALUARTE SÍSMICO!',
      });

      const shockDamage = Math.round(stats.attackDamage * 1.45);
      for (let i = this.enemies.length - 1; i >= 0; i--) {
        const e = this.enemies[i];
        const dist = Math.hypot(e.x - player.x, e.y - player.y);
        if (dist <= 170 + e.radius) {
          const pushAngle = Math.atan2(e.y - player.y, e.x - player.x);
          e.vx += Math.cos(pushAngle) * 320;
          e.vy += Math.sin(pushAngle) * 320;
          e.stunUntil = now + 1600;
          this.applyDamageToEnemy(e, i, shockDamage, player, true, 'LIGHTNING', now);
        }
      }
    } else if (player.classType === 'CAZADOR') {
      // SALVA PERFORANTE & TRAMPA EXPLOSIVA
      const fanCount = 5;
      const fanSpread = 0.65;
      for (let i = 0; i < fanCount; i++) {
        const a = player.angle + (i - 2) * (fanSpread / 4);
        this.projectiles.push({
          id: `proj_${this.nextProjectileId++}`,
          ownerId: player.id,
          fromPlayer: true,
          x: player.x + Math.cos(a) * 28,
          y: player.y + Math.sin(a) * 28,
          vx: Math.cos(a) * 860,
          vy: Math.sin(a) * 860,
          radius: 8,
          damage: Math.round(stats.attackDamage * 1.35),
          color: '#38bdf8',
          bouncesRemaining: stats.bulletBounces + 1,
          piercesRemaining: 2,
          createdAt: now,
          lifetimeMs: 1400,
          isCrit: true,
          element: 'ICE',
        });
      }

      this.hazards.push({
        id: `trap_${this.nextEventId++}`,
        type: 'BEAR_TRAP',
        x: player.x,
        y: player.y,
        radius: 42,
        active: true,
        createdAt: now,
        durationMs: 10000,
        damage: Math.round(stats.attackDamage * 2.2),
        ownerId: player.id,
      });

      this.emitFX({
        type: 'CRIT',
        x: player.x,
        y: player.y - 24,
        text: '🏹 ¡SALVA + TRAMPA!',
        color: '#38bdf8',
      });
    } else if (player.classType === 'MAGO') {
      // SINGULARIDAD ARCANA: Gravitational Black Hole Vortex
      const targetX = Math.max(90, Math.min(W - 90, player.x + Math.cos(player.angle) * 210));
      const targetY = Math.max(90, Math.min(H - 90, player.y + Math.sin(player.angle) * 210));

      this.hazards.push({
        id: `vortex_${this.nextEventId++}`,
        type: 'ARCANE_VORTEX',
        x: targetX,
        y: targetY,
        radius: 145,
        active: true,
        createdAt: now,
        durationMs: 2600,
        damage: Math.round(stats.attackDamage * 0.45),
        ownerId: player.id,
      });

      this.emitFX({
        type: 'FROST_NOVA',
        x: targetX,
        y: targetY,
        radius: 145,
        text: '🌀 ¡SINGULARIDAD ARCANA!',
        color: '#a855f7',
      });
    } else if (player.classType === 'PICARO') {
      // PASO SOMBRÍO & SEÑUELO EXPLOSIVO
      this.hazards.push({
        id: `decoy_${this.nextEventId++}`,
        type: 'DECOY_BOMB',
        x: player.x,
        y: player.y,
        radius: 115,
        active: true,
        createdAt: now,
        durationMs: 1500,
        damage: Math.round(stats.attackDamage * 2.6),
        ownerId: player.id,
      });

      // Blink forward & enter stealth
      player.x = Math.max(60, Math.min(W - 60, player.x + Math.cos(player.angle) * 145));
      player.y = Math.max(60, Math.min(H - 60, player.y + Math.sin(player.angle) * 145));
      player.stealthedUntil = now + 2600;
      player.invulnerableUntil = Math.max(player.invulnerableUntil, now + 600);

      this.emitFX({
        type: 'TOXIC_BLAST',
        x: player.x,
        y: player.y,
        radius: 60,
        text: '🗡️ ¡PASO SOMBRÍO!',
        color: '#10b981',
      });
    }
  }

  private firePlayerAttack(
    player: PlayerEntity,
    stats: ReturnType<typeof this.getPlayerEffectiveStats>,
    now: number
  ): void {
    const isMelee = player.classType === 'GUERRERO' || player.classType === 'PICARO';
    if (isMelee) {
      this.telemetry.meleeAttacksCount++;
    } else {
      this.telemetry.rangedAttacksCount++;
    }

    const isStealthAmbush = now < player.stealthedUntil;
    if (isStealthAmbush) {
      player.stealthedUntil = 0; // Ambush breaks stealth with guaranteed lethal critical!
    }

    const bulletCount = stats.bulletCount;
    const spread = stats.bulletSpreadRad;
    const baseAngle = player.angle;

    for (let i = 0; i < bulletCount; i++) {
      const angleOffset =
        bulletCount === 1 ? 0 : (i - (bulletCount - 1) / 2) * (spread / (bulletCount - 1 || 1));
      const finalAngle = baseAngle + angleOffset;

      const isCrit = isStealthAmbush || Math.random() < stats.critChance;
      const critMult = isStealthAmbush ? 2.4 : isCrit ? 1.75 : 1.0;

      const speed = stats.bulletSpeed;
      const radius =
        player.classType === 'GUERRERO'
          ? 26
          : player.classType === 'MAGO'
          ? 14
          : player.classType === 'PICARO'
          ? 10
          : 7;
      const color =
        player.classType === 'GUERRERO'
          ? '#f59e0b'
          : player.classType === 'MAGO'
          ? '#ea580c'
          : player.classType === 'PICARO'
          ? '#10b981'
          : '#0284c7';

      let element: ProjectileEntity['element'] =
        player.classType === 'MAGO'
          ? 'FIRE'
          : player.classType === 'PICARO'
          ? 'POISON'
          : 'NONE';

      if (stats.burnOnHit) element = 'FIRE';
      else if (stats.freezeOnHit) element = 'ICE';
      else if (stats.poisonOnHit) element = 'POISON';

      // Warrior cleave destroys nearby enemy bullets right in front of him!
      if (player.classType === 'GUERRERO') {
        for (let j = this.projectiles.length - 1; j >= 0; j--) {
          const ep = this.projectiles[j];
          if (!ep.fromPlayer && Math.hypot(ep.x - player.x, ep.y - player.y) < 62) {
            this.projectiles.splice(j, 1);
          }
        }
      }

      this.projectiles.push({
        id: `proj_${this.nextProjectileId++}`,
        ownerId: player.id,
        fromPlayer: true,
        x: player.x + Math.cos(finalAngle) * 28,
        y: player.y + Math.sin(finalAngle) * 28,
        vx: Math.cos(finalAngle) * speed,
        vy: Math.sin(finalAngle) * speed,
        radius,
        damage: Math.round(stats.attackDamage * this.currentMutation.playerDamageMultiplier * critMult),
        color,
        bouncesRemaining: stats.bulletBounces + this.currentMutation.bulletBouncesBonus,
        piercesRemaining: player.classType === 'PICARO' ? 1 : 0,
        createdAt: now,
        lifetimeMs: stats.bulletLifetimeMs,
        isExplosive: player.classType === 'MAGO',
        explosionRadius: player.classType === 'MAGO' ? 75 : 0,
        isCrit,
        element,
        chainLightning: stats.chainLightning,
      });
    }
  }

  public handleRelicChoice(socketId: string, relicId: string): void {
    const player = this.players[socketId];
    if (!player || this.chestClaimedBy.includes(socketId)) return;

    const relic = this.chestRelics.find(r => r.id === relicId);
    if (relic) {
      player.relics.push(relic);
      this.chestClaimedBy.push(socketId);
      if (relic.modifiers.maxHpBonus) {
        player.maxHp += relic.modifiers.maxHpBonus;
        player.currentHp = Math.min(player.maxHp, player.currentHp + relic.modifiers.maxHpBonus);
      }
      this.emitFX({
        type: 'CRIT',
        x: player.x,
        y: player.y - 25,
        text: `${relic.icon} ${relic.name}`,
        color: '#f59e0b',
      });
      this.broadcastState();
    }
  }

  /**
   * Handles Altar of Pacts & Armory purchases (Upgrade Weapon, Buy Shield/Heal, or Sign AI Pact).
   */
  public handleAltarInteract(
    socketId: string,
    action: 'UPGRADE_WEAPON' | 'BUY_HEAL' | 'BUY_SHIELD' | 'ACCEPT_PACT'
  ): void {
    const player = this.players[socketId];
    if (!player || !player.isAlive || !this.altar) return;

    if (action === 'UPGRADE_WEAPON') {
      if (player.gold < this.altar.weaponUpgradeCost) return;
      player.gold -= this.altar.weaponUpgradeCost;
      player.weaponLevel += 1;
      this.altar.weaponUpgradeCost = Math.round(this.altar.weaponUpgradeCost * 1.35);
      this.emitFX({
        type: 'CRIT',
        x: player.x,
        y: player.y - 28,
        text: `⚒️ ARMA NIVEL ${player.weaponLevel}!`,
        color: '#facc15',
      });
    } else if (action === 'BUY_HEAL') {
      if (player.gold < this.altar.healCost || player.currentHp >= player.maxHp) return;
      player.gold -= this.altar.healCost;
      player.currentHp = Math.min(player.maxHp, player.currentHp + 65);
      this.emitFX({
        type: 'REVIVE',
        x: player.x,
        y: player.y - 24,
        text: '+65 HP',
        color: '#22c55e',
      });
    } else if (action === 'BUY_SHIELD') {
      if (player.gold < this.altar.shieldCost || player.shieldHp >= 100) return;
      player.gold -= this.altar.shieldCost;
      player.shieldHp = Math.min(100, player.shieldHp + 50);
      this.emitFX({
        type: 'SHOCKWAVE',
        x: player.x,
        y: player.y,
        radius: 50,
        text: '🛡️ +50 ESCUDO',
        color: '#38bdf8',
      });
    } else if (action === 'ACCEPT_PACT') {
      const pact = this.altar.pact;
      if (pact.used) return;
      pact.used = true;

      if (pact.type === 'BLOOD_FOR_POWER') {
        player.currentHp = Math.max(15, Math.floor(player.currentHp * 0.75));
        player.relics.push({
          id: `pact_rel_${Date.now()}`,
          name: 'Sello de Sangre del Director',
          lore: 'Pacto firmado en el Altar del Abismo.',
          icon: '🩸',
          rarity: 'CURSED',
          buffDescription: '+35% Daño y Rayos en Cadena.',
          modifiers: { damageMultiplier: 1.35, chainLightning: true },
        });
      } else if (pact.type === 'ELITE_AMBUSH') {
        // Spawn an Elite Champion right now; everyone gets +100 Gold & Weapon Level!
        this.createEnemy('GOLEM', this.roomIndex + 1, 1.2, true, config.game.roomWidth / 2, 220);
        Object.values(this.players).forEach(p => {
          p.gold += 100;
          p.weaponLevel += 1;
        });
      } else if (pact.type === 'CURSED_ROULETTE') {
        player.gold = Math.max(0, player.gold - 25);
        player.weaponLevel += 2;
        player.shieldHp = 75;
      } else {
        player.maxHp = Math.max(50, player.maxHp - 15);
        player.currentHp = Math.min(player.maxHp, player.currentHp);
        player.relics.push({
          id: `pact_vamp_${Date.now()}`,
          name: 'Sed Eterna del Tribunal',
          lore: 'Absorbe la vida de tus enemigos.',
          icon: '🧛',
          rarity: 'LEGENDARY',
          buffDescription: 'Robo de vida y +25% Crítico.',
          modifiers: { lifestealPct: 0.2, critChanceBonus: 0.25 },
        });
      }

      this.directorDialogue = {
        speaker: 'Director del Calabozo',
        text: `¡${player.name} ha firmado el "${pact.title}"! No se aceptan devoluciones.`,
        mood: 'CHAOTIC',
        timestamp: Date.now(),
      };

      this.emitFX({
        type: 'DIRECTOR_INTERVENTION',
        x: this.altar.x,
        y: this.altar.y,
        radius: 140,
        text: `⚖️ ¡${pact.title.toUpperCase()}!`,
        color: '#a855f7',
      });
    }

    this.broadcastState();
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

    if (this.phase !== 'PLAYING' || this.isTransitioningRoom) return;

    const prevPhase = this.phase;
    const prevCleared = this.roomClearAnnounced;

    this.updateAIHerbBots(dt, now);
    this.updateHazards(dt, now);
    this.updatePlayers(dt, now);
    this.updateEnemies(dt, now);
    this.updateProjectiles(dt, now);
    this.checkLiveDirectorIntervention(now);
    this.checkRoomClearance();

    // Keep recent FX events for 220ms (~4-5 ticks) so packets stay tiny
    this.recentEvents = this.recentEvents.filter(ev => now - ev.timestamp < 220);

    const hasImportantChange =
      this.phase !== prevPhase ||
      this.roomClearAnnounced !== prevCleared;

    this.broadcastState(!hasImportantChange);
  }

  /**
   * Autonomous AI Companion Heroes (fight, dodge, revive fallen humans, use skills, loot).
   */
  private updateAIHerbBots(dt: number, now: number): void {
    const bots = Object.values(this.players).filter(p => p.isBot && p.isAlive);
    if (bots.length === 0) return;

    const fallenAllies = Object.values(this.players).filter(p => !p.isAlive);
    const aliveHumans = Object.values(this.players).filter(p => !p.isBot && p.isAlive);

    for (const bot of bots) {
      // Bot auto-claims relic when room cleared
      if (this.enemies.length === 0 && this.chestRelics.length > 0 && !this.chestClaimedBy.includes(bot.id)) {
        const randomRelic = this.chestRelics[Math.floor(Math.random() * this.chestRelics.length)];
        if (randomRelic) this.handleRelicChoice(bot.id, randomRelic.id);
      }

      // Priority 1: Revive a fallen ally!
      if (fallenAllies.length > 0) {
        const targetFallen = fallenAllies[0];
        const dist = Math.hypot(targetFallen.x - bot.x, targetFallen.y - bot.y);
        const angle = Math.atan2(targetFallen.y - bot.y, targetFallen.x - bot.x);
        const moveX = dist > 28 ? Math.cos(angle) : 0;
        const moveY = dist > 28 ? Math.sin(angle) : 0;
        this.handlePlayerInput(bot.id, {
          moveX,
          moveY,
          angle,
          isAttacking: this.enemies.length > 0,
          isDashing: dist > 180 && now >= bot.dashCooldownEndsAt,
        });
        continue;
      }

      // Priority 2: Combat against closest enemy
      if (this.enemies.length > 0) {
        let closest = this.enemies[0];
        let minDist = Infinity;
        for (const e of this.enemies) {
          const d = Math.hypot(e.x - bot.x, e.y - bot.y);
          if (d < minDist) {
            minDist = d;
            closest = e;
          }
        }

        const angleToEnemy = Math.atan2(closest.y - bot.y, closest.x - bot.x);
        const preferredDist = bot.classType === 'GUERRERO' || bot.classType === 'PICARO' ? 52 : 240;
        let moveX = 0;
        let moveY = 0;

        if (minDist > preferredDist + 35) {
          moveX = Math.cos(angleToEnemy);
          moveY = Math.sin(angleToEnemy);
        } else if (minDist < preferredDist - 35) {
          moveX = -Math.cos(angleToEnemy);
          moveY = -Math.sin(angleToEnemy);
        } else {
          // Strafe around target
          const strafeAngle = angleToEnemy + Math.PI / 2;
          moveX = Math.cos(strafeAngle);
          moveY = Math.sin(strafeAngle);
        }

        const shouldDash = minDist < 75 && closest.aiState === 'ATTACKING';
        const shouldUseSkill = minDist < 260 && now >= bot.skillCooldownEndsAt;

        this.handlePlayerInput(bot.id, {
          moveX,
          moveY,
          angle: angleToEnemy,
          isAttacking: true,
          isDashing: shouldDash,
          isUsingSkill: shouldUseSkill,
        });
      } else if (aliveHumans.length > 0) {
        // Follow human leader when room is cleared
        const leader = aliveHumans[0];
        const dist = Math.hypot(leader.x - bot.x, leader.y - bot.y);
        const angle = Math.atan2(leader.y - bot.y, leader.x - bot.x);
        this.handlePlayerInput(bot.id, {
          moveX: dist > 95 ? Math.cos(angle) : 0,
          moveY: dist > 95 ? Math.sin(angle) : 0,
          angle,
          isAttacking: false,
        });
      }
    }
  }

  /**
   * Updates environmental & skill hazards (Spike Traps, Arcane Vortex, Meteor Strikes, Bear Traps, Decoys).
   */
  private updateHazards(dt: number, now: number): void {
    const isDoTTick = now - this.lastDoTTickAt >= 420;
    if (isDoTTick) {
      this.lastDoTTickAt = now;
    }

    // Gravity well mutation gentle pull toward center
    if (this.currentMutation.hazardType === 'GRAVITY_WELL' && this.enemies.length > 0) {
      const cx = config.game.roomWidth / 2;
      const cy = config.game.roomHeight / 2;
      for (const p of Object.values(this.players)) {
        if (!p.isAlive || p.isDashing) continue;
        const a = Math.atan2(cy - p.y, cx - p.x);
        p.x += Math.cos(a) * 32 * dt;
        p.y += Math.sin(a) * 32 * dt;
      }
    }

    for (let i = this.hazards.length - 1; i >= 0; i--) {
      const h = this.hazards[i];
      const elapsed = now - h.createdAt;

      if (elapsed >= h.durationMs) {
        // Detonate expiring skill hazards!
        if (h.type === 'ARCANE_VORTEX') {
          this.triggerExplosion(h.x, h.y, h.radius, h.damage * 2.2, h.ownerId, 'ICE', now);
        } else if (h.type === 'DECOY_BOMB') {
          this.triggerExplosion(h.x, h.y, h.radius, h.damage, h.ownerId, 'POISON', now);
        } else if (h.type === 'METEOR_STRIKE') {
          this.emitFX({
            type: 'EXPLOSION',
            x: h.x,
            y: h.y,
            radius: h.radius,
            color: '#ef4444',
          });
          for (const p of Object.values(this.players)) {
            if (p.isAlive && Math.hypot(p.x - h.x, p.y - h.y) <= h.radius + 16) {
              this.damagePlayer(p, h.damage);
            }
          }
        }
        this.hazards.splice(i, 1);
        continue;
      }

      if (h.type === 'SPIKE_TRAP') {
        const cycle = (now + i * 500) % 3400;
        h.active = cycle >= 2200; // Spikes up for 1.2s every 3.4s
        if (h.active && isDoTTick) {
          for (const p of Object.values(this.players)) {
            if (p.isAlive && !p.isDashing && Math.hypot(p.x - h.x, p.y - h.y) < h.radius) {
              this.damagePlayer(p, h.damage);
            }
          }
          for (let ei = this.enemies.length - 1; ei >= 0; ei--) {
            const e = this.enemies[ei];
            if (!e.isBoss && Math.hypot(e.x - h.x, e.y - h.y) < h.radius + e.radius * 0.5) {
              this.applyDamageToEnemy(e, ei, h.damage, undefined, false, 'NONE', now);
            }
          }
        }
      } else if (h.type === 'LAVA' && isDoTTick) {
        for (const p of Object.values(this.players)) {
          if (p.isAlive && !p.isDashing && Math.hypot(p.x - h.x, p.y - h.y) < h.radius) {
            this.damagePlayer(p, h.damage);
          }
        }
      } else if (h.type === 'POISON_CLOUD' && isDoTTick) {
        for (const p of Object.values(this.players)) {
          if (p.isAlive && !p.isDashing && Math.hypot(p.x - h.x, p.y - h.y) < h.radius) {
            this.damagePlayer(p, h.damage);
          }
        }
      } else if (h.type === 'ARCANE_VORTEX') {
        const owner = h.ownerId ? this.players[h.ownerId] : undefined;
        for (let ei = this.enemies.length - 1; ei >= 0; ei--) {
          const e = this.enemies[ei];
          const dist = Math.hypot(h.x - e.x, h.y - e.y);
          if (dist < h.radius + e.radius) {
            const pullAngle = Math.atan2(h.y - e.y, h.x - e.x);
            const pullForce = e.isBoss ? 55 : 190;
            e.x += Math.cos(pullAngle) * pullForce * dt;
            e.y += Math.sin(pullAngle) * pullForce * dt;
            e.chillUntil = now + 1200;
            if (isDoTTick) {
              this.applyDamageToEnemy(e, ei, h.damage, owner, false, 'ICE', now);
            }
          }
        }
      } else if (h.type === 'BEAR_TRAP') {
        const owner = h.ownerId ? this.players[h.ownerId] : undefined;
        for (let ei = this.enemies.length - 1; ei >= 0; ei--) {
          const e = this.enemies[ei];
          if (Math.hypot(e.x - h.x, e.y - h.y) < h.radius + e.radius) {
            e.stunUntil = now + 1800;
            this.triggerExplosion(h.x, h.y, 90, h.damage, h.ownerId, 'FIRE', now);
            this.hazards.splice(i, 1);
            break;
          }
        }
      }
    }

    // Apply Elemental DoT (Burn & Poison) on Enemies every 420ms
    if (isDoTTick) {
      for (let ei = this.enemies.length - 1; ei >= 0; ei--) {
        const e = this.enemies[ei];
        let dotDmg = 0;
        if (e.burnUntil && now < e.burnUntil) dotDmg += 8 + this.roomIndex;
        if (e.poisonUntil && now < e.poisonUntil) dotDmg += 6 + this.roomIndex;
        if (dotDmg > 0) {
          this.applyDamageToEnemy(e, ei, dotDmg, undefined, false, 'NONE', now);
        }
      }
    }
  }

  private updatePlayers(dt: number, now: number): void {
    const W = config.game.roomWidth;
    const H = config.game.roomHeight;
    const pad = 48;

    const allPlayers = Object.values(this.players);
    const alivePlayers = allPlayers.filter(p => p.isAlive);

    // 1. Co-op Soul Revival check for fallen teammates
    for (const fallen of allPlayers) {
      if (fallen.isAlive) {
        fallen.reviveProgress = 0;
        continue;
      }

      const reviver = alivePlayers.find(ally => Math.hypot(ally.x - fallen.x, ally.y - fallen.y) <= 68);
      if (reviver) {
        fallen.reviveProgress = Math.min(1, (fallen.reviveProgress || 0) + dt / 1.8);
        if (fallen.reviveProgress >= 1) {
          fallen.isAlive = true;
          fallen.currentHp = Math.floor(fallen.maxHp * 0.45);
          fallen.shieldHp = 25;
          fallen.reviveProgress = 0;
          fallen.invulnerableUntil = now + 2000;
          reviver.revivesCount++;

          this.emitFX({
            type: 'REVIVE',
            x: fallen.x,
            y: fallen.y,
            radius: 90,
            text: `✨ ¡${fallen.name} REVIVIDO!`,
            color: '#22c55e',
          });
        }
      } else {
        fallen.reviveProgress = Math.max(0, (fallen.reviveProgress || 0) - dt * 0.35);
      }
    }

    // 2. Update living players
    for (const p of alivePlayers) {
      if (p.combo > 0 && now > p.comboExpiresAt) {
        p.combo = 0;
      }

      if (p.isDashing && now >= p.dashEndsAt) {
        p.isDashing = false;
        p.vx *= 0.3;
        p.vy *= 0.3;
      }

      // Only server-integrate position if player is a bot, dashing, or hasn't sent client-predicted coords in 90ms
      const lastSync = this.lastClientSyncAt[p.id] || 0;
      if (p.isBot || p.isDashing || now - lastSync > 90) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }

      // Pillar physical collision
      for (const pil of this.pillars) {
        const dx = p.x - pil.x;
        const dy = p.y - pil.y;
        const dist = Math.hypot(dx, dy);
        const minDist = pil.radius + 18;
        if (dist < minDist && dist > 0.001) {
          p.x = pil.x + (dx / dist) * minDist;
          p.y = pil.y + (dy / dist) * minDist;
        }
      }

      // Magnetic Pickups (Hearts, Gold Coins, Shield Orbs, Frenzy Orbs)
      for (let i = this.hearts.length - 1; i >= 0; i--) {
        const h = this.hearts[i];
        const pType = h.type || 'HEART';
        const dx = p.x - h.x;
        const dy = p.y - h.y;
        const dist = Math.hypot(dx, dy);

        // Magnetic pull within 125px
        if (dist < 125 && dist > 5) {
          if (pType !== 'HEART' || p.currentHp < p.maxHp) {
            h.x += (dx / dist) * 260 * dt;
            h.y += (dy / dist) * 260 * dt;
          }
        }

        if (dist < 34) {
          if (pType === 'GOLD') {
            p.gold += h.healAmount;
            this.telemetry.totalGoldCollected += h.healAmount;
            this.hearts.splice(i, 1);
          } else if (pType === 'SHIELD_ORB') {
            p.shieldHp = Math.min(100, p.shieldHp + h.healAmount);
            this.hearts.splice(i, 1);
          } else if (pType === 'FRENZY_ORB') {
            p.combo += 8;
            p.maxCombo = Math.max(p.maxCombo, p.combo);
            p.comboExpiresAt = now + 6000;
            p.skillCooldownEndsAt = 0; // Instant skill reset!
            this.hearts.splice(i, 1);
          } else if (p.currentHp < p.maxHp) {
            p.currentHp = Math.min(p.maxHp, p.currentHp + h.healAmount);
            this.hearts.splice(i, 1);
          }
        }
      }

      // Branching Door transitions (North = Standard/Boss, East = Elite, West = Sanctuary)
      const isCleared = this.enemies.length === 0;
      const doors = this.computeDoors(isCleared);

      if (p.y < pad) {
        if (isCleared && doors.NORTH.open && Math.abs(p.x - W / 2) < 58) {
          this.advanceToNextRoom(doors.NORTH.encounterType || 'STANDARD');
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
        if (isCleared && doors.WEST.open && Math.abs(p.y - H / 2) < 58) {
          this.advanceToNextRoom(doors.WEST.encounterType || 'SANCTUARY');
          return;
        }
        p.x = pad;
        p.vx = 0;
      }
      if (p.x > W - pad) {
        if (isCleared && doors.EAST.open && Math.abs(p.y - H / 2) < 58) {
          this.advanceToNextRoom(doors.EAST.encounterType || 'ELITE');
          return;
        }
        p.x = W - pad;
        p.vx = 0;
      }
    }
  }

  private updateEnemies(dt: number, now: number): void {
    const alivePlayers = Object.values(this.players).filter(p => p.isAlive);
    if (alivePlayers.length === 0) return;

    const activeDecoy = this.hazards.find(h => h.type === 'DECOY_BOMB');

    this.enemies.forEach(e => {
      // Stunned enemies cannot act!
      if (e.stunUntil && now < e.stunUntil) {
        e.vx *= 0.5;
        e.vy *= 0.5;
        e.x += e.vx * dt;
        e.y += e.vy * dt;
        return;
      }

      const chillMult = e.chillUntil && now < e.chillUntil ? 0.52 : 1.0;
      const effSpeed = e.speed * chillMult;

      // Target decoy bomb if active, otherwise closest visible player
      let targetX = alivePlayers[0].x;
      let targetY = alivePlayers[0].y;
      let closestPlayer = alivePlayers[0];
      let minDist = Infinity;

      if (activeDecoy && !e.isBoss) {
        targetX = activeDecoy.x;
        targetY = activeDecoy.y;
        minDist = Math.hypot(targetX - e.x, targetY - e.y);
      } else {
        const visiblePlayers = alivePlayers.filter(p => now >= p.stealthedUntil);
        const pool = visiblePlayers.length > 0 ? visiblePlayers : alivePlayers;
        for (const p of pool) {
          const dist = Math.hypot(p.x - e.x, p.y - e.y);
          if (dist < minDist) {
            minDist = dist;
            closestPlayer = p;
            targetX = p.x;
            targetY = p.y;
          }
        }
      }

      const angleToTarget = Math.atan2(targetY - e.y, targetX - e.x);

      // Elite Modifier: TORMENTA periodically zaps nearby area
      if (e.isElite && e.eliteModifier === 'TORMENTA' && now - e.lastAttackAt > 3000) {
        if (Math.random() < 0.03) {
          this.hazards.push({
            id: `meteor_${this.nextEventId++}`,
            type: 'METEOR_STRIKE',
            x: targetX,
            y: targetY,
            radius: 58,
            active: true,
            createdAt: now,
            durationMs: 1350,
            damage: 18,
          });
        }
      }

      if (e.type === 'SLIME' || e.type === 'MINI_SLIME') {
        e.stateTimer = (e.stateTimer || 0) + dt * 1000;
        const cycle = e.stateTimer % 1350;

        if (cycle < 420) {
          e.aiState = 'CHARGING';
          e.vx *= 0.6;
          e.vy *= 0.6;
        } else if (cycle < 850) {
          e.aiState = 'ATTACKING';
          e.vx = Math.cos(angleToTarget) * (effSpeed * 1.85);
          e.vy = Math.sin(angleToTarget) * (effSpeed * 1.85);

          if (Math.hypot(closestPlayer.x - e.x, closestPlayer.y - e.y) < e.radius + 18) {
            this.damagePlayer(closestPlayer, e.damage);
            if (e.eliteModifier === 'VAMPIRICO') e.currentHp = Math.min(e.maxHp, e.currentHp + 15);
          }
        } else {
          e.aiState = 'IDLE';
          e.vx *= 0.4;
          e.vy *= 0.4;
        }
      } else if (e.type === 'ESQUELETO') {
        e.stateTimer = (e.stateTimer || 0) + dt * 1000;
        const cycle = e.stateTimer % e.attackCooldownMs;

        if (cycle > e.attackCooldownMs - 600) {
          e.aiState = 'CHARGING';
          e.aimAngle = angleToTarget;
          e.vx = 0;
          e.vy = 0;

          if (now - e.lastAttackAt >= e.attackCooldownMs) {
            e.lastAttackAt = now;
            const shots = e.isElite ? 3 : 1;
            for (let s = 0; s < shots; s++) {
              const a = angleToTarget + (shots === 1 ? 0 : (s - 1) * 0.22);
              this.projectiles.push({
                id: `proj_${this.nextProjectileId++}`,
                ownerId: e.id,
                fromPlayer: false,
                x: e.x + Math.cos(a) * 22,
                y: e.y + Math.sin(a) * 22,
                vx: Math.cos(a) * 370,
                vy: Math.sin(a) * 370,
                radius: 6,
                damage: e.damage,
                color: '#991b1b',
                bouncesRemaining: e.isElite ? 1 : 0,
                createdAt: now,
                lifetimeMs: 2600,
              });
            }
          }
        } else {
          e.aiState = 'IDLE';
          if (minDist < 210) {
            e.vx = -Math.cos(angleToTarget) * effSpeed;
            e.vy = -Math.sin(angleToTarget) * effSpeed;
          } else if (minDist > 340) {
            e.vx = Math.cos(angleToTarget) * effSpeed;
            e.vy = Math.sin(angleToTarget) * effSpeed;
          } else {
            e.vx *= 0.5;
            e.vy *= 0.5;
          }
        }
      } else if (e.type === 'MURCIELAGO') {
        e.stateTimer = (e.stateTimer || 0) + dt * 1000;
        const cycle = e.stateTimer % 1900;

        if (cycle < 700) {
          e.aiState = 'ATTACKING';
          e.vx = Math.cos(angleToTarget) * (effSpeed * 1.55);
          e.vy = Math.sin(angleToTarget) * (effSpeed * 1.55);

          if (Math.hypot(closestPlayer.x - e.x, closestPlayer.y - e.y) < e.radius + 16) {
            this.damagePlayer(closestPlayer, e.damage);
          }
        } else {
          e.aiState = 'IDLE';
          const orbitAngle = angleToTarget + Math.PI / 2;
          e.vx = Math.cos(orbitAngle) * effSpeed;
          e.vy = Math.sin(orbitAngle) * effSpeed;
        }
      } else if (e.type === 'GOLEM') {
        // GOLEM: Advances steadily and unleashes a telegraphed Seismic Ring Slam!
        e.stateTimer = (e.stateTimer || 0) + dt * 1000;
        const cycle = e.stateTimer % e.attackCooldownMs;

        if (cycle > e.attackCooldownMs - 650) {
          e.aiState = 'CHARGING';
          e.vx *= 0.2;
          e.vy *= 0.2;

          if (now - e.lastAttackAt >= e.attackCooldownMs) {
            e.lastAttackAt = now;
            this.emitFX({
              type: 'SHOCKWAVE',
              x: e.x,
              y: e.y,
              radius: 135,
              color: '#ea580c',
            });
            // Ring of 8 rock projectiles + close shockwave
            for (let k = 0; k < 8; k++) {
              const a = (k / 8) * Math.PI * 2;
              this.projectiles.push({
                id: `proj_${this.nextProjectileId++}`,
                ownerId: e.id,
                fromPlayer: false,
                x: e.x + Math.cos(a) * 30,
                y: e.y + Math.sin(a) * 30,
                vx: Math.cos(a) * 240,
                vy: Math.sin(a) * 240,
                radius: 8,
                damage: e.damage,
                color: '#d97706',
                bouncesRemaining: 0,
                createdAt: now,
                lifetimeMs: 1400,
              });
            }
          }
        } else {
          e.aiState = 'IDLE';
          e.vx = Math.cos(angleToTarget) * effSpeed;
          e.vy = Math.sin(angleToTarget) * effSpeed;
          if (Math.hypot(closestPlayer.x - e.x, closestPlayer.y - e.y) < e.radius + 18) {
            this.damagePlayer(closestPlayer, e.damage);
          }
        }
      } else if (e.type === 'NIGROMANTE') {
        // NIGROMANTE: Casts telegraphed dark meteors and blinks away if approached
        e.stateTimer = (e.stateTimer || 0) + dt * 1000;
        const cycle = e.stateTimer % e.attackCooldownMs;

        if (cycle > e.attackCooldownMs - 700) {
          e.aiState = 'CHARGING';
          e.vx = 0;
          e.vy = 0;

          if (now - e.lastAttackAt >= e.attackCooldownMs) {
            e.lastAttackAt = now;
            // Summon Meteor Strike at player position + 3 homing dark orbs
            this.hazards.push({
              id: `meteor_${this.nextEventId++}`,
              type: 'METEOR_STRIKE',
              x: targetX,
              y: targetY,
              radius: 62,
              active: true,
              createdAt: now,
              durationMs: 1350,
              damage: e.damage,
            });

            for (let s = -1; s <= 1; s++) {
              const a = angleToTarget + s * 0.28;
              this.projectiles.push({
                id: `proj_${this.nextProjectileId++}`,
                ownerId: e.id,
                fromPlayer: false,
                x: e.x + Math.cos(a) * 20,
                y: e.y + Math.sin(a) * 20,
                vx: Math.cos(a) * 310,
                vy: Math.sin(a) * 310,
                radius: 7,
                damage: e.damage - 3,
                color: '#a855f7',
                bouncesRemaining: 1,
                createdAt: now,
                lifetimeMs: 2400,
              });
            }
          }
        } else {
          e.aiState = 'IDLE';
          if (minDist < 170) {
            e.vx = -Math.cos(angleToTarget) * effSpeed * 1.2;
            e.vy = -Math.sin(angleToTarget) * effSpeed * 1.2;
          } else {
            const orbit = angleToTarget + Math.PI / 2;
            e.vx = Math.cos(orbit) * effSpeed * 0.7;
            e.vy = Math.sin(orbit) * effSpeed * 0.7;
          }
        }
      } else if (e.isBoss) {
        this.updateBossAI(e, closestPlayer, angleToTarget, dt, now);
      }

      e.x += e.vx * dt;
      e.y += e.vy * dt;

      // Keep enemies inside room bounds and sliding around pillars
      const pad = 52;
      e.x = Math.max(pad, Math.min(config.game.roomWidth - pad, e.x));
      e.y = Math.max(pad, Math.min(config.game.roomHeight - pad, e.y));

      for (const pil of this.pillars) {
        const dx = e.x - pil.x;
        const dy = e.y - pil.y;
        const dist = Math.hypot(dx, dy);
        const minPillarDist = pil.radius + e.radius;
        if (dist < minPillarDist && dist > 0.001) {
          e.x = pil.x + (dx / dist) * minPillarDist;
          e.y = pil.y + (dy / dist) * minPillarDist;
        }
      }
    });
  }

  /**
   * Multi-Pattern Adaptive Boss AI (Spiral, Meteor Rain, Laser Sweep, Charge Slam).
   */
  private updateBossAI(
    e: EnemyEntity,
    target: PlayerEntity,
    angleToTarget: number,
    dt: number,
    now: number
  ): void {
    const isPhase2 = e.currentHp <= e.maxHp * 0.5;
    if (isPhase2 && e.bossPhase === 1) {
      e.bossPhase = 2;
      this.directorDialogue = {
        speaker: e.name,
        text: '¡FASE 2 ACTIVADA! ¡EL TRIBUNAL DICTA SENTENCIA INMEDIATA!',
        mood: 'ANGRY',
        timestamp: now,
      };
      this.emitFX({
        type: 'SHOCKWAVE',
        x: e.x,
        y: e.y,
        radius: 260,
        text: '🔥 ¡FASE 2: JUICIO FINAL!',
        color: '#dc2626',
      });
    }

    e.stateTimer = (e.stateTimer || 0) + dt * 1000;
    const patternIndex = Math.floor(e.stateTimer / 5200) % 4;
    const patterns: Array<EnemyEntity['bossPattern']> = [
      'SPIRAL',
      'METEOR_RAIN',
      'LASER_SWEEP',
      'CHARGE_SLAM',
    ];
    e.bossPattern = patterns[patternIndex];

    if (e.bossPattern === 'CHARGE_SLAM') {
      // Moves aggressively toward target player and slams
      e.aiState = 'ATTACKING';
      e.vx = Math.cos(angleToTarget) * e.speed * (isPhase2 ? 1.65 : 1.3);
      e.vy = Math.sin(angleToTarget) * e.speed * (isPhase2 ? 1.65 : 1.3);

      if (Math.hypot(target.x - e.x, target.y - e.y) < e.radius + 22) {
        this.damagePlayer(target, e.damage);
      }
    } else {
      // Hover near upper center
      e.aiState = e.bossPattern === 'LASER_SWEEP' ? 'CHARGING' : 'IDLE';
      e.aimAngle = angleToTarget;
      const centerX = config.game.roomWidth / 2 + Math.sin(now / 900) * 180;
      const centerY = 230 + Math.cos(now / 700) * 60;
      e.vx = (centerX - e.x) * 1.1;
      e.vy = (centerY - e.y) * 1.1;
    }

    const attackInterval = isPhase2 ? 950 : 1400;
    if (now - e.lastAttackAt >= attackInterval) {
      e.lastAttackAt = now;

      if (e.bossPattern === 'SPIRAL' || e.bossPattern === 'CHARGE_SLAM') {
        const bulletCount = isPhase2 ? 11 : 8;
        for (let i = 0; i < bulletCount; i++) {
          const shotAngle = (i / bulletCount) * Math.PI * 2 + now / 320;
          this.projectiles.push({
            id: `proj_${this.nextProjectileId++}`,
            ownerId: e.id,
            fromPlayer: false,
            x: e.x + Math.cos(shotAngle) * 44,
            y: e.y + Math.sin(shotAngle) * 44,
            vx: Math.cos(shotAngle) * (isPhase2 ? 275 : 215),
            vy: Math.sin(shotAngle) * (isPhase2 ? 275 : 215),
            radius: 10,
            damage: e.damage,
            color: isPhase2 ? '#dc2626' : '#d97706',
            bouncesRemaining: isPhase2 ? 1 : 0,
            createdAt: now,
            lifetimeMs: 3200,
          });
        }
      } else if (e.bossPattern === 'METEOR_RAIN') {
        // Call down meteors on all living players + aimed fan
        for (const p of Object.values(this.players)) {
          if (!p.isAlive) continue;
          this.hazards.push({
            id: `meteor_${this.nextEventId++}`,
            type: 'METEOR_STRIKE',
            x: p.x + (Math.random() * 60 - 30),
            y: p.y + (Math.random() * 60 - 30),
            radius: 68,
            active: true,
            createdAt: now,
            durationMs: 1300,
            damage: e.damage + 4,
          });
        }
      } else if (e.bossPattern === 'LASER_SWEEP') {
        // High-velocity targeted barrage
        for (let s = -2; s <= 2; s++) {
          const a = angleToTarget + s * 0.14;
          this.projectiles.push({
            id: `proj_${this.nextProjectileId++}`,
            ownerId: e.id,
            fromPlayer: false,
            x: e.x + Math.cos(a) * 44,
            y: e.y + Math.sin(a) * 44,
            vx: Math.cos(a) * 420,
            vy: Math.sin(a) * 420,
            radius: 9,
            damage: e.damage,
            color: '#ef4444',
            bouncesRemaining: 1,
            createdAt: now,
            lifetimeMs: 2600,
          });
        }
      }
    }
  }

  private updateProjectiles(dt: number, now: number): void {
    const W = config.game.roomWidth;
    const H = config.game.roomHeight;
    const pad = 42;

    const remaining: ProjectileEntity[] = [];

    for (const p of this.projectiles) {
      if (now - p.createdAt > p.lifetimeMs) continue;

      p.x += p.vx * dt;
      p.y += p.vy * dt;

      // 1. Wall bounce or explode/destroy
      let hitWall = false;
      if (p.x <= pad || p.x >= W - pad) {
        if (p.bouncesRemaining > 0) {
          p.vx = -p.vx;
          p.bouncesRemaining--;
          p.x = Math.max(pad + 1, Math.min(W - pad - 1, p.x));
        } else {
          hitWall = true;
        }
      }
      if (p.y <= pad || p.y >= H - pad) {
        if (p.bouncesRemaining > 0) {
          p.vy = -p.vy;
          p.bouncesRemaining--;
          p.y = Math.max(pad + 1, Math.min(H - pad - 1, p.y));
        } else {
          hitWall = true;
        }
      }

      if (hitWall) {
        if (p.isExplosive && p.explosionRadius) {
          this.triggerExplosion(p.x, p.y, p.explosionRadius, p.damage, p.ownerId, p.element || 'FIRE', now);
        }
        continue;
      }

      // 2. Pillar bounce or destroy
      let hitPillar = false;
      for (const pil of this.pillars) {
        const dx = p.x - pil.x;
        const dy = p.y - pil.y;
        const r = pil.radius + p.radius;
        if (dx * dx + dy * dy < r * r) {
          if (p.bouncesRemaining > 0) {
            const normAngle = Math.atan2(dy, dx);
            const speed = Math.hypot(p.vx, p.vy);
            p.vx = Math.cos(normAngle) * speed;
            p.vy = Math.sin(normAngle) * speed;
            p.bouncesRemaining--;
            p.x = pil.x + Math.cos(normAngle) * (r + 2);
            p.y = pil.y + Math.sin(normAngle) * (r + 2);
          } else {
            hitPillar = true;
            if (p.isExplosive && p.explosionRadius) {
              this.triggerExplosion(p.x, p.y, p.explosionRadius, p.damage, p.ownerId, p.element || 'FIRE', now);
            }
          }
          break;
        }
      }
      if (hitPillar) continue;

      // 3. Hit Interactive Barrels!
      if (p.fromPlayer) {
        let hitBarrel = false;
        for (let bi = this.barrels.length - 1; bi >= 0; bi--) {
          const b = this.barrels[bi];
          if (Math.hypot(b.x - p.x, b.y - p.y) < b.radius + p.radius) {
            hitBarrel = true;
            this.barrels.splice(bi, 1);
            const el = b.type === 'FROST' ? 'ICE' : b.type === 'TOXIC' ? 'POISON' : 'FIRE';
            this.triggerExplosion(b.x, b.y, 125, 65 + this.roomIndex * 12, p.ownerId, el, now);
            break;
          }
        }
        if (hitBarrel) continue;
      }

      // 4. Hit Player (with Guerrero Reflective Bulwark check!)
      if (!p.fromPlayer) {
        let hit = false;
        for (const pl of Object.values(this.players)) {
          if (!pl.isAlive || pl.isDashing) continue;
          const r = 22 + p.radius;
          const dx = pl.x - p.x;
          const dy = pl.y - p.y;

          if (dx * dx + dy * dy < r * r) {
            // Check Guerrero Reflective Shield!
            if (pl.classType === 'GUERRERO' && now < pl.skillActiveUntil) {
              p.fromPlayer = true;
              p.ownerId = pl.id;
              p.vx = -p.vx * 1.45;
              p.vy = -p.vy * 1.45;
              p.damage = Math.round(p.damage * 2.5);
              p.color = '#facc15';
              p.createdAt = now;
              this.emitFX({
                type: 'CRIT',
                x: pl.x,
                y: pl.y - 20,
                text: '🛡️ ¡REFLEJADO!',
                color: '#facc15',
              });
              hit = false; // Keep reflected projectile alive!
              break;
            }

            this.damagePlayer(pl, p.damage);
            hit = true;
            break;
          }
        }
        if (hit) continue;
      }

      // 5. Hit Enemy
      if (p.fromPlayer) {
        let consumed = false;
        for (let i = this.enemies.length - 1; i >= 0; i--) {
          const e = this.enemies[i];
          const r = e.radius + p.radius;
          const dx = e.x - p.x;
          const dy = e.y - p.y;

          if (dx * dx + dy * dy < r * r) {
            const owner = this.players[p.ownerId];

            if (p.isExplosive && p.explosionRadius) {
              this.triggerExplosion(p.x, p.y, p.explosionRadius, p.damage, p.ownerId, p.element || 'FIRE', now);
              consumed = true;
              break;
            }

            // Knockback on enemy
            const knockAngle = Math.atan2(p.vy, p.vx);
            const knockForce = e.isBoss ? 25 : 85;
            e.vx += Math.cos(knockAngle) * knockForce;
            e.vy += Math.sin(knockAngle) * knockForce;

            this.applyDamageToEnemy(
              e,
              i,
              p.damage,
              owner,
              !!p.isCrit,
              p.element || 'NONE',
              now,
              !!p.chainLightning
            );

            if (p.piercesRemaining && p.piercesRemaining > 0) {
              p.piercesRemaining--;
            } else {
              consumed = true;
            }
            break;
          }
        }
        if (consumed) continue;
      }

      remaining.push(p);
    }

    this.projectiles = remaining;
  }

  /**
   * Triggers an AoE elemental explosion (Mage Fireballs, Explosive/Frost/Toxic Barrels, Bear Traps).
   */
  private triggerExplosion(
    x: number,
    y: number,
    radius: number,
    damage: number,
    ownerId: string | undefined,
    element: 'NONE' | 'FIRE' | 'ICE' | 'POISON' | 'LIGHTNING',
    now: number
  ): void {
    const owner = ownerId ? this.players[ownerId] : undefined;
    this.emitFX({
      type: element === 'ICE' ? 'FROST_NOVA' : element === 'POISON' ? 'TOXIC_BLAST' : 'EXPLOSION',
      x,
      y,
      radius,
      color: element === 'ICE' ? '#38bdf8' : element === 'POISON' ? '#22c55e' : '#f97316',
    });

    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      const dist = Math.hypot(e.x - x, e.y - y);
      if (dist <= radius + e.radius) {
        const pushAngle = Math.atan2(e.y - y, e.x - x);
        e.vx += Math.cos(pushAngle) * 140;
        e.vy += Math.sin(pushAngle) * 140;
        this.applyDamageToEnemy(e, i, damage, owner, false, element, now);
      }
    }
  }

  /**
   * Central damage pipeline for enemies: handles Status Effects, Cross-Class Elemental Synergies,
   * Chain Lightning, Combo Counter, Lifesteal, Slime Splitting, and Loot Drops!
   */
  private applyDamageToEnemy(
    e: EnemyEntity,
    enemyIndex: number,
    rawDamage: number,
    owner: PlayerEntity | undefined,
    isCrit: boolean,
    element: 'NONE' | 'FIRE' | 'ICE' | 'POISON' | 'LIGHTNING',
    now: number,
    triggerChain = false
  ): void {
    if (!this.enemies[enemyIndex] || this.enemies[enemyIndex].id !== e.id) return;

    let finalDamage = rawDamage;
    // Poisoned enemies take +25% bonus damage from all sources!
    if (e.poisonUntil && now < e.poisonUntil) {
      finalDamage = Math.round(finalDamage * 1.25);
    }
    // Blindado Elite takes 20% less damage
    if (e.eliteModifier === 'BLINDADO') {
      finalDamage = Math.round(finalDamage * 0.8);
    }

    // Check Cross-Elemental Co-op Synergy!
    const wasBurning = e.burnUntil && now < e.burnUntil;
    const wasPoisoned = e.poisonUntil && now < e.poisonUntil;
    const wasChilled = e.chillUntil && now < e.chillUntil;

    let synergyTriggered = false;
    if (
      (element === 'FIRE' && (wasPoisoned || wasChilled)) ||
      (element === 'POISON' && (wasBurning || wasChilled)) ||
      (element === 'ICE' && (wasBurning || wasPoisoned)) ||
      (element === 'LIGHTNING' && (wasChilled || wasBurning))
    ) {
      synergyTriggered = true;
      finalDamage = Math.round(finalDamage * 1.55);
      e.burnUntil = 0;
      e.poisonUntil = 0;

      this.telemetry.synergiesCount++;
      if (owner) owner.synergiesTriggered++;

      this.emitFX({
        type: 'SYNERGY',
        x: e.x,
        y: e.y - 18,
        radius: 95,
        text: '⚡ ¡SINERGIA ELEMENTAL!',
        color: '#c084fc',
      });
    }

    // Apply new elemental status
    if (element === 'FIRE') e.burnUntil = now + 3200;
    else if (element === 'POISON') e.poisonUntil = now + 4000;
    else if (element === 'ICE') e.chillUntil = now + 3000;

    e.currentHp -= finalDamage;
    e.flashUntil = now + 95;
    this.telemetry.totalDamageDealt += finalDamage;
    this.directorAnger = Math.min(100, this.directorAnger + finalDamage * 0.08);

    if (owner) {
      owner.damageDealt += finalDamage;
      owner.combo += 1;
      owner.maxCombo = Math.max(owner.maxCombo, owner.combo);
      owner.comboExpiresAt = now + 4500;
    }

    // Chain Lightning arc to nearby enemy
    if (triggerChain && this.enemies.length > 1) {
      const other = this.enemies.find(otherE => otherE.id !== e.id && Math.hypot(otherE.x - e.x, otherE.y - e.y) < 190);
      if (other) {
        const otherIdx = this.enemies.indexOf(other);
        this.emitFX({
          type: 'LIGHTNING_ARC',
          x: e.x,
          y: e.y,
          targetX: other.x,
          targetY: other.y,
          color: '#38bdf8',
        });
        this.applyDamageToEnemy(other, otherIdx, Math.round(finalDamage * 0.55), owner, false, 'LIGHTNING', now, false);
      }
    }

    // Check Enemy Death
    if (e.currentHp <= 0) {
      const deadIdx = this.enemies.findIndex(item => item.id === e.id);
      if (deadIdx !== -1) {
        this.enemies.splice(deadIdx, 1);
      }

      if (owner) {
        owner.kills++;
        const stats = this.getPlayerEffectiveStats(owner);
        if (stats.lifestealPct > 0) {
          owner.currentHp = Math.min(owner.maxHp, owner.currentHp + Math.max(4, Math.round(owner.maxHp * stats.lifestealPct * 0.4)));
        }
      }

      // Elite Explosivo detonates on death
      if (e.eliteModifier === 'EXPLOSIVO') {
        this.emitFX({
          type: 'EXPLOSION',
          x: e.x,
          y: e.y,
          radius: 85,
          color: '#ef4444',
        });
      }

      // Large Slime splits into 2 Mini-Slimes!
      if (e.type === 'SLIME' && !e.isBoss && this.roomIndex >= 2) {
        this.createEnemy('MINI_SLIME', this.roomIndex, 0.85, false, e.x - 18, e.y);
        this.createEnemy('MINI_SLIME', this.roomIndex, 0.85, false, e.x + 18, e.y);
      }

      // Drop Gold Coins, Hearts, Shield Orbs, or Frenzy Orbs!
      const goldMult = owner ? this.getPlayerEffectiveStats(owner).goldMultiplier : 1;
      const comboBonus = owner && owner.combo >= 10 ? 1.4 : 1.0;
      const goldValue = Math.round((e.isElite ? 35 : 10 + this.roomIndex * 2) * goldMult * comboBonus);

      this.hearts.push({
        id: `gold_${this.nextHeartId++}`,
        type: 'GOLD',
        x: e.x + (Math.random() * 20 - 10),
        y: e.y + (Math.random() * 20 - 10),
        healAmount: goldValue,
        createdAt: now,
      });

      if (e.isElite || Math.random() < 0.35) {
        const dropRoll = Math.random();
        const dropType = e.isElite
          ? 'FRENZY_ORB'
          : dropRoll < 0.68
          ? 'HEART'
          : dropRoll < 0.88
          ? 'SHIELD_ORB'
          : 'FRENZY_ORB';
        this.hearts.push({
          id: `drop_${this.nextHeartId++}`,
          type: dropType,
          x: e.x + (Math.random() * 24 - 12),
          y: e.y + (Math.random() * 24 - 12),
          healAmount: dropType === 'HEART' ? 22 : dropType === 'SHIELD_ORB' ? 25 : 1,
          createdAt: now,
        });
      }
    }
  }

  /**
   * Live AI Director Mid-Combat Intervention when Director Anger reaches 100%!
   */
  private checkLiveDirectorIntervention(now: number): void {
    if (this.interventionTriggeredInRoom || this.enemies.length === 0 || this.directorAnger < 100) return;

    this.interventionTriggeredInRoom = true;
    this.directorAnger = 0;
    this.directorDialogue = this.director.getDirectorQuote('intervention');

    // Call down telegraphed meteors & promote strongest enemy to Elite if not already
    for (const p of Object.values(this.players)) {
      if (!p.isAlive) continue;
      this.hazards.push({
        id: `dir_meteor_${this.nextEventId++}`,
        type: 'METEOR_STRIKE',
        x: p.x + (Math.random() * 80 - 40),
        y: p.y + (Math.random() * 80 - 40),
        radius: 65,
        active: true,
        createdAt: now,
        durationMs: 1500,
        damage: 20,
      });
    }

    const candidate = this.enemies.find(e => !e.isBoss && !e.isElite);
    if (candidate) {
      candidate.isElite = true;
      candidate.eliteModifier = ELITE_MODIFIERS[Math.floor(Math.random() * ELITE_MODIFIERS.length)];
      candidate.name = `★ ${candidate.name} [${candidate.eliteModifier}]`;
      candidate.maxHp = Math.round(candidate.maxHp * 1.6);
      candidate.currentHp = candidate.maxHp;
      candidate.radius = Math.round(candidate.radius * 1.2);
      this.emitFX({
        type: 'DIRECTOR_INTERVENTION',
        x: candidate.x,
        y: candidate.y,
        radius: 110,
        text: '⚡ ¡INTERVENCIÓN DEL DIRECTOR!',
        color: '#ef4444',
      });
    }
  }

  private damagePlayer(player: PlayerEntity, damage: number): void {
    const now = Date.now();
    if (now < player.invulnerableUntil || player.isDashing) return;

    // Absorb with Shield first!
    let remainingDamage = damage;
    if (player.shieldHp > 0) {
      const absorbed = Math.min(player.shieldHp, remainingDamage);
      player.shieldHp -= absorbed;
      remainingDamage -= absorbed;
    }

    if (remainingDamage > 0) {
      player.currentHp = Math.max(0, player.currentHp - remainingDamage);
      player.combo = 0; // Taking real HP damage resets combo
    }

    player.invulnerableUntil = now + 650;

    if (player.currentHp === 0 && player.isAlive) {
      player.isAlive = false;
      player.reviveProgress = 0;
      this.telemetry.totalPlayerDeaths++;
      this.directorDialogue = this.director.getDirectorQuote('playerDown');

      const anyAlive = Object.values(this.players).some(p => p.isAlive);
      if (!anyAlive) {
        this.phase = 'GAME_OVER';
        this.director.assignPlayerTitles(this.players);
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
    if (this.enemies.length === 0 && this.phase === 'PLAYING' && !this.roomClearAnnounced) {
      this.roomClearAnnounced = true;
      const isBoss = this.roomIndex === this.totalRooms || (this.roomIndex > this.totalRooms && this.roomIndex % 3 === 0);
      if (isBoss) {
        this.phase = 'VICTORY';
        this.director.assignPlayerTitles(this.players);
        this.directorDialogue = {
          speaker: 'Director del Calabozo',
          text: '¡INCREÍBLE! Han derrotado al guardián del piso. ¿Cobran su victoria o descienden al Abismo Infinito?',
          mood: 'SURPRISED',
          timestamp: Date.now(),
        };
      } else {
        this.directorDialogue = this.director.getDirectorQuote('roomClear');
      }
    }
  }

  public advanceToNextRoom(nextEncounterType: RoomEncounterType = 'STANDARD'): void {
    if (this.enemies.length > 0 || this.isTransitioningRoom) return;
    const nextIdx = this.roomIndex + 1;
    void this.setupRoom(nextIdx, nextEncounterType);
  }

  private getPlayerEffectiveStats(player: PlayerEntity) {
    const base = CLASS_CONFIGS[player.classType] || CLASS_CONFIGS.CAZADOR;
    const weaponScale = 1 + (player.weaponLevel - 1) * 0.22;
    const weaponSpeedBonus = Math.pow(0.94, player.weaponLevel - 1);

    let damageMult = weaponScale;
    let speedMult = 1;
    let cooldownMult = weaponSpeedBonus;
    let skillCdMult = 1;
    let bouncesBonus = 0;
    let countBonus = 0;
    let critBonus = 0;
    let lifestealPct = 0;
    let goldMultiplier = 1;
    let chainLightning = false;
    let burnOnHit = false;
    let freezeOnHit = false;
    let poisonOnHit = false;

    for (const r of player.relics) {
      if (r.modifiers.damageMultiplier) damageMult *= r.modifiers.damageMultiplier;
      if (r.modifiers.moveSpeedMultiplier) speedMult *= r.modifiers.moveSpeedMultiplier;
      if (r.modifiers.attackCooldownMultiplier) cooldownMult *= r.modifiers.attackCooldownMultiplier;
      if (r.modifiers.skillCooldownMultiplier) skillCdMult *= r.modifiers.skillCooldownMultiplier;
      if (r.modifiers.bulletBouncesBonus) bouncesBonus += r.modifiers.bulletBouncesBonus;
      if (r.modifiers.bulletCountBonus) countBonus += r.modifiers.bulletCountBonus;
      if (r.modifiers.critChanceBonus) critBonus += r.modifiers.critChanceBonus;
      if (r.modifiers.lifestealPct) lifestealPct += r.modifiers.lifestealPct;
      if (r.modifiers.goldMultiplier) goldMultiplier *= r.modifiers.goldMultiplier;
      if (r.modifiers.chainLightning) chainLightning = true;
      if (r.modifiers.burnOnHit) burnOnHit = true;
      if (r.modifiers.freezeOnHit) freezeOnHit = true;
      if (r.modifiers.poisonOnHit) poisonOnHit = true;
    }

    return {
      ...base,
      attackDamage: Math.round(base.attackDamage * damageMult),
      moveSpeed: Math.round(base.moveSpeed * speedMult),
      attackCooldownMs: Math.max(95, Math.round(base.attackCooldownMs * cooldownMult)),
      skillCooldownMs: Math.max(1800, Math.round(base.skillCooldownMs * skillCdMult)),
      bulletBounces: base.bulletBounces + bouncesBonus,
      bulletCount: base.bulletCount + countBonus,
      critChance: Math.min(0.85, base.critChance + critBonus),
      lifestealPct,
      goldMultiplier,
      chainLightning,
      burnOnHit,
      freezeOnHit,
      poisonOnHit,
    };
  }

  private computeDoors(isCleared: boolean): Record<DoorDirection, DoorState> {
    const W = config.game.roomWidth;
    const H = config.game.roomHeight;
    const nextIsBoss =
      this.roomIndex + 1 === this.totalRooms ||
      (this.roomIndex + 1 > this.totalRooms && (this.roomIndex + 1) % 3 === 0);

    return {
      NORTH: {
        direction: 'NORTH',
        open: isCleared,
        targetRoomIndex: this.roomIndex + 1,
        encounterType: nextIsBoss ? 'BOSS' : 'STANDARD',
        label: nextIsBoss ? '⚔️ JEFE FINAL' : '⚔️ CÁMARA CENTRAL',
        x: W / 2 - 55,
        y: 10,
        width: 110,
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
        open: isCleared && !nextIsBoss,
        targetRoomIndex: this.roomIndex + 1,
        encounterType: 'ELITE',
        label: '💀 ÉLITE (2X BOTÍN)',
        x: W - 50,
        y: H / 2 - 55,
        width: 40,
        height: 110,
      },
      WEST: {
        direction: 'WEST',
        open: isCleared && !nextIsBoss,
        targetRoomIndex: this.roomIndex + 1,
        encounterType: 'SANCTUARY',
        label: '⚖️ SANTUARIO',
        x: 10,
        y: H / 2 - 55,
        width: 40,
        height: 110,
      },
    };
  }

  public getState(): GameWorldState {
    const isCleared = this.enemies.length === 0;
    const W = config.game.roomWidth;
    const H = config.game.roomHeight;
    const doors = this.computeDoors(isCleared);

    const humanIds = Object.values(this.players)
      .filter(p => !p.isBot)
      .map(p => p.id);
    const allHumansClaimed =
      humanIds.length > 0 && humanIds.every(id => this.chestClaimedBy.includes(id));

    const room: RoomState = {
      roomIndex: this.roomIndex,
      totalRooms: this.totalRooms,
      isBossRoom: this.encounterType === 'BOSS',
      encounterType: this.encounterType,
      mutation: this.currentMutation,
      isCleared,
      doors,
      chest:
        isCleared && this.chestRelics.length > 0
          ? {
              x: W / 2,
              y: H / 2,
              isOpen: allHumansClaimed,
              claimedByPlayerIds: this.chestClaimedBy,
              relicOptions: this.chestRelics,
            }
          : null,
      altar: isCleared ? this.altar : null,
      hearts: this.hearts,
      pillars: this.pillars,
      barrels: this.barrels,
      hazards: this.hazards,
      width: W,
      height: H,
    };

    const quantizedPlayers: Record<string, PlayerEntity> = {};
    for (const [id, p] of Object.entries(this.players)) {
      quantizedPlayers[id] = {
        ...p,
        x: Math.round(p.x),
        y: Math.round(p.y),
        vx: Math.round(p.vx),
        vy: Math.round(p.vy),
        angle: Math.round(p.angle * 100) / 100,
        reviveProgress: p.reviveProgress ? Math.round(p.reviveProgress * 100) / 100 : 0,
      };
    }

    const quantizedEnemies: EnemyEntity[] = this.enemies.map(e => ({
      ...e,
      x: Math.round(e.x),
      y: Math.round(e.y),
      vx: Math.round(e.vx),
      vy: Math.round(e.vy),
      aimAngle: typeof e.aimAngle === 'number' ? Math.round(e.aimAngle * 100) / 100 : undefined,
    }));

    const quantizedProjectiles: ProjectileEntity[] = this.projectiles.map(pr => ({
      ...pr,
      x: Math.round(pr.x),
      y: Math.round(pr.y),
      vx: Math.round(pr.vx),
      vy: Math.round(pr.vy),
    }));

    return {
      code: this.code,
      phase: this.phase,
      room,
      players: quantizedPlayers,
      enemies: quantizedEnemies,
      projectiles: quantizedProjectiles,
      recentEvents: this.recentEvents,
      directorDialogue: this.directorDialogue,
      directorAnger: Math.round(this.directorAnger),
      telemetry: this.telemetry,
    };
  }

  public getCompactTick() {
    const now = Date.now();
    const playersTick: Record<string, any> = {};
    for (const [id, p] of Object.entries(this.players)) {
      playersTick[id] = {
        x: Math.round(p.x),
        y: Math.round(p.y),
        vx: Math.round(p.vx),
        vy: Math.round(p.vy),
        angle: Math.round(p.angle * 100) / 100,
        currentHp: p.currentHp,
        maxHp: p.maxHp,
        shieldHp: p.shieldHp,
        isAlive: p.isAlive,
        isDashing: p.isDashing,
        dashCooldownEndsAt: p.dashCooldownEndsAt,
        dashEndsAt: p.dashEndsAt,
        skillCooldownEndsAt: p.skillCooldownEndsAt,
        skillActiveUntil: p.skillActiveUntil > now ? p.skillActiveUntil : 0,
        stealthedUntil: p.stealthedUntil > now ? p.stealthedUntil : 0,
        lastAttackAt: p.lastAttackAt,
        invulnerableUntil: p.invulnerableUntil > now ? p.invulnerableUntil : 0,
        kills: p.kills,
        damageDealt: p.damageDealt,
        gold: p.gold,
        weaponLevel: p.weaponLevel,
        combo: p.combo,
        maxCombo: p.maxCombo,
        ...(p.reviveProgress ? { reviveProgress: Math.round(p.reviveProgress * 100) / 100 } : {}),
      };
    }

    const enemiesTick = this.enemies.map(e => ({
      id: e.id,
      type: e.type,
      ...(e.isBoss ? { name: e.name, isBoss: true, bossPhase: e.bossPhase, bossPattern: e.bossPattern } : {}),
      x: Math.round(e.x),
      y: Math.round(e.y),
      vx: Math.round(e.vx),
      vy: Math.round(e.vy),
      radius: e.radius,
      currentHp: e.currentHp,
      maxHp: e.maxHp,
      color: e.color,
      aiState: e.aiState,
      ...(e.aiState === 'CHARGING' && typeof e.aimAngle === 'number'
        ? { aimAngle: Math.round(e.aimAngle * 100) / 100 }
        : {}),
      ...(e.flashUntil && e.flashUntil > now ? { flashUntil: e.flashUntil } : {}),
      ...(e.isElite ? { isElite: true, eliteModifier: e.eliteModifier } : {}),
      ...(e.burnUntil && e.burnUntil > now ? { burnUntil: e.burnUntil } : {}),
      ...(e.poisonUntil && e.poisonUntil > now ? { poisonUntil: e.poisonUntil } : {}),
      ...(e.chillUntil && e.chillUntil > now ? { chillUntil: e.chillUntil } : {}),
      ...(e.stunUntil && e.stunUntil > now ? { stunUntil: e.stunUntil } : {}),
    }));

    const projectilesTick = this.projectiles.map(pr => ({
      id: pr.id,
      fromPlayer: pr.fromPlayer,
      x: Math.round(pr.x),
      y: Math.round(pr.y),
      vx: Math.round(pr.vx),
      vy: Math.round(pr.vy),
      radius: pr.radius,
      color: pr.color,
      ...(pr.isExplosive ? { isExplosive: true } : {}),
      ...(pr.isCrit ? { isCrit: true } : {}),
      ...(pr.element && pr.element !== 'NONE' ? { element: pr.element } : {}),
    }));

    return {
      r: this.roomIndex,
      c: this.enemies.length === 0,
      p: playersTick,
      e: enemiesTick,
      pr: projectilesTick,
      h: this.hearts.map(ht => ({ ...ht, x: Math.round(ht.x), y: Math.round(ht.y) })),
      b: this.barrels.map(br => ({ ...br, x: Math.round(br.x), y: Math.round(br.y) })),
      hz: this.hazards.map(hz => ({ ...hz, x: Math.round(hz.x), y: Math.round(hz.y) })),
      ...(this.recentEvents.length > 0 ? { ev: this.recentEvents } : {}),
      da: Math.round(this.directorAnger),
      ...(now - this.directorDialogue.timestamp < 800 ? { dd: this.directorDialogue } : {}),
    };
  }

  public broadcastState(volatile = false): void {
    if (volatile && this.phase === 'PLAYING') {
      this.io.to(this.code).volatile.emit('world:tick', this.getCompactTick());
    } else {
      this.io.to(this.code).emit('world:state', this.getState());
    }
  }
}
