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
    socket.on('world:state', (updated: GameWorldState) => {
      worldRef.current = updated;
      setWorld(updated);

      const currentPlayerId = localPlayerIdRef.current;
      const player = updated.players[currentPlayerId];
      const renderer = rendererRef.current;

      if (player) {
        if (prevHpRef.current !== null) {
          if (player.currentHp < prevHpRef.current) {
            const diff = prevHpRef.current - player.currentHp;
            sfx.playHit();
            renderer.addScreenShake(7, 0.25);
            renderer.textManager.spawn(`-${diff}`, player.x, player.y - 20, '#ef4444');
            renderer.particleSystem.emitBlood(player.x, player.y, '#dc2626', 10);
            renderer.addBloodDecal(player.x, player.y, '#7f1d1d');
          } else if (player.currentHp > prevHpRef.current) {
            const diff = player.currentHp - prevHpRef.current;
            sfx.playHeal();
            renderer.textManager.spawn(`+${diff} HP`, player.x, player.y - 25, '#22c55e');
            renderer.particleSystem.emitSparks(player.x, player.y, '#4ade80', 8);
          }
        }
        prevHpRef.current = player.currentHp;

        if (prevGoldRef.current !== null && player.gold > prevGoldRef.current) {
          const goldDiff = player.gold - prevGoldRef.current;
          sfx.playCoin();
          renderer.textManager.spawn(`+${goldDiff} 🪙`, player.x, player.y - 30, '#facc15');
        }
        prevGoldRef.current = player.gold;
      }

      // Process Synchronized Multiplayer World Events (Explosions, Synergies, Shockwaves, Chain Lightning, Pings)
      if (updated.recentEvents) {
        for (const ev of updated.recentEvents) {
          if (processedEventsRef.current.has(ev.id)) continue;
          processedEventsRef.current.add(ev.id);

          if (ev.type === 'EXPLOSION') {
            sfx.playExplosion();
            renderer.addScreenShake(9, 0.28);
            renderer.particleSystem.emitExplosion(ev.x, ev.y, ev.radius || 75, ev.color || '#f97316');
          } else if (ev.type === 'FROST_NOVA') {
            sfx.playSkill();
            renderer.particleSystem.emitExplosion(ev.x, ev.y, ev.radius || 110, '#38bdf8');
            if (ev.text) renderer.textManager.spawn(ev.text, ev.x, ev.y - 20, '#38bdf8');
          } else if (ev.type === 'TOXIC_BLAST') {
            sfx.playExplosion();
            renderer.particleSystem.emitExplosion(ev.x, ev.y, ev.radius || 95, '#10b981');
            if (ev.text) renderer.textManager.spawn(ev.text, ev.x, ev.y - 20, '#10b981');
          } else if (ev.type === 'SHOCKWAVE') {
            sfx.playSkill();
            renderer.addScreenShake(6, 0.2);
            renderer.particleSystem.addShockwave(ev.x, ev.y, ev.radius || 140, ev.color || '#f59e0b', 4);
            if (ev.text) renderer.textManager.spawn(ev.text, ev.x, ev.y - 24, ev.color || '#facc15');
          } else if (ev.type === 'SYNERGY') {
            sfx.playSynergy();
            renderer.addScreenShake(5, 0.18);
            renderer.particleSystem.addShockwave(ev.x, ev.y, ev.radius || 95, '#c084fc', 3.5);
            renderer.particleSystem.emitSparks(ev.x, ev.y, '#e879f9', 14);
            if (ev.text) renderer.textManager.spawn(ev.text, ev.x, ev.y - 18, '#e879f9');
          } else if (ev.type === 'LIGHTNING_ARC' && ev.targetX !== undefined && ev.targetY !== undefined) {
            renderer.particleSystem.addLightningArc(ev.x, ev.y, ev.targetX, ev.targetY, ev.color || '#38bdf8');
          } else if (ev.type === 'REVIVE') {
            sfx.playHeal();
            renderer.particleSystem.addShockwave(ev.x, ev.y, 90, '#22c55e', 4);
            if (ev.text) renderer.textManager.spawn(ev.text, ev.x, ev.y - 24, '#4ade80');
          } else if (ev.type === 'PING') {
            sfx.playPing();
            renderer.particleSystem.addShockwave(ev.x, ev.y, 65, '#f59e0b', 3);
            if (ev.text) renderer.textManager.spawn(ev.text, ev.x, ev.y - 16, '#fbbf24');
          } else if (ev.type === 'DIRECTOR_INTERVENTION') {
            sfx.playExplosion();
            renderer.addScreenShake(10, 0.35);
            renderer.particleSystem.addShockwave(ev.x, ev.y, ev.radius || 130, ev.color || '#ef4444', 5);
            if (ev.text) renderer.textManager.spawn(ev.text, ev.x, ev.y - 28, '#f87171');
          } else if (ev.type === 'CRIT' && ev.text) {
            renderer.textManager.spawn(ev.text, ev.x, ev.y, ev.color || '#facc15');
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
            const diff = prevE.currentHp - currentE.currentHp;
            renderer.textManager.spawn(`${diff}`, currentE.x, currentE.y - 14, '#facc15');
            const sparkColor = currentE.type === 'SLIME' ? '#22c55e' : '#dc2626';
            renderer.particleSystem.emitBlood(currentE.x, currentE.y, sparkColor, 6);
          }
        }
      }
      prevEnemiesRef.current = updated.enemies;

      // Room clear sound
      if (updated.room.isCleared && !prevClearedRef.current) {
        sfx.playRoomClear();
      }
      prevClearedRef.current = updated.room.isCleared;

      // Victory fanfare
      if (updated.phase === 'VICTORY' && prevPhaseRef.current !== 'VICTORY') {
        sfx.playVictory();
      }
      prevPhaseRef.current = updated.phase;

      // Trigger relic choice modal if chest is available and NOT yet claimed by this player!
      const alreadyClaimed = updated.room.chest?.claimedByPlayerIds?.includes(currentPlayerId);
      if (updated.room.isCleared && updated.room.chest && !alreadyClaimed) {
        setShowRelicModal(true);
      } else {
        setShowRelicModal(false);
      }
    });

    socket.on('connect', () => {
      setErrorMessage(null);
    });

    socket.on('disconnect', () => {
      setErrorMessage('Conexión perdida con el servidor. Reconectando...');
    });

    return () => {
      socket.off('world:state');
      socket.off('connect');
      socket.off('disconnect');
    };
  }, []);

  // Input Sender to Server (30 Hz)
  const sendPlayerInput = useCallback((overrideDash = false, overrideSkill = false) => {
    const currentWorld = worldRef.current;
    const currentPlayerId = localPlayerIdRef.current;
    if (!currentWorld || currentWorld.phase !== 'PLAYING' || !currentWorld.code) return;
    const player = currentWorld.players[currentPlayerId];
    if (!player || !player.isAlive) return;

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

    const canvas = canvasRef.current;
    let angle = player.angle;
    if (canvas) {
      const renderer = rendererRef.current;
      const playerScreenX = player.x - renderer.cameraX;
      const playerScreenY = player.y - renderer.cameraY;
      angle = Math.atan2(mousePos.current.y - playerScreenY, mousePos.current.x - playerScreenX);
    }

    const isAttacking = isMouseDown.current || touchAttack.current;
    const attackCd = CLASS_CONFIGS[player.classType]?.attackCooldownMs || 250;
    if (isAttacking && Date.now() - player.lastAttackAt >= attackCd) {
      if (player.classType === 'GUERRERO' || player.classType === 'PICARO') {
        sfx.playSlash();
      } else {
        sfx.playShoot();
      }
    }

    socket.emit('player:input', {
      code: currentWorld.code,
      moveX,
      moveY,
      angle,
      isAttacking,
      isDashing: overrideDash,
      isUsingSkill: overrideSkill,
    });
  }, []);

  const triggerDash = useCallback(() => {
    const currentWorld = worldRef.current;
    const currentPlayerId = localPlayerIdRef.current;
    if (!currentWorld || currentWorld.phase !== 'PLAYING') return;
    const player = currentWorld.players[currentPlayerId];
    if (!player || !player.isAlive || player.isDashing || Date.now() < player.dashCooldownEndsAt) return;

    sfx.playDash();
    sendPlayerInput(true, false);
  }, [sendPlayerInput]);

  const triggerSkill = useCallback(() => {
    const currentWorld = worldRef.current;
    const currentPlayerId = localPlayerIdRef.current;
    if (!currentWorld || currentWorld.phase !== 'PLAYING') return;
    const player = currentWorld.players[currentPlayerId];
    if (!player || !player.isAlive || Date.now() < player.skillCooldownEndsAt) return;

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
  }, [triggerDash, triggerSkill, triggerPing]);

  useEffect(() => {
    const interval = setInterval(() => {
      sendPlayerInput(false, false);
    }, 1000 / 30);

    return () => clearInterval(interval);
  }, [sendPlayerInput]);

  // Persistent 60-144 FPS Canvas Render Loop (reads from worldRef without restarting on React state updates!)
  useEffect(() => {
    let animId: number;
    let lastTime = performance.now();

    const loop = (time: number) => {
      const dt = Math.min(0.06, (time - lastTime) / 1000);
      lastTime = time;

      const canvas = canvasRef.current;
      const currentWorld = worldRef.current;
      if (canvas && currentWorld) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          if (canvas.width !== window.innerWidth || canvas.height !== window.innerHeight) {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
          }

          rendererRef.current.render(
            ctx,
            currentWorld,
            localPlayerIdRef.current,
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
  }, []);

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

  const handleAltarInteract = (action: 'UPGRADE_WEAPON' | 'BUY_HEAL' | 'BUY_SHIELD' | 'ACCEPT_PACT') => {
    if (!world?.code) return;
    socket.emit('altar:interact', { code: world.code, action });
  };

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
          onMoveChange={(x, y) => {
            touchMove.current = { x, y };
          }}
          onAttackChange={(attacking) => {
            touchAttack.current = attacking;
          }}
          onDash={triggerDash}
          onSkill={triggerSkill}
        />
      )}
    </div>
  );
};
