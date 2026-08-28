import { publicUrl } from '../app/baseUrl';

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const smoothstep = (value: number) => {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
};

/** Illustrated thali with one code-rendered flame and exactly three turns. */
export class AartiRenderer {
  private image = new Image();
  private ready = false;

  constructor() {
    this.image.onload = () => (this.ready = true);
    this.image.src = publicUrl('assets/aarti_hands_plate.webp');
  }

  draw(ctx: CanvasRenderingContext2D, progress: number) {
    if (!this.ready) return;
    const p = clamp01(progress);
    const width = ctx.canvas.width;
    const height = ctx.canvas.height;
    const assetSize = Math.min(width * .4, height * .54);

    // Enter from below/depth, make three human-paced clockwise turns, then
    // return to the same lower point and recede. No opacity trick is used.
    const entering = p < .12;
    const exiting = p > .88;
    const orbit = clamp01((p - .12) / .76);
    const turnAngle = Math.PI / 2 + orbit * Math.PI * 6;
    const baseX = width * .5;
    const baseY = height * .65;
    let x = baseX + Math.cos(turnAngle) * width * .15;
    let y = baseY + Math.sin(turnAngle) * height * .06;
    let depthScale = 1;

    if (entering) {
      const t = smoothstep(p / .12);
      x = baseX;
      y = height + assetSize * .18 + (height * .71 - height - assetSize * .18) * t;
      depthScale = .58 + .42 * t;
    } else if (exiting) {
      const t = smoothstep((p - .88) / .12);
      x = baseX;
      y = height * .71 + (height + assetSize * .18 - height * .71) * t;
      depthScale = 1 - .42 * t;
    }

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.cos(turnAngle) * .025);
    ctx.scale(depthScale, depthScale);
    ctx.drawImage(this.image, -assetSize / 2, -assetSize / 2, assetSize, assetSize);
    this.drawFlame(ctx, assetSize, p);
    ctx.restore();
  }

  private drawFlame(ctx: CanvasRenderingContext2D, size: number, progress: number) {
    const flicker = Math.sin(progress * Math.PI * 42) * size * .006;
    ctx.save();
    // Matches the empty wick in the illustration.
    ctx.translate(flicker, -size * .275);
    ctx.shadowBlur = size * .045;
    ctx.shadowColor = 'rgba(255, 139, 35, .72)';

    const flame = new Path2D();
    flame.moveTo(0, size * .035);
    flame.bezierCurveTo(-size * .032, size * .01, -size * .022, -size * .055, size * .006, -size * .095);
    flame.bezierCurveTo(size * .018, -size * .052, size * .043, size * .006, 0, size * .035);
    const fill = ctx.createLinearGradient(0, -size * .1, 0, size * .04);
    fill.addColorStop(0, '#fff5ad');
    fill.addColorStop(.45, '#ffb325');
    fill.addColorStop(1, '#d84a18');
    ctx.fillStyle = fill;
    ctx.fill(flame);

    ctx.shadowBlur = 0;
    ctx.fillStyle = '#fffbd7';
    ctx.beginPath();
    ctx.ellipse(0, size * .004, size * .007, size * .024, .08, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}
