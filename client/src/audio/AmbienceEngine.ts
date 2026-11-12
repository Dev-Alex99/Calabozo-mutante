/**
 * CALABOZO MUTANTE — PROCEDURAL DUNGEON AMBIENCE GENERATOR
 * Continuous atmospheric soundscape: torch embers, cavern water drips,
 * subterranean wind, and room-mutation specific acoustic layers.
 */

import type { RoomMutation, RoomEncounterType } from '../types.js';

export class AmbienceEngine {
  private ctx: AudioContext | null = null;
  private outputNode: AudioNode | null = null;
  private isRunning = false;
  private isMuted = false;
  private volume = 0.45;

  private ambientGain: GainNode | null = null;
  private windGain: GainNode | null = null;
  private torchGain: GainNode | null = null;
  private dripTimer: any = null;

  // Active mutation layer nodes
  private lavaGain: GainNode | null = null;
  private sanctuaryGain: GainNode | null = null;

  public init(ctx: AudioContext, destination: AudioNode): void {
    if (this.ctx) return;
    this.ctx = ctx;

    // Ambient Master Gain
    this.ambientGain = ctx.createGain();
    this.ambientGain.gain.setValueAtTime(this.isMuted ? 0 : this.volume, ctx.currentTime);
    this.ambientGain.connect(destination);
    this.outputNode = this.ambientGain;

    this.startAmbience();
  }

  public setVolume(vol: number): void {
    this.volume = Math.max(0, Math.min(1, vol));
    if (this.ambientGain && this.ctx) {
      const target = this.isMuted ? 0 : this.volume;
      this.ambientGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.05);
    }
  }

  public setMuted(muted: boolean): void {
    this.isMuted = muted;
    if (this.ambientGain && this.ctx) {
      const target = this.isMuted ? 0 : this.volume;
      this.ambientGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.05);
    }
  }

  private startAmbience(): void {
    if (this.isRunning || !this.ctx || !this.outputNode) return;
    this.isRunning = true;

    // 1. Subterranean Cavern Wind Drafts (Continuous filtered noise with slow resonant modulation)
    this.createWindDraft();

    // 2. Flickering Torch Embers Crackle
    this.createTorchEmbers();

    // 3. Periodic Distant Water Drips (echoing in stone cavern)
    this.scheduleWaterDrips();
  }

  private createWindDraft(): void {
    const ctx = this.ctx!;
    const bufferSize = ctx.sampleRate * 4;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    // Pink-noise approximation
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      data[i] = (b0 + b1 + b2 + white * 0.5362) * 0.15;
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(280, ctx.currentTime);
    filter.Q.setValueAtTime(1.8, ctx.currentTime);

    // LFO to slowly sweep the wind frequency
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.type = 'sine';
    lfo.frequency.setValueAtTime(0.08, ctx.currentTime); // 12.5s cycle
    lfoGain.gain.setValueAtTime(140, ctx.currentTime);
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);

    this.windGain = ctx.createGain();
    this.windGain.gain.setValueAtTime(0.12, ctx.currentTime);

    noise.connect(filter);
    filter.connect(this.windGain);
    this.windGain.connect(this.outputNode!);

    noise.start();
    lfo.start();
  }

  private createTorchEmbers(): void {
    const ctx = this.ctx!;
    const bufferSize = ctx.sampleRate * 2;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    // High-frequency sporadic crackles
    for (let i = 0; i < bufferSize; i++) {
      const isPop = Math.random() < 0.003;
      data[i] = isPop ? (Math.random() * 2 - 1) * 0.8 : (Math.random() * 2 - 1) * 0.015;
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(1800, ctx.currentTime);

    this.torchGain = ctx.createGain();
    this.torchGain.gain.setValueAtTime(0.16, ctx.currentTime);

    noise.connect(filter);
    filter.connect(this.torchGain);
    this.torchGain.connect(this.outputNode!);

    noise.start();
  }

  private scheduleWaterDrips(): void {
    const nextDrip = () => {
      if (!this.isRunning || !this.ctx) return;
      this.playWaterDrip();
      const delay = 2200 + Math.random() * 4500; // Drips every 2.2 - 6.7 seconds
      this.dripTimer = setTimeout(nextDrip, delay);
    };
    nextDrip();
  }

  private playWaterDrip(): void {
    if (!this.ctx || !this.outputNode || this.isMuted) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    const baseFreq = 950 + Math.random() * 750;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(baseFreq, now);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.8, now + 0.035);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.9, now + 0.12);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.08, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);

    // Subtle random stereo pan for water drips
    let panner: StereoPannerNode | null = null;
    if (typeof ctx.createStereoPanner === 'function') {
      try {
        panner = ctx.createStereoPanner();
        panner.pan.setValueAtTime((Math.random() * 2 - 1) * 0.8, now);
        panner.connect(this.outputNode);
      } catch {}
    }

    osc.connect(gain);
    gain.connect(panner || this.outputNode);

    osc.start(now);
    osc.stop(now + 0.22);
  }

  // --- Dynamic Room Mutation Adaptation ---
  public updateRoomEncounter(mutation: RoomMutation | null, encounterType: RoomEncounterType): void {
    if (!this.ctx || !this.outputNode) return;
    const now = this.ctx.currentTime;

    // Restore base ambient layers if dimmed
    if (this.windGain) this.windGain.gain.setTargetAtTime(0.12, now, 0.4);
    if (this.torchGain) this.torchGain.gain.setTargetAtTime(0.16, now, 0.4);
    if (!this.dripTimer && this.isRunning) {
      this.scheduleWaterDrips();
    }

    // Lava bubbling layer
    if (mutation && mutation.hazardType === 'LAVA_PITS') {
      if (!this.lavaGain) {
        this.lavaGain = this.createLavaBubblingLayer();
      }
      this.lavaGain?.gain.setTargetAtTime(0.2, now, 0.5);
    } else if (this.lavaGain) {
      this.lavaGain.gain.setTargetAtTime(0, now, 0.5);
    }

    // Sanctuary ethereal aura
    if (encounterType === 'SANCTUARY') {
      if (!this.sanctuaryGain) {
        this.sanctuaryGain = this.createSanctuaryChimeLayer();
      }
      this.sanctuaryGain?.gain.setTargetAtTime(0.25, now, 0.5);
    } else if (this.sanctuaryGain) {
      this.sanctuaryGain.gain.setTargetAtTime(0, now, 0.5);
    }
  }

  public stop(): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (this.dripTimer) {
      clearTimeout(this.dripTimer);
      this.dripTimer = null;
    }
    if (this.windGain) this.windGain.gain.setTargetAtTime(0.0001, now, 0.4);
    if (this.torchGain) this.torchGain.gain.setTargetAtTime(0.0001, now, 0.4);
    if (this.lavaGain) this.lavaGain.gain.setTargetAtTime(0.0001, now, 0.4);
    if (this.sanctuaryGain) this.sanctuaryGain.gain.setTargetAtTime(0.0001, now, 0.4);
  }

  private createLavaBubblingLayer(): GainNode {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(75, ctx.currentTime);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(220, ctx.currentTime);
    filter.Q.setValueAtTime(6.0, ctx.currentTime);

    gain.gain.setValueAtTime(0.001, ctx.currentTime);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.outputNode!);

    osc.start();
    return gain;
  }

  private createSanctuaryChimeLayer(): GainNode {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(432, ctx.currentTime); // Sacred harmonic 432Hz

    gain.gain.setValueAtTime(0.001, ctx.currentTime);

    osc.connect(gain);
    gain.connect(this.outputNode!);

    osc.start();
    return gain;
  }

  public destroy(): void {
    this.isRunning = false;
    if (this.dripTimer) clearTimeout(this.dripTimer);
  }
}

export const ambience = new AmbienceEngine();
