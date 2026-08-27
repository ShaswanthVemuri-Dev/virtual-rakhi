import type { FaceAnchor } from '../types/vision';
import { publicUrl } from '../app/baseUrl';

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

export class TilakHandRenderer {
  private image = new Image();
  private ready = false;

  constructor() {
    this.image.onload = () => (this.ready = true);
    this.image.src = publicUrl('assets/tilak_hand.png');
  }

  draw(ctx: CanvasRenderingContext2D, anchor: FaceAnchor, progress: number, mirrored = true) {
    if (!this.ready) return;
    const p = Math.max(0, Math.min(1, progress));
    const targetX = (mirrored ? 1 - anchor.x : anchor.x) * ctx.canvas.width;
    const targetY = anchor.y * ctx.canvas.height;
    const startX = targetX + ctx.canvas.width * 0.28;
    const startY = targetY + ctx.canvas.height * 0.38;
    const travel = p < 0.58 ? easeOutCubic(p / 0.58) : 1;
    const retract = p > 0.72 ? easeOutCubic((p - 0.72) / 0.28) : 0;
    const x = startX + (targetX - startX) * travel + (startX - targetX) * retract * 0.88;
    const y = startY + (targetY - startY) * travel + (startY - targetY) * retract * 0.88;
    const width = Math.max(170, ctx.canvas.width * 0.23);
    const alpha = p < 0.08 ? p / 0.08 : p > 0.9 ? (1 - p) / 0.1 : 1;

    ctx.save();
    ctx.globalAlpha = Math.max(0, alpha);
    ctx.translate(x, y);
    ctx.rotate(-0.18);
    if (mirrored) ctx.scale(-1, 1);
    ctx.drawImage(this.image, -width * 0.12, -width * 0.45, width, width * 0.72);
    ctx.restore();
  }
}
