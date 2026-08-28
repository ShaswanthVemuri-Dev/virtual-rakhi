import type { FaceAnchor } from '../types/vision';
import { publicUrl } from '../app/baseUrl';

export class TilakRenderer {
  private image = new Image();
  private ready = false;

  constructor() {
    this.image.onload = () => (this.ready = true);
    this.image.src = publicUrl('assets/tilak.png');
  }

  draw(ctx: CanvasRenderingContext2D, anchor: FaceAnchor, alpha: number, mirrored = true, reveal = 1) {
    if (!this.ready || alpha <= 0) return;
    const x = (mirrored ? 1 - anchor.x : anchor.x) * ctx.canvas.width;
    const y = anchor.y * ctx.canvas.height;
    const rotation = (mirrored ? -anchor.rotation : anchor.rotation) + Math.PI;
    const width = Math.max(18, anchor.scale * ctx.canvas.width);
    const height = width * 1.65;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    ctx.rotate(rotation);
    if (reveal < 1) {
      const shown = height * Math.max(0, reveal);
      ctx.beginPath();
      ctx.rect(-width / 2, height / 2 - shown, width, shown);
      ctx.clip();
    }
    ctx.drawImage(this.image, -width / 2, -height / 2, width, height);
    ctx.restore();
  }
}
