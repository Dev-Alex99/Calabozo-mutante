import React, { useEffect, useState } from 'react';
import { DirectorDialogue, RoomMutation } from '../types';
import { speechDirector } from '../audio/speech';
import { Volume2, VolumeX, ShieldAlert, Sparkles } from 'lucide-react';

interface Props {
  dialogue: DirectorDialogue;
  mutation: RoomMutation;
  roomIndex: number;
  totalRooms: number;
}

export const DirectorBanner: React.FC<Props> = ({ dialogue, mutation, roomIndex, totalRooms }) => {
  const [displayedText, setDisplayedText] = useState('');
  const [voiceEnabled, setVoiceEnabled] = useState(true);

  // Typewriter effect & speech synthesis
  useEffect(() => {
    setDisplayedText('');
    let idx = 0;
    const text = dialogue.text || '';

    // Speak with AI voice
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
    <div className="absolute top-3 left-1/2 -translate-x-1/2 w-[95%] max-w-4xl z-30 pointer-events-none">
      <div className="bg-gray-900/90 backdrop-blur-md border border-red-500/40 rounded-xl p-3 shadow-2xl shadow-red-950/40 flex items-center gap-3">
        {/* Animated AI Director Portrait */}
        <div className="relative flex-shrink-0 w-12 h-12 bg-red-950/80 border border-red-500/60 rounded-lg flex items-center justify-center overflow-hidden">
          <div className="w-6 h-6 rounded-full bg-red-600 animate-pulse-fast shadow-lg shadow-red-500 flex items-center justify-center">
            <div className="w-2 h-2 rounded-full bg-white"></div>
          </div>
          <div className="absolute inset-0 bg-gradient-to-t from-red-500/20 to-transparent pointer-events-none"></div>
        </div>

        {/* Dialogue text */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase font-bold tracking-widest text-red-400 font-mono">
              DIRECTOR DEL CALABOZO [IA]
            </span>
            <span className="text-xs text-gray-500 font-mono">
              SALA {roomIndex} / {totalRooms} {roomIndex >= totalRooms ? '👑 JEFE FINAL' : ''}
            </span>
          </div>
          <p className="text-sm md:text-base font-semibold text-gray-100 font-sans tracking-wide leading-tight mt-0.5 min-h-[1.5rem]">
            "{displayedText}"
            <span className="animate-pulse text-red-400">|</span>
          </p>
        </div>

        {/* Mutation Pills & Voice Toggle */}
        <div className="flex items-center gap-2 flex-shrink-0 pointer-events-auto">
          {mutation.frictionMultiplier < 0.3 && (
            <span className="hidden sm:inline-flex items-center gap-1 text-[11px] bg-cyan-950 border border-cyan-500/50 text-cyan-300 px-2 py-0.5 rounded-full font-mono">
              ❄️ Hielo (-80% Fricción)
            </span>
          )}
          {mutation.bulletBouncesBonus > 0 && (
            <span className="hidden sm:inline-flex items-center gap-1 text-[11px] bg-yellow-950 border border-yellow-500/50 text-yellow-300 px-2 py-0.5 rounded-full font-mono">
              ⚡ Rebotes +{mutation.bulletBouncesBonus}
            </span>
          )}
          {mutation.lowVisibility && (
            <span className="hidden sm:inline-flex items-center gap-1 text-[11px] bg-purple-950 border border-purple-500/50 text-purple-300 px-2 py-0.5 rounded-full font-mono">
              👁️ Niebla Oscura
            </span>
          )}

          <button
            onClick={toggleVoice}
            className="p-1.5 rounded-lg bg-gray-800 border border-gray-700 text-gray-300 hover:text-white hover:bg-gray-700 transition"
            title={voiceEnabled ? 'Silenciar voz de la IA' : 'Activar voz de la IA'}
          >
            {voiceEnabled ? <Volume2 size={16} /> : <VolumeX size={16} className="text-red-400" />}
          </button>
        </div>
      </div>
    </div>
  );
};
