import type { FaceAnchor } from '../types/vision';
import { publicUrl } from '../app/baseUrl';

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const smoothstep = (value: number) => {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
};

/** Dorsal-hand illustration whose hidden ring-finger pad follows the Tilaka stroke. */
export class TilakHandRenderer {
  private image = new Image();
  private ready = false;

  constructor() {
    this.image.onload = () => (this.ready = true);
    this.image.src = publicUrl('assets/tilak_applying_hand.webp');
  }

  draw(ctx: CanvasRenderingContext2D, anchor: FaceAnchor, progress: number, mirrored = true) {
    if (!this.ready) return;
    const p = clamp01(progress);
    const width = ctx.canvas.width;
    const height = ctx.canvas.height;
    const targetX = (mirrored ? 1 - anchor.x : anchor.x) * width;
    const targetY = anchor.y * height;
    const markHeight = Math.max(30, anchor.scale * width * 1.65);
    const assetSize = Math.min(
      height * .58,
      Math.max(height * .38, anchor.scale * width * 4.6),
    );

    let tipX = targetX;
    let tipY = targetY + markHeight * .3;
    let depthScale = 1;
    let alpha = 1;

    if (p < .42) {
      const t = smoothstep(p / .42);
      tipX = targetX + width * .035 * (1 - t);
      tipY = height + assetSize * .05 + (targetY + markHeight * .3 - height - assetSize * .05) * t;
      depthScale = .68 + .32 * t;
    } else if (p < .66) {
      const t = smoothstep((p - .42) / .24);
      tipY = targetY + markHeight * (.3 - .6 * t);
      depthScale = 1 + .035 * t;
    } else if (p > .74) {
      const t = smoothstep((p - .74) / .26);
      tipY = targetY - markHeight * .3 + height * .07 * t;
      depthScale = 1.035 - .275 * t;
      alpha = 1 - t;
    } else {
      tipY = targetY - markHeight * .3;
      depthScale = 1.035;
    }

    // Normalized location of the extended ring-finger pad in the asset.
    const fingerX = .394;
    const fingerY = .016;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(tipX, tipY);
    ctx.rotate((mirrored ? -anchor.rotation : anchor.rotation) * .2);
    ctx.scale(depthScale, depthScale);
    ctx.shadowBlur = assetSize * .025;
    ctx.shadowColor = 'rgba(64, 31, 20, .18)';
    ctx.drawImage(
      this.image,
      -fingerX * assetSize,
      -fingerY * assetSize,
      assetSize,
      assetSize,
    );
    ctx.restore();
  }
}
