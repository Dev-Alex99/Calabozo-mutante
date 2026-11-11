export interface FloatingNumber {
  text: string;
  x: number;
  y: number;
  color: string;
  alpha: number;
  vy: number;
  scale: number;
  life: number;
  maxLife: number;
}

export class FloatingTextManager {
  private items: FloatingNumber[] = [];

  public spawn(text: string, x: number, y: number, color = '#facc15') {
    this.items.push({
      text,
      x: x + (Math.random() * 20 - 10),
      y: y - 10,
      color,
      alpha: 1,
      vy: -55,
      scale: 1.2,
      life: 0,
      maxLife: 0.7,
    });
  }

  public update(dt: number) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const item = this.items[i];
      item.life += dt;
      item.y += item.vy * dt;
      item.vy *= 0.95;
      item.alpha = Math.max(0, 1 - (item.life / item.maxLife));
      item.scale = Math.max(0.8, item.scale - dt * 0.4);

      if (item.life >= item.maxLife) {
        this.items.splice(i, 1);
      }
    }
  }

  public render(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.font = 'bold 15px "Cinzel", "MedievalSharp", serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (const item of this.items) {
      ctx.save();
      ctx.globalAlpha = item.alpha;
      ctx.fillStyle = item.color;
      ctx.shadowColor = '#000000';
      ctx.shadowBlur = 4;
      ctx.fillText(item.text, item.x, item.y);
      ctx.restore();
    }

    ctx.restore();
  }
}
