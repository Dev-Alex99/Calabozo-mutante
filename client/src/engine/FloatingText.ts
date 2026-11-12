export interface FloatingNumber {
  text: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  alpha: number;
  scale: number;
  targetScale: number;
  life: number;
  maxLife: number;
  isCrit?: boolean;
  isSynergy?: boolean;
}

export class FloatingTextManager {
  private items: FloatingNumber[] = [];
  private readonly MAX_ITEMS = 64;

  public spawn(
    text: string,
    x: number,
    y: number,
    color = '#facc15',
    isCrit = false,
    isSynergy = false
  ) {
    if (this.items.length >= this.MAX_ITEMS) {
      this.items.shift();
    }

    const initialScale = isSynergy ? 1.4 : isCrit ? 1.35 : 1.1;
    const targetScale = isSynergy ? 1.15 : isCrit ? 1.1 : 0.95;

    this.items.push({
      text,
      x: x + (Math.random() * 18 - 9),
      y: y - 12,
      vx: (Math.random() - 0.5) * 24,
      vy: isSynergy ? -75 : isCrit ? -70 : -50,
      color,
      alpha: 1,
      scale: initialScale,
      targetScale,
      life: 0,
      maxLife: isSynergy ? 0.95 : isCrit ? 0.85 : 0.65,
      isCrit,
      isSynergy,
    });
  }

  public update(dt: number) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const item = this.items[i];
      item.life += dt;
      item.x += item.vx * dt;
      item.y += item.vy * dt;
      item.vy *= Math.pow(0.85, dt * 60);
      item.vx *= Math.pow(0.92, dt * 60);

      // Scale bounce towards targetScale
      item.scale += (item.targetScale - item.scale) * Math.min(1, dt * 12);

      const progress = item.life / item.maxLife;
      if (progress > 0.6) {
        item.alpha = Math.max(0, 1 - (progress - 0.6) / 0.4);
      }

      if (item.life >= item.maxLife) {
        this.items.splice(i, 1);
      }
    }
  }

  public render(ctx: CanvasRenderingContext2D) {
    if (this.items.length === 0) return;

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (const item of this.items) {
      ctx.save();
      ctx.globalAlpha = item.alpha;
      ctx.translate(item.x, item.y);
      ctx.scale(item.scale, item.scale);

      const fontSize = item.isSynergy ? 18 : item.isCrit ? 16 : 13;
      ctx.font = `900 ${fontSize}px "Cinzel", "MedievalSharp", "Arial Black", sans-serif`;

      // Thick black stroke for high readability
      ctx.strokeStyle = '#0a0908';
      ctx.lineWidth = item.isCrit || item.isSynergy ? 3.5 : 2.5;
      ctx.lineJoin = 'round';
      ctx.strokeText(item.text, 0, 0);

      // Bright fill text
      ctx.fillStyle = item.color;
      ctx.fillText(item.text, 0, 0);

      ctx.restore();
    }

    ctx.restore();
  }
}
