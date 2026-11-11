import { config } from '../config.js';
import { RoomMutation, Relic, DirectorDialogue, DirectorPact, PlayerEntity } from '../types.js';
import { callMiniMax } from './minimax.js';
import { MOCK_MUTATIONS, MOCK_RELICS, MOCK_DIRECTOR_QUOTES, MOCK_PACTS } from './mockDirector.js';

interface PrefetchedRoomData {
  mutation: RoomMutation;
  relics: Relic[];
  pact: DirectorPact;
}

export class DungeonDirector {
  private prefetchCache = new Map<number, Promise<PrefetchedRoomData>>();
  private resolvedCache = new Map<number, PrefetchedRoomData>();

  private getInstantFallback(roomIndex: number): PrefetchedRoomData {
    const fallbackPact = {
      ...MOCK_PACTS[(roomIndex - 1) % MOCK_PACTS.length],
      id: `pact_${roomIndex}_${Date.now()}`,
      used: false,
    };
    const mockMutation = MOCK_MUTATIONS[(roomIndex - 1) % MOCK_MUTATIONS.length];
    const mockRelics = this.pickRandomRelics(3);
    return { mutation: mockMutation, relics: mockRelics, pact: fallbackPact };
  }

  /**
   * Generates or retrieves from background cache the room mutation, chest relics, and AI pact.
   * Never blocks gameplay for more than 180ms if MiniMax is still generating in the background.
   */
  public async getRoomData(roomIndex: number, totalRooms: number): Promise<PrefetchedRoomData> {
    if (this.resolvedCache.has(roomIndex)) {
      const ready = this.resolvedCache.get(roomIndex)!;
      this.resolvedCache.delete(roomIndex);
      this.prefetchCache.delete(roomIndex);
      return ready;
    }

    const isBoss = roomIndex >= totalRooms;
    let pending = this.prefetchCache.get(roomIndex);
    if (!pending) {
      pending = this.generateFreshRoomData(roomIndex, isBoss);
      this.prefetchCache.set(roomIndex, pending);
    }

    const timeoutPromise = new Promise<null>(resolve => setTimeout(() => resolve(null), 180));
    try {
      const result = await Promise.race([pending, timeoutPromise]);
      if (result) {
        this.prefetchCache.delete(roomIndex);
        this.resolvedCache.delete(roomIndex);
        return result;
      }
    } catch (err) {
      console.warn(`[Director] Cache failed for room ${roomIndex}, using instant fallback:`, err);
    }

    return this.getInstantFallback(roomIndex);
  }

  /**
   * Pre-fetches the next room in background so player door transitions are 0 ms.
   */
  public prefetchNextRoom(roomIndex: number, totalRooms: number): void {
    if (roomIndex > totalRooms + 10) return;
    if (this.prefetchCache.has(roomIndex) || this.resolvedCache.has(roomIndex)) return;

    const isBoss = roomIndex === totalRooms || (roomIndex > totalRooms && roomIndex % 3 === 0);
    const promise = this.generateFreshRoomData(roomIndex, isBoss).then(data => {
      this.resolvedCache.set(roomIndex, data);
      return data;
    });
    this.prefetchCache.set(roomIndex, promise);
  }

  private async generateFreshRoomData(roomIndex: number, isBoss: boolean): Promise<PrefetchedRoomData> {
    const fallbackPact = {
      ...MOCK_PACTS[(roomIndex - 1) % MOCK_PACTS.length],
      id: `pact_${roomIndex}_${Date.now()}`,
      used: false,
    };

    if (!config.minimax.apiKey) {
      const mockMutation = MOCK_MUTATIONS[(roomIndex - 1) % MOCK_MUTATIONS.length];
      const mockRelics = this.pickRandomRelics(3);
      return { mutation: mockMutation, relics: mockRelics, pact: fallbackPact };
    }

    try {
      console.log(`[Director MiniMax Fast] Generating Room ${roomIndex} (Boss: ${isBoss})...`);
      const systemPrompt = `Eres "El Director Supremo del Calabozo", una IA sarcástica y brillante que controla un calabozo mutante en un videojuego roguelite cooperativo.
Tu trabajo es inventar las MUTACIONES FÍSICAS de la sala, 3 RELIQUIAS con sinergias elementales y 1 PACTO TENTADOR para el Altar del Abismo.
Debes responder ÚNICAMENTE con un JSON válido (sin backticks ni markdown).

Formato JSON obligatorio:
{
  "mutation": {
    "title": "Nombre cómico e imponente de la cámara",
    "description": "Descripción breve de la anomalía física y trampas",
    "directorRoast": "Frase sarcástica de bienvenida a la sala (1 oración mordaz)",
    "frictionMultiplier": 0.25,
    "bulletBouncesBonus": 2,
    "enemySpeedMultiplier": 1.15,
    "playerDamageMultiplier": 1.1,
    "lowVisibility": false,
    "visibilityRadius": 320,
    "hazardType": "SPIKE_TRAPS" // "NONE" | "LAVA_PITS" | "POISON_SPORES" | "SPIKE_TRAPS" | "GRAVITY_WELL"
  },
  "pact": {
    "title": "Nombre del Pacto Oscuro",
    "description": "Oferta tentadora del Director",
    "costText": "Sacrificas 25% HP actual",
    "rewardText": "+35% Daño y Rayos en Cadena",
    "type": "BLOOD_FOR_POWER" // "BLOOD_FOR_POWER" | "ELITE_AMBUSH" | "CURSED_ROULETTE" | "VAMPIRIC_HUNGER"
  },
  "relics": [
    {
      "id": "rel_${Date.now()}_1",
      "name": "Nombre cómico del artefacto",
      "lore": "Historia absurda de 1 línea",
      "icon": "⚡",
      "rarity": "LEGENDARY", // "COMMON" | "RARE" | "LEGENDARY" | "CURSED"
      "buffDescription": "+30% daño y Rayos en Cadena",
      "curseDescription": "Opcional: pequeña maldición cómica",
      "modifiers": {
        "damageMultiplier": 1.25,
        "moveSpeedMultiplier": 1.0,
        "maxHpBonus": 0,
        "attackCooldownMultiplier": 0.9,
        "bulletBouncesBonus": 1,
        "bulletCountBonus": 0,
        "critChanceBonus": 0.15,
        "chainLightning": true,
        "burnOnHit": false,
        "freezeOnHit": false,
        "poisonOnHit": false
      }
    }
  ]
}`;

      const userPrompt = `Genera la cámara ${roomIndex}.${isBoss ? ' ¡ATENCIÓN: ES UNA CÁMARA DE JEFE SUPREMO!' : ' Cámara de asalto con trampas y sinergias.'}`;

      const rawJson = await callMiniMax([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ], 0.7, 850);

      const parsed = JSON.parse(rawJson);

      const validHazards = ['NONE', 'LAVA_PITS', 'POISON_SPORES', 'SPIKE_TRAPS', 'GRAVITY_WELL'];
      const hazardType = validHazards.includes(parsed.mutation?.hazardType)
        ? parsed.mutation.hazardType
        : MOCK_MUTATIONS[(roomIndex - 1) % MOCK_MUTATIONS.length].hazardType;

      const mutation: RoomMutation = {
        title: parsed.mutation?.title || `Cámara Mutante ${roomIndex}`,
        description: parsed.mutation?.description || 'Anomalía física detectada por el Tribunal.',
        directorRoast: parsed.mutation?.directorRoast || 'Disfruten sus últimos segundos con seguro médico.',
        frictionMultiplier: typeof parsed.mutation?.frictionMultiplier === 'number'
          ? Math.max(0.15, Math.min(1.2, parsed.mutation.frictionMultiplier))
          : 1.0,
        bulletBouncesBonus: typeof parsed.mutation?.bulletBouncesBonus === 'number'
          ? Math.min(3, Math.max(0, parsed.mutation.bulletBouncesBonus))
          : 1,
        enemySpeedMultiplier: typeof parsed.mutation?.enemySpeedMultiplier === 'number'
          ? Math.max(0.85, Math.min(1.5, parsed.mutation.enemySpeedMultiplier))
          : 1.1,
        playerDamageMultiplier: typeof parsed.mutation?.playerDamageMultiplier === 'number'
          ? parsed.mutation.playerDamageMultiplier
          : 1.0,
        lowVisibility: !!parsed.mutation?.lowVisibility,
        visibilityRadius: parsed.mutation?.visibilityRadius || 300,
        hazardType,
      };

      const relics: Relic[] = Array.isArray(parsed.relics) && parsed.relics.length >= 1
        ? parsed.relics.slice(0, 3).map((r: any, idx: number) => ({
            id: r.id || `relic_dyn_${roomIndex}_${idx}_${Date.now()}`,
            name: r.name || 'Amuleto del Caos',
            lore: r.lore || 'Forjado por un becario del averno.',
            icon: r.icon || '🎁',
            rarity: r.rarity || 'RARE',
            buffDescription: r.buffDescription || '+25% daño arcano',
            curseDescription: r.curseDescription,
            modifiers: r.modifiers || { damageMultiplier: 1.25 },
          }))
        : this.pickRandomRelics(3);

      const pact: DirectorPact = parsed.pact?.title
        ? {
            id: `pact_ai_${roomIndex}_${Date.now()}`,
            title: parsed.pact.title,
            description: parsed.pact.description || fallbackPact.description,
            costText: parsed.pact.costText || fallbackPact.costText,
            rewardText: parsed.pact.rewardText || fallbackPact.rewardText,
            type: ['BLOOD_FOR_POWER', 'ELITE_AMBUSH', 'CURSED_ROULETTE', 'VAMPIRIC_HUNGER'].includes(parsed.pact.type)
              ? parsed.pact.type
              : fallbackPact.type,
            used: false,
          }
        : fallbackPact;

      return { mutation, relics, pact };
    } catch (err) {
      console.warn('[Director] MiniMax generation fallback to mock:', err);
      const mockMutation = MOCK_MUTATIONS[(roomIndex - 1) % MOCK_MUTATIONS.length];
      const mockRelics = this.pickRandomRelics(3);
      return { mutation: mockMutation, relics: mockRelics, pact: fallbackPact };
    }
  }

  public async getBossAdaptation(telemetry: {
    totalDamageDealt: number;
    rangedAttacksCount: number;
    meleeAttacksCount: number;
    skillsUsedCount: number;
    synergiesCount: number;
    totalPlayerDeaths: number;
  }): Promise<{ bossName: string; introQuote: string; phase2Roast: string }> {
    const isMeleeHeavy = telemetry.meleeAttacksCount > telemetry.rangedAttacksCount;

    const fallbackBoss = {
      bossName: isMeleeHeavy ? 'El Juez Acorazado de Cuchillas' : 'El Gran Arquitecto del Abismo',
      introQuote: isMeleeHeavy
        ? '¿Les gusta golpear de cerca? He calibrado mis ondas de choque y meteoros para triturar huesos.'
        : `¿${telemetry.rangedAttacksCount} disparos a distancia y ${telemetry.synergiesCount} sinergias? Veamos cómo esquivan mi protocolo de aniquilación total.`,
      phase2Roast: '¡FASE 2 ACTIVADA! ¡SE ACABÓ EL PERIODO DE PRUEBA GRATUITA!',
    };

    if (!config.minimax.apiKey) {
      return fallbackBoss;
    }

    try {
      const prompt = `Los jugadores han llegado al JEFE FINAL de Calabozo Mutante.
Telemetría del equipo:
- Ataques a distancia: ${telemetry.rangedAttacksCount}
- Ataques cuerpo a cuerpo: ${telemetry.meleeAttacksCount}
- Habilidades especiales usadas: ${telemetry.skillsUsedCount}
- Sinergias elementales: ${telemetry.synergiesCount}
- Muertes acumuladas: ${telemetry.totalPlayerDeaths}

Devuelve un JSON con:
{
  "bossName": "Nombre cómico e imponente para el jefe",
  "introQuote": "Discurso de entrada de 1 a 2 oraciones burlándose de sus estadísticas",
  "phase2Roast": "Grito de furia cuando el jefe llega al 50% de HP"
}`;

      const timeoutPromise = new Promise<null>(resolve => setTimeout(() => resolve(null), 250));
      const res = await Promise.race([
        callMiniMax([
          { role: 'system', content: 'Eres el Director del Calabozo diseñando el jefe final. Responde solo con JSON.' },
          { role: 'user', content: prompt },
        ], 0.7, 400),
        timeoutPromise,
      ]);

      if (!res) return fallbackBoss;
      const data = JSON.parse(res);
      return {
        bossName: data.bossName || fallbackBoss.bossName,
        introQuote: data.introQuote || fallbackBoss.introQuote,
        phase2Roast: data.phase2Roast || fallbackBoss.phase2Roast,
      };
    } catch {
      return fallbackBoss;
    }
  }

  public getDirectorQuote(type: 'roomClear' | 'playerDown' | 'bossIntro' | 'intervention'): DirectorDialogue {
    const list = MOCK_DIRECTOR_QUOTES[type] || MOCK_DIRECTOR_QUOTES.roomClear;
    const text = list[Math.floor(Math.random() * list.length)];
    return {
      speaker: 'Director del Calabozo',
      text,
      mood:
        type === 'playerDown'
          ? 'MOCKING'
          : type === 'roomClear'
          ? 'IMPRESSED'
          : type === 'intervention'
          ? 'CHAOTIC'
          : 'ANGRY',
      timestamp: Date.now(),
    };
  }

  /**
   * Computes dynamic psychological titles for each player based on their combat telemetry.
   */
  public assignPlayerTitles(players: Record<string, PlayerEntity>): void {
    const list = Object.values(players);
    for (const p of list) {
      if (p.revivesCount >= 2) {
        p.title = 'Ángel Guardián del Gremio';
      } else if (p.synergiesTriggered >= 4) {
        p.title = 'Alquimista del Caos Elemental';
      } else if (p.maxCombo >= 25) {
        p.title = 'Torbellino Intocable';
      } else if (p.gold >= 150) {
        p.title = 'Magnate del Botín Maldito';
      } else if (p.kills >= 12) {
        p.title = 'Verdugo Implacable';
      } else if (p.damageDealt >= 1200) {
        p.title = 'Demolición Industrial';
      } else {
        p.title = p.classType === 'PICARO' ? 'Sombra Letal' : 'Superviviente del Abismo';
      }
    }
  }

  public pickRandomRelics(count: number): Relic[] {
    const shuffled = [...MOCK_RELICS].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, count).map((r, i) => ({
      ...r,
      id: `${r.id}_${Date.now()}_${i}`,
    }));
  }
}
