import React, { useEffect, useState } from 'react';
import { DirectorDialogue, RoomMutation } from '../types';
import { speechDirector } from '../audio/speech';
import { Volume2, VolumeX, Flame } from 'lucide-react';

interface Props {
  dialogue: DirectorDialogue;
  mutation: RoomMutation;
  roomIndex: number;
  totalRooms: number;
}

export const DirectorBanner: React.FC<Props> = ({ dialogue, mutation, roomIndex, totalRooms }) => {
  const [displayedText, setDisplayedText] = useState('');
  const [voiceEnabled, setVoiceEnabled] = useState(true);

  useEffect(() => {
    setDisplayedText('');
    let idx = 0;
    const text = dialogue.text || '';

    speechDirector.speak(text);

    const interval = setInterval(() => {
      if (idx < text.length) {
        setDisplayedText(text.slice(0, idx + 1));
        idx++;
      } else {
        clearInterval(interval);
      }
    }, 22);

    return () => clearInterval(interval);
  }, [dialogue.text]);

  const toggleVoice = () => {
    const state = speechDirector.toggle();
    setVoiceEnabled(state);
  };

  return (
    <div className="absolute top-3 left-1/2 -translate-x-1/2 w-[95%] max-w-3xl z-30 pointer-events-none">
      {/* Gothic Stone Plaque */}
      <div className="bg-[#141210]/95 border-2 border-[#44403c] rounded-lg p-3 shadow-2xl shadow-black flex items-center gap-3 relative">
        {/* Stone corner rivets */}
        <div className="absolute top-1 left-1 w-1.5 h-1.5 rounded-full bg-[#78716c]"></div>
        <div className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-[#78716c]"></div>
        <div className="absolute bottom-1 left-1 w-1.5 h-1.5 rounded-full bg-[#78716c]"></div>
        <div className="absolute bottom-1 right-1 w-1.5 h-1.5 rounded-full bg-[#78716c]"></div>

        {/* Gothic Gargoyle / Inquisitor Seal */}
        <div className="relative flex-shrink-0 w-11 h-11 bg-[#1c1917] border border-[#57534e] rounded flex items-center justify-center">
          <span className="text-xl">🗿</span>
          <div className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-red-700 border border-black animate-pulse"></div>
        </div>

        {/* Spoken Text */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase font-bold tracking-widest text-[#d97706] font-cinzel">
              GRAN MAESTRE DEL CALABOZO
            </span>
            <span className="text-xs text-[#a8a29e] font-cinzel font-semibold">
              • CÁMARA {roomIndex} / {totalRooms} {roomIndex >= totalRooms ? '⚔️ JEFE' : ''}
            </span>
          </div>
          <p className="text-xs md:text-sm text-[#f5f5f4] font-serif italic tracking-normal leading-tight mt-0.5 min-h-[1.4rem]">
            "{displayedText}"
            <span className="animate-pulse text-[#b45309]">|</span>
          </p>
        </div>

        {/* Mutation Runes & Sound Toggle */}
        <div className="flex items-center gap-2 flex-shrink-0 pointer-events-auto">
          {mutation.frictionMultiplier < 0.3 && (
            <span className="hidden sm:inline-flex items-center text-[10px] bg-[#1c1917] border border-[#44403c] text-sky-300 px-2 py-0.5 rounded font-cinzel">
              ❄ Hielo Resbaladizo
            </span>
          )}
          {mutation.bulletBouncesBonus > 0 && (
            <span className="hidden sm:inline-flex items-center text-[10px] bg-[#1c1917] border border-[#44403c] text-amber-300 px-2 py-0.5 rounded font-cinzel">
              ⚡ Rebotes +{mutation.bulletBouncesBonus}
            </span>
          )}
          {mutation.lowVisibility && (
            <span className="hidden sm:inline-flex items-center text-[10px] bg-[#1c1917] border border-[#44403c] text-stone-300 px-2 py-0.5 rounded font-cinzel">
              👁 Niebla Oscura
            </span>
          )}

          <button
            onClick={toggleVoice}
            className="p-1.5 rounded bg-[#1c1917] border border-[#44403c] text-[#a8a29e] hover:text-[#f5f5f4] hover:border-[#78716c] transition"
            title={voiceEnabled ? 'Silenciar voz' : 'Activar voz'}
          >
            {voiceEnabled ? <Volume2 size={15} /> : <VolumeX size={15} className="text-red-500" />}
          </button>
        </div>
      </div>
    </div>
  );
};
