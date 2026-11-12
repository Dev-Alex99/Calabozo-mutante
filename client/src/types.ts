export type PlayerClass = 'GUERRERO' | 'CAZADOR' | 'MAGO' | 'PICARO';

export interface PlayerStats {
  maxHp: number;
  moveSpeed: number;
  dashSpeed: number;
  dashDurationMs: number;
  dashCooldownMs: number;
  attackDamage: number;
  attackCooldownMs: number;
  skillName: string;
  skillDescription: string;
  skillCooldownMs: number;
  bulletSpeed: number;
  bulletLifetimeMs: number;
  bulletBounces: number;
  bulletCount: number;
  bulletSpreadRad: number;
  critChance: number;
}

export interface Relic {
  id: string;
  name: string;
  lore: string;
  icon: string;
  rarity?: 'COMMON' | 'RARE' | 'LEGENDARY' | 'CURSED' | 'MYTHIC';
  buffDescription: string;
  curseDescription?: string;
  modifiers: {
    damageMultiplier?: number;
    moveSpeedMultiplier?: number;
    maxHpBonus?: number;
    attackCooldownMultiplier?: number;
    bulletBouncesBonus?: number;
    bulletCountBonus?: number;
    critChanceBonus?: number;
    lifestealPct?: number;
    chainLightning?: boolean;
    burnOnHit?: boolean;
    freezeOnHit?: boolean;
    poisonOnHit?: boolean;
    skillCooldownMultiplier?: number;
    goldMultiplier?: number;
  };
}

export interface PlayerEntity {
  id: string;
  name: string;
  classType: PlayerClass;
  avatarIndex: number;
  isHost: boolean;
  isBot?: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  currentHp: number;
  maxHp: number;
  shieldHp: number;
  isAlive: boolean;
  isDashing: boolean;
  dashCooldownEndsAt: number;
  dashEndsAt: number;
  skillCooldownEndsAt: number;
  skillActiveUntil: number;
  stealthedUntil: number;
  lastAttackAt: number;
  invulnerableUntil: number;
  relics: Relic[];
  kills: number;
  damageDealt: number;
  gold: number;
  weaponLevel: number;
  combo: number;
  maxCombo: number;
  comboExpiresAt: number;
  reviveProgress: number;
  revivesCount: number;
  synergiesTriggered: number;
  title?: string;
  lastProcessedSeq?: number;
  ping?: number;
  isDisconnected?: boolean;
  disconnectedAt?: number;
}

export interface PlayerInputPayload {
  code: string;
  seq?: number;
  clientTime?: number;
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

export type EnemyType =
  | 'SLIME'
  | 'MINI_SLIME'
  | 'ESQUELETO'
  | 'MURCIELAGO'
  | 'GOLEM'
  | 'NIGROMANTE'
  | 'ESPIRITU'
  | 'KAMIKAZE'
  | 'MIMICO'
  | 'ARANA'
  | 'CENTINELA'
  | 'BOSS_TITAN'
  | 'BOSS_ARACHNID'
  | 'BOSS_DIRECTOR';

export type EliteModifier = 'VAMPIRICO' | 'EXPLOSIVO' | 'TORMENTA' | 'FRENETICO' | 'BLINDADO';

export interface EnemyEntity {
  id: string;
  type: EnemyType;
  name: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  currentHp: number;
  maxHp: number;
  speed: number;
  damage: number;
  color: string;
  lastAttackAt: number;
  attackCooldownMs: number;
  stateTimer: number;
  aiState?: 'IDLE' | 'CHARGING' | 'ATTACKING' | 'COOLDOWN';
  aimAngle?: number;
  isBoss?: boolean;
  bossPhase?: number;
  bossShieldActive?: boolean;
  bossPattern?: 'SPIRAL' | 'METEOR_RAIN' | 'LASER_SWEEP' | 'CHARGE_SLAM' | 'GRAVITY_VORTEX' | 'CROSS_BARRAGE';
  isElite?: boolean;
  eliteModifier?: EliteModifier;
  flashUntil?: number;
  burnUntil?: number;
  poisonUntil?: number;
  chillUntil?: number;
  stunUntil?: number;
}

export interface ProjectileEntity {
  id: string;
  ownerId: string;
  fromPlayer: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  damage: number;
  color: string;
  bouncesRemaining: number;
  piercesRemaining?: number;
  createdAt: number;
  lifetimeMs: number;
  isExplosive?: boolean;
  explosionRadius?: number;
  isCrit?: boolean;
  element?: 'NONE' | 'FIRE' | 'ICE' | 'POISON' | 'LIGHTNING';
  chainLightning?: boolean;
}

export type PickupType = 'HEART' | 'GOLD' | 'SHIELD_ORB' | 'FRENZY_ORB';

export interface HeartPickup {
  id: string;
  type?: PickupType;
  x: number;
  y: number;
  healAmount: number;
  createdAt: number;
}

export interface PillarEntity {
  id: string;
  x: number;
  y: number;
  radius: number;
}

export interface BarrelEntity {
  id: string;
  x: number;
  y: number;
  radius: number;
  type: 'EXPLOSIVE' | 'FROST' | 'TOXIC';
}

export interface HazardZone {
  id: string;
  type: 'LAVA' | 'POISON_CLOUD' | 'SPIKE_TRAP' | 'ARCANE_VORTEX' | 'METEOR_STRIKE' | 'DECOY_BOMB' | 'BEAR_TRAP';
  x: number;
  y: number;
  radius: number;
  active: boolean;
  createdAt: number;
  durationMs: number;
  damage: number;
  ownerId?: string;
}

export interface DirectorPact {
  id: string;
  title: string;
  description: string;
  rewardText: string;
  costText: string;
  type: 'BLOOD_FOR_POWER' | 'ELITE_AMBUSH' | 'CURSED_ROULETTE' | 'CHAIN_LIGHTNING_PACT' | 'VAMPIRIC_HUNGER';
  used: boolean;
}

export interface AltarEntity {
  x: number;
  y: number;
  pact: DirectorPact;
  weaponUpgradeCost: number;
  healCost: number;
  shieldCost: number;
}

export interface WorldEventFX {
  id: string;
  type:
    | 'EXPLOSION'
    | 'FROST_NOVA'
    | 'TOXIC_BLAST'
    | 'SYNERGY'
    | 'CRIT'
    | 'REVIVE'
    | 'PING'
    | 'DIRECTOR_INTERVENTION'
    | 'SHOCKWAVE'
    | 'LIGHTNING_ARC';
  x: number;
  y: number;
  targetX?: number;
  targetY?: number;
  radius?: number;
  text?: string;
  color?: string;
  timestamp: number;
}

export type RoomEncounterType = 'STANDARD' | 'ELITE' | 'SANCTUARY' | 'BOSS';

export interface RoomMutation {
  title: string;
  description: string;
  directorRoast: string;
  frictionMultiplier: number;
  bulletBouncesBonus: number;
  enemySpeedMultiplier: number;
  playerDamageMultiplier: number;
  lowVisibility: boolean;
  visibilityRadius: number;
  hazardType: 'NONE' | 'LAVA_PITS' | 'POISON_SPORES' | 'SPIKE_TRAPS' | 'GRAVITY_WELL';
  encounterType?: RoomEncounterType;
}

export type DoorDirection = 'NORTH' | 'SOUTH' | 'EAST' | 'WEST';

export interface DoorState {
  direction: DoorDirection;
  open: boolean;
  targetRoomIndex: number;
  encounterType?: RoomEncounterType;
  label?: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ChestEntity {
  x: number;
  y: number;
  isOpen: boolean;
  claimedByPlayerIds: string[];
  relicOptions: Relic[];
}

export interface DirectorDialogue {
  speaker: string;
  text: string;
  mood: 'MOCKING' | 'ANGRY' | 'SURPRISED' | 'IMPRESSED' | 'CHAOTIC';
  timestamp: number;
}

export interface WallSegment {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  isSecretWall?: boolean;
  hp?: number;
  maxHp?: number;
  isOpen?: boolean;
}

export interface SyncSeal {
  id: string;
  x: number;
  y: number;
  radius: number;
  progress: number;
  isActivated: boolean;
  label?: string;
}

export interface RoomState {
  roomIndex: number;
  totalRooms: number;
  isBossRoom: boolean;
  encounterType: RoomEncounterType;
  mutation: RoomMutation;
  isCleared: boolean;
  doors: Record<DoorDirection, DoorState>;
  chest: ChestEntity | null;
  altar: AltarEntity | null;
  hearts: HeartPickup[];
  pillars: PillarEntity[];
  barrels: BarrelEntity[];
  hazards: HazardZone[];
  walls: WallSegment[];
  seals: SyncSeal[];
  currentWave: number;
  totalWaves: number;
  secretFound?: boolean;
  width: number;
  height: number;
}

export type GamePhase = 'LOBBY' | 'PLAYING' | 'ROOM_CLEARED' | 'RELIC_CHOICE' | 'VICTORY' | 'GAME_OVER';

export interface GameWorldState {
  code: string;
  phase: GamePhase;
  room: RoomState;
  players: Record<string, PlayerEntity>;
  enemies: EnemyEntity[];
  projectiles: ProjectileEntity[];
  recentEvents: WorldEventFX[];
  directorDialogue: DirectorDialogue;
  directorAnger: number;
  telemetry: {
    totalDamageDealt: number;
    rangedAttacksCount: number;
    meleeAttacksCount: number;
    skillsUsedCount: number;
    synergiesCount: number;
    totalPlayerDeaths: number;
    totalGoldCollected: number;
  };
}

export const CLASS_CONFIGS: Record<PlayerClass, PlayerStats> = {
  GUERRERO: {
    maxHp: 185,
    moveSpeed: 315,
    dashSpeed: 840,
    dashDurationMs: 220,
    dashCooldownMs: 680,
    attackDamage: 56,
    attackCooldownMs: 310,
    skillName: 'Baluarte Sísmico',
    skillDescription: 'Onda expansiva que aturde enemigos y refleja proyectiles por 2s.',
    skillCooldownMs: 6000,
    bulletSpeed: 240,
    bulletLifetimeMs: 150,
    bulletBounces: 0,
    bulletCount: 1,
    bulletSpreadRad: 1.1,
    critChance: 0.12,
  },
  CAZADOR: {
    maxHp: 115,
    moveSpeed: 375,
    dashSpeed: 960,
    dashDurationMs: 230,
    dashCooldownMs: 560,
    attackDamage: 30,
    attackCooldownMs: 210,
    skillName: 'Salva Perforante & Trampa',
    skillDescription: 'Dispara 5 virotes perforantes en abanico y deja una trampa explosiva.',
    skillCooldownMs: 5500,
    bulletSpeed: 760,
    bulletLifetimeMs: 1250,
    bulletBounces: 1,
    bulletCount: 1,
    bulletSpreadRad: 0.08,
    critChance: 0.2,
  },
  MAGO: {
    maxHp: 95,
    moveSpeed: 340,
    dashSpeed: 900,
    dashDurationMs: 210,
    dashCooldownMs: 640,
    attackDamage: 62,
    attackCooldownMs: 420,
    skillName: 'Singularidad Arcana',
    skillDescription: 'Invoca un agujero negro que succiona, congela y electrocuta monstruos.',
    skillCooldownMs: 7000,
    bulletSpeed: 540,
    bulletLifetimeMs: 1400,
    bulletBounces: 0,
    bulletCount: 1,
    bulletSpreadRad: 0.15,
    critChance: 0.15,
  },
  PICARO: {
    maxHp: 105,
    moveSpeed: 400,
    dashSpeed: 1020,
    dashDurationMs: 220,
    dashCooldownMs: 480,
    attackDamage: 34,
    attackCooldownMs: 175,
    skillName: 'Paso Sombrío & Señuelo',
    skillDescription: 'Deja un clon explosivo, te vuelve invisible y garantiza golpe crítico venenoso.',
    skillCooldownMs: 5000,
    bulletSpeed: 640,
    bulletLifetimeMs: 360,
    bulletBounces: 0,
    bulletCount: 2,
    bulletSpreadRad: 0.22,
    critChance: 0.35,
  },
};
