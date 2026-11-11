import React from 'react';
import { Relic } from '../types';
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
    <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-40 flex items-center justify-center p-4">
      <div className="bg-[#141210] border-2 border-[#78716c] rounded-xl max-w-2xl w-full p-6 shadow-2xl flex flex-col items-center relative">
        {/* Stone corner rivets */}
        <div className="absolute top-2 left-2 w-2 h-2 rounded-full bg-[#a8a29e]"></div>
        <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-[#a8a29e]"></div>
        <div className="absolute bottom-2 left-2 w-2 h-2 rounded-full bg-[#a8a29e]"></div>
        <div className="absolute bottom-2 right-2 w-2 h-2 rounded-full bg-[#a8a29e]"></div>

        <div className="text-3xl mb-1">🎁</div>
        <h2 className="text-xl md:text-2xl font-black text-[#d97706] font-cinzel tracking-wider uppercase text-center">
          BOTÍN DEL CALABOZO
        </h2>
        <p className="text-xs text-[#a8a29e] text-center font-serif italic mt-0.5 mb-5">
          El Director te ofrece tres artefactos arcanos. Elige uno para tu inventario:
        </p>

        {/* 3 Relic Tablets */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 w-full">
          {relics.map(relic => (
            <div
              key={relic.id}
              className="bg-[#1c1917] border border-[#44403c] hover:border-[#d97706] rounded-lg p-3.5 flex flex-col justify-between transition-all hover:-translate-y-1 group"
            >
              <div>
                <div className="text-3xl mb-2 text-center">{relic.icon}</div>
                <h3 className="font-bold text-[#f5f5f4] text-center font-cinzel text-xs leading-snug">
                  {relic.name}
                </h3>
                <p className="text-[11px] text-[#a8a29e] italic text-center mt-1 leading-snug font-serif">
                  "{relic.lore}"
                </p>

                <div className="mt-3 pt-2.5 border-t border-[#292524]">
                  <p className="text-[11px] font-semibold text-emerald-400 font-sans leading-relaxed">
                    ✦ {relic.buffDescription}
                  </p>
                  {relic.curseDescription && (
                    <p className="text-[11px] font-semibold text-rose-400 font-sans mt-1 leading-relaxed">
                      ⚠️ {relic.curseDescription}
                    </p>
                  )}
                </div>
              </div>

              <button
                onClick={() => handleSelect(relic.id)}
                className="mt-4 w-full py-2 bg-[#78350f] hover:bg-[#92400e] text-[#fef3c7] font-bold rounded text-xs font-cinzel tracking-wider transition border border-[#b45309]"
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
