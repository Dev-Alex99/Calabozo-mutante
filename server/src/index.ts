import express from 'express';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from './config.js';
import { RoomManager } from './game/RoomManager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);

app.use(cors());
app.use(express.json());

const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  pingInterval: 10000,
  pingTimeout: 5000,
  perMessageDeflate: false,
  httpCompression: false,
});

const roomManager = new RoomManager(io);

// Health check endpoint
app.get('/api/status', (req, res) => {
  res.json({
    game: 'Calabozo Mutante: Dungeon Director IA',
    status: 'ONLINE',
    port: config.port,
    directorAiConfigured: !!config.minimax.apiKey,
    model: config.minimax.model,
    timestamp: new Date().toISOString(),
  });
});

// Serve frontend in production
const clientDistPath = path.resolve(__dirname, '../../client/dist');
app.use(express.static(clientDistPath));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) {
    return next();
  }
  res.sendFile(path.join(clientDistPath, 'index.html'), err => {
    if (err) next();
  });
});

// Socket.io Game Protocol
io.on('connection', (socket: Socket) => {
  console.log(`[Socket] Conectado: ${socket.id}`);

  // Create Room
  socket.on('room:create', ({ playerName, classType, avatarIndex }, callback) => {
    try {
      const room = roomManager.createRoom();
      const player = room.addPlayer(socket.id, playerName, classType || 'CAZADOR', avatarIndex ?? 0);
      socket.join(room.code);

      if (typeof callback === 'function') {
        callback({
          success: true,
          code: room.code,
          playerId: player.id,
          state: room.getState(),
        });
      }
      room.broadcastState();
    } catch (err: any) {
      if (typeof callback === 'function') {
        callback({ success: false, error: err.message });
      }
    }
  });

  // Join Room
  socket.on('room:join', ({ code, playerName, classType, avatarIndex }, callback) => {
    try {
      const room = roomManager.getRoom(code);
      if (!room) {
        if (typeof callback === 'function') {
          callback({ success: false, error: 'Código de calabozo no encontrado.' });
        }
        return;
      }

      if (Object.keys(room.players).length >= config.game.maxPlayers && !room.players[socket.id]) {
        if (typeof callback === 'function') {
          callback({ success: false, error: 'El calabozo ya está lleno (máximo 4 aventureros).' });
        }
        return;
      }

      const player = room.addPlayer(socket.id, playerName, classType || 'CAZADOR', avatarIndex ?? 0);
      socket.join(room.code);

      if (typeof callback === 'function') {
        callback({
          success: true,
          code: room.code,
          playerId: player.id,
          state: room.getState(),
        });
      }
      room.broadcastState();
    } catch (err: any) {
      if (typeof callback === 'function') {
        callback({ success: false, error: err.message });
      }
    }
  });

  // Change Class in Lobby
  socket.on('player:change_class', ({ code, classType }) => {
    const room = roomManager.getRoom(code);
    if (!room) return;
    room.changePlayerClass(socket.id, classType);
    room.broadcastState();
  });

  // Add AI Companion Bot in Lobby
  socket.on('room:add_bot', ({ code, classType }) => {
    const room = roomManager.getRoom(code);
    if (!room) return;
    const player = room.players[socket.id];
    if (!player || !player.isHost) return;
    room.addBotCompanion(classType);
    room.broadcastState();
  });

  // Remove AI Companion Bots in Lobby
  socket.on('room:remove_bots', ({ code }) => {
    const room = roomManager.getRoom(code);
    if (!room) return;
    const player = room.players[socket.id];
    if (!player || !player.isHost) return;
    room.removeBots();
    room.broadcastState();
  });

  // Start Game
  socket.on('game:start', ({ code }) => {
    const room = roomManager.getRoom(code);
    if (!room) return;
    const player = room.players[socket.id];
    if (!player || !player.isHost) return;

    room.startGame();
  });

  // Continue into Endless Ascension Mode
  socket.on('game:endless', ({ code }) => {
    const room = roomManager.getRoom(code);
    if (!room) return;
    const player = room.players[socket.id];
    if (!player || !player.isHost) return;

    room.continueEndlessMode();
  });

  // Player Input (20-30 Hz)
  socket.on('player:input', ({ code, moveX, moveY, angle, isAttacking, isDashing, isUsingSkill, x, y, vx, vy, roomIndex }) => {
    const room = roomManager.getRoom(code);
    if (!room) return;

    room.handlePlayerInput(socket.id, {
      moveX: moveX || 0,
      moveY: moveY || 0,
      angle: angle || 0,
      isAttacking: !!isAttacking,
      isDashing: !!isDashing,
      isUsingSkill: !!isUsingSkill,
      x: typeof x === 'number' && Number.isFinite(x) ? x : undefined,
      y: typeof y === 'number' && Number.isFinite(y) ? y : undefined,
      vx: typeof vx === 'number' && Number.isFinite(vx) ? vx : undefined,
      vy: typeof vy === 'number' && Number.isFinite(vy) ? vy : undefined,
      roomIndex: typeof roomIndex === 'number' ? roomIndex : undefined,
    });
  });

  // Tactical Co-op Ping
  socket.on('player:ping', ({ code, x, y, kind }) => {
    const room = roomManager.getRoom(code);
    if (!room) return;
    room.handlePlayerPing(socket.id, x, y, kind);
  });

  // Relic Selection (Per-Player!)
  socket.on('relic:pick', ({ code, relicId }) => {
    const room = roomManager.getRoom(code);
    if (!room) return;

    room.handleRelicChoice(socket.id, relicId);
  });

  // Altar of Pacts & Armory Interaction
  socket.on('altar:interact', ({ code, action }) => {
    const room = roomManager.getRoom(code);
    if (!room) return;

    room.handleAltarInteract(socket.id, action);
  });

  // Restart Game
  socket.on('game:restart', ({ code }) => {
    const room = roomManager.getRoom(code);
    if (!room) return;
    const player = room.players[socket.id];
    if (!player || !player.isHost) return;

    room.startGame();
  });

  // Disconnect
  socket.on('disconnect', () => {
    roomManager.handleDisconnect(socket.id);
  });
});

httpServer.listen(config.port, '0.0.0.0', () => {
  console.log('========================================================');
  console.log(`🏰  CALABOZO MUTANTE — DUNGEON DIRECTOR IA`);
  console.log(`📡  Servidor escuchando en: http://0.0.0.0:${config.port}`);
  console.log(`🧠  Director MiniMax: ${config.minimax.apiKey ? 'EN VIVO (Fast Mode)' : 'MODO SIMULADOR OFFLINE'}`);
  console.log('========================================================');
});
