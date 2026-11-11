import React, { useEffect, useRef, useState, useCallback } from 'react';
import { socket } from './socket';
import { GameWorldState, PlayerClass, CLASS_CONFIGS } from './types';
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
  const prevHpRef = useRef<number | null>(null);
  const prevClearedRef = useRef<boolean>(false);
  const prevPhaseRef = useRef<string>('');

  // Input states
  const keysDown = useRef<Record<string, boolean>>({});
  const mousePos = useRef({ x: 0, y: 0 });
  const isMouseDown = useRef(false);
  const touchMove = useRef({ x: 0, y: 0 });
  const touchAttack = useRef(false);

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
      setWorld(updated);

      // Sound & tactile feedback on health changes
      const player = updated.players[localPlayerId];
      if (player) {
        if (prevHpRef.current !== null) {
          if (player.currentHp < prevHpRef.current) {
            const diff = prevHpRef.current - player.currentHp;
            sfx.playHit();
            rendererRef.current.addScreenShake(7, 0.25);
            rendererRef.current.textManager.spawn(`-${diff}`, player.x, player.y - 20, '#ef4444');
            rendererRef.current.particleSystem.emitBlood(player.x, player.y, '#dc2626', 10);
          } else if (player.currentHp > prevHpRef.current) {
            const diff = player.currentHp - prevHpRef.current;
            sfx.playHeal();
            rendererRef.current.textManager.spawn(`+${diff} HP`, player.x, player.y - 25, '#22c55e');
            rendererRef.current.particleSystem.emitSparks(player.x, player.y, '#4ade80', 8);
          }
        }
        prevHpRef.current = player.currentHp;
      }

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

      // Trigger relic choice modal if chest is openable
      if (updated.room.isCleared && updated.room.chest && !updated.room.chest.isOpen) {
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

  // Keyboard & Mouse Listeners
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      keysDown.current[e.key.toLowerCase()] = true;
      keysDown.current[e.code] = true;

      // Local Dash trigger
      if (e.code === 'Space' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
        e.preventDefault();
        triggerDash();
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
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (e.button === 0) {
        isMouseDown.current = false;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [world?.code, localPlayerId]);

  const triggerDash = () => {
    if (!world || world.phase !== 'PLAYING') return;
    const player = world.players[localPlayerId];
    if (!player || !player.isAlive || player.isDashing || Date.now() < player.dashCooldownEndsAt) return;

    sfx.playDash();
    sendPlayerInput(true);
  };

  // Input Sender to Server (30 Hz)
  const sendPlayerInput = useCallback((overrideDash = false) => {
    if (!world || world.phase !== 'PLAYING' || !world.code) return;
    const player = world.players[localPlayerId];
    if (!player || !player.isAlive) return;

    // Calculate movement vector from keyboard or touch
    let moveX = 0;
    let moveY = 0;

    if (keysDown.current['w'] || keysDown.current['arrowup']) moveY -= 1;
    if (keysDown.current['s'] || keysDown.current['arrowdown']) moveY += 1;
    if (keysDown.current['a'] || keysDown.current['arrowleft']) moveX -= 1;
    if (keysDown.current['d'] || keysDown.current['arrowright']) moveX += 1;

    // Add touch joystick if active
    if (touchMove.current.x !== 0 || touchMove.current.y !== 0) {
      moveX = touchMove.current.x;
      moveY = touchMove.current.y;
    }

    // Normalize diagonal movement
    const len = Math.hypot(moveX, moveY);
    if (len > 1) {
      moveX /= len;
      moveY /= len;
    }

    // Calculate mouse angle relative to player screen coordinates
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
      if (player.classType === 'GUERRERO') {
        sfx.playSlash();
      } else {
        sfx.playShoot();
      }
    }

    socket.emit('player:input', {
      code: world.code,
      moveX,
      moveY,
      angle,
      isAttacking,
      isDashing: overrideDash,
    });
  }, [world, localPlayerId]);

  useEffect(() => {
    if (!world || world.phase !== 'PLAYING') return;

    const interval = setInterval(() => {
      sendPlayerInput(false);
    }, 1000 / 30);

    return () => clearInterval(interval);
  }, [world, sendPlayerInput]);

  // Main Canvas Render Loop (60 FPS)
  useEffect(() => {
    let animId: number;
    let lastTime = performance.now();

    const loop = (time: number) => {
      const dt = Math.min(0.06, (time - lastTime) / 1000);
      lastTime = time;

      const canvas = canvasRef.current;
      if (canvas && world) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          // Adjust canvas size to window
          if (canvas.width !== window.innerWidth || canvas.height !== window.innerHeight) {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
          }

          rendererRef.current.render(
            ctx,
            world,
            localPlayerId,
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
  }, [world, localPlayerId]);

  // Handlers for Lobby
  const handleCreateRoom = (playerName: string, classType: PlayerClass) => {
    setIsLoading(true);
    setErrorMessage(null);

    socket.emit('room:create', { playerName, classType, avatarIndex: 0 }, (res: any) => {
      setIsLoading(false);
      if (res.success) {
        setLocalPlayerId(res.playerId);
        sessionStorage.setItem('calabozo_player_id', res.playerId);
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
        setLocalPlayerId(res.playerId);
        sessionStorage.setItem('calabozo_player_id', res.playerId);
        setWorld(res.state);
      } else {
        setErrorMessage(res.error || 'Error al unirse a la mazmorra');
      }
    });
  };

  const handleStartGame = () => {
    if (!world?.code) return;
    socket.emit('game:start', { code: world.code });
  };

  const handleRestartGame = () => {
    if (!world?.code) return;
    socket.emit('game:restart', { code: world.code });
  };

  const handlePickRelic = (relicId: string) => {
    if (!world?.code) return;
    setShowRelicModal(false);
    socket.emit('relic:pick', { code: world.code, relicId });
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
        />
      )}

      {/* Bottom Player HUD */}
      {isPlaying && localPlayer && (
        <PlayerHUD
          player={localPlayer}
          roomIndex={world.room.roomIndex}
          totalRooms={world.room.totalRooms}
          enemiesRemaining={world.enemies.length}
        />
      )}

      {/* Relic Selection Modal */}
      {showRelicModal && world?.room.chest && (
        <RelicChoiceModal
          relics={world.room.chest.relicOptions}
          onSelect={handlePickRelic}
        />
      )}

      {/* Game Over / Victory Modal */}
      {isGameOverOrVictory && world && (
        <EndGameModal
          world={world}
          isHost={!!localPlayer?.isHost}
          onRestart={handleRestartGame}
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
        />
      )}
    </div>
  );
};
