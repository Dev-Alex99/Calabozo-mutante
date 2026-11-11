import React, { useEffect } from 'react';
import { GameWorldState, PlayerEntity } from '../types';
import { Trophy, Skull, RotateCcw, Swords, Flame } from 'lucide-react';
import { sfx } from '../audio/sfx';
import confetti from 'canvas-confetti';

interface Props {
  world: GameWorldState;
  isHost: boolean;
  onRestart: () => void;
}

export const EndGameModal: React.FC<Props> = ({ world, isHost, onRestart }) => {
  const isVictory = world.phase === 'VICTORY';

  useEffect(() => {
    if (isVictory) {
      sfx.playVictory();
      try {
        confetti({
          particleCount: 120,
          spread: 80,
          origin: { y: 0.6 },
        });
      } catch {}
    } else {
      sfx.playHit();
    }
  }, [isVictory]);

  const playersList = Object.values(world.players).sort((a, b) => b.damageDealt - a.damageDealt);
  const mvp = playersList[0];

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className={`bg-gray-900 border-2 ${isVictory ? 'border-amber-500 shadow-amber-950/60' : 'border-red-600 shadow-red-950/60'} rounded-2xl max-w-lg w-full p-6 shadow-2xl flex flex-col items-center text-center animate-in fade-in zoom-in-95 duration-200`}>
        {/* Big Icon */}
        <div className="text-5xl mb-3">
          {isVictory ? '🏆' : '💀'}
        </div>

        <h2 className={`text-2xl font-black font-mono tracking-wider uppercase ${isVictory ? 'text-amber-400' : 'text-red-500'}`}>
          {isVictory ? '¡VICTORIA SOBRE EL ALGORITMO!' : 'EXPEDIENTE CERRADO — GAME OVER'}
        </h2>

        {/* Director Quote */}
        <div className="bg-gray-950/80 border border-gray-800 rounded-xl p-3 my-4 w-full text-xs md:text-sm text-gray-300 italic font-sans leading-relaxed">
          "{world.directorDialogue.text}"
        </div>

        {/* Stats Table */}
        <div className="w-full bg-gray-950/60 rounded-xl p-4 border border-gray-800/80 my-2">
          <div className="text-xs uppercase font-mono tracking-widest text-gray-400 mb-3 flex items-center justify-center gap-1.5 font-bold">
            <Swords size={14} className="text-yellow-400" /> RENDIMIENTO DE LA ESCUADRA
          </div>

          <div className="space-y-2">
            {playersList.map((p, idx) => (
              <div
                key={p.id}
                className="flex items-center justify-between text-xs font-mono p-2 rounded-lg bg-gray-900/80 border border-gray-800"
              >
                <div className="flex items-center gap-2">
                  <span className="font-bold text-gray-400">#{idx + 1}</span>
                  <span className="font-semibold text-gray-200">{p.name}</span>
                  {idx === 0 && <span className="text-[10px] bg-yellow-500/20 text-yellow-300 border border-yellow-500/40 px-1.5 py-0.2 rounded font-bold">MVP</span>}
                </div>
                <div className="flex items-center gap-4 text-gray-400">
                  <span>💥 {p.damageDealt} Daño</span>
                  <span>☠️ {p.kills} Bajas</span>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-3 pt-3 border-t border-gray-800 flex justify-around text-xs font-mono text-gray-400">
            <span>Salas: <strong className="text-gray-200">{world.room.roomIndex} / {world.room.totalRooms}</strong></span>
            <span>Daño Total: <strong className="text-yellow-400">{world.telemetry.totalDamageDealt}</strong></span>
          </div>
        </div>

        {/* Action Button */}
        {isHost ? (
          <button
            onClick={onRestart}
            className={`mt-4 w-full py-3 rounded-xl font-mono font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2 transition shadow-lg ${
              isVictory
                ? 'bg-amber-500 hover:bg-amber-400 text-gray-950 shadow-amber-500/20'
                : 'bg-red-600 hover:bg-red-500 text-white shadow-red-600/20'
            }`}
          >
            <RotateCcw size={16} /> REINICIAR MAZMORRA
          </button>
        ) : (
          <p className="mt-4 text-xs font-mono text-gray-500 italic">
            Esperando a que el líder inicie otra expedición...
          </p>
        )}
      </div>
    </div>
  );
};
