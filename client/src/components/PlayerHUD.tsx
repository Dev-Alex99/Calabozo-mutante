import React from 'react';
import { PlayerEntity, CLASS_CONFIGS } from '../types';
import { Heart, Zap, Sparkles } from 'lucide-react';

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
    <div className="absolute bottom-4 left-4 z-20 pointer-events-none flex flex-col gap-2 max-w-xs">
      {/* Relics Row (Parchment & Iron) */}
      {player.relics.length > 0 && (
        <div className="flex items-center gap-1.5 bg-[#141210]/95 border border-[#44403c] px-2.5 py-1 rounded shadow-lg">
          <span className="text-[10px] font-bold text-[#d97706] uppercase tracking-wider font-cinzel flex items-center gap-1">
            <Sparkles size={11} /> Reliquias:
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

      {/* Main Health & Stamina Plaque */}
      <div className="bg-[#141210]/95 border-2 border-[#44403c] rounded-lg p-3 shadow-2xl flex flex-col gap-2 relative">
        {/* Stone corner rivets */}
        <div className="absolute top-1 left-1 w-1 h-1 rounded-full bg-[#78716c]"></div>
        <div className="absolute top-1 right-1 w-1 h-1 rounded-full bg-[#78716c]"></div>
        <div className="absolute bottom-1 left-1 w-1 h-1 rounded-full bg-[#78716c]"></div>
        <div className="absolute bottom-1 right-1 w-1 h-1 rounded-full bg-[#78716c]"></div>

        {/* Top: Class & Level */}
        <div className="flex items-center justify-between text-xs font-cinzel">
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-[#e7e5e4]">{player.name}</span>
            <span className="text-[#a8a29e] text-[10px]">({player.classType})</span>
          </div>
          <span className="text-[#d97706] font-bold text-[11px]">
            {enemiesRemaining > 0 ? `⚔️ ${enemiesRemaining} ENEMIGOS` : '✓ CÁMARA PURGADA'}
          </span>
        </div>

        {/* Health Bar (Hammered Iron & Crimson) */}
        <div>
          <div className="flex justify-between text-[10px] font-cinzel text-[#a8a29e] mb-1">
            <span className="flex items-center gap-1 text-[#ef4444] font-bold">
              <Heart size={11} className="fill-[#b91c1c] text-[#b91c1c]" /> SALUD
            </span>
            <span>
              {player.currentHp} / {player.maxHp}
            </span>
          </div>
          <div className="w-full bg-[#0c0a09] h-3.5 rounded border border-[#292524] overflow-hidden p-0.5">
            <div
              className={`h-full rounded-sm transition-all duration-150 ${
                hpPct > 50 ? 'bg-[#991b1b]' : hpPct > 25 ? 'bg-[#b45309]' : 'bg-[#dc2626] animate-pulse'
              }`}
              style={{ width: `${hpPct}%` }}
            ></div>
          </div>
        </div>

        {/* Dash Stamina */}
        <div>
          <div className="flex justify-between text-[9px] font-cinzel text-[#78716c] mb-0.5">
            <span className="flex items-center gap-1 text-amber-500">
              <Zap size={10} className="fill-amber-500" /> DASH (ESPACIO / SHIFT)
            </span>
            <span className={dashReady ? 'text-amber-400 font-bold' : 'text-[#57534e]'}>
              {dashReady ? 'CARGADO' : 'RECUPERANDO'}
            </span>
          </div>
          <div className="w-full bg-[#0c0a09] h-1.5 rounded border border-[#292524] overflow-hidden">
            <div
              className={`h-full rounded-sm transition-all duration-75 ${
                dashReady ? 'bg-amber-600' : 'bg-stone-700'
              }`}
              style={{ width: `${dashPct}%` }}
            ></div>
          </div>
        </div>
      </div>
    </div>
  );
};
