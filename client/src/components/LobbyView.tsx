import React, { useState } from 'react';
import { PlayerClass, GameWorldState, CLASS_CONFIGS } from '../types';
import { Shield, Crosshair, Sparkles, Users, Copy, Check, Play, Swords } from 'lucide-react';
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
  const [playerName, setPlayerName] = useState(() => localStorage.getItem('calabozo_name') || 'Concursante');
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
    color: string;
    borderColor: string;
  }> = [
    {
      id: 'GUERRERO',
      name: 'Caballero Descafeinado',
      icon: '🛡️',
      role: 'Tanque / Melé Pesado',
      weapon: 'Espadón de Oficina (Arco melé)',
      description: 'Alta resistencia y golpes destructivos a corta distancia.',
      color: 'bg-blue-950/60',
      borderColor: 'border-blue-500',
    },
    {
      id: 'CAZADOR',
      name: 'Cazador Desesperado',
      icon: '🏹',
      role: 'Tirador Ágil / Fuego Rápido',
      weapon: 'Ballesta de Precisión (Disparo continuo)',
      description: 'Gran cadencia y velocidad de carrera. Balas con rebote natural.',
      color: 'bg-emerald-950/60',
      borderColor: 'border-emerald-500',
    },
    {
      id: 'MAGO',
      name: 'Mago Piromaniaco',
      icon: '🔮',
      role: 'Daño en Área / Explosivo',
      weapon: 'Orbes de Fuego Igneo (Daño de impacto + splash)',
      description: 'Menos salud, pero sus proyectiles causan daño masivo en área.',
      color: 'bg-purple-950/60',
      borderColor: 'border-purple-500',
    },
  ];

  return (
    <div className="fixed inset-0 bg-gray-950 flex items-center justify-center p-4 z-40 overflow-y-auto">
      {/* Background Grid Accent */}
      <div className="absolute inset-0 bg-[radial-gradient(#1f2937_1px,transparent_1px)] [background-size:24px_24px] opacity-40"></div>

      <div className="relative max-w-xl w-full bg-gray-900 border border-gray-700/80 rounded-2xl p-6 shadow-2xl flex flex-col items-center">
        {/* Title & Badge */}
        <div className="flex items-center gap-2 mb-1">
          <span className="text-2xl animate-bounce">🏰</span>
          <span className="text-xs uppercase font-mono font-bold tracking-widest text-red-400 bg-red-950/80 border border-red-500/40 px-2.5 py-0.5 rounded-full">
            MINIMAX M3.1 FLASH POWERED
          </span>
        </div>
        <h1 className="text-2xl md:text-3xl font-black font-mono tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-red-500 via-amber-400 to-yellow-400 uppercase text-center">
          CALABOZO MUTANTE
        </h1>
        <p className="text-xs text-gray-400 font-sans mt-0.5 mb-5 text-center">
          Un roguelite cooperativo donde la IA muta las físicas de las salas en tiempo real.
        </p>

        {errorMessage && (
          <div className="mb-4 w-full bg-red-950/80 border border-red-500 text-red-200 text-xs font-mono p-3 rounded-lg text-center">
            ⚠️ {errorMessage}
          </div>
        )}

        {!isInsideRoom ? (
          /* ================= STEP 1: CREATE OR JOIN ================= */
          <div className="w-full flex flex-col gap-4">
            {/* Player Name Input */}
            <div>
              <label className="block text-xs font-mono font-bold text-gray-300 uppercase mb-1">
                Tu Apodo de Concursante
              </label>
              <input
                type="text"
                value={playerName}
                onChange={e => handleNameChange(e.target.value)}
                maxLength={16}
                placeholder="Escribe tu apodo..."
                className="w-full px-3 py-2 bg-gray-950 border border-gray-700 rounded-lg text-sm text-gray-100 font-mono focus:outline-none focus:border-amber-400"
              />
            </div>

            {/* Class Selection */}
            <div>
              <label className="block text-xs font-mono font-bold text-gray-300 uppercase mb-2">
                Selecciona tu Clase de Héroe
              </label>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
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
                      className={`text-left p-3 rounded-xl border transition-all ${
                        isSelected
                          ? `${cls.color} ${cls.borderColor} shadow-lg scale-[1.02]`
                          : 'bg-gray-950/60 border-gray-800 hover:border-gray-700'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xl">{cls.icon}</span>
                        <div className="font-bold text-xs font-mono text-gray-100">{cls.name}</div>
                      </div>
                      <div className="text-[10px] text-gray-400 font-sans leading-tight mb-2">
                        {cls.description}
                      </div>
                      <div className="text-[9px] font-mono text-gray-500 border-t border-gray-800/80 pt-1.5 flex justify-between">
                        <span>❤️ {stats.maxHp} HP</span>
                        <span>⚡ {stats.attackDamage} DMG</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Tabs: Create vs Join */}
            <div className="flex border-b border-gray-800 mt-2">
              <button
                onClick={() => setActiveTab('CREATE')}
                className={`flex-1 py-2 text-xs font-mono font-bold border-b-2 transition ${
                  activeTab === 'CREATE'
                    ? 'border-amber-400 text-amber-400'
                    : 'border-transparent text-gray-500 hover:text-gray-300'
                }`}
              >
                CREAR MAZMORRA
              </button>
              <button
                onClick={() => setActiveTab('JOIN')}
                className={`flex-1 py-2 text-xs font-mono font-bold border-b-2 transition ${
                  activeTab === 'JOIN'
                    ? 'border-amber-400 text-amber-400'
                    : 'border-transparent text-gray-500 hover:text-gray-300'
                }`}
              >
                UNIRSE POR CÓDIGO
              </button>
            </div>

            {activeTab === 'CREATE' ? (
              <button
                onClick={() => {
                  sfx.playChestOpen();
                  onCreateRoom(playerName, selectedClass);
                }}
                disabled={isLoading || !playerName.trim()}
                className="w-full py-3 bg-gradient-to-r from-red-600 to-amber-500 hover:from-red-500 hover:to-amber-400 text-gray-950 font-black rounded-xl text-sm font-mono tracking-wider transition shadow-lg shadow-amber-500/20 disabled:opacity-50"
              >
                {isLoading ? 'CREANDO SALA...' : 'ABRIR NUEVA MAZMORRA'}
              </button>
            ) : (
              <div className="flex flex-col gap-2">
                <input
                  type="text"
                  value={roomCodeInput}
                  onChange={e => setRoomCodeInput(e.target.value.toUpperCase())}
                  maxLength={4}
                  placeholder="CÓDIGO DE 4 LETRAS"
                  className="w-full px-3 py-2 bg-gray-950 border border-gray-700 rounded-lg text-sm text-center tracking-widest text-yellow-400 font-mono font-black focus:outline-none focus:border-amber-400"
                />
                <button
                  onClick={() => {
                    sfx.playShoot();
                    onJoinRoom(roomCodeInput, playerName, selectedClass);
                  }}
                  disabled={isLoading || roomCodeInput.length !== 4 || !playerName.trim()}
                  className="w-full py-3 bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-gray-950 font-black rounded-xl text-sm font-mono tracking-wider transition shadow-lg shadow-emerald-500/20 disabled:opacity-50"
                >
                  {isLoading ? 'CONECTANDO...' : 'ENTRAR AL CALABOZO'}
                </button>
              </div>
            )}
          </div>
        ) : (
          /* ================= STEP 2: LOBBY ROOM WAITING ================= */
          <div className="w-full flex flex-col gap-4">
            {/* Room Code Badge */}
            <div className="bg-gray-950/80 border border-yellow-500/40 rounded-xl p-3 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-mono text-gray-400 uppercase tracking-widest block">
                  CÓDIGO DE LA MAZMORRA
                </span>
                <span className="text-2xl font-black font-mono tracking-widest text-yellow-400">
                  {world.code}
                </span>
              </div>
              <button
                onClick={handleCopyCode}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs font-mono rounded-lg transition"
              >
                {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                {copied ? '¡COPIADO!' : 'COPIAR'}
              </button>
            </div>

            {/* Players in Lobby */}
            <div>
              <div className="text-xs font-mono text-gray-400 mb-2 flex items-center justify-between">
                <span className="flex items-center gap-1">
                  <Users size={14} /> ESCUADRA (MÁXIMO 4):
                </span>
                <span className="text-yellow-400 font-bold">
                  {Object.keys(world.players).length} / 4
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {Object.values(world.players).map(p => (
                  <div
                    key={p.id}
                    className="flex items-center gap-3 bg-gray-950 border border-gray-800 p-2.5 rounded-xl"
                  >
                    <span className="text-xl">
                      {p.classType === 'GUERRERO' ? '🛡️' : p.classType === 'CAZADOR' ? '🏹' : '🔮'}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-mono font-bold text-gray-200 truncate flex items-center gap-1">
                        {p.name} {p.isHost && '👑'}
                      </div>
                      <div className="text-[10px] text-gray-500 font-mono">
                        {p.classType} • {p.id === localPlayerId ? 'Tú' : 'Aliado'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Controls Guide */}
            <div className="bg-gray-950/50 border border-gray-800/80 rounded-xl p-3 text-[11px] font-mono text-gray-400 leading-relaxed">
              <span className="text-yellow-400 font-bold block mb-1">🎮 CONTROLES:</span>
              <div>• <strong>W, A, S, D</strong>: Moverse con inercia</div>
              <div>• <strong>MOUSE</strong>: Apuntar en 360° • <strong>CLIC</strong>: Atacar</div>
              <div>• <strong>ESPACIO / SHIFT</strong>: Dash evasivo con invulnerabilidad</div>
            </div>

            {/* Start Button */}
            {isHost ? (
              <button
                onClick={() => {
                  sfx.playRoomClear();
                  onStartGame();
                }}
                className="w-full py-3.5 bg-gradient-to-r from-red-600 via-amber-500 to-yellow-500 hover:from-red-500 hover:to-amber-400 text-gray-950 font-black rounded-xl text-sm font-mono tracking-wider transition shadow-lg shadow-amber-500/25 flex items-center justify-center gap-2"
              >
                <Play size={18} className="fill-gray-950" /> COMENZAR LA EXPEDICIÓN
              </button>
            ) : (
              <div className="text-center text-xs font-mono text-gray-500 italic py-2 animate-pulse">
                Esperando a que el líder inicie la partida...
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
