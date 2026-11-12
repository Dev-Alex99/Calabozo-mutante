/**
 * CALABOZO MUTANTE — ADAPTIVE PROCEDURAL SOUNDTRACK ENGINE
 * Pure Web Audio API synthesized dynamic dark-fantasy soundtrack.
 * Zero external asset dependencies, zero network latency, seamless transitions.
 */

export type SoundtrackTheme = 'LOBBY' | 'DUNGEON' | 'BOSS' | 'SANCTUARY' | 'VICTORY' | 'GAMEOVER' | 'OFF';

export class SoundtrackEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private currentTheme: SoundtrackTheme = 'OFF';
  private targetTheme: SoundtrackTheme = 'OFF';

  // Volume settings (0.0 - 1.0)
  private musicVolume = 0.55;
  private isMuted = false;

  // Clock scheduling
  private isRunning = false;
  private schedulerTimer: any = null;
  private nextNoteTime = 0;
  private currentStep = 0;

  // Theme-specific state
  private bpm = 116;
  private themeFadeGain: GainNode | null = null;
  private reverbNode: ConvolverNode | null = null;

  // Dynamic combat intensity (0.0 to 1.0, increases with enemies alive and director anger)
  private intensity = 0;

  constructor() {
    // Lazy init on first user gesture
  }

  public init(ctx: AudioContext, masterOutput: AudioNode): void {
    if (this.ctx) return;
    this.ctx = ctx;

    // Music sub-bus
    this.musicGain = ctx.createGain();
    this.musicGain.gain.setValueAtTime(this.isMuted ? 0 : this.musicVolume, ctx.currentTime);

    this.themeFadeGain = ctx.createGain();
    this.themeFadeGain.gain.setValueAtTime(1, ctx.currentTime);

    // Create algorithmic cavern reverb for soundtrack depth
    this.reverbNode = this.createCavernReverb(ctx);

    // Connect: themeFadeGain -> musicGain -> masterOutput
    // Also send a portion to reverb
    this.themeFadeGain.connect(this.musicGain);
    if (this.reverbNode) {
      const revSend = ctx.createGain();
      revSend.gain.setValueAtTime(0.22, ctx.currentTime);
      this.themeFadeGain.connect(revSend);
      revSend.connect(this.reverbNode);
      this.reverbNode.connect(this.musicGain);
    }

    this.musicGain.connect(masterOutput);

    // Start scheduling loop
    this.startScheduler();
  }

  public setVolume(vol: number): void {
    this.musicVolume = Math.max(0, Math.min(1, vol));
    if (this.musicGain && this.ctx) {
      const target = this.isMuted ? 0 : this.musicVolume;
      this.musicGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.05);
    }
  }

  public setMuted(muted: boolean): void {
    this.isMuted = muted;
    if (this.musicGain && this.ctx) {
      const target = this.isMuted ? 0 : this.musicVolume;
      this.musicGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.05);
    }
  }

  public setIntensity(intensity: number): void {
    this.intensity = Math.max(0, Math.min(1, intensity));
  }

  /**
   * Audio Ducking / Sidechain Compression
   * Smoothly dips the soundtrack volume upon major explosions, boss roars, or interventions.
   */
  public duck(dipRatio = 0.45, durationMs = 450): void {
    if (!this.musicGain || !this.ctx || this.isMuted) return;
    const now = this.ctx.currentTime;
    const current = this.musicVolume;
    const dipped = current * dipRatio;

    this.musicGain.gain.cancelScheduledValues(now);
    this.musicGain.gain.setValueAtTime(this.musicGain.gain.value, now);
    this.musicGain.gain.linearRampToValueAtTime(dipped, now + 0.04);
    this.musicGain.gain.setTargetAtTime(current, now + 0.04 + durationMs / 1000, 0.18);
  }

  public setTheme(theme: SoundtrackTheme): void {
    if (this.currentTheme === theme) return;
    this.targetTheme = theme;

    if (!this.ctx || !this.themeFadeGain) {
      this.currentTheme = theme;
      return;
    }

    const now = this.ctx.currentTime;
    // Crossfade: smoothly dip previous theme, switch BPM & scale, ramp back up
    this.themeFadeGain.gain.cancelScheduledValues(now);
    this.themeFadeGain.gain.setValueAtTime(this.themeFadeGain.gain.value, now);
    this.themeFadeGain.gain.linearRampToValueAtTime(0.01, now + 0.65);

    setTimeout(() => {
      this.currentTheme = this.targetTheme;
      this.currentStep = 0;
      switch (this.currentTheme) {
        case 'LOBBY':
          this.bpm = 78;
          break;
        case 'SANCTUARY':
          this.bpm = 68;
          break;
        case 'BOSS':
          this.bpm = 138;
          break;
        case 'VICTORY':
          this.bpm = 124;
          break;
        case 'GAMEOVER':
          this.bpm = 60;
          break;
        case 'DUNGEON':
        default:
          this.bpm = 114;
          break;
      }
      if (this.ctx && this.themeFadeGain) {
        const rampNow = this.ctx.currentTime;
        this.nextNoteTime = rampNow + 0.1;
        this.themeFadeGain.gain.cancelScheduledValues(rampNow);
        this.themeFadeGain.gain.setValueAtTime(0.01, rampNow);
        this.themeFadeGain.gain.linearRampToValueAtTime(1.0, rampNow + 0.85);
      }
    }, 650);
  }

  public getCurrentTheme(): SoundtrackTheme {
    return this.currentTheme;
  }

  // --- Clock Scheduler Loop (lookahead pattern) ---
  private startScheduler(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    if (this.ctx) {
      this.nextNoteTime = this.ctx.currentTime + 0.05;
    }

    const scheduleLoop = () => {
      if (!this.isRunning) return;
      if (this.ctx && this.currentTheme !== 'OFF') {
        // Prevent catch-up loop runaway when browser tab is backgrounded
        if (this.nextNoteTime < this.ctx.currentTime - 0.4) {
          this.nextNoteTime = this.ctx.currentTime + 0.05;
        }
        const lookahead = 0.12; // Look ahead 120ms
        while (this.nextNoteTime < this.ctx.currentTime + lookahead) {
          this.scheduleStep(this.currentStep, this.nextNoteTime);
          this.advanceStep();
        }
      }
      this.schedulerTimer = setTimeout(scheduleLoop, 35);
    };

    scheduleLoop();
  }

  private advanceStep(): void {
    const secondsPer16th = 60.0 / this.bpm / 4.0;
    this.nextNoteTime += secondsPer16th;
    this.currentStep = (this.currentStep + 1) % 64; // 4-bar 16th-note loop
  }

  private scheduleStep(step: number, time: number): void {
    if (!this.ctx || !this.themeFadeGain) return;

    switch (this.currentTheme) {
      case 'LOBBY':
        this.scheduleLobby(step, time);
        break;
      case 'DUNGEON':
        this.scheduleDungeon(step, time);
        break;
      case 'BOSS':
        this.scheduleBoss(step, time);
        break;
      case 'SANCTUARY':
        this.scheduleSanctuary(step, time);
        break;
      case 'VICTORY':
        this.scheduleVictory(step, time);
        break;
      case 'GAMEOVER':
        this.scheduleGameOver(step, time);
        break;
    }
  }

  // =========================================================================
  // THEME 1: LOBBY ("Vestíbulo de las Almas")
  // Slow, haunting gothic arpeggios in D minor, sub-bass drone, warm chime bells
  // =========================================================================
  private scheduleLobby(step: number, time: number): void {
    const ctx = this.ctx!;
    const out = this.themeFadeGain!;

    // Long Drone on Bar Start (every 16 steps)
    if (step % 16 === 0) {
      const droneFreqs = [73.42, 110.0, 146.83]; // D2, A2, D3
      this.playSynthPad(droneFreqs, time, 60.0 / this.bpm * 4.0, 0.16);
    }

    // Atmospheric Minor Arpeggio
    // D minor pentatonic: D4 (293.66), F4 (349.23), G4 (392.00), A4 (440.00), C5 (523.25)
    const arpNotes = [293.66, 349.23, 440.0, 523.25, 440.0, 349.23, 392.0, 293.66];
    if (step % 2 === 0) {
      const noteIdx = (Math.floor(step / 2)) % arpNotes.length;
      const freq = arpNotes[noteIdx];
      this.playPluck(freq, time, 0.45, 0.1);
    }

    // Distant bell on beat 1 and beat 3
    if (step === 0 || step === 32) {
      this.playCathedralBell(step === 0 ? 587.33 : 440.0, time, 0.14);
    }
  }

  // =========================================================================
  // THEME 2: DUNGEON EXPLORATION & COMBAT ("Laberinto Maldito")
  // Driving 114 BPM medieval/synth groove: deep kicks, tight shakers, resonant bass,
  // dynamic tension arp that intensifies when enemies approach or director gets angry.
  // =========================================================================
  private scheduleDungeon(step: number, time: number): void {
    const isEncounterTense = this.intensity > 0.35;

    // 1. Kick Drum (Step 0, 8, 16, 24, etc. - 4-on-the-floor with syncopation)
    if (step % 8 === 0 || (step % 16 === 14 && isEncounterTense)) {
      this.playDungeonKick(time, 0.28);
    }

    // 2. Snare / Dungeon Tom on 2 and 4 (step 4, 12, 20, 28...)
    if (step % 8 === 4) {
      this.playDungeonSnare(time, 0.2);
    }

    // 3. Shaker / Chain Rattle on 16th notes
    if (step % 2 === 1 || isEncounterTense) {
      this.playShaker(time, step % 4 === 2 ? 0.08 : 0.04);
    }

    // 4. Bassline: D Minor Driving Groove (D1 = 36.71, D2 = 73.42, F2 = 87.31, G2 = 98.0)
    // Dynamic bass pattern based on step
    const bassMap: Record<number, number> = {
      0: 73.42, // D2
      3: 73.42,
      6: 87.31, // F2
      8: 73.42,
      10: 98.00, // G2
      12: 110.00, // A2
      14: 65.41, // C2
    };
    const modStep = step % 16;
    if (bassMap[modStep]) {
      this.playSynthBass(bassMap[modStep], time, 0.22, 0.24);
    }

    // 5. Tension Gothic Lead / Chords (Trigger on every 16 steps)
    if (step === 0 || step === 32) {
      const chord = step === 0 ? [146.83, 220.0, 349.23] : [130.81, 196.0, 329.63]; // Dm and Cmaj
      this.playSynthPad(chord, time, 60.0 / this.bpm * 3.8, 0.11);
    }

    // 6. Fast Combat Arp (active during high intensity combat)
    if (isEncounterTense && step % 2 === 0) {
      const combatArp = [587.33, 698.46, 880.0, 1046.5, 880.0, 698.46, 783.99, 587.33];
      const note = combatArp[(step / 2) % combatArp.length];
      this.playPluck(note, time, 0.18, 0.08 * (0.6 + this.intensity * 0.4));
    }
  }

  // =========================================================================
  // THEME 3: BOSS BATTLE ("La Cólera del Tirano")
  // 138 BPM Aggressive Industrial/Orchestral Synth: heavy war drums, menacing brass,
  // sub-bass drops, relentless speed.
  // =========================================================================
  private scheduleBoss(step: number, time: number): void {
    // Heavy Double Kick Drum
    if (step % 4 === 0 || step % 8 === 3 || step % 16 === 14) {
      this.playDungeonKick(time, 0.38, true);
    }

    // Explosive Snare & Anvil Clank on beats 2 & 4
    if (step % 8 === 4) {
      this.playDungeonSnare(time, 0.32, true);
      this.playCathedralBell(880.0, time, 0.12);
    }

    // Hi-Hats on every 16th
    this.playShaker(time, step % 2 === 0 ? 0.09 : 0.05);

    // Aggressive Bass Stabs (C minor / C# tension: C1 = 32.7, D#1 = 38.89, G1 = 49.0)
    const bossBassNotes = [65.41, 65.41, 77.78, 65.41, 98.0, 65.41, 69.30, 65.41];
    if (step % 2 === 0) {
      const note = bossBassNotes[(step / 2) % bossBassNotes.length];
      this.playDistortedBass(note, time, 0.16, 0.3);
    }

    // Menacing Brass Stabs on bar entries
    if (step === 0 || step === 16 || step === 32 || step === 48) {
      const brassChord = step < 32 ? [130.81, 196.0, 311.13] : [138.59, 207.65, 329.63]; // Cm / C#m
      this.playBrassStab(brassChord, time, 0.55, 0.24);
    }

    // Rapid Tension Bell/Arp
    if (step % 4 === 2) {
      this.playCathedralBell(step % 8 === 2 ? 1046.5 : 987.77, time, 0.15);
    }
  }

  // =========================================================================
  // THEME 4: SANCTUARY ("Santuario de las Sombras")
  // 68 BPM mystical peaceful breather: Tibetan singing bowl resonance,
  // warm major-7th pads, sparkling celestial wind.
  // =========================================================================
  private scheduleSanctuary(step: number, time: number): void {
    // Deep Singing Bowl Resonance on each 16 steps
    if (step % 16 === 0) {
      // F Major 7th / A Minor 9th
      const root = step === 0 || step === 32 ? 174.61 : 220.0; // F3 or A3
      this.playSingingBowl(root, time, 6.0, 0.22);
    }

    // Warm celestial pad chord
    if (step % 16 === 0) {
      const padNotes = step < 32 ? [174.61, 220.0, 261.63, 329.63] : [196.0, 246.94, 293.66, 392.0];
      this.playSynthPad(padNotes, time, 5.0, 0.14);
    }

    // Delicate wind chime sparkles
    if (step % 4 === 0 && Math.random() < 0.6) {
      const chimeFreq = 1046.5 + Math.random() * 800;
      this.playPluck(chimeFreq, time, 0.8, 0.08);
    }
  }

  // =========================================================================
  // THEME 5: VICTORY FANFARE
  // =========================================================================
  private scheduleVictory(step: number, time: number): void {
    if (step === 0) {
      const fanfareChords = [
        { freqs: [261.63, 329.63, 392.0], duration: 0.6 },
        { freqs: [293.66, 369.99, 440.0], duration: 0.6 },
        { freqs: [329.63, 415.30, 493.88], duration: 0.6 },
        { freqs: [392.00, 493.88, 587.33, 783.99], duration: 2.2 },
      ];
      fanfareChords.forEach((c, i) => {
        this.playBrassStab(c.freqs, time + i * 0.45, c.duration, 0.25);
      });
    }
  }

  // =========================================================================
  // THEME 6: GAME OVER ("Condenados al Vacío")
  // =========================================================================
  private scheduleGameOver(step: number, time: number): void {
    if (step === 0) {
      // Descending somber bell tolls and sub-drone
      const freqs = [146.83, 138.59, 130.81, 110.0];
      freqs.forEach((f, idx) => {
        this.playCathedralBell(f * 2, time + idx * 1.2, 0.25);
        this.playSynthPad([f, f * 1.5], time + idx * 1.2, 1.8, 0.18);
      });
    }
  }

  // =========================================================================
  // INSTRUMENT SYNTHESIS RECIPES (Procedural Sound Design)
  // =========================================================================

  private playDungeonKick(time: number, gainAmt: number, isHeavy = false): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    const startFreq = isHeavy ? 165 : 135;
    const endFreq = isHeavy ? 35 : 42;
    const dur = isHeavy ? 0.28 : 0.2;

    osc.frequency.setValueAtTime(startFreq, time);
    osc.frequency.exponentialRampToValueAtTime(endFreq, time + dur);

    gain.gain.setValueAtTime(gainAmt, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + dur);

    osc.connect(gain);
    gain.connect(this.themeFadeGain!);

    osc.start(time);
    osc.stop(time + dur);
  }

  private playDungeonSnare(time: number, gainAmt: number, isHeavy = false): void {
    const ctx = this.ctx!;
    const dur = isHeavy ? 0.24 : 0.16;

    // Noise layer
    const bufferSize = Math.floor(ctx.sampleRate * dur);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.35));
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(isHeavy ? 600 : 900, time);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(gainAmt, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + dur);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.themeFadeGain!);

    noise.start(time);
    noise.stop(time + dur);
  }

  private playShaker(time: number, gainAmt: number): void {
    const ctx = this.ctx!;
    const dur = 0.055;
    const bufferSize = Math.floor(ctx.sampleRate * dur);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(7500, time);
    filter.Q.setValueAtTime(2.5, time);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(gainAmt, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + dur);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.themeFadeGain!);

    noise.start(time);
    noise.stop(time + dur);
  }

  private playSynthBass(freq: number, time: number, dur: number, gainAmt: number): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const subOsc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, time);

    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(freq * 0.5, time);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(freq * 4.5, time);
    filter.frequency.exponentialRampToValueAtTime(freq * 1.5, time + dur);
    filter.Q.setValueAtTime(4.0, time);

    gain.gain.setValueAtTime(gainAmt, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + dur);

    osc.connect(filter);
    subOsc.connect(filter);
    filter.connect(gain);
    gain.connect(this.themeFadeGain!);

    osc.start(time);
    subOsc.start(time);
    osc.stop(time + dur);
    subOsc.stop(time + dur);
  }

  private playDistortedBass(freq: number, time: number, dur: number, gainAmt: number): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, time);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(freq * 6.0, time);
    filter.frequency.exponentialRampToValueAtTime(freq * 1.8, time + dur);
    filter.Q.setValueAtTime(6.0, time);

    gain.gain.setValueAtTime(gainAmt, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + dur);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.themeFadeGain!);

    osc.start(time);
    osc.stop(time + dur);
  }

  private playSynthPad(freqs: number[], time: number, dur: number, gainAmt: number): void {
    const ctx = this.ctx!;
    const attack = Math.min(0.6, dur * 0.25);
    const release = Math.min(1.2, dur * 0.4);

    freqs.forEach(freq => {
      const osc = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, time);

      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(freq * 1.004, time); // Subtle detune chorus

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(freq * 3.5, time);

      gain.gain.setValueAtTime(0.001, time);
      gain.gain.linearRampToValueAtTime(gainAmt / freqs.length, time + attack);
      gain.gain.setValueAtTime(gainAmt / freqs.length, time + dur - release);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + dur);

      osc.connect(filter);
      osc2.connect(filter);
      filter.connect(gain);
      gain.connect(this.themeFadeGain!);

      osc.start(time);
      osc2.start(time);
      osc.stop(time + dur);
      osc2.stop(time + dur);
    });
  }

  private playPluck(freq: number, time: number, dur: number, gainAmt: number): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, time);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(freq * 4.0, time);
    filter.frequency.exponentialRampToValueAtTime(freq * 0.8, time + dur);

    gain.gain.setValueAtTime(gainAmt, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + dur);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.themeFadeGain!);

    osc.start(time);
    osc.stop(time + dur);
  }

  private playCathedralBell(freq: number, time: number, gainAmt: number): void {
    const ctx = this.ctx!;
    const dur = 2.4;

    // Multi-harmonic bell struck chime
    const partials = [
      { ratio: 1.0, gain: 0.5 },
      { ratio: 2.76, gain: 0.28 },
      { ratio: 4.07, gain: 0.18 },
      { ratio: 5.43, gain: 0.12 },
    ];

    partials.forEach(p => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq * p.ratio, time);

      gain.gain.setValueAtTime(gainAmt * p.gain, time);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + dur / p.ratio);

      osc.connect(gain);
      gain.connect(this.themeFadeGain!);

      osc.start(time);
      osc.stop(time + dur);
    });
  }

  private playBrassStab(freqs: number[], time: number, dur: number, gainAmt: number): void {
    const ctx = this.ctx!;
    freqs.forEach(freq => {
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();

      osc1.type = 'sawtooth';
      osc1.frequency.setValueAtTime(freq, time);

      osc2.type = 'sawtooth';
      osc2.frequency.setValueAtTime(freq * 1.008, time); // detune bite

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(freq * 5.5, time);
      filter.frequency.exponentialRampToValueAtTime(freq * 1.2, time + dur);
      filter.Q.setValueAtTime(3.5, time);

      gain.gain.setValueAtTime(0.001, time);
      gain.gain.linearRampToValueAtTime(gainAmt / freqs.length, time + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, time + dur);

      osc1.connect(filter);
      osc2.connect(filter);
      filter.connect(gain);
      gain.connect(this.themeFadeGain!);

      osc1.start(time);
      osc2.start(time);
      osc1.stop(time + dur);
      osc2.stop(time + dur);
    });
  }

  private playSingingBowl(freq: number, time: number, dur: number, gainAmt: number): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const oscHarmonic = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, time);

    oscHarmonic.type = 'sine';
    oscHarmonic.frequency.setValueAtTime(freq * 2.76, time); // Metallic overtone

    gain.gain.setValueAtTime(0.001, time);
    gain.gain.linearRampToValueAtTime(gainAmt, time + 0.4);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + dur);

    osc.connect(gain);
    oscHarmonic.connect(gain);
    gain.connect(this.themeFadeGain!);

    osc.start(time);
    oscHarmonic.start(time);
    osc.stop(time + dur);
    oscHarmonic.stop(time + dur);
  }

  // Algorithmic Cavern Impulse Response
  private createCavernReverb(ctx: AudioContext): ConvolverNode | null {
    try {
      const length = ctx.sampleRate * 2.2;
      const decay = 2.6;
      const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const data = buffer.getChannelData(ch);
        for (let i = 0; i < length; i++) {
          data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
        }
      }
      const convolver = ctx.createConvolver();
      convolver.buffer = buffer;
      return convolver;
    } catch {
      return null;
    }
  }

  public destroy(): void {
    this.isRunning = false;
    if (this.schedulerTimer) clearTimeout(this.schedulerTimer);
  }
}

export const soundtrack = new SoundtrackEngine();
