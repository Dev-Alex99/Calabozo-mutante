import React from 'react';
import { Relic } from '../types';
import { Sparkles, Award } from 'lucide-react';
import { sfx } from '../audio/sfx';

interface Props {
  relics: Relic[];
  onSelect: (relicId: string) => void;
}

export const RelicChoiceModal: React.FC<Props> = ({ relics, onSelect }) => {
  const handleSelect = (relicId: string) => {
    sfx.playChestOpen();
    onSelect(relicId);
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-40 flex items-center justify-center p-4">
      <div className="bg-gray-900 border-2 border-yellow-500/60 rounded-2xl max-w-2xl w-full p-6 shadow-2xl shadow-yellow-950/50 flex flex-col items-center">
        <div className="text-4xl mb-2 animate-bounce">🎁</div>
        <h2 className="text-xl md:text-2xl font-black text-yellow-400 font-mono tracking-wider uppercase text-center">
          RECOMPENSA DEL CALABOZO
        </h2>
        <p className="text-sm text-gray-400 text-center font-sans mt-1 mb-6">
          El Director te ofrece tres artefactos mutados. Elige sabiamente:
        </p>

        {/* 3 Relic Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full">
          {relics.map(relic => (
            <div
              key={relic.id}
              className="bg-gray-950/80 border border-gray-700 hover:border-yellow-400 rounded-xl p-4 flex flex-col justify-between transition-all hover:scale-[1.03] group hover:shadow-lg hover:shadow-yellow-500/20"
            >
              <div>
                <div className="text-3xl mb-2 text-center">{relic.icon}</div>
                <h3 className="font-bold text-gray-100 text-center font-mono text-sm leading-snug">
                  {relic.name}
                </h3>
                <p className="text-xs text-gray-400 italic text-center mt-1 leading-snug font-sans">
                  "{relic.lore}"
                </p>

                <div className="mt-4 pt-3 border-t border-gray-800">
                  <p className="text-xs font-semibold text-emerald-400 font-sans leading-relaxed">
                    ✨ {relic.buffDescription}
                  </p>
                  {relic.curseDescription && (
                    <p className="text-xs font-semibold text-red-400 font-sans mt-1 leading-relaxed">
                      ⚠️ {relic.curseDescription}
                    </p>
                  )}
                </div>
              </div>

              <button
                onClick={() => handleSelect(relic.id)}
                className="mt-5 w-full py-2 bg-gradient-to-r from-yellow-600 to-amber-500 hover:from-yellow-500 hover:to-amber-400 text-gray-950 font-bold rounded-lg text-xs font-mono uppercase tracking-wider transition shadow-md"
              >
                EQUIPAR
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
