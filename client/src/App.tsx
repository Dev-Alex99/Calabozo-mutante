import React, { useEffect, useRef, useState, useCallback } from 'react';
import { socket } from './socket';
import { GameWorldState, PlayerClass, CLASS_CONFIGS, EnemyEntity, ProjectileEntity, PlayerEntity } from './types';
import { GameRenderer } from './engine/Renderer';
import { LobbyView } from './components/LobbyView';
import { DirectorBanner } from './components/DirectorBanner';
import { PlayerHUD } from './components/PlayerHUD';
import { RelicChoiceModal } from './components/RelicChoiceModal';
import { EndGameModal } from './components/EndGameModal';
import { TouchControls } from './components/TouchControls';
import { AudioSettingsModal } from './components/AudioSettingsModal';
import { sfx } from './audio/sfx';
import { soundtrack } from './audio/SoundtrackEngine';
import { ambience } from './audio/AmbienceEngine';

interface PendingInput {
  seq: number;
  dt: number;
  moveX: number;
  moveY: number;
  len: number;
  angle: number;
  isDashing: boolean;
  dashEndsAt?: number;
  timestamp: number;
}

export const App: React.FC = () => {
  const [world, setWorld] = useState<GameWorldState | null>(null);
  const [localPlayerId, setLocalPlayerId] = useState<string>(() => sessionStorage.getItem('calabozo_player_id') || '');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showRelicModal, setShowRelicModal] = useState(false);
  const [showAudioModal, setShowAudioModal] = useState(false);
  const [networkPing, setNetworkPing] = useState<number>(42);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<GameRenderer>(new GameRenderer());
  const worldRef = useRef<GameWorldState | null>(null);
  const localPlayerIdRef = useRef<string>(localPlayerId);

  const prevHpRef = useRef<number | null>(null);
  const prevGoldRef = useRef<number | null>(null);
  const prevComboRef = useRef<number | null>(null);
  const prevClearedRef = useRef<boolean>(false);
  const prevSecretFoundRef = useRef<boolean>(false);
  const prevPhaseRef = useRef<string>('');
  const prevEnemiesRef = useRef<EnemyEntity[]>([]);
  const processedEventsRef = useRef<Set<string>>(new Set());
  const nearMissProjectilesRef = useRef<Set<string>>(new Set());
  const chargingEnemiesRef = useRef<Set<string>>(new Set());
  const lastHudRenderAtRef = useRef<number>(0);
  const lastHudRoomRef = useRef<number>(-1);
  const lastDialogueTsRef = useRef<number>(0);

  // Ping calculation & telemetry
  const pingEmaRef = useRef<number>(42);

  // Sequence numbering & input replay history buffer for 100% rubberband-free reconciliation
  const inputSeqRef = useRef<number>(1);
  const inputHistoryRef = useRef<PendingInput[]>([]);
  const lastInputTimeRef = useRef<number>(Date.now());

  // Input buffering for high-responsiveness actions (130ms window)
  const bufferedActionRef = useRef<{ type: 'DASH' | 'SKILL'; readyAt: number } | null>(null);

  // Gamepad button edge states
  const gamepadDashDown = useRef(false);
  const gamepadSkillDown = useRef(false);
  const gamepadPingDown = useRef(false);

  // Client-side prediction state for 0ms local player latency
  const localSimRef = useRef<{
    roomIndex: number;
    x: number;
    y: number;
    vx: number;
    vy: number;
    angle: number;
    isDashing: boolean;
    dashEndsAt: number;
    dashCooldownEndsAt: number;
    skillCooldownEndsAt: number;
    lastAttackAt: number;
  }>({
    roomIndex: -1,
    x: 600,
    y: 670,
    vx: 0,
    vy: 0,
    angle: -Math.PI / 2,
    isDashing: false,
    dashEndsAt: 0,
    dashCooldownEndsAt: 0,
    skillCooldownEndsAt: 0,
    lastAttackAt: 0,
  });

  // Input states
  const keysDown = useRef<Record<string, boolean>>({});
  const mousePos = useRef({ x: 0, y: 0 });
  const mouseMovedOnce = useRef(false);
  const isMouseDown = useRef(false);
  const touchMove = useRef({ x: 0, y: 0 });
  const touchAttack = useRef(false);
  const explicitTouchAngle = useRef<number | undefined>(undefined);

  useEffect(() => {
    localPlayerIdRef.current = localPlayerId;
  }, [localPlayerId]);

  // Precision Heartbeat Ping measurement (every 1.5s)
  useEffect(() => {
    const pingInterval = setInterval(() => {
      if (!socket.connected) return;
      const start = performance.now();
      socket.emit('net:ping', Date.now(), () => {
        const rtt = Math.max(1, Math.round(performance.now() - start));
        pingEmaRef.current = Math.round(pingEmaRef.current * 0.7 + rtt * 0.3);
        setNetworkPing(pingEmaRef.current);
        const code = worldRef.current?.code;
        if (code) {
          socket.emit('player:ping_stat', { code, ping: pingEmaRef.current });
        }
      });
    }, 1500);

    return () => clearInterval(pingInterval);
  }, []);

  // Initialize AudioContext & Soundtrack on first user gesture
  useEffect(() => {
    const handleFirstGesture = () => {
      sfx.initCtx();
      window.removeEventListener('click', handleFirstGesture);
      window.removeEventListener('keydown', handleFirstGesture);
      window.removeEventListener('touchstart', handleFirstGesture);
    };
    window.addEventListener('click', handleFirstGesture);
    window.addEventListener('keydown', handleFirstGesture);
    window.addEventListener('touchstart', handleFirstGesture);
    return () => {
      window.removeEventListener('click', handleFirstGesture);
      window.removeEventListener('keydown', handleFirstGesture);
      window.removeEventListener('touchstart', handleFirstGesture);
    };
  }, []);

  // Quick Mute hotkey ('m' or 'M')
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'm' || e.key === 'M') {
        if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return;
        sfx.toggleMute();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Socket Listeners with Input-Replay Reconciliation
  useEffect(() => {
    const processWorldUpdate = (updated: GameWorldState) => {
      const now = Date.now();
      const currentPlayerId = localPlayerIdRef.current;
      const player = updated.players[currentPlayerId];
      const renderer = rendererRef.current;
      const sim = localSimRef.current;

      // Reconcile server snapshot with local prediction
      if (player && updated.phase === 'PLAYING') {
        const roomChanged = updated.room.roomIndex !== sim.roomIndex;
        const dist = Math.hypot(player.x - sim.x, player.y - sim.y);

        if (roomChanged || !player.isAlive || dist > 280) {
          // Hard snap on room transition, death/revive, or massive desync
          sim.roomIndex = updated.room.roomIndex;
          sim.x = player.x;
          sim.y = player.y;
          sim.vx = 0;
          sim.vy = 0;
          sim.isDashing = false;
          inputHistoryRef.current = [];
          if (roomChanged) {
            renderer.clearSmoothPositions();
            renderer.cameraX = player.x - window.innerWidth / 2;
            renderer.cameraY = player.y - window.innerHeight / 2;
          }
        } else {
          // Reconcile using Input Sequence Replay Buffer (Zero rubberbanding at 40-400ms!)
          const ackSeq = (player as any).seq || (player as any).lastProcessedSeq || 0;
          if (ackSeq > 0) {
            // Discard acknowledged inputs
            inputHistoryRef.current = inputHistoryRef.current.filter(inp => inp.seq > ackSeq);

            // Replay all unacknowledged inputs from authoritative server coordinate
            let rx = player.x;
            let ry = player.y;
            let rvx = player.vx;
            let rvy = player.vy;

            const baseStats = CLASS_CONFIGS[player.classType] || CLASS_CONFIGS.CAZADOR;
            let speedMult = 1;
            for (const r of player.relics) {
              if (r.modifiers.moveSpeedMultiplier) speedMult *= r.modifiers.moveSpeedMultiplier;
            }
            const frenzyBonus = player.combo >= 15 ? 1.15 : player.combo >= 8 ? 1.08 : 1.0;
            const stealthBonus = player.stealthedUntil && now < player.stealthedUntil ? 1.25 : 1.0;
            const targetSpeed = Math.round(baseStats.moveSpeed * speedMult) * frenzyBonus * stealthBonus;
            const isIce = updated.room.mutation.frictionMultiplier < 0.3;

            for (const inp of inputHistoryRef.current) {
              const inpStillDashing = inp.isDashing && (!inp.dashEndsAt || inp.timestamp <= inp.dashEndsAt);
              if (inpStillDashing) {
                const dirX = inp.len > 0.1 ? inp.moveX / inp.len : Math.cos(inp.angle);
                const dirY = inp.len > 0.1 ? inp.moveY / inp.len : Math.sin(inp.angle);
                rvx = dirX * baseStats.dashSpeed;
                rvy = dirY * baseStats.dashSpeed;
              } else {
                const normX = inp.len > 0 ? (inp.moveX / inp.len) * targetSpeed : 0;
                const normY = inp.len > 0 ? (inp.moveY / inp.len) * targetSpeed : 0;
                const rate = isIce ? (inp.len > 0 ? 14 : 1.8) : 22;
                const blend = Math.min(1, inp.dt * rate);
                rvx += (normX - rvx) * blend;
                rvy += (normY - rvy) * blend;
              }
              rx += rvx * inp.dt;
              ry += rvy * inp.dt;

              // Pillar collisions with wall-sliding during replay
              for (const pil of updated.room.pillars || []) {
                const dx = rx - pil.x;
                const dy = ry - pil.y;
                const d = Math.hypot(dx, dy);
                const minDist = pil.radius + 18;
                if (d < minDist && d > 0.001) {
                  const nx = dx / d;
                  const ny = dy / d;
                  rx = pil.x + nx * minDist;
                  ry = pil.y + ny * minDist;
                  const vDotN = rvx * nx + rvy * ny;
                  if (vDotN < 0) {
                    rvx -= vDotN * nx;
                    rvy -= vDotN * ny;
                  }
                }
              }

              // Wall collisions with wall-sliding during replay
              for (const w of updated.room.walls || []) {
                if (w.isOpen) continue;
                const closestX = Math.max(w.x, Math.min(rx, w.x + w.width));
                const closestY = Math.max(w.y, Math.min(ry, w.y + w.height));
                const dx = rx - closestX;
                const dy = ry - closestY;
                const distSq = dx * dx + dy * dy;
                if (distSq < 18 * 18) {
                  const d = Math.sqrt(distSq);
                  let nx = 0;
                  let ny = 0;
                  if (d > 0.001) {
                    nx = dx / d;
                    ny = dy / d;
                    rx += nx * (18 - d);
                    ry += ny * (18 - d);
                  }
                  const vDotN = rvx * nx + rvy * ny;
                  if (vDotN < 0) {
                    rvx -= vDotN * nx;
                    rvy -= vDotN * ny;
                  }
                }
              }
            }

            // Smooth gentle error correction - Never snap backwards while actively dashing locally or post-dash
            const isLocalDashing = sim.isDashing || now < sim.dashEndsAt;
            const errDist = Math.hypot(rx - sim.x, ry - sim.y);
            if (errDist > 280) {
              // Irrecoverable desync hard snap
              sim.x = rx;
              sim.y = ry;
            } else if (errDist > 8) {
              // Smooth exponential lerp adjustment without velocity jerking
              const blendRate = isLocalDashing ? 0.05 : 0.15;
              sim.x += (rx - sim.x) * blendRate;
              sim.y += (ry - sim.y) * blendRate;
            }
          }

          player.x = sim.x;
          player.y = sim.y;
          player.vx = sim.vx;
          player.vy = sim.vy;
          player.angle = sim.angle;
          player.isDashing = sim.isDashing;
          player.dashEndsAt = Math.max(player.dashEndsAt, sim.dashEndsAt);
          player.dashCooldownEndsAt = Math.max(player.dashCooldownEndsAt, sim.dashCooldownEndsAt);
          player.skillCooldownEndsAt = Math.max(player.skillCooldownEndsAt, sim.skillCooldownEndsAt);
          player.lastAttackAt = Math.max(player.lastAttackAt, sim.lastAttackAt);
        }
      }

      worldRef.current = updated;

      if (player && updated.phase === 'PLAYING') {
        // Low-HP visceral tension (master audio muffle, heartbeat lub-dub, tinnitus ringing)
        sfx.updateLowHpState(player.isAlive ? player.currentHp / player.maxHp : 0);

        // Harmonic Combo Killstreak Milestones (5x, 10x, 15x, 20x)
        if (prevComboRef.current !== null && player.combo > prevComboRef.current) {
          if (player.combo >= 20 && prevComboRef.current < 20) sfx.playComboMilestone(20);
          else if (player.combo >= 15 && prevComboRef.current < 15) sfx.playComboMilestone(15);
          else if (player.combo >= 10 && prevComboRef.current < 10) sfx.playComboMilestone(10);
          else if (player.combo >= 5 && prevComboRef.current < 5) sfx.playComboMilestone(5);
        }
        prevComboRef.current = player.combo;

        if (prevHpRef.current !== null) {
          if (player.currentHp < prevHpRef.current) {
            const lost = prevHpRef.current - player.currentHp;
            const hadShield = (player.shieldHp || 0) > 0;
            sfx.playHit(hadShield);
            renderer.addScreenShake(7, 0.25);
            renderer.particleSystem.emitBlood(player.x, player.y, '#dc2626', 10);
            renderer.addBloodDecal(player.x, player.y, '#7f1d1d');
            renderer.textManager.spawn(`-${lost}`, player.x, player.y, '#ef4444');
          } else if (player.currentHp > prevHpRef.current) {
            const gained = player.currentHp - prevHpRef.current;
            sfx.playHeal();
            renderer.particleSystem.emitSparks(player.x, player.y, '#4ade80', 8);
            renderer.textManager.spawn(`+${gained}`, player.x, player.y, '#22c55e');
          }
        }
        prevHpRef.current = player.currentHp;

        if (prevGoldRef.current !== null && player.gold > prevGoldRef.current) {
          sfx.playCoin();
          renderer.particleSystem.emitSparks(player.x, player.y, '#facc15', 6);
        }
        prevGoldRef.current = player.gold;
      } else {
        sfx.resetLowHpState();
      }

      // Process Synchronized Multiplayer World Events with Juicy Floating Text
      if (updated.recentEvents) {
        for (const ev of updated.recentEvents) {
          if (processedEventsRef.current.has(ev.id)) continue;
          processedEventsRef.current.add(ev.id);
          if (processedEventsRef.current.size > 200) {
            const firstKey = processedEventsRef.current.values().next().value;
            if (firstKey) processedEventsRef.current.delete(firstKey);
          }

          if (ev.type === 'EXPLOSION') {
            sfx.playExplosion(ev.x, ev.y, player?.x, player?.y);
            renderer.addScreenShake(9, 0.28);
            renderer.particleSystem.emitExplosion(ev.x, ev.y, ev.radius || 75, ev.color || '#f97316');
          } else if (ev.type === 'FROST_NOVA') {
            sfx.playSkill('CAZADOR');
            renderer.particleSystem.emitExplosion(ev.x, ev.y, ev.radius || 110, '#38bdf8');
          } else if (ev.type === 'TOXIC_BLAST') {
            sfx.playExplosion(ev.x, ev.y, player?.x, player?.y);
            renderer.particleSystem.emitExplosion(ev.x, ev.y, ev.radius || 95, '#10b981');
          } else if (ev.type === 'SHOCKWAVE') {
            sfx.playSkill('GUERRERO');
            renderer.addScreenShake(6, 0.2);
            renderer.particleSystem.addShockwave(ev.x, ev.y, ev.radius || 140, ev.color || '#f59e0b', 4);
          } else if (ev.type === 'SYNERGY') {
            sfx.playSynergy();
            renderer.addHitStop(0.045);
            renderer.addChromaticAberration(0.18);
            renderer.addScreenShake(6, 0.2);
            renderer.particleSystem.addShockwave(ev.x, ev.y, ev.radius || 95, '#c084fc', 3.5);
            renderer.particleSystem.emitSparks(ev.x, ev.y, '#e879f9', 14);
            renderer.textManager.spawn('¡SINERGIA!', ev.x, ev.y, '#e879f9', true, true);
          } else if (ev.type === 'LIGHTNING_ARC' && ev.targetX !== undefined && ev.targetY !== undefined) {
            renderer.particleSystem.addLightningArc(ev.x, ev.y, ev.targetX, ev.targetY, ev.color || '#38bdf8');
          } else if (ev.type === 'REVIVE') {
            sfx.playHeal();
            renderer.particleSystem.addShockwave(ev.x, ev.y, 90, '#22c55e', 4);
            renderer.textManager.spawn('¡REVIVIDO!', ev.x, ev.y, '#22c55e', true);
          } else if (ev.type === 'PING') {
            sfx.playPing();
            renderer.particleSystem.addShockwave(ev.x, ev.y, 65, '#f59e0b', 3);
          } else if (ev.type === 'DIRECTOR_INTERVENTION') {
            sfx.playExplosion();
            renderer.addScreenShake(10, 0.35);
            renderer.particleSystem.addShockwave(ev.x, ev.y, ev.radius || 130, ev.color || '#ef4444', 5);
          } else if (ev.type === 'CRIT') {
            renderer.addChromaticAberration(0.08);
            renderer.particleSystem.emitSparks(ev.x, ev.y, ev.color || '#facc15', 10);
            renderer.textManager.spawn('¡CRÍTICO!', ev.x, ev.y, '#f59e0b', true);
          }
        }
      }

      // Enemy hit reactions, battlefield death decals & floating damage numbers
      if (prevEnemiesRef.current && prevEnemiesRef.current.length > 0) {
        for (const prevE of prevEnemiesRef.current) {
          const currentE = updated.enemies.find(e => e.id === prevE.id);
          if (!currentE) {
            sfx.playEnemyDeath(prevE.isBoss);
            const decalColor = prevE.type === 'SLIME' || prevE.type === 'MINI_SLIME' ? '#14532d' : '#450a0a';
            renderer.addBloodDecal(prevE.x, prevE.y, decalColor);

            if (prevE.isBoss) {
              renderer.addHitStop(0.065);
              renderer.addChromaticAberration(0.25);
              renderer.addScreenShake(12, 0.4);
            }

            // Spawn Physical Bouncing Gibs according to monster species
            if (prevE.type === 'SLIME' || prevE.type === 'MINI_SLIME') {
              renderer.particleSystem.emitAcidSpurt(prevE.x, prevE.y, 12);
              renderer.particleSystem.emitGibs(prevE.x, prevE.y, 'ACID', '#22c55e', 5);
            } else if (prevE.type === 'ESQUELETO') {
              renderer.particleSystem.emitGibs(prevE.x, prevE.y, 'BONE', '#f1f5f9', 7);
              renderer.particleSystem.emitBlood(prevE.x, prevE.y, '#991b1b', 6);
            } else if (prevE.type === 'GOLEM' || prevE.type === 'CENTINELA') {
              renderer.particleSystem.emitGibs(prevE.x, prevE.y, 'METAL', '#94a3b8', 6);
              renderer.particleSystem.emitSparks(prevE.x, prevE.y, '#f59e0b', 10);
            } else if (prevE.type === 'KAMIKAZE') {
              renderer.particleSystem.emitGibs(prevE.x, prevE.y, 'EMBER', '#f97316', 8);
              renderer.particleSystem.emitExplosion(prevE.x, prevE.y, 60, '#f97316');
            } else {
              renderer.particleSystem.emitBlood(prevE.x, prevE.y, '#991b1b', 12);
              renderer.particleSystem.emitGibs(prevE.x, prevE.y, 'FLESH', '#7f1d1d', 5);
            }
          } else if (currentE.currentHp < prevE.currentHp) {
            const diff = prevE.currentHp - currentE.currentHp;
            const sparkColor = currentE.type === 'SLIME' ? '#22c55e' : '#dc2626';
            renderer.particleSystem.emitBlood(currentE.x, currentE.y, sparkColor, 6);
            renderer.textManager.spawn(String(diff), currentE.x, currentE.y, currentE.isBoss ? '#f59e0b' : '#facc15');
            sfx.playHitmark(currentE.isBoss || diff > 45);
          }
        }
      }
      prevEnemiesRef.current = updated.enemies;

      // Secret Chamber Discovery
      if (updated.room.secretFound && !prevSecretFoundRef.current) {
        sfx.playSecretFound();
      }
      prevSecretFoundRef.current = !!updated.room.secretFound;

      // Dynamic Combat Intensity, Room Ambience & Enemy Charge Telegraphs
      if (updated.phase === 'PLAYING') {
        const enemyCount = updated.enemies?.length || 0;
        const anger = updated.directorAnger || 0;
        const intensity = Math.min(1.0, (enemyCount / 8) * 0.6 + (anger / 100) * 0.4);
        soundtrack.setIntensity(intensity);

        // Procedural environmental soundscape (torch embers, subterranean wind, room-mutation layers)
        ambience.updateRoomEncounter(updated.room.mutation || null, updated.room.encounterType || 'STANDARD');

        // Enemy & Boss attack charge telegraph cues
        if (updated.enemies) {
          const currentChargingIds = new Set<string>();
          for (const e of updated.enemies) {
            if (e.aiState === 'CHARGING') {
              currentChargingIds.add(e.id);
              if (!chargingEnemiesRef.current.has(e.id)) {
                if (e.isBoss && e.bossPattern === 'LASER_SWEEP') {
                  sfx.playLaserCharge(e.x, e.y, player?.x, player?.y);
                } else {
                  sfx.playEnemyCharge(e.x, e.y, player?.x, player?.y);
                }
              }
            }
          }
          chargingEnemiesRef.current = currentChargingIds;
        }
      } else {
        ambience.stop();
        chargingEnemiesRef.current.clear();
      }

      // Room clear sound
      const clearChanged = updated.room.isCleared !== prevClearedRef.current;
      if (updated.room.isCleared && !prevClearedRef.current) {
        sfx.playRoomClear();
      }
      prevClearedRef.current = updated.room.isCleared;

      // Victory fanfare
      const phaseChanged = updated.phase !== prevPhaseRef.current;
      if (updated.phase === 'VICTORY' && prevPhaseRef.current !== 'VICTORY') {
        sfx.playVictory();
      }
      prevPhaseRef.current = updated.phase;

      // Trigger relic choice modal if chest is available and not yet claimed
      const alreadyClaimed = updated.room.chest?.claimedByPlayerIds?.includes(currentPlayerId);
      const shouldShowRelic = !!(updated.room.isCleared && updated.room.chest && !alreadyClaimed);
      setShowRelicModal(prev => {
        if (!prev && shouldShowRelic) {
          sfx.playParchmentOpen();
        }
        return prev !== shouldShowRelic ? shouldShowRelic : prev;
      });

      // Throttle React HUD state updates during combat to ~5 Hz (every 180ms)
      const roomChanged = updated.room.roomIndex !== lastHudRoomRef.current;
      const dialogueChanged = updated.directorDialogue.timestamp !== lastDialogueTsRef.current;
      if (
        updated.phase !== 'PLAYING' ||
        phaseChanged ||
        clearChanged ||
        roomChanged ||
        dialogueChanged ||
        now - lastHudRenderAtRef.current >= 180
      ) {
        lastHudRenderAtRef.current = now;
        lastHudRoomRef.current = updated.room.roomIndex;
        lastDialogueTsRef.current = updated.directorDialogue.timestamp;
        setWorld(updated);
      }
    };

    socket.on('world:state', processWorldUpdate);

    socket.on('world:tick', (tick: any) => {
      const base = worldRef.current;
      if (!base || base.room.roomIndex !== tick.r) return;

      const mergedPlayers: Record<string, any> = {};
      for (const [id, pTick] of Object.entries(tick.p || {})) {
        const existing = base.players[id];
        if (existing) {
          mergedPlayers[id] = {
            ...existing,
            ...(pTick as object),
            isDisconnected: !!(pTick as any).isDisconnected,
          };
        } else {
          // Robustness fallback: If player reconnected or state in-flight, keep entity alive
          mergedPlayers[id] = {
            id,
            name: 'Aventurero',
            classType: 'CAZADOR',
            avatarIndex: 0,
            isHost: false,
            isBot: false,
            relics: [],
            weaponLevel: 1,
            kills: 0,
            damageDealt: 0,
            revivesCount: 0,
            ...(pTick as object),
          };
        }
      }

      const nextIsBoss = (base.room.roomIndex + 1) % 3 === 0;
      const updatedDoors = tick.c
        ? {
            ...base.room.doors,
            NORTH: { ...base.room.doors.NORTH, open: true },
            EAST: { ...base.room.doors.EAST, open: !nextIsBoss },
            WEST: { ...base.room.doors.WEST, open: !nextIsBoss },
          }
        : base.room.doors;

      const updatedSeals =
        tick.s && base.room.seals
          ? base.room.seals.map(seal => {
              const found = tick.s.find((ts: any) => ts.id === seal.id);
              return found ? { ...seal, progress: found.progress, isActivated: found.isActivated } : seal;
            })
          : base.room.seals;

      const updatedWalls =
        tick.sw && base.room.walls
          ? base.room.walls.map(wall => {
              const found = tick.sw.find((tw: any) => tw.id === wall.id);
              return found ? { ...wall, hp: found.hp, isOpen: found.isOpen } : wall;
            })
          : base.room.walls;

      const merged: GameWorldState = {
        ...base,
        room: {
          ...base.room,
          isCleared: tick.c,
          doors: updatedDoors,
          currentWave: tick.wv ?? base.room.currentWave,
          totalWaves: tick.tw ?? base.room.totalWaves,
          secretFound: tick.sf ?? base.room.secretFound,
          seals: updatedSeals,
          walls: updatedWalls,
          hearts: tick.h !== undefined ? tick.h : base.room.hearts,
          barrels: tick.b !== undefined ? tick.b : base.room.barrels,
          hazards: tick.hz !== undefined ? tick.hz : base.room.hazards,
        },
        players: mergedPlayers,
        enemies: tick.e || [],
        projectiles: tick.pr || [],
        recentEvents: tick.ev || [],
        directorAnger: tick.da ?? base.directorAnger,
        directorDialogue: tick.dd || base.directorDialogue,
      };

      processWorldUpdate(merged);
    });

    socket.on('connect', () => {
      setErrorMessage(null);
      const savedCode = sessionStorage.getItem('calabozo_room_code');
      const savedPlayerId = sessionStorage.getItem('calabozo_player_id');
      if (savedCode && savedPlayerId) {
        socket.emit('room:reconnect', { code: savedCode, playerId: savedPlayerId }, (res: any) => {
          if (res?.success) {
            localPlayerIdRef.current = res.playerId;
            setLocalPlayerId(res.playerId);
            sessionStorage.setItem('calabozo_player_id', res.playerId);
            sessionStorage.setItem('calabozo_room_code', res.code);
            worldRef.current = res.state;
            setWorld(res.state);
            setErrorMessage(null);

            const p = res.state?.players?.[res.playerId];
            if (p) {
              const sim = localSimRef.current;
              sim.roomIndex = res.state.room.roomIndex;
              sim.x = p.x;
              sim.y = p.y;
              sim.vx = 0;
              sim.vy = 0;
              sim.isDashing = false;
              inputHistoryRef.current = [];
              rendererRef.current.clearSmoothPositions();
              rendererRef.current.cameraX = p.x - window.innerWidth / 2;
              rendererRef.current.cameraY = p.y - window.innerHeight / 2;
            }
          } else {
            sessionStorage.removeItem('calabozo_room_code');
            sessionStorage.removeItem('calabozo_player_id');
          }
        });
      }
    });

    socket.on('disconnect', () => {
      setErrorMessage('Conexión perdida con el servidor. Reconectando...');
    });

    return () => {
      socket.off('world:state');
      socket.off('world:tick');
      socket.off('connect');
      socket.off('disconnect');
      sfx.resetLowHpState();
      ambience.stop();
    };
  }, []);

  // Dynamic Soundtrack Theme Synchronization
  useEffect(() => {
    if (!world || world.phase === 'LOBBY') {
      soundtrack.setTheme('LOBBY');
    } else if (world.phase === 'PLAYING') {
      if (world.room.encounterType === 'SANCTUARY') {
        soundtrack.setTheme('SANCTUARY');
      } else if (world.room.encounterType === 'BOSS') {
        soundtrack.setTheme('BOSS');
      } else {
        soundtrack.setTheme('DUNGEON');
      }
    } else if (world.phase === 'VICTORY') {
      soundtrack.setTheme('VICTORY');
    } else if (world.phase === 'GAME_OVER') {
      soundtrack.setTheme('GAMEOVER');
    }
  }, [world?.phase, world?.room?.encounterType, world?.room?.roomIndex]);

  // Helper to read current movement vector
  const getMoveVector = useCallback(() => {
    let moveX = 0;
    let moveY = 0;

    if (keysDown.current['w'] || keysDown.current['arrowup']) moveY -= 1;
    if (keysDown.current['s'] || keysDown.current['arrowdown']) moveY += 1;
    if (keysDown.current['a'] || keysDown.current['arrowleft']) moveX -= 1;
    if (keysDown.current['d'] || keysDown.current['arrowright']) moveX += 1;

    if (touchMove.current.x !== 0 || touchMove.current.y !== 0) {
      moveX = touchMove.current.x;
      moveY = touchMove.current.y;
    }

    const len = Math.hypot(moveX, moveY);
    if (len > 1) {
      moveX /= len;
      moveY /= len;
    }
    return { moveX, moveY, len: Math.min(1, len) };
  }, []);

  // Spawn local predictive projectile for 0ms visual feedback
  const spawnLocalPredictiveAttack = useCallback((player: PlayerEntity) => {
    const sim = localSimRef.current;
    const base = CLASS_CONFIGS[player.classType] || CLASS_CONFIGS.CAZADOR;
    const speed = base.bulletSpeed;
    const finalAngle = sim.angle;
    const color =
      player.classType === 'GUERRERO'
        ? '#f59e0b'
        : player.classType === 'MAGO'
        ? '#ea580c'
        : player.classType === 'PICARO'
        ? '#10b981'
        : '#0284c7';

    rendererRef.current.addPredictiveProjectile({
      id: `local_p_${Date.now()}_${Math.random()}`,
      ownerId: player.id,
      fromPlayer: true,
      x: sim.x + Math.cos(finalAngle) * 28,
      y: sim.y + Math.sin(finalAngle) * 28,
      vx: Math.cos(finalAngle) * speed,
      vy: Math.sin(finalAngle) * speed,
      radius: player.classType === 'GUERRERO' ? 26 : player.classType === 'MAGO' ? 14 : player.classType === 'PICARO' ? 10 : 7,
      damage: base.attackDamage,
      color,
      bouncesRemaining: base.bulletBounces,
      createdAt: Date.now(),
      lifetimeMs: base.bulletLifetimeMs,
      isExplosive: player.classType === 'MAGO',
    });
  }, []);

  // Input Sender to Server with Sequence Numbering
  const sendPlayerInput = useCallback((overrideDash = false, overrideSkill = false) => {
    const currentWorld = worldRef.current;
    const currentPlayerId = localPlayerIdRef.current;
    if (!currentWorld || currentWorld.phase !== 'PLAYING' || !currentWorld.code) return;
    const player = currentWorld.players[currentPlayerId];
    if (!player || !player.isAlive) return;

    const { moveX, moveY, len } = getMoveVector();
    const sim = localSimRef.current;
    const isAttacking = isMouseDown.current || touchAttack.current;
    const seq = ++inputSeqRef.current;
    const now = Date.now();
    const dt = lastInputTimeRef.current > 0 ? Math.max(0.01, Math.min(0.08, (now - lastInputTimeRef.current) / 1000)) : 0.05;
    lastInputTimeRef.current = now;

    const isDashing = overrideDash || sim.isDashing || now < sim.dashEndsAt;

    // Store in history buffer for replay reconciliation
    inputHistoryRef.current.push({
      seq,
      dt,
      moveX,
      moveY,
      len,
      angle: sim.angle,
      isDashing,
      dashEndsAt: sim.dashEndsAt,
      timestamp: now,
    });
    if (inputHistoryRef.current.length > 120) {
      inputHistoryRef.current.shift();
    }

    socket.emit('player:input', {
      code: currentWorld.code,
      seq,
      clientTime: now,
      moveX: Number(moveX.toFixed(2)),
      moveY: Number(moveY.toFixed(2)),
      angle: Number(sim.angle.toFixed(2)),
      isAttacking,
      isDashing: overrideDash,
      isUsingSkill: overrideSkill,
      x: Math.round(sim.x),
      y: Math.round(sim.y),
      vx: Math.round(sim.vx),
      vy: Math.round(sim.vy),
      roomIndex: currentWorld.room.roomIndex,
    });
  }, [getMoveVector]);

  const triggerDash = useCallback(() => {
    const currentWorld = worldRef.current;
    const currentPlayerId = localPlayerIdRef.current;
    if (!currentWorld || currentWorld.phase !== 'PLAYING') return;
    const player = currentWorld.players[currentPlayerId];
    const now = Date.now();
    const sim = localSimRef.current;
    if (!player || !player.isAlive || sim.isDashing) return;

    // Input buffering if pressed within 130ms of cooldown end
    if (now < player.dashCooldownEndsAt) {
      const remaining = player.dashCooldownEndsAt - now;
      if (remaining <= 130) {
        bufferedActionRef.current = { type: 'DASH', readyAt: player.dashCooldownEndsAt };
      }
      return;
    }

    const stats = CLASS_CONFIGS[player.classType] || CLASS_CONFIGS.CAZADOR;
    const { moveX, moveY, len } = getMoveVector();
    const dirX = len > 0.1 ? moveX / len : Math.cos(sim.angle);
    const dirY = len > 0.1 ? moveY / len : Math.sin(sim.angle);

    // Apply dash immediately on local client (0ms latency)
    sim.isDashing = true;
    sim.dashEndsAt = now + stats.dashDurationMs;
    sim.dashCooldownEndsAt = now + stats.dashCooldownMs;
    sim.vx = dirX * stats.dashSpeed;
    sim.vy = dirY * stats.dashSpeed;
    player.isDashing = true;
    player.dashEndsAt = sim.dashEndsAt;
    player.dashCooldownEndsAt = sim.dashCooldownEndsAt;
    player.vx = sim.vx;
    player.vy = sim.vy;

    sfx.playDash();
    sendPlayerInput(true, false);
  }, [getMoveVector, sendPlayerInput]);

  const triggerSkill = useCallback(() => {
    const currentWorld = worldRef.current;
    const currentPlayerId = localPlayerIdRef.current;
    if (!currentWorld || currentWorld.phase !== 'PLAYING') return;
    const player = currentWorld.players[currentPlayerId];
    const now = Date.now();
    const sim = localSimRef.current;
    if (!player || !player.isAlive) return;

    // Input buffering if pressed within 130ms of skill cooldown end
    if (now < player.skillCooldownEndsAt) {
      const remaining = player.skillCooldownEndsAt - now;
      if (remaining <= 130) {
        bufferedActionRef.current = { type: 'SKILL', readyAt: player.skillCooldownEndsAt };
      }
      return;
    }

    const stats = CLASS_CONFIGS[player.classType] || CLASS_CONFIGS.CAZADOR;
    let skillCdMult = 1;
    for (const r of player.relics) {
      if (r.modifiers.skillCooldownMultiplier) skillCdMult *= r.modifiers.skillCooldownMultiplier;
    }
    const effSkillCd = Math.max(1800, Math.round(stats.skillCooldownMs * skillCdMult));

    sim.skillCooldownEndsAt = now + effSkillCd;
    player.skillCooldownEndsAt = sim.skillCooldownEndsAt;

    if (player.classType === 'PICARO') {
      const W = currentWorld.room.width || 1200;
      const H = currentWorld.room.height || 800;
      const originX = sim.x;
      const originY = sim.y;
      sim.x = Math.max(60, Math.min(W - 60, sim.x + Math.cos(sim.angle) * 145));
      sim.y = Math.max(60, Math.min(H - 60, sim.y + Math.sin(sim.angle) * 145));
      player.x = sim.x;
      player.y = sim.y;
      player.stealthedUntil = now + 2600;
      inputHistoryRef.current = []; // Clear pending inputs so old walking inputs don't pull back
      rendererRef.current.particleSystem.emitExplosion(originX, originY, 60, '#10b981');
    } else if (player.classType === 'GUERRERO') {
      player.skillActiveUntil = now + 2200;
      rendererRef.current.particleSystem.addShockwave(sim.x, sim.y, 170, '#f59e0b', 4);
    } else if (player.classType === 'CAZADOR') {
      // Local predictive fan of 5 ice arrows
      const fanCount = 5;
      const fanSpread = 0.65;
      for (let i = 0; i < fanCount; i++) {
        const a = sim.angle + (i - 2) * (fanSpread / 4);
        rendererRef.current.addPredictiveProjectile({
          id: `local_skill_${Date.now()}_${i}`,
          ownerId: player.id,
          fromPlayer: true,
          x: sim.x + Math.cos(a) * 28,
          y: sim.y + Math.sin(a) * 28,
          vx: Math.cos(a) * 860,
          vy: Math.sin(a) * 860,
          radius: 8,
          damage: Math.round(stats.attackDamage * 1.35),
          color: '#38bdf8',
          bouncesRemaining: stats.bulletBounces + 1,
          createdAt: now,
          lifetimeMs: 1400,
          isCrit: true,
          element: 'ICE',
        });
      }
    }

    sfx.playSkill(player.classType);
    sendPlayerInput(false, true);
  }, [sendPlayerInput]);

  const triggerPing = useCallback(() => {
    const currentWorld = worldRef.current;
    if (!currentWorld || currentWorld.phase !== 'PLAYING' || !currentWorld.code) return;
    const renderer = rendererRef.current;
    const worldX = mousePos.current.x + renderer.cameraX;
    const worldY = mousePos.current.y + renderer.cameraY;
    socket.emit('player:ping', {
      code: currentWorld.code,
      x: worldX,
      y: worldY,
    });
  }, []);

  // HTML5 Gamepad API Poller
  const pollGamepad = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return;
    const gamepads = navigator.getGamepads();
    const gp = gamepads[0] || gamepads[1];
    if (!gp) return;

    // Left stick for movement (deadzone 0.16)
    const lx = Math.abs(gp.axes[0]) > 0.16 ? gp.axes[0] : 0;
    const ly = Math.abs(gp.axes[1]) > 0.16 ? gp.axes[1] : 0;
    if (lx !== 0 || ly !== 0) {
      touchMove.current = { x: lx, y: ly };
    } else if (touchMove.current.x !== 0 && !('ontouchstart' in window)) {
      touchMove.current = { x: 0, y: 0 };
    }

    // Right stick for aiming (deadzone 0.2)
    const rx = Math.abs(gp.axes[2]) > 0.2 ? gp.axes[2] : 0;
    const ry = Math.abs(gp.axes[3]) > 0.2 ? gp.axes[3] : 0;
    if (rx !== 0 || ry !== 0) {
      localSimRef.current.angle = Math.atan2(ry, rx);
      rendererRef.current.targetLockPos = null;
    }

    // Button 0 (A) or Button 7 (R2): Primary Attack
    const attackPressed = gp.buttons[0]?.pressed || gp.buttons[7]?.pressed;
    if (attackPressed && !isMouseDown.current) {
      isMouseDown.current = true;
      sendPlayerInput(false, false);
    } else if (!attackPressed && isMouseDown.current && !keysDown.current['mouse0']) {
      isMouseDown.current = false;
    }

    // Button 1 (B) or Button 5 (R1): Dash
    if ((gp.buttons[1]?.pressed || gp.buttons[5]?.pressed) && !gamepadDashDown.current) {
      gamepadDashDown.current = true;
      triggerDash();
    } else if (!gp.buttons[1]?.pressed && !gp.buttons[5]?.pressed) {
      gamepadDashDown.current = false;
    }

    // Button 2 (X) or Button 6 (L2): Skill
    if ((gp.buttons[2]?.pressed || gp.buttons[6]?.pressed) && !gamepadSkillDown.current) {
      gamepadSkillDown.current = true;
      triggerSkill();
    } else if (!gp.buttons[2]?.pressed && !gp.buttons[6]?.pressed) {
      gamepadSkillDown.current = false;
    }

    // Button 3 (Y): Tactical Ping
    if (gp.buttons[3]?.pressed && !gamepadPingDown.current) {
      gamepadPingDown.current = true;
      triggerPing();
    } else if (!gp.buttons[3]?.pressed) {
      gamepadPingDown.current = false;
    }
  }, [triggerDash, triggerSkill, triggerPing, sendPlayerInput]);

  // Keyboard & Mouse Listeners
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      keysDown.current[k] = true;
      keysDown.current[e.code] = true;

      if (e.code === 'Space' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
        e.preventDefault();
        triggerDash();
      } else if (k === 'e' || k === 'q') {
        triggerSkill();
      } else if (k === 'g') {
        triggerPing();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      keysDown.current[e.key.toLowerCase()] = false;
      keysDown.current[e.code] = false;
    };

    const handleMouseMove = (e: MouseEvent) => {
      mousePos.current = { x: e.clientX, y: e.clientY };
      mouseMovedOnce.current = true;
      explicitTouchAngle.current = undefined;
    };

    const handleMouseDown = (e: MouseEvent) => {
      if (e.button === 0) {
        keysDown.current['mouse0'] = true;
        isMouseDown.current = true;
        sendPlayerInput(false, false);
      } else if (e.button === 2) {
        e.preventDefault();
        triggerSkill();
      } else if (e.button === 1) {
        e.preventDefault();
        triggerPing();
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (e.button === 0) {
        keysDown.current['mouse0'] = false;
        isMouseDown.current = false;
      }
    };

    const handleContextMenu = (e: MouseEvent) => {
      if (worldRef.current?.phase === 'PLAYING') {
        e.preventDefault();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('contextmenu', handleContextMenu);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('contextmenu', handleContextMenu);
    };
  }, [triggerDash, triggerSkill, triggerPing, sendPlayerInput]);

  useEffect(() => {
    const interval = setInterval(() => {
      sendPlayerInput(false, false);
    }, 1000 / 20);

    return () => clearInterval(interval);
  }, [sendPlayerInput]);

  // Persistent 60-144 FPS Canvas Render & Client Prediction Loop
  useEffect(() => {
    let animId: number;
    let lastTime = performance.now();

    const loop = (time: number) => {
      const dt = Math.min(0.05, (time - lastTime) / 1000);
      lastTime = time;

      const canvas = canvasRef.current;
      const currentWorld = worldRef.current;
      const currentPlayerId = localPlayerIdRef.current;

      // Poll Gamepad every frame
      pollGamepad();

      if (canvas && currentWorld) {
        const player = currentWorld.players[currentPlayerId] || (localPlayerIdRef.current ? currentWorld.players[localPlayerIdRef.current] : undefined);
        if (player && currentWorld.phase === 'PLAYING') {
          const now = Date.now();
          const sim = localSimRef.current;
          const renderer = rendererRef.current;

          // Room change check MUST run whenever player exists, alive or fallen!
          if (sim.roomIndex !== currentWorld.room.roomIndex) {
            sim.roomIndex = currentWorld.room.roomIndex;
            sim.x = player.x;
            sim.y = player.y;
            sim.vx = 0;
            sim.vy = 0;
            sim.isDashing = false;
            inputHistoryRef.current = [];
            renderer.clearSmoothPositions();
            renderer.cameraX = player.x - canvas.width / 2;
            renderer.cameraY = player.y - canvas.height / 2;
          }

          if (player.isAlive) {
            // Process input buffer (Dash / Skill queued within 130ms)
            if (bufferedActionRef.current && now >= bufferedActionRef.current.readyAt) {
              const act = bufferedActionRef.current.type;
              bufferedActionRef.current = null;
              if (act === 'DASH') triggerDash();
              else if (act === 'SKILL') triggerSkill();
            }

          // Auto-aim logic for touch / gamepad or fallback
          const isTouchActive = touchAttack.current || touchMove.current.x !== 0 || touchMove.current.y !== 0;
          if (isTouchActive || !mouseMovedOnce.current) {
            if (explicitTouchAngle.current !== undefined) {
              sim.angle = explicitTouchAngle.current;
              renderer.targetLockPos = null;
            } else {
              // Smart Auto-Aim towards nearest living enemy
              let nearestE: EnemyEntity | null = null;
              let minDist = 480;
              for (const e of currentWorld.enemies) {
                const d = Math.hypot(e.x - sim.x, e.y - sim.y);
                if (d < minDist) {
                  minDist = d;
                  nearestE = e;
                }
              }
              if (nearestE) {
                sim.angle = Math.atan2(nearestE.y - sim.y, nearestE.x - sim.x);
                renderer.targetLockPos = { x: nearestE.x, y: nearestE.y };
              } else {
                renderer.targetLockPos = null;
                const { moveX, moveY, len } = getMoveVector();
                if (len > 0.1) {
                  sim.angle = Math.atan2(moveY, moveX);
                }
              }
            }
          } else {
            renderer.targetLockPos = null;
            const playerScreenX = sim.x - renderer.cameraX;
            const playerScreenY = sim.y - renderer.cameraY;
            sim.angle = Math.atan2(mousePos.current.y - playerScreenY, mousePos.current.x - playerScreenX);
          }

          const base = CLASS_CONFIGS[player.classType] || CLASS_CONFIGS.CAZADOR;
          let speedMult = 1;
          let cdMult = Math.pow(0.94, (player.weaponLevel || 1) - 1);
          for (const r of player.relics) {
            if (r.modifiers.moveSpeedMultiplier) speedMult *= r.modifiers.moveSpeedMultiplier;
            if (r.modifiers.attackCooldownMultiplier) cdMult *= r.modifiers.attackCooldownMultiplier;
          }

          // Smooth post-dash momentum decay
          if (sim.isDashing && now >= sim.dashEndsAt) {
            sim.isDashing = false;
            sim.vx *= 0.55;
            sim.vy *= 0.55;
          }

          if (!sim.isDashing) {
            const frenzyBonus = player.combo >= 15 ? 1.15 : player.combo >= 8 ? 1.08 : 1.0;
            const stealthBonus = player.stealthedUntil && now < player.stealthedUntil ? 1.25 : 1.0;
            const targetSpeed = Math.round(base.moveSpeed * speedMult) * frenzyBonus * stealthBonus;
            const { moveX, moveY, len } = getMoveVector();
            const normX = len > 0 ? (moveX / len) * targetSpeed : 0;
            const normY = len > 0 ? (moveY / len) * targetSpeed : 0;

            const isIce = currentWorld.room.mutation.frictionMultiplier < 0.3;
            const rate = isIce ? (len > 0 ? 14 : 1.8) : 22;
            const blend = Math.min(1, dt * rate);
            sim.vx += (normX - sim.vx) * blend;
            sim.vy += (normY - sim.vy) * blend;
          }

          sim.x += sim.vx * dt;
          sim.y += sim.vy * dt;

          // Tangential sliding on pillars
          const pillars = currentWorld.room.pillars || [];
          for (const pil of pillars) {
            const dx = sim.x - pil.x;
            const dy = sim.y - pil.y;
            const dist = Math.hypot(dx, dy);
            const minDist = pil.radius + 18;
            if (dist < minDist && dist > 0.001) {
              const nx = dx / dist;
              const ny = dy / dist;
              sim.x = pil.x + nx * minDist;
              sim.y = pil.y + ny * minDist;
              const vDotN = sim.vx * nx + sim.vy * ny;
              if (vDotN < 0) {
                sim.vx -= vDotN * nx;
                sim.vy -= vDotN * ny;
              }
            }
          }

          // Tangential sliding on interior walls
          const walls = currentWorld.room.walls || [];
          const playerRadius = 18;
          for (const w of walls) {
            if (w.isOpen) continue;
            const closestX = Math.max(w.x, Math.min(sim.x, w.x + w.width));
            const closestY = Math.max(w.y, Math.min(sim.y, w.y + w.height));
            const dx = sim.x - closestX;
            const dy = sim.y - closestY;
            const distSq = dx * dx + dy * dy;
            if (distSq < playerRadius * playerRadius) {
              const dist = Math.sqrt(distSq);
              let nx = 0;
              let ny = 0;
              if (dist > 0.001) {
                nx = dx / dist;
                ny = dy / dist;
                const overlap = playerRadius - dist;
                sim.x += nx * overlap;
                sim.y += ny * overlap;
              } else {
                const leftPen = sim.x - w.x;
                const rightPen = w.x + w.width - sim.x;
                const topPen = sim.y - w.y;
                const botPen = w.y + w.height - sim.y;
                const minPen = Math.min(leftPen, rightPen, topPen, botPen);
                if (minPen === leftPen) { sim.x = w.x - playerRadius; nx = -1; ny = 0; }
                else if (minPen === rightPen) { sim.x = w.x + w.width + playerRadius; nx = 1; ny = 0; }
                else if (minPen === topPen) { sim.y = w.y - playerRadius; nx = 0; ny = -1; }
                else { sim.y = w.y + w.height + playerRadius; nx = 0; ny = 1; }
              }
              const vDotN = sim.vx * nx + sim.vy * ny;
              if (vDotN < 0) {
                sim.vx -= vDotN * nx;
                sim.vy -= vDotN * ny;
              }
            }
          }

          // Clamp to room bounds
          const W = currentWorld.room.width || 2000;
          const H = currentWorld.room.height || 1450;
          const pad = 48;
          const isCleared = currentWorld.room.isCleared;
          const doors = currentWorld.room.doors;

          if (sim.y < pad && !((isCleared || doors?.NORTH?.open) && Math.abs(sim.x - W / 2) < 82)) {
            sim.y = pad;
            sim.vy = 0;
          }
          if (sim.y > H - pad) {
            sim.y = H - pad;
            sim.vy = 0;
          }
          if (sim.x < pad && !((isCleared || doors?.WEST?.open) && Math.abs(sim.y - H / 2) < 82)) {
            sim.x = pad;
            sim.vx = 0;
          }
          if (sim.x > W - pad && !((isCleared || doors?.EAST?.open) && Math.abs(sim.y - H / 2) < 82)) {
            sim.x = W - pad;
            sim.vx = 0;
          }

          // Procedural footsteps on stone floor
          const moveSpeed = Math.hypot(sim.vx, sim.vy);
          if (moveSpeed > 35 && !sim.isDashing) {
            sfx.playFootstep(sim.x, sim.y, sim.x, sim.y);
          }

          // Near-miss bullet graze audio (projectile whiz by)
          if (currentWorld.projectiles && currentWorld.projectiles.length > 0) {
            for (const pr of currentWorld.projectiles) {
              if (!pr.fromPlayer && !nearMissProjectilesRef.current.has(pr.id)) {
                const distToPlayer = Math.hypot(pr.x - sim.x, pr.y - sim.y);
                if (distToPlayer > 18 && distToPlayer < 48) {
                  nearMissProjectilesRef.current.add(pr.id);
                  sfx.playNearMiss();
                }
              }
            }
            if (nearMissProjectilesRef.current.size > 80) {
              const activeIds = new Set(currentWorld.projectiles.map(p => p.id));
              for (const id of nearMissProjectilesRef.current) {
                if (!activeIds.has(id)) nearMissProjectilesRef.current.delete(id);
              }
            }
          }

          // Instant local weapon swing / shoot animation, predictive projectile & sound
          const isAttacking = isMouseDown.current || touchAttack.current;
          const effAttackCd = Math.max(95, Math.round(base.attackCooldownMs * cdMult));
          if (isAttacking && now - sim.lastAttackAt >= effAttackCd) {
            sim.lastAttackAt = now;
            player.lastAttackAt = now;
            sfx.playWeaponAttack(player.classType);
            spawnLocalPredictiveAttack(player);

            // Kinetic Weapon Slash Arcs & Tactile Recoil Kickback
            if (player.classType === 'GUERRERO') {
              rendererRef.current.particleSystem.addSlashArc(sim.x, sim.y, sim.angle, 42, Math.PI * 0.85, '#f59e0b', '#ffffff');
            } else if (player.classType === 'PICARO') {
              rendererRef.current.particleSystem.addSlashArc(sim.x, sim.y, sim.angle, 32, Math.PI * 0.65, '#10b981', '#a7f3d0');
            } else {
              // Recoil punchback for ranged shooters (Cazador crossbow kick & Mago pyro surge)
              sim.vx -= Math.cos(sim.angle) * 38;
              sim.vy -= Math.sin(sim.angle) * 38;
            }
          }

          player.x = sim.x;
          player.y = sim.y;
          player.vx = sim.vx;
          player.vy = sim.vy;
          player.angle = sim.angle;
          player.isDashing = sim.isDashing;
        }
      }

        const ctx = canvas.getContext('2d');
        if (ctx) {
          if (canvas.width !== window.innerWidth || canvas.height !== window.innerHeight) {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
          }
          rendererRef.current.render(ctx, currentWorld, currentPlayerId, canvas.width, canvas.height, dt);
        }
      }

      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, [getMoveVector, spawnLocalPredictiveAttack, pollGamepad, triggerDash, triggerSkill]);

  // Create Room Handler
  const handleCreateRoom = (playerName: string, classType: PlayerClass, avatarIndex = 0) => {
    setIsLoading(true);
    setErrorMessage(null);
    socket.emit('room:create', { playerName, classType, avatarIndex }, (res: any) => {
      setIsLoading(false);
      if (res.success) {
        localPlayerIdRef.current = res.playerId;
        setLocalPlayerId(res.playerId);
        sessionStorage.setItem('calabozo_player_id', res.playerId);
        sessionStorage.setItem('calabozo_room_code', res.code);
        worldRef.current = res.state;
        setWorld(res.state);
      } else {
        setErrorMessage(res.error || 'Error al crear la mazmorra');
      }
    });
  };

  // Join Room Handler
  const handleJoinRoom = (code: string, playerName: string, classType: PlayerClass, avatarIndex = 0) => {
    setIsLoading(true);
    setErrorMessage(null);
    socket.emit('room:join', { code, playerName, classType, avatarIndex }, (res: any) => {
      setIsLoading(false);
      if (res.success) {
        localPlayerIdRef.current = res.playerId;
        setLocalPlayerId(res.playerId);
        sessionStorage.setItem('calabozo_player_id', res.playerId);
        sessionStorage.setItem('calabozo_room_code', res.code);
        worldRef.current = res.state;
        setWorld(res.state);
      } else {
        setErrorMessage(res.error || 'Error al unirse a la mazmorra');
      }
    });
  };

  const handleChangeClass = (classType: PlayerClass) => {
    if (!world?.code) return;
    socket.emit('player:change_class', { code: world.code, classType });
  };

  const handleAddBot = (classType?: PlayerClass) => {
    if (!world?.code) return;
    socket.emit('room:add_bot', { code: world.code, classType });
  };

  const handleRemoveBots = () => {
    if (!world?.code) return;
    socket.emit('room:remove_bots', { code: world.code });
  };

  const handleStartGame = () => {
    if (!world?.code) return;
    socket.emit('game:start', { code: world.code });
  };

  const handleRestartGame = () => {
    if (!world?.code) return;
    socket.emit('game:restart', { code: world.code });
  };

  const handleContinueEndless = () => {
    if (!world?.code) return;
    socket.emit('game:endless', { code: world.code });
  };

  const handlePickRelic = (relicId: string) => {
    if (!world?.code) return;
    sfx.playUiClick();
    setShowRelicModal(false);
    socket.emit('relic:pick', { code: world.code, relicId });
  };

  const handleAltarInteract = useCallback((action: 'UPGRADE_WEAPON' | 'BUY_HEAL' | 'BUY_SHIELD' | 'ACCEPT_PACT') => {
    const code = worldRef.current?.code;
    if (!code) return;
    sfx.playPurseRattle();
    if (action === 'UPGRADE_WEAPON') {
      sfx.playAltarUpgrade();
    } else if (action === 'ACCEPT_PACT') {
      sfx.playSynergy();
    } else if (action === 'BUY_HEAL') {
      sfx.playHeal();
    } else if (action === 'BUY_SHIELD') {
      sfx.playHit(true);
    }
    socket.emit('altar:interact', { code, action });
  }, []);

  const handleTouchMove = useCallback((x: number, y: number) => {
    touchMove.current = { x, y };
  }, []);

  const handleTouchAttack = useCallback((attacking: boolean, explicitAngle?: number) => {
    touchAttack.current = attacking;
    explicitTouchAngle.current = explicitAngle;
    if (attacking) {
      sendPlayerInput(false, false);
    }
  }, [sendPlayerInput]);

  const localPlayer = world?.players[localPlayerId];
  const isPlaying = world && world.phase === 'PLAYING';
  const isGameOverOrVictory = world && (world.phase === 'GAME_OVER' || world.phase === 'VICTORY');

  return (
    <div className="relative w-screen h-screen bg-gray-950 overflow-hidden font-sans select-none">
      {/* Canvas Layer */}
      <canvas ref={canvasRef} className="absolute inset-0 block cursor-crosshair" />

      {/* Lobby View Overlay */}
      {(!world || world.phase === 'LOBBY') && (
        <LobbyView
          world={world}
          localPlayerId={localPlayerId}
          onCreateRoom={handleCreateRoom}
          onJoinRoom={handleJoinRoom}
          onChangeClass={handleChangeClass}
          onAddBot={handleAddBot}
          onRemoveBots={handleRemoveBots}
          onStartGame={handleStartGame}
          isLoading={isLoading}
          errorMessage={errorMessage}
          onOpenAudio={() => setShowAudioModal(true)}
        />
      )}

      {/* Top AI Director Banner */}
      {isPlaying && world && (
        <DirectorBanner
          dialogue={world.directorDialogue}
          mutation={world.room.mutation}
          roomIndex={world.room.roomIndex}
          totalRooms={world.room.totalRooms}
          encounterType={world.room.encounterType}
          directorAnger={world.directorAnger}
          onOpenAudio={() => setShowAudioModal(true)}
        />
      )}

      {/* Bottom Player HUD + Altar of Pacts & Armory */}
      {isPlaying && localPlayer && world && (
        <PlayerHUD
          player={localPlayer}
          roomIndex={world.room.roomIndex}
          totalRooms={world.room.totalRooms}
          enemiesRemaining={world.enemies.length}
          altar={world.room.altar}
          ping={networkPing}
          onAltarInteract={handleAltarInteract}
          onOpenAudio={() => setShowAudioModal(true)}
        />
      )}

      {/* Relic Selection Modal */}
      {showRelicModal && world?.room.chest && (
        <RelicChoiceModal
          relics={world.room.chest.relicOptions}
          onSelect={handlePickRelic}
        />
      )}

      {/* Game Over / Victory / Endless Ascension Modal */}
      {isGameOverOrVictory && world && (
        <EndGameModal
          world={world}
          isHost={!!localPlayer?.isHost}
          onRestart={handleRestartGame}
          onContinueEndless={handleContinueEndless}
        />
      )}

      {/* Touch Controls (Mobile) */}
      {isPlaying && (
        <TouchControls
          onMoveChange={handleTouchMove}
          onAttackChange={handleTouchAttack}
          onDash={triggerDash}
          onSkill={triggerSkill}
        />
      )}

      {/* Audio & Graphics Quality Settings Modal */}
      <AudioSettingsModal
        isOpen={showAudioModal}
        onClose={() => setShowAudioModal(false)}
        currentQuality={rendererRef.current.quality}
        onQualityChange={q => rendererRef.current.setQuality(q)}
      />
    </div>
  );
};
