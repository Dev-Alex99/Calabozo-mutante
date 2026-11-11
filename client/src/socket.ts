import { io, Socket } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_SERVER_URL || '';

export const socket: Socket = io(SOCKET_URL, {
  autoConnect: true,
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 800,
  reconnectionDelayMax: 4000,
  timeout: 10000,
  upgrade: true,
  rememberUpgrade: true,
  transports: ['websocket', 'polling'],
});
