import { Server } from 'socket.io';
import { DungeonRoom } from './DungeonRoom.js';
import { DungeonDirector } from '../ai/DungeonDirector.js';

export class RoomManager {
  private rooms = new Map<string, DungeonRoom>();
  private io: Server;
  private director: DungeonDirector;

  constructor(io: Server) {
    this.io = io;
    this.director = new DungeonDirector();
  }

  public createRoom(): DungeonRoom {
    let code = this.generateCode();
    while (this.rooms.has(code)) {
      code = this.generateCode();
    }

    const room = new DungeonRoom(code, this.io, this.director);
    this.rooms.set(code, room);
    console.log(`[RoomManager] Nueva mazmorra creada: ${code}`);
    return room;
  }

  public getRoom(code: string): DungeonRoom | undefined {
    return this.rooms.get(code.toUpperCase().trim());
  }

  public removeRoom(code: string): void {
    this.rooms.delete(code.toUpperCase().trim());
  }

  public handleDisconnect(socketId: string): void {
    for (const [code, room] of this.rooms.entries()) {
      if (room.players[socketId]) {
        console.log(`[RoomManager] Jugador desconectado ${socketId} de la sala ${code}`);
        room.removePlayer(socketId);
        if (Object.keys(room.players).length === 0) {
          this.removeRoom(code);
          console.log(`[RoomManager] Sala vacía eliminada: ${code}`);
        } else {
          room.broadcastState();
        }
        break;
      }
    }
  }

  private generateCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let res = '';
    for (let i = 0; i < 4; i++) {
      res += chars[Math.floor(Math.random() * chars.length)];
    }
    return res;
  }
}
