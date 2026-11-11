import React from 'react';
import { PlayerEntity, CLASS_CONFIGS, AltarEntity } from '../types';
import { Heart, Zap, Sparkles, Shield, Flame, Coins, Hammer, Scale } from 'lucide-react';
import { sfx } from '../audio/sfx';

interface Props {
  player: PlayerEntity;
  roomIndex: number;
  totalRooms: number;
  enemiesRemaining: number;
  altar: AltarEntity | null;
  onAltarInteract: (action: 'UPGRADE_WEAPON' | 'BUY_HEAL' | 'BUY_SHIELD' | 'ACCEPT_PACT') => void;
}

export const PlayerHUD: React.FC<Props> = ({
  player,
  enemiesRemaining,
  altar,
  onAltarInteract,
}) => {
  const hpPct = Math.max(0, Math.min(100, (player.currentHp / player.maxHp) * 100));
  const shieldPct = Math.max(0, Math.min(100, player.shieldHp));
  const stats = CLASS_CONFIGS[player.classType] || CLASS_CONFIGS.CAZADOR;

  const now = Date.now();
  // Dash recharge progress
  const dashCooldown = stats.dashCooldownMs;
  const dashLeft = Math.max(0, player.dashCooldownEndsAt - now);
  const dashReady = dashLeft === 0;
  const dashPct = dashReady ? 100 : Math.max(0, 100 - (dashLeft / dashCooldown) * 100);

  // Active Class Skill recharge progress
  const skillCooldown = stats.skillCooldownMs;
  const skillLeft = Math.max(0, player.skillCooldownEndsAt - now);
  const skillReady = skillLeft === 0;
  const skillPct = skillReady ? 100 : Math.max(0, 100 - (skillLeft / skillCooldown) * 100);

  return (
    <>
      {/* Left HUD: Player Stats, Health, Shield, Skill, Dash & Relics */}
      <div className="absolute bottom-4 left-4 z-20 pointer-events-none flex flex-col gap-2 max-w-xs w-80">
        {/* Combo Banner if active */}
        {player.combo >= 3 && (
          <div
            className={`flex items-center justify-between px-3 py-1 rounded border font-cinzel text-xs font-black shadow-lg ${
              player.combo >= 15
                ? 'bg-red-950/95 border-red-500 text-amber-300 animate-pulse'
                : 'bg-amber-950/90 border-amber-600 text-amber-200'
            }`}
          >
            <span className="flex items-center gap-1">
              <Flame size={14} className="fill-amber-400 text-red-500" />
              RACHA DE COMBO x{player.combo}
            </span>
            <span className="text-[10px] uppercase tracking-wider">
              {player.combo >= 15 ? '¡MODO FRENESÍ!' : '+VELOCIDAD & ORO'}
            </span>
          </div>
        )}

        {/* Relics Row */}
        {player.relics.length > 0 && (
          <div className="flex items-center gap-1.5 bg-[#141210]/95 border border-[#44403c] px-2.5 py-1 rounded shadow-lg pointer-events-auto">
            <span className="text-[10px] font-bold text-[#d97706] uppercase tracking-wider font-cinzel flex items-center gap-1">
              <Sparkles size={11} /> Reliquias:
            </span>
            <div className="flex items-center gap-1 flex-wrap">
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

        {/* Main Health, Shield, Gold & Abilities Plaque */}
        <div className="bg-[#141210]/95 border-2 border-[#44403c] rounded-lg p-3 shadow-2xl flex flex-col gap-2 relative">
          <div className="absolute top-1 left-1 w-1 h-1 rounded-full bg-[#78716c]"></div>
          <div className="absolute top-1 right-1 w-1 h-1 rounded-full bg-[#78716c]"></div>
          <div className="absolute bottom-1 left-1 w-1 h-1 rounded-full bg-[#78716c]"></div>
          <div className="absolute bottom-1 right-1 w-1 h-1 rounded-full bg-[#78716c]"></div>

          {/* Top: Name, Weapon Level & Gold */}
          <div className="flex items-center justify-between text-xs font-cinzel">
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-[#e7e5e4]">{player.name}</span>
              <span className="text-[#d97706] text-[10px] bg-[#1c1917] px-1.5 py-0.5 rounded border border-[#44403c]">
                ⚒️ Nv.{player.weaponLevel}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-amber-400 font-bold text-xs flex items-center gap-1">
                <Coins size={12} className="text-yellow-400" /> {player.gold}
              </span>
              <span className="text-[#a8a29e] font-bold text-[10px]">
                {enemiesRemaining > 0 ? `⚔️ ${enemiesRemaining}` : '✓ LIMPIA'}
              </span>
            </div>
          </div>

          {/* Health Bar + Shield Bar */}
          <div>
            <div className="flex justify-between text-[10px] font-cinzel text-[#a8a29e] mb-1">
              <span className="flex items-center gap-1 text-[#ef4444] font-bold">
                <Heart size={11} className="fill-[#b91c1c] text-[#b91c1c]" /> SALUD
                {player.shieldHp > 0 && (
                  <span className="text-sky-400 ml-1 flex items-center gap-0.5">
                    <Shield size={10} className="fill-sky-500" /> +{player.shieldHp}
                  </span>
                )}
              </span>
              <span>
                {player.currentHp} / {player.maxHp}
              </span>
            </div>
            <div className="w-full bg-[#0c0a09] h-3.5 rounded border border-[#292524] overflow-hidden p-0.5 relative">
              <div
                className={`h-full rounded-sm transition-all duration-150 ${
                  hpPct > 50 ? 'bg-[#991b1b]' : hpPct > 25 ? 'bg-[#b45309]' : 'bg-[#dc2626] animate-pulse'
                }`}
                style={{ width: `${hpPct}%` }}
              ></div>
              {shieldPct > 0 && (
                <div
                  className="absolute top-0 left-0 h-1 bg-sky-400/90 transition-all duration-150"
                  style={{ width: `${shieldPct}%` }}
                ></div>
              )}
            </div>
          </div>

          {/* Active Class Skill Bar (Right Click / E) */}
          <div>
            <div className="flex justify-between text-[9px] font-cinzel text-[#a8a29e] mb-0.5">
              <span className="flex items-center gap-1 text-purple-300 font-bold">
                <Sparkles size={10} className="text-purple-400" /> [CLIC DER / E] {stats.skillName.toUpperCase()}
              </span>
              <span className={skillReady ? 'text-purple-300 font-bold' : 'text-[#57534e]'}>
                {skillReady ? 'LISTO' : `${(skillLeft / 1000).toFixed(1)}s`}
              </span>
            </div>
            <div className="w-full bg-[#0c0a09] h-2 rounded border border-[#292524] overflow-hidden">
              <div
                className={`h-full rounded-sm transition-all duration-75 ${
                  skillReady ? 'bg-purple-600' : 'bg-stone-700'
                }`}
                style={{ width: `${skillPct}%` }}
              ></div>
            </div>
          </div>

          {/* Dash Stamina */}
          <div>
            <div className="flex justify-between text-[9px] font-cinzel text-[#78716c] mb-0.5">
              <span className="flex items-center gap-1 text-amber-500">
                <Zap size={10} className="fill-amber-500" /> [ESPACIO] DASH EVASIVO
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

      {/* Right HUD: Altar of Pacts & Armory (When Room Cleared) */}
      {enemiesRemaining === 0 && altar && (
        <div className="absolute bottom-4 right-4 z-20 pointer-events-auto max-w-xs w-80 bg-[#141210]/95 border-2 border-purple-700/80 rounded-lg p-3 shadow-2xl flex flex-col gap-2">
          <div className="flex items-center justify-between border-b border-[#292524] pb-1.5">
            <span className="text-xs font-cinzel font-black text-purple-300 flex items-center gap-1.5">
              <Scale size={14} className="text-purple-400" /> ALTAR & ARMERÍA
            </span>
            <span className="text-xs font-cinzel font-bold text-amber-400 flex items-center gap-1">
              🪙 {player.gold} Oro
            </span>
          </div>

          {/* Armory Gold Upgrades */}
          <div className="grid grid-cols-3 gap-1.5">
            <button
              onClick={() => {
                sfx.playChestOpen();
                onAltarInteract('UPGRADE_WEAPON');
              }}
              disabled={player.gold < altar.weaponUpgradeCost}
              className="p-1.5 rounded bg-[#1c1917] hover:bg-[#292524] border border-[#44403c] disabled:opacity-40 flex flex-col items-center text-center transition"
            >
              <Hammer size={13} className="text-amber-400 mb-0.5" />
              <span className="text-[9px] font-cinzel font-bold text-[#f5f5f4]">FORJAR ARMA</span>
              <span className="text-[9px] font-cinzel text-amber-400">🪙 {altar.weaponUpgradeCost}</span>
            </button>

            <button
              onClick={() => {
                sfx.playHeal();
                onAltarInteract('BUY_HEAL');
              }}
              disabled={player.gold < altar.healCost || player.currentHp >= player.maxHp}
              className="p-1.5 rounded bg-[#1c1917] hover:bg-[#292524] border border-[#44403c] disabled:opacity-40 flex flex-col items-center text-center transition"
            >
              <Heart size={13} className="text-red-400 mb-0.5" />
              <span className="text-[9px] font-cinzel font-bold text-[#f5f5f4]">+65 SALUD</span>
              <span className="text-[9px] font-cinzel text-amber-400">🪙 {altar.healCost}</span>
            </button>

            <button
              onClick={() => {
                sfx.playSkill();
                onAltarInteract('BUY_SHIELD');
              }}
              disabled={player.gold < altar.shieldCost || player.shieldHp >= 100}
              className="p-1.5 rounded bg-[#1c1917] hover:bg-[#292524] border border-[#44403c] disabled:opacity-40 flex flex-col items-center text-center transition"
            >
              <Shield size={13} className="text-sky-400 mb-0.5" />
              <span className="text-[9px] font-cinzel font-bold text-[#f5f5f4]">+50 ESCUDO</span>
              <span className="text-[9px] font-cinzel text-amber-400">🪙 {altar.shieldCost}</span>
            </button>
          </div>

          {/* AI Director's Cursed Pact */}
          {!altar.pact.used ? (
            <div className="bg-[#1c1917] border border-purple-800/70 rounded p-2 flex flex-col gap-1">
              <div className="text-[10px] font-cinzel font-bold text-purple-300">
                ⚖️ {altar.pact.title}
              </div>
              <div className="text-[10px] text-[#a8a29e] font-serif italic leading-tight">
                "{altar.pact.description}"
              </div>
              <div className="text-[9px] text-emerald-400 font-semibold">✦ {altar.pact.rewardText}</div>
              <div className="text-[9px] text-rose-400 font-semibold">⚠️ Costo: {altar.pact.costText}</div>
              <button
                onClick={() => {
                  sfx.playSynergy();
                  onAltarInteract('ACCEPT_PACT');
                }}
                className="mt-1 w-full py-1.5 bg-purple-900 hover:bg-purple-800 text-purple-100 border border-purple-500 rounded text-[10px] font-cinzel font-bold tracking-wider transition"
              >
                FIRMAR PACTO CON EL DIRECTOR
              </button>
            </div>
          ) : (
            <div className="text-[10px] font-cinzel text-center text-[#78716c] italic py-1">
              ✓ Pacto de esta cámara sellado
            </div>
          )}
        </div>
      )}
    </>
  );
};
