import React, { useEffect } from 'react';
import { GameWorldState } from '../types';
import { Swords, RotateCcw, Flame } from 'lucide-react';
import { sfx } from '../audio/sfx';
import confetti from 'canvas-confetti';

interface Props {
  world: GameWorldState;
  isHost: boolean;
  onRestart: () => void;
  onContinueEndless: () => void;
}

export const EndGameModal: React.FC<Props> = ({ world, isHost, onRestart, onContinueEndless }) => {
  const isVictory = world.phase === 'VICTORY';

  useEffect(() => {
    if (isVictory) {
      sfx.playVictory();
      try {
        confetti({
          particleCount: 100,
          spread: 70,
          origin: { y: 0.6 },
          colors: ['#d97706', '#f59e0b', '#78350f', '#991b1b'],
        });
      } catch {}
    } else {
      sfx.playHit();
    }
  }, [isVictory]);

  const playersList = Object.values(world.players).sort((a, b) => b.damageDealt - a.damageDealt);

  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div
        className={`bg-[#141210] border-2 ${
          isVictory ? 'border-[#d97706]' : 'border-[#991b1b]'
        } rounded-xl max-w-xl w-full p-6 shadow-2xl flex flex-col items-center text-center relative`}
      >
        <div className="absolute top-2 left-2 w-2 h-2 rounded-full bg-[#78716c]"></div>
        <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-[#78716c]"></div>
        <div className="absolute bottom-2 left-2 w-2 h-2 rounded-full bg-[#78716c]"></div>
        <div className="absolute bottom-2 right-2 w-2 h-2 rounded-full bg-[#78716c]"></div>

        <div className="text-4xl mb-2">{isVictory ? '👑' : '💀'}</div>

        <h2
          className={`text-xl md:text-2xl font-black font-cinzel tracking-wider uppercase ${
            isVictory ? 'text-[#d97706]' : 'text-[#dc2626]'
          }`}
        >
          {isVictory ? 'VICTORIA SOBRE EL MAESTRE' : 'EXPEDIENTE CERRADO — DERROTA'}
        </h2>

        {/* Director Quote */}
        <div className="bg-[#1c1917] border border-[#292524] rounded-lg p-3 my-3 w-full text-xs text-[#d6d3d1] italic font-serif leading-relaxed">
          "{world.directorDialogue.text}"
        </div>

        {/* Squad Performance & AI Psychological Titles */}
        <div className="w-full bg-[#1c1917] rounded-lg p-3.5 border border-[#44403c] my-2">
          <div className="text-[11px] uppercase font-cinzel tracking-wider text-[#d97706] mb-2.5 flex items-center justify-center gap-1.5 font-bold">
            <Swords size={13} /> PERFIL PSICOLÓGICO & REGISTRO DE LA ESCUADRA
          </div>

          <div className="space-y-2">
            {playersList.map((p, idx) => (
              <div
                key={p.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between text-xs font-cinzel p-2.5 rounded bg-[#141210] border border-[#292524] gap-1"
              >
                <div className="flex flex-col items-start">
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-[#78716c]">#{idx + 1}</span>
                    <span className="font-semibold text-[#f5f5f4]">{p.name}</span>
                    {idx === 0 && (
                      <span className="text-[9px] bg-amber-950 text-amber-300 border border-amber-600/50 px-1.5 py-0.2 rounded font-bold">
                        MVP
                      </span>
                    )}
                  </div>
                  {p.title && (
                    <span className="text-[10px] text-purple-300 italic font-serif">
                      « {p.title} »
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2.5 text-[#a8a29e] text-[10px] flex-wrap">
                  <span>💥 {p.damageDealt} Daño</span>
                  <span>☠️ {p.kills} Bajas</span>
                  <span>🔥 Máx x{p.maxCombo}</span>
                  <span>⚡ {p.synergiesTriggered} Sinergias</span>
                  {p.revivesCount > 0 && <span>✨ {p.revivesCount} Rev.</span>}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-2.5 pt-2 border-t border-[#292524] flex justify-around text-xs font-cinzel text-[#78716c] flex-wrap gap-2">
            <span>
              Cámaras: <strong className="text-[#e7e5e4]">{world.room.roomIndex}</strong>
            </span>
            <span>
              Daño Total: <strong className="text-[#d97706]">{world.telemetry.totalDamageDealt}</strong>
            </span>
            <span>
              Sinergias: <strong className="text-purple-400">{world.telemetry.synergiesCount}</strong>
            </span>
          </div>
        </div>

        {/* Endless Ascension Mode or Restart Buttons */}
        {isHost ? (
          <div className="w-full flex flex-col gap-2 mt-3">
            {isVictory && (
              <button
                onClick={onContinueEndless}
                className="w-full py-3 rounded font-cinzel font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition bg-purple-900 hover:bg-purple-800 text-amber-200 border-2 border-purple-400 shadow-lg shadow-purple-950"
              >
                <Flame size={15} className="fill-amber-400 text-amber-400" />
                DESCENDER AL ABISMO INFINITO (CÁMARA {world.room.roomIndex + 1}+)
              </button>
            )}
            <button
              onClick={onRestart}
              className={`w-full py-2.5 rounded font-cinzel font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition ${
                isVictory
                  ? 'bg-[#292524] hover:bg-[#44403c] text-[#d6d3d1] border border-[#57534e]'
                  : 'bg-[#991b1b] hover:bg-[#b91c1c] text-white border border-[#dc2626]'
              }`}
            >
              <RotateCcw size={14} /> NUEVA EXPEDICIÓN DESDE CERO
            </button>
          </div>
        ) : (
          <p className="mt-3 text-xs font-cinzel text-[#78716c] italic">
            Esperando la decisión del líder de la escuadra...
          </p>
        )}
      </div>
    </div>
  );
};
