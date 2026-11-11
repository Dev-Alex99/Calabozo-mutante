import React, { useState } from 'react';
import { PlayerClass, GameWorldState, CLASS_CONFIGS } from '../types';
import { Users, Copy, Check, Play, Shield, Crosshair, Sparkles } from 'lucide-react';
import { sfx } from '../audio/sfx';

interface Props {
  world: GameWorldState | null;
  localPlayerId: string;
  onCreateRoom: (name: string, classType: PlayerClass) => void;
  onJoinRoom: (code: string, name: string, classType: PlayerClass) => void;
  onStartGame: () => void;
  isLoading: boolean;
  errorMessage: string | null;
}

export const LobbyView: React.FC<Props> = ({
  world,
  localPlayerId,
  onCreateRoom,
  onJoinRoom,
  onStartGame,
  isLoading,
  errorMessage,
}) => {
  const [playerName, setPlayerName] = useState(() => localStorage.getItem('calabozo_name') || 'Cruzado');
  const [roomCodeInput, setRoomCodeInput] = useState('');
  const [selectedClass, setSelectedClass] = useState<PlayerClass>('CAZADOR');
  const [activeTab, setActiveTab] = useState<'CREATE' | 'JOIN'>('CREATE');
  const [copied, setCopied] = useState(false);

  const handleNameChange = (name: string) => {
    setPlayerName(name);
    localStorage.setItem('calabozo_name', name);
  };

  const handleCopyCode = () => {
    if (!world?.code) return;
    navigator.clipboard.writeText(world.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isInsideRoom = !!world && world.phase === 'LOBBY';
  const localPlayer = world?.players[localPlayerId];
  const isHost = localPlayer?.isHost;

  const CLASSES: Array<{
    id: PlayerClass;
    name: string;
    icon: string;
    description: string;
    weapon: string;
    role: string;
  }> = [
    {
      id: 'GUERRERO',
      name: 'Caballero Descafeinado',
      icon: '🛡️',
      role: 'Tanque / Melé Pesado',
      weapon: 'Zweihänder de Hierro Forjado',
      description: 'Armadura pesada (160 HP), espadazo amplio en arco y gran empuje.',
    },
    {
      id: 'CAZADOR',
      name: 'Cazador Desesperado',
      icon: '🏹',
      role: 'Tirador Ágil / Larga Distancia',
      weapon: 'Ballesta de Precisión con Virotes',
      description: 'Velocidad de carrera (100 HP) y virotes rápidos que rebotan.',
    },
    {
      id: 'MAGO',
      name: 'Mago Piromaniaco',
      icon: '🔮',
      role: 'Daño en Área / Proyectil Ígneo',
      weapon: 'Báculo de Roble y Orbes Igneos',
      description: 'Menos salud (80 HP), pero sus orbes explotan en área con daño masivo.',
    },
  ];

  return (
    <div className="fixed inset-0 bg-[#0c0a09] flex items-center justify-center p-4 z-40 overflow-y-auto">
      {/* Heavy Medieval Iron Frame */}
      <div className="relative max-w-xl w-full bg-[#141210] border-2 border-[#44403c] rounded-xl p-6 shadow-2xl flex flex-col items-center">
        {/* Stone corner rivets */}
        <div className="absolute top-2 left-2 w-2 h-2 rounded-full bg-[#78716c]"></div>
        <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-[#78716c]"></div>
        <div className="absolute bottom-2 left-2 w-2 h-2 rounded-full bg-[#78716c]"></div>
        <div className="absolute bottom-2 right-2 w-2 h-2 rounded-full bg-[#78716c]"></div>

        {/* Title & Crest */}
        <div className="flex items-center gap-2 mb-1">
          <span className="text-2xl">🏰</span>
          <span className="text-[10px] uppercase font-cinzel font-bold tracking-widest text-[#d97706] bg-[#1c1917] border border-[#78350f] px-2.5 py-0.5 rounded">
            DIRECTOR CON MINIMAX M3.1 FLASH
          </span>
        </div>
        <h1 className="text-2xl md:text-3xl font-black font-cinzel tracking-wider text-[#f5f5f4] uppercase text-center">
          CALABOZO MUTANTE
        </h1>
        <p className="text-xs text-[#a8a29e] font-serif italic mt-0.5 mb-5 text-center">
          Roguelite cooperativo donde el Director muta las físicas de las cámaras en tiempo real.
        </p>

        {errorMessage && (
          <div className="mb-4 w-full bg-[#450a0a] border border-[#991b1b] text-[#fca5a5] text-xs font-cinzel p-2.5 rounded text-center">
            ⚠️ {errorMessage}
          </div>
        )}

        {!isInsideRoom ? (
          /* ================= STEP 1: CREATE OR JOIN ================= */
          <div className="w-full flex flex-col gap-3.5">
            {/* Player Name Input */}
            <div>
              <label className="block text-[11px] font-cinzel font-bold text-[#d6d3d1] uppercase mb-1">
                Nombre de tu Héroe
              </label>
              <input
                type="text"
                value={playerName}
                onChange={e => handleNameChange(e.target.value)}
                maxLength={16}
                placeholder="Escribe tu nombre..."
                className="w-full px-3 py-2 bg-[#0c0a09] border border-[#44403c] rounded text-sm text-[#f5f5f4] font-cinzel focus:outline-none focus:border-[#d97706]"
              />
            </div>

            {/* Class Selection */}
            <div>
              <label className="block text-[11px] font-cinzel font-bold text-[#d6d3d1] uppercase mb-1.5">
                Gremio de Aventurero
              </label>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                {CLASSES.map(cls => {
                  const isSelected = selectedClass === cls.id;
                  const stats = CLASS_CONFIGS[cls.id];
                  return (
                    <button
                      key={cls.id}
                      onClick={() => {
                        setSelectedClass(cls.id);
                        sfx.playShoot();
                      }}
                      className={`text-left p-2.5 rounded border transition-all ${
                        isSelected
                          ? 'bg-[#1c1917] border-[#d97706] shadow-md shadow-black'
                          : 'bg-[#0c0a09] border-[#292524] hover:border-[#44403c]'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="text-lg">{cls.icon}</span>
                        <div className="font-bold text-xs font-cinzel text-[#f5f5f4] leading-tight">
                          {cls.name}
                        </div>
                      </div>
                      <div className="text-[10px] text-[#a8a29e] font-serif leading-tight mb-2">
                        {cls.description}
                      </div>
                      <div className="text-[9px] font-cinzel text-[#78716c] border-t border-[#292524] pt-1 flex justify-between">
                        <span>❤️ {stats.maxHp} HP</span>
                        <span>⚡ {stats.attackDamage} Daño</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Tabs: Create vs Join */}
            <div className="flex border-b border-[#292524] mt-1">
              <button
                onClick={() => setActiveTab('CREATE')}
                className={`flex-1 py-2 text-xs font-cinzel font-bold border-b-2 transition ${
                  activeTab === 'CREATE'
                    ? 'border-[#d97706] text-[#d97706]'
                    : 'border-transparent text-[#78716c] hover:text-[#d6d3d1]'
                }`}
              >
                FORJAR MAZMORRA
              </button>
              <button
                onClick={() => setActiveTab('JOIN')}
                className={`flex-1 py-2 text-xs font-cinzel font-bold border-b-2 transition ${
                  activeTab === 'JOIN'
                    ? 'border-[#d97706] text-[#d97706]'
                    : 'border-transparent text-[#78716c] hover:text-[#d6d3d1]'
                }`}
              >
                UNIRSE CON CÓDIGO
              </button>
            </div>

            {activeTab === 'CREATE' ? (
              <button
                onClick={() => {
                  sfx.playChestOpen();
                  onCreateRoom(playerName, selectedClass);
                }}
                disabled={isLoading || !playerName.trim()}
                className="w-full py-2.5 bg-[#78350f] hover:bg-[#92400e] text-[#fef3c7] font-bold rounded text-xs font-cinzel tracking-wider transition border border-[#b45309] shadow-lg disabled:opacity-50"
              >
                {isLoading ? 'ABRIENDO MAZMORRA...' : 'ABRIR NUEVO CALABOZO'}
              </button>
            ) : (
              <div className="flex flex-col gap-2">
                <input
                  type="text"
                  value={roomCodeInput}
                  onChange={e => setRoomCodeInput(e.target.value.toUpperCase())}
                  maxLength={4}
                  placeholder="CÓDIGO DE 4 LETRAS"
                  className="w-full px-3 py-2 bg-[#0c0a09] border border-[#44403c] rounded text-sm text-center tracking-widest text-[#d97706] font-cinzel font-black focus:outline-none focus:border-[#d97706]"
                />
                <button
                  onClick={() => {
                    sfx.playShoot();
                    onJoinRoom(roomCodeInput, playerName, selectedClass);
                  }}
                  disabled={isLoading || roomCodeInput.length !== 4 || !playerName.trim()}
                  className="w-full py-2.5 bg-[#14532d] hover:bg-[#166534] text-[#f0fdf4] font-bold rounded text-xs font-cinzel tracking-wider transition border border-[#15803d] shadow-lg disabled:opacity-50"
                >
                  {isLoading ? 'ENTRANDO...' : 'ENTRAR AL CALABOZO'}
                </button>
              </div>
            )}
          </div>
        ) : (
          /* ================= STEP 2: LOBBY ROOM WAITING ================= */
          <div className="w-full flex flex-col gap-3.5">
            {/* Room Code Badge */}
            <div className="bg-[#0c0a09] border border-[#44403c] rounded-lg p-3 flex items-center justify-between">
              <div>
                <span className="text-[9px] font-cinzel text-[#a8a29e] uppercase tracking-wider block">
                  CÓDIGO DEL CALABOZO
                </span>
                <span className="text-2xl font-black font-cinzel tracking-widest text-[#d97706]">
                  {world.code}
                </span>
              </div>
              <button
                onClick={handleCopyCode}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1c1917] hover:bg-[#292524] text-[#d6d3d1] text-xs font-cinzel rounded border border-[#44403c] transition"
              >
                {copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
                {copied ? '¡COPIADO!' : 'COPIAR'}
              </button>
            </div>

            {/* Squad Members */}
            <div>
              <div className="text-[11px] font-cinzel text-[#a8a29e] mb-1.5 flex items-center justify-between">
                <span className="flex items-center gap-1">
                  <Users size={13} /> ESCUADRA (MÁXIMO 4):
                </span>
                <span className="text-[#d97706] font-bold">
                  {Object.keys(world.players).length} / 4
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {Object.values(world.players).map(p => (
                  <div
                    key={p.id}
                    className="flex items-center gap-2.5 bg-[#0c0a09] border border-[#292524] p-2 rounded"
                  >
                    <span className="text-lg">
                      {p.classType === 'GUERRERO' ? '🛡️' : p.classType === 'CAZADOR' ? '🏹' : '🔮'}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-cinzel font-bold text-[#f5f5f4] truncate flex items-center gap-1">
                        {p.name} {p.isHost && '👑'}
                      </div>
                      <div className="text-[10px] text-[#78716c] font-cinzel">
                        {p.classType} • {p.id === localPlayerId ? 'Tú' : 'Aliado'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Controls Guide */}
            <div className="bg-[#0c0a09] border border-[#292524] rounded-lg p-2.5 text-[11px] font-cinzel text-[#a8a29e] leading-relaxed">
              <span className="text-[#d97706] font-bold block mb-0.5">CONTROLES DE COMBATE:</span>
              <div>• <strong>W, A, S, D</strong>: Moverse con inercia</div>
              <div>• <strong>RATÓN</strong>: Apuntar en 360° • <strong>CLIC</strong>: Atacar</div>
              <div>• <strong>ESPACIO / SHIFT</strong>: Dash evasivo con invulnerabilidad</div>
            </div>

            {/* Start Button */}
            {isHost ? (
              <button
                onClick={() => {
                  sfx.playRoomClear();
                  onStartGame();
                }}
                className="w-full py-3 bg-[#78350f] hover:bg-[#92400e] text-[#fef3c7] font-bold rounded-lg text-xs font-cinzel tracking-wider transition border border-[#b45309] shadow-lg flex items-center justify-center gap-2"
              >
                <Play size={15} className="fill-[#fef3c7]" /> COMENZAR LA EXPEDICIÓN
              </button>
            ) : (
              <div className="text-center text-xs font-cinzel text-[#78716c] italic py-1 animate-pulse">
                Esperando la orden del líder de la expedición...
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
