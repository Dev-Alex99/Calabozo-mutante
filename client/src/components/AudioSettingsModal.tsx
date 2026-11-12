import React, { useState, useEffect } from 'react';
import { Volume2, VolumeX, Music, Swords, Mic, X, Sparkles } from 'lucide-react';
import { sfx } from '../audio/sfx.js';
import { speechDirector } from '../audio/speech.js';

interface AudioSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentQuality?: 'HIGH' | 'MEDIUM' | 'LOW';
  onQualityChange?: (q: 'HIGH' | 'MEDIUM' | 'LOW') => void;
}

export const AudioSettingsModal: React.FC<AudioSettingsModalProps> = ({
  isOpen,
  onClose,
  currentQuality = 'HIGH',
  onQualityChange,
}) => {
  const [settings, setSettings] = useState(() => sfx.getSettings());
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [quality, setQuality] = useState<'HIGH' | 'MEDIUM' | 'LOW'>(() => {
    return currentQuality || (localStorage.getItem('calabozo_gfx_quality') as any) || 'HIGH';
  });

  useEffect(() => {
    if (isOpen) {
      setSettings(sfx.getSettings());
      if (currentQuality) setQuality(currentQuality);
    }
  }, [isOpen, currentQuality]);

  if (!isOpen) return null;

  const handleQualityChange = (q: 'HIGH' | 'MEDIUM' | 'LOW') => {
    setQuality(q);
    sfx.playUiClick();
    if (onQualityChange) onQualityChange(q);
  };

  const handleMasterChange = (val: number) => {
    sfx.setMasterVolume(val);
    setSettings(prev => ({ ...prev, master: val }));
  };

  const handleMusicChange = (val: number) => {
    sfx.setMusicVolume(val);
    setSettings(prev => ({ ...prev, music: val }));
  };

  const handleSfxChange = (val: number) => {
    sfx.setSfxVolume(val);
    setSettings(prev => ({ ...prev, sfx: val }));
  };

  const handleToggleMute = () => {
    const isMuted = sfx.toggleMute();
    setSettings(prev => ({ ...prev, muted: isMuted }));
  };

  const handleToggleVoice = () => {
    const enabled = speechDirector.toggle();
    setVoiceEnabled(enabled);
  };

  const handleTestSfx = () => {
    sfx.playHitmark(true);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="relative w-full max-w-md bg-[#141210] border-2 border-[#57534e] rounded-xl p-5 shadow-2xl flex flex-col gap-4 text-[#e7e5e4] font-cinzel">
        {/* Gothic Rivet Accents */}
        <div className="absolute top-2 left-2 w-1.5 h-1.5 rounded-full bg-[#78716c]" />
        <div className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-[#78716c]" />
        <div className="absolute bottom-2 left-2 w-1.5 h-1.5 rounded-full bg-[#78716c]" />
        <div className="absolute bottom-2 right-2 w-1.5 h-1.5 rounded-full bg-[#78716c]" />

        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-[#292524] pb-2.5">
          <div className="flex items-center gap-2">
            <Volume2 className="text-amber-400" size={20} />
            <h2 className="text-base font-bold tracking-wider text-[#f5f5f4]">
              ACÚSTICA DEL CALABOZO
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-[#a8a29e] hover:text-[#f5f5f4] hover:bg-[#292524] transition"
            title="Cerrar (Esc)"
          >
            <X size={18} />
          </button>
        </div>

        {/* Controls Body */}
        <div className="flex flex-col gap-4 text-xs font-sans">
          {/* Master Volume */}
          <div className="flex flex-col gap-1.5 bg-[#1c1917] p-2.5 rounded border border-[#292524]">
            <div className="flex items-center justify-between text-xs font-cinzel font-bold">
              <span className="flex items-center gap-1.5 text-amber-300">
                <Volume2 size={14} /> Volumen Maestro
              </span>
              <span className="font-mono text-[#a8a29e]">{Math.round(settings.master * 100)}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={settings.master}
              onChange={e => handleMasterChange(parseFloat(e.target.value))}
              className="w-full accent-amber-500 cursor-pointer h-1.5 bg-[#292524] rounded-lg"
            />
          </div>

          {/* Music Volume (Banda Sonora) */}
          <div className="flex flex-col gap-1.5 bg-[#1c1917] p-2.5 rounded border border-[#292524]">
            <div className="flex items-center justify-between text-xs font-cinzel font-bold">
              <span className="flex items-center gap-1.5 text-purple-300">
                <Music size={14} /> Banda Sonora Adaptativa
              </span>
              <span className="font-mono text-[#a8a29e]">{Math.round(settings.music * 100)}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={settings.music}
              onChange={e => handleMusicChange(parseFloat(e.target.value))}
              className="w-full accent-purple-500 cursor-pointer h-1.5 bg-[#292524] rounded-lg"
            />
          </div>

          {/* SFX Volume */}
          <div className="flex flex-col gap-1.5 bg-[#1c1917] p-2.5 rounded border border-[#292524]">
            <div className="flex items-center justify-between text-xs font-cinzel font-bold">
              <span className="flex items-center gap-1.5 text-emerald-300">
                <Swords size={14} /> Efectos de Combate & Entorno
              </span>
              <span className="font-mono text-[#a8a29e]">{Math.round(settings.sfx * 100)}%</span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={settings.sfx}
                onChange={e => handleSfxChange(parseFloat(e.target.value))}
                className="w-full accent-emerald-500 cursor-pointer h-1.5 bg-[#292524] rounded-lg"
              />
              <button
                onClick={handleTestSfx}
                className="px-2 py-0.5 text-[10px] bg-[#292524] hover:bg-[#44403c] border border-[#57534e] text-emerald-300 rounded transition whitespace-nowrap"
              >
                Probar
              </button>
            </div>
          </div>

          {/* Graphics Quality & Performance Segmented Selector */}
          <div className="flex flex-col gap-1.5 bg-[#1c1917] p-2.5 rounded border border-[#292524]">
            <div className="flex items-center justify-between text-xs font-cinzel font-bold">
              <span className="flex items-center gap-1.5 text-amber-300">
                <Sparkles size={14} /> Fidelidad Visual & Rendimiento
              </span>
              <span className="font-mono text-[10px] text-amber-400 font-bold">
                {quality === 'HIGH' ? 'ÉPICA (LUCES + FX)' : quality === 'MEDIUM' ? 'MEDIA' : 'MÁX FPS'}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-1 pt-0.5">
              {(['HIGH', 'MEDIUM', 'LOW'] as const).map(q => (
                <button
                  key={q}
                  onClick={() => handleQualityChange(q)}
                  className={`py-1 px-1.5 text-[10px] font-cinzel font-bold rounded border transition ${
                    quality === q
                      ? 'bg-amber-600/30 border-amber-500 text-amber-200'
                      : 'bg-[#292524]/60 border-[#44403c] text-[#a8a29e] hover:border-[#78716c]'
                  }`}
                >
                  {q === 'HIGH' ? 'ÉPICA' : q === 'MEDIUM' ? 'MEDIA' : 'MÁX FPS'}
                </button>
              ))}
            </div>
          </div>

          {/* Toggle Switches: Mute & Director Voice */}
          <div className="grid grid-cols-2 gap-2 pt-1">
            <button
              onClick={handleToggleMute}
              className={`py-2 px-3 rounded border font-cinzel font-bold text-xs flex items-center justify-center gap-2 transition ${
                settings.muted
                  ? 'bg-rose-950/80 border-rose-700 text-rose-300 hover:bg-rose-900'
                  : 'bg-[#1c1917] border-[#44403c] text-[#d6d3d1] hover:border-amber-600'
              }`}
            >
              {settings.muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
              {settings.muted ? 'DESMUTEAR' : 'SILENCIAR TODO'}
            </button>

            <button
              onClick={handleToggleVoice}
              className={`py-2 px-3 rounded border font-cinzel font-bold text-xs flex items-center justify-center gap-2 transition ${
                voiceEnabled
                  ? 'bg-[#1c1917] border-[#44403c] text-[#d6d3d1] hover:border-amber-600'
                  : 'bg-rose-950/80 border-rose-700 text-rose-300 hover:bg-rose-900'
              }`}
            >
              <Mic size={14} />
              {voiceEnabled ? 'VOZ IA ACTIVA' : 'VOZ IA MUTADA'}
            </button>
          </div>
        </div>

        {/* Footer tip */}
        <div className="border-t border-[#292524] pt-2 text-[10px] text-[#78716c] text-center font-sans">
          💡 Puedes presionar la tecla <kbd className="bg-[#292524] text-[#a8a29e] px-1.5 py-0.5 rounded border border-[#44403c]">M</kbd> en cualquier momento para silenciar/activar el sonido.
        </div>
      </div>
    </div>
  );
};
