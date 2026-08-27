import type { Vec3 } from '../types/vision';

const PALM = [0, 5, 9, 13, 17];
const FINGERS = [
  [0, 1, 2, 3, 4],
  [5, 6, 7, 8],
  [9, 10, 11, 12],
  [13, 14, 15, 16],
  [17, 18, 19, 20],
];

const pixel = (point: Vec3, canvas: HTMLCanvasElement) => ({ x: point.x * canvas.width, y: point.y * canvas.height });

export const drawHandShadow = (
  ctx: CanvasRenderingContext2D,
  landmarks: Vec3[],
  options: { alpha?: number; mirror?: boolean } = {},
) => {
  if (landmarks.length < 21) return;
  const alpha = options.alpha ?? 0.42;
  const points = options.mirror ? landmarks.map((point) => ({ ...point, x: 1 - point.x })) : landmarks;
  const palmScale = Math.hypot(
    (points[9].x - points[0].x) * ctx.canvas.width,
    (points[9].y - points[0].y) * ctx.canvas.height,
  );
  const stroke = Math.max(10, palmScale * 0.26);

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.shadowBlur = Math.max(5, stroke * 0.32);
  ctx.shadowColor = 'rgba(255, 210, 145, 0.42)';
  ctx.fillStyle = 'rgba(255, 202, 130, 0.28)';
  ctx.strokeStyle = 'rgba(255, 225, 175, 0.54)';

  const first = pixel(points[PALM[0]], ctx.canvas);
  ctx.beginPath();
  ctx.moveTo(first.x, first.y);
  for (const index of PALM.slice(1)) {
    const p = pixel(points[index], ctx.canvas);
    ctx.lineTo(p.x, p.y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  for (const chain of FINGERS) {
    ctx.beginPath();
    chain.forEach((index, i) => {
      const p = pixel(points[index], ctx.canvas);
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.lineWidth = stroke;
    ctx.stroke();
    ctx.lineWidth = Math.max(2, stroke * 0.22);
    ctx.strokeStyle = 'rgba(255, 244, 218, 0.72)';
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255, 225, 175, 0.54)';
  }

  ctx.restore();
};
