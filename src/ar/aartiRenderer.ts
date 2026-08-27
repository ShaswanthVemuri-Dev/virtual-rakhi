import { publicUrl } from '../app/baseUrl';

const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

export class AartiRenderer {
  private image = new Image();
  private ready = false;

  constructor() {
    this.image.onload = () => (this.ready = true);
    this.image.src = publicUrl('assets/aarti_thali.png');
  }

  draw(ctx: CanvasRenderingContext2D, progress: number) {
    if (!this.ready) return;
    const p = Math.max(0, Math.min(1, progress));
    const eased = easeInOut(p);
    const angle = eased * Math.PI * 2 * 3 - Math.PI / 2;
    const centerX = ctx.canvas.width * 0.5;
    const centerY = ctx.canvas.height * 0.56;
    const radiusX = ctx.canvas.width * 0.13;
    const radiusY = ctx.canvas.height * 0.105;
    const x = centerX + Math.cos(angle) * radiusX;
    const y = centerY + Math.sin(angle) * radiusY;
    const size = Math.max(105, ctx.canvas.width * 0.145);
    const fade = Math.min(1, p / 0.08, (1 - p) / 0.08);

    ctx.save();
    ctx.globalAlpha = Math.max(0, fade);
    ctx.shadowBlur = size * 0.12;
    ctx.shadowColor = 'rgba(255, 172, 72, .55)';
    ctx.translate(x, y);
    ctx.rotate(Math.sin(angle) * 0.08);
    ctx.drawImage(this.image, -size / 2, -size * 0.34, size, size * 0.68);
    ctx.restore();
  }
}
