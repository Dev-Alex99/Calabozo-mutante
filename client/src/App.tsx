import React, { useEffect, useRef, useState, useCallback } from 'react';
import { socket } from './socket';
import { GameWorldState, PlayerClass, CLASS_CONFIGS, EnemyEntity } from './types';
import { GameRenderer } from './engine/Renderer';
import { LobbyView } from './components/LobbyView';
import { DirectorBanner } from './components/DirectorBanner';
import { PlayerHUD } from './components/PlayerHUD';
import { RelicChoiceModal } from './components/RelicChoiceModal';
import { EndGameModal } from './components/EndGameModal';
import { TouchControls } from './components/TouchControls';
import { sfx } from './audio/sfx';

export const App: React.FC = () => {
  const [world, setWorld] = useState<GameWorldState | null>(null);
  const [localPlayerId, setLocalPlayerId] = useState<string>(() => sessionStorage.getItem('calabozo_player_id') || '');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showRelicModal, setShowRelicModal] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<GameRenderer>(new GameRenderer());
  const worldRef = useRef<GameWorldState | null>(null);
  const localPlayerIdRef = useRef<string>(localPlayerId);

  const prevHpRef = useRef<number | null>(null);
  const prevGoldRef = useRef<number | null>(null);
  const prevClearedRef = useRef<boolean>(false);
  const prevPhaseRef = useRef<string>('');
  const prevEnemiesRef = useRef<EnemyEntity[]>([]);
  const processedEventsRef = useRef<Set<string>>(new Set());
  const lastHudRenderAtRef = useRef<number>(0);
  const lastHudRoomRef = useRef<number>(-1);
  const lastDialogueTsRef = useRef<number>(0);

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
  const isMouseDown = useRef(false);
  const touchMove = useRef({ x: 0, y: 0 });
  const touchAttack = useRef(false);

  useEffect(() => {
    localPlayerIdRef.current = localPlayerId;
  }, [localPlayerId]);

  // Initialize AudioContext on first user interaction
  useEffect(() => {
    const handleFirstClick = () => {
      sfx.playShoot();
      window.removeEventListener('click', handleFirstClick);
      window.removeEventListener('keydown', handleFirstClick);
    };
    window.addEventListener('click', handleFirstClick);
    window.addEventListener('keydown', handleFirstClick);
    return () => {
      window.removeEventListener('click', handleFirstClick);
      window.removeEventListener('keydown', handleFirstClick);
    };
  }, []);

  // Socket Listeners
  useEffect(() => {
    const processWorldUpdate = (updated: GameWorldState) => {
      const now = Date.now();
      const currentPlayerId = localPlayerIdRef.current;
      const player = updated.players[currentPlayerId];
      const renderer = rendererRef.current;
      const sim = localSimRef.current;

      // Reconcile server snapshot with local 60-144 FPS client prediction
      if (player && updated.phase === 'PLAYING') {
        const roomChanged = updated.room.roomIndex !== sim.roomIndex;
        const dist = Math.hypot(player.x - sim.x, player.y - sim.y);

        if (roomChanged || !player.isAlive || dist > 180) {
          // Hard snap on room transition, death/revive, or teleport skill
          sim.roomIndex = updated.room.roomIndex;
          sim.x = player.x;
          sim.y = player.y;
          sim.vx = player.vx;
          sim.vy = player.vy;
          sim.isDashing = player.isDashing;
        } else {
          // Keep client-predicted position & gently blend any server external forces (e.g. gravity well)
          if (dist > 24) {
            sim.x += (player.x - sim.x) * 0.25;
            sim.y += (player.y - sim.y) * 0.25;
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

      if (player) {
        if (prevHpRef.current !== null) {
          if (player.currentHp < prevHpRef.current) {
            sfx.playHit();
            renderer.addScreenShake(7, 0.25);
            renderer.particleSystem.emitBlood(player.x, player.y, '#dc2626', 10);
            renderer.addBloodDecal(player.x, player.y, '#7f1d1d');
          } else if (player.currentHp > prevHpRef.current) {
            sfx.playHeal();
            renderer.particleSystem.emitSparks(player.x, player.y, '#4ade80', 8);
          }
        }
        prevHpRef.current = player.currentHp;

        if (prevGoldRef.current !== null && player.gold > prevGoldRef.current) {
          sfx.playCoin();
          renderer.particleSystem.emitSparks(player.x, player.y, '#facc15', 6);
        }
        prevGoldRef.current = player.gold;
      }

      // Process Synchronized Multiplayer World Events (Explosions, Synergies, Shockwaves, Chain Lightning, Pings)
      if (updated.recentEvents) {
        for (const ev of updated.recentEvents) {
          if (processedEventsRef.current.has(ev.id)) continue;
          processedEventsRef.current.add(ev.id);
          if (processedEventsRef.current.size > 200) {
            const firstKey = processedEventsRef.current.values().next().value;
            if (firstKey) processedEventsRef.current.delete(firstKey);
          }

          if (ev.type === 'EXPLOSION') {
            sfx.playExplosion();
            renderer.addScreenShake(9, 0.28);
            renderer.particleSystem.emitExplosion(ev.x, ev.y, ev.radius || 75, ev.color || '#f97316');
          } else if (ev.type === 'FROST_NOVA') {
            sfx.playSkill();
            renderer.particleSystem.emitExplosion(ev.x, ev.y, ev.radius || 110, '#38bdf8');
          } else if (ev.type === 'TOXIC_BLAST') {
            sfx.playExplosion();
            renderer.particleSystem.emitExplosion(ev.x, ev.y, ev.radius || 95, '#10b981');
          } else if (ev.type === 'SHOCKWAVE') {
            sfx.playSkill();
            renderer.addScreenShake(6, 0.2);
            renderer.particleSystem.addShockwave(ev.x, ev.y, ev.radius || 140, ev.color || '#f59e0b', 4);
          } else if (ev.type === 'SYNERGY') {
            sfx.playSynergy();
            renderer.addScreenShake(5, 0.18);
            renderer.particleSystem.addShockwave(ev.x, ev.y, ev.radius || 95, '#c084fc', 3.5);
            renderer.particleSystem.emitSparks(ev.x, ev.y, '#e879f9', 14);
          } else if (ev.type === 'LIGHTNING_ARC' && ev.targetX !== undefined && ev.targetY !== undefined) {
            renderer.particleSystem.addLightningArc(ev.x, ev.y, ev.targetX, ev.targetY, ev.color || '#38bdf8');
          } else if (ev.type === 'REVIVE') {
            sfx.playHeal();
            renderer.particleSystem.addShockwave(ev.x, ev.y, 90, '#22c55e', 4);
          } else if (ev.type === 'PING') {
            sfx.playPing();
            renderer.particleSystem.addShockwave(ev.x, ev.y, 65, '#f59e0b', 3);
          } else if (ev.type === 'DIRECTOR_INTERVENTION') {
            sfx.playExplosion();
            renderer.addScreenShake(10, 0.35);
            renderer.particleSystem.addShockwave(ev.x, ev.y, ev.radius || 130, ev.color || '#ef4444', 5);
          } else if (ev.type === 'CRIT') {
            renderer.particleSystem.emitSparks(ev.x, ev.y, ev.color || '#facc15', 10);
          }
        }
      }

      // Enemy hit reactions & battlefield death decals
      if (prevEnemiesRef.current && prevEnemiesRef.current.length > 0) {
        for (const prevE of prevEnemiesRef.current) {
          const currentE = updated.enemies.find(e => e.id === prevE.id);
          if (!currentE) {
            sfx.playEnemyDeath();
            const decalColor = prevE.type === 'SLIME' || prevE.type === 'MINI_SLIME' ? '#14532d' : '#450a0a';
            renderer.addBloodDecal(prevE.x, prevE.y, decalColor);
            if (prevE.type === 'SLIME' || prevE.type === 'MINI_SLIME') {
              renderer.particleSystem.emitAcidSpurt(prevE.x, prevE.y, 12);
            } else {
              renderer.particleSystem.emitBlood(prevE.x, prevE.y, '#991b1b', 12);
            }
          } else if (currentE.currentHp < prevE.currentHp) {
            const sparkColor = currentE.type === 'SLIME' ? '#22c55e' : '#dc2626';
            renderer.particleSystem.emitBlood(currentE.x, currentE.y, sparkColor, 6);
          }
        }
      }
      prevEnemiesRef.current = updated.enemies;

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

      // Trigger relic choice modal if chest is available and NOT yet claimed by this player!
      const alreadyClaimed = updated.room.chest?.claimedByPlayerIds?.includes(currentPlayerId);
      const shouldShowRelic = !!(updated.room.isCleared && updated.room.chest && !alreadyClaimed);
      setShowRelicModal(prev => (prev !== shouldShowRelic ? shouldShowRelic : prev));

      // Throttle React HUD state updates during combat to ~5 Hz (every 180ms) unless an important event occurred!
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
          mergedPlayers[id] = { ...existing, ...(pTick as object) };
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
          hearts: tick.h || base.room.hearts,
          barrels: tick.b || base.room.barrels,
          hazards: tick.hz || base.room.hazards,
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
    });

    socket.on('disconnect', () => {
      setErrorMessage('Conexión perdida con el servidor. Reconectando...');
    });

    return () => {
      socket.off('world:state');
      socket.off('world:tick');
      socket.off('connect');
      socket.off('disconnect');
    };
  }, []);

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

  // Input Sender to Server (20 Hz + instant on action)
  const sendPlayerInput = useCallback((overrideDash = false, overrideSkill = false) => {
    const currentWorld = worldRef.current;
    const currentPlayerId = localPlayerIdRef.current;
    if (!currentWorld || currentWorld.phase !== 'PLAYING' || !currentWorld.code) return;
    const player = currentWorld.players[currentPlayerId];
    if (!player || !player.isAlive) return;

    const { moveX, moveY } = getMoveVector();
    const sim = localSimRef.current;
    const isAttacking = isMouseDown.current || touchAttack.current;

    socket.emit('player:input', {
      code: currentWorld.code,
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
    if (!player || !player.isAlive || sim.isDashing || now < player.dashCooldownEndsAt) return;

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
    if (!player || !player.isAlive || now < player.skillCooldownEndsAt) return;

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
      sim.x = Math.max(60, Math.min(W - 60, sim.x + Math.cos(sim.angle) * 145));
      sim.y = Math.max(60, Math.min(H - 60, sim.y + Math.sin(sim.angle) * 145));
      player.x = sim.x;
      player.y = sim.y;
      player.stealthedUntil = now + 2600;
    } else if (player.classType === 'GUERRERO') {
      player.skillActiveUntil = now + 2200;
    }

    sfx.playSkill();
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
    };

    const handleMouseDown = (e: MouseEvent) => {
      if (e.button === 0) {
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

      if (canvas && currentWorld) {
        // 1. Simulate local player physics & aim at full 60-144 FPS (0ms input lag!)
        const player = currentWorld.players[currentPlayerId];
        if (player && player.isAlive && currentWorld.phase === 'PLAYING') {
          const now = Date.now();
          const sim = localSimRef.current;
          if (sim.roomIndex !== currentWorld.room.roomIndex) {
            sim.roomIndex = currentWorld.room.roomIndex;
            sim.x = player.x;
            sim.y = player.y;
            sim.vx = player.vx;
            sim.vy = player.vy;
          }

          const renderer = rendererRef.current;
          const playerScreenX = sim.x - renderer.cameraX;
          const playerScreenY = sim.y - renderer.cameraY;
          sim.angle = Math.atan2(mousePos.current.y - playerScreenY, mousePos.current.x - playerScreenX);

          const base = CLASS_CONFIGS[player.classType] || CLASS_CONFIGS.CAZADOR;
          let speedMult = 1;
          let cdMult = Math.pow(0.94, (player.weaponLevel || 1) - 1);
          for (const r of player.relics) {
            if (r.modifiers.moveSpeedMultiplier) speedMult *= r.modifiers.moveSpeedMultiplier;
            if (r.modifiers.attackCooldownMultiplier) cdMult *= r.modifiers.attackCooldownMultiplier;
          }

          if (sim.isDashing && now >= sim.dashEndsAt) {
            sim.isDashing = false;
            sim.vx *= 0.3;
            sim.vy *= 0.3;
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

          // Resolve pillar collisions locally
          const pillars = currentWorld.room.pillars || [];
          for (const pil of pillars) {
            const dx = sim.x - pil.x;
            const dy = sim.y - pil.y;
            const dist = Math.hypot(dx, dy);
            const minDist = pil.radius + 18;
            if (dist < minDist && dist > 0.001) {
              sim.x = pil.x + (dx / dist) * minDist;
              sim.y = pil.y + (dy / dist) * minDist;
            }
          }

          // Resolve interior Labyrinth wall collisions locally (0ms lag)
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
              if (dist > 0.001) {
                const overlap = playerRadius - dist;
                sim.x += (dx / dist) * overlap;
                sim.y += (dy / dist) * overlap;
              } else {
                const leftPen = sim.x - w.x;
                const rightPen = w.x + w.width - sim.x;
                const topPen = sim.y - w.y;
                const botPen = w.y + w.height - sim.y;
                const minPen = Math.min(leftPen, rightPen, topPen, botPen);
                if (minPen === leftPen) sim.x = w.x - playerRadius;
                else if (minPen === rightPen) sim.x = w.x + w.width + playerRadius;
                else if (minPen === topPen) sim.y = w.y - playerRadius;
                else sim.y = w.y + w.height + playerRadius;
              }
            }
          }

          // Clamp to room bounds (allowing door entry when cleared)
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

          // Instant local weapon swing / shoot animation & sound once per cooldown
          const isAttacking = isMouseDown.current || touchAttack.current;
          const effAttackCd = Math.max(95, Math.round(base.attackCooldownMs * cdMult));
          if (isAttacking && now - sim.lastAttackAt >= effAttackCd) {
            sim.lastAttackAt = now;
            player.lastAttackAt = now;
            if (player.classType === 'GUERRERO' || player.classType === 'PICARO') {
              sfx.playSlash();
            } else {
              sfx.playShoot();
            }
          }

          player.x = sim.x;
          player.y = sim.y;
          player.vx = sim.vx;
          player.vy = sim.vy;
          player.angle = sim.angle;
          player.isDashing = sim.isDashing;
        }

        const ctx = canvas.getContext('2d');
        if (ctx) {
          if (canvas.width !== window.innerWidth || canvas.height !== window.innerHeight) {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
          }

          rendererRef.current.render(
            ctx,
            currentWorld,
            currentPlayerId,
            canvas.width,
            canvas.height,
            dt
          );
        }
      }

      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, [getMoveVector]);

  // Handlers for Lobby & Actions
  const handleCreateRoom = (playerName: string, classType: PlayerClass) => {
    setIsLoading(true);
    setErrorMessage(null);

    socket.emit('room:create', { playerName, classType, avatarIndex: 0 }, (res: any) => {
      setIsLoading(false);
      if (res.success) {
        localPlayerIdRef.current = res.playerId;
        setLocalPlayerId(res.playerId);
        sessionStorage.setItem('calabozo_player_id', res.playerId);
        worldRef.current = res.state;
        setWorld(res.state);
      } else {
        setErrorMessage(res.error || 'Error al crear la mazmorra');
      }
    });
  };

  const handleJoinRoom = (code: string, playerName: string, classType: PlayerClass) => {
    setIsLoading(true);
    setErrorMessage(null);

    socket.emit('room:join', { code, playerName, classType, avatarIndex: 0 }, (res: any) => {
      setIsLoading(false);
      if (res.success) {
        localPlayerIdRef.current = res.playerId;
        setLocalPlayerId(res.playerId);
        sessionStorage.setItem('calabozo_player_id', res.playerId);
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
    setShowRelicModal(false);
    socket.emit('relic:pick', { code: world.code, relicId });
  };

  const handleAltarInteract = useCallback((action: 'UPGRADE_WEAPON' | 'BUY_HEAL' | 'BUY_SHIELD' | 'ACCEPT_PACT') => {
    const code = worldRef.current?.code;
    if (!code) return;
    socket.emit('altar:interact', { code, action });
  }, []);

  const handleTouchMove = useCallback((x: number, y: number) => {
    touchMove.current = { x, y };
  }, []);

  const handleTouchAttack = useCallback((attacking: boolean) => {
    touchAttack.current = attacking;
  }, []);

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
          onAltarInteract={handleAltarInteract}
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
    </div>
  );
};
