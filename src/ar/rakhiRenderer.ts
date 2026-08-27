import type { Vec3, WristAnchor } from '../types/vision';
import { publicUrl } from '../app/baseUrl';

export class RakhiRenderer {
  private image = new Image();
  private ready = false;

  constructor() {
    this.image.onload = () => (this.ready = true);
    this.image.src = publicUrl('assets/rakhi.png');
  }

  draw(ctx: CanvasRenderingContext2D, anchor: WristAnchor, alpha: number, mirrored = true) {
    if (!this.ready || alpha <= 0) return;
    const x = (mirrored ? 1 - anchor.x : anchor.x) * ctx.canvas.width;
    const y = anchor.y * ctx.canvas.height;
    const angle = mirrored ? Math.PI - anchor.angle : anchor.angle;
    const width = Math.max(90, anchor.scale * ctx.canvas.width);
    const height = width * 0.23;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.drawImage(this.image, -width / 2, -height / 2, width, height);
    ctx.restore();
  }

  drawCarried(ctx: CanvasRenderingContext2D, hands: Vec3[][], anchor: WristAnchor, alpha: number, mirrored: boolean) {
    if (!this.ready || hands.length < 2 || alpha <= 0) return;
    const pinch = (points: Vec3[]) => ({
      x: ((points[4]?.x ?? points[0].x) + (points[8]?.x ?? points[0].x)) / 2,
      y: ((points[4]?.y ?? points[0].y) + (points[8]?.y ?? points[0].y)) / 2,
    });
    const a = pinch(hands[0]);
    const b = pinch(hands[1]);
    const toCanvas = (point: { x: number; y: number }) => ({
      x: (mirrored ? 1 - point.x : point.x) * ctx.canvas.width,
      y: point.y * ctx.canvas.height,
    });
    const p1 = toCanvas(a);
    const p2 = toCanvas(b);
    const wrist = toCanvas(anchor);
    const middle = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
    const control = { x: middle.x * 0.58 + wrist.x * 0.42, y: middle.y * 0.58 + wrist.y * 0.42 };
    const medallion = Math.max(34, anchor.scale * ctx.canvas.width * 0.34);

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.quadraticCurveTo(control.x, control.y, p2.x, p2.y);
    ctx.strokeStyle = '#d69b23';
    ctx.lineWidth = Math.max(7, medallion * 0.14);
    ctx.stroke();
    ctx.strokeStyle = '#a90f20';
    ctx.lineWidth = Math.max(3, medallion * 0.075);
    ctx.stroke();
    ctx.drawImage(this.image, 470, 0, 260, 260, control.x - medallion / 2, control.y - medallion / 2, medallion, medallion);
    ctx.restore();
  }

  drawWrapped(ctx: CanvasRenderingContext2D, anchor: WristAnchor, alpha: number, mirrored = true) {
    if (!this.ready || alpha <= 0) return;
    const x = (mirrored ? 1 - anchor.x : anchor.x) * ctx.canvas.width;
    const y = anchor.y * ctx.canvas.height;
    const angle = mirrored ? Math.PI - anchor.angle : anchor.angle;
    const ringWidth = Math.max(76, anchor.scale * ctx.canvas.width * 0.72);
    const ringHeight = Math.max(24, ringWidth * 0.34);
    const medallion = Math.max(36, ringWidth * 0.48);

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.lineCap = 'round';

    // Back half is darker and thinner; the front half is brighter. Together they
    // create a lightweight 3D ring around the wrist without a 3D model.
    ctx.beginPath();
    ctx.ellipse(0, 0, ringWidth / 2, ringHeight / 2, 0, Math.PI, Math.PI * 2);
    ctx.strokeStyle = 'rgba(112, 42, 18, .72)';
    ctx.lineWidth = Math.max(7, ringHeight * 0.24);
    ctx.stroke();

    ctx.beginPath();
    ctx.ellipse(0, 0, ringWidth / 2, ringHeight / 2, 0, 0, Math.PI);
    ctx.strokeStyle = '#d69b23';
    ctx.lineWidth = Math.max(8, ringHeight * 0.28);
    ctx.stroke();
    ctx.strokeStyle = '#a90f20';
    ctx.lineWidth = Math.max(3, ringHeight * 0.11);
    ctx.stroke();

    ctx.drawImage(this.image, 470, 0, 260, 260, -medallion / 2, -medallion * 0.62, medallion, medallion);
    ctx.restore();
  }
}
