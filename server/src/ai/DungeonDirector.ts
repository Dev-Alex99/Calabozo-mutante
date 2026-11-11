import { config } from '../config.js';
import { RoomMutation, Relic, DirectorDialogue } from '../types.js';
import { callMiniMax } from './minimax.js';
import { MOCK_MUTATIONS, MOCK_RELICS, MOCK_DIRECTOR_QUOTES } from './mockDirector.js';

interface PrefetchedRoomData {
  mutation: RoomMutation;
  relics: Relic[];
}

export class DungeonDirector {
  private prefetchCache = new Map<number, Promise<PrefetchedRoomData>>();

  /**
   * Generates or retrieves from background cache the room mutation and chest relics.
   */
  public async getRoomData(roomIndex: number, totalRooms: number): Promise<PrefetchedRoomData> {
    const isBoss = roomIndex >= totalRooms;

    if (this.prefetchCache.has(roomIndex)) {
      try {
        const cached = await this.prefetchCache.get(roomIndex)!;
        this.prefetchCache.delete(roomIndex);
        return cached;
      } catch (err) {
        console.warn(`[Director] Cache failed for room ${roomIndex}, generating fresh fallback:`, err);
      }
    }

    return this.generateFreshRoomData(roomIndex, isBoss);
  }

  /**
   * Pre-fetches the next room in background so player door transitions are 0 ms.
   */
  public prefetchNextRoom(roomIndex: number, totalRooms: number): void {
    if (roomIndex > totalRooms) return;
    if (this.prefetchCache.has(roomIndex)) return;

    const isBoss = roomIndex >= totalRooms;
    const promise = this.generateFreshRoomData(roomIndex, isBoss);
    this.prefetchCache.set(roomIndex, promise);
  }

  private async generateFreshRoomData(roomIndex: number, isBoss: boolean): Promise<PrefetchedRoomData> {
    if (!config.minimax.apiKey) {
      const mockMutation = MOCK_MUTATIONS[(roomIndex - 1) % MOCK_MUTATIONS.length];
      const mockRelics = this.pickRandomRelics(3);
      return { mutation: mockMutation, relics: mockRelics };
    }

    try {
      console.log(`[Director MiniMax Fast] Generating Room ${roomIndex} (Boss: ${isBoss})...`);
      const systemPrompt = `Eres "El Director Supremo del Calabozo", una IA sarcástica y tramposa que controla un calabozo mutante en un videojuego de acción 2D roguelite.
Tu trabajo es inventar las MUTACIONES FÍSICAS de la sala y 3 RELIQUIAS que recompensarán a los supervivientes.
Debes responder ÚNICAMENTE con un JSON válido (sin backticks ni markdown).

Formato JSON obligatorio:
{
  "mutation": {
    "title": "Nombre cómico de la sala",
    "description": "Descripción breve de la trampa física",
    "directorRoast": "Frase sarcástica de bienvenida a la sala (1 oración mordaz)",
    "frictionMultiplier": 0.2, // Entre 0.15 (hielo ultra resbaladizo) y 1.0 (normal)
    "bulletBouncesBonus": 2, // Rebotes extra en paredes (0 a 3)
    "enemySpeedMultiplier": 1.2, // Multiplicador de velocidad de monstruos (0.8 a 1.5)
    "playerDamageMultiplier": 1.1,
    "lowVisibility": false, // true si hay niebla oscura
    "visibilityRadius": 300,
    "hazardType": "NONE" // "NONE" | "LAVA_PITS" | "POISON_SPORES"
  },
  "relics": [
    {
      "id": "rel_${Date.now()}_1",
      "name": "Nombre cómico del objeto",
      "lore": "Historia absurda de 1 línea",
      "icon": "⚡", // Emoji representativo
      "buffDescription": "+30% daño de ataque",
      "curseDescription": "Opcional: pequeña maldición cómica",
      "modifiers": {
        "damageMultiplier": 1.3,
        "moveSpeedMultiplier": 1.0,
        "maxHpBonus": 0,
        "attackCooldownMultiplier": 1.0,
        "bulletBouncesBonus": 0,
        "bulletCountBonus": 0
      }
    }
  ]
}`;

      const userPrompt = `Genera la sala ${roomIndex} de 6.${isBoss ? ' ¡ATENCIÓN: ES LA SALA DEL JEFE FINAL!' : ' Sala de combate intermedio.'}`;

      const rawJson = await callMiniMax([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ], 0.7, 750);

      const parsed = JSON.parse(rawJson);

      const mutation: RoomMutation = {
        title: parsed.mutation?.title || `Sala Mutante ${roomIndex}`,
        description: parsed.mutation?.description || 'Peligro ambiental no clasificado.',
        directorRoast: parsed.mutation?.directorRoast || 'Disfruten sus últimos segundos con vida.',
        frictionMultiplier: typeof parsed.mutation?.frictionMultiplier === 'number' 
          ? Math.max(0.15, Math.min(1.2, parsed.mutation.frictionMultiplier)) 
          : 1.0,
        bulletBouncesBonus: typeof parsed.mutation?.bulletBouncesBonus === 'number'
          ? Math.min(3, Math.max(0, parsed.mutation.bulletBouncesBonus))
          : 1,
        enemySpeedMultiplier: typeof parsed.mutation?.enemySpeedMultiplier === 'number'
          ? Math.max(0.8, Math.min(1.6, parsed.mutation.enemySpeedMultiplier))
          : 1.1,
        playerDamageMultiplier: typeof parsed.mutation?.playerDamageMultiplier === 'number'
          ? parsed.mutation.playerDamageMultiplier
          : 1.0,
        lowVisibility: !!parsed.mutation?.lowVisibility,
        visibilityRadius: parsed.mutation?.visibilityRadius || 300,
        hazardType: parsed.mutation?.hazardType || 'NONE',
      };

      const relics: Relic[] = Array.isArray(parsed.relics) && parsed.relics.length >= 1
        ? parsed.relics.slice(0, 3).map((r: any, idx: number) => ({
            id: r.id || `relic_dyn_${roomIndex}_${idx}_${Date.now()}`,
            name: r.name || 'Amuleto Misterioso',
            lore: r.lore || 'Nadie recuerda quién lo fabricó.',
            icon: r.icon || '🎁',
            buffDescription: r.buffDescription || '+20% daño',
            curseDescription: r.curseDescription,
            modifiers: r.modifiers || { damageMultiplier: 1.2 },
          }))
        : this.pickRandomRelics(3);

      return { mutation, relics };
    } catch (err) {
      console.warn('[Director] MiniMax generation fallback to mock:', err);
      const mockMutation = MOCK_MUTATIONS[(roomIndex - 1) % MOCK_MUTATIONS.length];
      const mockRelics = this.pickRandomRelics(3);
      return { mutation: mockMutation, relics: mockRelics };
    }
  }

  public async getBossAdaptation(telemetry: {
    totalDamageDealt: number;
    rangedAttacksCount: number;
    meleeAttacksCount: number;
    totalPlayerDeaths: number;
  }): Promise<{ bossName: string; introQuote: string; phase2Roast: string }> {
    const isMeleeHeavy = telemetry.meleeAttacksCount > telemetry.rangedAttacksCount;

    if (!config.minimax.apiKey) {
      return {
        bossName: isMeleeHeavy ? 'Gólem Reflectante de Muros de Acero' : 'El Coloso con Rayo Burocrático',
        introQuote: isMeleeHeavy 
          ? '¿Les gusta acercarse tanto? Espero que disfruten abrazar cuchillas giratorias.'
          : 'Cobardes a distancia... mis proyectiles rastreadores tienen sus nombres grabados.',
        phase2Roast: '¡Fase 2 activada! Se acabó el periodo de prueba gratuita.',
      };
    }

    try {
      const prompt = `Los jugadores han llegado al JEFE FINAL de Calabozo Mutante.
Telemetría de combate del equipo:
- Ataques a distancia: ${telemetry.rangedAttacksCount}
- Ataques cuerpo a cuerpo: ${telemetry.meleeAttacksCount}
- Muertes de jugadores acumuladas: ${telemetry.totalPlayerDeaths}

Devuelve un JSON con:
{
  "bossName": "Nombre cómico imponente para el jefe",
  "introQuote": "Discurso de entrada de 1 a 2 oraciones burlándose de su estilo de juego",
  "phase2Roast": "Grito de furia cuando el jefe llega al 50% de HP"
}`;

      const res = await callMiniMax([
        { role: 'system', content: 'Eres el Director del Calabozo diseñando el jefe final. Responde solo con JSON.' },
        { role: 'user', content: prompt }
      ], 0.7, 400);

      const data = JSON.parse(res);
      return {
        bossName: data.bossName || 'El Algoritmo Supremo Castigador',
        introQuote: data.introQuote || 'Es hora de auditar sus mediocres vidas.',
        phase2Roast: data.phase2Roast || '¡Fase 2! ¡Aumentando el voltaje!',
      };
    } catch {
      return {
        bossName: 'El Gran Auditor del Abismo',
        introQuote: 'Sus contratos de vida están a punto de ser cancelados sin indemnización.',
        phase2Roast: '¡Sistemas al 100%! ¡Abran fuego en todos los sectores!',
      };
    }
  }

  public getDirectorQuote(type: 'roomClear' | 'playerDown' | 'bossIntro'): DirectorDialogue {
    const list = MOCK_DIRECTOR_QUOTES[type];
    const text = list[Math.floor(Math.random() * list.length)];
    return {
      speaker: 'Director del Calabozo',
      text,
      mood: type === 'playerDown' ? 'MOCKING' : type === 'roomClear' ? 'IMPRESSED' : 'ANGRY',
      timestamp: Date.now(),
    };
  }

  private pickRandomRelics(count: number): Relic[] {
    const shuffled = [...MOCK_RELICS].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, count);
  }
}
