import { soundtrack } from './SoundtrackEngine.js';
import { ambience } from './AmbienceEngine.js';
import type { PlayerClass } from '../types.js';

export interface AudioSettings {
  master: number;
  music: number;
  sfx: number;
  muted: boolean;
}

class SoundManager {
  private ctx: AudioContext | null = null;
  private masterCompressor: DynamicsCompressorNode | null = null;
  private masterLowPass: BiquadFilterNode | null = null;
  private masterGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private cavernReverb: ConvolverNode | null = null;

  // Settings
  private settings: AudioSettings = {
    master: 0.85,
    music: 0.6,
    sfx: 0.85,
    muted: false,
  };

  // State trackers
  private lastFootstepTime = 0;
  private coinStreak = 0;
  private lastCoinTime = 0;

  // Low HP Tension State
  private isLowHpActive = false;
  private heartbeatInterval: any = null;
  private lastTinnitusTime = 0;

  constructor() {
    this.loadSettings();
  }

  private loadSettings(): void {
    try {
      const saved = localStorage.getItem('calabozo_audio_config');
      if (saved) {
        const parsed = JSON.parse(saved);
        this.settings = { ...this.settings, ...parsed };
      }
    } catch {}
  }

  private saveSettings(): void {
    try {
      localStorage.setItem('calabozo_audio_config', JSON.stringify(this.settings));
    } catch {}
  }

  public getSettings(): AudioSettings {
    return { ...this.settings };
  }

  public initCtx(): AudioContext | null {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();

        // 1. Master Compressor / Limiter (Prevents any digital clipping)
        this.masterCompressor = this.ctx.createDynamicsCompressor();
        this.masterCompressor.threshold.setValueAtTime(-10, this.ctx.currentTime);
        this.masterCompressor.knee.setValueAtTime(24, this.ctx.currentTime);
        this.masterCompressor.ratio.setValueAtTime(10, this.ctx.currentTime);
        this.masterCompressor.attack.setValueAtTime(0.002, this.ctx.currentTime);
        this.masterCompressor.release.setValueAtTime(0.2, this.ctx.currentTime);

        // 2. Dynamic Low-Pass Filter on Master (for Muffled Low-HP Tense Audio / Concussion)
        this.masterLowPass = this.ctx.createBiquadFilter();
        this.masterLowPass.type = 'lowpass';
        this.masterLowPass.frequency.setValueAtTime(20000, this.ctx.currentTime);

        // 3. Master Gain
        this.masterGain = this.ctx.createGain();
        const masterVol = this.settings.muted ? 0 : this.settings.master;
        this.masterGain.gain.setValueAtTime(masterVol, this.ctx.currentTime);

        // 4. SFX Sub-Bus Gain
        this.sfxGain = this.ctx.createGain();
        this.sfxGain.gain.setValueAtTime(this.settings.sfx, this.ctx.currentTime);

        // 5. Algorithmic Cavern Reverb Bus
        this.cavernReverb = this.createCavernReverb(this.ctx);

        // Master Routing Chain:
        // sfxGain -> masterGain -> masterLowPass -> masterCompressor -> destination
        this.sfxGain.connect(this.masterGain);
        this.masterGain.connect(this.masterLowPass);
        this.masterLowPass.connect(this.masterCompressor);
        this.masterCompressor.connect(this.ctx.destination);

        // Cavern Reverb send
        if (this.cavernReverb) {
          this.cavernReverb.connect(this.masterGain);
        }

        // Initialize Soundtrack Engine & Ambience Engine
        soundtrack.init(this.ctx, this.masterGain);
        soundtrack.setVolume(this.settings.music);
        soundtrack.setMuted(this.settings.muted);

        ambience.init(this.ctx, this.masterGain);
        ambience.setVolume(this.settings.music * 0.7);
        ambience.setMuted(this.settings.muted);
      }
    }

    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }

    return this.ctx;
  }

  public setMasterVolume(vol: number): void {
    this.settings.master = Math.max(0, Math.min(1, vol));
    this.saveSettings();
    if (this.masterGain && this.ctx) {
      const target = this.settings.muted ? 0 : this.settings.master;
      this.masterGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.05);
    }
  }

  public setMusicVolume(vol: number): void {
    this.settings.music = Math.max(0, Math.min(1, vol));
    this.saveSettings();
    soundtrack.setVolume(this.settings.music);
    ambience.setVolume(this.settings.music * 0.7);
  }

  public setSfxVolume(vol: number): void {
    this.settings.sfx = Math.max(0, Math.min(1, vol));
    this.saveSettings();
    if (this.sfxGain && this.ctx) {
      this.sfxGain.gain.setTargetAtTime(this.settings.sfx, this.ctx.currentTime, 0.05);
    }
  }

  public setMuted(muted: boolean): void {
    this.settings.muted = muted;
    this.saveSettings();
    if (this.masterGain && this.ctx) {
      const target = this.settings.muted ? 0 : this.settings.master;
      this.masterGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.05);
    }
    soundtrack.setMuted(muted);
    ambience.setMuted(muted);
  }

  public toggleMute(): boolean {
    this.setMuted(!this.settings.muted);
    return this.settings.muted;
  }

  // --- Low-HP Tension Audio System (Muffled World + Heartbeat + Tinnitus) ---
  public updateLowHpState(hpPercent: number): void {
    if (!this.ctx || !this.masterLowPass) return;
    const now = this.ctx.currentTime;
    const isCritical = hpPercent > 0 && hpPercent <= 0.25;

    if (isCritical && !this.isLowHpActive) {
      this.isLowHpActive = true;
      // Muffle world audio: ramp master lowpass filter down to 420Hz
      this.masterLowPass.frequency.setTargetAtTime(420, now, 0.35);

      // Trigger high-frequency tinnitus ringing chime if not triggered recently
      if (Date.now() - this.lastTinnitusTime > 14000) {
        this.lastTinnitusTime = Date.now();
        this.playTinnitus();
      }

      // Start pulsing heartbeat loop
      if (!this.heartbeatInterval) {
        this.playHeartbeat();
        this.heartbeatInterval = setInterval(() => {
          if (this.isLowHpActive) {
            this.playHeartbeat();
          }
        }, 820); // ~73 BPM visceral heartbeat
      }
    } else if (!isCritical && this.isLowHpActive) {
      this.isLowHpActive = false;
      // Restore full audio clarity
      this.masterLowPass.frequency.setTargetAtTime(20000, now, 0.35);
      if (this.heartbeatInterval) {
        clearInterval(this.heartbeatInterval);
        this.heartbeatInterval = null;
      }
    }
  }

  public resetLowHpState(): void {
    if (!this.ctx || !this.masterLowPass) return;
    this.isLowHpActive = false;
    this.masterLowPass.frequency.setTargetAtTime(20000, this.ctx.currentTime, 0.2);
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * Visceral Heartbeat Pulse (Lub-Dub bypasses muffle filter straight into compressor)
   */
  public playHeartbeat(): void {
    if (this.settings.muted || !this.ctx || !this.masterCompressor) return;
    const now = this.ctx.currentTime;

    // Lub (Beat 1, 68Hz -> 38Hz)
    const osc1 = this.ctx.createOscillator();
    const gain1 = this.ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(68, now);
    osc1.frequency.exponentialRampToValueAtTime(38, now + 0.12);
    gain1.gain.setValueAtTime(0.44, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

    osc1.connect(gain1);
    gain1.connect(this.masterCompressor);
    osc1.start(now);
    osc1.stop(now + 0.14);

    // Dub (Beat 2, +150ms, 54Hz -> 32Hz)
    const osc2 = this.ctx.createOscillator();
    const gain2 = this.ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(54, now + 0.15);
    osc2.frequency.exponentialRampToValueAtTime(32, now + 0.3);
    gain2.gain.setValueAtTime(0.36, now + 0.15);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.32);

    osc2.connect(gain2);
    gain2.connect(this.masterCompressor);
    osc2.start(now + 0.15);
    osc2.stop(now + 0.32);
  }

  /**
   * Tinnitus / Acúfeno Ringing Whistle
   */
  public playTinnitus(): void {
    if (this.settings.muted || !this.ctx || !this.masterCompressor) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(3450, now);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.12, now + 0.08);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 2.8);

    osc.connect(gain);
    gain.connect(this.masterCompressor);

    osc.start(now);
    osc.stop(now + 2.8);
  }

  // --- Spatial 2D Audio Helper (Distance Attenuation & Panning) ---
  private createSpatialNode(x?: number, y?: number, listenerX?: number, listenerY?: number): { node: AudioNode; gainMult: number } {
    const ctx = this.ctx!;
    if (x === undefined || y === undefined || listenerX === undefined || listenerY === undefined) {
      return { node: this.sfxGain!, gainMult: 1.0 };
    }

    const dx = x - listenerX;
    const dy = y - listenerY;
    const dist = Math.hypot(dx, dy);

    // Distance attenuation (audible within ~1200px)
    const maxDist = 1200;
    const gainMult = Math.max(0.08, Math.min(1.0, 1 - dist / maxDist));

    // Stereo Panning (-1.0 to +1.0)
    let panner: StereoPannerNode | null = null;
    if (typeof ctx.createStereoPanner === 'function') {
      try {
        panner = ctx.createStereoPanner();
        const panValue = Math.max(-1.0, Math.min(1.0, dx / 480));
        panner.pan.setValueAtTime(panValue, ctx.currentTime);
        panner.connect(this.sfxGain!);
      } catch {
        panner = null;
      }
    }

    return { node: panner || this.sfxGain!, gainMult };
  }

  // --- Algorithmic Cavern Reverb ---
  private createCavernReverb(ctx: AudioContext): ConvolverNode | null {
    try {
      const length = ctx.sampleRate * 1.8;
      const decay = 2.4;
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

  // =========================================================================
  // 1. KINEMATIC & MOVEMENT AUDIO
  // =========================================================================

  /**
   * Footsteps on Dungeon Cobblestones.
   */
  public playFootstep(x?: number, y?: number, lx?: number, ly?: number): void {
    if (this.settings.muted) return;
    const now = Date.now();
    if (now - this.lastFootstepTime < 290) return;
    this.lastFootstepTime = now;

    const ctx = this.initCtx();
    if (!ctx) return;

    const { node, gainMult } = this.createSpatialNode(x, y, lx, ly);

    // 1. Noise crunch
    const dur = 0.065;
    const bufferSize = Math.floor(ctx.sampleRate * dur);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.4));
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    const jitter = 0.88 + Math.random() * 0.24;
    filter.frequency.setValueAtTime(1100 * jitter, ctx.currentTime);
    filter.Q.setValueAtTime(2.2, ctx.currentTime);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.09 * gainMult, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);

    noise.connect(filter);
    filter.connect(gain);

    // 2. Subtle low stone tap
    const tapOsc = ctx.createOscillator();
    const tapGain = ctx.createGain();
    tapOsc.type = 'sine';
    tapOsc.frequency.setValueAtTime(95 * jitter, ctx.currentTime);
    tapOsc.frequency.exponentialRampToValueAtTime(45, ctx.currentTime + 0.05);
    tapGain.gain.setValueAtTime(0.08 * gainMult, ctx.currentTime);
    tapGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);

    tapOsc.connect(tapGain);
    tapGain.connect(node);
    gain.connect(node);

    noise.start();
    tapOsc.start();
    noise.stop(ctx.currentTime + dur);
    tapOsc.stop(ctx.currentTime + 0.05);
  }

  /**
   * Sonic Dash / Blink
   */
  public playDash(): void {
    if (this.settings.muted) return;
    const ctx = this.initCtx();
    if (!ctx) return;

    const dur = 0.22;
    const osc = ctx.createOscillator();
    const oscGain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(240, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(920, ctx.currentTime + 0.1);
    osc.frequency.exponentialRampToValueAtTime(140, ctx.currentTime + dur);

    oscGain.gain.setValueAtTime(0.18, ctx.currentTime);
    oscGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);

    osc.connect(oscGain);
    oscGain.connect(this.sfxGain!);

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
    filter.frequency.setValueAtTime(450, ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(2200, ctx.currentTime + 0.08);
    filter.frequency.exponentialRampToValueAtTime(320, ctx.currentTime + dur);

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.24, ctx.currentTime);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.sfxGain!);

    osc.start();
    noise.start();
    osc.stop(ctx.currentTime + dur);
    noise.stop(ctx.currentTime + dur);
  }

  /**
   * Near-Miss Bullet Whiz (Supersonic fly-by snap when an enemy bullet grazes past)
   */
  public playNearMiss(): void {
    if (this.settings.muted || !this.ctx) return;
    const now = this.ctx.currentTime;
    const dur = 0.06;

    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(2900, now);
    osc.frequency.exponentialRampToValueAtTime(750, now + dur);

    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(2200, now);
    filter.Q.setValueAtTime(4.0, now);

    gain.gain.setValueAtTime(0.24, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain!);

    osc.start(now);
    osc.stop(now + dur);
  }

  // =========================================================================
  // 2. REALISTIC CLASS WEAPON SOUND DESIGN
  // =========================================================================

  public playWeaponAttack(classType: PlayerClass): void {
    if (this.settings.muted) return;
    const ctx = this.initCtx();
    if (!ctx) return;

    switch (classType) {
      case 'GUERRERO':
        this.playGuerreroGreatsword(ctx);
        break;
      case 'CAZADOR':
        this.playCazadorBowShot(ctx);
        break;
      case 'MAGO':
        this.playMagoArcaneBlast(ctx);
        break;
      case 'PICARO':
        this.playPicaroDaggerSlice(ctx);
        break;
    }
  }

  private playGuerreroGreatsword(ctx: AudioContext): void {
    const dur = 0.22;
    const bufferSize = Math.floor(ctx.sampleRate * dur);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.sin((i / bufferSize) * Math.PI);
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1450, ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(260, ctx.currentTime + dur);
    filter.Q.setValueAtTime(2.8, ctx.currentTime);

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.32, ctx.currentTime);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.sfxGain!);

    const steelOsc = ctx.createOscillator();
    const steelGain = ctx.createGain();
    steelOsc.type = 'triangle';
    steelOsc.frequency.setValueAtTime(2450, ctx.currentTime);
    steelOsc.frequency.exponentialRampToValueAtTime(1850, ctx.currentTime + 0.18);

    steelGain.gain.setValueAtTime(0.14, ctx.currentTime);
    steelGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);

    steelOsc.connect(steelGain);
    steelGain.connect(this.sfxGain!);

    const bodyOsc = ctx.createOscillator();
    const bodyGain = ctx.createGain();
    bodyOsc.type = 'sine';
    bodyOsc.frequency.setValueAtTime(115, ctx.currentTime);
    bodyOsc.frequency.exponentialRampToValueAtTime(45, ctx.currentTime + 0.12);
    bodyGain.gain.setValueAtTime(0.22, ctx.currentTime);
    bodyGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);

    bodyOsc.connect(bodyGain);
    bodyGain.connect(this.sfxGain!);

    noise.start();
    steelOsc.start();
    bodyOsc.start();
    noise.stop(ctx.currentTime + dur);
    steelOsc.stop(ctx.currentTime + 0.18);
    bodyOsc.stop(ctx.currentTime + 0.12);
  }

  private playCazadorBowShot(ctx: AudioContext): void {
    const snapOsc = ctx.createOscillator();
    const snapGain = ctx.createGain();
    snapOsc.type = 'triangle';
    snapOsc.frequency.setValueAtTime(1750, ctx.currentTime);
    snapOsc.frequency.exponentialRampToValueAtTime(320, ctx.currentTime + 0.075);

    snapGain.gain.setValueAtTime(0.28, ctx.currentTime);
    snapGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.075);

    snapOsc.connect(snapGain);
    snapGain.connect(this.sfxGain!);

    const dur = 0.15;
    const bufferSize = Math.floor(ctx.sampleRate * dur);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.5));
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(2600, ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(950, ctx.currentTime + dur);
    filter.Q.setValueAtTime(3.5, ctx.currentTime);

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.18, ctx.currentTime);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.sfxGain!);

    snapOsc.start();
    noise.start();
    snapOsc.stop(ctx.currentTime + 0.075);
    noise.stop(ctx.currentTime + dur);
  }

  private playMagoArcaneBlast(ctx: AudioContext): void {
    const dur = 0.24;
    const carrier = ctx.createOscillator();
    const modulator = ctx.createOscillator();
    const modGain = ctx.createGain();
    const outGain = ctx.createGain();

    carrier.type = 'sine';
    carrier.frequency.setValueAtTime(540, ctx.currentTime);
    carrier.frequency.exponentialRampToValueAtTime(180, ctx.currentTime + dur);

    modulator.type = 'sine';
    modulator.frequency.setValueAtTime(1080, ctx.currentTime);

    modGain.gain.setValueAtTime(450, ctx.currentTime);
    modGain.gain.exponentialRampToValueAtTime(50, ctx.currentTime + dur);

    modulator.connect(modGain);
    modGain.connect(carrier.frequency);

    outGain.gain.setValueAtTime(0.24, ctx.currentTime);
    outGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);

    carrier.connect(outGain);
    outGain.connect(this.sfxGain!);

    const sparkOsc = ctx.createOscillator();
    const sparkGain = ctx.createGain();
    sparkOsc.type = 'triangle';
    sparkOsc.frequency.setValueAtTime(2800, ctx.currentTime);
    sparkOsc.frequency.exponentialRampToValueAtTime(1400, ctx.currentTime + 0.1);
    sparkGain.gain.setValueAtTime(0.12, ctx.currentTime);
    sparkGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);

    sparkOsc.connect(sparkGain);
    sparkGain.connect(this.sfxGain!);

    modulator.start();
    carrier.start();
    sparkOsc.start();
    modulator.stop(ctx.currentTime + dur);
    carrier.stop(ctx.currentTime + dur);
    sparkOsc.stop(ctx.currentTime + 0.1);
  }

  private playPicaroDaggerSlice(ctx: AudioContext): void {
    [0, 0.045].forEach((offset, idx) => {
      const startTime = ctx.currentTime + offset;
      const dur = 0.11;

      const bufferSize = Math.floor(ctx.sampleRate * dur);
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.setValueAtTime(2400 + idx * 400, startTime);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.22, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + dur);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this.sfxGain!);

      noise.start(startTime);
      noise.stop(startTime + dur);
    });
  }

  public playSlash(): void {
    this.playWeaponAttack('GUERRERO');
  }

  public playShoot(): void {
    this.playWeaponAttack('CAZADOR');
  }

  // =========================================================================
  // 3. COMBAT IMPACTS, HITMARKS & DAMAGE
  // =========================================================================

  public playHitmark(isCrit = false): void {
    if (this.settings.muted) return;
    const ctx = this.initCtx();
    if (!ctx) return;

    if (isCrit) {
      const dur = 0.18;
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const subOsc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = 'triangle';
      osc1.frequency.setValueAtTime(1850, ctx.currentTime);
      osc1.frequency.exponentialRampToValueAtTime(920, ctx.currentTime + dur);

      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(2780, ctx.currentTime);
      osc2.frequency.exponentialRampToValueAtTime(1400, ctx.currentTime + dur);

      subOsc.type = 'sine';
      subOsc.frequency.setValueAtTime(95, ctx.currentTime);
      subOsc.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + 0.12);

      gain.gain.setValueAtTime(0.32, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);

      osc1.connect(gain);
      osc2.connect(gain);
      subOsc.connect(gain);
      gain.connect(this.sfxGain!);

      osc1.start();
      osc2.start();
      subOsc.start();
      osc1.stop(ctx.currentTime + dur);
      osc2.stop(ctx.currentTime + dur);
      subOsc.stop(ctx.currentTime + 0.12);
    } else {
      const snapOsc = ctx.createOscillator();
      const snapGain = ctx.createGain();
      snapOsc.type = 'triangle';
      snapOsc.frequency.setValueAtTime(1250, ctx.currentTime);
      snapOsc.frequency.exponentialRampToValueAtTime(380, ctx.currentTime + 0.045);

      snapGain.gain.setValueAtTime(0.18, ctx.currentTime);
      snapGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.045);

      snapOsc.connect(snapGain);
      snapGain.connect(this.sfxGain!);

      snapOsc.start();
      snapOsc.stop(ctx.currentTime + 0.045);
    }
  }

  public playHit(hasShield = false): void {
    if (this.settings.muted) return;
    const ctx = this.initCtx();
    if (!ctx) return;

    if (hasShield) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(820, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(280, ctx.currentTime + 0.16);

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1400, ctx.currentTime);
      filter.Q.setValueAtTime(4.5, ctx.currentTime);

      gain.gain.setValueAtTime(0.28, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.16);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.sfxGain!);

      osc.start();
      osc.stop(ctx.currentTime + 0.16);
    } else {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(130, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(38, ctx.currentTime + 0.15);

      gain.gain.setValueAtTime(0.35, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);

      osc.connect(gain);
      gain.connect(this.sfxGain!);

      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    }
  }

  // =========================================================================
  // 4. SPATIAL EXPLOSIONS, DUCKING & TELEGRAPHS
  // =========================================================================

  public playExplosion(x?: number, y?: number, lx?: number, ly?: number): void {
    if (this.settings.muted) return;
    const ctx = this.initCtx();
    if (!ctx) return;

    // Trigger sidechain audio ducking on soundtrack!
    soundtrack.duck(0.4, 450);

    const { node, gainMult } = this.createSpatialNode(x, y, lx, ly);
    const dur = 0.42;

    const crackOsc = ctx.createOscillator();
    const crackGain = ctx.createGain();
    crackOsc.type = 'sawtooth';
    crackOsc.frequency.setValueAtTime(420, ctx.currentTime);
    crackOsc.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + 0.04);
    crackGain.gain.setValueAtTime(0.4 * gainMult, ctx.currentTime);
    crackGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.04);

    crackOsc.connect(crackGain);
    crackGain.connect(node);

    const subOsc = ctx.createOscillator();
    const subGain = ctx.createGain();
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(110, ctx.currentTime);
    subOsc.frequency.exponentialRampToValueAtTime(36, ctx.currentTime + dur);
    subGain.gain.setValueAtTime(0.48 * gainMult, ctx.currentTime);
    subGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);

    subOsc.connect(subGain);
    subGain.connect(node);

    const bufferSize = Math.floor(ctx.sampleRate * dur);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 1.8);
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(480, ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(55, ctx.currentTime + dur);

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.36 * gainMult, ctx.currentTime);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(node);

    crackOsc.start();
    subOsc.start();
    noise.start();
    crackOsc.stop(ctx.currentTime + 0.04);
    subOsc.stop(ctx.currentTime + dur);
    noise.stop(ctx.currentTime + dur);
  }

  /**
   * Enemy Attack Telegraph Audio (Ascending charging energy cue)
   */
  public playEnemyCharge(x?: number, y?: number, lx?: number, ly?: number): void {
    if (this.settings.muted || !this.ctx) return;
    const now = this.ctx.currentTime;
    const { node, gainMult } = this.createSpatialNode(x, y, lx, ly);
    const dur = 0.55;

    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(260, now);
    osc.frequency.exponentialRampToValueAtTime(1450, now + dur);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(600, now);
    filter.frequency.exponentialRampToValueAtTime(2800, now + dur);
    filter.Q.setValueAtTime(5.5, now);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.2 * gainMult, now + 0.1);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(node);

    osc.start(now);
    osc.stop(now + dur);
  }

  /**
   * Boss Laser Beam Ionization Buildup
   */
  public playLaserCharge(x?: number, y?: number, lx?: number, ly?: number): void {
    if (this.settings.muted || !this.ctx) return;
    const now = this.ctx.currentTime;
    const { node, gainMult } = this.createSpatialNode(x, y, lx, ly);
    const dur = 0.65;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(880, now + dur);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.18 * gainMult, now + 0.15);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

    osc.connect(gain);
    gain.connect(node);

    osc.start(now);
    osc.stop(now + dur);
  }

  // =========================================================================
  // 5. CLASS SKILLS & ELEMENTAL SYNERGIES
  // =========================================================================

  public playSkill(classType?: PlayerClass): void {
    if (this.settings.muted) return;
    const ctx = this.initCtx();
    if (!ctx) return;

    switch (classType) {
      case 'GUERRERO':
        this.playExplosion();
        break;
      case 'CAZADOR':
        this.playIceShatter();
        break;
      case 'MAGO':
        this.playVortexPulse();
        break;
      case 'PICARO':
        this.playShadowWarp();
        break;
      default: {
        const notes = [220, 330, 440, 660];
        notes.forEach((f, idx) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(f, ctx.currentTime + idx * 0.035);
          osc.frequency.exponentialRampToValueAtTime(f * 1.5, ctx.currentTime + idx * 0.035 + 0.2);

          gain.gain.setValueAtTime(0.18, ctx.currentTime + idx * 0.035);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.035 + 0.2);

          osc.connect(gain);
          gain.connect(this.sfxGain!);
          osc.start(ctx.currentTime + idx * 0.035);
          osc.stop(ctx.currentTime + idx * 0.035 + 0.2);
        });
      }
    }
  }

  private playIceShatter(): void {
    const ctx = this.ctx!;
    const dur = 0.26;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1600, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(3200, ctx.currentTime + 0.08);
    osc.frequency.exponentialRampToValueAtTime(600, ctx.currentTime + dur);

    gain.gain.setValueAtTime(0.24, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);

    osc.connect(gain);
    gain.connect(this.sfxGain!);
    osc.start();
    osc.stop(ctx.currentTime + dur);
  }

  private playVortexPulse(): void {
    const ctx = this.ctx!;
    const dur = 0.35;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(80, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(450, ctx.currentTime + 0.18);
    osc.frequency.exponentialRampToValueAtTime(60, ctx.currentTime + dur);

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(380, ctx.currentTime);
    filter.Q.setValueAtTime(5.0, ctx.currentTime);

    gain.gain.setValueAtTime(0.28, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain!);

    osc.start();
    osc.stop(ctx.currentTime + dur);
  }

  private playShadowWarp(): void {
    const ctx = this.ctx!;
    const dur = 0.2;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(950, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(140, ctx.currentTime + dur);

    gain.gain.setValueAtTime(0.22, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);

    osc.connect(gain);
    gain.connect(this.sfxGain!);
    osc.start();
    osc.stop(ctx.currentTime + dur);
  }

  public playSynergy(): void {
    if (this.settings.muted) return;
    const ctx = this.initCtx();
    if (!ctx) return;

    soundtrack.duck(0.5, 350);

    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.04);
      gain.gain.setValueAtTime(0.2, ctx.currentTime + idx * 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.04 + 0.22);

      osc.connect(gain);
      gain.connect(this.sfxGain!);
      osc.start(ctx.currentTime + idx * 0.04);
      osc.stop(ctx.currentTime + idx * 0.04 + 0.22);
    });
  }

  // =========================================================================
  // 6. COLLECTIBLES, COMBOS & WORLD INTERACTIONS
  // =========================================================================

  /**
   * Combo Killstreak Milestone Audio (5x, 10x, 15x, 20x)
   */
  public playComboMilestone(comboLevel: number): void {
    if (this.settings.muted || !this.ctx) return;
    const now = this.ctx.currentTime;

    if (comboLevel >= 20) {
      // 20x GODLIKE: Triumphant four-chord power fanfare
      const notes = [523.25, 659.25, 783.99, 1046.5, 1318.51];
      notes.forEach((f, idx) => {
        const osc = this.ctx!.createOscillator();
        const gain = this.ctx!.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(f, now + idx * 0.04);
        gain.gain.setValueAtTime(0.18, now + idx * 0.04);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.04 + 0.35);
        osc.connect(gain);
        gain.connect(this.sfxGain!);
        osc.start(now + idx * 0.04);
        osc.stop(now + idx * 0.04 + 0.35);
      });
    } else if (comboLevel >= 15) {
      // 15x DOMINATING: Brass chord surge
      const notes = [440, 554.37, 659.25, 880];
      notes.forEach((f, idx) => {
        const osc = this.ctx!.createOscillator();
        const gain = this.ctx!.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(f, now + idx * 0.035);
        gain.gain.setValueAtTime(0.2, now + idx * 0.035);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.035 + 0.3);
        osc.connect(gain);
        gain.connect(this.sfxGain!);
        osc.start(now + idx * 0.035);
        osc.stop(now + idx * 0.035 + 0.3);
      });
    } else if (comboLevel >= 10) {
      // 10x UNSTOPPABLE: Bright ascending chime
      const notes = [392, 523.25, 659.25];
      notes.forEach((f, idx) => {
        const osc = this.ctx!.createOscillator();
        const gain = this.ctx!.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(f, now + idx * 0.04);
        gain.gain.setValueAtTime(0.22, now + idx * 0.04);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.04 + 0.25);
        osc.connect(gain);
        gain.connect(this.sfxGain!);
        osc.start(now + idx * 0.04);
        osc.stop(now + idx * 0.04 + 0.25);
      });
    } else if (comboLevel >= 5) {
      // 5x COMBO START: Crisp dual bell
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(783.99, now);
      osc.frequency.setValueAtTime(1046.5, now + 0.05);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
      osc.connect(gain);
      gain.connect(this.sfxGain!);
      osc.start(now);
      osc.stop(now + 0.2);
    }
  }

  public playCoin(): void {
    if (this.settings.muted) return;
    const ctx = this.initCtx();
    if (!ctx) return;

    const now = Date.now();
    if (now - this.lastCoinTime < 400) {
      this.coinStreak = (this.coinStreak + 1) % 6;
    } else {
      this.coinStreak = 0;
    }
    this.lastCoinTime = now;

    const scale = [1046.5, 1174.66, 1318.51, 1567.98, 1760.0, 2093.0];
    const freq = scale[this.coinStreak];

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    osc.frequency.setValueAtTime(freq * 1.5, ctx.currentTime + 0.04);

    gain.gain.setValueAtTime(0.14, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.16);

    osc.connect(gain);
    gain.connect(this.sfxGain!);

    osc.start();
    osc.stop(ctx.currentTime + 0.16);
  }

  public playHeal(): void {
    if (this.settings.muted) return;
    const ctx = this.initCtx();
    if (!ctx) return;

    const notes = [440, 554.37, 659.25];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.06);

      gain.gain.setValueAtTime(0.001, ctx.currentTime + idx * 0.06);
      gain.gain.linearRampToValueAtTime(0.2, ctx.currentTime + idx * 0.06 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.06 + 0.24);

      osc.connect(gain);
      gain.connect(this.sfxGain!);

      osc.start(ctx.currentTime + idx * 0.06);
      osc.stop(ctx.currentTime + idx * 0.06 + 0.24);
    });
  }

  public playEnemyDeath(isBoss = false): void {
    if (this.settings.muted) return;
    const ctx = this.initCtx();
    if (!ctx) return;

    if (isBoss) {
      soundtrack.duck(0.35, 600);
      const dur = 0.85;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(140, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(32, ctx.currentTime + dur);

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(650, ctx.currentTime);
      filter.frequency.exponentialRampToValueAtTime(70, ctx.currentTime + dur);

      gain.gain.setValueAtTime(0.42, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.sfxGain!);

      osc.start();
      osc.stop(ctx.currentTime + dur);
    } else {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(180, ctx.currentTime);
      osc.frequency.setValueAtTime(120, ctx.currentTime + 0.05);
      osc.frequency.setValueAtTime(60, ctx.currentTime + 0.12);

      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);

      osc.connect(gain);
      gain.connect(this.sfxGain!);

      osc.start();
      osc.stop(ctx.currentTime + 0.2);
    }
  }

  public playChestOpen(): void {
    if (this.settings.muted) return;
    const ctx = this.initCtx();
    if (!ctx) return;

    const notes = [261.63, 329.63, 392.0, 523.25, 659.25];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.07);

      gain.gain.setValueAtTime(0.001, ctx.currentTime + idx * 0.07);
      gain.gain.linearRampToValueAtTime(0.22, ctx.currentTime + idx * 0.07 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.07 + 0.32);

      osc.connect(gain);
      gain.connect(this.sfxGain!);

      osc.start(ctx.currentTime + idx * 0.07);
      osc.stop(ctx.currentTime + idx * 0.07 + 0.32);
    });
  }

  public playRoomClear(): void {
    if (this.settings.muted) return;
    const ctx = this.initCtx();
    if (!ctx) return;

    const notes = [440, 554.37, 659.25, 880];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.09);

      gain.gain.setValueAtTime(0.16, ctx.currentTime + idx * 0.09);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.09 + 0.36);

      osc.connect(gain);
      gain.connect(this.sfxGain!);

      osc.start(ctx.currentTime + idx * 0.09);
      osc.stop(ctx.currentTime + idx * 0.09 + 0.36);
    });
  }

  public playPing(): void {
    if (this.settings.muted) return;
    const ctx = this.initCtx();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.12);

    gain.gain.setValueAtTime(0.18, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.16);

    osc.connect(gain);
    gain.connect(this.sfxGain!);

    osc.start();
    osc.stop(ctx.currentTime + 0.16);
  }

  public playVictory(): void {
    if (this.settings.muted) return;
    soundtrack.setTheme('VICTORY');
  }

  public playGameOver(): void {
    if (this.settings.muted) return;
    soundtrack.setTheme('GAMEOVER');
  }

  public playAltarUpgrade(): void {
    if (this.settings.muted) return;
    const ctx = this.initCtx();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(2450, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.28);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.28);

    const thud = ctx.createOscillator();
    const thudGain = ctx.createGain();
    thud.type = 'sine';
    thud.frequency.setValueAtTime(140, ctx.currentTime);
    thud.frequency.exponentialRampToValueAtTime(45, ctx.currentTime + 0.15);
    thudGain.gain.setValueAtTime(0.35, ctx.currentTime);
    thudGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);

    osc.connect(gain);
    thud.connect(thudGain);
    gain.connect(this.sfxGain!);
    thudGain.connect(this.sfxGain!);

    osc.start();
    thud.start();
    osc.stop(ctx.currentTime + 0.28);
    thud.stop(ctx.currentTime + 0.15);
  }

  public playSecretFound(): void {
    if (this.settings.muted) return;
    this.playExplosion();
    this.playChestOpen();
  }

  // =========================================================================
  // 7. UI MICRO-ACOUSTIC FEEDBACK
  // =========================================================================

  /**
   * UI Tactile Stone Button Click
   */
  public playUiClick(): void {
    if (this.settings.muted || !this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(680, now);
    osc.frequency.exponentialRampToValueAtTime(220, now + 0.035);
    gain.gain.setValueAtTime(0.14, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);
    osc.connect(gain);
    gain.connect(this.sfxGain!);
    osc.start(now);
    osc.stop(now + 0.035);
  }

  /**
   * UI Parchment / Scroll Unroll
   */
  public playParchmentOpen(): void {
    if (this.settings.muted || !this.ctx) return;
    const dur = 0.16;
    const bufferSize = Math.floor(this.ctx.sampleRate * dur);
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.sin((i / bufferSize) * Math.PI);
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1400, this.ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(600, this.ctx.currentTime + dur);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + dur);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain!);

    noise.start();
    noise.stop(this.ctx.currentTime + dur);
  }

  /**
   * Gold Purse Coin Rattle
   */
  public playPurseRattle(): void {
    if (this.settings.muted || !this.ctx) return;
    [0, 0.03, 0.07].forEach((delay, idx) => {
      const now = this.ctx!.currentTime + delay;
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1400 + idx * 300, now);
      osc.frequency.exponentialRampToValueAtTime(900, now + 0.06);
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
      osc.connect(gain);
      gain.connect(this.sfxGain!);
      osc.start(now);
      osc.stop(now + 0.06);
    });
  }

  /**
   * Heavy Pendulum Blade Whoosh
   */
  public playPendulumWhoosh(): void {
    if (this.settings.muted || !this.ctx) return;
    const now = this.ctx.currentTime;
    const dur = 0.28;
    const bufferSize = Math.floor(this.ctx.sampleRate * dur);
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.sin((i / bufferSize) * Math.PI);
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(160, now);
    filter.frequency.exponentialRampToValueAtTime(750, now + dur * 0.4);
    filter.frequency.exponentialRampToValueAtTime(120, now + dur);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.01, now);
    gain.gain.linearRampToValueAtTime(0.25, now + dur * 0.35);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain!);

    noise.start(now);
    noise.stop(now + dur);
  }

  /**
   * Fire Grate Flame Eruption
   */
  public playFireGrateBlast(): void {
    if (this.settings.muted || !this.ctx) return;
    const now = this.ctx.currentTime;
    const dur = 0.35;
    const bufferSize = Math.floor(this.ctx.sampleRate * dur);
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(300, now);
    filter.frequency.exponentialRampToValueAtTime(1600, now + 0.08);
    filter.frequency.exponentialRampToValueAtTime(220, now + dur);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.05, now);
    gain.gain.linearRampToValueAtTime(0.3, now + 0.06);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain!);

    noise.start(now);
    noise.stop(now + dur);
  }

  /**
   * Runic Puzzle Plate Activation Chime
   */
  public playPuzzleChime(step: number = 0): void {
    if (this.settings.muted || !this.ctx) return;
    const now = this.ctx.currentTime;
    const notes = [440, 554.37, 659.25, 880, 1046.5];
    const freq = notes[step % notes.length];

    const osc = this.ctx.createOscillator();
    const subOsc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now);
    subOsc.type = 'triangle';
    subOsc.frequency.setValueAtTime(freq * 2, now);

    gain.gain.setValueAtTime(0.22, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

    osc.connect(gain);
    subOsc.connect(gain);
    gain.connect(this.sfxGain!);

    osc.start(now);
    subOsc.start(now);
    osc.stop(now + 0.6);
    subOsc.stop(now + 0.6);
  }

  /**
   * Puzzle Solved Fanfare
   */
  public playPuzzleSolved(): void {
    if (this.settings.muted || !this.ctx) return;
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
    notes.forEach((freq, i) => {
      const now = this.ctx!.currentTime + i * 0.12;
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now);
      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);
      osc.connect(gain);
      gain.connect(this.sfxGain!);
      osc.start(now);
      osc.stop(now + 0.7);
    });
  }

  /**
   * AI Dungeon Director: Pitch Black Out Sub-Boom
   */
  public playDirectorBlackout(): void {
    if (this.settings.muted || !this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const drone = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(110, now);
    osc.frequency.exponentialRampToValueAtTime(32, now + 1.2);

    drone.type = 'sawtooth';
    drone.frequency.setValueAtTime(55, now);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(140, now);

    gain.gain.setValueAtTime(0.4, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 1.4);

    osc.connect(gain);
    drone.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain!);

    osc.start(now);
    drone.start(now);
    osc.stop(now + 1.4);
    drone.stop(now + 1.4);
  }

  /**
   * Weapon Evolution Triumphant Surge
   */
  public playWeaponEvolved(): void {
    if (this.settings.muted || !this.ctx) return;
    const notes = [329.63, 440, 554.37, 659.25, 880, 1108.7];
    notes.forEach((freq, idx) => {
      const now = this.ctx!.currentTime + idx * 0.08;
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, now);

      const filter = this.ctx!.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(freq * 3, now);

      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.sfxGain!);

      osc.start(now);
      osc.stop(now + 0.8);
    });
  }

  /**
   * Combined Elemental Reactions Sound FX
   */
  public playElementalCombo(type: string = 'NOXIOUS_COMBUSTION'): void {
    if (this.settings.muted || !this.ctx) return;
    const now = this.ctx.currentTime;

    if (type === 'NOXIOUS_COMBUSTION') {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(140, now);
      osc.frequency.exponentialRampToValueAtTime(45, now + 0.3);
      gain.gain.setValueAtTime(0.28, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      osc.connect(gain);
      gain.connect(this.sfxGain!);
      osc.start(now);
      osc.stop(now + 0.35);
    } else if (type === 'SHATTER_SUPERCONDUCT') {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(1200, now);
      osc.frequency.exponentialRampToValueAtTime(240, now + 0.22);
      gain.gain.setValueAtTime(0.22, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      osc.connect(gain);
      gain.connect(this.sfxGain!);
      osc.start(now);
      osc.stop(now + 0.25);
    } else if (type === 'FLASH_MELT') {
      const dur = 0.25;
      const bufferSize = Math.floor(this.ctx.sampleRate * dur);
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(2800, now);
      filter.Q.value = 3.5;
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this.sfxGain!);
      noise.start(now);
      noise.stop(now + dur);
    }
  }
}

export const sfx = new SoundManager();
