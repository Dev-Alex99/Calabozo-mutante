export type PlayerClass = 'GUERRERO' | 'CAZADOR' | 'MAGO';

export interface PlayerStats {
  maxHp: number;
  moveSpeed: number;
  dashSpeed: number;
  dashDurationMs: number;
  dashCooldownMs: number;
  attackDamage: number;
  attackCooldownMs: number;
  bulletSpeed: number;
  bulletLifetimeMs: number;
  bulletBounces: number;
  bulletCount: number;
  bulletSpreadRad: number;
}

export interface Relic {
  id: string;
  name: string;
  lore: string;
  icon: string;
  buffDescription: string;
  curseDescription?: string;
  modifiers: {
    damageMultiplier?: number;
    moveSpeedMultiplier?: number;
    maxHpBonus?: number;
    attackCooldownMultiplier?: number;
    bulletBouncesBonus?: number;
    bulletCountBonus?: number;
  };
}

export interface PlayerEntity {
  id: string;
  name: string;
  classType: PlayerClass;
  avatarIndex: number;
  isHost: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  currentHp: number;
  maxHp: number;
  isAlive: boolean;
  isDashing: boolean;
  dashCooldownEndsAt: number;
  dashEndsAt: number;
  lastAttackAt: number;
  invulnerableUntil: number; // Mercy i-frames after taking damage
  relics: Relic[];
  kills: number;
  damageDealt: number;
}

export type EnemyType = 'SLIME' | 'ESQUELETO' | 'MURCIELAGO' | 'BOSS_DIRECTOR';

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
  stateTimer: number; // For hop/telegraph state machines
  aiState?: 'IDLE' | 'CHARGING' | 'ATTACKING' | 'COOLDOWN';
  aimAngle?: number; // Telegraphed aim angle for ranged enemies
  isBoss?: boolean;
  bossPhase?: number;
  flashUntil?: number; // White damage flash
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
  createdAt: number;
  lifetimeMs: number;
  isExplosive?: boolean;
  explosionRadius?: number;
}

export interface HeartPickup {
  id: string;
  x: number;
  y: number;
  healAmount: number;
  createdAt: number;
}

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
  hazardType: 'NONE' | 'LAVA_PITS' | 'POISON_SPORES';
}

export type DoorDirection = 'NORTH' | 'SOUTH' | 'EAST' | 'WEST';

export interface DoorState {
  direction: DoorDirection;
  open: boolean;
  targetRoomIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ChestEntity {
  x: number;
  y: number;
  isOpen: boolean;
  relicOptions: Relic[];
}

export interface DirectorDialogue {
  speaker: string;
  text: string;
  mood: 'MOCKING' | 'ANGRY' | 'SURPRISED' | 'IMPRESSED';
  timestamp: number;
}

export interface RoomState {
  roomIndex: number;
  totalRooms: number;
  isBossRoom: boolean;
  mutation: RoomMutation;
  isCleared: boolean;
  doors: Record<DoorDirection, DoorState>;
  chest: ChestEntity | null;
  hearts: HeartPickup[];
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
  directorDialogue: DirectorDialogue;
  telemetry: {
    totalDamageDealt: number;
    rangedAttacksCount: number;
    meleeAttacksCount: number;
    totalPlayerDeaths: number;
  };
}

/**
 * REBALANCED CLASS CONFIGS:
 * Significantly faster player base speeds (310-375 px/s) so the player easily outpaces
 * standard monsters and can kite effectively.
 * Shorter, punchier dash cooldowns (600-750ms) for high-octane fluid action.
 */
export const CLASS_CONFIGS: Record<PlayerClass, PlayerStats> = {
  GUERRERO: {
    maxHp: 180,
    moveSpeed: 310,            // Fast, sturdy frontliner
    dashSpeed: 820,            // Powerful lunging dash
    dashDurationMs: 220,
    dashCooldownMs: 700,       // Fast responsive dash
    attackDamage: 55,          // Heavy cleaving blow
    attackCooldownMs: 320,
    bulletSpeed: 0,
    bulletLifetimeMs: 140,
    bulletBounces: 0,
    bulletCount: 1,
    bulletSpreadRad: 1.1,      // Wide 180° swing arc
  },
  CAZADOR: {
    maxHp: 110,
    moveSpeed: 370,            // Highly agile kiting specialist
    dashSpeed: 950,            // Lightning swift tumble
    dashDurationMs: 230,
    dashCooldownMs: 580,       // Ultra short dodge cooldown
    attackDamage: 28,
    attackCooldownMs: 220,     // High cadence rapid fire
    bulletSpeed: 740,          // High velocity bolts
    bulletLifetimeMs: 1200,
    bulletBounces: 1,
    bulletCount: 1,
    bulletSpreadRad: 0.08,
  },
  MAGO: {
    maxHp: 90,
    moveSpeed: 335,            // Spacing & positioning caster
    dashSpeed: 890,            // Arcane blink dash
    dashDurationMs: 200,
    dashCooldownMs: 650,
    attackDamage: 65,          // Devastating explosive fire orb
    attackCooldownMs: 440,
    bulletSpeed: 520,
    bulletLifetimeMs: 1400,
    bulletBounces: 0,
    bulletCount: 1,
    bulletSpreadRad: 0.15,
  },
};
