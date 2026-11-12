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
  SyncSeal,
  WallSegment,
  WorldEventFX,
} from '../types.js';
import { DungeonDirector } from '../ai/DungeonDirector.js';
import { MOCK_RELICS } from '../ai/mockDirector.js';

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
  public walls: WallSegment[] = [];
  public seals: SyncSeal[] = [];
  public currentWave = 1;
  public totalWaves = 1;
  public secretFound = false;
  public roomWidth = config.game.roomWidth;
  public roomHeight = config.game.roomHeight;
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
      x: this.roomWidth / 2 + (Object.keys(this.players).length * 48 - 72),
      y: this.roomHeight - 130,
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
      x: Math.max(60, Math.min(this.roomWidth - 60, x)),
      y: Math.max(60, Math.min(this.roomHeight - 60, y)),
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
      p.x = this.roomWidth / 2 + (idx * 45 - 65);
      p.y = this.roomHeight - 130;
      p.vx = 0;
      p.vy = 0;
    });

    await this.setupRoom(1, 'STANDARD');
    this.startLoop();
  }

  public isRoomCleared(): boolean {
    return this.enemies.length === 0 && this.currentWave >= this.totalWaves;
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
      // Boss battle every 3 levels (Room 3, 6, 9, 12...)
      const isBoss = index % 3 === 0;
      this.encounterType = isBoss ? 'BOSS' : encounterType;
      this.projectiles = [];
      this.hearts = [];
      this.recentEvents = [];
      this.chestClaimedBy = [];
      this.roomClearAnnounced = false;
      this.interventionTriggeredInRoom = false;
      this.secretFound = false;
      this.currentWave = 1;
      this.totalWaves = isBoss || this.encounterType === 'SANCTUARY' ? 1 : index === 1 ? 2 : 3;
      this.lastClientSyncAt = {};

      // Dynamic room dimensions: Huge labyrinths for exploration, focused arenas for Bosses
      if (isBoss) {
        this.roomWidth = 1650;
        this.roomHeight = 1150;
      } else if (this.encounterType === 'SANCTUARY') {
        this.roomWidth = 1550;
        this.roomHeight = 1080;
      } else {
        this.roomWidth = config.game.roomWidth; // 2000
        this.roomHeight = config.game.roomHeight; // 1450
      }

      const W = this.roomWidth;
      const H = this.roomHeight;

      // Immediately move players away from doors before any async work!
      Object.values(this.players).forEach((p, idx) => {
        p.x = W / 2 + (idx * 44 - 66);
        p.y = H - 130;
        p.vx = 0;
        p.vy = 0;
      });

      const roomData = await this.director.getRoomData(index, this.totalRooms);
      this.currentMutation = {
        ...roomData.mutation,
        encounterType: this.encounterType,
      };
      this.chestRelics = roomData.relics;

      // 1. Setup Labyrinth Walls, Secret Chamber & Co-op Runic Seals
      this.generateLabyrinthLayout(index, isBoss, this.encounterType);

      // 2. Setup Physical Gothic Stone Pillars
      this.pillars = isBoss
        ? [
            { id: 'pil_1', x: W * 0.24, y: H * 0.32, radius: 26 },
            { id: 'pil_2', x: W * 0.76, y: H * 0.32, radius: 26 },
            { id: 'pil_3', x: W * 0.24, y: H * 0.7, radius: 26 },
            { id: 'pil_4', x: W * 0.76, y: H * 0.7, radius: 26 },
          ]
        : [
            { id: 'pil_1', x: W * 0.2, y: H * 0.26, radius: 25 },
            { id: 'pil_2', x: W * 0.8, y: H * 0.26, radius: 25 },
            { id: 'pil_3', x: W * 0.2, y: H * 0.74, radius: 25 },
            { id: 'pil_4', x: W * 0.8, y: H * 0.74, radius: 25 },
            { id: 'pil_5', x: W * 0.38, y: H * 0.5, radius: 22 },
            { id: 'pil_6', x: W * 0.62, y: H * 0.5, radius: 22 },
          ];

      // 3. Setup Interactive Barrels across sectors (Explosive, Frost, Toxic)
      this.barrels = [];
      const barrelTypes: Array<'EXPLOSIVE' | 'FROST' | 'TOXIC'> = ['EXPLOSIVE', 'FROST', 'TOXIC'];
      const barrelPositions = [
        { x: W * 0.33, y: H * 0.44 },
        { x: W * 0.67, y: H * 0.44 },
        { x: W * 0.5, y: H * 0.26 },
        { x: W * 0.16, y: H * 0.52 },
        { x: W * 0.84, y: H * 0.52 },
      ];
      barrelPositions.forEach((pos, idx) => {
        if (idx < 3 || Math.random() < 0.8) {
          this.barrels.push({
            id: `barrel_${index}_${idx}`,
            x: pos.x + (Math.random() * 40 - 20),
            y: pos.y + (Math.random() * 30 - 15),
            radius: 18,
            type: barrelTypes[(index + idx) % barrelTypes.length],
          });
        }
      });

      // 4. Setup Environmental Hazards based on Mutation
      this.hazards = [];
      const now = Date.now();
      const hazType = this.currentMutation.hazardType;
      if (hazType === 'LAVA_PITS') {
        this.hazards.push(
          { id: 'haz_1', type: 'LAVA', x: W * 0.34, y: H * 0.36, radius: 56, active: true, createdAt: now, durationMs: 999999, damage: 12 },
          { id: 'haz_2', type: 'LAVA', x: W * 0.66, y: H * 0.36, radius: 56, active: true, createdAt: now, durationMs: 999999, damage: 12 },
          { id: 'haz_3', type: 'LAVA', x: W * 0.5, y: H * 0.62, radius: 50, active: true, createdAt: now, durationMs: 999999, damage: 12 },
          { id: 'haz_4', type: 'LAVA', x: W * 0.2, y: H * 0.52, radius: 48, active: true, createdAt: now, durationMs: 999999, damage: 12 },
          { id: 'haz_5', type: 'LAVA', x: W * 0.8, y: H * 0.52, radius: 48, active: true, createdAt: now, durationMs: 999999, damage: 12 }
        );
      } else if (hazType === 'POISON_SPORES') {
        this.hazards.push(
          { id: 'haz_1', type: 'POISON_CLOUD', x: W * 0.35, y: H * 0.48, radius: 60, active: true, createdAt: now, durationMs: 999999, damage: 9 },
          { id: 'haz_2', type: 'POISON_CLOUD', x: W * 0.65, y: H * 0.48, radius: 60, active: true, createdAt: now, durationMs: 999999, damage: 9 },
          { id: 'haz_3', type: 'POISON_CLOUD', x: W * 0.5, y: H * 0.28, radius: 54, active: true, createdAt: now, durationMs: 999999, damage: 9 }
        );
      } else if (hazType === 'SPIKE_TRAPS') {
        this.hazards.push(
          { id: 'spike_1', type: 'SPIKE_TRAP', x: W * 0.36, y: H * 0.36, radius: 38, active: false, createdAt: now, durationMs: 999999, damage: 18 },
          { id: 'spike_2', type: 'SPIKE_TRAP', x: W * 0.64, y: H * 0.36, radius: 38, active: false, createdAt: now, durationMs: 999999, damage: 18 },
          { id: 'spike_3', type: 'SPIKE_TRAP', x: W * 0.36, y: H * 0.64, radius: 38, active: false, createdAt: now, durationMs: 999999, damage: 18 },
          { id: 'spike_4', type: 'SPIKE_TRAP', x: W * 0.64, y: H * 0.64, radius: 38, active: false, createdAt: now, durationMs: 999999, damage: 18 }
        );
      }

      // 5. Setup Altar of Pacts & Armory
      const discount = this.encounterType === 'SANCTUARY' ? 0.65 : 1.0;
      this.altar = {
        x: W * 0.34,
        y: H * 0.52,
        pact: roomData.pact,
        weaponUpgradeCost: Math.round((35 + index * 15) * discount),
        healCost: Math.round(25 * discount),
        shieldCost: Math.round(30 * discount),
      };

      // 6. Reposition & Heal Players (Sanctuary gives +60% heal, normal gives +35%)
      const healRatio = this.encounterType === 'SANCTUARY' ? 0.6 : 0.35;
      Object.values(this.players).forEach((p, idx) => {
        p.x = W / 2 + (idx * 44 - 66);
        p.y = H - 130;
        p.vx = 0;
        p.vy = 0;
        p.isAlive = true;
        p.reviveProgress = 0;
        p.invulnerableUntil = Date.now() + 1400;
        p.currentHp = Math.min(p.maxHp, p.currentHp + Math.floor(p.maxHp * healRatio));
        if (this.encounterType === 'SANCTUARY') {
          p.shieldHp = Math.max(p.shieldHp, 30);
        }
      });

      this.directorDialogue = {
        speaker: 'Director del Calabozo',
        text:
          this.encounterType === 'ELITE'
            ? `¡LABERINTO ÉLITE MALDITO! ${this.currentMutation.directorRoast}`
            : this.encounterType === 'SANCTUARY'
            ? 'Un Santuario del Pacto... disfruten su breve respiro y gasten su oro antes de morir.'
            : this.currentMutation.directorRoast,
        mood: this.encounterType === 'ELITE' ? 'ANGRY' : 'MOCKING',
        timestamp: Date.now(),
      };

      if (isBoss) {
        this.currentWave = 1;
        this.totalWaves = 1;
        await this.spawnBoss();
      } else {
        this.currentWave = 1;
        this.totalWaves = this.encounterType === 'SANCTUARY' ? 1 : index === 1 ? 2 : 3;
        this.spawnEnemiesForRoom(index, this.encounterType, 1);
      }

      this.director.prefetchNextRoom(index + 1, this.totalRooms);
      this.broadcastState(false);
    } finally {
      this.isTransitioningRoom = false;
    }
  }

  /**
   * Generates interior Labyrinth stone walls, a Cracked Secret Wall leading to a hidden vault,
   * and Co-op Runic Synchronization Seals linked to the Central Eye!
   */
  private generateLabyrinthLayout(index: number, isBoss: boolean, encounterType: RoomEncounterType): void {
    this.walls = [];
    this.seals = [];
    if (isBoss) return;

    const W = this.roomWidth;
    const H = this.roomHeight;
    const layoutVariant = index % 3;

    if (encounterType !== 'SANCTUARY') {
      if (layoutVariant === 1) {
        // Variant 1: Twin Wing Bastions + North/South Choke Barriers
        this.walls.push(
          { id: `w_${index}_1`, x: Math.round(W * 0.28), y: Math.round(H * 0.24), width: 38, height: Math.round(H * 0.22) },
          { id: `w_${index}_2`, x: Math.round(W * 0.28), y: Math.round(H * 0.56), width: 38, height: Math.round(H * 0.21) },
          { id: `w_${index}_3`, x: Math.round(W * 0.72) - 38, y: Math.round(H * 0.24), width: 38, height: Math.round(H * 0.22) },
          { id: `w_${index}_4`, x: Math.round(W * 0.72) - 38, y: Math.round(H * 0.56), width: 38, height: Math.round(H * 0.21) },
          { id: `w_${index}_5`, x: Math.round(W * 0.41), y: Math.round(H * 0.23), width: Math.round(W * 0.18), height: 36 },
          { id: `w_${index}_6`, x: Math.round(W * 0.41), y: Math.round(H * 0.74), width: Math.round(W * 0.18), height: 36 }
        );
      } else if (layoutVariant === 2) {
        // Variant 2: Cross Labyrinth Corridors with Central Ritual Courtyard
        this.walls.push(
          { id: `w_${index}_1`, x: Math.round(W * 0.15), y: Math.round(H * 0.36), width: Math.round(W * 0.21), height: 36 },
          { id: `w_${index}_2`, x: Math.round(W * 0.64), y: Math.round(H * 0.36), width: Math.round(W * 0.21), height: 36 },
          { id: `w_${index}_3`, x: Math.round(W * 0.15), y: Math.round(H * 0.64), width: Math.round(W * 0.21), height: 36 },
          { id: `w_${index}_4`, x: Math.round(W * 0.64), y: Math.round(H * 0.64), width: Math.round(W * 0.21), height: 36 },
          { id: `w_${index}_5`, x: Math.round(W * 0.34), y: Math.round(H * 0.16), width: 36, height: Math.round(H * 0.16) },
          { id: `w_${index}_6`, x: Math.round(W * 0.66) - 36, y: Math.round(H * 0.16), width: 36, height: Math.round(H * 0.16) }
        );
      } else {
        // Variant 0: Fortress Zig-Zag Chambers
        this.walls.push(
          { id: `w_${index}_1`, x: Math.round(W * 0.25), y: Math.round(H * 0.32), width: Math.round(W * 0.16), height: 36 },
          { id: `w_${index}_2`, x: Math.round(W * 0.59), y: Math.round(H * 0.32), width: Math.round(W * 0.16), height: 36 },
          { id: `w_${index}_3`, x: Math.round(W * 0.25), y: Math.round(H * 0.66), width: Math.round(W * 0.16), height: 36 },
          { id: `w_${index}_4`, x: Math.round(W * 0.59), y: Math.round(H * 0.66), width: Math.round(W * 0.16), height: 36 },
          { id: `w_${index}_5`, x: Math.round(W * 0.25), y: Math.round(H * 0.32), width: 36, height: Math.round(H * 0.18) },
          { id: `w_${index}_6`, x: Math.round(W * 0.75) - 36, y: Math.round(H * 0.5), width: 36, height: Math.round(H * 0.18) }
        );
      }

      // Secret Room (Sala Oculta) in Top-Left or Top-Right corner behind a destructible runic wall!
      const secretOnRight = index % 2 === 0;
      if (secretOnRight) {
        // Top-Right Secret Vault (x: W - 360 .. W - 40, y: 40 .. 330)
        this.walls.push(
          { id: `sec_solid_${index}`, x: W - 360, y: 42, width: 36, height: 155 },
          {
            id: `sec_door_${index}`,
            x: W - 360,
            y: 197,
            width: 36,
            height: 135,
            isSecretWall: true,
            hp: 65,
            maxHp: 65,
            isOpen: false,
          },
          { id: `sec_bot_${index}`, x: W - 360, y: 332, width: 318, height: 36 }
        );
      } else {
        // Top-Left Secret Vault (x: 40 .. 360, y: 40 .. 330)
        this.walls.push(
          { id: `sec_solid_${index}`, x: 324, y: 42, width: 36, height: 155 },
          {
            id: `sec_door_${index}`,
            x: 324,
            y: 197,
            width: 36,
            height: 135,
            isSecretWall: true,
            hp: 65,
            maxHp: 65,
            isOpen: false,
          },
          { id: `sec_bot_${index}`, x: 42, y: 332, width: 318, height: 36 }
        );
      }

      // Co-op Runic Synchronization Seals (linked to the Central Eye)
      this.seals = [
        {
          id: `seal_${index}_L`,
          x: Math.round(W * 0.17),
          y: Math.round(H * 0.5),
          radius: 52,
          progress: 0,
          isActivated: false,
          label: 'SELLO OESTE',
        },
        {
          id: `seal_${index}_R`,
          x: Math.round(W * 0.83),
          y: Math.round(H * 0.5),
          radius: 52,
          progress: 0,
          isActivated: false,
          label: 'SELLO ESTE',
        },
      ];

      if (index >= 4) {
        this.seals.push({
          id: `seal_${index}_N`,
          x: Math.round(W * 0.5),
          y: Math.round(H * 0.16),
          radius: 52,
          progress: 0,
          isActivated: false,
          label: 'SELLO NORTE',
        });
      }
    }
  }

  private spawnEnemiesForRoom(index: number, encounterType: RoomEncounterType, wave = 1): void {
    if (wave === 1) {
      this.enemies = [];
    }
    const playerCount = Math.max(1, Object.keys(this.players).length);
    const coopHpScale = 1 + (playerCount - 1) * 0.25;
    const eliteRoomMult = encounterType === 'ELITE' ? 1.3 : 1.0;

    let types: EnemyType[] = [];
    if (encounterType === 'SANCTUARY') {
      types = ['SLIME', 'ESQUELETO', 'ESPIRITU', 'GOLEM'];
    } else if (index === 1) {
      types =
        wave === 1
          ? ['SLIME', 'SLIME', 'MURCIELAGO', 'KAMIKAZE', 'ESQUELETO']
          : ['ARANA', 'ESPIRITU', 'SLIME', 'MURCIELAGO', 'KAMIKAZE', 'MIMICO'];
    } else if (index === 2) {
      types =
        wave === 1
          ? ['SLIME', 'ESQUELETO', 'ARANA', 'KAMIKAZE', 'ESPIRITU', 'MURCIELAGO']
          : wave === 2
          ? ['GOLEM', 'CENTINELA', 'ARANA', 'KAMIKAZE', 'ESQUELETO', 'ESPIRITU']
          : ['NIGROMANTE', 'CENTINELA', 'MIMICO', 'GOLEM', 'KAMIKAZE', 'ARANA'];
    } else if (index <= 5) {
      types =
        wave === 1
          ? ['GOLEM', 'ARANA', 'ARANA', 'ESPIRITU', 'KAMIKAZE', 'KAMIKAZE', 'ESQUELETO']
          : wave === 2
          ? ['NIGROMANTE', 'CENTINELA', 'ESPIRITU', 'ARANA', 'SLIME', 'KAMIKAZE', 'MURCIELAGO']
          : ['GOLEM', 'NIGROMANTE', 'CENTINELA', 'MIMICO', 'ARANA', 'KAMIKAZE', 'ESPIRITU'];
    } else {
      types =
        wave === 1
          ? ['NIGROMANTE', 'CENTINELA', 'GOLEM', 'ARANA', 'ARANA', 'KAMIKAZE', 'KAMIKAZE', 'ESPIRITU']
          : wave === 2
          ? ['CENTINELA', 'CENTINELA', 'NIGROMANTE', 'MIMICO', 'GOLEM', 'ARANA', 'KAMIKAZE', 'ESPIRITU']
          : ['GOLEM', 'GOLEM', 'NIGROMANTE', 'CENTINELA', 'MIMICO', 'ARANA', 'KAMIKAZE', 'KAMIKAZE', 'ESPIRITU'];
    }

    const W = this.roomWidth;
    const H = this.roomHeight;
    const spawnSectors = [
      { x: W * 0.18, y: H * 0.25 },
      { x: W * 0.82, y: H * 0.25 },
      { x: W * 0.5, y: H * 0.22 },
      { x: W * 0.18, y: H * 0.62 },
      { x: W * 0.82, y: H * 0.62 },
      { x: W * 0.5, y: H * 0.44 },
    ];

    types.forEach((type, idx) => {
      const isElite =
        encounterType === 'ELITE' && (idx === 0 || idx === 1)
          ? true
          : (index >= 2 && wave >= 2 && idx === 0) || (index >= 4 && idx === 1 && Math.random() < 0.5);
      const sec = spawnSectors[(idx + wave) % spawnSectors.length];
      const spawnX = Math.max(120, Math.min(W - 120, sec.x + (Math.random() * 180 - 90)));
      const spawnY = Math.max(120, Math.min(H - 260, sec.y + (Math.random() * 140 - 70)));
      this.createEnemy(type, index, coopHpScale * eliteRoomMult, isElite, spawnX, spawnY);
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

    const x = customX ?? 160 + Math.random() * (this.roomWidth - 320);
    const y = customY ?? 130 + Math.random() * (this.roomHeight * 0.55);

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
      speed = 82 * speedMult;
      damage = 13 + Math.floor(roomIdx * 1.5);
      color = '#e2e8f0';
      name = 'Esqueleto Francotirador';
      cooldown = 2100;
    } else if (type === 'MURCIELAGO') {
      baseHp = 26 + roomIdx * 7;
      radius = 15;
      speed = 145 * speedMult;
      damage = 14 + roomIdx;
      color = '#991b1b';
      name = 'Murciélago Vampiro';
      cooldown = 1500;
    } else if (type === 'GOLEM') {
      baseHp = 95 + roomIdx * 22;
      radius = 30;
      speed = 65 * speedMult;
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
    } else if (type === 'ESPIRITU') {
      baseHp = 38 + roomIdx * 10;
      radius = 18;
      speed = 115 * speedMult;
      damage = 14 + roomIdx * 2;
      color = '#38bdf8';
      name = 'Espectro de Escarcha';
      cooldown = 1900;
    } else if (type === 'KAMIKAZE') {
      baseHp = 26 + roomIdx * 7;
      radius = 16;
      speed = 168 * speedMult;
      damage = 25 + roomIdx * 2;
      color = '#f97316';
      name = 'Diablillo Volátil';
      cooldown = 900;
    } else if (type === 'MIMICO') {
      baseHp = 78 + roomIdx * 18;
      radius = 23;
      speed = 148 * speedMult;
      damage = 22 + roomIdx * 2;
      color = '#d97706';
      name = 'Mímico Devorador';
      cooldown = 1200;
    } else if (type === 'ARANA') {
      baseHp = 44 + roomIdx * 11;
      radius = 19;
      speed = 134 * speedMult;
      damage = 15 + roomIdx * 2;
      color = '#84cc16';
      name = 'Viuda Tejedora Abisal';
      cooldown = 2000;
    } else if (type === 'CENTINELA') {
      baseHp = 58 + roomIdx * 14;
      radius = 21;
      speed = 76 * speedMult;
      damage = 17 + roomIdx * 2;
      color = '#c084fc';
      name = 'Ojo Centinela Arcano';
      cooldown = 2200;
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

    // Ensure ground enemies don't spawn inside an interior wall
    if (type !== 'ESPIRITU' && type !== 'MURCIELAGO') {
      this.resolveWallCollisions(enemy, enemy.radius + 4);
    }

    this.enemies.push(enemy);
    return enemy;
  }

  private async spawnBoss(): Promise<void> {
    this.enemies = [];
    const playerCount = Math.max(1, Object.keys(this.players).length);
    const tier = Math.floor((this.roomIndex - 1) / 3); // 0 at Room 3, 1 at Room 6, 2 at Room 9...
    const scale = (1 + (playerCount - 1) * 0.32) * (1 + tier * 0.35);

    const bossCycle = this.roomIndex % 9;
    let bossType: EnemyType = 'BOSS_DIRECTOR';
    let bossName = 'El Gran Arquitecto del Abismo';
    let introQuote = '¡Llegaron al final del contrato! ¡Contemplen la furia del Algoritmo Central!';
    let bossColor = '#b91c1c';
    let baseBossHp = 22000;

    if (bossCycle === 3) {
      bossType = 'BOSS_TITAN';
      bossName = 'Ignis-Vulcan, Coloso de Magma y Cadenas';
      introQuote = '¡MIS CADENAS FUNDIRÁN SUS ARMADURAS! ¡EL PISO ES MI FRAGUA!';
      bossColor = '#ea580c';
      baseBossHp = 13500;
    } else if (bossCycle === 6) {
      bossType = 'BOSS_ARACHNID';
      bossName = 'Aracne-Nyx, Reina Tejedora del Vórtice';
      introQuote = '¡Bienvenidos a mi nido de seda y veneno! ¡Mis crías devorarán sus huesos!';
      bossColor = '#65a30d';
      baseBossHp = 17500;
    } else {
      const bossData = await this.director.getBossAdaptation(this.telemetry);
      bossName = bossData.bossName;
      introQuote = bossData.introQuote;
    }

    this.directorDialogue = {
      speaker: bossName,
      text: introQuote,
      mood: 'ANGRY',
      timestamp: Date.now(),
    };

    // Place 2 Runic Disruption Seals in the Boss Arena (initially dormant; they unlock during Boss Shield Phases!)
    const W = this.roomWidth;
    const H = this.roomHeight;
    this.seals = [
      {
        id: `boss_seal_${this.roomIndex}_L`,
        x: Math.round(W * 0.18),
        y: Math.round(H * 0.54),
        radius: 54,
        progress: 1,
        isActivated: true,
      },
      {
        id: `boss_seal_${this.roomIndex}_R`,
        x: Math.round(W * 0.82),
        y: Math.round(H * 0.54),
        radius: 54,
        progress: 1,
        isActivated: true,
      },
    ];

    const bossHp = Math.round(baseBossHp * scale);
    this.enemies.push({
      id: `boss_${bossType}_${this.roomIndex}`,
      type: bossType,
      name: bossName,
      x: this.roomWidth / 2,
      y: 250,
      vx: 0,
      vy: 0,
      radius: 58,
      currentHp: bossHp,
      maxHp: bossHp,
      speed: 102 * this.currentMutation.enemySpeedMultiplier,
      damage: 24 + tier * 4,
      color: bossColor,
      lastAttackAt: Date.now(),
      attackCooldownMs: 1200,
      stateTimer: 0,
      isBoss: true,
      bossPhase: 1,
      bossShieldActive: false,
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
      if (dist < 380) {
        const W = this.roomWidth;
        const H = this.roomHeight;
        player.x = Math.max(32, Math.min(W - 32, input.x));
        player.y = Math.max(32, Math.min(H - 32, input.y));
        this.resolveWallCollisions(player, 18);
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
    const W = this.roomWidth;
    const H = this.roomHeight;

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
      });

      const shockDamage = Math.round(stats.attackDamage * 1.45);
      for (const w of this.walls) {
        if (w.isSecretWall && !w.isOpen) {
          const cx = w.x + w.width / 2;
          const cy = w.y + w.height / 2;
          if (Math.hypot(cx - player.x, cy - player.y) <= 210) {
            this.damageSecretWall(w, shockDamage * 2, now);
          }
        }
      }
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
        type: 'SHOCKWAVE',
        x: player.x,
        y: player.y,
        radius: 90,
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
        type: 'SHOCKWAVE',
        x: player.x,
        y: player.y,
        radius: 65,
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
        type: 'SHOCKWAVE',
        x: player.x,
        y: player.y,
        radius: 75,
        color: '#facc15',
      });
    } else if (action === 'BUY_HEAL') {
      if (player.gold < this.altar.healCost || player.currentHp >= player.maxHp) return;
      player.gold -= this.altar.healCost;
      player.currentHp = Math.min(player.maxHp, player.currentHp + 65);
      this.emitFX({
        type: 'REVIVE',
        x: player.x,
        y: player.y,
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
        this.createEnemy('GOLEM', this.roomIndex + 1, 1.2, true, this.roomWidth / 2, 220);
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
    const prevWave = this.currentWave;
    const prevSecret = this.secretFound;

    this.updateAIHerbBots(dt, now);
    this.updateHazards(dt, now);
    this.updateSyncSeals(dt, now);
    this.updatePlayers(dt, now);
    this.updateEnemies(dt, now);
    this.updateProjectiles(dt, now);
    this.checkLiveDirectorIntervention(now);
    this.checkRoomClearance();

    // Keep recent FX events for 220ms (~4-5 ticks) so packets stay tiny
    this.recentEvents = this.recentEvents.filter(ev => now - ev.timestamp < 220);

    const hasImportantChange =
      this.phase !== prevPhase ||
      this.roomClearAnnounced !== prevCleared ||
      this.currentWave !== prevWave ||
      this.secretFound !== prevSecret;

    this.broadcastState(!hasImportantChange);
  }

  /**
   * Resolves Circle-vs-AABB collision against closed interior Labyrinth Walls.
   */
  public resolveWallCollisions(entity: { x: number; y: number }, radius: number): boolean {
    let collided = false;
    for (const w of this.walls) {
      if (w.isOpen) continue;
      const closestX = Math.max(w.x, Math.min(entity.x, w.x + w.width));
      const closestY = Math.max(w.y, Math.min(entity.y, w.y + w.height));
      const dx = entity.x - closestX;
      const dy = entity.y - closestY;
      const distSq = dx * dx + dy * dy;
      if (distSq < radius * radius) {
        collided = true;
        const dist = Math.sqrt(distSq);
        if (dist > 0.001) {
          const overlap = radius - dist;
          entity.x += (dx / dist) * overlap;
          entity.y += (dy / dist) * overlap;
        } else {
          const leftPen = entity.x - w.x;
          const rightPen = w.x + w.width - entity.x;
          const topPen = entity.y - w.y;
          const botPen = w.y + w.height - entity.y;
          const minPen = Math.min(leftPen, rightPen, topPen, botPen);
          if (minPen === leftPen) entity.x = w.x - radius;
          else if (minPen === rightPen) entity.x = w.x + w.width + radius;
          else if (minPen === topPen) entity.y = w.y - radius;
          else entity.y = w.y + w.height + radius;
        }
      }
    }
    return collided;
  }

  /**
   * Damages a Cracked Secret Wall and unlocks the Secret Vault with Mythic Rewards when shattered!
   */
  private damageSecretWall(w: WallSegment, damage: number, now: number): void {
    if (!w.isSecretWall || w.isOpen) return;
    w.hp = Math.max(0, (w.hp ?? 65) - damage);
    if (w.hp <= 0) {
      w.isOpen = true;
      this.secretFound = true;
      const cx = w.x + w.width / 2;
      const cy = w.y + w.height / 2;

      this.emitFX({
        type: 'SHOCKWAVE',
        x: cx,
        y: cy,
        radius: 210,
        color: '#facc15',
      });

      this.directorDialogue = {
        speaker: 'Director del Calabozo',
        text: '¡¿QUÉ?! ¡Esa pared no estaba en el presupuesto! ¡Dejen de saquear mi bóveda privada!',
        mood: 'SURPRISED',
        timestamp: now,
      };

      // Spawn Mythic Treasure Cache inside the secret chamber
      const vaultX = cx < this.roomWidth / 2 ? 180 : this.roomWidth - 180;
      const vaultY = 185;

      for (let i = 0; i < 5; i++) {
        this.hearts.push({
          id: `sec_gold_${this.nextHeartId++}`,
          type: 'GOLD',
          x: vaultX + (Math.random() * 110 - 55),
          y: vaultY + (Math.random() * 90 - 45),
          healAmount: 45 + this.roomIndex * 10,
          createdAt: now,
        });
      }
      this.hearts.push(
        {
          id: `sec_sh_${this.nextHeartId++}`,
          type: 'SHIELD_ORB',
          x: vaultX - 35,
          y: vaultY,
          healAmount: 50,
          createdAt: now,
        },
        {
          id: `sec_fr_${this.nextHeartId++}`,
          type: 'FRENZY_ORB',
          x: vaultX + 35,
          y: vaultY,
          healAmount: 1,
          createdAt: now,
        },
        {
          id: `sec_hp_${this.nextHeartId++}`,
          type: 'HEART',
          x: vaultX,
          y: vaultY - 30,
          healAmount: 50,
          createdAt: now,
        }
      );

      // Grant every player a Mythic Relic from the secret vault!
      const mythicPool = MOCK_RELICS.filter(r => r.rarity === 'MYTHIC');
      const chosenMythic =
        mythicPool.length > 0
          ? mythicPool[(this.roomIndex + Math.floor(Math.random() * mythicPool.length)) % mythicPool.length]
          : MOCK_RELICS[0];

      for (const p of Object.values(this.players)) {
        if (!p.relics.some(r => r.id === chosenMythic.id)) {
          p.relics.push(chosenMythic);
          if (chosenMythic.modifiers.maxHpBonus) {
            p.maxHp += chosenMythic.modifiers.maxHpBonus;
            p.currentHp = Math.min(p.maxHp, p.currentHp + chosenMythic.modifiers.maxHpBonus);
          }
        }
        p.shieldHp = Math.min(100, p.shieldHp + 40);
      }

      // Also spawn a surprise Mimic guardian inside the vault if combat is active!
      if (!this.isRoomCleared()) {
        const mimic = this.createEnemy('MIMICO', this.roomIndex, 1.1, true, vaultX, vaultY + 25);
        mimic.aiState = 'ATTACKING';
      }
    }
  }

  /**
   * Updates Co-op Runic Synchronization Seals connected to the Central Eye.
   * Standing on seals charges them (2.4x faster when multiple teammates synchronize!).
   * Completing all seals unleashes an Arcane Overload from the Central Eye!
   */
  private updateSyncSeals(dt: number, now: number): void {
    if (this.seals.length === 0) return;

    const alivePlayers = Object.values(this.players).filter(p => p.isAlive);
    if (alivePlayers.length === 0) return;

    const unactivated = this.seals.filter(s => !s.isActivated);
    if (unactivated.length === 0) return;

    // Count how many seals currently have at least one hero standing on them
    let activeOccupiedSeals = 0;
    for (const s of unactivated) {
      const hasPlayer = alivePlayers.some(p => Math.hypot(p.x - s.x, p.y - s.y) <= s.radius + 24);
      if (hasPlayer) activeOccupiedSeals++;
    }

    const isCoopSync = activeOccupiedSeals >= 2 || (alivePlayers.length === 1 && activeOccupiedSeals === 1);
    const chargeRate = isCoopSync ? 0.58 : 0.32; // ~1.7s with sync, ~3.1s solo

    for (const s of unactivated) {
      const capturer = alivePlayers.find(p => Math.hypot(p.x - s.x, p.y - s.y) <= s.radius + 24);
      if (capturer) {
        s.progress = Math.min(1, s.progress + chargeRate * dt);
        if (s.progress >= 1) {
          s.isActivated = true;
          s.progress = 1;
          capturer.shieldHp = Math.min(100, capturer.shieldHp + 25);
          this.emitFX({
            type: 'SHOCKWAVE',
            x: s.x,
            y: s.y,
            radius: 135,
            color: '#38bdf8',
          });
        }
      } else {
        s.progress = Math.max(0, s.progress - 0.06 * dt);
      }
    }

    // Check if ALL seals were just completed!
    if (this.seals.every(s => s.isActivated)) {
      const cx = this.roomWidth / 2;
      const cy = this.roomHeight / 2;
      this.emitFX({
        type: 'DIRECTOR_INTERVENTION',
        x: cx,
        y: cy,
        radius: 320,
        color: '#22c55e',
      });

      for (const p of alivePlayers) {
        p.shieldHp = Math.min(100, p.shieldHp + 45);
        p.currentHp = Math.min(p.maxHp, p.currentHp + 35);
        p.combo += 10;
        p.maxCombo = Math.max(p.maxCombo, p.combo);
        p.comboExpiresAt = now + 7000;
      }

      // If a Boss is shielded, synchronizing the seals shatters the Boss Shield and destroys tethered minions!
      for (let i = this.enemies.length - 1; i >= 0; i--) {
        const e = this.enemies[i];
        if (e.isBoss && e.bossShieldActive) {
          e.bossShieldActive = false;
          e.stunUntil = now + 3600;
          this.emitFX({
            type: 'SHOCKWAVE',
            x: e.x,
            y: e.y,
            radius: 260,
            color: '#38bdf8',
          });
        }
      }

      // Blast all active enemies with the Central Eye's overload!
      for (let i = this.enemies.length - 1; i >= 0; i--) {
        const e = this.enemies[i];
        e.stunUntil = Math.max(e.stunUntil || 0, now + 2600);
        const eyeDmg = e.isBoss ? Math.round(e.maxHp * 0.08) : Math.max(45, Math.round(e.maxHp * 0.42));
        this.applyDamageToEnemy(e, i, eyeDmg, alivePlayers[0], true, 'LIGHTNING', now);
      }
    }
  }

  /**
   * Autonomous AI Companion Heroes (fight, dodge, revive fallen humans, synchronize seals, use skills, loot).
   */
  private updateAIHerbBots(dt: number, now: number): void {
    const bots = Object.values(this.players).filter(p => p.isBot && p.isAlive);
    if (bots.length === 0) return;

    const fallenAllies = Object.values(this.players).filter(p => !p.isAlive);
    const aliveHumans = Object.values(this.players).filter(p => !p.isBot && p.isAlive);
    const pendingSeals = this.seals.filter(s => !s.isActivated);

    for (const bot of bots) {
      // Bot auto-claims relic when room cleared
      if (this.isRoomCleared() && this.chestRelics.length > 0 && !this.chestClaimedBy.includes(bot.id)) {
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

      // Priority 2: Synchronize Co-op Runic Seals if any are unactivated and no enemy is right on top of the bot!
      if (pendingSeals.length > 0) {
        const targetSeal = pendingSeals[0];
        const distToSeal = Math.hypot(targetSeal.x - bot.x, targetSeal.y - bot.y);
        const closestEnemy = this.enemies.reduce<{ e: EnemyEntity | null; d: number }>(
          (acc, cur) => {
            const d = Math.hypot(cur.x - bot.x, cur.y - bot.y);
            return d < acc.d ? { e: cur, d } : acc;
          },
          { e: null, d: Infinity }
        );

        if (distToSeal > 24 || closestEnemy.d > 140) {
          const moveAngle = Math.atan2(targetSeal.y - bot.y, targetSeal.x - bot.x);
          const aimAngle = closestEnemy.e
            ? Math.atan2(closestEnemy.e.y - bot.y, closestEnemy.e.x - bot.x)
            : moveAngle;
          this.handlePlayerInput(bot.id, {
            moveX: distToSeal > 22 ? Math.cos(moveAngle) : 0,
            moveY: distToSeal > 22 ? Math.sin(moveAngle) : 0,
            angle: aimAngle,
            isAttacking: this.enemies.length > 0,
            isDashing: distToSeal > 240 && now >= bot.dashCooldownEndsAt,
            isUsingSkill: closestEnemy.d < 250 && now >= bot.skillCooldownEndsAt,
          });
          continue;
        }
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
      const cx = this.roomWidth / 2;
      const cy = this.roomHeight / 2;
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
    const W = this.roomWidth;
    const H = this.roomHeight;
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

      // Labyrinth interior wall collision
      this.resolveWallCollisions(p, 18);

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
      const isCleared = this.isRoomCleared();
      const doors = this.computeDoors(isCleared);

      if (p.y <= pad + 10 && isCleared && doors.NORTH.open && Math.abs(p.x - W / 2) < 82) {
        this.advanceToNextRoom(doors.NORTH.encounterType || 'STANDARD');
        return;
      }
      if (p.y < pad) {
        p.y = pad;
        p.vy = 0;
      }
      if (p.y > H - pad) {
        p.y = H - pad;
        p.vy = 0;
      }
      if (p.x <= pad + 10 && isCleared && doors.WEST.open && Math.abs(p.y - H / 2) < 82) {
        this.advanceToNextRoom(doors.WEST.encounterType || 'SANCTUARY');
        return;
      }
      if (p.x < pad) {
        p.x = pad;
        p.vx = 0;
      }
      if (p.x >= W - pad - 10 && isCleared && doors.EAST.open && Math.abs(p.y - H / 2) < 82) {
        this.advanceToNextRoom(doors.EAST.encounterType || 'ELITE');
        return;
      }
      if (p.x > W - pad) {
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
      } else if (e.type === 'ESPIRITU') {
        // ESPIRITU: Frost Wraith that phases through walls and fires twin freezing bolts!
        e.stateTimer = (e.stateTimer || 0) + dt * 1000;
        const cycle = e.stateTimer % e.attackCooldownMs;
        if (cycle > e.attackCooldownMs - 550) {
          e.aiState = 'CHARGING';
          e.aimAngle = angleToTarget;
          e.vx *= 0.4;
          e.vy *= 0.4;
          if (now - e.lastAttackAt >= e.attackCooldownMs) {
            e.lastAttackAt = now;
            for (let s = -1; s <= 1; s += 2) {
              const a = angleToTarget + s * 0.14;
              this.projectiles.push({
                id: `proj_${this.nextProjectileId++}`,
                ownerId: e.id,
                fromPlayer: false,
                x: e.x + Math.cos(a) * 20,
                y: e.y + Math.sin(a) * 20,
                vx: Math.cos(a) * 355,
                vy: Math.sin(a) * 355,
                radius: 7,
                damage: e.damage,
                color: '#38bdf8',
                bouncesRemaining: 0,
                createdAt: now,
                lifetimeMs: 2400,
                element: 'ICE',
              });
            }
          }
        } else {
          e.aiState = 'IDLE';
          const approach = minDist > 210 ? angleToTarget : angleToTarget + Math.PI / 3;
          e.vx = Math.cos(approach) * effSpeed;
          e.vy = Math.sin(approach) * effSpeed;
        }
      } else if (e.type === 'KAMIKAZE') {
        // KAMIKAZE: Volatile Magma Imp that sprints at players and explodes!
        e.stateTimer = (e.stateTimer || 0) + dt * 1000;
        e.aiState = minDist < 180 ? 'CHARGING' : 'ATTACKING';
        e.vx = Math.cos(angleToTarget) * effSpeed * (minDist < 160 ? 1.28 : 1.0);
        e.vy = Math.sin(angleToTarget) * effSpeed * (minDist < 160 ? 1.28 : 1.0);

        if (minDist < e.radius + 22) {
          e.currentHp = 0;
          this.emitFX({
            type: 'EXPLOSION',
            x: e.x,
            y: e.y,
            radius: 90,
            color: '#f97316',
          });
          for (const p of alivePlayers) {
            if (Math.hypot(p.x - e.x, p.y - e.y) <= 92) {
              this.damagePlayer(p, e.damage);
            }
          }
        }
      } else if (e.type === 'MIMICO') {
        // MIMICO: Disguised as a chest until approached, damaged, or few enemies remain!
        if (e.aiState === 'IDLE') {
          e.vx = 0;
          e.vy = 0;
          if (minDist < 230 || e.currentHp < e.maxHp || this.enemies.length <= 2) {
            e.aiState = 'ATTACKING';
            this.emitFX({
              type: 'SHOCKWAVE',
              x: e.x,
              y: e.y,
              radius: 75,
              color: '#f59e0b',
            });
          }
        } else {
          e.stateTimer = (e.stateTimer || 0) + dt * 1000;
          const cycle = e.stateTimer % 1200;
          if (cycle < 750) {
            e.aiState = 'ATTACKING';
            e.vx = Math.cos(angleToTarget) * effSpeed * 1.35;
            e.vy = Math.sin(angleToTarget) * effSpeed * 1.35;
          } else {
            e.aiState = 'CHARGING';
            e.vx *= 0.3;
            e.vy *= 0.3;
            if (now - e.lastAttackAt >= e.attackCooldownMs) {
              e.lastAttackAt = now;
              for (let s = -1; s <= 1; s++) {
                const a = angleToTarget + s * 0.25;
                this.projectiles.push({
                  id: `proj_${this.nextProjectileId++}`,
                  ownerId: e.id,
                  fromPlayer: false,
                  x: e.x + Math.cos(a) * 22,
                  y: e.y + Math.sin(a) * 22,
                  vx: Math.cos(a) * 340,
                  vy: Math.sin(a) * 340,
                  radius: 7,
                  damage: e.damage - 2,
                  color: '#facc15',
                  bouncesRemaining: 1,
                  createdAt: now,
                  lifetimeMs: 2000,
                });
              }
            }
          }
          if (minDist < e.radius + 18) {
            this.damagePlayer(closestPlayer, e.damage);
          }
        }
      } else if (e.type === 'ARANA') {
        // ARANA: Venomous Weaver that skitters rapidly and spits toxic webs!
        e.stateTimer = (e.stateTimer || 0) + dt * 1000;
        const cycle = e.stateTimer % e.attackCooldownMs;
        if (cycle > e.attackCooldownMs - 500) {
          e.aiState = 'CHARGING';
          e.aimAngle = angleToTarget;
          e.vx *= 0.25;
          e.vy *= 0.25;
          if (now - e.lastAttackAt >= e.attackCooldownMs) {
            e.lastAttackAt = now;
            for (let s = -1; s <= 1; s++) {
              const a = angleToTarget + s * 0.24;
              this.projectiles.push({
                id: `proj_${this.nextProjectileId++}`,
                ownerId: e.id,
                fromPlayer: false,
                x: e.x + Math.cos(a) * 20,
                y: e.y + Math.sin(a) * 20,
                vx: Math.cos(a) * 365,
                vy: Math.sin(a) * 365,
                radius: 7,
                damage: e.damage,
                color: '#84cc16',
                bouncesRemaining: 0,
                createdAt: now,
                lifetimeMs: 2100,
                element: 'POISON',
              });
            }
            if (Math.random() < 0.35 && this.hazards.length < 10) {
              this.hazards.push({
                id: `web_${this.nextEventId++}`,
                type: 'POISON_CLOUD',
                x: e.x,
                y: e.y,
                radius: 44,
                active: true,
                createdAt: now,
                durationMs: 4800,
                damage: 8,
              });
            }
          }
        } else {
          e.aiState = 'ATTACKING';
          const weaveAngle = angleToTarget + Math.sin(e.stateTimer / 180) * 0.55;
          e.vx = Math.cos(weaveAngle) * effSpeed;
          e.vy = Math.sin(weaveAngle) * effSpeed;
          if (minDist < e.radius + 17) {
            this.damagePlayer(closestPlayer, e.damage);
          }
        }
      } else if (e.type === 'CENTINELA') {
        // CENTINELA: Arcane Sentinel Eye that fires high-speed laser beams!
        e.stateTimer = (e.stateTimer || 0) + dt * 1000;
        const cycle = e.stateTimer % e.attackCooldownMs;
        if (cycle > e.attackCooldownMs - 650) {
          e.aiState = 'CHARGING';
          e.aimAngle = angleToTarget;
          e.vx = 0;
          e.vy = 0;
          if (now - e.lastAttackAt >= e.attackCooldownMs) {
            e.lastAttackAt = now;
            this.projectiles.push({
              id: `proj_${this.nextProjectileId++}`,
              ownerId: e.id,
              fromPlayer: false,
              x: e.x + Math.cos(angleToTarget) * 24,
              y: e.y + Math.sin(angleToTarget) * 24,
              vx: Math.cos(angleToTarget) * 510,
              vy: Math.sin(angleToTarget) * 510,
              radius: 8,
              damage: e.damage + 2,
              color: '#e879f9',
              bouncesRemaining: 1,
              createdAt: now,
              lifetimeMs: 2400,
            });
          }
        } else {
          e.aiState = 'IDLE';
          if (minDist < 220) {
            e.vx = -Math.cos(angleToTarget) * effSpeed;
            e.vy = -Math.sin(angleToTarget) * effSpeed;
          } else if (minDist > 380) {
            e.vx = Math.cos(angleToTarget) * effSpeed;
            e.vy = Math.sin(angleToTarget) * effSpeed;
          } else {
            const orbit = angleToTarget - Math.PI / 2;
            e.vx = Math.cos(orbit) * effSpeed * 0.8;
            e.vy = Math.sin(orbit) * effSpeed * 0.8;
          }
        }
      } else if (e.isBoss) {
        this.updateBossAI(e, closestPlayer, angleToTarget, dt, now);
      }

      e.x += e.vx * dt;
      e.y += e.vy * dt;

      // Keep enemies inside room bounds and sliding around pillars & labyrinth walls
      const pad = 52;
      e.x = Math.max(pad, Math.min(this.roomWidth - pad, e.x));
      e.y = Math.max(pad, Math.min(this.roomHeight - pad, e.y));

      if (e.type !== 'ESPIRITU' && e.type !== 'MURCIELAGO' && !e.isBoss) {
        const hitWall = this.resolveWallCollisions(e, e.radius);
        if (hitWall) {
          // Help ground enemies steer smoothly around labyrinth wall corners toward players
          const tangentAngle = angleToTarget + (parseInt(e.id.slice(-1), 10) % 2 === 0 ? Math.PI / 2 : -Math.PI / 2);
          e.x += Math.cos(tangentAngle) * effSpeed * 0.65 * dt;
          e.y += Math.sin(tangentAngle) * effSpeed * 0.65 * dt;
        }
      }

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

    // Clean up any Kamikaze imps that self-destructed on contact
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      if (this.enemies[i].currentHp <= 0) {
        this.enemies.splice(i, 1);
      }
    }
  }

  /**
   * Multi-Phase, Multi-Pattern Adaptive Boss AI supporting 3 Distinct Boss Archetypes:
   * - 3 Phases (100% -> 68% -> 35% -> 0% HP) with tethered Ritual Pylon Immunity Shields & Co-op Disruption Seals
   * - 6 Distinct High-Skill Patterns: SPIRAL, LASER_SWEEP, CHARGE_SLAM, METEOR_RAIN, GRAVITY_VORTEX, CROSS_BARRAGE
   */
  private updateBossAI(
    e: EnemyEntity,
    target: PlayerEntity,
    angleToTarget: number,
    dt: number,
    now: number
  ): void {
    const W = this.roomWidth;
    const H = this.roomHeight;
    const hpRatio = e.currentHp / Math.max(1, e.maxHp);
    const currentPhase = e.bossPhase || 1;

    // Check if tethered Ritual Pylons were all destroyed to shatter Boss Shield!
    if (e.bossShieldActive) {
      const activeMinions = this.enemies.filter(other => !other.isBoss);
      if (activeMinions.length === 0) {
        e.bossShieldActive = false;
        e.stunUntil = now + 3600;
        for (const s of this.seals) {
          s.isActivated = true;
          s.progress = 1;
        }
        this.emitFX({
          type: 'SHOCKWAVE',
          x: e.x,
          y: e.y,
          radius: 290,
          color: '#38bdf8',
        });
      }
    }

    // Phase 2 Transition (at 68% HP) -> Activates Immunity Carapace + 3 Tethered Ritual Guardians + Co-op Seals
    if (hpRatio <= 0.68 && currentPhase < 2) {
      e.bossPhase = 2;
      e.bossShieldActive = true;
      for (const s of this.seals) {
        s.isActivated = false;
        s.progress = 0;
      }

      this.directorDialogue = {
        speaker: e.name,
        text:
          e.type === 'BOSS_TITAN'
            ? '¡FASE 2: CORAZA DE OBSIDIANA! ¡DESTRUYAN MIS CENTINELAS O SINCRONICEN LOS SELLOS SI PUEDEN!'
            : e.type === 'BOSS_ARACHNID'
            ? '¡FASE 2: CAPULLO ABISAL! ¡MIS GUARDIANES DE SEDA ALIMENTAN MI ESCUDO!'
            : '¡FASE 2: PROTOCOLO DE INMUNIDAD! ¡LOS PILONES ARCANOS SOSTIENEN MI BARRERA!',
        mood: 'ANGRY',
        timestamp: now,
      };
      this.emitFX({
        type: 'SHOCKWAVE',
        x: e.x,
        y: e.y,
        radius: 300,
        color: e.color,
      });

      const pylonSpots = [
        { x: Math.round(W * 0.25), y: Math.round(H * 0.36) },
        { x: Math.round(W * 0.75), y: Math.round(H * 0.36) },
        { x: Math.round(W * 0.5), y: Math.round(H * 0.66) },
      ];
      if (e.type === 'BOSS_TITAN') {
        this.createEnemy('CENTINELA', this.roomIndex, 1.15, false, pylonSpots[0].x, pylonSpots[0].y);
        this.createEnemy('CENTINELA', this.roomIndex, 1.15, false, pylonSpots[1].x, pylonSpots[1].y);
        this.createEnemy('GOLEM', this.roomIndex, 1.1, false, pylonSpots[2].x, pylonSpots[2].y);
      } else if (e.type === 'BOSS_ARACHNID') {
        this.createEnemy('ARANA', this.roomIndex, 1.2, false, pylonSpots[0].x, pylonSpots[0].y);
        this.createEnemy('ARANA', this.roomIndex, 1.2, false, pylonSpots[1].x, pylonSpots[1].y);
        this.createEnemy('CENTINELA', this.roomIndex, 1.15, false, pylonSpots[2].x, pylonSpots[2].y);
      } else {
        this.createEnemy('CENTINELA', this.roomIndex, 1.2, false, pylonSpots[0].x, pylonSpots[0].y);
        this.createEnemy('CENTINELA', this.roomIndex, 1.2, false, pylonSpots[1].x, pylonSpots[1].y);
        this.createEnemy('NIGROMANTE', this.roomIndex, 1.2, false, pylonSpots[2].x, pylonSpots[2].y);
      }
    }

    // Phase 3 Transition (at 35% HP) -> Final Cataclysm + Elite Ritual Guardians + Co-op Seals
    if (hpRatio <= 0.35 && currentPhase < 3) {
      e.bossPhase = 3;
      e.bossShieldActive = true;
      for (const s of this.seals) {
        s.isActivated = false;
        s.progress = 0;
      }

      this.directorDialogue = {
        speaker: e.name,
        text:
          e.type === 'BOSS_TITAN'
            ? '¡FASE 3: ERUPCIÓN DEL TÁRTARO! ¡LA FRAGUA ENTERA SE DERRUMBA SOBRE USTEDES!'
            : e.type === 'BOSS_ARACHNID'
            ? '¡FASE 3: FRENESÍ DE LA MATRIARCA! ¡EL VÓRTICE VENENOSO LOS TRAGARÁ!'
            : '¡FASE 3: SINGULARIDAD DEL ARQUITECTO! ¡BORRADO TOTAL DEL SISTEMA!',
        mood: 'CHAOTIC',
        timestamp: now,
      };
      this.emitFX({
        type: 'DIRECTOR_INTERVENTION',
        x: e.x,
        y: e.y,
        radius: 340,
        color: '#ef4444',
      });

      const pylonSpots = [
        { x: Math.round(W * 0.24), y: Math.round(H * 0.34) },
        { x: Math.round(W * 0.76), y: Math.round(H * 0.34) },
        { x: Math.round(W * 0.5), y: Math.round(H * 0.68) },
      ];
      if (e.type === 'BOSS_TITAN') {
        this.createEnemy('CENTINELA', this.roomIndex, 1.25, true, pylonSpots[0].x, pylonSpots[0].y);
        this.createEnemy('CENTINELA', this.roomIndex, 1.25, true, pylonSpots[1].x, pylonSpots[1].y);
        this.createEnemy('KAMIKAZE', this.roomIndex, 1.2, false, pylonSpots[2].x, pylonSpots[2].y);
      } else if (e.type === 'BOSS_ARACHNID') {
        this.createEnemy('CENTINELA', this.roomIndex, 1.25, true, pylonSpots[0].x, pylonSpots[0].y);
        this.createEnemy('ARANA', this.roomIndex, 1.25, true, pylonSpots[1].x, pylonSpots[1].y);
        this.createEnemy('ESPIRITU', this.roomIndex, 1.2, false, pylonSpots[2].x, pylonSpots[2].y);
      } else {
        this.createEnemy('CENTINELA', this.roomIndex, 1.3, true, pylonSpots[0].x, pylonSpots[0].y);
        this.createEnemy('CENTINELA', this.roomIndex, 1.3, true, pylonSpots[1].x, pylonSpots[1].y);
        this.createEnemy('ESPIRITU', this.roomIndex, 1.25, true, pylonSpots[2].x, pylonSpots[2].y);
      }
    }

    const phase = e.bossPhase || 1;
    e.stateTimer = (e.stateTimer || 0) + dt * 1000;
    const patternIndex = Math.floor(e.stateTimer / 4200) % 6;
    const patterns: Array<EnemyEntity['bossPattern']> = [
      'SPIRAL',
      'LASER_SWEEP',
      'CHARGE_SLAM',
      'METEOR_RAIN',
      'GRAVITY_VORTEX',
      'CROSS_BARRAGE',
    ];
    e.bossPattern = patterns[patternIndex];

    if (e.bossPattern === 'CHARGE_SLAM') {
      // Predatory high-speed lunge toward target player
      e.aiState = 'ATTACKING';
      const chargeMult = (e.type === 'BOSS_TITAN' ? 1.8 : 1.55) + (phase - 1) * 0.18;
      e.vx = Math.cos(angleToTarget) * e.speed * chargeMult;
      e.vy = Math.sin(angleToTarget) * e.speed * chargeMult;

      if (Math.hypot(target.x - e.x, target.y - e.y) < e.radius + 24) {
        this.damagePlayer(target, e.damage);
      }
    } else if (e.bossPattern === 'GRAVITY_VORTEX') {
      // Moves to center of the arena and pulls players inward!
      e.aiState = 'CHARGING';
      e.aimAngle = angleToTarget;
      const centerX = W / 2;
      const centerY = H * 0.44;
      e.vx = (centerX - e.x) * 1.6;
      e.vy = (centerY - e.y) * 1.6;

      for (const p of Object.values(this.players)) {
        if (!p.isAlive || p.isDashing) continue;
        const pullAngle = Math.atan2(e.y - p.y, e.x - p.x);
        const pullSpeed = 48 + phase * 12;
        p.x += Math.cos(pullAngle) * pullSpeed * dt;
        p.y += Math.sin(pullAngle) * pullSpeed * dt;
      }
    } else {
      // Figure-8 tactical arena weaving
      e.aiState = e.bossPattern === 'LASER_SWEEP' || e.bossPattern === 'CROSS_BARRAGE' ? 'CHARGING' : 'IDLE';
      e.aimAngle = angleToTarget;
      const centerX = W / 2 + Math.sin(now / 780) * 290;
      const centerY = 270 + Math.cos(now / 540) * 115;
      e.vx = (centerX - e.x) * 1.25;
      e.vy = (centerY - e.y) * 1.25;
    }

    const attackInterval = phase === 3 ? 740 : phase === 2 ? 940 : 1220;
    if (now - e.lastAttackAt >= attackInterval) {
      e.lastAttackAt = now;
      const projElement = e.type === 'BOSS_TITAN' ? 'FIRE' : e.type === 'BOSS_ARACHNID' ? 'POISON' : 'NONE';
      const primaryColor =
        e.type === 'BOSS_TITAN'
          ? '#f97316'
          : e.type === 'BOSS_ARACHNID'
          ? '#84cc16'
          : phase >= 2
          ? '#dc2626'
          : '#d97706';

      if (e.bossPattern === 'SPIRAL') {
        // Counter-rotating double spiral bullet-hell
        const arms = 8 + phase * 2;
        const bulletSpeed = 235 + phase * 28;
        for (let i = 0; i < arms; i++) {
          const cwAngle = (i / arms) * Math.PI * 2 + now / 290;
          this.projectiles.push({
            id: `proj_${this.nextProjectileId++}`,
            ownerId: e.id,
            fromPlayer: false,
            x: e.x + Math.cos(cwAngle) * 48,
            y: e.y + Math.sin(cwAngle) * 48,
            vx: Math.cos(cwAngle) * bulletSpeed,
            vy: Math.sin(cwAngle) * bulletSpeed,
            radius: 10,
            damage: e.damage,
            color: primaryColor,
            bouncesRemaining: phase >= 3 ? 1 : 0,
            createdAt: now,
            lifetimeMs: 3400,
            element: projElement,
          });

          if (phase >= 2) {
            const ccwAngle = (i / arms) * Math.PI * 2 - now / 340;
            this.projectiles.push({
              id: `proj_${this.nextProjectileId++}`,
              ownerId: e.id,
              fromPlayer: false,
              x: e.x + Math.cos(ccwAngle) * 48,
              y: e.y + Math.sin(ccwAngle) * 48,
              vx: Math.cos(ccwAngle) * (bulletSpeed * 0.82),
              vy: Math.sin(ccwAngle) * (bulletSpeed * 0.82),
              radius: 8,
              damage: e.damage - 2,
              color: '#facc15',
              bouncesRemaining: 0,
              createdAt: now,
              lifetimeMs: 3200,
              element: projElement,
            });
          }
        }
      } else if (e.bossPattern === 'CHARGE_SLAM') {
        // Radial shockwave burst + elemental trail pool
        const ringCount = 10 + phase * 2;
        for (let i = 0; i < ringCount; i++) {
          const shotAngle = (i / ringCount) * Math.PI * 2;
          this.projectiles.push({
            id: `proj_${this.nextProjectileId++}`,
            ownerId: e.id,
            fromPlayer: false,
            x: e.x + Math.cos(shotAngle) * 46,
            y: e.y + Math.sin(shotAngle) * 46,
            vx: Math.cos(shotAngle) * (250 + phase * 25),
            vy: Math.sin(shotAngle) * (250 + phase * 25),
            radius: 10,
            damage: e.damage,
            color: primaryColor,
            bouncesRemaining: phase >= 2 ? 1 : 0,
            createdAt: now,
            lifetimeMs: 3000,
            element: projElement,
          });
        }

        if (this.hazards.length < 14) {
          this.hazards.push({
            id: `boss_trail_${this.nextEventId++}`,
            type: e.type === 'BOSS_ARACHNID' ? 'POISON_CLOUD' : 'LAVA',
            x: e.x,
            y: e.y,
            radius: 58,
            active: true,
            createdAt: now,
            durationMs: 5500,
            damage: 14,
          });
        }
      } else if (e.bossPattern === 'METEOR_RAIN') {
        for (const p of Object.values(this.players)) {
          if (!p.isAlive) continue;
          const strikes = phase >= 2 ? 2 : 1;
          for (let k = 0; k < strikes; k++) {
            const offsetAngle = Math.random() * Math.PI * 2;
            const offsetDist = k === 0 ? Math.random() * 35 : 95 + Math.random() * 55;
            this.hazards.push({
              id: `meteor_${this.nextEventId++}`,
              type: e.type === 'BOSS_ARACHNID' ? 'POISON_CLOUD' : 'METEOR_STRIKE',
              x: Math.max(80, Math.min(W - 80, p.x + Math.cos(offsetAngle) * offsetDist)),
              y: Math.max(80, Math.min(H - 80, p.y + Math.sin(offsetAngle) * offsetDist)),
              radius: 68,
              active: true,
              createdAt: now,
              durationMs: e.type === 'BOSS_ARACHNID' ? 4500 : 1250,
              damage: e.type === 'BOSS_ARACHNID' ? 12 : e.damage + 4,
            });
          }
        }
      } else if (e.bossPattern === 'LASER_SWEEP') {
        const fanCount = phase >= 3 ? 7 : 5;
        const half = Math.floor(fanCount / 2);
        const sweepOffset = Math.sin(now / 260) * 0.28;
        for (let s = -half; s <= half; s++) {
          const a = angleToTarget + sweepOffset + s * 0.13;
          this.projectiles.push({
            id: `proj_${this.nextProjectileId++}`,
            ownerId: e.id,
            fromPlayer: false,
            x: e.x + Math.cos(a) * 46,
            y: e.y + Math.sin(a) * 46,
            vx: Math.cos(a) * (440 + phase * 30),
            vy: Math.sin(a) * (440 + phase * 30),
            radius: 9,
            damage: e.damage,
            color: e.type === 'BOSS_ARACHNID' ? '#a3e635' : '#ef4444',
            bouncesRemaining: 1,
            createdAt: now,
            lifetimeMs: 2600,
            element: projElement,
          });
        }
      } else if (e.bossPattern === 'GRAVITY_VORTEX') {
        // Expanding shockwave ring with safe dash gaps
        const totalSlots = 16;
        const gapStart = Math.floor(now / 400) % totalSlots;
        for (let i = 0; i < totalSlots; i++) {
          if (i === gapStart || i === (gapStart + 1) % totalSlots || i === (gapStart + 8) % totalSlots) continue;
          const a = (i / totalSlots) * Math.PI * 2;
          this.projectiles.push({
            id: `proj_${this.nextProjectileId++}`,
            ownerId: e.id,
            fromPlayer: false,
            x: e.x + Math.cos(a) * 50,
            y: e.y + Math.sin(a) * 50,
            vx: Math.cos(a) * (260 + phase * 22),
            vy: Math.sin(a) * (260 + phase * 22),
            radius: 10,
            damage: e.damage,
            color: '#c084fc',
            bouncesRemaining: 0,
            createdAt: now,
            lifetimeMs: 3200,
            element: projElement,
          });
        }
      } else if (e.bossPattern === 'CROSS_BARRAGE') {
        // 4-Arm / 8-Arm rotating cross blades + aimed lance at target
        const crossArms = phase >= 2 ? 8 : 4;
        const baseRot = now / 380;
        for (let c = 0; c < crossArms; c++) {
          const a = baseRot + (c / crossArms) * Math.PI * 2;
          for (let layer = 0; layer < 2; layer++) {
            const spd = (320 + layer * 85) + phase * 20;
            this.projectiles.push({
              id: `proj_${this.nextProjectileId++}`,
              ownerId: e.id,
              fromPlayer: false,
              x: e.x + Math.cos(a) * 44,
              y: e.y + Math.sin(a) * 44,
              vx: Math.cos(a) * spd,
              vy: Math.sin(a) * spd,
              radius: 9,
              damage: e.damage,
              color: primaryColor,
              bouncesRemaining: 1,
              createdAt: now,
              lifetimeMs: 2800,
              element: projElement,
            });
          }
        }
      }
    }
  }

  private updateProjectiles(dt: number, now: number): void {
    const W = this.roomWidth;
    const H = this.roomHeight;
    const pad = 42;

    const remaining: ProjectileEntity[] = [];

    for (const p of this.projectiles) {
      if (now - p.createdAt > p.lifetimeMs) continue;

      const prevX = p.x;
      const prevY = p.y;
      p.x += p.vx * dt;
      p.y += p.vy * dt;

      // 1. Outer Wall bounce or explode/destroy
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

      // 1b. Interior Labyrinth Walls & Destructible Secret Walls!
      if (!hitWall) {
        for (const w of this.walls) {
          if (w.isOpen) continue;
          if (
            p.x + p.radius > w.x &&
            p.x - p.radius < w.x + w.width &&
            p.y + p.radius > w.y &&
            p.y - p.radius < w.y + w.height
          ) {
            if (p.fromPlayer && w.isSecretWall) {
              this.damageSecretWall(w, p.damage, now);
              hitWall = true;
              break;
            }
            if (p.bouncesRemaining > 0) {
              const wasOutsideX = prevX + p.radius <= w.x || prevX - p.radius >= w.x + w.width;
              if (wasOutsideX) p.vx = -p.vx;
              else p.vy = -p.vy;
              p.bouncesRemaining--;
              p.x = prevX;
              p.y = prevY;
            } else {
              hitWall = true;
            }
            break;
          }
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
                type: 'SHOCKWAVE',
                x: pl.x,
                y: pl.y,
                radius: 48,
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

    // Explosions also shatter nearby Cracked Secret Walls!
    for (const w of this.walls) {
      if (w.isSecretWall && !w.isOpen) {
        const cx = w.x + w.width / 2;
        const cy = w.y + w.height / 2;
        if (Math.hypot(cx - x, cy - y) <= radius + 65) {
          this.damageSecretWall(w, damage * 1.5, now);
        }
      }
    }

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
    // Boss Ritual Shield Carapace reduces incoming damage by 88% until tethered Pylons or Co-op Seals are completed!
    if (e.isBoss && e.bossShieldActive) {
      finalDamage = Math.max(1, Math.round(finalDamage * 0.12));
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
        color: '#c084fc',
      });
    }

    // Apply new elemental status
    if (element === 'FIRE') e.burnUntil = now + 3200;
    else if (element === 'POISON') e.poisonUntil = now + 4000;
    else if (element === 'ICE') e.chillUntil = now + 3000;

    e.currentHp -= finalDamage;
    e.flashUntil = now + 95;
    if (e.type === 'MIMICO' && e.aiState === 'IDLE') {
      e.aiState = 'ATTACKING';
    }
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

      // Elite Explosivo or Kamikaze detonates on death
      if (e.eliteModifier === 'EXPLOSIVO' || e.type === 'KAMIKAZE') {
        this.emitFX({
          type: 'EXPLOSION',
          x: e.x,
          y: e.y,
          radius: 85,
          color: '#ef4444',
        });
        for (const p of Object.values(this.players)) {
          if (p.isAlive && Math.hypot(p.x - e.x, p.y - e.y) <= 85) {
            this.damagePlayer(p, Math.round(e.damage * 0.75));
          }
        }
      }

      // Large Slime splits into 2 Mini-Slimes!
      if (e.type === 'SLIME' && !e.isBoss && this.roomIndex >= 2) {
        this.createEnemy('MINI_SLIME', this.roomIndex, 0.85, false, e.x - 18, e.y);
        this.createEnemy('MINI_SLIME', this.roomIndex, 0.85, false, e.x + 18, e.y);
      }

      // Drop Gold Coins, Hearts, Shield Orbs, or Frenzy Orbs!
      const goldMult = owner ? this.getPlayerEffectiveStats(owner).goldMultiplier : 1;
      const comboBonus = owner && owner.combo >= 10 ? 1.4 : 1.0;
      const mimicMult = e.type === 'MIMICO' ? 3.0 : 1.0;
      const goldValue = Math.round((e.isElite ? 35 : 10 + this.roomIndex * 2) * goldMult * comboBonus * mimicMult);

      this.hearts.push({
        id: `gold_${this.nextHeartId++}`,
        type: 'GOLD',
        x: e.x + (Math.random() * 20 - 10),
        y: e.y + (Math.random() * 20 - 10),
        healAmount: goldValue,
        createdAt: now,
      });

      if (e.type === 'MIMICO') {
        this.hearts.push(
          {
            id: `mimic_sh_${this.nextHeartId++}`,
            type: 'SHIELD_ORB',
            x: e.x - 22,
            y: e.y,
            healAmount: 35,
            createdAt: now,
          },
          {
            id: `mimic_fr_${this.nextHeartId++}`,
            type: 'FRENZY_ORB',
            x: e.x + 22,
            y: e.y,
            healAmount: 1,
            createdAt: now,
          }
        );
      }

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
    if (this.enemies.length === 0 && this.phase === 'PLAYING') {
      // Multi-Wave Progression: if more waves remain in this labyrinth level, spawn the next wave!
      if (this.currentWave < this.totalWaves) {
        this.currentWave++;
        this.spawnEnemiesForRoom(this.roomIndex, this.encounterType, this.currentWave);
        for (const p of Object.values(this.players)) {
          if (p.isAlive) {
            p.currentHp = Math.min(p.maxHp, p.currentHp + 18);
          }
        }
        this.emitFX({
          type: 'DIRECTOR_INTERVENTION',
          x: this.roomWidth / 2,
          y: this.roomHeight / 2,
          radius: 220,
          color: '#f59e0b',
        });
        return;
      }

      if (!this.roomClearAnnounced) {
        this.roomClearAnnounced = true;
        // Guarantee all Synchronization Seals lock to 100% activated when the room is cleared!
        for (const s of this.seals) {
          s.isActivated = true;
          s.progress = 1;
        }

        const isFinalBoss =
          this.roomIndex >= this.totalRooms && this.roomIndex % 3 === 0;
        const isMidBoss =
          this.roomIndex < this.totalRooms && this.roomIndex % 3 === 0;

        if (isFinalBoss) {
          this.phase = 'VICTORY';
          this.director.assignPlayerTitles(this.players);
          this.directorDialogue = {
            speaker: 'Director del Calabozo',
            text: '¡INCREÍBLE! Han derrotado al guardián del piso. ¿Cobran su victoria o descienden al Abismo Infinito?',
            mood: 'SURPRISED',
            timestamp: Date.now(),
          };
        } else if (isMidBoss) {
          for (const p of Object.values(this.players)) {
            p.gold += 85;
            p.shieldHp = Math.min(100, p.shieldHp + 45);
          }
          this.directorDialogue = {
            speaker: 'Director del Calabozo',
            text: '¡Imposible! Derribaron a mi Coloso Guardián... ¡Tomen su Reliquia del Cofre y crucen el Portal Norte!',
            mood: 'SURPRISED',
            timestamp: Date.now(),
          };
          this.emitFX({
            type: 'SHOCKWAVE',
            x: this.roomWidth / 2,
            y: this.roomHeight / 2,
            radius: 280,
            color: '#22c55e',
          });
        } else {
          this.directorDialogue = this.director.getDirectorQuote('roomClear');
          this.emitFX({
            type: 'SHOCKWAVE',
            x: this.roomWidth / 2,
            y: this.roomHeight / 2,
            radius: 220,
            color: '#22c55e',
          });
        }
      }
    }
  }

  public advanceToNextRoom(nextEncounterType: RoomEncounterType = 'STANDARD'): void {
    if (!this.isRoomCleared() || this.isTransitioningRoom) return;
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
    const W = this.roomWidth;
    const H = this.roomHeight;
    const nextIsBoss = (this.roomIndex + 1) % 3 === 0;

    return {
      NORTH: {
        direction: 'NORTH',
        open: isCleared,
        targetRoomIndex: this.roomIndex + 1,
        encounterType: nextIsBoss ? 'BOSS' : 'STANDARD',
        label: nextIsBoss ? '⚔️ BATALLA DE JEFE' : '⚔️ CÁMARA CENTRAL',
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
    const isCleared = this.isRoomCleared();
    const W = this.roomWidth;
    const H = this.roomHeight;
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
      walls: this.walls,
      seals: this.seals,
      currentWave: this.currentWave,
      totalWaves: this.totalWaves,
      secretFound: this.secretFound,
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
      ...(e.isBoss
        ? {
            name: e.name,
            isBoss: true,
            bossPhase: e.bossPhase,
            bossShieldActive: e.bossShieldActive,
            bossPattern: e.bossPattern,
          }
        : {}),
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
      c: this.isRoomCleared(),
      wv: this.currentWave,
      tw: this.totalWaves,
      sf: this.secretFound,
      ...(this.seals.length > 0
        ? {
            s: this.seals.map(s => ({
              id: s.id,
              progress: Math.round(s.progress * 100) / 100,
              isActivated: s.isActivated,
            })),
          }
        : {}),
      ...(this.walls.some(w => w.isSecretWall)
        ? {
            sw: this.walls
              .filter(w => w.isSecretWall)
              .map(w => ({ id: w.id, hp: w.hp, isOpen: w.isOpen })),
          }
        : {}),
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
