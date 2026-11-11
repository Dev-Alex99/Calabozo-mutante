import React from 'react';
import { PlayerEntity, CLASS_CONFIGS } from '../types';
import { Heart, Zap, Shield, Sparkles } from 'lucide-react';

interface Props {
  player: PlayerEntity;
  roomIndex: number;
  totalRooms: number;
  enemiesRemaining: number;
}

export const PlayerHUD: React.FC<Props> = ({ player, roomIndex, totalRooms, enemiesRemaining }) => {
  const hpPct = Math.max(0, Math.min(100, (player.currentHp / player.maxHp) * 100));
  const stats = CLASS_CONFIGS[player.classType] || CLASS_CONFIGS.CAZADOR;

  // Dash recharge progress
  const now = Date.now();
  const dashCooldown = stats.dashCooldownMs;
  const dashLeft = Math.max(0, player.dashCooldownEndsAt - now);
  const dashReady = dashLeft === 0;
  const dashPct = dashReady ? 100 : Math.max(0, 100 - (dashLeft / dashCooldown) * 100);

  return (
    <div className="absolute bottom-4 left-4 z-20 pointer-events-none flex flex-col gap-2 max-w-sm">
      {/* Relics Row */}
      {player.relics.length > 0 && (
        <div className="flex items-center gap-1.5 bg-gray-900/80 backdrop-blur-sm border border-yellow-500/30 px-3 py-1.5 rounded-lg">
          <span className="text-[10px] font-bold text-yellow-400 uppercase tracking-widest font-mono flex items-center gap-1">
            <Sparkles size={12} /> Reliquias:
          </span>
          <div className="flex items-center gap-1">
            {player.relics.map(r => (
              <span
                key={r.id}
                title={`${r.name}: ${r.buffDescription}`}
                className="text-base cursor-help hover:scale-125 transition-transform"
              >
                {r.icon}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Main Health & Stamina Card */}
      <div className="bg-gray-900/90 backdrop-blur-md border border-gray-700/80 rounded-xl p-3 shadow-xl flex flex-col gap-2">
        {/* Top: Class & Level */}
        <div className="flex items-center justify-between text-xs font-mono">
          <div className="flex items-center gap-1.5">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                player.classType === 'GUERRERO'
                  ? 'bg-blue-500'
                  : player.classType === 'CAZADOR'
                  ? 'bg-emerald-500'
                  : 'bg-purple-500'
              }`}
            ></span>
            <span className="font-bold text-gray-200">{player.name}</span>
            <span className="text-gray-400">({player.classType})</span>
          </div>
          <span className="text-yellow-400 font-bold">
            ⚔️ {enemiesRemaining > 0 ? `${enemiesRemaining} VIVOS` : 'SALA LIMPIA'}
          </span>
        </div>

        {/* Health Bar */}
        <div>
          <div className="flex justify-between text-[11px] font-mono text-gray-300 mb-1">
            <span className="flex items-center gap-1 text-red-400 font-bold">
              <Heart size={12} className="fill-red-500" /> SALUD
            </span>
            <span>
              {player.currentHp} / {player.maxHp}
            </span>
          </div>
          <div className="w-full bg-gray-950 h-3.5 rounded-full border border-gray-800 overflow-hidden p-0.5">
            <div
              className={`h-full rounded-full transition-all duration-150 ${
                hpPct > 50 ? 'bg-emerald-500' : hpPct > 25 ? 'bg-amber-500' : 'bg-red-500 animate-pulse'
              }`}
              style={{ width: `${hpPct}%` }}
            ></div>
          </div>
        </div>

        {/* Dash Cooldown Bar */}
        <div>
          <div className="flex justify-between text-[10px] font-mono text-gray-400 mb-0.5">
            <span className="flex items-center gap-1 text-cyan-400">
              <Zap size={11} className="fill-cyan-400" /> DASH (ESPACIO / SHIFT)
            </span>
            <span className={dashReady ? 'text-cyan-300 font-bold' : 'text-gray-500'}>
              {dashReady ? 'LISTO' : 'RECARGANDO'}
            </span>
          </div>
          <div className="w-full bg-gray-950 h-2 rounded-full border border-gray-800 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-75 ${
                dashReady ? 'bg-cyan-400 shadow-sm shadow-cyan-400' : 'bg-cyan-700/60'
              }`}
              style={{ width: `${dashPct}%` }}
            ></div>
          </div>
        </div>
      </div>
    </div>
  );
};
