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

  // Start Game
  socket.on('game:start', ({ code }) => {
    const room = roomManager.getRoom(code);
    if (!room) return;
    const player = room.players[socket.id];
    if (!player || !player.isHost) return;

    room.startGame();
  });

  // Player Input (30 Hz)
  socket.on('player:input', ({ code, moveX, moveY, angle, isAttacking, isDashing }) => {
    const room = roomManager.getRoom(code);
    if (!room) return;

    room.handlePlayerInput(socket.id, {
      moveX: moveX || 0,
      moveY: moveY || 0,
      angle: angle || 0,
      isAttacking: !!isAttacking,
      isDashing: !!isDashing,
    });
  });

  // Relic Selection
  socket.on('relic:pick', ({ code, relicId }) => {
    const room = roomManager.getRoom(code);
    if (!room) return;

    room.handleRelicChoice(socket.id, relicId);
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
