import React, { useState } from 'react';
import { PlayerClass, GameWorldState, CLASS_CONFIGS } from '../types';
import { Users, Copy, Check, Play, Bot, Trash2, Sparkles, Volume2 } from 'lucide-react';
import { sfx } from '../audio/sfx';

interface Props {
  world: GameWorldState | null;
  localPlayerId: string;
  onCreateRoom: (name: string, classType: PlayerClass) => void;
  onJoinRoom: (code: string, name: string, classType: PlayerClass) => void;
  onChangeClass: (classType: PlayerClass) => void;
  onAddBot: (classType?: PlayerClass) => void;
  onRemoveBots: () => void;
  onStartGame: () => void;
  isLoading: boolean;
  errorMessage: string | null;
  onOpenAudio?: () => void;
}

export const LobbyView: React.FC<Props> = ({
  world,
  localPlayerId,
  onCreateRoom,
  onJoinRoom,
  onChangeClass,
  onAddBot,
  onRemoveBots,
  onStartGame,
  isLoading,
  errorMessage,
  onOpenAudio,
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
    sfx.playUiClick();
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
    role: string;
  }> = [
    {
      id: 'GUERRERO',
      name: 'Caballero Descafeinado',
      icon: '🛡️',
      role: 'Tanque / Reflejo Sísmico',
      description: 'Espadazo que destruye proyectiles. Habilidad: Onda Sísmica que aturde y refleja balas.',
    },
    {
      id: 'CAZADOR',
      name: 'Cazador Desesperado',
      icon: '🏹',
      role: 'Tirador / Trampas',
      description: 'Virotes rápidos con rebote. Habilidad: Salva de 5 flechas perforantes + Trampa explosiva.',
    },
    {
      id: 'MAGO',
      name: 'Mago Piromaniaco',
      icon: '🔮',
      role: 'Explosión Ígnea / Control',
      description: 'Orbes de fuego que explotan en área y queman. Habilidad: Agujero Negro gravitatorio.',
    },
    {
      id: 'PICARO',
      name: 'Asesino de las Sombras',
      icon: '🗡️',
      role: 'Velocidad / Crítico Venenoso',
      description: 'Dagas dobles envenenadas y ultra veloz. Habilidad: Clon explosivo e invisibilidad crítica.',
    },
  ];

  const handleSelectClass = (clsId: PlayerClass) => {
    setSelectedClass(clsId);
    sfx.playWeaponAttack(clsId);
    if (isInsideRoom) {
      onChangeClass(clsId);
    }
  };

  const playerCount = world ? Object.keys(world.players).length : 0;
  const hasBots = world ? Object.values(world.players).some(p => p.isBot) : false;

  return (
    <div className="fixed inset-0 bg-[#0c0a09] flex items-center justify-center p-4 z-40 overflow-y-auto">
      <div className="relative max-w-2xl w-full bg-[#141210] border-2 border-[#44403c] rounded-xl p-6 shadow-2xl flex flex-col items-center">
        {/* Stone corner rivets */}
        <div className="absolute top-2 left-2 w-2 h-2 rounded-full bg-[#78716c]"></div>
        <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-[#78716c]"></div>
        <div className="absolute bottom-2 left-2 w-2 h-2 rounded-full bg-[#78716c]"></div>
        <div className="absolute bottom-2 right-2 w-2 h-2 rounded-full bg-[#78716c]"></div>

        {/* Audio Settings Trigger */}
        {onOpenAudio && (
          <button
            onClick={onOpenAudio}
            className="absolute top-4 right-4 p-2 rounded bg-[#1c1917] hover:bg-[#292524] border border-[#44403c] text-[#a8a29e] hover:text-[#f5f5f4] transition"
            title="Ajustes de Sonido y Música (M)"
          >
            <Volume2 size={16} />
          </button>
        )}

        {/* Title & Crest */}
        <div className="flex items-center gap-2 mb-1">
          <span className="text-2xl">🏰</span>
          <span className="text-[10px] uppercase font-cinzel font-bold tracking-widest text-[#d97706] bg-[#1c1917] border border-[#78350f] px-2.5 py-0.5 rounded">
            DIRECTOR IA EN VIVO • SINERGIAS ELEMENTALES • CO-OP
          </span>
        </div>
        <h1 className="text-2xl md:text-3xl font-black font-cinzel tracking-wider text-[#f5f5f4] uppercase text-center">
          CALABOZO MUTANTE
        </h1>
        <p className="text-xs text-[#a8a29e] font-serif italic mt-0.5 mb-4 text-center">
          Roguelite cooperativo donde el Director IA muta las físicas, negocia pactos malditos y desata intervenciones en tiempo real.
        </p>

        {errorMessage && (
          <div className="mb-4 w-full bg-[#450a0a] border border-[#991b1b] text-[#fca5a5] text-xs font-cinzel p-2.5 rounded text-center">
            ⚠️ {errorMessage}
          </div>
        )}

        {!isInsideRoom ? (
          /* ================= STEP 1: CREATE OR JOIN ================= */
          <div className="w-full flex flex-col gap-3.5">
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

            {/* 4 Class Selection Grid */}
            <div>
              <label className="block text-[11px] font-cinzel font-bold text-[#d6d3d1] uppercase mb-1.5">
                Elige tu Clase y Habilidad Especial
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {CLASSES.map(cls => {
                  const isSelected = selectedClass === cls.id;
                  const stats = CLASS_CONFIGS[cls.id];
                  return (
                    <button
                      key={cls.id}
                      onClick={() => handleSelectClass(cls.id)}
                      className={`text-left p-2.5 rounded border transition-all ${
                        isSelected
                          ? 'bg-[#1c1917] border-[#d97706] shadow-md shadow-black'
                          : 'bg-[#0c0a09] border-[#292524] hover:border-[#44403c]'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-lg">{cls.icon}</span>
                          <span className="font-bold text-xs font-cinzel text-[#f5f5f4]">
                            {cls.name}
                          </span>
                        </div>
                        <span className="text-[9px] font-cinzel text-[#d97706] bg-[#141210] px-1.5 py-0.5 rounded border border-[#292524]">
                          {cls.role}
                        </span>
                      </div>
                      <div className="text-[10px] text-[#a8a29e] font-serif leading-tight mb-2">
                        {cls.description}
                      </div>
                      <div className="text-[9px] font-cinzel text-[#78716c] border-t border-[#292524] pt-1 flex justify-between">
                        <span>❤️ {stats.maxHp} HP</span>
                        <span>⚔️ {stats.attackDamage} Daño</span>
                        <span className="text-amber-400">✨ {stats.skillName}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Tabs: Create vs Join */}
            <div className="flex border-b border-[#292524] mt-1">
              <button
                onClick={() => { sfx.playUiClick(); setActiveTab('CREATE'); }}
                className={`flex-1 py-2 text-xs font-cinzel font-bold border-b-2 transition ${
                  activeTab === 'CREATE'
                    ? 'border-[#d97706] text-[#d97706]'
                    : 'border-transparent text-[#78716c] hover:text-[#d6d3d1]'
                }`}
              >
                FORJAR MAZMORRA
              </button>
              <button
                onClick={() => { sfx.playUiClick(); setActiveTab('JOIN'); }}
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
          <div className="w-full flex flex-col gap-3">
            {/* Room Code Badge */}
            <div className="bg-[#0c0a09] border border-[#44403c] rounded-lg p-3 flex items-center justify-between">
              <div>
                <span className="text-[9px] font-cinzel text-[#a8a29e] uppercase tracking-wider block">
                  CÓDIGO DEL CALABOZO (COMPARTE CON AMIGOS)
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

            {/* Quick Class Switcher inside Lobby */}
            <div>
              <span className="text-[10px] font-cinzel text-[#a8a29e] uppercase block mb-1">
                CAMBIAR TU CLASE EN VIVO:
              </span>
              <div className="grid grid-cols-4 gap-1.5">
                {CLASSES.map(cls => {
                  const isMine = localPlayer?.classType === cls.id;
                  return (
                    <button
                      key={cls.id}
                      onClick={() => handleSelectClass(cls.id)}
                      className={`py-1.5 px-2 rounded border text-[10px] font-cinzel font-bold flex items-center justify-center gap-1 transition ${
                        isMine
                          ? 'bg-[#78350f] border-[#f59e0b] text-[#fef3c7]'
                          : 'bg-[#0c0a09] border-[#292524] text-[#a8a29e] hover:border-[#57534e]'
                      }`}
                    >
                      <span>{cls.icon}</span>
                      <span className="truncate">{cls.id}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Squad Members + AI Bot Companions */}
            <div>
              <div className="text-[11px] font-cinzel text-[#a8a29e] mb-1.5 flex items-center justify-between">
                <span className="flex items-center gap-1">
                  <Users size={13} /> ESCUADRA ({playerCount} / 4):
                </span>
                {isHost && (
                  <div className="flex items-center gap-1.5">
                    {playerCount < 4 && (
                      <button
                        onClick={() => {
                          sfx.playHeal();
                          onAddBot();
                        }}
                        className="flex items-center gap-1 px-2 py-0.5 bg-[#1e1b4b] hover:bg-[#312e81] text-indigo-200 border border-indigo-500/60 rounded text-[10px] font-cinzel font-bold transition"
                      >
                        <Bot size={12} /> + GUARDIÁN IA
                      </button>
                    )}
                    {hasBots && (
                      <button
                        onClick={() => onRemoveBots()}
                        className="flex items-center gap-1 px-2 py-0.5 bg-[#450a0a] hover:bg-[#7f1d1d] text-rose-200 border border-rose-700/60 rounded text-[10px] font-cinzel transition"
                        title="Quitar compañeros IA"
                      >
                        <Trash2 size={11} />
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {Object.values(world.players).map(p => (
                  <div
                    key={p.id}
                    className="flex items-center gap-2.5 bg-[#0c0a09] border border-[#292524] p-2 rounded"
                  >
                    <span className="text-lg">
                      {p.classType === 'GUERRERO'
                        ? '🛡️'
                        : p.classType === 'CAZADOR'
                        ? '🏹'
                        : p.classType === 'PICARO'
                        ? '🗡️'
                        : '🔮'}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-cinzel font-bold text-[#f5f5f4] truncate flex items-center gap-1">
                        {p.name} {p.isHost && '👑'}
                      </div>
                      <div className="text-[10px] text-[#78716c] font-cinzel">
                        {p.classType} • {p.id === localPlayerId ? 'Tú' : p.isBot ? 'Compañero IA' : 'Aliado'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Controls & New Mechanics Guide */}
            <div className="bg-[#0c0a09] border border-[#292524] rounded-lg p-2.5 text-[11px] font-cinzel text-[#a8a29e] leading-relaxed">
              <span className="text-[#d97706] font-bold flex items-center gap-1 mb-0.5">
                <Sparkles size={12} /> CONTROLES & MECÁNICAS AVANZADAS:
              </span>
              <div>• <strong>WASD</strong>: Moverse • <strong>CLIC IZQ</strong>: Ataque Básico • <strong>ESPACIO / SHIFT</strong>: Dash Invulnerable</div>
              <div>• <strong>CLIC DERECHO o [E]</strong>: Habilidad Especial de Clase (Reflejo, Trampa, Agujero Negro, Clon)</div>
              <div>• <strong>TECLA [G]</strong>: Ping Táctico Cooperativo • <strong>SINERGIAS</strong>: Combina Fuego, Hielo, Veneno y Rayo</div>
              <div>• <strong>CO-OP</strong>: Párate en el círculo de un aliado caído para revivirlo • Usa el <strong>Altar del Pacto</strong> al limpiar la sala</div>
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
