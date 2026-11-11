import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '../.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config();

const rawKey = (process.env.MINIMAX_API_KEY || '').trim();

export const config = {
  port: parseInt(process.env.PORT || '3003', 10),
  minimax: {
    apiKey: rawKey,
    baseUrl: process.env.MINIMAX_BASE_URL || 'https://api.minimax.io/v1',
    model: process.env.MINIMAX_MODEL || 'MiniMax-M3.1-Flash',
  },
  game: {
    maxPlayers: parseInt(process.env.MAX_PLAYERS_PER_ROOM || '4', 10),
    totalRoomsToBoss: parseInt(process.env.TOTAL_ROOMS_TO_BOSS || '6', 10),
    tickRateHz: parseInt(process.env.SERVER_TICK_RATE_HZ || '20', 10),
    roomWidth: 1200,
    roomHeight: 800,
  },
};
