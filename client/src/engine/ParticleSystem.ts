export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  alpha: number;
  life: number;
  maxLife: number;
  decay: number;
  isStreak?: boolean;
  active: boolean;
}

export interface GhostTrail {
  x: number;
  y: number;
  angle: number;
  radius: number;
  color: string;
  alpha: number;
}

export interface ShockwaveRing {
  x: number;
  y: number;
  currentRadius: number;
  maxRadius: number;
  color: string;
  alpha: number;
  lineWidth: number;
}

export interface LightningArc {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  alpha: number;
}

export interface PhysicalGib {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  rot: number;
  vRot: number;
  type: 'BONE' | 'ACID' | 'METAL' | 'EMBER' | 'FLESH';
  color: string;
  size: number;
  alpha: number;
  life: number;
  maxLife: number;
}

export interface SlashArcEffect {
  x: number;
  y: number;
  angle: number;
  radius: number;
  arcSpan: number;
  color: string;
  innerColor: string;
  alpha: number;
  maxAlpha: number;
  life: number;
  maxLife: number;
}

export class ParticleSystem {
  // Pre-allocated object pool for zero GC pauses
  private static readonly MAX_POOL = 300;
  private particlePool: Particle[] = [];
  private poolIndex = 0;

  private ghostTrails: GhostTrail[] = [];
  private shockwaves: ShockwaveRing[] = [];
  private lightningArcs: LightningArc[] = [];
  private gibs: PhysicalGib[] = [];
  private slashArcs: SlashArcEffect[] = [];

  constructor() {
    // Pre-allocate fixed pool
    for (let i = 0; i < ParticleSystem.MAX_POOL; i++) {
      this.particlePool.push({
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        radius: 2,
        color: '#f59e0b',
        alpha: 0,
        life: 0,
        maxLife: 1,
        decay: 1,
        isStreak: false,
        active: false,
      });
    }
  }

  private acquireParticle(
    x: number,
    y: number,
    vx: number,
    vy: number,
    radius: number,
    color: string,
    maxLife: number,
    decay = 2.5,
    isStreak = false
  ): void {
    const p = this.particlePool[this.poolIndex];
    this.poolIndex = (this.poolIndex + 1) % ParticleSystem.MAX_POOL;

    p.x = x;
    p.y = y;
    p.vx = vx;
    p.vy = vy;
    p.radius = radius;
    p.color = color;
    p.alpha = 1;
    p.life = 0;
    p.maxLife = maxLife;
    p.decay = decay;
    p.isStreak = isStreak;
    p.active = true;
  }

  public emitDustPuff(x: number, y: number, count = 3) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 15 + Math.random() * 35;
      this.acquireParticle(
        x + (Math.random() * 8 - 4),
        y + (Math.random() * 4 - 2),
        Math.cos(angle) * speed,
        Math.sin(angle) * speed - 10,
        2 + Math.random() * 2.5,
        '#78716c',
        0.28 + Math.random() * 0.15,
        3.0
      );
    }
  }

  public emitSparks(x: number, y: number, color = '#f59e0b', count = 8) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 70 + Math.random() * 200;
      this.acquireParticle(
        x,
        y,
        Math.cos(angle) * speed,
        Math.sin(angle) * speed,
        1.5 + Math.random() * 2.5,
        color,
        0.2 + Math.random() * 0.2,
        3.8,
        true
      );
    }
  }

  public emitAcidSpurt(x: number, y: number, count = 9) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 40 + Math.random() * 140;
      this.acquireParticle(
        x,
        y,
        Math.cos(angle) * speed,
        Math.sin(angle) * speed,
        2.5 + Math.random() * 3.5,
        Math.random() > 0.4 ? '#22c55e' : '#15803d',
        0.35 + Math.random() * 0.2,
        2.5
      );
    }
  }

  public emitBlood(x: number, y: number, color = '#991b1b', count = 12) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 40 + Math.random() * 220;
      this.acquireParticle(
        x,
        y,
        Math.cos(angle) * speed,
        Math.sin(angle) * speed,
        2.5 + Math.random() * 4,
        color,
        0.4 + Math.random() * 0.3,
        2.2
      );
    }
  }

  public emitExplosion(x: number, y: number, radius = 65, color = '#f97316') {
    this.addShockwave(x, y, radius, color, 4);
    for (let i = 0; i < 24; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 70 + Math.random() * (radius * 3.5);
      const isSecondary = Math.random() > 0.45;
      this.acquireParticle(
        x,
        y,
        Math.cos(angle) * speed,
        Math.sin(angle) * speed,
        3.5 + Math.random() * 5.5,
        isSecondary ? color : '#fef08a',
        0.35 + Math.random() * 0.25,
        3.0
      );
    }
  }

  public addShockwave(x: number, y: number, maxRadius = 120, color = '#f59e0b', lineWidth = 3.5) {
    if (this.shockwaves.length > 12) this.shockwaves.shift();
    this.shockwaves.push({
      x,
      y,
      currentRadius: 8,
      maxRadius,
      color,
      alpha: 0.95,
      lineWidth,
    });
  }

  public addLightningArc(x1: number, y1: number, x2: number, y2: number, color = '#38bdf8') {
    if (this.lightningArcs.length > 14) this.lightningArcs.shift();
    this.lightningArcs.push({
      x1,
      y1,
      x2,
      y2,
      color,
      alpha: 1.0,
    });
  }

  public addGhostTrail(x: number, y: number, angle: number, radius: number, color: string) {
    if (this.ghostTrails.length > 24) this.ghostTrails.shift();
    this.ghostTrails.push({
      x,
      y,
      angle,
      radius,
      color,
      alpha: 0.5,
    });
  }

  /**
   * Bouncy Physical Gibs with 3D gravity arc (Bones, Armor Shards, Acid drops, Flesh chunks)
   */
  public emitGibs(
    x: number,
    y: number,
    type: 'BONE' | 'ACID' | 'METAL' | 'EMBER' | 'FLESH',
    color = '#991b1b',
    count = 5
  ) {
    if (this.gibs.length > 40) {
      this.gibs.splice(0, this.gibs.length - 40);
    }
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 50 + Math.random() * 160;
      this.gibs.push({
        x,
        y,
        z: 10 + Math.random() * 14,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        vz: 120 + Math.random() * 180, // initial upward lift
        rot: Math.random() * Math.PI * 2,
        vRot: (Math.random() - 0.5) * 16,
        type,
        color,
        size: 3 + Math.random() * 4,
        alpha: 1.0,
        life: 0,
        maxLife: 1.8 + Math.random() * 1.2,
      });
    }
  }

  /**
   * Sweeping Weapon Slash Arc Mesh
   */
  public addSlashArc(
    x: number,
    y: number,
    angle: number,
    radius = 36,
    arcSpan = Math.PI * 0.75,
    color = '#f59e0b',
    innerColor = '#ffffff'
  ) {
    if (this.slashArcs.length > 8) this.slashArcs.shift();
    this.slashArcs.push({
      x,
      y,
      angle,
      radius,
      arcSpan,
      color,
      innerColor,
      alpha: 0.85,
      maxAlpha: 0.85,
      life: 0,
      maxLife: 0.16, // Fast, punchy 160ms slash
    });
  }

  public update(dt: number) {
    // 1. Update Particle Pool
    for (let i = 0; i < ParticleSystem.MAX_POOL; i++) {
      const p = this.particlePool[i];
      if (!p.active) continue;

      p.life += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.93;
      p.vy *= 0.93;
      p.alpha = Math.max(0, 1 - p.life / p.maxLife);

      if (p.life >= p.maxLife) {
        p.active = false;
      }
    }

    // 2. Update Ghost Trails
    for (let i = this.ghostTrails.length - 1; i >= 0; i--) {
      const g = this.ghostTrails[i];
      g.alpha -= dt * 4.0;
      if (g.alpha <= 0) {
        this.ghostTrails.splice(i, 1);
      }
    }

    // 3. Update Shockwaves
    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const sw = this.shockwaves[i];
      sw.currentRadius += (sw.maxRadius - sw.currentRadius) * Math.min(1, dt * 11);
      sw.alpha -= dt * 2.6;
      if (sw.alpha <= 0) {
        this.shockwaves.splice(i, 1);
      }
    }

    // 4. Update Lightning Arcs
    for (let i = this.lightningArcs.length - 1; i >= 0; i--) {
      const arc = this.lightningArcs[i];
      arc.alpha -= dt * 4.2;
      if (arc.alpha <= 0) {
        this.lightningArcs.splice(i, 1);
      }
    }

    // 5. Update Physical Gibs (Gravity + Bounce off Floor)
    for (let i = this.gibs.length - 1; i >= 0; i--) {
      const gib = this.gibs[i];
      gib.life += dt;
      gib.x += gib.vx * dt;
      gib.y += gib.vy * dt;

      // 3D Gravity simulation
      gib.vz -= 520 * dt;
      gib.z += gib.vz * dt;
      gib.rot += gib.vRot * dt;

      // Bounce off floor (z = 0)
      if (gib.z <= 0) {
        gib.z = 0;
        if (Math.abs(gib.vz) > 40) {
          gib.vz = -gib.vz * 0.42; // Elastic restitution
          gib.vx *= 0.65;
          gib.vy *= 0.65;
          gib.vRot *= 0.6;
        } else {
          gib.vz = 0;
          gib.vx *= 0.85;
          gib.vy *= 0.85;
          gib.vRot = 0;
        }
      }

      gib.alpha = Math.max(0, 1 - gib.life / gib.maxLife);
      if (gib.life >= gib.maxLife) {
        this.gibs.splice(i, 1);
      }
    }

    // 6. Update Slash Arcs
    for (let i = this.slashArcs.length - 1; i >= 0; i--) {
      const s = this.slashArcs[i];
      s.life += dt;
      s.alpha = Math.max(0, s.maxAlpha * (1 - s.life / s.maxLife));
      if (s.life >= s.maxLife) {
        this.slashArcs.splice(i, 1);
      }
    }
  }

  /**
   * Ultra-fast Batch Rendering without per-particle ctx.save() / ctx.restore()
   */
  public render(ctx: CanvasRenderingContext2D) {
    ctx.save();

    // 1. Shockwave rings
    for (const sw of this.shockwaves) {
      ctx.globalAlpha = Math.max(0, sw.alpha);
      ctx.strokeStyle = sw.color;
      ctx.lineWidth = sw.lineWidth;
      ctx.beginPath();
      ctx.arc(sw.x, sw.y, sw.currentRadius, 0, Math.PI * 2);
      ctx.stroke();
    }

    // 2. Jagged Chain Lightning Arcs
    ctx.lineWidth = 2.5;
    for (const arc of this.lightningArcs) {
      ctx.globalAlpha = Math.max(0, arc.alpha);
      ctx.strokeStyle = arc.color;
      ctx.beginPath();
      ctx.moveTo(arc.x1, arc.y1);
      const segments = 5;
      for (let s = 1; s < segments; s++) {
        const t = s / segments;
        const jx = (Math.random() - 0.5) * 18;
        const jy = (Math.random() - 0.5) * 18;
        ctx.lineTo(arc.x1 + (arc.x2 - arc.x1) * t + jx, arc.y1 + (arc.y2 - arc.y1) * t + jy);
      }
      ctx.lineTo(arc.x2, arc.y2);
      ctx.stroke();
    }

    // 3. Ghost trails
    for (const g of this.ghostTrails) {
      ctx.globalAlpha = g.alpha;
      ctx.fillStyle = g.color;
      ctx.save();
      ctx.translate(g.x, g.y);
      ctx.rotate(g.angle);
      ctx.beginPath();
      ctx.ellipse(0, 0, g.radius * 1.1, g.radius * 0.8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // 4. Physical Gibs with Floor Shadows
    for (const gib of this.gibs) {
      ctx.globalAlpha = gib.alpha;

      // Contact Drop Shadow (grows faint as gib rises)
      const shadowScale = Math.max(0.3, 1 - gib.z / 80);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
      ctx.beginPath();
      ctx.ellipse(gib.x, gib.y, gib.size * shadowScale * 1.2, gib.size * shadowScale * 0.6, 0, 0, Math.PI * 2);
      ctx.fill();

      // Gib sprite elevated by -z
      ctx.save();
      ctx.translate(gib.x, gib.y - gib.z);
      ctx.rotate(gib.rot);
      ctx.fillStyle = gib.color;

      if (gib.type === 'BONE') {
        // Small white bone fragment
        ctx.fillStyle = '#f1f5f9';
        ctx.fillRect(-gib.size, -gib.size * 0.4, gib.size * 2, gib.size * 0.8);
        ctx.beginPath();
        ctx.arc(-gib.size, 0, gib.size * 0.6, 0, Math.PI * 2);
        ctx.arc(gib.size, 0, gib.size * 0.6, 0, Math.PI * 2);
        ctx.fill();
      } else if (gib.type === 'METAL') {
        // Jagged metallic shard
        ctx.fillStyle = '#94a3b8';
        ctx.beginPath();
        ctx.moveTo(-gib.size, -gib.size * 0.8);
        ctx.lineTo(gib.size * 1.2, 0);
        ctx.lineTo(-gib.size * 0.6, gib.size * 0.9);
        ctx.closePath();
        ctx.fill();
      } else {
        // Organic / Acid / Flesh blob
        ctx.beginPath();
        ctx.arc(0, 0, gib.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // 5. Weapon Slash Arcs (Guerrero sweeping blade / Rogue cross slash)
    for (const s of this.slashArcs) {
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(s.angle);

      // Outer vibrant slash arc
      ctx.globalAlpha = s.alpha * 0.8;
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(0, 0, s.radius, -s.arcSpan / 2, s.arcSpan / 2);
      ctx.stroke();

      // Inner white core trail
      ctx.globalAlpha = s.alpha;
      ctx.strokeStyle = s.innerColor;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(0, 0, s.radius, -s.arcSpan / 2 + 0.15, s.arcSpan / 2 - 0.15);
      ctx.stroke();
      ctx.restore();
    }

    // 6. Fast Batched Pool Particles (Zero save/restore per particle!)
    for (let i = 0; i < ParticleSystem.MAX_POOL; i++) {
      const p = this.particlePool[i];
      if (!p.active) continue;

      ctx.globalAlpha = p.alpha;

      if (p.isStreak && (Math.abs(p.vx) > 30 || Math.abs(p.vy) > 30)) {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = p.radius;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.04, p.y - p.vy * 0.04);
        ctx.stroke();
      } else {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.restore();
  }
}
