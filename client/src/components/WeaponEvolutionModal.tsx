import React from 'react';
import { PlayerClass, WeaponEvolutionId, WEAPON_EVOLUTIONS } from '../types';
import { sfx } from '../audio/sfx';

interface Props {
  classType: PlayerClass;
  onSelect: (evolutionId: WeaponEvolutionId) => void;
}

export const WeaponEvolutionModal: React.FC<Props> = ({ classType, onSelect }) => {
  // Get the 2 evolutions corresponding to this class
  const options = Object.values(WEAPON_EVOLUTIONS).filter(
    evo => evo.classType === classType
  );

  const handleSelect = (id: WeaponEvolutionId) => {
    sfx.playWeaponEvolved();
    onSelect(id);
  };

  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-fadeIn">
      <div className="bg-[#141210] border-2 border-[#b45309] rounded-xl max-w-2xl w-full p-6 shadow-2xl flex flex-col items-center relative text-white">
        {/* Stone corner rivets */}
        <div className="absolute top-2 left-2 w-2 h-2 rounded-full bg-[#f59e0b]"></div>
        <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-[#f59e0b]"></div>
        <div className="absolute bottom-2 left-2 w-2 h-2 rounded-full bg-[#f59e0b]"></div>
        <div className="absolute bottom-2 right-2 w-2 h-2 rounded-full bg-[#f59e0b]"></div>

        <div className="text-4xl mb-1 animate-bounce">⚔️</div>
        <h2 className="text-2xl md:text-3xl font-black text-[#f59e0b] font-cinzel tracking-widest uppercase text-center drop-shadow-md">
          ¡EVOLUCIÓN DE ARMA!
        </h2>
        <p className="text-xs text-[#d6d3d1] text-center font-serif italic mt-1 mb-6">
          Has alcanzado la maestría de Nivel 3. Forja tu destino eligiendo una rama de trascendencia:
        </p>

        {/* 2 Evolution Tablets */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 w-full">
          {options.map(evo => (
            <div
              key={evo.id}
              className="bg-[#1c1917] border border-[#57534e] hover:border-[#f59e0b] rounded-xl p-5 flex flex-col justify-between transition-all hover:-translate-y-1 group shadow-lg"
            >
              <div>
                <div className="text-4xl mb-3 text-center">{evo.icon}</div>
                <h3 className="font-bold text-[#fef08a] text-center font-cinzel text-base tracking-wide">
                  {evo.name}
                </h3>
                <p className="text-xs text-[#a8a29e] italic text-center mt-2 leading-relaxed font-serif">
                  "{evo.description}"
                </p>

                <div className="mt-4 pt-3 border-t border-[#292524] space-y-1.5">
                  {evo.perks.map((perk, idx) => (
                    <div key={idx} className="flex items-start gap-1.5 text-xs text-amber-300">
                      <span className="text-amber-500 font-bold">✦</span>
                      <span>{perk}</span>
                    </div>
                  ))}
                </div>
              </div>

              <button
                onClick={() => handleSelect(evo.id)}
                className="mt-6 w-full py-2.5 bg-gradient-to-r from-[#b45309] to-[#d97706] hover:from-[#d97706] hover:to-[#f59e0b] text-[#1c1917] font-black rounded-lg text-sm font-cinzel tracking-widest transition shadow-md active:scale-95 border border-[#fde68a]"
              >
                DESPERTAR PODER
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
