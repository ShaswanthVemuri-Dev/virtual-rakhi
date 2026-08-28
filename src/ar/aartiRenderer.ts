/** A fully code-rendered Aarti illustration: no photo, sprite, or external asset. */
export class AartiRenderer {
  draw(ctx: CanvasRenderingContext2D, progress: number) {
    const p = Math.max(0, Math.min(1, progress));
    // Linear angular motion: exactly three complete clockwise turns.
    const angle = p * Math.PI * 2 * 3 - Math.PI / 2;
    const size = Math.max(118, Math.min(ctx.canvas.width * .19, ctx.canvas.height * .28));
    const x = ctx.canvas.width * .5 + Math.cos(angle) * ctx.canvas.width * .16;
    const y = ctx.canvas.height * .65 + Math.sin(angle) * ctx.canvas.height * .085;
    const fade = Math.min(1, p / .06, (1 - p) / .06);

    ctx.save();
    ctx.globalAlpha = Math.max(0, fade);
    ctx.translate(x, y);
    ctx.rotate(Math.sin(angle) * .035);
    this.drawHands(ctx, size);
    this.drawPlate(ctx, size, p);
    ctx.restore();
  }

  private drawHands(ctx: CanvasRenderingContext2D, size: number) {
    const skin = ctx.createLinearGradient(0, size * .2, 0, size * 1.08);
    skin.addColorStop(0, '#e0a27c');
    skin.addColorStop(.46, '#cb8664');
    skin.addColorStop(1, '#a95f46');
    const drawHand = (side: -1 | 1) => {
      ctx.save();
      ctx.scale(side, 1);
      const hand = new Path2D();
      hand.moveTo(size * .12, size * .15);
      hand.bezierCurveTo(size * .34, size * .13, size * .57, size * .29, size * .69, size * .53);
      hand.bezierCurveTo(size * .78, size * .73, size * .87, size * .95, size * .99, size * 1.09);
      hand.lineTo(size * .67, size * 1.12);
      hand.bezierCurveTo(size * .54, size * .93, size * .43, size * .75, size * .29, size * .65);
      hand.bezierCurveTo(size * .18, size * .57, size * .05, size * .48, -size * .02, size * .37);
      hand.bezierCurveTo(-size * .07, size * .28, size * .01, size * .18, size * .12, size * .15);
      ctx.fillStyle = skin;
      ctx.fill(hand);
      ctx.strokeStyle = 'rgba(94, 49, 37, .28)';
      ctx.lineWidth = Math.max(1, size * .008);
      ctx.stroke(hand);
      ctx.strokeStyle = 'rgba(105, 54, 40, .32)';
      ctx.lineCap = 'round';
      ctx.lineWidth = size * .024;
      for (let finger = 0; finger < 3; finger += 1) {
        ctx.beginPath();
        ctx.moveTo(size * (.08 + finger * .055), size * (.28 + finger * .044));
        ctx.quadraticCurveTo(size * (.18 + finger * .05), size * (.34 + finger * .04), size * (.25 + finger * .045), size * (.4 + finger * .035));
        ctx.stroke();
      }
      ctx.restore();
    };
    drawHand(-1);
    drawHand(1);
  }

  private drawPlate(ctx: CanvasRenderingContext2D, size: number, progress: number) {
    ctx.save();
    ctx.shadowBlur = size * .16;
    ctx.shadowColor = 'rgba(255, 154, 48, .42)';
    const brass = ctx.createRadialGradient(0, -size * .03, size * .05, 0, 0, size * .58);
    brass.addColorStop(0, '#fff1a1');
    brass.addColorStop(.34, '#e9b83f');
    brass.addColorStop(.72, '#a86613');
    brass.addColorStop(1, '#f0c957');
    ctx.fillStyle = brass;
    ctx.beginPath();
    ctx.ellipse(0, 0, size * .61, size * .27, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#fff0a0';
    ctx.lineWidth = size * .025;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(112, 58, 11, .5)';
    ctx.lineWidth = size * .013;
    ctx.beginPath();
    ctx.ellipse(0, 0, size * .5, size * .2, 0, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = '#8e2c24';
    ctx.beginPath();
    ctx.ellipse(-size * .27, size * .015, size * .085, size * .04, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f5eee0';
    ctx.beginPath();
    ctx.ellipse(size * .28, size * .02, size * .09, size * .045, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#dc7d1e';
    for (const offset of [-.15, .13]) {
      ctx.beginPath();
      ctx.arc(size * offset, size * .03, size * .055, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = '#b66a16';
    ctx.beginPath();
    ctx.ellipse(0, -size * .02, size * .13, size * .07, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffe787';
    ctx.lineWidth = size * .012;
    ctx.stroke();
    ctx.fillStyle = '#4d2814';
    ctx.fillRect(-size * .008, -size * .14, size * .016, size * .09);
    this.drawFlame(ctx, size, progress);
    ctx.restore();
  }

  private drawFlame(ctx: CanvasRenderingContext2D, size: number, progress: number) {
    const flicker = Math.sin(progress * Math.PI * 28) * size * .012;
    ctx.save();
    ctx.translate(flicker, -size * .16);
    ctx.shadowBlur = size * .22;
    ctx.shadowColor = 'rgba(255, 146, 37, .82)';
    const outer = new Path2D();
    outer.moveTo(0, size * .075);
    outer.bezierCurveTo(-size * .075, size * .025, -size * .045, -size * .08, size * .012, -size * .16);
    outer.bezierCurveTo(size * .035, -size * .09, size * .09, size * .008, 0, size * .075);
    const flame = ctx.createLinearGradient(0, -size * .17, 0, size * .08);
    flame.addColorStop(0, '#fff4a3');
    flame.addColorStop(.48, '#ffad24');
    flame.addColorStop(1, '#d84218');
    ctx.fillStyle = flame;
    ctx.fill(outer);
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#fff9cf';
    ctx.beginPath();
    ctx.ellipse(0, size * .012, size * .018, size * .05, .12, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}
