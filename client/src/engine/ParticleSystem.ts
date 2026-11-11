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

export class ParticleSystem {
  private particles: Particle[] = [];
  private ghostTrails: GhostTrail[] = [];

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

  public emitExplosion(x: number, y: number, radius = 50) {
    for (let i = 0; i < 28; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 80 + Math.random() * (radius * 4);
      const isFire = Math.random() > 0.4;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: 4 + Math.random() * 6,
        color: isFire ? '#f97316' : '#fbbf24',
        alpha: 1,
        life: 0,
        maxLife: 0.35 + Math.random() * 0.25,
        decay: 3.0,
      });
    }
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
    // Update particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.93;
      p.vy *= 0.93;
      p.alpha = Math.max(0, 1 - (p.life / p.maxLife));

      if (p.life >= p.maxLife) {
        this.particles.splice(i, 1);
      }
    }

    // Update ghost trails
    for (let i = this.ghostTrails.length - 1; i >= 0; i--) {
      const g = this.ghostTrails[i];
      g.alpha -= dt * 4.0;
      if (g.alpha <= 0) {
        this.ghostTrails.splice(i, 1);
      }
    }
  }

  public render(ctx: CanvasRenderingContext2D) {
    ctx.save();

    // Render ghost trails with fading phantom glow
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

    // Render particles (streaks or round embers)
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
