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
  isBoss?: boolean;
  bossPhase?: number;
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

export interface RoomMutation {
  title: string;
  description: string;
  directorRoast: string;
  frictionMultiplier: number; // 0.15 = hielo, 1.0 = normal, 0.5 = barro
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

export const CLASS_CONFIGS: Record<PlayerClass, PlayerStats> = {
  GUERRERO: {
    maxHp: 160,
    moveSpeed: 210,
    dashSpeed: 520,
    dashDurationMs: 250,
    dashCooldownMs: 1100,
    attackDamage: 45,
    attackCooldownMs: 380,
    bulletSpeed: 0,
    bulletLifetimeMs: 140,
    bulletBounces: 0,
    bulletCount: 1,
    bulletSpreadRad: 0.8,
  },
  CAZADOR: {
    maxHp: 100,
    moveSpeed: 250,
    dashSpeed: 600,
    dashDurationMs: 260,
    dashCooldownMs: 900,
    attackDamage: 24,
    attackCooldownMs: 280,
    bulletSpeed: 580,
    bulletLifetimeMs: 1100,
    bulletBounces: 1,
    bulletCount: 1,
    bulletSpreadRad: 0.1,
  },
  MAGO: {
    maxHp: 80,
    moveSpeed: 220,
    dashSpeed: 650,
    dashDurationMs: 220,
    dashCooldownMs: 1200,
    attackDamage: 55,
    attackCooldownMs: 500,
    bulletSpeed: 420,
    bulletLifetimeMs: 1400,
    bulletBounces: 0,
    bulletCount: 1,
    bulletSpreadRad: 0.2,
  },
};
