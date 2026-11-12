import React, { useEffect, useState } from 'react';
import { DirectorDialogue, RoomMutation, RoomEncounterType } from '../types';
import { speechDirector } from '../audio/speech';
import { Volume2, VolumeX, Flame } from 'lucide-react';

interface Props {
  dialogue: DirectorDialogue;
  mutation: RoomMutation;
  roomIndex: number;
  totalRooms: number;
  encounterType?: RoomEncounterType;
  directorAnger?: number;
  onOpenAudio?: () => void;
}

export const DirectorBanner: React.FC<Props> = React.memo(({
  dialogue,
  mutation,
  roomIndex,
  totalRooms,
  encounterType = 'STANDARD',
  directorAnger = 0,
  onOpenAudio,
}) => {
  const [voiceEnabled, setVoiceEnabled] = useState(true);

  useEffect(() => {
    const text = dialogue.text || '';
    if (text) {
      speechDirector.speak(text);
    }
  }, [dialogue.text, dialogue.timestamp]);

  const toggleVoice = () => {
    const state = speechDirector.toggle();
    setVoiceEnabled(state);
  };

  return (
    <div className="absolute top-3 left-1/2 -translate-x-1/2 w-[96%] max-w-3xl z-30 pointer-events-none">
      <div className="bg-[#141210]/95 border-2 border-[#44403c] rounded-lg p-3 shadow-2xl shadow-black flex items-center gap-3 relative">
        <div className="absolute top-1 left-1 w-1.5 h-1.5 rounded-full bg-[#78716c]"></div>
        <div className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-[#78716c]"></div>
        <div className="absolute bottom-1 left-1 w-1.5 h-1.5 rounded-full bg-[#78716c]"></div>
        <div className="absolute bottom-1 right-1 w-1.5 h-1.5 rounded-full bg-[#78716c]"></div>

        {/* Gothic Gargoyle / Inquisitor Seal */}
        <div className="relative flex-shrink-0 w-11 h-11 bg-[#1c1917] border border-[#57534e] rounded flex items-center justify-center">
          <span className="text-xl">{encounterType === 'BOSS' ? '👹' : encounterType === 'ELITE' ? '💀' : '🗿'}</span>
          <div className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-red-700 border border-black animate-pulse"></div>
        </div>

        {/* Spoken Text & Room Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] uppercase font-bold tracking-widest text-[#d97706] font-cinzel">
              GRAN MAESTRE DEL CALABOZO
            </span>
            <span className="text-xs text-[#a8a29e] font-cinzel font-semibold">
              • CÁMARA {roomIndex} / {totalRooms}{' '}
              {encounterType === 'BOSS'
                ? '⚔️ JEFE'
                : encounterType === 'ELITE'
                ? '💀 ÉLITE'
                : encounterType === 'SANCTUARY'
                ? '⚖️ SANTUARIO'
                : ''}
            </span>
            <span className="hidden md:inline-flex text-[10px] text-amber-400/90 font-cinzel">
              — {mutation.title}
            </span>
          </div>
          <p className="text-xs md:text-sm text-[#f5f5f4] font-serif italic tracking-normal leading-tight mt-0.5 min-h-[1.3rem]">
            "{dialogue.text}"
          </p>
        </div>

        {/* Director Anger Meter, Mutation Runes & Sound Toggle */}
        <div className="flex items-center gap-2 flex-shrink-0 pointer-events-auto">
          {/* Live AI Director Anger / Intervention Meter */}
          <div
            className="hidden sm:flex flex-col items-end bg-[#1c1917] border border-[#44403c] px-2 py-1 rounded"
            title="Cuando llega al 100%, el Director IA interviene en vivo con meteoros y campeones mutantes"
          >
            <span className="text-[8px] font-cinzel text-red-400 uppercase flex items-center gap-0.5 font-bold">
              <Flame size={9} className="fill-red-500 text-red-500" /> IRA IA: {directorAnger}%
            </span>
            <div className="w-16 h-1 bg-[#0c0a09] rounded overflow-hidden mt-0.5">
              <div
                className="h-full bg-gradient-to-r from-amber-500 to-red-600 transition-all duration-150"
                style={{ width: `${Math.min(100, directorAnger)}%` }}
              ></div>
            </div>
          </div>

          {mutation.frictionMultiplier < 0.3 && (
            <span className="hidden lg:inline-flex items-center text-[10px] bg-[#1c1917] border border-[#44403c] text-sky-300 px-2 py-0.5 rounded font-cinzel">
              ❄ Hielo
            </span>
          )}
          {mutation.bulletBouncesBonus > 0 && (
            <span className="hidden lg:inline-flex items-center text-[10px] bg-[#1c1917] border border-[#44403c] text-amber-300 px-2 py-0.5 rounded font-cinzel">
              ⚡ Rebotes +{mutation.bulletBouncesBonus}
            </span>
          )}
          {mutation.hazardType === 'SPIKE_TRAPS' && (
            <span className="hidden lg:inline-flex items-center text-[10px] bg-[#1c1917] border border-[#44403c] text-rose-300 px-2 py-0.5 rounded font-cinzel">
              🗡 Pinchos
            </span>
          )}
          {mutation.hazardType === 'LAVA_PITS' && (
            <span className="hidden lg:inline-flex items-center text-[10px] bg-[#1c1917] border border-[#44403c] text-orange-300 px-2 py-0.5 rounded font-cinzel">
              🌋 Lava
            </span>
          )}

          <button
            onClick={onOpenAudio || toggleVoice}
            className="p-1.5 rounded bg-[#1c1917] border border-[#44403c] text-[#a8a29e] hover:text-[#f5f5f4] hover:border-[#78716c] transition pointer-events-auto"
            title="Ajustes de Sonido, Música y Voz (M)"
          >
            {voiceEnabled ? <Volume2 size={15} /> : <VolumeX size={15} className="text-red-500" />}
          </button>
        </div>
      </div>
    </div>
  );
});
