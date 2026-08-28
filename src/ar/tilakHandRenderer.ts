import type { FaceAnchor } from '../types/vision';

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

/** Illustrated kumkum application with no photographic hand or finger convention. */
export class TilakHandRenderer {
  draw(ctx: CanvasRenderingContext2D, anchor: FaceAnchor, progress: number, mirrored = true) {
    const p = Math.max(0, Math.min(1, progress));
    const targetX = (mirrored ? 1 - anchor.x : anchor.x) * ctx.canvas.width;
    const targetY = anchor.y * ctx.canvas.height;
    const travel = easeOutCubic(Math.min(1, p / .6));
    const startY = targetY + Math.min(ctx.canvas.height * .22, 180);
    const y = startY + (targetY - startY) * travel;
    const size = Math.max(11, anchor.scale * ctx.canvas.width * .42);
    const alpha = p < .08 ? p / .08 : p > .68 ? Math.max(0, (1 - p) / .32) : 1;

    ctx.save();
    ctx.globalAlpha = Math.max(0, alpha);
    const trail = ctx.createLinearGradient(targetX, y, targetX, startY);
    trail.addColorStop(0, 'rgba(170, 33, 35, .9)');
    trail.addColorStop(1, 'rgba(170, 33, 35, 0)');
    ctx.strokeStyle = trail;
    ctx.lineCap = 'round';
    ctx.lineWidth = Math.max(2, size * .15);
    ctx.beginPath();
    ctx.moveTo(targetX, y + size * 1.4);
    ctx.lineTo(targetX, y);
    ctx.stroke();

    const pigment = ctx.createRadialGradient(targetX - size * .18, y - size * .22, 1, targetX, y, size);
    pigment.addColorStop(0, '#ef6c55');
    pigment.addColorStop(.38, '#b52225');
    pigment.addColorStop(1, '#741417');
    ctx.fillStyle = pigment;
    ctx.shadowBlur = size * .8;
    ctx.shadowColor = 'rgba(211, 57, 39, .45)';
    ctx.beginPath();
    ctx.arc(targetX, y, size * .48, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}
