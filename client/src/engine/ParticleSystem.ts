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

export class ParticleSystem {
  private particles: Particle[] = [];
  private ghostTrails: GhostTrail[] = [];
  private shockwaves: ShockwaveRing[] = [];
  private lightningArcs: LightningArc[] = [];

  public emitDustPuff(x: number, y: number, count = 3) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 15 + Math.random() * 35;
      this.particles.push({
        x: x + (Math.random() * 8 - 4),
        y: y + (Math.random() * 4 - 2),
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 10,
        radius: 2 + Math.random() * 2.5,
        color: '#78716c',
        alpha: 0.45,
        life: 0,
        maxLife: 0.28 + Math.random() * 0.15,
        decay: 3.0,
      });
    }
  }

  public emitSparks(x: number, y: number, color = '#f59e0b', count = 8) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 70 + Math.random() * 200;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: 1.5 + Math.random() * 2.5,
        color,
        alpha: 1,
        life: 0,
        maxLife: 0.2 + Math.random() * 0.2,
        decay: 3.8,
        isStreak: true,
      });
    }
  }

  public emitAcidSpurt(x: number, y: number, count = 9) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 40 + Math.random() * 140;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: 2.5 + Math.random() * 3.5,
        color: Math.random() > 0.4 ? '#22c55e' : '#15803d',
        alpha: 0.85,
        life: 0,
        maxLife: 0.35 + Math.random() * 0.2,
        decay: 2.5,
      });
    }
  }

  public emitBlood(x: number, y: number, color = '#991b1b', count = 12) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 40 + Math.random() * 220;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: 2.5 + Math.random() * 4,
        color,
        alpha: 1,
        life: 0,
        maxLife: 0.4 + Math.random() * 0.3,
        decay: 2.2,
      });
    }
  }

  public emitExplosion(x: number, y: number, radius = 65, color = '#f97316') {
    this.addShockwave(x, y, radius, color, 4);
    for (let i = 0; i < 26; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 70 + Math.random() * (radius * 3.5);
      const isSecondary = Math.random() > 0.45;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: 3.5 + Math.random() * 5.5,
        color: isSecondary ? color : '#fef08a',
        alpha: 1,
        life: 0,
        maxLife: 0.35 + Math.random() * 0.25,
        decay: 3.0,
      });
    }
  }

  public addShockwave(x: number, y: number, maxRadius = 120, color = '#f59e0b', lineWidth = 3.5) {
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
    this.ghostTrails.push({
      x,
      y,
      angle,
      radius,
      color,
      alpha: 0.5,
    });
  }

  public update(dt: number) {
    if (this.particles.length > 110) {
      this.particles.splice(0, this.particles.length - 110);
    }
    if (this.ghostTrails.length > 24) {
      this.ghostTrails.splice(0, this.ghostTrails.length - 24);
    }

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.93;
      p.vy *= 0.93;
      p.alpha = Math.max(0, 1 - p.life / p.maxLife);

      if (p.life >= p.maxLife) {
        this.particles.splice(i, 1);
      }
    }

    for (let i = this.ghostTrails.length - 1; i >= 0; i--) {
      const g = this.ghostTrails[i];
      g.alpha -= dt * 4.0;
      if (g.alpha <= 0) {
        this.ghostTrails.splice(i, 1);
      }
    }

    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const sw = this.shockwaves[i];
      sw.currentRadius += (sw.maxRadius - sw.currentRadius) * Math.min(1, dt * 11);
      sw.alpha -= dt * 2.6;
      if (sw.alpha <= 0) {
        this.shockwaves.splice(i, 1);
      }
    }

    for (let i = this.lightningArcs.length - 1; i >= 0; i--) {
      const arc = this.lightningArcs[i];
      arc.alpha -= dt * 4.2;
      if (arc.alpha <= 0) {
        this.lightningArcs.splice(i, 1);
      }
    }
  }

  public render(ctx: CanvasRenderingContext2D) {
    ctx.save();

    // 1. Shockwave rings
    for (const sw of this.shockwaves) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, sw.alpha);
      ctx.strokeStyle = sw.color;
      ctx.lineWidth = sw.lineWidth;
      ctx.beginPath();
      ctx.arc(sw.x, sw.y, sw.currentRadius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // 2. Jagged Chain Lightning Arcs
    for (const arc of this.lightningArcs) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, arc.alpha);
      ctx.strokeStyle = arc.color;
      ctx.lineWidth = 2.5;
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
      ctx.restore();
    }

    // 3. Ghost trails
    for (const g of this.ghostTrails) {
      ctx.save();
      ctx.globalAlpha = g.alpha;
      ctx.fillStyle = g.color;
      ctx.translate(g.x, g.y);
      ctx.rotate(g.angle);
      ctx.beginPath();
      ctx.ellipse(0, 0, g.radius * 1.1, g.radius * 0.8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // 4. Particles
    for (const p of this.particles) {
      ctx.save();
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.color;

      if (p.isStreak && (Math.abs(p.vx) > 30 || Math.abs(p.vy) > 30)) {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = p.radius;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.04, p.y - p.vy * 0.04);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    }

    ctx.restore();
  }
}
