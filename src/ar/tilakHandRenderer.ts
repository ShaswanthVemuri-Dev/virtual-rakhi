import type { FaceAnchor } from '../types/vision';

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const smoothstep = (value: number) => {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
};

/** Small illustrated applicator whose tip follows the live forehead anchor. */
export class TilakHandRenderer {
  draw(ctx: CanvasRenderingContext2D, anchor: FaceAnchor, progress: number, mirrored = true) {
    const p = clamp01(progress);
    const width = ctx.canvas.width;
    const height = ctx.canvas.height;
    const targetX = (mirrored ? 1 - anchor.x : anchor.x) * width;
    const targetY = anchor.y * height;
    const markHeight = Math.max(30, anchor.scale * height * 1.65);
    const length = Math.min(height * .2, Math.max(76, anchor.scale * height * 3.1));

    let tipX = targetX;
    let tipY = targetY + markHeight * .3;
    let scale = 1;
    let alpha = 1;

    if (p < .4) {
      const t = smoothstep(p / .4);
      tipX += width * .025 * (1 - t);
      tipY = height + length * .15 + (targetY + markHeight * .3 - height - length * .15) * t;
      scale = .7 + .3 * t;
    } else if (p < .66) {
      const t = smoothstep((p - .4) / .26);
      tipY = targetY + markHeight * (.3 - .6 * t);
      scale = 1 + .06 * t;
    } else if (p > .76) {
      const t = smoothstep((p - .76) / .24);
      tipY = targetY - markHeight * .3 + height * .045 * t;
      scale = 1.06 - .26 * t;
      alpha = 1 - t;
    } else {
      tipY = targetY - markHeight * .3;
      scale = 1.06;
    }

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(tipX, tipY);
    ctx.rotate((mirrored ? -anchor.rotation : anchor.rotation) * .22);
    ctx.scale(scale, scale);
    this.drawApplicator(ctx, length);
    ctx.restore();
  }

  private drawApplicator(ctx: CanvasRenderingContext2D, length: number) {
    const shaftWidth = Math.max(7, length * .09);
    const shaft = ctx.createLinearGradient(0, 0, 0, length);
    shaft.addColorStop(0, '#f3c45b');
    shaft.addColorStop(.42, '#aa5d20');
    shaft.addColorStop(.8, '#6f351d');
    shaft.addColorStop(1, 'rgba(111, 53, 29, 0)');

    ctx.shadowBlur = length * .055;
    ctx.shadowColor = 'rgba(63, 27, 15, .24)';
    ctx.fillStyle = shaft;
    ctx.beginPath();
    ctx.roundRect(-shaftWidth / 2, -shaftWidth * .2, shaftWidth, length, shaftWidth / 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    const tip = ctx.createRadialGradient(-shaftWidth * .16, 0, 1, 0, 0, shaftWidth * .9);
    tip.addColorStop(0, '#ef7457');
    tip.addColorStop(.48, '#b2262d');
    tip.addColorStop(1, '#74131e');
    ctx.fillStyle = tip;
    ctx.beginPath();
    ctx.ellipse(0, 0, shaftWidth * .72, shaftWidth * .48, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#f5d77e';
    ctx.lineWidth = Math.max(1, shaftWidth * .15);
    ctx.beginPath();
    ctx.ellipse(0, shaftWidth * 1.15, shaftWidth * .72, shaftWidth * .28, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
}
